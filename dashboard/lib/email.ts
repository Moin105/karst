import nodemailer, { type Transporter } from 'nodemailer';

// Email is best-effort. If SMTP isn't configured (no SMTP_HOST/USER/PASS, e.g.
// local dev), every send below quietly no-ops so the app still works. Callers
// should also wrap calls in try/catch — a mail failure must never break a flow.

const FROM = process.env.EMAIL_FROM || process.env.SMTP_USER || 'karst.support@gmail.com';
const REPLY_TO = process.env.EMAIL_REPLY_TO || undefined;
const OWNER_NOTIFY = process.env.OWNER_NOTIFY_EMAIL || undefined;

let _transport: Transporter | null = null;
function transport(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  if (!_transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    _transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user, pass },
    });
  }
  return _transport;
}

export function emailEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// ── Branded HTML shell ──────────────────────────────────────────────────────
// Table-based + inline styles for broad email-client compatibility (Gmail,
// Outlook, Apple Mail). karst look: dark header, white card, emerald accent.
function shell(opts: { preview?: string; body: string }): string {
  const preview = opts.preview
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${opts.preview}</div>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9">
${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      <tr><td style="background:#0b1220;padding:22px 30px">
        <span style="font-size:21px;font-weight:700;color:#f8fafc;letter-spacing:-0.02em">karst</span>
        <span style="color:#10b981;font-size:15px;margin-left:7px;vertical-align:middle">◆</span>
      </td></tr>
      <tr><td style="padding:34px 30px 30px">
        ${opts.body}
      </td></tr>
      <tr><td style="padding:18px 30px;border-top:1px solid #f1f5f9;background:#fafafa">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8">
          karst — precise, pack-scoped code context for AI dev tools.
        </p>
      </td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:11px;color:#cbd5e1">© karst</p>
  </td></tr>
</table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">
    <tr><td style="border-radius:10px;background:#10b981">
      <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${label}</a>
    </td></tr>
  </table>`;
}

const H1 = 'margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;color:#0f172a;letter-spacing:-0.01em';
const P = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#475569';
const MUTED = 'margin:18px 0 0;font-size:13px;line-height:1.6;color:#94a3b8';

// Escape user-supplied text before inlining it into an HTML email body.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Senders ─────────────────────────────────────────────────────────────────

async function send(opts: { to: string; subject: string; html: string; text?: string; replyTo?: string }): Promise<boolean> {
  const t = transport();
  if (!t) return false;
  await t.sendMail({
    from: FROM,
    to: opts.to,
    replyTo: opts.replyTo ?? REPLY_TO,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  return true;
}

/** Welcome email to a brand-new waitlist signup. Returns true if actually sent. */
export async function sendSignupWelcome(to: string): Promise<boolean> {
  const body = `
    <h1 style="${H1}">You're on the list 🎉</h1>
    <p style="${P}">
      Thanks for joining the <strong style="color:#0f172a">karst</strong> waitlist.
      karst gives AI dev tools precise, pack-scoped context from your codebase —
      so your assistant stops burning tokens crawling the whole repo and starts
      answering from the parts that actually matter.
    </p>
    <p style="${P}">You can start using the CLI today:</p>
    <div style="margin:0 0 18px;background:#0b1220;border-radius:10px;padding:14px 16px">
      <code style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;color:#e2e8f0">pip install karst</code>
    </div>
    ${button('https://pypi.org/project/karst/', 'View on PyPI')}
    <p style="${MUTED}">We'll email you the moment early access opens. — the karst team</p>
  `;
  return send({
    to,
    subject: "You're on the karst waitlist",
    html: shell({ preview: 'Welcome to the karst waitlist.', body }),
    text: "You're on the karst waitlist. Install the CLI today: pip install karst. We'll email you when early access opens.",
  });
}

/** Optional internal ping so the owner knows someone signed up. */
export async function notifyOwnerOfSignup(signupEmail: string, source?: string | null): Promise<boolean> {
  if (!OWNER_NOTIFY) return false;
  const body = `
    <h1 style="${H1}">New signup ✦</h1>
    <p style="${P}">Someone just joined the karst waitlist.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px">
      <tr><td style="${P};margin:0;padding:2px 0;color:#0f172a"><strong>Email:</strong>&nbsp; ${esc(signupEmail)}</td></tr>
      <tr><td style="${P};margin:0;padding:2px 0;color:#475569"><strong>Source:</strong>&nbsp; ${esc(source || 'unknown')}</td></tr>
    </table>
  `;
  return send({
    to: OWNER_NOTIFY,
    replyTo: signupEmail,
    subject: `New karst signup: ${signupEmail}`,
    html: shell({ preview: `New signup: ${esc(signupEmail)}`, body }),
    text: `New waitlist signup\n\nemail: ${signupEmail}\nsource: ${source || 'unknown'}`,
  });
}

/** Notify the owner when someone sends feedback / a question from anywhere
 *  (landing form, CLI, MCP). Best-effort. Recipient falls back through
 *  OWNER_NOTIFY_EMAIL → KARST_ADMIN_EMAIL → SMTP_USER so it works without extra
 *  config. The message/contact are user-supplied, so they are HTML-escaped. */
export async function notifyOwnerOfFeedback(input: {
  message: string;
  contact?: string | null;
  severity?: string | null;
  source?: string | null;
}): Promise<boolean> {
  const to =
    process.env.OWNER_NOTIFY_EMAIL || process.env.KARST_ADMIN_EMAIL || process.env.SMTP_USER;
  if (!to) return false;

  const kind = (input.severity || 'message').toLowerCase();
  const contact = input.contact?.trim() || null;
  const replyTo = contact && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact) ? contact : undefined;

  const body = `
    <h1 style="${H1}">New ${esc(kind)} from karst</h1>
    <p style="${P}">Someone sent a message${input.source ? ` via <strong style="color:#0f172a">${esc(String(input.source))}</strong>` : ''}.</p>
    <div style="margin:0 0 16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.65;color:#0f172a;white-space:pre-wrap">${esc(input.message)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0">
      <tr><td style="padding:2px 0;font-size:14px;color:#475569"><strong style="color:#0f172a">From:</strong>&nbsp; ${contact ? esc(contact) : 'anonymous'}</td></tr>
      <tr><td style="padding:2px 0;font-size:14px;color:#475569"><strong style="color:#0f172a">Type:</strong>&nbsp; ${esc(kind)}</td></tr>
    </table>
    <p style="${MUTED}">${replyTo ? 'Reply directly to this email to respond to them.' : 'No contact was provided, so you can’t reply by email.'} Manage it in the feedback inbox.</p>
  `;
  return send({
    to,
    replyTo,
    subject: `karst ${kind}: ${input.message.slice(0, 60).replace(/\s+/g, ' ')}`,
    html: shell({ preview: esc(input.message.slice(0, 90)), body }),
    text: `New ${kind} from karst${input.source ? ` (${input.source})` : ''}\n\n${input.message}\n\nFrom: ${contact || 'anonymous'}`,
  });
}

/** Password-reset link for the admin. Returns true if actually sent. */
export async function sendPasswordReset(to: string, resetUrl: string): Promise<boolean> {
  const body = `
    <h1 style="${H1}">Reset your password</h1>
    <p style="${P}">
      We received a request to reset the password for your karst admin account.
      Click the button below to choose a new one. This link expires in
      <strong style="color:#0f172a">30 minutes</strong>.
    </p>
    ${button(resetUrl, 'Reset password')}
    <p style="${P};margin-top:18px">Or paste this link into your browser:</p>
    <p style="margin:0 0 8px;font-size:13px;word-break:break-all"><a href="${resetUrl}" style="color:#10b981">${resetUrl}</a></p>
    <p style="${MUTED}">
      Didn't request this? You can safely ignore this email — your password won't
      change unless you use the link above.
    </p>
  `;
  return send({
    to,
    subject: 'Reset your karst admin password',
    html: shell({ preview: 'Reset your karst admin password (link expires in 30 minutes).', body }),
    text: `Reset your karst admin password (expires in 30 minutes):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
  });
}
