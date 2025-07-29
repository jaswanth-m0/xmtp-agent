import { getRandomValues } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@xmtp/node-sdk";
import { fromString, toString } from "uint8arrays";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
export const createUser = (key) => {
    const account = privateKeyToAccount(key);
    return {
        key: key,
        account,
        wallet: createWalletClient({
            account,
            chain: sepolia,
            transport: http(),
        }),
    };
};
export const createSigner = (key) => {
    const sanitizedKey = key.startsWith("0x") ? key : `0x${key}`;
    const user = createUser(sanitizedKey);
    return {
        type: "EOA",
        getIdentifier: () => ({
            identifierKind: 0 /* IdentifierKind.Ethereum */,
            identifier: user.account.address.toLowerCase(),
        }),
        signMessage: async (message) => {
            const signature = await user.wallet.signMessage({
                message,
                account: user.account,
            });
            return toBytes(signature);
        },
    };
};
/**
 * Generate a random encryption key
 * @returns The encryption key
 */
export const generateEncryptionKeyHex = () => {
    /* Generate a random encryption key */
    const uint8Array = getRandomValues(new Uint8Array(32));
    /* Convert the encryption key to a hex string */
    return toString(uint8Array, "hex");
};
/**
 * Get the encryption key from a hex string
 * @param hex - The hex string
 * @returns The encryption key
 */
export const getEncryptionKeyFromHex = (hex) => {
    /* Convert the hex string to an encryption key */
    return fromString(hex, "hex");
};
export const getDbPath = (description = "xmtp") => {
    //Checks if the environment is a Railway deployment
    const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? ".data/xmtp";
    // Create database directory if it doesn't exist
    if (!fs.existsSync(volumePath)) {
        fs.mkdirSync(volumePath, { recursive: true });
    }
    return `${volumePath}/${description}.db3`;
};
export const logAgentDetails = async (clients) => {
    const clientArray = Array.isArray(clients) ? clients : [clients];
    const clientsByAddress = clientArray.reduce((acc, client) => {
        const address = client.accountIdentifier?.identifier;
        acc[address] = acc[address] ?? [];
        acc[address].push(client);
        return acc;
    }, {});
    // Get XMTP SDK version from package.json
    // const require = createRequire(import.meta.url);
    // const packageJson = require("./package.json") as {
    //   dependencies: Record<string, string>;
    // };
    // const xmtpSdkVersion = packageJson.dependencies["@xmtp/node-sdk"];
    // const bindingVersion = (
    //   require("./node_modules/@xmtp/node-bindings/package.json") as {
    //     version: string;
    //   }
    // ).version;
    for (const [address, clientGroup] of Object.entries(clientsByAddress)) {
        const firstClient = clientGroup[0];
        const inboxId = firstClient.inboxId;
        const installationId = firstClient.installationId;
        const environments = clientGroup
            .map((c) => c.options?.env ?? "dev")
            .join(", ");
        console.log(`\x1b[38;2;252;76;52m
        ██╗  ██╗███╗   ███╗████████╗██████╗ 
        ╚██╗██╔╝████╗ ████║╚══██╔══╝██╔══██╗
         ╚███╔╝ ██╔████╔██║   ██║   ██████╔╝
         ██╔██╗ ██║╚██╔╝██║   ██║   ██╔═══╝ 
        ██╔╝ ██╗██║ ╚═╝ ██║   ██║   ██║     
        ╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚═╝     
      \x1b[0m`);
        const urls = [`http://xmtp.chat/dm/${address}`];
        const conversations = await firstClient.conversations.list();
        const inboxState = await firstClient.preferences.inboxState();
        const keyPackageStatuses = await firstClient.getKeyPackageStatusesForInstallationIds([
            installationId,
        ]);
        let createdDate = new Date();
        let expiryDate = new Date();
        // Extract key package status for the specific installation
        const keyPackageStatus = keyPackageStatuses[installationId];
        if (keyPackageStatus.lifetime) {
            createdDate = new Date(Number(keyPackageStatus.lifetime.notBefore) * 1000);
            expiryDate = new Date(Number(keyPackageStatus.lifetime.notAfter) * 1000);
        }
        console.log(`
    ✓ XMTP Client:
    • InboxId: ${inboxId}
    • Version: ${Client.version}
    • Address: ${address}
    • Conversations: ${conversations.length}
    • Installations: ${inboxState.installations.length}
    • InstallationId: ${installationId}
    • Key Package created: ${createdDate.toLocaleString()}
    • Key Package valid until: ${expiryDate.toLocaleString()}
    • Networks: ${environments}
    ${urls.map((url) => `• URL: ${url}`).join("\n")}`);
    }
};
export function validateEnvironment(vars) {
    const missing = vars.filter((v) => !process.env[v]);
    if (missing.length) {
        try {
            const envPath = path.resolve(process.cwd(), ".env");
            if (fs.existsSync(envPath)) {
                const envVars = fs
                    .readFileSync(envPath, "utf-8")
                    .split("\n")
                    .filter((line) => line.trim() && !line.startsWith("#"))
                    .reduce((acc, line) => {
                    // Remove inline comments (everything after #)
                    const lineWithoutComments = line.split("#")[0].trim();
                    if (!lineWithoutComments)
                        return acc;
                    const [key, ...val] = lineWithoutComments.split("=");
                    if (key && val.length)
                        acc[key.trim()] = val.join("=").trim();
                    return acc;
                }, {});
                missing.forEach((v) => {
                    if (envVars[v])
                        process.env[v] = envVars[v];
                });
            }
        }
        catch (e) {
            console.error(e);
            /* ignore errors */
        }
        const stillMissing = vars.filter((v) => !process.env[v]);
        if (stillMissing.length) {
            console.error("Missing env vars:", stillMissing.join(", "));
            process.exit(1);
        }
    }
    return vars.reduce((acc, key) => {
        acc[key] = process.env[key];
        return acc;
    }, {});
}
//# sourceMappingURL=client.js.map