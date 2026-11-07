import { loadRuntimeConfig } from './config/runtimeConfig';
import { renderStartupError } from './config/startupError';

// The application is imported only after the configuration is valid, because
// the API and Supabase clients are created when their modules load. Nothing
// here may import them statically.
async function start() {
  await loadRuntimeConfig();
  const { renderApp } = await import('./bootstrap');
  renderApp();
}

start().catch(renderStartupError);
