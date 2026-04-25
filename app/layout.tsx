import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/convex-provider";
import { SiteNav } from "@/components/site-nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenFire — The Claw",
  description: "An AI agent that autonomously fires employees via email.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-black text-zinc-100 selection:bg-orange-500/30">
        <ConvexClientProvider>
          <div className="ember-bg pointer-events-none fixed inset-0 -z-10" aria-hidden />
          <SiteNav />
          <main className="flex-1 mx-auto max-w-6xl w-full px-6 py-8">
            {children}
          </main>
          <footer className="border-t border-zinc-900/70 py-4 text-center text-xs text-zinc-600">
            OpenFire · Built for the hackathon · The Claw never sleeps
          </footer>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
