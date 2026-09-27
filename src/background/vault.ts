import { browser } from 'wxt/browser';
import {
  PBKDF2_ITERATIONS,
  decryptJSON,
  deriveRawKey,
  encryptJSON,
  fromB64,
  importAesKey,
  randomBytes,
  toB64,
  type EncryptedBlob,
} from '@/lib/crypto';
import { loginMatchesPage, normalizeUrl, siteOf } from '@/lib/domain';
import {
  DEFAULT_SETTINGS,
  type Identity,
  type ImportedLogin,
  type LoginDraft,
  type LoginEntry,
  type VaultSettings,
  type VaultState,
} from '@/lib/types';

const VAULT_KEY = 'vault';
/** Raw vault key lives only in chrome.storage.session: RAM-only, trusted contexts only. */
const SESSION_KEY = 'vaultKey';
const VERIFIER = 'vaultfill-verifier-v1';
const HISTORY_LIMIT = 10;

interface VaultFile {
  version: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  verifier: EncryptedBlob;
  settings: EncryptedBlob;
  identity?: EncryptedBlob;
  entries: Record<string, EncryptedBlob>;
}

const aad = {
  verifier: 'vaultfill:v1:verifier',
  settings: 'vaultfill:v1:settings',
  identity: 'vaultfill:v1:identity',
  entry: (id: string) => `vaultfill:v1:entry:${id}`,
};

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked');
  }
}

