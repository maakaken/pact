import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { pact_id, emails, invited_by } = await request.json();

    if (!pact_id || !emails?.length || !invited_by) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Get pact details
    const { data: pact } = await supabase
      .from('pacts')
      .select('name')
      .eq('id', pact_id)
      .single();

    // Create invitation records
    const invitations = emails.map((email: string) => ({
      pact_id,
      invited_by,
      email,
    }));

    const { data: created, error } = await supabase
      .from('invitations')
      .insert(invitations)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return the invite links (in prototype, copy-paste links instead of emails)
    const inviteLinks = (created ?? []).map((inv: { email: string; token: string }) => ({
      email: inv.email,
      token: inv.token,
      link: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${inv.token}`,
    }));

    return NextResponse.json({ inviteLinks, pactName: pact?.name });
  } catch (error) {
    console.error('Send invitations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
