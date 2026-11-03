/**
 * Minimal typings for `qrcode-generator` (the package ships no .d.ts).
 * Only the surface we use is declared.
 */
declare module "qrcode-generator" {
  interface QrSvgOptions {
    cellSize?: number;
    margin?: number;
    scalable?: boolean;
    alt?: string;
    title?: string;
  }

  interface QrCode {
    addData(data: string, mode?: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, column: number): boolean;
    createSvgTag(options?: QrSvgOptions | number, margin?: number): string;
    createDataURL(cellSize?: number, margin?: number): string;
    createImgTag(cellSize?: number, margin?: number, alt?: string): string;
    createTableTag(cellSize?: number, margin?: number): string;
    createASCII(cellSize?: number, margin?: number): string;
  }

  type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  export default function qrcode(
    typeNumber: number,
    errorCorrectionLevel: ErrorCorrectionLevel,
  ): QrCode;
}
