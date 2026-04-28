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

    // Fetch stakes without nested joins to avoid RLS recursion
    const { data: stakesData, error: stakesError } = await serviceClient
      .from('stakes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (stakesError) {
      console.error('[Stakes API] Error fetching stakes:', stakesError)
      return NextResponse.json(
        { error: stakesError.message },
        { status: 500 }
      )
    }

    if (!stakesData || stakesData.length === 0) {
      return NextResponse.json({ stakes: [] })
    }

    // Fetch pacts for each stake
    const pactIds = stakesData.map(s => s.pact_id)
    const { data: pactsData, error: pactsError } = await serviceClient
      .from('pacts')
      .select('*')
      .in('id', pactIds)

    if (pactsError) {
      console.error('[Stakes API] Error fetching pacts:', pactsError)
    }

    // Fetch sprints for each stake
    const sprintIds = stakesData.map(s => s.sprint_id).filter(Boolean)
    const { data: sprintsData, error: sprintsError } = sprintIds.length
      ? await serviceClient
        .from('sprints')
        .select('*')
        .in('id', sprintIds)
      : { data: [] }

    if (sprintsError) {
      console.error('[Stakes API] Error fetching sprints:', sprintsError)
    }

    // Fetch verdicts for the user to calculate earnings
    const { data: verdictsData, error: verdictsError } = await serviceClient
      .from('verdicts')
      .select('*')
      .eq('user_id', user.id)

    if (verdictsError) {
      console.error('[Stakes API] Error fetching verdicts:', verdictsError)
    }

    // Calculate total earned from verdicts
    const totalEarned = verdictsData?.reduce((sum, v) => {
      if (v.outcome === 'passed' || v.outcome === 'sympathy_pass') {
        return sum + (v.dividend_amount || 0)
      }
      return sum
    }, 0) ?? 0

    // Calculate total lost from forfeited stakes
    const totalLost = stakesData
      .filter(s => s.status === 'forfeited')
      .reduce((sum, s) => sum + s.amount, 0)

    // Combine data
    const pactsByPactId = new Map(pactsData?.map(p => [p.id, p]) ?? [])
    const sprintsBySprintId = new Map(sprintsData?.map(s => [s.id, s]) ?? [])

    const stakesWithDetails = stakesData.map(stake => ({
      ...stake,
      pacts: pactsByPactId.get(stake.pact_id) ?? null,
      sprints: sprintsBySprintId.get(stake.sprint_id ?? '') ?? null,
    }))

    return NextResponse.json({ stakes: stakesWithDetails, totalEarned, totalLost })
  } catch (err) {
    console.error('[Stakes API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
