import { browser } from 'wxt/browser';
import type { PendingLogin, StagedCredential, StagedSource } from '@/lib/types';

/**
 * Ephemeral staging buffer in chrome.storage.session (RAM only, cleared on browser exit,
 * unreadable by content scripts). Keeps generated/typed/submitted passwords alive across
 * reloads, failed submits and service-worker restarts until the user saves them.
 */
export const TTL: Record<StagedSource | 'pendingLogin', number> = {
  generated: 15 * 60_000,
  typed: 3 * 60_000,
  submitted: 5 * 60_000,
  pendingLogin: 3 * 60_000,
};
const MAX_ITEMS = 30;
const STAGED = 'staged';
const PENDING = 'pendingLogins';

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function readStaged(): Promise<StagedCredential[]> {
  const r = await browser.storage.session.get(STAGED);
  const now = Date.now();
  return ((r[STAGED] as StagedCredential[] | undefined) ?? []).filter((s) => s.expiresAt > now);
}

async function writeStaged(items: StagedCredential[]): Promise<void> {
  await browser.storage.session.set({ [STAGED]: items.slice(-MAX_ITEMS) });
}

export const staging = {
  list(): Promise<StagedCredential[]> {
    return serial(readStaged);
  },

  add(
    item: Omit<StagedCredential, 'id' | 'createdAt' | 'expiresAt'>,
    opts: { replaceSameSource?: boolean } = {},
  ): Promise<StagedCredential> {
    return serial(async () => {
      const now = Date.now();
      let items = await readStaged();
      // A typed or submitted password supersedes the generated/typed copies of the same value.
      items = items.filter(
        (s) =>
          !(
            s.site === item.site &&
            ((opts.replaceSameSource && s.source === item.source && s.tabId === item.tabId) ||
              (item.source === 'submitted' && s.source !== 'submitted' && s.password === item.password))
          ),
      );
      const staged: StagedCredential = {
        ...item,
        id: crypto.randomUUID(),
        createdAt: now,
        expiresAt: now + TTL[item.source],
      };
      items.push(staged);
      await writeStaged(items);
      return staged;
    });
  },

  update(id: string, patch: Partial<StagedCredential>): Promise<StagedCredential | undefined> {
    return serial(async () => {
      const items = await readStaged();
      const i = items.findIndex((s) => s.id === id);
      if (i < 0) return undefined;
      items[i] = { ...items[i], ...patch };
      await writeStaged(items);
      return items[i];
    });
  },

  remove(id: string): Promise<void> {
    return serial(async () => writeStaged((await readStaged()).filter((s) => s.id !== id)));
  },

  prune(): Promise<void> {
    return serial(async () => {
      await writeStaged(await readStaged());
      const r = await browser.storage.session.get(PENDING);
      const now = Date.now();
      const pending = ((r[PENDING] as PendingLogin[] | undefined) ?? []).filter((p) => p.expiresAt > now);
      await browser.storage.session.set({ [PENDING]: pending });
    });
  },

  setPendingLogin(site: string, username: string, entryId?: string): Promise<void> {
    return serial(async () => {
      const r = await browser.storage.session.get(PENDING);
      const now = Date.now();
      const pending = ((r[PENDING] as PendingLogin[] | undefined) ?? []).filter(
        (p) => p.expiresAt > now && p.site !== site,
      );
      pending.push({ site, username, entryId, expiresAt: now + TTL.pendingLogin });
      await browser.storage.session.set({ [PENDING]: pending });
    });
  },

  getPendingLogin(site: string): Promise<PendingLogin | undefined> {
    return serial(async () => {
      const r = await browser.storage.session.get(PENDING);
      const now = Date.now();
      return ((r[PENDING] as PendingLogin[] | undefined) ?? []).find(
        (p) => p.site === site && p.expiresAt > now,
      );
    });
  },

  clearAll(): Promise<void> {
    return serial(() => browser.storage.session.remove([STAGED, PENDING]));
  },
};
