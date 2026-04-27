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
        { error: 'Unauthorized: You must be an admin to force end voting' },
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

    console.log('[Force End Voting] Found sprint:', sprint.id)

    // Calculate verdicts using service client to bypass RLS
    try {
      await calculateVerdicts(sprint.id, serviceClient)
      console.log('[Force End Voting] Verdicts calculated')
    } catch (verdictError) {
      console.error('[Force End Voting] Verdict calculation error:', verdictError)
      return NextResponse.json(
        { error: 'Failed to calculate verdicts', details: String(verdictError) },
        { status: 500 }
      )
    }

    // Update pact status to completed
    const { error: updatePactError } = await serviceClient
      .from('pacts')
      .update({ status: 'completed' })
      .eq('id', pactId)

    if (updatePactError) {
      console.error('[Force End Voting] Error updating pact:', updatePactError)
      return NextResponse.json(
        { error: updatePactError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Force End Voting] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
