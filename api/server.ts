import { createMcpHandler } from "@vercel/mcp-adapter";
import { LinearClient, Issue, IssueLabel } from "@linear/sdk";
import { z } from "zod";

import 'dotenv/config'

// Types and interfaces
interface CreateIssueArgs {
  title: string;
  teamId: string;
  description?: string;
  priority?: number;
  status?: string;
}

interface UpdateIssueArgs {
  id: string;
  title?: string;
  description?: string;
  priority?: number;
  status?: string;
}

interface SearchIssuesArgs {
  query?: string;
  teamId?: string;
  limit?: number;
  status?: string;
  assigneeId?: string;
  labels?: string[];
  priority?: number;
  estimate?: number;
  includeArchived?: boolean;
}

interface GetUserIssuesArgs {
  userId?: string;
  includeArchived?: boolean;
  limit?: number;
}

interface AddCommentArgs {
  issueId: string;
  body: string;
  createAsUser?: string;
  displayIconUrl?: string;
}

interface RateLimiterMetrics {
  totalRequests: number;
  requestsInLastHour: number;
  averageRequestTime: number;
  queueLength: number;
  lastRequestTime: number;
}

// Simplified rate limiter for serverless environment
class RateLimiter {
  public readonly requestsPerHour = 1400;
  private queue: (() => Promise<any>)[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private readonly minDelayMs = 3600000 / this.requestsPerHour;
  private requestTimes: number[] = [];
  private requestTimestamps: number[] = [];

  async enqueue<T>(fn: () => Promise<T>, operation?: string): Promise<T> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          const endTime = Date.now();
          const duration = endTime - startTime;
          this.trackRequest(startTime, endTime);
          resolve(result);
        } catch (error) {
          console.error(`Error in request${operation ? ` for ${operation}` : ''}: `, error);
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      const requestsInLastHour = this.requestTimestamps.filter(t => t > now - 3600000).length;
      if (requestsInLastHour >= this.requestsPerHour * 0.9 && timeSinceLastRequest < this.minDelayMs) {
        const waitTime = this.minDelayMs - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const fn = this.queue.shift();
      if (fn) {
        this.lastRequestTime = Date.now();
        await fn();
      }
    }

    this.processing = false;
  }

  private trackRequest(startTime: number, endTime: number) {
    const duration = endTime - startTime;
    this.requestTimes.push(duration);
    this.requestTimestamps.push(startTime);

    // Keep only last hour of requests
    const oneHourAgo = Date.now() - 3600000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneHourAgo);
    this.requestTimes = this.requestTimes.slice(-this.requestTimestamps.length);
  }

  getMetrics(): RateLimiterMetrics {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentRequests = this.requestTimestamps.filter(t => t > oneHourAgo);

    return {
      totalRequests: this.requestTimestamps.length,
      requestsInLastHour: recentRequests.length,
      averageRequestTime: this.requestTimes.length > 0
        ? this.requestTimes.reduce((a, b) => a + b, 0) / this.requestTimes.length
        : 0,
      queueLength: this.queue.length,
      lastRequestTime: this.lastRequestTime
    };
  }
}

