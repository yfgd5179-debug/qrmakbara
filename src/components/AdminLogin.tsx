"use client";

import { useActionState } from "react";
import { adminLoginAction } from "@/lib/actions";
import type { Dict } from "@/lib/dict";

/**
 * Admin sign-in: posts the key to a server action which sets a signed,
 * httpOnly cookie. The key never lands in a URL or in server logs.
 */
export function AdminLogin({ dict, lang }: { dict: Dict; lang: string }) {
  const t = dict.admin;
  const [state, formAction, pending] = useActionState(adminLoginAction, null);

  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <div className="card p-8">
        <h1 className="text-xl font-bold text-white">{t.title}</h1>
        {state?.error === "key" && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {t.invalidKey}
          </p>
        )}
        <form action={formAction} className="mt-4 space-y-3">
          <input
            className="input"
            type="password"
            name="key"
            placeholder={t.key}
            dir="ltr"
            autoComplete="current-password"
            autoFocus
            required
          />
          <button disabled={pending} className="btn-gold w-full">
            {pending ? dict.common.loading : t.enter}
          </button>
        </form>
        <a href={`/${lang}`} className="mt-4 inline-block text-sm text-slate-500 hover:text-slate-300">
          ← {dict.nav.home}
        </a>
      </div>
    </div>
  );
}
