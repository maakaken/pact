import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find all next_sprint_opt_in notifications older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select('id, user_id, pact_id, created_at')
      .eq('type', 'next_sprint_opt_in')
      .lt('created_at', sevenDaysAgo)
      .is('is_read', false)

    if (notifError) {
      console.error('[Auto-Exit] Error fetching notifications:', notifError)
      return new Response(JSON.stringify({ error: 'Failed to fetch notifications' }), { status: 500 })
    }

    if (!notifications || notifications.length === 0) {
      console.log('[Auto-Exit] No expired notifications found')
      return new Response(JSON.stringify({ message: 'No expired notifications' }), { status: 200 })
    }

    console.log(`[Auto-Exit] Found ${notifications.length} expired notifications`)

    // Process each notification - auto-exit members who didn't respond
    for (const notif of notifications) {
      // Check if user is still an active member
      const { data: member } = await supabase
        .from('pact_members')
        .select('*')
        .eq('pact_id', notif.pact_id)
        .eq('user_id', notif.user_id)
        .eq('status', 'active')
        .single()

      if (member) {
        // Set member to inactive
        const { error: memberError } = await supabase
          .from('pact_members')
          .update({ status: 'inactive' })
          .eq('pact_id', notif.pact_id)
          .eq('user_id', notif.user_id)

        if (memberError) {
          console.error(`[Auto-Exit] Error exiting member ${notif.user_id}:`, memberError)
        } else {
          console.log(`[Auto-Exit] Auto-exited member ${notif.user_id} from pact ${notif.pact_id}`)
        }
      }

      // Mark notification as read
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notif.id)
    }

    return new Response(JSON.stringify({ 
      message: `Processed ${notifications.length} expired notifications`,
      processed: notifications.length 
    }), { status: 200 })

  } catch (err) {
    console.error('[Auto-Exit] Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})
