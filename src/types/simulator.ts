export interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
  smoothedEle: number;
  distanceMeters: number;
  gradePercent: number;
  timeSec: number | null;
  recordedSpeedKmh: number | null;
}

export interface GpxCourse {
  id: string;
  name: string;
  fileName: string;
  isBuiltIn: boolean;
  points: GpxPoint[];
  totalDistanceMeters: number;
  totalElevationGainMeters: number;
  minEleMeters: number;
  maxEleMeters: number;
  hasTimestamps: boolean;
  averageRecordedSpeedKmh: number;
  durationSec: number | null;
}

export interface VirtualGearSpec {
  gear: number; // 1 to 24
  ratio: number; // effective drivetrain ratio
  equivalentLabel: string; // e.g. "42×17"
  developmentMeters: number; // meters traveled per crank rev (2.105m wheel * ratio)
}

export type TrainerMode = 'sim' | 'erg';
export type CoachingMode = 'watts' | 'speed' | 'both';
export type EffortCue = 'harder' | 'easier' | 'on-target' | 'idle';

export interface CoachingStatus {
  cue: EffortCue;
  headline: string;
  detail: string;
  wattDelta: number; // positive = need more watts, negative = over target
  speedDeltaKmh: number; // positive = need faster speed, negative = over target
}

export interface RiderConfig {
  riderWeightKg: number;
  bikeWeightKg: number;
  cda: number; // aerodynamic drag area m^2
  crr: number; // rolling resistance coefficient
  videoBaseSpeedKmh: number; // fallback recording speed if GPX lacks timestamps
  gradeDifficultyScale: number; // 0.5 to 1.5 (trainer difficulty, default 1.0)
}

export interface KickrTelemetry {
  connected: boolean;
  connecting: boolean;
  deviceName: string | null;
  watts: number;
  cadenceRpm: number;
  trainerSpeedKmh: number;
  controlGranted: boolean;
  lastCommandSummary: string | null;
  error: string | null;
}

export interface ZwiftClickTelemetry {
  connected: boolean;
  connecting: boolean;
  deviceName: string | null;
  batteryPercent: number | null;
  handshakeComplete: boolean;
  lastButtonPressed: 'up' | 'down' | null;
  lastPacketHex: string | null;
  learnMode: 'up' | 'down' | null;
  customUpSignature: string | null;
  customDownSignature: string | null;
  error: string | null;
}

export interface TelemetrySample {
  elapsedSec: number;
  watts: number;
  targetWatts: number;
  speedKmh: number;
  targetSpeedKmh: number;
  gradePercent: number;
  cadenceRpm: number;
}

export interface WorkoutSegment {
  startMeters: number;
  endMeters: number;
  targetWatts: number;
  label?: string;
}

export interface DistanceWorkout {
  id: string;
  name: string;
  fileName: string;
  unitDetected: 'km' | 'm';
  segments: WorkoutSegment[];
  totalDistanceMeters: number;
}

