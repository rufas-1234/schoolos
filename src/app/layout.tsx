import type { Metadata } from "next";
import type { ReactNode } from "react";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`h-full antialiased ${bodyFont.variable} ${displayFont.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
