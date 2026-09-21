import { Request, Response } from 'express';
import { configService } from '../services/domain.services';
import { brandingService, BrandingImageKind } from '../services/branding.service';
import { DomainError } from '../types/errors';

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof DomainError) return res.status(error.status).json({ message: error.message });
  console.error(error);
  return res.status(500).json({ message: fallback });
};

export const getConfig = async (_req: Request, res: Response) => {
  try {
    const config = await configService.get();
    res.json(config);
  } catch (error) {
    handleError(res, error, 'Erro ao buscar configurações');
  }
};

export const getPublicBranding = async (_req: Request, res: Response) => {
  try {
    res.json(await brandingService.getPublicConfig());
  } catch (error) {
    handleError(res, error, 'Erro ao buscar configurações públicas do restaurante');
  }
};

const uploadBranding = (kind: BrandingImageKind) => async (req: Request, res: Response) => {
  try {
    res.json(await brandingService.upload(kind, req.file));
  } catch (error) {
    handleError(res, error, 'Erro ao enviar imagem');
  }
};

const removeBranding = (kind: BrandingImageKind) => async (_req: Request, res: Response) => {
  try {
    res.json(await brandingService.remove(kind));
  } catch (error) {
    handleError(res, error, 'Erro ao remover imagem');
  }
};

export const uploadLogo = uploadBranding('logo');
export const uploadBanner = uploadBranding('banner');
export const removeLogo = removeBranding('logo');
export const removeBanner = removeBranding('banner');

export const updateConfig = async (req: Request, res: Response) => {
  try {
    const {
      name, logoUrl, bannerUrl, address, phone,
      openingHours, openingDays, deliveryFee,
      urbanDeliveryFee, ruralDeliveryFee,
      cnpj, legalName, stateRegistration, taxRegime,
      fiscalCityIbgeCode, fiscalZipCode, fiscalStreet, fiscalNumber,
      fiscalNeighborhood, fiscalCity, fiscalState,
      defaultCfop, defaultNcm, defaultOrigin, defaultTaxCode,
      nfceEnabled, nfceGroupItems, nfceGroupedItemDescription,
    } = req.body;

    const config = await configService.update({
      name,
      logoUrl,
      bannerUrl,
      address,
      phone,
      openingHours,
      openingDays,
      deliveryFee: deliveryFee !== undefined && deliveryFee !== null ? Number(deliveryFee) : undefined,
      urbanDeliveryFee: urbanDeliveryFee !== undefined && urbanDeliveryFee !== null ? Number(urbanDeliveryFee) : undefined,
      ruralDeliveryFee: ruralDeliveryFee !== undefined && ruralDeliveryFee !== null ? Number(ruralDeliveryFee) : undefined,
      cnpj,
      legalName,
      stateRegistration,
      taxRegime,
      fiscalCityIbgeCode,
      fiscalZipCode,
      fiscalStreet,
      fiscalNumber,
      fiscalNeighborhood,
      fiscalCity,
      fiscalState,
      defaultCfop,
      defaultNcm,
      defaultOrigin,
      defaultTaxCode,
      nfceEnabled: typeof nfceEnabled === 'boolean' ? nfceEnabled : undefined,
      nfceGroupItems,
      nfceGroupedItemDescription,
    });
    res.json(config);
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar configurações');
  }
};
