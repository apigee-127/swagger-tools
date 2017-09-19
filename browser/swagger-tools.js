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

// Done this way to make the Browserify build smaller
var _ = {
  each: require('lodash-compat/collection/each'),
  indexOf: require('lodash-compat/array/indexOf'),
  isArray: require('lodash-compat/lang/isArray'),
  isPlainObject: require('lodash-compat/lang/isPlainObject'),
  isString: require('lodash-compat/lang/isString'),
  isUndefined: require('lodash-compat/lang/isUndefined'),
  reduce: require('lodash-compat/collection/reduce')
};
var JsonRefs = (typeof window !== "undefined" ? window['JsonRefs'] : typeof global !== "undefined" ? global['JsonRefs'] : null);
var traverse = (typeof window !== "undefined" ? window['traverse'] : typeof global !== "undefined" ? global['traverse'] : null);
var ZSchema = (typeof window !== "undefined" ? window['ZSchema'] : typeof global !== "undefined" ? global['ZSchema'] : null);

var customJsonSchemaFormats = ['byte', 'double', 'float', 'int32', 'int64', 'mime-type', 'uri-template'];
var draft04Json = require('../schemas/json-schema-draft-04.json');
var draft04Url = 'http://json-schema.org/draft-04/schema';
var specCache = {};

module.exports.registerCustomFormats = function (json) {
  traverse(json).forEach(function () {
    var name = this.key;
    var format = this.node;

    if (name === 'format' && _.indexOf(ZSchema.getRegisteredFormats(), format) === -1) {
      ZSchema.registerFormat(format, function () {
        return true;
      });
    }
  });
};

module.exports.createJsonValidator = function (schemas) {
  var validator = new ZSchema({
    breakOnFirstError: false,
    reportPathAsArray: true
  });
  var result;

  // Add the draft-04 spec
  validator.setRemoteReference(draft04Url, draft04Json);

  // Swagger uses some unsupported/invalid formats so just make them all pass
  _.each(customJsonSchemaFormats, function (format) {
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
        console.error('  ' + (_.isArray(err.path) ? JsonRefs.pathToPtr(err.path) : err.path) + ': ' + err.message);
      });

      throw new Error('Unable to create validator due to invalid JSON Schema');
    }
  }

  return validator;
};

module.exports.formatResults = function (results) {
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

var getErrorCount = module.exports.getErrorCount = function (results) {
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

var coerceVersion = function (version) {
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
module.exports.getSpec = function (version, throwError) {
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
module.exports.getSwaggerVersion = function (document) {
  return _.isPlainObject(document) ? coerceVersion(document.swaggerVersion || document.swagger) : undefined;
};

module.exports.printValidationResults = function (version, apiDOrSO, apiDeclarations, results, printSummary) {
  var hasErrors = getErrorCount(results) > 0;
  var stream = hasErrors ? console.error : console.log;
  var pluralize = function (string, count) {
    return count === 1 ? string : string + 's';
  };
  var printErrorsOrWarnings = function (header, entries, indent) {
    if (header) {
      stream(header + ':');
      stream();
    }

    _.each(entries, function (entry) {
      stream(new Array(indent + 1).join(' ') + JsonRefs.pathToPtr(entry.path) + ': ' + entry.message);

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

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../lib/specs":2,"../schemas/json-schema-draft-04.json":185,"lodash-compat/array/indexOf":5,"lodash-compat/collection/each":9,"lodash-compat/collection/reduce":13,"lodash-compat/lang/isArray":84,"lodash-compat/lang/isPlainObject":93,"lodash-compat/lang/isString":94,"lodash-compat/lang/isUndefined":96}],2:[function(require,module,exports){
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

// Done this way to make the Browserify build smaller
var _ = {
  cloneDeep: require('lodash-compat/lang/cloneDeep'),
  difference: require('lodash-compat/array/difference'),
  each: require('lodash-compat/collection/each'),
  find: require('lodash-compat/collection/find'),
  has: require('lodash-compat/object/has'),
  isArray: require('lodash-compat/lang/isArray'),
  isFunction: require('lodash-compat/lang/isFunction'),
  isPlainObject: require('lodash-compat/lang/isPlainObject'),
  isString: require('lodash-compat/lang/isString'),
  isUndefined: require('lodash-compat/lang/isUndefined'),
  map: require('lodash-compat/collection/map'),
  reduce: require('lodash-compat/collection/reduce'),
  set: require('lodash-compat/object/set'),
  union: require('lodash-compat/array/union')
};
var async = (typeof window !== "undefined" ? window['async'] : typeof global !== "undefined" ? global['async'] : null);
var helpers = require('./helpers');
var JsonRefs = (typeof window !== "undefined" ? window['JsonRefs'] : typeof global !== "undefined" ? global['JsonRefs'] : null);
var SparkMD5 = (typeof window !== "undefined" ? window['SparkMD5'] : typeof global !== "undefined" ? global['SparkMD5'] : null);
var swaggerConverter = (typeof window !== "undefined" ? window['SwaggerConverter']['convert'] : typeof global !== "undefined" ? global['SwaggerConverter']['convert'] : null);
var traverse = (typeof window !== "undefined" ? window['traverse'] : typeof global !== "undefined" ? global['traverse'] : null);
var validators = require('./validators');
var YAML = (typeof window !== "undefined" ? window['jsyaml'] : typeof global !== "undefined" ? global['jsyaml'] : null);

// Work around swagger-converter packaging issue (Browser builds only)
if (_.isPlainObject(swaggerConverter)) {
  swaggerConverter = global.SwaggerConverter.convert;
}

var documentCache = {};

var sanitizeRef = function (version, ref) {
  return version !== '1.2' ? ref : ref.replace('#/models/', '');
};

var swagger1RefPreProcesor = function (obj) {
  var pObj = _.cloneDeep(obj);

  pObj.$ref = '#/models/' + obj.$ref;

  return pObj;
};
var validOptionNames = _.map(helpers.swaggerOperationMethods, function (method) {
  return method.toLowerCase();
});

var isRemotePtr = function (refDetails) {
  return ['relative', 'remote'].indexOf(refDetails.type) > -1;
};

var createErrorOrWarning = function (code, message, path, dest) {
  dest.push({
    code: code,
    message: message,
    path: path
  });
};

var addReference = function (cacheEntry, defPathOrPtr, refPathOrPtr, results, omitError) {
  var result = true;
  var swaggerVersion = helpers.getSwaggerVersion(cacheEntry.resolved);
  var defPath = _.isArray(defPathOrPtr) ? defPathOrPtr : JsonRefs.pathFromPtr(defPathOrPtr);
  var defPtr = _.isArray(defPathOrPtr) ? JsonRefs.pathToPtr(defPathOrPtr) : defPathOrPtr;
  var refPath = _.isArray(refPathOrPtr) ? refPathOrPtr : JsonRefs.pathFromPtr(refPathOrPtr);
  var refPtr = _.isArray(refPathOrPtr) ? JsonRefs.pathToPtr(refPathOrPtr) : refPathOrPtr;
  var code;
  var def;
  var displayId;
  var i;
  var msgPrefix;
  var type;

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

  // If the reference was not found and this is not an authorization/security scope reference, attempt to find a
  // parent object to add the reference too.  (Issue 176)
  if (_.isUndefined(def) && ['AUTHORIZATION_SCOPE', 'SECURITY_DEFINITION_SCOPE'].indexOf(code) === -1) {
    // Attempt to find the definition in case the reference is to a path within a definition`
    for (i = 1; i < defPath.length; i++) {
      var pPath = defPath.slice(0, defPath.length - i);
      var pPtr = JsonRefs.pathToPtr(pPath);
      var pDef = cacheEntry.definitions[pPtr];

      if (!_.isUndefined(pDef)) {
        def = pDef;

        break;
      }
    }
  }

  if (_.isUndefined(def)) {
    if (!omitError) {
      if (cacheEntry.swaggerVersion !== '1.2' && ['SECURITY_DEFINITION', 'SECURITY_DEFINITION_SCOPE'].indexOf(code) === -1) {
        refPath.push('$ref');
      }

      createErrorOrWarning('UNRESOLVABLE_' + code, msgPrefix + ' could not be resolved: ' + displayId, refPath,
                           results.errors);
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

var getOrComposeSchema = function (documentMetadata, modelId) {
  var title = 'Composed ' + (documentMetadata.swaggerVersion === '1.2' ?
                               JsonRefs.pathFromPtr(modelId).pop() :
                               modelId);
  var metadata = documentMetadata.definitions[modelId];
  var originalT = traverse(documentMetadata.original);
  var resolvedT = traverse(documentMetadata.resolved);
  var composed;
  var original;

  if (!metadata) {
    return undefined;
  }

  original = _.cloneDeep(originalT.get(JsonRefs.pathFromPtr(modelId)));
  composed = _.cloneDeep(resolvedT.get(JsonRefs.pathFromPtr(modelId)));

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

      _.each(JsonRefs.findRefs(oProp, {
        includeInvalid: true,
        refPreProcessor: swagger1RefPreProcesor
      }), function (refDetails, refPtr) {
        var dMetadata = documentMetadata.definitions[refDetails.uri];
        var path = JsonRefs.pathFromPtr(refPtr);

        if (dMetadata.lineage.length > 0) {
          traverse(property).set(path, getOrComposeSchema(documentMetadata, refDetails.uri));
        } else {
          traverse(property).set(path.concat('title'), 'Composed ' + sanitizeRef(documentMetadata.swaggerVersion,
                                                                                 refDetails.uri));
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

var createUnusedErrorOrWarning = function (val, codeSuffix, msgPrefix, path, dest) {
  createErrorOrWarning('UNUSED_' + codeSuffix, msgPrefix + ' is defined but is not used: ' + val, path, dest);
};

var getDocumentCache = function (apiDOrSO) {
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

var handleValidationError = function (results, callback) {
  var err = new Error('The Swagger document(s) are invalid');

  err.errors = results.errors;
  err.failedValidation = true;
  err.warnings = results.warnings;

  if (results.apiDeclarations) {
    err.apiDeclarations = results.apiDeclarations;
  }

  callback(err);
};

var normalizePath = function (path) {
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

var removeCirculars = function (obj) {
  function walk (ancestors, node, path) {
    function walkItem (item, segment) {
      path.push(segment);
      walk(ancestors, item, path);
      path.pop();
    }

    // We do not process circular objects again
    if (ancestors.indexOf(node) === -1) {
      ancestors.push(node);

      if (_.isArray(node) || _.isPlainObject(node)) {
        _.each(node, function (member, indexOrKey) {
          walkItem(member, indexOrKey.toString());
        });
      }
    } else {
      _.set(obj, path, {});
    }

    ancestors.pop();
  }

  walk([], obj, []);
};


var validateNoExist = function (data, val, codeSuffix, msgPrefix, path, dest) {
  if (!_.isUndefined(data) && data.indexOf(val) > -1) {
    createErrorOrWarning('DUPLICATE_' + codeSuffix, msgPrefix + ' already defined: ' + val, path, dest);
  }
};

var validateSchemaConstraints = function (documentMetadata, schema, path, results, skip) {
  try {
    validators.validateSchemaConstraints(documentMetadata.swaggerVersion, schema, path, undefined);
  } catch (err) {
    if (!skip) {
      createErrorOrWarning(err.code, err.message, err.path, results.errors);
    }
  }
};

var processDocument = function (documentMetadata, results) {
  var swaggerVersion = documentMetadata.swaggerVersion;
  var getDefinitionMetadata = function (defPath, inline) {
    var defPtr = JsonRefs.pathToPtr(defPath);
    var metadata = documentMetadata.definitions[defPtr];

    if (!metadata) {
      metadata = documentMetadata.definitions[defPtr] = {
        inline: inline || false,
        references: []
      };

      // For model definitions, add the inheritance properties
      if (['definitions', 'models'].indexOf(JsonRefs.pathFromPtr(defPtr)[0]) > -1) {
        metadata.cyclical = false;
        metadata.lineage = undefined;
        metadata.parents = [];
      }
    }

    return metadata;
  };
  var getDisplayId = function (id) {
    return swaggerVersion === '1.2' ? JsonRefs.pathFromPtr(id).pop() : id;
  };
  var jsonRefsOptions = {
    filter: 'local',
    includeInvalid: true
  };
  var walk = function (root, id, lineage) {
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

  // Process model definitions
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
          var subPtr = JsonRefs.pathToPtr(subPath);
          var subMetadata = documentMetadata.definitions[subPtr];
          var refPath = modelDefPath.concat(['subTypes', index.toString()]);

          // If the metadata does not yet exist, create it
          if (!subMetadata && documentMetadata.resolved[modelDefsProp][subType]) {
            subMetadata = getDefinitionMetadata(subPath);
          }

          // If the reference is valid, add the parent
          if (addReference(documentMetadata, subPath, refPath, results)) {
            subMetadata.parents.push(JsonRefs.pathToPtr(modelDefPath));
          }
        });

        break;

      default:
        _.each(documentMetadata.original[modelDefsProp][modelId].allOf, function (schema, index) {
          var isInline = false;
          var parentPath;

          if (_.isUndefined(schema.$ref) || isRemotePtr(JsonRefs.getRefDetails(schema))) {
            isInline = true;
            parentPath = modelDefPath.concat(['allOf', index.toString()]);
          } else {
            parentPath = JsonRefs.pathFromPtr(schema.$ref);
          }

          // If the parent model does not exist, do not create its metadata
          if (!_.isUndefined(traverse(documentMetadata.resolved).get(parentPath))) {
            // Create metadata for parent
            getDefinitionMetadata(parentPath, isInline);

            modelMetadata.parents.push(JsonRefs.pathToPtr(parentPath));
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
    var defPath = JsonRefs.pathFromPtr(id);
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
      var pModel = traverse(documentMetadata.resolved).get(JsonRefs.pathFromPtr(id));

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

  if (documentMetadata.swaggerVersion === '1.2') {
    jsonRefsOptions.refPreProcessor = swagger1RefPreProcesor;
  }

  // Process local references
  _.each(JsonRefs.findRefs(documentMetadata.original, jsonRefsOptions), function (refDetails, refPtr) {
    addReference(documentMetadata, refDetails.uri, refPtr, results);
  });

  // Process invalid references
  _.each(documentMetadata.referencesMetadata, function (refDetails, refPtr) {
    if (isRemotePtr(refDetails) && refDetails.missing === true) {
      results.errors.push({
        code: 'UNRESOLVABLE_REFERENCE',
        message: 'Reference could not be resolved: ' + sanitizeRef(documentMetadata.swaggerVersion, refDetails.uri),
        path: JsonRefs.pathFromPtr(refPtr).concat('$ref')
      });
    }
  });
};

var validateExist = function (data, val, codeSuffix, msgPrefix, path, dest) {
  if (!_.isUndefined(data) && data.indexOf(val) === -1) {
    createErrorOrWarning('UNRESOLVABLE_' + codeSuffix, msgPrefix + ' could not be resolved: ' + val, path, dest);
  }
};

var processAuthRefs = function (documentMetadata, authRefs, path, results) {
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
  var jsonRefsOptions = {
    includeInvalid: true,
    loaderOptions: {
      processContent: function (res, callback) {
        callback(undefined, YAML.safeLoad(res.text));
      }
    }
  };

  if (!cacheEntry.resolved) {
    // For Swagger 1.2, we have to create real JSON References
    if (swaggerVersion === '1.2') {
      jsonRefsOptions.refPreProcessor = swagger1RefPreProcesor;
    }

    // Resolve references
    JsonRefs.resolveRefs(apiDOrSO, jsonRefsOptions)
      .then(function (results) {
        removeCirculars(results.resolved);

        // Fix circular references
        _.each(results.refs, function (refDetails, refPtr) {
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

var validateAgainstSchema = function (spec, schemaOrName, data, callback) {
  var validator = _.isString(schemaOrName) ? spec.validators[schemaOrName] : helpers.createJsonValidator();

  helpers.registerCustomFormats(data);

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

var validateDefinitions = function (documentMetadata, results) {
  // Validate unused definitions
  _.each(documentMetadata.definitions, function (metadata, id) {
    var defPath = JsonRefs.pathFromPtr(id);
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

var validateParameters = function (spec, documentMetadata, nPath, parameters, path, results,
                                   skipMissing) {
  var createParameterComboError = function (path) {
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

var validateSwagger1_2 = function (spec, resourceListing, apiDeclarations, callback) { // jshint ignore:line
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

var validateSwagger2_0 = function (spec, swaggerObject, callback) { // jshint ignore:line
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

var validateSemantically = function (spec, rlOrSO, apiDeclarations, callback) {
  var cbWrapper = function (err, results) {
    callback(err, helpers.formatResults(results));
  };
  if (spec.version === '1.2') {
    validateSwagger1_2(spec, rlOrSO, apiDeclarations, cbWrapper); // jshint ignore:line
  } else {
    validateSwagger2_0(spec, rlOrSO, cbWrapper); // jshint ignore:line
  }
};

var validateStructurally = function (spec, rlOrSO, apiDeclarations, callback) {
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

                            async.map(apiDeclarations, function (apiDeclaration, callback2) {
                              validateAgainstSchema(spec, 'apiDeclaration.json', apiDeclaration, callback2);
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
var Specification = function (version) {
  var that = this;
  var createValidators = function (spec, validatorsMap) {
    return _.reduce(validatorsMap, function (result, schemas, schemaName) {
      result[schemaName] = helpers.createJsonValidator(schemas);

      return result;
    }, {});
  };
  var fixSchemaId = function (schemaName) {
    // Swagger 1.2 schema files use one id but use a different id when referencing schema files.  We also use the schema
    // file name to reference the schema in ZSchema.  To fix this so that the JSON Schema validator works properly, we
    // need to set the id to be the name of the schema file.
    var fixed = _.cloneDeep(that.schemas[schemaName]);

    fixed.id = schemaName;

    return fixed;
  };
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
Specification.prototype.validate = function (rlOrSO, apiDeclarations, callback) {
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

  var that = this;

  // Perform the validation
  validateStructurally(this, rlOrSO, apiDeclarations, function (err, result) {
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
Specification.prototype.composeModel = function (apiDOrSO, modelIdOrRef, callback) {
  var swaggerVersion = helpers.getSwaggerVersion(apiDOrSO);
  var doComposition = function (err, results) {
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
 * @param {*} data - The model to validate
 * @param {resultCallback} callback - The result callback
 *
 * @returns undefined if validation passes or an object containing errors and/or warnings
 *
 * @throws Error if there are validation errors while creating
 */
Specification.prototype.validateModel = function (apiDOrSO, modelIdOrRef, data, callback) {
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

  var that = this;

  this.composeModel(apiDOrSO, modelIdOrRef, function (err, result) {
    if (err) {
      return callback(err);
    }

    validateAgainstSchema(that, result, data, callback);
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
Specification.prototype.resolve = function (document, ptr, callback) {
  var documentMetadata;
  var respond = function (document) {
    if (_.isString(ptr)) {
      return callback(undefined, traverse(document).get(JsonRefs.pathFromPtr(ptr)));
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
  var doConvert = function (resourceListing, apiDeclarations) {
    callback(undefined, swaggerConverter(resourceListing, apiDeclarations));
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

},{"../schemas/1.2/apiDeclaration.json":173,"../schemas/1.2/authorizationObject.json":174,"../schemas/1.2/dataType.json":175,"../schemas/1.2/dataTypeBase.json":176,"../schemas/1.2/infoObject.json":177,"../schemas/1.2/modelsObject.json":178,"../schemas/1.2/oauth2GrantType.json":179,"../schemas/1.2/operationObject.json":180,"../schemas/1.2/parameterObject.json":181,"../schemas/1.2/resourceListing.json":182,"../schemas/1.2/resourceObject.json":183,"../schemas/2.0/schema.json":184,"./helpers":1,"./validators":3,"lodash-compat/array/difference":4,"lodash-compat/array/union":7,"lodash-compat/collection/each":9,"lodash-compat/collection/find":10,"lodash-compat/collection/map":12,"lodash-compat/collection/reduce":13,"lodash-compat/lang/cloneDeep":82,"lodash-compat/lang/isArray":84,"lodash-compat/lang/isFunction":88,"lodash-compat/lang/isPlainObject":93,"lodash-compat/lang/isString":94,"lodash-compat/lang/isUndefined":96,"lodash-compat/object/has":97,"lodash-compat/object/set":101}],3:[function(require,module,exports){
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

// Done this way to make the Browserify build smaller
var _ = {
  cloneDeep: require('lodash-compat/lang/cloneDeep'),
  each: require('lodash-compat/collection/each'),
  isArray: require('lodash-compat/lang/isArray'),
  isBoolean: require('lodash-compat/lang/isBoolean'),
  isDate: require('lodash-compat/lang/isDate'),
  isFinite: require('lodash-compat/lang/isFinite'),
  isNull: require('lodash-compat/lang/isNull'),
  isNumber: require('lodash-compat/lang/isNumber'),
  isPlainObject: require('lodash-compat/lang/isPlainObject'),
  isString: require('lodash-compat/lang/isString'),
  isUndefined: require('lodash-compat/lang/isUndefined'),
  map: require('lodash-compat/collection/map'),
  union: require('lodash-compat/array/union'),
  uniq: require('lodash-compat/array/uniq')
};
var helpers = require('./helpers');
var validator = require('validator');

// http://tools.ietf.org/html/rfc3339#section-5.6
var dateRegExp = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
// http://tools.ietf.org/html/rfc3339#section-5.6
var dateTimeRegExp = /^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}):([0-9]{2}))$/;
var isValidDate = module.exports.isValidDate = function (date) {
  var day;
  var matches;
  var month;

  if (_.isDate(date)) {
    return true;
  }

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
var isValidDateTime = module.exports.isValidDateTime = function (dateTime) {
  var hour;
  var date;
  var time;
  var matches;
  var minute;
  var parts;
  var second;
  var timezoneHours;
  var timezoneMinutes;

  if (_.isDate(dateTime)) {
    return true;
  }

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
  if (matches[5] === 'z') {
    timezoneHours = 0;
    timezoneMinutes = 0;
  } else {
    timezoneHours = Number(matches[6]);
    timezoneMinutes = Number(matches[7]);
  }

  var validTimezoneMinutes = timezoneMinutes === 0 || timezoneMinutes === 15 || timezoneMinutes === 30 || timezoneMinutes === 45;

  if (hour > '23' || minute > '59' || second > '59' || timezoneHours > 14 || timezoneHours < -12 || !validTimezoneMinutes) {
    return false;
  }

  return true;
};

var throwErrorWithCode = function (code, msg) {
  var err = new Error(msg);

  err.code = code;
  err.failedValidation = true;

  throw err;
};

module.exports.validateAgainstSchema = function (schemaOrName, data, validator) {
  var sanitizeError = function (obj) {
    // Make anyOf/oneOf errors more human readable (Issue 200)
    var defType = ['additionalProperties', 'items'].indexOf(obj.path[obj.path.length - 1]) > -1 ?
          'schema' :
          obj.path[obj.path.length - 2];

    if (['ANY_OF_MISSING', 'ONE_OF_MISSING'].indexOf(obj.code) > -1) {
      switch (defType) {
      case 'parameters':
        defType = 'parameter';
        break;

      case 'responses':
        defType = 'response';
        break;

      case 'schema':
        defType += ' ' + obj.path[obj.path.length - 1];

        // no default
      }

      obj.message = 'Not a valid ' + defType + ' definition';
    }

    // Remove the params portion of the error
    delete obj.params;
    delete obj.schemaId;

    if (obj.inner) {
      _.each(obj.inner, function (nObj) {
        sanitizeError(nObj);
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
          sanitizeError(err);

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
var validateArrayType = module.exports.validateArrayType = function (schema) {
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
module.exports.validateContentType = function (gPOrC, oPOrC, reqOrRes) {
  // http://www.w3.org/Protocols/rfc2616/rfc2616-sec7.html#sec7.2.1
  var isResponse = typeof reqOrRes.end === 'function';
  var contentType = isResponse ? reqOrRes.getHeader('content-type') : reqOrRes.headers['content-type'];
  var pOrC = _.map(_.union(gPOrC, oPOrC), function (contentType) {
    return contentType.split(';')[0];
  });

  if (!contentType) {
    if (isResponse) {
      contentType = 'text/plain';
    } else {
      contentType = 'application/octet-stream';
    }
  }

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
var validateEnum = module.exports.validateEnum = function (val, allowed) {
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
var validateMaximum = module.exports.validateMaximum = function (val, maximum, type, exclusive) {
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
var validateMaxItems = module.exports.validateMaxItems = function (val, maxItems) {
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
var validateMaxLength = module.exports.validateMaxLength = function (val, maxLength) {
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
var validateMaxProperties = module.exports.validateMaxProperties = function (val, maxProperties) {
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
var validateMinimum = module.exports.validateMinimum = function (val, minimum, type, exclusive) {
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
var validateMinItems = module.exports.validateMinItems = function (val, minItems) {
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
var validateMinLength = module.exports.validateMinLength = function (val, minLength) {
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
var validateMinProperties = module.exports.validateMinProperties = function (val, minProperties) {
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
var validateMultipleOf = module.exports.validateMultipleOf = function (val, multipleOf) {
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
var validatePattern = module.exports.validatePattern = function (val, pattern) {
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
module.exports.validateRequiredness = function (val, required) {
  if (!_.isUndefined(required) && required === true && _.isUndefined(val)) {
    throwErrorWithCode('REQUIRED', 'Is required');
  }
};

/**
 * Validates the value type and format (when necessary).
 *
 * @param {string} version - The Swagger version
 * @param {*} val - The parameter value
 * @param {string} type - The parameter type
 * @param {string} format - The parameter format
 * @param {boolean} [skipError=false] - Whether or not to skip throwing an error (Useful for validating arrays)
 *
 * @throws Error if the value is not the proper type or format
 */
var validateTypeAndFormat = module.exports.validateTypeAndFormat =
  function validateTypeAndFormat (version, val, type, format, allowEmptyValue, skipError) {
    var result = true;
    var oVal = val;

    // If there is an empty value and we allow empty values, the value is always valid
    if (allowEmptyValue === true && val === '') {
      return;
    }

    if (_.isArray(val)) {
      _.each(val, function (aVal, index) {
        if (!validateTypeAndFormat(version, aVal, type, format, allowEmptyValue, true)) {
          throwErrorWithCode('INVALID_TYPE', 'Value at index ' + index + ' is not a valid ' + type + ': ' + aVal);
        }
      });
    } else {
      switch (type) {
      case 'boolean':
        // Coerce the value only for Swagger 1.2
        if (version === '1.2' && _.isString(val)) {
          if (val === 'false') {
            val = false;
          } else if (val === 'true') {
            val = true;
          }
        }

        result = _.isBoolean(val);
        break;
      case 'integer':
        // Coerce the value only for Swagger 1.2
        if (version === '1.2' && _.isString(val)) {
          val = Number(val);
        }

        result = _.isFinite(val) && (Math.round(val) === val);
        break;
      case 'number':
        // Coerce the value only for Swagger 1.2
        if (version === '1.2' && _.isString(val)) {
          val = Number(val);
        }

        result = _.isFinite(val);
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
          case 'uuid':
            result = validator.isUUID(val);
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
                           'Not a valid ' + (_.isUndefined(format) ? '' : format + ' ') + type + ': ' + oVal :
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
var validateUniqueItems = module.exports.validateUniqueItems = function (val, isUnique) {
  if (!_.isUndefined(isUnique) && _.uniq(val).length !== val.length) {
    throwErrorWithCode('ARRAY_UNIQUE', 'Does not allow duplicate values: ' + val.join(', '));
  }
};

/**
 * Validates the value against the schema.
 *
 * @param {string} version - The Swagger version
 * @param {object} schema - The schema to use to validate things
 * @param {string[]} path - The path to the schema
 * @param {*} [val] - The value to validate or undefined to use the default value provided by the schema
 *
 * @throws Error if any validation failes
 */
var validateSchemaConstraints = module.exports.validateSchemaConstraints = function (version, schema, path, val) {
  var resolveSchema = function (schema) {
    var resolved = schema;

    if (resolved.schema) {
      path = path.concat(['schema']);

      resolved = resolveSchema(resolved.schema);
    }

    return resolved;
  };

  var type = schema.type;
  var allowEmptyValue;

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

  allowEmptyValue = schema ? schema.allowEmptyValue === true : false;

  try {
    // Always perform this check even if there is no value
    if (type === 'array') {
      validateArrayType(schema);
    }

    // Default to default value if necessary
    if (_.isUndefined(val)) {
      val = version === '1.2' ? schema.defaultValue : schema.default;

      path = path.concat([version === '1.2' ? 'defaultValue' : 'default']);
    }

    // If there is no explicit default value, return as all validations will fail
    if (_.isUndefined(val)) {
      return;
    }

    if (type === 'array') {
      _.each(val, function (val, index) {
        try {
          validateSchemaConstraints(version, schema.items || {}, path.concat(index.toString()), val);
        } catch (err) {
          err.message = 'Value at index ' + index + ' ' + (err.code === 'INVALID_TYPE' ? 'is ' : '') +
            err.message.charAt(0).toLowerCase() + err.message.substring(1);

          throw err;
        }
      });
    } else {
      validateTypeAndFormat(version, val, type, schema.format, allowEmptyValue);
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

},{"./helpers":1,"lodash-compat/array/union":7,"lodash-compat/array/uniq":8,"lodash-compat/collection/each":9,"lodash-compat/collection/map":12,"lodash-compat/lang/cloneDeep":82,"lodash-compat/lang/isArray":84,"lodash-compat/lang/isBoolean":85,"lodash-compat/lang/isDate":86,"lodash-compat/lang/isFinite":87,"lodash-compat/lang/isNull":90,"lodash-compat/lang/isNumber":91,"lodash-compat/lang/isPlainObject":93,"lodash-compat/lang/isString":94,"lodash-compat/lang/isUndefined":96,"validator":105}],4:[function(require,module,exports){
var baseDifference = require('../internal/baseDifference'),
    baseFlatten = require('../internal/baseFlatten'),
    isArrayLike = require('../internal/isArrayLike'),
    isObjectLike = require('../internal/isObjectLike'),
    restParam = require('../function/restParam');

/**
 * Creates an array of unique `array` values not included in the other
 * provided arrays using [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons.
 *
 * @static
 * @memberOf _
 * @category Array
 * @param {Array} array The array to inspect.
 * @param {...Array} [values] The arrays of values to exclude.
 * @returns {Array} Returns the new array of filtered values.
 * @example
 *
 * _.difference([1, 2, 3], [4, 2]);
 * // => [1, 3]
 */
var difference = restParam(function(array, values) {
  return (isObjectLike(array) && isArrayLike(array))
    ? baseDifference(array, baseFlatten(values, false, true))
    : [];
});

module.exports = difference;

},{"../function/restParam":14,"../internal/baseDifference":26,"../internal/baseFlatten":30,"../internal/isArrayLike":70,"../internal/isObjectLike":76}],5:[function(require,module,exports){
var baseIndexOf = require('../internal/baseIndexOf'),
    binaryIndex = require('../internal/binaryIndex');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Gets the index at which the first occurrence of `value` is found in `array`
 * using [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons. If `fromIndex` is negative, it's used as the offset
 * from the end of `array`. If `array` is sorted providing `true` for `fromIndex`
 * performs a faster binary search.
 *
 * @static
 * @memberOf _
 * @category Array
 * @param {Array} array The array to search.
 * @param {*} value The value to search for.
 * @param {boolean|number} [fromIndex=0] The index to search from or `true`
 *  to perform a binary search on a sorted array.
 * @returns {number} Returns the index of the matched value, else `-1`.
 * @example
 *
 * _.indexOf([1, 2, 1, 2], 2);
 * // => 1
 *
 * // using `fromIndex`
 * _.indexOf([1, 2, 1, 2], 2, 2);
 * // => 3
 *
 * // performing a binary search
 * _.indexOf([1, 1, 2, 2], 2, true);
 * // => 2
 */
function indexOf(array, value, fromIndex) {
  var length = array ? array.length : 0;
  if (!length) {
    return -1;
  }
  if (typeof fromIndex == 'number') {
    fromIndex = fromIndex < 0 ? nativeMax(length + fromIndex, 0) : fromIndex;
  } else if (fromIndex) {
    var index = binaryIndex(array, value);
    if (index < length &&
        (value === value ? (value === array[index]) : (array[index] !== array[index]))) {
      return index;
    }
    return -1;
  }
  return baseIndexOf(array, value, fromIndex || 0);
}

module.exports = indexOf;

},{"../internal/baseIndexOf":35,"../internal/binaryIndex":48}],6:[function(require,module,exports){
/**
 * Gets the last element of `array`.
 *
 * @static
 * @memberOf _
 * @category Array
 * @param {Array} array The array to query.
 * @returns {*} Returns the last element of `array`.
 * @example
 *
 * _.last([1, 2, 3]);
 * // => 3
 */
function last(array) {
  var length = array ? array.length : 0;
  return length ? array[length - 1] : undefined;
}

module.exports = last;

},{}],7:[function(require,module,exports){
var baseFlatten = require('../internal/baseFlatten'),
    baseUniq = require('../internal/baseUniq'),
    restParam = require('../function/restParam');

/**
 * Creates an array of unique values, in order, from all of the provided arrays
 * using [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons.
 *
 * @static
 * @memberOf _
 * @category Array
 * @param {...Array} [arrays] The arrays to inspect.
 * @returns {Array} Returns the new array of combined values.
 * @example
 *
 * _.union([1, 2], [4, 2], [2, 1]);
 * // => [1, 2, 4]
 */
var union = restParam(function(arrays) {
  return baseUniq(baseFlatten(arrays, false, true));
});

module.exports = union;

},{"../function/restParam":14,"../internal/baseFlatten":30,"../internal/baseUniq":47}],8:[function(require,module,exports){
var baseCallback = require('../internal/baseCallback'),
    baseUniq = require('../internal/baseUniq'),
    isIterateeCall = require('../internal/isIterateeCall'),
    sortedUniq = require('../internal/sortedUniq');

/**
 * Creates a duplicate-free version of an array, using
 * [`SameValueZero`](http://ecma-international.org/ecma-262/6.0/#sec-samevaluezero)
 * for equality comparisons, in which only the first occurence of each element
 * is kept. Providing `true` for `isSorted` performs a faster search algorithm
 * for sorted arrays. If an iteratee function is provided it's invoked for
 * each element in the array to generate the criterion by which uniqueness
 * is computed. The `iteratee` is bound to `thisArg` and invoked with three
 * arguments: (value, index, array).
 *
 * If a property name is provided for `iteratee` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `iteratee` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias unique
 * @category Array
 * @param {Array} array The array to inspect.
 * @param {boolean} [isSorted] Specify the array is sorted.
 * @param {Function|Object|string} [iteratee] The function invoked per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Array} Returns the new duplicate-value-free array.
 * @example
 *
 * _.uniq([2, 1, 2]);
 * // => [2, 1]
 *
 * // using `isSorted`
 * _.uniq([1, 1, 2], true);
 * // => [1, 2]
 *
 * // using an iteratee function
 * _.uniq([1, 2.5, 1.5, 2], function(n) {
 *   return this.floor(n);
 * }, Math);
 * // => [1, 2.5]
 *
 * // using the `_.property` callback shorthand
 * _.uniq([{ 'x': 1 }, { 'x': 2 }, { 'x': 1 }], 'x');
 * // => [{ 'x': 1 }, { 'x': 2 }]
 */
function uniq(array, isSorted, iteratee, thisArg) {
  var length = array ? array.length : 0;
  if (!length) {
    return [];
  }
  if (isSorted != null && typeof isSorted != 'boolean') {
    thisArg = iteratee;
    iteratee = isIterateeCall(array, isSorted, thisArg) ? undefined : isSorted;
    isSorted = false;
  }
  iteratee = iteratee == null ? iteratee : baseCallback(iteratee, thisArg, 3);
  return (isSorted)
    ? sortedUniq(array, iteratee)
    : baseUniq(array, iteratee);
}

module.exports = uniq;

},{"../internal/baseCallback":23,"../internal/baseUniq":47,"../internal/isIterateeCall":73,"../internal/sortedUniq":79}],9:[function(require,module,exports){
module.exports = require('./forEach');

},{"./forEach":11}],10:[function(require,module,exports){
var baseEach = require('../internal/baseEach'),
    createFind = require('../internal/createFind');

/**
 * Iterates over elements of `collection`, returning the first element
 * `predicate` returns truthy for. The predicate is bound to `thisArg` and
 * invoked with three arguments: (value, index|key, collection).
 *
 * If a property name is provided for `predicate` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `predicate` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * @static
 * @memberOf _
 * @alias detect
 * @category Collection
 * @param {Array|Object|string} collection The collection to search.
 * @param {Function|Object|string} [predicate=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `predicate`.
 * @returns {*} Returns the matched element, else `undefined`.
 * @example
 *
 * var users = [
 *   { 'user': 'barney',  'age': 36, 'active': true },
 *   { 'user': 'fred',    'age': 40, 'active': false },
 *   { 'user': 'pebbles', 'age': 1,  'active': true }
 * ];
 *
 * _.result(_.find(users, function(chr) {
 *   return chr.age < 40;
 * }), 'user');
 * // => 'barney'
 *
 * // using the `_.matches` callback shorthand
 * _.result(_.find(users, { 'age': 1, 'active': true }), 'user');
 * // => 'pebbles'
 *
 * // using the `_.matchesProperty` callback shorthand
 * _.result(_.find(users, 'active', false), 'user');
 * // => 'fred'
 *
 * // using the `_.property` callback shorthand
 * _.result(_.find(users, 'active'), 'user');
 * // => 'barney'
 */
var find = createFind(baseEach);

module.exports = find;

},{"../internal/baseEach":27,"../internal/createFind":57}],11:[function(require,module,exports){
var arrayEach = require('../internal/arrayEach'),
    baseEach = require('../internal/baseEach'),
    createForEach = require('../internal/createForEach');

/**
 * Iterates over elements of `collection` invoking `iteratee` for each element.
 * The `iteratee` is bound to `thisArg` and invoked with three arguments:
 * (value, index|key, collection). Iteratee functions may exit iteration early
 * by explicitly returning `false`.
 *
 * **Note:** As with other "Collections" methods, objects with a "length" property
 * are iterated like arrays. To avoid this behavior `_.forIn` or `_.forOwn`
 * may be used for object iteration.
 *
 * @static
 * @memberOf _
 * @alias each
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Array|Object|string} Returns `collection`.
 * @example
 *
 * _([1, 2]).forEach(function(n) {
 *   console.log(n);
 * }).value();
 * // => logs each value from left to right and returns the array
 *
 * _.forEach({ 'a': 1, 'b': 2 }, function(n, key) {
 *   console.log(n, key);
 * });
 * // => logs each value-key pair and returns the object (iteration order is not guaranteed)
 */
var forEach = createForEach(arrayEach, baseEach);

module.exports = forEach;

},{"../internal/arrayEach":17,"../internal/baseEach":27,"../internal/createForEach":58}],12:[function(require,module,exports){
var arrayMap = require('../internal/arrayMap'),
    baseCallback = require('../internal/baseCallback'),
    baseMap = require('../internal/baseMap'),
    isArray = require('../lang/isArray');

/**
 * Creates an array of values by running each element in `collection` through
 * `iteratee`. The `iteratee` is bound to `thisArg` and invoked with three
 * arguments: (value, index|key, collection).
 *
 * If a property name is provided for `iteratee` the created `_.property`
 * style callback returns the property value of the given element.
 *
 * If a value is also provided for `thisArg` the created `_.matchesProperty`
 * style callback returns `true` for elements that have a matching property
 * value, else `false`.
 *
 * If an object is provided for `iteratee` the created `_.matches` style
 * callback returns `true` for elements that have the properties of the given
 * object, else `false`.
 *
 * Many lodash methods are guarded to work as iteratees for methods like
 * `_.every`, `_.filter`, `_.map`, `_.mapValues`, `_.reject`, and `_.some`.
 *
 * The guarded methods are:
 * `ary`, `callback`, `chunk`, `clone`, `create`, `curry`, `curryRight`,
 * `drop`, `dropRight`, `every`, `fill`, `flatten`, `invert`, `max`, `min`,
 * `parseInt`, `slice`, `sortBy`, `take`, `takeRight`, `template`, `trim`,
 * `trimLeft`, `trimRight`, `trunc`, `random`, `range`, `sample`, `some`,
 * `sum`, `uniq`, and `words`
 *
 * @static
 * @memberOf _
 * @alias collect
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [iteratee=_.identity] The function invoked
 *  per iteration.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {Array} Returns the new mapped array.
 * @example
 *
 * function timesThree(n) {
 *   return n * 3;
 * }
 *
 * _.map([1, 2], timesThree);
 * // => [3, 6]
 *
 * _.map({ 'a': 1, 'b': 2 }, timesThree);
 * // => [3, 6] (iteration order is not guaranteed)
 *
 * var users = [
 *   { 'user': 'barney' },
 *   { 'user': 'fred' }
 * ];
 *
 * // using the `_.property` callback shorthand
 * _.map(users, 'user');
 * // => ['barney', 'fred']
 */
function map(collection, iteratee, thisArg) {
  var func = isArray(collection) ? arrayMap : baseMap;
  iteratee = baseCallback(iteratee, thisArg, 3);
  return func(collection, iteratee);
}

module.exports = map;

},{"../internal/arrayMap":18,"../internal/baseCallback":23,"../internal/baseMap":39,"../lang/isArray":84}],13:[function(require,module,exports){
var arrayReduce = require('../internal/arrayReduce'),
    baseEach = require('../internal/baseEach'),
    createReduce = require('../internal/createReduce');

/**
 * Reduces `collection` to a value which is the accumulated result of running
 * each element in `collection` through `iteratee`, where each successive
 * invocation is supplied the return value of the previous. If `accumulator`
 * is not provided the first element of `collection` is used as the initial
 * value. The `iteratee` is bound to `thisArg` and invoked with four arguments:
 * (accumulator, value, index|key, collection).
 *
 * Many lodash methods are guarded to work as iteratees for methods like
 * `_.reduce`, `_.reduceRight`, and `_.transform`.
 *
 * The guarded methods are:
 * `assign`, `defaults`, `defaultsDeep`, `includes`, `merge`, `sortByAll`,
 * and `sortByOrder`
 *
 * @static
 * @memberOf _
 * @alias foldl, inject
 * @category Collection
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @param {*} [accumulator] The initial value.
 * @param {*} [thisArg] The `this` binding of `iteratee`.
 * @returns {*} Returns the accumulated value.
 * @example
 *
 * _.reduce([1, 2], function(total, n) {
 *   return total + n;
 * });
 * // => 3
 *
 * _.reduce({ 'a': 1, 'b': 2 }, function(result, n, key) {
 *   result[key] = n * 3;
 *   return result;
 * }, {});
 * // => { 'a': 3, 'b': 6 } (iteration order is not guaranteed)
 */
var reduce = createReduce(arrayReduce, baseEach);

module.exports = reduce;

},{"../internal/arrayReduce":20,"../internal/baseEach":27,"../internal/createReduce":59}],14:[function(require,module,exports){
/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/* Native method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a function that invokes `func` with the `this` binding of the
 * created function and arguments from `start` and beyond provided as an array.
 *
 * **Note:** This method is based on the [rest parameter](https://developer.mozilla.org/Web/JavaScript/Reference/Functions/rest_parameters).
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to apply a rest parameter to.
 * @param {number} [start=func.length-1] The start position of the rest parameter.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var say = _.restParam(function(what, names) {
 *   return what + ' ' + _.initial(names).join(', ') +
 *     (_.size(names) > 1 ? ', & ' : '') + _.last(names);
 * });
 *
 * say('hello', 'fred', 'barney', 'pebbles');
 * // => 'hello fred, barney, & pebbles'
 */
function restParam(func, start) {
  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  start = nativeMax(start === undefined ? (func.length - 1) : (+start || 0), 0);
  return function() {
    var args = arguments,
        index = -1,
        length = nativeMax(args.length - start, 0),
        rest = Array(length);

    while (++index < length) {
      rest[index] = args[start + index];
    }
    switch (start) {
      case 0: return func.call(this, rest);
      case 1: return func.call(this, args[0], rest);
      case 2: return func.call(this, args[0], args[1], rest);
    }
    var otherArgs = Array(start + 1);
    index = -1;
    while (++index < start) {
      otherArgs[index] = args[index];
    }
    otherArgs[start] = rest;
    return func.apply(this, otherArgs);
  };
}

module.exports = restParam;

},{}],15:[function(require,module,exports){
(function (global){
var cachePush = require('./cachePush'),
    getNative = require('./getNative');

/** Native method references. */
var Set = getNative(global, 'Set');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeCreate = getNative(Object, 'create');

/**
 *
 * Creates a cache object to store unique values.
 *
 * @private
 * @param {Array} [values] The values to cache.
 */
function SetCache(values) {
  var length = values ? values.length : 0;

  this.data = { 'hash': nativeCreate(null), 'set': new Set };
  while (length--) {
    this.push(values[length]);
  }
}

// Add functions to the `Set` cache.
SetCache.prototype.push = cachePush;

module.exports = SetCache;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./cachePush":53,"./getNative":65}],16:[function(require,module,exports){
/**
 * Copies the values of `source` to `array`.
 *
 * @private
 * @param {Array} source The array to copy values from.
 * @param {Array} [array=[]] The array to copy values to.
 * @returns {Array} Returns `array`.
 */
function arrayCopy(source, array) {
  var index = -1,
      length = source.length;

  array || (array = Array(length));
  while (++index < length) {
    array[index] = source[index];
  }
  return array;
}

module.exports = arrayCopy;

},{}],17:[function(require,module,exports){
/**
 * A specialized version of `_.forEach` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns `array`.
 */
function arrayEach(array, iteratee) {
  var index = -1,
      length = array.length;

  while (++index < length) {
    if (iteratee(array[index], index, array) === false) {
      break;
    }
  }
  return array;
}

module.exports = arrayEach;

},{}],18:[function(require,module,exports){
/**
 * A specialized version of `_.map` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function arrayMap(array, iteratee) {
  var index = -1,
      length = array.length,
      result = Array(length);

  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}

module.exports = arrayMap;

},{}],19:[function(require,module,exports){
/**
 * Appends the elements of `values` to `array`.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {Array} values The values to append.
 * @returns {Array} Returns `array`.
 */
function arrayPush(array, values) {
  var index = -1,
      length = values.length,
      offset = array.length;

  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}

module.exports = arrayPush;

},{}],20:[function(require,module,exports){
/**
 * A specialized version of `_.reduce` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {*} [accumulator] The initial value.
 * @param {boolean} [initFromArray] Specify using the first element of `array`
 *  as the initial value.
 * @returns {*} Returns the accumulated value.
 */
function arrayReduce(array, iteratee, accumulator, initFromArray) {
  var index = -1,
      length = array.length;

  if (initFromArray && length) {
    accumulator = array[++index];
  }
  while (++index < length) {
    accumulator = iteratee(accumulator, array[index], index, array);
  }
  return accumulator;
}

module.exports = arrayReduce;

},{}],21:[function(require,module,exports){
/**
 * A specialized version of `_.some` for arrays without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 */
function arraySome(array, predicate) {
  var index = -1,
      length = array.length;

  while (++index < length) {
    if (predicate(array[index], index, array)) {
      return true;
    }
  }
  return false;
}

module.exports = arraySome;

},{}],22:[function(require,module,exports){
var baseCopy = require('./baseCopy'),
    keys = require('../object/keys');

/**
 * The base implementation of `_.assign` without support for argument juggling,
 * multiple sources, and `customizer` functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @returns {Object} Returns `object`.
 */
function baseAssign(object, source) {
  return source == null
    ? object
    : baseCopy(source, keys(source), object);
}

module.exports = baseAssign;

},{"../object/keys":98,"./baseCopy":25}],23:[function(require,module,exports){
var baseMatches = require('./baseMatches'),
    baseMatchesProperty = require('./baseMatchesProperty'),
    bindCallback = require('./bindCallback'),
    identity = require('../utility/identity'),
    property = require('../utility/property');

/**
 * The base implementation of `_.callback` which supports specifying the
 * number of arguments to provide to `func`.
 *
 * @private
 * @param {*} [func=_.identity] The value to convert to a callback.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function baseCallback(func, thisArg, argCount) {
  var type = typeof func;
  if (type == 'function') {
    return thisArg === undefined
      ? func
      : bindCallback(func, thisArg, argCount);
  }
  if (func == null) {
    return identity;
  }
  if (type == 'object') {
    return baseMatches(func);
  }
  return thisArg === undefined
    ? property(func)
    : baseMatchesProperty(func, thisArg);
}

module.exports = baseCallback;

},{"../utility/identity":103,"../utility/property":104,"./baseMatches":40,"./baseMatchesProperty":41,"./bindCallback":50}],24:[function(require,module,exports){
var arrayCopy = require('./arrayCopy'),
    arrayEach = require('./arrayEach'),
    baseAssign = require('./baseAssign'),
    baseForOwn = require('./baseForOwn'),
    initCloneArray = require('./initCloneArray'),
    initCloneByTag = require('./initCloneByTag'),
    initCloneObject = require('./initCloneObject'),
    isArray = require('../lang/isArray'),
    isHostObject = require('./isHostObject'),
    isObject = require('../lang/isObject');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values supported by `_.clone`. */
var cloneableTags = {};
cloneableTags[argsTag] = cloneableTags[arrayTag] =
cloneableTags[arrayBufferTag] = cloneableTags[boolTag] =
cloneableTags[dateTag] = cloneableTags[float32Tag] =
cloneableTags[float64Tag] = cloneableTags[int8Tag] =
cloneableTags[int16Tag] = cloneableTags[int32Tag] =
cloneableTags[numberTag] = cloneableTags[objectTag] =
cloneableTags[regexpTag] = cloneableTags[stringTag] =
cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] =
cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
cloneableTags[errorTag] = cloneableTags[funcTag] =
cloneableTags[mapTag] = cloneableTags[setTag] =
cloneableTags[weakMapTag] = false;

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * The base implementation of `_.clone` without support for argument juggling
 * and `this` binding `customizer` functions.
 *
 * @private
 * @param {*} value The value to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @param {Function} [customizer] The function to customize cloning values.
 * @param {string} [key] The key of `value`.
 * @param {Object} [object] The object `value` belongs to.
 * @param {Array} [stackA=[]] Tracks traversed source objects.
 * @param {Array} [stackB=[]] Associates clones with source counterparts.
 * @returns {*} Returns the cloned value.
 */
function baseClone(value, isDeep, customizer, key, object, stackA, stackB) {
  var result;
  if (customizer) {
    result = object ? customizer(value, key, object) : customizer(value);
  }
  if (result !== undefined) {
    return result;
  }
  if (!isObject(value)) {
    return value;
  }
  var isArr = isArray(value);
  if (isArr) {
    result = initCloneArray(value);
    if (!isDeep) {
      return arrayCopy(value, result);
    }
  } else {
    var tag = objToString.call(value),
        isFunc = tag == funcTag;

    if (tag == objectTag || tag == argsTag || (isFunc && !object)) {
      if (isHostObject(value)) {
        return object ? value : {};
      }
      result = initCloneObject(isFunc ? {} : value);
      if (!isDeep) {
        return baseAssign(result, value);
      }
    } else {
      return cloneableTags[tag]
        ? initCloneByTag(value, tag, isDeep)
        : (object ? value : {});
    }
  }
  // Check for circular references and return its corresponding clone.
  stackA || (stackA = []);
  stackB || (stackB = []);

  var length = stackA.length;
  while (length--) {
    if (stackA[length] == value) {
      return stackB[length];
    }
  }
  // Add the source value to the stack of traversed objects and associate it with its clone.
  stackA.push(value);
  stackB.push(result);

  // Recursively populate clone (susceptible to call stack limits).
  (isArr ? arrayEach : baseForOwn)(value, function(subValue, key) {
    result[key] = baseClone(subValue, isDeep, customizer, key, value, stackA, stackB);
  });
  return result;
}

module.exports = baseClone;

},{"../lang/isArray":84,"../lang/isObject":92,"./arrayCopy":16,"./arrayEach":17,"./baseAssign":22,"./baseForOwn":33,"./initCloneArray":67,"./initCloneByTag":68,"./initCloneObject":69,"./isHostObject":71}],25:[function(require,module,exports){
/**
 * Copies properties of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy properties from.
 * @param {Array} props The property names to copy.
 * @param {Object} [object={}] The object to copy properties to.
 * @returns {Object} Returns `object`.
 */
function baseCopy(source, props, object) {
  object || (object = {});

  var index = -1,
      length = props.length;

  while (++index < length) {
    var key = props[index];
    object[key] = source[key];
  }
  return object;
}

module.exports = baseCopy;

},{}],26:[function(require,module,exports){
var baseIndexOf = require('./baseIndexOf'),
    cacheIndexOf = require('./cacheIndexOf'),
    createCache = require('./createCache');

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/**
 * The base implementation of `_.difference` which accepts a single array
 * of values to exclude.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Array} values The values to exclude.
 * @returns {Array} Returns the new array of filtered values.
 */
function baseDifference(array, values) {
  var length = array ? array.length : 0,
      result = [];

  if (!length) {
    return result;
  }
  var index = -1,
      indexOf = baseIndexOf,
      isCommon = true,
      cache = (isCommon && values.length >= LARGE_ARRAY_SIZE) ? createCache(values) : null,
      valuesLength = values.length;

  if (cache) {
    indexOf = cacheIndexOf;
    isCommon = false;
    values = cache;
  }
  outer:
  while (++index < length) {
    var value = array[index];

    if (isCommon && value === value) {
      var valuesIndex = valuesLength;
      while (valuesIndex--) {
        if (values[valuesIndex] === value) {
          continue outer;
        }
      }
      result.push(value);
    }
    else if (indexOf(values, value, 0) < 0) {
      result.push(value);
    }
  }
  return result;
}

module.exports = baseDifference;

},{"./baseIndexOf":35,"./cacheIndexOf":52,"./createCache":56}],27:[function(require,module,exports){
var baseForOwn = require('./baseForOwn'),
    createBaseEach = require('./createBaseEach');

/**
 * The base implementation of `_.forEach` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array|Object|string} Returns `collection`.
 */
var baseEach = createBaseEach(baseForOwn);

module.exports = baseEach;

},{"./baseForOwn":33,"./createBaseEach":54}],28:[function(require,module,exports){
/**
 * The base implementation of `_.find`, `_.findLast`, `_.findKey`, and `_.findLastKey`,
 * without support for callback shorthands and `this` binding, which iterates
 * over `collection` using the provided `eachFunc`.
 *
 * @private
 * @param {Array|Object|string} collection The collection to search.
 * @param {Function} predicate The function invoked per iteration.
 * @param {Function} eachFunc The function to iterate over `collection`.
 * @param {boolean} [retKey] Specify returning the key of the found element
 *  instead of the element itself.
 * @returns {*} Returns the found element or its key, else `undefined`.
 */
function baseFind(collection, predicate, eachFunc, retKey) {
  var result;
  eachFunc(collection, function(value, key, collection) {
    if (predicate(value, key, collection)) {
      result = retKey ? key : value;
      return false;
    }
  });
  return result;
}

module.exports = baseFind;

},{}],29:[function(require,module,exports){
/**
 * The base implementation of `_.findIndex` and `_.findLastIndex` without
 * support for callback shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {Function} predicate The function invoked per iteration.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseFindIndex(array, predicate, fromRight) {
  var length = array.length,
      index = fromRight ? length : -1;

  while ((fromRight ? index-- : ++index < length)) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}

module.exports = baseFindIndex;

},{}],30:[function(require,module,exports){
var arrayPush = require('./arrayPush'),
    isArguments = require('../lang/isArguments'),
    isArray = require('../lang/isArray'),
    isArrayLike = require('./isArrayLike'),
    isObjectLike = require('./isObjectLike');

/**
 * The base implementation of `_.flatten` with added support for restricting
 * flattening and specifying the start index.
 *
 * @private
 * @param {Array} array The array to flatten.
 * @param {boolean} [isDeep] Specify a deep flatten.
 * @param {boolean} [isStrict] Restrict flattening to arrays-like objects.
 * @param {Array} [result=[]] The initial result value.
 * @returns {Array} Returns the new flattened array.
 */
function baseFlatten(array, isDeep, isStrict, result) {
  result || (result = []);

  var index = -1,
      length = array.length;

  while (++index < length) {
    var value = array[index];
    if (isObjectLike(value) && isArrayLike(value) &&
        (isStrict || isArray(value) || isArguments(value))) {
      if (isDeep) {
        // Recursively flatten arrays (susceptible to call stack limits).
        baseFlatten(value, isDeep, isStrict, result);
      } else {
        arrayPush(result, value);
      }
    } else if (!isStrict) {
      result[result.length] = value;
    }
  }
  return result;
}

module.exports = baseFlatten;

},{"../lang/isArguments":83,"../lang/isArray":84,"./arrayPush":19,"./isArrayLike":70,"./isObjectLike":76}],31:[function(require,module,exports){
var createBaseFor = require('./createBaseFor');

/**
 * The base implementation of `baseForIn` and `baseForOwn` which iterates
 * over `object` properties returned by `keysFunc` invoking `iteratee` for
 * each property. Iteratee functions may exit iteration early by explicitly
 * returning `false`.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @returns {Object} Returns `object`.
 */
var baseFor = createBaseFor();

module.exports = baseFor;

},{"./createBaseFor":55}],32:[function(require,module,exports){
var baseFor = require('./baseFor'),
    keysIn = require('../object/keysIn');

/**
 * The base implementation of `_.forIn` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Object} Returns `object`.
 */
function baseForIn(object, iteratee) {
  return baseFor(object, iteratee, keysIn);
}

module.exports = baseForIn;

},{"../object/keysIn":99,"./baseFor":31}],33:[function(require,module,exports){
var baseFor = require('./baseFor'),
    keys = require('../object/keys');

/**
 * The base implementation of `_.forOwn` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Object} Returns `object`.
 */
function baseForOwn(object, iteratee) {
  return baseFor(object, iteratee, keys);
}

module.exports = baseForOwn;

},{"../object/keys":98,"./baseFor":31}],34:[function(require,module,exports){
var toObject = require('./toObject');

/**
 * The base implementation of `get` without support for string paths
 * and default values.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array} path The path of the property to get.
 * @param {string} [pathKey] The key representation of path.
 * @returns {*} Returns the resolved value.
 */
function baseGet(object, path, pathKey) {
  if (object == null) {
    return;
  }
  object = toObject(object);
  if (pathKey !== undefined && pathKey in object) {
    path = [pathKey];
  }
  var index = 0,
      length = path.length;

  while (object != null && index < length) {
    object = toObject(object)[path[index++]];
  }
  return (index && index == length) ? object : undefined;
}

module.exports = baseGet;

},{"./toObject":80}],35:[function(require,module,exports){
var indexOfNaN = require('./indexOfNaN');

/**
 * The base implementation of `_.indexOf` without support for binary searches.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {*} value The value to search for.
 * @param {number} fromIndex The index to search from.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseIndexOf(array, value, fromIndex) {
  if (value !== value) {
    return indexOfNaN(array, fromIndex);
  }
  var index = fromIndex - 1,
      length = array.length;

  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

module.exports = baseIndexOf;

},{"./indexOfNaN":66}],36:[function(require,module,exports){
var baseIsEqualDeep = require('./baseIsEqualDeep'),
    isObject = require('../lang/isObject'),
    isObjectLike = require('./isObjectLike');

/**
 * The base implementation of `_.isEqual` without support for `this` binding
 * `customizer` functions.
 *
 * @private
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 */
function baseIsEqual(value, other, customizer, isLoose, stackA, stackB) {
  if (value === other) {
    return true;
  }
  if (value == null || other == null || (!isObject(value) && !isObjectLike(other))) {
    return value !== value && other !== other;
  }
  return baseIsEqualDeep(value, other, baseIsEqual, customizer, isLoose, stackA, stackB);
}

module.exports = baseIsEqual;

},{"../lang/isObject":92,"./baseIsEqualDeep":37,"./isObjectLike":76}],37:[function(require,module,exports){
var equalArrays = require('./equalArrays'),
    equalByTag = require('./equalByTag'),
    equalObjects = require('./equalObjects'),
    isArray = require('../lang/isArray'),
    isHostObject = require('./isHostObject'),
    isTypedArray = require('../lang/isTypedArray');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    objectTag = '[object Object]';

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * A specialized version of `baseIsEqual` for arrays and objects which performs
 * deep comparisons and tracks traversed objects enabling objects with circular
 * references to be compared.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA=[]] Tracks traversed `value` objects.
 * @param {Array} [stackB=[]] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function baseIsEqualDeep(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var objIsArr = isArray(object),
      othIsArr = isArray(other),
      objTag = arrayTag,
      othTag = arrayTag;

  if (!objIsArr) {
    objTag = objToString.call(object);
    if (objTag == argsTag) {
      objTag = objectTag;
    } else if (objTag != objectTag) {
      objIsArr = isTypedArray(object);
    }
  }
  if (!othIsArr) {
    othTag = objToString.call(other);
    if (othTag == argsTag) {
      othTag = objectTag;
    } else if (othTag != objectTag) {
      othIsArr = isTypedArray(other);
    }
  }
  var objIsObj = objTag == objectTag && !isHostObject(object),
      othIsObj = othTag == objectTag && !isHostObject(other),
      isSameTag = objTag == othTag;

  if (isSameTag && !(objIsArr || objIsObj)) {
    return equalByTag(object, other, objTag);
  }
  if (!isLoose) {
    var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
        othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

    if (objIsWrapped || othIsWrapped) {
      return equalFunc(objIsWrapped ? object.value() : object, othIsWrapped ? other.value() : other, customizer, isLoose, stackA, stackB);
    }
  }
  if (!isSameTag) {
    return false;
  }
  // Assume cyclic values are equal.
  // For more information on detecting circular references see https://es5.github.io/#JO.
  stackA || (stackA = []);
  stackB || (stackB = []);

  var length = stackA.length;
  while (length--) {
    if (stackA[length] == object) {
      return stackB[length] == other;
    }
  }
  // Add `object` and `other` to the stack of traversed objects.
  stackA.push(object);
  stackB.push(other);

  var result = (objIsArr ? equalArrays : equalObjects)(object, other, equalFunc, customizer, isLoose, stackA, stackB);

  stackA.pop();
  stackB.pop();

  return result;
}

module.exports = baseIsEqualDeep;

},{"../lang/isArray":84,"../lang/isTypedArray":95,"./equalArrays":60,"./equalByTag":61,"./equalObjects":62,"./isHostObject":71}],38:[function(require,module,exports){
var baseIsEqual = require('./baseIsEqual'),
    toObject = require('./toObject');

/**
 * The base implementation of `_.isMatch` without support for callback
 * shorthands and `this` binding.
 *
 * @private
 * @param {Object} object The object to inspect.
 * @param {Array} matchData The propery names, values, and compare flags to match.
 * @param {Function} [customizer] The function to customize comparing objects.
 * @returns {boolean} Returns `true` if `object` is a match, else `false`.
 */
function baseIsMatch(object, matchData, customizer) {
  var index = matchData.length,
      length = index,
      noCustomizer = !customizer;

  if (object == null) {
    return !length;
  }
  object = toObject(object);
  while (index--) {
    var data = matchData[index];
    if ((noCustomizer && data[2])
          ? data[1] !== object[data[0]]
          : !(data[0] in object)
        ) {
      return false;
    }
  }
  while (++index < length) {
    data = matchData[index];
    var key = data[0],
        objValue = object[key],
        srcValue = data[1];

    if (noCustomizer && data[2]) {
      if (objValue === undefined && !(key in object)) {
        return false;
      }
    } else {
      var result = customizer ? customizer(objValue, srcValue, key) : undefined;
      if (!(result === undefined ? baseIsEqual(srcValue, objValue, customizer, true) : result)) {
        return false;
      }
    }
  }
  return true;
}

module.exports = baseIsMatch;

},{"./baseIsEqual":36,"./toObject":80}],39:[function(require,module,exports){
var baseEach = require('./baseEach'),
    isArrayLike = require('./isArrayLike');

/**
 * The base implementation of `_.map` without support for callback shorthands
 * and `this` binding.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */
function baseMap(collection, iteratee) {
  var index = -1,
      result = isArrayLike(collection) ? Array(collection.length) : [];

  baseEach(collection, function(value, key, collection) {
    result[++index] = iteratee(value, key, collection);
  });
  return result;
}

module.exports = baseMap;

},{"./baseEach":27,"./isArrayLike":70}],40:[function(require,module,exports){
var baseIsMatch = require('./baseIsMatch'),
    getMatchData = require('./getMatchData'),
    toObject = require('./toObject');

/**
 * The base implementation of `_.matches` which does not clone `source`.
 *
 * @private
 * @param {Object} source The object of property values to match.
 * @returns {Function} Returns the new function.
 */
function baseMatches(source) {
  var matchData = getMatchData(source);
  if (matchData.length == 1 && matchData[0][2]) {
    var key = matchData[0][0],
        value = matchData[0][1];

    return function(object) {
      if (object == null) {
        return false;
      }
      object = toObject(object);
      return object[key] === value && (value !== undefined || (key in object));
    };
  }
  return function(object) {
    return baseIsMatch(object, matchData);
  };
}

module.exports = baseMatches;

},{"./baseIsMatch":38,"./getMatchData":64,"./toObject":80}],41:[function(require,module,exports){
var baseGet = require('./baseGet'),
    baseIsEqual = require('./baseIsEqual'),
    baseSlice = require('./baseSlice'),
    isArray = require('../lang/isArray'),
    isKey = require('./isKey'),
    isStrictComparable = require('./isStrictComparable'),
    last = require('../array/last'),
    toObject = require('./toObject'),
    toPath = require('./toPath');

/**
 * The base implementation of `_.matchesProperty` which does not clone `srcValue`.
 *
 * @private
 * @param {string} path The path of the property to get.
 * @param {*} srcValue The value to compare.
 * @returns {Function} Returns the new function.
 */
function baseMatchesProperty(path, srcValue) {
  var isArr = isArray(path),
      isCommon = isKey(path) && isStrictComparable(srcValue),
      pathKey = (path + '');

  path = toPath(path);
  return function(object) {
    if (object == null) {
      return false;
    }
    var key = pathKey;
    object = toObject(object);
    if ((isArr || !isCommon) && !(key in object)) {
      object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
      if (object == null) {
        return false;
      }
      key = last(path);
      object = toObject(object);
    }
    return object[key] === srcValue
      ? (srcValue !== undefined || (key in object))
      : baseIsEqual(srcValue, object[key], undefined, true);
  };
}

module.exports = baseMatchesProperty;

},{"../array/last":6,"../lang/isArray":84,"./baseGet":34,"./baseIsEqual":36,"./baseSlice":45,"./isKey":74,"./isStrictComparable":77,"./toObject":80,"./toPath":81}],42:[function(require,module,exports){
var toObject = require('./toObject');

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : toObject(object)[key];
  };
}

module.exports = baseProperty;

},{"./toObject":80}],43:[function(require,module,exports){
var baseGet = require('./baseGet'),
    toPath = require('./toPath');

/**
 * A specialized version of `baseProperty` which supports deep paths.
 *
 * @private
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new function.
 */
function basePropertyDeep(path) {
  var pathKey = (path + '');
  path = toPath(path);
  return function(object) {
    return baseGet(object, path, pathKey);
  };
}

module.exports = basePropertyDeep;

},{"./baseGet":34,"./toPath":81}],44:[function(require,module,exports){
/**
 * The base implementation of `_.reduce` and `_.reduceRight` without support
 * for callback shorthands and `this` binding, which iterates over `collection`
 * using the provided `eachFunc`.
 *
 * @private
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {*} accumulator The initial value.
 * @param {boolean} initFromCollection Specify using the first or last element
 *  of `collection` as the initial value.
 * @param {Function} eachFunc The function to iterate over `collection`.
 * @returns {*} Returns the accumulated value.
 */
function baseReduce(collection, iteratee, accumulator, initFromCollection, eachFunc) {
  eachFunc(collection, function(value, index, collection) {
    accumulator = initFromCollection
      ? (initFromCollection = false, value)
      : iteratee(accumulator, value, index, collection);
  });
  return accumulator;
}

module.exports = baseReduce;

},{}],45:[function(require,module,exports){
/**
 * The base implementation of `_.slice` without an iteratee call guard.
 *
 * @private
 * @param {Array} array The array to slice.
 * @param {number} [start=0] The start position.
 * @param {number} [end=array.length] The end position.
 * @returns {Array} Returns the slice of `array`.
 */
function baseSlice(array, start, end) {
  var index = -1,
      length = array.length;

  start = start == null ? 0 : (+start || 0);
  if (start < 0) {
    start = -start > length ? 0 : (length + start);
  }
  end = (end === undefined || end > length) ? length : (+end || 0);
  if (end < 0) {
    end += length;
  }
  length = start > end ? 0 : ((end - start) >>> 0);
  start >>>= 0;

  var result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

module.exports = baseSlice;

},{}],46:[function(require,module,exports){
/**
 * Converts `value` to a string if it's not one. An empty string is returned
 * for `null` or `undefined` values.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  return value == null ? '' : (value + '');
}

module.exports = baseToString;

},{}],47:[function(require,module,exports){
var baseIndexOf = require('./baseIndexOf'),
    cacheIndexOf = require('./cacheIndexOf'),
    createCache = require('./createCache');

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/**
 * The base implementation of `_.uniq` without support for callback shorthands
 * and `this` binding.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Function} [iteratee] The function invoked per iteration.
 * @returns {Array} Returns the new duplicate free array.
 */
function baseUniq(array, iteratee) {
  var index = -1,
      indexOf = baseIndexOf,
      length = array.length,
      isCommon = true,
      isLarge = isCommon && length >= LARGE_ARRAY_SIZE,
      seen = isLarge ? createCache() : null,
      result = [];

  if (seen) {
    indexOf = cacheIndexOf;
    isCommon = false;
  } else {
    isLarge = false;
    seen = iteratee ? [] : result;
  }
  outer:
  while (++index < length) {
    var value = array[index],
        computed = iteratee ? iteratee(value, index, array) : value;

    if (isCommon && value === value) {
      var seenIndex = seen.length;
      while (seenIndex--) {
        if (seen[seenIndex] === computed) {
          continue outer;
        }
      }
      if (iteratee) {
        seen.push(computed);
      }
      result.push(value);
    }
    else if (indexOf(seen, computed, 0) < 0) {
      if (iteratee || isLarge) {
        seen.push(computed);
      }
      result.push(value);
    }
  }
  return result;
}

module.exports = baseUniq;

},{"./baseIndexOf":35,"./cacheIndexOf":52,"./createCache":56}],48:[function(require,module,exports){
var binaryIndexBy = require('./binaryIndexBy'),
    identity = require('../utility/identity');

/** Used as references for the maximum length and index of an array. */
var MAX_ARRAY_LENGTH = 4294967295,
    HALF_MAX_ARRAY_LENGTH = MAX_ARRAY_LENGTH >>> 1;

/**
 * Performs a binary search of `array` to determine the index at which `value`
 * should be inserted into `array` in order to maintain its sort order.
 *
 * @private
 * @param {Array} array The sorted array to inspect.
 * @param {*} value The value to evaluate.
 * @param {boolean} [retHighest] Specify returning the highest qualified index.
 * @returns {number} Returns the index at which `value` should be inserted
 *  into `array`.
 */
function binaryIndex(array, value, retHighest) {
  var low = 0,
      high = array ? array.length : low;

  if (typeof value == 'number' && value === value && high <= HALF_MAX_ARRAY_LENGTH) {
    while (low < high) {
      var mid = (low + high) >>> 1,
          computed = array[mid];

      if ((retHighest ? (computed <= value) : (computed < value)) && computed !== null) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return high;
  }
  return binaryIndexBy(array, value, identity, retHighest);
}

module.exports = binaryIndex;

},{"../utility/identity":103,"./binaryIndexBy":49}],49:[function(require,module,exports){
/* Native method references for those with the same name as other `lodash` methods. */
var nativeFloor = Math.floor,
    nativeMin = Math.min;

/** Used as references for the maximum length and index of an array. */
var MAX_ARRAY_LENGTH = 4294967295,
    MAX_ARRAY_INDEX = MAX_ARRAY_LENGTH - 1;

/**
 * This function is like `binaryIndex` except that it invokes `iteratee` for
 * `value` and each element of `array` to compute their sort ranking. The
 * iteratee is invoked with one argument; (value).
 *
 * @private
 * @param {Array} array The sorted array to inspect.
 * @param {*} value The value to evaluate.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {boolean} [retHighest] Specify returning the highest qualified index.
 * @returns {number} Returns the index at which `value` should be inserted
 *  into `array`.
 */
function binaryIndexBy(array, value, iteratee, retHighest) {
  value = iteratee(value);

  var low = 0,
      high = array ? array.length : 0,
      valIsNaN = value !== value,
      valIsNull = value === null,
      valIsUndef = value === undefined;

  while (low < high) {
    var mid = nativeFloor((low + high) / 2),
        computed = iteratee(array[mid]),
        isDef = computed !== undefined,
        isReflexive = computed === computed;

    if (valIsNaN) {
      var setLow = isReflexive || retHighest;
    } else if (valIsNull) {
      setLow = isReflexive && isDef && (retHighest || computed != null);
    } else if (valIsUndef) {
      setLow = isReflexive && (retHighest || isDef);
    } else if (computed == null) {
      setLow = false;
    } else {
      setLow = retHighest ? (computed <= value) : (computed < value);
    }
    if (setLow) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return nativeMin(high, MAX_ARRAY_INDEX);
}

module.exports = binaryIndexBy;

},{}],50:[function(require,module,exports){
var identity = require('../utility/identity');

/**
 * A specialized version of `baseCallback` which only supports `this` binding
 * and specifying the number of arguments to provide to `func`.
 *
 * @private
 * @param {Function} func The function to bind.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {number} [argCount] The number of arguments to provide to `func`.
 * @returns {Function} Returns the callback.
 */
function bindCallback(func, thisArg, argCount) {
  if (typeof func != 'function') {
    return identity;
  }
  if (thisArg === undefined) {
    return func;
  }
  switch (argCount) {
    case 1: return function(value) {
      return func.call(thisArg, value);
    };
    case 3: return function(value, index, collection) {
      return func.call(thisArg, value, index, collection);
    };
    case 4: return function(accumulator, value, index, collection) {
      return func.call(thisArg, accumulator, value, index, collection);
    };
    case 5: return function(value, other, key, object, source) {
      return func.call(thisArg, value, other, key, object, source);
    };
  }
  return function() {
    return func.apply(thisArg, arguments);
  };
}

module.exports = bindCallback;

},{"../utility/identity":103}],51:[function(require,module,exports){
(function (global){
/** Native method references. */
var ArrayBuffer = global.ArrayBuffer,
    Uint8Array = global.Uint8Array;

/**
 * Creates a clone of the given array buffer.
 *
 * @private
 * @param {ArrayBuffer} buffer The array buffer to clone.
 * @returns {ArrayBuffer} Returns the cloned array buffer.
 */
function bufferClone(buffer) {
  var result = new ArrayBuffer(buffer.byteLength),
      view = new Uint8Array(result);

  view.set(new Uint8Array(buffer));
  return result;
}

module.exports = bufferClone;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],52:[function(require,module,exports){
var isObject = require('../lang/isObject');

/**
 * Checks if `value` is in `cache` mimicking the return signature of
 * `_.indexOf` by returning `0` if the value is found, else `-1`.
 *
 * @private
 * @param {Object} cache The cache to search.
 * @param {*} value The value to search for.
 * @returns {number} Returns `0` if `value` is found, else `-1`.
 */
function cacheIndexOf(cache, value) {
  var data = cache.data,
      result = (typeof value == 'string' || isObject(value)) ? data.set.has(value) : data.hash[value];

  return result ? 0 : -1;
}

module.exports = cacheIndexOf;

},{"../lang/isObject":92}],53:[function(require,module,exports){
var isObject = require('../lang/isObject');

/**
 * Adds `value` to the cache.
 *
 * @private
 * @name push
 * @memberOf SetCache
 * @param {*} value The value to cache.
 */
function cachePush(value) {
  var data = this.data;
  if (typeof value == 'string' || isObject(value)) {
    data.set.add(value);
  } else {
    data.hash[value] = true;
  }
}

module.exports = cachePush;

},{"../lang/isObject":92}],54:[function(require,module,exports){
var getLength = require('./getLength'),
    isLength = require('./isLength'),
    toObject = require('./toObject');

/**
 * Creates a `baseEach` or `baseEachRight` function.
 *
 * @private
 * @param {Function} eachFunc The function to iterate over a collection.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */
function createBaseEach(eachFunc, fromRight) {
  return function(collection, iteratee) {
    var length = collection ? getLength(collection) : 0;
    if (!isLength(length)) {
      return eachFunc(collection, iteratee);
    }
    var index = fromRight ? length : -1,
        iterable = toObject(collection);

    while ((fromRight ? index-- : ++index < length)) {
      if (iteratee(iterable[index], index, iterable) === false) {
        break;
      }
    }
    return collection;
  };
}

module.exports = createBaseEach;

},{"./getLength":63,"./isLength":75,"./toObject":80}],55:[function(require,module,exports){
var toObject = require('./toObject');

/**
 * Creates a base function for `_.forIn` or `_.forInRight`.
 *
 * @private
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */
function createBaseFor(fromRight) {
  return function(object, iteratee, keysFunc) {
    var iterable = toObject(object),
        props = keysFunc(object),
        length = props.length,
        index = fromRight ? length : -1;

    while ((fromRight ? index-- : ++index < length)) {
      var key = props[index];
      if (iteratee(iterable[key], key, iterable) === false) {
        break;
      }
    }
    return object;
  };
}

module.exports = createBaseFor;

},{"./toObject":80}],56:[function(require,module,exports){
(function (global){
var SetCache = require('./SetCache'),
    getNative = require('./getNative');

/** Native method references. */
var Set = getNative(global, 'Set');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeCreate = getNative(Object, 'create');

/**
 * Creates a `Set` cache object to optimize linear searches of large arrays.
 *
 * @private
 * @param {Array} [values] The values to cache.
 * @returns {null|Object} Returns the new cache object if `Set` is supported, else `null`.
 */
function createCache(values) {
  return (nativeCreate && Set) ? new SetCache(values) : null;
}

module.exports = createCache;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./SetCache":15,"./getNative":65}],57:[function(require,module,exports){
var baseCallback = require('./baseCallback'),
    baseFind = require('./baseFind'),
    baseFindIndex = require('./baseFindIndex'),
    isArray = require('../lang/isArray');

/**
 * Creates a `_.find` or `_.findLast` function.
 *
 * @private
 * @param {Function} eachFunc The function to iterate over a collection.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new find function.
 */
function createFind(eachFunc, fromRight) {
  return function(collection, predicate, thisArg) {
    predicate = baseCallback(predicate, thisArg, 3);
    if (isArray(collection)) {
      var index = baseFindIndex(collection, predicate, fromRight);
      return index > -1 ? collection[index] : undefined;
    }
    return baseFind(collection, predicate, eachFunc);
  };
}

module.exports = createFind;

},{"../lang/isArray":84,"./baseCallback":23,"./baseFind":28,"./baseFindIndex":29}],58:[function(require,module,exports){
var bindCallback = require('./bindCallback'),
    isArray = require('../lang/isArray');

/**
 * Creates a function for `_.forEach` or `_.forEachRight`.
 *
 * @private
 * @param {Function} arrayFunc The function to iterate over an array.
 * @param {Function} eachFunc The function to iterate over a collection.
 * @returns {Function} Returns the new each function.
 */
function createForEach(arrayFunc, eachFunc) {
  return function(collection, iteratee, thisArg) {
    return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection))
      ? arrayFunc(collection, iteratee)
      : eachFunc(collection, bindCallback(iteratee, thisArg, 3));
  };
}

module.exports = createForEach;

},{"../lang/isArray":84,"./bindCallback":50}],59:[function(require,module,exports){
var baseCallback = require('./baseCallback'),
    baseReduce = require('./baseReduce'),
    isArray = require('../lang/isArray');

/**
 * Creates a function for `_.reduce` or `_.reduceRight`.
 *
 * @private
 * @param {Function} arrayFunc The function to iterate over an array.
 * @param {Function} eachFunc The function to iterate over a collection.
 * @returns {Function} Returns the new each function.
 */
function createReduce(arrayFunc, eachFunc) {
  return function(collection, iteratee, accumulator, thisArg) {
    var initFromArray = arguments.length < 3;
    return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection))
      ? arrayFunc(collection, iteratee, accumulator, initFromArray)
      : baseReduce(collection, baseCallback(iteratee, thisArg, 4), accumulator, initFromArray, eachFunc);
  };
}

module.exports = createReduce;

},{"../lang/isArray":84,"./baseCallback":23,"./baseReduce":44}],60:[function(require,module,exports){
var arraySome = require('./arraySome');

/**
 * A specialized version of `baseIsEqualDeep` for arrays with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Array} array The array to compare.
 * @param {Array} other The other array to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing arrays.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
 */
function equalArrays(array, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var index = -1,
      arrLength = array.length,
      othLength = other.length;

  if (arrLength != othLength && !(isLoose && othLength > arrLength)) {
    return false;
  }
  // Ignore non-index properties.
  while (++index < arrLength) {
    var arrValue = array[index],
        othValue = other[index],
        result = customizer ? customizer(isLoose ? othValue : arrValue, isLoose ? arrValue : othValue, index) : undefined;

    if (result !== undefined) {
      if (result) {
        continue;
      }
      return false;
    }
    // Recursively compare arrays (susceptible to call stack limits).
    if (isLoose) {
      if (!arraySome(other, function(othValue) {
            return arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB);
          })) {
        return false;
      }
    } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB))) {
      return false;
    }
  }
  return true;
}

module.exports = equalArrays;

},{"./arraySome":21}],61:[function(require,module,exports){
/** `Object#toString` result references. */
var boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    numberTag = '[object Number]',
    regexpTag = '[object RegExp]',
    stringTag = '[object String]';

/**
 * A specialized version of `baseIsEqualDeep` for comparing objects of
 * the same `toStringTag`.
 *
 * **Note:** This function only supports comparing values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {string} tag The `toStringTag` of the objects to compare.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalByTag(object, other, tag) {
  switch (tag) {
    case boolTag:
    case dateTag:
      // Coerce dates and booleans to numbers, dates to milliseconds and booleans
      // to `1` or `0` treating invalid dates coerced to `NaN` as not equal.
      return +object == +other;

    case errorTag:
      return object.name == other.name && object.message == other.message;

    case numberTag:
      // Treat `NaN` vs. `NaN` as equal.
      return (object != +object)
        ? other != +other
        : object == +other;

    case regexpTag:
    case stringTag:
      // Coerce regexes to strings and treat strings primitives and string
      // objects as equal. See https://es5.github.io/#x15.10.6.4 for more details.
      return object == (other + '');
  }
  return false;
}

module.exports = equalByTag;

},{}],62:[function(require,module,exports){
var keys = require('../object/keys');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A specialized version of `baseIsEqualDeep` for objects with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Function} [customizer] The function to customize comparing values.
 * @param {boolean} [isLoose] Specify performing partial comparisons.
 * @param {Array} [stackA] Tracks traversed `value` objects.
 * @param {Array} [stackB] Tracks traversed `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalObjects(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
  var objProps = keys(object),
      objLength = objProps.length,
      othProps = keys(other),
      othLength = othProps.length;

  if (objLength != othLength && !isLoose) {
    return false;
  }
  var index = objLength;
  while (index--) {
    var key = objProps[index];
    if (!(isLoose ? key in other : hasOwnProperty.call(other, key))) {
      return false;
    }
  }
  var skipCtor = isLoose;
  while (++index < objLength) {
    key = objProps[index];
    var objValue = object[key],
        othValue = other[key],
        result = customizer ? customizer(isLoose ? othValue : objValue, isLoose? objValue : othValue, key) : undefined;

    // Recursively compare objects (susceptible to call stack limits).
    if (!(result === undefined ? equalFunc(objValue, othValue, customizer, isLoose, stackA, stackB) : result)) {
      return false;
    }
    skipCtor || (skipCtor = key == 'constructor');
  }
  if (!skipCtor) {
    var objCtor = object.constructor,
        othCtor = other.constructor;

    // Non `Object` object instances with different constructors are not equal.
    if (objCtor != othCtor &&
        ('constructor' in object && 'constructor' in other) &&
        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
      return false;
    }
  }
  return true;
}

module.exports = equalObjects;

},{"../object/keys":98}],63:[function(require,module,exports){
var baseProperty = require('./baseProperty');

/**
 * Gets the "length" property value of `object`.
 *
 * **Note:** This function is used to avoid a [JIT bug](https://bugs.webkit.org/show_bug.cgi?id=142792)
 * that affects Safari on at least iOS 8.1-8.3 ARM64.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {*} Returns the "length" value.
 */
var getLength = baseProperty('length');

module.exports = getLength;

},{"./baseProperty":42}],64:[function(require,module,exports){
var isStrictComparable = require('./isStrictComparable'),
    pairs = require('../object/pairs');

/**
 * Gets the propery names, values, and compare flags of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the match data of `object`.
 */
function getMatchData(object) {
  var result = pairs(object),
      length = result.length;

  while (length--) {
    result[length][2] = isStrictComparable(result[length][1]);
  }
  return result;
}

module.exports = getMatchData;

},{"../object/pairs":100,"./isStrictComparable":77}],65:[function(require,module,exports){
var isNative = require('../lang/isNative');

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = object == null ? undefined : object[key];
  return isNative(value) ? value : undefined;
}

module.exports = getNative;

},{"../lang/isNative":89}],66:[function(require,module,exports){
/**
 * Gets the index at which the first occurrence of `NaN` is found in `array`.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {number} fromIndex The index to search from.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched `NaN`, else `-1`.
 */
function indexOfNaN(array, fromIndex, fromRight) {
  var length = array.length,
      index = fromIndex + (fromRight ? 0 : -1);

  while ((fromRight ? index-- : ++index < length)) {
    var other = array[index];
    if (other !== other) {
      return index;
    }
  }
  return -1;
}

module.exports = indexOfNaN;

},{}],67:[function(require,module,exports){
/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Initializes an array clone.
 *
 * @private
 * @param {Array} array The array to clone.
 * @returns {Array} Returns the initialized clone.
 */
function initCloneArray(array) {
  var length = array.length,
      result = new array.constructor(length);

  // Add array properties assigned by `RegExp#exec`.
  if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
    result.index = array.index;
    result.input = array.input;
  }
  return result;
}

module.exports = initCloneArray;

},{}],68:[function(require,module,exports){
(function (global){
var bufferClone = require('./bufferClone');

/** `Object#toString` result references. */
var boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    numberTag = '[object Number]',
    regexpTag = '[object RegExp]',
    stringTag = '[object String]';

var arrayBufferTag = '[object ArrayBuffer]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to match `RegExp` flags from their coerced string values. */
var reFlags = /\w*$/;

/** Native method references. */
var Uint8Array = global.Uint8Array;

/** Used to lookup a type array constructors by `toStringTag`. */
var ctorByTag = {};
ctorByTag[float32Tag] = global.Float32Array;
ctorByTag[float64Tag] = global.Float64Array;
ctorByTag[int8Tag] = global.Int8Array;
ctorByTag[int16Tag] = global.Int16Array;
ctorByTag[int32Tag] = global.Int32Array;
ctorByTag[uint8Tag] = Uint8Array;
ctorByTag[uint8ClampedTag] = global.Uint8ClampedArray;
ctorByTag[uint16Tag] = global.Uint16Array;
ctorByTag[uint32Tag] = global.Uint32Array;

/**
 * Initializes an object clone based on its `toStringTag`.
 *
 * **Note:** This function only supports cloning values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} object The object to clone.
 * @param {string} tag The `toStringTag` of the object to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneByTag(object, tag, isDeep) {
  var Ctor = object.constructor;
  switch (tag) {
    case arrayBufferTag:
      return bufferClone(object);

    case boolTag:
    case dateTag:
      return new Ctor(+object);

    case float32Tag: case float64Tag:
    case int8Tag: case int16Tag: case int32Tag:
    case uint8Tag: case uint8ClampedTag: case uint16Tag: case uint32Tag:
      // Safari 5 mobile incorrectly has `Object` as the constructor of typed arrays.
      if (Ctor instanceof Ctor) {
        Ctor = ctorByTag[tag];
      }
      var buffer = object.buffer;
      return new Ctor(isDeep ? bufferClone(buffer) : buffer, object.byteOffset, object.length);

    case numberTag:
    case stringTag:
      return new Ctor(object);

    case regexpTag:
      var result = new Ctor(object.source, reFlags.exec(object));
      result.lastIndex = object.lastIndex;
  }
  return result;
}

module.exports = initCloneByTag;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./bufferClone":51}],69:[function(require,module,exports){
/**
 * Initializes an object clone.
 *
 * @private
 * @param {Object} object The object to clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneObject(object) {
  var Ctor = object.constructor;
  if (!(typeof Ctor == 'function' && Ctor instanceof Ctor)) {
    Ctor = Object;
  }
  return new Ctor;
}

module.exports = initCloneObject;

},{}],70:[function(require,module,exports){
var getLength = require('./getLength'),
    isLength = require('./isLength');

/**
 * Checks if `value` is array-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 */
function isArrayLike(value) {
  return value != null && isLength(getLength(value));
}

module.exports = isArrayLike;

},{"./getLength":63,"./isLength":75}],71:[function(require,module,exports){
/**
 * Checks if `value` is a host object in IE < 9.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
 */
var isHostObject = (function() {
  try {
    Object({ 'toString': 0 } + '');
  } catch(e) {
    return function() { return false; };
  }
  return function(value) {
    // IE < 9 presents many host objects as `Object` objects that can coerce
    // to strings despite having improperly defined `toString` methods.
    return typeof value.toString != 'function' && typeof (value + '') == 'string';
  };
}());

module.exports = isHostObject;

},{}],72:[function(require,module,exports){
/** Used to detect unsigned integer values. */
var reIsUint = /^\d+$/;

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  value = (typeof value == 'number' || reIsUint.test(value)) ? +value : -1;
  length = length == null ? MAX_SAFE_INTEGER : length;
  return value > -1 && value % 1 == 0 && value < length;
}

module.exports = isIndex;

},{}],73:[function(require,module,exports){
var isArrayLike = require('./isArrayLike'),
    isIndex = require('./isIndex'),
    isObject = require('../lang/isObject');

/**
 * Checks if the provided arguments are from an iteratee call.
 *
 * @private
 * @param {*} value The potential iteratee value argument.
 * @param {*} index The potential iteratee index or key argument.
 * @param {*} object The potential iteratee object argument.
 * @returns {boolean} Returns `true` if the arguments are from an iteratee call, else `false`.
 */
function isIterateeCall(value, index, object) {
  if (!isObject(object)) {
    return false;
  }
  var type = typeof index;
  if (type == 'number'
      ? (isArrayLike(object) && isIndex(index, object.length))
      : (type == 'string' && index in object)) {
    var other = object[index];
    return value === value ? (value === other) : (other !== other);
  }
  return false;
}

module.exports = isIterateeCall;

},{"../lang/isObject":92,"./isArrayLike":70,"./isIndex":72}],74:[function(require,module,exports){
var isArray = require('../lang/isArray'),
    toObject = require('./toObject');

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\n\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/;

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey(value, object) {
  var type = typeof value;
  if ((type == 'string' && reIsPlainProp.test(value)) || type == 'number') {
    return true;
  }
  if (isArray(value)) {
    return false;
  }
  var result = !reIsDeepProp.test(value);
  return result || (object != null && value in toObject(object));
}

module.exports = isKey;

},{"../lang/isArray":84,"./toObject":80}],75:[function(require,module,exports){
/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

module.exports = isLength;

},{}],76:[function(require,module,exports){
/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

module.exports = isObjectLike;

},{}],77:[function(require,module,exports){
var isObject = require('../lang/isObject');

/**
 * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` if suitable for strict
 *  equality comparisons, else `false`.
 */
function isStrictComparable(value) {
  return value === value && !isObject(value);
}

module.exports = isStrictComparable;

},{"../lang/isObject":92}],78:[function(require,module,exports){
var isArguments = require('../lang/isArguments'),
    isArray = require('../lang/isArray'),
    isIndex = require('./isIndex'),
    isLength = require('./isLength'),
    isString = require('../lang/isString'),
    keysIn = require('../object/keysIn');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A fallback implementation of `Object.keys` which creates an array of the
 * own enumerable property names of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function shimKeys(object) {
  var props = keysIn(object),
      propsLength = props.length,
      length = propsLength && object.length;

  var allowIndexes = !!length && isLength(length) &&
    (isArray(object) || isArguments(object) || isString(object));

  var index = -1,
      result = [];

  while (++index < propsLength) {
    var key = props[index];
    if ((allowIndexes && isIndex(key, length)) || hasOwnProperty.call(object, key)) {
      result.push(key);
    }
  }
  return result;
}

module.exports = shimKeys;

},{"../lang/isArguments":83,"../lang/isArray":84,"../lang/isString":94,"../object/keysIn":99,"./isIndex":72,"./isLength":75}],79:[function(require,module,exports){
/**
 * An implementation of `_.uniq` optimized for sorted arrays without support
 * for callback shorthands and `this` binding.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Function} [iteratee] The function invoked per iteration.
 * @returns {Array} Returns the new duplicate free array.
 */
function sortedUniq(array, iteratee) {
  var seen,
      index = -1,
      length = array.length,
      resIndex = -1,
      result = [];

  while (++index < length) {
    var value = array[index],
        computed = iteratee ? iteratee(value, index, array) : value;

    if (!index || seen !== computed) {
      seen = computed;
      result[++resIndex] = value;
    }
  }
  return result;
}

module.exports = sortedUniq;

},{}],80:[function(require,module,exports){
var isObject = require('../lang/isObject'),
    isString = require('../lang/isString'),
    support = require('../support');

/**
 * Converts `value` to an object if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Object} Returns the object.
 */
function toObject(value) {
  if (support.unindexedChars && isString(value)) {
    var index = -1,
        length = value.length,
        result = Object(value);

    while (++index < length) {
      result[index] = value.charAt(index);
    }
    return result;
  }
  return isObject(value) ? value : Object(value);
}

module.exports = toObject;

},{"../lang/isObject":92,"../lang/isString":94,"../support":102}],81:[function(require,module,exports){
var baseToString = require('./baseToString'),
    isArray = require('../lang/isArray');

/** Used to match property names within property paths. */
var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/**
 * Converts `value` to property path array if it's not one.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {Array} Returns the property path array.
 */
function toPath(value) {
  if (isArray(value)) {
    return value;
  }
  var result = [];
  baseToString(value).replace(rePropName, function(match, number, quote, string) {
    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
}

module.exports = toPath;

},{"../lang/isArray":84,"./baseToString":46}],82:[function(require,module,exports){
var baseClone = require('../internal/baseClone'),
    bindCallback = require('../internal/bindCallback');

/**
 * Creates a deep clone of `value`. If `customizer` is provided it's invoked
 * to produce the cloned values. If `customizer` returns `undefined` cloning
 * is handled by the method instead. The `customizer` is bound to `thisArg`
 * and invoked with up to three argument; (value [, index|key, object]).
 *
 * **Note:** This method is loosely based on the
 * [structured clone algorithm](http://www.w3.org/TR/html5/infrastructure.html#internal-structured-cloning-algorithm).
 * The enumerable properties of `arguments` objects and objects created by
 * constructors other than `Object` are cloned to plain `Object` objects. An
 * empty object is returned for uncloneable values such as functions, DOM nodes,
 * Maps, Sets, and WeakMaps.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to deep clone.
 * @param {Function} [customizer] The function to customize cloning values.
 * @param {*} [thisArg] The `this` binding of `customizer`.
 * @returns {*} Returns the deep cloned value.
 * @example
 *
 * var users = [
 *   { 'user': 'barney' },
 *   { 'user': 'fred' }
 * ];
 *
 * var deep = _.cloneDeep(users);
 * deep[0] === users[0];
 * // => false
 *
 * // using a customizer callback
 * var el = _.cloneDeep(document.body, function(value) {
 *   if (_.isElement(value)) {
 *     return value.cloneNode(true);
 *   }
 * });
 *
 * el === document.body
 * // => false
 * el.nodeName
 * // => BODY
 * el.childNodes.length;
 * // => 20
 */
function cloneDeep(value, customizer, thisArg) {
  return typeof customizer == 'function'
    ? baseClone(value, true, bindCallback(customizer, thisArg, 3))
    : baseClone(value, true);
}

module.exports = cloneDeep;

},{"../internal/baseClone":24,"../internal/bindCallback":50}],83:[function(require,module,exports){
var isArrayLike = require('../internal/isArrayLike'),
    isObjectLike = require('../internal/isObjectLike');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Native method references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/**
 * Checks if `value` is classified as an `arguments` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  return isObjectLike(value) && isArrayLike(value) &&
    hasOwnProperty.call(value, 'callee') && !propertyIsEnumerable.call(value, 'callee');
}

module.exports = isArguments;

},{"../internal/isArrayLike":70,"../internal/isObjectLike":76}],84:[function(require,module,exports){
var getNative = require('../internal/getNative'),
    isLength = require('../internal/isLength'),
    isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var arrayTag = '[object Array]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeIsArray = getNative(Array, 'isArray');

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(function() { return arguments; }());
 * // => false
 */
var isArray = nativeIsArray || function(value) {
  return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag;
};

module.exports = isArray;

},{"../internal/getNative":65,"../internal/isLength":75,"../internal/isObjectLike":76}],85:[function(require,module,exports){
var isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var boolTag = '[object Boolean]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a boolean primitive or object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isBoolean(false);
 * // => true
 *
 * _.isBoolean(null);
 * // => false
 */
function isBoolean(value) {
  return value === true || value === false || (isObjectLike(value) && objToString.call(value) == boolTag);
}

module.exports = isBoolean;

},{"../internal/isObjectLike":76}],86:[function(require,module,exports){
var isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var dateTag = '[object Date]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `Date` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isDate(new Date);
 * // => true
 *
 * _.isDate('Mon April 23 2012');
 * // => false
 */
function isDate(value) {
  return isObjectLike(value) && objToString.call(value) == dateTag;
}

module.exports = isDate;

},{"../internal/isObjectLike":76}],87:[function(require,module,exports){
(function (global){
/* Native method references for those with the same name as other `lodash` methods. */
var nativeIsFinite = global.isFinite;

/**
 * Checks if `value` is a finite primitive number.
 *
 * **Note:** This method is based on [`Number.isFinite`](http://ecma-international.org/ecma-262/6.0/#sec-number.isfinite).
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a finite number, else `false`.
 * @example
 *
 * _.isFinite(10);
 * // => true
 *
 * _.isFinite('10');
 * // => false
 *
 * _.isFinite(true);
 * // => false
 *
 * _.isFinite(Object(10));
 * // => false
 *
 * _.isFinite(Infinity);
 * // => false
 */
function isFinite(value) {
  return typeof value == 'number' && nativeIsFinite(value);
}

module.exports = isFinite;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],88:[function(require,module,exports){
var isObject = require('./isObject');

/** `Object#toString` result references. */
var funcTag = '[object Function]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in older versions of Chrome and Safari which return 'function' for regexes
  // and Safari 8 which returns 'object' for typed array constructors.
  return isObject(value) && objToString.call(value) == funcTag;
}

module.exports = isFunction;

},{"./isObject":92}],89:[function(require,module,exports){
var isFunction = require('./isFunction'),
    isHostObject = require('../internal/isHostObject'),
    isObjectLike = require('../internal/isObjectLike');

/** Used to detect host constructors (Safari > 5). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (isFunction(value)) {
    return reIsNative.test(fnToString.call(value));
  }
  return isObjectLike(value) && (isHostObject(value) ? reIsNative : reIsHostCtor).test(value);
}

module.exports = isNative;

},{"../internal/isHostObject":71,"../internal/isObjectLike":76,"./isFunction":88}],90:[function(require,module,exports){
/**
 * Checks if `value` is `null`.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is `null`, else `false`.
 * @example
 *
 * _.isNull(null);
 * // => true
 *
 * _.isNull(void 0);
 * // => false
 */
function isNull(value) {
  return value === null;
}

module.exports = isNull;

},{}],91:[function(require,module,exports){
var isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var numberTag = '[object Number]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `Number` primitive or object.
 *
 * **Note:** To exclude `Infinity`, `-Infinity`, and `NaN`, which are classified
 * as numbers, use the `_.isFinite` method.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isNumber(8.4);
 * // => true
 *
 * _.isNumber(NaN);
 * // => true
 *
 * _.isNumber('8.4');
 * // => false
 */
function isNumber(value) {
  return typeof value == 'number' || (isObjectLike(value) && objToString.call(value) == numberTag);
}

module.exports = isNumber;

},{"../internal/isObjectLike":76}],92:[function(require,module,exports){
/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

module.exports = isObject;

},{}],93:[function(require,module,exports){
var baseForIn = require('../internal/baseForIn'),
    isArguments = require('./isArguments'),
    isHostObject = require('../internal/isHostObject'),
    isObjectLike = require('../internal/isObjectLike'),
    support = require('../support');

/** `Object#toString` result references. */
var objectTag = '[object Object]';

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is a plain object, that is, an object created by the
 * `Object` constructor or one with a `[[Prototype]]` of `null`.
 *
 * **Note:** This method assumes objects created by the `Object` constructor
 * have no inherited enumerable properties.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 * }
 *
 * _.isPlainObject(new Foo);
 * // => false
 *
 * _.isPlainObject([1, 2, 3]);
 * // => false
 *
 * _.isPlainObject({ 'x': 0, 'y': 0 });
 * // => true
 *
 * _.isPlainObject(Object.create(null));
 * // => true
 */
function isPlainObject(value) {
  var Ctor;

  // Exit early for non `Object` objects.
  if (!(isObjectLike(value) && objToString.call(value) == objectTag && !isHostObject(value) && !isArguments(value)) ||
      (!hasOwnProperty.call(value, 'constructor') && (Ctor = value.constructor, typeof Ctor == 'function' && !(Ctor instanceof Ctor)))) {
    return false;
  }
  // IE < 9 iterates inherited properties before own properties. If the first
  // iterated property is an object's own property then there are no inherited
  // enumerable properties.
  var result;
  if (support.ownLast) {
    baseForIn(value, function(subValue, key, object) {
      result = hasOwnProperty.call(object, key);
      return false;
    });
    return result !== false;
  }
  // In most environments an object's own properties are iterated before
  // its inherited properties. If the last iterated property is an object's
  // own property then there are no inherited enumerable properties.
  baseForIn(value, function(subValue, key) {
    result = key;
  });
  return result === undefined || hasOwnProperty.call(value, result);
}

module.exports = isPlainObject;

},{"../internal/baseForIn":32,"../internal/isHostObject":71,"../internal/isObjectLike":76,"../support":102,"./isArguments":83}],94:[function(require,module,exports){
var isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var stringTag = '[object String]';

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `String` primitive or object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isString('abc');
 * // => true
 *
 * _.isString(1);
 * // => false
 */
function isString(value) {
  return typeof value == 'string' || (isObjectLike(value) && objToString.call(value) == stringTag);
}

module.exports = isString;

},{"../internal/isObjectLike":76}],95:[function(require,module,exports){
var isLength = require('../internal/isLength'),
    isObjectLike = require('../internal/isObjectLike');

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
typedArrayTags[dateTag] = typedArrayTags[errorTag] =
typedArrayTags[funcTag] = typedArrayTags[mapTag] =
typedArrayTags[numberTag] = typedArrayTags[objectTag] =
typedArrayTags[regexpTag] = typedArrayTags[setTag] =
typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;

/** Used for native method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/**
 * Checks if `value` is classified as a typed array.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isTypedArray(new Uint8Array);
 * // => true
 *
 * _.isTypedArray([]);
 * // => false
 */
function isTypedArray(value) {
  return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[objToString.call(value)];
}

module.exports = isTypedArray;

},{"../internal/isLength":75,"../internal/isObjectLike":76}],96:[function(require,module,exports){
/**
 * Checks if `value` is `undefined`.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is `undefined`, else `false`.
 * @example
 *
 * _.isUndefined(void 0);
 * // => true
 *
 * _.isUndefined(null);
 * // => false
 */
function isUndefined(value) {
  return value === undefined;
}

module.exports = isUndefined;

},{}],97:[function(require,module,exports){
var baseGet = require('../internal/baseGet'),
    baseSlice = require('../internal/baseSlice'),
    isArguments = require('../lang/isArguments'),
    isArray = require('../lang/isArray'),
    isIndex = require('../internal/isIndex'),
    isKey = require('../internal/isKey'),
    isLength = require('../internal/isLength'),
    isString = require('../lang/isString'),
    last = require('../array/last'),
    toPath = require('../internal/toPath');

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Checks if `path` is a direct property.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @param {Array|string} path The path to check.
 * @returns {boolean} Returns `true` if `path` is a direct property, else `false`.
 * @example
 *
 * var object = { 'a': { 'b': { 'c': 3 } } };
 *
 * _.has(object, 'a');
 * // => true
 *
 * _.has(object, 'a.b.c');
 * // => true
 *
 * _.has(object, ['a', 'b', 'c']);
 * // => true
 */
function has(object, path) {
  if (object == null) {
    return false;
  }
  var result = hasOwnProperty.call(object, path);
  if (!result && !isKey(path)) {
    path = toPath(path);
    object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
    if (object == null) {
      return false;
    }
    path = last(path);
    result = hasOwnProperty.call(object, path);
  }
  return result || (isLength(object.length) && isIndex(path, object.length) &&
    (isArray(object) || isArguments(object) || isString(object)));
}

module.exports = has;

},{"../array/last":6,"../internal/baseGet":34,"../internal/baseSlice":45,"../internal/isIndex":72,"../internal/isKey":74,"../internal/isLength":75,"../internal/toPath":81,"../lang/isArguments":83,"../lang/isArray":84,"../lang/isString":94}],98:[function(require,module,exports){
var getNative = require('../internal/getNative'),
    isArrayLike = require('../internal/isArrayLike'),
    isObject = require('../lang/isObject'),
    shimKeys = require('../internal/shimKeys'),
    support = require('../support');

/* Native method references for those with the same name as other `lodash` methods. */
var nativeKeys = getNative(Object, 'keys');

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/6.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
var keys = !nativeKeys ? shimKeys : function(object) {
  var Ctor = object == null ? undefined : object.constructor;
  if ((typeof Ctor == 'function' && Ctor.prototype === object) ||
      (typeof object == 'function' ? support.enumPrototypes : isArrayLike(object))) {
    return shimKeys(object);
  }
  return isObject(object) ? nativeKeys(object) : [];
};

module.exports = keys;

},{"../internal/getNative":65,"../internal/isArrayLike":70,"../internal/shimKeys":78,"../lang/isObject":92,"../support":102}],99:[function(require,module,exports){
var arrayEach = require('../internal/arrayEach'),
    isArguments = require('../lang/isArguments'),
    isArray = require('../lang/isArray'),
    isFunction = require('../lang/isFunction'),
    isIndex = require('../internal/isIndex'),
    isLength = require('../internal/isLength'),
    isObject = require('../lang/isObject'),
    isString = require('../lang/isString'),
    support = require('../support');

/** `Object#toString` result references. */
var arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    stringTag = '[object String]';

/** Used to fix the JScript `[[DontEnum]]` bug. */
var shadowProps = [
  'constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'toLocaleString', 'toString', 'valueOf'
];

/** Used for native method references. */
var errorProto = Error.prototype,
    objectProto = Object.prototype,
    stringProto = String.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Used to avoid iterating over non-enumerable properties in IE < 9. */
var nonEnumProps = {};
nonEnumProps[arrayTag] = nonEnumProps[dateTag] = nonEnumProps[numberTag] = { 'constructor': true, 'toLocaleString': true, 'toString': true, 'valueOf': true };
nonEnumProps[boolTag] = nonEnumProps[stringTag] = { 'constructor': true, 'toString': true, 'valueOf': true };
nonEnumProps[errorTag] = nonEnumProps[funcTag] = nonEnumProps[regexpTag] = { 'constructor': true, 'toString': true };
nonEnumProps[objectTag] = { 'constructor': true };

arrayEach(shadowProps, function(key) {
  for (var tag in nonEnumProps) {
    if (hasOwnProperty.call(nonEnumProps, tag)) {
      var props = nonEnumProps[tag];
      props[key] = hasOwnProperty.call(props, key);
    }
  }
});

/**
 * Creates an array of the own and inherited enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keysIn(new Foo);
 * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
 */
function keysIn(object) {
  if (object == null) {
    return [];
  }
  if (!isObject(object)) {
    object = Object(object);
  }
  var length = object.length;

  length = (length && isLength(length) &&
    (isArray(object) || isArguments(object) || isString(object)) && length) || 0;

  var Ctor = object.constructor,
      index = -1,
      proto = (isFunction(Ctor) && Ctor.prototype) || objectProto,
      isProto = proto === object,
      result = Array(length),
      skipIndexes = length > 0,
      skipErrorProps = support.enumErrorProps && (object === errorProto || object instanceof Error),
      skipProto = support.enumPrototypes && isFunction(object);

  while (++index < length) {
    result[index] = (index + '');
  }
  // lodash skips the `constructor` property when it infers it's iterating
  // over a `prototype` object because IE < 9 can't set the `[[Enumerable]]`
  // attribute of an existing property and the `constructor` property of a
  // prototype defaults to non-enumerable.
  for (var key in object) {
    if (!(skipProto && key == 'prototype') &&
        !(skipErrorProps && (key == 'message' || key == 'name')) &&
        !(skipIndexes && isIndex(key, length)) &&
        !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
      result.push(key);
    }
  }
  if (support.nonEnumShadows && object !== objectProto) {
    var tag = object === stringProto ? stringTag : (object === errorProto ? errorTag : objToString.call(object)),
        nonEnums = nonEnumProps[tag] || nonEnumProps[objectTag];

    if (tag == objectTag) {
      proto = objectProto;
    }
    length = shadowProps.length;
    while (length--) {
      key = shadowProps[length];
      var nonEnum = nonEnums[key];
      if (!(isProto && nonEnum) &&
          (nonEnum ? hasOwnProperty.call(object, key) : object[key] !== proto[key])) {
        result.push(key);
      }
    }
  }
  return result;
}

module.exports = keysIn;

},{"../internal/arrayEach":17,"../internal/isIndex":72,"../internal/isLength":75,"../lang/isArguments":83,"../lang/isArray":84,"../lang/isFunction":88,"../lang/isObject":92,"../lang/isString":94,"../support":102}],100:[function(require,module,exports){
var keys = require('./keys'),
    toObject = require('../internal/toObject');

/**
 * Creates a two dimensional array of the key-value pairs for `object`,
 * e.g. `[[key1, value1], [key2, value2]]`.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the new array of key-value pairs.
 * @example
 *
 * _.pairs({ 'barney': 36, 'fred': 40 });
 * // => [['barney', 36], ['fred', 40]] (iteration order is not guaranteed)
 */
function pairs(object) {
  object = toObject(object);

  var index = -1,
      props = keys(object),
      length = props.length,
      result = Array(length);

  while (++index < length) {
    var key = props[index];
    result[index] = [key, object[key]];
  }
  return result;
}

module.exports = pairs;

},{"../internal/toObject":80,"./keys":98}],101:[function(require,module,exports){
var isIndex = require('../internal/isIndex'),
    isKey = require('../internal/isKey'),
    isObject = require('../lang/isObject'),
    toPath = require('../internal/toPath');

/**
 * Sets the property value of `path` on `object`. If a portion of `path`
 * does not exist it's created.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to augment.
 * @param {Array|string} path The path of the property to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns `object`.
 * @example
 *
 * var object = { 'a': [{ 'b': { 'c': 3 } }] };
 *
 * _.set(object, 'a[0].b.c', 4);
 * console.log(object.a[0].b.c);
 * // => 4
 *
 * _.set(object, 'x[0].y.z', 5);
 * console.log(object.x[0].y.z);
 * // => 5
 */
function set(object, path, value) {
  if (object == null) {
    return object;
  }
  var pathKey = (path + '');
  path = (object[pathKey] != null || isKey(path, object)) ? [pathKey] : toPath(path);

  var index = -1,
      length = path.length,
      lastIndex = length - 1,
      nested = object;

  while (nested != null && ++index < length) {
    var key = path[index];
    if (isObject(nested)) {
      if (index == lastIndex) {
        nested[key] = value;
      } else if (nested[key] == null) {
        nested[key] = isIndex(path[index + 1]) ? [] : {};
      }
    }
    nested = nested[key];
  }
  return object;
}

module.exports = set;

},{"../internal/isIndex":72,"../internal/isKey":74,"../internal/toPath":81,"../lang/isObject":92}],102:[function(require,module,exports){
/** Used for native method references. */
var arrayProto = Array.prototype,
    errorProto = Error.prototype,
    objectProto = Object.prototype;

/** Native method references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable,
    splice = arrayProto.splice;

/**
 * An object environment feature flags.
 *
 * @static
 * @memberOf _
 * @type Object
 */
var support = {};

(function(x) {
  var Ctor = function() { this.x = x; },
      object = { '0': x, 'length': x },
      props = [];

  Ctor.prototype = { 'valueOf': x, 'y': x };
  for (var key in new Ctor) { props.push(key); }

  /**
   * Detect if `name` or `message` properties of `Error.prototype` are
   * enumerable by default (IE < 9, Safari < 5.1).
   *
   * @memberOf _.support
   * @type boolean
   */
  support.enumErrorProps = propertyIsEnumerable.call(errorProto, 'message') ||
    propertyIsEnumerable.call(errorProto, 'name');

  /**
   * Detect if `prototype` properties are enumerable by default.
   *
   * Firefox < 3.6, Opera > 9.50 - Opera < 11.60, and Safari < 5.1
   * (if the prototype or a property on the prototype has been set)
   * incorrectly set the `[[Enumerable]]` value of a function's `prototype`
   * property to `true`.
   *
   * @memberOf _.support
   * @type boolean
   */
  support.enumPrototypes = propertyIsEnumerable.call(Ctor, 'prototype');

  /**
   * Detect if properties shadowing those on `Object.prototype` are non-enumerable.
   *
   * In IE < 9 an object's own properties, shadowing non-enumerable ones,
   * are made non-enumerable as well (a.k.a the JScript `[[DontEnum]]` bug).
   *
   * @memberOf _.support
   * @type boolean
   */
  support.nonEnumShadows = !/valueOf/.test(props);

  /**
   * Detect if own properties are iterated after inherited properties (IE < 9).
   *
   * @memberOf _.support
   * @type boolean
   */
  support.ownLast = props[0] != 'x';

  /**
   * Detect if `Array#shift` and `Array#splice` augment array-like objects
   * correctly.
   *
   * Firefox < 10, compatibility modes of IE 8, and IE < 9 have buggy Array
   * `shift()` and `splice()` functions that fail to remove the last element,
   * `value[0]`, of array-like objects even though the "length" property is
   * set to `0`. The `shift()` method is buggy in compatibility modes of IE 8,
   * while `splice()` is buggy regardless of mode in IE < 9.
   *
   * @memberOf _.support
   * @type boolean
   */
  support.spliceObjects = (splice.call(object, 0, 1), !object[0]);

  /**
   * Detect lack of support for accessing string characters by index.
   *
   * IE < 8 can't access characters by index. IE 8 can only access characters
   * by index on string literals, not string objects.
   *
   * @memberOf _.support
   * @type boolean
   */
  support.unindexedChars = ('x'[0] + Object('x')[0]) != 'xx';
}(1, 0));

module.exports = support;

},{}],103:[function(require,module,exports){
/**
 * This method returns the first argument provided to it.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'user': 'fred' };
 *
 * _.identity(object) === object;
 * // => true
 */
function identity(value) {
  return value;
}

module.exports = identity;

},{}],104:[function(require,module,exports){
var baseProperty = require('../internal/baseProperty'),
    basePropertyDeep = require('../internal/basePropertyDeep'),
    isKey = require('../internal/isKey');

/**
 * Creates a function that returns the property value at `path` on a
 * given object.
 *
 * @static
 * @memberOf _
 * @category Utility
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var objects = [
 *   { 'a': { 'b': { 'c': 2 } } },
 *   { 'a': { 'b': { 'c': 1 } } }
 * ];
 *
 * _.map(objects, _.property('a.b.c'));
 * // => [2, 1]
 *
 * _.pluck(_.sortBy(objects, _.property(['a', 'b', 'c'])), 'a.b.c');
 * // => [1, 2]
 */
function property(path) {
  return isKey(path) ? baseProperty(path) : basePropertyDeep(path);
}

module.exports = property;

},{"../internal/baseProperty":42,"../internal/basePropertyDeep":43,"../internal/isKey":74}],105:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _toDate = require('./lib/toDate');

var _toDate2 = _interopRequireDefault(_toDate);

var _toFloat = require('./lib/toFloat');

var _toFloat2 = _interopRequireDefault(_toFloat);

var _toInt = require('./lib/toInt');

var _toInt2 = _interopRequireDefault(_toInt);

var _toBoolean = require('./lib/toBoolean');

var _toBoolean2 = _interopRequireDefault(_toBoolean);

var _equals = require('./lib/equals');

var _equals2 = _interopRequireDefault(_equals);

var _contains = require('./lib/contains');

var _contains2 = _interopRequireDefault(_contains);

var _matches = require('./lib/matches');

var _matches2 = _interopRequireDefault(_matches);

var _isEmail = require('./lib/isEmail');

var _isEmail2 = _interopRequireDefault(_isEmail);

var _isURL = require('./lib/isURL');

var _isURL2 = _interopRequireDefault(_isURL);

var _isMACAddress = require('./lib/isMACAddress');

var _isMACAddress2 = _interopRequireDefault(_isMACAddress);

var _isIP = require('./lib/isIP');

var _isIP2 = _interopRequireDefault(_isIP);

var _isFQDN = require('./lib/isFQDN');

var _isFQDN2 = _interopRequireDefault(_isFQDN);

var _isBoolean = require('./lib/isBoolean');

var _isBoolean2 = _interopRequireDefault(_isBoolean);

var _isAlpha = require('./lib/isAlpha');

var _isAlpha2 = _interopRequireDefault(_isAlpha);

var _isAlphanumeric = require('./lib/isAlphanumeric');

var _isAlphanumeric2 = _interopRequireDefault(_isAlphanumeric);

var _isNumeric = require('./lib/isNumeric');

var _isNumeric2 = _interopRequireDefault(_isNumeric);

var _isLowercase = require('./lib/isLowercase');

var _isLowercase2 = _interopRequireDefault(_isLowercase);

var _isUppercase = require('./lib/isUppercase');

var _isUppercase2 = _interopRequireDefault(_isUppercase);

var _isAscii = require('./lib/isAscii');

var _isAscii2 = _interopRequireDefault(_isAscii);

var _isFullWidth = require('./lib/isFullWidth');

var _isFullWidth2 = _interopRequireDefault(_isFullWidth);

var _isHalfWidth = require('./lib/isHalfWidth');

var _isHalfWidth2 = _interopRequireDefault(_isHalfWidth);

var _isVariableWidth = require('./lib/isVariableWidth');

var _isVariableWidth2 = _interopRequireDefault(_isVariableWidth);

var _isMultibyte = require('./lib/isMultibyte');

var _isMultibyte2 = _interopRequireDefault(_isMultibyte);

var _isSurrogatePair = require('./lib/isSurrogatePair');

var _isSurrogatePair2 = _interopRequireDefault(_isSurrogatePair);

var _isInt = require('./lib/isInt');

var _isInt2 = _interopRequireDefault(_isInt);

var _isFloat = require('./lib/isFloat');

var _isFloat2 = _interopRequireDefault(_isFloat);

var _isDecimal = require('./lib/isDecimal');

var _isDecimal2 = _interopRequireDefault(_isDecimal);

var _isHexadecimal = require('./lib/isHexadecimal');

var _isHexadecimal2 = _interopRequireDefault(_isHexadecimal);

var _isDivisibleBy = require('./lib/isDivisibleBy');

var _isDivisibleBy2 = _interopRequireDefault(_isDivisibleBy);

var _isHexColor = require('./lib/isHexColor');

var _isHexColor2 = _interopRequireDefault(_isHexColor);

var _isISRC = require('./lib/isISRC');

var _isISRC2 = _interopRequireDefault(_isISRC);

var _isMD = require('./lib/isMD5');

var _isMD2 = _interopRequireDefault(_isMD);

var _isHash = require('./lib/isHash');

var _isHash2 = _interopRequireDefault(_isHash);

var _isJSON = require('./lib/isJSON');

var _isJSON2 = _interopRequireDefault(_isJSON);

var _isEmpty = require('./lib/isEmpty');

var _isEmpty2 = _interopRequireDefault(_isEmpty);

var _isLength = require('./lib/isLength');

var _isLength2 = _interopRequireDefault(_isLength);

var _isByteLength = require('./lib/isByteLength');

var _isByteLength2 = _interopRequireDefault(_isByteLength);

var _isUUID = require('./lib/isUUID');

var _isUUID2 = _interopRequireDefault(_isUUID);

var _isMongoId = require('./lib/isMongoId');

var _isMongoId2 = _interopRequireDefault(_isMongoId);

var _isAfter = require('./lib/isAfter');

var _isAfter2 = _interopRequireDefault(_isAfter);

var _isBefore = require('./lib/isBefore');

var _isBefore2 = _interopRequireDefault(_isBefore);

var _isIn = require('./lib/isIn');

var _isIn2 = _interopRequireDefault(_isIn);

var _isCreditCard = require('./lib/isCreditCard');

var _isCreditCard2 = _interopRequireDefault(_isCreditCard);

var _isISIN = require('./lib/isISIN');

var _isISIN2 = _interopRequireDefault(_isISIN);

var _isISBN = require('./lib/isISBN');

var _isISBN2 = _interopRequireDefault(_isISBN);

var _isISSN = require('./lib/isISSN');

var _isISSN2 = _interopRequireDefault(_isISSN);

var _isMobilePhone = require('./lib/isMobilePhone');

var _isMobilePhone2 = _interopRequireDefault(_isMobilePhone);

var _isCurrency = require('./lib/isCurrency');

var _isCurrency2 = _interopRequireDefault(_isCurrency);

var _isISO = require('./lib/isISO8601');

var _isISO2 = _interopRequireDefault(_isISO);

var _isBase = require('./lib/isBase64');

var _isBase2 = _interopRequireDefault(_isBase);

var _isDataURI = require('./lib/isDataURI');

var _isDataURI2 = _interopRequireDefault(_isDataURI);

var _isLatLong = require('./lib/isLatLong');

var _isLatLong2 = _interopRequireDefault(_isLatLong);

var _isPostalCode = require('./lib/isPostalCode');

var _isPostalCode2 = _interopRequireDefault(_isPostalCode);

var _ltrim = require('./lib/ltrim');

var _ltrim2 = _interopRequireDefault(_ltrim);

var _rtrim = require('./lib/rtrim');

var _rtrim2 = _interopRequireDefault(_rtrim);

var _trim = require('./lib/trim');

var _trim2 = _interopRequireDefault(_trim);

var _escape = require('./lib/escape');

var _escape2 = _interopRequireDefault(_escape);

var _unescape = require('./lib/unescape');

var _unescape2 = _interopRequireDefault(_unescape);

var _stripLow = require('./lib/stripLow');

var _stripLow2 = _interopRequireDefault(_stripLow);

var _whitelist = require('./lib/whitelist');

var _whitelist2 = _interopRequireDefault(_whitelist);

var _blacklist = require('./lib/blacklist');

var _blacklist2 = _interopRequireDefault(_blacklist);

var _isWhitelisted = require('./lib/isWhitelisted');

var _isWhitelisted2 = _interopRequireDefault(_isWhitelisted);

var _normalizeEmail = require('./lib/normalizeEmail');

var _normalizeEmail2 = _interopRequireDefault(_normalizeEmail);

var _toString = require('./lib/util/toString');

var _toString2 = _interopRequireDefault(_toString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var version = '8.2.0';

var validator = {
  version: version,
  toDate: _toDate2.default,
  toFloat: _toFloat2.default,
  toInt: _toInt2.default,
  toBoolean: _toBoolean2.default,
  equals: _equals2.default,
  contains: _contains2.default,
  matches: _matches2.default,
  isEmail: _isEmail2.default,
  isURL: _isURL2.default,
  isMACAddress: _isMACAddress2.default,
  isIP: _isIP2.default,
  isFQDN: _isFQDN2.default,
  isBoolean: _isBoolean2.default,
  isAlpha: _isAlpha2.default,
  isAlphanumeric: _isAlphanumeric2.default,
  isNumeric: _isNumeric2.default,
  isLowercase: _isLowercase2.default,
  isUppercase: _isUppercase2.default,
  isAscii: _isAscii2.default,
  isFullWidth: _isFullWidth2.default,
  isHalfWidth: _isHalfWidth2.default,
  isVariableWidth: _isVariableWidth2.default,
  isMultibyte: _isMultibyte2.default,
  isSurrogatePair: _isSurrogatePair2.default,
  isInt: _isInt2.default,
  isFloat: _isFloat2.default,
  isDecimal: _isDecimal2.default,
  isHexadecimal: _isHexadecimal2.default,
  isDivisibleBy: _isDivisibleBy2.default,
  isHexColor: _isHexColor2.default,
  isISRC: _isISRC2.default,
  isMD5: _isMD2.default,
  isHash: _isHash2.default,
  isJSON: _isJSON2.default,
  isEmpty: _isEmpty2.default,
  isLength: _isLength2.default,
  isByteLength: _isByteLength2.default,
  isUUID: _isUUID2.default,
  isMongoId: _isMongoId2.default,
  isAfter: _isAfter2.default,
  isBefore: _isBefore2.default,
  isIn: _isIn2.default,
  isCreditCard: _isCreditCard2.default,
  isISIN: _isISIN2.default,
  isISBN: _isISBN2.default,
  isISSN: _isISSN2.default,
  isMobilePhone: _isMobilePhone2.default,
  isPostalCode: _isPostalCode2.default,
  isCurrency: _isCurrency2.default,
  isISO8601: _isISO2.default,
  isBase64: _isBase2.default,
  isDataURI: _isDataURI2.default,
  isLatLong: _isLatLong2.default,
  ltrim: _ltrim2.default,
  rtrim: _rtrim2.default,
  trim: _trim2.default,
  escape: _escape2.default,
  unescape: _unescape2.default,
  stripLow: _stripLow2.default,
  whitelist: _whitelist2.default,
  blacklist: _blacklist2.default,
  isWhitelisted: _isWhitelisted2.default,
  normalizeEmail: _normalizeEmail2.default,
  toString: _toString2.default
};

exports.default = validator;
module.exports = exports['default'];
},{"./lib/blacklist":107,"./lib/contains":108,"./lib/equals":109,"./lib/escape":110,"./lib/isAfter":111,"./lib/isAlpha":112,"./lib/isAlphanumeric":113,"./lib/isAscii":114,"./lib/isBase64":115,"./lib/isBefore":116,"./lib/isBoolean":117,"./lib/isByteLength":118,"./lib/isCreditCard":119,"./lib/isCurrency":120,"./lib/isDataURI":121,"./lib/isDecimal":122,"./lib/isDivisibleBy":123,"./lib/isEmail":124,"./lib/isEmpty":125,"./lib/isFQDN":126,"./lib/isFloat":127,"./lib/isFullWidth":128,"./lib/isHalfWidth":129,"./lib/isHash":130,"./lib/isHexColor":131,"./lib/isHexadecimal":132,"./lib/isIP":133,"./lib/isISBN":134,"./lib/isISIN":135,"./lib/isISO8601":136,"./lib/isISRC":137,"./lib/isISSN":138,"./lib/isIn":139,"./lib/isInt":140,"./lib/isJSON":141,"./lib/isLatLong":142,"./lib/isLength":143,"./lib/isLowercase":144,"./lib/isMACAddress":145,"./lib/isMD5":146,"./lib/isMobilePhone":147,"./lib/isMongoId":148,"./lib/isMultibyte":149,"./lib/isNumeric":150,"./lib/isPostalCode":151,"./lib/isSurrogatePair":152,"./lib/isURL":153,"./lib/isUUID":154,"./lib/isUppercase":155,"./lib/isVariableWidth":156,"./lib/isWhitelisted":157,"./lib/ltrim":158,"./lib/matches":159,"./lib/normalizeEmail":160,"./lib/rtrim":161,"./lib/stripLow":162,"./lib/toBoolean":163,"./lib/toDate":164,"./lib/toFloat":165,"./lib/toInt":166,"./lib/trim":167,"./lib/unescape":168,"./lib/util/toString":171,"./lib/whitelist":172}],106:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var alpha = exports.alpha = {
  'en-US': /^[A-Z]+$/i,
  'cs-CZ': /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]+$/i,
  'da-DK': /^[A-ZÆØÅ]+$/i,
  'de-DE': /^[A-ZÄÖÜß]+$/i,
  'es-ES': /^[A-ZÁÉÍÑÓÚÜ]+$/i,
  'fr-FR': /^[A-ZÀÂÆÇÉÈÊËÏÎÔŒÙÛÜŸ]+$/i,
  'it-IT': /^[A-ZÀÉÈÌÎÓÒÙ]+$/i,
  'nb-NO': /^[A-ZÆØÅ]+$/i,
  'nl-NL': /^[A-ZÁÉËÏÓÖÜÚ]+$/i,
  'nn-NO': /^[A-ZÆØÅ]+$/i,
  'hu-HU': /^[A-ZÁÉÍÓÖŐÚÜŰ]+$/i,
  'pl-PL': /^[A-ZĄĆĘŚŁŃÓŻŹ]+$/i,
  'pt-PT': /^[A-ZÃÁÀÂÇÉÊÍÕÓÔÚÜ]+$/i,
  'ru-RU': /^[А-ЯЁ]+$/i,
  'sr-RS@latin': /^[A-ZČĆŽŠĐ]+$/i,
  'sr-RS': /^[А-ЯЂЈЉЊЋЏ]+$/i,
  'sv-SE': /^[A-ZÅÄÖ]+$/i,
  'tr-TR': /^[A-ZÇĞİıÖŞÜ]+$/i,
  'uk-UA': /^[А-ЩЬЮЯЄIЇҐ]+$/i,
  ar: /^[ءآأؤإئابةتثجحخدذرزسشصضطظعغفقكلمنهوىيًٌٍَُِّْٰ]+$/
};

var alphanumeric = exports.alphanumeric = {
  'en-US': /^[0-9A-Z]+$/i,
  'cs-CZ': /^[0-9A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]+$/i,
  'da-DK': /^[0-9A-ZÆØÅ]+$/i,
  'de-DE': /^[0-9A-ZÄÖÜß]+$/i,
  'es-ES': /^[0-9A-ZÁÉÍÑÓÚÜ]+$/i,
  'fr-FR': /^[0-9A-ZÀÂÆÇÉÈÊËÏÎÔŒÙÛÜŸ]+$/i,
  'it-IT': /^[0-9A-ZÀÉÈÌÎÓÒÙ]+$/i,
  'hu-HU': /^[0-9A-ZÁÉÍÓÖŐÚÜŰ]+$/i,
  'nb-NO': /^[0-9A-ZÆØÅ]+$/i,
  'nl-NL': /^[0-9A-ZÁÉËÏÓÖÜÚ]+$/i,
  'nn-NO': /^[0-9A-ZÆØÅ]+$/i,
  'pl-PL': /^[0-9A-ZĄĆĘŚŁŃÓŻŹ]+$/i,
  'pt-PT': /^[0-9A-ZÃÁÀÂÇÉÊÍÕÓÔÚÜ]+$/i,
  'ru-RU': /^[0-9А-ЯЁ]+$/i,
  'sr-RS@latin': /^[0-9A-ZČĆŽŠĐ]+$/i,
  'sr-RS': /^[0-9А-ЯЂЈЉЊЋЏ]+$/i,
  'sv-SE': /^[0-9A-ZÅÄÖ]+$/i,
  'tr-TR': /^[0-9A-ZÇĞİıÖŞÜ]+$/i,
  'uk-UA': /^[0-9А-ЩЬЮЯЄIЇҐ]+$/i,
  ar: /^[٠١٢٣٤٥٦٧٨٩0-9ءآأؤإئابةتثجحخدذرزسشصضطظعغفقكلمنهوىيًٌٍَُِّْٰ]+$/
};

var englishLocales = exports.englishLocales = ['AU', 'GB', 'HK', 'IN', 'NZ', 'ZA', 'ZM'];

for (var locale, i = 0; i < englishLocales.length; i++) {
  locale = 'en-' + englishLocales[i];
  alpha[locale] = alpha['en-US'];
  alphanumeric[locale] = alphanumeric['en-US'];
}

alpha['pt-BR'] = alpha['pt-PT'];
alphanumeric['pt-BR'] = alphanumeric['pt-PT'];

// Source: http://www.localeplanet.com/java/
var arabicLocales = exports.arabicLocales = ['AE', 'BH', 'DZ', 'EG', 'IQ', 'JO', 'KW', 'LB', 'LY', 'MA', 'QM', 'QA', 'SA', 'SD', 'SY', 'TN', 'YE'];

for (var _locale, _i = 0; _i < arabicLocales.length; _i++) {
  _locale = 'ar-' + arabicLocales[_i];
  alpha[_locale] = alpha.ar;
  alphanumeric[_locale] = alphanumeric.ar;
}
},{}],107:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = blacklist;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function blacklist(str, chars) {
  (0, _assertString2.default)(str);
  return str.replace(new RegExp('[' + chars + ']+', 'g'), '');
}
module.exports = exports['default'];
},{"./util/assertString":169}],108:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = contains;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _toString = require('./util/toString');

var _toString2 = _interopRequireDefault(_toString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function contains(str, elem) {
  (0, _assertString2.default)(str);
  return str.indexOf((0, _toString2.default)(elem)) >= 0;
}
module.exports = exports['default'];
},{"./util/assertString":169,"./util/toString":171}],109:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = equals;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function equals(str, comparison) {
  (0, _assertString2.default)(str);
  return str === comparison;
}
module.exports = exports['default'];
},{"./util/assertString":169}],110:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = escape;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function escape(str) {
  (0, _assertString2.default)(str);
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\//g, '&#x2F;').replace(/\\/g, '&#x5C;').replace(/`/g, '&#96;');
}
module.exports = exports['default'];
},{"./util/assertString":169}],111:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isAfter;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _toDate = require('./toDate');

var _toDate2 = _interopRequireDefault(_toDate);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isAfter(str) {
  var date = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : String(new Date());

  (0, _assertString2.default)(str);
  var comparison = (0, _toDate2.default)(date);
  var original = (0, _toDate2.default)(str);
  return !!(original && comparison && original > comparison);
}
module.exports = exports['default'];
},{"./toDate":164,"./util/assertString":169}],112:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isAlpha;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _alpha = require('./alpha');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isAlpha(str) {
  var locale = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'en-US';

  (0, _assertString2.default)(str);
  if (locale in _alpha.alpha) {
    return _alpha.alpha[locale].test(str);
  }
  throw new Error('Invalid locale \'' + locale + '\'');
}
module.exports = exports['default'];
},{"./alpha":106,"./util/assertString":169}],113:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isAlphanumeric;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _alpha = require('./alpha');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isAlphanumeric(str) {
  var locale = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'en-US';

  (0, _assertString2.default)(str);
  if (locale in _alpha.alphanumeric) {
    return _alpha.alphanumeric[locale].test(str);
  }
  throw new Error('Invalid locale \'' + locale + '\'');
}
module.exports = exports['default'];
},{"./alpha":106,"./util/assertString":169}],114:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isAscii;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable no-control-regex */
var ascii = /^[\x00-\x7F]+$/;
/* eslint-enable no-control-regex */

function isAscii(str) {
  (0, _assertString2.default)(str);
  return ascii.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],115:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isBase64;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var notBase64 = /[^A-Z0-9+\/=]/i;

function isBase64(str) {
  (0, _assertString2.default)(str);
  var len = str.length;
  if (!len || len % 4 !== 0 || notBase64.test(str)) {
    return false;
  }
  var firstPaddingChar = str.indexOf('=');
  return firstPaddingChar === -1 || firstPaddingChar === len - 1 || firstPaddingChar === len - 2 && str[len - 1] === '=';
}
module.exports = exports['default'];
},{"./util/assertString":169}],116:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isBefore;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _toDate = require('./toDate');

var _toDate2 = _interopRequireDefault(_toDate);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isBefore(str) {
  var date = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : String(new Date());

  (0, _assertString2.default)(str);
  var comparison = (0, _toDate2.default)(date);
  var original = (0, _toDate2.default)(str);
  return !!(original && comparison && original < comparison);
}
module.exports = exports['default'];
},{"./toDate":164,"./util/assertString":169}],117:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isBoolean;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isBoolean(str) {
  (0, _assertString2.default)(str);
  return ['true', 'false', '1', '0'].indexOf(str) >= 0;
}
module.exports = exports['default'];
},{"./util/assertString":169}],118:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.default = isByteLength;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable prefer-rest-params */
function isByteLength(str, options) {
  (0, _assertString2.default)(str);
  var min = void 0;
  var max = void 0;
  if ((typeof options === 'undefined' ? 'undefined' : _typeof(options)) === 'object') {
    min = options.min || 0;
    max = options.max;
  } else {
    // backwards compatibility: isByteLength(str, min [, max])
    min = arguments[1];
    max = arguments[2];
  }
  var len = encodeURI(str).split(/%..|./).length - 1;
  return len >= min && (typeof max === 'undefined' || len <= max);
}
module.exports = exports['default'];
},{"./util/assertString":169}],119:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isCreditCard;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable max-len */
var creditCard = /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|(222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11}|62[0-9]{14})$/;
/* eslint-enable max-len */

function isCreditCard(str) {
  (0, _assertString2.default)(str);
  var sanitized = str.replace(/[- ]+/g, '');
  if (!creditCard.test(sanitized)) {
    return false;
  }
  var sum = 0;
  var digit = void 0;
  var tmpNum = void 0;
  var shouldDouble = void 0;
  for (var i = sanitized.length - 1; i >= 0; i--) {
    digit = sanitized.substring(i, i + 1);
    tmpNum = parseInt(digit, 10);
    if (shouldDouble) {
      tmpNum *= 2;
      if (tmpNum >= 10) {
        sum += tmpNum % 10 + 1;
      } else {
        sum += tmpNum;
      }
    } else {
      sum += tmpNum;
    }
    shouldDouble = !shouldDouble;
  }
  return !!(sum % 10 === 0 ? sanitized : false);
}
module.exports = exports['default'];
},{"./util/assertString":169}],120:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isCurrency;

var _merge = require('./util/merge');

var _merge2 = _interopRequireDefault(_merge);

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function currencyRegex(options) {
  var decimal_digits = '\\d{' + options.digits_after_decimal[0] + '}';
  options.digits_after_decimal.forEach(function (digit, index) {
    if (index !== 0) decimal_digits = decimal_digits + '|\\d{' + digit + '}';
  });
  var symbol = '(\\' + options.symbol.replace(/\./g, '\\.') + ')' + (options.require_symbol ? '' : '?'),
      negative = '-?',
      whole_dollar_amount_without_sep = '[1-9]\\d*',
      whole_dollar_amount_with_sep = '[1-9]\\d{0,2}(\\' + options.thousands_separator + '\\d{3})*',
      valid_whole_dollar_amounts = ['0', whole_dollar_amount_without_sep, whole_dollar_amount_with_sep],
      whole_dollar_amount = '(' + valid_whole_dollar_amounts.join('|') + ')?',
      decimal_amount = '(\\' + options.decimal_separator + '(' + decimal_digits + '))' + (options.require_decimal ? '' : '?');
  var pattern = whole_dollar_amount + (options.allow_decimal || options.require_decimal ? decimal_amount : '');

  // default is negative sign before symbol, but there are two other options (besides parens)
  if (options.allow_negatives && !options.parens_for_negatives) {
    if (options.negative_sign_after_digits) {
      pattern += negative;
    } else if (options.negative_sign_before_digits) {
      pattern = negative + pattern;
    }
  }

  // South African Rand, for example, uses R 123 (space) and R-123 (no space)
  if (options.allow_negative_sign_placeholder) {
    pattern = '( (?!\\-))?' + pattern;
  } else if (options.allow_space_after_symbol) {
    pattern = ' ?' + pattern;
  } else if (options.allow_space_after_digits) {
    pattern += '( (?!$))?';
  }

  if (options.symbol_after_digits) {
    pattern += symbol;
  } else {
    pattern = symbol + pattern;
  }

  if (options.allow_negatives) {
    if (options.parens_for_negatives) {
      pattern = '(\\(' + pattern + '\\)|' + pattern + ')';
    } else if (!(options.negative_sign_before_digits || options.negative_sign_after_digits)) {
      pattern = negative + pattern;
    }
  }

  // ensure there's a dollar and/or decimal amount, and that
  // it doesn't start with a space or a negative sign followed by a space
  return new RegExp('^(?!-? )(?=.*\\d)' + pattern + '$');
}

var default_currency_options = {
  symbol: '$',
  require_symbol: false,
  allow_space_after_symbol: false,
  symbol_after_digits: false,
  allow_negatives: true,
  parens_for_negatives: false,
  negative_sign_before_digits: false,
  negative_sign_after_digits: false,
  allow_negative_sign_placeholder: false,
  thousands_separator: ',',
  decimal_separator: '.',
  allow_decimal: true,
  require_decimal: false,
  digits_after_decimal: [2],
  allow_space_after_digits: false
};

function isCurrency(str, options) {
  (0, _assertString2.default)(str);
  options = (0, _merge2.default)(options, default_currency_options);
  return currencyRegex(options).test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169,"./util/merge":170}],121:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isDataURI;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var dataURI = /^\s*data:([a-z]+\/[a-z0-9\-\+]+(;[a-z\-]+=[a-z0-9\-]+)?)?(;base64)?,[a-z0-9!\$&',\(\)\*\+,;=\-\._~:@\/\?%\s]*\s*$/i; // eslint-disable-line max-len

function isDataURI(str) {
  (0, _assertString2.default)(str);
  return dataURI.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],122:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isDecimal;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var decimal = /^[-+]?([0-9]+|\.[0-9]+|[0-9]+\.[0-9]+)$/;

function isDecimal(str) {
  (0, _assertString2.default)(str);
  return str !== '' && decimal.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],123:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isDivisibleBy;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _toFloat = require('./toFloat');

var _toFloat2 = _interopRequireDefault(_toFloat);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isDivisibleBy(str, num) {
  (0, _assertString2.default)(str);
  return (0, _toFloat2.default)(str) % parseInt(num, 10) === 0;
}
module.exports = exports['default'];
},{"./toFloat":165,"./util/assertString":169}],124:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isEmail;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _merge = require('./util/merge');

var _merge2 = _interopRequireDefault(_merge);

var _isByteLength = require('./isByteLength');

var _isByteLength2 = _interopRequireDefault(_isByteLength);

var _isFQDN = require('./isFQDN');

var _isFQDN2 = _interopRequireDefault(_isFQDN);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var default_email_options = {
  allow_display_name: false,
  require_display_name: false,
  allow_utf8_local_part: true,
  require_tld: true
};

/* eslint-disable max-len */
/* eslint-disable no-control-regex */
var displayName = /^[a-z\d!#\$%&'\*\+\-\/=\?\^_`{\|}~\.\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+[a-z\d!#\$%&'\*\+\-\/=\?\^_`{\|}~\,\.\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF\s]*<(.+)>$/i;
var emailUserPart = /^[a-z\d!#\$%&'\*\+\-\/=\?\^_`{\|}~]+$/i;
var quotedEmailUser = /^([\s\x01-\x08\x0b\x0c\x0e-\x1f\x7f\x21\x23-\x5b\x5d-\x7e]|(\\[\x01-\x09\x0b\x0c\x0d-\x7f]))*$/i;
var emailUserUtf8Part = /^[a-z\d!#\$%&'\*\+\-\/=\?\^_`{\|}~\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+$/i;
var quotedEmailUserUtf8 = /^([\s\x01-\x08\x0b\x0c\x0e-\x1f\x7f\x21\x23-\x5b\x5d-\x7e\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]|(\\[\x01-\x09\x0b\x0c\x0d-\x7f\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))*$/i;
/* eslint-enable max-len */
/* eslint-enable no-control-regex */

function isEmail(str, options) {
  (0, _assertString2.default)(str);
  options = (0, _merge2.default)(options, default_email_options);

  if (options.require_display_name || options.allow_display_name) {
    var display_email = str.match(displayName);
    if (display_email) {
      str = display_email[1];
    } else if (options.require_display_name) {
      return false;
    }
  }

  var parts = str.split('@');
  var domain = parts.pop();
  var user = parts.join('@');

  var lower_domain = domain.toLowerCase();
  if (lower_domain === 'gmail.com' || lower_domain === 'googlemail.com') {
    user = user.replace(/\./g, '').toLowerCase();
  }

  if (!(0, _isByteLength2.default)(user, { max: 64 }) || !(0, _isByteLength2.default)(domain, { max: 254 })) {
    return false;
  }

  if (!(0, _isFQDN2.default)(domain, { require_tld: options.require_tld })) {
    return false;
  }

  if (user[0] === '"') {
    user = user.slice(1, user.length - 1);
    return options.allow_utf8_local_part ? quotedEmailUserUtf8.test(user) : quotedEmailUser.test(user);
  }

  var pattern = options.allow_utf8_local_part ? emailUserUtf8Part : emailUserPart;

  var user_parts = user.split('.');
  for (var i = 0; i < user_parts.length; i++) {
    if (!pattern.test(user_parts[i])) {
      return false;
    }
  }

  return true;
}
module.exports = exports['default'];
},{"./isByteLength":118,"./isFQDN":126,"./util/assertString":169,"./util/merge":170}],125:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isEmpty;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isEmpty(str) {
  (0, _assertString2.default)(str);
  return str.length === 0;
}
module.exports = exports['default'];
},{"./util/assertString":169}],126:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isFDQN;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _merge = require('./util/merge');

var _merge2 = _interopRequireDefault(_merge);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var default_fqdn_options = {
  require_tld: true,
  allow_underscores: false,
  allow_trailing_dot: false
};

function isFDQN(str, options) {
  (0, _assertString2.default)(str);
  options = (0, _merge2.default)(options, default_fqdn_options);

  /* Remove the optional trailing dot before checking validity */
  if (options.allow_trailing_dot && str[str.length - 1] === '.') {
    str = str.substring(0, str.length - 1);
  }
  var parts = str.split('.');
  if (options.require_tld) {
    var tld = parts.pop();
    if (!parts.length || !/^([a-z\u00a1-\uffff]{2,}|xn[a-z0-9-]{2,})$/i.test(tld)) {
      return false;
    }
    // disallow spaces
    if (/[\s\u2002-\u200B\u202F\u205F\u3000\uFEFF\uDB40\uDC20]/.test(tld)) {
      return false;
    }
  }
  for (var part, i = 0; i < parts.length; i++) {
    part = parts[i];
    if (options.allow_underscores) {
      part = part.replace(/_/g, '');
    }
    if (!/^[a-z\u00a1-\uffff0-9-]+$/i.test(part)) {
      return false;
    }
    // disallow full-width chars
    if (/[\uff01-\uff5e]/.test(part)) {
      return false;
    }
    if (part[0] === '-' || part[part.length - 1] === '-') {
      return false;
    }
  }
  return true;
}
module.exports = exports['default'];
},{"./util/assertString":169,"./util/merge":170}],127:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isFloat;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var float = /^(?:[-+])?(?:[0-9]+)?(?:\.[0-9]*)?(?:[eE][\+\-]?(?:[0-9]+))?$/;

function isFloat(str, options) {
  (0, _assertString2.default)(str);
  options = options || {};
  if (str === '' || str === '.') {
    return false;
  }
  return float.test(str) && (!options.hasOwnProperty('min') || str >= options.min) && (!options.hasOwnProperty('max') || str <= options.max) && (!options.hasOwnProperty('lt') || str < options.lt) && (!options.hasOwnProperty('gt') || str > options.gt);
}
module.exports = exports['default'];
},{"./util/assertString":169}],128:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.fullWidth = undefined;
exports.default = isFullWidth;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var fullWidth = exports.fullWidth = /[^\u0020-\u007E\uFF61-\uFF9F\uFFA0-\uFFDC\uFFE8-\uFFEE0-9a-zA-Z]/;

function isFullWidth(str) {
  (0, _assertString2.default)(str);
  return fullWidth.test(str);
}
},{"./util/assertString":169}],129:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.halfWidth = undefined;
exports.default = isHalfWidth;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var halfWidth = exports.halfWidth = /[\u0020-\u007E\uFF61-\uFF9F\uFFA0-\uFFDC\uFFE8-\uFFEE0-9a-zA-Z]/;

function isHalfWidth(str) {
  (0, _assertString2.default)(str);
  return halfWidth.test(str);
}
},{"./util/assertString":169}],130:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isHash;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var lengths = {
  md5: 32,
  md4: 32,
  sha1: 40,
  sha256: 64,
  sha384: 96,
  sha512: 128,
  ripemd128: 32,
  ripemd160: 40,
  tiger128: 32,
  tiger160: 40,
  tiger192: 48,
  crc32: 8,
  crc32b: 8
};

function isHash(str, algorithm) {
  (0, _assertString2.default)(str);
  var hash = new RegExp('^[a-f0-9]{' + lengths[algorithm] + '}$');
  return hash.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],131:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isHexColor;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var hexcolor = /^#?([0-9A-F]{3}|[0-9A-F]{6})$/i;

function isHexColor(str) {
  (0, _assertString2.default)(str);
  return hexcolor.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],132:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isHexadecimal;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var hexadecimal = /^[0-9A-F]+$/i;

function isHexadecimal(str) {
  (0, _assertString2.default)(str);
  return hexadecimal.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],133:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isIP;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ipv4Maybe = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
var ipv6Block = /^[0-9A-F]{1,4}$/i;

function isIP(str) {
  var version = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

  (0, _assertString2.default)(str);
  version = String(version);
  if (!version) {
    return isIP(str, 4) || isIP(str, 6);
  } else if (version === '4') {
    if (!ipv4Maybe.test(str)) {
      return false;
    }
    var parts = str.split('.').sort(function (a, b) {
      return a - b;
    });
    return parts[3] <= 255;
  } else if (version === '6') {
    var blocks = str.split(':');
    var foundOmissionBlock = false; // marker to indicate ::

    // At least some OS accept the last 32 bits of an IPv6 address
    // (i.e. 2 of the blocks) in IPv4 notation, and RFC 3493 says
    // that '::ffff:a.b.c.d' is valid for IPv4-mapped IPv6 addresses,
    // and '::a.b.c.d' is deprecated, but also valid.
    var foundIPv4TransitionBlock = isIP(blocks[blocks.length - 1], 4);
    var expectedNumberOfBlocks = foundIPv4TransitionBlock ? 7 : 8;

    if (blocks.length > expectedNumberOfBlocks) {
      return false;
    }
    // initial or final ::
    if (str === '::') {
      return true;
    } else if (str.substr(0, 2) === '::') {
      blocks.shift();
      blocks.shift();
      foundOmissionBlock = true;
    } else if (str.substr(str.length - 2) === '::') {
      blocks.pop();
      blocks.pop();
      foundOmissionBlock = true;
    }

    for (var i = 0; i < blocks.length; ++i) {
      // test for a :: which can not be at the string start/end
      // since those cases have been handled above
      if (blocks[i] === '' && i > 0 && i < blocks.length - 1) {
        if (foundOmissionBlock) {
          return false; // multiple :: in address
        }
        foundOmissionBlock = true;
      } else if (foundIPv4TransitionBlock && i === blocks.length - 1) {
        // it has been checked before that the last
        // block is a valid IPv4 address
      } else if (!ipv6Block.test(blocks[i])) {
        return false;
      }
    }
    if (foundOmissionBlock) {
      return blocks.length >= 1;
    }
    return blocks.length === expectedNumberOfBlocks;
  }
  return false;
}
module.exports = exports['default'];
},{"./util/assertString":169}],134:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isISBN;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var isbn10Maybe = /^(?:[0-9]{9}X|[0-9]{10})$/;
var isbn13Maybe = /^(?:[0-9]{13})$/;
var factor = [1, 3];

function isISBN(str) {
  var version = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

  (0, _assertString2.default)(str);
  version = String(version);
  if (!version) {
    return isISBN(str, 10) || isISBN(str, 13);
  }
  var sanitized = str.replace(/[\s-]+/g, '');
  var checksum = 0;
  var i = void 0;
  if (version === '10') {
    if (!isbn10Maybe.test(sanitized)) {
      return false;
    }
    for (i = 0; i < 9; i++) {
      checksum += (i + 1) * sanitized.charAt(i);
    }
    if (sanitized.charAt(9) === 'X') {
      checksum += 10 * 10;
    } else {
      checksum += 10 * sanitized.charAt(9);
    }
    if (checksum % 11 === 0) {
      return !!sanitized;
    }
  } else if (version === '13') {
    if (!isbn13Maybe.test(sanitized)) {
      return false;
    }
    for (i = 0; i < 12; i++) {
      checksum += factor[i % 2] * sanitized.charAt(i);
    }
    if (sanitized.charAt(12) - (10 - checksum % 10) % 10 === 0) {
      return !!sanitized;
    }
  }
  return false;
}
module.exports = exports['default'];
},{"./util/assertString":169}],135:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isISIN;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var isin = /^[A-Z]{2}[0-9A-Z]{9}[0-9]$/;

function isISIN(str) {
  (0, _assertString2.default)(str);
  if (!isin.test(str)) {
    return false;
  }

  var checksumStr = str.replace(/[A-Z]/g, function (character) {
    return parseInt(character, 36);
  });

  var sum = 0;
  var digit = void 0;
  var tmpNum = void 0;
  var shouldDouble = true;
  for (var i = checksumStr.length - 2; i >= 0; i--) {
    digit = checksumStr.substring(i, i + 1);
    tmpNum = parseInt(digit, 10);
    if (shouldDouble) {
      tmpNum *= 2;
      if (tmpNum >= 10) {
        sum += tmpNum + 1;
      } else {
        sum += tmpNum;
      }
    } else {
      sum += tmpNum;
    }
    shouldDouble = !shouldDouble;
  }

  return parseInt(str.substr(str.length - 1), 10) === (10000 - sum) % 10;
}
module.exports = exports['default'];
},{"./util/assertString":169}],136:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isISO8601;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable max-len */
// from http://goo.gl/0ejHHW
var iso8601 = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;
/* eslint-enable max-len */

function isISO8601(str) {
  (0, _assertString2.default)(str);
  return iso8601.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],137:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isISRC;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// see http://isrc.ifpi.org/en/isrc-standard/code-syntax
var isrc = /^[A-Z]{2}[0-9A-Z]{3}\d{2}\d{5}$/;

function isISRC(str) {
  (0, _assertString2.default)(str);
  return isrc.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],138:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isISSN;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var issn = '^\\d{4}-?\\d{3}[\\dX]$';

function isISSN(str) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  (0, _assertString2.default)(str);
  var testIssn = issn;
  testIssn = options.require_hyphen ? testIssn.replace('?', '') : testIssn;
  testIssn = options.case_sensitive ? new RegExp(testIssn) : new RegExp(testIssn, 'i');
  if (!testIssn.test(str)) {
    return false;
  }
  var issnDigits = str.replace('-', '');
  var position = 8;
  var checksum = 0;
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = issnDigits[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var digit = _step.value;

      var digitValue = digit.toUpperCase() === 'X' ? 10 : +digit;
      checksum += digitValue * position;
      --position;
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  return checksum % 11 === 0;
}
module.exports = exports['default'];
},{"./util/assertString":169}],139:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.default = isIn;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _toString = require('./util/toString');

var _toString2 = _interopRequireDefault(_toString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isIn(str, options) {
  (0, _assertString2.default)(str);
  var i = void 0;
  if (Object.prototype.toString.call(options) === '[object Array]') {
    var array = [];
    for (i in options) {
      if ({}.hasOwnProperty.call(options, i)) {
        array[i] = (0, _toString2.default)(options[i]);
      }
    }
    return array.indexOf(str) >= 0;
  } else if ((typeof options === 'undefined' ? 'undefined' : _typeof(options)) === 'object') {
    return options.hasOwnProperty(str);
  } else if (options && typeof options.indexOf === 'function') {
    return options.indexOf(str) >= 0;
  }
  return false;
}
module.exports = exports['default'];
},{"./util/assertString":169,"./util/toString":171}],140:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isInt;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var int = /^(?:[-+]?(?:0|[1-9][0-9]*))$/;
var intLeadingZeroes = /^[-+]?[0-9]+$/;

function isInt(str, options) {
  (0, _assertString2.default)(str);
  options = options || {};

  // Get the regex to use for testing, based on whether
  // leading zeroes are allowed or not.
  var regex = options.hasOwnProperty('allow_leading_zeroes') && !options.allow_leading_zeroes ? int : intLeadingZeroes;

  // Check min/max/lt/gt
  var minCheckPassed = !options.hasOwnProperty('min') || str >= options.min;
  var maxCheckPassed = !options.hasOwnProperty('max') || str <= options.max;
  var ltCheckPassed = !options.hasOwnProperty('lt') || str < options.lt;
  var gtCheckPassed = !options.hasOwnProperty('gt') || str > options.gt;

  return regex.test(str) && minCheckPassed && maxCheckPassed && ltCheckPassed && gtCheckPassed;
}
module.exports = exports['default'];
},{"./util/assertString":169}],141:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.default = isJSON;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isJSON(str) {
  (0, _assertString2.default)(str);
  try {
    var obj = JSON.parse(str);
    return !!obj && (typeof obj === 'undefined' ? 'undefined' : _typeof(obj)) === 'object';
  } catch (e) {/* ignore */}
  return false;
}
module.exports = exports['default'];
},{"./util/assertString":169}],142:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (str) {
  (0, _assertString2.default)(str);
  if (!str.includes(',')) return false;
  var pair = str.split(',');
  return lat.test(pair[0]) && long.test(pair[1]);
};

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var lat = /^\(?[+-]?(90(\.0+)?|[1-8]?\d(\.\d+)?)$/;
var long = /^\s?[+-]?(180(\.0+)?|1[0-7]\d(\.\d+)?|\d{1,2}(\.\d+)?)\)?$/;

module.exports = exports['default'];
},{"./util/assertString":169}],143:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.default = isLength;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable prefer-rest-params */
function isLength(str, options) {
  (0, _assertString2.default)(str);
  var min = void 0;
  var max = void 0;
  if ((typeof options === 'undefined' ? 'undefined' : _typeof(options)) === 'object') {
    min = options.min || 0;
    max = options.max;
  } else {
    // backwards compatibility: isLength(str, min [, max])
    min = arguments[1];
    max = arguments[2];
  }
  var surrogatePairs = str.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || [];
  var len = str.length - surrogatePairs.length;
  return len >= min && (typeof max === 'undefined' || len <= max);
}
module.exports = exports['default'];
},{"./util/assertString":169}],144:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isLowercase;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isLowercase(str) {
  (0, _assertString2.default)(str);
  return str === str.toLowerCase();
}
module.exports = exports['default'];
},{"./util/assertString":169}],145:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isMACAddress;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var macAddress = /^([0-9a-fA-F][0-9a-fA-F]:){5}([0-9a-fA-F][0-9a-fA-F])$/;

function isMACAddress(str) {
  (0, _assertString2.default)(str);
  return macAddress.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],146:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isMD5;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var md5 = /^[a-f0-9]{32}$/;

function isMD5(str) {
  (0, _assertString2.default)(str);
  return md5.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],147:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isMobilePhone;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable max-len */
var phones = {
  'ar-AE': /^((\+?971)|0)?5[024568]\d{7}$/,
  'ar-DZ': /^(\+?213|0)(5|6|7)\d{8}$/,
  'ar-EG': /^((\+?20)|0)?1[012]\d{8}$/,
  'ar-JO': /^(\+?962|0)?7[789]\d{7}$/,
  'ar-SY': /^(!?(\+?963)|0)?9\d{8}$/,
  'ar-SA': /^(!?(\+?966)|0)?5\d{8}$/,
  'en-US': /^(\+?1)?[2-9]\d{2}[2-9](?!11)\d{6}$/,
  'cs-CZ': /^(\+?420)? ?[1-9][0-9]{2} ?[0-9]{3} ?[0-9]{3}$/,
  'sk-SK': /^(\+?421)? ?[1-9][0-9]{2} ?[0-9]{3} ?[0-9]{3}$/,
  'de-DE': /^(\+?49[ \.\-])?([\(]{1}[0-9]{1,6}[\)])?([0-9 \.\-\/]{3,20})((x|ext|extension)[ ]?[0-9]{1,4})?$/,
  'da-DK': /^(\+?45)?(\d{8})$/,
  'el-GR': /^(\+?30)?(69\d{8})$/,
  'en-AU': /^(\+?61|0)4\d{8}$/,
  'en-GB': /^(\+?44|0)7\d{9}$/,
  'en-HK': /^(\+?852\-?)?[569]\d{3}\-?\d{4}$/,
  'en-IN': /^(\+?91|0)?[789]\d{9}$/,
  'en-KE': /^(\+?254|0)?[7]\d{8}$/,
  'en-NG': /^(\+?234|0)?[789]\d{9}$/,
  'en-NZ': /^(\+?64|0)2\d{7,9}$/,
  'en-UG': /^(\+?256|0)?[7]\d{8}$/,
  'en-RW': /^(\+?250|0)?[7]\d{8}$/,
  'en-TZ': /^(\+?255|0)?[67]\d{8}$/,
  'en-ZA': /^(\+?27|0)\d{9}$/,
  'en-ZM': /^(\+?26)?09[567]\d{7}$/,
  'es-ES': /^(\+?34)?(6\d{1}|7[1234])\d{7}$/,
  'fi-FI': /^(\+?358|0)\s?(4(0|1|2|4|5|6)?|50)\s?(\d\s?){4,8}\d$/,
  'fa-IR': /^(\+?98[\-\s]?|0)9[0-39]\d[\-\s]?\d{3}[\-\s]?\d{4}$/,
  'fr-FR': /^(\+?33|0)[67]\d{8}$/,
  'he-IL': /^(\+972|0)([23489]|5[0248]|77)[1-9]\d{6}/,
  'hu-HU': /^(\+?36)(20|30|70)\d{7}$/,
  'lt-LT': /^(\+370|8)\d{8}$/,
  'id-ID': /^(\+?62|0[1-9])[\s|\d]+$/,
  'it-IT': /^(\+?39)?\s?3\d{2} ?\d{6,7}$/,
  'ko-KR': /^((\+?82)[ \-]?)?0?1([0|1|6|7|8|9]{1})[ \-]?\d{3,4}[ \-]?\d{4}$/,
  'ja-JP': /^(\+?81|0)\d{1,4}[ \-]?\d{1,4}[ \-]?\d{4}$/,
  'ms-MY': /^(\+?6?01){1}(([145]{1}(\-|\s)?\d{7,8})|([236789]{1}(\s|\-)?\d{7}))$/,
  'nb-NO': /^(\+?47)?[49]\d{7}$/,
  'nl-BE': /^(\+?32|0)4?\d{8}$/,
  'nn-NO': /^(\+?47)?[49]\d{7}$/,
  'pl-PL': /^(\+?48)? ?[5-8]\d ?\d{3} ?\d{2} ?\d{2}$/,
  'pt-BR': /^(\+?55|0)\-?[1-9]{2}\-?[2-9]{1}\d{3,4}\-?\d{4}$/,
  'pt-PT': /^(\+?351)?9[1236]\d{7}$/,
  'ro-RO': /^(\+?4?0)\s?7\d{2}(\/|\s|\.|\-)?\d{3}(\s|\.|\-)?\d{3}$/,
  'en-PK': /^((\+92)|(0092))-{0,1}\d{3}-{0,1}\d{7}$|^\d{11}$|^\d{4}-\d{7}$/,
  'ru-RU': /^(\+?7|8)?9\d{9}$/,
  'sr-RS': /^(\+3816|06)[- \d]{5,9}$/,
  'tr-TR': /^(\+?90|0)?5\d{9}$/,
  'vi-VN': /^(\+?84|0)?((1(2([0-9])|6([2-9])|88|99))|(9((?!5)[0-9])))([0-9]{7})$/,
  'zh-CN': /^(\+?0?86\-?)?1[345789]\d{9}$/,
  'zh-TW': /^(\+?886\-?|0)?9\d{8}$/
};
/* eslint-enable max-len */

// aliases
phones['en-CA'] = phones['en-US'];
phones['fr-BE'] = phones['nl-BE'];
phones['zh-HK'] = phones['en-HK'];

function isMobilePhone(str, locale) {
  (0, _assertString2.default)(str);
  if (locale in phones) {
    return phones[locale].test(str);
  } else if (locale === 'any') {
    for (var key in phones) {
      if (phones.hasOwnProperty(key)) {
        var phone = phones[key];
        if (phone.test(str)) {
          return true;
        }
      }
    }
    return false;
  }
  throw new Error('Invalid locale \'' + locale + '\'');
}
module.exports = exports['default'];
},{"./util/assertString":169}],148:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isMongoId;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _isHexadecimal = require('./isHexadecimal');

var _isHexadecimal2 = _interopRequireDefault(_isHexadecimal);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isMongoId(str) {
  (0, _assertString2.default)(str);
  return (0, _isHexadecimal2.default)(str) && str.length === 24;
}
module.exports = exports['default'];
},{"./isHexadecimal":132,"./util/assertString":169}],149:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isMultibyte;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable no-control-regex */
var multibyte = /[^\x00-\x7F]/;
/* eslint-enable no-control-regex */

function isMultibyte(str) {
  (0, _assertString2.default)(str);
  return multibyte.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],150:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isNumeric;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var numeric = /^[-+]?[0-9]+$/;

function isNumeric(str) {
  (0, _assertString2.default)(str);
  return numeric.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],151:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.locales = undefined;

exports.default = function (str, locale) {
  (0, _assertString2.default)(str);
  if (locale in patterns) {
    return patterns[locale].test(str);
  } else if (locale === 'any') {
    for (var key in patterns) {
      if (patterns.hasOwnProperty(key)) {
        var pattern = patterns[key];
        if (pattern.test(str)) {
          return true;
        }
      }
    }
    return false;
  }
  throw new Error('Invalid locale \'' + locale + '\'');
};

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// common patterns
var threeDigit = /^\d{3}$/;
var fourDigit = /^\d{4}$/;
var fiveDigit = /^\d{5}$/;
var sixDigit = /^\d{6}$/;

var patterns = {
  AT: fourDigit,
  AU: sixDigit,
  BE: fourDigit,
  CA: /^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][\s\-]?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
  CH: fourDigit,
  CZ: /^\d{3}\s?\d{2}$/,
  DE: fiveDigit,
  DK: fourDigit,
  DZ: fiveDigit,
  ES: fiveDigit,
  FI: fiveDigit,
  FR: /^\d{2}\s?\d{3}$/,
  GB: /^(gir\s?0aa|[a-z]{1,2}\d[\da-z]?\s?(\d[a-z]{2})?)$/i,
  GR: /^\d{3}\s?\d{2}$/,
  IL: fiveDigit,
  IN: sixDigit,
  IS: threeDigit,
  IT: fiveDigit,
  JP: /^\d{3}\-\d{4}$/,
  KE: fiveDigit,
  LI: /^(948[5-9]|949[0-7])$/,
  MX: fiveDigit,
  NL: /^\d{4}\s?[a-z]{2}$/i,
  NO: fourDigit,
  PL: /^\d{2}\-\d{3}$/,
  PT: /^\d{4}(\-\d{3})?$/,
  RO: sixDigit,
  RU: sixDigit,
  SA: fiveDigit,
  SE: /^\d{3}\s?\d{2}$/,
  TW: /^\d{3}(\d{2})?$/,
  US: /^\d{5}(-\d{4})?$/,
  ZA: fourDigit,
  ZM: fiveDigit
};

var locales = exports.locales = Object.keys(patterns);
},{"./util/assertString":169}],152:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isSurrogatePair;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var surrogatePair = /[\uD800-\uDBFF][\uDC00-\uDFFF]/;

function isSurrogatePair(str) {
  (0, _assertString2.default)(str);
  return surrogatePair.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],153:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isURL;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _isFQDN = require('./isFQDN');

var _isFQDN2 = _interopRequireDefault(_isFQDN);

var _isIP = require('./isIP');

var _isIP2 = _interopRequireDefault(_isIP);

var _merge = require('./util/merge');

var _merge2 = _interopRequireDefault(_merge);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var default_url_options = {
  protocols: ['http', 'https', 'ftp'],
  require_tld: true,
  require_protocol: false,
  require_host: true,
  require_valid_protocol: true,
  allow_underscores: false,
  allow_trailing_dot: false,
  allow_protocol_relative_urls: false
};

var wrapped_ipv6 = /^\[([^\]]+)\](?::([0-9]+))?$/;

function isRegExp(obj) {
  return Object.prototype.toString.call(obj) === '[object RegExp]';
}

function checkHost(host, matches) {
  for (var i = 0; i < matches.length; i++) {
    var match = matches[i];
    if (host === match || isRegExp(match) && match.test(host)) {
      return true;
    }
  }
  return false;
}

function isURL(url, options) {
  (0, _assertString2.default)(url);
  if (!url || url.length >= 2083 || /[\s<>]/.test(url)) {
    return false;
  }
  if (url.indexOf('mailto:') === 0) {
    return false;
  }
  options = (0, _merge2.default)(options, default_url_options);
  var protocol = void 0,
      auth = void 0,
      host = void 0,
      hostname = void 0,
      port = void 0,
      port_str = void 0,
      split = void 0,
      ipv6 = void 0;

  split = url.split('#');
  url = split.shift();

  split = url.split('?');
  url = split.shift();

  split = url.split('://');
  if (split.length > 1) {
    protocol = split.shift();
    if (options.require_valid_protocol && options.protocols.indexOf(protocol) === -1) {
      return false;
    }
  } else if (options.require_protocol) {
    return false;
  } else if (options.allow_protocol_relative_urls && url.substr(0, 2) === '//') {
    split[0] = url.substr(2);
  }
  url = split.join('://');

  if (url === '') {
    return false;
  }

  split = url.split('/');
  url = split.shift();

  if (url === '' && !options.require_host) {
    return true;
  }

  split = url.split('@');
  if (split.length > 1) {
    auth = split.shift();
    if (auth.indexOf(':') >= 0 && auth.split(':').length > 2) {
      return false;
    }
  }
  hostname = split.join('@');

  port_str = null;
  ipv6 = null;
  var ipv6_match = hostname.match(wrapped_ipv6);
  if (ipv6_match) {
    host = '';
    ipv6 = ipv6_match[1];
    port_str = ipv6_match[2] || null;
  } else {
    split = hostname.split(':');
    host = split.shift();
    if (split.length) {
      port_str = split.join(':');
    }
  }

  if (port_str !== null) {
    port = parseInt(port_str, 10);
    if (!/^[0-9]+$/.test(port_str) || port <= 0 || port > 65535) {
      return false;
    }
  }

  if (!(0, _isIP2.default)(host) && !(0, _isFQDN2.default)(host, options) && (!ipv6 || !(0, _isIP2.default)(ipv6, 6))) {
    return false;
  }

  host = host || ipv6;

  if (options.host_whitelist && !checkHost(host, options.host_whitelist)) {
    return false;
  }
  if (options.host_blacklist && checkHost(host, options.host_blacklist)) {
    return false;
  }

  return true;
}
module.exports = exports['default'];
},{"./isFQDN":126,"./isIP":133,"./util/assertString":169,"./util/merge":170}],154:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isUUID;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var uuid = {
  3: /^[0-9A-F]{8}-[0-9A-F]{4}-3[0-9A-F]{3}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
  4: /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
  5: /^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
  all: /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i
};

function isUUID(str) {
  var version = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'all';

  (0, _assertString2.default)(str);
  var pattern = uuid[version];
  return pattern && pattern.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],155:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isUppercase;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isUppercase(str) {
  (0, _assertString2.default)(str);
  return str === str.toUpperCase();
}
module.exports = exports['default'];
},{"./util/assertString":169}],156:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isVariableWidth;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _isFullWidth = require('./isFullWidth');

var _isHalfWidth = require('./isHalfWidth');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isVariableWidth(str) {
  (0, _assertString2.default)(str);
  return _isFullWidth.fullWidth.test(str) && _isHalfWidth.halfWidth.test(str);
}
module.exports = exports['default'];
},{"./isFullWidth":128,"./isHalfWidth":129,"./util/assertString":169}],157:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isWhitelisted;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isWhitelisted(str, chars) {
  (0, _assertString2.default)(str);
  for (var i = str.length - 1; i >= 0; i--) {
    if (chars.indexOf(str[i]) === -1) {
      return false;
    }
  }
  return true;
}
module.exports = exports['default'];
},{"./util/assertString":169}],158:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = ltrim;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ltrim(str, chars) {
  (0, _assertString2.default)(str);
  var pattern = chars ? new RegExp('^[' + chars + ']+', 'g') : /^\s+/g;
  return str.replace(pattern, '');
}
module.exports = exports['default'];
},{"./util/assertString":169}],159:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = matches;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function matches(str, pattern, modifiers) {
  (0, _assertString2.default)(str);
  if (Object.prototype.toString.call(pattern) !== '[object RegExp]') {
    pattern = new RegExp(pattern, modifiers);
  }
  return pattern.test(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],160:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = normalizeEmail;

var _isEmail = require('./isEmail');

var _isEmail2 = _interopRequireDefault(_isEmail);

var _merge = require('./util/merge');

var _merge2 = _interopRequireDefault(_merge);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var default_normalize_email_options = {
  // The following options apply to all email addresses
  // Lowercases the local part of the email address.
  // Please note this may violate RFC 5321 as per http://stackoverflow.com/a/9808332/192024).
  // The domain is always lowercased, as per RFC 1035
  all_lowercase: true,

  // The following conversions are specific to GMail
  // Lowercases the local part of the GMail address (known to be case-insensitive)
  gmail_lowercase: true,
  // Removes dots from the local part of the email address, as that's ignored by GMail
  gmail_remove_dots: true,
  // Removes the subaddress (e.g. "+foo") from the email address
  gmail_remove_subaddress: true,
  // Conversts the googlemail.com domain to gmail.com
  gmail_convert_googlemaildotcom: true,

  // The following conversions are specific to Outlook.com / Windows Live / Hotmail
  // Lowercases the local part of the Outlook.com address (known to be case-insensitive)
  outlookdotcom_lowercase: true,
  // Removes the subaddress (e.g. "+foo") from the email address
  outlookdotcom_remove_subaddress: true,

  // The following conversions are specific to Yahoo
  // Lowercases the local part of the Yahoo address (known to be case-insensitive)
  yahoo_lowercase: true,
  // Removes the subaddress (e.g. "-foo") from the email address
  yahoo_remove_subaddress: true,

  // The following conversions are specific to iCloud
  // Lowercases the local part of the iCloud address (known to be case-insensitive)
  icloud_lowercase: true,
  // Removes the subaddress (e.g. "+foo") from the email address
  icloud_remove_subaddress: true
};

// List of domains used by iCloud
var icloud_domains = ['icloud.com', 'me.com'];

// List of domains used by Outlook.com and its predecessors
// This list is likely incomplete.
// Partial reference:
// https://blogs.office.com/2013/04/17/outlook-com-gets-two-step-verification-sign-in-by-alias-and-new-international-domains/
var outlookdotcom_domains = ['hotmail.at', 'hotmail.be', 'hotmail.ca', 'hotmail.cl', 'hotmail.co.il', 'hotmail.co.nz', 'hotmail.co.th', 'hotmail.co.uk', 'hotmail.com', 'hotmail.com.ar', 'hotmail.com.au', 'hotmail.com.br', 'hotmail.com.gr', 'hotmail.com.mx', 'hotmail.com.pe', 'hotmail.com.tr', 'hotmail.com.vn', 'hotmail.cz', 'hotmail.de', 'hotmail.dk', 'hotmail.es', 'hotmail.fr', 'hotmail.hu', 'hotmail.id', 'hotmail.ie', 'hotmail.in', 'hotmail.it', 'hotmail.jp', 'hotmail.kr', 'hotmail.lv', 'hotmail.my', 'hotmail.ph', 'hotmail.pt', 'hotmail.sa', 'hotmail.sg', 'hotmail.sk', 'live.be', 'live.co.uk', 'live.com', 'live.com.ar', 'live.com.mx', 'live.de', 'live.es', 'live.eu', 'live.fr', 'live.it', 'live.nl', 'msn.com', 'outlook.at', 'outlook.be', 'outlook.cl', 'outlook.co.il', 'outlook.co.nz', 'outlook.co.th', 'outlook.com', 'outlook.com.ar', 'outlook.com.au', 'outlook.com.br', 'outlook.com.gr', 'outlook.com.pe', 'outlook.com.tr', 'outlook.com.vn', 'outlook.cz', 'outlook.de', 'outlook.dk', 'outlook.es', 'outlook.fr', 'outlook.hu', 'outlook.id', 'outlook.ie', 'outlook.in', 'outlook.it', 'outlook.jp', 'outlook.kr', 'outlook.lv', 'outlook.my', 'outlook.ph', 'outlook.pt', 'outlook.sa', 'outlook.sg', 'outlook.sk', 'passport.com'];

// List of domains used by Yahoo Mail
// This list is likely incomplete
var yahoo_domains = ['rocketmail.com', 'yahoo.ca', 'yahoo.co.uk', 'yahoo.com', 'yahoo.de', 'yahoo.fr', 'yahoo.in', 'yahoo.it', 'ymail.com'];

function normalizeEmail(email, options) {
  options = (0, _merge2.default)(options, default_normalize_email_options);

  if (!(0, _isEmail2.default)(email)) {
    return false;
  }

  var raw_parts = email.split('@');
  var domain = raw_parts.pop();
  var user = raw_parts.join('@');
  var parts = [user, domain];

  // The domain is always lowercased, as it's case-insensitive per RFC 1035
  parts[1] = parts[1].toLowerCase();

  if (parts[1] === 'gmail.com' || parts[1] === 'googlemail.com') {
    // Address is GMail
    if (options.gmail_remove_subaddress) {
      parts[0] = parts[0].split('+')[0];
    }
    if (options.gmail_remove_dots) {
      parts[0] = parts[0].replace(/\./g, '');
    }
    if (!parts[0].length) {
      return false;
    }
    if (options.all_lowercase || options.gmail_lowercase) {
      parts[0] = parts[0].toLowerCase();
    }
    parts[1] = options.gmail_convert_googlemaildotcom ? 'gmail.com' : parts[1];
  } else if (~icloud_domains.indexOf(parts[1])) {
    // Address is iCloud
    if (options.icloud_remove_subaddress) {
      parts[0] = parts[0].split('+')[0];
    }
    if (!parts[0].length) {
      return false;
    }
    if (options.all_lowercase || options.icloud_lowercase) {
      parts[0] = parts[0].toLowerCase();
    }
  } else if (~outlookdotcom_domains.indexOf(parts[1])) {
    // Address is Outlook.com
    if (options.outlookdotcom_remove_subaddress) {
      parts[0] = parts[0].split('+')[0];
    }
    if (!parts[0].length) {
      return false;
    }
    if (options.all_lowercase || options.outlookdotcom_lowercase) {
      parts[0] = parts[0].toLowerCase();
    }
  } else if (~yahoo_domains.indexOf(parts[1])) {
    // Address is Yahoo
    if (options.yahoo_remove_subaddress) {
      var components = parts[0].split('-');
      parts[0] = components.length > 1 ? components.slice(0, -1).join('-') : components[0];
    }
    if (!parts[0].length) {
      return false;
    }
    if (options.all_lowercase || options.yahoo_lowercase) {
      parts[0] = parts[0].toLowerCase();
    }
  } else if (options.all_lowercase) {
    // Any other address
    parts[0] = parts[0].toLowerCase();
  }
  return parts.join('@');
}
module.exports = exports['default'];
},{"./isEmail":124,"./util/merge":170}],161:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = rtrim;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function rtrim(str, chars) {
  (0, _assertString2.default)(str);
  var pattern = chars ? new RegExp('[' + chars + ']') : /\s/;

  var idx = str.length - 1;
  while (idx >= 0 && pattern.test(str[idx])) {
    idx--;
  }

  return idx < str.length ? str.substr(0, idx + 1) : str;
}
module.exports = exports['default'];
},{"./util/assertString":169}],162:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = stripLow;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

var _blacklist = require('./blacklist');

var _blacklist2 = _interopRequireDefault(_blacklist);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function stripLow(str, keep_new_lines) {
  (0, _assertString2.default)(str);
  var chars = keep_new_lines ? '\\x00-\\x09\\x0B\\x0C\\x0E-\\x1F\\x7F' : '\\x00-\\x1F\\x7F';
  return (0, _blacklist2.default)(str, chars);
}
module.exports = exports['default'];
},{"./blacklist":107,"./util/assertString":169}],163:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = toBoolean;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function toBoolean(str, strict) {
  (0, _assertString2.default)(str);
  if (strict) {
    return str === '1' || str === 'true';
  }
  return str !== '0' && str !== 'false' && str !== '';
}
module.exports = exports['default'];
},{"./util/assertString":169}],164:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = toDate;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function toDate(date) {
  (0, _assertString2.default)(date);
  date = Date.parse(date);
  return !isNaN(date) ? new Date(date) : null;
}
module.exports = exports['default'];
},{"./util/assertString":169}],165:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = toFloat;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function toFloat(str) {
  (0, _assertString2.default)(str);
  return parseFloat(str);
}
module.exports = exports['default'];
},{"./util/assertString":169}],166:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = toInt;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function toInt(str, radix) {
  (0, _assertString2.default)(str);
  return parseInt(str, radix || 10);
}
module.exports = exports['default'];
},{"./util/assertString":169}],167:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = trim;

var _rtrim = require('./rtrim');

var _rtrim2 = _interopRequireDefault(_rtrim);

var _ltrim = require('./ltrim');

var _ltrim2 = _interopRequireDefault(_ltrim);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function trim(str, chars) {
  return (0, _rtrim2.default)((0, _ltrim2.default)(str, chars), chars);
}
module.exports = exports['default'];
},{"./ltrim":158,"./rtrim":161}],168:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = unescape;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function unescape(str) {
  (0, _assertString2.default)(str);
  return str.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2F;/g, '/').replace(/&#x5C;/g, '\\').replace(/&#96;/g, '`');
}
module.exports = exports['default'];
},{"./util/assertString":169}],169:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = assertString;
function assertString(input) {
  var isString = typeof input === 'string' || input instanceof String;

  if (!isString) {
    throw new TypeError('This library (validator.js) validates strings only');
  }
}
module.exports = exports['default'];
},{}],170:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = merge;
function merge() {
  var obj = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
  var defaults = arguments[1];

  for (var key in defaults) {
    if (typeof obj[key] === 'undefined') {
      obj[key] = defaults[key];
    }
  }
  return obj;
}
module.exports = exports['default'];
},{}],171:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.default = toString;
function toString(input) {
  if ((typeof input === 'undefined' ? 'undefined' : _typeof(input)) === 'object' && input !== null) {
    if (typeof input.toString === 'function') {
      input = input.toString();
    } else {
      input = '[object Object]';
    }
  } else if (input === null || typeof input === 'undefined' || isNaN(input) && !input.length) {
    input = '';
  }
  return String(input);
}
module.exports = exports['default'];
},{}],172:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = whitelist;

var _assertString = require('./util/assertString');

var _assertString2 = _interopRequireDefault(_assertString);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function whitelist(str, chars) {
  (0, _assertString2.default)(str);
  return str.replace(new RegExp('[^' + chars + ']+', 'g'), '');
}
module.exports = exports['default'];
},{"./util/assertString":169}],173:[function(require,module,exports){
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

},{}],174:[function(require,module,exports){
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


},{}],175:[function(require,module,exports){
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
},{}],176:[function(require,module,exports){
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

},{}],177:[function(require,module,exports){
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
},{}],178:[function(require,module,exports){
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


},{}],179:[function(require,module,exports){
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
},{}],180:[function(require,module,exports){
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

},{}],181:[function(require,module,exports){
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

},{}],182:[function(require,module,exports){
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

},{}],183:[function(require,module,exports){
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
},{}],184:[function(require,module,exports){
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
      "pattern": "^[^{}/ :\\\\]+(?::\\d+)?$",
      "description": "The host (name or ip) of the API. Example: 'swagger.io'"
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
          "description": "A longer description of the API. Should be different from the title.  GitHub Flavored Markdown is allowed."
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
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
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
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
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
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "examples": {
      "type": "object",
      "additionalProperties": true
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
          "description": "A longer description of the operation, GitHub Flavored Markdown is allowed."
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "operationId": {
          "type": "string",
          "description": "A unique identifier of the operation."
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
          "oneOf": [
            {
              "$ref": "#/definitions/schema"
            },
            {
              "$ref": "#/definitions/fileSchema"
            }
          ]
        },
        "headers": {
          "$ref": "#/definitions/headers"
        },
        "examples": {
          "$ref": "#/definitions/examples"
        }
      },
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
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
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
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
          "description": "A brief description of the parameter. This could contain examples of use.  GitHub Flavored Markdown is allowed."
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
          "description": "A brief description of the parameter. This could contain examples of use.  GitHub Flavored Markdown is allowed."
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
          "description": "A brief description of the parameter. This could contain examples of use.  GitHub Flavored Markdown is allowed."
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
          "description": "A brief description of the parameter. This could contain examples of use.  GitHub Flavored Markdown is allowed."
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
      "required": [
        "required"
      ],
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
          "description": "A brief description of the parameter. This could contain examples of use.  GitHub Flavored Markdown is allowed."
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
          "anyOf": [
            {
              "$ref": "#/definitions/schema"
            },
            {
              "type": "boolean"
            }
          ],
          "default": {}
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
    "fileSchema": {
      "type": "object",
      "description": "A deterministic version of a JSON Schema object.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "required": [
        "type"
      ],
      "properties": {
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
        "required": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/stringArray"
        },
        "type": {
          "type": "string",
          "enum": [
            "file"
          ]
        },
        "readOnly": {
          "type": "boolean",
          "default": false
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
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
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
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
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
      "required": [
        "$ref"
      ],
      "additionalProperties": false,
      "properties": {
        "$ref": {
          "type": "string"
        }
      }
    }
  }
}
},{}],185:[function(require,module,exports){
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

},{}]},{},[2])(2)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvaGVscGVycy5qcyIsImxpYi9zcGVjcy5qcyIsImxpYi92YWxpZGF0b3JzLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvYXJyYXkvZGlmZmVyZW5jZS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2FycmF5L2luZGV4T2YuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9hcnJheS9sYXN0LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvYXJyYXkvdW5pb24uanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9hcnJheS91bmlxLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvY29sbGVjdGlvbi9lYWNoLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvY29sbGVjdGlvbi9maW5kLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvY29sbGVjdGlvbi9mb3JFYWNoLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvY29sbGVjdGlvbi9tYXAuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9jb2xsZWN0aW9uL3JlZHVjZS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2Z1bmN0aW9uL3Jlc3RQYXJhbS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL1NldENhY2hlLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvYXJyYXlDb3B5LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvYXJyYXlFYWNoLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvYXJyYXlNYXAuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9hcnJheVB1c2guanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9hcnJheVJlZHVjZS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2FycmF5U29tZS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2Jhc2VBc3NpZ24uanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlQ2FsbGJhY2suanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlQ2xvbmUuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlQ29weS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2Jhc2VEaWZmZXJlbmNlLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvYmFzZUVhY2guanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlRmluZC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2Jhc2VGaW5kSW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlRmxhdHRlbi5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2Jhc2VGb3IuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlRm9ySW4uanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlRm9yT3duLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvYmFzZUdldC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2Jhc2VJbmRleE9mLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvYmFzZUlzRXF1YWwuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlSXNFcXVhbERlZXAuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlSXNNYXRjaC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2Jhc2VNYXAuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlTWF0Y2hlcy5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2Jhc2VNYXRjaGVzUHJvcGVydHkuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlUHJvcGVydHkuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iYXNlUHJvcGVydHlEZWVwLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvYmFzZVJlZHVjZS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2Jhc2VTbGljZS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2Jhc2VUb1N0cmluZy5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2Jhc2VVbmlxLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvYmluYXJ5SW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9iaW5hcnlJbmRleEJ5LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvYmluZENhbGxiYWNrLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvYnVmZmVyQ2xvbmUuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9jYWNoZUluZGV4T2YuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9jYWNoZVB1c2guanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9jcmVhdGVCYXNlRWFjaC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2NyZWF0ZUJhc2VGb3IuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9jcmVhdGVDYWNoZS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2NyZWF0ZUZpbmQuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9jcmVhdGVGb3JFYWNoLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvY3JlYXRlUmVkdWNlLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvZXF1YWxBcnJheXMuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9lcXVhbEJ5VGFnLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvZXF1YWxPYmplY3RzLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvZ2V0TGVuZ3RoLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvZ2V0TWF0Y2hEYXRhLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvZ2V0TmF0aXZlLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvaW5kZXhPZk5hTi5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2luaXRDbG9uZUFycmF5LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvaW5pdENsb25lQnlUYWcuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9pbml0Q2xvbmVPYmplY3QuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9pc0FycmF5TGlrZS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2lzSG9zdE9iamVjdC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2lzSW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9pc0l0ZXJhdGVlQ2FsbC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL2lzS2V5LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvaW50ZXJuYWwvaXNMZW5ndGguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9pc09iamVjdExpa2UuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9pc1N0cmljdENvbXBhcmFibGUuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC9zaGltS2V5cy5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL3NvcnRlZFVuaXEuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9pbnRlcm5hbC90b09iamVjdC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2ludGVybmFsL3RvUGF0aC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2xhbmcvY2xvbmVEZWVwLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvbGFuZy9pc0FyZ3VtZW50cy5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2xhbmcvaXNBcnJheS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2xhbmcvaXNCb29sZWFuLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvbGFuZy9pc0RhdGUuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9sYW5nL2lzRmluaXRlLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvbGFuZy9pc0Z1bmN0aW9uLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvbGFuZy9pc05hdGl2ZS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2xhbmcvaXNOdWxsLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvbGFuZy9pc051bWJlci5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L2xhbmcvaXNPYmplY3QuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9sYW5nL2lzUGxhaW5PYmplY3QuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9sYW5nL2lzU3RyaW5nLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvbGFuZy9pc1R5cGVkQXJyYXkuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9sYW5nL2lzVW5kZWZpbmVkLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvb2JqZWN0L2hhcy5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L29iamVjdC9rZXlzLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvb2JqZWN0L2tleXNJbi5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L29iamVjdC9wYWlycy5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L29iamVjdC9zZXQuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLWNvbXBhdC9zdXBwb3J0LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC1jb21wYXQvdXRpbGl0eS9pZGVudGl0eS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gtY29tcGF0L3V0aWxpdHkvcHJvcGVydHkuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvYWxwaGEuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9ibGFja2xpc3QuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9jb250YWlucy5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2VxdWFscy5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2VzY2FwZS5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzQWZ0ZXIuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc0FscGhhLmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvaXNBbHBoYW51bWVyaWMuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc0FzY2lpLmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvaXNCYXNlNjQuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc0JlZm9yZS5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzQm9vbGVhbi5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzQnl0ZUxlbmd0aC5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzQ3JlZGl0Q2FyZC5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzQ3VycmVuY3kuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc0RhdGFVUkkuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc0RlY2ltYWwuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc0RpdmlzaWJsZUJ5LmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvaXNFbWFpbC5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzRW1wdHkuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc0ZRRE4uanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc0Zsb2F0LmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvaXNGdWxsV2lkdGguanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc0hhbGZXaWR0aC5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzSGFzaC5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzSGV4Q29sb3IuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc0hleGFkZWNpbWFsLmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvaXNJUC5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzSVNCTi5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzSVNJTi5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzSVNPODYwMS5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzSVNSQy5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzSVNTTi5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzSW4uanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc0ludC5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzSlNPTi5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzTGF0TG9uZy5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzTGVuZ3RoLmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvaXNMb3dlcmNhc2UuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc01BQ0FkZHJlc3MuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc01ENS5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzTW9iaWxlUGhvbmUuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc01vbmdvSWQuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc011bHRpYnl0ZS5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzTnVtZXJpYy5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzUG9zdGFsQ29kZS5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzU3Vycm9nYXRlUGFpci5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL2lzVVJMLmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvaXNVVUlELmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvaXNVcHBlcmNhc2UuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc1ZhcmlhYmxlV2lkdGguanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9pc1doaXRlbGlzdGVkLmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvbHRyaW0uanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9tYXRjaGVzLmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvbm9ybWFsaXplRW1haWwuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi9ydHJpbS5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL3N0cmlwTG93LmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvdG9Cb29sZWFuLmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvdG9EYXRlLmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvdG9GbG9hdC5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL3RvSW50LmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvdHJpbS5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL3VuZXNjYXBlLmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvdXRpbC9hc3NlcnRTdHJpbmcuanMiLCJub2RlX21vZHVsZXMvdmFsaWRhdG9yL2xpYi91dGlsL21lcmdlLmpzIiwibm9kZV9tb2R1bGVzL3ZhbGlkYXRvci9saWIvdXRpbC90b1N0cmluZy5qcyIsIm5vZGVfbW9kdWxlcy92YWxpZGF0b3IvbGliL3doaXRlbGlzdC5qcyIsInNjaGVtYXMvMS4yL2FwaURlY2xhcmF0aW9uLmpzb24iLCJzY2hlbWFzLzEuMi9hdXRob3JpemF0aW9uT2JqZWN0Lmpzb24iLCJzY2hlbWFzLzEuMi9kYXRhVHlwZS5qc29uIiwic2NoZW1hcy8xLjIvZGF0YVR5cGVCYXNlLmpzb24iLCJzY2hlbWFzLzEuMi9pbmZvT2JqZWN0Lmpzb24iLCJzY2hlbWFzLzEuMi9tb2RlbHNPYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL29hdXRoMkdyYW50VHlwZS5qc29uIiwic2NoZW1hcy8xLjIvb3BlcmF0aW9uT2JqZWN0Lmpzb24iLCJzY2hlbWFzLzEuMi9wYXJhbWV0ZXJPYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL3Jlc291cmNlTGlzdGluZy5qc29uIiwic2NoZW1hcy8xLjIvcmVzb3VyY2VPYmplY3QuanNvbiIsInNjaGVtYXMvMi4wL3NjaGVtYS5qc29uIiwic2NoZW1hcy9qc29uLXNjaGVtYS1kcmFmdC0wNC5qc29uIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDL1FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDMS9DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDanJCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2RUE7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNsRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0akRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgQXBpZ2VlIENvcnBvcmF0aW9uXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG4gKiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cbiAqIFRIRSBTT0ZUV0FSRS5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbi8vIERvbmUgdGhpcyB3YXkgdG8gbWFrZSB0aGUgQnJvd3NlcmlmeSBidWlsZCBzbWFsbGVyXG52YXIgXyA9IHtcbiAgZWFjaDogcmVxdWlyZSgnbG9kYXNoLWNvbXBhdC9jb2xsZWN0aW9uL2VhY2gnKSxcbiAgaW5kZXhPZjogcmVxdWlyZSgnbG9kYXNoLWNvbXBhdC9hcnJheS9pbmRleE9mJyksXG4gIGlzQXJyYXk6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvbGFuZy9pc0FycmF5JyksXG4gIGlzUGxhaW5PYmplY3Q6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvbGFuZy9pc1BsYWluT2JqZWN0JyksXG4gIGlzU3RyaW5nOiByZXF1aXJlKCdsb2Rhc2gtY29tcGF0L2xhbmcvaXNTdHJpbmcnKSxcbiAgaXNVbmRlZmluZWQ6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvbGFuZy9pc1VuZGVmaW5lZCcpLFxuICByZWR1Y2U6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvY29sbGVjdGlvbi9yZWR1Y2UnKVxufTtcbnZhciBKc29uUmVmcyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydKc29uUmVmcyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnSnNvblJlZnMnXSA6IG51bGwpO1xudmFyIHRyYXZlcnNlID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ3RyYXZlcnNlJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyd0cmF2ZXJzZSddIDogbnVsbCk7XG52YXIgWlNjaGVtYSA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydaU2NoZW1hJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydaU2NoZW1hJ10gOiBudWxsKTtcblxudmFyIGN1c3RvbUpzb25TY2hlbWFGb3JtYXRzID0gWydieXRlJywgJ2RvdWJsZScsICdmbG9hdCcsICdpbnQzMicsICdpbnQ2NCcsICdtaW1lLXR5cGUnLCAndXJpLXRlbXBsYXRlJ107XG52YXIgZHJhZnQwNEpzb24gPSByZXF1aXJlKCcuLi9zY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24nKTtcbnZhciBkcmFmdDA0VXJsID0gJ2h0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hJztcbnZhciBzcGVjQ2FjaGUgPSB7fTtcblxubW9kdWxlLmV4cG9ydHMucmVnaXN0ZXJDdXN0b21Gb3JtYXRzID0gZnVuY3Rpb24gKGpzb24pIHtcbiAgdHJhdmVyc2UoanNvbikuZm9yRWFjaChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG5hbWUgPSB0aGlzLmtleTtcbiAgICB2YXIgZm9ybWF0ID0gdGhpcy5ub2RlO1xuXG4gICAgaWYgKG5hbWUgPT09ICdmb3JtYXQnICYmIF8uaW5kZXhPZihaU2NoZW1hLmdldFJlZ2lzdGVyZWRGb3JtYXRzKCksIGZvcm1hdCkgPT09IC0xKSB7XG4gICAgICBaU2NoZW1hLnJlZ2lzdGVyRm9ybWF0KGZvcm1hdCwgZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5jcmVhdGVKc29uVmFsaWRhdG9yID0gZnVuY3Rpb24gKHNjaGVtYXMpIHtcbiAgdmFyIHZhbGlkYXRvciA9IG5ldyBaU2NoZW1hKHtcbiAgICBicmVha09uRmlyc3RFcnJvcjogZmFsc2UsXG4gICAgcmVwb3J0UGF0aEFzQXJyYXk6IHRydWVcbiAgfSk7XG4gIHZhciByZXN1bHQ7XG5cbiAgLy8gQWRkIHRoZSBkcmFmdC0wNCBzcGVjXG4gIHZhbGlkYXRvci5zZXRSZW1vdGVSZWZlcmVuY2UoZHJhZnQwNFVybCwgZHJhZnQwNEpzb24pO1xuXG4gIC8vIFN3YWdnZXIgdXNlcyBzb21lIHVuc3VwcG9ydGVkL2ludmFsaWQgZm9ybWF0cyBzbyBqdXN0IG1ha2UgdGhlbSBhbGwgcGFzc1xuICBfLmVhY2goY3VzdG9tSnNvblNjaGVtYUZvcm1hdHMsIGZ1bmN0aW9uIChmb3JtYXQpIHtcbiAgICBaU2NoZW1hLnJlZ2lzdGVyRm9ybWF0KGZvcm1hdCwgZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIENvbXBpbGUgYW5kIHZhbGlkYXRlIHRoZSBzY2hlbWFzXG4gIGlmICghXy5pc1VuZGVmaW5lZChzY2hlbWFzKSkge1xuICAgIHJlc3VsdCA9IHZhbGlkYXRvci5jb21waWxlU2NoZW1hKHNjaGVtYXMpO1xuXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gZXJyb3IsIGl0J3MgdW5yZWNvdmVyYWJsZSBzbyBqdXN0IGJsb3cgdGhlIGVmZiB1cFxuICAgIGlmIChyZXN1bHQgPT09IGZhbHNlKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdKU09OIFNjaGVtYSBmaWxlJyArIChzY2hlbWFzLmxlbmd0aCA+IDEgPyAncyBhcmUnIDogJyBpcycpICsgJyBpbnZhbGlkOicpO1xuXG4gICAgICBfLmVhY2godmFsaWRhdG9yLmdldExhc3RFcnJvcnMoKSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCcgICcgKyAoXy5pc0FycmF5KGVyci5wYXRoKSA/IEpzb25SZWZzLnBhdGhUb1B0cihlcnIucGF0aCkgOiBlcnIucGF0aCkgKyAnOiAnICsgZXJyLm1lc3NhZ2UpO1xuICAgICAgfSk7XG5cbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5hYmxlIHRvIGNyZWF0ZSB2YWxpZGF0b3IgZHVlIHRvIGludmFsaWQgSlNPTiBTY2hlbWEnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdmFsaWRhdG9yO1xufTtcblxubW9kdWxlLmV4cG9ydHMuZm9ybWF0UmVzdWx0cyA9IGZ1bmN0aW9uIChyZXN1bHRzKSB7XG4gIGlmIChyZXN1bHRzKSB7XG4gICAgLy8gVXBkYXRlIHRoZSByZXN1bHRzIGJhc2VkIG9uIGl0cyBjb250ZW50IHRvIGluZGljYXRlIHN1Y2Nlc3MvZmFpbHVyZSBhY2NvcmRpbmdseVxuICAgIHJlc3VsdHMgPSAocmVzdWx0cy5lcnJvcnMubGVuZ3RoICsgcmVzdWx0cy53YXJuaW5ncy5sZW5ndGggK1xuICAgIF8ucmVkdWNlKHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoY291bnQsIGFSZXN1bHQpIHtcbiAgICAgIGlmIChhUmVzdWx0KSB7XG4gICAgICAgIGNvdW50ICs9IGFSZXN1bHQuZXJyb3JzLmxlbmd0aCArIGFSZXN1bHQud2FybmluZ3MubGVuZ3RoO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gY291bnQ7XG4gICAgfSwgMCkgPiAwKSA/IHJlc3VsdHMgOiB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbnZhciBnZXRFcnJvckNvdW50ID0gbW9kdWxlLmV4cG9ydHMuZ2V0RXJyb3JDb3VudCA9IGZ1bmN0aW9uIChyZXN1bHRzKSB7XG4gIHZhciBlcnJvcnMgPSAwO1xuXG4gIGlmIChyZXN1bHRzKSB7XG4gICAgZXJyb3JzID0gcmVzdWx0cy5lcnJvcnMubGVuZ3RoO1xuXG4gICAgXy5lYWNoKHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoYWRSZXN1bHRzKSB7XG4gICAgICBpZiAoYWRSZXN1bHRzKSB7XG4gICAgICAgIGVycm9ycyArPSBhZFJlc3VsdHMuZXJyb3JzLmxlbmd0aDtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBlcnJvcnM7XG59O1xuXG52YXIgY29lcmNlVmVyc2lvbiA9IGZ1bmN0aW9uICh2ZXJzaW9uKSB7XG4gIC8vIENvbnZlcnQgdGhlIHZlcnNpb24gdG8gYSBudW1iZXIgKFJlcXVpcmVkIGZvciBoZWxwZXJzLmdldFNwZWMpXG4gIGlmICh2ZXJzaW9uICYmICFfLmlzU3RyaW5nKHZlcnNpb24pKSB7XG4gICAgdmVyc2lvbiA9IHZlcnNpb24udG9TdHJpbmcoKTtcblxuICAgIC8vIEhhbmRsZSByb3VuZGluZyBpc3N1ZXMgKE9ubHkgcmVxdWlyZWQgZm9yIHdoZW4gU3dhZ2dlciB2ZXJzaW9uIGVuZHMgaW4gJy4wJylcbiAgICBpZiAodmVyc2lvbi5pbmRleE9mKCcuJykgPT09IC0xKSB7XG4gICAgICB2ZXJzaW9uICs9ICcuMCc7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHZlcnNpb247XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIHByb3BlciBzcGVjaWZpY2F0aW9uIGJhc2VkIG9uIHRoZSBodW1hbiByZWFkYWJsZSB2ZXJzaW9uLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uIC0gVGhlIGh1bWFuIHJlYWRhYmxlIFN3YWdnZXIgdmVyc2lvbiAoRXg6IDEuMilcbiAqIEBwYXJhbSB7W2Jvb2xlYW49ZmFsc2VdfSB0aHJvd0Vycm9yIC0gVGhyb3cgYW4gZXJyb3IgaWYgdGhlIHZlcnNpb24gY291bGQgbm90IGJlIGlkZW50aWZpZWRcbiAqXG4gKiBAcmV0dXJucyB0aGUgY29ycmVzcG9uZGluZyBTd2FnZ2VyIFNwZWNpZmljYXRpb24gb2JqZWN0IG9yIHVuZGVmaW5lZCBpZiB0aGVyZSBpcyBub25lXG4gKi9cbm1vZHVsZS5leHBvcnRzLmdldFNwZWMgPSBmdW5jdGlvbiAodmVyc2lvbiwgdGhyb3dFcnJvcikge1xuICB2YXIgc3BlYztcblxuICB2ZXJzaW9uID0gY29lcmNlVmVyc2lvbih2ZXJzaW9uKTtcbiAgc3BlYyA9IHNwZWNDYWNoZVt2ZXJzaW9uXTtcblxuICBpZiAoXy5pc1VuZGVmaW5lZChzcGVjKSkge1xuICAgIHN3aXRjaCAodmVyc2lvbikge1xuICAgIGNhc2UgJzEuMic6XG4gICAgICBzcGVjID0gcmVxdWlyZSgnLi4vbGliL3NwZWNzJykudjFfMjsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG5cbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAnMi4wJzpcbiAgICAgIHNwZWMgPSByZXF1aXJlKCcuLi9saWIvc3BlY3MnKS52Ml8wOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcblxuICAgICAgYnJlYWs7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgaWYgKHRocm93RXJyb3IgPT09IHRydWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBTd2FnZ2VyIHZlcnNpb246ICcgKyB2ZXJzaW9uKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gc3BlYztcbn07XG5cbi8qKlxuICogQXRlbXB0cyB0byBmaWd1cmUgb3V0IHRoZSBTd2FnZ2VyIHZlcnNpb24gZnJvbSB0aGUgU3dhZ2dlciBkb2N1bWVudC5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gZG9jdW1lbnQgLSBUaGUgU3dhZ2dlciBkb2N1bWVudFxuICpcbiAqIEByZXR1cm5zIHRoZSBTd2FnZ2VyIHZlcnNpb24gb3IgdW5kZWZpbmVkIGlmIHRoZSBkb2N1bWVudCBpcyBub3QgYSBTd2FnZ2VyIGRvY3VtZW50XG4gKi9cbm1vZHVsZS5leHBvcnRzLmdldFN3YWdnZXJWZXJzaW9uID0gZnVuY3Rpb24gKGRvY3VtZW50KSB7XG4gIHJldHVybiBfLmlzUGxhaW5PYmplY3QoZG9jdW1lbnQpID8gY29lcmNlVmVyc2lvbihkb2N1bWVudC5zd2FnZ2VyVmVyc2lvbiB8fCBkb2N1bWVudC5zd2FnZ2VyKSA6IHVuZGVmaW5lZDtcbn07XG5cbm1vZHVsZS5leHBvcnRzLnByaW50VmFsaWRhdGlvblJlc3VsdHMgPSBmdW5jdGlvbiAodmVyc2lvbiwgYXBpRE9yU08sIGFwaURlY2xhcmF0aW9ucywgcmVzdWx0cywgcHJpbnRTdW1tYXJ5KSB7XG4gIHZhciBoYXNFcnJvcnMgPSBnZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMDtcbiAgdmFyIHN0cmVhbSA9IGhhc0Vycm9ycyA/IGNvbnNvbGUuZXJyb3IgOiBjb25zb2xlLmxvZztcbiAgdmFyIHBsdXJhbGl6ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIGNvdW50KSB7XG4gICAgcmV0dXJuIGNvdW50ID09PSAxID8gc3RyaW5nIDogc3RyaW5nICsgJ3MnO1xuICB9O1xuICB2YXIgcHJpbnRFcnJvcnNPcldhcm5pbmdzID0gZnVuY3Rpb24gKGhlYWRlciwgZW50cmllcywgaW5kZW50KSB7XG4gICAgaWYgKGhlYWRlcikge1xuICAgICAgc3RyZWFtKGhlYWRlciArICc6Jyk7XG4gICAgICBzdHJlYW0oKTtcbiAgICB9XG5cbiAgICBfLmVhY2goZW50cmllcywgZnVuY3Rpb24gKGVudHJ5KSB7XG4gICAgICBzdHJlYW0obmV3IEFycmF5KGluZGVudCArIDEpLmpvaW4oJyAnKSArIEpzb25SZWZzLnBhdGhUb1B0cihlbnRyeS5wYXRoKSArICc6ICcgKyBlbnRyeS5tZXNzYWdlKTtcblxuICAgICAgaWYgKGVudHJ5LmlubmVyKSB7XG4gICAgICAgIHByaW50RXJyb3JzT3JXYXJuaW5ncyAodW5kZWZpbmVkLCBlbnRyeS5pbm5lciwgaW5kZW50ICsgMik7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoaGVhZGVyKSB7XG4gICAgICBzdHJlYW0oKTtcbiAgICB9XG4gIH07XG4gIHZhciBlcnJvckNvdW50ID0gMDtcbiAgdmFyIHdhcm5pbmdDb3VudCA9IDA7XG5cbiAgc3RyZWFtKCk7XG5cbiAgaWYgKHJlc3VsdHMuZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICBlcnJvckNvdW50ICs9IHJlc3VsdHMuZXJyb3JzLmxlbmd0aDtcblxuICAgIHByaW50RXJyb3JzT3JXYXJuaW5ncygnQVBJIEVycm9ycycsIHJlc3VsdHMuZXJyb3JzLCAyKTtcbiAgfVxuXG4gIGlmIChyZXN1bHRzLndhcm5pbmdzLmxlbmd0aCA+IDApIHtcbiAgICB3YXJuaW5nQ291bnQgKz0gcmVzdWx0cy53YXJuaW5ncy5sZW5ndGg7XG5cbiAgICBwcmludEVycm9yc09yV2FybmluZ3MoJ0FQSSBXYXJuaW5ncycsIHJlc3VsdHMud2FybmluZ3MsIDIpO1xuICB9XG5cbiAgaWYgKHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zKSB7XG4gICAgcmVzdWx0cy5hcGlEZWNsYXJhdGlvbnMuZm9yRWFjaChmdW5jdGlvbiAoYWRSZXN1bHQsIGluZGV4KSB7XG4gICAgICBpZiAoIWFkUmVzdWx0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdmFyIG5hbWUgPSBhcGlEZWNsYXJhdGlvbnNbaW5kZXhdLnJlc291cmNlUGF0aCB8fCBpbmRleDtcblxuICAgICAgaWYgKGFkUmVzdWx0LmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGVycm9yQ291bnQgKz0gYWRSZXN1bHQuZXJyb3JzLmxlbmd0aDtcblxuICAgICAgICBwcmludEVycm9yc09yV2FybmluZ3MoJyAgQVBJIERlY2xhcmF0aW9uICgnICsgbmFtZSArICcpIEVycm9ycycsIGFkUmVzdWx0LmVycm9ycywgNCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChhZFJlc3VsdC53YXJuaW5ncy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHdhcm5pbmdDb3VudCArPSBhZFJlc3VsdC53YXJuaW5ncy5sZW5ndGg7XG5cbiAgICAgICAgcHJpbnRFcnJvcnNPcldhcm5pbmdzKCcgIEFQSSBEZWNsYXJhdGlvbiAoJyArIG5hbWUgKyAnKSBXYXJuaW5ncycsIGFkUmVzdWx0Lndhcm5pbmdzLCA0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGlmIChwcmludFN1bW1hcnkpIHtcbiAgICBpZiAoZXJyb3JDb3VudCA+IDApIHtcbiAgICAgIHN0cmVhbShlcnJvckNvdW50ICsgJyAnICsgcGx1cmFsaXplKCdlcnJvcicsIGVycm9yQ291bnQpICsgJyBhbmQgJyArIHdhcm5pbmdDb3VudCArICcgJyArXG4gICAgICAgICAgICAgICAgICAgIHBsdXJhbGl6ZSgnd2FybmluZycsIHdhcm5pbmdDb3VudCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHJlYW0oJ1ZhbGlkYXRpb24gc3VjY2VlZGVkIGJ1dCB3aXRoICcgKyB3YXJuaW5nQ291bnQgKyAnICcgKyBwbHVyYWxpemUoJ3dhcm5pbmcnLCB3YXJuaW5nQ291bnQpKTtcbiAgICB9XG4gIH1cblxuICBzdHJlYW0oKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLnN3YWdnZXJPcGVyYXRpb25NZXRob2RzID0gW1xuICAnREVMRVRFJyxcbiAgJ0dFVCcsXG4gICdIRUFEJyxcbiAgJ09QVElPTlMnLFxuICAnUEFUQ0gnLFxuICAnUE9TVCcsXG4gICdQVVQnXG5dO1xuIiwiLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBBcGlnZWUgQ29ycG9yYXRpb25cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxuLy8gRG9uZSB0aGlzIHdheSB0byBtYWtlIHRoZSBCcm93c2VyaWZ5IGJ1aWxkIHNtYWxsZXJcbnZhciBfID0ge1xuICBjbG9uZURlZXA6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvbGFuZy9jbG9uZURlZXAnKSxcbiAgZGlmZmVyZW5jZTogcmVxdWlyZSgnbG9kYXNoLWNvbXBhdC9hcnJheS9kaWZmZXJlbmNlJyksXG4gIGVhY2g6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvY29sbGVjdGlvbi9lYWNoJyksXG4gIGZpbmQ6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvY29sbGVjdGlvbi9maW5kJyksXG4gIGhhczogcmVxdWlyZSgnbG9kYXNoLWNvbXBhdC9vYmplY3QvaGFzJyksXG4gIGlzQXJyYXk6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvbGFuZy9pc0FycmF5JyksXG4gIGlzRnVuY3Rpb246IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvbGFuZy9pc0Z1bmN0aW9uJyksXG4gIGlzUGxhaW5PYmplY3Q6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvbGFuZy9pc1BsYWluT2JqZWN0JyksXG4gIGlzU3RyaW5nOiByZXF1aXJlKCdsb2Rhc2gtY29tcGF0L2xhbmcvaXNTdHJpbmcnKSxcbiAgaXNVbmRlZmluZWQ6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvbGFuZy9pc1VuZGVmaW5lZCcpLFxuICBtYXA6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvY29sbGVjdGlvbi9tYXAnKSxcbiAgcmVkdWNlOiByZXF1aXJlKCdsb2Rhc2gtY29tcGF0L2NvbGxlY3Rpb24vcmVkdWNlJyksXG4gIHNldDogcmVxdWlyZSgnbG9kYXNoLWNvbXBhdC9vYmplY3Qvc2V0JyksXG4gIHVuaW9uOiByZXF1aXJlKCdsb2Rhc2gtY29tcGF0L2FycmF5L3VuaW9uJylcbn07XG52YXIgYXN5bmMgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snYXN5bmMnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ2FzeW5jJ10gOiBudWxsKTtcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG52YXIgSnNvblJlZnMgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snSnNvblJlZnMnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ0pzb25SZWZzJ10gOiBudWxsKTtcbnZhciBTcGFya01ENSA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydTcGFya01ENSddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnU3BhcmtNRDUnXSA6IG51bGwpO1xudmFyIHN3YWdnZXJDb252ZXJ0ZXIgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snU3dhZ2dlckNvbnZlcnRlciddWydjb252ZXJ0J10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydTd2FnZ2VyQ29udmVydGVyJ11bJ2NvbnZlcnQnXSA6IG51bGwpO1xudmFyIHRyYXZlcnNlID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ3RyYXZlcnNlJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWyd0cmF2ZXJzZSddIDogbnVsbCk7XG52YXIgdmFsaWRhdG9ycyA9IHJlcXVpcmUoJy4vdmFsaWRhdG9ycycpO1xudmFyIFlBTUwgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snanN5YW1sJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydqc3lhbWwnXSA6IG51bGwpO1xuXG4vLyBXb3JrIGFyb3VuZCBzd2FnZ2VyLWNvbnZlcnRlciBwYWNrYWdpbmcgaXNzdWUgKEJyb3dzZXIgYnVpbGRzIG9ubHkpXG5pZiAoXy5pc1BsYWluT2JqZWN0KHN3YWdnZXJDb252ZXJ0ZXIpKSB7XG4gIHN3YWdnZXJDb252ZXJ0ZXIgPSBnbG9iYWwuU3dhZ2dlckNvbnZlcnRlci5jb252ZXJ0O1xufVxuXG52YXIgZG9jdW1lbnRDYWNoZSA9IHt9O1xuXG52YXIgc2FuaXRpemVSZWYgPSBmdW5jdGlvbiAodmVyc2lvbiwgcmVmKSB7XG4gIHJldHVybiB2ZXJzaW9uICE9PSAnMS4yJyA/IHJlZiA6IHJlZi5yZXBsYWNlKCcjL21vZGVscy8nLCAnJyk7XG59O1xuXG52YXIgc3dhZ2dlcjFSZWZQcmVQcm9jZXNvciA9IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIHBPYmogPSBfLmNsb25lRGVlcChvYmopO1xuXG4gIHBPYmouJHJlZiA9ICcjL21vZGVscy8nICsgb2JqLiRyZWY7XG5cbiAgcmV0dXJuIHBPYmo7XG59O1xudmFyIHZhbGlkT3B0aW9uTmFtZXMgPSBfLm1hcChoZWxwZXJzLnN3YWdnZXJPcGVyYXRpb25NZXRob2RzLCBmdW5jdGlvbiAobWV0aG9kKSB7XG4gIHJldHVybiBtZXRob2QudG9Mb3dlckNhc2UoKTtcbn0pO1xuXG52YXIgaXNSZW1vdGVQdHIgPSBmdW5jdGlvbiAocmVmRGV0YWlscykge1xuICByZXR1cm4gWydyZWxhdGl2ZScsICdyZW1vdGUnXS5pbmRleE9mKHJlZkRldGFpbHMudHlwZSkgPiAtMTtcbn07XG5cbnZhciBjcmVhdGVFcnJvck9yV2FybmluZyA9IGZ1bmN0aW9uIChjb2RlLCBtZXNzYWdlLCBwYXRoLCBkZXN0KSB7XG4gIGRlc3QucHVzaCh7XG4gICAgY29kZTogY29kZSxcbiAgICBtZXNzYWdlOiBtZXNzYWdlLFxuICAgIHBhdGg6IHBhdGhcbiAgfSk7XG59O1xuXG52YXIgYWRkUmVmZXJlbmNlID0gZnVuY3Rpb24gKGNhY2hlRW50cnksIGRlZlBhdGhPclB0ciwgcmVmUGF0aE9yUHRyLCByZXN1bHRzLCBvbWl0RXJyb3IpIHtcbiAgdmFyIHJlc3VsdCA9IHRydWU7XG4gIHZhciBzd2FnZ2VyVmVyc2lvbiA9IGhlbHBlcnMuZ2V0U3dhZ2dlclZlcnNpb24oY2FjaGVFbnRyeS5yZXNvbHZlZCk7XG4gIHZhciBkZWZQYXRoID0gXy5pc0FycmF5KGRlZlBhdGhPclB0cikgPyBkZWZQYXRoT3JQdHIgOiBKc29uUmVmcy5wYXRoRnJvbVB0cihkZWZQYXRoT3JQdHIpO1xuICB2YXIgZGVmUHRyID0gXy5pc0FycmF5KGRlZlBhdGhPclB0cikgPyBKc29uUmVmcy5wYXRoVG9QdHIoZGVmUGF0aE9yUHRyKSA6IGRlZlBhdGhPclB0cjtcbiAgdmFyIHJlZlBhdGggPSBfLmlzQXJyYXkocmVmUGF0aE9yUHRyKSA/IHJlZlBhdGhPclB0ciA6IEpzb25SZWZzLnBhdGhGcm9tUHRyKHJlZlBhdGhPclB0cik7XG4gIHZhciByZWZQdHIgPSBfLmlzQXJyYXkocmVmUGF0aE9yUHRyKSA/IEpzb25SZWZzLnBhdGhUb1B0cihyZWZQYXRoT3JQdHIpIDogcmVmUGF0aE9yUHRyO1xuICB2YXIgY29kZTtcbiAgdmFyIGRlZjtcbiAgdmFyIGRpc3BsYXlJZDtcbiAgdmFyIGk7XG4gIHZhciBtc2dQcmVmaXg7XG4gIHZhciB0eXBlO1xuXG4gIGRlZiA9IGNhY2hlRW50cnkuZGVmaW5pdGlvbnNbZGVmUHRyXTtcbiAgdHlwZSA9IGRlZlBhdGhbMF07XG4gIGNvZGUgPSB0eXBlID09PSAnc2VjdXJpdHlEZWZpbml0aW9ucycgP1xuICAgICdTRUNVUklUWV9ERUZJTklUSU9OJyA6XG4gICAgdHlwZS5zdWJzdHJpbmcoMCwgdHlwZS5sZW5ndGggLSAxKS50b1VwcGVyQ2FzZSgpO1xuICBkaXNwbGF5SWQgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBkZWZQYXRoW2RlZlBhdGgubGVuZ3RoIC0gMV0gOiBkZWZQdHI7XG4gIG1zZ1ByZWZpeCA9IHR5cGUgPT09ICdzZWN1cml0eURlZmluaXRpb25zJyA/XG4gICAgJ1NlY3VyaXR5IGRlZmluaXRpb24nIDpcbiAgICBjb2RlLmNoYXJBdCgwKSArIGNvZGUuc3Vic3RyaW5nKDEpLnRvTG93ZXJDYXNlKCk7XG5cbiAgLy8gVGhpcyBpcyBhbiBhdXRob3JpemF0aW9uIHNjb3BlIHJlZmVyZW5jZVxuICBpZiAoWydhdXRob3JpemF0aW9ucycsICdzZWN1cml0eURlZmluaXRpb25zJ10uaW5kZXhPZihkZWZQYXRoWzBdKSA+IC0xICYmIGRlZlBhdGhbMl0gPT09ICdzY29wZXMnKSB7XG4gICAgY29kZSArPSAnX1NDT1BFJztcbiAgICBtc2dQcmVmaXggKz0gJyBzY29wZSc7XG4gIH1cblxuICAvLyBJZiB0aGUgcmVmZXJlbmNlIHdhcyBub3QgZm91bmQgYW5kIHRoaXMgaXMgbm90IGFuIGF1dGhvcml6YXRpb24vc2VjdXJpdHkgc2NvcGUgcmVmZXJlbmNlLCBhdHRlbXB0IHRvIGZpbmQgYVxuICAvLyBwYXJlbnQgb2JqZWN0IHRvIGFkZCB0aGUgcmVmZXJlbmNlIHRvby4gIChJc3N1ZSAxNzYpXG4gIGlmIChfLmlzVW5kZWZpbmVkKGRlZikgJiYgWydBVVRIT1JJWkFUSU9OX1NDT1BFJywgJ1NFQ1VSSVRZX0RFRklOSVRJT05fU0NPUEUnXS5pbmRleE9mKGNvZGUpID09PSAtMSkge1xuICAgIC8vIEF0dGVtcHQgdG8gZmluZCB0aGUgZGVmaW5pdGlvbiBpbiBjYXNlIHRoZSByZWZlcmVuY2UgaXMgdG8gYSBwYXRoIHdpdGhpbiBhIGRlZmluaXRpb25gXG4gICAgZm9yIChpID0gMTsgaSA8IGRlZlBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBwUGF0aCA9IGRlZlBhdGguc2xpY2UoMCwgZGVmUGF0aC5sZW5ndGggLSBpKTtcbiAgICAgIHZhciBwUHRyID0gSnNvblJlZnMucGF0aFRvUHRyKHBQYXRoKTtcbiAgICAgIHZhciBwRGVmID0gY2FjaGVFbnRyeS5kZWZpbml0aW9uc1twUHRyXTtcblxuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHBEZWYpKSB7XG4gICAgICAgIGRlZiA9IHBEZWY7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZGVmKSkge1xuICAgIGlmICghb21pdEVycm9yKSB7XG4gICAgICBpZiAoY2FjaGVFbnRyeS5zd2FnZ2VyVmVyc2lvbiAhPT0gJzEuMicgJiYgWydTRUNVUklUWV9ERUZJTklUSU9OJywgJ1NFQ1VSSVRZX0RFRklOSVRJT05fU0NPUEUnXS5pbmRleE9mKGNvZGUpID09PSAtMSkge1xuICAgICAgICByZWZQYXRoLnB1c2goJyRyZWYnKTtcbiAgICAgIH1cblxuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV8nICsgY29kZSwgbXNnUHJlZml4ICsgJyBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBkaXNwbGF5SWQsIHJlZlBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuXG4gICAgcmVzdWx0ID0gZmFsc2U7XG4gIH0gZWxzZSB7XG4gICAgaWYgKF8uaXNVbmRlZmluZWQoZGVmLnJlZmVyZW5jZXMpKSB7XG4gICAgICBkZWYucmVmZXJlbmNlcyA9IFtdO1xuICAgIH1cblxuICAgIGRlZi5yZWZlcmVuY2VzLnB1c2gocmVmUHRyKTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG52YXIgZ2V0T3JDb21wb3NlU2NoZW1hID0gZnVuY3Rpb24gKGRvY3VtZW50TWV0YWRhdGEsIG1vZGVsSWQpIHtcbiAgdmFyIHRpdGxlID0gJ0NvbXBvc2VkICcgKyAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEpzb25SZWZzLnBhdGhGcm9tUHRyKG1vZGVsSWQpLnBvcCgpIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbElkKTtcbiAgdmFyIG1ldGFkYXRhID0gZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1ttb2RlbElkXTtcbiAgdmFyIG9yaWdpbmFsVCA9IHRyYXZlcnNlKGRvY3VtZW50TWV0YWRhdGEub3JpZ2luYWwpO1xuICB2YXIgcmVzb2x2ZWRUID0gdHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCk7XG4gIHZhciBjb21wb3NlZDtcbiAgdmFyIG9yaWdpbmFsO1xuXG4gIGlmICghbWV0YWRhdGEpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgb3JpZ2luYWwgPSBfLmNsb25lRGVlcChvcmlnaW5hbFQuZ2V0KEpzb25SZWZzLnBhdGhGcm9tUHRyKG1vZGVsSWQpKSk7XG4gIGNvbXBvc2VkID0gXy5jbG9uZURlZXAocmVzb2x2ZWRULmdldChKc29uUmVmcy5wYXRoRnJvbVB0cihtb2RlbElkKSkpO1xuXG4gIC8vIENvbnZlcnQgdGhlIFN3YWdnZXIgMS4yIGRvY3VtZW50IHRvIGEgdmFsaWQgSlNPTiBTY2hlbWEgZmlsZVxuICBpZiAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAvLyBDcmVhdGUgaW5oZXJpdGFuY2UgbW9kZWxcbiAgICBpZiAobWV0YWRhdGEubGluZWFnZS5sZW5ndGggPiAwKSB7XG4gICAgICBjb21wb3NlZC5hbGxPZiA9IFtdO1xuXG4gICAgICBfLmVhY2gobWV0YWRhdGEubGluZWFnZSwgZnVuY3Rpb24gKG1vZGVsSWQpIHtcbiAgICAgICAgY29tcG9zZWQuYWxsT2YucHVzaChnZXRPckNvbXBvc2VTY2hlbWEoZG9jdW1lbnRNZXRhZGF0YSwgbW9kZWxJZCkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIHRoZSBzdWJUeXBlcyBwcm9wZXJ0eVxuICAgIGRlbGV0ZSBjb21wb3NlZC5zdWJUeXBlcztcblxuICAgIF8uZWFjaChjb21wb3NlZC5wcm9wZXJ0aWVzLCBmdW5jdGlvbiAocHJvcGVydHksIG5hbWUpIHtcbiAgICAgIHZhciBvUHJvcCA9IG9yaWdpbmFsLnByb3BlcnRpZXNbbmFtZV07XG5cbiAgICAgIC8vIENvbnZlcnQgdGhlIHN0cmluZyB2YWx1ZXMgdG8gbnVtZXJpY2FsIHZhbHVlc1xuICAgICAgXy5lYWNoKFsnbWF4aW11bScsICdtaW5pbXVtJ10sIGZ1bmN0aW9uIChwcm9wKSB7XG4gICAgICAgIGlmIChfLmlzU3RyaW5nKHByb3BlcnR5W3Byb3BdKSkge1xuICAgICAgICAgIHByb3BlcnR5W3Byb3BdID0gcGFyc2VGbG9hdChwcm9wZXJ0eVtwcm9wXSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBfLmVhY2goSnNvblJlZnMuZmluZFJlZnMob1Byb3AsIHtcbiAgICAgICAgaW5jbHVkZUludmFsaWQ6IHRydWUsXG4gICAgICAgIHJlZlByZVByb2Nlc3Nvcjogc3dhZ2dlcjFSZWZQcmVQcm9jZXNvclxuICAgICAgfSksIGZ1bmN0aW9uIChyZWZEZXRhaWxzLCByZWZQdHIpIHtcbiAgICAgICAgdmFyIGRNZXRhZGF0YSA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbcmVmRGV0YWlscy51cmldO1xuICAgICAgICB2YXIgcGF0aCA9IEpzb25SZWZzLnBhdGhGcm9tUHRyKHJlZlB0cik7XG5cbiAgICAgICAgaWYgKGRNZXRhZGF0YS5saW5lYWdlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICB0cmF2ZXJzZShwcm9wZXJ0eSkuc2V0KHBhdGgsIGdldE9yQ29tcG9zZVNjaGVtYShkb2N1bWVudE1ldGFkYXRhLCByZWZEZXRhaWxzLnVyaSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyYXZlcnNlKHByb3BlcnR5KS5zZXQocGF0aC5jb25jYXQoJ3RpdGxlJyksICdDb21wb3NlZCAnICsgc2FuaXRpemVSZWYoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZkRldGFpbHMudXJpKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gU2NydWIgaWQgcHJvcGVydGllc1xuICBjb21wb3NlZCA9IHRyYXZlcnNlKGNvbXBvc2VkKS5tYXAoZnVuY3Rpb24gKHZhbCkge1xuICAgIGlmICh0aGlzLmtleSA9PT0gJ2lkJyAmJiBfLmlzU3RyaW5nKHZhbCkpIHtcbiAgICAgIHRoaXMucmVtb3ZlKCk7XG4gICAgfVxuICB9KTtcblxuICBjb21wb3NlZC50aXRsZSA9IHRpdGxlO1xuXG4gIHJldHVybiBjb21wb3NlZDtcbn07XG5cbnZhciBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyA9IGZ1bmN0aW9uICh2YWwsIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCwgcGF0aCwgZGVzdCkge1xuICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5VU0VEXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnIGlzIGRlZmluZWQgYnV0IGlzIG5vdCB1c2VkOiAnICsgdmFsLCBwYXRoLCBkZXN0KTtcbn07XG5cbnZhciBnZXREb2N1bWVudENhY2hlID0gZnVuY3Rpb24gKGFwaURPclNPKSB7XG4gIHZhciBrZXkgPSBTcGFya01ENS5oYXNoKEpTT04uc3RyaW5naWZ5KGFwaURPclNPKSk7XG4gIHZhciBjYWNoZUVudHJ5ID0gZG9jdW1lbnRDYWNoZVtrZXldIHx8IF8uZmluZChkb2N1bWVudENhY2hlLCBmdW5jdGlvbiAoY2FjaGVFbnRyeSkge1xuICAgIHJldHVybiBjYWNoZUVudHJ5LnJlc29sdmVkSWQgPT09IGtleTtcbiAgfSk7XG5cbiAgaWYgKCFjYWNoZUVudHJ5KSB7XG4gICAgY2FjaGVFbnRyeSA9IGRvY3VtZW50Q2FjaGVba2V5XSA9IHtcbiAgICAgIGRlZmluaXRpb25zOiB7fSxcbiAgICAgIG9yaWdpbmFsOiBhcGlET3JTTyxcbiAgICAgIHJlc29sdmVkOiB1bmRlZmluZWQsXG4gICAgICBzd2FnZ2VyVmVyc2lvbjogaGVscGVycy5nZXRTd2FnZ2VyVmVyc2lvbihhcGlET3JTTylcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIGNhY2hlRW50cnk7XG59O1xuXG52YXIgaGFuZGxlVmFsaWRhdGlvbkVycm9yID0gZnVuY3Rpb24gKHJlc3VsdHMsIGNhbGxiYWNrKSB7XG4gIHZhciBlcnIgPSBuZXcgRXJyb3IoJ1RoZSBTd2FnZ2VyIGRvY3VtZW50KHMpIGFyZSBpbnZhbGlkJyk7XG5cbiAgZXJyLmVycm9ycyA9IHJlc3VsdHMuZXJyb3JzO1xuICBlcnIuZmFpbGVkVmFsaWRhdGlvbiA9IHRydWU7XG4gIGVyci53YXJuaW5ncyA9IHJlc3VsdHMud2FybmluZ3M7XG5cbiAgaWYgKHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zKSB7XG4gICAgZXJyLmFwaURlY2xhcmF0aW9ucyA9IHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zO1xuICB9XG5cbiAgY2FsbGJhY2soZXJyKTtcbn07XG5cbnZhciBub3JtYWxpemVQYXRoID0gZnVuY3Rpb24gKHBhdGgpIHtcbiAgdmFyIG1hdGNoZXMgPSBwYXRoLm1hdGNoKC9cXHsoLio/KVxcfS9nKTtcbiAgdmFyIGFyZ05hbWVzID0gW107XG4gIHZhciBub3JtUGF0aCA9IHBhdGg7XG5cbiAgaWYgKG1hdGNoZXMpIHtcbiAgICBfLmVhY2gobWF0Y2hlcywgZnVuY3Rpb24gKG1hdGNoLCBpbmRleCkge1xuICAgICAgbm9ybVBhdGggPSBub3JtUGF0aC5yZXBsYWNlKG1hdGNoLCAneycgKyBpbmRleCArICd9Jyk7XG4gICAgICBhcmdOYW1lcy5wdXNoKG1hdGNoLnJlcGxhY2UoL1t7fV0vZywgJycpKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgcGF0aDogbm9ybVBhdGgsXG4gICAgYXJnczogYXJnTmFtZXNcbiAgfTtcbn07XG5cbnZhciByZW1vdmVDaXJjdWxhcnMgPSBmdW5jdGlvbiAob2JqKSB7XG4gIGZ1bmN0aW9uIHdhbGsgKGFuY2VzdG9ycywgbm9kZSwgcGF0aCkge1xuICAgIGZ1bmN0aW9uIHdhbGtJdGVtIChpdGVtLCBzZWdtZW50KSB7XG4gICAgICBwYXRoLnB1c2goc2VnbWVudCk7XG4gICAgICB3YWxrKGFuY2VzdG9ycywgaXRlbSwgcGF0aCk7XG4gICAgICBwYXRoLnBvcCgpO1xuICAgIH1cblxuICAgIC8vIFdlIGRvIG5vdCBwcm9jZXNzIGNpcmN1bGFyIG9iamVjdHMgYWdhaW5cbiAgICBpZiAoYW5jZXN0b3JzLmluZGV4T2Yobm9kZSkgPT09IC0xKSB7XG4gICAgICBhbmNlc3RvcnMucHVzaChub2RlKTtcblxuICAgICAgaWYgKF8uaXNBcnJheShub2RlKSB8fCBfLmlzUGxhaW5PYmplY3Qobm9kZSkpIHtcbiAgICAgICAgXy5lYWNoKG5vZGUsIGZ1bmN0aW9uIChtZW1iZXIsIGluZGV4T3JLZXkpIHtcbiAgICAgICAgICB3YWxrSXRlbShtZW1iZXIsIGluZGV4T3JLZXkudG9TdHJpbmcoKSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBfLnNldChvYmosIHBhdGgsIHt9KTtcbiAgICB9XG5cbiAgICBhbmNlc3RvcnMucG9wKCk7XG4gIH1cblxuICB3YWxrKFtdLCBvYmosIFtdKTtcbn07XG5cblxudmFyIHZhbGlkYXRlTm9FeGlzdCA9IGZ1bmN0aW9uIChkYXRhLCB2YWwsIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCwgcGF0aCwgZGVzdCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoZGF0YSkgJiYgZGF0YS5pbmRleE9mKHZhbCkgPiAtMSkge1xuICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdEVVBMSUNBVEVfJyArIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCArICcgYWxyZWFkeSBkZWZpbmVkOiAnICsgdmFsLCBwYXRoLCBkZXN0KTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMgPSBmdW5jdGlvbiAoZG9jdW1lbnRNZXRhZGF0YSwgc2NoZW1hLCBwYXRoLCByZXN1bHRzLCBza2lwKSB7XG4gIHRyeSB7XG4gICAgdmFsaWRhdG9ycy52YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24sIHNjaGVtYSwgcGF0aCwgdW5kZWZpbmVkKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgaWYgKCFza2lwKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyhlcnIuY29kZSwgZXJyLm1lc3NhZ2UsIGVyci5wYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuICB9XG59O1xuXG52YXIgcHJvY2Vzc0RvY3VtZW50ID0gZnVuY3Rpb24gKGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpIHtcbiAgdmFyIHN3YWdnZXJWZXJzaW9uID0gZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbjtcbiAgdmFyIGdldERlZmluaXRpb25NZXRhZGF0YSA9IGZ1bmN0aW9uIChkZWZQYXRoLCBpbmxpbmUpIHtcbiAgICB2YXIgZGVmUHRyID0gSnNvblJlZnMucGF0aFRvUHRyKGRlZlBhdGgpO1xuICAgIHZhciBtZXRhZGF0YSA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbZGVmUHRyXTtcblxuICAgIGlmICghbWV0YWRhdGEpIHtcbiAgICAgIG1ldGFkYXRhID0gZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1tkZWZQdHJdID0ge1xuICAgICAgICBpbmxpbmU6IGlubGluZSB8fCBmYWxzZSxcbiAgICAgICAgcmVmZXJlbmNlczogW11cbiAgICAgIH07XG5cbiAgICAgIC8vIEZvciBtb2RlbCBkZWZpbml0aW9ucywgYWRkIHRoZSBpbmhlcml0YW5jZSBwcm9wZXJ0aWVzXG4gICAgICBpZiAoWydkZWZpbml0aW9ucycsICdtb2RlbHMnXS5pbmRleE9mKEpzb25SZWZzLnBhdGhGcm9tUHRyKGRlZlB0cilbMF0pID4gLTEpIHtcbiAgICAgICAgbWV0YWRhdGEuY3ljbGljYWwgPSBmYWxzZTtcbiAgICAgICAgbWV0YWRhdGEubGluZWFnZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbWV0YWRhdGEucGFyZW50cyA9IFtdO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBtZXRhZGF0YTtcbiAgfTtcbiAgdmFyIGdldERpc3BsYXlJZCA9IGZ1bmN0aW9uIChpZCkge1xuICAgIHJldHVybiBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBKc29uUmVmcy5wYXRoRnJvbVB0cihpZCkucG9wKCkgOiBpZDtcbiAgfTtcbiAgdmFyIGpzb25SZWZzT3B0aW9ucyA9IHtcbiAgICBmaWx0ZXI6ICdsb2NhbCcsXG4gICAgaW5jbHVkZUludmFsaWQ6IHRydWVcbiAgfTtcbiAgdmFyIHdhbGsgPSBmdW5jdGlvbiAocm9vdCwgaWQsIGxpbmVhZ2UpIHtcbiAgICB2YXIgZGVmaW5pdGlvbiA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbaWQgfHwgcm9vdF07XG5cbiAgICBpZiAoZGVmaW5pdGlvbikge1xuICAgICAgXy5lYWNoKGRlZmluaXRpb24ucGFyZW50cywgZnVuY3Rpb24gKHBhcmVudCkge1xuICAgICAgICBsaW5lYWdlLnB1c2gocGFyZW50KTtcblxuICAgICAgICBpZiAocm9vdCAhPT0gcGFyZW50KSB7XG4gICAgICAgICAgd2Fsayhyb290LCBwYXJlbnQsIGxpbmVhZ2UpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG4gIHZhciBhdXRoRGVmc1Byb3AgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnYXV0aG9yaXphdGlvbnMnIDogJ3NlY3VyaXR5RGVmaW5pdGlvbnMnO1xuICB2YXIgbW9kZWxEZWZzUHJvcCA9IHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdtb2RlbHMnIDogJ2RlZmluaXRpb25zJztcblxuICAvLyBQcm9jZXNzIGF1dGhvcml6YXRpb24gZGVmaW5pdGlvbnNcbiAgXy5lYWNoKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWRbYXV0aERlZnNQcm9wXSwgZnVuY3Rpb24gKGF1dGhvcml6YXRpb24sIG5hbWUpIHtcbiAgICB2YXIgc2VjdXJpdHlEZWZQYXRoID0gW2F1dGhEZWZzUHJvcCwgbmFtZV07XG5cbiAgICAvLyBTd2FnZ2VyIDEuMiBvbmx5IGhhcyBhdXRob3JpemF0aW9uIGRlZmluaXRpb25zIGluIHRoZSBSZXNvdXJjZSBMaXN0aW5nXG4gICAgaWYgKHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyAmJiAhYXV0aG9yaXphdGlvbi50eXBlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRoZSBhdXRob3JpemF0aW9uIGRlZmluaXRpb24gbWV0YWRhdGFcbiAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEoc2VjdXJpdHlEZWZQYXRoKTtcblxuICAgIF8ucmVkdWNlKGF1dGhvcml6YXRpb24uc2NvcGVzLCBmdW5jdGlvbiAoc2VlblNjb3Blcywgc2NvcGUsIGluZGV4T3JOYW1lKSB7XG4gICAgICB2YXIgc2NvcGVOYW1lID0gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gc2NvcGUuc2NvcGUgOiBpbmRleE9yTmFtZTtcbiAgICAgIHZhciBzY29wZURlZlBhdGggPSBzZWN1cml0eURlZlBhdGguY29uY2F0KFsnc2NvcGVzJywgaW5kZXhPck5hbWUudG9TdHJpbmcoKV0pO1xuICAgICAgdmFyIHNjb3BlTWV0YWRhdGEgPSBnZXREZWZpbml0aW9uTWV0YWRhdGEoc2VjdXJpdHlEZWZQYXRoLmNvbmNhdChbJ3Njb3BlcycsIHNjb3BlTmFtZV0pKTtcblxuICAgICAgc2NvcGVNZXRhZGF0YS5zY29wZVBhdGggPSBzY29wZURlZlBhdGg7XG5cbiAgICAgIC8vIElkZW50aWZ5IGR1cGxpY2F0ZSBhdXRob3JpemF0aW9uIHNjb3BlIGRlZmluZWQgaW4gdGhlIFJlc291cmNlIExpc3RpbmdcbiAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuU2NvcGVzLCBzY29wZU5hbWUsICdBVVRIT1JJWkFUSU9OX1NDT1BFX0RFRklOSVRJT04nLCAnQXV0aG9yaXphdGlvbiBzY29wZSBkZWZpbml0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBzY29wZURlZlBhdGguY29uY2F0KCdzY29wZScpIDogc2NvcGVEZWZQYXRoLCByZXN1bHRzLndhcm5pbmdzKTtcblxuICAgICAgc2VlblNjb3Blcy5wdXNoKHNjb3BlTmFtZSk7XG5cbiAgICAgIHJldHVybiBzZWVuU2NvcGVzO1xuICAgIH0sIFtdKTtcbiAgfSk7XG5cbiAgLy8gUHJvY2VzcyBtb2RlbCBkZWZpbml0aW9uc1xuICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZFttb2RlbERlZnNQcm9wXSwgZnVuY3Rpb24gKG1vZGVsLCBtb2RlbElkKSB7XG4gICAgdmFyIG1vZGVsRGVmUGF0aCA9IFttb2RlbERlZnNQcm9wLCBtb2RlbElkXTtcbiAgICB2YXIgbW9kZWxNZXRhZGF0YSA9IGdldERlZmluaXRpb25NZXRhZGF0YShtb2RlbERlZlBhdGgpO1xuXG4gICAgLy8gSWRlbnRpZnkgbW9kZWwgaWQgbWlzbWF0Y2ggKElkIGluIG1vZGVscyBvYmplY3QgaXMgbm90IHRoZSBzYW1lIGFzIHRoZSBtb2RlbCdzIGlkIGluIHRoZSBtb2RlbHMgb2JqZWN0KVxuICAgIGlmIChzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgJiYgbW9kZWxJZCAhPT0gbW9kZWwuaWQpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNT0RFTF9JRF9NSVNNQVRDSCcsICdNb2RlbCBpZCBkb2VzIG5vdCBtYXRjaCBpZCBpbiBtb2RlbHMgb2JqZWN0OiAnICsgbW9kZWwuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbERlZlBhdGguY29uY2F0KCdpZCcpLCByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuXG4gICAgLy8gRG8gbm90IHJlcHJvY2VzcyBwYXJlbnRzL3JlZmVyZW5jZXMgaWYgYWxyZWFkeSBwcm9jZXNzZWRcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbE1ldGFkYXRhLmxpbmVhZ2UpKSB7XG4gICAgICAvLyBIYW5kbGUgaW5oZXJpdGFuY2UgcmVmZXJlbmNlc1xuICAgICAgc3dpdGNoIChzd2FnZ2VyVmVyc2lvbikge1xuICAgICAgY2FzZSAnMS4yJzpcbiAgICAgICAgXy5lYWNoKG1vZGVsLnN1YlR5cGVzLCBmdW5jdGlvbiAoc3ViVHlwZSwgaW5kZXgpIHtcbiAgICAgICAgICB2YXIgc3ViUGF0aCA9IFsnbW9kZWxzJywgc3ViVHlwZV07XG4gICAgICAgICAgdmFyIHN1YlB0ciA9IEpzb25SZWZzLnBhdGhUb1B0cihzdWJQYXRoKTtcbiAgICAgICAgICB2YXIgc3ViTWV0YWRhdGEgPSBkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW3N1YlB0cl07XG4gICAgICAgICAgdmFyIHJlZlBhdGggPSBtb2RlbERlZlBhdGguY29uY2F0KFsnc3ViVHlwZXMnLCBpbmRleC50b1N0cmluZygpXSk7XG5cbiAgICAgICAgICAvLyBJZiB0aGUgbWV0YWRhdGEgZG9lcyBub3QgeWV0IGV4aXN0LCBjcmVhdGUgaXRcbiAgICAgICAgICBpZiAoIXN1Yk1ldGFkYXRhICYmIGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWRbbW9kZWxEZWZzUHJvcF1bc3ViVHlwZV0pIHtcbiAgICAgICAgICAgIHN1Yk1ldGFkYXRhID0gZ2V0RGVmaW5pdGlvbk1ldGFkYXRhKHN1YlBhdGgpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIElmIHRoZSByZWZlcmVuY2UgaXMgdmFsaWQsIGFkZCB0aGUgcGFyZW50XG4gICAgICAgICAgaWYgKGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBzdWJQYXRoLCByZWZQYXRoLCByZXN1bHRzKSkge1xuICAgICAgICAgICAgc3ViTWV0YWRhdGEucGFyZW50cy5wdXNoKEpzb25SZWZzLnBhdGhUb1B0cihtb2RlbERlZlBhdGgpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5vcmlnaW5hbFttb2RlbERlZnNQcm9wXVttb2RlbElkXS5hbGxPZiwgZnVuY3Rpb24gKHNjaGVtYSwgaW5kZXgpIHtcbiAgICAgICAgICB2YXIgaXNJbmxpbmUgPSBmYWxzZTtcbiAgICAgICAgICB2YXIgcGFyZW50UGF0aDtcblxuICAgICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKHNjaGVtYS4kcmVmKSB8fCBpc1JlbW90ZVB0cihKc29uUmVmcy5nZXRSZWZEZXRhaWxzKHNjaGVtYSkpKSB7XG4gICAgICAgICAgICBpc0lubGluZSA9IHRydWU7XG4gICAgICAgICAgICBwYXJlbnRQYXRoID0gbW9kZWxEZWZQYXRoLmNvbmNhdChbJ2FsbE9mJywgaW5kZXgudG9TdHJpbmcoKV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXJlbnRQYXRoID0gSnNvblJlZnMucGF0aEZyb21QdHIoc2NoZW1hLiRyZWYpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIElmIHRoZSBwYXJlbnQgbW9kZWwgZG9lcyBub3QgZXhpc3QsIGRvIG5vdCBjcmVhdGUgaXRzIG1ldGFkYXRhXG4gICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHRyYXZlcnNlKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpLmdldChwYXJlbnRQYXRoKSkpIHtcbiAgICAgICAgICAgIC8vIENyZWF0ZSBtZXRhZGF0YSBmb3IgcGFyZW50XG4gICAgICAgICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGFyZW50UGF0aCwgaXNJbmxpbmUpO1xuXG4gICAgICAgICAgICBtb2RlbE1ldGFkYXRhLnBhcmVudHMucHVzaChKc29uUmVmcy5wYXRoVG9QdHIocGFyZW50UGF0aCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICBzd2l0Y2ggKHN3YWdnZXJWZXJzaW9uKSB7XG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gUHJvY2VzcyBwYXJhbWV0ZXIgZGVmaW5pdGlvbnNcbiAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAocGFyYW1ldGVyLCBuYW1lKSB7XG4gICAgICB2YXIgcGF0aCA9IFsncGFyYW1ldGVycycsIG5hbWVdO1xuXG4gICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGF0aCk7XG5cbiAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcGFyYW1ldGVyLCBwYXRoLCByZXN1bHRzKTtcbiAgICB9KTtcblxuICAgIC8vIFByb2Nlc3MgcmVzcG9uc2UgZGVmaW5pdGlvbnNcbiAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5yZXNwb25zZXMsIGZ1bmN0aW9uIChyZXNwb25zZSwgbmFtZSkge1xuICAgICAgdmFyIHBhdGggPSBbJ3Jlc3BvbnNlcycsIG5hbWVdO1xuXG4gICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGF0aCk7XG5cbiAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcmVzcG9uc2UsIHBhdGgsIHJlc3VsdHMpO1xuICAgIH0pO1xuXG4gICAgYnJlYWs7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSBkZWZpbml0aW9uL21vZGVscyAoSW5oZXJpdGFuY2UsIHByb3BlcnR5IGRlZmluaXRpb25zLCAuLi4pXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zLCBmdW5jdGlvbiAobWV0YWRhdGEsIGlkKSB7XG4gICAgdmFyIGRlZlBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVB0cihpZCk7XG4gICAgdmFyIGRlZmluaXRpb24gPSB0cmF2ZXJzZShkb2N1bWVudE1ldGFkYXRhLm9yaWdpbmFsKS5nZXQoZGVmUGF0aCk7XG4gICAgdmFyIGRlZlByb3AgPSBkZWZQYXRoWzBdO1xuICAgIHZhciBjb2RlID0gZGVmUHJvcC5zdWJzdHJpbmcoMCwgZGVmUHJvcC5sZW5ndGggLSAxKS50b1VwcGVyQ2FzZSgpO1xuICAgIHZhciBtc2dQcmVmaXggPSBjb2RlLmNoYXJBdCgwKSArIGNvZGUuc3Vic3RyaW5nKDEpLnRvTG93ZXJDYXNlKCk7XG4gICAgdmFyIGRQcm9wZXJ0aWVzO1xuICAgIHZhciBpUHJvcGVydGllcztcbiAgICB2YXIgbGluZWFnZTtcblxuICAgIC8vIFRoZSBvbmx5IGNoZWNrcyB3ZSBwZXJmb3JtIGJlbG93IGFyZSBpbmhlcml0YW5jZSBjaGVja3Mgc28gc2tpcCBhbGwgbm9uLW1vZGVsIGRlZmluaXRpb25zXG4gICAgaWYgKFsnZGVmaW5pdGlvbnMnLCAnbW9kZWxzJ10uaW5kZXhPZihkZWZQcm9wKSA9PT0gLTEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBkUHJvcGVydGllcyA9IFtdO1xuICAgIGlQcm9wZXJ0aWVzID0gW107XG4gICAgbGluZWFnZSA9IG1ldGFkYXRhLmxpbmVhZ2U7XG5cbiAgICAvLyBEbyBub3QgcmVwcm9jZXNzIGxpbmVhZ2UgaWYgYWxyZWFkeSBwcm9jZXNzZWRcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChsaW5lYWdlKSkge1xuICAgICAgbGluZWFnZSA9IFtdO1xuXG4gICAgICB3YWxrKGlkLCB1bmRlZmluZWQsIGxpbmVhZ2UpO1xuXG4gICAgICAvLyBSb290ID4gbmV4dCA+IC4uLlxuICAgICAgbGluZWFnZS5yZXZlcnNlKCk7XG5cbiAgICAgIG1ldGFkYXRhLmxpbmVhZ2UgPSBfLmNsb25lRGVlcChsaW5lYWdlKTtcblxuICAgICAgbWV0YWRhdGEuY3ljbGljYWwgPSBsaW5lYWdlLmxlbmd0aCA+IDEgJiYgbGluZWFnZVswXSA9PT0gaWQ7XG4gICAgfVxuXG4gICAgLy8gU3dhZ2dlciAxLjIgZG9lcyBub3QgYWxsb3cgbXVsdGlwbGUgaW5oZXJpdGFuY2Ugd2hpbGUgU3dhZ2dlciAyLjArIGRvZXNcbiAgICBpZiAobWV0YWRhdGEucGFyZW50cy5sZW5ndGggPiAxICYmIHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01VTFRJUExFXycgKyBjb2RlICsgJ19JTkhFUklUQU5DRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnQ2hpbGQgJyArIGNvZGUudG9Mb3dlckNhc2UoKSArICcgaXMgc3ViIHR5cGUgb2YgbXVsdGlwbGUgbW9kZWxzOiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIF8ubWFwKG1ldGFkYXRhLnBhcmVudHMsIGZ1bmN0aW9uIChwYXJlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldERpc3BsYXlJZChwYXJlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuam9pbignICYmICcpLCBkZWZQYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuXG4gICAgaWYgKG1ldGFkYXRhLmN5Y2xpY2FsKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQ1lDTElDQUxfJyArIGNvZGUgKyAnX0lOSEVSSVRBTkNFJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZ1ByZWZpeCArICcgaGFzIGEgY2lyY3VsYXIgaW5oZXJpdGFuY2U6ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLm1hcChsaW5lYWdlLCBmdW5jdGlvbiAoZGVwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldERpc3BsYXlJZChkZXApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KS5qb2luKCcgLT4gJykgKyAnIC0+ICcgKyBnZXREaXNwbGF5SWQoaWQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZlBhdGguY29uY2F0KHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdzdWJUeXBlcycgOiAnYWxsT2YnKSwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSBzZWxmIHJlZmVyZW5jZSBmcm9tIHRoZSBlbmQgb2YgdGhlIGxpbmVhZ2UgKEZyb250IHRvbyBpZiBjeWNsaWNhbClcbiAgICBfLmVhY2gobGluZWFnZS5zbGljZShtZXRhZGF0YS5jeWNsaWNhbCA/IDEgOiAwKSwgZnVuY3Rpb24gKGlkKSB7XG4gICAgICB2YXIgcE1vZGVsID0gdHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCkuZ2V0KEpzb25SZWZzLnBhdGhGcm9tUHRyKGlkKSk7XG5cbiAgICAgIF8uZWFjaChPYmplY3Qua2V5cyhwTW9kZWwucHJvcGVydGllcyB8fCB7fSksIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIGlmIChpUHJvcGVydGllcy5pbmRleE9mKG5hbWUpID09PSAtMSkge1xuICAgICAgICAgIGlQcm9wZXJ0aWVzLnB1c2gobmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gVmFsaWRhdGUgc2ltcGxlIGRlZmluaXRpb25zXG4gICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLCBkZWZpbml0aW9uLCBkZWZQYXRoLCByZXN1bHRzKTtcblxuICAgIC8vIElkZW50aWZ5IHJlZGVjbGFyZWQgcHJvcGVydGllc1xuICAgIF8uZWFjaChkZWZpbml0aW9uLnByb3BlcnRpZXMsIGZ1bmN0aW9uIChwcm9wZXJ0eSwgbmFtZSkge1xuICAgICAgdmFyIHBQYXRoID0gZGVmUGF0aC5jb25jYXQoWydwcm9wZXJ0aWVzJywgbmFtZV0pO1xuXG4gICAgICAvLyBEbyBub3QgcHJvY2VzcyB1bnJlc29sdmVkIHByb3BlcnRpZXNcbiAgICAgIGlmICghXy5pc1VuZGVmaW5lZChwcm9wZXJ0eSkpIHtcbiAgICAgICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLCBwcm9wZXJ0eSwgcFBhdGgsIHJlc3VsdHMpO1xuXG4gICAgICAgIGlmIChpUHJvcGVydGllcy5pbmRleE9mKG5hbWUpID4gLTEpIHtcbiAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQ0hJTERfJyArIGNvZGUgKyAnX1JFREVDTEFSRVNfUFJPUEVSVFknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdDaGlsZCAnICsgY29kZS50b0xvd2VyQ2FzZSgpICsgJyBkZWNsYXJlcyBwcm9wZXJ0eSBhbHJlYWR5IGRlY2xhcmVkIGJ5IGFuY2VzdG9yOiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZFByb3BlcnRpZXMucHVzaChuYW1lKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gSWRlbnRpZnkgbWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0aWVzXG4gICAgXy5lYWNoKGRlZmluaXRpb24ucmVxdWlyZWQgfHwgW10sIGZ1bmN0aW9uIChuYW1lLCBpbmRleCkge1xuICAgICAgdmFyIHR5cGUgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnTW9kZWwnIDogJ0RlZmluaXRpb24nO1xuXG4gICAgICBpZiAoaVByb3BlcnRpZXMuaW5kZXhPZihuYW1lKSA9PT0gLTEgJiYgZFByb3BlcnRpZXMuaW5kZXhPZihuYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01JU1NJTkdfUkVRVUlSRURfJyArIHR5cGUudG9VcHBlckNhc2UoKSArICdfUFJPUEVSVFknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlICsgJyByZXF1aXJlcyBwcm9wZXJ0eSBidXQgaXQgaXMgbm90IGRlZmluZWQ6ICcgKyBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZQYXRoLmNvbmNhdChbJ3JlcXVpcmVkJywgaW5kZXgudG9TdHJpbmcoKV0pLCByZXN1bHRzLmVycm9ycyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuXG4gIGlmIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgIGpzb25SZWZzT3B0aW9ucy5yZWZQcmVQcm9jZXNzb3IgPSBzd2FnZ2VyMVJlZlByZVByb2Nlc29yO1xuICB9XG5cbiAgLy8gUHJvY2VzcyBsb2NhbCByZWZlcmVuY2VzXG4gIF8uZWFjaChKc29uUmVmcy5maW5kUmVmcyhkb2N1bWVudE1ldGFkYXRhLm9yaWdpbmFsLCBqc29uUmVmc09wdGlvbnMpLCBmdW5jdGlvbiAocmVmRGV0YWlscywgcmVmUHRyKSB7XG4gICAgYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsIHJlZkRldGFpbHMudXJpLCByZWZQdHIsIHJlc3VsdHMpO1xuICB9KTtcblxuICAvLyBQcm9jZXNzIGludmFsaWQgcmVmZXJlbmNlc1xuICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZWZlcmVuY2VzTWV0YWRhdGEsIGZ1bmN0aW9uIChyZWZEZXRhaWxzLCByZWZQdHIpIHtcbiAgICBpZiAoaXNSZW1vdGVQdHIocmVmRGV0YWlscykgJiYgcmVmRGV0YWlscy5taXNzaW5nID09PSB0cnVlKSB7XG4gICAgICByZXN1bHRzLmVycm9ycy5wdXNoKHtcbiAgICAgICAgY29kZTogJ1VOUkVTT0xWQUJMRV9SRUZFUkVOQ0UnLFxuICAgICAgICBtZXNzYWdlOiAnUmVmZXJlbmNlIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHNhbml0aXplUmVmKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24sIHJlZkRldGFpbHMudXJpKSxcbiAgICAgICAgcGF0aDogSnNvblJlZnMucGF0aEZyb21QdHIocmVmUHRyKS5jb25jYXQoJyRyZWYnKVxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbn07XG5cbnZhciB2YWxpZGF0ZUV4aXN0ID0gZnVuY3Rpb24gKGRhdGEsIHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChkYXRhKSAmJiBkYXRhLmluZGV4T2YodmFsKSA9PT0gLTEpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHZhbCwgcGF0aCwgZGVzdCk7XG4gIH1cbn07XG5cbnZhciBwcm9jZXNzQXV0aFJlZnMgPSBmdW5jdGlvbiAoZG9jdW1lbnRNZXRhZGF0YSwgYXV0aFJlZnMsIHBhdGgsIHJlc3VsdHMpIHtcbiAgdmFyIGNvZGUgPSBkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdBVVRIT1JJWkFUSU9OJyA6ICdTRUNVUklUWV9ERUZJTklUSU9OJztcbiAgdmFyIG1zZ1ByZWZpeCA9IGNvZGUgPT09ICdBVVRIT1JJWkFUSU9OJyA/ICdBdXRob3JpemF0aW9uJyA6ICdTZWN1cml0eSBkZWZpbml0aW9uJztcblxuICBpZiAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICBfLnJlZHVjZShhdXRoUmVmcywgZnVuY3Rpb24gKHNlZW5OYW1lcywgc2NvcGVzLCBuYW1lKSB7XG4gICAgICB2YXIgYXV0aFB0ciA9IFsnYXV0aG9yaXphdGlvbnMnLCBuYW1lXTtcbiAgICAgIHZhciBhUGF0aCA9IHBhdGguY29uY2F0KFtuYW1lXSk7XG5cbiAgICAgIC8vIEFkZCByZWZlcmVuY2Ugb3IgcmVjb3JkIHVucmVzb2x2ZWQgYXV0aG9yaXphdGlvblxuICAgICAgaWYgKGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBhdXRoUHRyLCBhUGF0aCwgcmVzdWx0cykpIHtcbiAgICAgICAgXy5yZWR1Y2Uoc2NvcGVzLCBmdW5jdGlvbiAoc2VlblNjb3Blcywgc2NvcGUsIGluZGV4KSB7XG4gICAgICAgICAgdmFyIHNQYXRoID0gYVBhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCksICdzY29wZScpO1xuICAgICAgICAgIHZhciBzUHRyID0gYXV0aFB0ci5jb25jYXQoWydzY29wZXMnLCBzY29wZS5zY29wZV0pO1xuXG4gICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5TY29wZXMsIHNjb3BlLnNjb3BlLCBjb2RlICsgJ19TQ09QRV9SRUZFUkVOQ0UnLCBtc2dQcmVmaXggKyAnIHNjb3BlIHJlZmVyZW5jZScsIHNQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLndhcm5pbmdzKTtcblxuICAgICAgICAgIC8vIEFkZCByZWZlcmVuY2Ugb3IgcmVjb3JkIHVucmVzb2x2ZWQgYXV0aG9yaXphdGlvbiBzY29wZVxuICAgICAgICAgIGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBzUHRyLCBzUGF0aCwgcmVzdWx0cyk7XG5cbiAgICAgICAgICByZXR1cm4gc2VlblNjb3Blcy5jb25jYXQoc2NvcGUuc2NvcGUpO1xuICAgICAgICB9LCBbXSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzZWVuTmFtZXMuY29uY2F0KG5hbWUpO1xuICAgIH0sIFtdKTtcbiAgfSBlbHNlIHtcbiAgICBfLnJlZHVjZShhdXRoUmVmcywgZnVuY3Rpb24gKHNlZW5OYW1lcywgc2NvcGVzLCBpbmRleCkge1xuICAgICAgXy5lYWNoKHNjb3BlcywgZnVuY3Rpb24gKHNjb3BlcywgbmFtZSkge1xuICAgICAgICB2YXIgYXV0aFB0ciA9IFsnc2VjdXJpdHlEZWZpbml0aW9ucycsIG5hbWVdO1xuICAgICAgICB2YXIgYXV0aFJlZlBhdGggPSBwYXRoLmNvbmNhdChpbmRleC50b1N0cmluZygpLCBuYW1lKTtcblxuICAgICAgICAvLyBFbnN1cmUgdGhlIHNlY3VyaXR5IGRlZmluaXRpb24gaXNuJ3QgcmVmZXJlbmNlZCBtb3JlIHRoYW4gb25jZSAoU3dhZ2dlciAyLjArKVxuICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2Vlbk5hbWVzLCBuYW1lLCBjb2RlICsgJ19SRUZFUkVOQ0UnLCBtc2dQcmVmaXggKyAnIHJlZmVyZW5jZScsIGF1dGhSZWZQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy53YXJuaW5ncyk7XG5cbiAgICAgICAgc2Vlbk5hbWVzLnB1c2gobmFtZSk7XG5cbiAgICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uXG4gICAgICAgIGlmIChhZGRSZWZlcmVuY2UoZG9jdW1lbnRNZXRhZGF0YSwgYXV0aFB0ciwgYXV0aFJlZlBhdGgsIHJlc3VsdHMpKSB7XG4gICAgICAgICAgXy5lYWNoKHNjb3BlcywgZnVuY3Rpb24gKHNjb3BlLCBpbmRleCkge1xuICAgICAgICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uIHNjb3BlXG4gICAgICAgICAgICB2YXIgc1B0ciA9IGF1dGhQdHIuY29uY2F0KFsnc2NvcGVzJywgc2NvcGVdKTtcbiAgICAgICAgICAgIGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBzUHRyLCBhdXRoUmVmUGF0aC5jb25jYXQoaW5kZXgudG9TdHJpbmcoKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cyk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gc2Vlbk5hbWVzO1xuICAgIH0sIFtdKTtcbiAgfVxufTtcblxudmFyIHJlc29sdmVSZWZzID0gZnVuY3Rpb24gKGFwaURPclNPLCBjYWxsYmFjaykge1xuICB2YXIgY2FjaGVFbnRyeSA9IGdldERvY3VtZW50Q2FjaGUoYXBpRE9yU08pO1xuICB2YXIgc3dhZ2dlclZlcnNpb24gPSBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGFwaURPclNPKTtcbiAgdmFyIGpzb25SZWZzT3B0aW9ucyA9IHtcbiAgICBpbmNsdWRlSW52YWxpZDogdHJ1ZSxcbiAgICBsb2FkZXJPcHRpb25zOiB7XG4gICAgICBwcm9jZXNzQ29udGVudDogZnVuY3Rpb24gKHJlcywgY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCBZQU1MLnNhZmVMb2FkKHJlcy50ZXh0KSk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGlmICghY2FjaGVFbnRyeS5yZXNvbHZlZCkge1xuICAgIC8vIEZvciBTd2FnZ2VyIDEuMiwgd2UgaGF2ZSB0byBjcmVhdGUgcmVhbCBKU09OIFJlZmVyZW5jZXNcbiAgICBpZiAoc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICBqc29uUmVmc09wdGlvbnMucmVmUHJlUHJvY2Vzc29yID0gc3dhZ2dlcjFSZWZQcmVQcm9jZXNvcjtcbiAgICB9XG5cbiAgICAvLyBSZXNvbHZlIHJlZmVyZW5jZXNcbiAgICBKc29uUmVmcy5yZXNvbHZlUmVmcyhhcGlET3JTTywganNvblJlZnNPcHRpb25zKVxuICAgICAgLnRoZW4oZnVuY3Rpb24gKHJlc3VsdHMpIHtcbiAgICAgICAgcmVtb3ZlQ2lyY3VsYXJzKHJlc3VsdHMucmVzb2x2ZWQpO1xuXG4gICAgICAgIC8vIEZpeCBjaXJjdWxhciByZWZlcmVuY2VzXG4gICAgICAgIF8uZWFjaChyZXN1bHRzLnJlZnMsIGZ1bmN0aW9uIChyZWZEZXRhaWxzLCByZWZQdHIpIHtcbiAgICAgICAgICBpZiAocmVmRGV0YWlscy5jaXJjdWxhcikge1xuICAgICAgICAgICAgXy5zZXQocmVzdWx0cy5yZXNvbHZlZCwgSnNvblJlZnMucGF0aEZyb21QdHIocmVmUHRyKSwge30pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY2FjaGVFbnRyeS5yZWZlcmVuY2VzTWV0YWRhdGEgPSByZXN1bHRzLnJlZnM7XG4gICAgICAgIGNhY2hlRW50cnkucmVzb2x2ZWQgPSByZXN1bHRzLnJlc29sdmVkO1xuICAgICAgICBjYWNoZUVudHJ5LnJlc29sdmVkSWQgPSBTcGFya01ENS5oYXNoKEpTT04uc3RyaW5naWZ5KHJlc3VsdHMucmVzb2x2ZWQpKTtcblxuICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChjYWxsYmFjayk7XG4gIH0gZWxzZSB7XG4gICAgY2FsbGJhY2soKTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSA9IGZ1bmN0aW9uIChzcGVjLCBzY2hlbWFPck5hbWUsIGRhdGEsIGNhbGxiYWNrKSB7XG4gIHZhciB2YWxpZGF0b3IgPSBfLmlzU3RyaW5nKHNjaGVtYU9yTmFtZSkgPyBzcGVjLnZhbGlkYXRvcnNbc2NoZW1hT3JOYW1lXSA6IGhlbHBlcnMuY3JlYXRlSnNvblZhbGlkYXRvcigpO1xuXG4gIGhlbHBlcnMucmVnaXN0ZXJDdXN0b21Gb3JtYXRzKGRhdGEpO1xuXG4gIHRyeSB7XG4gICAgdmFsaWRhdG9ycy52YWxpZGF0ZUFnYWluc3RTY2hlbWEoc2NoZW1hT3JOYW1lLCBkYXRhLCB2YWxpZGF0b3IpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBpZiAoZXJyLmZhaWxlZFZhbGlkYXRpb24pIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayh1bmRlZmluZWQsIGVyci5yZXN1bHRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgfVxuICB9XG5cbiAgcmVzb2x2ZVJlZnMoZGF0YSwgZnVuY3Rpb24gKGVycikge1xuICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICB9KTtcbn07XG5cbnZhciB2YWxpZGF0ZURlZmluaXRpb25zID0gZnVuY3Rpb24gKGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpIHtcbiAgLy8gVmFsaWRhdGUgdW51c2VkIGRlZmluaXRpb25zXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zLCBmdW5jdGlvbiAobWV0YWRhdGEsIGlkKSB7XG4gICAgdmFyIGRlZlBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVB0cihpZCk7XG4gICAgdmFyIGRlZlR5cGUgPSBkZWZQYXRoWzBdLnN1YnN0cmluZygwLCBkZWZQYXRoWzBdLmxlbmd0aCAtIDEpO1xuICAgIHZhciBkaXNwbGF5SWQgPSBkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/IGRlZlBhdGhbZGVmUGF0aC5sZW5ndGggLSAxXSA6IGlkO1xuICAgIHZhciBjb2RlID0gZGVmVHlwZSA9PT0gJ3NlY3VyaXR5RGVmaW5pdGlvbicgPyAnU0VDVVJJVFlfREVGSU5JVElPTicgOiBkZWZUeXBlLnRvVXBwZXJDYXNlKCk7XG4gICAgdmFyIG1zZ1ByZWZpeCA9IGRlZlR5cGUgPT09ICdzZWN1cml0eURlZmluaXRpb24nID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ1NlY3VyaXR5IGRlZmluaXRpb24nIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmVHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGRlZlR5cGUuc3Vic3RyaW5nKDEpO1xuXG4gICAgaWYgKG1ldGFkYXRhLnJlZmVyZW5jZXMubGVuZ3RoID09PSAwICYmICFtZXRhZGF0YS5pbmxpbmUpIHtcbiAgICAgIC8vIFN3YWdnZXIgMS4yIGF1dGhvcml6YXRpb24gc2NvcGVcbiAgICAgIGlmIChtZXRhZGF0YS5zY29wZVBhdGgpIHtcbiAgICAgICAgY29kZSArPSAnX1NDT1BFJztcbiAgICAgICAgbXNnUHJlZml4ICs9ICcgc2NvcGUnO1xuICAgICAgICBkZWZQYXRoID0gbWV0YWRhdGEuc2NvcGVQYXRoO1xuICAgICAgfVxuXG4gICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhkaXNwbGF5SWQsIGNvZGUsIG1zZ1ByZWZpeCwgZGVmUGF0aCwgcmVzdWx0cy53YXJuaW5ncyk7XG4gICAgfVxuICB9KTtcbn07XG5cbnZhciB2YWxpZGF0ZVBhcmFtZXRlcnMgPSBmdW5jdGlvbiAoc3BlYywgZG9jdW1lbnRNZXRhZGF0YSwgblBhdGgsIHBhcmFtZXRlcnMsIHBhdGgsIHJlc3VsdHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNraXBNaXNzaW5nKSB7XG4gIHZhciBjcmVhdGVQYXJhbWV0ZXJDb21ib0Vycm9yID0gZnVuY3Rpb24gKHBhdGgpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnSU5WQUxJRF9QQVJBTUVURVJfQ09NQklOQVRJT04nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgY2Fubm90IGhhdmUgYSBhIGJvZHkgcGFyYW1ldGVyIGFuZCBhICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgKHNwZWMudmVyc2lvbiA9PT0gJzEuMicgPyAnZm9ybScgOiAnZm9ybURhdGEnKSArICcgcGFyYW1ldGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gIH07XG4gIHZhciBwYXRoUGFyYW1zID0gW107XG4gIHZhciBzZWVuQm9keVBhcmFtID0gZmFsc2U7XG4gIHZhciBzZWVuRm9ybVBhcmFtID0gZmFsc2U7XG5cbiAgXy5yZWR1Y2UocGFyYW1ldGVycywgZnVuY3Rpb24gKHNlZW5QYXJhbWV0ZXJzLCBwYXJhbWV0ZXIsIGluZGV4KSB7XG4gICAgdmFyIHBQYXRoID0gcGF0aC5jb25jYXQoWydwYXJhbWV0ZXJzJywgaW5kZXgudG9TdHJpbmcoKV0pO1xuXG4gICAgLy8gVW5yZXNvbHZlZCBwYXJhbWV0ZXJcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSWRlbnRpZnkgZHVwbGljYXRlIHBhcmFtZXRlciBuYW1lc1xuICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLm5hbWUsICdQQVJBTUVURVInLCAnUGFyYW1ldGVyJywgcFBhdGguY29uY2F0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcblxuICAgIC8vIEtlZXAgdHJhY2sgb2YgYm9keSBhbmQgcGF0aCBwYXJhbWV0ZXJzXG4gICAgaWYgKHBhcmFtZXRlci5wYXJhbVR5cGUgPT09ICdib2R5JyB8fCBwYXJhbWV0ZXIuaW4gPT09ICdib2R5Jykge1xuICAgICAgaWYgKHNlZW5Cb2R5UGFyYW0gPT09IHRydWUpIHtcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV9BUElfQk9EWV9QQVJBTUVURVInLCAnQVBJIGhhcyBtb3JlIHRoYW4gb25lIGJvZHkgcGFyYW1ldGVyJywgcFBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VlbkZvcm1QYXJhbSA9PT0gdHJ1ZSkge1xuICAgICAgICBjcmVhdGVQYXJhbWV0ZXJDb21ib0Vycm9yKHBQYXRoKTtcbiAgICAgIH1cblxuICAgICAgc2VlbkJvZHlQYXJhbSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChwYXJhbWV0ZXIucGFyYW1UeXBlID09PSAnZm9ybScgfHwgcGFyYW1ldGVyLmluID09PSAnZm9ybURhdGEnKSB7XG4gICAgICBpZiAoc2VlbkJvZHlQYXJhbSA9PT0gdHJ1ZSkge1xuICAgICAgICBjcmVhdGVQYXJhbWV0ZXJDb21ib0Vycm9yKHBQYXRoKTtcbiAgICAgIH1cblxuICAgICAgc2VlbkZvcm1QYXJhbSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChwYXJhbWV0ZXIucGFyYW1UeXBlID09PSAncGF0aCcgfHwgcGFyYW1ldGVyLmluID09PSAncGF0aCcpIHtcbiAgICAgIGlmIChuUGF0aC5hcmdzLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFX0FQSV9QQVRIX1BBUkFNRVRFUicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgcGF0aCBwYXJhbWV0ZXIgY291bGQgbm90IGJlIHJlc29sdmVkOiAnICsgcGFyYW1ldGVyLm5hbWUsIHBQYXRoLmNvbmNhdCgnbmFtZScpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XG4gICAgICB9XG5cbiAgICAgIHBhdGhQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgfVxuXG4gICAgaWYgKHNwZWMucHJpbWl0aXZlcy5pbmRleE9mKHBhcmFtZXRlci50eXBlKSA9PT0gLTEgJiYgc3BlYy52ZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsICcjL21vZGVscy8nICsgcGFyYW1ldGVyLnR5cGUsIHBQYXRoLmNvbmNhdCgndHlwZScpLCByZXN1bHRzKTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBwYXJhbWV0ZXIgY29uc3RyYWludHNcbiAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEsIHBhcmFtZXRlciwgcFBhdGgsIHJlc3VsdHMsIHBhcmFtZXRlci5za2lwRXJyb3JzKTtcblxuICAgIHJldHVybiBzZWVuUGFyYW1ldGVycy5jb25jYXQocGFyYW1ldGVyLm5hbWUpO1xuICB9LCBbXSk7XG5cbiAgLy8gVmFsaWRhdGUgbWlzc2luZyBwYXRoIHBhcmFtZXRlcnMgKGluIHBhdGggYnV0IG5vdCBpbiBvcGVyYXRpb24ucGFyYW1ldGVycylcbiAgaWYgKF8uaXNVbmRlZmluZWQoc2tpcE1pc3NpbmcpIHx8IHNraXBNaXNzaW5nID09PSBmYWxzZSkge1xuICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoblBhdGguYXJncywgcGF0aFBhcmFtcyksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNSVNTSU5HX0FQSV9QQVRIX1BBUkFNRVRFUicsICdBUEkgcmVxdWlyZXMgcGF0aCBwYXJhbWV0ZXIgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgdW51c2VkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBwYXRoLnNsaWNlKDAsIDIpLmNvbmNhdCgncGF0aCcpIDogcGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcbiAgICB9KTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlU3dhZ2dlcjFfMiA9IGZ1bmN0aW9uIChzcGVjLCByZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucywgY2FsbGJhY2spIHsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG4gIHZhciBhZFJlc291cmNlUGF0aHMgPSBbXTtcbiAgdmFyIHJsRG9jdW1lbnRNZXRhZGF0YSA9IGdldERvY3VtZW50Q2FjaGUocmVzb3VyY2VMaXN0aW5nKTtcbiAgdmFyIHJsUmVzb3VyY2VQYXRocyA9IFtdO1xuICB2YXIgcmVzdWx0cyA9IHtcbiAgICBlcnJvcnM6IFtdLFxuICAgIHdhcm5pbmdzOiBbXSxcbiAgICBhcGlEZWNsYXJhdGlvbnM6IFtdXG4gIH07XG5cbiAgLy8gUHJvY2VzcyBSZXNvdXJjZSBMaXN0aW5nIHJlc291cmNlIGRlZmluaXRpb25zXG4gIHJsUmVzb3VyY2VQYXRocyA9IF8ucmVkdWNlKHJlc291cmNlTGlzdGluZy5hcGlzLCBmdW5jdGlvbiAoc2VlblBhdGhzLCBhcGksIGluZGV4KSB7XG4gICAgLy8gSWRlbnRpZnkgZHVwbGljYXRlIHJlc291cmNlIHBhdGhzIGRlZmluZWQgaW4gdGhlIFJlc291cmNlIExpc3RpbmdcbiAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblBhdGhzLCBhcGkucGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsIFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCksICdwYXRoJ10sXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcblxuICAgIHNlZW5QYXRocy5wdXNoKGFwaS5wYXRoKTtcblxuICAgIHJldHVybiBzZWVuUGF0aHM7XG4gIH0sIFtdKTtcblxuICAvLyBQcm9jZXNzIFJlc291cmNlIExpc3RpbmcgZGVmaW5pdGlvbnMgKGF1dGhvcml6YXRpb25zKVxuICBwcm9jZXNzRG9jdW1lbnQocmxEb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKTtcblxuXG4gIC8vIFByb2Nlc3MgZWFjaCBBUEkgRGVjbGFyYXRpb25cbiAgYWRSZXNvdXJjZVBhdGhzID0gXy5yZWR1Y2UoYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoc2VlblJlc291cmNlUGF0aHMsIGFwaURlY2xhcmF0aW9uLCBpbmRleCkge1xuICAgIHZhciBhUmVzdWx0cyA9IHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zW2luZGV4XSA9IHtcbiAgICAgIGVycm9yczogW10sXG4gICAgICB3YXJuaW5nczogW11cbiAgICB9O1xuICAgIHZhciBhZERvY3VtZW50TWV0YWRhdGEgPSBnZXREb2N1bWVudENhY2hlKGFwaURlY2xhcmF0aW9uKTtcblxuICAgIC8vIElkZW50aWZ5IGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRocyBkZWZpbmVkIGluIHRoZSBBUEkgRGVjbGFyYXRpb25zXG4gICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5SZXNvdXJjZVBhdGhzLCBhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLFxuICAgICAgICAgICAgICAgICAgICBbJ3Jlc291cmNlUGF0aCddLCBhUmVzdWx0cy5lcnJvcnMpO1xuXG4gICAgaWYgKGFkUmVzb3VyY2VQYXRocy5pbmRleE9mKGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCkgPT09IC0xKSB7XG4gICAgICAvLyBJZGVudGlmeSB1bnVzZWQgcmVzb3VyY2UgcGF0aHMgZGVmaW5lZCBpbiB0aGUgQVBJIERlY2xhcmF0aW9uc1xuICAgICAgdmFsaWRhdGVFeGlzdChybFJlc291cmNlUGF0aHMsIGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsXG4gICAgICAgICAgICAgICAgICAgIFsncmVzb3VyY2VQYXRoJ10sIGFSZXN1bHRzLmVycm9ycyk7XG5cbiAgICAgIHNlZW5SZXNvdXJjZVBhdGhzLnB1c2goYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPOiBQcm9jZXNzIGF1dGhvcml6YXRpb24gcmVmZXJlbmNlc1xuICAgIC8vIE5vdCBwb3NzaWJsZSBkdWUgdG8gaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9pc3N1ZXMvMTU5XG5cbiAgICAvLyBQcm9jZXNzIG1vZGVsc1xuICAgIHByb2Nlc3NEb2N1bWVudChhZERvY3VtZW50TWV0YWRhdGEsIGFSZXN1bHRzKTtcblxuICAgIC8vIFByb2Nlc3MgdGhlIEFQSSBkZWZpbml0aW9uc1xuICAgIF8ucmVkdWNlKGFwaURlY2xhcmF0aW9uLmFwaXMsIGZ1bmN0aW9uIChzZWVuUGF0aHMsIGFwaSwgaW5kZXgpIHtcbiAgICAgIHZhciBhUGF0aCA9IFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCldO1xuICAgICAgdmFyIG5QYXRoID0gbm9ybWFsaXplUGF0aChhcGkucGF0aCk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXG4gICAgICBpZiAoc2VlblBhdGhzLmluZGV4T2YoblBhdGgucGF0aCkgPiAtMSkge1xuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFX0FQSV9QQVRIJywgJ0FQSSBwYXRoIChvciBlcXVpdmFsZW50KSBhbHJlYWR5IGRlZmluZWQ6ICcgKyBhcGkucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYVBhdGguY29uY2F0KCdwYXRoJyksIGFSZXN1bHRzLmVycm9ycyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWVuUGF0aHMucHVzaChuUGF0aC5wYXRoKTtcbiAgICAgIH1cblxuICAgICAgLy8gUHJvY2VzcyB0aGUgQVBJIG9wZXJhdGlvbnNcbiAgICAgIF8ucmVkdWNlKGFwaS5vcGVyYXRpb25zLCBmdW5jdGlvbiAoc2Vlbk1ldGhvZHMsIG9wZXJhdGlvbiwgaW5kZXgpIHtcbiAgICAgICAgdmFyIG9QYXRoID0gYVBhdGguY29uY2F0KFsnb3BlcmF0aW9ucycsIGluZGV4LnRvU3RyaW5nKCldKTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgb3BlcmF0aW9uIG1ldGhvZFxuICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2Vlbk1ldGhvZHMsIG9wZXJhdGlvbi5tZXRob2QsICdPUEVSQVRJT05fTUVUSE9EJywgJ09wZXJhdGlvbiBtZXRob2QnLCBvUGF0aC5jb25jYXQoJ21ldGhvZCcpLFxuICAgICAgICAgICAgICAgICAgICAgICAgYVJlc3VsdHMuZXJyb3JzKTtcblxuICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIHRoZSBzZWVuIG1ldGhvZHNcbiAgICAgICAgc2Vlbk1ldGhvZHMucHVzaChvcGVyYXRpb24ubWV0aG9kKTtcblxuICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIG9wZXJhdGlvbiB0eXBlc1xuICAgICAgICBpZiAoc3BlYy5wcmltaXRpdmVzLmluZGV4T2Yob3BlcmF0aW9uLnR5cGUpID09PSAtMSAmJiBzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICAgICAgYWRkUmVmZXJlbmNlKGFkRG9jdW1lbnRNZXRhZGF0YSwgJyMvbW9kZWxzLycgKyBvcGVyYXRpb24udHlwZSwgb1BhdGguY29uY2F0KCd0eXBlJyksIGFSZXN1bHRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByb2Nlc3MgYXV0aG9yaXphdGlvbiByZWZlcmVuY2VzXG4gICAgICAgIHByb2Nlc3NBdXRoUmVmcyhybERvY3VtZW50TWV0YWRhdGEsIG9wZXJhdGlvbi5hdXRob3JpemF0aW9ucywgb1BhdGguY29uY2F0KCdhdXRob3JpemF0aW9ucycpLCBhUmVzdWx0cyk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdmFsaWRhdGUgaW5saW5lIGNvbnN0cmFpbnRzXG4gICAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoYWREb2N1bWVudE1ldGFkYXRhLCBvcGVyYXRpb24sIG9QYXRoLCBhUmVzdWx0cyk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgcGFyYW1ldGVyc1xuICAgICAgICB2YWxpZGF0ZVBhcmFtZXRlcnMoc3BlYywgYWREb2N1bWVudE1ldGFkYXRhLCBuUGF0aCwgb3BlcmF0aW9uLnBhcmFtZXRlcnMsIG9QYXRoLCBhUmVzdWx0cyk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdW5pcXVlIHJlc3BvbnNlIGNvZGVcbiAgICAgICAgXy5yZWR1Y2Uob3BlcmF0aW9uLnJlc3BvbnNlTWVzc2FnZXMsIGZ1bmN0aW9uIChzZWVuUmVzcG9uc2VDb2RlcywgcmVzcG9uc2VNZXNzYWdlLCBpbmRleCkge1xuICAgICAgICAgIHZhciBybVBhdGggPSBvUGF0aC5jb25jYXQoWydyZXNwb25zZU1lc3NhZ2VzJywgaW5kZXgudG9TdHJpbmcoKV0pO1xuXG4gICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5SZXNwb25zZUNvZGVzLCByZXNwb25zZU1lc3NhZ2UuY29kZSwgJ1JFU1BPTlNFX01FU1NBR0VfQ09ERScsICdSZXNwb25zZSBtZXNzYWdlIGNvZGUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBybVBhdGguY29uY2F0KFsnY29kZSddKSwgYVJlc3VsdHMuZXJyb3JzKTtcblxuICAgICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgbW9kZWxcbiAgICAgICAgICBpZiAocmVzcG9uc2VNZXNzYWdlLnJlc3BvbnNlTW9kZWwpIHtcbiAgICAgICAgICAgIGFkZFJlZmVyZW5jZShhZERvY3VtZW50TWV0YWRhdGEsICcjL21vZGVscy8nICsgcmVzcG9uc2VNZXNzYWdlLnJlc3BvbnNlTW9kZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgcm1QYXRoLmNvbmNhdCgncmVzcG9uc2VNb2RlbCcpLCBhUmVzdWx0cyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHNlZW5SZXNwb25zZUNvZGVzLmNvbmNhdChyZXNwb25zZU1lc3NhZ2UuY29kZSk7XG4gICAgICAgIH0sIFtdKTtcblxuICAgICAgICByZXR1cm4gc2Vlbk1ldGhvZHM7XG4gICAgICB9LCBbXSk7XG5cbiAgICAgIHJldHVybiBzZWVuUGF0aHM7XG4gICAgfSwgW10pO1xuXG4gICAgLy8gVmFsaWRhdGUgQVBJIERlY2xhcmF0aW9uIGRlZmluaXRpb25zXG4gICAgdmFsaWRhdGVEZWZpbml0aW9ucyhhZERvY3VtZW50TWV0YWRhdGEsIGFSZXN1bHRzKTtcblxuICAgIHJldHVybiBzZWVuUmVzb3VyY2VQYXRocztcbiAgfSwgW10pO1xuXG4gIC8vIFZhbGlkYXRlIEFQSSBEZWNsYXJhdGlvbiBkZWZpbml0aW9uc1xuICB2YWxpZGF0ZURlZmluaXRpb25zKHJsRG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XG5cbiAgLy8gSWRlbnRpZnkgdW51c2VkIHJlc291cmNlIHBhdGhzIGRlZmluZWQgaW4gdGhlIFJlc291cmNlIExpc3RpbmdcbiAgXy5lYWNoKF8uZGlmZmVyZW5jZShybFJlc291cmNlUGF0aHMsIGFkUmVzb3VyY2VQYXRocyksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICB2YXIgaW5kZXggPSBybFJlc291cmNlUGF0aHMuaW5kZXhPZih1bnVzZWQpO1xuXG4gICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcocmVzb3VyY2VMaXN0aW5nLmFwaXNbaW5kZXhdLnBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCksICdwYXRoJ10sIHJlc3VsdHMuZXJyb3JzKTtcbiAgfSk7XG5cbiAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXN1bHRzKTtcbn07XG5cbnZhciB2YWxpZGF0ZVN3YWdnZXIyXzAgPSBmdW5jdGlvbiAoc3BlYywgc3dhZ2dlck9iamVjdCwgY2FsbGJhY2spIHsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG4gIHZhciBkb2N1bWVudE1ldGFkYXRhID0gZ2V0RG9jdW1lbnRDYWNoZShzd2FnZ2VyT2JqZWN0KTtcbiAgdmFyIHJlc3VsdHMgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcblxuICAvLyBQcm9jZXNzIGRlZmluaXRpb25zXG4gIHByb2Nlc3NEb2N1bWVudChkb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKTtcblxuICAvLyBQcm9jZXNzIHNlY3VyaXR5IHJlZmVyZW5jZXNcbiAgcHJvY2Vzc0F1dGhSZWZzKGRvY3VtZW50TWV0YWRhdGEsIHN3YWdnZXJPYmplY3Quc2VjdXJpdHksIFsnc2VjdXJpdHknXSwgcmVzdWx0cyk7XG5cbiAgXy5yZWR1Y2UoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5wYXRocywgZnVuY3Rpb24gKHNlZW5QYXRocywgcGF0aCwgbmFtZSkge1xuICAgIHZhciBwUGF0aCA9IFsncGF0aHMnLCBuYW1lXTtcbiAgICB2YXIgblBhdGggPSBub3JtYWxpemVQYXRoKG5hbWUpO1xuXG4gICAgLy8gVmFsaWRhdGUgZHVwbGljYXRlIHJlc291cmNlIHBhdGhcbiAgICBpZiAoc2VlblBhdGhzLmluZGV4T2YoblBhdGgucGF0aCkgPiAtMSkge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV9BUElfUEFUSCcsICdBUEkgcGF0aCAob3IgZXF1aXZhbGVudCkgYWxyZWFkeSBkZWZpbmVkOiAnICsgbmFtZSwgcFBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgcGFyYW1ldGVyc1xuICAgIHZhbGlkYXRlUGFyYW1ldGVycyhzcGVjLCBkb2N1bWVudE1ldGFkYXRhLCBuUGF0aCwgcGF0aC5wYXJhbWV0ZXJzLCBwUGF0aCwgcmVzdWx0cywgdHJ1ZSk7XG5cbiAgICAvLyBWYWxpZGF0ZSB0aGUgT3BlcmF0aW9uc1xuICAgIF8uZWFjaChwYXRoLCBmdW5jdGlvbiAob3BlcmF0aW9uLCBtZXRob2QpIHtcbiAgICAgIHZhciBjUGFyYW1zID0gW107XG4gICAgICB2YXIgb1BhdGggPSBwUGF0aC5jb25jYXQobWV0aG9kKTtcbiAgICAgIHZhciBzZWVuUGFyYW1zID0gW107XG5cbiAgICAgIGlmICh2YWxpZE9wdGlvbk5hbWVzLmluZGV4T2YobWV0aG9kKSA9PT0gLTEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBQcm9jZXNzIHNlY3VyaXR5IHJlZmVyZW5jZXNcbiAgICAgIHByb2Nlc3NBdXRoUmVmcyhkb2N1bWVudE1ldGFkYXRhLCBvcGVyYXRpb24uc2VjdXJpdHksIG9QYXRoLmNvbmNhdCgnc2VjdXJpdHknKSwgcmVzdWx0cyk7XG5cbiAgICAgIC8vIENvbXBvc2UgcGFyYW1ldGVycyBmcm9tIHBhdGggZ2xvYmFsIHBhcmFtZXRlcnMgYW5kIG9wZXJhdGlvbiBwYXJhbWV0ZXJzXG4gICAgICBfLmVhY2gob3BlcmF0aW9uLnBhcmFtZXRlcnMsIGZ1bmN0aW9uIChwYXJhbWV0ZXIpIHtcbiAgICAgICAgLy8gQ2FuIGhhcHBlbiB3aXRoIGludmFsaWQgcmVmZXJlbmNlc1xuICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY1BhcmFtcy5wdXNoKHBhcmFtZXRlcik7XG5cbiAgICAgICAgc2VlblBhcmFtcy5wdXNoKHBhcmFtZXRlci5uYW1lICsgJzonICsgcGFyYW1ldGVyLmluKTtcbiAgICAgIH0pO1xuXG4gICAgICBfLmVhY2gocGF0aC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAocGFyYW1ldGVyKSB7XG4gICAgICAgIHZhciBjbG9uZWQgPSBfLmNsb25lRGVlcChwYXJhbWV0ZXIpO1xuXG4gICAgICAgIC8vIFRoZSBvbmx5IGVycm9ycyB0aGF0IGNhbiBvY2N1ciBoZXJlIGFyZSBzY2hlbWEgY29uc3RyYWludCB2YWxpZGF0aW9uIGVycm9ycyB3aGljaCBhcmUgYWxyZWFkeSByZXBvcnRlZCBhYm92ZVxuICAgICAgICAvLyBzbyBkbyBub3QgcmVwb3J0IHRoZW0gYWdhaW4uXG4gICAgICAgIGNsb25lZC5za2lwRXJyb3JzID0gdHJ1ZTtcblxuICAgICAgICBpZiAoc2VlblBhcmFtcy5pbmRleE9mKHBhcmFtZXRlci5uYW1lICsgJzonICsgcGFyYW1ldGVyLmluKSA9PT0gLTEpIHtcbiAgICAgICAgICBjUGFyYW1zLnB1c2goY2xvbmVkKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlcnNcbiAgICAgIHZhbGlkYXRlUGFyYW1ldGVycyhzcGVjLCBkb2N1bWVudE1ldGFkYXRhLCBuUGF0aCwgY1BhcmFtcywgb1BhdGgsIHJlc3VsdHMpO1xuXG4gICAgICAvLyBWYWxpZGF0ZSByZXNwb25zZXNcbiAgICAgIF8uZWFjaChvcGVyYXRpb24ucmVzcG9uc2VzLCBmdW5jdGlvbiAocmVzcG9uc2UsIHJlc3BvbnNlQ29kZSkge1xuICAgICAgICAvLyBEbyBub3QgcHJvY2VzcyByZWZlcmVuY2VzIHRvIG1pc3NpbmcgcmVzcG9uc2VzXG4gICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChyZXNwb25zZSkpIHtcbiAgICAgICAgICAvLyBWYWxpZGF0ZSB2YWxpZGF0ZSBpbmxpbmUgY29uc3RyYWludHNcbiAgICAgICAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEsIHJlc3BvbnNlLCBvUGF0aC5jb25jYXQoJ3Jlc3BvbnNlcycsIHJlc3BvbnNlQ29kZSksIHJlc3VsdHMpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBzZWVuUGF0aHMuY29uY2F0KG5QYXRoLnBhdGgpO1xuICB9LCBbXSk7XG5cbiAgLy8gVmFsaWRhdGUgZGVmaW5pdGlvbnNcbiAgdmFsaWRhdGVEZWZpbml0aW9ucyhkb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKTtcblxuICBjYWxsYmFjayh1bmRlZmluZWQsIHJlc3VsdHMpO1xufTtcblxudmFyIHZhbGlkYXRlU2VtYW50aWNhbGx5ID0gZnVuY3Rpb24gKHNwZWMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zLCBjYWxsYmFjaykge1xuICB2YXIgY2JXcmFwcGVyID0gZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgIGNhbGxiYWNrKGVyciwgaGVscGVycy5mb3JtYXRSZXN1bHRzKHJlc3VsdHMpKTtcbiAgfTtcbiAgaWYgKHNwZWMudmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICB2YWxpZGF0ZVN3YWdnZXIxXzIoc3BlYywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNiV3JhcHBlcik7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuICB9IGVsc2Uge1xuICAgIHZhbGlkYXRlU3dhZ2dlcjJfMChzcGVjLCBybE9yU08sIGNiV3JhcHBlcik7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuICB9XG59O1xuXG52YXIgdmFsaWRhdGVTdHJ1Y3R1cmFsbHkgPSBmdW5jdGlvbiAoc3BlYywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKSB7XG4gIHZhbGlkYXRlQWdhaW5zdFNjaGVtYShzcGVjLCBzcGVjLnZlcnNpb24gPT09ICcxLjInID8gJ3Jlc291cmNlTGlzdGluZy5qc29uJyA6ICdzY2hlbWEuanNvbicsIHJsT3JTTyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gT25seSB2YWxpZGF0ZSB0aGUgQVBJIERlY2xhcmF0aW9ucyBpZiB0aGUgQVBJIGlzIDEuMiBhbmQgdGhlIFJlc291cmNlIExpc3Rpbmcgd2FzIHZhbGlkXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0cyAmJiBzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cyA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yczogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nczogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcGlEZWNsYXJhdGlvbnM6IFtdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzeW5jLm1hcChhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChhcGlEZWNsYXJhdGlvbiwgY2FsbGJhY2syKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0ZUFnYWluc3RTY2hlbWEoc3BlYywgJ2FwaURlY2xhcmF0aW9uLmpzb24nLCBhcGlEZWNsYXJhdGlvbiwgY2FsbGJhY2syKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyLCBhbGxSZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLmVhY2goYWxsUmVzdWx0cywgZnVuY3Rpb24gKHJlc3VsdCwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5hcGlEZWNsYXJhdGlvbnNbaW5kZXhdID0gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgcmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXN1bHRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgU3dhZ2dlciBzcGVjaWZpY2F0aW9uIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvbiAtIFRoZSBTd2FnZ2VyIHZlcnNpb25cbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIFNwZWNpZmljYXRpb24gPSBmdW5jdGlvbiAodmVyc2lvbikge1xuICB2YXIgdGhhdCA9IHRoaXM7XG4gIHZhciBjcmVhdGVWYWxpZGF0b3JzID0gZnVuY3Rpb24gKHNwZWMsIHZhbGlkYXRvcnNNYXApIHtcbiAgICByZXR1cm4gXy5yZWR1Y2UodmFsaWRhdG9yc01hcCwgZnVuY3Rpb24gKHJlc3VsdCwgc2NoZW1hcywgc2NoZW1hTmFtZSkge1xuICAgICAgcmVzdWx0W3NjaGVtYU5hbWVdID0gaGVscGVycy5jcmVhdGVKc29uVmFsaWRhdG9yKHNjaGVtYXMpO1xuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sIHt9KTtcbiAgfTtcbiAgdmFyIGZpeFNjaGVtYUlkID0gZnVuY3Rpb24gKHNjaGVtYU5hbWUpIHtcbiAgICAvLyBTd2FnZ2VyIDEuMiBzY2hlbWEgZmlsZXMgdXNlIG9uZSBpZCBidXQgdXNlIGEgZGlmZmVyZW50IGlkIHdoZW4gcmVmZXJlbmNpbmcgc2NoZW1hIGZpbGVzLiAgV2UgYWxzbyB1c2UgdGhlIHNjaGVtYVxuICAgIC8vIGZpbGUgbmFtZSB0byByZWZlcmVuY2UgdGhlIHNjaGVtYSBpbiBaU2NoZW1hLiAgVG8gZml4IHRoaXMgc28gdGhhdCB0aGUgSlNPTiBTY2hlbWEgdmFsaWRhdG9yIHdvcmtzIHByb3Blcmx5LCB3ZVxuICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBpZCB0byBiZSB0aGUgbmFtZSBvZiB0aGUgc2NoZW1hIGZpbGUuXG4gICAgdmFyIGZpeGVkID0gXy5jbG9uZURlZXAodGhhdC5zY2hlbWFzW3NjaGVtYU5hbWVdKTtcblxuICAgIGZpeGVkLmlkID0gc2NoZW1hTmFtZTtcblxuICAgIHJldHVybiBmaXhlZDtcbiAgfTtcbiAgdmFyIHByaW1pdGl2ZXMgPSBbJ3N0cmluZycsICdudW1iZXInLCAnYm9vbGVhbicsICdpbnRlZ2VyJywgJ2FycmF5J107XG5cbiAgc3dpdGNoICh2ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgdGhpcy5kb2NzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9zd2FnZ2VyLWFwaS9zd2FnZ2VyLXNwZWMvYmxvYi9tYXN0ZXIvdmVyc2lvbnMvMS4yLm1kJztcbiAgICB0aGlzLnByaW1pdGl2ZXMgPSBfLnVuaW9uKHByaW1pdGl2ZXMsIFsndm9pZCcsICdGaWxlJ10pO1xuICAgIHRoaXMuc2NoZW1hc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL3RyZWUvbWFzdGVyL3NjaGVtYXMvdjEuMic7XG5cbiAgICAvLyBIZXJlIGV4cGxpY2l0bHkgdG8gYWxsb3cgYnJvd3NlcmlmeSB0byB3b3JrXG4gICAgdGhpcy5zY2hlbWFzID0ge1xuICAgICAgJ2FwaURlY2xhcmF0aW9uLmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9hcGlEZWNsYXJhdGlvbi5qc29uJyksXG4gICAgICAnYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJyksXG4gICAgICAnZGF0YVR5cGUuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24nKSxcbiAgICAgICdkYXRhVHlwZUJhc2UuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2RhdGFUeXBlQmFzZS5qc29uJyksXG4gICAgICAnaW5mb09iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvaW5mb09iamVjdC5qc29uJyksXG4gICAgICAnbW9kZWxzT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9tb2RlbHNPYmplY3QuanNvbicpLFxuICAgICAgJ29hdXRoMkdyYW50VHlwZS5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24nKSxcbiAgICAgICdvcGVyYXRpb25PYmplY3QuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL29wZXJhdGlvbk9iamVjdC5qc29uJyksXG4gICAgICAncGFyYW1ldGVyT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9wYXJhbWV0ZXJPYmplY3QuanNvbicpLFxuICAgICAgJ3Jlc291cmNlTGlzdGluZy5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24nKSxcbiAgICAgICdyZXNvdXJjZU9iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcmVzb3VyY2VPYmplY3QuanNvbicpXG4gICAgfTtcblxuICAgIHRoaXMudmFsaWRhdG9ycyA9IGNyZWF0ZVZhbGlkYXRvcnModGhpcywge1xuICAgICAgJ2FwaURlY2xhcmF0aW9uLmpzb24nOiBfLm1hcChbXG4gICAgICAgICdkYXRhVHlwZUJhc2UuanNvbicsXG4gICAgICAgICdtb2RlbHNPYmplY3QuanNvbicsXG4gICAgICAgICdvYXV0aDJHcmFudFR5cGUuanNvbicsXG4gICAgICAgICdhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24nLFxuICAgICAgICAncGFyYW1ldGVyT2JqZWN0Lmpzb24nLFxuICAgICAgICAnb3BlcmF0aW9uT2JqZWN0Lmpzb24nLFxuICAgICAgICAnYXBpRGVjbGFyYXRpb24uanNvbidcbiAgICAgIF0sIGZpeFNjaGVtYUlkKSxcbiAgICAgICdyZXNvdXJjZUxpc3RpbmcuanNvbic6IF8ubWFwKFtcbiAgICAgICAgJ3Jlc291cmNlT2JqZWN0Lmpzb24nLFxuICAgICAgICAnaW5mb09iamVjdC5qc29uJyxcbiAgICAgICAgJ29hdXRoMkdyYW50VHlwZS5qc29uJyxcbiAgICAgICAgJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbicsXG4gICAgICAgICdyZXNvdXJjZUxpc3RpbmcuanNvbidcbiAgICAgIF0sIGZpeFNjaGVtYUlkKVxuICAgIH0pO1xuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICB0aGlzLmRvY3NVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9ibG9iL21hc3Rlci92ZXJzaW9ucy8yLjAubWQnO1xuICAgIHRoaXMucHJpbWl0aXZlcyA9IF8udW5pb24ocHJpbWl0aXZlcywgWydmaWxlJ10pO1xuICAgIHRoaXMuc2NoZW1hc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL3RyZWUvbWFzdGVyL3NjaGVtYXMvdjIuMCc7XG5cbiAgICAvLyBIZXJlIGV4cGxpY2l0bHkgdG8gYWxsb3cgYnJvd3NlcmlmeSB0byB3b3JrXG4gICAgdGhpcy5zY2hlbWFzID0ge1xuICAgICAgJ3NjaGVtYS5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8yLjAvc2NoZW1hLmpzb24nKVxuICAgIH07XG5cbiAgICB0aGlzLnZhbGlkYXRvcnMgPSBjcmVhdGVWYWxpZGF0b3JzKHRoaXMsIHtcbiAgICAgICdzY2hlbWEuanNvbic6IFtmaXhTY2hlbWFJZCgnc2NoZW1hLmpzb24nKV1cbiAgICB9KTtcblxuICAgIGJyZWFrO1xuXG4gIGRlZmF1bHQ6XG4gICAgdGhyb3cgbmV3IEVycm9yKHZlcnNpb24gKyAnIGlzIGFuIHVuc3VwcG9ydGVkIFN3YWdnZXIgc3BlY2lmaWNhdGlvbiB2ZXJzaW9uJyk7XG4gIH1cblxuICB0aGlzLnZlcnNpb24gPSB2ZXJzaW9uO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSByZXN1bHQgb2YgdGhlIHZhbGlkYXRpb24gb2YgdGhlIFN3YWdnZXIgZG9jdW1lbnQocykuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IHJsT3JTTyAtIFRoZSBTd2FnZ2VyIFJlc291cmNlIExpc3RpbmcgKDEuMikgb3IgU3dhZ2dlciBPYmplY3QgKDIuMClcbiAqIEBwYXJhbSB7b2JqZWN0W119IFthcGlEZWNsYXJhdGlvbnNdIC0gVGhlIGFycmF5IG9mIFN3YWdnZXIgQVBJIERlY2xhcmF0aW9ucyAoMS4yKVxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXG4gKlxuICogQHJldHVybnMgdW5kZWZpbmVkIGlmIHZhbGlkYXRpb24gcGFzc2VzIG9yIGFuIG9iamVjdCBjb250YWluaW5nIGVycm9ycyBhbmQvb3Igd2FybmluZ3NcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIGFyZ3VtZW50cyBwcm92aWRlZCBhcmUgbm90IHZhbGlkXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnZhbGlkYXRlID0gZnVuY3Rpb24gKHJsT3JTTywgYXBpRGVjbGFyYXRpb25zLCBjYWxsYmFjaykge1xuICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgc3dpdGNoICh0aGlzLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXNvdXJjZUxpc3RpbmcgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNBcnJheShhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdhcGlEZWNsYXJhdGlvbnMgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQocmxPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzd2FnZ2VyT2JqZWN0IGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N3YWdnZXJPYmplY3QgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBicmVhaztcbiAgfVxuXG4gIGlmICh0aGlzLnZlcnNpb24gPT09ICcyLjAnKSB7XG4gICAgY2FsbGJhY2sgPSBhcmd1bWVudHNbMV07XG4gIH1cblxuICBpZiAoXy5pc1VuZGVmaW5lZChjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgfVxuXG4gIC8vIEZvciBTd2FnZ2VyIDIuMCwgbWFrZSBzdXJlIGFwaURlY2xhcmF0aW9ucyBpcyBhbiBlbXB0eSBhcnJheVxuICBpZiAodGhpcy52ZXJzaW9uID09PSAnMi4wJykge1xuICAgIGFwaURlY2xhcmF0aW9ucyA9IFtdO1xuICB9XG5cbiAgdmFyIHRoYXQgPSB0aGlzO1xuXG4gIC8vIFBlcmZvcm0gdGhlIHZhbGlkYXRpb25cbiAgdmFsaWRhdGVTdHJ1Y3R1cmFsbHkodGhpcywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdCkge1xuICAgIGlmIChlcnIgfHwgaGVscGVycy5mb3JtYXRSZXN1bHRzKHJlc3VsdCkpIHtcbiAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsaWRhdGVTZW1hbnRpY2FsbHkodGhhdCwgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgSlNPTiBTY2hlbWEgcmVwcmVzZW50YXRpb24gb2YgYSBjb21wb3NlZCBtb2RlbCBiYXNlZCBvbiBpdHMgaWQgb3IgcmVmZXJlbmNlLlxuICpcbiAqIE5vdGU6IEZvciBTd2FnZ2VyIDEuMiwgd2Ugb25seSBwZXJmb3JtIHN0cnVjdHVyYWwgdmFsaWRhdGlvbiBwcmlvciB0byBjb21wb3NpbmcgdGhlIG1vZGVsLlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBhcGlET3JTTyAtIFRoZSBTd2FnZ2VyIFJlc291cmNlIEFQSSBEZWNsYXJhdGlvbiAoMS4yKSBvciB0aGUgU3dhZ2dlciBPYmplY3QgKDIuMClcbiAqIEBwYXJhbSB7c3RyaW5nfSBtb2RlbElkT3JSZWYgLSBUaGUgbW9kZWwgaWQgKDEuMikgb3IgdGhlIHJlZmVyZW5jZSB0byB0aGUgbW9kZWwgKDEuMiBvciAyLjApXG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcbiAqXG4gKiBAcmV0dXJucyB0aGUgb2JqZWN0IHJlcHJlc2VudGluZyBhIGNvbXBvc2VkIG9iamVjdFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlcmUgYXJlIHZhbGlkYXRpb24gZXJyb3JzIHdoaWxlIGNyZWF0aW5nXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLmNvbXBvc2VNb2RlbCA9IGZ1bmN0aW9uIChhcGlET3JTTywgbW9kZWxJZE9yUmVmLCBjYWxsYmFjaykge1xuICB2YXIgc3dhZ2dlclZlcnNpb24gPSBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGFwaURPclNPKTtcbiAgdmFyIGRvQ29tcG9zaXRpb24gPSBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgdmFyIGRvY3VtZW50TWV0YWRhdGE7XG5cbiAgICBpZiAoZXJyKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICB9IGVsc2UgaWYgKGhlbHBlcnMuZ2V0RXJyb3JDb3VudChyZXN1bHRzKSA+IDApIHtcbiAgICAgIHJldHVybiBoYW5kbGVWYWxpZGF0aW9uRXJyb3IocmVzdWx0cywgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIGRvY3VtZW50TWV0YWRhdGEgPSBnZXREb2N1bWVudENhY2hlKGFwaURPclNPKTtcbiAgICByZXN1bHRzID0ge1xuICAgICAgZXJyb3JzOiBbXSxcbiAgICAgIHdhcm5pbmdzOiBbXVxuICAgIH07XG5cbiAgICBwcm9jZXNzRG9jdW1lbnQoZG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XG5cbiAgICBpZiAoIWRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbbW9kZWxJZE9yUmVmXSkge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgfVxuXG4gICAgaWYgKGhlbHBlcnMuZ2V0RXJyb3JDb3VudChyZXN1bHRzKSA+IDApIHtcbiAgICAgIHJldHVybiBoYW5kbGVWYWxpZGF0aW9uRXJyb3IocmVzdWx0cywgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgZ2V0T3JDb21wb3NlU2NoZW1hKGRvY3VtZW50TWV0YWRhdGEsIG1vZGVsSWRPclJlZikpO1xuICB9O1xuXG4gIHN3aXRjaCAodGhpcy52ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9uIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignYXBpRGVjbGFyYXRpb24gbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JSZWYpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21vZGVsSWQgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzd2FnZ2VyT2JqZWN0IGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3dhZ2dlck9iamVjdCBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChfLmlzVW5kZWZpbmVkKG1vZGVsSWRPclJlZikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxSZWYgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBicmVhaztcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICB9XG5cbiAgaWYgKG1vZGVsSWRPclJlZi5jaGFyQXQoMCkgIT09ICcjJykge1xuICAgIGlmICh0aGlzLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICBtb2RlbElkT3JSZWYgPSAnIy9tb2RlbHMvJyArIG1vZGVsSWRPclJlZjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbFJlZiBtdXN0IGJlIGEgSlNPTiBQb2ludGVyJyk7XG4gICAgfVxuICB9XG5cbiAgLy8gRW5zdXJlIHRoZSBkb2N1bWVudCBpcyB2YWxpZCBmaXJzdFxuICBpZiAoc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgdmFsaWRhdGVBZ2FpbnN0U2NoZW1hKHRoaXMsICdhcGlEZWNsYXJhdGlvbi5qc29uJywgYXBpRE9yU08sIGRvQ29tcG9zaXRpb24pO1xuICB9IGVsc2Uge1xuICAgIHRoaXMudmFsaWRhdGUoYXBpRE9yU08sIGRvQ29tcG9zaXRpb24pO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyBhIG1vZGVsIGJhc2VkIG9uIGl0cyBpZC5cbiAqXG4gKiBOb3RlOiBGb3IgU3dhZ2dlciAxLjIsIHdlIG9ubHkgcGVyZm9ybSBzdHJ1Y3R1cmFsIHZhbGlkYXRpb24gcHJpb3IgdG8gY29tcG9zaW5nIHRoZSBtb2RlbC5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gYXBpRE9yU08gLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBBUEkgRGVjbGFyYXRpb24gKDEuMikgb3IgdGhlIFN3YWdnZXIgT2JqZWN0ICgyLjApXG4gKiBAcGFyYW0ge3N0cmluZ30gbW9kZWxJZE9yUmVmIC0gVGhlIG1vZGVsIGlkICgxLjIpIG9yIHRoZSByZWZlcmVuY2UgdG8gdGhlIG1vZGVsICgxLjIgb3IgMi4wKVxuICogQHBhcmFtIHsqfSBkYXRhIC0gVGhlIG1vZGVsIHRvIHZhbGlkYXRlXG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcbiAqXG4gKiBAcmV0dXJucyB1bmRlZmluZWQgaWYgdmFsaWRhdGlvbiBwYXNzZXMgb3IgYW4gb2JqZWN0IGNvbnRhaW5pbmcgZXJyb3JzIGFuZC9vciB3YXJuaW5nc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlcmUgYXJlIHZhbGlkYXRpb24gZXJyb3JzIHdoaWxlIGNyZWF0aW5nXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnZhbGlkYXRlTW9kZWwgPSBmdW5jdGlvbiAoYXBpRE9yU08sIG1vZGVsSWRPclJlZiwgZGF0YSwgY2FsbGJhY2spIHtcbiAgc3dpdGNoICh0aGlzLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYXBpRGVjbGFyYXRpb24gaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdhcGlEZWNsYXJhdGlvbiBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChfLmlzVW5kZWZpbmVkKG1vZGVsSWRPclJlZikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxJZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N3YWdnZXJPYmplY3QgaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzd2FnZ2VyT2JqZWN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUmVmKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbFJlZiBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZGF0YSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2RhdGEgaXMgcmVxdWlyZWQnKTtcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICB9XG5cbiAgdmFyIHRoYXQgPSB0aGlzO1xuXG4gIHRoaXMuY29tcG9zZU1vZGVsKGFwaURPclNPLCBtb2RlbElkT3JSZWYsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdCkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgIH1cblxuICAgIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSh0aGF0LCByZXN1bHQsIGRhdGEsIGNhbGxiYWNrKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBmdWxseSByZXNvbHZlZCBkb2N1bWVudCBvciBkb2N1bWVudCBmcmFnbWVudC4gIChEb2VzIG5vdCBwZXJmb3JtIHZhbGlkYXRpb24gYXMgdGhpcyBpcyB0eXBpY2FsbHkgY2FsbGVkXG4gKiBhZnRlciB2YWxpZGF0aW9uIG9jY3Vycy4pKVxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBkb2N1bWVudCAtIFRoZSBkb2N1bWVudCB0byByZXNvbHZlIG9yIHRoZSBkb2N1bWVudCBjb250YWluaW5nIHRoZSByZWZlcmVuY2UgdG8gcmVzb2x2ZVxuICogQHBhcmFtIHtzdHJpbmd9IFtwdHJdIC0gVGhlIEpTT04gUG9pbnRlciBvciB1bmRlZmluZWQgdG8gcmV0dXJuIHRoZSB3aG9sZSBkb2N1bWVudFxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXG4gKlxuICogQHJldHVybnMgdGhlIGZ1bGx5IHJlc29sdmVkIGRvY3VtZW50IG9yIGZyYWdtZW50XG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGVyZSBhcmUgdXBzdHJlYW0gZXJyb3JzXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnJlc29sdmUgPSBmdW5jdGlvbiAoZG9jdW1lbnQsIHB0ciwgY2FsbGJhY2spIHtcbiAgdmFyIGRvY3VtZW50TWV0YWRhdGE7XG4gIHZhciByZXNwb25kID0gZnVuY3Rpb24gKGRvY3VtZW50KSB7XG4gICAgaWYgKF8uaXNTdHJpbmcocHRyKSkge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKHVuZGVmaW5lZCwgdHJhdmVyc2UoZG9jdW1lbnQpLmdldChKc29uUmVmcy5wYXRoRnJvbVB0cihwdHIpKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayh1bmRlZmluZWQsIGRvY3VtZW50KTtcbiAgICB9XG4gIH07XG5cbiAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gIGlmIChfLmlzVW5kZWZpbmVkKGRvY3VtZW50KSkge1xuICAgIHRocm93IG5ldyBFcnJvcignZG9jdW1lbnQgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGRvY3VtZW50KSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2RvY3VtZW50IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMikge1xuICAgIGNhbGxiYWNrID0gYXJndW1lbnRzWzFdO1xuICAgIHB0ciA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGlmICghXy5pc1VuZGVmaW5lZChwdHIpICYmICFfLmlzU3RyaW5nKHB0cikpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwdHIgbXVzdCBiZSBhIEpTT04gUG9pbnRlciBzdHJpbmcnKTtcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICB9XG5cbiAgZG9jdW1lbnRNZXRhZGF0YSA9IGdldERvY3VtZW50Q2FjaGUoZG9jdW1lbnQpO1xuXG4gIC8vIFN3YWdnZXIgMS4yIGlzIG5vdCBzdXBwb3J0ZWQgZHVlIHRvIGludmFsaWQgSlNPTiBSZWZlcmVuY2VzIGJlaW5nIHVzZWQuICBFdmVuIGlmIHRoZSBKU09OIFJlZmVyZW5jZXMgd2VyZSB2YWxpZCxcbiAgLy8gdGhlIEpTT04gU2NoZW1hIGZvciBTd2FnZ2VyIDEuMiBkbyBub3QgYWxsb3cgSmF2YVNjcmlwdCBvYmplY3RzIGluIGFsbCBwbGFjZXMgd2hlcmUgdGhlIHJlc291dGlvbiB3b3VsZCBvY2N1ci5cbiAgaWYgKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdTd2FnZ2VyIDEuMiBpcyBub3Qgc3VwcG9ydGVkJyk7XG4gIH1cblxuICBpZiAoIWRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpIHtcbiAgICAvLyBFbnN1cmUgdGhlIGRvY3VtZW50IGlzIHZhbGlkIGZpcnN0XG4gICAgdGhpcy52YWxpZGF0ZShkb2N1bWVudCwgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH0gZWxzZSBpZiAoaGVscGVycy5nZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMCkge1xuICAgICAgICByZXR1cm4gaGFuZGxlVmFsaWRhdGlvbkVycm9yKHJlc3VsdHMsIGNhbGxiYWNrKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3BvbmQoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHJlc3BvbmQoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCk7XG4gIH1cbn07XG5cbi8qKlxuICogQ29udmVydHMgdGhlIFN3YWdnZXIgMS4yIGRvY3VtZW50cyB0byBhIFN3YWdnZXIgMi4wIGRvY3VtZW50LlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSByZXNvdXJjZUxpc3RpbmcgLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBMaXN0aW5nXG4gKiBAcGFyYW0ge29iamVjdFtdfSBbYXBpRGVjbGFyYXRpb25zXSAtIFRoZSBhcnJheSBvZiBTd2FnZ2VyIEFQSSBEZWNsYXJhdGlvbnNcbiAqIEBwYXJhbSB7Ym9vbGVhbj1mYWxzZX0gW3NraXBWYWxpZGF0aW9uXSAtIFdoZXRoZXIgb3Igbm90IHRvIHNraXAgdmFsaWRhdGlvblxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXG4gKlxuICogQHJldHVybnMgdGhlIGNvbnZlcnRlZCBTd2FnZ2VyIGRvY3VtZW50XG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgYXJndW1lbnRzIHByb3ZpZGVkIGFyZSBub3QgdmFsaWRcbiAqL1xuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUuY29udmVydCA9IGZ1bmN0aW9uIChyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucywgc2tpcFZhbGlkYXRpb24sIGNhbGxiYWNrKSB7XG4gIHZhciBkb0NvbnZlcnQgPSBmdW5jdGlvbiAocmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMpIHtcbiAgICBjYWxsYmFjayh1bmRlZmluZWQsIHN3YWdnZXJDb252ZXJ0ZXIocmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMpKTtcbiAgfTtcblxuICBpZiAodGhpcy52ZXJzaW9uICE9PSAnMS4yJykge1xuICAgIHRocm93IG5ldyBFcnJvcignU3BlY2lmaWNhdGlvbiNjb252ZXJ0IG9ubHkgd29ya3MgZm9yIFN3YWdnZXIgMS4yJyk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgaWYgKF8uaXNVbmRlZmluZWQocmVzb3VyY2VMaXN0aW5nKSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncmVzb3VyY2VMaXN0aW5nIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChyZXNvdXJjZUxpc3RpbmcpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncmVzb3VyY2VMaXN0aW5nIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICAvLyBBUEkgRGVjbGFyYXRpb25zIGFyZSBvcHRpb25hbCBiZWNhdXNlIHN3YWdnZXItY29udmVydGVyIHdhcyB3cml0dGVuIHRvIHN1cHBvcnQgaXRcbiAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRGVjbGFyYXRpb25zKSkge1xuICAgIGFwaURlY2xhcmF0aW9ucyA9IFtdO1xuICB9XG5cbiAgaWYgKCFfLmlzQXJyYXkoYXBpRGVjbGFyYXRpb25zKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gIH1cblxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDQpIHtcbiAgICBjYWxsYmFjayA9IGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBpZiAoXy5pc1VuZGVmaW5lZChjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgfVxuXG4gIGlmIChza2lwVmFsaWRhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIGRvQ29udmVydChyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucyk7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy52YWxpZGF0ZShyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH0gZWxzZSBpZiAoaGVscGVycy5nZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMCkge1xuICAgICAgICByZXR1cm4gaGFuZGxlVmFsaWRhdGlvbkVycm9yKHJlc3VsdHMsIGNhbGxiYWNrKTtcbiAgICAgIH1cblxuICAgICAgZG9Db252ZXJ0KHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zKTtcbiAgICB9KTtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMudjEgPSBtb2R1bGUuZXhwb3J0cy52MV8yID0gbmV3IFNwZWNpZmljYXRpb24oJzEuMicpOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbm1vZHVsZS5leHBvcnRzLnYyID0gbW9kdWxlLmV4cG9ydHMudjJfMCA9IG5ldyBTcGVjaWZpY2F0aW9uKCcyLjAnKTsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG4iLCIvKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0IEFwaWdlZSBDb3Jwb3JhdGlvblxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuICogYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG4gKiBUSEUgU09GVFdBUkUuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBEb25lIHRoaXMgd2F5IHRvIG1ha2UgdGhlIEJyb3dzZXJpZnkgYnVpbGQgc21hbGxlclxudmFyIF8gPSB7XG4gIGNsb25lRGVlcDogcmVxdWlyZSgnbG9kYXNoLWNvbXBhdC9sYW5nL2Nsb25lRGVlcCcpLFxuICBlYWNoOiByZXF1aXJlKCdsb2Rhc2gtY29tcGF0L2NvbGxlY3Rpb24vZWFjaCcpLFxuICBpc0FycmF5OiByZXF1aXJlKCdsb2Rhc2gtY29tcGF0L2xhbmcvaXNBcnJheScpLFxuICBpc0Jvb2xlYW46IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvbGFuZy9pc0Jvb2xlYW4nKSxcbiAgaXNEYXRlOiByZXF1aXJlKCdsb2Rhc2gtY29tcGF0L2xhbmcvaXNEYXRlJyksXG4gIGlzRmluaXRlOiByZXF1aXJlKCdsb2Rhc2gtY29tcGF0L2xhbmcvaXNGaW5pdGUnKSxcbiAgaXNOdWxsOiByZXF1aXJlKCdsb2Rhc2gtY29tcGF0L2xhbmcvaXNOdWxsJyksXG4gIGlzTnVtYmVyOiByZXF1aXJlKCdsb2Rhc2gtY29tcGF0L2xhbmcvaXNOdW1iZXInKSxcbiAgaXNQbGFpbk9iamVjdDogcmVxdWlyZSgnbG9kYXNoLWNvbXBhdC9sYW5nL2lzUGxhaW5PYmplY3QnKSxcbiAgaXNTdHJpbmc6IHJlcXVpcmUoJ2xvZGFzaC1jb21wYXQvbGFuZy9pc1N0cmluZycpLFxuICBpc1VuZGVmaW5lZDogcmVxdWlyZSgnbG9kYXNoLWNvbXBhdC9sYW5nL2lzVW5kZWZpbmVkJyksXG4gIG1hcDogcmVxdWlyZSgnbG9kYXNoLWNvbXBhdC9jb2xsZWN0aW9uL21hcCcpLFxuICB1bmlvbjogcmVxdWlyZSgnbG9kYXNoLWNvbXBhdC9hcnJheS91bmlvbicpLFxuICB1bmlxOiByZXF1aXJlKCdsb2Rhc2gtY29tcGF0L2FycmF5L3VuaXEnKVxufTtcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG52YXIgdmFsaWRhdG9yID0gcmVxdWlyZSgndmFsaWRhdG9yJyk7XG5cbi8vIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzMzMzkjc2VjdGlvbi01LjZcbnZhciBkYXRlUmVnRXhwID0gL14oWzAtOV17NH0pLShbMC05XXsyfSktKFswLTldezJ9KSQvO1xuLy8gaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzMzOSNzZWN0aW9uLTUuNlxudmFyIGRhdGVUaW1lUmVnRXhwID0gL14oWzAtOV17Mn0pOihbMC05XXsyfSk6KFswLTldezJ9KSguWzAtOV0rKT8oenwoWystXVswLTldezJ9KTooWzAtOV17Mn0pKSQvO1xudmFyIGlzVmFsaWREYXRlID0gbW9kdWxlLmV4cG9ydHMuaXNWYWxpZERhdGUgPSBmdW5jdGlvbiAoZGF0ZSkge1xuICB2YXIgZGF5O1xuICB2YXIgbWF0Y2hlcztcbiAgdmFyIG1vbnRoO1xuXG4gIGlmIChfLmlzRGF0ZShkYXRlKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKCFfLmlzU3RyaW5nKGRhdGUpKSB7XG4gICAgZGF0ZSA9IGRhdGUudG9TdHJpbmcoKTtcbiAgfVxuXG4gIG1hdGNoZXMgPSBkYXRlUmVnRXhwLmV4ZWMoZGF0ZSk7XG5cbiAgaWYgKG1hdGNoZXMgPT09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBkYXkgPSBtYXRjaGVzWzNdO1xuICBtb250aCA9IG1hdGNoZXNbMl07XG5cbiAgaWYgKG1vbnRoIDwgJzAxJyB8fCBtb250aCA+ICcxMicgfHwgZGF5IDwgJzAxJyB8fCBkYXkgPiAnMzEnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xudmFyIGlzVmFsaWREYXRlVGltZSA9IG1vZHVsZS5leHBvcnRzLmlzVmFsaWREYXRlVGltZSA9IGZ1bmN0aW9uIChkYXRlVGltZSkge1xuICB2YXIgaG91cjtcbiAgdmFyIGRhdGU7XG4gIHZhciB0aW1lO1xuICB2YXIgbWF0Y2hlcztcbiAgdmFyIG1pbnV0ZTtcbiAgdmFyIHBhcnRzO1xuICB2YXIgc2Vjb25kO1xuICB2YXIgdGltZXpvbmVIb3VycztcbiAgdmFyIHRpbWV6b25lTWludXRlcztcblxuICBpZiAoXy5pc0RhdGUoZGF0ZVRpbWUpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoIV8uaXNTdHJpbmcoZGF0ZVRpbWUpKSB7XG4gICAgZGF0ZVRpbWUgPSBkYXRlVGltZS50b1N0cmluZygpO1xuICB9XG5cbiAgcGFydHMgPSBkYXRlVGltZS50b0xvd2VyQ2FzZSgpLnNwbGl0KCd0Jyk7XG4gIGRhdGUgPSBwYXJ0c1swXTtcbiAgdGltZSA9IHBhcnRzLmxlbmd0aCA+IDEgPyBwYXJ0c1sxXSA6IHVuZGVmaW5lZDtcblxuICBpZiAoIWlzVmFsaWREYXRlKGRhdGUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgbWF0Y2hlcyA9IGRhdGVUaW1lUmVnRXhwLmV4ZWModGltZSk7XG5cbiAgaWYgKG1hdGNoZXMgPT09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBob3VyID0gbWF0Y2hlc1sxXTtcbiAgbWludXRlID0gbWF0Y2hlc1syXTtcbiAgc2Vjb25kID0gbWF0Y2hlc1szXTtcbiAgaWYgKG1hdGNoZXNbNV0gPT09ICd6Jykge1xuICAgIHRpbWV6b25lSG91cnMgPSAwO1xuICAgIHRpbWV6b25lTWludXRlcyA9IDA7XG4gIH0gZWxzZSB7XG4gICAgdGltZXpvbmVIb3VycyA9IE51bWJlcihtYXRjaGVzWzZdKTtcbiAgICB0aW1lem9uZU1pbnV0ZXMgPSBOdW1iZXIobWF0Y2hlc1s3XSk7XG4gIH1cblxuICB2YXIgdmFsaWRUaW1lem9uZU1pbnV0ZXMgPSB0aW1lem9uZU1pbnV0ZXMgPT09IDAgfHwgdGltZXpvbmVNaW51dGVzID09PSAxNSB8fCB0aW1lem9uZU1pbnV0ZXMgPT09IDMwIHx8IHRpbWV6b25lTWludXRlcyA9PT0gNDU7XG5cbiAgaWYgKGhvdXIgPiAnMjMnIHx8IG1pbnV0ZSA+ICc1OScgfHwgc2Vjb25kID4gJzU5JyB8fCB0aW1lem9uZUhvdXJzID4gMTQgfHwgdGltZXpvbmVIb3VycyA8IC0xMiB8fCAhdmFsaWRUaW1lem9uZU1pbnV0ZXMpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbnZhciB0aHJvd0Vycm9yV2l0aENvZGUgPSBmdW5jdGlvbiAoY29kZSwgbXNnKSB7XG4gIHZhciBlcnIgPSBuZXcgRXJyb3IobXNnKTtcblxuICBlcnIuY29kZSA9IGNvZGU7XG4gIGVyci5mYWlsZWRWYWxpZGF0aW9uID0gdHJ1ZTtcblxuICB0aHJvdyBlcnI7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUFnYWluc3RTY2hlbWEgPSBmdW5jdGlvbiAoc2NoZW1hT3JOYW1lLCBkYXRhLCB2YWxpZGF0b3IpIHtcbiAgdmFyIHNhbml0aXplRXJyb3IgPSBmdW5jdGlvbiAob2JqKSB7XG4gICAgLy8gTWFrZSBhbnlPZi9vbmVPZiBlcnJvcnMgbW9yZSBodW1hbiByZWFkYWJsZSAoSXNzdWUgMjAwKVxuICAgIHZhciBkZWZUeXBlID0gWydhZGRpdGlvbmFsUHJvcGVydGllcycsICdpdGVtcyddLmluZGV4T2Yob2JqLnBhdGhbb2JqLnBhdGgubGVuZ3RoIC0gMV0pID4gLTEgP1xuICAgICAgICAgICdzY2hlbWEnIDpcbiAgICAgICAgICBvYmoucGF0aFtvYmoucGF0aC5sZW5ndGggLSAyXTtcblxuICAgIGlmIChbJ0FOWV9PRl9NSVNTSU5HJywgJ09ORV9PRl9NSVNTSU5HJ10uaW5kZXhPZihvYmouY29kZSkgPiAtMSkge1xuICAgICAgc3dpdGNoIChkZWZUeXBlKSB7XG4gICAgICBjYXNlICdwYXJhbWV0ZXJzJzpcbiAgICAgICAgZGVmVHlwZSA9ICdwYXJhbWV0ZXInO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAncmVzcG9uc2VzJzpcbiAgICAgICAgZGVmVHlwZSA9ICdyZXNwb25zZSc7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdzY2hlbWEnOlxuICAgICAgICBkZWZUeXBlICs9ICcgJyArIG9iai5wYXRoW29iai5wYXRoLmxlbmd0aCAtIDFdO1xuXG4gICAgICAgIC8vIG5vIGRlZmF1bHRcbiAgICAgIH1cblxuICAgICAgb2JqLm1lc3NhZ2UgPSAnTm90IGEgdmFsaWQgJyArIGRlZlR5cGUgKyAnIGRlZmluaXRpb24nO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSB0aGUgcGFyYW1zIHBvcnRpb24gb2YgdGhlIGVycm9yXG4gICAgZGVsZXRlIG9iai5wYXJhbXM7XG4gICAgZGVsZXRlIG9iai5zY2hlbWFJZDtcblxuICAgIGlmIChvYmouaW5uZXIpIHtcbiAgICAgIF8uZWFjaChvYmouaW5uZXIsIGZ1bmN0aW9uIChuT2JqKSB7XG4gICAgICAgIHNhbml0aXplRXJyb3Iobk9iaik7XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG4gIHZhciBzY2hlbWEgPSBfLmlzUGxhaW5PYmplY3Qoc2NoZW1hT3JOYW1lKSA/IF8uY2xvbmVEZWVwKHNjaGVtYU9yTmFtZSkgOiBzY2hlbWFPck5hbWU7XG5cbiAgLy8gV2UgZG9uJ3QgY2hlY2sgdGhpcyBkdWUgdG8gaW50ZXJuYWwgdXNhZ2UgYnV0IGlmIHZhbGlkYXRvciBpcyBub3QgcHJvdmlkZWQsIHNjaGVtYU9yTmFtZSBtdXN0IGJlIGEgc2NoZW1hXG4gIGlmIChfLmlzVW5kZWZpbmVkKHZhbGlkYXRvcikpIHtcbiAgICB2YWxpZGF0b3IgPSBoZWxwZXJzLmNyZWF0ZUpzb25WYWxpZGF0b3IoW3NjaGVtYV0pO1xuICB9XG5cbiAgdmFyIHZhbGlkID0gdmFsaWRhdG9yLnZhbGlkYXRlKGRhdGEsIHNjaGVtYSk7XG5cbiAgaWYgKCF2YWxpZCkge1xuICAgIHRyeSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ1NDSEVNQV9WQUxJREFUSU9OX0ZBSUxFRCcsICdGYWlsZWQgc2NoZW1hIHZhbGlkYXRpb24nKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGVyci5yZXN1bHRzID0ge1xuICAgICAgICBlcnJvcnM6IF8ubWFwKHZhbGlkYXRvci5nZXRMYXN0RXJyb3JzKCksIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBzYW5pdGl6ZUVycm9yKGVycik7XG5cbiAgICAgICAgICByZXR1cm4gZXJyO1xuICAgICAgICB9KSxcbiAgICAgICAgd2FybmluZ3M6IFtdXG4gICAgICB9O1xuXG4gICAgICB0aHJvdyBlcnI7XG4gICAgfVxuICB9XG59O1xuXG5cbi8qKlxuICogVmFsaWRhdGVzIGEgc2NoZW1hIG9mIHR5cGUgYXJyYXkgaXMgcHJvcGVybHkgZm9ybWVkICh3aGVuIG5lY2Vzc2FyKS5cbiAqXG4gKiAqcGFyYW0ge29iamVjdH0gc2NoZW1hIC0gVGhlIHNjaGVtYSBvYmplY3QgdG8gdmFsaWRhdGVcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBzY2hlbWEgc2F5cyBpdCdzIGFuIGFycmF5IGJ1dCBpdCBpcyBub3QgZm9ybWVkIHByb3Blcmx5XG4gKlxuICogQHNlZSB7QGxpbmsgaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9pc3N1ZXMvMTc0fVxuICovXG52YXIgdmFsaWRhdGVBcnJheVR5cGUgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUFycmF5VHlwZSA9IGZ1bmN0aW9uIChzY2hlbWEpIHtcbiAgLy8gV2UgaGF2ZSB0byBkbyB0aGlzIG1hbnVhbGx5IGZvciBub3dcbiAgaWYgKHNjaGVtYS50eXBlID09PSAnYXJyYXknICYmIF8uaXNVbmRlZmluZWQoc2NoZW1hLml0ZW1zKSkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnT0JKRUNUX01JU1NJTkdfUkVRVUlSRURfUFJPUEVSVFknLCAnTWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0eTogaXRlbXMnKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3Qgb3IgcmVzcG9uc2UgY29udGVudCB0eXBlICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmdbXX0gZ1BPckMgLSBUaGUgdmFsaWQgY29uc3VtZXMgYXQgdGhlIEFQSSBzY29wZVxuICogQHBhcmFtIHtzdHJpbmdbXX0gb1BPckMgLSBUaGUgdmFsaWQgY29uc3VtZXMgYXQgdGhlIG9wZXJhdGlvbiBzY29wZVxuICogQHBhcmFtIHtvYmplY3R9IHJlcU9yUmVzIC0gVGhlIHJlcXVlc3Qgb3IgcmVzcG9uc2VcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBjb250ZW50IHR5cGUgaXMgaW52YWxpZFxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUNvbnRlbnRUeXBlID0gZnVuY3Rpb24gKGdQT3JDLCBvUE9yQywgcmVxT3JSZXMpIHtcbiAgLy8gaHR0cDovL3d3dy53My5vcmcvUHJvdG9jb2xzL3JmYzI2MTYvcmZjMjYxNi1zZWM3Lmh0bWwjc2VjNy4yLjFcbiAgdmFyIGlzUmVzcG9uc2UgPSB0eXBlb2YgcmVxT3JSZXMuZW5kID09PSAnZnVuY3Rpb24nO1xuICB2YXIgY29udGVudFR5cGUgPSBpc1Jlc3BvbnNlID8gcmVxT3JSZXMuZ2V0SGVhZGVyKCdjb250ZW50LXR5cGUnKSA6IHJlcU9yUmVzLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddO1xuICB2YXIgcE9yQyA9IF8ubWFwKF8udW5pb24oZ1BPckMsIG9QT3JDKSwgZnVuY3Rpb24gKGNvbnRlbnRUeXBlKSB7XG4gICAgcmV0dXJuIGNvbnRlbnRUeXBlLnNwbGl0KCc7JylbMF07XG4gIH0pO1xuXG4gIGlmICghY29udGVudFR5cGUpIHtcbiAgICBpZiAoaXNSZXNwb25zZSkge1xuICAgICAgY29udGVudFR5cGUgPSAndGV4dC9wbGFpbic7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnRlbnRUeXBlID0gJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbSc7XG4gICAgfVxuICB9XG5cbiAgY29udGVudFR5cGUgPSBjb250ZW50VHlwZS5zcGxpdCgnOycpWzBdO1xuXG4gIGlmIChwT3JDLmxlbmd0aCA+IDAgJiYgKGlzUmVzcG9uc2UgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICB0cnVlIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgWydQT1NUJywgJ1BVVCddLmluZGV4T2YocmVxT3JSZXMubWV0aG9kKSAhPT0gLTEpICYmIHBPckMuaW5kZXhPZihjb250ZW50VHlwZSkgPT09IC0xKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbnRlbnQgdHlwZSAoJyArIGNvbnRlbnRUeXBlICsgJykuICBUaGVzZSBhcmUgdmFsaWQ6ICcgKyBwT3JDLmpvaW4oJywgJykpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgYWdhaW5zdCB0aGUgYWxsb3dhYmxlIHZhbHVlcyAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmdbXX0gYWxsb3dlZCAtIFRoZSBhbGxvd2FibGUgdmFsdWVzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbm90IGFsbG93YWJsZVxuICovXG52YXIgdmFsaWRhdGVFbnVtID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVFbnVtID0gZnVuY3Rpb24gKHZhbCwgYWxsb3dlZCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoYWxsb3dlZCkgJiYgIV8uaXNVbmRlZmluZWQodmFsKSAmJiBhbGxvd2VkLmluZGV4T2YodmFsKSA9PT0gLTEpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0VOVU1fTUlTTUFUQ0gnLCAnTm90IGFuIGFsbG93YWJsZSB2YWx1ZSAoJyArIGFsbG93ZWQuam9pbignLCAnKSArICcpOiAnICsgdmFsKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGlzIGxlc3MgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmd9IG1heGltdW0gLSBUaGUgbWF4aW11bSB2YWx1ZVxuICogQHBhcmFtIHtib29sZWFufSBbZXhjbHVzaXZlPWZhbHNlXSAtIFdoZXRoZXIgb3Igbm90IHRoZSB2YWx1ZSBpbmNsdWRlcyB0aGUgbWF4aW11bSBpbiBpdHMgY29tcGFyaXNvblxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWF4aW11bVxuICovXG52YXIgdmFsaWRhdGVNYXhpbXVtID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhpbXVtID0gZnVuY3Rpb24gKHZhbCwgbWF4aW11bSwgdHlwZSwgZXhjbHVzaXZlKSB7XG4gIHZhciBjb2RlID0gZXhjbHVzaXZlID09PSB0cnVlID8gJ01BWElNVU1fRVhDTFVTSVZFJyA6ICdNQVhJTVVNJztcbiAgdmFyIHRlc3RNYXg7XG4gIHZhciB0ZXN0VmFsO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGV4Y2x1c2l2ZSkpIHtcbiAgICBleGNsdXNpdmUgPSBmYWxzZTtcbiAgfVxuXG4gIGlmICh0eXBlID09PSAnaW50ZWdlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VJbnQodmFsLCAxMCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VGbG9hdCh2YWwpO1xuICB9XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heGltdW0pKSB7XG4gICAgdGVzdE1heCA9IHBhcnNlRmxvYXQobWF4aW11bSk7XG5cbiAgICBpZiAoZXhjbHVzaXZlICYmIHRlc3RWYWwgPj0gdGVzdE1heCkge1xuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKGNvZGUsICdHcmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gdGhlIGNvbmZpZ3VyZWQgbWF4aW11bSAoJyArIG1heGltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfSBlbHNlIGlmICh0ZXN0VmFsID4gdGVzdE1heCkge1xuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKGNvZGUsICdHcmVhdGVyIHRoYW4gdGhlIGNvbmZpZ3VyZWQgbWF4aW11bSAoJyArIG1heGltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgYXJyYXkgY291bnQgaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhJdGVtcyAtIFRoZSBtYXhpbXVtIG51bWJlciBvZiBpdGVtc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGNvbnRhaW5zIG1vcmUgaXRlbXMgdGhhbiBhbGxvd2FibGVcbiAqL1xudmFyIHZhbGlkYXRlTWF4SXRlbXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1heEl0ZW1zID0gZnVuY3Rpb24gKHZhbCwgbWF4SXRlbXMpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heEl0ZW1zKSAmJiB2YWwubGVuZ3RoID4gbWF4SXRlbXMpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0FSUkFZX0xFTkdUSF9MT05HJywgJ0FycmF5IGlzIHRvbyBsb25nICgnICsgdmFsLmxlbmd0aCArICcpLCBtYXhpbXVtICcgKyBtYXhJdGVtcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBsZW5ndGggaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhMZW5ndGggLSBUaGUgbWF4aW11bSBsZW5ndGhcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSdzIGxlbmd0aCBpcyBncmVhdGVyIHRoYW4gdGhlIG1heGltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWF4TGVuZ3RoID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhMZW5ndGggPSBmdW5jdGlvbiAodmFsLCBtYXhMZW5ndGgpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heExlbmd0aCkgJiYgdmFsLmxlbmd0aCA+IG1heExlbmd0aCkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnTUFYX0xFTkdUSCcsICdTdHJpbmcgaXMgdG9vIGxvbmcgKCcgKyB2YWwubGVuZ3RoICsgJyBjaGFycyksIG1heGltdW0gJyArIG1heExlbmd0aCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSdzIHByb3BlcnR5IGNvdW50IGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWluUHJvcGVydGllcyAtIFRoZSBtYXhpbXVtIG51bWJlciBvZiBwcm9wZXJ0aWVzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUncyBwcm9wZXJ0eSBjb3VudCBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWF4UHJvcGVydGllcyA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWF4UHJvcGVydGllcyA9IGZ1bmN0aW9uICh2YWwsIG1heFByb3BlcnRpZXMpIHtcbiAgdmFyIHByb3BDb3VudCA9IF8uaXNQbGFpbk9iamVjdCh2YWwpID8gT2JqZWN0LmtleXModmFsKS5sZW5ndGggOiAwO1xuXG4gIGlmICghXy5pc1VuZGVmaW5lZChtYXhQcm9wZXJ0aWVzKSAmJiBwcm9wQ291bnQgPiBtYXhQcm9wZXJ0aWVzKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNQVhfUFJPUEVSVElFUycsXG4gICAgICAgICAgICAgICAgICAgICAgICdOdW1iZXIgb2YgcHJvcGVydGllcyBpcyB0b28gbWFueSAoJyArIHByb3BDb3VudCArICcgcHJvcGVydGllcyksIG1heGltdW0gJyArIG1heFByb3BlcnRpZXMpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgYXJyYXkgY291bnQgaXMgZ3JlYXRlciB0aGFuIHRoZSBtaW5pbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gbWluaW11bSAtIFRoZSBtaW5pbXVtIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtleGNsdXNpdmU9ZmFsc2VdIC0gV2hldGhlciBvciBub3QgdGhlIHZhbHVlIGluY2x1ZGVzIHRoZSBtaW5pbXVtIGluIGl0cyBjb21wYXJpc29uXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtXG4gKi9cbnZhciB2YWxpZGF0ZU1pbmltdW0gPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbmltdW0gPSBmdW5jdGlvbiAodmFsLCBtaW5pbXVtLCB0eXBlLCBleGNsdXNpdmUpIHtcbiAgdmFyIGNvZGUgPSBleGNsdXNpdmUgPT09IHRydWUgPyAnTUlOSU1VTV9FWENMVVNJVkUnIDogJ01JTklNVU0nO1xuICB2YXIgdGVzdE1pbjtcbiAgdmFyIHRlc3RWYWw7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZXhjbHVzaXZlKSkge1xuICAgIGV4Y2x1c2l2ZSA9IGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGUgPT09ICdpbnRlZ2VyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUludCh2YWwsIDEwKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUZsb2F0KHZhbCk7XG4gIH1cblxuICBpZiAoIV8uaXNVbmRlZmluZWQobWluaW11bSkpIHtcbiAgICB0ZXN0TWluID0gcGFyc2VGbG9hdChtaW5pbXVtKTtcblxuICAgIGlmIChleGNsdXNpdmUgJiYgdGVzdFZhbCA8PSB0ZXN0TWluKSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoY29kZSwgJ0xlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgY29uZmlndXJlZCBtaW5pbXVtICgnICsgbWluaW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9IGVsc2UgaWYgKHRlc3RWYWwgPCB0ZXN0TWluKSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoY29kZSwgJ0xlc3MgdGhhbiB0aGUgY29uZmlndXJlZCBtaW5pbXVtICgnICsgbWluaW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSB2YWx1ZSBjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93ZWQgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pbkl0ZW1zIC0gVGhlIG1pbmltdW0gbnVtYmVyIG9mIGl0ZW1zXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgY29udGFpbnMgZmV3ZXIgaXRlbXMgdGhhbiBhbGxvd2FibGVcbiAqL1xudmFyIHZhbGlkYXRlTWluSXRlbXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbkl0ZW1zID0gZnVuY3Rpb24gKHZhbCwgbWluSXRlbXMpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbkl0ZW1zKSAmJiB2YWwubGVuZ3RoIDwgbWluSXRlbXMpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0FSUkFZX0xFTkdUSF9TSE9SVCcsICdBcnJheSBpcyB0b28gc2hvcnQgKCcgKyB2YWwubGVuZ3RoICsgJyksIG1pbmltdW0gJyArIG1pbkl0ZW1zKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGxlbmd0aCBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pbkxlbmd0aCAtIFRoZSBtaW5pbXVtIGxlbmd0aFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlJ3MgbGVuZ3RoIGlzIGxlc3MgdGhhbiB0aGUgbWluaW11bVxuICovXG52YXIgdmFsaWRhdGVNaW5MZW5ndGggPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbkxlbmd0aCA9IGZ1bmN0aW9uICh2YWwsIG1pbkxlbmd0aCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobWluTGVuZ3RoKSAmJiB2YWwubGVuZ3RoIDwgbWluTGVuZ3RoKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNSU5fTEVOR1RIJywgJ1N0cmluZyBpcyB0b28gc2hvcnQgKCcgKyB2YWwubGVuZ3RoICsgJyBjaGFycyksIG1pbmltdW0gJyArIG1pbkxlbmd0aCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSdzIHByb3BlcnR5IGNvdW50IGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgbWluaW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWluUHJvcGVydGllcyAtIFRoZSBtaW5pbXVtIG51bWJlciBvZiBwcm9wZXJ0aWVzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUncyBwcm9wZXJ0eSBjb3VudCBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWluUHJvcGVydGllcyA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWluUHJvcGVydGllcyA9IGZ1bmN0aW9uICh2YWwsIG1pblByb3BlcnRpZXMpIHtcbiAgdmFyIHByb3BDb3VudCA9IF8uaXNQbGFpbk9iamVjdCh2YWwpID8gT2JqZWN0LmtleXModmFsKS5sZW5ndGggOiAwO1xuXG4gIGlmICghXy5pc1VuZGVmaW5lZChtaW5Qcm9wZXJ0aWVzKSAmJiBwcm9wQ291bnQgPCBtaW5Qcm9wZXJ0aWVzKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNSU5fUFJPUEVSVElFUycsXG4gICAgICAgICAgICAgICAgICAgICAgICdOdW1iZXIgb2YgcHJvcGVydGllcyBpcyB0b28gZmV3ICgnICsgcHJvcENvdW50ICsgJyBwcm9wZXJ0aWVzKSwgbWluaW11bSAnICsgbWluUHJvcGVydGllcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBpcyBhIG11bHRpcGxlIG9mIHRoZSBwcm92aWRlZCBudW1iZXIgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG11bHRpcGxlT2YgLSBUaGUgbnVtYmVyIHRoYXQgc2hvdWxkIGRpdmlkZSBldmVubHkgaW50byB0aGUgdmFsdWVcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93YWJsZVxuICovXG52YXIgdmFsaWRhdGVNdWx0aXBsZU9mID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNdWx0aXBsZU9mID0gZnVuY3Rpb24gKHZhbCwgbXVsdGlwbGVPZikge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobXVsdGlwbGVPZikgJiYgdmFsICUgbXVsdGlwbGVPZiAhPT0gMCkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnTVVMVElQTEVfT0YnLCAnTm90IGEgbXVsdGlwbGUgb2YgJyArIG11bHRpcGxlT2YpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgbWF0Y2hlcyBhIHBhdHRlcm4gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gcGF0dGVybiAtIFRoZSBwYXR0ZXJuXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgZG9lcyBub3QgbWF0Y2ggdGhlIHBhdHRlcm5cbiAqL1xudmFyIHZhbGlkYXRlUGF0dGVybiA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlUGF0dGVybiA9IGZ1bmN0aW9uICh2YWwsIHBhdHRlcm4pIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKHBhdHRlcm4pICYmIF8uaXNOdWxsKHZhbC5tYXRjaChuZXcgUmVnRXhwKHBhdHRlcm4pKSkpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ1BBVFRFUk4nLCAnRG9lcyBub3QgbWF0Y2ggcmVxdWlyZWQgcGF0dGVybjogJyArIHBhdHRlcm4pO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgcmVxdWlyZWRuZXNzICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IHJlcXVpcmVkIC0gV2hldGhlciBvciBub3QgdGhlIHBhcmFtZXRlciBpcyByZXF1aXJlZFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIHJlcXVpcmVkIGJ1dCBpcyBub3QgcHJlc2VudFxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVJlcXVpcmVkbmVzcyA9IGZ1bmN0aW9uICh2YWwsIHJlcXVpcmVkKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChyZXF1aXJlZCkgJiYgcmVxdWlyZWQgPT09IHRydWUgJiYgXy5pc1VuZGVmaW5lZCh2YWwpKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdSRVFVSVJFRCcsICdJcyByZXF1aXJlZCcpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgdHlwZSBhbmQgZm9ybWF0ICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHZlcnNpb24gLSBUaGUgU3dhZ2dlciB2ZXJzaW9uXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gVGhlIHBhcmFtZXRlciB0eXBlXG4gKiBAcGFyYW0ge3N0cmluZ30gZm9ybWF0IC0gVGhlIHBhcmFtZXRlciBmb3JtYXRcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3NraXBFcnJvcj1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0byBza2lwIHRocm93aW5nIGFuIGVycm9yIChVc2VmdWwgZm9yIHZhbGlkYXRpbmcgYXJyYXlzKVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIG5vdCB0aGUgcHJvcGVyIHR5cGUgb3IgZm9ybWF0XG4gKi9cbnZhciB2YWxpZGF0ZVR5cGVBbmRGb3JtYXQgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVR5cGVBbmRGb3JtYXQgPVxuICBmdW5jdGlvbiB2YWxpZGF0ZVR5cGVBbmRGb3JtYXQgKHZlcnNpb24sIHZhbCwgdHlwZSwgZm9ybWF0LCBhbGxvd0VtcHR5VmFsdWUsIHNraXBFcnJvcikge1xuICAgIHZhciByZXN1bHQgPSB0cnVlO1xuICAgIHZhciBvVmFsID0gdmFsO1xuXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gZW1wdHkgdmFsdWUgYW5kIHdlIGFsbG93IGVtcHR5IHZhbHVlcywgdGhlIHZhbHVlIGlzIGFsd2F5cyB2YWxpZFxuICAgIGlmIChhbGxvd0VtcHR5VmFsdWUgPT09IHRydWUgJiYgdmFsID09PSAnJykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChfLmlzQXJyYXkodmFsKSkge1xuICAgICAgXy5lYWNoKHZhbCwgZnVuY3Rpb24gKGFWYWwsIGluZGV4KSB7XG4gICAgICAgIGlmICghdmFsaWRhdGVUeXBlQW5kRm9ybWF0KHZlcnNpb24sIGFWYWwsIHR5cGUsIGZvcm1hdCwgYWxsb3dFbXB0eVZhbHVlLCB0cnVlKSkge1xuICAgICAgICAgIHRocm93RXJyb3JXaXRoQ29kZSgnSU5WQUxJRF9UWVBFJywgJ1ZhbHVlIGF0IGluZGV4ICcgKyBpbmRleCArICcgaXMgbm90IGEgdmFsaWQgJyArIHR5cGUgKyAnOiAnICsgYVZhbCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAvLyBDb2VyY2UgdGhlIHZhbHVlIG9ubHkgZm9yIFN3YWdnZXIgMS4yXG4gICAgICAgIGlmICh2ZXJzaW9uID09PSAnMS4yJyAmJiBfLmlzU3RyaW5nKHZhbCkpIHtcbiAgICAgICAgICBpZiAodmFsID09PSAnZmFsc2UnKSB7XG4gICAgICAgICAgICB2YWwgPSBmYWxzZTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHZhbCA9PT0gJ3RydWUnKSB7XG4gICAgICAgICAgICB2YWwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdCA9IF8uaXNCb29sZWFuKHZhbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW50ZWdlcic6XG4gICAgICAgIC8vIENvZXJjZSB0aGUgdmFsdWUgb25seSBmb3IgU3dhZ2dlciAxLjJcbiAgICAgICAgaWYgKHZlcnNpb24gPT09ICcxLjInICYmIF8uaXNTdHJpbmcodmFsKSkge1xuICAgICAgICAgIHZhbCA9IE51bWJlcih2YWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0ID0gXy5pc0Zpbml0ZSh2YWwpICYmIChNYXRoLnJvdW5kKHZhbCkgPT09IHZhbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgLy8gQ29lcmNlIHRoZSB2YWx1ZSBvbmx5IGZvciBTd2FnZ2VyIDEuMlxuICAgICAgICBpZiAodmVyc2lvbiA9PT0gJzEuMicgJiYgXy5pc1N0cmluZyh2YWwpKSB7XG4gICAgICAgICAgdmFsID0gTnVtYmVyKHZhbCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHQgPSBfLmlzRmluaXRlKHZhbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKGZvcm1hdCkpIHtcbiAgICAgICAgICBzd2l0Y2ggKGZvcm1hdCkge1xuICAgICAgICAgIGNhc2UgJ2RhdGUnOlxuICAgICAgICAgICAgcmVzdWx0ID0gaXNWYWxpZERhdGUodmFsKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2RhdGUtdGltZSc6XG4gICAgICAgICAgICByZXN1bHQgPSBpc1ZhbGlkRGF0ZVRpbWUodmFsKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ3V1aWQnOlxuICAgICAgICAgICAgcmVzdWx0ID0gdmFsaWRhdG9yLmlzVVVJRCh2YWwpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAndm9pZCc6XG4gICAgICAgIHJlc3VsdCA9IF8uaXNVbmRlZmluZWQodmFsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNraXBFcnJvcikge1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGVsc2UgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHRocm93RXJyb3JXaXRoQ29kZSgnSU5WQUxJRF9UWVBFJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlICE9PSAndm9pZCcgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ05vdCBhIHZhbGlkICcgKyAoXy5pc1VuZGVmaW5lZChmb3JtYXQpID8gJycgOiBmb3JtYXQgKyAnICcpICsgdHlwZSArICc6ICcgKyBvVmFsIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdWb2lkIGRvZXMgbm90IGFsbG93IGEgdmFsdWUnKTtcbiAgICB9XG4gIH07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSB2YWx1ZXMgYXJlIHVuaXF1ZSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNVbmlxdWUgLSBXaGV0aGVyIG9yIG5vdCB0aGUgcGFyYW1ldGVyIHZhbHVlcyBhcmUgdW5pcXVlXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaGFzIGR1cGxpY2F0ZXNcbiAqL1xudmFyIHZhbGlkYXRlVW5pcXVlSXRlbXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVVuaXF1ZUl0ZW1zID0gZnVuY3Rpb24gKHZhbCwgaXNVbmlxdWUpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGlzVW5pcXVlKSAmJiBfLnVuaXEodmFsKS5sZW5ndGggIT09IHZhbC5sZW5ndGgpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0FSUkFZX1VOSVFVRScsICdEb2VzIG5vdCBhbGxvdyBkdXBsaWNhdGUgdmFsdWVzOiAnICsgdmFsLmpvaW4oJywgJykpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgYWdhaW5zdCB0aGUgc2NoZW1hLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uIC0gVGhlIFN3YWdnZXIgdmVyc2lvblxuICogQHBhcmFtIHtvYmplY3R9IHNjaGVtYSAtIFRoZSBzY2hlbWEgdG8gdXNlIHRvIHZhbGlkYXRlIHRoaW5nc1xuICogQHBhcmFtIHtzdHJpbmdbXX0gcGF0aCAtIFRoZSBwYXRoIHRvIHRoZSBzY2hlbWFcbiAqIEBwYXJhbSB7Kn0gW3ZhbF0gLSBUaGUgdmFsdWUgdG8gdmFsaWRhdGUgb3IgdW5kZWZpbmVkIHRvIHVzZSB0aGUgZGVmYXVsdCB2YWx1ZSBwcm92aWRlZCBieSB0aGUgc2NoZW1hXG4gKlxuICogQHRocm93cyBFcnJvciBpZiBhbnkgdmFsaWRhdGlvbiBmYWlsZXNcbiAqL1xudmFyIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzID0gZnVuY3Rpb24gKHZlcnNpb24sIHNjaGVtYSwgcGF0aCwgdmFsKSB7XG4gIHZhciByZXNvbHZlU2NoZW1hID0gZnVuY3Rpb24gKHNjaGVtYSkge1xuICAgIHZhciByZXNvbHZlZCA9IHNjaGVtYTtcblxuICAgIGlmIChyZXNvbHZlZC5zY2hlbWEpIHtcbiAgICAgIHBhdGggPSBwYXRoLmNvbmNhdChbJ3NjaGVtYSddKTtcblxuICAgICAgcmVzb2x2ZWQgPSByZXNvbHZlU2NoZW1hKHJlc29sdmVkLnNjaGVtYSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc29sdmVkO1xuICB9O1xuXG4gIHZhciB0eXBlID0gc2NoZW1hLnR5cGU7XG4gIHZhciBhbGxvd0VtcHR5VmFsdWU7XG5cbiAgaWYgKCF0eXBlKSB7XG4gICAgaWYgKCFzY2hlbWEuc2NoZW1hKSB7XG4gICAgICBpZiAocGF0aFtwYXRoLmxlbmd0aCAtIDJdID09PSAncmVzcG9uc2VzJykge1xuICAgICAgICB0eXBlID0gJ3ZvaWQnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHlwZSA9ICdvYmplY3QnO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzY2hlbWEgPSByZXNvbHZlU2NoZW1hKHNjaGVtYSk7XG4gICAgICB0eXBlID0gc2NoZW1hLnR5cGUgfHwgJ29iamVjdCc7XG4gICAgfVxuICB9XG5cbiAgYWxsb3dFbXB0eVZhbHVlID0gc2NoZW1hID8gc2NoZW1hLmFsbG93RW1wdHlWYWx1ZSA9PT0gdHJ1ZSA6IGZhbHNlO1xuXG4gIHRyeSB7XG4gICAgLy8gQWx3YXlzIHBlcmZvcm0gdGhpcyBjaGVjayBldmVuIGlmIHRoZXJlIGlzIG5vIHZhbHVlXG4gICAgaWYgKHR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgIHZhbGlkYXRlQXJyYXlUeXBlKHNjaGVtYSk7XG4gICAgfVxuXG4gICAgLy8gRGVmYXVsdCB0byBkZWZhdWx0IHZhbHVlIGlmIG5lY2Vzc2FyeVxuICAgIGlmIChfLmlzVW5kZWZpbmVkKHZhbCkpIHtcbiAgICAgIHZhbCA9IHZlcnNpb24gPT09ICcxLjInID8gc2NoZW1hLmRlZmF1bHRWYWx1ZSA6IHNjaGVtYS5kZWZhdWx0O1xuXG4gICAgICBwYXRoID0gcGF0aC5jb25jYXQoW3ZlcnNpb24gPT09ICcxLjInID8gJ2RlZmF1bHRWYWx1ZScgOiAnZGVmYXVsdCddKTtcbiAgICB9XG5cbiAgICAvLyBJZiB0aGVyZSBpcyBubyBleHBsaWNpdCBkZWZhdWx0IHZhbHVlLCByZXR1cm4gYXMgYWxsIHZhbGlkYXRpb25zIHdpbGwgZmFpbFxuICAgIGlmIChfLmlzVW5kZWZpbmVkKHZhbCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgXy5lYWNoKHZhbCwgZnVuY3Rpb24gKHZhbCwgaW5kZXgpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKHZlcnNpb24sIHNjaGVtYS5pdGVtcyB8fCB7fSwgcGF0aC5jb25jYXQoaW5kZXgudG9TdHJpbmcoKSksIHZhbCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIGVyci5tZXNzYWdlID0gJ1ZhbHVlIGF0IGluZGV4ICcgKyBpbmRleCArICcgJyArIChlcnIuY29kZSA9PT0gJ0lOVkFMSURfVFlQRScgPyAnaXMgJyA6ICcnKSArXG4gICAgICAgICAgICBlcnIubWVzc2FnZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGVyci5tZXNzYWdlLnN1YnN0cmluZygxKTtcblxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbGlkYXRlVHlwZUFuZEZvcm1hdCh2ZXJzaW9uLCB2YWwsIHR5cGUsIHNjaGVtYS5mb3JtYXQsIGFsbG93RW1wdHlWYWx1ZSk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgZW51bVxuICAgIHZhbGlkYXRlRW51bSh2YWwsIHNjaGVtYS5lbnVtKTtcblxuICAgIC8vIFZhbGlkYXRlIG1heGltdW1cbiAgICB2YWxpZGF0ZU1heGltdW0odmFsLCBzY2hlbWEubWF4aW11bSwgdHlwZSwgc2NoZW1hLmV4Y2x1c2l2ZU1heGltdW0pO1xuXG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhJdGVtcyAoU3dhZ2dlciAyLjArKVxuICAgIHZhbGlkYXRlTWF4SXRlbXModmFsLCBzY2hlbWEubWF4SXRlbXMpO1xuXG4gICAgLy8gVmFsaWRhdGUgbWF4TGVuZ3RoIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVNYXhMZW5ndGgodmFsLCBzY2hlbWEubWF4TGVuZ3RoKTtcblxuICAgIC8vIFZhbGlkYXRlIG1heFByb3BlcnRpZXMgKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZU1heFByb3BlcnRpZXModmFsLCBzY2hlbWEubWF4UHJvcGVydGllcyk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtaW5pbXVtXG4gICAgdmFsaWRhdGVNaW5pbXVtKHZhbCwgc2NoZW1hLm1pbmltdW0sIHR5cGUsIHNjaGVtYS5leGNsdXNpdmVNaW5pbXVtKTtcblxuICAgIC8vIFZhbGlkYXRlIG1pbkl0ZW1zXG4gICAgdmFsaWRhdGVNaW5JdGVtcyh2YWwsIHNjaGVtYS5taW5JdGVtcyk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtaW5MZW5ndGggKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZU1pbkxlbmd0aCh2YWwsIHNjaGVtYS5taW5MZW5ndGgpO1xuXG4gICAgLy8gVmFsaWRhdGUgbWluUHJvcGVydGllcyAoU3dhZ2dlciAyLjArKVxuICAgIHZhbGlkYXRlTWluUHJvcGVydGllcyh2YWwsIHNjaGVtYS5taW5Qcm9wZXJ0aWVzKTtcblxuICAgIC8vIFZhbGlkYXRlIG11bHRpcGxlT2YgKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZU11bHRpcGxlT2YodmFsLCBzY2hlbWEubXVsdGlwbGVPZik7XG5cbiAgICAvLyBWYWxpZGF0ZSBwYXR0ZXJuIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVQYXR0ZXJuKHZhbCwgc2NoZW1hLnBhdHRlcm4pO1xuXG4gICAgLy8gVmFsaWRhdGUgdW5pcXVlSXRlbXNcbiAgICB2YWxpZGF0ZVVuaXF1ZUl0ZW1zKHZhbCwgc2NoZW1hLnVuaXF1ZUl0ZW1zKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgZXJyLnBhdGggPSBwYXRoO1xuXG4gICAgdGhyb3cgZXJyO1xuICB9XG59O1xuIiwidmFyIGJhc2VEaWZmZXJlbmNlID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZURpZmZlcmVuY2UnKSxcbiAgICBiYXNlRmxhdHRlbiA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2Jhc2VGbGF0dGVuJyksXG4gICAgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc0FycmF5TGlrZScpLFxuICAgIGlzT2JqZWN0TGlrZSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzT2JqZWN0TGlrZScpLFxuICAgIHJlc3RQYXJhbSA9IHJlcXVpcmUoJy4uL2Z1bmN0aW9uL3Jlc3RQYXJhbScpO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gYXJyYXkgb2YgdW5pcXVlIGBhcnJheWAgdmFsdWVzIG5vdCBpbmNsdWRlZCBpbiB0aGUgb3RoZXJcbiAqIHByb3ZpZGVkIGFycmF5cyB1c2luZyBbYFNhbWVWYWx1ZVplcm9gXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1zYW1ldmFsdWV6ZXJvKVxuICogZm9yIGVxdWFsaXR5IGNvbXBhcmlzb25zLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgQXJyYXlcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpbnNwZWN0LlxuICogQHBhcmFtIHsuLi5BcnJheX0gW3ZhbHVlc10gVGhlIGFycmF5cyBvZiB2YWx1ZXMgdG8gZXhjbHVkZS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IGFycmF5IG9mIGZpbHRlcmVkIHZhbHVlcy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5kaWZmZXJlbmNlKFsxLCAyLCAzXSwgWzQsIDJdKTtcbiAqIC8vID0+IFsxLCAzXVxuICovXG52YXIgZGlmZmVyZW5jZSA9IHJlc3RQYXJhbShmdW5jdGlvbihhcnJheSwgdmFsdWVzKSB7XG4gIHJldHVybiAoaXNPYmplY3RMaWtlKGFycmF5KSAmJiBpc0FycmF5TGlrZShhcnJheSkpXG4gICAgPyBiYXNlRGlmZmVyZW5jZShhcnJheSwgYmFzZUZsYXR0ZW4odmFsdWVzLCBmYWxzZSwgdHJ1ZSkpXG4gICAgOiBbXTtcbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGRpZmZlcmVuY2U7XG4iLCJ2YXIgYmFzZUluZGV4T2YgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlSW5kZXhPZicpLFxuICAgIGJpbmFyeUluZGV4ID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmluYXJ5SW5kZXgnKTtcblxuLyogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzIGZvciB0aG9zZSB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgb3RoZXIgYGxvZGFzaGAgbWV0aG9kcy4gKi9cbnZhciBuYXRpdmVNYXggPSBNYXRoLm1heDtcblxuLyoqXG4gKiBHZXRzIHRoZSBpbmRleCBhdCB3aGljaCB0aGUgZmlyc3Qgb2NjdXJyZW5jZSBvZiBgdmFsdWVgIGlzIGZvdW5kIGluIGBhcnJheWBcbiAqIHVzaW5nIFtgU2FtZVZhbHVlWmVyb2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLXNhbWV2YWx1ZXplcm8pXG4gKiBmb3IgZXF1YWxpdHkgY29tcGFyaXNvbnMuIElmIGBmcm9tSW5kZXhgIGlzIG5lZ2F0aXZlLCBpdCdzIHVzZWQgYXMgdGhlIG9mZnNldFxuICogZnJvbSB0aGUgZW5kIG9mIGBhcnJheWAuIElmIGBhcnJheWAgaXMgc29ydGVkIHByb3ZpZGluZyBgdHJ1ZWAgZm9yIGBmcm9tSW5kZXhgXG4gKiBwZXJmb3JtcyBhIGZhc3RlciBiaW5hcnkgc2VhcmNoLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgQXJyYXlcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBzZWFyY2guXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBzZWFyY2ggZm9yLlxuICogQHBhcmFtIHtib29sZWFufG51bWJlcn0gW2Zyb21JbmRleD0wXSBUaGUgaW5kZXggdG8gc2VhcmNoIGZyb20gb3IgYHRydWVgXG4gKiAgdG8gcGVyZm9ybSBhIGJpbmFyeSBzZWFyY2ggb24gYSBzb3J0ZWQgYXJyYXkuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbWF0Y2hlZCB2YWx1ZSwgZWxzZSBgLTFgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmluZGV4T2YoWzEsIDIsIDEsIDJdLCAyKTtcbiAqIC8vID0+IDFcbiAqXG4gKiAvLyB1c2luZyBgZnJvbUluZGV4YFxuICogXy5pbmRleE9mKFsxLCAyLCAxLCAyXSwgMiwgMik7XG4gKiAvLyA9PiAzXG4gKlxuICogLy8gcGVyZm9ybWluZyBhIGJpbmFyeSBzZWFyY2hcbiAqIF8uaW5kZXhPZihbMSwgMSwgMiwgMl0sIDIsIHRydWUpO1xuICogLy8gPT4gMlxuICovXG5mdW5jdGlvbiBpbmRleE9mKGFycmF5LCB2YWx1ZSwgZnJvbUluZGV4KSB7XG4gIHZhciBsZW5ndGggPSBhcnJheSA/IGFycmF5Lmxlbmd0aCA6IDA7XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgcmV0dXJuIC0xO1xuICB9XG4gIGlmICh0eXBlb2YgZnJvbUluZGV4ID09ICdudW1iZXInKSB7XG4gICAgZnJvbUluZGV4ID0gZnJvbUluZGV4IDwgMCA/IG5hdGl2ZU1heChsZW5ndGggKyBmcm9tSW5kZXgsIDApIDogZnJvbUluZGV4O1xuICB9IGVsc2UgaWYgKGZyb21JbmRleCkge1xuICAgIHZhciBpbmRleCA9IGJpbmFyeUluZGV4KGFycmF5LCB2YWx1ZSk7XG4gICAgaWYgKGluZGV4IDwgbGVuZ3RoICYmXG4gICAgICAgICh2YWx1ZSA9PT0gdmFsdWUgPyAodmFsdWUgPT09IGFycmF5W2luZGV4XSkgOiAoYXJyYXlbaW5kZXhdICE9PSBhcnJheVtpbmRleF0pKSkge1xuICAgICAgcmV0dXJuIGluZGV4O1xuICAgIH1cbiAgICByZXR1cm4gLTE7XG4gIH1cbiAgcmV0dXJuIGJhc2VJbmRleE9mKGFycmF5LCB2YWx1ZSwgZnJvbUluZGV4IHx8IDApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGluZGV4T2Y7XG4iLCIvKipcbiAqIEdldHMgdGhlIGxhc3QgZWxlbWVudCBvZiBgYXJyYXlgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgQXJyYXlcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBsYXN0IGVsZW1lbnQgb2YgYGFycmF5YC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5sYXN0KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiAzXG4gKi9cbmZ1bmN0aW9uIGxhc3QoYXJyYXkpIHtcbiAgdmFyIGxlbmd0aCA9IGFycmF5ID8gYXJyYXkubGVuZ3RoIDogMDtcbiAgcmV0dXJuIGxlbmd0aCA/IGFycmF5W2xlbmd0aCAtIDFdIDogdW5kZWZpbmVkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGxhc3Q7XG4iLCJ2YXIgYmFzZUZsYXR0ZW4gPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlRmxhdHRlbicpLFxuICAgIGJhc2VVbmlxID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZVVuaXEnKSxcbiAgICByZXN0UGFyYW0gPSByZXF1aXJlKCcuLi9mdW5jdGlvbi9yZXN0UGFyYW0nKTtcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHVuaXF1ZSB2YWx1ZXMsIGluIG9yZGVyLCBmcm9tIGFsbCBvZiB0aGUgcHJvdmlkZWQgYXJyYXlzXG4gKiB1c2luZyBbYFNhbWVWYWx1ZVplcm9gXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1zYW1ldmFsdWV6ZXJvKVxuICogZm9yIGVxdWFsaXR5IGNvbXBhcmlzb25zLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgQXJyYXlcbiAqIEBwYXJhbSB7Li4uQXJyYXl9IFthcnJheXNdIFRoZSBhcnJheXMgdG8gaW5zcGVjdC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IGFycmF5IG9mIGNvbWJpbmVkIHZhbHVlcy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy51bmlvbihbMSwgMl0sIFs0LCAyXSwgWzIsIDFdKTtcbiAqIC8vID0+IFsxLCAyLCA0XVxuICovXG52YXIgdW5pb24gPSByZXN0UGFyYW0oZnVuY3Rpb24oYXJyYXlzKSB7XG4gIHJldHVybiBiYXNlVW5pcShiYXNlRmxhdHRlbihhcnJheXMsIGZhbHNlLCB0cnVlKSk7XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSB1bmlvbjtcbiIsInZhciBiYXNlQ2FsbGJhY2sgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlQ2FsbGJhY2snKSxcbiAgICBiYXNlVW5pcSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2Jhc2VVbmlxJyksXG4gICAgaXNJdGVyYXRlZUNhbGwgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc0l0ZXJhdGVlQ2FsbCcpLFxuICAgIHNvcnRlZFVuaXEgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9zb3J0ZWRVbmlxJyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGR1cGxpY2F0ZS1mcmVlIHZlcnNpb24gb2YgYW4gYXJyYXksIHVzaW5nXG4gKiBbYFNhbWVWYWx1ZVplcm9gXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1zYW1ldmFsdWV6ZXJvKVxuICogZm9yIGVxdWFsaXR5IGNvbXBhcmlzb25zLCBpbiB3aGljaCBvbmx5IHRoZSBmaXJzdCBvY2N1cmVuY2Ugb2YgZWFjaCBlbGVtZW50XG4gKiBpcyBrZXB0LiBQcm92aWRpbmcgYHRydWVgIGZvciBgaXNTb3J0ZWRgIHBlcmZvcm1zIGEgZmFzdGVyIHNlYXJjaCBhbGdvcml0aG1cbiAqIGZvciBzb3J0ZWQgYXJyYXlzLiBJZiBhbiBpdGVyYXRlZSBmdW5jdGlvbiBpcyBwcm92aWRlZCBpdCdzIGludm9rZWQgZm9yXG4gKiBlYWNoIGVsZW1lbnQgaW4gdGhlIGFycmF5IHRvIGdlbmVyYXRlIHRoZSBjcml0ZXJpb24gYnkgd2hpY2ggdW5pcXVlbmVzc1xuICogaXMgY29tcHV0ZWQuIFRoZSBgaXRlcmF0ZWVgIGlzIGJvdW5kIHRvIGB0aGlzQXJnYCBhbmQgaW52b2tlZCB3aXRoIHRocmVlXG4gKiBhcmd1bWVudHM6ICh2YWx1ZSwgaW5kZXgsIGFycmF5KS5cbiAqXG4gKiBJZiBhIHByb3BlcnR5IG5hbWUgaXMgcHJvdmlkZWQgZm9yIGBpdGVyYXRlZWAgdGhlIGNyZWF0ZWQgYF8ucHJvcGVydHlgXG4gKiBzdHlsZSBjYWxsYmFjayByZXR1cm5zIHRoZSBwcm9wZXJ0eSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAqXG4gKiBJZiBhIHZhbHVlIGlzIGFsc28gcHJvdmlkZWQgZm9yIGB0aGlzQXJnYCB0aGUgY3JlYXRlZCBgXy5tYXRjaGVzUHJvcGVydHlgXG4gKiBzdHlsZSBjYWxsYmFjayByZXR1cm5zIGB0cnVlYCBmb3IgZWxlbWVudHMgdGhhdCBoYXZlIGEgbWF0Y2hpbmcgcHJvcGVydHlcbiAqIHZhbHVlLCBlbHNlIGBmYWxzZWAuXG4gKlxuICogSWYgYW4gb2JqZWN0IGlzIHByb3ZpZGVkIGZvciBgaXRlcmF0ZWVgIHRoZSBjcmVhdGVkIGBfLm1hdGNoZXNgIHN0eWxlXG4gKiBjYWxsYmFjayByZXR1cm5zIGB0cnVlYCBmb3IgZWxlbWVudHMgdGhhdCBoYXZlIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBnaXZlblxuICogb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBhbGlhcyB1bmlxdWVcbiAqIEBjYXRlZ29yeSBBcnJheVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIGluc3BlY3QuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtpc1NvcnRlZF0gU3BlY2lmeSB0aGUgYXJyYXkgaXMgc29ydGVkLlxuICogQHBhcmFtIHtGdW5jdGlvbnxPYmplY3R8c3RyaW5nfSBbaXRlcmF0ZWVdIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGl0ZXJhdGVlYC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IGR1cGxpY2F0ZS12YWx1ZS1mcmVlIGFycmF5LlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLnVuaXEoWzIsIDEsIDJdKTtcbiAqIC8vID0+IFsyLCAxXVxuICpcbiAqIC8vIHVzaW5nIGBpc1NvcnRlZGBcbiAqIF8udW5pcShbMSwgMSwgMl0sIHRydWUpO1xuICogLy8gPT4gWzEsIDJdXG4gKlxuICogLy8gdXNpbmcgYW4gaXRlcmF0ZWUgZnVuY3Rpb25cbiAqIF8udW5pcShbMSwgMi41LCAxLjUsIDJdLCBmdW5jdGlvbihuKSB7XG4gKiAgIHJldHVybiB0aGlzLmZsb29yKG4pO1xuICogfSwgTWF0aCk7XG4gKiAvLyA9PiBbMSwgMi41XVxuICpcbiAqIC8vIHVzaW5nIHRoZSBgXy5wcm9wZXJ0eWAgY2FsbGJhY2sgc2hvcnRoYW5kXG4gKiBfLnVuaXEoW3sgJ3gnOiAxIH0sIHsgJ3gnOiAyIH0sIHsgJ3gnOiAxIH1dLCAneCcpO1xuICogLy8gPT4gW3sgJ3gnOiAxIH0sIHsgJ3gnOiAyIH1dXG4gKi9cbmZ1bmN0aW9uIHVuaXEoYXJyYXksIGlzU29ydGVkLCBpdGVyYXRlZSwgdGhpc0FyZykge1xuICB2YXIgbGVuZ3RoID0gYXJyYXkgPyBhcnJheS5sZW5ndGggOiAwO1xuICBpZiAoIWxlbmd0aCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBpZiAoaXNTb3J0ZWQgIT0gbnVsbCAmJiB0eXBlb2YgaXNTb3J0ZWQgIT0gJ2Jvb2xlYW4nKSB7XG4gICAgdGhpc0FyZyA9IGl0ZXJhdGVlO1xuICAgIGl0ZXJhdGVlID0gaXNJdGVyYXRlZUNhbGwoYXJyYXksIGlzU29ydGVkLCB0aGlzQXJnKSA/IHVuZGVmaW5lZCA6IGlzU29ydGVkO1xuICAgIGlzU29ydGVkID0gZmFsc2U7XG4gIH1cbiAgaXRlcmF0ZWUgPSBpdGVyYXRlZSA9PSBudWxsID8gaXRlcmF0ZWUgOiBiYXNlQ2FsbGJhY2soaXRlcmF0ZWUsIHRoaXNBcmcsIDMpO1xuICByZXR1cm4gKGlzU29ydGVkKVxuICAgID8gc29ydGVkVW5pcShhcnJheSwgaXRlcmF0ZWUpXG4gICAgOiBiYXNlVW5pcShhcnJheSwgaXRlcmF0ZWUpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHVuaXE7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vZm9yRWFjaCcpO1xuIiwidmFyIGJhc2VFYWNoID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZUVhY2gnKSxcbiAgICBjcmVhdGVGaW5kID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvY3JlYXRlRmluZCcpO1xuXG4vKipcbiAqIEl0ZXJhdGVzIG92ZXIgZWxlbWVudHMgb2YgYGNvbGxlY3Rpb25gLCByZXR1cm5pbmcgdGhlIGZpcnN0IGVsZW1lbnRcbiAqIGBwcmVkaWNhdGVgIHJldHVybnMgdHJ1dGh5IGZvci4gVGhlIHByZWRpY2F0ZSBpcyBib3VuZCB0byBgdGhpc0FyZ2AgYW5kXG4gKiBpbnZva2VkIHdpdGggdGhyZWUgYXJndW1lbnRzOiAodmFsdWUsIGluZGV4fGtleSwgY29sbGVjdGlvbikuXG4gKlxuICogSWYgYSBwcm9wZXJ0eSBuYW1lIGlzIHByb3ZpZGVkIGZvciBgcHJlZGljYXRlYCB0aGUgY3JlYXRlZCBgXy5wcm9wZXJ0eWBcbiAqIHN0eWxlIGNhbGxiYWNrIHJldHVybnMgdGhlIHByb3BlcnR5IHZhbHVlIG9mIHRoZSBnaXZlbiBlbGVtZW50LlxuICpcbiAqIElmIGEgdmFsdWUgaXMgYWxzbyBwcm92aWRlZCBmb3IgYHRoaXNBcmdgIHRoZSBjcmVhdGVkIGBfLm1hdGNoZXNQcm9wZXJ0eWBcbiAqIHN0eWxlIGNhbGxiYWNrIHJldHVybnMgYHRydWVgIGZvciBlbGVtZW50cyB0aGF0IGhhdmUgYSBtYXRjaGluZyBwcm9wZXJ0eVxuICogdmFsdWUsIGVsc2UgYGZhbHNlYC5cbiAqXG4gKiBJZiBhbiBvYmplY3QgaXMgcHJvdmlkZWQgZm9yIGBwcmVkaWNhdGVgIHRoZSBjcmVhdGVkIGBfLm1hdGNoZXNgIHN0eWxlXG4gKiBjYWxsYmFjayByZXR1cm5zIGB0cnVlYCBmb3IgZWxlbWVudHMgdGhhdCBoYXZlIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBnaXZlblxuICogb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBhbGlhcyBkZXRlY3RcbiAqIEBjYXRlZ29yeSBDb2xsZWN0aW9uXG4gKiBAcGFyYW0ge0FycmF5fE9iamVjdHxzdHJpbmd9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gc2VhcmNoLlxuICogQHBhcmFtIHtGdW5jdGlvbnxPYmplY3R8c3RyaW5nfSBbcHJlZGljYXRlPV8uaWRlbnRpdHldIFRoZSBmdW5jdGlvbiBpbnZva2VkXG4gKiAgcGVyIGl0ZXJhdGlvbi5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgcHJlZGljYXRlYC5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBtYXRjaGVkIGVsZW1lbnQsIGVsc2UgYHVuZGVmaW5lZGAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciB1c2VycyA9IFtcbiAqICAgeyAndXNlcic6ICdiYXJuZXknLCAgJ2FnZSc6IDM2LCAnYWN0aXZlJzogdHJ1ZSB9LFxuICogICB7ICd1c2VyJzogJ2ZyZWQnLCAgICAnYWdlJzogNDAsICdhY3RpdmUnOiBmYWxzZSB9LFxuICogICB7ICd1c2VyJzogJ3BlYmJsZXMnLCAnYWdlJzogMSwgICdhY3RpdmUnOiB0cnVlIH1cbiAqIF07XG4gKlxuICogXy5yZXN1bHQoXy5maW5kKHVzZXJzLCBmdW5jdGlvbihjaHIpIHtcbiAqICAgcmV0dXJuIGNoci5hZ2UgPCA0MDtcbiAqIH0pLCAndXNlcicpO1xuICogLy8gPT4gJ2Jhcm5leSdcbiAqXG4gKiAvLyB1c2luZyB0aGUgYF8ubWF0Y2hlc2AgY2FsbGJhY2sgc2hvcnRoYW5kXG4gKiBfLnJlc3VsdChfLmZpbmQodXNlcnMsIHsgJ2FnZSc6IDEsICdhY3RpdmUnOiB0cnVlIH0pLCAndXNlcicpO1xuICogLy8gPT4gJ3BlYmJsZXMnXG4gKlxuICogLy8gdXNpbmcgdGhlIGBfLm1hdGNoZXNQcm9wZXJ0eWAgY2FsbGJhY2sgc2hvcnRoYW5kXG4gKiBfLnJlc3VsdChfLmZpbmQodXNlcnMsICdhY3RpdmUnLCBmYWxzZSksICd1c2VyJyk7XG4gKiAvLyA9PiAnZnJlZCdcbiAqXG4gKiAvLyB1c2luZyB0aGUgYF8ucHJvcGVydHlgIGNhbGxiYWNrIHNob3J0aGFuZFxuICogXy5yZXN1bHQoXy5maW5kKHVzZXJzLCAnYWN0aXZlJyksICd1c2VyJyk7XG4gKiAvLyA9PiAnYmFybmV5J1xuICovXG52YXIgZmluZCA9IGNyZWF0ZUZpbmQoYmFzZUVhY2gpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZpbmQ7XG4iLCJ2YXIgYXJyYXlFYWNoID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYXJyYXlFYWNoJyksXG4gICAgYmFzZUVhY2ggPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlRWFjaCcpLFxuICAgIGNyZWF0ZUZvckVhY2ggPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9jcmVhdGVGb3JFYWNoJyk7XG5cbi8qKlxuICogSXRlcmF0ZXMgb3ZlciBlbGVtZW50cyBvZiBgY29sbGVjdGlvbmAgaW52b2tpbmcgYGl0ZXJhdGVlYCBmb3IgZWFjaCBlbGVtZW50LlxuICogVGhlIGBpdGVyYXRlZWAgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGggdGhyZWUgYXJndW1lbnRzOlxuICogKHZhbHVlLCBpbmRleHxrZXksIGNvbGxlY3Rpb24pLiBJdGVyYXRlZSBmdW5jdGlvbnMgbWF5IGV4aXQgaXRlcmF0aW9uIGVhcmx5XG4gKiBieSBleHBsaWNpdGx5IHJldHVybmluZyBgZmFsc2VgLlxuICpcbiAqICoqTm90ZToqKiBBcyB3aXRoIG90aGVyIFwiQ29sbGVjdGlvbnNcIiBtZXRob2RzLCBvYmplY3RzIHdpdGggYSBcImxlbmd0aFwiIHByb3BlcnR5XG4gKiBhcmUgaXRlcmF0ZWQgbGlrZSBhcnJheXMuIFRvIGF2b2lkIHRoaXMgYmVoYXZpb3IgYF8uZm9ySW5gIG9yIGBfLmZvck93bmBcbiAqIG1heSBiZSB1c2VkIGZvciBvYmplY3QgaXRlcmF0aW9uLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAYWxpYXMgZWFjaFxuICogQGNhdGVnb3J5IENvbGxlY3Rpb25cbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbaXRlcmF0ZWU9Xy5pZGVudGl0eV0gVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgaXRlcmF0ZWVgLlxuICogQHJldHVybnMge0FycmF5fE9iamVjdHxzdHJpbmd9IFJldHVybnMgYGNvbGxlY3Rpb25gLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfKFsxLCAyXSkuZm9yRWFjaChmdW5jdGlvbihuKSB7XG4gKiAgIGNvbnNvbGUubG9nKG4pO1xuICogfSkudmFsdWUoKTtcbiAqIC8vID0+IGxvZ3MgZWFjaCB2YWx1ZSBmcm9tIGxlZnQgdG8gcmlnaHQgYW5kIHJldHVybnMgdGhlIGFycmF5XG4gKlxuICogXy5mb3JFYWNoKHsgJ2EnOiAxLCAnYic6IDIgfSwgZnVuY3Rpb24obiwga2V5KSB7XG4gKiAgIGNvbnNvbGUubG9nKG4sIGtleSk7XG4gKiB9KTtcbiAqIC8vID0+IGxvZ3MgZWFjaCB2YWx1ZS1rZXkgcGFpciBhbmQgcmV0dXJucyB0aGUgb2JqZWN0IChpdGVyYXRpb24gb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQpXG4gKi9cbnZhciBmb3JFYWNoID0gY3JlYXRlRm9yRWFjaChhcnJheUVhY2gsIGJhc2VFYWNoKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmb3JFYWNoO1xuIiwidmFyIGFycmF5TWFwID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYXJyYXlNYXAnKSxcbiAgICBiYXNlQ2FsbGJhY2sgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlQ2FsbGJhY2snKSxcbiAgICBiYXNlTWFwID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZU1hcCcpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKTtcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHZhbHVlcyBieSBydW5uaW5nIGVhY2ggZWxlbWVudCBpbiBgY29sbGVjdGlvbmAgdGhyb3VnaFxuICogYGl0ZXJhdGVlYC4gVGhlIGBpdGVyYXRlZWAgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGggdGhyZWVcbiAqIGFyZ3VtZW50czogKHZhbHVlLCBpbmRleHxrZXksIGNvbGxlY3Rpb24pLlxuICpcbiAqIElmIGEgcHJvcGVydHkgbmFtZSBpcyBwcm92aWRlZCBmb3IgYGl0ZXJhdGVlYCB0aGUgY3JlYXRlZCBgXy5wcm9wZXJ0eWBcbiAqIHN0eWxlIGNhbGxiYWNrIHJldHVybnMgdGhlIHByb3BlcnR5IHZhbHVlIG9mIHRoZSBnaXZlbiBlbGVtZW50LlxuICpcbiAqIElmIGEgdmFsdWUgaXMgYWxzbyBwcm92aWRlZCBmb3IgYHRoaXNBcmdgIHRoZSBjcmVhdGVkIGBfLm1hdGNoZXNQcm9wZXJ0eWBcbiAqIHN0eWxlIGNhbGxiYWNrIHJldHVybnMgYHRydWVgIGZvciBlbGVtZW50cyB0aGF0IGhhdmUgYSBtYXRjaGluZyBwcm9wZXJ0eVxuICogdmFsdWUsIGVsc2UgYGZhbHNlYC5cbiAqXG4gKiBJZiBhbiBvYmplY3QgaXMgcHJvdmlkZWQgZm9yIGBpdGVyYXRlZWAgdGhlIGNyZWF0ZWQgYF8ubWF0Y2hlc2Agc3R5bGVcbiAqIGNhbGxiYWNrIHJldHVybnMgYHRydWVgIGZvciBlbGVtZW50cyB0aGF0IGhhdmUgdGhlIHByb3BlcnRpZXMgb2YgdGhlIGdpdmVuXG4gKiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqXG4gKiBNYW55IGxvZGFzaCBtZXRob2RzIGFyZSBndWFyZGVkIHRvIHdvcmsgYXMgaXRlcmF0ZWVzIGZvciBtZXRob2RzIGxpa2VcbiAqIGBfLmV2ZXJ5YCwgYF8uZmlsdGVyYCwgYF8ubWFwYCwgYF8ubWFwVmFsdWVzYCwgYF8ucmVqZWN0YCwgYW5kIGBfLnNvbWVgLlxuICpcbiAqIFRoZSBndWFyZGVkIG1ldGhvZHMgYXJlOlxuICogYGFyeWAsIGBjYWxsYmFja2AsIGBjaHVua2AsIGBjbG9uZWAsIGBjcmVhdGVgLCBgY3VycnlgLCBgY3VycnlSaWdodGAsXG4gKiBgZHJvcGAsIGBkcm9wUmlnaHRgLCBgZXZlcnlgLCBgZmlsbGAsIGBmbGF0dGVuYCwgYGludmVydGAsIGBtYXhgLCBgbWluYCxcbiAqIGBwYXJzZUludGAsIGBzbGljZWAsIGBzb3J0QnlgLCBgdGFrZWAsIGB0YWtlUmlnaHRgLCBgdGVtcGxhdGVgLCBgdHJpbWAsXG4gKiBgdHJpbUxlZnRgLCBgdHJpbVJpZ2h0YCwgYHRydW5jYCwgYHJhbmRvbWAsIGByYW5nZWAsIGBzYW1wbGVgLCBgc29tZWAsXG4gKiBgc3VtYCwgYHVuaXFgLCBhbmQgYHdvcmRzYFxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAYWxpYXMgY29sbGVjdFxuICogQGNhdGVnb3J5IENvbGxlY3Rpb25cbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufE9iamVjdHxzdHJpbmd9IFtpdGVyYXRlZT1fLmlkZW50aXR5XSBUaGUgZnVuY3Rpb24gaW52b2tlZFxuICogIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGl0ZXJhdGVlYC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IG1hcHBlZCBhcnJheS5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gdGltZXNUaHJlZShuKSB7XG4gKiAgIHJldHVybiBuICogMztcbiAqIH1cbiAqXG4gKiBfLm1hcChbMSwgMl0sIHRpbWVzVGhyZWUpO1xuICogLy8gPT4gWzMsIDZdXG4gKlxuICogXy5tYXAoeyAnYSc6IDEsICdiJzogMiB9LCB0aW1lc1RocmVlKTtcbiAqIC8vID0+IFszLCA2XSAoaXRlcmF0aW9uIG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkKVxuICpcbiAqIHZhciB1c2VycyA9IFtcbiAqICAgeyAndXNlcic6ICdiYXJuZXknIH0sXG4gKiAgIHsgJ3VzZXInOiAnZnJlZCcgfVxuICogXTtcbiAqXG4gKiAvLyB1c2luZyB0aGUgYF8ucHJvcGVydHlgIGNhbGxiYWNrIHNob3J0aGFuZFxuICogXy5tYXAodXNlcnMsICd1c2VyJyk7XG4gKiAvLyA9PiBbJ2Jhcm5leScsICdmcmVkJ11cbiAqL1xuZnVuY3Rpb24gbWFwKGNvbGxlY3Rpb24sIGl0ZXJhdGVlLCB0aGlzQXJnKSB7XG4gIHZhciBmdW5jID0gaXNBcnJheShjb2xsZWN0aW9uKSA/IGFycmF5TWFwIDogYmFzZU1hcDtcbiAgaXRlcmF0ZWUgPSBiYXNlQ2FsbGJhY2soaXRlcmF0ZWUsIHRoaXNBcmcsIDMpO1xuICByZXR1cm4gZnVuYyhjb2xsZWN0aW9uLCBpdGVyYXRlZSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbWFwO1xuIiwidmFyIGFycmF5UmVkdWNlID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYXJyYXlSZWR1Y2UnKSxcbiAgICBiYXNlRWFjaCA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2Jhc2VFYWNoJyksXG4gICAgY3JlYXRlUmVkdWNlID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvY3JlYXRlUmVkdWNlJyk7XG5cbi8qKlxuICogUmVkdWNlcyBgY29sbGVjdGlvbmAgdG8gYSB2YWx1ZSB3aGljaCBpcyB0aGUgYWNjdW11bGF0ZWQgcmVzdWx0IG9mIHJ1bm5pbmdcbiAqIGVhY2ggZWxlbWVudCBpbiBgY29sbGVjdGlvbmAgdGhyb3VnaCBgaXRlcmF0ZWVgLCB3aGVyZSBlYWNoIHN1Y2Nlc3NpdmVcbiAqIGludm9jYXRpb24gaXMgc3VwcGxpZWQgdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgcHJldmlvdXMuIElmIGBhY2N1bXVsYXRvcmBcbiAqIGlzIG5vdCBwcm92aWRlZCB0aGUgZmlyc3QgZWxlbWVudCBvZiBgY29sbGVjdGlvbmAgaXMgdXNlZCBhcyB0aGUgaW5pdGlhbFxuICogdmFsdWUuIFRoZSBgaXRlcmF0ZWVgIGlzIGJvdW5kIHRvIGB0aGlzQXJnYCBhbmQgaW52b2tlZCB3aXRoIGZvdXIgYXJndW1lbnRzOlxuICogKGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXh8a2V5LCBjb2xsZWN0aW9uKS5cbiAqXG4gKiBNYW55IGxvZGFzaCBtZXRob2RzIGFyZSBndWFyZGVkIHRvIHdvcmsgYXMgaXRlcmF0ZWVzIGZvciBtZXRob2RzIGxpa2VcbiAqIGBfLnJlZHVjZWAsIGBfLnJlZHVjZVJpZ2h0YCwgYW5kIGBfLnRyYW5zZm9ybWAuXG4gKlxuICogVGhlIGd1YXJkZWQgbWV0aG9kcyBhcmU6XG4gKiBgYXNzaWduYCwgYGRlZmF1bHRzYCwgYGRlZmF1bHRzRGVlcGAsIGBpbmNsdWRlc2AsIGBtZXJnZWAsIGBzb3J0QnlBbGxgLFxuICogYW5kIGBzb3J0QnlPcmRlcmBcbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGFsaWFzIGZvbGRsLCBpbmplY3RcbiAqIEBjYXRlZ29yeSBDb2xsZWN0aW9uXG4gKiBAcGFyYW0ge0FycmF5fE9iamVjdHxzdHJpbmd9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2l0ZXJhdGVlPV8uaWRlbnRpdHldIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0geyp9IFthY2N1bXVsYXRvcl0gVGhlIGluaXRpYWwgdmFsdWUuXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGl0ZXJhdGVlYC5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBhY2N1bXVsYXRlZCB2YWx1ZS5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5yZWR1Y2UoWzEsIDJdLCBmdW5jdGlvbih0b3RhbCwgbikge1xuICogICByZXR1cm4gdG90YWwgKyBuO1xuICogfSk7XG4gKiAvLyA9PiAzXG4gKlxuICogXy5yZWR1Y2UoeyAnYSc6IDEsICdiJzogMiB9LCBmdW5jdGlvbihyZXN1bHQsIG4sIGtleSkge1xuICogICByZXN1bHRba2V5XSA9IG4gKiAzO1xuICogICByZXR1cm4gcmVzdWx0O1xuICogfSwge30pO1xuICogLy8gPT4geyAnYSc6IDMsICdiJzogNiB9IChpdGVyYXRpb24gb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQpXG4gKi9cbnZhciByZWR1Y2UgPSBjcmVhdGVSZWR1Y2UoYXJyYXlSZWR1Y2UsIGJhc2VFYWNoKTtcblxubW9kdWxlLmV4cG9ydHMgPSByZWR1Y2U7XG4iLCIvKiogVXNlZCBhcyB0aGUgYFR5cGVFcnJvcmAgbWVzc2FnZSBmb3IgXCJGdW5jdGlvbnNcIiBtZXRob2RzLiAqL1xudmFyIEZVTkNfRVJST1JfVEVYVCA9ICdFeHBlY3RlZCBhIGZ1bmN0aW9uJztcblxuLyogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzIGZvciB0aG9zZSB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgb3RoZXIgYGxvZGFzaGAgbWV0aG9kcy4gKi9cbnZhciBuYXRpdmVNYXggPSBNYXRoLm1heDtcblxuLyoqXG4gKiBDcmVhdGVzIGEgZnVuY3Rpb24gdGhhdCBpbnZva2VzIGBmdW5jYCB3aXRoIHRoZSBgdGhpc2AgYmluZGluZyBvZiB0aGVcbiAqIGNyZWF0ZWQgZnVuY3Rpb24gYW5kIGFyZ3VtZW50cyBmcm9tIGBzdGFydGAgYW5kIGJleW9uZCBwcm92aWRlZCBhcyBhbiBhcnJheS5cbiAqXG4gKiAqKk5vdGU6KiogVGhpcyBtZXRob2QgaXMgYmFzZWQgb24gdGhlIFtyZXN0IHBhcmFtZXRlcl0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0Z1bmN0aW9ucy9yZXN0X3BhcmFtZXRlcnMpLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgRnVuY3Rpb25cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGFwcGx5IGEgcmVzdCBwYXJhbWV0ZXIgdG8uXG4gKiBAcGFyYW0ge251bWJlcn0gW3N0YXJ0PWZ1bmMubGVuZ3RoLTFdIFRoZSBzdGFydCBwb3NpdGlvbiBvZiB0aGUgcmVzdCBwYXJhbWV0ZXIuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqIEBleGFtcGxlXG4gKlxuICogdmFyIHNheSA9IF8ucmVzdFBhcmFtKGZ1bmN0aW9uKHdoYXQsIG5hbWVzKSB7XG4gKiAgIHJldHVybiB3aGF0ICsgJyAnICsgXy5pbml0aWFsKG5hbWVzKS5qb2luKCcsICcpICtcbiAqICAgICAoXy5zaXplKG5hbWVzKSA+IDEgPyAnLCAmICcgOiAnJykgKyBfLmxhc3QobmFtZXMpO1xuICogfSk7XG4gKlxuICogc2F5KCdoZWxsbycsICdmcmVkJywgJ2Jhcm5leScsICdwZWJibGVzJyk7XG4gKiAvLyA9PiAnaGVsbG8gZnJlZCwgYmFybmV5LCAmIHBlYmJsZXMnXG4gKi9cbmZ1bmN0aW9uIHJlc3RQYXJhbShmdW5jLCBzdGFydCkge1xuICBpZiAodHlwZW9mIGZ1bmMgIT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRlVOQ19FUlJPUl9URVhUKTtcbiAgfVxuICBzdGFydCA9IG5hdGl2ZU1heChzdGFydCA9PT0gdW5kZWZpbmVkID8gKGZ1bmMubGVuZ3RoIC0gMSkgOiAoK3N0YXJ0IHx8IDApLCAwKTtcbiAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcmdzID0gYXJndW1lbnRzLFxuICAgICAgICBpbmRleCA9IC0xLFxuICAgICAgICBsZW5ndGggPSBuYXRpdmVNYXgoYXJncy5sZW5ndGggLSBzdGFydCwgMCksXG4gICAgICAgIHJlc3QgPSBBcnJheShsZW5ndGgpO1xuXG4gICAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICAgIHJlc3RbaW5kZXhdID0gYXJnc1tzdGFydCArIGluZGV4XTtcbiAgICB9XG4gICAgc3dpdGNoIChzdGFydCkge1xuICAgICAgY2FzZSAwOiByZXR1cm4gZnVuYy5jYWxsKHRoaXMsIHJlc3QpO1xuICAgICAgY2FzZSAxOiByZXR1cm4gZnVuYy5jYWxsKHRoaXMsIGFyZ3NbMF0sIHJlc3QpO1xuICAgICAgY2FzZSAyOiByZXR1cm4gZnVuYy5jYWxsKHRoaXMsIGFyZ3NbMF0sIGFyZ3NbMV0sIHJlc3QpO1xuICAgIH1cbiAgICB2YXIgb3RoZXJBcmdzID0gQXJyYXkoc3RhcnQgKyAxKTtcbiAgICBpbmRleCA9IC0xO1xuICAgIHdoaWxlICgrK2luZGV4IDwgc3RhcnQpIHtcbiAgICAgIG90aGVyQXJnc1tpbmRleF0gPSBhcmdzW2luZGV4XTtcbiAgICB9XG4gICAgb3RoZXJBcmdzW3N0YXJ0XSA9IHJlc3Q7XG4gICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpcywgb3RoZXJBcmdzKTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSByZXN0UGFyYW07XG4iLCJ2YXIgY2FjaGVQdXNoID0gcmVxdWlyZSgnLi9jYWNoZVB1c2gnKSxcbiAgICBnZXROYXRpdmUgPSByZXF1aXJlKCcuL2dldE5hdGl2ZScpO1xuXG4vKiogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIFNldCA9IGdldE5hdGl2ZShnbG9iYWwsICdTZXQnKTtcblxuLyogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzIGZvciB0aG9zZSB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgb3RoZXIgYGxvZGFzaGAgbWV0aG9kcy4gKi9cbnZhciBuYXRpdmVDcmVhdGUgPSBnZXROYXRpdmUoT2JqZWN0LCAnY3JlYXRlJyk7XG5cbi8qKlxuICpcbiAqIENyZWF0ZXMgYSBjYWNoZSBvYmplY3QgdG8gc3RvcmUgdW5pcXVlIHZhbHVlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gW3ZhbHVlc10gVGhlIHZhbHVlcyB0byBjYWNoZS5cbiAqL1xuZnVuY3Rpb24gU2V0Q2FjaGUodmFsdWVzKSB7XG4gIHZhciBsZW5ndGggPSB2YWx1ZXMgPyB2YWx1ZXMubGVuZ3RoIDogMDtcblxuICB0aGlzLmRhdGEgPSB7ICdoYXNoJzogbmF0aXZlQ3JlYXRlKG51bGwpLCAnc2V0JzogbmV3IFNldCB9O1xuICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICB0aGlzLnB1c2godmFsdWVzW2xlbmd0aF0pO1xuICB9XG59XG5cbi8vIEFkZCBmdW5jdGlvbnMgdG8gdGhlIGBTZXRgIGNhY2hlLlxuU2V0Q2FjaGUucHJvdG90eXBlLnB1c2ggPSBjYWNoZVB1c2g7XG5cbm1vZHVsZS5leHBvcnRzID0gU2V0Q2FjaGU7XG4iLCIvKipcbiAqIENvcGllcyB0aGUgdmFsdWVzIG9mIGBzb3VyY2VgIHRvIGBhcnJheWAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IHNvdXJjZSBUaGUgYXJyYXkgdG8gY29weSB2YWx1ZXMgZnJvbS5cbiAqIEBwYXJhbSB7QXJyYXl9IFthcnJheT1bXV0gVGhlIGFycmF5IHRvIGNvcHkgdmFsdWVzIHRvLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIGBhcnJheWAuXG4gKi9cbmZ1bmN0aW9uIGFycmF5Q29weShzb3VyY2UsIGFycmF5KSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gc291cmNlLmxlbmd0aDtcblxuICBhcnJheSB8fCAoYXJyYXkgPSBBcnJheShsZW5ndGgpKTtcbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICBhcnJheVtpbmRleF0gPSBzb3VyY2VbaW5kZXhdO1xuICB9XG4gIHJldHVybiBhcnJheTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBhcnJheUNvcHk7XG4iLCIvKipcbiAqIEEgc3BlY2lhbGl6ZWQgdmVyc2lvbiBvZiBgXy5mb3JFYWNoYCBmb3IgYXJyYXlzIHdpdGhvdXQgc3VwcG9ydCBmb3IgY2FsbGJhY2tcbiAqIHNob3J0aGFuZHMgYW5kIGB0aGlzYCBiaW5kaW5nLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gaXRlcmF0ZWUgVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBgYXJyYXlgLlxuICovXG5mdW5jdGlvbiBhcnJheUVhY2goYXJyYXksIGl0ZXJhdGVlKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgaWYgKGl0ZXJhdGVlKGFycmF5W2luZGV4XSwgaW5kZXgsIGFycmF5KSA9PT0gZmFsc2UpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYXJyYXk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYXJyYXlFYWNoO1xuIiwiLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYF8ubWFwYCBmb3IgYXJyYXlzIHdpdGhvdXQgc3VwcG9ydCBmb3IgY2FsbGJhY2tcbiAqIHNob3J0aGFuZHMgYW5kIGB0aGlzYCBiaW5kaW5nLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gaXRlcmF0ZWUgVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IG1hcHBlZCBhcnJheS5cbiAqL1xuZnVuY3Rpb24gYXJyYXlNYXAoYXJyYXksIGl0ZXJhdGVlKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gYXJyYXkubGVuZ3RoLFxuICAgICAgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKTtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHJlc3VsdFtpbmRleF0gPSBpdGVyYXRlZShhcnJheVtpbmRleF0sIGluZGV4LCBhcnJheSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBhcnJheU1hcDtcbiIsIi8qKlxuICogQXBwZW5kcyB0aGUgZWxlbWVudHMgb2YgYHZhbHVlc2AgdG8gYGFycmF5YC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIG1vZGlmeS5cbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlcyBUaGUgdmFsdWVzIHRvIGFwcGVuZC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBgYXJyYXlgLlxuICovXG5mdW5jdGlvbiBhcnJheVB1c2goYXJyYXksIHZhbHVlcykge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGgsXG4gICAgICBvZmZzZXQgPSBhcnJheS5sZW5ndGg7XG5cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICBhcnJheVtvZmZzZXQgKyBpbmRleF0gPSB2YWx1ZXNbaW5kZXhdO1xuICB9XG4gIHJldHVybiBhcnJheTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBhcnJheVB1c2g7XG4iLCIvKipcbiAqIEEgc3BlY2lhbGl6ZWQgdmVyc2lvbiBvZiBgXy5yZWR1Y2VgIGZvciBhcnJheXMgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFja1xuICogc2hvcnRoYW5kcyBhbmQgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHsqfSBbYWNjdW11bGF0b3JdIFRoZSBpbml0aWFsIHZhbHVlLlxuICogQHBhcmFtIHtib29sZWFufSBbaW5pdEZyb21BcnJheV0gU3BlY2lmeSB1c2luZyB0aGUgZmlyc3QgZWxlbWVudCBvZiBgYXJyYXlgXG4gKiAgYXMgdGhlIGluaXRpYWwgdmFsdWUuXG4gKiBAcmV0dXJucyB7Kn0gUmV0dXJucyB0aGUgYWNjdW11bGF0ZWQgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIGFycmF5UmVkdWNlKGFycmF5LCBpdGVyYXRlZSwgYWNjdW11bGF0b3IsIGluaXRGcm9tQXJyYXkpIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG5cbiAgaWYgKGluaXRGcm9tQXJyYXkgJiYgbGVuZ3RoKSB7XG4gICAgYWNjdW11bGF0b3IgPSBhcnJheVsrK2luZGV4XTtcbiAgfVxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIGFjY3VtdWxhdG9yID0gaXRlcmF0ZWUoYWNjdW11bGF0b3IsIGFycmF5W2luZGV4XSwgaW5kZXgsIGFycmF5KTtcbiAgfVxuICByZXR1cm4gYWNjdW11bGF0b3I7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYXJyYXlSZWR1Y2U7XG4iLCIvKipcbiAqIEEgc3BlY2lhbGl6ZWQgdmVyc2lvbiBvZiBgXy5zb21lYCBmb3IgYXJyYXlzIHdpdGhvdXQgc3VwcG9ydCBmb3IgY2FsbGJhY2tcbiAqIHNob3J0aGFuZHMgYW5kIGB0aGlzYCBiaW5kaW5nLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gcHJlZGljYXRlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYW55IGVsZW1lbnQgcGFzc2VzIHRoZSBwcmVkaWNhdGUgY2hlY2ssXG4gKiAgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBhcnJheVNvbWUoYXJyYXksIHByZWRpY2F0ZSkge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIGlmIChwcmVkaWNhdGUoYXJyYXlbaW5kZXhdLCBpbmRleCwgYXJyYXkpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFycmF5U29tZTtcbiIsInZhciBiYXNlQ29weSA9IHJlcXVpcmUoJy4vYmFzZUNvcHknKSxcbiAgICBrZXlzID0gcmVxdWlyZSgnLi4vb2JqZWN0L2tleXMnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5hc3NpZ25gIHdpdGhvdXQgc3VwcG9ydCBmb3IgYXJndW1lbnQganVnZ2xpbmcsXG4gKiBtdWx0aXBsZSBzb3VyY2VzLCBhbmQgYGN1c3RvbWl6ZXJgIGZ1bmN0aW9ucy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgZGVzdGluYXRpb24gb2JqZWN0LlxuICogQHBhcmFtIHtPYmplY3R9IHNvdXJjZSBUaGUgc291cmNlIG9iamVjdC5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgYG9iamVjdGAuXG4gKi9cbmZ1bmN0aW9uIGJhc2VBc3NpZ24ob2JqZWN0LCBzb3VyY2UpIHtcbiAgcmV0dXJuIHNvdXJjZSA9PSBudWxsXG4gICAgPyBvYmplY3RcbiAgICA6IGJhc2VDb3B5KHNvdXJjZSwga2V5cyhzb3VyY2UpLCBvYmplY3QpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VBc3NpZ247XG4iLCJ2YXIgYmFzZU1hdGNoZXMgPSByZXF1aXJlKCcuL2Jhc2VNYXRjaGVzJyksXG4gICAgYmFzZU1hdGNoZXNQcm9wZXJ0eSA9IHJlcXVpcmUoJy4vYmFzZU1hdGNoZXNQcm9wZXJ0eScpLFxuICAgIGJpbmRDYWxsYmFjayA9IHJlcXVpcmUoJy4vYmluZENhbGxiYWNrJyksXG4gICAgaWRlbnRpdHkgPSByZXF1aXJlKCcuLi91dGlsaXR5L2lkZW50aXR5JyksXG4gICAgcHJvcGVydHkgPSByZXF1aXJlKCcuLi91dGlsaXR5L3Byb3BlcnR5Jyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uY2FsbGJhY2tgIHdoaWNoIHN1cHBvcnRzIHNwZWNpZnlpbmcgdGhlXG4gKiBudW1iZXIgb2YgYXJndW1lbnRzIHRvIHByb3ZpZGUgdG8gYGZ1bmNgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IFtmdW5jPV8uaWRlbnRpdHldIFRoZSB2YWx1ZSB0byBjb252ZXJ0IHRvIGEgY2FsbGJhY2suXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGZ1bmNgLlxuICogQHBhcmFtIHtudW1iZXJ9IFthcmdDb3VudF0gVGhlIG51bWJlciBvZiBhcmd1bWVudHMgdG8gcHJvdmlkZSB0byBgZnVuY2AuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIGNhbGxiYWNrLlxuICovXG5mdW5jdGlvbiBiYXNlQ2FsbGJhY2soZnVuYywgdGhpc0FyZywgYXJnQ291bnQpIHtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgZnVuYztcbiAgaWYgKHR5cGUgPT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiB0aGlzQXJnID09PSB1bmRlZmluZWRcbiAgICAgID8gZnVuY1xuICAgICAgOiBiaW5kQ2FsbGJhY2soZnVuYywgdGhpc0FyZywgYXJnQ291bnQpO1xuICB9XG4gIGlmIChmdW5jID09IG51bGwpIHtcbiAgICByZXR1cm4gaWRlbnRpdHk7XG4gIH1cbiAgaWYgKHR5cGUgPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gYmFzZU1hdGNoZXMoZnVuYyk7XG4gIH1cbiAgcmV0dXJuIHRoaXNBcmcgPT09IHVuZGVmaW5lZFxuICAgID8gcHJvcGVydHkoZnVuYylcbiAgICA6IGJhc2VNYXRjaGVzUHJvcGVydHkoZnVuYywgdGhpc0FyZyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUNhbGxiYWNrO1xuIiwidmFyIGFycmF5Q29weSA9IHJlcXVpcmUoJy4vYXJyYXlDb3B5JyksXG4gICAgYXJyYXlFYWNoID0gcmVxdWlyZSgnLi9hcnJheUVhY2gnKSxcbiAgICBiYXNlQXNzaWduID0gcmVxdWlyZSgnLi9iYXNlQXNzaWduJyksXG4gICAgYmFzZUZvck93biA9IHJlcXVpcmUoJy4vYmFzZUZvck93bicpLFxuICAgIGluaXRDbG9uZUFycmF5ID0gcmVxdWlyZSgnLi9pbml0Q2xvbmVBcnJheScpLFxuICAgIGluaXRDbG9uZUJ5VGFnID0gcmVxdWlyZSgnLi9pbml0Q2xvbmVCeVRhZycpLFxuICAgIGluaXRDbG9uZU9iamVjdCA9IHJlcXVpcmUoJy4vaW5pdENsb25lT2JqZWN0JyksXG4gICAgaXNBcnJheSA9IHJlcXVpcmUoJy4uL2xhbmcvaXNBcnJheScpLFxuICAgIGlzSG9zdE9iamVjdCA9IHJlcXVpcmUoJy4vaXNIb3N0T2JqZWN0JyksXG4gICAgaXNPYmplY3QgPSByZXF1aXJlKCcuLi9sYW5nL2lzT2JqZWN0Jyk7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBhcmdzVGFnID0gJ1tvYmplY3QgQXJndW1lbnRzXScsXG4gICAgYXJyYXlUYWcgPSAnW29iamVjdCBBcnJheV0nLFxuICAgIGJvb2xUYWcgPSAnW29iamVjdCBCb29sZWFuXScsXG4gICAgZGF0ZVRhZyA9ICdbb2JqZWN0IERhdGVdJyxcbiAgICBlcnJvclRhZyA9ICdbb2JqZWN0IEVycm9yXScsXG4gICAgZnVuY1RhZyA9ICdbb2JqZWN0IEZ1bmN0aW9uXScsXG4gICAgbWFwVGFnID0gJ1tvYmplY3QgTWFwXScsXG4gICAgbnVtYmVyVGFnID0gJ1tvYmplY3QgTnVtYmVyXScsXG4gICAgb2JqZWN0VGFnID0gJ1tvYmplY3QgT2JqZWN0XScsXG4gICAgcmVnZXhwVGFnID0gJ1tvYmplY3QgUmVnRXhwXScsXG4gICAgc2V0VGFnID0gJ1tvYmplY3QgU2V0XScsXG4gICAgc3RyaW5nVGFnID0gJ1tvYmplY3QgU3RyaW5nXScsXG4gICAgd2Vha01hcFRhZyA9ICdbb2JqZWN0IFdlYWtNYXBdJztcblxudmFyIGFycmF5QnVmZmVyVGFnID0gJ1tvYmplY3QgQXJyYXlCdWZmZXJdJyxcbiAgICBmbG9hdDMyVGFnID0gJ1tvYmplY3QgRmxvYXQzMkFycmF5XScsXG4gICAgZmxvYXQ2NFRhZyA9ICdbb2JqZWN0IEZsb2F0NjRBcnJheV0nLFxuICAgIGludDhUYWcgPSAnW29iamVjdCBJbnQ4QXJyYXldJyxcbiAgICBpbnQxNlRhZyA9ICdbb2JqZWN0IEludDE2QXJyYXldJyxcbiAgICBpbnQzMlRhZyA9ICdbb2JqZWN0IEludDMyQXJyYXldJyxcbiAgICB1aW50OFRhZyA9ICdbb2JqZWN0IFVpbnQ4QXJyYXldJyxcbiAgICB1aW50OENsYW1wZWRUYWcgPSAnW29iamVjdCBVaW50OENsYW1wZWRBcnJheV0nLFxuICAgIHVpbnQxNlRhZyA9ICdbb2JqZWN0IFVpbnQxNkFycmF5XScsXG4gICAgdWludDMyVGFnID0gJ1tvYmplY3QgVWludDMyQXJyYXldJztcblxuLyoqIFVzZWQgdG8gaWRlbnRpZnkgYHRvU3RyaW5nVGFnYCB2YWx1ZXMgc3VwcG9ydGVkIGJ5IGBfLmNsb25lYC4gKi9cbnZhciBjbG9uZWFibGVUYWdzID0ge307XG5jbG9uZWFibGVUYWdzW2FyZ3NUYWddID0gY2xvbmVhYmxlVGFnc1thcnJheVRhZ10gPVxuY2xvbmVhYmxlVGFnc1thcnJheUJ1ZmZlclRhZ10gPSBjbG9uZWFibGVUYWdzW2Jvb2xUYWddID1cbmNsb25lYWJsZVRhZ3NbZGF0ZVRhZ10gPSBjbG9uZWFibGVUYWdzW2Zsb2F0MzJUYWddID1cbmNsb25lYWJsZVRhZ3NbZmxvYXQ2NFRhZ10gPSBjbG9uZWFibGVUYWdzW2ludDhUYWddID1cbmNsb25lYWJsZVRhZ3NbaW50MTZUYWddID0gY2xvbmVhYmxlVGFnc1tpbnQzMlRhZ10gPVxuY2xvbmVhYmxlVGFnc1tudW1iZXJUYWddID0gY2xvbmVhYmxlVGFnc1tvYmplY3RUYWddID1cbmNsb25lYWJsZVRhZ3NbcmVnZXhwVGFnXSA9IGNsb25lYWJsZVRhZ3Nbc3RyaW5nVGFnXSA9XG5jbG9uZWFibGVUYWdzW3VpbnQ4VGFnXSA9IGNsb25lYWJsZVRhZ3NbdWludDhDbGFtcGVkVGFnXSA9XG5jbG9uZWFibGVUYWdzW3VpbnQxNlRhZ10gPSBjbG9uZWFibGVUYWdzW3VpbnQzMlRhZ10gPSB0cnVlO1xuY2xvbmVhYmxlVGFnc1tlcnJvclRhZ10gPSBjbG9uZWFibGVUYWdzW2Z1bmNUYWddID1cbmNsb25lYWJsZVRhZ3NbbWFwVGFnXSA9IGNsb25lYWJsZVRhZ3Nbc2V0VGFnXSA9XG5jbG9uZWFibGVUYWdzW3dlYWtNYXBUYWddID0gZmFsc2U7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKipcbiAqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBvYmpUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmNsb25lYCB3aXRob3V0IHN1cHBvcnQgZm9yIGFyZ3VtZW50IGp1Z2dsaW5nXG4gKiBhbmQgYHRoaXNgIGJpbmRpbmcgYGN1c3RvbWl6ZXJgIGZ1bmN0aW9ucy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2xvbmUuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtpc0RlZXBdIFNwZWNpZnkgYSBkZWVwIGNsb25lLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2N1c3RvbWl6ZXJdIFRoZSBmdW5jdGlvbiB0byBjdXN0b21pemUgY2xvbmluZyB2YWx1ZXMuXG4gKiBAcGFyYW0ge3N0cmluZ30gW2tleV0gVGhlIGtleSBvZiBgdmFsdWVgLlxuICogQHBhcmFtIHtPYmplY3R9IFtvYmplY3RdIFRoZSBvYmplY3QgYHZhbHVlYCBiZWxvbmdzIHRvLlxuICogQHBhcmFtIHtBcnJheX0gW3N0YWNrQT1bXV0gVHJhY2tzIHRyYXZlcnNlZCBzb3VyY2Ugb2JqZWN0cy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0I9W11dIEFzc29jaWF0ZXMgY2xvbmVzIHdpdGggc291cmNlIGNvdW50ZXJwYXJ0cy5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBjbG9uZWQgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIGJhc2VDbG9uZSh2YWx1ZSwgaXNEZWVwLCBjdXN0b21pemVyLCBrZXksIG9iamVjdCwgc3RhY2tBLCBzdGFja0IpIHtcbiAgdmFyIHJlc3VsdDtcbiAgaWYgKGN1c3RvbWl6ZXIpIHtcbiAgICByZXN1bHQgPSBvYmplY3QgPyBjdXN0b21pemVyKHZhbHVlLCBrZXksIG9iamVjdCkgOiBjdXN0b21pemVyKHZhbHVlKTtcbiAgfVxuICBpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIGlmICghaXNPYmplY3QodmFsdWUpKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHZhciBpc0FyciA9IGlzQXJyYXkodmFsdWUpO1xuICBpZiAoaXNBcnIpIHtcbiAgICByZXN1bHQgPSBpbml0Q2xvbmVBcnJheSh2YWx1ZSk7XG4gICAgaWYgKCFpc0RlZXApIHtcbiAgICAgIHJldHVybiBhcnJheUNvcHkodmFsdWUsIHJlc3VsdCk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHZhciB0YWcgPSBvYmpUb1N0cmluZy5jYWxsKHZhbHVlKSxcbiAgICAgICAgaXNGdW5jID0gdGFnID09IGZ1bmNUYWc7XG5cbiAgICBpZiAodGFnID09IG9iamVjdFRhZyB8fCB0YWcgPT0gYXJnc1RhZyB8fCAoaXNGdW5jICYmICFvYmplY3QpKSB7XG4gICAgICBpZiAoaXNIb3N0T2JqZWN0KHZhbHVlKSkge1xuICAgICAgICByZXR1cm4gb2JqZWN0ID8gdmFsdWUgOiB7fTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IGluaXRDbG9uZU9iamVjdChpc0Z1bmMgPyB7fSA6IHZhbHVlKTtcbiAgICAgIGlmICghaXNEZWVwKSB7XG4gICAgICAgIHJldHVybiBiYXNlQXNzaWduKHJlc3VsdCwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY2xvbmVhYmxlVGFnc1t0YWddXG4gICAgICAgID8gaW5pdENsb25lQnlUYWcodmFsdWUsIHRhZywgaXNEZWVwKVxuICAgICAgICA6IChvYmplY3QgPyB2YWx1ZSA6IHt9KTtcbiAgICB9XG4gIH1cbiAgLy8gQ2hlY2sgZm9yIGNpcmN1bGFyIHJlZmVyZW5jZXMgYW5kIHJldHVybiBpdHMgY29ycmVzcG9uZGluZyBjbG9uZS5cbiAgc3RhY2tBIHx8IChzdGFja0EgPSBbXSk7XG4gIHN0YWNrQiB8fCAoc3RhY2tCID0gW10pO1xuXG4gIHZhciBsZW5ndGggPSBzdGFja0EubGVuZ3RoO1xuICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICBpZiAoc3RhY2tBW2xlbmd0aF0gPT0gdmFsdWUpIHtcbiAgICAgIHJldHVybiBzdGFja0JbbGVuZ3RoXTtcbiAgICB9XG4gIH1cbiAgLy8gQWRkIHRoZSBzb3VyY2UgdmFsdWUgdG8gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzIGFuZCBhc3NvY2lhdGUgaXQgd2l0aCBpdHMgY2xvbmUuXG4gIHN0YWNrQS5wdXNoKHZhbHVlKTtcbiAgc3RhY2tCLnB1c2gocmVzdWx0KTtcblxuICAvLyBSZWN1cnNpdmVseSBwb3B1bGF0ZSBjbG9uZSAoc3VzY2VwdGlibGUgdG8gY2FsbCBzdGFjayBsaW1pdHMpLlxuICAoaXNBcnIgPyBhcnJheUVhY2ggOiBiYXNlRm9yT3duKSh2YWx1ZSwgZnVuY3Rpb24oc3ViVmFsdWUsIGtleSkge1xuICAgIHJlc3VsdFtrZXldID0gYmFzZUNsb25lKHN1YlZhbHVlLCBpc0RlZXAsIGN1c3RvbWl6ZXIsIGtleSwgdmFsdWUsIHN0YWNrQSwgc3RhY2tCKTtcbiAgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUNsb25lO1xuIiwiLyoqXG4gKiBDb3BpZXMgcHJvcGVydGllcyBvZiBgc291cmNlYCB0byBgb2JqZWN0YC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IHNvdXJjZSBUaGUgb2JqZWN0IHRvIGNvcHkgcHJvcGVydGllcyBmcm9tLlxuICogQHBhcmFtIHtBcnJheX0gcHJvcHMgVGhlIHByb3BlcnR5IG5hbWVzIHRvIGNvcHkuXG4gKiBAcGFyYW0ge09iamVjdH0gW29iamVjdD17fV0gVGhlIG9iamVjdCB0byBjb3B5IHByb3BlcnRpZXMgdG8uXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIGBvYmplY3RgLlxuICovXG5mdW5jdGlvbiBiYXNlQ29weShzb3VyY2UsIHByb3BzLCBvYmplY3QpIHtcbiAgb2JqZWN0IHx8IChvYmplY3QgPSB7fSk7XG5cbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBwcm9wcy5sZW5ndGg7XG5cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICB2YXIga2V5ID0gcHJvcHNbaW5kZXhdO1xuICAgIG9iamVjdFtrZXldID0gc291cmNlW2tleV07XG4gIH1cbiAgcmV0dXJuIG9iamVjdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlQ29weTtcbiIsInZhciBiYXNlSW5kZXhPZiA9IHJlcXVpcmUoJy4vYmFzZUluZGV4T2YnKSxcbiAgICBjYWNoZUluZGV4T2YgPSByZXF1aXJlKCcuL2NhY2hlSW5kZXhPZicpLFxuICAgIGNyZWF0ZUNhY2hlID0gcmVxdWlyZSgnLi9jcmVhdGVDYWNoZScpO1xuXG4vKiogVXNlZCBhcyB0aGUgc2l6ZSB0byBlbmFibGUgbGFyZ2UgYXJyYXkgb3B0aW1pemF0aW9ucy4gKi9cbnZhciBMQVJHRV9BUlJBWV9TSVpFID0gMjAwO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmRpZmZlcmVuY2VgIHdoaWNoIGFjY2VwdHMgYSBzaW5nbGUgYXJyYXlcbiAqIG9mIHZhbHVlcyB0byBleGNsdWRlLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gaW5zcGVjdC5cbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlcyBUaGUgdmFsdWVzIHRvIGV4Y2x1ZGUuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgdGhlIG5ldyBhcnJheSBvZiBmaWx0ZXJlZCB2YWx1ZXMuXG4gKi9cbmZ1bmN0aW9uIGJhc2VEaWZmZXJlbmNlKGFycmF5LCB2YWx1ZXMpIHtcbiAgdmFyIGxlbmd0aCA9IGFycmF5ID8gYXJyYXkubGVuZ3RoIDogMCxcbiAgICAgIHJlc3VsdCA9IFtdO1xuXG4gIGlmICghbGVuZ3RoKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGluZGV4T2YgPSBiYXNlSW5kZXhPZixcbiAgICAgIGlzQ29tbW9uID0gdHJ1ZSxcbiAgICAgIGNhY2hlID0gKGlzQ29tbW9uICYmIHZhbHVlcy5sZW5ndGggPj0gTEFSR0VfQVJSQVlfU0laRSkgPyBjcmVhdGVDYWNoZSh2YWx1ZXMpIDogbnVsbCxcbiAgICAgIHZhbHVlc0xlbmd0aCA9IHZhbHVlcy5sZW5ndGg7XG5cbiAgaWYgKGNhY2hlKSB7XG4gICAgaW5kZXhPZiA9IGNhY2hlSW5kZXhPZjtcbiAgICBpc0NvbW1vbiA9IGZhbHNlO1xuICAgIHZhbHVlcyA9IGNhY2hlO1xuICB9XG4gIG91dGVyOlxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHZhciB2YWx1ZSA9IGFycmF5W2luZGV4XTtcblxuICAgIGlmIChpc0NvbW1vbiAmJiB2YWx1ZSA9PT0gdmFsdWUpIHtcbiAgICAgIHZhciB2YWx1ZXNJbmRleCA9IHZhbHVlc0xlbmd0aDtcbiAgICAgIHdoaWxlICh2YWx1ZXNJbmRleC0tKSB7XG4gICAgICAgIGlmICh2YWx1ZXNbdmFsdWVzSW5kZXhdID09PSB2YWx1ZSkge1xuICAgICAgICAgIGNvbnRpbnVlIG91dGVyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGluZGV4T2YodmFsdWVzLCB2YWx1ZSwgMCkgPCAwKSB7XG4gICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZURpZmZlcmVuY2U7XG4iLCJ2YXIgYmFzZUZvck93biA9IHJlcXVpcmUoJy4vYmFzZUZvck93bicpLFxuICAgIGNyZWF0ZUJhc2VFYWNoID0gcmVxdWlyZSgnLi9jcmVhdGVCYXNlRWFjaCcpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmZvckVhY2hgIHdpdGhvdXQgc3VwcG9ydCBmb3IgY2FsbGJhY2tcbiAqIHNob3J0aGFuZHMgYW5kIGB0aGlzYCBiaW5kaW5nLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fE9iamVjdHxzdHJpbmd9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gaXRlcmF0ZWUgVGhlIGZ1bmN0aW9uIGludm9rZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHtBcnJheXxPYmplY3R8c3RyaW5nfSBSZXR1cm5zIGBjb2xsZWN0aW9uYC5cbiAqL1xudmFyIGJhc2VFYWNoID0gY3JlYXRlQmFzZUVhY2goYmFzZUZvck93bik7XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUVhY2g7XG4iLCIvKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmZpbmRgLCBgXy5maW5kTGFzdGAsIGBfLmZpbmRLZXlgLCBhbmQgYF8uZmluZExhc3RLZXlgLFxuICogd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFjayBzaG9ydGhhbmRzIGFuZCBgdGhpc2AgYmluZGluZywgd2hpY2ggaXRlcmF0ZXNcbiAqIG92ZXIgYGNvbGxlY3Rpb25gIHVzaW5nIHRoZSBwcm92aWRlZCBgZWFjaEZ1bmNgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fE9iamVjdHxzdHJpbmd9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gc2VhcmNoLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gcHJlZGljYXRlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBlYWNoRnVuYyBUaGUgZnVuY3Rpb24gdG8gaXRlcmF0ZSBvdmVyIGBjb2xsZWN0aW9uYC5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3JldEtleV0gU3BlY2lmeSByZXR1cm5pbmcgdGhlIGtleSBvZiB0aGUgZm91bmQgZWxlbWVudFxuICogIGluc3RlYWQgb2YgdGhlIGVsZW1lbnQgaXRzZWxmLlxuICogQHJldHVybnMgeyp9IFJldHVybnMgdGhlIGZvdW5kIGVsZW1lbnQgb3IgaXRzIGtleSwgZWxzZSBgdW5kZWZpbmVkYC5cbiAqL1xuZnVuY3Rpb24gYmFzZUZpbmQoY29sbGVjdGlvbiwgcHJlZGljYXRlLCBlYWNoRnVuYywgcmV0S2V5KSB7XG4gIHZhciByZXN1bHQ7XG4gIGVhY2hGdW5jKGNvbGxlY3Rpb24sIGZ1bmN0aW9uKHZhbHVlLCBrZXksIGNvbGxlY3Rpb24pIHtcbiAgICBpZiAocHJlZGljYXRlKHZhbHVlLCBrZXksIGNvbGxlY3Rpb24pKSB7XG4gICAgICByZXN1bHQgPSByZXRLZXkgPyBrZXkgOiB2YWx1ZTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VGaW5kO1xuIiwiLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5maW5kSW5kZXhgIGFuZCBgXy5maW5kTGFzdEluZGV4YCB3aXRob3V0XG4gKiBzdXBwb3J0IGZvciBjYWxsYmFjayBzaG9ydGhhbmRzIGFuZCBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIHNlYXJjaC5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IHByZWRpY2F0ZSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHtib29sZWFufSBbZnJvbVJpZ2h0XSBTcGVjaWZ5IGl0ZXJhdGluZyBmcm9tIHJpZ2h0IHRvIGxlZnQuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbWF0Y2hlZCB2YWx1ZSwgZWxzZSBgLTFgLlxuICovXG5mdW5jdGlvbiBiYXNlRmluZEluZGV4KGFycmF5LCBwcmVkaWNhdGUsIGZyb21SaWdodCkge1xuICB2YXIgbGVuZ3RoID0gYXJyYXkubGVuZ3RoLFxuICAgICAgaW5kZXggPSBmcm9tUmlnaHQgPyBsZW5ndGggOiAtMTtcblxuICB3aGlsZSAoKGZyb21SaWdodCA/IGluZGV4LS0gOiArK2luZGV4IDwgbGVuZ3RoKSkge1xuICAgIGlmIChwcmVkaWNhdGUoYXJyYXlbaW5kZXhdLCBpbmRleCwgYXJyYXkpKSB7XG4gICAgICByZXR1cm4gaW5kZXg7XG4gICAgfVxuICB9XG4gIHJldHVybiAtMTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlRmluZEluZGV4O1xuIiwidmFyIGFycmF5UHVzaCA9IHJlcXVpcmUoJy4vYXJyYXlQdXNoJyksXG4gICAgaXNBcmd1bWVudHMgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJndW1lbnRzJyksXG4gICAgaXNBcnJheSA9IHJlcXVpcmUoJy4uL2xhbmcvaXNBcnJheScpLFxuICAgIGlzQXJyYXlMaWtlID0gcmVxdWlyZSgnLi9pc0FycmF5TGlrZScpLFxuICAgIGlzT2JqZWN0TGlrZSA9IHJlcXVpcmUoJy4vaXNPYmplY3RMaWtlJyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uZmxhdHRlbmAgd2l0aCBhZGRlZCBzdXBwb3J0IGZvciByZXN0cmljdGluZ1xuICogZmxhdHRlbmluZyBhbmQgc3BlY2lmeWluZyB0aGUgc3RhcnQgaW5kZXguXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBmbGF0dGVuLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNEZWVwXSBTcGVjaWZ5IGEgZGVlcCBmbGF0dGVuLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNTdHJpY3RdIFJlc3RyaWN0IGZsYXR0ZW5pbmcgdG8gYXJyYXlzLWxpa2Ugb2JqZWN0cy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtyZXN1bHQ9W11dIFRoZSBpbml0aWFsIHJlc3VsdCB2YWx1ZS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IGZsYXR0ZW5lZCBhcnJheS5cbiAqL1xuZnVuY3Rpb24gYmFzZUZsYXR0ZW4oYXJyYXksIGlzRGVlcCwgaXNTdHJpY3QsIHJlc3VsdCkge1xuICByZXN1bHQgfHwgKHJlc3VsdCA9IFtdKTtcblxuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHZhciB2YWx1ZSA9IGFycmF5W2luZGV4XTtcbiAgICBpZiAoaXNPYmplY3RMaWtlKHZhbHVlKSAmJiBpc0FycmF5TGlrZSh2YWx1ZSkgJiZcbiAgICAgICAgKGlzU3RyaWN0IHx8IGlzQXJyYXkodmFsdWUpIHx8IGlzQXJndW1lbnRzKHZhbHVlKSkpIHtcbiAgICAgIGlmIChpc0RlZXApIHtcbiAgICAgICAgLy8gUmVjdXJzaXZlbHkgZmxhdHRlbiBhcnJheXMgKHN1c2NlcHRpYmxlIHRvIGNhbGwgc3RhY2sgbGltaXRzKS5cbiAgICAgICAgYmFzZUZsYXR0ZW4odmFsdWUsIGlzRGVlcCwgaXNTdHJpY3QsIHJlc3VsdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhcnJheVB1c2gocmVzdWx0LCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghaXNTdHJpY3QpIHtcbiAgICAgIHJlc3VsdFtyZXN1bHQubGVuZ3RoXSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VGbGF0dGVuO1xuIiwidmFyIGNyZWF0ZUJhc2VGb3IgPSByZXF1aXJlKCcuL2NyZWF0ZUJhc2VGb3InKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgYmFzZUZvckluYCBhbmQgYGJhc2VGb3JPd25gIHdoaWNoIGl0ZXJhdGVzXG4gKiBvdmVyIGBvYmplY3RgIHByb3BlcnRpZXMgcmV0dXJuZWQgYnkgYGtleXNGdW5jYCBpbnZva2luZyBgaXRlcmF0ZWVgIGZvclxuICogZWFjaCBwcm9wZXJ0eS4gSXRlcmF0ZWUgZnVuY3Rpb25zIG1heSBleGl0IGl0ZXJhdGlvbiBlYXJseSBieSBleHBsaWNpdGx5XG4gKiByZXR1cm5pbmcgYGZhbHNlYC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBrZXlzRnVuYyBUaGUgZnVuY3Rpb24gdG8gZ2V0IHRoZSBrZXlzIG9mIGBvYmplY3RgLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyBgb2JqZWN0YC5cbiAqL1xudmFyIGJhc2VGb3IgPSBjcmVhdGVCYXNlRm9yKCk7XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUZvcjtcbiIsInZhciBiYXNlRm9yID0gcmVxdWlyZSgnLi9iYXNlRm9yJyksXG4gICAga2V5c0luID0gcmVxdWlyZSgnLi4vb2JqZWN0L2tleXNJbicpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmZvckluYCB3aXRob3V0IHN1cHBvcnQgZm9yIGNhbGxiYWNrXG4gKiBzaG9ydGhhbmRzIGFuZCBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIGBvYmplY3RgLlxuICovXG5mdW5jdGlvbiBiYXNlRm9ySW4ob2JqZWN0LCBpdGVyYXRlZSkge1xuICByZXR1cm4gYmFzZUZvcihvYmplY3QsIGl0ZXJhdGVlLCBrZXlzSW4pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VGb3JJbjtcbiIsInZhciBiYXNlRm9yID0gcmVxdWlyZSgnLi9iYXNlRm9yJyksXG4gICAga2V5cyA9IHJlcXVpcmUoJy4uL29iamVjdC9rZXlzJyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uZm9yT3duYCB3aXRob3V0IHN1cHBvcnQgZm9yIGNhbGxiYWNrXG4gKiBzaG9ydGhhbmRzIGFuZCBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIGBvYmplY3RgLlxuICovXG5mdW5jdGlvbiBiYXNlRm9yT3duKG9iamVjdCwgaXRlcmF0ZWUpIHtcbiAgcmV0dXJuIGJhc2VGb3Iob2JqZWN0LCBpdGVyYXRlZSwga2V5cyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUZvck93bjtcbiIsInZhciB0b09iamVjdCA9IHJlcXVpcmUoJy4vdG9PYmplY3QnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgZ2V0YCB3aXRob3V0IHN1cHBvcnQgZm9yIHN0cmluZyBwYXRoc1xuICogYW5kIGRlZmF1bHQgdmFsdWVzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gcXVlcnkuXG4gKiBAcGFyYW0ge0FycmF5fSBwYXRoIFRoZSBwYXRoIG9mIHRoZSBwcm9wZXJ0eSB0byBnZXQuXG4gKiBAcGFyYW0ge3N0cmluZ30gW3BhdGhLZXldIFRoZSBrZXkgcmVwcmVzZW50YXRpb24gb2YgcGF0aC5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSByZXNvbHZlZCB2YWx1ZS5cbiAqL1xuZnVuY3Rpb24gYmFzZUdldChvYmplY3QsIHBhdGgsIHBhdGhLZXkpIHtcbiAgaWYgKG9iamVjdCA9PSBudWxsKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIG9iamVjdCA9IHRvT2JqZWN0KG9iamVjdCk7XG4gIGlmIChwYXRoS2V5ICE9PSB1bmRlZmluZWQgJiYgcGF0aEtleSBpbiBvYmplY3QpIHtcbiAgICBwYXRoID0gW3BhdGhLZXldO1xuICB9XG4gIHZhciBpbmRleCA9IDAsXG4gICAgICBsZW5ndGggPSBwYXRoLmxlbmd0aDtcblxuICB3aGlsZSAob2JqZWN0ICE9IG51bGwgJiYgaW5kZXggPCBsZW5ndGgpIHtcbiAgICBvYmplY3QgPSB0b09iamVjdChvYmplY3QpW3BhdGhbaW5kZXgrK11dO1xuICB9XG4gIHJldHVybiAoaW5kZXggJiYgaW5kZXggPT0gbGVuZ3RoKSA/IG9iamVjdCA6IHVuZGVmaW5lZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlR2V0O1xuIiwidmFyIGluZGV4T2ZOYU4gPSByZXF1aXJlKCcuL2luZGV4T2ZOYU4nKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5pbmRleE9mYCB3aXRob3V0IHN1cHBvcnQgZm9yIGJpbmFyeSBzZWFyY2hlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIHNlYXJjaC5cbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHNlYXJjaCBmb3IuXG4gKiBAcGFyYW0ge251bWJlcn0gZnJvbUluZGV4IFRoZSBpbmRleCB0byBzZWFyY2ggZnJvbS5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBtYXRjaGVkIHZhbHVlLCBlbHNlIGAtMWAuXG4gKi9cbmZ1bmN0aW9uIGJhc2VJbmRleE9mKGFycmF5LCB2YWx1ZSwgZnJvbUluZGV4KSB7XG4gIGlmICh2YWx1ZSAhPT0gdmFsdWUpIHtcbiAgICByZXR1cm4gaW5kZXhPZk5hTihhcnJheSwgZnJvbUluZGV4KTtcbiAgfVxuICB2YXIgaW5kZXggPSBmcm9tSW5kZXggLSAxLFxuICAgICAgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgaWYgKGFycmF5W2luZGV4XSA9PT0gdmFsdWUpIHtcbiAgICAgIHJldHVybiBpbmRleDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIC0xO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VJbmRleE9mO1xuIiwidmFyIGJhc2VJc0VxdWFsRGVlcCA9IHJlcXVpcmUoJy4vYmFzZUlzRXF1YWxEZWVwJyksXG4gICAgaXNPYmplY3QgPSByZXF1aXJlKCcuLi9sYW5nL2lzT2JqZWN0JyksXG4gICAgaXNPYmplY3RMaWtlID0gcmVxdWlyZSgnLi9pc09iamVjdExpa2UnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5pc0VxdWFsYCB3aXRob3V0IHN1cHBvcnQgZm9yIGB0aGlzYCBiaW5kaW5nXG4gKiBgY3VzdG9taXplcmAgZnVuY3Rpb25zLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjb21wYXJlLlxuICogQHBhcmFtIHsqfSBvdGhlciBUaGUgb3RoZXIgdmFsdWUgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjdXN0b21pemVyXSBUaGUgZnVuY3Rpb24gdG8gY3VzdG9taXplIGNvbXBhcmluZyB2YWx1ZXMuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtpc0xvb3NlXSBTcGVjaWZ5IHBlcmZvcm1pbmcgcGFydGlhbCBjb21wYXJpc29ucy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0FdIFRyYWNrcyB0cmF2ZXJzZWQgYHZhbHVlYCBvYmplY3RzLlxuICogQHBhcmFtIHtBcnJheX0gW3N0YWNrQl0gVHJhY2tzIHRyYXZlcnNlZCBgb3RoZXJgIG9iamVjdHMuXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHZhbHVlcyBhcmUgZXF1aXZhbGVudCwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBiYXNlSXNFcXVhbCh2YWx1ZSwgb3RoZXIsIGN1c3RvbWl6ZXIsIGlzTG9vc2UsIHN0YWNrQSwgc3RhY2tCKSB7XG4gIGlmICh2YWx1ZSA9PT0gb3RoZXIpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBpZiAodmFsdWUgPT0gbnVsbCB8fCBvdGhlciA9PSBudWxsIHx8ICghaXNPYmplY3QodmFsdWUpICYmICFpc09iamVjdExpa2Uob3RoZXIpKSkge1xuICAgIHJldHVybiB2YWx1ZSAhPT0gdmFsdWUgJiYgb3RoZXIgIT09IG90aGVyO1xuICB9XG4gIHJldHVybiBiYXNlSXNFcXVhbERlZXAodmFsdWUsIG90aGVyLCBiYXNlSXNFcXVhbCwgY3VzdG9taXplciwgaXNMb29zZSwgc3RhY2tBLCBzdGFja0IpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VJc0VxdWFsO1xuIiwidmFyIGVxdWFsQXJyYXlzID0gcmVxdWlyZSgnLi9lcXVhbEFycmF5cycpLFxuICAgIGVxdWFsQnlUYWcgPSByZXF1aXJlKCcuL2VxdWFsQnlUYWcnKSxcbiAgICBlcXVhbE9iamVjdHMgPSByZXF1aXJlKCcuL2VxdWFsT2JqZWN0cycpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKSxcbiAgICBpc0hvc3RPYmplY3QgPSByZXF1aXJlKCcuL2lzSG9zdE9iamVjdCcpLFxuICAgIGlzVHlwZWRBcnJheSA9IHJlcXVpcmUoJy4uL2xhbmcvaXNUeXBlZEFycmF5Jyk7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBhcmdzVGFnID0gJ1tvYmplY3QgQXJndW1lbnRzXScsXG4gICAgYXJyYXlUYWcgPSAnW29iamVjdCBBcnJheV0nLFxuICAgIG9iamVjdFRhZyA9ICdbb2JqZWN0IE9iamVjdF0nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gY2hlY2sgb2JqZWN0cyBmb3Igb3duIHByb3BlcnRpZXMuICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlIFtgdG9TdHJpbmdUYWdgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1vYmplY3QucHJvdG90eXBlLnRvc3RyaW5nKVxuICogb2YgdmFsdWVzLlxuICovXG52YXIgb2JqVG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYGJhc2VJc0VxdWFsYCBmb3IgYXJyYXlzIGFuZCBvYmplY3RzIHdoaWNoIHBlcmZvcm1zXG4gKiBkZWVwIGNvbXBhcmlzb25zIGFuZCB0cmFja3MgdHJhdmVyc2VkIG9iamVjdHMgZW5hYmxpbmcgb2JqZWN0cyB3aXRoIGNpcmN1bGFyXG4gKiByZWZlcmVuY2VzIHRvIGJlIGNvbXBhcmVkLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvdGhlciBUaGUgb3RoZXIgb2JqZWN0IHRvIGNvbXBhcmUuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBlcXVhbEZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGRldGVybWluZSBlcXVpdmFsZW50cyBvZiB2YWx1ZXMuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY3VzdG9taXplcl0gVGhlIGZ1bmN0aW9uIHRvIGN1c3RvbWl6ZSBjb21wYXJpbmcgb2JqZWN0cy5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2lzTG9vc2VdIFNwZWNpZnkgcGVyZm9ybWluZyBwYXJ0aWFsIGNvbXBhcmlzb25zLlxuICogQHBhcmFtIHtBcnJheX0gW3N0YWNrQT1bXV0gVHJhY2tzIHRyYXZlcnNlZCBgdmFsdWVgIG9iamVjdHMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tCPVtdXSBUcmFja3MgdHJhdmVyc2VkIGBvdGhlcmAgb2JqZWN0cy5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgb2JqZWN0cyBhcmUgZXF1aXZhbGVudCwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBiYXNlSXNFcXVhbERlZXAob2JqZWN0LCBvdGhlciwgZXF1YWxGdW5jLCBjdXN0b21pemVyLCBpc0xvb3NlLCBzdGFja0EsIHN0YWNrQikge1xuICB2YXIgb2JqSXNBcnIgPSBpc0FycmF5KG9iamVjdCksXG4gICAgICBvdGhJc0FyciA9IGlzQXJyYXkob3RoZXIpLFxuICAgICAgb2JqVGFnID0gYXJyYXlUYWcsXG4gICAgICBvdGhUYWcgPSBhcnJheVRhZztcblxuICBpZiAoIW9iaklzQXJyKSB7XG4gICAgb2JqVGFnID0gb2JqVG9TdHJpbmcuY2FsbChvYmplY3QpO1xuICAgIGlmIChvYmpUYWcgPT0gYXJnc1RhZykge1xuICAgICAgb2JqVGFnID0gb2JqZWN0VGFnO1xuICAgIH0gZWxzZSBpZiAob2JqVGFnICE9IG9iamVjdFRhZykge1xuICAgICAgb2JqSXNBcnIgPSBpc1R5cGVkQXJyYXkob2JqZWN0KTtcbiAgICB9XG4gIH1cbiAgaWYgKCFvdGhJc0Fycikge1xuICAgIG90aFRhZyA9IG9ialRvU3RyaW5nLmNhbGwob3RoZXIpO1xuICAgIGlmIChvdGhUYWcgPT0gYXJnc1RhZykge1xuICAgICAgb3RoVGFnID0gb2JqZWN0VGFnO1xuICAgIH0gZWxzZSBpZiAob3RoVGFnICE9IG9iamVjdFRhZykge1xuICAgICAgb3RoSXNBcnIgPSBpc1R5cGVkQXJyYXkob3RoZXIpO1xuICAgIH1cbiAgfVxuICB2YXIgb2JqSXNPYmogPSBvYmpUYWcgPT0gb2JqZWN0VGFnICYmICFpc0hvc3RPYmplY3Qob2JqZWN0KSxcbiAgICAgIG90aElzT2JqID0gb3RoVGFnID09IG9iamVjdFRhZyAmJiAhaXNIb3N0T2JqZWN0KG90aGVyKSxcbiAgICAgIGlzU2FtZVRhZyA9IG9ialRhZyA9PSBvdGhUYWc7XG5cbiAgaWYgKGlzU2FtZVRhZyAmJiAhKG9iaklzQXJyIHx8IG9iaklzT2JqKSkge1xuICAgIHJldHVybiBlcXVhbEJ5VGFnKG9iamVjdCwgb3RoZXIsIG9ialRhZyk7XG4gIH1cbiAgaWYgKCFpc0xvb3NlKSB7XG4gICAgdmFyIG9iaklzV3JhcHBlZCA9IG9iaklzT2JqICYmIGhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCAnX193cmFwcGVkX18nKSxcbiAgICAgICAgb3RoSXNXcmFwcGVkID0gb3RoSXNPYmogJiYgaGFzT3duUHJvcGVydHkuY2FsbChvdGhlciwgJ19fd3JhcHBlZF9fJyk7XG5cbiAgICBpZiAob2JqSXNXcmFwcGVkIHx8IG90aElzV3JhcHBlZCkge1xuICAgICAgcmV0dXJuIGVxdWFsRnVuYyhvYmpJc1dyYXBwZWQgPyBvYmplY3QudmFsdWUoKSA6IG9iamVjdCwgb3RoSXNXcmFwcGVkID8gb3RoZXIudmFsdWUoKSA6IG90aGVyLCBjdXN0b21pemVyLCBpc0xvb3NlLCBzdGFja0EsIHN0YWNrQik7XG4gICAgfVxuICB9XG4gIGlmICghaXNTYW1lVGFnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vIEFzc3VtZSBjeWNsaWMgdmFsdWVzIGFyZSBlcXVhbC5cbiAgLy8gRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gZGV0ZWN0aW5nIGNpcmN1bGFyIHJlZmVyZW5jZXMgc2VlIGh0dHBzOi8vZXM1LmdpdGh1Yi5pby8jSk8uXG4gIHN0YWNrQSB8fCAoc3RhY2tBID0gW10pO1xuICBzdGFja0IgfHwgKHN0YWNrQiA9IFtdKTtcblxuICB2YXIgbGVuZ3RoID0gc3RhY2tBLmxlbmd0aDtcbiAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgaWYgKHN0YWNrQVtsZW5ndGhdID09IG9iamVjdCkge1xuICAgICAgcmV0dXJuIHN0YWNrQltsZW5ndGhdID09IG90aGVyO1xuICAgIH1cbiAgfVxuICAvLyBBZGQgYG9iamVjdGAgYW5kIGBvdGhlcmAgdG8gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICBzdGFja0EucHVzaChvYmplY3QpO1xuICBzdGFja0IucHVzaChvdGhlcik7XG5cbiAgdmFyIHJlc3VsdCA9IChvYmpJc0FyciA/IGVxdWFsQXJyYXlzIDogZXF1YWxPYmplY3RzKShvYmplY3QsIG90aGVyLCBlcXVhbEZ1bmMsIGN1c3RvbWl6ZXIsIGlzTG9vc2UsIHN0YWNrQSwgc3RhY2tCKTtcblxuICBzdGFja0EucG9wKCk7XG4gIHN0YWNrQi5wb3AoKTtcblxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VJc0VxdWFsRGVlcDtcbiIsInZhciBiYXNlSXNFcXVhbCA9IHJlcXVpcmUoJy4vYmFzZUlzRXF1YWwnKSxcbiAgICB0b09iamVjdCA9IHJlcXVpcmUoJy4vdG9PYmplY3QnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5pc01hdGNoYCB3aXRob3V0IHN1cHBvcnQgZm9yIGNhbGxiYWNrXG4gKiBzaG9ydGhhbmRzIGFuZCBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGluc3BlY3QuXG4gKiBAcGFyYW0ge0FycmF5fSBtYXRjaERhdGEgVGhlIHByb3BlcnkgbmFtZXMsIHZhbHVlcywgYW5kIGNvbXBhcmUgZmxhZ3MgdG8gbWF0Y2guXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY3VzdG9taXplcl0gVGhlIGZ1bmN0aW9uIHRvIGN1c3RvbWl6ZSBjb21wYXJpbmcgb2JqZWN0cy5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgb2JqZWN0YCBpcyBhIG1hdGNoLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGJhc2VJc01hdGNoKG9iamVjdCwgbWF0Y2hEYXRhLCBjdXN0b21pemVyKSB7XG4gIHZhciBpbmRleCA9IG1hdGNoRGF0YS5sZW5ndGgsXG4gICAgICBsZW5ndGggPSBpbmRleCxcbiAgICAgIG5vQ3VzdG9taXplciA9ICFjdXN0b21pemVyO1xuXG4gIGlmIChvYmplY3QgPT0gbnVsbCkge1xuICAgIHJldHVybiAhbGVuZ3RoO1xuICB9XG4gIG9iamVjdCA9IHRvT2JqZWN0KG9iamVjdCk7XG4gIHdoaWxlIChpbmRleC0tKSB7XG4gICAgdmFyIGRhdGEgPSBtYXRjaERhdGFbaW5kZXhdO1xuICAgIGlmICgobm9DdXN0b21pemVyICYmIGRhdGFbMl0pXG4gICAgICAgICAgPyBkYXRhWzFdICE9PSBvYmplY3RbZGF0YVswXV1cbiAgICAgICAgICA6ICEoZGF0YVswXSBpbiBvYmplY3QpXG4gICAgICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIGRhdGEgPSBtYXRjaERhdGFbaW5kZXhdO1xuICAgIHZhciBrZXkgPSBkYXRhWzBdLFxuICAgICAgICBvYmpWYWx1ZSA9IG9iamVjdFtrZXldLFxuICAgICAgICBzcmNWYWx1ZSA9IGRhdGFbMV07XG5cbiAgICBpZiAobm9DdXN0b21pemVyICYmIGRhdGFbMl0pIHtcbiAgICAgIGlmIChvYmpWYWx1ZSA9PT0gdW5kZWZpbmVkICYmICEoa2V5IGluIG9iamVjdCkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVzdWx0ID0gY3VzdG9taXplciA/IGN1c3RvbWl6ZXIob2JqVmFsdWUsIHNyY1ZhbHVlLCBrZXkpIDogdW5kZWZpbmVkO1xuICAgICAgaWYgKCEocmVzdWx0ID09PSB1bmRlZmluZWQgPyBiYXNlSXNFcXVhbChzcmNWYWx1ZSwgb2JqVmFsdWUsIGN1c3RvbWl6ZXIsIHRydWUpIDogcmVzdWx0KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VJc01hdGNoO1xuIiwidmFyIGJhc2VFYWNoID0gcmVxdWlyZSgnLi9iYXNlRWFjaCcpLFxuICAgIGlzQXJyYXlMaWtlID0gcmVxdWlyZSgnLi9pc0FycmF5TGlrZScpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLm1hcGAgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFjayBzaG9ydGhhbmRzXG4gKiBhbmQgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBuZXcgbWFwcGVkIGFycmF5LlxuICovXG5mdW5jdGlvbiBiYXNlTWFwKGNvbGxlY3Rpb24sIGl0ZXJhdGVlKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgcmVzdWx0ID0gaXNBcnJheUxpa2UoY29sbGVjdGlvbikgPyBBcnJheShjb2xsZWN0aW9uLmxlbmd0aCkgOiBbXTtcblxuICBiYXNlRWFjaChjb2xsZWN0aW9uLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBjb2xsZWN0aW9uKSB7XG4gICAgcmVzdWx0WysraW5kZXhdID0gaXRlcmF0ZWUodmFsdWUsIGtleSwgY29sbGVjdGlvbik7XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VNYXA7XG4iLCJ2YXIgYmFzZUlzTWF0Y2ggPSByZXF1aXJlKCcuL2Jhc2VJc01hdGNoJyksXG4gICAgZ2V0TWF0Y2hEYXRhID0gcmVxdWlyZSgnLi9nZXRNYXRjaERhdGEnKSxcbiAgICB0b09iamVjdCA9IHJlcXVpcmUoJy4vdG9PYmplY3QnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5tYXRjaGVzYCB3aGljaCBkb2VzIG5vdCBjbG9uZSBgc291cmNlYC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IHNvdXJjZSBUaGUgb2JqZWN0IG9mIHByb3BlcnR5IHZhbHVlcyB0byBtYXRjaC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBiYXNlTWF0Y2hlcyhzb3VyY2UpIHtcbiAgdmFyIG1hdGNoRGF0YSA9IGdldE1hdGNoRGF0YShzb3VyY2UpO1xuICBpZiAobWF0Y2hEYXRhLmxlbmd0aCA9PSAxICYmIG1hdGNoRGF0YVswXVsyXSkge1xuICAgIHZhciBrZXkgPSBtYXRjaERhdGFbMF1bMF0sXG4gICAgICAgIHZhbHVlID0gbWF0Y2hEYXRhWzBdWzFdO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdCA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIG9iamVjdCA9IHRvT2JqZWN0KG9iamVjdCk7XG4gICAgICByZXR1cm4gb2JqZWN0W2tleV0gPT09IHZhbHVlICYmICh2YWx1ZSAhPT0gdW5kZWZpbmVkIHx8IChrZXkgaW4gb2JqZWN0KSk7XG4gICAgfTtcbiAgfVxuICByZXR1cm4gZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgcmV0dXJuIGJhc2VJc01hdGNoKG9iamVjdCwgbWF0Y2hEYXRhKTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlTWF0Y2hlcztcbiIsInZhciBiYXNlR2V0ID0gcmVxdWlyZSgnLi9iYXNlR2V0JyksXG4gICAgYmFzZUlzRXF1YWwgPSByZXF1aXJlKCcuL2Jhc2VJc0VxdWFsJyksXG4gICAgYmFzZVNsaWNlID0gcmVxdWlyZSgnLi9iYXNlU2xpY2UnKSxcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FycmF5JyksXG4gICAgaXNLZXkgPSByZXF1aXJlKCcuL2lzS2V5JyksXG4gICAgaXNTdHJpY3RDb21wYXJhYmxlID0gcmVxdWlyZSgnLi9pc1N0cmljdENvbXBhcmFibGUnKSxcbiAgICBsYXN0ID0gcmVxdWlyZSgnLi4vYXJyYXkvbGFzdCcpLFxuICAgIHRvT2JqZWN0ID0gcmVxdWlyZSgnLi90b09iamVjdCcpLFxuICAgIHRvUGF0aCA9IHJlcXVpcmUoJy4vdG9QYXRoJyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8ubWF0Y2hlc1Byb3BlcnR5YCB3aGljaCBkb2VzIG5vdCBjbG9uZSBgc3JjVmFsdWVgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge3N0cmluZ30gcGF0aCBUaGUgcGF0aCBvZiB0aGUgcHJvcGVydHkgdG8gZ2V0LlxuICogQHBhcmFtIHsqfSBzcmNWYWx1ZSBUaGUgdmFsdWUgdG8gY29tcGFyZS5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBiYXNlTWF0Y2hlc1Byb3BlcnR5KHBhdGgsIHNyY1ZhbHVlKSB7XG4gIHZhciBpc0FyciA9IGlzQXJyYXkocGF0aCksXG4gICAgICBpc0NvbW1vbiA9IGlzS2V5KHBhdGgpICYmIGlzU3RyaWN0Q29tcGFyYWJsZShzcmNWYWx1ZSksXG4gICAgICBwYXRoS2V5ID0gKHBhdGggKyAnJyk7XG5cbiAgcGF0aCA9IHRvUGF0aChwYXRoKTtcbiAgcmV0dXJuIGZ1bmN0aW9uKG9iamVjdCkge1xuICAgIGlmIChvYmplY3QgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICB2YXIga2V5ID0gcGF0aEtleTtcbiAgICBvYmplY3QgPSB0b09iamVjdChvYmplY3QpO1xuICAgIGlmICgoaXNBcnIgfHwgIWlzQ29tbW9uKSAmJiAhKGtleSBpbiBvYmplY3QpKSB7XG4gICAgICBvYmplY3QgPSBwYXRoLmxlbmd0aCA9PSAxID8gb2JqZWN0IDogYmFzZUdldChvYmplY3QsIGJhc2VTbGljZShwYXRoLCAwLCAtMSkpO1xuICAgICAgaWYgKG9iamVjdCA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGtleSA9IGxhc3QocGF0aCk7XG4gICAgICBvYmplY3QgPSB0b09iamVjdChvYmplY3QpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0W2tleV0gPT09IHNyY1ZhbHVlXG4gICAgICA/IChzcmNWYWx1ZSAhPT0gdW5kZWZpbmVkIHx8IChrZXkgaW4gb2JqZWN0KSlcbiAgICAgIDogYmFzZUlzRXF1YWwoc3JjVmFsdWUsIG9iamVjdFtrZXldLCB1bmRlZmluZWQsIHRydWUpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VNYXRjaGVzUHJvcGVydHk7XG4iLCJ2YXIgdG9PYmplY3QgPSByZXF1aXJlKCcuL3RvT2JqZWN0Jyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8ucHJvcGVydHlgIHdpdGhvdXQgc3VwcG9ydCBmb3IgZGVlcCBwYXRocy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtzdHJpbmd9IGtleSBUaGUga2V5IG9mIHRoZSBwcm9wZXJ0eSB0byBnZXQuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gYmFzZVByb3BlcnR5KGtleSkge1xuICByZXR1cm4gZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCA9PSBudWxsID8gdW5kZWZpbmVkIDogdG9PYmplY3Qob2JqZWN0KVtrZXldO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VQcm9wZXJ0eTtcbiIsInZhciBiYXNlR2V0ID0gcmVxdWlyZSgnLi9iYXNlR2V0JyksXG4gICAgdG9QYXRoID0gcmVxdWlyZSgnLi90b1BhdGgnKTtcblxuLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYGJhc2VQcm9wZXJ0eWAgd2hpY2ggc3VwcG9ydHMgZGVlcCBwYXRocy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheXxzdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIHByb3BlcnR5IHRvIGdldC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBiYXNlUHJvcGVydHlEZWVwKHBhdGgpIHtcbiAgdmFyIHBhdGhLZXkgPSAocGF0aCArICcnKTtcbiAgcGF0aCA9IHRvUGF0aChwYXRoKTtcbiAgcmV0dXJuIGZ1bmN0aW9uKG9iamVjdCkge1xuICAgIHJldHVybiBiYXNlR2V0KG9iamVjdCwgcGF0aCwgcGF0aEtleSk7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZVByb3BlcnR5RGVlcDtcbiIsIi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8ucmVkdWNlYCBhbmQgYF8ucmVkdWNlUmlnaHRgIHdpdGhvdXQgc3VwcG9ydFxuICogZm9yIGNhbGxiYWNrIHNob3J0aGFuZHMgYW5kIGB0aGlzYCBiaW5kaW5nLCB3aGljaCBpdGVyYXRlcyBvdmVyIGBjb2xsZWN0aW9uYFxuICogdXNpbmcgdGhlIHByb3ZpZGVkIGBlYWNoRnVuY2AuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHsqfSBhY2N1bXVsYXRvciBUaGUgaW5pdGlhbCB2YWx1ZS5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaW5pdEZyb21Db2xsZWN0aW9uIFNwZWNpZnkgdXNpbmcgdGhlIGZpcnN0IG9yIGxhc3QgZWxlbWVudFxuICogIG9mIGBjb2xsZWN0aW9uYCBhcyB0aGUgaW5pdGlhbCB2YWx1ZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGVhY2hGdW5jIFRoZSBmdW5jdGlvbiB0byBpdGVyYXRlIG92ZXIgYGNvbGxlY3Rpb25gLlxuICogQHJldHVybnMgeyp9IFJldHVybnMgdGhlIGFjY3VtdWxhdGVkIHZhbHVlLlxuICovXG5mdW5jdGlvbiBiYXNlUmVkdWNlKGNvbGxlY3Rpb24sIGl0ZXJhdGVlLCBhY2N1bXVsYXRvciwgaW5pdEZyb21Db2xsZWN0aW9uLCBlYWNoRnVuYykge1xuICBlYWNoRnVuYyhjb2xsZWN0aW9uLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICBhY2N1bXVsYXRvciA9IGluaXRGcm9tQ29sbGVjdGlvblxuICAgICAgPyAoaW5pdEZyb21Db2xsZWN0aW9uID0gZmFsc2UsIHZhbHVlKVxuICAgICAgOiBpdGVyYXRlZShhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKTtcbiAgfSk7XG4gIHJldHVybiBhY2N1bXVsYXRvcjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlUmVkdWNlO1xuIiwiLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5zbGljZWAgd2l0aG91dCBhbiBpdGVyYXRlZSBjYWxsIGd1YXJkLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gc2xpY2UuXG4gKiBAcGFyYW0ge251bWJlcn0gW3N0YXJ0PTBdIFRoZSBzdGFydCBwb3NpdGlvbi5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbZW5kPWFycmF5Lmxlbmd0aF0gVGhlIGVuZCBwb3NpdGlvbi5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgc2xpY2Ugb2YgYGFycmF5YC5cbiAqL1xuZnVuY3Rpb24gYmFzZVNsaWNlKGFycmF5LCBzdGFydCwgZW5kKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXG4gIHN0YXJ0ID0gc3RhcnQgPT0gbnVsbCA/IDAgOiAoK3N0YXJ0IHx8IDApO1xuICBpZiAoc3RhcnQgPCAwKSB7XG4gICAgc3RhcnQgPSAtc3RhcnQgPiBsZW5ndGggPyAwIDogKGxlbmd0aCArIHN0YXJ0KTtcbiAgfVxuICBlbmQgPSAoZW5kID09PSB1bmRlZmluZWQgfHwgZW5kID4gbGVuZ3RoKSA/IGxlbmd0aCA6ICgrZW5kIHx8IDApO1xuICBpZiAoZW5kIDwgMCkge1xuICAgIGVuZCArPSBsZW5ndGg7XG4gIH1cbiAgbGVuZ3RoID0gc3RhcnQgPiBlbmQgPyAwIDogKChlbmQgLSBzdGFydCkgPj4+IDApO1xuICBzdGFydCA+Pj49IDA7XG5cbiAgdmFyIHJlc3VsdCA9IEFycmF5KGxlbmd0aCk7XG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgcmVzdWx0W2luZGV4XSA9IGFycmF5W2luZGV4ICsgc3RhcnRdO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZVNsaWNlO1xuIiwiLyoqXG4gKiBDb252ZXJ0cyBgdmFsdWVgIHRvIGEgc3RyaW5nIGlmIGl0J3Mgbm90IG9uZS4gQW4gZW1wdHkgc3RyaW5nIGlzIHJldHVybmVkXG4gKiBmb3IgYG51bGxgIG9yIGB1bmRlZmluZWRgIHZhbHVlcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gcHJvY2Vzcy5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFJldHVybnMgdGhlIHN0cmluZy5cbiAqL1xuZnVuY3Rpb24gYmFzZVRvU3RyaW5nKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSA9PSBudWxsID8gJycgOiAodmFsdWUgKyAnJyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZVRvU3RyaW5nO1xuIiwidmFyIGJhc2VJbmRleE9mID0gcmVxdWlyZSgnLi9iYXNlSW5kZXhPZicpLFxuICAgIGNhY2hlSW5kZXhPZiA9IHJlcXVpcmUoJy4vY2FjaGVJbmRleE9mJyksXG4gICAgY3JlYXRlQ2FjaGUgPSByZXF1aXJlKCcuL2NyZWF0ZUNhY2hlJyk7XG5cbi8qKiBVc2VkIGFzIHRoZSBzaXplIHRvIGVuYWJsZSBsYXJnZSBhcnJheSBvcHRpbWl6YXRpb25zLiAqL1xudmFyIExBUkdFX0FSUkFZX1NJWkUgPSAyMDA7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8udW5pcWAgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFjayBzaG9ydGhhbmRzXG4gKiBhbmQgYHRoaXNgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpbnNwZWN0LlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2l0ZXJhdGVlXSBUaGUgZnVuY3Rpb24gaW52b2tlZCBwZXIgaXRlcmF0aW9uLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBuZXcgZHVwbGljYXRlIGZyZWUgYXJyYXkuXG4gKi9cbmZ1bmN0aW9uIGJhc2VVbmlxKGFycmF5LCBpdGVyYXRlZSkge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGluZGV4T2YgPSBiYXNlSW5kZXhPZixcbiAgICAgIGxlbmd0aCA9IGFycmF5Lmxlbmd0aCxcbiAgICAgIGlzQ29tbW9uID0gdHJ1ZSxcbiAgICAgIGlzTGFyZ2UgPSBpc0NvbW1vbiAmJiBsZW5ndGggPj0gTEFSR0VfQVJSQVlfU0laRSxcbiAgICAgIHNlZW4gPSBpc0xhcmdlID8gY3JlYXRlQ2FjaGUoKSA6IG51bGwsXG4gICAgICByZXN1bHQgPSBbXTtcblxuICBpZiAoc2Vlbikge1xuICAgIGluZGV4T2YgPSBjYWNoZUluZGV4T2Y7XG4gICAgaXNDb21tb24gPSBmYWxzZTtcbiAgfSBlbHNlIHtcbiAgICBpc0xhcmdlID0gZmFsc2U7XG4gICAgc2VlbiA9IGl0ZXJhdGVlID8gW10gOiByZXN1bHQ7XG4gIH1cbiAgb3V0ZXI6XG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgdmFyIHZhbHVlID0gYXJyYXlbaW5kZXhdLFxuICAgICAgICBjb21wdXRlZCA9IGl0ZXJhdGVlID8gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBhcnJheSkgOiB2YWx1ZTtcblxuICAgIGlmIChpc0NvbW1vbiAmJiB2YWx1ZSA9PT0gdmFsdWUpIHtcbiAgICAgIHZhciBzZWVuSW5kZXggPSBzZWVuLmxlbmd0aDtcbiAgICAgIHdoaWxlIChzZWVuSW5kZXgtLSkge1xuICAgICAgICBpZiAoc2VlbltzZWVuSW5kZXhdID09PSBjb21wdXRlZCkge1xuICAgICAgICAgIGNvbnRpbnVlIG91dGVyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoaXRlcmF0ZWUpIHtcbiAgICAgICAgc2Vlbi5wdXNoKGNvbXB1dGVkKTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoaW5kZXhPZihzZWVuLCBjb21wdXRlZCwgMCkgPCAwKSB7XG4gICAgICBpZiAoaXRlcmF0ZWUgfHwgaXNMYXJnZSkge1xuICAgICAgICBzZWVuLnB1c2goY29tcHV0ZWQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VVbmlxO1xuIiwidmFyIGJpbmFyeUluZGV4QnkgPSByZXF1aXJlKCcuL2JpbmFyeUluZGV4QnknKSxcbiAgICBpZGVudGl0eSA9IHJlcXVpcmUoJy4uL3V0aWxpdHkvaWRlbnRpdHknKTtcblxuLyoqIFVzZWQgYXMgcmVmZXJlbmNlcyBmb3IgdGhlIG1heGltdW0gbGVuZ3RoIGFuZCBpbmRleCBvZiBhbiBhcnJheS4gKi9cbnZhciBNQVhfQVJSQVlfTEVOR1RIID0gNDI5NDk2NzI5NSxcbiAgICBIQUxGX01BWF9BUlJBWV9MRU5HVEggPSBNQVhfQVJSQVlfTEVOR1RIID4+PiAxO1xuXG4vKipcbiAqIFBlcmZvcm1zIGEgYmluYXJ5IHNlYXJjaCBvZiBgYXJyYXlgIHRvIGRldGVybWluZSB0aGUgaW5kZXggYXQgd2hpY2ggYHZhbHVlYFxuICogc2hvdWxkIGJlIGluc2VydGVkIGludG8gYGFycmF5YCBpbiBvcmRlciB0byBtYWludGFpbiBpdHMgc29ydCBvcmRlci5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIHNvcnRlZCBhcnJheSB0byBpbnNwZWN0LlxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gZXZhbHVhdGUuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtyZXRIaWdoZXN0XSBTcGVjaWZ5IHJldHVybmluZyB0aGUgaGlnaGVzdCBxdWFsaWZpZWQgaW5kZXguXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBSZXR1cm5zIHRoZSBpbmRleCBhdCB3aGljaCBgdmFsdWVgIHNob3VsZCBiZSBpbnNlcnRlZFxuICogIGludG8gYGFycmF5YC5cbiAqL1xuZnVuY3Rpb24gYmluYXJ5SW5kZXgoYXJyYXksIHZhbHVlLCByZXRIaWdoZXN0KSB7XG4gIHZhciBsb3cgPSAwLFxuICAgICAgaGlnaCA9IGFycmF5ID8gYXJyYXkubGVuZ3RoIDogbG93O1xuXG4gIGlmICh0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicgJiYgdmFsdWUgPT09IHZhbHVlICYmIGhpZ2ggPD0gSEFMRl9NQVhfQVJSQVlfTEVOR1RIKSB7XG4gICAgd2hpbGUgKGxvdyA8IGhpZ2gpIHtcbiAgICAgIHZhciBtaWQgPSAobG93ICsgaGlnaCkgPj4+IDEsXG4gICAgICAgICAgY29tcHV0ZWQgPSBhcnJheVttaWRdO1xuXG4gICAgICBpZiAoKHJldEhpZ2hlc3QgPyAoY29tcHV0ZWQgPD0gdmFsdWUpIDogKGNvbXB1dGVkIDwgdmFsdWUpKSAmJiBjb21wdXRlZCAhPT0gbnVsbCkge1xuICAgICAgICBsb3cgPSBtaWQgKyAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaGlnaCA9IG1pZDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGhpZ2g7XG4gIH1cbiAgcmV0dXJuIGJpbmFyeUluZGV4QnkoYXJyYXksIHZhbHVlLCBpZGVudGl0eSwgcmV0SGlnaGVzdCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmluYXJ5SW5kZXg7XG4iLCIvKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgZm9yIHRob3NlIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzLiAqL1xudmFyIG5hdGl2ZUZsb29yID0gTWF0aC5mbG9vcixcbiAgICBuYXRpdmVNaW4gPSBNYXRoLm1pbjtcblxuLyoqIFVzZWQgYXMgcmVmZXJlbmNlcyBmb3IgdGhlIG1heGltdW0gbGVuZ3RoIGFuZCBpbmRleCBvZiBhbiBhcnJheS4gKi9cbnZhciBNQVhfQVJSQVlfTEVOR1RIID0gNDI5NDk2NzI5NSxcbiAgICBNQVhfQVJSQVlfSU5ERVggPSBNQVhfQVJSQVlfTEVOR1RIIC0gMTtcblxuLyoqXG4gKiBUaGlzIGZ1bmN0aW9uIGlzIGxpa2UgYGJpbmFyeUluZGV4YCBleGNlcHQgdGhhdCBpdCBpbnZva2VzIGBpdGVyYXRlZWAgZm9yXG4gKiBgdmFsdWVgIGFuZCBlYWNoIGVsZW1lbnQgb2YgYGFycmF5YCB0byBjb21wdXRlIHRoZWlyIHNvcnQgcmFua2luZy4gVGhlXG4gKiBpdGVyYXRlZSBpcyBpbnZva2VkIHdpdGggb25lIGFyZ3VtZW50OyAodmFsdWUpLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgc29ydGVkIGFycmF5IHRvIGluc3BlY3QuXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBldmFsdWF0ZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtyZXRIaWdoZXN0XSBTcGVjaWZ5IHJldHVybmluZyB0aGUgaGlnaGVzdCBxdWFsaWZpZWQgaW5kZXguXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBSZXR1cm5zIHRoZSBpbmRleCBhdCB3aGljaCBgdmFsdWVgIHNob3VsZCBiZSBpbnNlcnRlZFxuICogIGludG8gYGFycmF5YC5cbiAqL1xuZnVuY3Rpb24gYmluYXJ5SW5kZXhCeShhcnJheSwgdmFsdWUsIGl0ZXJhdGVlLCByZXRIaWdoZXN0KSB7XG4gIHZhbHVlID0gaXRlcmF0ZWUodmFsdWUpO1xuXG4gIHZhciBsb3cgPSAwLFxuICAgICAgaGlnaCA9IGFycmF5ID8gYXJyYXkubGVuZ3RoIDogMCxcbiAgICAgIHZhbElzTmFOID0gdmFsdWUgIT09IHZhbHVlLFxuICAgICAgdmFsSXNOdWxsID0gdmFsdWUgPT09IG51bGwsXG4gICAgICB2YWxJc1VuZGVmID0gdmFsdWUgPT09IHVuZGVmaW5lZDtcblxuICB3aGlsZSAobG93IDwgaGlnaCkge1xuICAgIHZhciBtaWQgPSBuYXRpdmVGbG9vcigobG93ICsgaGlnaCkgLyAyKSxcbiAgICAgICAgY29tcHV0ZWQgPSBpdGVyYXRlZShhcnJheVttaWRdKSxcbiAgICAgICAgaXNEZWYgPSBjb21wdXRlZCAhPT0gdW5kZWZpbmVkLFxuICAgICAgICBpc1JlZmxleGl2ZSA9IGNvbXB1dGVkID09PSBjb21wdXRlZDtcblxuICAgIGlmICh2YWxJc05hTikge1xuICAgICAgdmFyIHNldExvdyA9IGlzUmVmbGV4aXZlIHx8IHJldEhpZ2hlc3Q7XG4gICAgfSBlbHNlIGlmICh2YWxJc051bGwpIHtcbiAgICAgIHNldExvdyA9IGlzUmVmbGV4aXZlICYmIGlzRGVmICYmIChyZXRIaWdoZXN0IHx8IGNvbXB1dGVkICE9IG51bGwpO1xuICAgIH0gZWxzZSBpZiAodmFsSXNVbmRlZikge1xuICAgICAgc2V0TG93ID0gaXNSZWZsZXhpdmUgJiYgKHJldEhpZ2hlc3QgfHwgaXNEZWYpO1xuICAgIH0gZWxzZSBpZiAoY29tcHV0ZWQgPT0gbnVsbCkge1xuICAgICAgc2V0TG93ID0gZmFsc2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNldExvdyA9IHJldEhpZ2hlc3QgPyAoY29tcHV0ZWQgPD0gdmFsdWUpIDogKGNvbXB1dGVkIDwgdmFsdWUpO1xuICAgIH1cbiAgICBpZiAoc2V0TG93KSB7XG4gICAgICBsb3cgPSBtaWQgKyAxO1xuICAgIH0gZWxzZSB7XG4gICAgICBoaWdoID0gbWlkO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmF0aXZlTWluKGhpZ2gsIE1BWF9BUlJBWV9JTkRFWCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmluYXJ5SW5kZXhCeTtcbiIsInZhciBpZGVudGl0eSA9IHJlcXVpcmUoJy4uL3V0aWxpdHkvaWRlbnRpdHknKTtcblxuLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYGJhc2VDYWxsYmFja2Agd2hpY2ggb25seSBzdXBwb3J0cyBgdGhpc2AgYmluZGluZ1xuICogYW5kIHNwZWNpZnlpbmcgdGhlIG51bWJlciBvZiBhcmd1bWVudHMgdG8gcHJvdmlkZSB0byBgZnVuY2AuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGJpbmQuXG4gKiBAcGFyYW0geyp9IHRoaXNBcmcgVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBmdW5jYC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbYXJnQ291bnRdIFRoZSBudW1iZXIgb2YgYXJndW1lbnRzIHRvIHByb3ZpZGUgdG8gYGZ1bmNgLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBjYWxsYmFjay5cbiAqL1xuZnVuY3Rpb24gYmluZENhbGxiYWNrKGZ1bmMsIHRoaXNBcmcsIGFyZ0NvdW50KSB7XG4gIGlmICh0eXBlb2YgZnVuYyAhPSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIGlkZW50aXR5O1xuICB9XG4gIGlmICh0aGlzQXJnID09PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gZnVuYztcbiAgfVxuICBzd2l0Y2ggKGFyZ0NvdW50KSB7XG4gICAgY2FzZSAxOiByZXR1cm4gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHJldHVybiBmdW5jLmNhbGwodGhpc0FyZywgdmFsdWUpO1xuICAgIH07XG4gICAgY2FzZSAzOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgfTtcbiAgICBjYXNlIDQ6IHJldHVybiBmdW5jdGlvbihhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgIH07XG4gICAgY2FzZSA1OiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIG90aGVyLCBrZXksIG9iamVjdCwgc291cmNlKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIHZhbHVlLCBvdGhlciwga2V5LCBvYmplY3QsIHNvdXJjZSk7XG4gICAgfTtcbiAgfVxuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpc0FyZywgYXJndW1lbnRzKTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiaW5kQ2FsbGJhY2s7XG4iLCIvKiogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIEFycmF5QnVmZmVyID0gZ2xvYmFsLkFycmF5QnVmZmVyLFxuICAgIFVpbnQ4QXJyYXkgPSBnbG9iYWwuVWludDhBcnJheTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgY2xvbmUgb2YgdGhlIGdpdmVuIGFycmF5IGJ1ZmZlci5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheUJ1ZmZlcn0gYnVmZmVyIFRoZSBhcnJheSBidWZmZXIgdG8gY2xvbmUuXG4gKiBAcmV0dXJucyB7QXJyYXlCdWZmZXJ9IFJldHVybnMgdGhlIGNsb25lZCBhcnJheSBidWZmZXIuXG4gKi9cbmZ1bmN0aW9uIGJ1ZmZlckNsb25lKGJ1ZmZlcikge1xuICB2YXIgcmVzdWx0ID0gbmV3IEFycmF5QnVmZmVyKGJ1ZmZlci5ieXRlTGVuZ3RoKSxcbiAgICAgIHZpZXcgPSBuZXcgVWludDhBcnJheShyZXN1bHQpO1xuXG4gIHZpZXcuc2V0KG5ldyBVaW50OEFycmF5KGJ1ZmZlcikpO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJ1ZmZlckNsb25lO1xuIiwidmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi4vbGFuZy9pc09iamVjdCcpO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGluIGBjYWNoZWAgbWltaWNraW5nIHRoZSByZXR1cm4gc2lnbmF0dXJlIG9mXG4gKiBgXy5pbmRleE9mYCBieSByZXR1cm5pbmcgYDBgIGlmIHRoZSB2YWx1ZSBpcyBmb3VuZCwgZWxzZSBgLTFgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gY2FjaGUgVGhlIGNhY2hlIHRvIHNlYXJjaC5cbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHNlYXJjaCBmb3IuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBSZXR1cm5zIGAwYCBpZiBgdmFsdWVgIGlzIGZvdW5kLCBlbHNlIGAtMWAuXG4gKi9cbmZ1bmN0aW9uIGNhY2hlSW5kZXhPZihjYWNoZSwgdmFsdWUpIHtcbiAgdmFyIGRhdGEgPSBjYWNoZS5kYXRhLFxuICAgICAgcmVzdWx0ID0gKHR5cGVvZiB2YWx1ZSA9PSAnc3RyaW5nJyB8fCBpc09iamVjdCh2YWx1ZSkpID8gZGF0YS5zZXQuaGFzKHZhbHVlKSA6IGRhdGEuaGFzaFt2YWx1ZV07XG5cbiAgcmV0dXJuIHJlc3VsdCA/IDAgOiAtMTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjYWNoZUluZGV4T2Y7XG4iLCJ2YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuLi9sYW5nL2lzT2JqZWN0Jyk7XG5cbi8qKlxuICogQWRkcyBgdmFsdWVgIHRvIHRoZSBjYWNoZS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQG5hbWUgcHVzaFxuICogQG1lbWJlck9mIFNldENhY2hlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjYWNoZS5cbiAqL1xuZnVuY3Rpb24gY2FjaGVQdXNoKHZhbHVlKSB7XG4gIHZhciBkYXRhID0gdGhpcy5kYXRhO1xuICBpZiAodHlwZW9mIHZhbHVlID09ICdzdHJpbmcnIHx8IGlzT2JqZWN0KHZhbHVlKSkge1xuICAgIGRhdGEuc2V0LmFkZCh2YWx1ZSk7XG4gIH0gZWxzZSB7XG4gICAgZGF0YS5oYXNoW3ZhbHVlXSA9IHRydWU7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjYWNoZVB1c2g7XG4iLCJ2YXIgZ2V0TGVuZ3RoID0gcmVxdWlyZSgnLi9nZXRMZW5ndGgnKSxcbiAgICBpc0xlbmd0aCA9IHJlcXVpcmUoJy4vaXNMZW5ndGgnKSxcbiAgICB0b09iamVjdCA9IHJlcXVpcmUoJy4vdG9PYmplY3QnKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgYGJhc2VFYWNoYCBvciBgYmFzZUVhY2hSaWdodGAgZnVuY3Rpb24uXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGVhY2hGdW5jIFRoZSBmdW5jdGlvbiB0byBpdGVyYXRlIG92ZXIgYSBjb2xsZWN0aW9uLlxuICogQHBhcmFtIHtib29sZWFufSBbZnJvbVJpZ2h0XSBTcGVjaWZ5IGl0ZXJhdGluZyBmcm9tIHJpZ2h0IHRvIGxlZnQuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBiYXNlIGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBjcmVhdGVCYXNlRWFjaChlYWNoRnVuYywgZnJvbVJpZ2h0KSB7XG4gIHJldHVybiBmdW5jdGlvbihjb2xsZWN0aW9uLCBpdGVyYXRlZSkge1xuICAgIHZhciBsZW5ndGggPSBjb2xsZWN0aW9uID8gZ2V0TGVuZ3RoKGNvbGxlY3Rpb24pIDogMDtcbiAgICBpZiAoIWlzTGVuZ3RoKGxlbmd0aCkpIHtcbiAgICAgIHJldHVybiBlYWNoRnVuYyhjb2xsZWN0aW9uLCBpdGVyYXRlZSk7XG4gICAgfVxuICAgIHZhciBpbmRleCA9IGZyb21SaWdodCA/IGxlbmd0aCA6IC0xLFxuICAgICAgICBpdGVyYWJsZSA9IHRvT2JqZWN0KGNvbGxlY3Rpb24pO1xuXG4gICAgd2hpbGUgKChmcm9tUmlnaHQgPyBpbmRleC0tIDogKytpbmRleCA8IGxlbmd0aCkpIHtcbiAgICAgIGlmIChpdGVyYXRlZShpdGVyYWJsZVtpbmRleF0sIGluZGV4LCBpdGVyYWJsZSkgPT09IGZhbHNlKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY29sbGVjdGlvbjtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVCYXNlRWFjaDtcbiIsInZhciB0b09iamVjdCA9IHJlcXVpcmUoJy4vdG9PYmplY3QnKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgYmFzZSBmdW5jdGlvbiBmb3IgYF8uZm9ySW5gIG9yIGBfLmZvckluUmlnaHRgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtmcm9tUmlnaHRdIFNwZWNpZnkgaXRlcmF0aW5nIGZyb20gcmlnaHQgdG8gbGVmdC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGJhc2UgZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUJhc2VGb3IoZnJvbVJpZ2h0KSB7XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QsIGl0ZXJhdGVlLCBrZXlzRnVuYykge1xuICAgIHZhciBpdGVyYWJsZSA9IHRvT2JqZWN0KG9iamVjdCksXG4gICAgICAgIHByb3BzID0ga2V5c0Z1bmMob2JqZWN0KSxcbiAgICAgICAgbGVuZ3RoID0gcHJvcHMubGVuZ3RoLFxuICAgICAgICBpbmRleCA9IGZyb21SaWdodCA/IGxlbmd0aCA6IC0xO1xuXG4gICAgd2hpbGUgKChmcm9tUmlnaHQgPyBpbmRleC0tIDogKytpbmRleCA8IGxlbmd0aCkpIHtcbiAgICAgIHZhciBrZXkgPSBwcm9wc1tpbmRleF07XG4gICAgICBpZiAoaXRlcmF0ZWUoaXRlcmFibGVba2V5XSwga2V5LCBpdGVyYWJsZSkgPT09IGZhbHNlKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0O1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUJhc2VGb3I7XG4iLCJ2YXIgU2V0Q2FjaGUgPSByZXF1aXJlKCcuL1NldENhY2hlJyksXG4gICAgZ2V0TmF0aXZlID0gcmVxdWlyZSgnLi9nZXROYXRpdmUnKTtcblxuLyoqIE5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBTZXQgPSBnZXROYXRpdmUoZ2xvYmFsLCAnU2V0Jyk7XG5cbi8qIE5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyBmb3IgdGhvc2Ugd2l0aCB0aGUgc2FtZSBuYW1lIGFzIG90aGVyIGBsb2Rhc2hgIG1ldGhvZHMuICovXG52YXIgbmF0aXZlQ3JlYXRlID0gZ2V0TmF0aXZlKE9iamVjdCwgJ2NyZWF0ZScpO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBgU2V0YCBjYWNoZSBvYmplY3QgdG8gb3B0aW1pemUgbGluZWFyIHNlYXJjaGVzIG9mIGxhcmdlIGFycmF5cy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gW3ZhbHVlc10gVGhlIHZhbHVlcyB0byBjYWNoZS5cbiAqIEByZXR1cm5zIHtudWxsfE9iamVjdH0gUmV0dXJucyB0aGUgbmV3IGNhY2hlIG9iamVjdCBpZiBgU2V0YCBpcyBzdXBwb3J0ZWQsIGVsc2UgYG51bGxgLlxuICovXG5mdW5jdGlvbiBjcmVhdGVDYWNoZSh2YWx1ZXMpIHtcbiAgcmV0dXJuIChuYXRpdmVDcmVhdGUgJiYgU2V0KSA/IG5ldyBTZXRDYWNoZSh2YWx1ZXMpIDogbnVsbDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVDYWNoZTtcbiIsInZhciBiYXNlQ2FsbGJhY2sgPSByZXF1aXJlKCcuL2Jhc2VDYWxsYmFjaycpLFxuICAgIGJhc2VGaW5kID0gcmVxdWlyZSgnLi9iYXNlRmluZCcpLFxuICAgIGJhc2VGaW5kSW5kZXggPSByZXF1aXJlKCcuL2Jhc2VGaW5kSW5kZXgnKSxcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FycmF5Jyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGBfLmZpbmRgIG9yIGBfLmZpbmRMYXN0YCBmdW5jdGlvbi5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZWFjaEZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGl0ZXJhdGUgb3ZlciBhIGNvbGxlY3Rpb24uXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtmcm9tUmlnaHRdIFNwZWNpZnkgaXRlcmF0aW5nIGZyb20gcmlnaHQgdG8gbGVmdC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZpbmQgZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUZpbmQoZWFjaEZ1bmMsIGZyb21SaWdodCkge1xuICByZXR1cm4gZnVuY3Rpb24oY29sbGVjdGlvbiwgcHJlZGljYXRlLCB0aGlzQXJnKSB7XG4gICAgcHJlZGljYXRlID0gYmFzZUNhbGxiYWNrKHByZWRpY2F0ZSwgdGhpc0FyZywgMyk7XG4gICAgaWYgKGlzQXJyYXkoY29sbGVjdGlvbikpIHtcbiAgICAgIHZhciBpbmRleCA9IGJhc2VGaW5kSW5kZXgoY29sbGVjdGlvbiwgcHJlZGljYXRlLCBmcm9tUmlnaHQpO1xuICAgICAgcmV0dXJuIGluZGV4ID4gLTEgPyBjb2xsZWN0aW9uW2luZGV4XSA6IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIGJhc2VGaW5kKGNvbGxlY3Rpb24sIHByZWRpY2F0ZSwgZWFjaEZ1bmMpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUZpbmQ7XG4iLCJ2YXIgYmluZENhbGxiYWNrID0gcmVxdWlyZSgnLi9iaW5kQ2FsbGJhY2snKSxcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FycmF5Jyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGZ1bmN0aW9uIGZvciBgXy5mb3JFYWNoYCBvciBgXy5mb3JFYWNoUmlnaHRgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBhcnJheUZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGl0ZXJhdGUgb3ZlciBhbiBhcnJheS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGVhY2hGdW5jIFRoZSBmdW5jdGlvbiB0byBpdGVyYXRlIG92ZXIgYSBjb2xsZWN0aW9uLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZWFjaCBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlRm9yRWFjaChhcnJheUZ1bmMsIGVhY2hGdW5jKSB7XG4gIHJldHVybiBmdW5jdGlvbihjb2xsZWN0aW9uLCBpdGVyYXRlZSwgdGhpc0FyZykge1xuICAgIHJldHVybiAodHlwZW9mIGl0ZXJhdGVlID09ICdmdW5jdGlvbicgJiYgdGhpc0FyZyA9PT0gdW5kZWZpbmVkICYmIGlzQXJyYXkoY29sbGVjdGlvbikpXG4gICAgICA/IGFycmF5RnVuYyhjb2xsZWN0aW9uLCBpdGVyYXRlZSlcbiAgICAgIDogZWFjaEZ1bmMoY29sbGVjdGlvbiwgYmluZENhbGxiYWNrKGl0ZXJhdGVlLCB0aGlzQXJnLCAzKSk7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlRm9yRWFjaDtcbiIsInZhciBiYXNlQ2FsbGJhY2sgPSByZXF1aXJlKCcuL2Jhc2VDYWxsYmFjaycpLFxuICAgIGJhc2VSZWR1Y2UgPSByZXF1aXJlKCcuL2Jhc2VSZWR1Y2UnKSxcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FycmF5Jyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGZ1bmN0aW9uIGZvciBgXy5yZWR1Y2VgIG9yIGBfLnJlZHVjZVJpZ2h0YC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gYXJyYXlGdW5jIFRoZSBmdW5jdGlvbiB0byBpdGVyYXRlIG92ZXIgYW4gYXJyYXkuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBlYWNoRnVuYyBUaGUgZnVuY3Rpb24gdG8gaXRlcmF0ZSBvdmVyIGEgY29sbGVjdGlvbi5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGVhY2ggZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVJlZHVjZShhcnJheUZ1bmMsIGVhY2hGdW5jKSB7XG4gIHJldHVybiBmdW5jdGlvbihjb2xsZWN0aW9uLCBpdGVyYXRlZSwgYWNjdW11bGF0b3IsIHRoaXNBcmcpIHtcbiAgICB2YXIgaW5pdEZyb21BcnJheSA9IGFyZ3VtZW50cy5sZW5ndGggPCAzO1xuICAgIHJldHVybiAodHlwZW9mIGl0ZXJhdGVlID09ICdmdW5jdGlvbicgJiYgdGhpc0FyZyA9PT0gdW5kZWZpbmVkICYmIGlzQXJyYXkoY29sbGVjdGlvbikpXG4gICAgICA/IGFycmF5RnVuYyhjb2xsZWN0aW9uLCBpdGVyYXRlZSwgYWNjdW11bGF0b3IsIGluaXRGcm9tQXJyYXkpXG4gICAgICA6IGJhc2VSZWR1Y2UoY29sbGVjdGlvbiwgYmFzZUNhbGxiYWNrKGl0ZXJhdGVlLCB0aGlzQXJnLCA0KSwgYWNjdW11bGF0b3IsIGluaXRGcm9tQXJyYXksIGVhY2hGdW5jKTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVSZWR1Y2U7XG4iLCJ2YXIgYXJyYXlTb21lID0gcmVxdWlyZSgnLi9hcnJheVNvbWUnKTtcblxuLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYGJhc2VJc0VxdWFsRGVlcGAgZm9yIGFycmF5cyB3aXRoIHN1cHBvcnQgZm9yXG4gKiBwYXJ0aWFsIGRlZXAgY29tcGFyaXNvbnMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBjb21wYXJlLlxuICogQHBhcmFtIHtBcnJheX0gb3RoZXIgVGhlIG90aGVyIGFycmF5IHRvIGNvbXBhcmUuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBlcXVhbEZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGRldGVybWluZSBlcXVpdmFsZW50cyBvZiB2YWx1ZXMuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY3VzdG9taXplcl0gVGhlIGZ1bmN0aW9uIHRvIGN1c3RvbWl6ZSBjb21wYXJpbmcgYXJyYXlzLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNMb29zZV0gU3BlY2lmeSBwZXJmb3JtaW5nIHBhcnRpYWwgY29tcGFyaXNvbnMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tBXSBUcmFja3MgdHJhdmVyc2VkIGB2YWx1ZWAgb2JqZWN0cy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0JdIFRyYWNrcyB0cmF2ZXJzZWQgYG90aGVyYCBvYmplY3RzLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBhcnJheXMgYXJlIGVxdWl2YWxlbnQsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gZXF1YWxBcnJheXMoYXJyYXksIG90aGVyLCBlcXVhbEZ1bmMsIGN1c3RvbWl6ZXIsIGlzTG9vc2UsIHN0YWNrQSwgc3RhY2tCKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgYXJyTGVuZ3RoID0gYXJyYXkubGVuZ3RoLFxuICAgICAgb3RoTGVuZ3RoID0gb3RoZXIubGVuZ3RoO1xuXG4gIGlmIChhcnJMZW5ndGggIT0gb3RoTGVuZ3RoICYmICEoaXNMb29zZSAmJiBvdGhMZW5ndGggPiBhcnJMZW5ndGgpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vIElnbm9yZSBub24taW5kZXggcHJvcGVydGllcy5cbiAgd2hpbGUgKCsraW5kZXggPCBhcnJMZW5ndGgpIHtcbiAgICB2YXIgYXJyVmFsdWUgPSBhcnJheVtpbmRleF0sXG4gICAgICAgIG90aFZhbHVlID0gb3RoZXJbaW5kZXhdLFxuICAgICAgICByZXN1bHQgPSBjdXN0b21pemVyID8gY3VzdG9taXplcihpc0xvb3NlID8gb3RoVmFsdWUgOiBhcnJWYWx1ZSwgaXNMb29zZSA/IGFyclZhbHVlIDogb3RoVmFsdWUsIGluZGV4KSA6IHVuZGVmaW5lZDtcblxuICAgIGlmIChyZXN1bHQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8gUmVjdXJzaXZlbHkgY29tcGFyZSBhcnJheXMgKHN1c2NlcHRpYmxlIHRvIGNhbGwgc3RhY2sgbGltaXRzKS5cbiAgICBpZiAoaXNMb29zZSkge1xuICAgICAgaWYgKCFhcnJheVNvbWUob3RoZXIsIGZ1bmN0aW9uKG90aFZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gYXJyVmFsdWUgPT09IG90aFZhbHVlIHx8IGVxdWFsRnVuYyhhcnJWYWx1ZSwgb3RoVmFsdWUsIGN1c3RvbWl6ZXIsIGlzTG9vc2UsIHN0YWNrQSwgc3RhY2tCKTtcbiAgICAgICAgICB9KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghKGFyclZhbHVlID09PSBvdGhWYWx1ZSB8fCBlcXVhbEZ1bmMoYXJyVmFsdWUsIG90aFZhbHVlLCBjdXN0b21pemVyLCBpc0xvb3NlLCBzdGFja0EsIHN0YWNrQikpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVxdWFsQXJyYXlzO1xuIiwiLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGJvb2xUYWcgPSAnW29iamVjdCBCb29sZWFuXScsXG4gICAgZGF0ZVRhZyA9ICdbb2JqZWN0IERhdGVdJyxcbiAgICBlcnJvclRhZyA9ICdbb2JqZWN0IEVycm9yXScsXG4gICAgbnVtYmVyVGFnID0gJ1tvYmplY3QgTnVtYmVyXScsXG4gICAgcmVnZXhwVGFnID0gJ1tvYmplY3QgUmVnRXhwXScsXG4gICAgc3RyaW5nVGFnID0gJ1tvYmplY3QgU3RyaW5nXSc7XG5cbi8qKlxuICogQSBzcGVjaWFsaXplZCB2ZXJzaW9uIG9mIGBiYXNlSXNFcXVhbERlZXBgIGZvciBjb21wYXJpbmcgb2JqZWN0cyBvZlxuICogdGhlIHNhbWUgYHRvU3RyaW5nVGFnYC5cbiAqXG4gKiAqKk5vdGU6KiogVGhpcyBmdW5jdGlvbiBvbmx5IHN1cHBvcnRzIGNvbXBhcmluZyB2YWx1ZXMgd2l0aCB0YWdzIG9mXG4gKiBgQm9vbGVhbmAsIGBEYXRlYCwgYEVycm9yYCwgYE51bWJlcmAsIGBSZWdFeHBgLCBvciBgU3RyaW5nYC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGNvbXBhcmUuXG4gKiBAcGFyYW0ge09iamVjdH0gb3RoZXIgVGhlIG90aGVyIG9iamVjdCB0byBjb21wYXJlLlxuICogQHBhcmFtIHtzdHJpbmd9IHRhZyBUaGUgYHRvU3RyaW5nVGFnYCBvZiB0aGUgb2JqZWN0cyB0byBjb21wYXJlLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBvYmplY3RzIGFyZSBlcXVpdmFsZW50LCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGVxdWFsQnlUYWcob2JqZWN0LCBvdGhlciwgdGFnKSB7XG4gIHN3aXRjaCAodGFnKSB7XG4gICAgY2FzZSBib29sVGFnOlxuICAgIGNhc2UgZGF0ZVRhZzpcbiAgICAgIC8vIENvZXJjZSBkYXRlcyBhbmQgYm9vbGVhbnMgdG8gbnVtYmVycywgZGF0ZXMgdG8gbWlsbGlzZWNvbmRzIGFuZCBib29sZWFuc1xuICAgICAgLy8gdG8gYDFgIG9yIGAwYCB0cmVhdGluZyBpbnZhbGlkIGRhdGVzIGNvZXJjZWQgdG8gYE5hTmAgYXMgbm90IGVxdWFsLlxuICAgICAgcmV0dXJuICtvYmplY3QgPT0gK290aGVyO1xuXG4gICAgY2FzZSBlcnJvclRhZzpcbiAgICAgIHJldHVybiBvYmplY3QubmFtZSA9PSBvdGhlci5uYW1lICYmIG9iamVjdC5tZXNzYWdlID09IG90aGVyLm1lc3NhZ2U7XG5cbiAgICBjYXNlIG51bWJlclRhZzpcbiAgICAgIC8vIFRyZWF0IGBOYU5gIHZzLiBgTmFOYCBhcyBlcXVhbC5cbiAgICAgIHJldHVybiAob2JqZWN0ICE9ICtvYmplY3QpXG4gICAgICAgID8gb3RoZXIgIT0gK290aGVyXG4gICAgICAgIDogb2JqZWN0ID09ICtvdGhlcjtcblxuICAgIGNhc2UgcmVnZXhwVGFnOlxuICAgIGNhc2Ugc3RyaW5nVGFnOlxuICAgICAgLy8gQ29lcmNlIHJlZ2V4ZXMgdG8gc3RyaW5ncyBhbmQgdHJlYXQgc3RyaW5ncyBwcmltaXRpdmVzIGFuZCBzdHJpbmdcbiAgICAgIC8vIG9iamVjdHMgYXMgZXF1YWwuIFNlZSBodHRwczovL2VzNS5naXRodWIuaW8vI3gxNS4xMC42LjQgZm9yIG1vcmUgZGV0YWlscy5cbiAgICAgIHJldHVybiBvYmplY3QgPT0gKG90aGVyICsgJycpO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBlcXVhbEJ5VGFnO1xuIiwidmFyIGtleXMgPSByZXF1aXJlKCcuLi9vYmplY3Qva2V5cycpO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gY2hlY2sgb2JqZWN0cyBmb3Igb3duIHByb3BlcnRpZXMuICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBBIHNwZWNpYWxpemVkIHZlcnNpb24gb2YgYGJhc2VJc0VxdWFsRGVlcGAgZm9yIG9iamVjdHMgd2l0aCBzdXBwb3J0IGZvclxuICogcGFydGlhbCBkZWVwIGNvbXBhcmlzb25zLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvdGhlciBUaGUgb3RoZXIgb2JqZWN0IHRvIGNvbXBhcmUuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBlcXVhbEZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGRldGVybWluZSBlcXVpdmFsZW50cyBvZiB2YWx1ZXMuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY3VzdG9taXplcl0gVGhlIGZ1bmN0aW9uIHRvIGN1c3RvbWl6ZSBjb21wYXJpbmcgdmFsdWVzLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNMb29zZV0gU3BlY2lmeSBwZXJmb3JtaW5nIHBhcnRpYWwgY29tcGFyaXNvbnMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tBXSBUcmFja3MgdHJhdmVyc2VkIGB2YWx1ZWAgb2JqZWN0cy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0JdIFRyYWNrcyB0cmF2ZXJzZWQgYG90aGVyYCBvYmplY3RzLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBvYmplY3RzIGFyZSBlcXVpdmFsZW50LCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGVxdWFsT2JqZWN0cyhvYmplY3QsIG90aGVyLCBlcXVhbEZ1bmMsIGN1c3RvbWl6ZXIsIGlzTG9vc2UsIHN0YWNrQSwgc3RhY2tCKSB7XG4gIHZhciBvYmpQcm9wcyA9IGtleXMob2JqZWN0KSxcbiAgICAgIG9iakxlbmd0aCA9IG9ialByb3BzLmxlbmd0aCxcbiAgICAgIG90aFByb3BzID0ga2V5cyhvdGhlciksXG4gICAgICBvdGhMZW5ndGggPSBvdGhQcm9wcy5sZW5ndGg7XG5cbiAgaWYgKG9iakxlbmd0aCAhPSBvdGhMZW5ndGggJiYgIWlzTG9vc2UpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdmFyIGluZGV4ID0gb2JqTGVuZ3RoO1xuICB3aGlsZSAoaW5kZXgtLSkge1xuICAgIHZhciBrZXkgPSBvYmpQcm9wc1tpbmRleF07XG4gICAgaWYgKCEoaXNMb29zZSA/IGtleSBpbiBvdGhlciA6IGhhc093blByb3BlcnR5LmNhbGwob3RoZXIsIGtleSkpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHZhciBza2lwQ3RvciA9IGlzTG9vc2U7XG4gIHdoaWxlICgrK2luZGV4IDwgb2JqTGVuZ3RoKSB7XG4gICAga2V5ID0gb2JqUHJvcHNbaW5kZXhdO1xuICAgIHZhciBvYmpWYWx1ZSA9IG9iamVjdFtrZXldLFxuICAgICAgICBvdGhWYWx1ZSA9IG90aGVyW2tleV0sXG4gICAgICAgIHJlc3VsdCA9IGN1c3RvbWl6ZXIgPyBjdXN0b21pemVyKGlzTG9vc2UgPyBvdGhWYWx1ZSA6IG9ialZhbHVlLCBpc0xvb3NlPyBvYmpWYWx1ZSA6IG90aFZhbHVlLCBrZXkpIDogdW5kZWZpbmVkO1xuXG4gICAgLy8gUmVjdXJzaXZlbHkgY29tcGFyZSBvYmplY3RzIChzdXNjZXB0aWJsZSB0byBjYWxsIHN0YWNrIGxpbWl0cykuXG4gICAgaWYgKCEocmVzdWx0ID09PSB1bmRlZmluZWQgPyBlcXVhbEZ1bmMob2JqVmFsdWUsIG90aFZhbHVlLCBjdXN0b21pemVyLCBpc0xvb3NlLCBzdGFja0EsIHN0YWNrQikgOiByZXN1bHQpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHNraXBDdG9yIHx8IChza2lwQ3RvciA9IGtleSA9PSAnY29uc3RydWN0b3InKTtcbiAgfVxuICBpZiAoIXNraXBDdG9yKSB7XG4gICAgdmFyIG9iakN0b3IgPSBvYmplY3QuY29uc3RydWN0b3IsXG4gICAgICAgIG90aEN0b3IgPSBvdGhlci5jb25zdHJ1Y3RvcjtcblxuICAgIC8vIE5vbiBgT2JqZWN0YCBvYmplY3QgaW5zdGFuY2VzIHdpdGggZGlmZmVyZW50IGNvbnN0cnVjdG9ycyBhcmUgbm90IGVxdWFsLlxuICAgIGlmIChvYmpDdG9yICE9IG90aEN0b3IgJiZcbiAgICAgICAgKCdjb25zdHJ1Y3RvcicgaW4gb2JqZWN0ICYmICdjb25zdHJ1Y3RvcicgaW4gb3RoZXIpICYmXG4gICAgICAgICEodHlwZW9mIG9iakN0b3IgPT0gJ2Z1bmN0aW9uJyAmJiBvYmpDdG9yIGluc3RhbmNlb2Ygb2JqQ3RvciAmJlxuICAgICAgICAgIHR5cGVvZiBvdGhDdG9yID09ICdmdW5jdGlvbicgJiYgb3RoQ3RvciBpbnN0YW5jZW9mIG90aEN0b3IpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGVxdWFsT2JqZWN0cztcbiIsInZhciBiYXNlUHJvcGVydHkgPSByZXF1aXJlKCcuL2Jhc2VQcm9wZXJ0eScpO1xuXG4vKipcbiAqIEdldHMgdGhlIFwibGVuZ3RoXCIgcHJvcGVydHkgdmFsdWUgb2YgYG9iamVjdGAuXG4gKlxuICogKipOb3RlOioqIFRoaXMgZnVuY3Rpb24gaXMgdXNlZCB0byBhdm9pZCBhIFtKSVQgYnVnXShodHRwczovL2J1Z3Mud2Via2l0Lm9yZy9zaG93X2J1Zy5jZ2k/aWQ9MTQyNzkyKVxuICogdGhhdCBhZmZlY3RzIFNhZmFyaSBvbiBhdCBsZWFzdCBpT1MgOC4xLTguMyBBUk02NC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHJldHVybnMgeyp9IFJldHVybnMgdGhlIFwibGVuZ3RoXCIgdmFsdWUuXG4gKi9cbnZhciBnZXRMZW5ndGggPSBiYXNlUHJvcGVydHkoJ2xlbmd0aCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGdldExlbmd0aDtcbiIsInZhciBpc1N0cmljdENvbXBhcmFibGUgPSByZXF1aXJlKCcuL2lzU3RyaWN0Q29tcGFyYWJsZScpLFxuICAgIHBhaXJzID0gcmVxdWlyZSgnLi4vb2JqZWN0L3BhaXJzJyk7XG5cbi8qKlxuICogR2V0cyB0aGUgcHJvcGVyeSBuYW1lcywgdmFsdWVzLCBhbmQgY29tcGFyZSBmbGFncyBvZiBgb2JqZWN0YC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBtYXRjaCBkYXRhIG9mIGBvYmplY3RgLlxuICovXG5mdW5jdGlvbiBnZXRNYXRjaERhdGEob2JqZWN0KSB7XG4gIHZhciByZXN1bHQgPSBwYWlycyhvYmplY3QpLFxuICAgICAgbGVuZ3RoID0gcmVzdWx0Lmxlbmd0aDtcblxuICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICByZXN1bHRbbGVuZ3RoXVsyXSA9IGlzU3RyaWN0Q29tcGFyYWJsZShyZXN1bHRbbGVuZ3RoXVsxXSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBnZXRNYXRjaERhdGE7XG4iLCJ2YXIgaXNOYXRpdmUgPSByZXF1aXJlKCcuLi9sYW5nL2lzTmF0aXZlJyk7XG5cbi8qKlxuICogR2V0cyB0aGUgbmF0aXZlIGZ1bmN0aW9uIGF0IGBrZXlgIG9mIGBvYmplY3RgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gcXVlcnkuXG4gKiBAcGFyYW0ge3N0cmluZ30ga2V5IFRoZSBrZXkgb2YgdGhlIG1ldGhvZCB0byBnZXQuXG4gKiBAcmV0dXJucyB7Kn0gUmV0dXJucyB0aGUgZnVuY3Rpb24gaWYgaXQncyBuYXRpdmUsIGVsc2UgYHVuZGVmaW5lZGAuXG4gKi9cbmZ1bmN0aW9uIGdldE5hdGl2ZShvYmplY3QsIGtleSkge1xuICB2YXIgdmFsdWUgPSBvYmplY3QgPT0gbnVsbCA/IHVuZGVmaW5lZCA6IG9iamVjdFtrZXldO1xuICByZXR1cm4gaXNOYXRpdmUodmFsdWUpID8gdmFsdWUgOiB1bmRlZmluZWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZ2V0TmF0aXZlO1xuIiwiLyoqXG4gKiBHZXRzIHRoZSBpbmRleCBhdCB3aGljaCB0aGUgZmlyc3Qgb2NjdXJyZW5jZSBvZiBgTmFOYCBpcyBmb3VuZCBpbiBgYXJyYXlgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gc2VhcmNoLlxuICogQHBhcmFtIHtudW1iZXJ9IGZyb21JbmRleCBUaGUgaW5kZXggdG8gc2VhcmNoIGZyb20uXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtmcm9tUmlnaHRdIFNwZWNpZnkgaXRlcmF0aW5nIGZyb20gcmlnaHQgdG8gbGVmdC5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFJldHVybnMgdGhlIGluZGV4IG9mIHRoZSBtYXRjaGVkIGBOYU5gLCBlbHNlIGAtMWAuXG4gKi9cbmZ1bmN0aW9uIGluZGV4T2ZOYU4oYXJyYXksIGZyb21JbmRleCwgZnJvbVJpZ2h0KSB7XG4gIHZhciBsZW5ndGggPSBhcnJheS5sZW5ndGgsXG4gICAgICBpbmRleCA9IGZyb21JbmRleCArIChmcm9tUmlnaHQgPyAwIDogLTEpO1xuXG4gIHdoaWxlICgoZnJvbVJpZ2h0ID8gaW5kZXgtLSA6ICsraW5kZXggPCBsZW5ndGgpKSB7XG4gICAgdmFyIG90aGVyID0gYXJyYXlbaW5kZXhdO1xuICAgIGlmIChvdGhlciAhPT0gb3RoZXIpIHtcbiAgICAgIHJldHVybiBpbmRleDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIC0xO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGluZGV4T2ZOYU47XG4iLCIvKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gY2hlY2sgb2JqZWN0cyBmb3Igb3duIHByb3BlcnRpZXMuICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBJbml0aWFsaXplcyBhbiBhcnJheSBjbG9uZS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIGNsb25lLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBpbml0aWFsaXplZCBjbG9uZS5cbiAqL1xuZnVuY3Rpb24gaW5pdENsb25lQXJyYXkoYXJyYXkpIHtcbiAgdmFyIGxlbmd0aCA9IGFycmF5Lmxlbmd0aCxcbiAgICAgIHJlc3VsdCA9IG5ldyBhcnJheS5jb25zdHJ1Y3RvcihsZW5ndGgpO1xuXG4gIC8vIEFkZCBhcnJheSBwcm9wZXJ0aWVzIGFzc2lnbmVkIGJ5IGBSZWdFeHAjZXhlY2AuXG4gIGlmIChsZW5ndGggJiYgdHlwZW9mIGFycmF5WzBdID09ICdzdHJpbmcnICYmIGhhc093blByb3BlcnR5LmNhbGwoYXJyYXksICdpbmRleCcpKSB7XG4gICAgcmVzdWx0LmluZGV4ID0gYXJyYXkuaW5kZXg7XG4gICAgcmVzdWx0LmlucHV0ID0gYXJyYXkuaW5wdXQ7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpbml0Q2xvbmVBcnJheTtcbiIsInZhciBidWZmZXJDbG9uZSA9IHJlcXVpcmUoJy4vYnVmZmVyQ2xvbmUnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGJvb2xUYWcgPSAnW29iamVjdCBCb29sZWFuXScsXG4gICAgZGF0ZVRhZyA9ICdbb2JqZWN0IERhdGVdJyxcbiAgICBudW1iZXJUYWcgPSAnW29iamVjdCBOdW1iZXJdJyxcbiAgICByZWdleHBUYWcgPSAnW29iamVjdCBSZWdFeHBdJyxcbiAgICBzdHJpbmdUYWcgPSAnW29iamVjdCBTdHJpbmddJztcblxudmFyIGFycmF5QnVmZmVyVGFnID0gJ1tvYmplY3QgQXJyYXlCdWZmZXJdJyxcbiAgICBmbG9hdDMyVGFnID0gJ1tvYmplY3QgRmxvYXQzMkFycmF5XScsXG4gICAgZmxvYXQ2NFRhZyA9ICdbb2JqZWN0IEZsb2F0NjRBcnJheV0nLFxuICAgIGludDhUYWcgPSAnW29iamVjdCBJbnQ4QXJyYXldJyxcbiAgICBpbnQxNlRhZyA9ICdbb2JqZWN0IEludDE2QXJyYXldJyxcbiAgICBpbnQzMlRhZyA9ICdbb2JqZWN0IEludDMyQXJyYXldJyxcbiAgICB1aW50OFRhZyA9ICdbb2JqZWN0IFVpbnQ4QXJyYXldJyxcbiAgICB1aW50OENsYW1wZWRUYWcgPSAnW29iamVjdCBVaW50OENsYW1wZWRBcnJheV0nLFxuICAgIHVpbnQxNlRhZyA9ICdbb2JqZWN0IFVpbnQxNkFycmF5XScsXG4gICAgdWludDMyVGFnID0gJ1tvYmplY3QgVWludDMyQXJyYXldJztcblxuLyoqIFVzZWQgdG8gbWF0Y2ggYFJlZ0V4cGAgZmxhZ3MgZnJvbSB0aGVpciBjb2VyY2VkIHN0cmluZyB2YWx1ZXMuICovXG52YXIgcmVGbGFncyA9IC9cXHcqJC87XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgVWludDhBcnJheSA9IGdsb2JhbC5VaW50OEFycmF5O1xuXG4vKiogVXNlZCB0byBsb29rdXAgYSB0eXBlIGFycmF5IGNvbnN0cnVjdG9ycyBieSBgdG9TdHJpbmdUYWdgLiAqL1xudmFyIGN0b3JCeVRhZyA9IHt9O1xuY3RvckJ5VGFnW2Zsb2F0MzJUYWddID0gZ2xvYmFsLkZsb2F0MzJBcnJheTtcbmN0b3JCeVRhZ1tmbG9hdDY0VGFnXSA9IGdsb2JhbC5GbG9hdDY0QXJyYXk7XG5jdG9yQnlUYWdbaW50OFRhZ10gPSBnbG9iYWwuSW50OEFycmF5O1xuY3RvckJ5VGFnW2ludDE2VGFnXSA9IGdsb2JhbC5JbnQxNkFycmF5O1xuY3RvckJ5VGFnW2ludDMyVGFnXSA9IGdsb2JhbC5JbnQzMkFycmF5O1xuY3RvckJ5VGFnW3VpbnQ4VGFnXSA9IFVpbnQ4QXJyYXk7XG5jdG9yQnlUYWdbdWludDhDbGFtcGVkVGFnXSA9IGdsb2JhbC5VaW50OENsYW1wZWRBcnJheTtcbmN0b3JCeVRhZ1t1aW50MTZUYWddID0gZ2xvYmFsLlVpbnQxNkFycmF5O1xuY3RvckJ5VGFnW3VpbnQzMlRhZ10gPSBnbG9iYWwuVWludDMyQXJyYXk7XG5cbi8qKlxuICogSW5pdGlhbGl6ZXMgYW4gb2JqZWN0IGNsb25lIGJhc2VkIG9uIGl0cyBgdG9TdHJpbmdUYWdgLlxuICpcbiAqICoqTm90ZToqKiBUaGlzIGZ1bmN0aW9uIG9ubHkgc3VwcG9ydHMgY2xvbmluZyB2YWx1ZXMgd2l0aCB0YWdzIG9mXG4gKiBgQm9vbGVhbmAsIGBEYXRlYCwgYEVycm9yYCwgYE51bWJlcmAsIGBSZWdFeHBgLCBvciBgU3RyaW5nYC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGNsb25lLlxuICogQHBhcmFtIHtzdHJpbmd9IHRhZyBUaGUgYHRvU3RyaW5nVGFnYCBvZiB0aGUgb2JqZWN0IHRvIGNsb25lLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNEZWVwXSBTcGVjaWZ5IGEgZGVlcCBjbG9uZS5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgdGhlIGluaXRpYWxpemVkIGNsb25lLlxuICovXG5mdW5jdGlvbiBpbml0Q2xvbmVCeVRhZyhvYmplY3QsIHRhZywgaXNEZWVwKSB7XG4gIHZhciBDdG9yID0gb2JqZWN0LmNvbnN0cnVjdG9yO1xuICBzd2l0Y2ggKHRhZykge1xuICAgIGNhc2UgYXJyYXlCdWZmZXJUYWc6XG4gICAgICByZXR1cm4gYnVmZmVyQ2xvbmUob2JqZWN0KTtcblxuICAgIGNhc2UgYm9vbFRhZzpcbiAgICBjYXNlIGRhdGVUYWc6XG4gICAgICByZXR1cm4gbmV3IEN0b3IoK29iamVjdCk7XG5cbiAgICBjYXNlIGZsb2F0MzJUYWc6IGNhc2UgZmxvYXQ2NFRhZzpcbiAgICBjYXNlIGludDhUYWc6IGNhc2UgaW50MTZUYWc6IGNhc2UgaW50MzJUYWc6XG4gICAgY2FzZSB1aW50OFRhZzogY2FzZSB1aW50OENsYW1wZWRUYWc6IGNhc2UgdWludDE2VGFnOiBjYXNlIHVpbnQzMlRhZzpcbiAgICAgIC8vIFNhZmFyaSA1IG1vYmlsZSBpbmNvcnJlY3RseSBoYXMgYE9iamVjdGAgYXMgdGhlIGNvbnN0cnVjdG9yIG9mIHR5cGVkIGFycmF5cy5cbiAgICAgIGlmIChDdG9yIGluc3RhbmNlb2YgQ3Rvcikge1xuICAgICAgICBDdG9yID0gY3RvckJ5VGFnW3RhZ107XG4gICAgICB9XG4gICAgICB2YXIgYnVmZmVyID0gb2JqZWN0LmJ1ZmZlcjtcbiAgICAgIHJldHVybiBuZXcgQ3Rvcihpc0RlZXAgPyBidWZmZXJDbG9uZShidWZmZXIpIDogYnVmZmVyLCBvYmplY3QuYnl0ZU9mZnNldCwgb2JqZWN0Lmxlbmd0aCk7XG5cbiAgICBjYXNlIG51bWJlclRhZzpcbiAgICBjYXNlIHN0cmluZ1RhZzpcbiAgICAgIHJldHVybiBuZXcgQ3RvcihvYmplY3QpO1xuXG4gICAgY2FzZSByZWdleHBUYWc6XG4gICAgICB2YXIgcmVzdWx0ID0gbmV3IEN0b3Iob2JqZWN0LnNvdXJjZSwgcmVGbGFncy5leGVjKG9iamVjdCkpO1xuICAgICAgcmVzdWx0Lmxhc3RJbmRleCA9IG9iamVjdC5sYXN0SW5kZXg7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpbml0Q2xvbmVCeVRhZztcbiIsIi8qKlxuICogSW5pdGlhbGl6ZXMgYW4gb2JqZWN0IGNsb25lLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gY2xvbmUuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIHRoZSBpbml0aWFsaXplZCBjbG9uZS5cbiAqL1xuZnVuY3Rpb24gaW5pdENsb25lT2JqZWN0KG9iamVjdCkge1xuICB2YXIgQ3RvciA9IG9iamVjdC5jb25zdHJ1Y3RvcjtcbiAgaWYgKCEodHlwZW9mIEN0b3IgPT0gJ2Z1bmN0aW9uJyAmJiBDdG9yIGluc3RhbmNlb2YgQ3RvcikpIHtcbiAgICBDdG9yID0gT2JqZWN0O1xuICB9XG4gIHJldHVybiBuZXcgQ3Rvcjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpbml0Q2xvbmVPYmplY3Q7XG4iLCJ2YXIgZ2V0TGVuZ3RoID0gcmVxdWlyZSgnLi9nZXRMZW5ndGgnKSxcbiAgICBpc0xlbmd0aCA9IHJlcXVpcmUoJy4vaXNMZW5ndGgnKTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhcnJheS1saWtlLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGFycmF5LWxpa2UsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNBcnJheUxpa2UodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlICE9IG51bGwgJiYgaXNMZW5ndGgoZ2V0TGVuZ3RoKHZhbHVlKSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcnJheUxpa2U7XG4iLCIvKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgaG9zdCBvYmplY3QgaW4gSUUgPCA5LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgaG9zdCBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqL1xudmFyIGlzSG9zdE9iamVjdCA9IChmdW5jdGlvbigpIHtcbiAgdHJ5IHtcbiAgICBPYmplY3QoeyAndG9TdHJpbmcnOiAwIH0gKyAnJyk7XG4gIH0gY2F0Y2goZSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHsgcmV0dXJuIGZhbHNlOyB9O1xuICB9XG4gIHJldHVybiBmdW5jdGlvbih2YWx1ZSkge1xuICAgIC8vIElFIDwgOSBwcmVzZW50cyBtYW55IGhvc3Qgb2JqZWN0cyBhcyBgT2JqZWN0YCBvYmplY3RzIHRoYXQgY2FuIGNvZXJjZVxuICAgIC8vIHRvIHN0cmluZ3MgZGVzcGl0ZSBoYXZpbmcgaW1wcm9wZXJseSBkZWZpbmVkIGB0b1N0cmluZ2AgbWV0aG9kcy5cbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlLnRvU3RyaW5nICE9ICdmdW5jdGlvbicgJiYgdHlwZW9mICh2YWx1ZSArICcnKSA9PSAnc3RyaW5nJztcbiAgfTtcbn0oKSk7XG5cbm1vZHVsZS5leHBvcnRzID0gaXNIb3N0T2JqZWN0O1xuIiwiLyoqIFVzZWQgdG8gZGV0ZWN0IHVuc2lnbmVkIGludGVnZXIgdmFsdWVzLiAqL1xudmFyIHJlSXNVaW50ID0gL15cXGQrJC87XG5cbi8qKlxuICogVXNlZCBhcyB0aGUgW21heGltdW0gbGVuZ3RoXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1udW1iZXIubWF4X3NhZmVfaW50ZWdlcilcbiAqIG9mIGFuIGFycmF5LWxpa2UgdmFsdWUuXG4gKi9cbnZhciBNQVhfU0FGRV9JTlRFR0VSID0gOTAwNzE5OTI1NDc0MDk5MTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIHZhbGlkIGFycmF5LWxpa2UgaW5kZXguXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHBhcmFtIHtudW1iZXJ9IFtsZW5ndGg9TUFYX1NBRkVfSU5URUdFUl0gVGhlIHVwcGVyIGJvdW5kcyBvZiBhIHZhbGlkIGluZGV4LlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSB2YWxpZCBpbmRleCwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBpc0luZGV4KHZhbHVlLCBsZW5ndGgpIHtcbiAgdmFsdWUgPSAodHlwZW9mIHZhbHVlID09ICdudW1iZXInIHx8IHJlSXNVaW50LnRlc3QodmFsdWUpKSA/ICt2YWx1ZSA6IC0xO1xuICBsZW5ndGggPSBsZW5ndGggPT0gbnVsbCA/IE1BWF9TQUZFX0lOVEVHRVIgOiBsZW5ndGg7XG4gIHJldHVybiB2YWx1ZSA+IC0xICYmIHZhbHVlICUgMSA9PSAwICYmIHZhbHVlIDwgbGVuZ3RoO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzSW5kZXg7XG4iLCJ2YXIgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuL2lzQXJyYXlMaWtlJyksXG4gICAgaXNJbmRleCA9IHJlcXVpcmUoJy4vaXNJbmRleCcpLFxuICAgIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi4vbGFuZy9pc09iamVjdCcpO1xuXG4vKipcbiAqIENoZWNrcyBpZiB0aGUgcHJvdmlkZWQgYXJndW1lbnRzIGFyZSBmcm9tIGFuIGl0ZXJhdGVlIGNhbGwuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHBvdGVudGlhbCBpdGVyYXRlZSB2YWx1ZSBhcmd1bWVudC5cbiAqIEBwYXJhbSB7Kn0gaW5kZXggVGhlIHBvdGVudGlhbCBpdGVyYXRlZSBpbmRleCBvciBrZXkgYXJndW1lbnQuXG4gKiBAcGFyYW0geyp9IG9iamVjdCBUaGUgcG90ZW50aWFsIGl0ZXJhdGVlIG9iamVjdCBhcmd1bWVudC5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYXJndW1lbnRzIGFyZSBmcm9tIGFuIGl0ZXJhdGVlIGNhbGwsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNJdGVyYXRlZUNhbGwodmFsdWUsIGluZGV4LCBvYmplY3QpIHtcbiAgaWYgKCFpc09iamVjdChvYmplY3QpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHZhciB0eXBlID0gdHlwZW9mIGluZGV4O1xuICBpZiAodHlwZSA9PSAnbnVtYmVyJ1xuICAgICAgPyAoaXNBcnJheUxpa2Uob2JqZWN0KSAmJiBpc0luZGV4KGluZGV4LCBvYmplY3QubGVuZ3RoKSlcbiAgICAgIDogKHR5cGUgPT0gJ3N0cmluZycgJiYgaW5kZXggaW4gb2JqZWN0KSkge1xuICAgIHZhciBvdGhlciA9IG9iamVjdFtpbmRleF07XG4gICAgcmV0dXJuIHZhbHVlID09PSB2YWx1ZSA/ICh2YWx1ZSA9PT0gb3RoZXIpIDogKG90aGVyICE9PSBvdGhlcik7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzSXRlcmF0ZWVDYWxsO1xuIiwidmFyIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKSxcbiAgICB0b09iamVjdCA9IHJlcXVpcmUoJy4vdG9PYmplY3QnKTtcblxuLyoqIFVzZWQgdG8gbWF0Y2ggcHJvcGVydHkgbmFtZXMgd2l0aGluIHByb3BlcnR5IHBhdGhzLiAqL1xudmFyIHJlSXNEZWVwUHJvcCA9IC9cXC58XFxbKD86W15bXFxdXSp8KFtcIiddKSg/Oig/IVxcMSlbXlxcblxcXFxdfFxcXFwuKSo/XFwxKVxcXS8sXG4gICAgcmVJc1BsYWluUHJvcCA9IC9eXFx3KiQvO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgcHJvcGVydHkgbmFtZSBhbmQgbm90IGEgcHJvcGVydHkgcGF0aC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcGFyYW0ge09iamVjdH0gW29iamVjdF0gVGhlIG9iamVjdCB0byBxdWVyeSBrZXlzIG9uLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSBwcm9wZXJ0eSBuYW1lLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzS2V5KHZhbHVlLCBvYmplY3QpIHtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gIGlmICgodHlwZSA9PSAnc3RyaW5nJyAmJiByZUlzUGxhaW5Qcm9wLnRlc3QodmFsdWUpKSB8fCB0eXBlID09ICdudW1iZXInKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHZhciByZXN1bHQgPSAhcmVJc0RlZXBQcm9wLnRlc3QodmFsdWUpO1xuICByZXR1cm4gcmVzdWx0IHx8IChvYmplY3QgIT0gbnVsbCAmJiB2YWx1ZSBpbiB0b09iamVjdChvYmplY3QpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0tleTtcbiIsIi8qKlxuICogVXNlZCBhcyB0aGUgW21heGltdW0gbGVuZ3RoXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1udW1iZXIubWF4X3NhZmVfaW50ZWdlcilcbiAqIG9mIGFuIGFycmF5LWxpa2UgdmFsdWUuXG4gKi9cbnZhciBNQVhfU0FGRV9JTlRFR0VSID0gOTAwNzE5OTI1NDc0MDk5MTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIHZhbGlkIGFycmF5LWxpa2UgbGVuZ3RoLlxuICpcbiAqICoqTm90ZToqKiBUaGlzIGZ1bmN0aW9uIGlzIGJhc2VkIG9uIFtgVG9MZW5ndGhgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy10b2xlbmd0aCkuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSB2YWxpZCBsZW5ndGgsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNMZW5ndGgodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJyAmJiB2YWx1ZSA+IC0xICYmIHZhbHVlICUgMSA9PSAwICYmIHZhbHVlIDw9IE1BWF9TQUZFX0lOVEVHRVI7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNMZW5ndGg7XG4iLCIvKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0TGlrZSh2YWx1ZSkge1xuICByZXR1cm4gISF2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCc7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNPYmplY3RMaWtlO1xuIiwidmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnLi4vbGFuZy9pc09iamVjdCcpO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIHN1aXRhYmxlIGZvciBzdHJpY3QgZXF1YWxpdHkgY29tcGFyaXNvbnMsIGkuZS4gYD09PWAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaWYgc3VpdGFibGUgZm9yIHN0cmljdFxuICogIGVxdWFsaXR5IGNvbXBhcmlzb25zLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzU3RyaWN0Q29tcGFyYWJsZSh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgPT09IHZhbHVlICYmICFpc09iamVjdCh2YWx1ZSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNTdHJpY3RDb21wYXJhYmxlO1xuIiwidmFyIGlzQXJndW1lbnRzID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FyZ3VtZW50cycpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKSxcbiAgICBpc0luZGV4ID0gcmVxdWlyZSgnLi9pc0luZGV4JyksXG4gICAgaXNMZW5ndGggPSByZXF1aXJlKCcuL2lzTGVuZ3RoJyksXG4gICAgaXNTdHJpbmcgPSByZXF1aXJlKCcuLi9sYW5nL2lzU3RyaW5nJyksXG4gICAga2V5c0luID0gcmVxdWlyZSgnLi4vb2JqZWN0L2tleXNJbicpO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gY2hlY2sgb2JqZWN0cyBmb3Igb3duIHByb3BlcnRpZXMuICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBBIGZhbGxiYWNrIGltcGxlbWVudGF0aW9uIG9mIGBPYmplY3Qua2V5c2Agd2hpY2ggY3JlYXRlcyBhbiBhcnJheSBvZiB0aGVcbiAqIG93biBlbnVtZXJhYmxlIHByb3BlcnR5IG5hbWVzIG9mIGBvYmplY3RgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gcXVlcnkuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgdGhlIGFycmF5IG9mIHByb3BlcnR5IG5hbWVzLlxuICovXG5mdW5jdGlvbiBzaGltS2V5cyhvYmplY3QpIHtcbiAgdmFyIHByb3BzID0ga2V5c0luKG9iamVjdCksXG4gICAgICBwcm9wc0xlbmd0aCA9IHByb3BzLmxlbmd0aCxcbiAgICAgIGxlbmd0aCA9IHByb3BzTGVuZ3RoICYmIG9iamVjdC5sZW5ndGg7XG5cbiAgdmFyIGFsbG93SW5kZXhlcyA9ICEhbGVuZ3RoICYmIGlzTGVuZ3RoKGxlbmd0aCkgJiZcbiAgICAoaXNBcnJheShvYmplY3QpIHx8IGlzQXJndW1lbnRzKG9iamVjdCkgfHwgaXNTdHJpbmcob2JqZWN0KSk7XG5cbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICByZXN1bHQgPSBbXTtcblxuICB3aGlsZSAoKytpbmRleCA8IHByb3BzTGVuZ3RoKSB7XG4gICAgdmFyIGtleSA9IHByb3BzW2luZGV4XTtcbiAgICBpZiAoKGFsbG93SW5kZXhlcyAmJiBpc0luZGV4KGtleSwgbGVuZ3RoKSkgfHwgaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIGtleSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gc2hpbUtleXM7XG4iLCIvKipcbiAqIEFuIGltcGxlbWVudGF0aW9uIG9mIGBfLnVuaXFgIG9wdGltaXplZCBmb3Igc29ydGVkIGFycmF5cyB3aXRob3V0IHN1cHBvcnRcbiAqIGZvciBjYWxsYmFjayBzaG9ydGhhbmRzIGFuZCBgdGhpc2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIGluc3BlY3QuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbaXRlcmF0ZWVdIFRoZSBmdW5jdGlvbiBpbnZva2VkIHBlciBpdGVyYXRpb24uXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgdGhlIG5ldyBkdXBsaWNhdGUgZnJlZSBhcnJheS5cbiAqL1xuZnVuY3Rpb24gc29ydGVkVW5pcShhcnJheSwgaXRlcmF0ZWUpIHtcbiAgdmFyIHNlZW4sXG4gICAgICBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gYXJyYXkubGVuZ3RoLFxuICAgICAgcmVzSW5kZXggPSAtMSxcbiAgICAgIHJlc3VsdCA9IFtdO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgdmFyIHZhbHVlID0gYXJyYXlbaW5kZXhdLFxuICAgICAgICBjb21wdXRlZCA9IGl0ZXJhdGVlID8gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBhcnJheSkgOiB2YWx1ZTtcblxuICAgIGlmICghaW5kZXggfHwgc2VlbiAhPT0gY29tcHV0ZWQpIHtcbiAgICAgIHNlZW4gPSBjb21wdXRlZDtcbiAgICAgIHJlc3VsdFsrK3Jlc0luZGV4XSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHNvcnRlZFVuaXE7XG4iLCJ2YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuLi9sYW5nL2lzT2JqZWN0JyksXG4gICAgaXNTdHJpbmcgPSByZXF1aXJlKCcuLi9sYW5nL2lzU3RyaW5nJyksXG4gICAgc3VwcG9ydCA9IHJlcXVpcmUoJy4uL3N1cHBvcnQnKTtcblxuLyoqXG4gKiBDb252ZXJ0cyBgdmFsdWVgIHRvIGFuIG9iamVjdCBpZiBpdCdzIG5vdCBvbmUuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHByb2Nlc3MuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIHRoZSBvYmplY3QuXG4gKi9cbmZ1bmN0aW9uIHRvT2JqZWN0KHZhbHVlKSB7XG4gIGlmIChzdXBwb3J0LnVuaW5kZXhlZENoYXJzICYmIGlzU3RyaW5nKHZhbHVlKSkge1xuICAgIHZhciBpbmRleCA9IC0xLFxuICAgICAgICBsZW5ndGggPSB2YWx1ZS5sZW5ndGgsXG4gICAgICAgIHJlc3VsdCA9IE9iamVjdCh2YWx1ZSk7XG5cbiAgICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgICAgcmVzdWx0W2luZGV4XSA9IHZhbHVlLmNoYXJBdChpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbiAgcmV0dXJuIGlzT2JqZWN0KHZhbHVlKSA/IHZhbHVlIDogT2JqZWN0KHZhbHVlKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB0b09iamVjdDtcbiIsInZhciBiYXNlVG9TdHJpbmcgPSByZXF1aXJlKCcuL2Jhc2VUb1N0cmluZycpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKTtcblxuLyoqIFVzZWQgdG8gbWF0Y2ggcHJvcGVydHkgbmFtZXMgd2l0aGluIHByb3BlcnR5IHBhdGhzLiAqL1xudmFyIHJlUHJvcE5hbWUgPSAvW14uW1xcXV0rfFxcWyg/OigtP1xcZCsoPzpcXC5cXGQrKT8pfChbXCInXSkoKD86KD8hXFwyKVteXFxuXFxcXF18XFxcXC4pKj8pXFwyKVxcXS9nO1xuXG4vKiogVXNlZCB0byBtYXRjaCBiYWNrc2xhc2hlcyBpbiBwcm9wZXJ0eSBwYXRocy4gKi9cbnZhciByZUVzY2FwZUNoYXIgPSAvXFxcXChcXFxcKT8vZztcblxuLyoqXG4gKiBDb252ZXJ0cyBgdmFsdWVgIHRvIHByb3BlcnR5IHBhdGggYXJyYXkgaWYgaXQncyBub3Qgb25lLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBwcm9jZXNzLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBwcm9wZXJ0eSBwYXRoIGFycmF5LlxuICovXG5mdW5jdGlvbiB0b1BhdGgodmFsdWUpIHtcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHZhciByZXN1bHQgPSBbXTtcbiAgYmFzZVRvU3RyaW5nKHZhbHVlKS5yZXBsYWNlKHJlUHJvcE5hbWUsIGZ1bmN0aW9uKG1hdGNoLCBudW1iZXIsIHF1b3RlLCBzdHJpbmcpIHtcbiAgICByZXN1bHQucHVzaChxdW90ZSA/IHN0cmluZy5yZXBsYWNlKHJlRXNjYXBlQ2hhciwgJyQxJykgOiAobnVtYmVyIHx8IG1hdGNoKSk7XG4gIH0pO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHRvUGF0aDtcbiIsInZhciBiYXNlQ2xvbmUgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iYXNlQ2xvbmUnKSxcbiAgICBiaW5kQ2FsbGJhY2sgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9iaW5kQ2FsbGJhY2snKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgZGVlcCBjbG9uZSBvZiBgdmFsdWVgLiBJZiBgY3VzdG9taXplcmAgaXMgcHJvdmlkZWQgaXQncyBpbnZva2VkXG4gKiB0byBwcm9kdWNlIHRoZSBjbG9uZWQgdmFsdWVzLiBJZiBgY3VzdG9taXplcmAgcmV0dXJucyBgdW5kZWZpbmVkYCBjbG9uaW5nXG4gKiBpcyBoYW5kbGVkIGJ5IHRoZSBtZXRob2QgaW5zdGVhZC4gVGhlIGBjdXN0b21pemVyYCBpcyBib3VuZCB0byBgdGhpc0FyZ2BcbiAqIGFuZCBpbnZva2VkIHdpdGggdXAgdG8gdGhyZWUgYXJndW1lbnQ7ICh2YWx1ZSBbLCBpbmRleHxrZXksIG9iamVjdF0pLlxuICpcbiAqICoqTm90ZToqKiBUaGlzIG1ldGhvZCBpcyBsb29zZWx5IGJhc2VkIG9uIHRoZVxuICogW3N0cnVjdHVyZWQgY2xvbmUgYWxnb3JpdGhtXShodHRwOi8vd3d3LnczLm9yZy9UUi9odG1sNS9pbmZyYXN0cnVjdHVyZS5odG1sI2ludGVybmFsLXN0cnVjdHVyZWQtY2xvbmluZy1hbGdvcml0aG0pLlxuICogVGhlIGVudW1lcmFibGUgcHJvcGVydGllcyBvZiBgYXJndW1lbnRzYCBvYmplY3RzIGFuZCBvYmplY3RzIGNyZWF0ZWQgYnlcbiAqIGNvbnN0cnVjdG9ycyBvdGhlciB0aGFuIGBPYmplY3RgIGFyZSBjbG9uZWQgdG8gcGxhaW4gYE9iamVjdGAgb2JqZWN0cy4gQW5cbiAqIGVtcHR5IG9iamVjdCBpcyByZXR1cm5lZCBmb3IgdW5jbG9uZWFibGUgdmFsdWVzIHN1Y2ggYXMgZnVuY3Rpb25zLCBET00gbm9kZXMsXG4gKiBNYXBzLCBTZXRzLCBhbmQgV2Vha01hcHMuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBkZWVwIGNsb25lLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2N1c3RvbWl6ZXJdIFRoZSBmdW5jdGlvbiB0byBjdXN0b21pemUgY2xvbmluZyB2YWx1ZXMuXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGN1c3RvbWl6ZXJgLlxuICogQHJldHVybnMgeyp9IFJldHVybnMgdGhlIGRlZXAgY2xvbmVkIHZhbHVlLlxuICogQGV4YW1wbGVcbiAqXG4gKiB2YXIgdXNlcnMgPSBbXG4gKiAgIHsgJ3VzZXInOiAnYmFybmV5JyB9LFxuICogICB7ICd1c2VyJzogJ2ZyZWQnIH1cbiAqIF07XG4gKlxuICogdmFyIGRlZXAgPSBfLmNsb25lRGVlcCh1c2Vycyk7XG4gKiBkZWVwWzBdID09PSB1c2Vyc1swXTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogLy8gdXNpbmcgYSBjdXN0b21pemVyIGNhbGxiYWNrXG4gKiB2YXIgZWwgPSBfLmNsb25lRGVlcChkb2N1bWVudC5ib2R5LCBmdW5jdGlvbih2YWx1ZSkge1xuICogICBpZiAoXy5pc0VsZW1lbnQodmFsdWUpKSB7XG4gKiAgICAgcmV0dXJuIHZhbHVlLmNsb25lTm9kZSh0cnVlKTtcbiAqICAgfVxuICogfSk7XG4gKlxuICogZWwgPT09IGRvY3VtZW50LmJvZHlcbiAqIC8vID0+IGZhbHNlXG4gKiBlbC5ub2RlTmFtZVxuICogLy8gPT4gQk9EWVxuICogZWwuY2hpbGROb2Rlcy5sZW5ndGg7XG4gKiAvLyA9PiAyMFxuICovXG5mdW5jdGlvbiBjbG9uZURlZXAodmFsdWUsIGN1c3RvbWl6ZXIsIHRoaXNBcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBjdXN0b21pemVyID09ICdmdW5jdGlvbidcbiAgICA/IGJhc2VDbG9uZSh2YWx1ZSwgdHJ1ZSwgYmluZENhbGxiYWNrKGN1c3RvbWl6ZXIsIHRoaXNBcmcsIDMpKVxuICAgIDogYmFzZUNsb25lKHZhbHVlLCB0cnVlKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjbG9uZURlZXA7XG4iLCJ2YXIgaXNBcnJheUxpa2UgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc0FycmF5TGlrZScpLFxuICAgIGlzT2JqZWN0TGlrZSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzT2JqZWN0TGlrZScpO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gY2hlY2sgb2JqZWN0cyBmb3Igb3duIHByb3BlcnRpZXMuICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqIE5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBwcm9wZXJ0eUlzRW51bWVyYWJsZSA9IG9iamVjdFByb3RvLnByb3BlcnR5SXNFbnVtZXJhYmxlO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGNsYXNzaWZpZWQgYXMgYW4gYGFyZ3VtZW50c2Agb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzQXJndW1lbnRzKGZ1bmN0aW9uKCkgeyByZXR1cm4gYXJndW1lbnRzOyB9KCkpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNBcmd1bWVudHMoWzEsIDIsIDNdKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzQXJndW1lbnRzKHZhbHVlKSB7XG4gIHJldHVybiBpc09iamVjdExpa2UodmFsdWUpICYmIGlzQXJyYXlMaWtlKHZhbHVlKSAmJlxuICAgIGhhc093blByb3BlcnR5LmNhbGwodmFsdWUsICdjYWxsZWUnKSAmJiAhcHJvcGVydHlJc0VudW1lcmFibGUuY2FsbCh2YWx1ZSwgJ2NhbGxlZScpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQXJndW1lbnRzO1xuIiwidmFyIGdldE5hdGl2ZSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2dldE5hdGl2ZScpLFxuICAgIGlzTGVuZ3RoID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNMZW5ndGgnKSxcbiAgICBpc09iamVjdExpa2UgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc09iamVjdExpa2UnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGFycmF5VGFnID0gJ1tvYmplY3QgQXJyYXldJztcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZSBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG9ialRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qIE5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyBmb3IgdGhvc2Ugd2l0aCB0aGUgc2FtZSBuYW1lIGFzIG90aGVyIGBsb2Rhc2hgIG1ldGhvZHMuICovXG52YXIgbmF0aXZlSXNBcnJheSA9IGdldE5hdGl2ZShBcnJheSwgJ2lzQXJyYXknKTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBjbGFzc2lmaWVkIGFzIGFuIGBBcnJheWAgb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzQXJyYXkoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzQXJyYXkoZnVuY3Rpb24oKSB7IHJldHVybiBhcmd1bWVudHM7IH0oKSk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG52YXIgaXNBcnJheSA9IG5hdGl2ZUlzQXJyYXkgfHwgZnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0TGlrZSh2YWx1ZSkgJiYgaXNMZW5ndGgodmFsdWUubGVuZ3RoKSAmJiBvYmpUb1N0cmluZy5jYWxsKHZhbHVlKSA9PSBhcnJheVRhZztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcnJheTtcbiIsInZhciBpc09iamVjdExpa2UgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc09iamVjdExpa2UnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGJvb2xUYWcgPSAnW29iamVjdCBCb29sZWFuXSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKipcbiAqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBvYmpUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGNsYXNzaWZpZWQgYXMgYSBib29sZWFuIHByaW1pdGl2ZSBvciBvYmplY3QuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGNvcnJlY3RseSBjbGFzc2lmaWVkLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNCb29sZWFuKGZhbHNlKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzQm9vbGVhbihudWxsKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzQm9vbGVhbih2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgPT09IHRydWUgfHwgdmFsdWUgPT09IGZhbHNlIHx8IChpc09iamVjdExpa2UodmFsdWUpICYmIG9ialRvU3RyaW5nLmNhbGwodmFsdWUpID09IGJvb2xUYWcpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQm9vbGVhbjtcbiIsInZhciBpc09iamVjdExpa2UgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc09iamVjdExpa2UnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGRhdGVUYWcgPSAnW29iamVjdCBEYXRlXSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKipcbiAqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBvYmpUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGNsYXNzaWZpZWQgYXMgYSBgRGF0ZWAgb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzRGF0ZShuZXcgRGF0ZSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc0RhdGUoJ01vbiBBcHJpbCAyMyAyMDEyJyk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc0RhdGUodmFsdWUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0TGlrZSh2YWx1ZSkgJiYgb2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gZGF0ZVRhZztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0RhdGU7XG4iLCIvKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgZm9yIHRob3NlIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzLiAqL1xudmFyIG5hdGl2ZUlzRmluaXRlID0gZ2xvYmFsLmlzRmluaXRlO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgZmluaXRlIHByaW1pdGl2ZSBudW1iZXIuXG4gKlxuICogKipOb3RlOioqIFRoaXMgbWV0aG9kIGlzIGJhc2VkIG9uIFtgTnVtYmVyLmlzRmluaXRlYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtbnVtYmVyLmlzZmluaXRlKS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSBmaW5pdGUgbnVtYmVyLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNGaW5pdGUoMTApO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNGaW5pdGUoJzEwJyk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNGaW5pdGUodHJ1ZSk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNGaW5pdGUoT2JqZWN0KDEwKSk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNGaW5pdGUoSW5maW5pdHkpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNGaW5pdGUodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJyAmJiBuYXRpdmVJc0Zpbml0ZSh2YWx1ZSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNGaW5pdGU7XG4iLCJ2YXIgaXNPYmplY3QgPSByZXF1aXJlKCcuL2lzT2JqZWN0Jyk7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBmdW5jVGFnID0gJ1tvYmplY3QgRnVuY3Rpb25dJztcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZSBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG9ialRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhIGBGdW5jdGlvbmAgb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzRnVuY3Rpb24oXyk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc0Z1bmN0aW9uKC9hYmMvKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsdWUpIHtcbiAgLy8gVGhlIHVzZSBvZiBgT2JqZWN0I3RvU3RyaW5nYCBhdm9pZHMgaXNzdWVzIHdpdGggdGhlIGB0eXBlb2ZgIG9wZXJhdG9yXG4gIC8vIGluIG9sZGVyIHZlcnNpb25zIG9mIENocm9tZSBhbmQgU2FmYXJpIHdoaWNoIHJldHVybiAnZnVuY3Rpb24nIGZvciByZWdleGVzXG4gIC8vIGFuZCBTYWZhcmkgOCB3aGljaCByZXR1cm5zICdvYmplY3QnIGZvciB0eXBlZCBhcnJheSBjb25zdHJ1Y3RvcnMuXG4gIHJldHVybiBpc09iamVjdCh2YWx1ZSkgJiYgb2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gZnVuY1RhZztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0Z1bmN0aW9uO1xuIiwidmFyIGlzRnVuY3Rpb24gPSByZXF1aXJlKCcuL2lzRnVuY3Rpb24nKSxcbiAgICBpc0hvc3RPYmplY3QgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc0hvc3RPYmplY3QnKSxcbiAgICBpc09iamVjdExpa2UgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc09iamVjdExpa2UnKTtcblxuLyoqIFVzZWQgdG8gZGV0ZWN0IGhvc3QgY29uc3RydWN0b3JzIChTYWZhcmkgPiA1KS4gKi9cbnZhciByZUlzSG9zdEN0b3IgPSAvXlxcW29iamVjdCAuKz9Db25zdHJ1Y3RvclxcXSQvO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgZGVjb21waWxlZCBzb3VyY2Ugb2YgZnVuY3Rpb25zLiAqL1xudmFyIGZuVG9TdHJpbmcgPSBGdW5jdGlvbi5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBpZiBhIG1ldGhvZCBpcyBuYXRpdmUuICovXG52YXIgcmVJc05hdGl2ZSA9IFJlZ0V4cCgnXicgK1xuICBmblRvU3RyaW5nLmNhbGwoaGFzT3duUHJvcGVydHkpLnJlcGxhY2UoL1tcXFxcXiQuKis/KClbXFxde318XS9nLCAnXFxcXCQmJylcbiAgLnJlcGxhY2UoL2hhc093blByb3BlcnR5fChmdW5jdGlvbikuKj8oPz1cXFxcXFwoKXwgZm9yIC4rPyg/PVxcXFxcXF0pL2csICckMS4qPycpICsgJyQnXG4pO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgbmF0aXZlIGZ1bmN0aW9uLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIG5hdGl2ZSBmdW5jdGlvbiwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzTmF0aXZlKEFycmF5LnByb3RvdHlwZS5wdXNoKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzTmF0aXZlKF8pO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNOYXRpdmUodmFsdWUpIHtcbiAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgcmV0dXJuIHJlSXNOYXRpdmUudGVzdChmblRvU3RyaW5nLmNhbGwodmFsdWUpKTtcbiAgfVxuICByZXR1cm4gaXNPYmplY3RMaWtlKHZhbHVlKSAmJiAoaXNIb3N0T2JqZWN0KHZhbHVlKSA/IHJlSXNOYXRpdmUgOiByZUlzSG9zdEN0b3IpLnRlc3QodmFsdWUpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzTmF0aXZlO1xuIiwiLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBgbnVsbGAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGBudWxsYCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzTnVsbChudWxsKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzTnVsbCh2b2lkIDApO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNOdWxsKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSA9PT0gbnVsbDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc051bGw7XG4iLCJ2YXIgaXNPYmplY3RMaWtlID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNPYmplY3RMaWtlJyk7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBudW1iZXJUYWcgPSAnW29iamVjdCBOdW1iZXJdJztcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZSBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG9ialRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhIGBOdW1iZXJgIHByaW1pdGl2ZSBvciBvYmplY3QuXG4gKlxuICogKipOb3RlOioqIFRvIGV4Y2x1ZGUgYEluZmluaXR5YCwgYC1JbmZpbml0eWAsIGFuZCBgTmFOYCwgd2hpY2ggYXJlIGNsYXNzaWZpZWRcbiAqIGFzIG51bWJlcnMsIHVzZSB0aGUgYF8uaXNGaW5pdGVgIG1ldGhvZC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgY29ycmVjdGx5IGNsYXNzaWZpZWQsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc051bWJlcig4LjQpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNOdW1iZXIoTmFOKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzTnVtYmVyKCc4LjQnKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzTnVtYmVyKHZhbHVlKSB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicgfHwgKGlzT2JqZWN0TGlrZSh2YWx1ZSkgJiYgb2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gbnVtYmVyVGFnKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc051bWJlcjtcbiIsIi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgdGhlIFtsYW5ndWFnZSB0eXBlXShodHRwczovL2VzNS5naXRodWIuaW8vI3g4KSBvZiBgT2JqZWN0YC5cbiAqIChlLmcuIGFycmF5cywgZnVuY3Rpb25zLCBvYmplY3RzLCByZWdleGVzLCBgbmV3IE51bWJlcigwKWAsIGFuZCBgbmV3IFN0cmluZygnJylgKVxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhbiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc09iamVjdCh7fSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoMSk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xuICAvLyBBdm9pZCBhIFY4IEpJVCBidWcgaW4gQ2hyb21lIDE5LTIwLlxuICAvLyBTZWUgaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC92OC9pc3N1ZXMvZGV0YWlsP2lkPTIyOTEgZm9yIG1vcmUgZGV0YWlscy5cbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gIHJldHVybiAhIXZhbHVlICYmICh0eXBlID09ICdvYmplY3QnIHx8IHR5cGUgPT0gJ2Z1bmN0aW9uJyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNPYmplY3Q7XG4iLCJ2YXIgYmFzZUZvckluID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZUZvckluJyksXG4gICAgaXNBcmd1bWVudHMgPSByZXF1aXJlKCcuL2lzQXJndW1lbnRzJyksXG4gICAgaXNIb3N0T2JqZWN0ID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNIb3N0T2JqZWN0JyksXG4gICAgaXNPYmplY3RMaWtlID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNPYmplY3RMaWtlJyksXG4gICAgc3VwcG9ydCA9IHJlcXVpcmUoJy4uL3N1cHBvcnQnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFRhZyA9ICdbb2JqZWN0IE9iamVjdF0nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gY2hlY2sgb2JqZWN0cyBmb3Igb3duIHByb3BlcnRpZXMuICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlIFtgdG9TdHJpbmdUYWdgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1vYmplY3QucHJvdG90eXBlLnRvc3RyaW5nKVxuICogb2YgdmFsdWVzLlxuICovXG52YXIgb2JqVG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIHBsYWluIG9iamVjdCwgdGhhdCBpcywgYW4gb2JqZWN0IGNyZWF0ZWQgYnkgdGhlXG4gKiBgT2JqZWN0YCBjb25zdHJ1Y3RvciBvciBvbmUgd2l0aCBhIGBbW1Byb3RvdHlwZV1dYCBvZiBgbnVsbGAuXG4gKlxuICogKipOb3RlOioqIFRoaXMgbWV0aG9kIGFzc3VtZXMgb2JqZWN0cyBjcmVhdGVkIGJ5IHRoZSBgT2JqZWN0YCBjb25zdHJ1Y3RvclxuICogaGF2ZSBubyBpbmhlcml0ZWQgZW51bWVyYWJsZSBwcm9wZXJ0aWVzLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIHBsYWluIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBmdW5jdGlvbiBGb28oKSB7XG4gKiAgIHRoaXMuYSA9IDE7XG4gKiB9XG4gKlxuICogXy5pc1BsYWluT2JqZWN0KG5ldyBGb28pO1xuICogLy8gPT4gZmFsc2VcbiAqXG4gKiBfLmlzUGxhaW5PYmplY3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc1BsYWluT2JqZWN0KHsgJ3gnOiAwLCAneSc6IDAgfSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc1BsYWluT2JqZWN0KE9iamVjdC5jcmVhdGUobnVsbCkpO1xuICogLy8gPT4gdHJ1ZVxuICovXG5mdW5jdGlvbiBpc1BsYWluT2JqZWN0KHZhbHVlKSB7XG4gIHZhciBDdG9yO1xuXG4gIC8vIEV4aXQgZWFybHkgZm9yIG5vbiBgT2JqZWN0YCBvYmplY3RzLlxuICBpZiAoIShpc09iamVjdExpa2UodmFsdWUpICYmIG9ialRvU3RyaW5nLmNhbGwodmFsdWUpID09IG9iamVjdFRhZyAmJiAhaXNIb3N0T2JqZWN0KHZhbHVlKSAmJiAhaXNBcmd1bWVudHModmFsdWUpKSB8fFxuICAgICAgKCFoYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCAnY29uc3RydWN0b3InKSAmJiAoQ3RvciA9IHZhbHVlLmNvbnN0cnVjdG9yLCB0eXBlb2YgQ3RvciA9PSAnZnVuY3Rpb24nICYmICEoQ3RvciBpbnN0YW5jZW9mIEN0b3IpKSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy8gSUUgPCA5IGl0ZXJhdGVzIGluaGVyaXRlZCBwcm9wZXJ0aWVzIGJlZm9yZSBvd24gcHJvcGVydGllcy4gSWYgdGhlIGZpcnN0XG4gIC8vIGl0ZXJhdGVkIHByb3BlcnR5IGlzIGFuIG9iamVjdCdzIG93biBwcm9wZXJ0eSB0aGVuIHRoZXJlIGFyZSBubyBpbmhlcml0ZWRcbiAgLy8gZW51bWVyYWJsZSBwcm9wZXJ0aWVzLlxuICB2YXIgcmVzdWx0O1xuICBpZiAoc3VwcG9ydC5vd25MYXN0KSB7XG4gICAgYmFzZUZvckluKHZhbHVlLCBmdW5jdGlvbihzdWJWYWx1ZSwga2V5LCBvYmplY3QpIHtcbiAgICAgIHJlc3VsdCA9IGhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBrZXkpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQgIT09IGZhbHNlO1xuICB9XG4gIC8vIEluIG1vc3QgZW52aXJvbm1lbnRzIGFuIG9iamVjdCdzIG93biBwcm9wZXJ0aWVzIGFyZSBpdGVyYXRlZCBiZWZvcmVcbiAgLy8gaXRzIGluaGVyaXRlZCBwcm9wZXJ0aWVzLiBJZiB0aGUgbGFzdCBpdGVyYXRlZCBwcm9wZXJ0eSBpcyBhbiBvYmplY3Qnc1xuICAvLyBvd24gcHJvcGVydHkgdGhlbiB0aGVyZSBhcmUgbm8gaW5oZXJpdGVkIGVudW1lcmFibGUgcHJvcGVydGllcy5cbiAgYmFzZUZvckluKHZhbHVlLCBmdW5jdGlvbihzdWJWYWx1ZSwga2V5KSB7XG4gICAgcmVzdWx0ID0ga2V5O1xuICB9KTtcbiAgcmV0dXJuIHJlc3VsdCA9PT0gdW5kZWZpbmVkIHx8IGhhc093blByb3BlcnR5LmNhbGwodmFsdWUsIHJlc3VsdCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNQbGFpbk9iamVjdDtcbiIsInZhciBpc09iamVjdExpa2UgPSByZXF1aXJlKCcuLi9pbnRlcm5hbC9pc09iamVjdExpa2UnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIHN0cmluZ1RhZyA9ICdbb2JqZWN0IFN0cmluZ10nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlIFtgdG9TdHJpbmdUYWdgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1vYmplY3QucHJvdG90eXBlLnRvc3RyaW5nKVxuICogb2YgdmFsdWVzLlxuICovXG52YXIgb2JqVG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBjbGFzc2lmaWVkIGFzIGEgYFN0cmluZ2AgcHJpbWl0aXZlIG9yIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgY29ycmVjdGx5IGNsYXNzaWZpZWQsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc1N0cmluZygnYWJjJyk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc1N0cmluZygxKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzU3RyaW5nKHZhbHVlKSB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT0gJ3N0cmluZycgfHwgKGlzT2JqZWN0TGlrZSh2YWx1ZSkgJiYgb2JqVG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gc3RyaW5nVGFnKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc1N0cmluZztcbiIsInZhciBpc0xlbmd0aCA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzTGVuZ3RoJyksXG4gICAgaXNPYmplY3RMaWtlID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNPYmplY3RMaWtlJyk7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgcmVmZXJlbmNlcy4gKi9cbnZhciBhcmdzVGFnID0gJ1tvYmplY3QgQXJndW1lbnRzXScsXG4gICAgYXJyYXlUYWcgPSAnW29iamVjdCBBcnJheV0nLFxuICAgIGJvb2xUYWcgPSAnW29iamVjdCBCb29sZWFuXScsXG4gICAgZGF0ZVRhZyA9ICdbb2JqZWN0IERhdGVdJyxcbiAgICBlcnJvclRhZyA9ICdbb2JqZWN0IEVycm9yXScsXG4gICAgZnVuY1RhZyA9ICdbb2JqZWN0IEZ1bmN0aW9uXScsXG4gICAgbWFwVGFnID0gJ1tvYmplY3QgTWFwXScsXG4gICAgbnVtYmVyVGFnID0gJ1tvYmplY3QgTnVtYmVyXScsXG4gICAgb2JqZWN0VGFnID0gJ1tvYmplY3QgT2JqZWN0XScsXG4gICAgcmVnZXhwVGFnID0gJ1tvYmplY3QgUmVnRXhwXScsXG4gICAgc2V0VGFnID0gJ1tvYmplY3QgU2V0XScsXG4gICAgc3RyaW5nVGFnID0gJ1tvYmplY3QgU3RyaW5nXScsXG4gICAgd2Vha01hcFRhZyA9ICdbb2JqZWN0IFdlYWtNYXBdJztcblxudmFyIGFycmF5QnVmZmVyVGFnID0gJ1tvYmplY3QgQXJyYXlCdWZmZXJdJyxcbiAgICBmbG9hdDMyVGFnID0gJ1tvYmplY3QgRmxvYXQzMkFycmF5XScsXG4gICAgZmxvYXQ2NFRhZyA9ICdbb2JqZWN0IEZsb2F0NjRBcnJheV0nLFxuICAgIGludDhUYWcgPSAnW29iamVjdCBJbnQ4QXJyYXldJyxcbiAgICBpbnQxNlRhZyA9ICdbb2JqZWN0IEludDE2QXJyYXldJyxcbiAgICBpbnQzMlRhZyA9ICdbb2JqZWN0IEludDMyQXJyYXldJyxcbiAgICB1aW50OFRhZyA9ICdbb2JqZWN0IFVpbnQ4QXJyYXldJyxcbiAgICB1aW50OENsYW1wZWRUYWcgPSAnW29iamVjdCBVaW50OENsYW1wZWRBcnJheV0nLFxuICAgIHVpbnQxNlRhZyA9ICdbb2JqZWN0IFVpbnQxNkFycmF5XScsXG4gICAgdWludDMyVGFnID0gJ1tvYmplY3QgVWludDMyQXJyYXldJztcblxuLyoqIFVzZWQgdG8gaWRlbnRpZnkgYHRvU3RyaW5nVGFnYCB2YWx1ZXMgb2YgdHlwZWQgYXJyYXlzLiAqL1xudmFyIHR5cGVkQXJyYXlUYWdzID0ge307XG50eXBlZEFycmF5VGFnc1tmbG9hdDMyVGFnXSA9IHR5cGVkQXJyYXlUYWdzW2Zsb2F0NjRUYWddID1cbnR5cGVkQXJyYXlUYWdzW2ludDhUYWddID0gdHlwZWRBcnJheVRhZ3NbaW50MTZUYWddID1cbnR5cGVkQXJyYXlUYWdzW2ludDMyVGFnXSA9IHR5cGVkQXJyYXlUYWdzW3VpbnQ4VGFnXSA9XG50eXBlZEFycmF5VGFnc1t1aW50OENsYW1wZWRUYWddID0gdHlwZWRBcnJheVRhZ3NbdWludDE2VGFnXSA9XG50eXBlZEFycmF5VGFnc1t1aW50MzJUYWddID0gdHJ1ZTtcbnR5cGVkQXJyYXlUYWdzW2FyZ3NUYWddID0gdHlwZWRBcnJheVRhZ3NbYXJyYXlUYWddID1cbnR5cGVkQXJyYXlUYWdzW2FycmF5QnVmZmVyVGFnXSA9IHR5cGVkQXJyYXlUYWdzW2Jvb2xUYWddID1cbnR5cGVkQXJyYXlUYWdzW2RhdGVUYWddID0gdHlwZWRBcnJheVRhZ3NbZXJyb3JUYWddID1cbnR5cGVkQXJyYXlUYWdzW2Z1bmNUYWddID0gdHlwZWRBcnJheVRhZ3NbbWFwVGFnXSA9XG50eXBlZEFycmF5VGFnc1tudW1iZXJUYWddID0gdHlwZWRBcnJheVRhZ3Nbb2JqZWN0VGFnXSA9XG50eXBlZEFycmF5VGFnc1tyZWdleHBUYWddID0gdHlwZWRBcnJheVRhZ3Nbc2V0VGFnXSA9XG50eXBlZEFycmF5VGFnc1tzdHJpbmdUYWddID0gdHlwZWRBcnJheVRhZ3Nbd2Vha01hcFRhZ10gPSBmYWxzZTtcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZSBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG9ialRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhIHR5cGVkIGFycmF5LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzVHlwZWRBcnJheShuZXcgVWludDhBcnJheSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc1R5cGVkQXJyYXkoW10pO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNUeXBlZEFycmF5KHZhbHVlKSB7XG4gIHJldHVybiBpc09iamVjdExpa2UodmFsdWUpICYmIGlzTGVuZ3RoKHZhbHVlLmxlbmd0aCkgJiYgISF0eXBlZEFycmF5VGFnc1tvYmpUb1N0cmluZy5jYWxsKHZhbHVlKV07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNUeXBlZEFycmF5O1xuIiwiLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBgdW5kZWZpbmVkYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYHVuZGVmaW5lZGAsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc1VuZGVmaW5lZCh2b2lkIDApO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNVbmRlZmluZWQobnVsbCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc1VuZGVmaW5lZCh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgPT09IHVuZGVmaW5lZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc1VuZGVmaW5lZDtcbiIsInZhciBiYXNlR2V0ID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZUdldCcpLFxuICAgIGJhc2VTbGljZSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2Jhc2VTbGljZScpLFxuICAgIGlzQXJndW1lbnRzID0gcmVxdWlyZSgnLi4vbGFuZy9pc0FyZ3VtZW50cycpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJyYXknKSxcbiAgICBpc0luZGV4ID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNJbmRleCcpLFxuICAgIGlzS2V5ID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNLZXknKSxcbiAgICBpc0xlbmd0aCA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzTGVuZ3RoJyksXG4gICAgaXNTdHJpbmcgPSByZXF1aXJlKCcuLi9sYW5nL2lzU3RyaW5nJyksXG4gICAgbGFzdCA9IHJlcXVpcmUoJy4uL2FycmF5L2xhc3QnKSxcbiAgICB0b1BhdGggPSByZXF1aXJlKCcuLi9pbnRlcm5hbC90b1BhdGgnKTtcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIGNoZWNrIG9iamVjdHMgZm9yIG93biBwcm9wZXJ0aWVzLiAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGBwYXRoYCBpcyBhIGRpcmVjdCBwcm9wZXJ0eS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdFxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHBhcmFtIHtBcnJheXxzdHJpbmd9IHBhdGggVGhlIHBhdGggdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHBhdGhgIGlzIGEgZGlyZWN0IHByb3BlcnR5LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBvYmplY3QgPSB7ICdhJzogeyAnYic6IHsgJ2MnOiAzIH0gfSB9O1xuICpcbiAqIF8uaGFzKG9iamVjdCwgJ2EnKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmhhcyhvYmplY3QsICdhLmIuYycpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaGFzKG9iamVjdCwgWydhJywgJ2InLCAnYyddKTtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaGFzKG9iamVjdCwgcGF0aCkge1xuICBpZiAob2JqZWN0ID09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdmFyIHJlc3VsdCA9IGhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBwYXRoKTtcbiAgaWYgKCFyZXN1bHQgJiYgIWlzS2V5KHBhdGgpKSB7XG4gICAgcGF0aCA9IHRvUGF0aChwYXRoKTtcbiAgICBvYmplY3QgPSBwYXRoLmxlbmd0aCA9PSAxID8gb2JqZWN0IDogYmFzZUdldChvYmplY3QsIGJhc2VTbGljZShwYXRoLCAwLCAtMSkpO1xuICAgIGlmIChvYmplY3QgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBwYXRoID0gbGFzdChwYXRoKTtcbiAgICByZXN1bHQgPSBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iamVjdCwgcGF0aCk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdCB8fCAoaXNMZW5ndGgob2JqZWN0Lmxlbmd0aCkgJiYgaXNJbmRleChwYXRoLCBvYmplY3QubGVuZ3RoKSAmJlxuICAgIChpc0FycmF5KG9iamVjdCkgfHwgaXNBcmd1bWVudHMob2JqZWN0KSB8fCBpc1N0cmluZyhvYmplY3QpKSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaGFzO1xuIiwidmFyIGdldE5hdGl2ZSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2dldE5hdGl2ZScpLFxuICAgIGlzQXJyYXlMaWtlID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNBcnJheUxpa2UnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4uL2xhbmcvaXNPYmplY3QnKSxcbiAgICBzaGltS2V5cyA9IHJlcXVpcmUoJy4uL2ludGVybmFsL3NoaW1LZXlzJyksXG4gICAgc3VwcG9ydCA9IHJlcXVpcmUoJy4uL3N1cHBvcnQnKTtcblxuLyogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzIGZvciB0aG9zZSB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgb3RoZXIgYGxvZGFzaGAgbWV0aG9kcy4gKi9cbnZhciBuYXRpdmVLZXlzID0gZ2V0TmF0aXZlKE9iamVjdCwgJ2tleXMnKTtcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHRoZSBvd24gZW51bWVyYWJsZSBwcm9wZXJ0eSBuYW1lcyBvZiBgb2JqZWN0YC5cbiAqXG4gKiAqKk5vdGU6KiogTm9uLW9iamVjdCB2YWx1ZXMgYXJlIGNvZXJjZWQgdG8gb2JqZWN0cy4gU2VlIHRoZVxuICogW0VTIHNwZWNdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW9iamVjdC5rZXlzKVxuICogZm9yIG1vcmUgZGV0YWlscy5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdFxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBhcnJheSBvZiBwcm9wZXJ0eSBuYW1lcy5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gRm9vKCkge1xuICogICB0aGlzLmEgPSAxO1xuICogICB0aGlzLmIgPSAyO1xuICogfVxuICpcbiAqIEZvby5wcm90b3R5cGUuYyA9IDM7XG4gKlxuICogXy5rZXlzKG5ldyBGb28pO1xuICogLy8gPT4gWydhJywgJ2InXSAoaXRlcmF0aW9uIG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkKVxuICpcbiAqIF8ua2V5cygnaGknKTtcbiAqIC8vID0+IFsnMCcsICcxJ11cbiAqL1xudmFyIGtleXMgPSAhbmF0aXZlS2V5cyA/IHNoaW1LZXlzIDogZnVuY3Rpb24ob2JqZWN0KSB7XG4gIHZhciBDdG9yID0gb2JqZWN0ID09IG51bGwgPyB1bmRlZmluZWQgOiBvYmplY3QuY29uc3RydWN0b3I7XG4gIGlmICgodHlwZW9mIEN0b3IgPT0gJ2Z1bmN0aW9uJyAmJiBDdG9yLnByb3RvdHlwZSA9PT0gb2JqZWN0KSB8fFxuICAgICAgKHR5cGVvZiBvYmplY3QgPT0gJ2Z1bmN0aW9uJyA/IHN1cHBvcnQuZW51bVByb3RvdHlwZXMgOiBpc0FycmF5TGlrZShvYmplY3QpKSkge1xuICAgIHJldHVybiBzaGltS2V5cyhvYmplY3QpO1xuICB9XG4gIHJldHVybiBpc09iamVjdChvYmplY3QpID8gbmF0aXZlS2V5cyhvYmplY3QpIDogW107XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGtleXM7XG4iLCJ2YXIgYXJyYXlFYWNoID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYXJyYXlFYWNoJyksXG4gICAgaXNBcmd1bWVudHMgPSByZXF1aXJlKCcuLi9sYW5nL2lzQXJndW1lbnRzJyksXG4gICAgaXNBcnJheSA9IHJlcXVpcmUoJy4uL2xhbmcvaXNBcnJheScpLFxuICAgIGlzRnVuY3Rpb24gPSByZXF1aXJlKCcuLi9sYW5nL2lzRnVuY3Rpb24nKSxcbiAgICBpc0luZGV4ID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNJbmRleCcpLFxuICAgIGlzTGVuZ3RoID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvaXNMZW5ndGgnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4uL2xhbmcvaXNPYmplY3QnKSxcbiAgICBpc1N0cmluZyA9IHJlcXVpcmUoJy4uL2xhbmcvaXNTdHJpbmcnKSxcbiAgICBzdXBwb3J0ID0gcmVxdWlyZSgnLi4vc3VwcG9ydCcpO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHJlZmVyZW5jZXMuICovXG52YXIgYXJyYXlUYWcgPSAnW29iamVjdCBBcnJheV0nLFxuICAgIGJvb2xUYWcgPSAnW29iamVjdCBCb29sZWFuXScsXG4gICAgZGF0ZVRhZyA9ICdbb2JqZWN0IERhdGVdJyxcbiAgICBlcnJvclRhZyA9ICdbb2JqZWN0IEVycm9yXScsXG4gICAgZnVuY1RhZyA9ICdbb2JqZWN0IEZ1bmN0aW9uXScsXG4gICAgbnVtYmVyVGFnID0gJ1tvYmplY3QgTnVtYmVyXScsXG4gICAgb2JqZWN0VGFnID0gJ1tvYmplY3QgT2JqZWN0XScsXG4gICAgcmVnZXhwVGFnID0gJ1tvYmplY3QgUmVnRXhwXScsXG4gICAgc3RyaW5nVGFnID0gJ1tvYmplY3QgU3RyaW5nXSc7XG5cbi8qKiBVc2VkIHRvIGZpeCB0aGUgSlNjcmlwdCBgW1tEb250RW51bV1dYCBidWcuICovXG52YXIgc2hhZG93UHJvcHMgPSBbXG4gICdjb25zdHJ1Y3RvcicsICdoYXNPd25Qcm9wZXJ0eScsICdpc1Byb3RvdHlwZU9mJywgJ3Byb3BlcnR5SXNFbnVtZXJhYmxlJyxcbiAgJ3RvTG9jYWxlU3RyaW5nJywgJ3RvU3RyaW5nJywgJ3ZhbHVlT2YnXG5dO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIGVycm9yUHJvdG8gPSBFcnJvci5wcm90b3R5cGUsXG4gICAgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlLFxuICAgIHN0cmluZ1Byb3RvID0gU3RyaW5nLnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gY2hlY2sgb2JqZWN0cyBmb3Igb3duIHByb3BlcnRpZXMuICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlIFtgdG9TdHJpbmdUYWdgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1vYmplY3QucHJvdG90eXBlLnRvc3RyaW5nKVxuICogb2YgdmFsdWVzLlxuICovXG52YXIgb2JqVG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqIFVzZWQgdG8gYXZvaWQgaXRlcmF0aW5nIG92ZXIgbm9uLWVudW1lcmFibGUgcHJvcGVydGllcyBpbiBJRSA8IDkuICovXG52YXIgbm9uRW51bVByb3BzID0ge307XG5ub25FbnVtUHJvcHNbYXJyYXlUYWddID0gbm9uRW51bVByb3BzW2RhdGVUYWddID0gbm9uRW51bVByb3BzW251bWJlclRhZ10gPSB7ICdjb25zdHJ1Y3Rvcic6IHRydWUsICd0b0xvY2FsZVN0cmluZyc6IHRydWUsICd0b1N0cmluZyc6IHRydWUsICd2YWx1ZU9mJzogdHJ1ZSB9O1xubm9uRW51bVByb3BzW2Jvb2xUYWddID0gbm9uRW51bVByb3BzW3N0cmluZ1RhZ10gPSB7ICdjb25zdHJ1Y3Rvcic6IHRydWUsICd0b1N0cmluZyc6IHRydWUsICd2YWx1ZU9mJzogdHJ1ZSB9O1xubm9uRW51bVByb3BzW2Vycm9yVGFnXSA9IG5vbkVudW1Qcm9wc1tmdW5jVGFnXSA9IG5vbkVudW1Qcm9wc1tyZWdleHBUYWddID0geyAnY29uc3RydWN0b3InOiB0cnVlLCAndG9TdHJpbmcnOiB0cnVlIH07XG5ub25FbnVtUHJvcHNbb2JqZWN0VGFnXSA9IHsgJ2NvbnN0cnVjdG9yJzogdHJ1ZSB9O1xuXG5hcnJheUVhY2goc2hhZG93UHJvcHMsIGZ1bmN0aW9uKGtleSkge1xuICBmb3IgKHZhciB0YWcgaW4gbm9uRW51bVByb3BzKSB7XG4gICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwobm9uRW51bVByb3BzLCB0YWcpKSB7XG4gICAgICB2YXIgcHJvcHMgPSBub25FbnVtUHJvcHNbdGFnXTtcbiAgICAgIHByb3BzW2tleV0gPSBoYXNPd25Qcm9wZXJ0eS5jYWxsKHByb3BzLCBrZXkpO1xuICAgIH1cbiAgfVxufSk7XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBhcnJheSBvZiB0aGUgb3duIGFuZCBpbmhlcml0ZWQgZW51bWVyYWJsZSBwcm9wZXJ0eSBuYW1lcyBvZiBgb2JqZWN0YC5cbiAqXG4gKiAqKk5vdGU6KiogTm9uLW9iamVjdCB2YWx1ZXMgYXJlIGNvZXJjZWQgdG8gb2JqZWN0cy5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdFxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBhcnJheSBvZiBwcm9wZXJ0eSBuYW1lcy5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gRm9vKCkge1xuICogICB0aGlzLmEgPSAxO1xuICogICB0aGlzLmIgPSAyO1xuICogfVxuICpcbiAqIEZvby5wcm90b3R5cGUuYyA9IDM7XG4gKlxuICogXy5rZXlzSW4obmV3IEZvbyk7XG4gKiAvLyA9PiBbJ2EnLCAnYicsICdjJ10gKGl0ZXJhdGlvbiBvcmRlciBpcyBub3QgZ3VhcmFudGVlZClcbiAqL1xuZnVuY3Rpb24ga2V5c0luKG9iamVjdCkge1xuICBpZiAob2JqZWN0ID09IG51bGwpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgaWYgKCFpc09iamVjdChvYmplY3QpKSB7XG4gICAgb2JqZWN0ID0gT2JqZWN0KG9iamVjdCk7XG4gIH1cbiAgdmFyIGxlbmd0aCA9IG9iamVjdC5sZW5ndGg7XG5cbiAgbGVuZ3RoID0gKGxlbmd0aCAmJiBpc0xlbmd0aChsZW5ndGgpICYmXG4gICAgKGlzQXJyYXkob2JqZWN0KSB8fCBpc0FyZ3VtZW50cyhvYmplY3QpIHx8IGlzU3RyaW5nKG9iamVjdCkpICYmIGxlbmd0aCkgfHwgMDtcblxuICB2YXIgQ3RvciA9IG9iamVjdC5jb25zdHJ1Y3RvcixcbiAgICAgIGluZGV4ID0gLTEsXG4gICAgICBwcm90byA9IChpc0Z1bmN0aW9uKEN0b3IpICYmIEN0b3IucHJvdG90eXBlKSB8fCBvYmplY3RQcm90byxcbiAgICAgIGlzUHJvdG8gPSBwcm90byA9PT0gb2JqZWN0LFxuICAgICAgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKSxcbiAgICAgIHNraXBJbmRleGVzID0gbGVuZ3RoID4gMCxcbiAgICAgIHNraXBFcnJvclByb3BzID0gc3VwcG9ydC5lbnVtRXJyb3JQcm9wcyAmJiAob2JqZWN0ID09PSBlcnJvclByb3RvIHx8IG9iamVjdCBpbnN0YW5jZW9mIEVycm9yKSxcbiAgICAgIHNraXBQcm90byA9IHN1cHBvcnQuZW51bVByb3RvdHlwZXMgJiYgaXNGdW5jdGlvbihvYmplY3QpO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgcmVzdWx0W2luZGV4XSA9IChpbmRleCArICcnKTtcbiAgfVxuICAvLyBsb2Rhc2ggc2tpcHMgdGhlIGBjb25zdHJ1Y3RvcmAgcHJvcGVydHkgd2hlbiBpdCBpbmZlcnMgaXQncyBpdGVyYXRpbmdcbiAgLy8gb3ZlciBhIGBwcm90b3R5cGVgIG9iamVjdCBiZWNhdXNlIElFIDwgOSBjYW4ndCBzZXQgdGhlIGBbW0VudW1lcmFibGVdXWBcbiAgLy8gYXR0cmlidXRlIG9mIGFuIGV4aXN0aW5nIHByb3BlcnR5IGFuZCB0aGUgYGNvbnN0cnVjdG9yYCBwcm9wZXJ0eSBvZiBhXG4gIC8vIHByb3RvdHlwZSBkZWZhdWx0cyB0byBub24tZW51bWVyYWJsZS5cbiAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgIGlmICghKHNraXBQcm90byAmJiBrZXkgPT0gJ3Byb3RvdHlwZScpICYmXG4gICAgICAgICEoc2tpcEVycm9yUHJvcHMgJiYgKGtleSA9PSAnbWVzc2FnZScgfHwga2V5ID09ICduYW1lJykpICYmXG4gICAgICAgICEoc2tpcEluZGV4ZXMgJiYgaXNJbmRleChrZXksIGxlbmd0aCkpICYmXG4gICAgICAgICEoa2V5ID09ICdjb25zdHJ1Y3RvcicgJiYgKGlzUHJvdG8gfHwgIWhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBrZXkpKSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIGlmIChzdXBwb3J0Lm5vbkVudW1TaGFkb3dzICYmIG9iamVjdCAhPT0gb2JqZWN0UHJvdG8pIHtcbiAgICB2YXIgdGFnID0gb2JqZWN0ID09PSBzdHJpbmdQcm90byA/IHN0cmluZ1RhZyA6IChvYmplY3QgPT09IGVycm9yUHJvdG8gPyBlcnJvclRhZyA6IG9ialRvU3RyaW5nLmNhbGwob2JqZWN0KSksXG4gICAgICAgIG5vbkVudW1zID0gbm9uRW51bVByb3BzW3RhZ10gfHwgbm9uRW51bVByb3BzW29iamVjdFRhZ107XG5cbiAgICBpZiAodGFnID09IG9iamVjdFRhZykge1xuICAgICAgcHJvdG8gPSBvYmplY3RQcm90bztcbiAgICB9XG4gICAgbGVuZ3RoID0gc2hhZG93UHJvcHMubGVuZ3RoO1xuICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAga2V5ID0gc2hhZG93UHJvcHNbbGVuZ3RoXTtcbiAgICAgIHZhciBub25FbnVtID0gbm9uRW51bXNba2V5XTtcbiAgICAgIGlmICghKGlzUHJvdG8gJiYgbm9uRW51bSkgJiZcbiAgICAgICAgICAobm9uRW51bSA/IGhhc093blByb3BlcnR5LmNhbGwob2JqZWN0LCBrZXkpIDogb2JqZWN0W2tleV0gIT09IHByb3RvW2tleV0pKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ga2V5c0luO1xuIiwidmFyIGtleXMgPSByZXF1aXJlKCcuL2tleXMnKSxcbiAgICB0b09iamVjdCA9IHJlcXVpcmUoJy4uL2ludGVybmFsL3RvT2JqZWN0Jyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIHR3byBkaW1lbnNpb25hbCBhcnJheSBvZiB0aGUga2V5LXZhbHVlIHBhaXJzIGZvciBgb2JqZWN0YCxcbiAqIGUuZy4gYFtba2V5MSwgdmFsdWUxXSwgW2tleTIsIHZhbHVlMl1dYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdFxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIHRoZSBuZXcgYXJyYXkgb2Yga2V5LXZhbHVlIHBhaXJzLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLnBhaXJzKHsgJ2Jhcm5leSc6IDM2LCAnZnJlZCc6IDQwIH0pO1xuICogLy8gPT4gW1snYmFybmV5JywgMzZdLCBbJ2ZyZWQnLCA0MF1dIChpdGVyYXRpb24gb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQpXG4gKi9cbmZ1bmN0aW9uIHBhaXJzKG9iamVjdCkge1xuICBvYmplY3QgPSB0b09iamVjdChvYmplY3QpO1xuXG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgcHJvcHMgPSBrZXlzKG9iamVjdCksXG4gICAgICBsZW5ndGggPSBwcm9wcy5sZW5ndGgsXG4gICAgICByZXN1bHQgPSBBcnJheShsZW5ndGgpO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgdmFyIGtleSA9IHByb3BzW2luZGV4XTtcbiAgICByZXN1bHRbaW5kZXhdID0gW2tleSwgb2JqZWN0W2tleV1dO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcGFpcnM7XG4iLCJ2YXIgaXNJbmRleCA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzSW5kZXgnKSxcbiAgICBpc0tleSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzS2V5JyksXG4gICAgaXNPYmplY3QgPSByZXF1aXJlKCcuLi9sYW5nL2lzT2JqZWN0JyksXG4gICAgdG9QYXRoID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvdG9QYXRoJyk7XG5cbi8qKlxuICogU2V0cyB0aGUgcHJvcGVydHkgdmFsdWUgb2YgYHBhdGhgIG9uIGBvYmplY3RgLiBJZiBhIHBvcnRpb24gb2YgYHBhdGhgXG4gKiBkb2VzIG5vdCBleGlzdCBpdCdzIGNyZWF0ZWQuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBhdWdtZW50LlxuICogQHBhcmFtIHtBcnJheXxzdHJpbmd9IHBhdGggVGhlIHBhdGggb2YgdGhlIHByb3BlcnR5IHRvIHNldC5cbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHNldC5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgYG9iamVjdGAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBvYmplY3QgPSB7ICdhJzogW3sgJ2InOiB7ICdjJzogMyB9IH1dIH07XG4gKlxuICogXy5zZXQob2JqZWN0LCAnYVswXS5iLmMnLCA0KTtcbiAqIGNvbnNvbGUubG9nKG9iamVjdC5hWzBdLmIuYyk7XG4gKiAvLyA9PiA0XG4gKlxuICogXy5zZXQob2JqZWN0LCAneFswXS55LnonLCA1KTtcbiAqIGNvbnNvbGUubG9nKG9iamVjdC54WzBdLnkueik7XG4gKiAvLyA9PiA1XG4gKi9cbmZ1bmN0aW9uIHNldChvYmplY3QsIHBhdGgsIHZhbHVlKSB7XG4gIGlmIChvYmplY3QgPT0gbnVsbCkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cbiAgdmFyIHBhdGhLZXkgPSAocGF0aCArICcnKTtcbiAgcGF0aCA9IChvYmplY3RbcGF0aEtleV0gIT0gbnVsbCB8fCBpc0tleShwYXRoLCBvYmplY3QpKSA/IFtwYXRoS2V5XSA6IHRvUGF0aChwYXRoKTtcblxuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IHBhdGgubGVuZ3RoLFxuICAgICAgbGFzdEluZGV4ID0gbGVuZ3RoIC0gMSxcbiAgICAgIG5lc3RlZCA9IG9iamVjdDtcblxuICB3aGlsZSAobmVzdGVkICE9IG51bGwgJiYgKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHZhciBrZXkgPSBwYXRoW2luZGV4XTtcbiAgICBpZiAoaXNPYmplY3QobmVzdGVkKSkge1xuICAgICAgaWYgKGluZGV4ID09IGxhc3RJbmRleCkge1xuICAgICAgICBuZXN0ZWRba2V5XSA9IHZhbHVlO1xuICAgICAgfSBlbHNlIGlmIChuZXN0ZWRba2V5XSA9PSBudWxsKSB7XG4gICAgICAgIG5lc3RlZFtrZXldID0gaXNJbmRleChwYXRoW2luZGV4ICsgMV0pID8gW10gOiB7fTtcbiAgICAgIH1cbiAgICB9XG4gICAgbmVzdGVkID0gbmVzdGVkW2tleV07XG4gIH1cbiAgcmV0dXJuIG9iamVjdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBzZXQ7XG4iLCIvKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIGFycmF5UHJvdG8gPSBBcnJheS5wcm90b3R5cGUsXG4gICAgZXJyb3JQcm90byA9IEVycm9yLnByb3RvdHlwZSxcbiAgICBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgcHJvcGVydHlJc0VudW1lcmFibGUgPSBvYmplY3RQcm90by5wcm9wZXJ0eUlzRW51bWVyYWJsZSxcbiAgICBzcGxpY2UgPSBhcnJheVByb3RvLnNwbGljZTtcblxuLyoqXG4gKiBBbiBvYmplY3QgZW52aXJvbm1lbnQgZmVhdHVyZSBmbGFncy5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHR5cGUgT2JqZWN0XG4gKi9cbnZhciBzdXBwb3J0ID0ge307XG5cbihmdW5jdGlvbih4KSB7XG4gIHZhciBDdG9yID0gZnVuY3Rpb24oKSB7IHRoaXMueCA9IHg7IH0sXG4gICAgICBvYmplY3QgPSB7ICcwJzogeCwgJ2xlbmd0aCc6IHggfSxcbiAgICAgIHByb3BzID0gW107XG5cbiAgQ3Rvci5wcm90b3R5cGUgPSB7ICd2YWx1ZU9mJzogeCwgJ3knOiB4IH07XG4gIGZvciAodmFyIGtleSBpbiBuZXcgQ3RvcikgeyBwcm9wcy5wdXNoKGtleSk7IH1cblxuICAvKipcbiAgICogRGV0ZWN0IGlmIGBuYW1lYCBvciBgbWVzc2FnZWAgcHJvcGVydGllcyBvZiBgRXJyb3IucHJvdG90eXBlYCBhcmVcbiAgICogZW51bWVyYWJsZSBieSBkZWZhdWx0IChJRSA8IDksIFNhZmFyaSA8IDUuMSkuXG4gICAqXG4gICAqIEBtZW1iZXJPZiBfLnN1cHBvcnRcbiAgICogQHR5cGUgYm9vbGVhblxuICAgKi9cbiAgc3VwcG9ydC5lbnVtRXJyb3JQcm9wcyA9IHByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwoZXJyb3JQcm90bywgJ21lc3NhZ2UnKSB8fFxuICAgIHByb3BlcnR5SXNFbnVtZXJhYmxlLmNhbGwoZXJyb3JQcm90bywgJ25hbWUnKTtcblxuICAvKipcbiAgICogRGV0ZWN0IGlmIGBwcm90b3R5cGVgIHByb3BlcnRpZXMgYXJlIGVudW1lcmFibGUgYnkgZGVmYXVsdC5cbiAgICpcbiAgICogRmlyZWZveCA8IDMuNiwgT3BlcmEgPiA5LjUwIC0gT3BlcmEgPCAxMS42MCwgYW5kIFNhZmFyaSA8IDUuMVxuICAgKiAoaWYgdGhlIHByb3RvdHlwZSBvciBhIHByb3BlcnR5IG9uIHRoZSBwcm90b3R5cGUgaGFzIGJlZW4gc2V0KVxuICAgKiBpbmNvcnJlY3RseSBzZXQgdGhlIGBbW0VudW1lcmFibGVdXWAgdmFsdWUgb2YgYSBmdW5jdGlvbidzIGBwcm90b3R5cGVgXG4gICAqIHByb3BlcnR5IHRvIGB0cnVlYC5cbiAgICpcbiAgICogQG1lbWJlck9mIF8uc3VwcG9ydFxuICAgKiBAdHlwZSBib29sZWFuXG4gICAqL1xuICBzdXBwb3J0LmVudW1Qcm90b3R5cGVzID0gcHJvcGVydHlJc0VudW1lcmFibGUuY2FsbChDdG9yLCAncHJvdG90eXBlJyk7XG5cbiAgLyoqXG4gICAqIERldGVjdCBpZiBwcm9wZXJ0aWVzIHNoYWRvd2luZyB0aG9zZSBvbiBgT2JqZWN0LnByb3RvdHlwZWAgYXJlIG5vbi1lbnVtZXJhYmxlLlxuICAgKlxuICAgKiBJbiBJRSA8IDkgYW4gb2JqZWN0J3Mgb3duIHByb3BlcnRpZXMsIHNoYWRvd2luZyBub24tZW51bWVyYWJsZSBvbmVzLFxuICAgKiBhcmUgbWFkZSBub24tZW51bWVyYWJsZSBhcyB3ZWxsIChhLmsuYSB0aGUgSlNjcmlwdCBgW1tEb250RW51bV1dYCBidWcpLlxuICAgKlxuICAgKiBAbWVtYmVyT2YgXy5zdXBwb3J0XG4gICAqIEB0eXBlIGJvb2xlYW5cbiAgICovXG4gIHN1cHBvcnQubm9uRW51bVNoYWRvd3MgPSAhL3ZhbHVlT2YvLnRlc3QocHJvcHMpO1xuXG4gIC8qKlxuICAgKiBEZXRlY3QgaWYgb3duIHByb3BlcnRpZXMgYXJlIGl0ZXJhdGVkIGFmdGVyIGluaGVyaXRlZCBwcm9wZXJ0aWVzIChJRSA8IDkpLlxuICAgKlxuICAgKiBAbWVtYmVyT2YgXy5zdXBwb3J0XG4gICAqIEB0eXBlIGJvb2xlYW5cbiAgICovXG4gIHN1cHBvcnQub3duTGFzdCA9IHByb3BzWzBdICE9ICd4JztcblxuICAvKipcbiAgICogRGV0ZWN0IGlmIGBBcnJheSNzaGlmdGAgYW5kIGBBcnJheSNzcGxpY2VgIGF1Z21lbnQgYXJyYXktbGlrZSBvYmplY3RzXG4gICAqIGNvcnJlY3RseS5cbiAgICpcbiAgICogRmlyZWZveCA8IDEwLCBjb21wYXRpYmlsaXR5IG1vZGVzIG9mIElFIDgsIGFuZCBJRSA8IDkgaGF2ZSBidWdneSBBcnJheVxuICAgKiBgc2hpZnQoKWAgYW5kIGBzcGxpY2UoKWAgZnVuY3Rpb25zIHRoYXQgZmFpbCB0byByZW1vdmUgdGhlIGxhc3QgZWxlbWVudCxcbiAgICogYHZhbHVlWzBdYCwgb2YgYXJyYXktbGlrZSBvYmplY3RzIGV2ZW4gdGhvdWdoIHRoZSBcImxlbmd0aFwiIHByb3BlcnR5IGlzXG4gICAqIHNldCB0byBgMGAuIFRoZSBgc2hpZnQoKWAgbWV0aG9kIGlzIGJ1Z2d5IGluIGNvbXBhdGliaWxpdHkgbW9kZXMgb2YgSUUgOCxcbiAgICogd2hpbGUgYHNwbGljZSgpYCBpcyBidWdneSByZWdhcmRsZXNzIG9mIG1vZGUgaW4gSUUgPCA5LlxuICAgKlxuICAgKiBAbWVtYmVyT2YgXy5zdXBwb3J0XG4gICAqIEB0eXBlIGJvb2xlYW5cbiAgICovXG4gIHN1cHBvcnQuc3BsaWNlT2JqZWN0cyA9IChzcGxpY2UuY2FsbChvYmplY3QsIDAsIDEpLCAhb2JqZWN0WzBdKTtcblxuICAvKipcbiAgICogRGV0ZWN0IGxhY2sgb2Ygc3VwcG9ydCBmb3IgYWNjZXNzaW5nIHN0cmluZyBjaGFyYWN0ZXJzIGJ5IGluZGV4LlxuICAgKlxuICAgKiBJRSA8IDggY2FuJ3QgYWNjZXNzIGNoYXJhY3RlcnMgYnkgaW5kZXguIElFIDggY2FuIG9ubHkgYWNjZXNzIGNoYXJhY3RlcnNcbiAgICogYnkgaW5kZXggb24gc3RyaW5nIGxpdGVyYWxzLCBub3Qgc3RyaW5nIG9iamVjdHMuXG4gICAqXG4gICAqIEBtZW1iZXJPZiBfLnN1cHBvcnRcbiAgICogQHR5cGUgYm9vbGVhblxuICAgKi9cbiAgc3VwcG9ydC51bmluZGV4ZWRDaGFycyA9ICgneCdbMF0gKyBPYmplY3QoJ3gnKVswXSkgIT0gJ3h4Jztcbn0oMSwgMCkpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHN1cHBvcnQ7XG4iLCIvKipcbiAqIFRoaXMgbWV0aG9kIHJldHVybnMgdGhlIGZpcnN0IGFyZ3VtZW50IHByb3ZpZGVkIHRvIGl0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgVXRpbGl0eVxuICogQHBhcmFtIHsqfSB2YWx1ZSBBbnkgdmFsdWUuXG4gKiBAcmV0dXJucyB7Kn0gUmV0dXJucyBgdmFsdWVgLlxuICogQGV4YW1wbGVcbiAqXG4gKiB2YXIgb2JqZWN0ID0geyAndXNlcic6ICdmcmVkJyB9O1xuICpcbiAqIF8uaWRlbnRpdHkob2JqZWN0KSA9PT0gb2JqZWN0O1xuICogLy8gPT4gdHJ1ZVxuICovXG5mdW5jdGlvbiBpZGVudGl0eSh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaWRlbnRpdHk7XG4iLCJ2YXIgYmFzZVByb3BlcnR5ID0gcmVxdWlyZSgnLi4vaW50ZXJuYWwvYmFzZVByb3BlcnR5JyksXG4gICAgYmFzZVByb3BlcnR5RGVlcCA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2Jhc2VQcm9wZXJ0eURlZXAnKSxcbiAgICBpc0tleSA9IHJlcXVpcmUoJy4uL2ludGVybmFsL2lzS2V5Jyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgcHJvcGVydHkgdmFsdWUgYXQgYHBhdGhgIG9uIGFcbiAqIGdpdmVuIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IFV0aWxpdHlcbiAqIEBwYXJhbSB7QXJyYXl8c3RyaW5nfSBwYXRoIFRoZSBwYXRoIG9mIHRoZSBwcm9wZXJ0eSB0byBnZXQuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqIEBleGFtcGxlXG4gKlxuICogdmFyIG9iamVjdHMgPSBbXG4gKiAgIHsgJ2EnOiB7ICdiJzogeyAnYyc6IDIgfSB9IH0sXG4gKiAgIHsgJ2EnOiB7ICdiJzogeyAnYyc6IDEgfSB9IH1cbiAqIF07XG4gKlxuICogXy5tYXAob2JqZWN0cywgXy5wcm9wZXJ0eSgnYS5iLmMnKSk7XG4gKiAvLyA9PiBbMiwgMV1cbiAqXG4gKiBfLnBsdWNrKF8uc29ydEJ5KG9iamVjdHMsIF8ucHJvcGVydHkoWydhJywgJ2InLCAnYyddKSksICdhLmIuYycpO1xuICogLy8gPT4gWzEsIDJdXG4gKi9cbmZ1bmN0aW9uIHByb3BlcnR5KHBhdGgpIHtcbiAgcmV0dXJuIGlzS2V5KHBhdGgpID8gYmFzZVByb3BlcnR5KHBhdGgpIDogYmFzZVByb3BlcnR5RGVlcChwYXRoKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBwcm9wZXJ0eTtcbiIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcblxudmFyIF90b0RhdGUgPSByZXF1aXJlKCcuL2xpYi90b0RhdGUnKTtcblxudmFyIF90b0RhdGUyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfdG9EYXRlKTtcblxudmFyIF90b0Zsb2F0ID0gcmVxdWlyZSgnLi9saWIvdG9GbG9hdCcpO1xuXG52YXIgX3RvRmxvYXQyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfdG9GbG9hdCk7XG5cbnZhciBfdG9JbnQgPSByZXF1aXJlKCcuL2xpYi90b0ludCcpO1xuXG52YXIgX3RvSW50MiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX3RvSW50KTtcblxudmFyIF90b0Jvb2xlYW4gPSByZXF1aXJlKCcuL2xpYi90b0Jvb2xlYW4nKTtcblxudmFyIF90b0Jvb2xlYW4yID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfdG9Cb29sZWFuKTtcblxudmFyIF9lcXVhbHMgPSByZXF1aXJlKCcuL2xpYi9lcXVhbHMnKTtcblxudmFyIF9lcXVhbHMyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfZXF1YWxzKTtcblxudmFyIF9jb250YWlucyA9IHJlcXVpcmUoJy4vbGliL2NvbnRhaW5zJyk7XG5cbnZhciBfY29udGFpbnMyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfY29udGFpbnMpO1xuXG52YXIgX21hdGNoZXMgPSByZXF1aXJlKCcuL2xpYi9tYXRjaGVzJyk7XG5cbnZhciBfbWF0Y2hlczIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9tYXRjaGVzKTtcblxudmFyIF9pc0VtYWlsID0gcmVxdWlyZSgnLi9saWIvaXNFbWFpbCcpO1xuXG52YXIgX2lzRW1haWwyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNFbWFpbCk7XG5cbnZhciBfaXNVUkwgPSByZXF1aXJlKCcuL2xpYi9pc1VSTCcpO1xuXG52YXIgX2lzVVJMMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzVVJMKTtcblxudmFyIF9pc01BQ0FkZHJlc3MgPSByZXF1aXJlKCcuL2xpYi9pc01BQ0FkZHJlc3MnKTtcblxudmFyIF9pc01BQ0FkZHJlc3MyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNNQUNBZGRyZXNzKTtcblxudmFyIF9pc0lQID0gcmVxdWlyZSgnLi9saWIvaXNJUCcpO1xuXG52YXIgX2lzSVAyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNJUCk7XG5cbnZhciBfaXNGUUROID0gcmVxdWlyZSgnLi9saWIvaXNGUUROJyk7XG5cbnZhciBfaXNGUUROMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzRlFETik7XG5cbnZhciBfaXNCb29sZWFuID0gcmVxdWlyZSgnLi9saWIvaXNCb29sZWFuJyk7XG5cbnZhciBfaXNCb29sZWFuMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzQm9vbGVhbik7XG5cbnZhciBfaXNBbHBoYSA9IHJlcXVpcmUoJy4vbGliL2lzQWxwaGEnKTtcblxudmFyIF9pc0FscGhhMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzQWxwaGEpO1xuXG52YXIgX2lzQWxwaGFudW1lcmljID0gcmVxdWlyZSgnLi9saWIvaXNBbHBoYW51bWVyaWMnKTtcblxudmFyIF9pc0FscGhhbnVtZXJpYzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc0FscGhhbnVtZXJpYyk7XG5cbnZhciBfaXNOdW1lcmljID0gcmVxdWlyZSgnLi9saWIvaXNOdW1lcmljJyk7XG5cbnZhciBfaXNOdW1lcmljMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzTnVtZXJpYyk7XG5cbnZhciBfaXNMb3dlcmNhc2UgPSByZXF1aXJlKCcuL2xpYi9pc0xvd2VyY2FzZScpO1xuXG52YXIgX2lzTG93ZXJjYXNlMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzTG93ZXJjYXNlKTtcblxudmFyIF9pc1VwcGVyY2FzZSA9IHJlcXVpcmUoJy4vbGliL2lzVXBwZXJjYXNlJyk7XG5cbnZhciBfaXNVcHBlcmNhc2UyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNVcHBlcmNhc2UpO1xuXG52YXIgX2lzQXNjaWkgPSByZXF1aXJlKCcuL2xpYi9pc0FzY2lpJyk7XG5cbnZhciBfaXNBc2NpaTIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc0FzY2lpKTtcblxudmFyIF9pc0Z1bGxXaWR0aCA9IHJlcXVpcmUoJy4vbGliL2lzRnVsbFdpZHRoJyk7XG5cbnZhciBfaXNGdWxsV2lkdGgyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNGdWxsV2lkdGgpO1xuXG52YXIgX2lzSGFsZldpZHRoID0gcmVxdWlyZSgnLi9saWIvaXNIYWxmV2lkdGgnKTtcblxudmFyIF9pc0hhbGZXaWR0aDIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc0hhbGZXaWR0aCk7XG5cbnZhciBfaXNWYXJpYWJsZVdpZHRoID0gcmVxdWlyZSgnLi9saWIvaXNWYXJpYWJsZVdpZHRoJyk7XG5cbnZhciBfaXNWYXJpYWJsZVdpZHRoMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzVmFyaWFibGVXaWR0aCk7XG5cbnZhciBfaXNNdWx0aWJ5dGUgPSByZXF1aXJlKCcuL2xpYi9pc011bHRpYnl0ZScpO1xuXG52YXIgX2lzTXVsdGlieXRlMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzTXVsdGlieXRlKTtcblxudmFyIF9pc1N1cnJvZ2F0ZVBhaXIgPSByZXF1aXJlKCcuL2xpYi9pc1N1cnJvZ2F0ZVBhaXInKTtcblxudmFyIF9pc1N1cnJvZ2F0ZVBhaXIyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNTdXJyb2dhdGVQYWlyKTtcblxudmFyIF9pc0ludCA9IHJlcXVpcmUoJy4vbGliL2lzSW50Jyk7XG5cbnZhciBfaXNJbnQyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNJbnQpO1xuXG52YXIgX2lzRmxvYXQgPSByZXF1aXJlKCcuL2xpYi9pc0Zsb2F0Jyk7XG5cbnZhciBfaXNGbG9hdDIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc0Zsb2F0KTtcblxudmFyIF9pc0RlY2ltYWwgPSByZXF1aXJlKCcuL2xpYi9pc0RlY2ltYWwnKTtcblxudmFyIF9pc0RlY2ltYWwyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNEZWNpbWFsKTtcblxudmFyIF9pc0hleGFkZWNpbWFsID0gcmVxdWlyZSgnLi9saWIvaXNIZXhhZGVjaW1hbCcpO1xuXG52YXIgX2lzSGV4YWRlY2ltYWwyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNIZXhhZGVjaW1hbCk7XG5cbnZhciBfaXNEaXZpc2libGVCeSA9IHJlcXVpcmUoJy4vbGliL2lzRGl2aXNpYmxlQnknKTtcblxudmFyIF9pc0RpdmlzaWJsZUJ5MiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzRGl2aXNpYmxlQnkpO1xuXG52YXIgX2lzSGV4Q29sb3IgPSByZXF1aXJlKCcuL2xpYi9pc0hleENvbG9yJyk7XG5cbnZhciBfaXNIZXhDb2xvcjIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc0hleENvbG9yKTtcblxudmFyIF9pc0lTUkMgPSByZXF1aXJlKCcuL2xpYi9pc0lTUkMnKTtcblxudmFyIF9pc0lTUkMyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNJU1JDKTtcblxudmFyIF9pc01EID0gcmVxdWlyZSgnLi9saWIvaXNNRDUnKTtcblxudmFyIF9pc01EMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzTUQpO1xuXG52YXIgX2lzSGFzaCA9IHJlcXVpcmUoJy4vbGliL2lzSGFzaCcpO1xuXG52YXIgX2lzSGFzaDIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc0hhc2gpO1xuXG52YXIgX2lzSlNPTiA9IHJlcXVpcmUoJy4vbGliL2lzSlNPTicpO1xuXG52YXIgX2lzSlNPTjIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc0pTT04pO1xuXG52YXIgX2lzRW1wdHkgPSByZXF1aXJlKCcuL2xpYi9pc0VtcHR5Jyk7XG5cbnZhciBfaXNFbXB0eTIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc0VtcHR5KTtcblxudmFyIF9pc0xlbmd0aCA9IHJlcXVpcmUoJy4vbGliL2lzTGVuZ3RoJyk7XG5cbnZhciBfaXNMZW5ndGgyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNMZW5ndGgpO1xuXG52YXIgX2lzQnl0ZUxlbmd0aCA9IHJlcXVpcmUoJy4vbGliL2lzQnl0ZUxlbmd0aCcpO1xuXG52YXIgX2lzQnl0ZUxlbmd0aDIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc0J5dGVMZW5ndGgpO1xuXG52YXIgX2lzVVVJRCA9IHJlcXVpcmUoJy4vbGliL2lzVVVJRCcpO1xuXG52YXIgX2lzVVVJRDIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc1VVSUQpO1xuXG52YXIgX2lzTW9uZ29JZCA9IHJlcXVpcmUoJy4vbGliL2lzTW9uZ29JZCcpO1xuXG52YXIgX2lzTW9uZ29JZDIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc01vbmdvSWQpO1xuXG52YXIgX2lzQWZ0ZXIgPSByZXF1aXJlKCcuL2xpYi9pc0FmdGVyJyk7XG5cbnZhciBfaXNBZnRlcjIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc0FmdGVyKTtcblxudmFyIF9pc0JlZm9yZSA9IHJlcXVpcmUoJy4vbGliL2lzQmVmb3JlJyk7XG5cbnZhciBfaXNCZWZvcmUyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNCZWZvcmUpO1xuXG52YXIgX2lzSW4gPSByZXF1aXJlKCcuL2xpYi9pc0luJyk7XG5cbnZhciBfaXNJbjIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9pc0luKTtcblxudmFyIF9pc0NyZWRpdENhcmQgPSByZXF1aXJlKCcuL2xpYi9pc0NyZWRpdENhcmQnKTtcblxudmFyIF9pc0NyZWRpdENhcmQyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNDcmVkaXRDYXJkKTtcblxudmFyIF9pc0lTSU4gPSByZXF1aXJlKCcuL2xpYi9pc0lTSU4nKTtcblxudmFyIF9pc0lTSU4yID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNJU0lOKTtcblxudmFyIF9pc0lTQk4gPSByZXF1aXJlKCcuL2xpYi9pc0lTQk4nKTtcblxudmFyIF9pc0lTQk4yID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNJU0JOKTtcblxudmFyIF9pc0lTU04gPSByZXF1aXJlKCcuL2xpYi9pc0lTU04nKTtcblxudmFyIF9pc0lTU04yID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNJU1NOKTtcblxudmFyIF9pc01vYmlsZVBob25lID0gcmVxdWlyZSgnLi9saWIvaXNNb2JpbGVQaG9uZScpO1xuXG52YXIgX2lzTW9iaWxlUGhvbmUyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNNb2JpbGVQaG9uZSk7XG5cbnZhciBfaXNDdXJyZW5jeSA9IHJlcXVpcmUoJy4vbGliL2lzQ3VycmVuY3knKTtcblxudmFyIF9pc0N1cnJlbmN5MiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzQ3VycmVuY3kpO1xuXG52YXIgX2lzSVNPID0gcmVxdWlyZSgnLi9saWIvaXNJU084NjAxJyk7XG5cbnZhciBfaXNJU08yID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNJU08pO1xuXG52YXIgX2lzQmFzZSA9IHJlcXVpcmUoJy4vbGliL2lzQmFzZTY0Jyk7XG5cbnZhciBfaXNCYXNlMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzQmFzZSk7XG5cbnZhciBfaXNEYXRhVVJJID0gcmVxdWlyZSgnLi9saWIvaXNEYXRhVVJJJyk7XG5cbnZhciBfaXNEYXRhVVJJMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzRGF0YVVSSSk7XG5cbnZhciBfaXNMYXRMb25nID0gcmVxdWlyZSgnLi9saWIvaXNMYXRMb25nJyk7XG5cbnZhciBfaXNMYXRMb25nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzTGF0TG9uZyk7XG5cbnZhciBfaXNQb3N0YWxDb2RlID0gcmVxdWlyZSgnLi9saWIvaXNQb3N0YWxDb2RlJyk7XG5cbnZhciBfaXNQb3N0YWxDb2RlMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzUG9zdGFsQ29kZSk7XG5cbnZhciBfbHRyaW0gPSByZXF1aXJlKCcuL2xpYi9sdHJpbScpO1xuXG52YXIgX2x0cmltMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2x0cmltKTtcblxudmFyIF9ydHJpbSA9IHJlcXVpcmUoJy4vbGliL3J0cmltJyk7XG5cbnZhciBfcnRyaW0yID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfcnRyaW0pO1xuXG52YXIgX3RyaW0gPSByZXF1aXJlKCcuL2xpYi90cmltJyk7XG5cbnZhciBfdHJpbTIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF90cmltKTtcblxudmFyIF9lc2NhcGUgPSByZXF1aXJlKCcuL2xpYi9lc2NhcGUnKTtcblxudmFyIF9lc2NhcGUyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfZXNjYXBlKTtcblxudmFyIF91bmVzY2FwZSA9IHJlcXVpcmUoJy4vbGliL3VuZXNjYXBlJyk7XG5cbnZhciBfdW5lc2NhcGUyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfdW5lc2NhcGUpO1xuXG52YXIgX3N0cmlwTG93ID0gcmVxdWlyZSgnLi9saWIvc3RyaXBMb3cnKTtcblxudmFyIF9zdHJpcExvdzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9zdHJpcExvdyk7XG5cbnZhciBfd2hpdGVsaXN0ID0gcmVxdWlyZSgnLi9saWIvd2hpdGVsaXN0Jyk7XG5cbnZhciBfd2hpdGVsaXN0MiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX3doaXRlbGlzdCk7XG5cbnZhciBfYmxhY2tsaXN0ID0gcmVxdWlyZSgnLi9saWIvYmxhY2tsaXN0Jyk7XG5cbnZhciBfYmxhY2tsaXN0MiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2JsYWNrbGlzdCk7XG5cbnZhciBfaXNXaGl0ZWxpc3RlZCA9IHJlcXVpcmUoJy4vbGliL2lzV2hpdGVsaXN0ZWQnKTtcblxudmFyIF9pc1doaXRlbGlzdGVkMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzV2hpdGVsaXN0ZWQpO1xuXG52YXIgX25vcm1hbGl6ZUVtYWlsID0gcmVxdWlyZSgnLi9saWIvbm9ybWFsaXplRW1haWwnKTtcblxudmFyIF9ub3JtYWxpemVFbWFpbDIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9ub3JtYWxpemVFbWFpbCk7XG5cbnZhciBfdG9TdHJpbmcgPSByZXF1aXJlKCcuL2xpYi91dGlsL3RvU3RyaW5nJyk7XG5cbnZhciBfdG9TdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfdG9TdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgdmVyc2lvbiA9ICc4LjIuMCc7XG5cbnZhciB2YWxpZGF0b3IgPSB7XG4gIHZlcnNpb246IHZlcnNpb24sXG4gIHRvRGF0ZTogX3RvRGF0ZTIuZGVmYXVsdCxcbiAgdG9GbG9hdDogX3RvRmxvYXQyLmRlZmF1bHQsXG4gIHRvSW50OiBfdG9JbnQyLmRlZmF1bHQsXG4gIHRvQm9vbGVhbjogX3RvQm9vbGVhbjIuZGVmYXVsdCxcbiAgZXF1YWxzOiBfZXF1YWxzMi5kZWZhdWx0LFxuICBjb250YWluczogX2NvbnRhaW5zMi5kZWZhdWx0LFxuICBtYXRjaGVzOiBfbWF0Y2hlczIuZGVmYXVsdCxcbiAgaXNFbWFpbDogX2lzRW1haWwyLmRlZmF1bHQsXG4gIGlzVVJMOiBfaXNVUkwyLmRlZmF1bHQsXG4gIGlzTUFDQWRkcmVzczogX2lzTUFDQWRkcmVzczIuZGVmYXVsdCxcbiAgaXNJUDogX2lzSVAyLmRlZmF1bHQsXG4gIGlzRlFETjogX2lzRlFETjIuZGVmYXVsdCxcbiAgaXNCb29sZWFuOiBfaXNCb29sZWFuMi5kZWZhdWx0LFxuICBpc0FscGhhOiBfaXNBbHBoYTIuZGVmYXVsdCxcbiAgaXNBbHBoYW51bWVyaWM6IF9pc0FscGhhbnVtZXJpYzIuZGVmYXVsdCxcbiAgaXNOdW1lcmljOiBfaXNOdW1lcmljMi5kZWZhdWx0LFxuICBpc0xvd2VyY2FzZTogX2lzTG93ZXJjYXNlMi5kZWZhdWx0LFxuICBpc1VwcGVyY2FzZTogX2lzVXBwZXJjYXNlMi5kZWZhdWx0LFxuICBpc0FzY2lpOiBfaXNBc2NpaTIuZGVmYXVsdCxcbiAgaXNGdWxsV2lkdGg6IF9pc0Z1bGxXaWR0aDIuZGVmYXVsdCxcbiAgaXNIYWxmV2lkdGg6IF9pc0hhbGZXaWR0aDIuZGVmYXVsdCxcbiAgaXNWYXJpYWJsZVdpZHRoOiBfaXNWYXJpYWJsZVdpZHRoMi5kZWZhdWx0LFxuICBpc011bHRpYnl0ZTogX2lzTXVsdGlieXRlMi5kZWZhdWx0LFxuICBpc1N1cnJvZ2F0ZVBhaXI6IF9pc1N1cnJvZ2F0ZVBhaXIyLmRlZmF1bHQsXG4gIGlzSW50OiBfaXNJbnQyLmRlZmF1bHQsXG4gIGlzRmxvYXQ6IF9pc0Zsb2F0Mi5kZWZhdWx0LFxuICBpc0RlY2ltYWw6IF9pc0RlY2ltYWwyLmRlZmF1bHQsXG4gIGlzSGV4YWRlY2ltYWw6IF9pc0hleGFkZWNpbWFsMi5kZWZhdWx0LFxuICBpc0RpdmlzaWJsZUJ5OiBfaXNEaXZpc2libGVCeTIuZGVmYXVsdCxcbiAgaXNIZXhDb2xvcjogX2lzSGV4Q29sb3IyLmRlZmF1bHQsXG4gIGlzSVNSQzogX2lzSVNSQzIuZGVmYXVsdCxcbiAgaXNNRDU6IF9pc01EMi5kZWZhdWx0LFxuICBpc0hhc2g6IF9pc0hhc2gyLmRlZmF1bHQsXG4gIGlzSlNPTjogX2lzSlNPTjIuZGVmYXVsdCxcbiAgaXNFbXB0eTogX2lzRW1wdHkyLmRlZmF1bHQsXG4gIGlzTGVuZ3RoOiBfaXNMZW5ndGgyLmRlZmF1bHQsXG4gIGlzQnl0ZUxlbmd0aDogX2lzQnl0ZUxlbmd0aDIuZGVmYXVsdCxcbiAgaXNVVUlEOiBfaXNVVUlEMi5kZWZhdWx0LFxuICBpc01vbmdvSWQ6IF9pc01vbmdvSWQyLmRlZmF1bHQsXG4gIGlzQWZ0ZXI6IF9pc0FmdGVyMi5kZWZhdWx0LFxuICBpc0JlZm9yZTogX2lzQmVmb3JlMi5kZWZhdWx0LFxuICBpc0luOiBfaXNJbjIuZGVmYXVsdCxcbiAgaXNDcmVkaXRDYXJkOiBfaXNDcmVkaXRDYXJkMi5kZWZhdWx0LFxuICBpc0lTSU46IF9pc0lTSU4yLmRlZmF1bHQsXG4gIGlzSVNCTjogX2lzSVNCTjIuZGVmYXVsdCxcbiAgaXNJU1NOOiBfaXNJU1NOMi5kZWZhdWx0LFxuICBpc01vYmlsZVBob25lOiBfaXNNb2JpbGVQaG9uZTIuZGVmYXVsdCxcbiAgaXNQb3N0YWxDb2RlOiBfaXNQb3N0YWxDb2RlMi5kZWZhdWx0LFxuICBpc0N1cnJlbmN5OiBfaXNDdXJyZW5jeTIuZGVmYXVsdCxcbiAgaXNJU084NjAxOiBfaXNJU08yLmRlZmF1bHQsXG4gIGlzQmFzZTY0OiBfaXNCYXNlMi5kZWZhdWx0LFxuICBpc0RhdGFVUkk6IF9pc0RhdGFVUkkyLmRlZmF1bHQsXG4gIGlzTGF0TG9uZzogX2lzTGF0TG9uZzIuZGVmYXVsdCxcbiAgbHRyaW06IF9sdHJpbTIuZGVmYXVsdCxcbiAgcnRyaW06IF9ydHJpbTIuZGVmYXVsdCxcbiAgdHJpbTogX3RyaW0yLmRlZmF1bHQsXG4gIGVzY2FwZTogX2VzY2FwZTIuZGVmYXVsdCxcbiAgdW5lc2NhcGU6IF91bmVzY2FwZTIuZGVmYXVsdCxcbiAgc3RyaXBMb3c6IF9zdHJpcExvdzIuZGVmYXVsdCxcbiAgd2hpdGVsaXN0OiBfd2hpdGVsaXN0Mi5kZWZhdWx0LFxuICBibGFja2xpc3Q6IF9ibGFja2xpc3QyLmRlZmF1bHQsXG4gIGlzV2hpdGVsaXN0ZWQ6IF9pc1doaXRlbGlzdGVkMi5kZWZhdWx0LFxuICBub3JtYWxpemVFbWFpbDogX25vcm1hbGl6ZUVtYWlsMi5kZWZhdWx0LFxuICB0b1N0cmluZzogX3RvU3RyaW5nMi5kZWZhdWx0XG59O1xuXG5leHBvcnRzLmRlZmF1bHQgPSB2YWxpZGF0b3I7XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG52YXIgYWxwaGEgPSBleHBvcnRzLmFscGhhID0ge1xuICAnZW4tVVMnOiAvXltBLVpdKyQvaSxcbiAgJ2NzLUNaJzogL15bQS1aw4HEjMSOw4nEmsONxYfDk8WYxaDFpMOaxa7DncW9XSskL2ksXG4gICdkYS1ESyc6IC9eW0EtWsOGw5jDhV0rJC9pLFxuICAnZGUtREUnOiAvXltBLVrDhMOWw5zDn10rJC9pLFxuICAnZXMtRVMnOiAvXltBLVrDgcOJw43DkcOTw5rDnF0rJC9pLFxuICAnZnItRlInOiAvXltBLVrDgMOCw4bDh8OJw4jDisOLw4/DjsOUxZLDmcObw5zFuF0rJC9pLFxuICAnaXQtSVQnOiAvXltBLVrDgMOJw4jDjMOOw5PDksOZXSskL2ksXG4gICduYi1OTyc6IC9eW0EtWsOGw5jDhV0rJC9pLFxuICAnbmwtTkwnOiAvXltBLVrDgcOJw4vDj8OTw5bDnMOaXSskL2ksXG4gICdubi1OTyc6IC9eW0EtWsOGw5jDhV0rJC9pLFxuICAnaHUtSFUnOiAvXltBLVrDgcOJw43Dk8OWxZDDmsOcxbBdKyQvaSxcbiAgJ3BsLVBMJzogL15bQS1axITEhsSYxZrFgcWDw5PFu8W5XSskL2ksXG4gICdwdC1QVCc6IC9eW0EtWsODw4HDgMOCw4fDicOKw43DlcOTw5TDmsOcXSskL2ksXG4gICdydS1SVSc6IC9eW9CQLdCv0IFdKyQvaSxcbiAgJ3NyLVJTQGxhdGluJzogL15bQS1axIzEhsW9xaDEkF0rJC9pLFxuICAnc3ItUlMnOiAvXlvQkC3Qr9CC0IjQidCK0IvQj10rJC9pLFxuICAnc3YtU0UnOiAvXltBLVrDhcOEw5ZdKyQvaSxcbiAgJ3RyLVRSJzogL15bQS1aw4fEnsSwxLHDlsWew5xdKyQvaSxcbiAgJ3VrLVVBJzogL15b0JAt0KnQrNCu0K/QhEnQh9KQXSskL2ksXG4gIGFyOiAvXlvYodii2KPYpNil2KbYp9io2KnYqtir2KzYrdiu2K/YsNix2LLYs9i02LXYtti32LjYudi62YHZgtmD2YTZhdmG2YfZiNmJ2YrZi9mM2Y3ZjtmP2ZDZkdmS2bBdKyQvXG59O1xuXG52YXIgYWxwaGFudW1lcmljID0gZXhwb3J0cy5hbHBoYW51bWVyaWMgPSB7XG4gICdlbi1VUyc6IC9eWzAtOUEtWl0rJC9pLFxuICAnY3MtQ1onOiAvXlswLTlBLVrDgcSMxI7DicSaw43Fh8OTxZjFoMWkw5rFrsOdxb1dKyQvaSxcbiAgJ2RhLURLJzogL15bMC05QS1aw4bDmMOFXSskL2ksXG4gICdkZS1ERSc6IC9eWzAtOUEtWsOEw5bDnMOfXSskL2ksXG4gICdlcy1FUyc6IC9eWzAtOUEtWsOBw4nDjcORw5PDmsOcXSskL2ksXG4gICdmci1GUic6IC9eWzAtOUEtWsOAw4LDhsOHw4nDiMOKw4vDj8OOw5TFksOZw5vDnMW4XSskL2ksXG4gICdpdC1JVCc6IC9eWzAtOUEtWsOAw4nDiMOMw47Dk8OSw5ldKyQvaSxcbiAgJ2h1LUhVJzogL15bMC05QS1aw4HDicONw5PDlsWQw5rDnMWwXSskL2ksXG4gICduYi1OTyc6IC9eWzAtOUEtWsOGw5jDhV0rJC9pLFxuICAnbmwtTkwnOiAvXlswLTlBLVrDgcOJw4vDj8OTw5bDnMOaXSskL2ksXG4gICdubi1OTyc6IC9eWzAtOUEtWsOGw5jDhV0rJC9pLFxuICAncGwtUEwnOiAvXlswLTlBLVrEhMSGxJjFmsWBxYPDk8W7xbldKyQvaSxcbiAgJ3B0LVBUJzogL15bMC05QS1aw4PDgcOAw4LDh8OJw4rDjcOVw5PDlMOaw5xdKyQvaSxcbiAgJ3J1LVJVJzogL15bMC050JAt0K/QgV0rJC9pLFxuICAnc3ItUlNAbGF0aW4nOiAvXlswLTlBLVrEjMSGxb3FoMSQXSskL2ksXG4gICdzci1SUyc6IC9eWzAtOdCQLdCv0ILQiNCJ0IrQi9CPXSskL2ksXG4gICdzdi1TRSc6IC9eWzAtOUEtWsOFw4TDll0rJC9pLFxuICAndHItVFInOiAvXlswLTlBLVrDh8SexLDEscOWxZ7DnF0rJC9pLFxuICAndWstVUEnOiAvXlswLTnQkC3QqdCs0K7Qr9CESdCH0pBdKyQvaSxcbiAgYXI6IC9eW9mg2aHZotmj2aTZpdmm2afZqNmpMC052KHYotij2KTYpdim2KfYqNip2KrYq9is2K3Yrtiv2LDYsdiy2LPYtNi12LbYt9i42LnYutmB2YLZg9mE2YXZhtmH2YjZidmK2YvZjNmN2Y7Zj9mQ2ZHZktmwXSskL1xufTtcblxudmFyIGVuZ2xpc2hMb2NhbGVzID0gZXhwb3J0cy5lbmdsaXNoTG9jYWxlcyA9IFsnQVUnLCAnR0InLCAnSEsnLCAnSU4nLCAnTlonLCAnWkEnLCAnWk0nXTtcblxuZm9yICh2YXIgbG9jYWxlLCBpID0gMDsgaSA8IGVuZ2xpc2hMb2NhbGVzLmxlbmd0aDsgaSsrKSB7XG4gIGxvY2FsZSA9ICdlbi0nICsgZW5nbGlzaExvY2FsZXNbaV07XG4gIGFscGhhW2xvY2FsZV0gPSBhbHBoYVsnZW4tVVMnXTtcbiAgYWxwaGFudW1lcmljW2xvY2FsZV0gPSBhbHBoYW51bWVyaWNbJ2VuLVVTJ107XG59XG5cbmFscGhhWydwdC1CUiddID0gYWxwaGFbJ3B0LVBUJ107XG5hbHBoYW51bWVyaWNbJ3B0LUJSJ10gPSBhbHBoYW51bWVyaWNbJ3B0LVBUJ107XG5cbi8vIFNvdXJjZTogaHR0cDovL3d3dy5sb2NhbGVwbGFuZXQuY29tL2phdmEvXG52YXIgYXJhYmljTG9jYWxlcyA9IGV4cG9ydHMuYXJhYmljTG9jYWxlcyA9IFsnQUUnLCAnQkgnLCAnRFonLCAnRUcnLCAnSVEnLCAnSk8nLCAnS1cnLCAnTEInLCAnTFknLCAnTUEnLCAnUU0nLCAnUUEnLCAnU0EnLCAnU0QnLCAnU1knLCAnVE4nLCAnWUUnXTtcblxuZm9yICh2YXIgX2xvY2FsZSwgX2kgPSAwOyBfaSA8IGFyYWJpY0xvY2FsZXMubGVuZ3RoOyBfaSsrKSB7XG4gIF9sb2NhbGUgPSAnYXItJyArIGFyYWJpY0xvY2FsZXNbX2ldO1xuICBhbHBoYVtfbG9jYWxlXSA9IGFscGhhLmFyO1xuICBhbHBoYW51bWVyaWNbX2xvY2FsZV0gPSBhbHBoYW51bWVyaWMuYXI7XG59IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gYmxhY2tsaXN0O1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gYmxhY2tsaXN0KHN0ciwgY2hhcnMpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHJldHVybiBzdHIucmVwbGFjZShuZXcgUmVnRXhwKCdbJyArIGNoYXJzICsgJ10rJywgJ2cnKSwgJycpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gY29udGFpbnM7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG52YXIgX3RvU3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL3RvU3RyaW5nJyk7XG5cbnZhciBfdG9TdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfdG9TdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5mdW5jdGlvbiBjb250YWlucyhzdHIsIGVsZW0pIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHJldHVybiBzdHIuaW5kZXhPZigoMCwgX3RvU3RyaW5nMi5kZWZhdWx0KShlbGVtKSkgPj0gMDtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGVxdWFscztcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIGVxdWFscyhzdHIsIGNvbXBhcmlzb24pIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHJldHVybiBzdHIgPT09IGNvbXBhcmlzb247XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBlc2NhcGU7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5mdW5jdGlvbiBlc2NhcGUoc3RyKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gc3RyLnJlcGxhY2UoLyYvZywgJyZhbXA7JykucmVwbGFjZSgvXCIvZywgJyZxdW90OycpLnJlcGxhY2UoLycvZywgJyYjeDI3OycpLnJlcGxhY2UoLzwvZywgJyZsdDsnKS5yZXBsYWNlKC8+L2csICcmZ3Q7JykucmVwbGFjZSgvXFwvL2csICcmI3gyRjsnKS5yZXBsYWNlKC9cXFxcL2csICcmI3g1QzsnKS5yZXBsYWNlKC9gL2csICcmIzk2OycpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNBZnRlcjtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbnZhciBfdG9EYXRlID0gcmVxdWlyZSgnLi90b0RhdGUnKTtcblxudmFyIF90b0RhdGUyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfdG9EYXRlKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gaXNBZnRlcihzdHIpIHtcbiAgdmFyIGRhdGUgPSBhcmd1bWVudHMubGVuZ3RoID4gMSAmJiBhcmd1bWVudHNbMV0gIT09IHVuZGVmaW5lZCA/IGFyZ3VtZW50c1sxXSA6IFN0cmluZyhuZXcgRGF0ZSgpKTtcblxuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgdmFyIGNvbXBhcmlzb24gPSAoMCwgX3RvRGF0ZTIuZGVmYXVsdCkoZGF0ZSk7XG4gIHZhciBvcmlnaW5hbCA9ICgwLCBfdG9EYXRlMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gISEob3JpZ2luYWwgJiYgY29tcGFyaXNvbiAmJiBvcmlnaW5hbCA+IGNvbXBhcmlzb24pO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNBbHBoYTtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbnZhciBfYWxwaGEgPSByZXF1aXJlKCcuL2FscGhhJyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIGlzQWxwaGEoc3RyKSB7XG4gIHZhciBsb2NhbGUgPSBhcmd1bWVudHMubGVuZ3RoID4gMSAmJiBhcmd1bWVudHNbMV0gIT09IHVuZGVmaW5lZCA/IGFyZ3VtZW50c1sxXSA6ICdlbi1VUyc7XG5cbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIGlmIChsb2NhbGUgaW4gX2FscGhhLmFscGhhKSB7XG4gICAgcmV0dXJuIF9hbHBoYS5hbHBoYVtsb2NhbGVdLnRlc3Qoc3RyKTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYWxlIFxcJycgKyBsb2NhbGUgKyAnXFwnJyk7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0FscGhhbnVtZXJpYztcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbnZhciBfYWxwaGEgPSByZXF1aXJlKCcuL2FscGhhJyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIGlzQWxwaGFudW1lcmljKHN0cikge1xuICB2YXIgbG9jYWxlID0gYXJndW1lbnRzLmxlbmd0aCA+IDEgJiYgYXJndW1lbnRzWzFdICE9PSB1bmRlZmluZWQgPyBhcmd1bWVudHNbMV0gOiAnZW4tVVMnO1xuXG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICBpZiAobG9jYWxlIGluIF9hbHBoYS5hbHBoYW51bWVyaWMpIHtcbiAgICByZXR1cm4gX2FscGhhLmFscGhhbnVtZXJpY1tsb2NhbGVdLnRlc3Qoc3RyKTtcbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYWxlIFxcJycgKyBsb2NhbGUgKyAnXFwnJyk7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0FzY2lpO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuLyogZXNsaW50LWRpc2FibGUgbm8tY29udHJvbC1yZWdleCAqL1xudmFyIGFzY2lpID0gL15bXFx4MDAtXFx4N0ZdKyQvO1xuLyogZXNsaW50LWVuYWJsZSBuby1jb250cm9sLXJlZ2V4ICovXG5cbmZ1bmN0aW9uIGlzQXNjaWkoc3RyKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gYXNjaWkudGVzdChzdHIpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNCYXNlNjQ7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgbm90QmFzZTY0ID0gL1teQS1aMC05K1xcLz1dL2k7XG5cbmZ1bmN0aW9uIGlzQmFzZTY0KHN0cikge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgdmFyIGxlbiA9IHN0ci5sZW5ndGg7XG4gIGlmICghbGVuIHx8IGxlbiAlIDQgIT09IDAgfHwgbm90QmFzZTY0LnRlc3Qoc3RyKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB2YXIgZmlyc3RQYWRkaW5nQ2hhciA9IHN0ci5pbmRleE9mKCc9Jyk7XG4gIHJldHVybiBmaXJzdFBhZGRpbmdDaGFyID09PSAtMSB8fCBmaXJzdFBhZGRpbmdDaGFyID09PSBsZW4gLSAxIHx8IGZpcnN0UGFkZGluZ0NoYXIgPT09IGxlbiAtIDIgJiYgc3RyW2xlbiAtIDFdID09PSAnPSc7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0JlZm9yZTtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbnZhciBfdG9EYXRlID0gcmVxdWlyZSgnLi90b0RhdGUnKTtcblxudmFyIF90b0RhdGUyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfdG9EYXRlKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gaXNCZWZvcmUoc3RyKSB7XG4gIHZhciBkYXRlID0gYXJndW1lbnRzLmxlbmd0aCA+IDEgJiYgYXJndW1lbnRzWzFdICE9PSB1bmRlZmluZWQgPyBhcmd1bWVudHNbMV0gOiBTdHJpbmcobmV3IERhdGUoKSk7XG5cbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHZhciBjb21wYXJpc29uID0gKDAsIF90b0RhdGUyLmRlZmF1bHQpKGRhdGUpO1xuICB2YXIgb3JpZ2luYWwgPSAoMCwgX3RvRGF0ZTIuZGVmYXVsdCkoc3RyKTtcbiAgcmV0dXJuICEhKG9yaWdpbmFsICYmIGNvbXBhcmlzb24gJiYgb3JpZ2luYWwgPCBjb21wYXJpc29uKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGlzQm9vbGVhbjtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIGlzQm9vbGVhbihzdHIpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHJldHVybiBbJ3RydWUnLCAnZmFsc2UnLCAnMScsICcwJ10uaW5kZXhPZihzdHIpID49IDA7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5cbnZhciBfdHlwZW9mID0gdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiICYmIHR5cGVvZiBTeW1ib2wuaXRlcmF0b3IgPT09IFwic3ltYm9sXCIgPyBmdW5jdGlvbiAob2JqKSB7IHJldHVybiB0eXBlb2Ygb2JqOyB9IDogZnVuY3Rpb24gKG9iaikgeyByZXR1cm4gb2JqICYmIHR5cGVvZiBTeW1ib2wgPT09IFwiZnVuY3Rpb25cIiAmJiBvYmouY29uc3RydWN0b3IgPT09IFN5bWJvbCAmJiBvYmogIT09IFN5bWJvbC5wcm90b3R5cGUgPyBcInN5bWJvbFwiIDogdHlwZW9mIG9iajsgfTtcblxuZXhwb3J0cy5kZWZhdWx0ID0gaXNCeXRlTGVuZ3RoO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuLyogZXNsaW50LWRpc2FibGUgcHJlZmVyLXJlc3QtcGFyYW1zICovXG5mdW5jdGlvbiBpc0J5dGVMZW5ndGgoc3RyLCBvcHRpb25zKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICB2YXIgbWluID0gdm9pZCAwO1xuICB2YXIgbWF4ID0gdm9pZCAwO1xuICBpZiAoKHR5cGVvZiBvcHRpb25zID09PSAndW5kZWZpbmVkJyA/ICd1bmRlZmluZWQnIDogX3R5cGVvZihvcHRpb25zKSkgPT09ICdvYmplY3QnKSB7XG4gICAgbWluID0gb3B0aW9ucy5taW4gfHwgMDtcbiAgICBtYXggPSBvcHRpb25zLm1heDtcbiAgfSBlbHNlIHtcbiAgICAvLyBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eTogaXNCeXRlTGVuZ3RoKHN0ciwgbWluIFssIG1heF0pXG4gICAgbWluID0gYXJndW1lbnRzWzFdO1xuICAgIG1heCA9IGFyZ3VtZW50c1syXTtcbiAgfVxuICB2YXIgbGVuID0gZW5jb2RlVVJJKHN0cikuc3BsaXQoLyUuLnwuLykubGVuZ3RoIC0gMTtcbiAgcmV0dXJuIGxlbiA+PSBtaW4gJiYgKHR5cGVvZiBtYXggPT09ICd1bmRlZmluZWQnIHx8IGxlbiA8PSBtYXgpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNDcmVkaXRDYXJkO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuLyogZXNsaW50LWRpc2FibGUgbWF4LWxlbiAqL1xudmFyIGNyZWRpdENhcmQgPSAvXig/OjRbMC05XXsxMn0oPzpbMC05XXszfSk/fDVbMS01XVswLTldezE0fXwoMjIyWzEtOV18MjJbMy05XVswLTldfDJbMy02XVswLTldezJ9fDI3WzAxXVswLTldfDI3MjApWzAtOV17MTJ9fDYoPzowMTF8NVswLTldWzAtOV0pWzAtOV17MTJ9fDNbNDddWzAtOV17MTN9fDMoPzowWzAtNV18WzY4XVswLTldKVswLTldezExfXwoPzoyMTMxfDE4MDB8MzVcXGR7M30pXFxkezExfXw2MlswLTldezE0fSkkLztcbi8qIGVzbGludC1lbmFibGUgbWF4LWxlbiAqL1xuXG5mdW5jdGlvbiBpc0NyZWRpdENhcmQoc3RyKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICB2YXIgc2FuaXRpemVkID0gc3RyLnJlcGxhY2UoL1stIF0rL2csICcnKTtcbiAgaWYgKCFjcmVkaXRDYXJkLnRlc3Qoc2FuaXRpemVkKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB2YXIgc3VtID0gMDtcbiAgdmFyIGRpZ2l0ID0gdm9pZCAwO1xuICB2YXIgdG1wTnVtID0gdm9pZCAwO1xuICB2YXIgc2hvdWxkRG91YmxlID0gdm9pZCAwO1xuICBmb3IgKHZhciBpID0gc2FuaXRpemVkLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgZGlnaXQgPSBzYW5pdGl6ZWQuc3Vic3RyaW5nKGksIGkgKyAxKTtcbiAgICB0bXBOdW0gPSBwYXJzZUludChkaWdpdCwgMTApO1xuICAgIGlmIChzaG91bGREb3VibGUpIHtcbiAgICAgIHRtcE51bSAqPSAyO1xuICAgICAgaWYgKHRtcE51bSA+PSAxMCkge1xuICAgICAgICBzdW0gKz0gdG1wTnVtICUgMTAgKyAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3VtICs9IHRtcE51bTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3VtICs9IHRtcE51bTtcbiAgICB9XG4gICAgc2hvdWxkRG91YmxlID0gIXNob3VsZERvdWJsZTtcbiAgfVxuICByZXR1cm4gISEoc3VtICUgMTAgPT09IDAgPyBzYW5pdGl6ZWQgOiBmYWxzZSk7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0N1cnJlbmN5O1xuXG52YXIgX21lcmdlID0gcmVxdWlyZSgnLi91dGlsL21lcmdlJyk7XG5cbnZhciBfbWVyZ2UyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfbWVyZ2UpO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gY3VycmVuY3lSZWdleChvcHRpb25zKSB7XG4gIHZhciBkZWNpbWFsX2RpZ2l0cyA9ICdcXFxcZHsnICsgb3B0aW9ucy5kaWdpdHNfYWZ0ZXJfZGVjaW1hbFswXSArICd9JztcbiAgb3B0aW9ucy5kaWdpdHNfYWZ0ZXJfZGVjaW1hbC5mb3JFYWNoKGZ1bmN0aW9uIChkaWdpdCwgaW5kZXgpIHtcbiAgICBpZiAoaW5kZXggIT09IDApIGRlY2ltYWxfZGlnaXRzID0gZGVjaW1hbF9kaWdpdHMgKyAnfFxcXFxkeycgKyBkaWdpdCArICd9JztcbiAgfSk7XG4gIHZhciBzeW1ib2wgPSAnKFxcXFwnICsgb3B0aW9ucy5zeW1ib2wucmVwbGFjZSgvXFwuL2csICdcXFxcLicpICsgJyknICsgKG9wdGlvbnMucmVxdWlyZV9zeW1ib2wgPyAnJyA6ICc/JyksXG4gICAgICBuZWdhdGl2ZSA9ICctPycsXG4gICAgICB3aG9sZV9kb2xsYXJfYW1vdW50X3dpdGhvdXRfc2VwID0gJ1sxLTldXFxcXGQqJyxcbiAgICAgIHdob2xlX2RvbGxhcl9hbW91bnRfd2l0aF9zZXAgPSAnWzEtOV1cXFxcZHswLDJ9KFxcXFwnICsgb3B0aW9ucy50aG91c2FuZHNfc2VwYXJhdG9yICsgJ1xcXFxkezN9KSonLFxuICAgICAgdmFsaWRfd2hvbGVfZG9sbGFyX2Ftb3VudHMgPSBbJzAnLCB3aG9sZV9kb2xsYXJfYW1vdW50X3dpdGhvdXRfc2VwLCB3aG9sZV9kb2xsYXJfYW1vdW50X3dpdGhfc2VwXSxcbiAgICAgIHdob2xlX2RvbGxhcl9hbW91bnQgPSAnKCcgKyB2YWxpZF93aG9sZV9kb2xsYXJfYW1vdW50cy5qb2luKCd8JykgKyAnKT8nLFxuICAgICAgZGVjaW1hbF9hbW91bnQgPSAnKFxcXFwnICsgb3B0aW9ucy5kZWNpbWFsX3NlcGFyYXRvciArICcoJyArIGRlY2ltYWxfZGlnaXRzICsgJykpJyArIChvcHRpb25zLnJlcXVpcmVfZGVjaW1hbCA/ICcnIDogJz8nKTtcbiAgdmFyIHBhdHRlcm4gPSB3aG9sZV9kb2xsYXJfYW1vdW50ICsgKG9wdGlvbnMuYWxsb3dfZGVjaW1hbCB8fCBvcHRpb25zLnJlcXVpcmVfZGVjaW1hbCA/IGRlY2ltYWxfYW1vdW50IDogJycpO1xuXG4gIC8vIGRlZmF1bHQgaXMgbmVnYXRpdmUgc2lnbiBiZWZvcmUgc3ltYm9sLCBidXQgdGhlcmUgYXJlIHR3byBvdGhlciBvcHRpb25zIChiZXNpZGVzIHBhcmVucylcbiAgaWYgKG9wdGlvbnMuYWxsb3dfbmVnYXRpdmVzICYmICFvcHRpb25zLnBhcmVuc19mb3JfbmVnYXRpdmVzKSB7XG4gICAgaWYgKG9wdGlvbnMubmVnYXRpdmVfc2lnbl9hZnRlcl9kaWdpdHMpIHtcbiAgICAgIHBhdHRlcm4gKz0gbmVnYXRpdmU7XG4gICAgfSBlbHNlIGlmIChvcHRpb25zLm5lZ2F0aXZlX3NpZ25fYmVmb3JlX2RpZ2l0cykge1xuICAgICAgcGF0dGVybiA9IG5lZ2F0aXZlICsgcGF0dGVybjtcbiAgICB9XG4gIH1cblxuICAvLyBTb3V0aCBBZnJpY2FuIFJhbmQsIGZvciBleGFtcGxlLCB1c2VzIFIgMTIzIChzcGFjZSkgYW5kIFItMTIzIChubyBzcGFjZSlcbiAgaWYgKG9wdGlvbnMuYWxsb3dfbmVnYXRpdmVfc2lnbl9wbGFjZWhvbGRlcikge1xuICAgIHBhdHRlcm4gPSAnKCAoPyFcXFxcLSkpPycgKyBwYXR0ZXJuO1xuICB9IGVsc2UgaWYgKG9wdGlvbnMuYWxsb3dfc3BhY2VfYWZ0ZXJfc3ltYm9sKSB7XG4gICAgcGF0dGVybiA9ICcgPycgKyBwYXR0ZXJuO1xuICB9IGVsc2UgaWYgKG9wdGlvbnMuYWxsb3dfc3BhY2VfYWZ0ZXJfZGlnaXRzKSB7XG4gICAgcGF0dGVybiArPSAnKCAoPyEkKSk/JztcbiAgfVxuXG4gIGlmIChvcHRpb25zLnN5bWJvbF9hZnRlcl9kaWdpdHMpIHtcbiAgICBwYXR0ZXJuICs9IHN5bWJvbDtcbiAgfSBlbHNlIHtcbiAgICBwYXR0ZXJuID0gc3ltYm9sICsgcGF0dGVybjtcbiAgfVxuXG4gIGlmIChvcHRpb25zLmFsbG93X25lZ2F0aXZlcykge1xuICAgIGlmIChvcHRpb25zLnBhcmVuc19mb3JfbmVnYXRpdmVzKSB7XG4gICAgICBwYXR0ZXJuID0gJyhcXFxcKCcgKyBwYXR0ZXJuICsgJ1xcXFwpfCcgKyBwYXR0ZXJuICsgJyknO1xuICAgIH0gZWxzZSBpZiAoIShvcHRpb25zLm5lZ2F0aXZlX3NpZ25fYmVmb3JlX2RpZ2l0cyB8fCBvcHRpb25zLm5lZ2F0aXZlX3NpZ25fYWZ0ZXJfZGlnaXRzKSkge1xuICAgICAgcGF0dGVybiA9IG5lZ2F0aXZlICsgcGF0dGVybjtcbiAgICB9XG4gIH1cblxuICAvLyBlbnN1cmUgdGhlcmUncyBhIGRvbGxhciBhbmQvb3IgZGVjaW1hbCBhbW91bnQsIGFuZCB0aGF0XG4gIC8vIGl0IGRvZXNuJ3Qgc3RhcnQgd2l0aCBhIHNwYWNlIG9yIGEgbmVnYXRpdmUgc2lnbiBmb2xsb3dlZCBieSBhIHNwYWNlXG4gIHJldHVybiBuZXcgUmVnRXhwKCdeKD8hLT8gKSg/PS4qXFxcXGQpJyArIHBhdHRlcm4gKyAnJCcpO1xufVxuXG52YXIgZGVmYXVsdF9jdXJyZW5jeV9vcHRpb25zID0ge1xuICBzeW1ib2w6ICckJyxcbiAgcmVxdWlyZV9zeW1ib2w6IGZhbHNlLFxuICBhbGxvd19zcGFjZV9hZnRlcl9zeW1ib2w6IGZhbHNlLFxuICBzeW1ib2xfYWZ0ZXJfZGlnaXRzOiBmYWxzZSxcbiAgYWxsb3dfbmVnYXRpdmVzOiB0cnVlLFxuICBwYXJlbnNfZm9yX25lZ2F0aXZlczogZmFsc2UsXG4gIG5lZ2F0aXZlX3NpZ25fYmVmb3JlX2RpZ2l0czogZmFsc2UsXG4gIG5lZ2F0aXZlX3NpZ25fYWZ0ZXJfZGlnaXRzOiBmYWxzZSxcbiAgYWxsb3dfbmVnYXRpdmVfc2lnbl9wbGFjZWhvbGRlcjogZmFsc2UsXG4gIHRob3VzYW5kc19zZXBhcmF0b3I6ICcsJyxcbiAgZGVjaW1hbF9zZXBhcmF0b3I6ICcuJyxcbiAgYWxsb3dfZGVjaW1hbDogdHJ1ZSxcbiAgcmVxdWlyZV9kZWNpbWFsOiBmYWxzZSxcbiAgZGlnaXRzX2FmdGVyX2RlY2ltYWw6IFsyXSxcbiAgYWxsb3dfc3BhY2VfYWZ0ZXJfZGlnaXRzOiBmYWxzZVxufTtcblxuZnVuY3Rpb24gaXNDdXJyZW5jeShzdHIsIG9wdGlvbnMpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIG9wdGlvbnMgPSAoMCwgX21lcmdlMi5kZWZhdWx0KShvcHRpb25zLCBkZWZhdWx0X2N1cnJlbmN5X29wdGlvbnMpO1xuICByZXR1cm4gY3VycmVuY3lSZWdleChvcHRpb25zKS50ZXN0KHN0cik7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0RhdGFVUkk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgZGF0YVVSSSA9IC9eXFxzKmRhdGE6KFthLXpdK1xcL1thLXowLTlcXC1cXCtdKyg7W2EtelxcLV0rPVthLXowLTlcXC1dKyk/KT8oO2Jhc2U2NCk/LFthLXowLTkhXFwkJicsXFwoXFwpXFwqXFwrLDs9XFwtXFwuX346QFxcL1xcPyVcXHNdKlxccyokL2k7IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbWF4LWxlblxuXG5mdW5jdGlvbiBpc0RhdGFVUkkoc3RyKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gZGF0YVVSSS50ZXN0KHN0cik7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0RlY2ltYWw7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgZGVjaW1hbCA9IC9eWy0rXT8oWzAtOV0rfFxcLlswLTldK3xbMC05XStcXC5bMC05XSspJC87XG5cbmZ1bmN0aW9uIGlzRGVjaW1hbChzdHIpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHJldHVybiBzdHIgIT09ICcnICYmIGRlY2ltYWwudGVzdChzdHIpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNEaXZpc2libGVCeTtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbnZhciBfdG9GbG9hdCA9IHJlcXVpcmUoJy4vdG9GbG9hdCcpO1xuXG52YXIgX3RvRmxvYXQyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfdG9GbG9hdCk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIGlzRGl2aXNpYmxlQnkoc3RyLCBudW0pIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHJldHVybiAoMCwgX3RvRmxvYXQyLmRlZmF1bHQpKHN0cikgJSBwYXJzZUludChudW0sIDEwKSA9PT0gMDtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGlzRW1haWw7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG52YXIgX21lcmdlID0gcmVxdWlyZSgnLi91dGlsL21lcmdlJyk7XG5cbnZhciBfbWVyZ2UyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfbWVyZ2UpO1xuXG52YXIgX2lzQnl0ZUxlbmd0aCA9IHJlcXVpcmUoJy4vaXNCeXRlTGVuZ3RoJyk7XG5cbnZhciBfaXNCeXRlTGVuZ3RoMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzQnl0ZUxlbmd0aCk7XG5cbnZhciBfaXNGUUROID0gcmVxdWlyZSgnLi9pc0ZRRE4nKTtcblxudmFyIF9pc0ZRRE4yID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNGUUROKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxudmFyIGRlZmF1bHRfZW1haWxfb3B0aW9ucyA9IHtcbiAgYWxsb3dfZGlzcGxheV9uYW1lOiBmYWxzZSxcbiAgcmVxdWlyZV9kaXNwbGF5X25hbWU6IGZhbHNlLFxuICBhbGxvd191dGY4X2xvY2FsX3BhcnQ6IHRydWUsXG4gIHJlcXVpcmVfdGxkOiB0cnVlXG59O1xuXG4vKiBlc2xpbnQtZGlzYWJsZSBtYXgtbGVuICovXG4vKiBlc2xpbnQtZGlzYWJsZSBuby1jb250cm9sLXJlZ2V4ICovXG52YXIgZGlzcGxheU5hbWUgPSAvXlthLXpcXGQhI1xcJCUmJ1xcKlxcK1xcLVxcLz1cXD9cXF5fYHtcXHx9flxcLlxcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0rW2EtelxcZCEjXFwkJSYnXFwqXFwrXFwtXFwvPVxcP1xcXl9ge1xcfH1+XFwsXFwuXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXFxzXSo8KC4rKT4kL2k7XG52YXIgZW1haWxVc2VyUGFydCA9IC9eW2EtelxcZCEjXFwkJSYnXFwqXFwrXFwtXFwvPVxcP1xcXl9ge1xcfH1+XSskL2k7XG52YXIgcXVvdGVkRW1haWxVc2VyID0gL14oW1xcc1xceDAxLVxceDA4XFx4MGJcXHgwY1xceDBlLVxceDFmXFx4N2ZcXHgyMVxceDIzLVxceDViXFx4NWQtXFx4N2VdfChcXFxcW1xceDAxLVxceDA5XFx4MGJcXHgwY1xceDBkLVxceDdmXSkpKiQvaTtcbnZhciBlbWFpbFVzZXJVdGY4UGFydCA9IC9eW2EtelxcZCEjXFwkJSYnXFwqXFwrXFwtXFwvPVxcP1xcXl9ge1xcfH1+XFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXSskL2k7XG52YXIgcXVvdGVkRW1haWxVc2VyVXRmOCA9IC9eKFtcXHNcXHgwMS1cXHgwOFxceDBiXFx4MGNcXHgwZS1cXHgxZlxceDdmXFx4MjFcXHgyMy1cXHg1YlxceDVkLVxceDdlXFx1MDBBMC1cXHVEN0ZGXFx1RjkwMC1cXHVGRENGXFx1RkRGMC1cXHVGRkVGXXwoXFxcXFtcXHgwMS1cXHgwOVxceDBiXFx4MGNcXHgwZC1cXHg3ZlxcdTAwQTAtXFx1RDdGRlxcdUY5MDAtXFx1RkRDRlxcdUZERjAtXFx1RkZFRl0pKSokL2k7XG4vKiBlc2xpbnQtZW5hYmxlIG1heC1sZW4gKi9cbi8qIGVzbGludC1lbmFibGUgbm8tY29udHJvbC1yZWdleCAqL1xuXG5mdW5jdGlvbiBpc0VtYWlsKHN0ciwgb3B0aW9ucykge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgb3B0aW9ucyA9ICgwLCBfbWVyZ2UyLmRlZmF1bHQpKG9wdGlvbnMsIGRlZmF1bHRfZW1haWxfb3B0aW9ucyk7XG5cbiAgaWYgKG9wdGlvbnMucmVxdWlyZV9kaXNwbGF5X25hbWUgfHwgb3B0aW9ucy5hbGxvd19kaXNwbGF5X25hbWUpIHtcbiAgICB2YXIgZGlzcGxheV9lbWFpbCA9IHN0ci5tYXRjaChkaXNwbGF5TmFtZSk7XG4gICAgaWYgKGRpc3BsYXlfZW1haWwpIHtcbiAgICAgIHN0ciA9IGRpc3BsYXlfZW1haWxbMV07XG4gICAgfSBlbHNlIGlmIChvcHRpb25zLnJlcXVpcmVfZGlzcGxheV9uYW1lKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgdmFyIHBhcnRzID0gc3RyLnNwbGl0KCdAJyk7XG4gIHZhciBkb21haW4gPSBwYXJ0cy5wb3AoKTtcbiAgdmFyIHVzZXIgPSBwYXJ0cy5qb2luKCdAJyk7XG5cbiAgdmFyIGxvd2VyX2RvbWFpbiA9IGRvbWFpbi50b0xvd2VyQ2FzZSgpO1xuICBpZiAobG93ZXJfZG9tYWluID09PSAnZ21haWwuY29tJyB8fCBsb3dlcl9kb21haW4gPT09ICdnb29nbGVtYWlsLmNvbScpIHtcbiAgICB1c2VyID0gdXNlci5yZXBsYWNlKC9cXC4vZywgJycpLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICBpZiAoISgwLCBfaXNCeXRlTGVuZ3RoMi5kZWZhdWx0KSh1c2VyLCB7IG1heDogNjQgfSkgfHwgISgwLCBfaXNCeXRlTGVuZ3RoMi5kZWZhdWx0KShkb21haW4sIHsgbWF4OiAyNTQgfSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoISgwLCBfaXNGUUROMi5kZWZhdWx0KShkb21haW4sIHsgcmVxdWlyZV90bGQ6IG9wdGlvbnMucmVxdWlyZV90bGQgfSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAodXNlclswXSA9PT0gJ1wiJykge1xuICAgIHVzZXIgPSB1c2VyLnNsaWNlKDEsIHVzZXIubGVuZ3RoIC0gMSk7XG4gICAgcmV0dXJuIG9wdGlvbnMuYWxsb3dfdXRmOF9sb2NhbF9wYXJ0ID8gcXVvdGVkRW1haWxVc2VyVXRmOC50ZXN0KHVzZXIpIDogcXVvdGVkRW1haWxVc2VyLnRlc3QodXNlcik7XG4gIH1cblxuICB2YXIgcGF0dGVybiA9IG9wdGlvbnMuYWxsb3dfdXRmOF9sb2NhbF9wYXJ0ID8gZW1haWxVc2VyVXRmOFBhcnQgOiBlbWFpbFVzZXJQYXJ0O1xuXG4gIHZhciB1c2VyX3BhcnRzID0gdXNlci5zcGxpdCgnLicpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHVzZXJfcGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoIXBhdHRlcm4udGVzdCh1c2VyX3BhcnRzW2ldKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNFbXB0eTtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIGlzRW1wdHkoc3RyKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gc3RyLmxlbmd0aCA9PT0gMDtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGlzRkRRTjtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbnZhciBfbWVyZ2UgPSByZXF1aXJlKCcuL3V0aWwvbWVyZ2UnKTtcblxudmFyIF9tZXJnZTIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9tZXJnZSk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbnZhciBkZWZhdWx0X2ZxZG5fb3B0aW9ucyA9IHtcbiAgcmVxdWlyZV90bGQ6IHRydWUsXG4gIGFsbG93X3VuZGVyc2NvcmVzOiBmYWxzZSxcbiAgYWxsb3dfdHJhaWxpbmdfZG90OiBmYWxzZVxufTtcblxuZnVuY3Rpb24gaXNGRFFOKHN0ciwgb3B0aW9ucykge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgb3B0aW9ucyA9ICgwLCBfbWVyZ2UyLmRlZmF1bHQpKG9wdGlvbnMsIGRlZmF1bHRfZnFkbl9vcHRpb25zKTtcblxuICAvKiBSZW1vdmUgdGhlIG9wdGlvbmFsIHRyYWlsaW5nIGRvdCBiZWZvcmUgY2hlY2tpbmcgdmFsaWRpdHkgKi9cbiAgaWYgKG9wdGlvbnMuYWxsb3dfdHJhaWxpbmdfZG90ICYmIHN0cltzdHIubGVuZ3RoIC0gMV0gPT09ICcuJykge1xuICAgIHN0ciA9IHN0ci5zdWJzdHJpbmcoMCwgc3RyLmxlbmd0aCAtIDEpO1xuICB9XG4gIHZhciBwYXJ0cyA9IHN0ci5zcGxpdCgnLicpO1xuICBpZiAob3B0aW9ucy5yZXF1aXJlX3RsZCkge1xuICAgIHZhciB0bGQgPSBwYXJ0cy5wb3AoKTtcbiAgICBpZiAoIXBhcnRzLmxlbmd0aCB8fCAhL14oW2EtelxcdTAwYTEtXFx1ZmZmZl17Mix9fHhuW2EtejAtOS1dezIsfSkkL2kudGVzdCh0bGQpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIGRpc2FsbG93IHNwYWNlc1xuICAgIGlmICgvW1xcc1xcdTIwMDItXFx1MjAwQlxcdTIwMkZcXHUyMDVGXFx1MzAwMFxcdUZFRkZcXHVEQjQwXFx1REMyMF0vLnRlc3QodGxkKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICBmb3IgKHZhciBwYXJ0LCBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgcGFydCA9IHBhcnRzW2ldO1xuICAgIGlmIChvcHRpb25zLmFsbG93X3VuZGVyc2NvcmVzKSB7XG4gICAgICBwYXJ0ID0gcGFydC5yZXBsYWNlKC9fL2csICcnKTtcbiAgICB9XG4gICAgaWYgKCEvXlthLXpcXHUwMGExLVxcdWZmZmYwLTktXSskL2kudGVzdChwYXJ0KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvLyBkaXNhbGxvdyBmdWxsLXdpZHRoIGNoYXJzXG4gICAgaWYgKC9bXFx1ZmYwMS1cXHVmZjVlXS8udGVzdChwYXJ0KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAocGFydFswXSA9PT0gJy0nIHx8IHBhcnRbcGFydC5sZW5ndGggLSAxXSA9PT0gJy0nKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNGbG9hdDtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbnZhciBmbG9hdCA9IC9eKD86Wy0rXSk/KD86WzAtOV0rKT8oPzpcXC5bMC05XSopPyg/OltlRV1bXFwrXFwtXT8oPzpbMC05XSspKT8kLztcblxuZnVuY3Rpb24gaXNGbG9hdChzdHIsIG9wdGlvbnMpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoc3RyID09PSAnJyB8fCBzdHIgPT09ICcuJykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gZmxvYXQudGVzdChzdHIpICYmICghb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eSgnbWluJykgfHwgc3RyID49IG9wdGlvbnMubWluKSAmJiAoIW9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ21heCcpIHx8IHN0ciA8PSBvcHRpb25zLm1heCkgJiYgKCFvcHRpb25zLmhhc093blByb3BlcnR5KCdsdCcpIHx8IHN0ciA8IG9wdGlvbnMubHQpICYmICghb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eSgnZ3QnKSB8fCBzdHIgPiBvcHRpb25zLmd0KTtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZnVsbFdpZHRoID0gdW5kZWZpbmVkO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNGdWxsV2lkdGg7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgZnVsbFdpZHRoID0gZXhwb3J0cy5mdWxsV2lkdGggPSAvW15cXHUwMDIwLVxcdTAwN0VcXHVGRjYxLVxcdUZGOUZcXHVGRkEwLVxcdUZGRENcXHVGRkU4LVxcdUZGRUUwLTlhLXpBLVpdLztcblxuZnVuY3Rpb24gaXNGdWxsV2lkdGgoc3RyKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gZnVsbFdpZHRoLnRlc3Qoc3RyKTtcbn0iLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmhhbGZXaWR0aCA9IHVuZGVmaW5lZDtcbmV4cG9ydHMuZGVmYXVsdCA9IGlzSGFsZldpZHRoO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxudmFyIGhhbGZXaWR0aCA9IGV4cG9ydHMuaGFsZldpZHRoID0gL1tcXHUwMDIwLVxcdTAwN0VcXHVGRjYxLVxcdUZGOUZcXHVGRkEwLVxcdUZGRENcXHVGRkU4LVxcdUZGRUUwLTlhLXpBLVpdLztcblxuZnVuY3Rpb24gaXNIYWxmV2lkdGgoc3RyKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gaGFsZldpZHRoLnRlc3Qoc3RyKTtcbn0iLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0hhc2g7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgbGVuZ3RocyA9IHtcbiAgbWQ1OiAzMixcbiAgbWQ0OiAzMixcbiAgc2hhMTogNDAsXG4gIHNoYTI1NjogNjQsXG4gIHNoYTM4NDogOTYsXG4gIHNoYTUxMjogMTI4LFxuICByaXBlbWQxMjg6IDMyLFxuICByaXBlbWQxNjA6IDQwLFxuICB0aWdlcjEyODogMzIsXG4gIHRpZ2VyMTYwOiA0MCxcbiAgdGlnZXIxOTI6IDQ4LFxuICBjcmMzMjogOCxcbiAgY3JjMzJiOiA4XG59O1xuXG5mdW5jdGlvbiBpc0hhc2goc3RyLCBhbGdvcml0aG0pIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHZhciBoYXNoID0gbmV3IFJlZ0V4cCgnXlthLWYwLTldeycgKyBsZW5ndGhzW2FsZ29yaXRobV0gKyAnfSQnKTtcbiAgcmV0dXJuIGhhc2gudGVzdChzdHIpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNIZXhDb2xvcjtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbnZhciBoZXhjb2xvciA9IC9eIz8oWzAtOUEtRl17M318WzAtOUEtRl17Nn0pJC9pO1xuXG5mdW5jdGlvbiBpc0hleENvbG9yKHN0cikge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgcmV0dXJuIGhleGNvbG9yLnRlc3Qoc3RyKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGlzSGV4YWRlY2ltYWw7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgaGV4YWRlY2ltYWwgPSAvXlswLTlBLUZdKyQvaTtcblxuZnVuY3Rpb24gaXNIZXhhZGVjaW1hbChzdHIpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHJldHVybiBoZXhhZGVjaW1hbC50ZXN0KHN0cik7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0lQO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxudmFyIGlwdjRNYXliZSA9IC9eKFxcZHsxLDN9KVxcLihcXGR7MSwzfSlcXC4oXFxkezEsM30pXFwuKFxcZHsxLDN9KSQvO1xudmFyIGlwdjZCbG9jayA9IC9eWzAtOUEtRl17MSw0fSQvaTtcblxuZnVuY3Rpb24gaXNJUChzdHIpIHtcbiAgdmFyIHZlcnNpb24gPSBhcmd1bWVudHMubGVuZ3RoID4gMSAmJiBhcmd1bWVudHNbMV0gIT09IHVuZGVmaW5lZCA/IGFyZ3VtZW50c1sxXSA6ICcnO1xuXG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICB2ZXJzaW9uID0gU3RyaW5nKHZlcnNpb24pO1xuICBpZiAoIXZlcnNpb24pIHtcbiAgICByZXR1cm4gaXNJUChzdHIsIDQpIHx8IGlzSVAoc3RyLCA2KTtcbiAgfSBlbHNlIGlmICh2ZXJzaW9uID09PSAnNCcpIHtcbiAgICBpZiAoIWlwdjRNYXliZS50ZXN0KHN0cikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgdmFyIHBhcnRzID0gc3RyLnNwbGl0KCcuJykuc29ydChmdW5jdGlvbiAoYSwgYikge1xuICAgICAgcmV0dXJuIGEgLSBiO1xuICAgIH0pO1xuICAgIHJldHVybiBwYXJ0c1szXSA8PSAyNTU7XG4gIH0gZWxzZSBpZiAodmVyc2lvbiA9PT0gJzYnKSB7XG4gICAgdmFyIGJsb2NrcyA9IHN0ci5zcGxpdCgnOicpO1xuICAgIHZhciBmb3VuZE9taXNzaW9uQmxvY2sgPSBmYWxzZTsgLy8gbWFya2VyIHRvIGluZGljYXRlIDo6XG5cbiAgICAvLyBBdCBsZWFzdCBzb21lIE9TIGFjY2VwdCB0aGUgbGFzdCAzMiBiaXRzIG9mIGFuIElQdjYgYWRkcmVzc1xuICAgIC8vIChpLmUuIDIgb2YgdGhlIGJsb2NrcykgaW4gSVB2NCBub3RhdGlvbiwgYW5kIFJGQyAzNDkzIHNheXNcbiAgICAvLyB0aGF0ICc6OmZmZmY6YS5iLmMuZCcgaXMgdmFsaWQgZm9yIElQdjQtbWFwcGVkIElQdjYgYWRkcmVzc2VzLFxuICAgIC8vIGFuZCAnOjphLmIuYy5kJyBpcyBkZXByZWNhdGVkLCBidXQgYWxzbyB2YWxpZC5cbiAgICB2YXIgZm91bmRJUHY0VHJhbnNpdGlvbkJsb2NrID0gaXNJUChibG9ja3NbYmxvY2tzLmxlbmd0aCAtIDFdLCA0KTtcbiAgICB2YXIgZXhwZWN0ZWROdW1iZXJPZkJsb2NrcyA9IGZvdW5kSVB2NFRyYW5zaXRpb25CbG9jayA/IDcgOiA4O1xuXG4gICAgaWYgKGJsb2Nrcy5sZW5ndGggPiBleHBlY3RlZE51bWJlck9mQmxvY2tzKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIGluaXRpYWwgb3IgZmluYWwgOjpcbiAgICBpZiAoc3RyID09PSAnOjonKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKHN0ci5zdWJzdHIoMCwgMikgPT09ICc6OicpIHtcbiAgICAgIGJsb2Nrcy5zaGlmdCgpO1xuICAgICAgYmxvY2tzLnNoaWZ0KCk7XG4gICAgICBmb3VuZE9taXNzaW9uQmxvY2sgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoc3RyLnN1YnN0cihzdHIubGVuZ3RoIC0gMikgPT09ICc6OicpIHtcbiAgICAgIGJsb2Nrcy5wb3AoKTtcbiAgICAgIGJsb2Nrcy5wb3AoKTtcbiAgICAgIGZvdW5kT21pc3Npb25CbG9jayA9IHRydWU7XG4gICAgfVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBibG9ja3MubGVuZ3RoOyArK2kpIHtcbiAgICAgIC8vIHRlc3QgZm9yIGEgOjogd2hpY2ggY2FuIG5vdCBiZSBhdCB0aGUgc3RyaW5nIHN0YXJ0L2VuZFxuICAgICAgLy8gc2luY2UgdGhvc2UgY2FzZXMgaGF2ZSBiZWVuIGhhbmRsZWQgYWJvdmVcbiAgICAgIGlmIChibG9ja3NbaV0gPT09ICcnICYmIGkgPiAwICYmIGkgPCBibG9ja3MubGVuZ3RoIC0gMSkge1xuICAgICAgICBpZiAoZm91bmRPbWlzc2lvbkJsb2NrKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBtdWx0aXBsZSA6OiBpbiBhZGRyZXNzXG4gICAgICAgIH1cbiAgICAgICAgZm91bmRPbWlzc2lvbkJsb2NrID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSBpZiAoZm91bmRJUHY0VHJhbnNpdGlvbkJsb2NrICYmIGkgPT09IGJsb2Nrcy5sZW5ndGggLSAxKSB7XG4gICAgICAgIC8vIGl0IGhhcyBiZWVuIGNoZWNrZWQgYmVmb3JlIHRoYXQgdGhlIGxhc3RcbiAgICAgICAgLy8gYmxvY2sgaXMgYSB2YWxpZCBJUHY0IGFkZHJlc3NcbiAgICAgIH0gZWxzZSBpZiAoIWlwdjZCbG9jay50ZXN0KGJsb2Nrc1tpXSkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZm91bmRPbWlzc2lvbkJsb2NrKSB7XG4gICAgICByZXR1cm4gYmxvY2tzLmxlbmd0aCA+PSAxO1xuICAgIH1cbiAgICByZXR1cm4gYmxvY2tzLmxlbmd0aCA9PT0gZXhwZWN0ZWROdW1iZXJPZkJsb2NrcztcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0lTQk47XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgaXNibjEwTWF5YmUgPSAvXig/OlswLTldezl9WHxbMC05XXsxMH0pJC87XG52YXIgaXNibjEzTWF5YmUgPSAvXig/OlswLTldezEzfSkkLztcbnZhciBmYWN0b3IgPSBbMSwgM107XG5cbmZ1bmN0aW9uIGlzSVNCTihzdHIpIHtcbiAgdmFyIHZlcnNpb24gPSBhcmd1bWVudHMubGVuZ3RoID4gMSAmJiBhcmd1bWVudHNbMV0gIT09IHVuZGVmaW5lZCA/IGFyZ3VtZW50c1sxXSA6ICcnO1xuXG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICB2ZXJzaW9uID0gU3RyaW5nKHZlcnNpb24pO1xuICBpZiAoIXZlcnNpb24pIHtcbiAgICByZXR1cm4gaXNJU0JOKHN0ciwgMTApIHx8IGlzSVNCTihzdHIsIDEzKTtcbiAgfVxuICB2YXIgc2FuaXRpemVkID0gc3RyLnJlcGxhY2UoL1tcXHMtXSsvZywgJycpO1xuICB2YXIgY2hlY2tzdW0gPSAwO1xuICB2YXIgaSA9IHZvaWQgMDtcbiAgaWYgKHZlcnNpb24gPT09ICcxMCcpIHtcbiAgICBpZiAoIWlzYm4xME1heWJlLnRlc3Qoc2FuaXRpemVkKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGkgPSAwOyBpIDwgOTsgaSsrKSB7XG4gICAgICBjaGVja3N1bSArPSAoaSArIDEpICogc2FuaXRpemVkLmNoYXJBdChpKTtcbiAgICB9XG4gICAgaWYgKHNhbml0aXplZC5jaGFyQXQoOSkgPT09ICdYJykge1xuICAgICAgY2hlY2tzdW0gKz0gMTAgKiAxMDtcbiAgICB9IGVsc2Uge1xuICAgICAgY2hlY2tzdW0gKz0gMTAgKiBzYW5pdGl6ZWQuY2hhckF0KDkpO1xuICAgIH1cbiAgICBpZiAoY2hlY2tzdW0gJSAxMSA9PT0gMCkge1xuICAgICAgcmV0dXJuICEhc2FuaXRpemVkO1xuICAgIH1cbiAgfSBlbHNlIGlmICh2ZXJzaW9uID09PSAnMTMnKSB7XG4gICAgaWYgKCFpc2JuMTNNYXliZS50ZXN0KHNhbml0aXplZCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgZm9yIChpID0gMDsgaSA8IDEyOyBpKyspIHtcbiAgICAgIGNoZWNrc3VtICs9IGZhY3RvcltpICUgMl0gKiBzYW5pdGl6ZWQuY2hhckF0KGkpO1xuICAgIH1cbiAgICBpZiAoc2FuaXRpemVkLmNoYXJBdCgxMikgLSAoMTAgLSBjaGVja3N1bSAlIDEwKSAlIDEwID09PSAwKSB7XG4gICAgICByZXR1cm4gISFzYW5pdGl6ZWQ7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGlzSVNJTjtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbnZhciBpc2luID0gL15bQS1aXXsyfVswLTlBLVpdezl9WzAtOV0kLztcblxuZnVuY3Rpb24gaXNJU0lOKHN0cikge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgaWYgKCFpc2luLnRlc3Qoc3RyKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHZhciBjaGVja3N1bVN0ciA9IHN0ci5yZXBsYWNlKC9bQS1aXS9nLCBmdW5jdGlvbiAoY2hhcmFjdGVyKSB7XG4gICAgcmV0dXJuIHBhcnNlSW50KGNoYXJhY3RlciwgMzYpO1xuICB9KTtcblxuICB2YXIgc3VtID0gMDtcbiAgdmFyIGRpZ2l0ID0gdm9pZCAwO1xuICB2YXIgdG1wTnVtID0gdm9pZCAwO1xuICB2YXIgc2hvdWxkRG91YmxlID0gdHJ1ZTtcbiAgZm9yICh2YXIgaSA9IGNoZWNrc3VtU3RyLmxlbmd0aCAtIDI7IGkgPj0gMDsgaS0tKSB7XG4gICAgZGlnaXQgPSBjaGVja3N1bVN0ci5zdWJzdHJpbmcoaSwgaSArIDEpO1xuICAgIHRtcE51bSA9IHBhcnNlSW50KGRpZ2l0LCAxMCk7XG4gICAgaWYgKHNob3VsZERvdWJsZSkge1xuICAgICAgdG1wTnVtICo9IDI7XG4gICAgICBpZiAodG1wTnVtID49IDEwKSB7XG4gICAgICAgIHN1bSArPSB0bXBOdW0gKyAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3VtICs9IHRtcE51bTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3VtICs9IHRtcE51bTtcbiAgICB9XG4gICAgc2hvdWxkRG91YmxlID0gIXNob3VsZERvdWJsZTtcbiAgfVxuXG4gIHJldHVybiBwYXJzZUludChzdHIuc3Vic3RyKHN0ci5sZW5ndGggLSAxKSwgMTApID09PSAoMTAwMDAgLSBzdW0pICUgMTA7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0lTTzg2MDE7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG4vKiBlc2xpbnQtZGlzYWJsZSBtYXgtbGVuICovXG4vLyBmcm9tIGh0dHA6Ly9nb28uZ2wvMGVqSEhXXG52YXIgaXNvODYwMSA9IC9eKFtcXCstXT9cXGR7NH0oPyFcXGR7Mn1cXGIpKSgoLT8pKCgwWzEtOV18MVswLTJdKShcXDMoWzEyXVxcZHwwWzEtOV18M1swMV0pKT98VyhbMC00XVxcZHw1WzAtMl0pKC0/WzEtN10pP3woMDBbMS05XXwwWzEtOV1cXGR8WzEyXVxcZHsyfXwzKFswLTVdXFxkfDZbMS02XSkpKShbVFxcc10oKChbMDFdXFxkfDJbMC0zXSkoKDo/KVswLTVdXFxkKT98MjQ6PzAwKShbXFwuLF1cXGQrKD8hOikpPyk/KFxcMTdbMC01XVxcZChbXFwuLF1cXGQrKT8pPyhbelpdfChbXFwrLV0pKFswMV1cXGR8MlswLTNdKTo/KFswLTVdXFxkKT8pPyk/KT8kLztcbi8qIGVzbGludC1lbmFibGUgbWF4LWxlbiAqL1xuXG5mdW5jdGlvbiBpc0lTTzg2MDEoc3RyKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gaXNvODYwMS50ZXN0KHN0cik7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0lTUkM7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG4vLyBzZWUgaHR0cDovL2lzcmMuaWZwaS5vcmcvZW4vaXNyYy1zdGFuZGFyZC9jb2RlLXN5bnRheFxudmFyIGlzcmMgPSAvXltBLVpdezJ9WzAtOUEtWl17M31cXGR7Mn1cXGR7NX0kLztcblxuZnVuY3Rpb24gaXNJU1JDKHN0cikge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgcmV0dXJuIGlzcmMudGVzdChzdHIpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNJU1NOO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxudmFyIGlzc24gPSAnXlxcXFxkezR9LT9cXFxcZHszfVtcXFxcZFhdJCc7XG5cbmZ1bmN0aW9uIGlzSVNTTihzdHIpIHtcbiAgdmFyIG9wdGlvbnMgPSBhcmd1bWVudHMubGVuZ3RoID4gMSAmJiBhcmd1bWVudHNbMV0gIT09IHVuZGVmaW5lZCA/IGFyZ3VtZW50c1sxXSA6IHt9O1xuXG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICB2YXIgdGVzdElzc24gPSBpc3NuO1xuICB0ZXN0SXNzbiA9IG9wdGlvbnMucmVxdWlyZV9oeXBoZW4gPyB0ZXN0SXNzbi5yZXBsYWNlKCc/JywgJycpIDogdGVzdElzc247XG4gIHRlc3RJc3NuID0gb3B0aW9ucy5jYXNlX3NlbnNpdGl2ZSA/IG5ldyBSZWdFeHAodGVzdElzc24pIDogbmV3IFJlZ0V4cCh0ZXN0SXNzbiwgJ2knKTtcbiAgaWYgKCF0ZXN0SXNzbi50ZXN0KHN0cikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdmFyIGlzc25EaWdpdHMgPSBzdHIucmVwbGFjZSgnLScsICcnKTtcbiAgdmFyIHBvc2l0aW9uID0gODtcbiAgdmFyIGNoZWNrc3VtID0gMDtcbiAgdmFyIF9pdGVyYXRvck5vcm1hbENvbXBsZXRpb24gPSB0cnVlO1xuICB2YXIgX2RpZEl0ZXJhdG9yRXJyb3IgPSBmYWxzZTtcbiAgdmFyIF9pdGVyYXRvckVycm9yID0gdW5kZWZpbmVkO1xuXG4gIHRyeSB7XG4gICAgZm9yICh2YXIgX2l0ZXJhdG9yID0gaXNzbkRpZ2l0c1tTeW1ib2wuaXRlcmF0b3JdKCksIF9zdGVwOyAhKF9pdGVyYXRvck5vcm1hbENvbXBsZXRpb24gPSAoX3N0ZXAgPSBfaXRlcmF0b3IubmV4dCgpKS5kb25lKTsgX2l0ZXJhdG9yTm9ybWFsQ29tcGxldGlvbiA9IHRydWUpIHtcbiAgICAgIHZhciBkaWdpdCA9IF9zdGVwLnZhbHVlO1xuXG4gICAgICB2YXIgZGlnaXRWYWx1ZSA9IGRpZ2l0LnRvVXBwZXJDYXNlKCkgPT09ICdYJyA/IDEwIDogK2RpZ2l0O1xuICAgICAgY2hlY2tzdW0gKz0gZGlnaXRWYWx1ZSAqIHBvc2l0aW9uO1xuICAgICAgLS1wb3NpdGlvbjtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIF9kaWRJdGVyYXRvckVycm9yID0gdHJ1ZTtcbiAgICBfaXRlcmF0b3JFcnJvciA9IGVycjtcbiAgfSBmaW5hbGx5IHtcbiAgICB0cnkge1xuICAgICAgaWYgKCFfaXRlcmF0b3JOb3JtYWxDb21wbGV0aW9uICYmIF9pdGVyYXRvci5yZXR1cm4pIHtcbiAgICAgICAgX2l0ZXJhdG9yLnJldHVybigpO1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICBpZiAoX2RpZEl0ZXJhdG9yRXJyb3IpIHtcbiAgICAgICAgdGhyb3cgX2l0ZXJhdG9yRXJyb3I7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGNoZWNrc3VtICUgMTEgPT09IDA7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5cbnZhciBfdHlwZW9mID0gdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiICYmIHR5cGVvZiBTeW1ib2wuaXRlcmF0b3IgPT09IFwic3ltYm9sXCIgPyBmdW5jdGlvbiAob2JqKSB7IHJldHVybiB0eXBlb2Ygb2JqOyB9IDogZnVuY3Rpb24gKG9iaikgeyByZXR1cm4gb2JqICYmIHR5cGVvZiBTeW1ib2wgPT09IFwiZnVuY3Rpb25cIiAmJiBvYmouY29uc3RydWN0b3IgPT09IFN5bWJvbCAmJiBvYmogIT09IFN5bWJvbC5wcm90b3R5cGUgPyBcInN5bWJvbFwiIDogdHlwZW9mIG9iajsgfTtcblxuZXhwb3J0cy5kZWZhdWx0ID0gaXNJbjtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbnZhciBfdG9TdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvdG9TdHJpbmcnKTtcblxudmFyIF90b1N0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF90b1N0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIGlzSW4oc3RyLCBvcHRpb25zKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICB2YXIgaSA9IHZvaWQgMDtcbiAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvcHRpb25zKSA9PT0gJ1tvYmplY3QgQXJyYXldJykge1xuICAgIHZhciBhcnJheSA9IFtdO1xuICAgIGZvciAoaSBpbiBvcHRpb25zKSB7XG4gICAgICBpZiAoe30uaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCBpKSkge1xuICAgICAgICBhcnJheVtpXSA9ICgwLCBfdG9TdHJpbmcyLmRlZmF1bHQpKG9wdGlvbnNbaV0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXJyYXkuaW5kZXhPZihzdHIpID49IDA7XG4gIH0gZWxzZSBpZiAoKHR5cGVvZiBvcHRpb25zID09PSAndW5kZWZpbmVkJyA/ICd1bmRlZmluZWQnIDogX3R5cGVvZihvcHRpb25zKSkgPT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIG9wdGlvbnMuaGFzT3duUHJvcGVydHkoc3RyKTtcbiAgfSBlbHNlIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLmluZGV4T2YgPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gb3B0aW9ucy5pbmRleE9mKHN0cikgPj0gMDtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc0ludDtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbnZhciBpbnQgPSAvXig/OlstK10/KD86MHxbMS05XVswLTldKikpJC87XG52YXIgaW50TGVhZGluZ1plcm9lcyA9IC9eWy0rXT9bMC05XSskLztcblxuZnVuY3Rpb24gaXNJbnQoc3RyLCBvcHRpb25zKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAvLyBHZXQgdGhlIHJlZ2V4IHRvIHVzZSBmb3IgdGVzdGluZywgYmFzZWQgb24gd2hldGhlclxuICAvLyBsZWFkaW5nIHplcm9lcyBhcmUgYWxsb3dlZCBvciBub3QuXG4gIHZhciByZWdleCA9IG9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ2FsbG93X2xlYWRpbmdfemVyb2VzJykgJiYgIW9wdGlvbnMuYWxsb3dfbGVhZGluZ196ZXJvZXMgPyBpbnQgOiBpbnRMZWFkaW5nWmVyb2VzO1xuXG4gIC8vIENoZWNrIG1pbi9tYXgvbHQvZ3RcbiAgdmFyIG1pbkNoZWNrUGFzc2VkID0gIW9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ21pbicpIHx8IHN0ciA+PSBvcHRpb25zLm1pbjtcbiAgdmFyIG1heENoZWNrUGFzc2VkID0gIW9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ21heCcpIHx8IHN0ciA8PSBvcHRpb25zLm1heDtcbiAgdmFyIGx0Q2hlY2tQYXNzZWQgPSAhb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eSgnbHQnKSB8fCBzdHIgPCBvcHRpb25zLmx0O1xuICB2YXIgZ3RDaGVja1Bhc3NlZCA9ICFvcHRpb25zLmhhc093blByb3BlcnR5KCdndCcpIHx8IHN0ciA+IG9wdGlvbnMuZ3Q7XG5cbiAgcmV0dXJuIHJlZ2V4LnRlc3Qoc3RyKSAmJiBtaW5DaGVja1Bhc3NlZCAmJiBtYXhDaGVja1Bhc3NlZCAmJiBsdENoZWNrUGFzc2VkICYmIGd0Q2hlY2tQYXNzZWQ7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5cbnZhciBfdHlwZW9mID0gdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiICYmIHR5cGVvZiBTeW1ib2wuaXRlcmF0b3IgPT09IFwic3ltYm9sXCIgPyBmdW5jdGlvbiAob2JqKSB7IHJldHVybiB0eXBlb2Ygb2JqOyB9IDogZnVuY3Rpb24gKG9iaikgeyByZXR1cm4gb2JqICYmIHR5cGVvZiBTeW1ib2wgPT09IFwiZnVuY3Rpb25cIiAmJiBvYmouY29uc3RydWN0b3IgPT09IFN5bWJvbCAmJiBvYmogIT09IFN5bWJvbC5wcm90b3R5cGUgPyBcInN5bWJvbFwiIDogdHlwZW9mIG9iajsgfTtcblxuZXhwb3J0cy5kZWZhdWx0ID0gaXNKU09OO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gaXNKU09OKHN0cikge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgdHJ5IHtcbiAgICB2YXIgb2JqID0gSlNPTi5wYXJzZShzdHIpO1xuICAgIHJldHVybiAhIW9iaiAmJiAodHlwZW9mIG9iaiA9PT0gJ3VuZGVmaW5lZCcgPyAndW5kZWZpbmVkJyA6IF90eXBlb2Yob2JqKSkgPT09ICdvYmplY3QnO1xuICB9IGNhdGNoIChlKSB7LyogaWdub3JlICovfVxuICByZXR1cm4gZmFsc2U7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5cbmV4cG9ydHMuZGVmYXVsdCA9IGZ1bmN0aW9uIChzdHIpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIGlmICghc3RyLmluY2x1ZGVzKCcsJykpIHJldHVybiBmYWxzZTtcbiAgdmFyIHBhaXIgPSBzdHIuc3BsaXQoJywnKTtcbiAgcmV0dXJuIGxhdC50ZXN0KHBhaXJbMF0pICYmIGxvbmcudGVzdChwYWlyWzFdKTtcbn07XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgbGF0ID0gL15cXCg/WystXT8oOTAoXFwuMCspP3xbMS04XT9cXGQoXFwuXFxkKyk/KSQvO1xudmFyIGxvbmcgPSAvXlxccz9bKy1dPygxODAoXFwuMCspP3wxWzAtN11cXGQoXFwuXFxkKyk/fFxcZHsxLDJ9KFxcLlxcZCspPylcXCk/JC87XG5cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcblxudmFyIF90eXBlb2YgPSB0eXBlb2YgU3ltYm9sID09PSBcImZ1bmN0aW9uXCIgJiYgdHlwZW9mIFN5bWJvbC5pdGVyYXRvciA9PT0gXCJzeW1ib2xcIiA/IGZ1bmN0aW9uIChvYmopIHsgcmV0dXJuIHR5cGVvZiBvYmo7IH0gOiBmdW5jdGlvbiAob2JqKSB7IHJldHVybiBvYmogJiYgdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiICYmIG9iai5jb25zdHJ1Y3RvciA9PT0gU3ltYm9sICYmIG9iaiAhPT0gU3ltYm9sLnByb3RvdHlwZSA/IFwic3ltYm9sXCIgOiB0eXBlb2Ygb2JqOyB9O1xuXG5leHBvcnRzLmRlZmF1bHQgPSBpc0xlbmd0aDtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbi8qIGVzbGludC1kaXNhYmxlIHByZWZlci1yZXN0LXBhcmFtcyAqL1xuZnVuY3Rpb24gaXNMZW5ndGgoc3RyLCBvcHRpb25zKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICB2YXIgbWluID0gdm9pZCAwO1xuICB2YXIgbWF4ID0gdm9pZCAwO1xuICBpZiAoKHR5cGVvZiBvcHRpb25zID09PSAndW5kZWZpbmVkJyA/ICd1bmRlZmluZWQnIDogX3R5cGVvZihvcHRpb25zKSkgPT09ICdvYmplY3QnKSB7XG4gICAgbWluID0gb3B0aW9ucy5taW4gfHwgMDtcbiAgICBtYXggPSBvcHRpb25zLm1heDtcbiAgfSBlbHNlIHtcbiAgICAvLyBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eTogaXNMZW5ndGgoc3RyLCBtaW4gWywgbWF4XSlcbiAgICBtaW4gPSBhcmd1bWVudHNbMV07XG4gICAgbWF4ID0gYXJndW1lbnRzWzJdO1xuICB9XG4gIHZhciBzdXJyb2dhdGVQYWlycyA9IHN0ci5tYXRjaCgvW1xcdUQ4MDAtXFx1REJGRl1bXFx1REMwMC1cXHVERkZGXS9nKSB8fCBbXTtcbiAgdmFyIGxlbiA9IHN0ci5sZW5ndGggLSBzdXJyb2dhdGVQYWlycy5sZW5ndGg7XG4gIHJldHVybiBsZW4gPj0gbWluICYmICh0eXBlb2YgbWF4ID09PSAndW5kZWZpbmVkJyB8fCBsZW4gPD0gbWF4KTtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGlzTG93ZXJjYXNlO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gaXNMb3dlcmNhc2Uoc3RyKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gc3RyID09PSBzdHIudG9Mb3dlckNhc2UoKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGlzTUFDQWRkcmVzcztcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbnZhciBtYWNBZGRyZXNzID0gL14oWzAtOWEtZkEtRl1bMC05YS1mQS1GXTopezV9KFswLTlhLWZBLUZdWzAtOWEtZkEtRl0pJC87XG5cbmZ1bmN0aW9uIGlzTUFDQWRkcmVzcyhzdHIpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHJldHVybiBtYWNBZGRyZXNzLnRlc3Qoc3RyKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGlzTUQ1O1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxudmFyIG1kNSA9IC9eW2EtZjAtOV17MzJ9JC87XG5cbmZ1bmN0aW9uIGlzTUQ1KHN0cikge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgcmV0dXJuIG1kNS50ZXN0KHN0cik7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc01vYmlsZVBob25lO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuLyogZXNsaW50LWRpc2FibGUgbWF4LWxlbiAqL1xudmFyIHBob25lcyA9IHtcbiAgJ2FyLUFFJzogL14oKFxcKz85NzEpfDApPzVbMDI0NTY4XVxcZHs3fSQvLFxuICAnYXItRFonOiAvXihcXCs/MjEzfDApKDV8Nnw3KVxcZHs4fSQvLFxuICAnYXItRUcnOiAvXigoXFwrPzIwKXwwKT8xWzAxMl1cXGR7OH0kLyxcbiAgJ2FyLUpPJzogL14oXFwrPzk2MnwwKT83Wzc4OV1cXGR7N30kLyxcbiAgJ2FyLVNZJzogL14oIT8oXFwrPzk2Myl8MCk/OVxcZHs4fSQvLFxuICAnYXItU0EnOiAvXighPyhcXCs/OTY2KXwwKT81XFxkezh9JC8sXG4gICdlbi1VUyc6IC9eKFxcKz8xKT9bMi05XVxcZHsyfVsyLTldKD8hMTEpXFxkezZ9JC8sXG4gICdjcy1DWic6IC9eKFxcKz80MjApPyA/WzEtOV1bMC05XXsyfSA/WzAtOV17M30gP1swLTldezN9JC8sXG4gICdzay1TSyc6IC9eKFxcKz80MjEpPyA/WzEtOV1bMC05XXsyfSA/WzAtOV17M30gP1swLTldezN9JC8sXG4gICdkZS1ERSc6IC9eKFxcKz80OVsgXFwuXFwtXSk/KFtcXChdezF9WzAtOV17MSw2fVtcXCldKT8oWzAtOSBcXC5cXC1cXC9dezMsMjB9KSgoeHxleHR8ZXh0ZW5zaW9uKVsgXT9bMC05XXsxLDR9KT8kLyxcbiAgJ2RhLURLJzogL14oXFwrPzQ1KT8oXFxkezh9KSQvLFxuICAnZWwtR1InOiAvXihcXCs/MzApPyg2OVxcZHs4fSkkLyxcbiAgJ2VuLUFVJzogL14oXFwrPzYxfDApNFxcZHs4fSQvLFxuICAnZW4tR0InOiAvXihcXCs/NDR8MCk3XFxkezl9JC8sXG4gICdlbi1ISyc6IC9eKFxcKz84NTJcXC0/KT9bNTY5XVxcZHszfVxcLT9cXGR7NH0kLyxcbiAgJ2VuLUlOJzogL14oXFwrPzkxfDApP1s3ODldXFxkezl9JC8sXG4gICdlbi1LRSc6IC9eKFxcKz8yNTR8MCk/WzddXFxkezh9JC8sXG4gICdlbi1ORyc6IC9eKFxcKz8yMzR8MCk/Wzc4OV1cXGR7OX0kLyxcbiAgJ2VuLU5aJzogL14oXFwrPzY0fDApMlxcZHs3LDl9JC8sXG4gICdlbi1VRyc6IC9eKFxcKz8yNTZ8MCk/WzddXFxkezh9JC8sXG4gICdlbi1SVyc6IC9eKFxcKz8yNTB8MCk/WzddXFxkezh9JC8sXG4gICdlbi1UWic6IC9eKFxcKz8yNTV8MCk/WzY3XVxcZHs4fSQvLFxuICAnZW4tWkEnOiAvXihcXCs/Mjd8MClcXGR7OX0kLyxcbiAgJ2VuLVpNJzogL14oXFwrPzI2KT8wOVs1NjddXFxkezd9JC8sXG4gICdlcy1FUyc6IC9eKFxcKz8zNCk/KDZcXGR7MX18N1sxMjM0XSlcXGR7N30kLyxcbiAgJ2ZpLUZJJzogL14oXFwrPzM1OHwwKVxccz8oNCgwfDF8Mnw0fDV8Nik/fDUwKVxccz8oXFxkXFxzPyl7NCw4fVxcZCQvLFxuICAnZmEtSVInOiAvXihcXCs/OThbXFwtXFxzXT98MCk5WzAtMzldXFxkW1xcLVxcc10/XFxkezN9W1xcLVxcc10/XFxkezR9JC8sXG4gICdmci1GUic6IC9eKFxcKz8zM3wwKVs2N11cXGR7OH0kLyxcbiAgJ2hlLUlMJzogL14oXFwrOTcyfDApKFsyMzQ4OV18NVswMjQ4XXw3NylbMS05XVxcZHs2fS8sXG4gICdodS1IVSc6IC9eKFxcKz8zNikoMjB8MzB8NzApXFxkezd9JC8sXG4gICdsdC1MVCc6IC9eKFxcKzM3MHw4KVxcZHs4fSQvLFxuICAnaWQtSUQnOiAvXihcXCs/NjJ8MFsxLTldKVtcXHN8XFxkXSskLyxcbiAgJ2l0LUlUJzogL14oXFwrPzM5KT9cXHM/M1xcZHsyfSA/XFxkezYsN30kLyxcbiAgJ2tvLUtSJzogL14oKFxcKz84MilbIFxcLV0/KT8wPzEoWzB8MXw2fDd8OHw5XXsxfSlbIFxcLV0/XFxkezMsNH1bIFxcLV0/XFxkezR9JC8sXG4gICdqYS1KUCc6IC9eKFxcKz84MXwwKVxcZHsxLDR9WyBcXC1dP1xcZHsxLDR9WyBcXC1dP1xcZHs0fSQvLFxuICAnbXMtTVknOiAvXihcXCs/Nj8wMSl7MX0oKFsxNDVdezF9KFxcLXxcXHMpP1xcZHs3LDh9KXwoWzIzNjc4OV17MX0oXFxzfFxcLSk/XFxkezd9KSkkLyxcbiAgJ25iLU5PJzogL14oXFwrPzQ3KT9bNDldXFxkezd9JC8sXG4gICdubC1CRSc6IC9eKFxcKz8zMnwwKTQ/XFxkezh9JC8sXG4gICdubi1OTyc6IC9eKFxcKz80Nyk/WzQ5XVxcZHs3fSQvLFxuICAncGwtUEwnOiAvXihcXCs/NDgpPyA/WzUtOF1cXGQgP1xcZHszfSA/XFxkezJ9ID9cXGR7Mn0kLyxcbiAgJ3B0LUJSJzogL14oXFwrPzU1fDApXFwtP1sxLTldezJ9XFwtP1syLTldezF9XFxkezMsNH1cXC0/XFxkezR9JC8sXG4gICdwdC1QVCc6IC9eKFxcKz8zNTEpPzlbMTIzNl1cXGR7N30kLyxcbiAgJ3JvLVJPJzogL14oXFwrPzQ/MClcXHM/N1xcZHsyfShcXC98XFxzfFxcLnxcXC0pP1xcZHszfShcXHN8XFwufFxcLSk/XFxkezN9JC8sXG4gICdlbi1QSyc6IC9eKChcXCs5Mil8KDAwOTIpKS17MCwxfVxcZHszfS17MCwxfVxcZHs3fSR8XlxcZHsxMX0kfF5cXGR7NH0tXFxkezd9JC8sXG4gICdydS1SVSc6IC9eKFxcKz83fDgpPzlcXGR7OX0kLyxcbiAgJ3NyLVJTJzogL14oXFwrMzgxNnwwNilbLSBcXGRdezUsOX0kLyxcbiAgJ3RyLVRSJzogL14oXFwrPzkwfDApPzVcXGR7OX0kLyxcbiAgJ3ZpLVZOJzogL14oXFwrPzg0fDApPygoMSgyKFswLTldKXw2KFsyLTldKXw4OHw5OSkpfCg5KCg/ITUpWzAtOV0pKSkoWzAtOV17N30pJC8sXG4gICd6aC1DTic6IC9eKFxcKz8wPzg2XFwtPyk/MVszNDU3ODldXFxkezl9JC8sXG4gICd6aC1UVyc6IC9eKFxcKz84ODZcXC0/fDApPzlcXGR7OH0kL1xufTtcbi8qIGVzbGludC1lbmFibGUgbWF4LWxlbiAqL1xuXG4vLyBhbGlhc2VzXG5waG9uZXNbJ2VuLUNBJ10gPSBwaG9uZXNbJ2VuLVVTJ107XG5waG9uZXNbJ2ZyLUJFJ10gPSBwaG9uZXNbJ25sLUJFJ107XG5waG9uZXNbJ3poLUhLJ10gPSBwaG9uZXNbJ2VuLUhLJ107XG5cbmZ1bmN0aW9uIGlzTW9iaWxlUGhvbmUoc3RyLCBsb2NhbGUpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIGlmIChsb2NhbGUgaW4gcGhvbmVzKSB7XG4gICAgcmV0dXJuIHBob25lc1tsb2NhbGVdLnRlc3Qoc3RyKTtcbiAgfSBlbHNlIGlmIChsb2NhbGUgPT09ICdhbnknKSB7XG4gICAgZm9yICh2YXIga2V5IGluIHBob25lcykge1xuICAgICAgaWYgKHBob25lcy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIHZhciBwaG9uZSA9IHBob25lc1trZXldO1xuICAgICAgICBpZiAocGhvbmUudGVzdChzdHIpKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb2NhbGUgXFwnJyArIGxvY2FsZSArICdcXCcnKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGlzTW9uZ29JZDtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbnZhciBfaXNIZXhhZGVjaW1hbCA9IHJlcXVpcmUoJy4vaXNIZXhhZGVjaW1hbCcpO1xuXG52YXIgX2lzSGV4YWRlY2ltYWwyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNIZXhhZGVjaW1hbCk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIGlzTW9uZ29JZChzdHIpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHJldHVybiAoMCwgX2lzSGV4YWRlY2ltYWwyLmRlZmF1bHQpKHN0cikgJiYgc3RyLmxlbmd0aCA9PT0gMjQ7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc011bHRpYnl0ZTtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbi8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnRyb2wtcmVnZXggKi9cbnZhciBtdWx0aWJ5dGUgPSAvW15cXHgwMC1cXHg3Rl0vO1xuLyogZXNsaW50LWVuYWJsZSBuby1jb250cm9sLXJlZ2V4ICovXG5cbmZ1bmN0aW9uIGlzTXVsdGlieXRlKHN0cikge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgcmV0dXJuIG11bHRpYnl0ZS50ZXN0KHN0cik7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc051bWVyaWM7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgbnVtZXJpYyA9IC9eWy0rXT9bMC05XSskLztcblxuZnVuY3Rpb24gaXNOdW1lcmljKHN0cikge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgcmV0dXJuIG51bWVyaWMudGVzdChzdHIpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5sb2NhbGVzID0gdW5kZWZpbmVkO1xuXG5leHBvcnRzLmRlZmF1bHQgPSBmdW5jdGlvbiAoc3RyLCBsb2NhbGUpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIGlmIChsb2NhbGUgaW4gcGF0dGVybnMpIHtcbiAgICByZXR1cm4gcGF0dGVybnNbbG9jYWxlXS50ZXN0KHN0cik7XG4gIH0gZWxzZSBpZiAobG9jYWxlID09PSAnYW55Jykge1xuICAgIGZvciAodmFyIGtleSBpbiBwYXR0ZXJucykge1xuICAgICAgaWYgKHBhdHRlcm5zLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgdmFyIHBhdHRlcm4gPSBwYXR0ZXJuc1trZXldO1xuICAgICAgICBpZiAocGF0dGVybi50ZXN0KHN0cikpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxvY2FsZSBcXCcnICsgbG9jYWxlICsgJ1xcJycpO1xufTtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbi8vIGNvbW1vbiBwYXR0ZXJuc1xudmFyIHRocmVlRGlnaXQgPSAvXlxcZHszfSQvO1xudmFyIGZvdXJEaWdpdCA9IC9eXFxkezR9JC87XG52YXIgZml2ZURpZ2l0ID0gL15cXGR7NX0kLztcbnZhciBzaXhEaWdpdCA9IC9eXFxkezZ9JC87XG5cbnZhciBwYXR0ZXJucyA9IHtcbiAgQVQ6IGZvdXJEaWdpdCxcbiAgQVU6IHNpeERpZ2l0LFxuICBCRTogZm91ckRpZ2l0LFxuICBDQTogL15bQUJDRUdISktMTU5QUlNUVlhZXVxcZFtBQkNFR0hKLU5QUlNUVi1aXVtcXHNcXC1dP1xcZFtBQkNFR0hKLU5QUlNUVi1aXVxcZCQvaSxcbiAgQ0g6IGZvdXJEaWdpdCxcbiAgQ1o6IC9eXFxkezN9XFxzP1xcZHsyfSQvLFxuICBERTogZml2ZURpZ2l0LFxuICBESzogZm91ckRpZ2l0LFxuICBEWjogZml2ZURpZ2l0LFxuICBFUzogZml2ZURpZ2l0LFxuICBGSTogZml2ZURpZ2l0LFxuICBGUjogL15cXGR7Mn1cXHM/XFxkezN9JC8sXG4gIEdCOiAvXihnaXJcXHM/MGFhfFthLXpdezEsMn1cXGRbXFxkYS16XT9cXHM/KFxcZFthLXpdezJ9KT8pJC9pLFxuICBHUjogL15cXGR7M31cXHM/XFxkezJ9JC8sXG4gIElMOiBmaXZlRGlnaXQsXG4gIElOOiBzaXhEaWdpdCxcbiAgSVM6IHRocmVlRGlnaXQsXG4gIElUOiBmaXZlRGlnaXQsXG4gIEpQOiAvXlxcZHszfVxcLVxcZHs0fSQvLFxuICBLRTogZml2ZURpZ2l0LFxuICBMSTogL14oOTQ4WzUtOV18OTQ5WzAtN10pJC8sXG4gIE1YOiBmaXZlRGlnaXQsXG4gIE5MOiAvXlxcZHs0fVxccz9bYS16XXsyfSQvaSxcbiAgTk86IGZvdXJEaWdpdCxcbiAgUEw6IC9eXFxkezJ9XFwtXFxkezN9JC8sXG4gIFBUOiAvXlxcZHs0fShcXC1cXGR7M30pPyQvLFxuICBSTzogc2l4RGlnaXQsXG4gIFJVOiBzaXhEaWdpdCxcbiAgU0E6IGZpdmVEaWdpdCxcbiAgU0U6IC9eXFxkezN9XFxzP1xcZHsyfSQvLFxuICBUVzogL15cXGR7M30oXFxkezJ9KT8kLyxcbiAgVVM6IC9eXFxkezV9KC1cXGR7NH0pPyQvLFxuICBaQTogZm91ckRpZ2l0LFxuICBaTTogZml2ZURpZ2l0XG59O1xuXG52YXIgbG9jYWxlcyA9IGV4cG9ydHMubG9jYWxlcyA9IE9iamVjdC5rZXlzKHBhdHRlcm5zKTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBpc1N1cnJvZ2F0ZVBhaXI7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgc3Vycm9nYXRlUGFpciA9IC9bXFx1RDgwMC1cXHVEQkZGXVtcXHVEQzAwLVxcdURGRkZdLztcblxuZnVuY3Rpb24gaXNTdXJyb2dhdGVQYWlyKHN0cikge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgcmV0dXJuIHN1cnJvZ2F0ZVBhaXIudGVzdChzdHIpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNVUkw7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG52YXIgX2lzRlFETiA9IHJlcXVpcmUoJy4vaXNGUUROJyk7XG5cbnZhciBfaXNGUUROMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzRlFETik7XG5cbnZhciBfaXNJUCA9IHJlcXVpcmUoJy4vaXNJUCcpO1xuXG52YXIgX2lzSVAyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfaXNJUCk7XG5cbnZhciBfbWVyZ2UgPSByZXF1aXJlKCcuL3V0aWwvbWVyZ2UnKTtcblxudmFyIF9tZXJnZTIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9tZXJnZSk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbnZhciBkZWZhdWx0X3VybF9vcHRpb25zID0ge1xuICBwcm90b2NvbHM6IFsnaHR0cCcsICdodHRwcycsICdmdHAnXSxcbiAgcmVxdWlyZV90bGQ6IHRydWUsXG4gIHJlcXVpcmVfcHJvdG9jb2w6IGZhbHNlLFxuICByZXF1aXJlX2hvc3Q6IHRydWUsXG4gIHJlcXVpcmVfdmFsaWRfcHJvdG9jb2w6IHRydWUsXG4gIGFsbG93X3VuZGVyc2NvcmVzOiBmYWxzZSxcbiAgYWxsb3dfdHJhaWxpbmdfZG90OiBmYWxzZSxcbiAgYWxsb3dfcHJvdG9jb2xfcmVsYXRpdmVfdXJsczogZmFsc2Vcbn07XG5cbnZhciB3cmFwcGVkX2lwdjYgPSAvXlxcWyhbXlxcXV0rKVxcXSg/OjooWzAtOV0rKSk/JC87XG5cbmZ1bmN0aW9uIGlzUmVnRXhwKG9iaikge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0IFJlZ0V4cF0nO1xufVxuXG5mdW5jdGlvbiBjaGVja0hvc3QoaG9zdCwgbWF0Y2hlcykge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG1hdGNoZXMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgbWF0Y2ggPSBtYXRjaGVzW2ldO1xuICAgIGlmIChob3N0ID09PSBtYXRjaCB8fCBpc1JlZ0V4cChtYXRjaCkgJiYgbWF0Y2gudGVzdChob3N0KSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaXNVUkwodXJsLCBvcHRpb25zKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KSh1cmwpO1xuICBpZiAoIXVybCB8fCB1cmwubGVuZ3RoID49IDIwODMgfHwgL1tcXHM8Pl0vLnRlc3QodXJsKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodXJsLmluZGV4T2YoJ21haWx0bzonKSA9PT0gMCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBvcHRpb25zID0gKDAsIF9tZXJnZTIuZGVmYXVsdCkob3B0aW9ucywgZGVmYXVsdF91cmxfb3B0aW9ucyk7XG4gIHZhciBwcm90b2NvbCA9IHZvaWQgMCxcbiAgICAgIGF1dGggPSB2b2lkIDAsXG4gICAgICBob3N0ID0gdm9pZCAwLFxuICAgICAgaG9zdG5hbWUgPSB2b2lkIDAsXG4gICAgICBwb3J0ID0gdm9pZCAwLFxuICAgICAgcG9ydF9zdHIgPSB2b2lkIDAsXG4gICAgICBzcGxpdCA9IHZvaWQgMCxcbiAgICAgIGlwdjYgPSB2b2lkIDA7XG5cbiAgc3BsaXQgPSB1cmwuc3BsaXQoJyMnKTtcbiAgdXJsID0gc3BsaXQuc2hpZnQoKTtcblxuICBzcGxpdCA9IHVybC5zcGxpdCgnPycpO1xuICB1cmwgPSBzcGxpdC5zaGlmdCgpO1xuXG4gIHNwbGl0ID0gdXJsLnNwbGl0KCc6Ly8nKTtcbiAgaWYgKHNwbGl0Lmxlbmd0aCA+IDEpIHtcbiAgICBwcm90b2NvbCA9IHNwbGl0LnNoaWZ0KCk7XG4gICAgaWYgKG9wdGlvbnMucmVxdWlyZV92YWxpZF9wcm90b2NvbCAmJiBvcHRpb25zLnByb3RvY29scy5pbmRleE9mKHByb3RvY29sKSA9PT0gLTEpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH0gZWxzZSBpZiAob3B0aW9ucy5yZXF1aXJlX3Byb3RvY29sKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9IGVsc2UgaWYgKG9wdGlvbnMuYWxsb3dfcHJvdG9jb2xfcmVsYXRpdmVfdXJscyAmJiB1cmwuc3Vic3RyKDAsIDIpID09PSAnLy8nKSB7XG4gICAgc3BsaXRbMF0gPSB1cmwuc3Vic3RyKDIpO1xuICB9XG4gIHVybCA9IHNwbGl0LmpvaW4oJzovLycpO1xuXG4gIGlmICh1cmwgPT09ICcnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgc3BsaXQgPSB1cmwuc3BsaXQoJy8nKTtcbiAgdXJsID0gc3BsaXQuc2hpZnQoKTtcblxuICBpZiAodXJsID09PSAnJyAmJiAhb3B0aW9ucy5yZXF1aXJlX2hvc3QpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHNwbGl0ID0gdXJsLnNwbGl0KCdAJyk7XG4gIGlmIChzcGxpdC5sZW5ndGggPiAxKSB7XG4gICAgYXV0aCA9IHNwbGl0LnNoaWZ0KCk7XG4gICAgaWYgKGF1dGguaW5kZXhPZignOicpID49IDAgJiYgYXV0aC5zcGxpdCgnOicpLmxlbmd0aCA+IDIpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgaG9zdG5hbWUgPSBzcGxpdC5qb2luKCdAJyk7XG5cbiAgcG9ydF9zdHIgPSBudWxsO1xuICBpcHY2ID0gbnVsbDtcbiAgdmFyIGlwdjZfbWF0Y2ggPSBob3N0bmFtZS5tYXRjaCh3cmFwcGVkX2lwdjYpO1xuICBpZiAoaXB2Nl9tYXRjaCkge1xuICAgIGhvc3QgPSAnJztcbiAgICBpcHY2ID0gaXB2Nl9tYXRjaFsxXTtcbiAgICBwb3J0X3N0ciA9IGlwdjZfbWF0Y2hbMl0gfHwgbnVsbDtcbiAgfSBlbHNlIHtcbiAgICBzcGxpdCA9IGhvc3RuYW1lLnNwbGl0KCc6Jyk7XG4gICAgaG9zdCA9IHNwbGl0LnNoaWZ0KCk7XG4gICAgaWYgKHNwbGl0Lmxlbmd0aCkge1xuICAgICAgcG9ydF9zdHIgPSBzcGxpdC5qb2luKCc6Jyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHBvcnRfc3RyICE9PSBudWxsKSB7XG4gICAgcG9ydCA9IHBhcnNlSW50KHBvcnRfc3RyLCAxMCk7XG4gICAgaWYgKCEvXlswLTldKyQvLnRlc3QocG9ydF9zdHIpIHx8IHBvcnQgPD0gMCB8fCBwb3J0ID4gNjU1MzUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBpZiAoISgwLCBfaXNJUDIuZGVmYXVsdCkoaG9zdCkgJiYgISgwLCBfaXNGUUROMi5kZWZhdWx0KShob3N0LCBvcHRpb25zKSAmJiAoIWlwdjYgfHwgISgwLCBfaXNJUDIuZGVmYXVsdCkoaXB2NiwgNikpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaG9zdCA9IGhvc3QgfHwgaXB2NjtcblxuICBpZiAob3B0aW9ucy5ob3N0X3doaXRlbGlzdCAmJiAhY2hlY2tIb3N0KGhvc3QsIG9wdGlvbnMuaG9zdF93aGl0ZWxpc3QpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChvcHRpb25zLmhvc3RfYmxhY2tsaXN0ICYmIGNoZWNrSG9zdChob3N0LCBvcHRpb25zLmhvc3RfYmxhY2tsaXN0KSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNVVUlEO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxudmFyIHV1aWQgPSB7XG4gIDM6IC9eWzAtOUEtRl17OH0tWzAtOUEtRl17NH0tM1swLTlBLUZdezN9LVswLTlBLUZdezR9LVswLTlBLUZdezEyfSQvaSxcbiAgNDogL15bMC05QS1GXXs4fS1bMC05QS1GXXs0fS00WzAtOUEtRl17M30tWzg5QUJdWzAtOUEtRl17M30tWzAtOUEtRl17MTJ9JC9pLFxuICA1OiAvXlswLTlBLUZdezh9LVswLTlBLUZdezR9LTVbMC05QS1GXXszfS1bODlBQl1bMC05QS1GXXszfS1bMC05QS1GXXsxMn0kL2ksXG4gIGFsbDogL15bMC05QS1GXXs4fS1bMC05QS1GXXs0fS1bMC05QS1GXXs0fS1bMC05QS1GXXs0fS1bMC05QS1GXXsxMn0kL2lcbn07XG5cbmZ1bmN0aW9uIGlzVVVJRChzdHIpIHtcbiAgdmFyIHZlcnNpb24gPSBhcmd1bWVudHMubGVuZ3RoID4gMSAmJiBhcmd1bWVudHNbMV0gIT09IHVuZGVmaW5lZCA/IGFyZ3VtZW50c1sxXSA6ICdhbGwnO1xuXG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICB2YXIgcGF0dGVybiA9IHV1aWRbdmVyc2lvbl07XG4gIHJldHVybiBwYXR0ZXJuICYmIHBhdHRlcm4udGVzdChzdHIpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNVcHBlcmNhc2U7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5mdW5jdGlvbiBpc1VwcGVyY2FzZShzdHIpIHtcbiAgKDAsIF9hc3NlcnRTdHJpbmcyLmRlZmF1bHQpKHN0cik7XG4gIHJldHVybiBzdHIgPT09IHN0ci50b1VwcGVyQ2FzZSgpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNWYXJpYWJsZVdpZHRoO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxudmFyIF9pc0Z1bGxXaWR0aCA9IHJlcXVpcmUoJy4vaXNGdWxsV2lkdGgnKTtcblxudmFyIF9pc0hhbGZXaWR0aCA9IHJlcXVpcmUoJy4vaXNIYWxmV2lkdGgnKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gaXNWYXJpYWJsZVdpZHRoKHN0cikge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgcmV0dXJuIF9pc0Z1bGxXaWR0aC5mdWxsV2lkdGgudGVzdChzdHIpICYmIF9pc0hhbGZXaWR0aC5oYWxmV2lkdGgudGVzdChzdHIpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gaXNXaGl0ZWxpc3RlZDtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIGlzV2hpdGVsaXN0ZWQoc3RyLCBjaGFycykge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgZm9yICh2YXIgaSA9IHN0ci5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIGlmIChjaGFycy5pbmRleE9mKHN0cltpXSkgPT09IC0xKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gbHRyaW07XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5mdW5jdGlvbiBsdHJpbShzdHIsIGNoYXJzKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICB2YXIgcGF0dGVybiA9IGNoYXJzID8gbmV3IFJlZ0V4cCgnXlsnICsgY2hhcnMgKyAnXSsnLCAnZycpIDogL15cXHMrL2c7XG4gIHJldHVybiBzdHIucmVwbGFjZShwYXR0ZXJuLCAnJyk7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBtYXRjaGVzO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gbWF0Y2hlcyhzdHIsIHBhdHRlcm4sIG1vZGlmaWVycykge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYXR0ZXJuKSAhPT0gJ1tvYmplY3QgUmVnRXhwXScpIHtcbiAgICBwYXR0ZXJuID0gbmV3IFJlZ0V4cChwYXR0ZXJuLCBtb2RpZmllcnMpO1xuICB9XG4gIHJldHVybiBwYXR0ZXJuLnRlc3Qoc3RyKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IG5vcm1hbGl6ZUVtYWlsO1xuXG52YXIgX2lzRW1haWwgPSByZXF1aXJlKCcuL2lzRW1haWwnKTtcblxudmFyIF9pc0VtYWlsMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2lzRW1haWwpO1xuXG52YXIgX21lcmdlID0gcmVxdWlyZSgnLi91dGlsL21lcmdlJyk7XG5cbnZhciBfbWVyZ2UyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfbWVyZ2UpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG52YXIgZGVmYXVsdF9ub3JtYWxpemVfZW1haWxfb3B0aW9ucyA9IHtcbiAgLy8gVGhlIGZvbGxvd2luZyBvcHRpb25zIGFwcGx5IHRvIGFsbCBlbWFpbCBhZGRyZXNzZXNcbiAgLy8gTG93ZXJjYXNlcyB0aGUgbG9jYWwgcGFydCBvZiB0aGUgZW1haWwgYWRkcmVzcy5cbiAgLy8gUGxlYXNlIG5vdGUgdGhpcyBtYXkgdmlvbGF0ZSBSRkMgNTMyMSBhcyBwZXIgaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvOTgwODMzMi8xOTIwMjQpLlxuICAvLyBUaGUgZG9tYWluIGlzIGFsd2F5cyBsb3dlcmNhc2VkLCBhcyBwZXIgUkZDIDEwMzVcbiAgYWxsX2xvd2VyY2FzZTogdHJ1ZSxcblxuICAvLyBUaGUgZm9sbG93aW5nIGNvbnZlcnNpb25zIGFyZSBzcGVjaWZpYyB0byBHTWFpbFxuICAvLyBMb3dlcmNhc2VzIHRoZSBsb2NhbCBwYXJ0IG9mIHRoZSBHTWFpbCBhZGRyZXNzIChrbm93biB0byBiZSBjYXNlLWluc2Vuc2l0aXZlKVxuICBnbWFpbF9sb3dlcmNhc2U6IHRydWUsXG4gIC8vIFJlbW92ZXMgZG90cyBmcm9tIHRoZSBsb2NhbCBwYXJ0IG9mIHRoZSBlbWFpbCBhZGRyZXNzLCBhcyB0aGF0J3MgaWdub3JlZCBieSBHTWFpbFxuICBnbWFpbF9yZW1vdmVfZG90czogdHJ1ZSxcbiAgLy8gUmVtb3ZlcyB0aGUgc3ViYWRkcmVzcyAoZS5nLiBcIitmb29cIikgZnJvbSB0aGUgZW1haWwgYWRkcmVzc1xuICBnbWFpbF9yZW1vdmVfc3ViYWRkcmVzczogdHJ1ZSxcbiAgLy8gQ29udmVyc3RzIHRoZSBnb29nbGVtYWlsLmNvbSBkb21haW4gdG8gZ21haWwuY29tXG4gIGdtYWlsX2NvbnZlcnRfZ29vZ2xlbWFpbGRvdGNvbTogdHJ1ZSxcblxuICAvLyBUaGUgZm9sbG93aW5nIGNvbnZlcnNpb25zIGFyZSBzcGVjaWZpYyB0byBPdXRsb29rLmNvbSAvIFdpbmRvd3MgTGl2ZSAvIEhvdG1haWxcbiAgLy8gTG93ZXJjYXNlcyB0aGUgbG9jYWwgcGFydCBvZiB0aGUgT3V0bG9vay5jb20gYWRkcmVzcyAoa25vd24gdG8gYmUgY2FzZS1pbnNlbnNpdGl2ZSlcbiAgb3V0bG9va2RvdGNvbV9sb3dlcmNhc2U6IHRydWUsXG4gIC8vIFJlbW92ZXMgdGhlIHN1YmFkZHJlc3MgKGUuZy4gXCIrZm9vXCIpIGZyb20gdGhlIGVtYWlsIGFkZHJlc3NcbiAgb3V0bG9va2RvdGNvbV9yZW1vdmVfc3ViYWRkcmVzczogdHJ1ZSxcblxuICAvLyBUaGUgZm9sbG93aW5nIGNvbnZlcnNpb25zIGFyZSBzcGVjaWZpYyB0byBZYWhvb1xuICAvLyBMb3dlcmNhc2VzIHRoZSBsb2NhbCBwYXJ0IG9mIHRoZSBZYWhvbyBhZGRyZXNzIChrbm93biB0byBiZSBjYXNlLWluc2Vuc2l0aXZlKVxuICB5YWhvb19sb3dlcmNhc2U6IHRydWUsXG4gIC8vIFJlbW92ZXMgdGhlIHN1YmFkZHJlc3MgKGUuZy4gXCItZm9vXCIpIGZyb20gdGhlIGVtYWlsIGFkZHJlc3NcbiAgeWFob29fcmVtb3ZlX3N1YmFkZHJlc3M6IHRydWUsXG5cbiAgLy8gVGhlIGZvbGxvd2luZyBjb252ZXJzaW9ucyBhcmUgc3BlY2lmaWMgdG8gaUNsb3VkXG4gIC8vIExvd2VyY2FzZXMgdGhlIGxvY2FsIHBhcnQgb2YgdGhlIGlDbG91ZCBhZGRyZXNzIChrbm93biB0byBiZSBjYXNlLWluc2Vuc2l0aXZlKVxuICBpY2xvdWRfbG93ZXJjYXNlOiB0cnVlLFxuICAvLyBSZW1vdmVzIHRoZSBzdWJhZGRyZXNzIChlLmcuIFwiK2Zvb1wiKSBmcm9tIHRoZSBlbWFpbCBhZGRyZXNzXG4gIGljbG91ZF9yZW1vdmVfc3ViYWRkcmVzczogdHJ1ZVxufTtcblxuLy8gTGlzdCBvZiBkb21haW5zIHVzZWQgYnkgaUNsb3VkXG52YXIgaWNsb3VkX2RvbWFpbnMgPSBbJ2ljbG91ZC5jb20nLCAnbWUuY29tJ107XG5cbi8vIExpc3Qgb2YgZG9tYWlucyB1c2VkIGJ5IE91dGxvb2suY29tIGFuZCBpdHMgcHJlZGVjZXNzb3JzXG4vLyBUaGlzIGxpc3QgaXMgbGlrZWx5IGluY29tcGxldGUuXG4vLyBQYXJ0aWFsIHJlZmVyZW5jZTpcbi8vIGh0dHBzOi8vYmxvZ3Mub2ZmaWNlLmNvbS8yMDEzLzA0LzE3L291dGxvb2stY29tLWdldHMtdHdvLXN0ZXAtdmVyaWZpY2F0aW9uLXNpZ24taW4tYnktYWxpYXMtYW5kLW5ldy1pbnRlcm5hdGlvbmFsLWRvbWFpbnMvXG52YXIgb3V0bG9va2RvdGNvbV9kb21haW5zID0gWydob3RtYWlsLmF0JywgJ2hvdG1haWwuYmUnLCAnaG90bWFpbC5jYScsICdob3RtYWlsLmNsJywgJ2hvdG1haWwuY28uaWwnLCAnaG90bWFpbC5jby5ueicsICdob3RtYWlsLmNvLnRoJywgJ2hvdG1haWwuY28udWsnLCAnaG90bWFpbC5jb20nLCAnaG90bWFpbC5jb20uYXInLCAnaG90bWFpbC5jb20uYXUnLCAnaG90bWFpbC5jb20uYnInLCAnaG90bWFpbC5jb20uZ3InLCAnaG90bWFpbC5jb20ubXgnLCAnaG90bWFpbC5jb20ucGUnLCAnaG90bWFpbC5jb20udHInLCAnaG90bWFpbC5jb20udm4nLCAnaG90bWFpbC5jeicsICdob3RtYWlsLmRlJywgJ2hvdG1haWwuZGsnLCAnaG90bWFpbC5lcycsICdob3RtYWlsLmZyJywgJ2hvdG1haWwuaHUnLCAnaG90bWFpbC5pZCcsICdob3RtYWlsLmllJywgJ2hvdG1haWwuaW4nLCAnaG90bWFpbC5pdCcsICdob3RtYWlsLmpwJywgJ2hvdG1haWwua3InLCAnaG90bWFpbC5sdicsICdob3RtYWlsLm15JywgJ2hvdG1haWwucGgnLCAnaG90bWFpbC5wdCcsICdob3RtYWlsLnNhJywgJ2hvdG1haWwuc2cnLCAnaG90bWFpbC5zaycsICdsaXZlLmJlJywgJ2xpdmUuY28udWsnLCAnbGl2ZS5jb20nLCAnbGl2ZS5jb20uYXInLCAnbGl2ZS5jb20ubXgnLCAnbGl2ZS5kZScsICdsaXZlLmVzJywgJ2xpdmUuZXUnLCAnbGl2ZS5mcicsICdsaXZlLml0JywgJ2xpdmUubmwnLCAnbXNuLmNvbScsICdvdXRsb29rLmF0JywgJ291dGxvb2suYmUnLCAnb3V0bG9vay5jbCcsICdvdXRsb29rLmNvLmlsJywgJ291dGxvb2suY28ubnonLCAnb3V0bG9vay5jby50aCcsICdvdXRsb29rLmNvbScsICdvdXRsb29rLmNvbS5hcicsICdvdXRsb29rLmNvbS5hdScsICdvdXRsb29rLmNvbS5icicsICdvdXRsb29rLmNvbS5ncicsICdvdXRsb29rLmNvbS5wZScsICdvdXRsb29rLmNvbS50cicsICdvdXRsb29rLmNvbS52bicsICdvdXRsb29rLmN6JywgJ291dGxvb2suZGUnLCAnb3V0bG9vay5kaycsICdvdXRsb29rLmVzJywgJ291dGxvb2suZnInLCAnb3V0bG9vay5odScsICdvdXRsb29rLmlkJywgJ291dGxvb2suaWUnLCAnb3V0bG9vay5pbicsICdvdXRsb29rLml0JywgJ291dGxvb2suanAnLCAnb3V0bG9vay5rcicsICdvdXRsb29rLmx2JywgJ291dGxvb2subXknLCAnb3V0bG9vay5waCcsICdvdXRsb29rLnB0JywgJ291dGxvb2suc2EnLCAnb3V0bG9vay5zZycsICdvdXRsb29rLnNrJywgJ3Bhc3Nwb3J0LmNvbSddO1xuXG4vLyBMaXN0IG9mIGRvbWFpbnMgdXNlZCBieSBZYWhvbyBNYWlsXG4vLyBUaGlzIGxpc3QgaXMgbGlrZWx5IGluY29tcGxldGVcbnZhciB5YWhvb19kb21haW5zID0gWydyb2NrZXRtYWlsLmNvbScsICd5YWhvby5jYScsICd5YWhvby5jby51aycsICd5YWhvby5jb20nLCAneWFob28uZGUnLCAneWFob28uZnInLCAneWFob28uaW4nLCAneWFob28uaXQnLCAneW1haWwuY29tJ107XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUVtYWlsKGVtYWlsLCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSAoMCwgX21lcmdlMi5kZWZhdWx0KShvcHRpb25zLCBkZWZhdWx0X25vcm1hbGl6ZV9lbWFpbF9vcHRpb25zKTtcblxuICBpZiAoISgwLCBfaXNFbWFpbDIuZGVmYXVsdCkoZW1haWwpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgdmFyIHJhd19wYXJ0cyA9IGVtYWlsLnNwbGl0KCdAJyk7XG4gIHZhciBkb21haW4gPSByYXdfcGFydHMucG9wKCk7XG4gIHZhciB1c2VyID0gcmF3X3BhcnRzLmpvaW4oJ0AnKTtcbiAgdmFyIHBhcnRzID0gW3VzZXIsIGRvbWFpbl07XG5cbiAgLy8gVGhlIGRvbWFpbiBpcyBhbHdheXMgbG93ZXJjYXNlZCwgYXMgaXQncyBjYXNlLWluc2Vuc2l0aXZlIHBlciBSRkMgMTAzNVxuICBwYXJ0c1sxXSA9IHBhcnRzWzFdLnRvTG93ZXJDYXNlKCk7XG5cbiAgaWYgKHBhcnRzWzFdID09PSAnZ21haWwuY29tJyB8fCBwYXJ0c1sxXSA9PT0gJ2dvb2dsZW1haWwuY29tJykge1xuICAgIC8vIEFkZHJlc3MgaXMgR01haWxcbiAgICBpZiAob3B0aW9ucy5nbWFpbF9yZW1vdmVfc3ViYWRkcmVzcykge1xuICAgICAgcGFydHNbMF0gPSBwYXJ0c1swXS5zcGxpdCgnKycpWzBdO1xuICAgIH1cbiAgICBpZiAob3B0aW9ucy5nbWFpbF9yZW1vdmVfZG90cykge1xuICAgICAgcGFydHNbMF0gPSBwYXJ0c1swXS5yZXBsYWNlKC9cXC4vZywgJycpO1xuICAgIH1cbiAgICBpZiAoIXBhcnRzWzBdLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAob3B0aW9ucy5hbGxfbG93ZXJjYXNlIHx8IG9wdGlvbnMuZ21haWxfbG93ZXJjYXNlKSB7XG4gICAgICBwYXJ0c1swXSA9IHBhcnRzWzBdLnRvTG93ZXJDYXNlKCk7XG4gICAgfVxuICAgIHBhcnRzWzFdID0gb3B0aW9ucy5nbWFpbF9jb252ZXJ0X2dvb2dsZW1haWxkb3Rjb20gPyAnZ21haWwuY29tJyA6IHBhcnRzWzFdO1xuICB9IGVsc2UgaWYgKH5pY2xvdWRfZG9tYWlucy5pbmRleE9mKHBhcnRzWzFdKSkge1xuICAgIC8vIEFkZHJlc3MgaXMgaUNsb3VkXG4gICAgaWYgKG9wdGlvbnMuaWNsb3VkX3JlbW92ZV9zdWJhZGRyZXNzKSB7XG4gICAgICBwYXJ0c1swXSA9IHBhcnRzWzBdLnNwbGl0KCcrJylbMF07XG4gICAgfVxuICAgIGlmICghcGFydHNbMF0ubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmIChvcHRpb25zLmFsbF9sb3dlcmNhc2UgfHwgb3B0aW9ucy5pY2xvdWRfbG93ZXJjYXNlKSB7XG4gICAgICBwYXJ0c1swXSA9IHBhcnRzWzBdLnRvTG93ZXJDYXNlKCk7XG4gICAgfVxuICB9IGVsc2UgaWYgKH5vdXRsb29rZG90Y29tX2RvbWFpbnMuaW5kZXhPZihwYXJ0c1sxXSkpIHtcbiAgICAvLyBBZGRyZXNzIGlzIE91dGxvb2suY29tXG4gICAgaWYgKG9wdGlvbnMub3V0bG9va2RvdGNvbV9yZW1vdmVfc3ViYWRkcmVzcykge1xuICAgICAgcGFydHNbMF0gPSBwYXJ0c1swXS5zcGxpdCgnKycpWzBdO1xuICAgIH1cbiAgICBpZiAoIXBhcnRzWzBdLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAob3B0aW9ucy5hbGxfbG93ZXJjYXNlIHx8IG9wdGlvbnMub3V0bG9va2RvdGNvbV9sb3dlcmNhc2UpIHtcbiAgICAgIHBhcnRzWzBdID0gcGFydHNbMF0udG9Mb3dlckNhc2UoKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAofnlhaG9vX2RvbWFpbnMuaW5kZXhPZihwYXJ0c1sxXSkpIHtcbiAgICAvLyBBZGRyZXNzIGlzIFlhaG9vXG4gICAgaWYgKG9wdGlvbnMueWFob29fcmVtb3ZlX3N1YmFkZHJlc3MpIHtcbiAgICAgIHZhciBjb21wb25lbnRzID0gcGFydHNbMF0uc3BsaXQoJy0nKTtcbiAgICAgIHBhcnRzWzBdID0gY29tcG9uZW50cy5sZW5ndGggPiAxID8gY29tcG9uZW50cy5zbGljZSgwLCAtMSkuam9pbignLScpIDogY29tcG9uZW50c1swXTtcbiAgICB9XG4gICAgaWYgKCFwYXJ0c1swXS5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKG9wdGlvbnMuYWxsX2xvd2VyY2FzZSB8fCBvcHRpb25zLnlhaG9vX2xvd2VyY2FzZSkge1xuICAgICAgcGFydHNbMF0gPSBwYXJ0c1swXS50b0xvd2VyQ2FzZSgpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChvcHRpb25zLmFsbF9sb3dlcmNhc2UpIHtcbiAgICAvLyBBbnkgb3RoZXIgYWRkcmVzc1xuICAgIHBhcnRzWzBdID0gcGFydHNbMF0udG9Mb3dlckNhc2UoKTtcbiAgfVxuICByZXR1cm4gcGFydHMuam9pbignQCcpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gcnRyaW07XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5mdW5jdGlvbiBydHJpbShzdHIsIGNoYXJzKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICB2YXIgcGF0dGVybiA9IGNoYXJzID8gbmV3IFJlZ0V4cCgnWycgKyBjaGFycyArICddJykgOiAvXFxzLztcblxuICB2YXIgaWR4ID0gc3RyLmxlbmd0aCAtIDE7XG4gIHdoaWxlIChpZHggPj0gMCAmJiBwYXR0ZXJuLnRlc3Qoc3RyW2lkeF0pKSB7XG4gICAgaWR4LS07XG4gIH1cblxuICByZXR1cm4gaWR4IDwgc3RyLmxlbmd0aCA/IHN0ci5zdWJzdHIoMCwgaWR4ICsgMSkgOiBzdHI7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSBzdHJpcExvdztcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbnZhciBfYmxhY2tsaXN0ID0gcmVxdWlyZSgnLi9ibGFja2xpc3QnKTtcblxudmFyIF9ibGFja2xpc3QyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYmxhY2tsaXN0KTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gc3RyaXBMb3coc3RyLCBrZWVwX25ld19saW5lcykge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgdmFyIGNoYXJzID0ga2VlcF9uZXdfbGluZXMgPyAnXFxcXHgwMC1cXFxceDA5XFxcXHgwQlxcXFx4MENcXFxceDBFLVxcXFx4MUZcXFxceDdGJyA6ICdcXFxceDAwLVxcXFx4MUZcXFxceDdGJztcbiAgcmV0dXJuICgwLCBfYmxhY2tsaXN0Mi5kZWZhdWx0KShzdHIsIGNoYXJzKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IHRvQm9vbGVhbjtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIHRvQm9vbGVhbihzdHIsIHN0cmljdCkge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgaWYgKHN0cmljdCkge1xuICAgIHJldHVybiBzdHIgPT09ICcxJyB8fCBzdHIgPT09ICd0cnVlJztcbiAgfVxuICByZXR1cm4gc3RyICE9PSAnMCcgJiYgc3RyICE9PSAnZmFsc2UnICYmIHN0ciAhPT0gJyc7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSB0b0RhdGU7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5mdW5jdGlvbiB0b0RhdGUoZGF0ZSkge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoZGF0ZSk7XG4gIGRhdGUgPSBEYXRlLnBhcnNlKGRhdGUpO1xuICByZXR1cm4gIWlzTmFOKGRhdGUpID8gbmV3IERhdGUoZGF0ZSkgOiBudWxsO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gdG9GbG9hdDtcblxudmFyIF9hc3NlcnRTdHJpbmcgPSByZXF1aXJlKCcuL3V0aWwvYXNzZXJ0U3RyaW5nJyk7XG5cbnZhciBfYXNzZXJ0U3RyaW5nMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX2Fzc2VydFN0cmluZyk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIHRvRmxvYXQoc3RyKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gcGFyc2VGbG9hdChzdHIpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gdG9JbnQ7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5mdW5jdGlvbiB0b0ludChzdHIsIHJhZGl4KSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gcGFyc2VJbnQoc3RyLCByYWRpeCB8fCAxMCk7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSB0cmltO1xuXG52YXIgX3J0cmltID0gcmVxdWlyZSgnLi9ydHJpbScpO1xuXG52YXIgX3J0cmltMiA9IF9pbnRlcm9wUmVxdWlyZURlZmF1bHQoX3J0cmltKTtcblxudmFyIF9sdHJpbSA9IHJlcXVpcmUoJy4vbHRyaW0nKTtcblxudmFyIF9sdHJpbTIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9sdHJpbSk7XG5cbmZ1bmN0aW9uIF9pbnRlcm9wUmVxdWlyZURlZmF1bHQob2JqKSB7IHJldHVybiBvYmogJiYgb2JqLl9fZXNNb2R1bGUgPyBvYmogOiB7IGRlZmF1bHQ6IG9iaiB9OyB9XG5cbmZ1bmN0aW9uIHRyaW0oc3RyLCBjaGFycykge1xuICByZXR1cm4gKDAsIF9ydHJpbTIuZGVmYXVsdCkoKDAsIF9sdHJpbTIuZGVmYXVsdCkoc3RyLCBjaGFycyksIGNoYXJzKTtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IHVuZXNjYXBlO1xuXG52YXIgX2Fzc2VydFN0cmluZyA9IHJlcXVpcmUoJy4vdXRpbC9hc3NlcnRTdHJpbmcnKTtcblxudmFyIF9hc3NlcnRTdHJpbmcyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfYXNzZXJ0U3RyaW5nKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gdW5lc2NhcGUoc3RyKSB7XG4gICgwLCBfYXNzZXJ0U3RyaW5nMi5kZWZhdWx0KShzdHIpO1xuICByZXR1cm4gc3RyLnJlcGxhY2UoLyZhbXA7L2csICcmJykucmVwbGFjZSgvJnF1b3Q7L2csICdcIicpLnJlcGxhY2UoLyYjeDI3Oy9nLCBcIidcIikucmVwbGFjZSgvJmx0Oy9nLCAnPCcpLnJlcGxhY2UoLyZndDsvZywgJz4nKS5yZXBsYWNlKC8mI3gyRjsvZywgJy8nKS5yZXBsYWNlKC8mI3g1QzsvZywgJ1xcXFwnKS5yZXBsYWNlKC8mIzk2Oy9nLCAnYCcpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5kZWZhdWx0ID0gYXNzZXJ0U3RyaW5nO1xuZnVuY3Rpb24gYXNzZXJ0U3RyaW5nKGlucHV0KSB7XG4gIHZhciBpc1N0cmluZyA9IHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycgfHwgaW5wdXQgaW5zdGFuY2VvZiBTdHJpbmc7XG5cbiAgaWYgKCFpc1N0cmluZykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1RoaXMgbGlicmFyeSAodmFsaWRhdG9yLmpzKSB2YWxpZGF0ZXMgc3RyaW5ncyBvbmx5Jyk7XG4gIH1cbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IG1lcmdlO1xuZnVuY3Rpb24gbWVyZ2UoKSB7XG4gIHZhciBvYmogPSBhcmd1bWVudHMubGVuZ3RoID4gMCAmJiBhcmd1bWVudHNbMF0gIT09IHVuZGVmaW5lZCA/IGFyZ3VtZW50c1swXSA6IHt9O1xuICB2YXIgZGVmYXVsdHMgPSBhcmd1bWVudHNbMV07XG5cbiAgZm9yICh2YXIga2V5IGluIGRlZmF1bHRzKSB7XG4gICAgaWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIG9ialtrZXldID0gZGVmYXVsdHNba2V5XTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG9iajtcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0c1snZGVmYXVsdCddOyIsIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcblxudmFyIF90eXBlb2YgPSB0eXBlb2YgU3ltYm9sID09PSBcImZ1bmN0aW9uXCIgJiYgdHlwZW9mIFN5bWJvbC5pdGVyYXRvciA9PT0gXCJzeW1ib2xcIiA/IGZ1bmN0aW9uIChvYmopIHsgcmV0dXJuIHR5cGVvZiBvYmo7IH0gOiBmdW5jdGlvbiAob2JqKSB7IHJldHVybiBvYmogJiYgdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiICYmIG9iai5jb25zdHJ1Y3RvciA9PT0gU3ltYm9sICYmIG9iaiAhPT0gU3ltYm9sLnByb3RvdHlwZSA/IFwic3ltYm9sXCIgOiB0eXBlb2Ygb2JqOyB9O1xuXG5leHBvcnRzLmRlZmF1bHQgPSB0b1N0cmluZztcbmZ1bmN0aW9uIHRvU3RyaW5nKGlucHV0KSB7XG4gIGlmICgodHlwZW9mIGlucHV0ID09PSAndW5kZWZpbmVkJyA/ICd1bmRlZmluZWQnIDogX3R5cGVvZihpbnB1dCkpID09PSAnb2JqZWN0JyAmJiBpbnB1dCAhPT0gbnVsbCkge1xuICAgIGlmICh0eXBlb2YgaW5wdXQudG9TdHJpbmcgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGlucHV0ID0gaW5wdXQudG9TdHJpbmcoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaW5wdXQgPSAnW29iamVjdCBPYmplY3RdJztcbiAgICB9XG4gIH0gZWxzZSBpZiAoaW5wdXQgPT09IG51bGwgfHwgdHlwZW9mIGlucHV0ID09PSAndW5kZWZpbmVkJyB8fCBpc05hTihpbnB1dCkgJiYgIWlucHV0Lmxlbmd0aCkge1xuICAgIGlucHV0ID0gJyc7XG4gIH1cbiAgcmV0dXJuIFN0cmluZyhpbnB1dCk7XG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHNbJ2RlZmF1bHQnXTsiLCIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5leHBvcnRzLmRlZmF1bHQgPSB3aGl0ZWxpc3Q7XG5cbnZhciBfYXNzZXJ0U3RyaW5nID0gcmVxdWlyZSgnLi91dGlsL2Fzc2VydFN0cmluZycpO1xuXG52YXIgX2Fzc2VydFN0cmluZzIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9hc3NlcnRTdHJpbmcpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG5mdW5jdGlvbiB3aGl0ZWxpc3Qoc3RyLCBjaGFycykge1xuICAoMCwgX2Fzc2VydFN0cmluZzIuZGVmYXVsdCkoc3RyKTtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKG5ldyBSZWdFeHAoJ1teJyArIGNoYXJzICsgJ10rJywgJ2cnKSwgJycpO1xufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzWydkZWZhdWx0J107IiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2FwaURlY2xhcmF0aW9uLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwic3dhZ2dlclZlcnNpb25cIiwgXCJiYXNlUGF0aFwiLCBcImFwaXNcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwic3dhZ2dlclZlcnNpb25cIjogeyBcImVudW1cIjogWyBcIjEuMlwiIF0gfSxcbiAgICAgICAgXCJhcGlWZXJzaW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJiYXNlUGF0aFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCIsXG4gICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeaHR0cHM/Oi8vXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXNvdXJjZVBhdGhcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiLFxuICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXi9cIlxuICAgICAgICB9LFxuICAgICAgICBcImFwaXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaU9iamVjdFwiIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJtb2RlbHNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJtb2RlbHNPYmplY3QuanNvbiNcIlxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInByb2R1Y2VzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjogeyBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgIH0sXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJhcGlPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJwYXRoXCIsIFwib3BlcmF0aW9uc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwicGF0aFwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaS10ZW1wbGF0ZVwiLFxuICAgICAgICAgICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeL1wiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcIm9wZXJhdGlvbnNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwib3BlcmF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWltZVR5cGVBcnJheVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJtaW1lLXR5cGVcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9iYXNpY0F1dGhcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaUtleVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiYmFzaWNBdXRoXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImJhc2ljQXV0aFwiIF0gfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJhcGlLZXlcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiLCBcInBhc3NBc1wiLCBcImtleW5hbWVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImFwaUtleVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcInBhc3NBc1wiOiB7IFwiZW51bVwiOiBbIFwiaGVhZGVyXCIsIFwicXVlcnlcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJrZXluYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJvYXV0aDJcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIsIFwiZ3JhbnRUeXBlc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwib2F1dGgyXCIgXSB9LFxuICAgICAgICAgICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImdyYW50VHlwZXNcIjogeyBcIiRyZWZcIjogXCJvYXV0aDJHcmFudFR5cGUuanNvbiNcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm9hdXRoMlNjb3BlXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwic2NvcGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInNjb3BlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfVxuICAgIH1cbn1cblxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2RhdGFUeXBlLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkRhdGEgdHlwZSBhcyBkZXNjcmliZWQgYnkgdGhlIHNwZWNpZmljYXRpb24gKHZlcnNpb24gMS4yKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVmVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92b2lkVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21vZGVsVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcnJheVR5cGVcIiB9XG4gICAgXSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJyZWZUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInZvaWRUeXBlXCI6IHtcbiAgICAgICAgICAgIFwiZW51bVwiOiBbIHsgXCJ0eXBlXCI6IFwidm9pZFwiIH0gXVxuICAgICAgICB9LFxuICAgICAgICBcIm1vZGVsVHlwZVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYm9vbGVhblwiLCBcImludGVnZXJcIiwgXCJudW1iZXJcIiwgXCJzdHJpbmdcIiwgXCJhcnJheVwiIF1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwicHJpbWl0aXZlVHlwZVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bWJlclwiLCBcInN0cmluZ1wiIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImRlZmF1bHRWYWx1ZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHsgXCJ0eXBlXCI6IFsgXCJhcnJheVwiLCBcIm9iamVjdFwiLCBcIm51bGxcIiBdIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJtaW5pbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcIm1heGltdW1cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgICAgICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImludDMyXCIsIFwiaW50NjRcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwibnVtYmVyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiZmxvYXRcIiwgXCJkb3VibGVcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwic3RyaW5nXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcImJ5dGVcIiwgXCJkYXRlXCIsIFwiZGF0ZS10aW1lXCIgXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiLCBcIm51bWJlclwiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYXJyYXlUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiwgXCJpdGVtc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYXJyYXlcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2l0ZW1zT2JqZWN0XCIgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZWZUeXBlXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJhbGxPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVUeXBlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgfVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9kYXRhVHlwZUJhc2UuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGF0YSB0eXBlIGZpZWxkcyAoc2VjdGlvbiA0LjMuMylcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgeyBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSB9LFxuICAgICAgICB7IFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdIH1cbiAgICBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiJHJlZlwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZWZhdWx0VmFsdWVcIjoge1xuICAgICAgICAgICAgXCJub3RcIjogeyBcInR5cGVcIjogWyBcImFycmF5XCIsIFwib2JqZWN0XCIsIFwibnVsbFwiIF0gfVxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlLFxuICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2l0ZW1zT2JqZWN0XCIgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJpbnQzMlwiLCBcImludDY0XCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwibnVtYmVyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImZsb2F0XCIsIFwiZG91YmxlXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwic3RyaW5nXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYnl0ZVwiLCBcImRhdGVcIiwgXCJkYXRlLXRpbWVcIiBdXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcIml0ZW1zT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdLFxuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjoge30sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHt9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvaW5mb09iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwiZGVzY3JpcHRpb25cIjogXCJpbmZvIG9iamVjdCAoc2VjdGlvbiA1LjEuMylcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJ0aXRsZVwiLCBcImRlc2NyaXB0aW9uXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInRpdGxlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwidGVybXNPZlNlcnZpY2VVcmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICBcImNvbnRhY3RcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJlbWFpbFwiIH0sXG4gICAgICAgIFwibGljZW5zZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwibGljZW5zZVVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH1cbiAgICB9LFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2Vcbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvbW9kZWxzT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwiaWRcIiwgXCJwcm9wZXJ0aWVzXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImlkXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Byb3BlcnR5T2JqZWN0XCIgfVxuICAgICAgICB9LFxuICAgICAgICBcInN1YlR5cGVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcImRpc2NyaW1pbmF0b3JcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwic3ViVHlwZXNcIjogWyBcImRpc2NyaW1pbmF0b3JcIiBdXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJwcm9wZXJ0eU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCJcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59XG5cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9vYXV0aDJHcmFudFR5cGUuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcIm1pblByb3BlcnRpZXNcIjogMSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImltcGxpY2l0XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9pbXBsaWNpdFwiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbl9jb2RlXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hdXRob3JpemF0aW9uQ29kZVwiIH1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcImltcGxpY2l0XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwibG9naW5FbmRwb2ludFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwibG9naW5FbmRwb2ludFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbG9naW5FbmRwb2ludFwiIH0sXG4gICAgICAgICAgICAgICAgXCJ0b2tlbk5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25Db2RlXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidG9rZW5FbmRwb2ludFwiLCBcInRva2VuUmVxdWVzdEVuZHBvaW50XCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0b2tlbkVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90b2tlbkVuZHBvaW50XCIgfSxcbiAgICAgICAgICAgICAgICBcInRva2VuUmVxdWVzdEVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90b2tlblJlcXVlc3RFbmRwb2ludFwiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibG9naW5FbmRwb2ludFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInVybFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlbkVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICAgICAgICAgIFwidG9rZW5OYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblJlcXVlc3RFbmRwb2ludFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInVybFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcbiAgICAgICAgICAgICAgICBcImNsaWVudElkTmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJjbGllbnRTZWNyZXROYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfVxuICAgIH1cbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvb3BlcmF0aW9uT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJhbGxPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCIgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwibWV0aG9kXCIsIFwibmlja25hbWVcIiwgXCJwYXJhbWV0ZXJzXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJtZXRob2RcIjogeyBcImVudW1cIjogWyBcIkdFVFwiLCBcIkhFQURcIiwgXCJQT1NUXCIsIFwiUFVUXCIsIFwiUEFUQ0hcIiwgXCJERUxFVEVcIiwgXCJPUFRJT05TXCIgXSB9LFxuICAgICAgICAgICAgICAgIFwic3VtbWFyeVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcIm1heExlbmd0aFwiOiAxMjAgfSxcbiAgICAgICAgICAgICAgICBcIm5vdGVzXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcIm5pY2tuYW1lXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl5bYS16QS1aMC05X10rJFwiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImF1dGhvcml6YXRpb25zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcImF1dGhvcml6YXRpb25PYmplY3QuanNvbiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVcIlxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwicGFyYW1ldGVyT2JqZWN0Lmpzb24jXCIgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJyZXNwb25zZU1lc3NhZ2VzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VNZXNzYWdlT2JqZWN0XCJ9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInByb2R1Y2VzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgICAgICAgICBcImNvbnN1bWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgICAgICAgICBcImRlcHJlY2F0ZWRcIjogeyBcImVudW1cIjogWyBcInRydWVcIiwgXCJmYWxzZVwiIF0gfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgXSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJyZXNwb25zZU1lc3NhZ2VPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJjb2RlXCIsIFwibWVzc2FnZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiY29kZVwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmZjMjYxNnNlY3Rpb24xMFwiIH0sXG4gICAgICAgICAgICAgICAgXCJtZXNzYWdlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcInJlc3BvbnNlTW9kZWxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicmZjMjYxNnNlY3Rpb24xMFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcIm1pbmltdW1cIjogMTAwLFxuICAgICAgICAgICAgXCJtYXhpbXVtXCI6IDYwMCxcbiAgICAgICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWltZVR5cGVBcnJheVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJtaW1lLXR5cGVcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL3BhcmFtZXRlck9iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICB7IFwiJHJlZlwiOiBcImRhdGFUeXBlQmFzZS5qc29uI1wiIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInBhcmFtVHlwZVwiLCBcIm5hbWVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInBhcmFtVHlwZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwicGF0aFwiLCBcInF1ZXJ5XCIsIFwiYm9keVwiLCBcImhlYWRlclwiLCBcImZvcm1cIiBdXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogeyBcInR5cGVcIjogXCJib29sZWFuXCIgfSxcbiAgICAgICAgICAgICAgICBcImFsbG93TXVsdGlwbGVcIjogeyBcInR5cGVcIjogXCJib29sZWFuXCIgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwidHlwZSBGaWxlIHJlcXVpcmVzIHNwZWNpYWwgcGFyYW1UeXBlIGFuZCBjb25zdW1lc1wiLFxuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJub3RcIjogeyBcImVudW1cIjogWyBcIkZpbGVcIiBdIH0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcIkZpbGVcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcInBhcmFtVHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiZm9ybVwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiY29uc3VtZXNcIjogeyBcImVudW1cIjogWyBcIm11bHRpcGFydC9mb3JtLWRhdGFcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIF1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9yZXNvdXJjZUxpc3RpbmcuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJzd2FnZ2VyVmVyc2lvblwiLCBcImFwaXNcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwic3dhZ2dlclZlcnNpb25cIjogeyBcImVudW1cIjogWyBcIjEuMlwiIF0gfSxcbiAgICAgICAgXCJhcGlzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwicmVzb3VyY2VPYmplY3QuanNvbiNcIiB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYXBpVmVyc2lvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiaW5mb1wiOiB7IFwiJHJlZlwiOiBcImluZm9PYmplY3QuanNvbiNcIiB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25zXCI6IHsgXCIkcmVmXCI6IFwiYXV0aG9yaXphdGlvbk9iamVjdC5qc29uI1wiIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcmVzb3VyY2VPYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJwYXRoXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInBhdGhcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgIH0sXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgXCJ0aXRsZVwiOiBcIkEgSlNPTiBTY2hlbWEgZm9yIFN3YWdnZXIgMi4wIEFQSS5cIixcbiAgXCJpZFwiOiBcImh0dHA6Ly9zd2FnZ2VyLmlvL3YyL3NjaGVtYS5qc29uI1wiLFxuICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gIFwicmVxdWlyZWRcIjogW1xuICAgIFwic3dhZ2dlclwiLFxuICAgIFwiaW5mb1wiLFxuICAgIFwicGF0aHNcIlxuICBdLFxuICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICBcIl54LVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgfVxuICB9LFxuICBcInByb3BlcnRpZXNcIjoge1xuICAgIFwic3dhZ2dlclwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgIFwiMi4wXCJcbiAgICAgIF0sXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIFN3YWdnZXIgdmVyc2lvbiBvZiB0aGlzIGRvY3VtZW50LlwiXG4gICAgfSxcbiAgICBcImluZm9cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9pbmZvXCJcbiAgICB9LFxuICAgIFwiaG9zdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwicGF0dGVyblwiOiBcIl5bXnt9LyA6XFxcXFxcXFxdKyg/OjpcXFxcZCspPyRcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgaG9zdCAobmFtZSBvciBpcCkgb2YgdGhlIEFQSS4gRXhhbXBsZTogJ3N3YWdnZXIuaW8nXCJcbiAgICB9LFxuICAgIFwiYmFzZVBhdGhcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcInBhdHRlcm5cIjogXCJeL1wiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBiYXNlIHBhdGggdG8gdGhlIEFQSS4gRXhhbXBsZTogJy9hcGknLlwiXG4gICAgfSxcbiAgICBcInNjaGVtZXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWVzTGlzdFwiXG4gICAgfSxcbiAgICBcImNvbnN1bWVzXCI6IHtcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyBhY2NlcHRlZCBieSB0aGUgQVBJLlwiLFxuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcbiAgICB9LFxuICAgIFwicHJvZHVjZXNcIjoge1xuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgbGlzdCBvZiBNSU1FIHR5cGVzIHRoZSBBUEkgY2FuIHByb2R1Y2UuXCIsXG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgIH0sXG4gICAgXCJwYXRoc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdGhzXCJcbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZpbml0aW9uc1wiXG4gICAgfSxcbiAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJEZWZpbml0aW9uc1wiXG4gICAgfSxcbiAgICBcInJlc3BvbnNlc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlRGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NlY3VyaXR5XCJcbiAgICB9LFxuICAgIFwic2VjdXJpdHlEZWZpbml0aW9uc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NlY3VyaXR5RGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJ0YWdzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90YWdcIlxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgIH1cbiAgfSxcbiAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgXCJpbmZvXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkdlbmVyYWwgaW5mb3JtYXRpb24gYWJvdXQgdGhlIEFQSS5cIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInZlcnNpb25cIixcbiAgICAgICAgXCJ0aXRsZVwiXG4gICAgICBdLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgdW5pcXVlIGFuZCBwcmVjaXNlIHRpdGxlIG9mIHRoZSBBUEkuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ2ZXJzaW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBzZW1hbnRpYyB2ZXJzaW9uIG51bWJlciBvZiB0aGUgQVBJLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxvbmdlciBkZXNjcmlwdGlvbiBvZiB0aGUgQVBJLiBTaG91bGQgYmUgZGlmZmVyZW50IGZyb20gdGhlIHRpdGxlLiAgR2l0SHViIEZsYXZvcmVkIE1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0ZXJtc09mU2VydmljZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSB0ZXJtcyBvZiBzZXJ2aWNlIGZvciB0aGUgQVBJLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29udGFjdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb250YWN0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJsaWNlbnNlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2xpY2Vuc2VcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImNvbnRhY3RcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQ29udGFjdCBpbmZvcm1hdGlvbiBmb3IgdGhlIG93bmVycyBvZiB0aGUgQVBJLlwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBpZGVudGlmeWluZyBuYW1lIG9mIHRoZSBjb250YWN0IHBlcnNvbi9vcmdhbml6YXRpb24uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1cmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgVVJMIHBvaW50aW5nIHRvIHRoZSBjb250YWN0IGluZm9ybWF0aW9uLlwiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbWFpbFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBlbWFpbCBhZGRyZXNzIG9mIHRoZSBjb250YWN0IHBlcnNvbi9vcmdhbml6YXRpb24uXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJlbWFpbFwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJsaWNlbnNlXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiXG4gICAgICBdLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBsaWNlbnNlIHR5cGUuIEl0J3MgZW5jb3VyYWdlZCB0byB1c2UgYW4gT1NJIGNvbXBhdGlibGUgbGljZW5zZS5cIlxuICAgICAgICB9LFxuICAgICAgICBcInVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBVUkwgcG9pbnRpbmcgdG8gdGhlIGxpY2Vuc2UuXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aHNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUmVsYXRpdmUgcGF0aHMgdG8gdGhlIGluZGl2aWR1YWwgZW5kcG9pbnRzLiBUaGV5IG11c3QgYmUgcmVsYXRpdmUgdG8gdGhlICdiYXNlUGF0aCcuXCIsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJeL1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXRoSXRlbVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgIH0sXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiT25lIG9yIG1vcmUgSlNPTiBvYmplY3RzIGRlc2NyaWJpbmcgdGhlIHNjaGVtYXMgYmVpbmcgY29uc3VtZWQgYW5kIHByb2R1Y2VkIGJ5IHRoZSBBUEkuXCJcbiAgICB9LFxuICAgIFwicGFyYW1ldGVyRGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJcIlxuICAgICAgfSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJPbmUgb3IgbW9yZSBKU09OIHJlcHJlc2VudGF0aW9ucyBmb3IgcGFyYW1ldGVyc1wiXG4gICAgfSxcbiAgICBcInJlc3BvbnNlRGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVwiXG4gICAgICB9LFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIk9uZSBvciBtb3JlIEpTT04gcmVwcmVzZW50YXRpb25zIGZvciBwYXJhbWV0ZXJzXCJcbiAgICB9LFxuICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJpbmZvcm1hdGlvbiBhYm91dCBleHRlcm5hbCBkb2N1bWVudGF0aW9uXCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ1cmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJleGFtcGxlc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJtaW1lVHlwZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgTUlNRSB0eXBlIG9mIHRoZSBIVFRQIG1lc3NhZ2UuXCJcbiAgICB9LFxuICAgIFwib3BlcmF0aW9uXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwicmVzcG9uc2VzXCJcbiAgICAgIF0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInRhZ3NcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwic3VtbWFyeVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgc3VtbWFyeSBvZiB0aGUgb3BlcmF0aW9uLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxvbmdlciBkZXNjcmlwdGlvbiBvZiB0aGUgb3BlcmF0aW9uLCBHaXRIdWIgRmxhdm9yZWQgTWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9LFxuICAgICAgICBcIm9wZXJhdGlvbklkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSB1bmlxdWUgaWRlbnRpZmllciBvZiB0aGUgb3BlcmF0aW9uLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvZHVjZXNcIjoge1xuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBwcm9kdWNlLlwiLFxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29uc3VtZXNcIjoge1xuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBjb25zdW1lLlwiLFxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGFyYW1ldGVyc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJzTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicmVzcG9uc2VzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NoZW1lc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWVzTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVwcmVjYXRlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInNlY3VyaXR5XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NlY3VyaXR5XCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJwYXRoSXRlbVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwdXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwb3N0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVsZXRlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwib3B0aW9uc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcImhlYWRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXRjaFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyc0xpc3RcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInJlc3BvbnNlc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJSZXNwb25zZSBvYmplY3RzIG5hbWVzIGNhbiBlaXRoZXIgYmUgYW55IHZhbGlkIEhUVFAgc3RhdHVzIGNvZGUgb3IgJ2RlZmF1bHQnLlwiLFxuICAgICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IDEsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXihbMC05XXszfSkkfF4oZGVmYXVsdCkkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlVmFsdWVcIlxuICAgICAgICB9LFxuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJub3RcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJyZXNwb25zZVZhbHVlXCI6IHtcbiAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2pzb25SZWZlcmVuY2VcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInJlc3BvbnNlXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NoZW1hXCI6IHtcbiAgICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9maWxlU2NoZW1hXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiaGVhZGVyc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9oZWFkZXJzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGFtcGxlc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGFtcGxlc1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiaGVhZGVyc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2hlYWRlclwiXG4gICAgICB9XG4gICAgfSxcbiAgICBcImhlYWRlclwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJ2ZW5kb3JFeHRlbnNpb25cIjoge1xuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkFueSBwcm9wZXJ0eSBzdGFydGluZyB3aXRoIHgtIGlzIHZhbGlkLlwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB0cnVlLFxuICAgICAgXCJhZGRpdGlvbmFsSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJib2R5UGFyYW1ldGVyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiLFxuICAgICAgICBcImluXCIsXG4gICAgICAgIFwic2NoZW1hXCJcbiAgICAgIF0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRIdWIgRmxhdm9yZWQgTWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImJvZHlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtYVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJoZWFkZXJQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJoZWFkZXJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdEh1YiBGbGF2b3JlZCBNYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInF1ZXJ5UGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicXVlcnlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdEh1YiBGbGF2b3JlZCBNYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhbGxvd0VtcHR5VmFsdWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2UsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcImFsbG93cyBzZW5kaW5nIGEgcGFyYW1ldGVyIGJ5IG5hbWUgb25seSBvciB3aXRoIGFuIGVtcHR5IHZhbHVlLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRXaXRoTXVsdGlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJmb3JtRGF0YVBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgd2hldGhlciBvciBub3QgdGhpcyBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQgb3Igb3B0aW9uYWwuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImZvcm1EYXRhXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRIdWIgRmxhdm9yZWQgTWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYWxsb3dFbXB0eVZhbHVlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJhbGxvd3Mgc2VuZGluZyBhIHBhcmFtZXRlciBieSBuYW1lIG9ubHkgb3Igd2l0aCBhbiBlbXB0eSB2YWx1ZS5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCIsXG4gICAgICAgICAgICBcImZpbGVcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRXaXRoTXVsdGlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJwYXRoUGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInJlcXVpcmVkXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIHRydWVcbiAgICAgICAgICBdLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInBhdGhcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdEh1YiBGbGF2b3JlZCBNYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm5vbkJvZHlQYXJhbWV0ZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCIsXG4gICAgICAgIFwiaW5cIixcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyUGFyYW1ldGVyU3ViU2NoZW1hXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZm9ybURhdGFQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9xdWVyeVBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdGhQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInBhcmFtZXRlclwiOiB7XG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYm9keVBhcmFtZXRlclwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL25vbkJvZHlQYXJhbWV0ZXJcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInNjaGVtYVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGRldGVybWluaXN0aWMgdmVyc2lvbiBvZiBhIEpTT04gU2NoZW1hIG9iamVjdC5cIixcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdGl0bGVcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZXNjcmlwdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4UHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIlxuICAgICAgICAgICAgfVxuICAgICAgICAgIF0sXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdHlwZVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIF0sXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYWxsT2ZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcImRpc2NyaW1pbmF0b3JcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwicmVhZE9ubHlcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ4bWxcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMveG1sXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGFtcGxlXCI6IHt9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJmaWxlU2NoZW1hXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgZGV0ZXJtaW5pc3RpYyB2ZXJzaW9uIG9mIGEgSlNPTiBTY2hlbWEgb2JqZWN0LlwiLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdGl0bGVcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZXNjcmlwdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9zdHJpbmdBcnJheVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiZmlsZVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInJlYWRPbmx5XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4dGVybmFsRG9jc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhhbXBsZVwiOiB7fVxuICAgICAgfSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICB9LFxuICAgIFwicHJpbWl0aXZlc0l0ZW1zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVJlcXVpcmVtZW50XCJcbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwic2VjdXJpdHlSZXF1aXJlbWVudFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgIH1cbiAgICB9LFxuICAgIFwieG1sXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lc3BhY2VcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHJlZml4XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImF0dHJpYnV0ZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIndyYXBwZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInRhZ1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4dGVybmFsRG9jc1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJzZWN1cml0eURlZmluaXRpb25zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYmFzaWNBdXRoZW50aWNhdGlvblNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXBpS2V5U2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJJbXBsaWNpdFNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyUGFzc3dvcmRTZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMkFwcGxpY2F0aW9uU2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJBY2Nlc3NDb2RlU2VjdXJpdHlcIlxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJiYXNpY0F1dGhlbnRpY2F0aW9uU2VjdXJpdHlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJiYXNpY1wiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiYXBpS2V5U2VjdXJpdHlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiLFxuICAgICAgICBcIm5hbWVcIixcbiAgICAgICAgXCJpblwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJhcGlLZXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJoZWFkZXJcIixcbiAgICAgICAgICAgIFwicXVlcnlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMkltcGxpY2l0U2VjdXJpdHlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiLFxuICAgICAgICBcImZsb3dcIixcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcIm9hdXRoMlwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZsb3dcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImltcGxpY2l0XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3Blc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgyUGFzc3dvcmRTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcInRva2VuVXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcIm9hdXRoMlwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZsb3dcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInBhc3N3b3JkXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3Blc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidG9rZW5VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMkFwcGxpY2F0aW9uU2VjdXJpdHlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiLFxuICAgICAgICBcImZsb3dcIixcbiAgICAgICAgXCJ0b2tlblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJhcHBsaWNhdGlvblwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInNjb3Blc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJBY2Nlc3NDb2RlU2VjdXJpdHlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiLFxuICAgICAgICBcImZsb3dcIixcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCIsXG4gICAgICAgIFwidG9rZW5VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYWNjZXNzQ29kZVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInNjb3Blc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgyU2NvcGVzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICB9XG4gICAgfSxcbiAgICBcIm1lZGlhVHlwZUxpc3RcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlXCJcbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwicGFyYW1ldGVyc0xpc3RcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgcGFyYW1ldGVycyBuZWVkZWQgdG8gc2VuZCBhIHZhbGlkIEFQSSBjYWxsLlwiLFxuICAgICAgXCJhZGRpdGlvbmFsSXRlbXNcIjogZmFsc2UsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9qc29uUmVmZXJlbmNlXCJcbiAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwic2NoZW1lc0xpc3RcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgdHJhbnNmZXIgcHJvdG9jb2wgb2YgdGhlIEFQSS5cIixcbiAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICBcImh0dHBcIixcbiAgICAgICAgICBcImh0dHBzXCIsXG4gICAgICAgICAgXCJ3c1wiLFxuICAgICAgICAgIFwid3NzXCJcbiAgICAgICAgXVxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgXCJjc3ZcIixcbiAgICAgICAgXCJzc3ZcIixcbiAgICAgICAgXCJ0c3ZcIixcbiAgICAgICAgXCJwaXBlc1wiXG4gICAgICBdLFxuICAgICAgXCJkZWZhdWx0XCI6IFwiY3N2XCJcbiAgICB9LFxuICAgIFwiY29sbGVjdGlvbkZvcm1hdFdpdGhNdWx0aVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgIFwiY3N2XCIsXG4gICAgICAgIFwic3N2XCIsXG4gICAgICAgIFwidHN2XCIsXG4gICAgICAgIFwicGlwZXNcIixcbiAgICAgICAgXCJtdWx0aVwiXG4gICAgICBdLFxuICAgICAgXCJkZWZhdWx0XCI6IFwiY3N2XCJcbiAgICB9LFxuICAgIFwidGl0bGVcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdGl0bGVcIlxuICAgIH0sXG4gICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZXNjcmlwdGlvblwiXG4gICAgfSxcbiAgICBcImRlZmF1bHRcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVmYXVsdFwiXG4gICAgfSxcbiAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbXVsdGlwbGVPZlwiXG4gICAgfSxcbiAgICBcIm1heGltdW1cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWF4aW11bVwiXG4gICAgfSxcbiAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgfSxcbiAgICBcIm1pbmltdW1cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWluaW11bVwiXG4gICAgfSxcbiAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgfSxcbiAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICB9LFxuICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgfSxcbiAgICBcInBhdHRlcm5cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvcGF0dGVyblwiXG4gICAgfSxcbiAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgIH0sXG4gICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgIH0sXG4gICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy91bmlxdWVJdGVtc1wiXG4gICAgfSxcbiAgICBcImVudW1cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZW51bVwiXG4gICAgfSxcbiAgICBcImpzb25SZWZlcmVuY2VcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCIkcmVmXCJcbiAgICAgIF0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiQ29yZSBzY2hlbWEgbWV0YS1zY2hlbWFcIixcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJzY2hlbWFBcnJheVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zaXRpdmVJbnRlZ2VyXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAwXG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIjoge1xuICAgICAgICAgICAgXCJhbGxPZlwiOiBbIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIiB9LCB7IFwiZGVmYXVsdFwiOiAwIH0gXVxuICAgICAgICB9LFxuICAgICAgICBcInNpbXBsZVR5cGVzXCI6IHtcbiAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYXJyYXlcIiwgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bGxcIiwgXCJudW1iZXJcIiwgXCJvYmplY3RcIiwgXCJzdHJpbmdcIiBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic3RyaW5nQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH1cbiAgICB9LFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiaWRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiJHNjaGVtYVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7fSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJtaW5pbXVtXCI6IDAsXG4gICAgICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwibnVtYmVyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwibnVtYmVyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCIgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJyZWdleFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYWRkaXRpb25hbEl0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH0sXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIiB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4UHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcbiAgICAgICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXG4gICAgICAgIFwicmVxdWlyZWRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCIgfSxcbiAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc3RyaW5nQXJyYXlcIiB9XG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NpbXBsZVR5cGVzXCIgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NpbXBsZVR5cGVzXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiYWxsT2ZcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfSxcbiAgICAgICAgXCJhbnlPZlwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9LFxuICAgICAgICBcIm9uZU9mXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH0sXG4gICAgICAgIFwibm90XCI6IHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IFsgXCJtYXhpbXVtXCIgXSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IFsgXCJtaW5pbXVtXCIgXVxuICAgIH0sXG4gICAgXCJkZWZhdWx0XCI6IHt9XG59XG4iXX0=
