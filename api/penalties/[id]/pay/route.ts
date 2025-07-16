import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";

export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
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

        // Seuls les admins et managers peuvent marquer une pénalité comme payée
        if (!["ADMIN", "MANAGER"].includes(currentUserRole)) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes' },
                { status: 403 }
            );
        }

        // 2. Vérification de l'existence de la pénalité
        const penaltyId = parseInt(params.id);
        const penalty = await prisma.penalty.findUnique({
            where: { id: penaltyId }
        });

        if (!penalty) {
            return NextResponse.json(
                { error: 'Pénalité non trouvée' },
                { status: 404 }
            );
        }

        // 3. Vérification si déjà payée
        if (penalty.paid) {
            return NextResponse.json(
                { 
                    error: 'Cette pénalité a déjà été payée',
                    data: {
                        paidAt: penalty.updatedAt
                    }
                },
                { status: 400 }
            );
        }

        // 4. Mise à jour de la pénalité
        const updatedPenalty = await prisma.penalty.update({
            where: { id: penaltyId },
            data: { 
                paid: true
            },
            include: {
                user: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });

        return NextResponse.json(
            { 
                success: true, 
                message: 'Pénalité marquée comme payée',
                data: {
                    id: updatedPenalty.id,
                    amount: updatedPenalty.amount,
                    paid: updatedPenalty.paid,
                    userId: updatedPenalty.userId,
                    userName: `${updatedPenalty.user.firstName} ${updatedPenalty.user.lastName}`
                }
            },
            { status: 200 }
        );

    } catch (error) {
        console.error('[PENALTY_PAY_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}