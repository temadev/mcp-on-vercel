import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const origin = process.argv[2] || "https://mcp-on-vercel.vercel.app";

async function main() {
    try {
        console.log(
            `🔗 Connecting to Linear MCP Server via StreamableHTTP at ${origin}/api/mcp`,
        );

        const transport = new StreamableHTTPClientTransport(
            new URL(`${origin}/api/mcp`),
        );

        const client = new Client(
            {
                name: "linear-http-test-client",
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

                // Test creating an issue if we have teams
                if (org.teams && org.teams.length > 0) {
                    console.log("\n📝 Testing issue creation...");
                    try {
                        const createResult = await client.callTool({
                            name: "linear_create_issue",
                            arguments: {
                                title: `Test Issue from MCP Client - ${new Date().toISOString()}`,
                                teamId: org.teams[0].id,
                                description:
                                    "This is a test issue created by the MCP client to verify functionality.",
                                priority: 3,
                            },
                        });
                        console.log("Issue creation result:");
                        console.log(
                            createResult.content[0]?.text || "No content",
                        );
                    } catch (error) {
                        console.log("❌ Error creating issue:", error.message);
                    }
                }
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

        // Test searching issues with different filters
        console.log("\n🔍 Testing advanced issue search...");
        try {
            const searchResult = await client.callTool({
                name: "linear_search_issues",
                arguments: {
                    query: "test",
                    limit: 3,
                    includeArchived: false,
                },
            });
            console.log("Advanced search completed:");
            console.log(searchResult.content[0]?.text || "No content");
        } catch (error) {
            console.log("❌ Error in advanced search:", error.message);
        }

        // Test getting user issues
        console.log("\n👨‍💻 Testing user issues...");
        try {
            const userIssuesResult = await client.callTool({
                name: "linear_get_user_issues",
                arguments: {
                    limit: 5,
                    includeArchived: false,
                },
            });
            console.log("User issues retrieved:");
            console.log(userIssuesResult.content[0]?.text || "No content");
        } catch (error) {
            console.log("❌ Error getting user issues:", error.message);
        }

        console.log("\n✨ All HTTP tests completed!");
    } catch (error) {
        console.error("❌ Connection or test failed:", error);
        process.exit(1);
    }
}

main().catch(console.error);
