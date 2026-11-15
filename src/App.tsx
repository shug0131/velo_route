import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlSidebar } from './components/ControlSidebar';
import { CourseVideoPanel } from './components/CourseVideoPanel';
import { ElevationTelemetryTray } from './components/ElevationTelemetryTray';
import { HardwarePanel } from './components/HardwarePanel';
import { RiderSetupPanel } from './components/RiderSetupPanel';
import { RideStage } from './components/RideStage';
import { AppSection, TopBar } from './components/TopBar';
import { KickrBleClient } from './services/bleKickr';
import { ZwiftClickBleClient } from './services/bleZwiftClick';
import {
  CoachingMode,
  DistanceWorkout,
  EffortCue,
  GpxCourse,
  KickrTelemetry,
  RiderConfig,
  TelemetrySample,
  TrainerMode,
  ZwiftClickTelemetry,
} from './types/simulator';
import {
  BUILT_IN_COURSES,
  interpolateCourseAtDistance,
  parseGpxString,
} from './utils/gpxParser';
import {
  computeEffectiveKickrGrade,
  DEFAULT_RIDER_CONFIG,
  estimateEmulatorWatts,
  evaluateCoaching,
  getVirtualGearSpec,
  solvePowerFromSpeed,
  solveSpeedFromPower,
} from './utils/physics';
import {
  BUILT_IN_WORKOUTS,
  DistanceUnitMode,
  getWorkoutTargetAtDistance,
  parseDistanceWorkout,
} from './utils/workoutParser';

