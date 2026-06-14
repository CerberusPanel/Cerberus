// src/routes/users.routes.js

const express = require("express");
const storage = require("../storage");
const router = express.Router();

// Get a list of all users
router.get("/list", (req, res) => {
  if (req.auth?.role !== "master") {
    return res.status(403).json({
      error: "Master account required",
    });
  }

  return res.json(storage.listUsers());
});

// Create a new user
router.post("/user", (req, res) => {
  if (req.auth?.role !== "master") {
    return res.status(403).json({
      error: "Master account required",
    });
  }

  try {
    const username = String(req.body?.username ?? "").trim();
    const displayName = String(req.body?.displayName ?? username).trim() || username;
    const password = String(req.body?.password ?? "");

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    const user = storage.upsertUser({
      username,
      displayName,
      password,
      role: "user",
    });

    return res.status(201).json(user);
  } catch (error) {
    return res.status(500).json({
      error: "Unable to create user",
      details: error.message,
    });
  }
});

module.exports = router
