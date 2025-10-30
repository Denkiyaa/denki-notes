// ===== GLOBAL STATE =====
let snapshotCache = null;

let currentTopic   = null; // slug
let currentSection = null; // slug
let currentPage    = null; // slug

// autosave
let dirty = false;
let saveTimer = null;
let savingNow = false;

// modal
let modalMode = null;
let modalData = {};

// drag & drop reorder
let dragPageSlug = null;


// ===== HELPERS =====
function $(id){ return document.getElementById(id); }

function setStatus(msg){
  const m1 = $("statusText");
  const m2 = $("miniStatus");
  if(m1) m1.textContent = msg || "";
  if(m2) m2.textContent = msg || "idle";
}

async function callApi(url, opts = {}){
  const r = await fetch(url, opts);
  return r;
}

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

// Meta line under title: Day, Date and Time
function updatePageMeta(ts){
  const dEl = $("pageMetaDate");
  const tEl = $("pageMetaTime");
  if(!dEl || !tEl) return;
  const d = ts ? new Date(ts) : new Date();
  const locale = navigator.language || 'en-US';
  dEl.textContent = d.toLocaleDateString(locale, {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
  tEl.textContent = d.toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}


// ===== SNAPSHOT =====
async function fetchSnapshot(){
  setStatus("yükleniyor...");
  const r = await callApi("/api/snapshot");
  if(!r.ok){
    setStatus("snapshot hata "+r.status);
    return;
  }
  snapshotCache = await r.json();

  renderSections();
  renderPages();

  // eğer seçim yoksa ilkini seç
  if(!currentTopic || !currentSection || !currentPage){
    const firstTopic   = snapshotCache.topics?.[0];
    const firstSection = firstTopic?.sections?.[0];
    const firstPage    = firstSection?.pages?.[0];
    if(firstTopic && firstSection && firstPage){
      await openPage(firstTopic.slug, firstSection.slug, firstPage.slug);
    } else {
      clearEditor();
    }
  } else {
    await openPage(currentTopic, currentSection, currentPage);
  }

  setStatus("hazır");
}


// ===== LEFT: sections =====
function renderSections(){
  const cont = $("sectionList");
  if(!cont) return;
  cont.innerHTML = "";

  const topic = snapshotCache?.topics?.[0];
  if(!topic){
    cont.innerHTML = "<div style='color:#888;font-size:12px;padding:10px;'>bölüm yok</div>";
    return;
  }

  topic.sections?.forEach(sec=>{
    const row = document.createElement("div");
    row.className = "sectionRow";

    if(currentTopic === topic.slug && currentSection === sec.slug){
      row.classList.add("active");
    }

    // label
    const leftWrap = document.createElement("div");
    leftWrap.className = "sectionLabelWrap";

    const dot = document.createElement("div");
    dot.className = "sectionColorDot";

    const nameDiv = document.createElement("div");
    nameDiv.className = "sectionName";
    nameDiv.textContent = sec.title || sec.slug;

    leftWrap.appendChild(dot);
    leftWrap.appendChild(nameDiv);

    leftWrap.onclick = ()=>{
      currentTopic   = topic.slug;
      currentSection = sec.slug;
      const firstPage = sec.pages?.[0];
      currentPage = firstPage ? firstPage.slug : null;

      renderSections();
      renderPages();

      if(currentPage){
        openPage(currentTopic, currentSection, currentPage);
      }else{
        clearEditor();
      }
    };

    // menu
    const menuBtn = document.createElement("button");
    menuBtn.className = "sectionMenuBtn";
    menuBtn.innerHTML = "⋮";

    const dd = document.createElement("div");
    dd.className = "sectionMenuDropdown";

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "Bölümü yeniden adlandır";
    renameBtn.onclick = ()=>{
      dd.style.display="none";
      openModal("renameSection", {
        topicSlug: topic.slug,
        sectionSlug: sec.slug
      });
    };
    dd.appendChild(renameBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Bölümü sil";
    delBtn.className = "danger";
    delBtn.onclick = ()=>{
      dd.style.display="none";
      openModal("deleteSection", {
        topicSlug: topic.slug,
        sectionSlug: sec.slug
      });
    };
    dd.appendChild(delBtn);

    menuBtn.onclick = ev=>{
      ev.stopPropagation();
      const shown = dd.style.display === "flex";
      document.querySelectorAll(".sectionMenuDropdown").forEach(x=>x.style.display="none");
      document.querySelectorAll(".pageListMenuDropdown").forEach(x=>x.style.display="none");
      dd.style.display = shown ? "none" : "flex";
    };

    row.appendChild(leftWrap);
    row.appendChild(menuBtn);
    row.appendChild(dd);

    cont.appendChild(row);
  });

  const addSectionBtn = document.createElement("button");
  addSectionBtn.className = "addSectionBtn";
  addSectionBtn.textContent = "+ Yeni bölüm";
  addSectionBtn.onclick = ()=>{
    openModal("createSection",{});
  };
  cont.appendChild(addSectionBtn);

  document.addEventListener("click", ()=>{
    document.querySelectorAll(".sectionMenuDropdown").forEach(x=>x.style.display="none");
    document.querySelectorAll(".pageListMenuDropdown").forEach(x=>x.style.display="none");
  }, { once:true });
}


// ===== MIDDLE: pages in current section =====
function renderPages(){
  const listEl = $("pageList");
  const headerNameEl = $("activeSectionName");
  if(!listEl || !headerNameEl) return;

  const topic = snapshotCache?.topics?.[0];
  if(!topic){
    headerNameEl.textContent = "Bölüm seçilmedi";
    listEl.innerHTML = "";
    return;
  }

  const sec = topic.sections?.find(s=>s.slug===currentSection);
  if(!sec){
    headerNameEl.textContent = "Bölüm seçilmedi";
    listEl.innerHTML = "";
    return;
  }

  headerNameEl.textContent = sec.title || sec.slug;
  listEl.innerHTML = "";

  // Bind container-level DnD handlers once (for top-of-list drops)
  if(!listEl._dndBound){
    listEl.addEventListener("dragover", (ev)=>{
      ev.preventDefault();
      const first = listEl.querySelector('.pageListItem');
      if(!first) return;
      const rect = first.getBoundingClientRect();
      // Highlight top of first item when cursor is above it
      first.style.borderTop = (ev.clientY < rect.top) ? "2px solid var(--bg-active)" : "";
    });

    listEl.addEventListener("drop", async (ev)=>{
      ev.preventDefault();
      const first = listEl.querySelector('.pageListItem');
      if(first){ first.style.borderTop = ""; }
      if(!dragPageSlug) return;

      // Only handle as 'drop-to-top' if dropped above the first card
      if(first){
        const rect = first.getBoundingClientRect();
        if(ev.clientY >= rect.top) return; // let item-level handler deal with it
      }

      const secObj = snapshotCache.topics[0].sections.find(s=>s.slug===currentSection);
      if(!secObj) return;

      const currentOrder = secObj.pages.map(x=>x.slug);
      if(!currentOrder.includes(dragPageSlug)) return;
      const newOrder = currentOrder.filter(sl=>sl!==dragPageSlug);
      newOrder.unshift(dragPageSlug);

      dragPageSlug = null;

      // apply
      secObj.pages.sort((a,b)=> newOrder.indexOf(a.slug)-newOrder.indexOf(b.slug));
      renderPages();

      try {
        await callApi(`/api/section/${currentTopic}/${currentSection}/reorder-pages`, {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ order: newOrder })
        });
        setStatus("sıra kaydedildi");
      } catch(e){
        setStatus("sıra kaydedilemedi");
      }
    });

    listEl._dndBound = true;
  }

  sec.pages?.forEach(p=>{
    const item = document.createElement("div");
    item.className = "pageListItem";
    if(currentTopic===topic.slug && currentSection===sec.slug && currentPage===p.slug){
      item.classList.add("active");
    }

    // drag drop
    item.setAttribute("draggable","true");

    item.addEventListener("dragstart",(ev)=>{
      dragPageSlug = p.slug;
      ev.dataTransfer.effectAllowed = "move";
      item.style.opacity = "0.4";
    });

    item.addEventListener("dragend",()=>{
      item.style.opacity = "";
      item.style.borderTop = "";
      item.style.borderBottom = "";
    });

    item.addEventListener("dragover",(ev)=>{
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      const rect = item.getBoundingClientRect();
      const before = ev.clientY < (rect.top + rect.height / 2);
      // visual indicator for insertion position
      item.style.borderTop = before ? "2px solid var(--bg-active)" : "";
      item.style.borderBottom = before ? "" : "2px solid var(--bg-active)";
    });

    item.addEventListener("dragleave",()=>{
      item.style.borderTop = "";
      item.style.borderBottom = "";
    });

    item.addEventListener("drop", async (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      item.style.borderTop = "";
      item.style.borderBottom = "";

      const fromSlug = dragPageSlug;
      const toSlug   = p.slug;
      dragPageSlug   = null;

      if(!fromSlug || fromSlug===toSlug) return;

      const secObj = snapshotCache.topics[0].sections.find(s=>s.slug===currentSection);
      if(!secObj) return;

      // Build new order inserting before/after based on cursor position
      const before = (()=>{
        const rect = item.getBoundingClientRect();
        return ev.clientY < (rect.top + rect.height / 2);
      })();

      const currentOrder = secObj.pages.map(x=>x.slug);
      const newOrder = currentOrder.filter(sl=>sl!==fromSlug);
      const toIdxNew = newOrder.indexOf(toSlug);
      if(toIdxNew === -1) return;
      const insertAt = before ? toIdxNew : toIdxNew + 1;
      newOrder.splice(insertAt, 0, fromSlug);

      secObj.pages.sort((a,b)=> newOrder.indexOf(a.slug)-newOrder.indexOf(b.slug));

      renderPages();

      try {
        await callApi(`/api/section/${currentTopic}/${currentSection}/reorder-pages`, {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ order: newOrder })
        });
        setStatus("sıra kaydedildi");
      } catch(e){
        setStatus("sıra kaydedilemedi");
      }
    });

    // click -> openPage
    item.onclick = ()=>{
      openPage(topic.slug, sec.slug, p.slug);
    };

    // inner text
    const titleDiv = document.createElement("div");
    titleDiv.className = "pageListTitle";
    titleDiv.textContent = p.title || p.slug;

    const metaDiv = document.createElement("div");
    metaDiv.className = "pageListMeta";
    metaDiv.textContent = formatLocal(p.updatedAt || "");

    item.appendChild(titleDiv);
    item.appendChild(metaDiv);

    // menu button
    const menuBtn = document.createElement("button");
    menuBtn.className = "pageListMenuBtn";
    menuBtn.innerHTML = "⋮";

    const dd = document.createElement("div");
    dd.className = "pageListMenuDropdown";

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "Yeniden adlandır";
    renameBtn.onclick = ev=>{
      ev.stopPropagation();
      dd.style.display="none";
      openModal("renamePage", {
        topicSlug: topic.slug,
        sectionSlug: sec.slug,
        pageSlug: p.slug,
        pageTitle: p.title || p.slug
      });
    };
    dd.appendChild(renameBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Sil";
    delBtn.className = "danger";
    delBtn.onclick = ev=>{
      ev.stopPropagation();
      dd.style.display="none";
      openModal("deletePage", {
        topicSlug: topic.slug,
        sectionSlug: sec.slug,
        pageSlug: p.slug
      });
    };
    dd.appendChild(delBtn);

    menuBtn.onclick = ev=>{
      ev.stopPropagation();
      const shown = dd.style.display === "flex";
      document.querySelectorAll(".pageListMenuDropdown").forEach(x=>x.style.display="none");
      document.querySelectorAll(".sectionMenuDropdown").forEach(x=>x.style.display="none");
      dd.style.display = shown ? "none" : "flex";
    };

    item.appendChild(menuBtn);
    item.appendChild(dd);

    listEl.appendChild(item);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "addPageBtn";
  addBtn.textContent = "+ Yeni sayfa";
  addBtn.onclick = ()=>{
    if(!currentTopic || !currentSection){
      alert("Önce bölüm seç");
      return;
    }
    openModal("createPage", {
      topicSlug: currentTopic,
      sectionSlug: currentSection
    });
  };
  listEl.appendChild(addBtn);

  document.addEventListener("click", ()=>{
    document.querySelectorAll(".pageListMenuDropdown").forEach(x=>x.style.display="none");
    document.querySelectorAll(".sectionMenuDropdown").forEach(x=>x.style.display="none");
  }, { once:true });
}


// ===== OPEN PAGE =====
async function openPage(topicSlug, sectionSlug, pageSlug){
  currentTopic   = topicSlug;
  currentSection = sectionSlug;
  currentPage    = pageSlug;

  setStatus("");

  let pageData = { content:"", title:pageSlug, updatedAt:null };

  try {
    const r = await callApi(`/api/page/${topicSlug}/${sectionSlug}/${pageSlug}`);
    if(r.ok){
      pageData = await r.json();
    }
  } catch(e){}

  // fill header
  const headTitle = $("pageTitleText");
  const headPath  = $("pageBreadcrumb");
  if(headTitle){
    headTitle.textContent = pageData.title || pageSlug;
  }
  if(headPath){
    headPath.textContent = `${topicSlug} / ${sectionSlug} / ${pageSlug}`;
  }

  // fill editor body
  const ed = $("editor");
  if(ed){
    ed.innerHTML = pageData.content || "";
  }

  // status time
  if(pageData.updatedAt){
    setStatus(`açıldı · ${formatLocal(pageData.updatedAt)}`);
  } else {
    setStatus("açıldı");
  }

  // meta line below title
  updatePageMeta(pageData.updatedAt);

  renderSections();
  renderPages();

  // reset autosave
  dirty = false;
  savingNow = false;
  if(saveTimer){
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function clearEditor(){
  const ed = $("editor");
  if(ed){
    ed.innerHTML = "";
  }
  const headTitle = $("pageTitleText");
  const headPath  = $("pageBreadcrumb");
  if(headTitle) headTitle.textContent = "Seçili sayfa yok";
  if(headPath)  headPath.textContent  = "";
  setStatus("");
}


// ===== AUTOSAVE =====
function markDirty(){
  if(!currentTopic || !currentSection || !currentPage) return;
  dirty = true;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(autoSave, 2000);
}

async function autoSave(){
  if(!dirty) return;
  if(savingNow) return;

  dirty = false;
  saveTimer = null;
  savingNow = true;

  if(!currentTopic || !currentSection || !currentPage){
    savingNow = false;
    return;
  }

  const ed  = $("editor");
  const ttl = $("pageTitleText");

  const newContent = ed ? ed.innerHTML : "";
  const newTitleRaw = ttl ? ttl.textContent.trim() : currentPage;
  const newTitle   = newTitleRaw || currentPage;

  setStatus("kaydediliyor...");

  try {
    const r = await callApi(
      `/api/page/${currentTopic}/${currentSection}/${currentPage}`,
      {
        method:"PUT",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ content: newContent, title: newTitle })
      }
    );

    if(r.ok){
      const js = await r.json();
      try { updatePageMeta(js.updatedAt); } catch {}
      setStatus(`✓ kaydedildi · ${formatLocal(js.updatedAt || "")}`);

      // snapshot güncelle
      const topicObj = snapshotCache.topics?.find(t=>t.slug===currentTopic);
      const secObj   = topicObj?.sections?.find(s=>s.slug===currentSection);
      const pObj     = secObj?.pages?.find(pp=>pp.slug===currentPage);
      if(pObj){
        pObj.content   = newContent;
        pObj.title     = newTitle;
        pObj.updatedAt = js.updatedAt || pObj.updatedAt;
      }

      renderPages();
    } else {
      setStatus("HATA");
    }
  } catch(e){
    setStatus("HATA");
  }

  savingNow = false;
  if(dirty && !saveTimer){
    saveTimer = setTimeout(autoSave, 2000);
  }
}


// ===== TOOLBAR ACTIONS =====
function applyFormat(cmd){
  // basic bold/italic/underline
  if(cmd==="bold" || cmd==="italic" || cmd==="underline"){
    document.execCommand(cmd, false, null);
    markDirty();
    return;
  }

  if(cmd==="h1"){
    // seçili bloğu h1 yap
    // çok basic yaklaşım: execCommand('formatBlock','<h1>')
    document.execCommand("formatBlock", false, "h1");
    markDirty();
    return;
  }
}


// ===== MODAL =====
function openModal(mode, data){
  modalMode = mode;
  modalData = data || {};

  const ov  = $("modalOverlay");
  const tEl = $("modalTitle");
  const bEl = $("modalBody");
  const cBtn= $("modalConfirm");

  bEl.innerHTML = "";
  cBtn.classList.remove("danger");

  if(mode === "createSection"){
    tEl.textContent = "Yeni bölüm (section)";
    bEl.innerHTML = `
      <label>Bölüm slug:</label>
      <input id="modalInputSectionSlug" type="text" placeholder="GENEL2"/>
    `;
    cBtn.textContent = "Oluştur";
  }

  if(mode === "renameSection"){
    tEl.textContent = "Bölümü yeniden adlandır";
    const oldSlug = data.sectionSlug;
    bEl.innerHTML = `
      <label>Yeni bölüm slug:</label>
      <input id="modalInputSectionSlug" type="text" value="${oldSlug}"/>
    `;
    cBtn.textContent = "Kaydet";
  }

  if(mode === "deleteSection"){
    tEl.textContent = "Bölümü sil";
    cBtn.classList.add("danger");
    cBtn.textContent = "Sil";
    bEl.innerHTML = `
      <div style="font-size:13px;line-height:1.4;color:#fff;margin-bottom:8px;">
        <strong>${data.sectionSlug}</strong> bölümünü ve içindeki TÜM sayfaları sileceksin.
      </div>
      <label>Onay için DELETE yaz:</label>
      <input id="modalInputConfirm" type="text" placeholder="DELETE"/>
    `;
  }

  if(mode === "createPage"){
    tEl.textContent = "Yeni sayfa";
    bEl.innerHTML = `
      <label>Sayfa slug (boşluk yok):</label>
      <input id="modalInputSlug" type="text" placeholder="yeni-not"/>
      <label>Başlık (opsiyonel):</label>
      <input id="modalInputTitle" type="text" placeholder="Görünen başlık"/>
    `;
    cBtn.textContent = "Oluştur";
  }

  if(mode === "renamePage"){
    tEl.textContent = "Sayfayı yeniden adlandır";
    const oldSlug = data.pageSlug;
    bEl.innerHTML = `
      <label>Yeni slug:</label>
      <input id="modalInputSlug" type="text" value="${oldSlug}"/>

      <label>Görünen başlık:</label>
      <input id="modalInputTitle" type="text" value="${(data.pageTitle || oldSlug).replace(/"/g,'&quot;')}"/>
    `;
    cBtn.textContent = "Kaydet";
  }

  if(mode === "deletePage"){
    tEl.textContent = "Sayfayı sil";
    cBtn.classList.add("danger");
    cBtn.textContent = "Sil";
    bEl.innerHTML = `
      <div style="font-size:13px;line-height:1.4;color:#fff;margin-bottom:8px;">
        <strong>${data.pageSlug}</strong> sayfasını sileceksin.
      </div>
      <label>Onay için DELETE yaz:</label>
      <input id="modalInputConfirm" type="text" placeholder="DELETE"/>
    `;
  }

  ov.classList.remove("hidden");
}

function closeModal(){
  const ov = $("modalOverlay");
  ov.classList.add("hidden");
  modalMode = null;
  modalData = {};
}


// ===== MODAL CONFIRM =====
async function handleModalConfirm(){
  if(modalMode === "createSection"){
    const inp = $("modalInputSectionSlug");
    const newSectionSlug = (inp.value || "").trim();
    if(!newSectionSlug){ return; }

    const topic = snapshotCache.topics?.[0];
    if(!topic){ closeModal(); return; }

    const r = await callApi(`/api/section/${topic.slug}`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ sectionSlug: newSectionSlug })
    });
    if(r.ok){
      currentTopic   = topic.slug;
      currentSection = newSectionSlug;
      currentPage    = null;
      await fetchSnapshot();
      setStatus("bölüm oluşturuldu");
    } else {
      setStatus("oluşturulamadı");
    }
    closeModal();
    return;
  }

  if(modalMode === "renameSection"){
    const inp = $("modalInputSectionSlug");
    const newSectionSlug = (inp.value || "").trim();
    if(!newSectionSlug){ return; }

    const { topicSlug, sectionSlug } = modalData;

    const r = await callApi(`/api/section/${topicSlug}/${sectionSlug}/rename`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ newSectionSlug })
    });

    if(r.ok){
      if(currentTopic===topicSlug && currentSection===sectionSlug){
        currentSection = newSectionSlug;
      }
      await fetchSnapshot();
      setStatus("bölüm yeniden adlandırıldı");
    } else {
      setStatus("yeniden adlandırılamadı");
    }
    closeModal();
    return;
  }

  if(modalMode === "deleteSection"){
    const confEl = $("modalInputConfirm");
    if(!confEl || confEl.value.trim() !== "DELETE"){
      setStatus("sil iptal");
      closeModal();
      return;
    }
    const { topicSlug, sectionSlug } = modalData;

    const r = await callApi(`/api/section/${topicSlug}/${sectionSlug}`, {
      method:"DELETE"
    });

    if(r.ok){
      if(currentTopic===topicSlug && currentSection===sectionSlug){
        currentTopic=null;
        currentSection=null;
        currentPage=null;
        clearEditor();
      }
      await fetchSnapshot();
      setStatus("bölüm silindi");
    } else {
      setStatus("silinemedi");
    }
    closeModal();
    return;
  }

  if(modalMode === "createPage"){
    const slugEl  = $("modalInputSlug");
    const titleEl = $("modalInputTitle");
    const newSlug  = (slugEl.value  || "").trim();
    const newTitle = (titleEl.value || "").trim() || newSlug;
    if(!newSlug){ return; }

    const { topicSlug, sectionSlug } = modalData;

    await callApi(`/api/page/${topicSlug}/${sectionSlug}/${newSlug}`, {
      method:"PUT",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ content:"", title:newTitle })
    });

    currentTopic   = topicSlug;
    currentSection = sectionSlug;
    currentPage    = newSlug;

    await fetchSnapshot();
    await openPage(topicSlug, sectionSlug, newSlug);
    closeModal();
    return;
  }

  if(modalMode === "renamePage"){
    const slugEl  = $("modalInputSlug");
    const titleEl = $("modalInputTitle");
    const newSlug  = (slugEl.value  || "").trim();
    let newTitle = (titleEl.value || "").trim();
    if(!newSlug){ return; }

    const { topicSlug, sectionSlug, pageSlug } = modalData;
    const oldTitle = (modalData.pageTitle || pageSlug).trim();
    if(!newTitle){
      newTitle = newSlug;
    } else if(newTitle === oldTitle && newSlug !== pageSlug){
      // keep visible name in sync if user only changed slug
      newTitle = newSlug;
    }

    const r = await callApi(`/api/page/${topicSlug}/${sectionSlug}/${pageSlug}/rename`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ newSlug, newTitle })
    });

    if(r.ok){
      if(currentTopic===topicSlug && currentSection===sectionSlug && currentPage===pageSlug){
        currentPage = newSlug;
      }
      await fetchSnapshot();
      await openPage(topicSlug, sectionSlug, newSlug);
      setStatus("yeniden adlandırıldı");
    } else {
      setStatus("rename hata");
    }
    closeModal();
    return;
  }

  if(modalMode === "deletePage"){
    const confEl = $("modalInputConfirm");
    if(!confEl || confEl.value.trim() !== "DELETE"){
      setStatus("sil iptal");
      closeModal();
      return;
    }

    const { topicSlug, sectionSlug, pageSlug } = modalData;

    const r = await callApi(`/api/page/${topicSlug}/${sectionSlug}/${pageSlug}`, {
      method:"DELETE"
    });

    if(r.ok){
      if(currentTopic===topicSlug && currentSection===sectionSlug && currentPage===pageSlug){
        currentPage = null;
        clearEditor();
      }
      await fetchSnapshot();
      setStatus("silindi");
    } else {
      setStatus("silinemedi");
    }
    closeModal();
    return;
  }
}


