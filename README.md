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

The key point this demo is meant to show is that the Workers runtime already has
the pieces needed for this shape: a socket-based `connect` handler, socket-based
service binding calls, Durable Object `connect`, and a low-level Container TCP
port API. Some of those pieces are visible in `workerd` today but are not yet
documented as public Cloudflare platform APIs.

The remaining platform question is how customers open an inbound raw TCP stream
to a deployed Worker. Public Workers protocol docs still describe inbound direct
TCP as "coming soon". The container-side API used here is the low-level Durable
Object container API, not the high-level `@cloudflare/containers` `Container`
class.

## Reality check

Status as of June 24, 2026:

| Status | Surface | What this demo assumes |
| --- | --- | --- |
| Works today, documented | Low-level Durable Object Container API | Public docs describe `this.ctx.container`, `start(...)`, `running`, and `getTcpPort(port).connect(...)`. This demo uses that API directly instead of `@cloudflare/containers`. |
| Works today, documented | Worker TCP `Socket` shape | Public docs describe sockets with `readable`, `writable`, `opened`, `closed`, and `close()`. The current primitive for proxying is to pipe both stream directions. |
| Runtime-supported in `workerd` | Worker `export default { connect(socket) }` | `workerd` generated types and tests include a connect handler, and local `workerd` configs can route TCP listeners to it. This is the Worker entrypoint this demo is designed around. |
| Runtime-supported in `workerd` | `DurableObject.connect(socket)` and `stub.connect(...)` | `workerd` generated types expose `DurableObject.connect`, and `Fetcher.connect(...)` is present on service bindings/stubs. Public Durable Object Stub docs currently describe RPC methods and stub properties, not a raw socket `connect` path. |
| Product/docs gap | Public client TCP to deployed Worker | Public Cloudflare Workers docs still say inbound direct TCP support is coming soon, so the deployed-product ingress story is the part this demo is meant to make concrete. |

This repository intentionally keeps the future-facing code in place because the
goal is to show the desired customer shape and make the missing platform pieces
easy to see.

## Evidence checked

Public Cloudflare docs:

- [Durable Object Container API](https://developers.cloudflare.com/durable-objects/api/container/)
- [Cloudflare Containers overview](https://developers.cloudflare.com/containers/)
- [Containers local development](https://developers.cloudflare.com/containers/local-dev/)
- [Workers protocol support](https://developers.cloudflare.com/workers/reference/protocols/)
- [Workers TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
- [Workers Request API](https://developers.cloudflare.com/workers/runtime-apis/request/)
- [Durable Object Stub API](https://developers.cloudflare.com/durable-objects/api/stub/)

`workerd` source and tests:

- [`ExportedHandler.connect` generated type](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/global-scope.h#L554-L565)
- [`DurableObject.connect` generated type](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/actor.h#L109-L112)
- [`Fetcher.connect(...)` generated type](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.h#L452-L482)
- [`connect_pass_through` comment noting raw socket ingress is not yet defined](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.capnp#L792-L806)
- [`connect` handler tests with TCP listeners](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/tests/connect-handler-test.wd-test#L44-L48)
- [`connect` handler and service-binding `connect` test](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/tests/connect-handler-test.js#L41-L68)
- [`connect` proxy test showing bidirectional stream piping](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/tests/connect-handler-test-proxy.js#L7-L15)

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
