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
    const { sprint_id, file_urls, external_links, caption } = body

    if (!sprint_id) {
      return NextResponse.json(
        { error: 'Missing sprint_id' },
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

    // Verify user is an active member of the pact
    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be an active member of this pact' },
        { status: 403 }
      )
    }

    // Fetch sprint to get sprint_number
    const { data: sprint } = await serviceClient
      .from('sprints')
      .select('sprint_number')
      .eq('id', sprint_id)
      .single()

    if (!sprint) {
      return NextResponse.json(
        { error: 'Sprint not found' },
        { status: 404 }
      )
    }

    // Fetch goal_id
    const { data: goalData } = await serviceClient
      .from('goals')
      .select('id')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('sprint_number', sprint.sprint_number)
      .single()

    // Insert submission
    const { data: newSub, error: subError } = await serviceClient
      .from('submissions')
      .insert({
        sprint_id,
        user_id: user.id,
        goal_id: goalData?.id ?? null,
        caption: caption?.trim() || null,
        file_urls: file_urls && file_urls.length > 0 ? file_urls : null,
        external_links: external_links && external_links.length > 0 ? external_links : null,
        moderation_status: 'pending',
        is_auto_failed: false,
      })
      .select()
      .single()

    if (subError || !newSub) {
      console.error('[Submit Proof API] Error inserting submission:', subError)
      return NextResponse.json(
        { error: 'Failed to submit proof' },
        { status: 500 }
      )
    }

    // Insert into moderation_queue
    await serviceClient.from('moderation_queue').insert({
      type: 'evidence_review',
      submission_id: newSub.id,
      pact_id: pactId,
      user_id: user.id,
      status: 'pending',
    })

    return NextResponse.json({ success: true, submission: newSub })
  } catch (err) {
    console.error('[Submit Proof API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
