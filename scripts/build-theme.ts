/**
 * Turns the saved copies of the live WordPress pages (Oxpins theme + Elementor,
 * theme-source/pages/) into the templates the public site renders, so every page
 * keeps the original markup and styles.
 *
 *   npm run theme:build
 *
 * Parts that change are cut out and replaced with slots (<!--slot:{...}-->): the
 * donation campaigns, events, news, gallery and team lists, and the story, event
 * and campaign on detail pages. lib/theme/render.ts fills them from the database.
 * Writes lib/theme/templates.json. The stylesheets, scripts and fonts the pages
 * use live in public/legacy/ under their original wp-content/... paths.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve("theme-source/pages");
const ORIGIN = /https?:\/\/(?:www\.)?rhagfnig\.org\.ng/g;
const read = (f: string) => readFileSync(path.join(SRC, f), "utf8");

/* ---------- HTML helpers ---------- */

/** The whole element that opens at `start` (balanced on its own tag name). */
function elementAt(html: string, start: number): string {
	const tag = /^<([a-z0-9]+)/i.exec(html.slice(start))![1];
	const re = new RegExp(`<${tag}\\b|</${tag}>`, "gi");
	re.lastIndex = start;
	let depth = 0;
	for (let m; (m = re.exec(html)); ) {
		depth += m[0][1] === "/" ? -1 : 1;
		if (depth === 0) return html.slice(start, m.index + m[0].length);
	}
	return html.slice(start);
}

/** Start of the element whose opening tag contains `marker`. */
function openingOf(html: string, marker: string, from = 0): number {
	const i = html.indexOf(marker, from);
	return i < 0 ? -1 : html.lastIndexOf("<", i);
}

function must(html: string, marker: string, from = 0): string {
	const at = openingOf(html, marker, from);
	if (at < 0) throw new Error(`Not found: ${marker}`);
	return elementAt(html, at);
}

const slot = (o: Record<string, unknown>) => `<!--slot:${JSON.stringify(o)}-->`;

/** Inner HTML of an element (without its own opening and closing tags). */
const inner = (el: string) => el.slice(el.indexOf(">") + 1, el.lastIndexOf("</"));

/** Replace an element's children, keeping its own tags. */
const withInner = (el: string, html: string) => el.slice(0, el.indexOf(">") + 1) + html + el.slice(el.lastIndexOf("</"));

