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
export type EffortCue = 'harder' | 'easier' | 'on-target' | 'idle';

export interface CoachingStatus {
  cue: EffortCue;
  headline: string;
  detail: string;
  wattDelta: number; // positive = need more watts, negative = over target
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
  gradePercent: number;
  cadenceRpm: number;
}

export interface WorkoutSegment {
  startMeters: number;
  endMeters: number;
  startSec?: number;
  endSec?: number;
  targetWatts: number;
  label?: string;
}

export interface DistanceWorkout {
  id: string;
  name: string;
  fileName: string;
  unitDetected: 'km' | 'm' | 'sec';
  basis?: 'distance' | 'time';
  source?: 'file' | 'intervals';
  ftp?: number;
  segments: WorkoutSegment[];
  totalDistanceMeters: number;
  totalDurationSec?: number;
}

export interface RecordedTrackPoint {
  timestampMs: number;
  elapsedSec: number;
  distanceMeters: number;
  lat: number;
  lon: number;
  elevationMeters: number;
  watts: number;
  cadenceRpm: number;
  speedKmh: number;
  gradePercent: number;
  virtualGear: number;
}

export interface RideSummary {
  courseName: string;
  startTimeMs: number;
  endTimeMs: number;
  elapsedSec: number;
  totalDistanceMeters: number;
  elevationGainMeters: number;
  avgWatts: number;
  maxWatts: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  avgCadenceRpm: number;
  totalWorkKj: number;
  pointCount: number;
}

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  username?: string;
  profile?: string;
}

export interface StravaStatus {
  configured: boolean;
  connected: boolean;
  athlete: StravaAthlete | null;
  callbackUrl?: string;
}

export interface IntervalsAthlete {
  id: string;
  name: string;
  ftp?: number;
}

export interface IntervalsStatus {
  configured: boolean;
  oauthConfigured?: boolean;
  authMode: 'oauth' | 'apikey' | 'none';
  connected: boolean;
  athlete: IntervalsAthlete | null;
  callbackUrl?: string;
}

export interface IntervalsRawStep {
  duration?: number;
  distance?: number;
  reps?: number;
  text?: string;
  ramp?: boolean;
  power?: {
    value?: number;
    start?: number;
    end?: number;
    units?: string;
  };
  _power?: {
    value?: number;
    start?: number;
    end?: number;
  };
  steps?: IntervalsRawStep[];
}

export interface IntervalsWorkoutDoc {
  description?: string;
  duration?: number;
  distance?: number;
  ftp?: number;
  steps?: IntervalsRawStep[];
}

export interface IntervalsRemoteWorkout {
  id: string | number;
  name: string;
  startDateLocal?: string;
  category?: string;
  sourceKind: 'calendar' | 'library';
  description?: string;
  durationSec: number;
  distanceMeters: number;
  ftp?: number;
  workoutDoc?: IntervalsWorkoutDoc;
}



