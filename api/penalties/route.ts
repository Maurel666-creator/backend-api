import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { UserRole } from "@/app/generated/prisma";

export async function GET(request: NextRequest) {
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

        // Seuls les admins et managers peuvent accéder à cette route
        if (!["ADMIN", "MANAGER"].includes(currentUserRole)) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes' },
                { status: 403 }
            );
        }

        // 2. Récupération des paramètres de requête
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const userId = searchParams.get('userId');
        const paidStatus = searchParams.get('paid');
        const sort = searchParams.get('sort') || 'desc';

        // 3. Construction du filtre
        const where: any = {};

        if (userId) {
            where.userId = parseInt(userId);
        }

        if (paidStatus) {
            where.paid = paidStatus === 'true';
        }

        // 4. Récupération des pénalités avec pagination
        const [penalties, total] = await Promise.all([
            prisma.penalty.findMany({
                where,
                orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true
                        }
                    },
                    loan: {
                        include: {
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

        // 5. Formatage de la réponse
        const formattedPenalties = penalties.map(penalty => ({
            id: penalty.id,
            amount: penalty.amount,
            reason: penalty.reason,
            paid: penalty.paid,
            createdAt: penalty.createdAt,
            user: penalty.user,
            book: {
                title: penalty.loan.book.title,
                author: `${penalty.loan.book.author.firstName} ${penalty.loan.book.author.lastName}`
            },
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
        console.error('[PENALTIES_GET_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
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

        // Seuls les admins et managers peuvent créer des pénalités
        if (currentUserRole !== UserRole.ADMIN && currentUserRole !== UserRole.MANAGER) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes' },
                { status: 403 }
            );
        }

        // 2. Validation des données
        const body = await request.json();
        const { userId, loanId, amount, reason } = body;

        if (!userId || !loanId || !amount) {
            return NextResponse.json(
                { error: 'Les champs userId, loanId et amount sont obligatoires' },
                { status: 400 }
            );
        }

        // 3. Vérification de l'existence de l'utilisateur et du prêt
        const [userExists, loanExists] = await Promise.all([
            prisma.user.findUnique({ where: { id: userId } }),
            prisma.loan.findUnique({ where: { id: loanId } })
        ]);

        if (!userExists || !loanExists) {
            return NextResponse.json(
                {
                    error: 'Utilisateur ou prêt non trouvé',
                    details: {
                        userExists: !!userExists,
                        loanExists: !!loanExists
                    }
                },
                { status: 404 }
            );
        }

        // 4. Création de la pénalité
        const newPenalty = await prisma.penalty.create({
            data: {
                userId,
                loanId,
                amount,
                reason: reason || null,
                createdAt: new Date()
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
                data: {
                    id: newPenalty.id,
                    amount: newPenalty.amount,
                    reason: newPenalty.reason,
                    paid: newPenalty.paid,
                    userId: newPenalty.userId,
                    userName: `${newPenalty.user.firstName} ${newPenalty.user.lastName}`,
                    loanId: newPenalty.loanId,
                    createdAt: newPenalty.createdAt
                }
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('[PENALTIES_POST_ERROR]', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}