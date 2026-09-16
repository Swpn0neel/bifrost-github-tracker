import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { StatTile } from "@/components/StatTile";
import { env } from "@/lib/env";
import { formatInt } from "@/lib/format";
import { collectorRuns, latestSnapshot, syncState, tableCounts } from "@/lib/queries";
import { nextRun } from "@/lib/schedule";
import { formatIstDateTime, formatRelative } from "@/lib/time";

export const dynamic = "force-dynamic";

function statusClass(status: string): string {
  if (status === "ok") return "text-good";
  if (status === "error") return "text-bad";
  if (status === "partial") return "text-ink";
  return "text-ink-2";
}

export default async function StatusPage() {
  const [runs, latest, counts, state] = await Promise.all([collectorRuns(40), latestSnapshot(), tableCounts(), syncState()]);
  const lastRun = runs[0];
  const hasToken = Boolean(env.githubToken);
  const failures = runs.filter((r) => r.status === "error").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Collector status</h1>
        <p className="text-xs text-ink-2">Runs at 12 AM, 6 AM, 12 PM and 6 PM IST. Each run snapshots the headline numbers and pulls new events.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Last run"
          valueText={lastRun ? lastRun.status : "never"}
          value={null}
          hint={lastRun ? `${formatRelative(lastRun.started_at)} · ${lastRun.kind} (${lastRun.triggered_by})` : "No collector run recorded"}
        />
        <StatTile label="Next scheduled run" valueText={formatIstDateTime(nextRun()).replace(/^.*?, /, "")} value={null} hint={formatIstDateTime(nextRun())} />
        <StatTile label="Snapshots stored" value={counts.snapshots} hint={latest ? `Latest ${formatIstDateTime(latest.captured_at)}` : undefined} />
        <StatTile label="GitHub token" valueText={hasToken ? "configured" : "missing"} value={null} hint={hasToken ? "5,000 requests/hour" : "60 requests/hour; backfill disabled"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Event tables" subtitle="Rows loaded by backfill and incremental sync">
          <DataTable
            rows={[
              { k: "Stargazers (active)", v: counts.stargazers },
              { k: "Forks", v: counts.forks },
              { k: "Issues", v: counts.issues },
              { k: "Pull requests", v: counts.prs },
              { k: "Commits", v: counts.commits },
              { k: "Releases", v: counts.releases },
            ]}
            rowKey={(r) => r.k}
            dense
            columns={[
              { key: "k", label: "Table", render: (r) => r.k },
              { key: "v", label: "Rows", align: "right", render: (r) => formatInt(r.v) },
            ]}
          />
        </Card>
        <Card title="Sync cursors" subtitle="Where incremental sync resumes from">
          <DataTable
            rows={state}
            rowKey={(r) => r.key}
            dense
            emptyText="No sync has run yet"
            columns={[
              { key: "key", label: "Key", render: (r) => <code className="text-xs">{r.key}</code> },
              { key: "value", label: "Value", render: (r) => <span className="font-mono text-xs">{r.value}</span> },
              { key: "updated_at", label: "Updated", render: (r) => formatRelative(r.updated_at) },
            ]}
          />
        </Card>
      </div>

      <Card title="Recent runs" subtitle={`${runs.length} most recent · ${failures} failed`}>
        <DataTable
          rows={runs}
          rowKey={(r) => r.id}
          dense
          emptyText="No runs yet"
          columns={[
            { key: "id", label: "#", render: (r) => r.id },
            { key: "started_at", label: "Started (IST)", render: (r) => formatIstDateTime(r.started_at) },
            { key: "kind", label: "Kind", render: (r) => `${r.kind} · ${r.triggered_by}` },
            { key: "status", label: "Status", render: (r) => <span className={`font-medium ${statusClass(r.status)}`}>{r.status}</span> },
            {
              key: "duration",
              label: "Duration",
              align: "right",
              render: (r) => (r.finished_at ? `${Math.round((r.finished_at.getTime() - r.started_at.getTime()) / 1000)} s` : "—"),
            },
            { key: "api_calls", label: "API calls", align: "right", render: (r) => formatInt(r.api_calls) },
            {
              key: "detail",
              label: "Detail",
              render: (r) => {
                const detail = r.detail ?? {};
                const log = Array.isArray(detail.log) ? (detail.log as string[]) : [];
                const rest = Object.fromEntries(Object.entries(detail).filter(([k]) => k !== "log"));
                return (
                  <details>
                    <summary className="cursor-pointer text-ink-2">{r.error ? <span className="text-bad">{r.error.slice(0, 80)}</span> : "show"}</summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-grid p-2 font-mono text-[11px] leading-snug text-ink">
                      {JSON.stringify(rest, null, 2)}
                      {log.length ? `\n\n${log.join("\n")}` : ""}
                    </pre>
                  </details>
                );
              },
            },
          ]}
        />
      </Card>
    </div>
  );
}
