import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  console.log('[pacts/create] ROUTE HIT')
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
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
      max_members,
      created_by
    } = body

    if (!name || !created_by) {
      return NextResponse.json(
        { error: 'Missing required fields: name, created_by' },
        { status: 400 }
      )
    }

    const { data: pact, error: pactError } = await supabase
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
        created_by,
        status: 'forming'
      })
      .select()
      .single()

    if (pactError) {
      console.error('[pacts/create] DB error:', pactError)
      return NextResponse.json(
        { error: pactError.message },
        { status: 400 }
      )
    }

    console.log('[pacts/create] Pact created:', pact.id)

    const { error: memberError } = await supabase
      .from('pact_members')
      .insert({
        pact_id: pact.id,
        user_id: created_by,
        role: 'admin',
        status: 'active'
      })

    if (memberError) {
      console.error('[pacts/create] Member error:', memberError)
    }

    return NextResponse.json({ pactId: pact.id })

  } catch (err) {
    console.error('[pacts/create] CRASH:', err)
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
