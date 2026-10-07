export type AlertRuleSaveFeedback = { error: boolean; message: string }

export async function saveAlertRuleWithFeedback(save: () => Promise<unknown>): Promise<AlertRuleSaveFeedback> {
  try {
    await save()
    return { error: false, message: 'Alert rule saved.' }
  } catch (error) {
    const detail = error instanceof Error && error.message ? `: ${error.message}` : ''
    return { error: true, message: `Could not save alert rule${detail}. Your edits are retained. Try Save again.` }
  }
}
