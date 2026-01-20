import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect /login to /connect
  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/connect', request.url));
  }

  // Skip auth check for public pages
  const publicPaths = ['/auth', '/connect', '/'];
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // Check for auth cookie OR wallet connection (via demo mode flag in cookie)
  const authCookie = request.cookies.get('demo-auth');
  const walletConnected = request.cookies.get('wallet-verified');

  if ((!authCookie || authCookie.value !== 'obelysk-verified') && !walletConnected) {
    // Redirect to connect page if not authenticated
    return NextResponse.redirect(new URL('/connect', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon|brand).*)',
  ],
};
