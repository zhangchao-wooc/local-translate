import axios from './axios';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8888/api/v1'
).replace(/\/+$/, '');

export type LoginPayload = {
  account: string;
  password: string;
};

export type LoginToken = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  tokenType: 'Bearer';
};

type ApiResponse<T> = {
  data: T;
  code: number;
  succeed: boolean;
  message: string;
  timestamp: number;
};

/** Authenticate with the nestjs-admin local-account endpoint. */
export const login = async (payload: LoginPayload): Promise<LoginToken> => {
  const response = await axios.post<ApiResponse<LoginToken>>(
    `${API_BASE_URL}/api/v1/authentication/login`,
    payload,
  );

  return response.data.data;
};

export const refreshToken = async (token: string): Promise<LoginToken> => {
  const response = await axios.post<ApiResponse<LoginToken>>(
    `${API_BASE_URL}/api/v1/authentication/token`,
    { token },
  );

  return response.data.data;
};

export type UserInfo = {
  id?: string;
  userName?: string;
  email?: string;
  phoneNumber?: string;
  avatar?: string;
  introduce?: string;
  roles?: Array<{ id: number; name: string; code: string }>;
  createdAt?: string;
  updatedAt?: string;
};

/** Fetch the currently authenticated user's profile from nestjs-admin. */
export const getUserInfo = async (): Promise<UserInfo> => {
  const response = await axios.get<ApiResponse<UserInfo>>(
    `${API_BASE_URL}/api/v1/users`,
  );
  return response.data.data;
};
