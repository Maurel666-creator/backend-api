import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';

export async function POST(req: NextRequest) {
    const { email, password } = await req.json();

    if (!email || !password) {
        return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    //verification du password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        return NextResponse.json(
            { error: "Email ou mot de passe incorrect" },
            { status: 401 }
        );
    }

    // Mise à jour de lastConnected ET génération du token
    const [token, updatedUser] = await Promise.all([
        generateToken(user),
        prisma.user.update({
            where: { id: user.id },
            data: { lastConnected: new Date() } // Met à jour avec la date/heure de derniere connexion
        })
    ]);

    const actualUser = {
        userId: updatedUser.id,
        role: updatedUser.role,
    }

    const response = NextResponse.json({
        message: 'Connexion réussie',
        token,
        actualUser
    }, { status: 200 });

    response.cookies.set('auth-token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
        domain: process.env.COOKIE_DOMAIN || undefined // a ajouter dans le .env si necessaire
    });

    return response;
}