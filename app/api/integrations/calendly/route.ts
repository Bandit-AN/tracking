import { timingSafeEqual } from "node:crypto";

import { processCalendlyBooking, type CalendlyWebhookPayload } from "@/lib/calendly";

export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 256_000;

function hasValidWebhookSecret(request: Request) {
  const expected = process.env.CALENDLY_WEBHOOK_SECRET?.trim();
  const received = new URL(request.url).searchParams.get("secret") ?? "";
  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export async function POST(request: Request) {
  if (!hasValidWebhookSecret(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }

  let payload: CalendlyWebhookPayload;
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_WEBHOOK_BYTES) {
      return Response.json({ error: "Payload too large." }, { status: 413 });
    }
    payload = JSON.parse(rawBody) as CalendlyWebhookPayload;
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const result = await processCalendlyBooking(payload);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Calendly booking webhook failed", {
      message: error instanceof Error ? error.message : "Unknown error",
      event: payload.event ?? "unknown",
    });
    return Response.json({ error: "Unable to process booking." }, { status: 502 });
  }
}
