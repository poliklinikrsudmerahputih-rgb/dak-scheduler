export function parseSessionValue(session) {
  if (!session) return null;
  const v = session.value ?? session;
  try {
    return JSON.parse(v);
  } catch (e) {
    try {
      const dec = decodeURIComponent(String(v));
      return JSON.parse(dec);
    } catch (e2) {
      try {
        // Some libs store without quotes; try eval-like JSON parsing (safe-ish)
        const s = String(v).trim();
        if (s.startsWith('{') || s.startsWith('[')) return JSON.parse(s.replace(/\r?\n/g,' '));
      } catch (e3) {}
      return null;
    }
  }
}
