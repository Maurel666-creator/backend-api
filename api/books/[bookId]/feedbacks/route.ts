import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { ActionType, logAction } from '@/lib/logger';
import { feedbackSchema } from "@/lib/validator";

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

    // 3. Récupération des paramètres de pagination
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 10, 50);
    const page = Number(searchParams.get('page')) || 1;
    const skip = (page - 1) * limit;

    // 4. Récupération des feedbacks avec les informations utilisateur
    const [feedbacks, totalCount, averageRating] = await prisma.$transaction([
      prisma.feedback.findMany({
        where: { bookId },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.feedback.count({ where: { bookId } }),
      prisma.feedback.aggregate({
        where: { bookId },
        _avg: { rating: true }
      })
    ]);

    // 5. Formatage de la réponse
    return NextResponse.json({
      data: feedbacks.map(feedback => ({
        ...feedback,
        user: {
          id: feedback.user.id,
          name: `${feedback.user.firstName} ${feedback.user.lastName}`
        },
        createdAt: feedback.createdAt.toISOString()
      })),
      meta: {
        averageRating: averageRating._avg.rating?.toFixed(1) || "0.0",
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('[GET_BOOK_FEEDBACKS_ERROR]', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des avis' },
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
    const validation = feedbackSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // 5. Vérification que l'utilisateur n'a pas déjà posté un avis
    const existingFeedback = await prisma.feedback.findFirst({
      where: {
        userId: parseInt(userId),
        bookId
      }
    });

    if (existingFeedback) {
      return NextResponse.json(
        { error: 'Vous avez déjà posté un avis pour ce livre' },
        { status: 400 }
      );
    }

    // 6. Création du feedback
    const newFeedback = await prisma.feedback.create({
      data: {
        rating: validation.data.rating,
        comment: validation.data.comment,
        userId: parseInt(userId),
        bookId
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true
      }
    });

    // 7. Journalisation
    await logAction(ActionType.FEEDBACK_CREATED, parseInt(userId), {
      bookId,
      feedbackId: newFeedback.id,
      rating: newFeedback.rating
    });

    return NextResponse.json(
      { success: true, feedback: newFeedback },
      { status: 201 }
    );

  } catch (error) {
    console.error('[CREATE_FEEDBACK_ERROR]', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création de l\'avis' },
      { status: 500 }
    );
  }
}