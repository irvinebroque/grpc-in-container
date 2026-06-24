const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const target = process.argv[2] || "localhost:50051";
const protoPath =
	process.env.PROTO_PATH || path.resolve(__dirname, "../proto/bytes.proto");

const definition = protoLoader.loadSync(protoPath, {
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
});
const proto = grpc.loadPackageDefinition(definition).cloudflare.grpcdemo;
const client = new proto.ByteStream(
	target,
	grpc.credentials.createInsecure(),
);
const call = client.Chat();

call.on("data", (chunk) => {
	const payload = Buffer.isBuffer(chunk.payload)
		? chunk.payload
		: Buffer.from(chunk.payload || "");
	process.stdout.write(payload);
});

call.on("end", () => {
	console.log("stream ended");
});

call.on("error", (error) => {
	console.error("stream error", error);
	process.exitCode = 1;
});

for (const message of ["client says hello\n", "client streams bytes\n"]) {
	call.write({ payload: Buffer.from(message) });
}

call.end();
