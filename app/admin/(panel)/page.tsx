import Link from "next/link";
import { formatAdminDate } from "@/lib/admin-format";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { naira } from "@/lib/settings";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
	const user = await requireUser();
	const sql = db();
	const [[counts], recent, drafts, messages, activity, pledges] = await Promise.all([
		sql<{ published: string; drafts: string; events: string; media: string; unread: string; pending: string; pending_total: string; received_total: string; comments: string }[]>`
			select
				(select count(*) from posts where type = 'post' and status = 'published' and published_at <= now()) as published,
				(select count(*) from posts where type = 'post' and status = 'draft') as drafts,
				(select count(*) from events where status = 'published') as events,
				(select count(*) from media) as media,
				(select count(*) from submissions where read_at is null) as unread,
				(select count(*) from donations where status = 'pending') as pending,
				(select coalesce(sum(amount), 0) from donations where status = 'pending') as pending_total,
				(select coalesce(sum(amount), 0) from donations where status = 'confirmed') as received_total,
				(select count(*) from comments where status = 'pending') as comments`,
		sql<{ id: number; title: string; published_at: Date }[]>`
			select id, title, published_at from posts where type = 'post' and status = 'published' order by published_at desc limit 6`,
		sql<{ id: number; title: string; modified_at: Date }[]>`
			select id, title, modified_at from posts where type = 'post' and status = 'draft' order by modified_at desc limit 6`,
		sql<{ id: number; form: string; data: Record<string, string>; created_at: Date }[]>`
			select id, form, data, created_at from submissions where read_at is null order by created_at desc limit 5`,
		sql<{ id: number; user_name: string; action: string; target: string; created_at: Date }[]>`
			select id, user_name, action, target, created_at from activity order by created_at desc limit 8`,
		sql<{ id: number; reference: string; first_name: string; last_name: string; amount: string; created_at: Date }[]>`
			select id, reference, first_name, last_name, amount, created_at from donations where status = 'pending' order by created_at desc limit 5`,
	]);
	const stats = [
		{ label: "Pledges awaiting payment", value: Number(counts.pending).toLocaleString("en-GB"), href: "/admin/donations/?status=pending" },
		{ label: "Pledged, not yet received", value: naira(Number(counts.pending_total)), href: "/admin/donations/?status=pending" },
		{ label: "Received through the site", value: naira(Number(counts.received_total)), href: "/admin/donations/?status=confirmed" },
		{ label: "Comments to approve", value: Number(counts.comments).toLocaleString("en-GB"), href: "/admin/comments/" },
		{ label: "Unread messages", value: Number(counts.unread).toLocaleString("en-GB"), href: "/admin/messages/?filter=unread" },
		{ label: "Published articles", value: Number(counts.published).toLocaleString("en-GB"), href: "/admin/posts/?status=published" },
		{ label: "Article drafts", value: Number(counts.drafts).toLocaleString("en-GB"), href: "/admin/posts/?status=draft" },
		{ label: "Events", value: Number(counts.events).toLocaleString("en-GB"), href: "/admin/events/" },
	];

	return (
		<main className="adm-page">
			<header className="adm-head">
				<h1>Welcome, {user.name.split(" ")[0]}</h1>
				<Link className="btn" href="/admin/posts/new/">
					Write an article
				</Link>
			</header>
			{(await searchParams).denied && (
				<p className="adm-alert adm-alert--error" role="alert">
					That screen is for administrators only.
				</p>
			)}
			<ul className="adm-stats">
				{stats.map((s) => (
					<li key={s.label}>
						<Link href={s.href}>
							<strong>{s.value}</strong>
							<span>{s.label}</span>
						</Link>
					</li>
				))}
			</ul>
			<div className="adm-cols">
				<section className="adm-box" aria-labelledby="pledges-title">
					<h2 id="pledges-title">Pledges awaiting payment</h2>
					{pledges.length ? (
						<ul className="adm-list">
							{pledges.map((d) => (
								<li key={d.id}>
									<Link href={`/admin/donations/?status=pending#d${d.id}`}>
										{naira(Number(d.amount))} · {d.first_name} {d.last_name}
									</Link>
									<span>
										{d.reference} · {formatAdminDate(d.created_at)}
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="adm-hint">None waiting.</p>
					)}
				</section>
				<section className="adm-box" aria-labelledby="recent-title">
					<h2 id="recent-title">Recently published</h2>
					<ul className="adm-list">
						{recent.map((p) => (
							<li key={p.id}>
								<Link href={`/admin/posts/${p.id}/`}>{p.title}</Link>
								<span>{formatAdminDate(p.published_at)}</span>
							</li>
						))}
					</ul>
				</section>
				<section className="adm-box" aria-labelledby="drafts-title">
					<h2 id="drafts-title">Drafts</h2>
					{drafts.length ? (
						<ul className="adm-list">
							{drafts.map((p) => (
								<li key={p.id}>
									<Link href={`/admin/posts/${p.id}/`}>{p.title || "(untitled)"}</Link>
									<span>Edited {formatAdminDate(p.modified_at)}</span>
								</li>
							))}
						</ul>
					) : (
						<p className="adm-hint">No drafts.</p>
					)}
				</section>
				<section className="adm-box" aria-labelledby="msg-title">
					<h2 id="msg-title">New messages</h2>
					{messages.length ? (
						<ul className="adm-list">
							{messages.map((m) => (
								<li key={m.id}>
									<Link href="/admin/messages/?filter=unread">
										{m.data["your-name"] || m.data.email || "Someone"} — {m.form === "volunteer" ? "volunteer application" : "contact form"}
									</Link>
									<span>{formatAdminDate(m.created_at)}</span>
								</li>
							))}
						</ul>
					) : (
						<p className="adm-hint">You’re all caught up.</p>
					)}
				</section>
				<section className="adm-box" aria-labelledby="activity-title">
					<h2 id="activity-title">Recent activity</h2>
					{activity.length ? (
						<ul className="adm-list">
							{activity.map((a) => (
								<li key={a.id}>
									<span>
										<strong>{a.user_name}</strong> {a.action.toLowerCase()}
										{a.target && <> · {a.target}</>}
									</span>
									<span>{formatAdminDate(a.created_at)}</span>
								</li>
							))}
						</ul>
					) : (
						<p className="adm-hint">Changes made in the admin will be listed here.</p>
					)}
				</section>
			</div>
		</main>
	);
}
