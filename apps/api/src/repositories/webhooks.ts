import { getPool } from "../db";
import type { WebhookComparisonEventPayload, WebhookDeliveryEnvelope, WebhookEventType } from "@d2p/shared";
import { signWebhookEnvelope } from "../../../../packages/shared/src/webhooks";

export interface TenantWebhookRecord {
  id: number;
  tenantId: number;
  name: string;
  targetUrl: string;
  secret: string;
  events: string[];
  createdAt: string;
  revokedAt: string | null;
}

export interface TenantWebhookSecret {
  rawSecret: string;
}

export interface TenantWebhookDeliveryRecord {
  id: number;
  tenantWebhookId: number;
  webhookName: string;
  eventType: string;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  errorText: string | null;
  attemptCount: number;
  status: string;
  deliveredAt: string;
  lastAttemptAt: string;
  deadLetteredAt: string | null;
}

export type TenantWebhookEventType = "comparison.created" | "comparison.failed";

const WEBHOOK_DELIVERY_MAX_ATTEMPTS = 3;
const WEBHOOK_DELIVERY_TIMEOUT_MS = 2500;

export async function createTenantWebhook(
  tenantId: number,
  name: string,
  targetUrl: string,
  events: string[] = ["comparison.created"]
): Promise<TenantWebhookRecord & TenantWebhookSecret> {
  const pool = getPool();
  const secret = `wh_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    name: string;
    target_url: string;
    secret: string;
    events: string[];
    created_at: Date;
    revoked_at: Date | null;
  }>(
    `
      INSERT INTO tenant_webhooks (
        tenant_id,
        name,
        target_url,
        secret,
        events
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, tenant_id, name, target_url, secret, events, created_at, revoked_at
    `,
    [tenantId, name, targetUrl, secret, JSON.stringify(events)]
  );

  const row = result.rows[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    targetUrl: row.target_url,
    secret: row.secret,
    events: row.events,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    rawSecret: secret,
  };
}

export async function revokeTenantWebhook(tenantId: number, webhookId: number): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `
      UPDATE tenant_webhooks
      SET revoked_at = NOW()
      WHERE tenant_id = $1
        AND id = $2
        AND revoked_at IS NULL
    `,
    [tenantId, webhookId]
  );

  return result.rowCount > 0;
}

export async function listTenantWebhooks(tenantId: number): Promise<TenantWebhookRecord[]> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    name: string;
    target_url: string;
    secret: string;
    events: string[];
    created_at: Date;
    revoked_at: Date | null;
  }>(
    `
      SELECT id, tenant_id, name, target_url, secret, events, created_at, revoked_at
      FROM tenant_webhooks
      WHERE tenant_id = $1
      ORDER BY created_at DESC, id DESC
    `,
    [tenantId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    targetUrl: row.target_url,
    secret: row.secret,
    events: row.events,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
  }));
}

export async function findTenantWebhookById(
  tenantId: number,
  webhookId: number
): Promise<TenantWebhookRecord | null> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_id: number;
    name: string;
    target_url: string;
    secret: string;
    events: string[];
    created_at: Date;
    revoked_at: Date | null;
  }>(
    `
      SELECT id, tenant_id, name, target_url, secret, events, created_at, revoked_at
      FROM tenant_webhooks
      WHERE tenant_id = $1
        AND id = $2
      LIMIT 1
    `,
    [tenantId, webhookId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    targetUrl: row.target_url,
    secret: row.secret,
    events: row.events,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
  };
}

export async function findTenantWebhookDeliveryById(
  tenantId: number,
  webhookId: number,
  deliveryId: number
): Promise<TenantWebhookDeliveryRecord | null> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_webhook_id: number;
    webhook_name: string;
    event_type: string;
    payload: Record<string, unknown>;
    response_status: number | null;
    error_text: string | null;
    attempt_count: number;
    status: string;
    delivered_at: Date;
    last_attempt_at: Date;
    dead_lettered_at: Date | null;
  }>(
    `
      SELECT
        wd.id,
        wd.tenant_webhook_id,
        tw.name AS webhook_name,
        wd.event_type,
        wd.payload,
        wd.response_status,
        wd.error_text,
        wd.attempt_count,
        wd.status,
        wd.delivered_at,
        wd.last_attempt_at,
        wd.dead_lettered_at
      FROM webhook_deliveries wd
      JOIN tenant_webhooks tw
        ON tw.id = wd.tenant_webhook_id
      WHERE tw.tenant_id = $1
        AND tw.id = $2
        AND wd.id = $3
      LIMIT 1
    `,
    [tenantId, webhookId, deliveryId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id,
    tenantWebhookId: row.tenant_webhook_id,
    webhookName: row.webhook_name,
    eventType: row.event_type,
    payload: row.payload,
    responseStatus: row.response_status,
    errorText: row.error_text,
    attemptCount: row.attempt_count,
    status: row.status,
    deliveredAt: row.delivered_at.toISOString(),
    lastAttemptAt: row.last_attempt_at.toISOString(),
    deadLetteredAt: row.dead_lettered_at ? row.dead_lettered_at.toISOString() : null,
  };
}

export async function listTenantWebhookDeliveries(
  tenantId: number,
  webhookId: number,
  limit = 20
): Promise<TenantWebhookDeliveryRecord[]> {
  const pool = getPool();
  const result = await pool.query<{
    id: number;
    tenant_webhook_id: number;
    webhook_name: string;
    event_type: string;
    payload: Record<string, unknown>;
    response_status: number | null;
    error_text: string | null;
    attempt_count: number;
    status: string;
    delivered_at: Date;
    last_attempt_at: Date;
    dead_lettered_at: Date | null;
  }>(
    `
      SELECT
        wd.id,
        wd.tenant_webhook_id,
        tw.name AS webhook_name,
        wd.event_type,
        wd.payload,
        wd.response_status,
        wd.error_text,
        wd.attempt_count,
        wd.status,
        wd.delivered_at,
        wd.last_attempt_at,
        wd.dead_lettered_at
      FROM webhook_deliveries wd
      JOIN tenant_webhooks tw
        ON tw.id = wd.tenant_webhook_id
      WHERE tw.tenant_id = $1
        AND tw.id = $2
      ORDER BY wd.delivered_at DESC, wd.id DESC
      LIMIT $3
    `,
    [tenantId, webhookId, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    tenantWebhookId: row.tenant_webhook_id,
    webhookName: row.webhook_name,
    eventType: row.event_type,
    payload: row.payload,
    responseStatus: row.response_status,
    errorText: row.error_text,
    attemptCount: row.attempt_count,
    status: row.status,
    deliveredAt: row.delivered_at.toISOString(),
    lastAttemptAt: row.last_attempt_at.toISOString(),
    deadLetteredAt: row.dead_lettered_at ? row.dead_lettered_at.toISOString() : null,
  }));
}

async function recordWebhookDelivery(options: {
  webhookId: number;
  eventType: string;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  errorText: string | null;
  attemptCount: number;
  status: string;
  deadLetteredAt: Date | null;
}): Promise<TenantWebhookDeliveryRecord> {
  const pool = getPool();
  const deliveredAt = new Date();

  const result = await pool.query<{
    id: number;
    tenant_webhook_id: number;
    event_type: string;
    payload: Record<string, unknown>;
    response_status: number | null;
    error_text: string | null;
    attempt_count: number;
    status: string;
    delivered_at: Date;
    last_attempt_at: Date;
    dead_lettered_at: Date | null;
  }>(
    `
      INSERT INTO webhook_deliveries (
        tenant_webhook_id,
        event_type,
        payload,
        response_status,
        error_text,
        attempt_count,
        status,
        last_attempt_at,
        dead_lettered_at,
        delivered_at
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10)
      RETURNING
        id,
        tenant_webhook_id,
        event_type,
        payload,
        response_status,
        error_text,
        attempt_count,
        status,
        delivered_at,
        last_attempt_at,
        dead_lettered_at
    `,
    [
      options.webhookId,
      options.eventType,
      JSON.stringify(options.payload),
      options.responseStatus,
      options.errorText,
      options.attemptCount,
      options.status,
      deliveredAt,
      options.deadLetteredAt,
      deliveredAt,
    ]
  );

  const row = result.rows[0];

  return {
    id: row.id,
    tenantWebhookId: row.tenant_webhook_id,
    webhookName: "",
    eventType: row.event_type,
    payload: row.payload,
    responseStatus: row.response_status,
    errorText: row.error_text,
    attemptCount: row.attempt_count,
    status: row.status,
    deliveredAt: row.delivered_at.toISOString(),
    lastAttemptAt: row.last_attempt_at.toISOString(),
    deadLetteredAt: row.dead_lettered_at ? row.dead_lettered_at.toISOString() : null,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sendWebhookAttempt(
  targetUrl: string,
  secret: string,
  envelope: WebhookDeliveryEnvelope
): Promise<{ ok: boolean; status: number | null; errorText: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_DELIVERY_TIMEOUT_MS);
  const signed = signWebhookEnvelope(secret, envelope);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": secret,
        "x-webhook-timestamp": signed.timestamp,
        "x-webhook-signature": signed.signature,
        "x-webhook-event": envelope.eventType,
        "x-webhook-version": "1",
      },
      body: signed.body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();
      return {
        ok: false,
        status: response.status,
        errorText: truncateWebhookErrorText(
          responseText ? `HTTP ${response.status}: ${responseText}` : `HTTP ${response.status}`
        ),
      };
    }

    return {
      ok: true,
      status: response.status,
      errorText: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      errorText: truncateWebhookErrorText(error instanceof Error ? error.message : "Webhook delivery failed"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function truncateWebhookErrorText(message: string, limit = 500): string {
  return message.length > limit ? `${message.slice(0, limit)}...` : message;
}

export async function redeliverTenantWebhookDelivery(
  tenantId: number,
  webhookId: number,
  deliveryId: number
): Promise<TenantWebhookDeliveryRecord | null> {
  const webhook = await findTenantWebhookById(tenantId, webhookId);

  if (!webhook) {
    return null;
  }

  const delivery = await findTenantWebhookDeliveryById(tenantId, webhookId, deliveryId);

  if (!delivery) {
    return null;
  }

  const result = await sendWebhookAttempt(webhook.targetUrl, webhook.secret, {
    eventType: delivery.eventType as TenantWebhookEventType,
    data: delivery.payload as WebhookComparisonEventPayload,
  });

  const redelivery = await recordWebhookDelivery({
    webhookId: webhook.id,
    eventType: delivery.eventType,
    payload: delivery.payload,
    responseStatus: result.status,
    errorText: result.errorText,
    attemptCount: delivery.attemptCount + 1,
    status: result.ok ? "delivered" : "dead_lettered",
    deadLetteredAt: result.ok ? null : new Date(),
  });

  return {
    ...redelivery,
    webhookName: webhook.name,
  };
}

async function deliverWebhookEvent(
  webhook: TenantWebhookRecord,
  eventType: TenantWebhookEventType,
  eventPayload: WebhookComparisonEventPayload
): Promise<void> {
  let lastAttemptStatus: number | null = null;
  let lastErrorText: string | null = null;

  for (let attempt = 1; attempt <= WEBHOOK_DELIVERY_MAX_ATTEMPTS; attempt += 1) {
    const result = await sendWebhookAttempt(webhook.targetUrl, webhook.secret, {
      eventType,
      data: eventPayload,
    });
    lastAttemptStatus = result.status;
    lastErrorText = result.errorText;

    if (result.ok) {
      await recordWebhookDelivery({
        webhookId: webhook.id,
        eventType,
        payload: eventPayload,
        responseStatus: result.status,
        errorText: null,
        attemptCount: attempt,
        status: "delivered",
        deadLetteredAt: null,
      });
      return;
    }

    if (attempt < WEBHOOK_DELIVERY_MAX_ATTEMPTS) {
      await delay(50 * 2 ** (attempt - 1));
    }
  }

  await recordWebhookDelivery({
    webhookId: webhook.id,
    eventType,
    payload: eventPayload,
    responseStatus: lastAttemptStatus,
    errorText: lastErrorText,
    attemptCount: WEBHOOK_DELIVERY_MAX_ATTEMPTS,
    status: "dead_lettered",
    deadLetteredAt: new Date(),
  });
}

export async function deliverComparisonCreatedWebhooks(
  tenantId: number,
  eventPayload: WebhookComparisonEventPayload
): Promise<void> {
  const webhooks = await listTenantWebhooks(tenantId);

  for (const webhook of webhooks) {
    if (webhook.revokedAt) {
      continue;
    }

    if (!webhook.events.includes("comparison.created")) {
      continue;
    }

    await deliverWebhookEvent(webhook, "comparison.created", eventPayload);
  }
}

export async function deliverComparisonFailedWebhooks(
  tenantId: number,
  eventPayload: WebhookComparisonEventPayload
): Promise<void> {
  const webhooks = await listTenantWebhooks(tenantId);

  for (const webhook of webhooks) {
    if (webhook.revokedAt) {
      continue;
    }

    if (!webhook.events.includes("comparison.failed")) {
      continue;
    }

    await deliverWebhookEvent(webhook, "comparison.failed", eventPayload);
  }
}

