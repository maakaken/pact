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
    const { application_id, pact_id, user_id: applicant_user_id } = body

    if (!application_id || !pact_id || !applicant_user_id) {
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
        { error: 'Unauthorized: You must be an admin to approve applications' },
        { status: 403 }
      )
    }

    // Update the application status
    const { error: updateError } = await serviceClient
      .from('pact_applications')
      .update({ status: 'approved' })
      .eq('id', application_id)
      .eq('pact_id', pact_id)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // Add the user as a member
    const { error: memberError } = await serviceClient
      .from('pact_members')
      .insert({
        pact_id,
        user_id: applicant_user_id,
        role: 'member',
        status: 'active',
      })

    if (memberError) {
      return NextResponse.json(
        { error: memberError.message },
        { status: 500 }
      )
    }

    // Send notification to the applicant
    await serviceClient.from('notifications').insert({
      user_id: applicant_user_id,
      type: 'application_approved',
      title: 'Application Approved',
      body: 'Your application to join the pact has been approved!',
      pact_id,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
