import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { getSourceRouting, saveSourceRouting } from './source-routing.functions'
import { sourceRoutingInputSchema, type SourceRoutingSummary } from './source-routing.schemas'

const inputClass = 'mt-1 w-full rounded border border-border bg-background p-1.5 text-foreground'

export function SourceRoutingControl({ sourceId }: { sourceId: string }) {
  const get = useServerFn(getSourceRouting)
  const query = useQuery({ queryKey: ['source-routing', sourceId], queryFn: () => get({ data: { sourceId } }) })
  return <details className="rounded border border-border/70 p-2">
    <summary className="cursor-pointer text-xs font-medium">Network routing{query.data ? ` · ${query.data.mode === 'http_proxy' ? 'HTTP proxy' : 'direct'}` : ''}</summary>
    {query.isPending ? <p className="mt-2 text-xs">Loading routing settings…</p> : query.error ? <p role="alert" className="mt-2 text-xs text-destructive">{query.error.message}</p>
      : query.data ? <RoutingEditor key={`${sourceId}:${JSON.stringify(query.data)}`} sourceId={sourceId} routing={query.data} /> : null}
  </details>
}

function RoutingEditor({ sourceId, routing }: { sourceId: string; routing: SourceRoutingSummary }) {
  const save = useServerFn(saveSourceRouting)
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const form = useForm({
    defaultValues: { transport: routing.transport, mode: routing.mode, endpoint: routing.endpoint, username: routing.username, password: '', clearPassword: false },
    onSubmit: async ({ value }) => {
      setMessage('')
      const parsed = sourceRoutingInputSchema.safeParse({ sourceId, ...value })
      if (!parsed.success) { setMessage(parsed.error.issues.map(issue => issue.message).join('; ')); return }
      try {
        const result = await save({ data: parsed.data })
        form.setFieldValue('password', '')
        form.setFieldValue('clearPassword', false)
        // Never retain the submitted password in a mutation/query cache.
        queryClient.setQueryData(['source-routing', sourceId], result)
        await queryClient.invalidateQueries({ queryKey: ['source-safety', sourceId] })
        setMessage('Network routing saved. Existing cooldowns and pacing are unchanged.')
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save network routing') }
    },
  })
  return <form className="mt-3 space-y-3 text-xs" onSubmit={event => { event.preventDefault(); void form.handleSubmit() }}>
    <form.Field name="transport">{field => <label className="block">Catalog transport<select className={inputClass} value={field.state.value} onChange={event => field.handleChange(event.target.value as 'http' | 'browser')}><option value="http">Standard HTTP client</option><option value="browser">Chromium browser</option></select></label>}</form.Field>
    <form.Field name="mode">{field => <label className="block">Route<select className={inputClass} value={field.state.value} onChange={event => field.handleChange(event.target.value as 'direct' | 'http_proxy')}><option value="direct">Direct connection</option><option value="http_proxy">HTTP CONNECT proxy</option></select></label>}</form.Field>
    <form.Subscribe selector={state => state.values.mode}>{mode => mode === 'http_proxy' ? <div className="grid gap-3 sm:grid-cols-2">
      <form.Field name="endpoint">{field => <label className="block sm:col-span-2">Proxy URL<input className={inputClass} value={field.state.value} onBlur={field.handleBlur} onChange={event => field.handleChange(event.target.value)} placeholder="http://proxy:8888" maxLength={2048} required autoComplete="off" /></label>}</form.Field>
      <form.Field name="username">{field => <label className="block">Proxy username<input className={inputClass} value={field.state.value} onChange={event => field.handleChange(event.target.value)} maxLength={256} autoComplete="off" /></label>}</form.Field>
      <form.Field name="password">{field => <label className="block">Proxy password<input className={inputClass} type="password" value={field.state.value} onChange={event => field.handleChange(event.target.value)} maxLength={4096} placeholder={routing.hasPassword ? 'Saved — leave blank to keep' : 'Optional'} autoComplete="new-password" /></label>}</form.Field>
      {routing.hasPassword ? <form.Field name="clearPassword">{field => <label className="flex items-center gap-1"><input type="checkbox" checked={field.state.value} onChange={event => field.handleChange(event.target.checked)} />Clear saved password</label>}</form.Field> : null}
    </div> : null}</form.Subscribe>
    <p className="text-muted-foreground">Applies to catalog, robots.txt, and photo requests only. Proxy failures never fall back to direct connections. Cooldowns, request limits, and schedules stay unchanged. Passwords are encrypted and never returned to this page. Selecting direct clears saved proxy credentials.</p>
    <p className="text-muted-foreground">Chromium uses native browser navigation for catalog and robots.txt requests. It fetches only the requested document, without redirects or background resources. Photos continue to use the HTTP client through the same route.</p>
    <form.Subscribe selector={state => state.isSubmitting}>{busy => <Button type="submit" size="small" disabled={busy}>{busy ? 'Saving…' : 'Save network routing'}</Button>}</form.Subscribe>
    {message ? <p role="status">{message}</p> : null}
  </form>
}
