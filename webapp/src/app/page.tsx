import Image from 'next/image';
export const dynamic = 'force-dynamic';
export default function Home() {
  return (
    <div className="home">
      <div className="banner-wrap">
        <Image
          src="/images/queer-support-banner.png"
          alt="Queer Support at APAIT, with a group gathered beneath a rainbow flag"
          width={2000}
          height={1000}
          priority
        />
      </div>
      <section className="card home-card">
        <span className="eyebrow">APAIT · Garden Grove</span>
        <h1>Queer Support RSVP</h1>
        <p>
          To RSVP, open the event link shared by your organizer. Each event has
          its own signup page.
        </p>
        <p className="help">
          Already signed up? Return to that event’s link on the same device and
          browser, or use the private link in your confirmation email.
        </p>
      </section>
    </div>
  );
}
