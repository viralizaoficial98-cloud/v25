import { Hero } from '@/components/site/Hero';
import { About } from '@/components/site/About';
import { Timeline } from '@/components/site/Timeline';
import { Group } from '@/components/site/Group';
import { EventInfo } from '@/components/site/EventInfo';
import { Tickets } from '@/components/site/Tickets';
import { Memories } from '@/components/site/Memories';
import { Faq } from '@/components/site/Faq';

export default function Landing() {
  return (
    <>
      <Hero />
      <About />
      <Timeline />
      <Group />
      <EventInfo />
      <Tickets />
      <Memories />
      <Faq />
    </>
  );
}
