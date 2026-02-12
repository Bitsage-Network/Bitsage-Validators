/**
 * GitHub OAuth Callback Route
 * Exchanges code for access token and stores for social verification
 */

import { NextRequest, NextResponse } from 'next/server';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003';

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
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

  // Handle GitHub errors
  if (error) {
    console.error('GitHub OAuth error:', error);
    return NextResponse.redirect(
      `${BASE_URL}/faucet?error=${encodeURIComponent(error)}`
    );
  }

  // Verify code exists
  if (!code) {
    return NextResponse.redirect(`${BASE_URL}/faucet?error=missing_code`);
  }

  // Verify state (CSRF protection)
  const storedState = request.cookies.get('github_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    console.error('State mismatch');
    return NextResponse.redirect(`${BASE_URL}/faucet?error=invalid_state`);
  }

  // Decode state to get wallet address
  let stateData: StateData;
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
  } catch {
    return NextResponse.redirect(`${BASE_URL}/faucet?error=invalid_state`);
  }

  // Check configuration
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    console.error('GitHub OAuth not configured');
    return NextResponse.redirect(`${BASE_URL}/faucet?error=github_not_configured`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${BASE_URL}/api/auth/github/callback`,
        }),
      }
    );

    const tokenData: GitHubTokenResponse = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Token exchange failed:', tokenData.error_description);
      return NextResponse.redirect(
        `${BASE_URL}/faucet?error=${encodeURIComponent(tokenData.error)}`
      );
    }

    const accessToken = tokenData.access_token;

    // Fetch GitHub user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const githubUser: GitHubUser = await userResponse.json();

    // Store GitHub connection data in cookie (to be used for verification)
    const connectionData = {
      githubId: githubUser.id,
      githubLogin: githubUser.login,
      accessToken, // Store token for API calls to verify stars/follows
      wallet: stateData.wallet,
      connectedAt: Date.now(),
    };

    const response = NextResponse.redirect(
      `${BASE_URL}/faucet?github_connected=true&github_user=${encodeURIComponent(githubUser.login)}`
    );

    // Set GitHub session cookie (encrypted in production)
    response.cookies.set('github_connection', Buffer.from(JSON.stringify(connectionData)).toString('base64'), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    // Clear OAuth state cookie
    response.cookies.delete('github_oauth_state');

    return response;
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    return NextResponse.redirect(`${BASE_URL}/faucet?error=oauth_failed`);
  }
}
