import { createServerClient } from './supabase/server';
import { runLiquidationEngine } from './liquidation';

export async function calculateVerdicts(sprintId: string) {
  const supabase = createServerClient();

  // Get pact members for this sprint
  const { data: sprint } = await supabase
    .from('sprints')
    .select('pact_id, status')
    .eq('id', sprintId)
    .single();

  if (!sprint || sprint.status === 'completed') return;

  const { data: members } = await supabase
    .from('pact_members')
    .select('user_id')
    .eq('pact_id', sprint.pact_id)
    .eq('status', 'active');

  if (!members || members.length === 0) return;

  const { data: submissions } = await supabase
    .from('submissions')
    .select('*')
    .eq('sprint_id', sprintId);

  const { data: votes } = await supabase
    .from('votes')
    .select('*')
    .eq('sprint_id', sprintId);

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

    if (existingVerdict) continue;

    // Check for auto-failed submission
    const submission = submissions?.find(
      (s) => s.user_id === member.user_id && s.is_auto_failed
    );

    if (submission?.is_auto_failed) {
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

    let outcome: 'passed' | 'failed' | 'sympathy_pass';

    // Sympathy pass: every eligible voter chose sympathy, no rejects
    if (
      sympathyCount === eligibleVoters &&
      rejectCount === 0 &&
      eligibleVoters > 0
    ) {
      outcome = 'sympathy_pass';
    } else if (approveCount >= eligibleVoters / 2) {
      outcome = 'passed';
    } else {
      outcome = 'failed';
    }

    await supabase.from('verdicts').insert({
      sprint_id: sprintId,
      user_id: member.user_id,
      outcome,
      approve_count: approveCount,
      reject_count: rejectCount,
      sympathy_count: sympathyCount,
      stake_returned: false,
    });
  }

  // Run liquidation
  await runLiquidationEngine(sprintId);
}
