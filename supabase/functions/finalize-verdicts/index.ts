// Supabase Edge Function: finalize-verdicts
// Scheduled via pg_cron to run every 15 minutes

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async () => {
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:3000';

  const response = await fetch(`${appUrl}/api/sprints/finalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
  });

  const result = await response.json();

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});
