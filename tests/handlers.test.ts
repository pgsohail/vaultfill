import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser, type Browser } from 'wxt/browser';
import { createHandlers, dispatch } from '@/background/handlers';
import { Vault } from '@/background/vault';
import type { Envelope, MessageType, Req, Res } from '@/lib/messages';

let vault: Vault;
let handlers: ReturnType<typeof createHandlers>;

const popup = (): Browser.runtime.MessageSender => ({ id: browser.runtime.id, url: browser.runtime.getURL('/popup.html') });
const page = (url: string, tabId = 1, frameId = 0): Browser.runtime.MessageSender => ({
  id: browser.runtime.id,
  url,
  frameId,
  tab: { id: tabId, url } as Browser.tabs.Tab,
});

async function call<T extends MessageType>(sender: Browser.runtime.MessageSender, type: T, req: Req<T>): Promise<Res<T>> {
  const r = await dispatch(handlers, { type, ...req } as Envelope, sender);
  if (!r.ok) throw new Error(r.error);
  return r.data as Res<T>;
}

describe('background message security & flows', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    vault = new Vault(1000);
    handlers = createHandlers(vault, () => undefined);
    await call(popup(), 'vault:setup', { password: 'master-password-1' });
    await call(popup(), 'vault:upsert', {
      entry: { title: 'GitHub', url: 'https://github.com', username: 'alice', password: 'gh-pass' },
    });
  });

  it('refuses vault-management messages from web pages', async () => {
    await expect(call(page('https://evil.com'), 'vault:list', {})).rejects.toThrow('Not allowed');
    await expect(call(page('https://evil.com'), 'vault:export', { password: 'x' })).rejects.toThrow('Not allowed');
  });

  it('only suggests and releases logins for the sender frame site (never passwords in suggestions)', async () => {
    const q = await call(page('https://github.com/login'), 'fill:query', { kind: 'USERNAME' });
    expect(q.logins).toHaveLength(1);
    expect(JSON.stringify(q)).not.toContain('gh-pass');
    const id = q.logins[0].id;
    expect(await call(page('https://github.com/login'), 'fill:credentials', { id })).toEqual({ username: 'alice', password: 'gh-pass' });
    await expect(call(page('https://github.com.evil.io/'), 'fill:credentials', { id })).rejects.toThrow('does not match');
    expect((await call(page('https://evil.com'), 'fill:query', { kind: 'USERNAME' })).logins).toHaveLength(0);
  });

  it('flags cross-site iframes', async () => {
    const sender = { ...page('https://github.com/embed', 1, 3), tab: { id: 1, url: 'https://other.com' } as Browser.tabs.Tab };
    expect((await call(sender, 'fill:query', { kind: 'USERNAME' })).crossSiteFrame).toBe(true);
  });

  it('captures a new login, prompts once per document, and saves it', async () => {
    const p = page('https://example.com/login', 7);
    await call(p, 'capture:submit', { username: 'bob', password: 'bob-pass' });
    const { prompt } = await call(p, 'capture:claim-prompt', { docId: 'doc1' });
    expect(prompt).toMatchObject({ action: 'save', site: 'example.com', username: 'bob' });
    expect((await call(p, 'capture:claim-prompt', { docId: 'doc1' })).prompt).toBeNull();
    // The page navigated after showing it: the next document may show it again.
    expect((await call(p, 'capture:claim-prompt', { docId: 'doc2' })).prompt).not.toBeNull();
    await call(p, 'capture:respond', { stagedId: prompt!.stagedId, action: 'save' });
    const { entries } = await call(popup(), 'vault:list', {});
    expect(entries.find((e) => e.username === 'bob')?.password).toBe('bob-pass');
  });

  it('offers update when the password changed, nothing when unchanged', async () => {
    const p = page('https://github.com/login', 2);
    await call(p, 'capture:submit', { username: 'alice', password: 'gh-pass' });
    expect((await call(p, 'capture:claim-prompt', { docId: 'd' })).prompt).toBeNull();
    await call(p, 'capture:submit', { username: 'alice', password: 'gh-pass-2' });
    expect((await call(p, 'capture:claim-prompt', { docId: 'd' })).prompt?.action).toBe('update');
  });

  it('links a split (two-step) login: username on step 1, password on step 2', async () => {
    const p = page('https://accounts.example.org/identifier', 3);
    await call(p, 'login:step', { username: 'carol@example.org' });
    const p2 = page('https://login.example.org/password', 3);
    await call(p2, 'capture:submit', { username: '', password: 'carol-pass' });
    expect((await call(p2, 'capture:claim-prompt', { docId: 'x' })).prompt?.username).toBe('carol@example.org');
  });

  it('stages generated passwords before they reach the page and keeps them while locked', async () => {
    const p = page('https://newsite.com/signup', 4);
    const { password } = await call(p, 'generator:new', { username: 'dave' });
    await call(popup(), 'vault:lock', {});
    const q = await call(p, 'fill:query', { kind: 'PASSWORD_NEW' });
    expect(q.state).toBe('locked');
    expect(q.staged).toHaveLength(1);
    expect((await call(p, 'fill:staged', { id: q.staged[0].id })).password).toBe(password);
    await expect(call(page('https://other.com'), 'fill:staged', { id: q.staged[0].id })).rejects.toThrow();
    // Submitting while locked still stages it for saving after unlock.
    await call(p, 'capture:submit', { username: 'dave', password: '', newPassword: password });
    const { prompt } = await call(p, 'capture:claim-prompt', { docId: 'z' });
    expect(prompt?.locked).toBe(true);
    expect((await call(p, 'capture:respond', { stagedId: prompt!.stagedId, action: 'save' })).needsUnlock).toBe(true);
    await call(popup(), 'vault:unlock', { password: 'master-password-1' });
    await call(popup(), 'staged:save', { id: prompt!.stagedId });
    const { entries } = await call(popup(), 'vault:list', {});
    expect(entries.find((e) => e.username === 'dave')?.password).toBe(password);
  });

  it('respects "never for this site"', async () => {
    const p = page('https://nosave.com', 5);
    await call(p, 'capture:submit', { username: 'e', password: 'x' });
    const { prompt } = await call(p, 'capture:claim-prompt', { docId: 'a' });
    await call(p, 'capture:respond', { stagedId: prompt!.stagedId, action: 'never' });
    await call(p, 'capture:submit', { username: 'e', password: 'y' });
    expect((await call(p, 'capture:claim-prompt', { docId: 'b' })).prompt).toBeNull();
  });

  it('requires the master password to export', async () => {
    await expect(call(popup(), 'vault:export', { password: 'wrong-password' })).rejects.toThrow();
    expect((await call(popup(), 'vault:export', { password: 'master-password-1' })).entries).toHaveLength(1);
  });
});
