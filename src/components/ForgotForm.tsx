"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { requestResetAction } from "@/lib/actions";
import { trackEvent } from "@/lib/analytics";

export function ForgotForm({
  lang,
  dict,
  expired = false,
}: {
  lang: string;
  dict: Record<string, unknown>;
  expired?: boolean;
}) {
  const t = (dict as { auth: Record<string, string> }).auth;
  const [state, formAction, pending] = useActionState(requestResetAction, null);
  const err = state && "error" in state ? state.error : undefined;

  // Funnel: reset_view{step} vs reset_sent/reset_error — drop-off per step.
  useEffect(() => {
    trackEvent("reset_view", { step: "forgot" });
  }, []);
  const errorMessage =
    err === "rate"
      ? t.rateLimit
      : err === "phone"
        ? t.invalidPhone
        : err === "send"
          ? t.sendFailed
          : t.invalidCode;
  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:py-16">
      <div className="card p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-white">{t.forgotTitle}</h1>
        {expired && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            {t.sessionExpired}
          </p>
        )}
        {err && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        )}
        <form
          action={formAction}
          onSubmit={() => trackEvent("reset_submit", { step: "forgot" })}
          className="mt-6 space-y-4"
        >
          <input type="hidden" name="lang" value={lang} />
          <div>
            <label className="label" htmlFor="phone">{t.phone}</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              className="input"
              dir="ltr"
              autoComplete="tel"
              inputMode="tel"
              required
            />
          </div>
          <button type="submit" disabled={pending} className="btn-gold w-full">
            {pending ? "..." : t.forgotSubmit}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">
          <a href={`/${lang}/login`} className="text-gold underline">
            {t.submitLogin}
          </a>
        </p>
      </div>
    </div>
  );
}
