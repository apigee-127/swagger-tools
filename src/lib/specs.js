/* eslint-disable default-case, prefer-rest-params */
/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

const _ = require('lodash');
const async = require('async');
const JsonRefs = require('json-refs');
const SparkMD5 = require('spark-md5');
let swaggerConverter = require('swagger-converter');
const traverse = require('traverse');
const YAML = require('js-yaml');
const validators = require('./validators');
const helpers = require('./helpers');

const apiDeclarationJson = require('../schemas/1.2/apiDeclaration.json');
const authorizationObjectJson = require('../schemas/1.2/authorizationObject.json');
const dataTypeJson = require('../schemas/1.2/dataType.json');
const dataTypeBaseJson = require('../schemas/1.2/dataTypeBase.json');
const infoObjectJson = require('../schemas/1.2/infoObject.json');
const modelsObjectJson = require('../schemas/1.2/modelsObject.json');
const oauth2GrantTypeJson = require('../schemas/1.2/oauth2GrantType.json');
const operationObjectJson = require('../schemas/1.2/operationObject.json');
const parameterObjectJson = require('../schemas/1.2/parameterObject.json');
const resourceListingJson = require('../schemas/1.2/resourceListing.json');
const resourceObjectJson = require('../schemas/1.2/resourceObject.json');
const schema20 = require('../schemas/2.0/schema.json');

// Work around swagger-converter packaging issue (Browser builds only)
if (_.isPlainObject(swaggerConverter)) {
  swaggerConverter = global.SwaggerConverter.convert;
}

const documentCache = {};

const sanitizeRef = (version, ref) => {
  return version !== '1.2' ? ref : ref.replace('#/models/', '');
};

const swagger1RefPreProcesor = obj => {
  const pObj = _.cloneDeep(obj);

  pObj.$ref = `#/models/${obj.$ref}`;

  return pObj;
};

const validOptionNames = _.map(helpers.swaggerOperationMethods, method => {
  return method.toLowerCase();
});

const isRemotePtr = refDetails => {
  return ['relative', 'remote'].indexOf(refDetails.type) > -1;
};

const createErrorOrWarning = (code, message, path, dest) => {
  dest.push({
    code,
    message,
    path,
  });
};

const addReference = (
  cacheEntry,
  defPathOrPtr,
  refPathOrPtr,
  results,
  omitError,
) => {
  let result = true;
  const swaggerVersion = helpers.getSwaggerVersion(cacheEntry.resolved);
  const defPath = _.isArray(defPathOrPtr)
    ? defPathOrPtr
    : JsonRefs.pathFromPtr(defPathOrPtr);
  const defPtr = _.isArray(defPathOrPtr)
    ? JsonRefs.pathToPtr(defPathOrPtr)
    : defPathOrPtr;
  const refPath = _.isArray(refPathOrPtr)
    ? refPathOrPtr
    : JsonRefs.pathFromPtr(refPathOrPtr);
  const refPtr = _.isArray(refPathOrPtr)
    ? JsonRefs.pathToPtr(refPathOrPtr)
    : refPathOrPtr;
  let code;
  let def;
  let i;
  let msgPrefix;

  def = cacheEntry.definitions[defPtr];
  const type = defPath[0];
  code =
    type === 'securityDefinitions'
      ? 'SECURITY_DEFINITION'
      : type.substring(0, type.length - 1).toUpperCase();
  const displayId =
    swaggerVersion === '1.2' ? defPath[defPath.length - 1] : defPtr;
  msgPrefix =
    type === 'securityDefinitions'
      ? 'Security definition'
      : code.charAt(0) + code.substring(1).toLowerCase();

  // This is an authorization scope reference
  if (
    ['authorizations', 'securityDefinitions'].indexOf(defPath[0]) > -1 &&
    defPath[2] === 'scopes'
  ) {
    code += '_SCOPE';
    msgPrefix += ' scope';
  }

  // If the reference was not found and this is not an authorization/security scope reference, attempt to find a
  // parent object to add the reference too.  (Issue 176)
  if (
    _.isUndefined(def) &&
    ['AUTHORIZATION_SCOPE', 'SECURITY_DEFINITION_SCOPE'].indexOf(code) === -1
  ) {
    // Attempt to find the definition in case the reference is to a path within a definition`
    for (i = 1; i < defPath.length; i += 1) {
      const pPath = defPath.slice(0, defPath.length - i);
      const pPtr = JsonRefs.pathToPtr(pPath);
      const pDef = cacheEntry.definitions[pPtr];

      if (!_.isUndefined(pDef)) {
        def = pDef;

        break;
      }
    }
  }

  if (_.isUndefined(def)) {
    if (!omitError) {
      if (
        cacheEntry.swaggerVersion !== '1.2' &&
        ['SECURITY_DEFINITION', 'SECURITY_DEFINITION_SCOPE'].indexOf(code) ===
          -1
      ) {
        refPath.push('$ref');
      }

      createErrorOrWarning(
        `UNRESOLVABLE_${code}`,
        `${msgPrefix} could not be resolved: ${displayId}`,
        refPath,
        results.errors,
      );
    }

    result = false;
  } else {
    if (_.isUndefined(def.references)) {
      def.references = [];
    }

    def.references.push(refPtr);
  }

  return result;
};

const getOrComposeSchema = (documentMetadata, modelId) => {
  const title = `Composed ${
    documentMetadata.swaggerVersion === '1.2'
      ? JsonRefs.pathFromPtr(modelId).pop()
      : modelId
  }`;
  const metadata = documentMetadata.definitions[modelId];
  const originalT = traverse(documentMetadata.original);
  const resolvedT = traverse(documentMetadata.resolved);
  let composed;

  if (!metadata) {
    return undefined;
  }

  const original = _.cloneDeep(originalT.get(JsonRefs.pathFromPtr(modelId)));
  composed = _.cloneDeep(resolvedT.get(JsonRefs.pathFromPtr(modelId)));

  // Convert the Swagger 1.2 document to a valid JSON Schema file
  if (documentMetadata.swaggerVersion === '1.2') {
    // Create inheritance model
    if (metadata.lineage.length > 0) {
      composed.allOf = [];

      _.each(metadata.lineage, eachModelId => {
        composed.allOf.push(getOrComposeSchema(documentMetadata, eachModelId));
      });
    }

    // Remove the subTypes property
    delete composed.subTypes;

    _.each(composed.properties, (origProperty, name) => {
      const property = origProperty;
      const oProp = original.properties[name];

      // Convert the string values to numerical values
      _.each(['maximum', 'minimum'], prop => {
        if (_.isString(property[prop])) {
          property[prop] = parseFloat(property[prop]);
        }
      });

      _.each(
        JsonRefs.findRefs(oProp, {
          includeInvalid: true,
          refPreProcessor: swagger1RefPreProcesor,
        }),
        (refDetails, refPtr) => {
          const dMetadata = documentMetadata.definitions[refDetails.uri];
          const path = JsonRefs.pathFromPtr(refPtr);

          if (dMetadata.lineage.length > 0) {
            traverse(property).set(
              path,
              getOrComposeSchema(documentMetadata, refDetails.uri),
            );
          } else {
            traverse(property).set(
              path.concat('title'),
              `Composed ${sanitizeRef(
                documentMetadata.swaggerVersion,
                refDetails.uri,
              )}`,
            );
          }
        },
      );
    });
  }

  // Scrub id properties
  composed = traverse(composed).map(function traverseMap(val) {
    if (this.key === 'id' && _.isString(val)) {
      this.remove();
    }
    return undefined;
  });

  composed.title = title;

  return composed;
};

