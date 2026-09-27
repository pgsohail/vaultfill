import type { FieldKind, IdentityKey } from '@/lib/types';
import type { FieldElement } from './dom';

/**
 * Field classifier: deterministic `autocomplete` tokens first, then a small on-device
 * linear model (softmax over hand-calibrated feature weights) that combines attribute
 * regexes, label text, input shape and surrounding form context.
 *
 * The weights live in one table so they can be replaced by weights trained on a labelled
 * corpus (see README → "Training the classifier") without touching the feature code.
 */

export interface Classification {
  kind: FieldKind;
  confidence: number;
  identityKey?: IdentityKey;
}

/** Context about the group (form) the field lives in, computed once per group. */
export interface GroupContext {
  text: string;
  passwordCount: number;
  /** Password inputs in document order, used to tell current from new/confirm. */
  passwords: FieldElement[];
  /** Candidate fields in document order. */
  fields: FieldElement[];
}

const RX = {
  user: /user.?name|user.?id|\buser\b|login|log.?in|account|identifier|member|handle|sign.?in|nickname|benutzer|usuario|utilisateur|\buid\b/,
  email: /e.?mail|courriel|correo/,
  pass: /pass(word|wd|phrase)?|\bpwd\b|\bpw\b|kennwort|contrase|mot.?de.?passe|senha|parol/,
  newpw: /new|creat|choose|set.?up|register|sign.?up|neu|nouveau|nuevo/,
  confirm: /confirm|repeat|re.?type|re.?enter|again|verif|match|second|\b2\b/,
  current: /current|old|existing|actual|aktuell/,
  otp: /\botp\b|one.?time|2fa|mfa|totp|two.?factor|verification.?code|verify.?code|auth\w*.?code|security.?code|\d.?digit|sms.?code|passcode|\btoken\b|mfa.?code|otc/,
  code: /\bcode\b/,
  search: /search|query|\bq\b|\bfind\b|filter|keyword|coupon|promo|voucher|gift/,
  given: /first.?name|given.?name|\bfname\b|forename|vorname|pr[eé]nom/,
  family: /last.?name|family.?name|surname|\blname\b|nachname|apellido/,
  fullName: /full.?name|\bname\b|your.?name|\bnom\b|nombre|cardholder/,
  org: /company|organi[sz]ation|business|employer/,
  street: /street|address|\baddr|strasse|stra[ßs]e|direcci[oó]n|adresse|line.?1|line.?2/,
  city: /\bcity\b|town|locality|\bort\b|ciudad|ville|suburb/,
  region: /\bstate\b|province|region|county|prefecture/,
  postal: /\bzip\b|postal|post.?code|\bplz\b|\bpin.?code\b|postcode/,
  country: /country|\bnation\b|\bpais\b|\bpays\b|\bland\b/,
  phone: /phone|mobile|\btel\b|telephone|\bcell\b|handy|m[oó]vil/,
  signup: /sign.?up|register|registration|create.?(an.?|your.?)?account|join\b|get.?started|new.?account|enroll/,
  login: /sign.?in|log.?in|login|welcome.?back|authenticate|anmelden|connexion|iniciar/,
  change: /change.?(your.?)?password|reset.?(your.?)?password|update.?(your.?)?password|new.?password/,
};

