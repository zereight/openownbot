# syntax=docker/dockerfile:1
# The OpenOwnBot Docker image: the Linux release, run as a self-hosted server (docs/docker.md). The
# release workflow builds it on a runner of each architecture, from the AppImage of that release,
# after it checks the AppImage against the release checksums:
#
#   docker build --file docker/Dockerfile <folder that has OpenOwnBot.AppImage>
#
# The server scripts and the package list come from the unpacked release, so they always match the
# build that they run.
ARG BASE=ubuntu:24.04@sha256:a853f94d226358a79c740cfc7bce0c289748f3fe3488d921d038ccd752c61b60

FROM ${BASE} AS release
# The static AppImage runtime unpacks itself with no system library. Unpacked, the release needs no FUSE.
COPY OpenOwnBot.AppImage /tmp/OpenOwnBot.AppImage
WORKDIR /tmp
RUN chmod 0700 OpenOwnBot.AppImage \
  && ./OpenOwnBot.AppImage --appimage-extract >/dev/null \
  && chmod -R u+rwX,go=rX squashfs-root \
  && test -x squashfs-root/resources/hosting/openownbot-container

FROM ${BASE}
ARG DEBIAN_FRONTEND=noninteractive
COPY --from=release /tmp/squashfs-root/resources/hosting/packages.txt /tmp/packages.txt
# The packages of a self-hosted server, without AppArmor, which only the host can load. tini is PID 1:
# it reaps the processes that agents leave, and gives the stop signal to OpenOwnBot, which stops them.
# Agents run their commands in this image, so it also has the tools that they use most.
RUN apt-get update \
  && sed -e '/^#/d' -e '/^$/d' -e '/^apparmor$/d' /tmp/packages.txt \
    | xargs apt-get install --yes --no-install-recommends \
      git less openssh-client procps ripgrep tini unzip xz-utils \
  && rm -rf /var/lib/apt/lists/* /tmp/packages.txt
# Not root. The image of Ubuntu has the user ubuntu with the UID 1000, which OpenOwnBot takes. The home
# folder is the data volume.
RUN userdel --remove ubuntu \
  && useradd --uid 1000 --user-group --home-dir /data --create-home --shell /bin/bash openownbot \
  && install -d -o openownbot -g openownbot -m 0700 /run/openownbot
# Mount points of the update folders that docker/instances/compose.yaml gives an instance. Its root
# file system is read-only. With no folders mounted, OpenOwnBot offers no update.
RUN install -d -m 0755 /var/lib/openownbot-update/requests /var/lib/openownbot-update/status
# Root owns the release, so the user and its agents cannot change it. chrome-sandbox has no SUID bit:
# the sandbox uses user namespaces, which the seccomp profile in docker/ permits.
COPY --from=release /tmp/squashfs-root /opt/OpenOwnBot/app
RUN install -d -m 0755 /opt/OpenOwnBot/hosted \
  && printf 'container\n' >/opt/OpenOwnBot/hosted/mode \
  && ln -s /opt/OpenOwnBot/app/resources/hosting/openownbot /usr/local/bin/openownbot

ARG VERSION=unknown
ARG REVISION=unknown
# GitHub links the package to the repository through `source`.
LABEL org.opencontainers.image.title=OpenOwnBot \
  org.opencontainers.image.source=https://github.com/zereight/openownbot \
  org.opencontainers.image.licenses=PolyForm-Noncommercial-1.0.0 \
  org.opencontainers.image.version=${VERSION} \
  org.opencontainers.image.revision=${REVISION}
ENV LANG=C.UTF-8 XDG_RUNTIME_DIR=/run/openownbot
USER openownbot
WORKDIR /data
VOLUME /data
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/OpenOwnBot/app/resources/hosting/openownbot-container"]
