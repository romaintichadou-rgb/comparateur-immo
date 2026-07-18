import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, Geist_Mono, Outfit } from "next/font/google";
import Navbar from "@/components/Navbar";
import { RendementDetailProvider } from "@/components/RendementDetailProvider";
import { APP_NAME } from "@/lib/constants";
import "leaflet/dist/leaflet.css";
import "./globals.css";

// Titres H1/H2 (éditorial).
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "900"],
  style: ["normal", "italic"],
});

// Corps de texte.
const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Chiffres clés (score, prix, rendement, cash-flow) : monospace moderne, aux
// chiffres nets et alignés, remplace IBM Plex Mono jugé trop « machine à écrire ».
const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Wordmark « Immoscore » de la navbar uniquement — géométrique ronde (Outfit).
// Deux graisses seulement : regular pour "Immo", bold pour "score" (voir Navbar.tsx).
const outfit = Outfit({
  variable: "--font-wordmark",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Le score d'un investissement locatif, en un coup d'œil",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${fraunces.variable} ${plexSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ink-50 text-ink-900">
        <Navbar />
        {/* overflow-x-clip (et non -hidden) : empêche le débordement horizontal
            sans faire de <main> un conteneur de défilement — sinon `position:
            sticky` des descendants (colonne latérale du formulaire, carte de
            l'accueil) se calerait sur <main> qui ne défile pas, et ne
            fonctionnerait jamais. */}
        <main className="flex-1 overflow-x-clip">
          <RendementDetailProvider>{children}</RendementDetailProvider>
        </main>
      </body>
    </html>
  );
}
