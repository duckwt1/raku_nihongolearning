/**
 * Returns full API endpoint URL depending on current execution environment
 */
const WORKER_ORIGIN = 'https://rakunihongo-duckwt.vku-field-survey-api.workers.dev';

export function getApiUrl(path: string): string {
  if (typeof window !== 'undefined') {
    // If running on worker or localhost with proxy, relative path is fine
    if (window.location.hostname.endsWith('workers.dev') || window.location.hostname === 'localhost') {
      return path;
    }
  }
  // Fallback to Worker backend for Pages or custom domains
  return `${WORKER_ORIGIN}${path.startsWith('/') ? path : '/' + path}`;
}
