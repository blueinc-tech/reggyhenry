"use client";

import { useRef } from "react";
import { ConfirmButton } from "./ConfirmButton";

/** A destructive submit button for a server-action form: asks on the page first, then sends the form. */
export function ConfirmSubmit({ label, question, confirmLabel }: { label: string; question: string; confirmLabel?: string }) {
	const anchor = useRef<HTMLSpanElement>(null);
	return (
		<span ref={anchor}>
			<ConfirmButton label={label} question={question} confirmLabel={confirmLabel} onConfirm={() => anchor.current?.closest("form")?.requestSubmit()} />
		</span>
	);
}
