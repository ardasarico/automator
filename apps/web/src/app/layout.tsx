import { ThemeProvider } from "@automator/ui/theme-provider";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AgentationToolbar } from "../components/agentation-toolbar";
import { AuthProvider } from "../auth/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Automator",
  manifest: "/meta/site.webmanifest",
  icons: {
    icon: [
      { url: "/meta/favicon.ico" },
      { url: "/meta/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/meta/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: {
      url: "/meta/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
};

/* Matches `--background` (neutral-50) in each scheme so the browser chrome does not band
 * against the page. The theme class can override the scheme, but a media query is all a
 * `theme-color` meta tag can read. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e0f" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
          <AgentationToolbar />
        </ThemeProvider>
      </body>
    </html>
  );
}
