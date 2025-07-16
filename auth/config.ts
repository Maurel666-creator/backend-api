import { AuthOptions } from "next-auth";
import type { Account, Profile, User } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

export const authConfig: AuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) return null;

        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!passwordMatch) return null;

        return {
          id: user.id.toString(),
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          isOAuth: !!user.isOAuth, // Ensure isOAuth is present
        };
      },
    }),
  ],
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 jours
    updateAge: 24 * 60 * 60, // Mise à jour quotidienne
  },
  callbacks: {
    async signIn({ user, account, profile }: {
      user: User & { isOAuth?: boolean };
      account: Account | null;
      profile?: Profile & { given_name?: string; family_name?: string };
    }) {
      if (account?.provider === "google") {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });

        if (!existingUser) {
          await prisma.user.create({
            data: {
              email: user.email!,
              firstName: profile?.given_name || user.name?.split(" ")[0] || "User",
              lastName: profile?.family_name || user.name?.split(" ")[1] || "Google",
              isOAuth: true,
              role: "CLIENT",
              password: await bcrypt.hash(crypto.randomUUID(), 10),
              lastConnected: new Date(),
            },
          });
        } else if (!existingUser.isOAuth) {
          return "/auth/login?error=account_conflict";
        }
      }
      return true;
    },
    async session({ session, user }: { session: import("next-auth").Session; user: { id: string } }) {
      const dbUser = await prisma.user.findUnique({
        where: { id: Number(user.id) },
        select: {
          id: true,
          email: true,
          role: true,
          isOAuth: true,
          firstName: true,
          lastName: true
        }
      });

      if (!dbUser) throw new Error("User not found");

      session.user = {
        id: dbUser.id.toString(),
        email: dbUser.email,
        name: `${dbUser.firstName} ${dbUser.lastName}`,
        role: dbUser.role,
      } as typeof session.user & { isOAuth: boolean };

      (session.user).isOAuth = dbUser.isOAuth;

      return session;
    }
  }
};