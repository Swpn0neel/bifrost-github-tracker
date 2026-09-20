import { CircleAlert, LockKeyhole, Rainbow } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SearchParams } from "@/lib/range";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const error = sp.error !== undefined;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-sidebar px-4 py-12">
      {/* Faint grid that fades out from the top, purely decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] mask-[radial-gradient(ellipse_at_top,black,transparent_70%)] bg-size-[44px_44px]"
      />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Rainbow className="size-5" />
          </span>
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">Bifrost · GitHub tracker</h1>
            <p className="mt-1 text-sm text-muted-foreground">Stars, forks, issues and activity, four times a day.</p>
          </div>
        </div>
        <Card className="shadow-sm [--card-spacing:--spacing(6)]">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter the shared dashboard password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/api/login" method="post" className="space-y-4">
              <input type="hidden" name="next" value={next} />
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" name="password" autoFocus autoComplete="current-password" required aria-invalid={error || undefined} className="h-9" />
              </div>
              {error && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertDescription>That password didn&apos;t match.</AlertDescription>
                </Alert>
              )}
              <Button type="submit" size="lg" className="w-full">
                <LockKeyhole aria-hidden />
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
