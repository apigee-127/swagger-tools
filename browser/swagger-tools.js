!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),(o.SwaggerTools||(o.SwaggerTools={})).specs=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
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

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);
var async = (typeof window !== "undefined" ? window.async : typeof global !== "undefined" ? global.async : null);
var helpers = require('./helpers');
var JsonRefs = (typeof window !== "undefined" ? window.JsonRefs : typeof global !== "undefined" ? global.JsonRefs : null);
var SparkMD5 = (typeof window !== "undefined" ? window.SparkMD5 : typeof global !== "undefined" ? global.SparkMD5 : null);
var swaggerConverter = (typeof window !== "undefined" ? window.SwaggerConverter.convert : typeof global !== "undefined" ? global.SwaggerConverter.convert : null);
var traverse = (typeof window !== "undefined" ? window.traverse : typeof global !== "undefined" ? global.traverse : null);
var validators = require('./validators');

// Work around swagger-converter packaging issue (Browser builds only)
if (_.isPlainObject(swaggerConverter)) {
  swaggerConverter = global.SwaggerConverter.convert;
}

var documentCache = {};
var validOptionNames = _.map(helpers.swaggerOperationMethods, function (method) {
  return method.toLowerCase();
});

var addExternalRefsToValidator = function addExternalRefsToValidator (validator, json, callback) {
  var remoteRefs = _.reduce(JsonRefs.findRefs(json), function (rRefs, ref, ptr) {
    if (JsonRefs.isRemotePointer(ptr)) {
      rRefs.push(ref.split('#')[0]);
    }

    return rRefs;
  }, []);
  var resolveRemoteRefs = function (ref, callback) {
    JsonRefs.resolveRefs({$ref: ref}, function (err, json) {
      if (err) {
        return callback(err);
      }

      // Perform the same for the newly resolved document
      addExternalRefsToValidator(validator, json, function (err, rJson) {
        callback(err, rJson);
      });
    });
  };

  if (remoteRefs.length > 0) {
    async.map(remoteRefs, resolveRemoteRefs, function (err, results) {
      if (err) {
        return callback(err);
      }

      _.each(results, function (json, index) {
        validator.setRemoteReference(remoteRefs[index], json);
      });

      callback();
    });
  } else {
    callback();
  }
};

var createErrorOrWarning = function createErrorOrWarning (code, message, path, dest) {
  dest.push({
    code: code,
    message: message,
    path: path
  });
};

