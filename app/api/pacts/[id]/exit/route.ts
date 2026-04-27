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

    // Check if user is an active member
    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'You are not an active member of this pact' },
        { status: 400 }
      )
    }

    // Fetch pact details
    const { data: pact } = await serviceClient
      .from('pacts')
      .select('stake_amount, status')
      .eq('id', pactId)
      .single()

    if (!pact) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Fetch current sprint
    const { data: currentSprint } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pactId)
      .order('sprint_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Check if exit is allowed
    // Exit allowed: no sprint exists, or sprint is completed
    // Exit NOT allowed: sprint is active, vetting, or verdict
    if (currentSprint && currentSprint.status !== 'completed') {
      return NextResponse.json(
        { error: 'Cannot exit during an active sprint. Wait for results to be declared.' },
        { status: 400 }
      )
    }

    // If no sprint exists, return reserved coins
    if (!currentSprint) {
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('reserved_coins')
        .eq('id', user.id)
        .single()

      if (profile) {
        const reservedCoins = profile.reserved_coins ?? 0
        const stakeAmount = pact.stake_amount

        // Return reserved coins
        await serviceClient
          .from('profiles')
          .update({ reserved_coins: Math.max(0, reservedCoins - stakeAmount) })
          .eq('id', user.id)
      }
    }

    // Set member status to inactive
    const { error: memberError } = await serviceClient
      .from('pact_members')
      .update({ status: 'inactive' })
      .eq('pact_id', pactId)
      .eq('user_id', user.id)

    if (memberError) {
      console.error('[Exit Pact API] Error updating member status:', memberError)
      return NextResponse.json(
        { error: 'Failed to exit pact' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Exit Pact API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
