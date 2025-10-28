// snapshot çek ve her şeyi render et
async function fetchSnapshot(){
  setStatus("yükleniyor...");
  const r = await callApi("/api/snapshot");
  if(!r.ok){
    setStatus("snapshot hata "+r.status);
    return;
  }
  AppState.snapshotCache = await r.json();

  renderSections();
  renderPages();
  renderEditorHeader();

  // seçili yoksa ilk page'e git
  if(!AppState.currentTopic || !AppState.currentSection || !AppState.currentPage){
    const firstTopic   = AppState.snapshotCache.topics?.[0];
    const firstSection = firstTopic?.sections?.[0];
    const firstPage    = firstSection?.pages?.[0];
    if(firstTopic && firstSection && firstPage){
      openPage(firstTopic.slug, firstSection.slug, firstPage.slug);
    }
  } else {
    openPage(AppState.currentTopic, AppState.currentSection, AppState.currentPage);
  }

  setStatus("hazır");
}
window.fetchSnapshot = fetchSnapshot;


// LEFT: sections
function renderSections(){
  const cont = document.getElementById("sectionList");
  if(!cont) return;
  cont.innerHTML = "";

  const topic = AppState.snapshotCache?.topics?.[0];
  if(!topic){
    cont.innerHTML = "<div style='color:#888;font-size:12px;padding:10px;'>bölüm yok</div>";
    return;
  }

  topic.sections?.forEach(sec=>{
    const row = document.createElement("div");
    row.className = "sectionRow";

    if(AppState.currentTopic === topic.slug && AppState.currentSection === sec.slug){
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
      AppState.currentTopic   = topic.slug;
      AppState.currentSection = sec.slug;
      const firstPage = sec.pages?.[0];
      AppState.currentPage = firstPage ? firstPage.slug : null;

      renderSections();
      renderPages();

      if(AppState.currentPage){
        openPage(AppState.currentTopic, AppState.currentSection, AppState.currentPage);
      } else {
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

  // + Yeni bölüm
  const addSectionBtn = document.createElement("button");
  addSectionBtn.className = "addSectionBtn";
  addSectionBtn.textContent = "+ Yeni bölüm";
  addSectionBtn.onclick = ()=>{
    openModal("createSection",{});
  };
  cont.appendChild(addSectionBtn);

  // dış tık kapatsın
  document.addEventListener("click", ()=>{
    document.querySelectorAll(".sectionMenuDropdown").forEach(x=>x.style.display="none");
    document.querySelectorAll(".pageListMenuDropdown").forEach(x=>x.style.display="none");
  }, { once:true });
}
window.renderSections = renderSections;


// MIDDLE: pages list
function renderPages(){
  const listEl = document.getElementById("pageList");
  const headerNameEl = document.getElementById("activeSectionName");
  if(!listEl || !headerNameEl) return;

  const topic = AppState.snapshotCache?.topics?.[0];
  if(!topic){
    headerNameEl.textContent = "Bölüm seçilmedi";
    listEl.innerHTML = "";
    return;
  }

  const sec = topic.sections?.find(s=>s.slug===AppState.currentSection);
  if(!sec){
    headerNameEl.textContent = "Bölüm seçilmedi";
    listEl.innerHTML = "";
    return;
  }

  headerNameEl.textContent = sec.title || sec.slug;
  listEl.innerHTML = "";

  sec.pages?.forEach(p=>{
    const item = document.createElement("div");
    item.className = "pageListItem";
    if(AppState.currentTopic===topic.slug &&
       AppState.currentSection===sec.slug &&
       AppState.currentPage===p.slug){
      item.classList.add("active");
    }

    // DRAG
    item.setAttribute("draggable","true");

    item.addEventListener("dragstart",(ev)=>{
      AppState.dragPageSlug = p.slug;
      ev.dataTransfer.effectAllowed = "move";
      item.style.opacity = "0.4";
    });

    item.addEventListener("dragend",()=>{
      item.style.opacity = "";
    });

    item.addEventListener("dragover",(ev)=>{
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      item.style.outline = "1px solid var(--bg-active)";
    });

    item.addEventListener("dragleave",()=>{
      item.style.outline = "";
    });

    item.addEventListener("drop", async (ev)=>{
      ev.preventDefault();
      item.style.outline = "";

      const fromSlug = AppState.dragPageSlug;
      const toSlug   = p.slug;
      AppState.dragPageSlug   = null;

      if(!fromSlug || fromSlug === toSlug) return;

      const secObj = AppState.snapshotCache.topics[0].sections.find(s=>s.slug===AppState.currentSection);
      if(!secObj) return;

      const order = secObj.pages.map(x=>x.slug);
      const fromIdx = order.indexOf(fromSlug);
      const toIdx   = order.indexOf(toSlug);
      if(fromIdx === -1 || toIdx === -1) return;

      // reorder
      order.splice(toIdx, 0, order.splice(fromIdx,1)[0]);

      secObj.pages.sort((a,b)=> order.indexOf(a.slug) - order.indexOf(b.slug));

      renderPages();

      try {
        await callApi(`/api/section/${AppState.currentTopic}/${AppState.currentSection}/reorder-pages`, {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ order })
        });
        setStatus("sıra kaydedildi");
      } catch(e){
        setStatus("sıra kaydedilemedi");
      }
    });

    // sayfaya tıkla -> openPage
    item.onclick = ()=>{
      openPage(topic.slug, sec.slug, p.slug);
    };

    const titleDiv = document.createElement("div");
    titleDiv.className = "pageListTitle";
    titleDiv.textContent = p.title || p.slug;

    const metaDiv = document.createElement("div");
    metaDiv.className = "pageListMeta";
    metaDiv.textContent = formatLocal(p.updatedAt || "");

    item.appendChild(titleDiv);
    item.appendChild(metaDiv);

    // üç nokta
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

    item.appendChild(menuBtn);
    item.appendChild(dd);

    listEl.appendChild(item);
  });

  // + Yeni sayfa
  const addBtn = document.createElement("button");
  addBtn.className = "addPageBtn";
  addBtn.textContent = "+ Yeni sayfa";
  addBtn.onclick = ()=>{
    if(!AppState.currentTopic || !AppState.currentSection){
      alert("Önce bölüm seç");
      return;
    }
    openModal("createPage", {
      topicSlug: AppState.currentTopic,
      sectionSlug: AppState.currentSection
    });
  };
  listEl.appendChild(addBtn);

  // dış klikte menüleri kapat
  document.addEventListener("click", ()=>{
    document.querySelectorAll(".pageListMenuDropdown").forEach(x=>x.style.display="none");
    document.querySelectorAll(".sectionMenuDropdown").forEach(x=>x.style.display="none");
  }, { once:true });
}
window.renderPages = renderPages;


// RIGHT HEADER
function renderEditorHeader(){
  const nm = document.getElementById("pageName");
  const ph = document.getElementById("pagePath");

  if(!AppState.currentTopic || !AppState.currentSection || !AppState.currentPage){
    if(nm) nm.textContent = "Seçili sayfa yok";
    if(ph) ph.textContent = "";
    return;
  }

  const topic = AppState.snapshotCache.topics?.find(t=>t.slug===AppState.currentTopic);
  const sec   = topic?.sections?.find(s=>s.slug===AppState.currentSection);
  const p     = sec?.pages?.find(x=>x.slug===AppState.currentPage);

  if(nm) nm.textContent = p ? (p.title || p.slug) : AppState.currentPage;
  if(ph) ph.textContent = `${AppState.currentTopic} / ${AppState.currentSection} / ${AppState.currentPage}`;
}
window.renderEditorHeader = renderEditorHeader;


// SAYFA AÇ
async function openPage(topicSlug, sectionSlug, pageSlug){
  AppState.currentTopic   = topicSlug;
  AppState.currentSection = sectionSlug;
  AppState.currentPage    = pageSlug;

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
    setStatus(`açıldı · ${formatLocal(pageData.updatedAt)}`);
  } else {
    setStatus("açıldı");
  }

  renderSections();
  renderPages();

  AppState.dirty = false;
  AppState.savingNow = false;
  if(AppState.saveTimer){
    clearTimeout(AppState.saveTimer);
    AppState.saveTimer = null;
  }
}
window.openPage = openPage;


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
window.clearEditor = clearEditor;


// AUTOSAVE
function markDirty(){
  if(!AppState.currentTopic || !AppState.currentSection || !AppState.currentPage) return;
  AppState.dirty = true;
  if(AppState.saveTimer) clearTimeout(AppState.saveTimer);
  AppState.saveTimer = setTimeout(autoSave, 2000);
}
window.markDirty = markDirty;

async function autoSave(){
  if(!AppState.dirty) return;
  if(AppState.savingNow) return;

  AppState.dirty = false;
  AppState.saveTimer = null;
  AppState.savingNow = true;

  if(!AppState.currentTopic || !AppState.currentSection || !AppState.currentPage){
    AppState.savingNow = false;
    return;
  }

  const ed = document.getElementById("editor");
  const txt = ed ? ed.value : "";

  const nm = document.getElementById("pageName");
  const newTitle = nm ? nm.textContent.trim() : AppState.currentPage;

  setStatus("kaydediliyor...");

  try {
    const r = await callApi(
      `/api/page/${AppState.currentTopic}/${AppState.currentSection}/${AppState.currentPage}`,
      {
        method:"PUT",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ content: txt, title: newTitle })
      }
    );

    if(r.ok){
      const js = await r.json();
      setStatus(`✓ kaydedildi · ${formatLocal(js.updatedAt || "")}`);

      const topicObj = AppState.snapshotCache.topics?.find(t=>t.slug===AppState.currentTopic);
      const secObj   = topicObj?.sections?.find(s=>s.slug===AppState.currentSection);
      const pObj     = secObj?.pages?.find(pp=>pp.slug===AppState.currentPage);
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

  AppState.savingNow = false;
  if(AppState.dirty && !AppState.saveTimer){
    AppState.saveTimer = setTimeout(autoSave, 2000);
  }
}
window.autoSave = autoSave;


// MODAL CRUD
function openModal(mode, data){
  AppState.modalMode = mode;
  AppState.modalData = data || {};

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
      <input id="modalInputSectionSlug" type="text" placeholder="PERSONAL STUFF"/>
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
window.openModal = openModal;

function closeModal(){
  const ov = document.getElementById("modalOverlay");
  ov.classList.add("hidden");
  AppState.modalMode = null;
  AppState.modalData = {};
}
window.closeModal = closeModal;


// MODAL CONFIRM
async function handleModalConfirm(){
  // SECTION CREATE
  if(AppState.modalMode === "createSection"){
    const inp = document.getElementById("modalInputSectionSlug");
    const newSectionSlug = (inp.value || "").trim();
    if(!newSectionSlug){ return; }

    const topic = AppState.snapshotCache.topics?.[0];
    if(!topic){ closeModal(); return; }

    const r = await callApi(`/api/section/${topic.slug}`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ sectionSlug: newSectionSlug })
    });
    if(r.ok){
      AppState.currentTopic   = topic.slug;
      AppState.currentSection = newSectionSlug;
      AppState.currentPage    = null;
      await fetchSnapshot();
      setStatus("bölüm oluşturuldu");
    } else {
      setStatus("oluşturulamadı");
    }
    closeModal();
    return;
  }

  // SECTION RENAME
  if(AppState.modalMode === "renameSection"){
    const inp = document.getElementById("modalInputSectionSlug");
    const newSectionSlug = (inp.value || "").trim();
    if(!newSectionSlug){ return; }

    const { topicSlug, sectionSlug } = AppState.modalData;

    const r = await callApi(`/api/section/${topicSlug}/${sectionSlug}/rename`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ newSectionSlug })
    });

    if(r.ok){
      if(AppState.currentTopic===topicSlug && AppState.currentSection===sectionSlug){
        AppState.currentSection = newSectionSlug;
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
  if(AppState.modalMode === "deleteSection"){
    const confEl = document.getElementById("modalInputConfirm");
    if(!confEl || confEl.value.trim() !== "DELETE"){
      setStatus("sil iptal");
      closeModal();
      return;
    }
    const { topicSlug, sectionSlug } = AppState.modalData;

    const r = await callApi(`/api/section/${topicSlug}/${sectionSlug}`, {
      method:"DELETE"
    });

    if(r.ok){
      if(AppState.currentTopic===topicSlug && AppState.currentSection===sectionSlug){
        AppState.currentTopic=null;
        AppState.currentSection=null;
        AppState.currentPage=null;
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
  if(AppState.modalMode === "createPage"){
    const slugEl  = document.getElementById("modalInputSlug");
    const titleEl = document.getElementById("modalInputTitle");
    const newSlug  = (slugEl.value  || "").trim();
    const newTitle = (titleEl.value || "").trim() || newSlug;
    if(!newSlug){ return; }

    const { topicSlug, sectionSlug } = AppState.modalData;

    await callApi(`/api/page/${topicSlug}/${sectionSlug}/${newSlug}`, {
      method:"PUT",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ content:"", title:newTitle })
    });

    AppState.currentTopic   = topicSlug;
    AppState.currentSection = sectionSlug;
    AppState.currentPage    = newSlug;

    await fetchSnapshot();
    openPage(topicSlug, sectionSlug, newSlug);
    closeModal();
    return;
  }

  // PAGE RENAME
  if(AppState.modalMode === "renamePage"){
    const slugEl  = document.getElementById("modalInputSlug");
    const titleEl = document.getElementById("modalInputTitle");
    const newSlug  = (slugEl.value  || "").trim();
    const newTitle = (titleEl.value || "").trim() || newSlug;
    if(!newSlug){ return; }

    const { topicSlug, sectionSlug, pageSlug } = AppState.modalData;

    const r = await callApi(`/api/page/${topicSlug}/${sectionSlug}/${pageSlug}/rename`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ newSlug, newTitle })
    });

    if(r.ok){
      if(AppState.currentTopic===topicSlug &&
         AppState.currentSection===sectionSlug &&
         AppState.currentPage===pageSlug){
        AppState.currentPage = newSlug;
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
  if(AppState.modalMode === "deletePage"){
    const confEl = document.getElementById("modalInputConfirm");
    if(!confEl || confEl.value.trim() !== "DELETE"){
      setStatus("sil iptal");
      closeModal();
      return;
    }

    const { topicSlug, sectionSlug, pageSlug } = AppState.modalData;

    const r = await callApi(`/api/page/${topicSlug}/${sectionSlug}/${pageSlug}`, {
      method:"DELETE"
    });

    if(r.ok){
      if(AppState.currentTopic===topicSlug &&
         AppState.currentSection===sectionSlug &&
         AppState.currentPage===pageSlug){
        AppState.currentPage = null;
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
window.handleModalConfirm = handleModalConfirm;


// SETTINGS MODAL
function openSettingsModal(){
  const genEl = document.getElementById("settingsLastGen");
  if(genEl && AppState.snapshotCache?.generatedAt){
    genEl.textContent = formatLocal(AppState.snapshotCache.generatedAt);
  }

  document.getElementById("settingsOverlay").classList.remove("hidden");
}
window.openSettingsModal = openSettingsModal;

function closeSettingsModal(){
  document.getElementById("settingsOverlay").classList.add("hidden");
}
window.closeSettingsModal = closeSettingsModal;

async function handleSettingsSync(){
  setStatus("snapshot yenileniyor...");
  await fetchSnapshot();
}
window.handleSettingsSync = handleSettingsSync;
