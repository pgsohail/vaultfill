import { describe, expect, it } from 'vitest';
import { loginMatchesPage, siteOf } from '@/lib/domain';

describe('eTLD+1 isolation', () => {
  it('computes registrable domains', () => {
    expect(siteOf('https://login.google.com/x')).toBe('google.com');
    expect(siteOf('https://www.bbc.co.uk')).toBe('bbc.co.uk');
    expect(siteOf('http://localhost:3000')).toBe('localhost');
    expect(siteOf('http://192.168.1.1/admin')).toBe('192.168.1.1');
    expect(siteOf('chrome://settings')).toBeNull();
  });

  it('matches subdomains of the same site', () => {
    expect(loginMatchesPage('https://google.com', 'https://accounts.google.com/signin')).toBe(true);
  });

  it('never matches look-alike or embedded domains', () => {
    expect(loginMatchesPage('https://google.com', 'https://google.com.phishing-domain.com')).toBe(false);
    expect(loginMatchesPage('https://google.com', 'https://google.phishing-domain.com')).toBe(false);
    expect(loginMatchesPage('https://google.com', 'https://evil.com/?q=google.com')).toBe(false);
    expect(loginMatchesPage('https://paypal.com', 'https://xn--pypal-4ve.com')).toBe(false); // IDN homograph
  });

  it('treats private suffixes (github.io) as separate sites', () => {
    expect(loginMatchesPage('https://alice.github.io', 'https://mallory.github.io')).toBe(false);
  });

  it('refuses to send https credentials to an http page', () => {
    expect(loginMatchesPage('https://example.com', 'http://example.com/login')).toBe(false);
    expect(loginMatchesPage('http://example.com', 'https://example.com/login')).toBe(true);
  });

  it('accepts bare domains typed by the user', () => {
    expect(loginMatchesPage('github.com', 'https://github.com/login')).toBe(true);
  });
});
