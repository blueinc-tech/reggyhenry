import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { ThemePage } from "@/components/theme/ThemePage";
import { resolvePath } from "@/lib/theme/pages";

export const revalidate = 300;

// Render on first request, then cache.
export function generateStaticParams() {
	return [];
}

type Props = { params: Promise<{ path: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const resolve = cache(async (path: string[], query: string) => resolvePath(path, Object.fromEntries(new URLSearchParams(query))));

async function load({ params, searchParams }: Props) {
	const { path } = await params;
	// Only the search and receipt pages read the query string.
	const wantsQuery = path[0] === "search" || path[0] === "donation-confirmation";
	const query = wantsQuery ? new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString() : "";
	return resolve(path, query);
}

export async function generateMetadata(props: Props): Promise<Metadata> {
	const r = await load(props);
	if (!r || "redirect" in r) return { title: "Page not found - RHAGF", robots: { index: false } };
	return r.metadata;
}

export default async function Page(props: Props) {
	const r = await load(props);
	if (!r) notFound();
	if ("redirect" in r) permanentRedirect(r.redirect);
	return <ThemePage html={r.html} bodyClass={r.bodyClass} schema={r.schema} />;
}
