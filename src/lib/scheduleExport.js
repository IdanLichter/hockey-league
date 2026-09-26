import { esc, zip } from './gameForm/xlsx.js'
import { gameTitle } from './ics.js'

/**
 * Export the games the /games page is currently showing, as CSV or .xlsx.
 *
 * Dates and times are rendered in Israel time explicitly (not the browser's zone):
 * the file gets forwarded, and a schedule opened abroad must still say 20:00.
 */

const IL = 'Asia/Jerusalem'
const dayFmt = new Intl.DateTimeFormat('he-IL', { timeZone: IL, weekday: 'long' })
const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: IL, day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: IL, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

const STATUS = { scheduled: 'מתוכנן', completed: 'הסתיים', waiting_result: 'ממתין', in_progress: 'במהלך', postponed: 'נדחה' }

const HEADERS = ['#', 'סוג', 'מארחת', 'אורחת', 'יום', 'תאריך', 'שעה', 'מגרש', 'סטטוס', 'תוצאה מארחת', 'תוצאה אורחת']

export function scheduleRows(games, teamsById) {
  return [...games]
    .sort((a, b) => new Date(a.game_date) - new Date(b.game_date))
    .map((g, i) => {
      const d = new Date(g.game_date)
      const done = g.status === 'completed'
      return [
        i + 1,
        g.game_type || '',
        teamsById[g.home_team_id]?.name || '',
        teamsById[g.away_team_id]?.name || '',
        dayFmt.format(d).replace('יום ', ''),
        dateFmt.format(d).replace(/\//g, '.'),
        timeFmt.format(d),
        g.venue || '',
        STATUS[g.status] || g.status || '',
        done ? g.home_score ?? '' : '',
        done ? g.away_score ?? '' : '',
      ]
    })
}

export function toCsv(games, teamsById) {
  const cell = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [HEADERS, ...scheduleRows(games, teamsById)].map(r => r.map(cell).join(','))
  // The BOM is what makes Excel read the file as UTF-8 — without it Hebrew opens as mojibake.
  return '﻿' + lines.join('\r\n') + '\r\n'
}

// ---- xlsx: one right-to-left sheet, bold header row, frozen, sized columns ----
const COLS = 'ABCDEFGHIJK'
const WIDTHS = [5, 10, 18, 18, 9, 12, 8, 14, 10, 12, 12]

const XLSX_PARTS = {
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="לוח משחקים" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  // Style 0 = default, 1 = bold header on a light fill.
  'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F5"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>',
}

function sheet(rows) {
  const cell = (c, r, v, s) => {
    const st = s ? ` s="${s}"` : ''
    if (typeof v === 'number') return `<c r="${c}${r}"${st}><v>${v}</v></c>`
    if (v === '' || v == null) return ''
    return `<c r="${c}${r}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
  }
  const body = rows.map((row, i) =>
    `<row r="${i + 1}">${row.map((v, j) => cell(COLS[j], i + 1, v, i === 0 ? 1 : 0)).join('')}</row>`).join('')
  const cols = WIDTHS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`
}

export function toXlsx(games, teamsById) {
  return zip({ ...XLSX_PARTS, 'xl/worksheets/sheet1.xml': sheet([HEADERS, ...scheduleRows(games, teamsById)]) })
}

export function downloadBlob(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export { gameTitle }
