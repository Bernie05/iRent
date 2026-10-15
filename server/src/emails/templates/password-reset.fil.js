/** password-reset (FIL) — R50. data: { name?, link }
 *  FIL copy is a developer draft, pending Bernie's review (OQ-15). */
export default (d) => ({
  subject: 'I-reset ang iyong iRent password',
  heading: 'I-reset ang iyong password',
  blocks: [
    {
      p: d.name
        ? `Hi ${d.name}, nakatanggap kami ng kahilingang i-reset ang iyong iRent password.`
        : 'Nakatanggap kami ng kahilingang i-reset ang iyong iRent password.',
    },
    { button: { label: 'Magtakda ng bagong password', url: d.link } },
    { note: 'Isang beses lang magagamit ang link na ito at mag-e-expire ito sa loob ng 24 na oras. Kung hindi ikaw ang humiling nito, balewalain lang ang email na ito; hindi magbabago ang iyong password.' },
  ],
});
