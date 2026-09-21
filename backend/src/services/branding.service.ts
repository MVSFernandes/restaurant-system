import { supabase } from '../lib/supabase';
import { configService } from './domain.services';
import { DomainError } from '../types/errors';

export type BrandingImageKind = 'logo' | 'banner';

const BUCKET = 'branding';
const MAX_BYTES: Record<BrandingImageKind, number> = {
  logo: 2 * 1024 * 1024,
  banner: 4 * 1024 * 1024,
};

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface BrandingImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export function toPublicRestaurantConfig(config: Awaited<ReturnType<typeof configService.get>>) {
  return {
    name: config.name || null,
    logoUrl: config.logoUrl || null,
    bannerUrl: config.bannerUrl || null,
    openingHours: config.openingHours || null,
    openingDays: config.openingDays || null,
    deliveryFee: config.deliveryFee ?? null,
    enabledPayments: config.enabledPayments || null,
  };
}

export function detectImageMime(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export function validateBrandingImage(file: BrandingImageFile, kind: BrandingImageKind): string {
  if (file.mimetype === 'image/svg+xml') {
    throw new DomainError(
      'Arquivos SVG não são aceitos porque podem conter código inseguro. Use PNG, JPEG ou WebP.',
      { code: 'UNSAFE_IMAGE_TYPE', status: 400 }
    );
  }

  if (!MIME_EXTENSIONS[file.mimetype]) {
    throw new DomainError('Formato inválido. Envie uma imagem PNG, JPEG ou WebP.', {
      code: 'INVALID_IMAGE_TYPE',
      status: 400,
    });
  }

  if (file.size > MAX_BYTES[kind]) {
    const maximum = kind === 'logo' ? '2 MB' : '4 MB';
    throw new DomainError(`A imagem excede o limite de ${maximum}.`, {
      code: 'IMAGE_TOO_LARGE',
      status: 400,
    });
  }

  const detectedMime = detectImageMime(file.buffer);
  if (!detectedMime || detectedMime !== file.mimetype) {
    throw new DomainError('O conteúdo do arquivo não corresponde ao formato informado.', {
      code: 'IMAGE_CONTENT_MISMATCH',
      status: 400,
    });
  }

  return detectedMime;
}

function slugify(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, '');
  const slug = withoutExtension
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return slug || 'imagem';
}

function storagePathFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;

  try {
    return decodeURIComponent(url.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

async function removeStoredFile(url: string | null): Promise<void> {
  const path = storagePathFromPublicUrl(url);
  if (!path) return;

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.error('[branding] Não foi possível remover o arquivo anterior:', error.message);
  }
}

export const brandingService = {
  async getPublicConfig() {
    const config = await configService.get();
    return toPublicRestaurantConfig(config);
  },

  async upload(kind: BrandingImageKind, file?: BrandingImageFile) {
    if (!file) {
      throw new DomainError('Selecione uma imagem para enviar.', {
        code: 'IMAGE_REQUIRED',
        status: 400,
      });
    }

    const mime = validateBrandingImage(file, kind);
    const extension = MIME_EXTENSIONS[mime];
    const path = `${kind}/${Date.now()}-${slugify(file.originalname)}.${extension}`;
    const current = await configService.get();

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file.buffer, {
      contentType: mime,
      cacheControl: '31536000',
      upsert: false,
    });

    if (uploadError) {
      throw new DomainError(
        uploadError.message.toLowerCase().includes('bucket')
          ? 'O bucket público "branding" não foi encontrado. Crie-o no Supabase antes de enviar imagens.'
          : 'Não foi possível enviar a imagem. Tente novamente.',
        { code: 'BRANDING_UPLOAD_FAILED', status: 500 }
      );
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const field = kind === 'logo' ? 'logoUrl' : 'bannerUrl';

    try {
      const updated = await configService.update({ [field]: data.publicUrl });
      await removeStoredFile(current[field]);
      return updated;
    } catch (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }
  },

  async remove(kind: BrandingImageKind) {
    const current = await configService.get();
    const field = kind === 'logo' ? 'logoUrl' : 'bannerUrl';
    const updated = await configService.update({ [field]: null });
    await removeStoredFile(current[field]);
    return updated;
  },
};
