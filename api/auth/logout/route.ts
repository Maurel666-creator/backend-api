import { NextResponse } from "next/server";

export async function POST() {
    const response = NextResponse.json({ message: 'Déconnexion réussie' });
    response.cookies.delete('auth-token');
    return response;
}