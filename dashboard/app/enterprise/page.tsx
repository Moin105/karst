import { requireAdmin } from '@/lib/auth';
import Topbar from '@/components/Topbar';
import Card from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

const COMMANDS: [string, string][] = [
  ['Issue a team API key', 'python -m enterprise.gateway.cli keys add --team acme --label "CI bot"'],
  ['Publish a shared pack', "python -m enterprise.gateway.cli packs publish --team acme --name auth --glob 'src/auth/**'"],
  ['Run the org gateway', 'python -m enterprise.gateway.cli serve --host 0.0.0.0 --port 8080'],
  ['See team usage', 'python -m enterprise.gateway.cli usage --team acme'],
];

function Stat({ label, hint }: { label: string; hint: string }) {
  return (
    <Card className="p-5">
      <div className="text-[11px] uppercase tracking-wide text-text-dim">{label}</div>
      <div className="mt-2 text-3xl font-bold tabular-nums text-text-base">—</div>
      <div className="mt-1 text-[12px] text-text-dim">{hint}</div>
    </Card>
  );
}

export default async function EnterprisePage() {
  await requireAdmin();

  return (
    <>
      <Topbar title="Enterprise" />
      <main className="space-y-6 p-6">
        <p className="max-w-2xl text-sm leading-relaxed text-text-dim">
          The enterprise <span className="text-text-base">gateway</span> turns karst into a team
          platform: one authenticated MCP endpoint the whole org points its AI tools at — with
          per-team <span className="text-text-base">API keys</span>, usage metering + audit, and
          shared <span className="text-text-base">pack libraries</span> (curate a pack once, the
          whole team pulls it).
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Teams" hint="connect the gateway DB" />
          <Stat label="Active API keys" hint="issued via the gateway" />
          <Stat label="Calls (30d)" hint="metered usage" />
        </div>

        <Card className="p-0">
          <div className="border-b border-border p-4 text-[11px] uppercase tracking-wide text-text-dim">
            Manage the gateway (CLI)
          </div>
          <div className="divide-y divide-border">
            {COMMANDS.map(([label, cmd]) => (
              <div key={label} className="p-4">
                <div className="mb-1.5 text-[13px] text-text-base">{label}</div>
                <pre className="overflow-x-auto rounded-lg border border-border bg-[#0f172a] p-3 font-mono text-[12px] text-slate-200">{cmd}</pre>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="p-5">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-dim">
              Live management — next step
            </h2>
            <p className="text-sm leading-relaxed text-text-dim">
              Issuing keys, browsing usage, and curating team packs from this panel lands once the
              gateway shares this dashboard&apos;s database. Until then, run the CLI above — state
              lives in the gateway&apos;s own store.
            </p>
          </div>
        </Card>
      </main>
    </>
  );
}
