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
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      )
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
