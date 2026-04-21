import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET() {
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
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Use service role client to bypass RLS policies
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch goals without nested joins
    const { data: goalsData, error: goalsError } = await serviceClient
      .from('goals')
      .select('*')
      .eq('moderation_status', 'pending')
      .order('created_at', { ascending: true })

    if (goalsError) {
      console.error('[Admin Goals API] Error fetching goals:', goalsError)
      return NextResponse.json(
        { error: goalsError.message },
        { status: 500 }
      )
    }

    if (!goalsData || goalsData.length === 0) {
      return NextResponse.json({ goals: [] })
    }

    // Fetch profiles for goal users
    const userIds = goalsData.map(g => g.user_id)
    const { data: profilesData } = await serviceClient
      .from('profiles')
      .select('*')
      .in('id', userIds)

    // Fetch pacts for goals
    const pactIds = goalsData.map(g => g.pact_id)
    const { data: pactsData } = await serviceClient
      .from('pacts')
      .select('*')
      .in('id', pactIds)

    // Group data
    const profilesByUserId = new Map()
    ;(profilesData ?? []).forEach((profile) => {
      profilesByUserId.set(profile.id, profile)
    })

    const pactsByPactId = new Map()
    ;(pactsData ?? []).forEach((pact) => {
      pactsByPactId.set(pact.id, pact)
    })

    // Combine data
    const goalsWithDetails = goalsData.map(goal => ({
      ...goal,
      profiles: profilesByUserId.get(goal.user_id) ?? null,
      pacts: pactsByPactId.get(goal.pact_id) ?? null,
    }))

    return NextResponse.json({ goals: goalsWithDetails })
  } catch (err) {
    console.error('[Admin Goals API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
