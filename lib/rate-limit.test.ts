import assert from "node:assert/strict";
import { test } from "node:test";
import { createRateLimiter } from "./rate-limit.ts";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

test("a key gets `limit` attempts per sliding window, then waits for the oldest to expire", () => {
  const time = clock();
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: time.now });
  assert.equal(limiter.check("a").allowed, true); // t = 0
  time.advance(10_000);
  assert.equal(limiter.check("a").allowed, true); // t = 10 s
  time.advance(10_000);
  assert.equal(limiter.check("a").allowed, true); // t = 20 s
  time.advance(5_000);
  assert.deepEqual(limiter.check("a"), { allowed: false, retryAfterMs: 35_000 }); // t = 25 s; oldest expires at 60 s
  time.advance(35_000);
  assert.equal(limiter.check("a").allowed, true, "the t = 0 attempt has left the window");
  assert.equal(limiter.check("a").allowed, false, "the t = 10 s attempt is still inside it");
});

test("rejected attempts do not extend the wait, and keys are independent", () => {
  const time = clock();
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: time.now });
  assert.equal(limiter.check("a").allowed, true);
  for (let i = 0; i < 5; i++) {
    time.advance(100);
    assert.equal(limiter.check("a").allowed, false);
  }
  assert.equal(limiter.check("b").allowed, true);
  time.advance(500);
  assert.equal(limiter.check("a").allowed, true);
});

test("memory stays bounded: the least recently seen key is dropped past maxKeys", () => {
  const time = clock();
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2, now: time.now });
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("b").allowed, true);
  assert.equal(limiter.check("a").allowed, false); // "a" is now the most recently seen
  assert.equal(limiter.check("c").allowed, true); // evicts "b"
  assert.equal(limiter.check("a").allowed, false, "a is still tracked");
  assert.equal(limiter.check("b").allowed, true, "b was forgotten, so it starts over");
});