const createUnusedErrorOrWarning = (val, codeSuffix, msgPrefix, path, dest) => {
  createErrorOrWarning(
    `UNUSED_${codeSuffix}`,
    `${msgPrefix} is defined but is not used: ${val}`,
    path,
    dest,
  );
};

const getDocumentCache = apiDOrSO => {
  const key = SparkMD5.hash(JSON.stringify(apiDOrSO));
  let cacheEntry;
  if (documentCache[key]) {
    cacheEntry = documentCache[key];
  } else {
    cacheEntry = _.find(documentCache, docEntry => {
      return docEntry.resolvedId === key;
    });
  }

  if (!cacheEntry) {
    documentCache[key] = {
      definitions: {},
      original: apiDOrSO,
      resolved: undefined,
      swaggerVersion: helpers.getSwaggerVersion(apiDOrSO),
    };
    cacheEntry = documentCache[key];
  }

  return cacheEntry;
};

const handleValidationError = (results, callback) => {
  const err = new Error('The Swagger document(s) are invalid');

  err.errors = results.errors;
  err.failedValidation = true;
  err.warnings = results.warnings;

  if (results.apiDeclarations) {
    err.apiDeclarations = results.apiDeclarations;
  }

  callback(err);
};

const normalizePath = path => {
  const matches = path.match(/\{(.*?)\}/g);
  const argNames = [];
  let normPath = path;

  if (matches) {
    _.each(matches, (match, index) => {
      normPath = normPath.replace(match, `{${index}}`);
      argNames.push(match.replace(/[{}]/g, ''));
    });
  }

  return {
    path: normPath,
    args: argNames,
  };
};

const removeCirculars = obj => {
  function walk(ancestors, node, path) {
    function walkItem(item, segment) {
      path.push(segment);
      walk(ancestors, item, path);
      path.pop();
    }

    // We do not process circular objects again
    if (ancestors.indexOf(node) === -1) {
      ancestors.push(node);

      if (_.isArray(node)) {
        _.each(node, (member, index) => {
          walkItem(member, index.toString());
        });
      } else if (_.isPlainObject(node)) {
        _.forOwn(node, (member, key) => {
          walkItem(member, key.toString());
        });
      }
    } else {
      _.set(obj, path, {});
    }

    ancestors.pop();
  }

  walk([], obj, []);
};

const validateNoExist = (data, val, codeSuffix, msgPrefix, path, dest) => {
  if (!_.isUndefined(data) && data.indexOf(val) > -1) {
    createErrorOrWarning(
      `DUPLICATE_${codeSuffix}`,
      `${msgPrefix} already defined: ${val}`,
      path,
      dest,
    );
  }
};

const validateSchemaConstraints = (
  documentMetadata,
  schema,
  path,
  results,
  skip,
) => {
  try {
    validators.validateSchemaConstraints(
      documentMetadata.swaggerVersion,
      schema,
      path,
      undefined,
    );
  } catch (err) {
    if (!skip) {
      createErrorOrWarning(err.code, err.message, err.path, results.errors);
    }
  }
};

