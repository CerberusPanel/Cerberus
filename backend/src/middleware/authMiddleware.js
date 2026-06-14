// src/middleware/authMiddleware.js

const { getTokenFromRequest, inspectAuthToken } = require("../services/auth.service");

function requireAuth(req, res, next) {
  if (req.path === "/api/health" || req.path === "/api/auth/login" || req.path === "/api/auth/logout") {
    return next();
  }

  const token = getTokenFromRequest(req);
  const tokenCheck = inspectAuthToken(token);

  if (!tokenCheck.ok) {
    return res.status(401).json({
      code: tokenCheck.code ?? "AUTH_TOKEN_INVALID",
      error: tokenCheck.message ?? "Authentication required",
    });
  }

  req.auth = tokenCheck.payload;
  return next();
}

module.exports = {
  requireAuth,
}
