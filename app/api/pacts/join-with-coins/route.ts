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

    // Get user's coin balance (available + reserved)
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('coin_balance, reserved_coins')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    // Check if user has sufficient balance (available + reserved)
    const coinBalance = profile.coin_balance ?? 0
    const reservedCoins = profile.reserved_coins ?? 0
    const totalAvailable = coinBalance + reservedCoins

    if (totalAvailable < pact.stake_amount) {
      return NextResponse.json(
        { error: `Insufficient p-coins balance. You have 🪙 ${coinBalance.toLocaleString('en-IN')} available + 🪙 ${reservedCoins.toLocaleString('en-IN')} reserved, but need 🪙 ${pact.stake_amount.toLocaleString('en-IN')} p-coins.` },
        { status: 400 }
      )
    }

    // Reserve coins for this pact
    const { error: reserveError } = await serviceClient
      .from('profiles')
      .update({ reserved_coins: reservedCoins + pact.stake_amount })
      .eq('id', user.id)

    if (reserveError) {
      console.error('[Join with Coins] Error reserving coins:', reserveError)
      return NextResponse.json(
        { error: 'Failed to reserve coins' },
        { status: 500 }
      )
    }

    // Get current sprint (for reference only, no stake creation)
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
