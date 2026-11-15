import { useRef, useState } from 'react';
import { Check, Download, FileCode, MapPin, Trash2, Upload, Video, Zap } from 'lucide-react';
import { DistanceWorkout, GpxCourse, RiderConfig } from '../types/simulator';
import { DistanceUnitMode, SAMPLE_WORKOUT_CSV } from '../utils/workoutParser';

interface CourseVideoPanelProps {
  courses: GpxCourse[];
  activeCourse: GpxCourse;
  onSelectCourse: (courseId: string) => void;
  onUploadGpxFile: (file: File) => Promise<void>;
  videoFileName: string | null;
  videoDurationSec: number | null;
  onUploadVideoFile: (file: File) => void;
  onClearVideo: () => void;
  activeWorkout: DistanceWorkout | null;
  workoutModeEnabled: boolean;
  workoutUnitMode: DistanceUnitMode;
  onChangeWorkoutUnitMode: (mode: DistanceUnitMode) => void;
  onUploadWorkoutFile: (file: File) => Promise<void>;
  onLoadSampleWorkout: () => void;
  onClearWorkout: () => void;
  riderConfig: RiderConfig;
  onUpdateRiderConfig: (patch: Partial<RiderConfig>) => void;
  videoPlaybackRate: number;
  onBackToCockpit: () => void;
}

