import { HeroSection } from './HeroSection';
import { PromosSection } from './PromosSection';
import { AmenitiesSection } from './AmenitiesSection';
import { MyUnitSection } from './MyUnitSection';
import { LocationSection } from './LocationSection';
import { RatesSection } from './RatesSection';
import { FaqSection } from './FaqSection';
import { PublicFooter } from './PublicFooter';

/**
 * R1: public home, single scrolling page. PublicNavbar (F5) sits above this via PublicLayout.
 * After the rates: the FAQ. The viewing form (F7) lives only in the modal (ViewingModal.tsx).
 */
export function PublicHomePage() {
  return (
    <main id="main">
      <HeroSection />
      <PromosSection />
      <AmenitiesSection />
      <MyUnitSection />
      <LocationSection />
      <RatesSection />
      <FaqSection />
      <PublicFooter />
    </main>
  );
}
