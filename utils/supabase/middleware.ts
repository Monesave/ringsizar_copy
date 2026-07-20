import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const createClient = (request: NextRequest) => {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    },
  );

  return { supabase, response: supabaseResponse };
};

/**
 * Refreshes the Supabase auth session (rotates expiring tokens) and forwards
 * the updated auth cookies on the response. Must be invoked from middleware so
 * Server Components always see a valid session.
 */
export async function updateSession(request: NextRequest) {
  const { supabase, response } = createClient(request);

  // IMPORTANT: this call refreshes the session and writes rotated cookies.
  // Do not remove it, and do not run code between createServerClient and here.
  await supabase.auth.getUser();

  return response;
}

