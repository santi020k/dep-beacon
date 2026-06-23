import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(root, 'apps/docs/public')
const ogDir = resolve(publicDir, 'og')
const siteUrl = 'https://beacon.santi020k.com'
const siteHost = new URL(siteUrl).host

const escapeXml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const logoMark = (x, y, scale = 1) => `
  <g transform="translate(${x} ${y}) scale(${scale})">
    <rect width="32" height="32" rx="8" fill="#111827"/>
    <path d="M16 6.2 9.2 21.6h13.6L16 6.2Z" fill="#1f2a44"/>
    <path d="M16 6.2 9.2 21.6M16 6.2l6.8 15.4M9.2 21.6h13.6M16 14.4l-6.8 7.2M16 14.4l6.8 7.2" fill="none" stroke="#7dd3fc" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
    <circle cx="16" cy="6.2" r="3.1" fill="#f8c65c"/>
    <circle cx="16" cy="14.4" r="2.4" fill="#f8fafc"/>
    <circle cx="9.2" cy="21.6" r="3" fill="#34d399"/>
    <circle cx="22.8" cy="21.6" r="3" fill="#fb7185"/>
  </g>
`

const ogCards = [
  {
    accent: '#7dd3fc',
    eyebrow: 'VS Code extension',
    file: 'home',
    subtitle: 'Inline npm version, pnpm catalog, and OSV security signals.',
    title: 'Dep Beacon',
  },
  {
    accent: '#5bd67b',
    eyebrow: 'User docs',
    file: 'docs',
    subtitle: 'Understand status colors, update actions, catalogs, and settings.',
    title: 'Dep Beacon Docs',
  },
  {
    accent: '#f2c14e',
    eyebrow: 'Install',
    file: 'install',
    subtitle: 'Add dependency intelligence to VS Code from the marketplace.',
    title: 'Install Dep Beacon',
  },
  {
    accent: '#75a7ff',
    eyebrow: 'Editor workflow',
    file: 'extension',
    subtitle: 'CodeLens update paths, diagnostics, sorting, and cache controls.',
    title: 'VS Code Extension',
  },
  {
    accent: '#3dd6b3',
    eyebrow: 'pnpm workspaces',
    file: 'pnpm-workspaces',
    subtitle: 'Resolve default and named catalogs before checking versions.',
    title: 'Catalog-aware Signals',
  },
  {
    accent: '#f05d5e',
    eyebrow: 'OSV security',
    file: 'security',
    subtitle: 'Spot low, medium, high, and critical advisory risk in manifests.',
    title: 'Security Signals',
  },
  {
    accent: '#f59e4c',
    eyebrow: 'Settings',
    file: 'configuration',
    subtitle: 'Tune registry, prerelease, vulnerability, cache, and install behavior.',
    title: 'Configuration',
  },
]

const socialCardSvg = ({ accent, eyebrow, subtitle, title }) => `\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(title)} social card">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0b1115"/>
      <stop offset="0.48" stop-color="#111820"/>
      <stop offset="1" stop-color="#17130f"/>
    </linearGradient>
    <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0H0v44" fill="none" stroke="#24343b" stroke-opacity="0.55"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)" opacity="0.48"/>
  <path d="M64 476c162-72 310-74 444-6 142 72 300 70 474-8 62-28 112-45 154-51v155H64Z" fill="${accent}" opacity="0.12"/>
  <rect x="64" y="64" width="1072" height="502" rx="26" fill="#101820" fill-opacity="0.82" stroke="#2b424a" stroke-width="2"/>
  <rect x="90" y="90" width="1020" height="450" rx="18" fill="#0b1115" fill-opacity="0.44" stroke="#20343d"/>
  ${logoMark(104, 112, 3)}
  <text x="238" y="154" fill="${accent}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="850" letter-spacing="0">${escapeXml(eyebrow)}</text>
  <text x="104" y="318" fill="#f4fbf8" font-family="Inter, Arial, sans-serif" font-size="78" font-weight="850" letter-spacing="0">${escapeXml(title)}</text>
  <text x="108" y="382" fill="#b7c9c5" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="500" letter-spacing="0">${escapeXml(subtitle)}</text>
  <g font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="0">
    <rect x="104" y="446" width="154" height="48" rx="8" fill="#102f26" stroke="#5bd67b"/>
    <text x="128" y="478" fill="#5bd67b">up to date</text>
    <rect x="278" y="446" width="188" height="48" rx="8" fill="#302913" stroke="#f2c14e"/>
    <text x="302" y="478" fill="#f2c14e">update ready</text>
    <rect x="486" y="446" width="182" height="48" rx="8" fill="#321b1c" stroke="#f05d5e"/>
    <text x="510" y="478" fill="#f05d5e">security risk</text>
  </g>
  <text x="896" y="505" fill="#78908c" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="0">${escapeXml(siteHost)}</text>
</svg>
`

