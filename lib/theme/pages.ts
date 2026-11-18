import "server-only";
import type { Metadata } from "next";
import { getApprovedComments, getCampaignBySlug, getCampaigns, getEventBySlug, getEvents, getGallery, getPledge, getTeam } from "@/lib/charity";
import { DEMO_PAGE_REDIRECTS, ORG_NAME, SITE_NAME, SITE_URL, THEME_PAGES, type ThemePage } from "@/lib/config";
import { getAuthorBySlug, getCategoryBySlug, getPostBySlug, getPosts, type Post } from "@/lib/data";
import { articleSchema, seoMetadata } from "@/lib/seo";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { truncateWords } from "@/lib/text";
import {
	archiveList,
	articleHtml,
	campaignContent,
	commentsBlock,
	eventLeft,
	eventRight,
	esc,
	fill,
	layout,
	sidebar,
	T,
	type PageData,
} from "./render";

/**
 * Works out what a public address shows and renders it in the old theme's markup.
 * Every public page goes through here (app/(site)/page.tsx and [...path]/page.tsx).
 */

export type Rendered = { html: string; bodyClass: string; metadata: Metadata; schema?: object };
export type Resolved = Rendered | { redirect: string } | null;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PER_PAGE = 10;

/** Rank Math's titles and descriptions on the live site, carried over. */
function themeMeta(key: keyof typeof T.pages, path: string): Metadata {
	const p = T.pages[key];
	return seoMetadata({ title: p.title, description: p.description }, { title: p.title, path });
}

async function themePage(key: ThemePage | "home", path: string, extra: Partial<PageData> = {}): Promise<Rendered> {
	const settings = await getSettings();
	const t = T.pages[key];
	const needs = t.main;
	const data: PageData = {
		settings,
		...(needs.includes('"kind":"causes"') || needs.includes('"kind":"donate-form"') ? { campaigns: await getCampaigns() } : {}),
		...(needs.includes('"kind":"events') ? { events: await getEvents() } : {}),
		...(needs.includes('"kind":"gallery"') ? { gallery: await getGallery() } : {}),
		...(needs.includes('"kind":"team"') ? { team: await getTeam() } : {}),
		...extra,
	};
	const main = await fill(t.main, data);
	return { html: await layout(main, { path, settings }), bodyClass: t.bodyClass, metadata: themeMeta(key, path) };
}

export async function renderHome(page = 1): Promise<Resolved> {
	if (page > 1) {
		const { totalPages } = await getPosts({ perPage: 3, page: 1 });
		if (page > totalPages) return null;
	}
	const r = await themePage("home", page > 1 ? `/page/${page}/` : "/", { page });
	if (page > 1) r.bodyClass = r.bodyClass.replace(/^home /, "home paged ") + ` paged-${page} page-paged-${page}`;
	return r;
}

/* ---------- Detail pages ---------- */

const bodyFor = (cls: string, id: number) => cls.replace(/\bpostid-\d+\b/, `postid-${id}`);

async function renderPost(post: Post): Promise<Rendered> {
	const settings = await getSettings();
	const main = await fill(T.singles.post.main.replace("{{title}}", esc(post.title)), { settings }, { post: () => articleHtml(post), sidebar });
	return {
		html: await layout(main, { path: post.href, settings }),
		bodyClass: bodyFor(T.singles.post.bodyClass, post.id),
		metadata: seoMetadata(post.seo, {
			title: post.title,
			description: post.excerpt,
			path: post.href,
			image: post.image?.url,
			article: { published: post.date, modified: post.modified },
		}),
		schema: articleSchema(post),
	};
}

/** An article as it will look, drafts included (Admin → article → Preview). */
export async function renderPostPreview(id: number): Promise<Rendered | null> {
	const [row] = await db()<{ slug: string }[]>`select slug from posts where id = ${id} and type = 'post'`;
	const post = row ? await getPostBySlug(row.slug, { includeDrafts: true }) : null;
	if (!post) return null;
	const r = await renderPost(post);
	r.metadata = { title: `Preview: ${post.title}`, robots: { index: false, follow: false } };
	return r;
}

async function renderEvent(slug: string): Promise<Rendered | null> {
	const e = await getEventBySlug(slug);
	if (!e) return null;
	const settings = await getSettings();
	const main = await fill(T.singles.event.main.replace("{{title}}", esc(e.title)), { settings }, { "event-left": () => eventLeft(e), "event-right": () => eventRight(e) });
	return {
		html: await layout(main, { path: "/events/", settings }),
		bodyClass: bodyFor(T.singles.event.bodyClass, e.id),
		metadata: seoMetadata(null, { title: e.title, description: e.summary || truncateWords(e.content.replace(/<[^>]+>/g, " "), 30), path: e.href, image: e.image?.url }),
	};
}

async function renderCampaign(slug: string): Promise<Rendered | null> {
	const c = await getCampaignBySlug(slug);
	if (!c) return null;
	const settings = await getSettings();
	const comments = await getApprovedComments("campaign", c.id);
	const main = await fill(
		T.singles.campaign.main.replace("{{title}}", esc(c.title)),
		{ settings },
		{
			// The comment form sits under the campaign, inside the same column, as on the old site.
			campaign: () => campaignContent(c, settings) + "\n" + commentsBlock({ type: "campaign", id: c.id, href: c.href }, comments),
			"campaign-sidebar": () => T.singles.campaign.sidebar,
		},
	);
	return {
		html: await layout(main, { path: "/donation/", settings }),
		bodyClass: bodyFor(T.singles.campaign.bodyClass, c.id),
		metadata: seoMetadata(null, { title: c.title, description: c.excerpt || `Support ${ORG_NAME}: ${c.title}.`, path: c.href, image: c.image?.url }),
	};
}

