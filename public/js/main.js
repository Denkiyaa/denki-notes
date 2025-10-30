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

      const fromSlug = dragPageSlug;
      const toSlug   = p.slug;
      dragPageSlug   = null;

      if(!fromSlug || fromSlug===toSlug) return;

      const secObj = snapshotCache.topics[0].sections.find(s=>s.slug===currentSection);
      if(!secObj) return;

      const order = secObj.pages.map(x=>x.slug);
      const fromIdx = order.indexOf(fromSlug);
      const toIdx   = order.indexOf(toSlug);
      if(fromIdx===-1 || toIdx===-1) return;

      order.splice(toIdx,0,order.splice(fromIdx,1)[0]);
      secObj.pages.sort((a,b)=> order.indexOf(a.slug)-order.indexOf(b.slug));

      renderPages();

      try {
        await callApi(`/api/section/${currentTopic}/${currentSection}/reorder-pages`, {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ order })
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
  const newTitle   = ttl ? ttl.textContent.trim() : currentPage;

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
