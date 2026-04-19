import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    console.log('[invitations/send] Request received');
    
    const { pact_id, emails, invited_by } = await request.json();
    console.log('[invitations/send] Parsed data:', { pact_id, emails: emails?.length, invited_by });

    if (!pact_id || !emails?.length || !invited_by) {
      console.error('[invitations/send] Missing required fields:', { pact_id: !!pact_id, emails: emails?.length, invited_by: !!invited_by });
      return NextResponse.json({ error: 'Missing required fields: pact_id, emails, invited_by' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Get pact details
    const { data: pact, error: pactError } = await supabase
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
      invited_by,
      email,
      token: crypto.randomUUID(), // Generate unique token
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    }));

    const { data: created, error } = await supabase
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
