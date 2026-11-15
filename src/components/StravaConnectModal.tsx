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
  fetchStravaAuthUrl,
  fetchStravaStatus,
  openStravaLoginWindow,
} from '../services/stravaClient';
import { StravaStatus } from '../types/simulator';

interface StravaConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  stravaStatus: StravaStatus;
  stravaAuthError: string | null;
  onStatusUpdated: (status: StravaStatus) => void;
  onDisconnectStrava: () => Promise<void>;
}

const REQUESTED_PERMISSIONS = [
  {
    scope: 'read',
    title: 'Read athlete profile',
    detail: 'Display your connected Strava name and athlete ID inside VeloRoute.',
  },
  {
    scope: 'activity:write',
    title: 'Upload completed rides',
    detail: 'Sync finished .FIT rides with power, cadence, and GPX elevation as Virtual Rides.',
  },
  {
    scope: 'activity:read_all',
    title: 'Verify upload processing',
    detail: 'Confirm when Strava finishes processing your uploaded activity and link to it.',
  },
];

export function StravaConnectModal({
  isOpen,
  onClose,
  stravaStatus,
  stravaAuthError,
  onStatusUpdated,
  onDisconnectStrava,
}: StravaConnectModalProps) {
  const [forceApproval, setForceApproval] = useState(true);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState<string>(stravaStatus.callbackUrl || '');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [awaitingBrowserLogin, setAwaitingBrowserLogin] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedUri, setCopiedUri] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const popupRef = useRef<Window | null>(null);

  const loadAuthUrl = useCallback(
    async (force: boolean) => {
      setLoadingUrl(true);
      setLocalError(null);
      try {
        const res = await fetchStravaAuthUrl(force);
        setAuthUrl(res.url);
        if (res.redirectUri) setRedirectUri(res.redirectUri);
      } catch (err) {
        setAuthUrl(null);
        setLocalError(
          err instanceof Error ? err.message : 'Unable to prepare Strava login URL.'
        );
      } finally {
        setLoadingUrl(false);
      }
    },
    []
  );

  const refreshStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const next = await fetchStravaStatus();
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
    if (stravaStatus.callbackUrl) {
      setRedirectUri(stravaStatus.callbackUrl);
    }
    if (stravaStatus.configured && !stravaStatus.connected) {
      loadAuthUrl(forceApproval);
    }
  }, [isOpen, stravaStatus.configured, stravaStatus.connected, stravaStatus.callbackUrl, forceApproval, loadAuthUrl]);

  // Poll status & monitor browser popup window while awaiting Strava login approval
  useEffect(() => {
    if (!isOpen || !awaitingBrowserLogin || stravaStatus.connected) return;

    const timer = window.setInterval(async () => {
      const next = await refreshStatus();
      if (next?.connected) {
        setAwaitingBrowserLogin(false);
        return;
      }
      if (popupRef.current && popupRef.current.closed) {
        popupRef.current = null;
        setAwaitingBrowserLogin(false);
        // Re-fetch a fresh state/URL in case user closed popup before completing
        loadAuthUrl(forceApproval);
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [isOpen, awaitingBrowserLogin, stravaStatus.connected, refreshStatus, loadAuthUrl, forceApproval]);

  useEffect(() => {
    if (stravaStatus.connected) {
      setAwaitingBrowserLogin(false);
      setLocalError(null);
    }
  }, [stravaStatus.connected]);

  if (!isOpen) return null;

  const handleOpenBrowserPopup = () => {
    setLocalError(null);
    if (!authUrl) {
      loadAuthUrl(forceApproval);
      return;
    }
    const win = openStravaLoginWindow(authUrl);
    if (!win) {
      setLocalError(
        'Your browser blocked the login popup window. Click "Open in New Browser Tab" below to log in on Strava.'
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

  const displayError = stravaAuthError || localError;
  const effectiveCallbackUrl = redirectUri || `${window.location.origin}/auth/callback`;
  const effectiveCallbackDomain = (() => {
    try {
      return new URL(effectiveCallbackUrl).host;
    } catch {
      return window.location.host;
    }
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="strava-connect-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-[#1C2333] bg-[#0B0E17] text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1C2333]">
          <div>
            <h2
              id="strava-connect-modal-title"
              className="font-display text-lg font-bold text-slate-100"
            >
              Approve Strava Connection
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Sign in with your Strava account in your browser to authorize activity uploads.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Strava approval popup"
            className="p-1.5 rounded border border-[#1C2333] text-slate-400 hover:text-slate-100 hover:border-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {stravaStatus.connected && stravaStatus.athlete ? (
            <div className="space-y-4">
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                    <Check className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-emerald-200 truncate">
                      {stravaStatus.athlete.firstname} {stravaStatus.athlete.lastname}
                    </div>
                    <div className="font-mono text-xs text-emerald-300/80">
                      Strava Athlete ID {stravaStatus.athlete.id} · Approved
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-400">
                Your Strava connection is active for this session. Completed rides can be synced directly from the Ride Export dialog.
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1C2333]">
                <button
                  type="button"
                  onClick={async () => {
                    await onDisconnectStrava();
                    loadAuthUrl(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect / Switch Account
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
          ) : stravaStatus.configured ? (
            <div className="space-y-5">
              {/* Permission Scope Review */}
              <div className="rounded-md border border-[#1C2333] bg-[#07090E] p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-[#FC4C02]" />
                  Requested Strava Permissions
                </div>
                <ul className="space-y-2.5">
                  {REQUESTED_PERMISSIONS.map((perm) => (
                    <li key={perm.scope} className="text-xs">
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

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceApproval}
                  onChange={(e) => setForceApproval(e.target.checked)}
                  className="rounded border-slate-600 bg-[#07090E] accent-[#FC4C02]"
                />
                Always prompt Strava login & approval screen in browser
              </label>

              {awaitingBrowserLogin && (
                <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-cyan-200">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
                    <span>
                      Waiting for you to log in and click Authorize in the Strava browser window...
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
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[#FC4C02] hover:bg-[#e34402] disabled:opacity-50 text-xs font-semibold text-white transition-colors"
                >
                  {loadingUrl ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Preparing Strava Login...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      Log in & Approve on Strava
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

              {/* Strava Authorization Callback Domain Help */}
              <div className="rounded-md border border-[#1C2333] bg-[#07090E] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">
                    Strava Authorization Callback Domain
                  </span>
                  <a
                    href="https://www.strava.com/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 underline"
                  >
                    Strava API Settings
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-xs text-cyan-300 break-all">
                    {effectiveCallbackDomain}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyText(effectiveCallbackDomain)}
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
                        Copy Domain
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  If Strava returns <span className="font-mono text-slate-300">redirect_uri invalid</span>, set <span className="text-slate-200">Authorization Callback Domain</span> in your Strava My API Application settings to this exact hostname (without <span className="font-mono">https://</span> or <span className="font-mono">/auth/callback</span>).
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 space-y-2">
                <p className="font-semibold text-amber-100">
                  Strava OAuth Credentials Required
                </p>
                <p>
                  To open the Strava browser login screen, add{' '}
                  <span className="font-mono text-amber-100">STRAVA_CLIENT_ID</span> and{' '}
                  <span className="font-mono text-amber-100">STRAVA_CLIENT_SECRET</span> in AI Studio Secrets, and set your Strava Authorization Callback Domain below.
                </p>
              </div>

              <div className="rounded-md border border-[#1C2333] bg-[#07090E] p-3.5 space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  Strava Authorization Callback Domain (for Strava API Settings)
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-xs text-cyan-300 break-all">
                    {effectiveCallbackDomain}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyText(effectiveCallbackDomain)}
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
                        Copy Domain
                      </>
                    )}
                  </button>
                </div>
                <div className="text-[11px] font-mono text-slate-500 break-all">
                  Full redirect_uri: {effectiveCallbackUrl}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#1C2333]">
                <a
                  href="https://www.strava.com/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 underline"
                >
                  Open Strava API Settings
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
