export type Locale = "ar" | "ku" | "en" | "tr";

export const LOCALES: Locale[] = ["ar", "ku", "en", "tr"];
export const RTL_LOCALES: Locale[] = ["ar", "ku"];

export type User = {
  id: string;
  password_hash: string;
  name: string;
  phone: string;
  country: string;
  created_at: string;
};

export type Memorial = {
  id: string;
  user_id: string;
  slug: string;
  status: "draft" | "ready" | "published";
  name: string;
  gender: "" | "male" | "female";
  birth_year: string;
  death_year: string;
  age: string;
  city: string;
  country: string;
  school: string;
  university: string;
  job: string;
  marital: "" | "single" | "married" | "widowed";
  children: string;
  hobbies: string;
  achievements: string;
  quote: string;
  memories: string;
  story: string;
  story_lang: Locale | "";
  photos: string; // JSON array of urls
  videos: string; // JSON array of urls
  created_at: string;
};

export type Order = {
  id: string;
  memorial_id: string;
  user_id: string;
  contact_name: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  payment_method: "cash" | "card" | "online";
  amount: number;
  currency: string;
  status: "pending" | "paid" | "shipped" | "delivered" | "cancelled";
  created_at: string;
  /** Gateway payment reference for online payments — ZainCash transaction id or Qi Card paymentId (null otherwise). */
  payment_ref?: string | null;
};

export type StoryResult = { story: string; provider: string };
