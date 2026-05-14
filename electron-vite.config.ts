import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import type { Plugin } from 'vite'

/**
 * Rewrite `.js` extension imports to `.ts` when the importer lives in `shared/`.
 * Needed because shared/ is also consumed by mcp-server with NodeNext module
 * resolution, which requires explicit `.js` extensions in source. Vite's default
 * resolver would otherwise fail to find the underlying `.ts` files.
 */
const sharedDir = resolve('shared')
function sharedJsToTs(): Plugin {
  return {
    name: 'shared-js-to-ts',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!source.endsWith('.js')) return null
      if (!importer) return null
      const isInShared =
        importer.startsWith(sharedDir + '/') || importer.startsWith(sharedDir + '\\')
      if (!isInShared) return null
      const candidate = source.replace(/\.js$/, '.ts')
      return this.resolve(candidate, importer, { skipSelf: true })
    }
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['electron', 'electron-updater']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    },
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    },
    plugins: [sharedJsToTs(), react()]
  }
})
