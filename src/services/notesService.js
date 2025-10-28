const fs = require("fs-extra");
const path = require("path");
const { DATA_DIR, TOPICS_FILE } = require("../config");

function notePath(topicSlug, pageSlug) {
  return path.join(DATA_DIR, "notes", topicSlug, `${pageSlug}.md`);
}

// data klasörünü ve default topic'i hazırla
async function ensureDataLayout() {
  await fs.ensureDir(DATA_DIR);
  await fs.ensureDir(path.join(DATA_DIR, "notes"));

  const exists = await fs.pathExists(TOPICS_FILE);
  if (!exists) {
    const defaultTopics = [
      {
        slug: "default",
        title: "Default",
        pages: [],
      },
    ];

    await fs.writeFile(
      TOPICS_FILE,
      JSON.stringify(defaultTopics, null, 2),
      "utf8"
    );

    await fs.ensureDir(path.join(DATA_DIR, "notes", "default"));
  }
}

// topics.json oku
async function loadTopics() {
  const raw = await fs.readFile(TOPICS_FILE, "utf8");
  return JSON.parse(raw);
}

// topics.json yaz
async function saveTopics(topics) {
  await fs.writeFile(TOPICS_FILE, JSON.stringify(topics, null, 2), "utf8");
}

// tek sayfayı oku
async function readPage(topicSlug, pageSlug) {
  const file = notePath(topicSlug, pageSlug);
  const content = await fs.readFile(file, "utf8");
  return { topic: topicSlug, page: pageSlug, content };
}

// sayfayı yaz/oluştur
async function writePage(topicSlug, pageSlug, content) {
  const file = notePath(topicSlug, pageSlug);

  // klasör mevcut mu
  await fs.ensureDir(path.dirname(file));

  // içeriği yaz
  await fs.writeFile(file, content, "utf8");

  // topics.json güncelle
  const topics = await loadTopics();

  let t = topics.find((t) => t.slug === topicSlug);
  if (!t) {
    t = { slug: topicSlug, title: topicSlug, pages: [] };
    topics.push(t);
  }

  let p = t.pages.find((p) => p.slug === pageSlug);
  if (!p) {
    t.pages.push({ slug: pageSlug, title: pageSlug });
  }

  await saveTopics(topics);
}

// sayfayı sil
async function deletePage(topicSlug, pageSlug) {
  // dosyayı sil
  const file = notePath(topicSlug, pageSlug);
  await fs.remove(file);

  // topics.json'dan çıkar
  const topics = await loadTopics();
  const t = topics.find((t) => t.slug === topicSlug);
  if (t) {
    t.pages = t.pages.filter((p) => p.slug !== pageSlug);
  }
  await saveTopics(topics);
}

// sayfayı yeniden adlandır (slug ve görünen başlık)
// newSlug değişirse dosya ismini rename ediyoruz
async function renamePage(topicSlug, oldSlug, newSlug, newTitle) {
  const oldFile = notePath(topicSlug, oldSlug);
  const newFile = notePath(topicSlug, newSlug);

  // eski dosya varsa taşı
  if (oldSlug !== newSlug) {
    await fs.ensureDir(path.dirname(newFile));
    // dosyayı move et
    await fs.move(oldFile, newFile, { overwrite: true });
  }

  // topics.json içinde güncelle
  const topics = await loadTopics();
  const t = topics.find((t) => t.slug === topicSlug);
  if (!t) {
    // topic yoksa bu biraz garip ama yine de yeni topic yapalım
    const newTopic = {
      slug: topicSlug,
      title: topicSlug,
      pages: [
        {
          slug: newSlug,
          title: newTitle || newSlug,
        },
      ],
    };
    topics.push(newTopic);
    await saveTopics(topics);
    return;
  }

  // sayfa bul
  const pg = t.pages.find((p) => p.slug === oldSlug);
  if (!pg) {
    // yoksa yeni olarak ekle
    t.pages.push({
      slug: newSlug,
      title: newTitle || newSlug,
    });
  } else {
    // varsa update et
    pg.slug = newSlug;
    pg.title = newTitle || newSlug;
  }

  // eski slug ile olan diğerlerini temizle (çift kayıt kalmasın)
  t.pages = t.pages.filter((p, idx, arr) => {
    // aynı slug'lı ilk elemanı tutuyoruz, sonraki kopyalar uçsun
    return arr.findIndex(xx => xx.slug === p.slug) === idx;
  });

  await saveTopics(topics);
}

// snapshot (offline sync için toplu json)
async function buildSnapshot() {
  const topics = await loadTopics();
  const bundle = { topics: [], generatedAt: new Date().toISOString() };

  for (const t of topics) {
    const topicData = { slug: t.slug, title: t.title, pages: [] };

    for (const p of t.pages) {
      const file = notePath(t.slug, p.slug);
      let content = "";
      try {
        content = await fs.readFile(file, "utf8");
      } catch {
        // yoksa boş
      }
      topicData.pages.push({
        slug: p.slug,
        title: p.title,
        content,
      });
    }

    bundle.topics.push(topicData);
  }

  return bundle;
}

module.exports = {
  ensureDataLayout,
  loadTopics,
  readPage,
  writePage,
  deletePage,
  renamePage,
  buildSnapshot,
};
