import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  try {
    const { goalId, action, note, goalUserId, pactId } = await request.json()

    if (!goalId || !action) {
      return NextResponse.json(
        { error: 'Missing goalId or action' },
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

    // Update goal
    const goalUpdate: any = {
      moderation_status: action === 'change_requested' ? 'flagged' : action,
    }
    if (action === 'change_requested') {
      goalUpdate.status = 'revision_requested'
    }

    const { error: goalError } = await serviceClient
      .from('goals')
      .update(goalUpdate)
      .eq('id', goalId)

    if (goalError) {
      return NextResponse.json(
        { error: goalError.message },
        { status: 500 }
      )
    }

    // Update moderation queue
    await serviceClient
      .from('moderation_queue')
      .update({ status: 'reviewed' })
      .eq('type', 'goal_review')
      .eq('goal_id', goalId)

    // Send notification if needed
    if (action === 'change_requested' && note && goalUserId) {
      await serviceClient.from('notifications').insert({
        user_id: goalUserId,
        type: 'goal_approval_needed',
        title: 'Changes requested for your goal',
        body: note,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Admin Goals Moderate API] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
