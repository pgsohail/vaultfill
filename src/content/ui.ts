import { autoUpdate, computePosition, flip, hide, offset, shift, size } from '@floating-ui/dom';

/**
 * In-page UI rendered inside a *closed* shadow root on a neutral host element, so page CSS
 * can't restyle it and page scripts can't read it. The host is promoted to the top layer
 * with the Popover API so it also appears above modal <dialog> logins.
 */

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
.theme {
  --bg: #ffffff; --surface: #f5f5f6; --hover: #f1f1f3; --line: #e8e8eb; --ink: #0b0b0c; --muted: #6c6c74; --faint: #a3a3ab;
  --accent: #6d5dfc; --accent-soft: #efedff; --warn: #b4540a; --warn-soft: #fff5e8;
  --shadow: 0 12px 32px -8px rgb(0 0 0 / .18), 0 2px 6px rgb(0 0 0 / .05), 0 0 0 1px var(--line);
  color: var(--ink); font-size: 13px; line-height: 1.35;
}
@media (prefers-color-scheme: dark) {
  .theme {
    --bg: #16161a; --surface: #1d1d22; --hover: #222228; --line: #2a2a31; --ink: #f2f2f4; --muted: #8d8d96; --faint: #5c5c65;
    --accent: #8b7eff; --accent-soft: #252146; --warn: #ffb35c; --warn-soft: #2d2217;
    --shadow: 0 16px 40px -8px rgb(0 0 0 / .6), 0 0 0 1px var(--line);
  }
}

