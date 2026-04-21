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

    // Fetch pact to get current sprint
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

    // Fetch current sprint
    const { data: sprint } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pactId)
      .eq('sprint_number', pact.current_sprint)
      .single()

    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found' },
        { status: 404 }
      )
    }

    // Fetch submissions without nested joins
    const { data: submissionsData, error: submissionsError } = await serviceClient
      .from('submissions')
      .select('*')
      .eq('sprint_id', sprint.id)

    if (submissionsError) {
      console.error('[Verdict Submissions API] Error fetching submissions:', submissionsError)
      return NextResponse.json(
        { error: submissionsError.message },
        { status: 500 }
      )
    }

    if (!submissionsData || submissionsData.length === 0) {
      return NextResponse.json({ submissions: [], votes: [] })
    }

    // Fetch profiles for submission users
    const userIds = submissionsData.map(s => s.user_id)
    const { data: profilesData } = await serviceClient
      .from('profiles')
      .select('*')
      .in('id', userIds)

    // Fetch goals for submissions
    const goalIds = submissionsData.map(s => s.goal_id).filter(Boolean)
    const { data: goalsData } = goalIds.length
      ? await serviceClient
        .from('goals')
        .select('*')
        .in('id', goalIds)
      : { data: [] }

    // Fetch votes
    const { data: votesData } = await serviceClient
      .from('votes')
      .select('*')
      .eq('sprint_id', sprint.id)

    // Group data
    const profilesByUserId = new Map()
    ;(profilesData ?? []).forEach((profile) => {
      profilesByUserId.set(profile.id, profile)
    })

    const goalsByGoalId = new Map()
    ;(goalsData ?? []).forEach((goal) => {
      goalsByGoalId.set(goal.id, goal)
    })

    // Combine data
    const submissionsWithDetails = submissionsData.map(submission => ({
      ...submission,
      profiles: profilesByUserId.get(submission.user_id) ?? null,
      goals: goalsByGoalId.get(submission.goal_id ?? '') ?? null,
    }))

    return NextResponse.json({ submissions: submissionsWithDetails, votes: votesData ?? [] })
  } catch (err) {
    console.error('[Verdict Submissions API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
