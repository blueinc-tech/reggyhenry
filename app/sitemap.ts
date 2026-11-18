import type { MetadataRoute } from "next";
import { getCampaigns, getEvents } from "@/lib/charity";
import { SITE_URL } from "@/lib/config";
import { getAllPostEntries, getCategories } from "@/lib/data";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const [posts, categories, events, campaigns] = await Promise.all([getAllPostEntries(), getCategories(), getEvents(), getCampaigns()]);
	const pages = ["/", "/about/", "/events/", "/news/", "/gallery/", "/volunteers/", "/become-volunteer/", "/donation/", "/donate-now/", "/faq/", "/contact/"];
	return [
		...pages.map((p) => ({ url: `${SITE_URL}${p}` })),
		...campaigns.map((c) => ({ url: `${SITE_URL}${c.href}` })),
		...events.map((e) => ({ url: `${SITE_URL}${e.href}` })),
		...categories.filter((c) => (c.count ?? 0) > 0).map((c) => ({ url: `${SITE_URL}/category/${c.slug}/` })),
		...posts.map((p) => ({ url: `${SITE_URL}${p.href}`, lastModified: p.modified })),
	];
}
