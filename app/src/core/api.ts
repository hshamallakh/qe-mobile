import type {
  Bootstrap,
  ClockEvent,
  ClockPoint,
  ClockRequest,
  ClockState,
  DirectoryEntry,
  LeaveApplication,
  LeaveType,
  NewLeave,
  ScanResult,
} from './types';
import { DemoApi } from './demo';
import { ApiError } from './errors';

/**
 * Everything the app needs from the backend. Two implementations:
 *  - ErpApi: talks to the QE ERP over the documented REST contract
 *  - DemoApi: an offline sandbox (also used by Apple / Google reviewers)
 * New ERP modules add methods here (or their own small client) — screens never call fetch directly.
 */
export interface Api {
  readonly isDemo: boolean;
  login(usr: string, pwd: string, device: DeviceInfo): Promise<string>; // returns device token
  logout(): Promise<void>;
  bootstrap(): Promise<Bootstrap>;

  clockState(): Promise<ClockState>;
  clock(req: ClockRequest): Promise<ClockEvent>;
  myEvents(days: number): Promise<ClockEvent[]>;

  leaveTypes(): Promise<LeaveType[]>;
  myLeaves(): Promise<LeaveApplication[]>;
  applyLeave(l: NewLeave): Promise<LeaveApplication>;

  directory(search: string): Promise<DirectoryEntry[]>;
  resolveScan(code: string, format: string): Promise<ScanResult>;

  clockPoints(): Promise<ClockPoint[]>;
  createClockPoint(title: string, building: string): Promise<ClockPoint>;
  verifyTag(url: string, uid?: string): Promise<{ ok: boolean; clockPoint?: string; message: string }>;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
}

export { ApiError };

/**
 * REST contract with the QE ERP backend (see docs/MOBILE-API.md in the repo).
 * Base: {server}/api/mobile/v1  ·  Auth: "Authorization: Bearer <device token>"
 * Success: 2xx with JSON body (the payload itself). Error: non-2xx with {"error": {"code", "message"}}.
 */
export class ErpApi implements Api {
  readonly isDemo = false;
  constructor(private baseUrl: string, private token: string | null) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async call<T>(path: string, init: { method?: 'GET' | 'POST' | 'DELETE'; query?: Record<string, unknown>; body?: unknown } = {}): Promise<T> {
    let url = `${this.baseUrl}/api/mobile/v1${path}`;
    if (init.query) {
      const qs = Object.entries(init.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (qs) url += `?${qs}`;
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const req: RequestInit = { method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'), headers };
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      req.body = JSON.stringify(init.body);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let res: Response;
    try {
      res = await fetch(url, { ...req, signal: controller.signal });
    } catch {
      throw new ApiError('Cannot reach the server. Check your connection.', 0, 'NETWORK');
    } finally {
      clearTimeout(timer);
    }
    let body: any = null;
    try {
      body = res.status === 204 ? null : await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      throw new ApiError(errorMessage(body) || `Server error (${res.status})`, res.status, body?.error?.code);
    }
    return body as T;
  }

  login(usr: string, pwd: string, device: DeviceInfo) {
    return this.call<{ token: string }>('/auth/login', { body: { username: usr, password: pwd, device } }).then((r) => r.token);
  }
  async logout() {
    try {
      await this.call('/auth/logout', { method: 'POST', body: {} });
    } catch {
      /* token may already be revoked */
    }
  }
  bootstrap() {
    return this.call<Bootstrap>('/me/bootstrap');
  }
  clockState() {
    return this.call<ClockState>('/attendance/state');
  }
  clock(req: ClockRequest) {
    return this.call<ClockEvent>('/attendance/clock', { body: req });
  }
  myEvents(days: number) {
    return this.call<ClockEvent[]>('/attendance/events', { query: { days } });
  }
  leaveTypes() {
    return this.call<LeaveType[]>('/timeoff/types');
  }
  myLeaves() {
    return this.call<LeaveApplication[]>('/timeoff/requests');
  }
  applyLeave(l: NewLeave) {
    return this.call<LeaveApplication>('/timeoff/requests', { body: l });
  }
  directory(search: string) {
    return this.call<DirectoryEntry[]>('/directory', { query: { q: search } });
  }
  resolveScan(code: string, format: string) {
    return this.call<ScanResult>('/scan/resolve', { body: { code, format } });
  }
  clockPoints() {
    return this.call<ClockPoint[]>('/admin/clock-points');
  }
  createClockPoint(title: string, building: string) {
    return this.call<ClockPoint>('/admin/clock-points', { body: { title, building } });
  }
  verifyTag(url: string, uid?: string) {
    return this.call<{ ok: boolean; clockPoint?: string; message: string }>('/admin/clock-points/verify', { body: { url, uid } });
  }
}

function errorMessage(body: any): string | null {
  if (body?.error?.message) return strip(String(body.error.message));
  if (!body) return null;
  if (body._server_messages) {
    try {
      const msgs = JSON.parse(body._server_messages).map((m: string) => {
        try {
          return JSON.parse(m).message;
        } catch {
          return m;
        }
      });
      return strip(msgs.join('\n'));
    } catch {
      /* fallthrough */
    }
  }
  if (body.message && typeof body.message === 'string') return strip(body.message);
  if (body.exception) return strip(String(body.exception).split(':').slice(1).join(':') || body.exception);
  return null;
}

const strip = (s: string) => s.replace(/<[^>]+>/g, '').trim();

export function makeApi(mode: 'demo' | 'erp', baseUrl: string, token: string | null): Api {
  return mode === 'demo' ? new DemoApi() : new ErpApi(baseUrl, token);
}
