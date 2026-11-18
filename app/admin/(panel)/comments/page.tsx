import Link from "next/link";
import { formatAdminDate } from "@/lib/admin-format";
import { db } from "@/lib/db";
import { setCommentStatus } from "../charity-actions";
import { Flash } from "../Flash";

type Row = { id: number; name: string; email: string; website: string; body: string; status: string; created_at: Date; target_type: string; title: string | null; href: string | null };

const TABS = { pending: "Awaiting approval", approved: "Approved", spam: "Spam" } as const;

/** “Leave a Comment” on campaign pages: nothing shows on the site until approved here. */
export default async function CommentsPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; error?: string }> }) {
	const sp = await searchParams;
	const status = (sp.status && sp.status in TABS ? sp.status : "pending") as keyof typeof TABS;
	const sql = db();
	const [rows, counts] = await Promise.all([
		sql<Row[]>`
			select c.id, c.name, c.email, c.website, c.body, c.status, c.created_at, c.target_type,
				coalesce(k.title, p.title) as title,
				case when k.slug is not null then '/donations/' || k.slug || '/' when p.slug is not null then '/' || p.slug || '/' end as href
			from comments c
			left join campaigns k on c.target_type = 'campaign' and k.id = c.target_id
			left join posts p on c.target_type = 'post' and p.id = c.target_id
			where c.status = ${status} order by c.created_at desc limit 200`,
		sql<{ status: string; n: string }[]>`select status, count(*) as n from comments group by status`,
	]);
	const count = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)]));
	const back = `/admin/comments/?status=${status}`;
	const button = (id: number, to: string, label: string, danger = false) => (
		<form action={setCommentStatus}>
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="status" value={to} />
			<input type="hidden" name="back" value={back} />
			<button className={to === "approved" ? "btn" : `adm-link${danger ? " adm-link--danger" : ""}`} type="submit">
				{label}
			</button>
		</form>
	);
	return (
		<main className="adm-page">
			<header className="adm-head">
				<h1>Comments</h1>
			</header>
			<p className="adm-hint">Comments left on campaign pages. Each is emailed to you when it arrives, and appears on the site only after you approve it.</p>
			<Flash ok={sp.ok} error={sp.error} />
			<nav className="adm-seg" aria-label="Filter by status">
				{(Object.keys(TABS) as (keyof typeof TABS)[]).map((s) => (
					<Link key={s} href={`/admin/comments/?status=${s}`} aria-current={s === status ? "page" : undefined}>
						{TABS[s]} <span className="adm-tally">{count[s] ?? 0}</span>
					</Link>
				))}
			</nav>
			{rows.length ? (
				<ul className="adm-cards">
					{rows.map((c) => (
						<li key={c.id} className="adm-box adm-stack">
							<p className="adm-hint">
								<strong>{c.name}</strong> · <a href={`mailto:${c.email}`}>{c.email}</a>
								{c.website && <> · {c.website}</>} · {formatAdminDate(c.created_at)} · on{" "}
								{c.href ? (
									<a href={c.href} target="_blank" rel="noopener">
										{c.title}
									</a>
								) : (
									"a page that no longer exists"
								)}
							</p>
							<p style={{ whiteSpace: "pre-wrap" }}>{c.body}</p>
							<div className="adm-actions">
								{c.status !== "approved" && button(c.id, "approved", "Approve")}
								{c.status === "approved" && button(c.id, "pending", "Unapprove")}
								{c.status !== "spam" && button(c.id, "spam", "Spam")}
								{button(c.id, "delete", "Delete", true)}
							</div>
						</li>
					))}
				</ul>
			) : (
				<p className="adm-empty">Nothing here.</p>
			)}
		</main>
	);
}
