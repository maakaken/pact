import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pactId } = await params

    if (!pactId) {
      return NextResponse.json(
        { error: 'Missing pact_id' },
        { status: 400 }
      )
    }

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

    // Verify user is a member of the pact
    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of this pact' },
        { status: 403 }
      )
    }

    // Fetch pact
    const { data: pactData, error: pactError } = await serviceClient
      .from('pacts')
      .select('*')
      .eq('id', pactId)
      .single()

    if (pactError || !pactData) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Fetch sprint
    const { data: sprintData, error: sprintError } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pactId)
      .eq('sprint_number', pactData.current_sprint)
      .single()

    if (sprintError) {
      console.error('[Results API] Error fetching sprint:', sprintError)
    }

    let verdicts = []
    if (sprintData) {
      // Fetch verdicts without nested joins
      const { data: verdictsData } = await serviceClient
        .from('verdicts')
        .select('*')
        .eq('sprint_id', sprintData.id)

      if (verdictsData && verdictsData.length > 0) {
        // Fetch profiles for verdict users
        const userIds = verdictsData.map(v => v.user_id)
        const { data: profilesData } = await serviceClient
          .from('profiles')
          .select('*')
          .in('id', userIds)

        // Group profiles by user_id
        const profilesByUserId = new Map()
        ;(profilesData ?? []).forEach((profile) => {
          profilesByUserId.set(profile.id, profile)
        })

        // Combine data
        verdicts = verdictsData.map(verdict => ({
          ...verdict,
          profiles: profilesByUserId.get(verdict.user_id) ?? null,
        }))
      }
    }

    return NextResponse.json({ pact: pactData, sprint: sprintData, verdicts })
  } catch (err) {
    console.error('[Results API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
