import type { ReactNode } from 'react';
import { Save } from 'lucide-react';
import { Button, ConfirmDialog, PageHeader, SkeletonCard } from '../../components/ui';

type SettingsPageLayoutProps = {
  title: string;
  description: string;
  loading: boolean;
  saving: boolean;
  confirmationOpen: boolean;
  onSave: () => void | Promise<void>;
  onCancelNavigation: () => void;
  onConfirmNavigation: () => void;
  children: ReactNode;
};

export function SettingsPageLayout({
  title,
  description,
  loading,
  saving,
  confirmationOpen,
  onSave,
  onCancelNavigation,
  onConfirmNavigation,
  children,
}: SettingsPageLayoutProps) {
  if (loading) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <div className="grid gap-4 md:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={(
          <Button leftIcon={<Save aria-hidden="true" />} loading={saving} onClick={() => void onSave()}>
            Salvar
          </Button>
        )}
      />
      {children}
      <ConfirmDialog
        open={confirmationOpen}
        onClose={onCancelNavigation}
        onConfirm={onConfirmNavigation}
        title="Descartar alterações?"
        description="Há alterações não salvas. Se sair agora, elas serão perdidas."
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        variant="danger"
      />
    </div>
  );
}
