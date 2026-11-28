import { expect, it } from "vitest";
import { SessionTpo } from "./session-tpo";

it("keeps separate sessions and derives POC and value area from half-hour counts", () => {
  const tpo = new SessionTpo(1);
  tpo.add(0, 100, 102);
  tpo.add(1799, 101, 101);
  tpo.add(1800, 101, 103);
  tpo.add(5400, 101, 101);
  tpo.add(86_400, 105, 105);
  tpo.add(120, 100, 100);

  const [first, second] = [...tpo.visible(0, 86_401)];
  expect(first.rows.find((row) => row.priceTick === 101n)?.periodMask).toBe(0b1011n);
  expect(first.rows.find((row) => row.priceTick === 100n)?.periodMask).toBe(1n);
  expect([first.poc, first.val, first.vah]).toEqual([101n, 101n, 102n]);
  expect(second.rows).toEqual([{ priceTick: 105n, periodMask: 1n }]);
  expect([...tpo.visible(86_400, 86_401)]).toEqual([second]);
});

it("merges adjacent sessions without collapsing their half-hour counts", () => {
  const tpo = new SessionTpo(1);
  tpo.add(0, 100, 102);
  tpo.add(86_400, 101, 103);
  tpo.add(172_800, 105, 105);
  const [merged, separate] = [...tpo.visible(0, 172_801, [86_400], 100)];
  expect([merged.time, merged.endTime, merged.poc, merged.val, merged.vah]).toEqual([0, 172_800, 101n, 100n, 103n]);
  expect(merged.rows.find((row) => row.priceTick === 101n)?.periodMask).toBe((1n << 48n) | 1n);
  expect(separate.time).toBe(172_800);
  expect([...tpo.visible(0, 172_801)]).toHaveLength(3);
});

it("counts overlapping half-hours only once when using hourly letters", () => {
  const tpo = new SessionTpo(1);
  tpo.add(0, 100, 101);
  tpo.add(1800, 101, 102);
  tpo.add(3600, 101, 103);
  const [profile] = [...tpo.visible(0, 3600, [], 70, 60)];
  expect(profile.rows.find((row) => row.priceTick === 101n)?.periodMask).toBe(0b11n);
});