// Linear MCP Client
class LinearMCPClient {
  private client: LinearClient;
  public readonly rateLimiter: RateLimiter;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("LINEAR_API_KEY environment variable is required");
    this.client = new LinearClient({ apiKey });
    this.rateLimiter = new RateLimiter();
  }

  private async getIssueDetails(issue: Issue) {
    const [state, assignee, team] = await Promise.all([
      this.rateLimiter.enqueue(async () => issue.state),
      this.rateLimiter.enqueue(async () => issue.assignee),
      this.rateLimiter.enqueue(async () => issue.team)
    ]);

    return { state, assignee, team };
  }

  async createIssue(args: CreateIssueArgs) {
    const issuePayload = await this.client.createIssue({
      title: args.title,
      teamId: args.teamId,
      description: args.description,
      priority: args.priority,
      stateId: args.status
    });

    const issue = await issuePayload.issue;
    if (!issue) throw new Error("Failed to create issue");
    return issue;
  }

  async updateIssue(args: UpdateIssueArgs) {
    const issue = await this.client.issue(args.id);
    if (!issue) throw new Error(`Issue ${args.id} not found`);

    const updatePayload = await issue.update({
      title: args.title,
      description: args.description,
      priority: args.priority,
      stateId: args.status
    });

    const updatedIssue = await updatePayload.issue;
    if (!updatedIssue) throw new Error("Failed to update issue");
    return updatedIssue;
  }

  async searchIssues(args: SearchIssuesArgs) {
    const result = await this.rateLimiter.enqueue(() =>
      this.client.issues({
        filter: this.buildSearchFilter(args),
        first: args.limit || 10,
        includeArchived: args.includeArchived
      })
    );

    const issues = await Promise.all(result.nodes.map(async (issue) => {
      const [state, assignee, labels] = await Promise.all([
        this.rateLimiter.enqueue(async () => issue.state ? await issue.state : null),
        this.rateLimiter.enqueue(async () => issue.assignee ? await issue.assignee : null),
        this.rateLimiter.enqueue(async () => await issue.labels())
      ]);

      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        estimate: issue.estimate,
        status: state?.name || null,
        assignee: assignee?.name || null,
        labels: labels?.nodes?.map((label: IssueLabel) => label.name) || [],
        url: issue.url
      };
    }));

    return issues;
  }

  async getUserIssues(args: GetUserIssuesArgs) {
    const user = args.userId && typeof args.userId === 'string' ?
      await this.rateLimiter.enqueue(() => this.client.user(args.userId as string)) :
      await this.rateLimiter.enqueue(() => this.client.viewer);

    const result = await this.rateLimiter.enqueue(() => user.assignedIssues({
      first: args.limit || 50,
      includeArchived: args.includeArchived
    }));

    if (!result?.nodes) return [];

    const issues = await Promise.all(result.nodes.map(async (issue) => {
      const state = await this.rateLimiter.enqueue(async () => issue.state ? await issue.state : null);
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        stateName: state?.name || 'Unknown',
        url: issue.url
      };
    }));

    return issues;
  }

  async addComment(args: AddCommentArgs) {
    const commentPayload = await this.client.createComment({
      issueId: args.issueId,
      body: args.body,
      createAsUser: args.createAsUser,
      displayIconUrl: args.displayIconUrl
    });

    const comment = await commentPayload.comment;
    if (!comment) throw new Error("Failed to create comment");

    const issue = await comment.issue;
    return { comment, issue };
  }

  async getIssue(issueId: string) {
    const issue = await this.rateLimiter.enqueue(() => this.client.issue(issueId));
    if (!issue) throw new Error(`Issue ${issueId} not found`);

    const details = await this.getIssueDetails(issue);

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      status: details.state?.name,
      assignee: details.assignee?.name,
      team: details.team?.name,
      url: issue.url
    };
  }

  async getOrganization() {
    const organization = await this.client.organization;
    const [teams, users] = await Promise.all([
      organization.teams(),
      organization.users()
    ]);

    return {
      id: organization.id,
      name: organization.name,
      urlKey: organization.urlKey,
      teams: teams.nodes.map(team => ({
        id: team.id,
        name: team.name,
        key: team.key
      })),
      users: users.nodes.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        admin: user.admin,
        active: user.active
      }))
    };
  }

  async getViewer() {
    const viewer = await this.client.viewer;
    const [teams, organization] = await Promise.all([
      viewer.teams(),
      this.client.organization
    ]);

    return {
      id: viewer.id,
      name: viewer.name,
      email: viewer.email,
      admin: viewer.admin,
      teams: teams.nodes.map(team => ({
        id: team.id,
        name: team.name,
        key: team.key
      })),
      organization: {
        id: organization.id,
        name: organization.name,
        urlKey: organization.urlKey
      }
    };
  }

  private buildSearchFilter(args: SearchIssuesArgs): any {
    const filter: any = {};

    if (args.query) {
      filter.or = [
        { title: { contains: args.query } },
        { description: { contains: args.query } }
      ];
    }

    if (args.teamId) {
      filter.team = { id: { eq: args.teamId } };
    }

    if (args.status) {
      filter.state = { name: { eq: args.status } };
    }

    if (args.assigneeId) {
      filter.assignee = { id: { eq: args.assigneeId } };
    }

    if (args.labels && args.labels.length > 0) {
      filter.labels = {
        some: {
          name: { in: args.labels }
        }
      };
    }

    if (args.priority) {
      filter.priority = { eq: args.priority };
    }

    if (args.estimate) {
      filter.estimate = { eq: args.estimate };
    }

    return filter;
  }
}

