import { describe, expect, it } from 'vitest'
import { Outlet } from '@tanstack/react-router'
import { Route as SettingsLayout } from './settings'
import { Route as SettingsIndex } from './settings/index'

describe('settings navigation', () => {
  it('renders child routes through its parent layout', () => {
    expect(SettingsLayout.options.component).toBe(Outlet)
    expect(SettingsIndex.options.component).toBeDefined()
  })
})
