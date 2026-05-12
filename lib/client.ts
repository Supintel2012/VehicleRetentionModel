import type { SolveResponse } from "./types";

export async function solveVehicleRetention(
  body: Record<string, unknown>,
): Promise<SolveResponse> {
  const r = await fetch("/api/vehicle-retention", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`solve failed (${r.status}): ${text}`);
  }
  return (await r.json()) as SolveResponse;
}
