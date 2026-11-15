import { useEffect, useState } from 'react';
import { Check, Download, ExternalLink, Loader2, UploadCloud, X } from 'lucide-react';
import {
  pollStravaUploadStatus,
  uploadRideToStrava,
} from '../services/stravaClient';
import {
  RecordedTrackPoint,
  RideSummary,
  StravaStatus,
} from '../types/simulator';
import { encodeRideToFit } from '../utils/fitEncoder';
import {
  downloadRideFit,
  downloadRideGpx,
  uint8ToBase64,
} from '../utils/rideExporter';

interface RideExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  points: RecordedTrackPoint[];
  summary: RideSummary;
  stravaStatus: StravaStatus;
  onConnectStrava: () => void;
  onDisconnectStrava: () => Promise<void>;
  stravaAuthError: string | null;
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

export function RideExportModal({
  isOpen,
  onClose,
  points,
  summary,
  stravaStatus,
  onConnectStrava,
  onDisconnectStrava,
  stravaAuthError,
}: RideExportModalProps) {
  const [rideName, setRideName] = useState(`${summary.courseName} · Indoor Ride`);
  const [description, setDescription] = useState(
    `Recorded on VeloRoute · Avg ${summary.avgWatts} W · Max ${summary.maxWatts} W`
  );
  const [syncState, setSyncState] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [stravaActivityId, setStravaActivityId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRideName(`${summary.courseName} · Indoor Ride`);
      setDescription(
        `Recorded on VeloRoute · Avg ${summary.avgWatts} W · Max ${summary.maxWatts} W · ${summary.totalWorkKj} kJ`
      );
      setSyncState('idle');
      setSyncMessage(null);
      setStravaActivityId(null);
    }
  }, [isOpen, summary]);

  if (!isOpen) return null;

  const canExport = points.length >= 2;

  const handleSyncStrava = async () => {
    if (!canExport) return;
    setSyncState('uploading');
    setSyncMessage('Encoding FIT file and uploading to Strava...');
    setStravaActivityId(null);

    try {
      const fitBytes = encodeRideToFit(points, summary);
      const fileBase64 = uint8ToBase64(fitBytes);
      const initial = await uploadRideToStrava({
        format: 'fit',
        fileBase64,
        name: rideName.trim() || `${summary.courseName} · Indoor Ride`,
        description: description.trim(),
      });

      if (initial.activityId) {
        setStravaActivityId(initial.activityId);
        setSyncState('done');
        setSyncMessage('Activity synced to Strava.');
        return;
      }

      setSyncState('processing');
      setSyncMessage(initial.status || 'Processing activity on Strava...');

      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        const polled = await pollStravaUploadStatus(initial.uploadId);
        if (polled.error) {
          throw new Error(polled.error);
        }
        if (polled.activityId) {
          setStravaActivityId(polled.activityId);
          setSyncState('done');
          setSyncMessage('Activity synced to Strava.');
          return;
        }
      }

      setSyncState('done');
      setSyncMessage('Uploaded to Strava. Strava is finishing background processing.');
    } catch (err) {
      setSyncState('error');
      setSyncMessage(err instanceof Error ? err.message : 'Strava upload failed.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ride-export-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-2xl rounded-lg border border-[#1C2333] bg-[#0B0E17] text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1C2333]">
          <div>
            <h2 id="ride-export-title" className="font-display text-lg font-bold text-slate-100">
              Completed Ride Summary & Export
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Download your ride telemetry as a standard FIT or GPX file, or sync directly to Strava.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="p-1.5 rounded border border-[#1C2333] text-slate-400 hover:text-slate-100 hover:border-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Summary KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-[#1C2333] bg-[#07090E] rounded-md p-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Distance</div>
              <div className="font-mono text-lg font-bold text-cyan-400 mt-0.5">
                {(summary.totalDistanceMeters / 1000).toFixed(2)} <span className="text-xs text-slate-400">km</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Moving Time</div>
              <div className="font-mono text-lg font-bold text-slate-100 mt-0.5">
                {formatDuration(summary.elapsedSec)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Avg Power</div>
              <div className="font-mono text-lg font-bold text-slate-100 mt-0.5">
                {summary.avgWatts} <span className="text-xs text-slate-400">W</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Ascent</div>
              <div className="font-mono text-lg font-bold text-slate-100 mt-0.5">
                +{summary.elevationGainMeters} <span className="text-xs text-slate-400">m</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Avg Speed</div>
              <div className="font-mono text-sm font-semibold text-slate-200 mt-0.5">
                {summary.avgSpeedKmh.toFixed(1)} km/h
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Max Power</div>
              <div className="font-mono text-sm font-semibold text-slate-200 mt-0.5">
                {summary.maxWatts} W
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Avg Cadence</div>
              <div className="font-mono text-sm font-semibold text-slate-200 mt-0.5">
                {summary.avgCadenceRpm} rpm
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Total Work</div>
              <div className="font-mono text-sm font-semibold text-slate-200 mt-0.5">
                {summary.totalWorkKj} kJ
              </div>
            </div>
          </div>

          {!canExport && (
            <p className="text-xs text-amber-300 border border-amber-500/40 bg-amber-500/10 rounded-md p-3">
              Record at least 2 seconds of riding before exporting or syncing to Strava.
            </p>
          )}

          {/* Ride Title & Notes */}
          <div className="space-y-3">
            <div>
              <label htmlFor="export-ride-name" className="block text-xs font-medium text-slate-300 mb-1">
                Activity Name
              </label>
              <input
                id="export-ride-name"
                type="text"
                value={rideName}
                onChange={(e) => setRideName(e.target.value)}
                className="w-full rounded-md border border-[#1C2333] bg-[#07090E] px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="export-ride-desc" className="block text-xs font-medium text-slate-300 mb-1">
                Activity Description
              </label>
              <input
                id="export-ride-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-[#1C2333] bg-[#07090E] px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Local File Exports */}
          <div className="pt-2 border-t border-[#1C2333] space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Export File
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!canExport}
                onClick={() => downloadRideFit(points, summary, rideName)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-slate-700 bg-[#111622] hover:border-cyan-500/60 disabled:opacity-40 text-xs font-semibold text-slate-100 transition-colors"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                Download .FIT File
              </button>
              <button
                type="button"
                disabled={!canExport}
                onClick={() => downloadRideGpx(points, summary, rideName)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-slate-700 bg-[#111622] hover:border-cyan-500/60 disabled:opacity-40 text-xs font-semibold text-slate-100 transition-colors"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                Download .GPX File
              </button>
            </div>
          </div>

          {/* Strava Sync */}
          <div className="pt-4 border-t border-[#1C2333] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Strava Account Sync
                </h3>
                {stravaStatus.connected && stravaStatus.athlete ? (
                  <p className="text-xs text-emerald-400 font-mono mt-1">
                    ● Connected as {stravaStatus.athlete.firstname} {stravaStatus.athlete.lastname}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">
                    Connect your Strava account to upload this activity directly as a Virtual Ride.
                  </p>
                )}
              </div>
              {stravaStatus.connected && (
                <button
                  type="button"
                  onClick={onDisconnectStrava}
                  className="text-xs text-slate-400 hover:text-slate-200 underline whitespace-nowrap"
                >
                  Disconnect
                </button>
              )}
            </div>

            {!stravaStatus.configured && !stravaStatus.connected && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                Strava OAuth is awaiting server credentials (<span className="font-mono">STRAVA_CLIENT_ID</span> and <span className="font-mono">STRAVA_CLIENT_SECRET</span> in AI Studio Secrets). You can still download <span className="font-mono">.FIT</span> and <span className="font-mono">.GPX</span> files above immediately.
              </div>
            )}

            {stravaAuthError && (
              <p className="text-xs text-rose-400">{stravaAuthError}</p>
            )}

            {stravaStatus.connected ? (
              <button
                type="button"
                disabled={!canExport || syncState === 'uploading' || syncState === 'processing'}
                onClick={handleSyncStrava}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[#FC4C02] hover:bg-[#e34402] disabled:opacity-50 text-xs font-semibold text-white transition-colors"
              >
                {syncState === 'uploading' || syncState === 'processing' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {syncMessage || 'Syncing to Strava...'}
                  </>
                ) : syncState === 'done' ? (
                  <>
                    <Check className="w-4 h-4" />
                    Synced to Strava
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    Upload Ride to Strava
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectStrava}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[#FC4C02] hover:bg-[#e34402] text-xs font-semibold text-white transition-colors"
              >
                <UploadCloud className="w-4 h-4" />
                Connect Strava Account
              </button>
            )}

            {syncMessage && syncState !== 'uploading' && syncState !== 'processing' && (
              <div
                className={`text-xs flex items-center justify-between gap-2 rounded-md px-3 py-2 border ${
                  syncState === 'error'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                }`}
              >
                <span>{syncMessage}</span>
                {stravaActivityId && (
                  <a
                    href={`https://www.strava.com/activities/${stravaActivityId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold underline shrink-0"
                  >
                    View on Strava
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
