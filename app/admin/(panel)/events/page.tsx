import Link from "next/link";
import { db } from "@/lib/db";
import { Flash } from "../Flash";

type Row = { id: number; title: string; slug: string; event_date: Date; time_text: string; location: string; status: string; img: string | null };

/** Events shown on the home page's carousel, the Events page and their own pages. */
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
	const sp = await searchParams;
	const rows = await db()<Row[]>`
		select e.id, e.title, e.slug, e.event_date, e.time_text, e.location, e.status, m.url as img
		from events e left join media m on m.id = e.image_media_id order by e.position, e.event_date desc, e.id desc`;
	return (
		<main className="adm-page">
			<header className="adm-head">
				<h1>Events</h1>
				<Link className="btn" href="/admin/events/new/">
					Add an event
				</Link>
			</header>
			<p className="adm-hint">Shown on the home page (“Upcoming events”), the Programs page (/events/) and each at /event/name/. Listed in the order below.</p>
			<Flash ok={sp.ok} error={sp.error} />
			{rows.length ? (
				<div className="adm-table-wrap">
					<table className="adm-table">
						<thead>
							<tr>
								<th scope="col">Event</th>
								<th scope="col">Date</th>
								<th scope="col">Time and place</th>
								<th scope="col">Status</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.id}>
									<td className="adm-table__title">
										{/* eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail */}
										{r.img && <img className="adm-thumb" src={r.img} alt="" />}
										<Link href={`/admin/events/${r.id}/`}>{r.title}</Link>
										<span className="adm-table__slug">/event/{r.slug}/</span>
									</td>
									<td>{r.event_date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</td>
									<td>
										{r.time_text} · {r.location}
									</td>
									<td>
										<span className={`adm-pill adm-pill--${r.status}`}>{r.status === "draft" ? "Draft" : "Published"}</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="adm-empty">No events yet.</p>
			)}
		</main>
	);
}
