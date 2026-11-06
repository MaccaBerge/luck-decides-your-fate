import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { WheelMark } from "../components/game/WheelMark";
import { card, secondaryBtn } from "../components/game/buttons";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="font-display text-[19px] font-semibold text-ink">{title}</h2>
      <p className="text-[15px] leading-relaxed text-ink-muted">{children}</p>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col gap-6 px-4 pt-7 pb-12 text-ink sm:px-6">
      <div className="flex items-center gap-2.5">
        <WheelMark />
        <span className="font-display text-[19px] font-semibold">Luck Decides Your Fate</span>
      </div>
      <div className={`${card} flex flex-col gap-5 p-6`}>
        <h1 className="font-display text-[30px] leading-tight font-semibold">Privacy</h1>
        <Section title="What's stored">
          The server stores the names people type, their colours, wheel settings and spin results.
        </Section>
        <Section title="Who can see it">
          Anyone with a wheel's link can see and change that wheel. The site's operator can view, change and delete
          wheels and their settings. Please don't enter full names or anything sensitive.
        </Section>
        <Section title="How long it's kept">
          Ordinary wheels are deleted after 7 days without activity. Wheels created from a link made by the operator
          aren't deleted automatically; the operator removes them.
        </Section>
        <Section title="On your device">
          Your browser's local storage keeps your theme, your sound setting, your last wheel and any name lists you
          save. The site uses no advertising or tracking cookies.
        </Section>
        <Section title="Hosting">
          The site runs on Railway behind Cloudflare, whose systems process technical data such as IP addresses.
        </Section>
      </div>
      <Link to="/" className={`${secondaryBtn} self-start`}>
        Back to the wheel
      </Link>
    </main>
  );
}
