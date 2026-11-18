import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { alertAddress, clientIp, tooMany } from "@/lib/deliver";
import { validateComment } from "@/lib/forms";
import { sendMail } from "@/lib/mail";

/** "Leave a Comment" on campaign pages: held for approval (Admin → Comments), with an email alert. */
export async function POST(request: NextRequest) {
	const form = await request.formData();
	const input = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v).slice(0, 6000)]));
	const reply = (ok: boolean, message: string, status = ok ? 200 : 400) => NextResponse.json({ ok, message }, { status });
	const held = "Thank you. Your comment is awaiting moderation.";

	if (input.website) return reply(true, held);
	if (tooMany(`comment:${clientIp(request.headers)}`, 5)) return reply(false, "You’ve posted several comments in a short time. Please try again later.", 429);
	const type = input.target_type === "post" ? "post" : input.target_type === "campaign" ? "campaign" : null;
	const id = Number(input.target_id);
	if (!type || !Number.isInteger(id)) return reply(false, "This page doesn’t take comments.");
	const [target] =
		type === "campaign"
			? await db()<{ title: string }[]>`select title from campaigns where id = ${id} and status <> 'draft'`
			: await db()<{ title: string }[]>`select title from posts where id = ${id} and status = 'published'`;
	if (!target) return reply(false, "This page doesn’t take comments.");

	const { value, error } = validateComment(input);
	if (!value) return reply(false, error ?? "Please check the form.");
	await db()`insert into comments (target_type, target_id, name, email, website, body) values (${type}, ${id}, ${value.name}, ${value.email}, ${value.website}, ${value.body})`;
	try {
		const to = await alertAddress();
		await sendMail({
			...(to && { to }),
			replyTo: value.email,
			subject: `New comment awaiting approval: ${target.title}`,
			text: `${value.name} <${value.email}> wrote on “${target.title}”:\n\n${value.body}\n\nApprove or delete it in Admin → Comments.`,
		});
	} catch (err) {
		console.error("[comments] alert not sent", err);
	}
	return reply(true, held);
}
