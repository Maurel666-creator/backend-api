import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';

export async function GET(
    request: NextRequest,
    { params }: { params: { libraryId: string } }
) {
    try {
        // 1. Validation de l'ID
        const libraryId = parseInt(params.libraryId);
        if (isNaN(libraryId)) {
            return NextResponse.json(
                { error: 'ID de bibliothèque invalide' },
                { status: 400 }
            );
        }

        // 2. Récupération des paramètres de pagination
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';
        const limit = Math.min(Number(searchParams.get('limit')) || 20, 100); // Limite à 100 max
        const page = Number(searchParams.get('page')) || 1;
        const skip = (page - 1) * limit;

        // 3. Vérification que la bibliothèque existe
        const libraryExists = await prisma.library.findUnique({
            where: { id: libraryId },
            select: { id: true }
        });

        if (!libraryExists) {
            return NextResponse.json(
                { error: 'Bibliothèque non trouvée' },
                { status: 404 }
            );
        }

        // 4. Requête paginée avec filtres
        const [books, totalCount] = await prisma.$transaction([
            prisma.book.findMany({
                where: {
                    libraryId,
                    AND: [
                        {
                            OR: [
                                { title: { contains: search, mode: 'insensitive' } },
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
                },
                select: {
                    id: true,
                    title: true,
                    coverUrl: true,
                    summary: true,
                    status: true,
                    author: {
                        select: {
                            firstName: true,
                            lastName: true
                        }
                    },
                    category: {
                        select: {
                            name: true,
                            color: true
                        }
                    }
                },
                orderBy: { title: 'asc' },
                skip,
                take: limit,
            }),
            prisma.book.count({
                where: {
                    libraryId,
                    OR: [
                        { title: { contains: search, mode: 'insensitive' } },
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
            })
        ]);

        // 5. Formatage de la réponse
        return NextResponse.json({
            data: books.map(book => ({
                ...book,
                author: `${book.author.firstName} ${book.author.lastName}`,
                category: book.category.name,
                categoryColor: book.category.color
            })),
            pagination: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        console.error('[GET_LIBRARY_BOOKS_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération des livres' },
            { status: 500 }
        );
    }
}