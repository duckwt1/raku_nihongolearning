import { extractBearerToken, verifyFirebaseIdToken } from './auth.js';

export interface Env {
  ASSETS?: Fetcher;
  FIREBASE_PROJECT_ID?: string;
  GEMINI_API_KEY?: string;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function jsonResponse(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      ...extraHeaders
    }
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle API requests
    if (url.pathname.startsWith('/api/')) {
      // CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            ...SECURITY_HEADERS
          }
        });
      }

      // Health endpoint
      if (url.pathname === '/api/health') {
        return jsonResponse({
          status: 'ok',
          service: 'Raku Nihongo Worker',
          timestamp: new Date().toISOString(),
          version: '0.1.0'
        });
      }

      // Auth validation endpoint
      if (url.pathname === '/api/auth/me') {
        const token = extractBearerToken(request.headers.get('Authorization'));
        if (!token) {
          return jsonResponse({ error: 'Missing Bearer token in Authorization header' }, 401);
        }

        const projectId = env.FIREBASE_PROJECT_ID || 'raku-nihongo-learning';
        try {
          const user = await verifyFirebaseIdToken(token, projectId);
          return jsonResponse({ authenticated: true, user });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Invalid token';
          return jsonResponse({ error: message }, 401);
        }
      }

      // AI endpoint stubs (prepared for G5 & G5b)
      if (url.pathname === '/api/ai/generate' || url.pathname === '/api/ai/import-analyze') {
        const token = extractBearerToken(request.headers.get('Authorization'));
        if (!token) {
          return jsonResponse({ error: 'Unauthorized: Firebase ID token required' }, 401);
        }
        return jsonResponse(
          { message: 'AI endpoint initialized, ready for G5 configuration' },
          200
        );
      }

      return jsonResponse({ error: 'Not Found' }, 404);
    }

    // Serve static assets via Cloudflare Worker Assets binding
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        headers.set(key, value);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return new Response('Asset binding not available in this environment', { status: 503 });
  }
};
