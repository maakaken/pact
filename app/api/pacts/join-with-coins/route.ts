import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  try {
    const { pact_id, invitation_id } = await request.json()

    if (!pact_id || !invitation_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Use service role client to bypass RLS policies for coin operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get pact details
    const { data: pact, error: pactError } = await serviceClient
      .from('pacts')
      .select('*')
      .eq('id', pact_id)
      .single()

    if (pactError || !pact) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Get user's coin balance
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('coin_balance')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    // Check if user has sufficient balance
    if (profile.coin_balance < pact.stake_amount) {
      return NextResponse.json(
        { error: 'Insufficient p-coins balance' },
        { status: 400 }
      )
    }

    // Get current sprint
    const { data: sprint } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pact_id)
      .eq('sprint_number', pact.current_sprint)
      .single()

    if (!sprint) {
      return NextResponse.json(
        { error: 'Current sprint not found' },
        { status: 404 }
      )
    }

    // Deduct coins from user balance
    const { error: balanceError } = await serviceClient
      .from('profiles')
      .update({ coin_balance: profile.coin_balance - pact.stake_amount })
      .eq('id', user.id)

    if (balanceError) {
      console.error('[Join with Coins] Error deducting coins:', balanceError)
      return NextResponse.json(
        { error: 'Failed to deduct coins' },
        { status: 500 }
      )
    }

    // Create stake record
    const { error: stakeError } = await serviceClient
      .from('stakes')
      .insert({
        pact_id,
        sprint_id: sprint.id,
        user_id: user.id,
        amount: pact.stake_amount,
        status: 'locked',
      })

    if (stakeError) {
      console.error('[Join with Coins] Error creating stake:', stakeError)
      // Rollback coin deduction
      await serviceClient
        .from('profiles')
        .update({ coin_balance: profile.coin_balance })
        .eq('id', user.id)
      return NextResponse.json(
        { error: 'Failed to create stake' },
        { status: 500 }
      )
    }

    // Create pact member
    const { error: memberError } = await serviceClient
      .from('pact_members')
      .upsert({
        pact_id,
        user_id: user.id,
        role: 'member',
        status: 'active',
      }, { onConflict: 'pact_id,user_id' })

    if (memberError) {
      console.error('[Join with Coins] Error creating member:', memberError)
    }

    // Mark invitation as accepted
    await serviceClient
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation_id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Join with Coins] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
