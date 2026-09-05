import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Token cache to avoid unnecessary token requests
let tokenCache = {
  token: null,
  expiresAt: null
};

/**
 * Get Keycloak access token using client credentials
 * @returns {Promise<string>} Access token
 */
export async function getKeycloakToken() {
  // Return cached token if still valid (with 60 second buffer)
  if (tokenCache.token && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt - 60000) {
    const remainingTime = Math.floor((tokenCache.expiresAt - Date.now()) / 1000);
    console.info(`[Auth] Using cached Keycloak token (expires in ${remainingTime}s)`);
    return tokenCache.token;
  }

  const tokenUrl = process.env.KEYCLOAK_TOKEN_URL || 'http://localhost:8090/realms/saphhire-ui/protocol/openid-connect/token';
  const clientId = process.env.KEYCLOAK_CLIENT_ID || 'charting-api';
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || 'OSiucf5IatqWXh0ldecBOcskHTP8ljBq';

  console.info('[Auth] Requesting new Keycloak token');
  console.info(`[Auth] Token URL: ${tokenUrl}`);
  console.info(`[Auth] Client ID: ${clientId}`);

  try {
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'client_credentials');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString()
    });

    console.info(`[Auth] Keycloak response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Auth] Failed to get Keycloak token: ${response.status} ${errorText}`);
      throw new Error(`Failed to get Keycloak token: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // Cache the token
    tokenCache.token = data.access_token;
    tokenCache.expiresAt = Date.now() + (data.expires_in * 1000);

    console.info(`[Auth] Successfully obtained Keycloak token (expires in ${data.expires_in}s)`);
    console.info(`[Auth] Token type: ${data.token_type}`);

    return data.access_token;
  } catch (error) {
    console.error('[Auth] Error getting Keycloak token:', error.message);
    throw error;
  }
}

// Get signing key from Keycloak
function getKey(jwksUrl) {
  const client = jwksClient({
    jwksUri: jwksUrl,
    cache: true,
    cacheMaxAge: 86400000, // 24 hours
  });

  return (header, callback) => {
    client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        console.error('Error getting signing key:', err);
        callback(err);
        return;
      }
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    });
  };
}

export async function verifyToken(token, jwksUrl, issuer) {
  console.info('[Auth] Verifying user token');
  return new Promise((resolve) => {
    jwt.verify(token, getKey(jwksUrl), {
      algorithms: ['RS256'],
      issuer: issuer,
    }, (err, decoded) => {
      if (err) {
        console.error('[Auth] Token verification error:', err.message);
        resolve({
          isValid: false,
          error: err.message
        });
        return;
      }

      // Extract user information from Keycloak token
      const user = {
        id: decoded.email || decoded.preferred_username || decoded.sub,
        email: decoded.email || decoded.preferred_username,
        name: decoded.name || decoded.given_name || decoded.preferred_username || 'User'
      };

      console.info(`[Auth] Token verified successfully for user: ${user.email}`);

      resolve({
        isValid: true,
        user
      });
    });
  });
}

export function extractTokenFromHeader(authHeader) {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }

  return null;
}

// Made with Bob
