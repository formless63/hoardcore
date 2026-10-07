import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { getSourceRouting, saveSourceRouting } from './source-routing.functions'
import { sourceRoutingInputSchema, type SourceRoutingSummary } from './source-routing.schemas'
import { parseAdditionalRequestHeaders } from './request-headers'

const inputClass = 'mt-1 w-full rounded border border-border bg-background p-1.5 text-foreground'

export function SourceRoutingControl({ sourceId }: { sourceId: string }) {
  const get = useServerFn(getSourceRouting)
  const query = useQuery({ queryKey: ['source-routing', sourceId], queryFn: () => get({ data: { sourceId } }) })
  return <details className="rounded border border-border/70 p-2">
    <summary className="cursor-pointer text-xs font-medium">Network routing &amp; request headers{query.data ? ` · ${query.data.transport === 'browser' ? 'Chromium' : 'HTTP'} · ${query.data.mode === 'http_proxy' ? 'proxy' : 'direct'}` : ''}</summary>
    {query.isPending ? <p className="mt-2 text-xs">Loading routing settings…</p> : query.error ? <p role="alert" className="mt-2 text-xs text-destructive">{query.error.message}</p>
      : query.data ? <RoutingEditor key={sourceId} sourceId={sourceId} routing={query.data} /> : null}
  </details>
}

function RoutingEditor({ sourceId, routing }: { sourceId: string; routing: SourceRoutingSummary }) {
  const save = useServerFn(saveSourceRouting)
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const form = useForm({
    defaultValues: { transport: routing.transport, mode: routing.mode, endpoint: routing.endpoint, username: routing.username, password: '', clearPassword: false,
      userAgent: routing.requestHeaders['user-agent'] ?? routing.defaultHeaders['user-agent'] ?? '', accept: routing.requestHeaders.accept ?? '', acceptLanguage: routing.requestHeaders['accept-language'] ?? '',
      additionalHeaders: Object.entries(routing.requestHeaders).filter(([name]) => !['user-agent', 'accept', 'accept-language'].includes(name)).map(([name, value]) => `${name}: ${value}`).join('\n'),
    },
    onSubmit: async ({ value }) => {
      setMessage('')
      let requestHeaders: Record<string, string>
      try {
        requestHeaders = parseAdditionalRequestHeaders(value.additionalHeaders)
        for (const [name, header] of [['user-agent', value.userAgent], ['accept', value.accept], ['accept-language', value.acceptLanguage]])
          if (header.trim()) requestHeaders[name] = header.trim()
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid additional request headers'); return }
      const parsed = sourceRoutingInputSchema.safeParse({ sourceId, ...value, requestHeaders })
      if (!parsed.success) { setMessage(parsed.error.issues.map(issue => issue.message).join('; ')); return }
      try {
        const result = await save({ data: parsed.data })
        form.setFieldValue('password', '')
        form.setFieldValue('clearPassword', false)
        // Never retain the submitted password in a mutation/query cache.
        queryClient.setQueryData(['source-routing', sourceId], result)
        await queryClient.invalidateQueries({ queryKey: ['source-safety', sourceId] })
        setMessage('Routing and catalog headers saved. Existing cooldowns and pacing are unchanged.')
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
    <fieldset className="space-y-3 rounded border border-border p-3"><legend className="px-1">Catalog request headers</legend>
      <form.Field name="userAgent">{field => <label className="block">User-Agent<input className={inputClass} value={field.state.value} onChange={event => field.handleChange(event.target.value)} placeholder={routing.defaultHeaders['user-agent'] ?? 'Transport default'} maxLength={2048} autoComplete="off" /></label>}</form.Field>
      <form.Subscribe selector={state => state.values.transport}>{transport => <form.Field name="accept">{field => <label className="block">Accept<input className={inputClass} value={field.state.value} onChange={event => field.handleChange(event.target.value)} placeholder={transport === 'browser' ? 'Chromium native navigation header' : routing.defaultHeaders.accept ?? 'Request default'} maxLength={2048} /></label>}</form.Field>}</form.Subscribe>
      <form.Field name="acceptLanguage">{field => <label className="block">Accept-Language<input className={inputClass} value={field.state.value} onChange={event => field.handleChange(event.target.value)} placeholder="For example: en-US,en;q=0.9" maxLength={2048} /></label>}</form.Field>
      <form.Field name="additionalHeaders">{field => <label className="block">Additional public headers<textarea className={`${inputClass} font-mono`} rows={3} value={field.state.value} onChange={event => field.handleChange(event.target.value)} maxLength={70000} placeholder={'Cache-Control: no-cache\nX-Catalog-Client: browser'} /></label>}</form.Field>
      <p className="text-muted-foreground">One Name: value per line. These overrides apply to catalog and robots.txt requests with either transport; photos retain their own headers. Leave fields empty to use defaults. Chromium keeps its native navigation headers unless overridden. Do not put secrets here: these values are visible to installation operators. Session/authentication headers need separate credential storage, and routing/framing/cache validators stay transport-managed.</p>
      <Button size="small" type="button" onClick={() => { form.setFieldValue('userAgent', ''); form.setFieldValue('accept', ''); form.setFieldValue('acceptLanguage', ''); form.setFieldValue('additionalHeaders', '') }}>Use default headers</Button>
      <form.Subscribe selector={state => [state.values.userAgent, state.values.accept, state.values.acceptLanguage, state.values.additionalHeaders, state.values.transport] as const}>{([userAgent, accept, language, additional, transport]) => <details><summary className="cursor-pointer">Configured header preview</summary><pre className="mt-2 whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono">{`User-Agent: ${userAgent || routing.defaultHeaders['user-agent'] || '(transport default)'}\nAccept: ${accept || (transport === 'browser' ? '(Chromium native navigation default)' : routing.defaultHeaders.accept || '(request default)')}\nAccept-Language: ${language || '(transport default)'}${additional ? `\n${additional}` : ''}`}</pre><p className="mt-1 text-muted-foreground">The transport also supplies Host and connection/browser metadata; conditional requests add collector-managed validators.</p></details>}</form.Subscribe>
    </fieldset>
    <p className="text-muted-foreground">Network routing applies to catalog, robots.txt, and photo requests. Proxy failures never fall back to direct connections. Cooldowns, request limits, and schedules stay unchanged. Passwords are encrypted and never returned to this page. Selecting direct clears saved proxy credentials.</p>
    <p className="text-muted-foreground">Chromium uses native browser navigation for catalog and robots.txt requests. It fetches only the requested document, without redirects or background resources. Photos continue to use the HTTP client through the same route.</p>
    <form.Subscribe selector={state => state.isSubmitting}>{busy => <Button type="submit" size="small" disabled={busy}>{busy ? 'Saving…' : 'Save routing & headers'}</Button>}</form.Subscribe>
    {message ? <p role="status">{message}</p> : null}
  </form>
}
