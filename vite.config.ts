import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command, mode }) => {
  const demo = command === 'serve' || mode === 'demo'
  return {
    plugins: demo ? [vue()] : [],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src/demo', import.meta.url)),
        '@scotec/vue-unified-rbac': fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 8080,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: demo ? {
      outDir: 'demo-dist',
    } : {
      outDir: 'dist',
      copyPublicDir: false,
      lib: {
        entry: fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
        name: 'VueUnifiedRbac',
        formats: ['es'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        external: ['vue', 'pinia', 'vue-router', 'axios', 'keycloak-js'],
      },
    },
  }
})
