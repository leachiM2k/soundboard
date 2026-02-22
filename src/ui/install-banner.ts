// src/ui/install-banner.ts
// Custom iOS install banner — iOS Safari does NOT support beforeinstallprompt.
// Show once per day after first tile tap, never in standalone mode.

const BANNER_LS_KEY = 'installBannerShownAt';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  // iOS Safari proprietary property
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // Standard display-mode media query (Android + desktop Chrome)
  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayModeStandalone;
}

function wasShownToday(): boolean {
  const ts = localStorage.getItem(BANNER_LS_KEY);
  if (!ts) return false;
  return Date.now() - parseInt(ts, 10) < ONE_DAY_MS;
}

function markShown(): void {
  localStorage.setItem(BANNER_LS_KEY, String(Date.now()));
}

export function shouldShowInstallBanner(): boolean {
  return !isStandalone() && !wasShownToday();
}

export function showInstallBanner(): void {
  if (!shouldShowInstallBanner()) return;
  markShown();

  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.setAttribute('role', 'banner');
  banner.innerHTML = `
    <span class="install-banner-text">
      <strong>↑ Teilen</strong> → <strong>Zum Home-Bildschirm</strong>
    </span>
    <button class="install-banner-close" aria-label="Schließen">✕</button>
  `;

  banner.querySelector<HTMLButtonElement>('.install-banner-close')!.addEventListener('click', () => {
    banner.remove();
  });

  document.body.appendChild(banner);
}
