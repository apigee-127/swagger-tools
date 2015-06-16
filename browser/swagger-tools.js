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
var YAML = (window.jsyaml);

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
    JsonRefs.resolveRefs(apiDOrSO, {
      processContent: function (content) {
        return YAML.safeLoad(content);
      }
    }, function (err, json) {
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
        // Can happen with invalid references
        if (_.isUndefined(parameter)) {
          return;
        }

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvc3BlY3MuanMiLCJsaWIvaGVscGVycy5qcyIsImxpYi92YWxpZGF0b3JzLmpzIiwic2NoZW1hcy8xLjIvYXBpRGVjbGFyYXRpb24uanNvbiIsInNjaGVtYXMvMS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24iLCJzY2hlbWFzLzEuMi9kYXRhVHlwZUJhc2UuanNvbiIsInNjaGVtYXMvMS4yL2luZm9PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL21vZGVsc09iamVjdC5qc29uIiwic2NoZW1hcy8xLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24iLCJzY2hlbWFzLzEuMi9vcGVyYXRpb25PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL3BhcmFtZXRlck9iamVjdC5qc29uIiwic2NoZW1hcy8xLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24iLCJzY2hlbWFzLzEuMi9yZXNvdXJjZU9iamVjdC5qc29uIiwic2NoZW1hcy8yLjAvc2NoZW1hLmpzb24iLCJzY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDbjhDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdDlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0IEFwaWdlZSBDb3Jwb3JhdGlvblxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuICogYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG4gKiBUSEUgU09GVFdBUkUuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh3aW5kb3cuXyk7XG52YXIgYXN5bmMgPSAod2luZG93LmFzeW5jKTtcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG52YXIgSnNvblJlZnMgPSAod2luZG93Lkpzb25SZWZzKTtcbnZhciBTcGFya01ENSA9ICh3aW5kb3cuU3BhcmtNRDUpO1xudmFyIHN3YWdnZXJDb252ZXJ0ZXIgPSAod2luZG93LlN3YWdnZXJDb252ZXJ0ZXIuY29udmVydCk7XG52YXIgdHJhdmVyc2UgPSAod2luZG93LnRyYXZlcnNlKTtcbnZhciB2YWxpZGF0b3JzID0gcmVxdWlyZSgnLi92YWxpZGF0b3JzJyk7XG52YXIgWUFNTCA9ICh3aW5kb3cuanN5YW1sKTtcblxuLy8gV29yayBhcm91bmQgc3dhZ2dlci1jb252ZXJ0ZXIgcGFja2FnaW5nIGlzc3VlIChCcm93c2VyIGJ1aWxkcyBvbmx5KVxuaWYgKF8uaXNQbGFpbk9iamVjdChzd2FnZ2VyQ29udmVydGVyKSkge1xuICBzd2FnZ2VyQ29udmVydGVyID0gZ2xvYmFsLlN3YWdnZXJDb252ZXJ0ZXIuY29udmVydDtcbn1cblxudmFyIGRvY3VtZW50Q2FjaGUgPSB7fTtcbnZhciB2YWxpZE9wdGlvbk5hbWVzID0gXy5tYXAoaGVscGVycy5zd2FnZ2VyT3BlcmF0aW9uTWV0aG9kcywgZnVuY3Rpb24gKG1ldGhvZCkge1xuICByZXR1cm4gbWV0aG9kLnRvTG93ZXJDYXNlKCk7XG59KTtcblxudmFyIGFkZEV4dGVybmFsUmVmc1RvVmFsaWRhdG9yID0gZnVuY3Rpb24gYWRkRXh0ZXJuYWxSZWZzVG9WYWxpZGF0b3IgKHZhbGlkYXRvciwganNvbiwgY2FsbGJhY2spIHtcbiAgdmFyIHJlbW90ZVJlZnMgPSBfLnJlZHVjZShKc29uUmVmcy5maW5kUmVmcyhqc29uKSwgZnVuY3Rpb24gKHJSZWZzLCByZWYsIHB0cikge1xuICAgIGlmIChKc29uUmVmcy5pc1JlbW90ZVBvaW50ZXIocHRyKSkge1xuICAgICAgclJlZnMucHVzaChyZWYuc3BsaXQoJyMnKVswXSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJSZWZzO1xuICB9LCBbXSk7XG4gIHZhciByZXNvbHZlUmVtb3RlUmVmcyA9IGZ1bmN0aW9uIChyZWYsIGNhbGxiYWNrKSB7XG4gICAgSnNvblJlZnMucmVzb2x2ZVJlZnMoeyRyZWY6IHJlZn0sIGZ1bmN0aW9uIChlcnIsIGpzb24pIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICB9XG5cbiAgICAgIC8vIFBlcmZvcm0gdGhlIHNhbWUgZm9yIHRoZSBuZXdseSByZXNvbHZlZCBkb2N1bWVudFxuICAgICAgYWRkRXh0ZXJuYWxSZWZzVG9WYWxpZGF0b3IodmFsaWRhdG9yLCBqc29uLCBmdW5jdGlvbiAoZXJyLCBySnNvbikge1xuICAgICAgICBjYWxsYmFjayhlcnIsIHJKc29uKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9O1xuXG4gIGlmIChyZW1vdGVSZWZzLmxlbmd0aCA+IDApIHtcbiAgICBhc3luYy5tYXAocmVtb3RlUmVmcywgcmVzb2x2ZVJlbW90ZVJlZnMsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICB9XG5cbiAgICAgIF8uZWFjaChyZXN1bHRzLCBmdW5jdGlvbiAoanNvbiwgaW5kZXgpIHtcbiAgICAgICAgdmFsaWRhdG9yLnNldFJlbW90ZVJlZmVyZW5jZShyZW1vdGVSZWZzW2luZGV4XSwganNvbik7XG4gICAgICB9KTtcblxuICAgICAgY2FsbGJhY2soKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBjYWxsYmFjaygpO1xuICB9XG59O1xuXG52YXIgY3JlYXRlRXJyb3JPcldhcm5pbmcgPSBmdW5jdGlvbiBjcmVhdGVFcnJvck9yV2FybmluZyAoY29kZSwgbWVzc2FnZSwgcGF0aCwgZGVzdCkge1xuICBkZXN0LnB1c2goe1xuICAgIGNvZGU6IGNvZGUsXG4gICAgbWVzc2FnZTogbWVzc2FnZSxcbiAgICBwYXRoOiBwYXRoXG4gIH0pO1xufTtcblxudmFyIGFkZFJlZmVyZW5jZSA9IGZ1bmN0aW9uIGFkZFJlZmVyZW5jZSAoY2FjaGVFbnRyeSwgZGVmUGF0aE9yUHRyLCByZWZQYXRoT3JQdHIsIHJlc3VsdHMsIG9taXRFcnJvcikge1xuICB2YXIgcmVzdWx0ID0gdHJ1ZTtcbiAgdmFyIHN3YWdnZXJWZXJzaW9uID0gaGVscGVycy5nZXRTd2FnZ2VyVmVyc2lvbihjYWNoZUVudHJ5LnJlc29sdmVkKTtcbiAgdmFyIGRlZlBhdGggPSBfLmlzQXJyYXkoZGVmUGF0aE9yUHRyKSA/IGRlZlBhdGhPclB0ciA6IEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihkZWZQYXRoT3JQdHIpO1xuICB2YXIgZGVmUHRyID0gXy5pc0FycmF5KGRlZlBhdGhPclB0cikgPyBKc29uUmVmcy5wYXRoVG9Qb2ludGVyKGRlZlBhdGhPclB0cikgOiBkZWZQYXRoT3JQdHI7XG4gIHZhciByZWZQYXRoID0gXy5pc0FycmF5KHJlZlBhdGhPclB0cikgPyByZWZQYXRoT3JQdHIgOiBKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIocmVmUGF0aE9yUHRyKTtcbiAgdmFyIHJlZlB0ciA9IF8uaXNBcnJheShyZWZQYXRoT3JQdHIpID8gSnNvblJlZnMucGF0aFRvUG9pbnRlcihyZWZQYXRoT3JQdHIpIDogcmVmUGF0aE9yUHRyO1xuICB2YXIgY29kZTtcbiAgdmFyIGRlZjtcbiAgdmFyIGRpc3BsYXlJZDtcbiAgdmFyIG1zZ1ByZWZpeDtcbiAgdmFyIHR5cGU7XG5cbiAgLy8gT25seSBwb3NzaWJsZSB3aGVuIGRlZlBhdGhPclB0ciBpcyBhIHN0cmluZyBhbmQgaXMgbm90IGEgcmVhbCBwb2ludGVyXG4gIGlmIChkZWZQYXRoLmxlbmd0aCA9PT0gMCkge1xuICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdJTlZBTElEX1JFRkVSRU5DRScsICdOb3QgYSB2YWxpZCBKU09OIFJlZmVyZW5jZScsIHJlZlBhdGgsIHJlc3VsdHMuZXJyb3JzKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBkZWYgPSBjYWNoZUVudHJ5LmRlZmluaXRpb25zW2RlZlB0cl07XG4gIHR5cGUgPSBkZWZQYXRoWzBdO1xuICBjb2RlID0gdHlwZSA9PT0gJ3NlY3VyaXR5RGVmaW5pdGlvbnMnID9cbiAgICAgICAgICAgICAgICAgICAgJ1NFQ1VSSVRZX0RFRklOSVRJT04nIDpcbiAgICAgICAgICAgICAgICAgICAgdHlwZS5zdWJzdHJpbmcoMCwgdHlwZS5sZW5ndGggLSAxKS50b1VwcGVyQ2FzZSgpO1xuICBkaXNwbGF5SWQgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBkZWZQYXRoW2RlZlBhdGgubGVuZ3RoIC0gMV0gOiBkZWZQdHI7XG4gIG1zZ1ByZWZpeCA9IHR5cGUgPT09ICdzZWN1cml0eURlZmluaXRpb25zJyA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgJ1NlY3VyaXR5IGRlZmluaXRpb24nIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICBjb2RlLmNoYXJBdCgwKSArIGNvZGUuc3Vic3RyaW5nKDEpLnRvTG93ZXJDYXNlKCk7XG5cbiAgLy8gVGhpcyBpcyBhbiBhdXRob3JpemF0aW9uIHNjb3BlIHJlZmVyZW5jZVxuICBpZiAoWydhdXRob3JpemF0aW9ucycsICdzZWN1cml0eURlZmluaXRpb25zJ10uaW5kZXhPZihkZWZQYXRoWzBdKSA+IC0xICYmIGRlZlBhdGhbMl0gPT09ICdzY29wZXMnKSB7XG4gICAgY29kZSArPSAnX1NDT1BFJztcbiAgICBtc2dQcmVmaXggKz0gJyBzY29wZSc7XG4gIH1cblxuICBpZiAoXy5pc1VuZGVmaW5lZChkZWYpKSB7XG4gICAgaWYgKCFvbWl0RXJyb3IpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlJFU09MVkFCTEVfJyArIGNvZGUsIG1zZ1ByZWZpeCArICcgY291bGQgbm90IGJlIHJlc29sdmVkOiAnICsgZGlzcGxheUlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVmUGF0aCwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cblxuICAgIHJlc3VsdCA9IGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKGRlZi5yZWZlcmVuY2VzKSkge1xuICAgICAgZGVmLnJlZmVyZW5jZXMgPSBbXTtcbiAgICB9XG5cbiAgICBkZWYucmVmZXJlbmNlcy5wdXNoKHJlZlB0cik7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIGdldE9yQ29tcG9zZVNjaGVtYSA9IGZ1bmN0aW9uIGdldE9yQ29tcG9zZVNjaGVtYSAoZG9jdW1lbnRNZXRhZGF0YSwgbW9kZWxJZCkge1xuICB2YXIgdGl0bGUgPSAnQ29tcG9zZWQgJyArIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKG1vZGVsSWQpLnBvcCgpIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbElkKTtcbiAgdmFyIG1ldGFkYXRhID0gZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1ttb2RlbElkXTtcbiAgdmFyIG9yaWdpbmFsVCA9IHRyYXZlcnNlKGRvY3VtZW50TWV0YWRhdGEub3JpZ2luYWwpO1xuICB2YXIgcmVzb2x2ZWRUID0gdHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCk7XG4gIHZhciBjb21wb3NlZDtcbiAgdmFyIG9yaWdpbmFsO1xuXG4gIGlmICghbWV0YWRhdGEpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgb3JpZ2luYWwgPSBfLmNsb25lRGVlcChvcmlnaW5hbFQuZ2V0KEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihtb2RlbElkKSkpO1xuICBjb21wb3NlZCA9IF8uY2xvbmVEZWVwKHJlc29sdmVkVC5nZXQoSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKG1vZGVsSWQpKSk7XG5cbiAgLy8gQ29udmVydCB0aGUgU3dhZ2dlciAxLjIgZG9jdW1lbnQgdG8gYSB2YWxpZCBKU09OIFNjaGVtYSBmaWxlXG4gIGlmIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgIC8vIENyZWF0ZSBpbmhlcml0YW5jZSBtb2RlbFxuICAgIGlmIChtZXRhZGF0YS5saW5lYWdlLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbXBvc2VkLmFsbE9mID0gW107XG5cbiAgICAgIF8uZWFjaChtZXRhZGF0YS5saW5lYWdlLCBmdW5jdGlvbiAobW9kZWxJZCkge1xuICAgICAgICBjb21wb3NlZC5hbGxPZi5wdXNoKGdldE9yQ29tcG9zZVNjaGVtYShkb2N1bWVudE1ldGFkYXRhLCBtb2RlbElkKSk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgdGhlIHN1YlR5cGVzIHByb3BlcnR5XG4gICAgZGVsZXRlIGNvbXBvc2VkLnN1YlR5cGVzO1xuXG4gICAgXy5lYWNoKGNvbXBvc2VkLnByb3BlcnRpZXMsIGZ1bmN0aW9uIChwcm9wZXJ0eSwgbmFtZSkge1xuICAgICAgdmFyIG9Qcm9wID0gb3JpZ2luYWwucHJvcGVydGllc1tuYW1lXTtcblxuICAgICAgLy8gQ29udmVydCB0aGUgc3RyaW5nIHZhbHVlcyB0byBudW1lcmljYWwgdmFsdWVzXG4gICAgICBfLmVhY2goWydtYXhpbXVtJywgJ21pbmltdW0nXSwgZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgaWYgKF8uaXNTdHJpbmcocHJvcGVydHlbcHJvcF0pKSB7XG4gICAgICAgICAgcHJvcGVydHlbcHJvcF0gPSBwYXJzZUZsb2F0KHByb3BlcnR5W3Byb3BdKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIF8uZWFjaChKc29uUmVmcy5maW5kUmVmcyhvUHJvcCksIGZ1bmN0aW9uIChyZWYsIHB0cikge1xuICAgICAgICB2YXIgbW9kZWxJZCA9ICcjL21vZGVscy8nICsgcmVmO1xuICAgICAgICB2YXIgZE1ldGFkYXRhID0gZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1ttb2RlbElkXTtcbiAgICAgICAgdmFyIHBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIocHRyKTtcblxuICAgICAgICBpZiAoZE1ldGFkYXRhLmxpbmVhZ2UubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHRyYXZlcnNlKHByb3BlcnR5KS5zZXQocGF0aC5zbGljZSgwLCBwYXRoLmxlbmd0aCAtIDEpLCBnZXRPckNvbXBvc2VTY2hlbWEoZG9jdW1lbnRNZXRhZGF0YSwgbW9kZWxJZCkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyYXZlcnNlKHByb3BlcnR5KS5zZXQocGF0aC5zbGljZSgwLCBwYXRoLmxlbmd0aCAtIDEpLmNvbmNhdCgndGl0bGUnKSwgJ0NvbXBvc2VkICcgKyByZWYpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFNjcnViIGlkIHByb3BlcnRpZXNcbiAgY29tcG9zZWQgPSB0cmF2ZXJzZShjb21wb3NlZCkubWFwKGZ1bmN0aW9uICh2YWwpIHtcbiAgICBpZiAodGhpcy5rZXkgPT09ICdpZCcgJiYgXy5pc1N0cmluZyh2YWwpKSB7XG4gICAgICB0aGlzLnJlbW92ZSgpO1xuICAgIH1cbiAgfSk7XG5cbiAgY29tcG9zZWQudGl0bGUgPSB0aXRsZTtcblxuICByZXR1cm4gY29tcG9zZWQ7XG59O1xuXG52YXIgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcgPSBmdW5jdGlvbiBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyAodmFsLCBjb2RlU3VmZml4LCBtc2dQcmVmaXgsIHBhdGgsIGRlc3QpIHtcbiAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOVVNFRF8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBpcyBkZWZpbmVkIGJ1dCBpcyBub3QgdXNlZDogJyArIHZhbCwgcGF0aCwgZGVzdCk7XG59O1xuXG52YXIgZ2V0RG9jdW1lbnRDYWNoZSA9IGZ1bmN0aW9uIGdldERvY3VtZW50Q2FjaGUgKGFwaURPclNPKSB7XG4gIHZhciBrZXkgPSBTcGFya01ENS5oYXNoKEpTT04uc3RyaW5naWZ5KGFwaURPclNPKSk7XG4gIHZhciBjYWNoZUVudHJ5ID0gZG9jdW1lbnRDYWNoZVtrZXldIHx8IF8uZmluZChkb2N1bWVudENhY2hlLCBmdW5jdGlvbiAoY2FjaGVFbnRyeSkge1xuICAgIHJldHVybiBjYWNoZUVudHJ5LnJlc29sdmVkSWQgPT09IGtleTtcbiAgfSk7XG5cbiAgaWYgKCFjYWNoZUVudHJ5KSB7XG4gICAgY2FjaGVFbnRyeSA9IGRvY3VtZW50Q2FjaGVba2V5XSA9IHtcbiAgICAgIGRlZmluaXRpb25zOiB7fSxcbiAgICAgIG9yaWdpbmFsOiBhcGlET3JTTyxcbiAgICAgIHJlc29sdmVkOiB1bmRlZmluZWQsXG4gICAgICBzd2FnZ2VyVmVyc2lvbjogaGVscGVycy5nZXRTd2FnZ2VyVmVyc2lvbihhcGlET3JTTylcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIGNhY2hlRW50cnk7XG59O1xuXG52YXIgaGFuZGxlVmFsaWRhdGlvbkVycm9yID0gZnVuY3Rpb24gaGFuZGxlVmFsaWRhdGlvbkVycm9yIChyZXN1bHRzLCBjYWxsYmFjaykge1xuICB2YXIgZXJyID0gbmV3IEVycm9yKCdUaGUgU3dhZ2dlciBkb2N1bWVudChzKSBhcmUgaW52YWxpZCcpO1xuXG4gIGVyci5lcnJvcnMgPSByZXN1bHRzLmVycm9ycztcbiAgZXJyLmZhaWxlZFZhbGlkYXRpb24gPSB0cnVlO1xuICBlcnIud2FybmluZ3MgPSByZXN1bHRzLndhcm5pbmdzO1xuXG4gIGlmIChyZXN1bHRzLmFwaURlY2xhcmF0aW9ucykge1xuICAgIGVyci5hcGlEZWNsYXJhdGlvbnMgPSByZXN1bHRzLmFwaURlY2xhcmF0aW9ucztcbiAgfVxuXG4gIGNhbGxiYWNrKGVycik7XG59O1xuXG52YXIgbm9ybWFsaXplUGF0aCA9IGZ1bmN0aW9uIG5vcm1hbGl6ZVBhdGggKHBhdGgpIHtcbiAgdmFyIG1hdGNoZXMgPSBwYXRoLm1hdGNoKC9cXHsoLio/KVxcfS9nKTtcbiAgdmFyIGFyZ05hbWVzID0gW107XG4gIHZhciBub3JtUGF0aCA9IHBhdGg7XG5cbiAgaWYgKG1hdGNoZXMpIHtcbiAgICBfLmVhY2gobWF0Y2hlcywgZnVuY3Rpb24gKG1hdGNoLCBpbmRleCkge1xuICAgICAgbm9ybVBhdGggPSBub3JtUGF0aC5yZXBsYWNlKG1hdGNoLCAneycgKyBpbmRleCArICd9Jyk7XG4gICAgICBhcmdOYW1lcy5wdXNoKG1hdGNoLnJlcGxhY2UoL1t7fV0vZywgJycpKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgcGF0aDogbm9ybVBhdGgsXG4gICAgYXJnczogYXJnTmFtZXNcbiAgfTtcbn07XG5cbnZhciB2YWxpZGF0ZU5vRXhpc3QgPSBmdW5jdGlvbiB2YWxpZGF0ZU5vRXhpc3QgKGRhdGEsIHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChkYXRhKSAmJiBkYXRhLmluZGV4T2YodmFsKSA+IC0xKSB7XG4gICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBhbHJlYWR5IGRlZmluZWQ6ICcgKyB2YWwsIHBhdGgsIGRlc3QpO1xuICB9XG59O1xuXG52YXIgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyA9IGZ1bmN0aW9uIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMgKGRvY3VtZW50TWV0YWRhdGEsIHNjaGVtYSwgcGF0aCwgcmVzdWx0cywgc2tpcCkge1xuICB0cnkge1xuICAgIHZhbGlkYXRvcnMudmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uLCBzY2hlbWEsIHBhdGgsIHVuZGVmaW5lZCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmICghc2tpcCkge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoZXJyLmNvZGUsIGVyci5tZXNzYWdlLCBlcnIucGF0aCwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cbiAgfVxufTtcblxudmFyIHByb2Nlc3NEb2N1bWVudCA9IGZ1bmN0aW9uIHByb2Nlc3NEb2N1bWVudCAoZG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cykge1xuICB2YXIgc3dhZ2dlclZlcnNpb24gPSBkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uO1xuICB2YXIgZ2V0RGVmaW5pdGlvbk1ldGFkYXRhID0gZnVuY3Rpb24gZ2V0RGVmaW5pdGlvbk1ldGFkYXRhIChkZWZQYXRoLCBpbmxpbmUpIHtcbiAgICB2YXIgZGVmUHRyID0gSnNvblJlZnMucGF0aFRvUG9pbnRlcihkZWZQYXRoKTtcbiAgICB2YXIgbWV0YWRhdGEgPSBkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW2RlZlB0cl07XG5cbiAgICBpZiAoIW1ldGFkYXRhKSB7XG4gICAgICBtZXRhZGF0YSA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbZGVmUHRyXSA9IHtcbiAgICAgICAgaW5saW5lOiBpbmxpbmUgfHwgZmFsc2UsXG4gICAgICAgIHJlZmVyZW5jZXM6IFtdXG4gICAgICB9O1xuXG4gICAgICAvLyBGb3IgbW9kZWwgZGVmaW5pdGlvbnMsIGFkZCB0aGUgaW5oZXJpdGFuY2UgcHJvcGVydGllc1xuICAgICAgaWYgKFsnZGVmaW5pdGlvbnMnLCAnbW9kZWxzJ10uaW5kZXhPZihKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIoZGVmUHRyKVswXSkgPiAtMSkge1xuICAgICAgICBtZXRhZGF0YS5jeWNsaWNhbCA9IGZhbHNlO1xuICAgICAgICBtZXRhZGF0YS5saW5lYWdlID0gdW5kZWZpbmVkO1xuICAgICAgICBtZXRhZGF0YS5wYXJlbnRzID0gW107XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG1ldGFkYXRhO1xuICB9O1xuICB2YXIgZ2V0RGlzcGxheUlkID0gZnVuY3Rpb24gZ2V0RGlzcGxheUlkIChpZCkge1xuICAgIHJldHVybiBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIoaWQpLnBvcCgpIDogaWQ7XG4gIH07XG4gIHZhciB3YWxrID0gZnVuY3Rpb24gd2FsayAocm9vdCwgaWQsIGxpbmVhZ2UpIHtcbiAgICB2YXIgZGVmaW5pdGlvbiA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbaWQgfHwgcm9vdF07XG5cbiAgICBpZiAoZGVmaW5pdGlvbikge1xuICAgICAgXy5lYWNoKGRlZmluaXRpb24ucGFyZW50cywgZnVuY3Rpb24gKHBhcmVudCkge1xuICAgICAgICBsaW5lYWdlLnB1c2gocGFyZW50KTtcblxuICAgICAgICBpZiAocm9vdCAhPT0gcGFyZW50KSB7XG4gICAgICAgICAgd2Fsayhyb290LCBwYXJlbnQsIGxpbmVhZ2UpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG4gIHZhciBhdXRoRGVmc1Byb3AgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnYXV0aG9yaXphdGlvbnMnIDogJ3NlY3VyaXR5RGVmaW5pdGlvbnMnO1xuICB2YXIgbW9kZWxEZWZzUHJvcCA9IHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdtb2RlbHMnIDogJ2RlZmluaXRpb25zJztcblxuICAvLyBQcm9jZXNzIGF1dGhvcml6YXRpb24gZGVmaW5pdGlvbnNcbiAgXy5lYWNoKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWRbYXV0aERlZnNQcm9wXSwgZnVuY3Rpb24gKGF1dGhvcml6YXRpb24sIG5hbWUpIHtcbiAgICB2YXIgc2VjdXJpdHlEZWZQYXRoID0gW2F1dGhEZWZzUHJvcCwgbmFtZV07XG5cbiAgICAvLyBTd2FnZ2VyIDEuMiBvbmx5IGhhcyBhdXRob3JpemF0aW9uIGRlZmluaXRpb25zIGluIHRoZSBSZXNvdXJjZSBMaXN0aW5nXG4gICAgaWYgKHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyAmJiAhYXV0aG9yaXphdGlvbi50eXBlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRoZSBhdXRob3JpemF0aW9uIGRlZmluaXRpb24gbWV0YWRhdGFcbiAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEoc2VjdXJpdHlEZWZQYXRoKTtcblxuICAgIF8ucmVkdWNlKGF1dGhvcml6YXRpb24uc2NvcGVzLCBmdW5jdGlvbiAoc2VlblNjb3Blcywgc2NvcGUsIGluZGV4T3JOYW1lKSB7XG4gICAgICB2YXIgc2NvcGVOYW1lID0gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gc2NvcGUuc2NvcGUgOiBpbmRleE9yTmFtZTtcbiAgICAgIHZhciBzY29wZURlZlBhdGggPSBzZWN1cml0eURlZlBhdGguY29uY2F0KFsnc2NvcGVzJywgaW5kZXhPck5hbWUudG9TdHJpbmcoKV0pO1xuICAgICAgdmFyIHNjb3BlTWV0YWRhdGEgPSBnZXREZWZpbml0aW9uTWV0YWRhdGEoc2VjdXJpdHlEZWZQYXRoLmNvbmNhdChbJ3Njb3BlcycsIHNjb3BlTmFtZV0pKTtcblxuICAgICAgc2NvcGVNZXRhZGF0YS5zY29wZVBhdGggPSBzY29wZURlZlBhdGg7XG5cbiAgICAgIC8vIElkZW50aWZ5IGR1cGxpY2F0ZSBhdXRob3JpemF0aW9uIHNjb3BlIGRlZmluZWQgaW4gdGhlIFJlc291cmNlIExpc3RpbmdcbiAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuU2NvcGVzLCBzY29wZU5hbWUsICdBVVRIT1JJWkFUSU9OX1NDT1BFX0RFRklOSVRJT04nLCAnQXV0aG9yaXphdGlvbiBzY29wZSBkZWZpbml0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBzY29wZURlZlBhdGguY29uY2F0KCdzY29wZScpIDogc2NvcGVEZWZQYXRoLCByZXN1bHRzLndhcm5pbmdzKTtcblxuICAgICAgc2VlblNjb3Blcy5wdXNoKHNjb3BlTmFtZSk7XG5cbiAgICAgIHJldHVybiBzZWVuU2NvcGVzO1xuICAgIH0sIFtdKTtcbiAgfSk7XG5cbiAgLy8gUHJvY2VzIG1vZGVsIGRlZmluaXRpb25zXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkW21vZGVsRGVmc1Byb3BdLCBmdW5jdGlvbiAobW9kZWwsIG1vZGVsSWQpIHtcbiAgICB2YXIgbW9kZWxEZWZQYXRoID0gW21vZGVsRGVmc1Byb3AsIG1vZGVsSWRdO1xuICAgIHZhciBtb2RlbE1ldGFkYXRhID0gZ2V0RGVmaW5pdGlvbk1ldGFkYXRhKG1vZGVsRGVmUGF0aCk7XG5cbiAgICAvLyBJZGVudGlmeSBtb2RlbCBpZCBtaXNtYXRjaCAoSWQgaW4gbW9kZWxzIG9iamVjdCBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIG1vZGVsJ3MgaWQgaW4gdGhlIG1vZGVscyBvYmplY3QpXG4gICAgaWYgKHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyAmJiBtb2RlbElkICE9PSBtb2RlbC5pZCkge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01PREVMX0lEX01JU01BVENIJywgJ01vZGVsIGlkIGRvZXMgbm90IG1hdGNoIGlkIGluIG1vZGVscyBvYmplY3Q6ICcgKyBtb2RlbC5pZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsRGVmUGF0aC5jb25jYXQoJ2lkJyksIHJlc3VsdHMuZXJyb3JzKTtcbiAgICB9XG5cbiAgICAvLyBEbyBub3QgcmVwcm9jZXNzIHBhcmVudHMvcmVmZXJlbmNlcyBpZiBhbHJlYWR5IHByb2Nlc3NlZFxuICAgIGlmIChfLmlzVW5kZWZpbmVkKG1vZGVsTWV0YWRhdGEubGluZWFnZSkpIHtcbiAgICAgIC8vIEhhbmRsZSBpbmhlcml0YW5jZSByZWZlcmVuY2VzXG4gICAgICBzd2l0Y2ggKHN3YWdnZXJWZXJzaW9uKSB7XG4gICAgICBjYXNlICcxLjInOlxuICAgICAgICBfLmVhY2gobW9kZWwuc3ViVHlwZXMsIGZ1bmN0aW9uIChzdWJUeXBlLCBpbmRleCkge1xuICAgICAgICAgIHZhciBzdWJQYXRoID0gWydtb2RlbHMnLCBzdWJUeXBlXTtcbiAgICAgICAgICB2YXIgc3ViUHRyID0gSnNvblJlZnMucGF0aFRvUG9pbnRlcihzdWJQYXRoKTtcbiAgICAgICAgICB2YXIgc3ViTWV0YWRhdGEgPSBkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW3N1YlB0cl07XG4gICAgICAgICAgdmFyIHJlZlBhdGggPSBtb2RlbERlZlBhdGguY29uY2F0KFsnc3ViVHlwZXMnLCBpbmRleC50b1N0cmluZygpXSk7XG5cbiAgICAgICAgICAvLyBJZiB0aGUgbWV0YWRhdGEgZG9lcyBub3QgeWV0IGV4aXN0LCBjcmVhdGUgaXRcbiAgICAgICAgICBpZiAoIXN1Yk1ldGFkYXRhICYmIGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWRbbW9kZWxEZWZzUHJvcF1bc3ViVHlwZV0pIHtcbiAgICAgICAgICAgIHN1Yk1ldGFkYXRhID0gZ2V0RGVmaW5pdGlvbk1ldGFkYXRhKHN1YlBhdGgpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIElmIHRoZSByZWZlcmVuY2UgaXMgdmFsaWQsIGFkZCB0aGUgcGFyZW50XG4gICAgICAgICAgaWYgKGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBzdWJQYXRoLCByZWZQYXRoLCByZXN1bHRzKSkge1xuICAgICAgICAgICAgc3ViTWV0YWRhdGEucGFyZW50cy5wdXNoKEpzb25SZWZzLnBhdGhUb1BvaW50ZXIobW9kZWxEZWZQYXRoKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBicmVhaztcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgXy5lYWNoKGRvY3VtZW50TWV0YWRhdGEub3JpZ2luYWxbbW9kZWxEZWZzUHJvcF1bbW9kZWxJZF0uYWxsT2YsIGZ1bmN0aW9uIChzY2hlbWEsIGluZGV4KSB7XG4gICAgICAgICAgdmFyIGlzSW5saW5lID0gZmFsc2U7XG4gICAgICAgICAgdmFyIHBhcmVudFBhdGg7XG5cbiAgICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChzY2hlbWEuJHJlZikgfHwgSnNvblJlZnMuaXNSZW1vdGVQb2ludGVyKHNjaGVtYS4kcmVmKSkge1xuICAgICAgICAgICAgaXNJbmxpbmUgPSB0cnVlO1xuICAgICAgICAgICAgcGFyZW50UGF0aCA9IG1vZGVsRGVmUGF0aC5jb25jYXQoWydhbGxPZicsIGluZGV4LnRvU3RyaW5nKCldKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGFyZW50UGF0aCA9IEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihzY2hlbWEuJHJlZik7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gSWYgdGhlIHBhcmVudCBtb2RlbCBkb2VzIG5vdCBleGlzdCwgZG8gbm90IGNyZWF0ZSBpdHMgbWV0YWRhdGFcbiAgICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQodHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCkuZ2V0KHBhcmVudFBhdGgpKSkge1xuICAgICAgICAgICAgLy8gQ3JlYXRlIG1ldGFkYXRhIGZvciBwYXJlbnRcbiAgICAgICAgICAgIGdldERlZmluaXRpb25NZXRhZGF0YShwYXJlbnRQYXRoLCBpc0lubGluZSk7XG5cbiAgICAgICAgICAgIG1vZGVsTWV0YWRhdGEucGFyZW50cy5wdXNoKEpzb25SZWZzLnBhdGhUb1BvaW50ZXIocGFyZW50UGF0aCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICBzd2l0Y2ggKHN3YWdnZXJWZXJzaW9uKSB7XG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gUHJvY2VzcyBwYXJhbWV0ZXIgZGVmaW5pdGlvbnNcbiAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAocGFyYW1ldGVyLCBuYW1lKSB7XG4gICAgICB2YXIgcGF0aCA9IFsncGFyYW1ldGVycycsIG5hbWVdO1xuXG4gICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGF0aCk7XG5cbiAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcGFyYW1ldGVyLCBwYXRoLCByZXN1bHRzKTtcbiAgICB9KTtcblxuICAgIC8vIFByb2Nlc3MgcmVzcG9uc2UgZGVmaW5pdGlvbnNcbiAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5yZXNwb25zZXMsIGZ1bmN0aW9uIChyZXNwb25zZSwgbmFtZSkge1xuICAgICAgdmFyIHBhdGggPSBbJ3Jlc3BvbnNlcycsIG5hbWVdO1xuXG4gICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGF0aCk7XG5cbiAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcmVzcG9uc2UsIHBhdGgsIHJlc3VsdHMpO1xuICAgIH0pO1xuXG4gICAgYnJlYWs7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSBkZWZpbml0aW9uL21vZGVscyAoSW5oZXJpdGFuY2UsIHByb3BlcnR5IGRlZmluaXRpb25zLCAuLi4pXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zLCBmdW5jdGlvbiAobWV0YWRhdGEsIGlkKSB7XG4gICAgdmFyIGRlZlBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIoaWQpO1xuICAgIHZhciBkZWZpbml0aW9uID0gdHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5vcmlnaW5hbCkuZ2V0KGRlZlBhdGgpO1xuICAgIHZhciBkZWZQcm9wID0gZGVmUGF0aFswXTtcbiAgICB2YXIgY29kZSA9IGRlZlByb3Auc3Vic3RyaW5nKDAsIGRlZlByb3AubGVuZ3RoIC0gMSkudG9VcHBlckNhc2UoKTtcbiAgICB2YXIgbXNnUHJlZml4ID0gY29kZS5jaGFyQXQoMCkgKyBjb2RlLnN1YnN0cmluZygxKS50b0xvd2VyQ2FzZSgpO1xuICAgIHZhciBkUHJvcGVydGllcztcbiAgICB2YXIgaVByb3BlcnRpZXM7XG4gICAgdmFyIGxpbmVhZ2U7XG5cbiAgICAvLyBUaGUgb25seSBjaGVja3Mgd2UgcGVyZm9ybSBiZWxvdyBhcmUgaW5oZXJpdGFuY2UgY2hlY2tzIHNvIHNraXAgYWxsIG5vbi1tb2RlbCBkZWZpbml0aW9uc1xuICAgIGlmIChbJ2RlZmluaXRpb25zJywgJ21vZGVscyddLmluZGV4T2YoZGVmUHJvcCkgPT09IC0xKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZFByb3BlcnRpZXMgPSBbXTtcbiAgICBpUHJvcGVydGllcyA9IFtdO1xuICAgIGxpbmVhZ2UgPSBtZXRhZGF0YS5saW5lYWdlO1xuXG4gICAgLy8gRG8gbm90IHJlcHJvY2VzcyBsaW5lYWdlIGlmIGFscmVhZHkgcHJvY2Vzc2VkXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobGluZWFnZSkpIHtcbiAgICAgIGxpbmVhZ2UgPSBbXTtcblxuICAgICAgd2FsayhpZCwgdW5kZWZpbmVkLCBsaW5lYWdlKTtcblxuICAgICAgLy8gUm9vdCA+IG5leHQgPiAuLi5cbiAgICAgIGxpbmVhZ2UucmV2ZXJzZSgpO1xuXG4gICAgICBtZXRhZGF0YS5saW5lYWdlID0gXy5jbG9uZURlZXAobGluZWFnZSk7XG5cbiAgICAgIG1ldGFkYXRhLmN5Y2xpY2FsID0gbGluZWFnZS5sZW5ndGggPiAxICYmIGxpbmVhZ2VbMF0gPT09IGlkO1xuICAgIH1cblxuICAgIC8vIFN3YWdnZXIgMS4yIGRvZXMgbm90IGFsbG93IG11bHRpcGxlIGluaGVyaXRhbmNlIHdoaWxlIFN3YWdnZXIgMi4wKyBkb2VzXG4gICAgaWYgKG1ldGFkYXRhLnBhcmVudHMubGVuZ3RoID4gMSAmJiBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNVUxUSVBMRV8nICsgY29kZSArICdfSU5IRVJJVEFOQ0UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0NoaWxkICcgKyBjb2RlLnRvTG93ZXJDYXNlKCkgKyAnIGlzIHN1YiB0eXBlIG9mIG11bHRpcGxlIG1vZGVsczogJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBfLm1hcChtZXRhZGF0YS5wYXJlbnRzLCBmdW5jdGlvbiAocGFyZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBnZXREaXNwbGF5SWQocGFyZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pLmpvaW4oJyAmJiAnKSwgZGVmUGF0aCwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cblxuICAgIGlmIChtZXRhZGF0YS5jeWNsaWNhbCkge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0NZQ0xJQ0FMXycgKyBjb2RlICsgJ19JTkhFUklUQU5DRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBtc2dQcmVmaXggKyAnIGhhcyBhIGNpcmN1bGFyIGluaGVyaXRhbmNlOiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXy5tYXAobGluZWFnZSwgZnVuY3Rpb24gKGRlcCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBnZXREaXNwbGF5SWQoZGVwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuam9pbignIC0+ICcpICsgJyAtPiAnICsgZ2V0RGlzcGxheUlkKGlkKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZQYXRoLmNvbmNhdChzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnc3ViVHlwZXMnIDogJ2FsbE9mJyksIHJlc3VsdHMuZXJyb3JzKTtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgc2VsZiByZWZlcmVuY2UgZnJvbSB0aGUgZW5kIG9mIHRoZSBsaW5lYWdlIChGcm9udCB0b28gaWYgY3ljbGljYWwpXG4gICAgXy5lYWNoKGxpbmVhZ2Uuc2xpY2UobWV0YWRhdGEuY3ljbGljYWwgPyAxIDogMCksIGZ1bmN0aW9uIChpZCkge1xuICAgICAgdmFyIHBNb2RlbCA9IHRyYXZlcnNlKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpLmdldChKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIoaWQpKTtcblxuICAgICAgXy5lYWNoKE9iamVjdC5rZXlzKHBNb2RlbC5wcm9wZXJ0aWVzIHx8IHt9KSwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgaWYgKGlQcm9wZXJ0aWVzLmluZGV4T2YobmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgaVByb3BlcnRpZXMucHVzaChuYW1lKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBWYWxpZGF0ZSBzaW1wbGUgZGVmaW5pdGlvbnNcbiAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEsIGRlZmluaXRpb24sIGRlZlBhdGgsIHJlc3VsdHMpO1xuXG4gICAgLy8gSWRlbnRpZnkgcmVkZWNsYXJlZCBwcm9wZXJ0aWVzXG4gICAgXy5lYWNoKGRlZmluaXRpb24ucHJvcGVydGllcywgZnVuY3Rpb24gKHByb3BlcnR5LCBuYW1lKSB7XG4gICAgICB2YXIgcFBhdGggPSBkZWZQYXRoLmNvbmNhdChbJ3Byb3BlcnRpZXMnLCBuYW1lXSk7XG5cbiAgICAgIC8vIERvIG5vdCBwcm9jZXNzIHVucmVzb2x2ZWQgcHJvcGVydGllc1xuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHByb3BlcnR5KSkge1xuICAgICAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEsIHByb3BlcnR5LCBwUGF0aCwgcmVzdWx0cyk7XG5cbiAgICAgICAgaWYgKGlQcm9wZXJ0aWVzLmluZGV4T2YobmFtZSkgPiAtMSkge1xuICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdDSElMRF8nICsgY29kZSArICdfUkVERUNMQVJFU19QUk9QRVJUWScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0NoaWxkICcgKyBjb2RlLnRvTG93ZXJDYXNlKCkgKyAnIGRlY2xhcmVzIHByb3BlcnR5IGFscmVhZHkgZGVjbGFyZWQgYnkgYW5jZXN0b3I6ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcFBhdGgsIHJlc3VsdHMuZXJyb3JzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkUHJvcGVydGllcy5wdXNoKG5hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBJZGVudGlmeSBtaXNzaW5nIHJlcXVpcmVkIHByb3BlcnRpZXNcbiAgICBfLmVhY2goZGVmaW5pdGlvbi5yZXF1aXJlZCB8fCBbXSwgZnVuY3Rpb24gKG5hbWUsIGluZGV4KSB7XG4gICAgICB2YXIgdHlwZSA9IHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdNb2RlbCcgOiAnRGVmaW5pdGlvbic7XG5cbiAgICAgIGlmIChpUHJvcGVydGllcy5pbmRleE9mKG5hbWUpID09PSAtMSAmJiBkUHJvcGVydGllcy5pbmRleE9mKG5hbWUpID09PSAtMSkge1xuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUlTU0lOR19SRVFVSVJFRF8nICsgdHlwZS50b1VwcGVyQ2FzZSgpICsgJ19QUk9QRVJUWScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGUgKyAnIHJlcXVpcmVzIHByb3BlcnR5IGJ1dCBpdCBpcyBub3QgZGVmaW5lZDogJyArIG5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZlBhdGguY29uY2F0KFsncmVxdWlyZWQnLCBpbmRleC50b1N0cmluZygpXSksIHJlc3VsdHMuZXJyb3JzKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gUHJvY2VzcyByZWZlcmVuY2VzIChPbmx5IHByb2Nlc3NlcyBKU09OIFJlZmVyZW5jZXMsIGFsbCBvdGhlciByZWZlcmVuY2VzIGFyZSBoYW5kbGVkIHdoZXJlIGVuY291bnRlcmVkKVxuICBfLmVhY2goSnNvblJlZnMuZmluZFJlZnMoZG9jdW1lbnRNZXRhZGF0YS5vcmlnaW5hbCksIGZ1bmN0aW9uIChyZWYsIHJlZlB0cikge1xuXG4gICAgaWYgKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICByZWYgPSAnIy9tb2RlbHMvJyArIHJlZjtcbiAgICB9XG5cbiAgICAvLyBPbmx5IHByb2Nlc3MgbG9jYWwgcmVmZXJlbmNlc1xuICAgIGlmICghSnNvblJlZnMuaXNSZW1vdGVQb2ludGVyKHJlZikpIHtcbiAgICAgIGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCByZWYsIHJlZlB0ciwgcmVzdWx0cyk7XG4gICAgfVxuICB9KTtcbn07XG5cbnZhciB2YWxpZGF0ZUV4aXN0ID0gZnVuY3Rpb24gdmFsaWRhdGVFeGlzdCAoZGF0YSwgdmFsLCBjb2RlU3VmZml4LCBtc2dQcmVmaXgsIHBhdGgsIGRlc3QpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGRhdGEpICYmIGRhdGEuaW5kZXhPZih2YWwpID09PSAtMSkge1xuICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlJFU09MVkFCTEVfJyArIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCArICcgY291bGQgbm90IGJlIHJlc29sdmVkOiAnICsgdmFsLCBwYXRoLCBkZXN0KTtcbiAgfVxufTtcblxudmFyIHByb2Nlc3NBdXRoUmVmcyA9IGZ1bmN0aW9uIHByb2Nlc3NBdXRoUmVmcyAoZG9jdW1lbnRNZXRhZGF0YSwgYXV0aFJlZnMsIHBhdGgsIHJlc3VsdHMpIHtcbiAgdmFyIGNvZGUgPSBkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdBVVRIT1JJWkFUSU9OJyA6ICdTRUNVUklUWV9ERUZJTklUSU9OJztcbiAgdmFyIG1zZ1ByZWZpeCA9IGNvZGUgPT09ICdBVVRIT1JJWkFUSU9OJyA/ICdBdXRob3JpemF0aW9uJyA6ICdTZWN1cml0eSBkZWZpbml0aW9uJztcblxuICBpZiAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICBfLnJlZHVjZShhdXRoUmVmcywgZnVuY3Rpb24gKHNlZW5OYW1lcywgc2NvcGVzLCBuYW1lKSB7XG4gICAgICB2YXIgYXV0aFB0ciA9IFsnYXV0aG9yaXphdGlvbnMnLCBuYW1lXTtcbiAgICAgIHZhciBhUGF0aCA9IHBhdGguY29uY2F0KFtuYW1lXSk7XG5cbiAgICAgIC8vIEFkZCByZWZlcmVuY2Ugb3IgcmVjb3JkIHVucmVzb2x2ZWQgYXV0aG9yaXphdGlvblxuICAgICAgaWYgKGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBhdXRoUHRyLCBhUGF0aCwgcmVzdWx0cykpIHtcbiAgICAgICAgXy5yZWR1Y2Uoc2NvcGVzLCBmdW5jdGlvbiAoc2VlblNjb3Blcywgc2NvcGUsIGluZGV4KSB7XG4gICAgICAgICAgdmFyIHNQYXRoID0gYVBhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCksICdzY29wZScpO1xuICAgICAgICAgIHZhciBzUHRyID0gYXV0aFB0ci5jb25jYXQoWydzY29wZXMnLCBzY29wZS5zY29wZV0pO1xuXG4gICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5TY29wZXMsIHNjb3BlLnNjb3BlLCBjb2RlICsgJ19TQ09QRV9SRUZFUkVOQ0UnLCBtc2dQcmVmaXggKyAnIHNjb3BlIHJlZmVyZW5jZScsIHNQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLndhcm5pbmdzKTtcblxuICAgICAgICAgIC8vIEFkZCByZWZlcmVuY2Ugb3IgcmVjb3JkIHVucmVzb2x2ZWQgYXV0aG9yaXphdGlvbiBzY29wZVxuICAgICAgICAgIGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBzUHRyLCBzUGF0aCwgcmVzdWx0cyk7XG5cbiAgICAgICAgICByZXR1cm4gc2VlblNjb3Blcy5jb25jYXQoc2NvcGUuc2NvcGUpO1xuICAgICAgICB9LCBbXSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzZWVuTmFtZXMuY29uY2F0KG5hbWUpO1xuICAgIH0sIFtdKTtcbiAgfSBlbHNlIHtcbiAgICBfLnJlZHVjZShhdXRoUmVmcywgZnVuY3Rpb24gKHNlZW5OYW1lcywgc2NvcGVzLCBpbmRleCkge1xuICAgICAgXy5lYWNoKHNjb3BlcywgZnVuY3Rpb24gKHNjb3BlcywgbmFtZSkge1xuICAgICAgICB2YXIgYXV0aFB0ciA9IFsnc2VjdXJpdHlEZWZpbml0aW9ucycsIG5hbWVdO1xuICAgICAgICB2YXIgYXV0aFJlZlBhdGggPSBwYXRoLmNvbmNhdChpbmRleC50b1N0cmluZygpLCBuYW1lKTtcblxuICAgICAgICAvLyBFbnN1cmUgdGhlIHNlY3VyaXR5IGRlZmluaXRpb24gaXNuJ3QgcmVmZXJlbmNlZCBtb3JlIHRoYW4gb25jZSAoU3dhZ2dlciAyLjArKVxuICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2Vlbk5hbWVzLCBuYW1lLCBjb2RlICsgJ19SRUZFUkVOQ0UnLCBtc2dQcmVmaXggKyAnIHJlZmVyZW5jZScsIGF1dGhSZWZQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy53YXJuaW5ncyk7XG5cbiAgICAgICAgc2Vlbk5hbWVzLnB1c2gobmFtZSk7XG5cbiAgICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uXG4gICAgICAgIGlmIChhZGRSZWZlcmVuY2UoZG9jdW1lbnRNZXRhZGF0YSwgYXV0aFB0ciwgYXV0aFJlZlBhdGgsIHJlc3VsdHMpKSB7XG4gICAgICAgICAgXy5lYWNoKHNjb3BlcywgZnVuY3Rpb24gKHNjb3BlLCBpbmRleCkge1xuICAgICAgICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uIHNjb3BlXG4gICAgICAgICAgICB2YXIgc1B0ciA9IGF1dGhQdHIuY29uY2F0KFsnc2NvcGVzJywgc2NvcGVdKTtcbiAgICAgICAgICAgIGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBzUHRyLCBhdXRoUmVmUGF0aC5jb25jYXQoaW5kZXgudG9TdHJpbmcoKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cyk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gc2Vlbk5hbWVzO1xuICAgIH0sIFtdKTtcbiAgfVxufTtcblxudmFyIHJlc29sdmVSZWZzID0gZnVuY3Rpb24gKGFwaURPclNPLCBjYWxsYmFjaykge1xuICB2YXIgY2FjaGVFbnRyeSA9IGdldERvY3VtZW50Q2FjaGUoYXBpRE9yU08pO1xuICB2YXIgc3dhZ2dlclZlcnNpb24gPSBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGFwaURPclNPKTtcbiAgdmFyIGRvY3VtZW50VDtcblxuICBpZiAoIWNhY2hlRW50cnkucmVzb2x2ZWQpIHtcbiAgICAvLyBGb3IgU3dhZ2dlciAxLjIsIHdlIGhhdmUgdG8gY3JlYXRlIHJlYWwgSlNPTiBSZWZlcmVuY2VzXG4gICAgaWYgKHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgYXBpRE9yU08gPSBfLmNsb25lRGVlcChhcGlET3JTTyk7XG4gICAgICBkb2N1bWVudFQgPSB0cmF2ZXJzZShhcGlET3JTTyk7XG5cbiAgICAgIF8uZWFjaChKc29uUmVmcy5maW5kUmVmcyhhcGlET3JTTyksIGZ1bmN0aW9uIChyZWYsIHB0cikge1xuICAgICAgICAvLyBBbGwgU3dhZ2dlciAxLjIgcmVmZXJlbmNlcyBhcmUgQUxXQVlTIHRvIG1vZGVsc1xuICAgICAgICBkb2N1bWVudFQuc2V0KEpzb25SZWZzLnBhdGhGcm9tUG9pbnRlcihwdHIpLCAnIy9tb2RlbHMvJyArIHJlZik7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBSZXNvbHZlIHJlZmVyZW5jZXNcbiAgICBKc29uUmVmcy5yZXNvbHZlUmVmcyhhcGlET3JTTywge1xuICAgICAgcHJvY2Vzc0NvbnRlbnQ6IGZ1bmN0aW9uIChjb250ZW50KSB7XG4gICAgICAgIHJldHVybiBZQU1MLnNhZmVMb2FkKGNvbnRlbnQpO1xuICAgICAgfVxuICAgIH0sIGZ1bmN0aW9uIChlcnIsIGpzb24pIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICB9XG5cbiAgICAgIGNhY2hlRW50cnkucmVzb2x2ZWQgPSBqc29uO1xuICAgICAgY2FjaGVFbnRyeS5yZXNvbHZlZElkID0gU3BhcmtNRDUuaGFzaChKU09OLnN0cmluZ2lmeShqc29uKSk7XG5cbiAgICAgIGNhbGxiYWNrKCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgY2FsbGJhY2soKTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSA9IGZ1bmN0aW9uIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSAoc3BlYywgc2NoZW1hT3JOYW1lLCBkYXRhLCBjYWxsYmFjaykge1xuICB2YXIgdmFsaWRhdG9yID0gXy5pc1N0cmluZyhzY2hlbWFPck5hbWUpID8gc3BlYy52YWxpZGF0b3JzW3NjaGVtYU9yTmFtZV0gOiBoZWxwZXJzLmNyZWF0ZUpzb25WYWxpZGF0b3IoKTtcbiAgdmFyIGRvVmFsaWRhdGlvbiA9IGZ1bmN0aW9uIGRvVmFsaWRhdGlvbiAoKSB7XG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVBZ2FpbnN0U2NoZW1hKHNjaGVtYU9yTmFtZSwgZGF0YSwgdmFsaWRhdG9yKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIuZmFpbGVkVmFsaWRhdGlvbikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2sodW5kZWZpbmVkLCBlcnIucmVzdWx0cyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXNvbHZlUmVmcyhkYXRhLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICB9KTtcbiAgfTtcblxuICBhZGRFeHRlcm5hbFJlZnNUb1ZhbGlkYXRvcih2YWxpZGF0b3IsIGRhdGEsIGZ1bmN0aW9uIChlcnIpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICB9XG5cbiAgICBkb1ZhbGlkYXRpb24oKTtcbiAgfSk7XG59O1xuXG52YXIgdmFsaWRhdGVEZWZpbml0aW9ucyA9IGZ1bmN0aW9uIHZhbGlkYXRlRGVmaW5pdGlvbnMgKGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpIHtcbiAgLy8gVmFsaWRhdGUgdW51c2VkIGRlZmluaXRpb25zXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zLCBmdW5jdGlvbiAobWV0YWRhdGEsIGlkKSB7XG4gICAgdmFyIGRlZlBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVBvaW50ZXIoaWQpO1xuICAgIHZhciBkZWZUeXBlID0gZGVmUGF0aFswXS5zdWJzdHJpbmcoMCwgZGVmUGF0aFswXS5sZW5ndGggLSAxKTtcbiAgICB2YXIgZGlzcGxheUlkID0gZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBkZWZQYXRoW2RlZlBhdGgubGVuZ3RoIC0gMV0gOiBpZDtcbiAgICB2YXIgY29kZSA9IGRlZlR5cGUgPT09ICdzZWN1cml0eURlZmluaXRpb24nID8gJ1NFQ1VSSVRZX0RFRklOSVRJT04nIDogZGVmVHlwZS50b1VwcGVyQ2FzZSgpO1xuICAgIHZhciBtc2dQcmVmaXggPSBkZWZUeXBlID09PSAnc2VjdXJpdHlEZWZpbml0aW9uJyA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICdTZWN1cml0eSBkZWZpbml0aW9uJyA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZlR5cGUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBkZWZUeXBlLnN1YnN0cmluZygxKTtcblxuICAgIGlmIChtZXRhZGF0YS5yZWZlcmVuY2VzLmxlbmd0aCA9PT0gMCAmJiAhbWV0YWRhdGEuaW5saW5lKSB7XG4gICAgICAvLyBTd2FnZ2VyIDEuMiBhdXRob3JpemF0aW9uIHNjb3BlXG4gICAgICBpZiAobWV0YWRhdGEuc2NvcGVQYXRoKSB7XG4gICAgICAgIGNvZGUgKz0gJ19TQ09QRSc7XG4gICAgICAgIG1zZ1ByZWZpeCArPSAnIHNjb3BlJztcbiAgICAgICAgZGVmUGF0aCA9IG1ldGFkYXRhLnNjb3BlUGF0aDtcbiAgICAgIH1cblxuICAgICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcoZGlzcGxheUlkLCBjb2RlLCBtc2dQcmVmaXgsIGRlZlBhdGgsIHJlc3VsdHMud2FybmluZ3MpO1xuICAgIH1cbiAgfSk7XG59O1xuXG52YXIgdmFsaWRhdGVQYXJhbWV0ZXJzID0gZnVuY3Rpb24gdmFsaWRhdGVQYXJhbWV0ZXJzIChzcGVjLCBkb2N1bWVudE1ldGFkYXRhLCBuUGF0aCwgcGFyYW1ldGVycywgcGF0aCwgcmVzdWx0cyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNraXBNaXNzaW5nKSB7XG4gIHZhciBjcmVhdGVQYXJhbWV0ZXJDb21ib0Vycm9yID0gZnVuY3Rpb24gY3JlYXRlUGFyYW1ldGVyQ29tYm9FcnJvciAocGF0aCkge1xuICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdJTlZBTElEX1BBUkFNRVRFUl9DT01CSU5BVElPTicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ0FQSSBjYW5ub3QgaGF2ZSBhIGEgYm9keSBwYXJhbWV0ZXIgYW5kIGEgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAoc3BlYy52ZXJzaW9uID09PSAnMS4yJyA/ICdmb3JtJyA6ICdmb3JtRGF0YScpICsgJyBwYXJhbWV0ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGgsIHJlc3VsdHMuZXJyb3JzKTtcbiAgfTtcbiAgdmFyIHBhdGhQYXJhbXMgPSBbXTtcbiAgdmFyIHNlZW5Cb2R5UGFyYW0gPSBmYWxzZTtcbiAgdmFyIHNlZW5Gb3JtUGFyYW0gPSBmYWxzZTtcblxuICBfLnJlZHVjZShwYXJhbWV0ZXJzLCBmdW5jdGlvbiAoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlciwgaW5kZXgpIHtcbiAgICB2YXIgcFBhdGggPSBwYXRoLmNvbmNhdChbJ3BhcmFtZXRlcnMnLCBpbmRleC50b1N0cmluZygpXSk7XG5cbiAgICAvLyBVbnJlc29sdmVkIHBhcmFtZXRlclxuICAgIGlmIChfLmlzVW5kZWZpbmVkKHBhcmFtZXRlcikpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBJZGVudGlmeSBkdXBsaWNhdGUgcGFyYW1ldGVyIG5hbWVzXG4gICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5QYXJhbWV0ZXJzLCBwYXJhbWV0ZXIubmFtZSwgJ1BBUkFNRVRFUicsICdQYXJhbWV0ZXInLCBwUGF0aC5jb25jYXQoJ25hbWUnKSxcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xuXG4gICAgLy8gS2VlcCB0cmFjayBvZiBib2R5IGFuZCBwYXRoIHBhcmFtZXRlcnNcbiAgICBpZiAocGFyYW1ldGVyLnBhcmFtVHlwZSA9PT0gJ2JvZHknIHx8IHBhcmFtZXRlci5pbiA9PT0gJ2JvZHknKSB7XG4gICAgICBpZiAoc2VlbkJvZHlQYXJhbSA9PT0gdHJ1ZSkge1xuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFX0FQSV9CT0RZX1BBUkFNRVRFUicsICdBUEkgaGFzIG1vcmUgdGhhbiBvbmUgYm9keSBwYXJhbWV0ZXInLCBwUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xuICAgICAgfSBlbHNlIGlmIChzZWVuRm9ybVBhcmFtID09PSB0cnVlKSB7XG4gICAgICAgIGNyZWF0ZVBhcmFtZXRlckNvbWJvRXJyb3IocFBhdGgpO1xuICAgICAgfVxuXG4gICAgICBzZWVuQm9keVBhcmFtID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKHBhcmFtZXRlci5wYXJhbVR5cGUgPT09ICdmb3JtJyB8fCBwYXJhbWV0ZXIuaW4gPT09ICdmb3JtRGF0YScpIHtcbiAgICAgIGlmIChzZWVuQm9keVBhcmFtID09PSB0cnVlKSB7XG4gICAgICAgIGNyZWF0ZVBhcmFtZXRlckNvbWJvRXJyb3IocFBhdGgpO1xuICAgICAgfVxuXG4gICAgICBzZWVuRm9ybVBhcmFtID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKHBhcmFtZXRlci5wYXJhbVR5cGUgPT09ICdwYXRoJyB8fCBwYXJhbWV0ZXIuaW4gPT09ICdwYXRoJykge1xuICAgICAgaWYgKG5QYXRoLmFyZ3MuaW5kZXhPZihwYXJhbWV0ZXIubmFtZSkgPT09IC0xKSB7XG4gICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlJFU09MVkFCTEVfQVBJX1BBVEhfUEFSQU1FVEVSJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0FQSSBwYXRoIHBhcmFtZXRlciBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBwYXJhbWV0ZXIubmFtZSwgcFBhdGguY29uY2F0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcbiAgICAgIH1cblxuICAgICAgcGF0aFBhcmFtcy5wdXNoKHBhcmFtZXRlci5uYW1lKTtcbiAgICB9XG5cbiAgICBpZiAoc3BlYy5wcmltaXRpdmVzLmluZGV4T2YocGFyYW1ldGVyLnR5cGUpID09PSAtMSAmJiBzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICBhZGRSZWZlcmVuY2UoZG9jdW1lbnRNZXRhZGF0YSwgJyMvbW9kZWxzLycgKyBwYXJhbWV0ZXIudHlwZSwgcFBhdGguY29uY2F0KCd0eXBlJyksIHJlc3VsdHMpO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlciBjb25zdHJhaW50c1xuICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcGFyYW1ldGVyLCBwUGF0aCwgcmVzdWx0cywgcGFyYW1ldGVyLnNraXBFcnJvcnMpO1xuXG4gICAgcmV0dXJuIHNlZW5QYXJhbWV0ZXJzLmNvbmNhdChwYXJhbWV0ZXIubmFtZSk7XG4gIH0sIFtdKTtcblxuICAvLyBWYWxpZGF0ZSBtaXNzaW5nIHBhdGggcGFyYW1ldGVycyAoaW4gcGF0aCBidXQgbm90IGluIG9wZXJhdGlvbi5wYXJhbWV0ZXJzKVxuICBpZiAoXy5pc1VuZGVmaW5lZChza2lwTWlzc2luZykgfHwgc2tpcE1pc3NpbmcgPT09IGZhbHNlKSB7XG4gICAgXy5lYWNoKF8uZGlmZmVyZW5jZShuUGF0aC5hcmdzLCBwYXRoUGFyYW1zKSwgZnVuY3Rpb24gKHVudXNlZCkge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01JU1NJTkdfQVBJX1BBVEhfUEFSQU1FVEVSJywgJ0FQSSByZXF1aXJlcyBwYXRoIHBhcmFtZXRlciBidXQgaXQgaXMgbm90IGRlZmluZWQ6ICcgKyB1bnVzZWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/IHBhdGguc2xpY2UoMCwgMikuY29uY2F0KCdwYXRoJykgOiBwYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH0pO1xuICB9XG59O1xuXG52YXIgdmFsaWRhdGVTd2FnZ2VyMV8yID0gZnVuY3Rpb24gdmFsaWRhdGVTd2FnZ2VyMV8yIChzcGVjLCByZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucywgY2FsbGJhY2spIHsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG4gIHZhciBhZFJlc291cmNlUGF0aHMgPSBbXTtcbiAgdmFyIHJsRG9jdW1lbnRNZXRhZGF0YSA9IGdldERvY3VtZW50Q2FjaGUocmVzb3VyY2VMaXN0aW5nKTtcbiAgdmFyIHJsUmVzb3VyY2VQYXRocyA9IFtdO1xuICB2YXIgcmVzdWx0cyA9IHtcbiAgICBlcnJvcnM6IFtdLFxuICAgIHdhcm5pbmdzOiBbXSxcbiAgICBhcGlEZWNsYXJhdGlvbnM6IFtdXG4gIH07XG5cbiAgLy8gUHJvY2VzcyBSZXNvdXJjZSBMaXN0aW5nIHJlc291cmNlIGRlZmluaXRpb25zXG4gIHJsUmVzb3VyY2VQYXRocyA9IF8ucmVkdWNlKHJlc291cmNlTGlzdGluZy5hcGlzLCBmdW5jdGlvbiAoc2VlblBhdGhzLCBhcGksIGluZGV4KSB7XG4gICAgLy8gSWRlbnRpZnkgZHVwbGljYXRlIHJlc291cmNlIHBhdGhzIGRlZmluZWQgaW4gdGhlIFJlc291cmNlIExpc3RpbmdcbiAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblBhdGhzLCBhcGkucGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsIFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCksICdwYXRoJ10sXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcblxuICAgIHNlZW5QYXRocy5wdXNoKGFwaS5wYXRoKTtcblxuICAgIHJldHVybiBzZWVuUGF0aHM7XG4gIH0sIFtdKTtcblxuICAvLyBQcm9jZXNzIFJlc291cmNlIExpc3RpbmcgZGVmaW5pdGlvbnMgKGF1dGhvcml6YXRpb25zKVxuICBwcm9jZXNzRG9jdW1lbnQocmxEb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKTtcblxuXG4gIC8vIFByb2Nlc3MgZWFjaCBBUEkgRGVjbGFyYXRpb25cbiAgYWRSZXNvdXJjZVBhdGhzID0gXy5yZWR1Y2UoYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoc2VlblJlc291cmNlUGF0aHMsIGFwaURlY2xhcmF0aW9uLCBpbmRleCkge1xuICAgIHZhciBhUmVzdWx0cyA9IHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zW2luZGV4XSA9IHtcbiAgICAgIGVycm9yczogW10sXG4gICAgICB3YXJuaW5nczogW11cbiAgICB9O1xuICAgIHZhciBhZERvY3VtZW50TWV0YWRhdGEgPSBnZXREb2N1bWVudENhY2hlKGFwaURlY2xhcmF0aW9uKTtcblxuICAgIC8vIElkZW50aWZ5IGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRocyBkZWZpbmVkIGluIHRoZSBBUEkgRGVjbGFyYXRpb25zXG4gICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5SZXNvdXJjZVBhdGhzLCBhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLFxuICAgICAgICAgICAgICAgICAgICBbJ3Jlc291cmNlUGF0aCddLCBhUmVzdWx0cy5lcnJvcnMpO1xuXG4gICAgaWYgKGFkUmVzb3VyY2VQYXRocy5pbmRleE9mKGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCkgPT09IC0xKSB7XG4gICAgICAvLyBJZGVudGlmeSB1bnVzZWQgcmVzb3VyY2UgcGF0aHMgZGVmaW5lZCBpbiB0aGUgQVBJIERlY2xhcmF0aW9uc1xuICAgICAgdmFsaWRhdGVFeGlzdChybFJlc291cmNlUGF0aHMsIGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsXG4gICAgICAgICAgICAgICAgICAgIFsncmVzb3VyY2VQYXRoJ10sIGFSZXN1bHRzLmVycm9ycyk7XG5cbiAgICAgIHNlZW5SZXNvdXJjZVBhdGhzLnB1c2goYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPOiBQcm9jZXNzIGF1dGhvcml6YXRpb24gcmVmZXJlbmNlc1xuICAgIC8vIE5vdCBwb3NzaWJsZSBkdWUgdG8gaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9pc3N1ZXMvMTU5XG5cbiAgICAvLyBQcm9jZXNzIG1vZGVsc1xuICAgIHByb2Nlc3NEb2N1bWVudChhZERvY3VtZW50TWV0YWRhdGEsIGFSZXN1bHRzKTtcblxuICAgIC8vIFByb2Nlc3MgdGhlIEFQSSBkZWZpbml0aW9uc1xuICAgIF8ucmVkdWNlKGFwaURlY2xhcmF0aW9uLmFwaXMsIGZ1bmN0aW9uIChzZWVuUGF0aHMsIGFwaSwgaW5kZXgpIHtcbiAgICAgIHZhciBhUGF0aCA9IFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCldO1xuICAgICAgdmFyIG5QYXRoID0gbm9ybWFsaXplUGF0aChhcGkucGF0aCk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXG4gICAgICBpZiAoc2VlblBhdGhzLmluZGV4T2YoblBhdGgucGF0aCkgPiAtMSkge1xuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFX0FQSV9QQVRIJywgJ0FQSSBwYXRoIChvciBlcXVpdmFsZW50KSBhbHJlYWR5IGRlZmluZWQ6ICcgKyBhcGkucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYVBhdGguY29uY2F0KCdwYXRoJyksIGFSZXN1bHRzLmVycm9ycyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWVuUGF0aHMucHVzaChuUGF0aC5wYXRoKTtcbiAgICAgIH1cblxuICAgICAgLy8gUHJvY2VzcyB0aGUgQVBJIG9wZXJhdGlvbnNcbiAgICAgIF8ucmVkdWNlKGFwaS5vcGVyYXRpb25zLCBmdW5jdGlvbiAoc2Vlbk1ldGhvZHMsIG9wZXJhdGlvbiwgaW5kZXgpIHtcbiAgICAgICAgdmFyIG9QYXRoID0gYVBhdGguY29uY2F0KFsnb3BlcmF0aW9ucycsIGluZGV4LnRvU3RyaW5nKCldKTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgb3BlcmF0aW9uIG1ldGhvZFxuICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2Vlbk1ldGhvZHMsIG9wZXJhdGlvbi5tZXRob2QsICdPUEVSQVRJT05fTUVUSE9EJywgJ09wZXJhdGlvbiBtZXRob2QnLCBvUGF0aC5jb25jYXQoJ21ldGhvZCcpLFxuICAgICAgICAgICAgICAgICAgICAgICAgYVJlc3VsdHMuZXJyb3JzKTtcblxuICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIHRoZSBzZWVuIG1ldGhvZHNcbiAgICAgICAgc2Vlbk1ldGhvZHMucHVzaChvcGVyYXRpb24ubWV0aG9kKTtcblxuICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIG9wZXJhdGlvbiB0eXBlc1xuICAgICAgICBpZiAoc3BlYy5wcmltaXRpdmVzLmluZGV4T2Yob3BlcmF0aW9uLnR5cGUpID09PSAtMSAmJiBzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICAgICAgYWRkUmVmZXJlbmNlKGFkRG9jdW1lbnRNZXRhZGF0YSwgJyMvbW9kZWxzLycgKyBvcGVyYXRpb24udHlwZSwgb1BhdGguY29uY2F0KCd0eXBlJyksIGFSZXN1bHRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByb2Nlc3MgYXV0aG9yaXphdGlvbiByZWZlcmVuY2VzXG4gICAgICAgIHByb2Nlc3NBdXRoUmVmcyhybERvY3VtZW50TWV0YWRhdGEsIG9wZXJhdGlvbi5hdXRob3JpemF0aW9ucywgb1BhdGguY29uY2F0KCdhdXRob3JpemF0aW9ucycpLCBhUmVzdWx0cyk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdmFsaWRhdGUgaW5saW5lIGNvbnN0cmFpbnRzXG4gICAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoYWREb2N1bWVudE1ldGFkYXRhLCBvcGVyYXRpb24sIG9QYXRoLCBhUmVzdWx0cyk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgcGFyYW1ldGVyc1xuICAgICAgICB2YWxpZGF0ZVBhcmFtZXRlcnMoc3BlYywgYWREb2N1bWVudE1ldGFkYXRhLCBuUGF0aCwgb3BlcmF0aW9uLnBhcmFtZXRlcnMsIG9QYXRoLCBhUmVzdWx0cyk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdW5pcXVlIHJlc3BvbnNlIGNvZGVcbiAgICAgICAgXy5yZWR1Y2Uob3BlcmF0aW9uLnJlc3BvbnNlTWVzc2FnZXMsIGZ1bmN0aW9uIChzZWVuUmVzcG9uc2VDb2RlcywgcmVzcG9uc2VNZXNzYWdlLCBpbmRleCkge1xuICAgICAgICAgIHZhciBybVBhdGggPSBvUGF0aC5jb25jYXQoWydyZXNwb25zZU1lc3NhZ2VzJywgaW5kZXgudG9TdHJpbmcoKV0pO1xuXG4gICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5SZXNwb25zZUNvZGVzLCByZXNwb25zZU1lc3NhZ2UuY29kZSwgJ1JFU1BPTlNFX01FU1NBR0VfQ09ERScsICdSZXNwb25zZSBtZXNzYWdlIGNvZGUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBybVBhdGguY29uY2F0KFsnY29kZSddKSwgYVJlc3VsdHMuZXJyb3JzKTtcblxuICAgICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgbW9kZWxcbiAgICAgICAgICBpZiAocmVzcG9uc2VNZXNzYWdlLnJlc3BvbnNlTW9kZWwpIHtcbiAgICAgICAgICAgIGFkZFJlZmVyZW5jZShhZERvY3VtZW50TWV0YWRhdGEsICcjL21vZGVscy8nICsgcmVzcG9uc2VNZXNzYWdlLnJlc3BvbnNlTW9kZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgcm1QYXRoLmNvbmNhdCgncmVzcG9uc2VNb2RlbCcpLCBhUmVzdWx0cyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHNlZW5SZXNwb25zZUNvZGVzLmNvbmNhdChyZXNwb25zZU1lc3NhZ2UuY29kZSk7XG4gICAgICAgIH0sIFtdKTtcblxuICAgICAgICByZXR1cm4gc2Vlbk1ldGhvZHM7XG4gICAgICB9LCBbXSk7XG5cbiAgICAgIHJldHVybiBzZWVuUGF0aHM7XG4gICAgfSwgW10pO1xuXG4gICAgLy8gVmFsaWRhdGUgQVBJIERlY2xhcmF0aW9uIGRlZmluaXRpb25zXG4gICAgdmFsaWRhdGVEZWZpbml0aW9ucyhhZERvY3VtZW50TWV0YWRhdGEsIGFSZXN1bHRzKTtcblxuICAgIHJldHVybiBzZWVuUmVzb3VyY2VQYXRocztcbiAgfSwgW10pO1xuXG4gIC8vIFZhbGlkYXRlIEFQSSBEZWNsYXJhdGlvbiBkZWZpbml0aW9uc1xuICB2YWxpZGF0ZURlZmluaXRpb25zKHJsRG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XG5cbiAgLy8gSWRlbnRpZnkgdW51c2VkIHJlc291cmNlIHBhdGhzIGRlZmluZWQgaW4gdGhlIFJlc291cmNlIExpc3RpbmdcbiAgXy5lYWNoKF8uZGlmZmVyZW5jZShybFJlc291cmNlUGF0aHMsIGFkUmVzb3VyY2VQYXRocyksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICB2YXIgaW5kZXggPSBybFJlc291cmNlUGF0aHMuaW5kZXhPZih1bnVzZWQpO1xuXG4gICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcocmVzb3VyY2VMaXN0aW5nLmFwaXNbaW5kZXhdLnBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCksICdwYXRoJ10sIHJlc3VsdHMuZXJyb3JzKTtcbiAgfSk7XG5cbiAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXN1bHRzKTtcbn07XG5cbnZhciB2YWxpZGF0ZVN3YWdnZXIyXzAgPSBmdW5jdGlvbiB2YWxpZGF0ZVN3YWdnZXIyXzAgKHNwZWMsIHN3YWdnZXJPYmplY3QsIGNhbGxiYWNrKSB7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuICB2YXIgZG9jdW1lbnRNZXRhZGF0YSA9IGdldERvY3VtZW50Q2FjaGUoc3dhZ2dlck9iamVjdCk7XG4gIHZhciByZXN1bHRzID0ge1xuICAgIGVycm9yczogW10sXG4gICAgd2FybmluZ3M6IFtdXG4gIH07XG5cbiAgLy8gUHJvY2VzcyBkZWZpbml0aW9uc1xuICBwcm9jZXNzRG9jdW1lbnQoZG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XG5cbiAgLy8gUHJvY2VzcyBzZWN1cml0eSByZWZlcmVuY2VzXG4gIHByb2Nlc3NBdXRoUmVmcyhkb2N1bWVudE1ldGFkYXRhLCBzd2FnZ2VyT2JqZWN0LnNlY3VyaXR5LCBbJ3NlY3VyaXR5J10sIHJlc3VsdHMpO1xuXG4gIF8ucmVkdWNlKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQucGF0aHMsIGZ1bmN0aW9uIChzZWVuUGF0aHMsIHBhdGgsIG5hbWUpIHtcbiAgICB2YXIgcFBhdGggPSBbJ3BhdGhzJywgbmFtZV07XG4gICAgdmFyIG5QYXRoID0gbm9ybWFsaXplUGF0aChuYW1lKTtcblxuICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXG4gICAgaWYgKHNlZW5QYXRocy5pbmRleE9mKG5QYXRoLnBhdGgpID4gLTEpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdEVVBMSUNBVEVfQVBJX1BBVEgnLCAnQVBJIHBhdGggKG9yIGVxdWl2YWxlbnQpIGFscmVhZHkgZGVmaW5lZDogJyArIG5hbWUsIHBQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlcnNcbiAgICB2YWxpZGF0ZVBhcmFtZXRlcnMoc3BlYywgZG9jdW1lbnRNZXRhZGF0YSwgblBhdGgsIHBhdGgucGFyYW1ldGVycywgcFBhdGgsIHJlc3VsdHMsIHRydWUpO1xuXG4gICAgLy8gVmFsaWRhdGUgdGhlIE9wZXJhdGlvbnNcbiAgICBfLmVhY2gocGF0aCwgZnVuY3Rpb24gKG9wZXJhdGlvbiwgbWV0aG9kKSB7XG4gICAgICB2YXIgY1BhcmFtcyA9IFtdO1xuICAgICAgdmFyIG9QYXRoID0gcFBhdGguY29uY2F0KG1ldGhvZCk7XG4gICAgICB2YXIgc2VlblBhcmFtcyA9IFtdO1xuXG4gICAgICBpZiAodmFsaWRPcHRpb25OYW1lcy5pbmRleE9mKG1ldGhvZCkgPT09IC0xKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gUHJvY2VzcyBzZWN1cml0eSByZWZlcmVuY2VzXG4gICAgICBwcm9jZXNzQXV0aFJlZnMoZG9jdW1lbnRNZXRhZGF0YSwgb3BlcmF0aW9uLnNlY3VyaXR5LCBvUGF0aC5jb25jYXQoJ3NlY3VyaXR5JyksIHJlc3VsdHMpO1xuXG4gICAgICAvLyBDb21wb3NlIHBhcmFtZXRlcnMgZnJvbSBwYXRoIGdsb2JhbCBwYXJhbWV0ZXJzIGFuZCBvcGVyYXRpb24gcGFyYW1ldGVyc1xuICAgICAgXy5lYWNoKG9wZXJhdGlvbi5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAocGFyYW1ldGVyKSB7XG4gICAgICAgIC8vIENhbiBoYXBwZW4gd2l0aCBpbnZhbGlkIHJlZmVyZW5jZXNcbiAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQocGFyYW1ldGVyKSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNQYXJhbXMucHVzaChwYXJhbWV0ZXIpO1xuXG4gICAgICAgIHNlZW5QYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSArICc6JyArIHBhcmFtZXRlci5pbik7XG4gICAgICB9KTtcblxuICAgICAgXy5lYWNoKHBhdGgucGFyYW1ldGVycywgZnVuY3Rpb24gKHBhcmFtZXRlcikge1xuICAgICAgICB2YXIgY2xvbmVkID0gXy5jbG9uZURlZXAocGFyYW1ldGVyKTtcblxuICAgICAgICAvLyBUaGUgb25seSBlcnJvcnMgdGhhdCBjYW4gb2NjdXIgaGVyZSBhcmUgc2NoZW1hIGNvbnN0cmFpbnQgdmFsaWRhdGlvbiBlcnJvcnMgd2hpY2ggYXJlIGFscmVhZHkgcmVwb3J0ZWQgYWJvdmVcbiAgICAgICAgLy8gc28gZG8gbm90IHJlcG9ydCB0aGVtIGFnYWluLlxuICAgICAgICBjbG9uZWQuc2tpcEVycm9ycyA9IHRydWU7XG5cbiAgICAgICAgaWYgKHNlZW5QYXJhbXMuaW5kZXhPZihwYXJhbWV0ZXIubmFtZSArICc6JyArIHBhcmFtZXRlci5pbikgPT09IC0xKSB7XG4gICAgICAgICAgY1BhcmFtcy5wdXNoKGNsb25lZCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBWYWxpZGF0ZSBwYXJhbWV0ZXJzXG4gICAgICB2YWxpZGF0ZVBhcmFtZXRlcnMoc3BlYywgZG9jdW1lbnRNZXRhZGF0YSwgblBhdGgsIGNQYXJhbXMsIG9QYXRoLCByZXN1bHRzKTtcblxuICAgICAgLy8gVmFsaWRhdGUgcmVzcG9uc2VzXG4gICAgICBfLmVhY2gob3BlcmF0aW9uLnJlc3BvbnNlcywgZnVuY3Rpb24gKHJlc3BvbnNlLCByZXNwb25zZUNvZGUpIHtcbiAgICAgICAgLy8gRG8gbm90IHByb2Nlc3MgcmVmZXJlbmNlcyB0byBtaXNzaW5nIHJlc3BvbnNlc1xuICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQocmVzcG9uc2UpKSB7XG4gICAgICAgICAgLy8gVmFsaWRhdGUgdmFsaWRhdGUgaW5saW5lIGNvbnN0cmFpbnRzXG4gICAgICAgICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLCByZXNwb25zZSwgb1BhdGguY29uY2F0KCdyZXNwb25zZXMnLCByZXNwb25zZUNvZGUpLCByZXN1bHRzKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gc2VlblBhdGhzLmNvbmNhdChuUGF0aC5wYXRoKTtcbiAgfSwgW10pO1xuXG4gIC8vIFZhbGlkYXRlIGRlZmluaXRpb25zXG4gIHZhbGlkYXRlRGVmaW5pdGlvbnMoZG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XG5cbiAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXN1bHRzKTtcbn07XG5cbnZhciB2YWxpZGF0ZVNlbWFudGljYWxseSA9IGZ1bmN0aW9uIHZhbGlkYXRlU2VtYW50aWNhbGx5IChzcGVjLCBybE9yU08sIGFwaURlY2xhcmF0aW9ucywgY2FsbGJhY2spIHtcbiAgdmFyIGNiV3JhcHBlciA9IGZ1bmN0aW9uIGNiV3JhcHBlciAoZXJyLCByZXN1bHRzKSB7XG4gICAgY2FsbGJhY2soZXJyLCBoZWxwZXJzLmZvcm1hdFJlc3VsdHMocmVzdWx0cykpO1xuICB9O1xuICBpZiAoc3BlYy52ZXJzaW9uID09PSAnMS4yJykge1xuICAgIHZhbGlkYXRlU3dhZ2dlcjFfMihzcGVjLCBybE9yU08sIGFwaURlY2xhcmF0aW9ucywgY2JXcmFwcGVyKTsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG4gIH0gZWxzZSB7XG4gICAgdmFsaWRhdGVTd2FnZ2VyMl8wKHNwZWMsIHJsT3JTTywgY2JXcmFwcGVyKTsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG4gIH1cbn07XG5cbnZhciB2YWxpZGF0ZVN0cnVjdHVyYWxseSA9IGZ1bmN0aW9uIHZhbGlkYXRlU3RydWN0dXJhbGx5IChzcGVjLCBybE9yU08sIGFwaURlY2xhcmF0aW9ucywgY2FsbGJhY2spIHtcbiAgdmFsaWRhdGVBZ2FpbnN0U2NoZW1hKHNwZWMsIHNwZWMudmVyc2lvbiA9PT0gJzEuMicgPyAncmVzb3VyY2VMaXN0aW5nLmpzb24nIDogJ3NjaGVtYS5qc29uJywgcmxPclNPLFxuICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IHZhbGlkYXRlIHRoZSBBUEkgRGVjbGFyYXRpb25zIGlmIHRoZSBBUEkgaXMgMS4yIGFuZCB0aGUgUmVzb3VyY2UgTGlzdGluZyB3YXMgdmFsaWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZXN1bHRzICYmIHNwZWMudmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JzOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmdzOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFwaURlY2xhcmF0aW9uczogW11cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXN5bmMubWFwKGFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGFwaURlY2xhcmF0aW9uLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsaWRhdGVBZ2FpbnN0U2NoZW1hKHNwZWMsICdhcGlEZWNsYXJhdGlvbi5qc29uJywgYXBpRGVjbGFyYXRpb24sIGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyLCBhbGxSZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLmVhY2goYWxsUmVzdWx0cywgZnVuY3Rpb24gKHJlc3VsdCwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5hcGlEZWNsYXJhdGlvbnNbaW5kZXhdID0gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgcmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXN1bHRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgU3dhZ2dlciBzcGVjaWZpY2F0aW9uIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvbiAtIFRoZSBTd2FnZ2VyIHZlcnNpb25cbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIFNwZWNpZmljYXRpb24gPSBmdW5jdGlvbiBTcGVjaWZpY2F0aW9uICh2ZXJzaW9uKSB7XG4gIHZhciBjcmVhdGVWYWxpZGF0b3JzID0gZnVuY3Rpb24gY3JlYXRlVmFsaWRhdG9ycyAoc3BlYywgdmFsaWRhdG9yc01hcCkge1xuICAgIHJldHVybiBfLnJlZHVjZSh2YWxpZGF0b3JzTWFwLCBmdW5jdGlvbiAocmVzdWx0LCBzY2hlbWFzLCBzY2hlbWFOYW1lKSB7XG4gICAgICByZXN1bHRbc2NoZW1hTmFtZV0gPSBoZWxwZXJzLmNyZWF0ZUpzb25WYWxpZGF0b3Ioc2NoZW1hcyk7XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfS5iaW5kKHRoaXMpLCB7fSk7XG4gIH07XG4gIHZhciBmaXhTY2hlbWFJZCA9IGZ1bmN0aW9uIGZpeFNjaGVtYUlkIChzY2hlbWFOYW1lKSB7XG4gICAgLy8gU3dhZ2dlciAxLjIgc2NoZW1hIGZpbGVzIHVzZSBvbmUgaWQgYnV0IHVzZSBhIGRpZmZlcmVudCBpZCB3aGVuIHJlZmVyZW5jaW5nIHNjaGVtYSBmaWxlcy4gIFdlIGFsc28gdXNlIHRoZSBzY2hlbWFcbiAgICAvLyBmaWxlIG5hbWUgdG8gcmVmZXJlbmNlIHRoZSBzY2hlbWEgaW4gWlNjaGVtYS4gIFRvIGZpeCB0aGlzIHNvIHRoYXQgdGhlIEpTT04gU2NoZW1hIHZhbGlkYXRvciB3b3JrcyBwcm9wZXJseSwgd2VcbiAgICAvLyBuZWVkIHRvIHNldCB0aGUgaWQgdG8gYmUgdGhlIG5hbWUgb2YgdGhlIHNjaGVtYSBmaWxlLlxuICAgIHZhciBmaXhlZCA9IF8uY2xvbmVEZWVwKHRoaXMuc2NoZW1hc1tzY2hlbWFOYW1lXSk7XG5cbiAgICBmaXhlZC5pZCA9IHNjaGVtYU5hbWU7XG5cbiAgICByZXR1cm4gZml4ZWQ7XG4gIH0uYmluZCh0aGlzKTtcbiAgdmFyIHByaW1pdGl2ZXMgPSBbJ3N0cmluZycsICdudW1iZXInLCAnYm9vbGVhbicsICdpbnRlZ2VyJywgJ2FycmF5J107XG5cbiAgc3dpdGNoICh2ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgdGhpcy5kb2NzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9zd2FnZ2VyLWFwaS9zd2FnZ2VyLXNwZWMvYmxvYi9tYXN0ZXIvdmVyc2lvbnMvMS4yLm1kJztcbiAgICB0aGlzLnByaW1pdGl2ZXMgPSBfLnVuaW9uKHByaW1pdGl2ZXMsIFsndm9pZCcsICdGaWxlJ10pO1xuICAgIHRoaXMuc2NoZW1hc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL3RyZWUvbWFzdGVyL3NjaGVtYXMvdjEuMic7XG5cbiAgICAvLyBIZXJlIGV4cGxpY2l0bHkgdG8gYWxsb3cgYnJvd3NlcmlmeSB0byB3b3JrXG4gICAgdGhpcy5zY2hlbWFzID0ge1xuICAgICAgJ2FwaURlY2xhcmF0aW9uLmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9hcGlEZWNsYXJhdGlvbi5qc29uJyksXG4gICAgICAnYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJyksXG4gICAgICAnZGF0YVR5cGUuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24nKSxcbiAgICAgICdkYXRhVHlwZUJhc2UuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2RhdGFUeXBlQmFzZS5qc29uJyksXG4gICAgICAnaW5mb09iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvaW5mb09iamVjdC5qc29uJyksXG4gICAgICAnbW9kZWxzT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9tb2RlbHNPYmplY3QuanNvbicpLFxuICAgICAgJ29hdXRoMkdyYW50VHlwZS5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24nKSxcbiAgICAgICdvcGVyYXRpb25PYmplY3QuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL29wZXJhdGlvbk9iamVjdC5qc29uJyksXG4gICAgICAncGFyYW1ldGVyT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9wYXJhbWV0ZXJPYmplY3QuanNvbicpLFxuICAgICAgJ3Jlc291cmNlTGlzdGluZy5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24nKSxcbiAgICAgICdyZXNvdXJjZU9iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcmVzb3VyY2VPYmplY3QuanNvbicpXG4gICAgfTtcblxuICAgIHRoaXMudmFsaWRhdG9ycyA9IGNyZWF0ZVZhbGlkYXRvcnModGhpcywge1xuICAgICAgJ2FwaURlY2xhcmF0aW9uLmpzb24nOiBfLm1hcChbXG4gICAgICAgICdkYXRhVHlwZUJhc2UuanNvbicsXG4gICAgICAgICdtb2RlbHNPYmplY3QuanNvbicsXG4gICAgICAgICdvYXV0aDJHcmFudFR5cGUuanNvbicsXG4gICAgICAgICdhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24nLFxuICAgICAgICAncGFyYW1ldGVyT2JqZWN0Lmpzb24nLFxuICAgICAgICAnb3BlcmF0aW9uT2JqZWN0Lmpzb24nLFxuICAgICAgICAnYXBpRGVjbGFyYXRpb24uanNvbidcbiAgICAgIF0sIGZpeFNjaGVtYUlkKSxcbiAgICAgICdyZXNvdXJjZUxpc3RpbmcuanNvbic6IF8ubWFwKFtcbiAgICAgICAgJ3Jlc291cmNlT2JqZWN0Lmpzb24nLFxuICAgICAgICAnaW5mb09iamVjdC5qc29uJyxcbiAgICAgICAgJ29hdXRoMkdyYW50VHlwZS5qc29uJyxcbiAgICAgICAgJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbicsXG4gICAgICAgICdyZXNvdXJjZUxpc3RpbmcuanNvbidcbiAgICAgIF0sIGZpeFNjaGVtYUlkKVxuICAgIH0pO1xuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICB0aGlzLmRvY3NVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9ibG9iL21hc3Rlci92ZXJzaW9ucy8yLjAubWQnO1xuICAgIHRoaXMucHJpbWl0aXZlcyA9IF8udW5pb24ocHJpbWl0aXZlcywgWydmaWxlJ10pO1xuICAgIHRoaXMuc2NoZW1hc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL3RyZWUvbWFzdGVyL3NjaGVtYXMvdjIuMCc7XG5cbiAgICAvLyBIZXJlIGV4cGxpY2l0bHkgdG8gYWxsb3cgYnJvd3NlcmlmeSB0byB3b3JrXG4gICAgdGhpcy5zY2hlbWFzID0ge1xuICAgICAgJ3NjaGVtYS5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8yLjAvc2NoZW1hLmpzb24nKVxuICAgIH07XG5cbiAgICB0aGlzLnZhbGlkYXRvcnMgPSBjcmVhdGVWYWxpZGF0b3JzKHRoaXMsIHtcbiAgICAgICdzY2hlbWEuanNvbic6IFtmaXhTY2hlbWFJZCgnc2NoZW1hLmpzb24nKV1cbiAgICB9KTtcblxuICAgIGJyZWFrO1xuXG4gIGRlZmF1bHQ6XG4gICAgdGhyb3cgbmV3IEVycm9yKHZlcnNpb24gKyAnIGlzIGFuIHVuc3VwcG9ydGVkIFN3YWdnZXIgc3BlY2lmaWNhdGlvbiB2ZXJzaW9uJyk7XG4gIH1cblxuICB0aGlzLnZlcnNpb24gPSB2ZXJzaW9uO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSByZXN1bHQgb2YgdGhlIHZhbGlkYXRpb24gb2YgdGhlIFN3YWdnZXIgZG9jdW1lbnQocykuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IHJsT3JTTyAtIFRoZSBTd2FnZ2VyIFJlc291cmNlIExpc3RpbmcgKDEuMikgb3IgU3dhZ2dlciBPYmplY3QgKDIuMClcbiAqIEBwYXJhbSB7b2JqZWN0W119IFthcGlEZWNsYXJhdGlvbnNdIC0gVGhlIGFycmF5IG9mIFN3YWdnZXIgQVBJIERlY2xhcmF0aW9ucyAoMS4yKVxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXG4gKlxuICogQHJldHVybnMgdW5kZWZpbmVkIGlmIHZhbGlkYXRpb24gcGFzc2VzIG9yIGFuIG9iamVjdCBjb250YWluaW5nIGVycm9ycyBhbmQvb3Igd2FybmluZ3NcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIGFyZ3VtZW50cyBwcm92aWRlZCBhcmUgbm90IHZhbGlkXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnZhbGlkYXRlID0gZnVuY3Rpb24gdmFsaWRhdGUgKHJsT3JTTywgYXBpRGVjbGFyYXRpb25zLCBjYWxsYmFjaykge1xuICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgc3dpdGNoICh0aGlzLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXNvdXJjZUxpc3RpbmcgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNBcnJheShhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdhcGlEZWNsYXJhdGlvbnMgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQocmxPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzd2FnZ2VyT2JqZWN0IGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N3YWdnZXJPYmplY3QgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBicmVhaztcbiAgfVxuXG4gIGlmICh0aGlzLnZlcnNpb24gPT09ICcyLjAnKSB7XG4gICAgY2FsbGJhY2sgPSBhcmd1bWVudHNbMV07XG4gIH1cblxuICBpZiAoXy5pc1VuZGVmaW5lZChjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgfVxuXG4gIC8vIEZvciBTd2FnZ2VyIDIuMCwgbWFrZSBzdXJlIGFwaURlY2xhcmF0aW9ucyBpcyBhbiBlbXB0eSBhcnJheVxuICBpZiAodGhpcy52ZXJzaW9uID09PSAnMi4wJykge1xuICAgIGFwaURlY2xhcmF0aW9ucyA9IFtdO1xuICB9XG5cbiAgLy8gUGVyZm9ybSB0aGUgdmFsaWRhdGlvblxuICB2YWxpZGF0ZVN0cnVjdHVyYWxseSh0aGlzLCBybE9yU08sIGFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGVyciwgcmVzdWx0KSB7XG4gICAgaWYgKGVyciB8fCBoZWxwZXJzLmZvcm1hdFJlc3VsdHMocmVzdWx0KSkge1xuICAgICAgY2FsbGJhY2soZXJyLCByZXN1bHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWxpZGF0ZVNlbWFudGljYWxseSh0aGlzLCBybE9yU08sIGFwaURlY2xhcmF0aW9ucywgY2FsbGJhY2spO1xuICAgIH1cbiAgfS5iaW5kKHRoaXMpKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIEpTT04gU2NoZW1hIHJlcHJlc2VudGF0aW9uIG9mIGEgY29tcG9zZWQgbW9kZWwgYmFzZWQgb24gaXRzIGlkIG9yIHJlZmVyZW5jZS5cbiAqXG4gKiBOb3RlOiBGb3IgU3dhZ2dlciAxLjIsIHdlIG9ubHkgcGVyZm9ybSBzdHJ1Y3R1cmFsIHZhbGlkYXRpb24gcHJpb3IgdG8gY29tcG9zaW5nIHRoZSBtb2RlbC5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gYXBpRE9yU08gLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBBUEkgRGVjbGFyYXRpb24gKDEuMikgb3IgdGhlIFN3YWdnZXIgT2JqZWN0ICgyLjApXG4gKiBAcGFyYW0ge3N0cmluZ30gbW9kZWxJZE9yUmVmIC0gVGhlIG1vZGVsIGlkICgxLjIpIG9yIHRoZSByZWZlcmVuY2UgdG8gdGhlIG1vZGVsICgxLjIgb3IgMi4wKVxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXG4gKlxuICogQHJldHVybnMgdGhlIG9iamVjdCByZXByZXNlbnRpbmcgYSBjb21wb3NlZCBvYmplY3RcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZXJlIGFyZSB2YWxpZGF0aW9uIGVycm9ycyB3aGlsZSBjcmVhdGluZ1xuICovXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS5jb21wb3NlTW9kZWwgPSBmdW5jdGlvbiBjb21wb3NlTW9kZWwgKGFwaURPclNPLCBtb2RlbElkT3JSZWYsIGNhbGxiYWNrKSB7XG4gIHZhciBzd2FnZ2VyVmVyc2lvbiA9IGhlbHBlcnMuZ2V0U3dhZ2dlclZlcnNpb24oYXBpRE9yU08pO1xuICB2YXIgZG9Db21wb3NpdGlvbiA9IGZ1bmN0aW9uIGRvQ29tcG9zaXRpb24gKGVyciwgcmVzdWx0cykge1xuICAgIHZhciBkb2N1bWVudE1ldGFkYXRhO1xuXG4gICAgaWYgKGVycikge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgfSBlbHNlIGlmIChoZWxwZXJzLmdldEVycm9yQ291bnQocmVzdWx0cykgPiAwKSB7XG4gICAgICByZXR1cm4gaGFuZGxlVmFsaWRhdGlvbkVycm9yKHJlc3VsdHMsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBkb2N1bWVudE1ldGFkYXRhID0gZ2V0RG9jdW1lbnRDYWNoZShhcGlET3JTTyk7XG4gICAgcmVzdWx0cyA9IHtcbiAgICAgIGVycm9yczogW10sXG4gICAgICB3YXJuaW5nczogW11cbiAgICB9O1xuXG4gICAgcHJvY2Vzc0RvY3VtZW50KGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpO1xuXG4gICAgaWYgKCFkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW21vZGVsSWRPclJlZl0pIHtcbiAgICAgIHJldHVybiBjYWxsYmFjaygpO1xuICAgIH1cblxuICAgIGlmIChoZWxwZXJzLmdldEVycm9yQ291bnQocmVzdWx0cykgPiAwKSB7XG4gICAgICByZXR1cm4gaGFuZGxlVmFsaWRhdGlvbkVycm9yKHJlc3VsdHMsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBjYWxsYmFjayh1bmRlZmluZWQsIGdldE9yQ29tcG9zZVNjaGVtYShkb2N1bWVudE1ldGFkYXRhLCBtb2RlbElkT3JSZWYpKTtcbiAgfTtcblxuICBzd2l0Y2ggKHRoaXMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdhcGlEZWNsYXJhdGlvbiBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9uIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUmVmKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbElkIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3dhZ2dlck9iamVjdCBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N3YWdnZXJPYmplY3QgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JSZWYpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21vZGVsUmVmIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG4gIH1cblxuICBpZiAoXy5pc1VuZGVmaW5lZChjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgfVxuXG4gIGlmIChtb2RlbElkT3JSZWYuY2hhckF0KDApICE9PSAnIycpIHtcbiAgICBpZiAodGhpcy52ZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgbW9kZWxJZE9yUmVmID0gJyMvbW9kZWxzLycgKyBtb2RlbElkT3JSZWY7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxSZWYgbXVzdCBiZSBhIEpTT04gUG9pbnRlcicpO1xuICAgIH1cbiAgfVxuXG4gIC8vIEVuc3VyZSB0aGUgZG9jdW1lbnQgaXMgdmFsaWQgZmlyc3RcbiAgaWYgKHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSh0aGlzLCAnYXBpRGVjbGFyYXRpb24uanNvbicsIGFwaURPclNPLCBkb0NvbXBvc2l0aW9uKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnZhbGlkYXRlKGFwaURPclNPLCBkb0NvbXBvc2l0aW9uKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgYSBtb2RlbCBiYXNlZCBvbiBpdHMgaWQuXG4gKlxuICogTm90ZTogRm9yIFN3YWdnZXIgMS4yLCB3ZSBvbmx5IHBlcmZvcm0gc3RydWN0dXJhbCB2YWxpZGF0aW9uIHByaW9yIHRvIGNvbXBvc2luZyB0aGUgbW9kZWwuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IGFwaURPclNPIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgQVBJIERlY2xhcmF0aW9uICgxLjIpIG9yIHRoZSBTd2FnZ2VyIE9iamVjdCAoMi4wKVxuICogQHBhcmFtIHtzdHJpbmd9IG1vZGVsSWRPclJlZiAtIFRoZSBtb2RlbCBpZCAoMS4yKSBvciB0aGUgcmVmZXJlbmNlIHRvIHRoZSBtb2RlbCAoMS4yIG9yIDIuMClcbiAqIEBwYXJhbSB7b2JqZWN0fSBkYXRhIC0gVGhlIG1vZGVsIHRvIHZhbGlkYXRlXG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcbiAqXG4gKiBAcmV0dXJucyB1bmRlZmluZWQgaWYgdmFsaWRhdGlvbiBwYXNzZXMgb3IgYW4gb2JqZWN0IGNvbnRhaW5pbmcgZXJyb3JzIGFuZC9vciB3YXJuaW5nc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlcmUgYXJlIHZhbGlkYXRpb24gZXJyb3JzIHdoaWxlIGNyZWF0aW5nXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnZhbGlkYXRlTW9kZWwgPSBmdW5jdGlvbiB2YWxpZGF0ZU1vZGVsIChhcGlET3JTTywgbW9kZWxJZE9yUmVmLCBkYXRhLCBjYWxsYmFjaykge1xuICBzd2l0Y2ggKHRoaXMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdhcGlEZWNsYXJhdGlvbiBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9uIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUmVmKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbElkIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3dhZ2dlck9iamVjdCBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N3YWdnZXJPYmplY3QgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JSZWYpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21vZGVsUmVmIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG4gIH1cblxuICBpZiAoXy5pc1VuZGVmaW5lZChkYXRhKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignZGF0YSBpcyByZXF1aXJlZCcpO1xuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBpcyByZXF1aXJlZCcpO1xuICB9IGVsc2UgaWYgKCFfLmlzRnVuY3Rpb24oY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gIH1cblxuICB0aGlzLmNvbXBvc2VNb2RlbChhcGlET3JTTywgbW9kZWxJZE9yUmVmLCBmdW5jdGlvbiAoZXJyLCByZXN1bHQpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICB9XG5cbiAgICB2YWxpZGF0ZUFnYWluc3RTY2hlbWEodGhpcywgcmVzdWx0LCBkYXRhLCBjYWxsYmFjayk7XG4gIH0uYmluZCh0aGlzKSk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBmdWxseSByZXNvbHZlZCBkb2N1bWVudCBvciBkb2N1bWVudCBmcmFnbWVudC4gIChEb2VzIG5vdCBwZXJmb3JtIHZhbGlkYXRpb24gYXMgdGhpcyBpcyB0eXBpY2FsbHkgY2FsbGVkXG4gKiBhZnRlciB2YWxpZGF0aW9uIG9jY3Vycy4pKVxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBkb2N1bWVudCAtIFRoZSBkb2N1bWVudCB0byByZXNvbHZlIG9yIHRoZSBkb2N1bWVudCBjb250YWluaW5nIHRoZSByZWZlcmVuY2UgdG8gcmVzb2x2ZVxuICogQHBhcmFtIHtzdHJpbmd9IFtwdHJdIC0gVGhlIEpTT04gUG9pbnRlciBvciB1bmRlZmluZWQgdG8gcmV0dXJuIHRoZSB3aG9sZSBkb2N1bWVudFxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXG4gKlxuICogQHJldHVybnMgdGhlIGZ1bGx5IHJlc29sdmVkIGRvY3VtZW50IG9yIGZyYWdtZW50XG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGVyZSBhcmUgdXBzdHJlYW0gZXJyb3JzXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnJlc29sdmUgPSBmdW5jdGlvbiByZXNvbHZlIChkb2N1bWVudCwgcHRyLCBjYWxsYmFjaykge1xuICB2YXIgZG9jdW1lbnRNZXRhZGF0YTtcbiAgdmFyIHJlc3BvbmQgPSBmdW5jdGlvbiByZXNwb25kIChkb2N1bWVudCkge1xuICAgIGlmIChfLmlzU3RyaW5nKHB0cikpIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayh1bmRlZmluZWQsIHRyYXZlcnNlKGRvY3VtZW50KS5nZXQoSnNvblJlZnMucGF0aEZyb21Qb2ludGVyKHB0cikpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKHVuZGVmaW5lZCwgZG9jdW1lbnQpO1xuICAgIH1cbiAgfTtcblxuICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgaWYgKF8uaXNVbmRlZmluZWQoZG9jdW1lbnQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdkb2N1bWVudCBpcyByZXF1aXJlZCcpO1xuICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoZG9jdW1lbnQpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZG9jdW1lbnQgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgfVxuXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAyKSB7XG4gICAgY2FsbGJhY2sgPSBhcmd1bWVudHNbMV07XG4gICAgcHRyID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKHB0cikgJiYgIV8uaXNTdHJpbmcocHRyKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3B0ciBtdXN0IGJlIGEgSlNPTiBQb2ludGVyIHN0cmluZycpO1xuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBpcyByZXF1aXJlZCcpO1xuICB9IGVsc2UgaWYgKCFfLmlzRnVuY3Rpb24oY2FsbGJhY2spKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gIH1cblxuICBkb2N1bWVudE1ldGFkYXRhID0gZ2V0RG9jdW1lbnRDYWNoZShkb2N1bWVudCk7XG5cbiAgLy8gU3dhZ2dlciAxLjIgaXMgbm90IHN1cHBvcnRlZCBkdWUgdG8gaW52YWxpZCBKU09OIFJlZmVyZW5jZXMgYmVpbmcgdXNlZC4gIEV2ZW4gaWYgdGhlIEpTT04gUmVmZXJlbmNlcyB3ZXJlIHZhbGlkLFxuICAvLyB0aGUgSlNPTiBTY2hlbWEgZm9yIFN3YWdnZXIgMS4yIGRvIG5vdCBhbGxvdyBKYXZhU2NyaXB0IG9iamVjdHMgaW4gYWxsIHBsYWNlcyB3aGVyZSB0aGUgcmVzb3V0aW9uIHdvdWxkIG9jY3VyLlxuICBpZiAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1N3YWdnZXIgMS4yIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbiAgfVxuXG4gIGlmICghZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCkge1xuICAgIC8vIEVuc3VyZSB0aGUgZG9jdW1lbnQgaXMgdmFsaWQgZmlyc3RcbiAgICB0aGlzLnZhbGlkYXRlKGRvY3VtZW50LCBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgfSBlbHNlIGlmIChoZWxwZXJzLmdldEVycm9yQ291bnQocmVzdWx0cykgPiAwKSB7XG4gICAgICAgIHJldHVybiBoYW5kbGVWYWxpZGF0aW9uRXJyb3IocmVzdWx0cywgY2FsbGJhY2spO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzcG9uZChkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gcmVzcG9uZChkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkKTtcbiAgfVxufTtcblxuLyoqXG4gKiBDb252ZXJ0cyB0aGUgU3dhZ2dlciAxLjIgZG9jdW1lbnRzIHRvIGEgU3dhZ2dlciAyLjAgZG9jdW1lbnQuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IHJlc291cmNlTGlzdGluZyAtIFRoZSBTd2FnZ2VyIFJlc291cmNlIExpc3RpbmdcbiAqIEBwYXJhbSB7b2JqZWN0W119IFthcGlEZWNsYXJhdGlvbnNdIC0gVGhlIGFycmF5IG9mIFN3YWdnZXIgQVBJIERlY2xhcmF0aW9uc1xuICogQHBhcmFtIHtib29sZWFuPWZhbHNlfSBbc2tpcFZhbGlkYXRpb25dIC0gV2hldGhlciBvciBub3QgdG8gc2tpcCB2YWxpZGF0aW9uXG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcbiAqXG4gKiBAcmV0dXJucyB0aGUgY29udmVydGVkIFN3YWdnZXIgZG9jdW1lbnRcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBhcmd1bWVudHMgcHJvdmlkZWQgYXJlIG5vdCB2YWxpZFxuICovXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS5jb252ZXJ0ID0gZnVuY3Rpb24gKHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zLCBza2lwVmFsaWRhdGlvbiwgY2FsbGJhY2spIHtcbiAgdmFyIGRvQ29udmVydCA9IGZ1bmN0aW9uIGRvQ29udmVydCAocmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMpIHtcbiAgICBjYWxsYmFjayh1bmRlZmluZWQsIHN3YWdnZXJDb252ZXJ0ZXIocmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMpKTtcbiAgfS5iaW5kKHRoaXMpO1xuXG4gIGlmICh0aGlzLnZlcnNpb24gIT09ICcxLjInKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdTcGVjaWZpY2F0aW9uI2NvbnZlcnQgb25seSB3b3JrcyBmb3IgU3dhZ2dlciAxLjInKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICBpZiAoXy5pc1VuZGVmaW5lZChyZXNvdXJjZUxpc3RpbmcpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdyZXNvdXJjZUxpc3RpbmcgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KHJlc291cmNlTGlzdGluZykpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXNvdXJjZUxpc3RpbmcgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgfVxuXG4gIC8vIEFQSSBEZWNsYXJhdGlvbnMgYXJlIG9wdGlvbmFsIGJlY2F1c2Ugc3dhZ2dlci1jb252ZXJ0ZXIgd2FzIHdyaXR0ZW4gdG8gc3VwcG9ydCBpdFxuICBpZiAoXy5pc1VuZGVmaW5lZChhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgYXBpRGVjbGFyYXRpb25zID0gW107XG4gIH1cblxuICBpZiAoIV8uaXNBcnJheShhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignYXBpRGVjbGFyYXRpb25zIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgfVxuXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoIDwgNCkge1xuICAgIGNhbGxiYWNrID0gYXJndW1lbnRzW2FyZ3VtZW50cy5sZW5ndGggLSAxXTtcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICB9XG5cbiAgaWYgKHNraXBWYWxpZGF0aW9uID09PSB0cnVlKSB7XG4gICAgZG9Db252ZXJ0KHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zKTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnZhbGlkYXRlKHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgfSBlbHNlIGlmIChoZWxwZXJzLmdldEVycm9yQ291bnQocmVzdWx0cykgPiAwKSB7XG4gICAgICAgIHJldHVybiBoYW5kbGVWYWxpZGF0aW9uRXJyb3IocmVzdWx0cywgY2FsbGJhY2spO1xuICAgICAgfVxuXG4gICAgICBkb0NvbnZlcnQocmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMpO1xuICAgIH0pO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cy52MSA9IG1vZHVsZS5leHBvcnRzLnYxXzIgPSBuZXcgU3BlY2lmaWNhdGlvbignMS4yJyk7IC8vIGpzaGludCBpZ25vcmU6bGluZVxubW9kdWxlLmV4cG9ydHMudjIgPSBtb2R1bGUuZXhwb3J0cy52Ml8wID0gbmV3IFNwZWNpZmljYXRpb24oJzIuMCcpOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbiIsIi8qXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgQXBpZ2VlIENvcnBvcmF0aW9uXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG4gKiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cbiAqIFRIRSBTT0ZUV0FSRS5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfID0gKHdpbmRvdy5fKTtcbnZhciBKc29uUmVmcyA9ICh3aW5kb3cuSnNvblJlZnMpO1xudmFyIFpTY2hlbWEgPSAod2luZG93LlpTY2hlbWEpO1xuXG52YXIgZHJhZnQwNEpzb24gPSByZXF1aXJlKCcuLi9zY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24nKTtcbnZhciBkcmFmdDA0VXJsID0gJ2h0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hJztcbnZhciBzcGVjQ2FjaGUgPSB7fTtcblxubW9kdWxlLmV4cG9ydHMuY3JlYXRlSnNvblZhbGlkYXRvciA9IGZ1bmN0aW9uIGNyZWF0ZUpzb25WYWxpZGF0b3IgKHNjaGVtYXMpIHtcbiAgdmFyIHZhbGlkYXRvciA9IG5ldyBaU2NoZW1hKHtcbiAgICByZXBvcnRQYXRoQXNBcnJheTogdHJ1ZVxuICB9KTtcbiAgdmFyIHJlc3VsdDtcblxuICAvLyBBZGQgdGhlIGRyYWZ0LTA0IHNwZWNcbiAgdmFsaWRhdG9yLnNldFJlbW90ZVJlZmVyZW5jZShkcmFmdDA0VXJsLCBkcmFmdDA0SnNvbik7XG5cbiAgLy8gU3dhZ2dlciB1c2VzIHNvbWUgdW5zdXBwb3J0ZWQvaW52YWxpZCBmb3JtYXRzIHNvIGp1c3QgbWFrZSB0aGVtIGFsbCBwYXNzXG4gIF8uZWFjaChbJ2J5dGUnLCAnZG91YmxlJywgJ2Zsb2F0JywgJ2ludDMyJywgJ2ludDY0JywgJ21pbWUtdHlwZScsICd1cmktdGVtcGxhdGUnXSwgZnVuY3Rpb24gKGZvcm1hdCkge1xuICAgIFpTY2hlbWEucmVnaXN0ZXJGb3JtYXQoZm9ybWF0LCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gQ29tcGlsZSBhbmQgdmFsaWRhdGUgdGhlIHNjaGVtYXNcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKHNjaGVtYXMpKSB7XG4gICAgcmVzdWx0ID0gdmFsaWRhdG9yLmNvbXBpbGVTY2hlbWEoc2NoZW1hcyk7XG5cbiAgICAvLyBJZiB0aGVyZSBpcyBhbiBlcnJvciwgaXQncyB1bnJlY292ZXJhYmxlIHNvIGp1c3QgYmxvdyB0aGUgZWZmIHVwXG4gICAgaWYgKHJlc3VsdCA9PT0gZmFsc2UpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0pTT04gU2NoZW1hIGZpbGUnICsgKHNjaGVtYXMubGVuZ3RoID4gMSA/ICdzIGFyZScgOiAnIGlzJykgKyAnIGludmFsaWQ6Jyk7XG5cbiAgICAgIF8uZWFjaCh2YWxpZGF0b3IuZ2V0TGFzdEVycm9ycygpLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyAgJyArIChfLmlzQXJyYXkoZXJyLnBhdGgpID8gSnNvblJlZnMucGF0aFRvUG9pbnRlcihlcnIucGF0aCkgOiBlcnIucGF0aCkgKyAnOiAnICsgZXJyLm1lc3NhZ2UpO1xuICAgICAgfSk7XG5cbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIGNyZWF0ZSB2YWxpZGF0b3IgZHVlIHRvIGludmFsaWQgSlNPTiBTY2hlbWEnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdmFsaWRhdG9yO1xufTtcblxubW9kdWxlLmV4cG9ydHMuZm9ybWF0UmVzdWx0cyA9IGZ1bmN0aW9uIGZvcm1hdFJlc3VsdHMgKHJlc3VsdHMpIHtcbiAgaWYgKHJlc3VsdHMpIHtcbiAgICAvLyBVcGRhdGUgdGhlIHJlc3VsdHMgYmFzZWQgb24gaXRzIGNvbnRlbnQgdG8gaW5kaWNhdGUgc3VjY2Vzcy9mYWlsdXJlIGFjY29yZGluZ2x5XG4gICAgcmVzdWx0cyA9IChyZXN1bHRzLmVycm9ycy5sZW5ndGggKyByZXN1bHRzLndhcm5pbmdzLmxlbmd0aCArXG4gICAgXy5yZWR1Y2UocmVzdWx0cy5hcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChjb3VudCwgYVJlc3VsdCkge1xuICAgICAgaWYgKGFSZXN1bHQpIHtcbiAgICAgICAgY291bnQgKz0gYVJlc3VsdC5lcnJvcnMubGVuZ3RoICsgYVJlc3VsdC53YXJuaW5ncy5sZW5ndGg7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjb3VudDtcbiAgICB9LCAwKSA+IDApID8gcmVzdWx0cyA6IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiByZXN1bHRzO1xufTtcblxudmFyIGdldEVycm9yQ291bnQgPSBtb2R1bGUuZXhwb3J0cy5nZXRFcnJvckNvdW50ID0gZnVuY3Rpb24gZ2V0RXJyb3JDb3VudCAocmVzdWx0cykge1xuICB2YXIgZXJyb3JzID0gMDtcblxuICBpZiAocmVzdWx0cykge1xuICAgIGVycm9ycyA9IHJlc3VsdHMuZXJyb3JzLmxlbmd0aDtcblxuICAgIF8uZWFjaChyZXN1bHRzLmFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGFkUmVzdWx0cykge1xuICAgICAgaWYgKGFkUmVzdWx0cykge1xuICAgICAgICBlcnJvcnMgKz0gYWRSZXN1bHRzLmVycm9ycy5sZW5ndGg7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gZXJyb3JzO1xufTtcblxudmFyIGNvZXJjZVZlcnNpb24gPSBmdW5jdGlvbiBjb2VyY2VWZXJzaW9uICh2ZXJzaW9uKSB7XG4gIC8vIENvbnZlcnQgdGhlIHZlcnNpb24gdG8gYSBudW1iZXIgKFJlcXVpcmVkIGZvciBoZWxwZXJzLmdldFNwZWMpXG4gIGlmICh2ZXJzaW9uICYmICFfLmlzU3RyaW5nKHZlcnNpb24pKSB7XG4gICAgdmVyc2lvbiA9IHZlcnNpb24udG9TdHJpbmcoKTtcblxuICAgIC8vIEhhbmRsZSByb3VuZGluZyBpc3N1ZXMgKE9ubHkgcmVxdWlyZWQgZm9yIHdoZW4gU3dhZ2dlciB2ZXJzaW9uIGVuZHMgaW4gJy4wJylcbiAgICBpZiAodmVyc2lvbi5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgICB2ZXJzaW9uICs9ICcuMCc7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHZlcnNpb247XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIHByb3BlciBzcGVjaWZpY2F0aW9uIGJhc2VkIG9uIHRoZSBodW1hbiByZWFkYWJsZSB2ZXJzaW9uLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uIC0gVGhlIGh1bWFuIHJlYWRhYmxlIFN3YWdnZXIgdmVyc2lvbiAoRXg6IDEuMilcbiAqIEBwYXJhbSB7W2Jvb2xlYW49ZmFsc2VdfSB0aHJvd0Vycm9yIC0gVGhyb3cgYW4gZXJyb3IgaWYgdGhlIHZlcnNpb24gY291bGQgbm90IGJlIGlkZW50aWZpZWRcbiAqXG4gKiBAcmV0dXJucyB0aGUgY29ycmVzcG9uZGluZyBTd2FnZ2VyIFNwZWNpZmljYXRpb24gb2JqZWN0IG9yIHVuZGVmaW5lZCBpZiB0aGVyZSBpcyBub25lXG4gKi9cbm1vZHVsZS5leHBvcnRzLmdldFNwZWMgPSBmdW5jdGlvbiBnZXRTcGVjICh2ZXJzaW9uLCB0aHJvd0Vycm9yKSB7XG4gIHZhciBzcGVjO1xuXG4gIHZlcnNpb24gPSBjb2VyY2VWZXJzaW9uKHZlcnNpb24pO1xuICBzcGVjID0gc3BlY0NhY2hlW3ZlcnNpb25dO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKHNwZWMpKSB7XG4gICAgc3dpdGNoICh2ZXJzaW9uKSB7XG4gICAgY2FzZSAnMS4yJzpcbiAgICAgIHNwZWMgPSByZXF1aXJlKCcuLi9saWIvc3BlY3MnKS52MV8yOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcblxuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICcyLjAnOlxuICAgICAgc3BlYyA9IHJlcXVpcmUoJy4uL2xpYi9zcGVjcycpLnYyXzA7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuXG4gICAgICBicmVhaztcblxuICAgIGRlZmF1bHQ6XG4gICAgICBpZiAodGhyb3dFcnJvciA9PT0gdHJ1ZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIFN3YWdnZXIgdmVyc2lvbjogJyArIHZlcnNpb24pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzcGVjO1xufTtcblxuLyoqXG4gKiBBdGVtcHRzIHRvIGZpZ3VyZSBvdXQgdGhlIFN3YWdnZXIgdmVyc2lvbiBmcm9tIHRoZSBTd2FnZ2VyIGRvY3VtZW50LlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBkb2N1bWVudCAtIFRoZSBTd2FnZ2VyIGRvY3VtZW50XG4gKlxuICogQHJldHVybnMgdGhlIFN3YWdnZXIgdmVyc2lvbiBvciB1bmRlZmluZWQgaWYgdGhlIGRvY3VtZW50IGlzIG5vdCBhIFN3YWdnZXIgZG9jdW1lbnRcbiAqL1xubW9kdWxlLmV4cG9ydHMuZ2V0U3dhZ2dlclZlcnNpb24gPSBmdW5jdGlvbiBnZXRTd2FnZ2VyVmVyc2lvbiAoZG9jdW1lbnQpIHtcbiAgcmV0dXJuIF8uaXNQbGFpbk9iamVjdChkb2N1bWVudCkgPyBjb2VyY2VWZXJzaW9uKGRvY3VtZW50LnN3YWdnZXJWZXJzaW9uIHx8IGRvY3VtZW50LnN3YWdnZXIpIDogdW5kZWZpbmVkO1xufTtcblxubW9kdWxlLmV4cG9ydHMucHJpbnRWYWxpZGF0aW9uUmVzdWx0cyA9IGZ1bmN0aW9uIHByaW50VmFsaWRhdGlvblJlc3VsdHMgKHZlcnNpb24sIGFwaURPclNPLCBhcGlEZWNsYXJhdGlvbnMsIHJlc3VsdHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJpbnRTdW1tYXJ5KSB7XG4gIHZhciBoYXNFcnJvcnMgPSBnZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMDtcbiAgdmFyIHN0cmVhbSA9IGhhc0Vycm9ycyA/IGNvbnNvbGUuZXJyb3IgOiBjb25zb2xlLmxvZztcbiAgdmFyIHBsdXJhbGl6ZSA9IGZ1bmN0aW9uIHBsdXJhbGl6ZSAoc3RyaW5nLCBjb3VudCkge1xuICAgIHJldHVybiBjb3VudCA9PT0gMSA/IHN0cmluZyA6IHN0cmluZyArICdzJztcbiAgfTtcbiAgdmFyIHByaW50RXJyb3JzT3JXYXJuaW5ncyA9IGZ1bmN0aW9uIHByaW50RXJyb3JzT3JXYXJuaW5ncyAoaGVhZGVyLCBlbnRyaWVzLCBpbmRlbnQpIHtcbiAgICBpZiAoaGVhZGVyKSB7XG4gICAgICBzdHJlYW0oaGVhZGVyICsgJzonKTtcbiAgICAgIHN0cmVhbSgpO1xuICAgIH1cblxuICAgIF8uZWFjaChlbnRyaWVzLCBmdW5jdGlvbiAoZW50cnkpIHtcbiAgICAgIHN0cmVhbShuZXcgQXJyYXkoaW5kZW50ICsgMSkuam9pbignICcpICsgSnNvblJlZnMucGF0aFRvUG9pbnRlcihlbnRyeS5wYXRoKSArICc6ICcgKyBlbnRyeS5tZXNzYWdlKTtcblxuICAgICAgaWYgKGVudHJ5LmlubmVyKSB7XG4gICAgICAgIHByaW50RXJyb3JzT3JXYXJuaW5ncyAodW5kZWZpbmVkLCBlbnRyeS5pbm5lciwgaW5kZW50ICsgMik7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaGVhZGVyKSB7XG4gICAgICBzdHJlYW0oKTtcbiAgICB9XG4gIH07XG4gIHZhciBlcnJvckNvdW50ID0gMDtcbiAgdmFyIHdhcm5pbmdDb3VudCA9IDA7XG5cbiAgc3RyZWFtKCk7XG5cbiAgaWYgKHJlc3VsdHMuZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICBlcnJvckNvdW50ICs9IHJlc3VsdHMuZXJyb3JzLmxlbmd0aDtcblxuICAgIHByaW50RXJyb3JzT3JXYXJuaW5ncygnQVBJIEVycm9ycycsIHJlc3VsdHMuZXJyb3JzLCAyKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLndhcm5pbmdzLmxlbmd0aCA+IDApIHtcbiAgICB3YXJuaW5nQ291bnQgKz0gcmVzdWx0cy53YXJuaW5ncy5sZW5ndGg7XG5cbiAgICBwcmludEVycm9yc09yV2FybmluZ3MoJ0FQSSBXYXJuaW5ncycsIHJlc3VsdHMud2FybmluZ3MsIDIpO1xuICB9XG5cbiAgaWYgKHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zKSB7XG4gICAgcmVzdWx0cy5hcGlEZWNsYXJhdGlvbnMuZm9yRWFjaChmdW5jdGlvbiAoYWRSZXN1bHQsIGluZGV4KSB7XG4gICAgICBpZiAoIWFkUmVzdWx0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdmFyIG5hbWUgPSBhcGlEZWNsYXJhdGlvbnNbaW5kZXhdLnJlc291cmNlUGF0aCB8fCBpbmRleDtcblxuICAgICAgaWYgKGFkUmVzdWx0LmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGVycm9yQ291bnQgKz0gYWRSZXN1bHQuZXJyb3JzLmxlbmd0aDtcblxuICAgICAgICBwcmludEVycm9yc09yV2FybmluZ3MoJyAgQVBJIERlY2xhcmF0aW9uICgnICsgbmFtZSArICcpIEVycm9ycycsIGFkUmVzdWx0LmVycm9ycywgNCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChhZFJlc3VsdC53YXJuaW5ncy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHdhcm5pbmdDb3VudCArPSBhZFJlc3VsdC53YXJuaW5ncy5sZW5ndGg7XG5cbiAgICAgICAgcHJpbnRFcnJvcnNPcldhcm5pbmdzKCcgIEFQSSBEZWNsYXJhdGlvbiAoJyArIG5hbWUgKyAnKSBXYXJuaW5ncycsIGFkUmVzdWx0Lndhcm5pbmdzLCA0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGlmIChwcmludFN1bW1hcnkpIHtcbiAgICBpZiAoZXJyb3JDb3VudCA+IDApIHtcbiAgICAgIHN0cmVhbShlcnJvckNvdW50ICsgJyAnICsgcGx1cmFsaXplKCdlcnJvcicsIGVycm9yQ291bnQpICsgJyBhbmQgJyArIHdhcm5pbmdDb3VudCArICcgJyArXG4gICAgICAgICAgICAgICAgICAgIHBsdXJhbGl6ZSgnd2FybmluZycsIHdhcm5pbmdDb3VudCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHJlYW0oJ1ZhbGlkYXRpb24gc3VjY2VlZGVkIGJ1dCB3aXRoICcgKyB3YXJuaW5nQ291bnQgKyAnICcgKyBwbHVyYWxpemUoJ3dhcm5pbmcnLCB3YXJuaW5nQ291bnQpKTtcbiAgICB9XG4gIH1cblxuICBzdHJlYW0oKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLnN3YWdnZXJPcGVyYXRpb25NZXRob2RzID0gW1xuICAnREVMRVRFJyxcbiAgJ0dFVCcsXG4gICdIRUFEJyxcbiAgJ09QVElPTlMnLFxuICAnUEFUQ0gnLFxuICAnUE9TVCcsXG4gICdQVVQnXG5dO1xuIiwiLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBBcGlnZWUgQ29ycG9yYXRpb25cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAod2luZG93Ll8pO1xudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcblxuLy8gaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzMzOSNzZWN0aW9uLTUuNlxudmFyIGRhdGVSZWdFeHAgPSAvXihbMC05XXs0fSktKFswLTldezJ9KS0oWzAtOV17Mn0pJC87XG4vLyBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzMzM5I3NlY3Rpb24tNS42XG52YXIgZGF0ZVRpbWVSZWdFeHAgPSAvXihbMC05XXsyfSk6KFswLTldezJ9KTooWzAtOV17Mn0pKC5bMC05XSspPyh6fChbKy1dWzAtOV17Mn06WzAtOV17Mn0pKSQvO1xudmFyIGlzVmFsaWREYXRlID0gZnVuY3Rpb24gaXNWYWxpZERhdGUgKGRhdGUpIHtcbiAgdmFyIGRheTtcbiAgdmFyIG1hdGNoZXM7XG4gIHZhciBtb250aDtcblxuICBpZiAoIV8uaXNTdHJpbmcoZGF0ZSkpIHtcbiAgICBkYXRlID0gZGF0ZS50b1N0cmluZygpO1xuICB9XG5cbiAgbWF0Y2hlcyA9IGRhdGVSZWdFeHAuZXhlYyhkYXRlKTtcblxuICBpZiAobWF0Y2hlcyA9PT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGRheSA9IG1hdGNoZXNbM107XG4gIG1vbnRoID0gbWF0Y2hlc1syXTtcblxuICBpZiAobW9udGggPCAnMDEnIHx8IG1vbnRoID4gJzEyJyB8fCBkYXkgPCAnMDEnIHx8IGRheSA+ICczMScpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG52YXIgaXNWYWxpZERhdGVUaW1lID0gZnVuY3Rpb24gaXNWYWxpZERhdGVUaW1lIChkYXRlVGltZSkge1xuICB2YXIgaG91cjtcbiAgdmFyIGRhdGU7XG4gIHZhciB0aW1lO1xuICB2YXIgbWF0Y2hlcztcbiAgdmFyIG1pbnV0ZTtcbiAgdmFyIHBhcnRzO1xuICB2YXIgc2Vjb25kO1xuXG4gIGlmICghXy5pc1N0cmluZyhkYXRlVGltZSkpIHtcbiAgICBkYXRlVGltZSA9IGRhdGVUaW1lLnRvU3RyaW5nKCk7XG4gIH1cblxuICBwYXJ0cyA9IGRhdGVUaW1lLnRvTG93ZXJDYXNlKCkuc3BsaXQoJ3QnKTtcbiAgZGF0ZSA9IHBhcnRzWzBdO1xuICB0aW1lID0gcGFydHMubGVuZ3RoID4gMSA/IHBhcnRzWzFdIDogdW5kZWZpbmVkO1xuXG4gIGlmICghaXNWYWxpZERhdGUoZGF0ZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBtYXRjaGVzID0gZGF0ZVRpbWVSZWdFeHAuZXhlYyh0aW1lKTtcblxuICBpZiAobWF0Y2hlcyA9PT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGhvdXIgPSBtYXRjaGVzWzFdO1xuICBtaW51dGUgPSBtYXRjaGVzWzJdO1xuICBzZWNvbmQgPSBtYXRjaGVzWzNdO1xuXG4gIGlmIChob3VyID4gJzIzJyB8fCBtaW51dGUgPiAnNTknIHx8IHNlY29uZCA+ICc1OScpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbnZhciB0aHJvd0Vycm9yV2l0aENvZGUgPSBmdW5jdGlvbiB0aHJvd0Vycm9yV2l0aENvZGUgKGNvZGUsIG1zZykge1xuICB2YXIgZXJyID0gbmV3IEVycm9yKG1zZyk7XG5cbiAgZXJyLmNvZGUgPSBjb2RlO1xuICBlcnIuZmFpbGVkVmFsaWRhdGlvbiA9IHRydWU7XG5cbiAgdGhyb3cgZXJyO1xufTtcblxubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVBZ2FpbnN0U2NoZW1hID0gZnVuY3Rpb24gdmFsaWRhdGVBZ2FpbnN0U2NoZW1hIChzY2hlbWFPck5hbWUsIGRhdGEsIHZhbGlkYXRvcikge1xuICB2YXIgcmVtb3ZlUGFyYW1zID0gZnVuY3Rpb24gKG9iaikge1xuICAgIGRlbGV0ZSBvYmoucGFyYW1zO1xuXG4gICAgaWYgKG9iai5pbm5lcikge1xuICAgICAgXy5lYWNoKG9iai5pbm5lciwgZnVuY3Rpb24gKG5PYmopIHtcbiAgICAgICAgcmVtb3ZlUGFyYW1zKG5PYmopO1xuICAgICAgfSk7XG4gICAgfVxuICB9O1xuICB2YXIgc2NoZW1hID0gXy5pc1BsYWluT2JqZWN0KHNjaGVtYU9yTmFtZSkgPyBfLmNsb25lRGVlcChzY2hlbWFPck5hbWUpIDogc2NoZW1hT3JOYW1lO1xuXG4gIC8vIFdlIGRvbid0IGNoZWNrIHRoaXMgZHVlIHRvIGludGVybmFsIHVzYWdlIGJ1dCBpZiB2YWxpZGF0b3IgaXMgbm90IHByb3ZpZGVkLCBzY2hlbWFPck5hbWUgbXVzdCBiZSBhIHNjaGVtYVxuICBpZiAoXy5pc1VuZGVmaW5lZCh2YWxpZGF0b3IpKSB7XG4gICAgdmFsaWRhdG9yID0gaGVscGVycy5jcmVhdGVKc29uVmFsaWRhdG9yKFtzY2hlbWFdKTtcbiAgfVxuXG4gIHZhciB2YWxpZCA9IHZhbGlkYXRvci52YWxpZGF0ZShkYXRhLCBzY2hlbWEpO1xuXG4gIGlmICghdmFsaWQpIHtcbiAgICB0cnkge1xuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKCdTQ0hFTUFfVkFMSURBVElPTl9GQUlMRUQnLCAnRmFpbGVkIHNjaGVtYSB2YWxpZGF0aW9uJyk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBlcnIucmVzdWx0cyA9IHtcbiAgICAgICAgZXJyb3JzOiBfLm1hcCh2YWxpZGF0b3IuZ2V0TGFzdEVycm9ycygpLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgcmVtb3ZlUGFyYW1zKGVycik7XG5cbiAgICAgICAgICByZXR1cm4gZXJyO1xuICAgICAgICB9KSxcbiAgICAgICAgd2FybmluZ3M6IFtdXG4gICAgICB9O1xuXG4gICAgICB0aHJvdyBlcnI7XG4gICAgfVxuICB9XG59O1xuXG5cbi8qKlxuICogVmFsaWRhdGVzIGEgc2NoZW1hIG9mIHR5cGUgYXJyYXkgaXMgcHJvcGVybHkgZm9ybWVkICh3aGVuIG5lY2Vzc2FyKS5cbiAqXG4gKiAqcGFyYW0ge29iamVjdH0gc2NoZW1hIC0gVGhlIHNjaGVtYSBvYmplY3QgdG8gdmFsaWRhdGVcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBzY2hlbWEgc2F5cyBpdCdzIGFuIGFycmF5IGJ1dCBpdCBpcyBub3QgZm9ybWVkIHByb3Blcmx5XG4gKlxuICogQHNlZSB7QGxpbmsgaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9pc3N1ZXMvMTc0fVxuICovXG52YXIgdmFsaWRhdGVBcnJheVR5cGUgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUFycmF5VHlwZSA9IGZ1bmN0aW9uIHZhbGlkYXRlQXJyYXlUeXBlIChzY2hlbWEpIHtcbiAgLy8gV2UgaGF2ZSB0byBkbyB0aGlzIG1hbnVhbGx5IGZvciBub3dcbiAgaWYgKHNjaGVtYS50eXBlID09PSAnYXJyYXknICYmIF8uaXNVbmRlZmluZWQoc2NoZW1hLml0ZW1zKSkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnT0JKRUNUX01JU1NJTkdfUkVRVUlSRURfUFJPUEVSVFknLCAnTWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0eTogaXRlbXMnKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3Qgb3IgcmVzcG9uc2UgY29udGVudCB0eXBlICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmdbXX0gZ1BPckMgLSBUaGUgdmFsaWQgY29uc3VtZXMgYXQgdGhlIEFQSSBzY29wZVxuICogQHBhcmFtIHtzdHJpbmdbXX0gb1BPckMgLSBUaGUgdmFsaWQgY29uc3VtZXMgYXQgdGhlIG9wZXJhdGlvbiBzY29wZVxuICogQHBhcmFtIHtvYmplY3R9IHJlcU9yUmVzIC0gVGhlIHJlcXVlc3Qgb3IgcmVzcG9uc2VcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBjb250ZW50IHR5cGUgaXMgaW52YWxpZFxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUNvbnRlbnRUeXBlID0gZnVuY3Rpb24gdmFsaWRhdGVDb250ZW50VHlwZSAoZ1BPckMsIG9QT3JDLCByZXFPclJlcykge1xuICAvLyBodHRwOi8vd3d3LnczLm9yZy9Qcm90b2NvbHMvcmZjMjYxNi9yZmMyNjE2LXNlYzcuaHRtbCNzZWM3LjIuMVxuICB2YXIgaXNSZXNwb25zZSA9IHR5cGVvZiByZXFPclJlcy5lbmQgPT09ICdmdW5jdGlvbic7XG4gIHZhciBjb250ZW50VHlwZSA9IGlzUmVzcG9uc2UgPyByZXFPclJlcy5nZXRIZWFkZXIoJ2NvbnRlbnQtdHlwZScpIDogcmVxT3JSZXMuaGVhZGVyc1snY29udGVudC10eXBlJ107XG4gIHZhciBwT3JDID0gXy51bmlvbihnUE9yQywgb1BPckMpO1xuXG4gIGlmICghY29udGVudFR5cGUpIHtcbiAgICBpZiAoaXNSZXNwb25zZSkge1xuICAgICAgY29udGVudFR5cGUgPSAndGV4dC9wbGFpbic7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnRlbnRUeXBlID0gJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbSc7XG4gICAgfVxuICB9XG5cbiAgLy8gR2V0IG9ubHkgdGhlIGNvbnRlbnQgdHlwZVxuICBjb250ZW50VHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KCc7JylbMF07XG5cbiAgaWYgKHBPckMubGVuZ3RoID4gMCAmJiAoaXNSZXNwb25zZSA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRydWUgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICBbJ1BPU1QnLCAnUFVUJ10uaW5kZXhPZihyZXFPclJlcy5tZXRob2QpICE9PSAtMSkgJiYgcE9yQy5pbmRleE9mKGNvbnRlbnRUeXBlKSA9PT0gLTEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29udGVudCB0eXBlICgnICsgY29udGVudFR5cGUgKyAnKS4gIFRoZXNlIGFyZSB2YWxpZDogJyArIHBPckMuam9pbignLCAnKSk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBhZ2FpbnN0IHRoZSBhbGxvd2FibGUgdmFsdWVzICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBhbGxvd2VkIC0gVGhlIGFsbG93YWJsZSB2YWx1ZXNcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBub3QgYWxsb3dhYmxlXG4gKi9cbnZhciB2YWxpZGF0ZUVudW0gPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUVudW0gPSBmdW5jdGlvbiB2YWxpZGF0ZUVudW0gKHZhbCwgYWxsb3dlZCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoYWxsb3dlZCkgJiYgIV8uaXNVbmRlZmluZWQodmFsKSAmJiBhbGxvd2VkLmluZGV4T2YodmFsKSA9PT0gLTEpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0VOVU1fTUlTTUFUQ0gnLCAnTm90IGFuIGFsbG93YWJsZSB2YWx1ZSAoJyArIGFsbG93ZWQuam9pbignLCAnKSArICcpOiAnICsgdmFsKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGlzIGxlc3MgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmd9IG1heGltdW0gLSBUaGUgbWF4aW11bSB2YWx1ZVxuICogQHBhcmFtIHtib29sZWFufSBbZXhjbHVzaXZlPWZhbHNlXSAtIFdoZXRoZXIgb3Igbm90IHRoZSB2YWx1ZSBpbmNsdWRlcyB0aGUgbWF4aW11bSBpbiBpdHMgY29tcGFyaXNvblxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWF4aW11bVxuICovXG52YXIgdmFsaWRhdGVNYXhpbXVtID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhpbXVtID0gZnVuY3Rpb24gdmFsaWRhdGVNYXhpbXVtICh2YWwsIG1heGltdW0sIHR5cGUsIGV4Y2x1c2l2ZSkge1xuICB2YXIgY29kZSA9IGV4Y2x1c2l2ZSA9PT0gdHJ1ZSA/ICdNQVhJTVVNX0VYQ0xVU0lWRScgOiAnTUFYSU1VTSc7XG4gIHZhciB0ZXN0TWF4O1xuICB2YXIgdGVzdFZhbDtcblxuICBpZiAoXy5pc1VuZGVmaW5lZChleGNsdXNpdmUpKSB7XG4gICAgZXhjbHVzaXZlID0gZmFsc2U7XG4gIH1cblxuICBpZiAodHlwZSA9PT0gJ2ludGVnZXInKSB7XG4gICAgdGVzdFZhbCA9IHBhcnNlSW50KHZhbCwgMTApO1xuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInKSB7XG4gICAgdGVzdFZhbCA9IHBhcnNlRmxvYXQodmFsKTtcbiAgfVxuXG4gIGlmICghXy5pc1VuZGVmaW5lZChtYXhpbXVtKSkge1xuICAgIHRlc3RNYXggPSBwYXJzZUZsb2F0KG1heGltdW0pO1xuXG4gICAgaWYgKGV4Y2x1c2l2ZSAmJiB0ZXN0VmFsID49IHRlc3RNYXgpIHtcbiAgICAgIHRocm93RXJyb3JXaXRoQ29kZShjb2RlLCAnR3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIHRoZSBjb25maWd1cmVkIG1heGltdW0gKCcgKyBtYXhpbXVtICsgJyk6ICcgKyB2YWwpO1xuICAgIH0gZWxzZSBpZiAodGVzdFZhbCA+IHRlc3RNYXgpIHtcbiAgICAgIHRocm93RXJyb3JXaXRoQ29kZShjb2RlLCAnR3JlYXRlciB0aGFuIHRoZSBjb25maWd1cmVkIG1heGltdW0gKCcgKyBtYXhpbXVtICsgJyk6ICcgKyB2YWwpO1xuICAgIH1cbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIGFycmF5IGNvdW50IGlzIGxlc3MgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWF4SXRlbXMgLSBUaGUgbWF4aW11bSBudW1iZXIgb2YgaXRlbXNcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBjb250YWlucyBtb3JlIGl0ZW1zIHRoYW4gYWxsb3dhYmxlXG4gKi9cbnZhciB2YWxpZGF0ZU1heEl0ZW1zID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhJdGVtcyA9IGZ1bmN0aW9uIHZhbGlkYXRlTWF4SXRlbXMgKHZhbCwgbWF4SXRlbXMpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heEl0ZW1zKSAmJiB2YWwubGVuZ3RoID4gbWF4SXRlbXMpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0FSUkFZX0xFTkdUSF9MT05HJywgJ0FycmF5IGlzIHRvbyBsb25nICgnICsgdmFsLmxlbmd0aCArICcpLCBtYXhpbXVtICcgKyBtYXhJdGVtcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBsZW5ndGggaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhMZW5ndGggLSBUaGUgbWF4aW11bSBsZW5ndGhcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSdzIGxlbmd0aCBpcyBncmVhdGVyIHRoYW4gdGhlIG1heGltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWF4TGVuZ3RoID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhMZW5ndGggPSBmdW5jdGlvbiB2YWxpZGF0ZU1heExlbmd0aCAodmFsLCBtYXhMZW5ndGgpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heExlbmd0aCkgJiYgdmFsLmxlbmd0aCA+IG1heExlbmd0aCkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnTUFYX0xFTkdUSCcsICdTdHJpbmcgaXMgdG9vIGxvbmcgKCcgKyB2YWwubGVuZ3RoICsgJyBjaGFycyksIG1heGltdW0gJyArIG1heExlbmd0aCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSdzIHByb3BlcnR5IGNvdW50IGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWluUHJvcGVydGllcyAtIFRoZSBtYXhpbXVtIG51bWJlciBvZiBwcm9wZXJ0aWVzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUncyBwcm9wZXJ0eSBjb3VudCBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWF4UHJvcGVydGllcyA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWF4UHJvcGVydGllcyA9IGZ1bmN0aW9uIHZhbGlkYXRlTWF4TGVuZ3RoICh2YWwsIG1heFByb3BlcnRpZXMpIHtcbiAgdmFyIHByb3BDb3VudCA9IF8uaXNQbGFpbk9iamVjdCh2YWwpID8gT2JqZWN0LmtleXModmFsKS5sZW5ndGggOiAwO1xuXG4gIGlmICghXy5pc1VuZGVmaW5lZChtYXhQcm9wZXJ0aWVzKSAmJiBwcm9wQ291bnQgPiBtYXhQcm9wZXJ0aWVzKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNQVhfUFJPUEVSVElFUycsXG4gICAgICAgICAgICAgICAgICAgICAgICdOdW1iZXIgb2YgcHJvcGVydGllcyBpcyB0b28gbWFueSAoJyArIHByb3BDb3VudCArICcgcHJvcGVydGllcyksIG1heGltdW0gJyArIG1heFByb3BlcnRpZXMpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgYXJyYXkgY291bnQgaXMgZ3JlYXRlciB0aGFuIHRoZSBtaW5pbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gbWluaW11bSAtIFRoZSBtaW5pbXVtIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtleGNsdXNpdmU9ZmFsc2VdIC0gV2hldGhlciBvciBub3QgdGhlIHZhbHVlIGluY2x1ZGVzIHRoZSBtaW5pbXVtIGluIGl0cyBjb21wYXJpc29uXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtXG4gKi9cbnZhciB2YWxpZGF0ZU1pbmltdW0gPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbmltdW0gPSBmdW5jdGlvbiB2YWxpZGF0ZU1pbmltdW0gKHZhbCwgbWluaW11bSwgdHlwZSwgZXhjbHVzaXZlKSB7XG4gIHZhciBjb2RlID0gZXhjbHVzaXZlID09PSB0cnVlID8gJ01JTklNVU1fRVhDTFVTSVZFJyA6ICdNSU5JTVVNJztcbiAgdmFyIHRlc3RNaW47XG4gIHZhciB0ZXN0VmFsO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGV4Y2x1c2l2ZSkpIHtcbiAgICBleGNsdXNpdmUgPSBmYWxzZTtcbiAgfVxuXG4gIGlmICh0eXBlID09PSAnaW50ZWdlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VJbnQodmFsLCAxMCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VGbG9hdCh2YWwpO1xuICB9XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbmltdW0pKSB7XG4gICAgdGVzdE1pbiA9IHBhcnNlRmxvYXQobWluaW11bSk7XG5cbiAgICBpZiAoZXhjbHVzaXZlICYmIHRlc3RWYWwgPD0gdGVzdE1pbikge1xuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKGNvZGUsICdMZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIGNvbmZpZ3VyZWQgbWluaW11bSAoJyArIG1pbmltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfSBlbHNlIGlmICh0ZXN0VmFsIDwgdGVzdE1pbikge1xuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKGNvZGUsICdMZXNzIHRoYW4gdGhlIGNvbmZpZ3VyZWQgbWluaW11bSAoJyArIG1pbmltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgdmFsdWUgY29udGFpbnMgZmV3ZXIgaXRlbXMgdGhhbiBhbGxvd2VkICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5JdGVtcyAtIFRoZSBtaW5pbXVtIG51bWJlciBvZiBpdGVtc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGNvbnRhaW5zIGZld2VyIGl0ZW1zIHRoYW4gYWxsb3dhYmxlXG4gKi9cbnZhciB2YWxpZGF0ZU1pbkl0ZW1zID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5JdGVtcyA9IGZ1bmN0aW9uIHZhbGlkYXRlTWluSXRlbXMgKHZhbCwgbWluSXRlbXMpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbkl0ZW1zKSAmJiB2YWwubGVuZ3RoIDwgbWluSXRlbXMpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0FSUkFZX0xFTkdUSF9TSE9SVCcsICdBcnJheSBpcyB0b28gc2hvcnQgKCcgKyB2YWwubGVuZ3RoICsgJyksIG1pbmltdW0gJyArIG1pbkl0ZW1zKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGxlbmd0aCBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pbkxlbmd0aCAtIFRoZSBtaW5pbXVtIGxlbmd0aFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlJ3MgbGVuZ3RoIGlzIGxlc3MgdGhhbiB0aGUgbWluaW11bVxuICovXG52YXIgdmFsaWRhdGVNaW5MZW5ndGggPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbkxlbmd0aCA9IGZ1bmN0aW9uIHZhbGlkYXRlTWluTGVuZ3RoICh2YWwsIG1pbkxlbmd0aCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobWluTGVuZ3RoKSAmJiB2YWwubGVuZ3RoIDwgbWluTGVuZ3RoKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNSU5fTEVOR1RIJywgJ1N0cmluZyBpcyB0b28gc2hvcnQgKCcgKyB2YWwubGVuZ3RoICsgJyBjaGFycyksIG1pbmltdW0gJyArIG1pbkxlbmd0aCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSdzIHByb3BlcnR5IGNvdW50IGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgbWluaW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWluUHJvcGVydGllcyAtIFRoZSBtaW5pbXVtIG51bWJlciBvZiBwcm9wZXJ0aWVzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUncyBwcm9wZXJ0eSBjb3VudCBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWluUHJvcGVydGllcyA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWluUHJvcGVydGllcyA9IGZ1bmN0aW9uIHZhbGlkYXRlTWluTGVuZ3RoICh2YWwsIG1pblByb3BlcnRpZXMpIHtcbiAgdmFyIHByb3BDb3VudCA9IF8uaXNQbGFpbk9iamVjdCh2YWwpID8gT2JqZWN0LmtleXModmFsKS5sZW5ndGggOiAwO1xuXG4gIGlmICghXy5pc1VuZGVmaW5lZChtaW5Qcm9wZXJ0aWVzKSAmJiBwcm9wQ291bnQgPCBtaW5Qcm9wZXJ0aWVzKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNSU5fUFJPUEVSVElFUycsXG4gICAgICAgICAgICAgICAgICAgICAgICdOdW1iZXIgb2YgcHJvcGVydGllcyBpcyB0b28gZmV3ICgnICsgcHJvcENvdW50ICsgJyBwcm9wZXJ0aWVzKSwgbWluaW11bSAnICsgbWluUHJvcGVydGllcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBpcyBhIG11bHRpcGxlIG9mIHRoZSBwcm92aWRlZCBudW1iZXIgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG11bHRpcGxlT2YgLSBUaGUgbnVtYmVyIHRoYXQgc2hvdWxkIGRpdmlkZSBldmVubHkgaW50byB0aGUgdmFsdWVcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93YWJsZVxuICovXG52YXIgdmFsaWRhdGVNdWx0aXBsZU9mID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNdWx0aXBsZU9mID0gZnVuY3Rpb24gdmFsaWRhdGVNdWx0aXBsZU9mICh2YWwsIG11bHRpcGxlT2YpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG11bHRpcGxlT2YpICYmIHZhbCAlIG11bHRpcGxlT2YgIT09IDApIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ01VTFRJUExFX09GJywgJ05vdCBhIG11bHRpcGxlIG9mICcgKyBtdWx0aXBsZU9mKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIG1hdGNoZXMgYSBwYXR0ZXJuICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmd9IHBhdHRlcm4gLSBUaGUgcGF0dGVyblxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGRvZXMgbm90IG1hdGNoIHRoZSBwYXR0ZXJuXG4gKi9cbnZhciB2YWxpZGF0ZVBhdHRlcm4gPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVBhdHRlcm4gPSBmdW5jdGlvbiB2YWxpZGF0ZVBhdHRlcm4gKHZhbCwgcGF0dGVybikge1xuICBpZiAoIV8uaXNVbmRlZmluZWQocGF0dGVybikgJiYgXy5pc051bGwodmFsLm1hdGNoKG5ldyBSZWdFeHAocGF0dGVybikpKSkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnUEFUVEVSTicsICdEb2VzIG5vdCBtYXRjaCByZXF1aXJlZCBwYXR0ZXJuOiAnICsgcGF0dGVybik7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSByZXF1aXJlZG5lc3MgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gcmVxdWlyZWQgLSBXaGV0aGVyIG9yIG5vdCB0aGUgcGFyYW1ldGVyIGlzIHJlcXVpcmVkXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgcmVxdWlyZWQgYnV0IGlzIG5vdCBwcmVzZW50XG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlUmVxdWlyZWRuZXNzID0gZnVuY3Rpb24gdmFsaWRhdGVSZXF1aXJlZG5lc3MgKHZhbCwgcmVxdWlyZWQpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlcXVpcmVkKSAmJiByZXF1aXJlZCA9PT0gdHJ1ZSAmJiBfLmlzVW5kZWZpbmVkKHZhbCkpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ1JFUVVJUkVEJywgJ0lzIHJlcXVpcmVkJyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSB0eXBlIGFuZCBmb3JtYXQgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gVGhlIHBhcmFtZXRlciB0eXBlXG4gKiBAcGFyYW0ge3N0cmluZ30gZm9ybWF0IC0gVGhlIHBhcmFtZXRlciBmb3JtYXRcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3NraXBFcnJvcj1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0byBza2lwIHRocm93aW5nIGFuIGVycm9yIChVc2VmdWwgZm9yIHZhbGlkYXRpbmcgYXJyYXlzKVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIG5vdCB0aGUgcHJvcGVyIHR5cGUgb3IgZm9ybWF0XG4gKi9cbnZhciB2YWxpZGF0ZVR5cGVBbmRGb3JtYXQgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVR5cGVBbmRGb3JtYXQgPVxuICBmdW5jdGlvbiB2YWxpZGF0ZVR5cGVBbmRGb3JtYXQgKHZhbCwgdHlwZSwgZm9ybWF0LCBza2lwRXJyb3IpIHtcbiAgICB2YXIgcmVzdWx0ID0gdHJ1ZTtcblxuICAgIGlmIChfLmlzQXJyYXkodmFsKSkge1xuICAgICAgXy5lYWNoKHZhbCwgZnVuY3Rpb24gKGFWYWwsIGluZGV4KSB7XG4gICAgICAgIGlmICghdmFsaWRhdGVUeXBlQW5kRm9ybWF0KGFWYWwsIHR5cGUsIGZvcm1hdCwgdHJ1ZSkpIHtcbiAgICAgICAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0lOVkFMSURfVFlQRScsICdWYWx1ZSBhdCBpbmRleCAnICsgaW5kZXggKyAnIGlzIG5vdCBhIHZhbGlkICcgKyB0eXBlICsgJzogJyArIGFWYWwpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlICdib29sZWFuJzpcbiAgICAgICAgcmVzdWx0ID0gXy5pc0Jvb2xlYW4odmFsKSB8fCBbJ2ZhbHNlJywgJ3RydWUnXS5pbmRleE9mKHZhbCkgIT09IC0xO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2ludGVnZXInOlxuICAgICAgICByZXN1bHQgPSBfLmlzRmluaXRlKE51bWJlcih2YWwpKSAmJiAhXy5pc05hTihwYXJzZUludCh2YWwsIDEwKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgcmVzdWx0ID0gXy5pc0Zpbml0ZShOdW1iZXIodmFsKSkgJiYgIV8uaXNOYU4ocGFyc2VGbG9hdCh2YWwpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQoZm9ybWF0KSkge1xuICAgICAgICAgIHN3aXRjaCAoZm9ybWF0KSB7XG4gICAgICAgICAgY2FzZSAnZGF0ZSc6XG4gICAgICAgICAgICByZXN1bHQgPSBpc1ZhbGlkRGF0ZSh2YWwpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnZGF0ZS10aW1lJzpcbiAgICAgICAgICAgIHJlc3VsdCA9IGlzVmFsaWREYXRlVGltZSh2YWwpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAndm9pZCc6XG4gICAgICAgIHJlc3VsdCA9IF8uaXNVbmRlZmluZWQodmFsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNraXBFcnJvcikge1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGVsc2UgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHRocm93RXJyb3JXaXRoQ29kZSgnSU5WQUxJRF9UWVBFJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlICE9PSAndm9pZCcgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ05vdCBhIHZhbGlkICcgKyAoXy5pc1VuZGVmaW5lZChmb3JtYXQpID8gJycgOiBmb3JtYXQgKyAnICcpICsgdHlwZSArICc6ICcgKyB2YWwgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ1ZvaWQgZG9lcyBub3QgYWxsb3cgYSB2YWx1ZScpO1xuICAgIH1cbiAgfTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIHZhbHVlcyBhcmUgdW5pcXVlICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmdbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtib29sZWFufSBpc1VuaXF1ZSAtIFdoZXRoZXIgb3Igbm90IHRoZSBwYXJhbWV0ZXIgdmFsdWVzIGFyZSB1bmlxdWVcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBoYXMgZHVwbGljYXRlc1xuICovXG52YXIgdmFsaWRhdGVVbmlxdWVJdGVtcyA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlVW5pcXVlSXRlbXMgPSBmdW5jdGlvbiB2YWxpZGF0ZVVuaXF1ZUl0ZW1zICh2YWwsIGlzVW5pcXVlKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChpc1VuaXF1ZSkgJiYgXy51bmlxKHZhbCkubGVuZ3RoICE9PSB2YWwubGVuZ3RoKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdBUlJBWV9VTklRVUUnLCAnRG9lcyBub3QgYWxsb3cgZHVwbGljYXRlIHZhbHVlczogJyArIHZhbC5qb2luKCcsICcpKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGFnYWluc3QgdGhlIHNjaGVtYS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gc3dhZ2dlclZlcnNpb24gLSBUaGUgU3dhZ2dlciB2ZXJzaW9uXG4gKiBAcGFyYW0ge29iamVjdH0gc2NoZW1hIC0gVGhlIHNjaGVtYSB0byB1c2UgdG8gdmFsaWRhdGUgdGhpbmdzXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBwYXRoIC0gVGhlIHBhdGggdG8gdGhlIHNjaGVtYVxuICogQHBhcmFtIHsqfSBbdmFsXSAtIFRoZSB2YWx1ZSB0byB2YWxpZGF0ZSBvciB1bmRlZmluZWQgdG8gdXNlIHRoZSBkZWZhdWx0IHZhbHVlIHByb3ZpZGVkIGJ5IHRoZSBzY2hlbWFcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIGFueSB2YWxpZGF0aW9uIGZhaWxlc1xuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzID0gZnVuY3Rpb24gdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyAoc3dhZ2dlclZlcnNpb24sIHNjaGVtYSwgcGF0aCwgdmFsKSB7XG4gIHZhciByZXNvbHZlU2NoZW1hID0gZnVuY3Rpb24gcmVzb2x2ZVNjaGVtYSAoc2NoZW1hKSB7XG4gICAgdmFyIHJlc29sdmVkID0gc2NoZW1hO1xuXG4gICAgaWYgKHJlc29sdmVkLnNjaGVtYSkge1xuICAgICAgcGF0aCA9IHBhdGguY29uY2F0KFsnc2NoZW1hJ10pO1xuXG4gICAgICByZXNvbHZlZCA9IHJlc29sdmVTY2hlbWEocmVzb2x2ZWQuc2NoZW1hKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzb2x2ZWQ7XG4gIH07XG5cbiAgdmFyIHR5cGUgPSBzY2hlbWEudHlwZTtcblxuICBpZiAoIXR5cGUpIHtcbiAgICBpZiAoIXNjaGVtYS5zY2hlbWEpIHtcbiAgICAgIGlmIChwYXRoW3BhdGgubGVuZ3RoIC0gMl0gPT09ICdyZXNwb25zZXMnKSB7XG4gICAgICAgIHR5cGUgPSAndm9pZCc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0eXBlID0gJ29iamVjdCc7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHNjaGVtYSA9IHJlc29sdmVTY2hlbWEoc2NoZW1hKTtcbiAgICAgIHR5cGUgPSBzY2hlbWEudHlwZSB8fCAnb2JqZWN0JztcbiAgICB9XG4gIH1cblxuICB0cnkge1xuICAgIC8vIEFsd2F5cyBwZXJmb3JtIHRoaXMgY2hlY2sgZXZlbiBpZiB0aGVyZSBpcyBubyB2YWx1ZVxuICAgIGlmICh0eXBlID09PSAnYXJyYXknKSB7XG4gICAgICB2YWxpZGF0ZUFycmF5VHlwZShzY2hlbWEpO1xuICAgIH1cblxuICAgIC8vIERlZmF1bHQgdG8gZGVmYXVsdCB2YWx1ZSBpZiBuZWNlc3NhcnlcbiAgICBpZiAoXy5pc1VuZGVmaW5lZCh2YWwpKSB7XG4gICAgICB2YWwgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBzY2hlbWEuZGVmYXVsdFZhbHVlIDogc2NoZW1hLmRlZmF1bHQ7XG5cbiAgICAgIHBhdGggPSBwYXRoLmNvbmNhdChbc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gJ2RlZmF1bHRWYWx1ZScgOiAnZGVmYXVsdCddKTtcbiAgICB9XG5cbiAgICAvLyBJZiB0aGVyZSBpcyBubyBleHBsaWNpdCBkZWZhdWx0IHZhbHVlLCByZXR1cm4gYXMgYWxsIHZhbGlkYXRpb25zIHdpbGwgZmFpbFxuICAgIGlmIChfLmlzVW5kZWZpbmVkKHZhbCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHNjaGVtYS5pdGVtcykpIHtcbiAgICAgICAgdmFsaWRhdGVUeXBlQW5kRm9ybWF0KHZhbCwgdHlwZSA9PT0gJ2FycmF5JyA/IHNjaGVtYS5pdGVtcy50eXBlIDogdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGUgPT09ICdhcnJheScgJiYgc2NoZW1hLml0ZW1zLmZvcm1hdCA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYS5pdGVtcy5mb3JtYXQgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY2hlbWEuZm9ybWF0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbGlkYXRlVHlwZUFuZEZvcm1hdCh2YWwsIHR5cGUsIHNjaGVtYS5mb3JtYXQpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YWxpZGF0ZVR5cGVBbmRGb3JtYXQodmFsLCB0eXBlLCBzY2hlbWEuZm9ybWF0KTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBlbnVtXG4gICAgdmFsaWRhdGVFbnVtKHZhbCwgc2NoZW1hLmVudW0pO1xuXG4gICAgLy8gVmFsaWRhdGUgbWF4aW11bVxuICAgIHZhbGlkYXRlTWF4aW11bSh2YWwsIHNjaGVtYS5tYXhpbXVtLCB0eXBlLCBzY2hlbWEuZXhjbHVzaXZlTWF4aW11bSk7XG5cblxuICAgIC8vIFZhbGlkYXRlIG1heEl0ZW1zIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVNYXhJdGVtcyh2YWwsIHNjaGVtYS5tYXhJdGVtcyk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhMZW5ndGggKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZU1heExlbmd0aCh2YWwsIHNjaGVtYS5tYXhMZW5ndGgpO1xuXG4gICAgLy8gVmFsaWRhdGUgbWF4UHJvcGVydGllcyAoU3dhZ2dlciAyLjArKVxuICAgIHZhbGlkYXRlTWF4UHJvcGVydGllcyh2YWwsIHNjaGVtYS5tYXhQcm9wZXJ0aWVzKTtcblxuICAgIC8vIFZhbGlkYXRlIG1pbmltdW1cbiAgICB2YWxpZGF0ZU1pbmltdW0odmFsLCBzY2hlbWEubWluaW11bSwgdHlwZSwgc2NoZW1hLmV4Y2x1c2l2ZU1pbmltdW0pO1xuXG4gICAgLy8gVmFsaWRhdGUgbWluSXRlbXNcbiAgICB2YWxpZGF0ZU1pbkl0ZW1zKHZhbCwgc2NoZW1hLm1pbkl0ZW1zKTtcblxuICAgIC8vIFZhbGlkYXRlIG1pbkxlbmd0aCAoU3dhZ2dlciAyLjArKVxuICAgIHZhbGlkYXRlTWluTGVuZ3RoKHZhbCwgc2NoZW1hLm1pbkxlbmd0aCk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtaW5Qcm9wZXJ0aWVzIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVNaW5Qcm9wZXJ0aWVzKHZhbCwgc2NoZW1hLm1pblByb3BlcnRpZXMpO1xuXG4gICAgLy8gVmFsaWRhdGUgbXVsdGlwbGVPZiAoU3dhZ2dlciAyLjArKVxuICAgIHZhbGlkYXRlTXVsdGlwbGVPZih2YWwsIHNjaGVtYS5tdWx0aXBsZU9mKTtcblxuICAgIC8vIFZhbGlkYXRlIHBhdHRlcm4gKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZVBhdHRlcm4odmFsLCBzY2hlbWEucGF0dGVybik7XG5cbiAgICAvLyBWYWxpZGF0ZSB1bmlxdWVJdGVtc1xuICAgIHZhbGlkYXRlVW5pcXVlSXRlbXModmFsLCBzY2hlbWEudW5pcXVlSXRlbXMpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBlcnIucGF0aCA9IHBhdGg7XG5cbiAgICB0aHJvdyBlcnI7XG4gIH1cbn07XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvYXBpRGVjbGFyYXRpb24uanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJzd2FnZ2VyVmVyc2lvblwiLCBcImJhc2VQYXRoXCIsIFwiYXBpc1wiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJzd2FnZ2VyVmVyc2lvblwiOiB7IFwiZW51bVwiOiBbIFwiMS4yXCIgXSB9LFxuICAgICAgICBcImFwaVZlcnNpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImJhc2VQYXRoXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIixcbiAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl5odHRwcz86Ly9cIlxuICAgICAgICB9LFxuICAgICAgICBcInJlc291cmNlUGF0aFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCIsXG4gICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeL1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXBpc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXBpT2JqZWN0XCIgfVxuICAgICAgICB9LFxuICAgICAgICBcIm1vZGVsc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIm1vZGVsc09iamVjdC5qc29uI1wiXG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvZHVjZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICBcImNvbnN1bWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7IFwiJHJlZlwiOiBcImF1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIiB9XG4gICAgfSxcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcImFwaU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInBhdGhcIiwgXCJvcGVyYXRpb25zXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJwYXRoXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpLXRlbXBsYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl4vXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwib3BlcmF0aW9uc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJvcGVyYXRpb25PYmplY3QuanNvbiNcIiB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW1lVHlwZUFycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcIm1pbWUtdHlwZVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvYXV0aG9yaXphdGlvbk9iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2Jhc2ljQXV0aFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXBpS2V5XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJiYXNpY0F1dGhcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYmFzaWNBdXRoXCIgXSB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImFwaUtleVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIsIFwicGFzc0FzXCIsIFwia2V5bmFtZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYXBpS2V5XCIgXSB9LFxuICAgICAgICAgICAgICAgIFwicGFzc0FzXCI6IHsgXCJlbnVtXCI6IFsgXCJoZWFkZXJcIiwgXCJxdWVyeVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcImtleW5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm9hdXRoMlwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiwgXCJncmFudFR5cGVzXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJvYXV0aDJcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZVwiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZ3JhbnRUeXBlc1wiOiB7IFwiJHJlZlwiOiBcIm9hdXRoMkdyYW50VHlwZS5qc29uI1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwib2F1dGgyU2NvcGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJzY29wZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwic2NvcGVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufVxuXG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvZGF0YVR5cGUuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGF0YSB0eXBlIGFzIGRlc2NyaWJlZCBieSB0aGUgc3BlY2lmaWNhdGlvbiAodmVyc2lvbiAxLjIpXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJvbmVPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZWZUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZvaWRUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZVR5cGVcIiB9LFxuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbW9kZWxUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FycmF5VHlwZVwiIH1cbiAgICBdLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInJlZlR5cGVcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwidm9pZFR5cGVcIjoge1xuICAgICAgICAgICAgXCJlbnVtXCI6IFsgeyBcInR5cGVcIjogXCJ2b2lkXCIgfSBdXG4gICAgICAgIH0sXG4gICAgICAgIFwibW9kZWxUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bWJlclwiLCBcInN0cmluZ1wiLCBcImFycmF5XCIgXVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJwcmltaXRpdmVUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcImJvb2xlYW5cIiwgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIsIFwic3RyaW5nXCIgXVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVmYXVsdFZhbHVlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjogeyBcInR5cGVcIjogWyBcImFycmF5XCIsIFwib2JqZWN0XCIsIFwibnVsbFwiIF0gfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1pbmltdW1cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwibWF4aW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgICAgICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiaW50MzJcIiwgXCJpbnQ2NFwiIF0gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJudW1iZXJcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJmbG9hdFwiLCBcImRvdWJsZVwiIF0gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYnl0ZVwiLCBcImRhdGVcIiwgXCJkYXRlLXRpbWVcIiBdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcInN0cmluZ1wiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImludGVnZXJcIiwgXCJudW1iZXJcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJhcnJheVR5cGVcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiLCBcIml0ZW1zXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJhcnJheVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaXRlbXNPYmplY3RcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3JlZlR5cGVcIlxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZVR5cGVcIlxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjoge30sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHt9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2RhdGFUeXBlQmFzZS5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwiZGVzY3JpcHRpb25cIjogXCJEYXRhIHR5cGUgZmllbGRzIChzZWN0aW9uIDQuMy4zKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7IFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdIH0sXG4gICAgICAgIHsgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0gfVxuICAgIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCIkcmVmXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJmb3JtYXRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlZmF1bHRWYWx1ZVwiOiB7XG4gICAgICAgICAgICBcIm5vdFwiOiB7IFwidHlwZVwiOiBbIFwiYXJyYXlcIiwgXCJvYmplY3RcIiwgXCJudWxsXCIgXSB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWUsXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDFcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaXRlbXNPYmplY3RcIiB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH1cbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImludDMyXCIsIFwiaW50NjRcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJudW1iZXJcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiZmxvYXRcIiwgXCJkb3VibGVcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJieXRlXCIsIFwiZGF0ZVwiLCBcImRhdGUtdGltZVwiIF1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiaXRlbXNPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0sXG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJhbGxPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9pbmZvT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcImluZm8gb2JqZWN0IChzZWN0aW9uIDUuMS4zKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInRpdGxlXCIsIFwiZGVzY3JpcHRpb25cIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidGl0bGVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJ0ZXJtc09mU2VydmljZVVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgIFwiY29udGFjdFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcImVtYWlsXCIgfSxcbiAgICAgICAgXCJsaWNlbnNlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJsaWNlbnNlVXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfVxuICAgIH0sXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9tb2RlbHNPYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJpZFwiLCBcInByb3BlcnRpZXNcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiaWRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJvcGVydHlPYmplY3RcIiB9XG4gICAgICAgIH0sXG4gICAgICAgIFwic3ViVHlwZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGlzY3JpbWluYXRvclwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJzdWJUeXBlc1wiOiBbIFwiZGlzY3JpbWluYXRvclwiIF1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInByb3BlcnR5T2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL29hdXRoMkdyYW50VHlwZS5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwibWluUHJvcGVydGllc1wiOiAxLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiaW1wbGljaXRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2ltcGxpY2l0XCIgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uX2NvZGVcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2F1dGhvcml6YXRpb25Db2RlXCIgfVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiaW1wbGljaXRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJsb2dpbkVuZHBvaW50XCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJsb2dpbkVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9sb2dpbkVuZHBvaW50XCIgfSxcbiAgICAgICAgICAgICAgICBcInRva2VuTmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbkNvZGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0b2tlbkVuZHBvaW50XCIsIFwidG9rZW5SZXF1ZXN0RW5kcG9pbnRcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInRva2VuRW5kcG9pbnRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Rva2VuRW5kcG9pbnRcIiB9LFxuICAgICAgICAgICAgICAgIFwidG9rZW5SZXF1ZXN0RW5kcG9pbnRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Rva2VuUmVxdWVzdEVuZHBvaW50XCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJsb2dpbkVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuRW5kcG9pbnRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ1cmxcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgICAgICAgICAgXCJ0b2tlbk5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuUmVxdWVzdEVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICAgICAgICAgIFwiY2xpZW50SWROYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImNsaWVudFNlY3JldE5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9vcGVyYXRpb25PYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgeyBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIiB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJtZXRob2RcIiwgXCJuaWNrbmFtZVwiLCBcInBhcmFtZXRlcnNcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIm1ldGhvZFwiOiB7IFwiZW51bVwiOiBbIFwiR0VUXCIsIFwiSEVBRFwiLCBcIlBPU1RcIiwgXCJQVVRcIiwgXCJQQVRDSFwiLCBcIkRFTEVURVwiLCBcIk9QVElPTlNcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJzdW1tYXJ5XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwibWF4TGVuZ3RoXCI6IDEyMCB9LFxuICAgICAgICAgICAgICAgIFwibm90ZXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwibmlja25hbWVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXlthLXpBLVowLTlfXSskXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiYXV0aG9yaXphdGlvbk9iamVjdC5qc29uIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZVwiXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwicGFyYW1ldGVyc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJwYXJhbWV0ZXJPYmplY3QuanNvbiNcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInJlc3BvbnNlTWVzc2FnZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZU1lc3NhZ2VPYmplY3RcIn1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwicHJvZHVjZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICAgICAgICAgIFwiY29uc3VtZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVwcmVjYXRlZFwiOiB7IFwiZW51bVwiOiBbIFwidHJ1ZVwiLCBcImZhbHNlXCIgXSB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICBdLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInJlc3BvbnNlTWVzc2FnZU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcImNvZGVcIiwgXCJtZXNzYWdlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJjb2RlXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZmMyNjE2c2VjdGlvbjEwXCIgfSxcbiAgICAgICAgICAgICAgICBcIm1lc3NhZ2VcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwicmVzcG9uc2VNb2RlbFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJyZmMyNjE2c2VjdGlvbjEwXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAxMDAsXG4gICAgICAgICAgICBcIm1heGltdW1cIjogNjAwLFxuICAgICAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW1lVHlwZUFycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcIm1pbWUtdHlwZVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcGFyYW1ldGVyT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJhbGxPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCIgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwicGFyYW1UeXBlXCIsIFwibmFtZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwicGFyYW1UeXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJwYXRoXCIsIFwicXVlcnlcIiwgXCJib2R5XCIsIFwiaGVhZGVyXCIsIFwiZm9ybVwiIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwibmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIFwiYWxsb3dNdWx0aXBsZVwiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJ0eXBlIEZpbGUgcmVxdWlyZXMgc3BlY2lhbCBwYXJhbVR5cGUgYW5kIGNvbnN1bWVzXCIsXG4gICAgICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcIm5vdFwiOiB7IFwiZW51bVwiOiBbIFwiRmlsZVwiIF0gfSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiRmlsZVwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwicGFyYW1UeXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJmb3JtXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiZW51bVwiOiBbIFwibXVsdGlwYXJ0L2Zvcm0tZGF0YVwiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgXVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL3Jlc291cmNlTGlzdGluZy5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInN3YWdnZXJWZXJzaW9uXCIsIFwiYXBpc1wiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJzd2FnZ2VyVmVyc2lvblwiOiB7IFwiZW51bVwiOiBbIFwiMS4yXCIgXSB9LFxuICAgICAgICBcImFwaXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJyZXNvdXJjZU9iamVjdC5qc29uI1wiIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJhcGlWZXJzaW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJpbmZvXCI6IHsgXCIkcmVmXCI6IFwiaW5mb09iamVjdC5qc29uI1wiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjogeyBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9yZXNvdXJjZU9iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInBhdGhcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicGF0aFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgfSxcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInRpdGxlXCI6IFwiQSBKU09OIFNjaGVtYSBmb3IgU3dhZ2dlciAyLjAgQVBJLlwiLFxuICBcImlkXCI6IFwiaHR0cDovL3N3YWdnZXIuaW8vdjIvc2NoZW1hLmpzb24jXCIsXG4gIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgXCJyZXF1aXJlZFwiOiBbXG4gICAgXCJzd2FnZ2VyXCIsXG4gICAgXCJpbmZvXCIsXG4gICAgXCJwYXRoc1wiXG4gIF0sXG4gIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgIFwiXngtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICB9XG4gIH0sXG4gIFwicHJvcGVydGllc1wiOiB7XG4gICAgXCJzd2FnZ2VyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgXCIyLjBcIlxuICAgICAgXSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgU3dhZ2dlciB2ZXJzaW9uIG9mIHRoaXMgZG9jdW1lbnQuXCJcbiAgICB9LFxuICAgIFwiaW5mb1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2luZm9cIlxuICAgIH0sXG4gICAgXCJob3N0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIixcbiAgICAgIFwicGF0dGVyblwiOiBcIl5bXnt9LyA6XFxcXFxcXFxdKyg/OjpcXFxcZCspPyRcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgZnVsbHkgcXVhbGlmaWVkIFVSSSB0byB0aGUgaG9zdCBvZiB0aGUgQVBJLlwiXG4gICAgfSxcbiAgICBcImJhc2VQYXRoXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJwYXR0ZXJuXCI6IFwiXi9cIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgYmFzZSBwYXRoIHRvIHRoZSBBUEkuIEV4YW1wbGU6ICcvYXBpJy5cIlxuICAgIH0sXG4gICAgXCJzY2hlbWVzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxuICAgIH0sXG4gICAgXCJjb25zdW1lc1wiOiB7XG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgYWNjZXB0ZWQgYnkgdGhlIEFQSS5cIixcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgfSxcbiAgICBcInByb2R1Y2VzXCI6IHtcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBwcm9kdWNlLlwiLFxuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcbiAgICB9LFxuICAgIFwicGF0aHNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXRoc1wiXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyRGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJyZXNwb25zZXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZURlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwic2VjdXJpdHlcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVwiXG4gICAgfSxcbiAgICBcInNlY3VyaXR5RGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eURlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwidGFnc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdGFnXCJcbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICB9XG4gIH0sXG4gIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgIFwiaW5mb1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJHZW5lcmFsIGluZm9ybWF0aW9uIGFib3V0IHRoZSBBUEkuXCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ2ZXJzaW9uXCIsXG4gICAgICAgIFwidGl0bGVcIlxuICAgICAgXSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIHVuaXF1ZSBhbmQgcHJlY2lzZSB0aXRsZSBvZiB0aGUgQVBJLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidmVyc2lvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgc2VtYW50aWMgdmVyc2lvbiBudW1iZXIgb2YgdGhlIEFQSS5cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsb25nZXIgZGVzY3JpcHRpb24gb2YgdGhlIEFQSS4gU2hvdWxkIGJlIGRpZmZlcmVudCBmcm9tIHRoZSB0aXRsZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGVybXNPZlNlcnZpY2VcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgdGVybXMgb2Ygc2VydmljZSBmb3IgdGhlIEFQSS5cIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbnRhY3RcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29udGFjdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibGljZW5zZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9saWNlbnNlXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJjb250YWN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkNvbnRhY3QgaW5mb3JtYXRpb24gZm9yIHRoZSBvd25lcnMgb2YgdGhlIEFQSS5cIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgaWRlbnRpZnlpbmcgbmFtZSBvZiB0aGUgY29udGFjdCBwZXJzb24vb3JnYW5pemF0aW9uLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIFVSTCBwb2ludGluZyB0byB0aGUgY29udGFjdCBpbmZvcm1hdGlvbi5cIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW1haWxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgZW1haWwgYWRkcmVzcyBvZiB0aGUgY29udGFjdCBwZXJzb24vb3JnYW5pemF0aW9uLlwiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwiZW1haWxcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImxpY2Vuc2VcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCJcbiAgICAgIF0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIGxpY2Vuc2UgdHlwZS4gSXQncyBlbmNvdXJhZ2VkIHRvIHVzZSBhbiBPU0kgY29tcGF0aWJsZSBsaWNlbnNlLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIFVSTCBwb2ludGluZyB0byB0aGUgbGljZW5zZS5cIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aHNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUmVsYXRpdmUgcGF0aHMgdG8gdGhlIGluZGl2aWR1YWwgZW5kcG9pbnRzLiBUaGV5IG11c3QgYmUgcmVsYXRpdmUgdG8gdGhlICdiYXNlUGF0aCcuXCIsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJeL1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXRoSXRlbVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgIH0sXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiT25lIG9yIG1vcmUgSlNPTiBvYmplY3RzIGRlc2NyaWJpbmcgdGhlIHNjaGVtYXMgYmVpbmcgY29uc3VtZWQgYW5kIHByb2R1Y2VkIGJ5IHRoZSBBUEkuXCJcbiAgICB9LFxuICAgIFwicGFyYW1ldGVyRGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJcIlxuICAgICAgfSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJPbmUgb3IgbW9yZSBKU09OIHJlcHJlc2VudGF0aW9ucyBmb3IgcGFyYW1ldGVyc1wiXG4gICAgfSxcbiAgICBcInJlc3BvbnNlRGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVwiXG4gICAgICB9LFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIk9uZSBvciBtb3JlIEpTT04gcmVwcmVzZW50YXRpb25zIGZvciBwYXJhbWV0ZXJzXCJcbiAgICB9LFxuICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJpbmZvcm1hdGlvbiBhYm91dCBleHRlcm5hbCBkb2N1bWVudGF0aW9uXCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ1cmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiZXhhbXBsZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeW2EtejAtOS1dKy9bYS16MC05XFxcXC0rXSskXCI6IHt9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJtaW1lVHlwZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgTUlNRSB0eXBlIG9mIHRoZSBIVFRQIG1lc3NhZ2UuXCJcbiAgICB9LFxuICAgIFwib3BlcmF0aW9uXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwicmVzcG9uc2VzXCJcbiAgICAgIF0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInRhZ3NcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwic3VtbWFyeVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgc3VtbWFyeSBvZiB0aGUgb3BlcmF0aW9uLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxvbmdlciBkZXNjcmlwdGlvbiBvZiB0aGUgb3BlcmF0aW9uLCBnaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9LFxuICAgICAgICBcIm9wZXJhdGlvbklkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBmcmllbmRseSBuYW1lIG9mIHRoZSBvcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcInByb2R1Y2VzXCI6IHtcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgdGhlIEFQSSBjYW4gcHJvZHVjZS5cIixcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbnN1bWVzXCI6IHtcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgdGhlIEFQSSBjYW4gY29uc3VtZS5cIixcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyc0xpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlc3BvbnNlc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlcHJlY2F0ZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aEl0ZW1cIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHV0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlbGV0ZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcIm9wdGlvbnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJoZWFkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0Y2hcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlcnNMaXN0XCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJyZXNwb25zZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUmVzcG9uc2Ugb2JqZWN0cyBuYW1lcyBjYW4gZWl0aGVyIGJlIGFueSB2YWxpZCBIVFRQIHN0YXR1cyBjb2RlIG9yICdkZWZhdWx0Jy5cIixcbiAgICAgIFwibWluUHJvcGVydGllc1wiOiAxLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl4oWzAtOV17M30pJHxeKGRlZmF1bHQpJFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVZhbHVlXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwibm90XCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicmVzcG9uc2VWYWx1ZVwiOiB7XG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9qc29uUmVmZXJlbmNlXCJcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0sXG4gICAgXCJyZXNwb25zZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcImRlc2NyaXB0aW9uXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtYVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhhbXBsZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhhbXBsZXNcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJoZWFkZXJzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIFwiaGVhZGVyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJ2ZW5kb3JFeHRlbnNpb25cIjoge1xuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkFueSBwcm9wZXJ0eSBzdGFydGluZyB3aXRoIHgtIGlzIHZhbGlkLlwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB0cnVlLFxuICAgICAgXCJhZGRpdGlvbmFsSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJib2R5UGFyYW1ldGVyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiLFxuICAgICAgICBcImluXCIsXG4gICAgICAgIFwic2NoZW1hXCJcbiAgICAgIF0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImJvZHlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtYVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJoZWFkZXJQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJoZWFkZXJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInF1ZXJ5UGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicXVlcnlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhbGxvd0VtcHR5VmFsdWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2UsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcImFsbG93cyBzZW5kaW5nIGEgcGFyYW1ldGVyIGJ5IG5hbWUgb25seSBvciB3aXRoIGFuIGVtcHR5IHZhbHVlLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRXaXRoTXVsdGlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJmb3JtRGF0YVBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgd2hldGhlciBvciBub3QgdGhpcyBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQgb3Igb3B0aW9uYWwuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImZvcm1EYXRhXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYWxsb3dFbXB0eVZhbHVlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJhbGxvd3Mgc2VuZGluZyBhIHBhcmFtZXRlciBieSBuYW1lIG9ubHkgb3Igd2l0aCBhbiBlbXB0eSB2YWx1ZS5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCIsXG4gICAgICAgICAgICBcImZpbGVcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRXaXRoTXVsdGlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJwYXRoUGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICAgIF0sXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgd2hldGhlciBvciBub3QgdGhpcyBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQgb3Igb3B0aW9uYWwuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicGF0aFwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwibm9uQm9keVBhcmFtZXRlclwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIixcbiAgICAgICAgXCJpblwiLFxuICAgICAgICBcInR5cGVcIlxuICAgICAgXSxcbiAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9oZWFkZXJQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9mb3JtRGF0YVBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3F1ZXJ5UGFyYW1ldGVyU3ViU2NoZW1hXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0aFBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9LFxuICAgIFwicGFyYW1ldGVyXCI6IHtcbiAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9ib2R5UGFyYW1ldGVyXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbm9uQm9keVBhcmFtZXRlclwiXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9LFxuICAgIFwic2NoZW1hXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgZGV0ZXJtaW5pc3RpYyB2ZXJzaW9uIG9mIGEgSlNPTiBTY2hlbWEgb2JqZWN0LlwiLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInRpdGxlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90aXRsZVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2Rlc2NyaXB0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvc3RyaW5nQXJyYXlcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9hZGRpdGlvbmFsUHJvcGVydGllc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdHlwZVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIF0sXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYWxsT2ZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcImRpc2NyaW1pbmF0b3JcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwicmVhZE9ubHlcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ4bWxcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMveG1sXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGFtcGxlXCI6IHt9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJwcmltaXRpdmVzSXRlbXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVJlcXVpcmVtZW50XCJcbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwic2VjdXJpdHlSZXF1aXJlbWVudFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgIH1cbiAgICB9LFxuICAgIFwieG1sXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lc3BhY2VcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHJlZml4XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImF0dHJpYnV0ZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIndyYXBwZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJ0YWdcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwic2VjdXJpdHlEZWZpbml0aW9uc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2Jhc2ljQXV0aGVudGljYXRpb25TZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaUtleVNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgySW1wbGljaXRTZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlBhc3N3b3JkU2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJBcHBsaWNhdGlvblNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyQWNjZXNzQ29kZVNlY3VyaXR5XCJcbiAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiYmFzaWNBdXRoZW50aWNhdGlvblNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYmFzaWNcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImFwaUtleVNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJuYW1lXCIsXG4gICAgICAgIFwiaW5cIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYXBpS2V5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiaGVhZGVyXCIsXG4gICAgICAgICAgICBcInF1ZXJ5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJJbXBsaWNpdFNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJpbXBsaWNpdFwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInNjb3Blc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMlBhc3N3b3JkU2VjdXJpdHlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiLFxuICAgICAgICBcImZsb3dcIixcbiAgICAgICAgXCJ0b2tlblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJwYXNzd29yZFwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInNjb3Blc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJBcHBsaWNhdGlvblNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwidG9rZW5VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYXBwbGljYXRpb25cIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgyQWNjZXNzQ29kZVNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiLFxuICAgICAgICBcInRva2VuVXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcIm9hdXRoMlwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZsb3dcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFjY2Vzc0NvZGVcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidG9rZW5VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMlNjb3Blc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgfVxuICAgIH0sXG4gICAgXCJtZWRpYVR5cGVMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZVwiXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInBhcmFtZXRlcnNMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIHBhcmFtZXRlcnMgbmVlZGVkIHRvIHNlbmQgYSB2YWxpZCBBUEkgY2FsbC5cIixcbiAgICAgIFwiYWRkaXRpb25hbEl0ZW1zXCI6IGZhbHNlLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyXCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvanNvblJlZmVyZW5jZVwiXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInNjaGVtZXNMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIHRyYW5zZmVyIHByb3RvY29sIG9mIHRoZSBBUEkuXCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgXCJodHRwXCIsXG4gICAgICAgICAgXCJodHRwc1wiLFxuICAgICAgICAgIFwid3NcIixcbiAgICAgICAgICBcIndzc1wiXG4gICAgICAgIF1cbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgIFwiY3N2XCIsXG4gICAgICAgIFwic3N2XCIsXG4gICAgICAgIFwidHN2XCIsXG4gICAgICAgIFwicGlwZXNcIlxuICAgICAgXSxcbiAgICAgIFwiZGVmYXVsdFwiOiBcImNzdlwiXG4gICAgfSxcbiAgICBcImNvbGxlY3Rpb25Gb3JtYXRXaXRoTXVsdGlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImVudW1cIjogW1xuICAgICAgICBcImNzdlwiLFxuICAgICAgICBcInNzdlwiLFxuICAgICAgICBcInRzdlwiLFxuICAgICAgICBcInBpcGVzXCIsXG4gICAgICAgIFwibXVsdGlcIlxuICAgICAgXSxcbiAgICAgIFwiZGVmYXVsdFwiOiBcImNzdlwiXG4gICAgfSxcbiAgICBcInRpdGxlXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3RpdGxlXCJcbiAgICB9LFxuICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVzY3JpcHRpb25cIlxuICAgIH0sXG4gICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2RlZmF1bHRcIlxuICAgIH0sXG4gICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL211bHRpcGxlT2ZcIlxuICAgIH0sXG4gICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL21heGltdW1cIlxuICAgIH0sXG4gICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgIH0sXG4gICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL21pbmltdW1cIlxuICAgIH0sXG4gICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgIH0sXG4gICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgfSxcbiAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgIH0sXG4gICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3BhdHRlcm5cIlxuICAgIH0sXG4gICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICB9LFxuICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICB9LFxuICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdW5pcXVlSXRlbXNcIlxuICAgIH0sXG4gICAgXCJlbnVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2VudW1cIlxuICAgIH0sXG4gICAgXCJqc29uUmVmZXJlbmNlXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkNvcmUgc2NoZW1hIG1ldGEtc2NoZW1hXCIsXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwic2NoZW1hQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICB9LFxuICAgICAgICBcInBvc2l0aXZlSW50ZWdlclwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcIm1pbmltdW1cIjogMFxuICAgICAgICB9LFxuICAgICAgICBcInBvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCI6IHtcbiAgICAgICAgICAgIFwiYWxsT2ZcIjogWyB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSwgeyBcImRlZmF1bHRcIjogMCB9IF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzaW1wbGVUeXBlc1wiOiB7XG4gICAgICAgICAgICBcImVudW1cIjogWyBcImFycmF5XCIsIFwiYm9vbGVhblwiLCBcImludGVnZXJcIiwgXCJudWxsXCIsIFwibnVtYmVyXCIsIFwib2JqZWN0XCIsIFwic3RyaW5nXCIgXVxuICAgICAgICB9LFxuICAgICAgICBcInN0cmluZ0FycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9XG4gICAgfSxcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImlkXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcIiRzY2hlbWFcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge30sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAwLFxuICAgICAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwicmVnZXhcIlxuICAgICAgICB9LFxuICAgICAgICBcImFkZGl0aW9uYWxJdGVtc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1heFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXG4gICAgICAgIFwibWluUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxuICAgICAgICBcInJlcXVpcmVkXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zdHJpbmdBcnJheVwiIH0sXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICAgICAgeyBcInR5cGVcIjogXCJib29sZWFuXCIgfSxcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCIgfVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zaW1wbGVUeXBlc1wiIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zaW1wbGVUeXBlc1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImFsbE9mXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH0sXG4gICAgICAgIFwiYW55T2ZcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfSxcbiAgICAgICAgXCJvbmVPZlwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9LFxuICAgICAgICBcIm5vdFwiOiB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiBbIFwibWF4aW11bVwiIF0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiBbIFwibWluaW11bVwiIF1cbiAgICB9LFxuICAgIFwiZGVmYXVsdFwiOiB7fVxufVxuIl19
