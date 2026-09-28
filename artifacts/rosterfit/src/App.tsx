import { useEffect, useRef, useState, createContext, useContext, type ReactNode, type FormEvent, type ChangeEvent } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  Activity as ActivityIcon, ArrowRight, BarChart3, Bike, CalendarDays, Check, CircleHelp, Clock3, Dumbbell, Download, Flame, Gauge, HeartPulse, History,
  Home, Moon, MoreHorizontal, Pencil, Plus, RotateCcw, Settings as SettingsIcon, ShieldCheck, Sparkles,
  Sun, Target, TimerReset, Trash2, Trophy, Upload, Weight, X, Zap,
} from 'lucide-react';
import { activityVolume, dayLabel, formatDate, getSampleState, loadState, makeId, saveState, shiftDate, toDateKey, totalVolume, type Activity, type ActivityKind, type AppState, type ExerciseEntry, type RosterDay, type RosterKind, type Theme, type UnitSystem } from '@/lib/storage';

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
  const reset = () => { const fresh = getSampleState(); setState(fresh); };
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
          {label === 'Log' && <span className="ml-auto rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px] text-[hsl(var(--secondary-foreground))]">quick</span>}
        </Link>)}
      </nav>
      <div className="mt-auto space-y-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-relaxed opacity-80">
          <div className="mb-2 flex items-center gap-2 text-[hsl(var(--accent))]"><Moon size={14} /><span className="font-bold">Night shift mode</span></div>
          Logical day rolls at <strong>{state.settings.dayRolloverHour}:00</strong>. No midnight guilt.
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
  const title = location === '/' ? 'Good work, keep the thread.' : location.replace('/', '').replace('-', ' ');
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
  const { state } = useApp();
  const today = todayKey(state);
  const activities = [...state.activities].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const uniqueDays = new Set(state.activities.map((item) => item.date));
  const currentStreak = getStreak(state.activities, today);
  const longest = getLongestStreak(state.activities);
  const volume = totalVolume(state.activities);
  const rosterIndex = state.roster.length ? Math.floor((daysSinceEpoch(today) % state.roster.length + state.roster.length) % state.roster.length) : 0;
  const rosterDay = state.roster[rosterIndex];
  const workouts = state.activities.filter((item) => item.kind === 'workout').length;
  const pb = getPersonalBest(state.activities);
  return <div className="mx-auto max-w-[1320px] px-5 pb-10 sm:px-8 lg:px-10">
    <section className="stagger-in relative overflow-hidden rounded-[1.75rem] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] shadow-[var(--shadow-lift)] sm:p-8">
      <div className="absolute -right-10 -top-20 h-64 w-64 rounded-full border-[28px] border-[hsl(var(--accent)/.12)]" /><div className="absolute -bottom-20 right-28 h-36 w-36 rounded-full bg-[hsl(var(--secondary)/.2)] blur-2xl" />
      <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end"><div><div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-[hsl(var(--accent))]"><Sparkles size={14} />{rosterDay?.label ?? 'Your day'}</div><h2 className="max-w-xl font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">Small moves.<br /><span className="text-[hsl(var(--secondary))]">Unbroken momentum.</span></h2><p className="mt-4 max-w-md text-sm leading-relaxed opacity-70">You do not need a perfect week. You need a next useful choice after a long shift.</p></div>
        <div className="flex shrink-0 items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur"><div className="grid h-16 w-16 place-items-center rounded-full border-4 border-[hsl(var(--accent))]"><span className="font-display text-2xl font-bold">{currentStreak}</span></div><div><p className="font-display text-lg font-bold">day streak</p><p className="text-xs opacity-65">{currentStreak > 1 ? 'The thread is holding.' : 'Start the thread today.'}</p></div></div>
      </div>
    </section>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard className="stagger-in stagger-1" label="Current streak" value={`${currentStreak} days`} detail={`Best: ${longest} days`} icon={<Flame size={19} />} accent="lime" />
      <StatCard className="stagger-in stagger-2" label="Logged days" value={`${uniqueDays.size}`} detail={`${workouts} strength sessions`} icon={<Check size={19} />} accent="teal" />
      <StatCard className="stagger-in stagger-3" label="Total volume" value={`${formatNumber(volume)} kg`} detail="All recorded lifts" icon={<Weight size={19} />} accent="coral" />
      <StatCard className="stagger-in stagger-4" label="Longest streak" value={`${longest} days`} detail="Keep your own pace" icon={<Target size={19} />} accent="ink" />
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
      <div className="card flex items-center gap-5 bg-[hsl(var(--secondary))] p-5 text-[hsl(var(--secondary-foreground))] sm:p-6"><div className="hidden h-14 w-14 place-items-center rounded-2xl bg-black/10 sm:grid"><ShieldCheck size={25} /></div><div><p className="text-xs font-bold uppercase tracking-[.16em] opacity-65">The quiet win</p><h3 className="mt-1 font-display text-xl font-bold">Rest days count too.</h3><p className="mt-1 text-sm opacity-75">Your streak is built from showing up honestly, not pushing through everything.</p></div><ArrowRight className="ml-auto hidden shrink-0 sm:block" /></div>
    </section>
  </div>;
}

