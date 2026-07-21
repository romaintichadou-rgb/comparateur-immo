export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {/* Retour à la liste */}
      <div className="h-5 w-32 animate-pulse rounded bg-ink-100" />

      {/* En-tête compact : vignette · titre · carte */}
      <div className="flex items-center gap-4">
        <div className="h-28 w-28 shrink-0 animate-pulse rounded-xl bg-ink-100" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-48 animate-pulse rounded bg-ink-100" />
          <div className="h-4 w-64 max-w-full animate-pulse rounded bg-ink-100" />
          <div className="h-3 w-40 animate-pulse rounded bg-ink-100" />
        </div>
        <div className="hidden h-28 w-72 shrink-0 animate-pulse rounded-xl bg-ink-100 sm:block" />
      </div>

      {/* Onglets (5 tabs avec icônes) */}
      <div className="border-b border-ink-200">
        <nav className="flex gap-6">
          {[80, 100, 130, 150, 150].map((w, i) => (
            <div
              key={i}
              className="my-3 flex items-center gap-1.5"
            >
              <div className="h-4 w-4 animate-pulse rounded bg-ink-100" />
              <div className="h-4 animate-pulse rounded bg-ink-100" style={{ width: w / 2 }} />
            </div>
          ))}
        </nav>
      </div>

      {/* Contenu synthèse : verdict + metric cards */}
      <div className="h-36 animate-pulse rounded-xl border border-ink-200 bg-ink-100" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-ink-200 bg-ink-100" />
        ))}
      </div>
      <div className="h-14 animate-pulse rounded-xl border border-ink-200 bg-ink-100" />
    </div>
  );
}
