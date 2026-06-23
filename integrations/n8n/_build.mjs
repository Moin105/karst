// Builds the two importable n8n workflows for karst's social pipeline.
//   node _build.mjs
// Writes:  karst-social-generate.json , karst-social-publish.json
//
// Everything is plain HTTP Request + Code nodes so it imports on free,
// self-hosted n8n (community edition) with no paid features. Secrets live in
// n8n credentials you attach after import — never in these files.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// --- helpers ---------------------------------------------------------------
let _id = 0;
const nid = () => `node_${++_id}`;
function node(name, type, typeVersion, position, parameters, extra = {}) {
  return { id: nid(), name, type, typeVersion, position, parameters, ...extra };
}
// HTTP node sending a JSON body built by an expression that returns a JSON string.
function httpJson({ name, pos, url, jsonBody, headers = [], auth = null }) {
  const params = {
    method: 'POST',
    url,
    sendHeaders: headers.length > 0,
    headerParameters: { parameters: headers },
    sendBody: true,
    specifyBody: 'json',
    jsonBody,
    options: {},
  };
  const extra = {};
  if (auth === 'header') {
    params.authentication = 'genericCredentialType';
    params.genericAuthType = 'httpHeaderAuth';
  } else if (auth) {
    params.authentication = 'predefinedCredentialType';
    params.nodeCredentialType = auth;
  }
  return node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, params, extra);
}
function code(name, pos, jsCode, mode = 'runOnceForAllItems') {
  return node(name, 'n8n-nodes-base.code', 2, pos, { mode, jsCode });
}
function connect(conns, from, to, fromOut = 0) {
  conns[from] = conns[from] || { main: [] };
  while (conns[from].main.length <= fromOut) conns[from].main.push([]);
  conns[from].main[fromOut].push({ node: to, type: 'main', index: 0 });
}

const JSON_HEADERS = [{ name: 'content-type', value: 'application/json' }];

// === Workflow 1: GENERATE ==================================================
function buildGenerate() {
  _id = 0;
  const nodes = [];
  const conns = {};

  const webhook = node('Webhook', 'n8n-nodes-base.webhook', 2, [0, 300], {
    httpMethod: 'POST',
    path: 'karst-social-generate',
    responseMode: 'onReceived',
    options: {},
  }, { webhookId: 'karst-social-generate' });
  nodes.push(webhook);

  const buildJobs = code('Build jobs', [240, 300], `
// ===== EDIT THESE TWO LINES =====
const DASHBOARD_URL = 'http://localhost:3001'; // your dashboard origin
const MODEL = 'claude-sonnet-4-6';
// ================================

const inJson = $input.first().json;
const payload = inJson.body ?? inJson; // webhook wraps POST body under .body
const theme = (payload.theme || '').toString();
const platforms = Array.isArray(payload.platforms) && payload.platforms.length
  ? payload.platforms
  : ['x', 'reddit', 'discord', 'instagram'];

const BRAND =
  "karst gives any AI coding agent (Claude, Cursor) a local map of a codebase: " +
  "cited answers plus blast-radius impact analysis (what a change breaks). It runs " +
  "100% locally over MCP, is pack-scoped for ~60% fewer tokens, and now prints the " +
  "exact per-model token cost of every answer. Tone: technical, confident, no hype, " +
  "developer-to-developer. Never invent metrics.";

const GUIDE = {
  x: 'One tweet, <= 270 characters. Strong first-line hook, then the point, then the link. At most 2 hashtags.',
  reddit: 'A Reddit self-post for a dev subreddit: a concise "title" and a helpful, non-salesy "body" (3-6 sentences). No marketing voice; share it like a useful tool you built.',
  discord: 'A short Discord community/changelog message (2-4 sentences). Friendly, emoji OK, like posting in your own server.',
  instagram: 'An Instagram caption (2-4 short lines) plus a "hashtags" string of 5-10 relevant tags. Set "media_hint" to a short DESCRIPTION of the ideal image — a human will swap it for a real public image URL in the dashboard before publishing (Instagram requires an image URL to post).',
};

const SYSTEM =
  "You are karst's social media writer. " + BRAND + " " +
  'Respond with STRICT JSON ONLY (no prose, no code fences) matching exactly: ' +
  '{"title": string|null, "body": string, "hashtags": string|null, "link": string|null, "media_hint": string|null}.';

return platforms.map((p) => ({
  json: {
    platform: p,
    theme,
    model: MODEL,
    dashboard_url: DASHBOARD_URL,
    system: SYSTEM,
    user:
      'Platform: ' + p + '\\n' +
      'Guidelines: ' + (GUIDE[p] || '') + '\\n' +
      'Theme / idea: ' + (theme || "karst's core value proposition") + '\\n' +
      'Write the post now as JSON.',
  },
}));
`.trim());
  nodes.push(buildJobs);

  const claude = httpJson({
    name: 'Claude (Anthropic)',
    pos: [480, 300],
    url: 'https://api.anthropic.com/v1/messages',
    headers: [...JSON_HEADERS, { name: 'anthropic-version', value: '2023-06-01' }],
    auth: 'header', // Header Auth credential: Name = x-api-key, Value = <your Anthropic key>
    jsonBody:
      "={{ JSON.stringify({ model: $json.model, max_tokens: 700, system: $json.system, messages: [{ role: 'user', content: $json.user }] }) }}",
  });
  nodes.push(claude);

  const parse = code('Parse', [720, 300], `
const text = ($json.content && $json.content[0] && $json.content[0].text) || '';
let obj;
try {
  obj = JSON.parse(text);
} catch (e) {
  const m = text.match(/\\{[\\s\\S]*\\}/);
  obj = m ? JSON.parse(m[0]) : { body: text };
}
const job = $('Build jobs').item.json;
return {
  json: {
    platform: job.platform,
    theme: job.theme || null,
    title: obj.title ?? null,
    body: (obj.body ?? text ?? '').toString(),
    hashtags: obj.hashtags ?? null,
    link: obj.link ?? 'https://karst.dev',
    media_hint: obj.media_hint ?? null,
    dashboard_url: job.dashboard_url,
  },
};
`.trim(), 'runOnceForEachItem');
  nodes.push(parse);

  const post = httpJson({
    name: 'Post draft to dashboard',
    pos: [960, 300],
    url: '={{ $json.dashboard_url }}/api/ingest/social',
    headers: JSON_HEADERS,
    auth: 'header', // Header Auth credential: Name = Authorization, Value = Bearer <KARST_SOCIAL_INGEST_TOKEN>
    jsonBody:
      "={{ JSON.stringify({ platform: $json.platform, body: $json.body, theme: $json.theme, title: $json.title, hashtags: $json.hashtags, link: $json.link, media_hint: $json.media_hint }) }}",
  });
  nodes.push(post);

  connect(conns, 'Webhook', 'Build jobs');
  connect(conns, 'Build jobs', 'Claude (Anthropic)');
  connect(conns, 'Claude (Anthropic)', 'Parse');
  connect(conns, 'Parse', 'Post draft to dashboard');

  return {
    name: 'karst — social: generate drafts',
    nodes,
    connections: conns,
    active: false,
    settings: { executionOrder: 'v1' },
    tags: [],
  };
}

