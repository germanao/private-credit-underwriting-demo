import { notFound } from "next/navigation";
import { UnderwritingApp } from "@/components/UnderwritingApp";
import type { ViewKey } from "@/lib/demo-state";

const sections = new Set(["securities", "diligence", "memo"]);

export default async function DealSectionPage({
  params,
}: {
  params: Promise<{ slug: string; section: string }>;
}) {
  const { slug, section } = await params;
  if (slug !== "atlas" || !sections.has(section)) notFound();
  return <UnderwritingApp initialView={section as ViewKey} />;
}
