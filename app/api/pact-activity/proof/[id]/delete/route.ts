import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params

    if (!submissionId) {
      return NextResponse.json(
        { error: 'Missing submission_id' },
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

    // Fetch submission
    const { data: submission } = await serviceClient
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .single()

    if (!submission) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      )
    }

    // Verify user is the uploader
    if (submission.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only delete your own proofs' },
        { status: 403 }
      )
    }

    // Delete file from storage
    const fileUrl = submission.file_urls?.[0]
    if (fileUrl) {
      try {
        // Extract file path from URL
        // URL format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]/[filename]
        const urlParts = fileUrl.split('/')
        const objectIndex = urlParts.indexOf('object')
        if (objectIndex !== -1 && objectIndex + 4 < urlParts.length) {
          const bucketName = urlParts[objectIndex + 2] // 'public' is at object+1, bucket is at object+2
          const filePath = urlParts.slice(objectIndex + 3).join('/') // Everything after bucket

          console.log('[Delete Proof API] Deleting file:', { bucketName, filePath })

          const { error: deleteError } = await serviceClient.storage
            .from(bucketName)
            .remove([filePath])

          if (deleteError) {
            console.error('[Delete Proof API] Error deleting file from storage:', deleteError)
            // Continue anyway to delete from database
          }
        }
      } catch (e) {
        console.error('[Delete Proof API] Error deleting file:', e)
        // Continue anyway to delete from database
      }
    }

    // Delete submission from database
    const { error: deleteError } = await serviceClient
      .from('submissions')
      .delete()
      .eq('id', submissionId)

    if (deleteError) {
      console.error('[Delete Proof API] Error deleting submission:', deleteError)
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Delete Proof API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
