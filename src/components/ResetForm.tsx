"use client";

import { useState } from "react";
import { resetPasswordAction } from "@/lib/actions";

export function ResetForm({
  lang,
  dict,
}: {
  lang: string;
  dict: Record<string, unknown>;
}) {
  const t = (dict as { auth: Record<string, string> }).auth;
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const errorMessages: Record<string, string> = {
    phone: t.invalidPhone,
    password: t.passwordHint,
    send: t.sendFailed,
    invalidCode: t.invalidCode,
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("lang", lang);
    const res = await resetPasswordAction(null, fd);
    if (res && "error" in res && res.error) {
      setError(res.error);
      setStatus("error");
    } else {
      setStatus("done");
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-8">
        <h1 className="text-2xl font-bold text-white">{t.resetTitle}</h1>
        {status === "done" && (
          <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {t.resetSuccess}
          </p>
        )}
        {status === "error" && error && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessages[error] ?? t.invalidCode}
          </p>
        )}
        <form onSubmit={submit} className="mt-6 space-y-4">
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
          <button type="submit" disabled={status === "loading"} className="btn-gold w-full">
            {status === "loading" ? "..." : t.resetSubmit}
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
