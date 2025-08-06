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
    
    // Get the request body
    const body = await request.json();
    
    // Create clean headers without problematic ones
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('User-Agent', 'Mozilla/5.0');
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
    
    // Forward the request to the target URL with the body
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
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
