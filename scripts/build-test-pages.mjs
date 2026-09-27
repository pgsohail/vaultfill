// Bundles the React test page (the one that proves framework-controlled inputs get filled).
import { build } from 'vite';
import react from '@vitejs/plugin-react';

await build({
  configFile: false,
  logLevel: 'warn',
  plugins: [react()],
  build: {
    outDir: 'test-pages/react-build',
    emptyOutDir: true,
    lib: { entry: 'test-pages/react-src/main.tsx', formats: ['es'], fileName: () => 'main.js' },
  },
  define: { 'process.env.NODE_ENV': '"production"' },
});
console.log('test-pages/react-build/main.js built');
