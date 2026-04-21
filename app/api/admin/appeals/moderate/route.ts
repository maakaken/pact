import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  try {
    const { appealId, action, note, userId, pactId } = await request.json()

    if (!appealId || !action) {
      return NextResponse.json(
        { error: 'Missing appealId or action' },
        { status: 400 }
      )
    }

    // Verify user is authenticated
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

    // Use service role client to bypass RLS
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Update appeal
    const { error: appealError } = await serviceClient
      .from('appeals')
      .update({
        status: action,
        moderator_note: note,
      })
      .eq('id', appealId)

    if (appealError) {
      return NextResponse.json(
        { error: appealError.message },
        { status: 500 }
      )
    }

    // Update moderation queue
    await serviceClient
      .from('moderation_queue')
      .update({ status: 'reviewed' })
      .eq('type', 'appeal')
      .eq('appeal_id', appealId)

    // Notify the appellant
    if (userId) {
      await serviceClient.from('notifications').insert({
        user_id: userId,
        type: 'appeal_result',
        title: action === 'upheld' ? 'Appeal Reviewed — Verdict Upheld' : 'Appeal Reviewed — Verdict Overturned',
        body: note || `Your appeal was ${action}.`,
      })
    }

    // If overturned, notify all pact members
    if (action === 'overturned' && pactId) {
      const { data: members } = await serviceClient
        .from('pact_members')
        .select('user_id')
        .eq('pact_id', pactId)

      if (members) {
        await serviceClient.from('notifications').insert(
          members.map((m) => ({
            user_id: m.user_id,
            type: 'appeal_result' as const,
            title: 'Appeal Overturned',
            body: 'An appeal in your pact was overturned. The verdict has been changed.',
          }))
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Admin Appeals Moderate API] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
