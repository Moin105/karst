import { insertSocialPost, type SocialPlatform, type SocialPost } from '@/lib/db';

// In-process draft generation. Calls Anthropic directly (no SDK — just fetch) so
// the whole thing runs as a normal Next.js route on Vercel. One post per
// requested platform, generated in parallel.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.KARST_SOCIAL_MODEL || 'claude-sonnet-4-6';

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
      model: MODEL,
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

export async function generateDrafts(
  theme: string,
  platforms: SocialPlatform[]
): Promise<{ created: SocialPost[]; errors: { platform: SocialPlatform; error: string }[] }> {
  const created: SocialPost[] = [];
  const errors: { platform: SocialPlatform; error: string }[] = [];

  await Promise.all(
    platforms.map(async (p) => {
      try {
        const text = await callClaude(SYSTEM, userPrompt(p, theme));
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
