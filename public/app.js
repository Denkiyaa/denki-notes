// GLOBAL STATE
let snapshotCache = null;

let currentTopic   = null; // slug
let currentSection = null; // slug
let currentPage    = null; // slug

// autosave
let dirty = false;
let saveTimer = null;
let savingNow = false;

// modal
let modalMode = null; // createSection, renameSection, deleteSection, createPage, renamePage, deletePage
let modalData = {};   // { topicSlug, sectionSlug, pageSlug }

// helpers
function setStatus(msg){
  const s1 = document.getElementById("status");
  const s2 = document.getElementById("miniStatus");
  if(s1) s1.textContent = msg || "";
  if(s2) s2.textContent = msg || "idle";
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

// SNAPSHOT LOAD
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
  renderEditorHeader();

  // hiç seçim yoksa ilk topic/section/page ile aç
  if(!currentTopic || !currentSection || !currentPage){
    const firstTopic   = snapshotCache.topics?.[0];
    const firstSection = firstTopic?.sections?.[0];
    const firstPage    = firstSection?.pages?.[0];
    if(firstTopic && firstSection && firstPage){
      openPage(firstTopic.slug, firstSection.slug, firstPage.slug);
    }
  } else {
    openPage(currentTopic, currentSection, currentPage);
  }

  setStatus("hazır");
}

