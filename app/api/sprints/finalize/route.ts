import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { calculateVerdicts } from '@/lib/verdict';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Find all sprints in verdict_phase that have passed their deadline
    const { data: sprints, error } = await supabase
      .from('sprints')
      .select('id, pact_id, verdict_ends_at')
      .in('status', ['active', 'verdict_phase'])
      .lt('verdict_ends_at', new Date().toISOString());

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = [];
    for (const sprint of sprints ?? []) {
      try {
        // Check if all members have voted
        const { data: pactMembers } = await supabase
          .from('pact_members')
          .select('user_id')
          .eq('pact_id', sprint.pact_id)
          .eq('status', 'active');

        if (!pactMembers?.length) continue;

        await calculateVerdicts(sprint.id);
        results.push({ sprint_id: sprint.id, status: 'finalized' });
      } catch (err) {
        results.push({ sprint_id: sprint.id, status: 'error', error: String(err) });
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    console.error('Finalize sprints error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
