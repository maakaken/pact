// Supabase Edge Function: finalize-verdicts
// Scheduled via pg_cron to run every 15 minutes
/// <reference path="../types.d.ts" />

Deno.serve(async () => {
  try {
    const rawAppUrl = Deno.env.get('APP_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    let appUrl: string;
    if (!rawAppUrl) {
      const isDevelopment = Deno.env.get('NODE_ENV') === 'development';
      if (isDevelopment) {
        console.warn('APP_URL environment variable not set, using localhost fallback');
        appUrl = 'http://localhost:3000';
      } else {
        throw new Error('APP_URL environment variable is required in production');
      }
    } else {
      appUrl = rawAppUrl;
    }

    if (!serviceKey) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for authorization');
    }

    console.log('Calling sprint finalization API...');
    
    const response = await fetch(`${appUrl}/api/sprints/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API call failed with status ${response.status}: ${errorText}`);
      
      return new Response(
        JSON.stringify({ 
          error: 'API call failed', 
          status: response.status,
          message: errorText 
        }), 
        { 
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const result = await response.json();
    console.log('Sprint finalization completed:', result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error in finalize-verdicts function:', error);
    
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
