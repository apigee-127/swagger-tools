(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}(g.SwaggerTools || (g.SwaggerTools = {})).specs = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

var _ = (window._);
var async = (window.async);
var helpers = require('./helpers');
var JsonRefs = (window.JsonRefs);
var SparkMD5 = (window.SparkMD5);
var swaggerConverter = (window.SwaggerConverter.convert);
var traverse = (window.traverse);
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
  var getDefinitionMetadata = function getDefinitionMetadata (defPath, inline) {
    var defPtr = JsonRefs.pathToPointer(defPath);
    var metadata = documentMetadata.definitions[defPtr];

    if (!metadata) {
      metadata = documentMetadata.definitions[defPtr] = {
        inline: inline || false,
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
          var isInline = false;
          var parentPath;

          if (_.isUndefined(schema.$ref) || JsonRefs.isRemotePointer(schema.$ref)) {
            isInline = true;
            parentPath = modelDefPath.concat(['allOf', index.toString()]);
          } else {
            parentPath = JsonRefs.pathFromPointer(schema.$ref);
          }

          // If the parent model does not exist, do not create its metadata
          if (!_.isUndefined(traverse(documentMetadata.resolved).get(parentPath))) {
            // Create metadata for parent
            getDefinitionMetadata(parentPath, isInline);

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

      _.each(Object.keys(pModel.properties || {}), function (name) {
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
      var authPtr = ['authorizations', name];
      var aPath = path.concat([name]);

      // Add reference or record unresolved authorization
      if (addReference(documentMetadata, authPtr, aPath, results)) {
        _.reduce(scopes, function (seenScopes, scope, index) {
          var sPath = aPath.concat(index.toString(), 'scope');
          var sPtr = authPtr.concat(['scopes', scope.scope]);

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
        var authPtr = ['securityDefinitions', name];
        var authRefPath = path.concat(index.toString(), name);

        // Ensure the security definition isn't referenced more than once (Swagger 2.0+)
        validateNoExist(seenNames, name, code + '_REFERENCE', msgPrefix + ' reference', authRefPath,
                        results.warnings);

        seenNames.push(name);

        // Add reference or record unresolved authorization
        if (addReference(documentMetadata, authPtr, authRefPath, results)) {
          _.each(scopes, function (scope, index) {
            // Add reference or record unresolved authorization scope
            var sPtr = authPtr.concat(['scopes', scope]);
            addReference(documentMetadata, sPtr, authRefPath.concat(index.toString()),
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

    if (metadata.references.length === 0 && !metadata.inline) {
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
  var createParameterComboError = function createParameterComboError (path) {
    createErrorOrWarning('INVALID_PARAMETER_COMBINATION',
                         'API cannot have a a body parameter and a ' +
                           (spec.version === '1.2' ? 'form' : 'formData') + ' parameter',
                         path, results.errors);
  };
  var pathParams = [];
  var seenBodyParam = false;
  var seenFormParam = false;

  _.reduce(parameters, function (seenParameters, parameter, index) {
    var pPath = path.concat(['parameters', index.toString()]);

    // Unresolved parameter
    if (_.isUndefined(parameter)) {
      return;
    }

    // Identify duplicate parameter names
    validateNoExist(seenParameters, parameter.name, 'PARAMETER', 'Parameter', pPath.concat('name'),
                    results.errors);

    // Keep track of body and path parameters
    if (parameter.paramType === 'body' || parameter.in === 'body') {
      if (seenBodyParam === true) {
        createErrorOrWarning('DUPLICATE_API_BODY_PARAMETER', 'API has more than one body parameter', pPath,
                             results.errors);
      } else if (seenFormParam === true) {
        createParameterComboError(pPath);
      }

      seenBodyParam = true;
    } else if (parameter.paramType === 'form' || parameter.in === 'formData') {
      if (seenBodyParam === true) {
        createParameterComboError(pPath);
      }

      seenFormParam = true;
    } else if (parameter.paramType === 'path' || parameter.in === 'path') {
      if (nPath.args.indexOf(parameter.name) === -1) {
        createErrorOrWarning('UNRESOLVABLE_API_PATH_PARAMETER',
                             'API path parameter could not be resolved: ' + parameter.name, pPath.concat('name'),
                             results.errors);
      }

      pathParams.push(parameter.name);
    }

    if (spec.primitives.indexOf(parameter.type) === -1 && spec.version === '1.2') {
      addReference(documentMetadata, '#/models/' + parameter.type, pPath.concat('type'), results);
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

},{"../schemas/1.2/apiDeclaration.json":4,"../schemas/1.2/authorizationObject.json":5,"../schemas/1.2/dataType.json":6,"../schemas/1.2/dataTypeBase.json":7,"../schemas/1.2/infoObject.json":8,"../schemas/1.2/modelsObject.json":9,"../schemas/1.2/oauth2GrantType.json":10,"../schemas/1.2/operationObject.json":11,"../schemas/1.2/parameterObject.json":12,"../schemas/1.2/resourceListing.json":13,"../schemas/1.2/resourceObject.json":14,"../schemas/2.0/schema.json":15,"./helpers":2,"./validators":3}],2:[function(require,module,exports){
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

var _ = (window._);
var JsonRefs = (window.JsonRefs);
var ZSchema = (window.ZSchema);

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
    results = (results.errors.length + results.warnings.length +
    _.reduce(results.apiDeclarations, function (count, aResult) {
      if (aResult) {
        count += aResult.errors.length + aResult.warnings.length;
      }

      return count;
    }, 0) > 0) ? results : undefined;
  }

  return results;
};

var getErrorCount = module.exports.getErrorCount = function getErrorCount (results) {
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

var coerceVersion = function coerceVersion (version) {
  // Convert the version to a number (Required for helpers.getSpec)
  if (version && !_.isString(version)) {
    version = version.toString();

    // Handle rounding issues (Only required for when Swagger version ends in '.0')
    if (version.indexOf('.') === -1) {
      version += '.0';
    }
  }

  return version;
};

/**
 * Returns the proper specification based on the human readable version.
 *
 * @param {string} version - The human readable Swagger version (Ex: 1.2)
 * @param {[boolean=false]} throwError - Throw an error if the version could not be identified
 *
 * @returns the corresponding Swagger Specification object or undefined if there is none
 */
module.exports.getSpec = function getSpec (version, throwError) {
  var spec;

  version = coerceVersion(version);
  spec = specCache[version];

  if (_.isUndefined(spec)) {
    switch (version) {
    case '1.2':
      spec = require('../lib/specs').v1_2; // jshint ignore:line

      break;

    case '2.0':
      spec = require('../lib/specs').v2_0; // jshint ignore:line

      break;

    default:
      if (throwError === true) {
        throw new Error('Unsupported Swagger version: ' + version);
      }
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
  return _.isPlainObject(document) ? coerceVersion(document.swaggerVersion || document.swagger) : undefined;
};

module.exports.printValidationResults = function printValidationResults (version, apiDOrSO, apiDeclarations, results,
                                                                         printSummary) {
  var hasErrors = getErrorCount(results) > 0;
  var stream = hasErrors ? console.error : console.log;
  var pluralize = function pluralize (string, count) {
    return count === 1 ? string : string + 's';
  };
  var printErrorsOrWarnings = function printErrorsOrWarnings (header, entries, indent) {
    if (header) {
      stream(header + ':');
      stream();
    }

    _.each(entries, function (entry) {
      stream(new Array(indent + 1).join(' ') + JsonRefs.pathToPointer(entry.path) + ': ' + entry.message);

      if (entry.inner) {
        printErrorsOrWarnings (undefined, entry.inner, indent + 2);
      }
    });

    if (header) {
      stream();
    }
  };
  var errorCount = 0;
  var warningCount = 0;

  stream();

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
      stream(errorCount + ' ' + pluralize('error', errorCount) + ' and ' + warningCount + ' ' +
                    pluralize('warning', warningCount));
    } else {
      stream('Validation succeeded but with ' + warningCount + ' ' + pluralize('warning', warningCount));
    }
  }

  stream();
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

},{"../lib/specs":undefined,"../schemas/json-schema-draft-04.json":16}],3:[function(require,module,exports){
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

var _ = (window._);
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
        result = _.isFinite(Number(val)) && !_.isNaN(parseInt(val, 10));
        break;
      case 'number':
        result = _.isFinite(Number(val)) && !_.isNaN(parseFloat(val));
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

},{"./helpers":2}],4:[function(require,module,exports){
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

},{}],5:[function(require,module,exports){
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


},{}],6:[function(require,module,exports){
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
},{}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
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
},{}],9:[function(require,module,exports){
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


},{}],10:[function(require,module,exports){
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
},{}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
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
},{}],15:[function(require,module,exports){
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
        "allowEmptyValue": {
          "type": "boolean",
          "default": false,
          "description": "allows sending a parameter by name only or with an empty value."
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
        "allowEmptyValue": {
          "type": "boolean",
          "default": false,
          "description": "allows sending a parameter by name only or with an empty value."
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
        "additionalProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/additionalProperties"
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
      },
      "additionalProperties": false
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
},{}],16:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvc3BlY3MuanMiLCJsaWIvaGVscGVycy5qcyIsImxpYi92YWxpZGF0b3JzLmpzIiwic2NoZW1hcy8xLjIvYXBpRGVjbGFyYXRpb24uanNvbiIsInNjaGVtYXMvMS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24iLCJzY2hlbWFzLzEuMi9kYXRhVHlwZUJhc2UuanNvbiIsInNjaGVtYXMvMS4yL2luZm9PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL21vZGVsc09iamVjdC5qc29uIiwic2NoZW1hcy8xLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24iLCJzY2hlbWFzLzEuMi9vcGVyYXRpb25PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL3BhcmFtZXRlck9iamVjdC5qc29uIiwic2NoZW1hcy8xLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24iLCJzY2hlbWFzLzEuMi9yZXNvdXJjZU9iamVjdC5qc29uIiwic2NoZW1hcy8yLjAvc2NoZW1hLmpzb24iLCJzY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3o3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNobEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3Q5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBBcGlnZWUgQ29ycG9yYXRpb25cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAod2luZG93Ll8pO1xudmFyIGFzeW5jID0gKHdpbmRvdy5hc3luYyk7XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xudmFyIEpzb25SZWZzID0gKHdpbmRvdy5Kc29uUmVmcyk7XG52YXIgU3BhcmtNRDUgPSAod2luZG93LlNwYXJrTUQ1KTtcbnZhciBzd2FnZ2VyQ29udmVydGVyID0gKHdpbmRvdy5Td2FnZ2VyQ29udmVydGVyLmNvbnZlcnQpO1xudmFyIHRyYXZlcnNlID0gKHdpbmRvdy50cmF2ZXJzZSk7XG52YXIgdmFsaWRhdG9ycyA9IHJlcXVpcmUoJy4vdmFsaWRhdG9ycycpO1xuXG4vLyBXb3JrIGFyb3VuZCBzd2FnZ2VyLWNvbnZlcnRlciBwYWNrYWdpbmcgaXNzdWUgKEJyb3dzZXIgYnVpbGRzIG9ubHkpXG5pZiAoXy5pc1BsYWluT2JqZWN0KHN3YWdnZXJDb252ZXJ0ZXIpKSB7XG4gIHN3YWdnZXJDb252ZXJ0ZXIgPSBnbG9iYWwuU3dhZ2dlckNvbnZlcnRlci5jb252ZXJ0O1xufVxuXG52YXIgZG9jdW1lbnRDYWNoZSA9IHt9O1xudmFyIHZhbGlkT3B0aW9uTmFtZXMgPSBfLm1hcChoZWxwZXJzLnN3YWdnZXJPcGVyYXRpb25NZXRob2RzLCBmdW5jdGlvbiAobWV0aG9kKSB7XG4gIHJldHVybiBtZXRob2QudG9Mb3dlckNhc2UoKTtcbn0pO1xuXG52YXIgYWRkRXh0ZXJuYWxSZWZzVG9WYWxpZGF0b3IgPSBmdW5jdGlvbiBhZGRFeHRlcm5hbFJlZnNUb1ZhbGlkYXRvciAodmFsaWRhdG9yLCBqc29uLCBjYWxsYmFjaykge1xuICB2YXIgcmVtb3RlUmVmcyA9IF8ucmVkdWNlKEpzb25SZWZzLmZpbmRSZWZzKGpzb24pLCBmdW5jdGlvbiAoclJlZnMsIHJlZiwgcHRyKSB7XG4gICAgaWYgKEpzb25SZWZzLmlzUmVtb3RlUG9pbnRlcihwdHIpKSB7XG4gICAgICByUmVmcy5wdXNoKHJlZi5zcGxpdCgnIycpWzBdKTtcbiAgICB9XG5cbiAgICByZXR1cm4gclJlZnM7XG4gIH0sIFtdKTtcbiAgdmFyIHJlc29sdmVSZW1vdGVSZWZzID0gZnVuY3Rpb24gKHJlZiwgY2FsbGJhY2spIHtcbiAgICBKc29uUmVmcy5yZXNvbHZlUmVmcyh7JHJlZjogcmVmfSwgZnVuY3Rpb24gKGVyciwganNvbikge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH1cblxuICAgICAgLy8gUGVyZm9ybSB0aGUgc2FtZSBmb3IgdGhlIG5ld2x5IHJlc29sdmVkIGRvY3VtZW50XG4gICAgICBhZGRFeHRlcm5hbFJlZnNUb1ZhbGlkYXRvcih2YWxpZGF0b3IsIGpzb24sIGZ1bmN0aW9uIChlcnIsIHJKc29uKSB7XG4gICAgICAgIGNhbGxiYWNrKGVyciwgckpzb24pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH07XG5cbiAgaWYgKHJlbW90ZVJlZnMubGVuZ3RoID4gMCkge1xuICAgIGFzeW5jLm1hcChyZW1vdGVSZWZzLCByZXNvbHZlUmVtb3RlUmVmcywgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH1cblxuICAgICAgXy5lYWNoKHJlc3VsdHMsIGZ1bmN0aW9uIChqc29uLCBpbmRleCkge1xuICAgICAgICB2YWxpZGF0b3Iuc2V0UmVtb3RlUmVmZXJlbmNlKHJlbW90ZVJlZnNbaW5kZXhdLCBqc29uKTtcbiAgICAgIH0pO1xuXG4gICAgICBjYWxsYmFjaygpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNhbGxiYWNrKCk7XG4gIH1cbn07XG5cbnZhciBjcmVhdGVFcnJvck9yV2FybmluZyA9IGZ1bmN0aW9uIGNyZWF0ZUVycm9yT3JXYXJuaW5nIChjb2RlLCBtZXNzYWdlLCBwYXRoLCBkZXN0KSB7XG4gIGRlc3QucHVzaCh7XG4gICAgY29kZTogY29kZSxcbiAgICBtZXNzYWdlOiBtZXNzYWdlLFxuICAgIHBhdGg6IHBhdGhcbiAgfSk7XG59O1xuXG52YXIgYWRkUmVmZXJlbmNlID0gZnVuY3Rpb24gYWRkUmVmZXJlbmNlIChjYWNoZUVudHJ5LCBkZWZQYXRoT3JQdHIsIHJlZlBhdGhPclB0ciwgcmVzdWx0cywgb21pdEVycm9yKSB7XG4gIHZhciByZXN1bHQgPSB0cnVlO1xuICB2YXIgc3dhZ2dlclZlcnNpb24gPSBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGNhY2hlRW50cnkucmVzb2x2ZWQpO1xuICB2YXIgZGVmUGF0aCA9IF8uaXNBcnJheShkZWZQYXRoT3JQdHIpID8gZGVmUGF0aE9yUHRyIDogSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKGRlZlBhdGhPclB0cik7XG4gIHZhciBkZWZQdHIgPSBfLmlzQXJyYXkoZGVmUGF0aE9yUHRyKSA/IEpzb25SZWZzLnBhdGhUb1BvaW50ZXIoZGVmUGF0aE9yUHRyKSA6IGRlZlBhdGhPclB0cjtcbiAgdmFyIHJlZlBhdGggPSBfLmlzQXJyYXkocmVmUGF0aE9yUHRyKSA/IHJlZlBhdGhPclB0ciA6IEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihyZWZQYXRoT3JQdHIpO1xuICB2YXIgcmVmUHRyID0gXy5pc0FycmF5KHJlZlBhdGhPclB0cikgPyBKc29uUmVmcy5wYXRoVG9Qb2ludGVyKHJlZlBhdGhPclB0cikgOiByZWZQYXRoT3JQdHI7XG4gIHZhciBjb2RlO1xuICB2YXIgZGVmO1xuICB2YXIgZGlzcGxheUlkO1xuICB2YXIgbXNnUHJlZml4O1xuICB2YXIgdHlwZTtcblxuICAvLyBPbmx5IHBvc3NpYmxlIHdoZW4gZGVmUGF0aE9yUHRyIGlzIGEgc3RyaW5nIGFuZCBpcyBub3QgYSByZWFsIHBvaW50ZXJcbiAgaWYgKGRlZlBhdGgubGVuZ3RoID09PSAwKSB7XG4gICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0lOVkFMSURfUkVGRVJFTkNFJywgJ05vdCBhIHZhbGlkIEpTT04gUmVmZXJlbmNlJywgcmVmUGF0aCwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGRlZiA9IGNhY2hlRW50cnkuZGVmaW5pdGlvbnNbZGVmUHRyXTtcbiAgdHlwZSA9IGRlZlBhdGhbMF07XG4gIGNvZGUgPSB0eXBlID09PSAnc2VjdXJpdHlEZWZpbml0aW9ucycgP1xuICAgICAgICAgICAgICAgICAgICAnU0VDVVJJVFlfREVGSU5JVElPTicgOlxuICAgICAgICAgICAgICAgICAgICB0eXBlLnN1YnN0cmluZygwLCB0eXBlLmxlbmd0aCAtIDEpLnRvVXBwZXJDYXNlKCk7XG4gIGRpc3BsYXlJZCA9IHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/IGRlZlBhdGhbZGVmUGF0aC5sZW5ndGggLSAxXSA6IGRlZlB0cjtcbiAgbXNnUHJlZml4ID0gdHlwZSA9PT0gJ3NlY3VyaXR5RGVmaW5pdGlvbnMnID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAnU2VjdXJpdHkgZGVmaW5pdGlvbicgOlxuICAgICAgICAgICAgICAgICAgICAgICAgIGNvZGUuY2hhckF0KDApICsgY29kZS5zdWJzdHJpbmcoMSkudG9Mb3dlckNhc2UoKTtcblxuICAvLyBUaGlzIGlzIGFuIGF1dGhvcml6YXRpb24gc2NvcGUgcmVmZXJlbmNlXG4gIGlmIChbJ2F1dGhvcml6YXRpb25zJywgJ3NlY3VyaXR5RGVmaW5pdGlvbnMnXS5pbmRleE9mKGRlZlBhdGhbMF0pID4gLTEgJiYgZGVmUGF0aFsyXSA9PT0gJ3Njb3BlcycpIHtcbiAgICBjb2RlICs9ICdfU0NPUEUnO1xuICAgIG1zZ1ByZWZpeCArPSAnIHNjb3BlJztcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGRlZikpIHtcbiAgICBpZiAoIW9taXRFcnJvcikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV8nICsgY29kZSwgbXNnUHJlZml4ICsgJyBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBkaXNwbGF5SWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByZWZQYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuXG4gICAgcmVzdWx0ID0gZmFsc2U7XG4gIH0gZWxzZSB7XG4gICAgaWYgKF8uaXNVbmRlZmluZWQoZGVmLnJlZmVyZW5jZXMpKSB7XG4gICAgICBkZWYucmVmZXJlbmNlcyA9IFtdO1xuICAgIH1cblxuICAgIGRlZi5yZWZlcmVuY2VzLnB1c2gocmVmUHRyKTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG52YXIgZ2V0T3JDb21wb3NlU2NoZW1hID0gZnVuY3Rpb24gZ2V0T3JDb21wb3NlU2NoZW1hIChkb2N1bWVudE1ldGFkYXRhLCBtb2RlbElkKSB7XG4gIHZhciB0aXRsZSA9ICdDb21wb3NlZCAnICsgKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIobW9kZWxJZCkucG9wKCkgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsSWQpO1xuICB2YXIgbWV0YWRhdGEgPSBkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW21vZGVsSWRdO1xuICB2YXIgb3JpZ2luYWxUID0gdHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5vcmlnaW5hbCk7XG4gIHZhciByZXNvbHZlZFQgPSB0cmF2ZXJzZShkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkKTtcbiAgdmFyIGNvbXBvc2VkO1xuICB2YXIgb3JpZ2luYWw7XG5cbiAgaWYgKCFtZXRhZGF0YSkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICBvcmlnaW5hbCA9IF8uY2xvbmVEZWVwKG9yaWdpbmFsVC5nZXQoSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKG1vZGVsSWQpKSk7XG4gIGNvbXBvc2VkID0gXy5jbG9uZURlZXAocmVzb2x2ZWRULmdldChKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIobW9kZWxJZCkpKTtcblxuICAvLyBDb252ZXJ0IHRoZSBTd2FnZ2VyIDEuMiBkb2N1bWVudCB0byBhIHZhbGlkIEpTT04gU2NoZW1hIGZpbGVcbiAgaWYgKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgLy8gQ3JlYXRlIGluaGVyaXRhbmNlIG1vZGVsXG4gICAgaWYgKG1ldGFkYXRhLmxpbmVhZ2UubGVuZ3RoID4gMCkge1xuICAgICAgY29tcG9zZWQuYWxsT2YgPSBbXTtcblxuICAgICAgXy5lYWNoKG1ldGFkYXRhLmxpbmVhZ2UsIGZ1bmN0aW9uIChtb2RlbElkKSB7XG4gICAgICAgIGNvbXBvc2VkLmFsbE9mLnB1c2goZ2V0T3JDb21wb3NlU2NoZW1hKGRvY3VtZW50TWV0YWRhdGEsIG1vZGVsSWQpKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSB0aGUgc3ViVHlwZXMgcHJvcGVydHlcbiAgICBkZWxldGUgY29tcG9zZWQuc3ViVHlwZXM7XG5cbiAgICBfLmVhY2goY29tcG9zZWQucHJvcGVydGllcywgZnVuY3Rpb24gKHByb3BlcnR5LCBuYW1lKSB7XG4gICAgICB2YXIgb1Byb3AgPSBvcmlnaW5hbC5wcm9wZXJ0aWVzW25hbWVdO1xuXG4gICAgICAvLyBDb252ZXJ0IHRoZSBzdHJpbmcgdmFsdWVzIHRvIG51bWVyaWNhbCB2YWx1ZXNcbiAgICAgIF8uZWFjaChbJ21heGltdW0nLCAnbWluaW11bSddLCBmdW5jdGlvbiAocHJvcCkge1xuICAgICAgICBpZiAoXy5pc1N0cmluZyhwcm9wZXJ0eVtwcm9wXSkpIHtcbiAgICAgICAgICBwcm9wZXJ0eVtwcm9wXSA9IHBhcnNlRmxvYXQocHJvcGVydHlbcHJvcF0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgXy5lYWNoKEpzb25SZWZzLmZpbmRSZWZzKG9Qcm9wKSwgZnVuY3Rpb24gKHJlZiwgcHRyKSB7XG4gICAgICAgIHZhciBtb2RlbElkID0gJyMvbW9kZWxzLycgKyByZWY7XG4gICAgICAgIHZhciBkTWV0YWRhdGEgPSBkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW21vZGVsSWRdO1xuICAgICAgICB2YXIgcGF0aCA9IEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihwdHIpO1xuXG4gICAgICAgIGlmIChkTWV0YWRhdGEubGluZWFnZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgdHJhdmVyc2UocHJvcGVydHkpLnNldChwYXRoLnNsaWNlKDAsIHBhdGgubGVuZ3RoIC0gMSksIGdldE9yQ29tcG9zZVNjaGVtYShkb2N1bWVudE1ldGFkYXRhLCBtb2RlbElkKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJhdmVyc2UocHJvcGVydHkpLnNldChwYXRoLnNsaWNlKDAsIHBhdGgubGVuZ3RoIC0gMSkuY29uY2F0KCd0aXRsZScpLCAnQ29tcG9zZWQgJyArIHJlZik7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gU2NydWIgaWQgcHJvcGVydGllc1xuICBjb21wb3NlZCA9IHRyYXZlcnNlKGNvbXBvc2VkKS5tYXAoZnVuY3Rpb24gKHZhbCkge1xuICAgIGlmICh0aGlzLmtleSA9PT0gJ2lkJyAmJiBfLmlzU3RyaW5nKHZhbCkpIHtcbiAgICAgIHRoaXMucmVtb3ZlKCk7XG4gICAgfVxuICB9KTtcblxuICBjb21wb3NlZC50aXRsZSA9IHRpdGxlO1xuXG4gIHJldHVybiBjb21wb3NlZDtcbn07XG5cbnZhciBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyA9IGZ1bmN0aW9uIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nICh2YWwsIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCwgcGF0aCwgZGVzdCkge1xuICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5VU0VEXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnIGlzIGRlZmluZWQgYnV0IGlzIG5vdCB1c2VkOiAnICsgdmFsLCBwYXRoLCBkZXN0KTtcbn07XG5cbnZhciBnZXREb2N1bWVudENhY2hlID0gZnVuY3Rpb24gZ2V0RG9jdW1lbnRDYWNoZSAoYXBpRE9yU08pIHtcbiAgdmFyIGtleSA9IFNwYXJrTUQ1Lmhhc2goSlNPTi5zdHJpbmdpZnkoYXBpRE9yU08pKTtcbiAgdmFyIGNhY2hlRW50cnkgPSBkb2N1bWVudENhY2hlW2tleV0gfHwgXy5maW5kKGRvY3VtZW50Q2FjaGUsIGZ1bmN0aW9uIChjYWNoZUVudHJ5KSB7XG4gICAgcmV0dXJuIGNhY2hlRW50cnkucmVzb2x2ZWRJZCA9PT0ga2V5O1xuICB9KTtcblxuICBpZiAoIWNhY2hlRW50cnkpIHtcbiAgICBjYWNoZUVudHJ5ID0gZG9jdW1lbnRDYWNoZVtrZXldID0ge1xuICAgICAgZGVmaW5pdGlvbnM6IHt9LFxuICAgICAgb3JpZ2luYWw6IGFwaURPclNPLFxuICAgICAgcmVzb2x2ZWQ6IHVuZGVmaW5lZCxcbiAgICAgIHN3YWdnZXJWZXJzaW9uOiBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGFwaURPclNPKVxuICAgIH07XG4gIH1cblxuICByZXR1cm4gY2FjaGVFbnRyeTtcbn07XG5cbnZhciBoYW5kbGVWYWxpZGF0aW9uRXJyb3IgPSBmdW5jdGlvbiBoYW5kbGVWYWxpZGF0aW9uRXJyb3IgKHJlc3VsdHMsIGNhbGxiYWNrKSB7XG4gIHZhciBlcnIgPSBuZXcgRXJyb3IoJ1RoZSBTd2FnZ2VyIGRvY3VtZW50KHMpIGFyZSBpbnZhbGlkJyk7XG5cbiAgZXJyLmVycm9ycyA9IHJlc3VsdHMuZXJyb3JzO1xuICBlcnIuZmFpbGVkVmFsaWRhdGlvbiA9IHRydWU7XG4gIGVyci53YXJuaW5ncyA9IHJlc3VsdHMud2FybmluZ3M7XG5cbiAgaWYgKHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zKSB7XG4gICAgZXJyLmFwaURlY2xhcmF0aW9ucyA9IHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zO1xuICB9XG5cbiAgY2FsbGJhY2soZXJyKTtcbn07XG5cbnZhciBub3JtYWxpemVQYXRoID0gZnVuY3Rpb24gbm9ybWFsaXplUGF0aCAocGF0aCkge1xuICB2YXIgbWF0Y2hlcyA9IHBhdGgubWF0Y2goL1xceyguKj8pXFx9L2cpO1xuICB2YXIgYXJnTmFtZXMgPSBbXTtcbiAgdmFyIG5vcm1QYXRoID0gcGF0aDtcblxuICBpZiAobWF0Y2hlcykge1xuICAgIF8uZWFjaChtYXRjaGVzLCBmdW5jdGlvbiAobWF0Y2gsIGluZGV4KSB7XG4gICAgICBub3JtUGF0aCA9IG5vcm1QYXRoLnJlcGxhY2UobWF0Y2gsICd7JyArIGluZGV4ICsgJ30nKTtcbiAgICAgIGFyZ05hbWVzLnB1c2gobWF0Y2gucmVwbGFjZSgvW3t9XS9nLCAnJykpO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBwYXRoOiBub3JtUGF0aCxcbiAgICBhcmdzOiBhcmdOYW1lc1xuICB9O1xufTtcblxudmFyIHZhbGlkYXRlTm9FeGlzdCA9IGZ1bmN0aW9uIHZhbGlkYXRlTm9FeGlzdCAoZGF0YSwgdmFsLCBjb2RlU3VmZml4LCBtc2dQcmVmaXgsIHBhdGgsIGRlc3QpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGRhdGEpICYmIGRhdGEuaW5kZXhPZih2YWwpID4gLTEpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnIGFscmVhZHkgZGVmaW5lZDogJyArIHZhbCwgcGF0aCwgZGVzdCk7XG4gIH1cbn07XG5cbnZhciB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzID0gZnVuY3Rpb24gdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyAoZG9jdW1lbnRNZXRhZGF0YSwgc2NoZW1hLCBwYXRoLCByZXN1bHRzLCBza2lwKSB7XG4gIHRyeSB7XG4gICAgdmFsaWRhdG9ycy52YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24sIHNjaGVtYSwgcGF0aCwgdW5kZWZpbmVkKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgaWYgKCFza2lwKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyhlcnIuY29kZSwgZXJyLm1lc3NhZ2UsIGVyci5wYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuICB9XG59O1xuXG52YXIgcHJvY2Vzc0RvY3VtZW50ID0gZnVuY3Rpb24gcHJvY2Vzc0RvY3VtZW50IChkb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKSB7XG4gIHZhciBzd2FnZ2VyVmVyc2lvbiA9IGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb247XG4gIHZhciBnZXREZWZpbml0aW9uTWV0YWRhdGEgPSBmdW5jdGlvbiBnZXREZWZpbml0aW9uTWV0YWRhdGEgKGRlZlBhdGgsIGlubGluZSkge1xuICAgIHZhciBkZWZQdHIgPSBKc29uUmVmcy5wYXRoVG9Qb2ludGVyKGRlZlBhdGgpO1xuICAgIHZhciBtZXRhZGF0YSA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbZGVmUHRyXTtcblxuICAgIGlmICghbWV0YWRhdGEpIHtcbiAgICAgIG1ldGFkYXRhID0gZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1tkZWZQdHJdID0ge1xuICAgICAgICBpbmxpbmU6IGlubGluZSB8fCBmYWxzZSxcbiAgICAgICAgcmVmZXJlbmNlczogW11cbiAgICAgIH07XG5cbiAgICAgIC8vIEZvciBtb2RlbCBkZWZpbml0aW9ucywgYWRkIHRoZSBpbmhlcml0YW5jZSBwcm9wZXJ0aWVzXG4gICAgICBpZiAoWydkZWZpbml0aW9ucycsICdtb2RlbHMnXS5pbmRleE9mKEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihkZWZQdHIpWzBdKSA+IC0xKSB7XG4gICAgICAgIG1ldGFkYXRhLmN5Y2xpY2FsID0gZmFsc2U7XG4gICAgICAgIG1ldGFkYXRhLmxpbmVhZ2UgPSB1bmRlZmluZWQ7XG4gICAgICAgIG1ldGFkYXRhLnBhcmVudHMgPSBbXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbWV0YWRhdGE7XG4gIH07XG4gIHZhciBnZXREaXNwbGF5SWQgPSBmdW5jdGlvbiBnZXREaXNwbGF5SWQgKGlkKSB7XG4gICAgcmV0dXJuIHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/IEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihpZCkucG9wKCkgOiBpZDtcbiAgfTtcbiAgdmFyIHdhbGsgPSBmdW5jdGlvbiB3YWxrIChyb290LCBpZCwgbGluZWFnZSkge1xuICAgIHZhciBkZWZpbml0aW9uID0gZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1tpZCB8fCByb290XTtcblxuICAgIGlmIChkZWZpbml0aW9uKSB7XG4gICAgICBfLmVhY2goZGVmaW5pdGlvbi5wYXJlbnRzLCBmdW5jdGlvbiAocGFyZW50KSB7XG4gICAgICAgIGxpbmVhZ2UucHVzaChwYXJlbnQpO1xuXG4gICAgICAgIGlmIChyb290ICE9PSBwYXJlbnQpIHtcbiAgICAgICAgICB3YWxrKHJvb3QsIHBhcmVudCwgbGluZWFnZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbiAgdmFyIGF1dGhEZWZzUHJvcCA9IHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdhdXRob3JpemF0aW9ucycgOiAnc2VjdXJpdHlEZWZpbml0aW9ucyc7XG4gIHZhciBtb2RlbERlZnNQcm9wID0gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gJ21vZGVscycgOiAnZGVmaW5pdGlvbnMnO1xuXG4gIC8vIFByb2Nlc3MgYXV0aG9yaXphdGlvbiBkZWZpbml0aW9uc1xuICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZFthdXRoRGVmc1Byb3BdLCBmdW5jdGlvbiAoYXV0aG9yaXphdGlvbiwgbmFtZSkge1xuICAgIHZhciBzZWN1cml0eURlZlBhdGggPSBbYXV0aERlZnNQcm9wLCBuYW1lXTtcblxuICAgIC8vIFN3YWdnZXIgMS4yIG9ubHkgaGFzIGF1dGhvcml6YXRpb24gZGVmaW5pdGlvbnMgaW4gdGhlIFJlc291cmNlIExpc3RpbmdcbiAgICBpZiAoc3dhZ2dlclZlcnNpb24gPT09ICcxLjInICYmICFhdXRob3JpemF0aW9uLnR5cGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGhlIGF1dGhvcml6YXRpb24gZGVmaW5pdGlvbiBtZXRhZGF0YVxuICAgIGdldERlZmluaXRpb25NZXRhZGF0YShzZWN1cml0eURlZlBhdGgpO1xuXG4gICAgXy5yZWR1Y2UoYXV0aG9yaXphdGlvbi5zY29wZXMsIGZ1bmN0aW9uIChzZWVuU2NvcGVzLCBzY29wZSwgaW5kZXhPck5hbWUpIHtcbiAgICAgIHZhciBzY29wZU5hbWUgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBzY29wZS5zY29wZSA6IGluZGV4T3JOYW1lO1xuICAgICAgdmFyIHNjb3BlRGVmUGF0aCA9IHNlY3VyaXR5RGVmUGF0aC5jb25jYXQoWydzY29wZXMnLCBpbmRleE9yTmFtZS50b1N0cmluZygpXSk7XG4gICAgICB2YXIgc2NvcGVNZXRhZGF0YSA9IGdldERlZmluaXRpb25NZXRhZGF0YShzZWN1cml0eURlZlBhdGguY29uY2F0KFsnc2NvcGVzJywgc2NvcGVOYW1lXSkpO1xuXG4gICAgICBzY29wZU1ldGFkYXRhLnNjb3BlUGF0aCA9IHNjb3BlRGVmUGF0aDtcblxuICAgICAgLy8gSWRlbnRpZnkgZHVwbGljYXRlIGF1dGhvcml6YXRpb24gc2NvcGUgZGVmaW5lZCBpbiB0aGUgUmVzb3VyY2UgTGlzdGluZ1xuICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5TY29wZXMsIHNjb3BlTmFtZSwgJ0FVVEhPUklaQVRJT05fU0NPUEVfREVGSU5JVElPTicsICdBdXRob3JpemF0aW9uIHNjb3BlIGRlZmluaXRpb24nLFxuICAgICAgICAgICAgICAgICAgICAgIHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/IHNjb3BlRGVmUGF0aC5jb25jYXQoJ3Njb3BlJykgOiBzY29wZURlZlBhdGgsIHJlc3VsdHMud2FybmluZ3MpO1xuXG4gICAgICBzZWVuU2NvcGVzLnB1c2goc2NvcGVOYW1lKTtcblxuICAgICAgcmV0dXJuIHNlZW5TY29wZXM7XG4gICAgfSwgW10pO1xuICB9KTtcblxuICAvLyBQcm9jZXMgbW9kZWwgZGVmaW5pdGlvbnNcbiAgXy5lYWNoKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWRbbW9kZWxEZWZzUHJvcF0sIGZ1bmN0aW9uIChtb2RlbCwgbW9kZWxJZCkge1xuICAgIHZhciBtb2RlbERlZlBhdGggPSBbbW9kZWxEZWZzUHJvcCwgbW9kZWxJZF07XG4gICAgdmFyIG1vZGVsTWV0YWRhdGEgPSBnZXREZWZpbml0aW9uTWV0YWRhdGEobW9kZWxEZWZQYXRoKTtcblxuICAgIC8vIElkZW50aWZ5IG1vZGVsIGlkIG1pc21hdGNoIChJZCBpbiBtb2RlbHMgb2JqZWN0IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgbW9kZWwncyBpZCBpbiB0aGUgbW9kZWxzIG9iamVjdClcbiAgICBpZiAoc3dhZ2dlclZlcnNpb24gPT09ICcxLjInICYmIG1vZGVsSWQgIT09IG1vZGVsLmlkKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTU9ERUxfSURfTUlTTUFUQ0gnLCAnTW9kZWwgaWQgZG9lcyBub3QgbWF0Y2ggaWQgaW4gbW9kZWxzIG9iamVjdDogJyArIG1vZGVsLmlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxEZWZQYXRoLmNvbmNhdCgnaWQnKSwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cblxuICAgIC8vIERvIG5vdCByZXByb2Nlc3MgcGFyZW50cy9yZWZlcmVuY2VzIGlmIGFscmVhZHkgcHJvY2Vzc2VkXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxNZXRhZGF0YS5saW5lYWdlKSkge1xuICAgICAgLy8gSGFuZGxlIGluaGVyaXRhbmNlIHJlZmVyZW5jZXNcbiAgICAgIHN3aXRjaCAoc3dhZ2dlclZlcnNpb24pIHtcbiAgICAgIGNhc2UgJzEuMic6XG4gICAgICAgIF8uZWFjaChtb2RlbC5zdWJUeXBlcywgZnVuY3Rpb24gKHN1YlR5cGUsIGluZGV4KSB7XG4gICAgICAgICAgdmFyIHN1YlBhdGggPSBbJ21vZGVscycsIHN1YlR5cGVdO1xuICAgICAgICAgIHZhciBzdWJQdHIgPSBKc29uUmVmcy5wYXRoVG9Qb2ludGVyKHN1YlBhdGgpO1xuICAgICAgICAgIHZhciBzdWJNZXRhZGF0YSA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbc3ViUHRyXTtcbiAgICAgICAgICB2YXIgcmVmUGF0aCA9IG1vZGVsRGVmUGF0aC5jb25jYXQoWydzdWJUeXBlcycsIGluZGV4LnRvU3RyaW5nKCldKTtcblxuICAgICAgICAgIC8vIElmIHRoZSBtZXRhZGF0YSBkb2VzIG5vdCB5ZXQgZXhpc3QsIGNyZWF0ZSBpdFxuICAgICAgICAgIGlmICghc3ViTWV0YWRhdGEgJiYgZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZFttb2RlbERlZnNQcm9wXVtzdWJUeXBlXSkge1xuICAgICAgICAgICAgc3ViTWV0YWRhdGEgPSBnZXREZWZpbml0aW9uTWV0YWRhdGEoc3ViUGF0aCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gSWYgdGhlIHJlZmVyZW5jZSBpcyB2YWxpZCwgYWRkIHRoZSBwYXJlbnRcbiAgICAgICAgICBpZiAoYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsIHN1YlBhdGgsIHJlZlBhdGgsIHJlc3VsdHMpKSB7XG4gICAgICAgICAgICBzdWJNZXRhZGF0YS5wYXJlbnRzLnB1c2goSnNvblJlZnMucGF0aFRvUG9pbnRlcihtb2RlbERlZlBhdGgpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5vcmlnaW5hbFttb2RlbERlZnNQcm9wXVttb2RlbElkXS5hbGxPZiwgZnVuY3Rpb24gKHNjaGVtYSwgaW5kZXgpIHtcbiAgICAgICAgICB2YXIgaXNJbmxpbmUgPSBmYWxzZTtcbiAgICAgICAgICB2YXIgcGFyZW50UGF0aDtcblxuICAgICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKHNjaGVtYS4kcmVmKSB8fCBKc29uUmVmcy5pc1JlbW90ZVBvaW50ZXIoc2NoZW1hLiRyZWYpKSB7XG4gICAgICAgICAgICBpc0lubGluZSA9IHRydWU7XG4gICAgICAgICAgICBwYXJlbnRQYXRoID0gbW9kZWxEZWZQYXRoLmNvbmNhdChbJ2FsbE9mJywgaW5kZXgudG9TdHJpbmcoKV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXJlbnRQYXRoID0gSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKHNjaGVtYS4kcmVmKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBJZiB0aGUgcGFyZW50IG1vZGVsIGRvZXMgbm90IGV4aXN0LCBkbyBub3QgY3JlYXRlIGl0cyBtZXRhZGF0YVxuICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZCh0cmF2ZXJzZShkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkKS5nZXQocGFyZW50UGF0aCkpKSB7XG4gICAgICAgICAgICAvLyBDcmVhdGUgbWV0YWRhdGEgZm9yIHBhcmVudFxuICAgICAgICAgICAgZ2V0RGVmaW5pdGlvbk1ldGFkYXRhKHBhcmVudFBhdGgsIGlzSW5saW5lKTtcblxuICAgICAgICAgICAgbW9kZWxNZXRhZGF0YS5wYXJlbnRzLnB1c2goSnNvblJlZnMucGF0aFRvUG9pbnRlcihwYXJlbnRQYXRoKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIHN3aXRjaCAoc3dhZ2dlclZlcnNpb24pIHtcbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBQcm9jZXNzIHBhcmFtZXRlciBkZWZpbml0aW9uc1xuICAgIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkLnBhcmFtZXRlcnMsIGZ1bmN0aW9uIChwYXJhbWV0ZXIsIG5hbWUpIHtcbiAgICAgIHZhciBwYXRoID0gWydwYXJhbWV0ZXJzJywgbmFtZV07XG5cbiAgICAgIGdldERlZmluaXRpb25NZXRhZGF0YShwYXRoKTtcblxuICAgICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLCBwYXJhbWV0ZXIsIHBhdGgsIHJlc3VsdHMpO1xuICAgIH0pO1xuXG4gICAgLy8gUHJvY2VzcyByZXNwb25zZSBkZWZpbml0aW9uc1xuICAgIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkLnJlc3BvbnNlcywgZnVuY3Rpb24gKHJlc3BvbnNlLCBuYW1lKSB7XG4gICAgICB2YXIgcGF0aCA9IFsncmVzcG9uc2VzJywgbmFtZV07XG5cbiAgICAgIGdldERlZmluaXRpb25NZXRhZGF0YShwYXRoKTtcblxuICAgICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLCByZXNwb25zZSwgcGF0aCwgcmVzdWx0cyk7XG4gICAgfSk7XG5cbiAgICBicmVhaztcbiAgfVxuXG4gIC8vIFZhbGlkYXRlIGRlZmluaXRpb24vbW9kZWxzIChJbmhlcml0YW5jZSwgcHJvcGVydHkgZGVmaW5pdGlvbnMsIC4uLilcbiAgXy5lYWNoKGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnMsIGZ1bmN0aW9uIChtZXRhZGF0YSwgaWQpIHtcbiAgICB2YXIgZGVmUGF0aCA9IEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihpZCk7XG4gICAgdmFyIGRlZmluaXRpb24gPSB0cmF2ZXJzZShkb2N1bWVudE1ldGFkYXRhLm9yaWdpbmFsKS5nZXQoZGVmUGF0aCk7XG4gICAgdmFyIGRlZlByb3AgPSBkZWZQYXRoWzBdO1xuICAgIHZhciBjb2RlID0gZGVmUHJvcC5zdWJzdHJpbmcoMCwgZGVmUHJvcC5sZW5ndGggLSAxKS50b1VwcGVyQ2FzZSgpO1xuICAgIHZhciBtc2dQcmVmaXggPSBjb2RlLmNoYXJBdCgwKSArIGNvZGUuc3Vic3RyaW5nKDEpLnRvTG93ZXJDYXNlKCk7XG4gICAgdmFyIGRQcm9wZXJ0aWVzO1xuICAgIHZhciBpUHJvcGVydGllcztcbiAgICB2YXIgbGluZWFnZTtcblxuICAgIC8vIFRoZSBvbmx5IGNoZWNrcyB3ZSBwZXJmb3JtIGJlbG93IGFyZSBpbmhlcml0YW5jZSBjaGVja3Mgc28gc2tpcCBhbGwgbm9uLW1vZGVsIGRlZmluaXRpb25zXG4gICAgaWYgKFsnZGVmaW5pdGlvbnMnLCAnbW9kZWxzJ10uaW5kZXhPZihkZWZQcm9wKSA9PT0gLTEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBkUHJvcGVydGllcyA9IFtdO1xuICAgIGlQcm9wZXJ0aWVzID0gW107XG4gICAgbGluZWFnZSA9IG1ldGFkYXRhLmxpbmVhZ2U7XG5cbiAgICAvLyBEbyBub3QgcmVwcm9jZXNzIGxpbmVhZ2UgaWYgYWxyZWFkeSBwcm9jZXNzZWRcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChsaW5lYWdlKSkge1xuICAgICAgbGluZWFnZSA9IFtdO1xuXG4gICAgICB3YWxrKGlkLCB1bmRlZmluZWQsIGxpbmVhZ2UpO1xuXG4gICAgICAvLyBSb290ID4gbmV4dCA+IC4uLlxuICAgICAgbGluZWFnZS5yZXZlcnNlKCk7XG5cbiAgICAgIG1ldGFkYXRhLmxpbmVhZ2UgPSBfLmNsb25lRGVlcChsaW5lYWdlKTtcblxuICAgICAgbWV0YWRhdGEuY3ljbGljYWwgPSBsaW5lYWdlLmxlbmd0aCA+IDEgJiYgbGluZWFnZVswXSA9PT0gaWQ7XG4gICAgfVxuXG4gICAgLy8gU3dhZ2dlciAxLjIgZG9lcyBub3QgYWxsb3cgbXVsdGlwbGUgaW5oZXJpdGFuY2Ugd2hpbGUgU3dhZ2dlciAyLjArIGRvZXNcbiAgICBpZiAobWV0YWRhdGEucGFyZW50cy5sZW5ndGggPiAxICYmIHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01VTFRJUExFXycgKyBjb2RlICsgJ19JTkhFUklUQU5DRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnQ2hpbGQgJyArIGNvZGUudG9Mb3dlckNhc2UoKSArICcgaXMgc3ViIHR5cGUgb2YgbXVsdGlwbGUgbW9kZWxzOiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIF8ubWFwKG1ldGFkYXRhLnBhcmVudHMsIGZ1bmN0aW9uIChwYXJlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldERpc3BsYXlJZChwYXJlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuam9pbignICYmICcpLCBkZWZQYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuXG4gICAgaWYgKG1ldGFkYXRhLmN5Y2xpY2FsKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQ1lDTElDQUxfJyArIGNvZGUgKyAnX0lOSEVSSVRBTkNFJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZ1ByZWZpeCArICcgaGFzIGEgY2lyY3VsYXIgaW5oZXJpdGFuY2U6ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLm1hcChsaW5lYWdlLCBmdW5jdGlvbiAoZGVwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldERpc3BsYXlJZChkZXApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KS5qb2luKCcgLT4gJykgKyAnIC0+ICcgKyBnZXREaXNwbGF5SWQoaWQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZlBhdGguY29uY2F0KHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdzdWJUeXBlcycgOiAnYWxsT2YnKSwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSBzZWxmIHJlZmVyZW5jZSBmcm9tIHRoZSBlbmQgb2YgdGhlIGxpbmVhZ2UgKEZyb250IHRvbyBpZiBjeWNsaWNhbClcbiAgICBfLmVhY2gobGluZWFnZS5zbGljZShtZXRhZGF0YS5jeWNsaWNhbCA/IDEgOiAwKSwgZnVuY3Rpb24gKGlkKSB7XG4gICAgICB2YXIgcE1vZGVsID0gdHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCkuZ2V0KEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihpZCkpO1xuXG4gICAgICBfLmVhY2goT2JqZWN0LmtleXMocE1vZGVsLnByb3BlcnRpZXMgfHwge30pLCBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICBpZiAoaVByb3BlcnRpZXMuaW5kZXhPZihuYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgICBpUHJvcGVydGllcy5wdXNoKG5hbWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIFZhbGlkYXRlIHNpbXBsZSBkZWZpbml0aW9uc1xuICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgZGVmaW5pdGlvbiwgZGVmUGF0aCwgcmVzdWx0cyk7XG5cbiAgICAvLyBJZGVudGlmeSByZWRlY2xhcmVkIHByb3BlcnRpZXNcbiAgICBfLmVhY2goZGVmaW5pdGlvbi5wcm9wZXJ0aWVzLCBmdW5jdGlvbiAocHJvcGVydHksIG5hbWUpIHtcbiAgICAgIHZhciBwUGF0aCA9IGRlZlBhdGguY29uY2F0KFsncHJvcGVydGllcycsIG5hbWVdKTtcblxuICAgICAgLy8gRG8gbm90IHByb2Nlc3MgdW5yZXNvbHZlZCBwcm9wZXJ0aWVzXG4gICAgICBpZiAoIV8uaXNVbmRlZmluZWQocHJvcGVydHkpKSB7XG4gICAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcHJvcGVydHksIHBQYXRoLCByZXN1bHRzKTtcblxuICAgICAgICBpZiAoaVByb3BlcnRpZXMuaW5kZXhPZihuYW1lKSA+IC0xKSB7XG4gICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0NISUxEXycgKyBjb2RlICsgJ19SRURFQ0xBUkVTX1BST1BFUlRZJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQ2hpbGQgJyArIGNvZGUudG9Mb3dlckNhc2UoKSArICcgZGVjbGFyZXMgcHJvcGVydHkgYWxyZWFkeSBkZWNsYXJlZCBieSBhbmNlc3RvcjogJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aCwgcmVzdWx0cy5lcnJvcnMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRQcm9wZXJ0aWVzLnB1c2gobmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIElkZW50aWZ5IG1pc3NpbmcgcmVxdWlyZWQgcHJvcGVydGllc1xuICAgIF8uZWFjaChkZWZpbml0aW9uLnJlcXVpcmVkIHx8IFtdLCBmdW5jdGlvbiAobmFtZSwgaW5kZXgpIHtcbiAgICAgIHZhciB0eXBlID0gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gJ01vZGVsJyA6ICdEZWZpbml0aW9uJztcblxuICAgICAgaWYgKGlQcm9wZXJ0aWVzLmluZGV4T2YobmFtZSkgPT09IC0xICYmIGRQcm9wZXJ0aWVzLmluZGV4T2YobmFtZSkgPT09IC0xKSB7XG4gICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNSVNTSU5HX1JFUVVJUkVEXycgKyB0eXBlLnRvVXBwZXJDYXNlKCkgKyAnX1BST1BFUlRZJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSArICcgcmVxdWlyZXMgcHJvcGVydHkgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmUGF0aC5jb25jYXQoWydyZXF1aXJlZCcsIGluZGV4LnRvU3RyaW5nKCldKSwgcmVzdWx0cy5lcnJvcnMpO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcblxuICAvLyBQcm9jZXNzIHJlZmVyZW5jZXMgKE9ubHkgcHJvY2Vzc2VzIEpTT04gUmVmZXJlbmNlcywgYWxsIG90aGVyIHJlZmVyZW5jZXMgYXJlIGhhbmRsZWQgd2hlcmUgZW5jb3VudGVyZWQpXG4gIF8uZWFjaChKc29uUmVmcy5maW5kUmVmcyhkb2N1bWVudE1ldGFkYXRhLm9yaWdpbmFsKSwgZnVuY3Rpb24gKHJlZiwgcmVmUHRyKSB7XG5cbiAgICBpZiAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAgIHJlZiA9ICcjL21vZGVscy8nICsgcmVmO1xuICAgIH1cblxuICAgIC8vIE9ubHkgcHJvY2VzcyBsb2NhbCByZWZlcmVuY2VzXG4gICAgaWYgKCFKc29uUmVmcy5pc1JlbW90ZVBvaW50ZXIocmVmKSkge1xuICAgICAgYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsIHJlZiwgcmVmUHRyLCByZXN1bHRzKTtcbiAgICB9XG4gIH0pO1xufTtcblxudmFyIHZhbGlkYXRlRXhpc3QgPSBmdW5jdGlvbiB2YWxpZGF0ZUV4aXN0IChkYXRhLCB2YWwsIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCwgcGF0aCwgZGVzdCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoZGF0YSkgJiYgZGF0YS5pbmRleE9mKHZhbCkgPT09IC0xKSB7XG4gICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyB2YWwsIHBhdGgsIGRlc3QpO1xuICB9XG59O1xuXG52YXIgcHJvY2Vzc0F1dGhSZWZzID0gZnVuY3Rpb24gcHJvY2Vzc0F1dGhSZWZzIChkb2N1bWVudE1ldGFkYXRhLCBhdXRoUmVmcywgcGF0aCwgcmVzdWx0cykge1xuICB2YXIgY29kZSA9IGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gJ0FVVEhPUklaQVRJT04nIDogJ1NFQ1VSSVRZX0RFRklOSVRJT04nO1xuICB2YXIgbXNnUHJlZml4ID0gY29kZSA9PT0gJ0FVVEhPUklaQVRJT04nID8gJ0F1dGhvcml6YXRpb24nIDogJ1NlY3VyaXR5IGRlZmluaXRpb24nO1xuXG4gIGlmIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgIF8ucmVkdWNlKGF1dGhSZWZzLCBmdW5jdGlvbiAoc2Vlbk5hbWVzLCBzY29wZXMsIG5hbWUpIHtcbiAgICAgIHZhciBhdXRoUHRyID0gWydhdXRob3JpemF0aW9ucycsIG5hbWVdO1xuICAgICAgdmFyIGFQYXRoID0gcGF0aC5jb25jYXQoW25hbWVdKTtcblxuICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uXG4gICAgICBpZiAoYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsIGF1dGhQdHIsIGFQYXRoLCByZXN1bHRzKSkge1xuICAgICAgICBfLnJlZHVjZShzY29wZXMsIGZ1bmN0aW9uIChzZWVuU2NvcGVzLCBzY29wZSwgaW5kZXgpIHtcbiAgICAgICAgICB2YXIgc1BhdGggPSBhUGF0aC5jb25jYXQoaW5kZXgudG9TdHJpbmcoKSwgJ3Njb3BlJyk7XG4gICAgICAgICAgdmFyIHNQdHIgPSBhdXRoUHRyLmNvbmNhdChbJ3Njb3BlcycsIHNjb3BlLnNjb3BlXSk7XG5cbiAgICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblNjb3Blcywgc2NvcGUuc2NvcGUsIGNvZGUgKyAnX1NDT1BFX1JFRkVSRU5DRScsIG1zZ1ByZWZpeCArICcgc2NvcGUgcmVmZXJlbmNlJywgc1BhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMud2FybmluZ3MpO1xuXG4gICAgICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uIHNjb3BlXG4gICAgICAgICAgYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsIHNQdHIsIHNQYXRoLCByZXN1bHRzKTtcblxuICAgICAgICAgIHJldHVybiBzZWVuU2NvcGVzLmNvbmNhdChzY29wZS5zY29wZSk7XG4gICAgICAgIH0sIFtdKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHNlZW5OYW1lcy5jb25jYXQobmFtZSk7XG4gICAgfSwgW10pO1xuICB9IGVsc2Uge1xuICAgIF8ucmVkdWNlKGF1dGhSZWZzLCBmdW5jdGlvbiAoc2Vlbk5hbWVzLCBzY29wZXMsIGluZGV4KSB7XG4gICAgICBfLmVhY2goc2NvcGVzLCBmdW5jdGlvbiAoc2NvcGVzLCBuYW1lKSB7XG4gICAgICAgIHZhciBhdXRoUHRyID0gWydzZWN1cml0eURlZmluaXRpb25zJywgbmFtZV07XG4gICAgICAgIHZhciBhdXRoUmVmUGF0aCA9IHBhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCksIG5hbWUpO1xuXG4gICAgICAgIC8vIEVuc3VyZSB0aGUgc2VjdXJpdHkgZGVmaW5pdGlvbiBpc24ndCByZWZlcmVuY2VkIG1vcmUgdGhhbiBvbmNlIChTd2FnZ2VyIDIuMCspXG4gICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuTmFtZXMsIG5hbWUsIGNvZGUgKyAnX1JFRkVSRU5DRScsIG1zZ1ByZWZpeCArICcgcmVmZXJlbmNlJywgYXV0aFJlZlBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLndhcm5pbmdzKTtcblxuICAgICAgICBzZWVuTmFtZXMucHVzaChuYW1lKTtcblxuICAgICAgICAvLyBBZGQgcmVmZXJlbmNlIG9yIHJlY29yZCB1bnJlc29sdmVkIGF1dGhvcml6YXRpb25cbiAgICAgICAgaWYgKGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBhdXRoUHRyLCBhdXRoUmVmUGF0aCwgcmVzdWx0cykpIHtcbiAgICAgICAgICBfLmVhY2goc2NvcGVzLCBmdW5jdGlvbiAoc2NvcGUsIGluZGV4KSB7XG4gICAgICAgICAgICAvLyBBZGQgcmVmZXJlbmNlIG9yIHJlY29yZCB1bnJlc29sdmVkIGF1dGhvcml6YXRpb24gc2NvcGVcbiAgICAgICAgICAgIHZhciBzUHRyID0gYXV0aFB0ci5jb25jYXQoWydzY29wZXMnLCBzY29wZV0pO1xuICAgICAgICAgICAgYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsIHNQdHIsIGF1dGhSZWZQYXRoLmNvbmNhdChpbmRleC50b1N0cmluZygpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBzZWVuTmFtZXM7XG4gICAgfSwgW10pO1xuICB9XG59O1xuXG52YXIgcmVzb2x2ZVJlZnMgPSBmdW5jdGlvbiAoYXBpRE9yU08sIGNhbGxiYWNrKSB7XG4gIHZhciBjYWNoZUVudHJ5ID0gZ2V0RG9jdW1lbnRDYWNoZShhcGlET3JTTyk7XG4gIHZhciBzd2FnZ2VyVmVyc2lvbiA9IGhlbHBlcnMuZ2V0U3dhZ2dlclZlcnNpb24oYXBpRE9yU08pO1xuICB2YXIgZG9jdW1lbnRUO1xuXG4gIGlmICghY2FjaGVFbnRyeS5yZXNvbHZlZCkge1xuICAgIC8vIEZvciBTd2FnZ2VyIDEuMiwgd2UgaGF2ZSB0byBjcmVhdGUgcmVhbCBKU09OIFJlZmVyZW5jZXNcbiAgICBpZiAoc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICBhcGlET3JTTyA9IF8uY2xvbmVEZWVwKGFwaURPclNPKTtcbiAgICAgIGRvY3VtZW50VCA9IHRyYXZlcnNlKGFwaURPclNPKTtcblxuICAgICAgXy5lYWNoKEpzb25SZWZzLmZpbmRSZWZzKGFwaURPclNPKSwgZnVuY3Rpb24gKHJlZiwgcHRyKSB7XG4gICAgICAgIC8vIEFsbCBTd2FnZ2VyIDEuMiByZWZlcmVuY2VzIGFyZSBBTFdBWVMgdG8gbW9kZWxzXG4gICAgICAgIGRvY3VtZW50VC5zZXQoSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKHB0ciksICcjL21vZGVscy8nICsgcmVmKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFJlc29sdmUgcmVmZXJlbmNlc1xuICAgIEpzb25SZWZzLnJlc29sdmVSZWZzKGFwaURPclNPLCBmdW5jdGlvbiAoZXJyLCBqc29uKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgfVxuXG4gICAgICBjYWNoZUVudHJ5LnJlc29sdmVkID0ganNvbjtcbiAgICAgIGNhY2hlRW50cnkucmVzb2x2ZWRJZCA9IFNwYXJrTUQ1Lmhhc2goSlNPTi5zdHJpbmdpZnkoanNvbikpO1xuXG4gICAgICBjYWxsYmFjaygpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGNhbGxiYWNrKCk7XG4gIH1cbn07XG5cbnZhciB2YWxpZGF0ZUFnYWluc3RTY2hlbWEgPSBmdW5jdGlvbiB2YWxpZGF0ZUFnYWluc3RTY2hlbWEgKHNwZWMsIHNjaGVtYU9yTmFtZSwgZGF0YSwgY2FsbGJhY2spIHtcbiAgdmFyIHZhbGlkYXRvciA9IF8uaXNTdHJpbmcoc2NoZW1hT3JOYW1lKSA/IHNwZWMudmFsaWRhdG9yc1tzY2hlbWFPck5hbWVdIDogaGVscGVycy5jcmVhdGVKc29uVmFsaWRhdG9yKCk7XG4gIHZhciBkb1ZhbGlkYXRpb24gPSBmdW5jdGlvbiBkb1ZhbGlkYXRpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlQWdhaW5zdFNjaGVtYShzY2hlbWFPck5hbWUsIGRhdGEsIHZhbGlkYXRvcik7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoZXJyLmZhaWxlZFZhbGlkYXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKHVuZGVmaW5lZCwgZXJyLnJlc3VsdHMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmVzb2x2ZVJlZnMoZGF0YSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgfSk7XG4gIH07XG5cbiAgYWRkRXh0ZXJuYWxSZWZzVG9WYWxpZGF0b3IodmFsaWRhdG9yLCBkYXRhLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgfVxuXG4gICAgZG9WYWxpZGF0aW9uKCk7XG4gIH0pO1xufTtcblxudmFyIHZhbGlkYXRlRGVmaW5pdGlvbnMgPSBmdW5jdGlvbiB2YWxpZGF0ZURlZmluaXRpb25zIChkb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKSB7XG4gIC8vIFZhbGlkYXRlIHVudXNlZCBkZWZpbml0aW9uc1xuICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9ucywgZnVuY3Rpb24gKG1ldGFkYXRhLCBpZCkge1xuICAgIHZhciBkZWZQYXRoID0gSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKGlkKTtcbiAgICB2YXIgZGVmVHlwZSA9IGRlZlBhdGhbMF0uc3Vic3RyaW5nKDAsIGRlZlBhdGhbMF0ubGVuZ3RoIC0gMSk7XG4gICAgdmFyIGRpc3BsYXlJZCA9IGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gZGVmUGF0aFtkZWZQYXRoLmxlbmd0aCAtIDFdIDogaWQ7XG4gICAgdmFyIGNvZGUgPSBkZWZUeXBlID09PSAnc2VjdXJpdHlEZWZpbml0aW9uJyA/ICdTRUNVUklUWV9ERUZJTklUSU9OJyA6IGRlZlR5cGUudG9VcHBlckNhc2UoKTtcbiAgICB2YXIgbXNnUHJlZml4ID0gZGVmVHlwZSA9PT0gJ3NlY3VyaXR5RGVmaW5pdGlvbicgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnU2VjdXJpdHkgZGVmaW5pdGlvbicgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZUeXBlLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZGVmVHlwZS5zdWJzdHJpbmcoMSk7XG5cbiAgICBpZiAobWV0YWRhdGEucmVmZXJlbmNlcy5sZW5ndGggPT09IDAgJiYgIW1ldGFkYXRhLmlubGluZSkge1xuICAgICAgLy8gU3dhZ2dlciAxLjIgYXV0aG9yaXphdGlvbiBzY29wZVxuICAgICAgaWYgKG1ldGFkYXRhLnNjb3BlUGF0aCkge1xuICAgICAgICBjb2RlICs9ICdfU0NPUEUnO1xuICAgICAgICBtc2dQcmVmaXggKz0gJyBzY29wZSc7XG4gICAgICAgIGRlZlBhdGggPSBtZXRhZGF0YS5zY29wZVBhdGg7XG4gICAgICB9XG5cbiAgICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKGRpc3BsYXlJZCwgY29kZSwgbXNnUHJlZml4LCBkZWZQYXRoLCByZXN1bHRzLndhcm5pbmdzKTtcbiAgICB9XG4gIH0pO1xufTtcblxudmFyIHZhbGlkYXRlUGFyYW1ldGVycyA9IGZ1bmN0aW9uIHZhbGlkYXRlUGFyYW1ldGVycyAoc3BlYywgZG9jdW1lbnRNZXRhZGF0YSwgblBhdGgsIHBhcmFtZXRlcnMsIHBhdGgsIHJlc3VsdHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBza2lwTWlzc2luZykge1xuICB2YXIgY3JlYXRlUGFyYW1ldGVyQ29tYm9FcnJvciA9IGZ1bmN0aW9uIGNyZWF0ZVBhcmFtZXRlckNvbWJvRXJyb3IgKHBhdGgpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnSU5WQUxJRF9QQVJBTUVURVJfQ09NQklOQVRJT04nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgY2Fubm90IGhhdmUgYSBhIGJvZHkgcGFyYW1ldGVyIGFuZCBhICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgKHNwZWMudmVyc2lvbiA9PT0gJzEuMicgPyAnZm9ybScgOiAnZm9ybURhdGEnKSArICcgcGFyYW1ldGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gIH07XG4gIHZhciBwYXRoUGFyYW1zID0gW107XG4gIHZhciBzZWVuQm9keVBhcmFtID0gZmFsc2U7XG4gIHZhciBzZWVuRm9ybVBhcmFtID0gZmFsc2U7XG5cbiAgXy5yZWR1Y2UocGFyYW1ldGVycywgZnVuY3Rpb24gKHNlZW5QYXJhbWV0ZXJzLCBwYXJhbWV0ZXIsIGluZGV4KSB7XG4gICAgdmFyIHBQYXRoID0gcGF0aC5jb25jYXQoWydwYXJhbWV0ZXJzJywgaW5kZXgudG9TdHJpbmcoKV0pO1xuXG4gICAgLy8gVW5yZXNvbHZlZCBwYXJhbWV0ZXJcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSWRlbnRpZnkgZHVwbGljYXRlIHBhcmFtZXRlciBuYW1lc1xuICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLm5hbWUsICdQQVJBTUVURVInLCAnUGFyYW1ldGVyJywgcFBhdGguY29uY2F0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcblxuICAgIC8vIEtlZXAgdHJhY2sgb2YgYm9keSBhbmQgcGF0aCBwYXJhbWV0ZXJzXG4gICAgaWYgKHBhcmFtZXRlci5wYXJhbVR5cGUgPT09ICdib2R5JyB8fCBwYXJhbWV0ZXIuaW4gPT09ICdib2R5Jykge1xuICAgICAgaWYgKHNlZW5Cb2R5UGFyYW0gPT09IHRydWUpIHtcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV9BUElfQk9EWV9QQVJBTUVURVInLCAnQVBJIGhhcyBtb3JlIHRoYW4gb25lIGJvZHkgcGFyYW1ldGVyJywgcFBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VlbkZvcm1QYXJhbSA9PT0gdHJ1ZSkge1xuICAgICAgICBjcmVhdGVQYXJhbWV0ZXJDb21ib0Vycm9yKHBQYXRoKTtcbiAgICAgIH1cblxuICAgICAgc2VlbkJvZHlQYXJhbSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChwYXJhbWV0ZXIucGFyYW1UeXBlID09PSAnZm9ybScgfHwgcGFyYW1ldGVyLmluID09PSAnZm9ybURhdGEnKSB7XG4gICAgICBpZiAoc2VlbkJvZHlQYXJhbSA9PT0gdHJ1ZSkge1xuICAgICAgICBjcmVhdGVQYXJhbWV0ZXJDb21ib0Vycm9yKHBQYXRoKTtcbiAgICAgIH1cblxuICAgICAgc2VlbkZvcm1QYXJhbSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChwYXJhbWV0ZXIucGFyYW1UeXBlID09PSAncGF0aCcgfHwgcGFyYW1ldGVyLmluID09PSAncGF0aCcpIHtcbiAgICAgIGlmIChuUGF0aC5hcmdzLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFX0FQSV9QQVRIX1BBUkFNRVRFUicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgcGF0aCBwYXJhbWV0ZXIgY291bGQgbm90IGJlIHJlc29sdmVkOiAnICsgcGFyYW1ldGVyLm5hbWUsIHBQYXRoLmNvbmNhdCgnbmFtZScpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XG4gICAgICB9XG5cbiAgICAgIHBhdGhQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgfVxuXG4gICAgaWYgKHNwZWMucHJpbWl0aXZlcy5pbmRleE9mKHBhcmFtZXRlci50eXBlKSA9PT0gLTEgJiYgc3BlYy52ZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsICcjL21vZGVscy8nICsgcGFyYW1ldGVyLnR5cGUsIHBQYXRoLmNvbmNhdCgndHlwZScpLCByZXN1bHRzKTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBwYXJhbWV0ZXIgY29uc3RyYWludHNcbiAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEsIHBhcmFtZXRlciwgcFBhdGgsIHJlc3VsdHMsIHBhcmFtZXRlci5za2lwRXJyb3JzKTtcblxuICAgIHJldHVybiBzZWVuUGFyYW1ldGVycy5jb25jYXQocGFyYW1ldGVyLm5hbWUpO1xuICB9LCBbXSk7XG5cbiAgLy8gVmFsaWRhdGUgbWlzc2luZyBwYXRoIHBhcmFtZXRlcnMgKGluIHBhdGggYnV0IG5vdCBpbiBvcGVyYXRpb24ucGFyYW1ldGVycylcbiAgaWYgKF8uaXNVbmRlZmluZWQoc2tpcE1pc3NpbmcpIHx8IHNraXBNaXNzaW5nID09PSBmYWxzZSkge1xuICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoblBhdGguYXJncywgcGF0aFBhcmFtcyksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNSVNTSU5HX0FQSV9QQVRIX1BBUkFNRVRFUicsICdBUEkgcmVxdWlyZXMgcGF0aCBwYXJhbWV0ZXIgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgdW51c2VkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBwYXRoLnNsaWNlKDAsIDIpLmNvbmNhdCgncGF0aCcpIDogcGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcbiAgICB9KTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlU3dhZ2dlcjFfMiA9IGZ1bmN0aW9uIHZhbGlkYXRlU3dhZ2dlcjFfMiAoc3BlYywgcmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKSB7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuICB2YXIgYWRSZXNvdXJjZVBhdGhzID0gW107XG4gIHZhciBybERvY3VtZW50TWV0YWRhdGEgPSBnZXREb2N1bWVudENhY2hlKHJlc291cmNlTGlzdGluZyk7XG4gIHZhciBybFJlc291cmNlUGF0aHMgPSBbXTtcbiAgdmFyIHJlc3VsdHMgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW10sXG4gICAgYXBpRGVjbGFyYXRpb25zOiBbXVxuICB9O1xuXG4gIC8vIFByb2Nlc3MgUmVzb3VyY2UgTGlzdGluZyByZXNvdXJjZSBkZWZpbml0aW9uc1xuICBybFJlc291cmNlUGF0aHMgPSBfLnJlZHVjZShyZXNvdXJjZUxpc3RpbmcuYXBpcywgZnVuY3Rpb24gKHNlZW5QYXRocywgYXBpLCBpbmRleCkge1xuICAgIC8vIElkZW50aWZ5IGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRocyBkZWZpbmVkIGluIHRoZSBSZXNvdXJjZSBMaXN0aW5nXG4gICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5QYXRocywgYXBpLnBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLCBbJ2FwaXMnLCBpbmRleC50b1N0cmluZygpLCAncGF0aCddLFxuICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XG5cbiAgICBzZWVuUGF0aHMucHVzaChhcGkucGF0aCk7XG5cbiAgICByZXR1cm4gc2VlblBhdGhzO1xuICB9LCBbXSk7XG5cbiAgLy8gUHJvY2VzcyBSZXNvdXJjZSBMaXN0aW5nIGRlZmluaXRpb25zIChhdXRob3JpemF0aW9ucylcbiAgcHJvY2Vzc0RvY3VtZW50KHJsRG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XG5cblxuICAvLyBQcm9jZXNzIGVhY2ggQVBJIERlY2xhcmF0aW9uXG4gIGFkUmVzb3VyY2VQYXRocyA9IF8ucmVkdWNlKGFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKHNlZW5SZXNvdXJjZVBhdGhzLCBhcGlEZWNsYXJhdGlvbiwgaW5kZXgpIHtcbiAgICB2YXIgYVJlc3VsdHMgPSByZXN1bHRzLmFwaURlY2xhcmF0aW9uc1tpbmRleF0gPSB7XG4gICAgICBlcnJvcnM6IFtdLFxuICAgICAgd2FybmluZ3M6IFtdXG4gICAgfTtcbiAgICB2YXIgYWREb2N1bWVudE1ldGFkYXRhID0gZ2V0RG9jdW1lbnRDYWNoZShhcGlEZWNsYXJhdGlvbik7XG5cbiAgICAvLyBJZGVudGlmeSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aHMgZGVmaW5lZCBpbiB0aGUgQVBJIERlY2xhcmF0aW9uc1xuICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUmVzb3VyY2VQYXRocywgYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJyxcbiAgICAgICAgICAgICAgICAgICAgWydyZXNvdXJjZVBhdGgnXSwgYVJlc3VsdHMuZXJyb3JzKTtcblxuICAgIGlmIChhZFJlc291cmNlUGF0aHMuaW5kZXhPZihhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgpID09PSAtMSkge1xuICAgICAgLy8gSWRlbnRpZnkgdW51c2VkIHJlc291cmNlIHBhdGhzIGRlZmluZWQgaW4gdGhlIEFQSSBEZWNsYXJhdGlvbnNcbiAgICAgIHZhbGlkYXRlRXhpc3QocmxSZXNvdXJjZVBhdGhzLCBhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLFxuICAgICAgICAgICAgICAgICAgICBbJ3Jlc291cmNlUGF0aCddLCBhUmVzdWx0cy5lcnJvcnMpO1xuXG4gICAgICBzZWVuUmVzb3VyY2VQYXRocy5wdXNoKGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCk7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogUHJvY2VzcyBhdXRob3JpemF0aW9uIHJlZmVyZW5jZXNcbiAgICAvLyBOb3QgcG9zc2libGUgZHVlIHRvIGh0dHBzOi8vZ2l0aHViLmNvbS9zd2FnZ2VyLWFwaS9zd2FnZ2VyLXNwZWMvaXNzdWVzLzE1OVxuXG4gICAgLy8gUHJvY2VzcyBtb2RlbHNcbiAgICBwcm9jZXNzRG9jdW1lbnQoYWREb2N1bWVudE1ldGFkYXRhLCBhUmVzdWx0cyk7XG5cbiAgICAvLyBQcm9jZXNzIHRoZSBBUEkgZGVmaW5pdGlvbnNcbiAgICBfLnJlZHVjZShhcGlEZWNsYXJhdGlvbi5hcGlzLCBmdW5jdGlvbiAoc2VlblBhdGhzLCBhcGksIGluZGV4KSB7XG4gICAgICB2YXIgYVBhdGggPSBbJ2FwaXMnLCBpbmRleC50b1N0cmluZygpXTtcbiAgICAgIHZhciBuUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYXBpLnBhdGgpO1xuXG4gICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aFxuICAgICAgaWYgKHNlZW5QYXRocy5pbmRleE9mKG5QYXRoLnBhdGgpID4gLTEpIHtcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV9BUElfUEFUSCcsICdBUEkgcGF0aCAob3IgZXF1aXZhbGVudCkgYWxyZWFkeSBkZWZpbmVkOiAnICsgYXBpLnBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFQYXRoLmNvbmNhdCgncGF0aCcpLCBhUmVzdWx0cy5lcnJvcnMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VlblBhdGhzLnB1c2goblBhdGgucGF0aCk7XG4gICAgICB9XG5cbiAgICAgIC8vIFByb2Nlc3MgdGhlIEFQSSBvcGVyYXRpb25zXG4gICAgICBfLnJlZHVjZShhcGkub3BlcmF0aW9ucywgZnVuY3Rpb24gKHNlZW5NZXRob2RzLCBvcGVyYXRpb24sIGluZGV4KSB7XG4gICAgICAgIHZhciBvUGF0aCA9IGFQYXRoLmNvbmNhdChbJ29wZXJhdGlvbnMnLCBpbmRleC50b1N0cmluZygpXSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgZHVwbGljYXRlIG9wZXJhdGlvbiBtZXRob2RcbiAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5NZXRob2RzLCBvcGVyYXRpb24ubWV0aG9kLCAnT1BFUkFUSU9OX01FVEhPRCcsICdPcGVyYXRpb24gbWV0aG9kJywgb1BhdGguY29uY2F0KCdtZXRob2QnKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFSZXN1bHRzLmVycm9ycyk7XG5cbiAgICAgICAgLy8gS2VlcCB0cmFjayBvZiB0aGUgc2VlbiBtZXRob2RzXG4gICAgICAgIHNlZW5NZXRob2RzLnB1c2gob3BlcmF0aW9uLm1ldGhvZCk7XG5cbiAgICAgICAgLy8gS2VlcCB0cmFjayBvZiBvcGVyYXRpb24gdHlwZXNcbiAgICAgICAgaWYgKHNwZWMucHJpbWl0aXZlcy5pbmRleE9mKG9wZXJhdGlvbi50eXBlKSA9PT0gLTEgJiYgc3BlYy52ZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgICAgIGFkZFJlZmVyZW5jZShhZERvY3VtZW50TWV0YWRhdGEsICcjL21vZGVscy8nICsgb3BlcmF0aW9uLnR5cGUsIG9QYXRoLmNvbmNhdCgndHlwZScpLCBhUmVzdWx0cyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQcm9jZXNzIGF1dGhvcml6YXRpb24gcmVmZXJlbmNlc1xuICAgICAgICBwcm9jZXNzQXV0aFJlZnMocmxEb2N1bWVudE1ldGFkYXRhLCBvcGVyYXRpb24uYXV0aG9yaXphdGlvbnMsIG9QYXRoLmNvbmNhdCgnYXV0aG9yaXphdGlvbnMnKSwgYVJlc3VsdHMpO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIHZhbGlkYXRlIGlubGluZSBjb25zdHJhaW50c1xuICAgICAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGFkRG9jdW1lbnRNZXRhZGF0YSwgb3BlcmF0aW9uLCBvUGF0aCwgYVJlc3VsdHMpO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlcnNcbiAgICAgICAgdmFsaWRhdGVQYXJhbWV0ZXJzKHNwZWMsIGFkRG9jdW1lbnRNZXRhZGF0YSwgblBhdGgsIG9wZXJhdGlvbi5wYXJhbWV0ZXJzLCBvUGF0aCwgYVJlc3VsdHMpO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIHVuaXF1ZSByZXNwb25zZSBjb2RlXG4gICAgICAgIF8ucmVkdWNlKG9wZXJhdGlvbi5yZXNwb25zZU1lc3NhZ2VzLCBmdW5jdGlvbiAoc2VlblJlc3BvbnNlQ29kZXMsIHJlc3BvbnNlTWVzc2FnZSwgaW5kZXgpIHtcbiAgICAgICAgICB2YXIgcm1QYXRoID0gb1BhdGguY29uY2F0KFsncmVzcG9uc2VNZXNzYWdlcycsIGluZGV4LnRvU3RyaW5nKCldKTtcblxuICAgICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUmVzcG9uc2VDb2RlcywgcmVzcG9uc2VNZXNzYWdlLmNvZGUsICdSRVNQT05TRV9NRVNTQUdFX0NPREUnLCAnUmVzcG9uc2UgbWVzc2FnZSBjb2RlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcm1QYXRoLmNvbmNhdChbJ2NvZGUnXSksIGFSZXN1bHRzLmVycm9ycyk7XG5cbiAgICAgICAgICAvLyBWYWxpZGF0ZSBtaXNzaW5nIG1vZGVsXG4gICAgICAgICAgaWYgKHJlc3BvbnNlTWVzc2FnZS5yZXNwb25zZU1vZGVsKSB7XG4gICAgICAgICAgICBhZGRSZWZlcmVuY2UoYWREb2N1bWVudE1ldGFkYXRhLCAnIy9tb2RlbHMvJyArIHJlc3BvbnNlTWVzc2FnZS5yZXNwb25zZU1vZGVsLFxuICAgICAgICAgICAgICAgICAgICAgICAgIHJtUGF0aC5jb25jYXQoJ3Jlc3BvbnNlTW9kZWwnKSwgYVJlc3VsdHMpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBzZWVuUmVzcG9uc2VDb2Rlcy5jb25jYXQocmVzcG9uc2VNZXNzYWdlLmNvZGUpO1xuICAgICAgICB9LCBbXSk7XG5cbiAgICAgICAgcmV0dXJuIHNlZW5NZXRob2RzO1xuICAgICAgfSwgW10pO1xuXG4gICAgICByZXR1cm4gc2VlblBhdGhzO1xuICAgIH0sIFtdKTtcblxuICAgIC8vIFZhbGlkYXRlIEFQSSBEZWNsYXJhdGlvbiBkZWZpbml0aW9uc1xuICAgIHZhbGlkYXRlRGVmaW5pdGlvbnMoYWREb2N1bWVudE1ldGFkYXRhLCBhUmVzdWx0cyk7XG5cbiAgICByZXR1cm4gc2VlblJlc291cmNlUGF0aHM7XG4gIH0sIFtdKTtcblxuICAvLyBWYWxpZGF0ZSBBUEkgRGVjbGFyYXRpb24gZGVmaW5pdGlvbnNcbiAgdmFsaWRhdGVEZWZpbml0aW9ucyhybERvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpO1xuXG4gIC8vIElkZW50aWZ5IHVudXNlZCByZXNvdXJjZSBwYXRocyBkZWZpbmVkIGluIHRoZSBSZXNvdXJjZSBMaXN0aW5nXG4gIF8uZWFjaChfLmRpZmZlcmVuY2UocmxSZXNvdXJjZVBhdGhzLCBhZFJlc291cmNlUGF0aHMpLCBmdW5jdGlvbiAodW51c2VkKSB7XG4gICAgdmFyIGluZGV4ID0gcmxSZXNvdXJjZVBhdGhzLmluZGV4T2YodW51c2VkKTtcblxuICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKHJlc291cmNlTGlzdGluZy5hcGlzW2luZGV4XS5wYXRoLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ2FwaXMnLCBpbmRleC50b1N0cmluZygpLCAncGF0aCddLCByZXN1bHRzLmVycm9ycyk7XG4gIH0pO1xuXG4gIGNhbGxiYWNrKHVuZGVmaW5lZCwgcmVzdWx0cyk7XG59O1xuXG52YXIgdmFsaWRhdGVTd2FnZ2VyMl8wID0gZnVuY3Rpb24gdmFsaWRhdGVTd2FnZ2VyMl8wIChzcGVjLCBzd2FnZ2VyT2JqZWN0LCBjYWxsYmFjaykgeyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbiAgdmFyIGRvY3VtZW50TWV0YWRhdGEgPSBnZXREb2N1bWVudENhY2hlKHN3YWdnZXJPYmplY3QpO1xuICB2YXIgcmVzdWx0cyA9IHtcbiAgICBlcnJvcnM6IFtdLFxuICAgIHdhcm5pbmdzOiBbXVxuICB9O1xuXG4gIC8vIFByb2Nlc3MgZGVmaW5pdGlvbnNcbiAgcHJvY2Vzc0RvY3VtZW50KGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpO1xuXG4gIC8vIFByb2Nlc3Mgc2VjdXJpdHkgcmVmZXJlbmNlc1xuICBwcm9jZXNzQXV0aFJlZnMoZG9jdW1lbnRNZXRhZGF0YSwgc3dhZ2dlck9iamVjdC5zZWN1cml0eSwgWydzZWN1cml0eSddLCByZXN1bHRzKTtcblxuICBfLnJlZHVjZShkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkLnBhdGhzLCBmdW5jdGlvbiAoc2VlblBhdGhzLCBwYXRoLCBuYW1lKSB7XG4gICAgdmFyIHBQYXRoID0gWydwYXRocycsIG5hbWVdO1xuICAgIHZhciBuUGF0aCA9IG5vcm1hbGl6ZVBhdGgobmFtZSk7XG5cbiAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aFxuICAgIGlmIChzZWVuUGF0aHMuaW5kZXhPZihuUGF0aC5wYXRoKSA+IC0xKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFX0FQSV9QQVRIJywgJ0FQSSBwYXRoIChvciBlcXVpdmFsZW50KSBhbHJlYWR5IGRlZmluZWQ6ICcgKyBuYW1lLCBwUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBwYXJhbWV0ZXJzXG4gICAgdmFsaWRhdGVQYXJhbWV0ZXJzKHNwZWMsIGRvY3VtZW50TWV0YWRhdGEsIG5QYXRoLCBwYXRoLnBhcmFtZXRlcnMsIHBQYXRoLCByZXN1bHRzLCB0cnVlKTtcblxuICAgIC8vIFZhbGlkYXRlIHRoZSBPcGVyYXRpb25zXG4gICAgXy5lYWNoKHBhdGgsIGZ1bmN0aW9uIChvcGVyYXRpb24sIG1ldGhvZCkge1xuICAgICAgdmFyIGNQYXJhbXMgPSBbXTtcbiAgICAgIHZhciBvUGF0aCA9IHBQYXRoLmNvbmNhdChtZXRob2QpO1xuICAgICAgdmFyIHNlZW5QYXJhbXMgPSBbXTtcblxuICAgICAgaWYgKHZhbGlkT3B0aW9uTmFtZXMuaW5kZXhPZihtZXRob2QpID09PSAtMSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIFByb2Nlc3Mgc2VjdXJpdHkgcmVmZXJlbmNlc1xuICAgICAgcHJvY2Vzc0F1dGhSZWZzKGRvY3VtZW50TWV0YWRhdGEsIG9wZXJhdGlvbi5zZWN1cml0eSwgb1BhdGguY29uY2F0KCdzZWN1cml0eScpLCByZXN1bHRzKTtcblxuICAgICAgLy8gQ29tcG9zZSBwYXJhbWV0ZXJzIGZyb20gcGF0aCBnbG9iYWwgcGFyYW1ldGVycyBhbmQgb3BlcmF0aW9uIHBhcmFtZXRlcnNcbiAgICAgIF8uZWFjaChvcGVyYXRpb24ucGFyYW1ldGVycywgZnVuY3Rpb24gKHBhcmFtZXRlcikge1xuICAgICAgICBjUGFyYW1zLnB1c2gocGFyYW1ldGVyKTtcblxuICAgICAgICBzZWVuUGFyYW1zLnB1c2gocGFyYW1ldGVyLm5hbWUgKyAnOicgKyBwYXJhbWV0ZXIuaW4pO1xuICAgICAgfSk7XG5cbiAgICAgIF8uZWFjaChwYXRoLnBhcmFtZXRlcnMsIGZ1bmN0aW9uIChwYXJhbWV0ZXIpIHtcbiAgICAgICAgdmFyIGNsb25lZCA9IF8uY2xvbmVEZWVwKHBhcmFtZXRlcik7XG5cbiAgICAgICAgLy8gVGhlIG9ubHkgZXJyb3JzIHRoYXQgY2FuIG9jY3VyIGhlcmUgYXJlIHNjaGVtYSBjb25zdHJhaW50IHZhbGlkYXRpb24gZXJyb3JzIHdoaWNoIGFyZSBhbHJlYWR5IHJlcG9ydGVkIGFib3ZlXG4gICAgICAgIC8vIHNvIGRvIG5vdCByZXBvcnQgdGhlbSBhZ2Fpbi5cbiAgICAgICAgY2xvbmVkLnNraXBFcnJvcnMgPSB0cnVlO1xuXG4gICAgICAgIGlmIChzZWVuUGFyYW1zLmluZGV4T2YocGFyYW1ldGVyLm5hbWUgKyAnOicgKyBwYXJhbWV0ZXIuaW4pID09PSAtMSkge1xuICAgICAgICAgIGNQYXJhbXMucHVzaChjbG9uZWQpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gVmFsaWRhdGUgcGFyYW1ldGVyc1xuICAgICAgdmFsaWRhdGVQYXJhbWV0ZXJzKHNwZWMsIGRvY3VtZW50TWV0YWRhdGEsIG5QYXRoLCBjUGFyYW1zLCBvUGF0aCwgcmVzdWx0cyk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHJlc3BvbnNlc1xuICAgICAgXy5lYWNoKG9wZXJhdGlvbi5yZXNwb25zZXMsIGZ1bmN0aW9uIChyZXNwb25zZSwgcmVzcG9uc2VDb2RlKSB7XG4gICAgICAgIC8vIERvIG5vdCBwcm9jZXNzIHJlZmVyZW5jZXMgdG8gbWlzc2luZyByZXNwb25zZXNcbiAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlc3BvbnNlKSkge1xuICAgICAgICAgIC8vIFZhbGlkYXRlIHZhbGlkYXRlIGlubGluZSBjb25zdHJhaW50c1xuICAgICAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcmVzcG9uc2UsIG9QYXRoLmNvbmNhdCgncmVzcG9uc2VzJywgcmVzcG9uc2VDb2RlKSwgcmVzdWx0cyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHNlZW5QYXRocy5jb25jYXQoblBhdGgucGF0aCk7XG4gIH0sIFtdKTtcblxuICAvLyBWYWxpZGF0ZSBkZWZpbml0aW9uc1xuICB2YWxpZGF0ZURlZmluaXRpb25zKGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpO1xuXG4gIGNhbGxiYWNrKHVuZGVmaW5lZCwgcmVzdWx0cyk7XG59O1xuXG52YXIgdmFsaWRhdGVTZW1hbnRpY2FsbHkgPSBmdW5jdGlvbiB2YWxpZGF0ZVNlbWFudGljYWxseSAoc3BlYywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKSB7XG4gIHZhciBjYldyYXBwZXIgPSBmdW5jdGlvbiBjYldyYXBwZXIgKGVyciwgcmVzdWx0cykge1xuICAgIGNhbGxiYWNrKGVyciwgaGVscGVycy5mb3JtYXRSZXN1bHRzKHJlc3VsdHMpKTtcbiAgfTtcbiAgaWYgKHNwZWMudmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICB2YWxpZGF0ZVN3YWdnZXIxXzIoc3BlYywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNiV3JhcHBlcik7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuICB9IGVsc2Uge1xuICAgIHZhbGlkYXRlU3dhZ2dlcjJfMChzcGVjLCBybE9yU08sIGNiV3JhcHBlcik7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuICB9XG59O1xuXG52YXIgdmFsaWRhdGVTdHJ1Y3R1cmFsbHkgPSBmdW5jdGlvbiB2YWxpZGF0ZVN0cnVjdHVyYWxseSAoc3BlYywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKSB7XG4gIHZhbGlkYXRlQWdhaW5zdFNjaGVtYShzcGVjLCBzcGVjLnZlcnNpb24gPT09ICcxLjInID8gJ3Jlc291cmNlTGlzdGluZy5qc29uJyA6ICdzY2hlbWEuanNvbicsIHJsT3JTTyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gT25seSB2YWxpZGF0ZSB0aGUgQVBJIERlY2xhcmF0aW9ucyBpZiB0aGUgQVBJIGlzIDEuMiBhbmQgdGhlIFJlc291cmNlIExpc3Rpbmcgd2FzIHZhbGlkXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0cyAmJiBzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cyA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yczogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nczogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcGlEZWNsYXJhdGlvbnM6IFtdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzeW5jLm1hcChhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChhcGlEZWNsYXJhdGlvbiwgY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRlQWdhaW5zdFNjaGVtYShzcGVjLCAnYXBpRGVjbGFyYXRpb24uanNvbicsIGFwaURlY2xhcmF0aW9uLCBjYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVyciwgYWxsUmVzdWx0cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXy5lYWNoKGFsbFJlc3VsdHMsIGZ1bmN0aW9uIChyZXN1bHQsIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zW2luZGV4XSA9IHJlc3VsdDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIHJlc3VsdHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgcmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IFN3YWdnZXIgc3BlY2lmaWNhdGlvbiBvYmplY3QuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHZlcnNpb24gLSBUaGUgU3dhZ2dlciB2ZXJzaW9uXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBTcGVjaWZpY2F0aW9uID0gZnVuY3Rpb24gU3BlY2lmaWNhdGlvbiAodmVyc2lvbikge1xuICB2YXIgY3JlYXRlVmFsaWRhdG9ycyA9IGZ1bmN0aW9uIGNyZWF0ZVZhbGlkYXRvcnMgKHNwZWMsIHZhbGlkYXRvcnNNYXApIHtcbiAgICByZXR1cm4gXy5yZWR1Y2UodmFsaWRhdG9yc01hcCwgZnVuY3Rpb24gKHJlc3VsdCwgc2NoZW1hcywgc2NoZW1hTmFtZSkge1xuICAgICAgcmVzdWx0W3NjaGVtYU5hbWVdID0gaGVscGVycy5jcmVhdGVKc29uVmFsaWRhdG9yKHNjaGVtYXMpO1xuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0uYmluZCh0aGlzKSwge30pO1xuICB9O1xuICB2YXIgZml4U2NoZW1hSWQgPSBmdW5jdGlvbiBmaXhTY2hlbWFJZCAoc2NoZW1hTmFtZSkge1xuICAgIC8vIFN3YWdnZXIgMS4yIHNjaGVtYSBmaWxlcyB1c2Ugb25lIGlkIGJ1dCB1c2UgYSBkaWZmZXJlbnQgaWQgd2hlbiByZWZlcmVuY2luZyBzY2hlbWEgZmlsZXMuICBXZSBhbHNvIHVzZSB0aGUgc2NoZW1hXG4gICAgLy8gZmlsZSBuYW1lIHRvIHJlZmVyZW5jZSB0aGUgc2NoZW1hIGluIFpTY2hlbWEuICBUbyBmaXggdGhpcyBzbyB0aGF0IHRoZSBKU09OIFNjaGVtYSB2YWxpZGF0b3Igd29ya3MgcHJvcGVybHksIHdlXG4gICAgLy8gbmVlZCB0byBzZXQgdGhlIGlkIHRvIGJlIHRoZSBuYW1lIG9mIHRoZSBzY2hlbWEgZmlsZS5cbiAgICB2YXIgZml4ZWQgPSBfLmNsb25lRGVlcCh0aGlzLnNjaGVtYXNbc2NoZW1hTmFtZV0pO1xuXG4gICAgZml4ZWQuaWQgPSBzY2hlbWFOYW1lO1xuXG4gICAgcmV0dXJuIGZpeGVkO1xuICB9LmJpbmQodGhpcyk7XG4gIHZhciBwcmltaXRpdmVzID0gWydzdHJpbmcnLCAnbnVtYmVyJywgJ2Jvb2xlYW4nLCAnaW50ZWdlcicsICdhcnJheSddO1xuXG4gIHN3aXRjaCAodmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIHRoaXMuZG9jc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL2Jsb2IvbWFzdGVyL3ZlcnNpb25zLzEuMi5tZCc7XG4gICAgdGhpcy5wcmltaXRpdmVzID0gXy51bmlvbihwcmltaXRpdmVzLCBbJ3ZvaWQnLCAnRmlsZSddKTtcbiAgICB0aGlzLnNjaGVtYXNVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy90cmVlL21hc3Rlci9zY2hlbWFzL3YxLjInO1xuXG4gICAgLy8gSGVyZSBleHBsaWNpdGx5IHRvIGFsbG93IGJyb3dzZXJpZnkgdG8gd29ya1xuICAgIHRoaXMuc2NoZW1hcyA9IHtcbiAgICAgICdhcGlEZWNsYXJhdGlvbi5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvYXBpRGVjbGFyYXRpb24uanNvbicpLFxuICAgICAgJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbicpLFxuICAgICAgJ2RhdGFUeXBlLmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9kYXRhVHlwZS5qc29uJyksXG4gICAgICAnZGF0YVR5cGVCYXNlLmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9kYXRhVHlwZUJhc2UuanNvbicpLFxuICAgICAgJ2luZm9PYmplY3QuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2luZm9PYmplY3QuanNvbicpLFxuICAgICAgJ21vZGVsc09iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvbW9kZWxzT2JqZWN0Lmpzb24nKSxcbiAgICAgICdvYXV0aDJHcmFudFR5cGUuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL29hdXRoMkdyYW50VHlwZS5qc29uJyksXG4gICAgICAnb3BlcmF0aW9uT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9vcGVyYXRpb25PYmplY3QuanNvbicpLFxuICAgICAgJ3BhcmFtZXRlck9iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcGFyYW1ldGVyT2JqZWN0Lmpzb24nKSxcbiAgICAgICdyZXNvdXJjZUxpc3RpbmcuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL3Jlc291cmNlTGlzdGluZy5qc29uJyksXG4gICAgICAncmVzb3VyY2VPYmplY3QuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL3Jlc291cmNlT2JqZWN0Lmpzb24nKVxuICAgIH07XG5cbiAgICB0aGlzLnZhbGlkYXRvcnMgPSBjcmVhdGVWYWxpZGF0b3JzKHRoaXMsIHtcbiAgICAgICdhcGlEZWNsYXJhdGlvbi5qc29uJzogXy5tYXAoW1xuICAgICAgICAnZGF0YVR5cGVCYXNlLmpzb24nLFxuICAgICAgICAnbW9kZWxzT2JqZWN0Lmpzb24nLFxuICAgICAgICAnb2F1dGgyR3JhbnRUeXBlLmpzb24nLFxuICAgICAgICAnYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJyxcbiAgICAgICAgJ3BhcmFtZXRlck9iamVjdC5qc29uJyxcbiAgICAgICAgJ29wZXJhdGlvbk9iamVjdC5qc29uJyxcbiAgICAgICAgJ2FwaURlY2xhcmF0aW9uLmpzb24nXG4gICAgICBdLCBmaXhTY2hlbWFJZCksXG4gICAgICAncmVzb3VyY2VMaXN0aW5nLmpzb24nOiBfLm1hcChbXG4gICAgICAgICdyZXNvdXJjZU9iamVjdC5qc29uJyxcbiAgICAgICAgJ2luZm9PYmplY3QuanNvbicsXG4gICAgICAgICdvYXV0aDJHcmFudFR5cGUuanNvbicsXG4gICAgICAgICdhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24nLFxuICAgICAgICAncmVzb3VyY2VMaXN0aW5nLmpzb24nXG4gICAgICBdLCBmaXhTY2hlbWFJZClcbiAgICB9KTtcblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgdGhpcy5kb2NzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9zd2FnZ2VyLWFwaS9zd2FnZ2VyLXNwZWMvYmxvYi9tYXN0ZXIvdmVyc2lvbnMvMi4wLm1kJztcbiAgICB0aGlzLnByaW1pdGl2ZXMgPSBfLnVuaW9uKHByaW1pdGl2ZXMsIFsnZmlsZSddKTtcbiAgICB0aGlzLnNjaGVtYXNVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy90cmVlL21hc3Rlci9zY2hlbWFzL3YyLjAnO1xuXG4gICAgLy8gSGVyZSBleHBsaWNpdGx5IHRvIGFsbG93IGJyb3dzZXJpZnkgdG8gd29ya1xuICAgIHRoaXMuc2NoZW1hcyA9IHtcbiAgICAgICdzY2hlbWEuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMi4wL3NjaGVtYS5qc29uJylcbiAgICB9O1xuXG4gICAgdGhpcy52YWxpZGF0b3JzID0gY3JlYXRlVmFsaWRhdG9ycyh0aGlzLCB7XG4gICAgICAnc2NoZW1hLmpzb24nOiBbZml4U2NoZW1hSWQoJ3NjaGVtYS5qc29uJyldXG4gICAgfSk7XG5cbiAgICBicmVhaztcblxuICBkZWZhdWx0OlxuICAgIHRocm93IG5ldyBFcnJvcih2ZXJzaW9uICsgJyBpcyBhbiB1bnN1cHBvcnRlZCBTd2FnZ2VyIHNwZWNpZmljYXRpb24gdmVyc2lvbicpO1xuICB9XG5cbiAgdGhpcy52ZXJzaW9uID0gdmVyc2lvbjtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgcmVzdWx0IG9mIHRoZSB2YWxpZGF0aW9uIG9mIHRoZSBTd2FnZ2VyIGRvY3VtZW50KHMpLlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBybE9yU08gLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBMaXN0aW5nICgxLjIpIG9yIFN3YWdnZXIgT2JqZWN0ICgyLjApXG4gKiBAcGFyYW0ge29iamVjdFtdfSBbYXBpRGVjbGFyYXRpb25zXSAtIFRoZSBhcnJheSBvZiBTd2FnZ2VyIEFQSSBEZWNsYXJhdGlvbnMgKDEuMilcbiAqIEBwYXJhbSB7cmVzdWx0Q2FsbGJhY2t9IGNhbGxiYWNrIC0gVGhlIHJlc3VsdCBjYWxsYmFja1xuICpcbiAqIEByZXR1cm5zIHVuZGVmaW5lZCBpZiB2YWxpZGF0aW9uIHBhc3NlcyBvciBhbiBvYmplY3QgY29udGFpbmluZyBlcnJvcnMgYW5kL29yIHdhcm5pbmdzXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBhcmd1bWVudHMgcHJvdmlkZWQgYXJlIG5vdCB2YWxpZFxuICovXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS52YWxpZGF0ZSA9IGZ1bmN0aW9uIHZhbGlkYXRlIChybE9yU08sIGFwaURlY2xhcmF0aW9ucywgY2FsbGJhY2spIHtcbiAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gIHN3aXRjaCAodGhpcy52ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQocmxPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZXNvdXJjZUxpc3RpbmcgaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QocmxPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncmVzb3VyY2VMaXN0aW5nIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRGVjbGFyYXRpb25zKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdhcGlEZWNsYXJhdGlvbnMgaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzQXJyYXkoYXBpRGVjbGFyYXRpb25zKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignYXBpRGVjbGFyYXRpb25zIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICB9XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3dhZ2dlck9iamVjdCBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzd2FnZ2VyT2JqZWN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG4gIH1cblxuICBpZiAodGhpcy52ZXJzaW9uID09PSAnMi4wJykge1xuICAgIGNhbGxiYWNrID0gYXJndW1lbnRzWzFdO1xuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBpcyByZXF1aXJlZCcpO1xuICB9IGVsc2UgaWYgKCFfLmlzRnVuY3Rpb24oY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gIH1cblxuICAvLyBGb3IgU3dhZ2dlciAyLjAsIG1ha2Ugc3VyZSBhcGlEZWNsYXJhdGlvbnMgaXMgYW4gZW1wdHkgYXJyYXlcbiAgaWYgKHRoaXMudmVyc2lvbiA9PT0gJzIuMCcpIHtcbiAgICBhcGlEZWNsYXJhdGlvbnMgPSBbXTtcbiAgfVxuXG4gIC8vIFBlcmZvcm0gdGhlIHZhbGlkYXRpb25cbiAgdmFsaWRhdGVTdHJ1Y3R1cmFsbHkodGhpcywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdCkge1xuICAgIGlmIChlcnIgfHwgaGVscGVycy5mb3JtYXRSZXN1bHRzKHJlc3VsdCkpIHtcbiAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsaWRhdGVTZW1hbnRpY2FsbHkodGhpcywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKTtcbiAgICB9XG4gIH0uYmluZCh0aGlzKSk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBKU09OIFNjaGVtYSByZXByZXNlbnRhdGlvbiBvZiBhIGNvbXBvc2VkIG1vZGVsIGJhc2VkIG9uIGl0cyBpZCBvciByZWZlcmVuY2UuXG4gKlxuICogTm90ZTogRm9yIFN3YWdnZXIgMS4yLCB3ZSBvbmx5IHBlcmZvcm0gc3RydWN0dXJhbCB2YWxpZGF0aW9uIHByaW9yIHRvIGNvbXBvc2luZyB0aGUgbW9kZWwuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IGFwaURPclNPIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgQVBJIERlY2xhcmF0aW9uICgxLjIpIG9yIHRoZSBTd2FnZ2VyIE9iamVjdCAoMi4wKVxuICogQHBhcmFtIHtzdHJpbmd9IG1vZGVsSWRPclJlZiAtIFRoZSBtb2RlbCBpZCAoMS4yKSBvciB0aGUgcmVmZXJlbmNlIHRvIHRoZSBtb2RlbCAoMS4yIG9yIDIuMClcbiAqIEBwYXJhbSB7cmVzdWx0Q2FsbGJhY2t9IGNhbGxiYWNrIC0gVGhlIHJlc3VsdCBjYWxsYmFja1xuICpcbiAqIEByZXR1cm5zIHRoZSBvYmplY3QgcmVwcmVzZW50aW5nIGEgY29tcG9zZWQgb2JqZWN0XG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGVyZSBhcmUgdmFsaWRhdGlvbiBlcnJvcnMgd2hpbGUgY3JlYXRpbmdcbiAqL1xuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUuY29tcG9zZU1vZGVsID0gZnVuY3Rpb24gY29tcG9zZU1vZGVsIChhcGlET3JTTywgbW9kZWxJZE9yUmVmLCBjYWxsYmFjaykge1xuICB2YXIgc3dhZ2dlclZlcnNpb24gPSBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGFwaURPclNPKTtcbiAgdmFyIGRvQ29tcG9zaXRpb24gPSBmdW5jdGlvbiBkb0NvbXBvc2l0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICB2YXIgZG9jdW1lbnRNZXRhZGF0YTtcblxuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgIH0gZWxzZSBpZiAoaGVscGVycy5nZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMCkge1xuICAgICAgcmV0dXJuIGhhbmRsZVZhbGlkYXRpb25FcnJvcihyZXN1bHRzLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgZG9jdW1lbnRNZXRhZGF0YSA9IGdldERvY3VtZW50Q2FjaGUoYXBpRE9yU08pO1xuICAgIHJlc3VsdHMgPSB7XG4gICAgICBlcnJvcnM6IFtdLFxuICAgICAgd2FybmluZ3M6IFtdXG4gICAgfTtcblxuICAgIHByb2Nlc3NEb2N1bWVudChkb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKTtcblxuICAgIGlmICghZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1ttb2RlbElkT3JSZWZdKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICB9XG5cbiAgICBpZiAoaGVscGVycy5nZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMCkge1xuICAgICAgcmV0dXJuIGhhbmRsZVZhbGlkYXRpb25FcnJvcihyZXN1bHRzLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgY2FsbGJhY2sodW5kZWZpbmVkLCBnZXRPckNvbXBvc2VTY2hlbWEoZG9jdW1lbnRNZXRhZGF0YSwgbW9kZWxJZE9yUmVmKSk7XG4gIH07XG5cbiAgc3dpdGNoICh0aGlzLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYXBpRGVjbGFyYXRpb24gaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdhcGlEZWNsYXJhdGlvbiBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChfLmlzVW5kZWZpbmVkKG1vZGVsSWRPclJlZikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxJZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N3YWdnZXJPYmplY3QgaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzd2FnZ2VyT2JqZWN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUmVmKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbFJlZiBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBpcyByZXF1aXJlZCcpO1xuICB9IGVsc2UgaWYgKCFfLmlzRnVuY3Rpb24oY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gIH1cblxuICBpZiAobW9kZWxJZE9yUmVmLmNoYXJBdCgwKSAhPT0gJyMnKSB7XG4gICAgaWYgKHRoaXMudmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAgIG1vZGVsSWRPclJlZiA9ICcjL21vZGVscy8nICsgbW9kZWxJZE9yUmVmO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21vZGVsUmVmIG11c3QgYmUgYSBKU09OIFBvaW50ZXInKTtcbiAgICB9XG4gIH1cblxuICAvLyBFbnN1cmUgdGhlIGRvY3VtZW50IGlzIHZhbGlkIGZpcnN0XG4gIGlmIChzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICB2YWxpZGF0ZUFnYWluc3RTY2hlbWEodGhpcywgJ2FwaURlY2xhcmF0aW9uLmpzb24nLCBhcGlET3JTTywgZG9Db21wb3NpdGlvbik7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy52YWxpZGF0ZShhcGlET3JTTywgZG9Db21wb3NpdGlvbik7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIGEgbW9kZWwgYmFzZWQgb24gaXRzIGlkLlxuICpcbiAqIE5vdGU6IEZvciBTd2FnZ2VyIDEuMiwgd2Ugb25seSBwZXJmb3JtIHN0cnVjdHVyYWwgdmFsaWRhdGlvbiBwcmlvciB0byBjb21wb3NpbmcgdGhlIG1vZGVsLlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBhcGlET3JTTyAtIFRoZSBTd2FnZ2VyIFJlc291cmNlIEFQSSBEZWNsYXJhdGlvbiAoMS4yKSBvciB0aGUgU3dhZ2dlciBPYmplY3QgKDIuMClcbiAqIEBwYXJhbSB7c3RyaW5nfSBtb2RlbElkT3JSZWYgLSBUaGUgbW9kZWwgaWQgKDEuMikgb3IgdGhlIHJlZmVyZW5jZSB0byB0aGUgbW9kZWwgKDEuMiBvciAyLjApXG4gKiBAcGFyYW0ge29iamVjdH0gZGF0YSAtIFRoZSBtb2RlbCB0byB2YWxpZGF0ZVxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXG4gKlxuICogQHJldHVybnMgdW5kZWZpbmVkIGlmIHZhbGlkYXRpb24gcGFzc2VzIG9yIGFuIG9iamVjdCBjb250YWluaW5nIGVycm9ycyBhbmQvb3Igd2FybmluZ3NcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZXJlIGFyZSB2YWxpZGF0aW9uIGVycm9ycyB3aGlsZSBjcmVhdGluZ1xuICovXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS52YWxpZGF0ZU1vZGVsID0gZnVuY3Rpb24gdmFsaWRhdGVNb2RlbCAoYXBpRE9yU08sIG1vZGVsSWRPclJlZiwgZGF0YSwgY2FsbGJhY2spIHtcbiAgc3dpdGNoICh0aGlzLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYXBpRGVjbGFyYXRpb24gaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdhcGlEZWNsYXJhdGlvbiBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChfLmlzVW5kZWZpbmVkKG1vZGVsSWRPclJlZikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxJZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N3YWdnZXJPYmplY3QgaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzd2FnZ2VyT2JqZWN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUmVmKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbFJlZiBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZGF0YSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2RhdGEgaXMgcmVxdWlyZWQnKTtcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICB9XG5cbiAgdGhpcy5jb21wb3NlTW9kZWwoYXBpRE9yU08sIG1vZGVsSWRPclJlZiwgZnVuY3Rpb24gKGVyciwgcmVzdWx0KSB7XG4gICAgaWYgKGVycikge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgfVxuXG4gICAgdmFsaWRhdGVBZ2FpbnN0U2NoZW1hKHRoaXMsIHJlc3VsdCwgZGF0YSwgY2FsbGJhY2spO1xuICB9LmJpbmQodGhpcykpO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgZnVsbHkgcmVzb2x2ZWQgZG9jdW1lbnQgb3IgZG9jdW1lbnQgZnJhZ21lbnQuICAoRG9lcyBub3QgcGVyZm9ybSB2YWxpZGF0aW9uIGFzIHRoaXMgaXMgdHlwaWNhbGx5IGNhbGxlZFxuICogYWZ0ZXIgdmFsaWRhdGlvbiBvY2N1cnMuKSlcbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gZG9jdW1lbnQgLSBUaGUgZG9jdW1lbnQgdG8gcmVzb2x2ZSBvciB0aGUgZG9jdW1lbnQgY29udGFpbmluZyB0aGUgcmVmZXJlbmNlIHRvIHJlc29sdmVcbiAqIEBwYXJhbSB7c3RyaW5nfSBbcHRyXSAtIFRoZSBKU09OIFBvaW50ZXIgb3IgdW5kZWZpbmVkIHRvIHJldHVybiB0aGUgd2hvbGUgZG9jdW1lbnRcbiAqIEBwYXJhbSB7cmVzdWx0Q2FsbGJhY2t9IGNhbGxiYWNrIC0gVGhlIHJlc3VsdCBjYWxsYmFja1xuICpcbiAqIEByZXR1cm5zIHRoZSBmdWxseSByZXNvbHZlZCBkb2N1bWVudCBvciBmcmFnbWVudFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlcmUgYXJlIHVwc3RyZWFtIGVycm9yc1xuICovXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS5yZXNvbHZlID0gZnVuY3Rpb24gcmVzb2x2ZSAoZG9jdW1lbnQsIHB0ciwgY2FsbGJhY2spIHtcbiAgdmFyIGRvY3VtZW50TWV0YWRhdGE7XG4gIHZhciByZXNwb25kID0gZnVuY3Rpb24gcmVzcG9uZCAoZG9jdW1lbnQpIHtcbiAgICBpZiAoXy5pc1N0cmluZyhwdHIpKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2sodW5kZWZpbmVkLCB0cmF2ZXJzZShkb2N1bWVudCkuZ2V0KEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihwdHIpKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayh1bmRlZmluZWQsIGRvY3VtZW50KTtcbiAgICB9XG4gIH07XG5cbiAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gIGlmIChfLmlzVW5kZWZpbmVkKGRvY3VtZW50KSkge1xuICAgIHRocm93IG5ldyBFcnJvcignZG9jdW1lbnQgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGRvY3VtZW50KSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2RvY3VtZW50IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMikge1xuICAgIGNhbGxiYWNrID0gYXJndW1lbnRzWzFdO1xuICAgIHB0ciA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGlmICghXy5pc1VuZGVmaW5lZChwdHIpICYmICFfLmlzU3RyaW5nKHB0cikpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwdHIgbXVzdCBiZSBhIEpTT04gUG9pbnRlciBzdHJpbmcnKTtcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICB9XG5cbiAgZG9jdW1lbnRNZXRhZGF0YSA9IGdldERvY3VtZW50Q2FjaGUoZG9jdW1lbnQpO1xuXG4gIC8vIFN3YWdnZXIgMS4yIGlzIG5vdCBzdXBwb3J0ZWQgZHVlIHRvIGludmFsaWQgSlNPTiBSZWZlcmVuY2VzIGJlaW5nIHVzZWQuICBFdmVuIGlmIHRoZSBKU09OIFJlZmVyZW5jZXMgd2VyZSB2YWxpZCxcbiAgLy8gdGhlIEpTT04gU2NoZW1hIGZvciBTd2FnZ2VyIDEuMiBkbyBub3QgYWxsb3cgSmF2YVNjcmlwdCBvYmplY3RzIGluIGFsbCBwbGFjZXMgd2hlcmUgdGhlIHJlc291dGlvbiB3b3VsZCBvY2N1ci5cbiAgaWYgKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdTd2FnZ2VyIDEuMiBpcyBub3Qgc3VwcG9ydGVkJyk7XG4gIH1cblxuICBpZiAoIWRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpIHtcbiAgICAvLyBFbnN1cmUgdGhlIGRvY3VtZW50IGlzIHZhbGlkIGZpcnN0XG4gICAgdGhpcy52YWxpZGF0ZShkb2N1bWVudCwgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH0gZWxzZSBpZiAoaGVscGVycy5nZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMCkge1xuICAgICAgICByZXR1cm4gaGFuZGxlVmFsaWRhdGlvbkVycm9yKHJlc3VsdHMsIGNhbGxiYWNrKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3BvbmQoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHJlc3BvbmQoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCk7XG4gIH1cbn07XG5cbi8qKlxuICogQ29udmVydHMgdGhlIFN3YWdnZXIgMS4yIGRvY3VtZW50cyB0byBhIFN3YWdnZXIgMi4wIGRvY3VtZW50LlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSByZXNvdXJjZUxpc3RpbmcgLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBMaXN0aW5nXG4gKiBAcGFyYW0ge29iamVjdFtdfSBbYXBpRGVjbGFyYXRpb25zXSAtIFRoZSBhcnJheSBvZiBTd2FnZ2VyIEFQSSBEZWNsYXJhdGlvbnNcbiAqIEBwYXJhbSB7Ym9vbGVhbj1mYWxzZX0gW3NraXBWYWxpZGF0aW9uXSAtIFdoZXRoZXIgb3Igbm90IHRvIHNraXAgdmFsaWRhdGlvblxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXG4gKlxuICogQHJldHVybnMgdGhlIGNvbnZlcnRlZCBTd2FnZ2VyIGRvY3VtZW50XG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgYXJndW1lbnRzIHByb3ZpZGVkIGFyZSBub3QgdmFsaWRcbiAqL1xuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUuY29udmVydCA9IGZ1bmN0aW9uIChyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucywgc2tpcFZhbGlkYXRpb24sIGNhbGxiYWNrKSB7XG4gIHZhciBkb0NvbnZlcnQgPSBmdW5jdGlvbiBkb0NvbnZlcnQgKHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zKSB7XG4gICAgY2FsbGJhY2sodW5kZWZpbmVkLCBzd2FnZ2VyQ29udmVydGVyKHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zKSk7XG4gIH0uYmluZCh0aGlzKTtcblxuICBpZiAodGhpcy52ZXJzaW9uICE9PSAnMS4yJykge1xuICAgIHRocm93IG5ldyBFcnJvcignU3BlY2lmaWNhdGlvbiNjb252ZXJ0IG9ubHkgd29ya3MgZm9yIFN3YWdnZXIgMS4yJyk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgaWYgKF8uaXNVbmRlZmluZWQocmVzb3VyY2VMaXN0aW5nKSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncmVzb3VyY2VMaXN0aW5nIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChyZXNvdXJjZUxpc3RpbmcpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncmVzb3VyY2VMaXN0aW5nIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICAvLyBBUEkgRGVjbGFyYXRpb25zIGFyZSBvcHRpb25hbCBiZWNhdXNlIHN3YWdnZXItY29udmVydGVyIHdhcyB3cml0dGVuIHRvIHN1cHBvcnQgaXRcbiAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRGVjbGFyYXRpb25zKSkge1xuICAgIGFwaURlY2xhcmF0aW9ucyA9IFtdO1xuICB9XG5cbiAgaWYgKCFfLmlzQXJyYXkoYXBpRGVjbGFyYXRpb25zKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gIH1cblxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDQpIHtcbiAgICBjYWxsYmFjayA9IGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBpZiAoXy5pc1VuZGVmaW5lZChjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgfVxuXG4gIGlmIChza2lwVmFsaWRhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIGRvQ29udmVydChyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucyk7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy52YWxpZGF0ZShyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH0gZWxzZSBpZiAoaGVscGVycy5nZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMCkge1xuICAgICAgICByZXR1cm4gaGFuZGxlVmFsaWRhdGlvbkVycm9yKHJlc3VsdHMsIGNhbGxiYWNrKTtcbiAgICAgIH1cblxuICAgICAgZG9Db252ZXJ0KHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zKTtcbiAgICB9KTtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMudjEgPSBtb2R1bGUuZXhwb3J0cy52MV8yID0gbmV3IFNwZWNpZmljYXRpb24oJzEuMicpOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbm1vZHVsZS5leHBvcnRzLnYyID0gbW9kdWxlLmV4cG9ydHMudjJfMCA9IG5ldyBTcGVjaWZpY2F0aW9uKCcyLjAnKTsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG4iLCIvKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0IEFwaWdlZSBDb3Jwb3JhdGlvblxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuICogYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG4gKiBUSEUgU09GVFdBUkUuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh3aW5kb3cuXyk7XG52YXIgSnNvblJlZnMgPSAod2luZG93Lkpzb25SZWZzKTtcbnZhciBaU2NoZW1hID0gKHdpbmRvdy5aU2NoZW1hKTtcblxudmFyIGRyYWZ0MDRKc29uID0gcmVxdWlyZSgnLi4vc2NoZW1hcy9qc29uLXNjaGVtYS1kcmFmdC0wNC5qc29uJyk7XG52YXIgZHJhZnQwNFVybCA9ICdodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSc7XG52YXIgc3BlY0NhY2hlID0ge307XG5cbm1vZHVsZS5leHBvcnRzLmNyZWF0ZUpzb25WYWxpZGF0b3IgPSBmdW5jdGlvbiBjcmVhdGVKc29uVmFsaWRhdG9yIChzY2hlbWFzKSB7XG4gIHZhciB2YWxpZGF0b3IgPSBuZXcgWlNjaGVtYSh7XG4gICAgcmVwb3J0UGF0aEFzQXJyYXk6IHRydWVcbiAgfSk7XG4gIHZhciByZXN1bHQ7XG5cbiAgLy8gQWRkIHRoZSBkcmFmdC0wNCBzcGVjXG4gIHZhbGlkYXRvci5zZXRSZW1vdGVSZWZlcmVuY2UoZHJhZnQwNFVybCwgZHJhZnQwNEpzb24pO1xuXG4gIC8vIFN3YWdnZXIgdXNlcyBzb21lIHVuc3VwcG9ydGVkL2ludmFsaWQgZm9ybWF0cyBzbyBqdXN0IG1ha2UgdGhlbSBhbGwgcGFzc1xuICBfLmVhY2goWydieXRlJywgJ2RvdWJsZScsICdmbG9hdCcsICdpbnQzMicsICdpbnQ2NCcsICdtaW1lLXR5cGUnLCAndXJpLXRlbXBsYXRlJ10sIGZ1bmN0aW9uIChmb3JtYXQpIHtcbiAgICBaU2NoZW1hLnJlZ2lzdGVyRm9ybWF0KGZvcm1hdCwgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIENvbXBpbGUgYW5kIHZhbGlkYXRlIHRoZSBzY2hlbWFzXG4gIGlmICghXy5pc1VuZGVmaW5lZChzY2hlbWFzKSkge1xuICAgIHJlc3VsdCA9IHZhbGlkYXRvci5jb21waWxlU2NoZW1hKHNjaGVtYXMpO1xuXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gZXJyb3IsIGl0J3MgdW5yZWNvdmVyYWJsZSBzbyBqdXN0IGJsb3cgdGhlIGVmZiB1cFxuICAgIGlmIChyZXN1bHQgPT09IGZhbHNlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdKU09OIFNjaGVtYSBmaWxlJyArIChzY2hlbWFzLmxlbmd0aCA+IDEgPyAncyBhcmUnIDogJyBpcycpICsgJyBpbnZhbGlkOicpO1xuXG4gICAgICBfLmVhY2godmFsaWRhdG9yLmdldExhc3RFcnJvcnMoKSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCcgICcgKyAoXy5pc0FycmF5KGVyci5wYXRoKSA/IEpzb25SZWZzLnBhdGhUb1BvaW50ZXIoZXJyLnBhdGgpIDogZXJyLnBhdGgpICsgJzogJyArIGVyci5tZXNzYWdlKTtcbiAgICAgIH0pO1xuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byBjcmVhdGUgdmFsaWRhdG9yIGR1ZSB0byBpbnZhbGlkIEpTT04gU2NoZW1hJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHZhbGlkYXRvcjtcbn07XG5cbm1vZHVsZS5leHBvcnRzLmZvcm1hdFJlc3VsdHMgPSBmdW5jdGlvbiBmb3JtYXRSZXN1bHRzIChyZXN1bHRzKSB7XG4gIGlmIChyZXN1bHRzKSB7XG4gICAgLy8gVXBkYXRlIHRoZSByZXN1bHRzIGJhc2VkIG9uIGl0cyBjb250ZW50IHRvIGluZGljYXRlIHN1Y2Nlc3MvZmFpbHVyZSBhY2NvcmRpbmdseVxuICAgIHJlc3VsdHMgPSAocmVzdWx0cy5lcnJvcnMubGVuZ3RoICsgcmVzdWx0cy53YXJuaW5ncy5sZW5ndGggK1xuICAgIF8ucmVkdWNlKHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoY291bnQsIGFSZXN1bHQpIHtcbiAgICAgIGlmIChhUmVzdWx0KSB7XG4gICAgICAgIGNvdW50ICs9IGFSZXN1bHQuZXJyb3JzLmxlbmd0aCArIGFSZXN1bHQud2FybmluZ3MubGVuZ3RoO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gY291bnQ7XG4gICAgfSwgMCkgPiAwKSA/IHJlc3VsdHMgOiB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbnZhciBnZXRFcnJvckNvdW50ID0gbW9kdWxlLmV4cG9ydHMuZ2V0RXJyb3JDb3VudCA9IGZ1bmN0aW9uIGdldEVycm9yQ291bnQgKHJlc3VsdHMpIHtcbiAgdmFyIGVycm9ycyA9IDA7XG5cbiAgaWYgKHJlc3VsdHMpIHtcbiAgICBlcnJvcnMgPSByZXN1bHRzLmVycm9ycy5sZW5ndGg7XG5cbiAgICBfLmVhY2gocmVzdWx0cy5hcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChhZFJlc3VsdHMpIHtcbiAgICAgIGlmIChhZFJlc3VsdHMpIHtcbiAgICAgICAgZXJyb3JzICs9IGFkUmVzdWx0cy5lcnJvcnMubGVuZ3RoO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGVycm9ycztcbn07XG5cbnZhciBjb2VyY2VWZXJzaW9uID0gZnVuY3Rpb24gY29lcmNlVmVyc2lvbiAodmVyc2lvbikge1xuICAvLyBDb252ZXJ0IHRoZSB2ZXJzaW9uIHRvIGEgbnVtYmVyIChSZXF1aXJlZCBmb3IgaGVscGVycy5nZXRTcGVjKVxuICBpZiAodmVyc2lvbiAmJiAhXy5pc1N0cmluZyh2ZXJzaW9uKSkge1xuICAgIHZlcnNpb24gPSB2ZXJzaW9uLnRvU3RyaW5nKCk7XG5cbiAgICAvLyBIYW5kbGUgcm91bmRpbmcgaXNzdWVzIChPbmx5IHJlcXVpcmVkIGZvciB3aGVuIFN3YWdnZXIgdmVyc2lvbiBlbmRzIGluICcuMCcpXG4gICAgaWYgKHZlcnNpb24uaW5kZXhPZignLicpID09PSAtMSkge1xuICAgICAgdmVyc2lvbiArPSAnLjAnO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB2ZXJzaW9uO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBwcm9wZXIgc3BlY2lmaWNhdGlvbiBiYXNlZCBvbiB0aGUgaHVtYW4gcmVhZGFibGUgdmVyc2lvbi5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvbiAtIFRoZSBodW1hbiByZWFkYWJsZSBTd2FnZ2VyIHZlcnNpb24gKEV4OiAxLjIpXG4gKiBAcGFyYW0ge1tib29sZWFuPWZhbHNlXX0gdGhyb3dFcnJvciAtIFRocm93IGFuIGVycm9yIGlmIHRoZSB2ZXJzaW9uIGNvdWxkIG5vdCBiZSBpZGVudGlmaWVkXG4gKlxuICogQHJldHVybnMgdGhlIGNvcnJlc3BvbmRpbmcgU3dhZ2dlciBTcGVjaWZpY2F0aW9uIG9iamVjdCBvciB1bmRlZmluZWQgaWYgdGhlcmUgaXMgbm9uZVxuICovXG5tb2R1bGUuZXhwb3J0cy5nZXRTcGVjID0gZnVuY3Rpb24gZ2V0U3BlYyAodmVyc2lvbiwgdGhyb3dFcnJvcikge1xuICB2YXIgc3BlYztcblxuICB2ZXJzaW9uID0gY29lcmNlVmVyc2lvbih2ZXJzaW9uKTtcbiAgc3BlYyA9IHNwZWNDYWNoZVt2ZXJzaW9uXTtcblxuICBpZiAoXy5pc1VuZGVmaW5lZChzcGVjKSkge1xuICAgIHN3aXRjaCAodmVyc2lvbikge1xuICAgIGNhc2UgJzEuMic6XG4gICAgICBzcGVjID0gcmVxdWlyZSgnLi4vbGliL3NwZWNzJykudjFfMjsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG5cbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAnMi4wJzpcbiAgICAgIHNwZWMgPSByZXF1aXJlKCcuLi9saWIvc3BlY3MnKS52Ml8wOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcblxuICAgICAgYnJlYWs7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgaWYgKHRocm93RXJyb3IgPT09IHRydWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBTd2FnZ2VyIHZlcnNpb246ICcgKyB2ZXJzaW9uKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gc3BlYztcbn07XG5cbi8qKlxuICogQXRlbXB0cyB0byBmaWd1cmUgb3V0IHRoZSBTd2FnZ2VyIHZlcnNpb24gZnJvbSB0aGUgU3dhZ2dlciBkb2N1bWVudC5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gZG9jdW1lbnQgLSBUaGUgU3dhZ2dlciBkb2N1bWVudFxuICpcbiAqIEByZXR1cm5zIHRoZSBTd2FnZ2VyIHZlcnNpb24gb3IgdW5kZWZpbmVkIGlmIHRoZSBkb2N1bWVudCBpcyBub3QgYSBTd2FnZ2VyIGRvY3VtZW50XG4gKi9cbm1vZHVsZS5leHBvcnRzLmdldFN3YWdnZXJWZXJzaW9uID0gZnVuY3Rpb24gZ2V0U3dhZ2dlclZlcnNpb24gKGRvY3VtZW50KSB7XG4gIHJldHVybiBfLmlzUGxhaW5PYmplY3QoZG9jdW1lbnQpID8gY29lcmNlVmVyc2lvbihkb2N1bWVudC5zd2FnZ2VyVmVyc2lvbiB8fCBkb2N1bWVudC5zd2FnZ2VyKSA6IHVuZGVmaW5lZDtcbn07XG5cbm1vZHVsZS5leHBvcnRzLnByaW50VmFsaWRhdGlvblJlc3VsdHMgPSBmdW5jdGlvbiBwcmludFZhbGlkYXRpb25SZXN1bHRzICh2ZXJzaW9uLCBhcGlET3JTTywgYXBpRGVjbGFyYXRpb25zLCByZXN1bHRzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByaW50U3VtbWFyeSkge1xuICB2YXIgaGFzRXJyb3JzID0gZ2V0RXJyb3JDb3VudChyZXN1bHRzKSA+IDA7XG4gIHZhciBzdHJlYW0gPSBoYXNFcnJvcnMgPyBjb25zb2xlLmVycm9yIDogY29uc29sZS5sb2c7XG4gIHZhciBwbHVyYWxpemUgPSBmdW5jdGlvbiBwbHVyYWxpemUgKHN0cmluZywgY291bnQpIHtcbiAgICByZXR1cm4gY291bnQgPT09IDEgPyBzdHJpbmcgOiBzdHJpbmcgKyAncyc7XG4gIH07XG4gIHZhciBwcmludEVycm9yc09yV2FybmluZ3MgPSBmdW5jdGlvbiBwcmludEVycm9yc09yV2FybmluZ3MgKGhlYWRlciwgZW50cmllcywgaW5kZW50KSB7XG4gICAgaWYgKGhlYWRlcikge1xuICAgICAgc3RyZWFtKGhlYWRlciArICc6Jyk7XG4gICAgICBzdHJlYW0oKTtcbiAgICB9XG5cbiAgICBfLmVhY2goZW50cmllcywgZnVuY3Rpb24gKGVudHJ5KSB7XG4gICAgICBzdHJlYW0obmV3IEFycmF5KGluZGVudCArIDEpLmpvaW4oJyAnKSArIEpzb25SZWZzLnBhdGhUb1BvaW50ZXIoZW50cnkucGF0aCkgKyAnOiAnICsgZW50cnkubWVzc2FnZSk7XG5cbiAgICAgIGlmIChlbnRyeS5pbm5lcikge1xuICAgICAgICBwcmludEVycm9yc09yV2FybmluZ3MgKHVuZGVmaW5lZCwgZW50cnkuaW5uZXIsIGluZGVudCArIDIpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKGhlYWRlcikge1xuICAgICAgc3RyZWFtKCk7XG4gICAgfVxuICB9O1xuICB2YXIgZXJyb3JDb3VudCA9IDA7XG4gIHZhciB3YXJuaW5nQ291bnQgPSAwO1xuXG4gIHN0cmVhbSgpO1xuXG4gIGlmIChyZXN1bHRzLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgZXJyb3JDb3VudCArPSByZXN1bHRzLmVycm9ycy5sZW5ndGg7XG5cbiAgICBwcmludEVycm9yc09yV2FybmluZ3MoJ0FQSSBFcnJvcnMnLCByZXN1bHRzLmVycm9ycywgMik7XG4gIH1cblxuICBpZiAocmVzdWx0cy53YXJuaW5ncy5sZW5ndGggPiAwKSB7XG4gICAgd2FybmluZ0NvdW50ICs9IHJlc3VsdHMud2FybmluZ3MubGVuZ3RoO1xuXG4gICAgcHJpbnRFcnJvcnNPcldhcm5pbmdzKCdBUEkgV2FybmluZ3MnLCByZXN1bHRzLndhcm5pbmdzLCAyKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLmFwaURlY2xhcmF0aW9ucykge1xuICAgIHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zLmZvckVhY2goZnVuY3Rpb24gKGFkUmVzdWx0LCBpbmRleCkge1xuICAgICAgaWYgKCFhZFJlc3VsdCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHZhciBuYW1lID0gYXBpRGVjbGFyYXRpb25zW2luZGV4XS5yZXNvdXJjZVBhdGggfHwgaW5kZXg7XG5cbiAgICAgIGlmIChhZFJlc3VsdC5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBlcnJvckNvdW50ICs9IGFkUmVzdWx0LmVycm9ycy5sZW5ndGg7XG5cbiAgICAgICAgcHJpbnRFcnJvcnNPcldhcm5pbmdzKCcgIEFQSSBEZWNsYXJhdGlvbiAoJyArIG5hbWUgKyAnKSBFcnJvcnMnLCBhZFJlc3VsdC5lcnJvcnMsIDQpO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWRSZXN1bHQud2FybmluZ3MubGVuZ3RoID4gMCkge1xuICAgICAgICB3YXJuaW5nQ291bnQgKz0gYWRSZXN1bHQud2FybmluZ3MubGVuZ3RoO1xuXG4gICAgICAgIHByaW50RXJyb3JzT3JXYXJuaW5ncygnICBBUEkgRGVjbGFyYXRpb24gKCcgKyBuYW1lICsgJykgV2FybmluZ3MnLCBhZFJlc3VsdC53YXJuaW5ncywgNCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBpZiAocHJpbnRTdW1tYXJ5KSB7XG4gICAgaWYgKGVycm9yQ291bnQgPiAwKSB7XG4gICAgICBzdHJlYW0oZXJyb3JDb3VudCArICcgJyArIHBsdXJhbGl6ZSgnZXJyb3InLCBlcnJvckNvdW50KSArICcgYW5kICcgKyB3YXJuaW5nQ291bnQgKyAnICcgK1xuICAgICAgICAgICAgICAgICAgICBwbHVyYWxpemUoJ3dhcm5pbmcnLCB3YXJuaW5nQ291bnQpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyZWFtKCdWYWxpZGF0aW9uIHN1Y2NlZWRlZCBidXQgd2l0aCAnICsgd2FybmluZ0NvdW50ICsgJyAnICsgcGx1cmFsaXplKCd3YXJuaW5nJywgd2FybmluZ0NvdW50KSk7XG4gICAgfVxuICB9XG5cbiAgc3RyZWFtKCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5zd2FnZ2VyT3BlcmF0aW9uTWV0aG9kcyA9IFtcbiAgJ0RFTEVURScsXG4gICdHRVQnLFxuICAnSEVBRCcsXG4gICdPUFRJT05TJyxcbiAgJ1BBVENIJyxcbiAgJ1BPU1QnLFxuICAnUFVUJ1xuXTtcbiIsIi8qXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgQXBpZ2VlIENvcnBvcmF0aW9uXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG4gKiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cbiAqIFRIRSBTT0ZUV0FSRS5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfID0gKHdpbmRvdy5fKTtcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG5cbi8vIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzMzMzkjc2VjdGlvbi01LjZcbnZhciBkYXRlUmVnRXhwID0gL14oWzAtOV17NH0pLShbMC05XXsyfSktKFswLTldezJ9KSQvO1xuLy8gaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzMzOSNzZWN0aW9uLTUuNlxudmFyIGRhdGVUaW1lUmVnRXhwID0gL14oWzAtOV17Mn0pOihbMC05XXsyfSk6KFswLTldezJ9KSguWzAtOV0rKT8oenwoWystXVswLTldezJ9OlswLTldezJ9KSkkLztcbnZhciBpc1ZhbGlkRGF0ZSA9IGZ1bmN0aW9uIGlzVmFsaWREYXRlIChkYXRlKSB7XG4gIHZhciBkYXk7XG4gIHZhciBtYXRjaGVzO1xuICB2YXIgbW9udGg7XG5cbiAgaWYgKCFfLmlzU3RyaW5nKGRhdGUpKSB7XG4gICAgZGF0ZSA9IGRhdGUudG9TdHJpbmcoKTtcbiAgfVxuXG4gIG1hdGNoZXMgPSBkYXRlUmVnRXhwLmV4ZWMoZGF0ZSk7XG5cbiAgaWYgKG1hdGNoZXMgPT09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBkYXkgPSBtYXRjaGVzWzNdO1xuICBtb250aCA9IG1hdGNoZXNbMl07XG5cbiAgaWYgKG1vbnRoIDwgJzAxJyB8fCBtb250aCA+ICcxMicgfHwgZGF5IDwgJzAxJyB8fCBkYXkgPiAnMzEnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xudmFyIGlzVmFsaWREYXRlVGltZSA9IGZ1bmN0aW9uIGlzVmFsaWREYXRlVGltZSAoZGF0ZVRpbWUpIHtcbiAgdmFyIGhvdXI7XG4gIHZhciBkYXRlO1xuICB2YXIgdGltZTtcbiAgdmFyIG1hdGNoZXM7XG4gIHZhciBtaW51dGU7XG4gIHZhciBwYXJ0cztcbiAgdmFyIHNlY29uZDtcblxuICBpZiAoIV8uaXNTdHJpbmcoZGF0ZVRpbWUpKSB7XG4gICAgZGF0ZVRpbWUgPSBkYXRlVGltZS50b1N0cmluZygpO1xuICB9XG5cbiAgcGFydHMgPSBkYXRlVGltZS50b0xvd2VyQ2FzZSgpLnNwbGl0KCd0Jyk7XG4gIGRhdGUgPSBwYXJ0c1swXTtcbiAgdGltZSA9IHBhcnRzLmxlbmd0aCA+IDEgPyBwYXJ0c1sxXSA6IHVuZGVmaW5lZDtcblxuICBpZiAoIWlzVmFsaWREYXRlKGRhdGUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgbWF0Y2hlcyA9IGRhdGVUaW1lUmVnRXhwLmV4ZWModGltZSk7XG5cbiAgaWYgKG1hdGNoZXMgPT09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBob3VyID0gbWF0Y2hlc1sxXTtcbiAgbWludXRlID0gbWF0Y2hlc1syXTtcbiAgc2Vjb25kID0gbWF0Y2hlc1szXTtcblxuICBpZiAoaG91ciA+ICcyMycgfHwgbWludXRlID4gJzU5JyB8fCBzZWNvbmQgPiAnNTknKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG52YXIgdGhyb3dFcnJvcldpdGhDb2RlID0gZnVuY3Rpb24gdGhyb3dFcnJvcldpdGhDb2RlIChjb2RlLCBtc2cpIHtcbiAgdmFyIGVyciA9IG5ldyBFcnJvcihtc2cpO1xuXG4gIGVyci5jb2RlID0gY29kZTtcbiAgZXJyLmZhaWxlZFZhbGlkYXRpb24gPSB0cnVlO1xuXG4gIHRocm93IGVycjtcbn07XG5cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlQWdhaW5zdFNjaGVtYSA9IGZ1bmN0aW9uIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSAoc2NoZW1hT3JOYW1lLCBkYXRhLCB2YWxpZGF0b3IpIHtcbiAgdmFyIHJlbW92ZVBhcmFtcyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICBkZWxldGUgb2JqLnBhcmFtcztcblxuICAgIGlmIChvYmouaW5uZXIpIHtcbiAgICAgIF8uZWFjaChvYmouaW5uZXIsIGZ1bmN0aW9uIChuT2JqKSB7XG4gICAgICAgIHJlbW92ZVBhcmFtcyhuT2JqKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbiAgdmFyIHNjaGVtYSA9IF8uaXNQbGFpbk9iamVjdChzY2hlbWFPck5hbWUpID8gXy5jbG9uZURlZXAoc2NoZW1hT3JOYW1lKSA6IHNjaGVtYU9yTmFtZTtcblxuICAvLyBXZSBkb24ndCBjaGVjayB0aGlzIGR1ZSB0byBpbnRlcm5hbCB1c2FnZSBidXQgaWYgdmFsaWRhdG9yIGlzIG5vdCBwcm92aWRlZCwgc2NoZW1hT3JOYW1lIG11c3QgYmUgYSBzY2hlbWFcbiAgaWYgKF8uaXNVbmRlZmluZWQodmFsaWRhdG9yKSkge1xuICAgIHZhbGlkYXRvciA9IGhlbHBlcnMuY3JlYXRlSnNvblZhbGlkYXRvcihbc2NoZW1hXSk7XG4gIH1cblxuICB2YXIgdmFsaWQgPSB2YWxpZGF0b3IudmFsaWRhdGUoZGF0YSwgc2NoZW1hKTtcblxuICBpZiAoIXZhbGlkKSB7XG4gICAgdHJ5IHtcbiAgICAgIHRocm93RXJyb3JXaXRoQ29kZSgnU0NIRU1BX1ZBTElEQVRJT05fRkFJTEVEJywgJ0ZhaWxlZCBzY2hlbWEgdmFsaWRhdGlvbicpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgZXJyLnJlc3VsdHMgPSB7XG4gICAgICAgIGVycm9yczogXy5tYXAodmFsaWRhdG9yLmdldExhc3RFcnJvcnMoKSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgIHJlbW92ZVBhcmFtcyhlcnIpO1xuXG4gICAgICAgICAgcmV0dXJuIGVycjtcbiAgICAgICAgfSksXG4gICAgICAgIHdhcm5pbmdzOiBbXVxuICAgICAgfTtcblxuICAgICAgdGhyb3cgZXJyO1xuICAgIH1cbiAgfVxufTtcblxuXG4vKipcbiAqIFZhbGlkYXRlcyBhIHNjaGVtYSBvZiB0eXBlIGFycmF5IGlzIHByb3Blcmx5IGZvcm1lZCAod2hlbiBuZWNlc3NhcikuXG4gKlxuICogKnBhcmFtIHtvYmplY3R9IHNjaGVtYSAtIFRoZSBzY2hlbWEgb2JqZWN0IHRvIHZhbGlkYXRlXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgc2NoZW1hIHNheXMgaXQncyBhbiBhcnJheSBidXQgaXQgaXMgbm90IGZvcm1lZCBwcm9wZXJseVxuICpcbiAqIEBzZWUge0BsaW5rIGh0dHBzOi8vZ2l0aHViLmNvbS9zd2FnZ2VyLWFwaS9zd2FnZ2VyLXNwZWMvaXNzdWVzLzE3NH1cbiAqL1xudmFyIHZhbGlkYXRlQXJyYXlUeXBlID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVBcnJheVR5cGUgPSBmdW5jdGlvbiB2YWxpZGF0ZUFycmF5VHlwZSAoc2NoZW1hKSB7XG4gIC8vIFdlIGhhdmUgdG8gZG8gdGhpcyBtYW51YWxseSBmb3Igbm93XG4gIGlmIChzY2hlbWEudHlwZSA9PT0gJ2FycmF5JyAmJiBfLmlzVW5kZWZpbmVkKHNjaGVtYS5pdGVtcykpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ09CSkVDVF9NSVNTSU5HX1JFUVVJUkVEX1BST1BFUlRZJywgJ01pc3NpbmcgcmVxdWlyZWQgcHJvcGVydHk6IGl0ZW1zJyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IG9yIHJlc3BvbnNlIGNvbnRlbnQgdHlwZSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nW119IGdQT3JDIC0gVGhlIHZhbGlkIGNvbnN1bWVzIGF0IHRoZSBBUEkgc2NvcGVcbiAqIEBwYXJhbSB7c3RyaW5nW119IG9QT3JDIC0gVGhlIHZhbGlkIGNvbnN1bWVzIGF0IHRoZSBvcGVyYXRpb24gc2NvcGVcbiAqIEBwYXJhbSB7b2JqZWN0fSByZXFPclJlcyAtIFRoZSByZXF1ZXN0IG9yIHJlc3BvbnNlXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgY29udGVudCB0eXBlIGlzIGludmFsaWRcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVDb250ZW50VHlwZSA9IGZ1bmN0aW9uIHZhbGlkYXRlQ29udGVudFR5cGUgKGdQT3JDLCBvUE9yQywgcmVxT3JSZXMpIHtcbiAgLy8gaHR0cDovL3d3dy53My5vcmcvUHJvdG9jb2xzL3JmYzI2MTYvcmZjMjYxNi1zZWM3Lmh0bWwjc2VjNy4yLjFcbiAgdmFyIGlzUmVzcG9uc2UgPSB0eXBlb2YgcmVxT3JSZXMuZW5kID09PSAnZnVuY3Rpb24nO1xuICB2YXIgY29udGVudFR5cGUgPSBpc1Jlc3BvbnNlID8gcmVxT3JSZXMuZ2V0SGVhZGVyKCdjb250ZW50LXR5cGUnKSA6IHJlcU9yUmVzLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddO1xuICB2YXIgcE9yQyA9IF8udW5pb24oZ1BPckMsIG9QT3JDKTtcblxuICBpZiAoIWNvbnRlbnRUeXBlKSB7XG4gICAgaWYgKGlzUmVzcG9uc2UpIHtcbiAgICAgIGNvbnRlbnRUeXBlID0gJ3RleHQvcGxhaW4nO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb250ZW50VHlwZSA9ICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nO1xuICAgIH1cbiAgfVxuXG4gIC8vIEdldCBvbmx5IHRoZSBjb250ZW50IHR5cGVcbiAgY29udGVudFR5cGUgPSBjb250ZW50VHlwZS5zcGxpdCgnOycpWzBdO1xuXG4gIGlmIChwT3JDLmxlbmd0aCA+IDAgJiYgKGlzUmVzcG9uc2UgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICB0cnVlIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgWydQT1NUJywgJ1BVVCddLmluZGV4T2YocmVxT3JSZXMubWV0aG9kKSAhPT0gLTEpICYmIHBPckMuaW5kZXhPZihjb250ZW50VHlwZSkgPT09IC0xKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbnRlbnQgdHlwZSAoJyArIGNvbnRlbnRUeXBlICsgJykuICBUaGVzZSBhcmUgdmFsaWQ6ICcgKyBwT3JDLmpvaW4oJywgJykpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgYWdhaW5zdCB0aGUgYWxsb3dhYmxlIHZhbHVlcyAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmdbXX0gYWxsb3dlZCAtIFRoZSBhbGxvd2FibGUgdmFsdWVzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbm90IGFsbG93YWJsZVxuICovXG52YXIgdmFsaWRhdGVFbnVtID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVFbnVtID0gZnVuY3Rpb24gdmFsaWRhdGVFbnVtICh2YWwsIGFsbG93ZWQpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGFsbG93ZWQpICYmICFfLmlzVW5kZWZpbmVkKHZhbCkgJiYgYWxsb3dlZC5pbmRleE9mKHZhbCkgPT09IC0xKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdFTlVNX01JU01BVENIJywgJ05vdCBhbiBhbGxvd2FibGUgdmFsdWUgKCcgKyBhbGxvd2VkLmpvaW4oJywgJykgKyAnKTogJyArIHZhbCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSBtYXhpbXVtIC0gVGhlIG1heGltdW0gdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2V4Y2x1c2l2ZT1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0aGUgdmFsdWUgaW5jbHVkZXMgdGhlIG1heGltdW0gaW4gaXRzIGNvbXBhcmlzb25cbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBncmVhdGVyIHRoYW4gdGhlIG1heGltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWF4aW11bSA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWF4aW11bSA9IGZ1bmN0aW9uIHZhbGlkYXRlTWF4aW11bSAodmFsLCBtYXhpbXVtLCB0eXBlLCBleGNsdXNpdmUpIHtcbiAgdmFyIGNvZGUgPSBleGNsdXNpdmUgPT09IHRydWUgPyAnTUFYSU1VTV9FWENMVVNJVkUnIDogJ01BWElNVU0nO1xuICB2YXIgdGVzdE1heDtcbiAgdmFyIHRlc3RWYWw7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZXhjbHVzaXZlKSkge1xuICAgIGV4Y2x1c2l2ZSA9IGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGUgPT09ICdpbnRlZ2VyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUludCh2YWwsIDEwKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUZsb2F0KHZhbCk7XG4gIH1cblxuICBpZiAoIV8uaXNVbmRlZmluZWQobWF4aW11bSkpIHtcbiAgICB0ZXN0TWF4ID0gcGFyc2VGbG9hdChtYXhpbXVtKTtcblxuICAgIGlmIChleGNsdXNpdmUgJiYgdGVzdFZhbCA+PSB0ZXN0TWF4KSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoY29kZSwgJ0dyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byB0aGUgY29uZmlndXJlZCBtYXhpbXVtICgnICsgbWF4aW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9IGVsc2UgaWYgKHRlc3RWYWwgPiB0ZXN0TWF4KSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoY29kZSwgJ0dyZWF0ZXIgdGhhbiB0aGUgY29uZmlndXJlZCBtYXhpbXVtICgnICsgbWF4aW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSBhcnJheSBjb3VudCBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1heEl0ZW1zIC0gVGhlIG1heGltdW0gbnVtYmVyIG9mIGl0ZW1zXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgY29udGFpbnMgbW9yZSBpdGVtcyB0aGFuIGFsbG93YWJsZVxuICovXG52YXIgdmFsaWRhdGVNYXhJdGVtcyA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWF4SXRlbXMgPSBmdW5jdGlvbiB2YWxpZGF0ZU1heEl0ZW1zICh2YWwsIG1heEl0ZW1zKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChtYXhJdGVtcykgJiYgdmFsLmxlbmd0aCA+IG1heEl0ZW1zKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdBUlJBWV9MRU5HVEhfTE9ORycsICdBcnJheSBpcyB0b28gbG9uZyAoJyArIHZhbC5sZW5ndGggKyAnKSwgbWF4aW11bSAnICsgbWF4SXRlbXMpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgbGVuZ3RoIGlzIGxlc3MgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWF4TGVuZ3RoIC0gVGhlIG1heGltdW0gbGVuZ3RoXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUncyBsZW5ndGggaXMgZ3JlYXRlciB0aGFuIHRoZSBtYXhpbXVtXG4gKi9cbnZhciB2YWxpZGF0ZU1heExlbmd0aCA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWF4TGVuZ3RoID0gZnVuY3Rpb24gdmFsaWRhdGVNYXhMZW5ndGggKHZhbCwgbWF4TGVuZ3RoKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChtYXhMZW5ndGgpICYmIHZhbC5sZW5ndGggPiBtYXhMZW5ndGgpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ01BWF9MRU5HVEgnLCAnU3RyaW5nIGlzIHRvbyBsb25nICgnICsgdmFsLmxlbmd0aCArICcgY2hhcnMpLCBtYXhpbXVtICcgKyBtYXhMZW5ndGgpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUncyBwcm9wZXJ0eSBjb3VudCBpcyBncmVhdGVyIHRoYW4gdGhlIG1heGltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pblByb3BlcnRpZXMgLSBUaGUgbWF4aW11bSBudW1iZXIgb2YgcHJvcGVydGllc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlJ3MgcHJvcGVydHkgY291bnQgaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtXG4gKi9cbnZhciB2YWxpZGF0ZU1heFByb3BlcnRpZXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1heFByb3BlcnRpZXMgPSBmdW5jdGlvbiB2YWxpZGF0ZU1heExlbmd0aCAodmFsLCBtYXhQcm9wZXJ0aWVzKSB7XG4gIHZhciBwcm9wQ291bnQgPSBfLmlzUGxhaW5PYmplY3QodmFsKSA/IE9iamVjdC5rZXlzKHZhbCkubGVuZ3RoIDogMDtcblxuICBpZiAoIV8uaXNVbmRlZmluZWQobWF4UHJvcGVydGllcykgJiYgcHJvcENvdW50ID4gbWF4UHJvcGVydGllcykge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnTUFYX1BST1BFUlRJRVMnLFxuICAgICAgICAgICAgICAgICAgICAgICAnTnVtYmVyIG9mIHByb3BlcnRpZXMgaXMgdG9vIG1hbnkgKCcgKyBwcm9wQ291bnQgKyAnIHByb3BlcnRpZXMpLCBtYXhpbXVtICcgKyBtYXhQcm9wZXJ0aWVzKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGFycmF5IGNvdW50IGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWluaW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmd9IG1pbmltdW0gLSBUaGUgbWluaW11bSB2YWx1ZVxuICogQHBhcmFtIHtib29sZWFufSBbZXhjbHVzaXZlPWZhbHNlXSAtIFdoZXRoZXIgb3Igbm90IHRoZSB2YWx1ZSBpbmNsdWRlcyB0aGUgbWluaW11bSBpbiBpdHMgY29tcGFyaXNvblxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIGxlc3MgdGhhbiB0aGUgbWluaW11bVxuICovXG52YXIgdmFsaWRhdGVNaW5pbXVtID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5pbXVtID0gZnVuY3Rpb24gdmFsaWRhdGVNaW5pbXVtICh2YWwsIG1pbmltdW0sIHR5cGUsIGV4Y2x1c2l2ZSkge1xuICB2YXIgY29kZSA9IGV4Y2x1c2l2ZSA9PT0gdHJ1ZSA/ICdNSU5JTVVNX0VYQ0xVU0lWRScgOiAnTUlOSU1VTSc7XG4gIHZhciB0ZXN0TWluO1xuICB2YXIgdGVzdFZhbDtcblxuICBpZiAoXy5pc1VuZGVmaW5lZChleGNsdXNpdmUpKSB7XG4gICAgZXhjbHVzaXZlID0gZmFsc2U7XG4gIH1cblxuICBpZiAodHlwZSA9PT0gJ2ludGVnZXInKSB7XG4gICAgdGVzdFZhbCA9IHBhcnNlSW50KHZhbCwgMTApO1xuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInKSB7XG4gICAgdGVzdFZhbCA9IHBhcnNlRmxvYXQodmFsKTtcbiAgfVxuXG4gIGlmICghXy5pc1VuZGVmaW5lZChtaW5pbXVtKSkge1xuICAgIHRlc3RNaW4gPSBwYXJzZUZsb2F0KG1pbmltdW0pO1xuXG4gICAgaWYgKGV4Y2x1c2l2ZSAmJiB0ZXN0VmFsIDw9IHRlc3RNaW4pIHtcbiAgICAgIHRocm93RXJyb3JXaXRoQ29kZShjb2RlLCAnTGVzcyB0aGFuIG9yIGVxdWFsIHRvIHRoZSBjb25maWd1cmVkIG1pbmltdW0gKCcgKyBtaW5pbXVtICsgJyk6ICcgKyB2YWwpO1xuICAgIH0gZWxzZSBpZiAodGVzdFZhbCA8IHRlc3RNaW4pIHtcbiAgICAgIHRocm93RXJyb3JXaXRoQ29kZShjb2RlLCAnTGVzcyB0aGFuIHRoZSBjb25maWd1cmVkIG1pbmltdW0gKCcgKyBtaW5pbXVtICsgJyk6ICcgKyB2YWwpO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIHZhbHVlIGNvbnRhaW5zIGZld2VyIGl0ZW1zIHRoYW4gYWxsb3dlZCAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWluSXRlbXMgLSBUaGUgbWluaW11bSBudW1iZXIgb2YgaXRlbXNcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93YWJsZVxuICovXG52YXIgdmFsaWRhdGVNaW5JdGVtcyA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWluSXRlbXMgPSBmdW5jdGlvbiB2YWxpZGF0ZU1pbkl0ZW1zICh2YWwsIG1pbkl0ZW1zKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChtaW5JdGVtcykgJiYgdmFsLmxlbmd0aCA8IG1pbkl0ZW1zKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdBUlJBWV9MRU5HVEhfU0hPUlQnLCAnQXJyYXkgaXMgdG9vIHNob3J0ICgnICsgdmFsLmxlbmd0aCArICcpLCBtaW5pbXVtICcgKyBtaW5JdGVtcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBsZW5ndGggaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5MZW5ndGggLSBUaGUgbWluaW11bSBsZW5ndGhcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSdzIGxlbmd0aCBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWluTGVuZ3RoID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5MZW5ndGggPSBmdW5jdGlvbiB2YWxpZGF0ZU1pbkxlbmd0aCAodmFsLCBtaW5MZW5ndGgpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbkxlbmd0aCkgJiYgdmFsLmxlbmd0aCA8IG1pbkxlbmd0aCkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnTUlOX0xFTkdUSCcsICdTdHJpbmcgaXMgdG9vIHNob3J0ICgnICsgdmFsLmxlbmd0aCArICcgY2hhcnMpLCBtaW5pbXVtICcgKyBtaW5MZW5ndGgpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUncyBwcm9wZXJ0eSBjb3VudCBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIG1pbmltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pblByb3BlcnRpZXMgLSBUaGUgbWluaW11bSBudW1iZXIgb2YgcHJvcGVydGllc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlJ3MgcHJvcGVydHkgY291bnQgaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtXG4gKi9cbnZhciB2YWxpZGF0ZU1pblByb3BlcnRpZXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pblByb3BlcnRpZXMgPSBmdW5jdGlvbiB2YWxpZGF0ZU1pbkxlbmd0aCAodmFsLCBtaW5Qcm9wZXJ0aWVzKSB7XG4gIHZhciBwcm9wQ291bnQgPSBfLmlzUGxhaW5PYmplY3QodmFsKSA/IE9iamVjdC5rZXlzKHZhbCkubGVuZ3RoIDogMDtcblxuICBpZiAoIV8uaXNVbmRlZmluZWQobWluUHJvcGVydGllcykgJiYgcHJvcENvdW50IDwgbWluUHJvcGVydGllcykge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnTUlOX1BST1BFUlRJRVMnLFxuICAgICAgICAgICAgICAgICAgICAgICAnTnVtYmVyIG9mIHByb3BlcnRpZXMgaXMgdG9vIGZldyAoJyArIHByb3BDb3VudCArICcgcHJvcGVydGllcyksIG1pbmltdW0gJyArIG1pblByb3BlcnRpZXMpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgaXMgYSBtdWx0aXBsZSBvZiB0aGUgcHJvdmlkZWQgbnVtYmVyICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtdWx0aXBsZU9mIC0gVGhlIG51bWJlciB0aGF0IHNob3VsZCBkaXZpZGUgZXZlbmx5IGludG8gdGhlIHZhbHVlXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgY29udGFpbnMgZmV3ZXIgaXRlbXMgdGhhbiBhbGxvd2FibGVcbiAqL1xudmFyIHZhbGlkYXRlTXVsdGlwbGVPZiA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTXVsdGlwbGVPZiA9IGZ1bmN0aW9uIHZhbGlkYXRlTXVsdGlwbGVPZiAodmFsLCBtdWx0aXBsZU9mKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChtdWx0aXBsZU9mKSAmJiB2YWwgJSBtdWx0aXBsZU9mICE9PSAwKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNVUxUSVBMRV9PRicsICdOb3QgYSBtdWx0aXBsZSBvZiAnICsgbXVsdGlwbGVPZik7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBtYXRjaGVzIGEgcGF0dGVybiAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSBwYXR0ZXJuIC0gVGhlIHBhdHRlcm5cbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBkb2VzIG5vdCBtYXRjaCB0aGUgcGF0dGVyblxuICovXG52YXIgdmFsaWRhdGVQYXR0ZXJuID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVQYXR0ZXJuID0gZnVuY3Rpb24gdmFsaWRhdGVQYXR0ZXJuICh2YWwsIHBhdHRlcm4pIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKHBhdHRlcm4pICYmIF8uaXNOdWxsKHZhbC5tYXRjaChuZXcgUmVnRXhwKHBhdHRlcm4pKSkpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ1BBVFRFUk4nLCAnRG9lcyBub3QgbWF0Y2ggcmVxdWlyZWQgcGF0dGVybjogJyArIHBhdHRlcm4pO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgcmVxdWlyZWRuZXNzICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IHJlcXVpcmVkIC0gV2hldGhlciBvciBub3QgdGhlIHBhcmFtZXRlciBpcyByZXF1aXJlZFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIHJlcXVpcmVkIGJ1dCBpcyBub3QgcHJlc2VudFxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVJlcXVpcmVkbmVzcyA9IGZ1bmN0aW9uIHZhbGlkYXRlUmVxdWlyZWRuZXNzICh2YWwsIHJlcXVpcmVkKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChyZXF1aXJlZCkgJiYgcmVxdWlyZWQgPT09IHRydWUgJiYgXy5pc1VuZGVmaW5lZCh2YWwpKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdSRVFVSVJFRCcsICdJcyByZXF1aXJlZCcpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgdHlwZSBhbmQgZm9ybWF0ICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gdHlwZSAtIFRoZSBwYXJhbWV0ZXIgdHlwZVxuICogQHBhcmFtIHtzdHJpbmd9IGZvcm1hdCAtIFRoZSBwYXJhbWV0ZXIgZm9ybWF0XG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtza2lwRXJyb3I9ZmFsc2VdIC0gV2hldGhlciBvciBub3QgdG8gc2tpcCB0aHJvd2luZyBhbiBlcnJvciAoVXNlZnVsIGZvciB2YWxpZGF0aW5nIGFycmF5cylcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBub3QgdGhlIHByb3BlciB0eXBlIG9yIGZvcm1hdFxuICovXG52YXIgdmFsaWRhdGVUeXBlQW5kRm9ybWF0ID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVUeXBlQW5kRm9ybWF0ID1cbiAgZnVuY3Rpb24gdmFsaWRhdGVUeXBlQW5kRm9ybWF0ICh2YWwsIHR5cGUsIGZvcm1hdCwgc2tpcEVycm9yKSB7XG4gICAgdmFyIHJlc3VsdCA9IHRydWU7XG5cbiAgICBpZiAoXy5pc0FycmF5KHZhbCkpIHtcbiAgICAgIF8uZWFjaCh2YWwsIGZ1bmN0aW9uIChhVmFsLCBpbmRleCkge1xuICAgICAgICBpZiAoIXZhbGlkYXRlVHlwZUFuZEZvcm1hdChhVmFsLCB0eXBlLCBmb3JtYXQsIHRydWUpKSB7XG4gICAgICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKCdJTlZBTElEX1RZUEUnLCAnVmFsdWUgYXQgaW5kZXggJyArIGluZGV4ICsgJyBpcyBub3QgYSB2YWxpZCAnICsgdHlwZSArICc6ICcgKyBhVmFsKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgIHJlc3VsdCA9IF8uaXNCb29sZWFuKHZhbCkgfHwgWydmYWxzZScsICd0cnVlJ10uaW5kZXhPZih2YWwpICE9PSAtMTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbnRlZ2VyJzpcbiAgICAgICAgcmVzdWx0ID0gXy5pc0Zpbml0ZShOdW1iZXIodmFsKSkgJiYgIV8uaXNOYU4ocGFyc2VJbnQodmFsLCAxMCkpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ251bWJlcic6XG4gICAgICAgIHJlc3VsdCA9IF8uaXNGaW5pdGUoTnVtYmVyKHZhbCkpICYmICFfLmlzTmFOKHBhcnNlRmxvYXQodmFsKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKGZvcm1hdCkpIHtcbiAgICAgICAgICBzd2l0Y2ggKGZvcm1hdCkge1xuICAgICAgICAgIGNhc2UgJ2RhdGUnOlxuICAgICAgICAgICAgcmVzdWx0ID0gaXNWYWxpZERhdGUodmFsKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2RhdGUtdGltZSc6XG4gICAgICAgICAgICByZXN1bHQgPSBpc1ZhbGlkRGF0ZVRpbWUodmFsKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3ZvaWQnOlxuICAgICAgICByZXN1bHQgPSBfLmlzVW5kZWZpbmVkKHZhbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChza2lwRXJyb3IpIHtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBlbHNlIGlmICghcmVzdWx0KSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0lOVkFMSURfVFlQRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSAhPT0gJ3ZvaWQnID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdOb3QgYSB2YWxpZCAnICsgKF8uaXNVbmRlZmluZWQoZm9ybWF0KSA/ICcnIDogZm9ybWF0ICsgJyAnKSArIHR5cGUgKyAnOiAnICsgdmFsIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdWb2lkIGRvZXMgbm90IGFsbG93IGEgdmFsdWUnKTtcbiAgICB9XG4gIH07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSB2YWx1ZXMgYXJlIHVuaXF1ZSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNVbmlxdWUgLSBXaGV0aGVyIG9yIG5vdCB0aGUgcGFyYW1ldGVyIHZhbHVlcyBhcmUgdW5pcXVlXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaGFzIGR1cGxpY2F0ZXNcbiAqL1xudmFyIHZhbGlkYXRlVW5pcXVlSXRlbXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVVuaXF1ZUl0ZW1zID0gZnVuY3Rpb24gdmFsaWRhdGVVbmlxdWVJdGVtcyAodmFsLCBpc1VuaXF1ZSkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoaXNVbmlxdWUpICYmIF8udW5pcSh2YWwpLmxlbmd0aCAhPT0gdmFsLmxlbmd0aCkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnQVJSQVlfVU5JUVVFJywgJ0RvZXMgbm90IGFsbG93IGR1cGxpY2F0ZSB2YWx1ZXM6ICcgKyB2YWwuam9pbignLCAnKSk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBhZ2FpbnN0IHRoZSBzY2hlbWEuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHN3YWdnZXJWZXJzaW9uIC0gVGhlIFN3YWdnZXIgdmVyc2lvblxuICogQHBhcmFtIHtvYmplY3R9IHNjaGVtYSAtIFRoZSBzY2hlbWEgdG8gdXNlIHRvIHZhbGlkYXRlIHRoaW5nc1xuICogQHBhcmFtIHtzdHJpbmdbXX0gcGF0aCAtIFRoZSBwYXRoIHRvIHRoZSBzY2hlbWFcbiAqIEBwYXJhbSB7Kn0gW3ZhbF0gLSBUaGUgdmFsdWUgdG8gdmFsaWRhdGUgb3IgdW5kZWZpbmVkIHRvIHVzZSB0aGUgZGVmYXVsdCB2YWx1ZSBwcm92aWRlZCBieSB0aGUgc2NoZW1hXG4gKlxuICogQHRocm93cyBFcnJvciBpZiBhbnkgdmFsaWRhdGlvbiBmYWlsZXNcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyA9IGZ1bmN0aW9uIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMgKHN3YWdnZXJWZXJzaW9uLCBzY2hlbWEsIHBhdGgsIHZhbCkge1xuICB2YXIgcmVzb2x2ZVNjaGVtYSA9IGZ1bmN0aW9uIHJlc29sdmVTY2hlbWEgKHNjaGVtYSkge1xuICAgIHZhciByZXNvbHZlZCA9IHNjaGVtYTtcblxuICAgIGlmIChyZXNvbHZlZC5zY2hlbWEpIHtcbiAgICAgIHBhdGggPSBwYXRoLmNvbmNhdChbJ3NjaGVtYSddKTtcblxuICAgICAgcmVzb2x2ZWQgPSByZXNvbHZlU2NoZW1hKHJlc29sdmVkLnNjaGVtYSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc29sdmVkO1xuICB9O1xuXG4gIHZhciB0eXBlID0gc2NoZW1hLnR5cGU7XG5cbiAgaWYgKCF0eXBlKSB7XG4gICAgaWYgKCFzY2hlbWEuc2NoZW1hKSB7XG4gICAgICBpZiAocGF0aFtwYXRoLmxlbmd0aCAtIDJdID09PSAncmVzcG9uc2VzJykge1xuICAgICAgICB0eXBlID0gJ3ZvaWQnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHlwZSA9ICdvYmplY3QnO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzY2hlbWEgPSByZXNvbHZlU2NoZW1hKHNjaGVtYSk7XG4gICAgICB0eXBlID0gc2NoZW1hLnR5cGUgfHwgJ29iamVjdCc7XG4gICAgfVxuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBBbHdheXMgcGVyZm9ybSB0aGlzIGNoZWNrIGV2ZW4gaWYgdGhlcmUgaXMgbm8gdmFsdWVcbiAgICBpZiAodHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgdmFsaWRhdGVBcnJheVR5cGUoc2NoZW1hKTtcbiAgICB9XG5cbiAgICAvLyBEZWZhdWx0IHRvIGRlZmF1bHQgdmFsdWUgaWYgbmVjZXNzYXJ5XG4gICAgaWYgKF8uaXNVbmRlZmluZWQodmFsKSkge1xuICAgICAgdmFsID0gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gc2NoZW1hLmRlZmF1bHRWYWx1ZSA6IHNjaGVtYS5kZWZhdWx0O1xuXG4gICAgICBwYXRoID0gcGF0aC5jb25jYXQoW3N3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdkZWZhdWx0VmFsdWUnIDogJ2RlZmF1bHQnXSk7XG4gICAgfVxuXG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gZXhwbGljaXQgZGVmYXVsdCB2YWx1ZSwgcmV0dXJuIGFzIGFsbCB2YWxpZGF0aW9ucyB3aWxsIGZhaWxcbiAgICBpZiAoXy5pc1VuZGVmaW5lZCh2YWwpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgIGlmICghXy5pc1VuZGVmaW5lZChzY2hlbWEuaXRlbXMpKSB7XG4gICAgICAgIHZhbGlkYXRlVHlwZUFuZEZvcm1hdCh2YWwsIHR5cGUgPT09ICdhcnJheScgPyBzY2hlbWEuaXRlbXMudHlwZSA6IHR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlID09PSAnYXJyYXknICYmIHNjaGVtYS5pdGVtcy5mb3JtYXQgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY2hlbWEuaXRlbXMuZm9ybWF0IDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NoZW1hLmZvcm1hdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YWxpZGF0ZVR5cGVBbmRGb3JtYXQodmFsLCB0eXBlLCBzY2hlbWEuZm9ybWF0KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFsaWRhdGVUeXBlQW5kRm9ybWF0KHZhbCwgdHlwZSwgc2NoZW1hLmZvcm1hdCk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgZW51bVxuICAgIHZhbGlkYXRlRW51bSh2YWwsIHNjaGVtYS5lbnVtKTtcblxuICAgIC8vIFZhbGlkYXRlIG1heGltdW1cbiAgICB2YWxpZGF0ZU1heGltdW0odmFsLCBzY2hlbWEubWF4aW11bSwgdHlwZSwgc2NoZW1hLmV4Y2x1c2l2ZU1heGltdW0pO1xuXG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhJdGVtcyAoU3dhZ2dlciAyLjArKVxuICAgIHZhbGlkYXRlTWF4SXRlbXModmFsLCBzY2hlbWEubWF4SXRlbXMpO1xuXG4gICAgLy8gVmFsaWRhdGUgbWF4TGVuZ3RoIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVNYXhMZW5ndGgodmFsLCBzY2hlbWEubWF4TGVuZ3RoKTtcblxuICAgIC8vIFZhbGlkYXRlIG1heFByb3BlcnRpZXMgKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZU1heFByb3BlcnRpZXModmFsLCBzY2hlbWEubWF4UHJvcGVydGllcyk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtaW5pbXVtXG4gICAgdmFsaWRhdGVNaW5pbXVtKHZhbCwgc2NoZW1hLm1pbmltdW0sIHR5cGUsIHNjaGVtYS5leGNsdXNpdmVNaW5pbXVtKTtcblxuICAgIC8vIFZhbGlkYXRlIG1pbkl0ZW1zXG4gICAgdmFsaWRhdGVNaW5JdGVtcyh2YWwsIHNjaGVtYS5taW5JdGVtcyk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtaW5MZW5ndGggKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZU1pbkxlbmd0aCh2YWwsIHNjaGVtYS5taW5MZW5ndGgpO1xuXG4gICAgLy8gVmFsaWRhdGUgbWluUHJvcGVydGllcyAoU3dhZ2dlciAyLjArKVxuICAgIHZhbGlkYXRlTWluUHJvcGVydGllcyh2YWwsIHNjaGVtYS5taW5Qcm9wZXJ0aWVzKTtcblxuICAgIC8vIFZhbGlkYXRlIG11bHRpcGxlT2YgKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZU11bHRpcGxlT2YodmFsLCBzY2hlbWEubXVsdGlwbGVPZik7XG5cbiAgICAvLyBWYWxpZGF0ZSBwYXR0ZXJuIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVQYXR0ZXJuKHZhbCwgc2NoZW1hLnBhdHRlcm4pO1xuXG4gICAgLy8gVmFsaWRhdGUgdW5pcXVlSXRlbXNcbiAgICB2YWxpZGF0ZVVuaXF1ZUl0ZW1zKHZhbCwgc2NoZW1hLnVuaXF1ZUl0ZW1zKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgZXJyLnBhdGggPSBwYXRoO1xuXG4gICAgdGhyb3cgZXJyO1xuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2FwaURlY2xhcmF0aW9uLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwic3dhZ2dlclZlcnNpb25cIiwgXCJiYXNlUGF0aFwiLCBcImFwaXNcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwic3dhZ2dlclZlcnNpb25cIjogeyBcImVudW1cIjogWyBcIjEuMlwiIF0gfSxcbiAgICAgICAgXCJhcGlWZXJzaW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJiYXNlUGF0aFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCIsXG4gICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeaHR0cHM/Oi8vXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXNvdXJjZVBhdGhcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiLFxuICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXi9cIlxuICAgICAgICB9LFxuICAgICAgICBcImFwaXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaU9iamVjdFwiIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJtb2RlbHNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJtb2RlbHNPYmplY3QuanNvbiNcIlxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInByb2R1Y2VzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjogeyBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgIH0sXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJhcGlPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJwYXRoXCIsIFwib3BlcmF0aW9uc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwicGF0aFwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaS10ZW1wbGF0ZVwiLFxuICAgICAgICAgICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeL1wiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcIm9wZXJhdGlvbnNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwib3BlcmF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWltZVR5cGVBcnJheVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJtaW1lLXR5cGVcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9iYXNpY0F1dGhcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaUtleVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiYmFzaWNBdXRoXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImJhc2ljQXV0aFwiIF0gfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJhcGlLZXlcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiLCBcInBhc3NBc1wiLCBcImtleW5hbWVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImFwaUtleVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcInBhc3NBc1wiOiB7IFwiZW51bVwiOiBbIFwiaGVhZGVyXCIsIFwicXVlcnlcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJrZXluYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJvYXV0aDJcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIsIFwiZ3JhbnRUeXBlc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwib2F1dGgyXCIgXSB9LFxuICAgICAgICAgICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImdyYW50VHlwZXNcIjogeyBcIiRyZWZcIjogXCJvYXV0aDJHcmFudFR5cGUuanNvbiNcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm9hdXRoMlNjb3BlXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwic2NvcGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInNjb3BlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfVxuICAgIH1cbn1cblxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2RhdGFUeXBlLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkRhdGEgdHlwZSBhcyBkZXNjcmliZWQgYnkgdGhlIHNwZWNpZmljYXRpb24gKHZlcnNpb24gMS4yKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVmVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92b2lkVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21vZGVsVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcnJheVR5cGVcIiB9XG4gICAgXSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJyZWZUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInZvaWRUeXBlXCI6IHtcbiAgICAgICAgICAgIFwiZW51bVwiOiBbIHsgXCJ0eXBlXCI6IFwidm9pZFwiIH0gXVxuICAgICAgICB9LFxuICAgICAgICBcIm1vZGVsVHlwZVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYm9vbGVhblwiLCBcImludGVnZXJcIiwgXCJudW1iZXJcIiwgXCJzdHJpbmdcIiwgXCJhcnJheVwiIF1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwicHJpbWl0aXZlVHlwZVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bWJlclwiLCBcInN0cmluZ1wiIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImRlZmF1bHRWYWx1ZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHsgXCJ0eXBlXCI6IFsgXCJhcnJheVwiLCBcIm9iamVjdFwiLCBcIm51bGxcIiBdIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJtaW5pbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcIm1heGltdW1cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgICAgICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImludDMyXCIsIFwiaW50NjRcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwibnVtYmVyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiZmxvYXRcIiwgXCJkb3VibGVcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwic3RyaW5nXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcImJ5dGVcIiwgXCJkYXRlXCIsIFwiZGF0ZS10aW1lXCIgXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiLCBcIm51bWJlclwiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYXJyYXlUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiwgXCJpdGVtc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYXJyYXlcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2l0ZW1zT2JqZWN0XCIgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZWZUeXBlXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJhbGxPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVUeXBlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgfVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9kYXRhVHlwZUJhc2UuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGF0YSB0eXBlIGZpZWxkcyAoc2VjdGlvbiA0LjMuMylcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgeyBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSB9LFxuICAgICAgICB7IFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdIH1cbiAgICBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiJHJlZlwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZWZhdWx0VmFsdWVcIjoge1xuICAgICAgICAgICAgXCJub3RcIjogeyBcInR5cGVcIjogWyBcImFycmF5XCIsIFwib2JqZWN0XCIsIFwibnVsbFwiIF0gfVxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlLFxuICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2l0ZW1zT2JqZWN0XCIgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJpbnQzMlwiLCBcImludDY0XCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwibnVtYmVyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImZsb2F0XCIsIFwiZG91YmxlXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwic3RyaW5nXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYnl0ZVwiLCBcImRhdGVcIiwgXCJkYXRlLXRpbWVcIiBdXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcIml0ZW1zT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdLFxuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjoge30sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHt9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvaW5mb09iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwiZGVzY3JpcHRpb25cIjogXCJpbmZvIG9iamVjdCAoc2VjdGlvbiA1LjEuMylcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJ0aXRsZVwiLCBcImRlc2NyaXB0aW9uXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInRpdGxlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwidGVybXNPZlNlcnZpY2VVcmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICBcImNvbnRhY3RcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJlbWFpbFwiIH0sXG4gICAgICAgIFwibGljZW5zZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwibGljZW5zZVVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH1cbiAgICB9LFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2Vcbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvbW9kZWxzT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwiaWRcIiwgXCJwcm9wZXJ0aWVzXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImlkXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Byb3BlcnR5T2JqZWN0XCIgfVxuICAgICAgICB9LFxuICAgICAgICBcInN1YlR5cGVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcImRpc2NyaW1pbmF0b3JcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwic3ViVHlwZXNcIjogWyBcImRpc2NyaW1pbmF0b3JcIiBdXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJwcm9wZXJ0eU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCJcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59XG5cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9vYXV0aDJHcmFudFR5cGUuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcIm1pblByb3BlcnRpZXNcIjogMSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImltcGxpY2l0XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9pbXBsaWNpdFwiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbl9jb2RlXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hdXRob3JpemF0aW9uQ29kZVwiIH1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcImltcGxpY2l0XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwibG9naW5FbmRwb2ludFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwibG9naW5FbmRwb2ludFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbG9naW5FbmRwb2ludFwiIH0sXG4gICAgICAgICAgICAgICAgXCJ0b2tlbk5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25Db2RlXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidG9rZW5FbmRwb2ludFwiLCBcInRva2VuUmVxdWVzdEVuZHBvaW50XCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0b2tlbkVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90b2tlbkVuZHBvaW50XCIgfSxcbiAgICAgICAgICAgICAgICBcInRva2VuUmVxdWVzdEVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90b2tlblJlcXVlc3RFbmRwb2ludFwiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibG9naW5FbmRwb2ludFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInVybFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlbkVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICAgICAgICAgIFwidG9rZW5OYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblJlcXVlc3RFbmRwb2ludFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInVybFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcbiAgICAgICAgICAgICAgICBcImNsaWVudElkTmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJjbGllbnRTZWNyZXROYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfVxuICAgIH1cbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvb3BlcmF0aW9uT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJhbGxPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCIgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwibWV0aG9kXCIsIFwibmlja25hbWVcIiwgXCJwYXJhbWV0ZXJzXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJtZXRob2RcIjogeyBcImVudW1cIjogWyBcIkdFVFwiLCBcIkhFQURcIiwgXCJQT1NUXCIsIFwiUFVUXCIsIFwiUEFUQ0hcIiwgXCJERUxFVEVcIiwgXCJPUFRJT05TXCIgXSB9LFxuICAgICAgICAgICAgICAgIFwic3VtbWFyeVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcIm1heExlbmd0aFwiOiAxMjAgfSxcbiAgICAgICAgICAgICAgICBcIm5vdGVzXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcIm5pY2tuYW1lXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl5bYS16QS1aMC05X10rJFwiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImF1dGhvcml6YXRpb25zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcImF1dGhvcml6YXRpb25PYmplY3QuanNvbiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVcIlxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwicGFyYW1ldGVyT2JqZWN0Lmpzb24jXCIgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJyZXNwb25zZU1lc3NhZ2VzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VNZXNzYWdlT2JqZWN0XCJ9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInByb2R1Y2VzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgICAgICAgICBcImNvbnN1bWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgICAgICAgICBcImRlcHJlY2F0ZWRcIjogeyBcImVudW1cIjogWyBcInRydWVcIiwgXCJmYWxzZVwiIF0gfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgXSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJyZXNwb25zZU1lc3NhZ2VPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJjb2RlXCIsIFwibWVzc2FnZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiY29kZVwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmZjMjYxNnNlY3Rpb24xMFwiIH0sXG4gICAgICAgICAgICAgICAgXCJtZXNzYWdlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcInJlc3BvbnNlTW9kZWxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicmZjMjYxNnNlY3Rpb24xMFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcIm1pbmltdW1cIjogMTAwLFxuICAgICAgICAgICAgXCJtYXhpbXVtXCI6IDYwMCxcbiAgICAgICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWltZVR5cGVBcnJheVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJtaW1lLXR5cGVcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL3BhcmFtZXRlck9iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICB7IFwiJHJlZlwiOiBcImRhdGFUeXBlQmFzZS5qc29uI1wiIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInBhcmFtVHlwZVwiLCBcIm5hbWVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInBhcmFtVHlwZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwicGF0aFwiLCBcInF1ZXJ5XCIsIFwiYm9keVwiLCBcImhlYWRlclwiLCBcImZvcm1cIiBdXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogeyBcInR5cGVcIjogXCJib29sZWFuXCIgfSxcbiAgICAgICAgICAgICAgICBcImFsbG93TXVsdGlwbGVcIjogeyBcInR5cGVcIjogXCJib29sZWFuXCIgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwidHlwZSBGaWxlIHJlcXVpcmVzIHNwZWNpYWwgcGFyYW1UeXBlIGFuZCBjb25zdW1lc1wiLFxuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJub3RcIjogeyBcImVudW1cIjogWyBcIkZpbGVcIiBdIH0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcIkZpbGVcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcInBhcmFtVHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiZm9ybVwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiY29uc3VtZXNcIjogeyBcImVudW1cIjogWyBcIm11bHRpcGFydC9mb3JtLWRhdGFcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIF1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9yZXNvdXJjZUxpc3RpbmcuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJzd2FnZ2VyVmVyc2lvblwiLCBcImFwaXNcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwic3dhZ2dlclZlcnNpb25cIjogeyBcImVudW1cIjogWyBcIjEuMlwiIF0gfSxcbiAgICAgICAgXCJhcGlzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwicmVzb3VyY2VPYmplY3QuanNvbiNcIiB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYXBpVmVyc2lvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiaW5mb1wiOiB7IFwiJHJlZlwiOiBcImluZm9PYmplY3QuanNvbiNcIiB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25zXCI6IHsgXCIkcmVmXCI6IFwiYXV0aG9yaXphdGlvbk9iamVjdC5qc29uI1wiIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcmVzb3VyY2VPYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJwYXRoXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInBhdGhcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgIH0sXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJ0aXRsZVwiOiBcIkEgSlNPTiBTY2hlbWEgZm9yIFN3YWdnZXIgMi4wIEFQSS5cIixcbiAgXCJpZFwiOiBcImh0dHA6Ly9zd2FnZ2VyLmlvL3YyL3NjaGVtYS5qc29uI1wiLFxuICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gIFwicmVxdWlyZWRcIjogW1xuICAgIFwic3dhZ2dlclwiLFxuICAgIFwiaW5mb1wiLFxuICAgIFwicGF0aHNcIlxuICBdLFxuICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICBcIl54LVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgfVxuICB9LFxuICBcInByb3BlcnRpZXNcIjoge1xuICAgIFwic3dhZ2dlclwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgIFwiMi4wXCJcbiAgICAgIF0sXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIFN3YWdnZXIgdmVyc2lvbiBvZiB0aGlzIGRvY3VtZW50LlwiXG4gICAgfSxcbiAgICBcImluZm9cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9pbmZvXCJcbiAgICB9LFxuICAgIFwiaG9zdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCIsXG4gICAgICBcInBhdHRlcm5cIjogXCJeW157fS8gOlxcXFxcXFxcXSsoPzo6XFxcXGQrKT8kXCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIGZ1bGx5IHF1YWxpZmllZCBVUkkgdG8gdGhlIGhvc3Qgb2YgdGhlIEFQSS5cIlxuICAgIH0sXG4gICAgXCJiYXNlUGF0aFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwicGF0dGVyblwiOiBcIl4vXCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIGJhc2UgcGF0aCB0byB0aGUgQVBJLiBFeGFtcGxlOiAnL2FwaScuXCJcbiAgICB9LFxuICAgIFwic2NoZW1lc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtZXNMaXN0XCJcbiAgICB9LFxuICAgIFwiY29uc3VtZXNcIjoge1xuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgbGlzdCBvZiBNSU1FIHR5cGVzIGFjY2VwdGVkIGJ5IHRoZSBBUEkuXCIsXG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgIH0sXG4gICAgXCJwcm9kdWNlc1wiOiB7XG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgdGhlIEFQSSBjYW4gcHJvZHVjZS5cIixcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgfSxcbiAgICBcInBhdGhzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0aHNcIlxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwicGFyYW1ldGVyc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlckRlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwicmVzcG9uc2VzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VEZWZpbml0aW9uc1wiXG4gICAgfSxcbiAgICBcInNlY3VyaXR5XCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2VjdXJpdHlcIlxuICAgIH0sXG4gICAgXCJzZWN1cml0eURlZmluaXRpb25zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2VjdXJpdHlEZWZpbml0aW9uc1wiXG4gICAgfSxcbiAgICBcInRhZ3NcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3RhZ1wiXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4dGVybmFsRG9jc1wiXG4gICAgfVxuICB9LFxuICBcImRlZmluaXRpb25zXCI6IHtcbiAgICBcImluZm9cIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiR2VuZXJhbCBpbmZvcm1hdGlvbiBhYm91dCB0aGUgQVBJLlwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidmVyc2lvblwiLFxuICAgICAgICBcInRpdGxlXCJcbiAgICAgIF0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInRpdGxlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSB1bmlxdWUgYW5kIHByZWNpc2UgdGl0bGUgb2YgdGhlIEFQSS5cIlxuICAgICAgICB9LFxuICAgICAgICBcInZlcnNpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIHNlbWFudGljIHZlcnNpb24gbnVtYmVyIG9mIHRoZSBBUEkuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgbG9uZ2VyIGRlc2NyaXB0aW9uIG9mIHRoZSBBUEkuIFNob3VsZCBiZSBkaWZmZXJlbnQgZnJvbSB0aGUgdGl0bGUuICBHaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcInRlcm1zT2ZTZXJ2aWNlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIHRlcm1zIG9mIHNlcnZpY2UgZm9yIHRoZSBBUEkuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb250YWN0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbnRhY3RcIlxuICAgICAgICB9LFxuICAgICAgICBcImxpY2Vuc2VcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbGljZW5zZVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiY29udGFjdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJDb250YWN0IGluZm9ybWF0aW9uIGZvciB0aGUgb3duZXJzIG9mIHRoZSBBUEkuXCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIGlkZW50aWZ5aW5nIG5hbWUgb2YgdGhlIGNvbnRhY3QgcGVyc29uL29yZ2FuaXphdGlvbi5cIlxuICAgICAgICB9LFxuICAgICAgICBcInVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBVUkwgcG9pbnRpbmcgdG8gdGhlIGNvbnRhY3QgaW5mb3JtYXRpb24uXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcImVtYWlsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIGVtYWlsIGFkZHJlc3Mgb2YgdGhlIGNvbnRhY3QgcGVyc29uL29yZ2FuaXphdGlvbi5cIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcImVtYWlsXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJsaWNlbnNlXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiXG4gICAgICBdLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBsaWNlbnNlIHR5cGUuIEl0J3MgZW5jb3VyYWdlZCB0byB1c2UgYW4gT1NJIGNvbXBhdGlibGUgbGljZW5zZS5cIlxuICAgICAgICB9LFxuICAgICAgICBcInVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBVUkwgcG9pbnRpbmcgdG8gdGhlIGxpY2Vuc2UuXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInBhdGhzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlJlbGF0aXZlIHBhdGhzIHRvIHRoZSBpbmRpdmlkdWFsIGVuZHBvaW50cy4gVGhleSBtdXN0IGJlIHJlbGF0aXZlIHRvIHRoZSAnYmFzZVBhdGgnLlwiLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiXi9cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0aEl0ZW1cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICB9LFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIk9uZSBvciBtb3JlIEpTT04gb2JqZWN0cyBkZXNjcmliaW5nIHRoZSBzY2hlbWFzIGJlaW5nIGNvbnN1bWVkIGFuZCBwcm9kdWNlZCBieSB0aGUgQVBJLlwiXG4gICAgfSxcbiAgICBcInBhcmFtZXRlckRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyXCJcbiAgICAgIH0sXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiT25lIG9yIG1vcmUgSlNPTiByZXByZXNlbnRhdGlvbnMgZm9yIHBhcmFtZXRlcnNcIlxuICAgIH0sXG4gICAgXCJyZXNwb25zZURlZmluaXRpb25zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VcIlxuICAgICAgfSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJPbmUgb3IgbW9yZSBKU09OIHJlcHJlc2VudGF0aW9ucyBmb3IgcGFyYW1ldGVyc1wiXG4gICAgfSxcbiAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiaW5mb3JtYXRpb24gYWJvdXQgZXh0ZXJuYWwgZG9jdW1lbnRhdGlvblwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImV4YW1wbGVzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXlthLXowLTktXSsvW2EtejAtOVxcXFwtK10rJFwiOiB7fVxuICAgICAgfSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICB9LFxuICAgIFwibWltZVR5cGVcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIE1JTUUgdHlwZSBvZiB0aGUgSFRUUCBtZXNzYWdlLlwiXG4gICAgfSxcbiAgICBcIm9wZXJhdGlvblwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInJlc3BvbnNlc1wiXG4gICAgICBdLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0YWdzXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcInN1bW1hcnlcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIHN1bW1hcnkgb2YgdGhlIG9wZXJhdGlvbi5cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsb25nZXIgZGVzY3JpcHRpb24gb2YgdGhlIG9wZXJhdGlvbiwgZ2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJvcGVyYXRpb25JZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgZnJpZW5kbHkgbmFtZSBvZiB0aGUgb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwcm9kdWNlc1wiOiB7XG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgbGlzdCBvZiBNSU1FIHR5cGVzIHRoZSBBUEkgY2FuIHByb2R1Y2UuXCIsXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb25zdW1lc1wiOiB7XG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgbGlzdCBvZiBNSU1FIHR5cGVzIHRoZSBBUEkgY2FuIGNvbnN1bWUuXCIsXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlcnNMaXN0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXNwb25zZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJzY2hlbWVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtZXNMaXN0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXByZWNhdGVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwic2VjdXJpdHlcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2VjdXJpdHlcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInBhdGhJdGVtXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcInB1dFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcInBvc3RcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWxldGVcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJvcHRpb25zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaGVhZFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdGNoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGFyYW1ldGVyc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJzTGlzdFwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicmVzcG9uc2VzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlJlc3BvbnNlIG9iamVjdHMgbmFtZXMgY2FuIGVpdGhlciBiZSBhbnkgdmFsaWQgSFRUUCBzdGF0dXMgY29kZSBvciAnZGVmYXVsdCcuXCIsXG4gICAgICBcIm1pblByb3BlcnRpZXNcIjogMSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeKFswLTldezN9KSR8XihkZWZhdWx0KSRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VWYWx1ZVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcIm5vdFwiOiB7XG4gICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInJlc3BvbnNlVmFsdWVcIjoge1xuICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvanNvblJlZmVyZW5jZVwiXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9LFxuICAgIFwicmVzcG9uc2VcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJzY2hlbWFcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJoZWFkZXJzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2hlYWRlcnNcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4YW1wbGVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4YW1wbGVzXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICB9LFxuICAgIFwiaGVhZGVyc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2hlYWRlclwiXG4gICAgICB9XG4gICAgfSxcbiAgICBcImhlYWRlclwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwidmVuZG9yRXh0ZW5zaW9uXCI6IHtcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBbnkgcHJvcGVydHkgc3RhcnRpbmcgd2l0aCB4LSBpcyB2YWxpZC5cIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogdHJ1ZSxcbiAgICAgIFwiYWRkaXRpb25hbEl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwiYm9keVBhcmFtZXRlclwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIixcbiAgICAgICAgXCJpblwiLFxuICAgICAgICBcInNjaGVtYVwiXG4gICAgICBdLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJib2R5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJzY2hlbWFcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICB9LFxuICAgIFwiaGVhZGVyUGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiaGVhZGVyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJxdWVyeVBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgd2hldGhlciBvciBub3QgdGhpcyBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQgb3Igb3B0aW9uYWwuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInF1ZXJ5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYWxsb3dFbXB0eVZhbHVlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJhbGxvd3Mgc2VuZGluZyBhIHBhcmFtZXRlciBieSBuYW1lIG9ubHkgb3Igd2l0aCBhbiBlbXB0eSB2YWx1ZS5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiZm9ybURhdGFQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJmb3JtRGF0YVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcImFsbG93RW1wdHlWYWx1ZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZSxcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiYWxsb3dzIHNlbmRpbmcgYSBwYXJhbWV0ZXIgYnkgbmFtZSBvbmx5IG9yIHdpdGggYW4gZW1wdHkgdmFsdWUuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJmaWxlXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aFBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIHRydWVcbiAgICAgICAgICBdLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInBhdGhcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm5vbkJvZHlQYXJhbWV0ZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCIsXG4gICAgICAgIFwiaW5cIixcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyUGFyYW1ldGVyU3ViU2NoZW1hXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZm9ybURhdGFQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9xdWVyeVBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdGhQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInBhcmFtZXRlclwiOiB7XG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYm9keVBhcmFtZXRlclwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL25vbkJvZHlQYXJhbWV0ZXJcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInNjaGVtYVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGRldGVybWluaXN0aWMgdmVyc2lvbiBvZiBhIEpTT04gU2NoZW1hIG9iamVjdC5cIixcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdGl0bGVcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZXNjcmlwdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4UHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvYWRkaXRpb25hbFByb3BlcnRpZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3R5cGVcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcImFsbE9mXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkaXNjcmltaW5hdG9yXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlYWRPbmx5XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwieG1sXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3htbFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4dGVybmFsRG9jc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhhbXBsZVwiOiB7fVxuICAgICAgfSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICB9LFxuICAgIFwicHJpbWl0aXZlc0l0ZW1zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2VjdXJpdHlSZXF1aXJlbWVudFwiXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInNlY3VyaXR5UmVxdWlyZW1lbnRcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICB9XG4gICAgfSxcbiAgICBcInhtbFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZXNwYWNlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInByZWZpeFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdHRyaWJ1dGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ3cmFwcGVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwidGFnXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInNlY3VyaXR5RGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9iYXNpY0F1dGhlbnRpY2F0aW9uU2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcGlLZXlTZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMkltcGxpY2l0U2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJQYXNzd29yZFNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyQXBwbGljYXRpb25TZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMkFjY2Vzc0NvZGVTZWN1cml0eVwiXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9XG4gICAgfSxcbiAgICBcImJhc2ljQXV0aGVudGljYXRpb25TZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImJhc2ljXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJhcGlLZXlTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwibmFtZVwiLFxuICAgICAgICBcImluXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFwaUtleVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImhlYWRlclwiLFxuICAgICAgICAgICAgXCJxdWVyeVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgySW1wbGljaXRTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiaW1wbGljaXRcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJQYXNzd29yZFNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwidG9rZW5VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicGFzc3dvcmRcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgyQXBwbGljYXRpb25TZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcInRva2VuVXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcIm9hdXRoMlwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZsb3dcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFwcGxpY2F0aW9uXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3Blc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidG9rZW5VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMkFjY2Vzc0NvZGVTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIixcbiAgICAgICAgXCJ0b2tlblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJhY2Nlc3NDb2RlXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3Blc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJTY29wZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIFwibWVkaWFUeXBlTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVcIlxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJzTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBwYXJhbWV0ZXJzIG5lZWRlZCB0byBzZW5kIGEgdmFsaWQgQVBJIGNhbGwuXCIsXG4gICAgICBcImFkZGl0aW9uYWxJdGVtc1wiOiBmYWxzZSxcbiAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlclwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2pzb25SZWZlcmVuY2VcIlxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJzY2hlbWVzTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSB0cmFuc2ZlciBwcm90b2NvbCBvZiB0aGUgQVBJLlwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgIFwiaHR0cFwiLFxuICAgICAgICAgIFwiaHR0cHNcIixcbiAgICAgICAgICBcIndzXCIsXG4gICAgICAgICAgXCJ3c3NcIlxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImVudW1cIjogW1xuICAgICAgICBcImNzdlwiLFxuICAgICAgICBcInNzdlwiLFxuICAgICAgICBcInRzdlwiLFxuICAgICAgICBcInBpcGVzXCJcbiAgICAgIF0sXG4gICAgICBcImRlZmF1bHRcIjogXCJjc3ZcIlxuICAgIH0sXG4gICAgXCJjb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgXCJjc3ZcIixcbiAgICAgICAgXCJzc3ZcIixcbiAgICAgICAgXCJ0c3ZcIixcbiAgICAgICAgXCJwaXBlc1wiLFxuICAgICAgICBcIm11bHRpXCJcbiAgICAgIF0sXG4gICAgICBcImRlZmF1bHRcIjogXCJjc3ZcIlxuICAgIH0sXG4gICAgXCJ0aXRsZVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90aXRsZVwiXG4gICAgfSxcbiAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2Rlc2NyaXB0aW9uXCJcbiAgICB9LFxuICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZWZhdWx0XCJcbiAgICB9LFxuICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tdWx0aXBsZU9mXCJcbiAgICB9LFxuICAgIFwibWF4aW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tYXhpbXVtXCJcbiAgICB9LFxuICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICB9LFxuICAgIFwibWluaW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9taW5pbXVtXCJcbiAgICB9LFxuICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICB9LFxuICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgIH0sXG4gICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICB9LFxuICAgIFwicGF0dGVyblwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9wYXR0ZXJuXCJcbiAgICB9LFxuICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgfSxcbiAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgfSxcbiAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3VuaXF1ZUl0ZW1zXCJcbiAgICB9LFxuICAgIFwiZW51bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9lbnVtXCJcbiAgICB9LFxuICAgIFwianNvblJlZmVyZW5jZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwiZGVzY3JpcHRpb25cIjogXCJDb3JlIHNjaGVtYSBtZXRhLXNjaGVtYVwiLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInNjaGVtYUFycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJwb3NpdGl2ZUludGVnZXJcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJtaW5pbXVtXCI6IDBcbiAgICAgICAgfSxcbiAgICAgICAgXCJwb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiOiB7XG4gICAgICAgICAgICBcImFsbE9mXCI6IFsgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sIHsgXCJkZWZhdWx0XCI6IDAgfSBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic2ltcGxlVHlwZXNcIjoge1xuICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJhcnJheVwiLCBcImJvb2xlYW5cIiwgXCJpbnRlZ2VyXCIsIFwibnVsbFwiLCBcIm51bWJlclwiLCBcIm9iamVjdFwiLCBcInN0cmluZ1wiIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzdHJpbmdBcnJheVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgfVxuICAgIH0sXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJpZFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCIkc2NoZW1hXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcInRpdGxlXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHt9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcIm1pbmltdW1cIjogMCxcbiAgICAgICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJudW1iZXJcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJudW1iZXJcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIiB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInJlZ2V4XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhZGRpdGlvbmFsSXRlbXNcIjoge1xuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICAgICAgeyBcInR5cGVcIjogXCJib29sZWFuXCIgfSxcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9XG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCIgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIiB9LFxuICAgICAgICBcIm1pblByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCIgfSxcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc3RyaW5nQXJyYXlcIiB9LFxuICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH0sXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zdHJpbmdBcnJheVwiIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2ltcGxlVHlwZXNcIiB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2ltcGxlVHlwZXNcIiB9LFxuICAgICAgICAgICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJhbGxPZlwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9LFxuICAgICAgICBcImFueU9mXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH0sXG4gICAgICAgIFwib25lT2ZcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfSxcbiAgICAgICAgXCJub3RcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgIH0sXG4gICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjogWyBcIm1heGltdW1cIiBdLFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjogWyBcIm1pbmltdW1cIiBdXG4gICAgfSxcbiAgICBcImRlZmF1bHRcIjoge31cbn1cbiJdfQ==
