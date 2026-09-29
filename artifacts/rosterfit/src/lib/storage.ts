export type Theme = 'light' | 'dark';
export type UnitSystem = 'kg' | 'lb';
export type ActivityKind = 'workout' | 'cardio' | 'rest';
export type RosterKind = 'day' | 'night' | 'off';

export type PlannedExercise = {
  id: string;
  name: string;
  sets: number;
  weight: number;
  reps: number;
};

export type Settings = {
  theme: Theme;
  dayRolloverHour: number;
  units: UnitSystem;
  customRestSeconds: number;
};

export type RosterDay = {
  id: string;
  label: string;
  kind: RosterKind;
  order: number;
  plannedExercises?: PlannedExercise[];
};

export type ExerciseSet = {
  id: string;
  weight: number;
  reps: number;
  durationMinutes?: number;
};

export type ExerciseEntry = {
  id: string;
  name: string;
  weight: number;
  durationMinutes?: number;
  reps: number;
  sets: number;
  setDetails?: ExerciseSet[];
  notes: string;
  date: string;
  volume: number;
};

export type Activity = {
  id: string;
  date: string;
  loggedAt: string;
  kind: ActivityKind;
  notes: string;
  exercises: ExerciseEntry[];
  bodyWeight?: number;
  isNightShift: boolean;
};

export type Achievement = {
  id: string;
  title: string;
  description: string;
  threshold: number;
  progress: number;
  unlockedAt?: string;
};

export type AppState = {
  settings: Settings;
  roster: RosterDay[];
  activities: Activity[];
  achievements: Achievement[];
};

const DB_NAME = 'rosterfit-local';
const STORE_NAME = 'app';
const STATE_KEY = 'state';

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
export const makeId = uid;

export const toDateKey = (date = new Date(), rolloverHour = 4) => {
  const copy = new Date(date);
  if (copy.getHours() < rolloverHour) copy.setDate(copy.getDate() - 1);
  return copy.toISOString().slice(0, 10);
};

export const shiftDate = (dateKey: string, amount: number) => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
};

