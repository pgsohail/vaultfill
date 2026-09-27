import { send, type Res, type TabMessage } from '@/lib/messages';
import type { Identity } from '@/lib/types';
import { browser } from 'wxt/browser';
import { CaptureEngine } from './capture';
import { deepActiveElement, eventTarget, isCandidateField, type FieldElement } from './dom';
import { fillField, fillOtp } from './fill';
import {
  IDENTITY_KINDS,
  LOGIN_KINDS,
  analyzeField,
  analyzeGroup,
  fieldsOfKind,
  groupRootOf,
  type AnalyzedField,
  type GroupAnalysis,
} from './groups';
import { PageScanner } from './scanner';
import { NoticeLayer, SuggestionMenu, type MenuItem } from './ui';
import { isFillable } from './visibility';

type Query = Res<'fill:query'>;

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60_000);
  return m < 1 ? 'just now' : `${m} min ago`;
}

function identityValue(id: Identity, key: keyof Identity | undefined): string {
  if (!key) return '';
  if (key === 'fullName') return id.fullName || [id.givenName, id.familyName].filter(Boolean).join(' ');
  if (key === 'givenName') return id.givenName || id.fullName.split(' ')[0] || '';
  if (key === 'familyName') return id.familyName || id.fullName.split(' ').slice(1).join(' ');
  return id[key];
}

export class Agent {
  // crypto.randomUUID is missing on insecure (http://) pages; getRandomValues is not.
  private readonly docId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  private readonly menu = new SuggestionMenu();
  private readonly notice = new NoticeLayer();
  private readonly capture: CaptureEngine;
  private readonly scanner: PageScanner;
  private suppressUntil = 0;
  private dismissed = new WeakSet<Element>();
  private cycle = { index: -1, at: 0 };
  private offerSeq = 0;
  private pendingOffer: FieldElement | null = null;

  constructor(private readonly signal: AbortSignal) {
    this.capture = new CaptureEngine(signal, () => this.claimPromptSoon(1500));
    this.scanner = new PageScanner(
      () => this.onRescan(),
      (root) => this.capture.watchShadowRoot(root),
      signal,
    );
  }

  start(): void {
    const opts = { capture: true, signal: this.signal };
    window.addEventListener('focusin', (e) => this.onFocus(e), opts);
    window.addEventListener('pointerdown', (e) => this.onPointer(e), opts);
    window.addEventListener('focusout', () => this.onBlur(), opts);
    window.addEventListener('keydown', (e) => this.onKey(e), opts);

    const onMessage = (msg: unknown) => {
      if ((msg as TabMessage)?.type === 'cmd:cycle') void this.cycleAccounts();
    };
    browser.runtime.onMessage.addListener(onMessage);
    this.signal.addEventListener('abort', () => {
      browser.runtime.onMessage.removeListener(onMessage);
      this.menu.destroy();
      this.notice.destroy();
    });

    this.capture.start();
    this.scanner.start();
    // A login submitted on the previous page may be waiting for a save prompt.
    this.claimPromptSoon(window.top === window ? 400 : 1200);
  }

  // ------------------------------------------------------------------ triggers

  private onFocus(e: FocusEvent) {
    const el = eventTarget(e);
    if (isCandidateField(el) && e.isTrusted) void this.offer(el);
  }

  private onPointer(e: PointerEvent) {
    const el = eventTarget(e);
    // Clicking a field that already has focus (e.g. after Escape) reopens the menu.
    if (isCandidateField(el) && e.isTrusted && deepActiveElement() === el && !this.menu.open) {
      this.dismissed.delete(el);
      void this.offer(el);
    }
  }

