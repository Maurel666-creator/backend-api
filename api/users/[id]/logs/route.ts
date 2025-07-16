import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";

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
        const actionType = searchParams.get('actionType');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        // 6. Construire le filtre
        const where: any = {
            userId: userId
        };

        if (actionType) {
            where.action = actionType;
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        // 7. Récupérer les logs avec pagination
        const [logs, total] = await Promise.all([
            prisma.actionLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    action: true,
                    details: true,
                    createdAt: true
                }
            }),
            prisma.actionLog.count({ where })
        ]);

        // 8. Retourner la réponse
        return NextResponse.json({
            data: logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[USER_LOGS_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}