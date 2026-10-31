"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  loginAction,
  registerAction,
} from "@/lib/actions";
import { COUNTRY_CODES, type Dict } from "@/lib/dict";

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

  const t = dict.auth;
  const errors: Record<string, string> = {
    invalid: t.invalid,
    exists: t.exists,
    email: t.invalid,
    password: t.invalid,
    name: t.fullName,
    rate: t.rateLimit,
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
            <label className="label" htmlFor="email">
              {mode === "login" ? t.emailOrPhone : t.email}
            </label>
            {/* Login accepts an email OR a phone number — type="email" would
                block phone sign-in with a browser validation error. */}
            <input
              id="email"
              name="email"
              type={mode === "login" ? "text" : "email"}
              className="input"
              dir="ltr"
              autoComplete={mode === "login" ? "username" : "email"}
              required
            />
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
              required
            />
            {mode === "register" && (
              <p className="mt-1 text-xs text-slate-500">{t.passwordHint}</p>
            )}
          </div>

          {mode === "register" && (
            <>
              <div>
                <label className="label" htmlFor="phone">
                  {t.phone}
                </label>
                <input
                  id="phone"
                  name="phone"
                  className="input"
                  dir="ltr"
                  placeholder="+964 ..."
                />
              </div>
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
            </>
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
