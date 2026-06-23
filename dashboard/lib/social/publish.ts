import { createHmac, randomBytes } from 'node:crypto';
import type { SocialPost, SocialAccount } from '@/lib/db';

// In-process publishing. Each platform posts via its own HTTP API using secrets
// from env vars (set in the dashboard's Vercel project, never in the DB). A
// platform whose env isn't configured returns a clear "not configured" error so
// the post is marked `failed` and you can post it by hand — partial setups work.

export type PublishResult = { status: 'posted' | 'failed'; external_url: string | null; error: string | null };

function ok(external_url: string | null): PublishResult {
  return { status: 'posted', external_url, error: null };
}
function fail(error: string): PublishResult {
  return { status: 'failed', external_url: null, error: error.slice(0, 1_800) };
}

// ---- Discord (channel webhook) -------------------------------------------
async function postDiscord(post: SocialPost): Promise<PublishResult> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return fail('Discord not configured (set DISCORD_WEBHOOK_URL)');
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'wait=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: (post.body || '').slice(0, 1_900) }),
  });
  if (!res.ok) return fail(`discord ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  // wait=true returns the message; we can't build a full channel URL without the
  // guild id, so just confirm it posted.
  return ok(null);
}

// ---- Reddit (script app, password grant) ---------------------------------
async function postReddit(post: SocialPost, account: SocialAccount | null): Promise<PublishResult> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  const user = process.env.REDDIT_USERNAME;
  const pass = process.env.REDDIT_PASSWORD;
  if (!id || !secret || !user || !pass) {
    return fail('Reddit not configured (set REDDIT_CLIENT_ID / _SECRET / _USERNAME / _PASSWORD)');
  }
  const sub = (account?.target || '').replace(/^\/?r\//i, '').trim();
  if (!sub) return fail('No subreddit set — add a Target like "devtools" on the Handles page');
  const ua = 'karst-social/1.0';

  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': ua,
    },
    body: new URLSearchParams({ grant_type: 'password', username: user, password: pass }),
  });
  if (!tokenRes.ok) return fail(`reddit auth ${tokenRes.status}`);
  const token = (await tokenRes.json().catch(() => ({})))?.access_token;
  if (!token) return fail('reddit auth: no access_token');

  const title = post.title || (post.body || '').split('\n')[0].slice(0, 290) || 'karst';
  const submitRes = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': ua,
    },
    body: new URLSearchParams({ sr: sub, kind: 'self', title, text: post.body || '', api_type: 'json' }),
  });
  const data = await submitRes.json().catch(() => ({}));
  const errs = data?.json?.errors;
  if (Array.isArray(errs) && errs.length) return fail(`reddit: ${JSON.stringify(errs[0])}`);
  const url = data?.json?.data?.url || null;
  return ok(url);
}

// ---- X / Twitter (OAuth 1.0a user context) -------------------------------
function pct(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
function oauth1Header(
  method: string,
  url: string,
  creds: { key: string; secret: string; token: string; tokenSecret: string }
): string {
  // JSON-body request: the signature base includes only the oauth_* params (and
  // any query params, of which /2/tweets has none).
  const params: Record<string, string> = {
    oauth_consumer_key: creds.key,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.token,
    oauth_version: '1.0',
  };
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${pct(k)}=${pct(params[k])}`)
    .join('&');
  const base = [method.toUpperCase(), pct(url), pct(paramString)].join('&');
  const signingKey = `${pct(creds.secret)}&${pct(creds.tokenSecret)}`;
  const signature = createHmac('sha1', signingKey).update(base).digest('base64');
  const all: Record<string, string> = { ...params, oauth_signature: signature };
  return (
    'OAuth ' +
    Object.keys(all)
      .sort()
      .map((k) => `${pct(k)}="${pct(all[k])}"`)
      .join(', ')
  );
}
async function postX(post: SocialPost): Promise<PublishResult> {
  const key = process.env.X_API_KEY;
  const secret = process.env.X_API_SECRET;
  const token = process.env.X_ACCESS_TOKEN;
  const tokenSecret = process.env.X_ACCESS_SECRET;
  if (!key || !secret || !token || !tokenSecret) {
    return fail('X not configured (set X_API_KEY / _API_SECRET / _ACCESS_TOKEN / _ACCESS_SECRET)');
  }
  const url = 'https://api.twitter.com/2/tweets';
  const auth = oauth1Header('POST', url, { key, secret, token, tokenSecret });
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ text: (post.body || '').slice(0, 280) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return fail(`x ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const tid = data?.data?.id;
  return ok(tid ? `https://x.com/i/web/status/${tid}` : null);
}

// ---- Instagram (Graph API, 2-step) ---------------------------------------
async function postInstagram(post: SocialPost): Promise<PublishResult> {
  const userId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!userId || !token) return fail('Instagram not configured (set IG_USER_ID / IG_ACCESS_TOKEN)');
  const image = (post.media_hint || '').trim();
  if (!/^https?:\/\//i.test(image)) {
    return fail('Instagram needs a public image URL in the "Image asset" field (media_hint)');
  }
  const caption = (post.body || '') + (post.hashtags ? `\n\n${post.hashtags}` : '');
  const base = 'https://graph.facebook.com/v21.0';

  const createRes = await fetch(`${base}/${userId}/media`, {
    method: 'POST',
    body: new URLSearchParams({ image_url: image, caption, access_token: token }),
  });
  const created = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !created?.id) return fail(`ig container: ${JSON.stringify(created).slice(0, 200)}`);

  const pubRes = await fetch(`${base}/${userId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: created.id, access_token: token }),
  });
  const published = await pubRes.json().catch(() => ({}));
  if (!pubRes.ok || !published?.id) return fail(`ig publish: ${JSON.stringify(published).slice(0, 200)}`);
  return ok('https://www.instagram.com/');
}

export async function publishPost(post: SocialPost, account: SocialAccount | null): Promise<PublishResult> {
  try {
    switch (post.platform) {
      case 'discord':
        return await postDiscord(post);
      case 'reddit':
        return await postReddit(post, account);
      case 'x':
        return await postX(post);
      case 'instagram':
        return await postInstagram(post);
      default:
        return fail(`unknown platform ${post.platform}`);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'publish error');
  }
}
