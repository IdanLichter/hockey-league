import { FileDiff, ExternalLink, GitCommit } from 'lucide-react'
import { stageLabel, stageBadge, changedFiles, issueUrl } from '@/lib/liveEdit'

/**
 * Pieces shared by the two views that describe a run: the progress card that
 * appears right after sending, and every row of the history sheet.
 */

export function StageChip({ stage }) {
  return <span className={`stat-pill ${stageBadge(stage)} shrink-0`}>{stageLabel(stage)}</span>
}

const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1)
const baseOf = (p) => p.slice(p.lastIndexOf('/') + 1)

/**
 * What actually changed. This is the whole point of the view: the last run made
 * a change so small the admin couldn't find it on the page, so the file list and
 * the line counts are the evidence that something happened at all.
 */
export function ChangedFiles({ commit }) {
  const files = changedFiles(commit)
  const add = Number(commit?.additions)
  const del = Number(commit?.deletions)
  const hasCounts = Number.isFinite(add) || Number.isFinite(del)

  if (!files.length && !hasCounts) return null

  return (
    <div className="rounded-xl bg-surface-inset border border-line-subtle p-3 space-y-2">
      <div className="flex items-center gap-2">
        <FileDiff className="size-3.5 text-fg-muted shrink-0" />
        <span className="text-xs font-bold text-fg-muted flex-1">מה השתנה בקוד</span>
        {hasCounts && (
          // Digits and signs are one LTR run; without dir they scatter across
          // the RTL line.
          <span dir="ltr" className="text-2xs font-bold tabular-nums shrink-0">
            <span className="text-pos">+{Number.isFinite(add) ? add : 0}</span>
            {' '}
            <span className="text-neg">−{Number.isFinite(del) ? del : 0}</span>
          </span>
        )}
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.path} className="flex items-baseline gap-2">
              <span dir="ltr" className="text-2xs flex-1 min-w-0 truncate text-start">
                <span className="text-fg-subtle">{dirOf(f.path)}</span>
                <span className="font-semibold text-fg-soft">{baseOf(f.path)}</span>
              </span>
              {(f.additions !== null || f.deletions !== null) && (
                <span dir="ltr" className="text-2xs tabular-nums shrink-0">
                  <span className="text-pos">+{f.additions ?? 0}</span>
                  {' '}
                  <span className="text-neg">−{f.deletions ?? 0}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The agent's own words. Absent while it is still working, and on old runs. */
export function AgentSummary({ summary }) {
  if (!summary) return null
  return <p className="text-sm text-fg-soft whitespace-pre-line">{summary}</p>
}

export function RunLinks({ item, issueHref }) {
  const issue = issueHref || issueUrl(item)
  const commit = item?.commit?.url
  const short = item?.commit?.shortSha || (item?.commit?.sha ? String(item.commit.sha).slice(0, 7) : '')
  if (!issue && !commit) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {issue && (
        <a href={issue} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">
          <ExternalLink className="size-3.5" />
          <span>הבקשה</span>
          {Number.isFinite(Number(item?.number)) && <span dir="ltr">#{item.number}</span>}
        </a>
      )}
      {commit && (
        <a href={commit} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">
          <GitCommit className="size-3.5" />
          <span>הקומיט</span>
          {short && <span dir="ltr">{short}</span>}
        </a>
      )}
    </div>
  )
}