const processDocument = (origDocumentMetadata, results) => {
  const documentMetadata = origDocumentMetadata;
  const { swaggerVersion } = documentMetadata;

  const getDefinitionMetadata = (defPath, inline) => {
    const defPtr = JsonRefs.pathToPtr(defPath);
    let metadata = documentMetadata.definitions[defPtr];

    if (!metadata) {
      documentMetadata.definitions[defPtr] = {
        inline: inline || false,
        references: [],
      };
      metadata = documentMetadata.definitions[defPtr];

      // For model definitions, add the inheritance properties
      if (
        ['definitions', 'models'].indexOf(JsonRefs.pathFromPtr(defPtr)[0]) > -1
      ) {
        metadata.cyclical = false;
        metadata.lineage = undefined;
        metadata.parents = [];
      }
    }

    return metadata;
  };

  const getDisplayId = id => {
    return swaggerVersion === '1.2' ? JsonRefs.pathFromPtr(id).pop() : id;
  };

  const jsonRefsOptions = {
    filter: 'local',
    includeInvalid: true,
  };

  const walk = (root, id, lineage) => {
    const definition = documentMetadata.definitions[id || root];

    if (definition) {
      _.each(definition.parents, parent => {
        lineage.push(parent);

        if (root !== parent) {
          walk(root, parent, lineage);
        }
      });
    }
  };

  const authDefsProp =
    swaggerVersion === '1.2' ? 'authorizations' : 'securityDefinitions';
  const modelDefsProp = swaggerVersion === '1.2' ? 'models' : 'definitions';

  // Process authorization definitions
  _.each(documentMetadata.resolved[authDefsProp], (authorization, name) => {
    const securityDefPath = [authDefsProp, name];

    // Swagger 1.2 only has authorization definitions in the Resource Listing
    if (swaggerVersion === '1.2' && !authorization.type) {
      return;
    }

    // Create the authorization definition metadata
    getDefinitionMetadata(securityDefPath);

    _.reduce(
      authorization.scopes,
      (seenScopes, scope, indexOrName) => {
        const scopeName = swaggerVersion === '1.2' ? scope.scope : indexOrName;
        const scopeDefPath = securityDefPath.concat([
          'scopes',
          indexOrName.toString(),
        ]);
        const scopeMetadata = getDefinitionMetadata(
          securityDefPath.concat(['scopes', scopeName]),
        );

        scopeMetadata.scopePath = scopeDefPath;

        // Identify duplicate authorization scope defined in the Resource Listing
        validateNoExist(
          seenScopes,
          scopeName,
          'AUTHORIZATION_SCOPE_DEFINITION',
          'Authorization scope definition',
          swaggerVersion === '1.2'
            ? scopeDefPath.concat('scope')
            : scopeDefPath,
          results.warnings,
        );

        seenScopes.push(scopeName);

        return seenScopes;
      },
      [],
    );
  });

  // Process model definitions
  _.each(documentMetadata.resolved[modelDefsProp], (model, modelId) => {
    const modelDefPath = [modelDefsProp, modelId];
    const modelMetadata = getDefinitionMetadata(modelDefPath);

    // Identify model id mismatch (Id in models object is not the same as the model's id in the models object)
    if (swaggerVersion === '1.2' && modelId !== model.id) {
      createErrorOrWarning(
        'MODEL_ID_MISMATCH',
        `Model id does not match id in models object: ${model.id}`,
        modelDefPath.concat('id'),
        results.errors,
      );
    }

    // Do not reprocess parents/references if already processed
    if (_.isUndefined(modelMetadata.lineage)) {
      // Handle inheritance references
      switch (swaggerVersion) {
        case '1.2':
          _.each(model.subTypes, (subType, index) => {
            const subPath = ['models', subType];
            const subPtr = JsonRefs.pathToPtr(subPath);
            let subMetadata = documentMetadata.definitions[subPtr];
            const refPath = modelDefPath.concat(['subTypes', index.toString()]);

            // If the metadata does not yet exist, create it
            if (
              !subMetadata &&
              documentMetadata.resolved[modelDefsProp][subType]
            ) {
              subMetadata = getDefinitionMetadata(subPath);
            }

            // If the reference is valid, add the parent
            if (addReference(documentMetadata, subPath, refPath, results)) {
              subMetadata.parents.push(JsonRefs.pathToPtr(modelDefPath));
            }
          });

          break;

        default:
          _.each(
            documentMetadata.original[modelDefsProp][modelId].allOf,
            (schema, index) => {
              let isInline = false;
              let parentPath;

              if (
                _.isUndefined(schema.$ref) ||
                isRemotePtr(JsonRefs.getRefDetails(schema))
              ) {
                isInline = true;
                parentPath = modelDefPath.concat(['allOf', index.toString()]);
              } else {
                parentPath = JsonRefs.pathFromPtr(schema.$ref);
              }

              // If the parent model does not exist, do not create its metadata
              if (
                !_.isUndefined(
                  traverse(documentMetadata.resolved).get(parentPath),
                )
              ) {
                // Create metadata for parent
                getDefinitionMetadata(parentPath, isInline);

                modelMetadata.parents.push(JsonRefs.pathToPtr(parentPath));
              }
            },
          );

          break;
      }
    }
  });

  switch (swaggerVersion) {
    case '2.0':
      // Process parameter definitions
      _.each(documentMetadata.resolved.parameters, (parameter, name) => {
        const path = ['parameters', name];

        getDefinitionMetadata(path);

        validateSchemaConstraints(documentMetadata, parameter, path, results);
      });

      // Process response definitions
      _.each(documentMetadata.resolved.responses, (response, name) => {
        const path = ['responses', name];

        getDefinitionMetadata(path);

        validateSchemaConstraints(documentMetadata, response, path, results);
      });

      break;
  }

  // Validate definition/models (Inheritance, property definitions, ...)
  _.each(documentMetadata.definitions, (origMetadata, id) => {
    const metadata = origMetadata;

    const defPath = JsonRefs.pathFromPtr(id);
    const definition = traverse(documentMetadata.original).get(defPath);
    const defProp = defPath[0];
    const code = defProp.substring(0, defProp.length - 1).toUpperCase();
    const msgPrefix = code.charAt(0) + code.substring(1).toLowerCase();
    let lineage;

    // The only checks we perform below are inheritance checks so skip all non-model definitions
    if (['definitions', 'models'].indexOf(defProp) === -1) {
      return;
    }

    const dProperties = [];
    const iProperties = [];
    lineage = metadata.lineage;

    // Do not reprocess lineage if already processed
    if (_.isUndefined(lineage)) {
      lineage = [];

      walk(id, undefined, lineage);

      // Root > next > ...
      lineage.reverse();

      metadata.lineage = _.cloneDeep(lineage);

      metadata.cyclical = lineage.length > 1 && lineage[0] === id;
    }

    // Swagger 1.2 does not allow multiple inheritance while Swagger 2.0+ does
    if (metadata.parents.length > 1 && swaggerVersion === '1.2') {
      createErrorOrWarning(
        `MULTIPLE_${code}_INHERITANCE`,
        `Child ${code.toLowerCase()} is sub type of multiple models: ${_.map(
          metadata.parents,
          parent => {
            return getDisplayId(parent);
          },
        ).join(' && ')}`,
        defPath,
        results.errors,
      );
    }

    if (metadata.cyclical) {
      createErrorOrWarning(
        `CYCLICAL_${code}_INHERITANCE`,
        `${msgPrefix} has a circular inheritance: ${_.map(lineage, dep => {
          return getDisplayId(dep);
        }).join(' -> ')} -> ${getDisplayId(id)}`,
        defPath.concat(swaggerVersion === '1.2' ? 'subTypes' : 'allOf'),
        results.errors,
      );
    }

    // Remove self reference from the end of the lineage (Front too if cyclical)
    _.each(lineage.slice(metadata.cyclical ? 1 : 0), lineageId => {
      const pModel = traverse(documentMetadata.resolved).get(
        JsonRefs.pathFromPtr(lineageId),
      );

      _.each(Object.keys(pModel.properties || {}), name => {
        if (iProperties.indexOf(name) === -1) {
          iProperties.push(name);
        }
      });
    });

    // Validate simple definitions
    validateSchemaConstraints(documentMetadata, definition, defPath, results);

    // Identify redeclared properties
    _.each(definition.properties, (property, name) => {
      const pPath = defPath.concat(['properties', name]);

      // Do not process unresolved properties
      if (!_.isUndefined(property)) {
        validateSchemaConstraints(documentMetadata, property, pPath, results);

        if (iProperties.indexOf(name) > -1) {
          createErrorOrWarning(
            `CHILD_${code}_REDECLARES_PROPERTY`,
            `Child ${code.toLowerCase()} declares property already declared by ancestor: ${name}`,
            pPath,
            results.errors,
          );
        } else {
          dProperties.push(name);
        }
      }
    });

    // Identify missing required properties
    _.each(definition.required || [], (name, index) => {
      const type = swaggerVersion === '1.2' ? 'Model' : 'Definition';

      if (
        iProperties.indexOf(name) === -1 &&
        dProperties.indexOf(name) === -1
      ) {
        createErrorOrWarning(
          `MISSING_REQUIRED_${type.toUpperCase()}_PROPERTY`,
          `${type} requires property but it is not defined: ${name}`,
          defPath.concat(['required', index.toString()]),
          results.errors,
        );
      }
    });
  });

  if (documentMetadata.swaggerVersion === '1.2') {
    jsonRefsOptions.refPreProcessor = swagger1RefPreProcesor;
  }

  // Process local references
  _.each(
    JsonRefs.findRefs(documentMetadata.original, jsonRefsOptions),
    (refDetails, refPtr) => {
      addReference(documentMetadata, refDetails.uri, refPtr, results);
    },
  );

  // Process invalid references
  _.each(documentMetadata.referencesMetadata, (refDetails, refPtr) => {
    if (isRemotePtr(refDetails) && refDetails.missing === true) {
      results.errors.push({
        code: 'UNRESOLVABLE_REFERENCE',
        message: `Reference could not be resolved: ${sanitizeRef(
          documentMetadata.swaggerVersion,
          refDetails.uri,
        )}`,
        path: JsonRefs.pathFromPtr(refPtr).concat('$ref'),
      });
    }
  });
};

