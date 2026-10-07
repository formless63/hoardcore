import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getPublicSession } from '~/features/auth/auth.functions'
import { SettingsNavigation } from '~/features/settings/settings-navigation'

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  component: SettingsLayout,
})

export function SettingsLayout() {
  return <div className="grid min-w-0 lg:grid-cols-[13rem_minmax(0,1fr)]">
    <SettingsNavigation />
    <div className="min-w-0"><Outlet /></div>
  </div>
}
