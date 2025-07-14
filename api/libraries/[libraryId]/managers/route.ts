import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { ActionType, logAction } from '@/lib/logger';
import { assignManagerSchema } from "@/lib/validator";


export async function POST(
    request: NextRequest,
    { params }: { params: { libraryId: string } }
) {
    try {
        // 1. Authentification et autorisation
        const headers = new Headers(request.headers);
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;

        if (!currentUserId || currentUserRole !== UserRole.ADMIN) {
            return NextResponse.json(
                { error: 'Action réservée aux administrateurs' },
                { status: 403 }
            );
        }

        // 2. Validation des données
        const body = await request.json();
        const validation = assignManagerSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Données invalides', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        const libraryId = parseInt(params.libraryId);
        const { userId } = validation.data;

        // 3. Vérifications
        // - La bibliothèque existe
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

        // - L'utilisateur existe et est bien un MANAGER
        const user = await prisma.user.findUnique({
            where: {
                id: userId,
                role: UserRole.MANAGER
            },
            select: {
                id: true,
                libraryId: true
            }
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé ou n\'est pas un manager' },
                { status: 404 }
            );
        }

        // - L'utilisateur n'est pas déjà associé à une autre bibliothèque
        if (user.libraryId && user.libraryId !== libraryId) {
            return NextResponse.json(
                { error: 'Ce manager est déjà associé à une autre bibliothèque' },
                { status: 409 }
            );
        }

        // 4. Mise à jour de l'utilisateur
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { libraryId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                libraryId: true
            }
        });

        // 5. Log de l'action
        await logAction(ActionType.MANAGER_ASSIGNED, parseInt(currentUserId), {
            managerId: userId,
            libraryId,
            previousLibraryId: user.libraryId
        });

        return NextResponse.json(
            {
                success: true,
                message: 'Manager associé avec succès',
                user: updatedUser
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('[MANAGER_ASSIGN_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: { libraryId: string } }
) {
    try {
        // Vérification des permissions
        const headers = new Headers(request.headers);
        const currentUserRole = headers.get('x-user-role') as UserRole;
        const currentUserLibraryId = headers.get('x-user-library-id');

        const libraryId = parseInt(params.libraryId);

        // Seul un ADMIN ou un MANAGER de cette bibliothèque peut voir la liste
        if (currentUserRole !== UserRole.ADMIN &&
            (currentUserRole !== UserRole.MANAGER || currentUserLibraryId !== libraryId.toString())) {
            return NextResponse.json(
                { error: 'Permission refusée' },
                { status: 403 }
            );
        }

        const managers = await prisma.user.findMany({
            where: {
                libraryId,
                role: UserRole.MANAGER
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                lastConnected: true
            }
        });

        return NextResponse.json(managers);

    } catch (error) {
        console.error('[GET_MANAGERS_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}