const validateExist = (data, val, codeSuffix, msgPrefix, path, dest) => {
  if (!_.isUndefined(data) && data.indexOf(val) === -1) {
    createErrorOrWarning(
      `UNRESOLVABLE_${codeSuffix}`,
      `${msgPrefix} could not be resolved: ${val}`,
      path,
      dest,
    );
  }
};

const processAuthRefs = (documentMetadata, authRefs, path, results) => {
  const code =
    documentMetadata.swaggerVersion === '1.2'
      ? 'AUTHORIZATION'
      : 'SECURITY_DEFINITION';
  const msgPrefix =
    code === 'AUTHORIZATION' ? 'Authorization' : 'Security definition';

  if (documentMetadata.swaggerVersion === '1.2') {
    _.reduce(
      authRefs,
      (seenNames, scopes, name) => {
        const authPtr = ['authorizations', name];
        const aPath = path.concat([name]);

        // Add reference or record unresolved authorization
        if (addReference(documentMetadata, authPtr, aPath, results)) {
          _.reduce(
            scopes,
            (seenScopes, scope, index) => {
              const sPath = aPath.concat(index.toString(), 'scope');
              const sPtr = authPtr.concat(['scopes', scope.scope]);

              validateNoExist(
                seenScopes,
                scope.scope,
                `${code}_SCOPE_REFERENCE`,
                `${msgPrefix} scope reference`,
                sPath,
                results.warnings,
              );

              // Add reference or record unresolved authorization scope
              addReference(documentMetadata, sPtr, sPath, results);

              return seenScopes.concat(scope.scope);
            },
            [],
          );
        }

        return seenNames.concat(name);
      },
      [],
    );
  } else {
    _.reduce(
      authRefs,
      (seenNames, allScopes, index) => {
        _.each(allScopes, (scopes, name) => {
          const authPtr = ['securityDefinitions', name];
          const authRefPath = path.concat(index.toString(), name);

          // Ensure the security definition isn't referenced more than once (Swagger 2.0+)
          validateNoExist(
            seenNames,
            name,
            `${code}_REFERENCE`,
            `${msgPrefix} reference`,
            authRefPath,
            results.warnings,
          );

          seenNames.push(name);

          // Add reference or record unresolved authorization
          if (addReference(documentMetadata, authPtr, authRefPath, results)) {
            _.each(scopes, (scope, idx) => {
              // Add reference or record unresolved authorization scope
              const sPtr = authPtr.concat(['scopes', scope]);
              addReference(
                documentMetadata,
                sPtr,
                authRefPath.concat(idx.toString()),
                results,
              );
            });
          }
        });

        return seenNames;
      },
      [],
    );
  }
};

const resolveRefs = (apiDOrSO, callback) => {
  const cacheEntry = getDocumentCache(apiDOrSO);
  const swaggerVersion = helpers.getSwaggerVersion(apiDOrSO);
  const jsonRefsOptions = {
    includeInvalid: true,
    loaderOptions: {
      processContent(res, processContentCallback) {
        processContentCallback(undefined, YAML.safeLoad(res.text));
      },
    },
  };

  if (!cacheEntry.resolved) {
    // For Swagger 1.2, we have to create real JSON References
    if (swaggerVersion === '1.2') {
      jsonRefsOptions.refPreProcessor = swagger1RefPreProcesor;
    }

    // Resolve references
    JsonRefs.resolveRefs(apiDOrSO, jsonRefsOptions)
      .then(results => {
        removeCirculars(results.resolved);

        // Fix circular references
        _.each(results.refs, (refDetails, refPtr) => {
          if (refDetails.circular) {
            _.set(results.resolved, JsonRefs.pathFromPtr(refPtr), {});
          }
        });

        cacheEntry.referencesMetadata = results.refs;
        cacheEntry.resolved = results.resolved;
        cacheEntry.resolvedId = SparkMD5.hash(JSON.stringify(results.resolved));

        callback();
      })
      .catch(callback);
  } else {
    callback();
  }
};

function validateAgainstSchema(spec, schemaOrName, data, callback) {
  const validator = _.isString(schemaOrName)
    ? spec.validators[schemaOrName]
    : helpers.createJsonValidator();

  helpers.registerCustomFormats(data);

  try {
    validators.validateAgainstSchema(schemaOrName, data, validator);
  } catch (err) {
    if (err.failedValidation) {
      return callback(undefined, err.results);
    }
    return callback(err);
  }

  return resolveRefs(data, err => {
    return callback(err);
  });
}

function validateDefinitions(documentMetadata, results) {
  // Validate unused definitions
  _.each(documentMetadata.definitions, (metadata, id) => {
    let defPath = JsonRefs.pathFromPtr(id);
    const defType = defPath[0].substring(0, defPath[0].length - 1);
    const displayId =
      documentMetadata.swaggerVersion === '1.2'
        ? defPath[defPath.length - 1]
        : id;
    let code =
      defType === 'securityDefinition'
        ? 'SECURITY_DEFINITION'
        : defType.toUpperCase();
    let msgPrefix =
      defType === 'securityDefinition'
        ? 'Security definition'
        : defType.charAt(0).toUpperCase() + defType.substring(1);

    if (metadata.references.length === 0 && !metadata.inline) {
      // Swagger 1.2 authorization scope
      if (metadata.scopePath) {
        code += '_SCOPE';
        msgPrefix += ' scope';
        defPath = metadata.scopePath;
      }

      createUnusedErrorOrWarning(
        displayId,
        code,
        msgPrefix,
        defPath,
        results.warnings,
      );
    }
  });
}

