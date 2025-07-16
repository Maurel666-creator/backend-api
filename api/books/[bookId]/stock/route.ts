import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { stockbackSchema } from "@/lib/validator";
import { ActionType, logAction } from '@/lib/logger';

export async function GET(
    request: NextRequest,
    { params }: { params: { bookId: string } }
) {
    try {
        // 1. Validation de l'ID du livre
        const bookId = parseInt(params.bookId);
        if (isNaN(bookId)) {
            return NextResponse.json(
                { error: "ID de livre invalide" },
                { status: 400 }
            );
        }
        // 2. Vérification que le livre existe
        const bookExists = await prisma.book.findUnique({
            where: { id: bookId },
            select: { id: true }
        });

        if (!bookExists) {
            return NextResponse.json(
                { error: "Livre non trouvé" },
                { status: 404 }
            );
        }

        const stock = await prisma.bookStock.findFirst({
            where: { bookId },
            select: { quantity: true }
        });

        if (!stock) {
            return NextResponse.json(
                { error: "Quantité de stock non trouvée" },
                { status: 404 }
            );
        } else {
            return NextResponse.json(
                { stock: stock.quantity },
                { status: 200 }
            );
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du stock :", error);
        return NextResponse.json(
            { error: "Erreur lors de la récupération du stock" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: { bookId: string } }
) {
    try {
        // 1. Authentification
        const headers = request.headers;
        const userId = headers.get('x-user-id');
        const userRole = headers.get('x-user-role');

        if (!userId || !userRole) {
            return NextResponse.json(
                { error: 'Authentification requise' },
                { status: 401 }
            );
        }

        // 2. Validation de l'ID du livre
        const bookId = parseInt(params.bookId);
        if (isNaN(bookId)) {
            return NextResponse.json(
                { error: "ID de livre invalide" },
                { status: 400 }
            );
        }

        // 3. Vérification que le livre existe
        const bookExists = await prisma.book.findUnique({
            where: { id: bookId },
            select: { id: true, isSellable: true }
        });

        if (!bookExists) {
            return NextResponse.json(
                { error: "Livre non trouvé" },
                { status: 404 }
            );
        }

        // 4. Validation des données
        const body = await request.json();
        const validation = stockbackSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Données invalides', details: validation.error.flatten() },
                { status: 400 }
            );
        }

        const newStock = Number(validation.data.quantity);
        const updatedStock = await prisma.bookStock.update({
            where: { bookId: bookId },
            data: { quantity: newStock }
        });

        if (updatedStock) {
            // 7. Journalisation
            await logAction(ActionType.STOCK_UPDATE, parseInt(userId), {
                bookId,
                stock: newStock
            });

            return NextResponse.json(
                { message: 'Stock mis à jour avec succès' },
                { status: 200 }
            );
        }
    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        );
    }
}