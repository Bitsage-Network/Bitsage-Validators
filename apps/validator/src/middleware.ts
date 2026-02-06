import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect /login to /connect
  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/connect', request.url));
  }

  // Skip auth check for public pages
  const publicPaths = ['/connect', '/'];
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // Check for wallet verification cookie
  const walletConnected = request.cookies.get('wallet-verified');

  if (!walletConnected) {
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
