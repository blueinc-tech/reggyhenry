"use client";

import { useState } from "react";
import { RichEditor } from "./RichEditor";

/** A formatted-text field (headings, lists, links, pictures) that submits its HTML under `name`. */
export function HtmlField({ name, label, initial, hint }: { name: string; label: string; initial: string; hint?: string }) {
	const [html, setHtml] = useState(initial);
	const id = `f-${name}`;
	return (
		<div className="adm-field">
			<span className="adm-label" id={`${id}-label`}>
				{label}
			</span>
			{hint && <p className="adm-hint">{hint}</p>}
			<input type="hidden" name={name} value={html} />
			<RichEditor id={id} initialHtml={initial} onChange={setHtml} labelledBy={`${id}-label`} />
		</div>
	);
}
