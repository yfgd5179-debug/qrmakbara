"use client";

import { useActionState } from "react";
import { resetPasswordAction, type FormState } from "@/lib/actions";

export function ResetForm({
  lang,
  dict,
}: {
  lang: string;
  dict: Record<string, unknown>;
}) {
  const t = (dict as { auth: Record<string, string> }).auth;
  const [state, formAction, pending] = useActionState(resetPasswordAction, null);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-8">
        <h1 className="text-2xl font-bold text-white">{t.resetTitle}</h1>
        {state && !state.error && (
          <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {t.resetSuccess}
          </p>
        )}
        {state?.error && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {t[state.error] ?? t.invalidCode}
          </p>
        )}
        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="lang" value={lang} />
          <div>
            <label className="label" htmlFor="email">{t.email}</label>
            <input id="email" name="email" type="email" className="input" dir="ltr" required />
          </div>
          <div>
            <label className="label" htmlFor="code">{t.resetCode}</label>
            <input id="code" name="code" className="input" dir="ltr" required />
          </div>
          <div>
            <label className="label" htmlFor="password">{t.newPassword}</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              dir="ltr"
              minLength={6}
              required
            />
          </div>
          <button type="submit" disabled={pending} className="btn-gold w-full">
            {pending ? "..." : t.resetSubmit}
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