const validateParameters = (
  spec,
  documentMetadata,
  nPath,
  parameters,
  path,
  results,
  skipMissing,
) => {
  const createParameterComboError = pPath => {
    createErrorOrWarning(
      'INVALID_PARAMETER_COMBINATION',
      `API cannot have a a body parameter and a ${
        spec.version === '1.2' ? 'form' : 'formData'
      } parameter`,
      pPath,
      results.errors,
    );
  };

  const pathParams = [];
  let seenBodyParam = false;
  let seenFormParam = false;

  _.reduce(
    parameters,
    (seenParameters, parameter, index) => {
      const pPath = path.concat(['parameters', index.toString()]);

      // Unresolved parameter
      if (_.isUndefined(parameter)) {
        return;
      }

      // Identify duplicate parameter names
      validateNoExist(
        seenParameters,
        parameter.name,
        'PARAMETER',
        'Parameter',
        pPath.concat('name'),
        results.errors,
      );

      // Keep track of body and path parameters
      if (parameter.paramType === 'body' || parameter.in === 'body') {
        if (seenBodyParam === true) {
          createErrorOrWarning(
            'DUPLICATE_API_BODY_PARAMETER',
            'API has more than one body parameter',
            pPath,
            results.errors,
          );
        } else if (seenFormParam === true) {
          createParameterComboError(pPath);
        }

        seenBodyParam = true;
      } else if (
        parameter.paramType === 'form' ||
        parameter.in === 'formData'
      ) {
        if (seenBodyParam === true) {
          createParameterComboError(pPath);
        }

        seenFormParam = true;
      } else if (parameter.paramType === 'path' || parameter.in === 'path') {
        if (nPath.args.indexOf(parameter.name) === -1) {
          createErrorOrWarning(
            'UNRESOLVABLE_API_PATH_PARAMETER',
            `API path parameter could not be resolved: ${parameter.name}`,
            pPath.concat('name'),
            results.errors,
          );
        }

        pathParams.push(parameter.name);
      }

      if (
        spec.primitives.indexOf(parameter.type) === -1 &&
        spec.version === '1.2'
      ) {
        addReference(
          documentMetadata,
          `#/models/${parameter.type}`,
          pPath.concat('type'),
          results,
        );
      }

      // Validate parameter constraints
      validateSchemaConstraints(
        documentMetadata,
        parameter,
        pPath,
        results,
        parameter.skipErrors,
      );

      // eslint-disable-next-line consistent-return
      return seenParameters.concat(parameter.name);
    },
    [],
  );

  // Validate missing path parameters (in path but not in operation.parameters)
  if (_.isUndefined(skipMissing) || skipMissing === false) {
    _.each(_.difference(nPath.args, pathParams), unused => {
      createErrorOrWarning(
        'MISSING_API_PATH_PARAMETER',
        `API requires path parameter but it is not defined: ${unused}`,
        documentMetadata.swaggerVersion === '1.2'
          ? path.slice(0, 2).concat('path')
          : path,
        results.errors,
      );
    });
  }
};

const validateSwagger12 = (
  spec,
  resourceListing,
  apiDeclarations,
  callback,
) => {
  // jshint ignore:line
  let adResourcePaths = [];
  const rlDocumentMetadata = getDocumentCache(resourceListing);
  let rlResourcePaths = [];
  const results = {
    errors: [],
    warnings: [],
    apiDeclarations: [],
  };

  // Process Resource Listing resource definitions
  rlResourcePaths = _.reduce(
    resourceListing.apis,
    (seenPaths, api, index) => {
      // Identify duplicate resource paths defined in the Resource Listing
      validateNoExist(
        seenPaths,
        api.path,
        'RESOURCE_PATH',
        'Resource path',
        ['apis', index.toString(), 'path'],
        results.errors,
      );

      seenPaths.push(api.path);

      return seenPaths;
    },
    [],
  );

  // Process Resource Listing definitions (authorizations)
  processDocument(rlDocumentMetadata, results);

  // Process each API Declaration
  adResourcePaths = _.reduce(
    apiDeclarations,
    (seenResourcePaths, apiDeclaration, index) => {
      results.apiDeclarations[index] = {
        errors: [],
        warnings: [],
      };
      const aResults = results.apiDeclarations[index];
      const adDocumentMetadata = getDocumentCache(apiDeclaration);

      // Identify duplicate resource paths defined in the API Declarations
      validateNoExist(
        seenResourcePaths,
        apiDeclaration.resourcePath,
        'RESOURCE_PATH',
        'Resource path',
        ['resourcePath'],
        aResults.errors,
      );

      if (adResourcePaths.indexOf(apiDeclaration.resourcePath) === -1) {
        // Identify unused resource paths defined in the API Declarations
        validateExist(
          rlResourcePaths,
          apiDeclaration.resourcePath,
          'RESOURCE_PATH',
          'Resource path',
          ['resourcePath'],
          aResults.errors,
        );

        seenResourcePaths.push(apiDeclaration.resourcePath);
      }

      // TODO: Process authorization references
      // Not possible due to https://github.com/swagger-api/swagger-spec/issues/159

      // Process models
      processDocument(adDocumentMetadata, aResults);

      // Process the API definitions
      _.reduce(
        apiDeclaration.apis,
        (seenPaths, api, apisIndex) => {
          const aPath = ['apis', apisIndex.toString()];
          const nPath = normalizePath(api.path);

          // Validate duplicate resource path
          if (seenPaths.indexOf(nPath.path) > -1) {
            createErrorOrWarning(
              'DUPLICATE_API_PATH',
              `API path (or equivalent) already defined: ${api.path}`,
              aPath.concat('path'),
              aResults.errors,
            );
          } else {
            seenPaths.push(nPath.path);
          }

          // Process the API operations
          _.reduce(
            api.operations,
            (seenMethods, operation, operationsIndex) => {
              const oPath = aPath.concat([
                'operations',
                operationsIndex.toString(),
              ]);

              // Validate duplicate operation method
              validateNoExist(
                seenMethods,
                operation.method,
                'OPERATION_METHOD',
                'Operation method',
                oPath.concat('method'),
                aResults.errors,
              );

              // Keep track of the seen methods
              seenMethods.push(operation.method);

              // Keep track of operation types
              if (
                spec.primitives.indexOf(operation.type) === -1 &&
                spec.version === '1.2'
              ) {
                addReference(
                  adDocumentMetadata,
                  `#/models/${operation.type}`,
                  oPath.concat('type'),
                  aResults,
                );
              }

              // Process authorization references
              processAuthRefs(
                rlDocumentMetadata,
                operation.authorizations,
                oPath.concat('authorizations'),
                aResults,
              );

              // Validate validate inline constraints
              validateSchemaConstraints(
                adDocumentMetadata,
                operation,
                oPath,
                aResults,
              );

              // Validate parameters
              validateParameters(
                spec,
                adDocumentMetadata,
                nPath,
                operation.parameters,
                oPath,
                aResults,
              );

              // Validate unique response code
              _.reduce(
                operation.responseMessages,
                (seenResponseCodes, responseMessage, responseMessagesIndex) => {
                  const rmPath = oPath.concat([
                    'responseMessages',
                    responseMessagesIndex.toString(),
                  ]);

                  validateNoExist(
                    seenResponseCodes,
                    responseMessage.code,
                    'RESPONSE_MESSAGE_CODE',
                    'Response message code',
                    rmPath.concat(['code']),
                    aResults.errors,
                  );

                  // Validate missing model
                  if (responseMessage.responseModel) {
                    addReference(
                      adDocumentMetadata,
                      `#/models/${responseMessage.responseModel}`,
                      rmPath.concat('responseModel'),
                      aResults,
                    );
                  }

                  return seenResponseCodes.concat(responseMessage.code);
                },
                [],
              );

              return seenMethods;
            },
            [],
          );

          return seenPaths;
        },
        [],
      );

      // Validate API Declaration definitions
      validateDefinitions(adDocumentMetadata, aResults);

      return seenResourcePaths;
    },
    [],
  );

  // Validate API Declaration definitions
  validateDefinitions(rlDocumentMetadata, results);

  // Identify unused resource paths defined in the Resource Listing
  _.each(_.difference(rlResourcePaths, adResourcePaths), unused => {
    const index = rlResourcePaths.indexOf(unused);

    createUnusedErrorOrWarning(
      resourceListing.apis[index].path,
      'RESOURCE_PATH',
      'Resource path',
      ['apis', index.toString(), 'path'],
      results.errors,
    );
  });

  callback(undefined, results);
};

