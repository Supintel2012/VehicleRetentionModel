import assert from "node:assert/strict";
import { test } from "node:test";
import { examplePrompts } from "./prompts.ts";

const COHORT_WORDS = /cohorts|price_shock|replacement_hazard|fleet-weighted|holding period|elasticit/i;

test("the fleet-weighted prompt is offered only when the answering engine returned the cohort output", () => {
  const withCohorts = examplePrompts(true);
  assert.equal(withCohorts.length, 3);
  assert.equal(withCohorts.filter((p) => COHORT_WORDS.test(p.prompt)).length, 1);
  for (const hasCohorts of [false, null]) {
    const prompts = examplePrompts(hasCohorts);
    assert.equal(prompts.length, 3);
    assert.deepEqual(prompts.filter((p) => COHORT_WORDS.test(p.prompt)), [], `hasCohorts ${hasCohorts}`);
    assert.match(prompts[1].prompt, /not of vehicles/);
  }
});

test("every prompt names the connector and the model", () => {
  for (const prompt of [...examplePrompts(true), ...examplePrompts(false)]) {
    assert.match(prompt.prompt, /^Using the Rapid Recursive Toolbox, run (the )?AutoDriveOrSell/);
  }
});
