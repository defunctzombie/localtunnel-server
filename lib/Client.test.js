import { strict as assert } from "node:assert";
import { createServer, Agent } from "node:http";
import { Duplex } from "node:stream";
import { createConnection } from "node:net";

import Client from "./Client.js";

class DummySocket extends Duplex {
  constructor(options) {
    super(options);
  }

  _write(chunk, encoding, callback) {
    callback();
  }

  _read(size) {
    this.push("HTTP/1.1 304 Not Modified\r\nX-Powered-By: dummy\r\n\r\n\r\n");
    this.push(null);
  }
}

class DummyWebsocket extends Duplex {
  constructor(options) {
    super(options);
    this.sentHeader = false;
  }

  _write(chunk, encoding, callback) {
    const str = chunk.toString();
    // if chunk contains `GET / HTTP/1.1` -> queue headers
    // otherwise echo back received data
    if (str.indexOf("GET / HTTP/1.1") === 0) {
      const arr = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
      ];
      this.push(arr.join("\r\n"));
      this.push("\r\n\r\n");
    } else {
      this.push(str);
    }
    callback();
  }

  _read(size) {
    // nothing to implement
  }
}

class DummyAgent extends Agent {
  constructor() {
    super();
  }

  createConnection(options, cb) {
    cb(null, new DummySocket());
  }
}

// need a websocket server and a socket for it
class DummyWebsocketAgent extends Agent {
  constructor() {
    super();
  }

  createConnection(options, cb) {
    cb(null, new DummyWebsocket());
  }
}

describe("Client", () => {
  it("should handle request", async () => {
    const agent = new DummyAgent();
    const client = new Client({ agent });

    const server = createServer((req, res) => {
      client.handleRequest(req, res);
    });

    await new Promise((resolve) => server.listen(resolve));

    const address = server.address();
    const opt = {
      host: "localhost",
      port: address.port,
      path: "/",
    };

    const res = await new Promise((resolve) => {
      const req = new URL("http://localhost:" + address.port).searchParams;
      fetch("http://localhost:" + address.port).then((res) => resolve(res));
    });
    assert.equal(res.headers.get("x-powered-by"), "dummy");
    await server.close();
  });

  it("should handle upgrade", async () => {
    const agent = new DummyWebsocketAgent();
    const client = new Client({ agent });

    const server = createServer();
    server.on("upgrade", (req, socket, head) => {
      client.handleUpgrade(req, socket);
    });

    await new Promise((resolve) => server.listen(resolve));
    const address = server.address();

    try {
      const netClient = await new Promise((resolve, reject) => {
        const newClient = createConnection(
          {
            port: address.port,
            timeout: 5000, // Add timeout
          },
          () => {
            resolve(newClient);
          }
        );
        newClient.on("error", reject); // Handle connection errors
      });

      const out = [
        "GET / HTTP/1.1",
        "Host: localhost:" + address.port, // Add Host header
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13", // Add WebSocket version
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==", // Add WebSocket key
      ];

      netClient.write(out.join("\r\n") + "\r\n\r\n");

      // Rest of your test...
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
