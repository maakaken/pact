import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pactId } = await params

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

    // Use service role client
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify user is an admin
    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin only' },
        { status: 403 }
      )
    }

    // Get current sprint
    const { data: pact } = await serviceClient
      .from('pacts')
      .select('current_sprint')
      .eq('id', pactId)
      .single()

    if (!pact) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Get all goals in current sprint
    const { data: goals } = await serviceClient
      .from('goals')
      .select('*')
      .eq('pact_id', pactId)
      .eq('sprint_number', pact.current_sprint)

    if (!goals) {
      return NextResponse.json(
        { error: 'No goals found' },
        { status: 404 }
      )
    }

    // Get all members who submitted goals
    const memberIds = goals.map((g) => g.user_id)

    console.log('[Recalculate Statuses] Members with goals:', memberIds)

    const updatedGoals = []

    // Recalculate status for each goal
    for (const goal of goals) {
      // Get votes for this goal
      const { data: votes } = await serviceClient
        .from('goal_votes')
        .select('voter_id')
        .eq('goal_id', goal.id)
        .eq('decision', 'approved')

      const voterIds = votes?.map((v) => v.voter_id) ?? []

      // Exclude goal owner from required voters
      const requiredVoters = memberIds.filter((id) => id !== goal.user_id)

      // Check if all other members who submitted goals have approved
      const allApproved = requiredVoters.length > 0 && requiredVoters.every((id) => voterIds.includes(id))

      console.log('[Recalculate Statuses] Goal check:', {
        goalId: goal.id,
        goalOwnerId: goal.user_id,
        currentStatus: goal.status,
        requiredVoters,
        voterIds,
        allApproved,
      })

      // Update status if needed
      if (allApproved && goal.status !== 'approved') {
        const { error: updateError } = await serviceClient
          .from('goals')
          .update({ status: 'approved' })
          .eq('id', goal.id)

        if (updateError) {
          console.error('[Recalculate Statuses] Error updating goal:', updateError)
        } else {
          updatedGoals.push(goal.id)
          console.log('[Recalculate Statuses] Updated goal to approved:', goal.id)
        }
      }
    }

    return NextResponse.json({
      success: true,
      updatedGoals,
      message: `Updated ${updatedGoals.length} goals to approved status`
    })
  } catch (err) {
    console.error('[Recalculate Statuses] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
