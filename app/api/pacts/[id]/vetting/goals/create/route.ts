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

    const body = await request.json()
    const {
      title,
      description,
      measurable_outcome,
      proof_specification,
    } = body

    if (!title || !measurable_outcome || !proof_specification) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Fetch pact to get current sprint number
    const { data: pact } = await serviceClient
      .from('pacts')
      .select('*')
      .eq('id', pactId)
      .single()

    if (!pact) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }

    // Create goal
    const { data: newGoal, error: goalError } = await serviceClient
      .from('goals')
      .insert({
        pact_id: pactId,
        user_id: user.id,
        sprint_number: pact.current_sprint,
        title,
        description: description || null,
        measurable_outcome,
        proof_specification,
        status: 'pending_approval',
        moderation_status: 'pending',
      })
      .select()
      .single()

    if (goalError || !newGoal) {
      console.error('[Create Goal API] Error creating goal:', goalError)
      return NextResponse.json(
        { error: goalError?.message || 'Failed to create goal' },
        { status: 500 }
      )
    }

    // Insert vote for own goal
    await serviceClient.from('goal_votes').insert({
      goal_id: newGoal.id,
      voter_id: user.id,
      pact_id: pactId,
      sprint_number: pact.current_sprint,
      decision: 'approved',
    })

    return NextResponse.json({ goal: newGoal })
  } catch (err) {
    console.error('[Create Goal API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
