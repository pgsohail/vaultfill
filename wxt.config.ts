import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    // Never ship source maps in store builds.
    build: { sourcemap: false, minify: true, chunkSizeWarningLimit: 700 },
  }),
  manifest: ({ browser }) => ({
    name: 'VaultFill',
    description:
      'Zero-knowledge password manager with framework-proof autofill. Your vault never leaves this device.',
    permissions: ['storage', 'activeTab', 'scripting', 'alarms', 'idle'],
    host_permissions: ['<all_urls>'],
    commands: {
      'cycle-account': {
        suggested_key: { default: 'Alt+A', mac: 'Alt+A' },
        description: 'Fill the focused login form, press again to cycle saved accounts',
      },
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+V', mac: 'Alt+Shift+V' },
      },
    },
    ...(browser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: 'vaultfill@example.com', strict_min_version: '128.0' } } }
      : {}),
  }),
});
