import request from "supertest";
import { strict as assert } from "node:assert";
import WebSocket, { WebSocketServer } from "ws";
import net from "node:net";

import createServer from "./server.js";

describe("Server", () => {
  it("server starts and stops", async () => {
    const server = createServer();
    await new Promise((resolve) => server.listen(resolve));
    await new Promise((resolve) => server.close(resolve));
  });

  it("should redirect root requests to landing page", async () => {
    const server = createServer();
    const res = await request(server).get("/");
    assert.equal(res.headers.location, "https://localtunnel.github.io/www/");
  });

  it("should support custom base domains", async () => {
    const server = createServer({
      domain: "domain.example.com",
    });

    const res = await request(server).get("/");
    assert.equal(res.headers.location, "https://localtunnel.github.io/www/");
  });

  it("reject long domain name requests", async () => {
    const server = createServer();
    const res = await request(server).get(
      "/thisdomainisoutsidethesizeofwhatweallowwhichissixtythreecharacters"
    );
    assert.equal(
      res.body.message,
      "Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters."
    );
  });

  it("should upgrade websocket requests", async () => {
    const server = createServer({
      domain: "example.com",
    });

    await new Promise((resolve) => server.listen(resolve));

    try {
      // Get tunnel info
      const res = await request(server).get("/?new");
      const clientId = res.body.id;

      // Simple echo server
      const wss = new WebSocketServer({ port: 0 });
      await new Promise((resolve) => wss.once("listening", resolve));

      // Connect tunnel to echo server
      const tunnel = net.connect(res.body.port);
      const wsConn = net.connect(wss.address().port);
      tunnel.pipe(wsConn).pipe(tunnel);

      // Test the WebSocket connection
      const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
        headers: { host: `${clientId}.example.com` },
      });

      await new Promise((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });

      ws.close();
    } finally {
      server.close();
    }
  });

  it("should support the /api/tunnels/:id/status endpoint", async () => {
    const server = createServer();
    await new Promise((resolve) => server.listen(resolve));

    // no such tunnel yet
    const res = await request(server).get("/api/tunnels/foobar-test/status");
    assert.equal(res.statusCode, 404);

    // request a new client called foobar-test
    {
      await request(server).get("/foobar-test");
    }

    {
      const res = await request(server).get("/api/tunnels/foobar-test/status");
      assert.equal(res.statusCode, 200);
      assert.deepStrictEqual(res.body, {
        connected_sockets: 0,
      });
    }

    await new Promise((resolve) => server.close(resolve));
  });
});
