import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRateLimiter } from "./rate-limit.ts";
import { FAILURES } from "./solve-errors.ts";
import { createSolveHandler, DEFAULT_MCP_URL, MAX_BODY_BYTES, type RunModel, type RunModelCall } from "./solve-handler.ts";
import { buildSolveBody, VEHICLE_RETENTION_TEMPLATE } from "./template.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/ados-default-run.json", import.meta.url), "utf8"));
const ORIGIN = "https://vehicle-retention.example";
const KEY = "test-key-not-a-real-credential";
const sample = buildSolveBody(VEHICLE_RETENTION_TEMPLATE, VEHICLE_RETENTION_TEMPLATE.sample_answers);

/** Sample-answers state (age 7, 28 mpg, $5.50, econ 95 snapped to 90), as the engine reports it. */
const sampleQueryState = {
  state_id: 593,
  label: "Age7_mpg28_price55_y90",
  matched: { age: 7, fuel_economy: 28, fuel_price: 5.5, econ_condition: 90 },
  recommended_action: "sell",
  recommended_action_index: 2,
  value: 327347.55,
};

function toolResult() {
  const envelope = structuredClone(fixture.envelope);
  envelope.raw.data.query_state = sampleQueryState;
  return { content: [{ type: "text", text: JSON.stringify(envelope) }] };
}

