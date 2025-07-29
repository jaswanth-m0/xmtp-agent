/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import express from "express";
import cors from "cors";
import { Client, ConversationType, Group, type XmtpEnv } from "@xmtp/node-sdk";
import { createSigner, getEncryptionKeyFromHex, logAgentDetails, validateEnvironment } from "./client.js";

// Get the wallet key associated to the public key of
// the agent and the encryption key for the local db
// that stores your agent's messages
const { WALLET_KEY, ENCRYPTION_KEY, XMTP_ENV, PORT } = validateEnvironment([
  "WALLET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
  "PORT", // Add PORT to environment variables
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

async function initializeXMTPClient() {
  const client = await Client.create(signer, {
    dbEncryptionKey,
    env: XMTP_ENV as XmtpEnv,
    dbPath:null
  });

  void logAgentDetails(client);
  console.log("✓ Syncing conversations...");
  await client.conversations.sync();

  xmtpClient = client;
  return client;
}

// Stream all messages for GM responses
const messageStream = (client: Client) => {
  console.log("Waiting for messages...");
  void client.conversations.streamAllMessages((error, message) => {
    if (error) {
      console.error("Error in message stream:", error);
      return;
    }
    if (!message) {
      console.log("No message received");
      return;
    }
    console.log(message);
    void (async () => {
      // Skip if the message is from the agent
      if (
        message.senderInboxId.toLowerCase() === client.inboxId.toLowerCase()
      ) {
        return;
      }
      // Skip if the message is not a text message
      if (message.contentType?.typeId !== "text") {
        return;
      }
      const conversation = await client.conversations.getConversationById(
        message.conversationId
      );
      if (!conversation) {
        console.log("Unable to find conversation, skipping");
        return;
      }
      //Getting the address from the inbox id
      const inboxState = await client.preferences.inboxStateFromInboxIds([
        message.senderInboxId,
      ]);
      const addressFromInboxId = inboxState[0].identifiers[0].identifier;
      console.log(`Sending "gm" response to ${addressFromInboxId}...`);
      await conversation.send("gm m0 employeesssss");
    })();
  });
};

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
      name:(conv as any).name,
      description : (conv as any).description
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
    const client = await initializeXMTPClient();

    // Start the message stream
    messageStream(client);

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
