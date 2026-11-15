import { CoachingMode, CoachingStatus, RiderConfig, VirtualGearSpec } from '../types/simulator';

const GRAVITY = 9.80665;
const AIR_DENSITY = 1.225; // kg/m^3 at sea level
const WHEEL_CIRCUMFERENCE_M = 2.105; // 700x28c road tire

/**
 * Authentic 24-speed Zwift Cog & Click v2 virtual gear table.
 * Gear 12 is the neutral 1:1 grade baseline for virtual shifting torque mapping.
 */
export const VIRTUAL_GEARS: VirtualGearSpec[] = [
  { gear: 1, ratio: 0.75, equivalentLabel: '34×45', developmentMeters: 0.75 * WHEEL_CIRCUMFERENCE_M },
  { gear: 2, ratio: 0.83, equivalentLabel: '34×41', developmentMeters: 0.83 * WHEEL_CIRCUMFERENCE_M },
  { gear: 3, ratio: 0.92, equivalentLabel: '34×37', developmentMeters: 0.92 * WHEEL_CIRCUMFERENCE_M },
  { gear: 4, ratio: 1.02, equivalentLabel: '36×35', developmentMeters: 1.02 * WHEEL_CIRCUMFERENCE_M },
  { gear: 5, ratio: 1.12, equivalentLabel: '38×34', developmentMeters: 1.12 * WHEEL_CIRCUMFERENCE_M },
  { gear: 6, ratio: 1.23, equivalentLabel: '39×32', developmentMeters: 1.23 * WHEEL_CIRCUMFERENCE_M },
  { gear: 7, ratio: 1.34, equivalentLabel: '40×30', developmentMeters: 1.34 * WHEEL_CIRCUMFERENCE_M },
  { gear: 8, ratio: 1.46, equivalentLabel: '42×29', developmentMeters: 1.46 * WHEEL_CIRCUMFERENCE_M },
  { gear: 9, ratio: 1.58, equivalentLabel: '42×27', developmentMeters: 1.58 * WHEEL_CIRCUMFERENCE_M },
  { gear: 10, ratio: 1.71, equivalentLabel: '42×25', developmentMeters: 1.71 * WHEEL_CIRCUMFERENCE_M },
  { gear: 11, ratio: 1.84, equivalentLabel: '42×23', developmentMeters: 1.84 * WHEEL_CIRCUMFERENCE_M },
  { gear: 12, ratio: 1.98, equivalentLabel: '42×21', developmentMeters: 1.98 * WHEEL_CIRCUMFERENCE_M },
  { gear: 13, ratio: 2.13, equivalentLabel: '44×21', developmentMeters: 2.13 * WHEEL_CIRCUMFERENCE_M },
  { gear: 14, ratio: 2.28, equivalentLabel: '46×20', developmentMeters: 2.28 * WHEEL_CIRCUMFERENCE_M },
  { gear: 15, ratio: 2.44, equivalentLabel: '48×20', developmentMeters: 2.44 * WHEEL_CIRCUMFERENCE_M },
  { gear: 16, ratio: 2.61, equivalentLabel: '50×19', developmentMeters: 2.61 * WHEEL_CIRCUMFERENCE_M },
  { gear: 17, ratio: 2.78, equivalentLabel: '50×18', developmentMeters: 2.78 * WHEEL_CIRCUMFERENCE_M },
  { gear: 18, ratio: 2.96, equivalentLabel: '52×18', developmentMeters: 2.96 * WHEEL_CIRCUMFERENCE_M },
  { gear: 19, ratio: 3.15, equivalentLabel: '52×17', developmentMeters: 3.15 * WHEEL_CIRCUMFERENCE_M },
  { gear: 20, ratio: 3.35, equivalentLabel: '52×16', developmentMeters: 3.35 * WHEEL_CIRCUMFERENCE_M },
  { gear: 21, ratio: 3.55, equivalentLabel: '54×15', developmentMeters: 3.55 * WHEEL_CIRCUMFERENCE_M },
  { gear: 22, ratio: 3.76, equivalentLabel: '54×14', developmentMeters: 3.76 * WHEEL_CIRCUMFERENCE_M },
  { gear: 23, ratio: 3.98, equivalentLabel: '56×14', developmentMeters: 3.98 * WHEEL_CIRCUMFERENCE_M },
  { gear: 24, ratio: 4.20, equivalentLabel: '58×14', developmentMeters: 4.20 * WHEEL_CIRCUMFERENCE_M },
];

export const DEFAULT_RIDER_CONFIG: RiderConfig = {
  riderWeightKg: 75,
  bikeWeightKg: 8.5,
  cda: 0.32,
  crr: 0.004,
  videoBaseSpeedKmh: 28,
  gradeDifficultyScale: 1.0,
};

