"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resendCodeAction, verifyCodeAction } from "@/lib/actions";

/**
 * Step 2 of the password reset: a single 6-digit code field. The phone number
 * lives in an httpOnly cookie (set when the code was requested), so this
 * screen never asks for it — and a "send again" button re-issues the code
 * without leaving the page.
 */
export function VerifyForm({
  lang,
  dict,
  maskedPhone,
}: {
  lang: string;
  dict: Record<string, unknown>;
  maskedPhone: string;
}) {
  const t = (dict as { auth: Record<string, string> }).auth;
  const [state, formAction, pending] = useActionState(verifyCodeAction, null);
  const [resendState, resendAction, resendPending] = useActionState(
    resendCodeAction,
    null
  );

  const err = state && "error" in state ? state.error : undefined;
  const errorMessage =
    err === "rate" ? t.rateLimit : err === "phone" ? t.invalidPhone : t.invalidCode;
  const resendErr = resendState && "error" in resendState ? resendState.error : undefined;

  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:py-16">
      <div className="card p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-white">{t.verifyTitle}</h1>
        <p className="mt-3 text-sm text-slate-400">
          {t.verifyHint}{" "}
          <b className="text-gold" dir="ltr">
            {maskedPhone}
          </b>
        </p>

        {err && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        )}
        {resendState?.ok && !resendErr && (
          <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {t.codeSentAgain}
          </p>
        )}
        {resendErr && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {resendErr === "rate" ? t.rateLimit : t.sendFailed}
          </p>
        )}

        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="lang" value={lang} />
          <div>
            <label className="label" htmlFor="code">
              {t.resetCode}
            </label>
            <input
              id="code"
              name="code"
              className="input text-center text-2xl tracking-[0.5em]"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              minLength={6}
              autoFocus
              required
            />
          </div>
          <button type="submit" disabled={pending} className="btn-gold w-full">
            {pending ? "..." : t.verifySubmit}
          </button>
        </form>

        <form action={resendAction} className="mt-4">
          <input type="hidden" name="lang" value={lang} />
          <button
            type="submit"
            disabled={resendPending}
            className="btn-outline w-full text-sm text-slate-300 hover:border-gold/60 hover:text-gold"
          >
            {resendPending ? "..." : t.resendCode}
          </button>
        </form>

        <p className="mt-6 flex items-center justify-between text-sm text-slate-400">
          <Link href={`/${lang}/forgot`} className="text-gold underline">
            {t.changeNumber}
          </Link>
          <Link href={`/${lang}/login`} className="text-gold underline">
            {t.submitLogin}
          </Link>
        </p>
      </div>
    </div>
  );
}
