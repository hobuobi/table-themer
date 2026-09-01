import React, { useState, useEffect, useRef, useMemo, useCallback, useReducer } from "react";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  RotateCw,
  ChevronDown,
  Share2,
  Presentation,
  FileText,
  Braces,
  CornerDownRight,
  Play,
  Pause,
  Square,
  MessageSquareText,
  MessageSquare,
} from "lucide-react";
import { buildSeedState, SIM_WINDOW_MS } from "./seedData.js";
import { uid } from "./uid.js";

/* ---------------------------------------------------------------
   Table Themer — build a themed synthesis of one question's
   comments. Comments arrive per table (websocket / simulator later);
   themes are written by hand, promoted from a comment, or generated.
------------------------------------------------------------------*/

const C = {
  ink: "#15171A",
  body: "#33383F",
  mute: "#8A8F98",
  faint: "#AEB2BA",
  line: "#ECECEE",
  lineSoft: "#F3F3F4",
  bg: "#FFFFFF",
  blue: "#3B4DA6",
  blueSoft: "#E9ECF9",
  green: "#2F8A4E",
  greenSoft: "#E5F1E9",
  greenMid: "#3E9E5E",
  orange: "#E0892E",
  orangeSoft: "#FBEEDD",
  redX: "#E5484D",
  redSoft: "#FCECEC",
};

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body {
  margin: 0;
  background: ${C.bg};
  overflow-x: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  color: ${C.ink};
}
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; padding: 0; }
input, textarea { font: inherit; }
::selection { background: ${C.blueSoft}; }
[role="button"]:focus { outline: none; }
[role="button"]:focus-visible { outline: 2px solid ${C.blue}; outline-offset: -2px; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes ttFlash {
  0% { background-color: #FFFFFF; }
  9% { background-color: #D6DBF1; }
  100% { background-color: #FFFFFF; }
}
@keyframes ttFadeUp { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
@keyframes ttSlideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
@keyframes ttSlideLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }
@keyframes ttPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
.tt-hover { opacity: 0 !important; pointer-events: none; }
.tt-row:hover .tt-hover { opacity: 1 !important; pointer-events: auto; }
.tt-comment:hover { background: ${C.lineSoft}; }
.tt-theme-row:hover { background: rgba(88,197,255,0.05); }
.tt-theme-main:hover .tt-theme-text { color: ${C.blue} !important; }
.tt-theme-main:hover .tt-attrib-pill { background: ${C.blue} !important; color: #fff !important; }
.tt-attrib-text:hover { color: ${C.blue}; }
.tt-badge-del, .tt-abadge-del { position: relative; display: inline-flex; flex-shrink: 0; }
.tt-badge-x, .tt-abadge-x {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: ${C.redX}; opacity: 0; transition: opacity 0.1s;
}
.tt-badge-x { border-radius: 6px; }
.tt-abadge-x { border-radius: 4px; }
.tt-badge-del:hover .tt-badge-x, .tt-abadge-del:hover .tt-abadge-x { opacity: 1; }
.tt-present-row:hover .tt-present-text { color: ${C.blue}; }
@media (hover: none), (max-width: 768px) {
  .tt-hover { opacity: 1 !important; pointer-events: auto !important; }
}
`;

const MAX_THEME_LEN = 100;
const STORAGE_KEY = "tt:v2";
const MOBILE_Q = "(max-width: 768px)";

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MOBILE_Q).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_Q);
    const handler = (e) => setMobile(e.matches);
    setMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return mobile;
}

/* ---------------- persistence ---------------- */

function loadState() {
  const seed = buildSeedState();

  let parsed = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch (e) {
    /* fall through to seed */
  }

  if (!parsed) {
    const themes = {};
    const candidates = {};
    seed.questions.forEach((q) => {
      themes[q.id] = [];
      candidates[q.id] = [];
    });
    return {
      questions: seed.questions,
      activeId: seed.questions[0].id,
      comments: seed.comments,
      themes,
      candidates,
    };
  }

  // Backfill simOffset onto comments persisted before the simulator existed.
  const offsetById = new Map();
  Object.values(seed.comments)
    .flat()
    .forEach((c) => offsetById.set(c.id, c.simOffset));
  Object.keys(parsed.comments || {}).forEach((qid) => {
    parsed.comments[qid] = parsed.comments[qid].map((c) => ({
      ...c,
      simOffset: c.simOffset ?? offsetById.get(c.id) ?? 0,
    }));
  });
  return parsed;
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Table Themer: could not persist state", e);
  }
}

/* ---------------- helpers ---------------- */

function makeTheme({
  text,
  source,
  sourceCommentId = null,
  informingCommentIds = [],
  representativeCommentIds = [],
  similarThemeIds = [],
}) {
  return {
    id: uid(),
    text: text.slice(0, MAX_THEME_LEN),
    source, // "AI" | "MANUAL" | "COMMENT"
    sourceCommentId,
    informingCommentIds,
    representativeCommentIds,
    similarThemeIds,
    createdAt: Date.now(),
  };
}

function download(name, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SOURCE_LABEL = { AI: "AI", MANUAL: "Manual", COMMENT: "Comment" };

function abbrev(text, max = 34) {
  const t = (text || "").trim();
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
}

// Custom drag image: a small inverted chip (dark blue, white text/icon)
// with an abbreviated comment, used in place of the default row ghost.
function setDragChip(e, text) {
  const chip = document.createElement("div");
  chip.style.cssText = [
    "position:fixed",
    "top:-1000px",
    "left:-1000px",
    "display:flex",
    "align-items:center",
    "gap:6px",
    "max-width:260px",
    "padding:7px 11px",
    "border-radius:8px",
    "background:#2C3781",
    "color:#fff",
    "font:600 12.5px/1.2 Inter,-apple-system,sans-serif",
    "white-space:nowrap",
    "overflow:hidden",
    "box-shadow:0 8px 20px rgba(20,23,26,0.35)",
    "pointer-events:none",
    "z-index:9999",
  ].join(";");
  chip.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" ' +
    'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/>' +
    '<line x1="8" x2="16" y1="12" y2="12"/></svg>';
  const label = document.createElement("span");
  label.textContent = abbrev(text, 34);
  chip.appendChild(label);
  document.body.appendChild(chip);
  e.dataTransfer.setDragImage(chip, 14, 16);
  setTimeout(() => chip.remove(), 0);
}

/* ---------------- atoms ---------------- */

function SourceBadge({ source, size = 26 }) {
  const spec =
    source === "AI"
      ? { bg: C.green, node: <Sparkles size={Math.round(size * 0.52)} color="#fff" strokeWidth={2.4} /> }
      : source === "COMMENT"
      ? { bg: C.blue, node: "T" }
      : { bg: C.orange, node: "M" };
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: spec.bg,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.46),
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {spec.node}
    </span>
  );
}

function Spinner({ size = 18 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2.5px solid ${C.line}`,
        borderTopColor: C.blue,
        display: "inline-block",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

/* ---------------- comments panel ---------------- */

const COLLAPSED_COUNT = 2;

function fmtClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function CommentItem({ c, onUseComment, onDragStartComment, onDragEndComment, draggable }) {
  const canDrag = !!draggable && !!onDragStartComment;
  return (
    <div
      className="tt-comment tt-row"
      role="button"
      tabIndex={0}
      style={{ ...s.commentRow, ...(canDrag ? { cursor: "grab" } : { cursor: "pointer" }) }}
      draggable={canDrag}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/tt-comment", c.id);
        e.dataTransfer.setData("text/plain", c.text);
        e.dataTransfer.effectAllowed = "copyMove";
        setDragChip(e, c.text);
        onDragStartComment && onDragStartComment(c.id);
      }}
      onDragEnd={() => onDragEndComment && onDragEndComment()}
      onClick={() => onUseComment(c)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onUseComment(c);
        }
      }}
      title={
        canDrag
          ? "Click to add as a theme · drag onto a theme to attribute"
          : "Tap to add as a theme"
      }
    >
      <span style={s.commentBadge}>T{c.tableNum}</span>
      <span style={s.commentText}>{c.text}</span>
      <ArrowRight
        className="tt-hover"
        size={15}
        color={C.faint}
        style={{ ...s.commentArrow, opacity: 0 }}
      />
    </div>
  );
}

function CommentsPanel({
  comments,
  onUseComment,
  onCopyAll,
  sim,
  simControls,
  mobile,
  onClose,
  onCommentDragStart,
  onCommentDragEnd,
}) {
  const simActive = !!sim;
  const done = simActive && sim.elapsed >= sim.duration;
  const revealed = simActive
    ? comments.filter((c) => (c.simOffset ?? 0) <= sim.elapsed)
    : comments;

  const groups = useMemo(() => {
    const map = new Map();
    comments.forEach((c) => {
      if (!map.has(c.tableId)) map.set(c.tableId, { name: c.tableName, num: c.tableNum, items: [] });
      map.get(c.tableId).items.push(c);
    });
    return [...map.values()].sort((a, b) => a.num - b.num);
  }, [comments]);

  // Newest first — a live feed reads top-down.
  const chrono = useMemo(
    () => [...revealed].sort((a, b) => (b.simOffset ?? 0) - (a.simOffset ?? 0)),
    [revealed]
  );

  const [mode, setMode] = useState("grouped"); // "grouped" | "chrono"
  const [expandedNum, setExpandedNum] = useState(null); // one table open at a time; null = all collapsed

  const revealedCount = (g) =>
    simActive ? g.items.filter((c) => (c.simOffset ?? 0) <= sim.elapsed).length : g.items.length;

  // Flash a table header blue when a comment lands in it (sim / live only).
  const prevCounts = useRef({});
  const [flashAt, setFlashAt] = useState({});
  useEffect(() => {
    const prev = prevCounts.current;
    const hits = {};
    groups.forEach((g) => {
      const count = revealedCount(g);
      if (simActive && prev[g.num] != null && count > prev[g.num]) hits[g.num] = Date.now();
      prev[g.num] = count;
    });
    if (Object.keys(hits).length) setFlashAt((f) => ({ ...f, ...hits }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, simActive, sim ? sim.elapsed : null]);

  return (
    <aside style={{ ...s.sidebar, ...(mobile ? s.sidebarMobile : {}) }}>
      <div style={{ ...s.sidebarHead, ...(mobile ? s.sidebarHeadMobile : {}) }}>
        <div style={s.sidebarTitleRow}>
          <h2 style={s.sidebarTitle}>Comments</h2>
          {mobile && (
            <button style={s.panelClose} onClick={onClose} aria-label="Close comments">
              <X size={20} />
            </button>
          )}
        </div>
        <div style={s.sidebarSubRow}>
          <span style={s.livePill}>
            <span style={s.liveDot} />
            LIVE
          </span>
          <button style={s.linkBtn} onClick={onCopyAll}>
            Copy All
          </button>
        </div>
        <div style={s.viewToggle}>
          <button
            style={mode === "grouped" ? s.viewToggleOn : s.viewToggleOff}
            onClick={() => setMode("grouped")}
          >
            By table
          </button>
          <button
            style={mode === "chrono" ? s.viewToggleOn : s.viewToggleOff}
            onClick={() => setMode("chrono")}
          >
            Chronological
          </button>
        </div>
      </div>

      <div style={{ ...s.sidebarScroll, ...(mobile ? s.sidebarScrollMobile : {}) }}>
        {mode === "chrono" &&
          (chrono.length === 0 ? (
            <div style={s.simTableEmpty}>No comments yet</div>
          ) : (
            chrono.map((c) => (
              <CommentItem
                key={c.id}
                c={c}
                onUseComment={onUseComment}
                onDragStartComment={onCommentDragStart}
                onDragEndComment={onCommentDragEnd}
                draggable={!mobile}
              />
            ))
          ))}

        {mode === "grouped" &&
          groups.map((g) => {
            const expanded = expandedNum === g.num;
            const gRevealed = simActive
              ? g.items.filter((c) => (c.simOffset ?? 0) <= sim.elapsed)
              : g.items;
            const shown = expanded ? gRevealed : gRevealed.slice(-COLLAPSED_COUNT);
            const hidden = gRevealed.length - shown.length;
            return (
              <div key={g.num}>
                <button
                  key={flashAt[g.num] || "h"}
                  style={{
                    ...s.tableHeader,
                    ...(mobile ? { position: "static" } : {}),
                    ...(flashAt[g.num] ? { animation: "ttFlash 1.8s ease-out" } : {}),
                  }}
                  onClick={() => setExpandedNum(expanded ? null : g.num)}
                >
                  <ChevronDown
                    size={13}
                    color={C.faint}
                    style={{
                      transform: expanded ? "none" : "rotate(-90deg)",
                      transition: "transform 0.12s",
                      flexShrink: 0,
                    }}
                  />
                  TABLE {g.num} ({g.items.length})
                </button>
                {simActive && gRevealed.length === 0 && (
                  <div style={s.simTableEmpty}>No comments yet</div>
                )}
                {shown.map((c) => (
                  <CommentItem
                    key={c.id}
                    c={c}
                    onUseComment={onUseComment}
                    onDragStartComment={onCommentDragStart}
                    onDragEndComment={onCommentDragEnd}
                    draggable={!mobile}
                  />
                ))}
                {hidden > 0 && (
                  <button style={s.moreRow} onClick={() => setExpandedNum(g.num)}>
                    Show {hidden} more
                  </button>
                )}
              </div>
            );
          })}
      </div>

      {simActive ? (
        <div style={{ ...s.simBar, ...(mobile ? s.simBarMobile : {}) }}>
          <div style={s.simEdgeTrack}>
            <div
              style={{
                ...s.simEdgeFill,
                width: `${Math.min(100, (sim.elapsed / sim.duration) * 100)}%`,
              }}
            />
          </div>
          <div style={s.simBarTop}>
            <span style={s.simBarLabel}>
              <span style={{ ...s.liveDot, background: "#fff" }} />
              {done ? "COMPLETE" : sim.status === "paused" ? "PAUSED" : "SIMULATING"}
            </span>
            <span style={s.simClock}>
              {fmtClock(Math.min(sim.elapsed, sim.duration))} / {fmtClock(sim.duration)}
            </span>
          </div>
          <div style={s.simBtnRow}>
            {sim.status === "running" && !done ? (
              <button style={s.simBtn} onClick={simControls.pause}>
                <Pause size={12} fill="currentColor" />
                Pause
              </button>
            ) : (
              <button style={s.simBtn} onClick={done ? simControls.start : simControls.resume}>
                <Play size={12} fill="currentColor" />
                {done ? "Restart" : "Start"}
              </button>
            )}
            <button style={s.simBtn} onClick={simControls.stop}>
              <Square size={11} fill="currentColor" />
              Stop
            </button>
            <button
              style={{ ...s.simBtn, ...(sim.speed === 2 ? s.simBtnOn : {}) }}
              onClick={() => simControls.setSpeed(sim.speed === 2 ? 1 : 2)}
            >
              2×
            </button>
          </div>
        </div>
      ) : (
        <div style={s.simFooter}>
          <button style={s.simTrigger} onClick={simControls.start}>
            <Play size={11} fill="currentColor" />
            Simulate incoming comments
          </button>
        </div>
      )}
    </aside>
  );
}

/* ---------------- theme composer ---------------- */

function ThemeComposer({ onAdd }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft("");
  };
  return (
    <div style={s.composer}>
      <input
        value={draft}
        maxLength={MAX_THEME_LEN}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Write a theme…"
        style={s.composerInput}
      />
      <button
        style={{ ...s.arrowBtn, opacity: draft.trim() ? 1 : 0.4 }}
        onClick={submit}
        disabled={!draft.trim()}
        title="Add theme"
      >
        <ArrowRight size={18} color="#fff" />
      </button>
    </div>
  );
}

/* ---------------- theme row (WYSIWYG) ---------------- */

// The theme's source badge doubles as its delete control: hover turns
// it into a red square with a white X.
function ThemeBadgeButton({ source, onDelete }) {
  return (
    <button
      className="tt-badge-del"
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      title="Remove theme"
    >
      <SourceBadge source={source} size={26} />
      <span className="tt-badge-x">
        <X size={14} color="#fff" strokeWidth={3} />
      </span>
    </button>
  );
}

// Attributed-comment badge (light blue / dark blue "T{n}"); hover to
// detach, mirroring the theme badge.
function AttribBadgeButton({ tableNum, onDetach }) {
  return (
    <button
      className="tt-abadge-del"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onDetach}
      title="Remove attribution"
    >
      <span style={s.attribBadgeFace}>T{tableNum}</span>
      <span className="tt-abadge-x">
        <X size={11} color="#fff" strokeWidth={3} />
      </span>
    </button>
  );
}

function ThemeRow({
  theme,
  attributedComments,
  isOver,
  mobile,
  onChange,
  onDelete,
  onAttach,
  onDetach,
  onOver,
  onThemeDragStart,
  onThemeDragEnd,
  onMergeCommentTheme,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(theme.text);
  const inputRef = useRef(null);
  const canDrag = theme.source === "COMMENT" && !!theme.sourceCommentId && !mobile && !editing;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(theme.text);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const v = draft.trim().slice(0, MAX_THEME_LEN);
    if (!v) {
      onDelete();
      return;
    }
    if (v !== theme.text) onChange(v);
  };

  const count = attributedComments.length;
  const showList = editing && count > 0;

  const dragKind = (e) => {
    const types = e.dataTransfer.types || [];
    if (types.includes("text/tt-comment-theme")) return "theme";
    if (types.includes("text/tt-comment")) return "comment";
    return null;
  };

  return (
    <div
      className="tt-row tt-theme-row"
      draggable={canDrag}
      style={{ ...s.themeRow, ...(isOver ? s.themeRowOver : {}) }}
      onDragStart={(e) => {
        if (!canDrag) return;
        e.dataTransfer.setData(
          "text/tt-comment-theme",
          JSON.stringify({ themeId: theme.id, commentId: theme.sourceCommentId })
        );
        e.dataTransfer.setData("text/plain", theme.text);
        e.dataTransfer.effectAllowed = "copyMove";
        setDragChip(e, theme.text);
        onThemeDragStart && onThemeDragStart();
      }}
      onDragEnd={() => onThemeDragEnd && onThemeDragEnd()}
      onDragOver={(e) => {
        const kind = dragKind(e);
        if (!kind) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = kind === "theme" ? "move" : "copy";
        onOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const commentId = e.dataTransfer.getData("text/tt-comment");
        if (commentId) {
          onAttach(commentId);
          return;
        }
        const raw = e.dataTransfer.getData("text/tt-comment-theme");
        if (raw) {
          try {
            const { themeId, commentId: cid } = JSON.parse(raw);
            if (themeId && themeId !== theme.id) onMergeCommentTheme(themeId, cid);
          } catch (_) {
            /* ignore malformed payload */
          }
        }
      }}
    >
      <div
        className="tt-theme-main"
        style={{ ...s.themeRowMain, cursor: canDrag ? "grab" : "pointer" }}
        onClick={() => {
          if (!editing) startEdit();
        }}
        title={editing ? undefined : "Click to edit"}
      >
        <ThemeBadgeButton source={theme.source} onDelete={onDelete} />
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            maxLength={MAX_THEME_LEN}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setDraft(theme.text);
                setEditing(false);
              }
            }}
            style={s.themeEditInput}
          />
        ) : (
          <span className="tt-theme-text" style={s.themeText}>
            {theme.text}
          </span>
        )}
        {count > 0 && (
          <span
            className="tt-attrib-pill"
            style={{ ...s.attribPill, ...(showList ? s.attribPillOn : {}) }}
            title={`${count} attributed comment${count === 1 ? "" : "s"}`}
          >
            <MessageSquare size={11} strokeWidth={2.6} />
            {count}
          </span>
        )}
      </div>

      {showList && (
        <div style={s.attribList}>
          {attributedComments.map((c) => (
            <div key={c.id} style={s.attribItem}>
              <span style={s.attribBadgeCell}>
                <AttribBadgeButton tableNum={c.tableNum} onDetach={() => onDetach(c.id)} />
              </span>
              <span className="tt-attrib-text" style={s.attribItemText}>
                {c.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- share menu ---------------- */

function ShareMenu({ onPresent, onReport, onJson, onClose }) {
  return (
    <>
      <div style={s.popScrim} onClick={onClose} />
      <div style={s.shareMenu}>
        <button style={s.shareItem} onClick={onPresent}>
          <Presentation size={15} color={C.body} />
          Present
        </button>
        <button style={s.shareItem} onClick={onReport}>
          <FileText size={15} color={C.body} />
          Download Report
        </button>
        <button style={s.shareItem} onClick={onJson}>
          <Braces size={15} color={C.body} />
          Download JSON
        </button>
      </div>
    </>
  );
}

/* ---------------- generate modal ---------------- */

function CandidateRow({ c, isOn, sims, comments, onToggle }) {
  const [open, setOpen] = useState(false);
  const count = comments.length;
  return (
    <div style={s.candidateRow}>
      <div
        className="tt-theme-main"
        style={{ ...s.candidateMain, cursor: count ? "pointer" : "default" }}
        onClick={() => count && setOpen((v) => !v)}
      >
        <SourceBadge source="AI" size={26} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="tt-theme-text" style={s.candidateText}>
            {c.text}
          </div>
          {sims.map((t) => (
            <div key={t.id} style={s.similarNote}>
              <CornerDownRight size={12} color={C.mute} />
              Similar to <span style={{ color: C.blue, fontWeight: 700 }}>#{t.index}</span>{" "}
              <span style={{ color: C.mute }}>({t.text})</span>
            </div>
          ))}
        </div>
        {count > 0 && (
          <span
            className="tt-attrib-pill"
            style={{ ...s.attribPill, ...(open ? s.attribPillOn : {}) }}
            title={`${count} comment${count === 1 ? "" : "s"}`}
          >
            <MessageSquare size={11} strokeWidth={2.6} />
            {count}
          </span>
        )}
        <button
          style={isOn ? s.checkOn : s.checkOff}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          title={isOn ? "Selected" : "Not selected"}
        >
          {isOn && <Check size={14} color="#fff" strokeWidth={3} />}
        </button>
      </div>
      {open && count > 0 && (
        <div style={s.attribList}>
          {comments.map((cm) => (
            <div key={cm.id} style={s.attribItem}>
              <span style={s.attribBadgeCell}>
                <span style={s.attribBadgeFace}>T{cm.tableNum}</span>
              </span>
              <span style={s.attribItemText}>{cm.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GenerateModal({
  status,
  error,
  candidates,
  themes,
  resolveComments,
  onRefresh,
  onClearAll,
  onAccept,
  onClose,
}) {
  const mobile = useIsMobile();
  const themeById = useMemo(() => {
    const m = new Map();
    themes.forEach((t, i) => m.set(t.id, { ...t, index: i + 1 }));
    return m;
  }, [themes]);

  const ordered = useMemo(() => {
    const withSimilar = (c) => (c.similarThemeIds || []).some((id) => themeById.has(id));
    return [...candidates].sort((a, b) => (withSimilar(b) ? 1 : 0) - (withSimilar(a) ? 1 : 0));
  }, [candidates, themeById]);

  const [selected, setSelected] = useState(() => new Set());
  useEffect(() => {
    setSelected(new Set(candidates.map((c) => c.id)));
  }, [candidates]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const chosen = ordered.filter((c) => selected.has(c.id));
  const loading = status === "loading";

  return (
    <div style={{ ...s.overlay, ...(mobile ? s.overlayMobile : {}) }} onClick={onClose}>
      <div
        style={{ ...s.modal, ...(mobile ? s.modalMobile : {}) }}
        onClick={(e) => e.stopPropagation()}
      >
        {mobile && (
          <button style={s.sheetGrabber} onClick={onClose} aria-label="Close">
            <ChevronDown size={20} color={C.faint} />
          </button>
        )}
        <div style={s.eyebrow}>CREATE THEMES FOR THIS QUESTION…</div>
        <h2 style={{ ...s.modalTitle, ...(mobile ? s.modalTitleMobile : {}) }}>
          Select the <span style={{ color: C.green }}>generated themes</span> you would like to keep.
        </h2>

        <div style={s.modalToolbar}>
          <div style={s.toolbarLeft}>
            <span style={s.toolLabel}>GENERATED THEMES</span>
            <span style={s.countPill}>{candidates.length}</span>
          </div>
          <div style={s.toolbarRight}>
            <button
              style={{ ...s.ghostBtn, ...(mobile ? s.toolBtnMobile : {}) }}
              onClick={onClearAll}
              disabled={loading || candidates.length === 0}
            >
              Clear All
            </button>
            <button
              style={{ ...s.softGreenBtn, ...(mobile ? s.toolBtnMobile : {}) }}
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? <Spinner size={13} /> : <RotateCw size={13} />}
              Refresh
            </button>
            <button
              style={{ ...s.greenBtn, ...(mobile ? s.toolBtnMobile : {}), opacity: chosen.length ? 1 : 0.45 }}
              onClick={() => onAccept(chosen)}
              disabled={!chosen.length || loading}
            >
              Accept {chosen.length} {chosen.length === 1 ? "theme" : "themes"}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div style={s.candidateList}>
          {loading && candidates.length === 0 && (
            <div style={s.modalStateBox}>
              <Spinner />
              <span>Reading every table's comments and clustering the ideas…</span>
            </div>
          )}

          {status === "error" && candidates.length === 0 && (
            <div style={s.modalStateBox}>
              <span style={{ color: C.redX }}>{error || "Something went wrong."}</span>
              <button style={s.softGreenBtn} onClick={onRefresh}>
                <RotateCw size={13} />
                Try again
              </button>
            </div>
          )}

          {!loading && status !== "error" && candidates.length === 0 && (
            <div style={s.modalStateBox}>
              <span>No candidate themes yet. Hit Refresh to generate a fresh set.</span>
            </div>
          )}

          {ordered.map((c) => (
            <CandidateRow
              key={c.id}
              c={c}
              isOn={selected.has(c.id)}
              sims={(c.similarThemeIds || []).map((id) => themeById.get(id)).filter(Boolean)}
              comments={resolveComments(
                c.representativeCommentIds && c.representativeCommentIds.length
                  ? c.representativeCommentIds
                  : c.informingCommentIds || []
              )}
              onToggle={() => toggle(c.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- present view ---------------- */

function RotatingLine({ items, style, paused }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
  }, [items.join("|")]);
  useEffect(() => {
    if (paused || items.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % items.length), 4200);
    return () => clearInterval(id);
  }, [items.length, items.join("|"), paused]);
  const idx = i % items.length;
  return (
    <div key={idx} style={{ ...style, animation: "ttFadeUp 0.4s ease" }}>
      “{items[idx]}”
    </div>
  );
}

function PresentView({ question, themes, repCommentsForTheme, onBack }) {
  const [hoverId, setHoverId] = useState(null);
  const mobile = useIsMobile();
  return (
    <div style={s.presentWrap}>
      <div style={{ ...s.presentInner, ...(mobile ? s.presentInnerMobile : {}) }}>
        <button style={s.backBtn} onClick={onBack}>
          <ArrowLeft size={15} />
          BACK
        </button>
        <h1 style={{ ...s.presentTitle, ...(mobile ? s.presentTitleMobile : {}) }}>
          {question.mainQuestion}
        </h1>
        <div style={s.presentCount}>
          {themes.length} {themes.length === 1 ? "theme" : "themes"}
        </div>
        <div style={s.presentList}>
          {themes.length === 0 && <div style={s.presentEmpty}>No themes yet.</div>}
          {themes.map((t, i) => {
            const reps = repCommentsForTheme(t).map((c) => c.text);
            return (
              <div
                key={t.id}
                className="tt-present-row"
                style={{ ...s.presentRow, ...(mobile ? s.presentRowMobile : {}) }}
                onMouseEnter={() => setHoverId(t.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <span style={{ ...s.presentNum, ...(mobile ? s.presentNumMobile : {}) }}>
                  {i + 1}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    className="tt-present-text"
                    style={{ ...s.presentThemeText, ...(mobile ? s.presentThemeTextMobile : {}) }}
                  >
                    {t.text}
                  </div>
                  {reps.length > 0 && (
                    <RotatingLine
                      items={reps}
                      style={{ ...s.presentQuote, ...(mobile ? s.presentQuoteMobile : {}) }}
                      paused={hoverId === t.id}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- question switcher ---------------- */

function QuestionSwitcher({ questions, activeId, onSelect }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button style={s.qTriangle} onClick={() => setOpen((v) => !v)} title="Switch question">
        <ChevronDown size={22} color={C.mute} />
      </button>
      {open && (
        <>
          <div style={s.popScrim} onClick={() => setOpen(false)} />
          <div style={{ ...s.qMenu, ...(mobile ? s.qMenuMobile : {}) }}>
            {questions.map((q) => (
              <button
                key={q.id}
                style={{
                  ...s.qMenuItem,
                  ...(q.id === activeId ? { color: C.blue, fontWeight: 700 } : {}),
                }}
                onClick={() => {
                  onSelect(q.id);
                  setOpen(false);
                }}
              >
                <span style={s.qMenuLabel}>{q.label}</span>
                <span style={s.qMenuText}>{q.mainQuestion}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/* ---------------- app ---------------- */

export default function App() {
  const mobile = useIsMobile();
  const [state, setState] = useState(null);
  const [view, setView] = useState("work"); // "work" | "present"
  const [showGenerate, setShowGenerate] = useState(false);
  const [genStatus, setGenStatus] = useState("idle"); // idle | loading | error
  const [genError, setGenError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false); // mobile slide-in panel
  const [dragging, setDragging] = useState(false); // a comment / COMMENT-theme is being dragged
  const [overThemeId, setOverThemeId] = useState(null); // theme row currently under the drag
  const [toast, setToast] = useState("");

  const endDrag = useCallback(() => {
    setDragging(false);
    setOverThemeId(null);
  }, []);
  // Demo simulator: replays the active question's comments over SIM_WINDOW_MS.
  // sim = { status: "running" | "paused", speed: 1 | 2, anchorTime, anchorElapsed }
  const [sim, setSim] = useState(null);
  const [, tick] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    setState(loadState());
  }, []);
  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  const simElapsed = !sim
    ? 0
    : sim.status === "running"
    ? sim.anchorElapsed + (Date.now() - sim.anchorTime) * sim.speed
    : sim.anchorElapsed;
  const simRunning = !!sim && sim.status === "running" && simElapsed < SIM_WINDOW_MS;

  useEffect(() => {
    if (!simRunning) return;
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [simRunning]);

  const simControls = useMemo(
    () => ({
      start: () => setSim({ status: "running", speed: 1, anchorTime: Date.now(), anchorElapsed: 0 }),
      resume: () => setSim((p) => (p ? { ...p, status: "running", anchorTime: Date.now() } : p)),
      pause: () =>
        setSim((p) => {
          if (!p) return p;
          const e =
            p.status === "running"
              ? p.anchorElapsed + (Date.now() - p.anchorTime) * p.speed
              : p.anchorElapsed;
          return { ...p, status: "paused", anchorElapsed: e };
        }),
      stop: () => setSim(null),
      setSpeed: (speed) =>
        setSim((p) => {
          if (!p) return p;
          const e =
            p.status === "running"
              ? p.anchorElapsed + (Date.now() - p.anchorTime) * p.speed
              : p.anchorElapsed;
          return { ...p, speed, anchorElapsed: e, anchorTime: Date.now() };
        }),
    }),
    []
  );

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }, []);

  const active = state && state.questions.find((q) => q.id === state.activeId);
  const comments = (state && state.comments[state.activeId]) || [];
  const themes = (state && state.themes[state.activeId]) || [];
  const candidates = (state && state.candidates[state.activeId]) || [];

  const setThemes = useCallback((fn) => {
    setState((prev) => ({
      ...prev,
      themes: { ...prev.themes, [prev.activeId]: fn(prev.themes[prev.activeId] || []) },
    }));
  }, []);
  const setCandidates = useCallback((fn) => {
    setState((prev) => ({
      ...prev,
      candidates: { ...prev.candidates, [prev.activeId]: fn(prev.candidates[prev.activeId] || []) },
    }));
  }, []);

  const commentById = useMemo(() => {
    const m = new Map();
    comments.forEach((c) => m.set(c.id, c));
    return m;
  }, [comments]);

  // Comments manually (or AI-) attributed to a theme — drives the row's
  // link pill and drag-drop attribution.
  const attributedCommentsFor = useCallback(
    (theme) => (theme.informingCommentIds || []).map((id) => commentById.get(id)).filter(Boolean),
    [commentById]
  );

  // Everything associated with a theme (origin comment + attributions),
  // for the report / JSON export.
  const commentsForTheme = useCallback(
    (theme) => {
      const ids = [];
      if (theme.source === "COMMENT" && theme.sourceCommentId) ids.push(theme.sourceCommentId);
      (theme.informingCommentIds || []).forEach((id) => ids.push(id));
      const seen = new Set();
      return ids
        .filter((id) => !seen.has(id) && seen.add(id))
        .map((id) => commentById.get(id))
        .filter(Boolean);
    },
    [commentById]
  );

  const repCommentsForTheme = useCallback(
    (theme) =>
      (theme.representativeCommentIds || []).map((id) => commentById.get(id)).filter(Boolean),
    [commentById]
  );

  /* --- theme mutations --- */
  const addManualTheme = (text) =>
    setThemes((list) => [...list, makeTheme({ text, source: "MANUAL" })]);

  const addCommentTheme = (comment) =>
    setThemes((list) => {
      if (list.some((t) => t.source === "COMMENT" && t.sourceCommentId === comment.id)) {
        flash("That comment is already a theme");
        return list;
      }
      if (mobile) flash("Added to themes");
      return [...list, makeTheme({ text: comment.text, source: "COMMENT", sourceCommentId: comment.id })];
    });

  const changeTheme = (id, text) =>
    setThemes((list) =>
      list.map((t) =>
        t.id === id
          ? t.source === "COMMENT"
            ? { ...t, text, source: "MANUAL", sourceCommentId: null } // edited away from its comment
            : { ...t, text }
          : t
      )
    );
  const deleteTheme = (id) => setThemes((list) => list.filter((t) => t.id !== id));

  const attributeComment = (themeId, commentId) => {
    if (!commentById.has(commentId)) return;
    let already = false;
    setThemes((list) =>
      list.map((t) => {
        if (t.id !== themeId) return t;
        const ids = t.informingCommentIds || [];
        if (ids.includes(commentId) || t.sourceCommentId === commentId) {
          already = true;
          return t;
        }
        return { ...t, informingCommentIds: [...ids, commentId] };
      })
    );
    const th = themes.find((t) => t.id === themeId);
    flash(already ? "Already attributed" : `Attributed to “${th ? th.text : "theme"}”`);
    endDrag();
  };

  const detachComment = (themeId, commentId) =>
    setThemes((list) =>
      list.map((t) => {
        if (t.id !== themeId) return t;
        const next = {
          ...t,
          informingCommentIds: (t.informingCommentIds || []).filter((id) => id !== commentId),
        };
        if (t.source === "COMMENT" && t.sourceCommentId === commentId) {
          next.source = "MANUAL";
          next.sourceCommentId = null;
        }
        return next;
      })
    );

  // Drag a COMMENT theme onto another theme: fold its comment into the
  // target's attributions and drop the standalone COMMENT theme.
  const mergeCommentTheme = (sourceThemeId, targetThemeId, commentId) => {
    if (sourceThemeId === targetThemeId) return;
    const target = themes.find((t) => t.id === targetThemeId);
    setThemes((list) =>
      list
        .map((t) => {
          if (t.id !== targetThemeId || !commentId || !commentById.has(commentId)) return t;
          const ids = t.informingCommentIds || [];
          if (ids.includes(commentId) || t.sourceCommentId === commentId) return t;
          return { ...t, informingCommentIds: [...ids, commentId] };
        })
        .filter((t) => t.id !== sourceThemeId)
    );
    flash(`Merged into “${target ? target.text : "theme"}”`);
    endDrag();
  };

  /* --- generation --- */
  const runGenerate = useCallback(async () => {
    if (genStatus === "loading") return;
    if (comments.length === 0) {
      setGenError("This question has no comments yet.");
      setGenStatus("error");
      return;
    }
    setGenStatus("loading");
    setGenError("");
    try {
      // Send short positional ids (comment index) so the model echoes back
      // compact id lists — long stable ids blow past max_tokens on big sets.
      const res = await fetch("/api/generate-themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainQuestion: active.mainQuestion,
          comments: comments.map((c, i) => ({ id: String(i), table: c.tableName, text: c.text })),
          existingThemes: themes.map((t, i) => ({ id: String(i), text: t.text })),
          previousCandidates: candidates.map((c) => ({ text: c.text })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }
      const data = await res.json();
      const commentAt = (i) => comments[Number(i)]?.id;
      const themeAt = (i) => themes[Number(i)]?.id;
      const next = (data.themes || [])
        .map((t) => {
          const reps = (t.representativeCommentIds || []).map(commentAt).filter(Boolean);
          return {
            id: uid(),
            text: (t.text || "").slice(0, MAX_THEME_LEN),
            // The model only returns representatives; treat them as the
            // theme's comments everywhere downstream (report, present).
            informingCommentIds: reps,
            representativeCommentIds: reps,
            similarThemeIds: (t.similarThemeIds || []).map(themeAt).filter(Boolean),
          };
        })
        .filter((t) => t.text);
      setCandidates(() => next);
      setGenStatus("idle");
    } catch (e) {
      console.error(e);
      setGenError(
        e.message && e.message !== "Failed to fetch"
          ? e.message
          : "Couldn't reach the theme generator API."
      );
      setGenStatus("error");
    }
  }, [genStatus, comments, active, themes, candidates, commentById, setCandidates]);

  const openGenerate = () => {
    setShowGenerate(true);
    if (candidates.length === 0) runGenerate();
  };

  const acceptCandidates = (chosen) => {
    setThemes((list) => {
      const seen = new Set(list.map((t) => t.text.toLowerCase()));
      const additions = chosen
        .filter((c) => !seen.has(c.text.toLowerCase()))
        .map((c) =>
          makeTheme({
            text: c.text,
            source: "AI",
            informingCommentIds: c.informingCommentIds,
            representativeCommentIds: c.representativeCommentIds,
            similarThemeIds: c.similarThemeIds,
          })
        );
      return [...list, ...additions];
    });
    setShowGenerate(false);
    flash(`Added ${chosen.length} ${chosen.length === 1 ? "theme" : "themes"}`);
  };

  /* --- share actions --- */
  const copyThemes = () => {
    navigator.clipboard
      .writeText(themes.map((t) => t.text).join("\n"))
      .then(() => flash("Themes copied"))
      .catch(() => flash("Copy failed"));
  };

  const copyAllComments = () => {
    const byTable = new Map();
    comments.forEach((c) => {
      if (!byTable.has(c.tableNum)) byTable.set(c.tableNum, []);
      byTable.get(c.tableNum).push(c.text);
    });
    const text = [...byTable.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([num, items]) => `TABLE ${num}\n${items.join("\n")}`)
      .join("\n\n");
    navigator.clipboard
      .writeText(text)
      .then(() => flash("All comments copied"))
      .catch(() => flash("Copy failed"));
  };

  const downloadReport = () => {
    const lines = [active.mainQuestion, ""];
    themes.forEach((t) => {
      lines.push(`${t.text}  [${SOURCE_LABEL[t.source]}]`);
      const cs = commentsForTheme(t);
      if (cs.length === 0) lines.push("   (no linked comments)");
      cs.forEach((c) => lines.push(`   • [${c.tableName}] ${c.text}`));
      lines.push("");
    });
    download("theme-report.txt", lines.join("\n"));
    setShareOpen(false);
  };

  const downloadJson = () => {
    const payload = {
      question: active.mainQuestion,
      generatedAt: new Date().toISOString(),
      themes: themes.map((t) => ({
        text: t.text,
        source: t.source,
        comments: commentsForTheme(t).map((c) => ({ table: c.tableName, text: c.text })),
      })),
    };
    download("themes.json", JSON.stringify(payload, null, 2), "application/json");
    setShareOpen(false);
  };

  if (!state) {
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <div style={{ ...s.appShell, alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: C.mute }}>Loading…</span>
        </div>
      </>
    );
  }

  if (view === "present") {
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <PresentView
          question={active}
          themes={themes}
          repCommentsForTheme={repCommentsForTheme}
          onBack={() => setView("work")}
        />
      </>
    );
  }

  const panel = (
    <CommentsPanel
      comments={comments}
      onUseComment={addCommentTheme}
      onCopyAll={copyAllComments}
      sim={sim ? { status: sim.status, speed: sim.speed, elapsed: simElapsed, duration: SIM_WINDOW_MS } : null}
      simControls={simControls}
      mobile={mobile}
      onClose={() => setCommentsOpen(false)}
      onCommentDragStart={() => setDragging(true)}
      onCommentDragEnd={endDrag}
    />
  );

  const workspace = (
    <main style={s.main}>
      <div style={{ ...s.mainInner, ...(mobile ? s.mainInnerMobile : {}) }}>
        {mobile && (
          <button style={s.commentsFab} onClick={() => setCommentsOpen(true)}>
            <MessageSquareText size={17} />
            <span style={s.commentsFabCount}>{comments.length}</span>
            {sim && <span style={s.commentsFabDot} />}
          </button>
        )}
        <div style={s.eyebrow}>CREATE THEMES FOR THIS QUESTION…</div>
        <div style={s.questionRow}>
          <h1 style={{ ...s.question, ...(mobile ? s.questionMobile : {}) }}>{active.mainQuestion}</h1>
          <QuestionSwitcher
            questions={state.questions}
            activeId={state.activeId}
            onSelect={(id) => {
              setSim(null);
              setState((prev) => ({ ...prev, activeId: id }));
            }}
          />
        </div>

        <ThemeComposer onAdd={addManualTheme} />

        <div style={s.listToolbar}>
          <div style={s.toolbarLeft}>
            <span style={s.toolLabel}>ALL THEMES</span>
            <span style={s.countPill}>{themes.length}</span>
          </div>
          <div style={s.toolbarRight}>
            <button style={{ ...s.generateBtn, ...(mobile ? s.toolBtnMobile : {}) }} onClick={openGenerate}>
              Generate
              <Sparkles size={14} color={C.green} />
            </button>
            <button
              style={{ ...s.copyBtn, ...(mobile ? s.toolBtnMobile : {}) }}
              onClick={copyThemes}
              disabled={themes.length === 0}
            >
              Copy
            </button>
            <span style={{ position: "relative", display: "inline-block" }}>
              <button
                style={{ ...s.shareBtn, ...(mobile ? s.toolBtnMobile : {}) }}
                onClick={() => setShareOpen((v) => !v)}
              >
                Share
                <Share2 size={13} color="#fff" />
              </button>
              {shareOpen && (
                <ShareMenu
                  onPresent={() => {
                    setShareOpen(false);
                    setView("present");
                  }}
                  onReport={downloadReport}
                  onJson={downloadJson}
                  onClose={() => setShareOpen(false)}
                />
              )}
            </span>
          </div>
        </div>

        <div
          style={s.themeList}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setOverThemeId(null);
          }}
        >
          {themes.length === 0 && (
            <div style={s.listEmpty}>
              {mobile
                ? "Write a theme above, open Comments to pull one in, or hit Generate."
                : "Write a theme above, click a comment on the left, or hit Generate."}
            </div>
          )}
          {themes.map((t) => (
            <ThemeRow
              key={t.id}
              theme={t}
              mobile={mobile}
              attributedComments={attributedCommentsFor(t)}
              isOver={dragging && overThemeId === t.id}
              onChange={(text) => changeTheme(t.id, text)}
              onDelete={() => deleteTheme(t.id)}
              onAttach={(commentId) => attributeComment(t.id, commentId)}
              onDetach={(commentId) => detachComment(t.id, commentId)}
              onOver={() => setOverThemeId(t.id)}
              onThemeDragStart={() => setDragging(true)}
              onThemeDragEnd={endDrag}
              onMergeCommentTheme={(sourceThemeId, commentId) =>
                mergeCommentTheme(sourceThemeId, t.id, commentId)
              }
            />
          ))}
        </div>
      </div>
    </main>
  );

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      {mobile ? (
        <div style={s.mobileShell}>
          {workspace}
          <div
            style={{
              ...s.mobilePanelWrap,
              ...(commentsOpen ? s.mobilePanelOpen : s.mobilePanelClosed),
            }}
          >
            {panel}
          </div>
        </div>
      ) : (
        <div style={s.appShell}>
          {panel}
          {workspace}
        </div>
      )}

      {showGenerate && (
        <GenerateModal
          status={genStatus}
          error={genError}
          candidates={candidates}
          themes={themes}
          resolveComments={(ids) => (ids || []).map((id) => commentById.get(id)).filter(Boolean)}
          onRefresh={runGenerate}
          onClearAll={() => setCandidates(() => [])}
          onAccept={acceptCandidates}
          onClose={() => setShowGenerate(false)}
        />
      )}

      {toast && <div style={s.toast}>{toast}</div>}
    </>
  );
}

/* ---------------- styles ---------------- */

const s = {
  appShell: {
    display: "flex",
    minHeight: "100vh",
    background: C.bg,
    color: C.ink,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },

  /* sidebar */
  sidebar: {
    width: 312,
    flexShrink: 0,
    borderRight: `1px solid ${C.line}`,
    height: "100vh",
    position: "sticky",
    top: 0,
    display: "flex",
    flexDirection: "column",
  },
  sidebarHead: { padding: "24px 20px 14px", borderBottom: `1px solid ${C.line}` },
  sidebarTitle: { margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" },
  sidebarSubRow: { display: "flex", alignItems: "center", gap: 14, marginTop: 10 },
  livePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: C.redSoft,
    color: C.redX,
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: "0.06em",
    padding: "3px 8px",
    borderRadius: 5,
  },
  liveDot: { width: 6, height: 6, borderRadius: "50%", background: C.redX, display: "inline-block" },
  linkBtn: { color: C.blue, fontSize: 12.5, fontWeight: 700 },
  sidebarScroll: { overflowY: "auto", flex: 1, paddingBottom: 40 },
  tableHeader: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    width: "100%",
    textAlign: "left",
    padding: "14px 20px 10px",
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: "0.1em",
    color: C.mute,
    background: C.bg,
    borderBottom: `1px solid ${C.line}`,
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  moreRow: {
    width: "100%",
    textAlign: "left",
    padding: "9px 20px",
    fontSize: 11.5,
    fontWeight: 700,
    color: C.blue,
    borderBottom: `1px solid ${C.lineSoft}`,
  },
  simTableEmpty: {
    padding: "8px 20px",
    fontSize: 11.5,
    color: C.faint,
    fontStyle: "italic",
    borderBottom: `1px solid ${C.lineSoft}`,
  },
  viewToggle: {
    display: "flex",
    gap: 4,
    marginTop: 12,
    padding: 3,
    background: C.lineSoft,
    borderRadius: 8,
  },
  viewToggleOn: {
    flex: 1,
    padding: "5px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    color: C.ink,
    background: C.bg,
    boxShadow: "0 1px 2px rgba(20,23,26,0.12)",
  },
  viewToggleOff: {
    flex: 1,
    padding: "5px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    color: C.mute,
  },
  simFooter: { padding: "12px 16px", borderTop: `1px solid ${C.line}` },
  simTrigger: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    color: "#fff",
    background: C.redX,
  },
  simBar: {
    position: "relative",
    padding: "14px 16px",
    background: C.redX,
    color: "#fff",
    boxShadow: "0 -8px 20px rgba(20,23,26,0.12)",
  },
  simEdgeTrack: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    background: "rgba(255,255,255,0.28)",
  },
  simEdgeFill: { height: "100%", background: "#fff", transition: "width 0.4s linear" },
  simBarTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  simBarLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: "0.08em",
    color: "#fff",
  },
  simClock: {
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,0.85)",
    fontVariantNumeric: "tabular-nums",
  },
  simBtnRow: { display: "flex", gap: 6 },
  simBtn: {
    flex: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "7px 6px",
    borderRadius: 7,
    fontSize: 11.5,
    fontWeight: 700,
    color: "#fff",
    background: "rgba(255,255,255,0.16)",
    border: `1px solid rgba(255,255,255,0.4)`,
  },
  simBtnOn: { background: "#fff", color: C.redX, borderColor: "#fff" },
  commentRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    textAlign: "left",
    padding: "10px 34px 10px 20px",
    borderBottom: `1px solid ${C.lineSoft}`,
    position: "relative",
  },
  commentBadge: {
    width: 20,
    height: 20,
    borderRadius: 4,
    background: C.blue,
    color: "#fff",
    fontSize: 9,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  commentText: {
    fontSize: 13,
    color: C.body,
    lineHeight: 1.4,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  },
  commentArrow: { position: "absolute", right: 12, top: 13, transition: "opacity 0.12s" },

  /* main */
  main: { flex: 1, minWidth: 0, display: "flex", justifyContent: "center" },
  mainInner: { width: "100%", maxWidth: 860, padding: "52px 48px 80px" },
  eyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: "0.09em", color: C.faint, marginBottom: 10 },
  questionRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 26 },
  question: { margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15 },
  qTriangle: { display: "inline-flex", padding: 4, borderRadius: 6 },

  /* composer */
  composer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    padding: "10px 10px 10px 20px",
    boxShadow: "0 1px 2px rgba(20,23,26,0.04)",
  },
  composerInput: { flex: 1, border: "none", outline: "none", fontSize: 16, color: C.ink, background: "transparent", padding: "8px 0" },
  arrowBtn: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: C.blue,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  /* list toolbar */
  listToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    margin: "26px 0 4px",
    flexWrap: "wrap",
  },
  toolbarLeft: { display: "flex", alignItems: "center", gap: 8 },
  toolbarRight: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  toolLabel: { fontSize: 11, fontWeight: 800, letterSpacing: "0.09em", color: C.mute },
  countPill: {
    background: C.blue,
    color: "#fff",
    fontSize: 11,
    fontWeight: 800,
    padding: "2px 8px",
    borderRadius: 999,
    minWidth: 22,
    textAlign: "center",
  },
  generateBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: C.greenSoft,
    color: C.green,
    fontWeight: 700,
    fontSize: 13,
    padding: "8px 14px",
    borderRadius: 999,
  },
  copyBtn: {
    display: "inline-flex",
    alignItems: "center",
    background: C.blueSoft,
    color: C.blue,
    fontWeight: 700,
    fontSize: 13,
    padding: "8px 14px",
    borderRadius: 999,
  },
  shareBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: C.blue,
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
    padding: "8px 14px",
    borderRadius: 999,
  },

  /* theme list */
  themeList: { marginTop: 8 },
  listEmpty: { padding: "40px 0", color: C.faint, fontSize: 14 },
  themeRow: {
    borderBottom: `1px solid ${C.line}`,
  },
  themeRowMain: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "18px 12px",
  },
  themeRowOver: {
    background: "rgba(88,197,255,0.03)",
    boxShadow: "inset 0 1px 0 #58C5FF, inset 0 -1px 0 #58C5FF",
  },
  attribPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    color: C.blue,
    background: C.blueSoft,
  },
  attribPillOn: { color: "#fff", background: C.blue },
  attribList: {
    display: "flex",
    flexDirection: "column",
    gap: 9,
    padding: "0 12px 16px 12px",
  },
  attribItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    fontSize: 13,
    color: C.body,
  },
  attribBadgeCell: { width: 26, display: "flex", justifyContent: "flex-end", flexShrink: 0, marginTop: 1 },
  attribBadgeFace: {
    width: 18,
    height: 18,
    borderRadius: 4,
    background: C.blueSoft,
    color: C.blue,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 8.5,
    fontWeight: 800,
  },
  attribItemText: { lineHeight: 1.4, transition: "color 0.12s" },
  themeText: {
    flex: 1,
    textAlign: "left",
    fontSize: 17,
    fontWeight: 700,
    color: C.ink,
    letterSpacing: "-0.01em",
    lineHeight: 1.3,
    transition: "color 0.12s",
  },
  themeEditInput: {
    flex: 1,
    border: `1px solid ${C.blue}`,
    borderRadius: 8,
    outline: "none",
    fontSize: 17,
    fontWeight: 700,
    color: C.ink,
    padding: "6px 10px",
  },

  /* share menu */
  popScrim: { position: "fixed", inset: 0, zIndex: 40 },
  shareMenu: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 8px)",
    zIndex: 41,
    background: C.bg,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    boxShadow: "0 12px 32px rgba(20,23,26,0.14)",
    padding: 6,
    minWidth: 190,
  },
  shareItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    textAlign: "left",
    padding: "9px 12px",
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 600,
    color: C.body,
  },

  /* question menu */
  qMenu: {
    position: "absolute",
    left: 0,
    top: "calc(100% + 8px)",
    zIndex: 41,
    background: C.bg,
    border: `1px solid ${C.line}`,
    borderRadius: 12,
    boxShadow: "0 12px 32px rgba(20,23,26,0.14)",
    padding: 6,
    width: 380,
  },
  qMenuItem: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 8,
    color: C.body,
  },
  qMenuLabel: { fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: C.mute },
  qMenuText: { fontSize: 13, lineHeight: 1.35 },

  /* modal */
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(20,23,26,0.32)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "60px 20px",
    zIndex: 60,
  },
  modal: {
    background: C.bg,
    borderRadius: 18,
    padding: 30,
    width: "100%",
    maxWidth: 680,
    maxHeight: "82vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 30px 70px rgba(20,23,26,0.3)",
  },
  modalTitle: { margin: "6px 0 20px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.2 },
  modalToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 14,
    borderBottom: `1px solid ${C.line}`,
    flexWrap: "wrap",
  },
  ghostBtn: { color: C.mute, fontSize: 12.5, fontWeight: 700, padding: "7px 10px" },
  softGreenBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: C.greenSoft,
    color: C.green,
    fontSize: 12.5,
    fontWeight: 700,
    padding: "7px 14px",
    borderRadius: 999,
  },
  greenBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: C.green,
    color: "#fff",
    fontSize: 12.5,
    fontWeight: 700,
    padding: "7px 16px",
    borderRadius: 999,
  },
  candidateList: { overflowY: "auto", marginTop: 4, flex: 1 },
  modalStateBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 14,
    padding: "34px 4px",
    color: C.mute,
    fontSize: 13.5,
  },
  candidateRow: { borderBottom: `1px solid ${C.line}` },
  candidateMain: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "16px 4px",
  },
  candidateText: {
    fontSize: 15.5,
    fontWeight: 700,
    color: C.ink,
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
    transition: "color 0.12s",
  },
  similarNote: { display: "flex", alignItems: "center", gap: 5, marginTop: 5, fontSize: 12, color: C.body },
  checkOn: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: C.green,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  checkOff: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: `2px solid ${C.line}`,
    flexShrink: 0,
    marginTop: 2,
  },

  /* present */
  presentWrap: {
    minHeight: "100vh",
    background: C.bg,
    color: C.ink,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    display: "flex",
    justifyContent: "center",
  },
  presentInner: { width: "80%", maxWidth: 1200, padding: "52px 0 100px" },
  backBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: C.mute,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.08em",
    marginBottom: 22,
  },
  presentTitle: { margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 },
  presentCount: {
    marginTop: 10,
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: C.faint,
  },
  presentList: { marginTop: 28, borderTop: `1px solid ${C.line}` },
  presentEmpty: { padding: "40px 0", color: C.faint },
  presentRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 20,
    padding: "26px 0",
    borderBottom: `1px solid ${C.line}`,
  },
  presentNum: {
    width: 40,
    height: 40,
    borderRadius: 8,
    background: C.lineSoft,
    color: C.mute,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    fontWeight: 800,
    flexShrink: 0,
    marginTop: 8,
  },
  presentThemeText: {
    fontSize: 40,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1.15,
    transition: "color 0.12s",
  },
  presentQuote: {
    marginTop: 12,
    fontSize: 17,
    fontStyle: "italic",
    color: C.mute,
    lineHeight: 1.45,
  },

  /* toast */
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: C.ink,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    padding: "10px 18px",
    borderRadius: 999,
    zIndex: 80,
    boxShadow: "0 10px 30px rgba(20,23,26,0.25)",
  },

  /* ---------- mobile ---------- */
  mobileShell: {
    minHeight: "100vh",
    background: C.bg,
    color: C.ink,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  mainInnerMobile: { padding: "20px 16px 110px", maxWidth: "none" },
  questionMobile: { fontSize: 24, lineHeight: 1.2 },
  toolBtnMobile: { padding: "11px 18px", fontSize: 14 },
  commentsFab: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    marginBottom: 18,
    padding: "9px 14px 9px 12px",
    borderRadius: 999,
    background: C.blueSoft,
    color: C.blue,
    fontWeight: 700,
    fontSize: 13,
    position: "relative",
  },
  commentsFabCount: {
    fontSize: 12,
    fontWeight: 800,
    background: C.blue,
    color: "#fff",
    borderRadius: 999,
    padding: "1px 7px",
  },
  commentsFabDot: {
    position: "absolute",
    top: 4,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: C.redX,
    animation: "ttPulse 1.2s ease-in-out infinite",
  },

  mobilePanelWrap: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    background: C.bg,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    transition: "transform 0.28s ease",
  },
  mobilePanelOpen: { transform: "translateX(0)" },
  mobilePanelClosed: { transform: "translateX(-100%)", pointerEvents: "none" },

  sidebarMobile: {
    width: "100%",
    flexShrink: 1,
    borderRight: "none",
    height: "auto",
    minHeight: "100vh",
    position: "static",
  },
  sidebarHeadMobile: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    background: C.bg,
  },
  sidebarScrollMobile: { overflowY: "visible", flex: "1 0 auto" },
  sidebarTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  panelClose: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: C.lineSoft,
    color: C.body,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  simBarMobile: { position: "sticky", bottom: 0, zIndex: 8 },

  overlayMobile: { padding: 0, alignItems: "flex-start" },
  modalMobile: {
    maxWidth: "none",
    width: "100%",
    height: "calc(100vh - 46px)",
    maxHeight: "calc(100dvh - 46px)",
    marginTop: 46,
    borderRadius: "20px 20px 0 0",
    padding: "10px 18px 20px",
    animation: "ttSlideDown 0.3s ease",
  },
  modalTitleMobile: { fontSize: 19, margin: "4px 0 16px" },
  sheetGrabber: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "4px 0 8px",
  },

  qMenuMobile: { width: "min(340px, calc(100vw - 28px))" },

  presentInnerMobile: { width: "100%", padding: "24px 16px 96px" },
  presentTitleMobile: { fontSize: 26, lineHeight: 1.15 },
  presentRowMobile: { gap: 13, padding: "20px 0" },
  presentNumMobile: { width: 30, height: 30, borderRadius: 7, fontSize: 13, marginTop: 5 },
  presentThemeTextMobile: { fontSize: 23 },
  presentQuoteMobile: { fontSize: 15, marginTop: 9 },
};
