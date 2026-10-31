// Renders a Sign (Template x Theme x text) to a PDF byte array using pdf-lib.
// Pure JS: embeds OSS TTF fonts via fontkit, draws vector backgrounds/borders/
// decorations. No native deps, no headless browser — fully SEA-bundleable.

import {
  PDFDocument,
  rgb,
  type PDFDocument as PDFDoc,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { RenderOptions, TemplateRegion, Theme, ThemeImage } from "../types.js";
import { getFontBytes, getImageBytes } from "../assets.js";

const LINE_GAP = 1.15; // line height as a multiple of font size
const MIN_FONT = 4;
const MAX_FONT = 1000;

export async function renderSign(opts: RenderOptions): Promise<Uint8Array> {
  const { template, theme, paper, lines } = opts;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(getFontBytes(theme.font), { subset: true });

  const page = doc.addPage([paper.widthPt, paper.heightPt]);
  const W = paper.widthPt;
  const H = paper.heightPt;

  // Background fill
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hex(theme.colors.background) });

  // Printable area inside the template margin (fraction of the shorter edge).
  const margin = (template.margin ?? 0.06) * Math.min(W, H);
  let area: Rect = { x: margin, y: margin, w: W - 2 * margin, h: H - 2 * margin };

  // Optional raster image (photo). May shrink the text area for bands/footers.
  if (theme.image) {
    area = await placeImage(doc, page, theme.image, W, H, area);
  }

  // Border + decorations
  if (theme.border?.enabled) drawBorder(page, W, H, theme);
  drawDecorations(page, W, H, theme);

  const textColor = hex(theme.colors.text);

  for (const region of template.regions) {
    const regionLines = selectLines(lines, region);
    if (regionLines.length === 0) continue;
    drawRegion(page, font, regionLines, region, area, textColor);
  }

  return doc.save();
}

function selectLines(lines: string[], region: TemplateRegion): string[] {
  const source = region.source ?? "all";
  let selected: string[];
  if (source === "first-line") selected = lines.slice(0, 1);
  else if (source === "rest") selected = lines.slice(1);
  else selected = lines;

  if (region.maxLines !== undefined && selected.length > region.maxLines) {
    selected = selected.slice(0, region.maxLines);
  }
  return selected;
}

/** Region rect in PDF points (origin bottom-left). */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function regionRect(region: TemplateRegion, area: Rect): Rect {
  // Fractional coords are top-left origin; flip Y into PDF space.
  const w = region.width * area.w;
  const h = region.height * area.h;
  const x = area.x + region.x * area.w;
  const topY = area.y + area.h - region.y * area.h; // top edge of region in PDF space
  const y = topY - h; // bottom edge
  return { x, y, w, h };
}

function drawRegion(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  region: TemplateRegion,
  area: Rect,
  color: RGB,
): void {
  const rect = regionRect(region, area);
  const scale = region.scale ?? 1;

  const size = fitFontSize(font, lines, rect, scale);
  const lineHeight = size * LINE_GAP;
  const totalHeight = lines.length * lineHeight;

  const valign = region.valign ?? "middle";
  let topY: number;
  if (valign === "top") topY = rect.y + rect.h;
  else if (valign === "bottom") topY = rect.y + totalHeight;
  else topY = rect.y + rect.h / 2 + totalHeight / 2;

  const align = region.align ?? "center";

  lines.forEach((line, i) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    let x: number;
    if (align === "left") x = rect.x;
    else if (align === "right") x = rect.x + rect.w - lineWidth;
    else x = rect.x + (rect.w - lineWidth) / 2;

    // Baseline of this line. Top of line is topY - i*lineHeight; drop by ascender-ish.
    const lineTop = topY - i * lineHeight;
    const baseline = lineTop - size; // place glyphs within the line box
    page.drawText(line, { x, y: baseline, size, font, color });
  });
}

/** Largest font size (× scale) at which every line fits the region's width and all lines fit its height. */
function fitFontSize(font: PDFFont, lines: string[], rect: Rect, scale: number): number {
  // Width constraint: width scales linearly with size, so size = rect.w / width@1.
  let sizeByWidth = MAX_FONT;
  for (const line of lines) {
    const widthAtOne = font.widthOfTextAtSize(line, 1);
    if (widthAtOne > 0) sizeByWidth = Math.min(sizeByWidth, rect.w / widthAtOne);
  }
  // Height constraint.
  const sizeByHeight = rect.h / (lines.length * LINE_GAP);

  const size = Math.min(sizeByWidth, sizeByHeight) * scale;
  return Math.max(MIN_FONT, Math.min(MAX_FONT, size));
}

