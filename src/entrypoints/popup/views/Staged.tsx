import { useEffect, useState } from 'react';
import { send } from '@/lib/messages';
import type { StagedCredential } from '@/lib/types';
import { Avatar, ColoredPassword, Empty, Icon, timeAgo, useAsync, useCopy, useToast } from '../ui';

const SOURCE: Record<StagedCredential['source'], string> = {
  submitted: 'Signed in',
  generated: 'Generated',
  typed: 'Typed',
};

export function StagedView({ onCount }: { onCount: (n: number) => void }) {
  const { data, reload } = useAsync(() => send('staged:list', {}).then((r) => [...r.items].reverse()));
  const [reveal, setReveal] = useState<string | null>(null);
  const copy = useCopy();
  const toast = useToast();

  useEffect(() => {
    if (data) onCount(data.length);
  }, [data, onCount]);

  if (data && data.length === 0) {
    return (
      <Empty
        icon="inbox"
        title="All caught up"
        body="Passwords you generate, type into sign-up forms, or submit wait here for a few minutes, so they're never lost if a page crashes."
      />
    );
  }

  return (
    <div className="fade-in space-y-2 p-3">
      {data?.map((s) => {
        const mins = Math.max(1, Math.round((s.expiresAt - Date.now()) / 60_000));
        return (
          <div key={s.id} className="rounded-2xl border border-line p-3">
            <div className="flex items-center gap-3">
              <Avatar name={s.site} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{s.site}</div>
                <div className="truncate text-xs text-muted">{s.username || 'No username captured'}</div>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10.5px] text-muted">
                {SOURCE[s.source]} · {timeAgo(s.createdAt)}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-1 rounded-xl bg-surface py-1 pr-1 pl-3">
              <div className="min-w-0 flex-1 truncate text-[13px]">
                {reveal === s.id ? <ColoredPassword value={s.password} /> : <span className="tracking-[.2em] text-muted">••••••••••••</span>}
              </div>
              <button className="icon-btn size-7" onClick={() => setReveal(reveal === s.id ? null : s.id)}>
                <Icon name={reveal === s.id ? 'eyeOff' : 'eye'} />
              </button>
              <button className="icon-btn size-7" onClick={() => copy(s.password, 'Password')}>
                <Icon name="copy" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="flex flex-1 items-center gap-1 text-[11px] text-faint">
                <Icon name="clock" className="size-3" /> Clears in {mins} min
              </span>
              <button
                className="btn btn-ghost h-8"
                onClick={async () => {
                  await send('staged:discard', { id: s.id });
                  reload();
                }}
              >
                Discard
              </button>
              <button
                className="btn btn-primary h-8"
                onClick={async () => {
                  const { entry } = await send('staged:save', { id: s.id });
                  toast(`Saved to ${entry.title}`);
                  reload();
                }}
              >
                Save
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
