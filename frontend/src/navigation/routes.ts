import type { ExplorerTabId, PageId } from '../types/mission.ts'

export type NavSectionTitle =
  | 'PRIMARY EXPERIENCES'
  | 'SCIENTIFIC INTELLIGENCE'
  | 'TRAVERSAL & CONTINGENCY'
  | 'OPERATIONS & SYSTEMS'

export interface ExperienceRouteMeta {
  id: PageId
  title: string
  navLabel: string
  icon: string
  section: NavSectionTitle
  staticBadge?: string
}

/** Single authoritative registry mapping PageId values to navigation sections and titles. */
export const EXPERIENCE_ROUTES: readonly ExperienceRouteMeta[] = [
  {
    id: 'overview',
    title: 'Mission Overview',
    navLabel: 'Mission Overview',
    icon: '🌐',
    section: 'PRIMARY EXPERIENCES',
  },
  {
    id: 'map-explorer',
    title: 'Planetary Explorer',
    navLabel: '01 · Mars Explorer',
    icon: '🗺️',
    section: 'PRIMARY EXPERIENCES',
    staticBadge: '01',
  },
  {
    id: 'digital-twin',
    title: 'Mars Digital Twin',
    navLabel: '02 · Jezero Twin',
    icon: '🪐',
    section: 'PRIMARY EXPERIENCES',
    staticBadge: '02',
  },
  {
    id: 'route-planner',
    title: 'EVA Route Optimization Planner',
    navLabel: '03 · EVA Planner',
    icon: '🧭',
    section: 'PRIMARY EXPERIENCES',
    staticBadge: '03',
  },
  {
    id: 'simulation',
    title: 'EVA Mission Simulation & Operations',
    navLabel: '04 · Mission Control',
    icon: '🧑‍🚀',
    section: 'PRIMARY EXPERIENCES',
    staticBadge: '04',
  },
  {
    id: 'science',
    title: 'Scientific Opportunity Explorer',
    navLabel: 'Science Explorer',
    icon: '🔬',
    section: 'SCIENTIFIC INTELLIGENCE',
    staticBadge: '6',
  },
  {
    id: 'geology',
    title: 'Geology & Mineralogy Subsystem (CRISM & USGS)',
    navLabel: 'Geology & Mineralogy',
    icon: '💎',
    section: 'SCIENTIFIC INTELLIGENCE',
    staticBadge: 'CRISM',
  },
  {
    id: 'terrain',
    title: 'Terrain Intelligence Engine',
    navLabel: 'Terrain Intelligence',
    icon: '⛰️',
    section: 'SCIENTIFIC INTELLIGENCE',
  },
  {
    id: 'hazards',
    title: 'Hazard Intelligence Assessment',
    navLabel: 'Hazard Assessment',
    icon: '⚠️',
    section: 'SCIENTIFIC INTELLIGENCE',
  },
  {
    id: 'data-hub',
    title: 'NASA Planetary Data Hub',
    navLabel: 'NASA Data Hub',
    icon: '🛰️',
    section: 'SCIENTIFIC INTELLIGENCE',
    staticBadge: '37',
  },
  {
    id: 'route-comparison',
    title: 'Multi-Objective Route Comparison',
    navLabel: 'Route Comparison',
    icon: '⚖️',
    section: 'TRAVERSAL & CONTINGENCY',
  },
  {
    id: 'emergency',
    title: 'Emergency Response & Dynamic Rerouting',
    navLabel: 'Emergency Operations',
    icon: '🚨',
    section: 'TRAVERSAL & CONTINGENCY',
  },
  {
    id: 'reports',
    title: 'Mission Briefing & Telemetry Reports',
    navLabel: 'Mission Reports',
    icon: '📋',
    section: 'OPERATIONS & SYSTEMS',
  },
  {
    id: 'settings',
    title: 'System Settings & Planetary Geodesy',
    navLabel: 'System Settings',
    icon: '⚙️',
    section: 'OPERATIONS & SYSTEMS',
  },
] as const

export const NAV_SECTION_ORDER: readonly NavSectionTitle[] = [
  'PRIMARY EXPERIENCES',
  'SCIENTIFIC INTELLIGENCE',
  'TRAVERSAL & CONTINGENCY',
  'OPERATIONS & SYSTEMS',
] as const

const PAGE_BY_ID: Record<PageId, ExperienceRouteMeta> = EXPERIENCE_ROUTES.reduce(
  (acc, route) => {
    acc[route.id] = route
    return acc
  },
  {} as Record<PageId, ExperienceRouteMeta>,
)

const PAGE_ALIASES: Record<string, PageId> = {
  explorer: 'map-explorer',
  twin: 'digital-twin',
  planner: 'route-planner',
  comparison: 'route-comparison',
}

export const EXPLORER_TABS: readonly ExplorerTabId[] = [
  'MARS_EXPLORER',
  'MARS_MONOCHROME',
  'GLOBAL_GLOBE',
  'GLOBAL_MAP',
  'REGIONAL_MAP',
  'CATALOGUE',
] as const

