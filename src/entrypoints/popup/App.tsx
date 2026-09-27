import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { send } from '@/lib/messages';
import { siteOf } from '@/lib/domain';
import type { VaultState } from '@/lib/types';
import { Icon, LogoMark, ToastProvider, type IconName } from './ui';
import { SetupView, UnlockView } from './views/Auth';
import { VaultView } from './views/Logins';
import { StagedView } from './views/Staged';
import { GeneratorView } from './views/Generator';
import { SettingsView } from './views/Settings';

type Tab = 'vault' | 'generator' | 'unsaved' | 'settings';
const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'vault', icon: 'vault', label: 'Vault' },
  { id: 'generator', icon: 'spark', label: 'Generate' },
  { id: 'unsaved', icon: 'inbox', label: 'Unsaved' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

const isTabPage = new URLSearchParams(location.search).has('welcome');

export default function App() {
  const [state, setState] = useState<VaultState | null>(null);
  const [tab, setTab] = useState<Tab>('vault');
  const [pageUrl, setPageUrl] = useState('');
  const [unsaved, setUnsaved] = useState(0);

  const refresh = useCallback(() => send('vault:status', {}).then((r) => setState(r.state)), []);

  useEffect(() => {
    void refresh();
    if (!isTabPage) browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => setPageUrl(t?.url ?? ''));
  }, [refresh]);

  useEffect(() => {
    if (state !== 'unlocked') return;
    send('staged:list', {}).then((r) => {
      setUnsaved(r.items.length);
      // Something was just submitted: take the user straight to it.
      if (r.items.some((s) => s.source === 'submitted')) setTab('unsaved');
    });
  }, [state]);

  const shell = isTabPage ? 'tab-page' : 'popup';
  let body;
  if (!state) body = null;
  else if (state === 'uninitialized') body = <SetupView onDone={refresh} />;
  else if (state === 'locked') body = <UnlockView onDone={refresh} />;
  else {
    const site = siteOf(pageUrl);
    body = (
      <div className="flex h-full flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-3.5">
          <LogoMark size={22} />
          <div className="min-w-0 flex-1">
            {site ? (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs text-muted">
                <span className="size-1.5 shrink-0 rounded-full bg-ok" />
                <span className="truncate">{site}</span>
              </span>
            ) : (
              <span className="text-sm font-semibold">VaultFill</span>
            )}
          </div>
          <button
            className="icon-btn"
            title="Lock vault"
            onClick={async () => {
              await send('vault:lock', {});
              void refresh();
            }}
          >
            <Icon name="lock" />
          </button>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto">
          {tab === 'vault' && <VaultView pageUrl={pageUrl} />}
          {tab === 'generator' && <GeneratorView />}
          {tab === 'unsaved' && <StagedView onCount={setUnsaved} />}
          {tab === 'settings' && <SettingsView onLocked={refresh} />}
        </main>

        <nav className="grid shrink-0 grid-cols-4 border-t border-line px-2 py-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10.5px] font-medium transition ${
                tab === t.id ? 'text-accent' : 'text-faint hover:text-muted'
              }`}
            >
              <Icon name={t.icon} className="size-[18px]" />
              {t.label}
              {t.id === 'unsaved' && unsaved > 0 && (
                <span className="absolute top-1 left-1/2 ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9.5px] font-semibold text-white">
                  {unsaved}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className={shell}>{body}</div>
    </ToastProvider>
  );
}
