import { omit } from 'lomit'
import {
  DefinitionKind,
  SelectionKind,
  VariableKind,
} from './constants'

/**
 * Return root query object to work against based on if an operationName key
 * is set in operation.
 *
 * @param {Operation} operation
 * @return {Object}
 */
const getRootQuery = (operation) => {
  const { query, operationName } = operation
  return query && query.hasOwnProperty(operationName) ? query[operationName] : query
}

/**
 * Return the root key that will contain the data returned via the GraphQL query.
 *
 * @param {Operation} operation
 * @return {string}
 */
export const getRootKey = (operation) => {
  const definition = getRootQuery(operation).definitions.find(definition => definition.operation === 'query')

  if (definition) {
    const selection = definition.selectionSet.selections.find(selection => selection.name.kind === 'Name')

    if (selection) {
      return selection.name.value
    }
  }

  return null
}

/**
 * Contentful API - Search Parameters
 * @ref https://www.contentful.com/developers/docs/references/content-delivery-api/#/reference/search-parameters
 */
const contentfulReservedParameters = [
  'access_token',
  'id',
  'include',
  'locale',
  'content_type',
  'select',
  'query',
  'links_to_entry',
  'links_to_asset',
  'order',
  'limit',
  'skip',
  'mimetype_group',
  'preview',
]

/**
 * Pass in a GraphQL query variable field and get the equivalent
 * Contentful REST API query argument.
 *
 * @ref https://www.contentful.com/developers/docs/references/content-delivery-api/#/reference/search-parameters/search-on-references
 *
 * @param {string} variableKey
 * @return {string}
 */
const getSearchKey = (variableKey) => {
  if (variableKey.endsWith('_in')) {
    return `fields.${variableKey.replace('_in', '')}[in]`
  }

  if (variableKey.endsWith('_not')) {
    return `fields.${variableKey.replace('_not', '')}[ne]`
  }

  if (variableKey.endsWith('_exists')) {
    return `fields.${variableKey.replace('_exists', '')}[exists]`
  }

  if (variableKey.endsWith('_not_in')) {
    return `fields.${variableKey.replace('_not_in', '')}[nin]`
  }

  // if (variableKey.endsWith('_contains')) {
  //   return `fields.${variableKey.replace('_contains', '')}[?]`
  // }

  // if (variableKey.endsWith('_not_contains')) {
  //   return `fields.${variableKey.replace('_not_contains', '')}[?]`
  // }

  // @todo Add support for `x[all]` - Ryan
  // @todo Add support for `x[match]` - Ryan
  // @todo Add support for `x[gt]` - Ryan
  // @todo Add support for `x[gte]` - Ryan
  // @todo Add support for `x[lt]` - Ryan
  // @todo Add support for `x[lte]` - Ryan
  // @todo Add support for `x[near]` - Ryan
  // @todo Add support for `x[within]` - Ryan

  return `fields.${variableKey}`
}

/**
 * Convert `order` arguments to the expected format that works with the REST API.
 *
 * @param {string} orderValue
 * @return {string}
 */
const getOrderValue = (orderValue) => {
  if (!orderValue || typeof orderValue !== 'string') return orderValue

  // Convert separators to dot notation
  orderValue = orderValue.replace(/_/g, '.')

  // Prepend `fields.` for instances not prefixed by `sys.`
  if (!orderValue.startsWith('sys.')) {
    orderValue = `fields.${orderValue}`
  }

  // Convert ordering direction
  if (orderValue.endsWith('.DESC')) {
    orderValue = `-${orderValue.replace('.DESC', '')}`
  } else if (orderValue.endsWith('.ASC')) {
    orderValue = orderValue.replace('.ASC', '')
  }

  // Convert sys date fields to REST equivalents
  if (orderValue.includes('sys.firstPublishedAt')) {
    orderValue = orderValue.replace('sys.firstPublishedAt', 'sys.createdAt')
  }

  if (orderValue.includes('sys.publishedAt')) {
    orderValue = orderValue.replace('sys.publishedAt', 'sys.updatedAt')
  }

  return orderValue
}

/**
 * Build a map that associates the variables passed into the query
 * with the actual fields/arguments that are being requested in the
 * API request.
 *
 * @param {Object} operation
 * @return {Object}
 */
const buildVariableMap = (operation) => {
  const variableMap = {}

  getRootQuery(operation).definitions
    .filter(definition => definition.kind === DefinitionKind.OperationDefinition)
    .forEach(definition => {
      definition.selectionSet.selections.forEach(selection => {
        selection.arguments.forEach(argument => {
          if (argument.value && argument.value.fields) {
            argument.value.fields.forEach(field => {
              const validField = field.value
                && field.value.name
                && field.value.name.value
                && field.kind
                && field.name
                && field.name.value

              if (validField) {
                variableMap[field.value.name.value] = {
                  kind: field.kind,
                  field: field.name.value,
                }
              }
            })
          } else {
            const validArgument = argument.value
              && argument.value.name
              && argument.value.name.value
              && argument.kind
              && argument.name
              && argument.name.value

            if (validArgument) {
              variableMap[argument.value.name.value] = {
                kind: argument.kind,
                field: argument.name.value,
              }
            }
          }
        })
      })
    })

  return variableMap
}

