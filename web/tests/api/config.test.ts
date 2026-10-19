import { expect, it } from 'vitest';
import { resolveApiBaseUrl } from '../../src/api/config.js';

it('resolves explicit and default API base URLs', () => {
  expect(resolveApiBaseUrl({ VITE_API_BASE_URL: 'https://example.com/api' })).toBe('https://example.com/api');
  expect(resolveApiBaseUrl({})).toBe('');
  expect(resolveApiBaseUrl({ VITE_API_BASE_URL: '' })).toBe('');
});
