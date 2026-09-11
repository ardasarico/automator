import { ThemeProvider } from "@automator/ui/theme-provider";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { runtimeDescription, runtimeImage, runtimeTitle } from "./meta";

export const metadata: Metadata = {
  metadataBase: new URL("https://run.automator.ardasari.co"),
  title: runtimeTitle,
  description: runtimeDescription,
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
  openGraph: {
    type: "website",
    siteName: "Automator",
    title: runtimeTitle,
    description: runtimeDescription,
    images: [runtimeImage],
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
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
