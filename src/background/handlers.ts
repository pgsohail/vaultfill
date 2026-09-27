import { browser, type Browser } from 'wxt/browser';
import { loginMatchesPage, originOf, siteOf } from '@/lib/domain';
import {
  CONTENT_MESSAGES,
  type Envelope,
  type MessageType,
  type Reply,
  type Req,
  type Res,
} from '@/lib/messages';
import { generatePassword } from '@/lib/password';
import { totp } from '@/lib/totp';
import { DEFAULT_GENERATOR, type LoginEntry, type LoginSuggestion } from '@/lib/types';
import { staging } from './staging';
import { Vault, VaultLockedError } from './vault';

export interface Ctx {
  sender: Browser.runtime.MessageSender;
  /** URL of the sending frame (content scripts only). */
  url: string;
  site: string | null;
  tabId?: number;
  frameId?: number;
}

type Handler<T extends MessageType> = (req: Req<T>, ctx: Ctx) => Promise<Res<T>>;
type Handlers = { [T in MessageType]: Handler<T> };

export function createHandlers(vault: Vault, onActivity: () => void): Handlers {
  const requireUnlocked = async () => {
    if ((await vault.state()) !== 'unlocked') throw new VaultLockedError();
  };

  /** Loads an entry only if it may be used on the sender's frame. */
  const entryForSender = async (id: string, ctx: Ctx): Promise<LoginEntry> => {
    const entry = await vault.get(id);
    if (!entry || !loginMatchesPage(entry.url, ctx.url)) throw new Error('Login does not match this site');
    return entry;
  };

  const saveStaged = async (id: string): Promise<LoginEntry> => {
    const item = (await staging.list()).find((s) => s.id === id);
    if (!item) throw new Error('That staged login has expired');
    const matches = await vault.forSite(item.site);
    const existing =
      (item.prompt?.existingId && matches.find((e) => e.id === item.prompt!.existingId)) ||
      matches.find((e) => e.username === item.username);
    const entry = await vault.upsert(
      existing
        ? { ...existing, password: item.password, username: item.username || existing.username }
        : { title: item.site, url: originOf(item.url), username: item.username, password: item.password },
    );
    await staging.remove(id);
    return entry;
  };

  return {
    // ---------------------------------------------------------------- popup
    'vault:status': async () => ({ state: await vault.state() }),
    'vault:setup': async ({ password }) => {
      await vault.setup(password);
      onActivity();
      return {};
    },
    'vault:unlock': async ({ password }) => {
      await vault.unlock(password);
      onActivity();
      return {};
    },
    'vault:lock': async () => {
      await vault.lock();
      return {};
    },
    'vault:list': async () => ({ entries: await vault.list() }),
    'vault:upsert': async ({ entry }) => ({ entry: await vault.upsert(entry) }),
    'vault:delete': async ({ id }) => {
      await vault.remove(id);
      return {};
    },
    'vault:import': async ({ entries }) => vault.importMany(entries),
    'vault:export': async ({ password }) => {
      await vault.verifyPassword(password);
      return { entries: await vault.list() };
    },
    'vault:change-password': async ({ current, next }) => {
      await vault.changePassword(current, next);
      return {};
    },
    'vault:wipe': async ({ password }) => {
      await vault.wipe(password);
      await staging.clearAll();
      return {};
    },
    'identity:get': async () => ({ identity: await vault.getIdentity() }),
    'identity:set': async ({ identity }) => {
      await vault.setIdentity(identity);
      return {};
    },
    'settings:get': async () => ({ settings: await vault.getSettings() }),
    'settings:set': async ({ settings }) => {
      await vault.setSettings(settings);
      return {};
    },
    'staged:list': async () => ({ items: await staging.list() }),
    'staged:save': async ({ id }) => ({ entry: await saveStaged(id) }),
    'staged:discard': async ({ id }) => {
      await staging.remove(id);
      return {};
    },
    'totp:code': async ({ id }) => {
      const e = await vault.get(id);
      if (!e?.totp) throw new Error('No TOTP secret');
      return totp(e.totp);
    },
    'generator:preview': async ({ options }) => ({ password: generatePassword(options ?? DEFAULT_GENERATOR) }),

    // -------------------------------------------------------------- content
    'fill:query': async (_req, ctx) => {
      const state = await vault.state();
      const empty = { state, logins: [], staged: [], hasIdentity: false, crossSiteFrame: false, site: ctx.site };
      if (!ctx.site) return empty;

      let crossSiteFrame = false;
      if (ctx.frameId && ctx.sender.tab?.url) crossSiteFrame = siteOf(ctx.sender.tab.url) !== ctx.site;

      const staged = (await staging.list())
        .filter((s) => s.site === ctx.site && s.source !== 'submitted')
        .map((s) => ({ id: s.id, source: s.source, createdAt: s.createdAt, username: s.username }))
        .reverse();
      if (state !== 'unlocked') return { ...empty, staged, crossSiteFrame };

      const pending = await staging.getPendingLogin(ctx.site);
      const logins: LoginSuggestion[] = (await vault.forPage(ctx.url))
        .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
        .map((e) => ({
          id: e.id,
          title: e.title,
          username: e.username,
          hasTotp: !!e.totp,
          preferred: !!pending && (pending.entryId === e.id || pending.username === e.username),
        }))
        .sort((a, b) => Number(b.preferred) - Number(a.preferred));
      const hasIdentity = !!(await vault.getIdentity());
      onActivity();
      return { state, logins, staged, hasIdentity, crossSiteFrame, site: ctx.site };
    },

    'fill:credentials': async ({ id }, ctx) => {
      const entry = await entryForSender(id, ctx);
      await vault.touch(id);
      await staging.setPendingLogin(ctx.site!, entry.username, entry.id);
      onActivity();
      return { username: entry.username, password: entry.password };
    },

    'fill:totp': async ({ id }, ctx) => {
      const entry = await entryForSender(id, ctx);
      if (!entry.totp) throw new Error('No TOTP secret for this login');
      return { code: (await totp(entry.totp)).code };
    },

    'fill:identity': async () => {
      await requireUnlocked();
      const identity = await vault.getIdentity();
      if (!identity) throw new Error('No identity saved');
      return { identity };
    },

    'fill:staged': async ({ id }, ctx) => {
      const item = (await staging.list()).find((s) => s.id === id);
      if (!item || item.site !== ctx.site) throw new Error('Staged password not available here');
      return { password: item.password };
    },

    // Generated in the background and staged *before* it reaches the page, so it can't be lost.
    'generator:new': async ({ username }, ctx) => {
      if (!ctx.site) throw new Error('Unsupported page');
      const password = generatePassword(DEFAULT_GENERATOR);
      await staging.add({ site: ctx.site, url: ctx.url, username, password, source: 'generated', tabId: ctx.tabId });
      return { password };
    },

    'stage:typed': async ({ username, password }, ctx) => {
      if (!ctx.site || !password) return {};
      await staging.add(
        { site: ctx.site, url: ctx.url, username, password, source: 'typed', tabId: ctx.tabId },
        { replaceSameSource: true },
      );
      return {};
    },

    'login:step': async ({ username }, ctx) => {
      if (ctx.site && username) await staging.setPendingLogin(ctx.site, username);
      return {};
    },

    'capture:submit': async ({ username, password, newPassword }, ctx) => {
      const site = ctx.site;
      const secret = newPassword || password;
      if (!site || !secret) return {};
      const user = username || (await staging.getPendingLogin(site))?.username || '';

      let action: 'save' | 'update' = 'save';
      let existingId: string | undefined;
      if ((await vault.state()) === 'unlocked') {
        const settings = await vault.getSettings();
        if (settings.neverSaveSites.includes(site)) return {};
        const matches = await vault.forSite(site);
        const same =
          matches.find((e) => e.username === user) ?? (!user && matches.length === 1 ? matches[0] : undefined);
        if (same) {
          if (same.password === secret) {
            await vault.touch(same.id);
            return {};
          }
          action = 'update';
          existingId = same.id;
        }
      }
      await staging.add({
        site,
        url: ctx.url,
        username: user,
        password: secret,
        source: 'submitted',
        tabId: ctx.tabId,
        prompt: { action, existingId, state: 'pending' },
      });
      return {};
    },

    // The prompt is claimed by whichever document of the same site shows up first in the tab:
    // the submitting page (if it stayed) or the page it navigated to.
    'capture:claim-prompt': async ({ docId }, ctx) => {
      const locked = (await vault.state()) !== 'unlocked';
      const item = (await staging.list())
        .reverse()
        .find(
          (s) =>
            s.source === 'submitted' &&
            s.tabId === ctx.tabId &&
            s.site === ctx.site &&
            s.prompt &&
            (s.prompt.state === 'pending' || (s.prompt.state === 'shown' && s.prompt.shownToDoc !== docId)),
        );
      if (!item?.prompt) return { prompt: null };
      await staging.update(item.id, { prompt: { ...item.prompt, state: 'shown', shownToDoc: docId } });
      return {
        prompt: { stagedId: item.id, action: item.prompt.action, site: item.site, username: item.username, locked },
      };
    },

    'capture:respond': async ({ stagedId, action }, ctx) => {
      const item = (await staging.list()).find((s) => s.id === stagedId);
      if (!item || item.site !== ctx.site) return { needsUnlock: false };
      if (action === 'dismiss') {
        // Keep it in the popup's "Unsaved" list until it expires, just stop prompting.
        await staging.update(stagedId, { prompt: { ...item.prompt!, state: 'done' } });
        return { needsUnlock: false };
      }
      if ((await vault.state()) !== 'unlocked') {
        await openPopup();
        return { needsUnlock: true };
      }
      if (action === 'never') {
        const settings = await vault.getSettings();
        await vault.setSettings({ ...settings, neverSaveSites: [...new Set([...settings.neverSaveSites, item.site])] });
        await staging.remove(stagedId);
      } else {
        await saveStaged(stagedId);
      }
      return { needsUnlock: false };
    },

    'ui:open-popup': async () => {
      await openPopup();
      return {};
    },
  };
}

