import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: goalId } = await params

    if (!goalId) {
      return NextResponse.json(
        { error: 'Missing goal_id' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { action } = body

    if (!action || !['cleared', 'flagged', 'change_requested'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
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

    // Use service role client to bypass RLS policies
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch goal to get pact_id
    const { data: goal } = await serviceClient
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .single()

    if (!goal) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      )
    }

    // Verify user is an admin of the pact
    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', goal.pact_id)
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be an admin to moderate goals' },
        { status: 403 }
      )
    }

    // Update goal moderation status
    const { error: updateError } = await serviceClient
      .from('goals')
      .update({
        moderation_status: action,
        status: action === 'change_requested' ? 'revision_requested' : goal.status,
      })
      .eq('id', goalId)

    if (updateError) {
      console.error('[Clear Goal API] Error updating goal:', updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // Update moderation_queue status
    await serviceClient
      .from('moderation_queue')
      .update({ status: 'reviewed' })
      .eq('type', 'goal_review')
      .eq('goal_id', goalId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Clear Goal API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
