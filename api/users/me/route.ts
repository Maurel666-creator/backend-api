import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

interface UserInfos {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: 'ADMIN' | 'MANAGER' | 'CLIENT' | 'DELIVERY';
    library?: {
        id: number;
        name: string;
        address?: string;
    };
    lastConnected?: Date | string;
    addresses?: Array<{
        id: number;
        address: string;
        city: string;
        country: string;
    }>;
    loans?: Array<{
        book: {
            title: string;
            author: {
                firstName: string;
                lastName: string;
            };
        };
        dueAt: Date;
    }>;
    reservations?: Array<unknown>;
}

export async function GET(req: NextRequest) {
    try {
        // Récupérer le token depuis les cookies
        const token = req.cookies.get('auth-token')?.value;

        if (!token) {
            return NextResponse.json(
                { error: 'Token manquant. L\'utilisateur n\'est pas connecté' },
                { status: 401 }
            );
        }

        // Vérifier le token
        const decoded = await verifyToken(token);

        if (!decoded) {
            return NextResponse.json(
                { error: 'Token invalide' },
                { status: 401 }
            );
        }

        // Récupérer les données utilisateur
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                lastConnected: true,
                phone: true,
                library: {
                    select: {
                        id: true,
                        name: true,
                        address: true
                    }
                },
                addresses: true,
                loans: {
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
                    },
                    where: {
                        returnedAt: null
                    }
                },
                reservations: {
                    where: {
                        status: "PENDING"
                    },
                    select: {
                        id: true,
                        book: {
                            select: {
                                title: true
                            }
                        },
                        expiresAt: true
                    }
                }
            },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        // Formater la réponse selon l'interface
        const userResponse: UserInfos = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone ?? undefined,
            role: user.role,
            library: user.library ? {
                id: user.library.id,
                name: user.library.name,
                address: user.library.address ?? undefined
            } : undefined,
            lastConnected: user.lastConnected?.toISOString(),
            addresses: user.addresses,
            loans: user.loans.map(loan => ({
                book: {
                    title: loan.book.title,
                    author: {
                        firstName: loan.book.author.firstName,
                        lastName: loan.book.author.lastName
                    }
                },
                dueAt: loan.dueAt
            })),
            reservations: user.reservations
        };

        return NextResponse.json(userResponse, { status: 200 });
    } catch (error) {
        console.error('Error fetching user:', error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}