  private onBlur() {
    setTimeout(() => {
      if (this.menu.anchor && deepActiveElement() !== this.menu.anchor) this.menu.hide();
    }, 150);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.menu.open || eventTarget(e) !== this.menu.anchor) return;
    if (this.menu.handleKey(e)) {
      if (e.key === 'Escape') this.dismissed.add(this.menu.anchor ?? document.body);
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /** After a rescan, offer on a field that got focus before it existed/was classifiable (autofocus). */
  private onRescan() {
    const active = deepActiveElement();
    if (isCandidateField(active) && !this.menu.open && document.hasFocus()) void this.offer(active);
  }

  // --------------------------------------------------------------------- offer

  private async query(kind: AnalyzedField['kind']): Promise<Query | null> {
    try {
      return await send('fill:query', { kind });
    } catch {
      return null; // extension reloaded / unsupported frame
    }
  }

  private async offer(el: FieldElement) {
    if (performance.now() < this.suppressUntil || this.dismissed.has(el)) return;
    // Focus, pointer and rescan can all ask for the same field; never re-render an open menu
    // under the user's keyboard selection.
    if (this.menu.anchor === el || this.pendingOffer === el) return;
    const seq = ++this.offerSeq;
    const { group, field } = analyzeField(el);
    if (field.kind === 'UNKNOWN' || !isFillable(el)) return;

    this.pendingOffer = el;
    const q = await this.query(field.kind).finally(() => {
      if (this.pendingOffer === el) this.pendingOffer = null;
    });
    if (!q || seq !== this.offerSeq || deepActiveElement() !== el || this.menu.anchor === el) return;

    const items = this.buildItems(el, field, group, q);
    if (!items.length) return;
    const warning = q.crossSiteFrame
      ? `Embedded from ${q.site} inside another site. Only fill if you expected this.`
      : undefined;
    this.menu.show(el, q.site ?? '', items, {
      warning,
      cycleHint: LOGIN_KINDS.includes(field.kind) && q.logins.length > 1,
    });
  }

  private buildItems(el: FieldElement, field: AnalyzedField, group: GroupAnalysis, q: Query): MenuItem[] {
    const items: MenuItem[] = [];
    const unlock: MenuItem = {
      icon: 'lock',
      label: 'Unlock VaultFill',
      sub: 'to use your saved logins',
      run: () => this.openPopup(),
    };

    switch (field.kind) {
      case 'USERNAME':
      case 'PASSWORD_CURRENT':
        if (q.state === 'locked') return [unlock];
        for (const l of q.logins) {
          items.push({
            avatarOf: l.title,
            label: l.preferred ? `Continue as ${l.username || l.title}` : l.title,
            sub: l.preferred ? l.title : l.username || 'No username',
            run: () => this.fillLogin(l.id, el),
          });
        }
        break;

      case 'PASSWORD_NEW':
        items.push({
          icon: 'spark',
          label: 'Suggest strong password',
          sub: 'Saved to your vault automatically',
          run: () => this.fillGenerated(el, group),
        });
        for (const s of q.staged) {
          items.push({
            icon: 'history',
            label: `Reuse password from ${ago(s.createdAt)}`,
            sub: s.source === 'generated' ? 'Generated earlier' : 'Typed earlier',
            run: () => this.fillStaged(s.id, el, group),
          });
        }
        break;

      case 'TOTP_CODE':
        if (q.state === 'locked') return [unlock];
        for (const l of q.logins.filter((x) => x.hasTotp)) {
          items.push({
            icon: 'hash',
            label: 'Fill verification code',
            sub: l.username || l.title,
            run: () => this.fillTotp(l.id, el as HTMLInputElement, group),
          });
        }
        break;

      default:
        if (IDENTITY_KINDS.includes(field.kind) && q.state === 'unlocked' && q.hasIdentity) {
          items.push({
            icon: 'user',
            label: 'Fill my details',
            sub: 'Name, email, phone and address',
            run: () => this.fillIdentity(group),
          });
        }
    }
    return items;
  }

  // ---------------------------------------------------------------------- fill

  private async withSuppressedFocus(fn: () => Promise<void>) {
    this.suppressUntil = performance.now() + 60_000;
    try {
      await fn();
    } finally {
      this.suppressUntil = performance.now() + 400;
    }
  }

  /** The fields to fill with a login: never invisible/occluded companions. */
  private loginTargets(anchor: FieldElement, group: GroupAnalysis) {
    const ok = (f: AnalyzedField) => f.el === anchor || isFillable(f.el, { companion: true });
    const passwords = fieldsOfKind(group, 'PASSWORD_CURRENT').filter(ok);
    const users = fieldsOfKind(group, 'USERNAME').filter(ok);
    const firstPwIdx = passwords[0] ? group.fields.indexOf(passwords[0]) : Infinity;
    // Prefer the username field right before the password (skips e.g. newsletter boxes).
    const user =
      users.find((u) => u.el === anchor) ??
      [...users].reverse().find((u) => group.fields.indexOf(u) < firstPwIdx) ??
      (passwords.length ? undefined : users[0]);
    const password = passwords.find((p) => p.el === anchor) ?? passwords[0];
    return { user, password };
  }

  private async fillLogin(id: string, anchor: FieldElement) {
    let creds: { username: string; password: string };
    try {
      creds = await send('fill:credentials', { id });
    } catch (e) {
      this.notice.toast((e as Error).message);
      return;
    }
    const group = analyzeGroup(groupRootOf(anchor));
    const { user, password } = this.loginTargets(anchor, group);
    await this.withSuppressedFocus(async () => {
      if (user && creds.username && user.el.value !== creds.username) {
        await fillField(user.el, creds.username, { blur: !!password });
      }
      if (password) await fillField(password.el, creds.password, { blur: false });
      (password ?? user)?.el.focus({ preventScroll: true });
    });
  }

  private async fillGenerated(anchor: FieldElement, group: GroupAnalysis) {
    const username = fieldsOfKind(group, 'USERNAME', 'EMAIL')[0]?.el.value ?? '';
    const { password } = await send('generator:new', { username });
    await this.fillNewPassword(anchor, group, password);
    this.notice.toast('Strong password added · kept safe until you save');
  }

  private async fillStaged(id: string, anchor: FieldElement, group: GroupAnalysis) {
    const { password } = await send('fill:staged', { id });
    await this.fillNewPassword(anchor, group, password);
  }

  private async fillNewPassword(anchor: FieldElement | undefined, group: GroupAnalysis, password: string) {
    // New password + confirmation box.
    const targets = fieldsOfKind(group, 'PASSWORD_NEW').filter((f) => f.el === anchor || isFillable(f.el, { companion: true }));
    await this.withSuppressedFocus(async () => {
      for (const t of targets) await fillField(t.el, password, { blur: false });
      anchor?.focus({ preventScroll: true });
    });
  }

  private async fillTotp(id: string, anchor: HTMLInputElement, group: GroupAnalysis) {
    const { code } = await send('fill:totp', { id });
    await this.withSuppressedFocus(() => fillOtp(anchor, code, group.fields.map((f) => f.el)));
  }

  private async fillIdentity(group: GroupAnalysis) {
    const { identity } = await send('fill:identity', {});
    await this.withSuppressedFocus(async () => {
      for (const f of group.fields) {
        if (!IDENTITY_KINDS.includes(f.kind) || !isFillable(f.el, { companion: true })) continue;
        const v = identityValue(identity, f.identityKey);
        if (v && !f.el.value) await fillField(f.el, v);
      }
    });
  }

  // ------------------------------------------------------------ keyboard cycle

  /** Alt+A: fill the first account, then each press cycles to the next one. */
  private async cycleAccounts() {
    if (!document.hasFocus()) return;
    let anchor = deepActiveElement();
    if (!isCandidateField(anchor) || !LOGIN_KINDS.includes(analyzeField(anchor).field.kind)) {
      const first = [...document.querySelectorAll('input')].find((i) => {
        if (!isCandidateField(i) || !isFillable(i)) return false;
        return LOGIN_KINDS.includes(analyzeField(i).field.kind);
      });
      anchor = first ?? null;
    }
    if (!isCandidateField(anchor)) return;
    const q = await this.query('USERNAME');
    if (!q) return;
    if (q.state !== 'unlocked') {
      this.notice.toast('VaultFill is locked · click the toolbar icon');
      void this.openPopup();
      return;
    }
    if (!q.logins.length) {
      this.notice.toast(`No saved logins for ${q.site ?? 'this site'}`);
      return;
    }
    const fresh = Date.now() - this.cycle.at < 30_000;
    this.cycle = { index: fresh ? (this.cycle.index + 1) % q.logins.length : 0, at: Date.now() };
    const login = q.logins[this.cycle.index];
    this.menu.hide();
    await this.fillLogin(login.id, anchor);
    this.notice.toast(`${login.username || login.title} · ${this.cycle.index + 1} of ${q.logins.length}`, 2000);
  }

  // -------------------------------------------------------------- save prompt

  private claimTimer = 0;
  private claimPromptSoon(ms: number) {
    clearTimeout(this.claimTimer);
    this.claimTimer = window.setTimeout(() => void this.claimPrompt(), ms);
  }

  private async claimPrompt() {
    let prompt: Res<'capture:claim-prompt'>['prompt'];
    try {
      ({ prompt } = await send('capture:claim-prompt', { docId: this.docId }));
    } catch {
      return;
    }
    if (!prompt) return;
    const title = prompt.action === 'update' ? 'Update password?' : 'Save password?';
    const body = [prompt.site, prompt.username].filter(Boolean).join(' · ');
    const respond = async (action: 'save' | 'never' | 'dismiss') => {
      const { needsUnlock } = await send('capture:respond', { stagedId: prompt!.stagedId, action });
      if (needsUnlock) this.notice.toast('Unlock VaultFill, then save it from the Unsaved tab', 5000);
      else if (action === 'save') this.notice.toast(prompt!.action === 'update' ? 'Password updated' : 'Saved to VaultFill');
    };
    this.notice.prompt(
      title,
      body,
      [
        { label: 'Never', run: () => respond('never') },
        { label: prompt.locked ? 'Unlock & save' : prompt.action === 'update' ? 'Update' : 'Save', primary: true, run: () => respond('save') },
      ],
      () => void respond('dismiss'),
    );
  }

  private async openPopup() {
    await send('ui:open-popup', {}).catch(() => undefined);
    this.notice.toast('Click the VaultFill icon in your toolbar to unlock', 4000);
  }
}
