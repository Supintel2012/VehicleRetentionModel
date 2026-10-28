import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { RunModel } from "./solve-handler.ts";

/**
 * RR Toolbox MCP client: one Streamable HTTP session per solve, authenticated
 * with this server's RR Toolbox key. The browser never sees the key or the
 * MCP endpoint.
 */

/** Per-call limit inside the handler's 45 s overall budget. */
export const TOOL_TIMEOUT_MS = 40_000;
/** Wait for the session-ending DELETE; with the 45 s budget this stays inside the route's 60 s maxDuration. */
export const SESSION_END_TIMEOUT_MS = 2_000;

/**
 * Every request the transport makes (POST, the optional GET stream, DELETE)
 * refuses redirects, so the Authorization header is never re-sent to another
 * host. The SDK applies `requestInit` to POST and DELETE only.
 */
const fetchWithoutRedirects = (url: string | URL, init?: RequestInit) => fetch(url, { ...init, redirect: "error" });

/**
 * Best-effort HTTP DELETE of the upstream session. The RR Toolbox MCP is
 * stateful, and `client.close()` alone leaves the session open there until its
 * idle timeout. A DELETE still pending after the wait is aborted by the
 * `client.close()` that follows.
 */
async function endSession(transport: StreamableHTTPClientTransport) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    transport.terminateSession().catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, SESSION_END_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(timer);
}

export const runDecisionModel: RunModel = async ({ url, apiKey, arguments: args, signal }) => {
  const client = new Client({ name: "vehicle-retention-model", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    fetch: fetchWithoutRedirects,
  });
  try {
    await client.connect(transport, { signal });
    return await client.callTool({ name: "run_decision_model", arguments: args }, undefined, {
      timeout: TOOL_TIMEOUT_MS,
      signal,
    });
  } finally {
    await endSession(transport);
    await client.close().catch(() => undefined);
  }
};
