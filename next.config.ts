import type { NextConfig } from "next";

// Only the real domain is indexed; previews and test copies stay out of search results.
const IS_PUBLIC_SITE = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://rhagfnig.org.ng").hostname === "rhagfnig.org.ng";

const securityHeaders = [
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{ key: "X-Frame-Options", value: "SAMEORIGIN" },
	{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
	{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
	// The old WordPress permalinks end in a slash; keep every URL identical.
	trailingSlash: true,
	poweredByHeader: false,
	experimental: {
		// Admin uploads (files up to 10 MB) go through server actions.
		serverActions: { bodySizeLimit: "12mb" },
	},
	images: {
		remotePatterns: [
			// Uploaded files in production: the S3 media bucket (lib/storage.ts).
			{ protocol: "https", hostname: "**.amazonaws.com", pathname: "/uploads/**" },
		],
		formats: ["image/avif", "image/webp"],
	},
	async headers() {
		const headers = IS_PUBLIC_SITE ? securityHeaders : [...securityHeaders, { key: "X-Robots-Tag", value: "noindex, nofollow" }];
		return [
			{ source: "/:path*", headers },
			// The theme's files never change under the same name.
			{ source: "/legacy/wp-:dir(content|includes)/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }] },
		];
	},
	async redirects() {
		return [
			// WordPress search addresses.
			{ source: "/", has: [{ type: "query", key: "s", value: "(?<q>.*)" }], destination: "/search/?s=:q", permanent: true },
			// Rank Math sitemaps → the single Next.js sitemap.
			{ source: "/sitemap_index.xml", destination: "/sitemap.xml", permanent: true },
			{ source: "/:name(post|page|give_forms|event|category|post_tag|author)-sitemap:n(\\d*).xml", destination: "/sitemap.xml", permanent: true },
			// GiveWP's donor pages and old WordPress sign-in addresses.
			{ source: "/donor-dashboard/:path*", destination: "/donation/", permanent: true },
			{ source: "/wp-admin/:path*", destination: "/admin/", permanent: false },
			{ source: "/wp-login.php", destination: "/admin/login/", permanent: false },
			// Event and campaign archives the theme linked to.
			{ source: "/event/", destination: "/events/", permanent: true },
			{ source: "/donations/", destination: "/donation/", permanent: true },
		];
	},
};

export default nextConfig;
