import { assertEnvironment, EnvironmentError, type AppEnvironment } from './config/env';
import './config/timezone';
import {
  createMarkerClient,
  InstallationCheckError,
  readInstallationMarker,
  verifyInstallation,
} from './config/installation';

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

// Encerra sem stack trace e sem valores de configuração na saída.
const refuseToStart = (message: string): never => {
  console.error(message);
  process.exit(1);
};

async function start(): Promise<void> {
  // Identidade da instalação: o banco precisa ser o desta instalação e deste
  // ambiente antes de qualquer requisição ser aceita. O marcador nunca é criado
  // aqui (Etapa 1B.1).
  try {
    const marker = await verifyInstallation(
      {
        installationId: process.env.INSTALLATION_ID as string,
        environment: process.env.APP_ENV as AppEnvironment,
      },
      () => readInstallationMarker(
        createMarkerClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string)
      )
    );
    console.log(`Instalação confirmada: ${marker.installationId} (${marker.environment}).`);
  } catch (error) {
    if (error instanceof InstallationCheckError) refuseToStart(error.message);
    refuseToStart('Falha inesperada ao conferir a identidade da instalação; o servidor não vai subir.');
  }

  const { default: app } = await import('./app');
  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    refuseToStart(`Não foi possível abrir a porta ${PORT} (${error.code ?? 'erro desconhecido'}); o servidor não vai subir.`);
  });
}

start().catch(() => {
  refuseToStart('Falha inesperada na inicialização; o servidor não vai subir.');
});
