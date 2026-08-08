export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <div className="h-8 w-40 animate-pulse rounded bg-ink-100" />
      <div className="space-y-4 rounded-xl border border-ink-100 bg-white p-5">
        <div className="h-5 w-24 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-56 animate-pulse rounded bg-ink-100" />
        <div className="h-10 w-full animate-pulse rounded-md bg-ink-100" />
      </div>
      <div className="space-y-4 rounded-xl border border-ink-100 bg-white p-5">
        <div className="h-5 w-32 animate-pulse rounded bg-ink-100" />
        <div className="h-10 w-full animate-pulse rounded-md bg-ink-100" />
      </div>
    </div>
  );
}