const AUTOCOMPLETE: Record<string, Classification> = {
  'current-password': { kind: 'PASSWORD_CURRENT', confidence: 0.99 },
  'new-password': { kind: 'PASSWORD_NEW', confidence: 0.99 },
  'one-time-code': { kind: 'TOTP_CODE', confidence: 0.99 },
  username: { kind: 'USERNAME', confidence: 0.97 },
  webauthn: { kind: 'USERNAME', confidence: 0.9 },
  name: { kind: 'NAME', confidence: 0.97, identityKey: 'fullName' },
  'given-name': { kind: 'NAME', confidence: 0.97, identityKey: 'givenName' },
  'family-name': { kind: 'NAME', confidence: 0.97, identityKey: 'familyName' },
  organization: { kind: 'NAME', confidence: 0.95, identityKey: 'organization' },
  'street-address': { kind: 'ADDRESS', confidence: 0.97, identityKey: 'street' },
  'address-line1': { kind: 'ADDRESS', confidence: 0.97, identityKey: 'street' },
  'address-level2': { kind: 'ADDRESS', confidence: 0.97, identityKey: 'city' },
  'address-level1': { kind: 'ADDRESS', confidence: 0.97, identityKey: 'region' },
  'postal-code': { kind: 'ADDRESS', confidence: 0.97, identityKey: 'postalCode' },
  country: { kind: 'ADDRESS', confidence: 0.97, identityKey: 'country' },
  'country-name': { kind: 'ADDRESS', confidence: 0.97, identityKey: 'country' },
  tel: { kind: 'PHONE', confidence: 0.97, identityKey: 'phone' },
  'tel-national': { kind: 'PHONE', confidence: 0.97, identityKey: 'phone' },
};

type Feature =
  | 'bias' | 't_pw' | 't_email' | 't_text' | 't_tel' | 't_num'
  | 'k_user' | 'k_email' | 'k_pass' | 'k_new' | 'k_confirm' | 'k_current' | 'k_otp' | 'k_code'
  | 'k_search' | 'k_name' | 'k_addr' | 'k_phone'
  | 'c_has_pw' | 'c_multi_pw' | 'c_first_of_3_pw' | 'c_later_pw' | 'c_signup' | 'c_login' | 'c_change'
  | 'c_before_pw' | 'c_lonely' | 's_otp_shape' | 's_numeric';

type Weights = Partial<Record<Feature, number>>;

/** The model. Logit(kind) = Σ weight × feature. */
export const MODEL: Record<Exclude<FieldKind, 'UNKNOWN'> | 'UNKNOWN', Weights> = {
  PASSWORD_CURRENT: {
    bias: 1.0, t_pw: 2.0, k_pass: 0.8, k_current: 2.5, c_login: 1.2, c_multi_pw: -1.6,
    c_first_of_3_pw: 3.2, c_signup: -1.6, k_new: -1.8, k_confirm: -1.8, c_later_pw: -0.8, k_otp: -1.5,
  },
  PASSWORD_NEW: {
    bias: -0.6, t_pw: 2.0, k_pass: 0.8, k_new: 2.2, k_confirm: 1.6, c_signup: 1.9, c_multi_pw: 1.6,
    c_change: 1.3, c_later_pw: 1.0, k_current: -2.8, c_login: -1.0, c_first_of_3_pw: -2.5,
  },
  TOTP_CODE: {
    bias: -2.4, k_otp: 3.4, k_code: 1.0, s_otp_shape: 1.8, s_numeric: 0.6, c_has_pw: -1.6,
    k_user: -1.2, k_email: -2.0, k_addr: -3.0, k_phone: -1.5, k_search: -2.0, t_pw: -0.5, c_lonely: 0.6,
  },
  USERNAME: {
    bias: -0.6, k_user: 2.4, k_email: 1.3, t_email: 1.0, c_has_pw: 1.1, c_before_pw: 1.6, c_login: 1.0,
    c_lonely: 0.4, k_search: -3.2, k_name: -2.0, k_addr: -1.5, k_otp: -1.8, c_signup: -0.2, t_num: -0.8,
  },
  EMAIL: {
    bias: -1.2, k_email: 2.6, t_email: 2.0, c_before_pw: -1.4, c_login: -1.4, c_has_pw: -0.8,
    c_signup: 0.4, k_search: -2.0,
  },
  NAME: { bias: -1.6, k_name: 3.2, c_has_pw: -0.4, k_user: -1.6, k_email: -2.2, k_addr: -1.0, k_search: -2.0 },
  ADDRESS: { bias: -1.6, k_addr: 3.2, c_has_pw: -1.0, k_email: -2.0, k_user: -1.6, k_search: -1.5 },
  PHONE: { bias: -1.8, k_phone: 3.0, t_tel: 2.0, c_has_pw: -0.4, k_email: -1.5 },
  UNKNOWN: { bias: 0.6, k_search: 3.2, t_num: 0.4 },
};

