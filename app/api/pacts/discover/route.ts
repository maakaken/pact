import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET() {
  console.log('[api/pacts/discover] ROUTE HIT - Starting request processing')
  
  try {
    console.log('[api/pacts/discover] Creating Supabase SSR client')
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )
    
    console.log('[api/pacts/discover] Getting user from session')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('[api/pacts/discover] Auth error:', authError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    console.log('[api/pacts/discover] User authenticated:', user.id)
    
    // Create service role client for database operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    console.log('[api/pacts/discover] Fetching discover pacts')
    
    // Get public pacts
    const { data: pacts } = await serviceClient
      .from('pacts')
      .select('*')
      .eq('is_public', true)
      .in('status', ['forming', 'active'])
      .order('created_at', { ascending: false })
      .limit(3)
    
    console.log('[api/pacts/discover] Pacts fetched:', pacts?.length)
    
    return NextResponse.json(pacts ?? [])
    
  } catch (err) {
    console.error('[api/pacts/discover] CRASH:', err)
    console.error('[api/pacts/discover] Error details:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
