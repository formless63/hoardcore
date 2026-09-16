import { and, eq } from 'drizzle-orm'
import type { Database } from './db/index.server'
import { account, user } from './db/schema/auth'

export const MAGIC_LINK_SESSION_SECONDS = 24 * 60 * 60
export const OIDC_SESSION_SECONDS = 30 * 24 * 60 * 60

export function isMagicLinkVerification(path: string | undefined): boolean {
  return path === '/magic-link/verify' || path?.endsWith('/magic-link/verify') === true
}

export function magicLinkSessionExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + MAGIC_LINK_SESSION_SECONDS * 1000)
}

export async function oidcLinkedUserIdForEmail(db: Database, email: string): Promise<string | undefined> {
  const rows = await db.select({ id: user.id }).from(user)
    .innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, 'oidc')))
    .where(eq(user.email, email.trim().toLowerCase())).limit(1)
  return rows[0]?.id
}

export async function hasOidcAccount(db: Database, userId: string): Promise<boolean> {
  const rows = await db.select({ id: account.id }).from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'oidc'))).limit(1)
  return rows.length > 0
}

export async function magicLinkSessionPolicy(
  db: Database,
  session: { userId: string; createdAt: Date },
  path: string | undefined,
): Promise<false | { data: { expiresAt: Date } } | undefined> {
  if (!isMagicLinkVerification(path)) return
  if (!(await hasOidcAccount(db, session.userId))) return false
  return { data: { expiresAt: magicLinkSessionExpiry(session.createdAt) } }
}
