const TEAM_LOGO_MAP = {
  'גבעת עדה חלוצים': '/logos/givat-ada-halutzim.png',
  'בלג בוגרים': '/logos/balag-bogrim.png',
  'גבעת עדה נוער': '/logos/givat-ada-noar.png',
  'רמת ישי': '/logos/ramat-yishai.png',
  'קריית מוצקין': '/logos/kiryat-motzkin.png',
  'קריית ביאליק': '/logos/kiryat-bialik.png',
  'בלג נוער': '/logos/balag-noar.png',
}

export function getTeamLogoPath(team) {
  if (!team) return null
  return team.logo_url || TEAM_LOGO_MAP[team.name] || null
}
