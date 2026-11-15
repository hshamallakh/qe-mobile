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
 *  - ErpApi: talks to ERPNext 16 + the qe_mobile server app
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

const M = 'qe_mobile.qe_mobile.api'; // server app python module

export class ErpApi implements Api {
  readonly isDemo = false;
  constructor(private baseUrl: string, private token: string | null) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async call<T>(method: string, args?: Record<string, unknown>, httpMethod: 'GET' | 'POST' = 'POST'): Promise<T> {
    let url = `${this.baseUrl}/api/method/${method}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.token) headers['X-QE-Device-Token'] = this.token;
    const init: RequestInit = { method: httpMethod, headers };
    if (httpMethod === 'GET' && args) {
      const qs = Object.entries(args)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : String(v))}`)
        .join('&');
      if (qs) url += `?${qs}`;
    } else if (args) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(args);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (e) {
      throw new ApiError('Cannot reach the server. Check your connection.', 0, 'NETWORK');
    } finally {
      clearTimeout(timer);
    }
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      throw new ApiError(frappeErrorMessage(body) || `Server error (${res.status})`, res.status, body?.exc_type);
    }
    return body?.message as T;
  }

  login(usr: string, pwd: string, device: DeviceInfo) {
    return this.call<{ token: string }>(`${M}.auth.login`, { usr, pwd, ...device }).then((r) => r.token);
  }
  async logout() {
    try {
      await this.call(`${M}.auth.logout`);
    } catch {
      /* token may already be revoked */
    }
  }
  bootstrap() {
    return this.call<Bootstrap>(`${M}.core.bootstrap`, undefined, 'GET');
  }
  clockState() {
    return this.call<ClockState>(`${M}.attendance.state`, undefined, 'GET');
  }
  clock(req: ClockRequest) {
    return this.call<ClockEvent>(`${M}.attendance.clock`, { payload: req });
  }
  myEvents(days: number) {
    return this.call<ClockEvent[]>(`${M}.attendance.my_events`, { days }, 'GET');
  }
  leaveTypes() {
    return this.call<LeaveType[]>(`${M}.timeoff.leave_types`, undefined, 'GET');
  }
  myLeaves() {
    return this.call<LeaveApplication[]>(`${M}.timeoff.my_leaves`, undefined, 'GET');
  }
  applyLeave(l: NewLeave) {
    return this.call<LeaveApplication>(`${M}.timeoff.apply`, { payload: l });
  }
  directory(search: string) {
    return this.call<DirectoryEntry[]>(`${M}.directory.search`, { q: search }, 'GET');
  }
  resolveScan(code: string, format: string) {
    return this.call<ScanResult>(`${M}.scan.resolve`, { code, format });
  }
  clockPoints() {
    return this.call<ClockPoint[]>(`${M}.attendance.clock_points`, undefined, 'GET');
  }
  createClockPoint(title: string, building: string) {
    return this.call<ClockPoint>(`${M}.attendance.create_clock_point`, { title, building });
  }
  verifyTag(url: string, uid?: string) {
    return this.call<{ ok: boolean; clockPoint?: string; message: string }>(`${M}.attendance.verify_tag`, { url, uid });
  }
}

function frappeErrorMessage(body: any): string | null {
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