function labelText(el: FieldElement): string {
  const parts: string[] = [];
  el.labels?.forEach((l) => parts.push(l.textContent ?? ''));
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const root = el.getRootNode() as Document | ShadowRoot;
    for (const id of labelledBy.split(/\s+/)) parts.push(root.getElementById?.(id)?.textContent ?? '');
  }
  // Unlabelled inputs: use the closest preceding text (common in div soup / floating labels).
  if (!parts.join('').trim() && !el.getAttribute('placeholder') && !el.getAttribute('aria-label')) {
    const prev = el.previousElementSibling ?? el.parentElement?.previousElementSibling;
    const isTextish = prev && !/^(H[1-6]|INPUT|SELECT|BUTTON|FORM)$/.test(prev.tagName);
    if (isTextish && (prev.textContent?.length ?? 0) < 60) parts.push(prev.textContent ?? '');
  }
  return parts.join(' ');
}

export function fieldText(el: FieldElement): string {
  const attrs = ['name', 'id', 'placeholder', 'aria-label', 'title', 'data-testid', 'data-test', 'formcontrolname', 'ng-model', 'v-model'];
  const raw = [...attrs.map((a) => el.getAttribute(a) ?? ''), labelText(el), el.className?.toString?.() ?? ''].join(' ');
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.[\]:]+/g, ' ')
    .toLowerCase();
}

