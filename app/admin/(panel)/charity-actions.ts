"use server";

/**
 * Events, donation campaigns, donations, the gallery, volunteers and comments.
 * Each action checks the signed-in user, then returns to its screen with a short
 * confirmation or error in the address (?ok= / ?error=), so the forms work
 * without JavaScript.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toSlug } from "@/lib/admin-format";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { CONTACT } from "@/lib/config";
import { db } from "@/lib/db";
import { parseAmount } from "@/lib/forms";
import { sendMail } from "@/lib/mail";
import { cleanArticleHtml } from "@/lib/sanitize";
import { naira } from "@/lib/settings";

const str = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);
/** Back to a screen with ?ok= or ?error=, keeping any #anchor last so the browser still scrolls to it. */
const go = (target: string, kind: "ok" | "error", message: string): never => {
	const [path, hash] = target.split("#");
	return redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`);
};
const refreshSite = () => revalidatePath("/", "layout");
const isUniqueViolation = (e: unknown) => (e as { code?: string }).code === "23505";
const mediaId = (form: FormData, key: string) => Number(form.get(key)) || null;
const html = (form: FormData, key: string) => cleanArticleHtml(String(form.get(key) ?? "").slice(0, 200_000), { siteOrigins: [] });
const money = (form: FormData, key: string) => {
	const n = parseAmount(str(form, key, 30));
	return Number.isFinite(n) ? n : NaN;
};

/* ---------- Events ---------- */

export async function saveEvent(form: FormData): Promise<void> {
	const user = await requireUser();
	const id = Number(form.get("id")) || null;
	const title = str(form, "title", 200);
	const slug = toSlug(str(form, "slug", 120) || title);
	const date = str(form, "event_date", 10);
	const path = id ? `/admin/events/${id}/` : "/admin/events/new/";
	if (!title) go(path, "error", "Enter the event’s title.");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) go(path, "error", "Choose the event’s date.");
	const v = {
		title,
		slug,
		summary: str(form, "summary", 1000),
		content: html(form, "content"),
		event_date: date,
		time_text: str(form, "time_text", 60),
		location: str(form, "location", 100),
		time_detail: str(form, "time_detail", 120),
		location_detail: str(form, "location_detail", 200),
		category: str(form, "category", 100),
		map_query: str(form, "map_query", 200),
		button_label: str(form, "button_label", 60),
		button_url: str(form, "button_url", 300),
		image_media_id: mediaId(form, "image_media_id"),
		status: form.get("status") === "draft" ? "draft" : "published",
		position: Number(form.get("position")) || 0,
	};
	if (v.button_url && !/^(\/|https?:\/\/)/.test(v.button_url)) go(path, "error", "The button link must start with / or https://.");
	let savedId = id;
	try {
		if (id) await db()`update events set ${db()(v)}, updated_at = now() where id = ${id}`;
		else [{ id: savedId }] = await db()<{ id: number }[]>`insert into events ${db()(v)} returning id`;
	} catch (e) {
		if (isUniqueViolation(e)) go(path, "error", `Another event already uses the address “${slug}”.`);
		throw e;
	}
	await logActivity(user, id ? "Edited event" : "Added event", title);
	refreshSite();
	go(`/admin/events/${savedId}/`, "ok", id ? "Saved." : "Event added.");
}

export async function deleteEvent(form: FormData): Promise<void> {
	const user = await requireUser();
	const [e] = await db()<{ title: string }[]>`delete from events where id = ${Number(form.get("id"))} returning title`;
	if (e) await logActivity(user, "Deleted event", e.title);
	refreshSite();
	go("/admin/events/", "ok", e ? `Deleted “${e.title}”.` : "Already deleted.");
}

/* ---------- Campaigns ---------- */

export async function saveCampaign(form: FormData): Promise<void> {
	const user = await requireUser();
	const id = Number(form.get("id")) || null;
	const title = str(form, "title", 200);
	const slug = toSlug(str(form, "slug", 120) || title);
	const path = id ? `/admin/campaigns/${id}/` : "/admin/campaigns/new/";
	const goal = money(form, "goal");
	const raised = money(form, "raised_offset") || 0;
	const minimum = money(form, "minimum") || 0;
	const levels = str(form, "levels", 500)
		// One per line (commas are thousands separators).
		.split(/[\n;]+/)
		.map((s) => parseAmount(s.trim()))
		.filter((n) => Number.isFinite(n) && n > 0)
		.slice(0, 20);
	const def = str(form, "default_amount", 30) ? money(form, "default_amount") : null;
	if (!title) go(path, "error", "Enter the campaign’s title.");
	if (!Number.isFinite(goal) || goal < 0) go(path, "error", "Enter the goal as a number, e.g. 2,000,000.");
	if (!Number.isFinite(raised) || raised < 0) go(path, "error", "Enter the amount raised before this site as a number (0 if none).");
	if (def !== null && !Number.isFinite(def)) go(path, "error", "Enter the default amount as a number, or leave it empty.");
	const status = ["draft", "published", "closed"].includes(String(form.get("status"))) ? String(form.get("status")) : "published";
	const v = {
		title,
		slug,
		excerpt: str(form, "excerpt", 500),
		content: html(form, "content"),
		goal,
		raised_offset: raised,
		levels,
		default_amount: def,
		minimum: Number.isFinite(minimum) ? minimum : 0,
		image_media_id: mediaId(form, "image_media_id"),
		status,
		position: Number(form.get("position")) || 0,
	};
	let savedId = id;
	try {
		if (id) await db()`update campaigns set ${db()(v)}, updated_at = now() where id = ${id}`;
		else [{ id: savedId }] = await db()<{ id: number }[]>`insert into campaigns ${db()(v)} returning id`;
	} catch (e) {
		if (isUniqueViolation(e)) go(path, "error", `Another campaign already uses the address “${slug}”.`);
		throw e;
	}
	await logActivity(user, id ? "Edited campaign" : "Added campaign", title);
	refreshSite();
	go(`/admin/campaigns/${savedId}/`, "ok", id ? "Saved." : "Campaign added.");
}

export async function deleteCampaign(form: FormData): Promise<void> {
	const user = await requireUser();
	const id = Number(form.get("id"));
	const [{ n }] = await db()<{ n: string }[]>`select count(*) as n from donations where campaign_id = ${id}`;
	if (Number(n) > 0) go(`/admin/campaigns/${id}/`, "error", "This campaign has donations, so it can’t be deleted. Set it to Closed or Draft instead.");
	const [c] = await db()<{ title: string }[]>`delete from campaigns where id = ${id} returning title`;
	if (c) await logActivity(user, "Deleted campaign", c.title);
	refreshSite();
	go("/admin/campaigns/", "ok", c ? `Deleted “${c.title}”.` : "Already deleted.");
}

/* ---------- Donations ---------- */

/** Confirm (money received) or cancel a pledge; confirming adds it to the campaign total and thanks the donor by email. */
export async function setDonationStatus(form: FormData): Promise<void> {
	const user = await requireUser();
	const id = Number(form.get("id"));
	const status = String(form.get("status"));
	const back = str(form, "back", 200) || "/admin/donations/";
	if (!["pending", "confirmed", "cancelled"].includes(status)) go(back, "error", "Unknown status.");
	const [d] = await db()<{ reference: string; first_name: string; email: string; amount: string; campaign: string | null; was: string }[]>`
		update donations d set status = ${status}, confirmed_at = ${status === "confirmed" ? db()`now()` : null}, updated_at = now()
		from (select id, status as was from donations where id = ${id}) old
		where d.id = old.id
		returning d.reference, d.first_name, d.email, d.amount,
			(select title from campaigns c where c.id = d.campaign_id) as campaign, old.was`;
	if (!d) go(back, "error", "That donation no longer exists.");
	await logActivity(user, `Marked donation ${status}`, `${d.reference} (${naira(Number(d.amount))})`);
	let note = "";
	if (status === "confirmed" && d.was !== "confirmed" && form.get("notify") === "on") {
		try {
			await sendMail({
				to: d.email,
				replyTo: CONTACT.email,
				subject: `We received your donation (${d.reference})`,
				text: `Dear ${d.first_name},\n\nWe have received your donation of ${naira(Number(d.amount))}${d.campaign ? ` to ${d.campaign}` : ""}. Thank you for your generosity.\n\nReference: ${d.reference}\n\nWith gratitude,\nRegy & Henry Amazing Grace Foundation`,
			});
			note = " The donor was emailed a thank-you.";
		} catch (e) {
			console.error("[donations] thank-you not sent", e);
			note = " The thank-you email could not be sent.";
		}
	}
	refreshSite();
	go(back, "ok", `${d.reference} marked ${status}.${note}`);
}

export async function saveDonationNotes(form: FormData): Promise<void> {
	await requireUser();
	const id = Number(form.get("id"));
	await db()`update donations set notes = ${str(form, "notes", 2000)}, updated_at = now() where id = ${id}`;
	go(str(form, "back", 200) || "/admin/donations/", "ok", "Notes saved.");
}

/** Records a donation received outside the website (cash, a transfer without a pledge). */
export async function addDonation(form: FormData): Promise<void> {
	const user = await requireUser();
	const amount = money(form, "amount");
	const firstName = str(form, "first_name", 100) || "Anonymous";
	const email = str(form, "email", 200);
	if (!Number.isFinite(amount) || amount <= 0) go("/admin/donations/", "error", "Enter the amount received.");
	const campaignId = Number(form.get("campaign_id")) || null;
	const reference = `RHAGF-M${Date.now().toString(36).toUpperCase().slice(-5)}`;
	await db()`
		insert into donations (reference, campaign_id, first_name, last_name, email, phone, amount, status, notes, confirmed_at)
		values (${reference}, ${campaignId}, ${firstName}, ${str(form, "last_name", 100)}, ${email}, ${str(form, "phone", 30)}, ${amount}, 'confirmed', ${str(form, "notes", 2000)}, now())`;
	await logActivity(user, "Recorded donation", `${reference} (${naira(amount)})`);
	refreshSite();
	go("/admin/donations/", "ok", `Recorded ${naira(amount)} as ${reference}.`);
}

/* ---------- Gallery ---------- */

export async function addGalleryItem(form: FormData): Promise<void> {
	const user = await requireUser();
	const media = mediaId(form, "media_id");
	if (!media) go("/admin/gallery/", "error", "Choose a picture first.");
	const [{ next }] = await db()<{ next: number }[]>`select coalesce(max(position), -1) + 1 as next from gallery_items`;
	const at = form.get("where") === "start" ? -1 : next;
	if (at === -1) await db()`update gallery_items set position = position + 1`;
	await db()`insert into gallery_items (media_id, title, subtitle, position) values (${media}, ${str(form, "title", 200)}, ${str(form, "subtitle", 200)}, ${Math.max(0, at)})`;
	await logActivity(user, "Added gallery picture", str(form, "title", 200));
	refreshSite();
	go("/admin/gallery/", "ok", "Picture added to the gallery.");
}

export async function saveGalleryItem(form: FormData): Promise<void> {
	await requireUser();
	const id = Number(form.get("id"));
	await db()`update gallery_items set title = ${str(form, "title", 200)}, subtitle = ${str(form, "subtitle", 200)} where id = ${id}`;
	refreshSite();
	go("/admin/gallery/", "ok", "Saved.");
}

export async function moveGalleryItem(form: FormData): Promise<void> {
	await requireUser();
	await reorder("gallery_items", Number(form.get("id")), form.get("dir") === "up" ? -1 : 1);
	refreshSite();
	redirect(`/admin/gallery/#g${Number(form.get("id"))}`);
}