function setup(overrides: { env?: Record<string, string | undefined>; runModel?: RunModel; limit?: number; timeoutMs?: number } = {}) {
  const calls: RunModelCall[] = [];
  const logs: string[] = [];
  const runModel: RunModel = overrides.runModel ?? (async () => toolResult());
  const handler = createSolveHandler({
    env: overrides.env ?? { RRTOOLBOX_API_KEY: KEY },
    runModel: async (call) => {
      calls.push(call);
      return runModel(call);
    },
    limiter: createRateLimiter({ limit: overrides.limit ?? 20, windowMs: 60_000 }),
    log: (line) => logs.push(line),
    timeoutMs: overrides.timeoutMs,
  });
  return { handler, calls, logs };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/vehicle-retention`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function read(response: Response) {
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test("a same-origin solve forwards only validated parameters and returns the adapted result", async () => {
  const { handler, calls } = setup();
  const { status, headers, body } = await read(await handler(post(sample)));
  assert.equal(status, 200);
  assert.equal(headers.get("cache-control"), "no-store");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].apiKey, KEY);
  assert.equal(calls[0].url.href, DEFAULT_MCP_URL);
  assert.deepEqual(calls[0].arguments, {
    model_name: "AutoDriveOrSell",
    parameters: {
      StdMiles: 15_000, ReducedMiles: 12_000, PriceNewCar: 43_000, FixedCost: 2_500, d: 0.05,
      query_state: { age: 7, fuel_economy: 28, fuel_price: 5.5, econ_condition: 95 },
    },
  });
  assert.equal(body.status, "success");
  assert.equal(body.attribution, fixture.envelope.attribution);
  assert.deepEqual(body.warnings, []);
  assert.deepEqual(body.data.summary.decision_breakdown, { drive: 472, sell: 408, reduce: 0 });
  assert.equal(body.data.state_table.length, 880);
  assert.deepEqual(body.data.query_state, sampleQueryState);
});

test("RRTOOLBOX_MCP_URL overrides the endpoint; non-HTTPS remote URLs are refused as not configured", async () => {
  const local = setup({ env: { RRTOOLBOX_API_KEY: KEY, RRTOOLBOX_MCP_URL: " http://127.0.0.1:8787/mcp\n" } });
  assert.equal((await local.handler(post(sample))).status, 200);
  assert.equal(local.calls[0].url.href, "http://127.0.0.1:8787/mcp");

  for (const url of ["http://10.20.30.40:8000/mcp", "not a url", "https://user:pass@api.rapidrecursive.com/mcp"]) {
    const { handler, calls, logs } = setup({ env: { RRTOOLBOX_API_KEY: KEY, RRTOOLBOX_MCP_URL: url } });
    const { status, body } = await read(await handler(post(sample)));
    assert.equal(status, 503, url);
    assert.deepEqual(body, { status: "error", reason: "not_configured", message: FAILURES.not_configured.message });
    assert.equal(calls.length, 0);
    assert.equal(logs.some((line) => line.includes(url)), false, "the override value is not logged");
  }
});

test("a missing key is reported as not configured and nothing is called", async () => {
  for (const env of [{}, { RRTOOLBOX_API_KEY: "  " }]) {
    const { handler, calls, logs } = setup({ env });
    const { status, body } = await read(await handler(post(sample)));
    assert.equal(status, 503);
    assert.equal(body.reason, "not_configured");
    assert.equal(calls.length, 0);
    assert.match(logs[0], /RRTOOLBOX_API_KEY is not set/);
  }
});

test("cross-origin or origin-less POSTs are refused before anything else", async () => {
  for (const headers of [{ origin: "https://attacker.example" }, { origin: "null" }, { origin: "" }]) {
    const { handler, calls } = setup();
    const { status, body } = await read(await handler(post(sample, headers)));
    assert.equal(status, 403);
    assert.deepEqual(body, { status: "error", reason: "invalid_input", message: "Solve requests must come from this site." });
    assert.equal(calls.length, 0);
  }
  const { handler } = setup();
  const noOrigin = new Request(`${ORIGIN}/api/vehicle-retention`, { method: "POST", body: JSON.stringify(sample) });
  assert.equal((await handler(noOrigin)).status, 403);
});

test("the origin is checked against the Host the browser used, not request.url", async () => {
  // `next start` hands route handlers http://localhost:<port> URLs whatever the Host header says.
  const behindProxy = (headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/vehicle-retention", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(sample),
    });
  const cases: [Record<string, string>, number][] = [
    [{ origin: ORIGIN, "x-forwarded-host": "vehicle-retention.example", host: "localhost:3000" }, 200],
    [{ origin: ORIGIN, host: "Vehicle-Retention.example" }, 200],
    [{ origin: "http://localhost:3000" }, 200],
    [{ origin: "https://attacker.example", "x-forwarded-host": "vehicle-retention.example" }, 403],
    [{ origin: ORIGIN, host: "localhost:3000" }, 403],
    [{ origin: "null", host: "vehicle-retention.example" }, 403],
  ];
  for (const [headers, status] of cases) {
    const { handler } = setup();
    assert.equal((await handler(behindProxy(headers))).status, status, JSON.stringify(headers));
  }
});

test("invalid bodies get a 400 with the validator's message and are never forwarded", async () => {
  const { handler, calls } = setup();
  const unknown = await read(await handler(post({ ...sample, nAge: 500 })));
  assert.equal(unknown.status, 400);
  assert.deepEqual(unknown.body, { status: "error", reason: "invalid_input", message: '"nAge" is not an input this demo accepts.' });

  const range = await read(await handler(post({ ...sample, PriceNewCar: 1_000_000 })));
  assert.equal(range.status, 400);
  assert.match(range.body.message, /^Replacement vehicle price must be between/);

  const notJson = await read(await handler(post("{StdMiles: 15000")));
  assert.deepEqual([notJson.status, notJson.body.message], [400, "The request body must be JSON."]);

  const huge = await read(await handler(post({ StdMiles: 15_000, pad: "x".repeat(10_000) })));
  assert.deepEqual([huge.status, huge.body.reason, huge.body.message], [413, "invalid_input", "The request is too large."]);

  assert.equal(calls.length, 0);
});

test("more than the per-client limit within the window gets 429 with Retry-After", async () => {
  const { handler, calls } = setup({ limit: 2 });
  assert.equal((await handler(post(sample))).status, 200);
  assert.equal((await handler(post(sample))).status, 200);
  const limited = await read(await handler(post(sample)));
  assert.equal(limited.status, 429);
  assert.deepEqual(limited.body, { status: "error", reason: "rate_limited", message: FAILURES.rate_limited.message });
  const retryAfter = Number(limited.headers.get("retry-after"));
  assert.ok(retryAfter > 0 && retryAfter <= 60, `Retry-After ${retryAfter}`);
  assert.equal(calls.length, 2);
  // A proxy appends the address it saw; anything to its left came from the client.
  const spoofed = await handler(post(sample, { "x-forwarded-for": "198.51.100.1, 203.0.113.7" }));
  assert.equal(spoofed.status, 429, "an address the client prepends does not evade the limit");
  assert.equal((await handler(post(sample, { "x-forwarded-for": "203.0.113.7, 198.51.100.9" }))).status, 200, "another client is not limited");
  assert.equal(calls.length, 3);
});

/** A body streamed without Content-Length, as with chunked transfer encoding. */
function streamedPost(chunks: () => Uint8Array | null) {
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });
  const request = new Request(`${ORIGIN}/api/vehicle-retention`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body,
    duplex: "half",
  } as RequestInit);
  assert.equal(request.headers.get("content-length"), null);
  return request;
}

test("a streamed body is refused once it passes the size limit, without reading the rest", async () => {
  const { handler, calls } = setup();
  const chunk = new Uint8Array(1_024).fill(0x20);
  let pulled = 0;
  const total = 4 * 1_024 * 1_024;
  const response = await read(await handler(streamedPost(() => (pulled < total ? ((pulled += chunk.length), chunk) : null))));
  assert.deepEqual([response.status, response.body.message], [413, "The request is too large."]);
  assert.ok(pulled <= MAX_BODY_BYTES + 4 * chunk.length, `read ${pulled} bytes of a ${total}-byte body`);
  assert.equal(calls.length, 0);
});

test("a streamed body within the limit is read whole", async () => {
  const { handler, calls } = setup();
  const bytes = new TextEncoder().encode(JSON.stringify(sample));
  const parts = [bytes.slice(0, 7), bytes.slice(7, 40), bytes.slice(40)];
  assert.equal((await handler(streamedPost(() => parts.shift() ?? null))).status, 200);
  assert.deepEqual(calls[0].arguments.parameters, JSON.parse(JSON.stringify(sample)));
});

test("upstream failures return only the reason and fixed message; detail goes to the log without the key", async () => {
  const leaky = [
    [Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("connect ECONNREFUSED 10.20.30.40:8000"), { code: "ECONNREFUSED" }) }), "unreachable", 502],
    [new StreamableHTTPError(401, `Error POSTing to endpoint: {"detail":"Invalid API key ${KEY}"}`), "unauthorized", 502],
    [new Error("Unexpected token < in JSON at https://internal.rrtoolbox.example/mcp"), "protocol_error", 502],
  ] as const;
  for (const [error, reason, status] of leaky) {
    const { handler, logs } = setup({ runModel: async () => { throw error; } });
    const response = await handler(post(sample));
    const text = await response.text();
    assert.equal(response.status, status, reason);
    assert.deepEqual(JSON.parse(text), { status: "error", reason, message: FAILURES[reason].message });
    for (const leak of ["10.20.30.40", "internal.rrtoolbox.example", "Invalid API key", KEY]) {
      assert.equal(text.includes(leak), false, `${reason} response leaked ${leak}`);
    }
    assert.equal(logs.length, 1);
    assert.match(logs[0], new RegExp(`^\\[vehicle-retention\\] ${reason}: `));
    assert.equal(logs[0].includes(KEY), false, "the key never reaches the log");
  }
});

test("a tool error with the RR Toolbox's 403 is reported as unauthorized", async () => {
  const text = 'Error calling run_decision_model. Status code: 403. Response: {"detail":"Requires read_write access (you have read)"}';
  const { handler } = setup({ runModel: async () => ({ isError: true, content: [{ type: "text", text }] }) });
  const { status, body } = await read(await handler(post(sample)));
  assert.equal(status, 502);
  assert.deepEqual(body, { status: "error", reason: "unauthorized", message: FAILURES.unauthorized.message });
});

test("the overall time budget aborts a slow call and reports a timeout", async () => {
  const { handler } = setup({
    timeoutMs: 20,
    runModel: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
  });
  // AbortSignal.timeout's timer does not keep the process alive; a server's sockets would.
  const keepAlive = setInterval(() => undefined, 1_000);
  try {
    const { status, body } = await read(await handler(post(sample)));
    assert.equal(status, 504);
    assert.equal(body.reason, "timeout");
  } finally {
    clearInterval(keepAlive);
  }
});
