import type { FieldElement } from './dom';

const nextTick = () =>
  new Promise<void>((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));

/**
 * Writes through the *native* value setter so framework wrappers (React's value tracker,
 * Vue/Svelte/Angular bindings) see a real change when the input event fires.
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const base =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  // If the page subclassed the element, prefer the closest prototype setter it defines.
  const ownProto = Object.getPrototypeOf(el) as object;
  const setter =
    Object.getOwnPropertyDescriptor(ownProto, 'value')?.set ?? Object.getOwnPropertyDescriptor(base, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function fire(el: Element, ev: Event) {
  el.dispatchEvent(ev);
}

/** Replays the event sequence a real user produces: focus → keydown → beforeinput → input → keyup → change → blur. */
export async function forceInputFill(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  { blur = true }: { blur?: boolean } = {},
): Promise<boolean> {
  el.focus({ preventScroll: true });
  fire(el, new FocusEvent('focusin', { bubbles: true, composed: true }));
  const key = { bubbles: true, cancelable: true, composed: true, key: 'Unidentified' };
  fire(el, new KeyboardEvent('keydown', key));
  fire(
    el,
    new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, composed: true, inputType: 'insertReplacementText', data: value,
    }),
  );
  setNativeValue(el, value);
  fire(el, new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data: value }));
  fire(el, new KeyboardEvent('keyup', key));
  fire(el, new Event('change', { bubbles: true }));

  // Some controlled components re-render with stale state once; re-apply if we were reverted.
  await nextTick();
  if (el.value !== value) {
    setNativeValue(el, value);
    fire(el, new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data: value }));
    fire(el, new Event('change', { bubbles: true }));
    await nextTick();
  }
  if (blur) {
    el.blur();
    fire(el, new FocusEvent('focusout', { bubbles: true, composed: true }));
  }
  return el.value === value;
}

export async function fillSelect(el: HTMLSelectElement, value: string): Promise<boolean> {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  const opt =
    [...el.options].find((o) => o.value.toLowerCase() === v || o.text.trim().toLowerCase() === v) ??
    [...el.options].find((o) => o.text.trim().toLowerCase().startsWith(v) || (v.length > 3 && o.text.toLowerCase().includes(v)));
  if (!opt) return false;
  el.focus({ preventScroll: true });
  setNativeValue(el, opt.value);
  fire(el, new Event('input', { bubbles: true, composed: true }));
  fire(el, new Event('change', { bubbles: true }));
  el.blur();
  return true;
}

export function fillField(el: FieldElement, value: string, opts?: { blur?: boolean }): Promise<boolean> {
  return el instanceof HTMLSelectElement ? fillSelect(el, value) : forceInputFill(el, value, opts);
}

/** Split OTP widgets (six maxlength=1 boxes): spread the code across consecutive boxes. */
export async function fillOtp(anchor: HTMLInputElement, code: string, fields: FieldElement[]): Promise<void> {
  if (anchor.maxLength !== 1) {
    await forceInputFill(anchor, code, { blur: false });
    return;
  }
  const boxes = fields.filter((f): f is HTMLInputElement => f instanceof HTMLInputElement && f.maxLength === 1);
  const start = Math.max(0, boxes.indexOf(anchor));
  for (let i = 0; i < code.length && start + i < boxes.length; i++) {
    await forceInputFill(boxes[start + i], code[i], { blur: false });
  }
}
