import { DurableObject } from "cloudflare:workers";

const CONTAINER_INSTANCE = "grpc-demo";
const GRPC_PORT = 50051;
const SOCKET_OPTIONS: SocketOptions = {
	// Keep half-closes independent for bidi streams. With the default false,
	// EOF on one side also closes the writable side.
	allowHalfOpen: true,
	// The container gRPC server is plaintext HTTP/2 inside the private hop.
	secureTransport: "off",
};

export class GrpcContainer extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.ctx.container!.start({
			enableInternet: false,
			env: {
				GRPC_PORT: String(GRPC_PORT),
			},
		});
	}

	async connect(socket: Socket): Promise<void> {
		// Workerd source, not public DO docs: generated runtime types expose
		// DurableObject.connect(socket). This demo uses it to show the desired
		// raw socket hop from Worker to Durable Object.
		//
		// Documented today: the low-level Durable Object Container API exposes
		// getTcpPort(...).connect(...), returning a Workers Socket.
		const upstream = this.ctx.container!
			.getTcpPort(GRPC_PORT)
			.connect(`10.0.0.1:${GRPC_PORT}`, SOCKET_OPTIONS);
		await upstream.opened;

		await Promise.allSettled([
			socket.readable.pipeTo(upstream.writable),
			upstream.readable.pipeTo(socket.writable),
		]);
	}
}

export default {
	// FUTURE / public-product gap: workerd-generated types expose an
	// ExportedHandler.connect handler, and workerd tests can route local TCP
	// sockets into it. Public Cloudflare Workers docs still say inbound
	// direct TCP support is coming soon.
	async connect(socket, env): Promise<void> {
		const container = env.GRPC_CONTAINER.getByName(CONTAINER_INSTANCE);

		// Workerd source, not public DO docs: DurableObjectStub inherits
		// Fetcher.connect(...), so this is the intended raw socket call into the
		// Durable Object connect handler. The public DO Stub docs currently only
		// describe RPC methods and stub properties.
		const durableObjectSocket = container.connect(
			`grpc-container:${GRPC_PORT}`,
			SOCKET_OPTIONS,
		);

		await durableObjectSocket.opened;
		await Promise.allSettled([
			socket.readable.pipeTo(durableObjectSocket.writable),
			durableObjectSocket.readable.pipeTo(socket.writable),
		]);
	},
} satisfies ExportedHandler<Env>;
