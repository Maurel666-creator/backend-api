import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { UserRole } from './app/generated/prisma'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const method = request.method
  const token = request.cookies.get('auth-token')?.value

  // Routes publiques
  const publicRoutes = ['/api/auth/login', '/api/auth/register']
  if (publicRoutes.includes(path)) {
    return NextResponse.next()
  }

  // Vérification du token
  if (!token) {
    return new NextResponse(
      JSON.stringify({ error: 'Authentification requise' }), 
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const user = await verifyToken(token)
    if (!user) {
      throw new Error('Utilisateur invalide')
    }

    // Attachement des infos utilisateur
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', user.id.toString())
    requestHeaders.set('x-user-role', user.role)
    if (user.libraryId) {
      requestHeaders.set('x-user-library-id', user.libraryId.toString())
    }

    // Gestion spéciale des routes utilisateurs
    if (path.startsWith('/api/users/')) {
      const userIdInPath = path.split('/').pop()
      
      // Autoriser l'accès si:
      // 1. Route 'me' OU
      // 2. Même ID que l'utilisateur OU
      // 3. Rôle ADMIN
      const isSelfAccess = (
        userIdInPath === 'me' || 
        userIdInPath === user.id.toString() ||
        user.role === UserRole.ADMIN
      )

      if (!isSelfAccess) {
        return new NextResponse(
          JSON.stringify({ 
            error: 'Accès refusé',
            message: 'Vous ne pouvez accéder qu\'à vos propres données' 
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Forcer le paramètre à l'ID réel pour les routes 'me'
      if (userIdInPath === 'me') {
        requestHeaders.set('x-requested-user-id', user.id.toString())
      }
    }

    // Vérification globale des permissions
    if (!hasPermission(user.role, path, method)) {
      return new NextResponse(
        JSON.stringify({ 
          error: 'Permissions insuffisantes',
          message: 'Votre rôle ne vous permet pas d\'effectuer cette action' 
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return NextResponse.next({ request: { headers: requestHeaders } })
  } catch {
    return new NextResponse(
      JSON.stringify({ error: 'Token invalide' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Permissions simplifiées et plus explicites
function hasPermission(role: UserRole, path: string, method: string): boolean {
  const permissions: Record<UserRole, { path: string | RegExp; methods?: string[] }[]> = {
    [UserRole.ADMIN]: [
      { path: /^\/api\/.*/, methods: ['GET', 'POST', 'PATCH', 'DELETE'] } // Accès complet
    ],
    [UserRole.MANAGER]: [
      { path: /^\/api\/libraries\/.*/, methods: ['GET', 'PATCH'] },
      { path: '/api/users', methods: ['GET'] }, 
      { path: /^\/api\/books\/.*/, methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
      { path: /^\/api\/(loans|reservations|penalties)\/.*/, methods: ['GET', 'POST', 'PATCH'] }
    ],
    [UserRole.CLIENT]: [
      { path: '/api/users/me', methods: ['GET', 'PATCH'] },
      { path: '/api/books', methods: ['GET'] },
      { path: '/api/reservations', methods: ['GET', 'POST', 'DELETE'] },
      { path: '/api/feedbacks', methods: ['GET', 'POST'] }
    ],
    [UserRole.DELIVERY]: [
      { path: '/api/sales', methods: ['GET', 'PATCH'] },
      { path: '/api/users/me', methods: ['GET'] }
    ]
  }

  return permissions[role]?.some(rule => {
    const pathMatches = typeof rule.path === 'string' 
      ? path === rule.path 
      : rule.path.test(path)
      
    const methodMatches = !rule.methods || rule.methods.includes(method)
    return pathMatches && methodMatches
  }) ?? false
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*']
}
