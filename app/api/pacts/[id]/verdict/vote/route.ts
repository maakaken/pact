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
    const body = await request.json()
    const { sprint_id, submission_id, target_user_id, decision } = body

    if (!pactId || !sprint_id || !target_user_id || !decision) {
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
        { error: 'Unauthorized: You must be a member of this pact to vote' },
        { status: 403 }
      )
    }

    // Upsert vote
    const { error: voteError } = await serviceClient
      .from('votes')
      .upsert(
        {
          sprint_id,
          submission_id,
          voter_id: user.id,
          target_user_id,
          decision,
        },
        { onConflict: 'sprint_id,voter_id,target_user_id' }
      )

    if (voteError) {
      console.error('[Vote API] Error inserting vote:', voteError)
      return NextResponse.json(
        { error: voteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Vote API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
