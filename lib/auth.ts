import { SignJWT, jwtVerify } from 'jose';
import { User, UserRole } from '@/app/generated/prisma';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key')

export async function generateToken(user: User): Promise<string> {
  try {
    const token = await new SignJWT({
      id: user.id,
      email: user.email,
      role: user.role,
      libraryId: user.libraryId,
    })
      .setProtectedHeader({ alg: 'HS256' }) //algoithme de signature
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(secret);

    return token
  } catch (error) {
    console.error('Error during token generation')
    throw error
  }
}

export async function verifyToken(token: string): Promise<{
  id: number
  email: string
  role: UserRole
  libraryId?: number
} | null> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    return {
      id: payload.id as number,
      email: payload.email as string,
      role: payload.role as UserRole,
      libraryId: payload.libraryId as number | undefined
    }
  } catch {
    console.error('Token verify failed');
    return null
  }
}