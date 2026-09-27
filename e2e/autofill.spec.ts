/// <reference types="chrome" />
import { ORIGIN, expect, pick, setupVault, test } from './fixtures';
import { totp } from '../src/lib/totp';

const bank = ORIGIN('bank.test');

test.beforeEach(async ({ ext }) => setupVault(ext));

test('fills a plain login form', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${bank}/login.html`);
  await pick(page, '#user');
  await expect(page.locator('#user')).toHaveValue('alice@bank.test');
  await expect(page.locator('#pass')).toHaveValue('Alice-Pass-1');
});

test('React controlled inputs receive the value in component state', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${bank}/react.html`);
  await pick(page, '#user');
  await expect(page.locator('button')).toBeEnabled(); // only enabled when React state has both values
  await page.click('button');
  await expect(page.locator('#result')).toHaveText('state: alice@bank.test / 12 chars');
});

test('pierces open and closed (nested) shadow roots', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${bank}/shadow.html`);
  await pick(page, 'login-card#open input[name=username]');
  await expect(page.locator('login-card#open input[name=password]')).toHaveValue('Alice-Pass-1');

  await page.waitForTimeout(500); // post-fill focus suppression
  await page.evaluate(() => (window as any).closedRoot.querySelector('text-field').shadowRoot.querySelector('input').focus());
  await page.waitForSelector('vaultfill-menu', { state: 'attached' });
  await page.waitForTimeout(350);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const values = await page.evaluate(() =>
    [...(window as any).closedRoot.querySelectorAll('text-field')].map((t: any) => t.shadowRoot.querySelector('input').value),
  );
  expect(values).toEqual(['alice@bank.test', 'Alice-Pass-1']);
});

test('never fills hidden or covered bait fields', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${bank}/bait.html`);
  await pick(page, '#user');
  await expect(page.locator('#user')).toHaveValue('alice@bank.test');
  await expect(page.locator('#pass')).toHaveValue('Alice-Pass-1');
  for (const id of ['b1', 'b2', 'b3', 'b4', 'b5']) await expect(page.locator(`#${id}`)).toHaveValue('');
});

test('offers nothing on a look-alike domain', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN('bank.test.evil.test')}/login.html`);
  await page.click('#user');
  await page.waitForTimeout(800);
  expect(await page.locator('vaultfill-menu').count()).toBe(0);
});

test('split login: username page links to password page', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${bank}/step1.html`);
  await pick(page, '#user');
  await expect(page.locator('#user')).toHaveValue('alice@bank.test');
  await page.keyboard.press('Enter');
  await page.waitForURL(/step2/);
  await pick(page, '#pass');
  await expect(page.locator('#pass')).toHaveValue('Alice-Pass-1');
});

test('captures a new split login and prompts to save after navigation', async ({ context, ext }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN('shop.test')}/step1.html`);
  await page.fill('#user', 'bob@shop.test');
  await page.keyboard.press('Enter');
  await page.waitForURL(/step2/);
  await page.fill('#pass', 'Bob-Secret-9');
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/);
  await page.waitForSelector('vaultfill-notice', { state: 'attached' });
  const { items } = await ext('staged:list');
  expect(items.find((s: any) => s.site === 'shop.test')).toMatchObject({ username: 'bob@shop.test', password: 'Bob-Secret-9', source: 'submitted' });
});

test('generated password fills both boxes and survives a failed submit/reload', async ({ context, ext }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN('new.test')}/signup.html`);
  await page.fill('#user', 'carol@new.test');
  await pick(page, '#pass');
  const generated = await page.locator('#pass').inputValue();
  expect(generated).toHaveLength(20);
  await expect(page.locator('#pass2')).toHaveValue(generated);
  await expect(page.locator('#name')).toHaveValue('');

  // It's staged before submit…
  const { items } = await ext('staged:list');
  expect(items.some((s: any) => s.password === generated && s.source === 'generated')).toBe(true);

  // …and offered again after the page reloads (e.g. server error).
  await page.reload();
  await pick(page, '#pass', 1);
  await expect(page.locator('#pass')).toHaveValue(generated);
});

test('SPA: form rendered after a pushState route change', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${bank}/spa.html`);
  await page.click('#go');
  await page.waitForSelector('#user');
  await pick(page, '#user');
  await expect(page.locator('#pass')).toHaveValue('Alice-Pass-1');
});

test('fills a login inside a cross-origin iframe (all_frames)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN('portal.test')}/iframe.html?frame=bank.test:5174`);
  const frame = page.frameLocator('#frame');
  await frame.locator('#user').click();
  await page.waitForTimeout(700);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await expect(frame.locator('#user')).toHaveValue('alice@bank.test');
  await expect(frame.locator('#pass')).toHaveValue('Alice-Pass-1');
});

test('Alt+A command cycles through accounts', async ({ context, ext, sw }) => {
  await ext('vault:upsert', { entry: { title: 'Bank 2', url: bank, username: 'bob@bank.test', password: 'Bob-Pass-2' } });
  const page = await context.newPage();
  await page.goto(`${bank}/login.html`);
  await page.click('#user');
  await page.keyboard.press('Escape');
  const fire = () =>
    sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await chrome.tabs.sendMessage(tab.id!, { type: 'cmd:cycle' });
    });
  await fire();
  await page.waitForTimeout(400);
  const first = await page.locator('#user').inputValue();
  await fire();
  await page.waitForTimeout(400);
  const second = await page.locator('#user').inputValue();
  expect(new Set([first, second])).toEqual(new Set(['alice@bank.test', 'bob@bank.test']));
});

test('fills a split 6-box TOTP field', async ({ context, ext }) => {
  const secret = 'JBSWY3DPEHPK3PXP';
  await ext('vault:upsert', { entry: { title: 'Bank', url: bank, username: 'totp-user', password: 'x', totp: secret } });
  const page = await context.newPage();
  await page.goto(`${bank}/otp.html`);
  await pick(page, 'input[aria-label="Digit 1"]');
  const code = (await page.locator('input').evaluateAll((els) => (els as HTMLInputElement[]).map((e) => e.value))).join('');
  const now = await totp(secret);
  const prev = await totp(secret, Date.now() - 30_000);
  expect([now.code, prev.code]).toContain(code);
});

test('identity fill on an address form (including a <select>)', async ({ context, ext }) => {
  await ext('identity:set', {
    identity: {
      fullName: 'Dana Q', givenName: 'Dana', familyName: 'Quinn', email: 'dana@x.test', phone: '+1 555 0100',
      organization: '', street: '1 Main St', city: 'Springfield', region: 'IL', postalCode: '62701', country: 'United States',
    },
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN('store.test')}/address.html`);
  await pick(page, '#fn');
  const v = (id: string) => page.locator(`#${id}`).inputValue();
  expect([await v('fn'), await v('ln'), await v('em'), await v('ph'), await v('st'), await v('ci'), await v('zp'), await v('co')]).toEqual([
    'Dana', 'Quinn', 'dana@x.test', '+1 555 0100', '1 Main St', 'Springfield', '62701', 'US',
  ]);
});

test('locked vault fills nothing and offers unlock', async ({ context, ext }) => {
  await ext('vault:lock');
  const page = await context.newPage();
  await page.goto(`${bank}/login.html`);
  await pick(page, '#user');
  await expect(page.locator('#user')).toHaveValue('');
  await expect(page.locator('#pass')).toHaveValue('');
});
