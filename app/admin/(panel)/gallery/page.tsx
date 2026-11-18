import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { ImageField } from "@/components/admin/ImageField";
import { db } from "@/lib/db";
import { addGalleryItem, deleteGalleryItem, moveGalleryItem, saveGalleryItem } from "../charity-actions";
import { Flash } from "../Flash";

type Row = { id: number; title: string; subtitle: string; url: string };

/** The Gallery page's pictures, in order. */
export default async function GalleryAdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
	const sp = await searchParams;
	const rows = await db()<Row[]>`select g.id, g.title, g.subtitle, m.url from gallery_items g join media m on m.id = g.media_id order by g.position, g.id`;
	return (
		<main className="adm-page">
			<header className="adm-head">
				<h1>Gallery</h1>
				<a className="btn btn--ghost" href="/gallery/" target="_blank" rel="noopener">
					View on site ↗
				</a>
			</header>
			<p className="adm-hint">The pictures on the Gallery page (/gallery/), in this order. Each opens full size when clicked on the site.</p>
			<Flash ok={sp.ok} error={sp.error} />
			<details className="adm-box">
				<summary>Add a picture</summary>
				<form action={addGalleryItem} className="adm-stack">
					<ImageField name="media_id" label="Picture" initial={null} hint="Pick one from Media or upload a new one. Landscape pictures fit best." />
					<div className="adm-field">
						<label htmlFor="g-new-title">Caption</label>
						<input id="g-new-title" name="title" maxLength={200} placeholder="e.g. Skill acquisition training in Kukwaba" />
					</div>
					<div className="adm-field">
						<label htmlFor="g-new-sub">Small line above the caption (optional)</label>
						<input id="g-new-sub" name="subtitle" maxLength={200} />
					</div>
					<fieldset className="adm-field">
						<legend className="adm-label">Where</legend>
						<label className="adm-check">
							<input type="radio" name="where" value="start" defaultChecked /> First
						</label>
						<label className="adm-check">
							<input type="radio" name="where" value="end" /> Last
						</label>
					</fieldset>
					<button className="btn" type="submit">
						Add to gallery
					</button>
				</form>
			</details>
			<ul className="adm-grid">
				{rows.map((g, i) => (
					<li key={g.id} id={`g${g.id}`} className="adm-media">
						{/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
						<img className="adm-media__img" src={g.url} alt="" loading="lazy" />
						<div className="adm-media__meta adm-stack">
							<p>
								<strong>{g.title || "No caption"}</strong>
							</p>
							<div className="adm-actions">
								<form action={moveGalleryItem}>
									<input type="hidden" name="id" value={g.id} />
									<input type="hidden" name="dir" value="up" />
									<button className="adm-link" type="submit" disabled={i === 0} aria-label={`Move “${g.title}” earlier`}>
										↑ Earlier
									</button>
								</form>
								<form action={moveGalleryItem}>
									<input type="hidden" name="id" value={g.id} />
									<input type="hidden" name="dir" value="down" />
									<button className="adm-link" type="submit" disabled={i === rows.length - 1} aria-label={`Move “${g.title}” later`}>
										↓ Later
									</button>
								</form>
							</div>
							<details className="adm-inline-edit">
								<summary>Edit</summary>
								<form action={saveGalleryItem} className="adm-stack">
									<input type="hidden" name="id" value={g.id} />
									<div className="adm-field">
										<label htmlFor={`g${g.id}-t`}>Caption</label>
										<input id={`g${g.id}-t`} name="title" defaultValue={g.title} maxLength={200} />
									</div>
									<div className="adm-field">
										<label htmlFor={`g${g.id}-s`}>Small line above</label>
										<input id={`g${g.id}-s`} name="subtitle" defaultValue={g.subtitle} maxLength={200} />
									</div>
									<button className="btn btn--ghost" type="submit">
										Save
									</button>
								</form>
								<form action={deleteGalleryItem}>
									<input type="hidden" name="id" value={g.id} />
									<ConfirmSubmit label="Remove from gallery" question="Remove this picture from the gallery?" confirmLabel="Yes, remove" />
								</form>
							</details>
						</div>
					</li>
				))}
			</ul>
		</main>
	);
}
