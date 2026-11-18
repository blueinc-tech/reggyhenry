import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { getArchiveMonths, getRecentComments, type Campaign, type Comment, type EventItem, type GalleryItem, type Pledge, type TeamMember } from "@/lib/charity";
import { getCategories, getPosts, type Post, type PostSummary, type Term } from "@/lib/data";
import { SITE_URL } from "@/lib/config";
import { naira, paymentText, type SiteSettings } from "@/lib/site-settings";
import templates from "./templates.json";

/**
 * Fills the old site's page templates (lib/theme/templates.json, built by
 * scripts/build-theme.ts) with content from the database, in the theme's own markup.
 */

type Slot = { kind: string; col?: string; delays?: number[]; count?: number; pager?: string; size?: string; dateSpace?: boolean };
export type Templates = typeof templates;
export const T: Templates = templates;

/* ---------- Small helpers ---------- */

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const lagos = (iso: string) => new Date(new Date(iso).getTime() + 60 * 60 * 1000);
const dd = (n: number) => String(n).padStart(2, "0");
/** "30 Sep, 2022" */
export const dayMonYear = (iso: string) => {
	const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : lagos(iso);
	return `${dd(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
};
/** "09 Sep,25" (home page) or "09 Sep, 25" (News page), as the theme printed them. */
const newsDate = (iso: string, space: boolean) => {
	const d = lagos(iso);
	return `${dd(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]},${space ? " " : ""}${String(d.getUTCFullYear()).slice(2)}`;
};
/** "March 30, 2025" */
export const longDate = (iso: string) => {
	const d = lagos(iso);
	return `${LONG_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};
const paragraphs = (text: string) =>
	text
		.trim()
		.split(/\n{2,}/)
		.map((p) =>
			/^\d+\.\s/m.test(p) && p.split("\n").every((l) => /^\d+\.\s/.test(l))
				? `<ol>${p
						.split("\n")
						.map((l) => `<li>${esc(l.replace(/^\d+\.\s*/, ""))}</li>`)
						.join("")}</ol>`
				: `<p>${esc(p).replace(/\n/g, "<br>")}</p>`,
		)
		.join("\n");
const pct = (c: Campaign) => (c.goal > 0 ? Math.min(100, Math.round((c.raised / c.goal) * 10000) / 100) : 0);
const fmtPct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")}%`;
const amount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const enc = encodeURIComponent;

/* ---------- Uploaded files ---------- */

/** Old /wp-content/uploads/ paths → their copies in the media library (S3 in production). */
const uploadsMap = cache(async (): Promise<Map<string, string>> => {
	try {
		const rows = await db()<{ original_url: string; url: string }[]>`select original_url, url from media where original_url is not null`;
		return new Map(rows.map((r) => [r.original_url.replace(/^https?:\/\/[^/]+/, ""), r.url]));
	} catch {
		return new Map();
	}
});

/** Points every old uploads address in the markup at the media library; unknown ones keep the old path (redirected by app/wp-content). */
async function localise(html: string): Promise<string> {
	const map = await uploadsMap();
	return html.replace(/\/wp-content\/uploads\/(?!elementor\/)[^"'\s)<>]+/g, (path) => map.get(path) ?? path);
}

/* ---------- Header and footer ---------- */

function applySettings(html: string, s: SiteSettings): string {
	const { contact, social } = s;
	const tel = contact.phone.replace(/[^\d+]/g, "");
	let out = html
		.replace(/tel:\+?(?:2348026748190|23491346576)/g, `tel:${esc(tel)}`)
		.replace(/\+2348026748190|\+23491346576/g, esc(contact.phone))
		.replace(/mailto:info@rhagfnig\.org\.ng/g, `mailto:${esc(contact.email)}`)
		.replace(/info@rhagfnig[.,]org[.,]ng/g, esc(contact.email))
		.replace("<p>Location: Suite B406 (b), </p>", `<p>Location: ${esc(contact.addressLine1)} </p>`)
		.replace("<h5>3rd Floor, Global Plaza, Abuja</h5>", `<h5>${esc(contact.addressLine2)}</h5>`)
		.replace(/Suite B406 \(b\), 3rd Floor Global Plaza, Abuja/g, esc(`${contact.addressLine1} ${contact.addressLine2}`.replace(/\s+/g, " ")))
		.replace(/(©[^<]*?)\b20\d\d\b/g, `$1${new Date().getFullYear()}`);
	// Social icons: each link is identified by its icon.
	const icons: [RegExp, string][] = [
		[/fa-facebook(?:-f)?\b/, social.facebook],
		[/fa-twitter\b/, social.x],
		[/fa-linkedin(?:-in)?\b/, social.linkedin],
		[/fa-instagram\b/, social.instagram],
	];
	out = out.replace(/(<a\b[^>]*?href=")(https?:\/\/(?:www\.)?(?:facebook|twitter|linkedin|instagram)\.com\/?)("[^>]*>\s*<(?:i|span)[^>]*class="([^"]*)")/g, (whole, a: string, _old: string, b: string, cls: string) => {
		const hit = icons.find(([re]) => re.test(cls));
		return hit && hit[1] ? `${a}${esc(hit[1])}${b}` : whole;
	});
	return out;
}

/** Marks the menu item for the page being shown, as WordPress did. */
function markCurrent(html: string, path: string): string {
	return html.replace(/<li id="menu-item-(\d+)" class="([^"]*)"><a href="([^"]*)"( aria-current="page")?>/g, (_w, id: string, cls: string, href: string) => {
		const current = href === path || (href !== "/" && path.startsWith(href));
		return `<li id="menu-item-${id}" class="${cls}${current ? " current-menu-item current_page_item" : ""}"><a href="${href}"${current ? ' aria-current="page"' : ""}>`;
	});
}

/** A whole page: header, the page's own part, footer. Every page uses the home page's full header and footer. */
export async function layout(main: string, opts: { path: string; settings: SiteSettings }): Promise<string> {
	const html = T.chrome.home.top + main + T.chrome.home.bottom;
	return localise(markCurrent(applySettings(html, opts.settings), opts.path));
}

/* ---------- Lists ---------- */

const col = (s: Slot, i: number, inner: string) => {
	const delays = s.delays ?? [];
	const delay = delays.length ? delays[i % delays.length] : 0;
	return `<div class="${s.col}"${delay ? ` data-wow-delay="${delay}ms"` : ""}>\n${inner}\n</div>`;
};

function causeCard(c: Campaign): string {
	const p = pct(c);
	return `<div class="causes-one__single">
<div class="causes-one__content">
<h3 class="causes-one__title"><a href="${c.href}">${esc(c.title)}</a>
</h3>
<p class="causes-one__text">${esc(c.excerpt)}</p>
<div class="causes-one__progress">
<div class="causes-one__progress-shape" style="background-image: url(/legacy/theme-images/2022/09/causes-one-progress-shape-1.png)"></div>
<div class="bar">
<div class="bar-inner count-bar" data-percent="${fmtPct(p)}">
<div class="count-text">${fmtPct(p)}</div>
</div>
</div>
<div class="causes-one__goals">
<p><span>&#8358; ${amount(c.raised)}</span> Raised</p>
<p><span>&#8358; ${amount(c.goal)}</span> Goal</p>
</div>
</div>
</div>
</div>`;
}

function eventCard(e: EventItem, size: string): string {
	const [w, h] = size.split("x");
	const img = e.image ? `<img decoding="async" loading="lazy" width="${w}" height="${h}" src="${esc(e.image.url)}" class="rhagf-cover wp-post-image" style="aspect-ratio:${w}/${h}" alt="${esc(e.image.alt)}" />` : "";
	return `<div class="events-one__single">
<div class="events-one__img">
${img}<div class="events-one__date">
<p>${dayMonYear(e.date)}</p>
</div>
<div class="events-one__content">
<ul class="list-unstyled events-one__meta ml-0">
<li><i class="fas fa-clock"></i>${esc(e.time)}</li>
<li><i class="fas fa-map-marker-alt"></i>${esc(e.location)}</li>
</ul>
<h3 class="events-one__title"><a href="${e.href}">${esc(e.title)}</a></h3>
</div>
</div>
</div>`;
}

const shareLinks = (href: string, title: string) => {
	const url = enc(`${SITE_URL}${href}`);
	const text = enc(title);
	return `<li><a href="https://www.facebook.com/sharer/sharer.php?u=${url}"><i class="fab fa-facebook-f"></i></a></li>
<li><a href="https://twitter.com/intent/tweet?text=${text}&#038;url=${url}"><i class="fab fa-twitter"></i></a></li>
<li><a href="https://pinterest.com/pin/create/button/?url=${url}&#038;description=${text}"><i class="fab fa-pinterest-p"></i></a></li>`;
};

function newsCard(p: PostSummary, dateSpace: boolean): string {
	return `<div class="news-one__single">
<div class="news-one__content-box">
<div class="news-one__content-inner">
<div class="news-one__content">
<ul class="list-unstyled news-one__meta ml-0">
<li><span class="byline"><span class="author vcard"><a class="url fn n" href="/author/${esc(p.authorSlug)}/"><i class="fas fa-user-circle"></i> ${esc(p.author)}</a></span></span></li>
</ul>
<h3 class="news-one__title"><a href="${p.href}">${esc(p.title)}</a></h3>
</div>
<div class="news-one__bottom">
<div class="news-one__read-more">
<a href="${p.href}"> <span class="icon-right-arrow"></span>Read More</a>
</div>
<div class="news-one__share">
<a href="#"><i class="fas fa-share-alt"></i></a>
<div class="news-one__social-box">
<ul class="list-unstyled news-one__social ml-0">
${shareLinks(p.href, p.title)}
</ul>
</div>
</div>
</div>
</div>
<div class="news-one__date">
<p>${newsDate(p.date, dateSpace)}</p>
</div>
</div>
</div>`;
}

function galleryCard(g: GalleryItem): string {
	return `<div class="gallery-page__single">
<div class="gallery-page__img">
<img decoding="async" loading="lazy" src="${esc(g.image.url)}" alt="${esc(g.image.alt || g.title)}" class="rhagf-cover" style="aspect-ratio:364/300">
<a href="${esc(g.image.url)}" class="img-popup"></a>
<div class="gallery-page__content">
<p class="gallery-page__sub-title">${esc(g.subtitle)}</p>
<h5 class="gallery-page__title">${esc(g.title)}</h5>
</div>
</div>
</div>`;
}

const TEAM_ICONS: Record<string, string> = { facebook: "fab fa-facebook", x: "fab fa-twitter", twitter: "fab fa-twitter", pinterest: "fab fa-pinterest-p", instagram: "fab fa-instagram", linkedin: "fab fa-linkedin-in" };

function teamCard(t: TeamMember): string {
	const links = t.links
		.filter((l) => /^https?:\/\//.test(l.url))
		.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener"><i class="${TEAM_ICONS[l.icon] ?? "fas fa-link"}"></i></a>`)
		.join("\n");
	const img = t.photo ? `<img decoding="async" loading="lazy" src="${esc(t.photo.url)}" alt="${esc(t.photo.alt || t.name)}" class="rhagf-cover" style="aspect-ratio:270/310">` : `<div class="rhagf-team-placeholder"></div>`;
	return `<div class="team-one__single">
<div class="team-one__img">
${img}
<div class="team-one__social">
${links}</div>
</div>
<div class="team-one__content">
<h3 class="team-one__name">
${esc(t.name)}</h3>
<p class="team-one__sub-title">${esc(t.role)}</p>
</div>
</div>`;
}

/** WordPress's page links as this theme printed them: one page at each end and one either side of the current one. */
export function pageLinks(current: number, total: number, href: (n: number) => string): string {
	if (total <= 1) return "";
	const out: string[] = [];
	if (current > 1) out.push(`<a class="prev page-numbers" href="${href(current - 1)}"><i class="fa fa-angle-left"></i></a>`);
	let dots = false;
	for (let n = 1; n <= total; n++) {
		if (n === current) {
			out.push(`<span aria-current="page" class="page-numbers current">${n}</span>`);
			dots = true;
		} else if (n <= 1 || n > total - 1 || (n >= current - 1 && n <= current + 1)) {
			out.push(`<a class="page-numbers" href="${href(n)}">${n}</a>`);
			dots = true;
		} else if (dots) {
			out.push(`<span class="page-numbers dots">&hellip;</span>`);
			dots = false;
		}
	}
	if (current < total) out.push(`<a class="next page-numbers" href="${href(current + 1)}"><i class="fa fa-angle-right"></i></a>`);
	return out.join("\n");
}

/* ---------- Data each page needs ---------- */

export type PageData = {
	settings: SiteSettings;
	campaigns?: Campaign[];
	events?: EventItem[];
	gallery?: GalleryItem[];
	team?: TeamMember[];
	/** Page of the home page's news list (/page/N/). */
	page?: number;
	pledge?: Pledge | null;
};

async function fillSlot(s: Slot, d: PageData): Promise<string> {
	switch (s.kind) {
		case "causes":
			return (d.campaigns ?? []).slice(0, s.count && s.delays && s.delays.length > 1 ? s.count : undefined).map((c, i) => col(s, i, causeCard(c))).join("\n");
		// The home page's carousel lists events oldest first; the Events page newest first (as on the old site).
		case "events-carousel":
			return [...(d.events ?? [])].reverse().map((e) => `<div class="item">\n${eventCard(e, s.size ?? "270x355")}\n</div>`).join("\n");
		case "events":
			return (d.events ?? []).map((e, i) => col(s, i, eventCard(e, s.size ?? "370x470"))).join("\n") + `\n<div class="col-lg-12">\n<div class="blog-post-pagination">\n</div>\n</div>`;
		case "news": {
			const perPage = s.count ?? 3;
			const page = s.pager ? (d.page ?? 1) : 1;
			const { items, totalPages } = await getPosts({ perPage, page });
			const cards = items.map((p, i) => col(s, i, newsCard(p, Boolean(s.dateSpace)))).join("\n");
			if (!s.pager) return cards;
			return `${cards}\n<div class="col-lg-12">\n<div class="${s.pager}">\n${pageLinks(page, totalPages, (n) => (n === 1 ? "/" : `/page/${n}/`))} </div>\n</div>`;
		}
		case "gallery":
			return (d.gallery ?? []).map((g, i) => col(s, i, galleryCard(g))).join("\n");
		case "team":
			return (d.team ?? []).map((t, i) => col(s, i, teamCard(t))).join("\n");
		case "donate-form":
			return donationForm(null, d.campaigns ?? [], d.settings, "page");
		case "receipt":
			return receipt(d.pledge ?? null, d.settings);
		default:
			return "";
	}
}

/** Fills every slot in a template. */
export async function fill(html: string, d: PageData, extra: Record<string, () => Promise<string> | string> = {}): Promise<string> {
	const parts = html.split(/<!--slot:(\{.*?\})-->/);
	const out: string[] = [];
	for (let i = 0; i < parts.length; i++) {
		if (i % 2 === 0) out.push(parts[i]);
		else {
			const s = JSON.parse(parts[i]) as Slot;
			out.push(s.kind in extra ? await extra[s.kind]() : await fillSlot(s, d));
		}
	}
	return out.join("");
}

/* ---------- Donations ---------- */

/** The GiveWP form, in its own markup: suggested amounts, donor details, bank-transfer instructions. */
export function donationForm(c: Campaign | null, campaigns: Campaign[], settings: SiteSettings, mode: "modal" | "page"): string {
	const id = c?.id ?? 0;
	const levels = c?.levels.length ? c.levels : [5000, 10000, 25000, 50000, 100000];
	const def = c?.defaultAmount ?? levels[Math.min(levels.length - 1, 1)];
	const min = c?.minimum ?? 1000;
	const choose =
		c || !campaigns.length
			? `<input type="hidden" name="campaign_id" value="${id || ""}"/>`
			: `<p id="give-campaign-wrap" class="form-row form-row-wide">
<label class="give-label" for="give-campaign">Cause</label>
<select class="give-input" name="campaign_id" id="give-campaign">
<option value="">Where it is needed most</option>
${campaigns.filter((x) => x.status === "published").map((x) => `<option value="${x.id}">${esc(x.title)}</option>`).join("\n")}
</select>
</p>`;
	return `<div id="give-form-${id}-wrap" class="give-form-wrap ${mode === "modal" ? "give-display-button give-display-button-only" : "give-display-onpage"}">
<form id="give-form-${id}-1" class="give-form give-form-${id} give-form-type-multi rhagf-donate${mode === "modal" ? " mfp-hide white-popup" : ""}" action="/api/donate/" method="post" data-minimum="${min}" novalidate>
<span class="give-hidden" style="display: none !important;">
<label for="give-form-honeypot-${id}"></label>
<input id="give-form-honeypot-${id}" type="text" name="website" class="give-honeypot give-hidden" tabindex="-1" autocomplete="off"/>
</span>
${choose}
<div class="give-total-wrap">
<div class="give-donation-amount form-row-wide">
<span class="give-currency-symbol give-currency-position-before">&#8358;</span> <label class="give-hidden" for="give-amount-${id}">Donation Amount:</label>
<input class="give-text-input give-amount-top" id="give-amount-${id}" name="amount" type="text" inputmode="decimal" placeholder="" value="${amount(def)}" autocomplete="off">
</div>
</div>
<ul id="give-donation-level-button-wrap" class="give-donation-levels-wrap give-list-inline">${levels
		.map(
			(v, i) =>
				`<li><button type="button" class="give-donation-level-btn give-btn give-btn-level-${i}${v === def ? " give-default-level" : ""}" value="${amount(v)}">${c ? `Level ${i + 1}` : `&#8358;${v.toLocaleString("en-US")}`}</button></li>`,
		)
		.join("")}<li><button type="button" class="give-donation-level-btn give-btn give-btn-level-custom" value="custom">Custom Amount</button></li></ul>
<div id="give_purchase_form_wrap">
<fieldset id="give_checkout_user_info" class="">
<legend>
Personal Info </legend>
<p id="give-first-name-wrap" class="form-row form-row-first form-row-responsive">
<label class="give-label" for="give-first-${id}">
First Name <span class="give-required-indicator">*</span>
</label>
<input class="give-input required" type="text" name="first_name" autocomplete="given-name" placeholder="First Name" id="give-first-${id}" value="" required aria-required="true" maxlength="100" />
</p>
<p id="give-last-name-wrap" class="form-row form-row-last form-row-responsive">
<label class="give-label" for="give-last-${id}">
Last Name </label>
<input class="give-input" type="text" name="last_name" autocomplete="family-name" id="give-last-${id}" placeholder="Last Name" value="" maxlength="100" />
</p>
<p id="give-email-wrap" class="form-row form-row-wide">
<label class="give-label" for="give-email-${id}">
Email Address <span class="give-required-indicator">*</span>
</label>
<input class="give-input required" type="email" name="email" autocomplete="email" placeholder="Email Address" id="give-email-${id}" value="" required aria-required="true" maxlength="200" />
</p>
<p id="give-phone-wrap" class="form-row form-row-wide">
<label class="give-label" for="give-phone-${id}">
Phone </label>
<input class="give-input" type="tel" name="phone" autocomplete="tel" placeholder="Phone" id="give-phone-${id}" value="" maxlength="30" />
</p>
</fieldset>
<fieldset class="no-fields" id="give_offline_payment_info">
${paragraphs(paymentText(settings.donations))}
</fieldset>
<fieldset id="give_purchase_submit" class="give-donation-submit">
<p id="give-final-total-wrap" class="form-wrap ">
<span class="give-donation-total-label">
Donation Total: </span>
<span class="give-final-total-amount">
&#8358; ${amount(def)} </span>
</p>
<div class="give_notices give_errors rhagf-donate-error" role="alert" hidden><p class="give_error"></p></div>
<div class="give-submit-button-wrap give-clearfix">
<input type="submit" class="give-submit give-btn" name="give-purchase" value="Donate Now"/>
<span class="give-loading-animation"></span>
</div>
</fieldset>
</div>
</form>
${mode === "modal" ? `<button type="button" class="give-btn give-btn-modal" data-target="#give-form-${id}-1">Donate Now</button>` : ""}
</div>`;
}

export function campaignContent(c: Campaign, settings: SiteSettings): string {
	const img = c.image ? `<img decoding="async" src="${esc(c.image.url)}" alt="${esc(c.image.alt || c.title)}" class="attachment-full wp-post-image">` : "";
	const open = c.status === "published";
	return `<div class="content-single-give-form">
<div id="give-form-${c.id}-content" class="oxpins-donate-btn post-${c.id} give_forms type-give_forms status-publish">
<div class="single-give-images">
${img}</div>
<div class="single-give donation-details__content">
<div class="entry-summary">
${c.content}
</div>
</div>
<div class="donation-details__donate">
<div class="donation-details__donate-left">
<ul class="list-unstyled donation-details__donate-list ml-0">
<li>
<div class="icon">
<span class="icon-solidarity"></span>
</div>
<div class="text">
<span>Raised</span>
<p>&#8358; ${amount(c.raised)}</p>
</div>
</li>
<li>
<div class="icon">
<span class="icon-target-1"></span>
</div>
<div class="text">
<span>Goal</span>
<p>&#8358; ${amount(c.goal)}</p>
</div>
</li>
</ul>
</div>
<div class="donation-details__donate-btn">
${open ? donationForm(c, [], settings, "modal") : `<p class="give_notice">This campaign has closed. Thank you to everyone who gave.</p>`}
</div>
</div>
</div>
</div>`;
}

function receipt(p: Pledge | null, settings: SiteSettings): string {
	if (!p) return `<div class="give_notices give_errors"><p class="give_notice give_warning">You are missing the donation id to view this donation receipt.</p></div>`;
	const rows: [string, string][] = [
		["Donor", `${p.firstName} ${p.lastName}`.trim()],
		["Email", p.email],
		["Donation", p.campaign ?? "Where it is needed most"],
		["Date", longDate(p.date)],
		["Total Donation", naira(p.amount)],
		["Payment Method", "Bank/Wire Transfer"],
		["Reference", p.reference],
		["Status", p.status === "confirmed" ? "Complete" : p.status === "cancelled" ? "Cancelled" : "Pending"],
	];
	return `<div id="give-receipt" class="rhagf-receipt">
<div class="give_notices give_errors"><p class="give_notice give_success">Thank you for your donation. ${p.status === "pending" ? "Please complete it as described below and quote your reference; we will email you once it arrives." : ""}</p></div>
<table id="give_donation_receipt" class="give-table">
<thead><tr><th scope="colgroup" colspan="2"><span class="give-receipt-thead-text">Donation Receipt</span></th></tr></thead>
<tbody>
${rows.map(([k, v]) => `<tr><td scope="row"><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`).join("\n")}
</tbody>
</table>
${p.status === "pending" ? `<div class="rhagf-receipt__instructions">\n${paragraphs(paymentText(settings.donations))}\n</div>` : ""}
</div>`;
}

/* ---------- Comments ---------- */

export function commentsBlock(target: { type: "campaign" | "post"; id: number; href: string }, comments: Comment[]): string {
	const list = comments.length
		? `<div class="comment-one">
<h3 class="comment-one__title">${comments.length} Comment${comments.length === 1 ? "" : "s"}</h3>
${comments
	.map(
		(c) => `<div class="comment-one__single" id="comment-${c.id}">
<div class="comment-one__content">
<h3>${c.website ? `<a href="${esc(c.website)}" rel="external nofollow ugc">${esc(c.name)}</a>` : esc(c.name)}</h3>
<span class="comment-one__date">${longDate(c.date)}</span>
${paragraphs(c.body)}
</div>
</div>`,
	)
	.join("\n")}
</div>`
		: "";
	return `<div id="comments" class="comments-area">
${list}
<div id="respond" class="comment-respond">
<h2 class="comment-form__title">Leave a Comment</h2><form action="/api/comments/" method="post" id="commentform" class="reply-form row" data-rhagf-comment><div class="col-xl-6"> <div class="comment-form__input-box"> <input type="text" name="author" id="name" value="" placeholder="Your name" maxlength="100" required> </div> </div> <div class="col-xl-6"> <div class="comment-form__input-box"> <input type="email" name="email" id="email" value="" placeholder="Email Address" maxlength="200" required> </div> </div> <div class="col-xl-12"> <div class="comment-form__input-box"> <textarea name="comment" id="comment" class="message" placeholder="Write Comment" maxlength="5000" required></textarea> </div> </div><input type="text" name="website" value="" tabindex="-1" autocomplete="off" style="display:none" aria-hidden="true"><p class="form-submit"><button type="submit" class="thm-btn comment-form__btn">Submit Comment</button> <input type="hidden" name="target_type" value="${target.type}" /> <input type="hidden" name="target_id" value="${target.id}" /> </p><p class="rhagf-comment-status col-xl-12" role="status"></p></form> </div>
</div>`;
}

/* ---------- Blog sidebar and articles ---------- */

const replaceInner = (html: string, openTag: RegExp, inner: string) =>
	html.replace(new RegExp(`(${openTag.source})[\\s\\S]*?(</(?:ul|div)>)`), (_w, open: string, close: string) => `${open}${inner}${close}`);

export async function sidebar(): Promise<string> {
	const [{ items }, cats, months, comments] = await Promise.all([getPosts({ perPage: 5 }), getCategories(), getArchiveMonths(), getRecentComments(5).catch(() => [])]);
	let s = T.singles.post.sidebar.replace(/action="\/"/g, 'action="/search/"');
	s = replaceInner(s, /<ul class="wp-block-latest-posts__list[^"]*">/, items.map((p) => `<li><a class="wp-block-latest-posts__post-title" href="${p.href}">${esc(p.title)}</a></li>`).join("\n"));
	s = replaceInner(
		s,
		/<ul class="wp-block-archives-list[^"]*">/,
		months.map((m) => `<li><a href='/${m.year}/${dd(m.month)}/'>${LONG_MONTHS[m.month - 1]} ${m.year}</a></li>`).join("\n"),
	);
	s = replaceInner(
		s,
		/<ul class="wp-block-categories-list[^"]*">/,
		cats.map((c) => `<li class="cat-item cat-item-${c.id}"><a href="/category/${esc(c.slug)}/">${esc(c.name)}</a>\n</li>`).join("\n"),
	);
	if (comments.length)
		s = s.replace(
			/<div class="no-comments wp-block-latest-comments">No comments to show\.<\/div>/,
			`<ol class="has-avatars has-dates wp-block-latest-comments">${comments
				.map(
					(c) =>
						`<li class="wp-block-latest-comments__comment"><article><footer class="wp-block-latest-comments__comment-meta"><span class="wp-block-latest-comments__comment-author">${esc(c.name)}</span> on <a class="wp-block-latest-comments__comment-link" href="/${c.target_type === "campaign" ? "donations/" : ""}${esc(c.slug ?? "")}/#comment-${c.id}">${esc(c.title ?? "")}</a></footer></article></li>`,
				)
				.join("")}</ol>`,
		);
	return s;
}

