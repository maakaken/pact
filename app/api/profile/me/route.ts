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
    const { data: profileData, error: profileError } = await serviceClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('[Profile Me API] Error fetching profile:', profileError)
    }

    // Fetch memberships
    const { data: memberships } = await serviceClient
      .from('pact_members')
      .select('pact_id')
      .eq('user_id', user.id)

    let pacts = []
    if (memberships?.length) {
      const pactIds = memberships.map((m) => m.pact_id)

      // Fetch pacts without nested joins
      const { data: pactsData } = await serviceClient
        .from('pacts')
        .select('*')
        .in('id', pactIds)

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
    console.error('[Profile Me API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
