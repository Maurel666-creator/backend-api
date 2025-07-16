import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";


interface PaginatedUsers {
    users: {
        id: number;
        email: string;
        firstName: string;
        lastName: string;
        role: 'ADMIN' | 'MANAGER' | 'CLIENT' | 'DELIVERY';
        library?: {
            id: number;
            name: string;
        };
        lastConnected?: string;
    }[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
}


export async function GET(req: NextRequest) {
    try {
        // Récupération du rôle et de la bibliothèque depuis les headers du middleware
        const userRole = req.headers.get('x-user-role') as UserRole;
        const libraryIdHeader = req.headers.get('x-user-library-id');

        // Typage strict des paramètres de requête
        const { searchParams } = new URL(req.url);
        const page = Number(searchParams.get('page')) || 1;
        const perPage = Number(searchParams.get('perPage')) || 10;
        const search = searchParams.get('search') ?? '';
        const roleFilter = searchParams.get('role') as UserRole | null;

        // Définition du type pour le filtre Prisma
        type UserWhereInput = {
            AND?: Array<{
                OR?: Array<{
                    firstName?: { contains: string; mode: 'insensitive' };
                    lastName?: { contains: string; mode: 'insensitive' };
                    email?: { contains: string; mode: 'insensitive' };
                }>;
                role?: UserRole;
                libraryId?: number;
            }>;
        };

        // Construction du filtre avec typage explicite
        const where: UserWhereInput = {};

        // Filtre de recherche
        if (search) {
            where.AND = [
                ...(where.AND ?? []),
                {
                    OR: [
                        { firstName: { contains: search, mode: 'insensitive' } },
                        { lastName: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                    ],
                },
            ];
        }

        // Filtre par rôle de l'utilisateur connecté
        if (userRole === 'MANAGER' && libraryIdHeader) {
            where.AND = [
                ...(where.AND ?? []),
                { libraryId: Number(libraryIdHeader) },
            ];
        }

        // Filtre supplémentaire par rôle si spécifié
        if (roleFilter) {
            where.AND = [
                ...(where.AND ?? []),
                { role: roleFilter },
            ];
        }

        // Requête pour le total (avec le même filtre)
        const total = await prisma.user.count({ where });

        // Requête pour les utilisateurs paginés
        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                lastConnected: true,
                library: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            skip: (page - 1) * perPage,
            take: perPage,
            orderBy: {
                lastName: 'asc',
            },
        });

        // Formatage de la réponse
        const response: PaginatedUsers = {
            users: users.map(user => ({
                ...user,
                lastConnected: user.lastConnected?.toISOString(),
                library: user.library ?? undefined,
            })),
            total,
            page,
            perPage,
            totalPages: Math.ceil(total / perPage),
        };

        return NextResponse.json(response, { status: 200 });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}