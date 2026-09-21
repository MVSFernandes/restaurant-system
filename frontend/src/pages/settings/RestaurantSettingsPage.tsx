import { Copy } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CurrencyInput,
  Field,
  ImageUpload,
  Input,
  useToast,
} from '../../components/ui';
import { useBranding } from '../../contexts/brandingContext';
import api from '../../services/api';
import type { RestaurantConfig } from '../../types';
import { SettingsPageLayout } from './SettingsPageLayout';
import { useSettingsForm } from './useSettingsForm';

type BrandingKind = 'logo' | 'banner';

const RestaurantSettingsPage = () => {
  const { refresh: refreshBranding } = useBranding();
  const {
    config,
    loading,
    navigation,
    saving,
    handleSave,
    updateConfigField,
    syncConfigField,
  } = useSettingsForm(undefined, refreshBranding);
  const { toast } = useToast();
  const menuUrl = window.location.origin + '/cardapio';

  const copyMenuUrl = async () => {
    try {
      await navigator.clipboard.writeText(menuUrl);
      toast({ title: 'Link do cardápio copiado', variant: 'success' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao copiar link', description: 'Copie o endereço manualmente.', variant: 'error' });
    }
  };

  const uploadImage = async (kind: BrandingKind, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<RestaurantConfig>('/config/branding/' + kind, formData);
    const field = kind === 'logo' ? 'logoUrl' : 'bannerUrl';
    syncConfigField(field, data[field]);
    await refreshBranding();
  };

  const removeImage = async (kind: BrandingKind) => {
    const { data } = await api.delete<RestaurantConfig>('/config/branding/' + kind);
    const field = kind === 'logo' ? 'logoUrl' : 'bannerUrl';
    syncConfigField(field, data[field]);
    await refreshBranding();
  };

  return (
    <SettingsPageLayout
      title="Restaurante"
      description="Configure as informações gerais do seu restaurante"
      loading={loading}
      saving={saving}
      confirmationOpen={navigation.confirmationOpen}
      onSave={handleSave}
      onCancelNavigation={navigation.cancelNavigation}
      onConfirmNavigation={navigation.confirmNavigation}
    >
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Informações gerais</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field id="settings-name" label="Nome do Restaurante"><Input value={config.name ?? ''} onChange={(event) => updateConfigField('name', event.target.value)} /></Field>
            <Field id="settings-phone" label="Telefone"><Input type="tel" value={config.phone ?? ''} onChange={(event) => updateConfigField('phone', event.target.value)} /></Field>
            <Field id="settings-address" label="Endereço" className="md:col-span-2"><Input value={config.address ?? ''} onChange={(event) => updateConfigField('address', event.target.value)} /></Field>
            <Field id="settings-openingHours" label="Horário de Funcionamento"><Input value={config.openingHours ?? ''} onChange={(event) => updateConfigField('openingHours', event.target.value)} placeholder="Ex: 11h às 23h" /></Field>
            <Field id="settings-openingDays" label="Dias de Funcionamento"><Input value={config.openingDays ?? ''} onChange={(event) => updateConfigField('openingDays', event.target.value)} placeholder="Ex: Segunda a Domingo" /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Imagens</CardTitle>
            <CardDescription>Envie a identidade visual usada pelo sistema e pelo cardápio digital.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <ImageUpload
              label="Logo do restaurante"
              value={config.logoUrl}
              maxSizeMb={2}
              helpText="Aparece na barra lateral, login, aba do navegador e comanda impressa. Recomendamos uma imagem quadrada com fundo transparente."
              disabled={loading || saving}
              onUpload={(file) => uploadImage('logo', file)}
              onRemove={() => removeImage('logo')}
            />
            <ImageUpload
              label="Banner do cardápio digital"
              value={config.bannerUrl}
              maxSizeMb={4}
              helpText="Aparece no topo do cardápio digital. Recomendamos uma imagem horizontal."
              disabled={loading || saving}
              onUpload={(file) => uploadImage('banner', file)}
              onRemove={() => removeImage('banner')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Entrega</CardTitle></CardHeader>
          <CardContent className="max-w-sm">
            <Field id="settings-deliveryFee" label="Taxa de Entrega">
              <CurrencyInput value={config.deliveryFee ?? null} onValueChange={(value) => updateConfigField('deliveryFee', value ?? undefined)} min={0} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cardápio digital</CardTitle><CardDescription>Compartilhe este endereço com seus clientes.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field id="settings-menu-url" label="Link do cardápio" className="min-w-0 flex-1"><Input value={menuUrl} readOnly /></Field>
            <Button variant="secondary" leftIcon={<Copy aria-hidden="true" />} onClick={() => void copyMenuUrl()}>Copiar Link</Button>
          </CardContent>
        </Card>
      </div>
    </SettingsPageLayout>
  );
};

export default RestaurantSettingsPage;
