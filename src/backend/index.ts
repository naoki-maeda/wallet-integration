import type { GraphQLRequest } from '../types';

export interface Env {
  TARGET_API_URL: string;
  ALLOWED_ORIGIN: string;
  COOKIE_NAME: string;
}

type CorsHeaders = Record<string, string>;

function getCorsHeaders(origin: string, env: Env): CorsHeaders {
  const allowedOrigin = env.ALLOWED_ORIGIN === '*' ? origin : (origin === env.ALLOWED_ORIGIN ? origin : '');
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  const cookieArray = cookieHeader.split(';');
  for (const cookie of cookieArray) {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  }
  return cookies;
}


async function handleGraphQLProxy(
  request: Request,
  env: Env,
  authCookie: string
): Promise<Response> {
  try {
    const requestData: GraphQLRequest = await request.json();
    const { query, variables = {} } = requestData;

    const targetUrl = `${env.TARGET_API_URL}/api/graphql`;
    
    const proxyHeaders = new Headers({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authCookie}`,
    });

    const proxyOptions: RequestInit = {
      method: 'POST',
      headers: proxyHeaders,
      body: JSON.stringify({
        query,
        variables,
      }),
    };

    const proxyResponse = await fetch(targetUrl, proxyOptions);
    const responseData = await proxyResponse.text();

    // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
    let parsedData;
    try {
      parsedData = JSON.parse(responseData);
    } catch {
      parsedData = responseData;
    }

    return new Response(JSON.stringify({
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      data: parsedData,
      headers: Object.fromEntries(proxyResponse.headers.entries()),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('GraphQL proxy error:', error);
    return new Response(JSON.stringify({
      error: 'GraphQL proxy request failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = getCorsHeaders(origin, env);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Check origin (allow * for development)
    if (env.ALLOWED_ORIGIN !== '*' && origin !== env.ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ error: 'Unauthorized origin' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // Parse cookies
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = parseCookies(cookieHeader);
    const authCookie = cookies[env.COOKIE_NAME || 'api_access_token'];

    if (!authCookie) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // Route handling
    if (url.pathname === '/graphql' && request.method === 'POST') {
      const response = await handleGraphQLProxy(request, env, authCookie);
      
      // Add CORS headers to the response
      const responseHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
        responseHeaders.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  },
};
