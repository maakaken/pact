import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { calculateVerdicts } from '@/lib/verdict';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const results = [];

    // Phase 1: Transition active sprints to verdict_phase when sprint ends
    const { data: activeSprints, error: activeError } = await supabase
      .from('sprints')
      .select('id, pact_id, ends_at')
      .eq('status', 'active')
      .lt('ends_at', new Date().toISOString());

    if (activeError) {
      console.error('Error fetching active sprints:', activeError);
    } else {
      for (const sprint of activeSprints ?? []) {
        try {
          const { error: updateSprintError } = await supabase
            .from('sprints')
            .update({ status: 'verdict_phase' })
            .eq('id', sprint.id);

          if (updateSprintError) {
            console.error('Error updating sprint to verdict_phase:', updateSprintError);
            results.push({ sprint_id: sprint.id, status: 'error', error: String(updateSprintError) });
            continue;
          }

          const { error: updatePactError } = await supabase
            .from('pacts')
            .update({ status: 'verdict' })
            .eq('id', sprint.pact_id);

          if (updatePactError) {
            console.error('Error updating pact to verdict:', updatePactError);
            results.push({ sprint_id: sprint.id, status: 'error', error: String(updatePactError) });
            continue;
          }

          results.push({ sprint_id: sprint.id, status: 'transitioned_to_verdict' });
        } catch (err) {
          results.push({ sprint_id: sprint.id, status: 'error', error: String(err) });
        }
      }
    }

    // Phase 2: Calculate verdicts for sprints in verdict_phase that have passed their verdict deadline
    const { data: verdictSprints, error: verdictError } = await supabase
      .from('sprints')
      .select('id, pact_id, verdict_ends_at')
      .eq('status', 'verdict_phase')
      .lt('verdict_ends_at', new Date().toISOString());

    if (verdictError) {
      console.error('Error fetching verdict sprints:', verdictError);
    } else {
      for (const sprint of verdictSprints ?? []) {
        try {
          await calculateVerdicts(sprint.id);
          results.push({ sprint_id: sprint.id, status: 'finalized' });
        } catch (err) {
          results.push({ sprint_id: sprint.id, status: 'error', error: String(err) });
        }
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    console.error('Finalize sprints error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
