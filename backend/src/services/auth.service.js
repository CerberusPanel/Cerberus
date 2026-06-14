// src/services/auth.service.js

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const storage = require("../storage");

const DATA_DIR = path.resolve(__dirname, "../../data");
const AUTH_SECRET_PATH = path.join(DATA_DIR, "auth.secret");
const AUTH_COOKIE_NAME = "cerberus.auth";
const MASTER_USERNAME = process.env.MASTER_USERNAME;
const MASTER_PASSWORD = process.env.MASTER_PASSWORD;
const AUTH_TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_SECONDS ?? 28800) * 1000;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function createAuthError(code, message, status = 401) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function getAuthSecret() {
  ensureDataDir();

  try {
    const secret = fs.readFileSync(AUTH_SECRET_PATH, "utf8").trim();
    if (secret) {
      return secret;
    }
  } catch (error) {
    // Generate a fresh secret below.
  }

  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(AUTH_SECRET_PATH, `${secret}\n`);
  return secret;
}

function getLoginKeyPair() {
  ensureDataDir();

  const privateKeyPath = path.join(DATA_DIR, "auth.login.private.pem");
  const publicKeyPath = path.join(DATA_DIR, "auth.login.public.pem");

  try {
    const privateKey = fs.readFileSync(privateKeyPath, "utf8").trim();
    if (privateKey) {
      let publicKey = "";
      try {
        publicKey = fs.readFileSync(publicKeyPath, "utf8").trim();
      } catch (error) {
        // Derive the public key below.
      }

      if (!publicKey) {
        publicKey = crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" });
        fs.writeFileSync(publicKeyPath, `${publicKey}\n`);
      }

      return { privateKey, publicKey };
    }
  } catch (error) {
    // Generate a fresh key pair below.
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  fs.writeFileSync(privateKeyPath, `${privateKey}\n`);
  fs.writeFileSync(publicKeyPath, `${publicKey}\n`);
  return { privateKey, publicKey };
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signAuthPayload(payload) {
  const serializedPayload = JSON.stringify(payload);
  const secret = getAuthSecret();
  const signature = crypto.createHmac("sha256", secret).update(serializedPayload).digest("base64url");
  return `${base64UrlEncode(serializedPayload)}.${signature}`;
}

function inspectAuthToken(token) {
  if (!token || typeof token !== "string") {
    return {
      ok: false,
      code: "AUTH_TOKEN_MISSING",
      message: "Authentication token is required",
      status: 401,
    };
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return {
      ok: false,
      code: "AUTH_TOKEN_MALFORMED",
      message: "Authentication token is malformed",
      status: 401,
    };
  }

  try {
    const serializedPayload = base64UrlDecode(encodedPayload);
    const expectedSignature = crypto
      .createHmac("sha256", getAuthSecret())
      .update(serializedPayload)
      .digest("base64url");

    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return {
        ok: false,
        code: "AUTH_TOKEN_INVALID",
        message: "Authentication token signature is invalid",
        status: 401,
      };
    }

    const payload = JSON.parse(serializedPayload);
    if (!payload?.username || !Number.isFinite(payload?.exp) || payload.exp < Date.now()) {
      return {
        ok: false,
        code: "AUTH_TOKEN_EXPIRED",
        message: "Authentication token has expired",
        status: 401,
      };
    }

    return {
      ok: true,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      code: "AUTH_TOKEN_INVALID",
      message: "Authentication token is invalid",
      status: 401,
    };
  }
}

function verifyAuthToken(token) {
  const result = inspectAuthToken(token);
  return result.ok ? result.payload : null;
}

function getTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie ?? "");
  const cookieToken = cookies[AUTH_COOKIE_NAME];
  if (cookieToken) {
    return cookieToken;
  }

  const header = req.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function parseCookies(cookieHeader) {
  return String(cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function shouldUseSecureCookies(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim().toLowerCase();
  return process.env.AUTH_COOKIE_SECURE === "true" || req.secure || forwardedProto === "https";
}

function buildAuthCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(req),
    path: "/",
    maxAge: AUTH_TOKEN_TTL_MS,
  };
}

function setAuthCookie(res, token, req) {
  res.cookie(AUTH_COOKIE_NAME, token, buildAuthCookieOptions(req));
}

function clearAuthCookie(res, req) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    path: "/",
    secure: shouldUseSecureCookies(req),
    sameSite: "lax",
  });
}

function getSystemUserProfile(username) {
  return storage.getUserByUsername(username) ?? {
    username,
    displayName: username,
    role: "user",
    createdAt: null,
    updatedAt: null,
  };
}

function getLoginPublicKey() {
  return getLoginKeyPair().publicKey;
}

function decryptLoginPassword(encryptedPassword) {
  const rawCiphertext = String(encryptedPassword ?? "").trim();
  if (!rawCiphertext) {
    return null;
  }

  try {
    const decrypted = crypto.privateDecrypt(
      {
        key: getLoginKeyPair().privateKey,
        oaepHash: "sha256",
      },
      Buffer.from(rawCiphertext, "base64"),
    );

    const password = String(decrypted.toString("utf8"));

    if (!password) {
      return null;
    }

    return password;
  } catch (error) {
    return null;
  }
}

async function authenticateSystemAccount(username, password) {
  const user = storage.authenticateUser(username, password);
  if (!user) {
    throw createAuthError("AUTH_LOGIN_INVALID_CREDENTIALS", "Invalid credentials", 401);
  }

  return user;
}

function createAuthToken(user) {
  const issuedAt = Date.now();
  const payload = {
    username: user.username,
    displayName: user.displayName,
    role: user.role ?? "user",
    issuedAt,
    exp: issuedAt + AUTH_TOKEN_TTL_MS,
  };

  return {
    token: signAuthPayload(payload),
    payload,
  };
}

module.exports = {
  authenticateSystemAccount,
  createAuthToken,
  createAuthError,
  clearAuthCookie,
  setAuthCookie,
  inspectAuthToken,
  decryptLoginPassword,
  getLoginPublicKey,
  verifyAuthToken,
  getSystemUserProfile,
  getTokenFromRequest,
  AUTH_COOKIE_NAME,
}
