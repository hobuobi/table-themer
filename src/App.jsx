import React, { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import { Plus, X, Pencil, ArrowLeft, Sparkles, GripVertical, RotateCcw, Check, Trash2, MessageSquareText } from "lucide-react";
import { buildThemePrompt } from "./promptTemplate.js";

/* ---------------------------------------------------------------
   World Café — rapid sensemaking board for assemblies & world cafes
   Visual language: table-tent place cards on a deep "meeting room"
   ground. Mono numerals label sequence (tables are literally
   numbered), a warm paper card is the unit everything is built from.
------------------------------------------------------------------*/

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
@keyframes spin { to { transform: rotate(360deg); } }
button { font-family: 'Inter', sans-serif; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid #C8952E; outline-offset: 2px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.wc-tile:hover { transform: translateY(-3px); }
`;

const INK = "#1E241F";
const INK_2 = "#262F27";
const PAPER = "#F4EFE2";
const PAPER_DIM = "#E7E0CC";
const BLUE = "#AFD3E0";
const BLUE_DEEP = "#5C8A9C";
const GOLD = "#C8952E";
const RUST = "#B5563A";
const TEXT_DARK = "#241F16";
const TEXT_MUTE = "#948C77";
const CREAM_TEXT = "#EDE7D6";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const DEFAULT_META = {
  mainQuestion: "What do you think the government should do about AI and the economy?",
  tableQuestion: "What do you think?",
};

function seedTables() {
  return [
    {
      id: uid(),
      name: "Table 1",
      answers: [
        { id: uid(), text: "Guarantee a basic income to offset job losses from automation" },
        { id: uid(), text: "Require companies to retrain workers displaced by AI systems" },
        { id: uid(), text: "Tax AI-driven productivity gains to fund public services" },
      ],
    },
    {
      id: uid(),
      name: "Table 2",
      answers: [
        { id: uid(), text: "Slow down deployment until real safety standards exist" },
        { id: uid(), text: "Create a federal agency dedicated to regulating AI risk" },
        { id: uid(), text: "Break up companies that control both data and models" },
        { id: uid(), text: "Protect artists and writers from unauthorized AI training" },
      ],
    },
    {
      id: uid(),
      name: "Table 3",
      answers: [
        { id: uid(), text: "Invest heavily in AI literacy inside public schools" },
        { id: uid(), text: "Fund community colleges to teach in-demand AI-adjacent skills" },
        { id: uid(), text: "Make trade apprenticeships free for workers who get displaced" },
      ],
    },
    {
      id: uid(),
      name: "Table 4",
      answers: [
        { id: uid(), text: "Let the market sort winners and losers, avoid heavy rules" },
        { id: uid(), text: "Cut red tape so American AI firms can compete globally" },
        { id: uid(), text: "Give tax breaks to companies keeping AI jobs domestic" },
      ],
    },
    {
      id: uid(),
      name: "Table 5",
      answers: [
        { id: uid(), text: "Ensure rural communities get the same access to AI tools" },
        { id: uid(), text: "Require disclosure when AI makes a hiring or lending call" },
        { id: uid(), text: "Fund a public research option outside of Big Tech" },
        { id: uid(), text: "Give workers a formal say in automation decisions" },
      ],
    },
  ];
}

async function storageGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
async function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("storage set failed", key, e);
  }
}

/* ---------------- shared UI atoms ---------------- */

function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMain = location.pathname === "/";
  const isThemes = location.pathname.startsWith("/themes");
  return (
    <div style={styles.topBar}>
      <div style={styles.topBarBrand}>
        <span style={styles.topBarMark}>◆</span>
        <span style={styles.topBarTitle}>World Café</span>
      </div>
      <div style={styles.topBarNav}>
        <button
          onClick={() => navigate("/")}
          style={{ ...styles.navBtn, ...(isMain ? styles.navBtnActive : {}) }}
        >
          Board
        </button>
        <button
          onClick={() => navigate("/themes")}
          style={{ ...styles.navBtn, ...(isThemes ? styles.navBtnActive : {}) }}
        >
          Themes
        </button>
      </div>
    </div>
  );
}

function EditModal({ title, value, onCancel, onSave, multiline }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(draft.length, draft.length);
    }
    // eslint-disable-next-line
  }, []);
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalEyebrow}>Edit question</div>
        <div style={styles.modalTitle}>{title}</div>
        {multiline ? (
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={styles.modalTextarea}
            rows={3}
          />
        ) : (
          <input
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={styles.modalInput}
          />
        )}
        <div style={styles.modalActions}>
          <button style={styles.btnGhost} onClick={onCancel}>
            Cancel
          </button>
          <button
            style={styles.btnPrimary}
            onClick={() => draft.trim() && onSave(draft.trim())}
          >
            Save question
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptModal({ mainQuestion, answers, initialExtra, onCancel, onSave }) {
  const [draft, setDraft] = useState(initialExtra || "");
  const preview = buildThemePrompt({ mainQuestion, answers, extraInstructions: draft });
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.promptModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalEyebrow}>Theme generation</div>
        <div style={styles.modalTitle}>View / edit prompt</div>

        <div style={styles.promptLabel}>Full prompt sent to Claude</div>
        <pre style={styles.promptPre}>{preview}</pre>

        <div style={styles.promptLabel}>Additional instructions (optional)</div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Keep theme names under 4 words, or group by policy area"
          style={styles.modalTextarea}
          rows={3}
        />

        <div style={styles.modalActions}>
          <button style={styles.btnGhost} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.btnPrimary} onClick={() => onSave(draft.trim())}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- main board ---------------- */

function MainBoard({ meta, setMeta, tables, onAddTable }) {
  const navigate = useNavigate();
  const [editingQ, setEditingQ] = useState(false);
  const totalAnswers = tables.reduce((s, t) => s + t.answers.length, 0);

  return (
    <div style={styles.page}>
      <TopBar />
      <div style={styles.mainHead}>
        <div style={styles.eyebrow}>THE QUESTION ON THE FLOOR</div>
        <div style={styles.questionRow}>
          <h1 style={styles.mainQuestion}>{meta.mainQuestion}</h1>
          <button
            style={styles.iconBtn}
            title="Edit question"
            onClick={() => setEditingQ(true)}
          >
            <Pencil size={16} />
          </button>
        </div>
        <div style={styles.subline}>
          {tables.length} tables in session · {totalAnswers} ideas gathered so far
        </div>
      </div>

      <div style={styles.grid}>
        <button className="wc-tile" style={styles.addTile} onClick={onAddTable}>
          <div style={styles.addTilePlus}>
            <Plus size={26} strokeWidth={2.4} />
          </div>
          <div style={styles.addTileLabel}>New table</div>
        </button>

        {tables.map((t, i) => (
          <button
            key={t.id}
            className="wc-tile"
            style={styles.tableTile}
            onClick={() => navigate(`/table/${t.id}`)}
          >
            <div style={styles.tileTent} />
            <div style={styles.tileNumber}>{String(i + 1).padStart(2, "0")}</div>
            <div style={styles.tileName}>{t.name}</div>
            <div style={styles.tileCount}>
              {t.answers.length} {t.answers.length === 1 ? "idea" : "ideas"}
            </div>
          </button>
        ))}
      </div>

      <div style={styles.themesCTA}>
        <div>
          <div style={styles.themesCTAEyebrow}>Whenever the room is ready</div>
          <div style={styles.themesCTATitle}>Pull the threads together</div>
          <div style={styles.themesCTASub}>
            Generate topical themes from every idea across every table.
          </div>
        </div>
        <button style={styles.btnGold} onClick={() => navigate("/themes")}>
          <Sparkles size={16} style={{ marginRight: 8 }} />
          Generate themes
        </button>
      </div>

      {editingQ && (
        <EditModal
          title="Front-page prompt"
          value={meta.mainQuestion}
          multiline
          onCancel={() => setEditingQ(false)}
          onSave={(v) => {
            setMeta({ ...meta, mainQuestion: v });
            setEditingQ(false);
          }}
        />
      )}
    </div>
  );
}

/* ---------------- table detail page ---------------- */

function TablePage({ tables, meta, setMeta, onAddAnswer, onRemoveAnswer }) {
  const navigate = useNavigate();
  const { tableId } = useParams();
  const table = tables.find((t) => t.id === tableId);
  const [draft, setDraft] = useState("");
  const [editingQ, setEditingQ] = useState(false);
  const [hoverId, setHoverId] = useState(null);

  if (!table) return <Navigate to="/" replace />;

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onAddAnswer(table.id, text);
    setDraft("");
  };

  return (
    <div style={styles.page}>
      <TopBar />
      <div style={styles.tableHeadWrap}>
        <button style={styles.backLink} onClick={() => navigate("/")}>
          <ArrowLeft size={15} style={{ marginRight: 6 }} />
          Board
        </button>
        <div style={styles.eyebrow}>{table.name.toUpperCase()}</div>
        <div style={styles.questionRow}>
          <h1 style={styles.tableQuestion}>{meta.tableQuestion}</h1>
          <button style={styles.iconBtn} title="Edit question" onClick={() => setEditingQ(true)}>
            <Pencil size={16} />
          </button>
        </div>
      </div>

      <div style={styles.composerCard}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Submit an idea"
          style={styles.composerTextarea}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <button style={styles.btnPrimary} onClick={submit} disabled={!draft.trim()}>
          Submit
        </button>
      </div>

      <div style={styles.answersSection}>
        <div style={styles.answersSubhead}>Answers</div>
        {table.answers.length === 0 && (
          <div style={styles.emptyNote}>No ideas yet — be the first to add one above.</div>
        )}
        <div style={styles.answersList}>
          {table.answers.map((a) => (
            <div
              key={a.id}
              style={styles.answerRow}
              onMouseEnter={() => setHoverId(a.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <span style={styles.answerText}>{a.text}</span>
              {hoverId === a.id && (
                <button
                  style={styles.answerRemove}
                  title="Remove answer"
                  onClick={() => onRemoveAnswer(table.id, a.id)}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={styles.endRow}>
        <button style={styles.btnDark} onClick={() => navigate("/")}>
          End
        </button>
      </div>

      {editingQ && (
        <EditModal
          title="Table-page prompt"
          value={meta.tableQuestion}
          onCancel={() => setEditingQ(false)}
          onSave={(v) => {
            setMeta({ ...meta, tableQuestion: v });
            setEditingQ(false);
          }}
        />
      )}
    </div>
  );
}

/* ---------------- themes page ---------------- */

function ThemesPage({
  meta,
  tables,
  themesData,
  setThemesData,
  promptExtra,
  setPromptExtra,
  autoTriggeredRef,
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [errMsg, setErrMsg] = useState("");
  const [newThemeDraft, setNewThemeDraft] = useState("");
  const [addingTheme, setAddingTheme] = useState(false);
  const [dragOverTheme, setDragOverTheme] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingThemeId, setEditingThemeId] = useState(null);
  const [showPromptModal, setShowPromptModal] = useState(false);

  const allAnswers = tables.flatMap((t) =>
    t.answers.map((a) => ({ id: a.id, text: a.text, table: t.name }))
  );

  const generate = useCallback(async () => {
    if (allAnswers.length === 0) {
      setErrMsg("There are no ideas across any table yet.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErrMsg("");
    try {
      const response = await fetch("/api/generate-themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainQuestion: meta.mainQuestion,
          answers: allAnswers.map(({ id, text }) => ({ id, text })),
          extraInstructions: promptExtra,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }
      const parsed = await response.json();
      const themes = (parsed.themes || []).map((t) => ({
        id: uid(),
        name: t.name,
        answerIds: t.answerIds || [],
      }));
      const next = { generated: true, themes };
      setThemesData(next);
      await storageSet("wc:themes", next);
      setStatus("idle");
    } catch (e) {
      console.error(e);
      setErrMsg("Something went wrong while generating themes. Please try again.");
      setStatus("error");
    }
  }, [allAnswers, meta.mainQuestion, promptExtra, setThemesData]);

  useEffect(() => {
    if (!themesData.generated && !autoTriggeredRef.current && allAnswers.length > 0) {
      autoTriggeredRef.current = true;
      generate();
    }
    // eslint-disable-next-line
  }, []);

  const answerLookup = {};
  allAnswers.forEach((a) => (answerLookup[a.id] = a));

  const assignedIds = new Set(themesData.themes.flatMap((t) => t.answerIds));
  const unassigned = allAnswers.filter((a) => !assignedIds.has(a.id));

  const moveAnswer = async (answerId, fromThemeId, toThemeId) => {
    if (fromThemeId === toThemeId) return;
    const next = {
      ...themesData,
      themes: themesData.themes.map((t) => {
        if (t.id === fromThemeId) {
          return { ...t, answerIds: t.answerIds.filter((id) => id !== answerId) };
        }
        if (t.id === toThemeId) {
          return { ...t, answerIds: [...t.answerIds, answerId] };
        }
        return t;
      }),
    };
    setThemesData(next);
    await storageSet("wc:themes", next);
  };

  const renameTheme = async (themeId, name) => {
    const next = {
      ...themesData,
      themes: themesData.themes.map((t) => (t.id === themeId ? { ...t, name } : t)),
    };
    setThemesData(next);
    await storageSet("wc:themes", next);
  };

  const addTheme = async () => {
    const name = newThemeDraft.trim();
    if (!name) return;
    const next = {
      ...themesData,
      generated: true,
      themes: [...themesData.themes, { id: uid(), name, answerIds: [] }],
    };
    setThemesData(next);
    await storageSet("wc:themes", next);
    setNewThemeDraft("");
    setAddingTheme(false);
  };

  const clearThemes = async () => {
    const next = { generated: false, themes: [] };
    setThemesData(next);
    await storageSet("wc:themes", next);
    autoTriggeredRef.current = false;
    setStatus("idle");
    setErrMsg("");
    setConfirmClear(false);
  };

  const onDropTo = (e, toThemeId) => {
    e.preventDefault();
    setDragOverTheme(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      moveAnswer(data.answerId, data.fromThemeId, toThemeId);
    } catch (err) {
      /* ignore malformed drag payload */
    }
  };

  return (
    <div style={styles.page}>
      <TopBar />
      <div style={styles.tableHeadWrap}>
        <button style={styles.backLink} onClick={() => navigate("/")}>
          <ArrowLeft size={15} style={{ marginRight: 6 }} />
          Board
        </button>
        <div style={styles.eyebrow}>SENSEMAKING</div>
        <h1 style={styles.tableQuestion}>What is the room actually saying?</h1>
        <div style={styles.subline}>
          {allAnswers.length} ideas from {tables.length} tables
          {themesData.generated ? ` · sorted into ${themesData.themes.length} themes` : ""}
        </div>
      </div>

      {status === "loading" && (
        <div style={styles.loadingCard}>
          <div style={styles.spinner} />
          <div style={styles.loadingText}>Reading every table's ideas and grouping the threads…</div>
        </div>
      )}

      {status === "error" && (
        <div style={styles.errorCard}>
          <div style={styles.errorText}>{errMsg}</div>
          <button style={styles.btnPrimary} onClick={generate}>
            <RotateCcw size={14} style={{ marginRight: 6 }} />
            Try again
          </button>
        </div>
      )}

      {status !== "loading" && allAnswers.length > 0 && (
        <>
          <div style={styles.themesToolbar}>
            <button style={styles.btnGhostDark} onClick={generate}>
              <RotateCcw size={13} style={{ marginRight: 6 }} />
              {themesData.generated ? "Regenerate" : "Generate with AI"}
            </button>
            <button style={styles.btnGhostDark} onClick={() => setShowPromptModal(true)}>
              <MessageSquareText size={13} style={{ marginRight: 6 }} />
              View/Edit Prompt
            </button>
            {themesData.themes.length > 0 && (!confirmClear ? (
              <button style={styles.btnGhostDark} onClick={() => setConfirmClear(true)}>
                <Trash2 size={13} style={{ marginRight: 6 }} />
                Clear
              </button>
            ) : (
              <div style={styles.confirmClearBox}>
                <span style={styles.confirmClearText}>Clear all themes?</span>
                <button style={styles.btnRustSmall} onClick={clearThemes}>
                  Clear
                </button>
                <button style={styles.iconBtnGhost} onClick={() => setConfirmClear(false)}>
                  <X size={15} />
                </button>
              </div>
            ))}
            {!addingTheme ? (
              <button style={styles.btnGoldSmall} onClick={() => setAddingTheme(true)}>
                <Plus size={14} style={{ marginRight: 6 }} />
                Add theme
              </button>
            ) : (
              <div style={styles.addThemeForm}>
                <input
                  autoFocus
                  value={newThemeDraft}
                  onChange={(e) => setNewThemeDraft(e.target.value)}
                  placeholder="Theme name"
                  style={styles.addThemeInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTheme();
                    if (e.key === "Escape") {
                      setAddingTheme(false);
                      setNewThemeDraft("");
                    }
                  }}
                />
                <button style={styles.iconBtnGold} onClick={addTheme}>
                  <Check size={15} />
                </button>
                <button
                  style={styles.iconBtnGhost}
                  onClick={() => {
                    setAddingTheme(false);
                    setNewThemeDraft("");
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            )}
          </div>

          <div style={styles.themeColumns}>
            {themesData.themes.map((theme) => (
              <div
                key={theme.id}
                style={{
                  ...styles.themeColumn,
                  ...(dragOverTheme === theme.id ? styles.themeColumnOver : {}),
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTheme(theme.id);
                }}
                onDragLeave={() => setDragOverTheme(null)}
                onDrop={(e) => onDropTo(e, theme.id)}
              >
                <div style={styles.themeColumnHead}>
                  <div style={styles.themeNameRow}>
                    <div style={styles.themeName}>{theme.name}</div>
                    <button
                      style={styles.themeEditBtn}
                      title="Rename theme"
                      onClick={() => setEditingThemeId(theme.id)}
                    >
                      <Pencil size={11} />
                    </button>
                  </div>
                  <div style={styles.themeCount}>{theme.answerIds.length}</div>
                </div>
                <div style={styles.themeCards}>
                  {theme.answerIds.map((aid) => {
                    const a = answerLookup[aid];
                    if (!a) return null;
                    return (
                      <div
                        key={aid}
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData(
                            "text/plain",
                            JSON.stringify({ answerId: aid, fromThemeId: theme.id })
                          )
                        }
                        style={styles.themeAnswerCard}
                      >
                        <GripVertical size={13} color={TEXT_MUTE} style={{ flexShrink: 0 }} />
                        <div>
                          <div style={styles.themeAnswerText}>{a.text}</div>
                          <div style={styles.themeAnswerSource}>{a.table}</div>
                        </div>
                      </div>
                    );
                  })}
                  {theme.answerIds.length === 0 && (
                    <div style={styles.themeEmptySlot}>Drag an idea here</div>
                  )}
                </div>
              </div>
            ))}

            {unassigned.length > 0 && (
              <div
                style={styles.themeColumn}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropTo(e, "__unassigned__")}
              >
                <div style={styles.themeColumnHead}>
                  <div style={{ ...styles.themeName, color: TEXT_MUTE }}>Unsorted</div>
                  <div style={styles.themeCount}>{unassigned.length}</div>
                </div>
                <div style={styles.themeCards}>
                  {unassigned.map((a) => (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify({ answerId: a.id, fromThemeId: "__unassigned__" })
                        )
                      }
                      style={styles.themeAnswerCard}
                    >
                      <GripVertical size={13} color={TEXT_MUTE} style={{ flexShrink: 0 }} />
                      <div>
                        <div style={styles.themeAnswerText}>{a.text}</div>
                        <div style={styles.themeAnswerSource}>{a.table}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {status === "idle" && allAnswers.length === 0 && (
        <div style={styles.errorCard}>
          <div style={styles.errorText}>Add a few ideas at the tables first, then come back here.</div>
        </div>
      )}

      {editingThemeId && (
        <EditModal
          title="Theme name"
          value={themesData.themes.find((t) => t.id === editingThemeId)?.name || ""}
          onCancel={() => setEditingThemeId(null)}
          onSave={(v) => {
            renameTheme(editingThemeId, v);
            setEditingThemeId(null);
          }}
        />
      )}

      {showPromptModal && (
        <PromptModal
          mainQuestion={meta.mainQuestion}
          answers={allAnswers.map(({ id, text }) => ({ id, text }))}
          initialExtra={promptExtra}
          onCancel={() => setShowPromptModal(false)}
          onSave={(v) => {
            setPromptExtra(v);
            setShowPromptModal(false);
          }}
        />
      )}
    </div>
  );
}

/* ---------------- root ---------------- */

export default function App() {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [meta, setMetaState] = useState(DEFAULT_META);
  const [tables, setTablesState] = useState([]);
  const [themesData, setThemesDataState] = useState({ generated: false, themes: [] });
  const [promptExtra, setPromptExtraState] = useState("");
  const autoTriggeredRef = useRef(false);

  useEffect(() => {
    (async () => {
      const m = await storageGet("wc:meta");
      if (m) {
        setMetaState(m);
      } else {
        await storageSet("wc:meta", DEFAULT_META);
      }

      const t = await storageGet("wc:tables");
      if (t && Array.isArray(t) && t.length) {
        setTablesState(t);
      } else {
        const seed = seedTables();
        setTablesState(seed);
        await storageSet("wc:tables", seed);
      }

      const th = await storageGet("wc:themes");
      if (th) {
        autoTriggeredRef.current = !!th.generated;
        setThemesDataState(th);
      }

      const pe = await storageGet("wc:promptExtra");
      if (typeof pe === "string") {
        setPromptExtraState(pe);
      }

      setLoaded(true);
    })();
  }, []);

  const setMeta = (next) => {
    setMetaState(next);
    storageSet("wc:meta", next);
  };
  const setTables = (next) => {
    setTablesState(next);
    storageSet("wc:tables", next);
  };
  const setThemesData = (next) => {
    setThemesDataState(next);
    storageSet("wc:themes", next);
  };
  const setPromptExtra = (next) => {
    setPromptExtraState(next);
    storageSet("wc:promptExtra", next);
  };

  const handleAddTable = () => {
    const nextTable = { id: uid(), name: `Table ${tables.length + 1}`, answers: [] };
    const next = [...tables, nextTable];
    setTables(next);
    navigate(`/table/${nextTable.id}`);
  };

  const handleAddAnswer = (tableId, text) => {
    const next = tables.map((t) =>
      t.id === tableId ? { ...t, answers: [...t.answers, { id: uid(), text }] } : t
    );
    setTables(next);
  };

  const handleRemoveAnswer = (tableId, answerId) => {
    const next = tables.map((t) =>
      t.id === tableId
        ? { ...t, answers: t.answers.filter((a) => a.id !== answerId) }
        : t
    );
    setTables(next);
  };

  if (!loaded) {
    return (
      <div style={{ ...styles.page, alignItems: "center", justifyContent: "center", display: "flex" }}>
        <style>{FONTS}</style>
        <div style={styles.loadingText}>Setting up the room…</div>
      </div>
    );
  }

  return (
    <div style={styles.appShell}>
      <style>{FONTS}</style>
      <Routes>
        <Route
          path="/"
          element={
            <MainBoard meta={meta} setMeta={setMeta} tables={tables} onAddTable={handleAddTable} />
          }
        />
        <Route
          path="/table/:tableId"
          element={
            <TablePage
              tables={tables}
              meta={meta}
              setMeta={setMeta}
              onAddAnswer={handleAddAnswer}
              onRemoveAnswer={handleRemoveAnswer}
            />
          }
        />
        <Route
          path="/themes"
          element={
            <ThemesPage
              meta={meta}
              tables={tables}
              themesData={themesData}
              setThemesData={setThemesData}
              promptExtra={promptExtra}
              setPromptExtra={setPromptExtra}
              autoTriggeredRef={autoTriggeredRef}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

/* ---------------- styles ---------------- */

const styles = {
  appShell: {
    minHeight: "100vh",
    background: INK,
    fontFamily: "'Inter', sans-serif",
  },
  page: {
    minHeight: "100vh",
    background: `radial-gradient(ellipse 900px 500px at 50% -10%, ${INK_2} 0%, ${INK} 60%)`,
    color: CREAM_TEXT,
    paddingBottom: 64,
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "22px 40px",
    borderBottom: `1px solid rgba(237,231,214,0.1)`,
  },
  topBarBrand: { display: "flex", alignItems: "center", gap: 8 },
  topBarMark: { color: GOLD, fontSize: 14 },
  topBarTitle: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: 17,
    letterSpacing: "0.01em",
  },
  topBarNav: { display: "flex", gap: 6 },
  navBtn: {
    background: "transparent",
    border: "1px solid rgba(237,231,214,0.18)",
    color: "rgba(237,231,214,0.65)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "8px 14px",
    borderRadius: 999,
    cursor: "pointer",
  },
  navBtnActive: {
    background: PAPER,
    color: TEXT_DARK,
    borderColor: PAPER,
  },
  mainHead: { padding: "48px 40px 8px", maxWidth: 900 },
  eyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11.5,
    letterSpacing: "0.14em",
    color: GOLD,
    marginBottom: 14,
  },
  questionRow: { display: "flex", alignItems: "flex-start", gap: 12 },
  mainQuestion: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: "clamp(28px, 4vw, 44px)",
    lineHeight: 1.15,
    margin: 0,
    maxWidth: 820,
  },
  tableQuestion: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: "clamp(24px, 3.2vw, 34px)",
    lineHeight: 1.2,
    margin: 0,
  },
  subline: {
    marginTop: 16,
    fontSize: 14,
    color: "rgba(237,231,214,0.5)",
  },
  iconBtn: {
    background: "rgba(237,231,214,0.08)",
    border: "1px solid rgba(237,231,214,0.18)",
    color: CREAM_TEXT,
    width: 34,
    height: 34,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    marginTop: 6,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 20,
    padding: "36px 40px 8px",
    maxWidth: 1080,
  },
  addTile: {
    background: BLUE,
    border: "none",
    borderRadius: 14,
    aspectRatio: "1 / 1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    cursor: "pointer",
    boxShadow: "0 8px 22px rgba(92,138,156,0.35)",
    transition: "transform 0.15s ease",
  },
  addTilePlus: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: BLUE_DEEP,
    color: PAPER,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  addTileLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    fontWeight: 600,
    color: "#233A42",
    letterSpacing: "0.03em",
  },
  tableTile: {
    position: "relative",
    background: PAPER,
    border: "none",
    borderRadius: 14,
    aspectRatio: "1 / 1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(0,0,0,0.28)",
    overflow: "hidden",
  },
  tileTent: {
    position: "absolute",
    top: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "46%",
    height: 8,
    background: PAPER_DIM,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  tileNumber: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: TEXT_MUTE,
    letterSpacing: "0.08em",
  },
  tileName: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: 19,
    color: TEXT_DARK,
  },
  tileCount: {
    fontSize: 12,
    color: TEXT_MUTE,
  },
  themesCTA: {
    margin: "40px 40px 0",
    maxWidth: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    background: "rgba(237,231,214,0.06)",
    border: "1px solid rgba(237,231,214,0.12)",
    borderRadius: 16,
    padding: "26px 30px",
    flexWrap: "wrap",
  },
  themesCTAEyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.1em",
    color: "rgba(237,231,214,0.45)",
    marginBottom: 6,
  },
  themesCTATitle: {
    fontFamily: "'Fraunces', serif",
    fontSize: 22,
    fontWeight: 600,
  },
  themesCTASub: {
    fontSize: 13.5,
    color: "rgba(237,231,214,0.55)",
    marginTop: 4,
  },
  btnPrimary: {
    background: BLUE_DEEP,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px 22px",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
  },
  btnGold: {
    background: GOLD,
    color: "#241B08",
    border: "none",
    borderRadius: 999,
    padding: "14px 26px",
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  },
  btnGoldSmall: {
    background: GOLD,
    color: "#241B08",
    border: "none",
    borderRadius: 999,
    padding: "9px 16px",
    fontSize: 12.5,
    fontWeight: 700,
    fontFamily: "'Inter', sans-serif",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  btnGhost: {
    background: "transparent",
    border: `1px solid ${TEXT_MUTE}`,
    color: TEXT_DARK,
    borderRadius: 10,
    padding: "12px 20px",
    fontSize: 14,
    cursor: "pointer",
  },
  btnGhostDark: {
    background: "transparent",
    border: "1px solid rgba(237,231,214,0.25)",
    color: "rgba(237,231,214,0.8)",
    borderRadius: 999,
    padding: "9px 16px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    fontFamily: "'Inter', sans-serif",
  },
  btnDark: {
    background: PAPER,
    color: TEXT_DARK,
    border: "none",
    borderRadius: 999,
    padding: "13px 34px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  tableHeadWrap: { padding: "40px 40px 8px", maxWidth: 800 },
  backLink: {
    background: "transparent",
    border: "none",
    color: "rgba(237,231,214,0.55)",
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    padding: 0,
    marginBottom: 24,
  },
  composerCard: {
    margin: "32px 40px 0",
    maxWidth: 720,
    background: PAPER,
    borderRadius: 16,
    padding: 20,
    display: "flex",
    gap: 14,
    alignItems: "flex-end",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  composerTextarea: {
    flex: 1,
    border: "none",
    background: "transparent",
    resize: "none",
    fontSize: 15,
    fontFamily: "'Inter', sans-serif",
    color: TEXT_DARK,
    outline: "none",
    lineHeight: 1.4,
  },
  answersSection: { margin: "36px 40px 0", maxWidth: 720 },
  answersSubhead: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11.5,
    letterSpacing: "0.12em",
    color: "rgba(237,231,214,0.5)",
    marginBottom: 14,
  },
  emptyNote: { fontSize: 13.5, color: "rgba(237,231,214,0.4)", fontStyle: "italic" },
  answersList: { display: "flex", flexDirection: "column", gap: 10 },
  answerRow: {
    position: "relative",
    background: "rgba(237,231,214,0.06)",
    border: "1px solid rgba(237,231,214,0.1)",
    borderRadius: 10,
    padding: "13px 44px 13px 16px",
    fontSize: 14.5,
  },
  answerText: { color: "rgba(237,231,214,0.92)" },
  answerRemove: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: RUST,
    color: "#fff",
    border: "none",
    width: 24,
    height: 24,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  endRow: { margin: "40px 40px 0", maxWidth: 720, display: "flex", justifyContent: "flex-end" },
  loadingCard: {
    margin: "40px 40px 0",
    maxWidth: 720,
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  spinner: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: `3px solid rgba(237,231,214,0.2)`,
    borderTopColor: GOLD,
    animation: "spin 0.8s linear infinite",
  },
  loadingText: { fontSize: 14, color: "rgba(237,231,214,0.6)" },
  errorCard: {
    margin: "40px 40px 0",
    maxWidth: 620,
    background: "rgba(181,86,58,0.12)",
    border: `1px solid rgba(181,86,58,0.4)`,
    borderRadius: 14,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    alignItems: "flex-start",
  },
  errorText: { fontSize: 14, color: "rgba(237,231,214,0.85)" },
  themesToolbar: {
    display: "flex",
    gap: 12,
    padding: "28px 40px 0",
    alignItems: "center",
  },
  addThemeForm: { display: "flex", gap: 8, alignItems: "center" },
  confirmClearBox: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    background: "rgba(181,86,58,0.12)",
    border: "1px solid rgba(181,86,58,0.4)",
    borderRadius: 999,
    padding: "6px 8px 6px 14px",
  },
  confirmClearText: { fontSize: 12.5, color: "rgba(237,231,214,0.85)" },
  btnRustSmall: {
    background: RUST,
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
  },
  addThemeInput: {
    background: "rgba(237,231,214,0.1)",
    border: "1px solid rgba(237,231,214,0.25)",
    borderRadius: 999,
    padding: "8px 14px",
    color: CREAM_TEXT,
    fontSize: 13,
    outline: "none",
    width: 180,
  },
  iconBtnGold: {
    background: GOLD,
    border: "none",
    color: "#241B08",
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  iconBtnGhost: {
    background: "transparent",
    border: "1px solid rgba(237,231,214,0.25)",
    color: CREAM_TEXT,
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  themeColumns: {
    display: "flex",
    flexWrap: "wrap",
    gap: 18,
    padding: "20px 40px 40px",
  },
  themeColumn: {
    background: "rgba(237,231,214,0.05)",
    border: "1px solid rgba(237,231,214,0.12)",
    borderRadius: 14,
    minWidth: 260,
    maxWidth: 260,
    flexShrink: 0,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  themeColumnOver: {
    borderColor: GOLD,
    background: "rgba(200,149,46,0.08)",
  },
  themeColumnHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 10,
    borderBottom: "1px solid rgba(237,231,214,0.12)",
  },
  themeNameRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  themeName: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: 15.5,
    lineHeight: 1.25,
  },
  themeEditBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(237,231,214,0.45)",
    padding: 2,
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    cursor: "pointer",
  },
  themeCount: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: "rgba(237,231,214,0.4)",
  },
  themeCards: { display: "flex", flexDirection: "column", gap: 8, minHeight: 40 },
  themeAnswerCard: {
    background: PAPER,
    borderRadius: 10,
    padding: "10px 12px",
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    cursor: "grab",
    boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
  },
  themeAnswerText: { fontSize: 13, color: TEXT_DARK, lineHeight: 1.35 },
  themeAnswerSource: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: TEXT_MUTE,
    marginTop: 4,
    letterSpacing: "0.04em",
  },
  themeEmptySlot: {
    fontSize: 12,
    color: "rgba(237,231,214,0.3)",
    fontStyle: "italic",
    border: "1px dashed rgba(237,231,214,0.15)",
    borderRadius: 8,
    padding: "16px 10px",
    textAlign: "center",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(30,36,31,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    padding: 20,
  },
  modal: {
    background: PAPER,
    borderRadius: 18,
    padding: 28,
    width: "100%",
    maxWidth: 480,
    boxShadow: "0 30px 60px rgba(0,0,0,0.4)",
  },
  promptModal: {
    background: PAPER,
    borderRadius: 18,
    padding: 28,
    width: "100%",
    maxWidth: 640,
    maxHeight: "85vh",
    overflowY: "auto",
    boxShadow: "0 30px 60px rgba(0,0,0,0.4)",
    boxSizing: "border-box",
  },
  promptLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.08em",
    color: TEXT_MUTE,
    marginBottom: 8,
    marginTop: 18,
  },
  promptPre: {
    background: PAPER_DIM,
    border: `1px solid ${PAPER_DIM}`,
    borderRadius: 10,
    padding: "14px 16px",
    margin: 0,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    lineHeight: 1.55,
    color: TEXT_DARK,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 260,
    overflowY: "auto",
    boxSizing: "border-box",
  },
  modalEyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.1em",
    color: BLUE_DEEP,
    marginBottom: 6,
  },
  modalTitle: {
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontSize: 20,
    color: TEXT_DARK,
    marginBottom: 18,
  },
  modalInput: {
    width: "100%",
    border: `1px solid ${PAPER_DIM}`,
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 15,
    fontFamily: "'Inter', sans-serif",
    outline: "none",
    boxSizing: "border-box",
  },
  modalTextarea: {
    width: "100%",
    border: `1px solid ${PAPER_DIM}`,
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 15,
    fontFamily: "'Inter', sans-serif",
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
  },
};
