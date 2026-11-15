import { Bluetooth, Calendar, Check, Radio, RotateCcw, UploadCloud } from 'lucide-react';
import { isWebBluetoothSupported } from '../services/webBluetoothTypes';
import {
  IntervalsStatus,
  KickrTelemetry,
  StravaStatus,
  ZwiftClickTelemetry,
} from '../types/simulator';

interface HardwarePanelProps {
  kickr: KickrTelemetry;
  zwiftClick: ZwiftClickTelemetry;
  onConnectKickr: () => void;
  onDisconnectKickr: () => void;
  onConnectZwiftClick: () => void;
  onDisconnectZwiftClick: () => void;
  onSetClickLearnMode: (mode: 'up' | 'down' | null) => void;
  onClearClickSignatures: () => void;
  stravaStatus: StravaStatus;
  onConnectStrava: () => void;
  onDisconnectStrava: () => void;
  stravaAuthError: string | null;
  intervalsStatus: IntervalsStatus;
  onConnectIntervals: () => void;
  onDisconnectIntervals: () => void;
  intervalsError: string | null;
  onBackToCockpit: () => void;
}

export function HardwarePanel({
  kickr,
  zwiftClick,
  onConnectKickr,
  onDisconnectKickr,
  onConnectZwiftClick,
  onDisconnectZwiftClick,
  onSetClickLearnMode,
  onClearClickSignatures,
  stravaStatus,
  onConnectStrava,
  onDisconnectStrava,
  stravaAuthError,
  intervalsStatus,
  onConnectIntervals,
  onDisconnectIntervals,
  intervalsError,
  onBackToCockpit,
}: HardwarePanelProps) {
  const bleAvailable = isWebBluetoothSupported();

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1C2333] pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">
            Bluetooth Trainer & Shifter Hardware
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Pair your Wahoo KICKR over FTMS and Zwift Click v2 over Bluetooth Low Energy.
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

      {!bleAvailable && (
        <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-4 text-sm text-amber-200">
          Web Bluetooth is unavailable in this browser or context. Open VeloRoute in desktop Chrome or Edge over HTTPS to pair physical BLE hardware, or use the built-in Cadence Simulator in the Ride Cockpit.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Wahoo KICKR Card */}
        <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-100">
                Wahoo KICKR Smart Trainer
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                FTMS (0x1826) & Cycling Power (0x1818)
              </p>
            </div>
            {kickr.connected ? (
              <button
                type="button"
                onClick={onDisconnectKickr}
                className="px-3 py-1.5 rounded-md border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 whitespace-nowrap"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectKickr}
                disabled={kickr.connecting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 disabled:opacity-50 whitespace-nowrap"
              >
                <Bluetooth className="w-3.5 h-3.5" />
                {kickr.connecting ? 'Scanning...' : 'Pair KICKR'}
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-[#1C2333] grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block">Connection State</span>
              <span className={`font-mono mt-0.5 block ${kickr.connected ? 'text-emerald-400' : 'text-slate-300'}`}>
                {kickr.connected ? `● Connected (${kickr.deviceName})` : 'Disconnected'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">FTMS Control Point</span>
              <span className="font-mono text-slate-200 mt-0.5 block">
                {kickr.controlGranted ? 'Granted (0x2AD9)' : 'Awaiting connection'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Live Power / Cadence</span>
              <span className="font-mono text-slate-200 mt-0.5 block">
                {kickr.watts} W · {kickr.cadenceRpm} rpm
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Last Resistance Command</span>
              <span className="font-mono text-cyan-300 mt-0.5 block truncate">
                {kickr.lastCommandSummary || 'None'}
              </span>
            </div>
          </div>

          {kickr.error && <p className="text-xs text-rose-400">{kickr.error}</p>}

          <p className="text-xs text-slate-400 pt-2 border-t border-[#1C2333]">
            Close the Wahoo app or Zwift before pairing so VeloRoute can claim FTMS Resistance Control (0x2AD9).
          </p>
        </div>

        {/* Zwift Click v2 Card */}
        <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-100">
                Zwift Click v2 Controller
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                BLE Race Controller (RideOn Handshake + FC82)
              </p>
            </div>
            {zwiftClick.connected ? (
              <button
                type="button"
                onClick={onDisconnectZwiftClick}
                className="px-3 py-1.5 rounded-md border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 whitespace-nowrap"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectZwiftClick}
                disabled={zwiftClick.connecting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 disabled:opacity-50 whitespace-nowrap"
              >
                <Bluetooth className="w-3.5 h-3.5" />
                {zwiftClick.connecting ? 'Scanning...' : 'Pair Click v2'}
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-[#1C2333] grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block">Connection State</span>
              <span className={`font-mono mt-0.5 block ${zwiftClick.connected ? 'text-emerald-400' : 'text-slate-300'}`}>
                {zwiftClick.connected
                  ? `● Connected (${zwiftClick.deviceName})`
                  : 'Disconnected'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Battery / Handshake</span>
              <span className="font-mono text-slate-200 mt-0.5 block">
                {zwiftClick.batteryPercent !== null ? `${zwiftClick.batteryPercent}%` : '—'} ·{' '}
                {zwiftClick.handshakeComplete ? 'RideOn OK' : 'Pending'}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400 block">Last BLE Packet Hex</span>
              <span className="font-mono text-cyan-300 mt-0.5 block">
                {zwiftClick.lastPacketHex || 'No packets received yet'}
              </span>
            </div>
          </div>

          {/* 2-Tap Firmware Calibration */}
          <div className="pt-3 border-t border-[#1C2333] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-200">
                Button Calibration (Optional for custom firmware)
              </span>
              {(zwiftClick.customUpSignature || zwiftClick.customDownSignature) && (
                <button
                  type="button"
                  onClick={onClearClickSignatures}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!zwiftClick.connected}
                onClick={() =>
                  onSetClickLearnMode(zwiftClick.learnMode === 'up' ? null : 'up')
                }
                className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded border text-xs font-medium transition-colors disabled:opacity-40 ${
                  zwiftClick.learnMode === 'up'
                    ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                    : zwiftClick.customUpSignature
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-700 bg-[#111622] text-slate-300 hover:border-slate-500'
                }`}
              >
                {zwiftClick.learnMode === 'up' ? (
                  <>
                    <Radio className="w-3.5 h-3.5" />
                    Press + Now
                  </>
                ) : zwiftClick.customUpSignature ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    + Mapped
                  </>
                ) : (
                  'Learn + Shift'
                )}
              </button>

              <button
                type="button"
                disabled={!zwiftClick.connected}
                onClick={() =>
                  onSetClickLearnMode(zwiftClick.learnMode === 'down' ? null : 'down')
                }
                className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded border text-xs font-medium transition-colors disabled:opacity-40 ${
                  zwiftClick.learnMode === 'down'
                    ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                    : zwiftClick.customDownSignature
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-700 bg-[#111622] text-slate-300 hover:border-slate-500'
                }`}
              >
                {zwiftClick.learnMode === 'down' ? (
                  <>
                    <Radio className="w-3.5 h-3.5" />
                    Press - Now
                  </>
                ) : zwiftClick.customDownSignature ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    - Mapped
                  </>
                ) : (
                  'Learn - Shift'
                )}
              </button>
            </div>
          </div>

          {zwiftClick.error && <p className="text-xs text-rose-400">{zwiftClick.error}</p>}
        </div>
      </div>

      {/* Strava Account Connection */}
      <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Strava Activity Sync
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Authorize Strava once to upload completed indoor rides directly as Virtual Rides with power, cadence, and GPX elevation.
            </p>
          </div>
          {stravaStatus.connected ? (
            <button
              type="button"
              onClick={onDisconnectStrava}
              className="px-3 py-1.5 rounded-md border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 whitespace-nowrap self-start"
            >
              Disconnect Strava
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnectStrava}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#FC4C02] hover:bg-[#e34402] text-xs font-semibold text-white whitespace-nowrap self-start transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              Connect Strava
            </button>
          )}
        </div>

        <div className="pt-3 border-t border-[#1C2333] flex flex-wrap items-center justify-between gap-2 text-xs">
          {stravaStatus.connected && stravaStatus.athlete ? (
            <span className="font-mono text-emerald-400">
              ● Connected as {stravaStatus.athlete.firstname} {stravaStatus.athlete.lastname} (ID {stravaStatus.athlete.id})
            </span>
          ) : stravaStatus.configured ? (
            <span className="text-slate-400">Not connected. Click Connect Strava to review permissions and log in via browser.</span>
          ) : (
            <span className="text-amber-300">
              Configure <span className="font-mono">STRAVA_CLIENT_ID</span> and <span className="font-mono">STRAVA_CLIENT_SECRET</span> in AI Studio Secrets, or click Connect Strava to view setup callback URL.
            </span>
          )}
        </div>

        {stravaAuthError && <p className="text-xs text-rose-400">{stravaAuthError}</p>}
      </div>

      {/* Intervals.icu Account Connection */}
      <div className="border border-[#1C2333] bg-[#0B0E17] rounded-lg p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Intervals.icu Workout Sync
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Connect your Intervals.icu calendar and workout library to select structured power targets for any ride.
            </p>
          </div>
          {intervalsStatus.connected ? (
            intervalsStatus.authMode === 'oauth' ? (
              <button
                type="button"
                onClick={onDisconnectIntervals}
                className="px-3 py-1.5 rounded-md border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 whitespace-nowrap self-start"
              >
                Disconnect Intervals.icu
              </button>
            ) : intervalsStatus.oauthConfigured ? (
              <button
                type="button"
                onClick={onConnectIntervals}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-xs font-semibold text-cyan-300 whitespace-nowrap self-start transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                Browser Login
              </button>
            ) : null
          ) : (
            <button
              type="button"
              onClick={onConnectIntervals}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-cyan-500 text-slate-950 hover:bg-cyan-400 text-xs font-semibold whitespace-nowrap self-start transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" />
              Connect Intervals.icu
            </button>
          )}
        </div>

        <div className="pt-3 border-t border-[#1C2333] flex flex-wrap items-center justify-between gap-2 text-xs">
          {intervalsStatus.connected && intervalsStatus.athlete ? (
            <span className="font-mono text-emerald-400">
              ● Connected as {intervalsStatus.athlete.name}
              {intervalsStatus.athlete.ftp ? ` · FTP ${intervalsStatus.athlete.ftp} W` : ''}
            </span>
          ) : intervalsStatus.configured ? (
            <span className="text-slate-400">
              Not connected. Click Connect Intervals.icu to review permissions and log in via browser.
            </span>
          ) : (
            <span className="text-amber-300">
              Configure <span className="font-mono">INTERVALS_CLIENT_ID</span> & <span className="font-mono">INTERVALS_CLIENT_SECRET</span> (or <span className="font-mono">INTERVALS_API_KEY</span>) in AI Studio Secrets, or click Connect Intervals.icu to view callback URL.
            </span>
          )}
        </div>

        {intervalsError && <p className="text-xs text-rose-400">{intervalsError}</p>}
      </div>
    </div>
  );
}
