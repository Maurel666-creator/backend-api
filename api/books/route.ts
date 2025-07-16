import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { BookStatus, UserRole } from "@/app/generated/prisma";
import { ActionType, logAction } from '@/lib/logger';
import { bookCreateSchema } from "@/lib/validator";


export async function GET(request: NextRequest) {
    try {
        // 1. Récupération des paramètres de requête
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';
        const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
        const page = Number(searchParams.get('page')) || 1;
        const skip = (page - 1) * limit;

        // 2. Récupération des filtres
        const libraryId = searchParams.get('libraryId');
        const categoryId = searchParams.get('categoryId');
        const authorId = searchParams.get('authorId');
        const status = searchParams.get('status') as BookStatus | null;
        const isSellable = searchParams.get('isSellable');
        const language = searchParams.get('language');
        const minPages = searchParams.get('minPages');
        const maxPages = searchParams.get('maxPages');

        // 3. Construction du filtre de recherche
        const where: any = {
            AND: [
                {
                    OR: [
                        { title: { contains: search, mode: 'insensitive' } },
                        { summary: { contains: search, mode: 'insensitive' } },
                        { isbn: { contains: search, mode: 'insensitive' } },
                        {
                            author: {
                                OR: [
                                    { firstName: { contains: search, mode: 'insensitive' } },
                                    { lastName: { contains: search, mode: 'insensitive' } }
                                ]
                            }
                        }
                    ]
                }
            ]
        };

        // 4. Ajout des filtres optionnels
        if (libraryId) {
            where.AND.push({ libraryId: parseInt(libraryId) });
        }
        if (categoryId) {
            where.AND.push({ categoryId: parseInt(categoryId) });
        }
        if (authorId) {
            where.AND.push({ authorId: parseInt(authorId) });
        }
        if (status) {
            where.AND.push({ status });
        }
        if (isSellable) {
            where.AND.push({ isSellable: isSellable === 'true' });
        }
        if (language) {
            where.AND.push({ language });
        }
        if (minPages) {
            where.AND.push({ pageCount: { gte: parseInt(minPages) } });
        }
        if (maxPages) {
            where.AND.push({ pageCount: { lte: parseInt(maxPages) } });
        }

        // 5. Requête paginée avec toutes les relations nécessaires
        const [books, totalCount] = await prisma.$transaction([
            prisma.book.findMany({
                where,
                select: {
                    id: true,
                    title: true,
                    summary: true,
                    coverUrl: true,
                    status: true,
                    isbn: true,
                    pages: true,
                    language: true,
                    isSellable: true,
                    price: true,
                    genre: true,
                    edition: true,
                    author: { select: { id: true, firstName: true, lastName: true } },
                    category: { select: { id: true, name: true, color: true } },
                    library: { select: { id: true, name: true, address: true } },
                    stock: { select: { quantity: true } },
                },
                orderBy: { title: 'asc' },
                skip,
                take: limit,
            }),
            prisma.book.count({ where })
        ]);

        // 6. Formatage de la réponse
        return NextResponse.json({
            data: books.map(book => ({
                ...book,
                author: {
                    id: book.author.id,
                    name: `${book.author.firstName} ${book.author.lastName}`
                },
                category: {
                    id: book.category.id,
                    name: book.category.name,
                    color: book.category.color
                },
                library: {
                    id: book.library.id,
                    name: book.library.name,
                    address: book.library.address
                },
                stock: book.stock?.quantity ?? 0
            })),
            pagination: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        console.error('[GET_BOOKS_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des livres' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        // 1. Vérification des permissions
        const headers = request.headers;
        const userId = headers.get('x-user-id');
        const userRole = headers.get('x-user-role') as UserRole;
        const userLibraryId = headers.get('x-user-library-id');

        if (!userId || !(userRole === UserRole.ADMIN || UserRole.MANAGER)) {
            return NextResponse.json(
                { error: 'Action réservée aux administrateurs et gestionnaires' },
                { status: 403 }
            );
        }

        // 2. Validation des données
        const body = await request.json();
        const validation = bookCreateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Données invalides', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        // 3. Vérification des contraintes
        // - Manager ne peut créer que dans sa bibliothèque
        if (userRole === UserRole.MANAGER &&
            validation.data.libraryId !== parseInt(userLibraryId || '0')) {
            return NextResponse.json(
                { error: 'Vous ne pouvez créer que dans votre bibliothèque' },
                { status: 403 }
            );
        }

        // - Vérification de l'existence des relations
        const [authorExists, categoryExists, libraryExists] = await Promise.all([
            prisma.author.findUnique({ where: { id: validation.data.authorId } }),
            prisma.category.findUnique({ where: { id: validation.data.categoryId } }),
            prisma.library.findUnique({ where: { id: validation.data.libraryId } })
        ]);

        if (!authorExists || !categoryExists || !libraryExists) {
            return NextResponse.json(
                {
                    error: 'Relation introuvable',
                    details: {
                        authorExists: !!authorExists,
                        categoryExists: !!categoryExists,
                        libraryExists: !!libraryExists
                    }
                },
                { status: 404 }
            );
        }

        // 4. Création du livre
        const newBook = await prisma.book.create({
            data: validation.data,
            select: {
                id: true,
                title: true,
                author: { select: { firstName: true, lastName: true } },
                category: { select: { name: true } },
                library: { select: { name: true } }
            }
        });

        // 5. Journalisation
        await logAction(ActionType.BOOK_CREATED, parseInt(userId), {
            bookId: newBook.id,
            title: newBook.title
        });

        return NextResponse.json(
            {
                success: true,
                message: 'Livre créé avec succès',
                book: {
                    ...newBook,
                    author: `${newBook.author.firstName} ${newBook.author.lastName}`,
                    category: newBook.category.name
                }
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('[CREATE_BOOK_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur lors de la création du livre' },
            { status: 500 }
        );
    }
}