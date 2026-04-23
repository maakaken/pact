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

    // Fetch profile
    const { data: profileData } = await serviceClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    // Fetch user's pact memberships
    const { data: memberships } = await serviceClient
      .from('pact_members')
      .select('pact_id')
      .eq('user_id', user.id)
      .eq('status', 'active')

    let activePacts: any[] = []
    let discoverPacts: any[] = []
    let totalStaked = 0

    if (memberships && memberships.length > 0) {
      const pactIds = memberships.map(m => m.pact_id)

      // Fetch pacts
      const { data: pactsData } = await serviceClient
        .from('pacts')
        .select('*')
        .in('id', pactIds)

      // Fetch sprints in a single query
      const { data: sprintsData } = await serviceClient
        .from('sprints')
        .select('*')
        .in('pact_id', pactIds)
      
      // Build sprint map by matching pact_id and current_sprint
      const sprintMap = new Map()
      ;(pactsData ?? []).forEach((pact) => {
        const sprint = (sprintsData ?? []).find(
          s => s.pact_id === pact.id && s.sprint_number === pact.current_sprint
        )
        sprintMap.set(pact.id, sprint ?? null)
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
      activePacts = (pactsData ?? []).map((pact) => {
        const sprint = sprintMap.get(pact.id) ?? null
        return {
          pact,
          sprint,
          members: membersByPact.get(pact.id) ?? [],
          hasSubmission: sprint ? submittedSprints.has(sprint.id) : false,
        }
      })

      // Total staked
      const { data: stakeRows } = await serviceClient
        .from('stakes')
        .select('amount')
        .eq('user_id', user.id)
        .eq('status', 'locked')
      totalStaked = (stakeRows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)

      // Discover (public pacts not in my list)
      const { data: publicPactsData } = await serviceClient
        .from('pacts')
        .select('*')
        .eq('is_public', true)
        .in('status', ['forming', 'active'])
        .not('id', 'in', `(${pactIds.join(',')})`)
        .order('created_at', { ascending: false })
        .limit(3)
      discoverPacts = publicPactsData ?? []
    } else {
      // No memberships — just fetch discover pacts
      const { data: publicPactsData } = await serviceClient
        .from('pacts')
        .select('*')
        .eq('is_public', true)
        .in('status', ['forming', 'active'])
        .order('created_at', { ascending: false })
        .limit(3)
      discoverPacts = publicPactsData ?? []
    }

    return NextResponse.json({
      profile: profileData,
      activePacts,
      discoverPacts,
      totalStaked,
    })
  } catch (err) {
    console.error('[Lobby API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
