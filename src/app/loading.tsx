export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      {/* En-tête : titre + tri + CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="h-8 w-48 animate-pulse rounded bg-ink-100" />
          <div className="mt-1.5 h-4 w-64 animate-pulse rounded bg-ink-100" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-10 w-28 animate-pulse rounded-md bg-ink-100" />
          <div className="h-10 w-36 animate-pulse rounded-md bg-ink-100" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Carte placeholder */}
        <div className="order-1 h-[420px] animate-pulse rounded-lg bg-ink-100 xl:order-2 xl:h-[600px]" />

        {/* Table skeleton */}
        <div className="order-2 space-y-3 xl:order-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-ink-100 bg-white p-4"
            >
              <div className="h-16 w-16 shrink-0 animate-pulse rounded-lg bg-ink-100" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-48 animate-pulse rounded bg-ink-100" />
                <div className="h-3 w-32 animate-pulse rounded bg-ink-100" />
                <div className="h-3 w-24 animate-pulse rounded bg-ink-100" />
              </div>
              <div className="hidden space-y-1.5 sm:block">
                <div className="h-6 w-20 animate-pulse rounded bg-ink-100" />
                <div className="h-3 w-16 animate-pulse rounded bg-ink-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
