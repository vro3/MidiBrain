import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import obfuscator from 'vite-plugin-javascript-obfuscator';

// Obfuscation only runs in production builds. The renderer JS ends up inside
// the asar archive on Mac/Windows; this raises the bar on anyone running
// `npx asar extract` to read the source. See docs in plan file.
const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('build');

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(isProd
      ? [
          obfuscator({
            // Apply only to our renderer code, not vendor chunks (vendor is
            // already minified, and obfuscating React/etc adds significant
            // build time + may break dev hooks).
            include: ['**/src/**/*.ts', '**/src/**/*.tsx'],
            options: {
              compact: true,
              controlFlowFlattening: true,
              controlFlowFlatteningThreshold: 0.5,
              deadCodeInjection: false,
              identifierNamesGenerator: 'mangled-shuffled',
              renameGlobals: false,
              selfDefending: false,
              splitStrings: true,
              splitStringsChunkLength: 8,
              stringArray: true,
              stringArrayEncoding: ['base64'],
              stringArrayThreshold: 0.6,
              transformObjectKeys: false,
              unicodeEscapeSequence: false,
              target: 'browser',
            },
          }),
        ]
      : []),
  ],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3456,
    host: '0.0.0.0',
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: { toplevel: true },
      format: { comments: false },
    },
  },
});
