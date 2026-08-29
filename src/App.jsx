import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  RotateCw,
  ChevronDown,
  Copy,
  Share2,
  Presentation,
  FileText,
  Braces,
  CornerDownRight,
} from "lucide-react";
import { buildSeedState } from "./seedData.js";
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
body { margin: 0; background: ${C.bg}; }
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; padding: 0; }
input, textarea { font: inherit; }
::selection { background: ${C.blueSoft}; }
@keyframes spin { to { transform: rotate(360deg); } }
.tt-hover { opacity: 0 !important; pointer-events: none; }
.tt-row:hover .tt-hover { opacity: 1 !important; pointer-events: auto; }
.tt-comment:hover { background: ${C.lineSoft}; }
`;

const MAX_THEME_LEN = 100;
const STORAGE_KEY = "tt:v2";

/* ---------------- persistence ---------------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* fall through to seed */
  }
  const { questions, comments } = buildSeedState();
  const themes = {};
  const candidates = {};
  questions.forEach((q) => {
    themes[q.id] = [];
    candidates[q.id] = [];
  });
  return { questions, activeId: questions[0].id, comments, themes, candidates };
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

function CommentsPanel({ comments, onUseComment, onCopyAll }) {
  const groups = useMemo(() => {
    const map = new Map();
    comments.forEach((c) => {
      if (!map.has(c.tableId)) map.set(c.tableId, { name: c.tableName, num: c.tableNum, items: [] });
      map.get(c.tableId).items.push(c);
    });
    return [...map.values()].sort((a, b) => a.num - b.num);
  }, [comments]);

  return (
    <aside style={s.sidebar}>
      <div style={s.sidebarHead}>
        <h2 style={s.sidebarTitle}>Comments</h2>
        <div style={s.sidebarSubRow}>
          <span style={s.livePill}>
            <span style={s.liveDot} />
            LIVE
          </span>
          <button style={s.linkBtn} onClick={onCopyAll}>
            Copy All
          </button>
        </div>
      </div>

      <div style={s.sidebarScroll}>
        {groups.map((g) => (
          <div key={g.num}>
            <div style={s.tableHeader}>TABLE {g.num}</div>
            {g.items.map((c) => (
              <button
                key={c.id}
                className="tt-comment tt-row"
                style={s.commentRow}
                onClick={() => onUseComment(c)}
                title="Add as a theme"
              >
                <span style={s.commentBadge}>T{g.num}</span>
                <span style={s.commentText}>{c.text}</span>
                <ArrowRight
                  className="tt-hover"
                  size={15}
                  color={C.faint}
                  style={{ ...s.commentArrow, opacity: 0 }}
                />
              </button>
            ))}
          </div>
        ))}
      </div>
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

function ThemeRow({ theme, onChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(theme.text);
  const inputRef = useRef(null);

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

  return (
    <div className="tt-row" style={s.themeRow}>
      <SourceBadge source={theme.source} />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          maxLength={MAX_THEME_LEN}
          onChange={(e) => setDraft(e.target.value)}
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
        <button style={s.themeText} onClick={startEdit} title="Click to edit">
          {theme.text}
        </button>
      )}
      <button
        className="tt-hover"
        style={{ ...s.themeDelete, opacity: 0 }}
        onClick={onDelete}
        title="Delete theme"
      >
        <X size={13} color={C.redX} strokeWidth={2.6} />
      </button>
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

function GenerateModal({ status, error, candidates, themes, onRefresh, onClearAll, onAccept, onClose }) {
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
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.eyebrow}>CREATE THEMES FOR THIS QUESTION…</div>
        <h2 style={s.modalTitle}>
          Select the <span style={{ color: C.green }}>generated themes</span> you would like to keep.
        </h2>

        <div style={s.modalToolbar}>
          <div style={s.toolbarLeft}>
            <span style={s.toolLabel}>GENERATED THEMES</span>
            <span style={s.countPill}>{candidates.length}</span>
          </div>
          <div style={s.toolbarRight}>
            <button style={s.ghostBtn} onClick={onClearAll} disabled={loading || candidates.length === 0}>
              Clear All
            </button>
            <button style={s.softGreenBtn} onClick={onRefresh} disabled={loading}>
              {loading ? <Spinner size={13} /> : <RotateCw size={13} />}
              Refresh
            </button>
            <button
              style={{ ...s.greenBtn, opacity: chosen.length ? 1 : 0.45 }}
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

          {ordered.map((c) => {
            const sims = (c.similarThemeIds || []).map((id) => themeById.get(id)).filter(Boolean);
            const isOn = selected.has(c.id);
            return (
              <div key={c.id} style={s.candidateRow}>
                <SourceBadge source="AI" size={24} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={s.candidateText}>{c.text}</div>
                  {sims.map((t) => (
                    <div key={t.id} style={s.similarNote}>
                      <CornerDownRight size={12} color={C.mute} />
                      Similar to <span style={{ color: C.blue, fontWeight: 700 }}>#{t.index}</span>{" "}
                      <span style={{ color: C.mute }}>({t.text})</span>
                    </div>
                  ))}
                </div>
                <button
                  style={isOn ? s.checkOn : s.checkOff}
                  onClick={() => toggle(c.id)}
                  title={isOn ? "Selected" : "Not selected"}
                >
                  {isOn && <Check size={14} color="#fff" strokeWidth={3} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- present view ---------------- */

function PresentView({ question, themes, commentsForTheme, onBack }) {
  return (
    <div style={s.presentWrap}>
      <div style={s.presentInner}>
        <button style={s.backBtn} onClick={onBack}>
          <ArrowLeft size={15} />
          BACK
        </button>
        <h1 style={s.presentTitle}>{question.mainQuestion}</h1>
        <div style={s.presentList}>
          {themes.length === 0 && <div style={s.presentEmpty}>No themes yet.</div>}
          {themes.map((t) => (
            <div key={t.id} style={s.presentRow}>
              <SourceBadge source={t.source} size={28} />
              <div>
                <div style={s.presentThemeText}>{t.text}</div>
                <div style={s.presentSub}>
                  <CornerDownRight size={13} color={C.faint} />
                  {SOURCE_LABEL[t.source]}
                  {commentsForTheme(t).length > 0 && ` · ${commentsForTheme(t).length} comments`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- question switcher ---------------- */

function QuestionSwitcher({ questions, activeId, onSelect }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button style={s.qTriangle} onClick={() => setOpen((v) => !v)} title="Switch question">
        <ChevronDown size={20} color={C.mute} />
      </button>
      {open && (
        <>
          <div style={s.popScrim} onClick={() => setOpen(false)} />
          <div style={s.qMenu}>
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
  const [state, setState] = useState(null);
  const [view, setView] = useState("work"); // "work" | "present"
  const [showGenerate, setShowGenerate] = useState(false);
  const [genStatus, setGenStatus] = useState("idle"); // idle | loading | error
  const [genError, setGenError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    setState(loadState());
  }, []);
  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

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

  const commentsForTheme = useCallback(
    (theme) => {
      if (theme.source === "COMMENT") {
        const c = commentById.get(theme.sourceCommentId);
        return c ? [c] : [];
      }
      if (theme.source === "AI") {
        return (theme.informingCommentIds || []).map((id) => commentById.get(id)).filter(Boolean);
      }
      return [];
    },
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
      return [...list, makeTheme({ text: comment.text, source: "COMMENT", sourceCommentId: comment.id })];
    });

  const changeTheme = (id, text) =>
    setThemes((list) => list.map((t) => (t.id === id ? { ...t, text } : t)));
  const deleteTheme = (id) => setThemes((list) => list.filter((t) => t.id !== id));

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
      const res = await fetch("/api/generate-themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainQuestion: active.mainQuestion,
          comments: comments.map((c) => ({ id: c.id, table: c.tableName, text: c.text })),
          existingThemes: themes.map((t) => ({ id: t.id, text: t.text })),
          previousCandidates: candidates.map((c) => ({ text: c.text })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }
      const data = await res.json();
      const validCommentId = (id) => commentById.has(id);
      const next = (data.themes || [])
        .map((t) => ({
          id: uid(),
          text: (t.text || "").slice(0, MAX_THEME_LEN),
          informingCommentIds: (t.informingCommentIds || []).filter(validCommentId),
          representativeCommentIds: (t.representativeCommentIds || []).filter(validCommentId),
          similarThemeIds: (t.similarThemeIds || []).filter((id) => themes.some((x) => x.id === id)),
        }))
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
          commentsForTheme={commentsForTheme}
          onBack={() => setView("work")}
        />
      </>
    );
  }

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={s.appShell}>
        <CommentsPanel comments={comments} onUseComment={addCommentTheme} onCopyAll={copyAllComments} />

        <main style={s.main}>
          <div style={s.mainInner}>
            <div style={s.eyebrow}>CREATE THEMES FOR THIS QUESTION…</div>
            <div style={s.questionRow}>
              <h1 style={s.question}>{active.mainQuestion}</h1>
              <QuestionSwitcher
                questions={state.questions}
                activeId={state.activeId}
                onSelect={(id) => setState((prev) => ({ ...prev, activeId: id }))}
              />
            </div>

            <ThemeComposer onAdd={addManualTheme} />

            <div style={s.listToolbar}>
              <div style={s.toolbarLeft}>
                <span style={s.toolLabel}>ALL THEMES</span>
                <span style={s.countPill}>{themes.length}</span>
              </div>
              <div style={s.toolbarRight}>
                <button style={s.generateBtn} onClick={openGenerate}>
                  Generate
                  <Sparkles size={14} color={C.green} />
                </button>
                <button style={s.copyBtn} onClick={copyThemes} disabled={themes.length === 0}>
                  Copy
                </button>
                <span style={{ position: "relative", display: "inline-block" }}>
                  <button style={s.shareBtn} onClick={() => setShareOpen((v) => !v)}>
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

            <div style={s.themeList}>
              {themes.length === 0 && (
                <div style={s.listEmpty}>
                  Write a theme above, click a comment on the left, or hit Generate.
                </div>
              )}
              {themes.map((t) => (
                <ThemeRow
                  key={t.id}
                  theme={t}
                  onChange={(text) => changeTheme(t.id, text)}
                  onDelete={() => deleteTheme(t.id)}
                />
              ))}
            </div>
          </div>
        </main>

        {showGenerate && (
          <GenerateModal
            status={genStatus}
            error={genError}
            candidates={candidates}
            themes={themes}
            onRefresh={runGenerate}
            onClearAll={() => setCandidates(() => [])}
            onAccept={acceptCandidates}
            onClose={() => setShowGenerate(false)}
          />
        )}

        {toast && <div style={s.toast}>{toast}</div>}
      </div>
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
    padding: "16px 20px 8px",
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: "0.1em",
    color: C.faint,
    borderBottom: `1px solid ${C.line}`,
  },
  commentRow: {
    display: "flex",
    alignItems: "center",
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
  },
  commentText: {
    fontSize: 13,
    color: C.body,
    lineHeight: 1.35,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },
  commentArrow: { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", transition: "opacity 0.12s" },

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
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "18px 40px 18px 0",
    borderBottom: `1px solid ${C.line}`,
    position: "relative",
  },
  themeText: {
    flex: 1,
    textAlign: "left",
    fontSize: 17,
    fontWeight: 700,
    color: C.ink,
    letterSpacing: "-0.01em",
    lineHeight: 1.3,
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
  themeDelete: {
    position: "absolute",
    right: 4,
    top: "50%",
    transform: "translateY(-50%)",
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: C.redSoft,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "opacity 0.12s",
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
  candidateRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "16px 4px",
    borderBottom: `1px solid ${C.line}`,
  },
  candidateText: { fontSize: 15.5, fontWeight: 700, color: C.ink, lineHeight: 1.3, letterSpacing: "-0.01em" },
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
  presentInner: { width: "100%", maxWidth: 900, padding: "52px 48px 100px" },
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
  presentTitle: { margin: "0 0 8px", fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 },
  presentList: { marginTop: 26, borderTop: `1px solid ${C.line}` },
  presentEmpty: { padding: "40px 0", color: C.faint },
  presentRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: "22px 0",
    borderBottom: `1px solid ${C.line}`,
  },
  presentThemeText: { fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.25 },
  presentSub: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: "0.03em",
    color: C.faint,
    textTransform: "uppercase",
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
};
