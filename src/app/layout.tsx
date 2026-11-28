import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "SchoolOS | School management",
  description: "A secure school management workspace.",
  icons: {
    icon: [
      { url: "/schoolos-favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/schoolos-apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7027b8",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full antialiased ${bodyFont.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <Script src="/schoolos-theme-init.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
