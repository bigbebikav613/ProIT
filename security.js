(() => {
  const AUTH_ITERATIONS = 320000;
  const WRAP_ITERATIONS = 260000;

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  const ensureCrypto = () => {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("Web Crypto API is unavailable.");
    }
  };

  const toUint8Array = (input) => {
    if (input instanceof Uint8Array) {
      return input;
    }
    if (input instanceof ArrayBuffer) {
      return new Uint8Array(input);
    }
    if (ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    throw new Error("Unsupported binary input.");
  };

  const toBase64 = (input) => {
    const bytes = toUint8Array(input);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return window.btoa(binary);
  };

  const fromBase64 = (value) => {
    const binary = window.atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  const randomBytes = (size = 32) => {
    ensureCrypto();
    const bytes = new Uint8Array(size);
    window.crypto.getRandomValues(bytes);
    return bytes;
  };

  const randomToken = () => toBase64(randomBytes(32));

  const constantTimeEqual = (left, right) => {
    const a = textEncoder.encode(String(left ?? ""));
    const b = textEncoder.encode(String(right ?? ""));
    if (a.length !== b.length) {
      return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
      diff |= a[i] ^ b[i];
    }
    return diff === 0;
  };

  const deriveKeyMaterial = async (password) => {
    ensureCrypto();
    return window.crypto.subtle.importKey(
      "raw",
      textEncoder.encode(String(password ?? "")),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );
  };

  const deriveHashBase64 = async (password, saltBase64, iterations) => {
    const keyMaterial = await deriveKeyMaterial(password);
    const derivedBits = await window.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: fromBase64(saltBase64),
        iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );
    return toBase64(derivedBits);
  };

  const deriveAesKeyFromPassword = async (password, saltBase64, iterations, usages) => {
    const keyMaterial = await deriveKeyMaterial(password);
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: fromBase64(saltBase64),
        iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      usages
    );
  };

  const encryptBytesWithAes = async (aesKey, plainBytes) => {
    const iv = randomBytes(12);
    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      toUint8Array(plainBytes)
    );
    return {
      iv: toBase64(iv),
      data: toBase64(cipherBuffer)
    };
  };

  const decryptBytesWithAes = async (aesKey, payload) => {
    const plainBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(payload.iv) },
      aesKey,
      fromBase64(payload.data)
    );
    return new Uint8Array(plainBuffer);
  };

  const generateRsaKeyPair = async () => {
    ensureCrypto();
    return window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["encrypt", "decrypt"]
    );
  };

  const exportPublicKeyJwk = async (publicKey) => window.crypto.subtle.exportKey("jwk", publicKey);

  const importPublicKeyJwk = async (jwk) => {
    ensureCrypto();
    return window.crypto.subtle.importKey(
      "jwk",
      jwk,
      {
        name: "RSA-OAEP",
        hash: "SHA-256"
      },
      true,
      ["encrypt"]
    );
  };

  const exportPrivateKeyPkcs8 = async (privateKey) => window.crypto.subtle.exportKey("pkcs8", privateKey);

  const importPrivateKeyPkcs8 = async (pkcs8Bytes) => {
    ensureCrypto();
    return window.crypto.subtle.importKey(
      "pkcs8",
      toUint8Array(pkcs8Bytes),
      {
        name: "RSA-OAEP",
        hash: "SHA-256"
      },
      true,
      ["decrypt"]
    );
  };

  const validatePasswordStrength = (password) => {
    const value = String(password ?? "");
    const errors = [];
    if (value.length < 12) {
      errors.push("Длина пароля должна быть не менее 12 символов.");
    }
    if (!/[A-Z]/.test(value)) {
      errors.push("Добавьте хотя бы одну заглавную букву.");
    }
    if (!/[a-z]/.test(value)) {
      errors.push("Добавьте хотя бы одну строчную букву.");
    }
    if (!/\d/.test(value)) {
      errors.push("Добавьте хотя бы одну цифру.");
    }
    if (!/[^A-Za-z0-9]/.test(value)) {
      errors.push("Добавьте хотя бы один спецсимвол.");
    }
    return {
      ok: errors.length === 0,
      errors
    };
  };

  const createCredentialBundle = async (password) => {
    const strength = validatePasswordStrength(password);
    if (!strength.ok) {
      throw new Error(strength.errors.join(" "));
    }

    const authSalt = toBase64(randomBytes(16));
    const wrapSalt = toBase64(randomBytes(16));
    const authHash = await deriveHashBase64(password, authSalt, AUTH_ITERATIONS);
    const wrapKey = await deriveAesKeyFromPassword(password, wrapSalt, WRAP_ITERATIONS, ["encrypt", "decrypt"]);

    const keyPair = await generateRsaKeyPair();
    const privatePkcs8 = await exportPrivateKeyPkcs8(keyPair.privateKey);
    const encryptedPrivateKey = await encryptBytesWithAes(wrapKey, privatePkcs8);
    const publicJwk = await exportPublicKeyJwk(keyPair.publicKey);
    const nowIso = new Date().toISOString();

    return {
      version: 2,
      createdAt: nowIso,
      updatedAt: nowIso,
      auth: {
        algorithm: "PBKDF2-SHA-256",
        iterations: AUTH_ITERATIONS,
        salt: authSalt,
        hash: authHash
      },
      wrapping: {
        algorithm: "PBKDF2-SHA-256",
        iterations: WRAP_ITERATIONS,
        salt: wrapSalt
      },
      keys: {
        algorithm: "RSA-OAEP-256/AES-256-GCM",
        publicJwk,
        privateEncrypted: encryptedPrivateKey
      }
    };
  };

  const verifyCredentialBundle = async (bundle, password) => {
    if (!bundle?.auth?.salt || !bundle?.auth?.hash || !bundle?.auth?.iterations) {
      return false;
    }
    const candidate = await deriveHashBase64(password, bundle.auth.salt, bundle.auth.iterations);
    return constantTimeEqual(bundle.auth.hash, candidate);
  };

  const unlockPrivateKey = async (bundle, password) => {
    if (!bundle?.wrapping?.salt || !bundle?.wrapping?.iterations || !bundle?.keys?.privateEncrypted) {
      throw new Error("Invalid credential bundle format.");
    }
    const wrapKey = await deriveAesKeyFromPassword(password, bundle.wrapping.salt, bundle.wrapping.iterations, ["decrypt"]);
    const privatePkcs8 = await decryptBytesWithAes(wrapKey, bundle.keys.privateEncrypted);
    return importPrivateKeyPkcs8(privatePkcs8);
  };

  const importPublicKey = async (bundle) => {
    if (!bundle?.keys?.publicJwk) {
      throw new Error("Public key is missing.");
    }
    return importPublicKeyJwk(bundle.keys.publicJwk);
  };

  const rewrapCredentialBundle = async (bundle, currentPassword, newPassword) => {
    const currentValid = await verifyCredentialBundle(bundle, currentPassword);
    if (!currentValid) {
      throw new Error("Current password is invalid.");
    }
    const strength = validatePasswordStrength(newPassword);
    if (!strength.ok) {
      throw new Error(strength.errors.join(" "));
    }

    const privateKey = await unlockPrivateKey(bundle, currentPassword);
    const privatePkcs8 = await exportPrivateKeyPkcs8(privateKey);

    const authSalt = toBase64(randomBytes(16));
    const wrapSalt = toBase64(randomBytes(16));
    const authHash = await deriveHashBase64(newPassword, authSalt, AUTH_ITERATIONS);
    const wrapKey = await deriveAesKeyFromPassword(newPassword, wrapSalt, WRAP_ITERATIONS, ["encrypt", "decrypt"]);
    const encryptedPrivateKey = await encryptBytesWithAes(wrapKey, privatePkcs8);

    return {
      ...bundle,
      updatedAt: new Date().toISOString(),
      auth: {
        algorithm: "PBKDF2-SHA-256",
        iterations: AUTH_ITERATIONS,
        salt: authSalt,
        hash: authHash
      },
      wrapping: {
        algorithm: "PBKDF2-SHA-256",
        iterations: WRAP_ITERATIONS,
        salt: wrapSalt
      },
      keys: {
        ...bundle.keys,
        privateEncrypted: encryptedPrivateKey
      }
    };
  };

  const encryptApplicationRecord = async (application, publicKey) => {
    const aesKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const rawAes = await window.crypto.subtle.exportKey("raw", aesKey);
    const encryptedAes = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      rawAes
    );

    const payload = textEncoder.encode(JSON.stringify(application));
    const iv = randomBytes(12);
    const encryptedPayload = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      payload
    );

    return {
      v: 2,
      alg: "RSA-OAEP-256/AES-256-GCM",
      meta: {
        id: String(application?.id || ""),
        createdAt: String(application?.createdAt || new Date().toISOString())
      },
      key: toBase64(encryptedAes),
      iv: toBase64(iv),
      data: toBase64(encryptedPayload)
    };
  };

  const decryptApplicationRecord = async (record, privateKey) => {
    if (!record?.key || !record?.iv || !record?.data) {
      throw new Error("Encrypted record format is invalid.");
    }
    const aesRaw = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      fromBase64(record.key)
    );
    const aesKey = await window.crypto.subtle.importKey(
      "raw",
      aesRaw,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const plainBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(record.iv) },
      aesKey,
      fromBase64(record.data)
    );
    return JSON.parse(textDecoder.decode(plainBuffer));
  };

  window.ProItSecurity = Object.freeze({
    AUTH_ITERATIONS,
    WRAP_ITERATIONS,
    supportsStrongCrypto: Boolean(window.crypto?.subtle),
    randomToken,
    validatePasswordStrength,
    createCredentialBundle,
    verifyCredentialBundle,
    unlockPrivateKey,
    importPublicKey,
    rewrapCredentialBundle,
    encryptApplicationRecord,
    decryptApplicationRecord
  });
})();
