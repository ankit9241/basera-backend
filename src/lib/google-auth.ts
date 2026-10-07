import { OAuth2Client } from "google-auth-library";
import { ApiError } from "../middleware/error-handler";

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

export interface VerifiedGoogleUser {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/**
 * Verifies a Google credential via Access Token, ID Token, or authorization code,
 * and extracts validated user identity information.
 */
export async function verifyGoogleCredential(params: {
  idToken?: string;
  accessToken?: string;
  code?: string;
  redirectUri?: string;
}): Promise<VerifiedGoogleUser> {
  const { idToken, accessToken, code, redirectUri } = params;

  // 1. Verify via Access Token (from Google Identity Services Token Client)
  if (accessToken) {
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userInfoRes.ok) {
        throw new ApiError(401, "Invalid or expired Google access token.");
      }

      const userInfo = (await userInfoRes.json()) as any;

      if (!userInfo.sub || !userInfo.email) {
        throw new ApiError(401, "Incomplete Google user profile.");
      }

      return {
        sub: userInfo.sub,
        email: userInfo.email.toLowerCase().trim(),
        emailVerified: userInfo.email_verified === true || userInfo.email_verified === "true",
        name: userInfo.name,
        picture: userInfo.picture,
      };
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(401, err.message || "Failed to verify Google access token.");
    }
  }

  // 2. Verify via Authorization Code (if client secret is configured)
  let verifiedToken = idToken;

  if (!verifiedToken && code) {
    try {
      const response = await googleClient.getToken({
        code,
        redirect_uri: redirectUri || "postmessage",
      });
      verifiedToken = response.tokens.id_token || undefined;
    } catch (err: any) {
      throw new ApiError(400, "Failed to exchange Google authorization code. Please try again.");
    }
  }

  // 3. Verify via ID Token (JWT)
  if (verifiedToken) {
    const clientId =
      process.env.GOOGLE_CLIENT_ID ||
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: verifiedToken,
        audience: clientId ? [clientId] : undefined,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new ApiError(401, "Invalid Google token payload.");
      }

      if (!payload.sub || !payload.email) {
        throw new ApiError(401, "Incomplete Google user profile in token.");
      }

      // Verify token issuer
      const validIssuers = ["https://accounts.google.com", "accounts.google.com"];
      if (!validIssuers.includes(payload.iss)) {
        throw new ApiError(401, "Invalid Google token issuer.");
      }

      return {
        sub: payload.sub,
        email: payload.email.toLowerCase().trim(),
        emailVerified: Boolean(payload.email_verified),
        name: payload.name,
        picture: payload.picture,
      };
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(401, err.message || "Invalid or expired Google authentication credential.");
    }
  }

  throw new ApiError(400, "Google credential (access token, ID token, or authorization code) is required.");
}
