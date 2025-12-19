// Centralized helper to prevent [object Object] and handle type safety
export const safeString = (val: any): string => {
  if (val === null || val === undefined) return '';
  
  if (typeof val === 'string') {
    // Aggressively clean up any accidental object stringifications
    if (val.includes('[object Object]')) return '';
    return val;
  }

  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  
  if (val instanceof Date) return val.toISOString();
  if (val instanceof Error) return val.message;

  // If it's an object/array, try to process it, but never return [object Object]
  if (typeof val === 'object') {
    try {
      // Prioritize common error properties
      if (val.message && typeof val.message === 'string') return val.message;
      if (val.error && typeof val.error === 'string') return val.error;
      if (val.name && typeof val.name === 'string' && val.name !== 'Object') return val.name;

      // Check if it has a custom toString that isn't the default Object one
      const str = String(val);
      if (str !== '[object Object]') return str;
    } catch (e) {
      return '';
    }
  }

  return '';
};

export const safeNum = (val: any): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};