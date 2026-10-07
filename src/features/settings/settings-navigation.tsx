import { Link } from '@tanstack/react-router'

export const settingsSections = [
  { to: '/settings', label: 'General', description: 'Defaults for new collection runs' },
  { to: '/settings/sources', label: 'Sources & crawling', description: 'Schedules, headers, routing and response handling' },
  { to: '/settings/alerts', label: 'Notifications', description: 'Delivery settings and your alert rules' },
  { to: '/settings/category-groups', label: 'Catalog organization', description: 'Source categories and internal mappings' },
  { to: '/settings/research-tokens', label: 'Research API', description: 'Tokens for external research tools' },
  { to: '/settings/loxep', label: 'Loxep integration', description: 'Connections and outcome webhooks' },
] as const

export function SettingsNavigation() {
  return <aside className="min-w-0 border-b border-border bg-card p-2 lg:border-b-0 lg:border-r lg:p-3">
    <h2 className="mb-2 px-2 text-sm font-semibold">Settings</h2>
    <nav aria-label="Settings navigation" className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
      {settingsSections.map(section => <Link key={section.to} to={section.to} activeOptions={{ exact: true, includeSearch: false }} className="min-w-0 rounded border border-transparent px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring [&[data-status=active]]:border-primary/30 [&[data-status=active]]:bg-primary/10 [&[data-status=active]]:text-foreground">
        <span className="block font-medium">{section.label}</span>
        <span className="mt-1 hidden text-[11px] text-muted-foreground lg:block">{section.description}</span>
      </Link>)}
    </nav>
  </aside>
}
