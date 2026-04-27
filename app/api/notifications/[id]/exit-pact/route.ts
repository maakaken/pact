import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: notificationId } = await params

    if (!notificationId) {
      return NextResponse.json(
        { error: 'Missing notification_id' },
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

    // Verify the notification belongs to the user and is a next_sprint_opt_in type
    const { data: notification } = await serviceClient
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .eq('user_id', user.id)
      .eq('type', 'next_sprint_opt_in')
      .single()

    if (!notification) {
      return NextResponse.json(
        { error: 'Notification not found or invalid type' },
        { status: 404 }
      )
    }

    if (!notification.pact_id) {
      return NextResponse.json(
        { error: 'Notification does not have associated pact_id' },
        { status: 400 }
      )
    }

    // Exit the pact
    const exitRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/pacts/${notification.pact_id}/exit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': (await cookies()).toString(),
      },
    })

    if (!exitRes.ok) {
      const exitJson = await exitRes.json()
      console.error('[Exit Pact Notification API] Error exiting pact:', exitJson)
      return NextResponse.json(
        { error: exitJson.error || 'Failed to exit pact' },
        { status: exitRes.status }
      )
    }

    // Mark notification as read
    await serviceClient
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id)

    return NextResponse.json({ success: true, message: 'You have exited the pact' })
  } catch (err) {
    console.error('[Exit Pact Notification API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