export const formatDate = (dateKey: string, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', options ?? { month: 'short', day: 'numeric' }).format(new Date(`${dateKey}T12:00:00`));

const sampleRoster: RosterDay[] = [
  { id: 'roster-day-1', label: 'Day 1', kind: 'day', order: 0 },
  { id: 'roster-day-2', label: 'Day 2', kind: 'day', order: 1 },
  { id: 'roster-day-3', label: 'Day 3', kind: 'day', order: 2 },
  { id: 'roster-night-1', label: 'Night 1', kind: 'night', order: 3 },
  { id: 'roster-night-2', label: 'Night 2', kind: 'night', order: 4 },
  { id: 'roster-night-3', label: 'Night 3', kind: 'night', order: 5 },
  { id: 'roster-off-1', label: 'Off 1', kind: 'off', order: 6 },
  { id: 'roster-off-2', label: 'Off 2', kind: 'off', order: 7 },
  { id: 'roster-off-3', label: 'Off 3', kind: 'off', order: 8 },
  { id: 'roster-off-4', label: 'Off 4', kind: 'off', order: 9 },
  { id: 'roster-off-5', label: 'Off 5', kind: 'off', order: 10 },
  { id: 'roster-off-6', label: 'Off 6', kind: 'off', order: 11 },
];

const sampleExercise = (name: string, weight: number, reps: number, sets: number, date: string): ExerciseEntry => ({
  id: uid('exercise'), name, weight, reps, sets, notes: '', date, volume: weight * reps * sets,
});

const sampleState = (): AppState => {
  const rollover = 4;
  const today = toDateKey(new Date(), rollover);
  const dates = Array.from({ length: 10 }, (_, index) => shiftDate(today, -index));
  const activities: Activity[] = [
    { id: uid('activity'), date: today, loggedAt: new Date().toISOString(), kind: 'workout', notes: 'Short and sharp after handover.', isNightShift: false, bodyWeight: 78.4, exercises: [sampleExercise('Front squat', 72.5, 5, 4, today), sampleExercise('Pull-up', 0, 8, 4, today)] },
    { id: uid('activity'), date: dates[1], loggedAt: new Date(Date.now() - 86400000).toISOString(), kind: 'rest', notes: 'Planned recovery day.', isNightShift: true, exercises: [] },
    { id: uid('activity'), date: dates[2], loggedAt: new Date(Date.now() - 172800000).toISOString(), kind: 'cardio', notes: 'Easy spin to clear the head.', isNightShift: true, bodyWeight: 78.7, exercises: [] },
    { id: uid('activity'), date: dates[3], loggedAt: new Date(Date.now() - 259200000).toISOString(), kind: 'workout', notes: 'Upper body reset.', isNightShift: false, exercises: [sampleExercise('Bench press', 65, 6, 4, dates[3]), sampleExercise('One-arm row', 28, 10, 3, dates[3])] },
    { id: uid('activity'), date: dates[4], loggedAt: new Date(Date.now() - 345600000).toISOString(), kind: 'rest', notes: 'Sleep first. Training later.', isNightShift: false, exercises: [] },
    { id: uid('activity'), date: dates[5], loggedAt: new Date(Date.now() - 432000000).toISOString(), kind: 'workout', notes: 'Hips and hamstrings.', isNightShift: true, exercises: [sampleExercise('Romanian deadlift', 82.5, 8, 3, dates[5]), sampleExercise('Split squat', 20, 10, 3, dates[5])] },
    { id: uid('activity'), date: dates[6], loggedAt: new Date(Date.now() - 518400000).toISOString(), kind: 'cardio', notes: 'Twenty minute walk.', isNightShift: true, exercises: [] },
    { id: uid('activity'), date: dates[7], loggedAt: new Date(Date.now() - 604800000).toISOString(), kind: 'workout', notes: 'Back to basics.', isNightShift: false, exercises: [sampleExercise('Deadlift', 110, 3, 3, dates[7])] },
    { id: uid('activity'), date: dates[8], loggedAt: new Date(Date.now() - 691200000).toISOString(), kind: 'rest', notes: 'Rostered rest.', isNightShift: false, exercises: [] },
    { id: uid('activity'), date: dates[9], loggedAt: new Date(Date.now() - 777600000).toISOString(), kind: 'workout', notes: 'Full body primer.', isNightShift: false, exercises: [sampleExercise('Overhead press', 42.5, 5, 4, dates[9])] },
  ];
  return {
    settings: { theme: 'light', dayRolloverHour: rollover, units: 'kg', customRestSeconds: 75 },
    roster: sampleRoster,
    activities,
    achievements: [
      { id: 'first-log', title: 'First shift logged', description: 'Log your first activity.', threshold: 1, progress: activities.length },
      { id: 'steady-7', title: 'Seven on the board', description: 'Keep seven logical days moving.', threshold: 7, progress: 7 },
      { id: 'volume-10k', title: 'Ten thousand club', description: 'Move 10,000 kg of total volume.', threshold: 10000, progress: 9210 },
      { id: 'night-owl', title: 'Night owl', description: 'Train after three night shifts.', threshold: 3, progress: 3, unlockedAt: new Date().toISOString() },
      { id: 'rest-smart', title: 'Rest is training', description: 'Log three planned rest days.', threshold: 3, progress: 2 },
      { id: 'pb-chaser', title: 'PB chaser', description: 'Set a new personal best.', threshold: 1, progress: 1, unlockedAt: new Date().toISOString() },
    ],
  };
};

export const getSampleState = sampleState;

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const loadState = async (): Promise<AppState> => {
  if (!('indexedDB' in window)) return getSampleState();
  try {
    const db = await openDb();
    const value = await new Promise<AppState | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result as AppState | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return value ?? getSampleState();
  } catch {
    return getSampleState();
  }
};

export const saveState = async (state: AppState) => {
  if (!('indexedDB' in window)) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(state, STATE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
};

export const activityVolume = (activity: Activity) => activity.exercises.reduce((total, item) => total + item.volume, 0);
export const totalVolume = (activities: Activity[]) => activities.reduce((total, activity) => total + activityVolume(activity), 0);
export const dayLabel = (kind: RosterKind) => kind === 'night' ? 'Night shift' : kind === 'day' ? 'Day shift' : 'Rest day';