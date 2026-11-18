import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThemePage } from "@/components/theme/ThemePage";
import { renderHome, type Rendered } from "@/lib/theme/pages";

export const revalidate = 300;

const home = async () => (await renderHome()) as Rendered | null;

export async function generateMetadata(): Promise<Metadata> {
	return (await home())?.metadata ?? {};
}

export default async function HomePage() {
	const r = await home();
	if (!r) notFound();
	return <ThemePage html={r.html} bodyClass={r.bodyClass} />;
}
