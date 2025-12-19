// Centralized helper to prevent [object Object] and handle type safety
export const safeString = (val: any): string => {
  if (val === null || val === undefined) return '';
  
  // Recursively process if it's a string to catch nested stringification issues
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '[object Object]' || val.includes('[object Object]')) return '';
    return val;
  }

  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  
  if (val instanceof Date) return val.toISOString();
  if (val instanceof Error) return safeString(val.message);

  // If it's an object/array, try to extract meaningful text
  if (typeof val === 'object') {
    try {
      // Prioritize explicit error/message properties common in Supabase/Postgres/Auth errors
      if (val.message) return safeString(val.message);
      if (val.error_description) return safeString(val.error_description);
      if (val.msg) return safeString(val.msg);
      if (val.description) return safeString(val.description);
      
      // If no message but has code (often Supabase errors)
      if (val.code) return `Error Code: ${safeString(val.code)} ${val.details ? '- ' + safeString(val.details) : ''}`;
      
      // Check for name property often found in entities
      if (val.name && val.name !== 'Object' && val.name !== 'Error') return safeString(val.name);
      
      // If it's an array, join it
      if (Array.isArray(val)) {
        return val.map(safeString).filter(Boolean).join(', ');
      }

      // Last resort: simple string conversion, but check for default object string
      const str = String(val);
      if (str === '[object Object]' || str.includes('[object Object]')) return '';
      return str;
    } catch (e) {
      return '';
    }
  }

  // Fallback for symbols or other types
  try {
    const finalStr = String(val);
    return finalStr.includes('[object Object]') ? '' : finalStr;
  } catch (e) {
    return '';
  }
};

export const safeNum = (val: any): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};