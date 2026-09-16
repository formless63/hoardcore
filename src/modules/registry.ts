import { shopifyModule } from './shopify'
import type { HoardcoreSourceModule } from './types'

const sourceModules: ReadonlyMap<string, HoardcoreSourceModule> = new Map([
  [shopifyModule.manifest.id, shopifyModule],
])

export function getSourceModule(moduleId: string): HoardcoreSourceModule | undefined {
  return sourceModules.get(moduleId)
}

export function listSourceModules() {
  return Array.from(sourceModules.values(), (sourceModule) => sourceModule.manifest)
}