function drawBorder(page: PDFPage, W: number, H: number, theme: Theme): void {
  const b = theme.border!;
  const color = hex(b.color);
  const inset = b.insetPt;
  const draw = (pad: number) =>
    page.drawRectangle({
      x: pad,
      y: pad,
      width: W - 2 * pad,
      height: H - 2 * pad,
      borderColor: color,
      borderWidth: b.widthPt,
    });
  draw(inset);
  if (b.style === "double") draw(inset + b.widthPt * 2.5);
}

// --- raster image placement ---

async function placeImage(
  doc: PDFDoc,
  page: PDFPage,
  image: ThemeImage,
  W: number,
  H: number,
  area: Rect,
): Promise<Rect> {
  const img = await embedImage(doc, image.file);
  const gap = 0.02 * Math.min(W, H);
  switch (image.placement) {
    case "background": {
      cover(page, img, 0, 0, W, H);
      const op = image.scrim ?? 0.35;
      if (op > 0) {
        page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0, 0, 0), opacity: op });
      }
      return area;
    }
    case "band-bottom": {
      // Full page width; band height follows the image aspect (capped at half the page).
      const bh = Math.min(0.5 * H, (W * img.height) / img.width);
      page.drawImage(img, { x: 0, y: 0, width: W, height: bh });
      return raiseBottom(area, bh + gap);
    }
    case "band-top": {
      const bh = Math.min(0.5 * H, (W * img.height) / img.width);
      page.drawImage(img, { x: 0, y: H - bh, width: W, height: bh });
      return lowerTop(area, H - bh - gap);
    }
    case "footer": {
      // A small centred vignette along the bottom (low ink).
      const fw = 0.45 * W;
      const fh = (fw * img.height) / img.width;
      page.drawImage(img, { x: (W - fw) / 2, y: 0.03 * H, width: fw, height: fh });
      return raiseBottom(area, 0.03 * H + fh + gap);
    }
    default:
      return area;
  }
}

async function embedImage(doc: PDFDoc, file: string): Promise<PDFImage> {
  const bytes = getImageBytes(file);
  const lower = file.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return doc.embedJpg(bytes);
  return doc.embedPng(bytes);
}

/** Scale to cover the target rect (may overflow; page edges clip). */
function cover(page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number): void {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  page.drawImage(img, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
}

function raiseBottom(area: Rect, newBottomMin: number): Rect {
  const top = area.y + area.h;
  const y = Math.max(area.y, newBottomMin);
  return { x: area.x, y, w: area.w, h: Math.max(0, top - y) };
}

function lowerTop(area: Rect, newTopMax: number): Rect {
  const top = Math.min(area.y + area.h, newTopMax);
  return { x: area.x, y: area.y, w: area.w, h: Math.max(0, top - area.y) };
}

// Festive bulb colours for fairy lights (good contrast on light and dark pages).
const BULB_COLORS = ["#E8B923", "#C8102E", "#1E8C3A"]; // gold, red, green

function drawDecorations(page: PDFPage, W: number, H: number, theme: Theme): void {
  const decos = theme.decorations ?? [];
  if (decos.length === 0) return;

  const outline = theme.ink === "low"; // low ink → line art, no heavy fills
  const defaultColor = theme.colors.accent ?? theme.colors.text;
  const inset = (theme.border?.insetPt ?? 18) + 24;

  for (const deco of decos) {
    if (deco.type === "none") continue;
    const color = hex(deco.color ?? defaultColor);
    const pos = deco.position ?? defaultPosition(deco.type);

    if (deco.type === "fairy-lights") {
      drawFairyLights(page, W, H, pos, inset, outline);
      continue;
    }

    for (const [cx, cy] of points(pos, W, H, inset)) {
      switch (deco.type) {
        case "holly":
          drawHolly(page, cx, cy, color, outline);
          break;
        case "snow":
          drawSnow(page, cx, cy, color);
          break;
        case "bauble":
          drawBauble(page, cx, cy, color, outline);
          break;
        case "santa-hat":
          drawSantaHat(page, cx, cy, color, outline);
          break;
        case "tree":
          drawTree(page, cx, cy, color, outline);
          break;
      }
    }
  }
}

function defaultPosition(type: string): "corners" | "top" | "bottom" {
  if (type === "fairy-lights" || type === "bauble") return "top";
  if (type === "tree") return "bottom";
  return "corners";
}

/** Anchor points for a motif position. For rows, motifs sit along the edge. */
function points(pos: string, W: number, H: number, inset: number): Array<[number, number]> {
  if (pos === "corners") {
    return [
      [inset, H - inset],
      [W - inset, H - inset],
      [inset, inset],
      [W - inset, inset],
    ];
  }
  const n = 5;
  const y = pos === "top" ? H - inset : inset;
  const span = W - 2 * inset;
  return Array.from({ length: n }, (_, i) => [inset + (span * i) / (n - 1), y] as [number, number]);
}

// --- motifs (centre at cx,cy; `outline` draws line-art for low-ink themes) ---

function paint(color: RGB, outline: boolean): Record<string, unknown> {
  return outline ? { borderColor: color, borderWidth: 1.4 } : { color };
}

/** Triangle via SVG path; pointUp=true grows upward from the base at (cx, baseY). */
function triangle(
  page: PDFPage,
  cx: number,
  baseY: number,
  halfW: number,
  height: number,
  color: RGB,
  outline: boolean,
  pointUp = true,
): void {
  const apexY = pointUp ? baseY + height : baseY - height;
  // SVG path space has y pointing down; anchor at (cx, baseY) so convert dy = baseY - pageY.
  const p = (x: number, y: number) => `${x - cx} ${baseY - y}`;
  const d = `M ${p(cx - halfW, baseY)} L ${p(cx + halfW, baseY)} L ${p(cx, apexY)} Z`;
  page.drawSvgPath(d, { x: cx, y: baseY, ...paint(color, outline) });
}

function drawHolly(page: PDFPage, cx: number, cy: number, color: RGB, outline: boolean): void {
  const leaf = outline ? color : rgb(0.11, 0.55, 0.22);
  // Two leaves + three berries.
  triangle(page, cx - 6, cy, 4, 12, leaf, outline, true);
  triangle(page, cx + 6, cy, 4, 12, leaf, outline, true);
  for (const [dx, dy] of [[0, -3], [-4, -6], [4, -6]] as const) {
    page.drawCircle({ x: cx + dx, y: cy + dy, size: 2.6, ...paint(color, outline) });
  }
}

function drawSnow(page: PDFPage, cx: number, cy: number, color: RGB): void {
  const arm = 9;
  for (const a of [0, 60, 120]) {
    page.drawLine({ start: polar(cx, cy, -arm, a), end: polar(cx, cy, arm, a), thickness: 2, color });
  }
  page.drawCircle({ x: cx, y: cy, size: 2, color });
}

function drawBauble(page: PDFPage, cx: number, cy: number, color: RGB, outline: boolean): void {
  // Hanger line + cap + ball, hanging below the anchor.
  page.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy - 7 }, thickness: 1.2, color });
  page.drawRectangle({ x: cx - 1.6, y: cy - 10, width: 3.2, height: 3.2, ...paint(color, outline) });
  page.drawCircle({ x: cx, y: cy - 17, size: 6, ...paint(color, outline) });
}

