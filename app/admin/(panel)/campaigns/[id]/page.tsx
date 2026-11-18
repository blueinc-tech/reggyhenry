import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { HtmlField } from "@/components/admin/HtmlField";
import { ImageField } from "@/components/admin/ImageField";
import { db } from "@/lib/db";
import { naira } from "@/lib/settings";
import { deleteCampaign, saveCampaign } from "../../charity-actions";
import { Flash } from "../../Flash";

type Row = {
	id: number;
	title: string;
	slug: string;
	excerpt: string;
	content: string;
	goal: string;
	raised_offset: string;
	levels: string[];
	default_amount: string | null;
	minimum: string;
	image_media_id: number | null;
	img: string | null;
	status: string;
	position: number;
	confirmed: string | null;
};

const plain = (n: string | number | null) => (n === null ? "" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));

export default async function CampaignEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
	const [{ id }, sp] = await Promise.all([params, searchParams]);
	const isNew = id === "new";
	let c: Row | undefined;
	if (!isNew) {
		if (!/^\d+$/.test(id)) notFound();
		[c] = await db()<Row[]>`
			select c.*, m.url as img, (select sum(amount) from donations d where d.campaign_id = c.id and d.status = 'confirmed') as confirmed
			from campaigns c left join media m on m.id = c.image_media_id where c.id = ${Number(id)}`;
		if (!c) notFound();
	}
	return (
		<main className="adm-page">
			<p className="adm-crumb">
				<Link href="/admin/campaigns/">← Campaigns</Link>
			</p>
			<header className="adm-head">
				<h1>{isNew ? "Add a campaign" : c!.title}</h1>
				{c && c.status !== "draft" && (
					<a className="btn btn--ghost" href={`/donations/${c.slug}/`} target="_blank" rel="noopener">
						View on site ↗
					</a>
				)}
			</header>
			<Flash ok={sp.ok} error={sp.error} />
			<form action={saveCampaign} className="adm-edit">
				{c && <input type="hidden" name="id" value={c.id} />}
				<div className="adm-edit__main adm-stack">
					<div className="adm-field">
						<label htmlFor="title">Title</label>
						<input id="title" name="title" defaultValue={c?.title} required maxLength={200} />
					</div>
					<div className="adm-field">
						<label htmlFor="excerpt">Short description (optional)</label>
						<textarea id="excerpt" name="excerpt" rows={2} defaultValue={c?.excerpt} maxLength={500} />
						<p className="adm-hint">Shown on the campaign’s card above its progress bar.</p>
					</div>
					<HtmlField name="content" label="About this campaign (optional)" initial={c?.content ?? ""} hint="Shown on the campaign’s page above the donation form." />
				</div>
				<div className="adm-edit__side adm-stack">
					<div className="adm-box adm-stack">
						<div className="adm-field">
							<label htmlFor="status">Status</label>
							<select id="status" name="status" defaultValue={c?.status ?? "published"}>
								<option value="published">Open: taking donations</option>
								<option value="closed">Closed: shown, no donation form</option>
								<option value="draft">Draft: hidden</option>
							</select>
						</div>
						<button className="btn" type="submit">
							{isNew ? "Add campaign" : "Save"}
						</button>
					</div>
					<div className="adm-box adm-stack">
						<div className="adm-field">
							<label htmlFor="goal">Goal (₦)</label>
							<input id="goal" name="goal" inputMode="decimal" defaultValue={plain(c?.goal ?? null)} required placeholder="2,000,000" />
						</div>
						<div className="adm-field">
							<label htmlFor="raised_offset">Raised before this website (₦)</label>
							<input id="raised_offset" name="raised_offset" inputMode="decimal" defaultValue={plain(c?.raised_offset ?? "0")} />
							{c && (
								<p className="adm-hint">
									Plus {naira(Number(c.confirmed ?? 0))} confirmed here = {naira(Number(c.raised_offset) + Number(c.confirmed ?? 0))} shown as raised.
								</p>
							)}
						</div>
						<div className="adm-field">
							<label htmlFor="levels">Suggested amounts (₦)</label>
							<textarea id="levels" name="levels" rows={4} defaultValue={(c?.levels ?? ["5000", "10000", "25000", "50000", "100000"]).map(plain).join("\n")} />
							<p className="adm-hint">One per line. Shown as buttons on the donation form, with “Custom Amount”.</p>
						</div>
						<div className="adm-field">
							<label htmlFor="default_amount">Amount filled in at first (₦)</label>
							<input id="default_amount" name="default_amount" inputMode="decimal" defaultValue={plain(c?.default_amount ?? null)} placeholder="Optional" />
						</div>
						<div className="adm-field">
							<label htmlFor="minimum">Smallest donation accepted (₦)</label>
							<input id="minimum" name="minimum" inputMode="decimal" defaultValue={plain(c?.minimum ?? "1000")} />
						</div>
					</div>
					<div className="adm-box adm-stack">
						<ImageField name="image_media_id" label="Picture (optional)" initial={c?.image_media_id && c.img ? { id: c.image_media_id, url: c.img } : null} />
						<div className="adm-field">
							<label htmlFor="slug">Web address</label>
							<input id="slug" name="slug" defaultValue={c?.slug} placeholder="Made from the title if empty" maxLength={120} />
						</div>
						<div className="adm-field">
							<label htmlFor="position">Order</label>
							<input id="position" name="position" type="number" defaultValue={c?.position ?? 0} />
							<p className="adm-hint">Lower numbers come first.</p>
						</div>
					</div>
				</div>
			</form>
			{c && (
				<form action={deleteCampaign} className="adm-box adm-box--danger adm-stack">
					<input type="hidden" name="id" value={c.id} />
					<p>A campaign with donations can’t be deleted; close it instead.</p>
					<ConfirmSubmit label="Delete campaign" question={`Delete “${c.title}”?`} />
				</form>
			)}
		</main>
	);
}
