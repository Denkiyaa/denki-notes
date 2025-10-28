const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { DATA_DIR, TOPICS_FILE } = require("./config");

(async () => {
  try {
    if (!fs.existsSync(TOPICS_FILE)) {
      console.error("topics.json yok:", TOPICS_FILE);
      process.exit(1);
    }

    // topics.json şu formatta:
    // [ { slug, title, pages:[{slug,title}, ...] }, ... ]
    const rawTopics = await fsp.readFile(TOPICS_FILE, "utf8");
    let topicsArr = JSON.parse(rawTopics);

    // güvenlik: eğer yanlışlıkla object geldiyse eski hali de dene
    if (!Array.isArray(topicsArr) && topicsArr.topics) {
      topicsArr = topicsArr.topics;
    }
    if (!Array.isArray(topicsArr)) {
      console.error("topics.json beklenen formatta değil.");
      process.exit(1);
    }

    for (const t of topicsArr) {
      const topicSlug = t.slug;
      const topicDirNew = path.join(DATA_DIR, topicSlug);

      // yeni hedef klasör: /opt/denki-notes/data/<topicSlug>
      await fsp.mkdir(topicDirNew, { recursive: true });

      const pagesList = Array.isArray(t.pages) ? t.pages : [];

      for (const p of pagesList) {
        const pageSlug = p.slug;
        const pageTitle = p.title || pageSlug;

        // eski içerik nerede?
        // /opt/denki-notes/data/notes/<topicSlug>/<pageSlug>.md
        // fallback: /opt/denki-notes/data/<topicSlug>/<pageSlug>.md
        const cand1 = path.join(DATA_DIR, "notes", topicSlug, pageSlug + ".md");
        const cand2 = path.join(DATA_DIR, topicSlug, pageSlug + ".md");

        let content = "";
        if (fs.existsSync(cand1)) {
          content = await fsp.readFile(cand1, "utf8");
        } else if (fs.existsSync(cand2)) {
          content = await fsp.readFile(cand2, "utf8");
        } else {
          content = "";
        }

        const nowISO = new Date().toISOString();

        const newObj = {
          title: pageTitle,
          content,
          updatedAt: nowISO
        };

        const newJsonPath = path.join(topicDirNew, pageSlug + ".json");

        await fsp.writeFile(
          newJsonPath,
          JSON.stringify(newObj, null, 2),
          "utf8"
        );

        console.log("wrote", newJsonPath);
      }
    }

    console.log("migrate done (v3).");
  } catch (err) {
    console.error("migrate error:", err);
    process.exit(1);
  }
})();
