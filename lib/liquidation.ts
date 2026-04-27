import { createServerClient } from './supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';

export async function runLiquidationEngine(sprintId: string, client?: SupabaseClient) {
  const supabase = client || createServerClient();

  // Get all verdicts for this sprint
  const { data: verdicts, error: verdictsError } = await supabase
    .from('verdicts')
    .select('*')
    .eq('sprint_id', sprintId);

  if (verdictsError) throw new Error('Failed to fetch verdicts: ' + verdictsError.message);

  if (!verdicts || verdicts.length === 0) {
    console.log('[Liquidation] No verdicts found for sprint, skipping liquidation');
    return { failurePool: 0, distributable: 0, dividend: 0, winnerCount: 0 };
  }

  // Get sprint stakes
  const { data: stakes } = await supabase
    .from('stakes')
    .select('*')
    .eq('sprint_id', sprintId);

  if (!stakes) return;

  const stakeMap = Object.fromEntries(stakes.map((s) => [s.user_id, s]));

  const failedVerdicts = verdicts.filter((v) => v.outcome === 'failed');
  const passedVerdicts = verdicts.filter((v) => v.outcome === 'passed');
  const sympathyVerdicts = verdicts.filter((v) => v.outcome === 'sympathy_pass');

  let failurePool = failedVerdicts.reduce((sum, v) => {
    const stake = stakeMap[v.user_id];
    return sum + (stake?.amount ?? 0);
  }, 0);

  const platformRevenue = failurePool * 0.05;
  const distributable = failurePool - platformRevenue;
  const winnerCount = passedVerdicts.length;
  const dividend = winnerCount > 0 ? distributable / winnerCount : 0;

  // Process passed members - return stake + dividend to coin_balance
  for (const verdict of passedVerdicts) {
    const stake = stakeMap[verdict.user_id];
    if (stake) {
      await supabase
        .from('stakes')
        .update({ status: 'distributed' })
        .eq('id', stake.id);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('coin_balance, sprints_completed, integrity_score')
      .eq('id', verdict.user_id)
      .single();

    if (profile) {
      await supabase
        .from('profiles')
        .update({
          coin_balance: profile.coin_balance + (stake?.amount ?? 0) + dividend,
          sprints_completed: profile.sprints_completed + 1,
          integrity_score: Math.min(100, profile.integrity_score + 2),
        })
        .eq('id', verdict.user_id);
    }

    await supabase
      .from('verdicts')
      .update({ dividend_amount: dividend, stake_returned: true })
      .eq('id', verdict.id);
  }

  // Process failed members - stake is forfeited (already deducted when locked)
  for (const verdict of failedVerdicts) {
    const stake = stakeMap[verdict.user_id];
    if (stake) {
      await supabase
        .from('stakes')
        .update({ status: 'forfeited' })
        .eq('id', stake.id);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('sprints_failed, integrity_score')
      .eq('id', verdict.user_id)
      .single();

    if (profile) {
      await supabase
        .from('profiles')
        .update({
          sprints_failed: profile.sprints_failed + 1,
          integrity_score: Math.max(0, profile.integrity_score - 10),
        })
        .eq('id', verdict.user_id);
    }
  }

  // Process sympathy pass members - proportional stake return
  for (const verdict of sympathyVerdicts) {
    const stake = stakeMap[verdict.user_id];
    let returnAmount = 0;

    if (stake) {
      // Calculate proportional return based on sympathy_ratio
      // sympathy_ratio = number of sympathy votes / total eligible voters
      // If 1 out of 10 voted sympathy, ratio = 0.1, so 10% of stake is returned
      const totalVotes = verdict.approve_count + verdict.reject_count + verdict.sympathy_count;
      const sympathyRatio = totalVotes > 0 ? verdict.sympathy_count / totalVotes : 0;
      returnAmount = stake.amount * sympathyRatio;
      const forfeitedAmount = stake.amount - returnAmount;

      // Update stake status to partially returned
      await supabase
        .from('stakes')
        .update({
          status: 'returned',
          amount_returned: returnAmount,
          amount_forfeited: forfeitedAmount,
        })
        .eq('id', stake.id);

      // Update profile coin_balance with returned amount
      const { data: profile } = await supabase
        .from('profiles')
        .select('coin_balance')
        .eq('id', verdict.user_id)
        .single();

      if (profile && returnAmount > 0) {
        await supabase
          .from('profiles')
          .update({
            coin_balance: profile.coin_balance + returnAmount,
          })
          .eq('id', verdict.user_id);
      }

      // Add forfeited amount to failure pool for distribution
      if (forfeitedAmount > 0) {
        failurePool += forfeitedAmount;
      }
    }

    await supabase
      .from('verdicts')
      .update({ stake_returned: true, amount_returned: returnAmount })
      .eq('id', verdict.id);
  }

  // Mark sprint completed
  await supabase
    .from('sprints')
    .update({ status: 'completed' })
    .eq('id', sprintId);

  // Create verdict_result notifications for all pact members
  const { data: sprint } = await supabase
    .from('sprints')
    .select('pact_id, sprint_number')
    .eq('id', sprintId)
    .single();

  if (sprint) {
    const { data: members } = await supabase
      .from('pact_members')
      .select('user_id')
      .eq('pact_id', sprint.pact_id)
      .eq('status', 'active');

    if (members) {
      const notifications = members.map((m) => ({
        user_id: m.user_id,
        type: 'verdict_result' as const,
        title: 'Sprint Results Are In',
        body: 'The verdict phase is complete. Check your results.',
        pact_id: sprint.pact_id,
      }));

      await supabase.from('notifications').insert(notifications);

      // Create next_sprint_opt_in notifications
      const optInNotifications = members.map((m) => ({
        user_id: m.user_id,
        type: 'next_sprint_opt_in' as const,
        title: 'Next Sprint Starting Soon',
        body: `Sprint ${sprint.sprint_number} is complete. Do you want to participate in the next sprint?`,
        pact_id: sprint.pact_id,
      }));

      await supabase.from('notifications').insert(optInNotifications);
    }

    // Archive the sprint to save space
    try {
      await archiveSprint(sprint.pact_id, sprintId, sprint.sprint_number, supabase);
    } catch (err) {
      console.error('[Liquidation] Error archiving sprint:', err);
      // Don't fail liquidation if archive fails
    }
  }

  return { failurePool, distributable, dividend, winnerCount };
}

async function archiveSprint(pactId: string, sprintId: string, sprintNumber: number, supabase: SupabaseClient) {
  // Fetch pact details
  const { data: pact } = await supabase
    .from('pacts')
    .select('stake_amount')
    .eq('id', pactId)
    .single();

  if (!pact) return;

  // Fetch verdicts with profiles
  const { data: verdicts } = await supabase
    .from('verdicts')
    .select('*, profiles(full_name)')
    .eq('sprint_id', sprintId);

  if (!verdicts) return;

  // Fetch goals (just titles and ids)
  const { data: goals } = await supabase
    .from('goals')
    .select('id, title')
    .eq('sprint_number', sprintNumber)
    .eq('pact_id', pactId);

  // Calculate summary
  const winners = verdicts
    .filter(v => v.outcome === 'passed' || v.outcome === 'sympathy_pass')
    .map(v => ({
      user_id: v.user_id,
      full_name: v.profiles?.full_name || 'Unknown',
      outcome: v.outcome,
      dividend: v.dividend_amount || 0,
    }));

  const losers = verdicts
    .filter(v => v.outcome === 'failed')
    .map(v => ({
      user_id: v.user_id,
      full_name: v.profiles?.full_name || 'Unknown',
      outcome: v.outcome,
      amount_lost: pact.stake_amount,
    }));

  const taskTitles = goals?.map(g => g.title) || [];

  const totalPot = verdicts.length * pact.stake_amount;
  const platformFee = totalPot * 0.05;
  const distributedAmount = totalPot - platformFee;

  // Create archive entry
  await supabase
    .from('sprint_archives')
    .insert({
      pact_id: pactId,
      sprint_id: sprintId,
      sprint_number: sprintNumber,
      stake_amount: pact.stake_amount,
      total_pot: totalPot,
      platform_fee: platformFee,
      distributed_amount: distributedAmount,
      winner_count: winners.length,
      summary: {
        winners,
        losers,
        tasks: taskTitles,
      },
    });

  // Delete detailed data
  const goalIds = goals?.map(g => g.id) || [];
  if (goalIds.length > 0) {
    await supabase
      .from('goal_votes')
      .delete()
      .in('goal_id', goalIds);
  }

  await supabase
    .from('goals')
    .delete()
    .eq('sprint_number', sprintNumber)
    .eq('pact_id', pactId);

  await supabase
    .from('submissions')
    .delete()
    .eq('sprint_id', sprintId);

  await supabase
    .from('votes')
    .delete()
    .eq('sprint_id', sprintId);

  await supabase
    .from('stakes')
    .delete()
    .eq('sprint_id', sprintId);

  // Mark sprint as archived
  await supabase
    .from('sprints')
    .update({ archived: true })
    .eq('id', sprintId);
}
