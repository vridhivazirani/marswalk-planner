import type { RegionMetadata } from '../api/regions.ts'
import type { EpistemicClassTag, PageId } from '../types/mission.ts'

export interface RegionDatasetSummary {
  productId: string
  label: string
  resolution: string
  storageType: 'VERIFIED_LOCAL' | 'VERIFIED_REMOTE'
  epistemicClass: EpistemicClassTag
}

export interface RegionCapabilityProfile {
  regionId: string
  displayName: string
  canonicalFeatureName: string
  capabilityTier: 'LOCAL_DIGITAL_TWIN' | 'REGIONAL_ORBITAL_CONTEXT' | 'UNKNOWN_REGION'
  capabilityBadge: string
  supportsGlobalExploration: boolean
  supportsRegionalDossier: boolean
  supportsLocalDigitalTwin: boolean
  supportsMultiResTerrain: boolean
  supportsHazardInspection: boolean
  supportsScienceTargetSelection: boolean
  supportsEvaRouting: boolean
  localTwinPageId: PageId | null
  studyBounds: [[number, number], [number, number]] | null
  primaryResolutionSummary: string
  availableDataSummary: string
  limitations: string[]
  datasets: RegionDatasetSummary[]
}

const DEFAULT_ORBITAL_LIMITATIONS: string[] = [
  'Only global MOLA MEGDR (14.818 km/px, 4 ppd) and registered regional reference datasets are available.',
  'No local 1.0 m HiRISE or 20 m CTX ARD terrain, slope, hazard, or costmap rasters have been ingested for this region.',
  'Local Digital Twin, pixel-level hazard inspection, and EVA route optimization are disabled to avoid misapplying Jezero data.',
]

