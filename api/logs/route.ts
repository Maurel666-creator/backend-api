import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";

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

        // 2. Récupération des paramètres de requête
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const actionType = searchParams.get('actionType');
        const userId = searchParams.get('userId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const sort = searchParams.get('sort') || 'desc';

        // 3. Construction du filtre
        const where: any = {};

        if (actionType) {
            where.action = actionType;
        }

        if (userId) {
            where.userId = parseInt(userId);
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        // 4. Récupération des logs avec pagination
        const [logs, total] = await Promise.all([
            prisma.actionLog.findMany({
                where,
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            role: true
                        }
                    }
                }
            }),
            prisma.actionLog.count({ where })
        ]);

        // 5. Formatage de la réponse
        const formattedLogs = logs.map(log => ({
            id: log.id,
            action: log.action,
            details: log.details ? JSON.parse(log.details) : null,
            createdAt: log.createdAt,
            user: log.user
        }));

        return NextResponse.json({
            data: formattedLogs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[LOGS_GET_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}