function drawSantaHat(page: PDFPage, cx: number, cy: number, color: RGB, outline: boolean): void {
  // Cone + brim + pom-pom, sitting above the anchor.
  triangle(page, cx, cy, 8, 16, color, outline, true);
  page.drawRectangle({ x: cx - 9, y: cy - 3, width: 18, height: 4, ...paint(color, outline) });
  page.drawCircle({ x: cx, y: cy + 16, size: 3, ...paint(color, outline) });
}

function drawTree(page: PDFPage, cx: number, cy: number, color: RGB, outline: boolean): void {
  // Two stacked triangles + trunk + star.
  triangle(page, cx, cy + 6, 11, 16, color, outline, true);
  triangle(page, cx, cy + 15, 8, 13, color, outline, true);
  page.drawRectangle({ x: cx - 2, y: cy, width: 4, height: 7, ...paint(color, outline) });
  page.drawCircle({ x: cx, y: cy + 29, size: 2.2, ...paint(hex("#E8B923"), outline) });
}

function drawFairyLights(
  page: PDFPage,
  W: number,
  H: number,
  pos: string,
  inset: number,
  outline: boolean,
): void {
  const baseY = pos === "bottom" ? inset : H - inset;
  const x0 = inset;
  const x1 = W - inset;
  const sag = 10;
  const wire = rgb(0.3, 0.3, 0.3);

  // Wavy wire drawn as short segments.
  const steps = 60;
  let prev = { x: x0, y: baseY };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = baseY - sag * Math.sin(Math.PI * t * 4); // four gentle dips
    page.drawLine({ start: prev, end: { x, y }, thickness: 1, color: wire });
    prev = { x, y };
  }

  // Bulbs at each dip.
  const bulbs = 9;
  for (let i = 0; i < bulbs; i++) {
    const t = i / (bulbs - 1);
    const x = x0 + (x1 - x0) * t;
    const y = baseY - sag * Math.sin(Math.PI * t * 4) - 3;
    const color = hex(BULB_COLORS[i % BULB_COLORS.length]);
    page.drawCircle({ x, y, size: 3.2, ...paint(color, outline) });
  }
}

// --- helpers ---

function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function hex(value: string): RGB {
  const v = value.replace("#", "");
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  const n = parseInt(full, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

