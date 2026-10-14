import { after, NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/mcp-tokens";
import { handleBody } from "@/lib/mcp/server";
import { rateLimited } from "@/lib/email-marketing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;

const unauthorized = () =>
  NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized. Send an Authorization: Bearer street_mcp_… token created in Admin → Your account → AI access." } }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="street-admin"' } });

/**
 * Street admin MCP endpoint (Streamable HTTP, JSON responses). Authenticated by a personal access token.
 * GET is not supported (no server-initiated streams), which the protocol allows.
 */
export async function POST(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const principal = presented ? await verifyToken(presented).catch(() => null) : null;
  if (!principal) return unauthorized();

  if (rateLimited(`mcp:${principal.tokenId}`, 120, 60_000)) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32002, message: "Too many requests. Slow down and try again in a minute." } }, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large." } }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } }, { status: 400 });
  }

  const result = await handleBody(body, principal, { runInBackground: (job) => after(() => job().catch((error) => console.error("mcp background job failed", error))) });
  if (result === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(result);
}

export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
