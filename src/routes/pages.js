const express = require("express");
const router = express.Router();

const {
  loadTopics,
  readPage,
  writePage,
  deletePage,
  renamePage,
  buildSnapshot,
} = require("../services/notesService");

// tüm topic+sayfa listesi
router.get("/api/topics", async (req, res) => {
  const topics = await loadTopics();
  res.json({ topics });
});

// sayfa oku
router.get("/api/page/:topic/:page", async (req, res) => {
  const { topic, page } = req.params;
  try {
    const data = await readPage(topic, page);
    res.json(data);
  } catch (e) {
    res.status(404).json({ error: "not found" });
  }
});

// sayfa yaz/oluştur
router.put("/api/page/:topic/:page", async (req, res) => {
  const { topic, page } = req.params;
  const { content } = req.body || {};

  if (!content && content !== "") {
    return res.status(400).json({ error: "no content" });
  }

  await writePage(topic, page, content);
  res.json({ ok: true });
});

// sayfa sil
router.delete("/api/page/:topic/:page", async (req, res) => {
  const { topic, page } = req.params;
  await deletePage(topic, page);
  res.json({ ok: true, deleted: { topic, page } });
});

// sayfa yeniden adlandır
// body: { newSlug, newTitle }
router.post("/api/page/:topic/:page/rename", async (req, res) => {
  const { topic, page } = req.params;
  const { newSlug, newTitle } = req.body || {};

  if (!newSlug) {
    return res.status(400).json({ error: "newSlug required" });
  }

  await renamePage(topic, page, newSlug, newTitle || newSlug);

  res.json({
    ok: true,
    updated: {
      topic,
      oldSlug: page,
      newSlug,
      newTitle: newTitle || newSlug,
    },
  });
});

// snapshot
router.get("/api/snapshot", async (req, res) => {
  const snapshot = await buildSnapshot();
  res.json(snapshot);
});

module.exports = router;
