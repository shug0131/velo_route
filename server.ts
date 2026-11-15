import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const SESSION_COOKIE_NAME = 'veloroute_strava_sid';
const INTERVALS_COOKIE_NAME = 'veloroute_intervals_sid';

interface StravaAthleteInfo {
  id: number;
  firstname: string;
  lastname: string;
  username?: string;
  profile?: string;
}

interface StravaSessionRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athlete: StravaAthleteInfo;
}

interface IntervalsAthleteInfo {
  id: string;
  name: string;
  ftp?: number;
}

interface IntervalsSessionRecord {
  accessToken: string;
  athlete: IntervalsAthleteInfo;
}

const sessionStore = new Map<string, StravaSessionRecord>();
const pendingOauthStates = new Map<string, { sid: string; createdAt: number }>();

const intervalsSessionStore = new Map<string, IntervalsSessionRecord>();
const pendingIntervalsStates = new Map<string, { sid: string; createdAt: number }>();

function getStravaCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.STRAVA_CLIENT_ID || process.env.CLIENT_ID || '').trim();
  const clientSecret = (
    process.env.STRAVA_CLIENT_SECRET ||
    process.env.CLIENT_SECRET ||
    ''
  ).trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function getIntervalsOAuthCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.INTERVALS_CLIENT_ID || '').trim();
  const clientSecret = (process.env.INTERVALS_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function getIntervalsApiKey(): string | null {
  const key = (process.env.INTERVALS_API_KEY || '').trim();
  return key || null;
}

function getAppBaseUrl(req: Request): string {
  const envUrl = (process.env.APP_URL || '').trim();
  if (envUrl && envUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(envUrl)) {
    return envUrl.replace(/\/+$/, '');
  }
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : protoHeader || req.protocol || 'http';
  const hostHeader = req.headers['x-forwarded-host'];
  const host = Array.isArray(hostHeader)
    ? hostHeader[0]
    : hostHeader || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = decodeURIComponent(part.slice(eqIdx + 1).trim());
    if (key) result[key] = val;
  }
  return result;
}

