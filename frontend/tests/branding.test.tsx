import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandMark } from '../src/components/branding/BrandMark';
import { ImageUpload, ToastProvider } from '../src/components/ui';
import { resolveDisplayName } from '../src/contexts/brandingContext';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('branding fallbacks', () => {
  it('uses the product name when the restaurant has no name', () => {
    expect(resolveDisplayName(null)).toBe('Restaurant System');
    expect(resolveDisplayName('   ')).toBe('Restaurant System');
  });

  it('renders the restaurant initial when there is no logo', () => {
    render(<BrandMark name="Casarão" logoUrl={null} />);
    expect(screen.getByText('C')).toBeTruthy();

    cleanup();
    render(<BrandMark name={resolveDisplayName(null)} logoUrl={null} />);
    expect(screen.getByText('R')).toBeTruthy();
  });
});

describe('ImageUpload', () => {
  it('rejects unsupported files on the client before upload', () => {
    const upload = vi.fn(async () => undefined);
    render(
      <ToastProvider>
        <ImageUpload
          label="Logo"
          maxSizeMb={2}
          helpText="Ajuda"
          onUpload={upload}
          onRemove={async () => undefined}
        />
      </ToastProvider>
    );

    fireEvent.change(screen.getByLabelText('Logo'), {
      target: { files: [new File(['documento'], 'arquivo.pdf', { type: 'application/pdf' })] },
    });

    expect(upload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Formato inválido');
  });

  it('rejects files above the configured limit', () => {
    const upload = vi.fn(async () => undefined);
    render(
      <ToastProvider>
        <ImageUpload
          label="Banner"
          maxSizeMb={4}
          helpText="Ajuda"
          onUpload={upload}
          onRemove={async () => undefined}
        />
      </ToastProvider>
    );

    const file = new File(['imagem'], 'banner.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 4 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText('Banner'), { target: { files: [file] } });

    expect(upload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('4 MB');
  });
});
