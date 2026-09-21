import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import { RateLimitNotice } from './components/RateLimitNotice';
import { ToastProvider } from './components/ui';
import App from './App.tsx';
import { BrandingProvider } from './contexts/BrandingProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <BrandingProvider>
        <RateLimitNotice />
        <App />
      </BrandingProvider>
    </ToastProvider>
  </StrictMode>
);
