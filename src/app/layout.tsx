import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Inter, Open_Sans } from "next/font/google";
import "./globals.css";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Open_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "SchoolOS | School management",
  description: "A secure school management workspace.",
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
      className={`h-full antialiased ${bodyFont.variable} ${displayFont.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <Script id="schoolos-theme-init" strategy="beforeInteractive">
          {`try {
  if (window.localStorage.getItem("schoolos-theme") === "dark") {
    document.documentElement.classList.add("dark");
  }
} catch (error) {
  console.error("Could not load the saved theme preference.", error);
}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
