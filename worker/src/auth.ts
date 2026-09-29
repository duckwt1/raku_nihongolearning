import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
);

// Cached remote JWKS set that respects HTTP Cache-Control headers
let remoteJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!remoteJWKS) {
    remoteJWKS = createRemoteJWKSet(GOOGLE_JWKS_URL, {
      cacheMaxAge: 6 * 60 * 60 * 1000 // 6 hours fallback
    });
  }
  return remoteJWKS;
}

export interface VerifiedUser {
  uid: string;
  email?: string;
  isAnonymous?: boolean;
}

/**
 * Verifies a Firebase ID token using Google's public JWKS.
 * Checks:
 * - Signature against Google's public keys
 * - Issuer: https://securetoken.google.com/<projectId>
 * - Audience: <projectId>
 * - Expiration: not expired
 * - Subject: non-empty user UID
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string
): Promise<VerifiedUser> {
  const JWKS = getJWKS();
  const issuer = `https://securetoken.google.com/${projectId}`;

  const { payload } = await jwtVerify(token, JWKS, {
    issuer,
    audience: projectId
  });

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Invalid token: missing subject (uid)');
  }

  const isAnonymous = payload.firebase
    ? (payload.firebase as { sign_in_provider?: string }).sign_in_provider === 'anonymous'
    : false;

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    isAnonymous
  };
}

/**
 * Extracts Bearer token from the Authorization header.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/);
  return match ? match[1]! : null;
}
