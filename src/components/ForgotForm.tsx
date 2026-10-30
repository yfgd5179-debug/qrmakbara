"use client";

import { useActionState } from "react";
import { requestResetAction, type FormState } from "@/lib/actions";

export function ForgotForm({
  lang,
  dict,
}: {
  lang: string;
  dict: Record<string, unknown>;
}) {
  const t = (dict as { auth: Record<string, string> }).auth;
  const [state, formAction, pending] = useActionState(
    requestResetAction as (p: FormState, fd: FormData) => Promise<FormState & { code?: string }>,
    null
  );
  const code = (state as (FormState & { code?: string }) | null)?.code;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-8">
        <h1 className="text-2xl font-bold text-white">{t.forgotTitle}</h1>
        {state && !state.error && (
          <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {t.forgotSent}
            {code ? ` (Dev code: ${code})` : ""}
          </p>
        )}
        {state?.error && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {state.error}
          </p>
        )}
        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="lang" value={lang} />
          <div>
            <label className="label" htmlFor="email">{t.email}</label>
            <input id="email" name="email" type="email" className="input" dir="ltr" required />
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
