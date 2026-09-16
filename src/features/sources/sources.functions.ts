import { createServerFn } from '@tanstack/react-start'
import {
  createCatalogSourceInDatabase,
  listCatalogSourcesFromDatabase,
} from './sources.server'
import { createCatalogSourceInputSchema } from './sources.schemas'

export const listCatalogSources = createServerFn({ method: 'GET' }).handler(() =>
  listCatalogSourcesFromDatabase(),
)

export const createCatalogSource = createServerFn({ method: 'POST' })
  .validator(createCatalogSourceInputSchema)
  .handler(({ data }) => createCatalogSourceInDatabase(data))
