#!/usr/bin/env node
// The GM's one tool for sending real work to a department. This is a tiny
// MCP server that Claude Code loads per .mcp.json. It does almost nothing
// itself on purpose: write a status file so the app can show "Sent to X HQ"
// immediately, launch dept-runner.js as a detached background process, and
// hand back a short confirmation. The actual work -- and the "working" /
// "done" status updates -- happen in dept-runner.js, which keeps running
// long after this MCP server (and the GM's single -p turn that invoked it)
// has already exited.
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { listDepartments, getDepartment } = require("./lib/departments");
const { writeStatus } = require("./lib/status-store");

const TMP_DIR = path.join(__dirname, "tmp");

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
    const dept = getDepartment(department);
    if (!dept) {
      return {
        content: [{ type: "text", text: `Unknown department "${department}".` }],
        isError: true,
      };
    }

    fs.mkdirSync(TMP_DIR, { recursive: true });
    const taskFile = path.join(TMP_DIR, `${Date.now()}-${department}.task.txt`);
    fs.writeFileSync(taskFile, task, "utf8");

    writeStatus(dept.key, {
      displayName: dept.displayName,
      status: "sent",
      task,
      startedAt: new Date().toISOString(),
    });

    const runner = spawn(
      process.execPath,
      [path.join(__dirname, "dept-runner.js"), dept.key, taskFile],
      { detached: true, stdio: "ignore", windowsHide: true }
    );
    runner.unref();

    return {
      content: [
        {
          type: "text",
          text: `Sent to ${dept.displayName}. It's working in the background on this machine now.`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
server.connect(transport);