var addReference = function addReference (cacheEntry, defPathOrPtr, refPathOrPtr, results, omitError) {
  var result = true;
  var swaggerVersion = helpers.getSwaggerVersion(cacheEntry.resolved);
  var defPath = _.isArray(defPathOrPtr) ? defPathOrPtr : JsonRefs.pathFromPointer(defPathOrPtr);
  var defPtr = _.isArray(defPathOrPtr) ? JsonRefs.pathToPointer(defPathOrPtr) : defPathOrPtr;
  var refPath = _.isArray(refPathOrPtr) ? refPathOrPtr : JsonRefs.pathFromPointer(refPathOrPtr);
  var refPtr = _.isArray(refPathOrPtr) ? JsonRefs.pathToPointer(refPathOrPtr) : refPathOrPtr;
  var code;
  var def;
  var displayId;
  var msgPrefix;
  var type;

  // Only possible when defPathOrPtr is a string and is not a real pointer
  if (defPath.length === 0) {
    createErrorOrWarning('INVALID_REFERENCE', 'Not a valid JSON Reference', refPath, results.errors);
    return false;
  }

  def = cacheEntry.definitions[defPtr];
  type = defPath[0];
  code = type === 'securityDefinitions' ?
                    'SECURITY_DEFINITION' :
                    type.substring(0, type.length - 1).toUpperCase();
  displayId = swaggerVersion === '1.2' ? defPath[defPath.length - 1] : defPtr;
  msgPrefix = type === 'securityDefinitions' ?
                         'Security definition' :
                         code.charAt(0) + code.substring(1).toLowerCase();

  // This is an authorization scope reference
  if (['authorizations', 'securityDefinitions'].indexOf(defPath[0]) > -1 && defPath[2] === 'scopes') {
    code += '_SCOPE';
    msgPrefix += ' scope';
  }

  if (_.isUndefined(def)) {
    if (!omitError) {
      createErrorOrWarning('UNRESOLVABLE_' + code, msgPrefix + ' could not be resolved: ' + displayId,
                           refPath, results.errors);
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

var getOrComposeSchema = function getOrComposeSchema (documentMetadata, modelId) {
  var title = 'Composed ' + (documentMetadata.swaggerVersion === '1.2' ?
                               JsonRefs.pathFromPointer(modelId).pop() :
                               modelId);
  var metadata = documentMetadata.definitions[modelId];
  var originalT = traverse(documentMetadata.original);
  var resolvedT = traverse(documentMetadata.resolved);
  var composed;
  var original;

  if (!metadata) {
    return undefined;
  }

  original = _.cloneDeep(originalT.get(JsonRefs.pathFromPointer(modelId)));
  composed = _.cloneDeep(resolvedT.get(JsonRefs.pathFromPointer(modelId)));

  // Convert the Swagger 1.2 document to a valid JSON Schema file
  if (documentMetadata.swaggerVersion === '1.2') {
    // Create inheritance model
    if (metadata.lineage.length > 0) {
      composed.allOf = [];

      _.each(metadata.lineage, function (modelId) {
        composed.allOf.push(getOrComposeSchema(documentMetadata, modelId));
      });
    }

    // Remove the subTypes property
    delete composed.subTypes;

    _.each(composed.properties, function (property, name) {
      var oProp = original.properties[name];

      // Convert the string values to numerical values
      _.each(['maximum', 'minimum'], function (prop) {
        if (_.isString(property[prop])) {
          property[prop] = parseFloat(property[prop]);
        }
      });

      _.each(JsonRefs.findRefs(oProp), function (ref, ptr) {
        var modelId = '#/models/' + ref;
        var dMetadata = documentMetadata.definitions[modelId];
        var path = JsonRefs.pathFromPointer(ptr);

        if (dMetadata.lineage.length > 0) {
          traverse(property).set(path.slice(0, path.length - 1), getOrComposeSchema(documentMetadata, modelId));
        } else {
          traverse(property).set(path.slice(0, path.length - 1).concat('title'), 'Composed ' + ref);
        }
      });
    });
  }

  // Scrub id properties
  composed = traverse(composed).map(function (val) {
    if (this.key === 'id' && _.isString(val)) {
      this.remove();
    }
  });

  composed.title = title;

  return composed;
};

var createUnusedErrorOrWarning = function createUnusedErrorOrWarning (val, codeSuffix, msgPrefix, path, dest) {
  createErrorOrWarning('UNUSED_' + codeSuffix, msgPrefix + ' is defined but is not used: ' + val, path, dest);
};

var getDocumentCache = function getDocumentCache (apiDOrSO) {
  var key = SparkMD5.hash(JSON.stringify(apiDOrSO));
  var cacheEntry = documentCache[key] || _.find(documentCache, function (cacheEntry) {
    return cacheEntry.resolvedId === key;
  });

  if (!cacheEntry) {
    cacheEntry = documentCache[key] = {
      definitions: {},
      original: apiDOrSO,
      resolved: undefined,
      swaggerVersion: helpers.getSwaggerVersion(apiDOrSO)
    };
  }

  return cacheEntry;
};

var handleValidationError = function handleValidationError (results, callback) {
  var err = new Error('The Swagger document(s) are invalid');

  err.errors = results.errors;
  err.failedValidation = true;
  err.warnings = results.warnings;

  if (results.apiDeclarations) {
    err.apiDeclarations = results.apiDeclarations;
  }

  callback(err);
};

var normalizePath = function normalizePath (path) {
  var matches = path.match(/\{(.*?)\}/g);
  var argNames = [];
  var normPath = path;

  if (matches) {
    _.each(matches, function (match, index) {
      normPath = normPath.replace(match, '{' + index + '}');
      argNames.push(match.replace(/[{}]/g, ''));
    });
  }

  return {
    path: normPath,
    args: argNames
  };
};

var validateNoExist = function validateNoExist (data, val, codeSuffix, msgPrefix, path, dest) {
  if (!_.isUndefined(data) && data.indexOf(val) > -1) {
    createErrorOrWarning('DUPLICATE_' + codeSuffix, msgPrefix + ' already defined: ' + val, path, dest);
  }
};

var validateSchemaConstraints = function validateSchemaConstraints (documentMetadata, schema, path, results, skip) {
  try {
    validators.validateSchemaConstraints(documentMetadata.swaggerVersion, schema, path, undefined);
  } catch (err) {
    if (!skip) {
      createErrorOrWarning(err.code, err.message, err.path, results.errors);
    }
  }
};

var processDocument = function processDocument (documentMetadata, results) {
  var swaggerVersion = documentMetadata.swaggerVersion;
  var getDefinitionMetadata = function getDefinitionMetadata (defPath) {
    var defPtr = JsonRefs.pathToPointer(defPath);
    var metadata = documentMetadata.definitions[defPtr];

    if (!metadata) {
      metadata = documentMetadata.definitions[defPtr] = {
        references: []
      };

      // For model definitions, add the inheritance properties
      if (['definitions', 'models'].indexOf(JsonRefs.pathFromPointer(defPtr)[0]) > -1) {
        metadata.cyclical = false;
        metadata.lineage = undefined;
        metadata.parents = [];
      }
    }

    return metadata;
  };
  var getDisplayId = function getDisplayId (id) {
    return swaggerVersion === '1.2' ? JsonRefs.pathFromPointer(id).pop() : id;
  };
  var walk = function walk (root, id, lineage) {
    var definition = documentMetadata.definitions[id || root];

    if (definition) {
      _.each(definition.parents, function (parent) {
        lineage.push(parent);

        if (root !== parent) {
          walk(root, parent, lineage);
        }
      });
    }
  };
  var authDefsProp = swaggerVersion === '1.2' ? 'authorizations' : 'securityDefinitions';
  var modelDefsProp = swaggerVersion === '1.2' ? 'models' : 'definitions';

  // Process authorization definitions
  _.each(documentMetadata.resolved[authDefsProp], function (authorization, name) {
    var securityDefPath = [authDefsProp, name];

    // Swagger 1.2 only has authorization definitions in the Resource Listing
    if (swaggerVersion === '1.2' && !authorization.type) {
      return;
    }

    // Create the authorization definition metadata
    getDefinitionMetadata(securityDefPath);

    _.reduce(authorization.scopes, function (seenScopes, scope, indexOrName) {
      var scopeName = swaggerVersion === '1.2' ? scope.scope : indexOrName;
      var scopeDefPath = securityDefPath.concat(['scopes', indexOrName.toString()]);
      var scopeMetadata = getDefinitionMetadata(securityDefPath.concat(['scopes', scopeName]));

      scopeMetadata.scopePath = scopeDefPath;

      // Identify duplicate authorization scope defined in the Resource Listing
      validateNoExist(seenScopes, scopeName, 'AUTHORIZATION_SCOPE_DEFINITION', 'Authorization scope definition',
                      swaggerVersion === '1.2' ? scopeDefPath.concat('scope') : scopeDefPath, results.warnings);

      seenScopes.push(scopeName);

      return seenScopes;
    }, []);
  });

  // Proces model definitions
  _.each(documentMetadata.resolved[modelDefsProp], function (model, modelId) {
    var modelDefPath = [modelDefsProp, modelId];
    var modelMetadata = getDefinitionMetadata(modelDefPath);

    // Identify model id mismatch (Id in models object is not the same as the model's id in the models object)
    if (swaggerVersion === '1.2' && modelId !== model.id) {
      createErrorOrWarning('MODEL_ID_MISMATCH', 'Model id does not match id in models object: ' + model.id,
                           modelDefPath.concat('id'), results.errors);
    }

    // Do not reprocess parents/references if already processed
    if (_.isUndefined(modelMetadata.lineage)) {
      // Handle inheritance references
      switch (swaggerVersion) {
      case '1.2':
        _.each(model.subTypes, function (subType, index) {
          var subPath = ['models', subType];
          var subPtr = JsonRefs.pathToPointer(subPath);
          var subMetadata = documentMetadata.definitions[subPtr];
          var refPath = modelDefPath.concat(['subTypes', index.toString()]);

          // If the metadata does not yet exist, create it
          if (!subMetadata && documentMetadata.resolved[modelDefsProp][subType]) {
            subMetadata = getDefinitionMetadata(subPath);
          }

          // If the reference is valid, add the parent
          if (addReference(documentMetadata, subPath, refPath, results)) {
            subMetadata.parents.push(JsonRefs.pathToPointer(modelDefPath));
          }
        });

        break;

      default:
        _.each(documentMetadata.original[modelDefsProp][modelId].allOf, function (schema, index) {
          var childPath = modelDefPath.concat(['allOf', index.toString()]);
          var parentPath;
	  
          if (_.isUndefined(schema.$ref) || JsonRefs.isRemotePointer(schema.$ref)) {
            parentPath = modelDefPath.concat(['allOf', index.toString()]);
          } else {
	    childPath.push('$ref');

            parentPath = JsonRefs.pathFromPointer(schema.$ref);
          }

	  // If the parent model does not exist, do not create its metadata
	  if (!_.isUndefined(traverse(documentMetadata.resolved).get(parentPath))) {
	    getDefinitionMetadata(JsonRefs.pathFromPointer(schema.$ref));
	    modelMetadata.parents.push(JsonRefs.pathToPointer(parentPath));
	  }
        });

        break;
      }
    }
  });

  switch (swaggerVersion) {
  case '2.0':
    // Process parameter definitions
    _.each(documentMetadata.resolved.parameters, function (parameter, name) {
      var path = ['parameters', name];

      getDefinitionMetadata(path);

      validateSchemaConstraints(documentMetadata, parameter, path, results);
    });

    // Process response definitions
    _.each(documentMetadata.resolved.responses, function (response, name) {
      var path = ['responses', name];

      getDefinitionMetadata(path);

      validateSchemaConstraints(documentMetadata, response, path, results);
    });

    break;
  }

  // Validate definition/models (Inheritance, property definitions, ...)
  _.each(documentMetadata.definitions, function (metadata, id) {
    var defPath = JsonRefs.pathFromPointer(id);
    var definition = traverse(documentMetadata.original).get(defPath);
    var defProp = defPath[0];
    var code = defProp.substring(0, defProp.length - 1).toUpperCase();
    var msgPrefix = code.charAt(0) + code.substring(1).toLowerCase();
    var dProperties;
    var iProperties;
    var lineage;

    // The only checks we perform below are inheritance checks so skip all non-model definitions
    if (['definitions', 'models'].indexOf(defProp) === -1) {
      return;
    }

    dProperties = [];
    iProperties = [];
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
      createErrorOrWarning('MULTIPLE_' + code + '_INHERITANCE',
                           'Child ' + code.toLowerCase() + ' is sub type of multiple models: ' +
                           _.map(metadata.parents, function (parent) {
                             return getDisplayId(parent);
                           }).join(' && '), defPath, results.errors);
    }

    if (metadata.cyclical) {
      createErrorOrWarning('CYCLICAL_' + code + '_INHERITANCE',
                           msgPrefix + ' has a circular inheritance: ' +
                             _.map(lineage, function (dep) {
                               return getDisplayId(dep);
                             }).join(' -> ') + ' -> ' + getDisplayId(id),
                            defPath.concat(swaggerVersion === '1.2' ? 'subTypes' : 'allOf'), results.errors);
    }

    // Remove self reference from the end of the lineage (Front too if cyclical)
    _.each(lineage.slice(metadata.cyclical ? 1 : 0), function (id) {
      var pModel = traverse(documentMetadata.resolved).get(JsonRefs.pathFromPointer(id));

      _.each(Object.keys(pModel.properties), function (name) {
        if (iProperties.indexOf(name) === -1) {
          iProperties.push(name);
        }
      });
    });

    // Validate simple definitions
    validateSchemaConstraints(documentMetadata, definition, defPath, results);
    
    // Identify redeclared properties
    _.each(definition.properties, function (property, name) {
      var pPath = defPath.concat(['properties', name]);

      // Do not process unresolved properties
      if (!_.isUndefined(property)) {
        validateSchemaConstraints(documentMetadata, property, pPath, results);

        if (iProperties.indexOf(name) > -1) {
          createErrorOrWarning('CHILD_' + code + '_REDECLARES_PROPERTY',
			       'Child ' + code.toLowerCase() + ' declares property already declared by ancestor: ' +
                               name,
			       pPath, results.errors);
        } else {
          dProperties.push(name);
        }
      }
    });

    // Identify missing required properties
    _.each(definition.required || [], function (name, index) {
      var type = swaggerVersion === '1.2' ? 'Model' : 'Definition';

      if (iProperties.indexOf(name) === -1 && dProperties.indexOf(name) === -1) {
        createErrorOrWarning('MISSING_REQUIRED_' + type.toUpperCase() + '_PROPERTY',
                             type + ' requires property but it is not defined: ' + name,
                             defPath.concat(['required', index.toString()]), results.errors);
      }
    });
  });

  // Process references (Only processes JSON References, all other references are handled where encountered)
  _.each(JsonRefs.findRefs(documentMetadata.original), function (ref, refPtr) {

    if (documentMetadata.swaggerVersion === '1.2') {
      ref = '#/models/' + ref;
    }

    // Only process local references
    if (!JsonRefs.isRemotePointer(ref)) {
      addReference(documentMetadata, ref, refPtr, results);
    }
  });
};

var validateExist = function validateExist (data, val, codeSuffix, msgPrefix, path, dest) {
  if (!_.isUndefined(data) && data.indexOf(val) === -1) {
    createErrorOrWarning('UNRESOLVABLE_' + codeSuffix, msgPrefix + ' could not be resolved: ' + val, path, dest);
  }
};

var processAuthRefs = function processAuthRefs (documentMetadata, authRefs, path, results) {
  var code = documentMetadata.swaggerVersion === '1.2' ? 'AUTHORIZATION' : 'SECURITY_DEFINITION';
  var msgPrefix = code === 'AUTHORIZATION' ? 'Authorization' : 'Security definition';

  if (documentMetadata.swaggerVersion === '1.2') {
    _.reduce(authRefs, function (seenNames, scopes, name) {
      var authPtr = '#/authorizations/' + name;
      var aPath = path.concat([name]);

      // Add reference or record unresolved authorization
      if (addReference(documentMetadata, authPtr, aPath, results)) {
        _.reduce(scopes, function (seenScopes, scope, index) {
          var sPath = aPath.concat(index.toString(), 'scope');
          var sPtr = authPtr + '/scopes/' + scope.scope;

          validateNoExist(seenScopes, scope.scope, code + '_SCOPE_REFERENCE', msgPrefix + ' scope reference', sPath,
                          results.warnings);

          // Add reference or record unresolved authorization scope
          addReference(documentMetadata, sPtr, sPath, results);

          return seenScopes.concat(scope.scope);
        }, []);
      }

      return seenNames.concat(name);
    }, []);
  } else {
    _.reduce(authRefs, function (seenNames, scopes, index) {
      _.each(scopes, function (scopes, name) {
        var authPtr = '#/securityDefinitions/' + name;
        var authRefPath = path.concat(index.toString(), name);

        // Ensure the security definition isn't referenced more than once (Swagger 2.0+)
        validateNoExist(seenNames, name, code + '_REFERENCE', msgPrefix + ' reference', authRefPath,
                        results.warnings);

        seenNames.push(name);

        // Add reference or record unresolved authorization
        if (addReference(documentMetadata, authPtr, authRefPath, results)) {
          _.each(scopes, function (scope, index) {
            // Add reference or record unresolved authorization scope
            addReference(documentMetadata, authPtr + '/scopes/' + scope, authRefPath.concat(index.toString()),
                         results);
          });
        }
      });

      return seenNames;
    }, []);
  }
};

var resolveRefs = function (apiDOrSO, callback) {
  var cacheEntry = getDocumentCache(apiDOrSO);
  var swaggerVersion = helpers.getSwaggerVersion(apiDOrSO);
  var documentT;

  if (!cacheEntry.resolved) {
    // For Swagger 1.2, we have to create real JSON References
    if (swaggerVersion === '1.2') {
      apiDOrSO = _.cloneDeep(apiDOrSO);
      documentT = traverse(apiDOrSO);

      _.each(JsonRefs.findRefs(apiDOrSO), function (ref, ptr) {
        // All Swagger 1.2 references are ALWAYS to models
        documentT.set(JsonRefs.pathFromPointer(ptr), '#/models/' + ref);
      });
    }

    // Resolve references
    JsonRefs.resolveRefs(apiDOrSO, function (err, json) {
      if (err) {
        return callback(err);
      }

      cacheEntry.resolved = json;
      cacheEntry.resolvedId = SparkMD5.hash(JSON.stringify(json));

      callback();
    });
  } else {
    callback();
  }
};

var validateAgainstSchema = function validateAgainstSchema (spec, schemaOrName, data, callback) {
  var validator = _.isString(schemaOrName) ? spec.validators[schemaOrName] : helpers.createJsonValidator();
  var doValidation = function doValidation () {
    try {
      validators.validateAgainstSchema(schemaOrName, data, validator);
    } catch (err) {
      if (err.failedValidation) {
        return callback(undefined, err.results);
      } else {
        return callback(err);
      }
    }

    resolveRefs(data, function (err) {
      return callback(err);
    });
  };

  addExternalRefsToValidator(validator, data, function (err) {
    if (err) {
      return callback(err);
    }

    doValidation();
  });
};

var validateDefinitions = function validateDefinitions (documentMetadata, results) {
  // Validate unused definitions
  _.each(documentMetadata.definitions, function (metadata, id) {
    var defPath = JsonRefs.pathFromPointer(id);
    var defType = defPath[0].substring(0, defPath[0].length - 1);
    var displayId = documentMetadata.swaggerVersion === '1.2' ? defPath[defPath.length - 1] : id;
    var code = defType === 'securityDefinition' ? 'SECURITY_DEFINITION' : defType.toUpperCase();
    var msgPrefix = defType === 'securityDefinition' ?
                             'Security definition' :
                             defType.charAt(0).toUpperCase() + defType.substring(1);

    if (metadata.references.length === 0) {
      // Swagger 1.2 authorization scope
      if (metadata.scopePath) {
        code += '_SCOPE';
        msgPrefix += ' scope';
        defPath = metadata.scopePath;
      }

      createUnusedErrorOrWarning(displayId, code, msgPrefix, defPath, results.warnings);
    }
  });
};

var validateParameters = function validateParameters (spec, documentMetadata, nPath, parameters, path, results,
                                                      skipMissing) {
  var pathParams = [];

  _.reduce(parameters, function (seenParameters, parameter, index) {
    var pPath = path.concat(['parameters', index.toString()]);

    // Unresolved parameter
    if (_.isUndefined(parameter)) {
      return;
    }

    // Identify duplicate parameter names
    validateNoExist(seenParameters, parameter.name, 'PARAMETER', 'Parameter', pPath.concat('name'),
                    results.errors);

    // Keep track of path parameters
    if (parameter.paramType === 'path' || parameter.in === 'path') {
      if (nPath.args.indexOf(parameter.name) === -1) {
        createErrorOrWarning('UNRESOLVABLE_API_PATH_PARAMETER',
                             'API path parameter could not be resolved: ' + parameter.name, pPath.concat('name'),
                             results.errors);
      }

      pathParams.push(parameter.name);
    }

    // Validate parameter constraints
    validateSchemaConstraints(documentMetadata, parameter, pPath, results, parameter.skipErrors);

    return seenParameters.concat(parameter.name);
  }, []);

  // Validate missing path parameters (in path but not in operation.parameters)
  if (_.isUndefined(skipMissing) || skipMissing === false) {
    _.each(_.difference(nPath.args, pathParams), function (unused) {
      createErrorOrWarning('MISSING_API_PATH_PARAMETER', 'API requires path parameter but it is not defined: ' + unused,
                           documentMetadata.swaggerVersion === '1.2' ? path.slice(0, 2).concat('path') : path,
                           results.errors);
    });
  }
};

var validateSwagger1_2 = function validateSwagger1_2 (spec, resourceListing, apiDeclarations, callback) { // jshint ignore:line
  var adResourcePaths = [];
  var rlDocumentMetadata = getDocumentCache(resourceListing);
  var rlResourcePaths = [];
  var results = {
    errors: [],
    warnings: [],
    apiDeclarations: []
  };

  // Process Resource Listing resource definitions
  rlResourcePaths = _.reduce(resourceListing.apis, function (seenPaths, api, index) {
    // Identify duplicate resource paths defined in the Resource Listing
    validateNoExist(seenPaths, api.path, 'RESOURCE_PATH', 'Resource path', ['apis', index.toString(), 'path'],
                    results.errors);

    seenPaths.push(api.path);

    return seenPaths;
  }, []);

  // Process Resource Listing definitions (authorizations)
  processDocument(rlDocumentMetadata, results);


  // Process each API Declaration
  adResourcePaths = _.reduce(apiDeclarations, function (seenResourcePaths, apiDeclaration, index) {
    var aResults = results.apiDeclarations[index] = {
      errors: [],
      warnings: []
    };
    var adDocumentMetadata = getDocumentCache(apiDeclaration);

    // Identify duplicate resource paths defined in the API Declarations
    validateNoExist(seenResourcePaths, apiDeclaration.resourcePath, 'RESOURCE_PATH', 'Resource path',
                    ['resourcePath'], aResults.errors);

    if (adResourcePaths.indexOf(apiDeclaration.resourcePath) === -1) {
      // Identify unused resource paths defined in the API Declarations
      validateExist(rlResourcePaths, apiDeclaration.resourcePath, 'RESOURCE_PATH', 'Resource path',
                    ['resourcePath'], aResults.errors);

      seenResourcePaths.push(apiDeclaration.resourcePath);
    }

    // TODO: Process authorization references
    // Not possible due to https://github.com/swagger-api/swagger-spec/issues/159

    // Process models
    processDocument(adDocumentMetadata, aResults);

    // Process the API definitions
    _.reduce(apiDeclaration.apis, function (seenPaths, api, index) {
      var aPath = ['apis', index.toString()];
      var nPath = normalizePath(api.path);

      // Validate duplicate resource path
      if (seenPaths.indexOf(nPath.path) > -1) {
        createErrorOrWarning('DUPLICATE_API_PATH', 'API path (or equivalent) already defined: ' + api.path,
                             aPath.concat('path'), aResults.errors);
      } else {
        seenPaths.push(nPath.path);
      }

      // Process the API operations
      _.reduce(api.operations, function (seenMethods, operation, index) {
        var oPath = aPath.concat(['operations', index.toString()]);

        // Validate duplicate operation method
        validateNoExist(seenMethods, operation.method, 'OPERATION_METHOD', 'Operation method', oPath.concat('method'),
                        aResults.errors);

        // Keep track of the seen methods
        seenMethods.push(operation.method);

        // Keep track of operation types
        if (spec.primitives.indexOf(operation.type) === -1 && spec.version === '1.2') {
          addReference(adDocumentMetadata, '#/models/' + operation.type, oPath.concat('type'), aResults);
        }

        // Process authorization references
        processAuthRefs(rlDocumentMetadata, operation.authorizations, oPath.concat('authorizations'), aResults);

        // Validate validate inline constraints
        validateSchemaConstraints(adDocumentMetadata, operation, oPath, aResults);

        // Validate parameters
        validateParameters(spec, adDocumentMetadata, nPath, operation.parameters, oPath, aResults);

        // Validate unique response code
        _.reduce(operation.responseMessages, function (seenResponseCodes, responseMessage, index) {
          var rmPath = oPath.concat(['responseMessages', index.toString()]);

          validateNoExist(seenResponseCodes, responseMessage.code, 'RESPONSE_MESSAGE_CODE', 'Response message code',
                          rmPath.concat(['code']), aResults.errors);

          // Validate missing model
          if (responseMessage.responseModel) {
            addReference(adDocumentMetadata, '#/models/' + responseMessage.responseModel,
                         rmPath.concat('responseModel'), aResults);
          }

          return seenResponseCodes.concat(responseMessage.code);
        }, []);

        return seenMethods;
      }, []);

      return seenPaths;
    }, []);

    // Validate API Declaration definitions
    validateDefinitions(adDocumentMetadata, aResults);

    return seenResourcePaths;
  }, []);

  // Validate API Declaration definitions
  validateDefinitions(rlDocumentMetadata, results);

  // Identify unused resource paths defined in the Resource Listing
  _.each(_.difference(rlResourcePaths, adResourcePaths), function (unused) {
    var index = rlResourcePaths.indexOf(unused);

    createUnusedErrorOrWarning(resourceListing.apis[index].path, 'RESOURCE_PATH', 'Resource path',
                               ['apis', index.toString(), 'path'], results.errors);
  });

  callback(undefined, results);
};

var validateSwagger2_0 = function validateSwagger2_0 (spec, swaggerObject, callback) { // jshint ignore:line
  var documentMetadata = getDocumentCache(swaggerObject);
  var results = {
    errors: [],
    warnings: []
  };

  // Process definitions
  processDocument(documentMetadata, results);

  // Process security references
  processAuthRefs(documentMetadata, swaggerObject.security, ['security'], results);

  _.reduce(documentMetadata.resolved.paths, function (seenPaths, path, name) {
    var pPath = ['paths', name];
    var nPath = normalizePath(name);

    // Validate duplicate resource path
    if (seenPaths.indexOf(nPath.path) > -1) {
      createErrorOrWarning('DUPLICATE_API_PATH', 'API path (or equivalent) already defined: ' + name, pPath,
                           results.errors);
    }

    // Validate parameters
    validateParameters(spec, documentMetadata, nPath, path.parameters, pPath, results, true);

    // Validate the Operations
    _.each(path, function (operation, method) {
      var cParams = [];
      var oPath = pPath.concat(method);
      var seenParams = [];

      if (validOptionNames.indexOf(method) === -1) {
        return;
      }

      // Process security references
      processAuthRefs(documentMetadata, operation.security, oPath.concat('security'), results);

      // Compose parameters from path global parameters and operation parameters
      _.each(operation.parameters, function (parameter) {
        cParams.push(parameter);

        seenParams.push(parameter.name + ':' + parameter.in);
      });

      _.each(path.parameters, function (parameter) {
        var cloned = _.cloneDeep(parameter);

        // The only errors that can occur here are schema constraint validation errors which are already reported above
        // so do not report them again.
        cloned.skipErrors = true;

        if (seenParams.indexOf(parameter.name + ':' + parameter.in) === -1) {
          cParams.push(cloned);
        }
      });

      // Validate parameters
      validateParameters(spec, documentMetadata, nPath, cParams, oPath, results);

      // Validate responses
      _.each(operation.responses, function (response, responseCode) {
	// Do not process references to missing responses
	if (!_.isUndefined(response)) {
          // Validate validate inline constraints
          validateSchemaConstraints(documentMetadata, response, oPath.concat('responses', responseCode), results);
	}
      });
    });

    return seenPaths.concat(nPath.path);
  }, []);

  // Validate definitions
  validateDefinitions(documentMetadata, results);

  callback(undefined, results);
};

var validateSemantically = function validateSemantically (spec, rlOrSO, apiDeclarations, callback) {
  var cbWrapper = function cbWrapper (err, results) {
    callback(err, helpers.formatResults(results));
  };
  if (spec.version === '1.2') {
    validateSwagger1_2(spec, rlOrSO, apiDeclarations, cbWrapper); // jshint ignore:line
  } else {
    validateSwagger2_0(spec, rlOrSO, cbWrapper); // jshint ignore:line
  }
};

var validateStructurally = function validateStructurally (spec, rlOrSO, apiDeclarations, callback) {
  validateAgainstSchema(spec, spec.version === '1.2' ? 'resourceListing.json' : 'schema.json', rlOrSO,
                        function (err, results) {
                          if (err) {
                            return callback(err);
                          }

                          // Only validate the API Declarations if the API is 1.2 and the Resource Listing was valid
                          if (!results && spec.version === '1.2') {
                            results = {
                              errors: [],
                              warnings: [],
                              apiDeclarations: []
                            };

                            async.map(apiDeclarations, function (apiDeclaration, callback) {
                              validateAgainstSchema(spec, 'apiDeclaration.json', apiDeclaration, callback);
                            }, function (err, allResults) {
                              if (err) {
                                return callback(err);
                              }

                              _.each(allResults, function (result, index) {
                                results.apiDeclarations[index] = result;
                              });

                              callback(undefined, results);
                            });
                          } else {
                            callback(undefined, results);
                          }
                        });
};

/**
 * Callback used by all json-refs functions.
 *
 * @param {error} [err] - The error if there is a problem
 * @param {*} [result] - The result of the function
 *
 * @callback resultCallback
 */

/**
 * Creates a new Swagger specification object.
 *
 * @param {string} version - The Swagger version
 *
 * @constructor
 */
var Specification = function Specification (version) {
  var createValidators = function createValidators (spec, validatorsMap) {
    return _.reduce(validatorsMap, function (result, schemas, schemaName) {
      result[schemaName] = helpers.createJsonValidator(schemas);

      return result;
    }.bind(this), {});
  };
  var fixSchemaId = function fixSchemaId (schemaName) {
    // Swagger 1.2 schema files use one id but use a different id when referencing schema files.  We also use the schema
    // file name to reference the schema in ZSchema.  To fix this so that the JSON Schema validator works properly, we
    // need to set the id to be the name of the schema file.
    var fixed = _.cloneDeep(this.schemas[schemaName]);

    fixed.id = schemaName;

    return fixed;
  }.bind(this);
  var primitives = ['string', 'number', 'boolean', 'integer', 'array'];

  switch (version) {
  case '1.2':
    this.docsUrl = 'https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md';
    this.primitives = _.union(primitives, ['void', 'File']);
    this.schemasUrl = 'https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2';

    // Here explicitly to allow browserify to work
    this.schemas = {
      'apiDeclaration.json': require('../schemas/1.2/apiDeclaration.json'),
      'authorizationObject.json': require('../schemas/1.2/authorizationObject.json'),
      'dataType.json': require('../schemas/1.2/dataType.json'),
      'dataTypeBase.json': require('../schemas/1.2/dataTypeBase.json'),
      'infoObject.json': require('../schemas/1.2/infoObject.json'),
      'modelsObject.json': require('../schemas/1.2/modelsObject.json'),
      'oauth2GrantType.json': require('../schemas/1.2/oauth2GrantType.json'),
      'operationObject.json': require('../schemas/1.2/operationObject.json'),
      'parameterObject.json': require('../schemas/1.2/parameterObject.json'),
      'resourceListing.json': require('../schemas/1.2/resourceListing.json'),
      'resourceObject.json': require('../schemas/1.2/resourceObject.json')
    };

    this.validators = createValidators(this, {
      'apiDeclaration.json': _.map([
        'dataTypeBase.json',
        'modelsObject.json',
        'oauth2GrantType.json',
        'authorizationObject.json',
        'parameterObject.json',
        'operationObject.json',
        'apiDeclaration.json'
      ], fixSchemaId),
      'resourceListing.json': _.map([
        'resourceObject.json',
        'infoObject.json',
        'oauth2GrantType.json',
        'authorizationObject.json',
        'resourceListing.json'
      ], fixSchemaId)
    });

    break;

  case '2.0':
    this.docsUrl = 'https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md';
    this.primitives = _.union(primitives, ['file']);
    this.schemasUrl = 'https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0';

    // Here explicitly to allow browserify to work
    this.schemas = {
      'schema.json': require('../schemas/2.0/schema.json')
    };

    this.validators = createValidators(this, {
      'schema.json': [fixSchemaId('schema.json')]
    });

    break;

  default:
    throw new Error(version + ' is an unsupported Swagger specification version');
  }

  this.version = version;
};

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
Specification.prototype.validate = function validate (rlOrSO, apiDeclarations, callback) {
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
    callback = arguments[1];
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

  // Perform the validation
  validateStructurally(this, rlOrSO, apiDeclarations, function (err, result) {
    if (err || helpers.formatResults(result)) {
      callback(err, result);
    } else {
      validateSemantically(this, rlOrSO, apiDeclarations, callback);
    }
  }.bind(this));
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
Specification.prototype.composeModel = function composeModel (apiDOrSO, modelIdOrRef, callback) {
  var swaggerVersion = helpers.getSwaggerVersion(apiDOrSO);
  var doComposition = function doComposition (err, results) {
    var documentMetadata;

    if (err) {
      return callback(err);
    } else if (helpers.getErrorCount(results) > 0) {
      return handleValidationError(results, callback);
    }

    documentMetadata = getDocumentCache(apiDOrSO);
    results = {
      errors: [],
      warnings: []
    };

    processDocument(documentMetadata, results);

    if (!documentMetadata.definitions[modelIdOrRef]) {
      return callback();
    }

    if (helpers.getErrorCount(results) > 0) {
      return handleValidationError(results, callback);
    }

    callback(undefined, getOrComposeSchema(documentMetadata, modelIdOrRef));
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
      modelIdOrRef = '#/models/' + modelIdOrRef;
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
 * @param {object} data - The model to validate
 * @param {resultCallback} callback - The result callback
 *
 * @returns undefined if validation passes or an object containing errors and/or warnings
 *
 * @throws Error if there are validation errors while creating
 */
Specification.prototype.validateModel = function validateModel (apiDOrSO, modelIdOrRef, data, callback) {
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

  this.composeModel(apiDOrSO, modelIdOrRef, function (err, result) {
    if (err) {
      return callback(err);
    }

    validateAgainstSchema(this, result, data, callback);
  }.bind(this));
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
Specification.prototype.resolve = function resolve (document, ptr, callback) {
  var documentMetadata;
  var schemaName;
  var respond = function respond (document) {
    if (_.isString(ptr)) {
      return callback(undefined, traverse(document).get(JsonRefs.pathFromPointer(ptr)));
    } else {
      return callback(undefined, document);
    }
  };

  // Validate arguments
  if (_.isUndefined(document)) {
    throw new Error('document is required');
  } else if (!_.isPlainObject(document)) {
    throw new TypeError('document must be an object');
  }

  if (arguments.length === 2) {
    callback = arguments[1];
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

  documentMetadata = getDocumentCache(document);

  // Swagger 1.2 is not supported due to invalid JSON References being used.  Even if the JSON References were valid,
  // the JSON Schema for Swagger 1.2 do not allow JavaScript objects in all places where the resoution would occur.
  if (documentMetadata.swaggerVersion === '1.2') {
    throw new Error('Swagger 1.2 is not supported');
  }

  if (!documentMetadata.resolved) {
    if (documentMetadata.swaggerVersion === '1.2') {
      if (_.find(['basePath', 'consumes', 'models', 'produces', 'resourcePath'], function (name) {
        return !_.isUndefined(document[name]);
      })) {
        schemaName = 'apiDeclaration.json';
      } else {
        schemaName = 'resourceListing.json';
      }
    } else {
      schemaName = 'schema.json';
    }

    // Ensure the document is valid first
    this.validate(document, function (err, results) {
      if (err) {
        return callback(err);
      } else if (helpers.getErrorCount(results) > 0) {
        return handleValidationError(results, callback);
      }

      return respond(documentMetadata.resolved);
    });
  } else {
    return respond(documentMetadata.resolved);
  }
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
Specification.prototype.convert = function (resourceListing, apiDeclarations, skipValidation, callback) {
  var doConvert = function doConvert (resourceListing, apiDeclarations) {
    callback(undefined, swaggerConverter(resourceListing, apiDeclarations));
  }.bind(this);

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
    this.validate(resourceListing, apiDeclarations, function (err, results) {
      if (err) {
        return callback(err);
      } else if (helpers.getErrorCount(results) > 0) {
        return handleValidationError(results, callback);
      }

      doConvert(resourceListing, apiDeclarations);
    });
  }
};

module.exports.v1 = module.exports.v1_2 = new Specification('1.2'); // jshint ignore:line
module.exports.v2 = module.exports.v2_0 = new Specification('2.0'); // jshint ignore:line

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../schemas/1.2/apiDeclaration.json":5,"../schemas/1.2/authorizationObject.json":6,"../schemas/1.2/dataType.json":7,"../schemas/1.2/dataTypeBase.json":8,"../schemas/1.2/infoObject.json":9,"../schemas/1.2/modelsObject.json":10,"../schemas/1.2/oauth2GrantType.json":11,"../schemas/1.2/operationObject.json":12,"../schemas/1.2/parameterObject.json":13,"../schemas/1.2/resourceListing.json":14,"../schemas/1.2/resourceObject.json":15,"../schemas/2.0/schema.json":16,"./helpers":2,"./validators":3}],2:[function(require,module,exports){
(function (process,global){
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

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);
var JsonRefs = (typeof window !== "undefined" ? window.JsonRefs : typeof global !== "undefined" ? global.JsonRefs : null);
var ZSchema = (typeof window !== "undefined" ? window.ZSchema : typeof global !== "undefined" ? global.ZSchema : null);

var draft04Json = require('../schemas/json-schema-draft-04.json');
var draft04Url = 'http://json-schema.org/draft-04/schema';
var specCache = {};

module.exports.createJsonValidator = function createJsonValidator (schemas) {
  var validator = new ZSchema({
    reportPathAsArray: true
  });
  var result;

  // Add the draft-04 spec
  validator.setRemoteReference(draft04Url, draft04Json);

  // Swagger uses some unsupported/invalid formats so just make them all pass
  _.each(['byte', 'double', 'float', 'int32', 'int64', 'mime-type', 'uri-template'], function (format) {
    ZSchema.registerFormat(format, function () {
      return true;
    });
  });

  // Compile and validate the schemas
  if (!_.isUndefined(schemas)) {
    result = validator.compileSchema(schemas);

    // If there is an error, it's unrecoverable so just blow the eff up
    if (result === false) {
      console.error('JSON Schema file' + (schemas.length > 1 ? 's are' : ' is') + ' invalid:');

      _.each(validator.getLastErrors(), function (err) {
        console.error('  ' + (_.isArray(err.path) ? JsonRefs.pathToPointer(err.path) : err.path) + ': ' + err.message);
      });

      throw new Error('Unable to create validator due to invalid JSON Schema');
    }
  }

  return validator;
};

module.exports.formatResults = function formatResults (results) {
  if (results) {
    // Update the results based on its content to indicate success/failure accordingly
    return results.errors.length + results.warnings.length +
    _.reduce(results.apiDeclarations, function (count, aResult) {
      if (aResult) {
        count += aResult.errors.length + aResult.warnings.length;
      }

      return count;
    }, 0) > 0 ? results : undefined;
  }

  return results;
};

module.exports.getErrorCount = function getErrorCount (results) {
  var errors = 0;

  if (results) {
    errors = results.errors.length;

    _.each(results.apiDeclarations, function (adResults) {
      if (adResults) {
        errors += adResults.errors.length;
      }
    });
  }

  return errors;
};

/**
 * Returns the proper specification based on the human readable version.
 *
 * @param {string} version - The human readable Swagger version (Ex: 1.2)
 *
 * @returns the corresponding Swagger Specification object or undefined if there is none
 */
module.exports.getSpec = function getSpec (version) {
  var spec = specCache[version];

  if (_.isUndefined(spec)) {
    switch (version) {
    case '1.2':
      spec = require('../lib/specs').v1_2; // jshint ignore:line

      break;

    case '2.0':
      spec = require('../lib/specs').v2_0; // jshint ignore:line

      break;
    }
  }

  return spec;
};

/**
 * Atempts to figure out the Swagger version from the Swagger document.
 *
 * @param {object} document - The Swagger document
 *
 * @returns the Swagger version or undefined if the document is not a Swagger document
 */
module.exports.getSwaggerVersion = function getSwaggerVersion (document) {
  return _.isPlainObject(document) ? document.swaggerVersion || document.swagger : undefined;
};

/**
 * Takes an array of path segments and creates a JSON pointer from it. (2.0 only)
 *
 * @param {string[]} path - The path segments
 *
 * @returns a JSON pointer for the reference denoted by the path segments
 */
var toJsonPointer = module.exports.toJsonPointer = function toJsonPointer (path) {
  // http://tools.ietf.org/html/rfc6901#section-4
  return '#/' + path.map(function (part) {
    return part.replace(/~/g, '~0').replace(/\//g, '~1');
  }).join('/');
};

module.exports.printValidationResults = function printValidationResults (version, apiDOrSO, apiDeclarations, results,
                                                                         printSummary, endProcess) {
  var pluralize = function pluralize (string, count) {
    return count === 1 ? string : string + 's';
  };
  var printErrorsOrWarnings = function printErrorsOrWarnings (header, entries, indent) {
    if (header) {
      console.error(header + ':');
      console.error();
    }

    _.each(entries, function (entry) {
      console.error(new Array(indent + 1).join(' ') + toJsonPointer(entry.path) + ': ' + entry.message);

      if (entry.inner) {
        printErrorsOrWarnings (undefined, entry.inner, indent + 2);
      }
    });

    if (header) {
      console.error();
    }
  };
  var errorCount = 0;
  var warningCount = 0;

  console.error();

  if (results.errors.length > 0) {
    errorCount += results.errors.length;

    printErrorsOrWarnings('API Errors', results.errors, 2);
  }

  if (results.warnings.length > 0) {
    warningCount += results.warnings.length;

    printErrorsOrWarnings('API Warnings', results.warnings, 2);
  }

  if (results.apiDeclarations) {
    results.apiDeclarations.forEach(function (adResult, index) {
      if (!adResult) {
        return;
      }

      var name = apiDeclarations[index].resourcePath || index;

      if (adResult.errors.length > 0) {
        errorCount += adResult.errors.length;

        printErrorsOrWarnings('  API Declaration (' + name + ') Errors', adResult.errors, 4);
      }

      if (adResult.warnings.length > 0) {
        warningCount += adResult.warnings.length;

        printErrorsOrWarnings('  API Declaration (' + name + ') Warnings', adResult.warnings, 4);
      }
    });
  }

  if (printSummary) {
    if (errorCount > 0) {
      console.error(errorCount + ' ' + pluralize('error', errorCount) + ' and ' + warningCount + ' ' +
                    pluralize('warning', warningCount));
    } else {
      console.error('Validation succeeded but with ' + warningCount + ' ' + pluralize('warning', warningCount));
    }
  }

  if (errorCount > 0 && endProcess) {
    process.exit(1);
  }
};

module.exports.swaggerOperationMethods = [
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT'
];

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lib/specs":undefined,"../schemas/json-schema-draft-04.json":17,"_process":4}],3:[function(require,module,exports){
(function (global){
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

'use strict';

var _ = (typeof window !== "undefined" ? window._ : typeof global !== "undefined" ? global._ : null);
var helpers = require('./helpers');

// http://tools.ietf.org/html/rfc3339#section-5.6
var dateRegExp = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
// http://tools.ietf.org/html/rfc3339#section-5.6
var dateTimeRegExp = /^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/;
var isValidDate = function isValidDate (date) {
  var day;
  var matches;
  var month;

  if (!_.isString(date)) {
    date = date.toString();
  }

  matches = dateRegExp.exec(date);

  if (matches === null) {
      return false;
  }

  day = matches[3];
  month = matches[2];

  if (month < '01' || month > '12' || day < '01' || day > '31') {
    return false;
  }

  return true;
};
var isValidDateTime = function isValidDateTime (dateTime) {
  var hour;
  var date;
  var time;
  var matches;
  var minute;
  var parts;
  var second;

  if (!_.isString(dateTime)) {
    dateTime = dateTime.toString();
  }

  parts = dateTime.toLowerCase().split('t');
  date = parts[0];
  time = parts.length > 1 ? parts[1] : undefined;

  if (!isValidDate(date)) {
      return false;
  }

  matches = dateTimeRegExp.exec(time);

  if (matches === null) {
      return false;
  }

  hour = matches[1];
  minute = matches[2];
  second = matches[3];

  if (hour > '23' || minute > '59' || second > '59') {
    return false;
  }

  return true;
};

var throwErrorWithCode = function throwErrorWithCode (code, msg) {
  var err = new Error(msg);

  err.code = code;
  err.failedValidation = true;

  throw err;
};

module.exports.validateAgainstSchema = function validateAgainstSchema (schemaOrName, data, validator) {
  var removeParams = function (obj) {
    delete obj.params;

    if (obj.inner) {
      _.each(obj.inner, function (nObj) {
	removeParams(nObj);
      });
    }
  };
  var schema = _.isPlainObject(schemaOrName) ? _.cloneDeep(schemaOrName) : schemaOrName;

  // We don't check this due to internal usage but if validator is not provided, schemaOrName must be a schema
  if (_.isUndefined(validator)) {
    validator = helpers.createJsonValidator([schema]);
  }

  var valid = validator.validate(data, schema);

  if (!valid) {
    try {
      throwErrorWithCode('SCHEMA_VALIDATION_FAILED', 'Failed schema validation');
    } catch (err) {
      err.results = {
	errors: _.map(validator.getLastErrors(), function (err) {
	  removeParams(err);

	  return err;
	}),
	warnings: []
      };

      throw err;
    }
  }
};


/**
 * Validates a schema of type array is properly formed (when necessar).
 *
 * *param {object} schema - The schema object to validate
 *
 * @throws Error if the schema says it's an array but it is not formed properly
 *
 * @see {@link https://github.com/swagger-api/swagger-spec/issues/174}
 */
var validateArrayType = module.exports.validateArrayType = function validateArrayType (schema) {
  // We have to do this manually for now
  if (schema.type === 'array' && _.isUndefined(schema.items)) {
    throwErrorWithCode('OBJECT_MISSING_REQUIRED_PROPERTY', 'Missing required property: items');
  }
};

/**
 * Validates the request or response content type (when necessary).
 *
 * @param {string[]} gPOrC - The valid consumes at the API scope
 * @param {string[]} oPOrC - The valid consumes at the operation scope
 * @param {object} reqOrRes - The request or response
 *
 * @throws Error if the content type is invalid
 */
module.exports.validateContentType = function validateContentType (gPOrC, oPOrC, reqOrRes) {
  // http://www.w3.org/Protocols/rfc2616/rfc2616-sec7.html#sec7.2.1
  var isResponse = typeof reqOrRes.end === 'function';
  var contentType = isResponse ? reqOrRes.getHeader('content-type') : reqOrRes.headers['content-type'];
  var pOrC = _.union(gPOrC, oPOrC);

  if (!contentType) {
    if (isResponse) {
      contentType = 'text/plain';
    } else {
      contentType = 'application/octet-stream';
    }
  }

  // Get only the content type
  contentType = contentType.split(';')[0];

  if (pOrC.length > 0 && (isResponse ?
			  true :
			  ['POST', 'PUT'].indexOf(reqOrRes.method) !== -1) && pOrC.indexOf(contentType) === -1) {
    throw new Error('Invalid content type (' + contentType + ').  These are valid: ' + pOrC.join(', '));
  }
};

/**
 * Validates the value against the allowable values (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {string[]} allowed - The allowable values
 *
 * @throws Error if the value is not allowable
 */
var validateEnum = module.exports.validateEnum = function validateEnum (val, allowed) {
  if (!_.isUndefined(allowed) && !_.isUndefined(val) && allowed.indexOf(val) === -1) {
    throwErrorWithCode('ENUM_MISMATCH', 'Not an allowable value (' + allowed.join(', ') + '): ' + val);
  }
};

/**
 * Validates the value is less than the maximum (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {string} maximum - The maximum value
 * @param {boolean} [exclusive=false] - Whether or not the value includes the maximum in its comparison
 *
 * @throws Error if the value is greater than the maximum
 */
var validateMaximum = module.exports.validateMaximum = function validateMaximum (val, maximum, type, exclusive) {
  var code = exclusive === true ? 'MAXIMUM_EXCLUSIVE' : 'MAXIMUM';
  var testMax;
  var testVal;

  if (_.isUndefined(exclusive)) {
    exclusive = false;
  }

  if (type === 'integer') {
    testVal = parseInt(val, 10);
  } else if (type === 'number') {
    testVal = parseFloat(val);
  }

  if (!_.isUndefined(maximum)) {
    testMax = parseFloat(maximum);

    if (exclusive && testVal >= testMax) {
      throwErrorWithCode(code, 'Greater than or equal to the configured maximum (' + maximum + '): ' + val);
    } else if (testVal > testMax) {
      throwErrorWithCode(code, 'Greater than the configured maximum (' + maximum + '): ' + val);
    }
  }
};

/**
 * Validates the array count is less than the maximum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} maxItems - The maximum number of items
 *
 * @throws Error if the value contains more items than allowable
 */
var validateMaxItems = module.exports.validateMaxItems = function validateMaxItems (val, maxItems) {
  if (!_.isUndefined(maxItems) && val.length > maxItems) {
    throwErrorWithCode('ARRAY_LENGTH_LONG', 'Array is too long (' + val.length + '), maximum ' + maxItems);
  }
};

/**
 * Validates the value length is less than the maximum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} maxLength - The maximum length
 *
 * @throws Error if the value's length is greater than the maximum
 */
var validateMaxLength = module.exports.validateMaxLength = function validateMaxLength (val, maxLength) {
  if (!_.isUndefined(maxLength) && val.length > maxLength) {
    throwErrorWithCode('MAX_LENGTH', 'String is too long (' + val.length + ' chars), maximum ' + maxLength);
  }
};

/**
 * Validates the value's property count is greater than the maximum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minProperties - The maximum number of properties
 *
 * @throws Error if the value's property count is less than the maximum
 */
var validateMaxProperties = module.exports.validateMaxProperties = function validateMaxLength (val, maxProperties) {
  var propCount = _.isPlainObject(val) ? Object.keys(val).length : 0;

  if (!_.isUndefined(maxProperties) && propCount > maxProperties) {
    throwErrorWithCode('MAX_PROPERTIES',
		       'Number of properties is too many (' + propCount + ' properties), maximum ' + maxProperties);
  }
};

/**
 * Validates the value array count is greater than the minimum (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {string} minimum - The minimum value
 * @param {boolean} [exclusive=false] - Whether or not the value includes the minimum in its comparison
 *
 * @throws Error if the value is less than the minimum
 */
var validateMinimum = module.exports.validateMinimum = function validateMinimum (val, minimum, type, exclusive) {
  var code = exclusive === true ? 'MINIMUM_EXCLUSIVE' : 'MINIMUM';
  var testMin;
  var testVal;

  if (_.isUndefined(exclusive)) {
    exclusive = false;
  }

  if (type === 'integer') {
    testVal = parseInt(val, 10);
  } else if (type === 'number') {
    testVal = parseFloat(val);
  }

  if (!_.isUndefined(minimum)) {
    testMin = parseFloat(minimum);

    if (exclusive && testVal <= testMin) {
      throwErrorWithCode(code, 'Less than or equal to the configured minimum (' + minimum + '): ' + val);
    } else if (testVal < testMin) {
      throwErrorWithCode(code, 'Less than the configured minimum (' + minimum + '): ' + val);
    }
  }
};

/**
 * Validates the value value contains fewer items than allowed (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minItems - The minimum number of items
 *
 * @throws Error if the value contains fewer items than allowable
 */
var validateMinItems = module.exports.validateMinItems = function validateMinItems (val, minItems) {
  if (!_.isUndefined(minItems) && val.length < minItems) {
    throwErrorWithCode('ARRAY_LENGTH_SHORT', 'Array is too short (' + val.length + '), minimum ' + minItems);
  }
};

/**
 * Validates the value length is less than the minimum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minLength - The minimum length
 *
 * @throws Error if the value's length is less than the minimum
 */
var validateMinLength = module.exports.validateMinLength = function validateMinLength (val, minLength) {
  if (!_.isUndefined(minLength) && val.length < minLength) {
    throwErrorWithCode('MIN_LENGTH', 'String is too short (' + val.length + ' chars), minimum ' + minLength);
  }
};

/**
 * Validates the value's property count is less than or equal to the minimum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minProperties - The minimum number of properties
 *
 * @throws Error if the value's property count is less than the minimum
 */
var validateMinProperties = module.exports.validateMinProperties = function validateMinLength (val, minProperties) {
  var propCount = _.isPlainObject(val) ? Object.keys(val).length : 0;

  if (!_.isUndefined(minProperties) && propCount < minProperties) {
    throwErrorWithCode('MIN_PROPERTIES',
		       'Number of properties is too few (' + propCount + ' properties), minimum ' + minProperties);
  }
};

/**
 * Validates the value is a multiple of the provided number (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} multipleOf - The number that should divide evenly into the value
 *
 * @throws Error if the value contains fewer items than allowable
 */
var validateMultipleOf = module.exports.validateMultipleOf = function validateMultipleOf (val, multipleOf) {
  if (!_.isUndefined(multipleOf) && val % multipleOf !== 0) {
    throwErrorWithCode('MULTIPLE_OF', 'Not a multiple of ' + multipleOf);
  }
};

/**
 * Validates the value matches a pattern (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*} val - The parameter value
 * @param {string} pattern - The pattern
 *
 * @throws Error if the value does not match the pattern
 */
var validatePattern = module.exports.validatePattern = function validatePattern (val, pattern) {
  if (!_.isUndefined(pattern) && _.isNull(val.match(new RegExp(pattern)))) {
    throwErrorWithCode('PATTERN', 'Does not match required pattern: ' + pattern);
  }
};

/**
 * Validates the value requiredness (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {boolean} required - Whether or not the parameter is required
 *
 * @throws Error if the value is required but is not present
 */
module.exports.validateRequiredness = function validateRequiredness (val, required) {
  if (!_.isUndefined(required) && required === true && _.isUndefined(val)) {
    throwErrorWithCode('REQUIRED', 'Is required');
  }
};

/**
 * Validates the value type and format (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {string} type - The parameter type
 * @param {string} format - The parameter format
 * @param {boolean} [skipError=false] - Whether or not to skip throwing an error (Useful for validating arrays)
 *
 * @throws Error if the value is not the proper type or format
 */
var validateTypeAndFormat = module.exports.validateTypeAndFormat =
  function validateTypeAndFormat (val, type, format, skipError) {
    var result = true;

    if (_.isArray(val)) {
      _.each(val, function (aVal, index) {
	if (!validateTypeAndFormat(aVal, type, format, true)) {
	  throwErrorWithCode('INVALID_TYPE', 'Value at index ' + index + ' is not a valid ' + type + ': ' + aVal);
	}
      });
    } else {
      switch (type) {
      case 'boolean':
	result = _.isBoolean(val) || ['false', 'true'].indexOf(val) !== -1;
	break;
      case 'integer':
	result = !_.isNaN(parseInt(val, 10));
	break;
      case 'number':
	result = !_.isNaN(parseFloat(val));
	break;
      case 'string':
	if (!_.isUndefined(format)) {
	  switch (format) {
	  case 'date':
	    result = isValidDate(val);
	    break;
	  case 'date-time':
	    result = isValidDateTime(val);
	    break;
	  }
	}
	break;
      case 'void':
	result = _.isUndefined(val);
	break;
      }
    }

    if (skipError) {
      return result;
    } else if (!result) {
      throwErrorWithCode('INVALID_TYPE',
			 type !== 'void' ?
			   'Not a valid ' + (_.isUndefined(format) ? '' : format + ' ') + type + ': ' + val :
			   'Void does not allow a value');
    }
  };

/**
 * Validates the value values are unique (when necessary).
 *
 * @param {string[]} val - The parameter value
 * @param {boolean} isUnique - Whether or not the parameter values are unique
 *
 * @throws Error if the value has duplicates
 */
var validateUniqueItems = module.exports.validateUniqueItems = function validateUniqueItems (val, isUnique) {
  if (!_.isUndefined(isUnique) && _.uniq(val).length !== val.length) {
    throwErrorWithCode('ARRAY_UNIQUE', 'Does not allow duplicate values: ' + val.join(', '));
  }
};

/**
 * Validates the value against the schema.
 *
 * @param {string} swaggerVersion - The Swagger version
 * @param {object} schema - The schema to use to validate things
 * @param {string[]} path - The path to the schema
 * @param {*} [val] - The value to validate or undefined to use the default value provided by the schema
 *
 * @throws Error if any validation failes
 */
module.exports.validateSchemaConstraints = function validateSchemaConstraints (swaggerVersion, schema, path, val) {
  var resolveSchema = function resolveSchema (schema) {
    var resolved = schema;

    if (resolved.schema) {
      path = path.concat(['schema']);

      resolved = resolveSchema(resolved.schema);
    }

    return resolved;
  };

  var type = schema.type;

  if (!type) {
    if (!schema.schema) {
      if (path[path.length - 2] === 'responses') {
	type = 'void';
      } else {
	type = 'object';
      }
    } else {
      schema = resolveSchema(schema);
      type = schema.type || 'object';
    }
  }

  try {
    // Always perform this check even if there is no value
    if (type === 'array') {
      validateArrayType(schema);
    }

    // Default to default value if necessary
    if (_.isUndefined(val)) {
      val = swaggerVersion === '1.2' ? schema.defaultValue : schema.default;

      path = path.concat([swaggerVersion === '1.2' ? 'defaultValue' : 'default']);
    }

    // If there is no explicit default value, return as all validations will fail
    if (_.isUndefined(val)) {
      return;
    }

    if (type === 'array') {
      if (!_.isUndefined(schema.items)) {
	validateTypeAndFormat(val, type === 'array' ? schema.items.type : type,
			      type === 'array' && schema.items.format ?
				schema.items.format :
				schema.format);
      } else {
	validateTypeAndFormat(val, type, schema.format);
      }
    } else {
      validateTypeAndFormat(val, type, schema.format);
    }

    // Validate enum
    validateEnum(val, schema.enum);

    // Validate maximum
    validateMaximum(val, schema.maximum, type, schema.exclusiveMaximum);


    // Validate maxItems (Swagger 2.0+)
    validateMaxItems(val, schema.maxItems);

    // Validate maxLength (Swagger 2.0+)
    validateMaxLength(val, schema.maxLength);

    // Validate maxProperties (Swagger 2.0+)
    validateMaxProperties(val, schema.maxProperties);

    // Validate minimum
    validateMinimum(val, schema.minimum, type, schema.exclusiveMinimum);

    // Validate minItems
    validateMinItems(val, schema.minItems);

    // Validate minLength (Swagger 2.0+)
    validateMinLength(val, schema.minLength);

    // Validate minProperties (Swagger 2.0+)
    validateMinProperties(val, schema.minProperties);

    // Validate multipleOf (Swagger 2.0+)
    validateMultipleOf(val, schema.multipleOf);

    // Validate pattern (Swagger 2.0+)
    validatePattern(val, schema.pattern);

    // Validate uniqueItems
    validateUniqueItems(val, schema.uniqueItems);
  } catch (err) {
    err.path = path;

    throw err;
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./helpers":2}],4:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],5:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/apiDeclaration.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "basePath", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apiVersion": { "type": "string" },
        "basePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^https?://"
        },
        "resourcePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^/"
        },
        "apis": {
            "type": "array",
            "items": { "$ref": "#/definitions/apiObject" }
        },
        "models": {
            "type": "object",
            "additionalProperties": {
                "$ref": "modelsObject.json#"
            }
        },
        "produces": { "$ref": "#/definitions/mimeTypeArray" },
        "consumes": { "$ref": "#/definitions/mimeTypeArray" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    },
    "additionalProperties": false,
    "definitions": {
        "apiObject": {
            "type": "object",
            "required": [ "path", "operations" ],
            "properties": {
                "path": {
                    "type": "string",
                    "format": "uri-template",
                    "pattern": "^/"
                },
                "description": { "type": "string" },
                "operations": {
                    "type": "array",
                    "items": { "$ref": "operationObject.json#" }
                }
            },
            "additionalProperties": false
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            },
            "uniqueItems": true
        }
    }
}

},{}],6:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/authorizationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "additionalProperties": {
        "oneOf": [
            {
                "$ref": "#/definitions/basicAuth"
            },
            {
                "$ref": "#/definitions/apiKey"
            },
            {
                "$ref": "#/definitions/oauth2"
            }
        ]
    },
    "definitions": {
        "basicAuth": {
            "required": [ "type" ],
            "properties": {
                "type": { "enum": [ "basicAuth" ] }
            },
            "additionalProperties": false
        },
        "apiKey": {
            "required": [ "type", "passAs", "keyname" ],
            "properties": {
                "type": { "enum": [ "apiKey" ] },
                "passAs": { "enum": [ "header", "query" ] },
                "keyname": { "type": "string" }
            },
            "additionalProperties": false
        },
        "oauth2": {
            "type": "object",
            "required": [ "type", "grantTypes" ],
            "properties": {
                "type": { "enum": [ "oauth2" ] },
                "scopes": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/oauth2Scope" }
                },
                "grantTypes": { "$ref": "oauth2GrantType.json#" }
            },
            "additionalProperties": false
        },
        "oauth2Scope": {
            "type": "object",
            "required": [ "scope" ],
            "properties": {
                "scope": { "type": "string" },
                "description": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}


},{}],7:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type as described by the specification (version 1.2)",
    "type": "object",
    "oneOf": [
        { "$ref": "#/definitions/refType" },
        { "$ref": "#/definitions/voidType" },
        { "$ref": "#/definitions/primitiveType" },
        { "$ref": "#/definitions/modelType" },
        { "$ref": "#/definitions/arrayType" }
    ],
    "definitions": {
        "refType": {
            "required": [ "$ref" ],
            "properties": {
                "$ref": { "type": "string" }
            },
            "additionalProperties": false
        },
        "voidType": {
            "enum": [ { "type": "void" } ]
        },
        "modelType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "type": "string",
                    "not": {
                        "enum": [ "boolean", "integer", "number", "string", "array" ]
                    }
                }
            },
            "additionalProperties": false
        },
        "primitiveType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "enum": [ "boolean", "integer", "number", "string" ]
                },
                "format": { "type": "string" },
                "defaultValue": {
                    "not": { "type": [ "array", "object", "null" ] }
                },
                "enum": {
                    "type": "array",
                    "items": { "type": "string" },
                    "minItems": 1,
                    "uniqueItems": true
                },
                "minimum": { "type": "string" },
                "maximum": { "type": "string" }
            },
            "additionalProperties": false,
            "dependencies": {
                "format": {
                    "oneOf": [
                        {
                            "properties": {
                                "type": { "enum": [ "integer" ] },
                                "format": { "enum": [ "int32", "int64" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "number" ] },
                                "format": { "enum": [ "float", "double" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "string" ] },
                                "format": {
                                    "enum": [ "byte", "date", "date-time" ]
                                }
                            }
                        }
                    ]
                },
                "enum": {
                    "properties": {
                        "type": { "enum": [ "string" ] }
                    }
                },
                "minimum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                },
                "maximum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                }
            }
        },
        "arrayType": {
            "required": [ "type", "items" ],
            "properties": {
                "type": { "enum": [ "array" ] },
                "items": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/itemsObject" }
                },
                "uniqueItems": { "type": "boolean" }
            },
            "additionalProperties": false
        },
        "itemsObject": {
            "oneOf": [
                {
                    "$ref": "#/definitions/refType"
                },
                {
                    "allOf": [
                        {
                            "$ref": "#/definitions/primitiveType"
                        },
                        {
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}
},{}],8:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataTypeBase.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type fields (section 4.3.3)",
    "type": "object",
    "oneOf": [
        { "required": [ "type" ] },
        { "required": [ "$ref" ] }
    ],
    "properties": {
        "type": { "type": "string" },
        "$ref": { "type": "string" },
        "format": { "type": "string" },
        "defaultValue": {
            "not": { "type": [ "array", "object", "null" ] }
        },
        "enum": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true,
            "minItems": 1
        },
        "minimum": { "type": "string" },
        "maximum": { "type": "string" },
        "items": { "$ref": "#/definitions/itemsObject" },
        "uniqueItems": { "type": "boolean" }
    },
    "dependencies": {
        "format": {
            "oneOf": [
                {
                    "properties": {
                        "type": { "enum": [ "integer" ] },
                        "format": { "enum": [ "int32", "int64" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "number" ] },
                        "format": { "enum": [ "float", "double" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "string" ] },
                        "format": {
                            "enum": [ "byte", "date", "date-time" ]
                        }
                    }
                }
            ]
        }
    },
    "definitions": {
        "itemsObject": {
            "oneOf": [
                {
                    "type": "object",
                    "required": [ "$ref" ],
                    "properties": {
                        "$ref": { "type": "string" }
                    },
                    "additionalProperties": false
                },
                {
                    "allOf": [
                        { "$ref": "#" },
                        {
                            "required": [ "type" ],
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}

},{}],9:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/infoObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "info object (section 5.1.3)",
    "type": "object",
    "required": [ "title", "description" ],
    "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "termsOfServiceUrl": { "type": "string", "format": "uri" },
        "contact": { "type": "string", "format": "email" },
        "license": { "type": "string" },
        "licenseUrl": { "type": "string", "format": "uri" }
    },
    "additionalProperties": false
}
},{}],10:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/modelsObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "id", "properties" ],
    "properties": {
        "id": { "type": "string" },
        "description": { "type": "string" },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#/definitions/propertyObject" }
        },
        "subTypes": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true
        },
        "discriminator": { "type": "string" }
    },
    "dependencies": {
        "subTypes": [ "discriminator" ]
    },
    "definitions": {
        "propertyObject": {
            "allOf": [
                {
                    "not": { "$ref": "#" }
                },
                {
                    "$ref": "dataTypeBase.json#"
                }
            ]
        }
    }
}


},{}],11:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/oauth2GrantType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "minProperties": 1,
    "properties": {
        "implicit": { "$ref": "#/definitions/implicit" },
        "authorization_code": { "$ref": "#/definitions/authorizationCode" }
    },
    "definitions": {
        "implicit": {
            "type": "object",
            "required": [ "loginEndpoint" ],
            "properties": {
                "loginEndpoint": { "$ref": "#/definitions/loginEndpoint" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "authorizationCode": {
            "type": "object",
            "required": [ "tokenEndpoint", "tokenRequestEndpoint" ],
            "properties": {
                "tokenEndpoint": { "$ref": "#/definitions/tokenEndpoint" },
                "tokenRequestEndpoint": { "$ref": "#/definitions/tokenRequestEndpoint" }
            },
            "additionalProperties": false
        },
        "loginEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" }
            },
            "additionalProperties": false
        },
        "tokenEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "tokenRequestEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "clientIdName": { "type": "string" },
                "clientSecretName": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}
},{}],12:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/operationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "method", "nickname", "parameters" ],
            "properties": {
                "method": { "enum": [ "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS" ] },
                "summary": { "type": "string", "maxLength": 120 },
                "notes": { "type": "string" },
                "nickname": {
                    "type": "string",
                    "pattern": "^[a-zA-Z0-9_]+$"
                },
                "authorizations": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "array",
                        "items": {
                            "$ref": "authorizationObject.json#/definitions/oauth2Scope"
                        }
                    }
                },
                "parameters": {
                    "type": "array",
                    "items": { "$ref": "parameterObject.json#" }
                },
                "responseMessages": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/responseMessageObject"}
                },
                "produces": { "$ref": "#/definitions/mimeTypeArray" },
                "consumes": { "$ref": "#/definitions/mimeTypeArray" },
                "deprecated": { "enum": [ "true", "false" ] }
            }
        }
    ],
    "definitions": {
        "responseMessageObject": {
            "type": "object",
            "required": [ "code", "message" ],
            "properties": {
                "code": { "$ref": "#/definitions/rfc2616section10" },
                "message": { "type": "string" },
                "responseModel": { "type": "string" }
            }
        },
        "rfc2616section10": {
            "type": "integer",
            "minimum": 100,
            "maximum": 600,
            "exclusiveMaximum": true
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            },
            "uniqueItems": true
        }
    }
}

},{}],13:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/parameterObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "paramType", "name" ],
            "properties": {
                "paramType": {
                    "enum": [ "path", "query", "body", "header", "form" ]
                },
                "name": { "type": "string" },
                "description": { "type": "string" },
                "required": { "type": "boolean" },
                "allowMultiple": { "type": "boolean" }
            }
        },
        {
            "description": "type File requires special paramType and consumes",
            "oneOf": [
                {
                    "properties": {
                        "type": { "not": { "enum": [ "File" ] } }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "File" ] },
                        "paramType": { "enum": [ "form" ] },
                        "consumes": { "enum": [ "multipart/form-data" ] }
                    }
                }
            ]
        }
    ]
}

},{}],14:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceListing.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apis": {
            "type": "array",
            "items": { "$ref": "resourceObject.json#" }
        },
        "apiVersion": { "type": "string" },
        "info": { "$ref": "infoObject.json#" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    }
}

},{}],15:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "path" ],
    "properties": {
        "path": { "type": "string", "format": "uri" },
        "description": { "type": "string" }
    },
    "additionalProperties": false
}
},{}],16:[function(require,module,exports){
module.exports={
  "title": "A JSON Schema for Swagger 2.0 API.",
  "id": "http://swagger.io/v2/schema.json#",
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "required": [
    "swagger",
    "info",
    "paths"
  ],
  "additionalProperties": false,
  "patternProperties": {
    "^x-": {
      "$ref": "#/definitions/vendorExtension"
    }
  },
  "properties": {
    "swagger": {
      "type": "string",
      "enum": [
        "2.0"
      ],
      "description": "The Swagger version of this document."
    },
    "info": {
      "$ref": "#/definitions/info"
    },
    "host": {
      "type": "string",
      "format": "uri",
      "pattern": "^[^{}/ :\\\\]+(?::\\d+)?$",
      "description": "The fully qualified URI to the host of the API."
    },
    "basePath": {
      "type": "string",
      "pattern": "^/",
      "description": "The base path to the API. Example: '/api'."
    },
    "schemes": {
      "$ref": "#/definitions/schemesList"
    },
    "consumes": {
      "description": "A list of MIME types accepted by the API.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "produces": {
      "description": "A list of MIME types the API can produce.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "paths": {
      "$ref": "#/definitions/paths"
    },
    "definitions": {
      "$ref": "#/definitions/definitions"
    },
    "parameters": {
      "$ref": "#/definitions/parameterDefinitions"
    },
    "responses": {
      "$ref": "#/definitions/responseDefinitions"
    },
    "security": {
      "$ref": "#/definitions/security"
    },
    "securityDefinitions": {
      "$ref": "#/definitions/securityDefinitions"
    },
    "tags": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/tag"
      },
      "uniqueItems": true
    },
    "externalDocs": {
      "$ref": "#/definitions/externalDocs"
    }
  },
  "definitions": {
    "info": {
      "type": "object",
      "description": "General information about the API.",
      "required": [
        "version",
        "title"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "title": {
          "type": "string",
          "description": "A unique and precise title of the API."
        },
        "version": {
          "type": "string",
          "description": "A semantic version number of the API."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the API. Should be different from the title.  Github-flavored markdown is allowed."
        },
        "termsOfService": {
          "type": "string",
          "description": "The terms of service for the API."
        },
        "contact": {
          "$ref": "#/definitions/contact"
        },
        "license": {
          "$ref": "#/definitions/license"
        }
      }
    },
    "contact": {
      "type": "object",
      "description": "Contact information for the owners of the API.",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The identifying name of the contact person/organization."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the contact information.",
          "format": "uri"
        },
        "email": {
          "type": "string",
          "description": "The email address of the contact person/organization.",
          "format": "email"
        }
      }
    },
    "license": {
      "type": "object",
      "required": [
        "name"
      ],
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the license type. It's encouraged to use an OSI compatible license."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the license.",
          "format": "uri"
        }
      }
    },
    "paths": {
      "type": "object",
      "description": "Relative paths to the individual endpoints. They must be relative to the 'basePath'.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        },
        "^/": {
          "$ref": "#/definitions/pathItem"
        }
      },
      "additionalProperties": false
    },
    "definitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/schema"
      },
      "description": "One or more JSON objects describing the schemas being consumed and produced by the API."
    },
    "parameterDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/parameter"
      },
      "description": "One or more JSON representations for parameters"
    },
    "responseDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/response"
      },
      "description": "One or more JSON representations for parameters"
    },
    "externalDocs": {
      "type": "object",
      "additionalProperties": false,
      "description": "information about external documentation",
      "required": [
        "url"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "url": {
          "type": "string",
          "format": "uri"
        }
      }
    },
    "examples": {
      "type": "object",
      "patternProperties": {
        "^[a-z0-9-]+/[a-z0-9\\-+]+$": {}
      },
      "additionalProperties": false
    },
    "mimeType": {
      "type": "string",
      "pattern": "^[\\sa-z0-9\\-+;\\.=\\/]+$",
      "description": "The MIME type of the HTTP message."
    },
    "operation": {
      "type": "object",
      "required": [
        "responses"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "summary": {
          "type": "string",
          "description": "A brief summary of the operation."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the operation, github-flavored markdown is allowed."
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "operationId": {
          "type": "string",
          "description": "A friendly name of the operation"
        },
        "produces": {
          "description": "A list of MIME types the API can produce.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "consumes": {
          "description": "A list of MIME types the API can consume.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        },
        "responses": {
          "$ref": "#/definitions/responses"
        },
        "schemes": {
          "$ref": "#/definitions/schemesList"
        },
        "deprecated": {
          "type": "boolean",
          "default": false
        },
        "security": {
          "$ref": "#/definitions/security"
        }
      }
    },
    "pathItem": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "get": {
          "$ref": "#/definitions/operation"
        },
        "put": {
          "$ref": "#/definitions/operation"
        },
        "post": {
          "$ref": "#/definitions/operation"
        },
        "delete": {
          "$ref": "#/definitions/operation"
        },
        "options": {
          "$ref": "#/definitions/operation"
        },
        "head": {
          "$ref": "#/definitions/operation"
        },
        "patch": {
          "$ref": "#/definitions/operation"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        }
      }
    },
    "responses": {
      "type": "object",
      "description": "Response objects names can either be any valid HTTP status code or 'default'.",
      "minProperties": 1,
      "additionalProperties": false,
      "patternProperties": {
        "^([0-9]{3})$|^(default)$": {
          "$ref": "#/definitions/responseValue"
        },
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "not": {
        "type": "object",
        "additionalProperties": false,
        "patternProperties": {
          "^x-": {
            "$ref": "#/definitions/vendorExtension"
          }
        }
      }
    },
    "responseValue": {
      "oneOf": [
        {
          "$ref": "#/definitions/response"
        },
        {
          "$ref": "#/definitions/jsonReference"
        }
      ]
    },
    "response": {
      "type": "object",
      "required": [
        "description"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "schema": {
          "$ref": "#/definitions/schema"
        },
        "headers": {
          "$ref": "#/definitions/headers"
        },
        "examples": {
          "$ref": "#/definitions/examples"
        }
      },
      "additionalProperties": false
    },
    "headers": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/header"
      }
    },
    "header": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        },
        "description": {
          "type": "string"
        }
      }
    },
    "vendorExtension": {
      "description": "Any property starting with x- is valid.",
      "additionalProperties": true,
      "additionalItems": true
    },
    "bodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "schema"
      ],
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "body"
          ]
        },
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "schema": {
          "$ref": "#/definitions/schema"
        }
      },
      "additionalProperties": false
    },
    "headerParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "header"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "queryParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "query"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "formDataParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "formData"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array",
            "file"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "pathParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "enum": [
            true
          ],
          "description": "Determines whether or not this parameter is required or optional."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "path"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "nonBodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "type"
      ],
      "oneOf": [
        {
          "$ref": "#/definitions/headerParameterSubSchema"
        },
        {
          "$ref": "#/definitions/formDataParameterSubSchema"
        },
        {
          "$ref": "#/definitions/queryParameterSubSchema"
        },
        {
          "$ref": "#/definitions/pathParameterSubSchema"
        }
      ]
    },
    "parameter": {
      "oneOf": [
        {
          "$ref": "#/definitions/bodyParameter"
        },
        {
          "$ref": "#/definitions/nonBodyParameter"
        }
      ]
    },
    "schema": {
      "type": "object",
      "description": "A deterministic version of a JSON Schema object.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "format": {
          "type": "string"
        },
        "title": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
        },
        "description": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
        },
        "default": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
        },
        "multipleOf": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
        },
        "maximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "pattern": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
        },
        "maxItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "uniqueItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
        },
        "maxProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "required": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/stringArray"
        },
        "enum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
        },
        "type": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/type"
        },
        "items": {
          "anyOf": [
            {
              "$ref": "#/definitions/schema"
            },
            {
              "type": "array",
              "minItems": 1,
              "items": {
                "$ref": "#/definitions/schema"
              }
            }
          ],
          "default": {}
        },
        "allOf": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "#/definitions/schema"
          }
        },
        "properties": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/schema"
          },
          "default": {}
        },
        "discriminator": {
          "type": "string"
        },
        "readOnly": {
          "type": "boolean",
          "default": false
        },
        "xml": {
          "$ref": "#/definitions/xml"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "example": {}
      }
    },
    "primitivesItems": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "security": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/securityRequirement"
      },
      "uniqueItems": true
    },
    "securityRequirement": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "uniqueItems": true
      }
    },
    "xml": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string"
        },
        "namespace": {
          "type": "string"
        },
        "prefix": {
          "type": "string"
        },
        "attribute": {
          "type": "boolean",
          "default": false
        },
        "wrapped": {
          "type": "boolean",
          "default": false
        }
      }
    },
    "tag": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "securityDefinitions": {
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          {
            "$ref": "#/definitions/basicAuthenticationSecurity"
          },
          {
            "$ref": "#/definitions/apiKeySecurity"
          },
          {
            "$ref": "#/definitions/oauth2ImplicitSecurity"
          },
          {
            "$ref": "#/definitions/oauth2PasswordSecurity"
          },
          {
            "$ref": "#/definitions/oauth2ApplicationSecurity"
          },
          {
            "$ref": "#/definitions/oauth2AccessCodeSecurity"
          }
        ]
      }
    },
    "basicAuthenticationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "basic"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "apiKeySecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "name",
        "in"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "apiKey"
          ]
        },
        "name": {
          "type": "string"
        },
        "in": {
          "type": "string",
          "enum": [
            "header",
            "query"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ImplicitSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "implicit"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2PasswordSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "password"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ApplicationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "application"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2AccessCodeSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "accessCode"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2Scopes": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      }
    },
    "mediaTypeList": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/mimeType"
      },
      "uniqueItems": true
    },
    "parametersList": {
      "type": "array",
      "description": "The parameters needed to send a valid API call.",
      "minItems": 1,
      "additionalItems": false,
      "items": {
        "oneOf": [
          {
            "$ref": "#/definitions/parameter"
          },
          {
            "$ref": "#/definitions/jsonReference"
          }
        ]
      },
      "uniqueItems": true
    },
    "schemesList": {
      "type": "array",
      "description": "The transfer protocol of the API.",
      "items": {
        "type": "string",
        "enum": [
          "http",
          "https",
          "ws",
          "wss"
        ]
      },
      "uniqueItems": true
    },
    "collectionFormat": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes"
      ],
      "default": "csv"
    },
    "collectionFormatWithMulti": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes",
        "multi"
      ],
      "default": "csv"
    },
    "title": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
    },
    "description": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
    },
    "default": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
    },
    "multipleOf": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
    },
    "maximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
    },
    "exclusiveMaximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
    },
    "minimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
    },
    "exclusiveMinimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
    },
    "maxLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "pattern": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
    },
    "maxItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "uniqueItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
    },
    "enum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
    },
    "jsonReference": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "$ref": {
          "type": "string"
        }
      }
    }
  }
}

},{}],17:[function(require,module,exports){
module.exports={
    "id": "http://json-schema.org/draft-04/schema#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Core schema meta-schema",
    "definitions": {
        "schemaArray": {
            "type": "array",
            "minItems": 1,
            "items": { "$ref": "#" }
        },
        "positiveInteger": {
            "type": "integer",
            "minimum": 0
        },
        "positiveIntegerDefault0": {
            "allOf": [ { "$ref": "#/definitions/positiveInteger" }, { "default": 0 } ]
        },
        "simpleTypes": {
            "enum": [ "array", "boolean", "integer", "null", "number", "object", "string" ]
        },
        "stringArray": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "uniqueItems": true
        }
    },
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "format": "uri"
        },
        "$schema": {
            "type": "string",
            "format": "uri"
        },
        "title": {
            "type": "string"
        },
        "description": {
            "type": "string"
        },
        "default": {},
        "multipleOf": {
            "type": "number",
            "minimum": 0,
            "exclusiveMinimum": true
        },
        "maximum": {
            "type": "number"
        },
        "exclusiveMaximum": {
            "type": "boolean",
            "default": false
        },
        "minimum": {
            "type": "number"
        },
        "exclusiveMinimum": {
            "type": "boolean",
            "default": false
        },
        "maxLength": { "$ref": "#/definitions/positiveInteger" },
        "minLength": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "pattern": {
            "type": "string",
            "format": "regex"
        },
        "additionalItems": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "items": {
            "anyOf": [
                { "$ref": "#" },
                { "$ref": "#/definitions/schemaArray" }
            ],
            "default": {}
        },
        "maxItems": { "$ref": "#/definitions/positiveInteger" },
        "minItems": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "uniqueItems": {
            "type": "boolean",
            "default": false
        },
        "maxProperties": { "$ref": "#/definitions/positiveInteger" },
        "minProperties": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "required": { "$ref": "#/definitions/stringArray" },
        "additionalProperties": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "definitions": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "patternProperties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "dependencies": {
            "type": "object",
            "additionalProperties": {
                "anyOf": [
                    { "$ref": "#" },
                    { "$ref": "#/definitions/stringArray" }
                ]
            }
        },
        "enum": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true
        },
        "type": {
            "anyOf": [
                { "$ref": "#/definitions/simpleTypes" },
                {
                    "type": "array",
                    "items": { "$ref": "#/definitions/simpleTypes" },
                    "minItems": 1,
                    "uniqueItems": true
                }
            ]
        },
        "allOf": { "$ref": "#/definitions/schemaArray" },
        "anyOf": { "$ref": "#/definitions/schemaArray" },
        "oneOf": { "$ref": "#/definitions/schemaArray" },
        "not": { "$ref": "#" }
    },
    "dependencies": {
        "exclusiveMaximum": [ "maximum" ],
        "exclusiveMinimum": [ "minimum" ]
    },
    "default": {}
}

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuL2xpYi9zcGVjcy5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL2xpYi9oZWxwZXJzLmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbGliL3ZhbGlkYXRvcnMuanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvYXBpRGVjbGFyYXRpb24uanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9kYXRhVHlwZUJhc2UuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2luZm9PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL21vZGVsc09iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9vcGVyYXRpb25PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL3BhcmFtZXRlck9iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9yZXNvdXJjZU9iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8yLjAvc2NoZW1hLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ243Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaFBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMzhDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0IEFwaWdlZSBDb3Jwb3JhdGlvblxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuICogYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG4gKiBUSEUgU09GVFdBUkUuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Ll8gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLl8gOiBudWxsKTtcbnZhciBhc3luYyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LmFzeW5jIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5hc3luYyA6IG51bGwpO1xudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcbnZhciBKc29uUmVmcyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Lkpzb25SZWZzIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5Kc29uUmVmcyA6IG51bGwpO1xudmFyIFNwYXJrTUQ1ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuU3BhcmtNRDUgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlNwYXJrTUQ1IDogbnVsbCk7XG52YXIgc3dhZ2dlckNvbnZlcnRlciA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlN3YWdnZXJDb252ZXJ0ZXIuY29udmVydCA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuU3dhZ2dlckNvbnZlcnRlci5jb252ZXJ0IDogbnVsbCk7XG52YXIgdHJhdmVyc2UgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy50cmF2ZXJzZSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwudHJhdmVyc2UgOiBudWxsKTtcbnZhciB2YWxpZGF0b3JzID0gcmVxdWlyZSgnLi92YWxpZGF0b3JzJyk7XG5cbi8vIFdvcmsgYXJvdW5kIHN3YWdnZXItY29udmVydGVyIHBhY2thZ2luZyBpc3N1ZSAoQnJvd3NlciBidWlsZHMgb25seSlcbmlmIChfLmlzUGxhaW5PYmplY3Qoc3dhZ2dlckNvbnZlcnRlcikpIHtcbiAgc3dhZ2dlckNvbnZlcnRlciA9IGdsb2JhbC5Td2FnZ2VyQ29udmVydGVyLmNvbnZlcnQ7XG59XG5cbnZhciBkb2N1bWVudENhY2hlID0ge307XG52YXIgdmFsaWRPcHRpb25OYW1lcyA9IF8ubWFwKGhlbHBlcnMuc3dhZ2dlck9wZXJhdGlvbk1ldGhvZHMsIGZ1bmN0aW9uIChtZXRob2QpIHtcbiAgcmV0dXJuIG1ldGhvZC50b0xvd2VyQ2FzZSgpO1xufSk7XG5cbnZhciBhZGRFeHRlcm5hbFJlZnNUb1ZhbGlkYXRvciA9IGZ1bmN0aW9uIGFkZEV4dGVybmFsUmVmc1RvVmFsaWRhdG9yICh2YWxpZGF0b3IsIGpzb24sIGNhbGxiYWNrKSB7XG4gIHZhciByZW1vdGVSZWZzID0gXy5yZWR1Y2UoSnNvblJlZnMuZmluZFJlZnMoanNvbiksIGZ1bmN0aW9uIChyUmVmcywgcmVmLCBwdHIpIHtcbiAgICBpZiAoSnNvblJlZnMuaXNSZW1vdGVQb2ludGVyKHB0cikpIHtcbiAgICAgIHJSZWZzLnB1c2gocmVmLnNwbGl0KCcjJylbMF0pO1xuICAgIH1cblxuICAgIHJldHVybiByUmVmcztcbiAgfSwgW10pO1xuICB2YXIgcmVzb2x2ZVJlbW90ZVJlZnMgPSBmdW5jdGlvbiAocmVmLCBjYWxsYmFjaykge1xuICAgIEpzb25SZWZzLnJlc29sdmVSZWZzKHskcmVmOiByZWZ9LCBmdW5jdGlvbiAoZXJyLCBqc29uKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgfVxuXG4gICAgICAvLyBQZXJmb3JtIHRoZSBzYW1lIGZvciB0aGUgbmV3bHkgcmVzb2x2ZWQgZG9jdW1lbnRcbiAgICAgIGFkZEV4dGVybmFsUmVmc1RvVmFsaWRhdG9yKHZhbGlkYXRvciwganNvbiwgZnVuY3Rpb24gKGVyciwgckpzb24pIHtcbiAgICAgICAgY2FsbGJhY2soZXJyLCBySnNvbik7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfTtcblxuICBpZiAocmVtb3RlUmVmcy5sZW5ndGggPiAwKSB7XG4gICAgYXN5bmMubWFwKHJlbW90ZVJlZnMsIHJlc29sdmVSZW1vdGVSZWZzLCBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgfVxuXG4gICAgICBfLmVhY2gocmVzdWx0cywgZnVuY3Rpb24gKGpzb24sIGluZGV4KSB7XG4gICAgICAgIHZhbGlkYXRvci5zZXRSZW1vdGVSZWZlcmVuY2UocmVtb3RlUmVmc1tpbmRleF0sIGpzb24pO1xuICAgICAgfSk7XG5cbiAgICAgIGNhbGxiYWNrKCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2FsbGJhY2soKTtcbiAgfVxufTtcblxudmFyIGNyZWF0ZUVycm9yT3JXYXJuaW5nID0gZnVuY3Rpb24gY3JlYXRlRXJyb3JPcldhcm5pbmcgKGNvZGUsIG1lc3NhZ2UsIHBhdGgsIGRlc3QpIHtcbiAgZGVzdC5wdXNoKHtcbiAgICBjb2RlOiBjb2RlLFxuICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgcGF0aDogcGF0aFxuICB9KTtcbn07XG5cbnZhciBhZGRSZWZlcmVuY2UgPSBmdW5jdGlvbiBhZGRSZWZlcmVuY2UgKGNhY2hlRW50cnksIGRlZlBhdGhPclB0ciwgcmVmUGF0aE9yUHRyLCByZXN1bHRzLCBvbWl0RXJyb3IpIHtcbiAgdmFyIHJlc3VsdCA9IHRydWU7XG4gIHZhciBzd2FnZ2VyVmVyc2lvbiA9IGhlbHBlcnMuZ2V0U3dhZ2dlclZlcnNpb24oY2FjaGVFbnRyeS5yZXNvbHZlZCk7XG4gIHZhciBkZWZQYXRoID0gXy5pc0FycmF5KGRlZlBhdGhPclB0cikgPyBkZWZQYXRoT3JQdHIgOiBKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIoZGVmUGF0aE9yUHRyKTtcbiAgdmFyIGRlZlB0ciA9IF8uaXNBcnJheShkZWZQYXRoT3JQdHIpID8gSnNvblJlZnMucGF0aFRvUG9pbnRlcihkZWZQYXRoT3JQdHIpIDogZGVmUGF0aE9yUHRyO1xuICB2YXIgcmVmUGF0aCA9IF8uaXNBcnJheShyZWZQYXRoT3JQdHIpID8gcmVmUGF0aE9yUHRyIDogSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKHJlZlBhdGhPclB0cik7XG4gIHZhciByZWZQdHIgPSBfLmlzQXJyYXkocmVmUGF0aE9yUHRyKSA/IEpzb25SZWZzLnBhdGhUb1BvaW50ZXIocmVmUGF0aE9yUHRyKSA6IHJlZlBhdGhPclB0cjtcbiAgdmFyIGNvZGU7XG4gIHZhciBkZWY7XG4gIHZhciBkaXNwbGF5SWQ7XG4gIHZhciBtc2dQcmVmaXg7XG4gIHZhciB0eXBlO1xuXG4gIC8vIE9ubHkgcG9zc2libGUgd2hlbiBkZWZQYXRoT3JQdHIgaXMgYSBzdHJpbmcgYW5kIGlzIG5vdCBhIHJlYWwgcG9pbnRlclxuICBpZiAoZGVmUGF0aC5sZW5ndGggPT09IDApIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnSU5WQUxJRF9SRUZFUkVOQ0UnLCAnTm90IGEgdmFsaWQgSlNPTiBSZWZlcmVuY2UnLCByZWZQYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgZGVmID0gY2FjaGVFbnRyeS5kZWZpbml0aW9uc1tkZWZQdHJdO1xuICB0eXBlID0gZGVmUGF0aFswXTtcbiAgY29kZSA9IHR5cGUgPT09ICdzZWN1cml0eURlZmluaXRpb25zJyA/XG4gICAgICAgICAgICAgICAgICAgICdTRUNVUklUWV9ERUZJTklUSU9OJyA6XG4gICAgICAgICAgICAgICAgICAgIHR5cGUuc3Vic3RyaW5nKDAsIHR5cGUubGVuZ3RoIC0gMSkudG9VcHBlckNhc2UoKTtcbiAgZGlzcGxheUlkID0gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gZGVmUGF0aFtkZWZQYXRoLmxlbmd0aCAtIDFdIDogZGVmUHRyO1xuICBtc2dQcmVmaXggPSB0eXBlID09PSAnc2VjdXJpdHlEZWZpbml0aW9ucycgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICdTZWN1cml0eSBkZWZpbml0aW9uJyA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgY29kZS5jaGFyQXQoMCkgKyBjb2RlLnN1YnN0cmluZygxKS50b0xvd2VyQ2FzZSgpO1xuXG4gIC8vIFRoaXMgaXMgYW4gYXV0aG9yaXphdGlvbiBzY29wZSByZWZlcmVuY2VcbiAgaWYgKFsnYXV0aG9yaXphdGlvbnMnLCAnc2VjdXJpdHlEZWZpbml0aW9ucyddLmluZGV4T2YoZGVmUGF0aFswXSkgPiAtMSAmJiBkZWZQYXRoWzJdID09PSAnc2NvcGVzJykge1xuICAgIGNvZGUgKz0gJ19TQ09QRSc7XG4gICAgbXNnUHJlZml4ICs9ICcgc2NvcGUnO1xuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZGVmKSkge1xuICAgIGlmICghb21pdEVycm9yKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFXycgKyBjb2RlLCBtc2dQcmVmaXggKyAnIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIGRpc3BsYXlJZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZlBhdGgsIHJlc3VsdHMuZXJyb3JzKTtcbiAgICB9XG5cbiAgICByZXN1bHQgPSBmYWxzZTtcbiAgfSBlbHNlIHtcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChkZWYucmVmZXJlbmNlcykpIHtcbiAgICAgIGRlZi5yZWZlcmVuY2VzID0gW107XG4gICAgfVxuXG4gICAgZGVmLnJlZmVyZW5jZXMucHVzaChyZWZQdHIpO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbnZhciBnZXRPckNvbXBvc2VTY2hlbWEgPSBmdW5jdGlvbiBnZXRPckNvbXBvc2VTY2hlbWEgKGRvY3VtZW50TWV0YWRhdGEsIG1vZGVsSWQpIHtcbiAgdmFyIHRpdGxlID0gJ0NvbXBvc2VkICcgKyAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihtb2RlbElkKS5wb3AoKSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxJZCk7XG4gIHZhciBtZXRhZGF0YSA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbbW9kZWxJZF07XG4gIHZhciBvcmlnaW5hbFQgPSB0cmF2ZXJzZShkb2N1bWVudE1ldGFkYXRhLm9yaWdpbmFsKTtcbiAgdmFyIHJlc29sdmVkVCA9IHRyYXZlcnNlKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpO1xuICB2YXIgY29tcG9zZWQ7XG4gIHZhciBvcmlnaW5hbDtcblxuICBpZiAoIW1ldGFkYXRhKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIG9yaWdpbmFsID0gXy5jbG9uZURlZXAob3JpZ2luYWxULmdldChKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIobW9kZWxJZCkpKTtcbiAgY29tcG9zZWQgPSBfLmNsb25lRGVlcChyZXNvbHZlZFQuZ2V0KEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihtb2RlbElkKSkpO1xuXG4gIC8vIENvbnZlcnQgdGhlIFN3YWdnZXIgMS4yIGRvY3VtZW50IHRvIGEgdmFsaWQgSlNPTiBTY2hlbWEgZmlsZVxuICBpZiAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAvLyBDcmVhdGUgaW5oZXJpdGFuY2UgbW9kZWxcbiAgICBpZiAobWV0YWRhdGEubGluZWFnZS5sZW5ndGggPiAwKSB7XG4gICAgICBjb21wb3NlZC5hbGxPZiA9IFtdO1xuXG4gICAgICBfLmVhY2gobWV0YWRhdGEubGluZWFnZSwgZnVuY3Rpb24gKG1vZGVsSWQpIHtcbiAgICAgICAgY29tcG9zZWQuYWxsT2YucHVzaChnZXRPckNvbXBvc2VTY2hlbWEoZG9jdW1lbnRNZXRhZGF0YSwgbW9kZWxJZCkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIHRoZSBzdWJUeXBlcyBwcm9wZXJ0eVxuICAgIGRlbGV0ZSBjb21wb3NlZC5zdWJUeXBlcztcblxuICAgIF8uZWFjaChjb21wb3NlZC5wcm9wZXJ0aWVzLCBmdW5jdGlvbiAocHJvcGVydHksIG5hbWUpIHtcbiAgICAgIHZhciBvUHJvcCA9IG9yaWdpbmFsLnByb3BlcnRpZXNbbmFtZV07XG5cbiAgICAgIC8vIENvbnZlcnQgdGhlIHN0cmluZyB2YWx1ZXMgdG8gbnVtZXJpY2FsIHZhbHVlc1xuICAgICAgXy5lYWNoKFsnbWF4aW11bScsICdtaW5pbXVtJ10sIGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIGlmIChfLmlzU3RyaW5nKHByb3BlcnR5W3Byb3BdKSkge1xuICAgICAgICAgIHByb3BlcnR5W3Byb3BdID0gcGFyc2VGbG9hdChwcm9wZXJ0eVtwcm9wXSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBfLmVhY2goSnNvblJlZnMuZmluZFJlZnMob1Byb3ApLCBmdW5jdGlvbiAocmVmLCBwdHIpIHtcbiAgICAgICAgdmFyIG1vZGVsSWQgPSAnIy9tb2RlbHMvJyArIHJlZjtcbiAgICAgICAgdmFyIGRNZXRhZGF0YSA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbbW9kZWxJZF07XG4gICAgICAgIHZhciBwYXRoID0gSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKHB0cik7XG5cbiAgICAgICAgaWYgKGRNZXRhZGF0YS5saW5lYWdlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICB0cmF2ZXJzZShwcm9wZXJ0eSkuc2V0KHBhdGguc2xpY2UoMCwgcGF0aC5sZW5ndGggLSAxKSwgZ2V0T3JDb21wb3NlU2NoZW1hKGRvY3VtZW50TWV0YWRhdGEsIG1vZGVsSWQpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0cmF2ZXJzZShwcm9wZXJ0eSkuc2V0KHBhdGguc2xpY2UoMCwgcGF0aC5sZW5ndGggLSAxKS5jb25jYXQoJ3RpdGxlJyksICdDb21wb3NlZCAnICsgcmVmKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBTY3J1YiBpZCBwcm9wZXJ0aWVzXG4gIGNvbXBvc2VkID0gdHJhdmVyc2UoY29tcG9zZWQpLm1hcChmdW5jdGlvbiAodmFsKSB7XG4gICAgaWYgKHRoaXMua2V5ID09PSAnaWQnICYmIF8uaXNTdHJpbmcodmFsKSkge1xuICAgICAgdGhpcy5yZW1vdmUoKTtcbiAgICB9XG4gIH0pO1xuXG4gIGNvbXBvc2VkLnRpdGxlID0gdGl0bGU7XG5cbiAgcmV0dXJuIGNvbXBvc2VkO1xufTtcblxudmFyIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nID0gZnVuY3Rpb24gY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcgKHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlVTRURfJyArIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCArICcgaXMgZGVmaW5lZCBidXQgaXMgbm90IHVzZWQ6ICcgKyB2YWwsIHBhdGgsIGRlc3QpO1xufTtcblxudmFyIGdldERvY3VtZW50Q2FjaGUgPSBmdW5jdGlvbiBnZXREb2N1bWVudENhY2hlIChhcGlET3JTTykge1xuICB2YXIga2V5ID0gU3BhcmtNRDUuaGFzaChKU09OLnN0cmluZ2lmeShhcGlET3JTTykpO1xuICB2YXIgY2FjaGVFbnRyeSA9IGRvY3VtZW50Q2FjaGVba2V5XSB8fCBfLmZpbmQoZG9jdW1lbnRDYWNoZSwgZnVuY3Rpb24gKGNhY2hlRW50cnkpIHtcbiAgICByZXR1cm4gY2FjaGVFbnRyeS5yZXNvbHZlZElkID09PSBrZXk7XG4gIH0pO1xuXG4gIGlmICghY2FjaGVFbnRyeSkge1xuICAgIGNhY2hlRW50cnkgPSBkb2N1bWVudENhY2hlW2tleV0gPSB7XG4gICAgICBkZWZpbml0aW9uczoge30sXG4gICAgICBvcmlnaW5hbDogYXBpRE9yU08sXG4gICAgICByZXNvbHZlZDogdW5kZWZpbmVkLFxuICAgICAgc3dhZ2dlclZlcnNpb246IGhlbHBlcnMuZ2V0U3dhZ2dlclZlcnNpb24oYXBpRE9yU08pXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBjYWNoZUVudHJ5O1xufTtcblxudmFyIGhhbmRsZVZhbGlkYXRpb25FcnJvciA9IGZ1bmN0aW9uIGhhbmRsZVZhbGlkYXRpb25FcnJvciAocmVzdWx0cywgY2FsbGJhY2spIHtcbiAgdmFyIGVyciA9IG5ldyBFcnJvcignVGhlIFN3YWdnZXIgZG9jdW1lbnQocykgYXJlIGludmFsaWQnKTtcblxuICBlcnIuZXJyb3JzID0gcmVzdWx0cy5lcnJvcnM7XG4gIGVyci5mYWlsZWRWYWxpZGF0aW9uID0gdHJ1ZTtcbiAgZXJyLndhcm5pbmdzID0gcmVzdWx0cy53YXJuaW5ncztcblxuICBpZiAocmVzdWx0cy5hcGlEZWNsYXJhdGlvbnMpIHtcbiAgICBlcnIuYXBpRGVjbGFyYXRpb25zID0gcmVzdWx0cy5hcGlEZWNsYXJhdGlvbnM7XG4gIH1cblxuICBjYWxsYmFjayhlcnIpO1xufTtcblxudmFyIG5vcm1hbGl6ZVBhdGggPSBmdW5jdGlvbiBub3JtYWxpemVQYXRoIChwYXRoKSB7XG4gIHZhciBtYXRjaGVzID0gcGF0aC5tYXRjaCgvXFx7KC4qPylcXH0vZyk7XG4gIHZhciBhcmdOYW1lcyA9IFtdO1xuICB2YXIgbm9ybVBhdGggPSBwYXRoO1xuXG4gIGlmIChtYXRjaGVzKSB7XG4gICAgXy5lYWNoKG1hdGNoZXMsIGZ1bmN0aW9uIChtYXRjaCwgaW5kZXgpIHtcbiAgICAgIG5vcm1QYXRoID0gbm9ybVBhdGgucmVwbGFjZShtYXRjaCwgJ3snICsgaW5kZXggKyAnfScpO1xuICAgICAgYXJnTmFtZXMucHVzaChtYXRjaC5yZXBsYWNlKC9be31dL2csICcnKSk7XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHBhdGg6IG5vcm1QYXRoLFxuICAgIGFyZ3M6IGFyZ05hbWVzXG4gIH07XG59O1xuXG52YXIgdmFsaWRhdGVOb0V4aXN0ID0gZnVuY3Rpb24gdmFsaWRhdGVOb0V4aXN0IChkYXRhLCB2YWwsIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCwgcGF0aCwgZGVzdCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoZGF0YSkgJiYgZGF0YS5pbmRleE9mKHZhbCkgPiAtMSkge1xuICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdEVVBMSUNBVEVfJyArIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCArICcgYWxyZWFkeSBkZWZpbmVkOiAnICsgdmFsLCBwYXRoLCBkZXN0KTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMgPSBmdW5jdGlvbiB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzIChkb2N1bWVudE1ldGFkYXRhLCBzY2hlbWEsIHBhdGgsIHJlc3VsdHMsIHNraXApIHtcbiAgdHJ5IHtcbiAgICB2YWxpZGF0b3JzLnZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiwgc2NoZW1hLCBwYXRoLCB1bmRlZmluZWQpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBpZiAoIXNraXApIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKGVyci5jb2RlLCBlcnIubWVzc2FnZSwgZXJyLnBhdGgsIHJlc3VsdHMuZXJyb3JzKTtcbiAgICB9XG4gIH1cbn07XG5cbnZhciBwcm9jZXNzRG9jdW1lbnQgPSBmdW5jdGlvbiBwcm9jZXNzRG9jdW1lbnQgKGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpIHtcbiAgdmFyIHN3YWdnZXJWZXJzaW9uID0gZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbjtcbiAgdmFyIGdldERlZmluaXRpb25NZXRhZGF0YSA9IGZ1bmN0aW9uIGdldERlZmluaXRpb25NZXRhZGF0YSAoZGVmUGF0aCkge1xuICAgIHZhciBkZWZQdHIgPSBKc29uUmVmcy5wYXRoVG9Qb2ludGVyKGRlZlBhdGgpO1xuICAgIHZhciBtZXRhZGF0YSA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbZGVmUHRyXTtcblxuICAgIGlmICghbWV0YWRhdGEpIHtcbiAgICAgIG1ldGFkYXRhID0gZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1tkZWZQdHJdID0ge1xuICAgICAgICByZWZlcmVuY2VzOiBbXVxuICAgICAgfTtcblxuICAgICAgLy8gRm9yIG1vZGVsIGRlZmluaXRpb25zLCBhZGQgdGhlIGluaGVyaXRhbmNlIHByb3BlcnRpZXNcbiAgICAgIGlmIChbJ2RlZmluaXRpb25zJywgJ21vZGVscyddLmluZGV4T2YoSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKGRlZlB0cilbMF0pID4gLTEpIHtcbiAgICAgICAgbWV0YWRhdGEuY3ljbGljYWwgPSBmYWxzZTtcbiAgICAgICAgbWV0YWRhdGEubGluZWFnZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbWV0YWRhdGEucGFyZW50cyA9IFtdO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBtZXRhZGF0YTtcbiAgfTtcbiAgdmFyIGdldERpc3BsYXlJZCA9IGZ1bmN0aW9uIGdldERpc3BsYXlJZCAoaWQpIHtcbiAgICByZXR1cm4gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKGlkKS5wb3AoKSA6IGlkO1xuICB9O1xuICB2YXIgd2FsayA9IGZ1bmN0aW9uIHdhbGsgKHJvb3QsIGlkLCBsaW5lYWdlKSB7XG4gICAgdmFyIGRlZmluaXRpb24gPSBkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW2lkIHx8IHJvb3RdO1xuXG4gICAgaWYgKGRlZmluaXRpb24pIHtcbiAgICAgIF8uZWFjaChkZWZpbml0aW9uLnBhcmVudHMsIGZ1bmN0aW9uIChwYXJlbnQpIHtcbiAgICAgICAgbGluZWFnZS5wdXNoKHBhcmVudCk7XG5cbiAgICAgICAgaWYgKHJvb3QgIT09IHBhcmVudCkge1xuICAgICAgICAgIHdhbGsocm9vdCwgcGFyZW50LCBsaW5lYWdlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9O1xuICB2YXIgYXV0aERlZnNQcm9wID0gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gJ2F1dGhvcml6YXRpb25zJyA6ICdzZWN1cml0eURlZmluaXRpb25zJztcbiAgdmFyIG1vZGVsRGVmc1Byb3AgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnbW9kZWxzJyA6ICdkZWZpbml0aW9ucyc7XG5cbiAgLy8gUHJvY2VzcyBhdXRob3JpemF0aW9uIGRlZmluaXRpb25zXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkW2F1dGhEZWZzUHJvcF0sIGZ1bmN0aW9uIChhdXRob3JpemF0aW9uLCBuYW1lKSB7XG4gICAgdmFyIHNlY3VyaXR5RGVmUGF0aCA9IFthdXRoRGVmc1Byb3AsIG5hbWVdO1xuXG4gICAgLy8gU3dhZ2dlciAxLjIgb25seSBoYXMgYXV0aG9yaXphdGlvbiBkZWZpbml0aW9ucyBpbiB0aGUgUmVzb3VyY2UgTGlzdGluZ1xuICAgIGlmIChzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgJiYgIWF1dGhvcml6YXRpb24udHlwZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSB0aGUgYXV0aG9yaXphdGlvbiBkZWZpbml0aW9uIG1ldGFkYXRhXG4gICAgZ2V0RGVmaW5pdGlvbk1ldGFkYXRhKHNlY3VyaXR5RGVmUGF0aCk7XG5cbiAgICBfLnJlZHVjZShhdXRob3JpemF0aW9uLnNjb3BlcywgZnVuY3Rpb24gKHNlZW5TY29wZXMsIHNjb3BlLCBpbmRleE9yTmFtZSkge1xuICAgICAgdmFyIHNjb3BlTmFtZSA9IHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/IHNjb3BlLnNjb3BlIDogaW5kZXhPck5hbWU7XG4gICAgICB2YXIgc2NvcGVEZWZQYXRoID0gc2VjdXJpdHlEZWZQYXRoLmNvbmNhdChbJ3Njb3BlcycsIGluZGV4T3JOYW1lLnRvU3RyaW5nKCldKTtcbiAgICAgIHZhciBzY29wZU1ldGFkYXRhID0gZ2V0RGVmaW5pdGlvbk1ldGFkYXRhKHNlY3VyaXR5RGVmUGF0aC5jb25jYXQoWydzY29wZXMnLCBzY29wZU5hbWVdKSk7XG5cbiAgICAgIHNjb3BlTWV0YWRhdGEuc2NvcGVQYXRoID0gc2NvcGVEZWZQYXRoO1xuXG4gICAgICAvLyBJZGVudGlmeSBkdXBsaWNhdGUgYXV0aG9yaXphdGlvbiBzY29wZSBkZWZpbmVkIGluIHRoZSBSZXNvdXJjZSBMaXN0aW5nXG4gICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblNjb3Blcywgc2NvcGVOYW1lLCAnQVVUSE9SSVpBVElPTl9TQ09QRV9ERUZJTklUSU9OJywgJ0F1dGhvcml6YXRpb24gc2NvcGUgZGVmaW5pdGlvbicsXG4gICAgICAgICAgICAgICAgICAgICAgc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gc2NvcGVEZWZQYXRoLmNvbmNhdCgnc2NvcGUnKSA6IHNjb3BlRGVmUGF0aCwgcmVzdWx0cy53YXJuaW5ncyk7XG5cbiAgICAgIHNlZW5TY29wZXMucHVzaChzY29wZU5hbWUpO1xuXG4gICAgICByZXR1cm4gc2VlblNjb3BlcztcbiAgICB9LCBbXSk7XG4gIH0pO1xuXG4gIC8vIFByb2NlcyBtb2RlbCBkZWZpbml0aW9uc1xuICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZFttb2RlbERlZnNQcm9wXSwgZnVuY3Rpb24gKG1vZGVsLCBtb2RlbElkKSB7XG4gICAgdmFyIG1vZGVsRGVmUGF0aCA9IFttb2RlbERlZnNQcm9wLCBtb2RlbElkXTtcbiAgICB2YXIgbW9kZWxNZXRhZGF0YSA9IGdldERlZmluaXRpb25NZXRhZGF0YShtb2RlbERlZlBhdGgpO1xuXG4gICAgLy8gSWRlbnRpZnkgbW9kZWwgaWQgbWlzbWF0Y2ggKElkIGluIG1vZGVscyBvYmplY3QgaXMgbm90IHRoZSBzYW1lIGFzIHRoZSBtb2RlbCdzIGlkIGluIHRoZSBtb2RlbHMgb2JqZWN0KVxuICAgIGlmIChzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgJiYgbW9kZWxJZCAhPT0gbW9kZWwuaWQpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNT0RFTF9JRF9NSVNNQVRDSCcsICdNb2RlbCBpZCBkb2VzIG5vdCBtYXRjaCBpZCBpbiBtb2RlbHMgb2JqZWN0OiAnICsgbW9kZWwuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbERlZlBhdGguY29uY2F0KCdpZCcpLCByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuXG4gICAgLy8gRG8gbm90IHJlcHJvY2VzcyBwYXJlbnRzL3JlZmVyZW5jZXMgaWYgYWxyZWFkeSBwcm9jZXNzZWRcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbE1ldGFkYXRhLmxpbmVhZ2UpKSB7XG4gICAgICAvLyBIYW5kbGUgaW5oZXJpdGFuY2UgcmVmZXJlbmNlc1xuICAgICAgc3dpdGNoIChzd2FnZ2VyVmVyc2lvbikge1xuICAgICAgY2FzZSAnMS4yJzpcbiAgICAgICAgXy5lYWNoKG1vZGVsLnN1YlR5cGVzLCBmdW5jdGlvbiAoc3ViVHlwZSwgaW5kZXgpIHtcbiAgICAgICAgICB2YXIgc3ViUGF0aCA9IFsnbW9kZWxzJywgc3ViVHlwZV07XG4gICAgICAgICAgdmFyIHN1YlB0ciA9IEpzb25SZWZzLnBhdGhUb1BvaW50ZXIoc3ViUGF0aCk7XG4gICAgICAgICAgdmFyIHN1Yk1ldGFkYXRhID0gZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1tzdWJQdHJdO1xuICAgICAgICAgIHZhciByZWZQYXRoID0gbW9kZWxEZWZQYXRoLmNvbmNhdChbJ3N1YlR5cGVzJywgaW5kZXgudG9TdHJpbmcoKV0pO1xuXG4gICAgICAgICAgLy8gSWYgdGhlIG1ldGFkYXRhIGRvZXMgbm90IHlldCBleGlzdCwgY3JlYXRlIGl0XG4gICAgICAgICAgaWYgKCFzdWJNZXRhZGF0YSAmJiBkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkW21vZGVsRGVmc1Byb3BdW3N1YlR5cGVdKSB7XG4gICAgICAgICAgICBzdWJNZXRhZGF0YSA9IGdldERlZmluaXRpb25NZXRhZGF0YShzdWJQYXRoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBJZiB0aGUgcmVmZXJlbmNlIGlzIHZhbGlkLCBhZGQgdGhlIHBhcmVudFxuICAgICAgICAgIGlmIChhZGRSZWZlcmVuY2UoZG9jdW1lbnRNZXRhZGF0YSwgc3ViUGF0aCwgcmVmUGF0aCwgcmVzdWx0cykpIHtcbiAgICAgICAgICAgIHN1Yk1ldGFkYXRhLnBhcmVudHMucHVzaChKc29uUmVmcy5wYXRoVG9Qb2ludGVyKG1vZGVsRGVmUGF0aCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLm9yaWdpbmFsW21vZGVsRGVmc1Byb3BdW21vZGVsSWRdLmFsbE9mLCBmdW5jdGlvbiAoc2NoZW1hLCBpbmRleCkge1xuICAgICAgICAgIHZhciBjaGlsZFBhdGggPSBtb2RlbERlZlBhdGguY29uY2F0KFsnYWxsT2YnLCBpbmRleC50b1N0cmluZygpXSk7XG4gICAgICAgICAgdmFyIHBhcmVudFBhdGg7XG5cdCAgXG4gICAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQoc2NoZW1hLiRyZWYpIHx8IEpzb25SZWZzLmlzUmVtb3RlUG9pbnRlcihzY2hlbWEuJHJlZikpIHtcbiAgICAgICAgICAgIHBhcmVudFBhdGggPSBtb2RlbERlZlBhdGguY29uY2F0KFsnYWxsT2YnLCBpbmRleC50b1N0cmluZygpXSk7XG4gICAgICAgICAgfSBlbHNlIHtcblx0ICAgIGNoaWxkUGF0aC5wdXNoKCckcmVmJyk7XG5cbiAgICAgICAgICAgIHBhcmVudFBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIoc2NoZW1hLiRyZWYpO1xuICAgICAgICAgIH1cblxuXHQgIC8vIElmIHRoZSBwYXJlbnQgbW9kZWwgZG9lcyBub3QgZXhpc3QsIGRvIG5vdCBjcmVhdGUgaXRzIG1ldGFkYXRhXG5cdCAgaWYgKCFfLmlzVW5kZWZpbmVkKHRyYXZlcnNlKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpLmdldChwYXJlbnRQYXRoKSkpIHtcblx0ICAgIGdldERlZmluaXRpb25NZXRhZGF0YShKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIoc2NoZW1hLiRyZWYpKTtcblx0ICAgIG1vZGVsTWV0YWRhdGEucGFyZW50cy5wdXNoKEpzb25SZWZzLnBhdGhUb1BvaW50ZXIocGFyZW50UGF0aCkpO1xuXHQgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICBzd2l0Y2ggKHN3YWdnZXJWZXJzaW9uKSB7XG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gUHJvY2VzcyBwYXJhbWV0ZXIgZGVmaW5pdGlvbnNcbiAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAocGFyYW1ldGVyLCBuYW1lKSB7XG4gICAgICB2YXIgcGF0aCA9IFsncGFyYW1ldGVycycsIG5hbWVdO1xuXG4gICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGF0aCk7XG5cbiAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcGFyYW1ldGVyLCBwYXRoLCByZXN1bHRzKTtcbiAgICB9KTtcblxuICAgIC8vIFByb2Nlc3MgcmVzcG9uc2UgZGVmaW5pdGlvbnNcbiAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5yZXNwb25zZXMsIGZ1bmN0aW9uIChyZXNwb25zZSwgbmFtZSkge1xuICAgICAgdmFyIHBhdGggPSBbJ3Jlc3BvbnNlcycsIG5hbWVdO1xuXG4gICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGF0aCk7XG5cbiAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcmVzcG9uc2UsIHBhdGgsIHJlc3VsdHMpO1xuICAgIH0pO1xuXG4gICAgYnJlYWs7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSBkZWZpbml0aW9uL21vZGVscyAoSW5oZXJpdGFuY2UsIHByb3BlcnR5IGRlZmluaXRpb25zLCAuLi4pXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zLCBmdW5jdGlvbiAobWV0YWRhdGEsIGlkKSB7XG4gICAgdmFyIGRlZlBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIoaWQpO1xuICAgIHZhciBkZWZpbml0aW9uID0gdHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5vcmlnaW5hbCkuZ2V0KGRlZlBhdGgpO1xuICAgIHZhciBkZWZQcm9wID0gZGVmUGF0aFswXTtcbiAgICB2YXIgY29kZSA9IGRlZlByb3Auc3Vic3RyaW5nKDAsIGRlZlByb3AubGVuZ3RoIC0gMSkudG9VcHBlckNhc2UoKTtcbiAgICB2YXIgbXNnUHJlZml4ID0gY29kZS5jaGFyQXQoMCkgKyBjb2RlLnN1YnN0cmluZygxKS50b0xvd2VyQ2FzZSgpO1xuICAgIHZhciBkUHJvcGVydGllcztcbiAgICB2YXIgaVByb3BlcnRpZXM7XG4gICAgdmFyIGxpbmVhZ2U7XG5cbiAgICAvLyBUaGUgb25seSBjaGVja3Mgd2UgcGVyZm9ybSBiZWxvdyBhcmUgaW5oZXJpdGFuY2UgY2hlY2tzIHNvIHNraXAgYWxsIG5vbi1tb2RlbCBkZWZpbml0aW9uc1xuICAgIGlmIChbJ2RlZmluaXRpb25zJywgJ21vZGVscyddLmluZGV4T2YoZGVmUHJvcCkgPT09IC0xKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZFByb3BlcnRpZXMgPSBbXTtcbiAgICBpUHJvcGVydGllcyA9IFtdO1xuICAgIGxpbmVhZ2UgPSBtZXRhZGF0YS5saW5lYWdlO1xuXG4gICAgLy8gRG8gbm90IHJlcHJvY2VzcyBsaW5lYWdlIGlmIGFscmVhZHkgcHJvY2Vzc2VkXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobGluZWFnZSkpIHtcbiAgICAgIGxpbmVhZ2UgPSBbXTtcblxuICAgICAgd2FsayhpZCwgdW5kZWZpbmVkLCBsaW5lYWdlKTtcblxuICAgICAgLy8gUm9vdCA+IG5leHQgPiAuLi5cbiAgICAgIGxpbmVhZ2UucmV2ZXJzZSgpO1xuXG4gICAgICBtZXRhZGF0YS5saW5lYWdlID0gXy5jbG9uZURlZXAobGluZWFnZSk7XG5cbiAgICAgIG1ldGFkYXRhLmN5Y2xpY2FsID0gbGluZWFnZS5sZW5ndGggPiAxICYmIGxpbmVhZ2VbMF0gPT09IGlkO1xuICAgIH1cblxuICAgIC8vIFN3YWdnZXIgMS4yIGRvZXMgbm90IGFsbG93IG11bHRpcGxlIGluaGVyaXRhbmNlIHdoaWxlIFN3YWdnZXIgMi4wKyBkb2VzXG4gICAgaWYgKG1ldGFkYXRhLnBhcmVudHMubGVuZ3RoID4gMSAmJiBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNVUxUSVBMRV8nICsgY29kZSArICdfSU5IRVJJVEFOQ0UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0NoaWxkICcgKyBjb2RlLnRvTG93ZXJDYXNlKCkgKyAnIGlzIHN1YiB0eXBlIG9mIG11bHRpcGxlIG1vZGVsczogJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBfLm1hcChtZXRhZGF0YS5wYXJlbnRzLCBmdW5jdGlvbiAocGFyZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBnZXREaXNwbGF5SWQocGFyZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pLmpvaW4oJyAmJiAnKSwgZGVmUGF0aCwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cblxuICAgIGlmIChtZXRhZGF0YS5jeWNsaWNhbCkge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0NZQ0xJQ0FMXycgKyBjb2RlICsgJ19JTkhFUklUQU5DRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBtc2dQcmVmaXggKyAnIGhhcyBhIGNpcmN1bGFyIGluaGVyaXRhbmNlOiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXy5tYXAobGluZWFnZSwgZnVuY3Rpb24gKGRlcCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBnZXREaXNwbGF5SWQoZGVwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuam9pbignIC0+ICcpICsgJyAtPiAnICsgZ2V0RGlzcGxheUlkKGlkKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZQYXRoLmNvbmNhdChzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnc3ViVHlwZXMnIDogJ2FsbE9mJyksIHJlc3VsdHMuZXJyb3JzKTtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgc2VsZiByZWZlcmVuY2UgZnJvbSB0aGUgZW5kIG9mIHRoZSBsaW5lYWdlIChGcm9udCB0b28gaWYgY3ljbGljYWwpXG4gICAgXy5lYWNoKGxpbmVhZ2Uuc2xpY2UobWV0YWRhdGEuY3ljbGljYWwgPyAxIDogMCksIGZ1bmN0aW9uIChpZCkge1xuICAgICAgdmFyIHBNb2RlbCA9IHRyYXZlcnNlKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpLmdldChKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIoaWQpKTtcblxuICAgICAgXy5lYWNoKE9iamVjdC5rZXlzKHBNb2RlbC5wcm9wZXJ0aWVzKSwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgaWYgKGlQcm9wZXJ0aWVzLmluZGV4T2YobmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgaVByb3BlcnRpZXMucHVzaChuYW1lKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBWYWxpZGF0ZSBzaW1wbGUgZGVmaW5pdGlvbnNcbiAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEsIGRlZmluaXRpb24sIGRlZlBhdGgsIHJlc3VsdHMpO1xuICAgIFxuICAgIC8vIElkZW50aWZ5IHJlZGVjbGFyZWQgcHJvcGVydGllc1xuICAgIF8uZWFjaChkZWZpbml0aW9uLnByb3BlcnRpZXMsIGZ1bmN0aW9uIChwcm9wZXJ0eSwgbmFtZSkge1xuICAgICAgdmFyIHBQYXRoID0gZGVmUGF0aC5jb25jYXQoWydwcm9wZXJ0aWVzJywgbmFtZV0pO1xuXG4gICAgICAvLyBEbyBub3QgcHJvY2VzcyB1bnJlc29sdmVkIHByb3BlcnRpZXNcbiAgICAgIGlmICghXy5pc1VuZGVmaW5lZChwcm9wZXJ0eSkpIHtcbiAgICAgICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLCBwcm9wZXJ0eSwgcFBhdGgsIHJlc3VsdHMpO1xuXG4gICAgICAgIGlmIChpUHJvcGVydGllcy5pbmRleE9mKG5hbWUpID4gLTEpIHtcbiAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQ0hJTERfJyArIGNvZGUgKyAnX1JFREVDTEFSRVNfUFJPUEVSVFknLFxuXHRcdFx0ICAgICAgICdDaGlsZCAnICsgY29kZS50b0xvd2VyQ2FzZSgpICsgJyBkZWNsYXJlcyBwcm9wZXJ0eSBhbHJlYWR5IGRlY2xhcmVkIGJ5IGFuY2VzdG9yOiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lLFxuXHRcdFx0ICAgICAgIHBQYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZFByb3BlcnRpZXMucHVzaChuYW1lKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gSWRlbnRpZnkgbWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0aWVzXG4gICAgXy5lYWNoKGRlZmluaXRpb24ucmVxdWlyZWQgfHwgW10sIGZ1bmN0aW9uIChuYW1lLCBpbmRleCkge1xuICAgICAgdmFyIHR5cGUgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnTW9kZWwnIDogJ0RlZmluaXRpb24nO1xuXG4gICAgICBpZiAoaVByb3BlcnRpZXMuaW5kZXhPZihuYW1lKSA9PT0gLTEgJiYgZFByb3BlcnRpZXMuaW5kZXhPZihuYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01JU1NJTkdfUkVRVUlSRURfJyArIHR5cGUudG9VcHBlckNhc2UoKSArICdfUFJPUEVSVFknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlICsgJyByZXF1aXJlcyBwcm9wZXJ0eSBidXQgaXQgaXMgbm90IGRlZmluZWQ6ICcgKyBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZQYXRoLmNvbmNhdChbJ3JlcXVpcmVkJywgaW5kZXgudG9TdHJpbmcoKV0pLCByZXN1bHRzLmVycm9ycyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIFByb2Nlc3MgcmVmZXJlbmNlcyAoT25seSBwcm9jZXNzZXMgSlNPTiBSZWZlcmVuY2VzLCBhbGwgb3RoZXIgcmVmZXJlbmNlcyBhcmUgaGFuZGxlZCB3aGVyZSBlbmNvdW50ZXJlZClcbiAgXy5lYWNoKEpzb25SZWZzLmZpbmRSZWZzKGRvY3VtZW50TWV0YWRhdGEub3JpZ2luYWwpLCBmdW5jdGlvbiAocmVmLCByZWZQdHIpIHtcblxuICAgIGlmIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgcmVmID0gJyMvbW9kZWxzLycgKyByZWY7XG4gICAgfVxuXG4gICAgLy8gT25seSBwcm9jZXNzIGxvY2FsIHJlZmVyZW5jZXNcbiAgICBpZiAoIUpzb25SZWZzLmlzUmVtb3RlUG9pbnRlcihyZWYpKSB7XG4gICAgICBhZGRSZWZlcmVuY2UoZG9jdW1lbnRNZXRhZGF0YSwgcmVmLCByZWZQdHIsIHJlc3VsdHMpO1xuICAgIH1cbiAgfSk7XG59O1xuXG52YXIgdmFsaWRhdGVFeGlzdCA9IGZ1bmN0aW9uIHZhbGlkYXRlRXhpc3QgKGRhdGEsIHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChkYXRhKSAmJiBkYXRhLmluZGV4T2YodmFsKSA9PT0gLTEpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHZhbCwgcGF0aCwgZGVzdCk7XG4gIH1cbn07XG5cbnZhciBwcm9jZXNzQXV0aFJlZnMgPSBmdW5jdGlvbiBwcm9jZXNzQXV0aFJlZnMgKGRvY3VtZW50TWV0YWRhdGEsIGF1dGhSZWZzLCBwYXRoLCByZXN1bHRzKSB7XG4gIHZhciBjb2RlID0gZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnQVVUSE9SSVpBVElPTicgOiAnU0VDVVJJVFlfREVGSU5JVElPTic7XG4gIHZhciBtc2dQcmVmaXggPSBjb2RlID09PSAnQVVUSE9SSVpBVElPTicgPyAnQXV0aG9yaXphdGlvbicgOiAnU2VjdXJpdHkgZGVmaW5pdGlvbic7XG5cbiAgaWYgKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgXy5yZWR1Y2UoYXV0aFJlZnMsIGZ1bmN0aW9uIChzZWVuTmFtZXMsIHNjb3BlcywgbmFtZSkge1xuICAgICAgdmFyIGF1dGhQdHIgPSAnIy9hdXRob3JpemF0aW9ucy8nICsgbmFtZTtcbiAgICAgIHZhciBhUGF0aCA9IHBhdGguY29uY2F0KFtuYW1lXSk7XG5cbiAgICAgIC8vIEFkZCByZWZlcmVuY2Ugb3IgcmVjb3JkIHVucmVzb2x2ZWQgYXV0aG9yaXphdGlvblxuICAgICAgaWYgKGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBhdXRoUHRyLCBhUGF0aCwgcmVzdWx0cykpIHtcbiAgICAgICAgXy5yZWR1Y2Uoc2NvcGVzLCBmdW5jdGlvbiAoc2VlblNjb3Blcywgc2NvcGUsIGluZGV4KSB7XG4gICAgICAgICAgdmFyIHNQYXRoID0gYVBhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCksICdzY29wZScpO1xuICAgICAgICAgIHZhciBzUHRyID0gYXV0aFB0ciArICcvc2NvcGVzLycgKyBzY29wZS5zY29wZTtcblxuICAgICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuU2NvcGVzLCBzY29wZS5zY29wZSwgY29kZSArICdfU0NPUEVfUkVGRVJFTkNFJywgbXNnUHJlZml4ICsgJyBzY29wZSByZWZlcmVuY2UnLCBzUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy53YXJuaW5ncyk7XG5cbiAgICAgICAgICAvLyBBZGQgcmVmZXJlbmNlIG9yIHJlY29yZCB1bnJlc29sdmVkIGF1dGhvcml6YXRpb24gc2NvcGVcbiAgICAgICAgICBhZGRSZWZlcmVuY2UoZG9jdW1lbnRNZXRhZGF0YSwgc1B0ciwgc1BhdGgsIHJlc3VsdHMpO1xuXG4gICAgICAgICAgcmV0dXJuIHNlZW5TY29wZXMuY29uY2F0KHNjb3BlLnNjb3BlKTtcbiAgICAgICAgfSwgW10pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gc2Vlbk5hbWVzLmNvbmNhdChuYW1lKTtcbiAgICB9LCBbXSk7XG4gIH0gZWxzZSB7XG4gICAgXy5yZWR1Y2UoYXV0aFJlZnMsIGZ1bmN0aW9uIChzZWVuTmFtZXMsIHNjb3BlcywgaW5kZXgpIHtcbiAgICAgIF8uZWFjaChzY29wZXMsIGZ1bmN0aW9uIChzY29wZXMsIG5hbWUpIHtcbiAgICAgICAgdmFyIGF1dGhQdHIgPSAnIy9zZWN1cml0eURlZmluaXRpb25zLycgKyBuYW1lO1xuICAgICAgICB2YXIgYXV0aFJlZlBhdGggPSBwYXRoLmNvbmNhdChpbmRleC50b1N0cmluZygpLCBuYW1lKTtcblxuICAgICAgICAvLyBFbnN1cmUgdGhlIHNlY3VyaXR5IGRlZmluaXRpb24gaXNuJ3QgcmVmZXJlbmNlZCBtb3JlIHRoYW4gb25jZSAoU3dhZ2dlciAyLjArKVxuICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2Vlbk5hbWVzLCBuYW1lLCBjb2RlICsgJ19SRUZFUkVOQ0UnLCBtc2dQcmVmaXggKyAnIHJlZmVyZW5jZScsIGF1dGhSZWZQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy53YXJuaW5ncyk7XG5cbiAgICAgICAgc2Vlbk5hbWVzLnB1c2gobmFtZSk7XG5cbiAgICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uXG4gICAgICAgIGlmIChhZGRSZWZlcmVuY2UoZG9jdW1lbnRNZXRhZGF0YSwgYXV0aFB0ciwgYXV0aFJlZlBhdGgsIHJlc3VsdHMpKSB7XG4gICAgICAgICAgXy5lYWNoKHNjb3BlcywgZnVuY3Rpb24gKHNjb3BlLCBpbmRleCkge1xuICAgICAgICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uIHNjb3BlXG4gICAgICAgICAgICBhZGRSZWZlcmVuY2UoZG9jdW1lbnRNZXRhZGF0YSwgYXV0aFB0ciArICcvc2NvcGVzLycgKyBzY29wZSwgYXV0aFJlZlBhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIHNlZW5OYW1lcztcbiAgICB9LCBbXSk7XG4gIH1cbn07XG5cbnZhciByZXNvbHZlUmVmcyA9IGZ1bmN0aW9uIChhcGlET3JTTywgY2FsbGJhY2spIHtcbiAgdmFyIGNhY2hlRW50cnkgPSBnZXREb2N1bWVudENhY2hlKGFwaURPclNPKTtcbiAgdmFyIHN3YWdnZXJWZXJzaW9uID0gaGVscGVycy5nZXRTd2FnZ2VyVmVyc2lvbihhcGlET3JTTyk7XG4gIHZhciBkb2N1bWVudFQ7XG5cbiAgaWYgKCFjYWNoZUVudHJ5LnJlc29sdmVkKSB7XG4gICAgLy8gRm9yIFN3YWdnZXIgMS4yLCB3ZSBoYXZlIHRvIGNyZWF0ZSByZWFsIEpTT04gUmVmZXJlbmNlc1xuICAgIGlmIChzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAgIGFwaURPclNPID0gXy5jbG9uZURlZXAoYXBpRE9yU08pO1xuICAgICAgZG9jdW1lbnRUID0gdHJhdmVyc2UoYXBpRE9yU08pO1xuXG4gICAgICBfLmVhY2goSnNvblJlZnMuZmluZFJlZnMoYXBpRE9yU08pLCBmdW5jdGlvbiAocmVmLCBwdHIpIHtcbiAgICAgICAgLy8gQWxsIFN3YWdnZXIgMS4yIHJlZmVyZW5jZXMgYXJlIEFMV0FZUyB0byBtb2RlbHNcbiAgICAgICAgZG9jdW1lbnRULnNldChKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIocHRyKSwgJyMvbW9kZWxzLycgKyByZWYpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gUmVzb2x2ZSByZWZlcmVuY2VzXG4gICAgSnNvblJlZnMucmVzb2x2ZVJlZnMoYXBpRE9yU08sIGZ1bmN0aW9uIChlcnIsIGpzb24pIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICB9XG5cbiAgICAgIGNhY2hlRW50cnkucmVzb2x2ZWQgPSBqc29uO1xuICAgICAgY2FjaGVFbnRyeS5yZXNvbHZlZElkID0gU3BhcmtNRDUuaGFzaChKU09OLnN0cmluZ2lmeShqc29uKSk7XG5cbiAgICAgIGNhbGxiYWNrKCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2FsbGJhY2soKTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSA9IGZ1bmN0aW9uIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSAoc3BlYywgc2NoZW1hT3JOYW1lLCBkYXRhLCBjYWxsYmFjaykge1xuICB2YXIgdmFsaWRhdG9yID0gXy5pc1N0cmluZyhzY2hlbWFPck5hbWUpID8gc3BlYy52YWxpZGF0b3JzW3NjaGVtYU9yTmFtZV0gOiBoZWxwZXJzLmNyZWF0ZUpzb25WYWxpZGF0b3IoKTtcbiAgdmFyIGRvVmFsaWRhdGlvbiA9IGZ1bmN0aW9uIGRvVmFsaWRhdGlvbiAoKSB7XG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVBZ2FpbnN0U2NoZW1hKHNjaGVtYU9yTmFtZSwgZGF0YSwgdmFsaWRhdG9yKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIuZmFpbGVkVmFsaWRhdGlvbikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2sodW5kZWZpbmVkLCBlcnIucmVzdWx0cyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXNvbHZlUmVmcyhkYXRhLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICB9KTtcbiAgfTtcblxuICBhZGRFeHRlcm5hbFJlZnNUb1ZhbGlkYXRvcih2YWxpZGF0b3IsIGRhdGEsIGZ1bmN0aW9uIChlcnIpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICB9XG5cbiAgICBkb1ZhbGlkYXRpb24oKTtcbiAgfSk7XG59O1xuXG52YXIgdmFsaWRhdGVEZWZpbml0aW9ucyA9IGZ1bmN0aW9uIHZhbGlkYXRlRGVmaW5pdGlvbnMgKGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpIHtcbiAgLy8gVmFsaWRhdGUgdW51c2VkIGRlZmluaXRpb25zXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zLCBmdW5jdGlvbiAobWV0YWRhdGEsIGlkKSB7XG4gICAgdmFyIGRlZlBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIoaWQpO1xuICAgIHZhciBkZWZUeXBlID0gZGVmUGF0aFswXS5zdWJzdHJpbmcoMCwgZGVmUGF0aFswXS5sZW5ndGggLSAxKTtcbiAgICB2YXIgZGlzcGxheUlkID0gZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBkZWZQYXRoW2RlZlBhdGgubGVuZ3RoIC0gMV0gOiBpZDtcbiAgICB2YXIgY29kZSA9IGRlZlR5cGUgPT09ICdzZWN1cml0eURlZmluaXRpb24nID8gJ1NFQ1VSSVRZX0RFRklOSVRJT04nIDogZGVmVHlwZS50b1VwcGVyQ2FzZSgpO1xuICAgIHZhciBtc2dQcmVmaXggPSBkZWZUeXBlID09PSAnc2VjdXJpdHlEZWZpbml0aW9uJyA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICdTZWN1cml0eSBkZWZpbml0aW9uJyA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZlR5cGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBkZWZUeXBlLnN1YnN0cmluZygxKTtcblxuICAgIGlmIChtZXRhZGF0YS5yZWZlcmVuY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgLy8gU3dhZ2dlciAxLjIgYXV0aG9yaXphdGlvbiBzY29wZVxuICAgICAgaWYgKG1ldGFkYXRhLnNjb3BlUGF0aCkge1xuICAgICAgICBjb2RlICs9ICdfU0NPUEUnO1xuICAgICAgICBtc2dQcmVmaXggKz0gJyBzY29wZSc7XG4gICAgICAgIGRlZlBhdGggPSBtZXRhZGF0YS5zY29wZVBhdGg7XG4gICAgICB9XG5cbiAgICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKGRpc3BsYXlJZCwgY29kZSwgbXNnUHJlZml4LCBkZWZQYXRoLCByZXN1bHRzLndhcm5pbmdzKTtcbiAgICB9XG4gIH0pO1xufTtcblxudmFyIHZhbGlkYXRlUGFyYW1ldGVycyA9IGZ1bmN0aW9uIHZhbGlkYXRlUGFyYW1ldGVycyAoc3BlYywgZG9jdW1lbnRNZXRhZGF0YSwgblBhdGgsIHBhcmFtZXRlcnMsIHBhdGgsIHJlc3VsdHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBza2lwTWlzc2luZykge1xuICB2YXIgcGF0aFBhcmFtcyA9IFtdO1xuXG4gIF8ucmVkdWNlKHBhcmFtZXRlcnMsIGZ1bmN0aW9uIChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLCBpbmRleCkge1xuICAgIHZhciBwUGF0aCA9IHBhdGguY29uY2F0KFsncGFyYW1ldGVycycsIGluZGV4LnRvU3RyaW5nKCldKTtcblxuICAgIC8vIFVucmVzb2x2ZWQgcGFyYW1ldGVyXG4gICAgaWYgKF8uaXNVbmRlZmluZWQocGFyYW1ldGVyKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIElkZW50aWZ5IGR1cGxpY2F0ZSBwYXJhbWV0ZXIgbmFtZXNcbiAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlci5uYW1lLCAnUEFSQU1FVEVSJywgJ1BhcmFtZXRlcicsIHBQYXRoLmNvbmNhdCgnbmFtZScpLFxuICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XG5cbiAgICAvLyBLZWVwIHRyYWNrIG9mIHBhdGggcGFyYW1ldGVyc1xuICAgIGlmIChwYXJhbWV0ZXIucGFyYW1UeXBlID09PSAncGF0aCcgfHwgcGFyYW1ldGVyLmluID09PSAncGF0aCcpIHtcbiAgICAgIGlmIChuUGF0aC5hcmdzLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFX0FQSV9QQVRIX1BBUkFNRVRFUicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgcGF0aCBwYXJhbWV0ZXIgY291bGQgbm90IGJlIHJlc29sdmVkOiAnICsgcGFyYW1ldGVyLm5hbWUsIHBQYXRoLmNvbmNhdCgnbmFtZScpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XG4gICAgICB9XG5cbiAgICAgIHBhdGhQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgcGFyYW1ldGVyIGNvbnN0cmFpbnRzXG4gICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLCBwYXJhbWV0ZXIsIHBQYXRoLCByZXN1bHRzLCBwYXJhbWV0ZXIuc2tpcEVycm9ycyk7XG5cbiAgICByZXR1cm4gc2VlblBhcmFtZXRlcnMuY29uY2F0KHBhcmFtZXRlci5uYW1lKTtcbiAgfSwgW10pO1xuXG4gIC8vIFZhbGlkYXRlIG1pc3NpbmcgcGF0aCBwYXJhbWV0ZXJzIChpbiBwYXRoIGJ1dCBub3QgaW4gb3BlcmF0aW9uLnBhcmFtZXRlcnMpXG4gIGlmIChfLmlzVW5kZWZpbmVkKHNraXBNaXNzaW5nKSB8fCBza2lwTWlzc2luZyA9PT0gZmFsc2UpIHtcbiAgICBfLmVhY2goXy5kaWZmZXJlbmNlKG5QYXRoLmFyZ3MsIHBhdGhQYXJhbXMpLCBmdW5jdGlvbiAodW51c2VkKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUlTU0lOR19BUElfUEFUSF9QQVJBTUVURVInLCAnQVBJIHJlcXVpcmVzIHBhdGggcGFyYW1ldGVyIGJ1dCBpdCBpcyBub3QgZGVmaW5lZDogJyArIHVudXNlZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gcGF0aC5zbGljZSgwLCAyKS5jb25jYXQoJ3BhdGgnKSA6IHBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XG4gICAgfSk7XG4gIH1cbn07XG5cbnZhciB2YWxpZGF0ZVN3YWdnZXIxXzIgPSBmdW5jdGlvbiB2YWxpZGF0ZVN3YWdnZXIxXzIgKHNwZWMsIHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zLCBjYWxsYmFjaykgeyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbiAgdmFyIGFkUmVzb3VyY2VQYXRocyA9IFtdO1xuICB2YXIgcmxEb2N1bWVudE1ldGFkYXRhID0gZ2V0RG9jdW1lbnRDYWNoZShyZXNvdXJjZUxpc3RpbmcpO1xuICB2YXIgcmxSZXNvdXJjZVBhdGhzID0gW107XG4gIHZhciByZXN1bHRzID0ge1xuICAgIGVycm9yczogW10sXG4gICAgd2FybmluZ3M6IFtdLFxuICAgIGFwaURlY2xhcmF0aW9uczogW11cbiAgfTtcblxuICAvLyBQcm9jZXNzIFJlc291cmNlIExpc3RpbmcgcmVzb3VyY2UgZGVmaW5pdGlvbnNcbiAgcmxSZXNvdXJjZVBhdGhzID0gXy5yZWR1Y2UocmVzb3VyY2VMaXN0aW5nLmFwaXMsIGZ1bmN0aW9uIChzZWVuUGF0aHMsIGFwaSwgaW5kZXgpIHtcbiAgICAvLyBJZGVudGlmeSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aHMgZGVmaW5lZCBpbiB0aGUgUmVzb3VyY2UgTGlzdGluZ1xuICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUGF0aHMsIGFwaS5wYXRoLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJywgWydhcGlzJywgaW5kZXgudG9TdHJpbmcoKSwgJ3BhdGgnXSxcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xuXG4gICAgc2VlblBhdGhzLnB1c2goYXBpLnBhdGgpO1xuXG4gICAgcmV0dXJuIHNlZW5QYXRocztcbiAgfSwgW10pO1xuXG4gIC8vIFByb2Nlc3MgUmVzb3VyY2UgTGlzdGluZyBkZWZpbml0aW9ucyAoYXV0aG9yaXphdGlvbnMpXG4gIHByb2Nlc3NEb2N1bWVudChybERvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpO1xuXG5cbiAgLy8gUHJvY2VzcyBlYWNoIEFQSSBEZWNsYXJhdGlvblxuICBhZFJlc291cmNlUGF0aHMgPSBfLnJlZHVjZShhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChzZWVuUmVzb3VyY2VQYXRocywgYXBpRGVjbGFyYXRpb24sIGluZGV4KSB7XG4gICAgdmFyIGFSZXN1bHRzID0gcmVzdWx0cy5hcGlEZWNsYXJhdGlvbnNbaW5kZXhdID0ge1xuICAgICAgZXJyb3JzOiBbXSxcbiAgICAgIHdhcm5pbmdzOiBbXVxuICAgIH07XG4gICAgdmFyIGFkRG9jdW1lbnRNZXRhZGF0YSA9IGdldERvY3VtZW50Q2FjaGUoYXBpRGVjbGFyYXRpb24pO1xuXG4gICAgLy8gSWRlbnRpZnkgZHVwbGljYXRlIHJlc291cmNlIHBhdGhzIGRlZmluZWQgaW4gdGhlIEFQSSBEZWNsYXJhdGlvbnNcbiAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblJlc291cmNlUGF0aHMsIGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsXG4gICAgICAgICAgICAgICAgICAgIFsncmVzb3VyY2VQYXRoJ10sIGFSZXN1bHRzLmVycm9ycyk7XG5cbiAgICBpZiAoYWRSZXNvdXJjZVBhdGhzLmluZGV4T2YoYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoKSA9PT0gLTEpIHtcbiAgICAgIC8vIElkZW50aWZ5IHVudXNlZCByZXNvdXJjZSBwYXRocyBkZWZpbmVkIGluIHRoZSBBUEkgRGVjbGFyYXRpb25zXG4gICAgICB2YWxpZGF0ZUV4aXN0KHJsUmVzb3VyY2VQYXRocywgYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJyxcbiAgICAgICAgICAgICAgICAgICAgWydyZXNvdXJjZVBhdGgnXSwgYVJlc3VsdHMuZXJyb3JzKTtcblxuICAgICAgc2VlblJlc291cmNlUGF0aHMucHVzaChhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgpO1xuICAgIH1cblxuICAgIC8vIFRPRE86IFByb2Nlc3MgYXV0aG9yaXphdGlvbiByZWZlcmVuY2VzXG4gICAgLy8gTm90IHBvc3NpYmxlIGR1ZSB0byBodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL2lzc3Vlcy8xNTlcblxuICAgIC8vIFByb2Nlc3MgbW9kZWxzXG4gICAgcHJvY2Vzc0RvY3VtZW50KGFkRG9jdW1lbnRNZXRhZGF0YSwgYVJlc3VsdHMpO1xuXG4gICAgLy8gUHJvY2VzcyB0aGUgQVBJIGRlZmluaXRpb25zXG4gICAgXy5yZWR1Y2UoYXBpRGVjbGFyYXRpb24uYXBpcywgZnVuY3Rpb24gKHNlZW5QYXRocywgYXBpLCBpbmRleCkge1xuICAgICAgdmFyIGFQYXRoID0gWydhcGlzJywgaW5kZXgudG9TdHJpbmcoKV07XG4gICAgICB2YXIgblBhdGggPSBub3JtYWxpemVQYXRoKGFwaS5wYXRoKTtcblxuICAgICAgLy8gVmFsaWRhdGUgZHVwbGljYXRlIHJlc291cmNlIHBhdGhcbiAgICAgIGlmIChzZWVuUGF0aHMuaW5kZXhPZihuUGF0aC5wYXRoKSA+IC0xKSB7XG4gICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdEVVBMSUNBVEVfQVBJX1BBVEgnLCAnQVBJIHBhdGggKG9yIGVxdWl2YWxlbnQpIGFscmVhZHkgZGVmaW5lZDogJyArIGFwaS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhUGF0aC5jb25jYXQoJ3BhdGgnKSwgYVJlc3VsdHMuZXJyb3JzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlZW5QYXRocy5wdXNoKG5QYXRoLnBhdGgpO1xuICAgICAgfVxuXG4gICAgICAvLyBQcm9jZXNzIHRoZSBBUEkgb3BlcmF0aW9uc1xuICAgICAgXy5yZWR1Y2UoYXBpLm9wZXJhdGlvbnMsIGZ1bmN0aW9uIChzZWVuTWV0aG9kcywgb3BlcmF0aW9uLCBpbmRleCkge1xuICAgICAgICB2YXIgb1BhdGggPSBhUGF0aC5jb25jYXQoWydvcGVyYXRpb25zJywgaW5kZXgudG9TdHJpbmcoKV0pO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSBvcGVyYXRpb24gbWV0aG9kXG4gICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuTWV0aG9kcywgb3BlcmF0aW9uLm1ldGhvZCwgJ09QRVJBVElPTl9NRVRIT0QnLCAnT3BlcmF0aW9uIG1ldGhvZCcsIG9QYXRoLmNvbmNhdCgnbWV0aG9kJyksXG4gICAgICAgICAgICAgICAgICAgICAgICBhUmVzdWx0cy5lcnJvcnMpO1xuXG4gICAgICAgIC8vIEtlZXAgdHJhY2sgb2YgdGhlIHNlZW4gbWV0aG9kc1xuICAgICAgICBzZWVuTWV0aG9kcy5wdXNoKG9wZXJhdGlvbi5tZXRob2QpO1xuXG4gICAgICAgIC8vIEtlZXAgdHJhY2sgb2Ygb3BlcmF0aW9uIHR5cGVzXG4gICAgICAgIGlmIChzcGVjLnByaW1pdGl2ZXMuaW5kZXhPZihvcGVyYXRpb24udHlwZSkgPT09IC0xICYmIHNwZWMudmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAgICAgICBhZGRSZWZlcmVuY2UoYWREb2N1bWVudE1ldGFkYXRhLCAnIy9tb2RlbHMvJyArIG9wZXJhdGlvbi50eXBlLCBvUGF0aC5jb25jYXQoJ3R5cGUnKSwgYVJlc3VsdHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUHJvY2VzcyBhdXRob3JpemF0aW9uIHJlZmVyZW5jZXNcbiAgICAgICAgcHJvY2Vzc0F1dGhSZWZzKHJsRG9jdW1lbnRNZXRhZGF0YSwgb3BlcmF0aW9uLmF1dGhvcml6YXRpb25zLCBvUGF0aC5jb25jYXQoJ2F1dGhvcml6YXRpb25zJyksIGFSZXN1bHRzKTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSB2YWxpZGF0ZSBpbmxpbmUgY29uc3RyYWludHNcbiAgICAgICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhhZERvY3VtZW50TWV0YWRhdGEsIG9wZXJhdGlvbiwgb1BhdGgsIGFSZXN1bHRzKTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBwYXJhbWV0ZXJzXG4gICAgICAgIHZhbGlkYXRlUGFyYW1ldGVycyhzcGVjLCBhZERvY3VtZW50TWV0YWRhdGEsIG5QYXRoLCBvcGVyYXRpb24ucGFyYW1ldGVycywgb1BhdGgsIGFSZXN1bHRzKTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSB1bmlxdWUgcmVzcG9uc2UgY29kZVxuICAgICAgICBfLnJlZHVjZShvcGVyYXRpb24ucmVzcG9uc2VNZXNzYWdlcywgZnVuY3Rpb24gKHNlZW5SZXNwb25zZUNvZGVzLCByZXNwb25zZU1lc3NhZ2UsIGluZGV4KSB7XG4gICAgICAgICAgdmFyIHJtUGF0aCA9IG9QYXRoLmNvbmNhdChbJ3Jlc3BvbnNlTWVzc2FnZXMnLCBpbmRleC50b1N0cmluZygpXSk7XG5cbiAgICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblJlc3BvbnNlQ29kZXMsIHJlc3BvbnNlTWVzc2FnZS5jb2RlLCAnUkVTUE9OU0VfTUVTU0FHRV9DT0RFJywgJ1Jlc3BvbnNlIG1lc3NhZ2UgY29kZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHJtUGF0aC5jb25jYXQoWydjb2RlJ10pLCBhUmVzdWx0cy5lcnJvcnMpO1xuXG4gICAgICAgICAgLy8gVmFsaWRhdGUgbWlzc2luZyBtb2RlbFxuICAgICAgICAgIGlmIChyZXNwb25zZU1lc3NhZ2UucmVzcG9uc2VNb2RlbCkge1xuICAgICAgICAgICAgYWRkUmVmZXJlbmNlKGFkRG9jdW1lbnRNZXRhZGF0YSwgJyMvbW9kZWxzLycgKyByZXNwb25zZU1lc3NhZ2UucmVzcG9uc2VNb2RlbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICBybVBhdGguY29uY2F0KCdyZXNwb25zZU1vZGVsJyksIGFSZXN1bHRzKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gc2VlblJlc3BvbnNlQ29kZXMuY29uY2F0KHJlc3BvbnNlTWVzc2FnZS5jb2RlKTtcbiAgICAgICAgfSwgW10pO1xuXG4gICAgICAgIHJldHVybiBzZWVuTWV0aG9kcztcbiAgICAgIH0sIFtdKTtcblxuICAgICAgcmV0dXJuIHNlZW5QYXRocztcbiAgICB9LCBbXSk7XG5cbiAgICAvLyBWYWxpZGF0ZSBBUEkgRGVjbGFyYXRpb24gZGVmaW5pdGlvbnNcbiAgICB2YWxpZGF0ZURlZmluaXRpb25zKGFkRG9jdW1lbnRNZXRhZGF0YSwgYVJlc3VsdHMpO1xuXG4gICAgcmV0dXJuIHNlZW5SZXNvdXJjZVBhdGhzO1xuICB9LCBbXSk7XG5cbiAgLy8gVmFsaWRhdGUgQVBJIERlY2xhcmF0aW9uIGRlZmluaXRpb25zXG4gIHZhbGlkYXRlRGVmaW5pdGlvbnMocmxEb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKTtcblxuICAvLyBJZGVudGlmeSB1bnVzZWQgcmVzb3VyY2UgcGF0aHMgZGVmaW5lZCBpbiB0aGUgUmVzb3VyY2UgTGlzdGluZ1xuICBfLmVhY2goXy5kaWZmZXJlbmNlKHJsUmVzb3VyY2VQYXRocywgYWRSZXNvdXJjZVBhdGhzKSwgZnVuY3Rpb24gKHVudXNlZCkge1xuICAgIHZhciBpbmRleCA9IHJsUmVzb3VyY2VQYXRocy5pbmRleE9mKHVudXNlZCk7XG5cbiAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhyZXNvdXJjZUxpc3RpbmcuYXBpc1tpbmRleF0ucGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydhcGlzJywgaW5kZXgudG9TdHJpbmcoKSwgJ3BhdGgnXSwgcmVzdWx0cy5lcnJvcnMpO1xuICB9KTtcblxuICBjYWxsYmFjayh1bmRlZmluZWQsIHJlc3VsdHMpO1xufTtcblxudmFyIHZhbGlkYXRlU3dhZ2dlcjJfMCA9IGZ1bmN0aW9uIHZhbGlkYXRlU3dhZ2dlcjJfMCAoc3BlYywgc3dhZ2dlck9iamVjdCwgY2FsbGJhY2spIHsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG4gIHZhciBkb2N1bWVudE1ldGFkYXRhID0gZ2V0RG9jdW1lbnRDYWNoZShzd2FnZ2VyT2JqZWN0KTtcbiAgdmFyIHJlc3VsdHMgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcblxuICAvLyBQcm9jZXNzIGRlZmluaXRpb25zXG4gIHByb2Nlc3NEb2N1bWVudChkb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKTtcblxuICAvLyBQcm9jZXNzIHNlY3VyaXR5IHJlZmVyZW5jZXNcbiAgcHJvY2Vzc0F1dGhSZWZzKGRvY3VtZW50TWV0YWRhdGEsIHN3YWdnZXJPYmplY3Quc2VjdXJpdHksIFsnc2VjdXJpdHknXSwgcmVzdWx0cyk7XG5cbiAgXy5yZWR1Y2UoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5wYXRocywgZnVuY3Rpb24gKHNlZW5QYXRocywgcGF0aCwgbmFtZSkge1xuICAgIHZhciBwUGF0aCA9IFsncGF0aHMnLCBuYW1lXTtcbiAgICB2YXIgblBhdGggPSBub3JtYWxpemVQYXRoKG5hbWUpO1xuXG4gICAgLy8gVmFsaWRhdGUgZHVwbGljYXRlIHJlc291cmNlIHBhdGhcbiAgICBpZiAoc2VlblBhdGhzLmluZGV4T2YoblBhdGgucGF0aCkgPiAtMSkge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV9BUElfUEFUSCcsICdBUEkgcGF0aCAob3IgZXF1aXZhbGVudCkgYWxyZWFkeSBkZWZpbmVkOiAnICsgbmFtZSwgcFBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgcGFyYW1ldGVyc1xuICAgIHZhbGlkYXRlUGFyYW1ldGVycyhzcGVjLCBkb2N1bWVudE1ldGFkYXRhLCBuUGF0aCwgcGF0aC5wYXJhbWV0ZXJzLCBwUGF0aCwgcmVzdWx0cywgdHJ1ZSk7XG5cbiAgICAvLyBWYWxpZGF0ZSB0aGUgT3BlcmF0aW9uc1xuICAgIF8uZWFjaChwYXRoLCBmdW5jdGlvbiAob3BlcmF0aW9uLCBtZXRob2QpIHtcbiAgICAgIHZhciBjUGFyYW1zID0gW107XG4gICAgICB2YXIgb1BhdGggPSBwUGF0aC5jb25jYXQobWV0aG9kKTtcbiAgICAgIHZhciBzZWVuUGFyYW1zID0gW107XG5cbiAgICAgIGlmICh2YWxpZE9wdGlvbk5hbWVzLmluZGV4T2YobWV0aG9kKSA9PT0gLTEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBQcm9jZXNzIHNlY3VyaXR5IHJlZmVyZW5jZXNcbiAgICAgIHByb2Nlc3NBdXRoUmVmcyhkb2N1bWVudE1ldGFkYXRhLCBvcGVyYXRpb24uc2VjdXJpdHksIG9QYXRoLmNvbmNhdCgnc2VjdXJpdHknKSwgcmVzdWx0cyk7XG5cbiAgICAgIC8vIENvbXBvc2UgcGFyYW1ldGVycyBmcm9tIHBhdGggZ2xvYmFsIHBhcmFtZXRlcnMgYW5kIG9wZXJhdGlvbiBwYXJhbWV0ZXJzXG4gICAgICBfLmVhY2gob3BlcmF0aW9uLnBhcmFtZXRlcnMsIGZ1bmN0aW9uIChwYXJhbWV0ZXIpIHtcbiAgICAgICAgY1BhcmFtcy5wdXNoKHBhcmFtZXRlcik7XG5cbiAgICAgICAgc2VlblBhcmFtcy5wdXNoKHBhcmFtZXRlci5uYW1lICsgJzonICsgcGFyYW1ldGVyLmluKTtcbiAgICAgIH0pO1xuXG4gICAgICBfLmVhY2gocGF0aC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAocGFyYW1ldGVyKSB7XG4gICAgICAgIHZhciBjbG9uZWQgPSBfLmNsb25lRGVlcChwYXJhbWV0ZXIpO1xuXG4gICAgICAgIC8vIFRoZSBvbmx5IGVycm9ycyB0aGF0IGNhbiBvY2N1ciBoZXJlIGFyZSBzY2hlbWEgY29uc3RyYWludCB2YWxpZGF0aW9uIGVycm9ycyB3aGljaCBhcmUgYWxyZWFkeSByZXBvcnRlZCBhYm92ZVxuICAgICAgICAvLyBzbyBkbyBub3QgcmVwb3J0IHRoZW0gYWdhaW4uXG4gICAgICAgIGNsb25lZC5za2lwRXJyb3JzID0gdHJ1ZTtcblxuICAgICAgICBpZiAoc2VlblBhcmFtcy5pbmRleE9mKHBhcmFtZXRlci5uYW1lICsgJzonICsgcGFyYW1ldGVyLmluKSA9PT0gLTEpIHtcbiAgICAgICAgICBjUGFyYW1zLnB1c2goY2xvbmVkKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlcnNcbiAgICAgIHZhbGlkYXRlUGFyYW1ldGVycyhzcGVjLCBkb2N1bWVudE1ldGFkYXRhLCBuUGF0aCwgY1BhcmFtcywgb1BhdGgsIHJlc3VsdHMpO1xuXG4gICAgICAvLyBWYWxpZGF0ZSByZXNwb25zZXNcbiAgICAgIF8uZWFjaChvcGVyYXRpb24ucmVzcG9uc2VzLCBmdW5jdGlvbiAocmVzcG9uc2UsIHJlc3BvbnNlQ29kZSkge1xuXHQvLyBEbyBub3QgcHJvY2VzcyByZWZlcmVuY2VzIHRvIG1pc3NpbmcgcmVzcG9uc2VzXG5cdGlmICghXy5pc1VuZGVmaW5lZChyZXNwb25zZSkpIHtcbiAgICAgICAgICAvLyBWYWxpZGF0ZSB2YWxpZGF0ZSBpbmxpbmUgY29uc3RyYWludHNcbiAgICAgICAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEsIHJlc3BvbnNlLCBvUGF0aC5jb25jYXQoJ3Jlc3BvbnNlcycsIHJlc3BvbnNlQ29kZSksIHJlc3VsdHMpO1xuXHR9XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBzZWVuUGF0aHMuY29uY2F0KG5QYXRoLnBhdGgpO1xuICB9LCBbXSk7XG5cbiAgLy8gVmFsaWRhdGUgZGVmaW5pdGlvbnNcbiAgdmFsaWRhdGVEZWZpbml0aW9ucyhkb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKTtcblxuICBjYWxsYmFjayh1bmRlZmluZWQsIHJlc3VsdHMpO1xufTtcblxudmFyIHZhbGlkYXRlU2VtYW50aWNhbGx5ID0gZnVuY3Rpb24gdmFsaWRhdGVTZW1hbnRpY2FsbHkgKHNwZWMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zLCBjYWxsYmFjaykge1xuICB2YXIgY2JXcmFwcGVyID0gZnVuY3Rpb24gY2JXcmFwcGVyIChlcnIsIHJlc3VsdHMpIHtcbiAgICBjYWxsYmFjayhlcnIsIGhlbHBlcnMuZm9ybWF0UmVzdWx0cyhyZXN1bHRzKSk7XG4gIH07XG4gIGlmIChzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgdmFsaWRhdGVTd2FnZ2VyMV8yKHNwZWMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zLCBjYldyYXBwZXIpOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbiAgfSBlbHNlIHtcbiAgICB2YWxpZGF0ZVN3YWdnZXIyXzAoc3BlYywgcmxPclNPLCBjYldyYXBwZXIpOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlU3RydWN0dXJhbGx5ID0gZnVuY3Rpb24gdmFsaWRhdGVTdHJ1Y3R1cmFsbHkgKHNwZWMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zLCBjYWxsYmFjaykge1xuICB2YWxpZGF0ZUFnYWluc3RTY2hlbWEoc3BlYywgc3BlYy52ZXJzaW9uID09PSAnMS4yJyA/ICdyZXNvdXJjZUxpc3RpbmcuanNvbicgOiAnc2NoZW1hLmpzb24nLCBybE9yU08sXG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE9ubHkgdmFsaWRhdGUgdGhlIEFQSSBEZWNsYXJhdGlvbnMgaWYgdGhlIEFQSSBpcyAxLjIgYW5kIHRoZSBSZXNvdXJjZSBMaXN0aW5nIHdhcyB2YWxpZFxuICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdHMgJiYgc3BlYy52ZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcnM6IFtdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZ3M6IFtdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXBpRGVjbGFyYXRpb25zOiBbXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhc3luYy5tYXAoYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoYXBpRGVjbGFyYXRpb24sIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0ZUFnYWluc3RTY2hlbWEoc3BlYywgJ2FwaURlY2xhcmF0aW9uLmpzb24nLCBhcGlEZWNsYXJhdGlvbiwgY2FsbGJhY2spO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIsIGFsbFJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF8uZWFjaChhbGxSZXN1bHRzLCBmdW5jdGlvbiAocmVzdWx0LCBpbmRleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmFwaURlY2xhcmF0aW9uc1tpbmRleF0gPSByZXN1bHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXN1bHRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIHJlc3VsdHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbn07XG5cbi8qKlxuICogQ2FsbGJhY2sgdXNlZCBieSBhbGwganNvbi1yZWZzIGZ1bmN0aW9ucy5cbiAqXG4gKiBAcGFyYW0ge2Vycm9yfSBbZXJyXSAtIFRoZSBlcnJvciBpZiB0aGVyZSBpcyBhIHByb2JsZW1cbiAqIEBwYXJhbSB7Kn0gW3Jlc3VsdF0gLSBUaGUgcmVzdWx0IG9mIHRoZSBmdW5jdGlvblxuICpcbiAqIEBjYWxsYmFjayByZXN1bHRDYWxsYmFja1xuICovXG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBTd2FnZ2VyIHNwZWNpZmljYXRpb24gb2JqZWN0LlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uIC0gVGhlIFN3YWdnZXIgdmVyc2lvblxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgU3BlY2lmaWNhdGlvbiA9IGZ1bmN0aW9uIFNwZWNpZmljYXRpb24gKHZlcnNpb24pIHtcbiAgdmFyIGNyZWF0ZVZhbGlkYXRvcnMgPSBmdW5jdGlvbiBjcmVhdGVWYWxpZGF0b3JzIChzcGVjLCB2YWxpZGF0b3JzTWFwKSB7XG4gICAgcmV0dXJuIF8ucmVkdWNlKHZhbGlkYXRvcnNNYXAsIGZ1bmN0aW9uIChyZXN1bHQsIHNjaGVtYXMsIHNjaGVtYU5hbWUpIHtcbiAgICAgIHJlc3VsdFtzY2hlbWFOYW1lXSA9IGhlbHBlcnMuY3JlYXRlSnNvblZhbGlkYXRvcihzY2hlbWFzKTtcblxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LmJpbmQodGhpcyksIHt9KTtcbiAgfTtcbiAgdmFyIGZpeFNjaGVtYUlkID0gZnVuY3Rpb24gZml4U2NoZW1hSWQgKHNjaGVtYU5hbWUpIHtcbiAgICAvLyBTd2FnZ2VyIDEuMiBzY2hlbWEgZmlsZXMgdXNlIG9uZSBpZCBidXQgdXNlIGEgZGlmZmVyZW50IGlkIHdoZW4gcmVmZXJlbmNpbmcgc2NoZW1hIGZpbGVzLiAgV2UgYWxzbyB1c2UgdGhlIHNjaGVtYVxuICAgIC8vIGZpbGUgbmFtZSB0byByZWZlcmVuY2UgdGhlIHNjaGVtYSBpbiBaU2NoZW1hLiAgVG8gZml4IHRoaXMgc28gdGhhdCB0aGUgSlNPTiBTY2hlbWEgdmFsaWRhdG9yIHdvcmtzIHByb3Blcmx5LCB3ZVxuICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBpZCB0byBiZSB0aGUgbmFtZSBvZiB0aGUgc2NoZW1hIGZpbGUuXG4gICAgdmFyIGZpeGVkID0gXy5jbG9uZURlZXAodGhpcy5zY2hlbWFzW3NjaGVtYU5hbWVdKTtcblxuICAgIGZpeGVkLmlkID0gc2NoZW1hTmFtZTtcblxuICAgIHJldHVybiBmaXhlZDtcbiAgfS5iaW5kKHRoaXMpO1xuICB2YXIgcHJpbWl0aXZlcyA9IFsnc3RyaW5nJywgJ251bWJlcicsICdib29sZWFuJywgJ2ludGVnZXInLCAnYXJyYXknXTtcblxuICBzd2l0Y2ggKHZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICB0aGlzLmRvY3NVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9ibG9iL21hc3Rlci92ZXJzaW9ucy8xLjIubWQnO1xuICAgIHRoaXMucHJpbWl0aXZlcyA9IF8udW5pb24ocHJpbWl0aXZlcywgWyd2b2lkJywgJ0ZpbGUnXSk7XG4gICAgdGhpcy5zY2hlbWFzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9zd2FnZ2VyLWFwaS9zd2FnZ2VyLXNwZWMvdHJlZS9tYXN0ZXIvc2NoZW1hcy92MS4yJztcblxuICAgIC8vIEhlcmUgZXhwbGljaXRseSB0byBhbGxvdyBicm93c2VyaWZ5IHRvIHdvcmtcbiAgICB0aGlzLnNjaGVtYXMgPSB7XG4gICAgICAnYXBpRGVjbGFyYXRpb24uanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2FwaURlY2xhcmF0aW9uLmpzb24nKSxcbiAgICAgICdhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9hdXRob3JpemF0aW9uT2JqZWN0Lmpzb24nKSxcbiAgICAgICdkYXRhVHlwZS5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvZGF0YVR5cGUuanNvbicpLFxuICAgICAgJ2RhdGFUeXBlQmFzZS5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvZGF0YVR5cGVCYXNlLmpzb24nKSxcbiAgICAgICdpbmZvT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9pbmZvT2JqZWN0Lmpzb24nKSxcbiAgICAgICdtb2RlbHNPYmplY3QuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL21vZGVsc09iamVjdC5qc29uJyksXG4gICAgICAnb2F1dGgyR3JhbnRUeXBlLmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9vYXV0aDJHcmFudFR5cGUuanNvbicpLFxuICAgICAgJ29wZXJhdGlvbk9iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvb3BlcmF0aW9uT2JqZWN0Lmpzb24nKSxcbiAgICAgICdwYXJhbWV0ZXJPYmplY3QuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL3BhcmFtZXRlck9iamVjdC5qc29uJyksXG4gICAgICAncmVzb3VyY2VMaXN0aW5nLmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9yZXNvdXJjZUxpc3RpbmcuanNvbicpLFxuICAgICAgJ3Jlc291cmNlT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9yZXNvdXJjZU9iamVjdC5qc29uJylcbiAgICB9O1xuXG4gICAgdGhpcy52YWxpZGF0b3JzID0gY3JlYXRlVmFsaWRhdG9ycyh0aGlzLCB7XG4gICAgICAnYXBpRGVjbGFyYXRpb24uanNvbic6IF8ubWFwKFtcbiAgICAgICAgJ2RhdGFUeXBlQmFzZS5qc29uJyxcbiAgICAgICAgJ21vZGVsc09iamVjdC5qc29uJyxcbiAgICAgICAgJ29hdXRoMkdyYW50VHlwZS5qc29uJyxcbiAgICAgICAgJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbicsXG4gICAgICAgICdwYXJhbWV0ZXJPYmplY3QuanNvbicsXG4gICAgICAgICdvcGVyYXRpb25PYmplY3QuanNvbicsXG4gICAgICAgICdhcGlEZWNsYXJhdGlvbi5qc29uJ1xuICAgICAgXSwgZml4U2NoZW1hSWQpLFxuICAgICAgJ3Jlc291cmNlTGlzdGluZy5qc29uJzogXy5tYXAoW1xuICAgICAgICAncmVzb3VyY2VPYmplY3QuanNvbicsXG4gICAgICAgICdpbmZvT2JqZWN0Lmpzb24nLFxuICAgICAgICAnb2F1dGgyR3JhbnRUeXBlLmpzb24nLFxuICAgICAgICAnYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJyxcbiAgICAgICAgJ3Jlc291cmNlTGlzdGluZy5qc29uJ1xuICAgICAgXSwgZml4U2NoZW1hSWQpXG4gICAgfSk7XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIHRoaXMuZG9jc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL2Jsb2IvbWFzdGVyL3ZlcnNpb25zLzIuMC5tZCc7XG4gICAgdGhpcy5wcmltaXRpdmVzID0gXy51bmlvbihwcmltaXRpdmVzLCBbJ2ZpbGUnXSk7XG4gICAgdGhpcy5zY2hlbWFzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9zd2FnZ2VyLWFwaS9zd2FnZ2VyLXNwZWMvdHJlZS9tYXN0ZXIvc2NoZW1hcy92Mi4wJztcblxuICAgIC8vIEhlcmUgZXhwbGljaXRseSB0byBhbGxvdyBicm93c2VyaWZ5IHRvIHdvcmtcbiAgICB0aGlzLnNjaGVtYXMgPSB7XG4gICAgICAnc2NoZW1hLmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzIuMC9zY2hlbWEuanNvbicpXG4gICAgfTtcblxuICAgIHRoaXMudmFsaWRhdG9ycyA9IGNyZWF0ZVZhbGlkYXRvcnModGhpcywge1xuICAgICAgJ3NjaGVtYS5qc29uJzogW2ZpeFNjaGVtYUlkKCdzY2hlbWEuanNvbicpXVxuICAgIH0pO1xuXG4gICAgYnJlYWs7XG5cbiAgZGVmYXVsdDpcbiAgICB0aHJvdyBuZXcgRXJyb3IodmVyc2lvbiArICcgaXMgYW4gdW5zdXBwb3J0ZWQgU3dhZ2dlciBzcGVjaWZpY2F0aW9uIHZlcnNpb24nKTtcbiAgfVxuXG4gIHRoaXMudmVyc2lvbiA9IHZlcnNpb247XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIHJlc3VsdCBvZiB0aGUgdmFsaWRhdGlvbiBvZiB0aGUgU3dhZ2dlciBkb2N1bWVudChzKS5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gcmxPclNPIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgTGlzdGluZyAoMS4yKSBvciBTd2FnZ2VyIE9iamVjdCAoMi4wKVxuICogQHBhcmFtIHtvYmplY3RbXX0gW2FwaURlY2xhcmF0aW9uc10gLSBUaGUgYXJyYXkgb2YgU3dhZ2dlciBBUEkgRGVjbGFyYXRpb25zICgxLjIpXG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcbiAqXG4gKiBAcmV0dXJucyB1bmRlZmluZWQgaWYgdmFsaWRhdGlvbiBwYXNzZXMgb3IgYW4gb2JqZWN0IGNvbnRhaW5pbmcgZXJyb3JzIGFuZC9vciB3YXJuaW5nc1xuICogQHRocm93cyBFcnJvciBpZiB0aGUgYXJndW1lbnRzIHByb3ZpZGVkIGFyZSBub3QgdmFsaWRcbiAqL1xuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUudmFsaWRhdGUgPSBmdW5jdGlvbiB2YWxpZGF0ZSAocmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKSB7XG4gIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICBzd2l0Y2ggKHRoaXMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigncmVzb3VyY2VMaXN0aW5nIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURlY2xhcmF0aW9ucykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYXBpRGVjbGFyYXRpb25zIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc0FycmF5KGFwaURlY2xhcmF0aW9ucykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N3YWdnZXJPYmplY3QgaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QocmxPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3dhZ2dlck9iamVjdCBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKHRoaXMudmVyc2lvbiA9PT0gJzIuMCcpIHtcbiAgICBjYWxsYmFjayA9IGFyZ3VtZW50c1sxXTtcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICB9XG5cbiAgLy8gRm9yIFN3YWdnZXIgMi4wLCBtYWtlIHN1cmUgYXBpRGVjbGFyYXRpb25zIGlzIGFuIGVtcHR5IGFycmF5XG4gIGlmICh0aGlzLnZlcnNpb24gPT09ICcyLjAnKSB7XG4gICAgYXBpRGVjbGFyYXRpb25zID0gW107XG4gIH1cblxuICAvLyBQZXJmb3JtIHRoZSB2YWxpZGF0aW9uXG4gIHZhbGlkYXRlU3RydWN0dXJhbGx5KHRoaXMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoZXJyLCByZXN1bHQpIHtcbiAgICBpZiAoZXJyIHx8IGhlbHBlcnMuZm9ybWF0UmVzdWx0cyhyZXN1bHQpKSB7XG4gICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbGlkYXRlU2VtYW50aWNhbGx5KHRoaXMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zLCBjYWxsYmFjayk7XG4gICAgfVxuICB9LmJpbmQodGhpcykpO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgSlNPTiBTY2hlbWEgcmVwcmVzZW50YXRpb24gb2YgYSBjb21wb3NlZCBtb2RlbCBiYXNlZCBvbiBpdHMgaWQgb3IgcmVmZXJlbmNlLlxuICpcbiAqIE5vdGU6IEZvciBTd2FnZ2VyIDEuMiwgd2Ugb25seSBwZXJmb3JtIHN0cnVjdHVyYWwgdmFsaWRhdGlvbiBwcmlvciB0byBjb21wb3NpbmcgdGhlIG1vZGVsLlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBhcGlET3JTTyAtIFRoZSBTd2FnZ2VyIFJlc291cmNlIEFQSSBEZWNsYXJhdGlvbiAoMS4yKSBvciB0aGUgU3dhZ2dlciBPYmplY3QgKDIuMClcbiAqIEBwYXJhbSB7c3RyaW5nfSBtb2RlbElkT3JSZWYgLSBUaGUgbW9kZWwgaWQgKDEuMikgb3IgdGhlIHJlZmVyZW5jZSB0byB0aGUgbW9kZWwgKDEuMiBvciAyLjApXG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcbiAqXG4gKiBAcmV0dXJucyB0aGUgb2JqZWN0IHJlcHJlc2VudGluZyBhIGNvbXBvc2VkIG9iamVjdFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlcmUgYXJlIHZhbGlkYXRpb24gZXJyb3JzIHdoaWxlIGNyZWF0aW5nXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLmNvbXBvc2VNb2RlbCA9IGZ1bmN0aW9uIGNvbXBvc2VNb2RlbCAoYXBpRE9yU08sIG1vZGVsSWRPclJlZiwgY2FsbGJhY2spIHtcbiAgdmFyIHN3YWdnZXJWZXJzaW9uID0gaGVscGVycy5nZXRTd2FnZ2VyVmVyc2lvbihhcGlET3JTTyk7XG4gIHZhciBkb0NvbXBvc2l0aW9uID0gZnVuY3Rpb24gZG9Db21wb3NpdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgdmFyIGRvY3VtZW50TWV0YWRhdGE7XG5cbiAgICBpZiAoZXJyKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICB9IGVsc2UgaWYgKGhlbHBlcnMuZ2V0RXJyb3JDb3VudChyZXN1bHRzKSA+IDApIHtcbiAgICAgIHJldHVybiBoYW5kbGVWYWxpZGF0aW9uRXJyb3IocmVzdWx0cywgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIGRvY3VtZW50TWV0YWRhdGEgPSBnZXREb2N1bWVudENhY2hlKGFwaURPclNPKTtcbiAgICByZXN1bHRzID0ge1xuICAgICAgZXJyb3JzOiBbXSxcbiAgICAgIHdhcm5pbmdzOiBbXVxuICAgIH07XG5cbiAgICBwcm9jZXNzRG9jdW1lbnQoZG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XG5cbiAgICBpZiAoIWRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbbW9kZWxJZE9yUmVmXSkge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgfVxuXG4gICAgaWYgKGhlbHBlcnMuZ2V0RXJyb3JDb3VudChyZXN1bHRzKSA+IDApIHtcbiAgICAgIHJldHVybiBoYW5kbGVWYWxpZGF0aW9uRXJyb3IocmVzdWx0cywgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgZ2V0T3JDb21wb3NlU2NoZW1hKGRvY3VtZW50TWV0YWRhdGEsIG1vZGVsSWRPclJlZikpO1xuICB9O1xuXG4gIHN3aXRjaCAodGhpcy52ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9uIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignYXBpRGVjbGFyYXRpb24gbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JSZWYpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21vZGVsSWQgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzd2FnZ2VyT2JqZWN0IGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3dhZ2dlck9iamVjdCBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChfLmlzVW5kZWZpbmVkKG1vZGVsSWRPclJlZikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxSZWYgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBicmVhaztcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICB9XG5cbiAgaWYgKG1vZGVsSWRPclJlZi5jaGFyQXQoMCkgIT09ICcjJykge1xuICAgIGlmICh0aGlzLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICBtb2RlbElkT3JSZWYgPSAnIy9tb2RlbHMvJyArIG1vZGVsSWRPclJlZjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbFJlZiBtdXN0IGJlIGEgSlNPTiBQb2ludGVyJyk7XG4gICAgfVxuICB9XG5cbiAgLy8gRW5zdXJlIHRoZSBkb2N1bWVudCBpcyB2YWxpZCBmaXJzdFxuICBpZiAoc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgdmFsaWRhdGVBZ2FpbnN0U2NoZW1hKHRoaXMsICdhcGlEZWNsYXJhdGlvbi5qc29uJywgYXBpRE9yU08sIGRvQ29tcG9zaXRpb24pO1xuICB9IGVsc2Uge1xuICAgIHRoaXMudmFsaWRhdGUoYXBpRE9yU08sIGRvQ29tcG9zaXRpb24pO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyBhIG1vZGVsIGJhc2VkIG9uIGl0cyBpZC5cbiAqXG4gKiBOb3RlOiBGb3IgU3dhZ2dlciAxLjIsIHdlIG9ubHkgcGVyZm9ybSBzdHJ1Y3R1cmFsIHZhbGlkYXRpb24gcHJpb3IgdG8gY29tcG9zaW5nIHRoZSBtb2RlbC5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gYXBpRE9yU08gLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBBUEkgRGVjbGFyYXRpb24gKDEuMikgb3IgdGhlIFN3YWdnZXIgT2JqZWN0ICgyLjApXG4gKiBAcGFyYW0ge3N0cmluZ30gbW9kZWxJZE9yUmVmIC0gVGhlIG1vZGVsIGlkICgxLjIpIG9yIHRoZSByZWZlcmVuY2UgdG8gdGhlIG1vZGVsICgxLjIgb3IgMi4wKVxuICogQHBhcmFtIHtvYmplY3R9IGRhdGEgLSBUaGUgbW9kZWwgdG8gdmFsaWRhdGVcbiAqIEBwYXJhbSB7cmVzdWx0Q2FsbGJhY2t9IGNhbGxiYWNrIC0gVGhlIHJlc3VsdCBjYWxsYmFja1xuICpcbiAqIEByZXR1cm5zIHVuZGVmaW5lZCBpZiB2YWxpZGF0aW9uIHBhc3NlcyBvciBhbiBvYmplY3QgY29udGFpbmluZyBlcnJvcnMgYW5kL29yIHdhcm5pbmdzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGVyZSBhcmUgdmFsaWRhdGlvbiBlcnJvcnMgd2hpbGUgY3JlYXRpbmdcbiAqL1xuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUudmFsaWRhdGVNb2RlbCA9IGZ1bmN0aW9uIHZhbGlkYXRlTW9kZWwgKGFwaURPclNPLCBtb2RlbElkT3JSZWYsIGRhdGEsIGNhbGxiYWNrKSB7XG4gIHN3aXRjaCAodGhpcy52ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9uIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignYXBpRGVjbGFyYXRpb24gbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JSZWYpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21vZGVsSWQgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzd2FnZ2VyT2JqZWN0IGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3dhZ2dlck9iamVjdCBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChfLmlzVW5kZWZpbmVkKG1vZGVsSWRPclJlZikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxSZWYgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBicmVhaztcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGRhdGEpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdkYXRhIGlzIHJlcXVpcmVkJyk7XG4gIH1cblxuICBpZiAoXy5pc1VuZGVmaW5lZChjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgfVxuXG4gIHRoaXMuY29tcG9zZU1vZGVsKGFwaURPclNPLCBtb2RlbElkT3JSZWYsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdCkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgIH1cblxuICAgIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSh0aGlzLCByZXN1bHQsIGRhdGEsIGNhbGxiYWNrKTtcbiAgfS5iaW5kKHRoaXMpKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIGZ1bGx5IHJlc29sdmVkIGRvY3VtZW50IG9yIGRvY3VtZW50IGZyYWdtZW50LiAgKERvZXMgbm90IHBlcmZvcm0gdmFsaWRhdGlvbiBhcyB0aGlzIGlzIHR5cGljYWxseSBjYWxsZWRcbiAqIGFmdGVyIHZhbGlkYXRpb24gb2NjdXJzLikpXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IGRvY3VtZW50IC0gVGhlIGRvY3VtZW50IHRvIHJlc29sdmUgb3IgdGhlIGRvY3VtZW50IGNvbnRhaW5pbmcgdGhlIHJlZmVyZW5jZSB0byByZXNvbHZlXG4gKiBAcGFyYW0ge3N0cmluZ30gW3B0cl0gLSBUaGUgSlNPTiBQb2ludGVyIG9yIHVuZGVmaW5lZCB0byByZXR1cm4gdGhlIHdob2xlIGRvY3VtZW50XG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcbiAqXG4gKiBAcmV0dXJucyB0aGUgZnVsbHkgcmVzb2x2ZWQgZG9jdW1lbnQgb3IgZnJhZ21lbnRcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZXJlIGFyZSB1cHN0cmVhbSBlcnJvcnNcbiAqL1xuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIHJlc29sdmUgKGRvY3VtZW50LCBwdHIsIGNhbGxiYWNrKSB7XG4gIHZhciBkb2N1bWVudE1ldGFkYXRhO1xuICB2YXIgc2NoZW1hTmFtZTtcbiAgdmFyIHJlc3BvbmQgPSBmdW5jdGlvbiByZXNwb25kIChkb2N1bWVudCkge1xuICAgIGlmIChfLmlzU3RyaW5nKHB0cikpIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayh1bmRlZmluZWQsIHRyYXZlcnNlKGRvY3VtZW50KS5nZXQoSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKHB0cikpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKHVuZGVmaW5lZCwgZG9jdW1lbnQpO1xuICAgIH1cbiAgfTtcblxuICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgaWYgKF8uaXNVbmRlZmluZWQoZG9jdW1lbnQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdkb2N1bWVudCBpcyByZXF1aXJlZCcpO1xuICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoZG9jdW1lbnQpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZG9jdW1lbnQgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgfVxuXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAyKSB7XG4gICAgY2FsbGJhY2sgPSBhcmd1bWVudHNbMV07XG4gICAgcHRyID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKHB0cikgJiYgIV8uaXNTdHJpbmcocHRyKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3B0ciBtdXN0IGJlIGEgSlNPTiBQb2ludGVyIHN0cmluZycpO1xuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBpcyByZXF1aXJlZCcpO1xuICB9IGVsc2UgaWYgKCFfLmlzRnVuY3Rpb24oY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gIH1cblxuICBkb2N1bWVudE1ldGFkYXRhID0gZ2V0RG9jdW1lbnRDYWNoZShkb2N1bWVudCk7XG5cbiAgLy8gU3dhZ2dlciAxLjIgaXMgbm90IHN1cHBvcnRlZCBkdWUgdG8gaW52YWxpZCBKU09OIFJlZmVyZW5jZXMgYmVpbmcgdXNlZC4gIEV2ZW4gaWYgdGhlIEpTT04gUmVmZXJlbmNlcyB3ZXJlIHZhbGlkLFxuICAvLyB0aGUgSlNPTiBTY2hlbWEgZm9yIFN3YWdnZXIgMS4yIGRvIG5vdCBhbGxvdyBKYXZhU2NyaXB0IG9iamVjdHMgaW4gYWxsIHBsYWNlcyB3aGVyZSB0aGUgcmVzb3V0aW9uIHdvdWxkIG9jY3VyLlxuICBpZiAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1N3YWdnZXIgMS4yIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbiAgfVxuXG4gIGlmICghZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCkge1xuICAgIGlmIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgaWYgKF8uZmluZChbJ2Jhc2VQYXRoJywgJ2NvbnN1bWVzJywgJ21vZGVscycsICdwcm9kdWNlcycsICdyZXNvdXJjZVBhdGgnXSwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgcmV0dXJuICFfLmlzVW5kZWZpbmVkKGRvY3VtZW50W25hbWVdKTtcbiAgICAgIH0pKSB7XG4gICAgICAgIHNjaGVtYU5hbWUgPSAnYXBpRGVjbGFyYXRpb24uanNvbic7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY2hlbWFOYW1lID0gJ3Jlc291cmNlTGlzdGluZy5qc29uJztcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc2NoZW1hTmFtZSA9ICdzY2hlbWEuanNvbic7XG4gICAgfVxuXG4gICAgLy8gRW5zdXJlIHRoZSBkb2N1bWVudCBpcyB2YWxpZCBmaXJzdFxuICAgIHRoaXMudmFsaWRhdGUoZG9jdW1lbnQsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICB9IGVsc2UgaWYgKGhlbHBlcnMuZ2V0RXJyb3JDb3VudChyZXN1bHRzKSA+IDApIHtcbiAgICAgICAgcmV0dXJuIGhhbmRsZVZhbGlkYXRpb25FcnJvcihyZXN1bHRzLCBjYWxsYmFjayk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXNwb25kKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiByZXNwb25kKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpO1xuICB9XG59O1xuXG4vKipcbiAqIENvbnZlcnRzIHRoZSBTd2FnZ2VyIDEuMiBkb2N1bWVudHMgdG8gYSBTd2FnZ2VyIDIuMCBkb2N1bWVudC5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gcmVzb3VyY2VMaXN0aW5nIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgTGlzdGluZ1xuICogQHBhcmFtIHtvYmplY3RbXX0gW2FwaURlY2xhcmF0aW9uc10gLSBUaGUgYXJyYXkgb2YgU3dhZ2dlciBBUEkgRGVjbGFyYXRpb25zXG4gKiBAcGFyYW0ge2Jvb2xlYW49ZmFsc2V9IFtza2lwVmFsaWRhdGlvbl0gLSBXaGV0aGVyIG9yIG5vdCB0byBza2lwIHZhbGlkYXRpb25cbiAqIEBwYXJhbSB7cmVzdWx0Q2FsbGJhY2t9IGNhbGxiYWNrIC0gVGhlIHJlc3VsdCBjYWxsYmFja1xuICpcbiAqIEByZXR1cm5zIHRoZSBjb252ZXJ0ZWQgU3dhZ2dlciBkb2N1bWVudFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIGFyZ3VtZW50cyBwcm92aWRlZCBhcmUgbm90IHZhbGlkXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLmNvbnZlcnQgPSBmdW5jdGlvbiAocmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMsIHNraXBWYWxpZGF0aW9uLCBjYWxsYmFjaykge1xuICB2YXIgZG9Db252ZXJ0ID0gZnVuY3Rpb24gZG9Db252ZXJ0IChyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucykge1xuICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgc3dhZ2dlckNvbnZlcnRlcihyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucykpO1xuICB9LmJpbmQodGhpcyk7XG5cbiAgaWYgKHRoaXMudmVyc2lvbiAhPT0gJzEuMicpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1NwZWNpZmljYXRpb24jY29udmVydCBvbmx5IHdvcmtzIGZvciBTd2FnZ2VyIDEuMicpO1xuICB9XG5cbiAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gIGlmIChfLmlzVW5kZWZpbmVkKHJlc291cmNlTGlzdGluZykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBpcyByZXF1aXJlZCcpO1xuICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QocmVzb3VyY2VMaXN0aW5nKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICB9XG5cbiAgLy8gQVBJIERlY2xhcmF0aW9ucyBhcmUgb3B0aW9uYWwgYmVjYXVzZSBzd2FnZ2VyLWNvbnZlcnRlciB3YXMgd3JpdHRlbiB0byBzdXBwb3J0IGl0XG4gIGlmIChfLmlzVW5kZWZpbmVkKGFwaURlY2xhcmF0aW9ucykpIHtcbiAgICBhcGlEZWNsYXJhdGlvbnMgPSBbXTtcbiAgfVxuXG4gIGlmICghXy5pc0FycmF5KGFwaURlY2xhcmF0aW9ucykpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdhcGlEZWNsYXJhdGlvbnMgbXVzdCBiZSBhbiBhcnJheScpO1xuICB9XG5cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPCA0KSB7XG4gICAgY2FsbGJhY2sgPSBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aCAtIDFdO1xuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBpcyByZXF1aXJlZCcpO1xuICB9IGVsc2UgaWYgKCFfLmlzRnVuY3Rpb24oY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gIH1cblxuICBpZiAoc2tpcFZhbGlkYXRpb24gPT09IHRydWUpIHtcbiAgICBkb0NvbnZlcnQocmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMpO1xuICB9IGVsc2Uge1xuICAgIHRoaXMudmFsaWRhdGUocmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICB9IGVsc2UgaWYgKGhlbHBlcnMuZ2V0RXJyb3JDb3VudChyZXN1bHRzKSA+IDApIHtcbiAgICAgICAgcmV0dXJuIGhhbmRsZVZhbGlkYXRpb25FcnJvcihyZXN1bHRzLCBjYWxsYmFjayk7XG4gICAgICB9XG5cbiAgICAgIGRvQ29udmVydChyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucyk7XG4gICAgfSk7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzLnYxID0gbW9kdWxlLmV4cG9ydHMudjFfMiA9IG5ldyBTcGVjaWZpY2F0aW9uKCcxLjInKTsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG5tb2R1bGUuZXhwb3J0cy52MiA9IG1vZHVsZS5leHBvcnRzLnYyXzAgPSBuZXcgU3BlY2lmaWNhdGlvbignMi4wJyk7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsKXtcbi8qXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgQXBpZ2VlIENvcnBvcmF0aW9uXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG4gKiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cbiAqIFRIRSBTT0ZUV0FSRS5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuXyA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwuXyA6IG51bGwpO1xudmFyIEpzb25SZWZzID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuSnNvblJlZnMgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLkpzb25SZWZzIDogbnVsbCk7XG52YXIgWlNjaGVtYSA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlpTY2hlbWEgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLlpTY2hlbWEgOiBudWxsKTtcblxudmFyIGRyYWZ0MDRKc29uID0gcmVxdWlyZSgnLi4vc2NoZW1hcy9qc29uLXNjaGVtYS1kcmFmdC0wNC5qc29uJyk7XG52YXIgZHJhZnQwNFVybCA9ICdodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSc7XG52YXIgc3BlY0NhY2hlID0ge307XG5cbm1vZHVsZS5leHBvcnRzLmNyZWF0ZUpzb25WYWxpZGF0b3IgPSBmdW5jdGlvbiBjcmVhdGVKc29uVmFsaWRhdG9yIChzY2hlbWFzKSB7XG4gIHZhciB2YWxpZGF0b3IgPSBuZXcgWlNjaGVtYSh7XG4gICAgcmVwb3J0UGF0aEFzQXJyYXk6IHRydWVcbiAgfSk7XG4gIHZhciByZXN1bHQ7XG5cbiAgLy8gQWRkIHRoZSBkcmFmdC0wNCBzcGVjXG4gIHZhbGlkYXRvci5zZXRSZW1vdGVSZWZlcmVuY2UoZHJhZnQwNFVybCwgZHJhZnQwNEpzb24pO1xuXG4gIC8vIFN3YWdnZXIgdXNlcyBzb21lIHVuc3VwcG9ydGVkL2ludmFsaWQgZm9ybWF0cyBzbyBqdXN0IG1ha2UgdGhlbSBhbGwgcGFzc1xuICBfLmVhY2goWydieXRlJywgJ2RvdWJsZScsICdmbG9hdCcsICdpbnQzMicsICdpbnQ2NCcsICdtaW1lLXR5cGUnLCAndXJpLXRlbXBsYXRlJ10sIGZ1bmN0aW9uIChmb3JtYXQpIHtcbiAgICBaU2NoZW1hLnJlZ2lzdGVyRm9ybWF0KGZvcm1hdCwgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIENvbXBpbGUgYW5kIHZhbGlkYXRlIHRoZSBzY2hlbWFzXG4gIGlmICghXy5pc1VuZGVmaW5lZChzY2hlbWFzKSkge1xuICAgIHJlc3VsdCA9IHZhbGlkYXRvci5jb21waWxlU2NoZW1hKHNjaGVtYXMpO1xuXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gZXJyb3IsIGl0J3MgdW5yZWNvdmVyYWJsZSBzbyBqdXN0IGJsb3cgdGhlIGVmZiB1cFxuICAgIGlmIChyZXN1bHQgPT09IGZhbHNlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdKU09OIFNjaGVtYSBmaWxlJyArIChzY2hlbWFzLmxlbmd0aCA+IDEgPyAncyBhcmUnIDogJyBpcycpICsgJyBpbnZhbGlkOicpO1xuXG4gICAgICBfLmVhY2godmFsaWRhdG9yLmdldExhc3RFcnJvcnMoKSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCcgICcgKyAoXy5pc0FycmF5KGVyci5wYXRoKSA/IEpzb25SZWZzLnBhdGhUb1BvaW50ZXIoZXJyLnBhdGgpIDogZXJyLnBhdGgpICsgJzogJyArIGVyci5tZXNzYWdlKTtcbiAgICAgIH0pO1xuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byBjcmVhdGUgdmFsaWRhdG9yIGR1ZSB0byBpbnZhbGlkIEpTT04gU2NoZW1hJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHZhbGlkYXRvcjtcbn07XG5cbm1vZHVsZS5leHBvcnRzLmZvcm1hdFJlc3VsdHMgPSBmdW5jdGlvbiBmb3JtYXRSZXN1bHRzIChyZXN1bHRzKSB7XG4gIGlmIChyZXN1bHRzKSB7XG4gICAgLy8gVXBkYXRlIHRoZSByZXN1bHRzIGJhc2VkIG9uIGl0cyBjb250ZW50IHRvIGluZGljYXRlIHN1Y2Nlc3MvZmFpbHVyZSBhY2NvcmRpbmdseVxuICAgIHJldHVybiByZXN1bHRzLmVycm9ycy5sZW5ndGggKyByZXN1bHRzLndhcm5pbmdzLmxlbmd0aCArXG4gICAgXy5yZWR1Y2UocmVzdWx0cy5hcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChjb3VudCwgYVJlc3VsdCkge1xuICAgICAgaWYgKGFSZXN1bHQpIHtcbiAgICAgICAgY291bnQgKz0gYVJlc3VsdC5lcnJvcnMubGVuZ3RoICsgYVJlc3VsdC53YXJuaW5ncy5sZW5ndGg7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjb3VudDtcbiAgICB9LCAwKSA+IDAgPyByZXN1bHRzIDogdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5nZXRFcnJvckNvdW50ID0gZnVuY3Rpb24gZ2V0RXJyb3JDb3VudCAocmVzdWx0cykge1xuICB2YXIgZXJyb3JzID0gMDtcblxuICBpZiAocmVzdWx0cykge1xuICAgIGVycm9ycyA9IHJlc3VsdHMuZXJyb3JzLmxlbmd0aDtcblxuICAgIF8uZWFjaChyZXN1bHRzLmFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGFkUmVzdWx0cykge1xuICAgICAgaWYgKGFkUmVzdWx0cykge1xuICAgICAgICBlcnJvcnMgKz0gYWRSZXN1bHRzLmVycm9ycy5sZW5ndGg7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gZXJyb3JzO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBwcm9wZXIgc3BlY2lmaWNhdGlvbiBiYXNlZCBvbiB0aGUgaHVtYW4gcmVhZGFibGUgdmVyc2lvbi5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvbiAtIFRoZSBodW1hbiByZWFkYWJsZSBTd2FnZ2VyIHZlcnNpb24gKEV4OiAxLjIpXG4gKlxuICogQHJldHVybnMgdGhlIGNvcnJlc3BvbmRpbmcgU3dhZ2dlciBTcGVjaWZpY2F0aW9uIG9iamVjdCBvciB1bmRlZmluZWQgaWYgdGhlcmUgaXMgbm9uZVxuICovXG5tb2R1bGUuZXhwb3J0cy5nZXRTcGVjID0gZnVuY3Rpb24gZ2V0U3BlYyAodmVyc2lvbikge1xuICB2YXIgc3BlYyA9IHNwZWNDYWNoZVt2ZXJzaW9uXTtcblxuICBpZiAoXy5pc1VuZGVmaW5lZChzcGVjKSkge1xuICAgIHN3aXRjaCAodmVyc2lvbikge1xuICAgIGNhc2UgJzEuMic6XG4gICAgICBzcGVjID0gcmVxdWlyZSgnLi4vbGliL3NwZWNzJykudjFfMjsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG5cbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAnMi4wJzpcbiAgICAgIHNwZWMgPSByZXF1aXJlKCcuLi9saWIvc3BlY3MnKS52Ml8wOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcblxuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHNwZWM7XG59O1xuXG4vKipcbiAqIEF0ZW1wdHMgdG8gZmlndXJlIG91dCB0aGUgU3dhZ2dlciB2ZXJzaW9uIGZyb20gdGhlIFN3YWdnZXIgZG9jdW1lbnQuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IGRvY3VtZW50IC0gVGhlIFN3YWdnZXIgZG9jdW1lbnRcbiAqXG4gKiBAcmV0dXJucyB0aGUgU3dhZ2dlciB2ZXJzaW9uIG9yIHVuZGVmaW5lZCBpZiB0aGUgZG9jdW1lbnQgaXMgbm90IGEgU3dhZ2dlciBkb2N1bWVudFxuICovXG5tb2R1bGUuZXhwb3J0cy5nZXRTd2FnZ2VyVmVyc2lvbiA9IGZ1bmN0aW9uIGdldFN3YWdnZXJWZXJzaW9uIChkb2N1bWVudCkge1xuICByZXR1cm4gXy5pc1BsYWluT2JqZWN0KGRvY3VtZW50KSA/IGRvY3VtZW50LnN3YWdnZXJWZXJzaW9uIHx8IGRvY3VtZW50LnN3YWdnZXIgOiB1bmRlZmluZWQ7XG59O1xuXG4vKipcbiAqIFRha2VzIGFuIGFycmF5IG9mIHBhdGggc2VnbWVudHMgYW5kIGNyZWF0ZXMgYSBKU09OIHBvaW50ZXIgZnJvbSBpdC4gKDIuMCBvbmx5KVxuICpcbiAqIEBwYXJhbSB7c3RyaW5nW119IHBhdGggLSBUaGUgcGF0aCBzZWdtZW50c1xuICpcbiAqIEByZXR1cm5zIGEgSlNPTiBwb2ludGVyIGZvciB0aGUgcmVmZXJlbmNlIGRlbm90ZWQgYnkgdGhlIHBhdGggc2VnbWVudHNcbiAqL1xudmFyIHRvSnNvblBvaW50ZXIgPSBtb2R1bGUuZXhwb3J0cy50b0pzb25Qb2ludGVyID0gZnVuY3Rpb24gdG9Kc29uUG9pbnRlciAocGF0aCkge1xuICAvLyBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM2OTAxI3NlY3Rpb24tNFxuICByZXR1cm4gJyMvJyArIHBhdGgubWFwKGZ1bmN0aW9uIChwYXJ0KSB7XG4gICAgcmV0dXJuIHBhcnQucmVwbGFjZSgvfi9nLCAnfjAnKS5yZXBsYWNlKC9cXC8vZywgJ34xJyk7XG4gIH0pLmpvaW4oJy8nKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLnByaW50VmFsaWRhdGlvblJlc3VsdHMgPSBmdW5jdGlvbiBwcmludFZhbGlkYXRpb25SZXN1bHRzICh2ZXJzaW9uLCBhcGlET3JTTywgYXBpRGVjbGFyYXRpb25zLCByZXN1bHRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByaW50U3VtbWFyeSwgZW5kUHJvY2Vzcykge1xuICB2YXIgcGx1cmFsaXplID0gZnVuY3Rpb24gcGx1cmFsaXplIChzdHJpbmcsIGNvdW50KSB7XG4gICAgcmV0dXJuIGNvdW50ID09PSAxID8gc3RyaW5nIDogc3RyaW5nICsgJ3MnO1xuICB9O1xuICB2YXIgcHJpbnRFcnJvcnNPcldhcm5pbmdzID0gZnVuY3Rpb24gcHJpbnRFcnJvcnNPcldhcm5pbmdzIChoZWFkZXIsIGVudHJpZXMsIGluZGVudCkge1xuICAgIGlmIChoZWFkZXIpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoaGVhZGVyICsgJzonKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoKTtcbiAgICB9XG5cbiAgICBfLmVhY2goZW50cmllcywgZnVuY3Rpb24gKGVudHJ5KSB7XG4gICAgICBjb25zb2xlLmVycm9yKG5ldyBBcnJheShpbmRlbnQgKyAxKS5qb2luKCcgJykgKyB0b0pzb25Qb2ludGVyKGVudHJ5LnBhdGgpICsgJzogJyArIGVudHJ5Lm1lc3NhZ2UpO1xuXG4gICAgICBpZiAoZW50cnkuaW5uZXIpIHtcbiAgICAgICAgcHJpbnRFcnJvcnNPcldhcm5pbmdzICh1bmRlZmluZWQsIGVudHJ5LmlubmVyLCBpbmRlbnQgKyAyKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChoZWFkZXIpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoKTtcbiAgICB9XG4gIH07XG4gIHZhciBlcnJvckNvdW50ID0gMDtcbiAgdmFyIHdhcm5pbmdDb3VudCA9IDA7XG5cbiAgY29uc29sZS5lcnJvcigpO1xuXG4gIGlmIChyZXN1bHRzLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgZXJyb3JDb3VudCArPSByZXN1bHRzLmVycm9ycy5sZW5ndGg7XG5cbiAgICBwcmludEVycm9yc09yV2FybmluZ3MoJ0FQSSBFcnJvcnMnLCByZXN1bHRzLmVycm9ycywgMik7XG4gIH1cblxuICBpZiAocmVzdWx0cy53YXJuaW5ncy5sZW5ndGggPiAwKSB7XG4gICAgd2FybmluZ0NvdW50ICs9IHJlc3VsdHMud2FybmluZ3MubGVuZ3RoO1xuXG4gICAgcHJpbnRFcnJvcnNPcldhcm5pbmdzKCdBUEkgV2FybmluZ3MnLCByZXN1bHRzLndhcm5pbmdzLCAyKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLmFwaURlY2xhcmF0aW9ucykge1xuICAgIHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zLmZvckVhY2goZnVuY3Rpb24gKGFkUmVzdWx0LCBpbmRleCkge1xuICAgICAgaWYgKCFhZFJlc3VsdCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHZhciBuYW1lID0gYXBpRGVjbGFyYXRpb25zW2luZGV4XS5yZXNvdXJjZVBhdGggfHwgaW5kZXg7XG5cbiAgICAgIGlmIChhZFJlc3VsdC5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBlcnJvckNvdW50ICs9IGFkUmVzdWx0LmVycm9ycy5sZW5ndGg7XG5cbiAgICAgICAgcHJpbnRFcnJvcnNPcldhcm5pbmdzKCcgIEFQSSBEZWNsYXJhdGlvbiAoJyArIG5hbWUgKyAnKSBFcnJvcnMnLCBhZFJlc3VsdC5lcnJvcnMsIDQpO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWRSZXN1bHQud2FybmluZ3MubGVuZ3RoID4gMCkge1xuICAgICAgICB3YXJuaW5nQ291bnQgKz0gYWRSZXN1bHQud2FybmluZ3MubGVuZ3RoO1xuXG4gICAgICAgIHByaW50RXJyb3JzT3JXYXJuaW5ncygnICBBUEkgRGVjbGFyYXRpb24gKCcgKyBuYW1lICsgJykgV2FybmluZ3MnLCBhZFJlc3VsdC53YXJuaW5ncywgNCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBpZiAocHJpbnRTdW1tYXJ5KSB7XG4gICAgaWYgKGVycm9yQ291bnQgPiAwKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGVycm9yQ291bnQgKyAnICcgKyBwbHVyYWxpemUoJ2Vycm9yJywgZXJyb3JDb3VudCkgKyAnIGFuZCAnICsgd2FybmluZ0NvdW50ICsgJyAnICtcbiAgICAgICAgICAgICAgICAgICAgcGx1cmFsaXplKCd3YXJuaW5nJywgd2FybmluZ0NvdW50KSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1ZhbGlkYXRpb24gc3VjY2VlZGVkIGJ1dCB3aXRoICcgKyB3YXJuaW5nQ291bnQgKyAnICcgKyBwbHVyYWxpemUoJ3dhcm5pbmcnLCB3YXJuaW5nQ291bnQpKTtcbiAgICB9XG4gIH1cblxuICBpZiAoZXJyb3JDb3VudCA+IDAgJiYgZW5kUHJvY2Vzcykge1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMuc3dhZ2dlck9wZXJhdGlvbk1ldGhvZHMgPSBbXG4gICdERUxFVEUnLFxuICAnR0VUJyxcbiAgJ0hFQUQnLFxuICAnT1BUSU9OUycsXG4gICdQQVRDSCcsXG4gICdQT1NUJyxcbiAgJ1BVVCdcbl07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKCdfcHJvY2VzcycpLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBBcGlnZWUgQ29ycG9yYXRpb25cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG4vLyBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzMzM5I3NlY3Rpb24tNS42XG52YXIgZGF0ZVJlZ0V4cCA9IC9eKFswLTldezR9KS0oWzAtOV17Mn0pLShbMC05XXsyfSkkLztcbi8vIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzMzMzkjc2VjdGlvbi01LjZcbnZhciBkYXRlVGltZVJlZ0V4cCA9IC9eKFswLTldezJ9KTooWzAtOV17Mn0pOihbMC05XXsyfSkoLlswLTldKyk/KHp8KFsrLV1bMC05XXsyfTpbMC05XXsyfSkpJC87XG52YXIgaXNWYWxpZERhdGUgPSBmdW5jdGlvbiBpc1ZhbGlkRGF0ZSAoZGF0ZSkge1xuICB2YXIgZGF5O1xuICB2YXIgbWF0Y2hlcztcbiAgdmFyIG1vbnRoO1xuXG4gIGlmICghXy5pc1N0cmluZyhkYXRlKSkge1xuICAgIGRhdGUgPSBkYXRlLnRvU3RyaW5nKCk7XG4gIH1cblxuICBtYXRjaGVzID0gZGF0ZVJlZ0V4cC5leGVjKGRhdGUpO1xuXG4gIGlmIChtYXRjaGVzID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBkYXkgPSBtYXRjaGVzWzNdO1xuICBtb250aCA9IG1hdGNoZXNbMl07XG5cbiAgaWYgKG1vbnRoIDwgJzAxJyB8fCBtb250aCA+ICcxMicgfHwgZGF5IDwgJzAxJyB8fCBkYXkgPiAnMzEnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xudmFyIGlzVmFsaWREYXRlVGltZSA9IGZ1bmN0aW9uIGlzVmFsaWREYXRlVGltZSAoZGF0ZVRpbWUpIHtcbiAgdmFyIGhvdXI7XG4gIHZhciBkYXRlO1xuICB2YXIgdGltZTtcbiAgdmFyIG1hdGNoZXM7XG4gIHZhciBtaW51dGU7XG4gIHZhciBwYXJ0cztcbiAgdmFyIHNlY29uZDtcblxuICBpZiAoIV8uaXNTdHJpbmcoZGF0ZVRpbWUpKSB7XG4gICAgZGF0ZVRpbWUgPSBkYXRlVGltZS50b1N0cmluZygpO1xuICB9XG5cbiAgcGFydHMgPSBkYXRlVGltZS50b0xvd2VyQ2FzZSgpLnNwbGl0KCd0Jyk7XG4gIGRhdGUgPSBwYXJ0c1swXTtcbiAgdGltZSA9IHBhcnRzLmxlbmd0aCA+IDEgPyBwYXJ0c1sxXSA6IHVuZGVmaW5lZDtcblxuICBpZiAoIWlzVmFsaWREYXRlKGRhdGUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBtYXRjaGVzID0gZGF0ZVRpbWVSZWdFeHAuZXhlYyh0aW1lKTtcblxuICBpZiAobWF0Y2hlcyA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaG91ciA9IG1hdGNoZXNbMV07XG4gIG1pbnV0ZSA9IG1hdGNoZXNbMl07XG4gIHNlY29uZCA9IG1hdGNoZXNbM107XG5cbiAgaWYgKGhvdXIgPiAnMjMnIHx8IG1pbnV0ZSA+ICc1OScgfHwgc2Vjb25kID4gJzU5Jykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxudmFyIHRocm93RXJyb3JXaXRoQ29kZSA9IGZ1bmN0aW9uIHRocm93RXJyb3JXaXRoQ29kZSAoY29kZSwgbXNnKSB7XG4gIHZhciBlcnIgPSBuZXcgRXJyb3IobXNnKTtcblxuICBlcnIuY29kZSA9IGNvZGU7XG4gIGVyci5mYWlsZWRWYWxpZGF0aW9uID0gdHJ1ZTtcblxuICB0aHJvdyBlcnI7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUFnYWluc3RTY2hlbWEgPSBmdW5jdGlvbiB2YWxpZGF0ZUFnYWluc3RTY2hlbWEgKHNjaGVtYU9yTmFtZSwgZGF0YSwgdmFsaWRhdG9yKSB7XG4gIHZhciByZW1vdmVQYXJhbXMgPSBmdW5jdGlvbiAob2JqKSB7XG4gICAgZGVsZXRlIG9iai5wYXJhbXM7XG5cbiAgICBpZiAob2JqLmlubmVyKSB7XG4gICAgICBfLmVhY2gob2JqLmlubmVyLCBmdW5jdGlvbiAobk9iaikge1xuXHRyZW1vdmVQYXJhbXMobk9iaik7XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG4gIHZhciBzY2hlbWEgPSBfLmlzUGxhaW5PYmplY3Qoc2NoZW1hT3JOYW1lKSA/IF8uY2xvbmVEZWVwKHNjaGVtYU9yTmFtZSkgOiBzY2hlbWFPck5hbWU7XG5cbiAgLy8gV2UgZG9uJ3QgY2hlY2sgdGhpcyBkdWUgdG8gaW50ZXJuYWwgdXNhZ2UgYnV0IGlmIHZhbGlkYXRvciBpcyBub3QgcHJvdmlkZWQsIHNjaGVtYU9yTmFtZSBtdXN0IGJlIGEgc2NoZW1hXG4gIGlmIChfLmlzVW5kZWZpbmVkKHZhbGlkYXRvcikpIHtcbiAgICB2YWxpZGF0b3IgPSBoZWxwZXJzLmNyZWF0ZUpzb25WYWxpZGF0b3IoW3NjaGVtYV0pO1xuICB9XG5cbiAgdmFyIHZhbGlkID0gdmFsaWRhdG9yLnZhbGlkYXRlKGRhdGEsIHNjaGVtYSk7XG5cbiAgaWYgKCF2YWxpZCkge1xuICAgIHRyeSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ1NDSEVNQV9WQUxJREFUSU9OX0ZBSUxFRCcsICdGYWlsZWQgc2NoZW1hIHZhbGlkYXRpb24nKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGVyci5yZXN1bHRzID0ge1xuXHRlcnJvcnM6IF8ubWFwKHZhbGlkYXRvci5nZXRMYXN0RXJyb3JzKCksIGZ1bmN0aW9uIChlcnIpIHtcblx0ICByZW1vdmVQYXJhbXMoZXJyKTtcblxuXHQgIHJldHVybiBlcnI7XG5cdH0pLFxuXHR3YXJuaW5nczogW11cbiAgICAgIH07XG5cbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gIH1cbn07XG5cblxuLyoqXG4gKiBWYWxpZGF0ZXMgYSBzY2hlbWEgb2YgdHlwZSBhcnJheSBpcyBwcm9wZXJseSBmb3JtZWQgKHdoZW4gbmVjZXNzYXIpLlxuICpcbiAqICpwYXJhbSB7b2JqZWN0fSBzY2hlbWEgLSBUaGUgc2NoZW1hIG9iamVjdCB0byB2YWxpZGF0ZVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHNjaGVtYSBzYXlzIGl0J3MgYW4gYXJyYXkgYnV0IGl0IGlzIG5vdCBmb3JtZWQgcHJvcGVybHlcbiAqXG4gKiBAc2VlIHtAbGluayBodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL2lzc3Vlcy8xNzR9XG4gKi9cbnZhciB2YWxpZGF0ZUFycmF5VHlwZSA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlQXJyYXlUeXBlID0gZnVuY3Rpb24gdmFsaWRhdGVBcnJheVR5cGUgKHNjaGVtYSkge1xuICAvLyBXZSBoYXZlIHRvIGRvIHRoaXMgbWFudWFsbHkgZm9yIG5vd1xuICBpZiAoc2NoZW1hLnR5cGUgPT09ICdhcnJheScgJiYgXy5pc1VuZGVmaW5lZChzY2hlbWEuaXRlbXMpKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdPQkpFQ1RfTUlTU0lOR19SRVFVSVJFRF9QUk9QRVJUWScsICdNaXNzaW5nIHJlcXVpcmVkIHByb3BlcnR5OiBpdGVtcycpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBvciByZXNwb25zZSBjb250ZW50IHR5cGUgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBnUE9yQyAtIFRoZSB2YWxpZCBjb25zdW1lcyBhdCB0aGUgQVBJIHNjb3BlXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBvUE9yQyAtIFRoZSB2YWxpZCBjb25zdW1lcyBhdCB0aGUgb3BlcmF0aW9uIHNjb3BlXG4gKiBAcGFyYW0ge29iamVjdH0gcmVxT3JSZXMgLSBUaGUgcmVxdWVzdCBvciByZXNwb25zZVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIGNvbnRlbnQgdHlwZSBpcyBpbnZhbGlkXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlQ29udGVudFR5cGUgPSBmdW5jdGlvbiB2YWxpZGF0ZUNvbnRlbnRUeXBlIChnUE9yQywgb1BPckMsIHJlcU9yUmVzKSB7XG4gIC8vIGh0dHA6Ly93d3cudzMub3JnL1Byb3RvY29scy9yZmMyNjE2L3JmYzI2MTYtc2VjNy5odG1sI3NlYzcuMi4xXG4gIHZhciBpc1Jlc3BvbnNlID0gdHlwZW9mIHJlcU9yUmVzLmVuZCA9PT0gJ2Z1bmN0aW9uJztcbiAgdmFyIGNvbnRlbnRUeXBlID0gaXNSZXNwb25zZSA/IHJlcU9yUmVzLmdldEhlYWRlcignY29udGVudC10eXBlJykgOiByZXFPclJlcy5oZWFkZXJzWydjb250ZW50LXR5cGUnXTtcbiAgdmFyIHBPckMgPSBfLnVuaW9uKGdQT3JDLCBvUE9yQyk7XG5cbiAgaWYgKCFjb250ZW50VHlwZSkge1xuICAgIGlmIChpc1Jlc3BvbnNlKSB7XG4gICAgICBjb250ZW50VHlwZSA9ICd0ZXh0L3BsYWluJztcbiAgICB9IGVsc2Uge1xuICAgICAgY29udGVudFR5cGUgPSAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJztcbiAgICB9XG4gIH1cblxuICAvLyBHZXQgb25seSB0aGUgY29udGVudCB0eXBlXG4gIGNvbnRlbnRUeXBlID0gY29udGVudFR5cGUuc3BsaXQoJzsnKVswXTtcblxuICBpZiAocE9yQy5sZW5ndGggPiAwICYmIChpc1Jlc3BvbnNlID9cblx0XHRcdCAgdHJ1ZSA6XG5cdFx0XHQgIFsnUE9TVCcsICdQVVQnXS5pbmRleE9mKHJlcU9yUmVzLm1ldGhvZCkgIT09IC0xKSAmJiBwT3JDLmluZGV4T2YoY29udGVudFR5cGUpID09PSAtMSkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb250ZW50IHR5cGUgKCcgKyBjb250ZW50VHlwZSArICcpLiAgVGhlc2UgYXJlIHZhbGlkOiAnICsgcE9yQy5qb2luKCcsICcpKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGFnYWluc3QgdGhlIGFsbG93YWJsZSB2YWx1ZXMgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nW119IGFsbG93ZWQgLSBUaGUgYWxsb3dhYmxlIHZhbHVlc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIG5vdCBhbGxvd2FibGVcbiAqL1xudmFyIHZhbGlkYXRlRW51bSA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlRW51bSA9IGZ1bmN0aW9uIHZhbGlkYXRlRW51bSAodmFsLCBhbGxvd2VkKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChhbGxvd2VkKSAmJiAhXy5pc1VuZGVmaW5lZCh2YWwpICYmIGFsbG93ZWQuaW5kZXhPZih2YWwpID09PSAtMSkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnRU5VTV9NSVNNQVRDSCcsICdOb3QgYW4gYWxsb3dhYmxlIHZhbHVlICgnICsgYWxsb3dlZC5qb2luKCcsICcpICsgJyk6ICcgKyB2YWwpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gbWF4aW11bSAtIFRoZSBtYXhpbXVtIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtleGNsdXNpdmU9ZmFsc2VdIC0gV2hldGhlciBvciBub3QgdGhlIHZhbHVlIGluY2x1ZGVzIHRoZSBtYXhpbXVtIGluIGl0cyBjb21wYXJpc29uXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgZ3JlYXRlciB0aGFuIHRoZSBtYXhpbXVtXG4gKi9cbnZhciB2YWxpZGF0ZU1heGltdW0gPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1heGltdW0gPSBmdW5jdGlvbiB2YWxpZGF0ZU1heGltdW0gKHZhbCwgbWF4aW11bSwgdHlwZSwgZXhjbHVzaXZlKSB7XG4gIHZhciBjb2RlID0gZXhjbHVzaXZlID09PSB0cnVlID8gJ01BWElNVU1fRVhDTFVTSVZFJyA6ICdNQVhJTVVNJztcbiAgdmFyIHRlc3RNYXg7XG4gIHZhciB0ZXN0VmFsO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGV4Y2x1c2l2ZSkpIHtcbiAgICBleGNsdXNpdmUgPSBmYWxzZTtcbiAgfVxuXG4gIGlmICh0eXBlID09PSAnaW50ZWdlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VJbnQodmFsLCAxMCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VGbG9hdCh2YWwpO1xuICB9XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heGltdW0pKSB7XG4gICAgdGVzdE1heCA9IHBhcnNlRmxvYXQobWF4aW11bSk7XG5cbiAgICBpZiAoZXhjbHVzaXZlICYmIHRlc3RWYWwgPj0gdGVzdE1heCkge1xuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKGNvZGUsICdHcmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gdGhlIGNvbmZpZ3VyZWQgbWF4aW11bSAoJyArIG1heGltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfSBlbHNlIGlmICh0ZXN0VmFsID4gdGVzdE1heCkge1xuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKGNvZGUsICdHcmVhdGVyIHRoYW4gdGhlIGNvbmZpZ3VyZWQgbWF4aW11bSAoJyArIG1heGltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgYXJyYXkgY291bnQgaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhJdGVtcyAtIFRoZSBtYXhpbXVtIG51bWJlciBvZiBpdGVtc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGNvbnRhaW5zIG1vcmUgaXRlbXMgdGhhbiBhbGxvd2FibGVcbiAqL1xudmFyIHZhbGlkYXRlTWF4SXRlbXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1heEl0ZW1zID0gZnVuY3Rpb24gdmFsaWRhdGVNYXhJdGVtcyAodmFsLCBtYXhJdGVtcykge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobWF4SXRlbXMpICYmIHZhbC5sZW5ndGggPiBtYXhJdGVtcykge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnQVJSQVlfTEVOR1RIX0xPTkcnLCAnQXJyYXkgaXMgdG9vIGxvbmcgKCcgKyB2YWwubGVuZ3RoICsgJyksIG1heGltdW0gJyArIG1heEl0ZW1zKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGxlbmd0aCBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1heExlbmd0aCAtIFRoZSBtYXhpbXVtIGxlbmd0aFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlJ3MgbGVuZ3RoIGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWF4aW11bVxuICovXG52YXIgdmFsaWRhdGVNYXhMZW5ndGggPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1heExlbmd0aCA9IGZ1bmN0aW9uIHZhbGlkYXRlTWF4TGVuZ3RoICh2YWwsIG1heExlbmd0aCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobWF4TGVuZ3RoKSAmJiB2YWwubGVuZ3RoID4gbWF4TGVuZ3RoKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNQVhfTEVOR1RIJywgJ1N0cmluZyBpcyB0b28gbG9uZyAoJyArIHZhbC5sZW5ndGggKyAnIGNoYXJzKSwgbWF4aW11bSAnICsgbWF4TGVuZ3RoKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlJ3MgcHJvcGVydHkgY291bnQgaXMgZ3JlYXRlciB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5Qcm9wZXJ0aWVzIC0gVGhlIG1heGltdW0gbnVtYmVyIG9mIHByb3BlcnRpZXNcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSdzIHByb3BlcnR5IGNvdW50IGlzIGxlc3MgdGhhbiB0aGUgbWF4aW11bVxuICovXG52YXIgdmFsaWRhdGVNYXhQcm9wZXJ0aWVzID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhQcm9wZXJ0aWVzID0gZnVuY3Rpb24gdmFsaWRhdGVNYXhMZW5ndGggKHZhbCwgbWF4UHJvcGVydGllcykge1xuICB2YXIgcHJvcENvdW50ID0gXy5pc1BsYWluT2JqZWN0KHZhbCkgPyBPYmplY3Qua2V5cyh2YWwpLmxlbmd0aCA6IDA7XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heFByb3BlcnRpZXMpICYmIHByb3BDb3VudCA+IG1heFByb3BlcnRpZXMpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ01BWF9QUk9QRVJUSUVTJyxcblx0XHQgICAgICAgJ051bWJlciBvZiBwcm9wZXJ0aWVzIGlzIHRvbyBtYW55ICgnICsgcHJvcENvdW50ICsgJyBwcm9wZXJ0aWVzKSwgbWF4aW11bSAnICsgbWF4UHJvcGVydGllcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBhcnJheSBjb3VudCBpcyBncmVhdGVyIHRoYW4gdGhlIG1pbmltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSBtaW5pbXVtIC0gVGhlIG1pbmltdW0gdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2V4Y2x1c2l2ZT1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0aGUgdmFsdWUgaW5jbHVkZXMgdGhlIG1pbmltdW0gaW4gaXRzIGNvbXBhcmlzb25cbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWluaW11bSA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWluaW11bSA9IGZ1bmN0aW9uIHZhbGlkYXRlTWluaW11bSAodmFsLCBtaW5pbXVtLCB0eXBlLCBleGNsdXNpdmUpIHtcbiAgdmFyIGNvZGUgPSBleGNsdXNpdmUgPT09IHRydWUgPyAnTUlOSU1VTV9FWENMVVNJVkUnIDogJ01JTklNVU0nO1xuICB2YXIgdGVzdE1pbjtcbiAgdmFyIHRlc3RWYWw7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZXhjbHVzaXZlKSkge1xuICAgIGV4Y2x1c2l2ZSA9IGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGUgPT09ICdpbnRlZ2VyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUludCh2YWwsIDEwKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUZsb2F0KHZhbCk7XG4gIH1cblxuICBpZiAoIV8uaXNVbmRlZmluZWQobWluaW11bSkpIHtcbiAgICB0ZXN0TWluID0gcGFyc2VGbG9hdChtaW5pbXVtKTtcblxuICAgIGlmIChleGNsdXNpdmUgJiYgdGVzdFZhbCA8PSB0ZXN0TWluKSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoY29kZSwgJ0xlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgY29uZmlndXJlZCBtaW5pbXVtICgnICsgbWluaW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9IGVsc2UgaWYgKHRlc3RWYWwgPCB0ZXN0TWluKSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoY29kZSwgJ0xlc3MgdGhhbiB0aGUgY29uZmlndXJlZCBtaW5pbXVtICgnICsgbWluaW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSB2YWx1ZSBjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93ZWQgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pbkl0ZW1zIC0gVGhlIG1pbmltdW0gbnVtYmVyIG9mIGl0ZW1zXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgY29udGFpbnMgZmV3ZXIgaXRlbXMgdGhhbiBhbGxvd2FibGVcbiAqL1xudmFyIHZhbGlkYXRlTWluSXRlbXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbkl0ZW1zID0gZnVuY3Rpb24gdmFsaWRhdGVNaW5JdGVtcyAodmFsLCBtaW5JdGVtcykge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobWluSXRlbXMpICYmIHZhbC5sZW5ndGggPCBtaW5JdGVtcykge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnQVJSQVlfTEVOR1RIX1NIT1JUJywgJ0FycmF5IGlzIHRvbyBzaG9ydCAoJyArIHZhbC5sZW5ndGggKyAnKSwgbWluaW11bSAnICsgbWluSXRlbXMpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgbGVuZ3RoIGlzIGxlc3MgdGhhbiB0aGUgbWluaW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWluTGVuZ3RoIC0gVGhlIG1pbmltdW0gbGVuZ3RoXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUncyBsZW5ndGggaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtXG4gKi9cbnZhciB2YWxpZGF0ZU1pbkxlbmd0aCA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWluTGVuZ3RoID0gZnVuY3Rpb24gdmFsaWRhdGVNaW5MZW5ndGggKHZhbCwgbWluTGVuZ3RoKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChtaW5MZW5ndGgpICYmIHZhbC5sZW5ndGggPCBtaW5MZW5ndGgpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ01JTl9MRU5HVEgnLCAnU3RyaW5nIGlzIHRvbyBzaG9ydCAoJyArIHZhbC5sZW5ndGggKyAnIGNoYXJzKSwgbWluaW11bSAnICsgbWluTGVuZ3RoKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlJ3MgcHJvcGVydHkgY291bnQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIHRoZSBtaW5pbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5Qcm9wZXJ0aWVzIC0gVGhlIG1pbmltdW0gbnVtYmVyIG9mIHByb3BlcnRpZXNcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSdzIHByb3BlcnR5IGNvdW50IGlzIGxlc3MgdGhhbiB0aGUgbWluaW11bVxuICovXG52YXIgdmFsaWRhdGVNaW5Qcm9wZXJ0aWVzID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5Qcm9wZXJ0aWVzID0gZnVuY3Rpb24gdmFsaWRhdGVNaW5MZW5ndGggKHZhbCwgbWluUHJvcGVydGllcykge1xuICB2YXIgcHJvcENvdW50ID0gXy5pc1BsYWluT2JqZWN0KHZhbCkgPyBPYmplY3Qua2V5cyh2YWwpLmxlbmd0aCA6IDA7XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pblByb3BlcnRpZXMpICYmIHByb3BDb3VudCA8IG1pblByb3BlcnRpZXMpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ01JTl9QUk9QRVJUSUVTJyxcblx0XHQgICAgICAgJ051bWJlciBvZiBwcm9wZXJ0aWVzIGlzIHRvbyBmZXcgKCcgKyBwcm9wQ291bnQgKyAnIHByb3BlcnRpZXMpLCBtaW5pbXVtICcgKyBtaW5Qcm9wZXJ0aWVzKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGlzIGEgbXVsdGlwbGUgb2YgdGhlIHByb3ZpZGVkIG51bWJlciAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbXVsdGlwbGVPZiAtIFRoZSBudW1iZXIgdGhhdCBzaG91bGQgZGl2aWRlIGV2ZW5seSBpbnRvIHRoZSB2YWx1ZVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGNvbnRhaW5zIGZld2VyIGl0ZW1zIHRoYW4gYWxsb3dhYmxlXG4gKi9cbnZhciB2YWxpZGF0ZU11bHRpcGxlT2YgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU11bHRpcGxlT2YgPSBmdW5jdGlvbiB2YWxpZGF0ZU11bHRpcGxlT2YgKHZhbCwgbXVsdGlwbGVPZikge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobXVsdGlwbGVPZikgJiYgdmFsICUgbXVsdGlwbGVPZiAhPT0gMCkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnTVVMVElQTEVfT0YnLCAnTm90IGEgbXVsdGlwbGUgb2YgJyArIG11bHRpcGxlT2YpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgbWF0Y2hlcyBhIHBhdHRlcm4gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gcGF0dGVybiAtIFRoZSBwYXR0ZXJuXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgZG9lcyBub3QgbWF0Y2ggdGhlIHBhdHRlcm5cbiAqL1xudmFyIHZhbGlkYXRlUGF0dGVybiA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlUGF0dGVybiA9IGZ1bmN0aW9uIHZhbGlkYXRlUGF0dGVybiAodmFsLCBwYXR0ZXJuKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChwYXR0ZXJuKSAmJiBfLmlzTnVsbCh2YWwubWF0Y2gobmV3IFJlZ0V4cChwYXR0ZXJuKSkpKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdQQVRURVJOJywgJ0RvZXMgbm90IG1hdGNoIHJlcXVpcmVkIHBhdHRlcm46ICcgKyBwYXR0ZXJuKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIHJlcXVpcmVkbmVzcyAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtib29sZWFufSByZXF1aXJlZCAtIFdoZXRoZXIgb3Igbm90IHRoZSBwYXJhbWV0ZXIgaXMgcmVxdWlyZWRcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyByZXF1aXJlZCBidXQgaXMgbm90IHByZXNlbnRcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVSZXF1aXJlZG5lc3MgPSBmdW5jdGlvbiB2YWxpZGF0ZVJlcXVpcmVkbmVzcyAodmFsLCByZXF1aXJlZCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQocmVxdWlyZWQpICYmIHJlcXVpcmVkID09PSB0cnVlICYmIF8uaXNVbmRlZmluZWQodmFsKSkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnUkVRVUlSRUQnLCAnSXMgcmVxdWlyZWQnKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIHR5cGUgYW5kIGZvcm1hdCAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmd9IHR5cGUgLSBUaGUgcGFyYW1ldGVyIHR5cGVcbiAqIEBwYXJhbSB7c3RyaW5nfSBmb3JtYXQgLSBUaGUgcGFyYW1ldGVyIGZvcm1hdFxuICogQHBhcmFtIHtib29sZWFufSBbc2tpcEVycm9yPWZhbHNlXSAtIFdoZXRoZXIgb3Igbm90IHRvIHNraXAgdGhyb3dpbmcgYW4gZXJyb3IgKFVzZWZ1bCBmb3IgdmFsaWRhdGluZyBhcnJheXMpXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbm90IHRoZSBwcm9wZXIgdHlwZSBvciBmb3JtYXRcbiAqL1xudmFyIHZhbGlkYXRlVHlwZUFuZEZvcm1hdCA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlVHlwZUFuZEZvcm1hdCA9XG4gIGZ1bmN0aW9uIHZhbGlkYXRlVHlwZUFuZEZvcm1hdCAodmFsLCB0eXBlLCBmb3JtYXQsIHNraXBFcnJvcikge1xuICAgIHZhciByZXN1bHQgPSB0cnVlO1xuXG4gICAgaWYgKF8uaXNBcnJheSh2YWwpKSB7XG4gICAgICBfLmVhY2godmFsLCBmdW5jdGlvbiAoYVZhbCwgaW5kZXgpIHtcblx0aWYgKCF2YWxpZGF0ZVR5cGVBbmRGb3JtYXQoYVZhbCwgdHlwZSwgZm9ybWF0LCB0cnVlKSkge1xuXHQgIHRocm93RXJyb3JXaXRoQ29kZSgnSU5WQUxJRF9UWVBFJywgJ1ZhbHVlIGF0IGluZGV4ICcgKyBpbmRleCArICcgaXMgbm90IGEgdmFsaWQgJyArIHR5cGUgKyAnOiAnICsgYVZhbCk7XG5cdH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuXHRyZXN1bHQgPSBfLmlzQm9vbGVhbih2YWwpIHx8IFsnZmFsc2UnLCAndHJ1ZSddLmluZGV4T2YodmFsKSAhPT0gLTE7XG5cdGJyZWFrO1xuICAgICAgY2FzZSAnaW50ZWdlcic6XG5cdHJlc3VsdCA9ICFfLmlzTmFOKHBhcnNlSW50KHZhbCwgMTApKTtcblx0YnJlYWs7XG4gICAgICBjYXNlICdudW1iZXInOlxuXHRyZXN1bHQgPSAhXy5pc05hTihwYXJzZUZsb2F0KHZhbCkpO1xuXHRicmVhaztcbiAgICAgIGNhc2UgJ3N0cmluZyc6XG5cdGlmICghXy5pc1VuZGVmaW5lZChmb3JtYXQpKSB7XG5cdCAgc3dpdGNoIChmb3JtYXQpIHtcblx0ICBjYXNlICdkYXRlJzpcblx0ICAgIHJlc3VsdCA9IGlzVmFsaWREYXRlKHZhbCk7XG5cdCAgICBicmVhaztcblx0ICBjYXNlICdkYXRlLXRpbWUnOlxuXHQgICAgcmVzdWx0ID0gaXNWYWxpZERhdGVUaW1lKHZhbCk7XG5cdCAgICBicmVhaztcblx0ICB9XG5cdH1cblx0YnJlYWs7XG4gICAgICBjYXNlICd2b2lkJzpcblx0cmVzdWx0ID0gXy5pc1VuZGVmaW5lZCh2YWwpO1xuXHRicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc2tpcEVycm9yKSB7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gZWxzZSBpZiAoIXJlc3VsdCkge1xuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKCdJTlZBTElEX1RZUEUnLFxuXHRcdFx0IHR5cGUgIT09ICd2b2lkJyA/XG5cdFx0XHQgICAnTm90IGEgdmFsaWQgJyArIChfLmlzVW5kZWZpbmVkKGZvcm1hdCkgPyAnJyA6IGZvcm1hdCArICcgJykgKyB0eXBlICsgJzogJyArIHZhbCA6XG5cdFx0XHQgICAnVm9pZCBkb2VzIG5vdCBhbGxvdyBhIHZhbHVlJyk7XG4gICAgfVxuICB9O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgdmFsdWVzIGFyZSB1bmlxdWUgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGlzVW5pcXVlIC0gV2hldGhlciBvciBub3QgdGhlIHBhcmFtZXRlciB2YWx1ZXMgYXJlIHVuaXF1ZVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGhhcyBkdXBsaWNhdGVzXG4gKi9cbnZhciB2YWxpZGF0ZVVuaXF1ZUl0ZW1zID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVVbmlxdWVJdGVtcyA9IGZ1bmN0aW9uIHZhbGlkYXRlVW5pcXVlSXRlbXMgKHZhbCwgaXNVbmlxdWUpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGlzVW5pcXVlKSAmJiBfLnVuaXEodmFsKS5sZW5ndGggIT09IHZhbC5sZW5ndGgpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0FSUkFZX1VOSVFVRScsICdEb2VzIG5vdCBhbGxvdyBkdXBsaWNhdGUgdmFsdWVzOiAnICsgdmFsLmpvaW4oJywgJykpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgYWdhaW5zdCB0aGUgc2NoZW1hLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBzd2FnZ2VyVmVyc2lvbiAtIFRoZSBTd2FnZ2VyIHZlcnNpb25cbiAqIEBwYXJhbSB7b2JqZWN0fSBzY2hlbWEgLSBUaGUgc2NoZW1hIHRvIHVzZSB0byB2YWxpZGF0ZSB0aGluZ3NcbiAqIEBwYXJhbSB7c3RyaW5nW119IHBhdGggLSBUaGUgcGF0aCB0byB0aGUgc2NoZW1hXG4gKiBAcGFyYW0geyp9IFt2YWxdIC0gVGhlIHZhbHVlIHRvIHZhbGlkYXRlIG9yIHVuZGVmaW5lZCB0byB1c2UgdGhlIGRlZmF1bHQgdmFsdWUgcHJvdmlkZWQgYnkgdGhlIHNjaGVtYVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgYW55IHZhbGlkYXRpb24gZmFpbGVzXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMgPSBmdW5jdGlvbiB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzIChzd2FnZ2VyVmVyc2lvbiwgc2NoZW1hLCBwYXRoLCB2YWwpIHtcbiAgdmFyIHJlc29sdmVTY2hlbWEgPSBmdW5jdGlvbiByZXNvbHZlU2NoZW1hIChzY2hlbWEpIHtcbiAgICB2YXIgcmVzb2x2ZWQgPSBzY2hlbWE7XG5cbiAgICBpZiAocmVzb2x2ZWQuc2NoZW1hKSB7XG4gICAgICBwYXRoID0gcGF0aC5jb25jYXQoWydzY2hlbWEnXSk7XG5cbiAgICAgIHJlc29sdmVkID0gcmVzb2x2ZVNjaGVtYShyZXNvbHZlZC5zY2hlbWEpO1xuICAgIH1cblxuICAgIHJldHVybiByZXNvbHZlZDtcbiAgfTtcblxuICB2YXIgdHlwZSA9IHNjaGVtYS50eXBlO1xuXG4gIGlmICghdHlwZSkge1xuICAgIGlmICghc2NoZW1hLnNjaGVtYSkge1xuICAgICAgaWYgKHBhdGhbcGF0aC5sZW5ndGggLSAyXSA9PT0gJ3Jlc3BvbnNlcycpIHtcblx0dHlwZSA9ICd2b2lkJztcbiAgICAgIH0gZWxzZSB7XG5cdHR5cGUgPSAnb2JqZWN0JztcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc2NoZW1hID0gcmVzb2x2ZVNjaGVtYShzY2hlbWEpO1xuICAgICAgdHlwZSA9IHNjaGVtYS50eXBlIHx8ICdvYmplY3QnO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgLy8gQWx3YXlzIHBlcmZvcm0gdGhpcyBjaGVjayBldmVuIGlmIHRoZXJlIGlzIG5vIHZhbHVlXG4gICAgaWYgKHR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgIHZhbGlkYXRlQXJyYXlUeXBlKHNjaGVtYSk7XG4gICAgfVxuXG4gICAgLy8gRGVmYXVsdCB0byBkZWZhdWx0IHZhbHVlIGlmIG5lY2Vzc2FyeVxuICAgIGlmIChfLmlzVW5kZWZpbmVkKHZhbCkpIHtcbiAgICAgIHZhbCA9IHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/IHNjaGVtYS5kZWZhdWx0VmFsdWUgOiBzY2hlbWEuZGVmYXVsdDtcblxuICAgICAgcGF0aCA9IHBhdGguY29uY2F0KFtzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnZGVmYXVsdFZhbHVlJyA6ICdkZWZhdWx0J10pO1xuICAgIH1cblxuICAgIC8vIElmIHRoZXJlIGlzIG5vIGV4cGxpY2l0IGRlZmF1bHQgdmFsdWUsIHJldHVybiBhcyBhbGwgdmFsaWRhdGlvbnMgd2lsbCBmYWlsXG4gICAgaWYgKF8uaXNVbmRlZmluZWQodmFsKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0eXBlID09PSAnYXJyYXknKSB7XG4gICAgICBpZiAoIV8uaXNVbmRlZmluZWQoc2NoZW1hLml0ZW1zKSkge1xuXHR2YWxpZGF0ZVR5cGVBbmRGb3JtYXQodmFsLCB0eXBlID09PSAnYXJyYXknID8gc2NoZW1hLml0ZW1zLnR5cGUgOiB0eXBlLFxuXHRcdFx0ICAgICAgdHlwZSA9PT0gJ2FycmF5JyAmJiBzY2hlbWEuaXRlbXMuZm9ybWF0ID9cblx0XHRcdFx0c2NoZW1hLml0ZW1zLmZvcm1hdCA6XG5cdFx0XHRcdHNjaGVtYS5mb3JtYXQpO1xuICAgICAgfSBlbHNlIHtcblx0dmFsaWRhdGVUeXBlQW5kRm9ybWF0KHZhbCwgdHlwZSwgc2NoZW1hLmZvcm1hdCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbGlkYXRlVHlwZUFuZEZvcm1hdCh2YWwsIHR5cGUsIHNjaGVtYS5mb3JtYXQpO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIGVudW1cbiAgICB2YWxpZGF0ZUVudW0odmFsLCBzY2hlbWEuZW51bSk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhpbXVtXG4gICAgdmFsaWRhdGVNYXhpbXVtKHZhbCwgc2NoZW1hLm1heGltdW0sIHR5cGUsIHNjaGVtYS5leGNsdXNpdmVNYXhpbXVtKTtcblxuXG4gICAgLy8gVmFsaWRhdGUgbWF4SXRlbXMgKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZU1heEl0ZW1zKHZhbCwgc2NoZW1hLm1heEl0ZW1zKTtcblxuICAgIC8vIFZhbGlkYXRlIG1heExlbmd0aCAoU3dhZ2dlciAyLjArKVxuICAgIHZhbGlkYXRlTWF4TGVuZ3RoKHZhbCwgc2NoZW1hLm1heExlbmd0aCk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhQcm9wZXJ0aWVzIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVNYXhQcm9wZXJ0aWVzKHZhbCwgc2NoZW1hLm1heFByb3BlcnRpZXMpO1xuXG4gICAgLy8gVmFsaWRhdGUgbWluaW11bVxuICAgIHZhbGlkYXRlTWluaW11bSh2YWwsIHNjaGVtYS5taW5pbXVtLCB0eXBlLCBzY2hlbWEuZXhjbHVzaXZlTWluaW11bSk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtaW5JdGVtc1xuICAgIHZhbGlkYXRlTWluSXRlbXModmFsLCBzY2hlbWEubWluSXRlbXMpO1xuXG4gICAgLy8gVmFsaWRhdGUgbWluTGVuZ3RoIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVNaW5MZW5ndGgodmFsLCBzY2hlbWEubWluTGVuZ3RoKTtcblxuICAgIC8vIFZhbGlkYXRlIG1pblByb3BlcnRpZXMgKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZU1pblByb3BlcnRpZXModmFsLCBzY2hlbWEubWluUHJvcGVydGllcyk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtdWx0aXBsZU9mIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVNdWx0aXBsZU9mKHZhbCwgc2NoZW1hLm11bHRpcGxlT2YpO1xuXG4gICAgLy8gVmFsaWRhdGUgcGF0dGVybiAoU3dhZ2dlciAyLjArKVxuICAgIHZhbGlkYXRlUGF0dGVybih2YWwsIHNjaGVtYS5wYXR0ZXJuKTtcblxuICAgIC8vIFZhbGlkYXRlIHVuaXF1ZUl0ZW1zXG4gICAgdmFsaWRhdGVVbmlxdWVJdGVtcyh2YWwsIHNjaGVtYS51bmlxdWVJdGVtcyk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGVyci5wYXRoID0gcGF0aDtcblxuICAgIHRocm93IGVycjtcbiAgfVxufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufVxuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvYXBpRGVjbGFyYXRpb24uanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJzd2FnZ2VyVmVyc2lvblwiLCBcImJhc2VQYXRoXCIsIFwiYXBpc1wiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJzd2FnZ2VyVmVyc2lvblwiOiB7IFwiZW51bVwiOiBbIFwiMS4yXCIgXSB9LFxuICAgICAgICBcImFwaVZlcnNpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImJhc2VQYXRoXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIixcbiAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl5odHRwcz86Ly9cIlxuICAgICAgICB9LFxuICAgICAgICBcInJlc291cmNlUGF0aFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCIsXG4gICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeL1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXBpc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXBpT2JqZWN0XCIgfVxuICAgICAgICB9LFxuICAgICAgICBcIm1vZGVsc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIm1vZGVsc09iamVjdC5qc29uI1wiXG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvZHVjZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICBcImNvbnN1bWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7IFwiJHJlZlwiOiBcImF1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIiB9XG4gICAgfSxcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcImFwaU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInBhdGhcIiwgXCJvcGVyYXRpb25zXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJwYXRoXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpLXRlbXBsYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl4vXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwib3BlcmF0aW9uc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJvcGVyYXRpb25PYmplY3QuanNvbiNcIiB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW1lVHlwZUFycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcIm1pbWUtdHlwZVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvYXV0aG9yaXphdGlvbk9iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2Jhc2ljQXV0aFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXBpS2V5XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJiYXNpY0F1dGhcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYmFzaWNBdXRoXCIgXSB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImFwaUtleVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIsIFwicGFzc0FzXCIsIFwia2V5bmFtZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYXBpS2V5XCIgXSB9LFxuICAgICAgICAgICAgICAgIFwicGFzc0FzXCI6IHsgXCJlbnVtXCI6IFsgXCJoZWFkZXJcIiwgXCJxdWVyeVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcImtleW5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm9hdXRoMlwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiwgXCJncmFudFR5cGVzXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJvYXV0aDJcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZVwiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZ3JhbnRUeXBlc1wiOiB7IFwiJHJlZlwiOiBcIm9hdXRoMkdyYW50VHlwZS5qc29uI1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwib2F1dGgyU2NvcGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJzY29wZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwic2NvcGVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufVxuXG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvZGF0YVR5cGUuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGF0YSB0eXBlIGFzIGRlc2NyaWJlZCBieSB0aGUgc3BlY2lmaWNhdGlvbiAodmVyc2lvbiAxLjIpXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJvbmVPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZWZUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZvaWRUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZVR5cGVcIiB9LFxuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbW9kZWxUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FycmF5VHlwZVwiIH1cbiAgICBdLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInJlZlR5cGVcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwidm9pZFR5cGVcIjoge1xuICAgICAgICAgICAgXCJlbnVtXCI6IFsgeyBcInR5cGVcIjogXCJ2b2lkXCIgfSBdXG4gICAgICAgIH0sXG4gICAgICAgIFwibW9kZWxUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bWJlclwiLCBcInN0cmluZ1wiLCBcImFycmF5XCIgXVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJwcmltaXRpdmVUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcImJvb2xlYW5cIiwgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIsIFwic3RyaW5nXCIgXVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVmYXVsdFZhbHVlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjogeyBcInR5cGVcIjogWyBcImFycmF5XCIsIFwib2JqZWN0XCIsIFwibnVsbFwiIF0gfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1pbmltdW1cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwibWF4aW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgICAgICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiaW50MzJcIiwgXCJpbnQ2NFwiIF0gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJudW1iZXJcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJmbG9hdFwiLCBcImRvdWJsZVwiIF0gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYnl0ZVwiLCBcImRhdGVcIiwgXCJkYXRlLXRpbWVcIiBdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcInN0cmluZ1wiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImludGVnZXJcIiwgXCJudW1iZXJcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJhcnJheVR5cGVcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiLCBcIml0ZW1zXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJhcnJheVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaXRlbXNPYmplY3RcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3JlZlR5cGVcIlxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZVR5cGVcIlxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjoge30sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHt9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2RhdGFUeXBlQmFzZS5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwiZGVzY3JpcHRpb25cIjogXCJEYXRhIHR5cGUgZmllbGRzIChzZWN0aW9uIDQuMy4zKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7IFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdIH0sXG4gICAgICAgIHsgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0gfVxuICAgIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCIkcmVmXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJmb3JtYXRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlZmF1bHRWYWx1ZVwiOiB7XG4gICAgICAgICAgICBcIm5vdFwiOiB7IFwidHlwZVwiOiBbIFwiYXJyYXlcIiwgXCJvYmplY3RcIiwgXCJudWxsXCIgXSB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWUsXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDFcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaXRlbXNPYmplY3RcIiB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH1cbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImludDMyXCIsIFwiaW50NjRcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJudW1iZXJcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiZmxvYXRcIiwgXCJkb3VibGVcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJieXRlXCIsIFwiZGF0ZVwiLCBcImRhdGUtdGltZVwiIF1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiaXRlbXNPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0sXG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJhbGxPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9pbmZvT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcImluZm8gb2JqZWN0IChzZWN0aW9uIDUuMS4zKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInRpdGxlXCIsIFwiZGVzY3JpcHRpb25cIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidGl0bGVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJ0ZXJtc09mU2VydmljZVVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgIFwiY29udGFjdFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcImVtYWlsXCIgfSxcbiAgICAgICAgXCJsaWNlbnNlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJsaWNlbnNlVXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfVxuICAgIH0sXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9tb2RlbHNPYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJpZFwiLCBcInByb3BlcnRpZXNcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiaWRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJvcGVydHlPYmplY3RcIiB9XG4gICAgICAgIH0sXG4gICAgICAgIFwic3ViVHlwZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGlzY3JpbWluYXRvclwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJzdWJUeXBlc1wiOiBbIFwiZGlzY3JpbWluYXRvclwiIF1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInByb3BlcnR5T2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL29hdXRoMkdyYW50VHlwZS5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwibWluUHJvcGVydGllc1wiOiAxLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiaW1wbGljaXRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2ltcGxpY2l0XCIgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uX2NvZGVcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2F1dGhvcml6YXRpb25Db2RlXCIgfVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiaW1wbGljaXRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJsb2dpbkVuZHBvaW50XCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJsb2dpbkVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9sb2dpbkVuZHBvaW50XCIgfSxcbiAgICAgICAgICAgICAgICBcInRva2VuTmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbkNvZGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0b2tlbkVuZHBvaW50XCIsIFwidG9rZW5SZXF1ZXN0RW5kcG9pbnRcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInRva2VuRW5kcG9pbnRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Rva2VuRW5kcG9pbnRcIiB9LFxuICAgICAgICAgICAgICAgIFwidG9rZW5SZXF1ZXN0RW5kcG9pbnRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Rva2VuUmVxdWVzdEVuZHBvaW50XCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJsb2dpbkVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuRW5kcG9pbnRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ1cmxcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgICAgICAgICAgXCJ0b2tlbk5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuUmVxdWVzdEVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICAgICAgICAgIFwiY2xpZW50SWROYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImNsaWVudFNlY3JldE5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9vcGVyYXRpb25PYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgeyBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIiB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJtZXRob2RcIiwgXCJuaWNrbmFtZVwiLCBcInBhcmFtZXRlcnNcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIm1ldGhvZFwiOiB7IFwiZW51bVwiOiBbIFwiR0VUXCIsIFwiSEVBRFwiLCBcIlBPU1RcIiwgXCJQVVRcIiwgXCJQQVRDSFwiLCBcIkRFTEVURVwiLCBcIk9QVElPTlNcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJzdW1tYXJ5XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwibWF4TGVuZ3RoXCI6IDEyMCB9LFxuICAgICAgICAgICAgICAgIFwibm90ZXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwibmlja25hbWVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXlthLXpBLVowLTlfXSskXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiYXV0aG9yaXphdGlvbk9iamVjdC5qc29uIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZVwiXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwicGFyYW1ldGVyc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJwYXJhbWV0ZXJPYmplY3QuanNvbiNcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInJlc3BvbnNlTWVzc2FnZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZU1lc3NhZ2VPYmplY3RcIn1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwicHJvZHVjZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICAgICAgICAgIFwiY29uc3VtZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVwcmVjYXRlZFwiOiB7IFwiZW51bVwiOiBbIFwidHJ1ZVwiLCBcImZhbHNlXCIgXSB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICBdLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInJlc3BvbnNlTWVzc2FnZU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcImNvZGVcIiwgXCJtZXNzYWdlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJjb2RlXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZmMyNjE2c2VjdGlvbjEwXCIgfSxcbiAgICAgICAgICAgICAgICBcIm1lc3NhZ2VcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwicmVzcG9uc2VNb2RlbFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJyZmMyNjE2c2VjdGlvbjEwXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAxMDAsXG4gICAgICAgICAgICBcIm1heGltdW1cIjogNjAwLFxuICAgICAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW1lVHlwZUFycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcIm1pbWUtdHlwZVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcGFyYW1ldGVyT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJhbGxPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCIgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwicGFyYW1UeXBlXCIsIFwibmFtZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwicGFyYW1UeXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJwYXRoXCIsIFwicXVlcnlcIiwgXCJib2R5XCIsIFwiaGVhZGVyXCIsIFwiZm9ybVwiIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwibmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIFwiYWxsb3dNdWx0aXBsZVwiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJ0eXBlIEZpbGUgcmVxdWlyZXMgc3BlY2lhbCBwYXJhbVR5cGUgYW5kIGNvbnN1bWVzXCIsXG4gICAgICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcIm5vdFwiOiB7IFwiZW51bVwiOiBbIFwiRmlsZVwiIF0gfSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiRmlsZVwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwicGFyYW1UeXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJmb3JtXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiZW51bVwiOiBbIFwibXVsdGlwYXJ0L2Zvcm0tZGF0YVwiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgXVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL3Jlc291cmNlTGlzdGluZy5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInN3YWdnZXJWZXJzaW9uXCIsIFwiYXBpc1wiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJzd2FnZ2VyVmVyc2lvblwiOiB7IFwiZW51bVwiOiBbIFwiMS4yXCIgXSB9LFxuICAgICAgICBcImFwaXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJyZXNvdXJjZU9iamVjdC5qc29uI1wiIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJhcGlWZXJzaW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJpbmZvXCI6IHsgXCIkcmVmXCI6IFwiaW5mb09iamVjdC5qc29uI1wiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjogeyBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9yZXNvdXJjZU9iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInBhdGhcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicGF0aFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgfSxcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInRpdGxlXCI6IFwiQSBKU09OIFNjaGVtYSBmb3IgU3dhZ2dlciAyLjAgQVBJLlwiLFxuICBcImlkXCI6IFwiaHR0cDovL3N3YWdnZXIuaW8vdjIvc2NoZW1hLmpzb24jXCIsXG4gIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgXCJyZXF1aXJlZFwiOiBbXG4gICAgXCJzd2FnZ2VyXCIsXG4gICAgXCJpbmZvXCIsXG4gICAgXCJwYXRoc1wiXG4gIF0sXG4gIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgIFwiXngtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICB9XG4gIH0sXG4gIFwicHJvcGVydGllc1wiOiB7XG4gICAgXCJzd2FnZ2VyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgXCIyLjBcIlxuICAgICAgXSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgU3dhZ2dlciB2ZXJzaW9uIG9mIHRoaXMgZG9jdW1lbnQuXCJcbiAgICB9LFxuICAgIFwiaW5mb1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2luZm9cIlxuICAgIH0sXG4gICAgXCJob3N0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIixcbiAgICAgIFwicGF0dGVyblwiOiBcIl5bXnt9LyA6XFxcXFxcXFxdKyg/OjpcXFxcZCspPyRcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgZnVsbHkgcXVhbGlmaWVkIFVSSSB0byB0aGUgaG9zdCBvZiB0aGUgQVBJLlwiXG4gICAgfSxcbiAgICBcImJhc2VQYXRoXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJwYXR0ZXJuXCI6IFwiXi9cIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgYmFzZSBwYXRoIHRvIHRoZSBBUEkuIEV4YW1wbGU6ICcvYXBpJy5cIlxuICAgIH0sXG4gICAgXCJzY2hlbWVzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxuICAgIH0sXG4gICAgXCJjb25zdW1lc1wiOiB7XG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgYWNjZXB0ZWQgYnkgdGhlIEFQSS5cIixcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgfSxcbiAgICBcInByb2R1Y2VzXCI6IHtcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBwcm9kdWNlLlwiLFxuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcbiAgICB9LFxuICAgIFwicGF0aHNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXRoc1wiXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyRGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJyZXNwb25zZXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZURlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwic2VjdXJpdHlcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVwiXG4gICAgfSxcbiAgICBcInNlY3VyaXR5RGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eURlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwidGFnc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdGFnXCJcbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICB9XG4gIH0sXG4gIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgIFwiaW5mb1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJHZW5lcmFsIGluZm9ybWF0aW9uIGFib3V0IHRoZSBBUEkuXCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ2ZXJzaW9uXCIsXG4gICAgICAgIFwidGl0bGVcIlxuICAgICAgXSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIHVuaXF1ZSBhbmQgcHJlY2lzZSB0aXRsZSBvZiB0aGUgQVBJLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidmVyc2lvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgc2VtYW50aWMgdmVyc2lvbiBudW1iZXIgb2YgdGhlIEFQSS5cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsb25nZXIgZGVzY3JpcHRpb24gb2YgdGhlIEFQSS4gU2hvdWxkIGJlIGRpZmZlcmVudCBmcm9tIHRoZSB0aXRsZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGVybXNPZlNlcnZpY2VcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgdGVybXMgb2Ygc2VydmljZSBmb3IgdGhlIEFQSS5cIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbnRhY3RcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29udGFjdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibGljZW5zZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9saWNlbnNlXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJjb250YWN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkNvbnRhY3QgaW5mb3JtYXRpb24gZm9yIHRoZSBvd25lcnMgb2YgdGhlIEFQSS5cIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgaWRlbnRpZnlpbmcgbmFtZSBvZiB0aGUgY29udGFjdCBwZXJzb24vb3JnYW5pemF0aW9uLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIFVSTCBwb2ludGluZyB0byB0aGUgY29udGFjdCBpbmZvcm1hdGlvbi5cIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW1haWxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgZW1haWwgYWRkcmVzcyBvZiB0aGUgY29udGFjdCBwZXJzb24vb3JnYW5pemF0aW9uLlwiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwiZW1haWxcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImxpY2Vuc2VcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCJcbiAgICAgIF0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIGxpY2Vuc2UgdHlwZS4gSXQncyBlbmNvdXJhZ2VkIHRvIHVzZSBhbiBPU0kgY29tcGF0aWJsZSBsaWNlbnNlLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIFVSTCBwb2ludGluZyB0byB0aGUgbGljZW5zZS5cIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aHNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUmVsYXRpdmUgcGF0aHMgdG8gdGhlIGluZGl2aWR1YWwgZW5kcG9pbnRzLiBUaGV5IG11c3QgYmUgcmVsYXRpdmUgdG8gdGhlICdiYXNlUGF0aCcuXCIsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJeL1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXRoSXRlbVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgIH0sXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiT25lIG9yIG1vcmUgSlNPTiBvYmplY3RzIGRlc2NyaWJpbmcgdGhlIHNjaGVtYXMgYmVpbmcgY29uc3VtZWQgYW5kIHByb2R1Y2VkIGJ5IHRoZSBBUEkuXCJcbiAgICB9LFxuICAgIFwicGFyYW1ldGVyRGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJcIlxuICAgICAgfSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJPbmUgb3IgbW9yZSBKU09OIHJlcHJlc2VudGF0aW9ucyBmb3IgcGFyYW1ldGVyc1wiXG4gICAgfSxcbiAgICBcInJlc3BvbnNlRGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVwiXG4gICAgICB9LFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIk9uZSBvciBtb3JlIEpTT04gcmVwcmVzZW50YXRpb25zIGZvciBwYXJhbWV0ZXJzXCJcbiAgICB9LFxuICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJpbmZvcm1hdGlvbiBhYm91dCBleHRlcm5hbCBkb2N1bWVudGF0aW9uXCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ1cmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiZXhhbXBsZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeW2EtejAtOS1dKy9bYS16MC05XFxcXC0rXSskXCI6IHt9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJtaW1lVHlwZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwicGF0dGVyblwiOiBcIl5bXFxcXHNhLXowLTlcXFxcLSs7XFxcXC49XFxcXC9dKyRcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgTUlNRSB0eXBlIG9mIHRoZSBIVFRQIG1lc3NhZ2UuXCJcbiAgICB9LFxuICAgIFwib3BlcmF0aW9uXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwicmVzcG9uc2VzXCJcbiAgICAgIF0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInRhZ3NcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwic3VtbWFyeVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgc3VtbWFyeSBvZiB0aGUgb3BlcmF0aW9uLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxvbmdlciBkZXNjcmlwdGlvbiBvZiB0aGUgb3BlcmF0aW9uLCBnaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9LFxuICAgICAgICBcIm9wZXJhdGlvbklkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBmcmllbmRseSBuYW1lIG9mIHRoZSBvcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcInByb2R1Y2VzXCI6IHtcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgdGhlIEFQSSBjYW4gcHJvZHVjZS5cIixcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbnN1bWVzXCI6IHtcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgdGhlIEFQSSBjYW4gY29uc3VtZS5cIixcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyc0xpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlc3BvbnNlc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlcHJlY2F0ZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aEl0ZW1cIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHV0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlbGV0ZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcIm9wdGlvbnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJoZWFkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0Y2hcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlcnNMaXN0XCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJyZXNwb25zZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUmVzcG9uc2Ugb2JqZWN0cyBuYW1lcyBjYW4gZWl0aGVyIGJlIGFueSB2YWxpZCBIVFRQIHN0YXR1cyBjb2RlIG9yICdkZWZhdWx0Jy5cIixcbiAgICAgIFwibWluUHJvcGVydGllc1wiOiAxLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl4oWzAtOV17M30pJHxeKGRlZmF1bHQpJFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVZhbHVlXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwibm90XCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicmVzcG9uc2VWYWx1ZVwiOiB7XG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9qc29uUmVmZXJlbmNlXCJcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0sXG4gICAgXCJyZXNwb25zZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcImRlc2NyaXB0aW9uXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtYVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhhbXBsZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhhbXBsZXNcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJoZWFkZXJzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIFwiaGVhZGVyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJ2ZW5kb3JFeHRlbnNpb25cIjoge1xuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkFueSBwcm9wZXJ0eSBzdGFydGluZyB3aXRoIHgtIGlzIHZhbGlkLlwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB0cnVlLFxuICAgICAgXCJhZGRpdGlvbmFsSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJib2R5UGFyYW1ldGVyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiLFxuICAgICAgICBcImluXCIsXG4gICAgICAgIFwic2NoZW1hXCJcbiAgICAgIF0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImJvZHlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtYVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJoZWFkZXJQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJoZWFkZXJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInF1ZXJ5UGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicXVlcnlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFdpdGhNdWx0aVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImZvcm1EYXRhUGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiZm9ybURhdGFcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJmaWxlXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aFBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIHRydWVcbiAgICAgICAgICBdLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInBhdGhcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm5vbkJvZHlQYXJhbWV0ZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCIsXG4gICAgICAgIFwiaW5cIixcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyUGFyYW1ldGVyU3ViU2NoZW1hXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZm9ybURhdGFQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9xdWVyeVBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdGhQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInBhcmFtZXRlclwiOiB7XG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYm9keVBhcmFtZXRlclwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL25vbkJvZHlQYXJhbWV0ZXJcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInNjaGVtYVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGRldGVybWluaXN0aWMgdmVyc2lvbiBvZiBhIEpTT04gU2NoZW1hIG9iamVjdC5cIixcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdGl0bGVcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZXNjcmlwdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4UHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90eXBlXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgXSxcbiAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJhbGxPZlwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGlzY3JpbWluYXRvclwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZWFkT25seVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInhtbFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy94bWxcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4YW1wbGVcIjoge31cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicHJpbWl0aXZlc0l0ZW1zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2VjdXJpdHlSZXF1aXJlbWVudFwiXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInNlY3VyaXR5UmVxdWlyZW1lbnRcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICB9XG4gICAgfSxcbiAgICBcInhtbFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZXNwYWNlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInByZWZpeFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdHRyaWJ1dGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ3cmFwcGVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwidGFnXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInNlY3VyaXR5RGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9iYXNpY0F1dGhlbnRpY2F0aW9uU2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcGlLZXlTZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMkltcGxpY2l0U2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJQYXNzd29yZFNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyQXBwbGljYXRpb25TZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMkFjY2Vzc0NvZGVTZWN1cml0eVwiXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9XG4gICAgfSxcbiAgICBcImJhc2ljQXV0aGVudGljYXRpb25TZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImJhc2ljXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJhcGlLZXlTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwibmFtZVwiLFxuICAgICAgICBcImluXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFwaUtleVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImhlYWRlclwiLFxuICAgICAgICAgICAgXCJxdWVyeVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgySW1wbGljaXRTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiaW1wbGljaXRcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJQYXNzd29yZFNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwidG9rZW5VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicGFzc3dvcmRcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgyQXBwbGljYXRpb25TZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcInRva2VuVXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcIm9hdXRoMlwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZsb3dcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFwcGxpY2F0aW9uXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3Blc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidG9rZW5VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMkFjY2Vzc0NvZGVTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIixcbiAgICAgICAgXCJ0b2tlblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJhY2Nlc3NDb2RlXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3Blc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJTY29wZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIFwibWVkaWFUeXBlTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVcIlxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJzTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBwYXJhbWV0ZXJzIG5lZWRlZCB0byBzZW5kIGEgdmFsaWQgQVBJIGNhbGwuXCIsXG4gICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICBcImFkZGl0aW9uYWxJdGVtc1wiOiBmYWxzZSxcbiAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlclwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2pzb25SZWZlcmVuY2VcIlxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJzY2hlbWVzTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSB0cmFuc2ZlciBwcm90b2NvbCBvZiB0aGUgQVBJLlwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgIFwiaHR0cFwiLFxuICAgICAgICAgIFwiaHR0cHNcIixcbiAgICAgICAgICBcIndzXCIsXG4gICAgICAgICAgXCJ3c3NcIlxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImVudW1cIjogW1xuICAgICAgICBcImNzdlwiLFxuICAgICAgICBcInNzdlwiLFxuICAgICAgICBcInRzdlwiLFxuICAgICAgICBcInBpcGVzXCJcbiAgICAgIF0sXG4gICAgICBcImRlZmF1bHRcIjogXCJjc3ZcIlxuICAgIH0sXG4gICAgXCJjb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgXCJjc3ZcIixcbiAgICAgICAgXCJzc3ZcIixcbiAgICAgICAgXCJ0c3ZcIixcbiAgICAgICAgXCJwaXBlc1wiLFxuICAgICAgICBcIm11bHRpXCJcbiAgICAgIF0sXG4gICAgICBcImRlZmF1bHRcIjogXCJjc3ZcIlxuICAgIH0sXG4gICAgXCJ0aXRsZVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90aXRsZVwiXG4gICAgfSxcbiAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2Rlc2NyaXB0aW9uXCJcbiAgICB9LFxuICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZWZhdWx0XCJcbiAgICB9LFxuICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tdWx0aXBsZU9mXCJcbiAgICB9LFxuICAgIFwibWF4aW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tYXhpbXVtXCJcbiAgICB9LFxuICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICB9LFxuICAgIFwibWluaW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9taW5pbXVtXCJcbiAgICB9LFxuICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICB9LFxuICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgIH0sXG4gICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICB9LFxuICAgIFwicGF0dGVyblwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9wYXR0ZXJuXCJcbiAgICB9LFxuICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgfSxcbiAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgfSxcbiAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3VuaXF1ZUl0ZW1zXCJcbiAgICB9LFxuICAgIFwiZW51bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9lbnVtXCJcbiAgICB9LFxuICAgIFwianNvblJlZmVyZW5jZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkNvcmUgc2NoZW1hIG1ldGEtc2NoZW1hXCIsXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwic2NoZW1hQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICB9LFxuICAgICAgICBcInBvc2l0aXZlSW50ZWdlclwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcIm1pbmltdW1cIjogMFxuICAgICAgICB9LFxuICAgICAgICBcInBvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCI6IHtcbiAgICAgICAgICAgIFwiYWxsT2ZcIjogWyB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSwgeyBcImRlZmF1bHRcIjogMCB9IF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzaW1wbGVUeXBlc1wiOiB7XG4gICAgICAgICAgICBcImVudW1cIjogWyBcImFycmF5XCIsIFwiYm9vbGVhblwiLCBcImludGVnZXJcIiwgXCJudWxsXCIsIFwibnVtYmVyXCIsIFwib2JqZWN0XCIsIFwic3RyaW5nXCIgXVxuICAgICAgICB9LFxuICAgICAgICBcInN0cmluZ0FycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9XG4gICAgfSxcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImlkXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcIiRzY2hlbWFcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge30sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAwLFxuICAgICAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwicmVnZXhcIlxuICAgICAgICB9LFxuICAgICAgICBcImFkZGl0aW9uYWxJdGVtc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1heFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXG4gICAgICAgIFwibWluUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxuICAgICAgICBcInJlcXVpcmVkXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zdHJpbmdBcnJheVwiIH0sXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICAgICAgeyBcInR5cGVcIjogXCJib29sZWFuXCIgfSxcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCIgfVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zaW1wbGVUeXBlc1wiIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zaW1wbGVUeXBlc1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImFsbE9mXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH0sXG4gICAgICAgIFwiYW55T2ZcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfSxcbiAgICAgICAgXCJvbmVPZlwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9LFxuICAgICAgICBcIm5vdFwiOiB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiBbIFwibWF4aW11bVwiIF0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiBbIFwibWluaW11bVwiIF1cbiAgICB9LFxuICAgIFwiZGVmYXVsdFwiOiB7fVxufVxuIl19
