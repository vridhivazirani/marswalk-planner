import { KNOWN_REGION_IDS } from '../navigation/routes.ts'
import type { MissionBundleV1 } from '../types/mission.ts'
import { migrateMissionBundle, normalizeMissionBundleCoordinates } from './missionModel.ts'

export const DRAFT_STORAGE_KEY = 'marswalk:mission:draft:v1'
export const MAX_DRAFT_BYTES = 256 * 1024

export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type DraftLoadStatus =
  | 'restored'
  | 'missing'
  | 'malformed_json'
  | 'unsupported_version'
  | 'invalid_schema'
  | 'id_mismatch'
  | 'storage_error'

export interface DraftLoadResult {
  status: DraftLoadStatus
  bundle: MissionBundleV1 | null
  serialized: string | null
  message: string | null
}

export interface DraftSaveResult {
  ok: boolean
  skippedUnchanged?: boolean
  serialized?: string
  error?: string
}

export function getBrowserLocalStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null
    }
    return window.localStorage
  } catch {
    return null
  }
}

export function loadMissionDraftResult(
  storage: StorageLike | null = getBrowserLocalStorage(),
  expectedMissionId: string | null = null,
  knownRegions: readonly string[] = KNOWN_REGION_IDS,
): DraftLoadResult {
  if (!storage) {
    return {
      status: 'storage_error',
      bundle: null,
      serialized: null,
      message: 'Browser localStorage is unavailable; running with in-memory draft.',
    }
  }

  let rawText: string | null = null
  try {
    rawText = storage.getItem(DRAFT_STORAGE_KEY)
  } catch (err: unknown) {
    return {
      status: 'storage_error',
      bundle: null,
      serialized: null,
      message: err instanceof Error ? err.message : 'Unable to read localStorage draft.',
    }
  }

  if (rawText === null || rawText.trim() === '') {
    return {
      status: 'missing',
      bundle: null,
      serialized: null,
      message: null,
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return {
      status: 'malformed_json',
      bundle: null,
      serialized: null,
      message: 'Stored local mission draft contains invalid JSON; existing storage entry left untouched.',
    }
  }

  const migrated = migrateMissionBundle(parsed, knownRegions)
  if (!migrated.ok) {
    return {
      status: migrated.reason === 'unsupported_version' ? 'unsupported_version' : 'invalid_schema',
      bundle: null,
      serialized: null,
      message: `${migrated.detail} Existing storage entry left untouched.`,
    }
  }

  if (expectedMissionId && migrated.bundle.missionId !== expectedMissionId) {
    return {
      status: 'id_mismatch',
      bundle: null,
      serialized: null,
      message: `Requested mission '${expectedMissionId}' was not found in local drafts.`,
    }
  }

  return {
    status: 'restored',
    bundle: migrated.bundle,
    serialized: rawText,
    message: null,
  }
}

export function saveMissionDraft(
  bundle: MissionBundleV1,
  storage: StorageLike | null = getBrowserLocalStorage(),
  previousSerialized: string | null = null,
): DraftSaveResult {
  if (!storage) {
    return { ok: false, error: 'Browser localStorage unavailable.' }
  }

  const normalizedBundle = normalizeMissionBundleCoordinates(bundle)
  let serialized: string
  try {
    serialized = JSON.stringify(normalizedBundle)
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to serialize mission draft.',
    }
  }

  if (serialized.length > MAX_DRAFT_BYTES) {
    return {
      ok: false,
      error: `Mission draft exceeds compact draft limit (${serialized.length} > ${MAX_DRAFT_BYTES} bytes).`,
    }
  }

  if (previousSerialized !== null && serialized === previousSerialized) {
    return { ok: true, skippedUnchanged: true, serialized }
  }

  try {
    storage.setItem(DRAFT_STORAGE_KEY, serialized)
    return { ok: true, skippedUnchanged: false, serialized }
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to write mission draft to localStorage.',
    }
  }
}

export function clearMissionDraft(storage: StorageLike | null = getBrowserLocalStorage()): boolean {
  if (!storage) return false
  try {
    storage.removeItem(DRAFT_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

