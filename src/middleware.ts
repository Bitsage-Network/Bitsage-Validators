import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect /login and /auth to /connect (password protection removed)
  if (pathname === '/login' || pathname === '/auth') {
    return NextResponse.redirect(new URL('/connect', request.url));
  }

  // Skip auth check for public pages
  const publicPaths = ['/connect', '/'];
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // Check for wallet connection only (demo password protection disabled)
  // const authCookie = request.cookies.get('demo-auth');
  const walletConnected = request.cookies.get('wallet-verified');

  if (!walletConnected) {
    // Redirect to connect page if wallet not connected
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
