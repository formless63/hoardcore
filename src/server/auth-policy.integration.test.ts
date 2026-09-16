import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'
import { closeDatabase, getDatabase } from './db/index.server'
import { account, authSchema, session, user } from './db/schema/auth'
import { magicLinkSessionPolicy, OIDC_SESSION_SECONDS, oidcLinkedUserIdForEmail } from './auth-policy.server'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip

describeWithDatabase('OIDC-only account creation and magic-link session guard', () => {
  const suffix = crypto.randomUUID()
  const oidcUserId = `auth-oidc-${suffix}`
  const otherUserId = `auth-other-${suffix}`
  const oidcEmail = `${oidcUserId}@example.test`
  const db = () => getDatabase()

  beforeAll(async () => {
    const now = new Date()
    await db().insert(user).values([
      { id: oidcUserId, name: 'OIDC user', email: oidcEmail, emailVerified: true, createdAt: now, updatedAt: now },
      { id: otherUserId, name: 'Unlinked user', email: `${otherUserId}@example.test`, emailVerified: true, createdAt: now, updatedAt: now },
    ])
    await db().insert(account).values({
      id: `account-${suffix}`, accountId: `provider-${suffix}`, providerId: 'oidc', userId: oidcUserId, createdAt: now, updatedAt: now,
    })
  })

  afterAll(async () => {
    await db().delete(user).where(eq(user.id, oidcUserId))
    await db().delete(user).where(eq(user.id, otherUserId))
    await closeDatabase()
  })

  it('offers email fallback only to an account already linked to OIDC', async () => {
    expect(await oidcLinkedUserIdForEmail(db(), oidcEmail.toUpperCase())).toBe(oidcUserId)
    expect(await oidcLinkedUserIdForEmail(db(), `${otherUserId}@example.test`)).toBeUndefined()
    expect(await oidcLinkedUserIdForEmail(db(), 'unknown@example.test')).toBeUndefined()
  })

  it('caps a linked magic-link session at 24 hours and rejects unlinked users', async () => {
    const createdAt = new Date('2026-09-16T00:00:00.000Z')
    expect(await magicLinkSessionPolicy(db(), { userId: oidcUserId, createdAt }, '/magic-link/verify'))
      .toEqual({ data: { expiresAt: new Date('2026-09-17T00:00:00.000Z') } })
    expect(await magicLinkSessionPolicy(db(), { userId: otherUserId, createdAt }, '/magic-link/verify')).toBe(false)
    expect(await magicLinkSessionPolicy(db(), { userId: oidcUserId, createdAt }, '/callback/oidc')).toBeUndefined()
  })

  it('redeems a Better Auth link into a 24-hour database session without creating users', async () => {
    let sentUrl = ''
    const auth = betterAuth({
      database: drizzleAdapter(db(), { provider: 'pg', schema: authSchema }),
      secret: 'test-secret-which-is-at-least-thirty-two-characters',
      baseURL: 'http://localhost:3000',
      session: { expiresIn: OIDC_SESSION_SECONDS, disableSessionRefresh: true },
      databaseHooks: { session: { create: { before: (row, context) => magicLinkSessionPolicy(db(), row, context?.path) } } },
      plugins: [magicLink({ disableSignUp: true, expiresIn: 600, storeToken: 'hashed', sendMagicLink: async ({ url }) => { sentUrl = url } })],
    })

    const request = async (email: string) => auth.handler(new Request('http://localhost:3000/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, callbackURL: '/sources' }),
    }))

    const requested = await request(oidcEmail)
    expect(requested.status).toBe(200)
    expect(sentUrl).toContain('/magic-link/verify')
    const redeemed = await auth.handler(new Request(sentUrl))
    expect(redeemed.status).toBe(302)
    const rows = await db().select().from(session).where(eq(session.userId, oidcUserId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.expiresAt.getTime() - rows[0]!.createdAt.getTime()).toBe(24 * 60 * 60 * 1000)
    const replayed = await auth.handler(new Request(sentUrl))
    expect(replayed.headers.get('location')).toContain('error=')

    await request(`${otherUserId}@example.test`)
    const unlinkedRedeem = await auth.handler(new Request(sentUrl))
    expect(unlinkedRedeem.headers.get('location')).toContain('error=')
    expect(await db().select().from(session).where(eq(session.userId, otherUserId))).toHaveLength(0)

    await request('unknown-auth-user@example.test')
    const unknownRedeem = await auth.handler(new Request(sentUrl))
    expect(unknownRedeem.status).toBe(302)
    expect(unknownRedeem.headers.get('location')).toContain('error=')
    expect(await db().select().from(user).where(eq(user.email, 'unknown-auth-user@example.test'))).toHaveLength(0)
  })
})
