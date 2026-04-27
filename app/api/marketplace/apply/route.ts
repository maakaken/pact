import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  try {
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
        { error: 'Unauthorized: You must be logged in' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { pact_id } = body

    if (!pact_id) {
      return NextResponse.json(
        { error: 'Missing pact_id' },
        { status: 400 }
      )
    }

    // Use service role client to bypass RLS policies
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Check if user already has a pending application
    const { data: existingApplication } = await serviceClient
      .from('pact_applications')
      .select('*')
      .eq('pact_id', pact_id)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingApplication) {
      return NextResponse.json(
        { error: 'You already have a pending application for this pact' },
        { status: 400 }
      )
    }

    // Check if user is already a member
    const { data: existingMember } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pact_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (existingMember) {
      return NextResponse.json(
        { error: 'You are already a member of this pact' },
        { status: 400 }
      )
    }

    // Fetch pact to get stake amount
    const { data: pact, error: pactError } = await serviceClient
      .from('pacts')
      .select('stake_amount, created_by')
      .eq('id', pact_id)
      .single()

    if (pactError || !pact) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Check user's coin balance
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('coin_balance')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    const stakeAmount = pact.stake_amount
    const coinBalance = profile.coin_balance ?? 0

    if (coinBalance < stakeAmount) {
      return NextResponse.json(
        { error: `Insufficient p-coins. You have 🪙 ${coinBalance.toLocaleString('en-IN')} p-coins, but need 🪙 ${stakeAmount.toLocaleString('en-IN')} p-coins to join this pact.` },
        { status: 400 }
      )
    }

    // Deduct coins from user's balance
    const { error: balanceError } = await serviceClient
      .from('profiles')
      .update({ coin_balance: coinBalance - stakeAmount })
      .eq('id', user.id)

    if (balanceError) {
      console.error('[Marketplace Apply] Error deducting coins:', balanceError)
      return NextResponse.json(
        { error: 'Failed to deduct coins' },
        { status: 500 }
      )
    }

    // Create stake entry (locked status, no stripe_payment_intent_id)
    const { error: stakeError } = await serviceClient
      .from('stakes')
      .insert({
        pact_id,
        sprint_id: null, // Will be updated when sprint starts
        user_id: user.id,
        amount: stakeAmount,
        stripe_payment_intent_id: null,
        status: 'locked',
      })

    if (stakeError) {
      console.error('[Marketplace Apply] Error creating stake:', stakeError)
      // Rollback coin deduction
      await serviceClient
        .from('profiles')
        .update({ coin_balance: coinBalance })
        .eq('id', user.id)
      return NextResponse.json(
        { error: 'Failed to create stake' },
        { status: 500 }
      )
    }

    // Insert the application
    const { error: insertError } = await serviceClient
      .from('pact_applications')
      .insert({
        pact_id,
        user_id: user.id,
        status: 'pending',
      })

    if (insertError) {
      console.error('[Marketplace Apply] Error inserting application:', insertError)
      // Rollback coin deduction and stake
      await serviceClient
        .from('profiles')
        .update({ coin_balance: coinBalance })
        .eq('id', user.id)
      await serviceClient
        .from('stakes')
        .delete()
        .eq('pact_id', pact_id)
        .eq('user_id', user.id)
        .eq('status', 'locked')
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      )
    }

    // Fetch pact to get creator (already fetched above)

    if (pact?.created_by) {
      // Fetch applicant's profile for notification
      const { data: applicantProfile } = await serviceClient
        .from('profiles')
        .select('full_name, username')
        .eq('id', user.id)
        .single()

      const applicantName = applicantProfile?.full_name || applicantProfile?.username || 'Someone'

      console.log('[Marketplace Apply] Sending notification to pact creator:', {
        pact_id,
        pact_creator_id: pact.created_by,
        applicant_id: user.id,
        applicant_name: applicantName,
      })

      // Send notification to pact creator
      const { error: notifError } = await serviceClient.from('notifications').insert({
        user_id: pact.created_by,
        type: 'application_received',
        title: 'New Application Received',
        body: `${applicantName} has applied to join your pact`,
        pact_id,
      })

      if (notifError) {
        console.error('[Marketplace Apply] Failed to send notification:', notifError)
      } else {
        console.log('[Marketplace Apply] Notification sent successfully')
      }
    } else {
      console.log('[Marketplace Apply] No pact creator found, skipping notification')
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Marketplace Apply] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
