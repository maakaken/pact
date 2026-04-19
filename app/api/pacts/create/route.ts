import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  console.log('[pacts/create] ROUTE HIT - Starting request processing')
  
  try {
    console.log('[pacts/create] Creating Supabase SSR client')
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
    
    console.log('[pacts/create] Getting user from session')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('[pacts/create] Auth error:', authError)
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in' },
        { status: 401 }
      )
    }
    
    console.log('[pacts/create] User authenticated:', user.id)
    
    // Create service role client for database operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    console.log('[pacts/create] Parsing request body')
    const body = await request.json()
    console.log('[pacts/create] Body received:', body)

    const {
      name,
      mission,
      category,
      is_public,
      sprint_type,
      sprint_duration_days,
      stake_amount,
      max_members
    } = body

    console.log('[pacts/create] Validating required fields')
    if (!name) {
      console.error('[pacts/create] Missing required field: name')
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      )
    }

    console.log('[pacts/create] Inserting pact into database')
    
    // Add timeout to database operation
    const pactPromise = serviceClient
      .from('pacts')
      .insert({
        name,
        mission,
        category,
        is_public,
        sprint_type,
        sprint_duration_days: sprint_duration_days || 7,
        stake_amount,
        max_members: max_members || 10,
        created_by: user.id,
        status: 'forming'
      })
      .select()
      .single();
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database operation timed out after 15 seconds')), 15000)
    );
    
    const { data: pact, error: pactError } = await Promise.race([pactPromise, timeoutPromise]) as any;

    if (pactError) {
      console.error('[pacts/create] DB error on pact insert:', pactError)
      return NextResponse.json(
        { error: pactError.message },
        { status: 400 }
      )
    }

    console.log('[pacts/create] Pact created successfully:', pact.id)

    console.log('[pacts/create] Inserting pact member (admin)')
    const { error: memberError } = await serviceClient
      .from('pact_members')
      .insert({
        pact_id: pact.id,
        user_id: user.id,
        role: 'admin',
        status: 'active'
      })

    if (memberError) {
      console.error('[pacts/create] Member insert error:', memberError)
      // Don't fail the whole request if member insert fails
    } else {
      console.log('[pacts/create] Pact member inserted successfully')
    }

    console.log('[pacts/create] Returning success response with pactId:', pact.id)
    return NextResponse.json({ pactId: pact.id })

  } catch (err) {
    console.error('[pacts/create] CRASH:', err)
    console.error('[pacts/create] Error details:', err instanceof Error ? err.stack : String(err))
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
