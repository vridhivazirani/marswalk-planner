/**
 * NASA and International Planetary Data Hub catalog definitions.
 * Sourced directly from official dossiers in docs/data_sources.md.
 */

export interface PlanetaryDatasetProduct {
  id: string
  title: string
  agency: string
  instrument: string
  doiOrUrn: string
  resolution: string
  coverage: string
  crs: string
  verticalDatum: string
  fileFormat: string
  decision: 'ACCEPT' | 'ACCEPT_WITH_CAVEATS' | 'REJECT'
  role: string
  caveats: string
  officialUrl: string
  isIngested: boolean
  epistemic_class?: string
  epistemicClass?: string
  storageCategory?:
    | 'LOCAL_RAW'
    | 'LOCAL_DERIVED'
    | 'REMOTE_CACHED_PROXY'
    | 'STATIC_METADATA'
    | 'MODEL_SIMULATED'
  dataOrigin?: string
  temporalCoverage?: string
  availabilityStatus?: string
  supportsRegions?: string[]
  supportsLayers?: string[]
  supportsGeology?: boolean
  supportsScienceTargets?: boolean
}

export const AUTHENTIC_PLANETARY_DATASETS: PlanetaryDatasetProduct[] = [
  {
    id: 'product-01',
    title: 'USGS Mars 2020 TRN HiRISE DTM Mosaic',
    agency: 'USGS Astrogeology / NASA JPL',
    instrument: 'High Resolution Imaging Science Experiment (HiRISE)',
    doiOrUrn: '10.5066/P9REJ9JN',
    resolution: '1.0 m/pixel',
    coverage: 'Jezero Western Fan & Delta (18.15°N to 18.65°N, 77.20°E to 77.65°E)',
    crs: 'Equirectangular (IAU Mars 2015 Sphere, R = 3,396,190 m)',
    verticalDatum: 'Mars Areoid (MOLA Equipotential Zero)',
    fileFormat: 'Cloud-Optimized GeoTIFF / ISIS3 Cube',
    decision: 'ACCEPT',
    role: 'Primary High-Resolution Topography (Slopes, TRI, Boulders, Hard Limits)',
    caveats: 'Stereo HiRISE coverage footprints have narrow margins; deep shadow areas contain stereo decorrelation artifacts. Epistemically DERIVED via SOCET SET stereo photogrammetry from observed HiRISE image pairs (stored locally as unmodified USGS archive GeoTIFF in data/raw/usgs_trn/).',
    officialUrl: 'https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/HiRISE_DTM_Mosaic',
    isIngested: true,
    epistemicClass: 'DERIVED',
    storageCategory: 'LOCAL_RAW',
    temporalCoverage: '2020 Mars 2020 TRN release (multi-orbit MRO HiRISE stereo pairs)',
    availabilityStatus: 'Ingested locally (data/raw/usgs_trn/HiRISE_DTM_Delta_Jezero_DL_1m.tif)',
    supportsRegions: ['reg-jezero'],
    supportsLayers: ['elevation', 'slope', 'hazards', 'costmap'],
    supportsGeology: false,
    supportsScienceTargets: true,
  },
  {
    id: 'product-02',
    title: 'USGS Mars 2020 TRN HiRISE Orthorectified Image Mosaic',
    agency: 'USGS Astrogeology / NASA JPL',
    instrument: 'HiRISE Visual Radiance (RED Filter)',
    doiOrUrn: '10.5066/P9QJDP48',
    resolution: '0.25 m/pixel (25 cm/pixel)',
    coverage: 'Jezero Western Delta & Crater Floor (100% overlap with Product 1)',
    crs: 'Equirectangular (IAU Mars 2015 Sphere, IAU_2015:49900)',
    verticalDatum: 'N/A (Orthorectified Surface Reflectance)',
    fileFormat: 'GeoTIFF / JPEG2000',
    decision: 'ACCEPT',
    role: 'Primary Visual Basemap, Computer Vision Boulder Shadows, Dune Bedforms',
    caveats: 'Single-band visible reflectance; fixed solar illumination azimuth requires directional shadow handling. Full GeoTIFF not stored in data/raw/ and no local HiRISE WMTS/tile proxy is bundled.',
    officialUrl: 'https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/HiRISE_Mosaic',
    isIngested: false,
    epistemicClass: 'OBSERVED',
    storageCategory: 'STATIC_METADATA',
    temporalCoverage: '2020 Mars 2020 TRN release (MRO HiRISE RED mosaic)',
    availabilityStatus: 'Curated metadata dossier only; GeoTIFF not in data/raw/ and no HiRISE tile proxy or cache exists locally',
    supportsRegions: ['reg-jezero'],
    supportsLayers: [],
    supportsGeology: false,
    supportsScienceTargets: true,
  },
  {
    id: 'product-03',
    title: 'USGS Mars 2020 TRN Context Camera (CTX) DTM Mosaic',
    agency: 'USGS Astrogeology Science Center',
    instrument: 'Context Camera (CTX) Stereo Pairs',
    doiOrUrn: '10.5066/P906QQT8',
    resolution: '20.0 m/pixel',
    coverage: 'Full Jezero Crater Basin & Western Watershed (~60 km x 60 km)',
    crs: 'Equirectangular (IAU Mars 2015 Sphere)',
    verticalDatum: 'Mars Areoid',
    fileFormat: 'GeoTIFF / ISIS3',
    decision: 'ACCEPT',
    role: 'Regional Topography & Crater-Scale Route Cost Map Analysis',
    caveats: 'Smooths micro-topography below 20m; cannot be used alone for human footstep traversability safety. Epistemically DERIVED via SOCET SET stereo photogrammetry from observed CTX stereo pairs (stored locally as unmodified USGS archive GeoTIFF in data/raw/usgs_trn/).',
    officialUrl: 'https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/CTX_DTM_Mosaic',
    isIngested: true,
    epistemicClass: 'DERIVED',
    storageCategory: 'LOCAL_RAW',
    temporalCoverage: '2020 Mars 2020 TRN release (MRO CTX stereo pairs)',
    availabilityStatus: 'Ingested locally (data/raw/usgs_trn/JEZ_ctx_B_soc_008_DTM_20m.tif)',
    supportsRegions: ['reg-jezero'],
    supportsLayers: ['elevation', 'slope', 'hazards', 'costmap'],
    supportsGeology: false,
    supportsScienceTargets: true,
  },
  {
    id: 'product-04',
    title: 'USGS Mars 2020 TRN CTX Controlled Orthoimage Mosaic',
    agency: 'USGS Astrogeology Science Center',
    instrument: 'CTX Panchromatic Radiance (500–800 nm)',
    doiOrUrn: '10.5066/P9GV1ND3',
    resolution: '6.0 m/pixel',
    coverage: 'Jezero Crater & Regional Surrounds',
    crs: 'Equirectangular (IAU Mars 2015 Sphere)',
    verticalDatum: 'N/A',
    fileFormat: 'GeoTIFF / ISIS3',
    decision: 'ACCEPT',
    role: 'Wide-Area Visual Context & Large Geological Unit Boundary Mapping',
    caveats: 'Sub-meter boulders and narrow crevices unresolvable.',
    officialUrl: 'https://astrogeology.usgs.gov/search/map/Mars/Mars2020/TRN/CTX_Mosaic',
    isIngested: true,
    epistemicClass: 'OBSERVED',
    storageCategory: 'LOCAL_RAW',
    temporalCoverage: '2020 Mars 2020 TRN release (MRO CTX controlled orthoimage)',
    availabilityStatus: 'Ingested locally (data/raw/usgs_trn/JEZ_ctx_B_soc_008_orthoMosaic_6m.tif)',
    supportsRegions: ['reg-jezero'],
    supportsLayers: ['basemap', 'hazards'],
    supportsGeology: true,
    supportsScienceTargets: true,
  },
  {
    id: 'product-05',
    title: 'ESA Mars Express HRSC Jezero Crater DTM & Color Mosaic',
    agency: 'European Space Agency (ESA) / DLR Berlin',
    instrument: 'High Resolution Stereo Camera (HRSC)',
    doiOrUrn: 'ESA-PSA-HRSC-V1.0',
    resolution: '50.0 m/pixel DTM, 12.5 m/pixel Color',
    coverage: 'Regional Jezero Watershed & Syrtis Major Margin',
    crs: 'Sinusoidal / Equirectangular (Mars Sphere)',
    verticalDatum: 'Mars Areoid (MOLA Datum)',
    fileFormat: 'PDS3 IMG / VICAR / GeoTIFF',
    decision: 'ACCEPT_WITH_CAVEATS',
    role: 'Regional Elevation Benchmark & Multispectral Color Context',
    caveats: 'Resolution too coarse for tactical EVA safety; serves strictly as secondary regional context.',
    officialUrl: 'https://psa.esa.int/psa/#/pages/search?mission=Mars%20Express',
    isIngested: false,
    epistemicClass: 'DERIVED',
    storageCategory: 'STATIC_METADATA',
    temporalCoverage: 'Mars Express nominal mission regional archive',
    availabilityStatus: 'Dossier reference only (not ingested locally)',
    supportsRegions: ['reg-jezero'],
    supportsLayers: [],
    supportsGeology: false,
    supportsScienceTargets: false,
  },
  {
    id: 'product-06',
    title: 'NASA MGS MOLA Mission Elevation Grid (MEGDR)',
    agency: 'NASA PDS Geosciences Node / GSFC',
    instrument: 'Mars Orbiter Laser Altimeter (MOLA)',
    doiOrUrn: 'MGS-M-MOLA-5-MEGDR-L3-V1.0',
    resolution: '4 pixels/degree (14.818 km/pixel local grid MEGT90N000CB.IMG; PDS archive up to 128 px/deg ~463 m/pixel)',
    coverage: 'Global Mars (-90° to +90° Lat, 0° to 360° Lon)',
    crs: 'Planetocentric Equirectangular',
    verticalDatum: 'Mars Areoid (Fundamental Geodetic Zero Definition)',
    fileFormat: 'PDS3 IMG / GeoTIFF',
    decision: 'ACCEPT_WITH_CAVEATS',
    role: 'Geodetic Elevation Datum Reference for all derived DTMs',
    caveats: 'Global scale only (local 720x1440 C-grid at 14.818 km/pixel; 128 px/deg regional tiles not ingested locally). Completely inadequate for local slope or route planning.',
    officialUrl: 'https://pds-geosciences.wustl.edu/missions/mgs/mola.html',
    isIngested: true,
    epistemicClass: 'OBSERVED',
    storageCategory: 'LOCAL_RAW',
    temporalCoverage: '1997–2001 Mars Global Surveyor primary altimetry mission',
    availabilityStatus: 'Ingested locally (data/raw/mola/megt90n000cb.img)',
    supportsRegions: ['all'],
    supportsLayers: ['atlas_basemap', 'elevation'],
    supportsGeology: false,
    supportsScienceTargets: false,
  },
  {
    id: 'product-07',
    title: 'CRISM Targeted Empirical Mineralogical Cube (MTRDR)',
    agency: 'NASA PDS Geosciences Node / JHU-APL',
    instrument: 'Compact Reconnaissance Imaging Spectrometer for Mars (CRISM)',
    doiOrUrn: 'urn:nasa:pds:crism_mtrdr:frt00005850_07_if166l_trr3',
    resolution: '18.0 m/pixel hyperspectral (VNIR + IR)',
    coverage: 'Jezero Western Delta Outcrop',
    crs: 'Equirectangular (Mars Sphere)',
    verticalDatum: 'N/A (Spectral Summary Parameters)',
    fileFormat: 'PDS3 / CAT ENVI format with detached headers',
    decision: 'ACCEPT',
    role: 'Science Opportunity Layer: Carbonate, Smectite, and Hydrated Silica Signatures',
    caveats: 'High detector noise in cryocooled IR detector past 2012; raw ENVI cube not stored locally (curated index summaries and derived science layer only; see docs/data_sources.md Product 6 FRT000047A3 alongside MTRDR metadata FRT00005850).',
    officialUrl: 'https://pds-geosciences.wustl.edu/missions/mro/crism.htm',
    isIngested: false,
    epistemicClass: 'INTERPRETED',
    storageCategory: 'STATIC_METADATA',
    temporalCoverage: 'Pre-2012 MRO CRISM targeted observations (FRT/HRL)',
    availabilityStatus: 'Curated scene/index summaries only; raw PDS ENVI cube not ingested locally',
    supportsRegions: ['reg-jezero'],
    supportsLayers: ['science_opportunity'],
    supportsGeology: true,
    supportsScienceTargets: true,
  },
  {
    id: 'product-08',
    title: 'USGS Jezero Crater Scientific Geologic Map (SIM-3464)',
    agency: 'USGS Astrogeology (Sun & Stack, 2020)',
    instrument: 'Stratigraphic & Morphology Cartographic Synthesis',
    doiOrUrn: '10.3133/sim3464',
    resolution: 'Vector GIS shapefile / GeoPackage (published 1:75,000 scale)',
    coverage: 'Jezero Crater Floor & Western Delta Deposit',
    crs: 'Equirectangular (IAU Mars 2015 Sphere)',
    verticalDatum: 'N/A (Stratigraphic Layer Vector Boundaries)',
    fileFormat: 'GeoPackage / Shapefile with attribute tables',
    decision: 'ACCEPT',
    role: 'Geological Diversity Scoring & Formation Contact Transition Costing',
    caveats: 'Cartographic interpretation (epistemic: INTERPRETED); contact boundaries have inherent human delineation fuzziness. Full vector shapefile not ingested locally.',
    officialUrl: 'https://pubs.er.usgs.gov/publication/sim3464',
    isIngested: false,
    epistemicClass: 'INTERPRETED',
    storageCategory: 'STATIC_METADATA',
    temporalCoverage: '2020 USGS Scientific Investigations Map 3464 publication',
    availabilityStatus: 'Curated stratigraphic unit attributes only; full GIS vector archive not ingested',
    supportsRegions: ['reg-jezero'],
    supportsLayers: ['science_opportunity'],
    supportsGeology: true,
    supportsScienceTargets: true,
  },
  {
    id: 'product-09',
    title: 'NASA Mars 2020 Perseverance MEDA In-Situ Archive',
    agency: 'NASA PDS Geosciences Node / CAB-INTA-CSIC',
    instrument: 'Mars Environmental Dynamics Analyzer (MEDA)',
    doiOrUrn: 'urn:nasa:pds:mars2020_meda',
    resolution: 'In-situ time-series (1 Hz ATS, RDS, WS1/WS2 sensors)',
    coverage: 'Perseverance Traverse Sols 1–1000+ at Jezero Crater',
    crs: 'Rover Site Frames & IAU_2015:49900',
    verticalDatum: 'Local Rover Deck / Mars Areoid',
    fileFormat: 'PDS4 XML + CSV / Parquet time series tables',
    decision: 'ACCEPT',
    role: 'Ground-Truth Historical Martian Weather Baseline (Temperature, Dust Tau, Winds)',
    caveats: 'Local spot measurements along rover path; raw PDS4 MEDA tables not ingested (separate M20_traverse.json and M20_waypoints.json traverse geometry ingested).',
    officialUrl: 'https://pds-geosciences.wustl.edu/missions/mars2020/meda.htm',
    isIngested: false,
    epistemicClass: 'OBSERVED',
    storageCategory: 'STATIC_METADATA',
    temporalCoverage: 'Mars 2020 Sols 1–1000+ archival reference',
    availabilityStatus: 'Metadata reference only (Perseverance M20 traverse JSON ingested separately)',
    supportsRegions: ['reg-jezero'],
    supportsLayers: [],
    supportsGeology: false,
    supportsScienceTargets: true,
  },
  {
    id: 'product-10',
    title: 'Mars Climate Database (MCD v6.1) Jezero Regional Model',
    agency: 'LMD-CNRS / Sorbonne Université / ESA',
    instrument: 'Numerical Global & Meso-Scale Circulation Model (GCM)',
    doiOrUrn: 'MCD_v6.1_LMD_CNRS_ESA',
    resolution: '5.625° x 3.75° global with local sub-grid Jezero topography',
    coverage: 'Jezero Crater (18.44°N, 77.45°E) across all Solar Longitudes (Ls 0°–360°)',
    crs: 'Mars Spherical coordinates',
    verticalDatum: 'Mars Areoid',
    fileFormat: 'NetCDF4 / Fortran API output tables',
    decision: 'ACCEPT',
    role: 'Seasonal Diurnal Environmental Suitability Modeling & Scenario Generation',
    caveats: 'Numerical climate model simulation (epistemic: SIMULATED; origin: CLIMATE_MODELED); does not replace in-situ monitoring. App uses parametric Jezero diurnal approximations.',
    officialUrl: 'http://www-mars.lmd.jussieu.fr/mcd_python/',
    isIngested: false,
    epistemicClass: 'SIMULATED',
    storageCategory: 'MODEL_SIMULATED',
    temporalCoverage: 'Solar Longitude Ls 0°–360° (parametric diurnal & seasonal)',
    availabilityStatus: 'Parametric model approximation active; full MCD NetCDF4 not ingested',
    supportsRegions: ['reg-jezero'],
    supportsLayers: [],
    supportsGeology: true,
    supportsScienceTargets: false,
  },
]

/**
 * Fetch authentic planetary dataset catalog from backend API with fallback.
 */
export async function fetchCatalogDatasets(): Promise<PlanetaryDatasetProduct[]> {
  try {
    const res = await fetch('/api/v1/catalog/datasets')
    if (res.ok) {
      return (await res.json()) as PlanetaryDatasetProduct[]
    }
  } catch (err: unknown) {
    console.warn('Backend catalog API offline, falling back to local dossier:', err)
  }
  return AUTHENTIC_PLANETARY_DATASETS
}

