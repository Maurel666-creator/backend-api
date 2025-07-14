import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { userUpdateSchema } from "@/lib/validator";
import bcrypt from 'bcrypt';
import { ActionType, logAction } from '@/lib/logger';

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // 1. Récupérer les headers injectés par le middleware
        const headers = new Headers(request.headers);
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;

        if (!currentUserId || !currentUserRole) {
            return NextResponse.json(
                { error: 'Headers utilisateur manquants' },
                { status: 401 }
            );
        }

        // 2. Vérification des permissions
        const isAdmin = currentUserRole === UserRole.ADMIN;
        const isSelfUpdate = params.id === 'me' || params.id === currentUserId;

        if (!isSelfUpdate && !isAdmin) {
            return NextResponse.json(
                { error: 'Accès non autorisé' },
                { status: 403 }
            );
        }

        // 3. Validation des données
        const body = await request.json();
        const validation = userUpdateSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Données invalides', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        // 4. Vérification de l'existence de l'utilisateur
        const userId = params.id === 'me' ? parseInt(currentUserId) : parseInt(params.id);
        const existingUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, role: true }
        });

        if (!existingUser) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        // 5. Vérification de l'unicité de l'email si modifié
        const { data } = validation;
        if (data.email && data.email !== existingUser.email) {
            const emailExists = await prisma.user.findUnique({
                where: { email: data.email },
                select: { id: true }
            });

            if (emailExists) {
                return NextResponse.json(
                    { error: 'Cet email est déjà utilisé' },
                    { status: 409 }
                );
            }
        }

        // 6. Vérification du libraryId si fourni
        if (data.libraryId) {
            const libraryExists = await prisma.library.findUnique({
                where: { id: data.libraryId },
                select: { id: true }
            });

            if (!libraryExists) {
                return NextResponse.json(
                    { error: 'Bibliothèque non trouvée' },
                    { status: 404 }
                );
            }
        }

        // 7. Préparation des données de mise à jour
        const updateData: any = {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone
        };

        // Seul un ADMIN peut modifier ces champs
        if (isAdmin) {
            if (data.role) updateData.role = data.role;
            if (data.libraryId) updateData.libraryId = data.libraryId;

            // Log des modifications sensibles
            if (data.role) {
                await logAction(ActionType.USER_ROLE_CHANGE, parseInt(currentUserId), {
                    targetUserId: userId,
                    oldRole: existingUser.role,
                    newRole: data.role
                });
            }
        }

        // 8. Hash du mot de passe si fourni
        if (data.password) {
            updateData.password = await bcrypt.hash(data.password, 10);
            await logAction(ActionType.USER_PASSWORD_CHANGE, parseInt(currentUserId), {
                targetUserId: userId
            });
        }

        // 9. Exécution de la mise à jour
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                libraryId: true,
                phone: true
            }
        });

        // Log de la modification
        await logAction(ActionType.USER_UPDATE, parseInt(currentUserId), {
            targetUserId: userId,
            updatedFields: Object.keys(data)
        });

        return NextResponse.json(updatedUser);

    } catch (error) {
        console.error('[USER_UPDATE_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // 1. Récupérer les headers injectés par le middleware
        const headers = new Headers(request.headers);
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;

        if (!currentUserId || !currentUserRole) {
            return NextResponse.json(
                { error: 'Headers utilisateur manquants' },
                { status: 401 }
            );
        }

        // 2. Vérification des permissions (seul un ADMIN peut supprimer un utilisateur)
        if (currentUserRole !== UserRole.ADMIN) {
            return NextResponse.json(
                { error: 'Permission refusée - Seul un ADMIN peut supprimer un utilisateur' },
                { status: 403 }
            );
        }

        // 3. Empêcher l'auto-suppression
        const userIdToDelete = params.id === 'me' ? parseInt(currentUserId) : parseInt(params.id);

        if (userIdToDelete === parseInt(currentUserId)) {
            return NextResponse.json(
                { error: 'Auto-suppression non autorisée' },
                { status: 403 }
            );
        }

        // 4. Vérifier l'existence de l'utilisateur à supprimer
        const userToDelete = await prisma.user.findUnique({
            where: { id: userIdToDelete },
            select: {
                id: true,
                email: true,
                role: true,
                libraryId: true,
                loans: { where: { returnedAt: null }, select: { id: true } },
                reservations: { where: { status: 'PENDING' }, select: { id: true } },
                sales: { where: { status: 'PENDING' }, select: { id: true } }
            }
        });

        if (!userToDelete) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        // 5. Vérifier les dépendances avant suppression
        const hasActiveDependencies =
            userToDelete.loans.length > 0 ||
            userToDelete.reservations.length > 0 ||
            userToDelete.sales.length > 0;

        if (hasActiveDependencies) {
            return NextResponse.json(
                {
                    error: 'Impossible de supprimer cet utilisateur',
                    details: {
                        hasActiveLoans: userToDelete.loans.length > 0,
                        hasPendingReservations: userToDelete.reservations.length > 0,
                        hasPendingSales: userToDelete.sales.length > 0
                    }
                },
                { status: 400 }
            );
        }

        // 6. Sauvegarder les données avant suppression pour le log
        const userSnapshot = {
            id: userToDelete.id,
            email: userToDelete.email,
            role: userToDelete.role,
            libraryId: userToDelete.libraryId
        };

        // 7. Exécuter la suppression
        await prisma.user.delete({
            where: { id: userIdToDelete }
        });

        // 8. Logger l'action
        await logAction(ActionType.USER_DELETE, parseInt(currentUserId), {
            deletedUser: userSnapshot,
            deletedAt: new Date().toISOString()
        });

        return NextResponse.json(
            { success: true, message: 'Utilisateur supprimé avec succès' },
            { status: 200 }
        );

    } catch (error) {
        console.error('[USER_DELETE_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}