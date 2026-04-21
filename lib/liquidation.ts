import { createServerClient } from './supabase/server';

export async function runLiquidationEngine(sprintId: string) {
  const supabase = createServerClient();

  // Get all verdicts for this sprint
  const { data: verdicts, error: verdictsError } = await supabase
    .from('verdicts')
    .select('*, stakes(*)')
    .eq('sprint_id', sprintId);

  if (verdictsError || !verdicts) throw new Error('Failed to fetch verdicts');

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

  // Process passed members
  for (const verdict of passedVerdicts) {
    const stake = stakeMap[verdict.user_id];
    if (stake) {
      await supabase
        .from('stakes')
        .update({ status: 'distributed' })
        .eq('id', stake.id);
    }

    await supabase
      .from('profiles')
      .update({
        total_earned: supabase.rpc('increment_total_earned', {
          user_id: verdict.user_id,
          amount: (stake?.amount ?? 0) + dividend,
        }),
      })
      .eq('id', verdict.user_id);

    // Direct update instead of RPC for simplicity
    const { data: profile } = await supabase
      .from('profiles')
      .select('total_earned, sprints_completed, integrity_score')
      .eq('id', verdict.user_id)
      .single();

    if (profile) {
      await supabase
        .from('profiles')
        .update({
          total_earned: profile.total_earned + (stake?.amount ?? 0) + dividend,
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

  // Process failed members
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
      .select('total_lost, sprints_failed, integrity_score')
      .eq('id', verdict.user_id)
      .single();

    if (profile) {
      await supabase
        .from('profiles')
        .update({
          total_lost: profile.total_lost + (stake?.amount ?? 0),
          sprints_failed: profile.sprints_failed + 1,
          integrity_score: Math.max(0, profile.integrity_score - 10),
        })
        .eq('id', verdict.user_id);
    }
  }

  // Process sympathy pass members - proportional stake return
  for (const verdict of sympathyVerdicts) {
    const stake = stakeMap[verdict.user_id];
    if (stake) {
      // Calculate proportional return based on sympathy_ratio
      // sympathy_ratio = number of sympathy votes / total eligible voters
      // If 1 out of 10 voted sympathy, ratio = 0.1, so 10% of stake is returned
      const sympathyRatio = verdict.sympathy_ratio ?? 0;
      const returnAmount = stake.amount * sympathyRatio;
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

      // Update profile with returned amount
      const { data: profile } = await supabase
        .from('profiles')
        .select('total_earned')
        .eq('id', verdict.user_id)
        .single();

      if (profile && returnAmount > 0) {
        await supabase
          .from('profiles')
          .update({
            total_earned: profile.total_earned + returnAmount,
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
      .update({ stake_returned: true, amount_returned: stake?.amount * (verdict.sympathy_ratio ?? 0) })
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
    .select('pact_id')
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
    }
  }

  return { failurePool, distributable, dividend, winnerCount };
}
