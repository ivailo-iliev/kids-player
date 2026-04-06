exports.handler = async function handler(event) {
  const path = event.queryStringParameters && event.queryStringParameters.path;

  if (!path || path.charAt(0) !== '/') {
    return jsonResponse(400, { error: 'Missing Spotify API path' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing Authorization header' });
  }

  const upstreamUrl = 'https://api.spotify.com/v1' + path;
  const requestInit = {
    method: event.httpMethod,
    headers: {
      Authorization: authHeader
    }
  };

  const contentType = event.headers['content-type'] || event.headers['Content-Type'];
  if (contentType) {
    requestInit.headers['Content-Type'] = contentType;
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD' && event.body) {
    requestInit.body = event.body;
  }

  try {
    const response = await fetch(upstreamUrl, requestInit);
    const text = await response.text();

    return {
      statusCode: response.status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8'
      },
      body: text
    };
  } catch (error) {
    return jsonResponse(502, {
      error: 'Spotify API proxy request failed',
      detail: error && error.message ? error.message : String(error),
      upstreamUrl
    });
  }
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  };
}
