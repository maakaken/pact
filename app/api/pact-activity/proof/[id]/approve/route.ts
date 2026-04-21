import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: proofId } = await params

    if (!proofId) {
      return NextResponse.json(
        { error: 'Missing proof_id' },
        { status: 400 }
      )
    }

    // Verify user is authenticated
    const cookieStore = await cookies()
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
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Use service role client to bypass RLS
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch submission
    const { data: submission } = await serviceClient
      .from('submissions')
      .select('*')
      .eq('id', proofId)
      .single()

    if (!submission) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      )
    }

    // Verify user is the uploader
    if (submission.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only approve your own submissions' },
        { status: 403 }
      )
    }

    // Update submission status to approved
    const { error: updateError } = await serviceClient
      .from('submissions')
      .update({ moderation_status: 'approved' })
      .eq('id', proofId)

    if (updateError) {
      console.error('[Approve Proof API] Error updating submission:', updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // Get user profile
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name, username')
      .eq('id', user.id)
      .single()

    // Get sprint to get pact_id
    const { data: sprint } = await serviceClient
      .from('sprints')
      .select('pact_id')
      .eq('id', submission.sprint_id)
      .single()

    // Get pact members for notifications
    if (sprint) {
      const { data: pactMembers } = await serviceClient
        .from('pact_members')
        .select('user_id')
        .eq('pact_id', sprint.pact_id)
        .eq('status', 'active')

      // Determine file type from file_urls
      const fileUrl = submission.file_urls?.[0];
      const fileType = fileUrl?.includes('image') ? 'image' :
                       fileUrl?.includes('audio') ? 'audio' :
                       fileUrl?.includes('video') ? 'video' : 'file';

      // Create activity notification for all pact members
      if (pactMembers && pactMembers.length > 0) {
        const { error: notifError } = await serviceClient
          .from('notifications')
          .insert(
            pactMembers.map((m) => ({
              user_id: m.user_id,
              type: 'proof_upload',
              title: `${profile?.full_name || profile?.username || 'Someone'} shared a proof`,
              body: `A ${fileType} was uploaded to the pact activity.`,
              data: JSON.stringify({
                proof_url: fileUrl,
                proof_type: fileType,
                uploaded_by: user.id,
              }),
              pact_id: sprint.pact_id,
            }))
          )

        if (notifError) {
          console.error('[Approve Proof API] Error creating notifications:', notifError)
          // Don't fail the request if notification creation fails
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Approve Proof API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
