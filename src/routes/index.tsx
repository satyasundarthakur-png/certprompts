import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const CertificateStudio = lazy(() => import("@/components/CertificateStudio"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Certificate Prompt Studio" },
      { name: "description", content: "Analyse certificate designs and create editable prompts for your favourite AI image tools." },
      { property: "og:title", content: "Certificate Prompt Studio" },
      { property: "og:description", content: "Turn certificate images, PDFs and Word documents into detailed design prompts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function LoadingStudio() {
  return <div className="min-h-screen p-6"><h1 className="font-display text-xl">Certificate Prompt Studio</h1><p className="mt-4 text-sm text-muted-foreground" role="status">Loading studio…</p></div>;
}

function Index() {
  return (
    <ClientOnly fallback={<LoadingStudio />}>
      <Suspense fallback={<LoadingStudio />}><CertificateStudio /></Suspense>
    </ClientOnly>
  );
}
