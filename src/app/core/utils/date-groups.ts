export type DateGroup = 'today' | 'yesterday' | 'week' | 'older';

export function dateGroupOf(timestamp: number, now = Date.now()): DateGroup {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const startToday = today.getTime();
  const day = 86_400_000;
  if (timestamp >= startToday) return 'today';
  if (timestamp >= startToday - day) return 'yesterday';
  if (timestamp >= startToday - 7 * day) return 'week';
  return 'older';
}

export const DATE_GROUP_ORDER: readonly DateGroup[] = ['today', 'yesterday', 'week', 'older'];
