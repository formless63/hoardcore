import { describe, expect, it, vi } from 'vitest'
import { saveAlertRuleWithFeedback } from './-alert-rule-save-feedback'

describe('alert rule save feedback', () => {
  it('only confirms success after persistence completes', async () => {
    let resolve!: () => void
    const persisted = new Promise<void>((done) => { resolve = done })
    let completed = false
    const save = vi.fn(() => persisted)
    const result = saveAlertRuleWithFeedback(save).then((feedback) => { completed = true; return feedback })
    await Promise.resolve()
    expect(completed).toBe(false)
    resolve()
    expect(await result).toEqual({ error: false, message: 'Alert rule saved.' })
    expect(save).toHaveBeenCalledOnce()
  })

  it('returns actionable error feedback and allows a successful retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(undefined)
    expect(await saveAlertRuleWithFeedback(save)).toEqual({ error: true, message: 'Could not save alert rule: Connection lost. Your edits are retained. Try Save again.' })
    expect(await saveAlertRuleWithFeedback(save)).toEqual({ error: false, message: 'Alert rule saved.' })
  })

  it('handles non-Error rejections and synchronous throws', async () => {
    const feedback = await saveAlertRuleWithFeedback(() => Promise.reject(null))
    expect(feedback).toEqual({ error: true, message: 'Could not save alert rule. Your edits are retained. Try Save again.' })
    expect((await saveAlertRuleWithFeedback(() => { throw new Error('Unavailable') })).error).toBe(true)
  })
})
