import type { SolveErrorResponse, SolveResponse } from "./types";

/** A failed solve whose message is plain language and safe to show as is. */
export class SolveRequestError extends Error {
  name = "SolveRequestError";
}

export const SOLVE_FALLBACK_MESSAGE = "The model could not be solved right now. Please try again.";
const NETWORK_MESSAGE = "This page could not reach its server. Check your connection and try again.";
const TIMEOUT_MESSAGE = "The solve is taking longer than expected. Please try again.";
/** Just under the route's 60 s maxDuration. */
const CLIENT_TIMEOUT_MS = 55_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isErrorResponse(value: unknown): value is SolveErrorResponse {
  return (
    isRecord(value) &&
    value.status === "error" &&
    typeof value.message === "string" &&
    value.message.trim().length > 0 &&
    value.message.length <= 500
  );
}

function isSolveResponse(value: unknown): value is SolveResponse {
  return (
    isRecord(value) &&
    value.status === "success" &&
    isRecord(value.data) &&
    typeof value.attribution === "string" &&
    Array.isArray(value.warnings)
  );
}

/**
 * Message for a failed response. The route always answers with a reason code
 * and a plain message; anything else (a hosting-platform error page, a proxy
 * timeout) gets a fixed message rather than the raw body.
 */
export function solveErrorMessage(status: number, payload: unknown): string {
  if (isErrorResponse(payload)) return payload.message;
  if (status === 504 || status === 408) return TIMEOUT_MESSAGE;
  return SOLVE_FALLBACK_MESSAGE;
}

export async function solveVehicleRetention(
  body: Record<string, unknown>,
): Promise<SolveResponse> {
  // A timer, not AbortSignal.timeout(): that is missing before Safari 16,
  // Chrome 103 and Firefox 100, which Next 15's default browser targets include.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CLIENT_TIMEOUT_MS);
  try {
    let r: Response;
    try {
      r = await fetch("/api/vehicle-retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new SolveRequestError(timedOut ? TIMEOUT_MESSAGE : NETWORK_MESSAGE);
    }
    const payload: unknown = await r.json().catch(() => null);
    if (r.ok && isSolveResponse(payload)) return payload;
    throw new SolveRequestError(timedOut ? TIMEOUT_MESSAGE : solveErrorMessage(r.status, payload));
  } finally {
    clearTimeout(timer);
  }
}
