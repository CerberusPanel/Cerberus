// src/routes/auth.routes.js

const express = require("express");
const router = express.Router();
const {
  authenticateSystemAccount,
  clearAuthCookie,
  createAuthToken,
  decryptLoginPayload,
  decryptLoginPassword,
  getLoginPublicKey,
  getSystemUserProfile,
  getTokenFromRequest,
  setAuthCookie,
  verifyAuthToken,
} = require("../services/auth.service");

// User login route
router.post("/login", async (req, res) => {
  try {
    // Sanitise the variables
    const username = String(req.body?.username ?? "").trim();
    const encryptedPassword = String(req.body?.encryptedPassword ?? "");
    const plainPassword = String(req.body?.password ?? "");

    // Check that the form has been submitted fullt.
    if (!username || (!encryptedPassword && !plainPassword)) {
      return res.status(400).json({
        debugCode: "AUTH_LOGIN_MISSING_CREDENTIALS",
        error: "Username and password are required",
      });
    }

    // decrypt the login information
    let resolvedUsername = username;
    let password = encryptedPassword ? decryptLoginPassword(encryptedPassword) : plainPassword;

    // check if there is a resolved username and decrypted password
    if (!resolvedUsername || !password) {
      // return error if no username or password
      return res.status(401).json({
        debugCode: "AUTH_LOGIN_CREDENTIALS_NOT_FOUND",
        error: "Invalid credentials",
      });
    }
    
    // Authenticate the user account then create and set the authentication token
    const user = await authenticateSystemAccount(resolvedUsername, password);
    const { token, payload } = createAuthToken(user);
    setAuthCookie(res, token, req);
    
    // return success and user cookie value.
    return res.json({
      debugCode: "AUTH_LOGIN_SUCCESS",
      user,
      expiresAt: payload.exp,
    });
  } catch (error) {
    return res.status(401).json({
      debugCode: "AUTH_LOGIN_INVALID_CREDENTIALS",
      error: "Invalid credentials",
    });
  }
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res, req);
  return res.json({
    debugCode: "AUTH_LOGOUT_OK",
    ok: true,
  });
});

// Get current user profile
router.get("/me", (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = verifyAuthToken(token);

  if (!payload) {
    return res.status(401).json({
      debugCode: "AUTH_SESSION_REQUIRED",
      error: "Authentication required",
    });
  }

  return res.json({
    debugCode: "AUTH_SESSION_OK",
    user: getSystemUserProfile(payload.username),
    expiresAt: payload.exp,
  });
});

module.exports = router;
