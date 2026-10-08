# Social images

The website uses `@santi020k/og` 1.2.0 with a project-owned preset configuration.
Run `pnpm run generate:og`, `pnpm run check:og`, and `pnpm run audit:og` from this
app directory. The build generates cards before Astro and audits the final HTML
before packaging or deployment.

Each route selects its image from `public/og/manifest.json`, preserving its content
fingerprint in Open Graph and X metadata. Commit the generated images, route
manifest, and `.og-cache.json` together. A content or renderer change gives social
clients a new image URL; repeated generation keeps the URL stable.

Brand, copy, output names, and route discovery remain in `og.config.mjs`. Keep
historical image paths available as aliases when external links may use them.

Local development follows the workspace runtime: Node.js 22.19 or newer and the
repository-declared pnpm version. PNG and SVG historical URLs remain generated.
