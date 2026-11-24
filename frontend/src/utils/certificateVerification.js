const verificationOrigin = import.meta.env.VITE_CERTIFICATE_VERIFICATION_ORIGIN || 'http://172.31.20.63:5173';

export function certificateVerificationUrl(code) {
  return new URL(`/verify-certificate/${encodeURIComponent(code)}`, verificationOrigin).href;
}

export function formatCertificateLevel(value) {
  const level = String(value || '').trim();
  if (!level) return '';
  const numericLevel = level.match(/^(?:level\s*)?(\d+)$/i);
  if (numericLevel) return Number(numericLevel[1]) > 0 ? `Level ${Number(numericLevel[1])}` : '';
  return level;
}
