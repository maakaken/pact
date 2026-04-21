import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const pactId = formData.get('pact_id') as string

    if (!file || !pactId) {
      return NextResponse.json(
        { error: 'Missing file or pact_id' },
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

    // Upload file to evidence bucket
    const fileExt = file.name.split('.').pop()
    const fileName = `appeals/${pactId}/${user.id}/${Date.now()}-${file.name}`

    const { error: uploadError } = await serviceClient.storage
      .from('evidence')
      .upload(fileName, file)

    if (uploadError) {
      console.error('[Appeal Evidence Upload API] Storage upload error:', uploadError)
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
      console.error('[Appeal Evidence Upload API] Signed URL error:', signError)
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
    console.error('[Appeal Evidence Upload API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
