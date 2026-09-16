import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { authClient } from '~/lib/auth-client'

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: 'Sign in · Hoardcore' }] }),
  component: LoginPage,
})

function LoginPage() {
  const session = authClient.useSession()
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setError(null)
    const result = await authClient.signIn.social({ provider: 'oidc', callbackURL: '/sources' })
    if (result.error) setError(result.error.message ?? 'Sign-in could not be started')
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16" id="main-content">
      <div className="rounded-xl border border-border bg-card p-7 shadow-sm">
        <p className="text-sm font-medium text-primary">Operator access</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Sign in</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          Continue with the identity provider configured by this Hoardcore installation.
        </p>
        {session.data ? (
          <Button className="mt-7 w-full" type="button" onClick={() => void authClient.signOut()}>
            Sign out
          </Button>
        ) : (
          <Button className="mt-7 w-full" type="button" onClick={() => void signIn()}>
            Continue with configured identity provider
          </Button>
        )}
        {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
        <Link className="mt-6 inline-block text-sm text-muted-foreground hover:text-foreground" to="/">
          Return home
        </Link>
      </div>
    </main>
  )
}
