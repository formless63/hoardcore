import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="max-w-3xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
          Hoardcore
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl">
          Buy cheap inventory. Research it properly. Make room eventually.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
          Hoardcore is a self-hosted toolkit for collecting sale inventory, organizing research,
          and deciding what is actually worth bringing home.
        </p>
      </div>

      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="font-medium text-zinc-100">Shopify module</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            The first source module is being built for public Shopify catalog collection and
            normalization.
          </p>
        </article>
        <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="font-medium text-zinc-100">Self-hosted by design</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Your catalog, research, notes, and buying decisions stay in your own installation.
          </p>
        </article>
      </section>
    </main>
  )
}
