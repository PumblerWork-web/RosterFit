import { useEffect, useRef, useState, createContext, useContext, type ReactNode, type FormEvent, type ChangeEvent } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  Activity as ActivityIcon, ArrowRight, BarChart3, Bike, CalendarDays, Check, CircleHelp, Clock3, Droplets, Dumbbell, Download, Flame, Gauge, HeartPulse, History, Mic,
  Home, Moon, MoreHorizontal, Pencil, Plus, RotateCcw, Settings as SettingsIcon, ShieldCheck, Sparkles, Star,
  Sun, Target, TimerReset, Trash2, Trophy, Upload, Weight, X, Zap,
} from 'lucide-react';
import { activityVolume, dayLabel, formatDate, getCleanState, loadState, makeId, saveState, shiftDate, toDateKey, totalVolume, type Activity, type ActivityKind, type AppState, type ExerciseEntry, type ExerciseSet, type PlannedExercise, type RosterDay, type RosterKind, type Theme, type UnitSystem } from '@/lib/storage';

type AppContextValue = { state: AppState; update: (next: Partial<AppState>) => void; reset: () => void };
const AppData = createContext<AppContextValue | null>(null);
const useApp = () => {
  const context = useContext(AppData);
  if (!context) throw new Error('RosterFit data is not available');
  return context;
};

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');
const todayKey = (state: AppState) => toDateKey(new Date(), state.settings.dayRolloverHour);
const kindColor: Record<ActivityKind, string> = { workout: 'hsl(var(--secondary))', cardio: 'hsl(var(--accent))', rest: 'hsl(var(--muted-foreground))' };
const kindName: Record<ActivityKind, string> = { workout: 'Strength', cardio: 'Cardio', rest: 'Planned rest' };
const iconForKind = (kind: ActivityKind) => kind === 'workout' ? Dumbbell : kind === 'cardio' ? Bike : Moon;
const findPreviousExercise = (activities: Activity[], name: string, excludeActivityId: string | null) => {
  const normalizedName = name.trim().toLowerCase();
  if (!normalizedName) return undefined;
  return activities
    .filter((activity) => activity.id !== excludeActivityId)
    .flatMap((activity) => activity.exercises.map((exercise) => ({ activity, exercise })))
    .filter(({ exercise }) => exercise.name.trim().toLowerCase() === normalizedName)
    .sort((a, b) => b.activity.loggedAt.localeCompare(a.activity.loggedAt))[0];
};
const getExerciseSets = (exercise: ExerciseEntry): ExerciseSet[] => exercise.setDetails?.length
  ? exercise.setDetails
  : Array.from({ length: Math.max(1, exercise.sets) }, (_, index) => ({
    id: `legacy-${exercise.id}-${index}`,
    weight: exercise.weight,
    reps: exercise.reps,
    durationMinutes: exercise.durationMinutes,
  }));
const getSetVolume = (set: ExerciseSet) => set.weight * set.reps;
const getExerciseVolume = (sets: ExerciseSet[]) => sets.reduce((total, set) => total + getSetVolume(set), 0);
const rosterIndexForDate = (state: Pick<AppState, 'roster' | 'rosterAnchorDate' | 'rosterAnchorDayId'>, date: string) => {
  if (!state.roster.length) return 0;
  const anchorIndex = state.rosterAnchorDayId ? state.roster.findIndex((day) => day.id === state.rosterAnchorDayId) : -1;
  const hasAnchor = anchorIndex >= 0 && Boolean(state.rosterAnchorDate);
  const dayOffset = hasAnchor ? daysSinceEpoch(date) - daysSinceEpoch(state.rosterAnchorDate!) : daysSinceEpoch(date);
  const startIndex = hasAnchor ? anchorIndex : 0;
  return ((startIndex + dayOffset) % state.roster.length + state.roster.length) % state.roster.length;
};
const plannedExercisesForDate = (state: Pick<AppState, 'roster' | 'rosterAnchorDate' | 'rosterAnchorDayId'>, date: string) => state.roster[rosterIndexForDate(state, date)]?.plannedExercises ?? [];
const exerciseFromPlan = (planned: PlannedExercise, date: string): ExerciseEntry => ({
  id: makeId('exercise'),
  name: planned.name,
  weight: planned.weight,
  reps: planned.reps,
  sets: planned.sets,
  setDetails: Array.from({ length: Math.max(1, planned.sets) }, () => ({ id: makeId('set'), weight: planned.weight, reps: planned.reps })),
  notes: '',
  date,
  volume: planned.weight * planned.reps * planned.sets,
});
type SpeechRecognitionResultLike = { [index: number]: { transcript: string } };
type SpeechRecognitionEventLike = { results: { [index: number]: SpeechRecognitionResultLike } };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
const getSpeechRecognition = () => {
  const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
};
type VolumeRange = 'today' | 'week' | 'month' | 'all';
const volumeRangeOptions: Array<{ value: VolumeRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];
const volumeForRange = (activities: Activity[], today: string, range: VolumeRange) => {
  if (range === 'all') return totalVolume(activities);
  const start = range === 'today' ? today : range === 'month'
    ? `${today.slice(0, 8)}01`
    : shiftDate(today, -(new Date(`${today}T12:00:00`).getDay() === 0 ? 6 : new Date(`${today}T12:00:00`).getDay() - 1));
  return totalVolume(activities.filter((activity) => activity.date >= start && activity.date <= today));
};
const parseSpokenSet = (transcript: string) => {
  const text = transcript.toLowerCase().replace(/,/g, '.');
  const numbers = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos|lb|lbs|pound|pounds)/);
  const repsMatch = text.match(/(\d+)\s*(?:reps?|repetitions?)/);
  const weight = weightMatch ? Number(weightMatch[1]) : numbers[0];
  const reps = repsMatch ? Number(repsMatch[1]) : numbers[1];
  return { weight, reps };
};
type CardioTimerState = { status: 'idle' | 'running' | 'paused' | 'ended'; elapsedSeconds: number };
const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { loadState().then((value) => { setState(value); setLoaded(true); }); }, []);
  useEffect(() => {
    if (state) {
      document.documentElement.classList.toggle('dark', state.settings.theme === 'dark');
      if (loaded) void saveState(state);
    }
  }, [state, loaded]);
  if (!state) return <LoadingScreen />;
  const update = (next: Partial<AppState>) => setState((current) => current ? { ...current, ...next } : current);
  const reset = () => { setState(getCleanState()); };
  return (
    <AppData.Provider value={{ state, update, reset }}>
      <Shell />
    </AppData.Provider>
  );
}

function LoadingScreen() {
  return <div className="min-h-[100dvh] bg-background p-6"><div className="mx-auto max-w-5xl space-y-5 pt-10">
    <div className="skeleton h-10 w-36 rounded-xl" /><div className="skeleton h-28 rounded-3xl" />
    <div className="grid gap-4 md:grid-cols-3"><div className="skeleton h-32 rounded-3xl" /><div className="skeleton h-32 rounded-3xl" /><div className="skeleton h-32 rounded-3xl" /></div>
    <div className="skeleton h-64 rounded-3xl" />
  </div></div>;
}

const navItems = [
  { href: '/', label: 'Today', icon: Home },
  { href: '/log', label: 'Log', icon: Plus },
  { href: '/roster', label: 'Roster', icon: CalendarDays },
  { href: '/insights', label: 'Insights', icon: BarChart3 },
  { href: '/achievements', label: 'Wins', icon: Trophy },
];

