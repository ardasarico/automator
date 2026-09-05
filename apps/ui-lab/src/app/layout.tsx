import { ThemeProvider } from "@automator/ui/theme-provider";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LabShell } from "../components/lab-shell";
import { AgentationToolbar } from "../components/agentation-toolbar";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "UI Lab · Automator", template: "%s · UI Lab" },
  description: "Automator's internal component workshop.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <LabShell>{children}</LabShell>
          <AgentationToolbar />
        </ThemeProvider>
      </body>
    </html>
  );
}
