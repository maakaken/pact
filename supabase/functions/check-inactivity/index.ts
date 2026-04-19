// Supabase Edge Function: check-inactivity
// Scheduled via pg_cron to run every hour

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async () => {
  const now = new Date();

  // Get all active sprints
  const { data: sprints, error: sprintsError } = await supabase
    .from('sprints')
    .select('id, pact_id, ends_at')
    .eq('status', 'active');

  if (sprintsError) {
    return new Response(JSON.stringify({ error: sprintsError.message }), { status: 500 });
  }

  let processed = 0;

  for (const sprint of sprints ?? []) {
    const endsAt = new Date(sprint.ends_at);
    const msUntilEnd = endsAt.getTime() - now.getTime();

    // Get all active members for this pact
    const { data: members } = await supabase
      .from('pact_members')
      .select('user_id')
      .eq('pact_id', sprint.pact_id)
      .eq('status', 'active');

    if (!members?.length) continue;

    for (const member of members) {
      // Check if member has submitted
      const { data: submission } = await supabase
        .from('submissions')
        .select('id')
        .eq('sprint_id', sprint.id)
        .eq('user_id', member.user_id)
        .single();

      if (submission) continue; // Already submitted

      if (msUntilEnd < 0) {
        // Sprint ended — auto-fail
        const { data: existingVerdict } = await supabase
          .from('verdicts')
          .select('id')
          .eq('sprint_id', sprint.id)
          .eq('user_id', member.user_id)
          .single();

        if (!existingVerdict) {
          // Auto-create failed submission
          await supabase.from('submissions').insert({
            sprint_id: sprint.id,
            user_id: member.user_id,
            is_auto_failed: true,
            moderation_status: 'approved',
          });

          // Auto-create failed verdict
          await supabase.from('verdicts').insert({
            sprint_id: sprint.id,
            user_id: member.user_id,
            outcome: 'failed',
            approve_count: 0,
            reject_count: 0,
            sympathy_count: 0,
            stake_returned: false,
          });

          // Forfeit stake
          await supabase
            .from('stakes')
            .update({ status: 'forfeited' })
            .eq('sprint_id', sprint.id)
            .eq('user_id', member.user_id);

          // Update profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('sprints_failed, integrity_score, total_lost')
            .eq('id', member.user_id)
            .single();

          if (profile) {
            const { data: stake } = await supabase
              .from('stakes')
              .select('amount')
              .eq('sprint_id', sprint.id)
              .eq('user_id', member.user_id)
              .single();

            await supabase.from('profiles').update({
              sprints_failed: profile.sprints_failed + 1,
              integrity_score: Math.max(0, profile.integrity_score - 10),
              total_lost: profile.total_lost + (stake?.amount ?? 0),
            }).eq('id', member.user_id);
          }

          // Notify
          await supabase.from('notifications').insert({
            user_id: member.user_id,
            type: 'inactivity_warning',
            title: 'Auto-failed due to inactivity',
            body: 'You did not submit proof before the sprint deadline. Your stake has been forfeited.',
            pact_id: sprint.pact_id,
          });

          processed++;
        }
      } else if (msUntilEnd < 6 * 3600 * 1000) {
        // < 6 hours — urgent warning
        await supabase.from('notifications').insert({
          user_id: member.user_id,
          type: 'inactivity_warning',
          title: '⚠️ Less than 6 hours to submit proof!',
          body: 'Your sprint deadline is almost here. Submit your proof now or your stake will be forfeited.',
          pact_id: sprint.pact_id,
        });
      } else if (msUntilEnd < 24 * 3600 * 1000) {
        // < 24 hours — reminder
        await supabase.from('notifications').insert({
          user_id: member.user_id,
          type: 'proof_due',
          title: 'Proof due in less than 24 hours',
          body: 'Don\'t forget to submit your evidence before the sprint deadline.',
          pact_id: sprint.pact_id,
        });
      }
    }
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