/* suggestion menu */
.menu { position: fixed; top: 0; left: 0; width: 280px; max-height: 320px; overflow-y: auto; background: var(--bg); border-radius: 14px; box-shadow: var(--shadow); padding: 6px; animation: pop .14s cubic-bezier(.2,.9,.3,1.2); }
.head { display: flex; align-items: center; gap: 7px; padding: 6px 8px 8px; color: var(--muted); font-size: 11.5px; }
.mark { width: 16px; height: 16px; border-radius: 5px; background: var(--accent); display: grid; place-items: center; flex: none; }
.mark svg { width: 9px; height: 9px; fill: #fff; }
.site { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warn { margin: 0 2px 6px; padding: 7px 9px; border-radius: 9px; background: var(--warn-soft); color: var(--warn); font-size: 11.5px; }
.item { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; border-radius: 10px; cursor: pointer; }
.item[aria-selected="true"] { background: var(--hover); }
.item .enter { margin-left: auto; color: var(--faint); font-size: 11px; opacity: 0; }
.item[aria-selected="true"] .enter { opacity: 1; }
.ava { width: 30px; height: 30px; border-radius: 9px; flex: none; display: grid; place-items: center; font-weight: 600; font-size: 13px;
  background: hsl(var(--h) 85% 95%); color: hsl(var(--h) 55% 40%); }
.ico { width: 30px; height: 30px; border-radius: 9px; flex: none; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
.ico svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
@media (prefers-color-scheme: dark) { .ava { background: hsl(var(--h) 35% 17%); color: hsl(var(--h) 80% 75%); } }
.text { min-width: 0; flex: 1; }
.label { font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { color: var(--muted); font-size: 12px; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.foot { display: flex; gap: 10px; padding: 8px 8px 4px; margin-top: 4px; border-top: 1px solid var(--line); color: var(--faint); font-size: 11px; }
kbd { font: 10.5px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 0 4px; border-radius: 4px; background: var(--surface); color: var(--muted); border: 1px solid var(--line); margin-right: 3px; }

/* save prompt */
.card { position: fixed; top: 16px; right: 16px; width: 320px; background: var(--bg); border-radius: 16px; box-shadow: var(--shadow); padding: 14px; animation: slide .22s cubic-bezier(.2,.9,.3,1); }
.card-top { display: flex; gap: 11px; align-items: flex-start; }
.card-title { font-size: 13.5px; font-weight: 600; }
.card-body { color: var(--muted); font-size: 12px; margin-top: 2px; word-break: break-word; }
.x { all: unset; margin-left: auto; width: 24px; height: 24px; border-radius: 7px; display: grid; place-items: center; color: var(--faint); cursor: pointer; flex: none; }
.x:hover { background: var(--hover); color: var(--ink); }
.x svg { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none; stroke-linecap: round; }
.row { display: flex; gap: 6px; margin-top: 12px; }
.btn { all: unset; box-sizing: border-box; height: 32px; padding: 0 12px; border-radius: 9px; font-size: 12.5px; font-weight: 550; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--muted); }
.btn:hover { background: var(--hover); color: var(--ink); }
.btn.primary { background: var(--accent); color: #fff; margin-left: auto; padding: 0 16px; }
.btn.primary:hover { filter: brightness(1.08); }

/* toast */
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); max-width: 360px; background: var(--ink); color: var(--bg); border-radius: 999px; padding: 9px 16px; font-size: 12.5px; font-weight: 500; box-shadow: 0 10px 30px -6px rgb(0 0 0 / .3); animation: rise .2s ease-out; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

@keyframes pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } }
@keyframes slide { from { opacity: 0; transform: translateX(12px); } }
@keyframes rise { from { opacity: 0; transform: translate(-50%, 8px); } }
@media (prefers-reduced-motion: reduce) { .menu, .card, .toast { animation: none; } }
`;

const KEYHOLE = '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.6"/><path d="M10.4 11.5h3.2l1.1 7.5H9.3z"/></svg>';

export const MENU_ICONS: Record<string, string> = {
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>',
  hash: '<path d="M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
};

/** Clicks arriving sooner than this after the UI appears are ignored (clickjacking guard). */
const MIN_VISIBLE_MS = 250;

function hueOf(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function createHost(tag: string): { host: HTMLElement; root: ShadowRoot; theme: HTMLDivElement } {
  const host = document.createElement(tag);
  host.setAttribute(
    'style',
    'all: initial !important; position: fixed !important; inset: auto !important; top: 0 !important; left: 0 !important; ' +
      'width: 0 !important; height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; ' +
      'background: transparent !important; overflow: visible !important; z-index: 2147483647 !important; display: block !important;',
  );
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const theme = document.createElement('div');
  theme.className = 'theme';
  root.append(style, theme);
  return { host, root, theme };
}

function mount(host: HTMLElement) {
  if (!host.isConnected) document.documentElement.append(host);
  if ('popover' in host) {
    host.popover = 'manual';
    try {
      if (host.matches(':popover-open')) host.hidePopover();
      host.showPopover(); // re-show to move above newer top-layer elements (modal dialogs)
    } catch {
      /* not supported */
    }
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function svgIcon(name: string): HTMLElement {
  const wrap = el('div', 'ico');
  wrap.innerHTML = `<svg viewBox="0 0 24 24">${MENU_ICONS[name] ?? ''}</svg>`;
  return wrap;
}

export interface MenuItem {
  label: string;
  sub?: string;
  /** A MENU_ICONS name, or omit for a coloured letter avatar built from `avatarOf`. */
  icon?: keyof typeof MENU_ICONS;
  avatarOf?: string;
  run: () => void | Promise<void>;
}

export class SuggestionMenu {
  private host: HTMLElement | null = null;
  private theme: HTMLDivElement | null = null;
  private panel: HTMLDivElement | null = null;
  private cleanup: (() => void) | null = null;
  private items: MenuItem[] = [];
  private active = 0;
  private shownAt = 0;
  anchor: HTMLElement | null = null;

  get open(): boolean {
    return !!this.anchor;
  }

  show(anchor: HTMLElement, site: string, items: MenuItem[], opts: { warning?: string; cycleHint?: boolean } = {}) {
    if (!this.host) ({ host: this.host, theme: this.theme } = createHost('vaultfill-menu'));
    this.hide();
    const panel = el('div', 'menu');
    panel.setAttribute('role', 'listbox');
    // Keep focus in the page's input while interacting with the menu.
    panel.addEventListener('mousedown', (e) => e.preventDefault());

    const head = el('div', 'head');
    const mark = el('span', 'mark');
    mark.innerHTML = KEYHOLE;
    head.append(mark, el('span', 'site', site || 'VaultFill'));
    panel.append(head);
    if (opts.warning) panel.append(el('div', 'warn', opts.warning));

    items.forEach((item, i) => {
      const b = el('button', 'item');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(i === 0));
      let lead: HTMLElement;
      if (item.icon) lead = svgIcon(item.icon);
      else {
        const name = item.avatarOf ?? item.label;
        lead = el('div', 'ava', (name.trim()[0] ?? '?').toUpperCase());
        lead.style.setProperty('--h', String(hueOf(name)));
      }
      const text = el('div', 'text');
      text.append(el('div', 'label', item.label));
      if (item.sub) text.append(el('div', 'sub', item.sub));
      b.append(lead, text, el('span', 'enter', '↵'));
      b.addEventListener('click', (e) => {
        if (!e.isTrusted || performance.now() - this.shownAt < MIN_VISIBLE_MS) return;
        this.choose(i);
      });
      b.addEventListener('mousemove', () => this.highlight(i));
      panel.append(b);
    });

    const foot = el('div', 'foot');
    const hint = (keys: string, what: string) => {
      const s = el('span');
      s.append(el('kbd', undefined, keys), document.createTextNode(what));
      return s;
    };
    if (items.length > 1) foot.append(hint('↑↓', 'select'));
    foot.append(hint('↵', 'fill'), hint('esc', 'close'));
    if (opts.cycleHint) foot.append(hint('⌥A', 'cycle'));
    panel.append(foot);

    this.theme!.append(panel);
    this.panel = panel;
    this.items = items;
    this.active = 0;
    this.anchor = anchor;
    this.shownAt = performance.now();
    mount(this.host!);

    // Positioned *outside* the field's box (below, flipping above) so it never covers the input,
    // its eye/clear icons or dropdown arrows.
    const update = () =>
      computePosition(anchor, panel, {
        strategy: 'fixed',
        placement: 'bottom-start',
        middleware: [
          offset(6),
          flip({ padding: 8 }),
          shift({ padding: 8 }),
          size({
            padding: 8,
            apply: ({ rects, availableHeight }) => {
              panel.style.width = `${Math.max(280, Math.min(340, rects.reference.width))}px`;
              panel.style.maxHeight = `${Math.max(120, Math.min(340, availableHeight))}px`;
            },
          }),
          hide(),
        ],
      }).then(({ x, y, middlewareData }) => {
        Object.assign(panel.style, {
          left: `${x}px`,
          top: `${y}px`,
          visibility: middlewareData.hide?.referenceHidden ? 'hidden' : 'visible',
        });
      });
    this.cleanup = autoUpdate(anchor, panel, update);
  }

  private highlight(i: number) {
    this.active = i;
    this.panel?.querySelectorAll('.item').forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    this.panel?.querySelectorAll('.item')[i]?.scrollIntoView({ block: 'nearest' });
  }

  private choose(i: number) {
    const item = this.items[i];
    this.hide();
    void item?.run();
  }

  /** Returns true when the key was consumed. */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.open || !this.items.length) return false;
    if (e.key === 'ArrowDown') this.highlight((this.active + 1) % this.items.length);
    else if (e.key === 'ArrowUp') this.highlight((this.active - 1 + this.items.length) % this.items.length);
    else if (e.key === 'Enter' && e.isTrusted) {
      if (performance.now() - this.shownAt < MIN_VISIBLE_MS) return true;
      this.choose(this.active);
    } else if (e.key === 'Escape') this.hide();
    else return false;
    return true;
  }

  hide() {
    this.cleanup?.();
    this.cleanup = null;
    this.panel?.remove();
    this.panel = null;
    this.anchor = null;
    this.items = [];
  }

  destroy() {
    this.hide();
    this.host?.remove();
  }
}

export interface PromptAction {
  label: string;
  primary?: boolean;
  run: () => void | Promise<void>;
}

export class NoticeLayer {
  private host: HTMLElement | null = null;
  private theme: HTMLDivElement | null = null;
  private card: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private cardTimer = 0;
  private toastTimer = 0;

  private ensure() {
    if (!this.host) ({ host: this.host, theme: this.theme } = createHost('vaultfill-notice'));
    mount(this.host);
    return this.theme!;
  }

  /** Compact save/update card. The last action is the primary one; `onClose` runs for the ✕. */
  prompt(title: string, body: string, actions: PromptAction[], onClose?: () => void, timeoutMs = 45_000) {
    const theme = this.ensure();
    this.closePrompt();
    const card = el('div', 'card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', title);
    const shownAt = performance.now();
    const guard = (fn: () => void) => (e: MouseEvent) => {
      if (!e.isTrusted || performance.now() - shownAt < MIN_VISIBLE_MS) return;
      this.closePrompt();
      fn();
    };

    const top = el('div', 'card-top');
    const ava = el('div', 'ava', (body.trim()[0] ?? 'V').toUpperCase());
    ava.style.setProperty('--h', String(hueOf(body.split(' ')[0] ?? body)));
    const text = el('div', 'text');
    text.append(el('div', 'card-title', title), el('div', 'card-body', body));
    const x = el('button', 'x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    x.addEventListener('click', guard(() => onClose?.()));
    top.append(ava, text, x);

    const row = el('div', 'row');
    for (const a of actions) {
      const b = el('button', a.primary ? 'btn primary' : 'btn', a.label);
      b.type = 'button';
      b.addEventListener('click', guard(() => void a.run()));
      row.append(b);
    }
    card.append(top, row);
    theme.append(card);
    this.card = card;
    this.cardTimer = window.setTimeout(() => this.closePrompt(), timeoutMs);
  }

  closePrompt() {
    clearTimeout(this.cardTimer);
    this.card?.remove();
    this.card = null;
  }

  toast(message: string, ms = 3000) {
    const theme = this.ensure();
    this.toastEl?.remove();
    clearTimeout(this.toastTimer);
    const t = el('div', 'toast', message);
    t.setAttribute('role', 'status');
    theme.append(t);
    this.toastEl = t;
    this.toastTimer = window.setTimeout(() => t.remove(), ms);
  }

  destroy() {
    this.closePrompt();
    this.host?.remove();
  }
}