/**
 * GraphQL queries specify the expected shape of the response from the API,
 * so this method attempts to extract that in a format that we can apply
 * to the parsed REST API response, in order to make sure the response
 * fulfills the contract of the request.
 *
 * @param {Array.<Object>} selectionSet
 * @param {Array.<Object>} definitions
 * @return {Object}
 */
const extractSelections = (selectionSet, definitions) => {
  if (!(
    selectionSet &&
    selectionSet.selections &&
    selectionSet.selections.length
  )) return null

  const selections = {}

  selectionSet.selections.forEach(selection => {
    if (selection.kind === SelectionKind.Field) {
      if (selection.name && selection.name.value) {
        selections[selection.name.value] = extractSelections(
          selection.selectionSet,
          definitions
        )
      }
    } else if (selection.kind === SelectionKind.FragmentSpread) {
      const fragmentDefinition = definitions.find(
        definition =>
          definition.kind === DefinitionKind.FramentDefinition &&
          definition.name &&
          definition.name.value &&
          selection.name &&
          selection.name.value &&
          definition.name.value === selection.name.value
      )
      if (fragmentDefinition) {
        selections[`...${selection.name.value}`] = extractSelections(
          fragmentDefinition.selectionSet,
          definitions
        )
      }
    }
  })

  return selections
}

/**
 *
 *
 * @param {Object} operation
 * @return {Object}
 */
export const buildDefinitionMap = (operation) => {
  const { query } = operation

  const operationDefinition = query.definitions.find(
    definition => definition.kind === DefinitionKind.OperationDefinition
  )

  if (!(
    operationDefinition &&
    operationDefinition.name &&
    operationDefinition.name.value
  )) {
    return {}
  }

  return {
    [operationDefinition.name.value]: extractSelections(operationDefinition.selectionSet, query.definitions)
  }
}

/**
 * Convert the query variables to a format the Contentful API understands
 *
 * @param {Object} query
 * @param {Object} variables
 * @param {Object} variableMap
 * @param {string} operationName
 * @retrun {Object}
 */
export const parseQueryVariables = (operation) => {
  const { variables } = operation
  const variableMap = buildVariableMap(operation)

  const operationDefinition = getRootQuery(operation)
    .definitions
    .find(definition => definition.kind === DefinitionKind.OperationDefinition)

  const operationVariables = operationDefinition
    .variableDefinitions
    .map(variableDefinition => variableDefinition.variable.name.value)

  const operationArguments = operationDefinition
    .selectionSet
    .selections[0].arguments.map(argument => {
      let value = null

      if (!argument?.name?.value) {
        return null
      }

      switch (argument?.value?.kind) {
        // @todo Add case for 'ObjectField' - Ryan
        // @todo Add case for 'ObjectValue' - Ryan
        case 'ListValue':
          value = (argument?.value?.values ?? []).map((argumentValue) => {
            switch (argument?.name?.value) {
              case 'order':
                return getOrderValue(argumentValue?.value)

              default:
                return argumentValue?.value
            }
          }).join(',')
          break

        case 'BooleanValue':
        case 'EnumValue':
        case 'FloatValue':
        case 'IntValue':
        case 'StringValue':
          value = argument?.value?.value
          break

        case 'Variable':
          value = argument?.value?.name?.value
          break

        default:
          break
      }

      if (!value) {
        return null
      }

      return { [argument.name.value]: value }
    })
    .filter((item) => !!item)
    .reduce((acc, cur) => {
      return { ...acc, ...cur }
    }, {})

  const operationQueries = Object.keys(variableMap)
    .filter(variableKey => {
      return variables &&
        variables.hasOwnProperty(variableKey) &&
        variableMap &&
        variableMap.hasOwnProperty(variableKey)
    })
    .map(variableKey => {
      try {
        switch (variableMap[variableKey].kind) {
          case VariableKind.Argument:
            // If the variable key is known search parameter for the Contentful API,
            // just pass it through un-parsed
            const fieldExists = variableMap[variableKey] && variableMap[variableKey].field
            if (fieldExists && contentfulReservedParameters.includes(variableMap[variableKey].field)) {
              // Exclude preview variable is not set to true
              if (variableMap[variableKey].field === 'preview' && !variables[variableKey]) {
                return null
              }

              if (variableMap[variableKey].field === 'order') {
                return { [variableMap[variableKey].field]: variables[variableKey]
                  .map(orderVariable => getOrderValue(orderVariable))
                  .join(',')
                }
              }

              if (variableMap[variableKey].field === 'where') {
                // @todo Spread out arguments defined in `where` field - Ryan
              }

              return { [variableMap[variableKey].field]: variables[variableKey] }
            }
            break

          case VariableKind.ObjectField:
            // Convert variable into query format supported in Contentful API
            const queryKey = getSearchKey(variableMap[variableKey].field)
            return { [queryKey]: variables[variableKey] }

          default:
            return null
        }
      } catch (err) {
        console.error(err)
        return null
      }
    })
    .filter(variable => !!variable)
    .reduce((acc, cur) => {
      return {...acc, ...cur }
    }, {})

  return {
    ...operationArguments,
    ...operationQueries,
    ...omit(variables, operationVariables)
  }
}
