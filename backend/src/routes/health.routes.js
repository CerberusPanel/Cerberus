// src/routes/health.routes.js

const express = require("express");
const router = express.Router();

// API Health Check
router.get("/", (req, res) => {
  res.json({
    name: "Cerberus",
    status: "online",
    message: "Cerberus backend is running",
  });
});

module.exports = router;