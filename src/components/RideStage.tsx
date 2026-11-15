import { useEffect, useRef } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Gauge,
  Upload,
  Video as VideoIcon,
} from 'lucide-react';
import {
  CoachingStatus,
  GpxCourse,
  VirtualGearSpec,
} from '../types/simulator';
import { WorkoutTargetLookup } from '../utils/workoutParser';

interface RideStageProps {
  course: GpxCourse;
  videoUrl: string | null;
  videoFileName: string | null;
  isRiding: boolean;
  watts: number;
  targetWatts: number;
  speedKmh: number;
  cadenceRpm: number;
  gradePercent: number;
  distanceMeters: number;
  elapsedSec: number;
  gearSpec: VirtualGearSpec;
  coaching: CoachingStatus;
  workoutLookup?: WorkoutTargetLookup | null;
  videoPlaybackRate: number;
  progress: number;
  onVideoDurationKnown: (durationSec: number) => void;
  onSeekToProgress: (progress: number) => void;
  onOpenCourseUpload: () => void;
  videoElementRef: React.RefObject<HTMLVideoElement | null>;
}

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function RideStage({
  course,
  videoUrl,
  videoFileName,
  isRiding,
  watts,
  targetWatts,
  speedKmh,
  cadenceRpm,
  gradePercent,
  distanceMeters,
  elapsedSec,
  gearSpec,
  coaching,
  workoutLookup,
  videoPlaybackRate,
  progress,
  onVideoDurationKnown,
  onSeekToProgress,
  onOpenCourseUpload,
  videoElementRef,
}: RideStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const roadOffsetRef = useRef(0);

  // Sync HTML5 video playback & speed when a ride video is loaded
  useEffect(() => {
    const vid = videoElementRef.current;
    if (!vid || !videoUrl) return;

    const shouldPlay = isRiding && speedKmh >= 1.2;
    if (shouldPlay) {
      const clampedRate = Math.max(0.25, Math.min(4.0, videoPlaybackRate));
      if (Math.abs(vid.playbackRate - clampedRate) > 0.04) {
        vid.playbackRate = clampedRate;
      }
      if (vid.paused) {
        vid.play().catch(() => {
          // Autoplay guard if user hasn't interacted yet
        });
      }
    } else if (!vid.paused) {
      vid.pause();
    }
  }, [videoUrl, isRiding, speedKmh, videoPlaybackRate, videoElementRef]);

  // Dynamic road & GPX route horizon visualizer when no video is uploaded
  useEffect(() => {
    if (videoUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let lastTs = performance.now();

    const renderFrame = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width * dpr));
      const h = Math.max(200, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      if (isRiding && speedKmh > 0.5) {
        roadOffsetRef.current = (roadOffsetRef.current + (speedKmh / 3.6) * dt * 0.45) % 1;
      }

      // Sky / Night horizon gradient reacting subtly to grade
      const horizonY = h * (0.44 - Math.max(-0.12, Math.min(0.12, gradePercent * 0.008)));
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, '#070A12');
      skyGrad.addColorStop(1, '#111A2E');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, horizonY);

      // Ground plane
      const groundGrad = ctx.createLinearGradient(0, horizonY, 0, h);
      groundGrad.addColorStop(0, '#0B101C');
      groundGrad.addColorStop(1, '#07090E');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Subtle horizon glow
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(w, horizonY);
      ctx.stroke();

      // Perspective cycling road trapezoid
      const roadTopW = w * 0.06;
      const roadBotW = w * 0.62;
      const centerX = w * 0.5;

      ctx.fillStyle = '#131926';
      ctx.beginPath();
      ctx.moveTo(centerX - roadTopW / 2, horizonY);
      ctx.lineTo(centerX + roadTopW / 2, horizonY);
      ctx.lineTo(centerX + roadBotW / 2, h);
      ctx.lineTo(centerX - roadBotW / 2, h);
      ctx.closePath();
      ctx.fill();

      // Road edge lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(centerX - roadTopW / 2, horizonY);
      ctx.lineTo(centerX - roadBotW / 2, h);
      ctx.moveTo(centerX + roadTopW / 2, horizonY);
      ctx.lineTo(centerX + roadBotW / 2, h);
      ctx.stroke();

      // Moving perspective road dashes & distance grid lines
      const numStripes = 12;
      for (let i = 0; i < numStripes; i++) {
        const rawT = (i / numStripes + roadOffsetRef.current) % 1;
        const p = Math.pow(rawT, 2.3); // perspective foreshortening
        const y = horizonY + p * (h - horizonY);
        const halfRoad = (roadTopW / 2) + p * ((roadBotW - roadTopW) / 2);

        // Horizontal distance marker
        ctx.strokeStyle = `rgba(30, 41, 59, ${0.15 + p * 0.45})`;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.moveTo(centerX - halfRoad, y);
        ctx.lineTo(centerX + halfRoad, y);
        ctx.stroke();

        // Center dashed stripe
        const pNext = Math.pow(Math.min(1, rawT + 0.035), 2.3);
        const yNext = horizonY + pNext * (h - horizonY);
        ctx.strokeStyle = `rgba(6, 182, 212, ${0.2 + p * 0.6})`;
        ctx.lineWidth = (1.5 + p * 3.5) * dpr;
        ctx.beginPath();
        ctx.moveTo(centerX, y);
        ctx.lineTo(centerX, yNext);
        ctx.stroke();
      }

      // Draw GPX mini-map polyline in top-right corner of canvas
      const pts = course.points;
      if (pts.length > 2) {
        let minLat = Infinity;
        let maxLat = -Infinity;
        let minLon = Infinity;
        let maxLon = -Infinity;
        for (const pt of pts) {
          if (pt.lat < minLat) minLat = pt.lat;
          if (pt.lat > maxLat) maxLat = pt.lat;
          if (pt.lon < minLon) minLon = pt.lon;
          if (pt.lon > maxLon) maxLon = pt.lon;
        }
        const mapW = 132 * dpr;
        const mapH = 88 * dpr;
        const pad = 16 * dpr;
        const boxX = w - mapW - pad;
        const boxY = pad;

        ctx.fillStyle = 'rgba(11, 14, 23, 0.78)';
        ctx.strokeStyle = 'rgba(28, 35, 51, 0.9)';
        ctx.lineWidth = 1 * dpr;
        ctx.fillRect(boxX, boxY, mapW, mapH);
        ctx.strokeRect(boxX, boxY, mapW, mapH);

        const spanLon = Math.max(0.001, maxLon - minLon);
        const spanLat = Math.max(0.001, maxLat - minLat);
        const innerPad = 12 * dpr;
        const mapInnerW = mapW - innerPad * 2;
        const mapInnerH = mapH - innerPad * 2;

        const toXY = (lat: number, lon: number) => ({
          x: boxX + innerPad + ((lon - minLon) / spanLon) * mapInnerW,
          y: boxY + innerPad + (1 - (lat - minLat) / spanLat) * mapInnerH,
        });

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 1.75 * dpr;
        ctx.beginPath();
        pts.forEach((pt, idx) => {
          const { x, y } = toXY(pt.lat, pt.lon);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Active rider dot on GPX map
        const activeIdx = Math.min(
          pts.length - 1,
          Math.max(0, Math.round(progress * (pts.length - 1)))
        );
        const riderPt = toXY(pts[activeIdx].lat, pts[activeIdx].lon);
        ctx.fillStyle = '#06B6D4';
        ctx.beginPath();
        ctx.arc(riderPt.x, riderPt.y, 4 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [videoUrl, isRiding, speedKmh, gradePercent, course, progress]);

  // Coaching HUD styling (never hue-only: paired with explicit icon & text)
  const cueStyles = {
    harder: {
      container: 'border-amber-500/60 bg-slate-950/90 text-amber-300',
      icon: <ArrowUp className="w-5 h-5 text-amber-400 shrink-0" />,
    },
    easier: {
      container: 'border-rose-500/60 bg-slate-950/90 text-rose-300',
      icon: <ArrowDown className="w-5 h-5 text-rose-400 shrink-0" />,
    },
    'on-target': {
      container: 'border-emerald-500/60 bg-slate-950/90 text-emerald-300',
      icon: <Check className="w-5 h-5 text-emerald-400 shrink-0" />,
    },
    idle: {
      container: 'border-slate-700/80 bg-slate-950/85 text-slate-200',
      icon: <Gauge className="w-5 h-5 text-cyan-400 shrink-0" />,
    },
  }[coaching.cue];

  const totalKm = course.totalDistanceMeters / 1000;
  const currentKm = distanceMeters / 1000;

  return (
    <section
      aria-label="Ride Simulation Viewport"
      className="flex flex-col border border-[#1C2333] bg-[#0B0E17] rounded-lg overflow-hidden"
    >
      {/* Video / Horizon Viewport */}
      <div className="relative w-full aspect-video max-h-[520px] bg-[#07090E] overflow-hidden">
        {videoUrl ? (
          <video
            ref={videoElementRef}
            src={videoUrl}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => {
              const dur = e.currentTarget.duration;
              if (dur && Number.isFinite(dur)) {
                onVideoDurationKnown(dur);
              }
            }}
            onEnded={() => {
              // Loop or stay cleanly at end of route
            }}
            className="w-full h-full object-cover"
          />
        ) : (
          <canvas ref={canvasRef} className="w-full h-full block" />
        )}

        {/* Measured top gradient scrim for HUD legibility */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/75 via-black/30 to-transparent" />

        {/* Top-left course metadata (unboxed text, zero-pill discipline) */}
        <div className="absolute top-3 left-4 flex items-center gap-2 text-xs text-slate-300 font-medium">
          <span className="text-slate-100 font-semibold">{course.name}</span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span className="font-mono">{totalKm.toFixed(1)} km</span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span className="font-mono">+{course.totalElevationGainMeters} m</span>
          {videoFileName && (
            <>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="text-cyan-300 font-mono">
                Video {videoPlaybackRate.toFixed(2)}×
              </span>
            </>
          )}
        </div>

        {/* Top-center Live Target Watt & Speed Coaching HUD */}
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 w-max max-w-[92%]">
          <div
            className={`flex items-center gap-3 px-5 py-2.5 rounded-md border shadow-lg ${cueStyles.container}`}
          >
            {cueStyles.icon}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
              <span className="font-display text-lg sm:text-xl font-bold tracking-wide whitespace-nowrap">
                {coaching.headline}
              </span>
              <span className="font-mono text-xs sm:text-sm text-slate-200 whitespace-nowrap">
                {coaching.detail}
              </span>
            </div>
          </div>
        </div>

        {/* If no video uploaded, offer clean inline Upload Ride Video CTA inside stage */}
        {!videoUrl && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
            <button
              type="button"
              onClick={onOpenCourseUpload}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-700 bg-[#0B0E17]/90 hover:border-cyan-500/60 hover:text-cyan-300 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <VideoIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span>Load Ride Video & GPX File</span>
              <Upload className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        )}
      </div>

      {/* Course Progress Scrub Bar */}
      <div className="px-4 py-2 bg-[#0F131C] border-t border-[#1C2333] flex items-center gap-3">
        <span className="font-mono text-xs text-slate-400 whitespace-nowrap">
          {currentKm.toFixed(2)} km
        </span>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => onSeekToProgress(Number(e.target.value) / 1000)}
          aria-label="Course distance position"
          className="flex-1 h-1.5 accent-cyan-400 cursor-pointer bg-slate-800 rounded"
        />
        <span className="font-mono text-xs text-slate-400 whitespace-nowrap">
          {totalKm.toFixed(2)} km
        </span>
      </div>

      {/* Primary Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-[#1C2333] border-t border-[#1C2333] bg-[#0B0E17]">
        {/* Power */}
        <div className="px-4 py-3">
          <div className="text-[11px] font-medium tracking-wider uppercase text-slate-400">
            3s Avg Power
          </div>
          <div className="mt-1 flex items-baseline">
            <span className="font-mono text-2xl font-bold text-slate-100">{watts}</span>
            <span className="ml-1.5 font-mono text-xs text-slate-400">W</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-400 truncate">
            {workoutLookup
              ? `Target ${targetWatts} W${
                  workoutLookup.nextSegment && workoutLookup.secondsToNext !== null
                    ? ` · Next ${workoutLookup.nextSegment.targetWatts} W (${Math.floor(workoutLookup.secondsToNext / 60)}:${String(workoutLookup.secondsToNext % 60).padStart(2, '0')})`
                    : workoutLookup.nextSegment && workoutLookup.distanceToNextMeters !== null
                    ? ` · Next ${workoutLookup.nextSegment.targetWatts} W (${(workoutLookup.distanceToNextMeters / 1000).toFixed(2)} km)`
                    : ''
                }`
              : `Target ${targetWatts} W`}
          </div>
        </div>

        {/* Speed */}
        <div className="px-4 py-3">
          <div className="text-[11px] font-medium tracking-wider uppercase text-slate-400">
            Sim Speed
          </div>
          <div className="mt-1 flex items-baseline">
            <span className="font-mono text-2xl font-bold text-cyan-400">
              {speedKmh.toFixed(1)}
            </span>
            <span className="ml-1.5 font-mono text-xs text-slate-400">km/h</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-400">
            GPX road physics
          </div>
        </div>

        {/* Cadence */}
        <div className="px-4 py-3">
          <div className="text-[11px] font-medium tracking-wider uppercase text-slate-400">
            Cadence
          </div>
          <div className="mt-1 flex items-baseline">
            <span className="font-mono text-2xl font-bold text-slate-100">
              {cadenceRpm}
            </span>
            <span className="ml-1.5 font-mono text-xs text-slate-400">rpm</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-400">
            Crank speed
          </div>
        </div>

        {/* Grade */}
        <div className="px-4 py-3">
          <div className="text-[11px] font-medium tracking-wider uppercase text-slate-400">
            GPX Grade
          </div>
          <div className="mt-1 flex items-baseline">
            <span
              className={`font-mono text-2xl font-bold ${
                gradePercent >= 6
                  ? 'text-rose-400'
                  : gradePercent >= 2
                  ? 'text-amber-400'
                  : gradePercent <= -2
                  ? 'text-emerald-400'
                  : 'text-slate-100'
              }`}
            >
              {gradePercent >= 0 ? `+${gradePercent.toFixed(1)}` : gradePercent.toFixed(1)}
            </span>
            <span className="ml-1.5 font-mono text-xs text-slate-400">%</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-400">
            Live slope
          </div>
        </div>

        {/* Virtual Gear */}
        <div className="px-4 py-3">
          <div className="text-[11px] font-medium tracking-wider uppercase text-slate-400">
            Virtual Gear
          </div>
          <div className="mt-1 flex items-baseline">
            <span className="font-mono text-2xl font-bold text-slate-100">
              {gearSpec.gear}
            </span>
            <span className="ml-1.5 font-mono text-xs text-slate-400">/ 24</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-400">
            {gearSpec.equivalentLabel} · {gearSpec.ratio.toFixed(2)}×
          </div>
        </div>

        {/* Elapsed */}
        <div className="px-4 py-3">
          <div className="text-[11px] font-medium tracking-wider uppercase text-slate-400">
            Elapsed Time
          </div>
          <div className="mt-1 flex items-baseline">
            <span className="font-mono text-2xl font-bold text-slate-100">
              {formatDuration(elapsedSec)}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-400">
            {(progress * 100).toFixed(1)}% complete
          </div>
        </div>
      </div>
    </section>
  );
}
