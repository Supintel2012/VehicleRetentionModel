import type { SolveFailureReason, SolveResponse } from "./types.ts";
import type { RateLimiter } from "./rate-limit.ts";
import { parseSolveRequest, SolveInputError, type SolveParameters } from "./solve-input.ts";
import { adaptToolResult } from "./solve-result.ts";
import { classifySolveFailure, describeForLog, failureBody, FAILURES } from "./solve-errors.ts";

/**
 * POST /api/vehicle-retention, independent of Next.js so it can be tested
 * with plain Request objects. The route wires in the MCP client.
 */

export const DEFAULT_MCP_URL = "https://api.rapidrecursive.com/mcp";
export const MODEL_NAME = "AutoDriveOrSell";
/** Overall budget for the MCP handshake and tool call; the route's maxDuration is 60 s. */
export const SOLVE_TIMEOUT_MS = 45_000;
/** Valid bodies are a few hundred bytes. */
export const MAX_BODY_BYTES = 8_192;

export interface RunModelCall {
  url: URL;
  apiKey: string;
  arguments: { model_name: typeof MODEL_NAME; parameters: SolveParameters };
  signal: AbortSignal;
}

/** Calls `run_decision_model` and returns the raw MCP tool result. */
export type RunModel = (call: RunModelCall) => Promise<unknown>;

export interface SolveHandlerOptions {
  /** Source of RRTOOLBOX_API_KEY and RRTOOLBOX_MCP_URL, read on every request; pass `process.env` itself. */
  env: Readonly<Record<string, string | undefined>>;
  runModel: RunModel;
  limiter: RateLimiter;
  log?: (line: string) => void;
  timeoutMs?: number;
}

/** The MCP endpoint, or null when the override is unusable. Plain HTTP is allowed only for loopback. */
export function resolveMcpUrl(value: string | undefined): URL | null {
  let url: URL;
  try {
    url = new URL(value?.trim() || DEFAULT_MCP_URL);
  } catch {
    return null;
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password) return null;
  return url.protocol === "https:" || (url.protocol === "http:" && loopback) ? url : null;
}

/**
 * CSRF guard in the style of Next.js's own Server Actions check: browsers send
 * Origin on every POST, and its host must be the host the request was sent to
 * (x-forwarded-host behind a proxy such as Vercel's, otherwise Host).
 * request.url is only a fallback because `next start` reports localhost there.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || request.headers.get("host")?.trim() || new URL(request.url).host;
  return originHost === host.toLowerCase();
}

/**
 * Rate-limit key: the right-most X-Forwarded-For hop, which is the address the
 * nearest proxy saw. Entries to its left are whatever the client sent. Vercel
 * replaces the header with the client's address; a bare `next start` keeps the
 * client's own header, so self-hosting needs a reverse proxy that sets or
 * appends it (see README).
 */
export function clientKey(request: Request): string {
  const nearest = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  return nearest || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * The body as UTF-8 text, or null as soon as it passes `limit` bytes. Counting
 * while reading also bounds chunked bodies, which carry no Content-Length.
 */
async function readBody(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      void reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function errorResponse(
  reason: SolveFailureReason,
  options: { error?: unknown; status?: number; headers?: Record<string, string> } = {},
) {
  return Response.json(failureBody(reason, options.error), {
    status: options.status ?? FAILURES[reason].status,
    headers: { "Cache-Control": "no-store", ...options.headers },
  });
}

function inputError(message: string, status = 400) {
  return errorResponse("invalid_input", { error: new SolveInputError(message), status });
}

export function createSolveHandler(options: SolveHandlerOptions): (request: Request) => Promise<Response> {
  const log = options.log ?? ((line: string) => console.error(line));
  const timeoutMs = options.timeoutMs ?? SOLVE_TIMEOUT_MS;

  return async function handleSolve(request) {
    if (!isSameOrigin(request)) return inputError("Solve requests must come from this site.", 403);

    if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return inputError("The request is too large.", 413);
    let text: string | null;
    try {
      text = await readBody(request, MAX_BODY_BYTES);
    } catch {
      return inputError("The request body could not be read.");
    }
    if (text === null) return inputError("The request is too large.", 413);

    let parameters: SolveParameters;
    try {
      parameters = parseSolveRequest(JSON.parse(text));
    } catch (error) {
      return error instanceof SolveInputError
        ? errorResponse("invalid_input", { error })
        : inputError("The request body must be JSON.");
    }

    const apiKey = options.env.RRTOOLBOX_API_KEY?.trim();
    const url = resolveMcpUrl(options.env.RRTOOLBOX_MCP_URL);
    if (!apiKey || !url) {
      log(`[vehicle-retention] not_configured: ${!apiKey ? "RRTOOLBOX_API_KEY is not set" : "RRTOOLBOX_MCP_URL is not a usable https URL"}`);
      return errorResponse("not_configured");
    }

    const decision = options.limiter.check(clientKey(request));
    if (!decision.allowed) {
      return errorResponse("rate_limited", { headers: { "Retry-After": String(Math.ceil(decision.retryAfterMs / 1000)) } });
    }

    try {
      const result = await options.runModel({
        url,
        apiKey,
        arguments: { model_name: MODEL_NAME, parameters },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
      });
      const { data, attribution, warnings } = adaptToolResult(result, parameters);
      const body: SolveResponse = { status: "success", data, attribution, warnings };
      return Response.json(body, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const reason = classifySolveFailure(error);
      log(`[vehicle-retention] ${reason}: ${describeForLog(error, [apiKey])}`);
      return errorResponse(reason, { error });
    }
  };
}
