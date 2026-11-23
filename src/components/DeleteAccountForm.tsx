"use client";

import { useActionState } from "react";
import { deleteAccountAction } from "@/lib/actions";
import type { Dict } from "@/lib/dict";

/**
 * Danger-zone form for permanent account deletion (GDPR). Confirmed by
 * re-entering the password — the second factor of phone+password auth —
 * so a stolen/lost unlocked device cannot wipe an account by itself.
 */
export function DeleteAccountForm({
  dict,
  lang,
}: {
  dict: Dict;
  lang: string;
}) {
  const [state, formAction, pending] = useActionState(
    deleteAccountAction,
    null
  );
  const t = dict.account;
  const errors: Record<string, string> = {
    password: t.wrongPassword,
    rate: dict.auth.rateLimit,
    failed: dict.common.error,
  };
  const errorText = state?.error
    ? (errors[state.error] ?? dict.common.error)
    : null;

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="lang" value={lang} />
      <div>
        <label className="label" htmlFor="delete-password">
          {t.passwordLabel}
        </label>
        <input
          id="delete-password"
          name="password"
          type="password"
          className="input"
          dir="ltr"
          autoComplete="current-password"
          required
        />
      </div>

      {errorText && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {errorText}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
      >
        {pending ? dict.common.loading : t.submit}
      </button>
    </form>
  );
}
