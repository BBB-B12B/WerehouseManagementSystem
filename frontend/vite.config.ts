import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { webcrypto } from "node:crypto";

if (typeof globalThis !== "undefined" && typeof globalThis.crypto === "undefined") {
  globalThis.crypto = webcrypto as Crypto;
}

function resolveHttpsConfig() {
  const explicitCert = process.env.VITE_DEV_SSL_CERT;
  const explicitKey = process.env.VITE_DEV_SSL_KEY;

  const certPath =
    explicitCert && explicitKey
      ? { cert: explicitCert, key: explicitKey }
      : {
          cert: path.resolve(__dirname, "certs/localhost.pem"),
          key: path.resolve(__dirname, "certs/localhost-key.pem"),
        };

  try {
    if (fs.existsSync(certPath.cert) && fs.existsSync(certPath.key)) {
      return {
        cert: fs.readFileSync(certPath.cert),
        key: fs.readFileSync(certPath.key),
      };
    }
  } catch {
    // ignore - fallback to HTTP
  }
  return undefined;
}

const httpsConfig = resolveHttpsConfig();

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    https: httpsConfig,
  },
  define: {
    __APP_ENV__: JSON.stringify(process.env.APP_ENV ?? "local"),
  },
});
