import {
  Bell,
  BellOff,
  Bluetooth,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  RotateCcw,
  Upload,
  UploadCloud,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  DistanceWorkout,
  IntervalsStatus,
  KickrTelemetry,
  StravaStatus,
  TrainerMode,
  VirtualGearSpec,
  ZwiftClickTelemetry,
} from '../types/simulator';
import { WorkoutTargetLookup } from '../utils/workoutParser';

interface ControlSidebarProps {
  kickr: KickrTelemetry;
  zwiftClick: ZwiftClickTelemetry;
  onConnectKickr: () => void;
  onDisconnectKickr: () => void;
  onConnectZwiftClick: () => void;
  onDisconnectZwiftClick: () => void;
  emulatorCadenceRpm: number;
  onChangeEmulatorCadence: (rpm: number) => void;
  virtualGear: number;
  gearSpec: VirtualGearSpec;
  onShiftGear: (delta: number) => void;
  trainerMode: TrainerMode;
  onChangeTrainerMode: (mode: TrainerMode) => void;
  targetWatts: number;
  onChangeTargetWatts: (watts: number) => void;
  activeWorkout: DistanceWorkout | null;
  workoutModeEnabled: boolean;
  onToggleWorkoutMode: (enabled: boolean) => void;
  workoutLookup: WorkoutTargetLookup | null;
  audioCueEnabled: boolean;
  onToggleAudioCue: () => void;
  intervalBeepEnabled: boolean;
  onToggleIntervalBeep: () => void;
  onResetRide: () => void;
  onOpenCourseUpload: () => void;
  recordedPointCount: number;
  onOpenExportModal: () => void;
  stravaStatus: StravaStatus;
  onOpenStravaModal: () => void;
  intervalsStatus: IntervalsStatus;
  onOpenIntervalsModal: () => void;
}

