import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const USERNAME = process.env.GITHUB_PROFILE_USERNAME || "AliFozooni";
const SOURCE_URL = `https://github.com/users/${USERNAME}/contributions`;

const THEMES = {
  light: {
    background: "#ffffff",
    text: "#1f2328",
    muted: "#636c76",
    border: "#d0d7de",
    colors: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  },
  dark: {
    background: "#0d1117",
    text: "#e6edf3",
    muted: "#8d96a0",
    border: "#30363d",
    colors: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  },
};

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

export function fixedLevel(count) {
  if (count <= 0) return 0;
  if (count <= 4) return 1;
  if (count <= 9) return 2;
  if (count <= 14) return 3;
  return 4;
}

export function parseContributionHtml(html) {
  const days = [];
  const cellPattern = /(<td\b[^>]*ContributionCalendar-day[^>]*><\/td>)\s*<tool-tip\b[^>]*>([^<]*)<\/tool-tip>/g;

  for (const match of html.matchAll(cellPattern)) {
    const cell = match[1];
    const tooltip = match[2].trim();
    const date = cell.match(/data-date="([^"]+)"/)?.[1];
    const week = Number(cell.match(/data-ix="(\d+)"/)?.[1]);
    const countText = tooltip.match(/^(\d+) contributions?\b/)?.[1];
    const count = countText ? Number(countText) : 0;

    if (date && Number.isInteger(week)) {
      days.push({ date, week, count });
    }
  }

  if (days.length < 350) {
    throw new Error(`Expected a full contribution calendar; found only ${days.length} days.`);
  }

  return days;
}

function monthLabels(days) {
  const labels = [];
  const usedMonths = new Set();
  const chronological = [...days].sort((a, b) => a.date.localeCompare(b.date));

  for (const day of chronological) {
    const date = new Date(`${day.date}T00:00:00Z`);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    if (usedMonths.has(key)) continue;

    usedMonths.add(key);
    labels.push({
      week: day.week,
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
    });
  }

  return labels;
}

export function renderSvg(days, themeName = "light") {
  const theme = THEMES[themeName];
  if (!theme) throw new Error(`Unknown theme: ${themeName}`);

  const width = 800;
  const height = 164;
  const left = 37;
  const top = 49;
  const cell = 10;
  const pitch = 13;
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  const visibleDays = days.filter((day) => new Date(`${day.date}T00:00:00Z`) <= today);
  const total = visibleDays.reduce((sum, day) => sum + day.count, 0);
  const labels = monthLabels(visibleDays);

  const monthMarkup = labels.map(({ week, label }) => (
    `<text class="muted" x="${left + week * pitch}" y="39">${escapeXml(label)}</text>`
  )).join("\n");

  const cells = visibleDays.map((day) => {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    const x = left + day.week * pitch;
    const y = top + weekday * pitch;
    const level = fixedLevel(day.count);
    const noun = day.count === 1 ? "contribution" : "contributions";
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${theme.colors[level]}"><title>${day.count} ${noun} on ${escapeXml(day.date)}</title></rect>`;
  }).join("\n");

  const legendX = 641;
  const legendCells = theme.colors.map((color, index) => (
    `<rect x="${legendX + index * pitch}" y="145" width="${cell}" height="${cell}" rx="2" fill="${color}"><title>${["0", "1–4", "5–9", "10–14", "15+"][index]} contributions</title></rect>`
  )).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${total.toLocaleString("en-US")} contributions in the last year</title>
  <desc id="description">Contribution calendar with fixed color bands: 1 to 4, 5 to 9, 10 to 14, and 15 or more contributions.</desc>
  <style>
    text { font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: ${theme.text}; }
    .title { font-size: 14px; font-weight: 600; }
    .muted { fill: ${theme.muted}; }
  </style>
  <rect x="0.5" y="0.5" width="799" height="163" rx="6" fill="${theme.background}" stroke="${theme.border}"/>
  <text class="title" x="16" y="23">${total.toLocaleString("en-US")} contributions in the last year</text>
  ${monthMarkup}
  <text class="muted" x="7" y="71">Mon</text>
  <text class="muted" x="7" y="97">Wed</text>
  <text class="muted" x="7" y="123">Fri</text>
  ${cells}
  <text class="muted" x="596" y="154">Less</text>
  ${legendCells}
  <text class="muted" x="711" y="154">15+</text>
</svg>
`;
}

export async function generate() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "Accept": "text/html",
      "User-Agent": `${USERNAME}-profile-contribution-graph`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${SOURCE_URL}`);
  }

  const days = parseContributionHtml(await response.text());
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const assets = path.join(root, "assets");
  await mkdir(assets, { recursive: true });
  await Promise.all([
    writeFile(path.join(assets, "contribution-graph.svg"), renderSvg(days, "light")),
    writeFile(path.join(assets, "contribution-graph-dark.svg"), renderSvg(days, "dark")),
  ]);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  await generate();
}
