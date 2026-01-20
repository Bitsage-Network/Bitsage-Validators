/**
 * Social Task Verification API
 * Verifies GitHub stars, follows, Twitter follows, and Discord membership
 */

import { NextRequest, NextResponse } from 'next/server';

interface GitHubConnection {
  githubId: number;
  githubLogin: string;
  accessToken: string;
  wallet: string;
  connectedAt: number;
}

interface TwitterConnection {
  twitterId: string;
  twitterHandle: string;
  accessToken: string;
  wallet: string;
  connectedAt: number;
}

interface DiscordConnection {
  discordId: string;
  discordUsername: string;
  accessToken: string;
  wallet: string;
  connectedAt: number;
}

// BitSage Twitter/X user ID - find using Twitter API
const BITSAGE_TWITTER_USERNAME = 'bitsagenetwork';

// BitSage Discord Guild ID - from invite link or server settings
// Note: This needs to be obtained from Discord server settings
const BITSAGE_DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '';

interface VerifyRequest {
  taskId: string;
  taskType: 'github_follow' | 'github_star' | 'twitter_follow' | 'discord_join';
  repo?: string; // For github_star tasks
  wallet: string;
}

interface VerifyResponse {
  success: boolean;
  verified: boolean;
  message: string;
  reward?: number;
}

// GitHub API helpers
async function checkGitHubStar(accessToken: string, repo: string): Promise<boolean> {
  try {
    // Check if authenticated user has starred the repo
    const response = await fetch(
      `https://api.github.com/user/starred/${repo}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    // 204 = starred, 404 = not starred
    return response.status === 204;
  } catch (error) {
    console.error('GitHub star check failed:', error);
    return false;
  }
}

async function checkGitHubOrgFollow(accessToken: string, org: string): Promise<boolean> {
  try {
    // Check if authenticated user is following the organization
    const response = await fetch(
      `https://api.github.com/user/following/${org}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    // 204 = following, 404 = not following
    return response.status === 204;
  } catch (error) {
    console.error('GitHub follow check failed:', error);
    return false;
  }
}

// Twitter API helpers
async function checkTwitterFollow(accessToken: string, targetUsername: string): Promise<boolean> {
  try {
    // First, get the authenticated user's ID
    const meResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!meResponse.ok) {
      console.error('Failed to get Twitter user');
      return false;
    }

    const meData = await meResponse.json();
    const userId = meData.data?.id;

    if (!userId) {
      return false;
    }

    // Get the target user's ID by username
    const targetResponse = await fetch(
      `https://api.twitter.com/2/users/by/username/${targetUsername}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!targetResponse.ok) {
      console.error('Failed to get target Twitter user');
      return false;
    }

    const targetData = await targetResponse.json();
    const targetId = targetData.data?.id;

    if (!targetId) {
      return false;
    }

    // Check if the user is following the target
    const followingResponse = await fetch(
      `https://api.twitter.com/2/users/${userId}/following?user.fields=id&max_results=1000`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!followingResponse.ok) {
      // If we can't check following list, try an alternative approach
      // Check if target is in user's following by querying relationship
      return false;
    }

    const followingData = await followingResponse.json();
    const following = followingData.data || [];

    // Check if target user is in following list
    return following.some((user: { id: string }) => user.id === targetId);
  } catch (error) {
    console.error('Twitter follow check failed:', error);
    return false;
  }
}

