import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Image as ImageIcon, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from './Button';
import { useToast } from './useToast';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export interface ImageUploadProps {
  label: string;
  value?: string | null;
  maxSizeMb: 2 | 4;
  helpText: string;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
  className?: string;
}

function uploadErrorMessage(error: unknown): string {
  const responseMessage = (error as { response?: { data?: { message?: string } } })
    .response?.data?.message;
  return responseMessage || 'Não foi possível enviar a imagem. Tente novamente.';
}

export function ImageUpload({
  label,
  value,
  maxSizeMb,
  helpText,
  onUpload,
  onRemove,
  disabled = false,
  className,
}: ImageUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [failedPreview, setFailedPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const preview = localPreview || value || null;
  const previewFailed = Boolean(preview && failedPreview === preview);


  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const validate = (file: File): string | null => {
    if (file.type === 'image/svg+xml') {
      return 'SVG não é aceito por segurança. Use PNG, JPEG ou WebP.';
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Formato inválido. Use PNG, JPEG ou WebP.';
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      return 'A imagem deve ter no máximo ' + maxSizeMb + ' MB.';
    }
    return null;
  };

  const submitFile = async (file?: File) => {
    if (!file || disabled || loading) return;
    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      toast({ title: 'Imagem não enviada', description: validationError, variant: 'error' });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return objectUrl;
    });
    setError('');
    setLoading(true);

    try {
      await onUpload(file);
      setLocalPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      toast({ title: label + ' atualizada com sucesso', variant: 'success' });
    } catch (uploadError) {
      const message = uploadErrorMessage(uploadError);
      setError(message);
      setLocalPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      toast({ title: 'Erro ao enviar imagem', description: message, variant: 'error' });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    if (disabled || loading) return;
    setError('');
    setLoading(true);
    try {
      await onRemove();
      toast({ title: label + ' removida com sucesso', variant: 'success' });
    } catch (removeError) {
      const message = uploadErrorMessage(removeError);
      setError(message);
      toast({ title: 'Erro ao remover imagem', description: message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void submitFile(event.dataTransfer.files[0]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className={clsx('space-y-2', className)}>
      <label htmlFor={inputId} className="block text-label text-default">{label}</label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled || loading}
        onChange={(event) => void submitFile(event.target.files?.[0])}
      />

      <div
        role="button"
        tabIndex={disabled || loading ? -1 : 0}
        aria-disabled={disabled || loading}
        aria-describedby={error ? inputId + '-error' : inputId + '-hint'}
        onClick={() => !disabled && !loading && inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled && !loading) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={handleDrop}
        className={clsx(
          'relative flex min-h-44 cursor-pointer items-center justify-center overflow-hidden rounded-token-lg border-2 border-dashed bg-surface-sunken p-4 text-center transition-colors',
          dragging ? 'border-primary bg-primary-subtle' : 'border-default hover:border-primary',
          (disabled || loading) && 'cursor-not-allowed opacity-70',
          error && 'border-danger'
        )}
      >
        {preview && !previewFailed ? (
          <img
            src={preview}
            alt={'Pré-visualização: ' + label}
            className="max-h-40 max-w-full object-contain"
            onError={() => {
              setFailedPreview(preview);
              setError('Não foi possível exibir a imagem atual.');
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted">
            {previewFailed ? <ImageIcon aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
            <span className="text-body font-medium text-default">
              {previewFailed ? 'Imagem indisponível' : 'Clique ou arraste uma imagem'}
            </span>
            <span className="text-caption">PNG, JPEG ou WebP · até {maxSizeMb} MB</span>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/90 text-body font-medium text-default">
            <Loader2 aria-hidden="true" className="animate-spin" />
            Enviando imagem...
          </div>
        )}
      </div>

      <p id={inputId + '-hint'} className="text-caption text-muted">{helpText}</p>
      {error && <p id={inputId + '-error'} role="alert" className="text-caption text-danger">{error}</p>}

      {value && (
        <Button
          size="sm"
          variant="danger"
          leftIcon={<Trash2 aria-hidden="true" />}
          disabled={disabled || loading}
          onClick={(event) => {
            event.stopPropagation();
            void remove();
          }}
        >
          Remover imagem
        </Button>
      )}
    </div>
  );
}
