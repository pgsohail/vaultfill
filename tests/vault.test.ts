import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import { Vault } from '@/background/vault';

const ITER = 1000; // fast for tests; production uses 600,000

describe('Vault', () => {
  beforeEach(() => fakeBrowser.reset());

  it('sets up, locks and unlocks; rejects the wrong password', async () => {
    const v = new Vault(ITER);
    expect(await v.state()).toBe('uninitialized');
    await v.setup('master-password-1');
    expect(await v.state()).toBe('unlocked');
    await v.lock();
    expect(await v.state()).toBe('locked');
    await expect(v.unlock('nope-nope-nope')).rejects.toThrow('Incorrect master password');
    await v.unlock('master-password-1');
    expect(await v.state()).toBe('unlocked');
  });

  it('stores nothing in plaintext on disk', async () => {
    const v = new Vault(ITER);
    await v.setup('master-password-1');
    await v.upsert({ title: 'GitHub', url: 'https://github.com', username: 'alice@example.com', password: 'hunter2-SECRET' });
    const disk = JSON.stringify(await browser.storage.local.get(null));
    expect(disk).not.toContain('hunter2-SECRET');
    expect(disk).not.toContain('alice@example.com');
    expect(disk).not.toContain('github');
  });

  it('survives a service-worker restart via session RAM, and forgets on lock', async () => {
    const a = new Vault(ITER);
    await a.setup('master-password-1');
    await a.upsert({ title: 'X', url: 'x.com', username: 'u', password: 'p' });
    const b = new Vault(ITER); // simulates a fresh worker
    expect((await b.list()).map((e) => e.username)).toEqual(['u']);
    await b.lock();
    await expect(new Vault(ITER).list()).rejects.toThrow('locked');
  });

  it('keeps password history on change and matches by site', async () => {
    const v = new Vault(ITER);
    await v.setup('master-password-1');
    const e = await v.upsert({ title: 'G', url: 'https://github.com', username: 'u', password: 'one' });
    const e2 = await v.upsert({ ...e, password: 'two' });
    expect(e2.passwordHistory?.[0].password).toBe('one');
    expect(await v.forPage('https://gist.github.com/login')).toHaveLength(1);
    expect(await v.forPage('https://github.com.evil.io/login')).toHaveLength(0);
  });

  it('re-encrypts everything on master password change', async () => {
    const v = new Vault(ITER);
    await v.setup('master-password-1');
    await v.upsert({ title: 'G', url: 'github.com', username: 'u', password: 'p' });
    await v.changePassword('master-password-1', 'master-password-2');
    await v.lock();
    await expect(v.unlock('master-password-1')).rejects.toThrow();
    await v.unlock('master-password-2');
    expect((await v.list())[0].password).toBe('p');
  });

  it('imports with de-duplication', async () => {
    const v = new Vault(ITER);
    await v.setup('master-password-1');
    const r1 = await v.importMany([
      { title: 'A', url: 'https://a.com', username: 'u', password: '1' },
      { title: 'A', url: 'https://www.a.com', username: 'u', password: '1' },
      { title: 'B', url: 'https://b.com', username: 'u', password: '1' },
    ]);
    expect(r1).toEqual({ added: 2, updated: 0, skipped: 1 });
    const r2 = await v.importMany([{ title: 'A', url: 'https://a.com', username: 'u', password: '2' }]);
    expect(r2).toEqual({ added: 0, updated: 1, skipped: 0 });
  });
});
