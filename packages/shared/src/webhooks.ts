import crypto from "node:crypto";
import type { WebhookDeliveryEnvelope } from "./types.ts";

export interface WebhookSignatureResult {
  timestamp: string;
  signature: string;
}

function createWebhookSignature(secret: string, timestamp: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signWebhookEnvelope(
  secret: string,
  envelope: WebhookDeliveryEnvelope,
  timestamp = new Date().toISOString()
): WebhookSignatureResult & { body: string } {
  const body = JSON.stringify(envelope);
  return {
    timestamp,
    signature: createWebhookSignature(secret, timestamp, body),
    body,
  };
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  signature: string,
  body: string
): boolean {
  const expected = createWebhookSignature(secret, timestamp, body);
  const expectedBytes = Buffer.from(expected, "hex");
  const receivedBytes = Buffer.from(signature, "hex");

  if (expectedBytes.length !== receivedBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBytes, receivedBytes);
}
