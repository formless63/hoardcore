import { describe, expect, it } from 'vitest'
import { parseCrontab } from 'graphile-worker'
import { catalogScheduleCrontab } from './lifecycle.server'

describe('embedded source scheduler', () => {
  it('uses a task name accepted by Graphile Worker crontab', () => {
    const items = parseCrontab(catalogScheduleCrontab)
    expect(items).toHaveLength(1)
    expect(items[0]?.task).toBe('catalog_schedule')
  })
})