// SECTION RENDER (LEFT PANE)
function renderSections(){
  const cont = document.getElementById("sectionList");
  cont.innerHTML = "";

  const topic = snapshotCache.topics?.[0];
  if(!topic){
    cont.innerHTML = "<div style='color:#888;font-size:12px;padding:10px;'>topic yok</div>";
    return;
  }

  topic.sections?.forEach(sec=>{
    const row = document.createElement("div");
    row.className = "sectionRow";
    row.dataset.topic = topic.slug;
    row.dataset.section = sec.slug;

    if(currentTopic === topic.slug && currentSection === sec.slug){
      row.classList.add("active");
    }

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
      currentTopic = topic.slug;
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

  // "+ Yeni bölüm" butonu (sectionList sonuna)
  const addSectionBtn = document.createElement("button");
  addSectionBtn.className = "addSectionBtn";
  addSectionBtn.textContent = "+ Yeni bölüm";
  addSectionBtn.onclick = ()=>{
    openModal("createSection",{});
  };
  cont.appendChild(addSectionBtn);
}

// PAGES RENDER (MIDDLE PANE)
function renderPages(){
  const topic = snapshotCache.topics?.[0];

  const headerNameEl = document.getElementById("activeSectionName");
  const listEl = document.getElementById("pageList");

  headerNameEl.textContent = "Bölüm seçilmedi";
  listEl.innerHTML = "";

  if(!topic) return;

  const sec = topic.sections?.find(s=>s.slug===currentSection);
  if(!sec) return;

  headerNameEl.textContent = (sec.title || sec.slug).toUpperCase();

  sec.pages?.forEach(p=>{
    const item = document.createElement("div");
    item.className = "pageListItem";
    if(currentTopic===topic.slug && currentSection===sec.slug && currentPage===p.slug){
      item.classList.add("active");
    }

    item.onclick = ()=>{
      openPage(topic.slug, sec.slug, p.slug);
    };

    const titleDiv = document.createElement("div");
    titleDiv.className = "pageListTitle";
    titleDiv.textContent = p.title || p.slug;

    const metaDiv = document.createElement("div");
    metaDiv.className = "pageListMeta";
    metaDiv.textContent = formatLocal(p.updatedAt);

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
        pageSlug: p.slug
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

    item.appendChild(titleDiv);
    item.appendChild(metaDiv);
    item.appendChild(menuBtn);
    item.appendChild(dd);

    listEl.appendChild(item);
  });

  // "+ Yeni sayfa" butonu listenin sonuna
  const addPageBtn = document.createElement("button");
  addPageBtn.className = "addPageBtn";
  addPageBtn.textContent = "+ Yeni sayfa";
  addPageBtn.onclick = ()=>{
    openModal("createPage", {
      topicSlug: topic.slug,
      sectionSlug: sec.slug
    });
  };
  listEl.appendChild(addPageBtn);
}

// EDITOR HEADER RENDER
function renderEditorHeader(){
  const nm = document.getElementById("pageName");
  const ph = document.getElementById("pagePath");

  if(!currentTopic || !currentSection || !currentPage){
    if(nm) nm.textContent = "Seçili sayfa yok";
    if(ph) ph.textContent = "";
    return;
  }

  const topic = snapshotCache.topics?.find(t=>t.slug===currentTopic);
  const sec   = topic?.sections?.find(s=>s.slug===currentSection);
  const p     = sec?.pages?.find(x=>x.slug===currentPage);

  if(nm) nm.textContent = p ? (p.title || p.slug) : currentPage;
  if(ph) ph.textContent = `${currentTopic} / ${currentSection} / ${currentPage}`;
}

// PAGE OPEN
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

  const ed = document.getElementById("editor");
  if(ed){
    ed.value = pageData.content || "";
  }

  const nm = document.getElementById("pageName");
  const ph = document.getElementById("pagePath");
  if(nm) nm.textContent = pageData.title || pageSlug;
  if(ph) ph.textContent = `${topicSlug} / ${sectionSlug} / ${pageSlug}`;

  if(pageData.updatedAt){
    setStatus("açıldı · " + formatLocal(pageData.updatedAt));
  } else {
    setStatus("açıldı");
  }

  renderSections();
  renderPages();

  dirty = false;
  savingNow = false;
  if(saveTimer){
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

// CLEAR EDITOR
function clearEditor(){
  const ed = document.getElementById("editor");
  if(ed) ed.value = "";

  const nm = document.getElementById("pageName");
  const ph = document.getElementById("pagePath");
  if(nm) nm.textContent = "Seçili sayfa yok";
  if(ph) ph.textContent = "";

  setStatus("");
}

// AUTOSAVE
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

  const ed = document.getElementById("editor");
  const txt = ed ? ed.value : "";

  const nm = document.getElementById("pageName");
  const newTitle = nm ? nm.textContent.trim() : currentPage;

  setStatus("kaydediliyor...");

  try {
    const r = await callApi(
      `/api/page/${currentTopic}/${currentSection}/${currentPage}`,
      {
        method:"PUT",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ content: txt, title: newTitle })
      }
    );

    if(r.ok){
      const js = await r.json();
      setStatus("✓ kaydedildi · " + formatLocal(js.updatedAt || ""));

      // snapshotCache update
      const topicObj = snapshotCache.topics?.find(t=>t.slug===currentTopic);
      const secObj   = topicObj?.sections?.find(s=>s.slug===currentSection);
      const pObj     = secObj?.pages?.find(p=>p.slug===currentPage);
      if(pObj){
        pObj.content   = txt;
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

// MODAL
function openModal(mode, data){
  modalMode = mode;
  modalData = data || {};

  const ov  = document.getElementById("modalOverlay");
  const tEl = document.getElementById("modalTitle");
  const bEl = document.getElementById("modalBody");
  const cBtn= document.getElementById("modalConfirm");

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
      <input id="modalInputTitle" type="text" value="${oldSlug}"/>
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
  const ov = document.getElementById("modalOverlay");
  ov.classList.add("hidden");
  modalMode = null;
  modalData = {};
}

// MODAL CONFIRM HANDLER
async function handleModalConfirm(){
  // SECTION CREATE
  if(modalMode === "createSection"){
    const inp = document.getElementById("modalInputSectionSlug");
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

  // SECTION RENAME
  if(modalMode === "renameSection"){
    const inp = document.getElementById("modalInputSectionSlug");
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

  // SECTION DELETE
  if(modalMode === "deleteSection"){
    const confEl = document.getElementById("modalInputConfirm");
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

  // PAGE CREATE
  if(modalMode === "createPage"){
    const slugEl  = document.getElementById("modalInputSlug");
    const titleEl = document.getElementById("modalInputTitle");
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
    openPage(topicSlug, sectionSlug, newSlug);
    closeModal();
    return;
  }

  // PAGE RENAME
  if(modalMode === "renamePage"){
    const slugEl  = document.getElementById("modalInputSlug");
    const titleEl = document.getElementById("modalInputTitle");
    const newSlug  = (slugEl.value  || "").trim();
    const newTitle = (titleEl.value || "").trim() || newSlug;
    if(!newSlug){ return; }

    const { topicSlug, sectionSlug, pageSlug } = modalData;

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
      openPage(topicSlug, sectionSlug, newSlug);
      setStatus("yeniden adlandırıldı");
    } else {
      setStatus("rename hata");
    }
    closeModal();
    return;
  }

  // PAGE DELETE
  if(modalMode === "deletePage"){
    const confEl = document.getElementById("modalInputConfirm");
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

// WIRING
function wireUI(){
  const ed = document.getElementById("editor");
  if(ed){
    ed.addEventListener("input", markDirty);
  }

  const cancelBtn = document.getElementById("modalCancel");
  if(cancelBtn){
    cancelBtn.onclick = closeModal;
  }
  const confirmBtn = document.getElementById("modalConfirm");
  if(confirmBtn){
    confirmBtn.onclick = handleModalConfirm;
  }

  const renameSectionBtn = document.getElementById("renameSectionBtn");
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

  const syncNowBtn = document.getElementById("syncNowBtn");
  if(syncNowBtn){
    syncNowBtn.onclick = async ()=>{
      setStatus("snapshot yenileniyor...");
      await fetchSnapshot();
    };
  }

  const settingsBtn = document.getElementById("settingsBtn");
  if(settingsBtn){
    settingsBtn.onclick = ()=>{
      alert("Ayarlar TODO (VPS URL / Offline sync)");
    };
  }
}

// BOOT
wireUI();
fetchSnapshot();
