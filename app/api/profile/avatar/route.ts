import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'Missing file' },
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

    // Upload file to avatars bucket
    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}/${Date.now()}-${file.name}`

    const { error: uploadError } = await serviceClient.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true })

    if (uploadError) {
      console.error('[Avatar Upload API] Storage upload error:', uploadError)
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Get signed URL (valid for 1 hour)
    const { data, error: signError } = await serviceClient.storage
      .from('avatars')
      .createSignedUrl(fileName, 3600)

    if (signError || !data?.signedUrl) {
      console.error('[Avatar Upload API] Signed URL error:', signError)
      return NextResponse.json(
        { error: `Failed to create signed URL: ${signError?.message ?? 'Unknown error'}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      avatarUrl: data.signedUrl,
    })
  } catch (err) {
    console.error('[Avatar Upload API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
