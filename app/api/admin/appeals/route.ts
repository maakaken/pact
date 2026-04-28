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

    // Fetch group integrity scores for pacts involved in appeals
    const appealPactIds = pactIds as string[]
    const groupMembersData = appealPactIds.length > 0
      ? await serviceClient
        .from('pact_members')
        .select('pact_id, user_id')
        .in('pact_id', appealPactIds)
      : { data: [] }

    const groupMembers = groupMembersData.data ?? []

    // Fetch profiles for all group members to calculate group integrity score
    const groupUserIds = groupMembers.map((m: any) => m.user_id)
    const groupProfilesData = groupUserIds.length > 0
      ? await serviceClient
        .from('profiles')
        .select('id, integrity_score')
        .in('id', groupUserIds)
      : { data: [] }

    const groupProfiles = groupProfilesData.data ?? []

    // Calculate group integrity score (average of all members)
    const profilesById = new Map()
    groupProfiles.forEach((p: any) => profilesById.set(p.id, p.integrity_score))

    const groupIntegrityByPactId = new Map()
    const pactIdsSet = new Set(appealPactIds)
    pactIdsSet.forEach((pId: string) => {
      const pIdMembers = groupMembers.filter((gm: any) => gm.pact_id === pId)
      const scores = pIdMembers.map((gm: any) => profilesById.get(gm.user_id) ?? 0)
      const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0
      groupIntegrityByPactId.set(pId, avgScore)
    })

    // Fetch profiles for appeal users
    const userIds = appealsData.map(a => a.user_id)
    const { data: profilesData } = await serviceClient
      .from('profiles')
      .select('*')
      .in('id', userIds)

    // Group data
    const profilesByUserId = new Map()
    ;(profilesData ?? []).forEach((profile) => {
      profilesByUserId.set(profile.id, profile)
    })

    const verdictsByVerdictId = new Map()
    const pactsByPactIdMap = new Map()
    ;(pactsData ?? []).forEach((pact) => {
      pactsByPactIdMap.set(pact.id, pact)
    })
    const sprintsBySprintId = new Map()
    ;(sprintsData ?? []).forEach((sprint) => {
      sprintsBySprintId.set(sprint.id, {
        pact_id: sprint.pact_id,
        pacts: pactsByPactIdMap.get(sprint.pact_id) ?? null,
      })
    })
    ;(verdictsData ?? []).forEach((verdict) => {
      verdictsByVerdictId.set(verdict.id, {
        ...verdict,
        sprints: sprintsBySprintId.get(verdict.sprint_id) ?? null,
      })
    })

    // Combine data
    const appealsWithDetails = appealsData.map((appeal: any) => {
      const verdict = verdictsByVerdictId.get(appeal.verdict_id)
      const pactId = verdict?.sprints?.pact_id
      const groupIntegrityScore = pactId ? groupIntegrityByPactId.get(pactId) : 0

      return {
        ...appeal,
        profiles: profilesByUserId.get(appeal.user_id) ?? null,
        verdicts: verdict,
        group_integrity_score: groupIntegrityScore,
      }
    })

    return NextResponse.json({ appeals: appealsWithDetails })
  } catch (err) {
    console.error('[Admin Appeals API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
