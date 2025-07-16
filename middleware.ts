import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@/app/generated/prisma'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const method = request.method

  // 1. D'abord vérifier les routes complètement publiques
  const publicRoutes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/signin',
    '/api/auth/callback',
    '/api/auth/providers',
    '/api/auth/session',
    '/api/auth/csrf',
    '/api/auth/debug' // <-- Ajoutez votre route de debug ici
  ]

  if (publicRoutes.some(route => path.startsWith(route))) {
    return NextResponse.next()
  }

  // 2. Ensuite vérifier les routes NextAuth protégées différemment


  // 3. Enfin, le reste de votre logique d'authentification...
  const authHeader = request.headers.get('authorization')
  const sessionToken = authHeader?.split(' ')[1]

  if (!sessionToken) {
    return new NextResponse(
      JSON.stringify({ error: 'Authentification requise' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Vérification de la session en base de données
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            libraryId: true
          }
        }
      }
    })

    if (!session || new Date(session.expires) < new Date()) {
      return new NextResponse(
        JSON.stringify({ error: 'Session expirée ou invalide' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const user = session.user

    // Rafraîchissement de la session si nécessaire
    if (session.expires.getTime() - Date.now() < 86400000) { // 1 jour
      const newExpires = new Date()
      newExpires.setDate(newExpires.getDate() + 30)

      await prisma.session.update({
        where: { id: session.id },
        data: { expires: newExpires }
      })
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
  } catch (error) {
    console.error('Middleware error:', error)
    return new NextResponse(
      JSON.stringify({ error: 'Erreur d\'authentification' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Fonction hasPermission inchangée
function hasPermission(role: UserRole, path: string, method: string): boolean {
  const permissions: Record<UserRole, { path: string | RegExp; methods?: string[] }[]> = {
    [UserRole.ADMIN]: [
      { path: /^\/api\/.*/, methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/api/:path*'
  ]
}