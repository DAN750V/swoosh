import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'swoosh_streak_v1';

export type StreakData = {
  count: number;
  lastDate: string | null;   // 'YYYY-MM-DD' local time
  weekStart: string | null;  // 'YYYY-MM-DD' of Monday of the stored week
  weekDays: boolean[];       // Mon=0 … Sun=6
};

const blank = (): StreakData => ({
  count: 0,
  lastDate: null,
  weekStart: null,
  weekDays: Array(7).fill(false) as boolean[],
});

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Local-time date string to avoid UTC midnight edge cases
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Monday of the ISO week containing dateStr
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const dow = d.getDay(); // 0=Sun … 6=Sat
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Mon=0 … Sun=6 index into weekDays
function weekIndex(dateStr: string): number {
  const dow = new Date(`${dateStr}T12:00:00`).getDay();
  return dow === 0 ? 6 : dow - 1;
}

function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) /
      86_400_000,
  );
}

async function read(): Promise<StreakData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StreakData) : blank();
  } catch {
    return blank();
  }
}

async function persist(data: StreakData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage failure is non-fatal — streak may reset on next launch
  }
}

/**
 * Record a completed session for today. Safe to call multiple times per day;
 * only the first call each day updates the stored data.
 */
export async function recordSession(): Promise<StreakData> {
  const today = todayStr();
  const data = await read();

  if (data.lastDate === today) return data; // already counted today

  const diff = data.lastDate ? diffDays(data.lastDate, today) : null;
  data.count = diff === 1 ? data.count + 1 : 1; // consecutive or restart
  data.lastDate = today;

  const monday = mondayOf(today);
  if (data.weekStart !== monday) {
    data.weekDays = Array(7).fill(false) as boolean[];
    data.weekStart = monday;
  }
  data.weekDays[weekIndex(today)] = true;

  await persist(data);
  return data;
}

/**
 * Load streak for display only. Returns count=0 when the stored streak is
 * stale (last session was 2+ days ago), and empty weekDays if we are in a
 * new week with no sessions recorded yet.
 */
export async function loadStreak(): Promise<StreakData> {
  const data = await read();
  const today = todayStr();

  const count =
    data.lastDate && diffDays(data.lastDate, today) > 1 ? 0 : data.count;

  const currentMonday = mondayOf(today);
  const weekDays =
    data.weekStart === currentMonday
      ? data.weekDays
      : (Array(7).fill(false) as boolean[]);

  return { ...data, count, weekDays };
}
