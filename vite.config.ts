import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const nativeBuild = mode === 'native';
  const plugins = [react()];

  if (!nativeBuild) {
    plugins.push(VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'CAP CLAIR - Navigation VFR',
        short_name: 'CAP CLAIR',
        description: 'CAP CLAIR - Navigation VFR web/PWA.',
        theme_color: '#050B12',
        background_color: '#050B12',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']
      }
    }));
  }

  return {
    plugins,
    build: {
      sourcemap: false,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 900
    }
  };
});