export async function deleteGalleryItem(form: FormData): Promise<void> {
	const user = await requireUser();
	const [g] = await db()<{ title: string }[]>`delete from gallery_items where id = ${Number(form.get("id"))} returning title`;
	if (g) await logActivity(user, "Removed gallery picture", g.title);
	refreshSite();
	go("/admin/gallery/", "ok", "Removed from the gallery. The file stays in Media.");
}

/** Swaps an item with its neighbour, renumbering the list first so positions are unique. */
async function reorder(table: "gallery_items" | "team_members", id: number, dir: -1 | 1) {
	const sql = db();
	await sql.begin(async (tx) => {
		const rows = await tx.unsafe<{ id: number }[]>(`select id from ${table} order by position, id for update`);
		const i = rows.findIndex((r) => r.id === id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= rows.length) return;
		[rows[i], rows[j]] = [rows[j], rows[i]];
		for (const [n, r] of rows.entries()) await tx.unsafe(`update ${table} set position = $1 where id = $2`, [n, r.id]);
	});
}

/* ---------- Volunteers (team) ---------- */

const NETWORKS = ["facebook", "x", "instagram", "linkedin", "pinterest"] as const;

export async function saveTeamMember(form: FormData): Promise<void> {
	const user = await requireUser();
	const id = Number(form.get("id")) || null;
	const name = str(form, "name", 100);
	if (!name) go("/admin/volunteers/", "error", "Enter the person’s name.");
	const links = NETWORKS.map((icon) => ({ icon, url: str(form, `link_${icon}`, 300) })).filter((l) => l.url);
	if (links.some((l) => !/^https?:\/\//.test(l.url))) go("/admin/volunteers/", "error", "Social links must start with https://.");
	const v = { name, role: str(form, "role", 100), photo_media_id: mediaId(form, "photo_media_id"), links: db().json(links) };
	if (id) await db()`update team_members set ${db()(v)} where id = ${id}`;
	else {
		const [{ next }] = await db()<{ next: number }[]>`select coalesce(max(position), -1) + 1 as next from team_members`;
		await db()`insert into team_members ${db()({ ...v, position: next })}`;
	}
	await logActivity(user, id ? "Edited volunteer" : "Added volunteer", name);
	refreshSite();
	go("/admin/volunteers/", "ok", id ? `Saved ${name}.` : `Added ${name}.`);
}

export async function moveTeamMember(form: FormData): Promise<void> {
	await requireUser();
	await reorder("team_members", Number(form.get("id")), form.get("dir") === "up" ? -1 : 1);
	refreshSite();
	redirect(`/admin/volunteers/#t${Number(form.get("id"))}`);
}

export async function deleteTeamMember(form: FormData): Promise<void> {
	const user = await requireUser();
	const [t] = await db()<{ name: string }[]>`delete from team_members where id = ${Number(form.get("id"))} returning name`;
	if (t) await logActivity(user, "Removed volunteer", t.name);
	refreshSite();
	go("/admin/volunteers/", "ok", t ? `Removed ${t.name}.` : "Already removed.");
}

/* ---------- Comments ---------- */

export async function setCommentStatus(form: FormData): Promise<void> {
	const user = await requireUser();
	const id = Number(form.get("id"));
	const status = String(form.get("status"));
	const back = str(form, "back", 200) || "/admin/comments/";
	if (status === "delete") {
		await db()`delete from comments where id = ${id}`;
		await logActivity(user, "Deleted comment", `#${id}`);
		refreshSite();
		go(back, "ok", "Comment deleted.");
	}
	if (!["pending", "approved", "spam"].includes(status)) go(back, "error", "Unknown status.");
	await db()`update comments set status = ${status} where id = ${id}`;
	await logActivity(user, status === "approved" ? "Approved comment" : `Marked comment ${status}`, `#${id}`);
	refreshSite();
	go(back, "ok", status === "approved" ? "Comment approved: it now shows on the site." : status === "spam" ? "Marked as spam." : "Moved back to pending.");
}
