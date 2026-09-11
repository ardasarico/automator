import { ThemeProvider } from "@automator/ui/theme-provider";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AgentationToolbar } from "../components/agentation-toolbar";
import "./globals.css";

const title = "Automator — build, simulate, and run onchain workflows";
const description =
  "A visual canvas for onchain workflows. Draw a flow or describe it, rehearse it on a fork without spending anything, then read every run node by node.";

export const metadata: Metadata = {
  metadataBase: new URL("https://automator.ardasari.co"),
  title,
  description,
  alternates: { canonical: "/" },
  manifest: "/meta/site.webmanifest",
  icons: {
    icon: [
      { url: "/meta/favicon.ico" },
      { url: "/meta/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/meta/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/meta/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Automator",
    title,
    description,
    images: [{ url: "/meta/og.png", width: 1200, height: 630, alt: "Automator" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ardasarico",
    creator: "@ardasarico",
    title,
    description,
    images: ["/meta/og.png"],
  },
};

/* The page's `--background` in each scheme, so the browser chrome does not band against it. */
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
          {children}
          <AgentationToolbar />
        </ThemeProvider>
      </body>
    </html>
  );
}
