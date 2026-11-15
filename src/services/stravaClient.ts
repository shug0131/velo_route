import { StravaAthlete, StravaStatus } from '../types/simulator';

const STRAVA_SESSION_STORAGE_KEY = 'veloroute_strava_session_key';

function getSessionHeader(): Record<string, string> {
  try {
    const key = sessionStorage.getItem(STRAVA_SESSION_STORAGE_KEY);
    if (key) return { 'X-Strava-Session': key };
  } catch {
    // ignore storage errors
  }
  return {};
}

export function saveStravaSessionKey(key: string | null) {
  try {
    if (key) {
      sessionStorage.setItem(STRAVA_SESSION_STORAGE_KEY, key);
    } else {
      sessionStorage.removeItem(STRAVA_SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export async function fetchStravaStatus(): Promise<StravaStatus> {
  const res = await fetch('/api/strava/status', {
    credentials: 'include',
    headers: { ...getSessionHeader() },
  });
  if (!res.ok) {
    throw new Error('Failed to check Strava connection status.');
  }
  return (await res.json()) as StravaStatus;
}

export interface StravaAuthUrlResult {
  url: string;
  redirectUri: string;
  sessionKey?: string;
}

export async function fetchStravaAuthUrl(forceApproval = true): Promise<StravaAuthUrlResult> {
  const res = await fetch(`/api/strava/auth-url?force=${forceApproval ? 'true' : 'false'}`, {
    credentials: 'include',
    headers: { ...getSessionHeader() },
  });
  const data = (await res.json()) as Partial<StravaAuthUrlResult> & { error?: string };
  if (data.sessionKey) {
    saveStravaSessionKey(data.sessionKey);
  }
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Unable to start Strava authorization.');
  }
  return {
    url: data.url,
    redirectUri: data.redirectUri || '',
    sessionKey: data.sessionKey,
  };
}

export function openStravaLoginWindow(url: string): Window | null {
  return window.open(
    url,
    'strava_oauth_popup',
    'width=620,height=740,menubar=no,toolbar=no,location=yes'
  );
}

export async function startStravaOAuthPopup(forceApproval = true): Promise<Window> {
  const { url } = await fetchStravaAuthUrl(forceApproval);
  const popup = openStravaLoginWindow(url);
  if (!popup) {
    throw new Error(
      'Popup was blocked by the browser. Use the direct browser login link in the approval dialog.'
    );
  }
  return popup;
}

export async function disconnectStrava(): Promise<void> {
  await fetch('/api/strava/disconnect', {
    method: 'POST',
    credentials: 'include',
    headers: { ...getSessionHeader() },
  });
  saveStravaSessionKey(null);
}

export interface StravaUploadResult {
  uploadId: string;
  status: string;
  activityId: number | null;
  error: string | null;
}

export async function uploadRideToStrava(params: {
  format: 'fit' | 'gpx';
  fileBase64: string;
  name: string;
  description: string;
}): Promise<StravaUploadResult> {
  const res = await fetch('/api/strava/upload', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getSessionHeader(),
    },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as StravaUploadResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Failed to upload ride to Strava.');
  }
  return data;
}

export async function pollStravaUploadStatus(uploadId: string): Promise<StravaUploadResult> {
  const res = await fetch(`/api/strava/upload/${encodeURIComponent(uploadId)}`, {
    credentials: 'include',
    headers: { ...getSessionHeader() },
  });
  const data = (await res.json()) as StravaUploadResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Failed to check Strava upload status.');
  }
  return data;
}

export function subscribeStravaOAuthMessages(
  onSuccess: (athlete: StravaAthlete | null, sessionKey: string | null) => void,
  onError: (error: string) => void
): () => void {
  const handler = (event: MessageEvent) => {
    const origin = event.origin || '';
    if (
      origin &&
      !origin.endsWith('.run.app') &&
      !origin.includes('localhost') &&
      !origin.includes('127.0.0.1')
    ) {
      return;
    }
    if (event.data?.type === 'STRAVA_OAUTH_SUCCESS') {
      const sessionKey =
        typeof event.data.sessionKey === 'string' ? event.data.sessionKey : null;
      if (sessionKey) saveStravaSessionKey(sessionKey);
      onSuccess((event.data.athlete as StravaAthlete) || null, sessionKey);
    } else if (event.data?.type === 'STRAVA_OAUTH_ERROR') {
      onError(typeof event.data.error === 'string' ? event.data.error : 'Strava connection failed.');
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
