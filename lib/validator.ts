import { z } from 'zod';
import { UserRole, BookStatus } from '@/app/generated/prisma';

export const userUpdateSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.nativeEnum(UserRole).optional(),
  libraryId: z.number().optional(),
  phone: z.string().min(10).optional()
}).refine(data => {
  // Au moins un champ doit être fourni
  return Object.values(data).some(val => val !== undefined)
})

export const libraryUpdateSchema = z.object({
  name: z.string().min(3).optional(),
  address: z.string().min(10).optional(),
  contact: z.string().min(6).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: "Au moins un champ doit être fourni"
});

export const assignManagerSchema = z.object({
  userId: z.number().int().positive("ID utilisateur invalide"),
});

export const bookCreateSchema = z.object({
  title: z.string().min(2, "Le titre doit contenir au moins 2 caractères"),
  authorId: z.number().int().positive("ID auteur invalide"),
  categoryId: z.number().int().positive("ID catégorie invalide"),
  libraryId: z.number().int().positive("ID bibliothèque invalide"),
  isbn: z.string().min(10).optional(),
  summary: z.string().optional(),
  pages: z.number().int().positive().optional(),
  coverUrl: z.string().url("URL de couverture invalide").optional(),
  status: z.nativeEnum(BookStatus).default("AVAILABLE")
});


export const bookUpdateSchema = z.object({
  title: z.string()
    .min(2, "Le titre doit contenir au moins 2 caractères")
    .max(100, "Le titre ne peut pas dépasser 100 caractères")
    .optional(),

  summary: z.string()
    .max(1000, "Le résumé ne peut pas dépasser 1000 caractères")
    .optional(),

  coverUrl: z.string()
    .url("L'URL de la couverture doit être valide")
    .optional(),

  status: z.nativeEnum(BookStatus)
    .optional(),

  isbn: z.string()
    .regex(/^(?:\d{10}|\d{13})$/, "ISBN doit être 10 ou 13 chiffres")
    .optional(),

  publishedDate: z.coerce.date()
    .max(new Date(), "La date de publication ne peut pas être dans le futur")
    .optional(),

  pageCount: z.number()
    .int("Le nombre de pages doit être un entier")
    .min(1, "Le livre doit avoir au moins 1 page")
    .max(5000, "Le livre ne peut pas avoir plus de 5000 pages")
    .optional(),

  language: z.string()
    .length(2, "Le code langue doit être sur 2 caractères (ex: FR, EN)")
    .optional(),

  authorId: z.number()
    .int("L'ID de l'auteur doit être un entier")
    .positive("L'ID de l'auteur doit être positif")
    .optional(),

  categoryId: z.number()
    .int("L'ID de la catégorie doit être un entier")
    .positive("L'ID de la catégorie doit être positif")
    .optional(),

  libraryId: z.number()
    .int("L'ID de la bibliothèque doit être un entier")
    .positive("L'ID de la bibliothèque doit être positif")
    .optional(),

  isSellable: z.boolean()
    .optional(),

  price: z.number()
    .min(0, "Le prix ne peut pas être négatif")
    .max(1000, "Le prix ne peut pas dépasser 1000€")
    .optional()
    .refine((val) => val === undefined || val % 0.01 === 0, {
      message: "Le prix doit avoir au maximum 2 décimales"
    }),

  // Validation conditionnelle : prix requis si isSellable=true
}).refine(data => !data.isSellable || data.price !== undefined, {
  message: "Le prix est requis lorsque le livre est marqué comme vendable",
  path: ["price"]
}).refine(data => {
  // Validation conditionnelle : statut SOLD seulement si isSellable=true
  if (data.status === "SOLD") {
    return data.isSellable === true;
  }
  return true;
}, {
  message: "Le livre doit être marqué comme vendable pour avoir le statut SOLD",
  path: ["status"]
});

// Schéma de validation pour la création/mise à jour d'un feedback
export const feedbackSchema = z.object({
  rating: z.number().int().min(1, "La note doit être au moins 1").max(5, "La note ne peut pas dépasser 5"),
  comment: z.string().max(500, "Le commentaire ne peut pas dépasser 500 caractères").optional(),
});

export const stockbackSchema = z.object({
  quantity: z.number().int().min(1, "La quantité doit être supérieure à 0").optional()
});

export const authorSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis").max(100),
  lastName: z.string().min(1, "Le nom est requis").max(100),
  bio: z.string().max(500).optional()
});

export type AuthorInput = z.infer<typeof authorSchema>;

export const categorySchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(100),
  color: z.string().max(50).optional()
});

export type CategoryInput = z.infer<typeof categorySchema>;