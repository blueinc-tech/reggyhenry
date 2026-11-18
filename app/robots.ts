import type { MetadataRoute } from "next";
import { IS_PUBLIC_SITE, SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
	// Preview addresses (e.g. *.vercel.app) are never crawled.
	if (!IS_PUBLIC_SITE) return { rules: [{ userAgent: "*", disallow: "/" }] };
	return {
		rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/search/", "/admin/", "/donation-confirmation/", "/donation-failed/"] }],
		sitemap: `${SITE_URL}/sitemap.xml`,
	};
}
