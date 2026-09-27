import { walkDeep } from './dom';
import { bumpGeneration } from './groups';

/**
 * Watches the light DOM and every shadow root for inserted/removed fields so SPA route
 * transitions (Next.js, Remix, Angular, …) and lazily rendered login widgets are picked up
 * without a page load. MutationObservers don't cross shadow boundaries, so each discovered
 * root gets its own observer.
 */
export class PageScanner {
  private roots = new WeakSet<Node>();
  private observers: MutationObserver[] = [];
  private timer = 0;
  private firstPending = 0;

  constructor(
    private readonly onRescan: () => void,
    private readonly onShadowRoot: (root: ShadowRoot) => void,
    private readonly signal: AbortSignal,
  ) {}

  start(): void {
    this.observe(document);
    this.scan();
    const kick = () => this.schedule();
    const nav = (window as Window & { navigation?: EventTarget }).navigation;
    nav?.addEventListener('navigatesuccess', kick, { signal: this.signal });
    window.addEventListener('popstate', kick, { signal: this.signal });
    window.addEventListener('hashchange', kick, { signal: this.signal });
    window.addEventListener('pageshow', kick, { signal: this.signal });
    this.signal.addEventListener('abort', () => {
      this.observers.forEach((o) => o.disconnect());
      clearTimeout(this.timer);
    });
  }

  private observe(root: Document | ShadowRoot) {
    if (this.roots.has(root)) return;
    this.roots.add(root);
    const mo = new MutationObserver((records) => {
      // Ignore churn that can't add or reveal a field.
      if (records.some((r) => r.type === 'attributes' || r.addedNodes.length || r.removedNodes.length)) this.schedule();
    });
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'hidden', 'disabled'] });
    this.observers.push(mo);
  }

  /** Debounced (150ms) with a 1s max wait so constantly-mutating pages still get scanned. */
  schedule(): void {
    const now = performance.now();
    if (!this.firstPending) this.firstPending = now;
    clearTimeout(this.timer);
    const wait = now - this.firstPending > 1000 ? 0 : 150;
    this.timer = window.setTimeout(() => {
      this.firstPending = 0;
      this.scan();
    }, wait);
  }

  scan(): void {
    bumpGeneration();
    for (const _ of walkDeep(document, (sr) => {
      if (!this.roots.has(sr)) {
        this.observe(sr);
        this.onShadowRoot(sr);
      }
    })) {
      /* walking is what discovers shadow roots */
    }
    this.onRescan();
  }
}
