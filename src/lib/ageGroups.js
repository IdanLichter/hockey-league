// Team age categories. There is ONE league (senior/בוגרים); the younger age
// groups exist for youth TOURNAMENTS, not their own leagues. A team belongs to
// exactly one age group (`teams.age_group`); a person who plays two age groups
// has a separate player card per team. Keep these values in sync with the
// `teams_age_group_check` DB constraint.

export const AGE_GROUPS = [
  { value: 'senior', label: 'בוגרים' },
  { value: 'u19', label: 'עד 19' },
  { value: 'u17', label: 'עד 17' },
  { value: 'u15', label: 'עד 15' },
]

export const DEFAULT_AGE = 'senior'

export const AGE_LABEL = Object.fromEntries(AGE_GROUPS.map(a => [a.value, a.label]))

/** Normalize a possibly-missing age_group to a known value (older rows default to senior). */
export const ageOf = (team) => (team?.age_group && AGE_LABEL[team.age_group] ? team.age_group : DEFAULT_AGE)