export function getVirtualGearSpec(gearIndex: number): VirtualGearSpec {
  const clamped = Math.max(1, Math.min(24, Math.round(gearIndex)));
  return VIRTUAL_GEARS[clamped - 1];
}

/**
 * Computes wheel speed directly from cadence and Zwift Cog virtual gear ratio.
 */
export function computeVirtualDrivetrainSpeedKmh(cadenceRpm: number, gearIndex: number): number {
  if (cadenceRpm <= 0) return 0;
  const spec = getVirtualGearSpec(gearIndex);
  const metersPerMinute = cadenceRpm * spec.developmentMeters;
  return (metersPerMinute * 60) / 1000;
}

/**
 * Computes the effective grade sent to the Wahoo KICKR when using Zwift Cog & Click v2 virtual gears.
 * Shifting up (+) adds positive resistance torque bias; shifting down (-) relieves climb torque so
 * the rider can spin a higher cadence on steep GPX climbs without running out of physical gears.
 */
export function computeEffectiveKickrGrade(
  routeGradePercent: number,
  gearIndex: number,
  difficultyScale = 1.0
): number {
  const neutralRatio = VIRTUAL_GEARS[11].ratio; // Gear 12 (1.98)
  const currentRatio = getVirtualGearSpec(gearIndex).ratio;
  // Logarithmic torque feel scaling: each gear step feels like ~6-7% mechanical cadence/resistance shift
  const gearGradeOffset = Math.log2(currentRatio / neutralRatio) * 5.2;
  const effectiveGrade = routeGradePercent * difficultyScale + gearGradeOffset;
  return Math.max(-18, Math.min(20, Number(effectiveGrade.toFixed(2))));
}

/**
 * In local trainer emulator mode (when physical KICKR isn't connected), estimate wattage
 * produced for a given cadence, virtual gear, and route grade.
 */
export function estimateEmulatorWatts(
  cadenceRpm: number,
  gearIndex: number,
  gradePercent: number,
  config: RiderConfig
): number {
  if (cadenceRpm <= 5) return 0;
  const drivetrainSpeedKmh = computeVirtualDrivetrainSpeedKmh(cadenceRpm, gearIndex);
  const effectiveSpeedKmh = Math.max(4, drivetrainSpeedKmh);
  const powerForSpeed = solvePowerFromSpeed(effectiveSpeedKmh, gradePercent, config);
  // Blend inertial flywheel demand with drivetrain speed so shifting up genuinely demands more watts
  const gearFactor = getVirtualGearSpec(gearIndex).ratio / VIRTUAL_GEARS[11].ratio;
  const cadenceFactor = Math.pow(cadenceRpm / 85, 1.45);
  const baseline = 145 * gearFactor * cadenceFactor + Math.max(0, gradePercent) * 10 * (cadenceRpm / 85);
  return Math.max(25, Math.min(1400, Math.round(0.55 * powerForSpeed + 0.45 * baseline)));
}

/**
 * Solves steady-state road speed (km/h) given power (Watts) and GPX gradient (%)
 * using Newton-Raphson iteration on the cycling power-balance equation.
 */
export function solveSpeedFromPower(
  watts: number,
  gradePercent: number,
  config: RiderConfig
): number {
  if (watts <= 2 && gradePercent >= -0.5) return 0;

  const totalMass = config.riderWeightKg + config.bikeWeightKg;
  const theta = Math.atan(gradePercent / 100);
  const drivetrainEfficiency = 0.975;
  const pWheel = Math.max(0, watts) * drivetrainEfficiency;

  const fGravity = totalMass * GRAVITY * Math.sin(theta);
  const fRolling = totalMass * GRAVITY * config.crr * Math.cos(theta);
  const kAero = 0.5 * AIR_DENSITY * config.cda;

  // Coasting on steep descents has terminal velocity even at 0W
  let v = 8.0; // initial guess m/s (~28.8 km/h)
  for (let i = 0; i < 20; i++) {
    const fTotal = fGravity + fRolling + kAero * v * v;
    const f = v * fTotal - pWheel;
    const df = fGravity + fRolling + 3 * kAero * v * v;
    if (Math.abs(df) < 1e-6) break;
    const nextV = v - f / df;
    if (nextV <= 0.1) {
      v = 0.1;
      break;
    }
    if (Math.abs(nextV - v) < 1e-4) {
      v = nextV;
      break;
    }
    v = nextV;
  }

  // Handle stopped / near-zero power uphill
  if (pWheel <= 1 && fGravity + fRolling >= 0) return 0;

  const kmh = v * 3.6;
  return Math.max(0, Math.min(95, Number(kmh.toFixed(1))));
}

/**
 * Computes required power (Watts) to maintain a given target speed (km/h) on the current GPX gradient.
 */
