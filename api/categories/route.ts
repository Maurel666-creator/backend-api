import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { categorySchema } from "@/lib/validator";
import { ActionType, logAction } from "@/lib/logger";

export async function GET(request: NextRequest) {
    try {
        // 1. Récupération des paramètres de requête
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const search = searchParams.get('search');
        const sort = searchParams.get('sort') || 'name_asc';

        // 2. Construction du filtre et du tri
        const where: any = {};
        if (search) {
            where.name = { contains: search, mode: 'insensitive' };
        }

        const orderBy: any = {};
        const [sortField, sortDirection] = sort.split('_');
        orderBy[sortField] = sortDirection;

        // 3. Récupération des catégories avec pagination
        const [categories, total] = await Promise.all([
            prisma.category.findMany({
                where,
                orderBy,
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    name: true,
                    color: true,
                    _count: {
                        select: { books: true }
                    }
                }
            }),
            prisma.category.count({ where })
        ]);

        // 4. Formatage de la réponse
        const formattedCategories = categories.map(category => ({
            id: category.id,
            name: category.name,
            color: category.color,
            bookCount: category._count.books
        }));

        return NextResponse.json({
            data: formattedCategories,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[CATEGORIES_GET_ERROR]', error);
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

        if (currentUserRole !== UserRole.ADMIN && currentUserRole !== UserRole.MANAGER) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes' },
                { status: 403 }
            );
        }

        // 2. Validation des données avec Zod
        const body = await request.json();
        const validation = categorySchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Données invalides', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        const { name, color } = validation.data;

        // 3. Vérification de l'unicité
        const existingCategory = await prisma.category.findFirst({
            where: { name }
        });

        if (existingCategory) {
            return NextResponse.json(
                { error: 'Une catégorie avec ce nom existe déjà' },
                { status: 409 }
            );
        }

        // 4. Création de la catégorie
        const newCategory = await prisma.category.create({
            data: { name, color },
            select: { id: true, name: true, color: true }
        });

        await logAction(ActionType.CREATE_CATEGORY, parseInt(currentUserId), { category: newCategory })

        return NextResponse.json(
            { success: true, data: newCategory },
            { status: 201 }
        );

    } catch (error) {
        console.error('[CATEGORIES_POST_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}