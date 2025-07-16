import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // 1. Récupération des headers
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
        const isSelfRequest = params.id === 'me' || params.id === currentUserId;

        if (!isSelfRequest && !isAdmin) {
            return NextResponse.json(
                { error: 'Accès non autorisé' },
                { status: 403 }
            );
        }

        // 3. Détermination de l'ID utilisateur
        const userId = params.id === 'me' ? parseInt(currentUserId) : parseInt(params.id);

        // 4. Vérification de l'existence de l'utilisateur
        const userExists = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true }
        });

        if (!userExists) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        // 5. Récupération des paramètres de requête
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const paidStatus = searchParams.get('paid');
        const sort = searchParams.get('sort') || 'desc';

        // 6. Construction du filtre
        const where: any = {
            userId: userId
        };

        if (paidStatus) {
            where.paid = paidStatus === 'true';
        }

        // 7. Récupération des pénalités
        const [penalties, total] = await Promise.all([
            prisma.penalty.findMany({
                where,
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    loan: {
                        select: {
                            book: {
                                select: {
                                    title: true,
                                    author: {
                                        select: {
                                            firstName: true,
                                            lastName: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }),
            prisma.penalty.count({ where })
        ]);

        // 8. Formatage de la réponse
        const formattedPenalties = penalties.map(penalty => ({
            id: penalty.id,
            amount: penalty.amount,
            reason: penalty.reason,
            paid: penalty.paid,
            createdAt: penalty.createdAt,
            bookTitle: penalty.loan.book.title,
            author: `${penalty.loan.book.author.firstName} ${penalty.loan.book.author.lastName}`,
            loanId: penalty.loanId
        }));

        return NextResponse.json({
            data: formattedPenalties,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[USER_PENALTIES_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}