import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { logAction, ActionType } from "@/lib/logger";

export async function POST(request: NextRequest) {
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

        // Seuls les admins et managers peuvent envoyer des notifications globales
        if (!["ADMIN", "MANAGER"].includes(currentUserRole)) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes' },
                { status: 403 }
            );
        }

        // 2. Validation des données
        const body = await request.json();
        const { type, message, userIds } = body;

        if (!type || !message) {
            return NextResponse.json(
                { error: 'Les champs type et message sont obligatoires' },
                { status: 400 }
            );
        }

        // 3. Création des notifications
        let createdNotifications;

        if (userIds && Array.isArray(userIds)) {
            // Notification pour des utilisateurs spécifiques
            createdNotifications = await prisma.notification.createMany({
                data: userIds.map(userId => ({
                    userId,
                    type,
                    message,
                    read: false
                }))
            });
        } else {
            // Notification pour tous les utilisateurs
            const allUsers = await prisma.user.findMany({
                select: { id: true }
            });

            createdNotifications = await prisma.notification.createMany({
                data: allUsers.map(user => ({
                    userId: user.id,
                    type,
                    message,
                    read: false
                }))
            });
        }

        // Log de la notification envoyée
        await logAction(ActionType.NOTIFICATION_SEND, parseInt(currentUserId), {
            for: userIds > 0 ? userIds.join(',') : 'Tous les utilisateurs',
            message: message || 'Une notification a été envoyée',
            type: type || 'notification'
        });

        return NextResponse.json(
            { success: true, count: createdNotifications.count },
            { status: 201 }
        );

    } catch (error) {
        console.error('[NOTIFICATIONS_POST_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        // 1. Authentification et vérification des permissions (admin seulement)
        const headers = new Headers(request.headers);
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;

        if (!currentUserId || currentUserRole !== UserRole.ADMIN) {
            return NextResponse.json(
                { error: 'Accès réservé aux administrateurs' },
                { status: 403 }
            );
        }

        // 2. Récupération des paramètres
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const type = searchParams.get('type');
        const readStatus = searchParams.get('read');

        // 3. Construction du filtre
        const where: any = {};
        if (type) where.type = type;
        if (readStatus) where.read = readStatus === 'true';

        // 4. Récupération des notifications avec pagination
        const [notifications, total] = await Promise.all([
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true
                        }
                    }
                }
            }),
            prisma.notification.count({ where })
        ]);

        // 5. Formatage de la réponse
        const formattedNotifications = notifications.map(notif => ({
            id: notif.id,
            type: notif.type,
            message: notif.message,
            read: notif.read,
            createdAt: notif.createdAt,
            user: notif.user
        }));

        return NextResponse.json({
            data: formattedNotifications,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[NOTIFICATIONS_GET_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}