/** Page markup cleaned of WordPress-only parts. */
function tidy(html: string): string {
	return (
		html
			.replace(/\r\n?/g, "\n")
			.replace(/<script\b[\s\S]*?<\/script>/g, "")
			// Stylesheets Elementor prints inside the page body are loaded in the head instead (see the css list).
			.replace(/<link\b[^>]*rel=['"]stylesheet['"][^>]*>/g, "")
			.replace(/<noscript\b[\s\S]*?<\/noscript>/g, "")
			.replace(/<!--(?!slot:)[\s\S]*?-->/g, "")
			.replace(ORIGIN, "")
			// The theme vendor's demo server (layerdrops.com) no longer exists; its images never load on the live site either.
			.replace(/ data-back="https?:\/\/layerdrops\.com[^"]*"/g, "")
			.replace(/ data-src="https?:\/\/layerdrops\.com[^"]*"/g, "")
			.replace(/url\((['"]?)https?:\/\/layerdrops\.com[^)]*\1\)/g, "none")
			// Elementor's entrance animations are run by its own script, which isn't loaded: show those parts at once.
			.replace(/\belementor-invisible\b/g, "")
			// Stylesheets and scripts are served from /legacy/, uploads from the media library (rewritten when rendered).
			.replace(/(["'(])\/wp-content\/(themes|plugins)\//g, "$1/legacy/wp-content/$2/")
			.replace(/[ \t]*\n\s*/g, "\n")
	);
}

function bodyOf(file: string): string {
	const h = read(file);
	return h.slice(h.indexOf(">", h.indexOf("<body")) + 1, h.lastIndexOf("</body>"));
}

const bodyClass = (file: string) =>
	/<body[^>]*class="([^"]*)"/
		.exec(read(file))![1]
		.replace(/\s+/g, " ")
		.trim();

function meta(file: string) {
	const h = read(file).split("<body")[0];
	const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"');
	return {
		title: decode(/<title>([^<]*)<\/title>/.exec(h)?.[1] ?? ""),
		description: decode(/<meta name="description" content="([^"]*)"/.exec(h)?.[1] ?? ""),
	};
}

/* ---------- Header and footer ---------- */

/** The home page uses its own Elementor header (1202) and footer (753); every other page the theme's default ones. */
function splitHome() {
	const body = bodyOf("home.html");
	const mainAt = openingOf(body, 'data-elementor-id="1228"');
	const main = elementAt(body, mainAt);
	return { top: body.slice(0, mainAt), main, bottom: body.slice(mainAt + main.length) };
}

function splitInner(file: string) {
	const body = bodyOf(file);
	const start = body.indexOf('<section class="page-header');
	const end = body.indexOf('<footer class="site-footer');
	if (start < 0 || end < 0) throw new Error(`No page header/footer in ${file}`);
	return { top: body.slice(0, start), main: body.slice(start, end), bottom: body.slice(end) };
}

const home = splitHome();
const about = splitInner("about.html");

/** Header with the current page marked in the menu (filled in when rendered). */
const markMenu = (html: string) => html.replace(/ current-menu-item| current_page_item| current-menu-ancestor| current-menu-parent| current_page_parent| current_page_ancestor/g, "");

const chrome = {
	home: { top: markMenu(tidy(home.top)), bottom: tidy(home.bottom) },
	inner: { top: markMenu(tidy(about.top)), bottom: tidy(about.bottom) },
};

/* ---------- Lists filled from the database ---------- */

/**
 * Replaces the repeated columns of a list (each holding one `card`) with a slot. The first
 * column's classes are kept, with each column's animation delay.
 */
function listSlot(widget: string, card: string, kind: string, extra: Record<string, unknown> = {}): string {
	const first = widget.indexOf(`class="${card}`);
	if (first < 0) return widget;
	// The column (or carousel item) that wraps each card, and the row that holds them.
	const before = widget.slice(0, first);
	const colAt = Math.max(before.lastIndexOf('<div class="col-'), before.lastIndexOf('<div class="item"'));
	const colOpen = widget.slice(colAt, widget.indexOf(">", colAt) + 1);
	const rowAt = widget.lastIndexOf("<div", colAt - 1);
	const row = elementAt(widget, rowAt);
	// The row's own children: the card columns, then anything after them (e.g. the pager column).
	const kids: string[] = [];
	const body = inner(row);
	for (let i = body.search(/<[a-z]/i); i >= 0; ) {
		const el = elementAt(body, i);
		kids.push(el);
		const next = body.slice(i + el.length).search(/<[a-z]/i);
		i = next < 0 ? -1 : i + el.length + next;
	}
	const cols = kids.filter((k) => k.includes(`class="${card}`));
	const delays = cols.map((c) => Number(/data-wow-delay="(\d+)ms"/.exec(c.slice(0, c.indexOf(">")))?.[1] || 0));
	const colClass = /class="([^"]*)"/.exec(colOpen)![1];
	const afterCards = kids.slice(kids.indexOf(cols[cols.length - 1]) + 1).join("");
	const hasPager = /page-numbers|blog-post-pagination|blog-pagination/.test(afterCards);
	const pagerClass = /class="((?:blog-pagination|blog-post-pagination)[^"]*)"/.exec(afterCards)?.[1];
	const pager = hasPager ? { pager: pagerClass } : {};
	const html = slot({ kind, col: colClass, delays: [...new Set(delays)].length > 1 ? delays : delays.slice(0, 1), count: delays.length, ...pager, ...extra });
	return widget.replace(row, withInner(row, `\n${html}\n`));
}

/** Replaces the list inside every Elementor widget of the given type. */
function eachWidget(html: string, type: string, fn: (widget: string) => string): string {
	let out = html;
	let from = 0;
	for (;;) {
		const at = openingOf(out, `data-widget_type="${type}"`, from);
		if (at < 0) return out;
		const el = elementAt(out, at);
		const next = fn(el);
		out = out.slice(0, at) + next + out.slice(at + el.length);
		from = at + next.length;
	}
}

function pageMain(file: string, main: string): string {
	let t = main;
	t = eachWidget(t, "oxpins-give-forms.default", (w) => listSlot(w, "causes-one__single", "causes"));
	t = eachWidget(t, "oxpins-event.default", (w) => listSlot(w, "events-one__single", w.includes("owl-carousel") ? "events-carousel" : "events", { size: file === "home.html" ? "270x355" : "370x470" }));
	t = eachWidget(t, "oxpins-blog.default", (w) => listSlot(w, "news-one__single", "news", { dateSpace: /news-one__date">\s*<p>\d\d \w{3}, \d\d/.test(w) }));
	t = eachWidget(t, "oxpins-gallery.default", (w) => (file === "gallery.html" ? listSlot(w, "gallery-page__single", "gallery") : w));
	t = eachWidget(t, "oxpins-team.default", (w) => listSlot(w, "team-one__single", "team"));
	// The live Donate Now page only says "The form is not published."; it gets a working donation form.
	t = eachWidget(t, "oxpins-donation-form.default", (w) => {
		const box = must(w, 'class="donate-now__enter-donation"');
		return w.replace(box, withInner(box, slot({ kind: "donate-form" })));
	});
	// GiveWP's receipt (filled in by its script on the live site) becomes the pledge receipt.
	const receipt = openingOf(t, 'id="give-receipt"');
	if (receipt >= 0) t = t.replace(elementAt(t, receipt), slot({ kind: "receipt" }));
	// Contact Form 7 forms post to this site's form handler instead (public/legacy/rhagf.js).
	t = t.replace(/<div class="screen-reader-response">[\s\S]*?<\/div>\n?/g, "");
	t = t.replace(/<fieldset class="hidden-fields-container">[\s\S]*?<\/fieldset>/g, "");
	t = t.replace(/<form action="[^"]*#wpcf7-f(\d+)-p\d+-o\d+"[^>]*>/g, (_m, id: string) => {
		const kind = id === "500" ? "volunteer" : "contact";
		return `<form action="/api/forms/${kind}/" method="post" class="wpcf7-form init" aria-label="${kind === "volunteer" ? "Volunteer form" : "Contact form"}" novalidate="novalidate" data-status="init" data-rhagf-form="${kind}">`;
	});
	return tidy(t);
}

const PAGES: Record<string, string> = {
	home: "home.html",
	about: "about.html",
	events: "events.html",
	news: "news.html",
	gallery: "gallery.html",
	volunteers: "volunteers.html",
	"become-volunteer": "become-volunteer.html",
	donation: "donation.html",
	"donate-now": "donate-now.html",
	faq: "faq.html",
	contact: "contact.html",
	"donation-confirmation": "donation-confirmation.html",
	"donation-failed": "donation-failed.html",
};

const pages: Record<string, { bodyClass: string; main: string; title: string; description: string }> = {};
for (const [key, file] of Object.entries(PAGES)) {
	const main = key === "home" ? home.main : splitInner(file).main;
	pages[key] = { bodyClass: bodyClass(file), main: pageMain(file, main), ...meta(file) };
}

/* ---------- Detail pages ---------- */

/** The page header's title becomes {{title}}. */
const headerTitle = (t: string) => t.replace(/(<div class="page-header__inner">\s*<h2>)[\s\S]*?(<\/h2>)/, "$1{{title}}$2");

function postTemplate() {
	let t = splitInner("post.html").main;
	t = headerTitle(t);
	const article = must(t, '<article id="post-');
	t = t.replace(article, slot({ kind: "post" }));
	const sidebar = must(t, '<aside id="secondary"');
	t = t.replace(sidebar, slot({ kind: "sidebar" }));
	return tidy(t);
}

/** The sample article: how the story itself is laid out (meta, body, share buttons, categories). */
function postParts() {
	const article = tidy(must(splitInner("post.html").main, '<article id="post-'));
	const sidebar = tidy(must(splitInner("post.html").main, '<aside id="secondary"'));
	return { article, sidebar };
}

function eventTemplate() {
	let t = splitInner("event-children-day.html").main;
	t = headerTitle(t);
	const left = must(t, 'class="event-details__left"');
	t = t.replace(left, slot({ kind: "event-left" }));
	const right = must(t, 'class="event-details__right"');
	t = t.replace(right, slot({ kind: "event-right" }));
	return tidy(t);
}

function campaignTemplate() {
	let t = splitInner("campaign.html").main;
	t = headerTitle(t);
	const content = must(t, 'class="content-single-give-form"');
	t = t.replace(content, slot({ kind: "campaign" }));
	const comments = openingOf(t, 'id="comments"');
	if (comments >= 0) t = t.replace(elementAt(t, comments), slot({ kind: "comments" }));
	const sidebar = openingOf(t, 'class="col-xl-4 col-lg-5');
	if (sidebar >= 0) {
		const el = elementAt(t, sidebar);
		t = t.replace(el, withInner(el, slot({ kind: "campaign-sidebar" })));
	}
	return tidy(t);
}

function archiveTemplate() {
	let t = splitInner("category.html").main;
	t = t.replace(/(<div class="page-header__inner">\s*<h2>)[\s\S]*?(<\/h2>)/, "$1{{heading}}$2");
	const list = must(t, 'class="news-sidebar__content"');
	t = t.replace(list, withInner(list, slot({ kind: "archive" })));
	const sidebar = must(t, '<aside id="secondary"');
	t = t.replace(sidebar, slot({ kind: "sidebar" }));
	return tidy(t);
}

/** One story in an archive list, with and without a picture, as samples for the renderer. */
function archiveCards() {
	const list = must(splitInner("category.html").main, 'class="news-sidebar__content"');
	const cards = [...inner(list).matchAll(/<article id="post-\d+"/g)].map((m) => tidy(elementAt(inner(list), m.index!)));
	const pager = openingOf(list, "page-numbers") >= 0 ? tidy(list.slice(list.lastIndexOf("<div", list.indexOf("page-numbers")))) : "";
	return { withImage: cards.find((c) => c.includes("news-sidebar__img")) ?? "", plain: cards.find((c) => !c.includes("news-sidebar__img")) ?? "", pager };
}

/** The campaign page's own sidebar and comment form, kept as they are. */
function campaignParts() {
	const main = splitInner("campaign.html").main;
	const comments = openingOf(main, 'id="comments"');
	const sidebar = openingOf(main, 'class="col-xl-4 col-lg-5');
	return {
		comments: comments >= 0 ? tidy(elementAt(main, comments)) : "",
		sidebar: sidebar >= 0 ? tidy(inner(elementAt(main, sidebar))) : "",
		content: tidy(must(main, 'class="content-single-give-form"')),
	};
}

const singles = {
	post: { bodyClass: bodyClass("post.html"), main: postTemplate(), ...postParts() },
	event: {
		bodyClass: bodyClass("event-children-day.html"),
		main: eventTemplate(),
		left: tidy(must(splitInner("event-children-day.html").main, 'class="event-details__left"')),
		right: tidy(must(splitInner("event-children-day.html").main, 'class="event-details__right"')),
	},
	campaign: { bodyClass: bodyClass("campaign.html"), main: campaignTemplate(), ...campaignParts() },
	archive: { bodyClass: bodyClass("category.html"), main: archiveTemplate(), ...archiveCards() },
};

/* ---------- Stylesheets, fonts and scripts ---------- */

const css: string[] = [];
const fonts: string[] = [];
const headStyles: string[] = [];
for (const file of Object.values(PAGES).concat(["post.html", "campaign.html", "event-children-day.html", "category.html"])) {
	const head = read(file).split("<body")[0];
	// Elementor prints the header's and footer's stylesheets inside the body; they are collected too.
	for (const m of read(file).matchAll(/<link[^>]+rel=['"]stylesheet['"][^>]*>/g)) {
		const href = /href=['"]([^'"]+)['"]/.exec(m[0])?.[1];
		if (!href) continue;
		if (/fonts\.googleapis\.com/.test(href)) {
			const clean = href.replace(/&#038;/g, "&");
			if (!fonts.includes(clean)) fonts.push(clean);
			continue;
		}
		const rel = href.replace(ORIGIN, "").replace(/\?.*$/, "").replace(/&#038;.*/, "");
		// Plugins this site replaces (donations, contact forms) keep their styles: the markup still uses them.
		if (!rel.startsWith("/wp-")) continue;
		const local = rel.startsWith("/wp-content/uploads/") ? `/legacy${rel}` : `/legacy${rel}`;
		if (!css.includes(local)) css.push(local);
	}
	// Styles inside <noscript> only apply without JavaScript (e.g. "hide lazy images"); they are left out.
	for (const m of head.replace(/<noscript>[\s\S]*?<\/noscript>/g, "").matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
		if (/emoji|wp-custom-css-fix/.test(m[1])) continue;
		const body = m[2]
			.replace(/\/\*# sourceURL=[^*]*\*\//g, "")
			.replace(ORIGIN, "")
			.replace(/url\((['"]?)https?:\/\/layerdrops\.com[^)]*\1\)/g, "none")
			.trim();
		if (body && !headStyles.includes(body)) headStyles.push(body);
	}
}

/** The theme's scripts, in the order WordPress printed them. WordPress block-editor, analytics and form plugins are left out. */
const KEEP = [
	/\/wp-includes\/js\/jquery\/jquery(?:-migrate)?\.min\.js/,
	/ewww-image-optimizer\/includes\/lazysizes/,
	/oxpins-addon\/assets\/vendors\//,
	/themes\/oxpins\/assets\/vendors\/bootstrap\/js/,
	/elementor\/assets\/lib\/swiper\/v8\/swiper\.min\.js/,
	/oxpins-addon\/assets\/js\/oxpins-addon\.js/,
	/themes\/oxpins\/assets\/js\/oxpins-theme\.js/,
	/socialsnap\/assets\/js\/socialsnap\.js/,
];
const KEEP_INLINE = /lazyloadRunObserver|eio_lazy_vars|socialsnap_script/;
const scripts: string[] = [];
const inline: string[] = [];
for (const file of ["home.html", "post.html", "campaign.html"]) {
	for (const m of read(file).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
		const src = /src=["']([^"']+)["']/.exec(m[1])?.[1];
		if (src) {
			const rel = src.replace(ORIGIN, "").replace(/\?.*$/, "");
			if (KEEP.some((k) => k.test(rel)) && !scripts.includes(`/legacy${rel}`)) scripts.push(`/legacy${rel}`);
		} else if (KEEP_INLINE.test(m[2]) && !/application\/(ld\+)?json/.test(m[1])) {
			const code = m[2].replace(/\/\/# sourceURL=.*$/gm, "").replace(ORIGIN, "").trim();
			if (!inline.includes(code)) inline.push(code);
		}
	}
}

const templates = { css, fonts, headStyles: headStyles.join("\n"), scripts, inline: inline.join("\n;\n"), chrome, pages, singles };
writeFileSync("lib/theme/templates.json", JSON.stringify(templates));

const slots = JSON.stringify(templates).match(/<!--slot:/g)?.length ?? 0;
console.log(`${Object.keys(pages).length} pages, 4 detail templates, ${slots} slots`);
console.log(`${css.length} stylesheets, ${fonts.length} font links, ${scripts.length} scripts`);
for (const [k, p] of Object.entries(pages)) {
	const found = [...p.main.matchAll(/<!--slot:(\{.*?\})-->/g)].map((m) => JSON.parse(m[1]).kind);
	console.log(`  ${k.padEnd(22)} ${found.join(", ") || "-"}`);
}
