import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bifrost GitHub tracker",
  description: "Stars, forks, issues, PRs and activity for maximhq/bifrost, captured four times a day.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
