import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { RendementDetailProvider } from "@/components/RendementDetailProvider";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Comparateur d'investissement locatif",
  description: "Comparer des appartements pour un investissement locatif",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">
                €
              </span>
              <span className="text-slate-900">Comparateur locatif</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/parametres"
                className="font-medium text-slate-500 transition hover:text-slate-700"
              >
                Paramètres
              </Link>
              <Link
                href="/appartements/nouveau"
                className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white transition hover:bg-indigo-700"
              >
                + Ajouter un bien
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">
          <RendementDetailProvider>{children}</RendementDetailProvider>
        </main>
      </body>
    </html>
  );
}
