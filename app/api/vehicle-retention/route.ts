import { NextResponse } from "next/server";

/**
 * Server-side proxy to the RR Toolbox `/vehicle-retention/solve` endpoint.
 *
 * Forwards the JSON body untouched and attaches the API key from the server
 * env so the credential never reaches the client. Intended target is the
 * Python FastAPI service from RRToolbox-API.
 */
export async function POST(req: Request) {
  const apiUrl = process.env.RRTOOLBOX_API_URL ?? "http://localhost:8000";
  const apiKey = process.env.RRTOOLBOX_API_KEY ?? "";

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { status: "error", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/vehicle-retention/solve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: apiKey } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: `Could not reach RR Toolbox API at ${apiUrl}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}
