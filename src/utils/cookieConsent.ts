export type CookieConsentLevel = 'all' | 'essential';

const COOKIE_CONSENT_KEY = 'univ-meeting:legal:cookie-consent';
const COOKIE_CONSENT_AT_KEY = 'univ-meeting:legal:cookie-consent-at';
const CONSENT_EVENT_NAME = 'univ-cookie-consent-change';

export function getCookieConsent(): CookieConsentLevel | null {
  try {
    const val = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    if (val === 'all' || val === 'essential') {
      return val;
    }
    return null;
  } catch {
    return null;
  }
}

export function getCookieConsentTimestamp(): number | null {
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_AT_KEY);
    return raw ? Number(raw) || null : null;
  } catch {
    return null;
  }
}

export function setCookieConsent(level: CookieConsentLevel): void {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, level);
    window.localStorage.setItem(COOKIE_CONSENT_AT_KEY, String(Date.now()));
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT_NAME, { detail: level }));
  } catch {
    // ignore storage quota errors
  }
}

export function subscribeCookieConsent(
  listener: (level: CookieConsentLevel | null) => void
): () => void {
  const handleCustom = () => listener(getCookieConsent());
  const handleStorage = (e: StorageEvent) => {
    if (e.key === COOKIE_CONSENT_KEY) {
      listener(getCookieConsent());
    }
  };
  window.addEventListener(CONSENT_EVENT_NAME, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(CONSENT_EVENT_NAME, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}
