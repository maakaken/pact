import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  try {
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

    const body = await request.json()
    const { application_id, pact_id } = body

    if (!application_id || !pact_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Use service role client to bypass RLS policies
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify the current user is an admin of the pact
    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pact_id)
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be an admin to reject applications' },
        { status: 403 }
      )
    }

    // Get the application to find the applicant's user_id
    const { data: application } = await serviceClient
      .from('pact_applications')
      .select('*')
      .eq('id', application_id)
      .single()

    if (!application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      )
    }

    // Update the application status
    const { error: updateError } = await serviceClient
      .from('pact_applications')
      .update({ status: 'rejected' })
      .eq('id', application_id)
      .eq('pact_id', pact_id)

    if (updateError) {
      console.error('[Reject Application] Error updating application:', updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // Send notification to the applicant
    await serviceClient.from('notifications').insert({
      user_id: application.user_id,
      type: 'application_rejected',
      title: 'Application Rejected',
      body: 'Your application to join the pact was not approved.',
      pact_id,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Reject Application] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
