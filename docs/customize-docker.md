# Customize Docker

The Docker image is meant to be edited through the `docker/` folder first.

Primary entrypoints:

- `docker/apt-packages.txt`
- `docker/npm-tools.txt`
- `docker/bootstrap.sh`
- `Dockerfile`

Use them for:

- apt packages
- global CLI tools
- one-off image bootstrap steps
- deeper image changes when the text lists are not enough
