import type { FieldKind } from '@/lib/types';
import { classifyField, type Classification, type GroupContext } from './classifier';
import { candidateFields, composedParent, walkDeep, type FieldElement } from './dom';
import { isOccluded, isVisible } from './visibility';

export interface AnalyzedField extends Classification {
  el: FieldElement;
}

export interface GroupAnalysis {
  root: Element;
  fields: AnalyzedField[];
  context: GroupContext;
}

let generation = 0;
/** Invalidate cached analyses (called by the page scanner after DOM mutations). */
export function bumpGeneration(): void {
  generation++;
}

const cache = new WeakMap<Element, { gen: number; analysis: GroupAnalysis }>();

/** The logical form a field belongs to: its <form>, else the smallest ancestor holding ≥2 visible fields. */
export function groupRootOf(el: FieldElement): Element {
  if (el.form) return el.form;
  let node = composedParent(el);
  for (let depth = 0; node && depth < 12; depth++) {
    if (node === document.body || node === document.documentElement) break;
    if (candidateFields(node).filter((f) => isVisible(f)).length >= 2) return node;
    node = composedParent(node);
  }
  return document.body ?? document.documentElement;
}

function contextText(root: Element): string {
  const bits: string[] = [document.title, location.pathname];
  if (root instanceof HTMLFormElement) bits.push(root.id, root.name, root.getAttribute('action') ?? '', root.className);
  for (const el of walkDeep(root)) {
    if (el instanceof HTMLButtonElement || (el instanceof HTMLInputElement && /submit|button/.test(el.type))) {
      bits.push(el.textContent ?? '', (el as HTMLInputElement).value ?? '', el.getAttribute('aria-label') ?? '');
    } else if (/^H[1-3]$/.test(el.tagName) || el.getAttribute('role') === 'heading') {
      bits.push(el.textContent ?? '');
    }
  }
  // Page-level headings help single-field steps ("Sign in to continue").
  document.querySelectorAll('h1, h2').forEach((h, i) => i < 3 && bits.push(h.textContent ?? ''));
  return bits.join(' ').replace(/\s+/g, ' ').toLowerCase().slice(0, 2000);
}

export function analyzeGroup(root: Element): GroupAnalysis {
  const hit = cache.get(root);
  if (hit && hit.gen === generation) return hit.analysis;

  // Decoys hidden under other elements must not skew context (e.g. "2 passwords ⇒ sign-up form").
  const all = candidateFields(root).filter((f) => isVisible(f) && !isOccluded(f));
  const passwords = all.filter((f) => f instanceof HTMLInputElement && f.type === 'password');
  const context: GroupContext = { text: contextText(root), passwordCount: passwords.length, passwords, fields: all };
  const fields = all.map((el) => ({ el, ...classifyField(el, context) }));
  const analysis = { root, fields, context };
  cache.set(root, { gen: generation, analysis });
  return analysis;
}

export function analyzeField(el: FieldElement): { group: GroupAnalysis; field: AnalyzedField } {
  const group = analyzeGroup(groupRootOf(el));
  let field = group.fields.find((f) => f.el === el);
  if (!field) {
    // The field is not visible (so not part of the group's fillable set): classify for capture only.
    field = { el, ...classifyField(el, group.context) };
  }
  return { group, field };
}

export const LOGIN_KINDS: FieldKind[] = ['USERNAME', 'PASSWORD_CURRENT'];
export const IDENTITY_KINDS: FieldKind[] = ['NAME', 'ADDRESS', 'EMAIL', 'PHONE'];

export function fieldsOfKind(group: GroupAnalysis, ...kinds: FieldKind[]): AnalyzedField[] {
  return group.fields.filter((f) => kinds.includes(f.kind));
}
