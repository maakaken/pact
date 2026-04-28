import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('[Delete Pact API] Received request')
    const { id: pactId } = await params
    console.log('[Delete Pact API] pactId:', pactId)

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
    console.log('[Delete Pact API] User:', user?.id, 'authError:', authError)

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

    // Verify user is an admin of the pact
    console.log('[Delete Pact API] Checking admin status for user:', user.id)
    const { data: member, error: memberError } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    console.log('[Delete Pact API] Member:', member, 'Error:', memberError)

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be an admin to delete this pact' },
        { status: 403 }
      )
    }

    // Check if pact has any active sprints
    console.log('[Delete Pact API] Checking for active sprints')
    const { data: activeSprint, error: sprintError } = await serviceClient
      .from('sprints')
      .select('id, status, verdict_ends_at')
      .eq('pact_id', pactId)
      .order('sprint_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    console.log('[Delete Pact API] Latest sprint:', activeSprint, 'Error:', sprintError)

    // Cannot delete if there's an active sprint (vetting, active, or verdict)
    if (activeSprint && ['vetting', 'active', 'verdict'].includes(activeSprint.status)) {
      return NextResponse.json(
        { error: 'Cannot delete pact with active sprints. Wait for the sprint to complete.' },
        { status: 400 }
      )
    }

    // If sprint is completed, must wait 10 minutes after verdict ends
    if (activeSprint && activeSprint.status === 'completed' && activeSprint.verdict_ends_at) {
      const verdictEndTime = new Date(activeSprint.verdict_ends_at).getTime()
      const currentTime = new Date().getTime()
      const tenMinutesInMs = 10 * 60 * 1000
      const waitUntil = verdictEndTime + tenMinutesInMs
      
      if (currentTime < waitUntil) {
        const remainingMinutes = Math.ceil((waitUntil - currentTime) / (60 * 1000))
        return NextResponse.json(
          { error: `Cannot delete pact yet. Please wait ${remainingMinutes} more minutes after results are declared.` },
          { status: 400 }
        )
      }
    }

    // Delete all related data in correct order due to foreign key constraints
    console.log('[Delete Pact API] Starting deletion of related data')
    
    // First, get all sprint IDs for this pact
    const { data: sprints } = await serviceClient
      .from('sprints')
      .select('id')
      .eq('pact_id', pactId)
    
    const sprintIds = sprints?.map(s => s.id) || []
    console.log('[Delete Pact API] Sprint IDs to delete:', sprintIds)
    
    // Delete sprint archives
    console.log('[Delete Pact API] Deleting sprint archives')
    const { error: archivesError } = await serviceClient
      .from('sprint_archives')
      .delete()
      .eq('pact_id', pactId)
    if (archivesError) console.error('[Delete Pact API] Archives error:', archivesError)

    // Delete submissions (by sprint_id, not pact_id)
    console.log('[Delete Pact API] Deleting submissions')
    const { error: submissionsError } = await serviceClient
      .from('submissions')
      .delete()
      .in('sprint_id', sprintIds.length > 0 ? sprintIds : ['00000000-0000-0000-0000-000000000000'])
    if (submissionsError) console.error('[Delete Pact API] Submissions error:', submissionsError)

    // Delete votes (by sprint_id, not pact_id)
    console.log('[Delete Pact API] Deleting votes')
    const { error: votesError } = await serviceClient
      .from('votes')
      .delete()
      .in('sprint_id', sprintIds.length > 0 ? sprintIds : ['00000000-0000-0000-0000-000000000000'])
    if (votesError) console.error('[Delete Pact API] Votes error:', votesError)

    // Delete verdicts (by sprint_id, not pact_id)
    console.log('[Delete Pact API] Deleting verdicts')
    const { error: verdictsError } = await serviceClient
      .from('verdicts')
      .delete()
      .in('sprint_id', sprintIds.length > 0 ? sprintIds : ['00000000-0000-0000-0000-000000000000'])
    if (verdictsError) console.error('[Delete Pact API] Verdicts error:', verdictsError)

    // Delete goal votes (by goal_id, need to get goals first)
    console.log('[Delete Pact API] Deleting goal votes')
    const { data: goals } = await serviceClient
      .from('goals')
      .select('id')
      .eq('pact_id', pactId)
    const goalIds = goals?.map(g => g.id) || []
    if (goalIds.length > 0) {
      const { error: goalVotesError } = await serviceClient
        .from('goal_votes')
        .delete()
        .in('goal_id', goalIds)
      if (goalVotesError) console.error('[Delete Pact API] Goal votes error:', goalVotesError)
    }

    // Delete goals
    console.log('[Delete Pact API] Deleting goals')
    const { error: goalsError } = await serviceClient
      .from('goals')
      .delete()
      .eq('pact_id', pactId)
    if (goalsError) console.error('[Delete Pact API] Goals error:', goalsError)

    // Delete stakes (by sprint_id, not pact_id)
    console.log('[Delete Pact API] Deleting stakes')
    const { error: stakesError } = await serviceClient
      .from('stakes')
      .delete()
      .in('sprint_id', sprintIds.length > 0 ? sprintIds : ['00000000-0000-0000-0000-000000000000'])
    if (stakesError) console.error('[Delete Pact API] Stakes error:', stakesError)

    // Delete sprints
    console.log('[Delete Pact API] Deleting sprints')
    const { error: sprintsError } = await serviceClient
      .from('sprints')
      .delete()
      .eq('pact_id', pactId)
    if (sprintsError) console.error('[Delete Pact API] Sprints error:', sprintsError)

    // Delete notifications
    console.log('[Delete Pact API] Deleting notifications')
    const { error: notificationsError } = await serviceClient
      .from('notifications')
      .delete()
      .eq('pact_id', pactId)
    if (notificationsError) console.error('[Delete Pact API] Notifications error:', notificationsError)

    // Delete pact applications
    console.log('[Delete Pact API] Deleting pact applications')
    const { error: applicationsError } = await serviceClient
      .from('pact_applications')
      .delete()
      .eq('pact_id', pactId)
    if (applicationsError) console.error('[Delete Pact API] Applications error:', applicationsError)

    // Delete moderation queue
    console.log('[Delete Pact API] Deleting moderation queue')
    const { error: moderationError } = await serviceClient
      .from('moderation_queue')
      .delete()
      .eq('pact_id', pactId)
    if (moderationError) console.error('[Delete Pact API] Moderation queue error:', moderationError)

    // Delete pact members
    console.log('[Delete Pact API] Deleting pact members')
    const { error: membersError } = await serviceClient
      .from('pact_members')
      .delete()
      .eq('pact_id', pactId)
    if (membersError) console.error('[Delete Pact API] Members error:', membersError)

    // Delete the pact
    console.log('[Delete Pact API] Deleting pact')
    const { error: deleteError } = await serviceClient
      .from('pacts')
      .delete()
      .eq('id', pactId)

    console.log('[Delete Pact API] Delete pact error:', deleteError)

    if (deleteError) {
      console.error('[Delete Pact API] Error deleting pact:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete pact', details: deleteError.message },
        { status: 500 }
      )
    }

    console.log('[Delete Pact API] Pact deleted successfully')
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Delete Pact API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    )
  }
}
