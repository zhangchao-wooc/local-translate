export const TENCENT_MAAS_ORIGIN = 'https://tokenhub.tencentmaas.com';
export const TENCENT_MAAS_BASE_PATH = '/v1';
export const TENCENT_MAAS_PROXY_BASE_PATH = '/proxy/tencent-maas';
export const OPENAI_CHAT_COMPLETIONS_PATH = '/chat/completions';

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const normalizeModelApiUrl = (apiUrl: string): string => {
  const trimmed = apiUrl.trim();
  if (!trimmed) return trimmed;

  const normalized = stripTrailingSlash(trimmed);
  const maasBaseUrl = `${TENCENT_MAAS_ORIGIN}${TENCENT_MAAS_BASE_PATH}`;

  if (normalized === maasBaseUrl || normalized === TENCENT_MAAS_PROXY_BASE_PATH) {
    return `${TENCENT_MAAS_PROXY_BASE_PATH}${OPENAI_CHAT_COMPLETIONS_PATH}`;
  }

  if (normalized.startsWith(`${maasBaseUrl}/`)) {
    return normalized.replace(maasBaseUrl, TENCENT_MAAS_PROXY_BASE_PATH);
  }

  if (normalized.startsWith(`${TENCENT_MAAS_PROXY_BASE_PATH}/`)) {
    return normalized;
  }

  if (normalized.endsWith('/v1')) {
    return `${normalized}${OPENAI_CHAT_COMPLETIONS_PATH}`;
  }

  return trimmed;
};
