import { useState } from 'react';
import { clsx } from 'clsx';

interface BrandMarkProps {
  name: string;
  logoUrl?: string | null;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

export function BrandMark({
  name,
  logoUrl,
  className,
  imageClassName,
  fallbackClassName,
}: BrandMarkProps) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const imageFailed = Boolean(logoUrl && failedLogoUrl === logoUrl);

  const initial = name.trim().charAt(0).toLocaleUpperCase('pt-BR') || 'R';

  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center overflow-hidden', className)}>
      {logoUrl && !imageFailed ? (
        <img
          src={logoUrl}
          alt=""
          className={clsx('h-full w-full object-contain', imageClassName)}
          onError={() => setFailedLogoUrl(logoUrl || null)}
        />
      ) : (
        <span
          aria-hidden="true"
          className={clsx(
            'flex h-full w-full items-center justify-center bg-primary font-bold text-primary-fg',
            fallbackClassName
          )}
        >
          {initial}
        </span>
      )}
    </span>
  );
}
