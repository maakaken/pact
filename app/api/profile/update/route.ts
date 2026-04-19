import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const body = await request.json()
    const { id, full_name, username, bio, interests, avatar_url } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id, full_name, username, bio, interests, avatar_url }, { onConflict: 'id' })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ profile: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