export default function App() {
  const [activeSection, setActiveSection] = useState<AppSection>('cockpit');

  // Courses & Video Media
  const [courses, setCourses] = useState<GpxCourse[]>(BUILT_IN_COURSES);
  const [activeCourseId, setActiveCourseId] = useState<string>(BUILT_IN_COURSES[0].id);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Ride State
  const [isRiding, setIsRiding] = useState(false);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [samples, setSamples] = useState<TelemetrySample[]>([]);

  // Virtual Gears (Zwift Cog & Click v2: 1..24)
  const [virtualGear, setVirtualGear] = useState(12);
  const [trainerMode, setTrainerMode] = useState<TrainerMode>('sim');
  const [emulatorCadenceRpm, setEmulatorCadenceRpm] = useState(86);

  // Target Effort & Coaching
  const [coachingMode, setCoachingMode] = useState<CoachingMode>('both');
  const [targetWatts, setTargetWatts] = useState(210);
  const [activeWorkout, setActiveWorkout] = useState<DistanceWorkout | null>(null);
  const [workoutModeEnabled, setWorkoutModeEnabled] = useState(false);
  const [workoutUnitMode, setWorkoutUnitMode] = useState<DistanceUnitMode>('auto');
  const [rawWorkoutFile, setRawWorkoutFile] = useState<{ text: string; fileName: string } | null>(null);
  const [wattTolerance, setWattTolerance] = useState(12);
  const [targetSpeedKmh, setTargetSpeedKmh] = useState(26.0);
  const [speedToleranceKmh, setSpeedToleranceKmh] = useState(1.2);
  const [audioCueEnabled, setAudioCueEnabled] = useState(false);
  const prevCueRef = useRef<EffortCue>('idle');

  // Rider Physics Config
  const [riderConfig, setRiderConfig] = useState<RiderConfig>(DEFAULT_RIDER_CONFIG);

  // BLE Hardware States
  const [kickr, setKickr] = useState<KickrTelemetry>({
    connected: false,
    connecting: false,
    deviceName: null,
    watts: 0,
    cadenceRpm: 0,
    trainerSpeedKmh: 0,
    controlGranted: false,
    lastCommandSummary: null,
    error: null,
  });

  const [zwiftClick, setZwiftClick] = useState<ZwiftClickTelemetry>({
    connected: false,
    connecting: false,
    deviceName: null,
    batteryPercent: null,
    handshakeComplete: false,
    lastButtonPressed: null,
    lastPacketHex: null,
    learnMode: null,
    customUpSignature: null,
    customDownSignature: null,
    error: null,
  });

  const activeCourse = useMemo(
    () => courses.find((c) => c.id === activeCourseId) ?? courses[0],
    [courses, activeCourseId]
  );

  const courseSample = useMemo(
    () => interpolateCourseAtDistance(activeCourse, distanceMeters),
    [activeCourse, distanceMeters]
  );

  const gearSpec = useMemo(() => getVirtualGearSpec(virtualGear), [virtualGear]);

  const handleShiftGear = useCallback((delta: number) => {
    setVirtualGear((prev) => Math.max(1, Math.min(24, prev + delta)));
  }, []);

  // BLE Clients (singleton refs)
  const kickrClientRef = useRef<KickrBleClient | null>(null);
  const zwiftClickClientRef = useRef<ZwiftClickBleClient | null>(null);

  useEffect(() => {
    kickrClientRef.current = new KickrBleClient({
      onTelemetry: (data) => {
        setKickr((prev) => ({
          ...prev,
          watts: data.watts !== undefined ? data.watts : prev.watts,
          cadenceRpm: data.cadenceRpm !== undefined ? data.cadenceRpm : prev.cadenceRpm,
          trainerSpeedKmh:
            data.trainerSpeedKmh !== undefined ? data.trainerSpeedKmh : prev.trainerSpeedKmh,
        }));
      },
      onStatusChange: (status) => {
        setKickr((prev) => ({
          ...prev,
          connected: status.connected,
          connecting: status.connecting,
          deviceName: status.deviceName,
          controlGranted: status.controlGranted,
          lastCommandSummary:
            status.lastCommandSummary !== undefined
              ? status.lastCommandSummary
              : prev.lastCommandSummary,
          error: status.error,
        }));
      },
    });

    zwiftClickClientRef.current = new ZwiftClickBleClient({
      onShift: (dir) => {
        handleShiftGear(dir === 'up' ? 1 : -1);
      },
      onStatusChange: (status) => {
        setZwiftClick((prev) => ({
          ...prev,
          connected: status.connected,
          connecting: status.connecting,
          deviceName: status.deviceName,
          batteryPercent: status.batteryPercent,
          handshakeComplete: status.handshakeComplete,
          lastButtonPressed:
            status.lastButtonPressed !== undefined
              ? status.lastButtonPressed
              : prev.lastButtonPressed,
          lastPacketHex:
            status.lastPacketHex !== undefined ? status.lastPacketHex : prev.lastPacketHex,
          learnMode: status.learnMode !== undefined ? status.learnMode : prev.learnMode,
          customUpSignature:
            status.customUpSignature !== undefined
              ? status.customUpSignature
              : prev.customUpSignature,
          customDownSignature:
            status.customDownSignature !== undefined
              ? status.customDownSignature
              : prev.customDownSignature,
          error: status.error,
        }));
      },
    });

    return () => {
      kickrClientRef.current?.disconnect();
      zwiftClickClientRef.current?.disconnect();
    };
  }, [handleShiftGear]);

  // Keyboard shortcuts for Zwift Click virtual shifting (+/- or ArrowUp/ArrowDown)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === '+' || e.key === '=' || e.key === 'ArrowUp' || e.key === ']') {
        e.preventDefault();
        handleShiftGear(1);
      } else if (e.key === '-' || e.key === '_' || e.key === 'ArrowDown' || e.key === '[') {
        e.preventDefault();
        handleShiftGear(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleShiftGear]);

  const workoutLookup = useMemo(() => {
    if (!activeWorkout || !workoutModeEnabled) return null;
    return getWorkoutTargetAtDistance(activeWorkout, distanceMeters);
  }, [activeWorkout, workoutModeEnabled, distanceMeters]);

  const effectiveTargetWatts = workoutLookup ? workoutLookup.targetWatts : targetWatts;

  // Live Power, Cadence, Speed calculation
  const liveCadenceRpm = kickr.connected ? kickr.cadenceRpm : isRiding ? emulatorCadenceRpm : 0;
  const liveWatts = useMemo(() => {
    if (kickr.connected) return kickr.watts;
    if (!isRiding) return 0;
    if (trainerMode === 'erg' && emulatorCadenceRpm > 15) return effectiveTargetWatts;
    return estimateEmulatorWatts(
      emulatorCadenceRpm,
      virtualGear,
      courseSample.gradePercent,
      riderConfig
    );
  }, [
    kickr.connected,
    kickr.watts,
    isRiding,
    trainerMode,
    emulatorCadenceRpm,
    effectiveTargetWatts,
    virtualGear,
    courseSample.gradePercent,
    riderConfig,
  ]);

  const liveSpeedKmh = useMemo(() => {
    if (!isRiding && !kickr.connected) return 0;
    return solveSpeedFromPower(liveWatts, courseSample.gradePercent, riderConfig);
  }, [isRiding, kickr.connected, liveWatts, courseSample.gradePercent, riderConfig]);

  const requiredWattsForTargetSpeed = useMemo(
    () => solvePowerFromSpeed(targetSpeedKmh, courseSample.gradePercent, riderConfig),
    [targetSpeedKmh, courseSample.gradePercent, riderConfig]
  );

  // Video playback rate relative to GPX recorded speed (or user's base recording speed)
  const videoPlaybackRate = useMemo(() => {
    if (!isRiding || liveSpeedKmh < 1.2) return 0;
    const refVideoSpeed =
      activeCourse.hasTimestamps && courseSample.recordedSpeedKmh
        ? courseSample.recordedSpeedKmh
        : riderConfig.videoBaseSpeedKmh;
    const ratio = liveSpeedKmh / Math.max(8, refVideoSpeed);
    return Math.max(0.25, Math.min(4.0, Number(ratio.toFixed(2))));
  }, [
    isRiding,
    liveSpeedKmh,
    activeCourse.hasTimestamps,
    courseSample.recordedSpeedKmh,
    riderConfig.videoBaseSpeedKmh,
  ]);

  // Coaching Status ("PUSH HARDER" / "EASIER" / "ON TARGET")
  const coaching = useMemo(
    () =>
      evaluateCoaching({
        isActive: isRiding,
        watts: liveWatts,
        speedKmh: liveSpeedKmh,
        targetWatts: effectiveTargetWatts,
        wattTolerance,
        targetSpeedKmh,
        speedToleranceKmh,
        coachingMode,
      }),
    [
      isRiding,
      liveWatts,
      liveSpeedKmh,
      effectiveTargetWatts,
      wattTolerance,
      targetSpeedKmh,
      speedToleranceKmh,
      coachingMode,
    ]
  );

  // Subtle Web Audio cue when effort crosses out of target zone
  useEffect(() => {
    if (!audioCueEnabled || !isRiding) {
      prevCueRef.current = coaching.cue;
      return;
    }
    if (coaching.cue !== prevCueRef.current && (coaching.cue === 'harder' || coaching.cue === 'easier')) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = coaching.cue === 'harder' ? 580 : 390;
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.17);
      } catch {
        // Ignore audio context block
      }
    }
    prevCueRef.current = coaching.cue;
  }, [coaching.cue, audioCueEnabled, isRiding]);

  // Simulation distance & telemetry history tick (10Hz physics, 1Hz chart sample)
  const liveSpeedRef = useRef(liveSpeedKmh);
  const liveWattsRef = useRef(liveWatts);
  const liveCadenceRef = useRef(liveCadenceRpm);
  const gradeRef = useRef(courseSample.gradePercent);
  const targetWattsRef = useRef(effectiveTargetWatts);
  const targetSpeedRef = useRef(targetSpeedKmh);
  const totalDistRef = useRef(activeCourse.totalDistanceMeters);

  liveSpeedRef.current = liveSpeedKmh;
  liveWattsRef.current = liveWatts;
  liveCadenceRef.current = liveCadenceRpm;
  gradeRef.current = courseSample.gradePercent;
  targetWattsRef.current = effectiveTargetWatts;
  targetSpeedRef.current = targetSpeedKmh;
  totalDistRef.current = activeCourse.totalDistanceMeters;

  useEffect(() => {
    if (!isRiding) return;

    let sampleAccumulator = 0;
    let lastTick = performance.now();

    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - lastTick) / 1000);
      lastTick = now;

      const deltaMeters = (liveSpeedRef.current / 3.6) * dt;
      setElapsedSec((prev) => prev + dt);
      setDistanceMeters((prev) => {
        const next = prev + deltaMeters;
        if (next >= totalDistRef.current) {
          setIsRiding(false);
          return totalDistRef.current;
        }
        return next;
      });

      sampleAccumulator += dt;
      if (sampleAccumulator >= 1.0) {
        sampleAccumulator = 0;
        setSamples((prev) => {
          const next = [
            ...prev,
            {
              elapsedSec: prev.length,
              watts: liveWattsRef.current,
              targetWatts: targetWattsRef.current,
              speedKmh: liveSpeedRef.current,
              targetSpeedKmh: targetSpeedRef.current,
              gradePercent: gradeRef.current,
              cadenceRpm: liveCadenceRef.current,
            },
          ];
          return next.slice(-90);
        });
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [isRiding]);

  // Sync Wahoo KICKR BLE Resistance (SIM grade + Zwift Cog gear offset, or ERG target watts)
  useEffect(() => {
    if (!kickr.connected || !isRiding) return;
    const client = kickrClientRef.current;
    if (!client) return;

    if (trainerMode === 'erg') {
      client.setErgTargetPower(effectiveTargetWatts);
    } else {
      const effectiveGrade = computeEffectiveKickrGrade(
        courseSample.gradePercent,
        virtualGear,
        riderConfig.gradeDifficultyScale
      );
      client.setSimulationGrade(effectiveGrade, riderConfig.crr, riderConfig.cda);
    }
  }, [
    kickr.connected,
    isRiding,
    trainerMode,
    effectiveTargetWatts,
    courseSample.gradePercent,
    virtualGear,
    riderConfig.gradeDifficultyScale,
    riderConfig.crr,
    riderConfig.cda,
  ]);

  // Seek GPX position and synchronized ride video
  const handleSeekToProgress = useCallback(
    (progress: number) => {
      const clamped = Math.max(0, Math.min(1, progress));
      const newDist = clamped * activeCourse.totalDistanceMeters;
      setDistanceMeters(newDist);

      const vid = videoElementRef.current;
      if (vid && videoDurationSec && videoDurationSec > 0) {
        const sampleAtTarget = interpolateCourseAtDistance(activeCourse, newDist);
        let targetVideoTime = clamped * videoDurationSec;
        if (
          activeCourse.hasTimestamps &&
          activeCourse.durationSec &&
          sampleAtTarget.timeSec !== null
        ) {
          targetVideoTime =
            (sampleAtTarget.timeSec / activeCourse.durationSec) * videoDurationSec;
        }
        vid.currentTime = Math.max(0, Math.min(videoDurationSec, targetVideoTime));
      }
    },
    [activeCourse, videoDurationSec]
  );

  // Upload handlers
  const handleUploadGpxFile = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = parseGpxString(text, file.name);
    setCourses((prev) => [parsed, ...prev.filter((c) => c.id !== parsed.id)]);
    setActiveCourseId(parsed.id);
    setDistanceMeters(0);
    setElapsedSec(0);
    setSamples([]);
    setIsRiding(false);
  }, []);

  const handleUploadVideoFile = useCallback(
    (file: File) => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      const nextUrl = URL.createObjectURL(file);
      setVideoUrl(nextUrl);
      setVideoFileName(file.name);
      setVideoDurationSec(null);
    },
    [videoUrl]
  );

  const handleUploadWorkoutFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const parsed = parseDistanceWorkout(text, file.name, workoutUnitMode);
      setRawWorkoutFile({ text, fileName: file.name });
      setActiveWorkout(parsed);
      setWorkoutModeEnabled(true);
    },
    [workoutUnitMode]
  );

  const handleChangeWorkoutUnitMode = useCallback(
    (mode: DistanceUnitMode) => {
      setWorkoutUnitMode(mode);
      if (rawWorkoutFile) {
        try {
          const reparsed = parseDistanceWorkout(rawWorkoutFile.text, rawWorkoutFile.fileName, mode);
          setActiveWorkout(reparsed);
        } catch {
          // keep previous valid parse
        }
      }
    },
    [rawWorkoutFile]
  );

  const handleLoadSampleWorkout = useCallback(() => {
    const sample = BUILT_IN_WORKOUTS[0];
    setRawWorkoutFile(null);
    setActiveWorkout(sample);
    setWorkoutModeEnabled(true);
  }, []);

  const handleClearWorkout = useCallback(() => {
    setRawWorkoutFile(null);
    setActiveWorkout(null);
    setWorkoutModeEnabled(false);
  }, []);

  const handleClearVideo = useCallback(() => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoUrl(null);
    setVideoFileName(null);
    setVideoDurationSec(null);
  }, [videoUrl]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleResetRide = useCallback(() => {
    setIsRiding(false);
    setDistanceMeters(0);
    setElapsedSec(0);
    setSamples([]);
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.currentTime = 0;
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#07090E] text-slate-100">
      <TopBar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        isRiding={isRiding}
        onToggleRide={() => setIsRiding((prev) => !prev)}
      />

      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 lg:p-6">
        {activeSection === 'cockpit' && (
          <div className="flex flex-col lg:flex-row items-start gap-6">
            <ControlSidebar
              kickr={kickr}
              zwiftClick={zwiftClick}
              onConnectKickr={() => kickrClientRef.current?.connect()}
              onDisconnectKickr={() => kickrClientRef.current?.disconnect()}
              onConnectZwiftClick={() => zwiftClickClientRef.current?.connect()}
              onDisconnectZwiftClick={() => zwiftClickClientRef.current?.disconnect()}
              emulatorCadenceRpm={emulatorCadenceRpm}
              onChangeEmulatorCadence={setEmulatorCadenceRpm}
              virtualGear={virtualGear}
              gearSpec={gearSpec}
              onShiftGear={handleShiftGear}
              trainerMode={trainerMode}
              onChangeTrainerMode={setTrainerMode}
              coachingMode={coachingMode}
              onChangeCoachingMode={setCoachingMode}
              targetWatts={targetWatts}
              onChangeTargetWatts={setTargetWatts}
              activeWorkout={activeWorkout}
              workoutModeEnabled={workoutModeEnabled}
              onToggleWorkoutMode={setWorkoutModeEnabled}
              workoutLookup={workoutLookup}
              targetSpeedKmh={targetSpeedKmh}
              onChangeTargetSpeed={setTargetSpeedKmh}
              audioCueEnabled={audioCueEnabled}
              onToggleAudioCue={() => setAudioCueEnabled((v) => !v)}
              onResetRide={handleResetRide}
              onOpenCourseUpload={() => setActiveSection('course')}
              requiredWattsForTargetSpeed={requiredWattsForTargetSpeed}
            />

            <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
              <RideStage
                course={activeCourse}
                videoUrl={videoUrl}
                videoFileName={videoFileName}
                isRiding={isRiding}
                watts={liveWatts}
                targetWatts={effectiveTargetWatts}
                speedKmh={liveSpeedKmh}
                targetSpeedKmh={targetSpeedKmh}
                cadenceRpm={liveCadenceRpm}
                gradePercent={courseSample.gradePercent}
                distanceMeters={distanceMeters}
                elapsedSec={elapsedSec}
                gearSpec={gearSpec}
                coaching={coaching}
                workoutLookup={workoutLookup}
                videoPlaybackRate={videoPlaybackRate}
                progress={courseSample.progress}
                onVideoDurationKnown={setVideoDurationSec}
                onSeekToProgress={handleSeekToProgress}
                onOpenCourseUpload={() => setActiveSection('course')}
                videoElementRef={videoElementRef}
              />

              <ElevationTelemetryTray
                course={activeCourse}
                distanceMeters={distanceMeters}
                currentEleMeters={courseSample.elevationMeters}
                samples={samples}
                targetWatts={effectiveTargetWatts}
                wattTolerance={wattTolerance}
                activeWorkout={activeWorkout}
                workoutModeEnabled={workoutModeEnabled}
                onSeekToProgress={handleSeekToProgress}
              />
            </div>
          </div>
        )}

        {activeSection === 'course' && (
          <CourseVideoPanel
            courses={courses}
            activeCourse={activeCourse}
            onSelectCourse={(id) => {
              setActiveCourseId(id);
              setDistanceMeters(0);
              setElapsedSec(0);
              setSamples([]);
              setIsRiding(false);
            }}
            onUploadGpxFile={handleUploadGpxFile}
            videoFileName={videoFileName}
            videoDurationSec={videoDurationSec}
            onUploadVideoFile={handleUploadVideoFile}
            onClearVideo={handleClearVideo}
            activeWorkout={activeWorkout}
            workoutModeEnabled={workoutModeEnabled}
            workoutUnitMode={workoutUnitMode}
            onChangeWorkoutUnitMode={handleChangeWorkoutUnitMode}
            onUploadWorkoutFile={handleUploadWorkoutFile}
            onLoadSampleWorkout={handleLoadSampleWorkout}
            onClearWorkout={handleClearWorkout}
            riderConfig={riderConfig}
            onUpdateRiderConfig={(patch) =>
              setRiderConfig((prev) => ({ ...prev, ...patch }))
            }
            videoPlaybackRate={videoPlaybackRate}
            onBackToCockpit={() => setActiveSection('cockpit')}
          />
        )}

        {activeSection === 'hardware' && (
          <HardwarePanel
            kickr={kickr}
            zwiftClick={zwiftClick}
            onConnectKickr={() => kickrClientRef.current?.connect()}
            onDisconnectKickr={() => kickrClientRef.current?.disconnect()}
            onConnectZwiftClick={() => zwiftClickClientRef.current?.connect()}
            onDisconnectZwiftClick={() => zwiftClickClientRef.current?.disconnect()}
            onSetClickLearnMode={(mode) => zwiftClickClientRef.current?.setLearnMode(mode)}
            onClearClickSignatures={() => zwiftClickClientRef.current?.clearCustomSignatures()}
            onBackToCockpit={() => setActiveSection('cockpit')}
          />
        )}

        {activeSection === 'setup' && (
          <RiderSetupPanel
            riderConfig={riderConfig}
            onUpdateRiderConfig={(patch) =>
              setRiderConfig((prev) => ({ ...prev, ...patch }))
            }
            wattTolerance={wattTolerance}
            onChangeWattTolerance={setWattTolerance}
            speedToleranceKmh={speedToleranceKmh}
            onChangeSpeedTolerance={setSpeedToleranceKmh}
            onBackToCockpit={() => setActiveSection('cockpit')}
          />
        )}
      </main>
    </div>
  );
}