/** Canonical Martian priority region registry IDs mirroring backend region_registry.py. */
export const KNOWN_REGION_IDS: readonly string[] = [
  'reg-jezero',
  'reg-gale',
  'reg-valles-marineris',
  'reg-olympus-mons',
  'reg-tharsis',
  'reg-hellas',
  'reg-utopia',
  'reg-elysium',
  'reg-arcadia',
  'reg-gusev',
  'reg-north-polar',
  'reg-south-polar',
] as const

export const REGION_DISPLAY_NAMES: Record<string, string> = {
  'reg-jezero': 'JEZERO CRATER • MARS',
  'reg-gale': 'GALE CRATER • MARS',
  'reg-valles-marineris': 'VALLES MARINERIS • MARS',
  'reg-olympus-mons': 'OLYMPUS MONS • MARS',
  'reg-tharsis': 'THARSIS RISE • MARS',
  'reg-hellas': 'HELLAS PLANITIA • MARS',
  'reg-utopia': 'UTOPIA PLANITIA • MARS',
  'reg-elysium': 'ELYSIUM PLANITIA • MARS',
  'reg-arcadia': 'ARCADIA PLANITIA • MARS',
  'reg-gusev': 'GUSEV CRATER • MARS',
  'reg-north-polar': 'NORTH POLAR • MARS',
  'reg-south-polar': 'SOUTH POLAR • MARS',
}

export const DEFAULT_PAGE_ID: PageId = 'overview'
export const DEFAULT_REGION_ID = 'reg-jezero'

export function isValidPageId(value: string | null | undefined): value is PageId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(PAGE_BY_ID, value))
}

export function resolvePageId(raw: string | null | undefined): PageId | null {
  if (!raw) return null
  const normalized = raw.trim().toLowerCase()
  if (isValidPageId(normalized)) return normalized
  return PAGE_ALIASES[normalized] ?? null
}

export function getPageTitle(pageId: PageId): string {
  return PAGE_BY_ID[pageId].title
}

export function isValidRegionId(
  raw: string | null | undefined,
  knownRegions: readonly string[] = KNOWN_REGION_IDS,
): raw is string {
  if (!raw) return false
  return knownRegions.includes(raw.trim())
}

export function resolveRegionId(
  raw: string | null | undefined,
  knownRegions: readonly string[] = KNOWN_REGION_IDS,
): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  return isValidRegionId(trimmed, knownRegions) ? trimmed : null
}

export function getRegionBadgeLabel(regionId: string, overrideName?: string | null): string {
  if (overrideName && overrideName.trim()) {
    return `${overrideName.trim().toUpperCase()} • MARS`
  }
  return REGION_DISPLAY_NAMES[regionId] ?? `${regionId.toUpperCase()} • MARS`
}

export interface ParsedMissionUrl {
  page: PageId | null
  region: string | null
  missionId: string | null
}

/**
 * Parse query parameters (?page=&region=&mission=) and legacy hash (#page)
 * using the single authoritative EXPERIENCE_ROUTES mapping.
 */
export function parseMissionUrl(
  search: string,
  hash: string = '',
  knownRegions: readonly string[] = KNOWN_REGION_IDS,
): ParsedMissionUrl {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const rawPage = params.get('page')
  const rawHash = hash.replace(/^#\/?/, '')

  const page = resolvePageId(rawPage) ?? resolvePageId(rawHash)
  const region = resolveRegionId(params.get('region'), knownRegions)
  const rawMission = params.get('mission')?.trim() ?? ''
  const missionId = rawMission.length > 0 ? rawMission : null

  return { page, region, missionId }
}

export function normalizeUrlEastLon(lon: number): number {
  if (!Number.isFinite(lon)) return Number.NaN
  if (lon >= -180 && lon < 180) {
    return Object.is(lon, -0) ? 0 : lon
  }
  let wrapped = lon % 360
  if (wrapped >= 180) wrapped -= 360
  if (wrapped < -180) wrapped += 360
  return Object.is(wrapped, -0) ? 0 : wrapped
}

export interface ParsedUrlCoordinate {
  lat: number
  lon: number
}

/**
 * Parse optional ?lat=&lon= deep-link coordinates, normalizing east-positive
 * longitude into canonical [-180, 180). Returns null if absent or invalid.
 */
export function parseUrlCoordinate(search: string): ParsedUrlCoordinate | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const rawLat = params.get('lat')
  const rawLon = params.get('lon')
  if (rawLat === null || rawLon === null || rawLat.trim() === '' || rawLon.trim() === '') {
    return null
  }
  const lat = Number(rawLat)
  const lon = Number(rawLon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) {
    return null
  }
  return {
    lat,
    lon: normalizeUrlEastLon(lon),
  }
}

export function buildMissionUrl(params: {
  page: PageId
  region: string
  missionId?: string | null
  coordinate?: ParsedUrlCoordinate | null
}): string {
  const sp = new URLSearchParams()
  sp.set('page', params.page)
  sp.set('region', params.region)
  if (params.missionId) {
    sp.set('mission', params.missionId)
  }
  if (
    params.coordinate &&
    Number.isFinite(params.coordinate.lat) &&
    Number.isFinite(params.coordinate.lon) &&
    params.coordinate.lat >= -90 &&
    params.coordinate.lat <= 90
  ) {
    sp.set('lat', String(params.coordinate.lat))
    sp.set('lon', String(normalizeUrlEastLon(params.coordinate.lon)))
  }
  return `/?${sp.toString()}`
}

