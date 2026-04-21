import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; goalId: string }> }
) {
  try {
    const { id: pactId, goalId } = await params

    if (!pactId || !goalId) {
      return NextResponse.json(
        { error: 'Missing pact_id or goal_id' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { decision, comment } = body

    if (!decision || !['approved', 'change_requested'].includes(decision)) {
      return NextResponse.json(
        { error: 'Invalid decision' },
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

    // Fetch goal to get sprint_number
    const { data: goal } = await serviceClient
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .single()

    if (!goal) {
      return NextResponse.json(
        { error: 'Goal not found' },
        { status: 404 }
      )
    }

    // Check if user already voted
    const { data: existingVote } = await serviceClient
      .from('goal_approvals')
      .select('*')
      .eq('goal_id', goalId)
      .eq('reviewer_id', user.id)
      .maybeSingle()

    if (existingVote) {
      return NextResponse.json(
        { error: 'You have already voted on this goal' },
        { status: 400 }
      )
    }

    // Insert goal approval
    const { error: insertError } = await serviceClient
      .from('goal_approvals')
      .insert({
        goal_id: goalId,
        reviewer_id: user.id,
        decision,
        comment: comment ?? null,
      })

    if (insertError) {
      console.error('[Approve Goal API] Error inserting approval:', insertError)
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Approve Goal API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
