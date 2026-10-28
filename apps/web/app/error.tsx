'use client'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-6 space-y-3">
      <p className="text-sm text-red-600">Etwas ist schiefgelaufen: {error.message}</p>
      <button onClick={reset} className="btn-ghost-xs">
        Erneut versuchen
      </button>
    </div>
  )
}
