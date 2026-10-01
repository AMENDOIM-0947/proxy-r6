module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { platform = 'psn', name, key } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'Nick não informado.' });
  }

  // Cole sua chave do ScraperAPI entre as aspas abaixo
  const SCRAPER_KEY = key || 'a7fde4fc28ef5fd82cd42a850a67b8a1';

  const platMap = { pc: 'ubi', psn: 'psn', xbox: 'xbl' };
  const targetPlat = platMap[platform.toLowerCase()] || 'psn';
  const targetUrl = `https://r6.tracker.network/r6siege/profile/${targetPlat}/${encodeURIComponent(name)}/overview`;

  try {
    const fetchUrl = SCRAPER_KEY 
      ? `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(targetUrl)}`
      : targetUrl;

    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error('Falha no acesso ao Tracker');

    const html = await response.text();

    const kdMatch = html.match(/Kill\/Death\s*<\/span>\s*<span[^>]*>([\d.]+)/i) || html.match(/"kd":([\d.]+)/i);
    const winMatch = html.match(/Win %<\/span>\s*<span[^>]*>([\d.]+)%/i) || html.match(/"winPct":([\d.]+)/i);
    const rankMatch = html.match(/"rankName":"([^"]+)"/i) || html.match(/Rank\s*<\/span>\s*<span[^>]*>([^<]+)/i);

    return res.status(200).json({
      rank: rankMatch ? rankMatch[1] : 'Ativo',
      mmr: 0,
      kd: kdMatch ? parseFloat(kdMatch[1]) : 1.0,
      winRate: winMatch ? parseFloat(winMatch[1]) : 50,
      wins: 0,
      losses: 0,
      playtime: 'OK',
      topOperator: 'R6'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Não foi possível extrair os dados.' });
  }
};
