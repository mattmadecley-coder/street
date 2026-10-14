import type { TokenPrincipal } from "@/lib/mcp-tokens";
import type { Actor } from "@/lib/audit";
import { ToolError, toolsFor, type ToolContext } from "@/lib/mcp/tools";

/**
 * A small, stateless MCP server (JSON-RPC 2.0 over HTTP POST, the "Streamable HTTP" transport without
 * streaming). It implements what assistants actually use: initialize, ping, tools/list and tools/call.
 */
export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVER_INFO = { name: "street-admin", title: "Street admin", version: "1.0.0" };

export const SERVER_INSTRUCTIONS =
  "This server lets you build email for Street's customers: segments (who), templates (what) and campaign drafts. " +
  "Call email_guide first. Everything you create is a draft for a person to review at the links returned; " +
  "you can only send to customers if the token allows it AND a person explicitly asked you to. " +
  "Never invent customer data; use search_products for real products.";

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, any> };
export type JsonRpcResponse = { jsonrpc: "2.0"; id: JsonRpcId; result?: unknown; error?: { code: number; message: string; data?: unknown } };

const ok = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
const fail = (id: JsonRpcId, code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

export function actorFor(principal: TokenPrincipal): Actor {
  return { id: principal.userId, label: `${principal.email} via MCP token “${principal.tokenName}”` };
}

const MAX_RESULT_CHARS = 60_000;

function toolResult(value: unknown, isError = false) {
  let textValue = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (textValue.length > MAX_RESULT_CHARS) textValue = `${textValue.slice(0, MAX_RESULT_CHARS)}\n…[truncated; ask for something narrower]`;
  return { content: [{ type: "text", text: textValue }], isError };
}

/** Handles one JSON-RPC message. Returns null for notifications (which get no response). */
export async function handleMessage(message: unknown, principal: TokenPrincipal, deps: { nowMs?: number; runInBackground?: (job: () => Promise<unknown>) => void } = {}): Promise<JsonRpcResponse | null> {
  if (typeof message !== "object" || !message || Array.isArray(message)) return fail(null, -32600, "Invalid request.");
  const request = message as JsonRpcRequest;
  const hasId = request.id !== undefined;
  const id: JsonRpcId = hasId ? (request.id as JsonRpcId) : null;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") return hasId ? fail(id, -32600, "Invalid request.") : null;
  const params = (typeof request.params === "object" && request.params ? request.params : {}) as Record<string, any>;

  switch (request.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_PROTOCOLS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
      return ok(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: toolsFor(principal).map((tool) => ({
          name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema,
          annotations: { readOnlyHint: tool.readOnly, destructiveHint: Boolean(tool.sends), openWorldHint: Boolean(tool.sends) },
        })),
      });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const allowed = toolsFor(principal);
      const tool = allowed.find((entry) => entry.name === name);
      if (!tool) {
        // Distinguish "does not exist" from "exists but this token may not use it" so the assistant can tell the person why.
        return ok(id, toolResult(`The tool "${name}" is not available to this token. Your role or token settings do not allow it${name.includes("send") || name.includes("schedule") || name.includes("cancel") ? " (sending email needs a token created with sending enabled)" : ""}.`, true));
      }
      const args = (typeof params.arguments === "object" && params.arguments && !Array.isArray(params.arguments) ? params.arguments : {}) as Record<string, any>;
      const ctx: ToolContext = { principal, nowMs: deps.nowMs ?? Date.now(), actor: actorFor(principal), runInBackground: deps.runInBackground ?? ((job) => { void job().catch((error) => console.error("mcp background job failed", error)); }) };
      try {
        return ok(id, toolResult(await tool.run(args, ctx)));
      } catch (error) {
        if (error instanceof ToolError) return ok(id, toolResult(error.message, true));
        console.error("mcp tool failed", name, error);
        return ok(id, toolResult("Something went wrong on the server. Nothing was changed unless a result above says so. Try again, or ask a person to check the admin.", true));
      }
    }
    default:
      return hasId ? fail(id, -32601, `Method not found: ${request.method}`) : null;
  }
}

/** Handles a request body that may be a single message or a batch. Returns null when nothing needs to be sent back. */
export async function handleBody(body: unknown, principal: TokenPrincipal, deps: Parameters<typeof handleMessage>[2] = {}): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) return fail(null, -32600, "Empty batch.");
    if (body.length > 20) return fail(null, -32600, "Batch too large.");
    const responses = (await Promise.all(body.map((message) => handleMessage(message, principal, deps)))).filter((item): item is JsonRpcResponse => item !== null);
    return responses.length ? responses : null;
  }
  return handleMessage(body, principal, deps);
}
