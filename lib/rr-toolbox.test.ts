import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runDecisionModel, SESSION_END_TIMEOUT_MS } from "./rr-toolbox.ts";
import { classifySolveFailure } from "./solve-errors.ts";
import { MODEL_NAME, type RunModelCall } from "./solve-handler.ts";
import { adaptToolResult } from "./solve-result.ts";

/**
 * The real MCP SDK client against in-process MCP servers shaped like the
 * RR Toolbox one (Bearer key check, run_decision_model returning JSON text),
 * stateless and, like the RR Toolbox's fastapi-mcp endpoint, stateful.
 */

const KEY = "test-key-not-a-real-credential";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ados-default-run.json", import.meta.url), "utf8"));

interface Seen {
  authorization: string[];
  calls: { name: string; arguments: unknown }[];
}

type ToolBehaviour = () => Promise<CallToolResult>;

function listen(server: HttpServer): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

function mcpEndpoint(seen: Seen, behaviour: () => ToolBehaviour) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    seen.authorization.push(req.headers.authorization ?? "");
    if (req.method !== "POST") return void res.writeHead(405).end();
    if (req.headers.authorization !== `Bearer ${KEY}`) {
      res.writeHead(401, { "content-type": "application/json", "www-authenticate": 'Bearer resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource"' });
      return void res.end(JSON.stringify({ detail: "Invalid API key" }));
    }
    const server = new Server({ name: "RR Toolbox (test)", version: "0.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{ name: "run_decision_model", inputSchema: { type: "object" } }],
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      seen.calls.push({ name: request.params.name, arguments: request.params.arguments });
      return behaviour()();
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  };
}

/** Sessions are kept until a DELETE ends them (the RR Toolbox otherwise holds them for 30 idle minutes). */
interface Sessions {
  methods: string[];
  open: Map<string, StreamableHTTPServerTransport>;
  answerDelete: boolean;
}

function statefulEndpoint(sessions: Sessions, behaviour: () => ToolBehaviour) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    sessions.methods.push(req.method ?? "");
    if (req.headers.authorization !== `Bearer ${KEY}`) return void res.writeHead(401).end();
    if (req.method === "DELETE" && !sessions.answerDelete) return; // never answered
    const id = req.headers["mcp-session-id"];
    const existing = typeof id === "string" ? sessions.open.get(id) : undefined;
    if (existing) return existing.handleRequest(req, res);
    if (req.method !== "POST") return void res.writeHead(404).end();
    const server = new Server({ name: "RR Toolbox (stateful test)", version: "0.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{ name: "run_decision_model", inputSchema: { type: "object" } }],
    }));
    server.setRequestHandler(CallToolRequestSchema, async () => behaviour()());
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sessionId) => void sessions.open.set(sessionId, transport),
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.open.delete(transport.sessionId);
    };
    await server.connect(transport);
    await transport.handleRequest(req, res);
  };
}

const textResult = (envelope: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }] });

let behaviour: ToolBehaviour = async () => textResult(fixture.envelope);
const seen: Seen = { authorization: [], calls: [] };
const elsewhere: Seen = { authorization: [], calls: [] };
const sessions: Sessions = { methods: [], open: new Map(), answerDelete: true };
let mcpUrl: URL;
let redirectingUrl: URL;
let statefulUrl: URL;
const servers: HttpServer[] = [];

before(async () => {
  const mcp = createServer(mcpEndpoint(seen, () => behaviour));
  const other = createServer(mcpEndpoint(elsewhere, () => behaviour));
  const stateful = createServer(statefulEndpoint(sessions, () => behaviour));
  servers.push(mcp, other, stateful);
  mcpUrl = new URL("/mcp", await listen(mcp));
  const otherUrl = new URL("/mcp", await listen(other));
  statefulUrl = new URL("/mcp", await listen(stateful));
  const redirecting = createServer((_req, res) => res.writeHead(307, { location: otherUrl.href }).end());
  servers.push(redirecting);
  redirectingUrl = new URL("/mcp", await listen(redirecting));
});

after(() => {
  for (const server of servers) {
    server.closeAllConnections();
    server.close();
  }
});

function call(overrides: Partial<RunModelCall> = {}) {
  return runDecisionModel({
    url: mcpUrl,
    apiKey: KEY,
    arguments: { model_name: MODEL_NAME, parameters: { PriceNewCar: 43_000 } },
    signal: AbortSignal.timeout(10_000),
    ...overrides,
  });
}

