import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { ActionType, logAction } from '@/lib/logger';
import { libraryUpdateSchema } from "@/lib/validator";

export async function GET(
    { params }: { params: { libraryId: string } }
) {
    try {
        // 1. Convertir l'ID
        const libraryId = parseInt(params.libraryId);
        if (isNaN(libraryId)) {
            return NextResponse.json(
                { error: 'ID de bibliothèque invalide' },
                { status: 400 }
            );
        }

        // 2. Récupérer la bibliothèque avec des statistiques
        const library = await prisma.library.findUnique({
            where: { id: libraryId },
            select: {
                id: true,
                name: true,
                address: true,
                contact: true,
                createdAt: true,
                _count: {
                    select: {
                        books: true,
                        users: true
                    }
                }
            }
        });

        if (!library) {
            return NextResponse.json(
                { error: 'Bibliothèque non trouvée' },
                { status: 404 }
            );
        }

        return NextResponse.json(library);

    } catch (error) {
        console.error('[GET_LIBRARY_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { libraryId: string } }
) {
    try {
        // Récupération des infos utilisateur depuis les headers middleware
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

        const libraryId = parseInt(params.libraryId);
        if (isNaN(libraryId)) {
            return NextResponse.json(
                { error: 'ID de bibliothèque invalide' },
                { status: 400 }
            );
        }

        // Vérification des permissions
        const isAdmin = userRole === UserRole.ADMIN;
        const isManagerOfLibrary = userRole === UserRole.MANAGER &&
            userLibraryId === libraryId.toString();

        if (!isAdmin && !isManagerOfLibrary) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes' },
                { status: 403 }
            );
        }

        // 2. Validation des données
        const body = await request.json();
        const validation = libraryUpdateSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Données invalides', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        // 3. Mise à jour
        const updatedLibrary = await prisma.library.update({
            where: { id: libraryId },
            data: validation.data,
            select: {
                id: true,
                name: true,
                address: true,
                contact: true
            }
        });

        // 4. Journalisation
        await logAction(
            ActionType.LIBRARY_UPDATE,
            parseInt(userId),
            { libraryId, updates: Object.keys(validation.data) }
        );

        return NextResponse.json(updatedLibrary);

    } catch (error) {
        console.error('[UPDATE_LIBRARY_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { libraryId: string } }
) {
    try {
        // Vérification ADMIN via headers middleware
        const headers = request.headers;
        const userId = headers.get('x-user-id');
        const userRole = headers.get('x-user-role') as UserRole;

        if (!userId || userRole !== UserRole.ADMIN) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes' },
                { status: 403 }
            );
        }

        const libraryId = parseInt(params.libraryId);
        if (isNaN(libraryId)) {
            return NextResponse.json(
                { error: 'ID de bibliothèque invalide' },
                { status: 400 }
            );
        }

        // Vérification des dépendances en une seule requête
        const hasDependencies = await prisma.library.findFirst({
            where: {
                id: libraryId,
                OR: [
                    { books: { some: {} } },
                    { users: { some: {} } }
                ]
            },
            select: { id: true }
        });

        if (hasDependencies) {
            return NextResponse.json(
                { error: 'La bibliothèque contient des livres ou utilisateurs' },
                { status: 400 }
            );
        }

        await prisma.library.delete({ where: { id: libraryId } });

        await logAction(
            ActionType.LIBRARY_DELETE,
            parseInt(userId),
            { libraryId }
        );

        return NextResponse.json(
            { success: true, message: 'Bibliothèque supprimée' }
        );

    } catch (error) {
        console.error('[DELETE_LIBRARY_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}