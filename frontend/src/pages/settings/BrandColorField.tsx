import { useMemo, type CSSProperties } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button, Field, Input } from '../../components/ui';
import { deriveBrandTokens, normalizeBrandColor, type BrandTokenName, type Rgb } from '../../theme/brandColor';
import { brandColorError, DEFAULT_BRAND_COLOR } from '../../theme/brandColorForm';

function previewVariables(tokens: Partial<Record<BrandTokenName, Rgb>>): CSSProperties {
  return Object.fromEntries(
    (Object.entries(tokens) as Array<[BrandTokenName, Rgb]>).map(([name, [r, g, b]]) => [`--color-${name}`, `${r} ${g} ${b}`])
  ) as CSSProperties;
}

function Preview({ theme, style }: { theme: 'light' | 'dark'; style: CSSProperties }) {
  return (
    <div
      className={`${theme === 'dark' ? 'dark ' : ''}rounded-token-lg border border-default bg-canvas p-3`}
      style={style}
      aria-label={theme === 'dark' ? 'Prévia no tema escuro' : 'Prévia no tema claro'}
    >
      <div className="space-y-3 rounded-token-md bg-surface p-3">
        <p className="text-caption text-muted">{theme === 'dark' ? 'Tema escuro' : 'Tema claro'}</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 items-center rounded-token-md bg-primary px-3 text-body font-medium text-primary-fg">Botão</span>
          <span className="text-body font-semibold text-primary">Link e valores</span>
          <span className="inline-flex items-center rounded-full bg-primary-subtle px-2.5 py-0.5 text-caption font-medium text-primary-strong">Etiqueta</span>
        </div>
      </div>
    </div>
  );
}

type BrandColorFieldProps = {
  value: string | null | undefined;
  error?: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
};

export function BrandColorField({ value, error, disabled, onChange }: BrandColorFieldProps) {
  const color = value === null || value === undefined ? null : normalizeBrandColor(value);
  const liveError = brandColorError(value);
  const shown = error ?? liveError;

  const preview = useMemo(() => {
    if (!color || liveError) return null;
    const { light, dark } = deriveBrandTokens(color);
    return { light: previewVariables(light), dark: previewVariables(dark) };
  }, [color, liveError]);

  return (
    <div className="space-y-4">
      <Field
        id="settings-brandPrimaryColor"
        label="Cor principal"
        hint={
          value === null || value === undefined
            ? 'Usando o laranja padrão. Escolha uma cor para botões, links e destaques do sistema e do cardápio digital.'
            : 'Aplicada a botões, links e destaques do sistema e do cardápio digital. As cores de status não mudam.'
        }
        error={shown}
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            aria-label="Escolher a cor principal"
            className="h-10 w-14 cursor-pointer rounded-token-md border border-default bg-surface p-1 disabled:cursor-not-allowed"
            value={color ?? DEFAULT_BRAND_COLOR}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
          />
          <Input
            className="w-36 font-mono"
            value={value ?? ''}
            placeholder={DEFAULT_BRAND_COLOR}
            maxLength={7}
            spellCheck={false}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
          />
          <Button
            variant="secondary"
            leftIcon={<RotateCcw aria-hidden="true" />}
            disabled={disabled || value === null || value === undefined}
            onClick={() => onChange(null)}
          >
            Usar laranja padrão
          </Button>
        </div>
      </Field>
      {preview && (
        <div className="grid gap-3 md:grid-cols-2">
          <Preview theme="light" style={preview.light} />
          <Preview theme="dark" style={{ ...preview.light, ...preview.dark }} />
        </div>
      )}
    </div>
  );
}
