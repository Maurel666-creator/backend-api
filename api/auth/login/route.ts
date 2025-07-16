import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';

export async function POST(req: NextRequest) {
    try {
        const { email, password, isOAuth } = await req.json();

        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                password: true,
                role: true,
                isOAuth: true,
                firstName: true,
                lastName: true
            }
        });

        if (!user) {
            return NextResponse.json(
                { error: "Utilisateur non trouvé" },
                { status: 404 }
            );
        }

        if (isOAuth && !user.isOAuth) {
            return NextResponse.json(
                { error: "Compte existant - utilisez la connexion standard" },
                { status: 403 }
            );
        }

        if (!isOAuth) {
            if (user.isOAuth) {
                return NextResponse.json(
                    { error: "Compte Google - utilisez la connexion Google" },
                    { status: 403 }
                );
            }

            if (!password) {
                return NextResponse.json(
                    { error: "Mot de passe requis" },
                    { status: 400 }
                );
            }

            const passwordMatch = await bcrypt.compare(password, user.password!);
            if (!passwordMatch) {
                return NextResponse.json(
                    { error: "Email ou mot de passe incorrect" },
                    { status: 401 }
                );
            }
        }

        // Création session en base
        const sessionToken = crypto.randomUUID();
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);

        await prisma.session.create({
            data: {
                sessionToken,
                userId: user.id,
                expires,
            }
        });

        // Mise à jour lastConnected
        await prisma.user.update({
            where: { id: user.id },
            data: { lastConnected: new Date() }
        });

        return NextResponse.json({
            message: "Connexion réussie",
            sessionToken,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                firstName: user.firstName,
                lastName: user.lastName
            }
        });

    } catch {
        return NextResponse.json(
            { error: "Erreur lors de la connexion" },
            { status: 500 }
        );
    }
}