function StatCard({ label, value, detail, icon, accent, className }: { label: string; value: string; detail: string; icon: ReactNode; accent: string; className?: string }) {
  const colors: Record<string, string> = { lime: 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]', teal: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]', coral: 'bg-[hsl(var(--destructive))] text-white', ink: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' };
  return <div className={cx('card card-lift flex items-start gap-3 p-4', className)}><span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', colors[accent])}>{icon}</span><div className="min-w-0"><p className="truncate text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-0.5 font-display text-2xl font-bold">{value}</p><p className="truncate text-[11px] text-muted-foreground">{detail}</p></div></div>;
}

function QuickAction({ href, icon, title, note, color }: { href: string; icon: ReactNode; title: string; note: string; color: string }) {
  const colors: Record<string, string> = { teal: 'bg-[hsl(var(--secondary)/.13)] text-[hsl(var(--secondary))]', lime: 'bg-[hsl(var(--accent)/.75)] text-[hsl(var(--accent-foreground))]', coral: 'bg-[hsl(var(--destructive)/.13)] text-[hsl(var(--destructive))]' };
  return <Link href={href} data-testid={`link-quick-${title.toLowerCase().replace(' ', '-')}`} className="pressable flex items-center gap-3 rounded-2xl border border-border p-3 hover:border-[hsl(var(--secondary)/.4)]"><span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', colors[color])}>{icon}</span><span><strong className="block text-sm">{title}</strong><span className="block text-[11px] text-muted-foreground">{note}</span></span></Link>;
}

