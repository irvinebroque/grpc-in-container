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

## Reality check

Status as of June 24, 2026:

| Status | Surface | What this demo assumes |
| --- | --- | --- |
| Works today, documented | Container gRPC process | The Node `@grpc/grpc-js` server and client work in isolation. This proves the app inside the container can accept a bidi stream and send bytes back. |
| Works today, documented | Low-level Durable Object Container API | Public docs describe `this.ctx.container`, `start(...)`, `running`, and `getTcpPort(port).connect(...)`. This demo uses that API directly instead of `@cloudflare/containers`. |
| Works today, documented | Worker TCP `Socket` shape | Public docs describe sockets with `readable`, `writable`, `opened`, `closed`, and `close()`. The current primitive for proxying is to pipe both stream directions. |
| Present in `workerd`, not public ingress | Worker `export default { connect(socket) }` | `workerd` generated types and tests include a connect handler, and local `workerd` configs can route TCP listeners to it. Public Cloudflare Workers docs still say inbound direct TCP support is coming soon. |
| Present in `workerd`, not public DO docs | `DurableObject.connect(socket)` and `stub.connect(...)` | `workerd` generated types expose `DurableObject.connect`, and `Fetcher.connect(...)` is present on service bindings/stubs. Public Durable Object Stub docs currently describe RPC methods and stub properties, not a raw socket `connect` path. |
| Gap today | Public client TCP to deployed Worker | There is no documented public Cloudflare Worker ingress that lets an arbitrary client open a raw TCP socket to the Worker today. HTTP `CONNECT` is also not accepted as a normal Workers request method. |
| Gap today | Runtime socket handoff/splice API | There is no documented single-call API to pass one socket through to another. The readable side of each socket must be piped to the writable side of the other socket. |
| Gap in this minimal demo | Container readiness | `this.ctx.container.start(...)` starts the container but does not wait for the gRPC port to be ready. A production version would add readiness/retry logic or use the higher-level `Container` class. |

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
