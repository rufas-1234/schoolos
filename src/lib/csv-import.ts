export function parseCsvRows(content: string): string[][] {
  const input = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        field += character;
      }
      continue;
    }

    if (character === ",") {
      row.push(field);
      field = "";
      afterQuote = false;
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      afterQuote = false;
      if (character === "\r" && input[index + 1] === "\n") index += 1;
    } else if (character === '"' && field.length === 0 && !afterQuote) {
      quoted = true;
    } else if (afterQuote && !/\s/.test(character)) {
      throw new Error("Unexpected character after a quoted CSV field.");
    } else if (!afterQuote) {
      field += character;
    }
  }

  if (quoted) throw new Error("A quoted CSV field is not closed.");
  if (row.length > 0 || field.length > 0 || (!input.endsWith("\n") && !input.endsWith("\r"))) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
