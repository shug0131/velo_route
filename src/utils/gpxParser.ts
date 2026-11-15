import { GpxCourse, GpxPoint } from '../types/simulator';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function parseGpxString(xmlText: string, fileName: string): GpxCourse {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid GPX XML file. Please check the file format.');
  }

  const nameEl = doc.querySelector('trk > name, rte > name, metadata > name');
  const courseName = nameEl?.textContent?.trim() || fileName.replace(/\.gpx$/i, '');

  let ptNodes = Array.from(doc.querySelectorAll('trkpt'));
  if (ptNodes.length < 2) {
    ptNodes = Array.from(doc.querySelectorAll('rtept'));
  }
  if (ptNodes.length < 2) {
    throw new Error('GPX file must contain at least 2 track points (<trkpt> or <rtept>).');
  }

  interface RawPt {
    lat: number;
    lon: number;
    ele: number;
    timeMs: number | null;
  }

  const raw: RawPt[] = [];
  let lastValidEle = 0;

  for (const node of ptNodes) {
    const lat = parseFloat(node.getAttribute('lat') || '');
    const lon = parseFloat(node.getAttribute('lon') || '');
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const eleText = node.querySelector('ele')?.textContent;
    const ele = eleText !== null && eleText !== undefined && !Number.isNaN(parseFloat(eleText))
      ? parseFloat(eleText)
      : lastValidEle;
    lastValidEle = ele;

    const timeText = node.querySelector('time')?.textContent;
    const parsedTime = timeText ? Date.parse(timeText) : NaN;
    raw.push({
      lat,
      lon,
      ele,
      timeMs: Number.isNaN(parsedTime) ? null : parsedTime,
    });
  }

  if (raw.length < 2) {
    throw new Error('No valid coordinate points found in GPX file.');
  }

  const hasTimestamps = raw.every((p) => p.timeMs !== null) && raw[raw.length - 1].timeMs! > raw[0].timeMs!;
  const startTimeMs = hasTimestamps ? raw[0].timeMs! : 0;

  // Build cumulative distance
  const distances: number[] = [0];
  for (let i = 1; i < raw.length; i++) {
    const d = haversineMeters(raw[i - 1].lat, raw[i - 1].lon, raw[i].lat, raw[i].lon);
    distances.push(distances[i - 1] + d);
  }

  // Smooth elevation using a ±35m distance window to remove GPS altimeter noise
  const smoothedEles: number[] = raw.map((_, idx) => {
    const centerDist = distances[idx];
    let sum = 0;
    let count = 0;
    for (let j = idx; j >= 0 && centerDist - distances[j] <= 35; j--) {
      sum += raw[j].ele;
      count++;
    }
    for (let j = idx + 1; j < raw.length && distances[j] - centerDist <= 35; j++) {
      sum += raw[j].ele;
      count++;
    }
    return count > 0 ? sum / count : raw[idx].ele;
  });

  // Compute segment grade (%) using lookahead/lookbehind window (~40m)
  const points: GpxPoint[] = raw.map((pt, i) => {
    const dist = distances[i];
    let backIdx = i;
    while (backIdx > 0 && dist - distances[backIdx] < 20) backIdx--;
    let fwdIdx = i;
    while (fwdIdx < raw.length - 1 && distances[fwdIdx] - dist < 20) fwdIdx++;

    const spanDist = distances[fwdIdx] - distances[backIdx];
    const deltaEle = smoothedEles[fwdIdx] - smoothedEles[backIdx];
    const rawGrade = spanDist > 2 ? (deltaEle / spanDist) * 100 : 0;
    const gradePercent = Math.max(-22, Math.min(22, Number(rawGrade.toFixed(1))));

    let timeSec: number | null = null;
    let recordedSpeedKmh: number | null = null;
    if (hasTimestamps && pt.timeMs !== null) {
      timeSec = (pt.timeMs - startTimeMs) / 1000;
      const dt =
        fwdIdx > backIdx && raw[fwdIdx].timeMs !== null && raw[backIdx].timeMs !== null
          ? (raw[fwdIdx].timeMs! - raw[backIdx].timeMs!) / 1000
          : 0;
      if (dt > 0.2 && spanDist > 0.2) {
        recordedSpeedKmh = Math.max(2, Math.min(85, (spanDist / dt) * 3.6));
      }
    }

    return {
      lat: pt.lat,
      lon: pt.lon,
      ele: pt.ele,
      smoothedEle: smoothedEles[i],
      distanceMeters: dist,
      gradePercent,
      timeSec,
      recordedSpeedKmh,
    };
  });

  // Elevation gain & bounds
  let totalGain = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const e = points[i].smoothedEle;
    if (e < minEle) minEle = e;
    if (e > maxEle) maxEle = e;
    if (i > 0) {
      const diff = e - points[i - 1].smoothedEle;
      if (diff > 0.25) totalGain += diff;
    }
  }

  const totalDistanceMeters = distances[distances.length - 1];
  const durationSec = hasTimestamps ? points[points.length - 1].timeSec : null;
  const averageRecordedSpeedKmh =
    durationSec && durationSec > 0
      ? Number(((totalDistanceMeters / durationSec) * 3.6).toFixed(1))
      : 28.0;

  return {
    id: `gpx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: courseName,
    fileName,
    isBuiltIn: false,
    points,
    totalDistanceMeters,
    totalElevationGainMeters: Math.round(totalGain),
    minEleMeters: Math.round(minEle),
    maxEleMeters: Math.round(maxEle),
    hasTimestamps,
    averageRecordedSpeedKmh,
    durationSec,
  };
}

export interface CourseSample {
  distanceMeters: number;
  progress: number;
  elevationMeters: number;
  gradePercent: number;
  recordedSpeedKmh: number | null;
  timeSec: number | null;
  lat: number;
  lon: number;
}

export function interpolateCourseAtDistance(course: GpxCourse, distanceMeters: number): CourseSample {
  const pts = course.points;
  const total = course.totalDistanceMeters;
  if (pts.length === 0 || total <= 0) {
    return {
      distanceMeters: 0,
      progress: 0,
      elevationMeters: 0,
      gradePercent: 0,
      recordedSpeedKmh: null,
      timeSec: null,
      lat: 0,
      lon: 0,
    };
  }

  const clampedDist = Math.max(0, Math.min(total, distanceMeters));

  // Binary search for segment
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].distanceMeters <= clampedDist) lo = mid;
    else hi = mid;
  }

  const p0 = pts[lo];
  const p1 = pts[hi];
  const segLen = p1.distanceMeters - p0.distanceMeters;
  const t = segLen > 0.001 ? (clampedDist - p0.distanceMeters) / segLen : 0;

  const elevationMeters = p0.smoothedEle + t * (p1.smoothedEle - p0.smoothedEle);
  const gradePercent = Number((p0.gradePercent + t * (p1.gradePercent - p0.gradePercent)).toFixed(1));
  const lat = p0.lat + t * (p1.lat - p0.lat);
  const lon = p0.lon + t * (p1.lon - p0.lon);

  let timeSec: number | null = null;
  if (p0.timeSec !== null && p1.timeSec !== null) {
    timeSec = p0.timeSec + t * (p1.timeSec - p0.timeSec);
  }

  let recordedSpeedKmh: number | null = null;
  if (p0.recordedSpeedKmh !== null && p1.recordedSpeedKmh !== null) {
    recordedSpeedKmh = p0.recordedSpeedKmh + t * (p1.recordedSpeedKmh - p0.recordedSpeedKmh);
  } else {
    recordedSpeedKmh = p0.recordedSpeedKmh ?? p1.recordedSpeedKmh;
  }

  return {
    distanceMeters: clampedDist,
    progress: clampedDist / total,
    elevationMeters,
    gradePercent,
    recordedSpeedKmh,
    timeSec,
    lat,
    lon,
  };
}

/**
 * Generates built-in GPX courses so riders can immediately test GPX speed physics,
 * elevation scrubbing, and target coaching before uploading their own GPX/Video files.
 */
function buildSampleCourse(
  id: string,
  name: string,
  totalKm: number,
  segments: number,
  elevationFn: (progress: number) => number,
  baseLat: number,
  baseLon: number
): GpxCourse {
  const totalMeters = totalKm * 1000;
  const stepMeters = totalMeters / segments;
  const points: GpxPoint[] = [];

  for (let i = 0; i <= segments; i++) {
    const progress = i / segments;
    const dist = i * stepMeters;
    const ele = elevationFn(progress);
    const lat = baseLat + progress * 0.08 + Math.sin(progress * Math.PI * 5) * 0.008;
    const lon = baseLon + progress * 0.1 + Math.cos(progress * Math.PI * 3) * 0.008;
    points.push({
      lat,
      lon,
      ele,
      smoothedEle: ele,
      distanceMeters: dist,
      gradePercent: 0,
      timeSec: (dist / 1000 / 26) * 3600, // nominal 26 km/h camera speed
      recordedSpeedKmh: 26,
    });
  }

  let totalGain = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const span = next.distanceMeters - prev.distanceMeters;
    const dEle = next.ele - prev.ele;
    points[i].gradePercent = span > 1 ? Number(Math.max(-18, Math.min(18, (dEle / span) * 100)).toFixed(1)) : 0;
    if (points[i].ele < minEle) minEle = points[i].ele;
    if (points[i].ele > maxEle) maxEle = points[i].ele;
    if (i > 0 && points[i].ele > points[i - 1].ele) {
      totalGain += points[i].ele - points[i - 1].ele;
    }
  }

  return {
    id,
    name,
    fileName: `${id}.gpx`,
    isBuiltIn: true,
    points,
    totalDistanceMeters: totalMeters,
    totalElevationGainMeters: Math.round(totalGain),
    minEleMeters: Math.round(minEle),
    maxEleMeters: Math.round(maxEle),
    hasTimestamps: true,
    averageRecordedSpeedKmh: 26.0,
    durationSec: (totalKm / 26) * 3600,
  };
}

export const BUILT_IN_COURSES: GpxCourse[] = [
  buildSampleCourse(
    'alpe-climb',
    "Alpe d'Huez Ascent",
    13.8,
    220,
    (p) => {
      // Base 740m climbing to 1810m with realistic hairpin gradient waves
      const climb = 740 + p * 1070;
      const hairpinWave = Math.sin(p * Math.PI * 12) * 18;
      const steepFinish = p > 0.85 ? (p - 0.85) * 140 : 0;
      return climb + hairpinWave + steepFinish;
    },
    45.063,
    6.031
  ),
  buildSampleCourse(
    'coastal-rollers',
    'Coastal Tempo Rollers',
    18.4,
    240,
    (p) => {
      // Rolling coastal highway 25m to 145m
      return (
        45 +
        Math.sin(p * Math.PI * 6) * 38 +
        Math.sin(p * Math.PI * 14) * 14 +
        p * 25
      );
    },
    36.37,
    -121.9
  ),
];
