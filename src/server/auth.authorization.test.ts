import { describe, expect, it } from 'vitest'
import { requireSessionFrom, withRequiredSession } from './auth.server'

describe('operator authorization boundary', () => {
  it('rejects an anonymous direct request before its handler can continue', async () => {
    let protectedOperationCalled = false
    await expect(
      withRequiredSession(
        async () => {
          protectedOperationCalled = true
          return 'private data'
        },
        async () => null,
      ),
    ).rejects.toThrow('Unauthorized')
    expect(protectedOperationCalled).toBe(false)
  })

  it('returns the authenticated operator session to the server handler', async () => {
    const session = { user: { id: 'operator-1' } } as never
    await expect(requireSessionFrom(async () => session)).resolves.toBe(session)
  })
})
