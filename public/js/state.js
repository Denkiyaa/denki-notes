// ===== GLOBAL STATE =====
window.AppState = {
  snapshotCache: null,

  currentTopic:   null, // slug
  currentSection: null, // slug
  currentPage:    null, // slug

  dirty: false,
  saveTimer: null,
  savingNow: false,

  modalMode: null,
  modalData: {},

  dragPageSlug: null,
};

// ===== HELPERS =====
function setStatus(msg){
  const s1 = document.getElementById("status");
  const s2 = document.getElementById("miniStatus");
  if(s1) s1.textContent = msg || "";
  if(s2) s2.textContent = msg || "idle";
}
window.setStatus = setStatus;

async function callApi(url, opts = {}){
  const r = await fetch(url, opts);
  return r;
}
window.callApi = callApi;

// ISO -> yerel TR formatı
function formatLocal(ts){
  if(!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("tr-TR", {
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
    hour:"2-digit",
    minute:"2-digit"
  });
}
window.formatLocal = formatLocal;

// markdown benzeri wrap
function surroundSelection(ed, wrapL, wrapR){
  const start = ed.selectionStart;
  const end   = ed.selectionEnd;
  if(start == null || end == null) return;

  const before = ed.value.slice(0,start);
  const sel    = ed.value.slice(start,end);
  const after  = ed.value.slice(end);

  ed.value = before + wrapL + sel + wrapR + after;

  const cursorPos = start + wrapL.length + sel.length + wrapR.length;
  ed.selectionStart = cursorPos;
  ed.selectionEnd   = cursorPos;

  markDirty();
}
window.surroundSelection = surroundSelection;

function makeH1(ed){
  const pos = ed.selectionStart ?? 0;

  const beforeAll = ed.value.slice(0,pos);
  const afterAll  = ed.value.slice(pos);

  const lastBreak = beforeAll.lastIndexOf("\n");
  const lineStart = (lastBreak === -1 ? 0 : lastBreak+1);

  const nextBreak = afterAll.indexOf("\n");
  const lineEnd = nextBreak === -1 ? ed.value.length : pos + nextBreak;

  const lineText = ed.value.slice(lineStart, lineEnd);

  if(!lineText.startsWith("# ")){
    const newLine = "# " + lineText;
    ed.value =
      ed.value.slice(0, lineStart) +
      newLine +
      ed.value.slice(lineEnd);

    const newCursor = lineStart + newLine.length;
    ed.selectionStart = newCursor;
    ed.selectionEnd   = newCursor;
    markDirty();
  }
}
window.makeH1 = makeH1;
