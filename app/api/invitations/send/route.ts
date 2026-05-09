import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function POST(request: NextRequest) {
  try {
    console.log('[invitations/send] Request received');
    
    const { pact_id, emails, usernames } = await request.json()

    if (!pact_id || (!emails?.length && !usernames?.length)) {
      console.error('[invitations/send] Missing required fields:', { pact_id: !!pact_id, emails: emails?.length, usernames: usernames?.length });
      return NextResponse.json({ error: 'Missing required fields: pact_id, and either emails or usernames' }, { status: 400 });
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create service role client for database operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get inviter's profile for notification body
    const { data: inviterProfile } = await serviceClient
      .from('profiles')
      .select('username, full_name')
      .eq('id', user.id)
      .single();

    const inviterName = inviterProfile?.full_name || inviterProfile?.username || 'Someone';

    // Get pact details
    const { data: pact, error: pactError } = await serviceClient
      .from('pacts')
      .select('name')
      .eq('id', pact_id)
      .single();

    if (pactError || !pact) {
      return NextResponse.json({ error: 'Pact not found' }, { status: 404 });
    }

    // 1. Process and Insert Invitations
    const invitationData: any[] = [];
    const usernameMap = new Map<string, string>(); // username -> invited_user_id

    // Email Invitations
    if (emails?.length) {
      emails.forEach((email: string) => {
        invitationData.push({
          pact_id,
          invited_by: user.id,
          email,
          invitation_type: 'email',
          token: crypto.randomUUID(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      });
    }

    // Username Invitations
    let invalidUsernames: string[] = [];
    
    if (usernames?.length) {
      const { data: profiles } = await serviceClient
        .from('profiles')
        .select('id, username')
        .in('username', usernames.map((u: string) => u.toLowerCase()));

      profiles?.forEach(p => usernameMap.set(p.username.toLowerCase(), p.id));
      
      usernames.forEach((username: string) => {
        const invitedUserId = usernameMap.get(username.toLowerCase());
        if (invitedUserId && invitedUserId !== user.id) {
          invitationData.push({
            pact_id,
            invited_by: user.id,
            invited_user_id: invitedUserId,
            invitation_type: 'username',
            token: crypto.randomUUID(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
        } else if (!invitedUserId) {
          invalidUsernames.push(username);
        }
      });
    }

    if (invitationData.length === 0) {
      return NextResponse.json({ error: 'No valid recipients found' }, { status: 400 });
    }

    const { data: createdInvitations, error: inviteError } = await serviceClient
      .from('invitations')
      .insert(invitationData)
      .select();

    if (inviteError) {
      console.error('[invitations/send] Database error (invites):', inviteError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // 2. Create Notifications for username-based invites
    const notifications = (createdInvitations ?? [])
      .filter(inv => inv.invitation_type === 'username' && inv.invited_user_id)
      .map(inv => ({
        user_id: inv.invited_user_id,
        type: 'invite_received',
        title: 'Pact Invitation',
        body: `${inviterName} invited you to join "${pact.name}"`,
        pact_id,
        data: JSON.stringify({ 
          token: inv.token,
          invitation_id: inv.id 
        }),
      }));

    if (notifications.length > 0) {
      const { error: notifError } = await serviceClient
        .from('notifications')
        .insert(notifications);

      if (notifError) {
        console.error('[invitations/send] Database error (notifications):', notifError);
      }
    }

    // Get base URL for invite links
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Return the invite links (for email ones especially)
    const inviteLinks = (createdInvitations ?? [])
      .filter(inv => inv.invitation_type === 'email')
      .map((inv: { email: string; token: string }) => ({
        email: inv.email,
        token: inv.token,
        link: `${baseUrl}/invite/${inv.token}`,
      }));

    return NextResponse.json({ 
      success: true,
      inviteLinks, 
      pactName: pact.name,
      invitedCount: createdInvitations?.length || 0,
      invalidUsernames: invalidUsernames.length > 0 ? invalidUsernames : undefined
    });
  } catch (error) {
    console.error('[invitations/send] Unhandled error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
