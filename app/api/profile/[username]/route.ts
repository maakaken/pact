import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params

    if (!username) {
      return NextResponse.json(
        { error: 'Missing username' },
        { status: 400 }
      )
    }

    // Use service role client to bypass RLS policies
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch profile
    const { data: profileData, error: profileError } = await serviceClient
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (profileError || !profileData) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    // Fetch memberships
    const { data: memberships } = await serviceClient
      .from('pact_members')
      .select('pact_id')
      .eq('user_id', profileData.id)

    let pacts = []
    if (memberships?.length) {
      const pactIds = memberships.map((m) => m.pact_id)

      // Fetch pacts without nested joins
      const { data: pactsData } = await serviceClient
        .from('pacts')
        .select('*')
        .in('id', pactIds)
        .eq('is_public', true)

      if (pactsData) {
        // Fetch pact members separately
        const { data: membersData } = await serviceClient
          .from('pact_members')
          .select('*')
          .in('pact_id', pactIds)

        // Group members by pact_id
        const membersByPactId = new Map()
        ;(membersData ?? []).forEach((member) => {
          if (!membersByPactId.has(member.pact_id)) {
            membersByPactId.set(member.pact_id, [])
          }
          membersByPactId.get(member.pact_id).push(member)
        })

        // Combine pacts with their members
        pacts = pactsData.map((pact) => ({
          ...pact,
          pact_members: membersByPactId.get(pact.id) ?? [],
        }))
      }
    }

    return NextResponse.json({ profile: profileData, pacts })
  } catch (err) {
    console.error('[Profile API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
