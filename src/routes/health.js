const express = require("express");
const router = express.Router();
const { PORT } = require("../config");

router.get("/health", (req, res) => {
  res.json({ ok: true, port: PORT });
});

module.exports = router;
