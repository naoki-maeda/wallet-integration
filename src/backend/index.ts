export interface Env {
  TARGET_API_URL: string;
  ALLOWED_ORIGIN: string;
  COOKIE_NAME: string;
  PUBLIC_KEY: string;
}

type CorsHeaders = Record<string, string>;

type JWTPayload = {
  id: string;
  iat: number;
  exp: number;
};

function getCorsHeaders(origin: string, env: Env): CorsHeaders {
  const allowedOrigin =
    env.ALLOWED_ORIGIN === "*" ? origin : origin === env.ALLOWED_ORIGIN ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  const cookieArray = cookieHeader.split(";");
  for (const cookie of cookieArray) {
    const [name, value] = cookie.trim().split("=");
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  }
  return cookies;
}

async function verifyAndDecodeJWT(
  token: string,
  publicKey: string,
): Promise<{ accountId: string } | null> {
  try {
    // Parse JWT without verification first to get the payload
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    // Decode payload
    const base64Decode = (str: string) => {
      let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) {
        base64 += "=";
      }
      return atob(base64);
    };

    // Import the public key for ECDSA P-256
    const pemHeader = "-----BEGIN PUBLIC KEY-----";
    const pemFooter = "-----END PUBLIC KEY-----";
    const pemContents = publicKey.replace(pemHeader, "").replace(pemFooter, "").replace(/\s/g, "");
    const binaryDer = atob(pemContents);
    const binaryDerBuffer = new Uint8Array(binaryDer.length);
    for (let i = 0; i < binaryDer.length; i++) {
      binaryDerBuffer[i] = binaryDer.charCodeAt(i);
    }

    // Import the key using Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      "spki",
      binaryDerBuffer,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false,
      ["verify"],
    );

    // Prepare the data for verification
    const encoder = new TextEncoder();
    const data = encoder.encode(`${parts[0]}.${parts[1]}`);
    const signature = Uint8Array.from(base64Decode(parts[2]), (c) => c.charCodeAt(0));

    // Verify the signature
    const isValid = await crypto.subtle.verify(
      {
        name: "ECDSA",
        hash: "SHA-256",
      },
      cryptoKey,
      signature,
      data,
    );

    if (!isValid) {
      throw new Error("Invalid JWT signature");
    }

    // Parse and validate the payload
    const payload = JSON.parse(base64Decode(parts[1])) as JWTPayload;

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error("JWT expired");
    }

    return {
      accountId: payload.id,
    };
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = getCorsHeaders(origin, env);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Check origin (allow * for development)
    if (env.ALLOWED_ORIGIN !== "*" && origin !== env.ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ error: "Unauthorized origin" }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // Parse cookies
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookies = parseCookies(cookieHeader);
    const authCookie = cookies[env.COOKIE_NAME || "api_access_token"];

    if (!authCookie) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // Route handling
    if (url.pathname === "/decode") {
      const userInfo = await verifyAndDecodeJWT(authCookie, env.PUBLIC_KEY);
      return new Response(JSON.stringify(userInfo), {
        status: userInfo ? 200 : 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  },
};
