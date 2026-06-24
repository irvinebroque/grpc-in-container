import { describe, expect, it } from "vitest";
import worker, { GrpcContainer } from "../src/index";

describe("gRPC container tunnel worker", () => {
	it("exposes only a connect handler on the Worker", () => {
		const handler = worker as ExportedHandler<Env>;

		expect(handler.fetch).toBeUndefined();
		expect(typeof handler.connect).toBe("function");
	});

	it("exposes only a connect handler on the Durable Object", () => {
		const durableObject = GrpcContainer.prototype as DurableObject;

		expect(durableObject.fetch).toBeUndefined();
		expect(typeof durableObject.connect).toBe("function");
	});
});
