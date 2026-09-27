import { send } from '@/lib/messages';
import { eventTarget, isCandidateField } from './dom';
import { analyzeField, analyzeGroup, groupRootOf, type GroupAnalysis } from './groups';

interface Snapshot {
  username: string;
  password: string;
  newPassword: string;
  hasPasswordField: boolean;
  at: number;
}

const SUBMIT_TEXT =
  /log.?in|sign.?in|sign.?on|submit|continue|next|sign.?up|register|create|join|save|update|change|verify|confirm|weiter|anmelden|connexion|entrar|iniciar/i;

function readGroup(g: GroupAnalysis): Snapshot {
  const val = (kinds: string[]) => g.fields.find((f) => kinds.includes(f.kind) && f.el.value)?.el.value ?? '';
  const pwFields = g.fields.filter((f) => f.kind === 'PASSWORD_CURRENT' || f.kind === 'PASSWORD_NEW');
  return {
    username: val(['USERNAME']) || val(['EMAIL']),
    password: val(['PASSWORD_CURRENT']),
    newPassword: val(['PASSWORD_NEW']),
    hasPasswordField: pwFields.length > 0,
    at: Date.now(),
  };
}

/**
 * Captures credentials at submit time (form submit, Enter in a field, click on a submit-like
 * button) and hands them to the background staging buffer before the page can navigate,
 * error out or clear the fields.
 */
export class CaptureEngine {
  private last = new WeakMap<Element, Snapshot>();
  private lastGroup: Element | null = null;
  private lastSubmit = 0;
  private stageTimer = 0;

  constructor(
    private readonly signal: AbortSignal,
    private readonly afterSubmit: () => void,
  ) {}

  start(): void {
    const opts = { capture: true, signal: this.signal };
    window.addEventListener('input', (e) => this.onInput(e), opts);
    window.addEventListener('change', (e) => this.onInput(e), opts);
    window.addEventListener('submit', (e) => this.onSubmitEvent(e), opts);
    window.addEventListener('keydown', (e) => this.onKey(e), opts);
    window.addEventListener('click', (e) => this.onClick(e), opts);
  }

  /** `submit` isn't composed, so forms inside shadow roots need their own listener. */
  watchShadowRoot(root: ShadowRoot): void {
    root.addEventListener('submit', (e) => this.onSubmitEvent(e), { capture: true, signal: this.signal });
  }

  private onInput(e: Event) {
    const el = eventTarget(e);
    if (!isCandidateField(el) || !e.isTrusted) return;
    const { group, field } = analyzeField(el);
    this.lastGroup = group.root;
    const snap = readGroup(group);
    if (snap.username || snap.password || snap.newPassword) this.last.set(group.root, snap);

    // Stage a typed new password (debounced) so it survives a crashed/failed signup.
    if (field.kind === 'PASSWORD_NEW' && el.value.length >= 6) {
      clearTimeout(this.stageTimer);
      this.stageTimer = window.setTimeout(() => {
        send('stage:typed', { username: snap.username, password: el.value }).catch(() => undefined);
      }, 800);
    }
  }

  private onSubmitEvent(e: Event) {
    const form = eventTarget(e);
    if (form instanceof HTMLFormElement) this.trigger(form);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' || !e.isTrusted) return;
    const el = eventTarget(e);
    if (isCandidateField(el)) this.trigger(groupRootOf(el));
  }

  private onClick(e: MouseEvent) {
    if (!e.isTrusted) return;
    for (const node of e.composedPath()) {
      if (!(node instanceof HTMLElement)) continue;
      const isButton =
        node instanceof HTMLButtonElement ||
        (node instanceof HTMLInputElement && /^(submit|button|image)$/.test(node.type)) ||
        node.getAttribute('role') === 'button';
      if (!isButton) continue;
      const text = `${node.textContent ?? ''} ${(node as HTMLInputElement).value ?? ''} ${node.getAttribute('aria-label') ?? ''}`;
      const isSubmit = (node as HTMLButtonElement).type === 'submit' || SUBMIT_TEXT.test(text);
      if (!isSubmit) return;
      const form = (node as HTMLButtonElement).form;
      // Div-soup forms: fall back to the group the user was last typing in.
      this.trigger(form ?? this.lastGroup ?? document.body);
      return;
    }
  }

  private trigger(root: Element) {
    const now = Date.now();
    if (now - this.lastSubmit < 800) return;
    const fresh = readGroup(analyzeGroup(root));
    const prev = this.last.get(root);
    // SPAs often clear inputs before navigating; fall back to what we saw moments ago.
    const snap =
      !fresh.password && !fresh.newPassword && prev && (prev.password || prev.newPassword) && now - prev.at < 60_000
        ? prev
        : fresh;

    if (snap.password || snap.newPassword) {
      this.lastSubmit = now;
      send('capture:submit', {
        username: snap.username,
        password: snap.password,
        newPassword: snap.newPassword || undefined,
      }).catch(() => undefined);
      this.afterSubmit();
    } else if (snap.username && !snap.hasPasswordField) {
      // Step 1 of a split login: remember who is signing in for the password step.
      this.lastSubmit = now;
      send('login:step', { username: snap.username }).catch(() => undefined);
    }
  }
}
