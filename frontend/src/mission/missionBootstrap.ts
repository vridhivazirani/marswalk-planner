import { createDefaultMissionBundle, normalizeMissionBundleCoordinates } from './missionModel.ts'
import {
  type DraftLoadStatus,
  type StorageLike,
  loadMissionDraftResult,
} from './missionStorage.ts'
import {
  DEFAULT_PAGE_ID,
  DEFAULT_REGION_ID,
  KNOWN_REGION_IDS,
  buildMissionUrl,
  parseMissionUrl,
  parseUrlCoordinate,
} from '../navigation/routes.ts'
import type { MissionBundleV1 } from '../types/mission.ts'

export interface BootstrapPersistenceInfo {
  loadStatus: DraftLoadStatus
  notice: string | null
  missingRequestedMissionId: string | null
  lastSavedAt: string | null
  storageError: string | null
}

export interface MissionBootstrapResult {
  bundle: MissionBundleV1
  persistence: BootstrapPersistenceInfo
  blockAutoPersist: boolean
  initialSerialized: string | null
  canonicalUrl: string
}

export interface InitializeMissionBootstrapOptions {
  search?: string
  hash?: string
  storage?: StorageLike | null
  knownRegions?: readonly string[]
  nowIso?: string
}

/**
 * Pure initialization boundary for MissionProvider.
 * Reads URL parameters and existing storage without performing any storage writes or
 * History mutations, making it safe under React StrictMode double-invocation.
 */
export function initializeMissionBootstrap(
  options: InitializeMissionBootstrapOptions = {},
): MissionBootstrapResult {
  const search = options.search ?? ''
  const hash = options.hash ?? ''
  const storage = options.storage ?? null
  const knownRegions = options.knownRegions ?? KNOWN_REGION_IDS

  const parsedUrl = parseMissionUrl(search, hash, knownRegions)
  const urlCoordinate = parseUrlCoordinate(search)
  const loadResult = loadMissionDraftResult(storage, parsedUrl.missionId, knownRegions)

  let bundle: MissionBundleV1
  let loadStatus: DraftLoadStatus = loadResult.status
  let notice: string | null = loadResult.message
  let missingRequestedMissionId: string | null = null
  let blockAutoPersist = false
  let initialSerialized: string | null = null

  if (loadResult.status === 'restored' && loadResult.bundle) {
    bundle = loadResult.bundle
    const overriddenByUrl =
      Boolean(parsedUrl.page && parsedUrl.page !== bundle.app.activePage) ||
      Boolean(parsedUrl.region && parsedUrl.region !== bundle.geographic.regionId)
    if (parsedUrl.page && parsedUrl.page !== bundle.app.activePage) {
      bundle = {
        ...bundle,
        app: {
          ...bundle.app,
          activePage: parsedUrl.page,
        },
      }
    }
    if (parsedUrl.region && parsedUrl.region !== bundle.geographic.regionId) {
      bundle = {
        ...bundle,
        geographic: {
          ...bundle.geographic,
          regionId: parsedUrl.region,
        },
      }
    }
    if (urlCoordinate) {
      bundle = {
        ...bundle,
        geographic: {
          ...bundle.geographic,
          selectedLocation: urlCoordinate,
        },
      }
    }
    bundle = normalizeMissionBundleCoordinates(bundle)
    // Match canonical serialized string when restored cleanly without URL overrides so mount persistence skips redundant writes.
    initialSerialized = overriddenByUrl || urlCoordinate ? null : JSON.stringify(bundle)
  } else {
    const requestedPage = parsedUrl.page ?? DEFAULT_PAGE_ID
    const requestedRegion = parsedUrl.region ?? DEFAULT_REGION_ID

    if (
      parsedUrl.missionId &&
      (loadResult.status === 'missing' || loadResult.status === 'id_mismatch')
    ) {
      missingRequestedMissionId = parsedUrl.missionId
      loadStatus = 'id_mismatch'
      notice = `Mission '${parsedUrl.missionId}' was not found in local storage; started a fresh local draft instead.`
    }

    if (
      loadResult.status === 'malformed_json' ||
      loadResult.status === 'unsupported_version' ||
      loadResult.status === 'invalid_schema' ||
      loadResult.status === 'id_mismatch' ||
      loadResult.status === 'storage_error'
    ) {
      blockAutoPersist = true
    }

    bundle = createDefaultMissionBundle({
      regionId: requestedRegion,
      activePage: requestedPage,
      nowIso: options.nowIso,
    })
    if (urlCoordinate) {
      bundle = {
        ...bundle,
        geographic: {
          ...bundle.geographic,
          selectedLocation: urlCoordinate,
        },
      }
    }
  }

  const canonicalUrl = buildMissionUrl({
    page: bundle.app.activePage,
    region: bundle.geographic.regionId,
    missionId: bundle.missionId,
    coordinate: urlCoordinate,
  })

  return {
    bundle,
    persistence: {
      loadStatus,
      notice,
      missingRequestedMissionId,
      lastSavedAt: initialSerialized ? bundle.updatedAt : null,
      storageError: loadResult.status === 'storage_error' ? loadResult.message : null,
    },
    blockAutoPersist,
    initialSerialized,
    canonicalUrl,
  }
}
