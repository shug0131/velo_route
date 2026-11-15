import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  fetchIntervalsAuthUrl,
  fetchIntervalsStatus,
  openIntervalsLoginWindow,
} from '../services/intervalsClient';
import { IntervalsStatus } from '../types/simulator';

interface IntervalsConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  intervalsStatus: IntervalsStatus;
  intervalsError: string | null;
  onStatusUpdated: (status: IntervalsStatus) => void;
  onSyncWorkouts: () => void;
  onDisconnectIntervals: () => Promise<void>;
}

const REQUESTED_PERMISSIONS = [
  {
    scope: 'CALENDAR:READ',
    title: 'Read athlete FTP & profile',
    detail: 'Fetch your cycling FTP to calculate accurate target wattage zones.',
  },
  {
    scope: 'CALENDAR:READ',
    title: 'Read planned workouts & library',
    detail: 'Pull scheduled calendar workouts and saved workout templates into VeloRoute.',
  },
];

export function IntervalsConnectModal({
  isOpen,
  onClose,
  intervalsStatus,
  intervalsError,
  onStatusUpdated,
  onSyncWorkouts,
  onDisconnectIntervals,
}: IntervalsConnectModalProps) {
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState<string>(intervalsStatus.callbackUrl || '');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [awaitingBrowserLogin, setAwaitingBrowserLogin] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedUri, setCopiedUri] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const popupRef = useRef<Window | null>(null);

  const isOAuthReady =
    intervalsStatus.oauthConfigured ??
    (intervalsStatus.configured && intervalsStatus.authMode === 'oauth');

  const loadAuthUrl = useCallback(async () => {
    setLoadingUrl(true);
    setLocalError(null);
    try {
      const res = await fetchIntervalsAuthUrl();
      setAuthUrl(res.url);
      if (res.redirectUri) setRedirectUri(res.redirectUri);
    } catch (err) {
      setAuthUrl(null);
      setLocalError(
        err instanceof Error ? err.message : 'Unable to prepare Intervals.icu login URL.'
      );
    } finally {
      setLoadingUrl(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const next = await fetchIntervalsStatus();
      onStatusUpdated(next);
      if (next.callbackUrl) setRedirectUri(next.callbackUrl);
      if (next.connected) {
        setAwaitingBrowserLogin(false);
      }
      return next;
    } catch {
      return null;
    } finally {
      setCheckingStatus(false);
    }
  }, [onStatusUpdated]);

  useEffect(() => {
    if (!isOpen) {
      setAwaitingBrowserLogin(false);
      setLocalError(null);
      return;
    }
    if (intervalsStatus.callbackUrl) {
      setRedirectUri(intervalsStatus.callbackUrl);
    }
    if (isOAuthReady && (!intervalsStatus.connected || intervalsStatus.authMode === 'apikey')) {
      loadAuthUrl();
    }
  }, [
    isOpen,
    isOAuthReady,
    intervalsStatus.connected,
    intervalsStatus.authMode,
    intervalsStatus.callbackUrl,
    loadAuthUrl,
  ]);

  // Poll status & watch browser login popup while waiting for Intervals.icu OAuth approval
  useEffect(() => {
    if (!isOpen || !awaitingBrowserLogin) return;

    const timer = window.setInterval(async () => {
      const next = await refreshStatus();
      if (next?.connected && next.authMode === 'oauth') {
        setAwaitingBrowserLogin(false);
        return;
      }
      if (popupRef.current && popupRef.current.closed) {
        popupRef.current = null;
        setAwaitingBrowserLogin(false);
        loadAuthUrl();
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [isOpen, awaitingBrowserLogin, refreshStatus, loadAuthUrl]);

  useEffect(() => {
    if (intervalsStatus.connected && intervalsStatus.authMode === 'oauth') {
      setAwaitingBrowserLogin(false);
      setLocalError(null);
    }
  }, [intervalsStatus.connected, intervalsStatus.authMode]);

  if (!isOpen) return null;

  const handleOpenBrowserPopup = () => {
    setLocalError(null);
    if (!authUrl) {
      loadAuthUrl();
      return;
    }
    const win = openIntervalsLoginWindow(authUrl);
    if (!win) {
      setLocalError(
        'Your browser blocked the login popup window. Click "Open in New Browser Tab instead" below to sign in on Intervals.icu.'
      );
      return;
    }
    popupRef.current = win;
    setAwaitingBrowserLogin(true);
  };

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUri(true);
      window.setTimeout(() => setCopiedUri(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const displayError = intervalsError || localError;
  const effectiveCallbackUrl = redirectUri || `${window.location.origin}/auth/intervals/callback`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intervals-connect-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-[#1C2333] bg-[#0B0E17] text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1C2333]">
          <div>
            <h2
              id="intervals-connect-modal-title"
              className="font-display text-lg font-bold text-slate-100"
            >
              Approve Intervals.icu Connection
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Sign in with your Intervals.icu account in your browser to sync planned workouts.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Intervals.icu approval popup"
            className="p-1.5 rounded border border-[#1C2333] text-slate-400 hover:text-slate-100 hover:border-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {intervalsStatus.connected && intervalsStatus.athlete ? (
            <div className="space-y-4">
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                    <Check className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-emerald-200 truncate">
                      {intervalsStatus.athlete.name}
                    </div>
                    <div className="font-mono text-xs text-emerald-300/80">
                      Athlete {intervalsStatus.athlete.id}
                      {intervalsStatus.athlete.ftp ? ` · FTP ${intervalsStatus.athlete.ftp} W` : ''}
                      {intervalsStatus.authMode === 'apikey' ? ' · Server API Key' : ' · OAuth Approved'}
                    </div>
                  </div>
                </div>
              </div>

              {intervalsStatus.authMode === 'apikey' && isOAuthReady && (
                <div className="rounded-md border border-[#1C2333] bg-[#07090E] p-4 space-y-3">
                  <div className="text-xs text-slate-300">
                    Currently synced via server API key. You can also authorize your personal Intervals.icu account directly via browser login:
                  </div>

                  {awaitingBrowserLogin && (
                    <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-cyan-200">
                        <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
                        <span>Waiting for browser approval...</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => refreshStatus()}
                        disabled={checkingStatus}
                        className="px-2.5 py-1 rounded border border-cyan-500/40 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/20 whitespace-nowrap"
                      >
                        {checkingStatus ? 'Checking...' : 'Check Now'}
                      </button>
                    </div>
                  )}

                  {displayError && (
                    <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
                      {displayError}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={loadingUrl || !authUrl}
                    onClick={handleOpenBrowserPopup}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-xs font-semibold text-slate-950 transition-colors"
                  >
                    {loadingUrl ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Preparing Intervals.icu Login...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4" />
                        Log in &amp; Approve on Intervals.icu
                      </>
                    )}
                  </button>

                  {authUrl && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                      <a
                        href={authUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setAwaitingBrowserLogin(true)}
                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 underline"
                      >
                        Open in New Browser Tab instead
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopyText(effectiveCallbackUrl)}
                        className="inline-flex items-center gap-1 text-slate-300 hover:text-slate-100"
                      >
                        {copiedUri ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedUri ? 'Callback Copied' : 'Copy Callback URL'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-slate-400">
                Your Intervals.icu account is active. You can select any planned calendar workout or library workout from the Course &amp; Video tab.
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1C2333]">
                {intervalsStatus.authMode === 'oauth' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await onDisconnectIntervals();
                      loadAuthUrl();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Disconnect / Switch Account
                  </button>
                ) : (
                  <span className="text-[11px] font-mono text-slate-500">
                    Connected via server key
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSyncWorkouts();
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 text-xs font-semibold transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sync Workouts
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-md bg-cyan-500 text-slate-950 hover:bg-cyan-400 text-xs font-semibold transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ) : isOAuthReady ? (
            <div className="space-y-5">
              {/* Permission Scope Review */}
              <div className="rounded-md border border-[#1C2333] bg-[#07090E] p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Requested Intervals.icu Permissions
                </div>
                <ul className="space-y-2.5">
                  {REQUESTED_PERMISSIONS.map((perm) => (
                    <li key={perm.title} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-200">{perm.title}</span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {perm.scope}
                        </span>
                      </div>
                      <p className="text-slate-400 mt-0.5">{perm.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {awaitingBrowserLogin && (
                <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-cyan-200">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
                    <span>
                      Waiting for you to log in and click Authorize in the Intervals.icu browser window...
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => refreshStatus()}
                    disabled={checkingStatus}
                    className="px-2.5 py-1 rounded border border-cyan-500/40 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/20 whitespace-nowrap"
                  >
                    {checkingStatus ? 'Checking...' : 'Check Now'}
                  </button>
                </div>
              )}

              {displayError && (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {displayError}
                </div>
              )}

              {/* Primary Browser Login Approval Action */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={loadingUrl || !authUrl}
                  onClick={handleOpenBrowserPopup}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-xs font-semibold text-slate-950 transition-colors"
                >
                  {loadingUrl ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparing Intervals.icu Login...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      Log in &amp; Approve on Intervals.icu
                    </>
                  )}
                </button>

                {authUrl && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-1">
                    <a
                      href={authUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setAwaitingBrowserLogin(true)}
                      className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 underline"
                    >
                      Open in New Browser Tab instead
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => refreshStatus()}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-slate-100"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Verify Connection
                    </button>
                  </div>
                )}
              </div>

              {/* Registered Redirect URI Help */}
              <div className="rounded-md border border-[#1C2333] bg-[#07090E] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">
                    Intervals.icu OAuth Redirect URI
                  </span>
                  <a
                    href="https://intervals.icu/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 underline"
                  >
                    Intervals.icu Settings
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-xs text-cyan-300 break-all">
                    {effectiveCallbackUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyText(effectiveCallbackUrl)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 text-xs text-slate-200 hover:border-cyan-500/60 shrink-0"
                  >
                    {copiedUri ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy URL
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 space-y-2">
                <p className="font-semibold text-amber-100">
                  Intervals.icu OAuth Credentials Required
                </p>
                <p>
                  To approve connections via browser login, add{' '}
                  <span className="font-mono text-amber-100">INTERVALS_CLIENT_ID</span> and{' '}
                  <span className="font-mono text-amber-100">INTERVALS_CLIENT_SECRET</span> in AI Studio Secrets (or set <span className="font-mono text-amber-100">INTERVALS_API_KEY</span> for single-user sync), and register the callback URL below in your Intervals.icu OAuth app.
                </p>
              </div>

              <div className="rounded-md border border-[#1C2333] bg-[#07090E] p-3.5 space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  Intervals.icu OAuth Redirect / Callback URL
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-xs text-cyan-300 break-all">
                    {effectiveCallbackUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyText(effectiveCallbackUrl)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 text-xs text-slate-200 hover:border-cyan-500/60 shrink-0"
                  >
                    {copiedUri ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy URL
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#1C2333]">
                <a
                  href="https://intervals.icu/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 underline"
                >
                  Open Intervals.icu Settings
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={() => refreshStatus()}
                  disabled={checkingStatus}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#111622] border border-slate-700 hover:border-cyan-500/60 text-xs font-semibold text-slate-100 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
                  Re-check Credentials
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
