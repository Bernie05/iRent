/**
 * Plain branded email layout (HTML + text part). Templates return a content model; every
 * string in it is escaped here, so templates can never inject markup (B11: user text escaped).
 *
 * Content model:
 *   { subject, heading, blocks: Block[], footer? }
 *   Block = { p: string }                       paragraph
 *         | { rows: [label, value][] }          key/value table
 *         | { list: string[] }                  bullet list
 *         | { quote: string }                   user-provided multi-line text (reason, body)
 *         | { button: { label, url } }          call to action (http/https only)
 *         | { note: string }                    small print
 */
import { escapeHtml, safeUrl } from './format.js';

const BRAND = {
  primary: '#A35E04', // orange/700 — AA with white text (DESIGN.md)
  accent: '#F4900A', // logo bright, accents only
  text: '#27272A',
  muted: '#52525B',
  border: '#E4E4E7',
  bg: '#FAFAFA',
};

const multiline = (s) => escapeHtml(s).replace(/\r?\n/g, '<br>');

function blockHtml(block) {
  if ('p' in block) return `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(block.p)}</p>`;
  if ('note' in block) {
    return `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${BRAND.muted}">${escapeHtml(block.note)}</p>`;
  }
  if ('quote' in block) {
    return `<div style="margin:0 0 16px;padding:12px 16px;border-left:4px solid ${BRAND.accent};background:${BRAND.bg};line-height:1.5">${multiline(block.quote)}</div>`;
  }
  if ('list' in block) {
    const items = block.list.map((i) => `<li style="margin:0 0 4px">${escapeHtml(i)}</li>`).join('');
    return `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.5">${items}</ul>`;
  }
  if ('rows' in block) {
    const rows = block.rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:${BRAND.muted};vertical-align:top">${escapeHtml(k)}</td>` +
          `<td style="padding:6px 0;font-weight:600;vertical-align:top">${escapeHtml(v)}</td></tr>`,
      )
      .join('');
    return `<table role="presentation" style="margin:0 0 16px;border-collapse:collapse">${rows}</table>`;
  }
  if ('button' in block) {
    const url = safeUrl(block.button.url);
    if (!url) return '';
    return (
      `<p style="margin:0 0 16px"><a href="${escapeHtml(url)}" ` +
      `style="display:inline-block;padding:12px 20px;background:${BRAND.primary};color:#FFFFFF;` +
      `text-decoration:none;border-radius:8px;font-weight:600">${escapeHtml(block.button.label)}</a></p>`
    );
  }
  return '';
}

function blockText(block) {
  if ('p' in block) return block.p;
  if ('note' in block) return block.note;
  if ('quote' in block) return String(block.quote).split(/\r?\n/).map((l) => `> ${l}`).join('\n');
  if ('list' in block) return block.list.map((i) => `- ${i}`).join('\n');
  if ('rows' in block) return block.rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  if ('button' in block) {
    const url = safeUrl(block.button.url);
    return url ? `${block.button.label}: ${url}` : '';
  }
  return '';
}

/**
 * @param {object} content  template content model
 * @param {object} opts     { lang, logoUrl }
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderLayout(content, { lang = 'en', logoUrl } = {}) {
  const blocks = content.blocks.filter(Boolean);
  const logo = safeUrl(logoUrl);
  const footer =
    content.footer ??
    (lang === 'fil'
      ? 'Ang email na ito ay mula sa iRent · BLDG-Q UDHO Community.'
      : 'This email was sent by iRent · BLDG-Q UDHO Community.');

  const html = `<!doctype html>
<html lang="${lang === 'fil' ? 'fil' : 'en'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${BRAND.text};font-size:15px">
<table role="presentation" width="100%" style="border-collapse:collapse;background:${BRAND.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;border-collapse:collapse;background:#FFFFFF;border:1px solid ${BRAND.border};border-radius:12px">
<tr><td style="padding:24px 24px 8px;border-bottom:3px solid ${BRAND.accent}">${
    logo
      ? `<img src="${escapeHtml(logo)}" alt="iRent · BLDG-Q UDHO Community" height="48" style="display:block;height:48px;border:0">`
      : `<span style="font-size:22px;font-weight:700;color:${BRAND.primary}">iRent</span>`
  }</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${BRAND.text}">${escapeHtml(content.heading)}</h1>
${blocks.map(blockHtml).join('\n')}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${BRAND.border};font-size:12px;color:${BRAND.muted}">${escapeHtml(footer)}</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [content.heading, '', ...blocks.map(blockText).filter(Boolean).flatMap((t) => [t, '']), '--', footer].join('\n');

  return { subject: content.subject, html, text };
}
