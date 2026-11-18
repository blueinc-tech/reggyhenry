import "server-only";
import { cache } from "react";
import { db } from "./db";
import type { Image } from "./data";

/**
 * Events, donation campaigns, donations, the gallery, the team and comments:
 * the parts of the old site that came from the theme's own post types and GiveWP.
 */

export type EventItem = {
	id: number;
	slug: string;
	href: string;
	title: string;
	summary: string;
	content: string;
	/** Event day (YYYY-MM-DD). */
	date: string;
	/** When the event was posted (shown at the top of its page, as on the old site). */
	posted: string;
	/** Short time and place on cards; the fuller ones on the event's page. */
	time: string;
	location: string;
	timeDetail: string;
	locationDetail: string;
	category: string;
	mapQuery: string;
	buttonLabel: string;
	buttonUrl: string;
	image: Image | null;
};

export type Campaign = {
	id: number;
	slug: string;
	href: string;
	title: string;
	excerpt: string;
	content: string;
	goal: number;
	raised: number;
	levels: number[];
	defaultAmount: number | null;
	minimum: number;
	image: Image | null;
	status: "draft" | "published" | "closed";
};

export type GalleryItem = { id: number; title: string; subtitle: string; image: Image };
export type TeamMember = { id: number; name: string; role: string; photo: Image | null; links: { icon: string; url: string }[] };
export type Comment = { id: number; name: string; website: string; body: string; date: string };

const image = (r: { img_url: string | null; img_width: number | null; img_height: number | null; img_alt: string | null }): Image | null =>
	r.img_url ? { url: r.img_url, width: r.img_width || 800, height: r.img_height || 600, alt: r.img_alt || "", caption: "" } : null;

const IMG = (alias: string) => `${alias}.url as img_url, ${alias}.width as img_width, ${alias}.height as img_height, ${alias}.alt as img_alt`;

/* ---------- Events ---------- */

type EventRow = {
	id: number;
	slug: string;
	title: string;
	summary: string;
	content: string;
	event_date: Date | string;
	created_at: Date;
	time_text: string;
	location: string;
	time_detail: string;
	location_detail: string;
	category: string;
	map_query: string;
	button_label: string;
	button_url: string;
	img_url: string | null;
	img_width: number | null;
	img_height: number | null;
	img_alt: string | null;
};

const ymd = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

const toEvent = (r: EventRow): EventItem => ({
	id: r.id,
	slug: r.slug,
	href: `/event/${r.slug}/`,
	title: r.title,
	summary: r.summary,
	content: r.content,
	date: ymd(r.event_date),
	posted: r.created_at.toISOString(),
	time: r.time_text,
	location: r.location,
	timeDetail: r.time_detail || r.time_text,
	locationDetail: r.location_detail || r.location,
	category: r.category,
	mapQuery: r.map_query || r.location,
	buttonLabel: r.button_label,
	buttonUrl: r.button_url,
	image: image(r),
});

export const getEvents = cache(async (): Promise<EventItem[]> => {
	const sql = db();
	const rows = await sql.unsafe<EventRow[]>(
		`select e.*, ${IMG("m")} from events e left join media m on m.id = e.image_media_id
		 where e.status = 'published' order by e.position, e.event_date desc, e.id desc`,
	);
	return rows.map(toEvent);
});

export const getEventBySlug = cache(async (slug: string): Promise<EventItem | null> => {
	const sql = db();
	const [r] = await sql.unsafe<EventRow[]>(
		`select e.*, ${IMG("m")} from events e left join media m on m.id = e.image_media_id where e.slug = $1 and e.status = 'published'`,
		[slug],
	);
	return r ? toEvent(r) : null;
});

/* ---------- Campaigns ---------- */

type CampaignRow = {
	id: number;
	slug: string;
	title: string;
	excerpt: string;
	content: string;
	goal: string;
	raised_offset: string;
	confirmed: string | null;
	levels: string[];
	default_amount: string | null;
	minimum: string;
	status: Campaign["status"];
	img_url: string | null;
	img_width: number | null;
	img_height: number | null;
	img_alt: string | null;
};

const toCampaign = (r: CampaignRow): Campaign => ({
	id: r.id,
	slug: r.slug,
	href: `/donations/${r.slug}/`,
	title: r.title,
	excerpt: r.excerpt,
	content: r.content,
	goal: Number(r.goal),
	raised: Number(r.raised_offset) + Number(r.confirmed ?? 0),
	levels: (r.levels ?? []).map(Number),
	defaultAmount: r.default_amount === null ? null : Number(r.default_amount),
	minimum: Number(r.minimum),
	image: image(r),
	status: r.status,
});

