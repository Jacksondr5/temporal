import type { Metadata } from "next";
import {
  IBM_Plex_Sans_Condensed,
  Inter,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "../components/convex-provider";
import { Nav } from "../components/nav";
import { TooltipProvider } from "../components/ui/tooltip";

// All pages use real-time Convex subscriptions; skip static prerendering.
export const dynamic = "force-dynamic";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const ibmPlexCondensed = IBM_Plex_Sans_Condensed({
  variable: "--font-ibm-plex-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
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
      className={`${inter.variable} ${ibmPlexCondensed.variable} ${jetBrainsMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConvexClientProvider>
          <TooltipProvider>
            <Nav />
            <main className="w-full flex-1 px-6 py-8">{children}</main>
          </TooltipProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
