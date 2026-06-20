import nodemailer, { type Transporter } from 'nodemailer';

// Email is best-effort. If SMTP isn't configured (no SMTP_HOST/USER/PASS, e.g.
// local dev), every function below quietly no-ops so signups still succeed.
// Callers should also wrap calls in try/catch — a mail failure must never break
// the signup path.

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

function welcomeHtml(): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <h1 style="font-size:20px;margin:0 0 12px">You're on the karst waitlist 🎉</h1>
    <p style="font-size:14px;line-height:1.6;color:#334155">
      Thanks for signing up. <strong>karst</strong> gives AI dev tools precise,
      pack-scoped code context — so your assistant stops burning tokens crawling
      the whole repo and starts answering from the parts that matter.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#334155">
      We'll email you the moment your early access is ready. In the meantime you
      can install the CLI today:
    </p>
    <pre style="background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:8px;font-size:13px;overflow:auto"><code>pip install karst</code></pre>
    <p style="font-size:13px;line-height:1.6;color:#64748b;margin-top:20px">
      — the karst team
    </p>
  </div>`;
}

/** Welcome email to a brand-new waitlist signup. Returns true if actually sent. */
export async function sendSignupWelcome(to: string): Promise<boolean> {
  const t = transport();
  if (!t) return false;
  await t.sendMail({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: "You're on the karst waitlist",
    html: welcomeHtml(),
  });
  return true;
}

/** Optional internal ping so the owner knows someone signed up. */
export async function notifyOwnerOfSignup(signupEmail: string, source?: string | null): Promise<boolean> {
  const t = transport();
  if (!t || !OWNER_NOTIFY) return false;
  await t.sendMail({
    from: FROM,
    to: OWNER_NOTIFY,
    replyTo: signupEmail,
    subject: `New karst signup: ${signupEmail}`,
    text: `New waitlist signup\n\nemail: ${signupEmail}\nsource: ${source || 'unknown'}`,
  });
  return true;
}
