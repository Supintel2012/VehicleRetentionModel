import assert from "node:assert/strict";
import { test } from "node:test";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { classifySolveFailure, describeForLog, failureBody, FAILURES, redactSecrets } from "./solve-errors.ts";
import { SolveInputError } from "./solve-input.ts";
import { SolveProtocolError, SolveToolError } from "./solve-result.ts";

function networkError(code: string, detail: string) {
  return Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(detail), { code }) });
}
function named(name: string, message = name) {
  return Object.assign(new Error(message), { name });
}
const toolError = (status: number) =>
  new SolveToolError(`Error calling run_decision_model. Status code: ${status}. Response: {"detail":"upstream said no"}`);

test("SDK, network and tool failures map to stable reason codes", () => {
  const cases: [unknown, string][] = [
    [new StreamableHTTPError(401, 'Error POSTing to endpoint: {"detail":"Missing API key"}'), "unauthorized"],
    [new StreamableHTTPError(403, "Error POSTing to endpoint: forbidden"), "unauthorized"],
    [new StreamableHTTPError(429, "Error POSTing to endpoint: slow down"), "rate_limited"],
    [new StreamableHTTPError(502, "Error POSTing to endpoint: <html>bad gateway</html>"), "unreachable"],
    [new StreamableHTTPError(503, "Error POSTing to endpoint: maintenance"), "unreachable"],
    [new StreamableHTTPError(504, "Error POSTing to endpoint: gateway timeout"), "timeout"],
    [new StreamableHTTPError(404, "Error POSTing to endpoint: not found"), "protocol_error"],
    [new StreamableHTTPError(-1, "Unexpected content type: text/html"), "protocol_error"],
    [new McpError(ErrorCode.RequestTimeout, "Request timed out"), "timeout"],
    [new McpError(ErrorCode.InvalidParams, "Tool run_decision_model not found"), "tool_error"],
    [new McpError(ErrorCode.InternalError, "boom"), "tool_error"],
    [named("TimeoutError", "The operation was aborted due to timeout"), "timeout"],
    [named("AbortError", "This operation was aborted"), "timeout"],
    [networkError("ECONNREFUSED", "connect ECONNREFUSED 10.20.30.40:8000"), "unreachable"],
    [networkError("ENOTFOUND", "getaddrinfo ENOTFOUND internal.rrtoolbox.example"), "unreachable"],
    [networkError("UND_ERR_HEADERS_TIMEOUT", "Headers Timeout Error"), "timeout"],
    [Object.assign(new TypeError("fetch failed"), { cause: new TypeError("unexpected redirect") }), "unreachable"],
    [toolError(401), "unauthorized"],
    [toolError(403), "unauthorized"],
    [toolError(429), "rate_limited"],
    [toolError(422), "invalid_input"],
    [toolError(400), "invalid_input"],
    [toolError(404), "tool_error"],
    [toolError(500), "tool_error"],
    [new SolveToolError("Model crashed"), "tool_error"],
    [new SolveProtocolError("policy does not have 880 entries"), "protocol_error"],
    [new SolveInputError("Vehicle age must be a number."), "invalid_input"],
    [new Error("something unexpected"), "protocol_error"],
    ["a thrown string", "protocol_error"],
    [undefined, "protocol_error"],
  ];
  for (const [error, reason] of cases) {
    assert.equal(classifySolveFailure(error), reason, describeForLog(error));
  }
});

test("each reason has an HTTP status and a plain message free of technical detail", () => {
  assert.deepEqual(Object.keys(FAILURES).sort(), [
    "invalid_input", "not_configured", "protocol_error", "rate_limited", "timeout", "tool_error", "unauthorized", "unreachable",
  ]);
  for (const [reason, { status, message }] of Object.entries(FAILURES)) {
    assert.ok(status >= 400 && status < 600, reason);
    assert.match(message, /^[A-Z][^{}<>]+\.$/, reason);
    assert.doesNotMatch(message, /https?:|\/\/|\b\d{1,3}(\.\d{1,3}){3}\b|RRTOOLBOX|MCP|POST|stack/i, reason);
  }
  assert.equal(FAILURES.rate_limited.status, 429);
  assert.equal(FAILURES.timeout.status, 504);
  assert.equal(FAILURES.not_configured.status, 503);
});

test("response bodies never carry upstream URLs, hosts, IPs, stacks or upstream bodies", () => {
  const leaks = [
    "10.20.30.40", "8000", "http://", "internal.rrtoolbox.example", "api.rapidrecursive.com",
    "upstream said no", "Missing API key", "detail", "    at ", "Traceback", "Bearer", "RRT-",
  ];
  const errors = [
    networkError("ECONNREFUSED", "connect ECONNREFUSED 10.20.30.40:8000"),
    new StreamableHTTPError(401, 'Error POSTing to endpoint http://10.20.30.40:8000/mcp: {"detail":"Missing API key RRT-example"}'),
    new StreamableHTTPError(500, "Traceback (most recent call last): at internal.rrtoolbox.example"),
    new McpError(ErrorCode.InternalError, "upstream said no at https://api.rapidrecursive.com/mcp"),
    toolError(403),
    toolError(422),
    new SolveToolError("Error calling run_decision_model. Status code: 500. Response: Bearer abc at http://10.20.30.40:8000"),
    new SolveProtocolError("raw.status is not success (detail: upstream said no)"),
    new Error("http://internal.rrtoolbox.example:8000 exploded\n    at handler (/srv/app.js:1:1)"),
  ];
  for (const error of errors) {
    const reason = classifySolveFailure(error);
    const body = failureBody(reason, error);
    assert.deepEqual(body, { status: "error", reason, message: FAILURES[reason].message });
    const json = JSON.stringify(body);
    for (const leak of leaks) assert.equal(json.includes(leak), false, `${reason} response leaked "${leak}"`);
  }
});

test("only the app's own input errors supply a custom message", () => {
  const own = new SolveInputError("Vehicle age must be between 0 years and 10 years.");
  assert.equal(failureBody("invalid_input", own).message, own.message);
  assert.equal(failureBody("invalid_input", toolError(422)).message, FAILURES.invalid_input.message);
  assert.equal(failureBody("tool_error", own).message, FAILURES.tool_error.message);
});

test("log lines keep the detail but never the API key or bearer tokens", () => {
  const key = "test-key-0123456789abcdef";
  const error = new StreamableHTTPError(401, `Error POSTing to endpoint: header was Bearer ${key}; also saw RRT-1234-abcd`);
  const line = describeForLog(error, [key]);
  assert.match(line, /code=401/);
  assert.match(line, /Error POSTing to endpoint/);
  assert.equal(line.includes(key), false);
  assert.equal(line.includes("RRT-1234-abcd"), false);
  assert.match(line, /Bearer \[redacted\]/);

  const network = describeForLog(networkError("ECONNREFUSED", "connect ECONNREFUSED 10.20.30.40:8000"));
  assert.match(network, /cause=connect ECONNREFUSED 10\.20\.30\.40:8000 \(ECONNREFUSED\)/);
  assert.equal(redactSecrets(`key=${key}`, [key, undefined, ""]), "key=[redacted]");
});