function getOrCreateSessionId(req: Request, res: Response): string {
  const headerSid = req.headers['x-strava-session'];
  if (typeof headerSid === 'string' && headerSid.length >= 16) {
    return headerSid;
  }
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[SESSION_COOKIE_NAME];
  if (existing && existing.length >= 16) {
    return existing;
  }
  const newSid = crypto.randomBytes(24).toString('hex');
  res.cookie(SESSION_COOKIE_NAME, newSid, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return newSid;
}

function getSessionFromRequest(req: Request): {
  sid: string | null;
  record: StravaSessionRecord | null;
} {
  const headerSid = req.headers['x-strava-session'];
  if (typeof headerSid === 'string' && sessionStore.has(headerSid)) {
    return { sid: headerSid, record: sessionStore.get(headerSid) ?? null };
  }
  const cookies = parseCookies(req.headers.cookie);
  const cookieSid = cookies[SESSION_COOKIE_NAME];
  if (cookieSid && sessionStore.has(cookieSid)) {
    return { sid: cookieSid, record: sessionStore.get(cookieSid) ?? null };
  }
  return { sid: cookieSid || null, record: null };
}

async function ensureFreshAccessToken(
  sid: string,
  record: StravaSessionRecord
): Promise<StravaSessionRecord> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (record.expiresAt > nowSec + 60) {
    return record;
  }
  const creds = getStravaCredentials();
  if (!creds) {
    throw new Error('Strava OAuth credentials are not configured on the server.');
  }

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: record.refreshToken,
    }),
  });

  if (!response.ok) {
    sessionStore.delete(sid);
    throw new Error('Strava session expired. Please reconnect your Strava account.');
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  const updated: StravaSessionRecord = {
    ...record,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || record.refreshToken,
    expiresAt: data.expires_at,
  };
  sessionStore.set(sid, updated);
  return updated;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Periodically prune stale OAuth state entries
  setInterval(() => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [state, info] of pendingOauthStates.entries()) {
      if (info.createdAt < cutoff) {
        pendingOauthStates.delete(state);
      }
    }
    for (const [state, info] of pendingIntervalsStates.entries()) {
      if (info.createdAt < cutoff) {
        pendingIntervalsStates.delete(state);
      }
    }
  }, 5 * 60 * 1000).unref();

  // 1. Strava Connection Status
  app.get('/api/strava/status', (req: Request, res: Response) => {
    const creds = getStravaCredentials();
    const { record } = getSessionFromRequest(req);
    const callbackUrl = `${getAppBaseUrl(req)}/auth/callback`;
    res.json({
      configured: Boolean(creds),
      connected: Boolean(record),
      athlete: record?.athlete ?? null,
      callbackUrl,
    });
  });

  // 2. Construct Strava OAuth URL for browser login popup flow
  app.get('/api/strava/auth-url', (req: Request, res: Response) => {
    const creds = getStravaCredentials();
    const callbackUrl = `${getAppBaseUrl(req)}/auth/callback`;
    if (!creds) {
      res.status(503).json({
        error:
          'Strava OAuth is not configured yet. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in environment secrets.',
        redirectUri: callbackUrl,
      });
      return;
    }

    const sid = getOrCreateSessionId(req, res);
    const state = crypto.randomBytes(18).toString('hex');
    pendingOauthStates.set(state, { sid, createdAt: Date.now() });

    const forceApproval = req.query.force !== 'false';
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      approval_prompt: forceApproval ? 'force' : 'auto',
      scope: 'read,activity:write,activity:read_all',
      state,
    });

    res.json({
      url: `https://www.strava.com/oauth/authorize?${params.toString()}`,
      redirectUri: callbackUrl,
      sessionKey: sid,
    });
  });

  // 3. OAuth Callback Handler (handles trailing slash variations)
  const handleOAuthCallback = async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const errorParam = typeof req.query.error === 'string' ? req.query.error : '';

    if (errorParam) {
      res.status(400).send(`<!doctype html>
<html><body style="font-family:sans-serif;background:#07090E;color:#f1f5f9;padding:24px;">
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'STRAVA_OAUTH_ERROR', error: ${JSON.stringify(errorParam)} }, '*');
    window.close();
  }
</script>
<p>Strava authorization declined (${errorParam}). You may close this browser window and return to VeloRoute.</p>
</body></html>`);
      return;
    }

    const creds = getStravaCredentials();
    if (!creds || !code) {
      res.status(400).send('Missing Strava authorization code or server credentials.');
      return;
    }

    const pending = state ? pendingOauthStates.get(state) : undefined;
    if (state) pendingOauthStates.delete(state);
    const sid = pending?.sid || getOrCreateSessionId(req, res);

    try {
      const tokenRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          code,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Strava token exchange failed: ${errText}`);
      }

      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        refresh_token: string;
        expires_at: number;
        athlete: StravaAthleteInfo;
      };

      const record: StravaSessionRecord = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
        athlete: {
          id: tokenData.athlete.id,
          firstname: tokenData.athlete.firstname,
          lastname: tokenData.athlete.lastname,
          username: tokenData.athlete.username,
          profile: tokenData.athlete.profile,
        },
      };

      sessionStore.set(sid, record);
      res.cookie(SESSION_COOKIE_NAME, sid, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.send(`<!doctype html>
<html>
  <body style="font-family:sans-serif;background:#07090E;color:#f1f5f9;padding:24px;">
    <script>
      if (window.opener) {
        window.opener.postMessage({
          type: 'STRAVA_OAUTH_SUCCESS',
          athlete: ${JSON.stringify(record.athlete)},
          sessionKey: ${JSON.stringify(sid)}
        }, '*');
        window.close();
      }
    </script>
    <h2 style="margin:0 0 8px 0;font-size:18px;">Strava Connected</h2>
    <p style="margin:0;color:#94a3b8;font-size:14px;">Authorization approved for ${record.athlete.firstname} ${record.athlete.lastname}. You can close this window and return to VeloRoute.</p>
  </body>
</html>`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Strava connection failed';
      res.status(500).send(`<!doctype html>
<html><body style="font-family:sans-serif;background:#07090E;color:#f1f5f9;padding:24px;">
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'STRAVA_OAUTH_ERROR', error: ${JSON.stringify(message)} }, '*');
    window.close();
  }