function Shell() {
  const [location] = useLocation();
  const { state } = useApp();
  const active = (href: string) => href === '/' ? location === '/' : location.startsWith(href);
  return <div className="app-shell flex min-h-[100dvh] md:pl-[238px]">
    <aside className="sidebar fixed inset-y-0 left-0 z-30 hidden w-[238px] flex-col px-4 py-5 md:flex">
      <Link href="/" className="mb-9 flex items-center gap-3 px-3" data-testid="link-brand">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--accent))] text-[hsl(var(--primary))]"><ActivityIcon size={20} strokeWidth={2.8} /></span>
        <span><strong className="font-display text-lg tracking-tight">RosterFit</strong><span className="block text-[10px] uppercase tracking-[.2em] opacity-55">Shift by shift</span></span>
      </Link>
      <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.2em] opacity-40">Your pocket coach</p>
      <nav className="space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-active={active(href)} data-testid={`link-nav-${label.toLowerCase()}`} className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-all hover:translate-x-0.5">
          <Icon size={18} strokeWidth={2.2} /><span>{label}</span>
        </Link>)}
      </nav>
      <div className="mt-auto space-y-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-relaxed opacity-80">
          <div className="mb-2 flex items-center gap-2 text-[hsl(var(--accent))]"><Moon size={14} /><span className="font-bold">Today&apos;s shift</span></div>
          Day rolls over at <strong>{state.settings.dayRolloverHour}:00</strong>. Fresh start, same plan.
        </div>
        <Link href="/settings" data-testid="link-nav-settings" className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold hover:bg-white/10"><SettingsIcon size={18} />Settings</Link>
      </div>
    </aside>
    <main className="content-wrap min-w-0 flex-1">
      <Topbar />
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/log" component={LogPage} />
        <Route path="/roster" component={RosterPage} />
        <Route path="/insights" component={InsightsPage} />
        <Route path="/achievements" component={AchievementsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </main>
    <nav className="mobile-nav safe-bottom fixed inset-x-0 bottom-0 z-40 items-center justify-around border-t border-border bg-card/95 px-2 pt-2 backdrop-blur-xl">
      {navItems.slice(0, 5).map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-mobile-${label.toLowerCase()}`} data-active={active(href)} className={cx('flex min-w-[58px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold', active(href) ? 'text-[hsl(var(--secondary))]' : 'text-muted-foreground')}>
        <Icon size={20} strokeWidth={active(href) ? 2.7 : 2} /><span>{label}</span>
      </Link>)}
    </nav>
  </div>;
}

function Topbar() {
  const { state, update } = useApp();
  const [location] = useLocation();
  const title = location === '/' ? 'Today is yours.' : location.replace('/', '').replace('-', ' ');
  const toggleTheme = () => {
    const theme: Theme = state.settings.theme === 'light' ? 'dark' : 'light';
    update({ settings: { ...state.settings, theme } });
  };
  return <header className="flex items-center justify-between gap-4 px-5 pb-3 pt-5 sm:px-8 lg:px-10">
    <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date())}</p><h1 className="mt-1 font-display text-2xl font-bold capitalize tracking-tight sm:text-3xl">{title}</h1></div>
     <div className="flex items-center gap-2">
      <span className="hidden items-center gap-2 rounded-full bg-card px-3 py-2 text-xs font-semibold text-muted-foreground shadow-sm sm:flex"><span className="h-2 w-2 rounded-full bg-[hsl(var(--secondary))]" />Saved on this device</span>
       <Link href="/settings" data-testid="link-topbar-settings" className="pressable grid h-11 w-11 place-items-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm" aria-label="Open settings"><SettingsIcon size={18} /></Link>
      <button onClick={toggleTheme} data-testid="button-toggle-theme" className="pressable grid h-11 w-11 place-items-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm" aria-label="Toggle theme">{state.settings.theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
    </div>
  </header>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.19em] text-[hsl(var(--secondary))]">{eyebrow}</p><h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p></div>{action}</div>;
}

function DashboardPage() {
  const { state, update } = useApp();
  const today = todayKey(state);
  const [volumeRange, setVolumeRange] = useState<VolumeRange>('all');
  const activities = [...state.activities].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const uniqueDays = new Set(state.activities.map((item) => item.date));
  const currentStreak = getStreak(state.activities, today);
  const longest = getLongestStreak(state.activities);
  const volume = totalVolume(state.activities);
  const selectedVolume = volumeForRange(state.activities, today, volumeRange);
  const steps = state.dailySteps?.[today] ?? 0;
  const water = state.dailyWater?.[today] ?? 0;
  const rosterIndex = rosterIndexForDate(state, today);
  const rosterDay = state.roster[rosterIndex];
  const workouts = state.activities.filter((item) => item.kind === 'workout').length;
  const pb = getPersonalBest(state.activities);
  const updateSteps = (value: number) => update({ dailySteps: { ...(state.dailySteps ?? {}), [today]: value } });
  const updateWater = (value: number) => update({ dailyWater: { ...(state.dailyWater ?? {}), [today]: value } });
  return <div className="mx-auto max-w-[1320px] px-5 pb-10 sm:px-8 lg:px-10">
    <section className="stagger-in relative overflow-hidden rounded-[1.75rem] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] shadow-[var(--shadow-lift)] sm:p-8">
      <div className="absolute -right-10 -top-20 h-64 w-64 rounded-full border-[28px] border-[hsl(var(--accent)/.12)]" /><div className="absolute -bottom-20 right-28 h-36 w-36 rounded-full bg-[hsl(var(--secondary)/.2)] blur-2xl" />
      <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end"><div><div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-[hsl(var(--accent))]"><Sparkles size={14} />{rosterDay?.label ?? 'Your day'}</div><h2 className="max-w-xl font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">Small moves.<br /><span className="text-[hsl(var(--secondary))]">Unbroken momentum.</span></h2><p className="mt-4 max-w-md text-sm leading-relaxed opacity-70">Fitness isn&apos;t built on perfect weeks. It&apos;s built on the choices you make when you&apos;re tired.</p></div>
        <div className="flex shrink-0 items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur"><div className="grid h-16 w-16 place-items-center rounded-full border-4 border-[hsl(var(--accent))]"><span className="font-display text-2xl font-bold">{currentStreak}</span></div><div><p className="font-display text-lg font-bold">day streak</p><p className="text-xs opacity-65">{currentStreak > 1 ? 'The consistency is there.' : 'Keep the streak alive.'}</p></div></div>
      </div>
    </section>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard className="stagger-in stagger-1" label="Current streak" value={`${currentStreak} days`} detail={`Best: ${longest} days`} icon={<Flame size={19} />} accent="lime" />
      <StatCard className="stagger-in stagger-2" label="Logged days" value={`${uniqueDays.size}`} detail={`${workouts} strength sessions`} icon={<Check size={19} />} accent="teal" />
      <VolumeCard className="stagger-in stagger-3" value={selectedVolume} range={volumeRange} onRangeChange={setVolumeRange} />
      <StatCard className="stagger-in stagger-4" label="Longest streak" value={`${longest} days`} detail="Keep your own pace" icon={<Target size={19} />} accent="ink" />
      <StepsCard className="stagger-in stagger-5 lg:col-span-2" steps={steps} onChange={updateSteps} />
      <WaterCard className="stagger-in stagger-5 lg:col-span-2" amount={water} onChange={updateWater} />
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <section className="card stagger-in p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">For the next 60 seconds</p><h3 className="mt-1 font-display text-xl font-bold">Log the shape of today</h3></div><Gauge className="text-[hsl(var(--secondary))]" size={24} /></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickAction href="/log?kind=workout" icon={<Dumbbell size={20} />} title="Strength" note="Log a lift" color="teal" />
          <QuickAction href="/log?kind=cardio" icon={<HeartPulse size={20} />} title="Cardio" note="Clear the head" color="lime" />
          <QuickAction href="/log?kind=rest" icon={<Moon size={20} />} title="Planned rest" note="Recovery counts" color="coral" />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-muted/65 p-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-card text-[hsl(var(--secondary))]"><CalendarDays size={19} /></div><div className="mr-auto"><p className="text-xs text-muted-foreground">Today’s roster day</p><p className="font-bold">{rosterDay?.label ?? 'No roster set'} <span className="font-normal text-muted-foreground">· {rosterDay ? dayLabel(rosterDay.kind) : 'add a cycle'}</span></p></div><Link href="/roster" data-testid="link-view-roster" className="pressable flex items-center gap-1 text-xs font-bold text-[hsl(var(--secondary))]">View cycle <ArrowRight size={14} /></Link></div>
      </section>
      <section className="card stagger-in stagger-2 overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Recent activity</p><h3 className="mt-1 font-display text-xl font-bold">Your last moves</h3></div><History size={20} className="text-muted-foreground" /></div>
        <div className="divide-y divide-border">{activities.slice(0, 5).map((activity) => <ActivityRow key={activity.id} activity={activity} />)}</div>
        {!activities.length && <EmptyState title="Your first move is waiting." detail="Log a workout, cardio session, or planned rest day." icon={<Zap />} />}
      </section>
    </div>
    <section className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <div className="card flex items-center gap-4 p-5 sm:p-6"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"><Trophy size={25} /></div><div><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Personal best</p><h3 className="mt-1 font-display text-lg font-bold">{pb.name}</h3><p className="text-sm text-muted-foreground">{pb.value ? `${formatNumber(pb.value)} kg volume` : 'Your first one is close.'}</p></div><div className="ml-auto hidden text-right sm:block"><p className="font-mono text-2xl font-bold">{pb.value ? 'NEW' : '—'}</p><p className="text-[10px] uppercase tracking-widest text-muted-foreground">this cycle</p></div></div>
      <div className="card flex items-center gap-5 bg-[hsl(var(--secondary))] p-5 text-[hsl(var(--secondary-foreground))] dark:text-[hsl(var(--foreground))] sm:p-6"><div className="hidden h-14 w-14 place-items-center rounded-2xl bg-black/10 sm:grid"><ShieldCheck size={25} /></div><div><p className="text-xs font-bold uppercase tracking-[.16em] opacity-65">The quiet win</p><h3 className="mt-1 font-display text-xl font-bold">Rest days count too.</h3><p className="mt-1 text-sm opacity-75">Your streak is built from showing up honestly, not pushing through everything.</p></div><ArrowRight className="ml-auto hidden shrink-0 sm:block" /></div>
    </section>
  </div>;
}

function StatCard({ label, value, detail, icon, accent, className }: { label: string; value: string; detail: string; icon: ReactNode; accent: string; className?: string }) {
  const colors: Record<string, string> = { lime: 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]', teal: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]', coral: 'bg-[hsl(var(--destructive))] text-white', ink: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' };
  return <div className={cx('card card-lift flex items-start gap-3 p-4', className)}><span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', colors[accent])}>{icon}</span><div className="min-w-0"><p className="truncate text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-0.5 font-display text-2xl font-bold">{value}</p><p className="truncate text-[11px] text-muted-foreground">{detail}</p></div></div>;
}

function VolumeCard({ value, range, onRangeChange, className }: { value: number; range: VolumeRange; onRangeChange: (range: VolumeRange) => void; className?: string }) {
  return <div className={cx('card card-lift p-4', className)}>
    <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--destructive))] text-white"><Weight size={19} /></span><div className="min-w-0"><p className="truncate text-xs font-semibold text-muted-foreground">Total volume</p><p className="mt-0.5 font-display text-2xl font-bold">{formatNumber(value)} kg</p><p className="truncate text-[11px] text-muted-foreground">{volumeRangeOptions.find((option) => option.value === range)?.label} recorded lifts</p></div></div>
    <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">{volumeRangeOptions.map((option) => <button type="button" key={option.value} onClick={() => onRangeChange(option.value)} data-testid={`button-volume-range-${option.value}`} className={cx('min-h-8 rounded-lg px-1 text-[10px] font-bold transition-colors', range === option.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>{option.value === 'today' ? 'Today' : option.value === 'week' ? 'Week' : option.value === 'month' ? 'Month' : 'All time'}</button>)}</div>
  </div>;
}

function StepsCard({ steps, onChange, className }: { steps: number; onChange: (value: number) => void; className?: string }) {
  return <div className={cx('card card-lift flex items-start gap-3 p-4', className)}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"><ActivityIcon size={19} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-muted-foreground">Steps today</p><input data-testid="input-daily-steps" type="number" min="0" step="1" inputMode="numeric" value={steps} onFocus={(event) => { if (steps === 0) event.currentTarget.select(); }} onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))} className="mt-0.5 w-full bg-transparent font-display text-2xl font-bold outline-none" /><p className="truncate text-[11px] text-muted-foreground">Saved for this logical day</p></div></div>;
}

function WaterCard({ amount, onChange, className }: { amount: number; onChange: (value: number) => void; className?: string }) {
  return <div className={cx('card card-lift flex items-start gap-3 p-4', className)}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"><Droplets size={19} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-muted-foreground">Water today</p><input data-testid="input-daily-water" type="number" min="0" step="0.25" inputMode="decimal" value={amount} onFocus={(event) => { if (amount === 0) event.currentTarget.select(); }} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="mt-0.5 w-full bg-transparent font-display text-2xl font-bold outline-none" /><p className="truncate text-[11px] text-muted-foreground">Litres logged</p></div></div>;
}

function QuickAction({ href, icon, title, note, color }: { href: string; icon: ReactNode; title: string; note: string; color: string }) {
  const colors: Record<string, string> = { teal: 'bg-[hsl(var(--secondary)/.13)] text-[hsl(var(--secondary))]', lime: 'bg-[hsl(var(--accent)/.75)] text-[hsl(var(--accent-foreground))]', coral: 'bg-[hsl(var(--destructive)/.13)] text-[hsl(var(--destructive))]' };
  return <Link href={href} data-testid={`link-quick-${title.toLowerCase().replace(' ', '-')}`} className="pressable flex items-center gap-3 rounded-2xl border border-border p-3 hover:border-[hsl(var(--secondary)/.4)]"><span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', colors[color])}>{icon}</span><span><strong className="block text-sm">{title}</strong><span className="block text-[11px] text-muted-foreground">{note}</span></span></Link>;
}

function ActivityRow({ activity, compact = false }: { activity: Activity; compact?: boolean }) {
  const Icon = iconForKind(activity.kind);
  const cardioMinutes = activity.exercises.reduce((total, exercise) => total + (exercise.durationMinutes ?? 0), 0);
  const itemLabel = activity.kind === 'cardio' ? 'workouts' : 'exercises';
  return <div className={cx('flex items-center gap-3 px-5 py-3', compact && 'px-0')} data-testid={`row-activity-${activity.id}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${kindColor[activity.kind]}22`, color: kindColor[activity.kind] }}><Icon size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{kindName[activity.kind]}{activity.isNightShift && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">night</span>}</p><p className="text-xs text-muted-foreground">{formatDate(activity.date, { weekday: 'short', month: 'short', day: 'numeric' })}{activity.exercises.length ? ` · ${activity.exercises.length} ${itemLabel}` : ''}</p></div><span className="text-right text-xs font-semibold text-muted-foreground">{activityVolume(activity) ? `${formatNumber(activityVolume(activity))} kg` : cardioMinutes ? `${formatNumber(cardioMinutes)} min` : 'done'}</span></div>;
}

function LogPage() {
  const { state, update } = useApp();
  const [location, setLocation] = useLocation();
  const queryKind = new URLSearchParams(window.location.search).get('kind') as ActivityKind | null;
  const [kind, setKind] = useState<ActivityKind>(queryKind && ['workout', 'cardio', 'rest'].includes(queryKind) ? queryKind : 'workout');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(todayKey(state));
  const [notes, setNotes] = useState('');
  const [bodyWeight, setBodyWeight] = useState('');
  const [nightShift, setNightShift] = useState(false);
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [restSeconds, setRestSeconds] = useState(0);
  const [timerChoice, setTimerChoice] = useState(60);
  const [customRestOpen, setCustomRestOpen] = useState(false);
  const [customRestMinutes, setCustomRestMinutes] = useState(Math.floor(((state.settings.customRestSeconds ?? 75) / 60)));
  const [customRestSecondsValue, setCustomRestSecondsValue] = useState((state.settings.customRestSeconds ?? 75) % 60);
  const [savedNotice, setSavedNotice] = useState('');
  const [voiceListeningFor, setVoiceListeningFor] = useState<string | null>(null);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [cardioTimers, setCardioTimers] = useState<Record<string, CardioTimerState>>({});
  const timerRef = useRef<number | undefined>(undefined);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = Boolean(getSpeechRecognition());
  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    recognitionRef.current?.stop();
  }, []);
  const hasRunningCardioTimer = Object.values(cardioTimers).some((timer) => timer.status === 'running');
  useEffect(() => {
    if (!hasRunningCardioTimer) return;
    const interval = window.setInterval(() => {
      setCardioTimers((current) => Object.fromEntries(Object.entries(current).map(([id, timer]) => timer.status === 'running' ? [id, { ...timer, elapsedSeconds: timer.elapsedSeconds + 1 }] : [id, timer])));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [hasRunningCardioTimer]);
  useEffect(() => {
    if (!Object.keys(cardioTimers).length) return;
    setExercises((items) => items.map((item) => {
      const timer = cardioTimers[item.id];
      return timer ? { ...item, durationMinutes: Math.round((timer.elapsedSeconds / 60) * 10) / 10 } : item;
    }));
  }, [cardioTimers]);
  useEffect(() => {
    if (!location.includes('?kind=')) return;
    const next = new URLSearchParams(window.location.search).get('kind') as ActivityKind | null;
    if (next && ['workout', 'cardio', 'rest'].includes(next)) setKind(next);
    setLocation('/log', { replace: true });
  }, [location, setLocation]);
  useEffect(() => {
    if (editingId || kind !== 'workout') return;
    setExercises(plannedExercisesForDate(state, date).map((planned) => exerciseFromPlan(planned, date)));
  }, [date, kind, state.roster, state.rosterAnchorDate, state.rosterAnchorDayId, editingId]);
  const resetForm = () => { setEditingId(null); setKind('workout'); setDate(todayKey(state)); setNotes(''); setBodyWeight(''); setNightShift(false); setExercises([]); setCardioTimers({}); };
  const addExercise = () => setExercises((items) => [...items, { id: makeId('exercise'), name: '', weight: 0, reps: 8, sets: 3, setDetails: Array.from({ length: 3 }, () => ({ id: makeId('set'), weight: 0, reps: 8 })), notes: '', date, volume: 0 }]);
  const updateExercise = (id: string, patch: Partial<ExerciseEntry>) => setExercises((items) => items.map((item) => item.id === id ? { ...item, ...patch, volume: item.setDetails?.length ? getExerciseVolume(item.setDetails) : Number(patch.weight ?? item.weight) * Number(patch.reps ?? item.reps) * Number(patch.sets ?? item.sets) } : item));
  const addCardioWorkout = () => setExercises((items) => [...items, { id: makeId('cardio'), name: '', weight: 0, reps: 0, sets: 1, durationMinutes: 0, notes: '', date, volume: 0 }]);
  const updateCardioWorkout = (id: string, patch: Partial<ExerciseEntry>) => {
    setExercises((items) => items.map((item) => item.id === id ? { ...item, ...patch, volume: 0 } : item));
    if (patch.durationMinutes !== undefined) {
      setCardioTimers((timers) => timers[id] ? { ...timers, [id]: { ...timers[id], elapsedSeconds: Math.max(0, Number(patch.durationMinutes) * 60) } } : timers);
    }
  };
  const removeCardioWorkout = (id: string) => {
    setExercises((items) => items.filter((item) => item.id !== id));
    setCardioTimers((timers) => { const next = { ...timers }; delete next[id]; return next; });
  };
  const startCardioWorkout = (id: string) => setCardioTimers((timers) => {
    const workout = exercises.find((item) => item.id === id);
    const current = timers[id];
    return { ...timers, [id]: { status: 'running', elapsedSeconds: current?.elapsedSeconds ?? Math.max(0, Number(workout?.durationMinutes) || 0) * 60 } };
  });
  const pauseCardioWorkout = (id: string) => setCardioTimers((timers) => timers[id] ? { ...timers, [id]: { ...timers[id], status: 'paused' } } : timers);
  const endCardioWorkout = (id: string) => setCardioTimers((timers) => timers[id] ? { ...timers, [id]: { ...timers[id], status: 'ended' } } : timers);
  const updateSet = (exerciseId: string, setId: string, patch: Partial<ExerciseSet>) => setExercises((items) => items.map((item) => {
    if (item.id !== exerciseId) return item;
    const nextSets = getExerciseSets(item).map((set) => set.id === setId ? { ...set, ...patch } : set);
    const firstSet = nextSets[0];
    return { ...item, setDetails: nextSets, weight: firstSet?.weight ?? 0, reps: firstSet?.reps ?? 0, sets: nextSets.length, durationMinutes: firstSet?.durationMinutes, volume: getExerciseVolume(nextSets) };
  }));
  const startVoiceCapture = (captureId: string, onTranscript: (transcript: string) => void) => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setVoiceMessage('Voice input is not available in this browser.');
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.lang = 'en-AU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? '';
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = () => {
      setVoiceListeningFor(null);
      setVoiceMessage('I could not hear that. Try the mic again.');
    };
    recognition.onend = () => {
      setVoiceListeningFor((current) => current === captureId ? null : current);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setVoiceMessage('');
    setVoiceListeningFor(captureId);
    try {
      recognition.start();
    } catch {
      setVoiceListeningFor(null);
      setVoiceMessage('Voice input could not start. Try the mic again.');
    }
  };
  const startVoiceForSet = (exerciseId: string, setId: string) => startVoiceCapture(`set-${exerciseId}-${setId}`, (transcript) => {
    const { weight, reps } = parseSpokenSet(transcript);
    if (!Number.isFinite(weight) && !Number.isFinite(reps)) {
      setVoiceMessage('Say a weight and reps, for example “70 kilos for 5 reps.”');
      return;
    }
    updateSet(exerciseId, setId, { ...(Number.isFinite(weight) ? { weight } : {}), ...(Number.isFinite(reps) ? { reps } : {}) });
    setVoiceMessage(`Heard: ${transcript}`);
  });
  const startVoiceForCardio = (workoutId: string) => startVoiceCapture(`cardio-${workoutId}`, (transcript) => {
    const duration = Number([...transcript.replace(/,/g, '.').matchAll(/\d+(?:\.\d+)?/g)][0]?.[0]);
    if (!Number.isFinite(duration)) {
      setVoiceMessage('Say the workout time, for example “20 minutes.”');
      return;
    }
    updateCardioWorkout(workoutId, { durationMinutes: duration });
    setVoiceMessage(`Heard: ${transcript}`);
  });
  const addSet = (exerciseId: string) => setExercises((items) => items.map((item) => {
    if (item.id !== exerciseId) return item;
    const currentSets = getExerciseSets(item);
    const lastSet = currentSets[currentSets.length - 1];
    const nextSets = [...currentSets, { id: makeId('set'), weight: lastSet?.weight ?? 0, reps: lastSet?.reps ?? 8, durationMinutes: lastSet?.durationMinutes }];
    return { ...item, setDetails: nextSets, sets: nextSets.length, volume: getExerciseVolume(nextSets) };
  }));
  const removeSet = (exerciseId: string, setId: string) => setExercises((items) => items.map((item) => {
    if (item.id !== exerciseId) return item;
    const currentSets = getExerciseSets(item);
    if (currentSets.length <= 1) return item;
    const nextSets = currentSets.filter((set) => set.id !== setId);
    const firstSet = nextSets[0];
    return { ...item, setDetails: nextSets, weight: firstSet?.weight ?? 0, reps: firstSet?.reps ?? 0, sets: nextSets.length, durationMinutes: firstSet?.durationMinutes, volume: getExerciseVolume(nextSets) };
  }));
  const startTimer = (seconds: number) => { if (timerRef.current) window.clearInterval(timerRef.current); setTimerChoice(seconds); setRestSeconds(seconds); timerRef.current = window.setInterval(() => setRestSeconds((left) => { if (left <= 1) { if (timerRef.current) window.clearInterval(timerRef.current); return 0; } return left - 1; }), 1000); };
  useEffect(() => {
    const total = state.settings.customRestSeconds ?? 75;
    setCustomRestMinutes(Math.floor(total / 60));
    setCustomRestSecondsValue(total % 60);
  }, [state.settings.customRestSeconds]);
  const customRestSeconds = state.settings.customRestSeconds ?? 75;
  const customRestTotalSeconds = customRestMinutes * 60 + customRestSecondsValue;
  const applyCustomRest = () => {
    const total = customRestTotalSeconds || 15;
    update({ settings: { ...state.settings, customRestSeconds: total } });
    setCustomRestOpen(false);
    startTimer(total);
  };
  const saveActivity = (event: FormEvent) => {
    event.preventDefault();
    const cleanExercises = kind === 'workout' ? exercises.filter((item) => item.name.trim()).map((item) => {
      const setDetails = getExerciseSets(item);
      const firstSet = setDetails[0];
      return { ...item, date, setDetails: setDetails.map((set) => ({ ...set, durationMinutes: undefined })), weight: firstSet?.weight ?? 0, reps: firstSet?.reps ?? 0, sets: setDetails.length, durationMinutes: undefined, volume: getExerciseVolume(setDetails) };
    }) : kind === 'cardio' ? exercises.filter((item) => item.name.trim()).map((item) => ({ ...item, date, weight: 0, reps: 0, sets: 1, setDetails: undefined, durationMinutes: Math.max(0, Number(item.durationMinutes) || 0), volume: 0 })) : [];
    const next: Activity = { id: editingId ?? makeId('activity'), date, loggedAt: new Date().toISOString(), kind, notes, isNightShift: nightShift, exercises: cleanExercises, ...(bodyWeight ? { bodyWeight: Number(bodyWeight) } : {}) };
    update({ activities: editingId ? state.activities.map((item) => item.id === editingId ? next : item) : [next, ...state.activities] });
    setSavedNotice(editingId ? 'Activity updated.' : kind === 'rest' ? 'Rest day counted. Good call.' : 'Saved. That one counts.');
    resetForm();
    window.setTimeout(() => setSavedNotice(''), 3500);
  };
  const editActivity = (activity: Activity) => { setEditingId(activity.id); setKind(activity.kind); setDate(activity.date); setNotes(activity.notes); setBodyWeight(activity.bodyWeight?.toString() ?? ''); setNightShift(activity.isNightShift); setExercises(activity.exercises); setCardioTimers({}); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const deleteActivity = (id: string) => { if (window.confirm('Delete this activity?')) update({ activities: state.activities.filter((item) => item.id !== id) }); };
  const activities = [...state.activities].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  return <div className="mx-auto max-w-[1320px] px-5 pb-10 sm:px-8 lg:px-10">
    <PageIntro eyebrow="Make it real" title={editingId ? 'Edit an activity' : 'Log the day'} description="A useful record beats a perfect plan. Capture the work, the walk, or the recovery." action={savedNotice ? <span className="flex items-center gap-2 rounded-full bg-[hsl(var(--secondary)/.16)] px-3 py-2 text-xs font-bold text-[hsl(var(--secondary))]"><Check size={15} />{savedNotice}</span> : null} />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
      <form onSubmit={saveActivity} className="card p-5 sm:p-7">
         <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl bg-muted p-1.5">
          {(['workout', 'cardio', 'rest'] as ActivityKind[]).map((item) => { const Icon = iconForKind(item); return <button type="button" key={item} onClick={() => setKind(item)} data-testid={`button-kind-${item}`} className={cx('flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-bold capitalize transition-all', kind === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}><Icon size={16} />{kindName[item]}</button>; })}
        </div>
         {voiceMessage && <p className="mb-4 rounded-xl bg-[hsl(var(--secondary)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--secondary))]">{voiceMessage}</p>}
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Logical activity date"><input data-testid="input-activity-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Body weight (optional)"><input data-testid="input-body-weight" type="number" step="0.1" placeholder={`e.g. 78.4 ${state.settings.units}`} value={bodyWeight} onChange={(e) => setBodyWeight(e.target.value)} /></Field></div>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[hsl(var(--primary)/.05)] p-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Moon size={17} /></span><div><p className="text-sm font-bold">Night-shift session</p><p className="text-[11px] text-muted-foreground">Tag this if you trained around a shift</p></div></div><button type="button" onClick={() => setNightShift(!nightShift)} data-testid="button-toggle-night-shift" className={cx('h-7 w-12 rounded-full p-1 transition-colors', nightShift ? 'bg-[hsl(var(--secondary))]' : 'bg-muted')}><span className={cx('block h-5 w-5 rounded-full bg-card transition-transform', nightShift && 'translate-x-5')} /></button></div>
        {kind === 'workout' && <div className="mt-6"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-display text-lg font-bold">Exercises</h3><p className="text-xs text-muted-foreground">Volume is weight × reps × sets.</p></div><button type="button" onClick={addExercise} data-testid="button-add-exercise" className="pressable flex min-h-10 items-center gap-2 rounded-xl bg-[hsl(var(--secondary))] px-3 text-xs font-bold text-[hsl(var(--secondary-foreground))]"><Plus size={15} />Add exercise</button></div>
         <div className="space-y-3">{exercises.map((exercise, index) => { const previous = findPreviousExercise(state.activities, exercise.name, editingId); const previousSets = previous ? getExerciseSets(previous.exercise) : []; const previousResult = previous ? previousSets.map((set) => `${set.weight > 0 ? `${formatNumber(set.weight)} ${state.settings.units}` : 'bodyweight'} × ${set.reps}`).join(' · ') : ''; const currentSets = getExerciseSets(exercise); return <div key={exercise.id} className="rounded-2xl border border-border bg-muted/45 p-3"><div className="mb-3 flex items-center gap-2"><input data-testid={`input-exercise-name-${exercise.id}`} className="min-h-10 flex-1 bg-transparent px-1 font-bold outline-none placeholder:text-muted-foreground" placeholder={`Exercise ${index + 1}`} value={exercise.name} onChange={(e) => updateExercise(exercise.id, { name: e.target.value })} /><button type="button" onClick={() => setExercises((items) => items.filter((item) => item.id !== exercise.id))} data-testid={`button-remove-exercise-${exercise.id}`} className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X size={16} /></button></div>{previous && <p data-testid={`text-last-exercise-${exercise.id}`} className="mb-3 rounded-xl bg-[hsl(var(--secondary)/.1)] px-3 py-2 text-xs text-muted-foreground"><span className="font-bold text-[hsl(var(--secondary))]">Last time:</span> {previousResult} on {formatDate(previous.activity.date, { month: 'short', day: 'numeric' })}</p>}<div className="mt-4 rounded-2xl border border-border/70 bg-card/60 p-3"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">Sets</p><p className="text-[11px] text-muted-foreground">{speechSupported ? 'Use the mic to say a weight and reps.' : 'Each set keeps its own numbers.'}</p></div><button type="button" onClick={() => addSet(exercise.id)} data-testid={`button-add-set-${exercise.id}`} className="pressable flex min-h-9 items-center gap-1 rounded-xl border border-border px-3 text-xs font-bold"><Plus size={14} />Add set</button></div><div className="space-y-2">{currentSets.map((set, setIndex) => <div key={set.id} className="rounded-xl border border-border bg-muted/45 p-2"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Set {setIndex + 1}</span><div className="flex items-center gap-1"><button type="button" onClick={() => startVoiceForSet(exercise.id, set.id)} disabled={!speechSupported} data-testid={`button-voice-set-${exercise.id}-${set.id}`} aria-label={`Fill set ${setIndex + 1} by voice`} className={cx('grid h-7 w-7 place-items-center rounded-lg text-muted-foreground enabled:hover:bg-[hsl(var(--secondary)/.12)] enabled:hover:text-[hsl(var(--secondary))] disabled:opacity-30', voiceListeningFor === `set-${exercise.id}-${set.id}` && 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]')}><Mic size={13} /></button><button type="button" onClick={() => removeSet(exercise.id, set.id)} disabled={currentSets.length <= 1} data-testid={`button-remove-set-${exercise.id}-${set.id}`} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground enabled:hover:bg-destructive/10 enabled:hover:text-destructive disabled:opacity-30"><Trash2 size={13} /></button></div></div><div className="grid grid-cols-2 gap-2"><MiniNumber label={`Weight (${state.settings.units})`} value={set.weight} testId={`input-set-weight-${exercise.id}-${set.id}`} onChange={(value) => updateSet(exercise.id, set.id, { weight: value })} /><MiniNumber label="Reps" value={set.reps} testId={`input-set-reps-${exercise.id}-${set.id}`} onChange={(value) => updateSet(exercise.id, set.id, { reps: value })} /></div></div>)}</div></div><p className="mt-2 text-right font-mono text-[11px] text-muted-foreground">{formatNumber(getExerciseVolume(currentSets))} {state.settings.units} volume</p></div>; })}</div>
          {!exercises.length && <button type="button" onClick={addExercise} data-testid="button-empty-add-exercise" className="flex min-h-24 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground hover:border-[hsl(var(--secondary))]"><Plus size={20} /><span className="mt-1 text-xs font-bold">Add your first exercise</span></button>}
        </div>}
         {kind === 'cardio' && <div className="mt-6 rounded-2xl border border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.2)] p-4"><div className="mb-4 flex items-start justify-between gap-3"><div className="flex gap-3"><Bike size={19} className="mt-0.5 shrink-0" /><div><p className="text-sm font-bold">Cardio workouts</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Start the timer when you begin. You can still edit the minutes manually.</p></div></div><button type="button" onClick={addCardioWorkout} data-testid="button-add-cardio-workout" className="pressable flex min-h-9 shrink-0 items-center gap-1 rounded-xl bg-[hsl(var(--secondary))] px-3 text-xs font-bold text-[hsl(var(--secondary-foreground))]"><Plus size={14} />Workout</button></div>{exercises.length > 0 && <div className="space-y-2">{exercises.map((workout, index) => { const timer = cardioTimers[workout.id] ?? { status: 'idle' as const, elapsedSeconds: Math.max(0, Number(workout.durationMinutes) || 0) * 60 }; return <div key={workout.id} className="rounded-xl border border-border bg-card/75 p-3"><div className="mb-2 flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[hsl(var(--accent))] text-xs font-bold text-[hsl(var(--accent-foreground))]">{index + 1}</span><input data-testid={`input-cardio-workout-${workout.id}`} className="min-h-10 min-w-0 flex-1 bg-transparent px-1 text-sm font-bold outline-none placeholder:text-muted-foreground" placeholder="Workout name (e.g. Run)" value={workout.name} onChange={(e) => updateCardioWorkout(workout.id, { name: e.target.value })} /><button type="button" onClick={() => removeCardioWorkout(workout.id)} data-testid={`button-remove-cardio-workout-${workout.id}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X size={15} /></button></div><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-[180px]"><MiniNumber label="Time (min)" value={workout.durationMinutes ?? 0} testId={`input-cardio-duration-${workout.id}`} onChange={(value) => updateCardioWorkout(workout.id, { durationMinutes: value })} /></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-muted px-2 py-2 font-mono text-xs font-bold">{formatElapsed(timer.elapsedSeconds)}</span>{timer.status === 'running' ? <button type="button" onClick={() => pauseCardioWorkout(workout.id)} data-testid={`button-pause-cardio-${workout.id}`} className="pressable min-h-9 rounded-xl border border-border px-3 text-xs font-bold">Pause</button> : timer.status !== 'ended' ? <button type="button" onClick={() => startCardioWorkout(workout.id)} data-testid={`button-start-cardio-${workout.id}`} className="pressable min-h-9 rounded-xl bg-[hsl(var(--secondary))] px-3 text-xs font-bold text-[hsl(var(--secondary-foreground))]">{timer.status === 'paused' ? 'Resume' : 'Start'}</button> : <span className="rounded-xl bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">Ended</span>}{(timer.status === 'running' || timer.status === 'paused') && <button type="button" onClick={() => endCardioWorkout(workout.id)} data-testid={`button-end-cardio-${workout.id}`} className="pressable min-h-9 rounded-xl border border-[hsl(var(--destructive)/.35)] px-3 text-xs font-bold text-[hsl(var(--destructive))]">End</button>}{speechSupported && <button type="button" onClick={() => startVoiceForCardio(workout.id)} data-testid={`button-voice-cardio-${workout.id}`} aria-label="Fill cardio time by voice" className={cx('grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground', voiceListeningFor === `cardio-${workout.id}` && 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]')}><Mic size={14} /></button>}</div></div></div>; })}</div>}</div>}
        {kind === 'rest' && <div className="mt-6 rounded-2xl bg-[hsl(var(--primary))] p-5 text-[hsl(var(--primary-foreground))]"><div className="flex gap-3"><Moon size={19} className="mt-0.5 text-[hsl(var(--accent))]" /><div><p className="font-display text-lg font-bold">Recovery is an action.</p><p className="mt-1 text-xs leading-relaxed opacity-70">Planned rest keeps your streak alive and your next session honest.</p></div></div></div>}
        <Field label="Notes" className="mt-5"><textarea data-testid="input-activity-notes" rows={3} placeholder="How did it feel? What should future-you know?" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row"><button type="submit" data-testid="button-save-activity" className="pressable flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary-foreground))]">{editingId ? <Check size={17} /> : <Plus size={17} />}{editingId ? 'Update activity' : `Save ${kindName[kind].toLowerCase()}`}</button>{editingId && <button type="button" onClick={resetForm} data-testid="button-cancel-edit" className="min-h-12 rounded-2xl border border-border px-5 text-sm font-bold text-muted-foreground">Cancel</button>}</div>
        <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground"><Clock3 size={13} />Your logical day rolls at {state.settings.dayRolloverHour}:00. The date above is what streaks use.</p>
      </form>
      <aside className="space-y-5">
        <section className="card p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Between sets</p><h3 className="mt-1 font-display text-xl font-bold">Rest timer</h3></div><TimerReset className="text-[hsl(var(--secondary))]" size={22} /></div><div className="flex items-center gap-5"><div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-8 border-muted" style={restSeconds ? { borderColor: 'hsl(var(--secondary))' } : undefined}><span className="font-mono text-xl font-bold">{restSeconds ? `${restSeconds}s` : 'ready'}</span></div><div className="grid flex-1 gap-2">{[30, 60, 90, 120].map((seconds) => { const minutes = Math.floor(seconds / 60); const remaining = seconds % 60; const label = minutes > 0 && remaining > 0 ? `${minutes}m ${remaining}s` : minutes > 0 ? `${minutes}m` : `${seconds}s`; return <button key={seconds} onClick={() => startTimer(seconds)} data-testid={`button-timer-${seconds}`} className={cx('min-h-10 rounded-xl border text-xs font-bold transition-colors', timerChoice === seconds ? 'border-[hsl(var(--secondary))] bg-[hsl(var(--secondary)/.12)] text-[hsl(var(--secondary))]' : 'border-border text-muted-foreground')}>{label}</button>; })}<div className="relative "><button type="button" onClick={() => setCustomRestOpen((open) => !open)} data-testid="button-timer-custom" className={cx('w-full min-h-10 rounded-xl border text-xs font-bold transition-colors', timerChoice === customRestSeconds ? 'border-[hsl(var(--secondary))] bg-[hsl(var(--secondary)/.12)] text-[hsl(var(--secondary))]' : 'border-border text-muted-foreground')}>Custom · {Math.floor(customRestSeconds / 60) > 0 ? `${Math.floor(customRestSeconds / 60)}m${customRestSeconds % 60 ? ` ${customRestSeconds % 60}s` : ''}` : `${customRestSeconds}s`}</button>{customRestOpen && <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-2xl border border-border bg-card p-3 shadow-lg"><div className="flex items-center gap-2"><label className="flex-1 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground"><span className="mb-1 block">Minutes</span><select value={customRestMinutes} onChange={(e) => setCustomRestMinutes(Number(e.target.value))} className="min-h-9 w-full rounded-lg border border-border bg-muted px-2 text-xs font-bold"><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option></select></label><label className="flex-1 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground"><span className="mb-1 block">Seconds</span><select value={customRestSecondsValue} onChange={(e) => setCustomRestSecondsValue(Number(e.target.value))} className="min-h-9 w-full rounded-lg border border-border bg-muted px-2 text-xs font-bold">{Array.from({ length: 60 }, (_, second) => <option key={second} value={second}>{String(second).padStart(2, '0')}</option>)}</select></label></div><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setCustomRestOpen(false)} className="min-h-9 rounded-lg border border-border px-3 text-[11px] font-bold text-muted-foreground">Close</button><button type="button" onClick={applyCustomRest} className="min-h-9 rounded-lg bg-[hsl(var(--secondary))] px-3 text-[11px] font-bold text-[hsl(var(--secondary-foreground))]">Start</button></div></div>}</div></div></div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">{restSeconds ? 'Breathe. Let the next set come to you.' : 'Choose a rest length to start the clock.'}</p></section>
        <section className="card overflow-hidden"><div className="border-b border-border px-5 py-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Recent log</p><h3 className="mt-1 font-display text-xl font-bold">Session history</h3></div>{activities.slice(0, 7).map((activity) => <div key={activity.id} className="group flex items-center gap-2 border-b border-border px-5 py-1"><ActivityRow activity={activity} compact /><div className="hidden gap-1 group-hover:flex"><button onClick={() => editActivity(activity)} data-testid={`button-edit-activity-${activity.id}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil size={14} /></button><button onClick={() => deleteActivity(activity.id)} data-testid={`button-delete-activity-${activity.id}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={14} /></button></div></div>)}{!activities.length && <EmptyState title="Nothing logged yet." detail="The archive will fill up as you go." icon={<History />} />}</section>
      </aside>
    </div>
  </div>;
}

function RosterPage() {
  const { state, update } = useApp();
  const today = todayKey(state);
  const index = rosterIndexForDate(state, today);
  const [draft, setDraft] = useState<RosterDay[]>(state.roster);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(state.roster), [state.roster]);
  const addDay = () => setDraft((items) => [...items, { id: makeId('roster'), label: `Day ${items.length + 1}`, kind: 'off', order: items.length, plannedExercises: [] }]);
  const patchDay = (id: string, patch: Partial<RosterDay>) => setDraft((items) => items.map((day) => day.id === id ? { ...day, ...patch } : day));
  const addPlannedExercise = (dayId: string) => setDraft((items) => items.map((day) => day.id === dayId ? { ...day, plannedExercises: [...(day.plannedExercises ?? []), { id: makeId('planned'), name: '', sets: 3, weight: 0, reps: 8 }] } : day));
  const patchPlannedExercise = (dayId: string, exerciseId: string, patch: Partial<PlannedExercise>) => setDraft((items) => items.map((day) => day.id === dayId ? { ...day, plannedExercises: (day.plannedExercises ?? []).map((exercise) => exercise.id === exerciseId ? { ...exercise, ...patch } : exercise) } : day));
  const removePlannedExercise = (dayId: string, exerciseId: string) => setDraft((items) => items.map((day) => day.id === dayId ? { ...day, plannedExercises: (day.plannedExercises ?? []).filter((exercise) => exercise.id !== exerciseId) } : day));
  const saveDay = (dayId: string) => { update({ roster: draft.map((item, i) => ({ ...item, order: i })) }); };
  const saveRoster = () => { update({ roster: draft.map((item, i) => ({ ...item, order: i })) }); setSaved(true); window.setTimeout(() => setSaved(false), 2500); };
  return <div className="mx-auto max-w-[1320px] px-5 pb-10 sm:px-8 lg:px-10">
    <PageIntro eyebrow="Your setup" title="Roster cycle" description="Plan the week. Add preset workouts to each day so your next log starts ready." action={<button onClick={saveRoster} data-testid="button-save-roster" className="pressable flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))]"><Check size={16} />{saved ? 'Saved' : 'Save cycle'}</button>} />
    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <section className="card overflow-hidden">
        <div className="border-b border-border p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Today · {formatDate(today, { month: 'long', day: 'numeric' })}</p><h3 className="mt-1 font-display text-2xl font-bold">{state.roster[index]?.label ?? 'Build your cycle'}</h3><p className="mt-1 text-sm text-muted-foreground">{state.roster[index] ? dayLabel(state.roster[index].kind) : 'Add a roster day to begin.'}</p></div>
        <div className="p-5 sm:p-6"><label className="mb-5 block"><span className="mb-2 block text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Current shift</span><select data-testid="select-current-roster-shift" className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[hsl(var(--secondary))]" value={state.roster[index]?.id ?? ''} disabled={!state.roster.length} onChange={(event) => update({ rosterAnchorDate: today, rosterAnchorDayId: event.target.value })}><option value="" disabled>Select a shift</option>{state.roster.map((day) => <option key={day.id} value={day.id}>{day.label} · {dayLabel(day.kind)}</option>)}</select><span className="mt-2 block text-xs text-muted-foreground">Choose where you are in the cycle. The roster advances from today.</span></label><p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Up next</p><div className="space-y-2">{Array.from({ length: Math.min(5, state.roster.length) }, (_, offset) => { const day = state.roster[(index + offset + 1) % state.roster.length]; return day ? <div key={day.id} className="flex items-center gap-3 rounded-2xl bg-muted/65 p-3"><span className={cx('grid h-9 w-9 place-items-center rounded-xl text-xs font-bold', day.kind === 'night' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : day.kind === 'day' ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]' : 'bg-card text-muted-foreground')}>{offset + 1}</span><span className="flex-1"><strong className="block text-sm">{day.label}</strong><span className="text-xs text-muted-foreground">{dayLabel(day.kind)}{day.plannedExercises?.length ? ` · ${day.plannedExercises.length} planned` : ''}</span></span><ArrowRight size={15} className="text-muted-foreground" /></div> : null; })}</div></div>
      </section>
      <section className="card p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Cycle editor</p><h3 className="mt-1 font-display text-2xl font-bold">Shape your rotation</h3></div><button onClick={addDay} data-testid="button-add-roster-day" className="pressable flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold"><Plus size={15} />Add day</button></div>
        <div className="mb-4 rounded-2xl bg-[hsl(var(--accent)/.32)] p-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Preset workouts:</strong> Add the exercises, default weight, reps, and set count for each roster day. The Log page copies them into today’s session.</div>
        <div className="space-y-3">{draft.map((day, i) => <div key={day.id} className="rounded-2xl border border-border p-3">
          <div className="flex items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center text-xs font-mono text-muted-foreground">{String(i + 1).padStart(2, '0')}</span><input data-testid={`input-roster-label-${day.id}`} className="min-h-10 min-w-0 flex-1 rounded-xl bg-muted/50 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[hsl(var(--secondary))]" value={day.label} onChange={(e) => patchDay(day.id, { label: e.target.value })} /><select data-testid={`select-roster-kind-${day.id}`} className="min-h-10 rounded-xl border-border bg-muted/50 px-2 text-xs font-bold outline-none" value={day.kind} onChange={(e) => patchDay(day.id, { kind: e.target.value as RosterKind })}><option value="day">Day</option><option value="night">Night</option><option value="off">Off</option></select><button onClick={() => saveDay(day.id)} data-testid={`button-save-roster-day-${day.id}`} className="min-h-9 rounded-xl bg-[hsl(var(--secondary))] px-2.5 text-[10px] font-bold text-[hsl(var(--secondary-foreground))]">Save</button><button onClick={() => setDraft((items) => items.filter((item) => item.id !== day.id))} data-testid={`button-delete-roster-${day.id}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={15} /></button></div>
          <div className="mt-3 border-t border-border pt-3"><div className="mb-2 flex items-center justify-between"><div><p className="text-xs font-bold">Preset workout</p><p className="text-[11px] text-muted-foreground">Optional · used when this day is logged</p></div><button type="button" onClick={() => addPlannedExercise(day.id)} data-testid={`button-add-planned-exercise-${day.id}`} className="pressable flex min-h-8 items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-bold"><Plus size={13} />Exercise</button></div>
            <div className="space-y-2">{day.plannedExercises?.map((exercise) => <div key={exercise.id} className="grid grid-cols-2 gap-2 rounded-xl bg-muted/55 p-2 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,.6fr))_auto]"><input data-testid={`input-planned-exercise-name-${exercise.id}`} className="col-span-2 min-h-9 min-w-0 rounded-lg bg-card px-2 text-xs font-bold outline-none sm:col-span-1" placeholder="Exercise name" value={exercise.name} onChange={(e) => patchPlannedExercise(day.id, exercise.id, { name: e.target.value })} /><MiniNumber label="Sets" value={exercise.sets} testId={`input-planned-exercise-sets-${exercise.id}`} onChange={(value) => patchPlannedExercise(day.id, exercise.id, { sets: Math.max(1, Math.round(value)) })} /><MiniNumber label={`Weight (${state.settings.units})`} value={exercise.weight} testId={`input-planned-exercise-weight-${exercise.id}`} onChange={(value) => patchPlannedExercise(day.id, exercise.id, { weight: value })} /><MiniNumber label="Reps" value={exercise.reps} testId={`input-planned-exercise-reps-${exercise.id}`} onChange={(value) => patchPlannedExercise(day.id, exercise.id, { reps: Math.max(0, Math.round(value)) })} /><button type="button" onClick={() => removePlannedExercise(day.id, exercise.id)} data-testid={`button-remove-planned-exercise-${exercise.id}`} className="grid h-9 w-9 place-items-center self-end rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={14} /></button></div>)}</div>
            {!day.plannedExercises?.length && <p className="rounded-xl bg-muted/45 px-3 py-2 text-[11px] text-muted-foreground">No preset yet. Add an exercise to make this day ready to log.</p>}
          </div>
        </div>)}</div>
      </section>
    </div>
  </div>;
}

function InsightsPage() {
  const { state } = useApp();
  const weightData = [...state.activities].filter((item) => item.bodyWeight).sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
  const workoutData = getLastDays(state.activities, todayKey(state), 8).map((date) => ({ date, value: state.activities.filter((item) => item.date === date && item.kind === 'workout').length }));
  const stepHistory = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(todayKey(state), index - 6);
    return { date, steps: state.dailySteps?.[date] ?? 0, water: state.dailyWater?.[date] ?? 0 };
  });
  const volume = totalVolume(state.activities);
  const pb = getPersonalBest(state.activities);
  const maxVolume = Math.max(...workoutData.map((item) => item.value), 1);
  const maxSteps = Math.max(...stepHistory.map((item) => item.steps), 1);
  const maxWater = Math.max(...stepHistory.map((item) => item.water), 1);
  return <div className="mx-auto max-w-[1320px] px-5 pb-10 sm:px-8 lg:px-10"><PageIntro eyebrow="Signals, not scores" title="Insights" description="Look for the pattern. The useful trend is usually clearer than the perfect number." />
    <div className="grid gap-5 lg:grid-cols-2"><ChartCard title="Body weight" subtitle={`Last ${weightData.length || 0} weigh-ins · ${state.settings.units}`} icon={<Weight size={19} />}><div className="flex h-44 items-end gap-2 sm:gap-4">{(weightData.length ? weightData : [{ date: todayKey(state), bodyWeight: 0 }]).map((item, i, arr) => { const values = arr.map((x) => x.bodyWeight || 0); const min = Math.min(...values) - 1; const max = Math.max(...values) + 1; const height = item.bodyWeight ? ((item.bodyWeight - min) / (max - min)) * 75 + 15 : 10; return <div key={item.date + i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="font-mono text-[10px] text-muted-foreground">{item.bodyWeight ? item.bodyWeight.toFixed(1) : '—'}</span><div className="w-full max-w-8 rounded-t-lg bg-[hsl(var(--secondary))]" style={{ height: `${height}%` }} /><span className="text-[9px] text-muted-foreground">{formatDate(item.date, { month: 'numeric', day: 'numeric' })}</span></div>; })}</div></ChartCard>
      <ChartCard title="Workout frequency" subtitle="Strength sessions · last 8 logical days" icon={<ActivityIcon size={19} />}><div className="flex h-44 items-end gap-2 sm:gap-4">{workoutData.map((item) => <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="font-mono text-[10px] text-muted-foreground">{item.value || ''}</span><div className={cx('w-full max-w-8 rounded-t-lg', item.value ? 'bg-[hsl(var(--accent))]' : 'bg-muted')} style={{ height: `${item.value ? (item.value / maxVolume) * 70 + 15 : 10}%` }} /><span className="text-[9px] text-muted-foreground">{formatDate(item.date, { weekday: 'short' }).slice(0, 2)}</span></div>)}</div></ChartCard>
      <ChartCard title="Movement + hydration" subtitle="Steps and water · last 7 logical days" icon={<Droplets size={19} />}><div className="space-y-3">{stepHistory.map(({ date, steps, water }) => <div key={date} className="grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2.5"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{formatDate(date, { weekday: 'short' }).slice(0, 2)}</span><div className="flex min-w-0 items-center gap-1.5"><span className="w-8 shrink-0 font-mono text-[9px] text-muted-foreground">{steps.toLocaleString()}</span><div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[hsl(var(--secondary))]" style={{ width: `${Math.min(100, (steps / maxSteps) * 100)}%` }} /></div></div><div className="flex min-w-0 items-center gap-1.5"><span className="w-8 shrink-0 font-mono text-[9px] text-muted-foreground">{water.toFixed(1)}L</span><div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[hsl(var(--accent))]" style={{ width: `${Math.min(100, (water / maxWater) * 100)}%` }} /></div></div></div> )}</div></ChartCard>
      <ChartCard title="Volume moved" subtitle="A running total of your logged lifts" icon={<BarChart3 size={19} />}><div className="flex items-end justify-between gap-4"><div><p className="font-display text-4xl font-bold">{formatNumber(volume)}</p><p className="mt-1 text-xs text-muted-foreground">{state.settings.units} total volume</p></div><div className="flex h-24 items-end gap-1.5">{(() => {
        const recentDays = getLastDays(state.activities, todayKey(state), 12).map((date) => ({ date, value: totalVolume(state.activities.filter((item) => item.date === date)) }));
        const bestDayVolume = recentDays.reduce((best, day) => Math.max(best, day.value), 0);
        return recentDays.map(({ date, value }) => { const isBest = value > 0 && value === bestDayVolume; return <div key={date} className="relative flex h-full w-3 items-end justify-center">
          {isBest && <span className="absolute -top-3 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--accent))]/90 text-[hsl(var(--accent-foreground))] shadow-sm" aria-label="Personal best"><Star size={10} fill="currentColor" /></span>}
          <div className="w-3 rounded-t-md bg-[hsl(var(--secondary))]" style={{ height: `${Math.max(8, Math.min(100, value / 12))}%`, opacity: value ? 1 : .15 }} />
        </div>; });
      })()}</div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[hsl(var(--secondary))]" style={{ width: `${Math.min(100, (volume / 12000) * 100)}%` }} /></div></ChartCard>
      <ChartCard title="Personal-best progress" subtitle="Your strongest recorded exercise volumes" icon={<Trophy size={19} />}><div className="space-y-4"><PBBar label={pb.name} value={pb.value} max={Math.max(pb.value, 1200)} color="teal" /><PBBar label="Total cycle volume" value={volume} max={Math.max(volume, 12000)} color="lime" /><div className="rounded-2xl bg-muted/70 p-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">New Personal Best!</strong> Your {pb.name.toLowerCase()} volume is the high mark in this local log.</div></div></ChartCard></div>
    <section className="card mt-5 overflow-hidden"><div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Fun volume comparison</p><h3 className="mt-1 font-display text-2xl font-bold">{comparisonFor(volume).name}</h3><p className="mt-1 text-sm text-muted-foreground">You moved about {formatNumber(volume)} kg. That is a lot of {comparisonFor(volume).name.toLowerCase()} energy.</p></div><div className="rounded-2xl bg-[hsl(var(--accent))] px-4 py-3 text-center"><p className="font-display text-2xl font-bold text-[hsl(var(--accent-foreground))]">{comparisonFor(volume).next}</p><p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--accent-foreground)/.7)]">next horizon</p></div></div><div className="grid gap-2 p-5 sm:grid-cols-9 sm:p-6">{comparisonNames.map((name, index) => <div key={name} className={cx('rounded-xl p-3 text-center', index <= comparisonFor(volume).index ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-muted text-muted-foreground')}><p className="font-display text-xs font-bold">{name}</p><p className="mt-1 font-mono text-[9px]">{comparisonThresholds[index].toLocaleString()} kg</p></div>)}</div></section>
  </div>;
}

function ChartCard({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return <section className="card p-5 sm:p-6"><div className="mb-5 flex items-start justify-between"><div><h3 className="font-display text-xl font-bold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--secondary)/.12)] text-[hsl(var(--secondary))]">{icon}</span></div>{children}</section>;
}
function PBBar({ label, value, max, color }: { label: string; value: number; max: number; color: 'teal' | 'lime' }) {
  return <div><div className="mb-2 flex justify-between text-xs"><span className="font-bold">{label}</span><span className="font-mono text-muted-foreground">{formatNumber(value)} kg</span></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className={cx('h-full rounded-full', color === 'teal' ? 'bg-[hsl(var(--secondary))]' : 'bg-[hsl(var(--accent))]')} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div></div>;
}

function AchievementsPage() {
  const { state } = useApp();
  const achievements = state.achievements.map((achievement) => {
    const liveProgress = calculateAchievement(achievement.id, state);
    const milestone = getAchievementMilestone(achievement.id, liveProgress);
    return { ...achievement, ...milestone, liveProgress };
  });
  const unlocked = achievements.filter((item) => item.isUnlocked || item.unlockedAt).length;
  return <div className="mx-auto max-w-[1100px] px-5 pb-10 sm:px-8 lg:px-10"><PageIntro eyebrow="Proof of showing up" title="Wins worth keeping" description={`${unlocked} of ${achievements.length} unlocked. No confetti required — just a record that you did the thing.`} />
    <div className="grid gap-4 sm:grid-cols-2">{achievements.map((achievement, index) => { const progress = Math.min(achievement.liveProgress, achievement.nextThreshold); const isUnlocked = achievement.isUnlocked || Boolean(achievement.unlockedAt); return <section key={achievement.id} className={cx('card card-lift stagger-in p-5', `stagger-${(index % 4) + 1}`)}><div className="flex items-start gap-4"><div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', isUnlocked ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]' : 'bg-muted text-muted-foreground')}>{isUnlocked ? <Trophy size={23} /> : <Target size={22} />}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="font-display text-lg font-bold">{achievement.title}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{achievement.description}</p></div>{isUnlocked && <span className="rounded-full bg-[hsl(var(--secondary)/.13)] px-2 py-1 text-[10px] font-bold text-[hsl(var(--secondary))]">Unlocked</span>}</div><div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={cx('h-full rounded-full', isUnlocked ? 'bg-[hsl(var(--secondary))]' : 'bg-[hsl(var(--primary))]')} style={{ width: `${Math.min(100, (progress / achievement.nextThreshold) * 100)}%` }} /></div><span className="font-mono text-[11px] text-muted-foreground">{formatNumber(progress)} / {formatNumber(achievement.nextThreshold)}</span></div></div></div></section>; })}</div>
  </div>;
}

function SettingsPage() {
  const { state, update, reset } = useApp();
  const [importMessage, setImportMessage] = useState('');
  const exportData = () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `rosterfit-backup-${todayKey(state)}.json`; anchor.click(); URL.revokeObjectURL(url); };
  const importData = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const incoming = JSON.parse(String(reader.result)) as AppState; if (!incoming.settings || !incoming.activities || !incoming.roster) throw new Error('Invalid'); update({ ...incoming, dailySteps: incoming.dailySteps ?? {} }); setImportMessage('Backup imported.'); } catch { setImportMessage('That file could not be read.'); } }; reader.readAsText(file); };
  const patchSettings = (patch: Partial<AppState['settings']>) => update({ settings: { ...state.settings, ...patch } });
  return <div className="mx-auto max-w-[1000px] px-5 pb-10 sm:px-8 lg:px-10"><PageIntro eyebrow="Make it yours" title="Settings" description="Everything lives on this device. Tune the edges, then keep moving." />
     <div className="space-y-5"><section className="card p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><SettingsIcon size={18} /></span><div><h3 className="font-display text-xl font-bold">Preferences</h3><p className="text-xs text-muted-foreground">Small details, less friction.</p></div></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Day rollover"><select data-testid="select-rollover" value={state.settings.dayRolloverHour} onChange={(e) => patchSettings({ dayRolloverHour: Number(e.target.value) })}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((hour) => <option key={hour} value={hour}>{hour === 0 ? 'Midnight' : `${String(hour).padStart(2, '0')}:00`}</option>)}</select></Field><Field label="Units"><select data-testid="select-units" value={state.settings.units} onChange={(e) => patchSettings({ units: e.target.value as UnitSystem })}><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></Field><Field label="Theme"><select data-testid="select-theme" value={state.settings.theme} onChange={(e) => patchSettings({ theme: e.target.value as Theme })}><option value="light">Light</option><option value="dark">Dark</option></select></Field></div></section>
      <section className="card p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"><Download size={18} /></span><div><h3 className="font-display text-xl font-bold">Your data</h3><p className="text-xs text-muted-foreground">Portable, private, and yours.</p></div></div><div className="grid gap-3 sm:grid-cols-2"><button onClick={exportData} data-testid="button-export-data" className="pressable flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-bold"><Download size={16} />Export JSON backup</button><label className="pressable flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] text-sm font-bold text-[hsl(var(--primary-foreground))]"><Upload size={16} />Import JSON backup<input data-testid="input-import-data" type="file" accept="application/json,.json" className="hidden" onChange={importData} /></label></div>{importMessage && <p className="mt-3 text-xs font-bold text-[hsl(var(--secondary))]">{importMessage}</p>}<p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={14} />No account, no server, no mystery sync.</p></section>
      <section className="card border-destructive/30 p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div><h3 className="font-display text-xl font-bold">Reset local data</h3><p className="mt-1 text-sm text-muted-foreground">Clear activities and daily tracking, and restore default settings and roster. This cannot be undone.</p></div><button onClick={() => { if (window.confirm('This cannot be undone. If you want to keep your data, export it as a JSON file before resetting. Clear all local data and restore defaults?')) reset(); }} data-testid="button-reset-sample-data" className="pressable flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-destructive/30 px-4 text-sm font-bold text-destructive"><RotateCcw size={16} />Reset local data</button></div></section>
    </div>
  </div>;
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) { return <label className={cx('block', className)}><span className="mb-2 block text-xs font-bold text-muted-foreground">{label}</span>{children}</label>; }
function MiniNumber({ label, value, onChange, testId }: { label: string; value: number; onChange: (value: number) => void; testId: string }) { return <label><span className="mb-1 block text-[10px] font-bold text-muted-foreground">{label}</span><input data-testid={testId} type="number" min="0" step="0.5" className="min-h-10 w-full rounded-xl border border-border bg-card px-2 text-sm font-bold outline-none focus:ring-2 focus:ring-[hsl(var(--secondary))]" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
function EmptyState({ title, detail, icon }: { title: string; detail: string; icon: ReactNode }) { return <div className="flex flex-col items-center justify-center px-5 py-12 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">{icon}</span><h3 className="mt-3 font-display font-bold">{title}</h3><p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{detail}</p></div>; }
function NotFoundPage() { return <div className="mx-auto max-w-xl px-5 py-20 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-[hsl(var(--accent))]"><CircleHelp /></div><h2 className="mt-5 font-display text-3xl font-bold">That page is off roster.</h2><p className="mt-2 text-muted-foreground">Let’s get you back to today.</p><Link href="/" data-testid="link-not-found-home" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary-foreground))]">Back to today <ArrowRight size={16} /></Link></div>; }

const comparisonNames = ['Baby Unicorn', 'Unicorn', 'Angry Unicorn', 'Horse', 'Rhinoceros', 'T-Rex', 'Dragon', 'Giant', 'Godzilla', 'Titan', 'Mega Beast'];
const comparisonThresholds = [250, 500, 1000, 2500, 5000, 10000, 20000, 40000, 80000, 160000, 320000];
function comparisonFor(volume: number) {
  let index = comparisonThresholds.findIndex((threshold) => volume < threshold);
  if (index < 0) index = comparisonNames.length - 1;
  const currentName = comparisonNames[index] ?? comparisonNames[0];
  const nextName = comparisonNames[Math.min(index + 1, comparisonNames.length - 1)] ?? currentName;
  return { index, name: currentName, next: nextName };
}
function formatNumber(value: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Math.round(value * 10) / 10); }
function daysSinceEpoch(dateKey: string) { return Math.floor(new Date(`${dateKey}T12:00:00`).getTime() / 86400000); }
function getStreak(activities: Activity[], today: string) { const days = new Set(activities.map((item) => item.date)); let count = 0; let cursor = today; while (days.has(cursor)) { count += 1; cursor = shiftDate(cursor, -1); } return count; }
function getLongestStreak(activities: Activity[]) { const days = [...new Set(activities.map((item) => item.date))].sort(); let best = 0; let current = 0; days.forEach((day, index) => { current = index && shiftDate(days[index - 1], 1) === day ? current + 1 : 1; best = Math.max(best, current); }); return best; }
function getLastDays(activities: Activity[], today: string, count: number) { return Array.from({ length: count }, (_, index) => shiftDate(today, index - count + 1)); }
function getPersonalBest(activities: Activity[]) { const best = activities.flatMap((activity) => activity.exercises).reduce((winner, exercise) => exercise.volume > winner.value ? { name: exercise.name, value: exercise.volume } : winner, { name: 'Your next personal best', value: 0 }); return best; }
const achievementStages: Record<string, Array<{ title: string; description: string; threshold: number }>> = {
  'first-log': [
    { title: 'First shift logged', description: 'Log your first activity.', threshold: 1 },
    { title: 'First week logged', description: 'Keep the week moving.', threshold: 7 },
    { title: 'First month logged', description: 'Build a full month of training.', threshold: 30 },
    { title: 'Three months logged', description: 'Stay consistent for 90 days.', threshold: 90 },
    { title: 'Six months logged', description: 'Keep the streak alive beyond half a year.', threshold: 180 },
    { title: 'One year logged', description: 'A full year of showing up.', threshold: 365 },
  ],
  'steady-7': [
    { title: 'Week streak', description: 'Keep a 7-day streak alive.', threshold: 7 },
    { title: 'Month streak', description: 'Hold a 30-day streak.', threshold: 30 },
    { title: 'Quarter streak', description: 'Reach 90 straight days.', threshold: 90 },
    { title: 'Half-year streak', description: 'Hold a 180-day streak.', threshold: 180 },
    { title: 'Year streak', description: 'Reach 365 straight days.', threshold: 365 },
  ],
  'volume-10k': [
    { title: 'Ten thousand club', description: 'Move 10,000 kg of total volume.', threshold: 10000 },
    { title: '25k club', description: 'Push past 25,000 kg total.', threshold: 25000 },
    { title: '50k club', description: 'Build a 50k kg total volume profile.', threshold: 50000 },
    { title: '100k club', description: 'Cross the 100k kg mark.', threshold: 100000 },
  ],
  'night-owl': [
    { title: 'Night owl', description: 'Train after three night shifts.', threshold: 3 },
    { title: 'Late shift habit', description: 'Build a pattern around late sessions.', threshold: 10 },
    { title: 'Night session streak', description: 'Keep finding the energy at night.', threshold: 25 },
    { title: 'Night shift regular', description: 'Make late training a real habit.', threshold: 50 },
  ],
  'rest-smart': [
    { title: 'Rest is training', description: 'Log three planned rest days.', threshold: 3 },
    { title: 'Recovery rhythm', description: 'Build a consistent recovery rhythm.', threshold: 7 },
    { title: 'Planned recoveries', description: 'Keep your recovery days intentional.', threshold: 14 },
    { title: 'Recovery routine', description: 'Make rest a steady part of the plan.', threshold: 30 },
  ],
  'pb-chaser': [
    { title: 'PB chaser', description: 'Set your first personal best.', threshold: 1 },
    { title: 'PB builder', description: 'Stack a few higher marks.', threshold: 3 },
    { title: 'PB hunter', description: 'Keep finding new highs.', threshold: 5 },
    { title: 'PB collector', description: 'Create a real history of progress.', threshold: 10 },
  ],
};

function getAchievementMilestone(id: string, progress: number) {
  const stages = achievementStages[id] ?? [{ title: 'Milestone', description: 'Keep building momentum.', threshold: 1 }];
  const reached = stages.filter((stage) => progress >= stage.threshold);
  const current = reached[reached.length - 1] ?? stages[0];
  const next = stages.find((stage) => progress < stage.threshold) ?? current;
  return { title: current.title, description: current.description, threshold: current.threshold, nextThreshold: next.threshold, isUnlocked: progress >= current.threshold };
}
function calculateAchievement(id: string, state: AppState) { if (id === 'first-log') return state.activities.length; if (id === 'steady-7') return getLongestStreak(state.activities); if (id === 'volume-10k') return totalVolume(state.activities); if (id === 'night-owl') return state.activities.filter((item) => item.isNightShift && item.kind === 'workout').length; if (id === 'rest-smart') return state.activities.filter((item) => item.kind === 'rest').length; if (id === 'pb-chaser') return state.activities.filter((item) => item.exercises.some((exercise) => exercise.volume > 0)).length; return 0; }

export default App;