import { T } from "@/lib/theme/render";

/** The original theme's stylesheets, in the order WordPress loaded them, then its inline settings and this site's few additions. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			{T.fonts.map((href) => (
				<link key={href} rel="stylesheet" href={href.startsWith("//") ? `https:${href}` : href} precedence="theme" />
			))}
			{T.css.map((href) => (
				<link key={href} rel="stylesheet" href={href} precedence="theme" />
			))}
			<style href="theme-inline" precedence="theme-inline">
				{T.headStyles}
			</style>
			{/* eslint-disable-next-line @next/next/no-css-tags -- this site's few additions, loaded after the theme's own stylesheets */}
			<link rel="stylesheet" href="/legacy/rhagf.css" precedence="theme-site" />
			{children}
		</>
	);
}
