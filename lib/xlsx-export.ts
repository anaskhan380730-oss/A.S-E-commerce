export type XlsxSheet = {
  name: string;
  rows: (string | number | null)[][];
  widths: number[];
  freezeRows?: number;
  filterRange?: string;
  mergeCells?: string[];
  cellStyles?: Record<number, Record<number, number>>;
};

const encoder = new TextEncoder();

function xml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function columnName(index: number) {
  let name = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
  return name;
}

function worksheetXml(sheet: XlsxSheet) {
  const content = sheet.rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      const style = sheet.cellStyles?.[rowIndex]?.[columnIndex];
      const styleAttribute = style === undefined ? '' : ` s="${style}"`;
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
      return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${xml(String(value ?? ''))}</t></is></c>`;
    }).join('');
    const height = rowIndex === 0 ? ' ht="32" customHeight="1"' : rowIndex === 3 ? ' ht="30" customHeight="1"' : '';
    return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
  }).join('');
  const columns = sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  const views = sheet.freezeRows ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
  const filter = sheet.filterRange ? `<autoFilter ref="${sheet.filterRange}"/>` : '';
  const merges = sheet.mergeCells?.length ? `<mergeCells count="${sheet.mergeCells.length}">${sheet.mergeCells.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${views}<cols>${columns}</cols><sheetData>${content}</sheetData>${filter}${merges}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

function stylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;PKR &quot;#,##0;[Red]-&quot;PKR &quot;#,##0"/><numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00;[Red]-&quot;$&quot;#,##0.00"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF3B2D1D"/><name val="Calibri"/></font><font><b/><sz val="13"/><color rgb="FF80633B"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3B2D1D"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5EFE4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE1D8C8"/></left><right style="thin"><color rgb="FFE1D8C8"/></right><top style="thin"><color rgb="FFE1D8C8"/></top><bottom style="thin"><color rgb="FFE1D8C8"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/><xf numFmtId="165" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function header(length: number, fields: [number, number, number][]) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  for (const [offset, value, size] of fields) {
    if (size === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
  }
  return bytes;
}

function join(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function zip(files: { name: string; text: string }[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const checksum = crc32(data);
    const local = header(30, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 33, 2], [14, checksum, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]);
    localParts.push(local, name, data);
    const central = header(46, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 33, 2], [16, checksum, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, localOffset, 4]]);
    centralParts.push(central, name);
    localOffset += local.length + name.length + data.length;
  }
  const centralDirectory = join(centralParts);
  const end = header(22, [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, centralDirectory.length, 4], [16, localOffset, 4], [20, 0, 2]]);
  return join([...localParts, centralDirectory, end]);
}

export function createXlsx(sheets: XlsxSheet[]) {
  const sheetParts = sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, text: worksheetXml(sheet) }));
  const overrides = sheetParts.map(part => `<Override PartName="/${part.name}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const sheetNodes = sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  const worksheetRels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  const styleRel = `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  const parts = [
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>` },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNodes}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${worksheetRels}${styleRel}</Relationships>` },
    ...sheetParts,
    { name: 'xl/styles.xml', text: stylesXml() },
  ];
  return zip(parts);
}
