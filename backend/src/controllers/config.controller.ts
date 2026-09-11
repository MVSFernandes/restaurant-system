import { Request, Response } from 'express';
import { configService } from '../services/domain.services';
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
      nfceEnabled,
    } = req.body;

    const config = await configService.update({
      name,
      logoUrl,
      bannerUrl,
      address,
      phone,
      openingHours,
      openingDays,
      deliveryFee: deliveryFee ? parseFloat(deliveryFee) : undefined,
      urbanDeliveryFee: urbanDeliveryFee ? parseFloat(urbanDeliveryFee) : undefined,
      ruralDeliveryFee: ruralDeliveryFee ? parseFloat(ruralDeliveryFee) : undefined,
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
    });
    res.json(config);
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar configurações');
  }
};
