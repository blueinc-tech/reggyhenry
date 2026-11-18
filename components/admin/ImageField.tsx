"use client";

import { useState } from "react";
import { MediaPicker } from "./MediaPicker";

/** A picture chosen from (or uploaded to) Media; submits its media id under `name`. */
export function ImageField({ name, label, initial, hint }: { name: string; label: string; initial: { id: number; url: string } | null; hint?: string }) {
	const [picked, setPicked] = useState(initial);
	const [open, setOpen] = useState(false);
	return (
		<div className="adm-field">
			<span className="adm-label">{label}</span>
			<input type="hidden" name={name} value={picked?.id ?? ""} />
			{picked ? (
				<figure className="adm-featured adm-featured--whole">
					{/* eslint-disable-next-line @next/next/no-img-element -- admin preview of a chosen file */}
					<img src={picked.url} alt="" />
				</figure>
			) : (
				<p className="adm-hint">No picture chosen.</p>
			)}
			{hint && <p className="adm-hint">{hint}</p>}
			<div className="adm-actions">
				<button type="button" className="btn btn--ghost" onClick={() => setOpen(true)}>
					{picked ? "Replace picture" : "Choose picture"}
				</button>
				{picked && (
					<button type="button" className="adm-link adm-link--danger" onClick={() => setPicked(null)}>
						Remove picture
					</button>
				)}
			</div>
			<MediaPicker
				open={open}
				onClose={() => setOpen(false)}
				onPick={(m) => {
					setPicked({ id: m.id, url: m.url });
					setOpen(false);
				}}
			/>
		</div>
	);
}
