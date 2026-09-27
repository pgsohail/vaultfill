import { browser } from 'wxt/browser';
import { createHandlers, dispatch } from '@/background/handlers';
import { staging } from '@/background/staging';
import { Vault } from '@/background/vault';
import type { Envelope, TabMessage } from '@/lib/messages';

const TICK = 'vaultfill:tick';
const ACTIVITY = 'lastActivity';

export default defineBackground(() => {
  const vault = new Vault();

  // Session storage must never be readable from content scripts.
  void browser.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });

  const touchActivity = () => void browser.storage.session.set({ [ACTIVITY]: Date.now() });
  const handlers = createHandlers(vault, touchActivity);

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    dispatch(handlers, msg as Envelope, sender).then(sendResponse);
    return true;
  });

  // Auto-lock on inactivity and prune expired staged credentials.
  void browser.alarms.create(TICK, { periodInMinutes: 0.5 });
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== TICK) return;
    await staging.prune();
    if ((await vault.state()) !== 'unlocked') return;
    const { autoLockMinutes } = await vault.getSettings();
    const r = await browser.storage.session.get(ACTIVITY);
    const last = (r[ACTIVITY] as number | undefined) ?? 0;
    if (autoLockMinutes > 0 && Date.now() - last > autoLockMinutes * 60_000) await vault.lock();
  });

  browser.idle.setDetectionInterval(60);
  browser.idle.onStateChanged.addListener(async (state) => {
    if (state !== 'locked' || (await vault.state()) !== 'unlocked') return;
    if ((await vault.getSettings()).lockOnSystemLock) await vault.lock();
  });

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'cycle-account') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    const msg: TabMessage = { type: 'cmd:cycle' };
    // Broadcast to every frame; only the one holding focus acts on it.
    browser.tabs.sendMessage(tab.id, msg).catch(() => undefined);
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.tabs.create({ url: `${browser.runtime.getURL('/popup.html')}?welcome=1` });
  });
});
