import { createClient } from '@supabase/supabase-js';

// Supabase Edge Function: check-inactivity
// Scheduled via pg_cron to run every hour

// Validate required environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async () => {
  try {
    const now = new Date();
    console.log('Starting inactivity check...');

    // Get all active sprints
    const { data: sprints, error: sprintsError } = await supabase
      .from('sprints')
      .select('id, pact_id, ends_at')
      .eq('status', 'active');

    if (sprintsError) {
      console.error('Error fetching sprints:', sprintsError);
      return new Response(JSON.stringify({ error: sprintsError.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let processed = 0;

    for (const sprint of sprints ?? []) {
      const endsAt = new Date(sprint.ends_at);
      const msUntilEnd = endsAt.getTime() - now.getTime();

      // Phase 1: Handle Sprint Transition to Verdict Phase
      if (msUntilEnd < 0) {
        const { data: currentSprint } = await supabase
          .from('sprints')
          .select('status')
          .eq('id', sprint.id)
          .single();

        if (currentSprint?.status === 'active') {
          console.log(`Transitioning sprint ${sprint.id} to verdict_phase`);
          // Transition to verdict_phase
          await supabase.from('sprints')
            .update({ status: 'verdict_phase' })
            .eq('id', sprint.id);

          // Update pact status
          await supabase.from('pacts')
            .update({ status: 'verdict' })
            .eq('id', sprint.pact_id);

          // Send verdict_open notifications to all pact members
          const { data: allMembers } = await supabase
            .from('pact_members')
            .select('user_id')
            .eq('pact_id', sprint.pact_id)
            .eq('status', 'active');

          if (allMembers) {
            const notifications = allMembers.map(m => ({
              user_id: m.user_id,
              type: 'verdict_open',
              title: 'Verdict Phase Open',
              body: 'The sprint has ended. Review submissions and cast your votes.',
              pact_id: sprint.pact_id,
            }));
            await supabase.from('notifications').insert(notifications);
          }
        }
      }

      // Phase 2: Handle Individual Member Inactivity/Auto-fail
      // Get all active members for this pact
      const { data: members } = await supabase
        .from('pact_members')
        .select('user_id')
        .eq('pact_id', sprint.pact_id)
        .eq('status', 'active');

      if (!members?.length) continue;

      for (const member of members) {
        try {
          // Check if member has submitted
          const { data: submission } = await supabase
            .from('submissions')
            .select('id')
            .eq('sprint_id', sprint.id)
            .eq('user_id', member.user_id)
            .single();

          if (submission) continue; // Already submitted

          // Get member's last_seen_at for activity tracking
          const { data: profile } = await supabase
            .from('profiles')
            .select('last_seen_at')
            .eq('id', member.user_id)
            .single();

          const lastSeen = profile?.last_seen_at ? new Date(profile.last_seen_at) : null;
          const daysSinceLastSeen = lastSeen ? Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)) : 999;

          if (msUntilEnd < 0) {
            // Auto-fail logic...
            const { data: existingVerdict } = await supabase
              .from('verdicts')
              .select('id')
              .eq('sprint_id', sprint.id)
              .eq('user_id', member.user_id)
              .single();

            if (!existingVerdict) {
              // ... rest of auto-fail logic unchanged ...

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
              const { data: profileData } = await supabase
                .from('profiles')
                .select('sprints_failed, integrity_score, total_lost')
                .eq('id', member.user_id)
                .single();

              if (profileData) {
                const { data: stake } = await supabase
                  .from('stakes')
                  .select('amount')
                  .eq('sprint_id', sprint.id)
                  .eq('user_id', member.user_id)
                  .single();

                await supabase.from('profiles').update({
                  sprints_failed: profileData.sprints_failed + 1,
                  integrity_score: Math.max(0, profileData.integrity_score - 10),
                  total_lost: profileData.total_lost + (stake?.amount ?? 0),
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
          } else if (daysSinceLastSeen >= 5 && daysSinceLastSeen < 7) {
            // 5+ days inactive — warning
            await supabase.from('notifications').insert({
              user_id: member.user_id,
              type: 'inactivity_warning',
              title: 'Inactivity Warning: 5+ days',
              body: 'You haven\'t been active in 5+ days. Submit proof before the deadline or your stake will be forfeited.',
              pact_id: sprint.pact_id,
            });
          } else if (daysSinceLastSeen >= 3 && daysSinceLastSeen < 5) {
            // 3+ days inactive — reminder
            await supabase.from('notifications').insert({
              user_id: member.user_id,
              type: 'inactivity_warning',
              title: 'Activity Reminder',
              body: 'It\'s been 3+ days since you last checked in. Don\'t forget to submit your proof.',
              pact_id: sprint.pact_id,
            });
          } else if (msUntilEnd < 6 * 3600 * 1000) {
            // < 6 hours — urgent warning
            await supabase.from('notifications').insert({
              user_id: member.user_id,
              type: 'inactivity_warning',
              title: 'Less than 6 hours to submit proof!',
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
        } catch (memberError) {
          console.error(`Error processing member ${member.user_id} in sprint ${sprint.id}:`, memberError);
          // Continue processing other members
        }
      }
    }

    console.log(`Inactivity check completed. Processed ${processed} members.`);
    return new Response(JSON.stringify({ processed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error in check-inactivity function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
});
