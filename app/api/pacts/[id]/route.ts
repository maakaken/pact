import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pactId } = await params
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
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in' },
        { status: 401 }
      )
    }
    
    // Create service role client for database operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    
    // Fetch pact with members and sprint
    const [pactResult, membersResult, sprintResult] = await Promise.all([
      serviceClient.from('pacts').select('*').eq('id', pactId).single(),
      serviceClient.from('pact_members').select('*, profiles(*)').eq('pact_id', pactId).eq('status', 'active'),
      serviceClient.from('sprints').select('*').eq('pact_id', pactId).order('sprint_number', { ascending: false }).limit(1).maybeSingle()
    ])
    
    if (pactResult.error || !pactResult.data) {
      return NextResponse.json(
        { error: 'Pact not found' },
        { status: 404 }
      )
    }
    
    const responseData = {
      ...pactResult.data,
      members: (membersResult.data as any[]) ?? [],
      currentSprint: sprintResult.data ?? null
    }
    
    return NextResponse.json(responseData)
    
  } catch (err) {
    console.error('[api/pacts/[id]] Error:', err)
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
