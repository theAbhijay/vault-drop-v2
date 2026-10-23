/**
 * Direct launch for Google Lens application on mobile devices.
 * Uses native Android app intent and iOS Google App scheme.
 * Zero search site URLs.
 */

export const GOOGLE_LENS_INTENT_URL =
  'intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.google.ar.lens;end;';

export function redirectToGoogleLens(e?: React.MouseEvent) {
  if (e) {
    e.preventDefault();
  }

  if (typeof window === 'undefined') return;

  const userAgent = navigator.userAgent || '';
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);

  if (isAndroid) {
    // Launch Google Lens app directly via Android Launcher intent
    window.location.href = GOOGLE_LENS_INTENT_URL;
  } else if (isIOS) {
    // Launch Google App Lens on iOS
    window.location.href = 'googleapp://lens';
  } else {
    // On desktop PC, inform the user clearly
    alert('Google Lens is an app on your smartphone. Please open VaultDrop on your phone to scan the PC screen.');
  }
}
