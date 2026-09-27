import { composedContains, composedParent, deepElementFromPoint, type FieldElement } from './dom';

/**
 * Anti-credential-scraping guard. A field is only fillable when a human could actually see
 * and type into it: no display:none / visibility:hidden / opacity≈0 / zero size / off-page /
 * clipped-away bait inputs.
 */
export function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  if (parseFloat(style.opacity) < 0.1) return false;
  if (el.offsetParent === null && style.position !== 'fixed') return false;

  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  const pageW = Math.max(document.documentElement.scrollWidth, innerWidth);
  const pageH = Math.max(document.documentElement.scrollHeight, innerHeight);
  const left = rect.left + scrollX;
  const top = rect.top + scrollY;
  if (left + rect.width <= 0 || top + rect.height <= 0 || left >= pageW || top >= pageH) return false;

  const cv = (el as HTMLElement & { checkVisibility?: (o: object) => boolean }).checkVisibility;
  if (cv && !cv.call(el, { opacityProperty: true, visibilityProperty: true })) return false;

  for (let a = composedParent(el); a && a !== document.documentElement; a = composedParent(a)) {
    const s = getComputedStyle(a);
    if (parseFloat(s.opacity) < 0.1) return false;
    if (/rect\(\s*0(px)?[\s,]+0(px)?[\s,]+0(px)?[\s,]+0(px)?\s*\)/.test(s.clip)) return false;
    if (s.clipPath && /inset\(\s*(50%|100%)/.test(s.clipPath)) return false;
    if (s.overflow !== 'visible') {
      const ar = a.getBoundingClientRect();
      if (ar.width < 2 || ar.height < 2) return false;
    }
  }
  return true;
}

/** True when another element sits on top of the field's centre (bait input hidden under a decoy). */
export function isOccluded(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; // off-screen: can't tell
  const top = deepElementFromPoint(x, y);
  if (!top) return false;
  if (top === el || composedContains(el, top) || composedContains(top, el)) return false;
  // Our own suggestion menu / save prompt never counts as covering a field.
  if (top.tagName.startsWith('VAULTFILL-')) return false;
  // Floating labels are fine.
  if (top instanceof HTMLLabelElement && (top.control === el || composedContains(top, el))) return false;
  return true;
}

export function isFillable(el: FieldElement, { companion = false } = {}): boolean {
  if (el.disabled) return false;
  if (el instanceof HTMLInputElement && (el.readOnly || el.type === 'hidden')) return false;
  if (!isVisible(el)) return false;
  // The field the user focused is trusted; fields we fill *alongside* it must not be covered.
  if (companion && isOccluded(el)) return false;
  return true;
}
