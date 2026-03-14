# Customize Docker

The Docker image is meant to be edited through the `sandbox/docker/` folder first.

Primary entrypoints:

- `sandbox/docker/apt-packages.txt`
- `sandbox/docker/npm-tools.txt`
- `sandbox/docker/bootstrap.sh`
- `Dockerfile`

Use them for:

- apt packages
- global CLI tools
- one-off image bootstrap steps
- deeper image changes when the text lists are not enough
