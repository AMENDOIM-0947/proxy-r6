module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { platform = 'psn', name } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'Nick não informado.' });
  }

  const platMap = { pc: 'uplay', psn: 'psn', xbox: 'xbl' };
  const targetPlat = platMap[platform.toLowerCase()] || 'psn';

  try {
    // Consulta a API direta da comunidade R6 Tab / Stats
    const response = await fetch(`https://api.r6stats.com/api/v1/stats/${encodeURIComponent(name)}/${targetPlat}/generic`, {
      headers: {
        'User-Agent': 'KeefNoteApp/1.0'
      }
    });

    if (!response.ok) {
      // Tenta rota alternativa pública da Ubisoft caso a principal falhe
      const altResponse = await fetch(`https://r6.tracker.network/api/v0/assets/r6-siege/players/${encodeURIComponent(name)}`);
      if (!altResponse.ok) throw new Error('Jogador não encontrado');
    }

    const data = await response.json();
    const stats = data.stats?.general || {};
    const ranked = data.stats?.queue_stats?.ranked || {};

    return res.status(200).json({
      rank: data.progression?.level ? `Nível ${data.progression.level}` : 'Ativo',
      mmr: ranked.mmr || 0,
      kd: stats.kd ? parseFloat(stats.kd.toFixed(2)) : 0,
      winRate: stats.win_loss_ratio ? Math.round(stats.win_loss_ratio * 100) : 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0,
      playtime: stats.playtime ? `${Math.round(stats.playtime / 3600)} h` : 'N/D',
      topOperator: 'R6 Player'
    });
  } catch (err) {
    // Se a API externa estiver fora do ar, devolve estrutura clara para a app
    return res.status(404).json({ error: 'Não foi possível obter dados automáticos para este Nick.' });
  }
};
