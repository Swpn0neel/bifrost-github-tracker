import { RefreshButton } from "@/components/RefreshButton";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { PageCrumb } from "./PageCrumb";
import { SnapshotStatus } from "./SnapshotStatus";
import { ThemeToggle } from "./ThemeToggle";

interface SiteHeaderProps {
  repo: string;
  updated: string;
  updatedTitle: string;
  next: string;
}

export function SiteHeader({ repo, updated, updatedTitle, next }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md md:rounded-t-xl lg:px-6">
      <SidebarTrigger className="-ml-1.5" />
      <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
      <PageCrumb repo={repo} />
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <SnapshotStatus updated={updated} updatedTitle={updatedTitle} next={next} className="hidden sm:inline-flex" />
        <RefreshButton />
        <ThemeToggle />
      </div>
    </header>
  );
}
