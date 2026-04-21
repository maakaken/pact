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

    // Use service role client to bypass RLS
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

    // Get sprint IDs for this pact
    const { data: sprints } = await serviceClient
      .from('sprints')
      .select('id')
      .eq('pact_id', pactId)

    const sprintIds = sprints?.map((s) => s.id) ?? []

    // Fetch proof submissions (submissions with null goal_id)
    const { data: proofSubmissions, error: proofError } = await serviceClient
      .from('submissions')
      .select('*, profiles(full_name, username, avatar_url)')
      .is('goal_id', null)
      .eq('moderation_status', 'pending')
      .order('submitted_at', { ascending: false })
      .limit(20)

    if (proofError) {
      console.error('[Proof Submissions API] Error fetching submissions:', proofError)
      return NextResponse.json(
        { error: proofError.message },
        { status: 500 }
      )
    }

    // Filter proof submissions by sprint_id
    const filteredProofSubmissions = (proofSubmissions ?? []).filter((sub: any) => sprintIds.includes(sub.sprint_id));

    return NextResponse.json({
      submissions: filteredProofSubmissions,
    })
  } catch (err) {
    console.error('[Proof Submissions API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