// === Workflow 2: PUBLISH ===================================================
function buildPublish() {
  _id = 0;
  const nodes = [];
  const conns = {};

  const webhook = node('Webhook', 'n8n-nodes-base.webhook', 2, [0, 400], {
    httpMethod: 'POST',
    path: 'karst-social-publish',
    responseMode: 'onReceived',
    options: {},
  }, { webhookId: 'karst-social-publish' });
  nodes.push(webhook);

  const config = code('Config', [220, 400], `
// ===== EDIT THIS LINE =====
const DASHBOARD_URL = 'http://localhost:3001'; // your dashboard origin
// ==========================
const p = $input.first().json;
const body = p.body ?? p;
return { json: { ...body, dashboard_url: DASHBOARD_URL } };
`.trim());
  nodes.push(config);

  const sw = node('Route by platform', 'n8n-nodes-base.switch', 3, [440, 400], {
    rules: {
      values: [
        { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.platform }}', rightValue: 'discord', operator: { type: 'string', operation: 'equals' } }] }, outputKey: 'discord' },
        { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.platform }}', rightValue: 'x', operator: { type: 'string', operation: 'equals' } }] }, outputKey: 'x' },
        { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.platform }}', rightValue: 'reddit', operator: { type: 'string', operation: 'equals' } }] }, outputKey: 'reddit' },
        { conditions: { options: { caseSensitive: true, typeValidation: 'strict' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.platform }}', rightValue: 'instagram', operator: { type: 'string', operation: 'equals' } }] }, outputKey: 'instagram' },
      ],
    },
    options: {},
  });
  nodes.push(sw);

  // Discord: pure webhook POST. Paste your channel webhook URL below.
  const discord = httpJson({
    name: 'Discord webhook',
    pos: [680, 120],
    url: 'https://discord.com/api/webhooks/REPLACE_WITH_YOUR_WEBHOOK',
    headers: JSON_HEADERS,
    jsonBody: "={{ JSON.stringify({ content: ($json.body || '').slice(0, 1900) }) }}",
  });
  discord.onError = 'continueErrorOutput';
  nodes.push(discord);

  // X / Twitter: needs a Twitter OAuth2 credential attached to this node.
  const x = httpJson({
    name: 'X / Twitter post',
    pos: [680, 300],
    url: 'https://api.twitter.com/2/tweets',
    headers: JSON_HEADERS,
    auth: 'twitterOAuth2Api',
    jsonBody: "={{ JSON.stringify({ text: ($json.body || '').slice(0, 280) }) }}",
  });
  x.onError = 'continueErrorOutput';
  nodes.push(x);

  // Reddit: form-encoded submit; needs a Reddit OAuth2 credential.
  const reddit = node('Reddit submit', 'n8n-nodes-base.httpRequest', 4.2, [680, 480], {
    method: 'POST',
    url: 'https://oauth.reddit.com/api/submit',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'redditOAuth2Api',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'User-Agent', value: 'karst-social/1.0' }] },
    sendBody: true,
    contentType: 'form-urlencoded',
    bodyParameters: {
      parameters: [
        { name: 'sr', value: "={{ ($json.target || '').replace(/^\\/?r\\//, '') }}" },
        { name: 'kind', value: 'self' },
        { name: 'title', value: "={{ $json.title || ($json.body || '').split('\\n')[0].slice(0, 290) }}" },
        { name: 'text', value: '={{ $json.body }}' },
        { name: 'api_type', value: 'json' },
      ],
    },
    options: {},
  }, { onError: 'continueErrorOutput' });
  nodes.push(reddit);

  // Instagram: Graph API two-step needs a Business account + image. Container step.
  const ig = httpJson({
    name: 'Instagram media',
    pos: [680, 660],
    url: 'https://graph.facebook.com/v21.0/me/media',
    headers: JSON_HEADERS,
    auth: 'facebookGraphApi',
    jsonBody:
      "={{ JSON.stringify({ image_url: $json.media_hint, caption: ($json.body || '') + ($json.hashtags ? '\\n\\n' + $json.hashtags : '') }) }}",
  });
  ig.onError = 'continueErrorOutput';
  nodes.push(ig);

  // Success → build a "posted" payload (per-platform external_url) → callback.
  const posted = code('Mark posted', [940, 320], `
const cfg = $('Config').item.json;
const p = cfg.platform;
const r = $json || {};
let url = null;
if (p === 'x') url = r.data && r.data.id ? 'https://x.com/i/web/status/' + r.data.id : null;
else if (p === 'reddit') url = (r.json && r.json.data && (r.json.data.url || (r.json.data.things && r.json.data.things[0] && r.json.data.things[0].data && r.json.data.things[0].data.url))) || null;
else if (p === 'instagram') url = 'https://www.instagram.com/';
return { json: { id: cfg.id, status: 'posted', external_url: url, dashboard_url: cfg.dashboard_url } };
`.trim(), 'runOnceForEachItem');
  nodes.push(posted);

  const failed = code('Mark failed', [940, 560], `
const cfg = $('Config').item.json;
const r = $json || {};
const err = (r.error && (r.error.message || JSON.stringify(r.error))) || r.message || JSON.stringify(r).slice(0, 800);
return { json: { id: cfg.id, status: 'failed', error: String(err).slice(0, 1800), dashboard_url: cfg.dashboard_url } };
`.trim(), 'runOnceForEachItem');
  nodes.push(failed);

  const cbPosted = httpJson({
    name: 'Callback: posted',
    pos: [1180, 320],
    url: '={{ $json.dashboard_url }}/api/ingest/social/status',
    headers: JSON_HEADERS,
    auth: 'header', // same Header Auth credential as the generate workflow (Authorization: Bearer <token>)
    jsonBody: "={{ JSON.stringify({ id: $json.id, status: 'posted', external_url: $json.external_url }) }}",
  });
  nodes.push(cbPosted);

  const cbFailed = httpJson({
    name: 'Callback: failed',
    pos: [1180, 560],
    url: '={{ $json.dashboard_url }}/api/ingest/social/status',
    headers: JSON_HEADERS,
    auth: 'header',
    jsonBody: "={{ JSON.stringify({ id: $json.id, status: 'failed', error: $json.error }) }}",
  });
  nodes.push(cbFailed);

  connect(conns, 'Webhook', 'Config');
  connect(conns, 'Config', 'Route by platform');
  // switch outputs: 0=discord, 1=x, 2=reddit, 3=instagram
  connect(conns, 'Route by platform', 'Discord webhook', 0);
  connect(conns, 'Route by platform', 'X / Twitter post', 1);
  connect(conns, 'Route by platform', 'Reddit submit', 2);
  connect(conns, 'Route by platform', 'Instagram media', 3);
  // success (main output 0) → Mark posted ; error output (1) → Mark failed
  for (const n of ['Discord webhook', 'X / Twitter post', 'Reddit submit', 'Instagram media']) {
    connect(conns, n, 'Mark posted', 0);
    connect(conns, n, 'Mark failed', 1);
  }
  connect(conns, 'Mark posted', 'Callback: posted');
  connect(conns, 'Mark failed', 'Callback: failed');

  return {
    name: 'karst — social: publish approved',
    nodes,
    connections: conns,
    active: false,
    settings: { executionOrder: 'v1' },
    tags: [],
  };
}

const gen = buildGenerate();
const pub = buildPublish();
writeFileSync(join(here, 'karst-social-generate.json'), JSON.stringify(gen, null, 2));
writeFileSync(join(here, 'karst-social-publish.json'), JSON.stringify(pub, null, 2));
console.log('wrote karst-social-generate.json (%d nodes) + karst-social-publish.json (%d nodes)', gen.nodes.length, pub.nodes.length);