/** The sample article's share buttons, re-pointed at this article. */
function shareBlock(p: { id: number; href: string; title: string }): string {
	const a = T.singles.post.article;
	const at = a.indexOf('<div class="ss-inline-share-wrapper');
	if (at < 0) return "";
	// The block ends where the article's content box does.
	const end = a.indexOf("<!-- END .ss-inline-share-wrapper -->") > 0 ? a.indexOf("<!-- END .ss-inline-share-wrapper -->") : a.indexOf("</div>\n</div>\n<div class=\"news-details__bottom", at);
	let block = a.slice(at, end);
	const depth = (block.match(/<div\b/g)?.length ?? 0) - (block.match(/<\/div>/g)?.length ?? 0);
	block += "</div>".repeat(Math.max(0, depth));
	const SAMPLE = { id: "2322", slug: "the-regy-henry-amazing-grace-foundation", title: "The Regy & Henry Amazing Grace Foundation" };
	return block
		.split(enc(`https://rhagfnig.org.ng/${SAMPLE.slug}/`))
		.join(enc(`${SITE_URL}${p.href}`))
		.split(enc(SAMPLE.title))
		.join(enc(p.title))
		.split(`/${SAMPLE.slug}/`)
		.join(p.href)
		.split(`"${SAMPLE.id}"`)
		.join(`"${p.id}"`);
}

