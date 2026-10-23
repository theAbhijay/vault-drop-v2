/**
 * Google Lens Redirect Utilities
 * Launches Google Lens directly on mobile devices without any in-browser camera window.
 */

export const GOOGLE_LENS_INTENT_URL =
  'intent://#Intent;package=com.google.ar.lens;component=com.google.ar.lens/com.google.vr.apps.ornament.app.lens.LensLauncherActivity;S.browser_fallback_url=https%3A%2F%2Flens.google.com;end;';

export function redirectToGoogleLens(e?: React.MouseEvent) {
  if (e) {
    // If inside a button click handler, prevent duplicate default navigation if handled manually
    e.preventDefault();
  }

  if (typeof window === 'undefined') return;

  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isAndroid) {
    // Android: Direct Google Lens App Intent
    window.location.href = GOOGLE_LENS_INTENT_URL;
  } else if (isIOS) {
    // iOS: Open Google App Lens or web Lens
    window.location.href = 'googleapp://lens';
    setTimeout(() => {
      window.location.href = 'https://lens.google.com';
    }, 500);
  } else {
    // Desktop: Web Google Lens
    window.open('https://lens.google.com', '_blank', 'noopener,noreferrer');
  }
}
