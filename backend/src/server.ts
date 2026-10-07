import { assertEnvironment, EnvironmentError } from './config/env';
import './config/timezone';

// Confere a configuração antes de carregar o app: módulos que leem variável
// ao serem importados não podem chegar a rodar com ela faltando.
try {
  assertEnvironment();
} catch (error) {
  if (!(error instanceof EnvironmentError)) throw error;
  console.error(error.message);
  process.exit(1);
}

const PORT = process.env.PORT || 3001;

void import('./app').then(({ default: app }) => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