// Create the handler
const handler = createMcpHandler(
  (server) => {
    // Initialize Linear client
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error("LINEAR_API_KEY environment variable is required");
    }

    const linearClient = new LinearMCPClient(apiKey);

    // Define tools
    server.tool(
      "linear_create_issue",
      "Creates a new Linear issue with specified details",
      {
        title: z.string().describe("Issue title"),
        teamId: z.string().describe("Team ID"),
        description: z.string().optional().describe("Issue description"),
        priority: z.number().min(0).max(4).optional().describe("Priority (0-4)"),
        status: z.string().optional().describe("Issue status")
      },
      async (args) => {
        try {
          const issue = await linearClient.createIssue(args);
          return {
            content: [{
              type: "text",
              text: `Created issue ${issue.identifier}: ${issue.title}\nURL: ${issue.url}`
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error creating issue: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );

    server.tool(
      "linear_update_issue",
      "Updates an existing Linear issue's properties",
      {
        id: z.string().describe("Issue ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        priority: z.number().optional().describe("New priority (0-4)"),
        status: z.string().optional().describe("New status")
      },
      async (args) => {
        try {
          const issue = await linearClient.updateIssue(args);
          return {
            content: [{
              type: "text",
              text: `Updated issue ${issue.identifier}\nURL: ${issue.url}`
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error updating issue: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );

    server.tool(
      "linear_search_issues",
      "Searches Linear issues using flexible criteria",
      {
        query: z.string().optional().describe("Optional text to search in title and description"),
        teamId: z.string().optional().describe("Filter by team ID"),
        status: z.string().optional().describe("Filter by status name"),
        assigneeId: z.string().optional().describe("Filter by assignee's user ID"),
        labels: z.array(z.string()).optional().describe("Filter by label names"),
        priority: z.number().optional().describe("Filter by priority"),
        estimate: z.number().optional().describe("Filter by estimate points"),
        includeArchived: z.boolean().optional().describe("Include archived issues"),
        limit: z.number().optional().describe("Max results to return")
      },
      async (args) => {
        try {
          const issues = await linearClient.searchIssues(args);
          const issueList = issues.map(issue =>
            `- ${issue.identifier}: ${issue.title}\n  Priority: ${issue.priority || 'None'}\n  Status: ${issue.status || 'None'}\n  ${issue.url}`
          ).join('\n');

          return {
            content: [{
              type: "text",
              text: `Found ${issues.length} issues:\n${issueList}`
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error searching issues: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );

    server.tool(
      "linear_get_user_issues",
      "Retrieves issues assigned to a specific user",
      {
        userId: z.string().optional().describe("Optional user ID"),
        includeArchived: z.boolean().optional().describe("Include archived issues"),
        limit: z.number().optional().describe("Maximum number of issues to return")
      },
      async (args) => {
        try {
          const issues = await linearClient.getUserIssues(args);
          const issueList = issues.map(issue =>
            `- ${issue.identifier}: ${issue.title}\n  Priority: ${issue.priority || 'None'}\n  Status: ${issue.stateName}\n  ${issue.url}`
          ).join('\n');

          return {
            content: [{
              type: "text",
              text: `Found ${issues.length} issues:\n${issueList}`
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error getting user issues: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );

    server.tool(
      "linear_add_comment",
      "Adds a comment to an existing Linear issue",
      {
        issueId: z.string().describe("ID of the issue to comment on"),
        body: z.string().describe("Comment text in markdown format"),
        createAsUser: z.string().optional().describe("Optional custom username"),
        displayIconUrl: z.string().optional().describe("Optional avatar URL")
      },
      async (args) => {
        try {
          const { comment, issue } = await linearClient.addComment(args);
          return {
            content: [{
              type: "text",
              text: `Added comment to issue ${issue?.identifier}\nURL: ${comment.url}`
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error adding comment: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );

    // Add tools for getting organization and viewer data
    server.tool(
      "linear_get_organization",
      "Get Linear organization details including teams and users",
      {},
      async () => {
        try {
          const organization = await linearClient.getOrganization();
          return {
            content: [{
              type: "text",
              text: JSON.stringify(organization, null, 2)
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error fetching organization: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );

    server.tool(
      "linear_get_viewer",
      "Get current authenticated user information",
      {},
      async () => {
        try {
          const viewer = await linearClient.getViewer();
          return {
            content: [{
              type: "text",
              text: JSON.stringify(viewer, null, 2)
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error fetching viewer: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );

    server.tool(
      "linear_get_issue",
      "Get detailed information about a specific Linear issue",
      {
        issueId: z.string().describe("The ID of the issue to fetch")
      },
      async (args) => {
        try {
          const issue = await linearClient.getIssue(args.issueId);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(issue, null, 2)
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error fetching issue: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true
          };
        }
      }
    );
  },
  {
    // Optional server options
  },
  {
    redisUrl: process.env.REDIS_URL,
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
