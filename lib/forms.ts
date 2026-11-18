/**
 * The site's forms, rebuilt from the Contact Form 7 forms on the live Contact and
 * Become a Volunteer pages (same field names, so the old markup posts unchanged),
 * plus the donation pledge and comment forms. Pure so the same rules run in
 * tests and on the server.
 */

export type FormKind = "contact" | "volunteer";

export type Field = {
	/** The field's name in the page markup (Contact Form 7's). */
	name: string;
	label: string;
	type: "text" | "email" | "tel" | "textarea";
	required: boolean;
	maxLength: number;
};

export type FormDef = { kind: FormKind; title: string; subject: string; fields: Field[] };

export const FORMS: Record<FormKind, FormDef> = {
	contact: {
		kind: "contact",
		title: "Contact form",
		subject: "Contact form",
		fields: [
			{ name: "your-name", label: "Name", type: "text", required: true, maxLength: 400 },
			{ name: "email", label: "Email", type: "email", required: true, maxLength: 400 },
			{ name: "Phone", label: "Phone", type: "tel", required: true, maxLength: 400 },
			{ name: "subject", label: "Subject", type: "text", required: true, maxLength: 400 },
			{ name: "textarea-421", label: "Message", type: "textarea", required: true, maxLength: 2000 },
		],
	},
	volunteer: {
		kind: "volunteer",
		title: "Volunteer application",
		subject: "Volunteer application",
		fields: [
			{ name: "your-name", label: "Name", type: "text", required: true, maxLength: 400 },
			{ name: "email", label: "Email", type: "email", required: true, maxLength: 400 },
			{ name: "Phone", label: "Phone", type: "tel", required: true, maxLength: 400 },
			{ name: "address", label: "Address", type: "text", required: true, maxLength: 400 },
			{ name: "date", label: "Date of birth", type: "text", required: true, maxLength: 400 },
			{ name: "occupation", label: "Occupation", type: "text", required: true, maxLength: 400 },
			{ name: "message", label: "Message", type: "textarea", required: true, maxLength: 2000 },
		],
	},
};

export type FormValues = Record<string, string>;
export type FormErrors = Record<string, string>;

export const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const PHONE = /^\+?[\d\s()-]+$/;

/** Contact Form 7's messages, so visitors see what they saw before. */
export const MESSAGES = {
	required: "Please fill out this field.",
	email: "Please enter an email address.",
	tel: "Please enter a telephone number.",
	tooLong: "This field has a too long input.",
	invalid: "One or more fields have an error. Please check and try again.",
	failed: "There was an error trying to send your message. Please try again later.",
};

/** Trims every field, drops anything not in the form, and returns messages keyed by field name. */
export function validateForm(def: FormDef, input: FormValues): { values: FormValues; errors: FormErrors } {
	const values: FormValues = {};
	for (const f of def.fields) values[f.name] = (input[f.name] ?? "").replace(/\r\n?/g, "\n").trim();
	const errors: FormErrors = {};
	for (const f of def.fields) {
		const v = values[f.name];
		if (!v) {
			if (f.required) errors[f.name] = MESSAGES.required;
		} else if (v.length > f.maxLength) errors[f.name] = MESSAGES.tooLong;
		else if (f.type === "email" && !EMAIL.test(v)) errors[f.name] = MESSAGES.email;
		else if (f.type === "tel" && (!PHONE.test(v) || v.replace(/\D/g, "").length < 7 || v.replace(/\D/g, "").length > 15)) errors[f.name] = MESSAGES.tel;
		else if (f.type !== "textarea" && /\n/.test(v)) errors[f.name] = MESSAGES.invalid;
	}
	return { values, errors };
}

/** Plain-text email body listing each answer under its label. */
export function formatSubmission(def: FormDef, values: FormValues): string {
	return def.fields
		.filter((f) => values[f.name])
		.map((f) => `${f.label}\n${values[f.name]}`)
		.join("\n\n");
}

/* ---------- Donation pledges ---------- */

export type PledgeInput = { campaignId: number | null; amount: number; firstName: string; lastName: string; email: string; phone: string; message: string };

/** "200,000.00" or "₦200000" → 200000; NaN when it isn't a number. */
export function parseAmount(raw: string): number {
	const clean = raw.replace(/[₦,\s]/g, "").replace(/^NGN/i, "");
	return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : NaN;
}

export function validatePledge(input: Record<string, string>, minimum: number, maximum = 999_999_999): { value?: PledgeInput; error?: string } {
	const amount = parseAmount(input.amount ?? "");
	const firstName = (input.first_name ?? "").trim();
	const email = (input.email ?? "").trim();
	if (!Number.isFinite(amount) || amount <= 0) return { error: "Please enter a valid donation amount." };
	if (amount < minimum) return { error: `The minimum donation is ₦${minimum.toLocaleString("en-US")}.` };
	if (amount > maximum) return { error: "That amount is larger than this form accepts. Please contact us directly." };
	if (!firstName) return { error: "Please enter your first name." };
	if (firstName.length > 100 || (input.last_name ?? "").length > 100) return { error: "Please shorten your name." };
	if (!EMAIL.test(email) || email.length > 200) return { error: "Please enter a valid email address." };
	const phone = (input.phone ?? "").trim();
	if (phone && (!PHONE.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.length > 30)) return { error: "Please enter a valid phone number." };
	const campaignId = Number(input.campaign_id);
	return {
		value: {
			campaignId: Number.isInteger(campaignId) && campaignId > 0 ? campaignId : null,
			amount: Math.round(amount * 100) / 100,
			firstName,
			lastName: (input.last_name ?? "").trim(),
			email,
			phone,
			message: (input.message ?? "").trim().slice(0, 1000),
		},
	};
}

/** A short reference donors quote with their transfer, e.g. RHAGF-7K3QX2. */
export function pledgeReference(random: () => number = Math.random): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let s = "";
	for (let i = 0; i < 6; i++) s += chars[Math.floor(random() * chars.length)];
	return `RHAGF-${s}`;
}

/* ---------- Comments ---------- */

export function validateComment(input: Record<string, string>): { value?: { name: string; email: string; website: string; body: string }; error?: string } {
	const name = (input.author ?? "").trim();
	const email = (input.email ?? "").trim();
	const website = (input.url ?? "").trim();
	const body = (input.comment ?? "").replace(/\r\n?/g, "\n").trim();
	if (!body) return { error: "Please type your comment text." };
	if (!name || !email) return { error: "Please fill the required fields (name, email)." };
	if (!EMAIL.test(email)) return { error: "Please enter a valid email address." };
	if (name.length > 100 || email.length > 200 || website.length > 200 || body.length > 5000) return { error: "Your comment is too long." };
	if (website && !/^https?:\/\/[^\s<>"]+$/i.test(website)) return { error: "Please enter a valid website address, or leave it blank." };
	return { value: { name, email, website, body } };
}
