import { ApolloLink, Observable } from '@apollo/client'
import { omit } from 'lomit'
import { graphql } from 'graphql-anywhere/lib/async'
import { contentfulResolver, graphqlParser } from 'contentful-parsers'
const contentful = require('contentful')
import { buildDefinitionMap, getRootKey, parseQueryVariables } from './utils'

/**
 * ApolloLink instance that allows for queries to be performed against
 * the Contentful REST API.
 *
 * @returns {ContentfulRestLink}
 */
export class ContentfulRestLink extends ApolloLink {
  constructor(clientOptions, queryDefaults = {}) {
    super()

    this.clientOptions = clientOptions
    this.queryDefaults = queryDefaults

    // Create Delivery Client
    this.client = contentful.createClient({
      ...omit(clientOptions, ['previewAccessToken']),
    })

    // Create Preview Client, if required options are passed
    if (clientOptions.hasOwnProperty('previewAccessToken') && clientOptions.previewAccessToken) {
      this.previewClient = contentful.createClient({
        ...omit(clientOptions, ['previewAccessToken']),
        accessToken: clientOptions.previewAccessToken,
        host: 'preview.contentful.com',
      })
    }
  }

  /**
   *
   *
   * @param {Operation} operation
   * @param {NextLink} forward
   * @return {Observable<FetchResult> | null}
   */
  request(operation, forward) {
    const { query, operationName } = operation

    console.debug(JSON.stringify(operation))

    const obs = forward
      ? forward(operation)
      : Observable.of({ data: {} })

    return obs.flatMap(({ data, errors }) => new Observable(observer => {
      // Find name to apply as root field of the GraphQL data
      const rootKey = getRootKey(operation)

      // Set queryArgs based on variables/queryMethod
      const queryVariables = parseQueryVariables(operation)

      // Define the query method to use based on variables
      const queryMethod = queryVariables && queryVariables.hasOwnProperty('id')
        ? 'getEntry'
        : 'getEntries'

      // Define query arguments based on the set method
      const queryArgs = queryMethod === 'getEntry'
        ? [queryVariables.id, { ...this.queryDefaults, ...omit(queryVariables, ['id', 'preview']) }]
        : [{
            ...this.queryDefaults,
            ...omit(queryVariables, ['preview']),
            content_type: rootKey.replace('Collection', '')
          }]

      // Choose client based on `preview` variable
      const usePreview = this.previewClient
        && queryVariables
        && queryVariables.hasOwnProperty('preview')
        && queryVariables.preview
      const client = usePreview ? this.previewClient : this.client

      console.debug(queryVariables)

      // Contentful query
      client[queryMethod](...queryArgs)
        .then(contentfulData => {
          // Build definitionMap to supply expected shape of GraphQL query response
          const definitionMap = buildDefinitionMap(operation)

          // Parse Contentful data to expected GraphQL shape
          const parsedData = graphqlParser(
            rootKey,
            contentfulData,
            definitionMap[operationName]
          )

          // Query contentfulData via GraphQL query
          graphql(
            contentfulResolver,
            query,
            parsedData,
          )
            .then(data => {
              observer.next({ data, errors })
              observer.complete()
            })
            .catch(error => console.error(error))
        })
        .catch(error => {
          observer.error(error)
        })
    }))
  }
}