export function solvePowerFromSpeed(
  speedKmh: number,
  gradePercent: number,
  config: RiderConfig
): number {
  if (speedKmh <= 0) return 0;
  const v = speedKmh / 3.6;
  const totalMass = config.riderWeightKg + config.bikeWeightKg;
  const theta = Math.atan(gradePercent / 100);
  const fGravity = totalMass * GRAVITY * Math.sin(theta);
  const fRolling = totalMass * GRAVITY * config.crr * Math.cos(theta);
  const fAero = 0.5 * AIR_DENSITY * config.cda * v * v;
  const pWheel = v * (fGravity + fRolling + fAero);
  return Math.max(0, Math.round(pWheel / 0.975));
}

/**
 * Evaluates live power & speed against user targets and returns explicit "Harder" / "Easier" / "On Target" cue.
 */
export function evaluateCoaching(params: {
  isActive: boolean;
  watts: number;
  speedKmh: number;
  targetWatts: number;
  wattTolerance: number;
  targetSpeedKmh: number;
  speedToleranceKmh: number;
  coachingMode: CoachingMode;
}): CoachingStatus {
  const {
    isActive,
    watts,
    speedKmh,
    targetWatts,
    wattTolerance,
    targetSpeedKmh,
    speedToleranceKmh,
    coachingMode,
  } = params;

  const wattDelta = Math.round(targetWatts - watts);
  const speedDeltaKmh = Number((targetSpeedKmh - speedKmh).toFixed(1));

  if (!isActive || (watts < 5 && speedKmh < 1)) {
    return {
      cue: 'idle',
      headline: 'READY TO RIDE',
      detail: `Target ${targetWatts} W · ${targetSpeedKmh.toFixed(1)} km/h`,
      wattDelta,
      speedDeltaKmh,
    };
  }

  const wattTooLow = wattDelta > wattTolerance;
  const wattTooHigh = wattDelta < -wattTolerance;
  const speedTooLow = speedDeltaKmh > speedToleranceKmh;
  const speedTooHigh = speedDeltaKmh < -speedToleranceKmh;

  if (coachingMode === 'watts') {
    if (wattTooLow) {
      return {
        cue: 'harder',
        headline: 'PUSH HARDER',
        detail: `+${wattDelta} W needed to hit ${targetWatts} W`,
        wattDelta,
        speedDeltaKmh,
      };
    }
    if (wattTooHigh) {
      return {
        cue: 'easier',
        headline: 'EASIER',
        detail: `${Math.abs(wattDelta)} W over target (${targetWatts} W)`,
        wattDelta,
        speedDeltaKmh,
      };
    }
    return {
      cue: 'on-target',
      headline: 'ON TARGET',
      detail: `Holding ${watts} W within ±${wattTolerance} W`,
      wattDelta,
      speedDeltaKmh,
    };
  }

  if (coachingMode === 'speed') {
    if (speedTooLow) {
      return {
        cue: 'harder',
        headline: 'PUSH HARDER',
        detail: `+${speedDeltaKmh.toFixed(1)} km/h needed for ${targetSpeedKmh.toFixed(1)} km/h`,
        wattDelta,
        speedDeltaKmh,
      };
    }
    if (speedTooHigh) {
      return {
        cue: 'easier',
        headline: 'EASIER',
        detail: `${Math.abs(speedDeltaKmh).toFixed(1)} km/h over target (${targetSpeedKmh.toFixed(1)} km/h)`,
        wattDelta,
        speedDeltaKmh,
      };
    }
    return {
      cue: 'on-target',
      headline: 'ON TARGET',
      detail: `Holding ${speedKmh.toFixed(1)} km/h within ±${speedToleranceKmh.toFixed(1)} km/h`,
      wattDelta,
      speedDeltaKmh,
    };
  }

  // Dual ('both') mode: prioritize power & speed deviations cleanly
  if (wattTooLow || speedTooLow) {
    const parts: string[] = [];
    if (wattTooLow) parts.push(`+${wattDelta} W`);
    if (speedTooLow) parts.push(`+${speedDeltaKmh.toFixed(1)} km/h`);
    return {
      cue: 'harder',
      headline: 'PUSH HARDER',
      detail: `Need ${parts.join(' · ')}`,
      wattDelta,
      speedDeltaKmh,
    };
  }

  if (wattTooHigh || speedTooHigh) {
    const parts: string[] = [];
    if (wattTooHigh) parts.push(`${Math.abs(wattDelta)} W over`);
    if (speedTooHigh) parts.push(`${Math.abs(speedDeltaKmh).toFixed(1)} km/h over`);
    return {
      cue: 'easier',
      headline: 'EASIER',
      detail: parts.join(' · '),
      wattDelta,
      speedDeltaKmh,
    };
  }

  return {
    cue: 'on-target',
    headline: 'ON TARGET',
    detail: `Watts (${watts} W) & Speed (${speedKmh.toFixed(1)} km/h) locked in`,
    wattDelta,
    speedDeltaKmh,
  };
}
