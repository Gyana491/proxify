import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    // Get the target URL from the path parameter
    const targetUrl = request.nextUrl.pathname.replace('/api/proxy/', '');
    
    // Forward the request to the target URL
    const response = await fetch(targetUrl, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        host: new URL(targetUrl).host,
      },
      cache: 'no-store',
    });

    // Get the response body as array buffer to handle all content types
    const body = await response.arrayBuffer();

    // Create response with original headers and status
    return new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    // Get the target URL from the path parameter
    const targetUrl = request.nextUrl.pathname.replace('/api/proxy/', '');
    
    // Get the content type from the request
    const requestContentType = request.headers.get('content-type') || '';
    
    let body;
    let requestContentTypeHeader = 'application/json'; // Default to JSON
    
    // Handle different content types
    if (requestContentType.includes('xml') || requestContentType.includes('application/xml') || requestContentType.includes('text/xml')) {
      // Handle XML content
      requestContentTypeHeader = requestContentType;
      body = await request.text();
    } else {
      // Handle JSON content (existing logic)
      try {
        // First try to get body using request.json()
        try {
          body = await request.json();
          body = JSON.stringify(body); // Convert to string for fetch
        } catch (jsonError) {
          // If direct JSON parsing fails, try text approach
          const text = await request.text();
          
          // Try different parsing approaches
          try {
            // Try parsing the text as JSON
            const parsedBody = JSON.parse(text);
            body = JSON.stringify(parsedBody);
          } catch (parseError) {
            try {
              // Remove any extra quotes and escape characters
              const cleanText = text
                .replace(/^["']|["']$/g, '') // Remove wrapping quotes
                .replace(/\\"/g, '"')         // Fix escaped quotes
                .replace(/\\\\/g, '\\');      // Fix double escaped backslashes
              
              // Try parsing the cleaned text
              const parsedBody = JSON.parse(cleanText);
              body = JSON.stringify(parsedBody);
            } catch (cleanError) {
              // If the text is already a valid JSON object structure
              if (typeof text === 'object' && text !== null) {
                body = JSON.stringify(text);
              } else {
                // If all parsing attempts fail, throw error
                throw parseError;
              }
            }
          }
        }
      } catch (e) {
        console.error('Body parsing error:', e);
        return NextResponse.json(
          { error: 'Invalid request body. Please send valid JSON or XML data.' },
          { status: 400 }
        );
      }
    }
    
    // Create clean headers
    const headers = new Headers();
    headers.set('Content-Type', requestContentTypeHeader);
    headers.set('User-Agent', 'Mozilla/5.0');
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
    
    // Forward the request to the target URL with the body
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: headers,
      body: body,
      cache: 'no-store',
    });

    // Get the response content type
    const contentType = response.headers.get('content-type') || '';

    let responseData;
    // Handle different content types
    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      // For non-JSON responses (XML, text, etc.), get as text
      responseData = await response.text();
    }

    // Return the proxied response with original content type
    return new NextResponse(responseData, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request' },
      { status: 500 }
    );
  }
}