const CAMPAIGN_SELECT = `select c.*, ${IMG("m")},
	(select sum(d.amount) from donations d where d.campaign_id = c.id and d.status = 'confirmed') as confirmed
	from campaigns c left join media m on m.id = c.image_media_id`;

export const getCampaigns = cache(async (): Promise<Campaign[]> => {
	const rows = await db().unsafe<CampaignRow[]>(`${CAMPAIGN_SELECT} where c.status <> 'draft' order by c.position, c.id`);
	return rows.map(toCampaign);
});

export const getCampaignBySlug = cache(async (slug: string): Promise<Campaign | null> => {
	const [r] = await db().unsafe<CampaignRow[]>(`${CAMPAIGN_SELECT} where c.slug = $1 and c.status <> 'draft'`, [slug]);
	return r ? toCampaign(r) : null;
});

export async function getCampaignById(id: number): Promise<Campaign | null> {
	const [r] = await db().unsafe<CampaignRow[]>(`${CAMPAIGN_SELECT} where c.id = $1`, [id]);
	return r ? toCampaign(r) : null;
}

/* ---------- Gallery and team ---------- */

export const getGallery = cache(async (): Promise<GalleryItem[]> => {
	const rows = await db().unsafe<{ id: number; title: string; subtitle: string; img_url: string; img_width: number | null; img_height: number | null; img_alt: string | null }[]>(
		`select g.id, g.title, g.subtitle, ${IMG("m")} from gallery_items g join media m on m.id = g.media_id order by g.position, g.id`,
	);
	return rows.map((r) => ({ id: r.id, title: r.title, subtitle: r.subtitle, image: image(r)! }));
});

export const getTeam = cache(async (): Promise<TeamMember[]> => {
	const rows = await db().unsafe<
		{ id: number; name: string; role: string; links: { icon: string; url: string }[]; img_url: string | null; img_width: number | null; img_height: number | null; img_alt: string | null }[]
	>(`select t.id, t.name, t.role, t.links, ${IMG("m")} from team_members t left join media m on m.id = t.photo_media_id order by t.position, t.id`);
	return rows.map((r) => ({ id: r.id, name: r.name, role: r.role, links: r.links ?? [], photo: image(r) }));
});

/* ---------- Comments ---------- */

export async function getApprovedComments(type: "campaign" | "post", id: number): Promise<Comment[]> {
	const rows = await db()<{ id: number; name: string; website: string; body: string; created_at: Date }[]>`
		select id, name, website, body, created_at from comments
		where target_type = ${type} and target_id = ${id} and status = 'approved' order by created_at`;
	return rows.map((r) => ({ id: r.id, name: r.name, website: r.website, body: r.body, date: r.created_at.toISOString() }));
}

export const getRecentComments = cache(async (limit = 5) => {
	return db()<{ id: number; name: string; target_type: string; title: string | null; slug: string | null }[]>`
		select c.id, c.name, c.target_type,
			coalesce(p.title, k.title) as title, coalesce(p.slug, k.slug) as slug
		from comments c
		left join posts p on c.target_type = 'post' and p.id = c.target_id
		left join campaigns k on c.target_type = 'campaign' and k.id = c.target_id
		where c.status = 'approved' order by c.created_at desc limit ${limit}`;
});

/* ---------- Donations ---------- */

export type Pledge = {
	reference: string;
	firstName: string;
	lastName: string;
	email: string;
	amount: number;
	status: string;
	date: string;
	campaign: string | null;
};

export async function getPledge(reference: string): Promise<Pledge | null> {
	const [r] = await db()<
		{ reference: string; first_name: string; last_name: string; email: string; amount: string; status: string; created_at: Date; campaign: string | null }[]
	>`
		select d.reference, d.first_name, d.last_name, d.email, d.amount, d.status, d.created_at, c.title as campaign
		from donations d left join campaigns c on c.id = d.campaign_id where d.reference = ${reference}`;
	if (!r) return null;
	return {
		reference: r.reference,
		firstName: r.first_name,
		lastName: r.last_name,
		email: r.email,
		amount: Number(r.amount),
		status: r.status,
		date: r.created_at.toISOString(),
		campaign: r.campaign,
	};
}

/** Months with published articles, newest first (the sidebar's Archives list). */
export const getArchiveMonths = cache(async (): Promise<{ year: number; month: number }[]> => {
	const rows = await db()<{ y: number; m: number }[]>`
		select distinct extract(year from published_at at time zone 'Africa/Lagos')::int as y, extract(month from published_at at time zone 'Africa/Lagos')::int as m
		from posts where type = 'post' and status = 'published' and published_at <= now() order by y desc, m desc`;
	return rows.map((r) => ({ year: r.y, month: r.m }));
});
