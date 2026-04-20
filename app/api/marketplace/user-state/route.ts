import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET() {
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

    // Use service role client to bypass RLS policies
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch memberships
    const { data: memberships, error: membershipsError } = await serviceClient
      .from('pact_members')
      .select('pact_id')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (membershipsError) {
      console.error('[User State] Error fetching memberships:', membershipsError)
    }

    // Fetch applications
    const { data: applications, error: applicationsError } = await serviceClient
      .from('pact_applications')
      .select('pact_id')
      .eq('user_id', user.id)

    if (applicationsError) {
      console.error('[User State] Error fetching applications:', applicationsError)
    }

    return NextResponse.json({
      memberPactIds: memberships?.map((m) => m.pact_id) ?? [],
      appliedIds: applications?.map((a) => a.pact_id) ?? [],
    })
  } catch (err) {
    console.error('[User State] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
