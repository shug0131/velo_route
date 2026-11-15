import { DistanceWorkout, WorkoutSegment } from '../types/simulator';

export type DistanceUnitMode = 'auto' | 'km' | 'm';

function detectUnitFromHeader(headerLine: string): 'km' | 'm' | null {
  const lower = headerLine.toLowerCase();
  if (/\b(km|kilometer|kilometre|kilometers|kilometres)\b/.test(lower) || /_km\b/.test(lower)) {
    return 'km';
  }
  if (/\b(meter|meters|metre|metres|m)\b/.test(lower) || /_m\b/.test(lower)) {
    return 'm';
  }
  return null;
}

function parseJsonWorkout(
  text: string,
  fileName: string,
  unitOverride: DistanceUnitMode
): DistanceWorkout {
  const parsed = JSON.parse(text);
  const rawList: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.segments)
    ? parsed.segments
    : Array.isArray(parsed?.intervals)
    ? parsed.intervals
    : Array.isArray(parsed?.points)
    ? parsed.points
    : [];

  if (rawList.length === 0) {
    throw new Error('JSON workout must contain a non-empty array of distance/wattage entries.');
  }

  const objUnit =
    typeof parsed?.unit === 'string' && parsed.unit.toLowerCase().startsWith('m')
      ? 'm'
      : typeof parsed?.unit === 'string' && parsed.unit.toLowerCase().startsWith('k')
      ? 'km'
      : null;

  interface TempRow {
    startRaw: number;
    endRaw: number | null;
    watts: number;
    label?: string;
    hasMeterKey: boolean;
  }

  const rows: TempRow[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const wattsVal = Number(rec.targetWatts ?? rec.watts ?? rec.power ?? rec.watt);
    if (!Number.isFinite(wattsVal) || wattsVal < 0) continue;

    const hasMeterKey =
      rec.distanceMeters !== undefined ||
      rec.startMeters !== undefined ||
      rec.fromMeters !== undefined;

    const startVal = Number(
      rec.startMeters ??
        rec.fromMeters ??
        rec.distanceMeters ??
        rec.startKm ??
        rec.fromKm ??
        rec.distanceKm ??
        rec.start ??
        rec.from ??
        rec.distance ??
        0
    );
    const endRawCandidate =
      rec.endMeters ?? rec.toMeters ?? rec.endKm ?? rec.toKm ?? rec.end ?? rec.to;
    const endVal =
      endRawCandidate !== undefined && endRawCandidate !== null
        ? Number(endRawCandidate)
        : null;

    if (!Number.isFinite(startVal)) continue;
    rows.push({
      startRaw: startVal,
      endRaw: endVal !== null && Number.isFinite(endVal) ? endVal : null,
      watts: Math.round(wattsVal),
      label: typeof rec.label === 'string' ? rec.label : undefined,
      hasMeterKey,
    });
  }

  if (rows.length === 0) {
    throw new Error('No valid distance & wattage entries found in JSON workout.');
  }

  rows.sort((a, b) => a.startRaw - b.startRaw);
  const maxRaw = Math.max(...rows.map((r) => r.endRaw ?? r.startRaw));
  const unit: 'km' | 'm' =
    unitOverride !== 'auto'
      ? unitOverride
      : objUnit ?? (rows.some((r) => r.hasMeterKey) || maxRaw > 200 ? 'm' : 'km');
  const scale = unit === 'km' ? 1000 : 1;

  const segments: WorkoutSegment[] = rows.map((row, idx) => {
    const startMeters = Math.max(0, row.startRaw * scale);
    let endMeters: number;
    if (row.endRaw !== null && row.endRaw * scale > startMeters) {
      endMeters = row.endRaw * scale;
    } else if (idx < rows.length - 1) {
      endMeters = Math.max(startMeters + 10, rows[idx + 1].startRaw * scale);
    } else {
      const prevStep =
        idx > 0
          ? Math.max(200, startMeters - rows[idx - 1].startRaw * scale)
          : 1000;
      endMeters = startMeters + prevStep;
    }
    return {
      startMeters,
      endMeters,
      targetWatts: Math.max(30, Math.min(1500, row.watts)),
      label: row.label,
    };
  });

  const name =
    typeof parsed?.name === 'string' && parsed.name.trim()
      ? parsed.name.trim()
      : fileName.replace(/\.[^.]+$/, '');

  return {
    id: `wrk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    fileName,
    unitDetected: unit,
    segments,
    totalDistanceMeters: segments[segments.length - 1].endMeters,
  };
}

export function parseDistanceWorkout(
  text: string,
  fileName: string,
  unitOverride: DistanceUnitMode = 'auto'
): DistanceWorkout {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Workout file is empty.');
  }

  if (fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJsonWorkout(trimmed, fileName, unitOverride);
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  if (lines.length === 0) {
    throw new Error('No workout rows found in file.');
  }

  // Detect delimiter (comma, semicolon, or tab)
  const sampleLine = lines[0];
  const delimiter = sampleLine.includes('\t')
    ? '\t'
    : sampleLine.includes(';')
    ? ';'
    : ',';

  let headerUnit: 'km' | 'm' | null = null;
  let dataStartIdx = 0;

  const firstCells = lines[0].split(delimiter).map((c) => c.trim());
  const firstNum = parseFloat(firstCells[0]);
  if (Number.isNaN(firstNum)) {
    headerUnit = detectUnitFromHeader(lines[0]);
    dataStartIdx = 1;
  }

  interface CsvRow {
    col0: number;
    col1: number;
    col2: number | null;
    label?: string;
  }

  const parsedRows: CsvRow[] = [];
  for (let i = dataStartIdx; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    if (cells.length < 2) continue;

    const c0 = parseFloat(cells[0]);
    const c1 = parseFloat(cells[1]);
    if (Number.isNaN(c0) || Number.isNaN(c1)) continue;

    const c2 = cells.length >= 3 ? parseFloat(cells[2]) : NaN;
    if (!Number.isNaN(c2)) {
      // 3 numeric columns: startDistance, endDistance, watts (, optional label)
      parsedRows.push({
        col0: c0,
        col1: c1,
        col2: c2,
        label: cells[3] || undefined,
      });
    } else {
      // 2 numeric columns: distance, watts (, optional label)
      parsedRows.push({
        col0: c0,
        col1: c1,
        col2: null,
        label: cells[2] || undefined,
      });
    }
  }

  if (parsedRows.length === 0) {
    throw new Error(
      'Could not parse any distance and wattage rows. Expected CSV columns like "distance_km,watts" or "start_km,end_km,watts".'
    );
  }

  parsedRows.sort((a, b) => a.col0 - b.col0);
  const maxDistanceRaw = Math.max(
    ...parsedRows.map((r) => (r.col2 !== null ? Math.max(r.col0, r.col1) : r.col0))
  );

  const unit: 'km' | 'm' =
    unitOverride !== 'auto'
      ? unitOverride
      : headerUnit ?? (maxDistanceRaw > 200 ? 'm' : 'km');
  const scale = unit === 'km' ? 1000 : 1;

  const segments: WorkoutSegment[] = parsedRows.map((row, idx) => {
    if (row.col2 !== null) {
      const startMeters = Math.max(0, row.col0 * scale);
      const endMeters = Math.max(startMeters + 10, row.col1 * scale);
      return {
        startMeters,
        endMeters,
        targetWatts: Math.max(30, Math.min(1500, Math.round(row.col2))),
        label: row.label,
      };
    }

    const startMeters = Math.max(0, row.col0 * scale);
    const nextStart =
      idx < parsedRows.length - 1 ? parsedRows[idx + 1].col0 * scale : null;
    const prevStep =
      idx > 0
        ? Math.max(200, startMeters - parsedRows[idx - 1].col0 * scale)
        : 1000;
    const endMeters =
      nextStart !== null && nextStart > startMeters
        ? nextStart
        : startMeters + prevStep;

    return {
      startMeters,
      endMeters,
      targetWatts: Math.max(30, Math.min(1500, Math.round(row.col1))),
      label: row.label,
    };
  });

  return {
    id: `wrk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: fileName.replace(/\.[^.]+$/, ''),
    fileName,
    unitDetected: unit,
    segments,
    totalDistanceMeters: segments[segments.length - 1].endMeters,
  };
}

