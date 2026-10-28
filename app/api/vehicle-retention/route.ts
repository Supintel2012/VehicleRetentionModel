import { createRateLimiter } from "@/lib/rate-limit";
import { runDecisionModel } from "@/lib/rr-toolbox";
import { createSolveHandler } from "@/lib/solve-handler";

/**
 * Solve proxy: validates the wizard's answers, then runs the RR Toolbox
 * `AutoDriveOrSell` model through the MCP `run_decision_model` tool with the
 * server-held RRTOOLBOX_API_KEY. Errors are returned as a reason code plus a
 * plain message; upstream detail stays in the server log.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const handleSolve = createSolveHandler({
  env: process.env,
  runModel: runDecisionModel,
  limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
});

export async function POST(request: Request) {
  return handleSolve(request);
}
