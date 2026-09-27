import { parse } from 'tldts';

/**
 * The "site" (registrable domain / eTLD+1) a URL belongs to.
 * Private suffixes are honoured, so alice.github.io and bob.github.io are different sites.
 * IPs, localhost and single-label intranet hosts fall back to the exact hostname.
 */
export function siteOf(url: string | undefined | null): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const info = parse(host, { allowPrivateDomains: true });
  if (info.isIp || !info.domain) return host;
  return info.domain;
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]';
}

/**
 * Whether a saved login may be offered on a page.
 * Requires identical eTLD+1 and refuses to hand an https credential to an http page.
 */
export function loginMatchesPage(entryUrl: string, pageUrl: string): boolean {
  const entrySite = siteOf(normalizeUrl(entryUrl));
  const pageSite = siteOf(pageUrl);
  if (!entrySite || !pageSite || entrySite !== pageSite) return false;
  const e = new URL(normalizeUrl(entryUrl));
  const p = new URL(pageUrl);
  if (e.protocol === 'https:' && p.protocol === 'http:' && !isLocalHost(p.hostname)) return false;
  return true;
}

/** Accepts "github.com" style input and turns it into a URL. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
