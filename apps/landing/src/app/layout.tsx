import { ThemeProvider } from "@automator/ui/theme-provider";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://automator.ardasari.co"),
  title: "Automator — see what your onchain automation will do",
  description:
    "Automator is a canvas for onchain workflows: draw a flow or describe it, rehearse it without spending anything, then read every run node by node.",
  openGraph: {
    type: "website",
    url: "https://automator.ardasari.co",
    siteName: "Automator",
    title: "Automator — see what your onchain automation will do",
    description:
      "Draw a flow or describe it, rehearse it without spending anything, then read every run node by node.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
