import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const origin = process.argv[2] || "https://mcp-on-vercel.vercel.app";

async function main() {
    try {
        console.log(
            `🔗 Connecting to Linear MCP Server via SSE at ${origin}/api/sse`,
        );

        const transport = new SSEClientTransport(new URL(`${origin}/api/sse`));

        const client = new Client(
            {
                name: "linear-test-client",
                version: "1.0.0",
            },
            {
                capabilities: {
                    prompts: {},
                    resources: {},
                    tools: {},
                },
            },
        );

        await client.connect(transport);
        console.log("✅ Connected successfully!");
        console.log(
            "Server capabilities:",
            JSON.stringify(client.getServerCapabilities(), null, 2),
        );

        // Test listing tools
        console.log("\n🔧 Testing tool listing...");
        const tools = await client.listTools();
        console.log(
            "Available tools:",
            tools.tools.map((t) => t.name).join(", "),
        );

        // Test getting organization data
        console.log("\n🏢 Testing organization tool...");
        try {
            const orgResult = await client.callTool({
                name: "linear_get_organization",
                arguments: {},
            });
            console.log("Organization data retrieved successfully");
            if (orgResult.content[0]?.text) {
                const org = JSON.parse(orgResult.content[0].text);
                console.log(
                    `Organization: ${org.name} (${
                        org.teams?.length || 0
                    } teams, ${org.users?.length || 0} users)`,
                );
            }
        } catch (error) {
            console.log("❌ Error fetching organization:", error.message);
        }

        // Test getting viewer data
        console.log("\n👤 Testing viewer tool...");
        try {
            const viewerResult = await client.callTool({
                name: "linear_get_viewer",
                arguments: {},
            });
            console.log("Viewer data retrieved successfully");
            if (viewerResult.content[0]?.text) {
                const viewer = JSON.parse(viewerResult.content[0].text);
                console.log(`Current user: ${viewer.name} (${viewer.email})`);
            }
        } catch (error) {
            console.log("❌ Error fetching viewer:", error.message);
        }

        // Test searching issues
        console.log("\n🔍 Testing issue search...");
        try {
            const searchResult = await client.callTool({
                name: "linear_search_issues",
                arguments: {
                    limit: 5,
                },
            });
            console.log("Issue search completed:");
            console.log(searchResult.content[0]?.text || "No content");
        } catch (error) {
            console.log("❌ Error searching issues:", error.message);
        }

        // Test getting user issues
        console.log("\n👨‍💻 Testing user issues...");
        try {
            const userIssuesResult = await client.callTool({
                name: "linear_get_user_issues",
                arguments: {
                    limit: 3,
                },
            });
            console.log("User issues retrieved:");
            console.log(userIssuesResult.content[0]?.text || "No content");
        } catch (error) {
            console.log("❌ Error getting user issues:", error.message);
        }

        console.log("\n✨ All tests completed!");
    } catch (error) {
        console.error("❌ Connection or test failed:", error);
        process.exit(1);
    }
}

main().catch(console.error);