async function openPopup(): Promise<void> {
  try {
    await (browser.action as { openPopup?: () => Promise<void> }).openPopup?.();
  } catch {
    // Not supported / no focused window: the in-page UI tells the user to click the toolbar icon.
  }
}

export function isExtensionPage(sender: Browser.runtime.MessageSender): boolean {
  // Content scripts always report the web page's URL, so an extension-origin URL means popup/tab page.
  return sender.id === browser.runtime.id && !!sender.url?.startsWith(browser.runtime.getURL('/'));
}

export async function dispatch(
  handlers: Handlers,
  msg: Envelope,
  sender: Browser.runtime.MessageSender,
): Promise<Reply<MessageType>> {
  try {
    if (sender.id !== browser.runtime.id) throw new Error('Unknown sender');
    const type = msg?.type;
    if (!type || !(type in handlers)) throw new Error(`Unknown message ${String(type)}`);
    const fromPage = !isExtensionPage(sender);
    if (fromPage && !CONTENT_MESSAGES.has(type)) throw new Error('Not allowed from web content');

    // Trust the browser's view of the frame, never a URL supplied in the payload.
    let url = sender.url ?? '';
    if (!/^https?:/.test(url) && sender.origin && /^https?:/.test(sender.origin)) url = sender.origin + '/';
    const ctx: Ctx = { sender, url, site: fromPage ? siteOf(url) : null, tabId: sender.tab?.id, frameId: sender.frameId };

    const handler = handlers[type] as Handler<MessageType>;
    return { ok: true, data: await handler(msg as never, ctx) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
