import { RuntimeConfigError } from './runtimeConfig';

// Plain DOM with inline styles: this screen must work when the application
// bundle, its CSS and React were never loaded.
export function renderStartupError(error: unknown) {
  console.error(error);

  const isConfigError = error instanceof RuntimeConfigError;
  const problems = isConfigError ? error.problems : ['Recarregue a página. Se o problema continuar, avise o suporte.'];

  const panel = document.createElement('main');
  panel.setAttribute('role', 'alert');
  panel.style.cssText = 'max-width:40rem;margin:4rem auto;padding:0 1.5rem;font-family:system-ui,sans-serif;color:#1f2937;';

  const title = document.createElement('h1');
  title.style.cssText = 'font-size:1.25rem;margin:0 0 .75rem;';
  title.textContent = isConfigError
    ? 'Esta instalação não está configurada corretamente'
    : 'Não foi possível iniciar o sistema';
  panel.append(title);

  if (isConfigError) {
    const intro = document.createElement('p');
    intro.textContent = 'O sistema não foi iniciado e nenhuma conexão foi aberta. O responsável pela instalação precisa corrigir:';
    panel.append(intro);
  }

  const list = document.createElement('ul');
  for (const problem of problems) {
    const item = document.createElement('li');
    item.textContent = problem;
    list.append(item);
  }
  panel.append(list);

  (document.getElementById('root') ?? document.body).replaceChildren(panel);
}
