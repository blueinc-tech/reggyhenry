import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { HtmlField } from "@/components/admin/HtmlField";
import { ImageField } from "@/components/admin/ImageField";
import { db } from "@/lib/db";
import { deleteEvent, saveEvent } from "../../charity-actions";
import { Flash } from "../../Flash";

type Row = {
	id: number;
	title: string;
	slug: string;
	summary: string;
	content: string;
	event_date: Date;
	time_text: string;
	location: string;
	time_detail: string;
	location_detail: string;
	category: string;
	map_query: string;
	button_label: string;
	button_url: string;
	image_media_id: number | null;
	img: string | null;
	status: string;
	position: number;
};

export default async function EventEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
	const [{ id }, sp] = await Promise.all([params, searchParams]);
	const isNew = id === "new";
	let e: Row | undefined;
	if (!isNew) {
		if (!/^\d+$/.test(id)) notFound();
		[e] = await db()<Row[]>`select e.*, m.url as img from events e left join media m on m.id = e.image_media_id where e.id = ${Number(id)}`;
		if (!e) notFound();
	}
	const date = e ? e.event_date.toISOString().slice(0, 10) : "";
	return (
		<main className="adm-page">
			<p className="adm-crumb">
				<Link href="/admin/events/">← Events</Link>
			</p>
			<header className="adm-head">
				<h1>{isNew ? "Add an event" : e!.title}</h1>
				{e && e.status === "published" && (
					<a className="btn btn--ghost" href={`/event/${e.slug}/`} target="_blank" rel="noopener">
						View on site ↗
					</a>
				)}
			</header>
			<Flash ok={sp.ok} error={sp.error} />
			<form action={saveEvent} className="adm-edit">
				{e && <input type="hidden" name="id" value={e.id} />}
				<div className="adm-edit__main adm-stack">
					<div className="adm-field">
						<label htmlFor="title">Title</label>
						<input id="title" name="title" defaultValue={e?.title} required maxLength={200} />
					</div>
					<div className="adm-field">
						<label htmlFor="summary">Short description</label>
						<textarea id="summary" name="summary" rows={3} defaultValue={e?.summary} maxLength={1000} />
						<p className="adm-hint">Shown under the title at the top of the event’s page.</p>
					</div>
					<HtmlField name="content" label="More about the event (optional)" initial={e?.content ?? ""} />
				</div>
				<div className="adm-edit__side adm-stack">
					<div className="adm-box adm-stack">
						<div className="adm-field">
							<label htmlFor="status">Status</label>
							<select id="status" name="status" defaultValue={e?.status ?? "published"}>
								<option value="published">Published</option>
								<option value="draft">Draft (hidden)</option>
							</select>
						</div>
						<button className="btn" type="submit">
							{isNew ? "Add event" : "Save"}
						</button>
					</div>
					<div className="adm-box adm-stack">
						<div className="adm-field">
							<label htmlFor="event_date">Date</label>
							<input id="event_date" name="event_date" type="date" defaultValue={date} required />
						</div>
						<div className="adm-field">
							<label htmlFor="time_text">Time on the cards</label>
							<input id="time_text" name="time_text" defaultValue={e?.time_text} placeholder="9:00am" maxLength={60} />
						</div>
						<div className="adm-field">
							<label htmlFor="location">Place on the cards</label>
							<input id="location" name="location" defaultValue={e?.location} placeholder="Abuja" maxLength={100} />
						</div>
						<div className="adm-field">
							<label htmlFor="time_detail">Time on the event page</label>
							<input id="time_detail" name="time_detail" defaultValue={e?.time_detail} placeholder="9:00am to 12:00pm" maxLength={120} />
						</div>
						<div className="adm-field">
							<label htmlFor="location_detail">Location on the event page</label>
							<input id="location_detail" name="location_detail" defaultValue={e?.location_detail} placeholder="LEA Primary School, Mabushi, Abuja" maxLength={200} />
						</div>
						<div className="adm-field">
							<label htmlFor="category">Category</label>
							<input id="category" name="category" defaultValue={e?.category} placeholder="International Days" maxLength={100} />
						</div>
						<div className="adm-field">
							<label htmlFor="map_query">Map location</label>
							<input id="map_query" name="map_query" defaultValue={e?.map_query} placeholder="Mabushi, Abuja" maxLength={200} />
							<p className="adm-hint">What Google Maps should show on the event page. Leave empty for no map.</p>
						</div>
					</div>
					<div className="adm-box adm-stack">
						<ImageField name="image_media_id" label="Picture" initial={e?.image_media_id && e.img ? { id: e.image_media_id, url: e.img } : null} hint="Portrait pictures fit the cards best (about 370 × 470)." />
					</div>
					<div className="adm-box adm-stack">
						<div className="adm-field">
							<label htmlFor="button_label">Button text (optional)</label>
							<input id="button_label" name="button_label" defaultValue={e?.button_label} placeholder="Register" maxLength={60} />
						</div>
						<div className="adm-field">
							<label htmlFor="button_url">Button link</label>
							<input id="button_url" name="button_url" defaultValue={e?.button_url} placeholder="https://…" maxLength={300} />
						</div>
						<div className="adm-field">
							<label htmlFor="slug">Web address</label>
							<input id="slug" name="slug" defaultValue={e?.slug} placeholder="Made from the title if empty" maxLength={120} />
						</div>
						<div className="adm-field">
							<label htmlFor="position">Order</label>
							<input id="position" name="position" type="number" defaultValue={e?.position ?? 0} />
							<p className="adm-hint">Lower numbers come first.</p>
						</div>
					</div>
				</div>
			</form>
			{e && (
				<form action={deleteEvent} className="adm-box adm-box--danger adm-stack">
					<input type="hidden" name="id" value={e.id} />
					<p>Deleting removes the event and its page. This can’t be undone.</p>
					<ConfirmSubmit label="Delete event" question={`Delete “${e.title}”?`} />
				</form>
			)}
		</main>
	);
}
