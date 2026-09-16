import axios, { AxiosError, CanceledError } from 'axios';
import { RATE_LIMIT_MESSAGE, blockedUntil, recordRateLimit, requestScope, waitForReadBudget } from './rateLimit';
import { useAuthStore } from '../store/authStore';

// URL do backend: usa variável de ambiente em produção, ou localhost em dev
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

let refreshPromise: Promise<{ accessToken: string }> | null = null;
function refreshAccessToken() {
  if (!refreshPromise) refreshPromise = (async () => {
    for (let attempt = 0; ; attempt++) {
      await waitForReadBudget('auth:write');
      try {
        return (await axios.post<{ accessToken: string }>(`${API_BASE_URL}/auth/refresh-token`, {}, { withCredentials: true })).data;
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 429) throw error;
        recordRateLimit(error.response.headers['x-ratelimit-scope'] || 'auth:write', error.response.headers['retry-after'], attempt);
        if (attempt >= 2) throw error;
      }
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

// Interceptor para adicionar o token de acesso em cada requisição
api.interceptors.request.use(
  async (config) => {
    const scope = requestScope(config.url, config.method);
    if (['get', 'head'].includes(config.method ?? 'get')) {
      await waitForReadBudget(scope);
      if (config.signal?.aborted) throw new CanceledError();
    } else if (blockedUntil(scope) > Date.now()) {
      throw new AxiosError(RATE_LIMIT_MESSAGE, 'LOCAL_RATE_LIMIT', config, undefined, {
        status: 429, statusText: 'Too Many Requests', data: { message: RATE_LIMIT_MESSAGE }, headers: {}, config,
      });
    }
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor para lidar com erros de autenticação e renovar o token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 429) {
      error.message = RATE_LIMIT_MESSAGE;
      error.response.data = { ...((typeof error.response.data === 'object' && error.response.data) || {}), message: RATE_LIMIT_MESSAGE };
      if (error.code === 'LOCAL_RATE_LIMIT') return Promise.reject(error);
      const scope = error.response.headers?.['x-ratelimit-scope'] || requestScope(originalRequest?.url, originalRequest?.method);
      recordRateLimit(scope, error.response.headers?.['retry-after'], originalRequest?._rateRetry ?? 0);
      // Only safe reads are replayed. Never automatically repeat a payment or fiscal issue.
      if (originalRequest && ['get', 'head'].includes(originalRequest.method ?? 'get') && (originalRequest._rateRetry ?? 0) < 2) {
        originalRequest._rateRetry = (originalRequest._rateRetry ?? 0) + 1;
        return api(originalRequest);
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const data = await refreshAccessToken();

        useAuthStore.getState().setAccessToken(data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        if (axios.isAxiosError(refreshError) && [401, 403].includes(refreshError.response?.status ?? 0)) {
          useAuthStore.getState().logout();
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
