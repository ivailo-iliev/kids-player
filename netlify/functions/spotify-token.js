exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        Allow: 'POST',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': event.headers['content-type'] || event.headers['Content-Type'] || 'application/x-www-form-urlencoded'
      },
      body: event.body || ''
    });

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
    return {
      statusCode: 502,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        error: 'Spotify token proxy request failed',
        detail: error && error.message ? error.message : String(error)
      })
    };
  }
};
