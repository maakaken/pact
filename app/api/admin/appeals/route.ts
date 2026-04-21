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

    // Fetch appeals without nested joins
    const { data: appealsData, error: appealsError } = await serviceClient
      .from('appeals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (appealsError) {
      console.error('[Admin Appeals API] Error fetching appeals:', appealsError)
      return NextResponse.json(
        { error: appealsError.message },
        { status: 500 }
      )
    }

    if (!appealsData || appealsData.length === 0) {
      return NextResponse.json({ appeals: [] })
    }

    // Fetch profiles for appeal users
    const userIds = appealsData.map(a => a.user_id)
    const { data: profilesData } = await serviceClient
      .from('profiles')
      .select('*')
      .in('id', userIds)

    // Fetch verdicts for appeals
    const verdictIds = appealsData.map(a => a.verdict_id)
    const { data: verdictsData } = verdictIds.length
      ? await serviceClient
        .from('verdicts')
        .select('*')
        .in('id', verdictIds)
      : { data: [] }

    // Fetch sprints for verdicts
    const sprintIds = (verdictsData ?? []).map(v => v.sprint_id)
    const { data: sprintsData } = sprintIds.length
      ? await serviceClient
        .from('sprints')
        .select('id, pact_id')
        .in('id', sprintIds)
      : { data: [] }

    // Fetch pacts for sprints
    const pactIds = (sprintsData ?? []).map(s => s.pact_id)
    const { data: pactsData } = pactIds.length
      ? await serviceClient
        .from('pacts')
        .select('id, name')
        .in('id', pactIds)
      : { data: [] }

    // Group data
    const profilesByUserId = new Map()
    ;(profilesData ?? []).forEach((profile) => {
      profilesByUserId.set(profile.id, profile)
    })

    const verdictsByVerdictId = new Map()
    const pactsByPactId = new Map()
    ;(pactsData ?? []).forEach((pact) => {
      pactsByPactId.set(pact.id, pact)
    })
    const sprintsBySprintId = new Map()
    ;(sprintsData ?? []).forEach((sprint) => {
      sprintsBySprintId.set(sprint.id, {
        pact_id: sprint.pact_id,
        pacts: pactsByPactId.get(sprint.pact_id) ?? null,
      })
    })
    ;(verdictsData ?? []).forEach((verdict) => {
      verdictsByVerdictId.set(verdict.id, {
        ...verdict,
        sprints: sprintsBySprintId.get(verdict.sprint_id) ?? null,
      })
    })

    // Combine data
    const appealsWithDetails = appealsData.map(appeal => ({
      ...appeal,
      profiles: profilesByUserId.get(appeal.user_id) ?? null,
      verdicts: verdictsByVerdictId.get(appeal.verdict_id) ?? null,
    }))

    return NextResponse.json({ appeals: appealsWithDetails })
  } catch (err) {
    console.error('[Admin Appeals API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
