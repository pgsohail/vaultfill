# VaultFill Privacy Policy

_Last updated: 24 September 2026_

**VaultFill never transfers credentials or browsing data off your device.**

## What VaultFill stores, and where

| Data | Where | Form |
|---|---|---|
| Logins, 2FA secrets, notes, identity (name/address), settings | Your browser's extension storage on this device | Encrypted with AES-256-GCM using a key derived from your master password |
| The unlocked vault key | Browser session memory (RAM only) | Removed when you lock, when auto-lock runs, or when the browser exits |
| Passwords you just generated, typed into sign-up forms, or submitted (so they aren't lost) | Browser session memory (RAM only) | Deleted after 3 to 15 minutes, or sooner when you save or discard them |

Your master password is never stored and never leaves your device. Nobody, including the developers, can recover your vault without it.

## What VaultFill does not do

- It makes no network requests, runs no analytics or telemetry, and uses no remote code.
- It never sends, sells or shares any data with anyone.
- It doesn't read page content except to find and classify form fields on the page you're using, and that analysis happens only on your device.

## Permissions

- **Access to all sites (`<all_urls>`):** VaultFill is a universal autofill tool. It has to detect login, sign-up and address forms on whatever site you visit, including forms inside embedded frames.
- **storage:** keeps your encrypted vault on this device.
- **alarms, idle:** auto-lock after inactivity or when your computer locks.
- **activeTab, scripting:** show logins for the current tab in the popup, and fill on keyboard shortcut.

## Import and export

CSV import and export happen entirely on your device. Exported files are **not encrypted**, so delete them when you're done.

## Contact

privacy@example.com
