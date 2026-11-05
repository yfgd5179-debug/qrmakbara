"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { loginAction, registerAction } from "@/lib/actions";
import { COUNTRY_CODES, type Dict } from "@/lib/dict";
import { normalizePhone } from "@/lib/phone";

export function AuthForm({
  mode,
  dict,
  lang,
}: {
  mode: "login" | "register";
  dict: Dict;
  lang: string;
}) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState(action, null);
  // Phone is the sign-in identifier, so it is normalized while typing:
  // "+964 770 123 4567" and "00964 770…" both become "07701234567".
  const [phone, setPhone] = useState("");

  const t = dict.auth;
  const errors: Record<string, string> = {
    invalid: t.invalid,
    phoneExists: t.phoneExists,
    phone: t.invalidPhone,
    password: t.invalid,
    name: t.fullName,
    rate: t.rateLimit,
    error: dict.common.error,
  };
  const errorText = state?.error ? errors[state.error] : null;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-8">
        <h1 className="text-2xl font-bold text-white">
          {mode === "login" ? t.loginTitle : t.registerTitle}
        </h1>

        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="lang" value={lang} />
          {mode === "register" && (
            <div>
              <label className="label" htmlFor="name">
                {t.fullName}
              </label>
              <input id="name" name="name" className="input" required />
            </div>
          )}

          <div>
            <label className="label" htmlFor="phone">
              {t.phone} *
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              className="input"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(normalizePhone(e.target.value))}
              placeholder="07XX XXX XXXX"
              pattern="07[0-9]{9}"
              title={t.phoneHint}
              maxLength={11}
              autoComplete={mode === "login" ? "username" : "tel"}
              required
            />
            <p className="mt-1 text-xs text-slate-500">{t.phoneHint}</p>
          </div>

          <div>
            <label className="label" htmlFor="password">
              {t.password}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              dir="ltr"
              minLength={mode === "register" ? 6 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
            {mode === "register" && (
              <p className="mt-1 text-xs text-slate-500">{t.passwordHint}</p>
            )}
          </div>

          {mode === "register" && (
            <div>
              <label className="label" htmlFor="country">
                {t.country}
              </label>
              <select
                id="country"
                name="country"
                className="input"
                defaultValue="IQ"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {dict.countries[c]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {errorText && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {errorText}
            </p>
          )}

          <button type="submit" disabled={pending} className="btn-gold w-full">
            {pending
              ? dict.common.loading
              : mode === "login"
                ? t.submitLogin
                : t.submitRegister}
          </button>
        </form>

        {mode === "login" && (
          <p className="text-end text-sm">
            <Link href={`/${lang}/forgot`} className="text-gold underline">
              {t.forgotLink}
            </Link>
          </p>
        )}
        <p className="mt-6 text-center text-sm text-slate-400">
          {mode === "login" ? t.noAccount : t.haveAccount}{" "}
          <Link
            href={`/${lang}/${mode === "login" ? "register" : "login"}`}
            className="text-gold underline"
          >
            {mode === "login" ? t.submitRegister : t.submitLogin}
          </Link>
        </p>
      </div>
    </div>
  );
}
