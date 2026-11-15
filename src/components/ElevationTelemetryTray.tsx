import { useMemo, useState } from 'react';
import { DistanceWorkout, GpxCourse, TelemetrySample } from '../types/simulator';
import { getWorkoutTargetAtDistance } from '../utils/workoutParser';

interface ElevationTelemetryTrayProps {
  course: GpxCourse;
  distanceMeters: number;
  currentEleMeters: number;
  samples: TelemetrySample[];
  targetWatts: number;
  wattTolerance: number;
  activeWorkout: DistanceWorkout | null;
  workoutModeEnabled: boolean;
  onSeekToProgress: (progress: number) => void;
}

export function ElevationTelemetryTray({
  course,
  distanceMeters,
  currentEleMeters,
  samples,
  targetWatts,
  wattTolerance,
  activeWorkout,
  workoutModeEnabled,
  onSeekToProgress,
}: ElevationTelemetryTrayProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const chartWidth = 640;
  const chartHeight = 128;
  const padX = 8;
  const padY = 12;

  const profileData = useMemo(() => {
    const pts = course.points;
    if (pts.length < 2) return null;

    const maxPts = 160;
    const step = Math.max(1, Math.floor(pts.length / maxPts));
    const sampled = pts.filter((_, idx) => idx % step === 0 || idx === pts.length - 1);

    const minEle = course.minEleMeters;
    const maxEle = Math.max(minEle + 10, course.maxEleMeters);
    const totalDist = Math.max(1, course.totalDistanceMeters);

    const coords = sampled.map((pt) => {
      const x = padX + (pt.distanceMeters / totalDist) * (chartWidth - padX * 2);
      const normY = (pt.smoothedEle - minEle) / (maxEle - minEle);
      const y = chartHeight - padY - normY * (chartHeight - padY * 2);
      return { x, y, pt };
    });

    const linePath = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${chartHeight} L ${coords[0].x.toFixed(1)} ${chartHeight} Z`;

    return { coords, linePath, areaPath, totalDist, minEle, maxEle };
  }, [course]);

  // Stepped target watt overlay path when a distance-based workout is active
  const workoutStepPath = useMemo(() => {
    if (
      !activeWorkout ||
      !workoutModeEnabled ||
      activeWorkout.basis === 'time' ||
      activeWorkout.segments.length === 0
    ) {
      return null;
    }
    const totalDist = Math.max(1, course.totalDistanceMeters);
    const maxW = Math.max(350, ...activeWorkout.segments.map((s) => s.targetWatts + 40));
    const minW = 50;

    const mapX = (m: number) =>
      padX + (Math.max(0, Math.min(totalDist, m)) / totalDist) * (chartWidth - padX * 2);
    const mapY = (w: number) => {
      const norm = (Math.max(minW, w) - minW) / (maxW - minW);
      return chartHeight - padY - norm * (chartHeight - padY * 2);
    };

    const cmds: string[] = [];
    activeWorkout.segments.forEach((seg, idx) => {
      if (seg.startMeters > totalDist) return;
      const x1 = mapX(seg.startMeters);
      const x2 = mapX(Math.min(totalDist, seg.endMeters));
      const y = mapY(seg.targetWatts);
      if (idx === 0) {
        cmds.push(`M ${x1.toFixed(1)} ${y.toFixed(1)}`);
      } else {
        cmds.push(`L ${x1.toFixed(1)} ${y.toFixed(1)}`);
      }
      cmds.push(`L ${x2.toFixed(1)} ${y.toFixed(1)}`);
    });

    // Extend final segment to end of course if workout is shorter than GPX
    const lastSeg = activeWorkout.segments[activeWorkout.segments.length - 1];
    if (lastSeg && lastSeg.endMeters < totalDist) {
      cmds.push(`L ${mapX(totalDist).toFixed(1)} ${mapY(lastSeg.targetWatts).toFixed(1)}`);
    }

    return cmds.join(' ');
  }, [activeWorkout, workoutModeEnabled, course.totalDistanceMeters]);

  const progress =
    course.totalDistanceMeters > 0
      ? Math.max(0, Math.min(1, distanceMeters / course.totalDistanceMeters))
      : 0;
  const riderX = padX + progress * (chartWidth - padX * 2);
  const minEle = course.minEleMeters;
  const maxEle = Math.max(minEle + 10, course.maxEleMeters);
  const riderY =
    chartHeight -
    padY -
    ((currentEleMeters - minEle) / (maxEle - minEle)) * (chartHeight - padY * 2);

  // Power sparkline path
  const powerSpark = useMemo(() => {
    const w = 320;
    const h = 128;
    const maxPower = Math.max(350, targetWatts + 120, ...samples.map((s) => s.watts));
    const bandTop = h - ((targetWatts + wattTolerance) / maxPower) * (h - 20) - 10;
    const bandBot = h - (Math.max(0, targetWatts - wattTolerance) / maxPower) * (h - 20) - 10;
    const targetY = h - (targetWatts / maxPower) * (h - 20) - 10;

    if (samples.length < 2) {
      return { w, h, linePath: '', bandTop, bandBot, targetY, maxPower };
    }

    const linePath = samples
      .map((s, idx) => {
        const x = (idx / Math.max(1, samples.length - 1)) * w;
        const y = h - (s.watts / maxPower) * (h - 20) - 10;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

    return { w, h, linePath, bandTop, bandBot, targetY, maxPower };
  }, [samples, targetWatts, wattTolerance]);

  const hovered = hoverIndex !== null && profileData ? profileData.coords[hoverIndex] : null;
  const hoveredWorkoutTarget =
    hovered && activeWorkout && workoutModeEnabled && activeWorkout.basis !== 'time'
      ? getWorkoutTargetAtDistance(activeWorkout, hovered.pt.distanceMeters).targetWatts
      : null;

  return (
    <section
      aria-label="Course Elevation and Power Telemetry"
      className="grid grid-cols-1 xl:grid-cols-3 gap-4"
    >
      {/* GPX Elevation Profile (2 cols on xl) */}
      <div className="xl:col-span-2 border border-[#1C2333] bg-[#0B0E17] rounded-lg p-4">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">GPX Elevation Profile</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              {Math.round(currentEleMeters)} m alt ({course.minEleMeters}–{course.maxEleMeters} m)
            </span>
            {workoutStepPath && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-400 font-mono">Dashed: Target Watts</span>
              </>
            )}
          </div>
          <div className="font-mono text-xs text-slate-400">
            {hovered
              ? `${(hovered.pt.distanceMeters / 1000).toFixed(2)} km · ${Math.round(hovered.pt.smoothedEle)} m · ${hovered.pt.gradePercent >= 0 ? '+' : ''}${hovered.pt.gradePercent.toFixed(1)}%${hoveredWorkoutTarget !== null ? ` · ${hoveredWorkoutTarget} W` : ''}`
              : 'Click profile to jump position'}
          </div>
        </div>

        <div className="relative w-full h-[128px]">
          {profileData && (
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              className="w-full h-full cursor-crosshair overflow-visible"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = (e.clientX - rect.left) / rect.width;
                const idx = Math.max(
                  0,
                  Math.min(
                    profileData.coords.length - 1,
                    Math.round(relX * (profileData.coords.length - 1))
                  )
                );
                setHoverIndex(idx);
              }}
              onMouseLeave={() => setHoverIndex(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                onSeekToProgress(relX);
              }}
            >
              <defs>
                <linearGradient id="eleFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Baseline grid */}
              <line
                x1={padX}
                y1={chartHeight - padY}
                x2={chartWidth - padX}
                y2={chartHeight - padY}
                stroke="#1E293B"
                strokeWidth="1"
              />
              <line
                x1={padX}
                y1={chartHeight * 0.5}
                x2={chartWidth - padX}
                y2={chartHeight * 0.5}
                stroke="#1E293B"
                strokeDasharray="3 4"
                strokeWidth="1"
              />

              {/* Area & Curve */}
              <path d={profileData.areaPath} fill="url(#eleFill)" />
              <path
                d={profileData.linePath}
                fill="none"
                stroke="#06B6D4"
                strokeWidth="2"
              />

              {/* Stepped Distance Workout Target Watts Overlay */}
              {workoutStepPath && (
                <path
                  d={workoutStepPath}
                  fill="none"
                  stroke="#10B981"
                  strokeDasharray="5 3"
                  strokeWidth="1.8"
                />
              )}

              {/* Hover crosshair */}
              {hovered && (
                <line
                  x1={hovered.x}
                  y1={0}
                  x2={hovered.x}
                  y2={chartHeight}
                  stroke="#64748B"
                  strokeDasharray="2 3"
                  strokeWidth="1"
                />
              )}

              {/* Rider position marker */}
              <line
                x1={riderX}
                y1={0}
                x2={riderX}
                y2={chartHeight}
                stroke="#F59E0B"
                strokeWidth="1.5"
              />
              <circle
                cx={riderX}
                cy={Math.max(padY, Math.min(chartHeight - padY, riderY))}
                r="4.5"
                fill="#F59E0B"
                stroke="#07090E"
                strokeWidth="1.5"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Power vs Target Sparkline (1 col on xl) */}
      <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold text-slate-200">
            Power vs Target Zone
          </span>
          <span className="font-mono text-xs text-slate-400">
            {targetWatts} ±{wattTolerance} W
          </span>
        </div>

        <div className="relative w-full h-[128px]">
          <svg
            viewBox={`0 0 ${powerSpark.w} ${powerSpark.h}`}
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Target Tolerance Band */}
            <rect
              x={0}
              y={Math.max(0, powerSpark.bandTop)}
              width={powerSpark.w}
              height={Math.max(4, powerSpark.bandBot - powerSpark.bandTop)}
              fill="#10B981"
              fillOpacity="0.14"
            />
            {/* Target Center Line */}
            <line
              x1={0}
              y1={powerSpark.targetY}
              x2={powerSpark.w}
              y2={powerSpark.targetY}
              stroke="#10B981"
              strokeDasharray="4 4"
              strokeWidth="1.2"
            />
            {/* Live Power Trace */}
            {powerSpark.linePath ? (
              <path
                d={powerSpark.linePath}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2"
              />
            ) : (
              <text
                x={powerSpark.w / 2}
                y={powerSpark.h / 2}
                textAnchor="middle"
                fill="#64748B"
                fontSize="11"
                fontFamily="JetBrains Mono, monospace"
              >
                Start ride to record power trace
              </text>
            )}
          </svg>
        </div>
      </div>
    </section>
  );
}

