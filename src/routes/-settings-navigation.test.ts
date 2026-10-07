import { describe, expect, it } from 'vitest'
import { Outlet } from '@tanstack/react-router'
import { Children, isValidElement, type ReactNode } from 'react'
import { Route as SettingsRoute, SettingsLayout } from './settings'
import { Route as SettingsIndex } from './settings/index'
import { SettingsNavigation, settingsSections } from '~/features/settings/settings-navigation'

function childTypes(node: ReactNode): unknown[] {
  return Children.toArray(node).flatMap(child => isValidElement<{ children?: ReactNode }>(child) ? [child.type, ...childTypes(child.props.children)] : [])
}

describe('settings navigation', () => {
  it('renders child routes through its parent layout', () => {
    expect(SettingsRoute.options.component).toBe(SettingsLayout)
    expect(childTypes(SettingsLayout())).toContain(Outlet)
    expect(childTypes(SettingsLayout())).toContain(SettingsNavigation)
    expect(SettingsIndex.options.component).toBeDefined()
  })
  it('provides one stable settings destination for every configuration area', () => {
    expect(settingsSections.map(section => section.to)).toEqual(['/settings', '/settings/sources', '/settings/alerts', '/settings/category-groups', '/settings/research-tokens', '/settings/loxep'])
    expect(new Set(settingsSections.map(section => section.to)).size).toBe(settingsSections.length)
  })
})
