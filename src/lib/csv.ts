import type { ImportedLogin, LoginEntry } from './types';

/** RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

// Header aliases for Chrome, Edge, Firefox, Bitwarden, LastPass, 1Password, Dashlane, KeePassXC exports.
const COLUMNS: Record<keyof ImportedLogin, string[]> = {
  title: ['name', 'title', 'account', 'item name'],
  url: ['url', 'login_uri', 'website', 'web site', 'uri', 'hostname', 'login url'],
  username: ['username', 'login_username', 'login', 'user', 'email', 'user name', 'login name'],
  password: ['password', 'login_password', 'pass'],
  totp: ['totp', 'login_totp', 'otpauth', 'otp', 'one-time password', 'otpurl'],
  notes: ['notes', 'note', 'extra', 'comments'],
};

export function importCsv(text: string): { logins: ImportedLogin[]; format: string } {
  const [header, ...rows] = parseCsv(text);
  if (!header) return { logins: [], format: 'empty' };
  const norm = header.map((h) => h.trim().toLowerCase());
  const idx = {} as Record<keyof ImportedLogin, number>;
  for (const key of Object.keys(COLUMNS) as (keyof ImportedLogin)[]) {
    idx[key] = norm.findIndex((h) => COLUMNS[key].includes(h));
  }
  if (idx.password < 0) throw new Error('CSV has no password column');

  const format = norm.includes('login_uri')
    ? 'Bitwarden'
    : norm.includes('grouping')
      ? 'LastPass'
      : norm.includes('otpurl')
        ? '1Password'
        : norm.includes('httprealm')
          ? 'Firefox'
          : 'Chrome / generic';

  const get = (r: string[], k: keyof ImportedLogin) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');
  const logins = rows
    .map((r) => ({
      title: get(r, 'title'),
      url: get(r, 'url').split(/[\n,]/)[0].trim(),
      username: get(r, 'username'),
      password: r[idx.password] ?? '',
      totp: get(r, 'totp') || undefined,
      notes: get(r, 'notes') || undefined,
    }))
    .filter((l) => l.password || l.username);
  return { logins, format };
}

function cell(v: string | undefined): string {
  const s = v ?? '';
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Chrome-compatible export (name,url,username,password,note) plus a totp column. */
export function exportCsv(entries: LoginEntry[]): string {
  const lines = ['name,url,username,password,totp,note'];
  for (const e of entries) {
    lines.push([e.title, e.url, e.username, e.password, e.totp, e.notes].map(cell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
