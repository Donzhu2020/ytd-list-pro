import { describe, expect, it } from "vitest";
import { addCategory, createEmptyState, mergeSubscriptions, moveChannels } from "./state";
import { buildCategoriesCsv, parseCategoriesCsv } from "./transfer";
import type { Channel } from "./types";

const channel = (id: string, name: string, handle: string): Channel => ({
  id,
  name,
  handle,
  url: `https://www.youtube.com/${handle}`
});

const buildState = () => {
  let state = createEmptyState();
  state = mergeSubscriptions(
    state,
    [channel("UC-a", "Matt Wolfe", "@mreflow"), channel("UC-b", "李永乐老师", "@liyongle"), channel("UC-c", "Tech, With Tim", "@TechWithTim")],
    10
  );
  state = addCategory(state, { id: "cat-ai", name: "AI大师", color: "#7c3aed", icon: "ai" });
  state = moveChannels(state, ["UC-a"], "cat-ai");
  return state;
};

describe("buildCategoriesCsv", () => {
  it("exports every category with a BOM header row for Excel", () => {
    const csv = buildCategoriesCsv(buildState());
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(lines[0]).toBe("分类,频道名称,频道链接");
    expect(lines).toContain("AI大师,Matt Wolfe,https://www.youtube.com/@mreflow");
    expect(lines).toContain("未分类,李永乐老师,https://www.youtube.com/@liyongle");
  });

  it("quotes fields containing commas", () => {
    const csv = buildCategoriesCsv(buildState());
    expect(csv).toContain('"Tech, With Tim"');
  });
});

describe("parseCategoriesCsv", () => {
  it("round-trips its own export", () => {
    const csv = buildCategoriesCsv(buildState());
    const { items, errors } = parseCategoriesCsv(csv);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(3);
    expect(items[0]?.categoryName).toBe("未分类");
    const ai = items.find((item) => item.categoryName === "AI大师");
    expect(ai?.channel.handle).toBe("@mreflow");
    expect(ai?.channel.name).toBe("Matt Wolfe");
  });

  it("accepts two-column rows and infers the channel from the url", () => {
    const { items, errors } = parseCategoriesCsv("编程,https://www.youtube.com/@TechWithTim\n");
    expect(errors).toEqual([]);
    expect(items[0]?.categoryName).toBe("编程");
    expect(items[0]?.channel.id).toBe("handle:techwithtim");
  });

  it("supports /channel/UC... urls and english headers", () => {
    const text = "Category,Channel Name,Channel URL\nDev,Some Channel,https://www.youtube.com/channel/UCabc123\n";
    const { items, errors } = parseCategoriesCsv(text);
    expect(errors).toEqual([]);
    expect(items[0]?.channel.id).toBe("UCabc123");
  });

  it("reports invalid rows with line numbers and keeps the valid ones", () => {
    const text = "分类,频道名称,频道链接\nAI,Good,https://www.youtube.com/@good\nAI,Bad,not-a-channel-url\n";
    const { items, errors } = parseCategoriesCsv(text);
    expect(items).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("第 3 行");
  });

  it("returns nothing for an empty file", () => {
    const { items, errors } = parseCategoriesCsv("");
    expect(items).toEqual([]);
    expect(errors).toEqual([]);
  });
});
