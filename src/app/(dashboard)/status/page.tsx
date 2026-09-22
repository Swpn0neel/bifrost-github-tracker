import { CalendarClock, Camera, CircleAlert, CircleCheck, CircleX, History, KeyRound, LoaderCircle, ScrollText } from "lucide-react";
import { Card } from "@/components/Card";
import { DataTable } from "@/components/DataTable";
import { Hint } from "@/components/Hint";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { env } from "@/lib/env";
import { formatInt } from "@/lib/format";
import { repoSnapshotCount } from "@/lib/compare";
import { collectorRuns, latestSnapshot, syncState, tableCounts } from "@/lib/queries";
import { nextRun } from "@/lib/schedule";
import { formatIstDateTime, formatRelative } from "@/lib/time";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") {
    return (
      <Badge variant="secondary" className="bg-good/10 text-good">
        <CircleCheck aria-hidden />
        {status}
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive">
        <CircleX aria-hidden />
        {status}
      </Badge>
    );
  }
  if (status === "partial") {
    return (
      <Badge variant="outline">
        <CircleAlert aria-hidden />
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      <LoaderCircle aria-hidden />
      {status}
    </Badge>
  );
}

export default async function StatusPage() {
  const [runs, latest, counts, state, compareSnapshots] = await Promise.all([collectorRuns(40), latestSnapshot(), tableCounts(), syncState(), repoSnapshotCount()]);
  const lastRun = runs[0];
  const hasToken = Boolean(env.githubToken);
  const failures = runs.filter((r) => r.status === "error").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Collector status" description="Runs at 12 AM, 6 AM, 12 PM and 6 PM IST. Each run snapshots the headline numbers and pulls new events." />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile
          icon={<History />}
          label="Last run"
          valueText={lastRun ? lastRun.status : "never"}
          value={null}
          hint={lastRun ? `${formatRelative(lastRun.started_at)} · ${lastRun.kind} (${lastRun.triggered_by})` : "No collector run recorded"}
        />
        <StatTile icon={<CalendarClock />} label="Next scheduled run" valueText={formatIstDateTime(nextRun()).replace(/^.*?, /, "")} value={null} hint={formatIstDateTime(nextRun())} />
        <StatTile icon={<Camera />} label="Snapshots stored" value={counts.snapshots} hint={latest ? `Latest ${formatIstDateTime(latest.captured_at)}` : undefined} />
        <StatTile icon={<KeyRound />} label="GitHub token" valueText={hasToken ? "configured" : "missing"} value={null} hint={hasToken ? "5,000 requests/hour" : "60 requests/hour; backfill disabled"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Event tables" subtitle="Rows loaded by backfill and incremental sync">
          <DataTable
            rows={[
              { k: "Stargazers (active)", v: counts.stargazers },
              { k: "Forks", v: counts.forks },
              { k: "Issues", v: counts.issues },
              { k: "Pull requests", v: counts.prs },
              { k: "Commits", v: counts.commits },
              { k: "Releases", v: counts.releases },
              { k: "Compare readings (other repos)", v: compareSnapshots },
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
              { key: "key", label: "Key", render: (r) => <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{r.key}</code> },
              { key: "value", label: "Value", render: (r) => <span className="font-mono text-xs break-all">{r.value}</span> },
              {
                key: "updated_at",
                label: "Updated",
                className: "whitespace-nowrap text-muted-foreground",
                render: (r) => (
                  <Hint text={formatIstDateTime(r.updated_at)}>
                    <span>{formatRelative(r.updated_at)}</span>
                  </Hint>
                ),
              },
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
            { key: "id", label: "#", className: "text-muted-foreground tnum", render: (r) => r.id },
            { key: "started_at", label: "Started (IST)", className: "whitespace-nowrap", render: (r) => formatIstDateTime(r.started_at) },
            { key: "kind", label: "Kind", className: "whitespace-nowrap", render: (r) => `${r.kind} · ${r.triggered_by}` },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
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
                  <div className="flex items-center gap-2">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="xs" className="-ml-2 text-muted-foreground">
                          <ScrollText aria-hidden />
                          show
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-2xl">
                        <SheetHeader className="border-b">
                          <SheetTitle className="flex items-center gap-2">
                            Run #{r.id} <StatusBadge status={r.status} />
                          </SheetTitle>
                          <SheetDescription>
                            {formatIstDateTime(r.started_at)} · {r.kind} · {r.triggered_by} · {formatInt(r.api_calls)} API calls
                          </SheetDescription>
                        </SheetHeader>
                        <div className="flex-1 space-y-3 overflow-auto p-4">
                          {r.error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs break-words text-destructive">{r.error}</p>}
                          <pre className="overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                            {JSON.stringify(rest, null, 2)}
                            {log.length ? `\n\n${log.join("\n")}` : ""}
                          </pre>
                        </div>
                      </SheetContent>
                    </Sheet>
                    {r.error && <span className="line-clamp-1 text-bad">{r.error.slice(0, 80)}</span>}
                  </div>
                );
              },
            },
          ]}
        />
      </Card>
    </div>
  );
}
