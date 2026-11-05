/**
 * SMS transport contract: the exact requests each provider receives, without
 * touching the network. Run with `npm test`.
 */
import assert from "node:assert/strict";

const { sendSms, smsProvider, resetCodeMessage } = await import("../src/lib/sms.ts");
const { toE164 } = await import("../src/lib/phone.ts");

const TO = "+9647701234567";
const MSG = resetCodeMessage("246810");

let calls = [];
let reply = { status: 201, body: { sid: "SM1", status: "queued" } };

globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  return {
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    json: async () => reply.body,
  };
};

function resetEnv() {
  for (const key of [
    "SMS_PROVIDER",
    "SMS_FROM",
    "SMS_WEBHOOK_URL",
    "SMS_WEBHOOK_TOKEN",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "VONAGE_API_KEY",
    "VONAGE_API_SECRET",
  ]) {
    delete process.env[key];
  }
  calls = [];
  reply = { status: 201, body: { sid: "SM1", status: "queued" } };
}

let failed = 0;
async function check(name, fn) {
  resetEnv();
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed = 1;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}

await check("E.164 conversion for Iraqi mobiles", () => {
  assert.equal(toE164("07701234567"), "+9647701234567");
  assert.equal(toE164("+964 770 123 4567"), "+9647701234567");
  assert.equal(toE164("0123456789"), "");
});

await check("reset message stays inside one UCS-2 segment (<=70)", () => {
  assert.ok(MSG.length <= 70, `message is ${MSG.length} chars`);
});

await check("no credentials -> not configured, no request", async () => {
  assert.equal(smsProvider(), "");
  const out = await sendSms(TO, MSG);
  assert.deepEqual(out, { ok: false, provider: "" });
  assert.equal(calls.length, 0);
});

await check("twilio: form-encoded POST to Messages.json", async () => {
  process.env.SMS_PROVIDER = "twilio";
  process.env.TWILIO_ACCOUNT_SID = "AC_test_sid";
  process.env.TWILIO_AUTH_TOKEN = "test_token";
  process.env.SMS_FROM = "QRMakbara";

  const out = await sendSms(TO, MSG);
  assert.deepEqual(out, { ok: true, provider: "twilio" });
  assert.equal(calls.length, 1);

  const { url, init } = calls[0];
  assert.equal(
    url,
    "https://api.twilio.com/2010-04-01/Accounts/AC_test_sid/Messages.json"
  );
  assert.equal(init.method, "POST");
  assert.equal(init.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(
    init.headers.authorization,
    "Basic " + Buffer.from("AC_test_sid:test_token").toString("base64")
  );
  const body = new URLSearchParams(init.body);
  assert.equal(body.get("To"), TO);
  assert.equal(body.get("From"), "QRMakbara");
  assert.equal(body.get("Body"), MSG);
});

await check("twilio: HTTP error is reported, not thrown", async () => {
  process.env.SMS_PROVIDER = "twilio";
  process.env.TWILIO_ACCOUNT_SID = "AC_test_sid";
  process.env.TWILIO_AUTH_TOKEN = "test_token";
  process.env.SMS_FROM = "QRMakbara";
  reply = { status: 400, body: { code: 21614 } };

  const out = await sendSms(TO, MSG);
  assert.deepEqual(out, { ok: false, provider: "twilio" });
});

await check("twilio: missing SMS_FROM -> no request", async () => {
  process.env.SMS_PROVIDER = "twilio";
  process.env.TWILIO_ACCOUNT_SID = "AC_test_sid";
  process.env.TWILIO_AUTH_TOKEN = "test_token";

  const out = await sendSms(TO, MSG);
  assert.deepEqual(out, { ok: false, provider: "twilio" });
  assert.equal(calls.length, 0);
});

await check("vonage: JSON POST, unicode, number without '+'", async () => {
  process.env.SMS_PROVIDER = "vonage";
  process.env.VONAGE_API_KEY = "vkey";
  process.env.VONAGE_API_SECRET = "vsecret";
  process.env.SMS_FROM = "QRMakbara";
  reply = { status: 200, body: { messages: [{ status: "0" }] } };

  const out = await sendSms(TO, MSG);
  assert.deepEqual(out, { ok: true, provider: "vonage" });
  const { url, init } = calls[0];
  assert.equal(url, "https://rest.nexmo.com/sms/json");
  assert.equal(init.headers["content-type"], "application/json");
  assert.equal(
    init.headers.authorization,
    "Basic " + Buffer.from("vkey:vsecret").toString("base64")
  );
  const body = JSON.parse(init.body);
  assert.deepEqual(body, {
    from: "QRMakbara",
    to: "9647701234567",
    text: MSG,
    type: "unicode",
  });
});

await check("vonage: HTTP 200 with non-zero message status is a failure", async () => {
  process.env.SMS_PROVIDER = "vonage";
  process.env.VONAGE_API_KEY = "vkey";
  process.env.VONAGE_API_SECRET = "vsecret";
  process.env.SMS_FROM = "QRMakbara";
  reply = { status: 200, body: { messages: [{ status: "4" }] } };

  const out = await sendSms(TO, MSG);
  assert.deepEqual(out, { ok: false, provider: "vonage" });
});

await check("webhook: JSON body with e.164 number and bearer token", async () => {
  process.env.SMS_WEBHOOK_URL = "https://sms.example.com/send";
  process.env.SMS_WEBHOOK_TOKEN = "whsecret";

  const out = await sendSms(TO, MSG);
  assert.deepEqual(out, { ok: true, provider: "webhook" });
  const { url, init } = calls[0];
  assert.equal(url, "https://sms.example.com/send");
  assert.equal(init.headers.authorization, "Bearer whsecret");
  assert.deepEqual(JSON.parse(init.body), { to: TO, message: MSG });
});

await check("network failure is reported, not thrown", async () => {
  process.env.SMS_WEBHOOK_URL = "https://sms.example.com/send";
  globalThis.fetch = async () => {
    throw new Error("ECONNRESET");
  };
  const out = await sendSms(TO, MSG);
  assert.deepEqual(out, { ok: false, provider: "webhook" });
});

process.exit(failed ? 1 : 0);
