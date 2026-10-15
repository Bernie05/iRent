/**
 * A neutral placeholder image (inline SVG, no network) for photos Bernie will supply later
 * (DESIGN.md "Photos are placeholders"). Used by the public site (F6) and the mock fixtures.
 */
export function placeholderImage(label: string, width = 400, height = 300): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#E4E4E7"/><text x="${width / 2}" y="${height / 2}" font-family="sans-serif" font-size="16" text-anchor="middle" dominant-baseline="middle" fill="#52525B">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
