import { IS_PUBLIC_SITE } from "@/lib/config";
import { getSettings, GOOGLE_TAG } from "@/lib/settings";
import { T } from "@/lib/theme/render";

/**
 * A public page in the original theme's markup. The body classes drive the theme's
 * styles, so they are set before anything is painted. The theme's own scripts
 * (jQuery and its plugins) follow in the order WordPress printed them, as plain
 * deferred scripts, then public/legacy/rhagf.js, which starts the theme's widgets
 * and sends the forms to this site.
 */
export async function ThemePage({ html, bodyClass, schema }: { html: string; bodyClass: string; schema?: object }) {
	const { analytics } = await getSettings();
	const early = `document.body.className=${JSON.stringify(bodyClass)};`;
	const tag = IS_PUBLIC_SITE && GOOGLE_TAG.test(analytics.googleTagId) ? analytics.googleTagId : null;
	return (
		<>
			<script dangerouslySetInnerHTML={{ __html: early }} />
			{schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />}
			{/* The theme's scripts change this markup before React attaches (carousels, lazy images); React leaves it as it is. */}
			<div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: html }} suppressHydrationWarning />
			<script dangerouslySetInnerHTML={{ __html: T.inline }} />
			{T.scripts.map((src) => (
				<script key={src} src={src} defer />
			))}
			<script src="/legacy/rhagf.js" defer />
			{tag && (
				<>
					<script src={`https://www.googletagmanager.com/gtag/js?id=${tag}`} async />
					<script
						dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config",${JSON.stringify(tag)});` }}
					/>
				</>
			)}
		</>
	);
}
