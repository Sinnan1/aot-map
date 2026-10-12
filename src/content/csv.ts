/**
 * Minimal RFC 4180 CSV reader (comma separated, double-quote quoting, "" escape, CRLF or LF).
 * No dependency: the project keeps its runtime deps to drizzle/next/postgres/react/zod, and the
 * only CSV we read is the hand-maintained episode list.
 *
 * Deliberately not a general CSV implementation: it does not handle embedded newlines inside
 * quoted fields, and it throws on an unterminated quoted field rather than guessing.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input; // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') {
      if (field !== "") throw new Error(`csv: quote in the middle of an unquoted field at offset ${i}`);
      quoted = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }

  if (quoted) throw new Error("csv: unterminated quoted field at end of input");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Drops blank records and trims every cell. Cells are trimmed, so quoted copy may keep spaces. */
export function parseCsvRecords(input: string): string[][] {
  return parseCsv(input)
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ""));
}