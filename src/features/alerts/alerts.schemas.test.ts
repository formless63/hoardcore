import { describe, expect, it } from 'vitest'
import { notificationSettingsInputSchema, ntfyEndpointSchema } from './alerts.schemas'

describe('ntfy notification configuration', () => {
  it('accepts a public HTTPS origin and normalizes a trailing slash', () => {
    expect(ntfyEndpointSchema.parse('https://ntfy.example.test/')).toBe('https://ntfy.example.test')
  })

  it('does not permit the notification adapter to target local or private addresses', () => {
    for (const endpoint of ['http://ntfy.example.test', 'https://localhost', 'https://127.0.0.1', 'https://10.0.0.8', 'https://100.64.0.1', 'https://169.254.169.254', 'https://192.168.1.8', 'https://ntfy.example.test:8443', 'https://ntfy.example.test/path']) {
      expect(ntfyEndpointSchema.safeParse(endpoint).success).toBe(false)
    }
  })

  it('requires a topic only when the user explicitly enables delivery', () => {
    expect(notificationSettingsInputSchema.safeParse({ enabled: false, endpoint: 'https://ntfy.example.test', topic: '' }).success).toBe(true)
    expect(notificationSettingsInputSchema.safeParse({ enabled: true, endpoint: 'https://ntfy.example.test', topic: '' }).success).toBe(false)
  })
})
