"use client";

import { useActionState } from "react";
import { requestResetAction } from "@/lib/actions";

export function ForgotForm({
  lang,
  dict,
}: {
  lang: string;
  dict: Record<string, unknown>;
}) {
  const t = (dict as { auth: Record<string, string> }).auth;
  const [state, formAction, pending] = useActionState(requestResetAction, null);
  const err = state && "error" in state ? state.error : undefined;
  const errorMessage =
    err === "rate"
      ? t.rateLimit
      : err === "phone"
        ? t.invalidPhone
        : err === "send"
          ? t.sendFailed
          : t.invalidCode;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-8">
        <h1 className="text-2xl font-bold text-white">{t.forgotTitle}</h1>
        {state && !err && (
          <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            <p>{t.forgotSent}</p>
            <p className="mt-2">
              <a href={`/${lang}/reset`} className="text-gold underline">
                {t.resetTitle} →
              </a>
            </p>
          </div>
        )}
        {err && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        )}
        <form action={formAction} className="mt-6 space-y-4">
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
