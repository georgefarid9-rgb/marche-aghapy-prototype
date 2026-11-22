// Builds the content of an exported report file (Feature 2, ReportExport.createExportFile).
// No extra npm package is needed: CSV is plain text, and the PDF is written by hand
// using the built-in Courier font, so the columns line up.
//
// Both functions take the same content object:
//   { title: String, summaryLines: [String], columns: [{ key, label }], rows: [Object] }

// ---------- CSV ----------

function csvCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  let text = String(value);
  // Stop spreadsheet programs from running a cell as a formula (=, +, @).
  if (/^[=+@]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values) {
  return values.map(csvCell).join(",");
}

function toCsv({ title, summaryLines = [], columns, rows }) {
  const lines = [csvRow([title]), ...summaryLines.map((line) => csvRow([line])), ""];
  lines.push(csvRow(columns.map((column) => column.label)));
  for (const row of rows) {
    lines.push(csvRow(columns.map((column) => row[column.key])));
  }
  // The byte order mark lets Excel show accents (é) correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

// ---------- PDF ----------

const PAGE_WIDTH = 792; // US Letter, landscape
const PAGE_HEIGHT = 612;
const MARGIN = 36;
const FONT_SIZE = 8;
const LINE_HEIGHT = 11;
const CHAR_WIDTH = FONT_SIZE * 0.6; // every Courier character has the same width
const MAX_CHARS = Math.floor((PAGE_WIDTH - 2 * MARGIN) / CHAR_WIDTH);
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN - LINE_HEIGHT) / LINE_HEIGHT) - 2;
const MAX_COLUMN_WIDTH = 32;

// Keep only characters the built-in PDF fonts can show (Latin-1), and escape ( ) \.
function pdfText(value) {
  return String(value)
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function fit(value, width) {
  const text = value === null || value === undefined ? "" : String(value);
  return text.length > width ? `${text.slice(0, Math.max(width - 2, 1))}..` : text.padEnd(width);
}

// Work out a width for each column so the table fits across the page.
function columnWidths(columns, rows) {
  const widths = columns.map((column) => {
    const longest = rows.reduce(
      (max, row) => Math.max(max, String(row[column.key] ?? "").length),
      column.label.length
    );
    return Math.min(longest, MAX_COLUMN_WIDTH);
  });

  const total = () => widths.reduce((sum, width) => sum + width, 0) + 2 * (widths.length - 1);
  while (total() > MAX_CHARS) {
    const widest = widths.indexOf(Math.max(...widths));
    if (widths[widest] <= 6) {
      break;
    }
    widths[widest] -= 1;
  }
  return widths;
}

function tableLines(columns, rows) {
  const widths = columnWidths(columns, rows);
  const line = (values) => values.map((value, i) => fit(value, widths[i])).join("  ").trimEnd();
  return [
    line(columns.map((column) => column.label)),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...rows.map((row) => line(columns.map((column) => row[column.key]))),
  ];
}

function toPdf({ title, summaryLines = [], columns, rows }) {
  const bodyLines = [
    ...summaryLines.map((line) => fit(line, MAX_CHARS).trimEnd()),
    "",
    ...(rows.length > 0 ? tableLines(columns, rows) : ["No rows to show."]),
  ];

  const pages = [];
  for (let start = 0; start < bodyLines.length; start += LINES_PER_PAGE) {
    pages.push(bodyLines.slice(start, start + LINES_PER_PAGE));
  }
  if (pages.length === 0) {
    pages.push([]);
  }

  // PDF objects: 1 catalog, 2 page list, 3 Courier, 4 Courier-Bold, then a page and its
  // content stream for every page.
  const objects = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((lines, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    let y = PAGE_HEIGHT - MARGIN;

    const commands = ["BT", `/F2 12 Tf 1 0 0 1 ${MARGIN} ${y} Tm (${pdfText(title)}) Tj`];
    y -= LINE_HEIGHT * 2;
    for (const text of lines) {
      commands.push(`/F1 ${FONT_SIZE} Tf 1 0 0 1 ${MARGIN} ${y} Tm (${pdfText(text)}) Tj`);
      y -= LINE_HEIGHT;
    }
    commands.push(
      `/F1 ${FONT_SIZE} Tf 1 0 0 1 ${MARGIN} ${MARGIN / 2} Tm (${pdfText(`Page ${index + 1} of ${pages.length}`)}) Tj`,
      "ET"
    );
    const stream = commands.join("\n");

    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });

  // Write the objects and remember where each one starts (the cross-reference table).
  let output = "%PDF-1.4\n";
  const offsets = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(output, "latin1");
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(output, "latin1");
}

module.exports = { toCsv, toPdf };
