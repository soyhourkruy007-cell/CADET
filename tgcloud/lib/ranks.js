// Rank ladder, lowest to highest. Edit freely to match your organisation.
export const RANKS = [
  'cadet',
  'senior_cadet',
  'corporal',
  'sergeant',
  'staff_sergeant',
  'warrant_officer',
  'cadet_officer',
];

export const STATUSES = ['pending', 'active', 'suspended'];
export const ROLES = ['member', 'admin'];

export function isRank(value) {
  return RANKS.includes(value);
}
