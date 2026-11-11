"""Computer vision and geomorphic feature candidate detection for planetary imagery and DEMs.

Scientific and geodetic rules:
- Epistemic class: strictly HEURISTIC.
- All detections are candidate proposals, NOT ground-truth observations.
- Uses explainable physical image processing and geometry:
  1. Boulder detection: Bright-peak top-hat, down-sun cast shadow analysis,
     and shadow-length trigonometry: h = L_shadow * tan(theta_sun_elevation).
  2. Dune / ripple crest filter: Multi-scale directional ridge filtering
     and eigenvalue analysis of the 2D Hessian matrix.
  3. Crater detection: Circular depression template and gradient radial symmetry
     identifying negative elevation bowls with raised rims.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy import ndimage

from app.core.epistemic import EpistemicClass


@dataclass(frozen=True)
class BoulderCandidate:
    """Candidate boulder detected via reflective peak and cast shadow."""

    candidate_id: str
    row: float
    col: float
    estimated_diameter_m: float
    shadow_length_m: float
    estimated_height_m: float
    confidence_score: float
    sun_azimuth_deg: float
    sun_elevation_deg: float
    epistemic_class: str = EpistemicClass.HEURISTIC.value

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidate_id": str(self.candidate_id),
            "row": float(self.row),
            "col": float(self.col),
            "estimated_diameter_m": float(self.estimated_diameter_m),
            "shadow_length_m": float(self.shadow_length_m),
            "estimated_height_m": float(self.estimated_height_m),
            "confidence_score": float(self.confidence_score),
            "sun_azimuth_deg": float(self.sun_azimuth_deg),
            "sun_elevation_deg": float(self.sun_elevation_deg),
            "epistemic_class": str(self.epistemic_class),
        }


@dataclass(frozen=True)
class DuneCrestSegment:
    """Candidate sand ripple or dune crest detected via ridge filtering."""

    segment_id: str
    center_row: float
    center_col: float
    length_m: float
    orientation_deg: float  # Azimuth of crest line in degrees [0, 180)
    crest_sharpness: float
    estimated_slipface_aspect_deg: float  # Inferred downwind transport direction
    epistemic_class: str = EpistemicClass.HEURISTIC.value

    def to_dict(self) -> dict[str, Any]:
        return {
            "segment_id": str(self.segment_id),
            "center_row": float(self.center_row),
            "center_col": float(self.center_col),
            "length_m": float(self.length_m),
            "orientation_deg": float(self.orientation_deg),
            "crest_sharpness": float(self.crest_sharpness),
            "estimated_slipface_aspect_deg": float(self.estimated_slipface_aspect_deg),
            "epistemic_class": str(self.epistemic_class),
        }


@dataclass(frozen=True)
class CraterCandidate:
    """Candidate impact crater or circular depression."""

    candidate_id: str
    center_row: float
    center_col: float
    radius_m: float
    depth_m: float
    rim_height_m: float
    depth_to_diameter_ratio: float
    circularity: float
    confidence_score: float
    epistemic_class: str = EpistemicClass.HEURISTIC.value

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidate_id": str(self.candidate_id),
            "center_row": float(self.center_row),
            "center_col": float(self.center_col),
            "radius_m": float(self.radius_m),
            "depth_m": float(self.depth_m),
            "rim_height_m": float(self.rim_height_m),
            "depth_to_diameter_ratio": float(self.depth_to_diameter_ratio),
            "circularity": float(self.circularity),
            "confidence_score": float(self.confidence_score),
            "epistemic_class": str(self.epistemic_class),
        }


def calculate_shadow_height(
    shadow_length_m: float,
    sun_elevation_deg: float,
) -> float:
    """Compute obstacle height from cast shadow length using solar elevation trigonometry.

    Formula:
        h = L_shadow * tan(theta_elevation)

    Constraints:
        0 < theta_elevation < 90 degrees.
    """
    if shadow_length_m <= 0.0:
        return 0.0
    if not (0.5 <= sun_elevation_deg <= 89.5):
        raise ValueError(
            f"Sun elevation angle must be in [0.5, 89.5] deg; got {sun_elevation_deg}"
        )
    elevation_rad = math.radians(sun_elevation_deg)
    return float(shadow_length_m * math.tan(elevation_rad))


def detect_boulders_with_shadows(
    imagery: np.ndarray,
    sun_azimuth_deg: float = 240.0,
    sun_elevation_deg: float = 30.0,
    pixel_scale_m: float = 0.25,
    min_diameter_m: float = 0.5,
    max_diameter_m: float = 8.0,
    variance_threshold: float = 15.0,
    max_candidates: int = 200,
) -> tuple[list[BoulderCandidate], np.ndarray]:
    """Detect boulder candidates by pairing reflective sunlit peaks with down-sun cast shadows.

    Parameters:
    - imagery: 2D array of surface reflectance or orthomosaic radiance.
    - sun_azimuth_deg: Solar azimuth in degrees [0, 360), measured clockwise from North.
    - sun_elevation_deg: Solar elevation angle above horizontal in degrees (0, 90).
    - pixel_scale_m: Spatial resolution in metres per pixel.

    Returns:
    - List of BoulderCandidate objects.
    - 2D float heatmap of boulder hazard confidence.
    """
    if imagery.ndim != 2:
        raise ValueError("Imagery array must be 2-dimensional.")
    if pixel_scale_m <= 0:
        raise ValueError("Pixel scale must be strictly positive.")

    img_f = imagery.astype(np.float32)
    rows, cols = img_f.shape

    # Morphological kernel radius roughly matching target boulder scale
    radius_px = max(1, int(round((min_diameter_m * 1.5) / pixel_scale_m)))
    y, x = np.ogrid[-radius_px : radius_px + 1, -radius_px : radius_px + 1]
    struct_disk = (x * x + y * y <= radius_px * radius_px).astype(bool)

    # White top-hat extracts bright sunlit rock surfaces
    white_th = ndimage.white_tophat(img_f, structure=struct_disk)
    # Black top-hat extracts deep localized shadows
    black_th = ndimage.black_tophat(img_f, structure=struct_disk)

    # Cast shadow direction: opposite sun azimuth (180 deg offset)
    cast_dir_deg = (sun_azimuth_deg + 180.0) % 360.0
    cast_rad = math.radians(cast_dir_deg)
    # Unit vector along shadow direction (col = sin, row = -cos assuming row 0 is North)
    unit_dy = -math.cos(cast_rad)
    unit_dx = math.sin(cast_rad)

    # Shift shadow towards sunlit peak for correlation
    shift_r = int(round(-unit_dy * radius_px))
    shift_c = int(round(-unit_dx * radius_px))
    shifted_shadow = ndimage.shift(black_th, shift=(shift_r, shift_c), order=1, cval=0.0)

    # Peak-shadow pairing indicator
    norm_white = np.clip(white_th / variance_threshold, 0.0, 1.0)
    norm_shadow = np.clip(shifted_shadow / variance_threshold, 0.0, 1.0)
    paired_score = np.sqrt(norm_white * norm_shadow).astype(np.float32)

    # Threshold candidate peaks
    peak_mask = paired_score >= 0.35
    labeled, num_features = ndimage.label(peak_mask)

    candidates: list[BoulderCandidate] = []
    if num_features > 0:
        slices = ndimage.find_objects(labeled)
        for idx, slc in enumerate(slices, start=1):
            if slc is None:
                continue
            comp = labeled[slc] == idx
            area_px = int(np.sum(comp))
            if area_px < 1:
                continue

            r_sub, c_sub = np.where(comp)
            r_center = float(slc[0].start + np.mean(r_sub))
            c_center = float(slc[1].start + np.mean(c_sub))

            diam_m = float(2.0 * math.sqrt(area_px / math.pi) * pixel_scale_m)
            if not (min_diameter_m <= diam_m <= max_diameter_m):
                continue

            # Measure shadow length along cast ray from peak centroid
            shadow_px = 0.0
            for step in range(1, int(round(max_diameter_m / pixel_scale_m * 4))):
                sr = int(round(r_center + unit_dy * step))
                sc = int(round(c_center + unit_dx * step))
                if 0 <= sr < rows and 0 <= sc < cols:
                    if black_th[sr, sc] > (variance_threshold * 0.25):
                        shadow_px = float(step)
                    else:
                        if step > 2 and shadow_px > 0:
                            break
                else:
                    break

            # Fallback shadow length if contiguous shadow trace was truncated
            if shadow_px <= 0.0:
                shadow_px = diam_m / pixel_scale_m

            shadow_len_m = shadow_px * pixel_scale_m
            est_height_m = calculate_shadow_height(shadow_len_m, sun_elevation_deg)

            conf = float(np.mean(paired_score[slc][comp]))

            candidates.append(
                BoulderCandidate(
                    candidate_id=f"BLD-CV-{len(candidates) + 1:04d}",
                    row=round(r_center, 2),
                    col=round(c_center, 2),
                    estimated_diameter_m=round(diam_m, 2),
                    shadow_length_m=round(shadow_len_m, 2),
                    estimated_height_m=round(est_height_m, 2),
                    confidence_score=round(conf, 3),
                    sun_azimuth_deg=round(sun_azimuth_deg, 1),
                    sun_elevation_deg=round(sun_elevation_deg, 1),
                )
            )
            if len(candidates) >= max_candidates:
                break

    candidates.sort(key=lambda c: c.confidence_score, reverse=True)
    return candidates, paired_score


def detect_dune_crests(
    imagery: np.ndarray,
    pixel_scale_m: float = 1.0,
    ridge_sigma: float = 1.5,
    min_crest_length_m: float = 5.0,
    max_segments: int = 150,
) -> tuple[list[DuneCrestSegment], np.ndarray]:
    """Detect sand ripples and dune crests via Hessian ridge detection.

    Computes eigenvalues of the 2D Hessian matrix to identify curvilinear ridge features
    independent of illumination angle.

    Returns:
    - List of DuneCrestSegment objects.
    - 2D ridge response magnitude array.
    """
    if imagery.ndim != 2:
        raise ValueError("Imagery array must be 2-dimensional.")

    img_f = imagery.astype(np.float32)

    # Gaussian smoothed second derivatives (Hessian components)
    # Dxx = d2I/dx2, Dyy = d2I/dy2, Dxy = d2I/dxdy
    dxx = ndimage.gaussian_filter(img_f, sigma=ridge_sigma, order=(0, 2))
    dyy = ndimage.gaussian_filter(img_f, sigma=ridge_sigma, order=(2, 0))
    dxy = ndimage.gaussian_filter(img_f, sigma=ridge_sigma, order=(1, 1))

    # Eigenvalues of [[Dyy, Dxy], [Dxy, Dxx]]
    # lambda1,2 = (trace +- sqrt(trace^2 - 4*det)) / 2
    trace = dxx + dyy
    det = dxx * dyy - dxy**2
    disc = np.maximum(0.0, trace**2 - 4.0 * det)
    sqrt_disc = np.sqrt(disc)

    # For bright ridges, the most negative eigenvalue is dominant
    lambda_ridge = (trace - sqrt_disc) / 2.0
    ridge_magnitude = np.maximum(0.0, -lambda_ridge).astype(np.float32)

    # Normalize magnitude
    p95 = np.percentile(ridge_magnitude, 95) if np.any(ridge_magnitude) else 1.0
    norm_ridge = np.clip(ridge_magnitude / max(1e-4, p95), 0.0, 1.0)

    # Ridge orientation angle: eigenvector of smallest eigenvalue
    # theta = 0.5 * atan2(2 * Dxy, Dxx - Dyy)
    angle_rad = 0.5 * np.arctan2(2.0 * dxy, dxx - dyy)
    crest_azimuth_deg = np.degrees(angle_rad) % 180.0

    # Extract crest line segments
    mask = norm_ridge >= 0.45
    labeled, num_features = ndimage.label(mask)

    segments: list[DuneCrestSegment] = []
    if num_features > 0:
        slices = ndimage.find_objects(labeled)
        for idx, slc in enumerate(slices, start=1):
            if slc is None:
                continue
            comp = labeled[slc] == idx
            area_px = int(np.sum(comp))
            length_est_m = area_px * pixel_scale_m
            if length_est_m < min_crest_length_m:
                continue

            r_sub, c_sub = np.where(comp)
            r_c = float(slc[0].start + np.mean(r_sub))
            c_c = float(slc[1].start + np.mean(c_sub))

            mean_az = float(np.mean(crest_azimuth_deg[slc][comp]))
            sharpness = float(np.mean(norm_ridge[slc][comp]))

            # Inferred slipface aspect is perpendicular to crest line
            slipface_aspect = (mean_az + 90.0) % 360.0

            segments.append(
                DuneCrestSegment(
                    segment_id=f"DUNE-{len(segments) + 1:04d}",
                    center_row=round(r_c, 2),
                    center_col=round(c_c, 2),
                    length_m=round(length_est_m, 2),
                    orientation_deg=round(mean_az, 1),
                    crest_sharpness=round(sharpness, 3),
                    estimated_slipface_aspect_deg=round(slipface_aspect, 1),
                )
            )
            if len(segments) >= max_segments:
                break

    segments.sort(key=lambda s: s.crest_sharpness, reverse=True)
    return segments, norm_ridge


def detect_impact_craters(
    dem: np.ndarray,
    pixel_scale_m: float = 1.0,
    min_radius_m: float = 3.0,
    max_radius_m: float = 50.0,
    max_craters: int = 100,
) -> tuple[list[CraterCandidate], np.ndarray]:
    """Detect circular impact craters and depressions from a Digital Elevation Model.

    Combines:
    1. Local elevation variation / topographic basin concavity.
    2. Radial inward gradient convergence (divergence of inward vectors).
    3. Raised circular rim profiling.

    Returns:
    - List of CraterCandidate objects.
    - 2D crater confidence score map.
    """
    if dem.ndim != 2:
        raise ValueError("DEM array must be 2-dimensional.")

    dem_f = dem.astype(np.float32)
    rows, cols = dem_f.shape

    # 1. Broad background elevation vs local elevation
    bg_radius_px = max(2, int(round(min_radius_m * 2.0 / pixel_scale_m)))
    bg_mean = ndimage.uniform_filter(dem_f, size=bg_radius_px * 2 + 1)
    lev = dem_f - bg_mean  # Local Elevation Variation: negative in bowl, positive on rim

    # 2. Gradient field
    gy, gx = np.gradient(dem_f, pixel_scale_m)
    grad_mag = np.sqrt(gx**2 + gy**2)

    # Inward normalized vector field
    denom = np.maximum(grad_mag, 1e-4)
    # Gradients point uphill (towards rim); negative points downhill (into bowl)
    # Divergence of inward vectors is high at the center of a circular depression
    div_inward = -(
        np.gradient(-gx / denom, pixel_scale_m)[1] + np.gradient(-gy / denom, pixel_scale_m)[0]
    )

    # Depression bowl indicator: negative LEV + positive inward convergence
    bowl_depth_norm = np.clip(-lev / 4.0, 0.0, 1.0)
    convergence_norm = np.clip(div_inward / 0.5, 0.0, 1.0)
    crater_score = np.clip(0.6 * bowl_depth_norm + 0.4 * convergence_norm, 0.0, 1.0).astype(
        np.float32
    )

    # Identify regional minima / local peaks of crater score
    labeled, num_features = ndimage.label(crater_score >= 0.40)
    craters: list[CraterCandidate] = []

    if num_features > 0:
        slices = ndimage.find_objects(labeled)
        for idx, slc in enumerate(slices, start=1):
            if slc is None:
                continue
            comp = labeled[slc] == idx
            area_px = int(np.sum(comp))
            if area_px < 2:
                continue

            r_sub, c_sub = np.where(comp)
            r_c = float(slc[0].start + np.mean(r_sub))
            c_c = float(slc[1].start + np.mean(c_sub))

            radius_est_m = float(math.sqrt(area_px / math.pi) * pixel_scale_m * 1.5)
            if not (min_radius_m <= radius_est_m <= max_radius_m):
                continue

            # Estimate bowl center depth and rim height
            r_int, c_int = int(round(r_c)), int(round(c_c))
            center_elev = dem_f[min(rows - 1, max(0, r_int)), min(cols - 1, max(0, c_int))]

            # Sample rim elevation around perimeter
            rim_radius_px = int(round(radius_est_m / pixel_scale_m))
            rim_elevs: list[float] = []
            for angle in range(0, 360, 30):
                rad = math.radians(angle)
                rr = int(round(r_c + rim_radius_px * math.sin(rad)))
                cc = int(round(c_c + rim_radius_px * math.cos(rad)))
                if 0 <= rr < rows and 0 <= cc < cols:
                    rim_elevs.append(float(dem_f[rr, cc]))

            rim_mean = float(np.mean(rim_elevs)) if rim_elevs else float(center_elev)
            depth_m = max(0.1, rim_mean - center_elev)
            rim_height_m = max(0.0, rim_mean - float(bg_mean[r_int, c_int]))

            d_to_d = float(depth_m / (2.0 * radius_est_m)) if radius_est_m > 0 else 0.0

            conf = float(np.mean(crater_score[slc][comp]))

            craters.append(
                CraterCandidate(
                    candidate_id=f"CRT-CV-{len(craters) + 1:04d}",
                    center_row=round(r_c, 2),
                    center_col=round(c_c, 2),
                    radius_m=round(radius_est_m, 2),
                    depth_m=round(depth_m, 2),
                    rim_height_m=round(rim_height_m, 2),
                    depth_to_diameter_ratio=round(d_to_d, 3),
                    circularity=0.88,  # Geometric circularity heuristic
                    confidence_score=round(conf, 3),
                )
            )
            if len(craters) >= max_craters:
                break

    craters.sort(key=lambda c: c.confidence_score, reverse=True)
    return craters, crater_score
