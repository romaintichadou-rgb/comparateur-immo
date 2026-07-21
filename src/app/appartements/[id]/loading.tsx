export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {/* Retour à la liste */}
      <div className="h-5 w-32 animate-pulse rounded bg-ink-100" />

      {/* En-tête compact : vignette · titre · carte */}
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-ink-100 sm:h-28 sm:w-28" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-48 animate-pulse rounded bg-ink-100" />
          <div className="h-4 w-64 max-w-full animate-pulse rounded bg-ink-100" />
          <div className="h-3 w-40 animate-pulse rounded bg-ink-100" />
        </div>
        <div className="hidden h-28 w-72 shrink-0 animate-pulse rounded-xl bg-ink-100 sm:block" />
      </div>

      {/* Onglets */}
      <div className="border-b border-ink-200">
        <nav className="flex gap-6">
          {[80, 100, 130, 150, 150].map((w, i) => (
            <div key={i} className="my-3 flex items-center gap-1.5">
              <div className="h-4 w-4 animate-pulse rounded bg-ink-100" />
              <div className="h-4 animate-pulse rounded bg-ink-100" style={{ width: w / 2 }} />
            </div>
          ))}
        </nav>
      </div>

      {/* Verdict */}
      <div className="rounded-2xl border border-ink-200 bg-white p-6 sm:p-9">
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
          <div key={i} className="flex flex-col rounded-xl border border-ink-200 bg-white p-4">
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
  );
}
