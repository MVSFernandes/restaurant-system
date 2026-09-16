import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createApiRateLimiter } from './middlewares/rateLimit.middleware';
import routes from './routes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Middlewares
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:4000',
    'https://4000-i8m1vcfofrs090wfzygp3-3e064326.us1.manus.computer',
  ],
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