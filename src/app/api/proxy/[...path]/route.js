import { NextResponse } from 'next/server';

// Helper function to safely parse JSON with multiple fallback strategies
function parseJsonSafely(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Strategy 1: Direct JSON parse
  try {
    return JSON.parse(text);
  } catch (e1) {
    // Strategy 2: Handle stringified JSON (remove outer quotes)
    try {
      const unquoted = text.replace(/^["']|["']$/g, '');
      return JSON.parse(unquoted);
    } catch (e2) {
      // Strategy 3: Handle escaped JSON
      try {
        const unescaped = text
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, '\\')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t');
        return JSON.parse(unescaped);
      } catch (e3) {
        // Strategy 4: Handle double-encoded JSON
        try {
          const decoded = decodeURIComponent(text);
          return JSON.parse(decoded);
        } catch (e4) {
          // Strategy 5: Handle malformed JSON (try to fix common issues)
          try {
            const fixed = text
              .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Fix unquoted keys
              .replace(/'/g, '"') // Replace single quotes with double quotes
              .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
            return JSON.parse(fixed);
          } catch (e5) {
            console.warn('All JSON parsing strategies failed:', { text, errors: [e1.message, e2.message, e3.message, e4.message, e5.message] });
            return null;
          }
        }
      }
    }
  }
}

// Helper function to detect content type and handle body appropriately
async function processRequestBody(request) {
  const contentType = request.headers.get('content-type') || '';
  const method = request.method.toUpperCase();
  
  // Only process body for methods that support it
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return null;
  }

  try {
    const contentLength = request.headers.get('content-length');
    const hasBody = contentLength && parseInt(contentLength) > 0;
    
    if (!hasBody) {
      return null;
    }

    // Handle different content types
    if (contentType.includes('application/json') || contentType.includes('text/json')) {
      // JSON content - handle all JSON syntaxes
      const text = await request.text();
      const parsed = parseJsonSafely(text);
      return parsed ? JSON.stringify(parsed) : text; // Return stringified if parsed, original if not
      
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      // Form data
      return await request.text();
      
    } else if (contentType.includes('multipart/form-data')) {
      // Multipart form data (file uploads, etc.)
      return await request.arrayBuffer();
      
    } else if (contentType.includes('xml') || contentType.includes('soap')) {
      // XML/SOAP content
      return await request.text();
      
    } else if (contentType.includes('text/')) {
      // Any text content
      return await request.text();
      
    } else {
      // Binary content (images, files, etc.) or unknown
      return await request.arrayBuffer();
    }
  } catch (error) {
    console.warn('Could not read request body:', error);
    return null;
  }
}

// Universal handler for all HTTP methods
async function handleRequest(request) {
  try {
    // Get the target URL from the path parameter and decode it properly
    let targetUrl = request.nextUrl.pathname.replace('/api/proxy/', '');
    
    // Handle URL encoding/decoding issues
    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch (decodeError) {
      // If decoding fails, use the original URL
      console.warn('URL decoding failed, using original:', decodeError);
    }
    
    // Validate URL format - supports both HTTP and HTTPS
    if (!targetUrl || !targetUrl.match(/^https?:\/\/.+/)) {
      return NextResponse.json(
        { error: 'Invalid target URL. Must start with http:// or https:// and include a domain.' },
        { status: 400 }
      );
    }

    // Parse and validate the target URL (supports both HTTP and HTTPS)
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
      // Explicitly allow both protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Unsupported protocol');
      }
    } catch (urlError) {
      return NextResponse.json(
        { error: 'Malformed target URL. Only HTTP and HTTPS protocols are supported.' },
        { status: 400 }
      );
    }

    // Get all headers from the original request
    const requestHeaders = new Headers();
    
    // Copy all headers except problematic ones
    const excludeHeaders = [
      'host', 
      'connection', 
      'transfer-encoding', 
      'content-length',
      'content-encoding',
      'accept-encoding' // Let the target server handle encoding
    ];
    
    for (const [key, value] of request.headers.entries()) {
      if (!excludeHeaders.includes(key.toLowerCase())) {
        try {
          requestHeaders.set(key, value);
        } catch (headerError) {
          console.warn(`Skipping invalid header ${key}:`, headerError);
        }
      }
    }

    // Set essential headers
    requestHeaders.set('host', parsedUrl.host);
    requestHeaders.set('user-agent', requestHeaders.get('user-agent') || 'Mozilla/5.0 (Proxy)');
    
    // Add cache control headers to prevent caching
    requestHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    requestHeaders.set('Pragma', 'no-cache');
    requestHeaders.set('Expires', '0');

    // Process request body with content type detection and JSON syntax handling
    const body = await processRequestBody(request);

    // Make the proxied request
    const fetchOptions = {
      method: method,
      headers: requestHeaders,
      cache: 'no-store',
      redirect: 'follow',
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(30000), // 30 second timeout
    };

    // Add body if it exists
    if (body !== null) {
      fetchOptions.body = body;
    }

    const response = await fetch(targetUrl, fetchOptions);

    // Get response body as array buffer to handle all content types
    const responseBody = await response.arrayBuffer();

    // Create a new headers object with all response headers
    const responseHeaders = new Headers();
    
    // Copy all response headers safely
    for (const [key, value] of response.headers.entries()) {
      try {
        // Skip problematic headers that could cause issues
        if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
          responseHeaders.set(key, value);
        }
      } catch (headerError) {
        console.warn(`Skipping problematic response header ${key}:`, headerError);
      }
    }

    // Add CORS headers to allow cross-origin requests
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    responseHeaders.set('Access-Control-Expose-Headers', '*');
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');

    // Return the response with original status, headers, and body
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('Proxy error:', error);
    
    // Handle specific error types
    let errorMessage = 'Failed to proxy request';
    let statusCode = 500;
    
    if (error.name === 'AbortError') {
      errorMessage = 'Request timeout - target server took too long to respond';
      statusCode = 504;
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = 'Could not connect to target server';
      statusCode = 502;
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error.message,
        timestamp: new Date().toISOString(),
        targetUrl: targetUrl || 'unknown'
      },
      { 
        status: statusCode,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD',
          'Access-Control-Allow-Headers': '*',
        }
      }
    );
  }
}

// Export handlers for all HTTP methods
export async function GET(request) {
  return handleRequest(request);
}

export async function POST(request) {
  return handleRequest(request);
}

export async function PUT(request) {
  return handleRequest(request);
}

export async function DELETE(request) {
  return handleRequest(request);
}

export async function PATCH(request) {
  return handleRequest(request);
}

export async function HEAD(request) {
  return handleRequest(request);
}

export async function OPTIONS(request) {
  // Handle preflight CORS requests
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
}
