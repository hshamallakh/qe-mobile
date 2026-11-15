// Shared data shapes between the app and the ERPNext "qe_mobile" server app.
// The server app returns exactly these shapes (see server/qe_mobile/api.py).

export type ClockMethod = 'nfc' | 'location' | 'wifi' | 'manual';
export type ClockAction = 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END';

export interface SessionUser {
  user: string; // Frappe user id (email)
  fullName: string;
  employee?: string; // Employee ID, e.g. HR-EMP-00001
  designation?: string;
  department?: string;
  roles: string[];
  imageUrl?: string;
}

/** What the admin allows this employee to do (Connecteam: "Clock-in devices" + Geofence + Limitations). */
export interface AttendancePolicy {
  allowedMethods: ClockMethod[]; // e.g. ['nfc'] or ['nfc','location','wifi']
  breaksEnabled: boolean;
  requireLocationForNfc: boolean; // also capture GPS when tapping a tag
  maxGpsAccuracyMeters: number; // reject fixes worse than this
  sites: GeoSite[]; // geofences shown to the user for guidance; server re-checks
  wifi: WifiNetwork[]; // approved networks; server re-checks
  notes?: string;
}

export interface GeoSite {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface WifiNetwork {
  ssid: string;
  bssids?: string[]; // access-point MACs; stronger than SSID alone
}

export interface ModuleGrant {
  id: string; // module id from the app's registry
  enabled: boolean;
  admin?: boolean; // user can see admin screens of this module
}

export interface Bootstrap {
  user: SessionUser;
  modules: ModuleGrant[];
  attendance: AttendancePolicy;
  company: { name: string; timezone: string; privacyPolicyUrl?: string };
  serverTime: string;
}

export interface ClockState {
  status: 'out' | 'in' | 'break';
  since?: string; // ISO time of the last event
  todaySeconds: number; // worked today
  lastEvent?: ClockEvent;
}

export interface ClockEvent {
  name: string;
  action: ClockAction;
  time: string;
  method: ClockMethod;
  site?: string; // clock point / geofence / wifi that matched
  flags?: string[]; // e.g. ['offline', 'new_device']
}

export interface ClockRequest {
  action: ClockAction;
  method: ClockMethod;
  clientTime: string;
  deviceId: string;
  platform: string;
  appVersion: string;
  nfc?: { url?: string; uid?: string; tagType?: string };
  location?: { latitude: number; longitude: number; accuracy: number | null; mocked?: boolean };
  wifi?: { ssid: string | null; bssid: string | null };
  offline?: boolean;
}

export interface LeaveType {
  name: string;
  balance?: number; // remaining days, if allocated
  unlimited?: boolean;
}

export interface LeaveApplication {
  name: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  totalDays: number;
  status: 'Open' | 'Approved' | 'Rejected' | 'Cancelled';
  reason?: string;
}

export interface NewLeave {
  leaveType: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string;
  halfDay: boolean;
  reason: string;
}

export interface DirectoryEntry {
  employee: string;
  name: string;
  designation?: string;
  department?: string;
  branch?: string;
  phone?: string;
  email?: string;
  imageUrl?: string;
}

export interface ScanResult {
  found: boolean;
  doctype?: string;
  docname?: string;
  title?: string;
  fields?: { label: string; value: string }[];
  message?: string;
}

export interface ClockPoint {
  name: string;
  title: string;
  building?: string;
  tagType: 'Static' | 'NTAG 424 DNA SUN';
  tagUrl?: string; // URL to write on a Static tag (contains secret)
  allowedActions: ClockAction[];
}
