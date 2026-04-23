import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    // Use service role client to bypass RLS policies
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch pacts and members in parallel
    const [pactsResult, membersResult] = await Promise.all([
      serviceClient
        .from('pacts')
        .select('*')
        .eq('is_public', true)
        .in('status', ['forming', 'vetting', 'active'])
        .order('created_at', { ascending: false }),
      serviceClient
        .from('pact_members')
        .select('*, profiles(*)')
        .eq('status', 'active')
    ])

    if (pactsResult.error) {
      console.error('[Marketplace API] Error fetching pacts:', pactsResult.error)
      return NextResponse.json(
        { error: pactsResult.error.message },
        { status: 500 }
      )
    }

    const pactsData = pactsResult.data
    if (!pactsData || pactsData.length === 0) {
      return NextResponse.json({ pacts: [] })
    }

    const membersData = membersResult.data ?? []
    const pactIds = pactsData.map(p => p.id)

    if (membersResult.error) {
      console.error('[Marketplace API] Error fetching members:', membersResult.error)
      // Return pacts without members if members fetch fails
      return NextResponse.json({
        pacts: pactsData.map(p => ({ ...p, pact_members: [] }))
      })
    }

    // Group members by pact_id
    const membersByPact = new Map<string, typeof membersData>()
    ;(membersData ?? []).forEach(member => {
      if (!membersByPact.has(member.pact_id)) {
        membersByPact.set(member.pact_id, [])
      }
      membersByPact.get(member.pact_id)!.push(member)
    })

    // Combine pacts with their members
    const pactsWithMembers = pactsData.map(pact => ({
      ...pact,
      pact_members: membersByPact.get(pact.id) ?? []
    }))

    return NextResponse.json({ pacts: pactsWithMembers })
  } catch (err) {
    console.error('[Marketplace API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
