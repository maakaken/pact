import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    // Use service role client to bypass RLS policies
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch pacts without nested join
    const { data: pactsData, error: pactsError } = await serviceClient
      .from('pacts')
      .select('*')
      .eq('is_public', true)
      .in('status', ['forming', 'vetting', 'active'])
      .order('created_at', { ascending: false })

    if (pactsError) {
      console.error('[Marketplace API] Error fetching pacts:', pactsError)
      return NextResponse.json(
        { error: pactsError.message },
        { status: 500 }
      )
    }

    if (!pactsData || pactsData.length === 0) {
      return NextResponse.json({ pacts: [] })
    }

    // Fetch members for each pact
    const pactIds = pactsData.map(p => p.id)
    const { data: membersData, error: membersError } = await serviceClient
      .from('pact_members')
      .select('*, profiles(*)')
      .in('pact_id', pactIds)
      .eq('status', 'active')

    if (membersError) {
      console.error('[Marketplace API] Error fetching members:', membersError)
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
