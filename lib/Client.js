import http from "node:http";
import { debuglog } from "node:util";
import { pipeline } from "node:stream/promises";
import { EventEmitter } from "node:events";

// A client encapsulates req/res handling using an agent
//
// If an agent is destroyed, the request handling will error
// The caller is responsible for handling a failed request
class Client extends EventEmitter {
  constructor(options) {
    super();

    const agent = (this.agent = options.agent);
    const id = (this.id = options.id);

    this.debug = debuglog(`lt:Client[${this.id}]`);

    // client is given a grace period in which they can connect before they are _removed_
    this.graceTimeout = setTimeout(() => {
      this.close();
    }, 1000).unref();

    agent.on("online", () => {
      this.debug("client online %s", id);
      clearTimeout(this.graceTimeout);
    });

    agent.on("offline", () => {
      this.debug("client offline %s", id);

      // if there was a previous timeout set, we don't want to double trigger
      clearTimeout(this.graceTimeout);

      // client is given a grace period in which they can re-connect before they are _removed_
      this.graceTimeout = setTimeout(() => {
        this.close();
      }, 1000).unref();
    });

    // TODO(roman): an agent error removes the client, the user needs to re-connect?
    // how does a user realize they need to re-connect vs some random client being assigned same port?
    agent.once("error", (err) => {
      this.close();
    });
  }

  stats() {
    return this.agent.stats();
  }

  close() {
    clearTimeout(this.graceTimeout);
    this.agent.destroy();
    this.emit("close");
  }

  async handleRequest(req, res) {
    this.debug("> %s", req.url);
    const opt = {
      path: req.url,
      agent: this.agent,
      method: req.method,
      headers: req.headers,
    };

    try {
      const clientReq = http.request(opt);
      clientReq.once("response", async (clientRes) => {
        this.debug("< %s", req.url);
        // write response code and headers
        res.writeHead(clientRes.statusCode, clientRes.headers);

        // using pipeline is deliberate - handles backpressure and cleanup
        await pipeline(clientRes, res);
      });

      // using pipeline is deliberate - handles backpressure and cleanup
      await pipeline(req, clientReq);
    } catch (err) {
      // TODO(roman): if headers not sent - respond with gateway unavailable
      if (!res.headersSent) {
        res.writeHead(504);
        res.end();
      }
    }
  }

  async handleUpgrade(req, socket) {
    this.debug("> [up] %s", req.url);

    // Add cleanup handler
    socket.once("error", (err) => {
      if (err.code == "ECONNRESET" || err.code == "ETIMEDOUT") {
        return;
      }
      console.error(err);
    });

    let conn;
    try {
      conn = await new Promise((resolve, reject) => {
        this.agent.createConnection({}, (err, connection) => {
          if (err) reject(err);
          else resolve(connection);
        });
      });

      this.debug("< [up] %s", req.url);

      if (!socket.readable || !socket.writable) {
        conn.destroy();
        socket.end();
        return;
      }

      // Write headers first
      const arr = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length - 1; i += 2) {
        arr.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      arr.push("");
      arr.push("");
      conn.write(arr.join("\r\n"));

      // Handle cleanup for both sockets
      const cleanup = () => {
        socket.removeListener("close", cleanup);
        conn.removeListener("close", cleanup);
        socket.destroy();
        conn.destroy();
      };

      socket.once("close", cleanup);
      conn.once("close", cleanup);

      // Then set up pipelines
      await Promise.all([
        pipeline(conn, socket).catch(() => {}), // Ignore pipeline errors
        pipeline(socket, conn).catch(() => {}), // Ignore pipeline errors
      ]);
    } catch (err) {
      if (conn) conn.destroy();
      socket.destroy();
    }
  }
}

export default Client;
