# Customize Docker

The machine/runtime config lives in `harness-config/docker.ts`.

That file is the source of truth for:

- `apt` system packages
- `npm` global CLI tools
- `pip` Python dependencies
- `setup` one-off bootstrap shell steps

By default the template installs the Codex CLI plus its Linux runtime package there so the SDK has a Codex runtime available in Docker.

During Docker build, the repo materializes `docker.ts` into temporary build inputs automatically.

Edit `Dockerfile` only when you need a deeper image change than the typed machine config can express.

## Optional Proxy CA Trust

If managed HTTPS egress is enabled, the preferred setup is to trust the Salambo proxy CA in the image itself.

To do that in this template:

1. add the public proxy CA certificate at `harness-config/certs/salambo-egress-proxy-ca.crt`
2. build the image as usual

During build, the Dockerfile will:

- copy that certificate into the system CA trust store
- run `update-ca-certificates`
- also expose the same certificate at `/etc/ssl/certs/salambo-egress-proxy-ca.pem`

That extra stable path is useful when the platform injects compatibility env vars such as `NODE_EXTRA_CA_CERTS`, `REQUESTS_CA_BUNDLE`, or `SSL_CERT_FILE`.
