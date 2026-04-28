import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('[Exit Pact API] Received request')
    const { id: pactId } = await params
    console.log('[Exit Pact API] pactId:', pactId)

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
    console.log('[Exit Pact API] User:', user?.id, 'authError:', authError)

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
    console.log('[Exit Pact API] Checking membership for user:', user.id, 'pact:', pactId)
    const { data: member, error: memberError } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    console.log('[Exit Pact API] Member:', member, 'Error:', memberError)

    if (!member) {
      console.log('[Exit Pact API] User not an active member:', user.id, pactId)
      return NextResponse.json(
        { error: 'You are not an active member of this pact' },
        { status: 400 }
      )
    }

    // Fetch pact details
    console.log('[Exit Pact API] Fetching pact:', pactId)
    const { data: pact, error: pactError } = await serviceClient
      .from('pacts')
      .select('stake_amount, status')
      .eq('id', pactId)
      .single()

    console.log('[Exit Pact API] Pact:', pact, 'Error:', pactError)

    if (!pact) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Fetch current sprint
    console.log('[Exit Pact API] Fetching sprint for pact:', pactId)
    const { data: currentSprint, error: sprintError } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pactId)
      .order('sprint_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    console.log('[Exit Pact API] Sprint:', currentSprint, 'Error:', sprintError)

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
    // TODO: Re-enable once reserved_coins column is confirmed to exist in database
    if (!currentSprint) {
      try {
        // Check if reserved_coins column exists by trying to select it
        const { data: profile, error: profileError } = await serviceClient
          .from('profiles')
          .select('reserved_coins')
          .eq('id', user.id)
          .single()

        if (profile && !profileError && profile.reserved_coins !== undefined) {
          const reservedCoins = profile.reserved_coins ?? 0
          const stakeAmount = pact.stake_amount

          // Return reserved coins
          const { error: updateError } = await serviceClient
            .from('profiles')
            .update({ reserved_coins: Math.max(0, reservedCoins - stakeAmount) })
            .eq('id', user.id)

          if (updateError) {
            console.error('[Exit Pact API] Error updating reserved coins:', updateError)
            // Continue anyway, don't block exit if coin update fails
          }
        } else if (profileError) {
          console.error('[Exit Pact API] Error fetching profile for reserved coins:', profileError)
          // Continue anyway, don't block exit if profile fetch fails
        }
      } catch (err) {
        console.error('[Exit Pact API] Error handling reserved coins:', err)
        // Continue anyway, don't block exit if reserved coins handling fails
      }
    }

    // Set member status to removed (database constraint only allows 'active' or 'removed')
    console.log('[Exit Pact API] Setting member status to removed')
    const { error: updateError } = await serviceClient
      .from('pact_members')
      .update({ status: 'removed' })
      .eq('pact_id', pactId)
      .eq('user_id', user.id)

    console.log('[Exit Pact API] Update result:', updateError)

    if (updateError) {
      console.error('[Exit Pact API] Error updating member status:', updateError)
      return NextResponse.json(
        { error: 'Failed to exit pact', details: updateError.message },
        { status: 500 }
      )
    }

    console.log('[Exit Pact API] Exit successful for user:', user.id, 'pact:', pactId)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Exit Pact API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    )
  }
}
