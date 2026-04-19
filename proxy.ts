import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PROTECTED_ROUTES = [
  '/lobby',
  '/pacts',
  '/stakes',
  '/notifications',
  '/profile',
  '/marketplace',
  '/invite',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes handle their own auth — never redirect them
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // ── Admin route protection ─────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      return NextResponse.next();
    }

    const adminSession = request.cookies.get('admin_session')?.value;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminSession || adminSession !== adminPassword) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/admin/login';
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // ── Refresh Supabase session on every request ──────────────────────────────
  // This keeps auth cookies alive so Realtime WebSocket can authenticate
  // and eliminates the TypeError from supabase realtime client.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  // ── Auth-protected routes ──────────────────────────────────────────────────
  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  if (isProtected) {
    const hasSession = Array.from(request.cookies.getAll()).some(
      (c) =>
        c.name.startsWith('sb-') &&
        (c.name.endsWith('-auth-token') || c.name.endsWith('-auth-token.0'))
    );

    if (!hasSession) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - api          (API routes — they handle their own auth)
     *  - _next/static (static files)
     *  - _next/image  (image optimisation)
     *  - favicon.ico
     *  - public folder assets (images, fonts, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
