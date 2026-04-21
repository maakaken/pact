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

    // Fetch submissions without nested joins
    const { data: submissionsData, error: submissionsError } = await serviceClient
      .from('submissions')
      .select('*')
      .eq('moderation_status', 'pending')
      .eq('is_auto_failed', false)
      .order('submitted_at', { ascending: true })

    if (submissionsError) {
      console.error('[Admin Evidence API] Error fetching submissions:', submissionsError)
      return NextResponse.json(
        { error: submissionsError.message },
        { status: 500 }
      )
    }

    if (!submissionsData || submissionsData.length === 0) {
      return NextResponse.json({ submissions: [] })
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

    // Fetch sprints for submissions
    const sprintIds = submissionsData.map(s => s.sprint_id)
    const { data: sprintsData } = sprintIds.length
      ? await serviceClient
        .from('sprints')
        .select('*')
        .in('id', sprintIds)
      : { data: [] }

    // Fetch pacts for sprints
    const pactIds = (sprintsData ?? []).map(s => s.pact_id)
    const { data: pactsData } = pactIds.length
      ? await serviceClient
        .from('pacts')
        .select('*')
        .in('id', pactIds)
      : { data: [] }

    // Group data
    const profilesByUserId = new Map()
    ;(profilesData ?? []).forEach((profile) => {
      profilesByUserId.set(profile.id, profile)
    })

    const goalsByGoalId = new Map()
    ;(goalsData ?? []).forEach((goal) => {
      goalsByGoalId.set(goal.id, goal)
    })

    const sprintsBySprintId = new Map()
    const pactsByPactId = new Map()
    ;(pactsData ?? []).forEach((pact) => {
      pactsByPactId.set(pact.id, pact)
    })
    ;(sprintsData ?? []).forEach((sprint) => {
      sprintsBySprintId.set(sprint.id, {
        ...sprint,
        pacts: pactsByPactId.get(sprint.pact_id) ?? null,
      })
    })

    // Combine data
    const submissionsWithDetails = submissionsData.map(submission => ({
      ...submission,
      profiles: profilesByUserId.get(submission.user_id) ?? null,
      goals: goalsByGoalId.get(submission.goal_id ?? '') ?? null,
      sprints: sprintsBySprintId.get(submission.sprint_id) ?? null,
    }))

    return NextResponse.json({ submissions: submissionsWithDetails })
  } catch (err) {
    console.error('[Admin Evidence API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
