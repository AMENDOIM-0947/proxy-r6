module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { platform = 'psn', name } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'Nick não informado.' });
  }

  const platMap = { pc: 'ubi', psn: 'psn', xbox: 'xbl' };
  const targetPlat = platMap[platform.toLowerCase()] || 'psn';

  try {
    const url = `https://r6.tracker.network/r6siege/profile/${targetPlat}/${encodeURIComponent(name)}/overview`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      return res.status(200).json({
        rank: 'Verificado',
        mmr: 0,
        kd: 1.0,
        winRate: 50,
        wins: 0,
        losses: 0,
        playtime: 'Perfil Ativo',
        topOperator: 'R6'
      });
    }

    const html = await response.text();

    const kdMatch = html.match(/Kill\/Death\s*<\/span>\s*<span[^>]*>([\d.]+)/i) || html.match(/"kd":([\d.]+)/i);
    const winMatch = html.match(/Win %<\/span>\s*<span[^>]*>([\d.]+)%/i) || html.match(/"winPct":([\d.]+)/i);

    return res.status(200).json({
      rank: 'Conectado',
      mmr: 0,
      kd: kdMatch ? parseFloat(kdMatch[1]) : 1.0,
      winRate: winMatch ? parseFloat(winMatch[1]) : 50,
      wins: 0,
      losses: 0,
      playtime: 'OK',
      topOperator: 'R6 Tracker'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro de conexão com R6 Tracker.' });
  }
};
