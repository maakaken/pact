import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function POST(request: NextRequest) {
  try {
    console.log('[invitations/send] Request received');
    
    const { pact_id, emails } = await request.json();
    console.log('[invitations/send] Parsed data:', { pact_id, emails: emails?.length });

    if (!pact_id || !emails?.length) {
      console.error('[invitations/send] Missing required fields:', { pact_id: !!pact_id, emails: emails?.length });
      return NextResponse.json({ error: 'Missing required fields: pact_id, emails' }, { status: 400 });
    }

    // Get user from session using SSR client
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    );
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('[invitations/send] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('[invitations/send] User authenticated:', user.id);

    // Create service role client for database operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get pact details
    const { data: pact, error: pactError } = await serviceClient
      .from('pacts')
      .select('name')
      .eq('id', pact_id)
      .single();

    if (pactError || !pact) {
      console.error('[invitations/send] Pact not found:', pactError);
      return NextResponse.json({ error: 'Pact not found' }, { status: 404 });
    }

    console.log('[invitations/send] Pact found:', pact.name);

    // Create invitation records
    const invitations = emails.map((email: string) => ({
      pact_id,
      invited_by: user.id,
      email,
      token: crypto.randomUUID(), // Generate unique token
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    }));

    const { data: created, error } = await serviceClient
      .from('invitations')
      .insert(invitations)
      .select();

    if (error) {
      console.error('[invitations/send] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[invitations/send] Created invitations:', created?.length);

    // Get base URL for invite links
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    console.log('[invitations/send] Using base URL:', baseUrl);

    // Return the invite links (in prototype, copy-paste links instead of emails)
    const inviteLinks = (created ?? []).map((inv: { email: string; token: string }) => ({
      email: inv.email,
      token: inv.token,
      link: `${baseUrl}/invite/${inv.token}`,
    }));

    console.log('[invitations/send] Generated invite links for:', inviteLinks.length);

    return NextResponse.json({ 
      success: true,
      inviteLinks, 
      pactName: pact.name 
    });
  } catch (error) {
    console.error('[invitations/send] Unhandled error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
