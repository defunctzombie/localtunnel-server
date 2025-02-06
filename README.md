# localtunnel-server

[![Build Status](https://travis-ci.org/localtunnel/server.svg?branch=master)](https://travis-ci.org/localtunnel/server)

localtunnel exposes your localhost to the world for easy testing and sharing! No need to mess with DNS or deploy just to have others test out your changes.

This repo is the server component. If you are just looking for the CLI localtunnel app, see (https://github.com/localtunnel/localtunnel).

## overview

The default localtunnel client connects to the `localtunnel.me` server. You can, however, easily set up and run your own server. In order to run your own localtunnel server you must ensure that your server can meet the following requirements:

- You can set up DNS entries for your `domain.tld` and `*.domain.tld` (or `sub.domain.tld` and `*.sub.domain.tld`).
- The server can accept incoming TCP connections for any non-root TCP port (i.e. ports over 1000).

The above are important as the client will ask the server for a subdomain under a particular domain. The server will listen on any OS-assigned TCP port for client connections.

#### setup

```shell
# pick a place where the files will live
git clone git://github.com/defunctzombie/localtunnel-server.git
cd localtunnel-server
npm install

# server set to run on port 1234
bin/server --port 1234
```

The localtunnel server is now running and waiting for client requests on port 1234. You will most likely want to set up a reverse proxy to listen on port 80 (or start localtunnel on port 80 directly).

**NOTE** By default, localtunnel will use subdomains for clients, if you plan to host your localtunnel server itself on a subdomain you will need to use the _--domain_ option and specify the domain name behind which you are hosting localtunnel. (i.e. my-localtunnel-server.example.com)

#### use your server

You can now use your domain with the `--host` flag for the `lt` client.

```shell
lt --host http://sub.example.tld:1234 --port 9000
```

You will be assigned a URL similar to `heavy-puma-9.sub.example.com:1234`.

If your server is acting as a reverse proxy (i.e. nginx) and is able to listen on port 80, then you do not need the `:1234` part of the hostname for the `lt` client.

## REST API

### POST /api/tunnels

Create a new tunnel. A LocalTunnel client posts to this enpoint to request a new tunnel with a specific name or a randomly assigned name.

### GET /api/status

General server information.

## Deploy

You can deploy your own localtunnel server using the prebuilt docker image.

**Note** This assumes that you have a proxy in front of the server to handle the http(s) requests and forward them to the localtunnel server on port 3000. You can use our [localtunnel-nginx](https://github.com/localtunnel/nginx) to accomplish this.

If you do not want ssl support for your own tunnel (not recommended), then you can just run the below with `--port 80` instead.

```
docker run -d \
    --restart always \
    --name localtunnel \
    --net host \
    defunctzombie/localtunnel-server:latest --port 3000
```
