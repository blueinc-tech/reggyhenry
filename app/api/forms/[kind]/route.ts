import { NextResponse, type NextRequest } from "next/server";
import { clientIp, deliver } from "@/lib/deliver";
import { FORMS, MESSAGES, validateForm, type FormKind, type FormValues } from "@/lib/forms";
import { getSettings } from "@/lib/settings";

/**
 * Receives the Contact and Become a Volunteer forms, which keep the old Contact
 * Form 7 markup and field names. public/legacy/rhagf.js sends them here and shows
 * the reply in the form's own message box, as Contact Form 7 did. Without
 * JavaScript the browser posts here directly and is sent back to the page.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
	const { kind } = await params;
	if (!(kind in FORMS)) return NextResponse.json({ status: "error", message: "Not found" }, { status: 404 });
	const def = FORMS[kind as FormKind];
	const form = await request.formData();
	const wantsJson = request.headers.get("accept")?.includes("application/json");

	const reply = (status: "mail_sent" | "validation_failed" | "mail_failed", message: string, invalid: Record<string, string> = {}) => {
		if (wantsJson) return NextResponse.json({ status, message, invalid_fields: Object.entries(invalid).map(([field, message]) => ({ field, message })) });
		const referer = request.headers.get("referer");
		const back = new URL(referer && new URL(referer).host === request.nextUrl.host ? referer : "/", request.nextUrl);
		back.search = "";
		back.searchParams.set(status === "mail_sent" ? "sent" : "error", status === "mail_sent" ? "1" : message);
		return NextResponse.redirect(back, 303);
	};

	// Hidden field that people never see; bots that fill it get a quiet "success".
	const { forms } = await getSettings();
	const success = kind === "volunteer" ? forms.volunteerConfirmation : forms.contactConfirmation;
	if (String(form.get("website") ?? "")) return reply("mail_sent", success);

	const input: FormValues = {};
	for (const f of def.fields) input[f.name] = String(form.get(f.name) ?? "").slice(0, 5000);
	const { values, errors } = validateForm(def, input);
	if (Object.keys(errors).length) return reply("validation_failed", MESSAGES.invalid, errors);

	const failed = await deliver(def.kind, values, clientIp(request.headers));
	return failed ? reply("mail_failed", failed) : reply("mail_sent", success);
}
