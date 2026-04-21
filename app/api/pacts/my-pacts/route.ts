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

    // Fetch user's pact memberships
    const { data: memberships, error: membershipsError } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (membershipsError) {
      console.error('[My Pacts API] Error fetching memberships:', membershipsError)
      return NextResponse.json(
        { error: membershipsError.message },
        { status: 500 }
      )
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ pacts: [] })
    }

    const pactIds = memberships.map(m => m.pact_id)

    // Fetch pacts
    const { data: pactsData, error: pactsError } = await serviceClient
      .from('pacts')
      .select('*')
      .in('id', pactIds)

    if (pactsError) {
      console.error('[My Pacts API] Error fetching pacts:', pactsError)
    }

    // Fetch sprints
    const sprintResults = await Promise.all(
      (pactsData ?? []).map((p) =>
        serviceClient
          .from('sprints')
          .select('*')
          .eq('pact_id', p.id)
          .eq('sprint_number', p.current_sprint)
          .maybeSingle()
      )
    )
    const sprintMap = new Map()
    ;(pactsData ?? []).forEach((p, i) => {
      sprintMap.set(p.id, sprintResults[i].data ?? null)
    })

    // Fetch members without nested joins
    const { data: allMembers } = await serviceClient
      .from('pact_members')
      .select('*')
      .in('pact_id', pactIds)
      .eq('status', 'active')

    // Fetch profiles for members
    const memberUserIds = (allMembers ?? []).map(m => m.user_id)
    const { data: profilesData } = memberUserIds.length
      ? await serviceClient
        .from('profiles')
        .select('*')
        .in('id', memberUserIds)
      : { data: [] }

    // Group profiles by user_id
    const profilesByUserId = new Map()
    ;(profilesData ?? []).forEach((profile) => {
      profilesByUserId.set(profile.id, profile)
    })

    // Group members by pact_id
    const membersByPact = new Map()
    ;(allMembers ?? []).forEach((member) => {
      if (!membersByPact.has(member.pact_id)) {
        membersByPact.set(member.pact_id, [])
      }
      membersByPact.get(member.pact_id).push({
        ...member,
        profiles: profilesByUserId.get(member.user_id) ?? null,
      })
    })

    // Fetch submissions
    const sprintIds = Array.from(sprintMap.values())
      .filter((s): s is any => !!s)
      .map((s) => s.id)
    const { data: submissions } = sprintIds.length
      ? await serviceClient
        .from('submissions')
        .select('sprint_id')
        .eq('user_id', user.id)
        .in('sprint_id', sprintIds)
      : { data: [] }
    const submittedSprints = new Set((submissions ?? []).map((s) => s.sprint_id))

    // Combine data
    const pactsWithDetails = (pactsData ?? []).map((pact) => ({
      pact,
      sprint: sprintMap.get(pact.id) ?? null,
      members: membersByPact.get(pact.id) ?? [],
      hasSubmission: (sprintMap.get(pact.id)?.id ?? '') in submittedSprints,
    }))

    return NextResponse.json({ pacts: pactsWithDetails })
  } catch (err) {
    console.error('[My Pacts API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
