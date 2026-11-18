"use server";

/** Admin → Settings. Administrators only; each section saves separately and refreshes the public site. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { GOOGLE_TAG, safeHref, type SettingKey } from "@/lib/site-settings";

const str = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);
const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const back = (kind: "ok" | "error", message: string, section: string): never => redirect(`/admin/settings/?${kind}=${encodeURIComponent(message)}#${section}`);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LABELS: Record<SettingKey, string> = {
	contact: "Contact details",
	social: "Social links",
	donations: "Donation settings",
	forms: "Form settings",
	analytics: "Analytics",
};

export async function saveSettings(form: FormData): Promise<void> {
	const user = await requireUser("admin");
	const section = str(form, "section", 20) as SettingKey;
	let value: unknown;

	switch (section) {
		case "contact": {
			const email = str(form, "email", 200);
			if (!EMAIL.test(email)) back("error", "The email address doesn’t look right.", section);
			value = { phone: str(form, "phone", 40), email, addressLine1: str(form, "addressLine1", 120), addressLine2: str(form, "addressLine2", 120) };
			break;
		}
		case "social": {
			const links = Object.fromEntries(["facebook", "x", "linkedin", "instagram"].map((k) => [k, str(form, k, 300)]));
			for (const [k, v] of Object.entries(links)) if (v && !/^https?:\/\//.test(safeHref(v))) back("error", `The ${k} link must start with https://.`, section);
			value = links;
			break;
		}
		case "donations":
			value = {
				instructions: text(form, "instructions", 4000),
				bankName: str(form, "bankName", 120),
				accountName: str(form, "accountName", 160),
				accountNumber: str(form, "accountNumber", 40),
				receiptSubject: str(form, "receiptSubject", 200),
				receiptBody: text(form, "receiptBody", 6000),
			};
			if (!(value as { instructions: string }).instructions) back("error", "Enter the payment instructions donors should follow.", section);
			break;
		case "forms": {
			const notifyTo = str(form, "notifyTo", 200);
			if (notifyTo && !EMAIL.test(notifyTo)) back("error", "The alert address doesn’t look right.", section);
			value = {
				notifyTo,
				contactConfirmation: str(form, "contactConfirmation", 300),
				volunteerConfirmation: str(form, "volunteerConfirmation", 300),
				autoReply: { enabled: form.get("autoReplyEnabled") === "on", subject: str(form, "autoReplySubject", 200), body: text(form, "autoReplyBody", 4000) },
			};
			break;
		}
		case "analytics": {
			const googleTagId = str(form, "googleTagId", 30).toUpperCase();
			if (googleTagId && !GOOGLE_TAG.test(googleTagId)) back("error", "The Google tag id looks like G-XXXXXXX or GT-XXXXXXX.", section);
			value = { googleTagId };
			break;
		}
		default:
			back("error", "Unknown settings section.", "contact");
	}

	await db()`
		insert into settings (key, value, updated_at, updated_by) values (${section}, ${db().json(value as never)}, now(), ${user.id})
		on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
	await logActivity(user, "Changed settings", LABELS[section] ?? section);
	revalidatePath("/", "layout");
	back("ok", `${LABELS[section]} saved.`, section);
}

/** Puts one section back to the values the WordPress site used. */
export async function resetSettings(form: FormData): Promise<void> {
	const user = await requireUser("admin");
	const section = str(form, "section", 20) as SettingKey;
	if (!LABELS[section]) back("error", "Unknown settings section.", "contact");
	await db()`delete from settings where key = ${section}`;
	await logActivity(user, "Reset settings", LABELS[section]);
	revalidatePath("/", "layout");
	back("ok", `${LABELS[section]} reset to the original.`, section);
}
