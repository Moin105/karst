import { insertSocialPost, type SocialPlatform, type SocialPost } from '@/lib/db';

// In-process draft generation. Calls the model provider directly (no SDK — just
// fetch) so the whole thing runs as a normal Next.js route on Vercel. One post
// per requested platform, generated in parallel.
//
// Two providers are supported because these posts are short and structured, so
// a free-tier Gemini Flash key handles them fine — an Anthropic key is optional.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

type Provider = 'anthropic' | 'gemini';

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  gemini: 'gemini-2.0-flash',
};

// Whichever key is present wins; KARST_SOCIAL_PROVIDER forces one explicitly.
function pickProvider(): Provider {
  const explicit = process.env.KARST_SOCIAL_PROVIDER?.toLowerCase();
  if (explicit === 'anthropic' || explicit === 'gemini') return explicit;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  throw new Error('no model key set — set GEMINI_API_KEY or ANTHROPIC_API_KEY');
}

const BRAND =
  'karst gives any AI coding agent (Claude, Cursor) a local map of a codebase: ' +
  'cited answers plus blast-radius impact analysis (what a change breaks). It runs ' +
  '100% locally over MCP, is pack-scoped for ~60% fewer tokens, and prints the exact ' +
  'per-model token cost of every answer. Tone: technical, confident, no hype, ' +
  'developer-to-developer. Never invent metrics.';

const GUIDE: Record<SocialPlatform, string> = {
  x: 'One tweet, <= 270 characters. Strong first-line hook, then the point, then the link. At most 2 hashtags.',
  reddit:
    'A Reddit self-post for a dev subreddit: a concise "title" and a helpful, non-salesy "body" (3-6 sentences). No marketing voice; share it like a useful tool you built.',
  discord:
    'A short Discord community/changelog message (2-4 sentences). Friendly, emoji OK, like posting in your own server.',
  instagram:
    'An Instagram caption (2-4 short lines) plus a "hashtags" string of 5-10 relevant tags. Set "media_hint" to a short DESCRIPTION of the ideal image — a human will swap it for a real public image URL before publishing.',
};

const SYSTEM =
  "You are karst's social media writer. " +
  BRAND +
  ' Respond with STRICT JSON ONLY (no prose, no code fences) matching exactly: ' +
  '{"title": string|null, "body": string, "hashtags": string|null, "link": string|null, "media_hint": string|null}.';

function userPrompt(platform: SocialPlatform, theme: string): string {
  return (
    `Platform: ${platform}\n` +
    `Guidelines: ${GUIDE[platform]}\n` +
    `Theme / idea: ${theme || "karst's core value proposition"}\n` +
    'Write the post now as JSON.'
  );
}

function parseLenient(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    return { body: text };
  }
}

// Model output is untrusted JSON — a field could come back as an object/number.
// Coerce every text field to a string (or null) so we never store "[object Object]".
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === 'string' ? v : String(v);
  return s.length ? s : null;
}

async function callClaude(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.KARST_SOCIAL_MODEL || DEFAULT_MODEL.anthropic,
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty model response');
  return text;
}

async function callGemini(system: string, user: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const model = process.env.KARST_SOCIAL_MODEL || DEFAULT_MODEL.gemini;
  // Key goes in a header, never the query string, so it can't leak via logs.
  const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      // SYSTEM already pins the exact JSON shape; asking for a JSON mime type
      // makes the model honour it instead of wrapping it in prose or fences.
      generationConfig: { maxOutputTokens: 700, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty model response');
  return text;
}

function callModel(system: string, user: string): Promise<string> {
  return pickProvider() === 'gemini' ? callGemini(system, user) : callClaude(system, user);
}

export async function generateDrafts(
  theme: string,
  platforms: SocialPlatform[]
): Promise<{ created: SocialPost[]; errors: { platform: SocialPlatform; error: string }[] }> {
  const created: SocialPost[] = [];
  const errors: { platform: SocialPlatform; error: string }[] = [];

  await Promise.all(
    platforms.map(async (p) => {
      try {
        const text = await callModel(SYSTEM, userPrompt(p, theme));
        const obj = parseLenient(text);
        // Falsy/empty body (model returned "" or a non-string) falls back to the
        // raw completion so we never insert a blank draft.
        const bodyText = typeof obj.body === 'string' && obj.body.trim() ? obj.body : text;
        const post = await insertSocialPost({
          platform: p,
          theme: theme || null,
          title: str(obj.title),
          body: bodyText.slice(0, 9_000),
          hashtags: str(obj.hashtags),
          link: str(obj.link) ?? 'https://karst.dev',
          media_hint: str(obj.media_hint),
        });
        created.push(post);
      } catch (e) {
        errors.push({ platform: p, error: e instanceof Error ? e.message : 'generation failed' });
      }
    })
  );

  return { created, errors };
}
