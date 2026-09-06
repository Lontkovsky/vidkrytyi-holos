# The upstream build environment is pinned by content digest.
FROM --platform=linux/amd64 glondu/beleniosbase:20260425-1@sha256:3d57d508592aa94124473052e0beefcb6c06408fcbb1ded99febd6e70c4e7b62 AS build
COPY --chown=belenios vendor/belenios /home/belenios/source
WORKDIR /home/belenios/source
ENV BELENIOS_BUILD=3.3.0
RUN . /home/belenios/.belenios/env.sh && dune build --release src/tool/main.exe src/web/static/belenios_jslib.js
RUN mkdir -p /home/belenios/output && cp _build/default/src/tool/main.exe /home/belenios/output/belenios-tool && cp _build/default/src/web/static/belenios_jslib.js /home/belenios/output/belenios.js && cp vendor/libsodium/libsodium.wasm /home/belenios/output/ && cp vendor/libsodium/LICENSE /home/belenios/output/LICENSE.libsodium && cp COPYING /home/belenios/output/COPYING.belenios
COPY --chown=belenios tools/native /home/belenios/source/src/openvote_share
RUN . /home/belenios/.belenios/env.sh && dune build --release src/openvote_share/share_verify.exe && cp _build/default/src/openvote_share/share_verify.exe /home/belenios/output/openvote-share-verify

FROM --platform=linux/amd64 debian:13-slim@sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132
RUN apt-get update -qq && apt-get install -y --no-install-recommends ca-certificates libev4t64 libgmp10 libsodium23 libssl3t64 zlib1g bash jq python3 && rm -rf /var/lib/apt/lists/*
COPY --from=build /home/belenios/output /opt/belenios
COPY LICENSE /opt/belenios/LICENSE.openvote
ENV PATH=/opt/belenios:$PATH
WORKDIR /work
ENTRYPOINT ["belenios-tool"]
