import ejs from 'ejs'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import fs from 'fs'
import path from 'path'

export type ApiReferenceOptions = {
  /**
   * Prefix for the registered route
   *
   * @default '/'
   */
  routePrefix: string
  apiReference?: {
    specUrl?: string
    spec?: Record<string, any> | (() => Record<string, any>)
    title?: string
  }
}

// This Schema is used to hide the route from the documentation.
// https://github.com/fastify/fastify-swagger#hide-a-route
const schemaToHideRoute = {
  hide: true,
}

const fastifyApiReference: FastifyPluginAsync<ApiReferenceOptions> = async (
  fastify,
  options,
) => {
  const hasSwaggerPlugin = fastify.hasPlugin('@fastify/swagger')

  if (
    !options.apiReference?.spec &&
    !options.apiReference?.specUrl &&
    !hasSwaggerPlugin
  ) {
    console.warn(
      '[@scalar/fastify-api-reference] You didn’t provide a spec or specUrl and @fastify/swagger could not be find either. Please provide one of these options.',
    )

    return
  }

  fastify.route({
    method: 'GET',
    url: options.routePrefix ?? '/',
    // We don’t know whether @fastify/swagger is registered, but it doesn’t hurt to add a schema anyway.
    // @ts-ignore
    schema: schemaToHideRoute,
    async handler(_, reply) {
      reply.header('Content-Type', 'text/html; charset=utf-8')

      let mergedOptions = options

      if (
        !options.apiReference?.spec &&
        !options.apiReference?.specUrl &&
        hasSwaggerPlugin
      ) {
        mergedOptions = {
          ...options,
          apiReference: {
            ...options.apiReference,
            // @ts-ignore
            spec: () => fastify.swagger(),
          },
        }
      }

      const html = await ejs.renderFile(
        path.resolve(`${__dirname}/../dist/templates/index.ejs`),
        {
          options: mergedOptions,
        },
      )

      reply.send(html)
    },
  })

  fastify.route({
    method: 'GET',
    url: (options.routePrefix ?? '/') + '/fastify-api-reference.js',
    // We don’t know whether @fastify/swagger is registered, but it doesn’t hurt to add a schema anyway.
    // @ts-ignore
    schema: schemaToHideRoute,
    async handler(_, reply) {
      reply.header('Content-Type', 'application/javascript; charset=utf-8')

      const content = fs.readFileSync(
        path.resolve(`${__dirname}/../dist/templates/fastify-api-reference.js`),
        'utf8',
      )

      reply.send(content)
    },
  })
}

export default fp(fastifyApiReference)
