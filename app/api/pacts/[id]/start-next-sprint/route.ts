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
        { error: 'Unauthorized: You must be an admin to start a new sprint' },
        { status: 403 }
      )
    }

    // Fetch pact details
    const { data: pact } = await serviceClient
      .from('pacts')
      .select('current_sprint, sprint_duration_days')
      .eq('id', pactId)
      .single()

    if (!pact) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Check if current sprint is completed
    const { data: currentSprint } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pactId)
      .eq('sprint_number', pact.current_sprint)
      .single()

    if (!currentSprint || currentSprint.status !== 'completed') {
      return NextResponse.json(
        { error: 'Current sprint must be completed before starting a new one' },
        { status: 400 }
      )
    }

    // Create new sprint
    const newSprintNumber = pact.current_sprint + 1
    const startsAt = new Date()
    const endsAt = new Date(startsAt.getTime() + pact.sprint_duration_days * 86400000)
    const verdictEndsAt = new Date(endsAt.getTime() + 48 * 3600000)

    const { error: sprintError } = await serviceClient
      .from('sprints')
      .insert({
        pact_id: pactId,
        sprint_number: newSprintNumber,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        verdict_ends_at: verdictEndsAt.toISOString(),
        status: 'vetting',
      })

    if (sprintError) {
      console.error('[Start Next Sprint API] Error creating sprint:', sprintError)
      return NextResponse.json(
        { error: 'Failed to create new sprint' },
        { status: 500 }
      )
    }

    // Update pact current_sprint
    const { error: pactError } = await serviceClient
      .from('pacts')
      .update({ current_sprint: newSprintNumber, status: 'active' })
      .eq('id', pactId)

    if (pactError) {
      console.error('[Start Next Sprint API] Error updating pact:', pactError)
      return NextResponse.json(
        { error: 'Failed to update pact' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, sprint_number: newSprintNumber })
  } catch (err) {
    console.error('[Start Next Sprint API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
