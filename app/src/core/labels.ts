import type { ClockAction } from './types';
export function labelFor(a: ClockAction) {
  return { IN: 'Clocked in', OUT: 'Clocked out', BREAK_START: 'Break started', BREAK_END: 'Break ended' }[a];
}
