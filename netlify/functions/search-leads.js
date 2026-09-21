// Netlify Function — roda no servidor, nunca no navegador.
// Isso resolve o bloqueio de CORS da SerpAPI e mantém sua chave de API segura
// (ela fica só aqui, como variável de ambiente, nunca visível no navegador do usuário).

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'SERPAPI_KEY não configurada. Vá em Site settings → Environment variables no Netlify e adicione a variável SERPAPI_KEY com sua chave da SerpAPI.'
        })
      };
    }

    const { nicho, cidade } = event.queryStringParameters || {};
    if (!nicho || !cidade) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Parâmetros "nicho" e "cidade" são obrigatórios.' })
      };
    }

    const query = `${nicho} em ${cidade}`;
    const url = `https://serpapi.com/search?engine=google_maps&q=${encodeURIComponent(query)}&api_key=${apiKey}&num=30`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erro da SerpAPI: ' + data.error }) };
    }

    const results = (data.place_results || data.local_results || []).map(p => ({
      name: p.title || '—',
      address: p.address || '—',
      phone: p.phone || '',
      website: p.website || '',
      rating: p.rating || null,
      review_count: p.reviews || p.review_count || 0,
      maps_url: p.review_url || p.maps_url || p.link || '',
      type: p.type || nicho
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ results }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erro desconhecido no servidor' }) };
  }
};