const validateSwagger20 = (spec, swaggerObject, callback) => {
  // jshint ignore:line
  const documentMetadata = getDocumentCache(swaggerObject);
  const results = {
    errors: [],
    warnings: [],
  };

  // Process definitions
  processDocument(documentMetadata, results);

  // Process security references
  processAuthRefs(
    documentMetadata,
    swaggerObject.security,
    ['security'],
    results,
  );

  _.reduce(
    documentMetadata.resolved.paths,
    (seenPaths, path, name) => {
      const pPath = ['paths', name];
      const nPath = normalizePath(name);

      // Validate duplicate resource path
      if (seenPaths.indexOf(nPath.path) > -1) {
        createErrorOrWarning(
          'DUPLICATE_API_PATH',
          `API path (or equivalent) already defined: ${name}`,
          pPath,
          results.errors,
        );
      }

      // Validate parameters
      validateParameters(
        spec,
        documentMetadata,
        nPath,
        path.parameters,
        pPath,
        results,
        true,
      );

      // Validate the Operations
      _.each(path, (operation, method) => {
        const cParams = [];
        const oPath = pPath.concat(method);
        const seenParams = [];

        if (validOptionNames.indexOf(method) === -1) {
          return;
        }

        // Process security references
        processAuthRefs(
          documentMetadata,
          operation.security,
          oPath.concat('security'),
          results,
        );

        // Compose parameters from path global parameters and operation parameters
        _.each(operation.parameters, parameter => {
          // Can happen with invalid references
          if (_.isUndefined(parameter)) {
            return;
          }

          cParams.push(parameter);

          seenParams.push(`${parameter.name}:${parameter.in}`);
        });

        _.each(path.parameters, parameter => {
          const cloned = _.cloneDeep(parameter);

          // The only errors that can occur here are schema constraint validation errors which are already reported above
          // so do not report them again.
          cloned.skipErrors = true;

          if (seenParams.indexOf(`${parameter.name}:${parameter.in}`) === -1) {
            cParams.push(cloned);
          }
        });

        // Validate parameters
        validateParameters(
          spec,
          documentMetadata,
          nPath,
          cParams,
          oPath,
          results,
        );

        // Validate responses
        _.each(operation.responses, (response, responseCode) => {
          // Do not process references to missing responses
          if (!_.isUndefined(response)) {
            // Validate validate inline constraints
            validateSchemaConstraints(
              documentMetadata,
              response,
              oPath.concat('responses', responseCode),
              results,
            );
          }
        });
      });

      return seenPaths.concat(nPath.path);
    },
    [],
  );

  // Validate definitions
  validateDefinitions(documentMetadata, results);

  callback(undefined, results);
};

const validateSemantically = (spec, rlOrSO, apiDeclarations, callback) => {
  const cbWrapper = (err, results) => {
    callback(err, helpers.formatResults(results));
  };
  if (spec.version === '1.2') {
    validateSwagger12(spec, rlOrSO, apiDeclarations, cbWrapper); // jshint ignore:line
  } else {
    validateSwagger20(spec, rlOrSO, cbWrapper); // jshint ignore:line
  }
};

const validateStructurally = (spec, rlOrSO, apiDeclarations, callback) => {
  validateAgainstSchema(
    spec,
    spec.version === '1.2' ? 'resourceListing.json' : 'schema.json',
    rlOrSO,
    (err, origResults) => {
      let results = origResults;
      if (err) {
        return callback(err);
      }

      // Only validate the API Declarations if the API is 1.2 and the Resource Listing was valid
      if (!results && spec.version === '1.2') {
        results = {
          errors: [],
          warnings: [],
          apiDeclarations: [],
        };

        return async.map(
          apiDeclarations,
          (apiDeclaration, callback2) => {
            validateAgainstSchema(
              spec,
              'apiDeclaration.json',
              apiDeclaration,
              callback2,
            );
          },
          (mapErr, allResults) => {
            if (mapErr) {
              return callback(mapErr);
            }

            _.each(allResults, (result, index) => {
              results.apiDeclarations[index] = result;
            });

            return callback(undefined, results);
          },
        );
      }
      return callback(undefined, results);
    },
  );
};

/**
 * Creates a new Swagger specification object.
 *
 * @param {string} version - The Swagger version
 *
 * @constructor
 */
