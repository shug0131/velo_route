import { RecordedTrackPoint, RideSummary } from '../types/simulator';
import { encodeRideToFit } from './fitEncoder';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function computeRideSummary(
  courseName: string,
  points: RecordedTrackPoint[],
  elapsedSec: number,
  distanceMeters: number
): RideSummary {
  if (points.length === 0) {
    const now = Date.now();
    return {
      courseName,
      startTimeMs: now,
      endTimeMs: now,
      elapsedSec: 0,
      totalDistanceMeters: 0,
      elevationGainMeters: 0,
      avgWatts: 0,
      maxWatts: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      avgCadenceRpm: 0,
      totalWorkKj: 0,
      pointCount: 0,
    };
  }

  let sumWatts = 0;
  let maxWatts = 0;
  let sumSpeed = 0;
  let maxSpeed = 0;
  let sumCadence = 0;
  let activeCadenceCount = 0;
  let gain = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    sumWatts += pt.watts;
    if (pt.watts > maxWatts) maxWatts = pt.watts;
    sumSpeed += pt.speedKmh;
    if (pt.speedKmh > maxSpeed) maxSpeed = pt.speedKmh;
    if (pt.cadenceRpm > 0) {
      sumCadence += pt.cadenceRpm;
      activeCadenceCount++;
    }
    if (i > 0) {
      const dEle = pt.elevationMeters - points[i - 1].elevationMeters;
      if (dEle > 0) gain += dEle;
    }
  }

  const avgWatts = Math.round(sumWatts / points.length);
  const avgSpeedKmh = Number((sumSpeed / points.length).toFixed(1));
  const avgCadenceRpm =
    activeCadenceCount > 0 ? Math.round(sumCadence / activeCadenceCount) : 0;
  const totalWorkKj = Math.round((avgWatts * elapsedSec) / 1000);

  return {
    courseName,
    startTimeMs: points[0].timestampMs,
    endTimeMs: points[points.length - 1].timestampMs,
    elapsedSec,
    totalDistanceMeters: Math.max(distanceMeters, points[points.length - 1].distanceMeters),
    elevationGainMeters: Math.round(gain),
    avgWatts,
    maxWatts,
    avgSpeedKmh,
    maxSpeedKmh: Number(maxSpeed.toFixed(1)),
    avgCadenceRpm,
    totalWorkKj,
    pointCount: points.length,
  };
}

/**
 * Exports recorded ride points to GPX 1.1 XML with timestamps, elevation, power, and cadence.
 */
export function encodeRideToGpx(
  points: RecordedTrackPoint[],
  summary: RideSummary,
  rideName: string
): string {
  const startIso = new Date(summary.startTimeMs).toISOString();
  const safeName = escapeXml(rideName || summary.courseName);

  const trkpts = points
    .map((pt) => {
      const iso = new Date(pt.timestampMs).toISOString();
      return `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lon.toFixed(6)}">
        <ele>${pt.elevationMeters.toFixed(1)}</ele>
        <time>${iso}</time>
        <extensions>
          <power>${Math.round(pt.watts)}</power>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:cad>${Math.round(pt.cadenceRpm)}</gpxtpx:cad>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="VeloRoute" version="1.1"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${safeName}</name>
    <time>${startIso}</time>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <type>VirtualRide</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

export function triggerFileDownload(
  content: BlobPart,
  fileName: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadRideGpx(
  points: RecordedTrackPoint[],
  summary: RideSummary,
  rideName: string
) {
  const gpx = encodeRideToGpx(points, summary, rideName);
  const slug = (rideName || 'veloroute-ride').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  triggerFileDownload(gpx, `${slug}.gpx`, 'application/gpx+xml;charset=utf-8');
}

export function downloadRideFit(
  points: RecordedTrackPoint[],
  summary: RideSummary,
  rideName: string
) {
  const fitBytes = encodeRideToFit(points, summary);
  const copy = new Uint8Array(fitBytes.length);
  copy.set(fitBytes);
  const slug = (rideName || 'veloroute-ride').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  triggerFileDownload(copy.buffer, `${slug}.fit`, 'application/octet-stream');
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
