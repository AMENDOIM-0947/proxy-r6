module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { platform = 'psn', name } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'Informe o nick do jogador.' });
  }

  const platMap = { pc: 'ubi', psn: 'psn', xbox: 'xbl' };
  const targetPlat = platMap[platform.toLowerCase()] || 'psn';

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `https://r6.tracker.network/r6siege/profile/${targetPlat}/${encodeURIComponent(name)}/overview`
  };

  try {
    // 1. Consulta a API JSON interna do Tracker Network
    const trnApiUrl = `https://tracker.gg/api/v2/r6/standard/profile/${targetPlat}/${encodeURIComponent(name)}`;
    const apiRes = await fetch(trnApiUrl, { headers });

    if (apiRes.ok) {
      const json = await apiRes.json();
      const overview = json.data?.segments?.find(s => s.type === 'overview') || json.data?.segments?.[0];
      const stats = overview?.stats || {};

      return res.status(200).json({
        rank: stats.rankValue?.metadata?.rankName || overview?.metadata?.rankName || 'Sem Rank',
        mmr: Math.round(stats.rankPoints?.value || stats.rating?.value || 0),
        kd: parseFloat((stats.kd?.value || stats.killDeathRatio?.value || 0).toFixed(2)),
        winRate: Math.round(stats.wlRatio?.value || stats.winMatchesPct?.value || 0),
        wins: stats.wins?.value || stats.matchesWon?.value || 0,
        losses: stats.losses?.value || stats.matchesLost?.value || 0,
        playtime: stats.timePlayed?.displayValue || `${Math.round((stats.timePlayed?.value || 0) / 3600)}h`,
        topOperator: overview?.metadata?.mostPlayedOperator || 'R6'
      });
    }

    // 2. Fallback: Parse do JSON embutido (__NEXT_DATA__) na página pública
    const pageUrl = `https://r6.tracker.network/r6siege/profile/${targetPlat}/${encodeURIComponent(name)}/overview`;
    const pageRes = await fetch(pageUrl, { headers: { ...headers, 'Accept': 'text/html' } });

    if (!pageRes.ok) {
      return res.status(404).json({ error: `Perfil "${name}" não encontrado na plataforma ${platform.toUpperCase()}.` });
    }

    const html = await pageRes.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);

    if (nextDataMatch) {
      const nextData = JSON.parse(nextDataMatch[1]);
      const segments = nextData.props?.pageProps?.profile?.segments || [];
      const stats = segments[0]?.stats || {};

      return res.status(200).json({
        rank: stats.rankName?.value || 'Ativo',
        mmr: Math.round(stats.mmr?.value || 0),
        kd: parseFloat((stats.kd?.value || 0).toFixed(2)),
        winRate: Math.round(stats.winPct?.value || 0),
        wins: stats.wins?.value || 0,
        losses: stats.losses?.value || 0,
        playtime: stats.playtime?.displayValue || 'N/D',
        topOperator: 'R6'
      });
    }

    return res.status(500).json({ error: 'Não foi possível extrair a estrutura de dados.' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro de conexão com o R6 Tracker.' });
  }
};
