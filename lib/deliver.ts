/** Stores a form message in the admin inbox and emails it, with a per-visitor limit. */
import "server-only";
import { CONTACT } from "@/lib/config";
import { db } from "@/lib/db";
import { FORMS, formatSubmission, MESSAGES, type FormKind, type FormValues } from "@/lib/forms";
import { sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";

// Best effort: limits one visitor to a few messages per window on each running server.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

export function tooMany(ip: string, max = MAX_PER_WINDOW): boolean {
	const now = Date.now();
	const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
	hits.push(now);
	recent.set(ip, hits);
	if (recent.size > 5000) recent.clear();
	return hits.length > max;
}

export const clientIp = (headers: Headers) => headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

/** Who receives alerts: Admin → Settings, else FORM_TO, else info@rhagfnig.org.ng (lib/mail.ts). */
export async function alertAddress(): Promise<string | undefined> {
	const { forms } = await getSettings();
	return forms.notifyTo || undefined;
}

/** Null when delivered (stored, emailed, or both); otherwise the message to show the visitor. */
export async function deliver(kind: FormKind, values: FormValues, ip: string): Promise<string | null> {
	if (tooMany(ip)) return `You’ve sent several messages in a short time. Please try again later, or email ${CONTACT.email}.`;
	const name = values["your-name"] ?? "";
	const email = values.email ?? "";
	let storedId: number | null = null;
	try {
		const [row] = await db()<{ id: number }[]>`insert into submissions (form, data) values (${kind}, ${db().json(values)}) returning id`;
		storedId = row.id;
	} catch (err) {
		console.error(`[form] ${kind} could not be stored`, err);
	}
	const { forms } = await getSettings();
	let emailed = false;
	try {
		const subject = `${FORMS[kind].subject}: ${name.replace(/\s+/g, " ")}`;
		await sendMail({ subject, text: formatSubmission(FORMS[kind], values), replyTo: email, ...(forms.notifyTo && { to: forms.notifyTo }) });
		emailed = true;
		if (storedId) await db()`update submissions set email_sent = true where id = ${storedId}`;
	} catch (err) {
		console.error(`[form] ${kind} could not be emailed`, err);
	}
	if (forms.autoReply.enabled && email) {
		try {
			await sendMail({
				to: email,
				replyTo: forms.notifyTo || CONTACT.email,
				subject: forms.autoReply.subject,
				text: forms.autoReply.body.replace(/\{name\}/g, name.split(/\s+/)[0] || "there"),
			});
		} catch (err) {
			console.error("[form] automatic reply not sent", err);
		}
	}
	return storedId || emailed ? null : MESSAGES.failed;
}
