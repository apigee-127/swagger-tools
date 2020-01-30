(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}(g.SwaggerTools || (g.SwaggerTools = {})).specs = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

var _ = (typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null);
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

},{"../lib/specs":2,"../schemas/json-schema-draft-04.json":16}],2:[function(require,module,exports){
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

var _ = (typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null);
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

      if (_.isArray(node)) {
        _.each(node, function (member, index) {
          walkItem(member, index.toString());
        });
      } else if (_.isPlainObject(node)) {
        _.forOwn(node, function (member, key) {
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

},{"../schemas/1.2/apiDeclaration.json":4,"../schemas/1.2/authorizationObject.json":5,"../schemas/1.2/dataType.json":6,"../schemas/1.2/dataTypeBase.json":7,"../schemas/1.2/infoObject.json":8,"../schemas/1.2/modelsObject.json":9,"../schemas/1.2/oauth2GrantType.json":10,"../schemas/1.2/operationObject.json":11,"../schemas/1.2/parameterObject.json":12,"../schemas/1.2/resourceListing.json":13,"../schemas/1.2/resourceObject.json":14,"../schemas/2.0/schema.json":15,"./helpers":1,"./validators":3}],3:[function(require,module,exports){
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

var _ = (typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null);
var helpers = require('./helpers');

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

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./helpers":1}],4:[function(require,module,exports){
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

},{}]},{},[2])(2)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvaGVscGVycy5qcyIsImxpYi9zcGVjcy5qcyIsImxpYi92YWxpZGF0b3JzLmpzIiwic2NoZW1hcy8xLjIvYXBpRGVjbGFyYXRpb24uanNvbiIsInNjaGVtYXMvMS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24iLCJzY2hlbWFzLzEuMi9kYXRhVHlwZUJhc2UuanNvbiIsInNjaGVtYXMvMS4yL2luZm9PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL21vZGVsc09iamVjdC5qc29uIiwic2NoZW1hcy8xLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24iLCJzY2hlbWFzLzEuMi9vcGVyYXRpb25PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL3BhcmFtZXRlck9iamVjdC5qc29uIiwic2NoZW1hcy8xLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24iLCJzY2hlbWFzLzEuMi9yZXNvdXJjZU9iamVjdC5qc29uIiwic2NoZW1hcy8yLjAvc2NoZW1hLmpzb24iLCJzY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUN0UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDOStDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzdwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdGpEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8qXHJcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxyXG4gKlxyXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgQXBpZ2VlIENvcnBvcmF0aW9uXHJcbiAqXHJcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcclxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxyXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXHJcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcclxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXHJcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XHJcbiAqXHJcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXHJcbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxyXG4gKlxyXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXHJcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxyXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcclxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxyXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxyXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXHJcbiAqIFRIRSBTT0ZUV0FSRS5cclxuICovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydfJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydfJ10gOiBudWxsKTtcclxudmFyIEpzb25SZWZzID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ0pzb25SZWZzJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydKc29uUmVmcyddIDogbnVsbCk7XHJcbnZhciB0cmF2ZXJzZSA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Wyd0cmF2ZXJzZSddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsndHJhdmVyc2UnXSA6IG51bGwpO1xyXG52YXIgWlNjaGVtYSA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydaU2NoZW1hJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydaU2NoZW1hJ10gOiBudWxsKTtcclxuXHJcbnZhciBjdXN0b21Kc29uU2NoZW1hRm9ybWF0cyA9IFsnYnl0ZScsICdkb3VibGUnLCAnZmxvYXQnLCAnaW50MzInLCAnaW50NjQnLCAnbWltZS10eXBlJywgJ3VyaS10ZW1wbGF0ZSddO1xyXG52YXIgZHJhZnQwNEpzb24gPSByZXF1aXJlKCcuLi9zY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24nKTtcclxudmFyIGRyYWZ0MDRVcmwgPSAnaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEnO1xyXG52YXIgc3BlY0NhY2hlID0ge307XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5yZWdpc3RlckN1c3RvbUZvcm1hdHMgPSBmdW5jdGlvbiAoanNvbikge1xyXG4gIHRyYXZlcnNlKGpzb24pLmZvckVhY2goZnVuY3Rpb24gKCkge1xyXG4gICAgdmFyIG5hbWUgPSB0aGlzLmtleTtcclxuICAgIHZhciBmb3JtYXQgPSB0aGlzLm5vZGU7XHJcblxyXG4gICAgaWYgKG5hbWUgPT09ICdmb3JtYXQnICYmIF8uaW5kZXhPZihaU2NoZW1hLmdldFJlZ2lzdGVyZWRGb3JtYXRzKCksIGZvcm1hdCkgPT09IC0xKSB7XHJcbiAgICAgIFpTY2hlbWEucmVnaXN0ZXJGb3JtYXQoZm9ybWF0LCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH0pO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMuY3JlYXRlSnNvblZhbGlkYXRvciA9IGZ1bmN0aW9uIChzY2hlbWFzKSB7XHJcbiAgdmFyIHZhbGlkYXRvciA9IG5ldyBaU2NoZW1hKHtcclxuICAgIGJyZWFrT25GaXJzdEVycm9yOiBmYWxzZSxcclxuICAgIHJlcG9ydFBhdGhBc0FycmF5OiB0cnVlXHJcbiAgfSk7XHJcbiAgdmFyIHJlc3VsdDtcclxuXHJcbiAgLy8gQWRkIHRoZSBkcmFmdC0wNCBzcGVjXHJcbiAgdmFsaWRhdG9yLnNldFJlbW90ZVJlZmVyZW5jZShkcmFmdDA0VXJsLCBkcmFmdDA0SnNvbik7XHJcblxyXG4gIC8vIFN3YWdnZXIgdXNlcyBzb21lIHVuc3VwcG9ydGVkL2ludmFsaWQgZm9ybWF0cyBzbyBqdXN0IG1ha2UgdGhlbSBhbGwgcGFzc1xyXG4gIF8uZWFjaChjdXN0b21Kc29uU2NoZW1hRm9ybWF0cywgZnVuY3Rpb24gKGZvcm1hdCkge1xyXG4gICAgWlNjaGVtYS5yZWdpc3RlckZvcm1hdChmb3JtYXQsIGZ1bmN0aW9uICgpIHtcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgLy8gQ29tcGlsZSBhbmQgdmFsaWRhdGUgdGhlIHNjaGVtYXNcclxuICBpZiAoIV8uaXNVbmRlZmluZWQoc2NoZW1hcykpIHtcclxuICAgIHJlc3VsdCA9IHZhbGlkYXRvci5jb21waWxlU2NoZW1hKHNjaGVtYXMpO1xyXG5cclxuICAgIC8vIElmIHRoZXJlIGlzIGFuIGVycm9yLCBpdCdzIHVucmVjb3ZlcmFibGUgc28ganVzdCBibG93IHRoZSBlZmYgdXBcclxuICAgIGlmIChyZXN1bHQgPT09IGZhbHNlKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0pTT04gU2NoZW1hIGZpbGUnICsgKHNjaGVtYXMubGVuZ3RoID4gMSA/ICdzIGFyZScgOiAnIGlzJykgKyAnIGludmFsaWQ6Jyk7XHJcblxyXG4gICAgICBfLmVhY2godmFsaWRhdG9yLmdldExhc3RFcnJvcnMoKSwgZnVuY3Rpb24gKGVycikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyAgJyArIChfLmlzQXJyYXkoZXJyLnBhdGgpID8gSnNvblJlZnMucGF0aFRvUHRyKGVyci5wYXRoKSA6IGVyci5wYXRoKSArICc6ICcgKyBlcnIubWVzc2FnZSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gY3JlYXRlIHZhbGlkYXRvciBkdWUgdG8gaW52YWxpZCBKU09OIFNjaGVtYScpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHZhbGlkYXRvcjtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLmZvcm1hdFJlc3VsdHMgPSBmdW5jdGlvbiAocmVzdWx0cykge1xyXG4gIGlmIChyZXN1bHRzKSB7XHJcbiAgICAvLyBVcGRhdGUgdGhlIHJlc3VsdHMgYmFzZWQgb24gaXRzIGNvbnRlbnQgdG8gaW5kaWNhdGUgc3VjY2Vzcy9mYWlsdXJlIGFjY29yZGluZ2x5XHJcbiAgICByZXN1bHRzID0gKHJlc3VsdHMuZXJyb3JzLmxlbmd0aCArIHJlc3VsdHMud2FybmluZ3MubGVuZ3RoICtcclxuICAgIF8ucmVkdWNlKHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoY291bnQsIGFSZXN1bHQpIHtcclxuICAgICAgaWYgKGFSZXN1bHQpIHtcclxuICAgICAgICBjb3VudCArPSBhUmVzdWx0LmVycm9ycy5sZW5ndGggKyBhUmVzdWx0Lndhcm5pbmdzLmxlbmd0aDtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIGNvdW50O1xyXG4gICAgfSwgMCkgPiAwKSA/IHJlc3VsdHMgOiB1bmRlZmluZWQ7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gcmVzdWx0cztcclxufTtcclxuXHJcbnZhciBnZXRFcnJvckNvdW50ID0gbW9kdWxlLmV4cG9ydHMuZ2V0RXJyb3JDb3VudCA9IGZ1bmN0aW9uIChyZXN1bHRzKSB7XHJcbiAgdmFyIGVycm9ycyA9IDA7XHJcblxyXG4gIGlmIChyZXN1bHRzKSB7XHJcbiAgICBlcnJvcnMgPSByZXN1bHRzLmVycm9ycy5sZW5ndGg7XHJcblxyXG4gICAgXy5lYWNoKHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoYWRSZXN1bHRzKSB7XHJcbiAgICAgIGlmIChhZFJlc3VsdHMpIHtcclxuICAgICAgICBlcnJvcnMgKz0gYWRSZXN1bHRzLmVycm9ycy5sZW5ndGg7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGVycm9ycztcclxufTtcclxuXHJcbnZhciBjb2VyY2VWZXJzaW9uID0gZnVuY3Rpb24gKHZlcnNpb24pIHtcclxuICAvLyBDb252ZXJ0IHRoZSB2ZXJzaW9uIHRvIGEgbnVtYmVyIChSZXF1aXJlZCBmb3IgaGVscGVycy5nZXRTcGVjKVxyXG4gIGlmICh2ZXJzaW9uICYmICFfLmlzU3RyaW5nKHZlcnNpb24pKSB7XHJcbiAgICB2ZXJzaW9uID0gdmVyc2lvbi50b1N0cmluZygpO1xyXG5cclxuICAgIC8vIEhhbmRsZSByb3VuZGluZyBpc3N1ZXMgKE9ubHkgcmVxdWlyZWQgZm9yIHdoZW4gU3dhZ2dlciB2ZXJzaW9uIGVuZHMgaW4gJy4wJylcclxuICAgIGlmICh2ZXJzaW9uLmluZGV4T2YoJy4nKSA9PT0gLTEpIHtcclxuICAgICAgdmVyc2lvbiArPSAnLjAnO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHZlcnNpb247XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgcHJvcGVyIHNwZWNpZmljYXRpb24gYmFzZWQgb24gdGhlIGh1bWFuIHJlYWRhYmxlIHZlcnNpb24uXHJcbiAqXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uIC0gVGhlIGh1bWFuIHJlYWRhYmxlIFN3YWdnZXIgdmVyc2lvbiAoRXg6IDEuMilcclxuICogQHBhcmFtIHtbYm9vbGVhbj1mYWxzZV19IHRocm93RXJyb3IgLSBUaHJvdyBhbiBlcnJvciBpZiB0aGUgdmVyc2lvbiBjb3VsZCBub3QgYmUgaWRlbnRpZmllZFxyXG4gKlxyXG4gKiBAcmV0dXJucyB0aGUgY29ycmVzcG9uZGluZyBTd2FnZ2VyIFNwZWNpZmljYXRpb24gb2JqZWN0IG9yIHVuZGVmaW5lZCBpZiB0aGVyZSBpcyBub25lXHJcbiAqL1xyXG5tb2R1bGUuZXhwb3J0cy5nZXRTcGVjID0gZnVuY3Rpb24gKHZlcnNpb24sIHRocm93RXJyb3IpIHtcclxuICB2YXIgc3BlYztcclxuXHJcbiAgdmVyc2lvbiA9IGNvZXJjZVZlcnNpb24odmVyc2lvbik7XHJcbiAgc3BlYyA9IHNwZWNDYWNoZVt2ZXJzaW9uXTtcclxuXHJcbiAgaWYgKF8uaXNVbmRlZmluZWQoc3BlYykpIHtcclxuICAgIHN3aXRjaCAodmVyc2lvbikge1xyXG4gICAgY2FzZSAnMS4yJzpcclxuICAgICAgc3BlYyA9IHJlcXVpcmUoJy4uL2xpYi9zcGVjcycpLnYxXzI7IC8vIGpzaGludCBpZ25vcmU6bGluZVxyXG5cclxuICAgICAgYnJlYWs7XHJcblxyXG4gICAgY2FzZSAnMi4wJzpcclxuICAgICAgc3BlYyA9IHJlcXVpcmUoJy4uL2xpYi9zcGVjcycpLnYyXzA7IC8vIGpzaGludCBpZ25vcmU6bGluZVxyXG5cclxuICAgICAgYnJlYWs7XHJcblxyXG4gICAgZGVmYXVsdDpcclxuICAgICAgaWYgKHRocm93RXJyb3IgPT09IHRydWUpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIFN3YWdnZXIgdmVyc2lvbjogJyArIHZlcnNpb24pO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gc3BlYztcclxufTtcclxuXHJcbi8qKlxyXG4gKiBBdGVtcHRzIHRvIGZpZ3VyZSBvdXQgdGhlIFN3YWdnZXIgdmVyc2lvbiBmcm9tIHRoZSBTd2FnZ2VyIGRvY3VtZW50LlxyXG4gKlxyXG4gKiBAcGFyYW0ge29iamVjdH0gZG9jdW1lbnQgLSBUaGUgU3dhZ2dlciBkb2N1bWVudFxyXG4gKlxyXG4gKiBAcmV0dXJucyB0aGUgU3dhZ2dlciB2ZXJzaW9uIG9yIHVuZGVmaW5lZCBpZiB0aGUgZG9jdW1lbnQgaXMgbm90IGEgU3dhZ2dlciBkb2N1bWVudFxyXG4gKi9cclxubW9kdWxlLmV4cG9ydHMuZ2V0U3dhZ2dlclZlcnNpb24gPSBmdW5jdGlvbiAoZG9jdW1lbnQpIHtcclxuICByZXR1cm4gXy5pc1BsYWluT2JqZWN0KGRvY3VtZW50KSA/IGNvZXJjZVZlcnNpb24oZG9jdW1lbnQuc3dhZ2dlclZlcnNpb24gfHwgZG9jdW1lbnQuc3dhZ2dlcikgOiB1bmRlZmluZWQ7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5wcmludFZhbGlkYXRpb25SZXN1bHRzID0gZnVuY3Rpb24gKHZlcnNpb24sIGFwaURPclNPLCBhcGlEZWNsYXJhdGlvbnMsIHJlc3VsdHMsIHByaW50U3VtbWFyeSkge1xyXG4gIHZhciBoYXNFcnJvcnMgPSBnZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMDtcclxuICB2YXIgc3RyZWFtID0gaGFzRXJyb3JzID8gY29uc29sZS5lcnJvciA6IGNvbnNvbGUubG9nO1xyXG4gIHZhciBwbHVyYWxpemUgPSBmdW5jdGlvbiAoc3RyaW5nLCBjb3VudCkge1xyXG4gICAgcmV0dXJuIGNvdW50ID09PSAxID8gc3RyaW5nIDogc3RyaW5nICsgJ3MnO1xyXG4gIH07XHJcbiAgdmFyIHByaW50RXJyb3JzT3JXYXJuaW5ncyA9IGZ1bmN0aW9uIChoZWFkZXIsIGVudHJpZXMsIGluZGVudCkge1xyXG4gICAgaWYgKGhlYWRlcikge1xyXG4gICAgICBzdHJlYW0oaGVhZGVyICsgJzonKTtcclxuICAgICAgc3RyZWFtKCk7XHJcbiAgICB9XHJcblxyXG4gICAgXy5lYWNoKGVudHJpZXMsIGZ1bmN0aW9uIChlbnRyeSkge1xyXG4gICAgICBzdHJlYW0obmV3IEFycmF5KGluZGVudCArIDEpLmpvaW4oJyAnKSArIEpzb25SZWZzLnBhdGhUb1B0cihlbnRyeS5wYXRoKSArICc6ICcgKyBlbnRyeS5tZXNzYWdlKTtcclxuXHJcbiAgICAgIGlmIChlbnRyeS5pbm5lcikge1xyXG4gICAgICAgIHByaW50RXJyb3JzT3JXYXJuaW5ncyAodW5kZWZpbmVkLCBlbnRyeS5pbm5lciwgaW5kZW50ICsgMik7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGlmIChoZWFkZXIpIHtcclxuICAgICAgc3RyZWFtKCk7XHJcbiAgICB9XHJcbiAgfTtcclxuICB2YXIgZXJyb3JDb3VudCA9IDA7XHJcbiAgdmFyIHdhcm5pbmdDb3VudCA9IDA7XHJcblxyXG4gIHN0cmVhbSgpO1xyXG5cclxuICBpZiAocmVzdWx0cy5lcnJvcnMubGVuZ3RoID4gMCkge1xyXG4gICAgZXJyb3JDb3VudCArPSByZXN1bHRzLmVycm9ycy5sZW5ndGg7XHJcblxyXG4gICAgcHJpbnRFcnJvcnNPcldhcm5pbmdzKCdBUEkgRXJyb3JzJywgcmVzdWx0cy5lcnJvcnMsIDIpO1xyXG4gIH1cclxuXHJcbiAgaWYgKHJlc3VsdHMud2FybmluZ3MubGVuZ3RoID4gMCkge1xyXG4gICAgd2FybmluZ0NvdW50ICs9IHJlc3VsdHMud2FybmluZ3MubGVuZ3RoO1xyXG5cclxuICAgIHByaW50RXJyb3JzT3JXYXJuaW5ncygnQVBJIFdhcm5pbmdzJywgcmVzdWx0cy53YXJuaW5ncywgMik7XHJcbiAgfVxyXG5cclxuICBpZiAocmVzdWx0cy5hcGlEZWNsYXJhdGlvbnMpIHtcclxuICAgIHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zLmZvckVhY2goZnVuY3Rpb24gKGFkUmVzdWx0LCBpbmRleCkge1xyXG4gICAgICBpZiAoIWFkUmVzdWx0KSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB2YXIgbmFtZSA9IGFwaURlY2xhcmF0aW9uc1tpbmRleF0ucmVzb3VyY2VQYXRoIHx8IGluZGV4O1xyXG5cclxuICAgICAgaWYgKGFkUmVzdWx0LmVycm9ycy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgZXJyb3JDb3VudCArPSBhZFJlc3VsdC5lcnJvcnMubGVuZ3RoO1xyXG5cclxuICAgICAgICBwcmludEVycm9yc09yV2FybmluZ3MoJyAgQVBJIERlY2xhcmF0aW9uICgnICsgbmFtZSArICcpIEVycm9ycycsIGFkUmVzdWx0LmVycm9ycywgNCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChhZFJlc3VsdC53YXJuaW5ncy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgd2FybmluZ0NvdW50ICs9IGFkUmVzdWx0Lndhcm5pbmdzLmxlbmd0aDtcclxuXHJcbiAgICAgICAgcHJpbnRFcnJvcnNPcldhcm5pbmdzKCcgIEFQSSBEZWNsYXJhdGlvbiAoJyArIG5hbWUgKyAnKSBXYXJuaW5ncycsIGFkUmVzdWx0Lndhcm5pbmdzLCA0KTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBpZiAocHJpbnRTdW1tYXJ5KSB7XHJcbiAgICBpZiAoZXJyb3JDb3VudCA+IDApIHtcclxuICAgICAgc3RyZWFtKGVycm9yQ291bnQgKyAnICcgKyBwbHVyYWxpemUoJ2Vycm9yJywgZXJyb3JDb3VudCkgKyAnIGFuZCAnICsgd2FybmluZ0NvdW50ICsgJyAnICtcclxuICAgICAgICAgICAgICAgICAgICBwbHVyYWxpemUoJ3dhcm5pbmcnLCB3YXJuaW5nQ291bnQpKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHN0cmVhbSgnVmFsaWRhdGlvbiBzdWNjZWVkZWQgYnV0IHdpdGggJyArIHdhcm5pbmdDb3VudCArICcgJyArIHBsdXJhbGl6ZSgnd2FybmluZycsIHdhcm5pbmdDb3VudCkpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgc3RyZWFtKCk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5zd2FnZ2VyT3BlcmF0aW9uTWV0aG9kcyA9IFtcclxuICAnREVMRVRFJyxcclxuICAnR0VUJyxcclxuICAnSEVBRCcsXHJcbiAgJ09QVElPTlMnLFxyXG4gICdQQVRDSCcsXHJcbiAgJ1BPU1QnLFxyXG4gICdQVVQnXHJcbl07XHJcbiIsIi8qXHJcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxyXG4gKlxyXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgQXBpZ2VlIENvcnBvcmF0aW9uXHJcbiAqXHJcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcclxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxyXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXHJcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcclxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXHJcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XHJcbiAqXHJcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXHJcbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxyXG4gKlxyXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXHJcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxyXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcclxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxyXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxyXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXHJcbiAqIFRIRSBTT0ZUV0FSRS5cclxuICovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydfJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydfJ10gOiBudWxsKTtcclxudmFyIGFzeW5jID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ2FzeW5jJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydhc3luYyddIDogbnVsbCk7XHJcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XHJcbnZhciBKc29uUmVmcyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydKc29uUmVmcyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnSnNvblJlZnMnXSA6IG51bGwpO1xyXG52YXIgU3BhcmtNRDUgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snU3BhcmtNRDUnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ1NwYXJrTUQ1J10gOiBudWxsKTtcclxudmFyIHN3YWdnZXJDb252ZXJ0ZXIgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snU3dhZ2dlckNvbnZlcnRlciddWydjb252ZXJ0J10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydTd2FnZ2VyQ29udmVydGVyJ11bJ2NvbnZlcnQnXSA6IG51bGwpO1xyXG52YXIgdHJhdmVyc2UgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1sndHJhdmVyc2UnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ3RyYXZlcnNlJ10gOiBudWxsKTtcclxudmFyIHZhbGlkYXRvcnMgPSByZXF1aXJlKCcuL3ZhbGlkYXRvcnMnKTtcclxudmFyIFlBTUwgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1snanN5YW1sJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydqc3lhbWwnXSA6IG51bGwpO1xyXG5cclxuLy8gV29yayBhcm91bmQgc3dhZ2dlci1jb252ZXJ0ZXIgcGFja2FnaW5nIGlzc3VlIChCcm93c2VyIGJ1aWxkcyBvbmx5KVxyXG5pZiAoXy5pc1BsYWluT2JqZWN0KHN3YWdnZXJDb252ZXJ0ZXIpKSB7XHJcbiAgc3dhZ2dlckNvbnZlcnRlciA9IGdsb2JhbC5Td2FnZ2VyQ29udmVydGVyLmNvbnZlcnQ7XHJcbn1cclxuXHJcbnZhciBkb2N1bWVudENhY2hlID0ge307XHJcblxyXG52YXIgc2FuaXRpemVSZWYgPSBmdW5jdGlvbiAodmVyc2lvbiwgcmVmKSB7XHJcbiAgcmV0dXJuIHZlcnNpb24gIT09ICcxLjInID8gcmVmIDogcmVmLnJlcGxhY2UoJyMvbW9kZWxzLycsICcnKTtcclxufTtcclxuXHJcbnZhciBzd2FnZ2VyMVJlZlByZVByb2Nlc29yID0gZnVuY3Rpb24gKG9iaikge1xyXG4gIHZhciBwT2JqID0gXy5jbG9uZURlZXAob2JqKTtcclxuXHJcbiAgcE9iai4kcmVmID0gJyMvbW9kZWxzLycgKyBvYmouJHJlZjtcclxuXHJcbiAgcmV0dXJuIHBPYmo7XHJcbn07XHJcbnZhciB2YWxpZE9wdGlvbk5hbWVzID0gXy5tYXAoaGVscGVycy5zd2FnZ2VyT3BlcmF0aW9uTWV0aG9kcywgZnVuY3Rpb24gKG1ldGhvZCkge1xyXG4gIHJldHVybiBtZXRob2QudG9Mb3dlckNhc2UoKTtcclxufSk7XHJcblxyXG52YXIgaXNSZW1vdGVQdHIgPSBmdW5jdGlvbiAocmVmRGV0YWlscykge1xyXG4gIHJldHVybiBbJ3JlbGF0aXZlJywgJ3JlbW90ZSddLmluZGV4T2YocmVmRGV0YWlscy50eXBlKSA+IC0xO1xyXG59O1xyXG5cclxudmFyIGNyZWF0ZUVycm9yT3JXYXJuaW5nID0gZnVuY3Rpb24gKGNvZGUsIG1lc3NhZ2UsIHBhdGgsIGRlc3QpIHtcclxuICBkZXN0LnB1c2goe1xyXG4gICAgY29kZTogY29kZSxcclxuICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXHJcbiAgICBwYXRoOiBwYXRoXHJcbiAgfSk7XHJcbn07XHJcblxyXG52YXIgYWRkUmVmZXJlbmNlID0gZnVuY3Rpb24gKGNhY2hlRW50cnksIGRlZlBhdGhPclB0ciwgcmVmUGF0aE9yUHRyLCByZXN1bHRzLCBvbWl0RXJyb3IpIHtcclxuICB2YXIgcmVzdWx0ID0gdHJ1ZTtcclxuICB2YXIgc3dhZ2dlclZlcnNpb24gPSBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGNhY2hlRW50cnkucmVzb2x2ZWQpO1xyXG4gIHZhciBkZWZQYXRoID0gXy5pc0FycmF5KGRlZlBhdGhPclB0cikgPyBkZWZQYXRoT3JQdHIgOiBKc29uUmVmcy5wYXRoRnJvbVB0cihkZWZQYXRoT3JQdHIpO1xyXG4gIHZhciBkZWZQdHIgPSBfLmlzQXJyYXkoZGVmUGF0aE9yUHRyKSA/IEpzb25SZWZzLnBhdGhUb1B0cihkZWZQYXRoT3JQdHIpIDogZGVmUGF0aE9yUHRyO1xyXG4gIHZhciByZWZQYXRoID0gXy5pc0FycmF5KHJlZlBhdGhPclB0cikgPyByZWZQYXRoT3JQdHIgOiBKc29uUmVmcy5wYXRoRnJvbVB0cihyZWZQYXRoT3JQdHIpO1xyXG4gIHZhciByZWZQdHIgPSBfLmlzQXJyYXkocmVmUGF0aE9yUHRyKSA/IEpzb25SZWZzLnBhdGhUb1B0cihyZWZQYXRoT3JQdHIpIDogcmVmUGF0aE9yUHRyO1xyXG4gIHZhciBjb2RlO1xyXG4gIHZhciBkZWY7XHJcbiAgdmFyIGRpc3BsYXlJZDtcclxuICB2YXIgaTtcclxuICB2YXIgbXNnUHJlZml4O1xyXG4gIHZhciB0eXBlO1xyXG5cclxuICBkZWYgPSBjYWNoZUVudHJ5LmRlZmluaXRpb25zW2RlZlB0cl07XHJcbiAgdHlwZSA9IGRlZlBhdGhbMF07XHJcbiAgY29kZSA9IHR5cGUgPT09ICdzZWN1cml0eURlZmluaXRpb25zJyA/XHJcbiAgICAnU0VDVVJJVFlfREVGSU5JVElPTicgOlxyXG4gICAgdHlwZS5zdWJzdHJpbmcoMCwgdHlwZS5sZW5ndGggLSAxKS50b1VwcGVyQ2FzZSgpO1xyXG4gIGRpc3BsYXlJZCA9IHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/IGRlZlBhdGhbZGVmUGF0aC5sZW5ndGggLSAxXSA6IGRlZlB0cjtcclxuICBtc2dQcmVmaXggPSB0eXBlID09PSAnc2VjdXJpdHlEZWZpbml0aW9ucycgP1xyXG4gICAgJ1NlY3VyaXR5IGRlZmluaXRpb24nIDpcclxuICAgIGNvZGUuY2hhckF0KDApICsgY29kZS5zdWJzdHJpbmcoMSkudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgLy8gVGhpcyBpcyBhbiBhdXRob3JpemF0aW9uIHNjb3BlIHJlZmVyZW5jZVxyXG4gIGlmIChbJ2F1dGhvcml6YXRpb25zJywgJ3NlY3VyaXR5RGVmaW5pdGlvbnMnXS5pbmRleE9mKGRlZlBhdGhbMF0pID4gLTEgJiYgZGVmUGF0aFsyXSA9PT0gJ3Njb3BlcycpIHtcclxuICAgIGNvZGUgKz0gJ19TQ09QRSc7XHJcbiAgICBtc2dQcmVmaXggKz0gJyBzY29wZSc7XHJcbiAgfVxyXG5cclxuICAvLyBJZiB0aGUgcmVmZXJlbmNlIHdhcyBub3QgZm91bmQgYW5kIHRoaXMgaXMgbm90IGFuIGF1dGhvcml6YXRpb24vc2VjdXJpdHkgc2NvcGUgcmVmZXJlbmNlLCBhdHRlbXB0IHRvIGZpbmQgYVxyXG4gIC8vIHBhcmVudCBvYmplY3QgdG8gYWRkIHRoZSByZWZlcmVuY2UgdG9vLiAgKElzc3VlIDE3NilcclxuICBpZiAoXy5pc1VuZGVmaW5lZChkZWYpICYmIFsnQVVUSE9SSVpBVElPTl9TQ09QRScsICdTRUNVUklUWV9ERUZJTklUSU9OX1NDT1BFJ10uaW5kZXhPZihjb2RlKSA9PT0gLTEpIHtcclxuICAgIC8vIEF0dGVtcHQgdG8gZmluZCB0aGUgZGVmaW5pdGlvbiBpbiBjYXNlIHRoZSByZWZlcmVuY2UgaXMgdG8gYSBwYXRoIHdpdGhpbiBhIGRlZmluaXRpb25gXHJcbiAgICBmb3IgKGkgPSAxOyBpIDwgZGVmUGF0aC5sZW5ndGg7IGkrKykge1xyXG4gICAgICB2YXIgcFBhdGggPSBkZWZQYXRoLnNsaWNlKDAsIGRlZlBhdGgubGVuZ3RoIC0gaSk7XHJcbiAgICAgIHZhciBwUHRyID0gSnNvblJlZnMucGF0aFRvUHRyKHBQYXRoKTtcclxuICAgICAgdmFyIHBEZWYgPSBjYWNoZUVudHJ5LmRlZmluaXRpb25zW3BQdHJdO1xyXG5cclxuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHBEZWYpKSB7XHJcbiAgICAgICAgZGVmID0gcERlZjtcclxuXHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIGlmIChfLmlzVW5kZWZpbmVkKGRlZikpIHtcclxuICAgIGlmICghb21pdEVycm9yKSB7XHJcbiAgICAgIGlmIChjYWNoZUVudHJ5LnN3YWdnZXJWZXJzaW9uICE9PSAnMS4yJyAmJiBbJ1NFQ1VSSVRZX0RFRklOSVRJT04nLCAnU0VDVVJJVFlfREVGSU5JVElPTl9TQ09QRSddLmluZGV4T2YoY29kZSkgPT09IC0xKSB7XHJcbiAgICAgICAgcmVmUGF0aC5wdXNoKCckcmVmJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlJFU09MVkFCTEVfJyArIGNvZGUsIG1zZ1ByZWZpeCArICcgY291bGQgbm90IGJlIHJlc29sdmVkOiAnICsgZGlzcGxheUlkLCByZWZQYXRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVzdWx0ID0gZmFsc2U7XHJcbiAgfSBlbHNlIHtcclxuICAgIGlmIChfLmlzVW5kZWZpbmVkKGRlZi5yZWZlcmVuY2VzKSkge1xyXG4gICAgICBkZWYucmVmZXJlbmNlcyA9IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIGRlZi5yZWZlcmVuY2VzLnB1c2gocmVmUHRyKTtcclxuICB9XHJcblxyXG4gIHJldHVybiByZXN1bHQ7XHJcbn07XHJcblxyXG52YXIgZ2V0T3JDb21wb3NlU2NoZW1hID0gZnVuY3Rpb24gKGRvY3VtZW50TWV0YWRhdGEsIG1vZGVsSWQpIHtcclxuICB2YXIgdGl0bGUgPSAnQ29tcG9zZWQgJyArIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBKc29uUmVmcy5wYXRoRnJvbVB0cihtb2RlbElkKS5wb3AoKSA6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbElkKTtcclxuICB2YXIgbWV0YWRhdGEgPSBkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW21vZGVsSWRdO1xyXG4gIHZhciBvcmlnaW5hbFQgPSB0cmF2ZXJzZShkb2N1bWVudE1ldGFkYXRhLm9yaWdpbmFsKTtcclxuICB2YXIgcmVzb2x2ZWRUID0gdHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCk7XHJcbiAgdmFyIGNvbXBvc2VkO1xyXG4gIHZhciBvcmlnaW5hbDtcclxuXHJcbiAgaWYgKCFtZXRhZGF0YSkge1xyXG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICB9XHJcblxyXG4gIG9yaWdpbmFsID0gXy5jbG9uZURlZXAob3JpZ2luYWxULmdldChKc29uUmVmcy5wYXRoRnJvbVB0cihtb2RlbElkKSkpO1xyXG4gIGNvbXBvc2VkID0gXy5jbG9uZURlZXAocmVzb2x2ZWRULmdldChKc29uUmVmcy5wYXRoRnJvbVB0cihtb2RlbElkKSkpO1xyXG5cclxuICAvLyBDb252ZXJ0IHRoZSBTd2FnZ2VyIDEuMiBkb2N1bWVudCB0byBhIHZhbGlkIEpTT04gU2NoZW1hIGZpbGVcclxuICBpZiAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcclxuICAgIC8vIENyZWF0ZSBpbmhlcml0YW5jZSBtb2RlbFxyXG4gICAgaWYgKG1ldGFkYXRhLmxpbmVhZ2UubGVuZ3RoID4gMCkge1xyXG4gICAgICBjb21wb3NlZC5hbGxPZiA9IFtdO1xyXG5cclxuICAgICAgXy5lYWNoKG1ldGFkYXRhLmxpbmVhZ2UsIGZ1bmN0aW9uIChtb2RlbElkKSB7XHJcbiAgICAgICAgY29tcG9zZWQuYWxsT2YucHVzaChnZXRPckNvbXBvc2VTY2hlbWEoZG9jdW1lbnRNZXRhZGF0YSwgbW9kZWxJZCkpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBSZW1vdmUgdGhlIHN1YlR5cGVzIHByb3BlcnR5XHJcbiAgICBkZWxldGUgY29tcG9zZWQuc3ViVHlwZXM7XHJcblxyXG4gICAgXy5lYWNoKGNvbXBvc2VkLnByb3BlcnRpZXMsIGZ1bmN0aW9uIChwcm9wZXJ0eSwgbmFtZSkge1xyXG4gICAgICB2YXIgb1Byb3AgPSBvcmlnaW5hbC5wcm9wZXJ0aWVzW25hbWVdO1xyXG5cclxuICAgICAgLy8gQ29udmVydCB0aGUgc3RyaW5nIHZhbHVlcyB0byBudW1lcmljYWwgdmFsdWVzXHJcbiAgICAgIF8uZWFjaChbJ21heGltdW0nLCAnbWluaW11bSddLCBmdW5jdGlvbiAocHJvcCkge1xyXG4gICAgICAgIGlmIChfLmlzU3RyaW5nKHByb3BlcnR5W3Byb3BdKSkge1xyXG4gICAgICAgICAgcHJvcGVydHlbcHJvcF0gPSBwYXJzZUZsb2F0KHByb3BlcnR5W3Byb3BdKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgXy5lYWNoKEpzb25SZWZzLmZpbmRSZWZzKG9Qcm9wLCB7XHJcbiAgICAgICAgaW5jbHVkZUludmFsaWQ6IHRydWUsXHJcbiAgICAgICAgcmVmUHJlUHJvY2Vzc29yOiBzd2FnZ2VyMVJlZlByZVByb2Nlc29yXHJcbiAgICAgIH0pLCBmdW5jdGlvbiAocmVmRGV0YWlscywgcmVmUHRyKSB7XHJcbiAgICAgICAgdmFyIGRNZXRhZGF0YSA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbcmVmRGV0YWlscy51cmldO1xyXG4gICAgICAgIHZhciBwYXRoID0gSnNvblJlZnMucGF0aEZyb21QdHIocmVmUHRyKTtcclxuXHJcbiAgICAgICAgaWYgKGRNZXRhZGF0YS5saW5lYWdlLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIHRyYXZlcnNlKHByb3BlcnR5KS5zZXQocGF0aCwgZ2V0T3JDb21wb3NlU2NoZW1hKGRvY3VtZW50TWV0YWRhdGEsIHJlZkRldGFpbHMudXJpKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHRyYXZlcnNlKHByb3BlcnR5KS5zZXQocGF0aC5jb25jYXQoJ3RpdGxlJyksICdDb21wb3NlZCAnICsgc2FuaXRpemVSZWYoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVmRGV0YWlscy51cmkpKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvLyBTY3J1YiBpZCBwcm9wZXJ0aWVzXHJcbiAgY29tcG9zZWQgPSB0cmF2ZXJzZShjb21wb3NlZCkubWFwKGZ1bmN0aW9uICh2YWwpIHtcclxuICAgIGlmICh0aGlzLmtleSA9PT0gJ2lkJyAmJiBfLmlzU3RyaW5nKHZhbCkpIHtcclxuICAgICAgdGhpcy5yZW1vdmUoKTtcclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgY29tcG9zZWQudGl0bGUgPSB0aXRsZTtcclxuXHJcbiAgcmV0dXJuIGNvbXBvc2VkO1xyXG59O1xyXG5cclxudmFyIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nID0gZnVuY3Rpb24gKHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XHJcbiAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOVVNFRF8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBpcyBkZWZpbmVkIGJ1dCBpcyBub3QgdXNlZDogJyArIHZhbCwgcGF0aCwgZGVzdCk7XHJcbn07XHJcblxyXG52YXIgZ2V0RG9jdW1lbnRDYWNoZSA9IGZ1bmN0aW9uIChhcGlET3JTTykge1xyXG4gIHZhciBrZXkgPSBTcGFya01ENS5oYXNoKEpTT04uc3RyaW5naWZ5KGFwaURPclNPKSk7XHJcbiAgdmFyIGNhY2hlRW50cnkgPSBkb2N1bWVudENhY2hlW2tleV0gfHwgXy5maW5kKGRvY3VtZW50Q2FjaGUsIGZ1bmN0aW9uIChjYWNoZUVudHJ5KSB7XHJcbiAgICByZXR1cm4gY2FjaGVFbnRyeS5yZXNvbHZlZElkID09PSBrZXk7XHJcbiAgfSk7XHJcblxyXG4gIGlmICghY2FjaGVFbnRyeSkge1xyXG4gICAgY2FjaGVFbnRyeSA9IGRvY3VtZW50Q2FjaGVba2V5XSA9IHtcclxuICAgICAgZGVmaW5pdGlvbnM6IHt9LFxyXG4gICAgICBvcmlnaW5hbDogYXBpRE9yU08sXHJcbiAgICAgIHJlc29sdmVkOiB1bmRlZmluZWQsXHJcbiAgICAgIHN3YWdnZXJWZXJzaW9uOiBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGFwaURPclNPKVxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIHJldHVybiBjYWNoZUVudHJ5O1xyXG59O1xyXG5cclxudmFyIGhhbmRsZVZhbGlkYXRpb25FcnJvciA9IGZ1bmN0aW9uIChyZXN1bHRzLCBjYWxsYmFjaykge1xyXG4gIHZhciBlcnIgPSBuZXcgRXJyb3IoJ1RoZSBTd2FnZ2VyIGRvY3VtZW50KHMpIGFyZSBpbnZhbGlkJyk7XHJcblxyXG4gIGVyci5lcnJvcnMgPSByZXN1bHRzLmVycm9ycztcclxuICBlcnIuZmFpbGVkVmFsaWRhdGlvbiA9IHRydWU7XHJcbiAgZXJyLndhcm5pbmdzID0gcmVzdWx0cy53YXJuaW5ncztcclxuXHJcbiAgaWYgKHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zKSB7XHJcbiAgICBlcnIuYXBpRGVjbGFyYXRpb25zID0gcmVzdWx0cy5hcGlEZWNsYXJhdGlvbnM7XHJcbiAgfVxyXG5cclxuICBjYWxsYmFjayhlcnIpO1xyXG59O1xyXG5cclxudmFyIG5vcm1hbGl6ZVBhdGggPSBmdW5jdGlvbiAocGF0aCkge1xyXG4gIHZhciBtYXRjaGVzID0gcGF0aC5tYXRjaCgvXFx7KC4qPylcXH0vZyk7XHJcbiAgdmFyIGFyZ05hbWVzID0gW107XHJcbiAgdmFyIG5vcm1QYXRoID0gcGF0aDtcclxuXHJcbiAgaWYgKG1hdGNoZXMpIHtcclxuICAgIF8uZWFjaChtYXRjaGVzLCBmdW5jdGlvbiAobWF0Y2gsIGluZGV4KSB7XHJcbiAgICAgIG5vcm1QYXRoID0gbm9ybVBhdGgucmVwbGFjZShtYXRjaCwgJ3snICsgaW5kZXggKyAnfScpO1xyXG4gICAgICBhcmdOYW1lcy5wdXNoKG1hdGNoLnJlcGxhY2UoL1t7fV0vZywgJycpKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHBhdGg6IG5vcm1QYXRoLFxyXG4gICAgYXJnczogYXJnTmFtZXNcclxuICB9O1xyXG59O1xyXG5cclxudmFyIHJlbW92ZUNpcmN1bGFycyA9IGZ1bmN0aW9uIChvYmopIHtcclxuICBmdW5jdGlvbiB3YWxrIChhbmNlc3RvcnMsIG5vZGUsIHBhdGgpIHtcclxuICAgIGZ1bmN0aW9uIHdhbGtJdGVtIChpdGVtLCBzZWdtZW50KSB7XHJcbiAgICAgIHBhdGgucHVzaChzZWdtZW50KTtcclxuICAgICAgd2FsayhhbmNlc3RvcnMsIGl0ZW0sIHBhdGgpO1xyXG4gICAgICBwYXRoLnBvcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFdlIGRvIG5vdCBwcm9jZXNzIGNpcmN1bGFyIG9iamVjdHMgYWdhaW5cclxuICAgIGlmIChhbmNlc3RvcnMuaW5kZXhPZihub2RlKSA9PT0gLTEpIHtcclxuICAgICAgYW5jZXN0b3JzLnB1c2gobm9kZSk7XHJcblxyXG4gICAgICBpZiAoXy5pc0FycmF5KG5vZGUpKSB7XHJcbiAgICAgICAgXy5lYWNoKG5vZGUsIGZ1bmN0aW9uIChtZW1iZXIsIGluZGV4KSB7XHJcbiAgICAgICAgICB3YWxrSXRlbShtZW1iZXIsIGluZGV4LnRvU3RyaW5nKCkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9IGVsc2UgaWYgKF8uaXNQbGFpbk9iamVjdChub2RlKSkge1xyXG4gICAgICAgIF8uZm9yT3duKG5vZGUsIGZ1bmN0aW9uIChtZW1iZXIsIGtleSkge1xyXG4gICAgICAgICAgd2Fsa0l0ZW0obWVtYmVyLCBrZXkudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIF8uc2V0KG9iaiwgcGF0aCwge30pO1xyXG4gICAgfVxyXG5cclxuICAgIGFuY2VzdG9ycy5wb3AoKTtcclxuICB9XHJcblxyXG4gIHdhbGsoW10sIG9iaiwgW10pO1xyXG59O1xyXG5cclxuXHJcbnZhciB2YWxpZGF0ZU5vRXhpc3QgPSBmdW5jdGlvbiAoZGF0YSwgdmFsLCBjb2RlU3VmZml4LCBtc2dQcmVmaXgsIHBhdGgsIGRlc3QpIHtcclxuICBpZiAoIV8uaXNVbmRlZmluZWQoZGF0YSkgJiYgZGF0YS5pbmRleE9mKHZhbCkgPiAtMSkge1xyXG4gICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBhbHJlYWR5IGRlZmluZWQ6ICcgKyB2YWwsIHBhdGgsIGRlc3QpO1xyXG4gIH1cclxufTtcclxuXHJcbnZhciB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzID0gZnVuY3Rpb24gKGRvY3VtZW50TWV0YWRhdGEsIHNjaGVtYSwgcGF0aCwgcmVzdWx0cywgc2tpcCkge1xyXG4gIHRyeSB7XHJcbiAgICB2YWxpZGF0b3JzLnZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiwgc2NoZW1hLCBwYXRoLCB1bmRlZmluZWQpO1xyXG4gIH0gY2F0Y2ggKGVycikge1xyXG4gICAgaWYgKCFza2lwKSB7XHJcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKGVyci5jb2RlLCBlcnIubWVzc2FnZSwgZXJyLnBhdGgsIHJlc3VsdHMuZXJyb3JzKTtcclxuICAgIH1cclxuICB9XHJcbn07XHJcblxyXG52YXIgcHJvY2Vzc0RvY3VtZW50ID0gZnVuY3Rpb24gKGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpIHtcclxuICB2YXIgc3dhZ2dlclZlcnNpb24gPSBkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uO1xyXG4gIHZhciBnZXREZWZpbml0aW9uTWV0YWRhdGEgPSBmdW5jdGlvbiAoZGVmUGF0aCwgaW5saW5lKSB7XHJcbiAgICB2YXIgZGVmUHRyID0gSnNvblJlZnMucGF0aFRvUHRyKGRlZlBhdGgpO1xyXG4gICAgdmFyIG1ldGFkYXRhID0gZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1tkZWZQdHJdO1xyXG5cclxuICAgIGlmICghbWV0YWRhdGEpIHtcclxuICAgICAgbWV0YWRhdGEgPSBkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW2RlZlB0cl0gPSB7XHJcbiAgICAgICAgaW5saW5lOiBpbmxpbmUgfHwgZmFsc2UsXHJcbiAgICAgICAgcmVmZXJlbmNlczogW11cclxuICAgICAgfTtcclxuXHJcbiAgICAgIC8vIEZvciBtb2RlbCBkZWZpbml0aW9ucywgYWRkIHRoZSBpbmhlcml0YW5jZSBwcm9wZXJ0aWVzXHJcbiAgICAgIGlmIChbJ2RlZmluaXRpb25zJywgJ21vZGVscyddLmluZGV4T2YoSnNvblJlZnMucGF0aEZyb21QdHIoZGVmUHRyKVswXSkgPiAtMSkge1xyXG4gICAgICAgIG1ldGFkYXRhLmN5Y2xpY2FsID0gZmFsc2U7XHJcbiAgICAgICAgbWV0YWRhdGEubGluZWFnZSA9IHVuZGVmaW5lZDtcclxuICAgICAgICBtZXRhZGF0YS5wYXJlbnRzID0gW107XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbWV0YWRhdGE7XHJcbiAgfTtcclxuICB2YXIgZ2V0RGlzcGxheUlkID0gZnVuY3Rpb24gKGlkKSB7XHJcbiAgICByZXR1cm4gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gSnNvblJlZnMucGF0aEZyb21QdHIoaWQpLnBvcCgpIDogaWQ7XHJcbiAgfTtcclxuICB2YXIganNvblJlZnNPcHRpb25zID0ge1xyXG4gICAgZmlsdGVyOiAnbG9jYWwnLFxyXG4gICAgaW5jbHVkZUludmFsaWQ6IHRydWVcclxuICB9O1xyXG4gIHZhciB3YWxrID0gZnVuY3Rpb24gKHJvb3QsIGlkLCBsaW5lYWdlKSB7XHJcbiAgICB2YXIgZGVmaW5pdGlvbiA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbaWQgfHwgcm9vdF07XHJcblxyXG4gICAgaWYgKGRlZmluaXRpb24pIHtcclxuICAgICAgXy5lYWNoKGRlZmluaXRpb24ucGFyZW50cywgZnVuY3Rpb24gKHBhcmVudCkge1xyXG4gICAgICAgIGxpbmVhZ2UucHVzaChwYXJlbnQpO1xyXG5cclxuICAgICAgICBpZiAocm9vdCAhPT0gcGFyZW50KSB7XHJcbiAgICAgICAgICB3YWxrKHJvb3QsIHBhcmVudCwgbGluZWFnZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9O1xyXG4gIHZhciBhdXRoRGVmc1Byb3AgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnYXV0aG9yaXphdGlvbnMnIDogJ3NlY3VyaXR5RGVmaW5pdGlvbnMnO1xyXG4gIHZhciBtb2RlbERlZnNQcm9wID0gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gJ21vZGVscycgOiAnZGVmaW5pdGlvbnMnO1xyXG5cclxuICAvLyBQcm9jZXNzIGF1dGhvcml6YXRpb24gZGVmaW5pdGlvbnNcclxuICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZFthdXRoRGVmc1Byb3BdLCBmdW5jdGlvbiAoYXV0aG9yaXphdGlvbiwgbmFtZSkge1xyXG4gICAgdmFyIHNlY3VyaXR5RGVmUGF0aCA9IFthdXRoRGVmc1Byb3AsIG5hbWVdO1xyXG5cclxuICAgIC8vIFN3YWdnZXIgMS4yIG9ubHkgaGFzIGF1dGhvcml6YXRpb24gZGVmaW5pdGlvbnMgaW4gdGhlIFJlc291cmNlIExpc3RpbmdcclxuICAgIGlmIChzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgJiYgIWF1dGhvcml6YXRpb24udHlwZSkge1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ3JlYXRlIHRoZSBhdXRob3JpemF0aW9uIGRlZmluaXRpb24gbWV0YWRhdGFcclxuICAgIGdldERlZmluaXRpb25NZXRhZGF0YShzZWN1cml0eURlZlBhdGgpO1xyXG5cclxuICAgIF8ucmVkdWNlKGF1dGhvcml6YXRpb24uc2NvcGVzLCBmdW5jdGlvbiAoc2VlblNjb3Blcywgc2NvcGUsIGluZGV4T3JOYW1lKSB7XHJcbiAgICAgIHZhciBzY29wZU5hbWUgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBzY29wZS5zY29wZSA6IGluZGV4T3JOYW1lO1xyXG4gICAgICB2YXIgc2NvcGVEZWZQYXRoID0gc2VjdXJpdHlEZWZQYXRoLmNvbmNhdChbJ3Njb3BlcycsIGluZGV4T3JOYW1lLnRvU3RyaW5nKCldKTtcclxuICAgICAgdmFyIHNjb3BlTWV0YWRhdGEgPSBnZXREZWZpbml0aW9uTWV0YWRhdGEoc2VjdXJpdHlEZWZQYXRoLmNvbmNhdChbJ3Njb3BlcycsIHNjb3BlTmFtZV0pKTtcclxuXHJcbiAgICAgIHNjb3BlTWV0YWRhdGEuc2NvcGVQYXRoID0gc2NvcGVEZWZQYXRoO1xyXG5cclxuICAgICAgLy8gSWRlbnRpZnkgZHVwbGljYXRlIGF1dGhvcml6YXRpb24gc2NvcGUgZGVmaW5lZCBpbiB0aGUgUmVzb3VyY2UgTGlzdGluZ1xyXG4gICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblNjb3Blcywgc2NvcGVOYW1lLCAnQVVUSE9SSVpBVElPTl9TQ09QRV9ERUZJTklUSU9OJywgJ0F1dGhvcml6YXRpb24gc2NvcGUgZGVmaW5pdGlvbicsXHJcbiAgICAgICAgICAgICAgICAgICAgICBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBzY29wZURlZlBhdGguY29uY2F0KCdzY29wZScpIDogc2NvcGVEZWZQYXRoLCByZXN1bHRzLndhcm5pbmdzKTtcclxuXHJcbiAgICAgIHNlZW5TY29wZXMucHVzaChzY29wZU5hbWUpO1xyXG5cclxuICAgICAgcmV0dXJuIHNlZW5TY29wZXM7XHJcbiAgICB9LCBbXSk7XHJcbiAgfSk7XHJcblxyXG4gIC8vIFByb2Nlc3MgbW9kZWwgZGVmaW5pdGlvbnNcclxuICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZFttb2RlbERlZnNQcm9wXSwgZnVuY3Rpb24gKG1vZGVsLCBtb2RlbElkKSB7XHJcbiAgICB2YXIgbW9kZWxEZWZQYXRoID0gW21vZGVsRGVmc1Byb3AsIG1vZGVsSWRdO1xyXG4gICAgdmFyIG1vZGVsTWV0YWRhdGEgPSBnZXREZWZpbml0aW9uTWV0YWRhdGEobW9kZWxEZWZQYXRoKTtcclxuXHJcbiAgICAvLyBJZGVudGlmeSBtb2RlbCBpZCBtaXNtYXRjaCAoSWQgaW4gbW9kZWxzIG9iamVjdCBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIG1vZGVsJ3MgaWQgaW4gdGhlIG1vZGVscyBvYmplY3QpXHJcbiAgICBpZiAoc3dhZ2dlclZlcnNpb24gPT09ICcxLjInICYmIG1vZGVsSWQgIT09IG1vZGVsLmlkKSB7XHJcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNT0RFTF9JRF9NSVNNQVRDSCcsICdNb2RlbCBpZCBkb2VzIG5vdCBtYXRjaCBpZCBpbiBtb2RlbHMgb2JqZWN0OiAnICsgbW9kZWwuaWQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsRGVmUGF0aC5jb25jYXQoJ2lkJyksIHJlc3VsdHMuZXJyb3JzKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEbyBub3QgcmVwcm9jZXNzIHBhcmVudHMvcmVmZXJlbmNlcyBpZiBhbHJlYWR5IHByb2Nlc3NlZFxyXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxNZXRhZGF0YS5saW5lYWdlKSkge1xyXG4gICAgICAvLyBIYW5kbGUgaW5oZXJpdGFuY2UgcmVmZXJlbmNlc1xyXG4gICAgICBzd2l0Y2ggKHN3YWdnZXJWZXJzaW9uKSB7XHJcbiAgICAgIGNhc2UgJzEuMic6XHJcbiAgICAgICAgXy5lYWNoKG1vZGVsLnN1YlR5cGVzLCBmdW5jdGlvbiAoc3ViVHlwZSwgaW5kZXgpIHtcclxuICAgICAgICAgIHZhciBzdWJQYXRoID0gWydtb2RlbHMnLCBzdWJUeXBlXTtcclxuICAgICAgICAgIHZhciBzdWJQdHIgPSBKc29uUmVmcy5wYXRoVG9QdHIoc3ViUGF0aCk7XHJcbiAgICAgICAgICB2YXIgc3ViTWV0YWRhdGEgPSBkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW3N1YlB0cl07XHJcbiAgICAgICAgICB2YXIgcmVmUGF0aCA9IG1vZGVsRGVmUGF0aC5jb25jYXQoWydzdWJUeXBlcycsIGluZGV4LnRvU3RyaW5nKCldKTtcclxuXHJcbiAgICAgICAgICAvLyBJZiB0aGUgbWV0YWRhdGEgZG9lcyBub3QgeWV0IGV4aXN0LCBjcmVhdGUgaXRcclxuICAgICAgICAgIGlmICghc3ViTWV0YWRhdGEgJiYgZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZFttb2RlbERlZnNQcm9wXVtzdWJUeXBlXSkge1xyXG4gICAgICAgICAgICBzdWJNZXRhZGF0YSA9IGdldERlZmluaXRpb25NZXRhZGF0YShzdWJQYXRoKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBJZiB0aGUgcmVmZXJlbmNlIGlzIHZhbGlkLCBhZGQgdGhlIHBhcmVudFxyXG4gICAgICAgICAgaWYgKGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBzdWJQYXRoLCByZWZQYXRoLCByZXN1bHRzKSkge1xyXG4gICAgICAgICAgICBzdWJNZXRhZGF0YS5wYXJlbnRzLnB1c2goSnNvblJlZnMucGF0aFRvUHRyKG1vZGVsRGVmUGF0aCkpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgXy5lYWNoKGRvY3VtZW50TWV0YWRhdGEub3JpZ2luYWxbbW9kZWxEZWZzUHJvcF1bbW9kZWxJZF0uYWxsT2YsIGZ1bmN0aW9uIChzY2hlbWEsIGluZGV4KSB7XHJcbiAgICAgICAgICB2YXIgaXNJbmxpbmUgPSBmYWxzZTtcclxuICAgICAgICAgIHZhciBwYXJlbnRQYXRoO1xyXG5cclxuICAgICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKHNjaGVtYS4kcmVmKSB8fCBpc1JlbW90ZVB0cihKc29uUmVmcy5nZXRSZWZEZXRhaWxzKHNjaGVtYSkpKSB7XHJcbiAgICAgICAgICAgIGlzSW5saW5lID0gdHJ1ZTtcclxuICAgICAgICAgICAgcGFyZW50UGF0aCA9IG1vZGVsRGVmUGF0aC5jb25jYXQoWydhbGxPZicsIGluZGV4LnRvU3RyaW5nKCldKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHBhcmVudFBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVB0cihzY2hlbWEuJHJlZik7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gSWYgdGhlIHBhcmVudCBtb2RlbCBkb2VzIG5vdCBleGlzdCwgZG8gbm90IGNyZWF0ZSBpdHMgbWV0YWRhdGFcclxuICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZCh0cmF2ZXJzZShkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkKS5nZXQocGFyZW50UGF0aCkpKSB7XHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBtZXRhZGF0YSBmb3IgcGFyZW50XHJcbiAgICAgICAgICAgIGdldERlZmluaXRpb25NZXRhZGF0YShwYXJlbnRQYXRoLCBpc0lubGluZSk7XHJcblxyXG4gICAgICAgICAgICBtb2RlbE1ldGFkYXRhLnBhcmVudHMucHVzaChKc29uUmVmcy5wYXRoVG9QdHIocGFyZW50UGF0aCkpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICBzd2l0Y2ggKHN3YWdnZXJWZXJzaW9uKSB7XHJcbiAgY2FzZSAnMi4wJzpcclxuICAgIC8vIFByb2Nlc3MgcGFyYW1ldGVyIGRlZmluaXRpb25zXHJcbiAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAocGFyYW1ldGVyLCBuYW1lKSB7XHJcbiAgICAgIHZhciBwYXRoID0gWydwYXJhbWV0ZXJzJywgbmFtZV07XHJcblxyXG4gICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGF0aCk7XHJcblxyXG4gICAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEsIHBhcmFtZXRlciwgcGF0aCwgcmVzdWx0cyk7XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBQcm9jZXNzIHJlc3BvbnNlIGRlZmluaXRpb25zXHJcbiAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5yZXNwb25zZXMsIGZ1bmN0aW9uIChyZXNwb25zZSwgbmFtZSkge1xyXG4gICAgICB2YXIgcGF0aCA9IFsncmVzcG9uc2VzJywgbmFtZV07XHJcblxyXG4gICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGF0aCk7XHJcblxyXG4gICAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEsIHJlc3BvbnNlLCBwYXRoLCByZXN1bHRzKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGJyZWFrO1xyXG4gIH1cclxuXHJcbiAgLy8gVmFsaWRhdGUgZGVmaW5pdGlvbi9tb2RlbHMgKEluaGVyaXRhbmNlLCBwcm9wZXJ0eSBkZWZpbml0aW9ucywgLi4uKVxyXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zLCBmdW5jdGlvbiAobWV0YWRhdGEsIGlkKSB7XHJcbiAgICB2YXIgZGVmUGF0aCA9IEpzb25SZWZzLnBhdGhGcm9tUHRyKGlkKTtcclxuICAgIHZhciBkZWZpbml0aW9uID0gdHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5vcmlnaW5hbCkuZ2V0KGRlZlBhdGgpO1xyXG4gICAgdmFyIGRlZlByb3AgPSBkZWZQYXRoWzBdO1xyXG4gICAgdmFyIGNvZGUgPSBkZWZQcm9wLnN1YnN0cmluZygwLCBkZWZQcm9wLmxlbmd0aCAtIDEpLnRvVXBwZXJDYXNlKCk7XHJcbiAgICB2YXIgbXNnUHJlZml4ID0gY29kZS5jaGFyQXQoMCkgKyBjb2RlLnN1YnN0cmluZygxKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgdmFyIGRQcm9wZXJ0aWVzO1xyXG4gICAgdmFyIGlQcm9wZXJ0aWVzO1xyXG4gICAgdmFyIGxpbmVhZ2U7XHJcblxyXG4gICAgLy8gVGhlIG9ubHkgY2hlY2tzIHdlIHBlcmZvcm0gYmVsb3cgYXJlIGluaGVyaXRhbmNlIGNoZWNrcyBzbyBza2lwIGFsbCBub24tbW9kZWwgZGVmaW5pdGlvbnNcclxuICAgIGlmIChbJ2RlZmluaXRpb25zJywgJ21vZGVscyddLmluZGV4T2YoZGVmUHJvcCkgPT09IC0xKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBkUHJvcGVydGllcyA9IFtdO1xyXG4gICAgaVByb3BlcnRpZXMgPSBbXTtcclxuICAgIGxpbmVhZ2UgPSBtZXRhZGF0YS5saW5lYWdlO1xyXG5cclxuICAgIC8vIERvIG5vdCByZXByb2Nlc3MgbGluZWFnZSBpZiBhbHJlYWR5IHByb2Nlc3NlZFxyXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobGluZWFnZSkpIHtcclxuICAgICAgbGluZWFnZSA9IFtdO1xyXG5cclxuICAgICAgd2FsayhpZCwgdW5kZWZpbmVkLCBsaW5lYWdlKTtcclxuXHJcbiAgICAgIC8vIFJvb3QgPiBuZXh0ID4gLi4uXHJcbiAgICAgIGxpbmVhZ2UucmV2ZXJzZSgpO1xyXG5cclxuICAgICAgbWV0YWRhdGEubGluZWFnZSA9IF8uY2xvbmVEZWVwKGxpbmVhZ2UpO1xyXG5cclxuICAgICAgbWV0YWRhdGEuY3ljbGljYWwgPSBsaW5lYWdlLmxlbmd0aCA+IDEgJiYgbGluZWFnZVswXSA9PT0gaWQ7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU3dhZ2dlciAxLjIgZG9lcyBub3QgYWxsb3cgbXVsdGlwbGUgaW5oZXJpdGFuY2Ugd2hpbGUgU3dhZ2dlciAyLjArIGRvZXNcclxuICAgIGlmIChtZXRhZGF0YS5wYXJlbnRzLmxlbmd0aCA+IDEgJiYgc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XHJcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNVUxUSVBMRV8nICsgY29kZSArICdfSU5IRVJJVEFOQ0UnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnQ2hpbGQgJyArIGNvZGUudG9Mb3dlckNhc2UoKSArICcgaXMgc3ViIHR5cGUgb2YgbXVsdGlwbGUgbW9kZWxzOiAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgXy5tYXAobWV0YWRhdGEucGFyZW50cywgZnVuY3Rpb24gKHBhcmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBnZXREaXNwbGF5SWQocGFyZW50KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuam9pbignICYmICcpLCBkZWZQYXRoLCByZXN1bHRzLmVycm9ycyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKG1ldGFkYXRhLmN5Y2xpY2FsKSB7XHJcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdDWUNMSUNBTF8nICsgY29kZSArICdfSU5IRVJJVEFOQ0UnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBtc2dQcmVmaXggKyAnIGhhcyBhIGNpcmN1bGFyIGluaGVyaXRhbmNlOiAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLm1hcChsaW5lYWdlLCBmdW5jdGlvbiAoZGVwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0RGlzcGxheUlkKGRlcCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuam9pbignIC0+ICcpICsgJyAtPiAnICsgZ2V0RGlzcGxheUlkKGlkKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZlBhdGguY29uY2F0KHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdzdWJUeXBlcycgOiAnYWxsT2YnKSwgcmVzdWx0cy5lcnJvcnMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlbW92ZSBzZWxmIHJlZmVyZW5jZSBmcm9tIHRoZSBlbmQgb2YgdGhlIGxpbmVhZ2UgKEZyb250IHRvbyBpZiBjeWNsaWNhbClcclxuICAgIF8uZWFjaChsaW5lYWdlLnNsaWNlKG1ldGFkYXRhLmN5Y2xpY2FsID8gMSA6IDApLCBmdW5jdGlvbiAoaWQpIHtcclxuICAgICAgdmFyIHBNb2RlbCA9IHRyYXZlcnNlKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpLmdldChKc29uUmVmcy5wYXRoRnJvbVB0cihpZCkpO1xyXG5cclxuICAgICAgXy5lYWNoKE9iamVjdC5rZXlzKHBNb2RlbC5wcm9wZXJ0aWVzIHx8IHt9KSwgZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgICBpZiAoaVByb3BlcnRpZXMuaW5kZXhPZihuYW1lKSA9PT0gLTEpIHtcclxuICAgICAgICAgIGlQcm9wZXJ0aWVzLnB1c2gobmFtZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFZhbGlkYXRlIHNpbXBsZSBkZWZpbml0aW9uc1xyXG4gICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLCBkZWZpbml0aW9uLCBkZWZQYXRoLCByZXN1bHRzKTtcclxuXHJcbiAgICAvLyBJZGVudGlmeSByZWRlY2xhcmVkIHByb3BlcnRpZXNcclxuICAgIF8uZWFjaChkZWZpbml0aW9uLnByb3BlcnRpZXMsIGZ1bmN0aW9uIChwcm9wZXJ0eSwgbmFtZSkge1xyXG4gICAgICB2YXIgcFBhdGggPSBkZWZQYXRoLmNvbmNhdChbJ3Byb3BlcnRpZXMnLCBuYW1lXSk7XHJcblxyXG4gICAgICAvLyBEbyBub3QgcHJvY2VzcyB1bnJlc29sdmVkIHByb3BlcnRpZXNcclxuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHByb3BlcnR5KSkge1xyXG4gICAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcHJvcGVydHksIHBQYXRoLCByZXN1bHRzKTtcclxuXHJcbiAgICAgICAgaWYgKGlQcm9wZXJ0aWVzLmluZGV4T2YobmFtZSkgPiAtMSkge1xyXG4gICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0NISUxEXycgKyBjb2RlICsgJ19SRURFQ0xBUkVTX1BST1BFUlRZJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdDaGlsZCAnICsgY29kZS50b0xvd2VyQ2FzZSgpICsgJyBkZWNsYXJlcyBwcm9wZXJ0eSBhbHJlYWR5IGRlY2xhcmVkIGJ5IGFuY2VzdG9yOiAnICtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aCwgcmVzdWx0cy5lcnJvcnMpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBkUHJvcGVydGllcy5wdXNoKG5hbWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gSWRlbnRpZnkgbWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0aWVzXHJcbiAgICBfLmVhY2goZGVmaW5pdGlvbi5yZXF1aXJlZCB8fCBbXSwgZnVuY3Rpb24gKG5hbWUsIGluZGV4KSB7XHJcbiAgICAgIHZhciB0eXBlID0gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gJ01vZGVsJyA6ICdEZWZpbml0aW9uJztcclxuXHJcbiAgICAgIGlmIChpUHJvcGVydGllcy5pbmRleE9mKG5hbWUpID09PSAtMSAmJiBkUHJvcGVydGllcy5pbmRleE9mKG5hbWUpID09PSAtMSkge1xyXG4gICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNSVNTSU5HX1JFUVVJUkVEXycgKyB0eXBlLnRvVXBwZXJDYXNlKCkgKyAnX1BST1BFUlRZJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlICsgJyByZXF1aXJlcyBwcm9wZXJ0eSBidXQgaXQgaXMgbm90IGRlZmluZWQ6ICcgKyBuYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZlBhdGguY29uY2F0KFsncmVxdWlyZWQnLCBpbmRleC50b1N0cmluZygpXSksIHJlc3VsdHMuZXJyb3JzKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfSk7XHJcblxyXG4gIGlmIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xyXG4gICAganNvblJlZnNPcHRpb25zLnJlZlByZVByb2Nlc3NvciA9IHN3YWdnZXIxUmVmUHJlUHJvY2Vzb3I7XHJcbiAgfVxyXG5cclxuICAvLyBQcm9jZXNzIGxvY2FsIHJlZmVyZW5jZXNcclxuICBfLmVhY2goSnNvblJlZnMuZmluZFJlZnMoZG9jdW1lbnRNZXRhZGF0YS5vcmlnaW5hbCwganNvblJlZnNPcHRpb25zKSwgZnVuY3Rpb24gKHJlZkRldGFpbHMsIHJlZlB0cikge1xyXG4gICAgYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsIHJlZkRldGFpbHMudXJpLCByZWZQdHIsIHJlc3VsdHMpO1xyXG4gIH0pO1xyXG5cclxuICAvLyBQcm9jZXNzIGludmFsaWQgcmVmZXJlbmNlc1xyXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLnJlZmVyZW5jZXNNZXRhZGF0YSwgZnVuY3Rpb24gKHJlZkRldGFpbHMsIHJlZlB0cikge1xyXG4gICAgaWYgKGlzUmVtb3RlUHRyKHJlZkRldGFpbHMpICYmIHJlZkRldGFpbHMubWlzc2luZyA9PT0gdHJ1ZSkge1xyXG4gICAgICByZXN1bHRzLmVycm9ycy5wdXNoKHtcclxuICAgICAgICBjb2RlOiAnVU5SRVNPTFZBQkxFX1JFRkVSRU5DRScsXHJcbiAgICAgICAgbWVzc2FnZTogJ1JlZmVyZW5jZSBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBzYW5pdGl6ZVJlZihkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uLCByZWZEZXRhaWxzLnVyaSksXHJcbiAgICAgICAgcGF0aDogSnNvblJlZnMucGF0aEZyb21QdHIocmVmUHRyKS5jb25jYXQoJyRyZWYnKVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9KTtcclxufTtcclxuXHJcbnZhciB2YWxpZGF0ZUV4aXN0ID0gZnVuY3Rpb24gKGRhdGEsIHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XHJcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGRhdGEpICYmIGRhdGEuaW5kZXhPZih2YWwpID09PSAtMSkge1xyXG4gICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyB2YWwsIHBhdGgsIGRlc3QpO1xyXG4gIH1cclxufTtcclxuXHJcbnZhciBwcm9jZXNzQXV0aFJlZnMgPSBmdW5jdGlvbiAoZG9jdW1lbnRNZXRhZGF0YSwgYXV0aFJlZnMsIHBhdGgsIHJlc3VsdHMpIHtcclxuICB2YXIgY29kZSA9IGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gJ0FVVEhPUklaQVRJT04nIDogJ1NFQ1VSSVRZX0RFRklOSVRJT04nO1xyXG4gIHZhciBtc2dQcmVmaXggPSBjb2RlID09PSAnQVVUSE9SSVpBVElPTicgPyAnQXV0aG9yaXphdGlvbicgOiAnU2VjdXJpdHkgZGVmaW5pdGlvbic7XHJcblxyXG4gIGlmIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xyXG4gICAgXy5yZWR1Y2UoYXV0aFJlZnMsIGZ1bmN0aW9uIChzZWVuTmFtZXMsIHNjb3BlcywgbmFtZSkge1xyXG4gICAgICB2YXIgYXV0aFB0ciA9IFsnYXV0aG9yaXphdGlvbnMnLCBuYW1lXTtcclxuICAgICAgdmFyIGFQYXRoID0gcGF0aC5jb25jYXQoW25hbWVdKTtcclxuXHJcbiAgICAgIC8vIEFkZCByZWZlcmVuY2Ugb3IgcmVjb3JkIHVucmVzb2x2ZWQgYXV0aG9yaXphdGlvblxyXG4gICAgICBpZiAoYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsIGF1dGhQdHIsIGFQYXRoLCByZXN1bHRzKSkge1xyXG4gICAgICAgIF8ucmVkdWNlKHNjb3BlcywgZnVuY3Rpb24gKHNlZW5TY29wZXMsIHNjb3BlLCBpbmRleCkge1xyXG4gICAgICAgICAgdmFyIHNQYXRoID0gYVBhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCksICdzY29wZScpO1xyXG4gICAgICAgICAgdmFyIHNQdHIgPSBhdXRoUHRyLmNvbmNhdChbJ3Njb3BlcycsIHNjb3BlLnNjb3BlXSk7XHJcblxyXG4gICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5TY29wZXMsIHNjb3BlLnNjb3BlLCBjb2RlICsgJ19TQ09QRV9SRUZFUkVOQ0UnLCBtc2dQcmVmaXggKyAnIHNjb3BlIHJlZmVyZW5jZScsIHNQYXRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMud2FybmluZ3MpO1xyXG5cclxuICAgICAgICAgIC8vIEFkZCByZWZlcmVuY2Ugb3IgcmVjb3JkIHVucmVzb2x2ZWQgYXV0aG9yaXphdGlvbiBzY29wZVxyXG4gICAgICAgICAgYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsIHNQdHIsIHNQYXRoLCByZXN1bHRzKTtcclxuXHJcbiAgICAgICAgICByZXR1cm4gc2VlblNjb3Blcy5jb25jYXQoc2NvcGUuc2NvcGUpO1xyXG4gICAgICAgIH0sIFtdKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHNlZW5OYW1lcy5jb25jYXQobmFtZSk7XHJcbiAgICB9LCBbXSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIF8ucmVkdWNlKGF1dGhSZWZzLCBmdW5jdGlvbiAoc2Vlbk5hbWVzLCBzY29wZXMsIGluZGV4KSB7XHJcbiAgICAgIF8uZWFjaChzY29wZXMsIGZ1bmN0aW9uIChzY29wZXMsIG5hbWUpIHtcclxuICAgICAgICB2YXIgYXV0aFB0ciA9IFsnc2VjdXJpdHlEZWZpbml0aW9ucycsIG5hbWVdO1xyXG4gICAgICAgIHZhciBhdXRoUmVmUGF0aCA9IHBhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCksIG5hbWUpO1xyXG5cclxuICAgICAgICAvLyBFbnN1cmUgdGhlIHNlY3VyaXR5IGRlZmluaXRpb24gaXNuJ3QgcmVmZXJlbmNlZCBtb3JlIHRoYW4gb25jZSAoU3dhZ2dlciAyLjArKVxyXG4gICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuTmFtZXMsIG5hbWUsIGNvZGUgKyAnX1JFRkVSRU5DRScsIG1zZ1ByZWZpeCArICcgcmVmZXJlbmNlJywgYXV0aFJlZlBhdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMud2FybmluZ3MpO1xyXG5cclxuICAgICAgICBzZWVuTmFtZXMucHVzaChuYW1lKTtcclxuXHJcbiAgICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uXHJcbiAgICAgICAgaWYgKGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBhdXRoUHRyLCBhdXRoUmVmUGF0aCwgcmVzdWx0cykpIHtcclxuICAgICAgICAgIF8uZWFjaChzY29wZXMsIGZ1bmN0aW9uIChzY29wZSwgaW5kZXgpIHtcclxuICAgICAgICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uIHNjb3BlXHJcbiAgICAgICAgICAgIHZhciBzUHRyID0gYXV0aFB0ci5jb25jYXQoWydzY29wZXMnLCBzY29wZV0pO1xyXG4gICAgICAgICAgICBhZGRSZWZlcmVuY2UoZG9jdW1lbnRNZXRhZGF0YSwgc1B0ciwgYXV0aFJlZlBhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCkpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cyk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgcmV0dXJuIHNlZW5OYW1lcztcclxuICAgIH0sIFtdKTtcclxuICB9XHJcbn07XHJcblxyXG52YXIgcmVzb2x2ZVJlZnMgPSBmdW5jdGlvbiAoYXBpRE9yU08sIGNhbGxiYWNrKSB7XHJcbiAgdmFyIGNhY2hlRW50cnkgPSBnZXREb2N1bWVudENhY2hlKGFwaURPclNPKTtcclxuICB2YXIgc3dhZ2dlclZlcnNpb24gPSBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGFwaURPclNPKTtcclxuICB2YXIganNvblJlZnNPcHRpb25zID0ge1xyXG4gICAgaW5jbHVkZUludmFsaWQ6IHRydWUsXHJcbiAgICBsb2FkZXJPcHRpb25zOiB7XHJcbiAgICAgIHByb2Nlc3NDb250ZW50OiBmdW5jdGlvbiAocmVzLCBjYWxsYmFjaykge1xyXG4gICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgWUFNTC5zYWZlTG9hZChyZXMudGV4dCkpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgaWYgKCFjYWNoZUVudHJ5LnJlc29sdmVkKSB7XHJcbiAgICAvLyBGb3IgU3dhZ2dlciAxLjIsIHdlIGhhdmUgdG8gY3JlYXRlIHJlYWwgSlNPTiBSZWZlcmVuY2VzXHJcbiAgICBpZiAoc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XHJcbiAgICAgIGpzb25SZWZzT3B0aW9ucy5yZWZQcmVQcm9jZXNzb3IgPSBzd2FnZ2VyMVJlZlByZVByb2Nlc29yO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlc29sdmUgcmVmZXJlbmNlc1xyXG4gICAgSnNvblJlZnMucmVzb2x2ZVJlZnMoYXBpRE9yU08sIGpzb25SZWZzT3B0aW9ucylcclxuICAgICAgLnRoZW4oZnVuY3Rpb24gKHJlc3VsdHMpIHtcclxuICAgICAgICByZW1vdmVDaXJjdWxhcnMocmVzdWx0cy5yZXNvbHZlZCk7XHJcblxyXG4gICAgICAgIC8vIEZpeCBjaXJjdWxhciByZWZlcmVuY2VzXHJcbiAgICAgICAgXy5lYWNoKHJlc3VsdHMucmVmcywgZnVuY3Rpb24gKHJlZkRldGFpbHMsIHJlZlB0cikge1xyXG4gICAgICAgICAgaWYgKHJlZkRldGFpbHMuY2lyY3VsYXIpIHtcclxuICAgICAgICAgICAgXy5zZXQocmVzdWx0cy5yZXNvbHZlZCwgSnNvblJlZnMucGF0aEZyb21QdHIocmVmUHRyKSwge30pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjYWNoZUVudHJ5LnJlZmVyZW5jZXNNZXRhZGF0YSA9IHJlc3VsdHMucmVmcztcclxuICAgICAgICBjYWNoZUVudHJ5LnJlc29sdmVkID0gcmVzdWx0cy5yZXNvbHZlZDtcclxuICAgICAgICBjYWNoZUVudHJ5LnJlc29sdmVkSWQgPSBTcGFya01ENS5oYXNoKEpTT04uc3RyaW5naWZ5KHJlc3VsdHMucmVzb2x2ZWQpKTtcclxuXHJcbiAgICAgICAgY2FsbGJhY2soKTtcclxuICAgICAgfSlcclxuICAgICAgLmNhdGNoKGNhbGxiYWNrKTtcclxuICB9IGVsc2Uge1xyXG4gICAgY2FsbGJhY2soKTtcclxuICB9XHJcbn07XHJcblxyXG52YXIgdmFsaWRhdGVBZ2FpbnN0U2NoZW1hID0gZnVuY3Rpb24gKHNwZWMsIHNjaGVtYU9yTmFtZSwgZGF0YSwgY2FsbGJhY2spIHtcclxuICB2YXIgdmFsaWRhdG9yID0gXy5pc1N0cmluZyhzY2hlbWFPck5hbWUpID8gc3BlYy52YWxpZGF0b3JzW3NjaGVtYU9yTmFtZV0gOiBoZWxwZXJzLmNyZWF0ZUpzb25WYWxpZGF0b3IoKTtcclxuXHJcbiAgaGVscGVycy5yZWdpc3RlckN1c3RvbUZvcm1hdHMoZGF0YSk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICB2YWxpZGF0b3JzLnZhbGlkYXRlQWdhaW5zdFNjaGVtYShzY2hlbWFPck5hbWUsIGRhdGEsIHZhbGlkYXRvcik7XHJcbiAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICBpZiAoZXJyLmZhaWxlZFZhbGlkYXRpb24pIHtcclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKHVuZGVmaW5lZCwgZXJyLnJlc3VsdHMpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXNvbHZlUmVmcyhkYXRhLCBmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcclxuICB9KTtcclxufTtcclxuXHJcbnZhciB2YWxpZGF0ZURlZmluaXRpb25zID0gZnVuY3Rpb24gKGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpIHtcclxuICAvLyBWYWxpZGF0ZSB1bnVzZWQgZGVmaW5pdGlvbnNcclxuICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9ucywgZnVuY3Rpb24gKG1ldGFkYXRhLCBpZCkge1xyXG4gICAgdmFyIGRlZlBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVB0cihpZCk7XHJcbiAgICB2YXIgZGVmVHlwZSA9IGRlZlBhdGhbMF0uc3Vic3RyaW5nKDAsIGRlZlBhdGhbMF0ubGVuZ3RoIC0gMSk7XHJcbiAgICB2YXIgZGlzcGxheUlkID0gZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBkZWZQYXRoW2RlZlBhdGgubGVuZ3RoIC0gMV0gOiBpZDtcclxuICAgIHZhciBjb2RlID0gZGVmVHlwZSA9PT0gJ3NlY3VyaXR5RGVmaW5pdGlvbicgPyAnU0VDVVJJVFlfREVGSU5JVElPTicgOiBkZWZUeXBlLnRvVXBwZXJDYXNlKCk7XHJcbiAgICB2YXIgbXNnUHJlZml4ID0gZGVmVHlwZSA9PT0gJ3NlY3VyaXR5RGVmaW5pdGlvbicgP1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICdTZWN1cml0eSBkZWZpbml0aW9uJyA6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmVHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGRlZlR5cGUuc3Vic3RyaW5nKDEpO1xyXG5cclxuICAgIGlmIChtZXRhZGF0YS5yZWZlcmVuY2VzLmxlbmd0aCA9PT0gMCAmJiAhbWV0YWRhdGEuaW5saW5lKSB7XHJcbiAgICAgIC8vIFN3YWdnZXIgMS4yIGF1dGhvcml6YXRpb24gc2NvcGVcclxuICAgICAgaWYgKG1ldGFkYXRhLnNjb3BlUGF0aCkge1xyXG4gICAgICAgIGNvZGUgKz0gJ19TQ09QRSc7XHJcbiAgICAgICAgbXNnUHJlZml4ICs9ICcgc2NvcGUnO1xyXG4gICAgICAgIGRlZlBhdGggPSBtZXRhZGF0YS5zY29wZVBhdGg7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKGRpc3BsYXlJZCwgY29kZSwgbXNnUHJlZml4LCBkZWZQYXRoLCByZXN1bHRzLndhcm5pbmdzKTtcclxuICAgIH1cclxuICB9KTtcclxufTtcclxuXHJcbnZhciB2YWxpZGF0ZVBhcmFtZXRlcnMgPSBmdW5jdGlvbiAoc3BlYywgZG9jdW1lbnRNZXRhZGF0YSwgblBhdGgsIHBhcmFtZXRlcnMsIHBhdGgsIHJlc3VsdHMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2tpcE1pc3NpbmcpIHtcclxuICB2YXIgY3JlYXRlUGFyYW1ldGVyQ29tYm9FcnJvciA9IGZ1bmN0aW9uIChwYXRoKSB7XHJcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnSU5WQUxJRF9QQVJBTUVURVJfQ09NQklOQVRJT04nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ0FQSSBjYW5ub3QgaGF2ZSBhIGEgYm9keSBwYXJhbWV0ZXIgYW5kIGEgJyArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIChzcGVjLnZlcnNpb24gPT09ICcxLjInID8gJ2Zvcm0nIDogJ2Zvcm1EYXRhJykgKyAnIHBhcmFtZXRlcicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoLCByZXN1bHRzLmVycm9ycyk7XHJcbiAgfTtcclxuICB2YXIgcGF0aFBhcmFtcyA9IFtdO1xyXG4gIHZhciBzZWVuQm9keVBhcmFtID0gZmFsc2U7XHJcbiAgdmFyIHNlZW5Gb3JtUGFyYW0gPSBmYWxzZTtcclxuXHJcbiAgXy5yZWR1Y2UocGFyYW1ldGVycywgZnVuY3Rpb24gKHNlZW5QYXJhbWV0ZXJzLCBwYXJhbWV0ZXIsIGluZGV4KSB7XHJcbiAgICB2YXIgcFBhdGggPSBwYXRoLmNvbmNhdChbJ3BhcmFtZXRlcnMnLCBpbmRleC50b1N0cmluZygpXSk7XHJcblxyXG4gICAgLy8gVW5yZXNvbHZlZCBwYXJhbWV0ZXJcclxuICAgIGlmIChfLmlzVW5kZWZpbmVkKHBhcmFtZXRlcikpIHtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIElkZW50aWZ5IGR1cGxpY2F0ZSBwYXJhbWV0ZXIgbmFtZXNcclxuICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLm5hbWUsICdQQVJBTUVURVInLCAnUGFyYW1ldGVyJywgcFBhdGguY29uY2F0KCduYW1lJyksXHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xyXG5cclxuICAgIC8vIEtlZXAgdHJhY2sgb2YgYm9keSBhbmQgcGF0aCBwYXJhbWV0ZXJzXHJcbiAgICBpZiAocGFyYW1ldGVyLnBhcmFtVHlwZSA9PT0gJ2JvZHknIHx8IHBhcmFtZXRlci5pbiA9PT0gJ2JvZHknKSB7XHJcbiAgICAgIGlmIChzZWVuQm9keVBhcmFtID09PSB0cnVlKSB7XHJcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV9BUElfQk9EWV9QQVJBTUVURVInLCAnQVBJIGhhcyBtb3JlIHRoYW4gb25lIGJvZHkgcGFyYW1ldGVyJywgcFBhdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xyXG4gICAgICB9IGVsc2UgaWYgKHNlZW5Gb3JtUGFyYW0gPT09IHRydWUpIHtcclxuICAgICAgICBjcmVhdGVQYXJhbWV0ZXJDb21ib0Vycm9yKHBQYXRoKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgc2VlbkJvZHlQYXJhbSA9IHRydWU7XHJcbiAgICB9IGVsc2UgaWYgKHBhcmFtZXRlci5wYXJhbVR5cGUgPT09ICdmb3JtJyB8fCBwYXJhbWV0ZXIuaW4gPT09ICdmb3JtRGF0YScpIHtcclxuICAgICAgaWYgKHNlZW5Cb2R5UGFyYW0gPT09IHRydWUpIHtcclxuICAgICAgICBjcmVhdGVQYXJhbWV0ZXJDb21ib0Vycm9yKHBQYXRoKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgc2VlbkZvcm1QYXJhbSA9IHRydWU7XHJcbiAgICB9IGVsc2UgaWYgKHBhcmFtZXRlci5wYXJhbVR5cGUgPT09ICdwYXRoJyB8fCBwYXJhbWV0ZXIuaW4gPT09ICdwYXRoJykge1xyXG4gICAgICBpZiAoblBhdGguYXJncy5pbmRleE9mKHBhcmFtZXRlci5uYW1lKSA9PT0gLTEpIHtcclxuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFX0FQSV9QQVRIX1BBUkFNRVRFUicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0FQSSBwYXRoIHBhcmFtZXRlciBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBwYXJhbWV0ZXIubmFtZSwgcFBhdGguY29uY2F0KCduYW1lJyksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBwYXRoUGFyYW1zLnB1c2gocGFyYW1ldGVyLm5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChzcGVjLnByaW1pdGl2ZXMuaW5kZXhPZihwYXJhbWV0ZXIudHlwZSkgPT09IC0xICYmIHNwZWMudmVyc2lvbiA9PT0gJzEuMicpIHtcclxuICAgICAgYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsICcjL21vZGVscy8nICsgcGFyYW1ldGVyLnR5cGUsIHBQYXRoLmNvbmNhdCgndHlwZScpLCByZXN1bHRzKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBwYXJhbWV0ZXIgY29uc3RyYWludHNcclxuICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcGFyYW1ldGVyLCBwUGF0aCwgcmVzdWx0cywgcGFyYW1ldGVyLnNraXBFcnJvcnMpO1xyXG5cclxuICAgIHJldHVybiBzZWVuUGFyYW1ldGVycy5jb25jYXQocGFyYW1ldGVyLm5hbWUpO1xyXG4gIH0sIFtdKTtcclxuXHJcbiAgLy8gVmFsaWRhdGUgbWlzc2luZyBwYXRoIHBhcmFtZXRlcnMgKGluIHBhdGggYnV0IG5vdCBpbiBvcGVyYXRpb24ucGFyYW1ldGVycylcclxuICBpZiAoXy5pc1VuZGVmaW5lZChza2lwTWlzc2luZykgfHwgc2tpcE1pc3NpbmcgPT09IGZhbHNlKSB7XHJcbiAgICBfLmVhY2goXy5kaWZmZXJlbmNlKG5QYXRoLmFyZ3MsIHBhdGhQYXJhbXMpLCBmdW5jdGlvbiAodW51c2VkKSB7XHJcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNSVNTSU5HX0FQSV9QQVRIX1BBUkFNRVRFUicsICdBUEkgcmVxdWlyZXMgcGF0aCBwYXJhbWV0ZXIgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgdW51c2VkLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/IHBhdGguc2xpY2UoMCwgMikuY29uY2F0KCdwYXRoJykgOiBwYXRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XHJcbiAgICB9KTtcclxuICB9XHJcbn07XHJcblxyXG52YXIgdmFsaWRhdGVTd2FnZ2VyMV8yID0gZnVuY3Rpb24gKHNwZWMsIHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zLCBjYWxsYmFjaykgeyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcclxuICB2YXIgYWRSZXNvdXJjZVBhdGhzID0gW107XHJcbiAgdmFyIHJsRG9jdW1lbnRNZXRhZGF0YSA9IGdldERvY3VtZW50Q2FjaGUocmVzb3VyY2VMaXN0aW5nKTtcclxuICB2YXIgcmxSZXNvdXJjZVBhdGhzID0gW107XHJcbiAgdmFyIHJlc3VsdHMgPSB7XHJcbiAgICBlcnJvcnM6IFtdLFxyXG4gICAgd2FybmluZ3M6IFtdLFxyXG4gICAgYXBpRGVjbGFyYXRpb25zOiBbXVxyXG4gIH07XHJcblxyXG4gIC8vIFByb2Nlc3MgUmVzb3VyY2UgTGlzdGluZyByZXNvdXJjZSBkZWZpbml0aW9uc1xyXG4gIHJsUmVzb3VyY2VQYXRocyA9IF8ucmVkdWNlKHJlc291cmNlTGlzdGluZy5hcGlzLCBmdW5jdGlvbiAoc2VlblBhdGhzLCBhcGksIGluZGV4KSB7XHJcbiAgICAvLyBJZGVudGlmeSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aHMgZGVmaW5lZCBpbiB0aGUgUmVzb3VyY2UgTGlzdGluZ1xyXG4gICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5QYXRocywgYXBpLnBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLCBbJ2FwaXMnLCBpbmRleC50b1N0cmluZygpLCAncGF0aCddLFxyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcclxuXHJcbiAgICBzZWVuUGF0aHMucHVzaChhcGkucGF0aCk7XHJcblxyXG4gICAgcmV0dXJuIHNlZW5QYXRocztcclxuICB9LCBbXSk7XHJcblxyXG4gIC8vIFByb2Nlc3MgUmVzb3VyY2UgTGlzdGluZyBkZWZpbml0aW9ucyAoYXV0aG9yaXphdGlvbnMpXHJcbiAgcHJvY2Vzc0RvY3VtZW50KHJsRG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XHJcblxyXG5cclxuICAvLyBQcm9jZXNzIGVhY2ggQVBJIERlY2xhcmF0aW9uXHJcbiAgYWRSZXNvdXJjZVBhdGhzID0gXy5yZWR1Y2UoYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoc2VlblJlc291cmNlUGF0aHMsIGFwaURlY2xhcmF0aW9uLCBpbmRleCkge1xyXG4gICAgdmFyIGFSZXN1bHRzID0gcmVzdWx0cy5hcGlEZWNsYXJhdGlvbnNbaW5kZXhdID0ge1xyXG4gICAgICBlcnJvcnM6IFtdLFxyXG4gICAgICB3YXJuaW5nczogW11cclxuICAgIH07XHJcbiAgICB2YXIgYWREb2N1bWVudE1ldGFkYXRhID0gZ2V0RG9jdW1lbnRDYWNoZShhcGlEZWNsYXJhdGlvbik7XHJcblxyXG4gICAgLy8gSWRlbnRpZnkgZHVwbGljYXRlIHJlc291cmNlIHBhdGhzIGRlZmluZWQgaW4gdGhlIEFQSSBEZWNsYXJhdGlvbnNcclxuICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUmVzb3VyY2VQYXRocywgYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJyxcclxuICAgICAgICAgICAgICAgICAgICBbJ3Jlc291cmNlUGF0aCddLCBhUmVzdWx0cy5lcnJvcnMpO1xyXG5cclxuICAgIGlmIChhZFJlc291cmNlUGF0aHMuaW5kZXhPZihhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgpID09PSAtMSkge1xyXG4gICAgICAvLyBJZGVudGlmeSB1bnVzZWQgcmVzb3VyY2UgcGF0aHMgZGVmaW5lZCBpbiB0aGUgQVBJIERlY2xhcmF0aW9uc1xyXG4gICAgICB2YWxpZGF0ZUV4aXN0KHJsUmVzb3VyY2VQYXRocywgYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJyxcclxuICAgICAgICAgICAgICAgICAgICBbJ3Jlc291cmNlUGF0aCddLCBhUmVzdWx0cy5lcnJvcnMpO1xyXG5cclxuICAgICAgc2VlblJlc291cmNlUGF0aHMucHVzaChhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFRPRE86IFByb2Nlc3MgYXV0aG9yaXphdGlvbiByZWZlcmVuY2VzXHJcbiAgICAvLyBOb3QgcG9zc2libGUgZHVlIHRvIGh0dHBzOi8vZ2l0aHViLmNvbS9zd2FnZ2VyLWFwaS9zd2FnZ2VyLXNwZWMvaXNzdWVzLzE1OVxyXG5cclxuICAgIC8vIFByb2Nlc3MgbW9kZWxzXHJcbiAgICBwcm9jZXNzRG9jdW1lbnQoYWREb2N1bWVudE1ldGFkYXRhLCBhUmVzdWx0cyk7XHJcblxyXG4gICAgLy8gUHJvY2VzcyB0aGUgQVBJIGRlZmluaXRpb25zXHJcbiAgICBfLnJlZHVjZShhcGlEZWNsYXJhdGlvbi5hcGlzLCBmdW5jdGlvbiAoc2VlblBhdGhzLCBhcGksIGluZGV4KSB7XHJcbiAgICAgIHZhciBhUGF0aCA9IFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCldO1xyXG4gICAgICB2YXIgblBhdGggPSBub3JtYWxpemVQYXRoKGFwaS5wYXRoKTtcclxuXHJcbiAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXHJcbiAgICAgIGlmIChzZWVuUGF0aHMuaW5kZXhPZihuUGF0aC5wYXRoKSA+IC0xKSB7XHJcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV9BUElfUEFUSCcsICdBUEkgcGF0aCAob3IgZXF1aXZhbGVudCkgYWxyZWFkeSBkZWZpbmVkOiAnICsgYXBpLnBhdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYVBhdGguY29uY2F0KCdwYXRoJyksIGFSZXN1bHRzLmVycm9ycyk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc2VlblBhdGhzLnB1c2goblBhdGgucGF0aCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFByb2Nlc3MgdGhlIEFQSSBvcGVyYXRpb25zXHJcbiAgICAgIF8ucmVkdWNlKGFwaS5vcGVyYXRpb25zLCBmdW5jdGlvbiAoc2Vlbk1ldGhvZHMsIG9wZXJhdGlvbiwgaW5kZXgpIHtcclxuICAgICAgICB2YXIgb1BhdGggPSBhUGF0aC5jb25jYXQoWydvcGVyYXRpb25zJywgaW5kZXgudG9TdHJpbmcoKV0pO1xyXG5cclxuICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgb3BlcmF0aW9uIG1ldGhvZFxyXG4gICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuTWV0aG9kcywgb3BlcmF0aW9uLm1ldGhvZCwgJ09QRVJBVElPTl9NRVRIT0QnLCAnT3BlcmF0aW9uIG1ldGhvZCcsIG9QYXRoLmNvbmNhdCgnbWV0aG9kJyksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFSZXN1bHRzLmVycm9ycyk7XHJcblxyXG4gICAgICAgIC8vIEtlZXAgdHJhY2sgb2YgdGhlIHNlZW4gbWV0aG9kc1xyXG4gICAgICAgIHNlZW5NZXRob2RzLnB1c2gob3BlcmF0aW9uLm1ldGhvZCk7XHJcblxyXG4gICAgICAgIC8vIEtlZXAgdHJhY2sgb2Ygb3BlcmF0aW9uIHR5cGVzXHJcbiAgICAgICAgaWYgKHNwZWMucHJpbWl0aXZlcy5pbmRleE9mKG9wZXJhdGlvbi50eXBlKSA9PT0gLTEgJiYgc3BlYy52ZXJzaW9uID09PSAnMS4yJykge1xyXG4gICAgICAgICAgYWRkUmVmZXJlbmNlKGFkRG9jdW1lbnRNZXRhZGF0YSwgJyMvbW9kZWxzLycgKyBvcGVyYXRpb24udHlwZSwgb1BhdGguY29uY2F0KCd0eXBlJyksIGFSZXN1bHRzKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFByb2Nlc3MgYXV0aG9yaXphdGlvbiByZWZlcmVuY2VzXHJcbiAgICAgICAgcHJvY2Vzc0F1dGhSZWZzKHJsRG9jdW1lbnRNZXRhZGF0YSwgb3BlcmF0aW9uLmF1dGhvcml6YXRpb25zLCBvUGF0aC5jb25jYXQoJ2F1dGhvcml6YXRpb25zJyksIGFSZXN1bHRzKTtcclxuXHJcbiAgICAgICAgLy8gVmFsaWRhdGUgdmFsaWRhdGUgaW5saW5lIGNvbnN0cmFpbnRzXHJcbiAgICAgICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhhZERvY3VtZW50TWV0YWRhdGEsIG9wZXJhdGlvbiwgb1BhdGgsIGFSZXN1bHRzKTtcclxuXHJcbiAgICAgICAgLy8gVmFsaWRhdGUgcGFyYW1ldGVyc1xyXG4gICAgICAgIHZhbGlkYXRlUGFyYW1ldGVycyhzcGVjLCBhZERvY3VtZW50TWV0YWRhdGEsIG5QYXRoLCBvcGVyYXRpb24ucGFyYW1ldGVycywgb1BhdGgsIGFSZXN1bHRzKTtcclxuXHJcbiAgICAgICAgLy8gVmFsaWRhdGUgdW5pcXVlIHJlc3BvbnNlIGNvZGVcclxuICAgICAgICBfLnJlZHVjZShvcGVyYXRpb24ucmVzcG9uc2VNZXNzYWdlcywgZnVuY3Rpb24gKHNlZW5SZXNwb25zZUNvZGVzLCByZXNwb25zZU1lc3NhZ2UsIGluZGV4KSB7XHJcbiAgICAgICAgICB2YXIgcm1QYXRoID0gb1BhdGguY29uY2F0KFsncmVzcG9uc2VNZXNzYWdlcycsIGluZGV4LnRvU3RyaW5nKCldKTtcclxuXHJcbiAgICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblJlc3BvbnNlQ29kZXMsIHJlc3BvbnNlTWVzc2FnZS5jb2RlLCAnUkVTUE9OU0VfTUVTU0FHRV9DT0RFJywgJ1Jlc3BvbnNlIG1lc3NhZ2UgY29kZScsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcm1QYXRoLmNvbmNhdChbJ2NvZGUnXSksIGFSZXN1bHRzLmVycm9ycyk7XHJcblxyXG4gICAgICAgICAgLy8gVmFsaWRhdGUgbWlzc2luZyBtb2RlbFxyXG4gICAgICAgICAgaWYgKHJlc3BvbnNlTWVzc2FnZS5yZXNwb25zZU1vZGVsKSB7XHJcbiAgICAgICAgICAgIGFkZFJlZmVyZW5jZShhZERvY3VtZW50TWV0YWRhdGEsICcjL21vZGVscy8nICsgcmVzcG9uc2VNZXNzYWdlLnJlc3BvbnNlTW9kZWwsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICBybVBhdGguY29uY2F0KCdyZXNwb25zZU1vZGVsJyksIGFSZXN1bHRzKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICByZXR1cm4gc2VlblJlc3BvbnNlQ29kZXMuY29uY2F0KHJlc3BvbnNlTWVzc2FnZS5jb2RlKTtcclxuICAgICAgICB9LCBbXSk7XHJcblxyXG4gICAgICAgIHJldHVybiBzZWVuTWV0aG9kcztcclxuICAgICAgfSwgW10pO1xyXG5cclxuICAgICAgcmV0dXJuIHNlZW5QYXRocztcclxuICAgIH0sIFtdKTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBBUEkgRGVjbGFyYXRpb24gZGVmaW5pdGlvbnNcclxuICAgIHZhbGlkYXRlRGVmaW5pdGlvbnMoYWREb2N1bWVudE1ldGFkYXRhLCBhUmVzdWx0cyk7XHJcblxyXG4gICAgcmV0dXJuIHNlZW5SZXNvdXJjZVBhdGhzO1xyXG4gIH0sIFtdKTtcclxuXHJcbiAgLy8gVmFsaWRhdGUgQVBJIERlY2xhcmF0aW9uIGRlZmluaXRpb25zXHJcbiAgdmFsaWRhdGVEZWZpbml0aW9ucyhybERvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpO1xyXG5cclxuICAvLyBJZGVudGlmeSB1bnVzZWQgcmVzb3VyY2UgcGF0aHMgZGVmaW5lZCBpbiB0aGUgUmVzb3VyY2UgTGlzdGluZ1xyXG4gIF8uZWFjaChfLmRpZmZlcmVuY2UocmxSZXNvdXJjZVBhdGhzLCBhZFJlc291cmNlUGF0aHMpLCBmdW5jdGlvbiAodW51c2VkKSB7XHJcbiAgICB2YXIgaW5kZXggPSBybFJlc291cmNlUGF0aHMuaW5kZXhPZih1bnVzZWQpO1xyXG5cclxuICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKHJlc291cmNlTGlzdGluZy5hcGlzW2luZGV4XS5wYXRoLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCksICdwYXRoJ10sIHJlc3VsdHMuZXJyb3JzKTtcclxuICB9KTtcclxuXHJcbiAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXN1bHRzKTtcclxufTtcclxuXHJcbnZhciB2YWxpZGF0ZVN3YWdnZXIyXzAgPSBmdW5jdGlvbiAoc3BlYywgc3dhZ2dlck9iamVjdCwgY2FsbGJhY2spIHsgLy8ganNoaW50IGlnbm9yZTpsaW5lXHJcbiAgdmFyIGRvY3VtZW50TWV0YWRhdGEgPSBnZXREb2N1bWVudENhY2hlKHN3YWdnZXJPYmplY3QpO1xyXG4gIHZhciByZXN1bHRzID0ge1xyXG4gICAgZXJyb3JzOiBbXSxcclxuICAgIHdhcm5pbmdzOiBbXVxyXG4gIH07XHJcblxyXG4gIC8vIFByb2Nlc3MgZGVmaW5pdGlvbnNcclxuICBwcm9jZXNzRG9jdW1lbnQoZG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XHJcblxyXG4gIC8vIFByb2Nlc3Mgc2VjdXJpdHkgcmVmZXJlbmNlc1xyXG4gIHByb2Nlc3NBdXRoUmVmcyhkb2N1bWVudE1ldGFkYXRhLCBzd2FnZ2VyT2JqZWN0LnNlY3VyaXR5LCBbJ3NlY3VyaXR5J10sIHJlc3VsdHMpO1xyXG5cclxuICBfLnJlZHVjZShkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkLnBhdGhzLCBmdW5jdGlvbiAoc2VlblBhdGhzLCBwYXRoLCBuYW1lKSB7XHJcbiAgICB2YXIgcFBhdGggPSBbJ3BhdGhzJywgbmFtZV07XHJcbiAgICB2YXIgblBhdGggPSBub3JtYWxpemVQYXRoKG5hbWUpO1xyXG5cclxuICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXHJcbiAgICBpZiAoc2VlblBhdGhzLmluZGV4T2YoblBhdGgucGF0aCkgPiAtMSkge1xyXG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFX0FQSV9QQVRIJywgJ0FQSSBwYXRoIChvciBlcXVpdmFsZW50KSBhbHJlYWR5IGRlZmluZWQ6ICcgKyBuYW1lLCBwUGF0aCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlcnNcclxuICAgIHZhbGlkYXRlUGFyYW1ldGVycyhzcGVjLCBkb2N1bWVudE1ldGFkYXRhLCBuUGF0aCwgcGF0aC5wYXJhbWV0ZXJzLCBwUGF0aCwgcmVzdWx0cywgdHJ1ZSk7XHJcblxyXG4gICAgLy8gVmFsaWRhdGUgdGhlIE9wZXJhdGlvbnNcclxuICAgIF8uZWFjaChwYXRoLCBmdW5jdGlvbiAob3BlcmF0aW9uLCBtZXRob2QpIHtcclxuICAgICAgdmFyIGNQYXJhbXMgPSBbXTtcclxuICAgICAgdmFyIG9QYXRoID0gcFBhdGguY29uY2F0KG1ldGhvZCk7XHJcbiAgICAgIHZhciBzZWVuUGFyYW1zID0gW107XHJcblxyXG4gICAgICBpZiAodmFsaWRPcHRpb25OYW1lcy5pbmRleE9mKG1ldGhvZCkgPT09IC0xKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBQcm9jZXNzIHNlY3VyaXR5IHJlZmVyZW5jZXNcclxuICAgICAgcHJvY2Vzc0F1dGhSZWZzKGRvY3VtZW50TWV0YWRhdGEsIG9wZXJhdGlvbi5zZWN1cml0eSwgb1BhdGguY29uY2F0KCdzZWN1cml0eScpLCByZXN1bHRzKTtcclxuXHJcbiAgICAgIC8vIENvbXBvc2UgcGFyYW1ldGVycyBmcm9tIHBhdGggZ2xvYmFsIHBhcmFtZXRlcnMgYW5kIG9wZXJhdGlvbiBwYXJhbWV0ZXJzXHJcbiAgICAgIF8uZWFjaChvcGVyYXRpb24ucGFyYW1ldGVycywgZnVuY3Rpb24gKHBhcmFtZXRlcikge1xyXG4gICAgICAgIC8vIENhbiBoYXBwZW4gd2l0aCBpbnZhbGlkIHJlZmVyZW5jZXNcclxuICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIpKSB7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjUGFyYW1zLnB1c2gocGFyYW1ldGVyKTtcclxuXHJcbiAgICAgICAgc2VlblBhcmFtcy5wdXNoKHBhcmFtZXRlci5uYW1lICsgJzonICsgcGFyYW1ldGVyLmluKTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBfLmVhY2gocGF0aC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAocGFyYW1ldGVyKSB7XHJcbiAgICAgICAgdmFyIGNsb25lZCA9IF8uY2xvbmVEZWVwKHBhcmFtZXRlcik7XHJcblxyXG4gICAgICAgIC8vIFRoZSBvbmx5IGVycm9ycyB0aGF0IGNhbiBvY2N1ciBoZXJlIGFyZSBzY2hlbWEgY29uc3RyYWludCB2YWxpZGF0aW9uIGVycm9ycyB3aGljaCBhcmUgYWxyZWFkeSByZXBvcnRlZCBhYm92ZVxyXG4gICAgICAgIC8vIHNvIGRvIG5vdCByZXBvcnQgdGhlbSBhZ2Fpbi5cclxuICAgICAgICBjbG9uZWQuc2tpcEVycm9ycyA9IHRydWU7XHJcblxyXG4gICAgICAgIGlmIChzZWVuUGFyYW1zLmluZGV4T2YocGFyYW1ldGVyLm5hbWUgKyAnOicgKyBwYXJhbWV0ZXIuaW4pID09PSAtMSkge1xyXG4gICAgICAgICAgY1BhcmFtcy5wdXNoKGNsb25lZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlcnNcclxuICAgICAgdmFsaWRhdGVQYXJhbWV0ZXJzKHNwZWMsIGRvY3VtZW50TWV0YWRhdGEsIG5QYXRoLCBjUGFyYW1zLCBvUGF0aCwgcmVzdWx0cyk7XHJcblxyXG4gICAgICAvLyBWYWxpZGF0ZSByZXNwb25zZXNcclxuICAgICAgXy5lYWNoKG9wZXJhdGlvbi5yZXNwb25zZXMsIGZ1bmN0aW9uIChyZXNwb25zZSwgcmVzcG9uc2VDb2RlKSB7XHJcbiAgICAgICAgLy8gRG8gbm90IHByb2Nlc3MgcmVmZXJlbmNlcyB0byBtaXNzaW5nIHJlc3BvbnNlc1xyXG4gICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChyZXNwb25zZSkpIHtcclxuICAgICAgICAgIC8vIFZhbGlkYXRlIHZhbGlkYXRlIGlubGluZSBjb25zdHJhaW50c1xyXG4gICAgICAgICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLCByZXNwb25zZSwgb1BhdGguY29uY2F0KCdyZXNwb25zZXMnLCByZXNwb25zZUNvZGUpLCByZXN1bHRzKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHNlZW5QYXRocy5jb25jYXQoblBhdGgucGF0aCk7XHJcbiAgfSwgW10pO1xyXG5cclxuICAvLyBWYWxpZGF0ZSBkZWZpbml0aW9uc1xyXG4gIHZhbGlkYXRlRGVmaW5pdGlvbnMoZG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XHJcblxyXG4gIGNhbGxiYWNrKHVuZGVmaW5lZCwgcmVzdWx0cyk7XHJcbn07XHJcblxyXG52YXIgdmFsaWRhdGVTZW1hbnRpY2FsbHkgPSBmdW5jdGlvbiAoc3BlYywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKSB7XHJcbiAgdmFyIGNiV3JhcHBlciA9IGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcclxuICAgIGNhbGxiYWNrKGVyciwgaGVscGVycy5mb3JtYXRSZXN1bHRzKHJlc3VsdHMpKTtcclxuICB9O1xyXG4gIGlmIChzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XHJcbiAgICB2YWxpZGF0ZVN3YWdnZXIxXzIoc3BlYywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNiV3JhcHBlcik7IC8vIGpzaGludCBpZ25vcmU6bGluZVxyXG4gIH0gZWxzZSB7XHJcbiAgICB2YWxpZGF0ZVN3YWdnZXIyXzAoc3BlYywgcmxPclNPLCBjYldyYXBwZXIpOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcclxuICB9XHJcbn07XHJcblxyXG52YXIgdmFsaWRhdGVTdHJ1Y3R1cmFsbHkgPSBmdW5jdGlvbiAoc3BlYywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKSB7XHJcbiAgdmFsaWRhdGVBZ2FpbnN0U2NoZW1hKHNwZWMsIHNwZWMudmVyc2lvbiA9PT0gJzEuMicgPyAncmVzb3VyY2VMaXN0aW5nLmpzb24nIDogJ3NjaGVtYS5qc29uJywgcmxPclNPLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IHZhbGlkYXRlIHRoZSBBUEkgRGVjbGFyYXRpb25zIGlmIHRoZSBBUEkgaXMgMS4yIGFuZCB0aGUgUmVzb3VyY2UgTGlzdGluZyB3YXMgdmFsaWRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdHMgJiYgc3BlYy52ZXJzaW9uID09PSAnMS4yJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cyA9IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JzOiBbXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZ3M6IFtdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcGlEZWNsYXJhdGlvbnM6IFtdXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzeW5jLm1hcChhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChhcGlEZWNsYXJhdGlvbiwgY2FsbGJhY2syKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbGlkYXRlQWdhaW5zdFNjaGVtYShzcGVjLCAnYXBpRGVjbGFyYXRpb24uanNvbicsIGFwaURlY2xhcmF0aW9uLCBjYWxsYmFjazIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVyciwgYWxsUmVzdWx0cykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF8uZWFjaChhbGxSZXN1bHRzLCBmdW5jdGlvbiAocmVzdWx0LCBpbmRleCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zW2luZGV4XSA9IHJlc3VsdDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIHJlc3VsdHMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgcmVzdWx0cyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBDcmVhdGVzIGEgbmV3IFN3YWdnZXIgc3BlY2lmaWNhdGlvbiBvYmplY3QuXHJcbiAqXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uIC0gVGhlIFN3YWdnZXIgdmVyc2lvblxyXG4gKlxyXG4gKiBAY29uc3RydWN0b3JcclxuICovXHJcbnZhciBTcGVjaWZpY2F0aW9uID0gZnVuY3Rpb24gKHZlcnNpb24pIHtcclxuICB2YXIgdGhhdCA9IHRoaXM7XHJcbiAgdmFyIGNyZWF0ZVZhbGlkYXRvcnMgPSBmdW5jdGlvbiAoc3BlYywgdmFsaWRhdG9yc01hcCkge1xyXG4gICAgcmV0dXJuIF8ucmVkdWNlKHZhbGlkYXRvcnNNYXAsIGZ1bmN0aW9uIChyZXN1bHQsIHNjaGVtYXMsIHNjaGVtYU5hbWUpIHtcclxuICAgICAgcmVzdWx0W3NjaGVtYU5hbWVdID0gaGVscGVycy5jcmVhdGVKc29uVmFsaWRhdG9yKHNjaGVtYXMpO1xyXG5cclxuICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH0sIHt9KTtcclxuICB9O1xyXG4gIHZhciBmaXhTY2hlbWFJZCA9IGZ1bmN0aW9uIChzY2hlbWFOYW1lKSB7XHJcbiAgICAvLyBTd2FnZ2VyIDEuMiBzY2hlbWEgZmlsZXMgdXNlIG9uZSBpZCBidXQgdXNlIGEgZGlmZmVyZW50IGlkIHdoZW4gcmVmZXJlbmNpbmcgc2NoZW1hIGZpbGVzLiAgV2UgYWxzbyB1c2UgdGhlIHNjaGVtYVxyXG4gICAgLy8gZmlsZSBuYW1lIHRvIHJlZmVyZW5jZSB0aGUgc2NoZW1hIGluIFpTY2hlbWEuICBUbyBmaXggdGhpcyBzbyB0aGF0IHRoZSBKU09OIFNjaGVtYSB2YWxpZGF0b3Igd29ya3MgcHJvcGVybHksIHdlXHJcbiAgICAvLyBuZWVkIHRvIHNldCB0aGUgaWQgdG8gYmUgdGhlIG5hbWUgb2YgdGhlIHNjaGVtYSBmaWxlLlxyXG4gICAgdmFyIGZpeGVkID0gXy5jbG9uZURlZXAodGhhdC5zY2hlbWFzW3NjaGVtYU5hbWVdKTtcclxuXHJcbiAgICBmaXhlZC5pZCA9IHNjaGVtYU5hbWU7XHJcblxyXG4gICAgcmV0dXJuIGZpeGVkO1xyXG4gIH07XHJcbiAgdmFyIHByaW1pdGl2ZXMgPSBbJ3N0cmluZycsICdudW1iZXInLCAnYm9vbGVhbicsICdpbnRlZ2VyJywgJ2FycmF5J107XHJcblxyXG4gIHN3aXRjaCAodmVyc2lvbikge1xyXG4gIGNhc2UgJzEuMic6XHJcbiAgICB0aGlzLmRvY3NVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9ibG9iL21hc3Rlci92ZXJzaW9ucy8xLjIubWQnO1xyXG4gICAgdGhpcy5wcmltaXRpdmVzID0gXy51bmlvbihwcmltaXRpdmVzLCBbJ3ZvaWQnLCAnRmlsZSddKTtcclxuICAgIHRoaXMuc2NoZW1hc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL3RyZWUvbWFzdGVyL3NjaGVtYXMvdjEuMic7XHJcblxyXG4gICAgLy8gSGVyZSBleHBsaWNpdGx5IHRvIGFsbG93IGJyb3dzZXJpZnkgdG8gd29ya1xyXG4gICAgdGhpcy5zY2hlbWFzID0ge1xyXG4gICAgICAnYXBpRGVjbGFyYXRpb24uanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2FwaURlY2xhcmF0aW9uLmpzb24nKSxcclxuICAgICAgJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbicpLFxyXG4gICAgICAnZGF0YVR5cGUuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24nKSxcclxuICAgICAgJ2RhdGFUeXBlQmFzZS5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvZGF0YVR5cGVCYXNlLmpzb24nKSxcclxuICAgICAgJ2luZm9PYmplY3QuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2luZm9PYmplY3QuanNvbicpLFxyXG4gICAgICAnbW9kZWxzT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9tb2RlbHNPYmplY3QuanNvbicpLFxyXG4gICAgICAnb2F1dGgyR3JhbnRUeXBlLmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9vYXV0aDJHcmFudFR5cGUuanNvbicpLFxyXG4gICAgICAnb3BlcmF0aW9uT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9vcGVyYXRpb25PYmplY3QuanNvbicpLFxyXG4gICAgICAncGFyYW1ldGVyT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9wYXJhbWV0ZXJPYmplY3QuanNvbicpLFxyXG4gICAgICAncmVzb3VyY2VMaXN0aW5nLmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9yZXNvdXJjZUxpc3RpbmcuanNvbicpLFxyXG4gICAgICAncmVzb3VyY2VPYmplY3QuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL3Jlc291cmNlT2JqZWN0Lmpzb24nKVxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnZhbGlkYXRvcnMgPSBjcmVhdGVWYWxpZGF0b3JzKHRoaXMsIHtcclxuICAgICAgJ2FwaURlY2xhcmF0aW9uLmpzb24nOiBfLm1hcChbXHJcbiAgICAgICAgJ2RhdGFUeXBlQmFzZS5qc29uJyxcclxuICAgICAgICAnbW9kZWxzT2JqZWN0Lmpzb24nLFxyXG4gICAgICAgICdvYXV0aDJHcmFudFR5cGUuanNvbicsXHJcbiAgICAgICAgJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbicsXHJcbiAgICAgICAgJ3BhcmFtZXRlck9iamVjdC5qc29uJyxcclxuICAgICAgICAnb3BlcmF0aW9uT2JqZWN0Lmpzb24nLFxyXG4gICAgICAgICdhcGlEZWNsYXJhdGlvbi5qc29uJ1xyXG4gICAgICBdLCBmaXhTY2hlbWFJZCksXHJcbiAgICAgICdyZXNvdXJjZUxpc3RpbmcuanNvbic6IF8ubWFwKFtcclxuICAgICAgICAncmVzb3VyY2VPYmplY3QuanNvbicsXHJcbiAgICAgICAgJ2luZm9PYmplY3QuanNvbicsXHJcbiAgICAgICAgJ29hdXRoMkdyYW50VHlwZS5qc29uJyxcclxuICAgICAgICAnYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJyxcclxuICAgICAgICAncmVzb3VyY2VMaXN0aW5nLmpzb24nXHJcbiAgICAgIF0sIGZpeFNjaGVtYUlkKVxyXG4gICAgfSk7XHJcblxyXG4gICAgYnJlYWs7XHJcblxyXG4gIGNhc2UgJzIuMCc6XHJcbiAgICB0aGlzLmRvY3NVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9ibG9iL21hc3Rlci92ZXJzaW9ucy8yLjAubWQnO1xyXG4gICAgdGhpcy5wcmltaXRpdmVzID0gXy51bmlvbihwcmltaXRpdmVzLCBbJ2ZpbGUnXSk7XHJcbiAgICB0aGlzLnNjaGVtYXNVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy90cmVlL21hc3Rlci9zY2hlbWFzL3YyLjAnO1xyXG5cclxuICAgIC8vIEhlcmUgZXhwbGljaXRseSB0byBhbGxvdyBicm93c2VyaWZ5IHRvIHdvcmtcclxuICAgIHRoaXMuc2NoZW1hcyA9IHtcclxuICAgICAgJ3NjaGVtYS5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8yLjAvc2NoZW1hLmpzb24nKVxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnZhbGlkYXRvcnMgPSBjcmVhdGVWYWxpZGF0b3JzKHRoaXMsIHtcclxuICAgICAgJ3NjaGVtYS5qc29uJzogW2ZpeFNjaGVtYUlkKCdzY2hlbWEuanNvbicpXVxyXG4gICAgfSk7XHJcblxyXG4gICAgYnJlYWs7XHJcblxyXG4gIGRlZmF1bHQ6XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IodmVyc2lvbiArICcgaXMgYW4gdW5zdXBwb3J0ZWQgU3dhZ2dlciBzcGVjaWZpY2F0aW9uIHZlcnNpb24nKTtcclxuICB9XHJcblxyXG4gIHRoaXMudmVyc2lvbiA9IHZlcnNpb247XHJcbn07XHJcblxyXG4vKipcclxuICogUmV0dXJucyB0aGUgcmVzdWx0IG9mIHRoZSB2YWxpZGF0aW9uIG9mIHRoZSBTd2FnZ2VyIGRvY3VtZW50KHMpLlxyXG4gKlxyXG4gKiBAcGFyYW0ge29iamVjdH0gcmxPclNPIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgTGlzdGluZyAoMS4yKSBvciBTd2FnZ2VyIE9iamVjdCAoMi4wKVxyXG4gKiBAcGFyYW0ge29iamVjdFtdfSBbYXBpRGVjbGFyYXRpb25zXSAtIFRoZSBhcnJheSBvZiBTd2FnZ2VyIEFQSSBEZWNsYXJhdGlvbnMgKDEuMilcclxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXHJcbiAqXHJcbiAqIEByZXR1cm5zIHVuZGVmaW5lZCBpZiB2YWxpZGF0aW9uIHBhc3NlcyBvciBhbiBvYmplY3QgY29udGFpbmluZyBlcnJvcnMgYW5kL29yIHdhcm5pbmdzXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIGFyZ3VtZW50cyBwcm92aWRlZCBhcmUgbm90IHZhbGlkXHJcbiAqL1xyXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS52YWxpZGF0ZSA9IGZ1bmN0aW9uIChybE9yU08sIGFwaURlY2xhcmF0aW9ucywgY2FsbGJhY2spIHtcclxuICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcclxuICBzd2l0Y2ggKHRoaXMudmVyc2lvbikge1xyXG4gIGNhc2UgJzEuMic6XHJcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcclxuICAgIGlmIChfLmlzVW5kZWZpbmVkKHJsT3JTTykpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZXNvdXJjZUxpc3RpbmcgaXMgcmVxdWlyZWQnKTtcclxuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChybE9yU08pKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBtdXN0IGJlIGFuIG9iamVjdCcpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURlY2xhcmF0aW9ucykpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdhcGlEZWNsYXJhdGlvbnMgaXMgcmVxdWlyZWQnKTtcclxuICAgIH0gZWxzZSBpZiAoIV8uaXNBcnJheShhcGlEZWNsYXJhdGlvbnMpKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBtdXN0IGJlIGFuIGFycmF5Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgYnJlYWs7XHJcblxyXG4gIGNhc2UgJzIuMCc6XHJcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcclxuICAgIGlmIChfLmlzVW5kZWZpbmVkKHJsT3JTTykpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzd2FnZ2VyT2JqZWN0IGlzIHJlcXVpcmVkJyk7XHJcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QocmxPclNPKSkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzd2FnZ2VyT2JqZWN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgYnJlYWs7XHJcbiAgfVxyXG5cclxuICBpZiAodGhpcy52ZXJzaW9uID09PSAnMi4wJykge1xyXG4gICAgY2FsbGJhY2sgPSBhcmd1bWVudHNbMV07XHJcbiAgfVxyXG5cclxuICBpZiAoXy5pc1VuZGVmaW5lZChjYWxsYmFjaykpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcclxuICB9IGVsc2UgaWYgKCFfLmlzRnVuY3Rpb24oY2FsbGJhY2spKSB7XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcclxuICB9XHJcblxyXG4gIC8vIEZvciBTd2FnZ2VyIDIuMCwgbWFrZSBzdXJlIGFwaURlY2xhcmF0aW9ucyBpcyBhbiBlbXB0eSBhcnJheVxyXG4gIGlmICh0aGlzLnZlcnNpb24gPT09ICcyLjAnKSB7XHJcbiAgICBhcGlEZWNsYXJhdGlvbnMgPSBbXTtcclxuICB9XHJcblxyXG4gIHZhciB0aGF0ID0gdGhpcztcclxuXHJcbiAgLy8gUGVyZm9ybSB0aGUgdmFsaWRhdGlvblxyXG4gIHZhbGlkYXRlU3RydWN0dXJhbGx5KHRoaXMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoZXJyLCByZXN1bHQpIHtcclxuICAgIGlmIChlcnIgfHwgaGVscGVycy5mb3JtYXRSZXN1bHRzKHJlc3VsdCkpIHtcclxuICAgICAgY2FsbGJhY2soZXJyLCByZXN1bHQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdmFsaWRhdGVTZW1hbnRpY2FsbHkodGhhdCwgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKTtcclxuICAgIH1cclxuICB9KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIGEgSlNPTiBTY2hlbWEgcmVwcmVzZW50YXRpb24gb2YgYSBjb21wb3NlZCBtb2RlbCBiYXNlZCBvbiBpdHMgaWQgb3IgcmVmZXJlbmNlLlxyXG4gKlxyXG4gKiBOb3RlOiBGb3IgU3dhZ2dlciAxLjIsIHdlIG9ubHkgcGVyZm9ybSBzdHJ1Y3R1cmFsIHZhbGlkYXRpb24gcHJpb3IgdG8gY29tcG9zaW5nIHRoZSBtb2RlbC5cclxuICpcclxuICogQHBhcmFtIHtvYmplY3R9IGFwaURPclNPIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgQVBJIERlY2xhcmF0aW9uICgxLjIpIG9yIHRoZSBTd2FnZ2VyIE9iamVjdCAoMi4wKVxyXG4gKiBAcGFyYW0ge3N0cmluZ30gbW9kZWxJZE9yUmVmIC0gVGhlIG1vZGVsIGlkICgxLjIpIG9yIHRoZSByZWZlcmVuY2UgdG8gdGhlIG1vZGVsICgxLjIgb3IgMi4wKVxyXG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcclxuICpcclxuICogQHJldHVybnMgdGhlIG9iamVjdCByZXByZXNlbnRpbmcgYSBjb21wb3NlZCBvYmplY3RcclxuICpcclxuICogQHRocm93cyBFcnJvciBpZiB0aGVyZSBhcmUgdmFsaWRhdGlvbiBlcnJvcnMgd2hpbGUgY3JlYXRpbmdcclxuICovXHJcblNwZWNpZmljYXRpb24ucHJvdG90eXBlLmNvbXBvc2VNb2RlbCA9IGZ1bmN0aW9uIChhcGlET3JTTywgbW9kZWxJZE9yUmVmLCBjYWxsYmFjaykge1xyXG4gIHZhciBzd2FnZ2VyVmVyc2lvbiA9IGhlbHBlcnMuZ2V0U3dhZ2dlclZlcnNpb24oYXBpRE9yU08pO1xyXG4gIHZhciBkb0NvbXBvc2l0aW9uID0gZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xyXG4gICAgdmFyIGRvY3VtZW50TWV0YWRhdGE7XHJcblxyXG4gICAgaWYgKGVycikge1xyXG4gICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcclxuICAgIH0gZWxzZSBpZiAoaGVscGVycy5nZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMCkge1xyXG4gICAgICByZXR1cm4gaGFuZGxlVmFsaWRhdGlvbkVycm9yKHJlc3VsdHMsIGNhbGxiYWNrKTtcclxuICAgIH1cclxuXHJcbiAgICBkb2N1bWVudE1ldGFkYXRhID0gZ2V0RG9jdW1lbnRDYWNoZShhcGlET3JTTyk7XHJcbiAgICByZXN1bHRzID0ge1xyXG4gICAgICBlcnJvcnM6IFtdLFxyXG4gICAgICB3YXJuaW5nczogW11cclxuICAgIH07XHJcblxyXG4gICAgcHJvY2Vzc0RvY3VtZW50KGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpO1xyXG5cclxuICAgIGlmICghZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1ttb2RlbElkT3JSZWZdKSB7XHJcbiAgICAgIHJldHVybiBjYWxsYmFjaygpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChoZWxwZXJzLmdldEVycm9yQ291bnQocmVzdWx0cykgPiAwKSB7XHJcbiAgICAgIHJldHVybiBoYW5kbGVWYWxpZGF0aW9uRXJyb3IocmVzdWx0cywgY2FsbGJhY2spO1xyXG4gICAgfVxyXG5cclxuICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgZ2V0T3JDb21wb3NlU2NoZW1hKGRvY3VtZW50TWV0YWRhdGEsIG1vZGVsSWRPclJlZikpO1xyXG4gIH07XHJcblxyXG4gIHN3aXRjaCAodGhpcy52ZXJzaW9uKSB7XHJcbiAgY2FzZSAnMS4yJzpcclxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xyXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignYXBpRGVjbGFyYXRpb24gaXMgcmVxdWlyZWQnKTtcclxuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChhcGlET3JTTykpIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignYXBpRGVjbGFyYXRpb24gbXVzdCBiZSBhbiBvYmplY3QnKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JSZWYpKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxJZCBpcyByZXF1aXJlZCcpO1xyXG4gICAgfVxyXG5cclxuICAgIGJyZWFrO1xyXG5cclxuICBjYXNlICcyLjAnOlxyXG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXHJcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlET3JTTykpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzd2FnZ2VyT2JqZWN0IGlzIHJlcXVpcmVkJyk7XHJcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N3YWdnZXJPYmplY3QgbXVzdCBiZSBhbiBvYmplY3QnKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JSZWYpKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxSZWYgaXMgcmVxdWlyZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICBicmVhaztcclxuICB9XHJcblxyXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBpcyByZXF1aXJlZCcpO1xyXG4gIH0gZWxzZSBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xyXG4gIH1cclxuXHJcbiAgaWYgKG1vZGVsSWRPclJlZi5jaGFyQXQoMCkgIT09ICcjJykge1xyXG4gICAgaWYgKHRoaXMudmVyc2lvbiA9PT0gJzEuMicpIHtcclxuICAgICAgbW9kZWxJZE9yUmVmID0gJyMvbW9kZWxzLycgKyBtb2RlbElkT3JSZWY7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21vZGVsUmVmIG11c3QgYmUgYSBKU09OIFBvaW50ZXInKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIEVuc3VyZSB0aGUgZG9jdW1lbnQgaXMgdmFsaWQgZmlyc3RcclxuICBpZiAoc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XHJcbiAgICB2YWxpZGF0ZUFnYWluc3RTY2hlbWEodGhpcywgJ2FwaURlY2xhcmF0aW9uLmpzb24nLCBhcGlET3JTTywgZG9Db21wb3NpdGlvbik7XHJcbiAgfSBlbHNlIHtcclxuICAgIHRoaXMudmFsaWRhdGUoYXBpRE9yU08sIGRvQ29tcG9zaXRpb24pO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBWYWxpZGF0ZXMgYSBtb2RlbCBiYXNlZCBvbiBpdHMgaWQuXHJcbiAqXHJcbiAqIE5vdGU6IEZvciBTd2FnZ2VyIDEuMiwgd2Ugb25seSBwZXJmb3JtIHN0cnVjdHVyYWwgdmFsaWRhdGlvbiBwcmlvciB0byBjb21wb3NpbmcgdGhlIG1vZGVsLlxyXG4gKlxyXG4gKiBAcGFyYW0ge29iamVjdH0gYXBpRE9yU08gLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBBUEkgRGVjbGFyYXRpb24gKDEuMikgb3IgdGhlIFN3YWdnZXIgT2JqZWN0ICgyLjApXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBtb2RlbElkT3JSZWYgLSBUaGUgbW9kZWwgaWQgKDEuMikgb3IgdGhlIHJlZmVyZW5jZSB0byB0aGUgbW9kZWwgKDEuMiBvciAyLjApXHJcbiAqIEBwYXJhbSB7Kn0gZGF0YSAtIFRoZSBtb2RlbCB0byB2YWxpZGF0ZVxyXG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcclxuICpcclxuICogQHJldHVybnMgdW5kZWZpbmVkIGlmIHZhbGlkYXRpb24gcGFzc2VzIG9yIGFuIG9iamVjdCBjb250YWluaW5nIGVycm9ycyBhbmQvb3Igd2FybmluZ3NcclxuICpcclxuICogQHRocm93cyBFcnJvciBpZiB0aGVyZSBhcmUgdmFsaWRhdGlvbiBlcnJvcnMgd2hpbGUgY3JlYXRpbmdcclxuICovXHJcblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnZhbGlkYXRlTW9kZWwgPSBmdW5jdGlvbiAoYXBpRE9yU08sIG1vZGVsSWRPclJlZiwgZGF0YSwgY2FsbGJhY2spIHtcclxuICBzd2l0Y2ggKHRoaXMudmVyc2lvbikge1xyXG4gIGNhc2UgJzEuMic6XHJcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcclxuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURPclNPKSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9uIGlzIHJlcXVpcmVkJyk7XHJcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9uIG11c3QgYmUgYW4gb2JqZWN0Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUmVmKSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21vZGVsSWQgaXMgcmVxdWlyZWQnKTtcclxuICAgIH1cclxuXHJcbiAgICBicmVhaztcclxuXHJcbiAgY2FzZSAnMi4wJzpcclxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xyXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3dhZ2dlck9iamVjdCBpcyByZXF1aXJlZCcpO1xyXG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGFwaURPclNPKSkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzd2FnZ2VyT2JqZWN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUmVmKSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21vZGVsUmVmIGlzIHJlcXVpcmVkJyk7XHJcbiAgICB9XHJcblxyXG4gICAgYnJlYWs7XHJcbiAgfVxyXG5cclxuICBpZiAoXy5pc1VuZGVmaW5lZChkYXRhKSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdkYXRhIGlzIHJlcXVpcmVkJyk7XHJcbiAgfVxyXG5cclxuICBpZiAoXy5pc1VuZGVmaW5lZChjYWxsYmFjaykpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcclxuICB9IGVsc2UgaWYgKCFfLmlzRnVuY3Rpb24oY2FsbGJhY2spKSB7XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcclxuICB9XHJcblxyXG4gIHZhciB0aGF0ID0gdGhpcztcclxuXHJcbiAgdGhpcy5jb21wb3NlTW9kZWwoYXBpRE9yU08sIG1vZGVsSWRPclJlZiwgZnVuY3Rpb24gKGVyciwgcmVzdWx0KSB7XHJcbiAgICBpZiAoZXJyKSB7XHJcbiAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSh0aGF0LCByZXN1bHQsIGRhdGEsIGNhbGxiYWNrKTtcclxuICB9KTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIGEgZnVsbHkgcmVzb2x2ZWQgZG9jdW1lbnQgb3IgZG9jdW1lbnQgZnJhZ21lbnQuICAoRG9lcyBub3QgcGVyZm9ybSB2YWxpZGF0aW9uIGFzIHRoaXMgaXMgdHlwaWNhbGx5IGNhbGxlZFxyXG4gKiBhZnRlciB2YWxpZGF0aW9uIG9jY3Vycy4pKVxyXG4gKlxyXG4gKiBAcGFyYW0ge29iamVjdH0gZG9jdW1lbnQgLSBUaGUgZG9jdW1lbnQgdG8gcmVzb2x2ZSBvciB0aGUgZG9jdW1lbnQgY29udGFpbmluZyB0aGUgcmVmZXJlbmNlIHRvIHJlc29sdmVcclxuICogQHBhcmFtIHtzdHJpbmd9IFtwdHJdIC0gVGhlIEpTT04gUG9pbnRlciBvciB1bmRlZmluZWQgdG8gcmV0dXJuIHRoZSB3aG9sZSBkb2N1bWVudFxyXG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcclxuICpcclxuICogQHJldHVybnMgdGhlIGZ1bGx5IHJlc29sdmVkIGRvY3VtZW50IG9yIGZyYWdtZW50XHJcbiAqXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlcmUgYXJlIHVwc3RyZWFtIGVycm9yc1xyXG4gKi9cclxuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIChkb2N1bWVudCwgcHRyLCBjYWxsYmFjaykge1xyXG4gIHZhciBkb2N1bWVudE1ldGFkYXRhO1xyXG4gIHZhciByZXNwb25kID0gZnVuY3Rpb24gKGRvY3VtZW50KSB7XHJcbiAgICBpZiAoXy5pc1N0cmluZyhwdHIpKSB7XHJcbiAgICAgIHJldHVybiBjYWxsYmFjayh1bmRlZmluZWQsIHRyYXZlcnNlKGRvY3VtZW50KS5nZXQoSnNvblJlZnMucGF0aEZyb21QdHIocHRyKSkpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKHVuZGVmaW5lZCwgZG9jdW1lbnQpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4gIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xyXG4gIGlmIChfLmlzVW5kZWZpbmVkKGRvY3VtZW50KSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdkb2N1bWVudCBpcyByZXF1aXJlZCcpO1xyXG4gIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChkb2N1bWVudCkpIHtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2RvY3VtZW50IG11c3QgYmUgYW4gb2JqZWN0Jyk7XHJcbiAgfVxyXG5cclxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMikge1xyXG4gICAgY2FsbGJhY2sgPSBhcmd1bWVudHNbMV07XHJcbiAgICBwdHIgPSB1bmRlZmluZWQ7XHJcbiAgfVxyXG5cclxuICBpZiAoIV8uaXNVbmRlZmluZWQocHRyKSAmJiAhXy5pc1N0cmluZyhwdHIpKSB7XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwdHIgbXVzdCBiZSBhIEpTT04gUG9pbnRlciBzdHJpbmcnKTtcclxuICB9XHJcblxyXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBpcyByZXF1aXJlZCcpO1xyXG4gIH0gZWxzZSBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xyXG4gIH1cclxuXHJcbiAgZG9jdW1lbnRNZXRhZGF0YSA9IGdldERvY3VtZW50Q2FjaGUoZG9jdW1lbnQpO1xyXG5cclxuICAvLyBTd2FnZ2VyIDEuMiBpcyBub3Qgc3VwcG9ydGVkIGR1ZSB0byBpbnZhbGlkIEpTT04gUmVmZXJlbmNlcyBiZWluZyB1c2VkLiAgRXZlbiBpZiB0aGUgSlNPTiBSZWZlcmVuY2VzIHdlcmUgdmFsaWQsXHJcbiAgLy8gdGhlIEpTT04gU2NoZW1hIGZvciBTd2FnZ2VyIDEuMiBkbyBub3QgYWxsb3cgSmF2YVNjcmlwdCBvYmplY3RzIGluIGFsbCBwbGFjZXMgd2hlcmUgdGhlIHJlc291dGlvbiB3b3VsZCBvY2N1ci5cclxuICBpZiAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignU3dhZ2dlciAxLjIgaXMgbm90IHN1cHBvcnRlZCcpO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkKSB7XHJcbiAgICAvLyBFbnN1cmUgdGhlIGRvY3VtZW50IGlzIHZhbGlkIGZpcnN0XHJcbiAgICB0aGlzLnZhbGlkYXRlKGRvY3VtZW50LCBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XHJcbiAgICAgIGlmIChlcnIpIHtcclxuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcclxuICAgICAgfSBlbHNlIGlmIChoZWxwZXJzLmdldEVycm9yQ291bnQocmVzdWx0cykgPiAwKSB7XHJcbiAgICAgICAgcmV0dXJuIGhhbmRsZVZhbGlkYXRpb25FcnJvcihyZXN1bHRzLCBjYWxsYmFjayk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiByZXNwb25kKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpO1xyXG4gICAgfSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIHJldHVybiByZXNwb25kKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBDb252ZXJ0cyB0aGUgU3dhZ2dlciAxLjIgZG9jdW1lbnRzIHRvIGEgU3dhZ2dlciAyLjAgZG9jdW1lbnQuXHJcbiAqXHJcbiAqIEBwYXJhbSB7b2JqZWN0fSByZXNvdXJjZUxpc3RpbmcgLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBMaXN0aW5nXHJcbiAqIEBwYXJhbSB7b2JqZWN0W119IFthcGlEZWNsYXJhdGlvbnNdIC0gVGhlIGFycmF5IG9mIFN3YWdnZXIgQVBJIERlY2xhcmF0aW9uc1xyXG4gKiBAcGFyYW0ge2Jvb2xlYW49ZmFsc2V9IFtza2lwVmFsaWRhdGlvbl0gLSBXaGV0aGVyIG9yIG5vdCB0byBza2lwIHZhbGlkYXRpb25cclxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXHJcbiAqXHJcbiAqIEByZXR1cm5zIHRoZSBjb252ZXJ0ZWQgU3dhZ2dlciBkb2N1bWVudFxyXG4gKlxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBhcmd1bWVudHMgcHJvdmlkZWQgYXJlIG5vdCB2YWxpZFxyXG4gKi9cclxuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUuY29udmVydCA9IGZ1bmN0aW9uIChyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucywgc2tpcFZhbGlkYXRpb24sIGNhbGxiYWNrKSB7XHJcbiAgdmFyIGRvQ29udmVydCA9IGZ1bmN0aW9uIChyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucykge1xyXG4gICAgY2FsbGJhY2sodW5kZWZpbmVkLCBzd2FnZ2VyQ29udmVydGVyKHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zKSk7XHJcbiAgfTtcclxuXHJcbiAgaWYgKHRoaXMudmVyc2lvbiAhPT0gJzEuMicpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcignU3BlY2lmaWNhdGlvbiNjb252ZXJ0IG9ubHkgd29ya3MgZm9yIFN3YWdnZXIgMS4yJyk7XHJcbiAgfVxyXG5cclxuICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcclxuICBpZiAoXy5pc1VuZGVmaW5lZChyZXNvdXJjZUxpc3RpbmcpKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBpcyByZXF1aXJlZCcpO1xyXG4gIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChyZXNvdXJjZUxpc3RpbmcpKSB7XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXNvdXJjZUxpc3RpbmcgbXVzdCBiZSBhbiBvYmplY3QnKTtcclxuICB9XHJcblxyXG4gIC8vIEFQSSBEZWNsYXJhdGlvbnMgYXJlIG9wdGlvbmFsIGJlY2F1c2Ugc3dhZ2dlci1jb252ZXJ0ZXIgd2FzIHdyaXR0ZW4gdG8gc3VwcG9ydCBpdFxyXG4gIGlmIChfLmlzVW5kZWZpbmVkKGFwaURlY2xhcmF0aW9ucykpIHtcclxuICAgIGFwaURlY2xhcmF0aW9ucyA9IFtdO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFfLmlzQXJyYXkoYXBpRGVjbGFyYXRpb25zKSkge1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignYXBpRGVjbGFyYXRpb25zIG11c3QgYmUgYW4gYXJyYXknKTtcclxuICB9XHJcblxyXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoIDwgNCkge1xyXG4gICAgY2FsbGJhY2sgPSBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aCAtIDFdO1xyXG4gIH1cclxuXHJcbiAgaWYgKF8uaXNVbmRlZmluZWQoY2FsbGJhY2spKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIGlzIHJlcXVpcmVkJyk7XHJcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XHJcbiAgfVxyXG5cclxuICBpZiAoc2tpcFZhbGlkYXRpb24gPT09IHRydWUpIHtcclxuICAgIGRvQ29udmVydChyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucyk7XHJcbiAgfSBlbHNlIHtcclxuICAgIHRoaXMudmFsaWRhdGUocmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcclxuICAgICAgaWYgKGVycikge1xyXG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xyXG4gICAgICB9IGVsc2UgaWYgKGhlbHBlcnMuZ2V0RXJyb3JDb3VudChyZXN1bHRzKSA+IDApIHtcclxuICAgICAgICByZXR1cm4gaGFuZGxlVmFsaWRhdGlvbkVycm9yKHJlc3VsdHMsIGNhbGxiYWNrKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZG9Db252ZXJ0KHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zKTtcclxuICAgIH0pO1xyXG4gIH1cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLnYxID0gbW9kdWxlLmV4cG9ydHMudjFfMiA9IG5ldyBTcGVjaWZpY2F0aW9uKCcxLjInKTsgLy8ganNoaW50IGlnbm9yZTpsaW5lXHJcbm1vZHVsZS5leHBvcnRzLnYyID0gbW9kdWxlLmV4cG9ydHMudjJfMCA9IG5ldyBTcGVjaWZpY2F0aW9uKCcyLjAnKTsgLy8ganNoaW50IGlnbm9yZTpsaW5lXHJcbiIsIi8qXHJcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxyXG4gKlxyXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgQXBpZ2VlIENvcnBvcmF0aW9uXHJcbiAqXHJcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcclxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxyXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXHJcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcclxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXHJcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XHJcbiAqXHJcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXHJcbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxyXG4gKlxyXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXHJcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxyXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcclxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxyXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxyXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXHJcbiAqIFRIRSBTT0ZUV0FSRS5cclxuICovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydfJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydfJ10gOiBudWxsKTtcclxudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcclxuXHJcbi8vIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzMzMzkjc2VjdGlvbi01LjZcclxudmFyIGRhdGVSZWdFeHAgPSAvXihbMC05XXs0fSktKFswLTldezJ9KS0oWzAtOV17Mn0pJC87XHJcbi8vIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzMzMzkjc2VjdGlvbi01LjZcclxudmFyIGRhdGVUaW1lUmVnRXhwID0gL14oWzAtOV17Mn0pOihbMC05XXsyfSk6KFswLTldezJ9KSguWzAtOV0rKT8oenwoWystXVswLTldezJ9KTooWzAtOV17Mn0pKSQvO1xyXG52YXIgaXNWYWxpZERhdGUgPSBtb2R1bGUuZXhwb3J0cy5pc1ZhbGlkRGF0ZSA9IGZ1bmN0aW9uIChkYXRlKSB7XHJcbiAgdmFyIGRheTtcclxuICB2YXIgbWF0Y2hlcztcclxuICB2YXIgbW9udGg7XHJcblxyXG4gIGlmIChfLmlzRGF0ZShkYXRlKSkge1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG5cclxuICBpZiAoIV8uaXNTdHJpbmcoZGF0ZSkpIHtcclxuICAgIGRhdGUgPSBkYXRlLnRvU3RyaW5nKCk7XHJcbiAgfVxyXG5cclxuICBtYXRjaGVzID0gZGF0ZVJlZ0V4cC5leGVjKGRhdGUpO1xyXG5cclxuICBpZiAobWF0Y2hlcyA9PT0gbnVsbCkge1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgZGF5ID0gbWF0Y2hlc1szXTtcclxuICBtb250aCA9IG1hdGNoZXNbMl07XHJcblxyXG4gIGlmIChtb250aCA8ICcwMScgfHwgbW9udGggPiAnMTInIHx8IGRheSA8ICcwMScgfHwgZGF5ID4gJzMxJykge1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHRydWU7XHJcbn07XHJcbnZhciBpc1ZhbGlkRGF0ZVRpbWUgPSBtb2R1bGUuZXhwb3J0cy5pc1ZhbGlkRGF0ZVRpbWUgPSBmdW5jdGlvbiAoZGF0ZVRpbWUpIHtcclxuICB2YXIgaG91cjtcclxuICB2YXIgZGF0ZTtcclxuICB2YXIgdGltZTtcclxuICB2YXIgbWF0Y2hlcztcclxuICB2YXIgbWludXRlO1xyXG4gIHZhciBwYXJ0cztcclxuICB2YXIgc2Vjb25kO1xyXG4gIHZhciB0aW1lem9uZUhvdXJzO1xyXG4gIHZhciB0aW1lem9uZU1pbnV0ZXM7XHJcblxyXG4gIGlmIChfLmlzRGF0ZShkYXRlVGltZSkpIHtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFfLmlzU3RyaW5nKGRhdGVUaW1lKSkge1xyXG4gICAgZGF0ZVRpbWUgPSBkYXRlVGltZS50b1N0cmluZygpO1xyXG4gIH1cclxuXHJcbiAgcGFydHMgPSBkYXRlVGltZS50b0xvd2VyQ2FzZSgpLnNwbGl0KCd0Jyk7XHJcbiAgZGF0ZSA9IHBhcnRzWzBdO1xyXG4gIHRpbWUgPSBwYXJ0cy5sZW5ndGggPiAxID8gcGFydHNbMV0gOiB1bmRlZmluZWQ7XHJcblxyXG4gIGlmICghaXNWYWxpZERhdGUoZGF0ZSkpIHtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcblxyXG4gIG1hdGNoZXMgPSBkYXRlVGltZVJlZ0V4cC5leGVjKHRpbWUpO1xyXG5cclxuICBpZiAobWF0Y2hlcyA9PT0gbnVsbCkge1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxuXHJcbiAgaG91ciA9IG1hdGNoZXNbMV07XHJcbiAgbWludXRlID0gbWF0Y2hlc1syXTtcclxuICBzZWNvbmQgPSBtYXRjaGVzWzNdO1xyXG4gIGlmIChtYXRjaGVzWzVdID09PSAneicpIHtcclxuICAgIHRpbWV6b25lSG91cnMgPSAwO1xyXG4gICAgdGltZXpvbmVNaW51dGVzID0gMDtcclxuICB9IGVsc2Uge1xyXG4gICAgdGltZXpvbmVIb3VycyA9IE51bWJlcihtYXRjaGVzWzZdKTtcclxuICAgIHRpbWV6b25lTWludXRlcyA9IE51bWJlcihtYXRjaGVzWzddKTtcclxuICB9XHJcblxyXG4gIHZhciB2YWxpZFRpbWV6b25lTWludXRlcyA9IHRpbWV6b25lTWludXRlcyA9PT0gMCB8fCB0aW1lem9uZU1pbnV0ZXMgPT09IDE1IHx8IHRpbWV6b25lTWludXRlcyA9PT0gMzAgfHwgdGltZXpvbmVNaW51dGVzID09PSA0NTtcclxuXHJcbiAgaWYgKGhvdXIgPiAnMjMnIHx8IG1pbnV0ZSA+ICc1OScgfHwgc2Vjb25kID4gJzU5JyB8fCB0aW1lem9uZUhvdXJzID4gMTQgfHwgdGltZXpvbmVIb3VycyA8IC0xMiB8fCAhdmFsaWRUaW1lem9uZU1pbnV0ZXMpIHtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcblxyXG4gIHJldHVybiB0cnVlO1xyXG59O1xyXG5cclxudmFyIHRocm93RXJyb3JXaXRoQ29kZSA9IGZ1bmN0aW9uIChjb2RlLCBtc2cpIHtcclxuICB2YXIgZXJyID0gbmV3IEVycm9yKG1zZyk7XHJcblxyXG4gIGVyci5jb2RlID0gY29kZTtcclxuICBlcnIuZmFpbGVkVmFsaWRhdGlvbiA9IHRydWU7XHJcblxyXG4gIHRocm93IGVycjtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlQWdhaW5zdFNjaGVtYSA9IGZ1bmN0aW9uIChzY2hlbWFPck5hbWUsIGRhdGEsIHZhbGlkYXRvcikge1xyXG4gIHZhciBzYW5pdGl6ZUVycm9yID0gZnVuY3Rpb24gKG9iaikge1xyXG4gICAgLy8gTWFrZSBhbnlPZi9vbmVPZiBlcnJvcnMgbW9yZSBodW1hbiByZWFkYWJsZSAoSXNzdWUgMjAwKVxyXG4gICAgdmFyIGRlZlR5cGUgPSBbJ2FkZGl0aW9uYWxQcm9wZXJ0aWVzJywgJ2l0ZW1zJ10uaW5kZXhPZihvYmoucGF0aFtvYmoucGF0aC5sZW5ndGggLSAxXSkgPiAtMSA/XHJcbiAgICAgICAgICAnc2NoZW1hJyA6XHJcbiAgICAgICAgICBvYmoucGF0aFtvYmoucGF0aC5sZW5ndGggLSAyXTtcclxuXHJcbiAgICBpZiAoWydBTllfT0ZfTUlTU0lORycsICdPTkVfT0ZfTUlTU0lORyddLmluZGV4T2Yob2JqLmNvZGUpID4gLTEpIHtcclxuICAgICAgc3dpdGNoIChkZWZUeXBlKSB7XHJcbiAgICAgIGNhc2UgJ3BhcmFtZXRlcnMnOlxyXG4gICAgICAgIGRlZlR5cGUgPSAncGFyYW1ldGVyJztcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIGNhc2UgJ3Jlc3BvbnNlcyc6XHJcbiAgICAgICAgZGVmVHlwZSA9ICdyZXNwb25zZSc7XHJcbiAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICBjYXNlICdzY2hlbWEnOlxyXG4gICAgICAgIGRlZlR5cGUgKz0gJyAnICsgb2JqLnBhdGhbb2JqLnBhdGgubGVuZ3RoIC0gMV07XHJcblxyXG4gICAgICAgIC8vIG5vIGRlZmF1bHRcclxuICAgICAgfVxyXG5cclxuICAgICAgb2JqLm1lc3NhZ2UgPSAnTm90IGEgdmFsaWQgJyArIGRlZlR5cGUgKyAnIGRlZmluaXRpb24nO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlbW92ZSB0aGUgcGFyYW1zIHBvcnRpb24gb2YgdGhlIGVycm9yXHJcbiAgICBkZWxldGUgb2JqLnBhcmFtcztcclxuICAgIGRlbGV0ZSBvYmouc2NoZW1hSWQ7XHJcblxyXG4gICAgaWYgKG9iai5pbm5lcikge1xyXG4gICAgICBfLmVhY2gob2JqLmlubmVyLCBmdW5jdGlvbiAobk9iaikge1xyXG4gICAgICAgIHNhbml0aXplRXJyb3Iobk9iaik7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH07XHJcbiAgdmFyIHNjaGVtYSA9IF8uaXNQbGFpbk9iamVjdChzY2hlbWFPck5hbWUpID8gXy5jbG9uZURlZXAoc2NoZW1hT3JOYW1lKSA6IHNjaGVtYU9yTmFtZTtcclxuXHJcbiAgLy8gV2UgZG9uJ3QgY2hlY2sgdGhpcyBkdWUgdG8gaW50ZXJuYWwgdXNhZ2UgYnV0IGlmIHZhbGlkYXRvciBpcyBub3QgcHJvdmlkZWQsIHNjaGVtYU9yTmFtZSBtdXN0IGJlIGEgc2NoZW1hXHJcbiAgaWYgKF8uaXNVbmRlZmluZWQodmFsaWRhdG9yKSkge1xyXG4gICAgdmFsaWRhdG9yID0gaGVscGVycy5jcmVhdGVKc29uVmFsaWRhdG9yKFtzY2hlbWFdKTtcclxuICB9XHJcblxyXG4gIHZhciB2YWxpZCA9IHZhbGlkYXRvci52YWxpZGF0ZShkYXRhLCBzY2hlbWEpO1xyXG5cclxuICBpZiAoIXZhbGlkKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ1NDSEVNQV9WQUxJREFUSU9OX0ZBSUxFRCcsICdGYWlsZWQgc2NoZW1hIHZhbGlkYXRpb24nKTtcclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICBlcnIucmVzdWx0cyA9IHtcclxuICAgICAgICBlcnJvcnM6IF8ubWFwKHZhbGlkYXRvci5nZXRMYXN0RXJyb3JzKCksIGZ1bmN0aW9uIChlcnIpIHtcclxuICAgICAgICAgIHNhbml0aXplRXJyb3IoZXJyKTtcclxuXHJcbiAgICAgICAgICByZXR1cm4gZXJyO1xyXG4gICAgICAgIH0pLFxyXG4gICAgICAgIHdhcm5pbmdzOiBbXVxyXG4gICAgICB9O1xyXG5cclxuICAgICAgdGhyb3cgZXJyO1xyXG4gICAgfVxyXG4gIH1cclxufTtcclxuXHJcblxyXG4vKipcclxuICogVmFsaWRhdGVzIGEgc2NoZW1hIG9mIHR5cGUgYXJyYXkgaXMgcHJvcGVybHkgZm9ybWVkICh3aGVuIG5lY2Vzc2FyKS5cclxuICpcclxuICogKnBhcmFtIHtvYmplY3R9IHNjaGVtYSAtIFRoZSBzY2hlbWEgb2JqZWN0IHRvIHZhbGlkYXRlXHJcbiAqXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHNjaGVtYSBzYXlzIGl0J3MgYW4gYXJyYXkgYnV0IGl0IGlzIG5vdCBmb3JtZWQgcHJvcGVybHlcclxuICpcclxuICogQHNlZSB7QGxpbmsgaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9pc3N1ZXMvMTc0fVxyXG4gKi9cclxudmFyIHZhbGlkYXRlQXJyYXlUeXBlID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVBcnJheVR5cGUgPSBmdW5jdGlvbiAoc2NoZW1hKSB7XHJcbiAgLy8gV2UgaGF2ZSB0byBkbyB0aGlzIG1hbnVhbGx5IGZvciBub3dcclxuICBpZiAoc2NoZW1hLnR5cGUgPT09ICdhcnJheScgJiYgXy5pc1VuZGVmaW5lZChzY2hlbWEuaXRlbXMpKSB7XHJcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ09CSkVDVF9NSVNTSU5HX1JFUVVJUkVEX1BST1BFUlRZJywgJ01pc3NpbmcgcmVxdWlyZWQgcHJvcGVydHk6IGl0ZW1zJyk7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBvciByZXNwb25zZSBjb250ZW50IHR5cGUgKHdoZW4gbmVjZXNzYXJ5KS5cclxuICpcclxuICogQHBhcmFtIHtzdHJpbmdbXX0gZ1BPckMgLSBUaGUgdmFsaWQgY29uc3VtZXMgYXQgdGhlIEFQSSBzY29wZVxyXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBvUE9yQyAtIFRoZSB2YWxpZCBjb25zdW1lcyBhdCB0aGUgb3BlcmF0aW9uIHNjb3BlXHJcbiAqIEBwYXJhbSB7b2JqZWN0fSByZXFPclJlcyAtIFRoZSByZXF1ZXN0IG9yIHJlc3BvbnNlXHJcbiAqXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIGNvbnRlbnQgdHlwZSBpcyBpbnZhbGlkXHJcbiAqL1xyXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUNvbnRlbnRUeXBlID0gZnVuY3Rpb24gKGdQT3JDLCBvUE9yQywgcmVxT3JSZXMpIHtcclxuICAvLyBodHRwOi8vd3d3LnczLm9yZy9Qcm90b2NvbHMvcmZjMjYxNi9yZmMyNjE2LXNlYzcuaHRtbCNzZWM3LjIuMVxyXG4gIHZhciBpc1Jlc3BvbnNlID0gdHlwZW9mIHJlcU9yUmVzLmVuZCA9PT0gJ2Z1bmN0aW9uJztcclxuICB2YXIgY29udGVudFR5cGUgPSBpc1Jlc3BvbnNlID8gcmVxT3JSZXMuZ2V0SGVhZGVyKCdjb250ZW50LXR5cGUnKSA6IHJlcU9yUmVzLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddO1xyXG4gIHZhciBwT3JDID0gXy5tYXAoXy51bmlvbihnUE9yQywgb1BPckMpLCBmdW5jdGlvbiAoY29udGVudFR5cGUpIHtcclxuICAgIHJldHVybiBjb250ZW50VHlwZS5zcGxpdCgnOycpWzBdO1xyXG4gIH0pO1xyXG5cclxuICBpZiAoIWNvbnRlbnRUeXBlKSB7XHJcbiAgICBpZiAoaXNSZXNwb25zZSkge1xyXG4gICAgICBjb250ZW50VHlwZSA9ICd0ZXh0L3BsYWluJztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnRlbnRUeXBlID0gJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbSc7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjb250ZW50VHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KCc7JylbMF07XHJcblxyXG4gIGlmIChwT3JDLmxlbmd0aCA+IDAgJiYgKGlzUmVzcG9uc2UgP1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRydWUgOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFsnUE9TVCcsICdQVVQnXS5pbmRleE9mKHJlcU9yUmVzLm1ldGhvZCkgIT09IC0xKSAmJiBwT3JDLmluZGV4T2YoY29udGVudFR5cGUpID09PSAtMSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbnRlbnQgdHlwZSAoJyArIGNvbnRlbnRUeXBlICsgJykuICBUaGVzZSBhcmUgdmFsaWQ6ICcgKyBwT3JDLmpvaW4oJywgJykpO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGFnYWluc3QgdGhlIGFsbG93YWJsZSB2YWx1ZXMgKHdoZW4gbmVjZXNzYXJ5KS5cclxuICpcclxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXHJcbiAqIEBwYXJhbSB7c3RyaW5nW119IGFsbG93ZWQgLSBUaGUgYWxsb3dhYmxlIHZhbHVlc1xyXG4gKlxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBub3QgYWxsb3dhYmxlXHJcbiAqL1xyXG52YXIgdmFsaWRhdGVFbnVtID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVFbnVtID0gZnVuY3Rpb24gKHZhbCwgYWxsb3dlZCkge1xyXG4gIGlmICghXy5pc1VuZGVmaW5lZChhbGxvd2VkKSAmJiAhXy5pc1VuZGVmaW5lZCh2YWwpICYmIGFsbG93ZWQuaW5kZXhPZih2YWwpID09PSAtMSkge1xyXG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdFTlVNX01JU01BVENIJywgJ05vdCBhbiBhbGxvd2FibGUgdmFsdWUgKCcgKyBhbGxvd2VkLmpvaW4oJywgJykgKyAnKTogJyArIHZhbCk7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXHJcbiAqXHJcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxyXG4gKiBAcGFyYW0ge3N0cmluZ30gbWF4aW11bSAtIFRoZSBtYXhpbXVtIHZhbHVlXHJcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2V4Y2x1c2l2ZT1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0aGUgdmFsdWUgaW5jbHVkZXMgdGhlIG1heGltdW0gaW4gaXRzIGNvbXBhcmlzb25cclxuICpcclxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgZ3JlYXRlciB0aGFuIHRoZSBtYXhpbXVtXHJcbiAqL1xyXG52YXIgdmFsaWRhdGVNYXhpbXVtID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhpbXVtID0gZnVuY3Rpb24gKHZhbCwgbWF4aW11bSwgdHlwZSwgZXhjbHVzaXZlKSB7XHJcbiAgdmFyIGNvZGUgPSBleGNsdXNpdmUgPT09IHRydWUgPyAnTUFYSU1VTV9FWENMVVNJVkUnIDogJ01BWElNVU0nO1xyXG4gIHZhciB0ZXN0TWF4O1xyXG4gIHZhciB0ZXN0VmFsO1xyXG5cclxuICBpZiAoXy5pc1VuZGVmaW5lZChleGNsdXNpdmUpKSB7XHJcbiAgICBleGNsdXNpdmUgPSBmYWxzZTtcclxuICB9XHJcblxyXG4gIGlmICh0eXBlID09PSAnaW50ZWdlcicpIHtcclxuICAgIHRlc3RWYWwgPSBwYXJzZUludCh2YWwsIDEwKTtcclxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInKSB7XHJcbiAgICB0ZXN0VmFsID0gcGFyc2VGbG9hdCh2YWwpO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heGltdW0pKSB7XHJcbiAgICB0ZXN0TWF4ID0gcGFyc2VGbG9hdChtYXhpbXVtKTtcclxuXHJcbiAgICBpZiAoZXhjbHVzaXZlICYmIHRlc3RWYWwgPj0gdGVzdE1heCkge1xyXG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoY29kZSwgJ0dyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byB0aGUgY29uZmlndXJlZCBtYXhpbXVtICgnICsgbWF4aW11bSArICcpOiAnICsgdmFsKTtcclxuICAgIH0gZWxzZSBpZiAodGVzdFZhbCA+IHRlc3RNYXgpIHtcclxuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKGNvZGUsICdHcmVhdGVyIHRoYW4gdGhlIGNvbmZpZ3VyZWQgbWF4aW11bSAoJyArIG1heGltdW0gKyAnKTogJyArIHZhbCk7XHJcbiAgICB9XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXRlcyB0aGUgYXJyYXkgY291bnQgaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXHJcbiAqXHJcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXHJcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhJdGVtcyAtIFRoZSBtYXhpbXVtIG51bWJlciBvZiBpdGVtc1xyXG4gKlxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBjb250YWlucyBtb3JlIGl0ZW1zIHRoYW4gYWxsb3dhYmxlXHJcbiAqL1xyXG52YXIgdmFsaWRhdGVNYXhJdGVtcyA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWF4SXRlbXMgPSBmdW5jdGlvbiAodmFsLCBtYXhJdGVtcykge1xyXG4gIGlmICghXy5pc1VuZGVmaW5lZChtYXhJdGVtcykgJiYgdmFsLmxlbmd0aCA+IG1heEl0ZW1zKSB7XHJcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0FSUkFZX0xFTkdUSF9MT05HJywgJ0FycmF5IGlzIHRvbyBsb25nICgnICsgdmFsLmxlbmd0aCArICcpLCBtYXhpbXVtICcgKyBtYXhJdGVtcyk7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgbGVuZ3RoIGlzIGxlc3MgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxyXG4gKlxyXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxyXG4gKiBAcGFyYW0ge251bWJlcn0gbWF4TGVuZ3RoIC0gVGhlIG1heGltdW0gbGVuZ3RoXHJcbiAqXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlJ3MgbGVuZ3RoIGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWF4aW11bVxyXG4gKi9cclxudmFyIHZhbGlkYXRlTWF4TGVuZ3RoID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhMZW5ndGggPSBmdW5jdGlvbiAodmFsLCBtYXhMZW5ndGgpIHtcclxuICBpZiAoIV8uaXNVbmRlZmluZWQobWF4TGVuZ3RoKSAmJiB2YWwubGVuZ3RoID4gbWF4TGVuZ3RoKSB7XHJcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ01BWF9MRU5HVEgnLCAnU3RyaW5nIGlzIHRvbyBsb25nICgnICsgdmFsLmxlbmd0aCArICcgY2hhcnMpLCBtYXhpbXVtICcgKyBtYXhMZW5ndGgpO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlJ3MgcHJvcGVydHkgY291bnQgaXMgZ3JlYXRlciB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXHJcbiAqXHJcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXHJcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5Qcm9wZXJ0aWVzIC0gVGhlIG1heGltdW0gbnVtYmVyIG9mIHByb3BlcnRpZXNcclxuICpcclxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUncyBwcm9wZXJ0eSBjb3VudCBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW1cclxuICovXHJcbnZhciB2YWxpZGF0ZU1heFByb3BlcnRpZXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1heFByb3BlcnRpZXMgPSBmdW5jdGlvbiAodmFsLCBtYXhQcm9wZXJ0aWVzKSB7XHJcbiAgdmFyIHByb3BDb3VudCA9IF8uaXNQbGFpbk9iamVjdCh2YWwpID8gT2JqZWN0LmtleXModmFsKS5sZW5ndGggOiAwO1xyXG5cclxuICBpZiAoIV8uaXNVbmRlZmluZWQobWF4UHJvcGVydGllcykgJiYgcHJvcENvdW50ID4gbWF4UHJvcGVydGllcykge1xyXG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNQVhfUFJPUEVSVElFUycsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgJ051bWJlciBvZiBwcm9wZXJ0aWVzIGlzIHRvbyBtYW55ICgnICsgcHJvcENvdW50ICsgJyBwcm9wZXJ0aWVzKSwgbWF4aW11bSAnICsgbWF4UHJvcGVydGllcyk7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgYXJyYXkgY291bnQgaXMgZ3JlYXRlciB0aGFuIHRoZSBtaW5pbXVtICh3aGVuIG5lY2Vzc2FyeSkuXHJcbiAqXHJcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxyXG4gKiBAcGFyYW0ge3N0cmluZ30gbWluaW11bSAtIFRoZSBtaW5pbXVtIHZhbHVlXHJcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2V4Y2x1c2l2ZT1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0aGUgdmFsdWUgaW5jbHVkZXMgdGhlIG1pbmltdW0gaW4gaXRzIGNvbXBhcmlzb25cclxuICpcclxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtXHJcbiAqL1xyXG52YXIgdmFsaWRhdGVNaW5pbXVtID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5pbXVtID0gZnVuY3Rpb24gKHZhbCwgbWluaW11bSwgdHlwZSwgZXhjbHVzaXZlKSB7XHJcbiAgdmFyIGNvZGUgPSBleGNsdXNpdmUgPT09IHRydWUgPyAnTUlOSU1VTV9FWENMVVNJVkUnIDogJ01JTklNVU0nO1xyXG4gIHZhciB0ZXN0TWluO1xyXG4gIHZhciB0ZXN0VmFsO1xyXG5cclxuICBpZiAoXy5pc1VuZGVmaW5lZChleGNsdXNpdmUpKSB7XHJcbiAgICBleGNsdXNpdmUgPSBmYWxzZTtcclxuICB9XHJcblxyXG4gIGlmICh0eXBlID09PSAnaW50ZWdlcicpIHtcclxuICAgIHRlc3RWYWwgPSBwYXJzZUludCh2YWwsIDEwKTtcclxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInKSB7XHJcbiAgICB0ZXN0VmFsID0gcGFyc2VGbG9hdCh2YWwpO1xyXG4gIH1cclxuXHJcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbmltdW0pKSB7XHJcbiAgICB0ZXN0TWluID0gcGFyc2VGbG9hdChtaW5pbXVtKTtcclxuXHJcbiAgICBpZiAoZXhjbHVzaXZlICYmIHRlc3RWYWwgPD0gdGVzdE1pbikge1xyXG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoY29kZSwgJ0xlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgY29uZmlndXJlZCBtaW5pbXVtICgnICsgbWluaW11bSArICcpOiAnICsgdmFsKTtcclxuICAgIH0gZWxzZSBpZiAodGVzdFZhbCA8IHRlc3RNaW4pIHtcclxuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKGNvZGUsICdMZXNzIHRoYW4gdGhlIGNvbmZpZ3VyZWQgbWluaW11bSAoJyArIG1pbmltdW0gKyAnKTogJyArIHZhbCk7XHJcbiAgICB9XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgdmFsdWUgY29udGFpbnMgZmV3ZXIgaXRlbXMgdGhhbiBhbGxvd2VkICh3aGVuIG5lY2Vzc2FyeSkuXHJcbiAqXHJcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXHJcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5JdGVtcyAtIFRoZSBtaW5pbXVtIG51bWJlciBvZiBpdGVtc1xyXG4gKlxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93YWJsZVxyXG4gKi9cclxudmFyIHZhbGlkYXRlTWluSXRlbXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbkl0ZW1zID0gZnVuY3Rpb24gKHZhbCwgbWluSXRlbXMpIHtcclxuICBpZiAoIV8uaXNVbmRlZmluZWQobWluSXRlbXMpICYmIHZhbC5sZW5ndGggPCBtaW5JdGVtcykge1xyXG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdBUlJBWV9MRU5HVEhfU0hPUlQnLCAnQXJyYXkgaXMgdG9vIHNob3J0ICgnICsgdmFsLmxlbmd0aCArICcpLCBtaW5pbXVtICcgKyBtaW5JdGVtcyk7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgbGVuZ3RoIGlzIGxlc3MgdGhhbiB0aGUgbWluaW11bSAod2hlbiBuZWNlc3NhcnkpLlxyXG4gKlxyXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxyXG4gKiBAcGFyYW0ge251bWJlcn0gbWluTGVuZ3RoIC0gVGhlIG1pbmltdW0gbGVuZ3RoXHJcbiAqXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlJ3MgbGVuZ3RoIGlzIGxlc3MgdGhhbiB0aGUgbWluaW11bVxyXG4gKi9cclxudmFyIHZhbGlkYXRlTWluTGVuZ3RoID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5MZW5ndGggPSBmdW5jdGlvbiAodmFsLCBtaW5MZW5ndGgpIHtcclxuICBpZiAoIV8uaXNVbmRlZmluZWQobWluTGVuZ3RoKSAmJiB2YWwubGVuZ3RoIDwgbWluTGVuZ3RoKSB7XHJcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ01JTl9MRU5HVEgnLCAnU3RyaW5nIGlzIHRvbyBzaG9ydCAoJyArIHZhbC5sZW5ndGggKyAnIGNoYXJzKSwgbWluaW11bSAnICsgbWluTGVuZ3RoKTtcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSdzIHByb3BlcnR5IGNvdW50IGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgbWluaW11bSAod2hlbiBuZWNlc3NhcnkpLlxyXG4gKlxyXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxyXG4gKiBAcGFyYW0ge251bWJlcn0gbWluUHJvcGVydGllcyAtIFRoZSBtaW5pbXVtIG51bWJlciBvZiBwcm9wZXJ0aWVzXHJcbiAqXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlJ3MgcHJvcGVydHkgY291bnQgaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtXHJcbiAqL1xyXG52YXIgdmFsaWRhdGVNaW5Qcm9wZXJ0aWVzID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5Qcm9wZXJ0aWVzID0gZnVuY3Rpb24gKHZhbCwgbWluUHJvcGVydGllcykge1xyXG4gIHZhciBwcm9wQ291bnQgPSBfLmlzUGxhaW5PYmplY3QodmFsKSA/IE9iamVjdC5rZXlzKHZhbCkubGVuZ3RoIDogMDtcclxuXHJcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pblByb3BlcnRpZXMpICYmIHByb3BDb3VudCA8IG1pblByb3BlcnRpZXMpIHtcclxuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnTUlOX1BST1BFUlRJRVMnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICdOdW1iZXIgb2YgcHJvcGVydGllcyBpcyB0b28gZmV3ICgnICsgcHJvcENvdW50ICsgJyBwcm9wZXJ0aWVzKSwgbWluaW11bSAnICsgbWluUHJvcGVydGllcyk7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgaXMgYSBtdWx0aXBsZSBvZiB0aGUgcHJvdmlkZWQgbnVtYmVyICh3aGVuIG5lY2Vzc2FyeSkuXHJcbiAqXHJcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXHJcbiAqIEBwYXJhbSB7bnVtYmVyfSBtdWx0aXBsZU9mIC0gVGhlIG51bWJlciB0aGF0IHNob3VsZCBkaXZpZGUgZXZlbmx5IGludG8gdGhlIHZhbHVlXHJcbiAqXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGNvbnRhaW5zIGZld2VyIGl0ZW1zIHRoYW4gYWxsb3dhYmxlXHJcbiAqL1xyXG52YXIgdmFsaWRhdGVNdWx0aXBsZU9mID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNdWx0aXBsZU9mID0gZnVuY3Rpb24gKHZhbCwgbXVsdGlwbGVPZikge1xyXG4gIGlmICghXy5pc1VuZGVmaW5lZChtdWx0aXBsZU9mKSAmJiB2YWwgJSBtdWx0aXBsZU9mICE9PSAwKSB7XHJcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ01VTFRJUExFX09GJywgJ05vdCBhIG11bHRpcGxlIG9mICcgKyBtdWx0aXBsZU9mKTtcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBtYXRjaGVzIGEgcGF0dGVybiAod2hlbiBuZWNlc3NhcnkpLlxyXG4gKlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxyXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcclxuICogQHBhcmFtIHtzdHJpbmd9IHBhdHRlcm4gLSBUaGUgcGF0dGVyblxyXG4gKlxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBkb2VzIG5vdCBtYXRjaCB0aGUgcGF0dGVyblxyXG4gKi9cclxudmFyIHZhbGlkYXRlUGF0dGVybiA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlUGF0dGVybiA9IGZ1bmN0aW9uICh2YWwsIHBhdHRlcm4pIHtcclxuICBpZiAoIV8uaXNVbmRlZmluZWQocGF0dGVybikgJiYgXy5pc051bGwodmFsLm1hdGNoKG5ldyBSZWdFeHAocGF0dGVybikpKSkge1xyXG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdQQVRURVJOJywgJ0RvZXMgbm90IG1hdGNoIHJlcXVpcmVkIHBhdHRlcm46ICcgKyBwYXR0ZXJuKTtcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSByZXF1aXJlZG5lc3MgKHdoZW4gbmVjZXNzYXJ5KS5cclxuICpcclxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXHJcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gcmVxdWlyZWQgLSBXaGV0aGVyIG9yIG5vdCB0aGUgcGFyYW1ldGVyIGlzIHJlcXVpcmVkXHJcbiAqXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIHJlcXVpcmVkIGJ1dCBpcyBub3QgcHJlc2VudFxyXG4gKi9cclxubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVSZXF1aXJlZG5lc3MgPSBmdW5jdGlvbiAodmFsLCByZXF1aXJlZCkge1xyXG4gIGlmICghXy5pc1VuZGVmaW5lZChyZXF1aXJlZCkgJiYgcmVxdWlyZWQgPT09IHRydWUgJiYgXy5pc1VuZGVmaW5lZCh2YWwpKSB7XHJcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ1JFUVVJUkVEJywgJ0lzIHJlcXVpcmVkJyk7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgdHlwZSBhbmQgZm9ybWF0ICh3aGVuIG5lY2Vzc2FyeSkuXHJcbiAqXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uIC0gVGhlIFN3YWdnZXIgdmVyc2lvblxyXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcclxuICogQHBhcmFtIHtzdHJpbmd9IHR5cGUgLSBUaGUgcGFyYW1ldGVyIHR5cGVcclxuICogQHBhcmFtIHtzdHJpbmd9IGZvcm1hdCAtIFRoZSBwYXJhbWV0ZXIgZm9ybWF0XHJcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3NraXBFcnJvcj1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0byBza2lwIHRocm93aW5nIGFuIGVycm9yIChVc2VmdWwgZm9yIHZhbGlkYXRpbmcgYXJyYXlzKVxyXG4gKlxyXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBub3QgdGhlIHByb3BlciB0eXBlIG9yIGZvcm1hdFxyXG4gKi9cclxudmFyIHZhbGlkYXRlVHlwZUFuZEZvcm1hdCA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlVHlwZUFuZEZvcm1hdCA9XHJcbiAgZnVuY3Rpb24gdmFsaWRhdGVUeXBlQW5kRm9ybWF0ICh2ZXJzaW9uLCB2YWwsIHR5cGUsIGZvcm1hdCwgYWxsb3dFbXB0eVZhbHVlLCBza2lwRXJyb3IpIHtcclxuICAgIHZhciByZXN1bHQgPSB0cnVlO1xyXG4gICAgdmFyIG9WYWwgPSB2YWw7XHJcblxyXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gZW1wdHkgdmFsdWUgYW5kIHdlIGFsbG93IGVtcHR5IHZhbHVlcywgdGhlIHZhbHVlIGlzIGFsd2F5cyB2YWxpZFxyXG4gICAgaWYgKGFsbG93RW1wdHlWYWx1ZSA9PT0gdHJ1ZSAmJiB2YWwgPT09ICcnKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoXy5pc0FycmF5KHZhbCkpIHtcclxuICAgICAgXy5lYWNoKHZhbCwgZnVuY3Rpb24gKGFWYWwsIGluZGV4KSB7XHJcbiAgICAgICAgaWYgKCF2YWxpZGF0ZVR5cGVBbmRGb3JtYXQodmVyc2lvbiwgYVZhbCwgdHlwZSwgZm9ybWF0LCBhbGxvd0VtcHR5VmFsdWUsIHRydWUpKSB7XHJcbiAgICAgICAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0lOVkFMSURfVFlQRScsICdWYWx1ZSBhdCBpbmRleCAnICsgaW5kZXggKyAnIGlzIG5vdCBhIHZhbGlkICcgKyB0eXBlICsgJzogJyArIGFWYWwpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcclxuICAgICAgY2FzZSAnYm9vbGVhbic6XHJcbiAgICAgICAgLy8gQ29lcmNlIHRoZSB2YWx1ZSBvbmx5IGZvciBTd2FnZ2VyIDEuMlxyXG4gICAgICAgIGlmICh2ZXJzaW9uID09PSAnMS4yJyAmJiBfLmlzU3RyaW5nKHZhbCkpIHtcclxuICAgICAgICAgIGlmICh2YWwgPT09ICdmYWxzZScpIHtcclxuICAgICAgICAgICAgdmFsID0gZmFsc2U7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKHZhbCA9PT0gJ3RydWUnKSB7XHJcbiAgICAgICAgICAgIHZhbCA9IHRydWU7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXN1bHQgPSBfLmlzQm9vbGVhbih2YWwpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdpbnRlZ2VyJzpcclxuICAgICAgICAvLyBDb2VyY2UgdGhlIHZhbHVlIG9ubHkgZm9yIFN3YWdnZXIgMS4yXHJcbiAgICAgICAgaWYgKHZlcnNpb24gPT09ICcxLjInICYmIF8uaXNTdHJpbmcodmFsKSkge1xyXG4gICAgICAgICAgdmFsID0gTnVtYmVyKHZhbCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXN1bHQgPSBfLmlzRmluaXRlKHZhbCkgJiYgKE1hdGgucm91bmQodmFsKSA9PT0gdmFsKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnbnVtYmVyJzpcclxuICAgICAgICAvLyBDb2VyY2UgdGhlIHZhbHVlIG9ubHkgZm9yIFN3YWdnZXIgMS4yXHJcbiAgICAgICAgaWYgKHZlcnNpb24gPT09ICcxLjInICYmIF8uaXNTdHJpbmcodmFsKSkge1xyXG4gICAgICAgICAgdmFsID0gTnVtYmVyKHZhbCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXN1bHQgPSBfLmlzRmluaXRlKHZhbCk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgJ3N0cmluZyc6XHJcbiAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKGZvcm1hdCkpIHtcclxuICAgICAgICAgIHN3aXRjaCAoZm9ybWF0KSB7XHJcbiAgICAgICAgICBjYXNlICdkYXRlJzpcclxuICAgICAgICAgICAgcmVzdWx0ID0gaXNWYWxpZERhdGUodmFsKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICBjYXNlICdkYXRlLXRpbWUnOlxyXG4gICAgICAgICAgICByZXN1bHQgPSBpc1ZhbGlkRGF0ZVRpbWUodmFsKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICd2b2lkJzpcclxuICAgICAgICByZXN1bHQgPSBfLmlzVW5kZWZpbmVkKHZhbCk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoc2tpcEVycm9yKSB7XHJcbiAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9IGVsc2UgaWYgKCFyZXN1bHQpIHtcclxuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKCdJTlZBTElEX1RZUEUnLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSAhPT0gJ3ZvaWQnID9cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ05vdCBhIHZhbGlkICcgKyAoXy5pc1VuZGVmaW5lZChmb3JtYXQpID8gJycgOiBmb3JtYXQgKyAnICcpICsgdHlwZSArICc6ICcgKyBvVmFsIDpcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJ1ZvaWQgZG9lcyBub3QgYWxsb3cgYSB2YWx1ZScpO1xyXG4gICAgfVxyXG4gIH07XHJcblxyXG4vKipcclxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSB2YWx1ZXMgYXJlIHVuaXF1ZSAod2hlbiBuZWNlc3NhcnkpLlxyXG4gKlxyXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXHJcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNVbmlxdWUgLSBXaGV0aGVyIG9yIG5vdCB0aGUgcGFyYW1ldGVyIHZhbHVlcyBhcmUgdW5pcXVlXHJcbiAqXHJcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGhhcyBkdXBsaWNhdGVzXHJcbiAqL1xyXG52YXIgdmFsaWRhdGVVbmlxdWVJdGVtcyA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlVW5pcXVlSXRlbXMgPSBmdW5jdGlvbiAodmFsLCBpc1VuaXF1ZSkge1xyXG4gIGlmICghXy5pc1VuZGVmaW5lZChpc1VuaXF1ZSkgJiYgXy51bmlxKHZhbCkubGVuZ3RoICE9PSB2YWwubGVuZ3RoKSB7XHJcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0FSUkFZX1VOSVFVRScsICdEb2VzIG5vdCBhbGxvdyBkdXBsaWNhdGUgdmFsdWVzOiAnICsgdmFsLmpvaW4oJywgJykpO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGFnYWluc3QgdGhlIHNjaGVtYS5cclxuICpcclxuICogQHBhcmFtIHtzdHJpbmd9IHZlcnNpb24gLSBUaGUgU3dhZ2dlciB2ZXJzaW9uXHJcbiAqIEBwYXJhbSB7b2JqZWN0fSBzY2hlbWEgLSBUaGUgc2NoZW1hIHRvIHVzZSB0byB2YWxpZGF0ZSB0aGluZ3NcclxuICogQHBhcmFtIHtzdHJpbmdbXX0gcGF0aCAtIFRoZSBwYXRoIHRvIHRoZSBzY2hlbWFcclxuICogQHBhcmFtIHsqfSBbdmFsXSAtIFRoZSB2YWx1ZSB0byB2YWxpZGF0ZSBvciB1bmRlZmluZWQgdG8gdXNlIHRoZSBkZWZhdWx0IHZhbHVlIHByb3ZpZGVkIGJ5IHRoZSBzY2hlbWFcclxuICpcclxuICogQHRocm93cyBFcnJvciBpZiBhbnkgdmFsaWRhdGlvbiBmYWlsZXNcclxuICovXHJcbnZhciB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyA9IGZ1bmN0aW9uICh2ZXJzaW9uLCBzY2hlbWEsIHBhdGgsIHZhbCkge1xyXG4gIHZhciByZXNvbHZlU2NoZW1hID0gZnVuY3Rpb24gKHNjaGVtYSkge1xyXG4gICAgdmFyIHJlc29sdmVkID0gc2NoZW1hO1xyXG5cclxuICAgIGlmIChyZXNvbHZlZC5zY2hlbWEpIHtcclxuICAgICAgcGF0aCA9IHBhdGguY29uY2F0KFsnc2NoZW1hJ10pO1xyXG5cclxuICAgICAgcmVzb2x2ZWQgPSByZXNvbHZlU2NoZW1hKHJlc29sdmVkLnNjaGVtYSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJlc29sdmVkO1xyXG4gIH07XHJcblxyXG4gIHZhciB0eXBlID0gc2NoZW1hLnR5cGU7XHJcbiAgdmFyIGFsbG93RW1wdHlWYWx1ZTtcclxuXHJcbiAgaWYgKCF0eXBlKSB7XHJcbiAgICBpZiAoIXNjaGVtYS5zY2hlbWEpIHtcclxuICAgICAgaWYgKHBhdGhbcGF0aC5sZW5ndGggLSAyXSA9PT0gJ3Jlc3BvbnNlcycpIHtcclxuICAgICAgICB0eXBlID0gJ3ZvaWQnO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHR5cGUgPSAnb2JqZWN0JztcclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgc2NoZW1hID0gcmVzb2x2ZVNjaGVtYShzY2hlbWEpO1xyXG4gICAgICB0eXBlID0gc2NoZW1hLnR5cGUgfHwgJ29iamVjdCc7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhbGxvd0VtcHR5VmFsdWUgPSBzY2hlbWEgPyBzY2hlbWEuYWxsb3dFbXB0eVZhbHVlID09PSB0cnVlIDogZmFsc2U7XHJcblxyXG4gIHRyeSB7XHJcbiAgICAvLyBBbHdheXMgcGVyZm9ybSB0aGlzIGNoZWNrIGV2ZW4gaWYgdGhlcmUgaXMgbm8gdmFsdWVcclxuICAgIGlmICh0eXBlID09PSAnYXJyYXknKSB7XHJcbiAgICAgIHZhbGlkYXRlQXJyYXlUeXBlKHNjaGVtYSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGVmYXVsdCB0byBkZWZhdWx0IHZhbHVlIGlmIG5lY2Vzc2FyeVxyXG4gICAgaWYgKF8uaXNVbmRlZmluZWQodmFsKSkge1xyXG4gICAgICB2YWwgPSB2ZXJzaW9uID09PSAnMS4yJyA/IHNjaGVtYS5kZWZhdWx0VmFsdWUgOiBzY2hlbWEuZGVmYXVsdDtcclxuXHJcbiAgICAgIHBhdGggPSBwYXRoLmNvbmNhdChbdmVyc2lvbiA9PT0gJzEuMicgPyAnZGVmYXVsdFZhbHVlJyA6ICdkZWZhdWx0J10pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIHRoZXJlIGlzIG5vIGV4cGxpY2l0IGRlZmF1bHQgdmFsdWUsIHJldHVybiBhcyBhbGwgdmFsaWRhdGlvbnMgd2lsbCBmYWlsXHJcbiAgICBpZiAoXy5pc1VuZGVmaW5lZCh2YWwpKSB7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodHlwZSA9PT0gJ2FycmF5Jykge1xyXG4gICAgICBfLmVhY2godmFsLCBmdW5jdGlvbiAodmFsLCBpbmRleCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKHZlcnNpb24sIHNjaGVtYS5pdGVtcyB8fCB7fSwgcGF0aC5jb25jYXQoaW5kZXgudG9TdHJpbmcoKSksIHZhbCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICBlcnIubWVzc2FnZSA9ICdWYWx1ZSBhdCBpbmRleCAnICsgaW5kZXggKyAnICcgKyAoZXJyLmNvZGUgPT09ICdJTlZBTElEX1RZUEUnID8gJ2lzICcgOiAnJykgK1xyXG4gICAgICAgICAgICBlcnIubWVzc2FnZS5jaGFyQXQoMCkudG9Mb3dlckNhc2UoKSArIGVyci5tZXNzYWdlLnN1YnN0cmluZygxKTtcclxuXHJcbiAgICAgICAgICB0aHJvdyBlcnI7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHZhbGlkYXRlVHlwZUFuZEZvcm1hdCh2ZXJzaW9uLCB2YWwsIHR5cGUsIHNjaGVtYS5mb3JtYXQsIGFsbG93RW1wdHlWYWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVmFsaWRhdGUgZW51bVxyXG4gICAgdmFsaWRhdGVFbnVtKHZhbCwgc2NoZW1hLmVudW0pO1xyXG5cclxuICAgIC8vIFZhbGlkYXRlIG1heGltdW1cclxuICAgIHZhbGlkYXRlTWF4aW11bSh2YWwsIHNjaGVtYS5tYXhpbXVtLCB0eXBlLCBzY2hlbWEuZXhjbHVzaXZlTWF4aW11bSk7XHJcblxyXG5cclxuICAgIC8vIFZhbGlkYXRlIG1heEl0ZW1zIChTd2FnZ2VyIDIuMCspXHJcbiAgICB2YWxpZGF0ZU1heEl0ZW1zKHZhbCwgc2NoZW1hLm1heEl0ZW1zKTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBtYXhMZW5ndGggKFN3YWdnZXIgMi4wKylcclxuICAgIHZhbGlkYXRlTWF4TGVuZ3RoKHZhbCwgc2NoZW1hLm1heExlbmd0aCk7XHJcblxyXG4gICAgLy8gVmFsaWRhdGUgbWF4UHJvcGVydGllcyAoU3dhZ2dlciAyLjArKVxyXG4gICAgdmFsaWRhdGVNYXhQcm9wZXJ0aWVzKHZhbCwgc2NoZW1hLm1heFByb3BlcnRpZXMpO1xyXG5cclxuICAgIC8vIFZhbGlkYXRlIG1pbmltdW1cclxuICAgIHZhbGlkYXRlTWluaW11bSh2YWwsIHNjaGVtYS5taW5pbXVtLCB0eXBlLCBzY2hlbWEuZXhjbHVzaXZlTWluaW11bSk7XHJcblxyXG4gICAgLy8gVmFsaWRhdGUgbWluSXRlbXNcclxuICAgIHZhbGlkYXRlTWluSXRlbXModmFsLCBzY2hlbWEubWluSXRlbXMpO1xyXG5cclxuICAgIC8vIFZhbGlkYXRlIG1pbkxlbmd0aCAoU3dhZ2dlciAyLjArKVxyXG4gICAgdmFsaWRhdGVNaW5MZW5ndGgodmFsLCBzY2hlbWEubWluTGVuZ3RoKTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBtaW5Qcm9wZXJ0aWVzIChTd2FnZ2VyIDIuMCspXHJcbiAgICB2YWxpZGF0ZU1pblByb3BlcnRpZXModmFsLCBzY2hlbWEubWluUHJvcGVydGllcyk7XHJcblxyXG4gICAgLy8gVmFsaWRhdGUgbXVsdGlwbGVPZiAoU3dhZ2dlciAyLjArKVxyXG4gICAgdmFsaWRhdGVNdWx0aXBsZU9mKHZhbCwgc2NoZW1hLm11bHRpcGxlT2YpO1xyXG5cclxuICAgIC8vIFZhbGlkYXRlIHBhdHRlcm4gKFN3YWdnZXIgMi4wKylcclxuICAgIHZhbGlkYXRlUGF0dGVybih2YWwsIHNjaGVtYS5wYXR0ZXJuKTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSB1bmlxdWVJdGVtc1xyXG4gICAgdmFsaWRhdGVVbmlxdWVJdGVtcyh2YWwsIHNjaGVtYS51bmlxdWVJdGVtcyk7XHJcbiAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICBlcnIucGF0aCA9IHBhdGg7XHJcblxyXG4gICAgdGhyb3cgZXJyO1xyXG4gIH1cclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHM9e1xyXG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvYXBpRGVjbGFyYXRpb24uanNvbiNcIixcclxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxyXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJzd2FnZ2VyVmVyc2lvblwiLCBcImJhc2VQYXRoXCIsIFwiYXBpc1wiIF0sXHJcbiAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwic3dhZ2dlclZlcnNpb25cIjogeyBcImVudW1cIjogWyBcIjEuMlwiIF0gfSxcclxuICAgICAgICBcImFwaVZlcnNpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxyXG4gICAgICAgIFwiYmFzZVBhdGhcIjoge1xyXG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIixcclxuICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXmh0dHBzPzovL1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInJlc291cmNlUGF0aFwiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiLFxyXG4gICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeL1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImFwaXNcIjoge1xyXG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxyXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcGlPYmplY3RcIiB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1vZGVsc1wiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIm1vZGVsc09iamVjdC5qc29uI1wiXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwicHJvZHVjZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxyXG4gICAgICAgIFwiY29uc3VtZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxyXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjogeyBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jXCIgfVxyXG4gICAgfSxcclxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXHJcbiAgICBcImRlZmluaXRpb25zXCI6IHtcclxuICAgICAgICBcImFwaU9iamVjdFwiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJwYXRoXCIsIFwib3BlcmF0aW9uc1wiIF0sXHJcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgICAgICBcInBhdGhcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpLXRlbXBsYXRlXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXi9cIlxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxyXG4gICAgICAgICAgICAgICAgXCJvcGVyYXRpb25zXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxyXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJvcGVyYXRpb25PYmplY3QuanNvbiNcIiB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWltZVR5cGVBcnJheVwiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXHJcbiAgICAgICAgICAgIFwiaXRlbXNcIjoge1xyXG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcIm1pbWUtdHlwZVwiXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG4iLCJtb2R1bGUuZXhwb3J0cz17XHJcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9hdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jXCIsXHJcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcclxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJvbmVPZlwiOiBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYmFzaWNBdXRoXCJcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcGlLZXlcIlxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlwiXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICBdXHJcbiAgICB9LFxyXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XHJcbiAgICAgICAgXCJiYXNpY0F1dGhcIjoge1xyXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcclxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYmFzaWNBdXRoXCIgXSB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiYXBpS2V5XCI6IHtcclxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiLCBcInBhc3NBc1wiLCBcImtleW5hbWVcIiBdLFxyXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJhcGlLZXlcIiBdIH0sXHJcbiAgICAgICAgICAgICAgICBcInBhc3NBc1wiOiB7IFwiZW51bVwiOiBbIFwiaGVhZGVyXCIsIFwicXVlcnlcIiBdIH0sXHJcbiAgICAgICAgICAgICAgICBcImtleW5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwib2F1dGgyXCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiwgXCJncmFudFR5cGVzXCIgXSxcclxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwib2F1dGgyXCIgXSB9LFxyXG4gICAgICAgICAgICAgICAgXCJzY29wZXNcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVcIiB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgXCJncmFudFR5cGVzXCI6IHsgXCIkcmVmXCI6IFwib2F1dGgyR3JhbnRUeXBlLmpzb24jXCIgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm9hdXRoMlNjb3BlXCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInNjb3BlXCIgXSxcclxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgIFwic2NvcGVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxyXG4gICAgICAgICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuIiwibW9kdWxlLmV4cG9ydHM9e1xyXG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvZGF0YVR5cGUuanNvbiNcIixcclxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxyXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkRhdGEgdHlwZSBhcyBkZXNjcmliZWQgYnkgdGhlIHNwZWNpZmljYXRpb24gKHZlcnNpb24gMS4yKVwiLFxyXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICBcIm9uZU9mXCI6IFtcclxuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVmVHlwZVwiIH0sXHJcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZvaWRUeXBlXCIgfSxcclxuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlVHlwZVwiIH0sXHJcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21vZGVsVHlwZVwiIH0sXHJcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FycmF5VHlwZVwiIH1cclxuICAgIF0sXHJcbiAgICBcImRlZmluaXRpb25zXCI6IHtcclxuICAgICAgICBcInJlZlR5cGVcIjoge1xyXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCIkcmVmXCIgXSxcclxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJ2b2lkVHlwZVwiOiB7XHJcbiAgICAgICAgICAgIFwiZW51bVwiOiBbIHsgXCJ0eXBlXCI6IFwidm9pZFwiIH0gXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtb2RlbFR5cGVcIjoge1xyXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcclxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcImJvb2xlYW5cIiwgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIsIFwic3RyaW5nXCIsIFwiYXJyYXlcIiBdXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInByaW1pdGl2ZVR5cGVcIjoge1xyXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcclxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bWJlclwiLCBcInN0cmluZ1wiIF1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXHJcbiAgICAgICAgICAgICAgICBcImRlZmF1bHRWYWx1ZVwiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjogeyBcInR5cGVcIjogWyBcImFycmF5XCIsIFwib2JqZWN0XCIsIFwibnVsbFwiIF0gfVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIFwiZW51bVwiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcclxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcclxuICAgICAgICAgICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXHJcbiAgICAgICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgXCJtaW5pbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcclxuICAgICAgICAgICAgICAgIFwibWF4aW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgICAgICAgXCJkZXBlbmRlbmNpZXNcIjoge1xyXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIFwib25lT2ZcIjogW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiIF0gfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiaW50MzJcIiwgXCJpbnQ2NFwiIF0gfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwibnVtYmVyXCIgXSB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJmbG9hdFwiLCBcImRvdWJsZVwiIF0gfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwic3RyaW5nXCIgXSB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJieXRlXCIsIFwiZGF0ZVwiLCBcImRhdGUtdGltZVwiIF1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgXCJlbnVtXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcInN0cmluZ1wiIF0gfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBcIm1pbmltdW1cIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiLCBcIm51bWJlclwiIF0gfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBcIm1heGltdW1cIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiLCBcIm51bWJlclwiIF0gfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJhcnJheVR5cGVcIjoge1xyXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIsIFwiaXRlbXNcIiBdLFxyXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJhcnJheVwiIF0gfSxcclxuICAgICAgICAgICAgICAgIFwiaXRlbXNcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaXRlbXNPYmplY3RcIiB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiaXRlbXNPYmplY3RcIjoge1xyXG4gICAgICAgICAgICBcIm9uZU9mXCI6IFtcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3JlZlR5cGVcIlxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBcImFsbE9mXCI6IFtcclxuICAgICAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVUeXBlXCJcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjoge30sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge31cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIF1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0iLCJtb2R1bGUuZXhwb3J0cz17XHJcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9kYXRhVHlwZUJhc2UuanNvbiNcIixcclxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxyXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkRhdGEgdHlwZSBmaWVsZHMgKHNlY3Rpb24gNC4zLjMpXCIsXHJcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgIFwib25lT2ZcIjogW1xyXG4gICAgICAgIHsgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiIF0gfSxcclxuICAgICAgICB7IFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdIH1cclxuICAgIF0sXHJcbiAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwidHlwZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXHJcbiAgICAgICAgXCIkcmVmXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcclxuICAgICAgICBcImZvcm1hdFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXHJcbiAgICAgICAgXCJkZWZhdWx0VmFsdWVcIjoge1xyXG4gICAgICAgICAgICBcIm5vdFwiOiB7IFwidHlwZVwiOiBbIFwiYXJyYXlcIiwgXCJvYmplY3RcIiwgXCJudWxsXCIgXSB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImVudW1cIjoge1xyXG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxyXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcclxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlLFxyXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDFcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWluaW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXHJcbiAgICAgICAgXCJtYXhpbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcclxuICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9pdGVtc09iamVjdFwiIH0sXHJcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XHJcbiAgICB9LFxyXG4gICAgXCJkZXBlbmRlbmNpZXNcIjoge1xyXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcclxuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIgXSB9LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiaW50MzJcIiwgXCJpbnQ2NFwiIF0gfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJudW1iZXJcIiBdIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJmbG9hdFwiLCBcImRvdWJsZVwiIF0gfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYnl0ZVwiLCBcImRhdGVcIiwgXCJkYXRlLXRpbWVcIiBdXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIF1cclxuICAgICAgICB9XHJcbiAgICB9LFxyXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XHJcbiAgICAgICAgXCJpdGVtc09iamVjdFwiOiB7XHJcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdLFxyXG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiJHJlZlwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJhbGxPZlwiOiBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjoge30sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge31cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIF1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuIiwibW9kdWxlLmV4cG9ydHM9e1xyXG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvaW5mb09iamVjdC5qc29uI1wiLFxyXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXHJcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiaW5mbyBvYmplY3QgKHNlY3Rpb24gNS4xLjMpXCIsXHJcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgIFwicmVxdWlyZWRcIjogWyBcInRpdGxlXCIsIFwiZGVzY3JpcHRpb25cIiBdLFxyXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcInRpdGxlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcclxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcclxuICAgICAgICBcInRlcm1zT2ZTZXJ2aWNlVXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcclxuICAgICAgICBcImNvbnRhY3RcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJlbWFpbFwiIH0sXHJcbiAgICAgICAgXCJsaWNlbnNlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcclxuICAgICAgICBcImxpY2Vuc2VVcmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9XHJcbiAgICB9LFxyXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxyXG59IiwibW9kdWxlLmV4cG9ydHM9e1xyXG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvbW9kZWxzT2JqZWN0Lmpzb24jXCIsXHJcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcclxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwiaWRcIiwgXCJwcm9wZXJ0aWVzXCIgXSxcclxuICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJpZFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXHJcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXHJcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Byb3BlcnR5T2JqZWN0XCIgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJzdWJUeXBlc1wiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXHJcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxyXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGlzY3JpbWluYXRvclwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cclxuICAgIH0sXHJcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XHJcbiAgICAgICAgXCJzdWJUeXBlc1wiOiBbIFwiZGlzY3JpbWluYXRvclwiIF1cclxuICAgIH0sXHJcbiAgICBcImRlZmluaXRpb25zXCI6IHtcclxuICAgICAgICBcInByb3BlcnR5T2JqZWN0XCI6IHtcclxuICAgICAgICAgICAgXCJhbGxPZlwiOiBbXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIlxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBdXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4iLCJtb2R1bGUuZXhwb3J0cz17XHJcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9vYXV0aDJHcmFudFR5cGUuanNvbiNcIixcclxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxyXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICBcIm1pblByb3BlcnRpZXNcIjogMSxcclxuICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJpbXBsaWNpdFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaW1wbGljaXRcIiB9LFxyXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbl9jb2RlXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hdXRob3JpemF0aW9uQ29kZVwiIH1cclxuICAgIH0sXHJcbiAgICBcImRlZmluaXRpb25zXCI6IHtcclxuICAgICAgICBcImltcGxpY2l0XCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcImxvZ2luRW5kcG9pbnRcIiBdLFxyXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgICAgICAgICAgXCJsb2dpbkVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9sb2dpbkVuZHBvaW50XCIgfSxcclxuICAgICAgICAgICAgICAgIFwidG9rZW5OYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImF1dGhvcml6YXRpb25Db2RlXCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInRva2VuRW5kcG9pbnRcIiwgXCJ0b2tlblJlcXVlc3RFbmRwb2ludFwiIF0sXHJcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgICAgICBcInRva2VuRW5kcG9pbnRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Rva2VuRW5kcG9pbnRcIiB9LFxyXG4gICAgICAgICAgICAgICAgXCJ0b2tlblJlcXVlc3RFbmRwb2ludFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdG9rZW5SZXF1ZXN0RW5kcG9pbnRcIiB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibG9naW5FbmRwb2ludFwiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ1cmxcIiBdLFxyXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwidG9rZW5FbmRwb2ludFwiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ1cmxcIiBdLFxyXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxyXG4gICAgICAgICAgICAgICAgXCJ0b2tlbk5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwidG9rZW5SZXF1ZXN0RW5kcG9pbnRcIjoge1xyXG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcclxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgIFwidXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcclxuICAgICAgICAgICAgICAgIFwiY2xpZW50SWROYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcclxuICAgICAgICAgICAgICAgIFwiY2xpZW50U2VjcmV0TmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufSIsIm1vZHVsZS5leHBvcnRzPXtcclxuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL29wZXJhdGlvbk9iamVjdC5qc29uI1wiLFxyXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXHJcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgIFwiYWxsT2ZcIjogW1xyXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCIgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcIm1ldGhvZFwiLCBcIm5pY2tuYW1lXCIsIFwicGFyYW1ldGVyc1wiIF0sXHJcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgICAgICBcIm1ldGhvZFwiOiB7IFwiZW51bVwiOiBbIFwiR0VUXCIsIFwiSEVBRFwiLCBcIlBPU1RcIiwgXCJQVVRcIiwgXCJQQVRDSFwiLCBcIkRFTEVURVwiLCBcIk9QVElPTlNcIiBdIH0sXHJcbiAgICAgICAgICAgICAgICBcInN1bW1hcnlcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJtYXhMZW5ndGhcIjogMTIwIH0sXHJcbiAgICAgICAgICAgICAgICBcIm5vdGVzXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcclxuICAgICAgICAgICAgICAgIFwibmlja25hbWVcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl5bYS16QS1aMC05X10rJFwiXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiYXV0aG9yaXphdGlvbk9iamVjdC5qc29uIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZVwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgXCJwYXJhbWV0ZXJzXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxyXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJwYXJhbWV0ZXJPYmplY3QuanNvbiNcIiB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgXCJyZXNwb25zZU1lc3NhZ2VzXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxyXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlTWVzc2FnZU9iamVjdFwifVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIFwicHJvZHVjZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxyXG4gICAgICAgICAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXHJcbiAgICAgICAgICAgICAgICBcImRlcHJlY2F0ZWRcIjogeyBcImVudW1cIjogWyBcInRydWVcIiwgXCJmYWxzZVwiIF0gfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgXSxcclxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xyXG4gICAgICAgIFwicmVzcG9uc2VNZXNzYWdlT2JqZWN0XCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcImNvZGVcIiwgXCJtZXNzYWdlXCIgXSxcclxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgIFwiY29kZVwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmZjMjYxNnNlY3Rpb24xMFwiIH0sXHJcbiAgICAgICAgICAgICAgICBcIm1lc3NhZ2VcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxyXG4gICAgICAgICAgICAgICAgXCJyZXNwb25zZU1vZGVsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInJmYzI2MTZzZWN0aW9uMTBcIjoge1xyXG4gICAgICAgICAgICBcInR5cGVcIjogXCJpbnRlZ2VyXCIsXHJcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAxMDAsXHJcbiAgICAgICAgICAgIFwibWF4aW11bVwiOiA2MDAsXHJcbiAgICAgICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB0cnVlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1pbWVUeXBlQXJyYXlcIjoge1xyXG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxyXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHtcclxuICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJtaW1lLXR5cGVcIlxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuIiwibW9kdWxlLmV4cG9ydHM9e1xyXG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcGFyYW1ldGVyT2JqZWN0Lmpzb24jXCIsXHJcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcclxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgXCJhbGxPZlwiOiBbXHJcbiAgICAgICAgeyBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIiB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwicGFyYW1UeXBlXCIsIFwibmFtZVwiIF0sXHJcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgICAgICBcInBhcmFtVHlwZVwiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJwYXRoXCIsIFwicXVlcnlcIiwgXCJib2R5XCIsIFwiaGVhZGVyXCIsIFwiZm9ybVwiIF1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBcIm5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxyXG4gICAgICAgICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXHJcbiAgICAgICAgICAgICAgICBcInJlcXVpcmVkXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH0sXHJcbiAgICAgICAgICAgICAgICBcImFsbG93TXVsdGlwbGVcIjogeyBcInR5cGVcIjogXCJib29sZWFuXCIgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJ0eXBlIEZpbGUgcmVxdWlyZXMgc3BlY2lhbCBwYXJhbVR5cGUgYW5kIGNvbnN1bWVzXCIsXHJcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwibm90XCI6IHsgXCJlbnVtXCI6IFsgXCJGaWxlXCIgXSB9IH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiRmlsZVwiIF0gfSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgXCJwYXJhbVR5cGVcIjogeyBcImVudW1cIjogWyBcImZvcm1cIiBdIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiY29uc3VtZXNcIjogeyBcImVudW1cIjogWyBcIm11bHRpcGFydC9mb3JtLWRhdGFcIiBdIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIF1cclxuICAgICAgICB9XHJcbiAgICBdXHJcbn1cclxuIiwibW9kdWxlLmV4cG9ydHM9e1xyXG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24jXCIsXHJcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcclxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwic3dhZ2dlclZlcnNpb25cIiwgXCJhcGlzXCIgXSxcclxuICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJzd2FnZ2VyVmVyc2lvblwiOiB7IFwiZW51bVwiOiBbIFwiMS4yXCIgXSB9LFxyXG4gICAgICAgIFwiYXBpc1wiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXHJcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJyZXNvdXJjZU9iamVjdC5qc29uI1wiIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiYXBpVmVyc2lvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXHJcbiAgICAgICAgXCJpbmZvXCI6IHsgXCIkcmVmXCI6IFwiaW5mb09iamVjdC5qc29uI1wiIH0sXHJcbiAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7IFwiJHJlZlwiOiBcImF1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIiB9XHJcbiAgICB9XHJcbn1cclxuIiwibW9kdWxlLmV4cG9ydHM9e1xyXG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcmVzb3VyY2VPYmplY3QuanNvbiNcIixcclxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxyXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJwYXRoXCIgXSxcclxuICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJwYXRoXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcclxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxyXG4gICAgfSxcclxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcclxufSIsIm1vZHVsZS5leHBvcnRzPXtcclxuICBcInRpdGxlXCI6IFwiQSBKU09OIFNjaGVtYSBmb3IgU3dhZ2dlciAyLjAgQVBJLlwiLFxyXG4gIFwiaWRcIjogXCJodHRwOi8vc3dhZ2dlci5pby92Mi9zY2hlbWEuanNvbiNcIixcclxuICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcclxuICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICBcInJlcXVpcmVkXCI6IFtcclxuICAgIFwic3dhZ2dlclwiLFxyXG4gICAgXCJpbmZvXCIsXHJcbiAgICBcInBhdGhzXCJcclxuICBdLFxyXG4gIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXHJcbiAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XHJcbiAgICBcIl54LVwiOiB7XHJcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcclxuICAgIH1cclxuICB9LFxyXG4gIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICBcInN3YWdnZXJcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgXCJlbnVtXCI6IFtcclxuICAgICAgICBcIjIuMFwiXHJcbiAgICAgIF0sXHJcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgU3dhZ2dlciB2ZXJzaW9uIG9mIHRoaXMgZG9jdW1lbnQuXCJcclxuICAgIH0sXHJcbiAgICBcImluZm9cIjoge1xyXG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2luZm9cIlxyXG4gICAgfSxcclxuICAgIFwiaG9zdFwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICBcInBhdHRlcm5cIjogXCJeW157fS8gOlxcXFxcXFxcXSsoPzo6XFxcXGQrKT8kXCIsXHJcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgaG9zdCAobmFtZSBvciBpcCkgb2YgdGhlIEFQSS4gRXhhbXBsZTogJ3N3YWdnZXIuaW8nXCJcclxuICAgIH0sXHJcbiAgICBcImJhc2VQYXRoXCI6IHtcclxuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgIFwicGF0dGVyblwiOiBcIl4vXCIsXHJcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgYmFzZSBwYXRoIHRvIHRoZSBBUEkuIEV4YW1wbGU6ICcvYXBpJy5cIlxyXG4gICAgfSxcclxuICAgIFwic2NoZW1lc1wiOiB7XHJcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxyXG4gICAgfSxcclxuICAgIFwiY29uc3VtZXNcIjoge1xyXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgYWNjZXB0ZWQgYnkgdGhlIEFQSS5cIixcclxuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcclxuICAgIH0sXHJcbiAgICBcInByb2R1Y2VzXCI6IHtcclxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgbGlzdCBvZiBNSU1FIHR5cGVzIHRoZSBBUEkgY2FuIHByb2R1Y2UuXCIsXHJcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXHJcbiAgICB9LFxyXG4gICAgXCJwYXRoc1wiOiB7XHJcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0aHNcIlxyXG4gICAgfSxcclxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xyXG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmluaXRpb25zXCJcclxuICAgIH0sXHJcbiAgICBcInBhcmFtZXRlcnNcIjoge1xyXG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlckRlZmluaXRpb25zXCJcclxuICAgIH0sXHJcbiAgICBcInJlc3BvbnNlc1wiOiB7XHJcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VEZWZpbml0aW9uc1wiXHJcbiAgICB9LFxyXG4gICAgXCJzZWN1cml0eVwiOiB7XHJcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2VjdXJpdHlcIlxyXG4gICAgfSxcclxuICAgIFwic2VjdXJpdHlEZWZpbml0aW9uc1wiOiB7XHJcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2VjdXJpdHlEZWZpbml0aW9uc1wiXHJcbiAgICB9LFxyXG4gICAgXCJ0YWdzXCI6IHtcclxuICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcclxuICAgICAgXCJpdGVtc1wiOiB7XHJcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90YWdcIlxyXG4gICAgICB9LFxyXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcclxuICAgIH0sXHJcbiAgICBcImV4dGVybmFsRG9jc1wiOiB7XHJcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcclxuICAgIH1cclxuICB9LFxyXG4gIFwiZGVmaW5pdGlvbnNcIjoge1xyXG4gICAgXCJpbmZvXCI6IHtcclxuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJHZW5lcmFsIGluZm9ybWF0aW9uIGFib3V0IHRoZSBBUEkuXCIsXHJcbiAgICAgIFwicmVxdWlyZWRcIjogW1xyXG4gICAgICAgIFwidmVyc2lvblwiLFxyXG4gICAgICAgIFwidGl0bGVcIlxyXG4gICAgICBdLFxyXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxyXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwidGl0bGVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSB1bmlxdWUgYW5kIHByZWNpc2UgdGl0bGUgb2YgdGhlIEFQSS5cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJ2ZXJzaW9uXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgc2VtYW50aWMgdmVyc2lvbiBudW1iZXIgb2YgdGhlIEFQSS5cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxvbmdlciBkZXNjcmlwdGlvbiBvZiB0aGUgQVBJLiBTaG91bGQgYmUgZGlmZmVyZW50IGZyb20gdGhlIHRpdGxlLiAgR2l0SHViIEZsYXZvcmVkIE1hcmtkb3duIGlzIGFsbG93ZWQuXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwidGVybXNPZlNlcnZpY2VcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIHRlcm1zIG9mIHNlcnZpY2UgZm9yIHRoZSBBUEkuXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiY29udGFjdFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbnRhY3RcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJsaWNlbnNlXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbGljZW5zZVwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgXCJjb250YWN0XCI6IHtcclxuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJDb250YWN0IGluZm9ybWF0aW9uIGZvciB0aGUgb3duZXJzIG9mIHRoZSBBUEkuXCIsXHJcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXHJcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJuYW1lXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBpZGVudGlmeWluZyBuYW1lIG9mIHRoZSBjb250YWN0IHBlcnNvbi9vcmdhbml6YXRpb24uXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwidXJsXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBVUkwgcG9pbnRpbmcgdG8gdGhlIGNvbnRhY3QgaW5mb3JtYXRpb24uXCIsXHJcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImVtYWlsXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBlbWFpbCBhZGRyZXNzIG9mIHRoZSBjb250YWN0IHBlcnNvbi9vcmdhbml6YXRpb24uXCIsXHJcbiAgICAgICAgICBcImZvcm1hdFwiOiBcImVtYWlsXCJcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiXngtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBcImxpY2Vuc2VcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJyZXF1aXJlZFwiOiBbXHJcbiAgICAgICAgXCJuYW1lXCJcclxuICAgICAgXSxcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIm5hbWVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIGxpY2Vuc2UgdHlwZS4gSXQncyBlbmNvdXJhZ2VkIHRvIHVzZSBhbiBPU0kgY29tcGF0aWJsZSBsaWNlbnNlLlwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInVybFwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgVVJMIHBvaW50aW5nIHRvIHRoZSBsaWNlbnNlLlwiLFxyXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJeeC1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIFwicGF0aHNcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlJlbGF0aXZlIHBhdGhzIHRvIHRoZSBpbmRpdmlkdWFsIGVuZHBvaW50cy4gVGhleSBtdXN0IGJlIHJlbGF0aXZlIHRvIHRoZSAnYmFzZVBhdGgnLlwiLFxyXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIl4vXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0aEl0ZW1cIlxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxyXG4gICAgfSxcclxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxyXG4gICAgICB9LFxyXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiT25lIG9yIG1vcmUgSlNPTiBvYmplY3RzIGRlc2NyaWJpbmcgdGhlIHNjaGVtYXMgYmVpbmcgY29uc3VtZWQgYW5kIHByb2R1Y2VkIGJ5IHRoZSBBUEkuXCJcclxuICAgIH0sXHJcbiAgICBcInBhcmFtZXRlckRlZmluaXRpb25zXCI6IHtcclxuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyXCJcclxuICAgICAgfSxcclxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIk9uZSBvciBtb3JlIEpTT04gcmVwcmVzZW50YXRpb25zIGZvciBwYXJhbWV0ZXJzXCJcclxuICAgIH0sXHJcbiAgICBcInJlc3BvbnNlRGVmaW5pdGlvbnNcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVwiXHJcbiAgICAgIH0sXHJcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJPbmUgb3IgbW9yZSBKU09OIHJlcHJlc2VudGF0aW9ucyBmb3IgcGFyYW1ldGVyc1wiXHJcbiAgICB9LFxyXG4gICAgXCJleHRlcm5hbERvY3NcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcImluZm9ybWF0aW9uIGFib3V0IGV4dGVybmFsIGRvY3VtZW50YXRpb25cIixcclxuICAgICAgXCJyZXF1aXJlZFwiOiBbXHJcbiAgICAgICAgXCJ1cmxcIlxyXG4gICAgICBdLFxyXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwidXJsXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJeeC1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIFwiZXhhbXBsZXNcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB0cnVlXHJcbiAgICB9LFxyXG4gICAgXCJtaW1lVHlwZVwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIE1JTUUgdHlwZSBvZiB0aGUgSFRUUCBtZXNzYWdlLlwiXHJcbiAgICB9LFxyXG4gICAgXCJvcGVyYXRpb25cIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJyZXF1aXJlZFwiOiBbXHJcbiAgICAgICAgXCJyZXNwb25zZXNcIlxyXG4gICAgICBdLFxyXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxyXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwidGFnc1wiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxyXG4gICAgICAgICAgXCJpdGVtc1wiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInN1bW1hcnlcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBzdW1tYXJ5IG9mIHRoZSBvcGVyYXRpb24uXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsb25nZXIgZGVzY3JpcHRpb24gb2YgdGhlIG9wZXJhdGlvbiwgR2l0SHViIEZsYXZvcmVkIE1hcmtkb3duIGlzIGFsbG93ZWQuXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwib3BlcmF0aW9uSWRcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSB1bmlxdWUgaWRlbnRpZmllciBvZiB0aGUgb3BlcmF0aW9uLlwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInByb2R1Y2VzXCI6IHtcclxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBwcm9kdWNlLlwiLFxyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiY29uc3VtZXNcIjoge1xyXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgbGlzdCBvZiBNSU1FIHR5cGVzIHRoZSBBUEkgY2FuIGNvbnN1bWUuXCIsXHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJwYXJhbWV0ZXJzXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyc0xpc3RcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJyZXNwb25zZXNcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZXNcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJzY2hlbWVzXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJkZXByZWNhdGVkXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJzZWN1cml0eVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NlY3VyaXR5XCJcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBcInBhdGhJdGVtXCI6IHtcclxuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXHJcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiXngtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCIkcmVmXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImdldFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInB1dFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInBvc3RcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJkZWxldGVcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJvcHRpb25zXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiaGVhZFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInBhdGNoXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwicGFyYW1ldGVyc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlcnNMaXN0XCJcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBcInJlc3BvbnNlc1wiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUmVzcG9uc2Ugb2JqZWN0cyBuYW1lcyBjYW4gZWl0aGVyIGJlIGFueSB2YWxpZCBIVFRQIHN0YXR1cyBjb2RlIG9yICdkZWZhdWx0Jy5cIixcclxuICAgICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IDEsXHJcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXHJcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiXihbMC05XXszfSkkfF4oZGVmYXVsdCkkXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VWYWx1ZVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBcIm5vdFwiOiB7XHJcbiAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgIFwiXngtXCI6IHtcclxuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIFwicmVzcG9uc2VWYWx1ZVwiOiB7XHJcbiAgICAgIFwib25lT2ZcIjogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9qc29uUmVmZXJlbmNlXCJcclxuICAgICAgICB9XHJcbiAgICAgIF1cclxuICAgIH0sXHJcbiAgICBcInJlc3BvbnNlXCI6IHtcclxuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgIFwicmVxdWlyZWRcIjogW1xyXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIlxyXG4gICAgICBdLFxyXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwic2NoZW1hXCI6IHtcclxuICAgICAgICAgIFwib25lT2ZcIjogW1xyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9maWxlU2NoZW1hXCJcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJoZWFkZXJzXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyc1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImV4YW1wbGVzXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhhbXBsZXNcIlxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJeeC1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIFwiaGVhZGVyc1wiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2hlYWRlclwiXHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBcImhlYWRlclwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxyXG4gICAgICBcInJlcXVpcmVkXCI6IFtcclxuICAgICAgICBcInR5cGVcIlxyXG4gICAgICBdLFxyXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwidHlwZVwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZW51bVwiOiBbXHJcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXHJcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXHJcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxyXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgXCJhcnJheVwiXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImZvcm1hdFwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJpdGVtc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0XCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWluaW11bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInBhdHRlcm5cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZW51bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgXCJ2ZW5kb3JFeHRlbnNpb25cIjoge1xyXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQW55IHByb3BlcnR5IHN0YXJ0aW5nIHdpdGggeC0gaXMgdmFsaWQuXCIsXHJcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogdHJ1ZSxcclxuICAgICAgXCJhZGRpdGlvbmFsSXRlbXNcIjogdHJ1ZVxyXG4gICAgfSxcclxuICAgIFwiYm9keVBhcmFtZXRlclwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICBcInJlcXVpcmVkXCI6IFtcclxuICAgICAgICBcIm5hbWVcIixcclxuICAgICAgICBcImluXCIsXHJcbiAgICAgICAgXCJzY2hlbWFcIlxyXG4gICAgICBdLFxyXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0SHViIEZsYXZvcmVkIE1hcmtkb3duIGlzIGFsbG93ZWQuXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibmFtZVwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImluXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXHJcbiAgICAgICAgICBcImVudW1cIjogW1xyXG4gICAgICAgICAgICBcImJvZHlcIlxyXG4gICAgICAgICAgXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcclxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJzY2hlbWFcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxyXG4gICAgfSxcclxuICAgIFwiaGVhZGVyUGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJeeC1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcInJlcXVpcmVkXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxyXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImluXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXHJcbiAgICAgICAgICBcImVudW1cIjogW1xyXG4gICAgICAgICAgICBcImhlYWRlclwiXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdEh1YiBGbGF2b3JlZCBNYXJrZG93biBpcyBhbGxvd2VkLlwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm5hbWVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJ0eXBlXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJlbnVtXCI6IFtcclxuICAgICAgICAgICAgXCJzdHJpbmdcIixcclxuICAgICAgICAgICAgXCJudW1iZXJcIixcclxuICAgICAgICAgICAgXCJib29sZWFuXCIsXHJcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxyXG4gICAgICAgICAgICBcImFycmF5XCJcclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIml0ZW1zXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1heGltdW1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwicGF0dGVyblwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJlbnVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBcInF1ZXJ5UGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJeeC1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcInJlcXVpcmVkXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxyXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImluXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXHJcbiAgICAgICAgICBcImVudW1cIjogW1xyXG4gICAgICAgICAgICBcInF1ZXJ5XCJcclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0SHViIEZsYXZvcmVkIE1hcmtkb3duIGlzIGFsbG93ZWQuXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibmFtZVwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImFsbG93RW1wdHlWYWx1ZVwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXHJcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2UsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiYWxsb3dzIHNlbmRpbmcgYSBwYXJhbWV0ZXIgYnkgbmFtZSBvbmx5IG9yIHdpdGggYW4gZW1wdHkgdmFsdWUuXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwidHlwZVwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZW51bVwiOiBbXHJcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXHJcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXHJcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxyXG4gICAgICAgICAgICBcImludGVnZXJcIixcclxuICAgICAgICAgICAgXCJhcnJheVwiXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImZvcm1hdFwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJpdGVtc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWluaW11bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInBhdHRlcm5cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZW51bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgXCJmb3JtRGF0YVBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XHJcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXHJcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiXngtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcclxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJpblwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxyXG4gICAgICAgICAgXCJlbnVtXCI6IFtcclxuICAgICAgICAgICAgXCJmb3JtRGF0YVwiXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdEh1YiBGbGF2b3JlZCBNYXJrZG93biBpcyBhbGxvd2VkLlwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm5hbWVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJhbGxvd0VtcHR5VmFsdWVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxyXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlLFxyXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcImFsbG93cyBzZW5kaW5nIGEgcGFyYW1ldGVyIGJ5IG5hbWUgb25seSBvciB3aXRoIGFuIGVtcHR5IHZhbHVlLlwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInR5cGVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImVudW1cIjogW1xyXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgICBcIm51bWJlclwiLFxyXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXHJcbiAgICAgICAgICAgIFwiYXJyYXlcIixcclxuICAgICAgICAgICAgXCJmaWxlXCJcclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIml0ZW1zXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRXaXRoTXVsdGlcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1heGltdW1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwicGF0dGVyblwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJlbnVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBcInBhdGhQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xyXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxyXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBcInJlcXVpcmVkXCI6IFtcclxuICAgICAgICBcInJlcXVpcmVkXCJcclxuICAgICAgXSxcclxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcInJlcXVpcmVkXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgIFwiZW51bVwiOiBbXHJcbiAgICAgICAgICAgIHRydWVcclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJpblwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxyXG4gICAgICAgICAgXCJlbnVtXCI6IFtcclxuICAgICAgICAgICAgXCJwYXRoXCJcclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0SHViIEZsYXZvcmVkIE1hcmtkb3duIGlzIGFsbG93ZWQuXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibmFtZVwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInR5cGVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImVudW1cIjogW1xyXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgICBcIm51bWJlclwiLFxyXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXHJcbiAgICAgICAgICAgIFwiYXJyYXlcIlxyXG4gICAgICAgICAgXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJmb3JtYXRcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiaXRlbXNcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImRlZmF1bHRcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWF4aW11bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1pbmltdW1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImVudW1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIFwibm9uQm9keVBhcmFtZXRlclwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICBcInJlcXVpcmVkXCI6IFtcclxuICAgICAgICBcIm5hbWVcIixcclxuICAgICAgICBcImluXCIsXHJcbiAgICAgICAgXCJ0eXBlXCJcclxuICAgICAgXSxcclxuICAgICAgXCJvbmVPZlwiOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9oZWFkZXJQYXJhbWV0ZXJTdWJTY2hlbWFcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9mb3JtRGF0YVBhcmFtZXRlclN1YlNjaGVtYVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3F1ZXJ5UGFyYW1ldGVyU3ViU2NoZW1hXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0aFBhcmFtZXRlclN1YlNjaGVtYVwiXHJcbiAgICAgICAgfVxyXG4gICAgICBdXHJcbiAgICB9LFxyXG4gICAgXCJwYXJhbWV0ZXJcIjoge1xyXG4gICAgICBcIm9uZU9mXCI6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2JvZHlQYXJhbWV0ZXJcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9ub25Cb2R5UGFyYW1ldGVyXCJcclxuICAgICAgICB9XHJcbiAgICAgIF1cclxuICAgIH0sXHJcbiAgICBcInNjaGVtYVwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBkZXRlcm1pbmlzdGljIHZlcnNpb24gb2YgYSBKU09OIFNjaGVtYSBvYmplY3QuXCIsXHJcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiXngtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCIkcmVmXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImZvcm1hdFwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJ0aXRsZVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90aXRsZVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2Rlc2NyaXB0aW9uXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZWZhdWx0XCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tdWx0aXBsZU9mXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWF4aW11bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tYXhpbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNYXhpbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWluaW11bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9taW5pbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNaW5pbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwicGF0dGVyblwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9wYXR0ZXJuXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3VuaXF1ZUl0ZW1zXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWF4UHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWluUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvc3RyaW5nQXJyYXlcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJlbnVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2VudW1cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICBcImFueU9mXCI6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInR5cGVcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdHlwZVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIml0ZW1zXCI6IHtcclxuICAgICAgICAgIFwiYW55T2ZcIjogW1xyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcclxuICAgICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXHJcbiAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XHJcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImFsbE9mXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXHJcbiAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXHJcbiAgICAgICAgICBcIml0ZW1zXCI6IHtcclxuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBcImRlZmF1bHRcIjoge31cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGlzY3JpbWluYXRvclwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJyZWFkT25seVwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXHJcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwieG1sXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMveG1sXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZXhhbXBsZVwiOiB7fVxyXG4gICAgICB9LFxyXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXHJcbiAgICB9LFxyXG4gICAgXCJmaWxlU2NoZW1hXCI6IHtcclxuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGRldGVybWluaXN0aWMgdmVyc2lvbiBvZiBhIEpTT04gU2NoZW1hIG9iamVjdC5cIixcclxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJeeC1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgXCJyZXF1aXJlZFwiOiBbXHJcbiAgICAgICAgXCJ0eXBlXCJcclxuICAgICAgXSxcclxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcImZvcm1hdFwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJ0aXRsZVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90aXRsZVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2Rlc2NyaXB0aW9uXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZWZhdWx0XCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwidHlwZVwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZW51bVwiOiBbXHJcbiAgICAgICAgICAgIFwiZmlsZVwiXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInJlYWRPbmx5XCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJleHRlcm5hbERvY3NcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJleGFtcGxlXCI6IHt9XHJcbiAgICAgIH0sXHJcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcclxuICAgIH0sXHJcbiAgICBcInByaW1pdGl2ZXNJdGVtc1wiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxyXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwidHlwZVwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZW51bVwiOiBbXHJcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXHJcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXHJcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxyXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgXCJhcnJheVwiXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImZvcm1hdFwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJpdGVtc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0XCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWluaW11bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInBhdHRlcm5cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZW51bVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgXCJzZWN1cml0eVwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXHJcbiAgICAgIFwiaXRlbXNcIjoge1xyXG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2VjdXJpdHlSZXF1aXJlbWVudFwiXHJcbiAgICAgIH0sXHJcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxyXG4gICAgfSxcclxuICAgIFwic2VjdXJpdHlSZXF1aXJlbWVudFwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxyXG4gICAgICAgIFwiaXRlbXNcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgXCJ4bWxcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIm5hbWVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibmFtZXNwYWNlXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInByZWZpeFwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJhdHRyaWJ1dGVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxyXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIndyYXBwZWRcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxyXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgXCJ0YWdcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgXCJyZXF1aXJlZFwiOiBbXHJcbiAgICAgICAgXCJuYW1lXCJcclxuICAgICAgXSxcclxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIm5hbWVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiXngtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBcInNlY3VyaXR5RGVmaW5pdGlvbnNcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJvbmVPZlwiOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYmFzaWNBdXRoZW50aWNhdGlvblNlY3VyaXR5XCJcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXBpS2V5U2VjdXJpdHlcIlxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJJbXBsaWNpdFNlY3VyaXR5XCJcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyUGFzc3dvcmRTZWN1cml0eVwiXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMkFwcGxpY2F0aW9uU2VjdXJpdHlcIlxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJBY2Nlc3NDb2RlU2VjdXJpdHlcIlxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIF1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIFwiYmFzaWNBdXRoZW50aWNhdGlvblNlY3VyaXR5XCI6IHtcclxuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXHJcbiAgICAgIFwicmVxdWlyZWRcIjogW1xyXG4gICAgICAgIFwidHlwZVwiXHJcbiAgICAgIF0sXHJcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJ0eXBlXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJlbnVtXCI6IFtcclxuICAgICAgICAgICAgXCJiYXNpY1wiXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgXCJhcGlLZXlTZWN1cml0eVwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxyXG4gICAgICBcInJlcXVpcmVkXCI6IFtcclxuICAgICAgICBcInR5cGVcIixcclxuICAgICAgICBcIm5hbWVcIixcclxuICAgICAgICBcImluXCJcclxuICAgICAgXSxcclxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcInR5cGVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImVudW1cIjogW1xyXG4gICAgICAgICAgICBcImFwaUtleVwiXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm5hbWVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiaW5cIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImVudW1cIjogW1xyXG4gICAgICAgICAgICBcImhlYWRlclwiLFxyXG4gICAgICAgICAgICBcInF1ZXJ5XCJcclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiXngtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBcIm9hdXRoMkltcGxpY2l0U2VjdXJpdHlcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgXCJyZXF1aXJlZFwiOiBbXHJcbiAgICAgICAgXCJ0eXBlXCIsXHJcbiAgICAgICAgXCJmbG93XCIsXHJcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCJcclxuICAgICAgXSxcclxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcInR5cGVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImVudW1cIjogW1xyXG4gICAgICAgICAgICBcIm9hdXRoMlwiXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImZsb3dcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImVudW1cIjogW1xyXG4gICAgICAgICAgICBcImltcGxpY2l0XCJcclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwic2NvcGVzXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgIFwiXngtXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBcIm9hdXRoMlBhc3N3b3JkU2VjdXJpdHlcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgXCJyZXF1aXJlZFwiOiBbXHJcbiAgICAgICAgXCJ0eXBlXCIsXHJcbiAgICAgICAgXCJmbG93XCIsXHJcbiAgICAgICAgXCJ0b2tlblVybFwiXHJcbiAgICAgIF0sXHJcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJ0eXBlXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJlbnVtXCI6IFtcclxuICAgICAgICAgICAgXCJvYXV0aDJcIlxyXG4gICAgICAgICAgXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJmbG93XCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJlbnVtXCI6IFtcclxuICAgICAgICAgICAgXCJwYXNzd29yZFwiXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInNjb3Blc1wiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3Blc1wiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInRva2VuVXJsXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJeeC1cIjoge1xyXG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIFwib2F1dGgyQXBwbGljYXRpb25TZWN1cml0eVwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxyXG4gICAgICBcInJlcXVpcmVkXCI6IFtcclxuICAgICAgICBcInR5cGVcIixcclxuICAgICAgICBcImZsb3dcIixcclxuICAgICAgICBcInRva2VuVXJsXCJcclxuICAgICAgXSxcclxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcInR5cGVcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImVudW1cIjogW1xyXG4gICAgICAgICAgICBcIm9hdXRoMlwiXHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImZsb3dcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImVudW1cIjogW1xyXG4gICAgICAgICAgICBcImFwcGxpY2F0aW9uXCJcclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwic2NvcGVzXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwidG9rZW5VcmxcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgXCJvYXV0aDJBY2Nlc3NDb2RlU2VjdXJpdHlcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcclxuICAgICAgXCJyZXF1aXJlZFwiOiBbXHJcbiAgICAgICAgXCJ0eXBlXCIsXHJcbiAgICAgICAgXCJmbG93XCIsXHJcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCIsXHJcbiAgICAgICAgXCJ0b2tlblVybFwiXHJcbiAgICAgIF0sXHJcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJ0eXBlXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJlbnVtXCI6IFtcclxuICAgICAgICAgICAgXCJvYXV0aDJcIlxyXG4gICAgICAgICAgXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJmbG93XCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgXCJlbnVtXCI6IFtcclxuICAgICAgICAgICAgXCJhY2Nlc3NDb2RlXCJcclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwic2NvcGVzXCI6IHtcclxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiOiB7XHJcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcclxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwidG9rZW5VcmxcIjoge1xyXG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcIl54LVwiOiB7XHJcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgXCJvYXV0aDJTY29wZXNcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcclxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIFwibWVkaWFUeXBlTGlzdFwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXHJcbiAgICAgIFwiaXRlbXNcIjoge1xyXG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVcIlxyXG4gICAgICB9LFxyXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcclxuICAgIH0sXHJcbiAgICBcInBhcmFtZXRlcnNMaXN0XCI6IHtcclxuICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcclxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBwYXJhbWV0ZXJzIG5lZWRlZCB0byBzZW5kIGEgdmFsaWQgQVBJIGNhbGwuXCIsXHJcbiAgICAgIFwiYWRkaXRpb25hbEl0ZW1zXCI6IGZhbHNlLFxyXG4gICAgICBcIml0ZW1zXCI6IHtcclxuICAgICAgICBcIm9uZU9mXCI6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJcIlxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9qc29uUmVmZXJlbmNlXCJcclxuICAgICAgICAgIH1cclxuICAgICAgICBdXHJcbiAgICAgIH0sXHJcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxyXG4gICAgfSxcclxuICAgIFwic2NoZW1lc0xpc3RcIjoge1xyXG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxyXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIHRyYW5zZmVyIHByb3RvY29sIG9mIHRoZSBBUEkuXCIsXHJcbiAgICAgIFwiaXRlbXNcIjoge1xyXG4gICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgIFwiZW51bVwiOiBbXHJcbiAgICAgICAgICBcImh0dHBcIixcclxuICAgICAgICAgIFwiaHR0cHNcIixcclxuICAgICAgICAgIFwid3NcIixcclxuICAgICAgICAgIFwid3NzXCJcclxuICAgICAgICBdXHJcbiAgICAgIH0sXHJcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxyXG4gICAgfSxcclxuICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICBcImVudW1cIjogW1xyXG4gICAgICAgIFwiY3N2XCIsXHJcbiAgICAgICAgXCJzc3ZcIixcclxuICAgICAgICBcInRzdlwiLFxyXG4gICAgICAgIFwicGlwZXNcIlxyXG4gICAgICBdLFxyXG4gICAgICBcImRlZmF1bHRcIjogXCJjc3ZcIlxyXG4gICAgfSxcclxuICAgIFwiY29sbGVjdGlvbkZvcm1hdFdpdGhNdWx0aVwiOiB7XHJcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICBcImVudW1cIjogW1xyXG4gICAgICAgIFwiY3N2XCIsXHJcbiAgICAgICAgXCJzc3ZcIixcclxuICAgICAgICBcInRzdlwiLFxyXG4gICAgICAgIFwicGlwZXNcIixcclxuICAgICAgICBcIm11bHRpXCJcclxuICAgICAgXSxcclxuICAgICAgXCJkZWZhdWx0XCI6IFwiY3N2XCJcclxuICAgIH0sXHJcbiAgICBcInRpdGxlXCI6IHtcclxuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdGl0bGVcIlxyXG4gICAgfSxcclxuICAgIFwiZGVzY3JpcHRpb25cIjoge1xyXG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZXNjcmlwdGlvblwiXHJcbiAgICB9LFxyXG4gICAgXCJkZWZhdWx0XCI6IHtcclxuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVmYXVsdFwiXHJcbiAgICB9LFxyXG4gICAgXCJtdWx0aXBsZU9mXCI6IHtcclxuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbXVsdGlwbGVPZlwiXHJcbiAgICB9LFxyXG4gICAgXCJtYXhpbXVtXCI6IHtcclxuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWF4aW11bVwiXHJcbiAgICB9LFxyXG4gICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcclxuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWF4aW11bVwiXHJcbiAgICB9LFxyXG4gICAgXCJtaW5pbXVtXCI6IHtcclxuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWluaW11bVwiXHJcbiAgICB9LFxyXG4gICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcclxuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWluaW11bVwiXHJcbiAgICB9LFxyXG4gICAgXCJtYXhMZW5ndGhcIjoge1xyXG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcclxuICAgIH0sXHJcbiAgICBcIm1pbkxlbmd0aFwiOiB7XHJcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXHJcbiAgICB9LFxyXG4gICAgXCJwYXR0ZXJuXCI6IHtcclxuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvcGF0dGVyblwiXHJcbiAgICB9LFxyXG4gICAgXCJtYXhJdGVtc1wiOiB7XHJcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxyXG4gICAgfSxcclxuICAgIFwibWluSXRlbXNcIjoge1xyXG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxyXG4gICAgfSxcclxuICAgIFwidW5pcXVlSXRlbXNcIjoge1xyXG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy91bmlxdWVJdGVtc1wiXHJcbiAgICB9LFxyXG4gICAgXCJlbnVtXCI6IHtcclxuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZW51bVwiXHJcbiAgICB9LFxyXG4gICAgXCJqc29uUmVmZXJlbmNlXCI6IHtcclxuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgIFwicmVxdWlyZWRcIjogW1xyXG4gICAgICAgIFwiJHJlZlwiXHJcbiAgICAgIF0sXHJcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXHJcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XHJcbiAgICAgICAgXCIkcmVmXCI6IHtcclxuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG59IiwibW9kdWxlLmV4cG9ydHM9e1xyXG4gICAgXCJpZFwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxyXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXHJcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiQ29yZSBzY2hlbWEgbWV0YS1zY2hlbWFcIixcclxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xyXG4gICAgICAgIFwic2NoZW1hQXJyYXlcIjoge1xyXG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxyXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXHJcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJwb3NpdGl2ZUludGVnZXJcIjoge1xyXG4gICAgICAgICAgICBcInR5cGVcIjogXCJpbnRlZ2VyXCIsXHJcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAwXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInBvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCI6IHtcclxuICAgICAgICAgICAgXCJhbGxPZlwiOiBbIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIiB9LCB7IFwiZGVmYXVsdFwiOiAwIH0gXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJzaW1wbGVUeXBlc1wiOiB7XHJcbiAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYXJyYXlcIiwgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bGxcIiwgXCJudW1iZXJcIiwgXCJvYmplY3RcIiwgXCJzdHJpbmdcIiBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInN0cmluZ0FycmF5XCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcclxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXHJcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcclxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXHJcbiAgICAgICAgfVxyXG4gICAgfSxcclxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICBcImlkXCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXHJcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiJHNjaGVtYVwiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInRpdGxlXCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xyXG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJkZWZhdWx0XCI6IHt9LFxyXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiLFxyXG4gICAgICAgICAgICBcIm1pbmltdW1cIjogMCxcclxuICAgICAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHRydWVcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwibWF4aW11bVwiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xyXG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXHJcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwibnVtYmVyXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1heExlbmd0aFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcclxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxyXG4gICAgICAgIFwicGF0dGVyblwiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInJlZ2V4XCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiYWRkaXRpb25hbEl0ZW1zXCI6IHtcclxuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXHJcbiAgICAgICAgICAgICAgICB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxyXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfVxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiaXRlbXNcIjoge1xyXG4gICAgICAgICAgICBcImFueU9mXCI6IFtcclxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH0sXHJcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9XHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcclxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXHJcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcclxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcIm1heFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXHJcbiAgICAgICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXHJcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc3RyaW5nQXJyYXlcIiB9LFxyXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xyXG4gICAgICAgICAgICBcImFueU9mXCI6IFtcclxuICAgICAgICAgICAgICAgIHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH0sXHJcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9XHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJkZWZpbml0aW9uc1wiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXHJcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfSxcclxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XHJcbiAgICAgICAgfSxcclxuICAgICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXHJcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfSxcclxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImRlcGVuZGVuY2llc1wiOiB7XHJcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxyXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcclxuICAgICAgICAgICAgICAgIFwiYW55T2ZcIjogW1xyXG4gICAgICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCIgfVxyXG4gICAgICAgICAgICAgICAgXVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICBcImVudW1cIjoge1xyXG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxyXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXHJcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJ0eXBlXCI6IHtcclxuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXHJcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2ltcGxlVHlwZXNcIiB9LFxyXG4gICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2ltcGxlVHlwZXNcIiB9LFxyXG4gICAgICAgICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcclxuICAgICAgICAgICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgXCJhbGxPZlwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9LFxyXG4gICAgICAgIFwiYW55T2ZcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfSxcclxuICAgICAgICBcIm9uZU9mXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH0sXHJcbiAgICAgICAgXCJub3RcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxyXG4gICAgfSxcclxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcclxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjogWyBcIm1heGltdW1cIiBdLFxyXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiBbIFwibWluaW11bVwiIF1cclxuICAgIH0sXHJcbiAgICBcImRlZmF1bHRcIjoge31cclxufVxyXG4iXX0=
