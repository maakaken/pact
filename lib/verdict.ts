import { createServerClient } from './supabase/server';
import { runLiquidationEngine } from './liquidation';
import { SupabaseClient } from '@supabase/supabase-js';

export async function calculateVerdicts(sprintId: string, client?: SupabaseClient) {
  const supabase = client || createServerClient();

  console.log('[calculateVerdicts] Starting for sprint:', sprintId);

  // Get pact members for this sprint
  const { data: sprint, error: sprintError } = await supabase
    .from('sprints')
    .select('pact_id, status')
    .eq('id', sprintId)
    .single();

  if (sprintError) {
    console.error('[calculateVerdicts] Error fetching sprint:', sprintError);
    throw new Error('Failed to fetch sprint: ' + sprintError.message);
  }

  if (!sprint || sprint.status === 'completed') {
    console.log('[calculateVerdicts] Sprint already completed or not found');
    return;
  }

  const { data: members, error: membersError } = await supabase
    .from('pact_members')
    .select('user_id')
    .eq('pact_id', sprint.pact_id)
    .eq('status', 'active');

  if (membersError) {
    console.error('[calculateVerdicts] Error fetching members:', membersError);
    throw new Error('Failed to fetch members: ' + membersError.message);
  }

  if (!members || members.length === 0) {
    console.log('[calculateVerdicts] No members found');
    return;
  }

  console.log('[calculateVerdicts] Found', members.length, 'members');

  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select('*')
    .eq('sprint_id', sprintId);

  if (submissionsError) {
    console.error('[calculateVerdicts] Error fetching submissions:', submissionsError);
    throw new Error('Failed to fetch submissions: ' + submissionsError.message);
  }

  const { data: votes, error: votesError } = await supabase
    .from('votes')
    .select('*')
    .eq('sprint_id', sprintId);

  if (votesError) {
    console.error('[calculateVerdicts] Error fetching votes:', votesError);
    throw new Error('Failed to fetch votes: ' + votesError.message);
  }

  console.log('[calculateVerdicts] Found', votes?.length || 0, 'votes');

  const totalMembers = members.length;
  const eligibleVoters = totalMembers - 1;

  for (const member of members) {
    // Check if verdict already exists
    const { data: existingVerdict } = await supabase
      .from('verdicts')
      .select('id')
      .eq('sprint_id', sprintId)
      .eq('user_id', member.user_id)
      .single();

    if (existingVerdict) {
      console.log('[calculateVerdicts] Verdict already exists for user:', member.user_id);
      continue;
    }

    // Check for auto-failed submission
    const submission = submissions?.find(
      (s) => s.user_id === member.user_id && s.is_auto_failed
    );

    if (submission?.is_auto_failed) {
      console.log('[calculateVerdicts] Auto-failing user:', member.user_id);
      await supabase.from('verdicts').insert({
        sprint_id: sprintId,
        user_id: member.user_id,
        outcome: 'failed',
        approve_count: 0,
        reject_count: 0,
        sympathy_count: 0,
        stake_returned: false,
      });
      continue;
    }

    // Count votes for this member
    const memberVotes = votes?.filter((v) => v.target_user_id === member.user_id) ?? [];
    const approveCount = memberVotes.filter((v) => v.decision === 'approve').length;
    const rejectCount = memberVotes.filter((v) => v.decision === 'reject').length;
    const sympathyCount = memberVotes.filter((v) => v.decision === 'sympathy').length;

    console.log('[calculateVerdicts] User', member.user_id, 'votes:', { approveCount, rejectCount, sympathyCount });

    let outcome: 'passed' | 'failed' | 'sympathy_pass';
    let sympathyRatio = 0;

    // Calculate sympathy ratio (proportion of voters who chose sympathy)
    if (eligibleVoters > 0) {
      sympathyRatio = sympathyCount / eligibleVoters;
    }

    // Sympathy pass: any sympathy votes result in partial stake return
    // Outcome is 'sympathy_pass' if there are sympathy votes and the member would otherwise fail
    if (sympathyCount > 0 && approveCount < eligibleVoters / 2) {
      outcome = 'sympathy_pass';
    } else if (approveCount >= eligibleVoters / 2) {
      outcome = 'passed';
    } else {
      outcome = 'failed';
    }

    console.log('[calculateVerdicts] User', member.user_id, 'outcome:', outcome);

    const { error: insertError } = await supabase.from('verdicts').insert({
      sprint_id: sprintId,
      user_id: member.user_id,
      outcome,
      approve_count: approveCount,
      reject_count: rejectCount,
      sympathy_count: sympathyCount,
      sympathy_ratio: sympathyRatio,
      stake_returned: false,
    });

    if (insertError) {
      console.error('[calculateVerdicts] Error inserting verdict:', insertError);
      throw new Error('Failed to insert verdict: ' + insertError.message);
    }
  }

  console.log('[calculateVerdicts] All verdicts created, running liquidation');

  // Run liquidation with the same client
  await runLiquidationEngine(sprintId, supabase);

  console.log('[calculateVerdicts] Complete');
}
