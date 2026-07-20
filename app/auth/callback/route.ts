import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

/**
 * OAuth / email-confirmation callback.
 * Supabase redirects here with a `?code=` param (PKCE flow). We exchange it
 * for a session, which writes the auth cookies via the server client.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code, or exchange failed — send back to sign-in with an error flag.
  return NextResponse.redirect(`${origin}/auth/signin?error=auth_callback_failed`);
}
