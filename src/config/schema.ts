// Runtime validation of template/theme JSON into typed objects.
// Kept dependency-free (no zod) so the bundle stays small and SEA-friendly.

import type {
  Template,
  TemplateRegion,
  Theme,
  HAlign,
  VAlign,
  TextSource,
  Palette,
  Ink,
  ThemeDecoration,
  DecorationType,
  DecorationPosition,
  ImagePlacement,
} from "../types.js";

export class ConfigError extends Error {}

function str(obj: Record<string, unknown>, key: string, where: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new ConfigError(`${where}: "${key}" must be a non-empty string`);
  }
  return v;
}

function optNum(obj: Record<string, unknown>, key: string, where: string): number | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new ConfigError(`${where}: "${key}" must be a number`);
  }
  return v;
}

function num(obj: Record<string, unknown>, key: string, where: string): number {
  const v = optNum(obj, key, where);
  if (v === undefined) throw new ConfigError(`${where}: "${key}" is required`);
  return v;
}

const HALIGN = new Set<HAlign>(["left", "center", "right"]);
const VALIGN = new Set<VAlign>(["top", "middle", "bottom"]);
const SOURCES = new Set<TextSource>(["all", "first-line", "rest"]);

export function parseTemplate(raw: unknown): Template {
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError("Template must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const name = str(o, "name", "template");
  const where = `template "${name}"`;

  if (!Array.isArray(o.regions) || o.regions.length === 0) {
    throw new ConfigError(`${where}: "regions" must be a non-empty array`);
  }

  const regions: TemplateRegion[] = o.regions.map((r, i) => {
    if (typeof r !== "object" || r === null) {
      throw new ConfigError(`${where}: region ${i} must be an object`);
    }
    const ro = r as Record<string, unknown>;
    const rwhere = `${where} region ${i}`;
    const region: TemplateRegion = {
      id: str(ro, "id", rwhere),
      x: num(ro, "x", rwhere),
      y: num(ro, "y", rwhere),
      width: num(ro, "width", rwhere),
      height: num(ro, "height", rwhere),
    };
    for (const [k, v] of [["x", region.x], ["y", region.y], ["width", region.width], ["height", region.height]] as const) {
      if (v < 0 || v > 1) throw new ConfigError(`${rwhere}: "${k}" must be between 0 and 1`);
    }
    if (ro.align !== undefined) {
      if (!HALIGN.has(ro.align as HAlign)) throw new ConfigError(`${rwhere}: invalid "align"`);
      region.align = ro.align as HAlign;
    }
    if (ro.valign !== undefined) {
      if (!VALIGN.has(ro.valign as VAlign)) throw new ConfigError(`${rwhere}: invalid "valign"`);
      region.valign = ro.valign as VAlign;
    }
    if (ro.source !== undefined) {
      if (!SOURCES.has(ro.source as TextSource)) throw new ConfigError(`${rwhere}: invalid "source"`);
      region.source = ro.source as TextSource;
    }
    const maxLines = optNum(ro, "maxLines", rwhere);
    if (maxLines !== undefined) region.maxLines = maxLines;
    const scale = optNum(ro, "scale", rwhere);
    if (scale !== undefined) region.scale = scale;
    return region;
  });

  const template: Template = { name, regions };
  if (typeof o.description === "string") template.description = o.description;
  const margin = optNum(o, "margin", where);
  if (margin !== undefined) template.margin = margin;
  return template;
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function color(obj: Record<string, unknown>, key: string, where: string, required: boolean): string | undefined {
  const v = obj[key];
  if (v === undefined) {
    if (required) throw new ConfigError(`${where}: colour "${key}" is required`);
    return undefined;
  }
  if (typeof v !== "string" || !HEX.test(v)) {
    throw new ConfigError(`${where}: colour "${key}" must be a hex string like #0B5D2E`);
  }
  return v;
}

export function parseTheme(raw: unknown): Theme {
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError("Theme must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const name = str(o, "name", "theme");
  const where = `theme "${name}"`;
  const font = str(o, "font", where);

  const colorsRaw = o.colors;
  if (typeof colorsRaw !== "object" || colorsRaw === null) {
    throw new ConfigError(`${where}: "colors" object is required`);
  }
  const c = colorsRaw as Record<string, unknown>;
  const theme: Theme = {
    name,
    font,
    colors: {
      background: color(c, "background", where, true)!,
      text: color(c, "text", where, true)!,
      accent: color(c, "accent", where, false),
    },
  };
  if (typeof o.description === "string") theme.description = o.description;
  if (typeof o.seasonal === "boolean") theme.seasonal = o.seasonal;
  if (o.palette !== undefined) {
    if (o.palette !== "mono" && o.palette !== "colour") {
      throw new ConfigError(`${where}: "palette" must be "mono" or "colour"`);
    }
    theme.palette = o.palette as Palette;
  }
  if (o.ink !== undefined) {
    if (o.ink !== "high" && o.ink !== "medium" && o.ink !== "low") {
      throw new ConfigError(`${where}: "ink" must be "high", "medium" or "low"`);
    }
    theme.ink = o.ink as Ink;
  }

  if (o.border !== undefined) {
    const b = o.border as Record<string, unknown>;
    if (typeof b === "object" && b !== null) {
      theme.border = {
        enabled: b.enabled !== false,
        color: color(b, "color", `${where} border`, true)!,
        widthPt: num(b, "widthPt", `${where} border`),
        insetPt: num(b, "insetPt", `${where} border`),
        style: b.style === "double" ? "double" : "single",
      };
    }
  }

  if (o.image !== undefined) {
    const im = o.image as Record<string, unknown>;
    if (typeof im !== "object" || im === null) {
      throw new ConfigError(`${where}: "image" must be an object`);
    }
    const file = str(im, "file", `${where} image`);
    const placement = im.placement;
    if (!IMAGE_PLACEMENTS.has(placement as ImagePlacement)) {
      throw new ConfigError(`${where}: image "placement" must be one of ${[...IMAGE_PLACEMENTS].join(", ")}`);
    }
    theme.image = { file, placement: placement as ImagePlacement };
    const scrim = optNum(im, "scrim", `${where} image`);
    if (scrim !== undefined) {
      if (scrim < 0 || scrim > 1) throw new ConfigError(`${where}: image "scrim" must be 0..1`);
      theme.image.scrim = scrim;
    }
    if (im.safeArea !== undefined) {
      const sa = im.safeArea as Record<string, unknown>;
      if (typeof sa !== "object" || sa === null) {
        throw new ConfigError(`${where}: image "safeArea" must be an object`);
      }
      const side = (k: string): number => {
        const v = num(sa, k, `${where} image safeArea`);
        if (v < 0 || v >= 0.5) throw new ConfigError(`${where}: image safeArea "${k}" must be 0..0.5`);
        return v;
      };
      theme.image.safeArea = { top: side("top"), right: side("right"), bottom: side("bottom"), left: side("left") };
    }
  }

  // Accept either a single `decoration` object (legacy) or a `decorations` array.
  const rawDecos: unknown[] = Array.isArray(o.decorations)
    ? o.decorations
    : o.decoration !== undefined
      ? [o.decoration]
      : [];
  const decorations: ThemeDecoration[] = [];
  for (const rd of rawDecos) {
    const deco = parseDecoration(rd, where);
    if (deco) decorations.push(deco);
  }
  if (decorations.length > 0) theme.decorations = decorations;

  return theme;
}

const DECO_TYPES = new Set<DecorationType>([
  "holly",
  "snow",
  "bauble",
  "santa-hat",
  "tree",
  "fairy-lights",
  "none",
]);
const DECO_POSITIONS = new Set<DecorationPosition>(["corners", "top", "bottom"]);
const IMAGE_PLACEMENTS = new Set<ImagePlacement>(["background", "band-top", "band-bottom", "footer"]);

function parseDecoration(raw: unknown, where: string): ThemeDecoration | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.type !== "string" || !DECO_TYPES.has(d.type as DecorationType)) {
    throw new ConfigError(`${where}: invalid decoration type "${String(d.type)}"`);
  }
  const type = d.type as DecorationType;
  if (type === "none") return null;
  const deco: ThemeDecoration = { type };
  if (d.position !== undefined) {
    if (!DECO_POSITIONS.has(d.position as DecorationPosition)) {
      throw new ConfigError(`${where}: invalid decoration position "${String(d.position)}"`);
    }
    deco.position = d.position as DecorationPosition;
  }
  const col = color(d, "color", `${where} decoration`, false);
  if (col) deco.color = col;
  return deco;
}
