/**
 * @jest-environment node
 */
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { LocalDemManager } from "./local-dem-manager";
import type { DemTile, IndividualContourTileOptions } from "./types";

// 中央が高い 4x4 の DEM。閾値 10m の等高線が 1 本だけ生成される。
const CONE = Float32Array.from([
  5, 5, 5, 5, 5, 15, 15, 5, 5, 15, 15, 5, 5, 5, 5, 5,
]);

const CONTOUR_OPTIONS: IndividualContourTileOptions = {
  levels: [10],
  buffer: 0,
  contourLayer: "c",
  elevationKey: "e",
  levelKey: "l",
};

/**
 * 指定した DEM タイルだけが取得に失敗する LocalDemManager を作る。
 *
 * @param missing 取得に失敗させるタイルの `z/x/y`
 * @param error 失敗時に投げるエラー（既定はカバレッジ外タイル相当）
 */
function createManager(
  missing: string[],
  error: Error = new TypeError("Failed to fetch"),
): LocalDemManager {
  return new LocalDemManager({
    demUrlPattern: "https://example/{z}/{x}/{y}.png",
    cacheSize: 100,
    encoding: "numpng",
    pixelAnchor: "northwest",
    maxzoom: 11,
    timeoutMs: 10_000,
    getTile: async (url: string) => {
      const match = /\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url);
      if (match && missing.includes(`${match[1]}/${match[2]}/${match[3]}`)) {
        throw error;
      }
      return { data: new Blob([Uint8Array.from([1, 2])]) };
    },
    decodeImage: (): Promise<DemTile> =>
      Promise.resolve({ width: 4, height: 4, data: CONE }),
  });
}

/** 等高線タイルを取得し、生成されたフィーチャ数を返す */
async function countFeatures(manager: LocalDemManager): Promise<number> {
  const { arrayBuffer } = await manager.fetchContourTile(
    10,
    20,
    30,
    CONTOUR_OPTIONS,
    new AbortController(),
  );
  if (arrayBuffer.byteLength === 0) return 0;
  const tile = new VectorTile(new Pbf(arrayBuffer));
  return tile.layers.c ? tile.layers.c.length : 0;
}

test("全ての近傍タイルが取得できれば等高線が生成される", async () => {
  await expect(countFeatures(createManager([]))).resolves.toBe(1);
});

test("近傍タイルが取得できなくても等高線が生成される", async () => {
  // カバレッジ境界では 3x3 近傍のうち一部だけが 404 になる。
  // 1 枚の欠損で等高線タイル全体を失敗させると、MapLibre が親タイルを
  // 引き伸ばして描画し、そのズームとは異なる間隔の等高線が表示されてしまう。
  await expect(countFeatures(createManager(["10/19/29"]))).resolves.toBe(1);
  await expect(
    countFeatures(createManager(["10/19/29", "10/20/29", "10/21/29"])),
  ).resolves.toBe(1);
});

test("中心タイルが取得できなければ空のタイルを返す", async () => {
  const manager = createManager(["10/20/30"]);
  const { arrayBuffer } = await manager.fetchContourTile(
    10,
    20,
    30,
    CONTOUR_OPTIONS,
    new AbortController(),
  );
  expect(arrayBuffer.byteLength).toBe(0);
});

test("タイムアウト・中断は欠損として扱わず失敗させる", async () => {
  await expect(
    countFeatures(createManager(["10/19/29"], new Error("timed out"))),
  ).rejects.toThrow("timed out");
  await expect(
    countFeatures(createManager(["10/20/30"], new Error("aborted"))),
  ).rejects.toThrow("aborted");
});
