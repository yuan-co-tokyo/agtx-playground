export function resolveApiBaseUrl(env: ImportMetaEnv = import.meta.env): string {
  return env?.VITE_API_BASE_URL ?? '';
}