function ActivityRow({ activity, compact = false }: { activity: Activity; compact?: boolean }) {
  const Icon = iconForKind(activity.kind);
  return <div className={cx('flex items-center gap-3 px-5 py-3', compact && 'px-0')} data-testid={`row-activity-${activity.id}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${kindColor[activity.kind]}22`, color: kindColor[activity.kind] }}><Icon size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{kindName[activity.kind]}{activity.isNightShift && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">night</span>}</p><p className="text-xs text-muted-foreground">{formatDate(activity.date, { weekday: 'short', month: 'short', day: 'numeric' })}{activity.exercises.length ? ` · ${activity.exercises.length} exercises` : ''}</p></div><span className="text-right text-xs font-semibold text-muted-foreground">{activityVolume(activity) ? `${formatNumber(activityVolume(activity))} kg` : 'done'}</span></div>;
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
  const [savedNotice, setSavedNotice] = useState('');
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);
  useEffect(() => {
    if (!location.includes('?kind=')) return;
    const next = new URLSearchParams(window.location.search).get('kind') as ActivityKind | null;
    if (next && ['workout', 'cardio', 'rest'].includes(next)) setKind(next);
    setLocation('/log', { replace: true });
  }, [location, setLocation]);
  const resetForm = () => { setEditingId(null); setKind('workout'); setDate(todayKey(state)); setNotes(''); setBodyWeight(''); setNightShift(false); setExercises([]); };
  const addExercise = () => setExercises((items) => [...items, { id: makeId('exercise'), name: '', weight: 0, reps: 8, sets: 3, notes: '', date, volume: 0 }]);
  const updateExercise = (id: string, patch: Partial<ExerciseEntry>) => setExercises((items) => items.map((item) => item.id === id ? { ...item, ...patch, volume: Number(patch.weight ?? item.weight) * Number(patch.reps ?? item.reps) * Number(patch.sets ?? item.sets) } : item));
  const startTimer = (seconds: number) => { if (timerRef.current) window.clearInterval(timerRef.current); setTimerChoice(seconds); setRestSeconds(seconds); timerRef.current = window.setInterval(() => setRestSeconds((left) => { if (left <= 1) { if (timerRef.current) window.clearInterval(timerRef.current); return 0; } return left - 1; }), 1000); };
  const customRestSeconds = state.settings.customRestSeconds ?? 75;
  const saveActivity = (event: FormEvent) => {
    event.preventDefault();
    const cleanExercises = kind === 'workout' ? exercises.filter((item) => item.name.trim()).map((item) => ({ ...item, date, volume: Number(item.weight) * Number(item.reps) * Number(item.sets) })) : [];
    const next: Activity = { id: editingId ?? makeId('activity'), date, loggedAt: new Date().toISOString(), kind, notes, isNightShift: nightShift, exercises: cleanExercises, ...(bodyWeight ? { bodyWeight: Number(bodyWeight) } : {}) };
    update({ activities: editingId ? state.activities.map((item) => item.id === editingId ? next : item) : [next, ...state.activities] });
    setSavedNotice(editingId ? 'Activity updated.' : kind === 'rest' ? 'Rest day counted. Good call.' : 'Saved. That one counts.');
    resetForm();
    window.setTimeout(() => setSavedNotice(''), 3500);
  };
  const editActivity = (activity: Activity) => { setEditingId(activity.id); setKind(activity.kind); setDate(activity.date); setNotes(activity.notes); setBodyWeight(activity.bodyWeight?.toString() ?? ''); setNightShift(activity.isNightShift); setExercises(activity.exercises); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const deleteActivity = (id: string) => { if (window.confirm('Delete this activity?')) update({ activities: state.activities.filter((item) => item.id !== id) }); };
  const activities = [...state.activities].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  return <div className="mx-auto max-w-[1320px] px-5 pb-10 sm:px-8 lg:px-10">
    <PageIntro eyebrow="Make it real" title={editingId ? 'Edit an activity' : 'Log the day'} description="A useful record beats a perfect plan. Capture the work, the walk, or the recovery." action={savedNotice ? <span className="flex items-center gap-2 rounded-full bg-[hsl(var(--secondary)/.16)] px-3 py-2 text-xs font-bold text-[hsl(var(--secondary))]"><Check size={15} />{savedNotice}</span> : null} />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
      <form onSubmit={saveActivity} className="card p-5 sm:p-7">
        <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl bg-muted p-1.5">
          {(['workout', 'cardio', 'rest'] as ActivityKind[]).map((item) => { const Icon = iconForKind(item); return <button type="button" key={item} onClick={() => setKind(item)} data-testid={`button-kind-${item}`} className={cx('flex min-h-11 items-center justify-center gap-2 rounded-xl text-xs font-bold capitalize transition-all', kind === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}><Icon size={16} />{kindName[item]}</button>; })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Logical activity date"><input data-testid="input-activity-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Body weight (optional)"><input data-testid="input-body-weight" type="number" step="0.1" placeholder={`e.g. 78.4 ${state.settings.units}`} value={bodyWeight} onChange={(e) => setBodyWeight(e.target.value)} /></Field></div>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[hsl(var(--primary)/.05)] p-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Moon size={17} /></span><div><p className="text-sm font-bold">Night-shift session</p><p className="text-[11px] text-muted-foreground">Tag this if you trained around a shift</p></div></div><button type="button" onClick={() => setNightShift(!nightShift)} data-testid="button-toggle-night-shift" className={cx('h-7 w-12 rounded-full p-1 transition-colors', nightShift ? 'bg-[hsl(var(--secondary))]' : 'bg-muted')}><span className={cx('block h-5 w-5 rounded-full bg-card transition-transform', nightShift && 'translate-x-5')} /></button></div>
        {kind === 'workout' && <div className="mt-6"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-display text-lg font-bold">Exercises</h3><p className="text-xs text-muted-foreground">Volume is weight × reps × sets.</p></div><button type="button" onClick={addExercise} data-testid="button-add-exercise" className="pressable flex min-h-10 items-center gap-2 rounded-xl bg-[hsl(var(--secondary))] px-3 text-xs font-bold text-[hsl(var(--secondary-foreground))]"><Plus size={15} />Add exercise</button></div>
          <div className="space-y-3">{exercises.map((exercise, index) => { const previous = findPreviousExercise(state.activities, exercise.name, editingId); const previousResult = previous ? previous.exercise.durationMinutes ? `${formatNumber(previous.exercise.durationMinutes)} min` : `${previous.exercise.weight > 0 ? `${formatNumber(previous.exercise.weight)} ${state.settings.units}` : 'bodyweight'} × ${previous.exercise.reps} reps × ${previous.exercise.sets} sets` : ''; return <div key={exercise.id} className="rounded-2xl border border-border bg-muted/45 p-3"><div className="mb-3 flex items-center gap-2"><input data-testid={`input-exercise-name-${exercise.id}`} className="min-h-10 flex-1 bg-transparent px-1 font-bold outline-none placeholder:text-muted-foreground" placeholder={`Exercise ${index + 1}`} value={exercise.name} onChange={(e) => updateExercise(exercise.id, { name: e.target.value })} /><button type="button" onClick={() => setExercises((items) => items.filter((item) => item.id !== exercise.id))} data-testid={`button-remove-exercise-${exercise.id}`} className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X size={16} /></button></div>{previous && <p data-testid={`text-last-exercise-${exercise.id}`} className="mb-3 rounded-xl bg-[hsl(var(--secondary)/.1)] px-3 py-2 text-xs text-muted-foreground"><span className="font-bold text-[hsl(var(--secondary))]">Last time:</span> {previousResult} on {formatDate(previous.activity.date, { month: 'short', day: 'numeric' })}</p>}<div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><MiniNumber label={`Weight (${state.settings.units})`} value={exercise.weight} testId={`input-weight-${exercise.id}`} onChange={(value) => updateExercise(exercise.id, { weight: value })} /><MiniNumber label="Time (min)" value={exercise.durationMinutes ?? 0} testId={`input-duration-${exercise.id}`} onChange={(value) => updateExercise(exercise.id, { durationMinutes: value || undefined })} /><MiniNumber label="Reps" value={exercise.reps} testId={`input-reps-${exercise.id}`} onChange={(value) => updateExercise(exercise.id, { reps: value })} /><MiniNumber label="Sets" value={exercise.sets} testId={`input-sets-${exercise.id}`} onChange={(value) => updateExercise(exercise.id, { sets: value })} /></div><p className="mt-2 text-right font-mono text-[11px] text-muted-foreground">{formatNumber(exercise.volume)} {state.settings.units} volume</p></div>; })}</div>
          {!exercises.length && <button type="button" onClick={addExercise} data-testid="button-empty-add-exercise" className="flex min-h-24 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground hover:border-[hsl(var(--secondary))]"><Plus size={20} /><span className="mt-1 text-xs font-bold">Add your first exercise</span></button>}
        </div>}
        {kind === 'cardio' && <div className="mt-6 rounded-2xl bg-[hsl(var(--accent)/.3)] p-4"><div className="flex gap-3"><Bike size={19} className="mt-0.5" /><div><p className="text-sm font-bold">Cardio can be tiny.</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Use notes for the route, duration, pace, or how it felt. There is no minimum worth celebrating.</p></div></div></div>}
        {kind === 'rest' && <div className="mt-6 rounded-2xl bg-[hsl(var(--primary))] p-5 text-[hsl(var(--primary-foreground))]"><div className="flex gap-3"><Moon size={19} className="mt-0.5 text-[hsl(var(--accent))]" /><div><p className="font-display text-lg font-bold">Recovery is an action.</p><p className="mt-1 text-xs leading-relaxed opacity-70">Planned rest keeps your streak alive and your next session honest.</p></div></div></div>}
        <Field label="Notes" className="mt-5"><textarea data-testid="input-activity-notes" rows={3} placeholder="How did it feel? What should future-you know?" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row"><button type="submit" data-testid="button-save-activity" className="pressable flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary-foreground))]">{editingId ? <Check size={17} /> : <Plus size={17} />}{editingId ? 'Update activity' : `Save ${kindName[kind].toLowerCase()}`}</button>{editingId && <button type="button" onClick={resetForm} data-testid="button-cancel-edit" className="min-h-12 rounded-2xl border border-border px-5 text-sm font-bold text-muted-foreground">Cancel</button>}</div>
        <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground"><Clock3 size={13} />Your logical day rolls at {state.settings.dayRolloverHour}:00. The date above is what streaks use.</p>
      </form>
      <aside className="space-y-5">
        <section className="card p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Between sets</p><h3 className="mt-1 font-display text-xl font-bold">Rest timer</h3></div><TimerReset className="text-[hsl(var(--secondary))]" size={22} /></div><div className="flex items-center gap-5"><div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-8 border-muted" style={restSeconds ? { borderColor: 'hsl(var(--secondary))' } : undefined}><span className="font-mono text-xl font-bold">{restSeconds ? `${restSeconds}s` : 'ready'}</span></div><div className="grid flex-1 grid-cols-2 gap-2">{[30, 60, 90, 120].map((seconds) => <button key={seconds} onClick={() => startTimer(seconds)} data-testid={`button-timer-${seconds}`} className={cx('min-h-10 rounded-xl border text-xs font-bold transition-colors', timerChoice === seconds ? 'border-[hsl(var(--secondary))] bg-[hsl(var(--secondary)/.12)] text-[hsl(var(--secondary))]' : 'border-border text-muted-foreground')}>{seconds}s</button>)}<button onClick={() => startTimer(customRestSeconds)} data-testid="button-timer-custom" className={cx('min-h-10 rounded-xl border text-xs font-bold transition-colors', timerChoice === customRestSeconds ? 'border-[hsl(var(--secondary))] bg-[hsl(var(--secondary)/.12)] text-[hsl(var(--secondary))]' : 'border-border text-muted-foreground')}>Custom · {customRestSeconds}s</button></div></div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">{restSeconds ? 'Breathe. Let the next set come to you.' : 'Choose a rest length to start the clock.'}</p></section>
        <section className="card overflow-hidden"><div className="border-b border-border px-5 py-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Activity archive</p><h3 className="mt-1 font-display text-xl font-bold">Editable history</h3></div>{activities.slice(0, 7).map((activity) => <div key={activity.id} className="group flex items-center gap-2 border-b border-border px-5 py-1"><ActivityRow activity={activity} compact /><div className="hidden gap-1 group-hover:flex"><button onClick={() => editActivity(activity)} data-testid={`button-edit-activity-${activity.id}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil size={14} /></button><button onClick={() => deleteActivity(activity.id)} data-testid={`button-delete-activity-${activity.id}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={14} /></button></div></div>)}{!activities.length && <EmptyState title="Nothing logged yet." detail="The archive will fill up as you go." icon={<History />} />}</section>
      </aside>
    </div>
  </div>;
}

