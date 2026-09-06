# The upstream build environment is pinned by content digest.
FROM --platform=linux/amd64 glondu/beleniosbase:20260425-1@sha256:3d57d508592aa94124473052e0beefcb6c06408fcbb1ded99febd6e70c4e7b62 AS build
COPY --chown=belenios vendor/belenios /home/belenios/source
WORKDIR /home/belenios/source
ENV BELENIOS_BUILD=3.3.0
RUN . /home/belenios/.belenios/env.sh && dune build --release src/tool/main.exe src/web/clients/jslib/belenios_jslib.bc.js
RUN mkdir -p /home/belenios/output && cp _build/default/src/tool/main.exe /home/belenios/output/belenios-tool && cp _build/default/src/web/clients/jslib/belenios_jslib.bc.js /home/belenios/output/belenios.js && cp COPYING /home/belenios/output/COPYING.belenios

FROM --platform=linux/amd64 debian:13-slim
RUN apt-get update -qq && apt-get install -y --no-install-recommends ca-certificates libev4t64 libgmp10 libsodium23 libssl3t64 zlib1g bash jq python3 && rm -rf /var/lib/apt/lists/*
COPY --from=build /home/belenios/output /opt/belenios
ENV PATH=/opt/belenios:$PATH
WORKDIR /work
ENTRYPOINT ["belenios-tool"]
