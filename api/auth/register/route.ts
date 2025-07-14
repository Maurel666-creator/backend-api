import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from 'bcrypt';


// Schéma de validation avec Zod
const baseUserSchema = z.object({
    email: z.string().email('Email invalide'),
    password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
    firstName: z.string().min(1, 'Le prénom est requis'),
    lastName: z.string().min(1, 'Le nom est requis'),
    phone: z.string().optional(),
    role: z.enum(['ADMIN', 'MANAGER', 'CLIENT', 'DELIVERY'], {
        errorMap: () => ({
            message: "Le rôle doit être 'ADMIN', 'MANAGER', 'CLIENT' ou 'DELIVERY'."
        })
    })
})

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        // Validation des données avec Zod
        const validatedData = baseUserSchema.parse(body)

        // Vérification si l'email existe déjà
        const existingUser = await prisma.user.findUnique({
            where: { email: validatedData.email }
        })

        if (existingUser) {
            return NextResponse.json(
                { error: 'Un utilisateur avec cet email existe déjà' },
                { status: 400 }
            )
        }

        // Hashage du mot de passe seulement pour les managers
        const hashedPassword = await bcrypt.hash(validatedData.password, 10);

        // Création de l'utilisateur
        const newUser = await prisma.user.create({
            data: {
                email: validatedData.email,
                password: hashedPassword,
                firstName: validatedData.firstName,
                lastName: validatedData.lastName,
                phone: validatedData.phone,
                role: validatedData.role
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                libraryId: true
            }
        })

        if (newUser) {
            return NextResponse.json({ message: 'Utilisateur créé avec succès' }, { status: 201 })
        } else {
            return NextResponse.json({ error: 'Erreur lors de la création de l\'utilisateur' }, { status: 500 })
        }

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.errors },
                { status: 400 }
            )
        }

        console.error('Error during signup:', error)
        return NextResponse.json(
            { error: 'Une erreur est survenue lors de l\'inscription' },
            { status: 500 }
        )
    } finally {
        await prisma.$disconnect()
    }
}