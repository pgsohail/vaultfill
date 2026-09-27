// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fillSelect, forceInputFill } from '@/content/fill';

describe('fill engine', () => {
  it('fires the realistic event sequence and sets the value', async () => {
    document.body.innerHTML = '<input id="u">';
    const input = document.getElementById('u') as HTMLInputElement;
    const events: string[] = [];
    for (const t of ['focus', 'keydown', 'beforeinput', 'input', 'keyup', 'change', 'blur']) {
      input.addEventListener(t, () => events.push(t));
    }
    expect(await forceInputFill(input, 'alice')).toBe(true);
    expect(input.value).toBe('alice');
    expect(events).toEqual(['focus', 'keydown', 'beforeinput', 'input', 'keyup', 'change', 'blur']);
  });

  it('goes through the native setter even when a framework shadows `value` (React value tracker)', async () => {
    document.body.innerHTML = '<input id="r">';
    const input = document.getElementById('r') as HTMLInputElement;
    // Mimic React: an instance-level `value` property that records the "tracked" value.
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    let tracked = '';
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() {
        return proto.get!.call(this);
      },
      set(v) {
        tracked = v;
        proto.set!.call(this, v);
      },
    });
    let sawChange = false;
    // React only fires onChange if DOM value differs from its tracked value at input time.
    input.addEventListener('input', () => (sawChange = input.value !== tracked));
    await forceInputFill(input, 'secret');
    expect(input.value).toBe('secret');
    expect(sawChange).toBe(true);
  });

  it('bubbles input/change events so delegated framework listeners fire', async () => {
    document.body.innerHTML = '<div id="root"><input id="v"></div>';
    const seen: string[] = [];
    document.getElementById('root')!.addEventListener('input', () => seen.push('input'));
    document.getElementById('root')!.addEventListener('change', () => seen.push('change'));
    await forceInputFill(document.getElementById('v') as HTMLInputElement, 'x');
    expect(seen).toEqual(['input', 'change']);
  });

  it('fills selects by value or visible text', async () => {
    document.body.innerHTML = '<select id="c"><option value="">-</option><option value="US">United States</option><option value="DE">Germany</option></select>';
    const sel = document.getElementById('c') as HTMLSelectElement;
    expect(await fillSelect(sel, 'germany')).toBe(true);
    expect(sel.value).toBe('DE');
    expect(await fillSelect(sel, 'US')).toBe(true);
    expect(sel.value).toBe('US');
  });
});
