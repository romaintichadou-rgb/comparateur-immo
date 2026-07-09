export default function SetupNotice({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-lg font-semibold text-amber-900">
          Configuration de la base de données requise
        </h1>
        <p className="mt-2 text-sm text-amber-800">
          L&apos;application ne peut pas encore accéder à ta base Supabase.
        </p>
        <pre className="mt-3 whitespace-pre-wrap rounded-md bg-white/60 p-3 text-xs text-amber-900">
          {message}
        </pre>
        <p className="mt-4 text-sm text-amber-800">
          Suis les instructions du <code className="rounded bg-white/60 px-1">README.md</code> à
          la racine du projet pour créer les tables Supabase et remplir{" "}
          <code className="rounded bg-white/60 px-1">.env.local</code>, puis redémarre le
          serveur (<code className="rounded bg-white/60 px-1">npm run dev</code>).
        </p>
      </div>
    </div>
  );
}