export function CourseVideoPanel({
  courses,
  activeCourse,
  onSelectCourse,
  onUploadGpxFile,
  videoFileName,
  videoDurationSec,
  onUploadVideoFile,
  onClearVideo,
  activeWorkout,
  workoutModeEnabled,
  workoutUnitMode,
  onChangeWorkoutUnitMode,
  onUploadWorkoutFile,
  onLoadSampleWorkout,
  onClearWorkout,
  riderConfig,
  onUpdateRiderConfig,
  videoPlaybackRate,
  onBackToCockpit,
}: CourseVideoPanelProps) {
  const gpxInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const workoutInputRef = useRef<HTMLInputElement | null>(null);
  const [gpxError, setGpxError] = useState<string | null>(null);
  const [workoutError, setWorkoutError] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<'gpx' | 'video' | 'workout' | null>(null);

  const handleGpxFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setGpxError(null);
    try {
      await onUploadGpxFile(files[0]);
    } catch (err) {
      setGpxError(err instanceof Error ? err.message : 'Unable to parse GPX file.');
    }
  };

  const handleVideoFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onUploadVideoFile(files[0]);
  };

  const handleWorkoutFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setWorkoutError(null);
    try {
      await onUploadWorkoutFile(files[0]);
    } catch (err) {
      setWorkoutError(err instanceof Error ? err.message : 'Unable to parse workout file.');
    }
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_WORKOUT_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'distance-workout-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1C2333] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">
            Course GPX, Ride Video & Distance Workout
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Upload a GPX track, ride video, and a distance-based wattage workout (.csv, .json, or .txt) to automatically adjust target watts as you ride.
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToCockpit}
          className="px-4 py-2 rounded-md bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 transition-colors whitespace-nowrap self-start"
        >
          Return to Ride Cockpit
        </button>
      </div>

      {/* Upload Dropzones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* GPX Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragTarget('gpx');
          }}
          onDragLeave={() => setDragTarget(null)}
          onDrop={(e) => {
            e.preventDefault();
            setDragTarget(null);
            handleGpxFiles(e.dataTransfer.files);
          }}
          className={`border rounded-lg p-6 transition-colors ${
            dragTarget === 'gpx'
              ? 'border-cyan-400 bg-cyan-500/10'
              : 'border-[#1C2333] bg-[#0B0E17]'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-[#111622] border border-[#1C2333] flex items-center justify-center">
                <MapPin className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  GPX Route File
                </h2>
                <p className="text-xs text-slate-400">
                  Determines road grade, elevation gain & speed physics
                </p>
              </div>
            </div>
          </div>

          <input
            ref={gpxInputRef}
            type="file"
            accept=".gpx,application/gpx+xml,text/xml"
            className="hidden"
            onChange={(e) => handleGpxFiles(e.target.files)}
          />

          <div className="mt-5 flex items-center justify-between gap-4 pt-4 border-t border-[#1C2333]">
            <div className="text-xs text-slate-300 truncate">
              Active: <span className="font-mono text-cyan-300">{activeCourse.fileName}</span>
            </div>
            <button
              type="button"
              onClick={() => gpxInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#111622] border border-slate-700 hover:border-cyan-500/60 text-xs font-semibold text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              Upload .GPX
            </button>
          </div>
          {gpxError && <p className="mt-3 text-xs text-rose-400">{gpxError}</p>}
        </div>

        {/* Video Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragTarget('video');
          }}
          onDragLeave={() => setDragTarget(null)}
          onDrop={(e) => {
            e.preventDefault();
            setDragTarget(null);
            handleVideoFiles(e.dataTransfer.files);
          }}
          className={`border rounded-lg p-6 transition-colors ${
            dragTarget === 'video'
              ? 'border-cyan-400 bg-cyan-500/10'
              : 'border-[#1C2333] bg-[#0B0E17]'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-[#111622] border border-[#1C2333] flex items-center justify-center">
                <Video className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-slate-100">
                  Ride Video (.mp4 / .webm / .mov)
                </h2>
                <p className="text-xs text-slate-400">
                  Playback speed dynamically tracks your live cycling speed
                </p>
              </div>
            </div>
          </div>

          <input
            ref={videoInputRef}
            type="file"
            accept="video/*,.mp4,.webm,.mov,.m4v"
            className="hidden"
            onChange={(e) => handleVideoFiles(e.target.files)}
          />

          <div className="mt-5 flex items-center justify-between gap-3 pt-4 border-t border-[#1C2333]">
            <div className="text-xs text-slate-300 truncate">
              {videoFileName ? (
                <span className="font-mono text-emerald-300">
                  {videoFileName}
                  {videoDurationSec ? ` (${Math.round(videoDurationSec / 60)}m)` : ''}
                </span>
              ) : (
                <span className="text-slate-500">No video loaded (horizon canvas active)</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {videoFileName && (
                <button
                  type="button"
                  onClick={onClearVideo}
                  title="Remove loaded video"
                  className="p-2 rounded-md border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#111622] border border-slate-700 hover:border-cyan-500/60 text-xs font-semibold text-slate-100 transition-colors whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5 text-cyan-400" />
                {videoFileName ? 'Replace Video' : 'Upload Video'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Distance Wattage Workout Upload */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragTarget('workout');
        }}
        onDragLeave={() => setDragTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDragTarget(null);
          handleWorkoutFiles(e.dataTransfer.files);
        }}
        className={`border rounded-lg p-6 space-y-4 transition-colors ${
          dragTarget === 'workout'
            ? 'border-cyan-400 bg-cyan-500/10'
            : 'border-[#1C2333] bg-[#0B0E17]'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-[#111622] border border-[#1C2333] flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Distance Target Watt Workout (.csv / .json / .txt)
              </h2>
              <p className="text-xs text-slate-400">
                Set target watts per unit of distance (e.g., <span className="font-mono text-slate-300">distance_km,target_watts</span> or <span className="font-mono text-slate-300">start_km,end_km,watts,label</span>)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Unit override */}
            <div className="flex items-center gap-1 p-1 rounded-md bg-[#111622] border border-[#1C2333]">
              {(['auto', 'km', 'm'] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => onChangeWorkoutUnitMode(unit)}
                  className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                    workoutUnitMode === unit
                      ? 'bg-slate-200 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {unit === 'auto' ? 'Auto' : unit}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-700 bg-[#111622] hover:border-slate-500 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              CSV Template
            </button>

            <button
              type="button"
              onClick={onLoadSampleWorkout}
              className="px-3 py-2 rounded-md border border-slate-700 bg-[#111622] hover:border-emerald-500/50 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              Load Sample
            </button>

            {activeWorkout && (
              <button
                type="button"
                onClick={onClearWorkout}
                title="Clear loaded workout"
                className="p-2 rounded-md border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <input
              ref={workoutInputRef}
              type="file"
              accept=".csv,.txt,.json,text/csv,application/json"
              className="hidden"
              onChange={(e) => handleWorkoutFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => workoutInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 text-xs font-semibold text-emerald-300 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              {activeWorkout ? 'Replace Workout' : 'Upload Workout'}
            </button>
          </div>
        </div>

        {workoutError && <p className="text-xs text-rose-400">{workoutError}</p>}

        {activeWorkout && (
          <div className="pt-3 border-t border-[#1C2333] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-slate-300">
                Loaded: <span className="font-mono text-emerald-300">{activeWorkout.fileName}</span>
                <span aria-hidden="true" className="mx-2 text-slate-600">·</span>
                <span>{activeWorkout.segments.length} distance blocks</span>
                <span aria-hidden="true" className="mx-2 text-slate-600">·</span>
                <span className="font-mono">
                  Covers {(activeWorkout.totalDistanceMeters / 1000).toFixed(2)} km (parsed as {activeWorkout.unitDetected})
                </span>
              </div>
              <span className="font-mono text-xs text-slate-400">
                {workoutModeEnabled ? '● Active in Cockpit' : 'Paused (Manual target active)'}
              </span>
            </div>

            {/* Segment Preview Table */}
            <div className="max-h-48 overflow-y-auto border border-[#1C2333] rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#111622] text-slate-400 sticky top-0">
                  <tr>
                    <th className="py-2 px-3 font-medium">Distance Range</th>
                    <th className="py-2 px-3 font-medium">Segment</th>
                    <th className="py-2 px-3 font-medium text-right">Target Watts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C2333] font-mono">
                  {activeWorkout.segments.map((seg, idx) => (
                    <tr key={`${seg.startMeters}-${idx}`} className="text-slate-200">
                      <td className="py-1.5 px-3">
                        {(seg.startMeters / 1000).toFixed(2)} – {(seg.endMeters / 1000).toFixed(2)} km
                      </td>
                      <td className="py-1.5 px-3 font-sans text-slate-400">
                        {seg.label || `Block ${idx + 1}`}
                      </td>
                      <td className="py-1.5 px-3 text-right font-semibold text-emerald-400">
                        {seg.targetWatts} W
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Video & GPX Speed Calibration */}
      <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-100">
              GPX & Video Speed Mapping
            </h3>
            <p className="text-xs text-slate-400">
              {activeCourse.hasTimestamps
                ? 'Your GPX contains GPS timestamps. Video playback rate scales automatically against the recorded GPX camera speed at your current distance.'
                : 'Your GPX does not include timestamps. Set the baseline camera recording speed below to calibrate video playback rate.'}
            </p>
          </div>
          <div className="font-mono text-sm text-cyan-400 whitespace-nowrap">
            Sync Rate: {videoPlaybackRate.toFixed(2)}×
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-[#1C2333]">
          <div>
            <div className="text-xs text-slate-400">Active Course Distance</div>
            <div className="font-mono text-lg font-semibold text-slate-100 mt-0.5">
              {(activeCourse.totalDistanceMeters / 1000).toFixed(2)} km
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Total Elevation Gain</div>
            <div className="font-mono text-lg font-semibold text-slate-100 mt-0.5">
              +{activeCourse.totalElevationGainMeters} m
            </div>
          </div>
          <div>
            <label htmlFor="video-base-speed" className="text-xs text-slate-400 block">
              Video Recording Base Speed ({riderConfig.videoBaseSpeedKmh} km/h)
            </label>
            <input
              id="video-base-speed"
              type="range"
              min={10}
              max={48}
              step={1}
              value={riderConfig.videoBaseSpeedKmh}
              onChange={(e) =>
                onUpdateRiderConfig({ videoBaseSpeedKmh: Number(e.target.value) })
              }
              className="mt-2 w-full h-1.5 accent-cyan-400 bg-slate-800 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Course Library */}
      <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-slate-100">
          Available GPX Routes
        </h3>
        <div className="divide-y divide-[#1C2333]">
          {courses.map((c) => {
            const isSelected = c.id === activeCourse.id;
            return (
              <div
                key={c.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <FileCode className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-slate-100">{c.name}</div>
                    <div className="text-xs font-mono text-slate-400">
                      {(c.totalDistanceMeters / 1000).toFixed(1)} km · +{c.totalElevationGainMeters} m ·{' '}
                      {c.hasTimestamps
                        ? `GPS Timed (avg ${c.averageRecordedSpeedKmh} km/h)`
                        : 'Route Geometry Only'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectCourse(c.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap self-start sm:self-center ${
                    isSelected
                      ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                      : 'bg-[#111622] border border-slate-700 text-slate-200 hover:border-cyan-500/50'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                  {isSelected ? 'Active Course' : 'Select Route'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

