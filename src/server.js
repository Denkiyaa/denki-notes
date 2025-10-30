const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

const { PORT, DATA_DIR } = require("./config");
const { ensureDataLayout } = require("./services/notesService");

const app = express();

// -------- constants --------
const DELETED_FILE = path.join(DATA_DIR, "deletedSections.json");

// --- middleware ---
app.use(cors({
  origin: "*",
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(bodyParser.json());

// ---------------------- helpers ----------------------

// data/<topic>/<section>/<page>.json
function pageFilePath(topic, section, page) {
  return path.join(DATA_DIR, topic, section, page + ".json");
}

// tek sayfa oku
async function loadPageObj(topic, section, page) {
  const fp = pageFilePath(topic, section, page);
  if (!fs.existsSync(fp)) {
    return {
      title: page,
      content: "",
      updatedAt: null
    };
  }
  const raw = await fsp.readFile(fp, "utf8");
  return JSON.parse(raw);
}

// tek sayfa kaydet (create/update)
async function savePageObj(topic, section, page, data) {
  const dirPath = path.join(DATA_DIR, topic, section);
  await fsp.mkdir(dirPath, { recursive: true });

  const nowISO = new Date().toISOString();
  const merged = {
    title: data.title || page,
    content: data.content || "",
    updatedAt: nowISO,
  };

  await fsp.writeFile(
    pageFilePath(topic, section, page),
    JSON.stringify(merged, null, 2),
    "utf8"
  );

  return merged;
}

// sayfa yeniden adlandır
async function renamePageObj(topic, section, oldSlug, newSlug, newTitle) {
  const oldPath = pageFilePath(topic, section, oldSlug);
  const newPath = pageFilePath(topic, section, newSlug);

  let oldData = { title: oldSlug, content: "", updatedAt: null };
  if (fs.existsSync(oldPath)) {
    oldData = JSON.parse(await fsp.readFile(oldPath, "utf8"));
  }

  const nowISO = new Date().toISOString();
  const merged = {
    title: newTitle || newSlug,
    content: oldData.content || "",
    updatedAt: nowISO
  };

  await fsp.mkdir(path.dirname(newPath), { recursive: true });
  await fsp.writeFile(newPath, JSON.stringify(merged, null, 2), "utf8");

  if (fs.existsSync(oldPath)) {
    await fsp.unlink(oldPath);
  }

  return merged;
}

// sayfa sil
async function deletePageObj(topic, section, page) {
  const fp = pageFilePath(topic, section, page);
  if (fs.existsSync(fp)) {
    await fsp.unlink(fp);
  }
}

// deletedSections.json yükle
async function loadDeletedList() {
  if (!fs.existsSync(DELETED_FILE)) {
    return [];
  }
  try {
    const raw = await fsp.readFile(DELETED_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

// deletedSections.json içine ekle
async function appendDeleted(topicSlug, sectionSlug) {
  const list = await loadDeletedList();
  list.push({
    topic: topicSlug,
    section: sectionSlug,
    deletedAt: new Date().toISOString()
  });
  await fsp.writeFile(DELETED_FILE, JSON.stringify(list, null, 2), "utf8");
}

// snapshot (topics -> sections -> pages)
async function buildSnapshot() {
  // topics = DATA_DIR altındaki klasörler
  let topicSlugs = [];
  try {
    topicSlugs = (await fsp.readdir(DATA_DIR, { withFileTypes: true }))
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch(e){
    topicSlugs = [];
  }

  const topicsOut = [];

  for (const topicSlug of topicSlugs) {
    const topicDir = path.join(DATA_DIR, topicSlug);

    // sections = topicDir altındaki klasörler
    let sectionSlugs = [];
    try {
      sectionSlugs = (await fsp.readdir(topicDir, { withFileTypes: true }))
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch(e){
      sectionSlugs = [];
    }

    const sectionsOut = [];

    for (const sectionSlug of sectionSlugs) {
      const sectionDir = path.join(topicDir, sectionSlug);

      // pages = sectionDir altındaki *.json dosyaları
      let pageSlugs = [];
      try {
        pageSlugs = (await fsp.readdir(sectionDir, { withFileTypes: true }))
          .filter(d => d.isFile() && d.name.endsWith(".json"))
          .map(d => d.name.replace(/\.json$/,""));
      } catch(e){
        pageSlugs = [];
      }

      // apply saved order if present
      try {
        const orderPath = path.join(sectionDir, ".order.json");
        if (fs.existsSync(orderPath)) {
          const raw = await fsp.readFile(orderPath, "utf8");
          const orderArr = JSON.parse(raw);
          if (Array.isArray(orderArr)) {
            const inOrder = pageSlugs.filter(s => orderArr.includes(s));
            const rest    = pageSlugs.filter(s => !orderArr.includes(s)).sort();
            inOrder.sort((a,b)=> orderArr.indexOf(a) - orderArr.indexOf(b));
            pageSlugs = [...inOrder, ...rest];
          }
        }
      } catch {}

      const pagesArr = [];
      for (const pSlug of pageSlugs) {
        const pObj = await loadPageObj(topicSlug, sectionSlug, pSlug);
        pagesArr.push({
          slug: pSlug,
          title: pObj.title || pSlug,
          content: pObj.content || "",
          updatedAt: pObj.updatedAt || null
        });
      }

      sectionsOut.push({
        slug: sectionSlug,
        title: sectionSlug.toUpperCase(), // TODO: ileride custom title
        pages: pagesArr
      });
    }

    topicsOut.push({
      slug: topicSlug,
      title: topicSlug,
      sections: sectionsOut
    });
  }

  return {
    topics: topicsOut,
    generatedAt: new Date().toISOString()
  };
}

// ---------------------- ROUTES ----------------------

// health
app.get("/api/health", (req,res)=>{
  res.json({ ok:true, msg:"alive" });
});

// snapshot
app.get("/api/snapshot", async (req,res)=>{
  const snap = await buildSnapshot();
  res.json(snap);
});

// soft delete listesi
app.get("/api/deleted-sections", async (req,res)=>{
  const list = await loadDeletedList();
  res.json({ deleted: list });
});

// TEK SAYFA OKU
app.get("/api/page/:topic/:section/:page", async (req,res)=>{
  const { topic, section, page } = req.params;
  const obj = await loadPageObj(topic, section, page);
  res.json({
    title: obj.title || page,
    content: obj.content || "",
    updatedAt: obj.updatedAt || null
  });
});

// SAYFA OLUŞTUR / GÜNCELLE
app.put("/api/page/:topic/:section/:page", async (req,res)=>{
  const { topic, section, page } = req.params;
  const { content, title } = req.body || {};
  const merged = await savePageObj(topic, section, page, { content, title });
  res.json({ ok:true, updatedAt: merged.updatedAt });
});

// SAYFA YENİDEN ADLANDIR
app.post("/api/page/:topic/:section/:page/rename", async (req,res)=>{
  const { topic, section, page } = req.params;
  const { newSlug, newTitle } = req.body || {};
  if(!newSlug){
    return res.status(400).json({error:"newSlug required"});
  }

  const merged = await renamePageObj(topic, section, page, newSlug, newTitle);

  // keep order file consistent if present
  try {
    const sectionDir = path.join(DATA_DIR, topic, section);
    const orderFile = path.join(sectionDir, ".order.json");
    if (fs.existsSync(orderFile)) {
      const raw = await fsp.readFile(orderFile, "utf8");
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const next = arr.map(s => s === page ? newSlug : s);
        // ensure no duplicates
        const dedup = next.filter((s, i) => next.indexOf(s) === i);
        await fsp.writeFile(orderFile, JSON.stringify(dedup, null, 2), "utf8");
      }
    }
  } catch {}
  res.json({ ok:true, updatedAt: merged.updatedAt, newSlug });
});

// SAYFA SİL
app.delete("/api/page/:topic/:section/:page", async (req,res)=>{
  const { topic, section, page } = req.params;
  await deletePageObj(topic, section, page);
  res.json({ ok:true });
});

// SECTION OLUŞTUR
app.post("/api/section/:topic", async (req,res)=>{
  const { topic } = req.params;
  const { sectionSlug } = req.body || {};
  if(!sectionSlug){
    return res.status(400).json({error:"sectionSlug required"});
  }

  const dirPath = path.join(DATA_DIR, topic, sectionSlug);
  await fsp.mkdir(dirPath, { recursive: true });

  res.json({ ok:true });
});

// SECTION YENİDEN ADLANDIR
app.post("/api/section/:topic/:section/rename", async (req,res)=>{
  const { topic, section } = req.params;
  const { newSectionSlug } = req.body || {};
  if(!newSectionSlug){
    return res.status(400).json({error:"newSectionSlug required"});
  }

  const oldDir = path.join(DATA_DIR, topic, section);
  const newDir = path.join(DATA_DIR, topic, newSectionSlug);

  if(!fs.existsSync(oldDir)){
    return res.status(404).json({error:"section not found"});
  }

  await fsp.mkdir(path.join(DATA_DIR, topic), { recursive: true });
  await fsp.rename(oldDir, newDir);

  res.json({ ok:true });
});

// SECTION SİL (+ soft delete marker yaz)
app.delete("/api/section/:topic/:section", async (req,res)=>{
  const { topic, section } = req.params;
  const dir = path.join(DATA_DIR, topic, section);

  if(fs.existsSync(dir)){
    // 1) marker ekle
    await appendDeleted(topic, section);
    // 2) gerçekten siliyoruz VPS tarafında
    await fsp.rm(dir, { recursive: true, force: true });
  }

  res.json({ ok:true });
});

// SIRALAMA (drag-drop ileride kullanıyoruz)
app.post("/api/section/:topic/:section/reorder-pages", async (req,res)=>{
  const { topic, section } = req.params;
  const { order } = req.body || {};
  if(!Array.isArray(order)){
    return res.status(400).json({error:"order array required"});
  }

  const sectionDir = path.join(DATA_DIR, topic, section);
  await fsp.mkdir(sectionDir, { recursive: true });

  const orderFile = path.join(sectionDir, ".order.json");
  await fsp.writeFile(orderFile, JSON.stringify(order,null,2),"utf8");

  res.json({ ok:true });
});

// MOBİL SYNC PUSH
app.post("/api/mobile-sync/push", async (req,res)=>{
  const { topic, section, page, title, content, clientUpdatedAt } = req.body || {};
  if(!topic || !section || !page || !clientUpdatedAt){
    return res.status(400).json({error:"bad request"});
  }

  const current = await loadPageObj(topic, section, page);

  // conflict kontrolü
  if (current.updatedAt && current.updatedAt > clientUpdatedAt) {
    return res.status(409).json({
      error: "conflict",
      serverUpdatedAt: current.updatedAt,
      serverContent: current.content
    });
  }

  const dirPath = path.join(DATA_DIR, topic, section);
  await fsp.mkdir(dirPath, { recursive: true });

  const nowISO = new Date().toISOString();
  const nextData = {
    title: title || current.title || page,
    content: (content !== undefined ? content : current.content || ""),
    updatedAt: nowISO
  };

  await fsp.writeFile(
    pageFilePath(topic, section, page),
    JSON.stringify(nextData,null,2),
    "utf8"
  );

  res.json({ ok:true, updatedAt: nowISO });
});

// --- static frontend ---
app.use(express.static(path.join(__dirname, "..", "public")));

// fallback -> SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// --- boot ---
ensureDataLayout().then(() => {
  app.listen(PORT, () => {
    console.log("Denki Notes up on :", PORT);
  });
});
