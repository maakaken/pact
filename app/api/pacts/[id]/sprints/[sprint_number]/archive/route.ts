import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sprint_number: string }> }
) {
  try {
    const { id: pactId, sprint_number } = await params

    if (!pactId || !sprint_number) {
      return NextResponse.json(
        { error: 'Missing pact_id or sprint_number' },
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

    // Verify user is an admin of the pact
    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be an admin to archive a sprint' },
        { status: 403 }
      )
    }

    // Fetch sprint
    const { data: sprint, error: sprintError } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pactId)
      .eq('sprint_number', parseInt(sprint_number))
      .single()

    if (sprintError || !sprint) {
      return NextResponse.json(
        { error: 'Sprint not found' },
        { status: 404 }
      )
    }

    if (sprint.status !== 'completed') {
      return NextResponse.json(
        { error: 'Only completed sprints can be archived' },
        { status: 400 }
      )
    }

    if (sprint.archived) {
      return NextResponse.json(
        { error: 'Sprint is already archived' },
        { status: 400 }
      )
    }

    // Fetch pact details
    const { data: pact } = await serviceClient
      .from('pacts')
      .select('stake_amount')
      .eq('id', pactId)
      .single()

    if (!pact) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Fetch verdicts with profiles
    const { data: verdicts } = await serviceClient
      .from('verdicts')
      .select('*, profiles(full_name)')
      .eq('sprint_id', sprint.id)

    if (!verdicts) {
      return NextResponse.json(
        { error: 'No verdicts found for this sprint' },
        { status: 400 }
      )
    }

    // Fetch goals (just titles and ids for deletion)
    const { data: goals } = await serviceClient
      .from('goals')
      .select('id, title')
      .eq('sprint_number', parseInt(sprint_number))
      .eq('pact_id', pactId)

    // Calculate summary
    const winners = verdicts
      .filter(v => v.outcome === 'passed' || v.outcome === 'sympathy_pass')
      .map(v => ({
        user_id: v.user_id,
        full_name: v.profiles?.full_name || 'Unknown',
        outcome: v.outcome,
        dividend: v.dividend_amount || 0,
      }))

    const losers = verdicts
      .filter(v => v.outcome === 'failed')
      .map(v => ({
        user_id: v.user_id,
        full_name: v.profiles?.full_name || 'Unknown',
        outcome: v.outcome,
        amount_lost: pact.stake_amount,
      }))

    const taskTitles = goals?.map(g => g.title) || []

    const totalPot = verdicts.length * pact.stake_amount
    const platformFee = totalPot * 0.05
    const distributedAmount = totalPot - platformFee

    // Create archive entry
    const { error: archiveError } = await serviceClient
      .from('sprint_archives')
      .insert({
        pact_id: pactId,
        sprint_id: sprint.id,
        sprint_number: parseInt(sprint_number),
        stake_amount: pact.stake_amount,
        total_pot: totalPot,
        platform_fee: platformFee,
        distributed_amount: distributedAmount,
        winner_count: winners.length,
        summary: {
          winners,
          losers,
          tasks: taskTitles,
        },
      })

    if (archiveError) {
      console.error('[Archive Sprint] Error creating archive:', archiveError)
      return NextResponse.json(
        { error: 'Failed to create archive' },
        { status: 500 }
      )
    }

    // Delete detailed data
    // Delete goal votes
    const goalIds = goals?.map(g => g.id) || []
    if (goalIds.length > 0) {
      await serviceClient
        .from('goal_votes')
        .delete()
        .in('goal_id', goalIds)
    }

    // Delete goals
    await serviceClient
      .from('goals')
      .delete()
      .eq('sprint_number', parseInt(sprint_number))
      .eq('pact_id', pactId)

    // Delete submissions
    await serviceClient
      .from('submissions')
      .delete()
      .eq('sprint_id', sprint.id)

    // Delete votes
    await serviceClient
      .from('votes')
      .delete()
      .eq('sprint_id', sprint.id)

    // Delete stakes
    await serviceClient
      .from('stakes')
      .delete()
      .eq('sprint_id', sprint.id)

    // Mark sprint as archived
    await serviceClient
      .from('sprints')
      .update({ archived: true })
      .eq('id', sprint.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Archive Sprint] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
