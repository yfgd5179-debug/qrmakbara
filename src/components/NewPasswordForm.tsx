"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/lib/actions";

/**
 * Step 3 of the password reset: only the new password (twice) is asked — the
 * phone number and the verified code both travel in httpOnly cookies, and the
 * server action redirects to the login page with a success notice on success.
 */
export function NewPasswordForm({
  lang,
  dict,
}: {
  lang: string;
  dict: Record<string, unknown>;
}) {
  const t = (dict as { auth: Record<string, string> }).auth;
  const [state, formAction, pending] = useActionState(resetPasswordAction, null);

  const err = state && "error" in state ? state.error : undefined;
  const errorMessage = err === "mismatch" ? t.passwordMismatch : t.passwordHint;

  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:py-16">
      <div className="card p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-white">{t.resetTitle}</h1>

        {err && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        )}

        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="lang" value={lang} />
          <div>
            <label className="label" htmlFor="password">
              {t.newPassword}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              dir="ltr"
              autoComplete="new-password"
              minLength={6}
              autoFocus
              required
            />
            <p className="mt-1 text-xs text-slate-500">{t.passwordHint}</p>
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              {t.confirmPassword}
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              className="input"
              dir="ltr"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <button type="submit" disabled={pending} className="btn-gold w-full">
            {pending ? "..." : t.resetSubmit}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          <Link href={`/${lang}/login`} className="text-gold underline">
            {t.submitLogin}
          </Link>
        </p>
      </div>
    </div>
  );
}
