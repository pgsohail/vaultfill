import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { loginMatchesPage, originOf, siteOf } from '@/lib/domain';
import { send } from '@/lib/messages';
import type { LoginDraft, LoginEntry } from '@/lib/types';
import { Avatar, ColoredPassword, Empty, Field, Icon, Input, ScreenHeader, StrengthBar, timeAgo, useAsync, useCopy } from '../ui';

type Route = { name: 'list' } | { name: 'detail'; id: string } | { name: 'edit'; id?: string };

export function VaultView({ pageUrl }: { pageUrl: string }) {
  const { data, reload } = useAsync(() => send('vault:list', {}).then((r) => r.entries));
  const [route, setRoute] = useState<Route>({ name: 'list' });
  const entry = route.name !== 'list' && route.id ? data?.find((e) => e.id === route.id) : undefined;

  if (route.name === 'detail' && entry) {
    return <Detail entry={entry} onBack={() => setRoute({ name: 'list' })} onEdit={() => setRoute({ name: 'edit', id: entry.id })} />;
  }
  if (route.name === 'edit') {
    return (
      <Editor
        entry={entry ?? null}
        defaultUrl={siteOf(pageUrl) ? originOf(pageUrl) : ''}
        onClose={(saved) => {
          reload();
          setRoute(saved ? { name: 'detail', id: saved.id } : entry ? { name: 'detail', id: entry.id } : { name: 'list' });
        }}
        onDeleted={() => {
          reload();
          setRoute({ name: 'list' });
        }}
      />
    );
  }
  return <List entries={data} pageUrl={pageUrl} onOpen={(id) => setRoute({ name: 'detail', id })} onAdd={() => setRoute({ name: 'edit' })} />;
}

// ------------------------------------------------------------------ list

function List({ entries, pageUrl, onOpen, onAdd }: { entries: LoginEntry[] | null; pageUrl: string; onOpen: (id: string) => void; onAdd: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const copy = useCopy();

  const { here, rest, flat } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (entries ?? []).filter((e) => !q || `${e.title} ${e.username} ${e.url}`.toLowerCase().includes(q));
    const here = pageUrl ? list.filter((e) => loginMatchesPage(e.url, pageUrl)) : [];
    const rest = list.filter((e) => !here.includes(e));
    return { here, rest, flat: [...here, ...rest] };
  }, [entries, query, pageUrl]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== search.current) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (entries && entries.length === 0) {
    return (
      <Empty
        icon="vault"
        title="Your vault is empty"
        body="Sign in to any site and VaultFill will offer to save it. You can also import a CSV from Settings."
        action={
          <button className="btn btn-primary" onClick={onAdd}>
            <Icon name="plus" /> Add login
          </button>
        }
      />
    );
  }

  const row = (e: LoginEntry) => {
    const i = flat.indexOf(e);
    return (
      <li key={e.id}>
        <div
          onClick={() => onOpen(e.id)}
          onMouseEnter={() => setActive(i)}
          className={`group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition ${i === active ? 'bg-hover' : ''}`}
        >
          <Avatar name={e.title} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{e.title}</div>
            <div className="truncate text-xs text-muted">{e.username || 'No username'}</div>
          </div>
          <div className={`flex gap-0.5 transition ${i === active ? 'opacity-100' : 'opacity-0'}`}>
            <button
              className="icon-btn"
              title="Copy username"
              onClick={(ev) => {
                ev.stopPropagation();
                void copy(e.username, 'Username');
              }}
            >
              <Icon name="user" />
            </button>
            <button
              className="icon-btn"
              title="Copy password"
              onClick={(ev) => {
                ev.stopPropagation();
                void copy(e.password, 'Password');
              }}
            >
              <Icon name="key" />
            </button>
          </div>
        </div>
      </li>
    );
  };

  const section = (label: string, items: LoginEntry[]) =>
    items.length > 0 && (
      <section className="mb-2">
        <h3 className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-faint">{label}</h3>
        <ul>{items.map(row)}</ul>
      </section>
    );

  return (
    <div className="fade-in px-2 pb-2">
      <div className="sticky top-0 z-10 flex gap-2 bg-canvas px-1.5 pt-3 pb-2">
        <div className="relative flex-1">
          <Icon name="search" className="absolute top-3 left-3 size-4 text-faint" />
          <Input
            ref={search}
            autoFocus
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, flat.length - 1));
              else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
              else if (e.key === 'Enter' && flat[active]) onOpen(flat[active].id);
              else if (e.key === 'Escape' && query) {
                e.preventDefault();
                setQuery('');
              } else return;
              e.preventDefault();
            }}
            className="pr-9 pl-9"
          />
          {!query && <span className="kbd absolute top-2.5 right-2.5">/</span>}
        </div>
        <button className="btn btn-secondary size-10 !px-0" title="Add login" onClick={onAdd}>
          <Icon name="plus" />
        </button>
      </div>
      {flat.length === 0 && entries && <p className="py-10 text-center text-xs text-muted">No matches for “{query}”</p>}
      {section(`On ${siteOf(pageUrl) ?? 'this site'}`, here)}
      {section(here.length ? 'All logins' : `${rest.length} login${rest.length === 1 ? '' : 's'}`, rest)}
    </div>
  );
}

