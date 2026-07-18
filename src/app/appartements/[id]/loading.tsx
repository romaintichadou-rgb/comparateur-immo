/**
 * Squelette affiché instantanément par Next.js pendant que la page de détail
 * charge ses données serveur (Supabase). Sans lui, un clic sur un bien depuis
 * la liste laissait l'écran figé le temps de l'aller-retour serveur, donnant
 * l'impression que rien ne se passait. La structure reprend celle de
 * ApartmentDetail (retour, en-tête photo + carte, bandeau méta, onglets).
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="h-5 w-32 animate-pulse rounded bg-ink-100" />

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="h-56 min-w-0 flex-1 animate-pulse rounded-xl border border-ink-200 bg-ink-100 sm:h-72" />
          <div className="h-56 w-full shrink-0 animate-pulse rounded-xl border border-ink-200 bg-ink-100 sm:h-72 sm:w-72" />
        </div>
        <div className="h-11 w-full animate-pulse rounded-xl border border-ink-200 bg-ink-100" />
      </div>

      <div className="border-b border-ink-200">
        <nav className="flex gap-6">
          {[140, 220, 170, 180].map((w, i) => (
            <div
              key={i}
              className="my-3 h-4 animate-pulse rounded bg-ink-100"
              style={{ width: w / 2 }}
            />
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-ink-200 bg-ink-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-ink-200 bg-ink-100" />
    </div>
  );
}
