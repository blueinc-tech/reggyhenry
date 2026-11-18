"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
	{ href: "/admin/", label: "Dashboard", exact: true },
	{ href: "/admin/donations/", label: "Donations" },
	{ href: "/admin/campaigns/", label: "Campaigns" },
	{ href: "/admin/events/", label: "Events" },
	{ href: "/admin/posts/", label: "News articles" },
	{ href: "/admin/gallery/", label: "Gallery" },
	{ href: "/admin/volunteers/", label: "Volunteers" },
	{ href: "/admin/media/", label: "Media" },
	{ href: "/admin/topics/", label: "Categories & tags" },
	{ href: "/admin/authors/", label: "Authors" },
	{ href: "/admin/messages/", label: "Messages" },
	{ href: "/admin/comments/", label: "Comments" },
];

export function AdminNav({ isAdmin, unread, pending }: { isAdmin: boolean; unread: number; pending: { donations: number; comments: number } }) {
	const path = usePathname();
	const items = isAdmin ? [...ITEMS, { href: "/admin/users/", label: "Users" }, { href: "/admin/settings/", label: "Settings" }] : ITEMS;
	return (
		<nav aria-label="Admin">
			<ul className="adm-nav">
				{items.map((item) => {
					const current = "exact" in item ? path === item.href : path.startsWith(item.href);
					return (
						<li key={item.href}>
							<Link href={item.href} aria-current={current ? "page" : undefined}>
								{item.label}
								{item.href === "/admin/messages/" && unread > 0 && (
									<span className="adm-badge">
										{unread}
										<span className="screen-reader-text"> unread</span>
									</span>
								)}
								{item.href === "/admin/donations/" && pending.donations > 0 && (
									<span className="adm-badge">
										{pending.donations}
										<span className="screen-reader-text"> awaiting payment</span>
									</span>
								)}
								{item.href === "/admin/comments/" && pending.comments > 0 && (
									<span className="adm-badge">
										{pending.comments}
										<span className="screen-reader-text"> awaiting approval</span>
									</span>
								)}
							</Link>
						</li>
					);
				})}
				<li>
					<a href="/" target="_blank" rel="noopener">
						View site <span aria-hidden="true">↗</span>
						<span className="screen-reader-text"> (opens in a new tab)</span>
					</a>
				</li>
			</ul>
		</nav>
	);
}
