export default function Loading() {
  return (
    <>
      {/* Barre du bien — skeleton de la barre sticky empilée */}
      <div className="sticky top-0 z-40 border-b border-ink-100/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 pt-2.5 sm:gap-3 sm:px-6">
          <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-ink-100" />
          <div className="hidden aspect-video w-10 shrink-0 animate-pulse rounded-md bg-ink-100 sm:block" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-4 w-64 max-w-full animate-pulse rounded bg-ink-100" />
            <div className="h-3 w-96 max-w-full animate-pulse rounded bg-ink-100" />
          </div>
          <div className="h-7 w-24 shrink-0 animate-pulse rounded-full bg-ink-100" />
        </div>
        <div className="mx-auto flex max-w-6xl gap-6 px-4 sm:px-6">
          {[80, 100, 60, 100, 100].map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 py-2.5">
              <div className="h-4 w-4 animate-pulse rounded bg-ink-100" />
              <div className="h-4 animate-pulse rounded bg-ink-100" style={{ width: w / 2 }} />
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {/* En-tête d'onglet : titre + sous-titre (cf. `TabHeader`) */}
        <div className="space-y-2">
          <div className="h-6 w-32 animate-pulse rounded bg-ink-100" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-ink-100" />
        </div>

        {/* Verdict */}
        <div className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-9">
          <div className="flex flex-col-reverse gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-3 w-16 animate-pulse rounded bg-ink-100" />
                <div className="h-4 w-28 animate-pulse rounded-full bg-ink-100" />
              </div>
              <div className="h-8 w-64 max-w-full animate-pulse rounded bg-ink-100 sm:h-10" />
              <div className="h-3.5 w-80 max-w-full animate-pulse rounded bg-ink-100" />
              <div className="h-3.5 w-60 max-w-full animate-pulse rounded bg-ink-100" />
            </div>
            <div className="shrink-0 space-y-1.5">
              <div className="h-12 w-20 animate-pulse rounded-lg bg-ink-100" />
              <div className="h-3 w-20 animate-pulse rounded bg-ink-100" />
            </div>
          </div>
          <div className="mt-7 flex flex-wrap items-baseline gap-x-4 gap-y-2 sm:gap-x-8">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-baseline gap-1.5">
                <div className="h-3 w-20 animate-pulse rounded bg-ink-100" />
                <div className="h-4 w-6 animate-pulse rounded bg-ink-100" />
              </div>
            ))}
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col rounded-xl border border-ink-100 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="h-3 w-24 animate-pulse rounded bg-ink-100" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-ink-100" />
              </div>
              <div className="mt-3 h-7 w-28 animate-pulse rounded bg-ink-100" />
              <div className="mt-2 h-3 w-full animate-pulse rounded bg-ink-100" />
              <div className="mt-auto pt-3 h-3 w-16 animate-pulse rounded bg-ink-100" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
