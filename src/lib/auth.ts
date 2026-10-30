import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { supabase } from "./db";
import type { User } from "./types";

const COOKIE = "session";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const test = scryptSync(password, salt, 64);
    return timingSafeEqual(Buffer.from(hash, "hex"), test);
  } catch {
    return false;
  }
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await supabase.from("sessions").insert({
    token,
    user_id: userId,
    created_at: new Date().toISOString(),
  });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await supabase.from("sessions").delete().eq("token", token);
  store.delete(COOKIE);
}

export async function getSession(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const { data: session } = await supabase
    .from("sessions")
    .select("user_id")
    .eq("token", token)
    .maybeSingle();
  if (!session) return null;
  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", (session as { user_id: string }).user_id)
    .maybeSingle();
  return (user as User) ?? null;
}
