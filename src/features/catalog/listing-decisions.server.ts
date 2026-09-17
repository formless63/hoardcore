import { and, asc, eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database } from '~/server/db/db.server'
import { user } from '~/server/db/schema/auth'
import { listingDecisions, listingDecisionTransitions, listingSharedDecisionNotes } from '~/server/db/schema/listing-decisions'
import type { addSharedListingDecisionNoteInputSchema, saveListingDecisionInputSchema } from './listing-decisions.schemas'

type SaveListingDecisionInput = z.output<typeof saveListingDecisionInputSchema>
type AddSharedNoteInput = z.output<typeof addSharedListingDecisionNoteInputSchema>

export async function getListingDecision(db: Database, userId: string, listingId: string) {
  const [row] = await db.select({ state: listingDecisions.state, note: listingDecisions.note, expectedQuantity: listingDecisions.expectedQuantity }).from(listingDecisions).where(and(eq(listingDecisions.userId, userId), eq(listingDecisions.listingId, listingId)))
  return row ?? { state: 'interesting' as const, note: '', expectedQuantity: null }
}

/** Saves only the caller's private decision/note and appends a state event when it changed. */
export async function saveListingDecision(db: Database, userId: string, input: SaveListingDecisionInput) {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select({ state: listingDecisions.state }).from(listingDecisions).where(and(eq(listingDecisions.userId, userId), eq(listingDecisions.listingId, input.listingId)))
    await tx.insert(listingDecisions).values({ userId, ...input }).onConflictDoUpdate({ target: [listingDecisions.userId, listingDecisions.listingId], set: { state: input.state, note: input.note, expectedQuantity: input.expectedQuantity, updatedAt: new Date() } })
    if (existing?.state !== input.state) await tx.insert(listingDecisionTransitions).values({ listingId: input.listingId, actorId: userId, fromState: existing?.state ?? null, toState: input.state })
  })
  return getListingDecision(db, userId, input.listingId)
}

export async function addSharedListingDecisionNote(db: Database, userId: string, input: AddSharedNoteInput) {
  const [note] = await db.insert(listingSharedDecisionNotes).values({ listingId: input.listingId, authorId: userId, body: input.body }).returning({ id: listingSharedDecisionNotes.id, body: listingSharedDecisionNotes.body, createdAt: listingSharedDecisionNotes.createdAt })
  return note!
}

export type ListingDecisionHistoryItem = { id: string; kind: 'state'; authorName: string; createdAt: Date; fromState: string | null; toState: string } | { id: string; kind: 'note'; authorName: string; createdAt: Date; body: string }

/** Installation-shared history. Private decision notes are intentionally absent. */
export async function listListingDecisionHistory(db: Database, listingId: string): Promise<ListingDecisionHistoryItem[]> {
  const [transitions, notes] = await Promise.all([
    db.select({ id: listingDecisionTransitions.id, authorName: user.name, createdAt: listingDecisionTransitions.createdAt, fromState: listingDecisionTransitions.fromState, toState: listingDecisionTransitions.toState }).from(listingDecisionTransitions).innerJoin(user, eq(user.id, listingDecisionTransitions.actorId)).where(eq(listingDecisionTransitions.listingId, listingId)).orderBy(asc(listingDecisionTransitions.createdAt), asc(listingDecisionTransitions.id)),
    db.select({ id: listingSharedDecisionNotes.id, authorName: user.name, createdAt: listingSharedDecisionNotes.createdAt, body: listingSharedDecisionNotes.body }).from(listingSharedDecisionNotes).innerJoin(user, eq(user.id, listingSharedDecisionNotes.authorId)).where(eq(listingSharedDecisionNotes.listingId, listingId)).orderBy(asc(listingSharedDecisionNotes.createdAt), asc(listingSharedDecisionNotes.id)),
  ])
  return [...transitions.map((item) => ({ ...item, kind: 'state' as const })), ...notes.map((item) => ({ ...item, kind: 'note' as const }))].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
}
