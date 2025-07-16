import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { logAction, ActionType } from "@/lib/logger";

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // 1. Récupération des headers
        const headers = new Headers(request.headers);
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;

        if (!currentUserId || !currentUserRole) {
            return NextResponse.json(
                { error: 'Headers utilisateur manquants' },
                { status: 401 }
            );
        }

        // 2. Vérification des permissions
        const isAdmin = currentUserRole === UserRole.ADMIN;
        const isSelfRequest = params.id === 'me' || params.id === currentUserId;

        if (!isSelfRequest && !isAdmin) {
            return NextResponse.json(
                { error: 'Accès non autorisé' },
                { status: 403 }
            );
        }

        // 3. Détermination de l'ID utilisateur
        const userId = params.id === 'me' ? parseInt(currentUserId) : parseInt(params.id);

        // 4. Vérification de l'existence de l'utilisateur
        const userExists = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true }
        });

        if (!userExists) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        // 5. Récupération des paramètres de requête
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');

        // 6. Récupération des adresses
        const [addresses, total] = await Promise.all([
            prisma.deliveryAddress.findMany({
                where: { userId },
                orderBy: { id: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    address: true,
                    city: true,
                    country: true,
                    phone: true
                }
            }),
            prisma.deliveryAddress.count({ where: { userId } })
        ]);

        return NextResponse.json({
            data: addresses,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[USER_ADDRESSES_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // 1. Récupération des headers
        const headers = new Headers(request.headers);
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;

        if (!currentUserId || !currentUserRole) {
            return NextResponse.json(
                { error: 'Headers utilisateur manquants' },
                { status: 401 }
            );
        }

        // 2. Vérification des permissions
        const isSelfRequest = params.id === 'me' || params.id === currentUserId;
        if (!isSelfRequest) {
            return NextResponse.json(
                { error: 'Vous ne pouvez ajouter des adresses que pour votre propre compte' },
                { status: 403 }
            );
        }

        // 3. Détermination de l'ID utilisateur
        const userId = parseInt(currentUserId);

        // 4. Validation des données
        const body = await request.json();
        const { address, city, country, phone } = body;

        if (!address || !city || !country) {
            return NextResponse.json(
                { error: 'Les champs adresse, ville et pays sont obligatoires' },
                { status: 400 }
            );
        }

        // 5. Création de l'adresse
        const newAddress = await prisma.deliveryAddress.create({
            data: {
                userId,
                address,
                city,
                country,
                phone: phone || null
            },
            select: {
                id: true,
                address: true,
                city: true,
                country: true,
                phone: true
            }
        });

        // Log de la modification
        await logAction(ActionType.ADDRESS_CREATE, parseInt(currentUserId), {
            targetUserId: userId,
            message: 'Création d\'une adresse',
            address: newAddress.address,
            city: newAddress.city,
            country: newAddress.country,
            phone: newAddress.phone
        });

        return NextResponse.json(
            { success: true, data: newAddress },
            { status: 201 }
        );

    } catch (error) {
        console.error('[USER_ADDRESSES_POST_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // 1. Authentification et vérification des permissions
        const headers = new Headers(request.headers);
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;

        if (!currentUserId || !currentUserRole) {
            return NextResponse.json(
                { error: 'Authentification requise' },
                { status: 401 }
            );
        }

        // 2. Détermination de l'ID utilisateur cible
        const targetUserId = params.id === 'me' ? parseInt(currentUserId) : parseInt(params.id);

        // 3. Vérification des permissions
        const isAdmin = currentUserRole === UserRole.ADMIN;
        const isSelfUpdate = targetUserId === parseInt(currentUserId);

        if (!isSelfUpdate && !isAdmin) {
            return NextResponse.json(
                { error: 'Vous ne pouvez modifier que vos propres adresses' },
                { status: 403 }
            );
        }

        // 4. Validation des données
        const body = await request.json();
        const { addressId, address, city, country, phone } = body;

        if (!addressId) {
            return NextResponse.json(
                { error: 'Le champ addressId est obligatoire' },
                { status: 400 }
            );
        }

        // 5. Vérification que l'adresse appartient bien à l'utilisateur
        const existingAddress = await prisma.deliveryAddress.findFirst({
            where: {
                id: addressId,
                userId: targetUserId
            }
        });

        if (!existingAddress) {
            return NextResponse.json(
                { error: 'Adresse non trouvée ou ne vous appartenant pas' },
                { status: 404 }
            );
        }

        // 6. Préparation des données de mise à jour
        const updateData: any = {};
        if (address) updateData.address = address;
        if (city) updateData.city = city;
        if (country) updateData.country = country;
        if (phone !== undefined) updateData.phone = phone;

        // 7. Mise à jour de l'adresse
        const updatedAddress = await prisma.deliveryAddress.update({
            where: { id: addressId },
            data: updateData,
            select: {
                id: true,
                address: true,
                city: true,
                country: true,
                phone: true
            }
        });

        // Log de la modification
        await logAction(ActionType.ADDRESS_UPDATED, parseInt(currentUserId), {
            userId: parseInt(currentUserId),
            addressId: updatedAddress.id,
            address: updatedAddress.address,
            city: updatedAddress.city,
            country: updatedAddress.country,
            phone: updatedAddress.phone
        });

        return NextResponse.json(
            { success: true, data: updatedAddress },
            { status: 200 }
        );

    } catch (error) {
        console.error('[USER_ADDRESS_UPDATE_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}