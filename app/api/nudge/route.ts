import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { target_user_id, pact_id, nudger_id } = await request.json();

    if (!target_user_id || !pact_id || !nudger_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Use service role client to bypass RLS for notification insert
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get nudger's profile
    const { data: nudger } = await serviceClient
      .from('profiles')
      .select('full_name, username')
      .eq('id', nudger_id)
      .single();

    // Get pact name
    const { data: pact } = await serviceClient
      .from('pacts')
      .select('name')
      .eq('id', pact_id)
      .single();

    // Create nudge notification
    const { error: insertError } = await serviceClient.from('notifications').insert({
      user_id: target_user_id,
      type: 'nudge',
      title: `${nudger?.full_name ?? nudger?.username ?? 'Someone'} nudged you!`,
      body: `Don't forget to submit your proof for ${pact?.name ?? 'your pact'}. Time is running out!`,
      pact_id,
    });

    if (insertError) {
      console.error('Nudge insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Nudge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
