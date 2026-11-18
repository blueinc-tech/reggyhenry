import Link from "next/link";
import { formatAdminDate } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { naira } from "@/lib/settings";
import { addDonation, saveDonationNotes, setDonationStatus } from "../charity-actions";
import { Flash } from "../Flash";

type SP = { status?: string; campaign?: string; q?: string; ok?: string; error?: string };
type Row = {
	id: number;
	reference: string;
	first_name: string;
	last_name: string;
	email: string;
	phone: string;
	amount: string;
	message: string;
	status: string;
	notes: string;
	email_sent: boolean;
	created_at: Date;
	confirmed_at: Date | null;
	campaign: string | null;
};

const STATUSES = { pending: "Awaiting payment", confirmed: "Received", cancelled: "Cancelled" } as const;

/** Pledges from the donation forms. Donors pay by bank transfer; mark each one received when the money arrives. */
export default async function DonationsPage({ searchParams }: { searchParams: Promise<SP> }) {
	const sp = await searchParams;
	const status = sp.status && sp.status in STATUSES ? sp.status : undefined;
	const campaign = Number(sp.campaign) || undefined;
	const q = sp.q?.trim().slice(0, 100) || undefined;
	const sql = db();
	const [rows, totals, campaigns] = await Promise.all([
		sql<Row[]>`
			select d.*, c.title as campaign from donations d left join campaigns c on c.id = d.campaign_id
			where true
			${status ? sql`and d.status = ${status}` : sql``}
			${campaign ? sql`and d.campaign_id = ${campaign}` : sql``}
			${q ? sql`and (d.reference ilike ${"%" + q + "%"} or d.email ilike ${"%" + q + "%"} or (d.first_name || ' ' || d.last_name) ilike ${"%" + q + "%"})` : sql``}
			order by d.created_at desc limit 300`,
		sql<{ status: string; n: string; total: string }[]>`select status, count(*) as n, sum(amount) as total from donations group by status`,
		sql<{ id: number; title: string }[]>`select id, title from campaigns order by position, id`,
	]);
	const t = Object.fromEntries(totals.map((r) => [r.status, r]));
	const here = `/admin/donations/?${new URLSearchParams(Object.entries({ status, campaign: campaign ? String(campaign) : undefined, q }).filter((e): e is [string, string] => Boolean(e[1])))}`;

	return (
		<main className="adm-page">
			<header className="adm-head">
				<h1>Donations</h1>
			</header>
			<p className="adm-hint">
				Every pledge made on the site. Donors are emailed the bank-transfer instructions and a reference. When the money arrives, mark the pledge <strong>Received</strong>: it is then added to the campaign’s total
				on the site, and you can send the donor a thank-you email.
			</p>
			<Flash ok={sp.ok} error={sp.error} />

			<ul className="adm-stats">
				{(Object.keys(STATUSES) as (keyof typeof STATUSES)[]).map((s) => (
					<li key={s}>
						<Link href={`/admin/donations/?status=${s}`}>
							<strong>{naira(Number(t[s]?.total ?? 0))}</strong>
							<span>
								{STATUSES[s]} ({Number(t[s]?.n ?? 0)})
							</span>
						</Link>
					</li>
				))}
			</ul>

			<form className="adm-filters" role="search" action="/admin/donations/">
				<div className="adm-field">
					<label htmlFor="dq">Search name, email or reference</label>
					<input id="dq" name="q" type="search" defaultValue={q ?? ""} />
				</div>
				<div className="adm-field">
					<label htmlFor="dstatus">Status</label>
					<select id="dstatus" name="status" defaultValue={status ?? ""}>
						<option value="">All</option>
						{Object.entries(STATUSES).map(([k, v]) => (
							<option key={k} value={k}>
								{v}
							</option>
						))}
					</select>
				</div>
				<div className="adm-field">
					<label htmlFor="dcampaign">Campaign</label>
					<select id="dcampaign" name="campaign" defaultValue={campaign ?? ""}>
						<option value="">All</option>
						{campaigns.map((c) => (
							<option key={c.id} value={c.id}>
								{c.title}
							</option>
						))}
					</select>
				</div>
				<button className="btn btn--ghost" type="submit">
					Filter
				</button>
			</form>

			{rows.length ? (
				<ul className="adm-cards">
					{rows.map((d) => (
						<li key={d.id} className="adm-box adm-stack" id={`d${d.id}`}>
							<div className="adm-row">
								<h2>
									{naira(Number(d.amount))} · {d.first_name} {d.last_name}
								</h2>
								<span className={`adm-pill adm-pill--${d.status === "confirmed" ? "published" : d.status === "pending" ? "scheduled" : "draft"}`}>
									{STATUSES[d.status as keyof typeof STATUSES]}
								</span>
							</div>
							<p className="adm-hint">
								{d.reference} · {d.campaign ?? "Where it is needed most"} · {formatAdminDate(d.created_at)}
								{d.confirmed_at && ` · received ${formatAdminDate(d.confirmed_at)}`}
							</p>
							<p>
								{d.email && <a href={`mailto:${d.email}?subject=${encodeURIComponent(`Your donation ${d.reference}`)}`}>{d.email}</a>}
								{d.phone && <> · <a href={`tel:${d.phone.replace(/[^\d+]/g, "")}`}>{d.phone}</a></>}
								{!d.email_sent && d.status === "pending" && <span className="adm-hint"> · instructions email not sent</span>}
							</p>
							{d.message && <blockquote>{d.message}</blockquote>}
							<div className="adm-actions">
								{d.status !== "confirmed" && (
									<form action={setDonationStatus} className="adm-actions">
										<input type="hidden" name="id" value={d.id} />
										<input type="hidden" name="status" value="confirmed" />
										<input type="hidden" name="back" value={`${here}#d${d.id}`} />
										<label className="adm-check">
											<input type="checkbox" name="notify" defaultChecked={Boolean(d.email)} /> Email the donor a thank-you
										</label>
										<button className="btn" type="submit">
											Mark received
										</button>
									</form>
								)}
								{d.status !== "cancelled" && (
									<form action={setDonationStatus}>
										<input type="hidden" name="id" value={d.id} />
										<input type="hidden" name="status" value="cancelled" />
										<input type="hidden" name="back" value={`${here}#d${d.id}`} />
										<button className="adm-link adm-link--danger" type="submit">
											{d.status === "confirmed" ? "Undo: not received" : "Cancel pledge"}
										</button>
									</form>
								)}
								{d.status === "cancelled" && (
									<form action={setDonationStatus}>
										<input type="hidden" name="id" value={d.id} />
										<input type="hidden" name="status" value="pending" />
										<input type="hidden" name="back" value={`${here}#d${d.id}`} />
										<button className="adm-link" type="submit">
											Restore as awaiting payment
										</button>
									</form>
								)}
							</div>
							<details className="adm-inline-edit">
								<summary>Notes{d.notes ? " (1)" : ""}</summary>
								<form action={saveDonationNotes} className="adm-stack">
									<input type="hidden" name="id" value={d.id} />
									<input type="hidden" name="back" value={`${here}#d${d.id}`} />
									<textarea name="notes" rows={3} defaultValue={d.notes} aria-label="Private notes" />
									<button className="btn btn--ghost" type="submit">
										Save notes
									</button>
								</form>
							</details>
						</li>
					))}
				</ul>
			) : (
				<p className="adm-empty">No donations{status || campaign || q ? " match these filters" : " yet"}.</p>
			)}

			<details className="adm-box">
				<summary>Record a donation received another way</summary>
				<form action={addDonation} className="adm-stack">
					<p className="adm-hint">For money that arrived without a pledge on the site (cash, a transfer). It counts as received straight away.</p>
					<div className="adm-cols">
						<div className="adm-field">
							<label htmlFor="na">Amount (₦)</label>
							<input id="na" name="amount" inputMode="decimal" required />
						</div>
						<div className="adm-field">
							<label htmlFor="nc">Campaign</label>
							<select id="nc" name="campaign_id" defaultValue="">
								<option value="">Where it is needed most</option>
								{campaigns.map((c) => (
									<option key={c.id} value={c.id}>
										{c.title}
									</option>
								))}
							</select>
						</div>
						<div className="adm-field">
							<label htmlFor="nf">First name</label>
							<input id="nf" name="first_name" placeholder="Anonymous" />
						</div>
						<div className="adm-field">
							<label htmlFor="nl">Last name</label>
							<input id="nl" name="last_name" />
						</div>
						<div className="adm-field">
							<label htmlFor="ne">Email</label>
							<input id="ne" name="email" type="email" />
						</div>
						<div className="adm-field">
							<label htmlFor="np">Phone</label>
							<input id="np" name="phone" />
						</div>
					</div>
					<div className="adm-field">
						<label htmlFor="nn">Notes</label>
						<textarea id="nn" name="notes" rows={2} />
					</div>
					<button className="btn" type="submit">
						Record donation
					</button>
				</form>
			</details>
		</main>
	);
}
