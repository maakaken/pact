import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { target_user_id, pact_id, nudger_id } = await request.json();

    if (!target_user_id || !pact_id || !nudger_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Get nudger's profile
    const { data: nudger } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', nudger_id)
      .single();

    // Get pact name
    const { data: pact } = await supabase
      .from('pacts')
      .select('name')
      .eq('id', pact_id)
      .single();

    // Create nudge notification
    await supabase.from('notifications').insert({
      user_id: target_user_id,
      type: 'nudge',
      title: `${nudger?.full_name ?? nudger?.username ?? 'Someone'} nudged you!`,
      body: `Don't forget to submit your proof for ${pact?.name ?? 'your pact'}. Time is running out!`,
      pact_id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Nudge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
