// src/utils/password.util.js

const crypto = require('crypto')

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  return {
    salt,
    hash: hashPassword(password, salt),
  }
}

function verifyPassword(password, salt, expectedHash) {
  const computedHash = hashPassword(password, salt)
  const computedBuffer = Buffer.from(computedHash, 'hex')
  const expectedBuffer = Buffer.from(expectedHash, 'hex')

  return (
    computedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(computedBuffer, expectedBuffer)
  )
}

module.exports = {
  createPasswordRecord,
  verifyPassword,
}