function Specification(version) {
  const that = this;

  const createValidators = (spec, validatorsMap) => {
    return _.reduce(
      validatorsMap,
      (origResult, schemas, schemaName) => {
        const result = origResult;
        result[schemaName] = helpers.createJsonValidator(schemas);

        return result;
      },
      {},
    );
  };

  const fixSchemaId = schemaName => {
    // Swagger 1.2 schema files use one id but use a different id when referencing schema files.  We also use the schema
    // file name to reference the schema in ZSchema.  To fix this so that the JSON Schema validator works properly, we
    // need to set the id to be the name of the schema file.
    const fixed = _.cloneDeep(that.schemas[schemaName]);

    fixed.id = schemaName;

    return fixed;
  };

  const primitives = ['string', 'number', 'boolean', 'integer', 'array'];

  switch (version) {
    case '1.2':
      this.docsUrl =
        'https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md';
      this.primitives = _.union(primitives, ['void', 'File']);
      this.schemasUrl =
        'https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2';

      // Here explicitly to allow browserify to work
      this.schemas = {
        'apiDeclaration.json': apiDeclarationJson,
        'authorizationObject.json': authorizationObjectJson,
        'dataType.json': dataTypeJson,
        'dataTypeBase.json': dataTypeBaseJson,
        'infoObject.json': infoObjectJson,
        'modelsObject.json': modelsObjectJson,
        'oauth2GrantType.json': oauth2GrantTypeJson,
        'operationObject.json': operationObjectJson,
        'parameterObject.json': parameterObjectJson,
        'resourceListing.json': resourceListingJson,
        'resourceObject.json': resourceObjectJson,
      };

      this.validators = createValidators(this, {
        'apiDeclaration.json': _.map(
          [
            'dataTypeBase.json',
            'modelsObject.json',
            'oauth2GrantType.json',
            'authorizationObject.json',
            'parameterObject.json',
            'operationObject.json',
            'apiDeclaration.json',
          ],
          fixSchemaId,
        ),
        'resourceListing.json': _.map(
          [
            'resourceObject.json',
            'infoObject.json',
            'oauth2GrantType.json',
            'authorizationObject.json',
            'resourceListing.json',
          ],
          fixSchemaId,
        ),
      });

      break;

    case '2.0':
      this.docsUrl =
        'https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md';
      this.primitives = _.union(primitives, ['file']);
      this.schemasUrl =
        'https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0';

      // Here explicitly to allow browserify to work
      this.schemas = {
        'schema.json': schema20,
      };

      this.validators = createValidators(this, {
        'schema.json': [fixSchemaId('schema.json')],
      });

      break;

    default:
      throw new Error(
        `${version} is an unsupported Swagger specification version`,
      );
  }

  this.version = version;
}

/**
 * Returns the result of the validation of the Swagger document(s).
 *
 * @param {object} rlOrSO - The Swagger Resource Listing (1.2) or Swagger Object (2.0)
 * @param {object[]} [apiDeclarations] - The array of Swagger API Declarations (1.2)
 * @param {resultCallback} callback - The result callback
 *
 * @returns undefined if validation passes or an object containing errors and/or warnings
 * @throws Error if the arguments provided are not valid
 */
