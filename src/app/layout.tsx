import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import { RendementDetailProvider } from "@/components/RendementDetailProvider";
import { APP_NAME } from "@/lib/constants";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "900"],
  style: ["normal", "italic"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Voir clair, pas deviner — comparateur d'investissement locatif",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink-50 text-ink-900">
        <Navbar />
        <main className="flex-1 overflow-x-hidden">
          <RendementDetailProvider>{children}</RendementDetailProvider>
        </main>
      </body>
    </html>
  );
}
