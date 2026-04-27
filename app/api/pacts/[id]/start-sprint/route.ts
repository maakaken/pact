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

    if (!pactId) {
      return NextResponse.json(
        { error: 'Missing pact_id' },
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
        { error: 'Unauthorized: You must be an admin to start a sprint' },
        { status: 403 }
      )
    }

    // Fetch pact
    const { data: pact, error: pactError } = await serviceClient
      .from('pacts')
      .select('*')
      .eq('id', pactId)
      .single()

    if (pactError || !pact) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Check if pact is in forming state
    if (pact.status !== 'forming') {
      return NextResponse.json(
        { error: 'Pact must be in forming state to start a sprint' },
        { status: 400 }
      )
    }

    // Check if sprint already exists
    const { data: existingSprint } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pactId)
      .eq('sprint_number', 1)
      .maybeSingle()

    if (existingSprint) {
      return NextResponse.json(
        { error: 'Sprint already exists' },
        { status: 400 }
      )
    }

    // Create first sprint
    const startsAt = new Date()
    const endsAt = new Date(startsAt.getTime() + pact.sprint_duration_days * 86400000)
    const verdictEndsAt = new Date(endsAt.getTime() + 48 * 3600000)

    const { error: sprintError } = await serviceClient
      .from('sprints')
      .insert({
        pact_id: pactId,
        sprint_number: 1,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        verdict_ends_at: verdictEndsAt.toISOString(),
        status: 'active',
      })

    if (sprintError) {
      console.error('[Start Sprint API] Error creating sprint:', sprintError)
      return NextResponse.json(
        { error: sprintError.message },
        { status: 500 }
      )
    }

    // Get all active members
    const { data: members } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('status', 'active')

    if (!members || members.length === 0) {
      return NextResponse.json(
        { error: 'No active members found' },
        { status: 400 }
      )
    }

    // Lock coins for each member
    for (const member of members) {
      // Get member's coin balance
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('coin_balance')
        .eq('id', member.user_id)
        .single()

      if (!profile) {
        console.error('[Start Sprint API] Profile not found for member:', member.user_id)
        continue
      }

      // Check if member has sufficient balance
      if (profile.coin_balance < pact.stake_amount) {
        console.error('[Start Sprint API] Insufficient balance for member:', member.user_id)
        return NextResponse.json(
          { error: `Member ${member.user_id} has insufficient p-coins balance` },
          { status: 400 }
        )
      }

      // Deduct coins from member balance
      const { error: balanceError } = await serviceClient
        .from('profiles')
        .update({ coin_balance: profile.coin_balance - pact.stake_amount })
        .eq('id', member.user_id)

      if (balanceError) {
        console.error('[Start Sprint API] Error deducting coins:', balanceError)
        return NextResponse.json(
          { error: 'Failed to deduct coins' },
          { status: 500 }
        )
      }

      // Create stake record
      const { error: stakeError } = await serviceClient
        .from('stakes')
        .insert({
          pact_id: pactId,
          sprint_id: null, // Will be updated after sprint is created
          user_id: member.user_id,
          amount: pact.stake_amount,
          status: 'locked',
        })

      if (stakeError) {
        console.error('[Start Sprint API] Error creating stake:', stakeError)
        // Rollback coin deduction
        await serviceClient
          .from('profiles')
          .update({ coin_balance: profile.coin_balance })
          .eq('id', member.user_id)
        return NextResponse.json(
          { error: 'Failed to create stake' },
          { status: 500 }
        )
      }
    }

    // Update stakes with sprint_id
    const { data: sprintData } = await serviceClient
      .from('sprints')
      .select('id')
      .eq('pact_id', pactId)
      .eq('sprint_number', 1)
      .single()

    if (sprintData) {
      const { error: stakeUpdateError } = await serviceClient
        .from('stakes')
        .update({ sprint_id: sprintData.id })
        .eq('pact_id', pactId)
        .is('sprint_id', null)

      if (stakeUpdateError) {
        console.error('[Start Sprint API] Error updating stakes:', stakeUpdateError)
      }
    }

    // Update pact status to vetting
    const { error: pactUpdateError } = await serviceClient
      .from('pacts')
      .update({ status: 'vetting', current_sprint: 1 })
      .eq('id', pactId)

    if (pactUpdateError) {
      console.error('[Start Sprint API] Error updating pact:', pactUpdateError)
      return NextResponse.json(
        { error: pactUpdateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Start Sprint API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
