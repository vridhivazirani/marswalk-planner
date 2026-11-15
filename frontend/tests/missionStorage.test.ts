import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultMissionBundle } from '../src/mission/missionModel.ts'
import {
  DRAFT_STORAGE_KEY,
  MAX_DRAFT_BYTES,
  type StorageLike,
  clearMissionDraft,
  loadMissionDraftResult,
  saveMissionDraft,
} from '../src/mission/missionStorage.ts'

class MemoryStorage implements StorageLike {
  private readonly store = new Map<string, string>()
  public setCalls = 0

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.setCalls += 1
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  seedRaw(value: string): void {
    this.store.set(DRAFT_STORAGE_KEY, value)
  }
}

test('saveMissionDraft and loadMissionDraftResult round-trip a valid MissionBundleV1', () => {
  const storage = new MemoryStorage()
  const bundle = createDefaultMissionBundle({
    missionId: 'msn-roundtrip-1',
    regionId: 'reg-gale',
    activePage: 'route-planner',
  })
  bundle.name = 'Gale Reconnaissance Traverse'

  const saved = saveMissionDraft(bundle, storage)
  assert.equal(saved.ok, true)
  assert.equal(saved.skippedUnchanged, false)
  assert.ok(saved.serialized)

  // Redundant identical write is skipped.
  const skipped = saveMissionDraft(bundle, storage, saved.serialized ?? null)
  assert.equal(skipped.ok, true)
  assert.equal(skipped.skippedUnchanged, true)
  assert.equal(storage.setCalls, 1)

  const loaded = loadMissionDraftResult(storage)
  assert.equal(loaded.status, 'restored')
  assert.equal(loaded.bundle?.missionId, 'msn-roundtrip-1')
  assert.equal(loaded.bundle?.name, 'Gale Reconnaissance Traverse')
  assert.equal(loaded.bundle?.geographic.regionId, 'reg-gale')
})

test('loadMissionDraftResult distinguishes missing, malformed JSON, and unsupported version without overwriting storage', () => {
  const emptyStorage = new MemoryStorage()
  assert.equal(loadMissionDraftResult(emptyStorage).status, 'missing')

  const corruptStorage = new MemoryStorage()
  const corruptPayload = '{bad-json'
  corruptStorage.seedRaw(corruptPayload)
  const corruptRes = loadMissionDraftResult(corruptStorage)
  assert.equal(corruptRes.status, 'malformed_json')
  assert.equal(corruptRes.bundle, null)
  assert.equal(corruptStorage.getItem(DRAFT_STORAGE_KEY), corruptPayload)

  const futureStorage = new MemoryStorage()
  const futurePayload = JSON.stringify({
    schemaVersion: '99.0',
    missionId: 'msn-future',
    extraField: 'preserve-me',
  })
  futureStorage.seedRaw(futurePayload)
  const futureRes = loadMissionDraftResult(futureStorage)
  assert.equal(futureRes.status, 'unsupported_version')
  assert.equal(futureRes.bundle, null)
  assert.equal(futureStorage.getItem(DRAFT_STORAGE_KEY), futurePayload)
})

test('loadMissionDraftResult reports id_mismatch when requested missionId differs from stored draft', () => {
  const storage = new MemoryStorage()
  const stored = createDefaultMissionBundle({ missionId: 'msn-existing' })
  saveMissionDraft(stored, storage)

  const mismatch = loadMissionDraftResult(storage, 'msn-other')
  assert.equal(mismatch.status, 'id_mismatch')
  assert.equal(mismatch.bundle, null)
  // Saved draft remains intact.
  assert.equal(loadMissionDraftResult(storage, 'msn-existing').status, 'restored')
})

test('storage errors and oversized drafts fail gracefully without throwing', () => {
  const throwingStorage: StorageLike = {
    getItem() {
      throw new Error('SecurityError: storage disabled')
    },
    setItem() {
      throw new Error('QuotaExceededError')
    },
    removeItem() {
      throw new Error('SecurityError')
    },
  }

  const readErr = loadMissionDraftResult(throwingStorage)
  assert.equal(readErr.status, 'storage_error')
  assert.match(readErr.message ?? '', /SecurityError/)

  const bundle = createDefaultMissionBundle({ missionId: 'msn-err' })
  const writeErr = saveMissionDraft(bundle, throwingStorage)
  assert.equal(writeErr.ok, false)
  assert.match(writeErr.error ?? '', /QuotaExceededError/)

  assert.equal(clearMissionDraft(throwingStorage), false)

  // Oversized guard
  const storage = new MemoryStorage()
  bundle.name = 'X'.repeat(MAX_DRAFT_BYTES + 100)
  const oversized = saveMissionDraft(bundle, storage)
  assert.equal(oversized.ok, false)
  assert.match(oversized.error ?? '', /compact draft limit/)
})

