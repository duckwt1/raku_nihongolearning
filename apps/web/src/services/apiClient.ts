/**
 * Returns full API endpoint URL depending on current execution environment
 */
export function getApiUrl(path: string): string {
  // Pages Functions proxy /api/* to the Worker through a private service binding.
  // Relative URLs keep production and local development on the same origin.
  return path.startsWith('/') ? path : `/${path}`;
}