</script>
<p>Strava connection error: ${message}</p>
</body></html>`);
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], handleOAuthCallback);

  // 4. Disconnect Strava
  app.post('/api/strava/disconnect', (req: Request, res: Response) => {
    const { sid } = getSessionFromRequest(req);
    if (sid) {
      sessionStore.delete(sid);
    }
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });
    res.json({ disconnected: true });
  });

  // 5. Upload Completed Ride (.fit or .gpx) to Strava
  app.post('/api/strava/upload', async (req: Request, res: Response) => {
    const { sid, record } = getSessionFromRequest(req);
    if (!sid || !record) {
      res.status(401).json({ error: 'Not connected to Strava. Connect your account first.' });
      return;
    }

    const { format, fileBase64, name, description } = req.body as {
      format?: 'fit' | 'gpx';
      fileBase64?: string;
      name?: string;
      description?: string;
    };

    if (!fileBase64 || (format !== 'fit' && format !== 'gpx')) {
      res.status(400).json({ error: 'Missing ride payload or invalid file format.' });
      return;
    }

    try {
      const fresh = await ensureFreshAccessToken(sid, record);
      const buffer = Buffer.from(fileBase64, 'base64');
      const mimeType =
        format === 'fit' ? 'application/octet-stream' : 'application/gpx+xml';
      const fileBlob = new Blob([buffer], { type: mimeType });

      const form = new FormData();
      form.append('file', fileBlob, `veloroute-ride.${format}`);
      form.append('data_type', format);
      form.append('name', (name || 'VeloRoute Indoor Ride').slice(0, 120));
      if (description) {
        form.append('description', description.slice(0, 500));
      }
      form.append('sport_type', 'VirtualRide');
      form.append('trainer', '1');

      const uploadRes = await fetch('https://www.strava.com/api/v3/uploads', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fresh.accessToken}`,
        },
        body: form,
      });

      const uploadData = (await uploadRes.json()) as {
        id?: number;
        id_str?: string;
        status?: string;
        error?: string | null;
        activity_id?: number | null;
        message?: string;
      };

      if (!uploadRes.ok) {
        res.status(uploadRes.status).json({
          error: uploadData.error || uploadData.message || 'Strava rejected ride upload.',
        });
        return;
      }

      res.json({
        uploadId: uploadData.id_str || String(uploadData.id),
        status: uploadData.status || 'Your activity is being processed.',
        activityId: uploadData.activity_id ?? null,
        error: uploadData.error ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload to Strava failed.';
      res.status(500).json({ error: message });
    }
  });

  // 6. Poll Strava Upload Processing Status
  app.get('/api/strava/upload/:id', async (req: Request, res: Response) => {
    const { sid, record } = getSessionFromRequest(req);
    if (!sid || !record) {
      res.status(401).json({ error: 'Not connected to Strava.' });
      return;
    }

    const uploadId = encodeURIComponent(req.params.id);
    try {
      const fresh = await ensureFreshAccessToken(sid, record);
      const statusRes = await fetch(`https://www.strava.com/api/v3/uploads/${uploadId}`, {
        headers: { Authorization: `Bearer ${fresh.accessToken}` },
      });
      const data = (await statusRes.json()) as {
        id?: number;
        status?: string;
        error?: string | null;
        activity_id?: number | null;
      };
      if (!statusRes.ok) {
        res.status(statusRes.status).json({ error: data.error || 'Failed to check upload status.' });
        return;
      }
      res.json({
        uploadId: String(data.id ?? req.params.id),
        status: data.status ?? '',
        activityId: data.activity_id ?? null,
        error: data.error ?? null,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to check Strava upload status.',
      });
    }
  });

  // --- Intervals.icu Integration ---
  function getIntervalsSessionFromRequest(req: Request): {
    sid: string | null;
    record: IntervalsSessionRecord | null;
  } {
    const headerSid = req.headers['x-intervals-session'];
    if (typeof headerSid === 'string' && intervalsSessionStore.has(headerSid)) {
      return { sid: headerSid, record: intervalsSessionStore.get(headerSid) ?? null };
    }
    const cookies = parseCookies(req.headers.cookie);
    const cookieSid = cookies[INTERVALS_COOKIE_NAME];
    if (cookieSid && intervalsSessionStore.has(cookieSid)) {
      return { sid: cookieSid, record: intervalsSessionStore.get(cookieSid) ?? null };
    }
    return { sid: cookieSid || null, record: null };
  }

  function getOrCreateIntervalsSid(req: Request, res: Response): string {
    const headerSid = req.headers['x-intervals-session'];
    if (typeof headerSid === 'string' && headerSid.length >= 16) {
      return headerSid;
    }
    const cookies = parseCookies(req.headers.cookie);
    const existing = cookies[INTERVALS_COOKIE_NAME];
    if (existing && existing.length >= 16) {
      return existing;
    }
    const newSid = crypto.randomBytes(24).toString('hex');
    res.cookie(INTERVALS_COOKIE_NAME, newSid, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return newSid;
  }

  function resolveIntervalsAuthHeaders(req: Request): {
    headers: Record<string, string>;
    mode: 'oauth' | 'apikey';
    cachedAthlete?: IntervalsAthleteInfo;
  } | null {
    const { record } = getIntervalsSessionFromRequest(req);
    if (record) {
      return {
        headers: { Authorization: `Bearer ${record.accessToken}` },
        mode: 'oauth',
        cachedAthlete: record.athlete,
      };
    }
    const apiKey = getIntervalsApiKey();
    if (apiKey) {
      const encoded = Buffer.from(`API_KEY:${apiKey}`).toString('base64');
      return {
        headers: { Authorization: `Basic ${encoded}` },
        mode: 'apikey',
      };
    }
    return null;
  }

  async function fetchIntervalsAthleteProfile(
    authHeaders: Record<string, string>
  ): Promise<IntervalsAthleteInfo> {
    const res = await fetch('https://intervals.icu/api/v1/athlete/0', {
      headers: authHeaders,
    });
    if (!res.ok) {
      throw new Error(`Intervals.icu athlete lookup failed (${res.status})`);
    }
    const raw = (await res.json()) as {
      id?: string | number;
      name?: string;
      firstname?: string;
      lastname?: string;
      icu_ftp?: number;
      ftp?: number;
      sportSettings?: Array<{ types?: string[]; ftp?: number }>;
    };
    const rideSetting = Array.isArray(raw.sportSettings)
      ? raw.sportSettings.find((s) => Array.isArray(s.types) && s.types.includes('Ride'))
      : undefined;
    const ftp = rideSetting?.ftp ?? raw.icu_ftp ?? raw.ftp;
    const fullName =
      raw.name?.trim() ||
      [raw.firstname, raw.lastname].filter(Boolean).join(' ').trim() ||
      'Intervals Athlete';
    return {
      id: String(raw.id ?? '0'),
      name: fullName,
      ftp: typeof ftp === 'number' && ftp > 0 ? ftp : undefined,
    };
  }

  app.get('/api/intervals/status', async (req: Request, res: Response) => {
    const auth = resolveIntervalsAuthHeaders(req);
    const oauthCreds = getIntervalsOAuthCredentials();
    const apiKey = getIntervalsApiKey();
    const callbackUrl = `${getAppBaseUrl(req)}/auth/intervals/callback`;

    if (!auth) {
      res.json({
        configured: Boolean(oauthCreds || apiKey),
        oauthConfigured: Boolean(oauthCreds),
        authMode: oauthCreds ? 'oauth' : 'none',
        connected: false,
        athlete: null,
        callbackUrl,
      });
      return;
    }

    if (auth.mode === 'oauth' && auth.cachedAthlete) {
      res.json({
        configured: true,
        oauthConfigured: Boolean(oauthCreds),
        authMode: 'oauth',
        connected: true,
        athlete: auth.cachedAthlete,
        callbackUrl,
      });
      return;
    }

    try {
      const athlete = await fetchIntervalsAthleteProfile(auth.headers);
      res.json({
        configured: true,
        oauthConfigured: Boolean(oauthCreds),
        authMode: auth.mode,
        connected: true,
        athlete,
        callbackUrl,
      });
    } catch {
      res.json({
        configured: Boolean(oauthCreds || apiKey),
        oauthConfigured: Boolean(oauthCreds),
        authMode: auth.mode,
        connected: false,
        athlete: null,
        callbackUrl,
      });
    }
  });

  app.get('/api/intervals/auth-url', (req: Request, res: Response) => {
    const creds = getIntervalsOAuthCredentials();
    const callbackUrl = `${getAppBaseUrl(req)}/auth/intervals/callback`;
    if (!creds) {
      res.status(503).json({
        error:
          'Intervals.icu OAuth is not configured. Set INTERVALS_CLIENT_ID and INTERVALS_CLIENT_SECRET (or INTERVALS_API_KEY) in AI Studio Secrets.',
        redirectUri: callbackUrl,
      });
      return;
    }

    const sid = getOrCreateIntervalsSid(req, res);
    const state = crypto.randomBytes(18).toString('hex');
    pendingIntervalsStates.set(state, { sid, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'CALENDAR:READ',
      state,
    });

    res.json({
      url: `https://intervals.icu/oauth/authorize?${params.toString()}`,
      redirectUri: callbackUrl,
      sessionKey: sid,
    });
  });

  const handleIntervalsCallback = async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const errorParam = typeof req.query.error === 'string' ? req.query.error : '';

    if (errorParam) {
      res.status(400).send(`<!doctype html>
<html><body style="font-family:sans-serif;background:#07090E;color:#f1f5f9;padding:24px;">
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'INTERVALS_OAUTH_ERROR', error: ${JSON.stringify(errorParam)} }, '*');
    window.close();
  }
</script>
<p>Intervals.icu authorization declined (${errorParam}). You may close this browser window and return to VeloRoute.</p>
</body></html>`);
      return;
    }

    const creds = getIntervalsOAuthCredentials();
    if (!creds || !code) {
      res.status(400).send('Missing Intervals.icu authorization code or server credentials.');
      return;
    }

    const pending = state ? pendingIntervalsStates.get(state) : undefined;
    if (state) pendingIntervalsStates.delete(state);
    const sid = pending?.sid || getOrCreateIntervalsSid(req, res);
    const redirectUri = `${getAppBaseUrl(req)}/auth/intervals/callback`;

    try {
      const tokenRes = await fetch('https://intervals.icu/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Intervals.icu token exchange failed: ${errText}`);
      }

      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        athlete?: { id?: string | number; name?: string };
      };

      const athlete = await fetchIntervalsAthleteProfile({
        Authorization: `Bearer ${tokenData.access_token}`,
      }).catch(() => ({
        id: String(tokenData.athlete?.id ?? '0'),
        name: tokenData.athlete?.name || 'Intervals Athlete',
      }));

      intervalsSessionStore.set(sid, {
        accessToken: tokenData.access_token,
        athlete,
      });

      res.cookie(INTERVALS_COOKIE_NAME, sid, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.send(`<!doctype html>
<html>
  <body style="font-family:sans-serif;background:#07090E;color:#f1f5f9;padding:24px;">
    <script>
      if (window.opener) {
        window.opener.postMessage({
          type: 'INTERVALS_OAUTH_SUCCESS',
          athlete: ${JSON.stringify(athlete)},
          sessionKey: ${JSON.stringify(sid)}
        }, '*');
        window.close();
      }
    </script>
    <h2 style="margin:0 0 8px 0;font-size:18px;">Intervals.icu Connected</h2>
    <p style="margin:0;color:#94a3b8;font-size:14px;">Authorization approved for ${athlete.name}. You can close this window and return to VeloRoute.</p>
  </body>
</html>`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Intervals.icu connection failed';
      res.status(500).send(`<!doctype html>
<html><body style="font-family:sans-serif;background:#07090E;color:#f1f5f9;padding:24px;">
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'INTERVALS_OAUTH_ERROR', error: ${JSON.stringify(message)} }, '*');
    window.close();
  }
</script>
<p>Intervals.icu connection error: ${message}</p>
</body></html>`);
    }
  };

  app.get(
    ['/auth/intervals/callback', '/auth/intervals/callback/'],
    handleIntervalsCallback
  );

  app.post('/api/intervals/disconnect', (req: Request, res: Response) => {
    const { sid } = getIntervalsSessionFromRequest(req);
    if (sid) {
      intervalsSessionStore.delete(sid);
    }
    res.clearCookie(INTERVALS_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });
    res.json({ disconnected: true });
  });

  app.get('/api/intervals/workouts', async (req: Request, res: Response) => {
    const auth = resolveIntervalsAuthHeaders(req);
    if (!auth) {
      res.status(401).json({
        error: 'Not connected to Intervals.icu. Connect your account first.',
      });
      return;
    }

    try {
      const athlete = await fetchIntervalsAthleteProfile(auth.headers);
      const now = new Date();
      const oldest = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const newest = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const [eventsRes, libraryRes] = await Promise.all([
        fetch(
          `https://intervals.icu/api/v1/athlete/0/events?oldest=${oldest}&newest=${newest}&resolve=true`,
          { headers: auth.headers }
        ),
        fetch('https://intervals.icu/api/v1/athlete/0/workouts', {
          headers: auth.headers,
        }).catch(() => null),
      ]);

      if (!eventsRes.ok) {
        throw new Error(`Intervals.icu calendar fetch failed (${eventsRes.status})`);
      }

      const rawEvents = (await eventsRes.json()) as Array<{
        id: string | number;
        name?: string;
        category?: string;
        type?: string;
        start_date_local?: string;
        description?: string;
        moving_time?: number;
        distance?: number;
        workout_doc?: {
          description?: string;
          duration?: number;
          distance?: number;
          ftp?: number;
          steps?: unknown[];
        };
      }>;

      const calendarWorkouts = rawEvents
        .filter(
          (ev) =>
            ev.workout_doc &&
            Array.isArray(ev.workout_doc.steps) &&
            ev.workout_doc.steps.length > 0
        )
        .map((ev) => ({
          id: ev.id,
          name: ev.name || 'Planned Workout',
          startDateLocal: ev.start_date_local,
          category: ev.category || 'WORKOUT',
          sourceKind: 'calendar' as 'calendar' | 'library',
          description: ev.description || ev.workout_doc?.description,
          durationSec: ev.workout_doc?.duration ?? ev.moving_time ?? 0,
          distanceMeters: ev.workout_doc?.distance ?? ev.distance ?? 0,
          ftp: ev.workout_doc?.ftp ?? athlete.ftp,
          workoutDoc: ev.workout_doc,
        }));

      let libraryWorkouts: typeof calendarWorkouts = [];
      if (libraryRes && libraryRes.ok) {
        const rawLib = (await libraryRes.json()) as Array<{
          id: string | number;
          name?: string;
          description?: string;
          moving_time?: number;
          distance?: number;
          workout_doc?: {
            description?: string;
            duration?: number;
            distance?: number;
            ftp?: number;
            steps?: unknown[];
          };
        }>;
        libraryWorkouts = rawLib
          .filter(
            (w) =>
              w.workout_doc &&
              Array.isArray(w.workout_doc.steps) &&
              w.workout_doc.steps.length > 0
          )
          .slice(0, 30)
          .map((w) => ({
            id: w.id,
            name: w.name || 'Library Workout',
            startDateLocal: undefined,
            category: 'LIBRARY',
            sourceKind: 'library' as const,
            description: w.description || w.workout_doc?.description,
            durationSec: w.workout_doc?.duration ?? w.moving_time ?? 0,
            distanceMeters: w.workout_doc?.distance ?? w.distance ?? 0,
            ftp: w.workout_doc?.ftp ?? athlete.ftp,
            workoutDoc: w.workout_doc,
          }));
      }

      res.json({
        athlete,
        workouts: [...calendarWorkouts, ...libraryWorkouts],
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to fetch workouts from Intervals.icu.',
      });
    }
  });

  // Vite dev middleware vs static production dist
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VeloRoute server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
