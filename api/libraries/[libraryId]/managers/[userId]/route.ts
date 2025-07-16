import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { ActionType, logAction } from '@/lib/logger';

export async function GET(
    request: NextRequest,
    { params }: { params: { libraryId: string; userId: string } }
) {
    try {
        // 1. Authentification via headers middleware
        const headers = request.headers;
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;
        const currentUserLibraryId = headers.get('x-user-library-id');

        if (!currentUserId || !currentUserRole) {
            return NextResponse.json(
                { error: 'Authentification requise' },
                { status: 401 }
            );
        }

        // 2. Validation des IDs
        const libraryId = parseInt(params.libraryId);
        const userId = parseInt(params.userId);
        if (isNaN(libraryId) || isNaN(userId)) {
            return NextResponse.json(
                { error: 'ID invalide' },
                { status: 400 }
            );
        }

        // 3. Vérification des permissions
        const isAdmin = currentUserRole === UserRole.ADMIN;
        const isManagerOfLibrary = currentUserRole === UserRole.MANAGER &&
            currentUserLibraryId === libraryId.toString();

        if (!isAdmin && !isManagerOfLibrary) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes' },
                { status: 403 }
            );
        }

        // 4. Récupération du manager
        const manager = await prisma.user.findUnique({
            where: {
                id: userId,
                role: UserRole.MANAGER,
                libraryId
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                lastConnected: true,
                createdAt: true
            }
        });

        if (!manager) {
            return NextResponse.json(
                { error: 'Manager non trouvé dans cette bibliothèque' },
                { status: 404 }
            );
        }

        return NextResponse.json(manager);

    } catch (error) {
        console.error('[GET_MANAGER_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { libraryId: string; userId: string } }
) {
    try {
        // 1. Authentification ADMIN uniquement
        const headers = request.headers;
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;

        if (!currentUserId || currentUserRole !== UserRole.ADMIN) {
            return NextResponse.json(
                { error: 'Action réservée aux administrateurs' },
                { status: 403 }
            );
        }

        // 2. Validation des IDs
        const libraryId = parseInt(params.libraryId);
        const userId = parseInt(params.userId);
        if (isNaN(libraryId) || isNaN(userId)) {
            return NextResponse.json(
                { error: 'ID invalide' },
                { status: 400 }
            );
        }

        // 3. Vérification que l'utilisateur est bien manager de cette bibliothèque
        const manager = await prisma.user.findUnique({
            where: {
                id: userId,
                role: UserRole.MANAGER,
                libraryId
            },
            select: { id: true }
        });

        if (!manager) {
            return NextResponse.json(
                { error: 'Manager non trouvé dans cette bibliothèque' },
                { status: 404 }
            );
        }

        // 4. Dissociation du manager (sans supprimer l'utilisateur)
        await prisma.user.update({
            where: { id: userId },
            data: { libraryId: null }
        });

        // 5. Journalisation
        await logAction(
            ActionType.MANAGER_REMOVED,
            parseInt(currentUserId),
            {
                managerId: userId,
                libraryId,
                action: 'dissociation'
            }
        );

        return NextResponse.json(
            { success: true, message: 'Manager dissocié de la bibliothèque' }
        );

    } catch (error) {
        console.error('[REMOVE_MANAGER_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}