/// <reference types="chrome" />
import { chromium, test as base, type BrowserContext, type Page, type Worker } from '@playwright/test';
import path from 'node:path';

const EXT = path.resolve('.output/chrome-mv3');
export const ORIGIN = (host: string) => `http://${host}:5174`;
export const MASTER = 'e2e-Master-Password-2026!';

type Fixtures = { context: BrowserContext; sw: Worker; extId: string; ext: (type: string, payload?: object) => Promise<any> };

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: !process.env.HEADED,
      args: [
        `--disable-extensions-except=${EXT}`,
        `--load-extension=${EXT}`,
        // Fake domains → local test server so eTLD+1 logic is exercised for real.
        '--host-resolver-rules=MAP *.test 127.0.0.1',
      ],
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(sw);
  },
  extId: async ({ sw }, use) => use(new URL(sw.url()).host),
  /** Sends a popup-scoped message from a real extension page. */
  ext: async ({ context, extId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/popup.html?welcome=1`);
    await use(async (type, payload = {}) => {
      const r = await page.evaluate(([type, payload]) => chrome.runtime.sendMessage({ type, ...(payload as object) }), [type, payload] as const);
      if (!r?.ok) throw new Error(`${type}: ${r?.error}`);
      return r.data;
    });
    await page.close();
  },
});

export const expect = test.expect;

/** Focus a field like a user and accept the first (or nth) suggestion from the in-page menu. */
export async function pick(page: Page, selector: string, downPresses = 0) {
  await page.click(selector);
  await page.waitForSelector('vaultfill-menu', { state: 'attached' });
  await page.waitForTimeout(350); // menu ignores input for 250ms (clickjacking guard)
  for (let i = 0; i < downPresses; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
}

export async function setupVault(ext: Fixtures['ext']) {
  await ext('vault:setup', { password: MASTER });
  await ext('vault:upsert', { entry: { title: 'Bank', url: ORIGIN('bank.test'), username: 'alice@bank.test', password: 'Alice-Pass-1' } });
}
