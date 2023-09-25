#!/bin/bash

pnpm concurrently \
    --prefix none \
    " \
        pnpm \
            --workspace-concurrency=100 \
            --filter @scalar-org/web \
            --filter @scalar-org/react \
            --filter @scalar-org/api-client-proxy \
            --filter @scalar-org/echo-server \
            --filter @scalar-org/fastify-api-reference \
            dev \
    "