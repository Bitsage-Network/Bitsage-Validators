import { NextRequest, NextResponse } from "next/server";

// Server-side RPC proxy to avoid CORS issues
// Using Alchemy's public Starknet Sepolia endpoint
const RPC_URL = "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/demo";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[RPC Proxy] Error:", error);
    return NextResponse.json(
      { error: "RPC request failed" },
      { status: 500 }
    );
  }
}
