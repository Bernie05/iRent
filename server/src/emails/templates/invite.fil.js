/** invite (FIL) — R15, D-10. data: { name, link }
 *  FIL copy is a developer draft, pending Bernie's review (OQ-15). */
export default (d) => ({
  subject: 'Maligayang pagdating sa iRent — itakda ang iyong password',
  heading: `Maligayang pagdating sa iRent, ${d.name}!`,
  blocks: [
    { p: 'Handa na ang iyong renter account. Itakda ang iyong password para makita ang iyong kama, balanse, mga bayarin at mga bayad, at para makapagbayad ng upa online.' },
    { button: { label: 'Itakda ang password', url: d.link } },
    { note: 'Isang beses lang magagamit ang link na ito at mag-e-expire ito sa loob ng 24 na oras. Kung expired na, gamitin ang "Nakalimutan ang password?" sa login page o hilingin sa may-ari na ipadala muli ang imbitasyon.' },
  ],
});
