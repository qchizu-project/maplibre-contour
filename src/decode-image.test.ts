import { decodeParsedImage } from "./decode-image";

const px = (arr: number[]) => Uint8ClampedArray.from(arr);

test("numpng: 正式データPNG(符号付き24bit, factor 0.01)をデコード", () => {
  const t = decodeParsedImage(
    2,
    2,
    "numpng",
    px([
      0,
      39,
      16,
      255, // 100m (x=10000)
      255,
      252,
      24,
      255, // -10m (x=2^24-1000)
      128,
      0,
      0,
      255, // 無効色 → NaN
      0,
      39,
      16,
      0, // alpha0 → NaN
    ]),
  );
  expect(t.data[0]).toBeCloseTo(100, 6);
  expect(t.data[1]).toBeCloseTo(-10, 6);
  expect(Number.isNaN(t.data[2])).toBe(true);
  expect(Number.isNaN(t.data[3])).toBe(true);
});

test("terrarium / mapbox は従来どおりデコードする", () => {
  expect(
    decodeParsedImage(1, 1, "terrarium", px([128, 0, 0, 255])).data[0],
  ).toBeCloseTo(0, 6);
  expect(
    decodeParsedImage(1, 1, "mapbox", px([0, 0, 0, 255])).data[0],
  ).toBeCloseTo(-10000, 6);
});
