import type { Api, DeviceInfo } from './api';
import { ApiError } from './errors';
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

// In-memory sandbox. Lets anyone (including App Store / Play reviewers) try every screen
// without an embassy account. Nothing leaves the phone.

let events: ClockEvent[] = [];
let leaves: LeaveApplication[] = [
  {
    name: 'HR-LAP-DEMO-0001',
    leaveType: 'Annual Leave',
    fromDate: '2026-12-22',
    toDate: '2026-12-24',
    halfDay: false,
    totalDays: 3,
    status: 'Approved',
    reason: 'Family visit',
  },
];
let points: ClockPoint[] = [
  { name: 'CP-0001', title: 'Main entrance', building: 'Demo Building', tagType: 'Static', allowedActions: ['IN', 'OUT'] },
];
let seq = 1;
const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

export class DemoApi implements Api {
  readonly isDemo = true;

  async login(usr: string, _pwd: string, _d: DeviceInfo) {
    await wait();
    if (!usr) throw new ApiError('Enter any name to try the demo');
    return 'demo-token';
  }
  async logout() {
    events = [];
  }

  async bootstrap(): Promise<Bootstrap> {
    await wait();
    return {
      user: {
        user: 'demo@example.com',
        fullName: 'Demo Employee',
        employee: 'HR-EMP-DEMO',
        designation: 'Administrative Officer',
        department: 'Administration',
        roles: ['Employee', 'QE Mobile Admin'],
      },
      modules: [
        { id: 'attendance', enabled: true, admin: true },
        { id: 'timeoff', enabled: true },
        { id: 'directory', enabled: true },
        { id: 'scanner', enabled: true },
      ],
      attendance: {
        allowedMethods: ['nfc', 'location', 'wifi'],
        breaksEnabled: true,
        requireLocationForNfc: false,
        maxGpsAccuracyMeters: 100,
        sites: [{ name: 'Demo site (anywhere)', latitude: 0, longitude: 0, radiusMeters: 40_000_000 }],
        wifi: [{ ssid: '*' }],
        notes: 'Demo mode: every clock-in method is accepted and nothing is sent to a server.',
      },
      company: { name: 'Demo Embassy', timezone: 'Europe/London' },
      serverTime: new Date().toISOString(),
    };
  }

  async clockState(): Promise<ClockState> {
    await wait(150);
    const last = events[0];
    const status = !last ? 'out' : last.action === 'IN' || last.action === 'BREAK_END' ? 'in' : last.action === 'BREAK_START' ? 'break' : 'out';
    return { status, since: last?.time, todaySeconds: workedToday(events), lastEvent: last };
  }

  async clock(req: ClockRequest): Promise<ClockEvent> {
    await wait();
    const state = await this.clockState();
    if (req.action === 'IN' && state.status !== 'out') throw new ApiError('You are already clocked in.');
    if (req.action === 'OUT' && state.status === 'out') throw new ApiError('You are not clocked in.');
    if (req.action === 'BREAK_START' && state.status !== 'in') throw new ApiError('Clock in before starting a break.');
    if (req.action === 'BREAK_END' && state.status !== 'break') throw new ApiError('You are not on a break.');
    const site =
      req.method === 'nfc' ? 'NFC tag (demo)' : req.method === 'wifi' ? `Wi-Fi ${req.wifi?.ssid ?? ''}`.trim() : 'Demo site (anywhere)';
    const ev: ClockEvent = {
      name: `DEMO-${seq++}`,
      action: req.action,
      time: new Date().toISOString(),
      method: req.method,
      site,
      flags: req.location?.mocked ? ['mock_location'] : [],
    };
    events.unshift(ev);
    return ev;
  }

  async myEvents(): Promise<ClockEvent[]> {
    await wait(150);
    return events.slice(0, 100);
  }

  async leaveTypes(): Promise<LeaveType[]> {
    return [
      { name: 'Annual Leave', balance: 18.5 },
      { name: 'Sick Leave', balance: 10 },
      { name: 'Leave Without Pay', unlimited: true },
    ];
  }
  async myLeaves() {
    await wait(150);
    return leaves;
  }
  async applyLeave(l: NewLeave): Promise<LeaveApplication> {
    await wait();
    if (l.toDate < l.fromDate) throw new ApiError('"To" date is before "From" date.');
    const days = l.halfDay ? 0.5 : daysBetween(l.fromDate, l.toDate);
    const app: LeaveApplication = { name: `HR-LAP-DEMO-${String(leaves.length + 1).padStart(4, '0')}`, ...l, totalDays: days, status: 'Open' };
    leaves = [app, ...leaves];
    return app;
  }

  async directory(search: string): Promise<DirectoryEntry[]> {
    await wait(150);
    const all: DirectoryEntry[] = [
      { employee: 'HR-EMP-0001', name: 'Amira Hassan', designation: 'HR Officer', department: 'Human Resources', phone: '+44 20 0000 0001', email: 'amira@example.com' },
      { employee: 'HR-EMP-0002', name: 'Omar Khalid', designation: 'Developer', department: 'IT', phone: '+44 20 0000 0002', email: 'omar@example.com' },
      { employee: 'HR-EMP-0003', name: 'Sara Ahmed', designation: 'Accountant', department: 'Finance', email: 'sara@example.com' },
      { employee: 'HR-EMP-0004', name: 'Yusuf Ali', designation: 'Driver', department: 'Fleet', phone: '+44 7700 900004' },
    ];
    const q = search.trim().toLowerCase();
    return q ? all.filter((e) => `${e.name} ${e.designation} ${e.department}`.toLowerCase().includes(q)) : all;
  }

  async resolveScan(code: string, format: string): Promise<ScanResult> {
    await wait();
    return {
      found: true,
      doctype: 'Asset',
      docname: code.slice(0, 40),
      title: 'Demo asset',
      fields: [
        { label: 'Code', value: code },
        { label: 'Barcode type', value: format },
        { label: 'Location', value: 'Demo Building – Room 2.14' },
        { label: 'Custodian', value: 'Demo Employee' },
      ],
    };
  }

  async clockPoints() {
    return points;
  }
  async createClockPoint(title: string, building: string): Promise<ClockPoint> {
    await wait();
    const cp: ClockPoint = {
      name: `CP-${String(points.length + 1).padStart(4, '0')}`,
      title,
      building,
      tagType: 'Static',
      tagUrl: `https://erp.example.com/qe/t/CP-${String(points.length + 1).padStart(4, '0')}?k=demo${Date.now().toString(36)}`,
      allowedActions: ['IN', 'OUT'],
    };
    points = [...points, cp];
    return cp;
  }
  async verifyTag(url: string) {
    await wait();
    return { ok: true, clockPoint: 'Demo', message: `Demo mode accepts any tag. Read: ${url || '(no URL on tag)'}` };
  }
}

function workedToday(list: ClockEvent[]): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = [...list].reverse().filter((e) => new Date(e.time) >= start);
  let total = 0;
  let openedAt: number | null = null;
  for (const e of today) {
    const t = new Date(e.time).getTime();
    if ((e.action === 'IN' || e.action === 'BREAK_END') && openedAt === null) openedAt = t;
    if ((e.action === 'OUT' || e.action === 'BREAK_START') && openedAt !== null) {
      total += t - openedAt;
      openedAt = null;
    }
  }
  if (openedAt !== null) total += Date.now() - openedAt;
  return Math.round(total / 1000);
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
}
