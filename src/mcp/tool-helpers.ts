import type { XeroClient } from "../xero/client";
import { toolError, toolOk } from "../xero/errors";

export type ToolResult = Awaited<ReturnType<typeof toolOk>> | Awaited<ReturnType<typeof toolError>>;

export function wrapTool<TArgs>(
	fn: (args: TArgs, client: XeroClient) => Promise<unknown>,
): (args: TArgs, client: XeroClient) => Promise<ToolResult> {
	return async (args, client) => {
		try {
			const data = await fn(args, client);
			return toolOk(data);
		} catch (err) {
			return toolError(err);
		}
	};
}

/** Optional tenant_id on most tools */
export const tenantIdField = {
	tenant_id: {
		description:
			"Xero organisation tenant ID. Optional if set_active_organisation was called. Must be one of your authorised connections.",
	},
};
