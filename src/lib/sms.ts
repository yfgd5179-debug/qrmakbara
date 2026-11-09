/**
 * Transactional delivery transport (password-reset codes).
 *
 * Accounts are phone-only, so the reset code goes to the customer's number.
 * Transports are supported and selected by `SMS_PROVIDER` (or
 * auto-detected from whichever credentials are present):
 *
 *   textbee   TEXTBEE_API_KEY — https://textbee.dev, the site's default: your
 *             own Android phone is the SMS gateway (free plan, 300 SMS/month,
 *             no card). The phone must run the textbee app and be online.
 *   twilio    TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + SMS_FROM
 *   vonage    VONAGE_API_KEY + VONAGE_API_SECRET + SMS_FROM
 *   webhook   SMS_WEBHOOK_URL (+ optional SMS_WEBHOOK_TOKEN) — any relay/gateway
 *   whatsapp  WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID (+ optional
 *             WHATSAPP_TEMPLATE_NAME/WHATSAPP_TEMPLATE_LANG/WHATSAPP_API_VERSION)
 *   textbelt  TEXTBELT_KEY — https://textbelt.com pay-per-SMS fallback (the
 *             free "textbelt" key is disabled for most countries).
 *
 * For Iraq, Twilio requires an **alphanumeric sender ID** (SMS_FROM, ≤11 chars,
 * at least one letter): numeric IDs are rejected by Zain/Asiacell, and Asiacell
 * blocks unregistered alphanumeric IDs since 2026-07-01. Arabic text is UCS-2,
 * so keep messages ≤70 characters to stay in a single billed segment.
 *
 * WhatsApp Cloud API uses approved Authentication templates (business-initiated).
 * Numbers are normalized to bare digits without '+' (e.g. 9647701234567).
 *
 * This module deliberately takes an E.164 number and has no project imports so
 * it can be unit-tested against a stubbed `fetch` (see tests/sms.test.mjs).
 */

export type SmsProvider =
  | "textbee"
  | "twilio"
  | "vonage"
  | "webhook"
  | "whatsapp"
  | "textbelt";

export type SmsOutcome = { ok: boolean; provider: SmsProvider | "" };

const TIMEOUT_MS = 10_000;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function basicAuth(user: string, secret: string): string {
  // btoa/atob keep this runnable in edge-like runtimes as well as Node.
  return `Basic ${btoa(`${user}:${secret}`)}`;
}

