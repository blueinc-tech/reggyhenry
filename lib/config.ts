/**
 * Site-wide settings. Infrastructure values come from the environment; the rest
 * carries over from the old WordPress site.
 */

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** The public URL of this site, used for canonicals, sitemaps and feeds. */
export const SITE_URL = trimSlash(process.env.NEXT_PUBLIC_SITE_URL || "https://rhagfnig.org.ng");

/** Only the real domain is indexed; previews and test copies are not. */
export const IS_PUBLIC_SITE = new URL(SITE_URL).hostname === "rhagfnig.org.ng";

export const SITE_NAME = "RHAGF";
export const ORG_NAME = "Regy & Henry Amazing Grace Foundation";
export const SITE_TAGLINE = "A Unified Front Against Poverty, Exploitation, and Injustice.";

/** Seconds before cached pages are rebuilt (saving in the admin refreshes them at once). */
export const REVALIDATE = 300;

/** Categories that describe placement rather than subject; never shown as a story's label. */
export const PLACEMENT_CATEGORIES = ["uncategorized"];

/** WordPress pages left over from the theme's demo content: each one redirects to the real page. */
export const DEMO_PAGE_REDIRECTS: Record<string, string> = {
	"home-01": "/",
	"home-03": "/",
	"home-04": "/",
	"one-page-home-one": "/",
	"one-page-home-two": "/",
	"one-page-home-three": "/",
	"sample-page": "/",
	"sample-page-2": "/",
	"login-page": "/admin/login/",
	"donor-dashboard": "/donation/",
	"donor-dashboard-2": "/donation/",
	"donation-confirmation-2": "/donation-confirmation/",
	"donation-failed-2": "/donation-failed/",
	"donations-carousel": "/donation/",
	"donations-list": "/donation/",
	"events-carousel": "/events/",
	"news-carousel": "/news/",
	"news-sidebar": "/news/",
	"volunteers-carousel": "/volunteers/",
	"volunteers-2": "/volunteers/",
	"gallery-carousel": "/gallery/",
};

/** Pages built from the old site's Elementor layouts (lib/theme/templates.json). */
export const THEME_PAGES = [
	"about",
	"events",
	"news",
	"gallery",
	"volunteers",
	"become-volunteer",
	"donation",
	"donate-now",
	"faq",
	"contact",
	"donation-confirmation",
	"donation-failed",
] as const;
export type ThemePage = (typeof THEME_PAGES)[number];

/** Contact details published on the live site. */
export const CONTACT = {
	email: "info@rhagfnig.org.ng",
	phone: "+2348026748190",
	address: "Suite B406 (b), 3rd Floor Global Plaza, Abuja",
};
