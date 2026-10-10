export type Paper = "a4" | "letter";
export type FontSet = "elegant" | "classic" | "modern" | "noto";

export interface FrameLine {
  inset: number;
  width: number;
}

export interface CustomStyle {
  bg: string;
  ink: string;
  muted: string;
  accent: string;
  frames: FrameLine[];
  band: number;
  corners: boolean;
  caps: boolean;
}
