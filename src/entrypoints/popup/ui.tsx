import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { estimateStrength } from '@/lib/password';

// ------------------------------------------------------------------ data

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(() => {
    fn().then(setData, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(reload, [reload]);
  return { data, reload };
}

// ----------------------------------------------------------------- toast

const ToastCtx = createContext<(msg: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const timer = useRef(0);
  const show = useCallback((m: string) => {
    setMsg(m);
    setOpen(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 1600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={`toast ${open ? 'toast-in' : ''}`} role="status">
        <Icon name="check" className="size-3.5" />
        {msg}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Copies, confirms with a toast, and clears the clipboard after 30s if it still holds the value. */
export function useCopy() {
  const toast = useToast();
  return async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast(`${label} copied`);
    setTimeout(async () => {
      try {
        if ((await navigator.clipboard.readText()) === value) await navigator.clipboard.writeText('');
      } catch {
        /* popup closed */
      }
    }, 30_000);
  };
}

// ------------------------------------------------------------ primitives

export function hueOf(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div
      className="avatar grid shrink-0 place-items-center rounded-[10px] font-semibold"
      style={{ ['--h' as string]: hueOf(name), width: size, height: size, fontSize: size * 0.42 }}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </div>
  );
}

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-[28%] bg-accent text-white shadow-[0_8px_24px_-6px] shadow-accent/50"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" style={{ width: size * 0.48, height: size * 0.48 }} fill="currentColor">
        <circle cx="12" cy="9" r="3.6" />
        <path d="M10.4 11.5h3.2l1.1 7.5H9.3z" />
      </svg>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
        {label}
        {hint}
      </span>
      {children}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`field ${props.className ?? ''}`} />;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition ${checked ? 'bg-accent' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

export function ScreenHeader({ title, onBack, action }: { title: ReactNode; onBack?: () => void; action?: ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 px-2">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
      )}
      <h2 className={`min-w-0 flex-1 truncate text-sm font-semibold ${onBack ? '' : 'pl-2'}`}>{title}</h2>
      {action}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="fade-in flex flex-col items-center px-8 pt-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-surface text-muted">
        <Icon name={icon} className="size-5" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StrengthBar({ password }: { password: string }) {
  const s = estimateStrength(password);
  const colors = ['bg-danger', 'bg-danger', 'bg-amber-500', 'bg-ok', 'bg-ok'];
  if (!password) return <div className="mt-2 h-1" />;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex h-1 flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`flex-1 rounded-full transition ${i <= s.score - 1 || (i === 0 && s.score === 0) ? colors[s.score] : 'bg-line'}`} />
        ))}
      </div>
      <span className="w-16 text-right text-[11px] text-muted">{s.label}</span>
    </div>
  );
}

/** Digits and symbols tinted so a generated password is easy to read back. */
export function ColoredPassword({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span className={`font-mono break-all ${className}`}>
      {[...value].map((c, i) => (
        <span key={i} className={/\d/.test(c) ? 'text-accent' : /[^a-zA-Z]/.test(c) ? 'text-amber-500' : ''}>
          {c}
        </span>
      ))}
    </span>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ----------------------------------------------------------------- icons

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {ICONS[name]}
    </svg>
  );
}

const ICONS = {
  copy: <><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.2-8.2M17 6l2 2M15 8l1.5 1.5" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  eyeOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.7A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.7 3.4M6.5 6.9C4 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  back: <path d="m14.5 18-6-6 6-6" />,
  chevron: <path d="m9.5 6 6 6-6 6" />,
  trash: <><path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  vault: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="12" cy="12" r="3" /><path d="M12 9v-.5M12 15.5V15M15 12h.5M8.5 12H9" /></>,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  inbox: <><path d="M3.5 13.5 6 5.5h12l2.5 8" /><path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5H16a4 4 0 0 1-8 0Z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.3 3.4 5.2 3.4 8.5s-1.1 6.2-3.4 8.5c-2.3-2.3-3.4-5.2-3.4-8.5S9.7 5.8 12 3.5Z" /></>,
  external: <><path d="M14 4.5h5.5V10M19.5 4.5 11 13" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  pencil: <path d="M4.5 19.5 5.5 15 15.8 4.7a2 2 0 0 1 2.9 0l.6.6a2 2 0 0 1 0 2.9L9 18.5Z" />,
  shield: <path d="M12 3.5 19 6v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6Z" />,
  id: <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M14.5 10h3M14.5 13.5h3" /></>,
  upload: <><path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  download: <><path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  hash: <path d="M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16" />,
};
