import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";
import { categorySchema } from "@/lib/validator";
import { ActionType, logAction } from "@/lib/logger";

export async function PATCH(
    request: NextRequest,
    { params }: { params: { categoryId: string } }
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

        if (currentUserRole !== UserRole.ADMIN && currentUserRole !== UserRole.MANAGER) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes' },
                { status: 403 }
            );
        }

        // 2. Vérification de la catégorie
        const categoryId = parseInt(params.categoryId);
        const existingCategory = await prisma.category.findUnique({
            where: { id: categoryId }
        });

        if (!existingCategory) {
            return NextResponse.json(
                { error: 'Catégorie non trouvée' },
                { status: 404 }
            );
        }

        // 3. Validation avec Zod
        const body = await request.json();
        const validation = categorySchema.partial().safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Données invalides', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        const { name, color } = validation.data;

        // 4. Vérification unicité si modification du nom
        if (name && name !== existingCategory.name) {
            const categoryWithSameName = await prisma.category.findFirst({
                where: { name, NOT: { id: categoryId } }
            });

            if (categoryWithSameName) {
                return NextResponse.json(
                    { error: 'Une catégorie avec ce nom existe déjà' },
                    { status: 409 }
                );
            }
        }

        // 5. Mise à jour
        const updatedCategory = await prisma.category.update({
            where: { id: categoryId },
            data: {
                name: name || existingCategory.name,
                color: color !== undefined ? color : existingCategory.color
            },
            select: { id: true, name: true, color: true }
        });

        //log de la modification
        await logAction(ActionType.UPDATE_CATEGORY, parseInt(currentUserId), {
            id: updatedCategory.id,
            name: updatedCategory.name,
            color: updatedCategory.color,
        })

        return NextResponse.json(
            { success: true, data: updatedCategory },
            { status: 200 }
        );

    } catch (error) {
        console.error('[CATEGORY_UPDATE_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { categoryId: string } }
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
                { error: 'Seul un admin peut supprimer une catégorie' },
                { status: 403 }
            );
        }

        // 2. Vérification de la catégorie et de ses dépendances
        const categoryId = parseInt(params.categoryId);
        const [category, booksCount] = await Promise.all([
            prisma.category.findUnique({
                where: { id: categoryId }
            }),
            prisma.book.count({
                where: { categoryId }
            })
        ]);

        if (!category) {
            return NextResponse.json(
                { error: 'Catégorie non trouvée' },
                { status: 404 }
            );
        }

        if (booksCount > 0) {
            return NextResponse.json(
                {
                    error: 'Impossible de supprimer cette catégorie',
                    details: {
                        booksCount,
                        message: "Modifiez ou supprimez d'abord les livres associés"
                    }
                },
                { status: 400 }
            );
        }

        // 3. Suppression
        await prisma.category.delete({
            where: { id: categoryId }
        });

        return NextResponse.json(
            { success: true, message: 'Catégorie supprimée avec succès' },
            { status: 200 }
        );

    } catch (error) {
        console.error('[CATEGORY_DELETE_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}