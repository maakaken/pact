import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(
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

    // Verify user is a member of the pact
    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of this pact' },
        { status: 403 }
      )
    }

    // Fetch pact to get current sprint number
    const { data: pact } = await serviceClient
      .from('pacts')
      .select('*')
      .eq('id', pactId)
      .single()

    if (!pact) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Fetch goals without nested joins
    const { data: goalsData, error: goalsError } = await serviceClient
      .from('goals')
      .select('*')
      .eq('pact_id', pactId)
      .eq('sprint_number', pact.current_sprint)

    if (goalsError) {
      console.error('[Vetting Goals API] Error fetching goals:', goalsError)
      return NextResponse.json(
        { error: goalsError.message },
        { status: 500 }
      )
    }

    if (!goalsData || goalsData.length === 0) {
      return NextResponse.json({ goals: [] })
    }

    // Fetch goal votes
    const goalIds = goalsData.map(g => g.id)
    const { data: votesData } = await serviceClient
      .from('goal_votes')
      .select('*, profiles(*)')
      .in('goal_id', goalIds)

    // Fetch profiles for goal creators
    const userIds = goalsData.map(g => g.user_id)
    const { data: profilesData } = await serviceClient
      .from('profiles')
      .select('*')
      .in('id', userIds)

    // Group votes by goal_id
    const votesByGoalId = new Map()
    ;(votesData ?? []).forEach((vote) => {
      if (!votesByGoalId.has(vote.goal_id)) {
        votesByGoalId.set(vote.goal_id, [])
      }
      votesByGoalId.get(vote.goal_id).push(vote)
    })

    // Group profiles by user_id
    const profilesByUserId = new Map()
    ;(profilesData ?? []).forEach((profile) => {
      profilesByUserId.set(profile.id, profile)
    })

    // Combine data
    const goalsWithDetails = goalsData.map(goal => ({
      ...goal,
      goal_votes: votesByGoalId.get(goal.id) ?? [],
      profiles: profilesByUserId.get(goal.user_id) ?? null,
    }))

    return NextResponse.json({ goals: goalsWithDetails })
  } catch (err) {
    console.error('[Vetting Goals API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
