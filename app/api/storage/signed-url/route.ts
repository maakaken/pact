import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { path } = await request.json()

    if (!path || typeof path !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid path' },
        { status: 400 }
      )
    }

    // Use service role to bypass RLS
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Extract path from full URL if provided
    const filePath = path.includes('/storage/v1/object/')
      ? path.split('/storage/v1/object/evidence/')[1]
      : path

    const { data, error } = await serviceClient.storage
      .from('evidence')
      .createSignedUrl(filePath, 3600) // 1 hour expiry

    if (error || !data?.signedUrl) {
      console.error('[Signed URL API] Error:', error)
      return NextResponse.json(
        { error: 'Failed to create signed URL' },
        { status: 500 }
      )
    }

    return NextResponse.json({ signedUrl: data.signedUrl })
  } catch (err) {
    console.error('[Signed URL API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
