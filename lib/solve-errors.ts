import type { SolveErrorResponse, SolveFailureReason } from "./types.ts";
import { SolveInputError } from "./solve-input.ts";
import { SolveProtocolError, SolveToolError } from "./solve-result.ts";

/**
 * Failure classification for the solve route. Every reason has one fixed,
 * plain-language message; responses never carry upstream URLs, hosts, IPs,
 * stack traces or upstream bodies. Detail goes to server logs only, with
 * credentials redacted.
 */

export const FAILURES: Record<SolveFailureReason, { status: number; message: string }> = {
  not_configured: {
    status: 503,
    message: "The solver is not set up on this deployment yet. Please contact Supported Intelligence.",
  },
  unauthorized: {
    status: 502,
    message: "The solver did not accept this site's access key. Please contact Supported Intelligence.",
  },
  rate_limited: {
    status: 429,
    message: "Too many solves in a short time. Please wait a minute and try again.",
  },
  timeout: {
    status: 504,
    message: "The solver took too long to respond. Please try again.",
  },
  unreachable: {
    status: 502,
    message: "The solver is temporarily unavailable. Please try again in a few minutes.",
  },
  tool_error: {
    status: 502,
    message: "The solver could not complete this run. Please try again.",
  },
  invalid_input: {
    status: 400,
    message: "Some answers are outside the ranges this model supports. Please review them and try again.",
  },
  protocol_error: {
    status: 502,
    message: "The solver returned a result this page could not read. Please try again later.",
  },
};

const NETWORK_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "ECONNABORTED",
]);

/** MCP JSON-RPC code the SDK uses when a request times out or is aborted. */
const MCP_REQUEST_TIMEOUT = -32001;

function errorRecord(error: unknown): Record<string, unknown> {
  return error !== null && typeof error === "object" ? (error as Record<string, unknown>) : {};
}

/** Upstream HTTP status: the SDK's StreamableHTTPError carries it as a numeric `code`. */
function httpStatus(error: unknown): number | null {
  const value = errorRecord(error);
  if (typeof value.code === "number" && value.code >= 100 && value.code < 600) return value.code;
  const status = value.status ?? value.statusCode;
  return typeof status === "number" && status >= 100 && status < 600 ? status : null;
}

function networkCode(error: unknown): string | null {
  const value = errorRecord(error);
  if (typeof value.code === "string") return value.code;
  const cause = errorRecord(value.cause);
  return typeof cause.code === "string" ? cause.code : null;
}

function statusReason(status: number): SolveFailureReason {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "unreachable";
  return "protocol_error";
}

/**
 * Map anything thrown while calling or parsing a solve to a reason code.
 * (`not_configured` is decided by the handler before any call is made.)
 */
export function classifySolveFailure(error: unknown): SolveFailureReason {
  if (error instanceof SolveInputError) return "invalid_input";
  if (error instanceof SolveProtocolError) return "protocol_error";
  if (error instanceof SolveToolError) {
    const status = error.upstreamStatus;
    if (status === 401 || status === 403) return "unauthorized";
    if (status === 429) return "rate_limited";
    if (status === 400 || status === 422) return "invalid_input";
    return "tool_error";
  }

  const name = error instanceof Error ? error.name : "";
  const code = errorRecord(error).code;
  if (name === "TimeoutError" || name === "AbortError" || code === MCP_REQUEST_TIMEOUT) return "timeout";
  const network = networkCode(error);
  if (network === "UND_ERR_HEADERS_TIMEOUT" || network === "UND_ERR_BODY_TIMEOUT") return "timeout";
  if ((network && NETWORK_CODES.has(network)) || (name === "TypeError" && /fetch failed|network/i.test(String(errorRecord(error).message)))) {
    return "unreachable";
  }
  const status = httpStatus(error);
  if (status !== null) return statusReason(status);
  // Other JSON-RPC errors from the server (unknown tool, invalid params, internal error, ...).
  if (typeof code === "number" && code <= -32000 && code >= -32768) return "tool_error";
  return "protocol_error";
}

/** Response body for a failure. Only SolveInputError, which this app writes, supplies its own message. */
export function failureBody(reason: SolveFailureReason, error?: unknown): SolveErrorResponse {
  const message = reason === "invalid_input" && error instanceof SolveInputError
    ? error.message
    : FAILURES[reason].message;
  return { status: "error", reason, message };
}

/** Remove credentials from text bound for server logs. */
export function redactSecrets(text: string, secrets: readonly (string | undefined)[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out
    .replace(/RRT-[A-Za-z0-9_-]+/g, "RRT-[redacted]")
    .replace(/(Bearer\s+)[^\s"',]+/gi, "$1[redacted]");
}

/** One-line, redacted description of an error for server logs (may name upstream hosts). */
export function describeForLog(error: unknown, secrets: readonly (string | undefined)[] = []): string {
  const value = errorRecord(error);
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  const code = value.code !== undefined ? ` code=${String(value.code)}` : "";
  const cause = errorRecord(value.cause);
  const causeText = typeof cause.message === "string"
    ? ` cause=${cause.message}${cause.code !== undefined ? ` (${String(cause.code)})` : ""}`
    : "";
  return redactSecrets(`${name}${code}: ${message}${causeText}`, secrets).slice(0, 2000);
}
