import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    message: 'Proxy test endpoint',
    timestamp: new Date().toISOString(),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
    supportedProtocols: ['HTTP', 'HTTPS'],
    supportedContentTypes: [
      'application/json (all JSON syntaxes)',
      'application/xml',
      'text/xml',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain',
      'text/html',
      'application/octet-stream',
      'image/*',
      'Any content type'
    ],
    jsonSyntaxSupport: [
      'Standard JSON: {"key": "value"}',
      'Stringified JSON: "{\\"key\\": \\"value\\"}"',
      'Escaped JSON: "{\\\"key\\\": \\\"value\\\"}"',
      'URL encoded JSON',
      'Malformed JSON (auto-fix)',
      'Single quotes: {\'key\': \'value\'}',
      'Unquoted keys: {key: "value"}'
    ]
  });
}

export async function POST(request) {
  try {
    const body = await request.text();
    const contentType = request.headers.get('content-type') || 'unknown';
    
    return NextResponse.json({
      message: 'Received POST request',
      contentType,
      bodyLength: body.length,
      receivedBody: body.substring(0, 500) + (body.length > 500 ? '...' : ''),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to process request',
      details: error.message
    }, { status: 400 });
  }
}
