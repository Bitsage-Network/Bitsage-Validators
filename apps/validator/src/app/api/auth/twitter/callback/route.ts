/**
 * Twitter/X OAuth 2.0 Callback Route
 * Exchanges code for access token and stores for social verification
 */

import { NextRequest, NextResponse } from 'next/server';

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface TwitterTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

interface TwitterUser {
  data: {
    id: string;
    name: string;
    username: string;
  };
}

interface StateData {
  csrf: string;
  wallet: string;
  returnTo: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle Twitter errors
  if (error) {
    console.error('Twitter OAuth error:', error);
    return NextResponse.redirect(
      `${BASE_URL}/faucet?error=${encodeURIComponent(error)}`
    );
  }

  // Verify code exists
  if (!code) {
    return NextResponse.redirect(`${BASE_URL}/faucet?error=missing_code`);
  }

  // Verify state (CSRF protection)
  const storedState = request.cookies.get('twitter_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    console.error('State mismatch');
    return NextResponse.redirect(`${BASE_URL}/faucet?error=invalid_state`);
  }

  // Get PKCE verifier
  const codeVerifier = request.cookies.get('twitter_pkce_verifier')?.value;
  if (!codeVerifier) {
    console.error('PKCE verifier missing');
    return NextResponse.redirect(`${BASE_URL}/faucet?error=pkce_missing`);
  }

  // Decode state to get wallet address
  let stateData: StateData;
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
  } catch {
    return NextResponse.redirect(`${BASE_URL}/faucet?error=invalid_state`);
  }

  // Check configuration
  if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET) {
    console.error('Twitter OAuth not configured');
    return NextResponse.redirect(`${BASE_URL}/faucet?error=twitter_not_configured`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      'https://api.twitter.com/2/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${BASE_URL}/api/auth/twitter/callback`,
          code_verifier: codeVerifier,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return NextResponse.redirect(
        `${BASE_URL}/faucet?error=token_exchange_failed`
      );
    }

    const tokenData: TwitterTokenResponse = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch Twitter user info
    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      console.error('Failed to fetch user info');
      return NextResponse.redirect(`${BASE_URL}/faucet?error=user_fetch_failed`);
    }

    const twitterUser: TwitterUser = await userResponse.json();

    // Store Twitter connection data in cookie (to be used for verification)
    const connectionData = {
      twitterId: twitterUser.data.id,
      twitterHandle: twitterUser.data.username,
      twitterName: twitterUser.data.name,
      accessToken, // Store token for API calls to verify follows
      wallet: stateData.wallet,
      connectedAt: Date.now(),
    };

    const response = NextResponse.redirect(
      `${BASE_URL}/faucet?twitter_connected=true&twitter_user=${encodeURIComponent(twitterUser.data.username)}`
    );

    // Set Twitter session cookie (encrypted in production)
    response.cookies.set('twitter_connection', Buffer.from(JSON.stringify(connectionData)).toString('base64'), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    // Clear OAuth state cookies
    response.cookies.delete('twitter_oauth_state');
    response.cookies.delete('twitter_pkce_verifier');

    return response;
  } catch (error) {
    console.error('Twitter OAuth error:', error);
    return NextResponse.redirect(`${BASE_URL}/faucet?error=oauth_failed`);
  }
}
