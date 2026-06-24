import { DurableObject } from "cloudflare:workers";

const CONTAINER_INSTANCE = "grpc-demo";
const GRPC_PORT = 50051;
const SOCKET_OPTIONS: SocketOptions = {
	allowHalfOpen: true,
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
	async connect(socket, env): Promise<void> {
		const container = env.GRPC_CONTAINER.getByName(CONTAINER_INSTANCE);
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
