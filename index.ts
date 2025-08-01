/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import express from "express";
import cors from "cors";
import {
  Client,
  ConversationType,
  Group,
  Identifier,
  IdentifierKind,
  type XmtpEnv,
} from "@xmtp/node-sdk";
import {
  createSigner,
  getEncryptionKeyFromHex,
  logAgentDetails,
  validateEnvironment,
} from "./client.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Get the wallet key associated to the public key of
// the agent and the encryption key for the local db
// that stores your agent's messages
const { WALLET_KEY, ENCRYPTION_KEY, XMTP_ENV, PORT, WALLET_ADDRESS } =
  validateEnvironment([
    "WALLET_KEY",
    "ENCRYPTION_KEY",
    "XMTP_ENV",
    "PORT", // Add PORT to environment variables
    "WALLET_ADDRESS",
  ]);

// Create the signer using viem and parse the encryption key for the local db
const signer = createSigner(WALLET_KEY);
const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);

// Global client variable to access from API endpoints
let xmtpClient: Client;

// Express app setup
const app = express();  
app.use(cors());
app.use(express.json());

// Add these lines at the top (after imports)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function initializeXMTPClient() {
  const identifier: Identifier = {
    identifier: WALLET_ADDRESS.toLowerCase(),
    identifierKind: IdentifierKind.Ethereum,
  };

  // Go one step back from __dirname (project root)
  const projectRoot = path.resolve(__dirname, "..");
  const rootFiles = fs.readdirSync(projectRoot);
  // Check for .db3 files in the project root
  const hasDb3 = rootFiles.some((file) => file.endsWith(".db3"));
  console.log("Has .db3 file:", hasDb3);

  let client: Client;
  if (hasDb3) {
    client = await Client.build(identifier, {
      env: XMTP_ENV as XmtpEnv,
    });
  } else {
    client = await Client.create(signer, {
      env: XMTP_ENV as XmtpEnv,
    });
    await client.revokeAllOtherInstallations();
  }

  void logAgentDetails(client);
  console.log("✓ Syncing conversations...");
  await client.conversations.sync();

  xmtpClient = client;
  return client;
}

// API Routes

// Get client info
app.get("/api/client/info", (req, res) => {
  if (!xmtpClient) {
    return res.status(503).json({ error: "XMTP client not initialized" });
  }

  res.json({
    inboxId: xmtpClient.inboxId,
    isRegistered: xmtpClient.isRegistered,
    accountAddress: xmtpClient.accountIdentifier?.identifier,
  });
});

// Get all conversations
app.get("/api/conversations", async (req, res) => {
  try {
    if (!xmtpClient) {
      return res.status(503).json({ error: "XMTP client not initialized" });
    }

    await xmtpClient.conversations.sync();
    const conversations = await xmtpClient.conversations.list({
      conversationType: ConversationType.Group,
    });

    const conversationData = conversations.map((conv) => ({
      id: conv.id,
      name: (conv as any).name,
      description: (conv as any).description,
    }));

    res.json({ conversations: conversationData });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    isRegistered: xmtpClient.isRegistered,
    timestamp: new Date().toISOString(),
  });
});

async function main() {
  try {
    // Initialize XMTP client
    await initializeXMTPClient();

    // Start the Express server
    const port = PORT || 3000;
    app.listen(port, () => {
      console.log(`🚀 API server running on port ${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
      console.log(`Client info: http://localhost:${port}/api/client/info`);
    });
  } catch (error) {
    console.error("Failed to start application:", error);
    process.exit(1);
  }
}

main().catch(console.error);
