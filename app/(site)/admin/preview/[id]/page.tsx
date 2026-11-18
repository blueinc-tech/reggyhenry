import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThemePage } from "@/components/theme/ThemePage";
import { requireUser } from "@/lib/auth";
import { renderPostPreview } from "@/lib/theme/pages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

/** An article (draft or not) in the site's own design, for signed-in editors only. */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
	await requireUser();
	const { id } = await params;
	if (!/^\d+$/.test(id)) notFound();
	const r = await renderPostPreview(Number(id));
	if (!r) notFound();
	return <ThemePage html={r.html} bodyClass={r.bodyClass} />;
}
