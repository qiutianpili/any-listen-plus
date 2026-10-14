// Folia visualizer → Any Listen detail-page bundle (standalone ES module + lazy chunks).
// Built from an unmodified copy of Folia Major v0.7.19 src (./folia-src) with a few modules stubbed
// (video layer, Folium mod slots, i18n bootstrap) so nothing needing Electron/Node/online APIs is pulled in.
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FS = path.resolve(__dirname, 'folia-src');
const ST = path.resolve(__dirname, 'src/stubs');

// absolute module path (no extension) inside folia-src -> stub file
const STUBS: Record<string, string> = {
  'components/visualizer/videoLayer/VideoLayer': 'VideoLayer.tsx',
  'mods/folium/registries/stageLayers': 'stageLayers.tsx',
  'mods/folium/registries/tunings': 'tunings.ts',
  'i18n/config': 'i18nConfig.ts',
  'utils/localMetadataWorkerClient': 'localMetadataWorkerClient.ts',
  'components/visualizer/loadPixi': 'loadPixi.ts',
};
const stubMap = new Map(Object.entries(STUBS).map(([k, v]) => [path.join(FS, k), path.join(ST, v)]));

// Every Folia module that touches localStorage gets an explicit import of the namespaced store, so it is
// initialised before first use regardless of chunk evaluation order ("folia:" key prefix, see src/ls.ts).
const LS_FILE = path.resolve(__dirname, 'src/ls.ts');
function lsPlugin(): Plugin {
  return {
    name: 'folia-al-localstorage',
    enforce: 'pre',
    transform(code, id) {
      if (!id.startsWith(FS) || !/\blocalStorage\b/.test(code)) return null;
      const out = code.replace(/(?<![\w$.])(?:window\.|globalThis\.)?localStorage\b/g, '__foliaLS');
      return { code: `import { __foliaLS } from ${JSON.stringify(LS_FILE)};\n` + out, map: null };
    },
  };
}

function stubPlugin(): Plugin {
  return {
    name: 'folia-al-stubs',
    enforce: 'pre',
    async resolveId(source, importer, opts) {
      if (!importer) return null;
      let abs: string | null = null;
      if (source.startsWith('@/')) abs = path.join(FS, source.slice(2));
      else if (source.startsWith('.')) abs = path.resolve(path.dirname(importer), source);
      if (!abs) return null;
      const noExt = abs.replace(/\.(tsx?|jsx?)$/, '');
      const hit = stubMap.get(noExt);
      if (hit) return hit;
      return null;
    },
  };
}

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
const BANNER = `/*! Folia visualizer for Any Listen Plus (folia-al ${pkg.version}).
 * Contains code from Folia Major v0.7.19 (https://github.com/chthollyphile/folia-major)
 * Copyright (C) chthollyphile and Folia contributors. Licensed under the GNU Affero General Public License v3.0.
 * Modifications (Any Listen adapter, stubs) by the Any Listen Plus maintainer, same license.
 * Bundled third-party libraries keep their own licenses (React MIT, framer-motion MIT, pixi.js MIT, three.js MIT, ...).
 * Full license text: ./LICENSE (AGPL-3.0). Source of this build: any-listen-plus/plus/folia (build.sh there reproduces it from upstream + folia-src.patch). */`;

export default defineConfig({
  root: __dirname,
  base: './',
  publicDir: false,
  plugins: [stubPlugin(), lsPlugin(), react()],
  resolve: { alias: { '@': FS, '@xmldom/xmldom': path.join(ST, 'xmldom.ts'), '@applemusic-like-lyrics/ttml': path.join(ST, 'amllTtml.ts') } },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    '__APP_VERSION__': JSON.stringify('0.7.19-al'),
    '__BUILD_COMMIT__': JSON.stringify('al'),
    '__BUILD_KIND__': JSON.stringify('web'),
    '__BUILD_REPO__': JSON.stringify('chthollyphile/folia-major'),
    'import.meta.env.VITE_ELECTRON': 'false',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    sourcemap: !!process.env.SM,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: { 'folia-player': path.resolve(__dirname, 'src/main.tsx') },
      preserveEntrySignatures: 'exports-only',
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        banner: (chunk) => (chunk.isEntry ? BANNER : '/*! Part of folia-al: Folia Major (AGPL-3.0) + bundled libraries; see folia-player.js header */'),
      },
    },
  },
});
