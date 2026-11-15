import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { Bootstrap } from './types';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Module registry — the app is a shell; each ERP area is a module.
 *
 * To add a module (e.g. Fleet, Purchase Orders, Visitor Log):
 *   1. add its screens under src/app/<id>/
 *   2. add an entry below
 *   3. enable it for the right roles in ERPNext ("QE Mobile Module" doctype)
 * Modules that only make sense on the web (e.g. Accounting setup) are simply not registered here.
 */
export interface ModuleDef {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  color: string;
  route: string; // expo-router path
  section: 'Operations' | 'HR' | 'Communication' | 'Admin';
  needs?: ('nfc' | 'camera' | 'location')[]; // device capabilities, for the "requires" hint
}

export const MODULES: ModuleDef[] = [
  { id: 'attendance', title: 'Time Clock', subtitle: 'Clock in & out, breaks, timesheet', icon: 'time-outline', color: '#2563EB', route: '/attendance', section: 'Operations', needs: ['nfc', 'location'] },
  { id: 'timeoff', title: 'Time Off', subtitle: 'Balances & leave requests', icon: 'sunny-outline', color: '#16A34A', route: '/timeoff', section: 'HR' },
  { id: 'directory', title: 'Directory', subtitle: 'Find and contact colleagues', icon: 'people-outline', color: '#9333EA', route: '/directory', section: 'Communication' },
  { id: 'scanner', title: 'Scan', subtitle: 'Look up assets & documents by barcode', icon: 'scan-outline', color: '#EA580C', route: '/scanner', section: 'Operations', needs: ['camera'] },
  // Planned (screens not built yet) – kept here so the server can already grant them:
  // { id: 'schedule', ... }, { id: 'forms', ... }, { id: 'tasks', ... }, { id: 'updates', ... },
  // { id: 'documents', ... }, { id: 'purchase_orders', ... }, { id: 'work_orders', ... }, { id: 'fleet', ... }
];

export function enabledModules(boot: Bootstrap | null): ModuleDef[] {
  if (!boot) return [];
  const on = new Set(boot.modules.filter((m) => m.enabled).map((m) => m.id));
  return MODULES.filter((m) => on.has(m.id));
}

export function isModuleAdmin(boot: Bootstrap | null, id: string) {
  return !!boot?.modules.find((m) => m.id === id)?.admin;
}
