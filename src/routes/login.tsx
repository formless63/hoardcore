import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { CoolMode } from '~/components/magicui/cool-mode'
import { GlyphMatrix } from '~/components/magicui/glyph-matrix'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { ThemeModeToggle } from '~/components/themes/theme-mode-toggle'
import { authClient } from '~/lib/auth-client'
import { getPublicLoginConfig } from '~/server/auth-public.functions'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ error: z.string().optional() }),
  loader: () => getPublicLoginConfig(),
  head: () => ({ meta: [{ title: 'Sign in · Hoardcore' }] }),
  component: LoginPage,
})

function LoginPage() {
  const config = Route.useLoaderData()
  const search = Route.useSearch()
  const session = authClient.useSession()
  const [alternate, setAlternate] = useState(false)
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signInWithOidc() {
    setError(null)
    setPending(true)
    try {
      const result = await authClient.signIn.social({ provider: 'oidc', callbackURL: '/sources' })
      if (result.error) setError('Unable to start sign-in. Please try again.')
    } catch {
      setError('Unable to start sign-in. Please try again.')
    } finally {
      setPending(false)
    }
  }

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const result = await authClient.signIn.magicLink({
        email: email.trim().toLowerCase(),
        callbackURL: '/sources',
        errorCallbackURL: '/login',
      })
      if (result.error) setError('Unable to request a link right now. Please try again.')
      else setSent(true)
    } catch {
      setError('Unable to request a link right now. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10" id="main-content">
      <GlyphMatrix className="absolute inset-0 -z-20" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/30 via-background/70 to-background" />
      <section className="w-full max-w-[430px] rounded-2xl border border-border bg-card/95 p-6 shadow-2xl shadow-foreground/10 backdrop-blur-md sm:p-8" aria-labelledby="login-heading">
        <div className="mb-7 flex items-center justify-between gap-3">
          <span className="font-semibold tracking-tight text-foreground">hoardcore</span>
          <ThemeModeToggle />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground" id="login-heading">Sign in</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {alternate ? 'Use the email on your existing account.' : 'Continue with your identity provider.'}
        </p>

        {session.data ? (
          <div className="mt-7 space-y-3">
            <p className="text-sm text-muted-foreground">Signed in as {session.data.user.email}.</p>
            <Link className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90" to="/sources">Open Hoardcore</Link>
            <Button className="w-full" variant="secondary" onClick={() => void authClient.signOut()}>Sign out</Button>
          </div>
        ) : alternate && config.magicLinkAvailable ? (
          <form className="mt-7 space-y-3" onSubmit={(event) => void requestMagicLink(event)}>
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="login-email">Email address</label>
            <Input id="login-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            <CoolMode><Button className="w-full" type="submit" disabled={pending || sent}>{pending ? 'Sending…' : sent ? 'Link requested' : 'Send sign-in link'}</Button></CoolMode>
            {sent ? <p className="text-xs leading-5 text-muted-foreground" role="status">If this email belongs to an existing account, a one-time link is on its way. Check your inbox and spam folder.</p> : null}
            <button className="w-full py-2 text-xs text-muted-foreground transition hover:text-foreground" type="button" onClick={() => { setAlternate(false); setSent(false); setError(null) }}>Back to {config.providerName}</button>
          </form>
        ) : (
          <div className="mt-7 space-y-4">
            {config.oidcAvailable ? (
              <CoolMode>
                <Button className="h-12 w-full justify-start gap-3 px-3 text-sm" onClick={() => void signInWithOidc()} disabled={pending}>
                  <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-foreground/15 text-[11px] font-semibold uppercase tracking-wide" aria-hidden="true">
                    {config.providerIconUrl ? <img className="size-6 object-contain" src={config.providerIconUrl} alt="" referrerPolicy="no-referrer" /> : config.providerName.slice(0, 2)}
                  </span>
                  <span className="flex-1 text-left">Continue with {config.providerName}</span>
                  <span aria-hidden="true">→</span>
                </Button>
              </CoolMode>
            ) : <p className="text-sm text-destructive">No identity provider is configured.</p>}
            {config.magicLinkAvailable ? (
              <button className="w-full rounded-md py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" type="button" onClick={() => { setAlternate(true); setError(null) }}>Log in another way</button>
            ) : null}
          </div>
        )}

        {error || search.error ? <p className="mt-4 text-sm text-destructive" role="alert">{error || 'That sign-in link could not be used. Request a new one.'}</p> : null}
        <div className="mt-7 border-t border-border pt-4 text-center">
          <Link className="text-xs text-muted-foreground transition hover:text-foreground" to="/">Return home</Link>
        </div>
      </section>
    </main>
  )
}
