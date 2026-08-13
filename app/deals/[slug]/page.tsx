import { notFound } from "next/navigation";
import { UnderwritingApp } from "@/components/UnderwritingApp";

export default async function DealPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== "atlas") notFound();
  return <UnderwritingApp initialView="overview" />;
}
