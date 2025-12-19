// Centralized helper to prevent [object Object] and handle type safety
export const safeString = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  if (typeof val === 'string') {
    // Aggressively clean up any accidental object stringifications
    if (val.includes('[object Object]')) return '';
    return val;
  }
  // If it's an object, array, or symbol, return empty string to prevent rendering issues
  return '';
};

export const safeNum = (val: any): number => {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};