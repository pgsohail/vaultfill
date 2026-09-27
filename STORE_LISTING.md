# Store submission kit

## Short description (132 chars max)
Zero-knowledge password manager with autofill that works on React, shadow DOM and multi-step logins. Your vault never leaves this device.

## Category
Productivity (Chrome) / Privacy & Security (Firefox)

## Single purpose (Chrome Web Store)
VaultFill stores the user's passwords in an encrypted on-device vault and fills them into login, sign-up and address forms.

## Permission justifications

| Permission | Justification |
|---|---|
| Host permission `<all_urls>` | VaultFill is a universal autofill tool. It has to detect and fill login forms on whatever site the user visits, including inside cross-origin login iframes (`all_frames`). No page data leaves the device. |
| `storage` | Keeps the AES-256-GCM encrypted vault on the device (local) and the unlocked key plus short-lived unsaved passwords in RAM-only session storage. |
| `alarms` | Runs the inactivity auto-lock and deletes expired unsaved passwords. |
| `idle` | Locks the vault when the operating system locks. |
| `activeTab` | Shows the current site's logins when the user opens the popup. |
| `scripting` | Fills the focused form when the user presses the Alt+A shortcut. |

## Remote code
No. All code is bundled. There are no network requests.

## Data usage disclosures (Chrome)
- Collects: **Authentication information**, **Personally identifiable information** (identity profile). Both are stored only on the device, encrypted, and never transmitted.
- Not sold, not used for unrelated purposes, not used for creditworthiness.

## Pre-submission checklist
- [ ] Bump `version` in package.json
- [ ] `npm run compile && npm test && npm run test:e2e`
- [ ] `npm run zip` → upload `.output/vaultfill-<v>-chrome.zip` in the Chrome Developer Dashboard (the same zip works for Edge Add-ons)
- [ ] `npm run zip:firefox` → upload the firefox zip **and** the sources zip to addons.mozilla.org
- [ ] Replace `vaultfill@example.com` (gecko id) and `privacy@example.com` with real values
- [ ] Host PRIVACY.md at a public URL and link it in the listing
- [ ] Screenshots at 1280×800: in-page menu, save prompt, popup logins, generator, unsaved tab
