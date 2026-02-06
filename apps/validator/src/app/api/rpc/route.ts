import { NextRequest, NextResponse } from "next/server";
import { getServerRpcUrl } from "@/lib/env";

// Server-side RPC proxy to avoid CORS issues
const RPC_URL = getServerRpcUrl();

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
