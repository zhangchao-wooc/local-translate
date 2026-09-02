import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import axios from '../../api/axios';
import { API_BASE_URL, refreshToken, type LoginToken } from '../../api/auth';

const STORAGE_KEY = 'auth-session';
const REFRESH_BUFFER_MS = 60_000;

export type AuthSession = LoginToken & {
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
};

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _authRetried?: boolean;
};

const listeners = new Set<() => void>();
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let requestInterceptorId: number | undefined;
let responseInterceptorId: number | undefined;
let refreshPromise: Promise<AuthSession | null> | undefined;

const notify = (): void => {
  listeners.forEach((listener) => listener());
};

const readSession = (): AuthSession | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (!session.accessToken || !session.refreshToken || !session.refreshTokenExpiresAt) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
};

const scheduleRefresh = (session: AuthSession | null): void => {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  if (!session || session.refreshTokenExpiresAt <= Date.now()) return;

  const delay = Math.max(0, session.accessTokenExpiresAt - Date.now() - REFRESH_BUFFER_MS);
  refreshTimer = window.setTimeout(() => {
    void refreshSessionToken();
  }, delay);
};

const toSession = (token: LoginToken): AuthSession => {
  const now = Date.now();
  return {
    ...token,
    accessTokenExpiresAt: now + token.expiresIn * 1000,
    refreshTokenExpiresAt: now + token.refreshTokenExpiresIn * 1000,
  };
};

const isBackendRequest = (url?: string): boolean =>
  Boolean(url && url.startsWith(API_BASE_URL));

const isAuthenticationRequest = (url?: string): boolean =>
  Boolean(url && url.startsWith(`${API_BASE_URL}/authentication/`));

export const getAuthSession = (): AuthSession | null => readSession();

export const hasAuthSession = (): boolean => {
  const session = readSession();
  return Boolean(session && session.refreshTokenExpiresAt > Date.now());
};

export const saveAuthSession = (token: LoginToken): AuthSession => {
  const session = toSession(token);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  scheduleRefresh(session);
  notify();
  return session;
};

export const clearAuthSession = (): void => {
  window.localStorage.removeItem(STORAGE_KEY);
  scheduleRefresh(null);
  notify();
};

export const refreshSessionToken = async (): Promise<AuthSession | null> => {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const session = readSession();
    if (!session || session.refreshTokenExpiresAt <= Date.now()) {
      clearAuthSession();
      return null;
    }

    try {
      return saveAuthSession(await refreshToken(session.refreshToken));
    } catch {
      clearAuthSession();
      return null;
    } finally {
      refreshPromise = undefined;
    }
  })();

  return refreshPromise;
};

export const subscribeToAuthSession = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const initializeAuthSession = (): (() => void) => {
  if (requestInterceptorId !== undefined) axios.interceptors.request.eject(requestInterceptorId);
  if (responseInterceptorId !== undefined) axios.interceptors.response.eject(responseInterceptorId);

  requestInterceptorId = axios.interceptors.request.use((config) => {
    if (!isBackendRequest(config.url) || isAuthenticationRequest(config.url)) return config;
    const session = readSession();
    if (session) config.headers.Authorization = `Bearer ${session.accessToken}`;
    return config;
  });

  responseInterceptorId = axios.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as RetryableRequestConfig | undefined;
      if (
        error.response?.status !== 401 ||
        !config ||
        config._authRetried ||
        !isBackendRequest(config.url) ||
        isAuthenticationRequest(config.url)
      ) {
        return Promise.reject(error);
      }

      config._authRetried = true;
      const session = await refreshSessionToken();
      if (!session) return Promise.reject(error);
      config.headers.Authorization = `Bearer ${session.accessToken}`;
      return axios(config);
    },
  );

  const session = readSession();
  scheduleRefresh(session);
  if (session && session.accessTokenExpiresAt <= Date.now()) void refreshSessionToken();

  return () => {
    if (requestInterceptorId !== undefined) axios.interceptors.request.eject(requestInterceptorId);
    if (responseInterceptorId !== undefined) axios.interceptors.response.eject(responseInterceptorId);
    requestInterceptorId = undefined;
    responseInterceptorId = undefined;
  };
};