// Discord API helpers
async function checkDiscordGuildMembership(accessToken: string, guildId: string): Promise<boolean> {
  try {
    // Get user's guilds
    const response = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('Failed to get Discord guilds');
      return false;
    }

    const guilds = await response.json();

    // Check if the target guild is in the user's guild list
    return guilds.some((guild: { id: string }) => guild.id === guildId);
  } catch (error) {
    console.error('Discord guild check failed:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyRequest = await request.json();
    const { taskId, taskType, repo, wallet } = body;

    if (!taskId || !taskType || !wallet) {
      return NextResponse.json(
        { success: false, verified: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get GitHub connection from cookie
    const githubCookie = request.cookies.get('github_connection')?.value;

    // Handle GitHub tasks
    if (taskType === 'github_star' || taskType === 'github_follow') {
      if (!githubCookie) {
        return NextResponse.json({
          success: false,
          verified: false,
          message: 'Please connect your GitHub account first',
          requiresAuth: true,
          authUrl: `/api/auth/github?wallet=${encodeURIComponent(wallet)}`,
        });
      }

      let connection: GitHubConnection;
      try {
        connection = JSON.parse(Buffer.from(githubCookie, 'base64').toString('utf-8'));
      } catch {
        return NextResponse.json({
          success: false,
          verified: false,
          message: 'Invalid GitHub session. Please reconnect.',
          requiresAuth: true,
          authUrl: `/api/auth/github?wallet=${encodeURIComponent(wallet)}`,
        });
      }

      // Verify the task
      let verified = false;

      if (taskType === 'github_star' && repo) {
        verified = await checkGitHubStar(connection.accessToken, repo);
      } else if (taskType === 'github_follow') {
        verified = await checkGitHubOrgFollow(connection.accessToken, 'Bitsage-Network');
      }

      if (verified) {
        // In production, this would:
        // 1. Record the completion in a database
        // 2. Trigger the bonus token distribution
        // For now, we just return success

        return NextResponse.json({
          success: true,
          verified: true,
          message: taskType === 'github_star'
            ? `Verified: You starred ${repo}!`
            : 'Verified: You follow Bitsage-Network!',
          reward: taskType === 'github_star' ? 15 : 10,
        });
      } else {
        return NextResponse.json({
          success: true,
          verified: false,
          message: taskType === 'github_star'
            ? `Please star ${repo} on GitHub first`
            : 'Please follow Bitsage-Network on GitHub first',
        });
      }
    }

    // Handle Twitter tasks
    if (taskType === 'twitter_follow') {
      const twitterCookie = request.cookies.get('twitter_connection')?.value;

      if (!twitterCookie) {
        return NextResponse.json({
          success: false,
          verified: false,
          message: 'Please connect your X account first',
          requiresAuth: true,
          authUrl: `/api/auth/twitter?wallet=${encodeURIComponent(wallet)}`,
        });
      }

      let connection: TwitterConnection;
      try {
        connection = JSON.parse(Buffer.from(twitterCookie, 'base64').toString('utf-8'));
      } catch {
        return NextResponse.json({
          success: false,
          verified: false,
          message: 'Invalid X session. Please reconnect.',
          requiresAuth: true,
          authUrl: `/api/auth/twitter?wallet=${encodeURIComponent(wallet)}`,
        });
      }

      const verified = await checkTwitterFollow(connection.accessToken, BITSAGE_TWITTER_USERNAME);

      if (verified) {
        return NextResponse.json({
          success: true,
          verified: true,
          message: `Verified: You follow @${BITSAGE_TWITTER_USERNAME}!`,
          reward: 10,
        });
      } else {
        return NextResponse.json({
          success: true,
          verified: false,
          message: `Please follow @${BITSAGE_TWITTER_USERNAME} on X first`,
        });
      }
    }

    // Handle Discord tasks
    if (taskType === 'discord_join') {
      const discordCookie = request.cookies.get('discord_connection')?.value;

      if (!discordCookie) {
        return NextResponse.json({
          success: false,
          verified: false,
          message: 'Please connect your Discord account first',
          requiresAuth: true,
          authUrl: `/api/auth/discord?wallet=${encodeURIComponent(wallet)}`,
        });
      }

      let connection: DiscordConnection;
      try {
        connection = JSON.parse(Buffer.from(discordCookie, 'base64').toString('utf-8'));
      } catch {
        return NextResponse.json({
          success: false,
          verified: false,
          message: 'Invalid Discord session. Please reconnect.',
          requiresAuth: true,
          authUrl: `/api/auth/discord?wallet=${encodeURIComponent(wallet)}`,
        });
      }

      if (!BITSAGE_DISCORD_GUILD_ID) {
        // If guild ID not configured, return success based on connection
        // In production, configure DISCORD_GUILD_ID env var
        return NextResponse.json({
          success: true,
          verified: true,
          message: 'Discord connected! Join verification pending server setup.',
          reward: 10,
        });
      }

      const verified = await checkDiscordGuildMembership(connection.accessToken, BITSAGE_DISCORD_GUILD_ID);

      if (verified) {
        return NextResponse.json({
          success: true,
          verified: true,
          message: 'Verified: You are in the BitSage Discord server!',
          reward: 10,
        });
      } else {
        return NextResponse.json({
          success: true,
          verified: false,
          message: 'Please join the BitSage Discord server first',
        });
      }
    }

    return NextResponse.json(
      { success: false, verified: false, message: 'Unknown task type' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { success: false, verified: false, message: 'Verification failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to check connection status
export async function GET(request: NextRequest) {
  const githubCookie = request.cookies.get('github_connection')?.value;
  const twitterCookie = request.cookies.get('twitter_connection')?.value;
  const discordCookie = request.cookies.get('discord_connection')?.value;

  const connections: Record<string, { connected: boolean; username?: string }> = {
    github: { connected: false },
    twitter: { connected: false },
    discord: { connected: false },
  };

  if (githubCookie) {
    try {
      const data = JSON.parse(Buffer.from(githubCookie, 'base64').toString('utf-8'));
      connections.github = { connected: true, username: data.githubLogin };
    } catch {
      // Invalid cookie
    }
  }

  if (twitterCookie) {
    try {
      const data = JSON.parse(Buffer.from(twitterCookie, 'base64').toString('utf-8'));
      connections.twitter = { connected: true, username: data.twitterHandle };
    } catch {
      // Invalid cookie
    }
  }

  if (discordCookie) {
    try {
      const data = JSON.parse(Buffer.from(discordCookie, 'base64').toString('utf-8'));
      connections.discord = { connected: true, username: data.discordUsername };
    } catch {
      // Invalid cookie
    }
  }

  return NextResponse.json({ connections });
}
