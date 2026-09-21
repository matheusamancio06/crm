// Netlify Function — roda no servidor, nunca no navegador.
// Isso resolve o bloqueio de CORS da SerpAPI e mantém sua chave de API segura
// (ela fica só aqui, como variável de ambiente, nunca visível no navegador do usuário).
//
// Paginação: a SerpAPI retorna até 20 resultados por "página" (parâmetro start=0,20,40...).
// Cada página consultada consome 1 busca do seu plano mensal do SerpAPI.
// Por padrão buscamos 3 páginas (até 60 empresas) por chamada. Ajuste PAGES_PER_SEARCH
// abaixo se quiser mais cobertura (mais empresas) em troca de gastar mais buscas do seu plano.

const PAGES_PER_SEARCH = 3; // 3 páginas x 20 = até 60 empresas, consumindo 3 buscas do seu plano por vez
const RESULTS_PER_PAGE = 20;

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

    const { nicho, cidade, pages } = event.queryStringParameters || {};
    if (!nicho || !cidade) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Parâmetros "nicho" e "cidade" são obrigatórios.' })
      };
    }

    const numPages = Math.min(Math.max(parseInt(pages) || PAGES_PER_SEARCH, 1), 6); // limite de segurança: máx 6 páginas (~120 resultados), conforme recomendação da SerpAPI
    const query = `${nicho} em ${cidade}`;

    const allResults = [];
    const seen = new Set(); // dedupe por nome+endereço

    for (let page = 0; page < numPages; page++) {
      const start = page * RESULTS_PER_PAGE;
      const url = `https://serpapi.com/search?engine=google_maps&q=${encodeURIComponent(query)}&api_key=${apiKey}&start=${start}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        // Se já temos resultados de páginas anteriores, retorna o que conseguiu em vez de falhar tudo
        if (allResults.length > 0) break;
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erro da SerpAPI: ' + data.error }) };
      }

      const pageResults = data.place_results ? [data.place_results] : (data.local_results || []);

      if (pageResults.length === 0) break; // acabaram os resultados, para de paginar

      for (const p of pageResults) {
        const key = (p.title || '') + '|' + (p.address || '');
        if (seen.has(key)) continue;
        seen.add(key);
        allResults.push({
          name: p.title || '—',
          address: p.address || '—',
          phone: p.phone || '',
          website: p.website || '',
          rating: p.rating || null,
          review_count: p.reviews || p.review_count || 0,
          maps_url: p.review_url || p.maps_url || p.link || '',
          type: p.type || nicho
        });
      }

      // Se essa página veio com menos que o máximo esperado, provavelmente não há mais páginas
      if (pageResults.length < RESULTS_PER_PAGE && !data.place_results) break;
    }

    return { statusCode: 200, headers, body: JSON.stringify({ results: allResults, pages_fetched: Math.min(numPages, allResults.length > 0 ? numPages : 1) }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erro desconhecido no servidor' }) };
  }
};
