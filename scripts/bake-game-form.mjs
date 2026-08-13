#!/usr/bin/env node
/**
 * Bake the league's blank refereeing form (טופס שיפוט ליגת הוקי גלגליות) into a JS
 * module the browser can fill in and hand back as a real .xlsx.
 *
 * Why bake instead of shipping the .xlsx and patching it at runtime: the export has
 * to survive both deploy targets with no extra fetch, and every byte of styling in
 * the original must come through untouched. So we copy every package part VERBATIM
 * except the worksheet, and turn the worksheet into a plain row/cell model whose
 * style ids are exactly the ones the original used. Fill a value in, serialize, zip
 * — the result is byte-compatible with what Excel wrote, minus our new content.
 *
 * Two deliberate transformations:
 *   1. sharedStrings are resolved to inline strings (and the part + its relationship
 *      + its content-type override are dropped). A shared-string table that the
 *      filler would have to append to is pure friction; inline strings are local.
 *   2. Rows 47-1000 — Google Sheets' empty grid filler, no cells — are dropped. They
 *      carry nothing and would have to be renumbered on every row insertion.
 *
 * Run after replacing scripts/game-form-blank.xlsx:
 *   node scripts/bake-game-form.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, 'game-form-blank.xlsx')
const OUT = join(HERE, '..', 'src', 'lib', 'gameForm', 'template.js')

// The last row of the form proper. Everything past it is empty filler.
const LAST_ROW = 46

// ---- minimal zip reader (central directory → { name: Buffer }) ----
function unzip(buf) {
  const eocd = (() => {
    for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) return i
    throw new Error('not a zip: no end-of-central-directory record')
  })()
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = {}
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry')
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    // Re-read the name/extra lengths from the LOCAL header — they are allowed to
    // differ from the central directory's, and the data starts after them.
    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const start = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compSize)
    out[name] = method === 0 ? Buffer.from(raw) : inflateRawSync(raw)
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

// ---- sheet parsing ----
const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, '&')   // last: an encoded &amp;lt; must not become '<'

function sharedStrings(xml) {
  if (!xml) return []
  return [...xml.matchAll(/<si>(.*?)<\/si>/gs)].map(([, si]) =>
    [...si.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(([, t]) => decodeXml(t)).join(''))
}

function parseSheet(xml, strings) {
  const dataStart = xml.indexOf('<sheetData>')
  const dataEnd = xml.indexOf('</sheetData>')
  if (dataStart < 0 || dataEnd < 0) throw new Error('no sheetData')

  const head = xml.slice(0, dataStart)
  const tail = xml.slice(dataEnd + '</sheetData>'.length)

  // The XML declaration + <worksheet> open tag, namespace declarations and all —
  // the drawing reference in the tail needs the `r:` namespace this carries.
  const docOpen = head.slice(0, head.search(/<sheetPr|<sheetViews|<sheetData/))
  const cols = /<cols>.*?<\/cols>/s.exec(head)?.[0] || ''
  const sheetPr = /<sheetPr>.*?<\/sheetPr>|<sheetPr\/>/s.exec(head)?.[0] || ''
  const sheetViews = /<sheetViews>.*?<\/sheetViews>/s.exec(head)?.[0] || ''
  const sheetFormatPr = /<sheetFormatPr[^>]*\/>/s.exec(head)?.[0] || ''
  const merges = [...(/<mergeCells[^>]*>(.*?)<\/mergeCells>/s.exec(tail)?.[1] || '')
    .matchAll(/ref="([A-Z]+\d+:[A-Z]+\d+)"/g)].map(m => m[1])
  // Everything after the merge list (printOptions, margins, pageSetup, drawing).
  const afterMerges = tail.slice(tail.indexOf('</mergeCells>') + '</mergeCells>'.length)

  const rows = []
  const rowRe = /<row r="(\d+)"([^>]*?)(?:\/>|>(.*?)<\/row>)/gs
  for (const m of xml.slice(dataStart, dataEnd).matchAll(rowRe)) {
    const r = +m[1]
    if (r > LAST_ROW) continue
    const ht = /ht="([\d.]+)"/.exec(m[2])?.[1]
    const cells = []
    for (const c of (m[3] || '').matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const cell = { c: c[1] }
      const s = /s="(\d+)"/.exec(c[2])?.[1]
      if (s != null) cell.s = +s
      const t = /t="(\w+)"/.exec(c[2])?.[1]
      const v = /<v>(.*?)<\/v>/s.exec(c[3] || '')?.[1]
      if (t === 's') cell.str = strings[+v] ?? ''
      else if (t === 'inlineStr') cell.str = decodeXml(/<t[^>]*>(.*?)<\/t>/s.exec(c[3] || '')?.[1] || '')
      else if (v != null) cell.num = Number(v)
      cells.push(cell)
    }
    rows.push(ht ? { r, ht: Number(ht), cells } : { r, cells })
  }
  return { docOpen, sheetPr, sheetViews, sheetFormatPr, cols, rows, merges, afterMerges }
}

// ---- bake ----
const parts = unzip(readFileSync(SRC))
const text = (name) => parts[name]?.toString('utf8')

const sheetXml = text('xl/worksheets/sheet1.xml')
if (!sheetXml) throw new Error('xl/worksheets/sheet1.xml missing')
const sheet = parseSheet(sheetXml, sharedStrings(text('xl/sharedStrings.xml')))

// Ship every part except the worksheet (regenerated per export) and sharedStrings
// (resolved to inline strings above), with the two references to it removed.
const VERBATIM = [
  '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
  'xl/styles.xml', 'xl/theme/theme1.xml', 'xl/persons/person.xml',
  'xl/drawings/drawing1.xml', 'xl/worksheets/_rels/sheet1.xml.rels',
]
const files = {}
for (const name of VERBATIM) {
  let body = text(name)
  if (body == null) continue          // person/drawing parts are optional
  if (name === 'xl/_rels/workbook.xml.rels') body = body.replace(/<Relationship\b[^>]*sharedStrings[^>]*\/>/g, '')
  if (name === '[Content_Types].xml') body = body.replace(/<Override\b[^>]*sharedStrings[^>]*\/>/g, '')
  files[name] = body
}

const js = `// GENERATED by scripts/bake-game-form.mjs from scripts/game-form-blank.xlsx.
// Do not edit by hand — re-run the script instead.
//
// The league's blank refereeing form, as data. \`FILES\` are the .xlsx package parts
// copied verbatim (styles, theme, workbook, rels); \`SHEET\` is the worksheet as rows
// of cells that keep the original's style ids, so anything we write into a cell
// inherits the exact borders/fonts/fill the form was drawn with.
/* eslint-disable */

export const FILES = ${JSON.stringify(files, null, 2)}

export const SHEET = ${JSON.stringify(sheet, null, 2)}
`

writeFileSync(OUT, js)
const kb = (n) => `${(n / 1024).toFixed(1)}kB`
console.log(`baked ${sheet.rows.length} rows, ${sheet.merges.length} merges, ${Object.keys(files).length} parts`)
console.log(`→ ${OUT} (${kb(js.length)})`)