const REGION_CAPABILITY_ENTRIES: Record<string, RegionCapabilityProfile> = {
  'reg-jezero': {
    regionId: 'reg-jezero',
    displayName: 'Jezero Crater (Western Basin & River Delta)',
    canonicalFeatureName: 'Jezero Crater',
    capabilityTier: 'LOCAL_DIGITAL_TWIN',
    capabilityBadge: 'HIGH-RES DIGITAL TWIN READY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: true,
    supportsMultiResTerrain: true,
    supportsHazardInspection: true,
    supportsScienceTargetSelection: true,
    supportsEvaRouting: true,
    localTwinPageId: 'digital-twin',
    studyBounds: [
      [18.211, 77.1605],
      [18.7212, 77.6992],
    ],
    primaryResolutionSummary: '1.0 m HiRISE DTM + 20.0 m CTX DTM / 6.0 m CTX Ortho',
    availableDataSummary:
      'Local 20 m & 1 m ARD rasters, native hazard fusion, uncalibrated reliability indices, ranked delta science targets, and EVA graph routing.',
    limitations: [
      'Authoritative Digital Twin coverage applies strictly inside the Jezero Western Fan & Delta study footprint; exterior coordinates fail closed as OUT_OF_BOUNDS / UNKNOWN.',
      'HiRISE 1 m coverage (~76.8% of grid) resolves metre-scale boulders/scarps; CTX 20 m-only sectors carry UNRESOLVED_RESOLUTION_HAZARD flags.',
    ],
    datasets: [
      {
        productId: 'PLN-SRC-08',
        label: 'HiRISE 1.0 m Local DTM',
        resolution: '1.0 m/px',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'DERIVED',
      },
      {
        productId: 'PLN-SRC-06',
        label: 'CTX 20.0 m Regional DTM',
        resolution: '20.0 m/px',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'DERIVED',
      },
      {
        productId: 'PLN-SRC-05',
        label: 'CTX 6.0 m Orthorectified Mosaic',
        resolution: '6.0 m/px',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
      {
        productId: 'PLN-INT-02',
        label: 'USGS Jezero Photogeologic Map',
        resolution: '1:75,000 Scale Vector',
        storageType: 'VERIFIED_REMOTE',
        epistemicClass: 'INTERPRETED',
      },
    ],
  },
  'reg-gale': {
    regionId: 'reg-gale',
    displayName: 'Gale Crater (Mount Sharp & Aeolis Palus)',
    canonicalFeatureName: 'Gale Crater',
    capabilityTier: 'REGIONAL_ORBITAL_CONTEXT',
    capabilityBadge: 'ORBITAL / REGIONAL CONTEXT ONLY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: [
      [-6.8, 136.0],
      [-4.0, 139.0],
    ],
    primaryResolutionSummary: '14.818 km/px MOLA (4 ppd) + USGS 1:100k Map Reference',
    availableDataSummary:
      'Regional geological dossier, Curiosity landing context, MOLA topography bounds, and registered dataset provenance.',
    limitations: DEFAULT_ORBITAL_LIMITATIONS,
    datasets: [
      {
        productId: 'PLN-SRC-01',
        label: 'MOLA MEGDR Global Topography',
        resolution: '14.818 km/px (4 ppd)',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
      {
        productId: 'PLN-INT-01',
        label: 'USGS Gale Mount Sharp Stratigraphic Map',
        resolution: '1:100,000 Scale',
        storageType: 'VERIFIED_REMOTE',
        epistemicClass: 'INTERPRETED',
      },
    ],
  },
  'reg-valles-marineris': {
    regionId: 'reg-valles-marineris',
    displayName: 'Valles Marineris (Chasma Canyon System)',
    canonicalFeatureName: 'Valles Marineris',
    capabilityTier: 'REGIONAL_ORBITAL_CONTEXT',
    capabilityBadge: 'ORBITAL / REGIONAL CONTEXT ONLY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: [
      [-22.0, -85.0],
      [-5.0, -35.0],
    ],
    primaryResolutionSummary: '14.818 km/px MOLA (4 ppd) + 231 m/px THEMIS Day IR Reference',
    availableDataSummary:
      'Regional tectonic/canyon metadata dossier, areoid elevation span, and registered orbital dataset provenance.',
    limitations: DEFAULT_ORBITAL_LIMITATIONS,
    datasets: [
      {
        productId: 'PLN-SRC-01',
        label: 'MOLA MEGDR Global Topography',
        resolution: '14.818 km/px (4 ppd)',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
      {
        productId: 'PLN-SRC-03',
        label: 'THEMIS Daytime IR Global Mosaic',
        resolution: '231 m/px',
        storageType: 'VERIFIED_REMOTE',
        epistemicClass: 'OBSERVED',
      },
    ],
  },
  'reg-olympus-mons': {
    regionId: 'reg-olympus-mons',
    displayName: 'Olympus Mons (Shield Volcano & Caldera)',
    canonicalFeatureName: 'Olympus Mons',
    capabilityTier: 'REGIONAL_ORBITAL_CONTEXT',
    capabilityBadge: 'ORBITAL / REGIONAL CONTEXT ONLY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: [
      [13.0, -141.0],
      [24.0, -126.0],
    ],
    primaryResolutionSummary: '14.818 km/px MOLA (4 ppd) Global Topography',
    availableDataSummary: 'Regional volcanic shield dossier and global MOLA orbital context.',
    limitations: DEFAULT_ORBITAL_LIMITATIONS,
    datasets: [
      {
        productId: 'PLN-SRC-01',
        label: 'MOLA MEGDR Global Topography',
        resolution: '14.818 km/px (4 ppd)',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
    ],
  },
  'reg-tharsis': {
    regionId: 'reg-tharsis',
    displayName: 'Tharsis Volcanic Region (Tharsis Rise & Montes)',
    canonicalFeatureName: 'Tharsis Montes',
    capabilityTier: 'REGIONAL_ORBITAL_CONTEXT',
    capabilityBadge: 'ORBITAL / REGIONAL CONTEXT ONLY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: [
      [-15.0, -130.0],
      [18.0, -90.0],
    ],
    primaryResolutionSummary: '14.818 km/px MOLA (4 ppd) Global Topography',
    availableDataSummary: 'Regional volcanic province dossier and global MOLA orbital context.',
    limitations: DEFAULT_ORBITAL_LIMITATIONS,
    datasets: [
      {
        productId: 'PLN-SRC-01',
        label: 'MOLA MEGDR Global Topography',
        resolution: '14.818 km/px (4 ppd)',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
    ],
  },
  'reg-hellas': {
    regionId: 'reg-hellas',
    displayName: 'Hellas Planitia (Giant Impact Basin)',
    canonicalFeatureName: 'Hellas Planitia',
    capabilityTier: 'REGIONAL_ORBITAL_CONTEXT',
    capabilityBadge: 'ORBITAL / REGIONAL CONTEXT ONLY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: [
      [-52.0, 50.0],
      [-30.0, 90.0],
    ],
    primaryResolutionSummary: '14.818 km/px MOLA (4 ppd) Global Topography',
    availableDataSummary: 'Regional impact basin dossier and global MOLA orbital context.',
    limitations: DEFAULT_ORBITAL_LIMITATIONS,
    datasets: [
      {
        productId: 'PLN-SRC-01',
        label: 'MOLA MEGDR Global Topography',
        resolution: '14.818 km/px (4 ppd)',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
    ],
  },
  'reg-utopia': {
    regionId: 'reg-utopia',
    displayName: 'Utopia Planitia (Northern Lowlands & Tianwen-1)',
    canonicalFeatureName: 'Utopia Planitia',
    capabilityTier: 'REGIONAL_ORBITAL_CONTEXT',
    capabilityBadge: 'ORBITAL / REGIONAL CONTEXT ONLY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: [
      [20.0, 95.0],
      [55.0, 140.0],
    ],
    primaryResolutionSummary: '14.818 km/px MOLA (4 ppd) Global Topography',
    availableDataSummary:
      'Regional northern lowlands dossier (Viking 2 & Zhurong context) and global MOLA orbital context.',
    limitations: DEFAULT_ORBITAL_LIMITATIONS,
    datasets: [
      {
        productId: 'PLN-SRC-01',
        label: 'MOLA MEGDR Global Topography',
        resolution: '14.818 km/px (4 ppd)',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
    ],
  },
  'reg-elysium': {
    regionId: 'reg-elysium',
    displayName: 'Elysium Planitia (Young Volcanic Plains & InSight)',
    canonicalFeatureName: 'Elysium Planitia',
    capabilityTier: 'REGIONAL_ORBITAL_CONTEXT',
    capabilityBadge: 'ORBITAL / REGIONAL CONTEXT ONLY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: [
      [-2.0, 130.0],
      [12.0, 170.0],
    ],
    primaryResolutionSummary: '14.818 km/px MOLA (4 ppd) Global Topography',
    availableDataSummary:
      'Regional volcanic plains dossier (InSight landing site) and global MOLA orbital context.',
    limitations: DEFAULT_ORBITAL_LIMITATIONS,
    datasets: [
      {
        productId: 'PLN-SRC-01',
        label: 'MOLA MEGDR Global Topography',
        resolution: '14.818 km/px (4 ppd)',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
    ],
  },
  'reg-arcadia': {
    regionId: 'reg-arcadia',
    displayName: 'Arcadia Planitia (Glacier-Rich Plains & Human Architecture)',
    canonicalFeatureName: 'Arcadia Planitia',
    capabilityTier: 'REGIONAL_ORBITAL_CONTEXT',
    capabilityBadge: 'ORBITAL / REGIONAL CONTEXT ONLY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: [
      [30.0, -180.0],
      [50.0, -150.0],
    ],
    primaryResolutionSummary: '14.818 km/px MOLA (4 ppd) Global Topography',
    availableDataSummary: 'Regional ice-plains dossier and global MOLA orbital context.',
    limitations: DEFAULT_ORBITAL_LIMITATIONS,
    datasets: [
      {
        productId: 'PLN-SRC-01',
        label: 'MOLA MEGDR Global Topography',
        resolution: '14.818 km/px (4 ppd)',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
    ],
  },
  'reg-gusev': {
    regionId: 'reg-gusev',
    displayName: 'Gusev Crater (Columbia Hills & MER Spirit)',
    canonicalFeatureName: 'Gusev Crater',
    capabilityTier: 'REGIONAL_ORBITAL_CONTEXT',
    capabilityBadge: 'ORBITAL / REGIONAL CONTEXT ONLY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: [
      [-16.0, 174.0],
      [-13.0, 177.0],
    ],
    primaryResolutionSummary: '14.818 km/px MOLA (4 ppd) Global Topography',
    availableDataSummary:
      'Regional crater dossier (MER-A Spirit Columbia Hills context) and global MOLA orbital context.',
    limitations: DEFAULT_ORBITAL_LIMITATIONS,
    datasets: [
      {
        productId: 'PLN-SRC-01',
        label: 'MOLA MEGDR Global Topography',
        resolution: '14.818 km/px (4 ppd)',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
    ],
  },
  'reg-north-polar': {
    regionId: 'reg-north-polar',
    displayName: 'North Polar Region (Planum Boreum & Polar Troughs)',
    canonicalFeatureName: 'Planum Boreum',
    capabilityTier: 'REGIONAL_ORBITAL_CONTEXT',
    capabilityBadge: 'ORBITAL / REGIONAL CONTEXT ONLY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: [
      [75.0, -180.0],
      [90.0, 180.0],
    ],
    primaryResolutionSummary: '14.818 km/px MOLA (4 ppd) Global Topography',
    availableDataSummary:
      'Regional north polar layered deposits dossier (Phoenix context) and MOLA orbital context.',
    limitations: DEFAULT_ORBITAL_LIMITATIONS,
    datasets: [
      {
        productId: 'PLN-SRC-01',
        label: 'MOLA MEGDR Global Topography',
        resolution: '14.818 km/px (4 ppd)',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
    ],
  },
  'reg-south-polar': {
    regionId: 'reg-south-polar',
    displayName: 'South Polar Region (Planum Australe & SPRC)',
    canonicalFeatureName: 'Planum Australe',
    capabilityTier: 'REGIONAL_ORBITAL_CONTEXT',
    capabilityBadge: 'ORBITAL / REGIONAL CONTEXT ONLY',
    supportsGlobalExploration: true,
    supportsRegionalDossier: true,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: [
      [-90.0, -180.0],
      [-75.0, 180.0],
    ],
    primaryResolutionSummary: '14.818 km/px MOLA (4 ppd) Global Topography',
    availableDataSummary: 'Regional south polar layered deposits dossier and MOLA orbital context.',
    limitations: DEFAULT_ORBITAL_LIMITATIONS,
    datasets: [
      {
        productId: 'PLN-SRC-01',
        label: 'MOLA MEGDR Global Topography',
        resolution: '14.818 km/px (4 ppd)',
        storageType: 'VERIFIED_LOCAL',
        epistemicClass: 'OBSERVED',
      },
    ],
  },
}

const VALID_EPISTEMIC_TAGS = new Set<EpistemicClassTag>([
  'OBSERVED',
  'DERIVED',
  'INTERPRETED',
  'PREDICTED',
  'HEURISTIC',
  'SIMULATED',
  'UNKNOWN',
])

function toEpistemicTag(value: string | undefined): EpistemicClassTag {
  const upper = (value ?? '').toUpperCase() as EpistemicClassTag
  return VALID_EPISTEMIC_TAGS.has(upper) ? upper : 'UNKNOWN'
}

export function getRegionCapabilityProfile(
  regionId: string,
  dossier?: RegionMetadata | null,
): RegionCapabilityProfile {
  const base = REGION_CAPABILITY_ENTRIES[regionId]
  if (dossier && dossier.id === regionId) {
    const supportsTwin = Boolean(dossier.has_local_digital_twin && regionId === 'reg-jezero')
    return {
      regionId: dossier.id,
      displayName: dossier.name,
      canonicalFeatureName: dossier.canonical_feature_name,
      capabilityTier: supportsTwin ? 'LOCAL_DIGITAL_TWIN' : 'REGIONAL_ORBITAL_CONTEXT',
      capabilityBadge: supportsTwin
        ? 'HIGH-RES DIGITAL TWIN READY'
        : 'ORBITAL / REGIONAL CONTEXT ONLY',
      supportsGlobalExploration: true,
      supportsRegionalDossier: true,
      supportsLocalDigitalTwin: supportsTwin,
      supportsMultiResTerrain: supportsTwin,
      supportsHazardInspection: supportsTwin,
      supportsScienceTargetSelection: supportsTwin,
      supportsEvaRouting: supportsTwin,
      localTwinPageId: supportsTwin ? 'digital-twin' : null,
      studyBounds: [
        [dossier.bounds.lat_min, dossier.bounds.lon_min],
        [dossier.bounds.lat_max, dossier.bounds.lon_max],
      ],
      primaryResolutionSummary:
        base?.primaryResolutionSummary ??
        (dossier.available_datasets.map((d) => `${d.resolution} (${d.product_id})`).join(' • ') ||
          'No registered local raster datasets'),
      availableDataSummary:
        base?.availableDataSummary ??
        `${dossier.available_datasets.length} registered orbital/regional datasets covering ${dossier.canonical_feature_name}.`,
      limitations: supportsTwin
        ? (base?.limitations ?? [])
        : DEFAULT_ORBITAL_LIMITATIONS,
      datasets: dossier.available_datasets.map((ds) => ({
        productId: ds.product_id,
        label: ds.name,
        resolution: ds.resolution,
        storageType: ds.storage_type,
        epistemicClass: toEpistemicTag(ds.epistemic_class),
      })),
    }
  }

  if (base) return base

  return {
    regionId,
    displayName: regionId,
    canonicalFeatureName: regionId,
    capabilityTier: 'UNKNOWN_REGION',
    capabilityBadge: 'UNREGISTERED REGION (UNKNOWN)',
    supportsGlobalExploration: true,
    supportsRegionalDossier: false,
    supportsLocalDigitalTwin: false,
    supportsMultiResTerrain: false,
    supportsHazardInspection: false,
    supportsScienceTargetSelection: false,
    supportsEvaRouting: false,
    localTwinPageId: null,
    studyBounds: null,
    primaryResolutionSummary: 'Unknown — region not registered in local planetary catalog',
    availableDataSummary: 'No verified datasets confirmed for this identifier.',
    limitations: [
      'Unregistered region ID. Local terrain, hazard, and EVA routing features remain disabled (fail-closed policy).',
    ],
    datasets: [],
  }
}

export function canUseLocalDigitalTwin(
  regionId: string,
  dossier?: RegionMetadata | null,
): boolean {
  return getRegionCapabilityProfile(regionId, dossier).supportsLocalDigitalTwin
}

export function listAllRegionCapabilities(): RegionCapabilityProfile[] {
  return Object.values(REGION_CAPABILITY_ENTRIES)
}

export interface RegionCompatibilityCheck {
  compatible: boolean
  reason: string | null
}

function isCoordInsideBounds(
  lat: number,
  lon: number,
  bounds: [[number, number], [number, number]],
): boolean {
  const [[minLat, minLon], [maxLat, maxLon]] = bounds
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon
}

/**
 * Single authoritative compatibility check for assigning a science target or sortie waypoint
 * as an active EVA destination or route stop in `activeRegionId`.
 */
export function isTargetCompatibleWithRegion(
  targetOrWaypoint: { regionId?: string | null; lat: number; lon: number },
  activeRegionId: string,
  dossier?: RegionMetadata | null,
): RegionCompatibilityCheck {
  const caps = getRegionCapabilityProfile(activeRegionId, dossier)
  if (!caps.supportsEvaRouting) {
    return {
      compatible: false,
      reason: `EVA destination assignment and routing are unavailable in ${caps.displayName} (${activeRegionId}); authoritative EVA routing rasters exist only for Jezero Crater (reg-jezero).`,
    }
  }
  const srcRegion = targetOrWaypoint.regionId?.trim()
  if (srcRegion && srcRegion !== 'all' && srcRegion !== activeRegionId) {
    return {
      compatible: false,
      reason: `Target originates from ${srcRegion} and cannot be assigned as an active EVA destination in ${caps.displayName} (${activeRegionId}).`,
    }
  }
  if (
    caps.studyBounds &&
    !isCoordInsideBounds(targetOrWaypoint.lat, targetOrWaypoint.lon, caps.studyBounds)
  ) {
    return {
      compatible: false,
      reason: `Target coordinate (${targetOrWaypoint.lat.toFixed(4)}°, ${targetOrWaypoint.lon.toFixed(4)}°) lies outside the ${caps.canonicalFeatureName} (${activeRegionId}) study footprint.`,
    }
  }
  return { compatible: true, reason: null }
}

/**
 * Evaluate whether the currently persisted EVA configuration (baseCamp, destination, waypoints)
 * is compatible with `activeRegionId` for route computation or human EVA simulation.
 */
export function evaluateEvaConfigCompatibility(params: {
  activeRegionId: string
  baseCamp: { lat: number; lon: number } | null
  destination: { lat: number; lon: number } | null
  waypoints?: ReadonlyArray<{ regionId?: string | null; lat: number; lon: number; name?: string }>
  dossier?: RegionMetadata | null
}): RegionCompatibilityCheck {
  const caps = getRegionCapabilityProfile(params.activeRegionId, params.dossier)
  if (!caps.supportsEvaRouting) {
    return {
      compatible: false,
      reason: `Active region ${caps.displayName} (${params.activeRegionId}) does not support EVA routing or simulation. Preserved Jezero coordinates and waypoints remain historical records until you return to Jezero Crater (reg-jezero).`,
    }
  }
  if (
    params.baseCamp &&
    caps.studyBounds &&
    !isCoordInsideBounds(params.baseCamp.lat, params.baseCamp.lon, caps.studyBounds)
  ) {
    return {
      compatible: false,
      reason: `Active Base Camp (${params.baseCamp.lat.toFixed(4)}°, ${params.baseCamp.lon.toFixed(4)}°) lies outside the ${caps.canonicalFeatureName} (${params.activeRegionId}) study bounds.`,
    }
  }
  if (
    params.destination &&
    caps.studyBounds &&
    !isCoordInsideBounds(params.destination.lat, params.destination.lon, caps.studyBounds)
  ) {
    return {
      compatible: false,
      reason: `Active Destination (${params.destination.lat.toFixed(4)}°, ${params.destination.lon.toFixed(4)}°) lies outside the ${caps.canonicalFeatureName} (${params.activeRegionId}) study bounds.`,
    }
  }
  if (params.waypoints && params.waypoints.length > 0) {
    for (const wp of params.waypoints) {
      const check = isTargetCompatibleWithRegion(wp, params.activeRegionId, params.dossier)
      if (!check.compatible) {
        return {
          compatible: false,
          reason:
            check.reason ??
            `Sortie waypoint ${wp.name ?? ''} is incompatible with ${params.activeRegionId}.`,
        }
      }
    }
  }
  return { compatible: true, reason: null }
}


