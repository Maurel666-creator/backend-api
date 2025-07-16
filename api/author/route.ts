import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { authorSchema } from "@/lib/validator";
import { ActionType, logAction } from "@/lib/logger";

export async function GET(request: NextRequest) {
    try {
        // 1. Récupération des paramètres de requête
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const search = searchParams.get('search');
        const sort = searchParams.get('sort') || 'lastName_asc';

        // 2. Construction du filtre et du tri
        const where: any = {};
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } }
            ];
        }

        const orderBy: any = {};
        const [sortField, sortDirection] = sort.split('_');
        orderBy[sortField] = sortDirection;

        // 3. Récupération des auteurs avec pagination
        const [authors, total] = await Promise.all([
            prisma.author.findMany({
                where,
                orderBy,
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    bio: true,
                    _count: {
                        select: { books: true }
                    }
                }
            }),
            prisma.author.count({ where })
        ]);

        // 4. Formatage de la réponse
        const formattedAuthors = authors.map(author => ({
            ...author,
            bookCount: author._count.books
        }));

        return NextResponse.json({
            data: formattedAuthors,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[AUTHORS_GET_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

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

        // Seuls les admins et managers peuvent créer des auteurs
        if (currentUserRole !== UserRole.ADMIN && currentUserRole !== UserRole.MANAGER) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes' },
                { status: 403 }
            );
        }

        // 2. Validation des données avec Zod
        const body = await request.json();
        const validation = authorSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Données invalides', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        const { firstName, lastName, bio } = validation.data;

        // 3. Vérification de l'unicité
        const existingAuthor = await prisma.author.findFirst({
            where: { firstName, lastName }
        });

        if (existingAuthor) {
            return NextResponse.json(
                { error: 'Un auteur avec ce nom existe déjà' },
                { status: 409 }
            );
        }

        // 4. Création de l'auteur
        const newAuthor = await prisma.author.create({
            data: { firstName, lastName, bio },
            select: { id: true, firstName: true, lastName: true, bio: true }
        });

        await logAction(ActionType.CREATE_AUTHOR, parseInt(currentUserId), {
            firstName: newAuthor.firstName,
            lastName: newAuthor.lastName,
            bio: newAuthor.bio
        });

        return NextResponse.json(
            { success: true, data: newAuthor },
            { status: 201 }
        );

    } catch (error) {
        console.error('[AUTHORS_POST_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}