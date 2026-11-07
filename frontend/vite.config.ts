import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { parseRuntimeConfig, RuntimeConfigError } from './src/config/runtimeConfig'

// Only for `vite dev`: serves /runtime-config.json from the local VITE_* files.
// A build never reads these values, so they cannot reach the bundle.
//
// The values go through the browser's validator before being served. A refused
// value is never sent or logged: only the sanitized problems are.
function devRuntimeConfig(): Plugin {
  let env: Record<string, string> = {}
  return {
    name: 'dev-runtime-config',
    apply: 'serve',
    configResolved(config) {
      env = loadEnv(config.mode, config.root, 'VITE_')
    },
    configureServer(server) {
      let status = 200
      let body: string
      try {
        body = JSON.stringify(parseRuntimeConfig({
          apiUrl: env.VITE_API_URL,
          supabaseUrl: env.VITE_SUPABASE_URL,
          supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
        }))
      } catch (error) {
        const problems = error instanceof RuntimeConfigError
          ? error.problems
          : ['não foi possível validar a configuração local.']
        status = 500
        body = JSON.stringify({ error: 'Configuração local inválida.', problems })
        server.config.logger.error(`runtime-config: configuração local recusada. ${problems.join(' ')}`)
      }

      server.middlewares.use('/runtime-config.json', (_req, res) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(body)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devRuntimeConfig()],
})
