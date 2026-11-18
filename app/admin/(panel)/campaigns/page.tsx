import Link from "next/link";
import { db } from "@/lib/db";
import { naira } from "@/lib/settings";
import { Flash } from "../Flash";

type Row = { id: number; title: string; slug: string; goal: string; raised_offset: string; confirmed: string | null; pending: string | null; status: string };

const STATUS: Record<string, string> = { published: "Open", closed: "Closed", draft: "Draft" };

/** Donation campaigns (the GiveWP forms): progress bars on the home and Donations pages. */
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
	const sp = await searchParams;
	const rows = await db()<Row[]>`
		select c.id, c.title, c.slug, c.goal, c.raised_offset, c.status,
			(select sum(amount) from donations d where d.campaign_id = c.id and d.status = 'confirmed') as confirmed,
			(select sum(amount) from donations d where d.campaign_id = c.id and d.status = 'pending') as pending
		from campaigns c order by c.position, c.id`;
	return (
		<main className="adm-page">
			<header className="adm-head">
				<h1>Campaigns</h1>
				<Link className="btn" href="/admin/campaigns/new/">
					Add a campaign
				</Link>
			</header>
			<p className="adm-hint">
				Each campaign has a page at /donations/name/ with its donation form. “Raised” is the amount raised before this website plus every donation confirmed under{" "}
				<Link href="/admin/donations/">Donations</Link>. The home page shows the first three.
			</p>
			<Flash ok={sp.ok} error={sp.error} />
			<div className="adm-table-wrap">
				<table className="adm-table">
					<thead>
						<tr>
							<th scope="col">Campaign</th>
							<th scope="col">Raised</th>
							<th scope="col">Goal</th>
							<th scope="col">Pledged, not yet received</th>
							<th scope="col">Status</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => {
							const raised = Number(r.raised_offset) + Number(r.confirmed ?? 0);
							const goal = Number(r.goal);
							return (
								<tr key={r.id}>
									<td className="adm-table__title">
										<Link href={`/admin/campaigns/${r.id}/`}>{r.title}</Link>
										<span className="adm-table__slug">/donations/{r.slug}/</span>
									</td>
									<td>
										{naira(raised)}
										{goal > 0 && <span className="adm-hint"> ({Math.round((raised / goal) * 1000) / 10}%)</span>}
									</td>
									<td>{naira(goal)}</td>
									<td>{r.pending ? <Link href={`/admin/donations/?status=pending&campaign=${r.id}`}>{naira(Number(r.pending))}</Link> : "—"}</td>
									<td>
										<span className={`adm-pill adm-pill--${r.status === "published" ? "published" : "draft"}`}>{STATUS[r.status]}</span>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</main>
	);
}
