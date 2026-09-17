import { useForm } from '@tanstack/react-form'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Alert } from '~/components/ui/alert'
import { Button, buttonStyles } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { normalizeShopifyCatalogUrl } from '~/modules/shopify/source-config'
import { createCatalogSource } from './sources.functions'

function validateDisplayName(value: string) {
  const displayName = value.trim()

  if (!displayName) return 'Name is required'
  if (displayName.length > 120) return 'Name must be 120 characters or fewer'

  return undefined
}

function validateCatalogUrl(value: string) {
  try {
    normalizeShopifyCatalogUrl(value)
  } catch (error) {
    return error instanceof Error ? error.message : 'Enter a valid Shopify catalog URL'
  }

  return undefined
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The source could not be registered. Try again.'
}

export function SourceForm() {
  const createSource = useServerFn(createCatalogSource)
  const navigate = useNavigate({ from: '/sources/new' })
  const router = useRouter()
  const [submissionError, setSubmissionError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      displayName: '',
      catalogUrl: '',
      currency: '',
      stockCardsEnabled: false,
    },
    onSubmit: async ({ value }) => {
      setSubmissionError(null)

      try {
        await createSource({
          data: {
            displayName: value.displayName,
            moduleId: 'shopify',
            config: { catalogUrl: value.catalogUrl, ...(value.currency.trim() ? { currency: value.currency } : {}), stockCardsEnabled: value.stockCardsEnabled },
          },
        })
        await router.invalidate({ sync: true })
        await navigate({ to: '/sources' })
      } catch (error) {
        setSubmissionError(errorMessage(error))
      }
    },
  })

  return (
    <form
      className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-card-foreground">Source type</p>
          <div className="mt-2 flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/50 p-4">
            <div>
              <p className="font-medium text-foreground">Shopify</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Register one public storefront or collection scope. You can add more Shopify
                sources separately; they all reuse this module.
              </p>
            </div>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
              First module
            </span>
          </div>
        </div>

        <form.Field
          name="displayName"
          validators={{
            onChange: ({ value }) => validateDisplayName(value),
            onSubmit: ({ value }) => validateDisplayName(value),
          }}
        >
          {(field) => {
            const error = field.state.meta.isTouched ? field.state.meta.errors[0] : undefined
            const errorId = `${field.name}-error`

            return (
              <div>
                <label className="text-sm font-medium text-card-foreground" htmlFor={field.name}>
                  Name
                </label>
                <p className="mt-1 text-sm text-muted-foreground" id={`${field.name}-hint`}>
                  A name you will recognize in review lists.
                </p>
                <Input
                  autoComplete="organization"
                  aria-describedby={error ? `${field.name}-hint ${errorId}` : `${field.name}-hint`}
                  aria-invalid={Boolean(error)}
                  className="mt-2"
                  id={field.name}
                  maxLength={120}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Northwind outlet"
                  value={field.state.value}
                />
                {error ? (
                  <p className="mt-2 text-sm text-destructive" id={errorId}>
                    {String(error)}
                  </p>
                ) : null}
              </div>
            )
          }}
        </form.Field>

        <form.Field
          name="currency"
          validators={{ onChange: ({ value }) => value.trim() && !/^[A-Za-z]{3}$/.test(value.trim()) ? 'Use a three-letter currency code.' : undefined }}
        >
          {(field) => {
            const error = field.state.meta.isTouched ? field.state.meta.errors[0] : undefined
            return <div>
              <label className="text-sm font-medium text-card-foreground" htmlFor={field.name}>Currency (optional)</label>
              <p className="mt-1 text-sm text-muted-foreground">Declare the storefront currency when known. Leave blank to preserve unknown currency.</p>
              <Input autoCapitalize="characters" aria-invalid={Boolean(error)} className="mt-2 uppercase" id={field.name} maxLength={3} name={field.name} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} placeholder="USD" value={field.state.value} />
              {error ? <p className="mt-2 text-sm text-destructive">{String(error)}</p> : null}
            </div>
          }}
        </form.Field>

        <form.Field
          name="catalogUrl"
          validators={{
            onChange: ({ value }) => validateCatalogUrl(value),
            onSubmit: ({ value }) => validateCatalogUrl(value),
          }}
        >
          {(field) => {
            const error = field.state.meta.isTouched ? field.state.meta.errors[0] : undefined
            const errorId = `${field.name}-error`

            return (
              <div>
                <label className="text-sm font-medium text-card-foreground" htmlFor={field.name}>
                  Catalog URL
                </label>
                <p className="mt-1 text-sm text-muted-foreground" id={`${field.name}-hint`}>
                  Use the storefront homepage or a single collection URL. Query parameters are
                  removed when saved.
                </p>
                <Input
                  autoCapitalize="none"
                  autoComplete="url"
                  aria-describedby={error ? `${field.name}-hint ${errorId}` : `${field.name}-hint`}
                  aria-invalid={Boolean(error)}
                  className="mt-2 font-mono"
                  id={field.name}
                  inputMode="url"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="store.example.com"
                  spellCheck={false}
                  value={field.state.value}
                />
                {error ? (
                  <p className="mt-2 text-sm text-destructive" id={errorId}>
                    {String(error)}
                  </p>
                ) : null}
              </div>
            )
          }}
        </form.Field>

        <form.Field name="stockCardsEnabled">
          {(field) => <label className="flex items-start gap-3 text-sm text-foreground">
            <input className="mt-1" type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.checked)} />
            <span>Supplement stock counts from public collection cards when catalog JSON omits them. This makes extra paced collection-page requests, counts against the run ceiling, and never visits individual product pages.</span>
          </label>}
        </form.Field>

        {submissionError ? (
          <Alert aria-live="polite" role="alert" title="Could not add source">
            {submissionError}
          </Alert>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Link to="/sources" className={buttonStyles({ variant: 'ghost' })}>
            Cancel
          </Link>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button disabled={!canSubmit || isSubmitting} type="submit">
                {isSubmitting ? 'Adding source…' : 'Add source'}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </form>
  )
}
