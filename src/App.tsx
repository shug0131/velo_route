import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlSidebar } from './components/ControlSidebar';
import { CourseVideoPanel } from './components/CourseVideoPanel';
import { ElevationTelemetryTray } from './components/ElevationTelemetryTray';
import { HardwarePanel } from './components/HardwarePanel';
import { IntervalsConnectModal } from './components/IntervalsConnectModal';
import { RideExportModal } from './components/RideExportModal';
import { RiderSetupPanel } from './components/RiderSetupPanel';
import { RideStage } from './components/RideStage';
import { StravaConnectModal } from './components/StravaConnectModal';
import { AppSection, TopBar } from './components/TopBar';
import { KickrBleClient } from './services/bleKickr';
import {
  disconnectIntervals,
  fetchIntervalsStatus,
  fetchIntervalsWorkouts,
  subscribeIntervalsOAuthMessages,
} from './services/intervalsClient';
import {
  disconnectStrava,
  fetchStravaStatus,
  subscribeStravaOAuthMessages,
} from './services/stravaClient';
import { ZwiftClickBleClient } from './services/bleZwiftClick';
import {
  DistanceWorkout,
  EffortCue,
  GpxCourse,
  IntervalsRemoteWorkout,
  IntervalsStatus,
  KickrTelemetry,
  RecordedTrackPoint,
  RiderConfig,
  StravaStatus,
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
  solveSpeedFromPower,
} from './utils/physics';
import {
  BUILT_IN_WORKOUTS,
  convertIntervalsWorkoutToStructured,
  DistanceUnitMode,
  getWorkoutTargetAtState,
  parseDistanceWorkout,
} from './utils/workoutParser';
import { computeRideSummary } from './utils/rideExporter';

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
  const [recordedPoints, setRecordedPoints] = useState<RecordedTrackPoint[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Strava Connection State
  const [stravaStatus, setStravaStatus] = useState<StravaStatus>({
    configured: false,
    connected: false,
    athlete: null,
  });
  const [stravaAuthError, setStravaAuthError] = useState<string | null>(null);
  const [isStravaModalOpen, setIsStravaModalOpen] = useState(false);

  // Intervals.icu Connection & Workout Sync State
  const [intervalsStatus, setIntervalsStatus] = useState<IntervalsStatus>({
    configured: false,
    authMode: 'none',
    connected: false,
    athlete: null,
  });
  const [intervalsWorkouts, setIntervalsWorkouts] = useState<IntervalsRemoteWorkout[]>([]);
  const [intervalsSyncing, setIntervalsSyncing] = useState(false);
  const [intervalsError, setIntervalsError] = useState<string | null>(null);
  const [isIntervalsModalOpen, setIsIntervalsModalOpen] = useState(false);

  // Virtual Gears (Zwift Cog & Click v2: 1..24)
  const [virtualGear, setVirtualGear] = useState(12);
  const [trainerMode, setTrainerMode] = useState<TrainerMode>('sim');
  const [emulatorCadenceRpm, setEmulatorCadenceRpm] = useState(86);

  // Target Effort & Coaching
  const [targetWatts, setTargetWatts] = useState(210);
  const [activeWorkout, setActiveWorkout] = useState<DistanceWorkout | null>(null);
  const [workoutModeEnabled, setWorkoutModeEnabled] = useState(false);
  const [workoutUnitMode, setWorkoutUnitMode] = useState<DistanceUnitMode>('auto');
  const [rawWorkoutFile, setRawWorkoutFile] = useState<{ text: string; fileName: string } | null>(null);
  const [wattTolerance, setWattTolerance] = useState(12);
  const [audioCueEnabled, setAudioCueEnabled] = useState(false);
  const [intervalBeepEnabled, setIntervalBeepEnabled] = useState(true);
  const [power3sWatts, setPower3sWatts] = useState(0);
  const prevCueRef = useRef<EffortCue>('idle');
  const instantWattsRef = useRef(0);
  const powerWindowRef = useRef<Array<{ ts: number; watts: number }>>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const firedBeepsRef = useRef<Set<string>>(new Set());
  const prevSegmentIdxRef = useRef<number | null>(null);

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

  // Strava OAuth Status & Popup Message Subscription
  useEffect(() => {
    fetchStravaStatus()
      .then((status) => setStravaStatus(status))
      .catch(() => {
        // Ignore initial status error if offline
      });

    return subscribeStravaOAuthMessages(
      (athlete) => {
        setStravaAuthError(null);
        setStravaStatus((prev) => ({
          ...prev,
          configured: true,
          connected: true,
          athlete: athlete ?? prev.athlete,
        }));
      },
      (errorMsg) => {
        setStravaAuthError(errorMsg);
      }
    );
  }, []);

  const handleConnectStrava = useCallback(() => {
    setStravaAuthError(null);
    setIsStravaModalOpen(true);
  }, []);

  const handleDisconnectStrava = useCallback(async () => {
    await disconnectStrava();
    setStravaAuthError(null);
    setStravaStatus((prev) => ({
      ...prev,
      connected: false,
      athlete: null,
    }));
  }, []);

  const handleSyncIntervals = useCallback(async () => {
    setIntervalsSyncing(true);
    setIntervalsError(null);
    try {
      const result = await fetchIntervalsWorkouts();
      setIntervalsWorkouts(result.workouts);
      setIntervalsStatus((prev) => ({
        ...prev,
        connected: true,
        athlete: result.athlete ?? prev.athlete,
      }));
    } catch (err) {
      setIntervalsError(
        err instanceof Error ? err.message : 'Failed to sync workouts from Intervals.icu.'
      );
    } finally {
      setIntervalsSyncing(false);
    }
  }, []);

  // Intervals.icu OAuth/API Status & Popup Message Subscription
  useEffect(() => {
    fetchIntervalsStatus()
      .then((status) => {
        setIntervalsStatus(status);
        if (status.connected) {
          handleSyncIntervals();
        }
      })
      .catch(() => {
        // Ignore initial status error if offline
      });

    return subscribeIntervalsOAuthMessages(
      (athlete) => {
        setIntervalsError(null);
        setIntervalsStatus((prev) => ({
          ...prev,
          configured: true,
          authMode: 'oauth',
          connected: true,
          athlete: athlete ?? prev.athlete,
        }));
        handleSyncIntervals();
      },
      (errorMsg) => {
        setIntervalsError(errorMsg);
      }
    );
  }, [handleSyncIntervals]);

  const handleConnectIntervals = useCallback(() => {
    setIntervalsError(null);
    setIsIntervalsModalOpen(true);
  }, []);

  const handleDisconnectIntervals = useCallback(async () => {
    await disconnectIntervals();
    setIntervalsError(null);
    setIntervalsWorkouts([]);
    setIntervalsStatus((prev) => ({
      ...prev,
      connected: false,
      athlete: null,
    }));
  }, []);

  const handleSelectIntervalsWorkout = useCallback(
    (remote: IntervalsRemoteWorkout) => {
      const structured = convertIntervalsWorkoutToStructured(
        remote,
        intervalsStatus.athlete?.ftp || 250
      );
      setRawWorkoutFile(null);
      setActiveWorkout(structured);
      setWorkoutModeEnabled(true);
    },
    [intervalsStatus.athlete?.ftp]
  );

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
    return getWorkoutTargetAtState(activeWorkout, distanceMeters, elapsedSec);
  }, [activeWorkout, workoutModeEnabled, distanceMeters, elapsedSec]);

  const effectiveTargetWatts = workoutLookup ? workoutLookup.targetWatts : targetWatts;

  const ensureAudioContext = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {
          // Ignore resume restriction errors
        });
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  const playBeep = useCallback(
    (freq: number, durationSec: number, gainVal: number) => {
      try {
        const ctx = ensureAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(gainVal, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + durationSec + 0.01);
      } catch {
        // Ignore audio playback errors
      }
    },
    [ensureAudioContext]
  );

  const handleToggleIntervalBeep = useCallback(() => {
    setIntervalBeepEnabled((prev) => {
      const next = !prev;
      if (next) {
        ensureAudioContext();
        playBeep(880, 0.07, 0.06);
      }
      return next;
    });
  }, [ensureAudioContext, playBeep]);

  // Live Power (instantaneous -> 3-second rolling average), Cadence, Speed calculation
  const liveCadenceRpm = kickr.connected ? kickr.cadenceRpm : isRiding ? emulatorCadenceRpm : 0;
  const instantWatts = useMemo(() => {
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
  instantWattsRef.current = instantWatts;

  useEffect(() => {
    if (!isRiding && !kickr.connected) {
      powerWindowRef.current = [];
      setPower3sWatts(0);
      return;
    }

    const samplePower = () => {
      const now = performance.now();
      const nextWindow = [
        ...powerWindowRef.current.filter((entry) => now - entry.ts <= 3000),
        { ts: now, watts: instantWattsRef.current },
      ];
      powerWindowRef.current = nextWindow;
      const sum = nextWindow.reduce((acc, item) => acc + item.watts, 0);
      setPower3sWatts(Math.round(sum / nextWindow.length));
    };

    samplePower();
    const timer = window.setInterval(samplePower, 100);
    return () => window.clearInterval(timer);
  }, [isRiding, kickr.connected]);

  const liveWatts = power3sWatts;

  const liveSpeedKmh = useMemo(() => {
    if (!isRiding && (!kickr.connected || liveWatts <= 5)) return 0;
    return solveSpeedFromPower(liveWatts, courseSample.gradePercent, riderConfig);
  }, [isRiding, kickr.connected, liveWatts, courseSample.gradePercent, riderConfig]);

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

  // Coaching Status ("PUSH HARDER" / "EASIER" / "ON TARGET") using 3s average power
  const coaching = useMemo(
    () =>
      evaluateCoaching({
        isActive: isRiding,
        watts: liveWatts,
        targetWatts: effectiveTargetWatts,
        wattTolerance,
      }),
    [isRiding, liveWatts, effectiveTargetWatts, wattTolerance]
  );

  // Subtle Web Audio cue when effort crosses out of target zone
  useEffect(() => {
    if (!audioCueEnabled || !isRiding) {
      prevCueRef.current = coaching.cue;
      return;
    }
    if (coaching.cue !== prevCueRef.current && (coaching.cue === 'harder' || coaching.cue === 'easier')) {
      playBeep(coaching.cue === 'harder' ? 580 : 390, 0.16, 0.05);
    }
    prevCueRef.current = coaching.cue;
  }, [coaching.cue, audioCueEnabled, isRiding, playBeep]);

  // 5-second pre-interval countdown beeps (supports time-based and distance-based workouts)
  useEffect(() => {
    if (!workoutModeEnabled || !activeWorkout) {
      firedBeepsRef.current.clear();
      prevSegmentIdxRef.current = null;
      return;
    }
    if (!isRiding || !workoutLookup) {
      return;
    }

    if (
      prevSegmentIdxRef.current !== null &&
      workoutLookup.segmentIndex !== prevSegmentIdxRef.current
    ) {
      if (intervalBeepEnabled) {
        playBeep(1046, 0.14, 0.09);
      }
      firedBeepsRef.current.clear();
    }
    prevSegmentIdxRef.current = workoutLookup.segmentIndex;

    if (!intervalBeepEnabled || !workoutLookup.nextSegment) return;

    const secLeft =
      workoutLookup.secondsToNext !== null
        ? workoutLookup.secondsToNext
        : workoutLookup.distanceToNextMeters !== null && liveSpeedKmh > 1.0
          ? workoutLookup.distanceToNextMeters / (liveSpeedKmh / 3.6)
          : null;

    if (secLeft !== null && secLeft > 0 && secLeft <= 5.2) {
      const mark = Math.min(5, Math.max(1, Math.ceil(secLeft)));
      const key = `${workoutLookup.segmentIndex + 1}-${mark}`;
      if (!firedBeepsRef.current.has(key)) {
        firedBeepsRef.current.add(key);
        playBeep(mark === 1 ? 880 : 720, 0.08, 0.08);
      }
    }
  }, [
    workoutModeEnabled,
    activeWorkout,
    isRiding,
    workoutLookup,
    intervalBeepEnabled,
    liveSpeedKmh,
    playBeep,
  ]);

  // Simulation distance & telemetry history tick (10Hz physics, 1Hz chart & track recording)
  const liveSpeedRef = useRef(liveSpeedKmh);
  const liveWattsRef = useRef(liveWatts);
  const liveCadenceRef = useRef(liveCadenceRpm);
  const gradeRef = useRef(courseSample.gradePercent);
  const latRef = useRef(courseSample.lat);
  const lonRef = useRef(courseSample.lon);
  const eleRef = useRef(courseSample.elevationMeters);
  const gearRef = useRef(virtualGear);
  const distRef = useRef(distanceMeters);
  const elapsedRef = useRef(elapsedSec);
  const targetWattsRef = useRef(effectiveTargetWatts);
  const totalDistRef = useRef(activeCourse.totalDistanceMeters);

  liveSpeedRef.current = liveSpeedKmh;
  liveWattsRef.current = liveWatts;
  liveCadenceRef.current = liveCadenceRpm;
  gradeRef.current = courseSample.gradePercent;
  latRef.current = courseSample.lat;
  lonRef.current = courseSample.lon;
  eleRef.current = courseSample.elevationMeters;
  gearRef.current = virtualGear;
  distRef.current = distanceMeters;
  elapsedRef.current = elapsedSec;
  targetWattsRef.current = effectiveTargetWatts;
  totalDistRef.current = activeCourse.totalDistanceMeters;

  useEffect(() => {
    if (!isRiding) return;

    let sampleAccumulator = 0;
    let lastTick = performance.now();

    // Record immediate initial point when ride begins if empty
    setRecordedPoints((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          timestampMs: Date.now(),
          elapsedSec: elapsedRef.current,
          distanceMeters: distRef.current,
          lat: latRef.current,
          lon: lonRef.current,
          elevationMeters: eleRef.current,
          watts: liveWattsRef.current,
          cadenceRpm: liveCadenceRef.current,
          speedKmh: liveSpeedRef.current,
          gradePercent: gradeRef.current,
          virtualGear: gearRef.current,
        },
      ];
    });

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
          setIsExportModalOpen(true);
          return totalDistRef.current;
        }
        return next;
      });

      sampleAccumulator += dt;
      if (sampleAccumulator >= 1.0) {
        sampleAccumulator = 0;
        const pointNowMs = Date.now();
        setSamples((prev) => {
          const next = [
            ...prev,
            {
              elapsedSec: prev.length,
              watts: liveWattsRef.current,
              targetWatts: targetWattsRef.current,
              speedKmh: liveSpeedRef.current,
              gradePercent: gradeRef.current,
              cadenceRpm: liveCadenceRef.current,
            },
          ];
          return next.slice(-90);
        });
        setRecordedPoints((prev) => [
          ...prev,
          {
            timestampMs: pointNowMs,
            elapsedSec: elapsedRef.current,
            distanceMeters: distRef.current,
            lat: latRef.current,
            lon: lonRef.current,
            elevationMeters: eleRef.current,
            watts: liveWattsRef.current,
            cadenceRpm: liveCadenceRef.current,
            speedKmh: liveSpeedRef.current,
            gradePercent: gradeRef.current,
            virtualGear: gearRef.current,
          },
        ]);
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
    setRecordedPoints([]);
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
    setRecordedPoints([]);
    firedBeepsRef.current.clear();
    prevSegmentIdxRef.current = null;
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.currentTime = 0;
    }
  }, []);

  const rideSummary = useMemo(
    () =>
      computeRideSummary(
        activeCourse.name,
        recordedPoints,
        elapsedSec,
        distanceMeters
      ),
    [activeCourse.name, recordedPoints, elapsedSec, distanceMeters]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#07090E] text-slate-100">
      <TopBar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        isRiding={isRiding}
        onToggleRide={() => {
          ensureAudioContext();
          setIsRiding((prev) => !prev);
        }}
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
              targetWatts={targetWatts}
              onChangeTargetWatts={setTargetWatts}
              activeWorkout={activeWorkout}
              workoutModeEnabled={workoutModeEnabled}
              onToggleWorkoutMode={setWorkoutModeEnabled}
              workoutLookup={workoutLookup}
              audioCueEnabled={audioCueEnabled}
              onToggleAudioCue={() => {
                ensureAudioContext();
                setAudioCueEnabled((v) => !v);
              }}
              intervalBeepEnabled={intervalBeepEnabled}
              onToggleIntervalBeep={handleToggleIntervalBeep}
              onResetRide={handleResetRide}
              onOpenCourseUpload={() => setActiveSection('course')}
              recordedPointCount={recordedPoints.length}
              onOpenExportModal={() => {
                setIsRiding(false);
                setIsExportModalOpen(true);
              }}
              stravaStatus={stravaStatus}
              onOpenStravaModal={handleConnectStrava}
              intervalsStatus={intervalsStatus}
              onOpenIntervalsModal={handleConnectIntervals}
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
              setRecordedPoints([]);
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
            intervalsStatus={intervalsStatus}
            intervalsWorkouts={intervalsWorkouts}
            intervalsSyncing={intervalsSyncing}
            intervalsError={intervalsError}
            onConnectIntervals={handleConnectIntervals}
            onDisconnectIntervals={handleDisconnectIntervals}
            onSyncIntervals={handleSyncIntervals}
            onSelectIntervalsWorkout={handleSelectIntervalsWorkout}
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
            stravaStatus={stravaStatus}
            onConnectStrava={handleConnectStrava}
            onDisconnectStrava={handleDisconnectStrava}
            stravaAuthError={stravaAuthError}
            intervalsStatus={intervalsStatus}
            onConnectIntervals={handleConnectIntervals}
            onDisconnectIntervals={handleDisconnectIntervals}
            intervalsError={intervalsError}
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
            onBackToCockpit={() => setActiveSection('cockpit')}
          />
        )}
      </main>

      <RideExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        points={recordedPoints}
        summary={rideSummary}
        stravaStatus={stravaStatus}
        onConnectStrava={handleConnectStrava}
        onDisconnectStrava={handleDisconnectStrava}
        stravaAuthError={stravaAuthError}
      />

      <StravaConnectModal
        isOpen={isStravaModalOpen}
        onClose={() => setIsStravaModalOpen(false)}
        stravaStatus={stravaStatus}
        stravaAuthError={stravaAuthError}
        onStatusUpdated={setStravaStatus}
        onDisconnectStrava={handleDisconnectStrava}
      />

      <IntervalsConnectModal
        isOpen={isIntervalsModalOpen}
        onClose={() => setIsIntervalsModalOpen(false)}
        intervalsStatus={intervalsStatus}
        intervalsError={intervalsError}
        onStatusUpdated={(next) => {
          setIntervalsStatus(next);
          if (next.connected) {
            handleSyncIntervals();
          }
        }}
        onSyncWorkouts={handleSyncIntervals}
        onDisconnectIntervals={handleDisconnectIntervals}
      />
    </div>
  );
}
