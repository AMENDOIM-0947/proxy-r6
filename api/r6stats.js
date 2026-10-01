/**
 * GET /api/r6stats?platform=pc|psn|xbox&name=NICK
 *
 * Resposta 200 (formato esperado pelo Keef Note; campo ausente = null -> "N/D"):
 *   { rank, mmr, kd, winRate, wins, losses, playtime, topOperator }
 *
 * Esta função NÃO faz scraping do r6.tracker.network e não usa endpoints privados.
 * Ela consulta uma fonte autorizada, configurada por variável de ambiente
 * (R6_UPSTREAM_URL), e normaliza a resposta. Ajuste só mapUpstream() para a sua fonte.
 */
'use strict';

const PLATFORMS = ['pc', 'psn', 'xbox'];
const NAME_RE = /^[\p{L}\p{N}._\- ]{1,40}$/u;
const TIMEOUT_MS = 8000;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const fail = (res, status, error, message, extra = {}) =>
  res.status(status).json({ error, message, ...extra });

// Lê o primeiro caminho existente ("a.b.c") dentro do objeto.
function pick(obj, paths) {
  for (const p of paths) {
    const v = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}
const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  return Number.isFinite(n) ? n : null;
};

/**
 * PONTO DE AJUSTE: converte a resposta da SUA fonte para o formato do Keef Note.
 * Os caminhos abaixo são exemplos comuns; troque pelos nomes reais da sua fonte.
 * Nunca preenche valores inventados: o que não existe fica null.
 */
function mapUpstream(d) {
  const wins = num(pick(d, ['wins', 'ranked.wins', 'data.wins', 'stats.wins']));
  const losses = num(pick(d, ['losses', 'ranked.losses', 'data.losses', 'stats.losses']));
  let winRate = num(pick(d, ['winRate', 'win_rate', 'ranked.winRate', 'data.winRate']));
  if (winRate === null && wins !== null && losses !== null && wins + losses > 0) {
    winRate = Math.round((wins / (wins + losses)) * 1000) / 10; // derivado de dados reais
  }
  return {
    rank: pick(d, ['rank', 'rankName', 'ranked.rank', 'data.rank']),
    mmr: num(pick(d, ['mmr', 'rp', 'ranked.mmr', 'data.mmr'])),
    kd: num(pick(d, ['kd', 'kdRatio', 'ranked.kd', 'data.kd'])),
    winRate,
    wins,
    losses,
    playtime: pick(d, ['playtime', 'timePlayed', 'data.playtime']),
    topOperator: pick(d, ['topOperator', 'mostPlayedOperator', 'data.topOperator']),
  };
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed', 'Use GET.');

  const platform = String(req.query.platform || '').toLowerCase();
  const name = String(req.query.name || '').trim();
  if (!PLATFORMS.includes(platform))
    return fail(res, 400, 'invalid_platform', 'platform deve ser pc, psn ou xbox.');
  if (!NAME_RE.test(name))
    return fail(res, 400, 'invalid_name', 'name é obrigatório (até 40 caracteres, sem símbolos especiais).');

  const tpl = process.env.R6_UPSTREAM_URL;
  if (!tpl)
    return fail(res, 503, 'upstream_not_configured',
      'Nenhuma fonte de dados configurada. Defina R6_UPSTREAM_URL nas variáveis de ambiente da Vercel.');

  const url = tpl
    .replace('{platform}', encodeURIComponent(platform))
    .replace('{name}', encodeURIComponent(name));

  const headers = { Accept: 'application/json' };
  if (process.env.R6_UPSTREAM_KEY)
    headers[process.env.R6_UPSTREAM_KEY_HEADER || 'X-Api-Key'] = process.env.R6_UPSTREAM_KEY;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let up;
  try {
    up = await fetch(url, { headers, signal: ctl.signal });
  } catch (e) {
    return e.name === 'AbortError'
      ? fail(res, 504, 'upstream_timeout', 'A fonte de dados demorou demais para responder.')
      : fail(res, 503, 'upstream_unreachable', 'Não foi possível contatar a fonte de dados.');
  } finally {
    clearTimeout(timer);
  }

  if (up.status === 404) return fail(res, 404, 'player_not_found', 'Jogador não encontrado nessa plataforma.');
  if (up.status === 401 || up.status === 403)
    return fail(res, 502, 'upstream_auth', 'A fonte recusou a chave configurada (verifique R6_UPSTREAM_KEY).');
  if (up.status === 429) {
    const ra = up.headers.get('retry-after');
    if (ra) res.setHeader('Retry-After', ra);
    return fail(res, 503, 'upstream_rate_limited', 'Limite de consultas da fonte atingido. Tente mais tarde.');
  }
  if (!up.ok) return fail(res, 503, 'upstream_unavailable', `A fonte respondeu ${up.status}.`);

  let data;
  try { data = await up.json(); }
  catch { return fail(res, 502, 'invalid_upstream_response', 'A fonte não devolveu JSON válido.'); }

  const out = mapUpstream(data);
  if (Object.values(out).every((v) => v === null))
    return fail(res, 502, 'unexpected_upstream_format',
      'A resposta da fonte não contém campos reconhecidos. Ajuste mapUpstream() em api/r6stats.js.');

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.status(200).json(out);
};
    
