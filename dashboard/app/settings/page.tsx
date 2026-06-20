import { headers } from 'next/headers';
import { requireAdmin, getSessionOptions } from '@/lib/auth';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';

export const dynamic = 'force-dynamic';

type FullSession = {
  userId?: string;
  email?: string;
  createdAt?: number;
};

function formatDate(ts?: number): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '—';
  }
}

async function getCurrentSessionMeta(): Promise<{
  email: string | null;
  createdAt: number | null;
}> {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<FullSession>(
      cookieStore,
      getSessionOptions(),
    );
    return {
      email: session?.email ?? null,
      createdAt: session?.createdAt ?? null,
    };
  } catch {
    return { email: null, createdAt: null };
  }
}

async function deriveBaseUrl(): Promise<string> {
  const h = await headers();
  const proto =
    h.get('x-forwarded-proto') ??
    (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host =
    h.get('x-forwarded-host') ??
    h.get('host') ??
    process.env.KARST_PUBLIC_HOST ??
    'localhost:3000';
  return `${proto}://${host}`;
}

const FLAG_KEYS: { key: string; defaultValue: string; description: string }[] = [
  {
    key: 'SHOW_REVENUE',
    defaultValue: 'false',
    description: 'Reveal revenue widgets on the Overview page',
  },
  {
    key: 'MCP_PUBLIC_REGISTRY_URL',
    defaultValue: 'https://github.com/modelcontextprotocol/servers',
    description: 'Upstream registry for MCP server packs',
  },
  {
    key: 'KARST_INGEST_URL',
    defaultValue: '(derived from host)',
    description: 'Public URL the CLI posts telemetry/feedback to',
  },
  {
    key: 'KARST_DATABASE_PATH',
    defaultValue: './karst.db',
    description: 'SQLite database path on the server',
  },
  {
    key: 'KARST_ADMIN_EMAIL',
    defaultValue: '(unset)',
    description: 'Admin email allowed to log in',
  },
];

const SECTION_LABEL = 'text-[11px] uppercase tracking-wide text-text-dim';
const SECTION_TITLE = 'text-sm font-semibold text-text-base mt-0.5';
const CODE_BLOCK =
  'bg-code-bg rounded-lg border border-border p-4 text-[13px] font-mono leading-relaxed overflow-x-auto m-0 whitespace-pre';

export default async function SettingsPage() {
  await requireAdmin();

  const baseUrl = await deriveBaseUrl();
  const sessionMeta = await getCurrentSessionMeta();
  const adminEmail =
    process.env.KARST_ADMIN_EMAIL ?? sessionMeta.email ?? 'unset';

  const ingestSignups = `${baseUrl}/api/ingest/signups`;
  const ingestInstalls = `${baseUrl}/api/ingest/installs`;
  const ingestQueries = `${baseUrl}/api/ingest/queries`;
  const ingestFeedback = `${baseUrl}/api/ingest/feedback`;

  const flagRows = FLAG_KEYS.map((f) => ({
    key: f.key,
    value: process.env[f.key] ?? f.defaultValue,
    description: f.description,
    set: typeof process.env[f.key] === 'string' && process.env[f.key] !== '',
  }));

  return (
    <>
      <Topbar title="Settings" />
      <main className="p-6 space-y-4">
        {/* Account */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border p-3">
            <div>
              <div className={SECTION_LABEL}>Account</div>
              <div className={SECTION_TITLE}>Signed in</div>
            </div>
            <form action="/api/auth/logout" method="POST">
              <Button variant="secondary" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
          <div className="grid grid-cols-[max-content_1fr] items-center gap-x-6 gap-y-3 p-4">
            <span className="text-[11px] uppercase tracking-wide text-text-dim">
              Admin email
            </span>
            <span className="font-mono text-[13px] text-text-base">
              {adminEmail}
            </span>

            <span className="text-[11px] uppercase tracking-wide text-text-dim">
              Session started
            </span>
            <span className="font-mono text-[13px] text-text-base tabular-nums">
              {formatDate(sessionMeta.createdAt ?? undefined)}
            </span>

            <span className="text-[11px] uppercase tracking-wide text-text-dim">
              Cookie
            </span>
            <span className="font-mono text-[13px] text-text-dim">
              karst_session (iron-session, 30d max-age)
            </span>
          </div>
        </Card>

        {/* Endpoints */}
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-border p-3">
            <div className={SECTION_LABEL}>Endpoints</div>
            <div className={SECTION_TITLE}>Ingest URLs</div>
            <div className="text-[13px] text-text-dim mt-1">
              Point the karst CLI / MCP server at these to phone home.
            </div>
          </div>
          <div className="flex flex-col gap-3 p-4">
            {[
              { label: 'Signups', url: ingestSignups },
              { label: 'Installs', url: ingestInstalls },
              { label: 'Queries', url: ingestQueries },
              { label: 'Feedback', url: ingestFeedback },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center gap-3 border-b border-dashed border-border pb-2.5"
              >
                <Badge variant="default">{row.label}</Badge>
                <code className="flex-1 bg-code-bg rounded-md border border-border px-2.5 py-1.5 font-mono text-[13px] text-accent-2 overflow-x-auto">
                  {row.url}
                </code>
              </div>
            ))}

            <div className="mt-2 text-[11px] uppercase tracking-wide text-text-dim">
              CLI configuration
            </div>
            <pre className={CODE_BLOCK}>
{`# Point the karst CLI at this instance
export KARST_INGEST_URL="${baseUrl}"

# Optional: per-stream overrides
export KARST_INGEST_INSTALLS_URL="${ingestInstalls}"
export KARST_INGEST_QUERIES_URL="${ingestQueries}"
export KARST_INGEST_FEEDBACK_URL="${ingestFeedback}"

# Verify
karst doctor --check ingest`}
            </pre>
          </div>
        </Card>

        {/* Feature flags */}
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-border p-3">
            <div className={SECTION_LABEL}>Feature flags</div>
            <div className={SECTION_TITLE}>Environment configuration</div>
            <div className="text-[13px] text-text-dim mt-1">
              Values are read from the process environment at boot. Restart the
              app after changing.
            </div>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Key</TH>
                <TH>Value</TH>
                <TH>Source</TH>
                <TH>Description</TH>
              </TR>
            </THead>
            <TBody>
              {flagRows.map((f) => (
                <TR key={f.key}>
                  <TD>
                    <span className="font-mono text-[13px] text-text-base">
                      {f.key}
                    </span>
                  </TD>
                  <TD>
                    <span
                      className={`font-mono text-[13px] ${
                        f.set ? 'text-accent-2' : 'text-text-dim'
                      }`}
                    >
                      {f.value}
                    </span>
                  </TD>
                  <TD>
                    {f.set ? (
                      <Badge variant="success">env</Badge>
                    ) : (
                      <Badge variant="default">default</Badge>
                    )}
                  </TD>
                  <TD>
                    <span className="text-[13px] text-text-dim">
                      {f.description}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        {/* Danger zone */}
        <Card className="p-0 overflow-hidden" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
          <div className="border-b border-border p-3">
            <div className="text-[11px] uppercase tracking-wide text-red-400">
              Danger zone
            </div>
            <div className={SECTION_TITLE}>Rotate session secret</div>
            <div className="text-[13px] text-text-dim mt-1">
              Rotating{' '}
              <code className="text-accent-2">KARST_SESSION_SECRET</code>{' '}
              invalidates every existing admin cookie. There is no in-app button
              for this on purpose — do it from a shell with envs you control.
            </div>
          </div>
          <div className="p-4">
            <pre className={CODE_BLOCK}>
{`# 1. Generate a fresh 32-byte secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Update your environment (e.g. .env.production or your secret manager)
export KARST_SESSION_SECRET="<paste>"

# 3. Restart the dashboard process; every admin will need to log in again.
pm2 restart karst-dashboard`}
            </pre>
          </div>
        </Card>
      </main>
    </>
  );
}
