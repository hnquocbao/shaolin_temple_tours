/** Colours of one building, as sRGB hex. Every kit factory takes one; the default is `templePalette`. */
export interface Palette {
  /** Plastered wall panels and gable boards. */
  wall: number;
  /** Columns and doors. */
  column: number;
  /** Round roof tiles (ribs and eave caps). */
  tile: number;
  /** Ridges and ridge ornaments. */
  ridge: number;
  /** Platforms, steps, balustrades, column bases. */
  stone: number;
  /** Painted bands: beams, brackets, eave fascia. */
  trim: number;
  /** Per-tile colour variation, 0 (none) to 1. Default 0.14. */
  tileVariation?: number;
}

/** Vermilion walls and columns, terracotta-brown tiles, pale stone, teal paint. */
export const templePalette: Palette = {
  wall: 0xb43c2c,
  column: 0xa8321f,
  tile: 0x9c5a3a,
  ridge: 0x9a6648,
  stone: 0xd2cbbb,
  trim: 0x2f7068,
  tileVariation: 0.14,
};

/** Same walls and stone under dark grey tiles (the blue-hour mountain city). */
export const darkTilePalette: Palette = {
  ...templePalette,
  tile: 0x40464c,
  ridge: 0x2a2e33,
  trim: 0x356c78,
  tileVariation: 0.1,
};
