import sharp, { type Region } from 'sharp';

export async function countPixels(
  screenshot: Buffer,
  region: Region,
  matches: (red: number, green: number, blue: number) => boolean,
): Promise<number> {
  const pixels = await sharp(screenshot).extract(region).removeAlpha().raw().toBuffer();
  let count = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    if (matches(pixels.readUInt8(i), pixels.readUInt8(i + 1), pixels.readUInt8(i + 2))) count++;
  }
  return count;
}

export function routeDots(screenshot: Buffer, region: Region, color: 'current' | 'preview') {
  return countPixels(screenshot, region, (red, green, blue) =>
    color === 'current'
      ? red < green * 0.83 && blue > green * 0.85 && green > 95
      : red > 150 && green > red * 0.8 && blue < green * 0.68,
  );
}
