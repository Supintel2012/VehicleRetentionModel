import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { SOLVE_FALLBACK_MESSAGE, SolveCancelledError, SolveRequestError, solveErrorMessage, solveVehicleRetention } from "./client.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function respond(status: number, body: string, contentType = "application/json") {
  globalThis.fetch = async () => new Response(body, { status, headers: { "content-type": contentType } });
}

async function messageOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof SolveRequestError, "the wizard only shows SolveRequestError messages");
    return error.message;
  }
  assert.fail("expected the solve to fail");
}

test("the route's plain message is shown as is", async () => {
  respond(400, JSON.stringify({ status: "error", reason: "invalid_input", message: "Vehicle age must be between 0 years and 10 years." }));
  assert.equal(await messageOf(solveVehicleRetention({})), "Vehicle age must be between 0 years and 10 years.");
});

test("raw bodies are never shown: platform error pages and odd JSON get a fixed message", async () => {
  respond(502, "<html><body>Bad gateway from 10.20.30.40:8000</body></html>", "text/html");
  assert.equal(await messageOf(solveVehicleRetention({})), SOLVE_FALLBACK_MESSAGE);

  respond(500, JSON.stringify({ detail: "Traceback ... http://10.20.30.40:8000/vehicle-retention/solve" }));
  assert.equal(await messageOf(solveVehicleRetention({})), SOLVE_FALLBACK_MESSAGE);

  respond(504, "An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT", "text/plain");
  assert.match(await messageOf(solveVehicleRetention({})), /taking longer than expected/);

  respond(200, JSON.stringify({ status: "success", data: null }));
  assert.equal(await messageOf(solveVehicleRetention({})), SOLVE_FALLBACK_MESSAGE);
});

test("a network failure reaching this site's own server gets a connection message", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  assert.match(await messageOf(solveVehicleRetention({})), /could not reach its server/);
});

test("a successful response is returned unchanged", async () => {
  const body = { status: "success", data: { policy: [1] }, attribution: "Source: test", warnings: [] };
  let sent: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    sent = init;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  assert.deepEqual(await solveVehicleRetention({ StdMiles: 15_000 }), body);
  assert.equal(sent?.method, "POST");
  assert.equal(sent?.body, JSON.stringify({ StdMiles: 15_000 }));
});

test("error messages over 500 characters or blank are not trusted", () => {
  assert.equal(solveErrorMessage(502, { status: "error", message: "x".repeat(501) }), SOLVE_FALLBACK_MESSAGE);
  assert.equal(solveErrorMessage(502, { status: "error", message: "  " }), SOLVE_FALLBACK_MESSAGE);
  assert.equal(solveErrorMessage(502, { status: "error", message: "The solver is temporarily unavailable." }), "The solver is temporarily unavailable.");
});

test("a solve that outlasts the client's wait gets the timeout message, without AbortSignal.timeout", async () => {
  // Safari 15 and Chrome < 103 have no AbortSignal.timeout; the client must not depend on it.
  const timeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
  Reflect.deleteProperty(AbortSignal, "timeout");
  mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  globalThis.fetch = (_url, init) => {
    signal = init?.signal ?? undefined;
    return new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  };
  try {
    const pending = messageOf(solveVehicleRetention({}));
    await Promise.resolve();
    assert.ok(signal, "the request was sent");
    mock.timers.tick(54_999);
    assert.equal(signal.aborted, false, "still waiting just under the route's 60 s limit");
    mock.timers.tick(1);
    assert.match(await pending, /taking longer than expected/);
  } finally {
    mock.timers.reset();
    if (timeout) Object.defineProperty(AbortSignal, "timeout", timeout);
  }
});

// ── Phase 2: cancelling a superseded solve ──────────────────────────────────

test("aborting the caller's signal cancels the request with SolveCancelledError, not a message to show", async () => {
  let seen: AbortSignal | undefined;
  globalThis.fetch = (_url, init) => {
    seen = init?.signal ?? undefined;
    return new Promise((_, reject) => seen?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  };
  const caller = new AbortController();
  const pending = solveVehicleRetention({}, { signal: caller.signal });
  await Promise.resolve();
  assert.equal(seen?.aborted, false);
  caller.abort();
  await assert.rejects(pending, SolveCancelledError);
  assert.equal(seen?.aborted, true, "the fetch itself is aborted");
});

test("a signal aborted before the call sends nothing; one aborted while the body is read still cancels", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ status: "success", data: {}, attribution: "x", warnings: [] }));
  };
  const before = new AbortController();
  before.abort();
  await assert.rejects(solveVehicleRetention({}, { signal: before.signal }), SolveCancelledError);
  assert.equal(calls, 0);

  const during = new AbortController();
  globalThis.fetch = async () => {
    during.abort();
    return new Response(JSON.stringify({ status: "success", data: {}, attribution: "x", warnings: [] }));
  };
  await assert.rejects(solveVehicleRetention({}, { signal: during.signal }), SolveCancelledError);
});
