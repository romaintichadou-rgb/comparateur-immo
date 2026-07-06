"use client";

import dynamic from "next/dynamic";

// Contenu 100% dépendant de window.location : chargé sans SSR pour éviter
// tout mismatch d'hydratation (l'origine n'est connue que côté client).
const BookmarkletView = dynamic(() => import("@/components/BookmarkletView"), {
  ssr: false,
});

export default function BookmarkletPage() {
  return <BookmarkletView />;
}
