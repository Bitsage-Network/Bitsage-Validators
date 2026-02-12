/**
 * GitHub OAuth Initiation Route
 * Redirects to GitHub's authorization page for social verification
 */

import { NextRequest, NextResponse } from 'next/server';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  if (!GITHUB_CLIENT_ID) {
    console.error('GITHUB_CLIENT_ID is not configured');
    return NextResponse.redirect(
      `${BASE_URL}/faucet?error=github_not_configured`
    );
  }

  // Get the wallet address from query params (to link social to wallet)
  const walletAddress = request.nextUrl.searchParams.get('wallet');

  // Generate a random state for CSRF protection (include wallet for linking)
  const stateData = {
    csrf: crypto.randomUUID(),
    wallet: walletAddress || '',
    returnTo: '/faucet',
  };
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

  // GitHub OAuth URL - request read:user and read:org for checking follows/stars
  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('redirect_uri', `${BASE_URL}/api/auth/github/callback`);
  githubAuthUrl.searchParams.set('scope', 'read:user read:org');
  githubAuthUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(githubAuthUrl.toString());

  // Set state cookie for CSRF verification
  response.cookies.set('github_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  return response;
}
