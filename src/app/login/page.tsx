import type { SearchParams } from "@/lib/range";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const error = sp.error !== undefined;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <form action="/api/login" method="post" className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6">
        <div>
          <h1 className="text-base font-semibold text-ink">Bifrost · GitHub tracker</h1>
          <p className="mt-1 text-xs text-ink-2">Enter the shared dashboard password.</p>
        </div>
        <input type="hidden" name="next" value={next} />
        <label className="block text-xs text-ink-2">
          Password
          <input
            type="password"
            name="password"
            autoFocus
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded border border-line bg-page px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        {error && <p className="text-xs text-bad">That password didn&apos;t match.</p>}
        <button type="submit" className="w-full rounded bg-ink px-3 py-2 text-sm font-medium text-page hover:opacity-90">
          Sign in
        </button>
      </form>
    </main>
  );
}
