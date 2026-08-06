import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Props } from "../auth/props";
import { canRegisterTool, parseGrantedScopes } from "../auth/scopes";
import type { XeroClient } from "../xero/client";
import { registerAttachmentTools } from "./tools/attachments";
import { registerBankTools } from "./tools/bank";
import { registerContactTools } from "./tools/contacts";
import { registerInvoiceTools } from "./tools/invoices";
import { registerOrgTools } from "./tools/org";
import { registerPaymentTools } from "./tools/payments";
import { registerReportTools } from "./tools/reports";
import { registerSettingsTools } from "./tools/settings";

/**
 * Register tools, filtering by granted Xero scopes.
 * Org/session tools always register.
 *
 * Note: McpServer.tool() registers immediately. We wrap domain registrars
 * by temporarily patching server.tool to gate by TOOL_SCOPE_MAP.
 */
export function registerAllTools(
	server: McpServer,
	getClient: () => XeroClient,
	getProps: () => Props,
	setActiveTenant: (tenantId: string) => void | Promise<void>,
) {
	const granted = parseGrantedScopes(getProps().scopes);

	const originalTool = server.tool.bind(server);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(server as any).tool = (name: string, ...rest: unknown[]) => {
		if (!canRegisterTool(name, granted)) {
			return server;
		}
		// @ts-expect-error rest spread matches overloads
		return originalTool(name, ...rest);
	};

	try {
		registerOrgTools(server, getClient, getProps, setActiveTenant);
		registerContactTools(server, getClient);
		registerInvoiceTools(server, getClient);
		registerPaymentTools(server, getClient);
		registerBankTools(server, getClient);
		registerReportTools(server, getClient);
		registerSettingsTools(server, getClient);
		registerAttachmentTools(server, getClient);
	} finally {
		// restore
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(server as any).tool = originalTool;
	}
}
