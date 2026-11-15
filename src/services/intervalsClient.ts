import {
  IntervalsAthlete,
  IntervalsRemoteWorkout,
  IntervalsStatus,
} from '../types/simulator';

const INTERVALS_SESSION_STORAGE_KEY = 'veloroute_intervals_session_key';

function getSessionHeader(): Record<string, string> {
  try {
    const key = sessionStorage.getItem(INTERVALS_SESSION_STORAGE_KEY);
    if (key) return { 'X-Intervals-Session': key };
  } catch {
    // ignore storage errors
  }
  return {};
}

export function saveIntervalsSessionKey(key: string | null) {
  try {
    if (key) {
      sessionStorage.setItem(INTERVALS_SESSION_STORAGE_KEY, key);
    } else {
      sessionStorage.removeItem(INTERVALS_SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export async function fetchIntervalsStatus(): Promise<IntervalsStatus> {
  const res = await fetch('/api/intervals/status', {
    credentials: 'include',
    headers: { ...getSessionHeader() },
  });
  if (!res.ok) {
    throw new Error('Failed to check Intervals.icu status.');
  }
  return (await res.json()) as IntervalsStatus;
}

export interface IntervalsAuthUrlResult {
  url: string;
  redirectUri: string;
  sessionKey?: string;
}

export async function fetchIntervalsAuthUrl(): Promise<IntervalsAuthUrlResult> {
  const res = await fetch('/api/intervals/auth-url', {
    credentials: 'include',
    headers: { ...getSessionHeader() },
  });
  const data = (await res.json()) as Partial<IntervalsAuthUrlResult> & { error?: string };
  if (data.sessionKey) {
    saveIntervalsSessionKey(data.sessionKey);
  }
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Unable to start Intervals.icu authorization.');
  }
  return {
    url: data.url,
    redirectUri: data.redirectUri || '',
    sessionKey: data.sessionKey,
  };
}

export function openIntervalsLoginWindow(url: string): Window | null {
  return window.open(
    url,
    'intervals_oauth_popup',
    'width=620,height=740,menubar=no,toolbar=no,location=yes'
  );
}

export async function startIntervalsOAuthPopup(): Promise<Window> {
  const { url } = await fetchIntervalsAuthUrl();
  const popup = openIntervalsLoginWindow(url);
  if (!popup) {
    throw new Error(
      'Popup blocked by browser. Use the direct browser login link in the approval dialog.'
    );
  }
  return popup;
}

export async function disconnectIntervals(): Promise<void> {
  await fetch('/api/intervals/disconnect', {
    method: 'POST',
    credentials: 'include',
    headers: { ...getSessionHeader() },
  });
  saveIntervalsSessionKey(null);
}

export async function fetchIntervalsWorkouts(): Promise<{
  athlete: IntervalsAthlete;
  workouts: IntervalsRemoteWorkout[];
}> {
  const res = await fetch('/api/intervals/workouts', {
    credentials: 'include',
    headers: { ...getSessionHeader() },
  });
  const data = (await res.json()) as {
    athlete?: IntervalsAthlete;
    workouts?: IntervalsRemoteWorkout[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Failed to sync workouts from Intervals.icu.');
  }
  return {
    athlete: data.athlete || { id: '0', name: 'Intervals Athlete' },
    workouts: data.workouts || [],
  };
}

export function subscribeIntervalsOAuthMessages(
  onSuccess: (athlete: IntervalsAthlete | null, sessionKey: string | null) => void,
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
    if (event.data?.type === 'INTERVALS_OAUTH_SUCCESS') {
      const sessionKey =
        typeof event.data.sessionKey === 'string' ? event.data.sessionKey : null;
      if (sessionKey) saveIntervalsSessionKey(sessionKey);
      onSuccess((event.data.athlete as IntervalsAthlete) || null, sessionKey);
    } else if (event.data?.type === 'INTERVALS_OAUTH_ERROR') {
      onError(
        typeof event.data.error === 'string'
          ? event.data.error
          : 'Intervals.icu connection failed.'
      );
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
