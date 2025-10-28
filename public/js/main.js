function wireUI(){
  // textarea autosave
  const ed = document.getElementById("editor");
  if(ed){
    ed.addEventListener("input", markDirty);
  }

  // CRUD modal buttons
  const cancelBtn = document.getElementById("modalCancel");
  if(cancelBtn){
    cancelBtn.onclick = closeModal;
  }
  const confirmBtn = document.getElementById("modalConfirm");
  if(confirmBtn){
    confirmBtn.onclick = handleModalConfirm;
  }

  // section header ⋮ (rename section hızlı erişim)
  const renameSectionBtn = document.getElementById("renameSectionBtn");
  if(renameSectionBtn){
    renameSectionBtn.onclick = ()=>{
      if(!AppState.currentTopic || !AppState.currentSection){
        alert("Önce bölüm seç");
        return;
      }
      openModal("renameSection", {
        topicSlug: AppState.currentTopic,
        sectionSlug: AppState.currentSection
      });
    };
  }

  // footer sync now
  const syncNowBtn = document.getElementById("syncNowBtn");
  if(syncNowBtn){
    syncNowBtn.onclick = async ()=>{
      setStatus("snapshot yenileniyor...");
      await fetchSnapshot();
    };
  }

  // settings modal open/close
  const settingsBtn = document.getElementById("settingsBtn");
  if(settingsBtn){
    settingsBtn.onclick = ()=>{
      openSettingsModal();
    };
  }
  const settingsCloseBtn = document.getElementById("settingsCloseBtn");
  if(settingsCloseBtn){
    settingsCloseBtn.onclick = ()=>{
      closeSettingsModal();
    };
  }

  const settingsSyncBtn = document.getElementById("settingsSyncBtn");
  if(settingsSyncBtn){
    settingsSyncBtn.onclick = async ()=>{
      await handleSettingsSync();
    };
  }

  const settingsExportBtn = document.getElementById("settingsExportBtn");
  if(settingsExportBtn){
    settingsExportBtn.onclick = ()=>{
      alert("TODO: tüm notları zip olarak indir");
    };
  }

  const settingsLogoutBtn = document.getElementById("settingsLogoutBtn");
  if(settingsLogoutBtn){
    settingsLogoutBtn.onclick = ()=>{
      alert("TODO: auth / logout");
    };
  }

  // FORMAT BAR buttons
  const fmtBtns = document.querySelectorAll(".fmtBtn");
  fmtBtns.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const cmd = btn.getAttribute("data-cmd");
      const editorEl = document.getElementById("editor");
      if(!editorEl) return;
      editorEl.focus();

      if(cmd==="bold"){
        surroundSelection(editorEl, "**", "**");
      } else if(cmd==="italic"){
        surroundSelection(editorEl, "_", "_");
      } else if(cmd==="underline"){
        surroundSelection(editorEl, "__", "__"); // pseudo underline
      } else if(cmd==="h1"){
        makeH1(editorEl);
      }
    });
  });
}

// boot
wireUI();
fetchSnapshot();
