import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { ActionType, logAction } from '@/lib/logger';
import { z } from 'zod';

// Schéma de validation avec Zod
const libraryCreateSchema = z.object({
    name: z.string().min(3, "Le nom doit contenir au moins 3 caractères"),
    address: z.string().min(10, "L'adresse doit contenir au moins 10 caractères").optional(),
    contact: z.string().min(6, "Le contact doit contenir au moins 6 caractères").optional()
});

export async function POST(request: NextRequest) {
    try {
        // 1. Vérification de l'authentification et des permissions
        const headers = new Headers(request.headers);
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;

        if (!currentUserId || currentUserRole !== UserRole.ADMIN) {
            return NextResponse.json(
                { error: 'Permission refusée - Seul un ADMIN peut créer une bibliothèque' },
                { status: 403 }
            );
        }

        // 2. Validation des données
        const body = await request.json();
        const validation = libraryCreateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                {
                    error: 'Données invalides',
                    details: validation.error.flatten()
                },
                { status: 400 }
            );
        }

        // 3. Vérification de l'unicité du nom
        const existingLibrary = await prisma.library.findFirst({
            where: { name: validation.data.name },
            select: { id: true }
        });

        if (existingLibrary) {
            return NextResponse.json(
                { error: 'Une bibliothèque avec ce nom existe déjà' },
                { status: 409 }
            );
        }

        // 4. Création de la bibliothèque avec transaction
        const result = await prisma.$transaction(async (prisma) => {
            // Création de la bibliothèque
            const newLibrary = await prisma.library.create({
                data: {
                    name: validation.data.name,
                    address: validation.data.address,
                    contact: validation.data.contact
                }
            });

            return newLibrary;
        });

        // 5. Log de l'action
        await logAction(ActionType.LIBRARY_CREATE, parseInt(currentUserId), {
            libraryId: result.id,
            libraryName: result.name
        });

        return NextResponse.json(
            {
                success: true,
                message: 'Bibliothèque créée avec succès',
                library: result
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('[LIBRARY_CREATE_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        // 1. Récupération des paramètres de requête (optionnels)
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';
        const limit = Number(searchParams.get('limit')) || 20;
        const page = Number(searchParams.get('page')) || 1;

        // 3. Requête paginée
        const [libraries, totalCount] = await prisma.$transaction([
            prisma.library.findMany({
                where: {
                    name: { contains: search, mode: 'insensitive' }
                },
                select: {
                    id: true,
                    name: true,
                    address: true,
                    contact: true,
                    createdAt: true,
                    _count: { select: { books: true } } // Optionnel: nombre de livres
                },
                orderBy: { name: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.library.count({
                where: {
                    name: { contains: search, mode: 'insensitive' }
                }
            })
        ])

        // 4. Formatage de la réponse
        return NextResponse.json({
            data: libraries,
            pagination: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        console.error('[GET_LIBRARIES_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des bibliothèques' },
            { status: 500 }
        );
    }
}