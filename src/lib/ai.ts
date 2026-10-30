import type { StoryResult } from "./types";
import type { Memorial } from "./types";
import type { Locale } from "./types";

const LANG_NAMES: Record<Locale, string> = {
  ar: "العربية (Arabic)",
  ku: "کوردی سۆرانی (Kurdish Sorani)",
  en: "English",
  tr: "Türkçe",
};

function facts(m: Memorial): string {
  const parts = [
    `Name: ${m.name}`,
    m.gender ? `Gender: ${m.gender === "male" ? "male" : "female"}` : "",
    m.birth_year ? `Birth year: ${m.birth_year}` : "",
    m.death_year ? `Death year: ${m.death_year}` : "",
    m.age ? `Age at death: ${m.age}` : "",
    m.city || m.country ? `City/Country: ${m.city} ${m.country}` : "",
    m.school ? `School: ${m.school}` : "",
    m.university ? `University: ${m.university}` : "",
    m.job ? `Profession: ${m.job}` : "",
    m.marital ? `Marital status: ${m.marital}` : "",
    m.children ? `Children: ${m.children}` : "",
    m.hobbies ? `Hobbies: ${m.hobbies}` : "",
    m.achievements ? `Achievements: ${m.achievements}` : "",
    m.quote ? `A quote they loved: ${m.quote}` : "",
    m.memories ? `Memories shared by the family:\n${m.memories}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

function buildPrompt(m: Memorial, lang: Locale): string {
  const langName = LANG_NAMES[lang];
  return `You are a respectful biographer. Write a warm, dignified life story (obituary-style biography) for a deceased person, based on the facts below.

CRITICAL LANGUAGE RULE:
- The ENTIRE response MUST be written in ${langName}.
- Do NOT use English or any other language, even for a single word, unless ${langName} is English.
- If you cannot write in ${langName}, write nothing.

Requirements:
- 4 to 6 short paragraphs, flowing naturally, no headings or bullet points.
- Use only the facts given; do not invent names, dates, or events. You may connect facts with gentle, respectful language.
- Tone: tender, honoring, hopeful — suitable to be shown on a memorial page visited by family and friends.
- If the person had a favorite quote, weave it in near the end.
- Do not mention that you are an AI, and do not add commentary before or after the story.

Facts:
${facts(m)}`;
}

async function fetchJson(url: string, init: RequestInit, ms = 25000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;

  const choices = d.choices;
  if (Array.isArray(choices)) {
    const msg = (choices[0] as Record<string, unknown> | undefined)?.message;
    const content = (msg as Record<string, unknown> | undefined)?.content;
    if (typeof content === "string" && content.trim()) return content.trim();
  }

  const candidates = d.candidates;
  if (Array.isArray(candidates)) {
    const c0 = candidates[0] as Record<string, unknown> | undefined;
    const content = c0?.content as Record<string, unknown> | undefined;
    const parts = content?.parts;
    if (Array.isArray(parts)) {
      const text = (parts[0] as Record<string, unknown> | undefined)?.text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }

  if (typeof d.text === "string" && d.text.trim()) return d.text.trim();
  return "";
}

/** Free, keyless text generation via pollinations.ai */
async function pollinations(prompt: string): Promise<string> {
  const res = await fetchJson(
    "https://text.pollinations.ai/openai",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "openai",
        messages: [
          {
            role: "system",
            content:
              "You are a careful, respectful biographer. You MUST write the entire response in the language requested by the user. Never use English unless explicitly requested.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    },
    45000
  );
  if (!res.ok) throw new Error(`pollinations ${res.status}`);
  const text = extractText(await res.json());
  if (!text) throw new Error("pollinations empty");
  return text;
}

/** Free-tier Groq API (needs GROQ_API_KEY) */
async function groq(prompt: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no GROQ_API_KEY");
  const res = await fetchJson(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are a respectful biographer. Write the entire response in the language requested by the user. Never use English unless explicitly requested.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    },
    30000
  );
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const text = extractText(await res.json());
  if (!text) throw new Error("groq empty");
  return text;
}

/** Free-tier Google Gemini API (needs GEMINI_API_KEY) */
async function gemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no GEMINI_API_KEY");
  const res = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "You are a respectful biographer. Write the entire response in the language requested by the user. Never use English unless explicitly requested.",
            },
          ],
        },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 },
      }),
    },
    30000
  );
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const text = extractText(await res.json());
  if (!text) throw new Error("gemini empty");
  return text;
}

/** Offline fallback: a locally composed story from templates. */
function templateStory(m: Memorial, lang: Locale): string {
  const name = m.name || "—";
  const years =
    m.birth_year && m.death_year ? `${m.birth_year} – ${m.death_year}` : "";
  const age = m.age ? `, aged ${m.age}` : "";
  const where = [m.city, m.country].filter(Boolean).join(", ");
  const job = m.job ? ` as a ${m.job}` : "";
  const school = m.school ? ` at ${m.school}` : "";
  const uni = m.university ? ` and later at ${m.university}` : "";
  const hobbies = m.hobbies ? `They loved ${m.hobbies}.` : "";
  const achievements = m.achievements ? m.achievements : "";
  const quote = m.quote ? `"${m.quote}"` : "";
  const memories = (m.memories || "").trim();

  if (lang === "ar") {
    return [
      `${name}${years ? ` (${years})` : ""}${age}، ${where ? `من ${where}` : ""}.`,
      `قضى ${name} حياته${job ? ` في عمله${job === "كاتب" ? "" : ""}` : ""}${
        school ? ` بعد تعليمه${school}` : ""
      }، ${uni ? "ثم واصل تعليمه" : ""} وكان معروفاً بطيبوبته وكرمه.`,
      hobbies ? `${hobbies}` : "",
      achievements ? `من إنجازاته: ${achievements}` : "",
      memories ? `تبقى في ذاكرة أهله وأصدقائه: ${memories}` : "",
      quote ? `ويبقى في القلب هذا الأثر: ${quote}` : "",
      `رحمه الله وجعل الجنة مثواه، ولن تغيب ذكراه ما بقيت هذه الصفحة.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (lang === "ku") {
    return [
      `${name}${years ? ` (${years})` : ""}${age}، ${where ? `لە ${where}` : ""}.`,
      `${name} ژیانی خۆی${job ? ` بەپێی کارەکەی${job}` : ""}${
        school ? ` دوای فۆرمیشتن${school}` : ""
      } بەسەردان، ${uni ? "پاشان لە" : ""} و ناسراو بوو بە مرۆڤایەتی و خۆشەویستییەکانی.`,
      hobbies ? hobbies : "",
      achievements ? `له‌نزێکانی: ${achievements}` : "",
      memories ? `لە بیری خزم و هاوڕێیان مایە: ${memories}` : "",
      quote ? `ئەم بیرۆکەیە لە دڵدایە: ${quote}` : "",
      `خوای بەڕەوای لێ بکەوێت و بیگەڕێنێتەوە بۆ فردوس؛ بیرەوەری لەم پەڕەیەدا دەمێنێتەوە.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (lang === "tr") {
    return [
      `${name}${years ? ` (${years})` : ""}${age}${where ? `, ${where}` : ""}.`,
      `${name}, hayatı boyunca${school ? ` ${school}'de aldığı eğitim` : ""}${
        job ? `, sonrasında ise ${job} olarak çalışarak` : ""
      } çevresinde sevgi ve saygıyla anıldı.`,
      hobbies ? `${hobbies}` : "",
      achievements ? `Başarılarından bazıları: ${achievements}` : "",
      memories ? `Sevdiklerinin anılarında şöyle yaşar: ${memories}` : "",
      quote ? `Kalpte kalan izi: "${quote}"` : "",
      `Mekânı cennet olsun; bu sayfa süreceği sürece anısı yaşayacak.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return [
    `${name}${years ? ` (${years})` : ""}${age}${where ? `, from ${where}` : ""}.`,
    `${name} lived a life${job ? ` working as${job}` : ""}${
      school ? `, educated${school}` : ""
    } and was known for kindness and generosity.`,
    hobbies,
    achievements ? `Among their achievements: ${achievements}` : "",
    memories ? `In the hearts of family and friends lives this memory: ${memories}` : "",
    quote ? `The imprint they left behind: "${quote}"` : "",
    `May they rest in peace; this page keeps their memory alive.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function looksLikeLanguage(text: string, lang: Locale): boolean {
  if (lang === "ar" || lang === "ku") {
    // Sorani/Arabic use Arabic script
    return /[\\u0600-\\u06FF]/.test(text);
  }
  if (lang === "tr") {
    const lower = " " + text.toLowerCase() + " ";
    const enStop = [" the ", " and ", " was ", " were ", " of ", " in ", " to ", " is ", " are "];
    const hits = enStop.filter((w) => lower.includes(w)).length;
    return hits < 3;
  }
  return true;
}

/**
 * Generate the life story. Free by default:
 * 1) GROQ_API_KEY (fast & high quality), 2) Pollinations (no key), 3) GEMINI_API_KEY, 4) local template.
 */
export async function generateStory(
  m: Memorial,
  lang: Locale
): Promise<StoryResult> {
  const prompt = buildPrompt(m, lang);

  const providers: [string, (p: string) => Promise<string>][] = [];
  if (process.env.GROQ_API_KEY) providers.push(["groq", groq]);
  providers.push(["pollinations", pollinations]);
  if (process.env.GEMINI_API_KEY) providers.push(["gemini", gemini]);

  for (const [name, fn] of providers) {
    try {
      const story = await fn(prompt);
      if (story && story.length > 80 && looksLikeLanguage(story, lang)) {
        return { story, provider: name };
      }
    } catch {
      // try next provider
    }
  }
  return { story: templateStory(m, lang), provider: "template" };
}
