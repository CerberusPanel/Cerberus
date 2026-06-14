// src/utils/crypto.util.js

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_SECRET_PATH = path.join(DATA_DIR, "db.secret");

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getEncryptionSecret() {
  ensureDataDir();

  const envSecret = String(process.env.DB_ENCRYPTION_KEY ?? "").trim();
  if (envSecret) {
    return crypto.createHash("sha256").update(envSecret).digest();
  }

  try {
    const existingSecret = fs.readFileSync(DB_SECRET_PATH, "utf8").trim();
    if (existingSecret) {
      return crypto.createHash("sha256").update(existingSecret).digest();
    }
  } catch (error) {
    // Generate a fresh secret below.
  }

  const freshSecret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(DB_SECRET_PATH, `${freshSecret}\n`);
  return crypto.createHash("sha256").update(freshSecret).digest();
}

const encryptionKey = getEncryptionSecret();

function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

function decryptJson(payload) {
  const [ivPart, ciphertextPart, tagPart] = String(payload ?? "").split(".");
  if (!ivPart || !ciphertextPart || !tagPart) {
    return null;
  }

  const iv = Buffer.from(ivPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");

  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

  return JSON.parse(plaintext);
}

module.exports = {
  decryptJson,
  encryptJson,
  getEncryptionSecret,
};
