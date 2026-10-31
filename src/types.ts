// Core domain types for the shop sign creator.
// A Sign = a Template (layout) rendered with a Theme (look) over notice content.

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

/** Which slice of the notice text feeds a region. */
export type TextSource = "all" | "first-line" | "rest";

/**
 * A rectangular area of the printable page (inside margins) where text is placed.
 * Coordinates are fractions (0..1) of the printable area, origin top-left.
 */
export interface TemplateRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  align?: HAlign;
  valign?: VAlign;
  /** Which part of the notice text this region shows. Default "all". */
  source?: TextSource;
  /** Hard cap on lines for this region (e.g. a single-line header). */
  maxLines?: number;
  /** Multiplier on the auto-fit font size for this region (e.g. header bigger). Default 1. */
  scale?: number;
}

/** Template = layout only. No colours or fonts. */
export interface Template {
  name: string;
  description?: string;
  /** Margin as a fraction of the shorter page edge. Default 0.06. */
  margin?: number;
  regions: TemplateRegion[];
}

export type BorderStyle = "single" | "double";

export interface ThemeBorder {
  enabled: boolean;
  color: string;
  widthPt: number;
  /** Distance from page edge, in points. */
  insetPt: number;
  style?: BorderStyle;
}

export type DecorationType =
  | "holly"
  | "snow"
  | "bauble"
  | "santa-hat"
  | "tree"
  | "fairy-lights"
  | "none";

export type DecorationPosition = "corners" | "top" | "bottom";

export interface ThemeDecoration {
  type: DecorationType;
  /** Where to draw the motif. Default "corners". */
  position?: DecorationPosition;
  /** Optional override colour (hex); otherwise the theme's accent/text is used. */
  color?: string;
}

/** Whether a theme is monochrome (black & white) or uses colour. */
export type Palette = "mono" | "colour";

/** Rough print ink/toner usage, for listing and for decoration render style. */
export type Ink = "high" | "medium" | "low";

/** How a theme's background/accent image is laid onto the page. */
export type ImagePlacement = "background" | "band-top" | "band-bottom" | "footer";

export interface ThemeImage {
  /** PNG/JPG filename, resolved from assets/images (bundled/embedded or beside the exe). */
  file: string;
  placement: ImagePlacement;
  /** For "background": opacity (0..1) of a dark scrim over the image for text legibility. */
  scrim?: number;
}

/** Theme = look only (font, colours, border, decorations). */
export interface Theme {
  name: string;
  description?: string;
  /** Font key, resolved against the bundled font registry. */
  font: string;
  /** Category for listing/grouping. Defaults to "colour". */
  palette?: Palette;
  /** Rough ink/toner usage. Defaults to "medium". */
  ink?: Ink;
  colors: {
    background: string;
    text: string;
    accent?: string;
  };
  border?: ThemeBorder;
  /** Optional raster image (photo) background or band. */
  image?: ThemeImage;
  /** Decorative motifs to draw. */
  decorations?: ThemeDecoration[];
  /** Whether this is a Christmas/seasonal theme (metadata for listing). */
  seasonal?: boolean;
}

export interface ConfigSet {
  templates: Map<string, Template>;
  themes: Map<string, Theme>;
}

export interface PaperSize {
  name: string;
  /** Dimensions in PDF points (1pt = 1/72"). Portrait orientation. */
  widthPt: number;
  heightPt: number;
}

export interface RenderOptions {
  template: Template;
  theme: Theme;
  paper: PaperSize;
  /** Notice text, already split into lines. */
  lines: string[];
}