function autocompleteClass(el: FieldElement, ctx: GroupContext): Classification | null {
  const tokens = (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  for (const t of tokens.reverse()) {
    if (t === 'email') {
      return ctx.passwordCount > 0 || RX.login.test(ctx.text)
        ? { kind: 'USERNAME', confidence: 0.95 }
        : { kind: 'EMAIL', confidence: 0.95, identityKey: 'email' };
    }
    if (t === 'address-line2') return { kind: 'ADDRESS', confidence: 0.9, identityKey: undefined };
    const hit = AUTOCOMPLETE[t];
    // Some sites put autocomplete="username" on the password field; only trust type-compatible tokens.
    if (hit) {
      const isPw = el instanceof HTMLInputElement && el.type === 'password';
      const pwKind = hit.kind === 'PASSWORD_CURRENT' || hit.kind === 'PASSWORD_NEW';
      if (isPw === pwKind || hit.kind === 'TOTP_CODE') return hit;
    }
  }
  return null;
}

export function extractFeatures(el: FieldElement, ctx: GroupContext): Record<Feature, number> {
  const type = el instanceof HTMLInputElement ? el.type.toLowerCase() : 'select';
  const text = fieldText(el);
  const pwIndex = ctx.passwords.indexOf(el);
  const myIndex = ctx.fields.indexOf(el);
  const firstPw = ctx.passwords[0] ? ctx.fields.indexOf(ctx.passwords[0]) : -1;
  const input = el instanceof HTMLInputElement ? el : null;
  const maxLen = input?.maxLength ?? -1;
  const numeric = input?.inputMode === 'numeric' || type === 'number' || /\\d|\[0-9\]/.test(input?.pattern ?? '');
  const visibleText = ctx.fields.filter((f) => !(f instanceof HTMLInputElement && f.type === 'password')).length;
  const has = (rx: RegExp) => (rx.test(text) ? 1 : 0);
  return {
    bias: 1,
    t_pw: type === 'password' ? 1 : 0,
    t_email: type === 'email' ? 1 : 0,
    t_text: type === 'text' || type === '' ? 1 : 0,
    t_tel: type === 'tel' ? 1 : 0,
    t_num: type === 'number' ? 1 : 0,
    k_user: has(RX.user),
    k_email: has(RX.email),
    k_pass: has(RX.pass),
    k_new: has(RX.newpw),
    k_confirm: has(RX.confirm),
    k_current: has(RX.current),
    k_otp: has(RX.otp),
    k_code: has(RX.code),
    k_search: has(RX.search) || type === 'search' ? 1 : 0,
    k_name: has(RX.given) || has(RX.family) || has(RX.fullName) || has(RX.org),
    k_addr: has(RX.street) || has(RX.city) || has(RX.region) || has(RX.postal) || has(RX.country),
    k_phone: has(RX.phone),
    c_has_pw: ctx.passwordCount > 0 ? 1 : 0,
    c_multi_pw: ctx.passwordCount >= 2 ? 1 : 0,
    c_first_of_3_pw: ctx.passwordCount >= 3 && pwIndex === 0 ? 1 : 0,
    c_later_pw: pwIndex > 0 ? 1 : 0,
    c_signup: RX.signup.test(ctx.text) ? 1 : 0,
    c_login: RX.login.test(ctx.text) && !RX.signup.test(ctx.text) ? 1 : 0,
    c_change: RX.change.test(ctx.text) ? 1 : 0,
    // Only the field right before the first password is the likely username.
    c_before_pw: firstPw > 0 && myIndex === firstPw - 1 ? 1 : 0,
    c_lonely: visibleText <= 1 && ctx.passwordCount === 0 ? 1 : 0,
    s_otp_shape: (maxLen >= 4 && maxLen <= 8) || maxLen === 1 ? 1 : 0,
    s_numeric: numeric ? 1 : 0,
  };
}

function identityKeyFor(kind: FieldKind, text: string): IdentityKey | undefined {
  switch (kind) {
    case 'NAME':
      if (RX.given.test(text)) return 'givenName';
      if (RX.family.test(text)) return 'familyName';
      if (RX.org.test(text)) return 'organization';
      return 'fullName';
    case 'ADDRESS':
      if (RX.postal.test(text)) return 'postalCode';
      if (RX.city.test(text)) return 'city';
      if (RX.country.test(text)) return 'country';
      if (RX.region.test(text)) return 'region';
      if (/line.?2|apartment|\bapt\b|suite|unit/.test(text)) return undefined;
      return 'street';
    case 'EMAIL':
      return 'email';
    case 'PHONE':
      return 'phone';
    default:
      return undefined;
  }
}

export function classifyField(el: FieldElement, ctx: GroupContext): Classification {
  const byAutocomplete = autocompleteClass(el, ctx);
  if (byAutocomplete) {
    return byAutocomplete.identityKey || !['NAME', 'ADDRESS'].includes(byAutocomplete.kind)
      ? byAutocomplete
      : { ...byAutocomplete, identityKey: identityKeyFor(byAutocomplete.kind, fieldText(el)) };
  }

  const f = extractFeatures(el, ctx);
  const isPw = f.t_pw === 1;
  // Password inputs can only be password/OTP; plain inputs can only be password-like when
  // clearly labelled (a "show password" toggle turns type=password into type=text).
  const looksLikeShownPw = !isPw && f.k_pass && !f.k_user && !f.k_email && !f.k_otp;
  const allowed = (Object.keys(MODEL) as (keyof typeof MODEL)[]).filter((k) => {
    if (k === 'PASSWORD_CURRENT' || k === 'PASSWORD_NEW') return isPw || looksLikeShownPw;
    if (isPw) return k === 'TOTP_CODE' || k === 'UNKNOWN';
    if (el instanceof HTMLSelectElement) return k === 'ADDRESS' || k === 'NAME' || k === 'UNKNOWN';
    return true;
  });

  const logits = allowed.map((k) => {
    let z = 0;
    for (const [feat, w] of Object.entries(MODEL[k]) as [Feature, number][]) z += w * f[feat];
    return z;
  });
  const max = Math.max(...logits);
  const exps = logits.map((z) => Math.exp(z - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  let best = 0;
  for (let i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;

  const kind = allowed[best] as FieldKind;
  const confidence = exps[best] / sum;
  if (kind === 'UNKNOWN' || confidence < 0.4) return { kind: 'UNKNOWN', confidence };
  return { kind, confidence, identityKey: identityKeyFor(kind, fieldText(el)) };
}