async function failure(promise: Promise<unknown>) {
  try {
    adaptToolResult(await promise);
  } catch (error) {
    return classifySolveFailure(error);
  }
  assert.fail("expected the call to fail");
}

test("sends the key as a Bearer token and returns a result the adapter accepts", async () => {
  seen.authorization.length = 0;
  seen.calls.length = 0;
  behaviour = async () => textResult(fixture.envelope);
  const { data, attribution } = adaptToolResult(await call());
  assert.deepEqual(data.summary.decision_breakdown, { drive: 472, sell: 408, reduce: 0 });
  assert.equal(attribution, fixture.envelope.attribution);
  assert.deepEqual(seen.calls, [{
    name: "run_decision_model",
    arguments: { model_name: "AutoDriveOrSell", parameters: { PriceNewCar: 43_000 } },
  }]);
  assert.ok(seen.authorization.length >= 2, "handshake and call");
  assert.ok(seen.authorization.every((value) => value === `Bearer ${KEY}`));
});

test("a rejected key surfaces as unauthorized", async () => {
  assert.equal(await failure(call({ apiKey: "wrong-key" })), "unauthorized");
});

test("a tool error carrying the RR Toolbox's 403 surfaces as unauthorized", async () => {
  behaviour = async () => ({
    isError: true,
    content: [{ type: "text", text: 'Error calling run_decision_model. Status code: 403. Response: {"detail":"Requires read_write access (you have read)"}' }],
  });
  assert.equal(await failure(call()), "unauthorized");
});

test("redirects are refused, so the key is never sent to the redirect target", async () => {
  elsewhere.authorization.length = 0;
  behaviour = async () => textResult(fixture.envelope);
  assert.equal(await failure(call({ url: redirectingUrl })), "unreachable");
  assert.deepEqual(elsewhere.authorization, []);
});

test("a closed port surfaces as unreachable", async () => {
  const closed = createServer();
  const url = new URL("/mcp", await listen(closed));
  await new Promise((resolve) => closed.close(resolve));
  assert.equal(await failure(call({ url })), "unreachable");
});

test("the caller's abort signal ends a slow tool call as a timeout", async () => {
  behaviour = () => new Promise((resolve) => setTimeout(() => resolve(textResult(fixture.envelope)), 2_000));
  const started = Date.now();
  assert.equal(await failure(call({ signal: AbortSignal.timeout(150) })), "timeout");
  assert.ok(Date.now() - started < 1_500, "did not wait for the slow tool");
});

test("every solve ends its session on a stateful server, after success, a tool error or a timeout", async () => {
  sessions.methods.length = 0;
  sessions.answerDelete = true;
  behaviour = async () => textResult(fixture.envelope);
  adaptToolResult(await call({ url: statefulUrl }));
  behaviour = async () => ({ isError: true, content: [{ type: "text", text: "Error calling run_decision_model. Status code: 500." }] });
  assert.equal(await failure(call({ url: statefulUrl })), "tool_error");
  behaviour = () => new Promise((resolve) => setTimeout(() => resolve(textResult(fixture.envelope)), 2_000));
  assert.equal(await failure(call({ url: statefulUrl, signal: AbortSignal.timeout(150) })), "timeout");

  assert.equal(sessions.methods.filter((method) => method === "DELETE").length, 3);
  assert.equal(sessions.open.size, 0, "no upstream session is left open");
});

test("a DELETE the server never answers holds the solve only for the session-end wait", { timeout: 10_000 }, async () => {
  sessions.answerDelete = false;
  behaviour = async () => textResult(fixture.envelope);
  try {
    const started = Date.now();
    const { data } = adaptToolResult(await call({ url: statefulUrl }));
    const elapsed = Date.now() - started;
    assert.equal(data.policy.length, 880);
    assert.ok(elapsed >= SESSION_END_TIMEOUT_MS - 100, `waited ${elapsed} ms for the DELETE`);
    assert.ok(elapsed < SESSION_END_TIMEOUT_MS + 1_000, `waited ${elapsed} ms, past the session-end bound`);
  } finally {
    sessions.answerDelete = true;
    for (const transport of sessions.open.values()) await transport.close();
  }
});
