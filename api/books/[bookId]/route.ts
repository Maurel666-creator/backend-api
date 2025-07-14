import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { ActionType, logAction } from '@/lib/logger';
import { bookUpdateSchema } from "@/lib/validator";

export async function GET(
    request: NextRequest,
    { params }: { params: { bookId: string } }
) {
    try {
        // 1. Validation de l'ID
        const bookId = parseInt(params.bookId);
        if (isNaN(bookId)) {
            return NextResponse.json(
                { error: "ID de livre invalide" },
                { status: 400 }
            );
        }

        // 2. Récupération des informations d'authentification
        const headers = request.headers;
        const userRole = headers.get('x-user-role') as UserRole;
        const userLibraryId = headers.get('x-user-library-id');

        // 3. Récupération du livre avec les relations
        const book = await prisma.book.findUnique({
            where: { id: bookId },
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
                library: { select: { id: true, name: true } },
                stock: { select: { quantity: true } },
            },
        });

        if (!book) {
            return NextResponse.json(
                { error: "Livre non trouvé" },
                { status: 404 }
            );
        }

        // 4. Vérification des permissions pour les livres non disponibles
        if (book.status !== "AVAILABLE" && userRole === UserRole.CLIENT) {
            const isFromSameLibrary = userLibraryId && book.library.id === parseInt(userLibraryId);
            if (!isFromSameLibrary) {
                return NextResponse.json(
                    { error: "Vous n'avez pas accès aux détails de ce livre" },
                    { status: 403 }
                );
            }
        }

        // 5. Formatage de la réponse
        const response = {
            ...book,
            author: `${book.author.firstName} ${book.author.lastName}`,
            authorId: book.author.id,
            category: book.category.name,
            categoryId: book.category.id,
            categoryColor: book.category.color,
            library: book.library.name,
            libraryId: book.library.id,
            stock: book.stock?.quantity ?? 0,
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error('[GET_BOOK_BY_ID_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur lors de la récupération du livre' },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { bookId: string } }
) {
    try {
        // 1. Vérification de l'ID
        const bookId = parseInt(params.bookId);
        if (isNaN(bookId)) {
            return NextResponse.json({ error: "ID de livre invalide" }, { status: 400 });
        }

        // 2. Authentification et autorisations
        const headers = request.headers;
        const userId = headers.get('x-user-id');
        const userRole = headers.get('x-user-role') as UserRole;
        const userLibraryId = headers.get('x-user-library-id');

        if (!userId || !userRole) {
            return NextResponse.json(
                { error: 'Authentification requise' },
                { status: 401 }
            );
        }

        // Seuls ADMIN et MANAGER peuvent modifier des livres
        if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
            return NextResponse.json(
                { error: 'Action réservée aux administrateurs et gestionnaires' },
                { status: 403 }
            );
        }

        // 3. Validation des données
        const body = await request.json();
        const validation = bookUpdateSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Données invalides', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        // 4. Vérification de l'existence du livre
        const existingBook = await prisma.book.findUnique({
            where: { id: bookId },
            include: { library: true }
        });

        if (!existingBook) {
            return NextResponse.json({ error: "Livre non trouvé" }, { status: 404 });
        }

        // 5. Vérification des permissions spécifiques
        const isAdmin = userRole === UserRole.ADMIN;
        const isManagerOfLibrary = userRole === UserRole.MANAGER &&
            existingBook.libraryId === parseInt(userLibraryId || '0');

        if (!isAdmin && !isManagerOfLibrary) {
            return NextResponse.json(
                { error: 'Vous ne pouvez modifier que les livres de votre bibliothèque' },
                { status: 403 }
            );
        }

        // 6. Contrôles supplémentaires pour les MANAGER
        if (userRole === UserRole.MANAGER) {
            // Un manager ne peut pas changer la bibliothèque d'un livre
            if (validation.data.libraryId && validation.data.libraryId !== existingBook.libraryId) {
                return NextResponse.json(
                    { error: 'Un gestionnaire ne peut pas changer la bibliothèque d\'un livre' },
                    { status: 403 }
                );
            }

            // Un manager ne peut pas modifier le statut en SOLD si le livre n'est pas marqué comme vendable
            if (validation.data.status === 'SOLD' && !existingBook.isSellable) {
                return NextResponse.json(
                    { error: 'Ce livre n\'est pas marqué comme vendable' },
                    { status: 403 }
                );
            }
        }

        // 7. Vérification des relations existantes
        if (validation.data.authorId) {
            const authorExists = await prisma.author.count({ where: { id: validation.data.authorId } });
            if (!authorExists) {
                return NextResponse.json({ error: "Auteur introuvable" }, { status: 404 });
            }
        }

        if (validation.data.categoryId) {
            const categoryExists = await prisma.category.count({ where: { id: validation.data.categoryId } });
            if (!categoryExists) {
                return NextResponse.json({ error: "Catégorie introuvable" }, { status: 404 });
            }
        }

        if (validation.data.libraryId && !isAdmin) {
            const libraryExists = await prisma.library.count({ where: { id: validation.data.libraryId } });
            if (!libraryExists) {
                return NextResponse.json({ error: "Bibliothèque introuvable" }, { status: 404 });
            }
        }

        // 8. Mise à jour du livre
        const updatedBook = await prisma.book.update({
            where: { id: bookId },
            data: validation.data,
            select: {
                id: true,
                title: true,
                status: true,
                isbn: true,
                author: { select: { firstName: true, lastName: true } },
                category: { select: { name: true, color: true } },
                library: { select: { name: true } }
            }
        });

        // 9. Journalisation
        await logAction(ActionType.BOOK_UPDATED, parseInt(userId), {
            bookId: updatedBook.id,
            title: updatedBook.title,
            changes: Object.keys(validation.data)
        });

        return NextResponse.json({
            success: true,
            message: 'Livre mis à jour avec succès',
            book: {
                ...updatedBook,
                author: `${updatedBook.author.firstName} ${updatedBook.author.lastName}`,
                category: updatedBook.category.name,
                categoryColor: updatedBook.category.color,
                library: updatedBook.library.name
            }
        });

    } catch (error) {
        console.error('[UPDATE_BOOK_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur lors de la mise à jour du livre' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { bookId: string } }
) {
    try {
        const bookId = parseInt(params.bookId);
        if (isNaN(bookId)) {
            return NextResponse.json({ error: "ID de livre invalide" }, { status: 400 });
        }

        // 1. Vérification des permissions
        const headers = request.headers;
        const userId = headers.get('x-user-id');
        const userRole = headers.get('x-user-role') as UserRole;
        const userLibraryId = headers.get('x-user-library-id');

        if (!userId || !(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER)) {
            return NextResponse.json(
                { error: 'Action réservée aux administrateurs et gestionnaires' },
                { status: 403 }
            );
        }

        // 2. Vérification de l'existence du livre et des contraintes
        const existingBook = await prisma.book.findUnique({ where: { id: bookId } });
        if (!existingBook) {
            return NextResponse.json({ error: "Livre non trouvé" }, { status: 404 });
        }

        // Manager ne peut supprimer que les livres de sa bibliothèque
        if (userRole === UserRole.MANAGER && existingBook.libraryId !== parseInt(userLibraryId || '0')) {
            return NextResponse.json(
                { error: 'Vous ne pouvez supprimer que les livres de votre bibliothèque' },
                { status: 403 }
            );
        }

        // 3. Suppression du livre
        await prisma.book.delete({ where: { id: bookId } });

        //il faudra s'occuper de la suppression de l'image de couverture au niveau du frontend

        // 4. Journalisation
        await logAction(ActionType.BOOK_DELETED, parseInt(userId), {
            bookId: existingBook.id,
            title: existingBook.title
        });

        return NextResponse.json({ success: true, message: 'Livre supprimé avec succès' });

    } catch (error) {
        console.error('[DELETE_BOOK_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur lors de la suppression du livre' },
            { status: 500 }
        );
    }
}
