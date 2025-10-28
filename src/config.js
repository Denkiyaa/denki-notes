const path = require("path");
require("dotenv").config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 2147;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const TOPICS_FILE = path.join(DATA_DIR, "topics.json");

module.exports = {
  PORT,
  DATA_DIR,
  TOPICS_FILE,
};
