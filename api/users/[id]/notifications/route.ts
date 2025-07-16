import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { ActionType, logAction } from "@/lib/logger";

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // 1. Récupérer les headers injectés par le middleware
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

        // 3. Déterminer l'ID de l'utilisateur cible
        const userId = params.id === 'me' ? parseInt(currentUserId) : parseInt(params.id);

        // 4. Vérifier que l'utilisateur existe
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

        // 5. Récupérer les paramètres de requête
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const readStatus = searchParams.get('read');
        const type = searchParams.get('type');
        const sort = searchParams.get('sort') || 'desc';

        // 6. Construire le filtre
        const where: any = {
            userId: userId
        };

        if (readStatus) {
            where.read = readStatus === 'true';
        }

        if (type) {
            where.type = type;
        }

        // 7. Récupérer les notifications avec pagination
        const [notifications, total] = await Promise.all([
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    type: true,
                    message: true,
                    read: true,
                    createdAt: true
                }
            }),
            prisma.notification.count({ where })
        ]);

        // 8. Retourner la réponse
        return NextResponse.json({
            data: notifications,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[USER_NOTIFICATIONS_ERROR]', error);
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
        // 1. Récupérer les headers injectés par le middleware
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
                { error: 'Vous ne pouvez marquer que vos propres notifications comme lues' },
                { status: 403 }
            );
        }

        // 3. Déterminer l'ID de l'utilisateur
        const userId = parseInt(currentUserId);

        // 4. Validation des données
        const body = await request.json();
        const { notificationId } = body;

        if (!notificationId) {
            return NextResponse.json(
                { error: 'Le champ notificationId est obligatoire' },
                { status: 400 }
            );
        }

        // 5. Vérifier que la notification appartient bien à l'utilisateur
        const notification = await prisma.notification.findFirst({
            where: {
                id: notificationId,
                userId: userId
            }
        });

        if (!notification) {
            return NextResponse.json(
                { error: 'Notification non trouvée ou ne vous appartenant pas' },
                { status: 404 }
            );
        }

        // 6. Marquer la notification comme lue
        const updatedNotification = await prisma.notification.update({
            where: { id: notificationId },
            data: { read: true },
            select: {
                id: true,
                read: true
            }
        });

        await logAction(ActionType.NOTIFICATION_UPDATED, userId, updatedNotification)

        return NextResponse.json(
            {
                success: true,
                message: 'Notification marquée comme lue',
                data: updatedNotification
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('[USER_NOTIFICATIONS_MARK_READ_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}