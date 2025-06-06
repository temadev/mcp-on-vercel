# Linear MCP Server on Vercel

A comprehensive Linear Model Context Protocol (MCP) server built with the [Vercel MCP adapter](https://github.com/vercel/mcp-adapter), enabling AI models to interact with Linear issues, teams, and users through a standardized interface.

## Features

-   **Issue Management**: Create, update, search, and manage Linear issues
-   **User Operations**: Get assigned issues and user information
-   **Team Coordination**: Access team-specific data and organization structure
-   **Comment System**: Add comments to issues with markdown support
-   **Resource Access**: Fetch Linear entities through standardized resource URIs
-   **Rate Limiting**: Built-in rate limiting to respect Linear API limits (1400 requests/hour)
-   **Error Handling**: Comprehensive error handling with descriptive messages

## Prerequisites

-   Node.js 18 or later
-   A Linear account and API key
-   Vercel account for deployment (optional)

## Setup

1. **Clone the repository**

    ```bash
    git clone <repository-url>
    cd mcp-on-vercel
    ```

2. **Install dependencies**

    ```bash
    pnpm install
    ```

3. **Configure environment variables**
   Create a `.env.local` file:

    ```env
    LINEAR_API_KEY=your_linear_api_key_here
    ```

    Get your Linear API key from [Linear Settings > API](https://linear.app/settings/api).

4. **Run locally**
    ```bash
    vercel dev
    ```

## Usage

### Available Tools

-   **`linear_create_issue`**: Create new Linear issues
-   **`linear_update_issue`**: Update existing issues
-   **`linear_search_issues`**: Search issues with flexible criteria
-   **`linear_get_user_issues`**: Get issues assigned to users
-   **`linear_add_comment`**: Add comments to issues
-   **`linear_get_organization`**: Get organization details including teams and users
-   **`linear_get_viewer`**: Get current authenticated user information
-   **`linear_get_issue`**: Get detailed information about a specific issue

### Testing the Server

Test with SSE transport:

```bash
node scripts/test-client.mjs http://localhost:3000
```

Test with StreamableHTTP transport:

```bash
node scripts/test-streamable-http-client.mjs http://localhost:3000
```

### Integration with AI Clients

#### Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
    "mcpServers": {
        "linear": {
            "command": "npx",
            "args": ["mcp-remote", "https://your-deployment.vercel.app/api/mcp"]
        }
    }
}
```

#### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
    "mcpServers": {
        "linear": {
            "command": "npx",
            "args": ["mcp-remote", "https://your-deployment.vercel.app/api/mcp"]
        }
    }
}
```

#### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
    "mcpServers": {
        "linear": {
            "command": "npx",
            "args": ["mcp-remote", "https://your-deployment.vercel.app/api/mcp"]
        }
    }
}
```

## API Examples

### Create an Issue

```javascript
await client.callTool({
    name: "linear_create_issue",
    arguments: {
        title: "Fix authentication bug",
        teamId: "team_123",
        description: "Users are unable to log in with Google OAuth",
        priority: 2,
    },
});
```

### Search Issues

```javascript
await client.callTool({
    name: "linear_search_issues",
    arguments: {
        query: "authentication",
        status: "In Progress",
        limit: 10,
    },
});
```

### Get Organization Data

```javascript
const org = await client.callTool({
    name: "linear_get_organization",
    arguments: {},
});
```

## Deployment

### Deploy to Vercel

1. **Push to GitHub**
2. **Connect to Vercel**
3. **Add environment variables**:
    - `LINEAR_API_KEY`: Your Linear API key
4. **Deploy**

The server will be available at:

-   SSE endpoint: `https://your-app.vercel.app/api/sse`
-   HTTP endpoint: `https://your-app.vercel.app/api/mcp`

## Development

The server is built using:

-   **[@vercel/mcp-adapter](https://github.com/vercel/mcp-adapter)**: Vercel's MCP server adapter
-   **[@linear/sdk](https://github.com/linear/linear)**: Official Linear SDK
-   **[zod](https://github.com/colinhacks/zod)**: Runtime type validation
-   **TypeScript**: Type safety and better development experience

### Project Structure

```
├── api/
│   └── server.ts          # Main MCP server implementation
├── scripts/
│   ├── test-client.mjs    # SSE transport test client
│   └── test-streamable-http-client.mjs  # HTTP transport test client
├── vercel.json            # Vercel deployment configuration
└── package.json           # Dependencies and scripts
```

## Rate Limiting

The server includes built-in rate limiting to respect Linear's API limits:

-   **1400 requests per hour** maximum
-   **Automatic queuing** of requests
-   **Batch processing** for efficiency
-   **Metrics tracking** for monitoring

## Error Handling

All operations include comprehensive error handling:

-   **Input validation** using Zod schemas
-   **API error wrapping** with descriptive messages
-   **Resource not found** handling
-   **Rate limit** awareness

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

## License

[Insert your license here]

## Support

-   [Linear API Documentation](https://developers.linear.app/)
-   [Vercel MCP Adapter](https://github.com/vercel/mcp-adapter)
-   [Model Context Protocol](https://modelcontextprotocol.io/)

```sh
node scripts/test-client.mjs https://mcp-on-vercel.vercel.app
```
