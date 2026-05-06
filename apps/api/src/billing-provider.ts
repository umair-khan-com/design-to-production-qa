import { URLSearchParams } from "node:url";
import type { TenantBillingInfo } from "./repositories/tenant-access";

export interface BillingActionResult {
  provider: string;
  url: string | null;
  message: string;
}

export interface BillingProviderConfig {
  provider: "manual" | "stripe";
  stripeSecretKey: string | null;
  stripePriceId: string | null;
  checkoutSuccessUrl: string | null;
  checkoutCancelUrl: string | null;
  portalReturnUrl: string | null;
}

export function resolveBillingProviderConfig(): BillingProviderConfig {
  return {
    provider: (process.env.BILLING_PROVIDER === "stripe" ? "stripe" : "manual") as "manual" | "stripe",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? null,
    stripePriceId: process.env.STRIPE_PRICE_ID ?? null,
    checkoutSuccessUrl: process.env.BILLING_CHECKOUT_SUCCESS_URL ?? null,
    checkoutCancelUrl: process.env.BILLING_CHECKOUT_CANCEL_URL ?? null,
    portalReturnUrl: process.env.BILLING_PORTAL_RETURN_URL ?? null,
  };
}

export async function createBillingCheckoutAction(
  tenant: TenantBillingInfo,
  config = resolveBillingProviderConfig()
): Promise<BillingActionResult> {
  if (config.provider !== "stripe" || !config.stripeSecretKey || !config.stripePriceId) {
    return {
      provider: "manual",
      url: null,
      message: "Billing provider is not configured",
    };
  }

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", config.stripePriceId);
  params.set("line_items[0][quantity]", "1");
  params.set("client_reference_id", tenant.externalId);
  params.set("subscription_data[metadata][tenantId]", tenant.externalId);
  params.set("metadata[tenantId]", tenant.externalId);

  if (config.checkoutSuccessUrl) {
    params.set("success_url", config.checkoutSuccessUrl);
  }

  if (config.checkoutCancelUrl) {
    params.set("cancel_url", config.checkoutCancelUrl);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stripe checkout session failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as { url?: string };

  return {
    provider: "stripe",
    url: payload.url ?? null,
    message: payload.url ? "Checkout session created" : "Checkout session created without URL",
  };
}

export async function createBillingPortalAction(
  tenant: TenantBillingInfo,
  config = resolveBillingProviderConfig()
): Promise<BillingActionResult> {
  if (config.provider !== "stripe" || !config.stripeSecretKey) {
    return {
      provider: "manual",
      url: null,
      message: "Billing portal is not configured",
    };
  }

  if (!tenant.billingCustomerId) {
    return {
      provider: "stripe",
      url: null,
      message: "Stripe customer ID is required for portal access",
    };
  }

  const params = new URLSearchParams();
  params.set("customer", tenant.billingCustomerId);

  if (config.portalReturnUrl) {
    params.set("return_url", config.portalReturnUrl);
  }

  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stripe portal session failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as { url?: string };

  return {
    provider: "stripe",
    url: payload.url ?? null,
    message: payload.url ? "Billing portal created" : "Billing portal created without URL",
  };
}

