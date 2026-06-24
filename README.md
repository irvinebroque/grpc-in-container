# gRPC in a Cloudflare Container

This is a starter demo for a Cloudflare Worker that forwards raw bytes to a
containerized gRPC service without the Worker itself speaking gRPC.

The shape is:

1. A client opens a bidirectional byte stream to the Worker.
2. The Worker's `connect(socket)` handler forwards bytes to a Durable Object.
3. The Durable Object starts the container when the DO instance starts.
4. The Durable Object's `connect(socket)` handler opens the container's TCP port
   with `this.ctx.container.getTcpPort(50051).connect(...)`.
5. The container runs a minimal Node gRPC server with a bidi `Chat` stream.

The current public Workers protocol docs still describe inbound direct TCP as
"coming soon", so the `connect(socket)` handler is the intended front door for
the platform gap this demo is meant to highlight. The container-side API is the
low-level Durable Object container API, not the high-level
`@cloudflare/containers` `Container` class.

Current docs checked while building this:

- [Durable Object Container API](https://developers.cloudflare.com/durable-objects/api/container/)
- [Cloudflare Containers overview](https://developers.cloudflare.com/containers/)
- [Containers local development](https://developers.cloudflare.com/containers/local-dev/)
- [Workers protocol support](https://developers.cloudflare.com/workers/reference/protocols/)
- [Workers TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)

## Files

- `src/index.ts` exports only the Worker `connect` handler and the
  `GrpcContainer` Durable Object `connect` handler.
- `proto/bytes.proto` defines the bidi gRPC method.
- `container/server.js` runs the containerized gRPC server.
- `container/client.js` is a tiny local client for proving the gRPC app itself.
- `Dockerfile` builds the container image used by Wrangler.

## Local gRPC server smoke test

```sh
npm --prefix container install
npm --prefix container start
```

In another terminal:

```sh
npm --prefix container run client -- localhost:50051
```

You should see the server send an initial hello, echo two byte payloads, then
send a final goodbye.

## Worker and container development

```sh
npm run dev
```

Wrangler will build the Dockerfile and start container instances when the Worker
routes traffic to them. For local development, the Dockerfile must expose the
gRPC port, which this demo does with `EXPOSE 50051`.

There is intentionally no Worker `fetch` handler and no Durable Object `fetch`
handler in this demo. The point is to show the customer shape as connect-only:
incoming bytes enter through `connect`, cross the Durable Object through
`connect`, and reach the container through the raw TCP port opened from
`this.ctx.container`.

The Worker and Durable Object do not "pass" a socket object along. The runtime
socket API exposes a `readable` side and a `writable` side, so each hop connects
the two sockets by piping both stream directions.
