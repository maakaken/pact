import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET() {
  try {
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
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    
    // Create service role client for database operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    
    // Get public pacts
    const { data: pacts } = await serviceClient
      .from('pacts')
      .select('*')
      .eq('is_public', true)
      .in('status', ['forming', 'active'])
      .order('created_at', { ascending: false })
      .limit(3)
    
    
    return NextResponse.json(pacts ?? [])
    
  } catch (err) {
    console.error('[api/pacts/discover] Error:', err)
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
