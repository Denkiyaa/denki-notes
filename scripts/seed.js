const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { DATA_DIR } = require('../src/config');

(async () => {
  try {
    // Build a small demo tree: data/demo/general/{welcome.json, tips.json}
    const topic = 'demo';
    const section = 'general';
    const nowISO = new Date().toISOString();

    const baseDir = path.join(DATA_DIR, topic, section);
    await fsp.mkdir(baseDir, { recursive: true });

    const welcomePath = path.join(baseDir, 'welcome.json');
    const tipsPath    = path.join(baseDir, 'tips.json');

    if (!fs.existsSync(welcomePath)) {
      await fsp.writeFile(
        welcomePath,
        JSON.stringify({
          title: 'Welcome',
          content: '<h1>Welcome</h1><p>This is a local demo note. You can edit this content and it will auto-save.</p>',
          updatedAt: nowISO
        }, null, 2),
        'utf8'
      );
      console.log('Created', welcomePath);
    } else {
      console.log('Exists', welcomePath);
    }

    if (!fs.existsSync(tipsPath)) {
      await fsp.writeFile(
        tipsPath,
        JSON.stringify({
          title: 'Tips',
          content: '<p>Try dragging pages to reorder. Use the three dots menu to rename or delete.</p>',
          updatedAt: nowISO
        }, null, 2),
        'utf8'
      );
      console.log('Created', tipsPath);
    } else {
      console.log('Exists', tipsPath);
    }

    // Optional: write an order file so order persists predictably
    const orderFile = path.join(baseDir, '.order.json');
    const desiredOrder = ['welcome', 'tips'];
    await fsp.writeFile(orderFile, JSON.stringify(desiredOrder, null, 2), 'utf8');
    console.log('Wrote', orderFile);

    console.log('Seed complete. DATA_DIR =', DATA_DIR);
  } catch (e) {
    console.error('Seed error:', e);
    process.exit(1);
  }
})();

