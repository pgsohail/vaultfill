// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no layout; treat every field as visible here (visibility has its own tests).
vi.mock('@/content/visibility', () => ({
  isVisible: (el: HTMLElement) => !el.hidden && el.style.display !== 'none',
  isFillable: () => true,
  isOccluded: () => false,
}));

const { analyzeGroup, bumpGeneration, groupRootOf } = await import('@/content/groups');
const { candidateFields } = await import('@/content/dom');

function kinds(html: string, title = '') {
  document.title = title;
  document.body.innerHTML = html;
  bumpGeneration();
  const first = candidateFields(document.body)[0];
  return analyzeGroup(groupRootOf(first)).fields.map((f) => f.kind);
}

describe('field classifier', () => {
  beforeEach(() => bumpGeneration());

  it('classic login form', () => {
    expect(
      kinds(`<form><h2>Sign in</h2><input name="email" type="email"><input name="pass" type="password"><button>Log in</button></form>`),
    ).toEqual(['USERNAME', 'PASSWORD_CURRENT']);
  });

  it('login form with no helpful attributes (label text only)', () => {
    expect(
      kinds(`<form><label>Login<input id="a"></label><label>Secret<input id="b" type="password"></label><button>Go</button></form>`, 'Log in'),
    ).toEqual(['USERNAME', 'PASSWORD_CURRENT']);
  });

  it('sign-up form with confirmation', () => {
    expect(
      kinds(`<form><h1>Create your account</h1><input name="fullname" placeholder="Full name"><input type="email" name="email">
        <input type="password" name="password"><input type="password" name="password_confirm"><button>Sign up</button></form>`),
    ).toEqual(['NAME', 'USERNAME', 'PASSWORD_NEW', 'PASSWORD_NEW']);
  });

  it('change-password form: current, new, confirm', () => {
    expect(
      kinds(`<form><h2>Change password</h2><input type="password" name="pw1"><input type="password" name="pw2"><input type="password" name="pw3"><button>Update</button></form>`),
    ).toEqual(['PASSWORD_CURRENT', 'PASSWORD_NEW', 'PASSWORD_NEW']);
  });

  it('username-only first step of a split login', () => {
    expect(kinds(`<form><h1>Sign in</h1><input type="text" name="identifier" aria-label="Email or phone"><button>Next</button></form>`)).toEqual(['USERNAME']);
  });

  it('OTP code field', () => {
    expect(kinds(`<form><h1>Two-factor authentication</h1><input name="otp" inputmode="numeric" maxlength="6" placeholder="6-digit code"><button>Verify</button></form>`)).toEqual([
      'TOTP_CODE',
    ]);
  });

  it('autocomplete tokens win', () => {
    expect(kinds(`<form><input autocomplete="username"><input type="password" autocomplete="new-password"></form>`)).toEqual([
      'USERNAME',
      'PASSWORD_NEW',
    ]);
  });

  it('address form with identity keys', () => {
    document.body.innerHTML = `<form><input name="first_name"><input name="lastName"><input name="address1" placeholder="Street address">
      <input name="city"><input name="zip" maxlength="5"><select name="country"><option>United States</option></select></form>`;
    bumpGeneration();
    const g = analyzeGroup(document.querySelector('form')!);
    expect(g.fields.map((f) => [f.kind, f.identityKey])).toEqual([
      ['NAME', 'givenName'],
      ['NAME', 'familyName'],
      ['ADDRESS', 'street'],
      ['ADDRESS', 'city'],
      ['ADDRESS', 'postalCode'],
      ['ADDRESS', 'country'],
    ]);
  });

  it('ignores search boxes', () => {
    expect(kinds(`<form role="search"><input type="search" name="q" placeholder="Search"></form>`)).toEqual(['UNKNOWN']);
  });

  it('finds fields inside open shadow roots', () => {
    document.body.innerHTML = '<login-widget></login-widget>';
    const host = document.querySelector('login-widget')!;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<form><input name="username"><input type="password" name="password"><button>Sign in</button></form>';
    expect(candidateFields(document).length).toBe(2);
  });
});

describe('field classifier: newsletter vs login', () => {
  it('a lone email box on a non-login page is EMAIL, not a username', () => {
    expect(kinds(`<form><h3>Subscribe to our newsletter</h3><input type="email" name="email"><button>Subscribe</button></form>`)).toEqual(['EMAIL']);
  });
});
