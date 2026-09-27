import { useState, type FormEvent } from 'react';
import { send } from '@/lib/messages';
import { estimateStrength } from '@/lib/password';
import { Icon, Input, LogoMark, StrengthBar } from '../ui';

function Hero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <LogoMark size={48} />
      <h1 className="mt-5 text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
    </div>
  );
}

export function UnlockView({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setError(false);
    try {
      await send('vault:unlock', { password: pw });
      onDone();
    } catch {
      setError(true);
      setBusy(false);
      setPw('');
    }
  };

  return (
    <form onSubmit={submit} className="fade-in flex h-full flex-col justify-center px-8">
      <Hero title="Welcome back" subtitle="Enter your master password to unlock" />
      <div className={`relative ${error ? 'shake' : ''}`}>
        <Input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Master password"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setError(false);
          }}
          className={`h-11 pr-12 ${error ? '!border-danger' : ''}`}
        />
        <button
          disabled={!pw || busy}
          aria-label="Unlock"
          className="absolute top-1.5 right-1.5 grid size-8 cursor-pointer place-items-center rounded-lg bg-accent text-white transition disabled:opacity-30"
        >
          {busy ? <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Icon name="arrow" />}
        </button>
      </div>
      <p className={`mt-3 h-4 text-center text-xs ${error ? 'text-danger' : 'text-faint'}`}>
        {error ? 'Wrong password. Try again.' : busy ? 'Decrypting…' : 'Press Enter to unlock'}
      </p>
    </form>
  );
}

export function SetupView({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strong = estimateStrength(pw).score >= 2;
  const matches = pw.length > 0 && pw === confirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!strong) return setError('Use a longer password. A short phrase of 4+ words works well.');
    if (!matches) return setError('Passwords don’t match.');
    setBusy(true);
    setError(null);
    try {
      await send('vault:setup', { password: pw });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="fade-in flex h-full flex-col justify-center px-8">
      <Hero title="Create your vault" subtitle="One master password protects everything" />
      <Input type="password" autoFocus autoComplete="new-password" placeholder="Master password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-11" />
      <StrengthBar password={pw} />
      <div className="relative mt-3">
        <Input type="password" autoComplete="new-password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11" />
        {matches && <Icon name="check" className="absolute top-3.5 right-3.5 size-4 text-ok" />}
      </div>
      <button className="btn btn-primary mt-5 h-11 w-full" disabled={busy || !pw || !confirm}>
        {busy ? 'Creating vault…' : 'Create vault'}
      </button>
      <p className={`mt-4 text-center text-xs leading-relaxed ${error ? 'text-danger' : 'text-faint'}`}>
        {error ?? 'It never leaves this device and can’t be recovered, so store it somewhere safe.'}
      </p>
    </form>
  );
}
