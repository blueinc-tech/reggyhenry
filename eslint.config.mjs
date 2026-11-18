import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
	...nextVitals,
	...nextTs,
	// The old theme's files (jQuery, its plugins, WordPress scripts) served as they are, and the saved pages they came from.
	{ ignores: [".next/**", "node_modules/**", "next-env.d.ts", "public/legacy/wp-content/**", "public/legacy/wp-includes/**", "theme-source/**"] },
];

export default config;