export interface WorkoutTargetLookup {
  targetWatts: number;
  segmentIndex: number;
  segment: WorkoutSegment;
  nextSegment: WorkoutSegment | null;
  distanceToNextMeters: number | null;
}

export function getWorkoutTargetAtDistance(
  workout: DistanceWorkout,
  distanceMeters: number
): WorkoutTargetLookup {
  const segs = workout.segments;
  if (segs.length === 0) {
    return {
      targetWatts: 200,
      segmentIndex: 0,
      segment: { startMeters: 0, endMeters: 1000, targetWatts: 200 },
      nextSegment: null,
      distanceToNextMeters: null,
    };
  }

  if (distanceMeters < segs[0].startMeters) {
    return {
      targetWatts: segs[0].targetWatts,
      segmentIndex: 0,
      segment: segs[0],
      nextSegment: segs.length > 1 ? segs[1] : null,
      distanceToNextMeters: segs[0].endMeters - distanceMeters,
    };
  }

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (distanceMeters >= seg.startMeters && distanceMeters < seg.endMeters) {
      const nextSegment = i < segs.length - 1 ? segs[i + 1] : null;
      return {
        targetWatts: seg.targetWatts,
        segmentIndex: i,
        segment: seg,
        nextSegment,
        distanceToNextMeters: nextSegment ? Math.max(0, seg.endMeters - distanceMeters) : null,
      };
    }
  }

  const last = segs[segs.length - 1];
  return {
    targetWatts: last.targetWatts,
    segmentIndex: segs.length - 1,
    segment: last,
    nextSegment: null,
    distanceToNextMeters: null,
  };
}

export const SAMPLE_WORKOUT_CSV = `distance_km,target_watts,label
0.0,165,Warmup Spin
2.0,210,Steady Tempo
4.5,255,Climb Threshold
7.0,185,Recovery Valley
9.0,285,VO2 Push
11.0,235,Sweet Spot
13.0,160,Cooldown
`;

export const BUILT_IN_WORKOUTS: DistanceWorkout[] = [
  parseDistanceWorkout(SAMPLE_WORKOUT_CSV, 'climb-progression-km.csv', 'km'),
];
