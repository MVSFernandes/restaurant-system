import { useEffect, useState } from 'react';
import api from '../../services/api';
import type { RestaurantConfig } from '../../types';
import { useToast } from '../../components/ui';
import { buildSettingsPayload } from '../../lib/settings';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

export type SettingsFieldErrors = Partial<Record<keyof RestaurantConfig, string>>;
type SettingsValidator = (config: Partial<RestaurantConfig>) => SettingsFieldErrors;

export function useSettingsForm(
  validate?: SettingsValidator,
  onSaved?: () => void | Promise<void>
) {
  const [config, setConfig] = useState<Partial<RestaurantConfig>>({});
  const [savedConfig, setSavedConfig] = useState<Partial<RestaurantConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const { toast } = useToast();
  const isDirty = !loading && JSON.stringify(config) !== JSON.stringify(savedConfig);
  const navigation = useUnsavedChanges(isDirty);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data } = await api.get('/config');
        setConfig(data);
        setSavedConfig(data);
      } catch (error) {
        console.error(error);
        toast({ title: 'Erro ao carregar configurações', description: 'Tente novamente.', variant: 'error' });
      } finally {
        setLoading(false);
      }
    };
    void fetchConfig();
  }, [toast]);

  const updateConfigField = <K extends keyof RestaurantConfig>(field: K, value: RestaurantConfig[K] | undefined) => {
    setConfig((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const syncConfigField = <K extends keyof RestaurantConfig>(field: K, value: RestaurantConfig[K] | undefined) => {
    setConfig((current) => ({ ...current, [field]: value }));
    setSavedConfig((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    const errors = validate?.(config) ?? {};
    const invalidFields = Object.keys(errors) as Array<keyof RestaurantConfig>;
    if (invalidFields.length > 0) {
      setFieldErrors(errors);
      const firstField = invalidFields[0];
      window.requestAnimationFrame(() => document.getElementById(`settings-${String(firstField)}`)?.focus());
      toast({ title: 'Revise os campos destacados', description: errors[firstField], variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const payload = buildSettingsPayload(config);
      await api.put('/config', payload);
      setConfig(payload);
      setSavedConfig(payload);
      setFieldErrors({});
      await onSaved?.();
      toast({ title: 'Configurações salvas com sucesso', variant: 'success' });
    } catch (error) {
      console.error(error);
      const apiMessage = (error as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      toast({
        title: 'Erro ao salvar configurações',
        description: apiMessage || 'Não foi possível salvar as configurações.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    config,
    fieldErrors,
    loading,
    navigation,
    saving,
    handleSave,
    updateConfigField,
    syncConfigField,
  };
}