// ---------------------------------------------------------------- detail

function Row({ label, children, onCopy, extra }: { label: string; children: ReactNode; onCopy?: () => void; extra?: ReactNode }) {
  return (
    <div
      onClick={onCopy}
      className={`group flex items-center gap-2 px-3.5 py-2.5 ${onCopy ? 'cursor-pointer hover:bg-hover' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-faint">{label}</div>
        <div className="mt-0.5 truncate text-[13px]">{children}</div>
      </div>
      {extra}
      {onCopy && <Icon name="copy" className="size-4 text-faint opacity-0 transition group-hover:opacity-100" />}
    </div>
  );
}

function TotpRow({ id, onCopy }: { id: string; onCopy: (code: string) => void }) {
  const [code, setCode] = useState<{ code: string; remaining: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () => send('totp:code', { id }).then((c) => alive && setCode(c), () => alive && setCode(null));
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);
  if (!code) return null;
  const pct = code.remaining / 30;
  return (
    <Row
      label="One-time code"
      onCopy={() => onCopy(code.code)}
      extra={
        <svg viewBox="0 0 20 20" className="size-5 -rotate-90">
          <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2" className="stroke-line" />
          <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2" strokeDasharray={`${pct * 50.3} 50.3`} strokeLinecap="round" className={code.remaining <= 5 ? 'stroke-danger' : 'stroke-accent'} />
        </svg>
      }
    >
      <span className="font-mono text-[15px] tracking-[.2em]">
        {code.code.slice(0, 3)} {code.code.slice(3)}
      </span>
    </Row>
  );
}

function Detail({ entry, onBack, onEdit }: { entry: LoginEntry; onBack: () => void; onEdit: () => void }) {
  const [show, setShow] = useState(false);
  const copy = useCopy();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="fade-in">
      <ScreenHeader
        title=""
        onBack={onBack}
        action={
          <button className="btn btn-ghost h-8" onClick={onEdit}>
            <Icon name="pencil" className="size-3.5" /> Edit
          </button>
        }
      />
      <div className="flex flex-col items-center px-6 pb-5">
        <Avatar name={entry.title} size={52} />
        <h2 className="mt-3 text-base font-semibold">{entry.title}</h2>
        <a href={entry.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted hover:text-accent">
          {siteOf(entry.url) ?? entry.url} <Icon name="external" className="size-3" />
        </a>
      </div>

      <div className="mx-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">
        <Row label="Username" onCopy={() => copy(entry.username, 'Username')}>
          {entry.username || <span className="text-faint">None</span>}
        </Row>
        <Row
          label="Password"
          onCopy={() => copy(entry.password, 'Password')}
          extra={
            <button
              className="icon-btn size-7"
              title={show ? 'Hide' : 'Reveal'}
              onClick={(e) => {
                e.stopPropagation();
                setShow(!show);
              }}
            >
              <Icon name={show ? 'eyeOff' : 'eye'} />
            </button>
          }
        >
          {show ? <ColoredPassword value={entry.password} /> : <span className="tracking-[.2em] text-muted">••••••••••••</span>}
        </Row>
        {entry.totp && <TotpRow id={entry.id} onCopy={(c) => copy(c, 'Code')} />}
      </div>

      {entry.notes && (
        <div className="mx-3 mt-3 rounded-2xl border border-line px-3.5 py-2.5">
          <div className="text-[11px] text-faint">Notes</div>
          <p className="mt-0.5 text-[13px] whitespace-pre-wrap">{entry.notes}</p>
        </div>
      )}

      {!!entry.passwordHistory?.length && (
        <details className="mx-3 mt-3 rounded-2xl border border-line px-3.5 py-2.5 text-xs">
          <summary className="cursor-pointer text-muted">Previous passwords ({entry.passwordHistory.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {entry.passwordHistory.map((h) => (
              <li key={h.changedAt} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono">{show ? h.password : '••••••••'}</span>
                <span className="shrink-0 text-faint">{timeAgo(h.changedAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="py-4 text-center text-[11px] text-faint">
        Updated {timeAgo(entry.updatedAt)}
        {entry.lastUsedAt ? ` · Used ${timeAgo(entry.lastUsedAt)}` : ''}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- editor

function Editor({
  entry,
  defaultUrl,
  onClose,
  onDeleted,
}: {
  entry: LoginEntry | null;
  defaultUrl: string;
  onClose: (saved?: LoginEntry) => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<LoginDraft>(
    entry ?? { title: siteOf(defaultUrl) ?? '', url: defaultUrl, username: '', password: '', totp: '', notes: '' },
  );
  const [show, setShow] = useState(!entry);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k: keyof LoginDraft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { entry: saved } = await send('vault:upsert', { entry: draft });
      onClose(saved);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form onSubmit={save} className="fade-in flex h-full flex-col">
      <ScreenHeader
        title={entry ? 'Edit login' : 'New login'}
        onBack={() => onClose()}
        action={
          <button className="btn btn-primary mr-1 h-8" disabled={!draft.url || !draft.password}>
            Save
          </button>
        }
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pt-1 pb-4">
        <Field label="Website">
          <Input autoFocus={!entry} value={draft.url} onChange={set('url')} placeholder="github.com" required />
        </Field>
        <Field label="Name">
          <Input value={draft.title} onChange={set('title')} placeholder={siteOf(`https://${draft.url.replace(/^https?:\/\//, '')}`) ?? 'GitHub'} />
        </Field>
        <Field label="Username or email">
          <Input value={draft.username} onChange={set('username')} autoComplete="off" />
        </Field>
        <Field
          label="Password"
          hint={
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 text-accent hover:underline"
              onClick={async () => {
                const { password } = await send('generator:preview', {});
                setDraft({ ...draft, password });
                setShow(true);
              }}
            >
              <Icon name="spark" className="size-3" /> Generate
            </button>
          }
        >
          <div className="relative">
            <Input type={show ? 'text' : 'password'} value={draft.password} onChange={set('password')} autoComplete="new-password" className="pr-10 font-mono" required />
            <button type="button" className="icon-btn absolute top-1 right-1" onClick={() => setShow(!show)}>
              <Icon name={show ? 'eyeOff' : 'eye'} />
            </button>
          </div>
          <StrengthBar password={draft.password} />
        </Field>
        <Field label="2FA secret" hint={<span className="text-faint">optional</span>}>
          <Input value={draft.totp ?? ''} onChange={set('totp')} placeholder="Base32 key or otpauth:// link" autoComplete="off" className="font-mono" />
        </Field>
        <Field label="Notes" hint={<span className="text-faint">optional</span>}>
          <textarea className="field" value={draft.notes ?? ''} onChange={set('notes')} />
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        {entry && (
          <button
            type="button"
            className={`btn w-full ${confirmDelete ? 'btn-danger' : 'btn-ghost !text-danger'}`}
            onClick={async () => {
              if (!confirmDelete) return setConfirmDelete(true);
              await send('vault:delete', { id: entry.id });
              onDeleted();
            }}
          >
            <Icon name="trash" className="size-3.5" />
            {confirmDelete ? 'Click again to delete forever' : 'Delete login'}
          </button>
        )}
      </div>
    </form>
  );
}
