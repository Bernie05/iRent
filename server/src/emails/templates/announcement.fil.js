/** announcement (FIL) — R41. Same data as the EN template.
 *  FIL copy is a developer draft, pending Bernie's review (OQ-15). */
export default (d) => {
  const prefix = d.priority === 'urgent' ? 'Mahalaga: ' : '';
  return {
    subject: `${prefix}${d.title} — iRent`,
    heading: `${prefix}${d.title}`,
    blocks: [{ quote: d.body }, d.url ? { button: { label: 'Buksan ang iRent', url: d.url } } : null],
  };
};
