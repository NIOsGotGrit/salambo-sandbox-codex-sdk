Place the public Salambo egress proxy CA certificate here as:

`salambo-egress-proxy-ca.crt`

When that file exists, the Docker image build will:

1. install it into the system trust store
2. run `update-ca-certificates`
3. copy it to `/etc/ssl/certs/salambo-egress-proxy-ca.pem`

That lets the sandbox trust the proxy CA at the OS level while also giving the platform a stable file path for runtime fallback env vars.
