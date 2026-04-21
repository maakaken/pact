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

    // Verify user is a member of the pact (any member can trigger this, not just admin)
    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of this pact' },
        { status: 403 }
      )
    }

    // Fetch pact with members
    const { data: pact, error: pactError } = await serviceClient
      .from('pacts')
      .select('*, members:pact_members(*)')
      .eq('id', pactId)
      .single()

    if (pactError || !pact) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Check if pact is in vetting state
    if (pact.status !== 'vetting') {
      return NextResponse.json(
        { error: 'Pact must be in vetting state to complete vetting' },
        { status: 400 }
      )
    }

    // Fetch current sprint
    const { data: sprint } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pactId)
      .eq('sprint_number', pact.current_sprint)
      .single()

    if (!sprint) {
      return NextResponse.json(
        { error: 'Current sprint not found' },
        { status: 404 }
      )
    }

    // Verify vetting is actually complete
    const { data: goals } = await serviceClient
      .from('goals')
      .select('*')
      .eq('pact_id', pactId)
      .eq('sprint_number', pact.current_sprint)

    if (!goals || goals.length === 0) {
      return NextResponse.json(
        { error: 'No goals found for current sprint' },
        { status: 400 }
      )
    }

    // Check all goals are cleared by moderation
    const allCleared = goals.every((g: any) => g.moderation_status === 'cleared')
    if (!allCleared) {
      return NextResponse.json(
        { error: 'Not all goals have been cleared by moderation' },
        { status: 400 }
      )
    }

    // Log goal statuses for debugging
    console.log('[Complete Vetting] Goal statuses:', goals.map(g => ({
      id: g.id,
      user_id: g.user_id,
      status: g.status,
      moderation_status: g.moderation_status
    })))

    // Check all goals are approved (status === 'approved')
    const allApproved = goals.every((g: any) => g.status === 'approved')
    if (!allApproved) {
      console.log('[Complete Vetting] Not all goals approved. Goal statuses:', goals.map(g => ({ id: g.id, status: g.status })))
      return NextResponse.json(
        { error: 'Not all goals have been approved' },
        { status: 400 }
      )
    }

    // Update pact status to active
    const { error: pactUpdateError } = await serviceClient
      .from('pacts')
      .update({ status: 'active' })
      .eq('id', pactId)

    if (pactUpdateError) {
      console.error('[Complete Vetting API] Error updating pact:', pactUpdateError)
      return NextResponse.json(
        { error: pactUpdateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Complete Vetting API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
