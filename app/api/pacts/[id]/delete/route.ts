import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function DELETE(
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

    // Use service role client to bypass RLS policies
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify user is an admin of the pact
    const { data: member, error: memberError } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be an admin to delete this pact' },
        { status: 403 }
      )
    }

    // Check if pact has any active sprints
    const { data: activeSprint, error: sprintError } = await serviceClient
      .from('sprints')
      .select('id, status, verdict_ends_at')
      .eq('pact_id', pactId)
      .order('sprint_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Cannot delete if there's an active sprint (vetting, active, or verdict)
    if (activeSprint && ['vetting', 'active', 'verdict'].includes(activeSprint.status)) {
      return NextResponse.json(
        { error: 'Cannot delete pact with active sprints. Wait for the sprint to complete.' },
        { status: 400 }
      )
    }

    // If sprint is completed, must wait 10 minutes after verdict ends
    // Only apply cooldown if verdict_ends_at is in the past (natural completion)
    // If verdict_ends_at is in the future, it was likely force-completed, so allow deletion
    if (activeSprint && activeSprint.status === 'completed' && activeSprint.verdict_ends_at) {
      const verdictEndTime = new Date(activeSprint.verdict_ends_at).getTime()
      const currentTime = new Date().getTime()
      
      // Only enforce cooldown if verdict has actually ended (is in the past)
      if (verdictEndTime <= currentTime) {
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
    }

    // Delete all related data in correct order due to foreign key constraints
    
    // First, get all sprint IDs for this pact
    const { data: sprints } = await serviceClient
      .from('sprints')
      .select('id')
      .eq('pact_id', pactId)
    
    const sprintIds = sprints?.map(s => s.id) || []
    
    // Delete sprint archives
    const { error: archivesError } = await serviceClient
      .from('sprint_archives')
      .delete()
      .eq('pact_id', pactId)
    if (archivesError) console.error('Error deleting archives:', archivesError)

    // Delete submissions (by sprint_id, not pact_id)
    const { error: submissionsError } = await serviceClient
      .from('submissions')
      .delete()
      .in('sprint_id', sprintIds.length > 0 ? sprintIds : ['00000000-0000-0000-0000-000000000000'])
    if (submissionsError) console.error('Error deleting submissions:', submissionsError)

    // Delete votes (by sprint_id, not pact_id)
    const { error: votesError } = await serviceClient
      .from('votes')
      .delete()
      .in('sprint_id', sprintIds.length > 0 ? sprintIds : ['00000000-0000-0000-0000-000000000000'])
    if (votesError) console.error('Error deleting votes:', votesError)

    // Delete verdicts (by sprint_id, not pact_id)
    const { error: verdictsError } = await serviceClient
      .from('verdicts')
      .delete()
      .in('sprint_id', sprintIds.length > 0 ? sprintIds : ['00000000-0000-0000-0000-000000000000'])
    if (verdictsError) console.error('Error deleting verdicts:', verdictsError)

    // Delete goal votes (by goal_id, need to get goals first)
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
      if (goalVotesError) console.error('Error deleting goal votes:', goalVotesError)
    }

    // Delete goals
    const { error: goalsError } = await serviceClient
      .from('goals')
      .delete()
      .eq('pact_id', pactId)
    if (goalsError) console.error('Error deleting goals:', goalsError)

    // Delete stakes (by sprint_id, not pact_id)
    const { error: stakesError } = await serviceClient
      .from('stakes')
      .delete()
      .in('sprint_id', sprintIds.length > 0 ? sprintIds : ['00000000-0000-0000-0000-000000000000'])
    if (stakesError) console.error('Error deleting stakes:', stakesError)

    // Delete sprints
    const { error: sprintsError } = await serviceClient
      .from('sprints')
      .delete()
      .eq('pact_id', pactId)
    if (sprintsError) console.error('Error deleting sprints:', sprintsError)

    // Delete notifications
    const { error: notificationsError } = await serviceClient
      .from('notifications')
      .delete()
      .eq('pact_id', pactId)
    if (notificationsError) console.error('Error deleting notifications:', notificationsError)

    // Delete pact applications
    const { error: applicationsError } = await serviceClient
      .from('pact_applications')
      .delete()
      .eq('pact_id', pactId)
    if (applicationsError) console.error('Error deleting applications:', applicationsError)

    // Delete moderation queue
    const { error: moderationError } = await serviceClient
      .from('moderation_queue')
      .delete()
      .eq('pact_id', pactId)
    if (moderationError) console.error('Error deleting moderation queue:', moderationError)

    // Delete pact members
    const { error: membersError } = await serviceClient
      .from('pact_members')
      .delete()
      .eq('pact_id', pactId)
    if (membersError) console.error('Error deleting members:', membersError)

    // Delete the pact
    const { error: deleteError } = await serviceClient
      .from('pacts')
      .delete()
      .eq('id', pactId)

    if (deleteError) {
      console.error('Error deleting pact:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete pact', details: deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Delete Pact API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    )
  }
}
