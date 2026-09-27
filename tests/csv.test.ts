import { describe, expect, it } from 'vitest';
import { exportCsv, importCsv, parseCsv } from '@/lib/csv';
import type { LoginEntry } from '@/lib/types';

describe('CSV', () => {
  it('parses quotes, escaped quotes and embedded newlines', () => {
    expect(parseCsv('a,"b,c","d ""q""","multi\nline"\r\n1,2,3,4')).toEqual([
      ['a', 'b,c', 'd "q"', 'multi\nline'],
      ['1', '2', '3', '4'],
    ]);
  });

  it('imports Bitwarden exports', () => {
    const csv =
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n' +
      ',,login,GitHub,,,,https://github.com,alice,"p,ss",JBSWY3DPEHPK3PXP\n';
    const { logins, format } = importCsv(csv);
    expect(format).toBe('Bitwarden');
    expect(logins[0]).toMatchObject({ title: 'GitHub', url: 'https://github.com', username: 'alice', password: 'p,ss', totp: 'JBSWY3DPEHPK3PXP' });
  });

  it('imports Chrome exports and round-trips its own export', () => {
    const entry = { id: '1', title: 'Ex "Q"', url: 'https://ex.com', username: 'u', password: 'a,b\nc', createdAt: 0, updatedAt: 0 } as LoginEntry;
    const { logins } = importCsv(exportCsv([entry]));
    expect(logins[0]).toMatchObject({ title: 'Ex "Q"', url: 'https://ex.com', username: 'u', password: 'a,b\nc' });
  });

  it('rejects files without a password column', () => {
    expect(() => importCsv('name,url\nx,y')).toThrow();
  });
});
