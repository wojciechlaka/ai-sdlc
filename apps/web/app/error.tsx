'use client'

/** Fallback for unexpected errors with a retry; a client component because Next.js passes `reset`. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-6 space-y-3">
      <p className="text-sm text-red-600">Etwas ist schiefgelaufen. Bitte erneut versuchen.</p>
      {error.digest && <p className="text-xs text-slate-400">Fehler-ID: {error.digest}</p>}
      <button onClick={reset} className="btn-ghost-xs">
        Erneut versuchen
      </button>
    </div>
  )
}
