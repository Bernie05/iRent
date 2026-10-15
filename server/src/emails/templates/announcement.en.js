/** announcement (EN) — R41. data: { title, body, priority, url? } */
export default (d) => {
  const prefix = d.priority === 'urgent' ? 'Urgent: ' : '';
  return {
    subject: `${prefix}${d.title} — iRent`,
    heading: `${prefix}${d.title}`,
    blocks: [{ quote: d.body }, d.url ? { button: { label: 'Open iRent', url: d.url } } : null],
  };
};