const byline = (slug: string, name: string) =>
	`<li><span class="byline"><span class="author vcard"><a class="url fn n" href="/author/${esc(slug)}/"><i class="fas fa-user-circle"></i> ${esc(name)}</a></span></span></li>`;

const postedOn = (p: { href: string; date: string; modified: string }) =>
	`<span class="posted-on"> <a href="${p.href}" rel="bookmark"><time class="entry-date published" datetime="${p.date}">${longDate(p.date)}</time><time class="updated" datetime="${p.modified}">${longDate(p.modified)}</time></a></span>`;

const catLinks = (cats: Term[]) => cats.map((c) => `<a href="/category/${esc(c.slug)}/" rel="category tag">${esc(c.name)}</a>`).join(", ");

export function articleHtml(p: Post): string {
	const classes = ["post-" + p.id, "post", "type-post", "status-publish", "format-standard", p.image ? "has-post-thumbnail" : "", "hentry", ...p.categories.map((c) => `category-${c.slug}`)].filter(Boolean).join(" ");
	const thumb = p.image
		? `<div class="post-thumbnail news-details__img no-filter">
<img fetchpriority="high" width="${p.image.width}" height="${p.image.height}" src="${esc(p.image.url)}" class="attachment-post-thumbnail size-post-thumbnail wp-post-image rhagf-cover" style="aspect-ratio:715/390" alt="${esc(p.image.alt)}" decoding="async" />
<div class="news-details__date">
<p>${postedOn(p)}</p>
</div>
</div>`
		: "";
	return `<article id="post-${p.id}" class="${classes}">
${thumb}
<div class="news-details__content blog-details__content clearfix">
<ul class="list-unstyled news-details__meta ml-0">
${byline(p.authorInfo.slug, p.author)}
<li></li>
</ul>
${p.contentHtml}
${shareBlock(p)}
</div>
<div class="news-details__bottom">
${p.categories.length ? `<span class="news-details__tags"><span>Categories </span>${catLinks(p.categories)}</span>` : ""} </div>
</article>`;
}

