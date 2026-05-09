import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username')?.toLowerCase();

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 });
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY' }, { status: 500 });
    }

    // Create anon client to respect RLS policies
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: profile, error } = await serviceClient
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .eq('username', username)
      .single();

    if (error) {
      console.error('[users/lookup] Database error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('[users/lookup] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
