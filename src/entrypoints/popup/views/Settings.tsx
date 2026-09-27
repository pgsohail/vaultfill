import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { exportCsv, importCsv } from '@/lib/csv';
import { send } from '@/lib/messages';
import type { VaultSettings } from '@/lib/types';
import { Field, Icon, Input, ScreenHeader, StrengthBar, Switch, useToast, type IconName } from '../ui';
import { IdentityView } from './Identity';

type Sub = 'identity' | 'password' | 'export' | 'delete' | null;

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="px-3 pb-4">
      {title && <h3 className="px-2 pb-1.5 text-[11px] font-medium text-faint">{title}</h3>}
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">{children}</div>
    </section>
  );
}

function Item({ icon, label, detail, onClick, right, danger }: { icon: IconName; label: string; detail?: string; onClick?: () => void; right?: ReactNode; danger?: boolean }) {
  return (
    <div onClick={onClick} className={`flex items-center gap-3 px-3.5 py-2.5 ${onClick ? 'cursor-pointer hover:bg-hover' : ''}`}>
      <Icon name={icon} className={`size-4 ${danger ? 'text-danger' : 'text-muted'}`} />
      <span className={`flex-1 text-[13px] ${danger ? 'text-danger' : ''}`}>{label}</span>
      {detail && <span className="text-xs text-faint">{detail}</span>}
      {right ?? (onClick && <Icon name="chevron" className="size-4 text-faint" />)}
    </div>
  );
}

export function SettingsView({ onLocked }: { onLocked: () => void }) {
  const [settings, setSettings] = useState<VaultSettings | null>(null);
  const [sub, setSub] = useState<Sub>(null);
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    send('settings:get', {}).then((r) => setSettings(r.settings));
  }, []);

  const update = async (patch: Partial<VaultSettings>) => {
    const next = { ...settings!, ...patch };
    setSettings(next);
    await send('settings:set', { settings: next });
  };

  if (sub === 'identity') return <IdentityView onBack={() => setSub(null)} />;
  if (sub === 'password') return <ChangePassword onBack={() => setSub(null)} />;
  if (sub === 'export') return <Export onBack={() => setSub(null)} />;
  if (sub === 'delete') return <DeleteVault onBack={() => setSub(null)} onDeleted={onLocked} />;
  if (!settings) return null;

  const lockLabel = (m: number) => (m === 0 ? 'Never' : m < 60 ? `${m} min` : `${m / 60} hr`);

  return (
    <div className="fade-in pt-3">
      <Group title="Security">
        <Item
          icon="clock"
          label="Auto-lock"
          right={
            <select
              value={settings.autoLockMinutes}
              onChange={(e) => update({ autoLockMinutes: +e.target.value })}
              className="cursor-pointer bg-transparent text-right text-xs text-muted outline-none"
            >
              {[1, 5, 15, 30, 60, 240, 0].map((m) => (
                <option key={m} value={m}>
                  {lockLabel(m)}
                </option>
              ))}
            </select>
          }
        />
        <Item
          icon="lock"
          label="Lock with computer"
          right={<Switch label="Lock with computer" checked={settings.lockOnSystemLock} onChange={(v) => update({ lockOnSystemLock: v })} />}
        />
        <Item icon="key" label="Change master password" onClick={() => setSub('password')} />
      </Group>

      <Group title="Autofill">
        <Item icon="id" label="Autofill profile" detail="Name, address" onClick={() => setSub('identity')} />
      </Group>

      <Group title="Data">
        <Item icon="upload" label="Import passwords" detail="CSV" onClick={() => file.current?.click()} />
        <Item icon="download" label="Export passwords" onClick={() => setSub('export')} />
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const { logins, format } = importCsv(await f.text());
              const r = await send('vault:import', { entries: logins });
              toast(`${r.added} imported from ${format}`);
            } catch (err) {
              toast((err as Error).message);
            }
          }}
        />
      </Group>

      {settings.neverSaveSites.length > 0 && (
        <Group title="Never save on">
          {settings.neverSaveSites.map((s) => (
            <Item
              key={s}
              icon="globe"
              label={s}
              right={
                <button className="text-xs text-accent hover:underline" onClick={() => update({ neverSaveSites: settings.neverSaveSites.filter((x) => x !== s) })}>
                  Remove
                </button>
              }
            />
          ))}
        </Group>
      )}

      <Group>
        <Item icon="trash" label="Delete vault" danger onClick={() => setSub('delete')} />
      </Group>

      <p className="flex items-center justify-center gap-1.5 pb-5 text-[11px] text-faint">
        <Icon name="shield" className="size-3" /> Encrypted on this device · nothing is sent anywhere
      </p>
    </div>
  );
}

// ------------------------------------------------------------- sub-views

function useSubmit(action: () => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { submit, error, busy };
}

function ChangePassword({ onBack }: { onBack: () => void }) {
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const toast = useToast();
  const { submit, error, busy } = useSubmit(async () => {
    if (f.next !== f.confirm) throw new Error('New passwords don’t match');
    await send('vault:change-password', { current: f.current, next: f.next });
    toast('Master password changed');
    onBack();
  });
  return (
    <form onSubmit={submit} className="fade-in">
      <ScreenHeader title="Master password" onBack={onBack} />
      <div className="space-y-4 px-4">
        <Field label="Current password">
          <Input type="password" autoFocus value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
        </Field>
        <Field label="New password">
          <Input type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
          <StrengthBar password={f.next} />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !f.current || !f.next}>
          {busy ? 'Re-encrypting…' : 'Change password'}
        </button>
        <p className="text-center text-[11px] text-faint">Every item is re-encrypted with a new key.</p>
      </div>
    </form>
  );
}

function Export({ onBack }: { onBack: () => void }) {
  const [pw, setPw] = useState('');
  const toast = useToast();
  const { submit, error, busy } = useSubmit(async () => {
    const { entries } = await send('vault:export', { password: pw });
    const url = URL.createObjectURL(new Blob([exportCsv(entries)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `vaultfill-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`${entries.length} logins exported`);
    onBack();
  });
  return (
    <form onSubmit={submit} className="fade-in">
      <ScreenHeader title="Export" onBack={onBack} />
      <div className="space-y-4 px-4">
        <p className="rounded-xl bg-surface p-3 text-xs leading-relaxed text-muted">
          The file is <b className="text-ink">not encrypted</b>. Anyone who opens it can read your passwords, so delete it once you’re done.
        </p>
        <Field label="Master password">
          <Input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !pw}>
          Export CSV
        </button>
      </div>
    </form>
  );
}

function DeleteVault({ onBack, onDeleted }: { onBack: () => void; onDeleted: () => void }) {
  const [pw, setPw] = useState('');
  const { submit, error, busy } = useSubmit(async () => {
    await send('vault:wipe', { password: pw });
    onDeleted();
  });
  return (
    <form onSubmit={submit} className="fade-in">
      <ScreenHeader title="Delete vault" onBack={onBack} />
      <div className="space-y-4 px-4">
        <p className="text-xs leading-relaxed text-muted">This permanently deletes every login, 2FA secret and your profile from this device. It can’t be undone.</p>
        <Field label="Master password">
          <Input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button className="btn btn-danger w-full" disabled={busy || !pw}>
          Delete everything
        </button>
      </div>
    </form>
  );
}