/** One story in a category, author, month or search list. */
export function archiveItem(p: PostSummary & { categories?: Term[] }): string {
	const img = p.image
		? `<div class="news-sidebar__img">
<a href="${p.href}">
<img width="715" height="390" src="${esc(p.image.url)}" class="attachment-post-thumbnail size-post-thumbnail wp-post-image rhagf-cover" style="aspect-ratio:715/390" alt="${esc(p.image.alt || p.title)}" decoding="async" loading="lazy" /> </a>
<div class="news-sidebar__date">
<p>${postedOn(p)}</p>
</div>
</div>`
		: "";
	return `<article id="post-${p.id}" class="news-sidebar__single post-${p.id} post type-post status-publish format-standard${p.image ? " has-post-thumbnail" : ""} hentry">
${img}
<div class="news-sidebar__content-box">
<ul class="list-unstyled news-sidebar__meta ml-0">
${byline(p.authorSlug, p.author)}
</ul>
<h3 class="news-sidebar__title">
<a href="${p.href}">${esc(p.title)}</a>
</h3>
<p class="news-sidebar__text">${esc(p.excerpt)}</p>
<div class="news-sidebar__bottom">
<a href="${p.href}" class="news-sidebar__arrow"><span class="icon-right-arrow"></span></a>
<a href="${p.href}" class="news-sidebar__read-more">Read More</a>
</div>
</div>
</article>`;
}