export function ControlSidebar({
  kickr,
  zwiftClick,
  onConnectKickr,
  onDisconnectKickr,
  onConnectZwiftClick,
  onDisconnectZwiftClick,
  emulatorCadenceRpm,
  onChangeEmulatorCadence,
  virtualGear,
  gearSpec,
  onShiftGear,
  trainerMode,
  onChangeTrainerMode,
  targetWatts,
  onChangeTargetWatts,
  activeWorkout,
  workoutModeEnabled,
  onToggleWorkoutMode,
  workoutLookup,
  audioCueEnabled,
  onToggleAudioCue,
  intervalBeepEnabled,
  onToggleIntervalBeep,
  onResetRide,
  onOpenCourseUpload,
  recordedPointCount,
  onOpenExportModal,
  stravaStatus,
  onOpenStravaModal,
  intervalsStatus,
  onOpenIntervalsModal,
}: ControlSidebarProps) {
  const isWorkoutActive = Boolean(activeWorkout && workoutModeEnabled && workoutLookup);

  return (
    <aside
      aria-label="Trainer and Coaching Controls"
      className="w-full lg:w-[340px] shrink-0 flex flex-col gap-4"
    >
      {/* 1. Bluetooth Hardware Pairing */}
      <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Bluetooth Hardware
          </h2>
          <button
            type="button"
            onClick={onOpenCourseUpload}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            Load Files
          </button>
        </div>

        {/* Wahoo KICKR */}
        <div className="pt-3 border-t border-[#1C2333] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-100 truncate">
              {kickr.deviceName || 'Wahoo KICKR'}
            </div>
            <div className="text-xs font-mono text-slate-400 truncate">
              {kickr.connecting ? (
                <span className="text-cyan-400">Pairing trainer...</span>
              ) : kickr.connected ? (
                <span className="text-emerald-400">● Connected · FTMS</span>
              ) : (
                <span>Not connected</span>
              )}
            </div>
          </div>
          {kickr.connected ? (
            <button
              type="button"
              onClick={onDisconnectKickr}
              className="px-3 py-1.5 rounded-md border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnectKickr}
              disabled={kickr.connecting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/15 border border-cyan-500/40 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Bluetooth className="w-3.5 h-3.5" />
              Connect
            </button>
          )}
        </div>
        {kickr.error && (
          <p className="text-xs text-rose-400">{kickr.error}</p>
        )}

        {/* Zwift Click v2 */}
        <div className="pt-3 border-t border-[#1C2333] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-100 truncate">
              {zwiftClick.deviceName || 'Zwift Click v2'}
            </div>
            <div className="text-xs font-mono text-slate-400 truncate">
              {zwiftClick.connecting ? (
                <span className="text-cyan-400">Pairing shifter...</span>
              ) : zwiftClick.connected ? (
                <span className="text-emerald-400">
                  ● Connected
                  {zwiftClick.batteryPercent !== null
                    ? ` · ${zwiftClick.batteryPercent}%`
                    : ''}
                </span>
              ) : (
                <span>Not connected</span>
              )}
            </div>
          </div>
          {zwiftClick.connected ? (
            <button
              type="button"
              onClick={onDisconnectZwiftClick}
              className="px-3 py-1.5 rounded-md border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnectZwiftClick}
              disabled={zwiftClick.connecting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Bluetooth className="w-3.5 h-3.5" />
              Connect
            </button>
          )}
        </div>
        {zwiftClick.error && (
          <p className="text-xs text-rose-400">{zwiftClick.error}</p>
        )}

        {/* Local Cadence Simulator when physical KICKR isn't connected */}
        {!kickr.connected && (
          <div className="pt-3 border-t border-[#1C2333] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">
                Trainer Simulator Cadence
              </span>
              <span className="font-mono font-semibold text-cyan-400">
                {emulatorCadenceRpm} rpm
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={130}
              step={1}
              value={emulatorCadenceRpm}
              onChange={(e) => onChangeEmulatorCadence(Number(e.target.value))}
              aria-label="Simulated trainer cadence RPM"
              className="w-full h-1.5 accent-cyan-400 bg-slate-800 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-500">
              <span>0 rpm</span>
              <span>85 rpm</span>
              <span>130 rpm</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Zwift Cog & Click v2 Virtual Gearing */}
      <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Zwift Cog Virtual Gears
          </h2>
          <span className="font-mono text-xs text-slate-400">
            {gearSpec.equivalentLabel} · {gearSpec.ratio.toFixed(2)}×
          </span>
        </div>

        {/* 24-gear ladder indicator */}
        <div className="grid grid-cols-12 gap-1 py-1" aria-hidden="true">
          {Array.from({ length: 24 }, (_, idx) => {
            const g = idx + 1;
            const active = g === virtualGear;
            const filled = g < virtualGear;
            return (
              <button
                key={g}
                type="button"
                onClick={() => onShiftGear(g - virtualGear)}
                title={`Gear ${g}`}
                className={`h-2.5 rounded-xs transition-colors ${
                  active
                    ? 'bg-cyan-400'
                    : filled
                    ? 'bg-cyan-500/35 hover:bg-cyan-500/60'
                    : 'bg-slate-800 hover:bg-slate-700'
                }`}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onShiftGear(-1)}
            disabled={virtualGear <= 1}
            className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-md border border-[#1C2333] bg-[#111622] hover:bg-slate-800 disabled:opacity-40 text-sm font-semibold text-slate-200 transition-colors whitespace-nowrap"
          >
            <ChevronDown className="w-4 h-4 text-emerald-400" />
            Easier (-)
          </button>

          <div className="px-3 text-center shrink-0">
            <div className="font-mono text-2xl font-bold text-slate-100 leading-none">
              {virtualGear}
            </div>
            <div className="font-mono text-[10px] text-slate-400 mt-1">
              of 24
            </div>
          </div>

          <button
            type="button"
            onClick={() => onShiftGear(1)}
            disabled={virtualGear >= 24}
            className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-md border border-[#1C2333] bg-[#111622] hover:bg-slate-800 disabled:opacity-40 text-sm font-semibold text-slate-200 transition-colors whitespace-nowrap"
          >
            Harder (+)
            <ChevronUp className="w-4 h-4 text-amber-400" />
          </button>
        </div>

        <p className="text-[11px] text-slate-400">
          Use Zwift Click v2 buttons or keyboard <span className="font-mono text-slate-300">-</span> / <span className="font-mono text-slate-300">+</span> (<span className="font-mono text-slate-300">↓</span> / <span className="font-mono text-slate-300">↑</span>).
        </p>
      </div>

      {/* 3. Target Watt & Speed Coaching */}
      <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Target & Resistance
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleIntervalBeep}
              aria-pressed={intervalBeepEnabled}
              title={
                intervalBeepEnabled
                  ? 'Disable 5s pre-interval countdown beeps'
                  : 'Enable 5s pre-interval countdown beeps'
              }
              className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium transition-colors whitespace-nowrap ${
                intervalBeepEnabled
                  ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                  : 'border-[#1C2333] text-slate-400 hover:text-slate-100 hover:border-slate-600'
              }`}
            >
              {intervalBeepEnabled ? (
                <Bell className="w-3 h-3" />
              ) : (
                <BellOff className="w-3 h-3" />
              )}
              <span>5s Beeps: {intervalBeepEnabled ? 'On' : 'Off'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleAudioCue}
              title={audioCueEnabled ? 'Mute zone cue chime' : 'Enable zone cue chime'}
              className="p-1.5 rounded border border-[#1C2333] text-slate-400 hover:text-slate-100 hover:border-slate-600 transition-colors"
            >
              {audioCueEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={onResetRide}
              title="Reset ride distance & timer"
              className="p-1.5 rounded border border-[#1C2333] text-slate-400 hover:text-slate-100 hover:border-slate-600 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Target Watts Source & Control */}
        <div className="space-y-2.5 pt-2 border-t border-[#1C2333]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-300">Target Watts</span>
            {activeWorkout ? (
              <div className="flex items-center gap-1 p-0.5 rounded bg-[#111622] border border-[#1C2333]">
                <button
                  type="button"
                  onClick={() => onToggleWorkoutMode(true)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    workoutModeEnabled
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Workout
                </button>
                <button
                  type="button"
                  onClick={() => onToggleWorkoutMode(false)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    !workoutModeEnabled
                      ? 'bg-slate-200 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Manual
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenCourseUpload}
                className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                + Upload Distance Workout
              </button>
            )}
          </div>

          {isWorkoutActive && activeWorkout && workoutLookup ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-emerald-300 truncate">
                  {workoutLookup.segment.label || `Block ${workoutLookup.segmentIndex + 1}`}
                </span>
                <span className="font-mono text-lg font-bold text-slate-100">
                  {workoutLookup.targetWatts} W
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="truncate">{activeWorkout.name}</span>
                {workoutLookup.nextSegment && workoutLookup.secondsToNext !== null ? (
                  <span className="text-slate-300 shrink-0 ml-2">
                    Next {workoutLookup.nextSegment.targetWatts} W in{' '}
                    {Math.floor(workoutLookup.secondsToNext / 60)}:
                    {String(workoutLookup.secondsToNext % 60).padStart(2, '0')}
                  </span>
                ) : workoutLookup.nextSegment && workoutLookup.distanceToNextMeters !== null ? (
                  <span className="text-slate-300 shrink-0 ml-2">
                    Next {workoutLookup.nextSegment.targetWatts} W in{' '}
                    {(workoutLookup.distanceToNextMeters / 1000).toFixed(2)} km
                  </span>
                ) : (
                  <span className="shrink-0 ml-2">Final block</span>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <label htmlFor="target-watts-range" className="text-[11px] text-slate-400">
                  Manual Watt Target
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChangeTargetWatts(Math.max(50, targetWatts - 10))}
                    aria-label="Decrease target watts by 10"
                    className="w-7 h-7 inline-flex items-center justify-center rounded border border-[#1C2333] bg-[#111622] hover:bg-slate-800 text-slate-300"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="font-mono text-sm font-bold text-slate-100 w-16 text-center">
                    {targetWatts} W
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeTargetWatts(Math.min(600, targetWatts + 10))}
                    aria-label="Increase target watts by 10"
                    className="w-7 h-7 inline-flex items-center justify-center rounded border border-[#1C2333] bg-[#111622] hover:bg-slate-800 text-slate-300"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <input
                id="target-watts-range"
                type="range"
                min={60}
                max={500}
                step={5}
                value={targetWatts}
                onChange={(e) => onChangeTargetWatts(Number(e.target.value))}
                className="w-full h-1.5 accent-cyan-400 bg-slate-800 rounded cursor-pointer"
              />
            </>
          )}
        </div>

        {/* KICKR Resistance Mode */}
        <div className="space-y-1.5 pt-2 border-t border-[#1C2333]">
          <span className="text-xs text-slate-400">KICKR Resistance Mode</span>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-[#111622] border border-[#1C2333]">
            <button
              type="button"
              onClick={() => onChangeTrainerMode('sim')}
              className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                trainerMode === 'sim'
                  ? 'bg-slate-100 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              SIM (GPX + Gears)
            </button>
            <button
              type="button"
              onClick={() => onChangeTrainerMode('erg')}
              className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                trainerMode === 'erg'
                  ? 'bg-slate-100 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ERG ({isWorkoutActive && workoutLookup ? workoutLookup.targetWatts : targetWatts} W)
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-[#1C2333] space-y-2">
          <button
            type="button"
            disabled={recordedPointCount < 2}
            onClick={onOpenExportModal}
            className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-md border border-slate-700 bg-[#111622] hover:border-cyan-500/60 hover:text-cyan-300 disabled:opacity-40 text-xs font-semibold text-slate-200 transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5 text-cyan-400" />
            Finish & Export / Strava ({recordedPointCount}s)
          </button>

          <div className="flex items-center justify-between text-[11px] pt-1">
            <span className="text-slate-400">
              {stravaStatus.connected && stravaStatus.athlete
                ? `Strava: ${stravaStatus.athlete.firstname} ${stravaStatus.athlete.lastname}`
                : 'Strava Account'}
            </span>
            <button
              type="button"
              onClick={onOpenStravaModal}
              className="font-semibold text-[#FC4C02] hover:text-[#ff6d30] transition-colors"
            >
              {stravaStatus.connected ? 'Manage' : 'Connect via Browser'}
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 truncate pr-2">
              {intervalsStatus.connected && intervalsStatus.athlete
                ? `Intervals.icu: ${intervalsStatus.athlete.name}`
                : 'Intervals.icu'}
            </span>
            <button
              type="button"
              onClick={onOpenIntervalsModal}
              className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors shrink-0"
            >
              {intervalsStatus.connected ? 'Manage' : 'Connect via Browser'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

