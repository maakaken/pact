import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Sanitise the `next` path — must start with / and never be an external URL
  const rawNext = searchParams.get('next') ?? '';
  const next = rawNext.startsWith('/') ? rawNext : '/lobby';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // Build the redirect response first so we can write cookies onto it
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // getAll reads from the incoming request
        getAll() {
          return request.cookies.getAll();
        },
        // setAll writes to the outgoing response AND forwards any
        // Cache-Control / Pragma headers the library requires
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              response.headers.set(key, value)
            );
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('OAuth callback error:', error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  return response;
}