const heroPreviewSvg = `\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-label="Dep Beacon VS Code preview">
  <defs>
    <linearGradient id="heroBg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0b1115"/>
      <stop offset="0.58" stop-color="#121820"/>
      <stop offset="1" stop-color="#17140f"/>
    </linearGradient>
    <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
      <path d="M56 0H0v56" fill="none" stroke="#253942" stroke-opacity="0.48"/>
    </pattern>
  </defs>
  <rect width="1600" height="900" fill="url(#heroBg)"/>
  <rect width="1600" height="900" fill="url(#grid)" opacity="0.52"/>
  <path d="M0 686c216-95 413-99 591-10 190 94 402 89 636-14 145-64 269-90 373-78v316H0Z" fill="#7dd3fc" opacity="0.1"/>
  <rect x="126" y="96" width="1348" height="706" rx="18" fill="#101820" fill-opacity="0.92" stroke="#27414a" stroke-width="2"/>
  <rect x="126" y="96" width="1348" height="54" rx="18" fill="#142027"/>
  <circle cx="166" cy="123" r="8" fill="#f05d5e"/>
  <circle cx="192" cy="123" r="8" fill="#f2c14e"/>
  <circle cx="218" cy="123" r="8" fill="#5bd67b"/>
  <text x="264" y="132" fill="#b7c9c5" font-family="SFMono-Regular, Consolas, monospace" font-size="18">package.json</text>
  <rect x="166" y="190" width="606" height="570" rx="8" fill="#0b1115" stroke="#27414a"/>
  <rect x="812" y="190" width="622" height="570" rx="8" fill="#0f171d" stroke="#27414a"/>
  <g font-family="SFMono-Regular, Consolas, monospace" font-size="22">
    <text x="202" y="238" fill="#78908c">1</text>
    <text x="246" y="238" fill="#b7c9c5">{</text>
    <text x="202" y="280" fill="#78908c">2</text>
    <text x="246" y="280" fill="#75a7ff">"dependencies"</text>
    <text x="418" y="280" fill="#b7c9c5">: {</text>
    <text x="202" y="322" fill="#78908c">3</text>
    <text x="284" y="322" fill="#75a7ff">"astro"</text>
    <text x="386" y="322" fill="#b7c9c5">:</text>
    <text x="414" y="322" fill="#f2c14e">"^6.4.0"</text>
    <text x="202" y="364" fill="#78908c">4</text>
    <text x="284" y="364" fill="#75a7ff">"react"</text>
    <text x="386" y="364" fill="#b7c9c5">:</text>
    <text x="414" y="364" fill="#f2c14e">"catalog:react19"</text>
    <text x="202" y="406" fill="#78908c">5</text>
    <text x="284" y="406" fill="#75a7ff">"left-pad"</text>
    <text x="426" y="406" fill="#b7c9c5">:</text>
    <text x="454" y="406" fill="#f2c14e">"1.1.0"</text>
    <text x="202" y="448" fill="#78908c">6</text>
    <text x="246" y="448" fill="#b7c9c5">}</text>
    <text x="202" y="490" fill="#78908c">7</text>
    <text x="246" y="490" fill="#b7c9c5">}</text>
  </g>
  <g font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" letter-spacing="0">
    <rect x="838" y="238" width="224" height="44" rx="8" fill="#302913" stroke="#f2c14e"/>
    <text x="864" y="267" fill="#f2c14e">latest 7.0.0</text>
    <rect x="1078" y="238" width="178" height="44" rx="8" fill="#102f26" stroke="#5bd67b"/>
    <text x="1104" y="267" fill="#5bd67b">minor ^7</text>
    <rect x="838" y="304" width="338" height="44" rx="8" fill="#112a2a" stroke="#3dd6b3"/>
    <text x="864" y="333" fill="#3dd6b3">catalog resolves ^19.0.0</text>
    <rect x="838" y="370" width="356" height="44" rx="8" fill="#321b1c" stroke="#f05d5e"/>
    <text x="864" y="399" fill="#f05d5e">high vulnerability reported</text>
  </g>
  <g transform="translate(838 492)">
    <rect width="520" height="192" rx="10" fill="#101820" stroke="#27414a"/>
    <text x="28" y="46" fill="#f4fbf8" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="850" letter-spacing="0">Signals that stay in context</text>
    <text x="28" y="88" fill="#b7c9c5" font-family="Inter, Arial, sans-serif" font-size="20" letter-spacing="0">Pick patch, minor, major, or latest.</text>
    <text x="28" y="124" fill="#b7c9c5" font-family="Inter, Arial, sans-serif" font-size="20" letter-spacing="0">Respect pnpm catalogs before editing.</text>
    <text x="28" y="160" fill="#b7c9c5" font-family="Inter, Arial, sans-serif" font-size="20" letter-spacing="0">Separate update noise from risk.</text>
  </g>
</svg>
`

const writeTextFile = async (path, content) => {
  await mkdir(dirname(path), { recursive: true })

  await writeFile(path, content)
}

const render = async (input, output, options) => {
  await mkdir(dirname(output), { recursive: true })

  await sharp(input).resize(options).png().toFile(output)
}

const generatedSvgs = [
  [resolve(publicDir, 'hero-preview.svg'), heroPreviewSvg],
  [resolve(publicDir, 'social-card.svg'), socialCardSvg(ogCards[0])],
  ...ogCards.map((card) => [resolve(ogDir, `${card.file}.svg`), socialCardSvg(card)]),
]

await Promise.all(generatedSvgs.map(([path, content]) => writeTextFile(path, content)))

await Promise.all([
  render(
    resolve(root, 'packages/vscode-dep-beacon/resources/icon.svg'),
    resolve(root, 'packages/vscode-dep-beacon/resources/icon.png'),
    { height: 256, width: 256 },
  ),
  render(
    resolve(publicDir, 'hero-preview.svg'),
    resolve(publicDir, 'hero-preview.png'),
    { height: 900, width: 1600 },
  ),
  render(
    resolve(publicDir, 'social-card.svg'),
    resolve(publicDir, 'social-card.png'),
    { height: 630, width: 1200 },
  ),
  ...ogCards.map((card) =>
    render(resolve(ogDir, `${card.file}.svg`), resolve(ogDir, `${card.file}.png`), {
      height: 630,
      width: 1200,
    }),
  ),
])
