import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET() {
  console.log('[api/user/pacts] ROUTE HIT - Starting request processing')
  
  try {
    console.log('[api/user/pacts] Creating Supabase SSR client')
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
    
    console.log('[api/user/pacts] Getting user from session')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('[api/user/pacts] Auth error:', authError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    console.log('[api/user/pacts] User authenticated:', user.id)
    
    // Create service role client for database operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    console.log('[api/user/pacts] Fetching user pacts')
    
    // Get pact memberships with pact data
    const { data: memberRows } = await serviceClient
      .from('pact_members')
      .select('*, pacts(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
    
    console.log('[api/user/pacts] Member rows fetched:', memberRows?.length)
    
    return NextResponse.json(memberRows ?? [])
    
  } catch (err) {
    console.error('[api/user/pacts] CRASH:', err)
    console.error('[api/user/pacts] Error details:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
