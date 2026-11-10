import type { JSX } from "react";
import { usePageMeta } from "../hooks/usePageMeta";
import { siteConfig } from "../services/SiteConfig";
import { Hero } from "../components/sections/Hero";
import { ModuleShowcase } from "../components/sections/ModuleShowcase";
import { HowItWorks } from "../components/sections/HowItWorks";
import { WhyNexus } from "../components/sections/WhyNexus";
import { CallToAction } from "../components/sections/CallToAction";
import { NewsBand } from "../components/sections/NewsBand";
import { PartnersBand } from "../components/sections/PartnersBand";

/**
 * Die Startseite.
 *
 * Hero, Neues, Module, Einrichtung, Argumente, wer dabei ist, Aufforderung - in
 * dieser Reihenfolge, weil sie den Fragen folgt, die jemand beim Herunterscrollen
 * stellt: Was ist das, und was passiert gerade? Was kann es? Wie viel Arbeit ist
 * das? Warum das und nicht etwas anderes? Wer steht dahinter? (W-0062)
 */
export function HomePage(): JSX.Element {
    usePageMeta("Discord-Bot für Rocket-League-Orgs", siteConfig.description);

    return (
        <>
            <Hero />
            <NewsBand />
            <ModuleShowcase />
            <HowItWorks />
            <WhyNexus />
            <PartnersBand />
            <CallToAction />
        </>
    );
}
