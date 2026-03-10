import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect legacy auth routes to wallet connect
  if (pathname === '/login' || pathname === '/auth') {
    return NextResponse.redirect(new URL('/connect', request.url));
  }

  // Public pages - no auth required
  const publicPaths = ['/connect', '/'];
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // Require wallet signature verification cookie with valid Starknet address
  const walletConnected = request.cookies.get('wallet-verified');

  if (!walletConnected?.value) {
    return NextResponse.redirect(new URL('/connect', request.url));
  }

  // Validate cookie value is a plausible Starknet address (0x + up to 64 hex chars)
  const addr = walletConnected.value;
  if (!addr.startsWith('0x') || addr.length < 4 || addr.length > 66 || !/^0x[0-9a-fA-F]+$/.test(addr)) {
    // Invalid cookie — clear it and redirect
    const response = NextResponse.redirect(new URL('/connect', request.url));
    response.cookies.delete('wallet-verified');
    return response;
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
