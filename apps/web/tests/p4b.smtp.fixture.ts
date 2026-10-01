import { createServer, type Socket } from "node:net";
export type SmtpMode = "accepted" | "temporary" | "permanent" | "disconnect" | "timeout";
export async function smtpFixture(mode: SmtpMode) {
  const sockets = new Set<Socket>();
  let connections = 0, messages = 0, received!: () => void;
  const submitted = new Promise<void>((resolve) => { received = resolve; });
  const server = createServer((socket) => {
    connections++; sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => undefined);
    socket.write("220 fixture.example.test ESMTP\r\n");
    let buffer = "", data = false;
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 20 * 1024) { socket.destroy(); return; }
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) {
          if (line !== ".") continue;
          data = false; messages++; received();
          if (mode === "disconnect") socket.destroy();
          else if (mode !== "timeout") socket.write(mode === "temporary" ? "450 synthetic-private-provider-detail\r\n" : "250 queued\r\n");
        } else if (line.startsWith("EHLO")) socket.write("250-fixture.example.test\r\n250 AUTH PLAIN\r\n");
        else if (line.startsWith("AUTH")) socket.write("235 authenticated\r\n");
        else if (line.startsWith("MAIL")) socket.write(mode === "permanent" ? "550 refused\r\n" : "250 sender\r\n");
        else if (line.startsWith("RCPT")) socket.write("250 recipient\r\n");
        else if (line === "DATA") { data = true; socket.write("354 send data\r\n"); }
        else if (line === "QUIT") socket.end("221 bye\r\n");
        else if (line === "RSET") socket.write("250 reset\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture_address");
  return { port: address.port, submitted, counts: () => ({ connections, messages }),
    async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => server.close(() => resolve())); } };
}
