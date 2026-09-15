export type ModuleStatus = 'planned' | 'experimental' | 'stable'

export interface HoardcoreModuleManifest {
  id: string
  name: string
  description: string
  status: ModuleStatus
}
