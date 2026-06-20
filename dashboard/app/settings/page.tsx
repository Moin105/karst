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
      <div
        style={{
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Account */}
        <Card>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Account
              </div>
              <div
                style={{
                  fontSize: 16,
                  color: 'var(--text)',
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                Signed in
              </div>
            </div>
            <form action="/api/auth/logout" method="POST">
              <Button variant="secondary" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
          <div
            style={{
              padding: 20,
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              rowGap: 12,
              columnGap: 24,
              alignItems: 'center',
            }}
          >
            <span
              style={{
                color: 'var(--text-dim)',
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Admin email
            </span>
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13,
                color: 'var(--text)',
              }}
            >
              {adminEmail}
            </span>

            <span
              style={{
                color: 'var(--text-dim)',
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Session started
            </span>
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13,
                color: 'var(--text)',
              }}
            >
              {formatDate(sessionMeta.createdAt ?? undefined)}
            </span>

            <span
              style={{
                color: 'var(--text-dim)',
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Cookie
            </span>
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13,
                color: 'var(--text-dim)',
              }}
            >
              karst_session (iron-session, 30d max-age)
            </span>
          </div>
        </Card>

        {/* Endpoints */}
        <Card>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-dim)',
              }}
            >
              Endpoints
            </div>
            <div
              style={{
                fontSize: 16,
                color: 'var(--text)',
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              Ingest URLs
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-dim)',
                marginTop: 6,
              }}
            >
              Point the karst CLI / MCP server at these to phone home.
            </div>
          </div>
          <div
            style={{
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {[
              { label: 'Signups', url: ingestSignups },
              { label: 'Installs', url: ingestInstalls },
              { label: 'Queries', url: ingestQueries },
              { label: 'Feedback', url: ingestFeedback },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  borderBottom: '1px dashed var(--border)',
                  paddingBottom: 10,
                }}
              >
                <Badge variant="default">{row.label}</Badge>
                <code
                  style={{
                    flex: 1,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 13,
                    color: 'var(--accent-2)',
                    background: 'var(--code-bg)',
                    border: '1px solid var(--border)',
                    padding: '6px 10px',
                    borderRadius: 6,
                    overflowX: 'auto',
                  }}
                >
                  {row.url}
                </code>
              </div>
            ))}

            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              CLI configuration
            </div>
            <pre
              style={{
                background: 'var(--code-bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 16,
                color: 'var(--text)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13,
                lineHeight: 1.6,
                overflowX: 'auto',
                margin: 0,
              }}
            >
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
        <Card>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-dim)',
              }}
            >
              Feature flags
            </div>
            <div
              style={{
                fontSize: 16,
                color: 'var(--text)',
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              Environment configuration
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-dim)',
                marginTop: 6,
              }}
            >
              Values are read from the process environment at boot. Restart the
              app after changing.
            </div>
          </div>
          <div style={{ padding: 0 }}>
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
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 13,
                          color: 'var(--text)',
                        }}
                      >
                        {f.key}
                      </span>
                    </TD>
                    <TD>
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 13,
                          color: f.set ? 'var(--accent-2)' : 'var(--text-dim)',
                        }}
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
                      <span
                        style={{
                          color: 'var(--text-dim)',
                          fontSize: 13,
                        }}
                      >
                        {f.description}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>

        {/* Danger zone */}
        <Card style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: '#f87171',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Danger zone
            </div>
            <div
              style={{
                fontSize: 16,
                color: 'var(--text)',
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              Rotate session secret
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-dim)',
                marginTop: 6,
              }}
            >
              Rotating <code style={{ color: 'var(--accent-2)' }}>KARST_SESSION_SECRET</code>{' '}
              invalidates every existing admin cookie. There is no in-app button
              for this on purpose — do it from a shell with envs you control.
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <pre
              style={{
                background: 'var(--code-bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 16,
                color: 'var(--text)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13,
                lineHeight: 1.6,
                overflowX: 'auto',
                margin: 0,
              }}
            >
{`# 1. Generate a fresh 32-byte secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Update your environment (e.g. .env.production or your secret manager)
export KARST_SESSION_SECRET="<paste>"

# 3. Restart the dashboard process; every admin will need to log in again.
pm2 restart karst-dashboard`}
            </pre>
          </div>
        </Card>
      </div>
    </>
  );
}