Specification.prototype.validate = function validate(
  rlOrSO,
  origApiDeclarations,
  origCallback,
) {
  let callback = origCallback;
  let apiDeclarations = origApiDeclarations;
  // Validate arguments
  switch (this.version) {
    case '1.2':
      // Validate arguments
      if (_.isUndefined(rlOrSO)) {
        throw new Error('resourceListing is required');
      } else if (!_.isPlainObject(rlOrSO)) {
        throw new TypeError('resourceListing must be an object');
      }

      if (_.isUndefined(apiDeclarations)) {
        throw new Error('apiDeclarations is required');
      } else if (!_.isArray(apiDeclarations)) {
        throw new TypeError('apiDeclarations must be an array');
      }

      break;

    case '2.0':
      // Validate arguments
      if (_.isUndefined(rlOrSO)) {
        throw new Error('swaggerObject is required');
      } else if (!_.isPlainObject(rlOrSO)) {
        throw new TypeError('swaggerObject must be an object');
      }

      break;
  }

  if (this.version === '2.0') {
    [, callback] = arguments;
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  // For Swagger 2.0, make sure apiDeclarations is an empty array
  if (this.version === '2.0') {
    apiDeclarations = [];
  }

  const that = this;

  // Perform the validation
  validateStructurally(this, rlOrSO, apiDeclarations, (err, result) => {
    if (err || helpers.formatResults(result)) {
      callback(err, result);
    } else {
      validateSemantically(that, rlOrSO, apiDeclarations, callback);
    }
  });
};

/**
 * Returns a JSON Schema representation of a composed model based on its id or reference.
 *
 * Note: For Swagger 1.2, we only perform structural validation prior to composing the model.
 *
 * @param {object} apiDOrSO - The Swagger Resource API Declaration (1.2) or the Swagger Object (2.0)
 * @param {string} modelIdOrRef - The model id (1.2) or the reference to the model (1.2 or 2.0)
 * @param {resultCallback} callback - The result callback
 *
 * @returns the object representing a composed object
 *
 * @throws Error if there are validation errors while creating
 */
Specification.prototype.composeModel = function composeModel(
  apiDOrSO,
  origModelIdOrRef,
  callback,
) {
  let modelIdOrRef = origModelIdOrRef;
  const swaggerVersion = helpers.getSwaggerVersion(apiDOrSO);
  const doComposition = (err, origResults) => {
    let results = origResults;
    if (err) {
      return callback(err);
    }
    if (helpers.getErrorCount(results) > 0) {
      return handleValidationError(results, callback);
    }

    const documentMetadata = getDocumentCache(apiDOrSO);
    results = {
      errors: [],
      warnings: [],
    };

    processDocument(documentMetadata, results);

    if (!documentMetadata.definitions[modelIdOrRef]) {
      return callback();
    }

    if (helpers.getErrorCount(results) > 0) {
      return handleValidationError(results, callback);
    }

    return callback(
      undefined,
      getOrComposeSchema(documentMetadata, modelIdOrRef),
    );
  };

  switch (this.version) {
    case '1.2':
      // Validate arguments
      if (_.isUndefined(apiDOrSO)) {
        throw new Error('apiDeclaration is required');
      } else if (!_.isPlainObject(apiDOrSO)) {
        throw new TypeError('apiDeclaration must be an object');
      }

      if (_.isUndefined(modelIdOrRef)) {
        throw new Error('modelId is required');
      }

      break;

    case '2.0':
      // Validate arguments
      if (_.isUndefined(apiDOrSO)) {
        throw new Error('swaggerObject is required');
      } else if (!_.isPlainObject(apiDOrSO)) {
        throw new TypeError('swaggerObject must be an object');
      }

      if (_.isUndefined(modelIdOrRef)) {
        throw new Error('modelRef is required');
      }

      break;
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  if (modelIdOrRef.charAt(0) !== '#') {
    if (this.version === '1.2') {
      modelIdOrRef = `#/models/${modelIdOrRef}`;
    } else {
      throw new Error('modelRef must be a JSON Pointer');
    }
  }

  // Ensure the document is valid first
  if (swaggerVersion === '1.2') {
    validateAgainstSchema(this, 'apiDeclaration.json', apiDOrSO, doComposition);
  } else {
    this.validate(apiDOrSO, doComposition);
  }
};

/**
 * Validates a model based on its id.
 *
 * Note: For Swagger 1.2, we only perform structural validation prior to composing the model.
 *
 * @param {object} apiDOrSO - The Swagger Resource API Declaration (1.2) or the Swagger Object (2.0)
 * @param {string} modelIdOrRef - The model id (1.2) or the reference to the model (1.2 or 2.0)
 * @param {*} data - The model to validate
 * @param {resultCallback} callback - The result callback
 *
 * @returns undefined if validation passes or an object containing errors and/or warnings
 *
 * @throws Error if there are validation errors while creating
 */
Specification.prototype.validateModel = function validateModel(
  apiDOrSO,
  modelIdOrRef,
  data,
  callback,
) {
  switch (this.version) {
    case '1.2':
      // Validate arguments
      if (_.isUndefined(apiDOrSO)) {
        throw new Error('apiDeclaration is required');
      } else if (!_.isPlainObject(apiDOrSO)) {
        throw new TypeError('apiDeclaration must be an object');
      }

      if (_.isUndefined(modelIdOrRef)) {
        throw new Error('modelId is required');
      }

      break;

    case '2.0':
      // Validate arguments
      if (_.isUndefined(apiDOrSO)) {
        throw new Error('swaggerObject is required');
      } else if (!_.isPlainObject(apiDOrSO)) {
        throw new TypeError('swaggerObject must be an object');
      }

      if (_.isUndefined(modelIdOrRef)) {
        throw new Error('modelRef is required');
      }

      break;
  }

  if (_.isUndefined(data)) {
    throw new Error('data is required');
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  const that = this;

  this.composeModel(apiDOrSO, modelIdOrRef, (err, result) => {
    if (err) {
      return callback(err);
    }

    return validateAgainstSchema(that, result, data, callback);
  });
};

/**
 * Returns a fully resolved document or document fragment.  (Does not perform validation as this is typically called
 * after validation occurs.))
 *
 * @param {object} document - The document to resolve or the document containing the reference to resolve
 * @param {string} [ptr] - The JSON Pointer or undefined to return the whole document
 * @param {resultCallback} callback - The result callback
 *
 * @returns the fully resolved document or fragment
 *
 * @throws Error if there are upstream errors
 */
Specification.prototype.resolve = function resolve(
  document,
  origPtr,
  origCallback,
) {
  let ptr = origPtr;
  let callback = origCallback;

  const respond = doc => {
    if (_.isString(ptr)) {
      return callback(undefined, traverse(doc).get(JsonRefs.pathFromPtr(ptr)));
    }
    return callback(undefined, doc);
  };

  // Validate arguments
  if (_.isUndefined(document)) {
    throw new Error('document is required');
  } else if (!_.isPlainObject(document)) {
    throw new TypeError('document must be an object');
  }

  if (arguments.length === 2) {
    [, callback] = arguments;
    ptr = undefined;
  }

  if (!_.isUndefined(ptr) && !_.isString(ptr)) {
    throw new TypeError('ptr must be a JSON Pointer string');
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  const documentMetadata = getDocumentCache(document);

  // Swagger 1.2 is not supported due to invalid JSON References being used.  Even if the JSON References were valid,
  // the JSON Schema for Swagger 1.2 do not allow JavaScript objects in all places where the resoution would occur.
  if (documentMetadata.swaggerVersion === '1.2') {
    throw new Error('Swagger 1.2 is not supported');
  }

  if (!documentMetadata.resolved) {
    // Ensure the document is valid first
    this.validate(document, (err, results) => {
      if (err) {
        return callback(err);
      }
      if (helpers.getErrorCount(results) > 0) {
        return handleValidationError(results, callback);
      }

      return respond(documentMetadata.resolved);
    });
  } else {
    return respond(documentMetadata.resolved);
  }
  return undefined;
};

/**
 * Converts the Swagger 1.2 documents to a Swagger 2.0 document.
 *
 * @param {object} resourceListing - The Swagger Resource Listing
 * @param {object[]} [apiDeclarations] - The array of Swagger API Declarations
 * @param {boolean=false} [skipValidation] - Whether or not to skip validation
 * @param {resultCallback} callback - The result callback
 *
 * @returns the converted Swagger document
 *
 * @throws Error if the arguments provided are not valid
 */
Specification.prototype.convert = function convert(
  origResourceListing,
  origApiDeclarations,
  skipValidation,
  origCallback,
) {
  let callback = origCallback;
  const resourceListing = origResourceListing;
  let apiDeclarations = origApiDeclarations;

  const doConvert = (origResources, origDeclarations) => {
    const resourceListingToConvert = origResources;
    const apiDeclarationsToConvert = origDeclarations;
    callback(
      undefined,
      swaggerConverter(resourceListingToConvert, apiDeclarationsToConvert),
    );
  };

  if (this.version !== '1.2') {
    throw new Error('Specification#convert only works for Swagger 1.2');
  }

  // Validate arguments
  if (_.isUndefined(resourceListing)) {
    throw new Error('resourceListing is required');
  } else if (!_.isPlainObject(resourceListing)) {
    throw new TypeError('resourceListing must be an object');
  }

  // API Declarations are optional because swagger-converter was written to support it
  if (_.isUndefined(apiDeclarations)) {
    apiDeclarations = [];
  }

  if (!_.isArray(apiDeclarations)) {
    throw new TypeError('apiDeclarations must be an array');
  }

  if (arguments.length < 4) {
    // eslint-disable-next-line prefer-rest-params
    callback = arguments[arguments.length - 1];
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  if (skipValidation === true) {
    doConvert(resourceListing, apiDeclarations);
  } else {
    this.validate(resourceListing, apiDeclarations, (err, results) => {
      if (err) {
        return callback(err);
      }
      if (helpers.getErrorCount(results) > 0) {
        return handleValidationError(results, callback);
      }

      return doConvert(resourceListing, apiDeclarations);
    });
  }
};

const v12 = new Specification('1.2');
const v20 = new Specification('2.0');
module.exports.v1_2 = v12;
module.exports.v2_0 = v20;
module.exports.v1 = v12;
module.exports.v2 = v20;
