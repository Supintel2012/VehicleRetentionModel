# Lessons

## 2026-10-28 — Phase 0 review (MCP solve route)

- **Test the MCP client against a stateful server.** The RR Toolbox MCP keeps
  a session open until it is deleted or times out, and `client.close()` sends no
  `DELETE`. Call `transport.terminateSession()` before closing, with a bounded
  wait, and keep a test server with `sessionIdGenerator: randomUUID` so the leak
  cannot return.
- **structuredContent is not always the payload.** With MCP Apps on, the RR
  Toolbox puts a display view-model in structuredContent and the run envelope in
  the text. Pick the source by shape (`raw` present), not by presence, and do not
  copy "structuredContent first" from another client without checking the server.
- **Check that every allowed input can actually be solved.** `d = 0` passed
  validation but gives beta = 1, and the engine then runs to its iteration cap
  (over a minute) and returns garbage. Run the engine at each end of every range
  the wizard offers before calling a range valid.
- **The left-most `X-Forwarded-For` entry belongs to the client.** `next start`
  keeps a client-supplied header (`??=`), so rate-limit on the right-most hop and
  document that self-hosting needs a proxy that sets or appends it.
- **Cap a request body while reading it.** A `Content-Length` check misses
  chunked bodies; count bytes from `request.body` and cancel past the limit
  instead of calling `request.text()` and measuring afterwards.
- **Feature-detect browser APIs Next does not polyfill.** `AbortSignal.timeout`
  is missing in Safari < 16, inside Next 15's default targets; an
  `AbortController` plus `setTimeout` works everywhere.
