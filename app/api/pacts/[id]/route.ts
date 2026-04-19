import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('[api/pacts/[id]] ROUTE HIT - Starting request processing')
  
  try {
    const { id: pactId } = await params
    
    console.log('[api/pacts/[id]] Creating Supabase SSR client')
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
    
    console.log('[api/pacts/[id]] Getting user from session')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('[api/pacts/[id]] Auth error:', authError)
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in' },
        { status: 401 }
      )
    }
    
    console.log('[api/pacts/[id]] User authenticated:', user.id)
    
    // Create service role client for database operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    console.log('[api/pacts/[id]] Fetching pact data')
    
    // Fetch pact with members and sprint
    const [pactResult, membersResult, sprintResult] = await Promise.all([
      serviceClient.from('pacts').select('*').eq('id', pactId).single(),
      serviceClient.from('pact_members').select('*, profiles(*)').eq('pact_id', pactId).eq('status', 'active'),
      serviceClient.from('sprints').select('*').eq('pact_id', pactId).order('sprint_number', { ascending: false }).limit(1).maybeSingle()
    ])
    
    if (pactResult.error || !pactResult.data) {
      console.error('[api/pacts/[id]] Pact not found:', pactResult.error)
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }
    
    console.log('[api/pacts/[id]] Pact found:', pactResult.data.id)
    
    const responseData = {
      ...pactResult.data,
      members: (membersResult.data as any[]) ?? [],
      currentSprint: sprintResult.data ?? null
    }
    
    console.log('[api/pacts/[id]] Returning pact data')
    return NextResponse.json(responseData)
    
  } catch (err) {
    console.error('[api/pacts/[id]] CRASH:', err)
    console.error('[api/pacts/[id]] Error details:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
