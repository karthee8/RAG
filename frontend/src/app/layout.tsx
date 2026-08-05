import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/common/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AetherRAG - AI RAG Platform",
  description: "Enterprise Retrieval-Augmented Generation (RAG) platform with document grounding.",
};

import { DynamicBackground } from '@/components/dynamic-background';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-transparent text-foreground relative">
        <DynamicBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
