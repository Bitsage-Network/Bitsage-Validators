/**
 * Twitter/X OAuth 2.0 Initiation Route
 * Redirects to Twitter's authorization page for social verification
 * Uses OAuth 2.0 with PKCE for secure authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003';

// Generate PKCE code verifier and challenge
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

export async function GET(request: NextRequest) {
  if (!TWITTER_CLIENT_ID) {
    console.error('TWITTER_CLIENT_ID is not configured');
    return NextResponse.redirect(
      `${BASE_URL}/faucet?error=twitter_not_configured`
    );
  }

  // Get the wallet address from query params (to link social to wallet)
  const walletAddress = request.nextUrl.searchParams.get('wallet');

  // Generate PKCE challenge
  const { verifier, challenge } = generatePKCE();

  // Generate a random state for CSRF protection (include wallet for linking)
  const stateData = {
    csrf: crypto.randomUUID(),
    wallet: walletAddress || '',
    returnTo: '/faucet',
  };
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64url');

  // Twitter OAuth 2.0 URL
  // Scopes: tweet.read users.read follows.read - needed to check follows
  const twitterAuthUrl = new URL('https://twitter.com/i/oauth2/authorize');
  twitterAuthUrl.searchParams.set('response_type', 'code');
  twitterAuthUrl.searchParams.set('client_id', TWITTER_CLIENT_ID);
  twitterAuthUrl.searchParams.set('redirect_uri', `${BASE_URL}/api/auth/twitter/callback`);
  twitterAuthUrl.searchParams.set('scope', 'tweet.read users.read follows.read');
  twitterAuthUrl.searchParams.set('state', state);
  twitterAuthUrl.searchParams.set('code_challenge', challenge);
  twitterAuthUrl.searchParams.set('code_challenge_method', 'S256');

  const response = NextResponse.redirect(twitterAuthUrl.toString());

  // Set state cookie for CSRF verification
  response.cookies.set('twitter_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  // Set PKCE verifier cookie (needed for token exchange)
  response.cookies.set('twitter_pkce_verifier', verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  return response;
}
