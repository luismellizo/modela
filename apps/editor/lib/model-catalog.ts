import { type CatalogModel, fetchModelCatalog, filterModels } from '@modela/ai'

/**
 * Server-side model catalog with a short cache.
 *
 * Lives in `lib` rather than in the route because both the picker endpoint and
 * the generate endpoint need it, and a Next route file may only export route
 * handlers.
 *
 * The cache exists because the catalog changes on the order of days while the
 * picker opens on every panel mount.
 */

const CACHE_TTL_MS = 10 * 60 * 1000

let cache: { at: number; models: CatalogModel[] } | null = null

export async function listAllowedModels(
  apiKey: string,
  freeOnly: boolean,
): Promise<CatalogModel[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models

  const catalog = await fetchModelCatalog({ apiKey })
  // Tool calling is mandatory: a model that cannot call tools cannot touch the
  // scene, so offering it would be offering a broken copilot.
  const models = filterModels(catalog, { freeOnly, requireTools: true })
  cache = { at: Date.now(), models }
  return models
}

/**
 * The gate. Enforced here rather than in the picker because a limit the client
 * can bypass is not a limit — anyone can POST whatever model id they like.
 */
export async function isModelAllowed(
  model: string,
  apiKey: string,
  freeOnly: boolean,
): Promise<boolean> {
  if (!freeOnly) return true
  try {
    const models = await listAllowedModels(apiKey, freeOnly)
    return models.some((entry) => entry.id === model)
  } catch {
    // If the catalog is unreachable we cannot prove the model is free. Refusing
    // is the safe failure: the worst case is an unnecessary error, not a bill.
    return false
  }
}

export function clearModelCache(): void {
  cache = null
}
