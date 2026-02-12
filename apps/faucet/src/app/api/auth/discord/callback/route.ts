/**
 * Discord OAuth 2.0 Callback Route
 * Exchanges code for access token and stores for social verification
 */

import { NextRequest, NextResponse } from 'next/server';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003';

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string;
  avatar?: string;
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

  // Handle Discord errors
  if (error) {
    console.error('Discord OAuth error:', error);
    return NextResponse.redirect(
      `${BASE_URL}/faucet?error=${encodeURIComponent(error)}`
    );
  }

  // Verify code exists
  if (!code) {
    return NextResponse.redirect(`${BASE_URL}/faucet?error=missing_code`);
  }

  // Verify state (CSRF protection)
  const storedState = request.cookies.get('discord_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    console.error('State mismatch');
    return NextResponse.redirect(`${BASE_URL}/faucet?error=invalid_state`);
  }

  // Decode state to get wallet address
  let stateData: StateData;
  try {
    stateData = JSON.parse(Buffer.from(state!, 'base64url').toString('utf-8'));
  } catch {
    return NextResponse.redirect(`${BASE_URL}/faucet?error=invalid_state`);
  }

  // Check configuration
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    console.error('Discord OAuth not configured');
    return NextResponse.redirect(`${BASE_URL}/faucet?error=discord_not_configured`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      'https://discord.com/api/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${BASE_URL}/api/auth/discord/callback`,
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
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

    const tokenData: DiscordTokenResponse = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch Discord user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      console.error('Failed to fetch user info');
      return NextResponse.redirect(`${BASE_URL}/faucet?error=user_fetch_failed`);
    }

    const discordUser: DiscordUser = await userResponse.json();

    // Create display username (handle Discord's username changes)
    const displayUsername = discordUser.global_name || discordUser.username;

    // Store Discord connection data in cookie (to be used for verification)
    const connectionData = {
      discordId: discordUser.id,
      discordUsername: displayUsername,
      accessToken, // Store token for API calls to verify guild membership
      wallet: stateData.wallet,
      connectedAt: Date.now(),
    };

    const response = NextResponse.redirect(
      `${BASE_URL}/faucet?discord_connected=true&discord_user=${encodeURIComponent(displayUsername)}`
    );

    // Set Discord session cookie (encrypted in production)
    response.cookies.set('discord_connection', Buffer.from(JSON.stringify(connectionData)).toString('base64'), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    // Clear OAuth state cookie
    response.cookies.delete('discord_oauth_state');

    return response;
  } catch (error) {
    console.error('Discord OAuth error:', error);
    return NextResponse.redirect(`${BASE_URL}/faucet?error=oauth_failed`);
  }
}
