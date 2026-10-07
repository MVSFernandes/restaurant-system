import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createApiRateLimiter } from './middlewares/rateLimit.middleware';
import routes from './routes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Origens aceitas vêm do FRONTEND_URL (separadas por vírgula). Sem a
// variável nenhuma origem passa; a partida já exige que ela exista.
const allowedOrigins = () =>
  (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

// Middlewares
app.use(cors({
  origin: (origin, callback) => callback(null, !!origin && allowedOrigins().includes(origin)),
  credentials: true,
  exposedHeaders: ['Retry-After', 'RateLimit-Reset', 'X-RateLimit-Scope'],
}));

app.use(express.json());
app.use(cookieParser());

// Independent budgets prevent fiscal polling from blocking payments or other screens.
app.use('/api', createApiRateLimiter());

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;