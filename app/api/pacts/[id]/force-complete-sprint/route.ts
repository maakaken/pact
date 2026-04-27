import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { calculateVerdicts } from '@/lib/verdict'

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
        { error: 'Unauthorized: You must be an admin to force complete a sprint' },
        { status: 403 }
      )
    }

    // Get current active sprint
    const { data: sprint, error: sprintError } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pactId)
      .in('status', ['active', 'verdict_phase'])
      .single()

    if (sprintError) {
      console.error('[Force Complete Sprint] Sprint error:', sprintError)
      return NextResponse.json(
        { error: 'No active sprint found', details: sprintError.message },
        { status: 404 }
      )
    }

    if (!sprint) {
      return NextResponse.json(
        { error: 'No active sprint found' },
        { status: 404 }
      )
    }

    console.log('[Force Complete Sprint] Found sprint:', sprint.id)

    // Update sprint status to verdict_phase
    const { error: updateSprintError } = await serviceClient
      .from('sprints')
      .update({ status: 'verdict_phase' })
      .eq('id', sprint.id)

    if (updateSprintError) {
      console.error('[Force Complete Sprint] Error updating sprint:', updateSprintError)
      return NextResponse.json(
        { error: updateSprintError.message },
        { status: 500 }
      )
    }

    // Update pact status to verdict
    const { error: updatePactError } = await serviceClient
      .from('pacts')
      .update({ status: 'verdict' })
      .eq('id', pactId)

    if (updatePactError) {
      console.error('[Force Complete Sprint] Error updating pact:', updatePactError)
      return NextResponse.json(
        { error: updatePactError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Force Complete Sprint] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
