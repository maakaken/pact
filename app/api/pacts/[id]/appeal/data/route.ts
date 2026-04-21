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
      console.error('[Appeal Data API] Error fetching sprint:', sprintError)
    }

    let verdictData = null
    if (sprintData) {
      const { data: verdict, error: verdictError } = await serviceClient
        .from('verdicts')
        .select('*')
        .eq('sprint_id', sprintData.id)
        .eq('user_id', user.id)
        .single()

      if (verdictError) {
        console.error('[Appeal Data API] Error fetching verdict:', verdictError)
      }

      verdictData = verdict
    }

    return NextResponse.json({ pact: pactData, sprint: sprintData, verdict: verdictData })
  } catch (err) {
    console.error('[Appeal Data API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