/* ---------- Lists of articles ---------- */

async function renderArchive(opts: { heading: string; title: string; path: string; page: number; query: Parameters<typeof getPosts>[0]; noindex?: boolean; empty?: string }): Promise<Rendered | null> {
	const { items, totalPages } = await getPosts({ ...opts.query, perPage: PER_PAGE, page: opts.page });
	if (opts.page > 1 && opts.page > totalPages) return null;
	const settings = await getSettings();
	const base = opts.path;
	const list = archiveList(items, opts.page, totalPages, (n) => (n === 1 ? base : base.includes("?") ? `${base}&paged=${n}` : `${base}page/${n}/`), opts.empty);
	const main = await fill(T.singles.archive.main.replace("{{heading}}", opts.heading), { settings }, { archive: () => list, sidebar });
	const path = opts.page > 1 && !base.includes("?") ? `${base}page/${opts.page}/` : base;
	const metadata = seoMetadata(null, { title: opts.page > 1 ? `${opts.title} - Page ${opts.page}` : opts.title, path });
	if (opts.noindex) metadata.robots = { index: false, follow: true };
	return { html: await layout(main, { path: "/news/", settings }), bodyClass: T.singles.archive.bodyClass, metadata };
}

export async function renderSearch(q: string, page: number): Promise<Rendered | null> {
	const query = q.trim().slice(0, 100);
	return renderArchive({
		heading: `Search Results for: <span>${esc(query)}</span>`,
		title: `You searched for ${query}`,
		path: `/search/?s=${encodeURIComponent(query)}`,
		page,
		query: { search: query || " " },
		noindex: true,
		empty: "Sorry, but nothing matched your search terms. Please try again with some different keywords.",
	});
}

/** Splits ".../page/N/" off the end of a path. */
function paged(segments: string[]): { rest: string[]; page: number } | null {
	const n = segments.length;
	if (n >= 2 && segments[n - 2] === "page") {
		const page = Number(segments[n - 1]);
		if (!Number.isInteger(page) || page < 1 || String(page) !== segments[n - 1]) return null;
		return { rest: segments.slice(0, -2), page };
	}
	return { rest: segments, page: 1 };
}

const SLUG = /^[a-z0-9%_-]+$/i;

export async function resolvePath(segments: string[], searchParams: Record<string, string | string[] | undefined> = {}): Promise<Resolved> {
	const p = paged(segments.map((s) => decodeURIComponent(s)));
	if (!p) return null;
	const { rest, page } = p;
	if (!rest.every((s) => SLUG.test(s))) return null;

	// The home page's news list: /page/2/.
	if (rest.length === 0) return page > 1 ? renderHome(page) : { redirect: "/" };

	const [a, b, c] = rest;
	// Monthly archives: /2025/09/.
	if (/^\d{4}$/.test(a) && (rest.length === 1 || (rest.length === 2 && /^\d{2}$/.test(b))) && !c) {
		const year = Number(a);
		const month = b ? Number(b) : 0;
		if (month > 12) return null;
		const label = month ? `${MONTH_NAMES[month - 1]} ${year}` : String(year);
		return renderArchive({
			heading: `${month ? "Month" : "Year"}: <span>${label}</span>`,
			title: label,
			path: month ? `/${a}/${b}/` : `/${a}/`,
			page,
			query: { year, month: month || undefined },
		});
	}
	if (rest.length === 1) {
		if (page > 1) return null;
		if (a in DEMO_PAGE_REDIRECTS) return { redirect: DEMO_PAGE_REDIRECTS[a] };
		if (a === "search") {
			const s = searchParams.s;
			const paged = Number(searchParams.paged ?? 1);
			return renderSearch(typeof s === "string" ? s : "", Number.isInteger(paged) && paged > 0 ? paged : 1);
		}
		if ((THEME_PAGES as readonly string[]).includes(a)) {
			const key = a as ThemePage;
			if (key === "donation-confirmation") {
				const ref = searchParams.ref;
				const pledge = typeof ref === "string" && /^RHAGF-[A-Z0-9]{6}$/.test(ref) ? await getPledge(ref) : null;
				const r = await themePage(key, `/${a}/`, { pledge });
				r.metadata.robots = { index: false, follow: false };
				return r;
			}
			const r = await themePage(key, `/${a}/`);
			if (key === "donation-failed") r.metadata.robots = { index: false, follow: false };
			return r;
		}
		const post = await getPostBySlug(a);
		return post ? renderPost(post) : null;
	}
	if (rest.length === 2 && page === 1 && a === "event") return renderEvent(b);
	if (rest.length === 2 && page === 1 && a === "donations") return renderCampaign(b);
	if (rest.length === 2 && a === "category") {
		const cat = await getCategoryBySlug(b);
		if (!cat) return null;
		return renderArchive({ heading: `Category: <span>${esc(cat.name)}</span>`, title: cat.name, path: `/category/${cat.slug}/`, page, query: { categories: [cat.id] } });
	}
	if (rest.length === 2 && a === "author") {
		const author = await getAuthorBySlug(b);
		if (!author) return null;
		return renderArchive({
			heading: `Author: <span class="vcard">${esc(author.name)}</span>`,
			title: author.name,
			path: `/author/${author.slug}/`,
			page,
			query: { author: author.id },
		});
	}
	return null;
}

export const NOT_FOUND_TITLE = `Page not found - ${SITE_NAME}`;
export { SITE_URL };
