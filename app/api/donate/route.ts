import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getCampaignById } from "@/lib/charity";
import { CONTACT } from "@/lib/config";
import { db } from "@/lib/db";
import { alertAddress, clientIp, tooMany } from "@/lib/deliver";
import { pledgeReference, validatePledge } from "@/lib/forms";
import { sendMail } from "@/lib/mail";
import { getSettings, naira, paymentText } from "@/lib/settings";

/**
 * A donation pledge from a campaign page or Donate Now. Payment is by bank
 * transfer, so the pledge is stored as pending, the donor gets the payment
 * instructions and a reference by email, the team gets an alert, and the donor
 * goes to the Donation Confirmation page. An administrator confirms it once the
 * money arrives (Admin → Donations), which adds it to the campaign's total.
 */
export async function POST(request: NextRequest) {
	const form = await request.formData();
	const input = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v).slice(0, 2000)]));
	const wantsJson = request.headers.get("accept")?.includes("application/json");
	const fail = (message: string, status = 400) => {
		if (wantsJson) return NextResponse.json({ ok: false, message }, { status });
		return NextResponse.redirect(new URL(`/donation-failed/`, request.nextUrl), 303);
	};

	// Hidden field people never see.
	if (input.website) return wantsJson ? NextResponse.json({ ok: true, redirect: "/donation-confirmation/" }) : NextResponse.redirect(new URL("/donation-confirmation/", request.nextUrl), 303);
	if (tooMany(`donate:${clientIp(request.headers)}`, 5)) return fail(`You’ve made several pledges in a short time. Please try again later, or email ${CONTACT.email}.`, 429);

	const campaign = input.campaign_id ? await getCampaignById(Number(input.campaign_id)) : null;
	if (input.campaign_id && (!campaign || campaign.status !== "published")) return fail("This campaign is not taking donations.");
	const { value, error } = validatePledge(input, campaign?.minimum ?? 1000);
	if (!value) return fail(error ?? "Please check the form.");

	let reference = "";
	for (let i = 0; i < 5 && !reference; i++) {
		const ref = pledgeReference();
		const rows = await db()<{ reference: string }[]>`
			insert into donations (reference, campaign_id, first_name, last_name, email, phone, amount, message)
			values (${ref}, ${campaign?.id ?? null}, ${value.firstName}, ${value.lastName}, ${value.email}, ${value.phone}, ${value.amount}, ${value.message})
			on conflict (reference) do nothing returning reference`;
		reference = rows[0]?.reference ?? "";
	}
	if (!reference) return fail("Sorry, your pledge couldn’t be saved just now. Please try again.", 500);

	const { donations } = await getSettings();
	const cause = campaign?.title ?? "the Regy & Henry Amazing Grace Foundation";
	const fill = (s: string) =>
		s
			.replace(/\{name\}/g, value.firstName)
			.replace(/\{amount\}/g, naira(value.amount))
			.replace(/\{reference\}/g, reference)
			.replace(/\{campaign\}/g, cause)
			.replace(/\{instructions\}/g, paymentText(donations));
	const to = await alertAddress();
	const results = await Promise.allSettled([
		sendMail({ to: value.email, replyTo: to || CONTACT.email, subject: fill(donations.receiptSubject), text: fill(donations.receiptBody) }),
		sendMail({
			...(to && { to }),
			replyTo: value.email,
			subject: `New donation pledge: ${naira(value.amount)} from ${value.firstName} ${value.lastName}`.trim(),
			text: [
				`Reference: ${reference}`,
				`Campaign: ${cause}`,
				`Amount: ${naira(value.amount)}`,
				`Name: ${value.firstName} ${value.lastName}`.trim(),
				`Email: ${value.email}`,
				value.phone ? `Phone: ${value.phone}` : null,
				value.message ? `Message: ${value.message}` : null,
				"",
				"Confirm it in Admin → Donations once the transfer arrives.",
			]
				.filter((l) => l !== null)
				.join("\n"),
		}),
	]);
	for (const r of results) if (r.status === "rejected") console.error("[donate] email not sent", r.reason);
	if (results[0].status === "fulfilled") await db()`update donations set email_sent = true where reference = ${reference}`;
	if (campaign) revalidatePath(campaign.href);

	const redirect = `/donation-confirmation/?ref=${reference}`;
	return wantsJson ? NextResponse.json({ ok: true, redirect }) : NextResponse.redirect(new URL(redirect, request.nextUrl), 303);
}