export function archiveList(items: PostSummary[], page: number, totalPages: number, href: (n: number) => string, empty = "It seems we can’t find what you’re looking for."): string {
	if (!items.length) return `<section class="no-results not-found"><div class="page-content"><p>${esc(empty)}</p></div></section>`;
	const pager = pageLinks(page, totalPages, href);
	return items.map(archiveItem).join("\n") + (pager ? `\n<div class="blog-pagination portfolio-page__btn-box">\n${pager}\n</div>` : "");
}

/* ---------- Events ---------- */

export function eventLeft(e: EventItem): string {
	const img = e.image ? `<div class="event-details__img">\n<img decoding="async" src="${esc(e.image.url)}" alt="${esc(e.image.alt || e.title)}">\n</div>\n` : "";
	return `<div class="event-details__left">
${img}<div class="event-details__top">
<div class="event-details__date">
<p>${dayMonYear(e.posted)}</p>
</div>
<h3 class="event-details__title">${esc(e.title)}</h3>
${e.summary ? `<p>${esc(e.summary)}</p>` : ""}
${e.buttonUrl && e.buttonLabel ? `<div class="event-details__btn-box">\n<a href="${esc(e.buttonUrl)}" class="thm-btn event-details__btn">${esc(e.buttonLabel)}</a>\n</div>` : ""}
</div>
${e.content ? `<div class="event-details__content">\n${e.content}\n</div>` : ""}
</div>`;
}

export function eventRight(e: EventItem): string {
	const item = (label: string, value: string) => (value ? `<li>\n<span>${label}</span>\n<p>${value}</p>\n</li>` : "");
	return `<div class="event-details__right">
<div class="event-details__info">
<ul class="list-unstyled event-details__info-list ml-0">
${item("Time:", esc(e.timeDetail))}
${item("Date:", dayMonYear(e.date))}
${e.category ? `<li>\n<span>Category:</span>\n<p class="event-category">\n<span>${esc(e.category)}</span> </p>\n</li>` : ""}
${item("Location:", esc(e.locationDetail))}
</ul>
</div>
${e.mapQuery ? `<div class="event-details__map">\n<iframe loading="lazy" title="Map: ${esc(e.mapQuery)}" src="https://maps.google.com/maps?q=${enc(e.mapQuery)}&amp;t=m&amp;z=12&amp;output=embed&amp;iwloc=near"></iframe>\n</div>` : ""}
</div>`;
}
