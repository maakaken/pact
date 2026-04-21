import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const pactId = formData.get('pact_id') as string
    const userId = formData.get('user_id') as string
    const externalLinks = formData.get('external_links') as string

    if (!file || !pactId || !userId) {
      return NextResponse.json(
        { error: 'Missing file, pact_id, or user_id' },
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

    if (user.id !== userId) {
      return NextResponse.json(
        { error: 'User ID mismatch' },
        { status: 403 }
      )
    }

    // Use service role client to bypass RLS
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify user is a member of the pact
    const { data: member } = await serviceClient
      .from('pact_members')
      .select('*')
      .eq('pact_id', pactId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be a member of this pact' },
        { status: 403 }
      )
    }

    // Get current sprint for this pact
    const { data: sprint } = await serviceClient
      .from('sprints')
      .select('*')
      .eq('pact_id', pactId)
      .eq('status', 'active')
      .maybeSingle()

    // Upload file to Supabase storage (use evidence bucket)
    const fileExt = file.name.split('.').pop()
    const fileName = `${pactId}/${userId}/${Date.now()}.${fileExt}`

    let publicUrl = '';

    try {
      console.log('[Proof Upload API] Attempting to upload file:', fileName, 'Size:', file.size, 'Type:', file.type)
      const { data: uploadData, error: uploadError } = await serviceClient.storage
        .from('evidence')
        .upload(fileName, file)

      if (uploadError) {
        console.error('[Proof Upload API] Storage upload error:', uploadError)
        console.error('[Proof Upload API] Error details:', JSON.stringify(uploadError, null, 2))
        return NextResponse.json(
          { error: `Storage upload failed: ${uploadError.message}` },
          { status: 500 }
        )
      }

      console.log('[Proof Upload API] File uploaded successfully')

      // Get signed URL (valid for 1 hour)
      const { data, error: signError } = await serviceClient.storage
        .from('evidence')
        .createSignedUrl(fileName, 3600) // 1 hour expiry

      if (signError || !data?.signedUrl) {
        console.error('[Proof Upload API] Signed URL error:', signError)
        return NextResponse.json(
          { error: `Failed to create signed URL: ${signError?.message ?? 'Unknown error'}` },
          { status: 500 }
        )
      }
      publicUrl = data.signedUrl
    } catch (err) {
      console.error('[Proof Upload API] Upload exception:', err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to upload file' },
        { status: 500 }
      )
    }

    // Get file type (image, audio, video)
    const fileType = file.type.startsWith('image/') ? 'image' :
                     file.type.startsWith('audio/') ? 'audio' :
                     file.type.startsWith('video/') ? 'video' : 'file'

    // Save submission to database with pending status and caption for file type
    const { error: insertError } = await serviceClient
      .from('submissions')
      .insert({
        sprint_id: sprint?.id ?? null,
        user_id: userId,
        goal_id: null,
        caption: fileType, // Store file type in caption field
        file_urls: [publicUrl],
        external_links: parsedExternalLinks,
        submitted_at: new Date().toISOString(),
        moderation_status: 'pending',
        moderation_note: null,
        is_auto_failed: false,
      })

    if (insertError) {
      console.error('[Proof Upload API] Error saving submission:', insertError)
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      proof_url: publicUrl,
      proof_type: fileType,
    })
  } catch (err) {
    console.error('[Proof Upload API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
