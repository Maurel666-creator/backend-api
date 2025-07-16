import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { authorSchema } from "@/lib/validator";
import { ActionType, logAction } from "@/lib/logger";

export async function PATCH(
    request: NextRequest,
    { params }: { params: { authorId: string } }
) {
    try {
        // 1. Authentification et permissions
        const headers = new Headers(request.headers);
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;

        if (!currentUserId || !currentUserRole) {
            return NextResponse.json(
                { error: 'Authentification requise' },
                { status: 401 }
            );
        }

        if (!(UserRole.ADMIN == currentUserRole) && !(UserRole.MANAGER === currentUserRole)) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes' },
                { status: 403 }
            );
        }

        // 2. Vérification de l'auteur
        const authorId = parseInt(params.authorId);
        const existingAuthor = await prisma.author.findUnique({
            where: { id: authorId }
        });

        if (!existingAuthor) {
            return NextResponse.json(
                { error: 'Auteur non trouvé' },
                { status: 404 }
            );
        }

        // 3. Validation avec Zod
        const body = await request.json();
        const validation = authorSchema.partial().safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Données invalides', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        const { firstName, lastName, bio } = validation.data;

        // 4. Vérification unicité si modification du nom
        if (firstName || lastName) {
            const checkName = {
                firstName: firstName || existingAuthor.firstName,
                lastName: lastName || existingAuthor.lastName
            };

            const authorWithSameName = await prisma.author.findFirst({
                where: {
                    AND: [
                        { firstName: checkName.firstName },
                        { lastName: checkName.lastName }
                    ],
                    NOT: { id: authorId }
                }
            });

            if (authorWithSameName) {
                return NextResponse.json(
                    { error: 'Un auteur avec ce nom existe déjà' },
                    { status: 409 }
                );
            }
        }

        // 5. Mise à jour
        const updatedAuthor = await prisma.author.update({
            where: { id: authorId },
            data: {
                firstName: firstName || existingAuthor.firstName,
                lastName: lastName || existingAuthor.lastName,
                bio: bio !== undefined ? bio : existingAuthor.bio
            },
            select: { id: true, firstName: true, lastName: true, bio: true }
        });

        await logAction(ActionType.AUTHOR_UPDATE, parseInt(currentUserId), { authorId: updatedAuthor.id });

        return NextResponse.json(
            { success: true, data: updatedAuthor },
            { status: 200 }
        );

    } catch (error) {
        console.error('[AUTHOR_UPDATE_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { authorId: string } }
) {
    try {
        // 1. Authentification et permissions
        const headers = new Headers(request.headers);
        const currentUserId = headers.get('x-user-id');
        const currentUserRole = headers.get('x-user-role') as UserRole;

        if (!currentUserId || !currentUserRole) {
            return NextResponse.json(
                { error: 'Authentification requise' },
                { status: 401 }
            );
        }

        if (currentUserRole !== UserRole.ADMIN) {
            return NextResponse.json(
                { error: 'Seul un admin peut supprimer un auteur' },
                { status: 403 }
            );
        }

        // 2. Vérification de l'auteur et de ses dépendances
        const authorId = parseInt(params.authorId);
        const [author, booksCount] = await Promise.all([
            prisma.author.findUnique({
                where: { id: authorId }
            }),
            prisma.book.count({
                where: { authorId }
            })
        ]);

        if (!author) {
            return NextResponse.json(
                { error: 'Auteur non trouvé' },
                { status: 404 }
            );
        }

        if (booksCount > 0) {
            return NextResponse.json(
                { 
                    error: 'Impossible de supprimer cet auteur',
                    details: {
                        booksCount,
                        message: "Supprimez d'abord les livres associés"
                    }
                },
                { status: 400 }
            );
        }

        // 3. Suppression
        await prisma.author.delete({
            where: { id: authorId }
        });

        await logAction(ActionType.DELETE_AUTHOR, parseInt(currentUserId), author)

        return NextResponse.json(
            { success: true, message: 'Auteur supprimé avec succès' },
            { status: 200 }
        );

    } catch (error) {
        console.error('[AUTHOR_DELETE_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}