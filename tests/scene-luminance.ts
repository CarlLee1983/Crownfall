import sharp, { type Region } from 'sharp';

export const mossPatch = { left: 630, top: 310, width: 10, height: 10 };

export async function meanLuma(screenshot: Buffer, patch: Region): Promise<number> {
  const pixels = await sharp(screenshot).extract(patch).removeAlpha().raw().toBuffer();
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    sum +=
      0.2126 * pixels.readUInt8(i) +
      0.7152 * pixels.readUInt8(i + 1) +
      0.0722 * pixels.readUInt8(i + 2);
  }
  return sum / (pixels.length / 3);
}
