import { NextFunction, Request, Response } from 'express';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024,
    files: 1,
  },
});

export const receiveBrandingImage = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  upload.single('file')(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ message: 'A imagem excede o limite máximo de 4 MB.' });
      return;
    }

    res.status(400).json({ message: 'Não foi possível processar o arquivo enviado.' });
  });
};
