import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(
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

    // Verify user is an admin of the pact
    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be an admin to reopen a sprint' },
        { status: 403 }
      )
    }

    // Get current sprint in verdict_phase
    const { data: sprint, error: sprintError } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pactId)
      .eq('status', 'verdict_phase')
      .single()

    if (sprintError || !sprint) {
      return NextResponse.json(
        { error: 'No sprint in verdict phase found' },
        { status: 404 }
      )
    }

    // Update sprint status back to active
    const { error: updateSprintError } = await serviceClient
      .from('sprints')
      .update({ status: 'active' })
      .eq('id', sprint.id)

    if (updateSprintError) {
      console.error('[Reopen Sprint] Error updating sprint:', updateSprintError)
      return NextResponse.json(
        { error: updateSprintError.message },
        { status: 500 }
      )
    }

    // Update pact status back to active
    const { error: updatePactError } = await serviceClient
      .from('pacts')
      .update({ status: 'active' })
      .eq('id', pactId)

    if (updatePactError) {
      console.error('[Reopen Sprint] Error updating pact:', updatePactError)
      return NextResponse.json(
        { error: updatePactError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Reopen Sprint] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