function RosterPage() {
  const { state, update } = useApp();
  const today = todayKey(state);
  const index = state.roster.length ? Math.abs(daysSinceEpoch(today)) % state.roster.length : 0;
  const [draft, setDraft] = useState<RosterDay[]>(state.roster);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(state.roster), [state.roster]);
  const addDay = () => setDraft((items) => [...items, { id: makeId('roster'), label: `Day ${items.length + 1}`, kind: 'off', order: items.length }]);
  const patchDay = (id: string, patch: Partial<RosterDay>) => setDraft((items) => items.map((day) => day.id === id ? { ...day, ...patch } : day));
  const saveRoster = () => { update({ roster: draft.map((item, i) => ({ ...item, order: i })) }); setSaved(true); window.setTimeout(() => setSaved(false), 2500); };
  return <div className="mx-auto max-w-[1320px] px-5 pb-10 sm:px-8 lg:px-10"><PageIntro eyebrow="Your rhythm" title="Roster cycle" description="Make the rotation visible. RosterFit uses the cycle to show what kind of day you are in, without judging the pace." action={<button onClick={saveRoster} data-testid="button-save-roster" className="pressable flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))]"><Check size={16} />{saved ? 'Saved' : 'Save cycle'}</button>} />
    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><section className="card overflow-hidden"><div className="border-b border-border p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Today · {formatDate(today, { month: 'long', day: 'numeric' })}</p><h3 className="mt-1 font-display text-2xl font-bold">{state.roster[index]?.label ?? 'Build your cycle'}</h3><p className="mt-1 text-sm text-muted-foreground">{state.roster[index] ? dayLabel(state.roster[index].kind) : 'Add a roster day to begin.'}</p></div><div className="p-5 sm:p-6"><p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Up next</p><div className="space-y-2">{Array.from({ length: Math.min(5, state.roster.length) }, (_, offset) => { const day = state.roster[(index + offset + 1) % state.roster.length]; return day ? <div key={day.id} className="flex items-center gap-3 rounded-2xl bg-muted/65 p-3"><span className={cx('grid h-9 w-9 place-items-center rounded-xl text-xs font-bold', day.kind === 'night' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : day.kind === 'day' ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]' : 'bg-card text-muted-foreground')}>{offset + 1}</span><span className="flex-1"><strong className="block text-sm">{day.label}</strong><span className="text-xs text-muted-foreground">{dayLabel(day.kind)}</span></span><ArrowRight size={15} className="text-muted-foreground" /></div> : null; })}</div></div></section>
      <section className="card p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Cycle editor</p><h3 className="mt-1 font-display text-2xl font-bold">Shape your rotation</h3></div><button onClick={addDay} data-testid="button-add-roster-day" className="pressable flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold"><Plus size={15} />Add day</button></div><div className="mb-4 rounded-2xl bg-[hsl(var(--accent)/.32)] p-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Default:</strong> 3 days · 3 nights · 6 off. Rename, retag, or add days to match the real rota.</div><div className="space-y-2">{draft.map((day, i) => <div key={day.id} className="flex items-center gap-2 rounded-2xl border border-border p-2"><span className="grid h-8 w-8 place-items-center text-xs font-mono text-muted-foreground">{String(i + 1).padStart(2, '0')}</span><input data-testid={`input-roster-label-${day.id}`} className="min-h-10 min-w-0 flex-1 rounded-xl bg-muted/50 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[hsl(var(--secondary))]" value={day.label} onChange={(e) => patchDay(day.id, { label: e.target.value })} /><select data-testid={`select-roster-kind-${day.id}`} className="min-h-10 rounded-xl border-border bg-muted/50 px-2 text-xs font-bold outline-none" value={day.kind} onChange={(e) => patchDay(day.id, { kind: e.target.value as RosterKind })}><option value="day">Day</option><option value="night">Night</option><option value="off">Off</option></select><button onClick={() => setDraft((items) => items.filter((item) => item.id !== day.id))} data-testid={`button-delete-roster-${day.id}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 size={15} /></button></div>)}</div></section>
    </div>
  </div>;
}

function InsightsPage() {
  const { state } = useApp();
  const weightData = [...state.activities].filter((item) => item.bodyWeight).sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
  const workoutData = getLastDays(state.activities, todayKey(state), 8).map((date) => ({ date, value: state.activities.filter((item) => item.date === date && item.kind === 'workout').length }));
  const volume = totalVolume(state.activities);
  const pb = getPersonalBest(state.activities);
  const maxVolume = Math.max(...workoutData.map((item) => item.value), 1);
  return <div className="mx-auto max-w-[1320px] px-5 pb-10 sm:px-8 lg:px-10"><PageIntro eyebrow="Signals, not scores" title="Insights" description="A gentle read on what your training is doing over time. Patterns are more useful than perfect numbers." />
    <div className="grid gap-5 lg:grid-cols-2"><ChartCard title="Body weight" subtitle={`Last ${weightData.length || 0} weigh-ins · ${state.settings.units}`} icon={<Weight size={19} />}><div className="flex h-44 items-end gap-2 sm:gap-4">{(weightData.length ? weightData : [{ date: todayKey(state), bodyWeight: 0 }]).map((item, i, arr) => { const values = arr.map((x) => x.bodyWeight || 0); const min = Math.min(...values) - 1; const max = Math.max(...values) + 1; const height = item.bodyWeight ? ((item.bodyWeight - min) / (max - min)) * 75 + 15 : 10; return <div key={item.date + i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="font-mono text-[10px] text-muted-foreground">{item.bodyWeight ? item.bodyWeight.toFixed(1) : '—'}</span><div className="w-full max-w-8 rounded-t-lg bg-[hsl(var(--secondary))]" style={{ height: `${height}%` }} /><span className="text-[9px] text-muted-foreground">{formatDate(item.date, { month: 'numeric', day: 'numeric' })}</span></div>; })}</div></ChartCard>
      <ChartCard title="Workout frequency" subtitle="Strength sessions · last 8 logical days" icon={<ActivityIcon size={19} />}><div className="flex h-44 items-end gap-2 sm:gap-4">{workoutData.map((item) => <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="font-mono text-[10px] text-muted-foreground">{item.value || ''}</span><div className={cx('w-full max-w-8 rounded-t-lg', item.value ? 'bg-[hsl(var(--accent))]' : 'bg-muted')} style={{ height: `${item.value ? (item.value / maxVolume) * 70 + 15 : 10}%` }} /><span className="text-[9px] text-muted-foreground">{formatDate(item.date, { weekday: 'short' }).slice(0, 2)}</span></div>)}</div></ChartCard>
      <ChartCard title="Volume moved" subtitle="A running total of your logged lifts" icon={<BarChart3 size={19} />}><div className="flex items-end justify-between gap-4"><div><p className="font-display text-4xl font-bold">{formatNumber(volume)}</p><p className="mt-1 text-xs text-muted-foreground">{state.settings.units} total volume</p></div><div className="flex h-24 items-end gap-1.5">{getLastDays(state.activities, todayKey(state), 12).map((date) => { const dayVolume = totalVolume(state.activities.filter((item) => item.date === date)); return <div key={date} className="w-3 rounded-t-md bg-[hsl(var(--primary))]" style={{ height: `${Math.max(8, Math.min(100, dayVolume / 12))}%`, opacity: dayVolume ? 1 : .15 }} />; })}</div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[hsl(var(--secondary))]" style={{ width: `${Math.min(100, (volume / 12000) * 100)}%` }} /></div></ChartCard>
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
  const achievements = state.achievements.map((achievement) => ({ ...achievement, liveProgress: calculateAchievement(achievement.id, state) }));
  const unlocked = achievements.filter((item) => item.unlockedAt || item.liveProgress >= item.threshold).length;
  return <div className="mx-auto max-w-[1100px] px-5 pb-10 sm:px-8 lg:px-10"><PageIntro eyebrow="Proof of showing up" title="Wins worth keeping" description={`${unlocked} of ${achievements.length} unlocked. No confetti required — just a record that you did the thing.`} />
    <div className="grid gap-4 sm:grid-cols-2">{achievements.map((achievement, index) => { const progress = Math.min(achievement.threshold, achievement.liveProgress); const isUnlocked = progress >= achievement.threshold; return <section key={achievement.id} className={cx('card card-lift stagger-in p-5', `stagger-${(index % 4) + 1}`)}><div className="flex items-start gap-4"><div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', isUnlocked ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]' : 'bg-muted text-muted-foreground')}>{isUnlocked ? <Trophy size={23} /> : <Target size={22} />}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="font-display text-lg font-bold">{achievement.title}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{achievement.description}</p></div>{isUnlocked && <span className="rounded-full bg-[hsl(var(--secondary)/.13)] px-2 py-1 text-[10px] font-bold text-[hsl(var(--secondary))]">Unlocked</span>}</div><div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={cx('h-full rounded-full', isUnlocked ? 'bg-[hsl(var(--secondary))]' : 'bg-[hsl(var(--primary))]')} style={{ width: `${(progress / achievement.threshold) * 100}%` }} /></div><span className="font-mono text-[11px] text-muted-foreground">{formatNumber(progress)} / {formatNumber(achievement.threshold)}</span></div></div></div></section>; })}</div>
  </div>;
}

function SettingsPage() {
  const { state, update, reset } = useApp();
  const [importMessage, setImportMessage] = useState('');
  const exportData = () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `rosterfit-backup-${todayKey(state)}.json`; anchor.click(); URL.revokeObjectURL(url); };
  const importData = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const incoming = JSON.parse(String(reader.result)) as AppState; if (!incoming.settings || !incoming.activities || !incoming.roster) throw new Error('Invalid'); update(incoming); setImportMessage('Backup imported.'); } catch { setImportMessage('That file could not be read.'); } }; reader.readAsText(file); };
  const patchSettings = (patch: Partial<AppState['settings']>) => update({ settings: { ...state.settings, ...patch } });
  return <div className="mx-auto max-w-[1000px] px-5 pb-10 sm:px-8 lg:px-10"><PageIntro eyebrow="Make it yours" title="Settings" description="Everything lives on this device. Tune the edges, then keep moving." />
     <div className="space-y-5"><section className="card p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><SettingsIcon size={18} /></span><div><h3 className="font-display text-xl font-bold">Preferences</h3><p className="text-xs text-muted-foreground">Small details, less friction.</p></div></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Day rollover"><select data-testid="select-rollover" value={state.settings.dayRolloverHour} onChange={(e) => patchSettings({ dayRolloverHour: Number(e.target.value) })}><option value={0}>Midnight</option><option value={2}>02:00</option><option value={4}>04:00</option><option value={6}>06:00</option><option value={8}>08:00</option></select></Field><Field label="Units"><select data-testid="select-units" value={state.settings.units} onChange={(e) => patchSettings({ units: e.target.value as UnitSystem })}><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></Field><Field label="Theme"><select data-testid="select-theme" value={state.settings.theme} onChange={(e) => patchSettings({ theme: e.target.value as Theme })}><option value="light">Light · dawn shift</option><option value="dark">Dark · night shift</option></select></Field><Field label="Custom rest (seconds)"><input data-testid="input-custom-rest" type="number" min="15" max="600" step="5" value={state.settings.customRestSeconds ?? 75} onChange={(e) => patchSettings({ customRestSeconds: Math.min(600, Math.max(15, Number(e.target.value) || 75)) })} /><span className="mt-1 block text-[11px] text-muted-foreground">Used by the Custom timer button.</span></Field></div></section>
      <section className="card p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"><Download size={18} /></span><div><h3 className="font-display text-xl font-bold">Your data</h3><p className="text-xs text-muted-foreground">Portable, private, and yours.</p></div></div><div className="grid gap-3 sm:grid-cols-2"><button onClick={exportData} data-testid="button-export-data" className="pressable flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-bold"><Download size={16} />Export JSON backup</button><label className="pressable flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] text-sm font-bold text-[hsl(var(--primary-foreground))]"><Upload size={16} />Import JSON backup<input data-testid="input-import-data" type="file" accept="application/json,.json" className="hidden" onChange={importData} /></label></div>{importMessage && <p className="mt-3 text-xs font-bold text-[hsl(var(--secondary))]">{importMessage}</p>}<p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={14} />No account, no server, no mystery sync.</p></section>
      <section className="card border-destructive/30 p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div><h3 className="font-display text-xl font-bold">Reset sample data</h3><p className="mt-1 text-sm text-muted-foreground">Restore a rich starter log for trying out the app. Your current local data will be replaced.</p></div><button onClick={() => { if (window.confirm('Replace your data with the sample log?')) reset(); }} data-testid="button-reset-sample-data" className="pressable flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-destructive/30 px-4 text-sm font-bold text-destructive"><RotateCcw size={16} />Reset sample</button></div></section>
    </div>
  </div>;
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) { return <label className={cx('block', className)}><span className="mb-2 block text-xs font-bold text-muted-foreground">{label}</span>{children}</label>; }
function MiniNumber({ label, value, onChange, testId }: { label: string; value: number; onChange: (value: number) => void; testId: string }) { return <label><span className="mb-1 block text-[10px] font-bold text-muted-foreground">{label}</span><input data-testid={testId} type="number" min="0" step="0.5" className="min-h-10 w-full rounded-xl border border-border bg-card px-2 text-sm font-bold outline-none focus:ring-2 focus:ring-[hsl(var(--secondary))]" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>; }
function EmptyState({ title, detail, icon }: { title: string; detail: string; icon: ReactNode }) { return <div className="flex flex-col items-center justify-center px-5 py-12 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">{icon}</span><h3 className="mt-3 font-display font-bold">{title}</h3><p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{detail}</p></div>; }
function NotFoundPage() { return <div className="mx-auto max-w-xl px-5 py-20 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-[hsl(var(--accent))]"><CircleHelp /></div><h2 className="mt-5 font-display text-3xl font-bold">That page is off roster.</h2><p className="mt-2 text-muted-foreground">Let’s get you back to today.</p><Link href="/" data-testid="link-not-found-home" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 text-sm font-bold text-[hsl(var(--primary-foreground))]">Back to today <ArrowRight size={16} /></Link></div>; }

const comparisonNames = ['Baby Unicorn', 'Unicorn', 'Angry Unicorn', 'Horse', 'Rhinoceros', 'T-Rex', 'Dragon', 'Giant', 'Godzilla'];
const comparisonThresholds = [500, 1500, 2500, 4000, 6000, 9000, 13000, 18000, 25000];
function comparisonFor(volume: number) { let index = comparisonThresholds.findIndex((threshold) => volume < threshold); if (index < 0) index = comparisonNames.length - 1; return { index, name: comparisonNames[index], next: comparisonNames[Math.min(index + 1, comparisonNames.length - 1)] }; }
function formatNumber(value: number) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Math.round(value * 10) / 10); }
function daysSinceEpoch(dateKey: string) { return Math.floor(new Date(`${dateKey}T12:00:00`).getTime() / 86400000); }
function getStreak(activities: Activity[], today: string) { const days = new Set(activities.map((item) => item.date)); let count = 0; let cursor = today; while (days.has(cursor)) { count += 1; cursor = shiftDate(cursor, -1); } return count; }
function getLongestStreak(activities: Activity[]) { const days = [...new Set(activities.map((item) => item.date))].sort(); let best = 0; let current = 0; days.forEach((day, index) => { current = index && shiftDate(days[index - 1], 1) === day ? current + 1 : 1; best = Math.max(best, current); }); return best; }
function getLastDays(activities: Activity[], today: string, count: number) { return Array.from({ length: count }, (_, index) => shiftDate(today, index - count + 1)); }
function getPersonalBest(activities: Activity[]) { const best = activities.flatMap((activity) => activity.exercises).reduce((winner, exercise) => exercise.volume > winner.value ? { name: exercise.name, value: exercise.volume } : winner, { name: 'Your next personal best', value: 0 }); return best; }
function calculateAchievement(id: string, state: AppState) { if (id === 'first-log') return state.activities.length; if (id === 'steady-7') return getLongestStreak(state.activities); if (id === 'volume-10k') return totalVolume(state.activities); if (id === 'night-owl') return state.activities.filter((item) => item.isNightShift && item.kind === 'workout').length; if (id === 'rest-smart') return state.activities.filter((item) => item.kind === 'rest').length; if (id === 'pb-chaser') return state.activities.some((item) => item.exercises.length > 0) ? 1 : 0; return 0; }

export default App;