// ===== WIRING =====
function wireUI(){
  // contenteditable değişince autosave tetikle
  const ed = $("editor");
  if(ed){
    ed.addEventListener("input", markDirty);
  }
  // page title editing (contenteditable)
  const titleEl = $("pageTitleText");
  if(titleEl){
    titleEl.addEventListener("input", ()=>{
      // avoid rewriting here to keep caret stable
      markDirty();
    });
    titleEl.addEventListener("keydown", (ev)=>{
      if(ev.key === 'Enter'){
        ev.preventDefault();
        const ed2 = $("editor");
        if(ed2) ed2.focus();
      }
    });
    titleEl.addEventListener("paste", (ev)=>{
      ev.preventDefault();
      const text = (ev.clipboardData || window.clipboardData).getData('text') || '';
      document.execCommand('insertText', false, text.replace(/\s*\n+\s*/g, ' '));
    });
  }

  // toolbar butonları
  document.querySelectorAll(".fmtBtn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const cmd = btn.getAttribute("data-cmd");
      applyFormat(cmd);
    });
  });

  // modal buttons
  const cancelBtn = $("modalCancel");
  if(cancelBtn){
    cancelBtn.onclick = closeModal;
  }
  const confirmBtn = $("modalConfirm");
  if(confirmBtn){
    confirmBtn.onclick = handleModalConfirm;
  }

  // section header menu button (burada sadece rename açıyoruz)
  const renameSectionBtn = $("renameSectionBtn");
  if(renameSectionBtn){
    renameSectionBtn.onclick = ()=>{
      if(!currentTopic || !currentSection){
        alert("Önce bölüm seç");
        return;
      }
      openModal("renameSection", {
        topicSlug: currentTopic,
        sectionSlug: currentSection
      });
    };
  }

  // sync
  const syncNowBtn = $("syncNowBtn");
  if(syncNowBtn){
    syncNowBtn.onclick = async ()=>{
      setStatus("snapshot yenileniyor...");
      await fetchSnapshot();
    };
  }

  const settingsBtn = $("settingsBtn");
  if(settingsBtn){
    settingsBtn.onclick = ()=>{
      alert("Ayarlar TODO");
    };
  }
}


// ===== BOOT =====
wireUI();
fetchSnapshot();
