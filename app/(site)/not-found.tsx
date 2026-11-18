import { ThemePage } from "@/components/theme/ThemePage";
import { getSettings } from "@/lib/settings";
import { layout, T } from "@/lib/theme/render";

/** The theme's 404 page: the page header and the Oxpins error section. */
export default async function NotFound() {
	const settings = await getSettings();
	const main = `<section class="page-header">
<div class="page-header-bg">
</div>
<div class="container">
<div class="page-header__inner">
<h2>Page not found</h2>
</div>
</div>
</section>
<section class="error-page">
<div class="container">
<div class="row">
<div class="col-xl-12">
<div class="error-page__inner">
<div class="error-page__title-box">
<h2 class="error-page__title">404</h2>
</div>
<h3 class="error-page__tagline">Sorry we can't find that page!</h3>
<p class="error-page__text">The page you are looking for was never existed.</p>
<form class="error-page__form" action="/search/" method="get">
<div class="error-page__form-input">
<input type="search" placeholder="Search here" name="s" aria-label="Search">
<button type="submit"><i class="icon-magnifying-glass"></i></button>
</div>
</form>
<a href="/" class="thm-btn error-page__btn">back to home</a>
</div>
</div>
</div>
</div>
</section>`;
	const html = await layout(main, { path: "/404/", settings });
	return <ThemePage html={html} bodyClass={T.singles.archive.bodyClass.replace(/\barchive category[^ ]* category-[^ ]* category-\d+/, "error404")} />;
}