export class Vault {
  private key: CryptoKey | null = null;
  private entries: Map<string, LoginEntry> | null = null;
  private settings: VaultSettings | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly iterations = PBKDF2_ITERATIONS) {}

  /** Serialises read-modify-write cycles on the vault file. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async readFile(): Promise<VaultFile | null> {
    const r = await browser.storage.local.get(VAULT_KEY);
    return (r[VAULT_KEY] as VaultFile | undefined) ?? null;
  }

  private async writeFile(file: VaultFile): Promise<void> {
    await browser.storage.local.set({ [VAULT_KEY]: file });
  }

  async state(): Promise<VaultState> {
    if (!(await this.readFile())) return 'uninitialized';
    return (await this.restoreKey()) ? 'unlocked' : 'locked';
  }

  /** The service worker can be killed at any time; recover the key from session RAM. */
  private async restoreKey(): Promise<CryptoKey | null> {
    if (this.key) return this.key;
    const s = await browser.storage.session.get(SESSION_KEY);
    const raw = s[SESSION_KEY] as string | undefined;
    if (!raw) return null;
    this.key = await importAesKey(fromB64(raw));
    return this.key;
  }

  private async requireKey(): Promise<CryptoKey> {
    const k = await this.restoreKey();
    if (!k) throw new VaultLockedError();
    return k;
  }

  private async openSession(raw: Uint8Array<ArrayBuffer>): Promise<void> {
    this.key = await importAesKey(raw);
    this.entries = null;
    this.settings = null;
    await browser.storage.session.set({ [SESSION_KEY]: toB64(raw) });
    raw.fill(0);
  }

  async setup(password: string): Promise<void> {
    if (password.length < 8) throw new Error('Master password must be at least 8 characters');
    return this.serial(async () => {
      if (await this.readFile()) throw new Error('Vault already exists');
      const salt = randomBytes(16);
      const raw = await deriveRawKey(password, salt, this.iterations);
      const key = await importAesKey(raw);
      await this.writeFile({
        version: 1,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: this.iterations, salt: toB64(salt) },
        verifier: await encryptJSON(key, VERIFIER, aad.verifier),
        settings: await encryptJSON(key, DEFAULT_SETTINGS, aad.settings),
        entries: {},
      });
      await this.openSession(raw);
    });
  }

  private async deriveAndVerify(file: VaultFile, password: string): Promise<Uint8Array<ArrayBuffer>> {
    const raw = await deriveRawKey(password, fromB64(file.kdf.salt), file.kdf.iterations);
    try {
      const check = await decryptJSON<string>(await importAesKey(raw), file.verifier, aad.verifier);
      if (check !== VERIFIER) throw new Error();
    } catch {
      raw.fill(0);
      throw new Error('Incorrect master password');
    }
    return raw;
  }

  async unlock(password: string): Promise<void> {
    const file = await this.readFile();
    if (!file) throw new Error('No vault. Create one first.');
    await this.openSession(await this.deriveAndVerify(file, password));
  }

  async verifyPassword(password: string): Promise<void> {
    const file = await this.readFile();
    if (!file) throw new Error('No vault');
    (await this.deriveAndVerify(file, password)).fill(0);
  }

  async lock(): Promise<void> {
    this.key = null;
    this.entries = null;
    this.settings = null;
    await browser.storage.session.remove(SESSION_KEY);
  }

  private async loadEntries(): Promise<Map<string, LoginEntry>> {
    const key = await this.requireKey();
    if (this.entries) return this.entries;
    const file = await this.readFile();
    const map = new Map<string, LoginEntry>();
    for (const [id, blob] of Object.entries(file?.entries ?? {})) {
      map.set(id, await decryptJSON<LoginEntry>(key, blob, aad.entry(id)));
    }
    this.entries = map;
    return map;
  }

  async list(): Promise<LoginEntry[]> {
    return [...(await this.loadEntries()).values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  async get(id: string): Promise<LoginEntry | undefined> {
    return (await this.loadEntries()).get(id);
  }

  /** Logins whose registrable domain matches the page (and that are safe to offer there). */
  async forPage(pageUrl: string): Promise<LoginEntry[]> {
    return (await this.list()).filter((e) => loginMatchesPage(e.url, pageUrl));
  }

  async forSite(site: string): Promise<LoginEntry[]> {
    return (await this.list()).filter((e) => siteOf(normalizeUrl(e.url)) === site);
  }

  private async persistEntries(changed: LoginEntry[], removed: string[] = []): Promise<void> {
    const key = await this.requireKey();
    const file = await this.readFile();
    if (!file) throw new Error('No vault');
    const entries = await this.loadEntries();
    for (const e of changed) {
      file.entries[e.id] = await encryptJSON(key, e, aad.entry(e.id));
      entries.set(e.id, e);
    }
    for (const id of removed) {
      delete file.entries[id];
      entries.delete(id);
    }
    await this.writeFile(file);
  }

  private merge(existing: LoginEntry | undefined, draft: LoginDraft, now: number): LoginEntry {
    const history = [...(existing?.passwordHistory ?? [])];
    if (existing && existing.password && existing.password !== draft.password) {
      history.unshift({ password: existing.password, changedAt: now });
    }
    return {
      id: existing?.id ?? draft.id ?? crypto.randomUUID(),
      title: draft.title.trim() || siteOf(normalizeUrl(draft.url)) || 'Untitled',
      url: normalizeUrl(draft.url),
      username: draft.username,
      password: draft.password,
      totp: draft.totp?.trim() || undefined,
      notes: draft.notes || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastUsedAt: existing?.lastUsedAt,
      passwordHistory: history.slice(0, HISTORY_LIMIT),
    };
  }

  upsert(draft: LoginDraft): Promise<LoginEntry> {
    return this.serial(async () => {
      const existing = draft.id ? await this.get(draft.id) : undefined;
      const entry = this.merge(existing, draft, Date.now());
      await this.persistEntries([entry]);
      return entry;
    });
  }

  touch(id: string): Promise<void> {
    return this.serial(async () => {
      const e = await this.get(id);
      if (e) await this.persistEntries([{ ...e, lastUsedAt: Date.now() }]);
    });
  }

  remove(id: string): Promise<void> {
    return this.serial(() => this.persistEntries([], [id]));
  }

  importMany(items: ImportedLogin[]): Promise<{ added: number; updated: number; skipped: number }> {
    return this.serial(async () => {
      const now = Date.now();
      const all = await this.list();
      const changed: LoginEntry[] = [];
      let added = 0;
      let updated = 0;
      let skipped = 0;
      for (const item of items) {
        const site = siteOf(normalizeUrl(item.url));
        const dup = [...all, ...changed].find(
          (e) => siteOf(e.url) === site && e.username === item.username,
        );
        if (dup && dup.password === item.password) {
          skipped++;
          continue;
        }
        const merged = this.merge(dup, { ...item, id: dup?.id }, now);
        const i = changed.findIndex((c) => c.id === merged.id);
        if (i >= 0) changed[i] = merged;
        else changed.push(merged);
        if (dup) updated++;
        else added++;
      }
      await this.persistEntries(changed);
      return { added, updated, skipped };
    });
  }

  async getSettings(): Promise<VaultSettings> {
    const key = await this.requireKey();
    if (this.settings) return this.settings;
    const file = await this.readFile();
    this.settings = file
      ? { ...DEFAULT_SETTINGS, ...(await decryptJSON<VaultSettings>(key, file.settings, aad.settings)) }
      : { ...DEFAULT_SETTINGS };
    return this.settings;
  }

  setSettings(settings: VaultSettings): Promise<void> {
    return this.serial(async () => {
      const key = await this.requireKey();
      const file = await this.readFile();
      if (!file) throw new Error('No vault');
      file.settings = await encryptJSON(key, settings, aad.settings);
      await this.writeFile(file);
      this.settings = settings;
    });
  }

  async getIdentity(): Promise<Identity | null> {
    const key = await this.requireKey();
    const file = await this.readFile();
    return file?.identity ? decryptJSON<Identity>(key, file.identity, aad.identity) : null;
  }

  setIdentity(identity: Identity): Promise<void> {
    return this.serial(async () => {
      const key = await this.requireKey();
      const file = await this.readFile();
      if (!file) throw new Error('No vault');
      file.identity = await encryptJSON(key, identity, aad.identity);
      await this.writeFile(file);
    });
  }

  /** Re-derives with a new salt and re-encrypts every record. */
  changePassword(current: string, next: string): Promise<void> {
    if (next.length < 8) throw new Error('Master password must be at least 8 characters');
    return this.serial(async () => {
      const file = await this.readFile();
      if (!file) throw new Error('No vault');
      (await this.deriveAndVerify(file, current)).fill(0);
      const entries = await this.list();
      const settings = await this.getSettings();
      const identity = await this.getIdentity();

      const salt = randomBytes(16);
      const raw = await deriveRawKey(next, salt, this.iterations);
      const key = await importAesKey(raw);
      const out: VaultFile = {
        version: 1,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: this.iterations, salt: toB64(salt) },
        verifier: await encryptJSON(key, VERIFIER, aad.verifier),
        settings: await encryptJSON(key, settings, aad.settings),
        identity: identity ? await encryptJSON(key, identity, aad.identity) : undefined,
        entries: {},
      };
      for (const e of entries) out.entries[e.id] = await encryptJSON(key, e, aad.entry(e.id));
      await this.writeFile(out);
      await this.openSession(raw);
    });
  }

  async wipe(password: string): Promise<void> {
    await this.verifyPassword(password);
    await this.lock();
    await browser.storage.local.remove(VAULT_KEY);
  }
}