/** Which transport will be used, or "" when delivery is not configured. */
export function smsProvider(): SmsProvider | "" {
  const configured = env("SMS_PROVIDER").toLowerCase();
  if (
    configured === "textbee" ||
    configured === "twilio" ||
    configured === "vonage" ||
    configured === "webhook" ||
    configured === "whatsapp" ||
    configured === "textbelt"
  ) {
    return configured;
  }
  // Auto-detection prefers the free self-hosted gateway, then the paid ones.
  if (env("TEXTBEE_API_KEY")) return "textbee";
  if (env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID")) return "whatsapp";
  if (env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN")) return "twilio";
  if (env("VONAGE_API_KEY") && env("VONAGE_API_SECRET")) return "vonage";
  if (env("SMS_WEBHOOK_URL")) return "webhook";
  if (env("TEXTBELT_KEY")) return "textbelt";
  return "";
}

/**
 * Sends one message to an E.164 number (e.g. "+9647701234567").
 * Never throws: transport failures answer `{ ok: false }` so the caller can
 * carry on and tell the customer support will follow up.
 */
export async function sendSms(to: string, message: string): Promise<SmsOutcome> {
  const provider = smsProvider();
  if (!provider || !to) return { ok: false, provider: "" };

  try {
    if (provider === "textbee") {
      const key = env("TEXTBEE_API_KEY");
      if (!key) return { ok: false, provider };

      const res = await fetch("https://api.textbee.dev/api/v1/gateway/send-sms", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
        },
        body: JSON.stringify({ recipients: [to], message }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { ok: false, provider };
      // API answers { data: { success: true, smsBatchId, ... } } on accepted
      // batches (some SDK versions answer at the root) — accept both shapes.
      const data = (await res.json()) as {
        success?: boolean;
        data?: { success?: boolean };
      };
      return { ok: data.success === true || data.data?.success === true, provider };
    }

    if (provider === "twilio") {
      const sid = env("TWILIO_ACCOUNT_SID");
      const token = env("TWILIO_AUTH_TOKEN");
      const from = env("SMS_FROM");
      if (!sid || !token || !from) return { ok: false, provider };

      // Twilio's Messages API is form-encoded, not JSON.
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            authorization: basicAuth(sid, token),
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }
      );
      return { ok: res.ok, provider };
    }

    if (provider === "vonage") {
      const key = env("VONAGE_API_KEY");
      const secret = env("VONAGE_API_SECRET");
      const from = env("SMS_FROM");
      if (!key || !secret || !from) return { ok: false, provider };

      const res = await fetch("https://rest.nexmo.com/sms/json", {
        method: "POST",
        headers: {
          authorization: basicAuth(key, secret),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: to.replace(/^\+/, ""),
          text: message,
          // Arabic text is not GSM-7: without this Vonage mangles the body.
          type: "unicode",
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // Vonage answers HTTP 200 even for per-message failures.
      if (!res.ok) return { ok: false, provider };
      const data = (await res.json()) as {
        messages?: { status?: string | number }[];
      };
      const status = data.messages?.[0]?.status;
      return { ok: String(status) === "0", provider };
    }

    if (provider === "whatsapp") {
      const token = env("WHATSAPP_TOKEN");
      const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
      if (!token || !phoneNumberId) return { ok: false, provider };

      // WhatsApp expects bare digits without '+' (e.g. 9647701234567)
      const waTo = to.replace(/^\+/, "");
      const version = env("WHATSAPP_API_VERSION") || "v21.0";
      const templateName = env("WHATSAPP_TEMPLATE_NAME") || "auth_code_copy_code";
      const templateLang = env("WHATSAPP_TEMPLATE_LANG") || "en_US";

      // Extract code from message if it ends with the code, otherwise try to find 6 digits
      const codeMatch = message.match(/(\d{6})/);
      const code = codeMatch ? codeMatch[1] : message;

      const res = await fetch(
        `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: waTo,
            type: "template",
            template: {
              name: templateName,
              language: { code: templateLang },
              components: [
                {
                  type: "body",
                  parameters: [{ type: "text", text: code }],
                },
                {
                  type: "button",
                  sub_type: "url",
                  index: "0",
                  parameters: [{ type: "text", text: code }],
                },
              ],
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }
      );
      if (!res.ok) return { ok: false, provider };
      // 200 means request accepted; delivery status comes via webhook
      return { ok: true, provider };
    }

    if (provider === "textbelt") {
      const key = env("TEXTBELT_KEY");
      if (!key) return { ok: false, provider };

      const res = await fetch("https://textbelt.com/text", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ phone: to, message, key }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { ok: false, provider };
      const data = (await res.json()) as { success?: boolean };
      return { ok: data.success === true, provider };
    }

    const url = env("SMS_WEBHOOK_URL");
    if (!url) return { ok: false, provider };
    const token = env("SMS_WEBHOOK_TOKEN");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ to, message }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok, provider };
  } catch {
    return { ok: false, provider };
  }
}

/**
 * Reset-code message kept under 70 characters so Arabic (UCS-2) still fits in
 * one billed SMS segment. The app normally builds a localized message from the
 * dictionary; this is the language-neutral default (and what the tests assert).
 */
export function resetCodeMessage(code: string): string {
  return `QR Makbara: رمز الاستعادة ${code} · صالح 10 دقائق`;
}
