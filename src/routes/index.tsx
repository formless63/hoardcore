import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="max-w-3xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Hoardcore
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Buy cheap inventory. Research it properly. Make room eventually.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
          Hoardcore is a self-hosted toolkit for collecting sale inventory, organizing research,
          and deciding what is actually worth bringing home.
        </p>
      </div>

      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="font-medium">Shopify module</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The first source module is being built for public Shopify catalog collection and
            normalization.
          </p>
        </article>
        <article className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="font-medium">Self-hosted by design</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your catalog, research, notes, and buying decisions stay in your own installation.
          </p>
        </article>
      </section>
    </main>
  )
}
