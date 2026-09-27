/** Shadow-DOM-aware DOM helpers. Pierces open *and* closed shadow roots where the browser allows it. */

type ChromeDom = { dom?: { openOrClosedShadowRoot?: (el: Element) => ShadowRoot | null } };

// Elements that may host a shadow root (custom elements + the HTML allow-list for attachShadow).
const SHADOW_HOSTS = new Set([
  'DIV', 'SPAN', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'FOOTER', 'HEADER', 'MAIN', 'NAV',
  'P', 'SECTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
]);

export function shadowRootOf(el: Element): ShadowRoot | null {
  if (el.shadowRoot) return el.shadowRoot;
  if (!el.tagName.includes('-') && !SHADOW_HOSTS.has(el.tagName)) return null;
  try {
    const chromeDom = (globalThis as unknown as { chrome?: ChromeDom }).chrome?.dom;
    if (chromeDom?.openOrClosedShadowRoot) return chromeDom.openOrClosedShadowRoot(el) ?? null;
  } catch {
    /* not an element we can inspect */
  }
  // Firefox exposes closed roots to extensions through this property.
  return (el as Element & { openOrClosedShadowRoot?: ShadowRoot | null }).openOrClosedShadowRoot ?? null;
}

/** Depth-first walk over light DOM plus every reachable shadow tree. */
export function* walkDeep(root: Node, onShadowRoot?: (sr: ShadowRoot) => void): Generator<Element> {
  const stack: Node[] = [root];
  while (stack.length) {
    const r = stack.pop()!;
    const doc = r.ownerDocument ?? (r as Document);
    const walker = doc.createTreeWalker(r, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode === r && r.nodeType === Node.ELEMENT_NODE ? r : walker.nextNode();
    while (node) {
      const el = node as Element;
      yield el;
      const sr = shadowRootOf(el);
      if (sr) {
        onShadowRoot?.(sr);
        stack.push(sr);
      }
      node = walker.nextNode();
    }
  }
}

export function composedParent(node: Node): Element | null {
  if (node.parentElement) return node.parentElement;
  const p = node.parentNode;
  return p instanceof ShadowRoot ? p.host : null;
}

export function composedContains(ancestor: Node, node: Node | null): boolean {
  for (let n: Node | null = node; n; n = n.parentNode instanceof ShadowRoot ? n.parentNode.host : n.parentNode) {
    if (n === ancestor) return true;
  }
  return false;
}

export function deepActiveElement(doc: Document = document): Element | null {
  let a: Element | null = doc.activeElement;
  for (;;) {
    const sr = a ? shadowRootOf(a) : null;
    if (!sr?.activeElement) return a;
    a = sr.activeElement;
  }
}

/** The real target of an event, even when it originated inside a (closed) shadow root. */
export function eventTarget(e: Event): Element | null {
  const t = e.composedPath()[0];
  if (!(t instanceof Element)) return null;
  // composedPath() hides nodes inside *closed* shadow trees and stops at their host.
  // Focus/key/input events target the focused element, so descend through active elements.
  let el: Element = t;
  for (let sr = shadowRootOf(el); sr?.activeElement; sr = shadowRootOf(el)) el = sr.activeElement;
  return el;
}

const TEXT_TYPES = new Set(['', 'text', 'email', 'password', 'tel', 'number', 'url', 'search']);

export type FieldElement = HTMLInputElement | HTMLSelectElement;

export function isCandidateField(el: Element | null): el is FieldElement {
  if (el instanceof HTMLInputElement) return TEXT_TYPES.has(el.type.toLowerCase());
  return el instanceof HTMLSelectElement;
}

export function candidateFields(root: Node): FieldElement[] {
  const out: FieldElement[] = [];
  for (const el of walkDeep(root)) if (isCandidateField(el)) out.push(el);
  return out;
}

/** Topmost element at a point, drilling into shadow roots. */
export function deepElementFromPoint(x: number, y: number): Element | null {
  let el = document.elementFromPoint(x, y);
  while (el) {
    const sr = shadowRootOf(el);
    const inner = sr?.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}
