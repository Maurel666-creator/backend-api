import NextAuth from "next-auth";
import { authConfig } from "./config"; // ta config personnalisée
import { UserRole } from "@/app/generated/prisma"; // type personnalisé de rôle utilisateur

// Handler principal
const handler = NextAuth({
  ...authConfig,
  secret: process.env.NEXTAUTH_SECRET, // clé secrète
});

// 🔁 Pour l'App Router : export GET/POST handlers
export const GET = handler;
export const POST = handler;

// (Optionnel) Tu peux aussi exposer l'objet original si tu veux l'utiliser ailleurs
export default handler;

// 🔒 Déclarations de types personnalisées pour NextAuth
declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name?: string;
    role: UserRole;
    isOAuth: boolean;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string;
      role: UserRole;
      isOAuth: boolean;
    };
  }
}
