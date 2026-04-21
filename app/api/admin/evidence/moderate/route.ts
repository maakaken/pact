import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  try {
    const { submissionId, action, rejectionNote, userId } = await request.json()

    if (!submissionId || !action) {
      return NextResponse.json(
        { error: 'Missing submissionId or action' },
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

    // Update submission
    const { error: subError } = await serviceClient
      .from('submissions')
      .update({
        moderation_status: action,
        moderation_note: rejectionNote ?? null,
      })
      .eq('id', submissionId)

    if (subError) {
      return NextResponse.json(
        { error: subError.message },
        { status: 500 }
      )
    }

    // Update moderation queue
    await serviceClient
      .from('moderation_queue')
      .update({ status: 'reviewed' })
      .eq('type', 'evidence_review')
      .eq('submission_id', submissionId)

    // Send notification if rejected
    if (action === 'rejected' && rejectionNote && userId) {
      await serviceClient.from('notifications').insert({
        user_id: userId,
        type: 'verdict_open',
        title: 'Your evidence was rejected',
        body: rejectionNote,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Admin Evidence Moderate API] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
