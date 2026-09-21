import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark } from '../../components/branding/BrandMark';
import { Button, Field, Input } from '../../components/ui';
import { useBranding } from '../../contexts/brandingContext';
import { useAuth } from '../../hooks/useAuth';

const LoginPage: React.FC = () => {
  const { signIn } = useAuth();
  const { displayName, logoUrl } = useBranding();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@admin.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await signIn(email, password);
      navigate(user.role === 'WAITER' ? '/waiter/tables' : '/dashboard');
    } catch (loginError: unknown) {
      const message = (loginError as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      setError(message || 'Erro ao fazer login. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-canvas text-default lg:grid-cols-[minmax(28rem,42%)_1fr]">
      <section className="flex min-h-screen flex-col bg-surface px-6 py-8 sm:px-10 lg:px-16">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md">
            <div className="mb-9 text-center">
              <BrandMark
                name={displayName}
                logoUrl={logoUrl}
                className="mx-auto mb-4 h-20 w-20 rounded-token-xl shadow-token-sm"
                fallbackClassName="text-display"
              />
              <h1 className="text-title text-default">{displayName}</h1>
              <p className="mt-2 text-body text-muted">Acesse o sistema de gestão</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <Field label="E-mail">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@admin.com"
                  autoComplete="username"
                  required
                />
              </Field>

              <Field label="Senha">
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </Field>

              {error && (
                <div role="alert" className="rounded-token-md border border-danger bg-danger-subtle px-4 py-3 text-body text-danger">
                  {error}
                </div>
              )}

              <Button type="submit" loading={loading} fullWidth size="lg">
                Entrar
              </Button>
            </form>
          </div>
        </div>

        <p className="pt-8 text-center text-caption text-subtle">Restaurant System</p>
      </section>

      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-orange-600 to-primary-hover lg:block" aria-hidden="true">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(30deg, rgba(255,255,255,.28) 12%, transparent 12.5%, transparent 87%, rgba(255,255,255,.28) 87.5%, rgba(255,255,255,.28)), linear-gradient(150deg, rgba(255,255,255,.18) 12%, transparent 12.5%, transparent 87%, rgba(255,255,255,.18) 87.5%, rgba(255,255,255,.18))',
            backgroundSize: '72px 126px',
          }}
        />
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-white/20 bg-white/10" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full border border-white/20 bg-black/10" />
        <div className="relative flex h-full items-center justify-center p-16">
          <div className="max-w-lg text-white">
            <p className="text-label font-semibold uppercase tracking-[0.24em] text-white/75">Gestão integrada</p>
            <p className="mt-5 text-4xl font-bold leading-tight">Seu restaurante organizado do atendimento ao financeiro.</p>
            <p className="mt-5 max-w-md text-body-lg text-white/80">Pedidos, estoque, caixa e documentos fiscais reunidos em um só lugar.</p>
          </div>
        </div>
      </aside>
    </main>
  );
};

export default LoginPage;
