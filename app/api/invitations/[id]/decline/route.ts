import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invitation_id } = await params;

    // Verify user is authenticated
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Atomic update with recipient check
    // We only allow declining if it's pending AND (it's a username invite for the current user OR it's an email invite)
    // Note: for email invites, we assume possession of the ID is sufficient for now, 
    // but username invites are strictly checked against user.id.
    const { data: updatedInvitation, error: updateError } = await serviceClient
      .from('invitations')
      .update({ status: 'declined' })
      .eq('id', invitation_id)
      .eq('status', 'pending')
      .or(`invited_user_id.eq.${user.id},invitation_type.eq.email`)
      .select()
      .single();

    if (updateError || !updatedInvitation) {
      // If we failed to update, check if it was because it didn't exist or wasn't pending
      // or because the user wasn't the recipient.
      const { data: invitation } = await serviceClient
        .from('invitations')
        .select('status, invited_user_id, invitation_type')
        .eq('id', invitation_id)
        .single();

      if (!invitation) {
        return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
      }

      if (invitation.invitation_type === 'username' && invitation.invited_user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (invitation.status !== 'pending') {
        return NextResponse.json({ error: 'Invitation is no longer pending' }, { status: 400 });
      }

      console.error('[Invitation Decline] Unexpected update failure:', updateError);
      return NextResponse.json({ error: 'Failed to decline invitation' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Invitation Decline] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
