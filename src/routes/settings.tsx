import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getPublicSession } from '~/features/auth/auth.functions'

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  component: Outlet,
})
