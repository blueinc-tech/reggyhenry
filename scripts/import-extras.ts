/**
 * Copies what WordPress's REST API doesn't hand out, from the live site's own pages:
 * events, donation campaigns (with their raised totals and suggested amounts), the
 * Gallery and Volunteers pages, and every image the page layouts show (sliders,
 * about photos, logos). Reads the live site only; nothing there is changed.
 * Safe to run again: records are matched by WordPress id, slug or file.
 *
 *   npm run import:extras
 *
 * Run after `npm run import:wordpress` (articles) and `npm run theme:build`.
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { cleanArticleHtml } from "../lib/sanitize.ts";
import { putFile } from "../lib/storage.ts";
import { decodeEntities } from "../lib/text.ts";
import { connect } from "./_db.ts";

const SOURCE = (process.env.WORDPRESS_URL || "https://rhagfnig.org.ng").replace(/\/+$/, "");
const ORIGINS = [SOURCE, "https://rhagfnig.org.ng", "http://rhagfnig.org.ng", "https://www.rhagfnig.org.ng"];
const UA = { "User-Agent": "Mozilla/5.0 (compatible; RHAGF-Migration/1.0)" };
const sql = connect();
const failed: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<Response> {
	let last = "";
	for (let attempt = 0; attempt < 6; attempt++) {
		try {
			const res = await fetch(url, { headers: UA });
			if (res.ok || res.status === 404) return res;
			last = `HTTP ${res.status}`;
		} catch (e) {
			last = (e as Error).message;
		}
		await sleep(1000 * 2 ** attempt);
	}
	throw new Error(`${last} for ${url}`);
}
/**
 * A page of the live site, without any <script> in it. The live site is infected: script
 * tags injected into event texts and other places (`var f=String;eval(f.fromCharCode(…))`,
 * loading statistic.scriptsplatform.com). None of it may be copied.
 */
const page = async (path: string) =>
	(await (await get(`${SOURCE}${path}`)).text()).replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, (s) => (/^<script[^>]*type="application\/ld\+json"/i.test(s) ? s : ""));
const text = (html: string) =>
	decodeEntities(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "))
		.replace(/var f=String;eval\([\s\S]*?\)\);(?:\/\*\d+\*\/)?/g, " ")
		.replace(/\s+/g, " ")
		.trim();
