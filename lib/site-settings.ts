/**
 * Site-wide settings edited under Admin → Settings, with the values the WordPress
 * site shows today as defaults, so an unedited setting changes nothing on the
 * public pages. No database access here, so tests can load it.
 */

export type SiteSettings = {
	/** Shown in the header, mobile menu and footer. */
	contact: { phone: string; email: string; addressLine1: string; addressLine2: string };
	/** Header, mobile menu and footer icons. */
	social: { facebook: string; x: string; linkedin: string; instagram: string };
	donations: {
		/** Shown on the donation forms and in the donor's email (blank lines separate paragraphs). */
		instructions: string;
		/** Account details shown with the instructions; leave blank to show none. */
		bankName: string;
		accountName: string;
		accountNumber: string;
		/** Sent to the donor after a pledge ({name}, {amount}, {reference}, {campaign}, {instructions} are replaced). */
		receiptSubject: string;
		receiptBody: string;
	};
	forms: {
		/** Where form, donation and comment alerts go; empty uses FORM_TO / info@rhagfnig.org.ng. */
		notifyTo: string;
		contactConfirmation: string;
		volunteerConfirmation: string;
		/** The automatic reply the Contact and Volunteer forms send ({name} is replaced). */
		autoReply: { enabled: boolean; subject: string; body: string };
	};
	/** Google tag (gtag.js) id from the old site's Site Kit; only loaded on the real domain. */
	analytics: { googleTagId: string };
};

export const DEFAULT_SETTINGS: SiteSettings = {
	contact: {
		phone: "+2348026748190",
		email: "info@rhagfnig.org.ng",
		addressLine1: "Suite B406 (b),",
		addressLine2: "3rd Floor, Global Plaza, Abuja",
	},
	// As linked in the theme header on the live site (placeholders the theme shipped with).
	social: { facebook: "http://facebook.com", x: "http://twitter.com", linkedin: "http://linkedin.com", instagram: "http://instagram.com" },
	// GiveWP's "Bank/Wire Transfer" (offline) gateway text on the live site.
	donations: {
		instructions:
			"To make a Bank/Wire Transfer toward this cause, follow these steps:\n\n1. Write a check payable to Regy&Henry Amazing Grace Foundation.\n2. On the memo line of the check, indicate that the donation is for Regy&Henry Amazing Grace Foundation.\n3. Mail your check to: info@rhagfnig.org.ng\n\nYour tax-deductible donation is greatly appreciated!",
		bankName: "",
		accountName: "",
		accountNumber: "",
		receiptSubject: "Thank you for your donation pledge ({reference})",
		receiptBody:
			"Dear {name},\n\nThank you for pledging {amount} to {campaign}. Your reference is {reference}.\n\nPlease complete your donation as described below and quote your reference. We will confirm by email once it arrives.\n\n{instructions}\n\nWith gratitude,\nRegy & Henry Amazing Grace Foundation",
	},
	forms: {
		notifyTo: "",
		// Contact Form 7's success message on the live site.
		contactConfirmation: "Thank you for your message. It has been sent.",
		volunteerConfirmation: "Thank you for your message. It has been sent.",
		autoReply: {
			enabled: true,
			subject: "We have received your message",
			body: "Hi {name},\n\nThank you for contacting the Regy & Henry Amazing Grace Foundation. We have received your message and will get back to you shortly.",
		},
	},
	analytics: { googleTagId: "GT-TNGPRJ9D" },
};

export type SettingKey = keyof SiteSettings;
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

/** Saved values over the defaults, key by key; anything missing keeps its default. */
export function mergeSettings(saved: { key: string; value: unknown }[]): SiteSettings {
	const settings = structuredClone(DEFAULT_SETTINGS);
	for (const { key, value } of saved) {
		if (!SETTING_KEYS.includes(key as SettingKey) || value == null || typeof value !== "object") continue;
		(settings as Record<string, unknown>)[key] = { ...(settings[key as SettingKey] as object), ...(value as object) };
	}
	return settings;
}

const SAFE_HREF = /^(\/|#|https?:\/\/|mailto:|tel:)/;

/** A link the site may print: a path, an anchor, a web address, email or phone. */
export const safeHref = (href: string) => (SAFE_HREF.test(href.trim()) ? href.trim().slice(0, 300) : "");

export const GOOGLE_TAG = /^(G|GT|AW)-[A-Z0-9]{4,16}$/;

/** "₦ 268,000.00", as GiveWP printed amounts. */
export const naira = (n: number) => `₦ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The offline-payment text, with the bank details (if any) after it. */
export function paymentText(d: SiteSettings["donations"]): string {
	const bank = [d.bankName && `Bank: ${d.bankName}`, d.accountName && `Account name: ${d.accountName}`, d.accountNumber && `Account number: ${d.accountNumber}`]
		.filter(Boolean)
		.join("\n");
	return bank ? `${d.instructions.trim()}\n\n${bank}` : d.instructions.trim();
}
