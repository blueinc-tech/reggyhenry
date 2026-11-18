import { db } from "@/lib/db";

/**
 * Old WordPress file addresses (/wp-content/uploads/…), still linked from other
 * sites and search results, lead to the same file in the media library.
 * Resized copies ("photo-300x200.jpg") lead to the original.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
	const rel = (await params).path.map((p) => decodeURIComponent(p)).join("/");
	if (!/^[\w./ %()+-]+$/.test(rel) || rel.includes("..")) return new Response("Not found", { status: 404 });
	const exact = `/wp-content/uploads/${rel}`;
	const original = exact.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1");
	const rows = await db()<{ url: string; original_url: string }[]>`
		select url, original_url from media
		where original_url like ${"%" + exact} or original_url like ${"%" + original}
		order by length(original_url) desc limit 2`;
	const hit = rows.find((r) => r.original_url.endsWith(exact)) ?? rows[0];
	if (!hit) return new Response("Not found", { status: 404 });
	return new Response(null, { status: 308, headers: { Location: hit.url, "Cache-Control": "public, max-age=86400" } });
}