const money = (s: string) => Number(s.replace(/&#\d+;|&[a-z]+;/gi, "").replace(/[^\d.]/g, "")) || 0;

/* ---------- Files ---------- */

const cache = new Map<string, number | null>();

/** Copies one file from the live site's uploads, exactly as named, into the media library. */
async function importFile(url: string, alt = ""): Promise<number | null> {
	const abs = url.startsWith("/") ? `https://rhagfnig.org.ng${url}` : url.replace(/^http:/, "https:");
	if (!/\/wp-content\/uploads\//.test(abs) || /\/uploads\/elementor\//.test(abs)) return null;
	if (cache.has(abs)) return cache.get(abs)!;
	const key = abs.split("/wp-content/uploads/")[1];
	const [found] = await sql<{ id: number }[]>`select id from media where original_url = ${abs} or storage_key = ${key} limit 1`;
	if (found) {
		cache.set(abs, found.id);
		return found.id;
	}
	try {
		const res = await get(abs.replace("https://rhagfnig.org.ng", SOURCE));
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body = Buffer.from(await res.arrayBuffer());
		const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
		const meta = mime.startsWith("image/") && !mime.includes("svg") ? await sharp(body).metadata().catch(() => null) : null;
		const { url: stored } = await putFile(key, body, mime);
		const [row] = await sql<{ id: number }[]>`
			insert into media (url, storage_key, original_url, mime, width, height, size_bytes, alt)
			values (${stored}, ${key}, ${abs}, ${mime}, ${meta?.width ?? null}, ${meta?.height ?? null}, ${body.length}, ${alt})
			on conflict (storage_key) do update set original_url = coalesce(media.original_url, excluded.original_url)
			returning id`;
		cache.set(abs, row.id);
		return row.id;
	} catch (e) {
		failed.push(`${abs}: ${(e as Error).message}`);
		cache.set(abs, null);
		return null;
	}
}

/** The full-size original of a resized copy ("photo-370x470.jpg" → "photo.jpg"). */
const original = (url: string) => url.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1");

/** First image address in some markup: lazy-loaded (data-src) or plain. */
const imageIn = (html: string) => /data-src="([^"]+)"/.exec(html)?.[1] ?? /<img[^>]*\ssrc="(?!data:)([^"]+)"/.exec(html)?.[1] ?? null;

/** Copies the uploads files an article body links to and points the links at the copies. */
async function localise(html: string): Promise<string> {
	const map = new Map<string, string>();
	for (const m of html.matchAll(/(?:src|href|data-src)=["']([^"']+\/wp-content\/uploads\/[^"']+)["']/g)) {
		const id = await importFile(m[1]);
		if (id) map.set(m[1], (await sql<{ url: string }[]>`select url from media where id = ${id}`)[0].url);
	}
	return cleanArticleHtml(html.replace(/ data-src=/g, " src="), { siteOrigins: ORIGINS, mapUrl: (u) => map.get(u) });
}

/** The cards a list widget shows, by their class. */
function cards(html: string, cls: string): string[] {
	const out: string[] = [];
	const re = new RegExp(`<div class="${cls}">`, "g");
	for (let m; (m = re.exec(html)); ) {
		let depth = 0;
		const tags = /<div\b|<\/div>/g;
		tags.lastIndex = m.index;
		for (let t; (t = tags.exec(html)); ) {
			depth += t[0] === "</div>" ? -1 : 1;
			if (depth === 0) {
				out.push(html.slice(m.index, t.index + 6));
				break;
			}
		}
	}
	return out;
}

/* ---------- Images in the page layouts ---------- */

console.log("Images in the page layouts…");
const templates = readFileSync("lib/theme/templates.json", "utf8");
const layoutImages = [...new Set([...templates.matchAll(/\/wp-content\/uploads\/(?!elementor\/)[^"'\s)<>\\]+\.(?:jpe?g|png|gif|webp|svg)/gi)].map((m) => m[0]))];
for (const u of layoutImages) await importFile(u);
console.log(`  ${layoutImages.length} files`);

/* ---------- The rest of the media library ---------- */

// Files no page uses still belong in Admin → Media (the old site's whole library comes across).
console.log("Media library…");
let libraryCount = 0;
for (let n = 1; ; n++) {
	const res = await get(`${SOURCE}/wp-json/wp/v2/media?per_page=100&page=${n}&_fields=source_url,alt_text`);
	if (!res.ok) break;
	const items = (await res.json()) as { source_url: string; alt_text?: string }[];
	if (!items.length) break;
	for (const m of items) if ((await importFile(m.source_url, decodeEntities(m.alt_text ?? ""))) !== null) libraryCount++;
	if (n >= Number(res.headers.get("x-wp-totalpages") || n)) break;
}
console.log(`  ${libraryCount} files`);

/* ---------- Donation campaigns (GiveWP forms) ---------- */

console.log("Donation campaigns…");
type RawForm = { id: number; slug: string; title: { rendered: string }; content?: { rendered: string }; excerpt?: { rendered: string }; featured_media: number; link: string };
const forms = (await (await get(`${SOURCE}/wp-json/wp/v2/give_forms?per_page=100&_fields=id,slug,title,content,excerpt,featured_media,link`)).json()) as RawForm[];
const donationPage = await page("/donation/");
const order = [...donationPage.matchAll(/href="https:\/\/rhagfnig\.org\.ng\/donations\/([^/]+)\/"/g)].map((m) => m[1]);
for (const f of forms) {
	const html = await page(`/donations/${f.slug}/`);
	const raised = money(/<span>Raised<\/span>\s*<p>([^<]*)<\/p>/.exec(html)?.[1] ?? "0");
	const goal = money(/<span>Goal<\/span>\s*<p>([^<]*)<\/p>/.exec(html)?.[1] ?? "0");
	const levels = [...html.matchAll(/class="give-donation-level-btn[^"]*"\s+value="([\d,.]+)"/g)].map((m) => money(m[1]));
	const def = /data-default="1"/.test(html) ? money(/value="([\d,.]+)" data-default="1"/.exec(html)?.[1] ?? "") : null;
	const minimum = money(/name="give-form-minimum"\s+value="([^"]+)"/.exec(html)?.[1] ?? "1000") || 1000;
	let imageId: number | null = null;
	if (f.featured_media) {
		const media = (await (await get(`${SOURCE}/wp-json/wp/v2/media/${f.featured_media}?_fields=source_url,alt_text`)).json()) as { source_url?: string; alt_text?: string };
		if (media.source_url) imageId = await importFile(media.source_url, media.alt_text ?? "");
	}
	await sql`
		insert into campaigns (slug, title, excerpt, content, goal, raised_offset, levels, default_amount, minimum, image_media_id, position, wp_id)
		values (${f.slug}, ${text(f.title.rendered)}, ${text(f.excerpt?.rendered ?? "")}, ${await localise(f.content?.rendered ?? "")}, ${goal}, ${raised},
			${levels}, ${def || null}, ${minimum}, ${imageId}, ${Math.max(0, order.indexOf(f.slug))}, ${f.id})
		on conflict (slug) do update set title = excluded.title, excerpt = excluded.excerpt, content = excluded.content, goal = excluded.goal,
			raised_offset = excluded.raised_offset, levels = excluded.levels, default_amount = excluded.default_amount, minimum = excluded.minimum,
			image_media_id = coalesce(excluded.image_media_id, campaigns.image_media_id), wp_id = excluded.wp_id`;
	console.log(`  ${f.slug}: raised ${raised} of ${goal}, ${levels.length} amounts`);
}

/* ---------- Events ---------- */

console.log("Events…");
const eventsPage = await page("/events/");
const eventCards = cards(eventsPage, "events-one__single");
for (const [i, card] of eventCards.entries()) {
	const slug = /href="https:\/\/rhagfnig\.org\.ng\/event\/([^/]+)\/"/.exec(card)?.[1];
	if (!slug) continue;
	const cardDate = /events-one__date">\s*<p>([^<]+)<\/p>/.exec(card)?.[1].trim() ?? "";
	const [time, location] = [...card.matchAll(/<\/i>([^<]*)<\/li>/g)].map((m) => decodeEntities(m[1]).trim());
	const title = text(/events-one__title"><a[^>]*>([\s\S]*?)<\/a>/.exec(card)?.[1] ?? slug);
	const img = imageIn(card);
	const html = await page(`/event/${slug}/`);
	const posted = /event-details__date">\s*<p>([^<]+)<\/p>/.exec(html)?.[1].trim() ?? cardDate;
	const top = /event-details__title">[\s\S]*?<\/h3>([\s\S]*?)<div class="event-details__btn-box">/.exec(html)?.[1] ?? "";
	const info = (label: string) => text(new RegExp(`<span>${label}:</span>\\s*<p[^>]*>([\\s\\S]*?)</p>`).exec(html)?.[1] ?? "");
	const postId = Number(/postid-(\d+)/.exec(html)?.[1] ?? 0) || null;
	const imageId = img ? ((await importFile(original(img))) ?? (await importFile(img))) : null;
	const date = new Date(`${cardDate} 12:00 UTC`);
	await sql`
		insert into events (slug, title, summary, event_date, time_text, location, time_detail, location_detail, category, map_query, image_media_id, position, wp_id, created_at)
		values (${slug}, ${title}, ${text(top)}, ${date.toISOString().slice(0, 10)}, ${time ?? ""}, ${location ?? ""}, ${info("Time")}, ${info("Location")},
			${info("Category")}, ${location || info("Location")}, ${imageId}, ${i}, ${postId}, ${new Date(`${posted} 12:00 UTC`)})
		on conflict (slug) do update set title = excluded.title, summary = excluded.summary, event_date = excluded.event_date, time_text = excluded.time_text,
			location = excluded.location, time_detail = excluded.time_detail, location_detail = excluded.location_detail, map_query = excluded.map_query, category = excluded.category, image_media_id = coalesce(excluded.image_media_id, events.image_media_id),
			position = excluded.position, wp_id = excluded.wp_id, created_at = excluded.created_at`;
	console.log(`  ${slug} (${cardDate})`);
}

/* ---------- Article bylines ---------- */

// WordPress keeps its user list private, so each article's author is read from its page.
console.log("Article bylines…");
const posts = await sql<{ id: number; slug: string }[]>`select id, slug from posts where type = 'post' and author_id is null`;
for (const p of posts) {
	const html = await page(`/${p.slug}/`);
	const m = /<a class="url fn n" href="https:\/\/rhagfnig\.org\.ng\/author\/([^/]+)\/">(?:<i[^>]*><\/i>)?\s*([^<]+)<\/a>/.exec(html);
	if (!m) continue;
	const [author] = await sql<{ id: number }[]>`
		insert into authors (slug, name) values (${m[1]}, ${decodeEntities(m[2]).trim()})
		on conflict (slug) do update set name = excluded.name returning id`;
	await sql`update posts set author_id = ${author.id} where id = ${p.id}`;
}
console.log(`  ${posts.length} articles`);

/* ---------- Gallery ---------- */

console.log("Gallery…");
const galleryPage = await page("/gallery/");
const galleryCards = cards(galleryPage, "gallery-page__single");
if ((await sql`select 1 from gallery_items limit 1`).length === 0) {
	for (const [i, card] of galleryCards.entries()) {
		const href = /class="img-popup"/.test(card) ? /<a href="([^"]+)" class="img-popup"/.exec(card)?.[1] : null;
		const src = href ?? imageIn(card);
		if (!src) continue;
		const id = await importFile(src);
		if (!id) continue;
		const title = text(/gallery-page__title">([\s\S]*?)<\/h5>/.exec(card)?.[1] ?? "");
		const subtitle = text(/gallery-page__sub-title">([\s\S]*?)<\/p>/.exec(card)?.[1] ?? "");
		await sql`insert into gallery_items (media_id, title, subtitle, position) values (${id}, ${title}, ${subtitle}, ${i})`;
	}
	console.log(`  ${galleryCards.length} pictures`);
} else console.log("  already imported (edit it in Admin → Gallery)");

/* ---------- Volunteers ---------- */

console.log("Volunteers…");
const teamPage = await page("/volunteers/");
const teamCards = cards(teamPage, "team-one__single");
if ((await sql`select 1 from team_members limit 1`).length === 0) {
	for (const [i, card] of teamCards.entries()) {
		const name = text(/team-one__name">([\s\S]*?)<\/h3>/.exec(card)?.[1] ?? "");
		const role = text(/team-one__sub-title">([\s\S]*?)<\/p>/.exec(card)?.[1] ?? "");
		const links = [...card.matchAll(/<a href="([^"]+)"[^>]*><i class="fab fa-([a-z-]+)"><\/i><\/a>/g)].map((m) => ({
			url: m[1],
			icon: m[2].replace(/-p$|-f$|-in$/, "").replace("twitter", "x"),
		}));
		const img = imageIn(card);
		const photo = img && /rhagfnig/.test(img) ? await importFile(img) : null;
		if (name) await sql`insert into team_members (name, role, photo_media_id, links, position) values (${name}, ${role}, ${photo}, ${sql.json(links)}, ${i})`;
	}
	console.log(`  ${teamCards.length} people`);
} else console.log("  already imported (edit it in Admin → Volunteers)");

if (failed.length) {
	console.log(`\n${failed.length} files could not be copied:`);
	for (const f of failed) console.log(`  ${f}`);
}
console.log("Done.");
await sql.end();
