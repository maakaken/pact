import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const pactId = formData.get('pact_id') as string
    const sprintId = formData.get('sprint_id') as string
    const externalLinks = formData.get('external_links') as string

    if (!file || !pactId || !sprintId) {
      return NextResponse.json(
        { error: 'Missing file, pact_id, or sprint_id' },
        { status: 400 }
      )
    }

    // Parse external links if provided
    let parsedExternalLinks: string[] | null = null
    if (externalLinks) {
      try {
        parsedExternalLinks = JSON.parse(externalLinks)
        if (!Array.isArray(parsedExternalLinks)) {
          parsedExternalLinks = null
        }
      } catch {
        parsedExternalLinks = null
      }
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

    // Verify user is a member of the pact
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of this pact' },
        { status: 403 }
      )
    }

    // Upload file to evidence bucket
    const fileExt = file.name.split('.').pop()
    const fileName = `${pactId}/${sprintId}/${user.id}/${file.name}`

    const { error: uploadError } = await serviceClient.storage
      .from('evidence')
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      console.error('[Locker Evidence Upload API] Storage upload error:', uploadError)
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Get signed URL (valid for 1 hour)
    const { data, error: signError } = await serviceClient.storage
      .from('evidence')
      .createSignedUrl(fileName, 3600)

    if (signError || !data?.signedUrl) {
      console.error('[Locker Evidence Upload API] Signed URL error:', signError)
      return NextResponse.json(
        { error: `Failed to create signed URL: ${signError?.message ?? 'Unknown error'}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      evidenceUrl: data.signedUrl,
    })
  } catch (err) {
    console.error('[Locker Evidence Upload API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
