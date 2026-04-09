import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "../components/convex-provider";
import { Nav } from "../components/nav";
import { TooltipProvider } from "../components/ui/tooltip";

// All pages use real-time Convex subscriptions; skip static prerendering.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PR Review Operator Dashboard",
  description:
    "Operational visibility into the AI-driven PR review orchestration system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col dot-grid">
        <ConvexClientProvider>
          <TooltipProvider>
            <Nav />
            <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
              {children}
            </main>
          </TooltipProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
