import QRCode from 'qrcode';

/**
 * Apple Chromatic QR engine — single shared implementation.
 * Generates a vector QR and injects the Apple Spectral linear gradient in
 * place of the black fills, preserving ISO/IEC 18004 scan compliance.
 */
export async function renderChromaticQR(text: string, gradientId = 'appleQrGrad'): Promise<string> {
  const rawSvg = await QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  const gradientDef = `
    <defs>
      <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0071E3" />
        <stop offset="25%" stop-color="#5856D6" />
        <stop offset="50%" stop-color="#AF52DE" />
        <stop offset="75%" stop-color="#FF2D55" />
        <stop offset="100%" stop-color="#FF9500" />
      </linearGradient>
    </defs>
  `;

  return rawSvg
    .replace('<svg ', '<svg class="w-full h-full" role="img" aria-label="VaultDrop pairing QR code" ')
    .replace(/(stroke|fill)="#000000"/g, `$1="url(#${gradientId})"`)
    .replace('>', `>${gradientDef}`);
}
