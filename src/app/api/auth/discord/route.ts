/**
 * Discord OAuth 2.0 Initiation Route
 * Redirects to Discord's authorization page for social verification
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  if (!DISCORD_CLIENT_ID) {
    console.error('DISCORD_CLIENT_ID is not configured');
    return NextResponse.redirect(
      `${BASE_URL}/faucet?error=discord_not_configured`
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
  const state = Buffer.from(JSON.stringify(stateData)).toString('base64url');

  // Discord OAuth 2.0 URL
  // Scopes: identify guilds - needed to check server membership
  const discordAuthUrl = new URL('https://discord.com/api/oauth2/authorize');
  discordAuthUrl.searchParams.set('response_type', 'code');
  discordAuthUrl.searchParams.set('client_id', DISCORD_CLIENT_ID);
  discordAuthUrl.searchParams.set('redirect_uri', `${BASE_URL}/api/auth/discord/callback`);
  discordAuthUrl.searchParams.set('scope', 'identify guilds');
  discordAuthUrl.searchParams.set('state', state);
  discordAuthUrl.searchParams.set('prompt', 'consent');

  const response = NextResponse.redirect(discordAuthUrl.toString());

  // Set state cookie for CSRF verification
  response.cookies.set('discord_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  return response;
}
