#!/usr/bin/env node
// The GM's one tool for sending real work to a department. This is a tiny
// MCP server that Claude Code loads per .mcp.json. It does almost nothing
// itself on purpose: hand off to lib/fire.js, which writes a status file so
// the app can show "Sent to X HQ" immediately and launches dept-runner.js
// as a detached background process. The actual work -- and the "working" /
// "done" status updates -- happen in dept-runner.js, which keeps running
// long after this MCP server (and the GM's single -p turn that invoked it)
// has already exited. The app's own scheduler (lib/scheduler.js) uses the
// same fire.js to launch plain, un-assigned check-ins -- this tool is only
// for a specific task the GM or Matthew actually asked for.
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { listDepartments } = require("./lib/departments");
const { fireDepartment } = require("./lib/fire.js");

const server = new McpServer({ name: "street-office", version: "1.0.0" });

const departmentKeys = listDepartments().map((d) => d.key);

server.tool(
  "fire_department",
  "Send a real task to one of Street's departments to work on in the background, on this machine, right now. Use this whenever Matthew wants something actually done (not just a status question). Log the instruction to that department's questions.md first, same as always, then call this.",
  {
    department: z
      .enum(departmentKeys)
      .describe("The department's key, e.g. 'infrastructure', 'product', 'finance'."),
    task: z
      .string()
      .describe("A clear, specific description of what this department should do."),
  },
  async ({ department, task }) => {
    const result = fireDepartment(department, { task, trigger: "manual" });
    if (!result.ok) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return {
      content: [
        {
          type: "text",
          text: `Sent to ${result.dept.displayName}. It's working in the background on this machine now.`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
server.connect(transport);
