import { UNCATEGORIZED_ID } from "./constants";
import { getChannelsForCategory } from "./state";
import type { CategorizedChannelImport } from "./state";
import type { ExtensionState } from "./types";
import { channelFromUrl } from "./youtube-parser";

export const CSV_HEADER = ["分类", "频道名称", "频道链接"] as const;

const escapeCsvField = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

// UTF-8 BOM so Excel opens the file with Chinese text intact.
export function buildCategoriesCsv(state: ExtensionState): string {
  const lines = [CSV_HEADER.join(",")];
  for (const categoryId of [UNCATEGORIZED_ID, ...state.categoryOrder]) {
    const category = state.categories[categoryId];
    if (!category) {
      continue;
    }
    for (const channel of getChannelsForCategory(state, categoryId)) {
      lines.push([category.name, channel.name, channel.url].map(escapeCsvField).join(","));
    }
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const parseCsv = (text: string): string[][] => {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
};

export interface CsvImportResult {
  items: CategorizedChannelImport[];
  errors: string[];
}

export function parseCategoriesCsv(text: string): CsvImportResult {
  const rows = parseCsv(text);
  const items: CategorizedChannelImport[] = [];
  const errors: string[] = [];

  let startIndex = 0;
  if (rows.length > 0) {
    const first = rows[0].join(",").toLocaleLowerCase();
    if ((first.includes("分类") || first.includes("category")) && (first.includes("链接") || first.includes("url"))) {
      startIndex = 1;
    }
  }

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index];
    const line = index + 1;
    if (row.length < 2) {
      errors.push(`第 ${line} 行：至少需要「分类」和「频道链接」两列`);
      continue;
    }
    const categoryName = row[0].trim();
    const channelName = row.length >= 3 ? row[1].trim() : "";
    const channelUrl = (row.length >= 3 ? row[2] : row[1]).trim();
    if (!categoryName) {
      errors.push(`第 ${line} 行：分类名称为空`);
      continue;
    }
    const channel = channelFromUrl(channelUrl, channelName);
    if (!channel) {
      errors.push(`第 ${line} 行：无法识别频道链接「${channelUrl}」`);
      continue;
    }
    items.push({ channel, categoryName });
  }

  return { items, errors };
}
