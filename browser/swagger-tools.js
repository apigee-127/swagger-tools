!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),(o.SwaggerTools||(o.SwaggerTools={})).specs=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

var _ = {
  cloneDeep: require('lodash.clonedeep'),
  difference: require('lodash.difference'),
  each: require('lodash.foreach'),
  isArray: require('lodash.isarray'),
  isPlainObject: require('lodash.isplainobject'),
  isUndefined: require('lodash.isundefined'),
  map: require('lodash.map'),
  reduce: require('lodash.reduce'),
  union: require('lodash.union'),
  uniq: require('lodash.uniq')
};
var jjv = require('jjv');
var jjve = require('jjve');
var md5 = require('spark-md5');
var traverse = require('traverse');
var helpers = require('./helpers');
var validators = require('./validators');

var draft04Json = require('../schemas/json-schema-draft-04.json');
var draft04Url = 'http://json-schema.org/draft-04/schema';
var jjvOptions = {
  checkRequired: true,
  removeAdditional: false,
  useDefault: false,
  useCoerce: false
};
var jjveOptions = {
  formatPath: false
};
var metadataCache = {};
var refToJsonPointer = helpers.refToJsonPointer;
var toJsonPointer = helpers.toJsonPointer;

var createValidator = function createValidator (spec, schemaNames) {
  var validator = jjv(jjvOptions);

  // Disable the 'uri' format checker as it's got issues: https://github.com/acornejo/jjv/issues/24
  validator.addFormat('uri', function() {
    return true;
  });

  validator.addSchema(draft04Url, draft04Json);

  // Compile the necessary schemas
  _.each(schemaNames, function (schemaName) {
    var clone = _.cloneDeep(spec.schemas[schemaName]);

    clone.id = schemaName;

    validator.addSchema(schemaName, clone);
  }.bind(this));

  validator.je = jjve(validator);

  return validator;
};

var createErrorOrWarning = function createErrorOrWarning (code, message, data, path, dest) {
  dest.push({
    code: code,
    message: message,
    data: data,
    path: path
  });
};

var createUnusedErrorOrWarning = function createUnusedErrorOrWarning (data, val, codeSuffix, msgPrefix, path, dest) {
  createErrorOrWarning('UNUSED_' + codeSuffix, msgPrefix + ' is defined but is not used: ' + val, data, path, dest);
};

var validateExist = function validateExist (data, val, codeSuffix, msgPrefix, path, dest) {
  if (!_.isUndefined(data) && data.indexOf(val) === -1) {
    createErrorOrWarning('UNRESOLVABLE_' + codeSuffix, msgPrefix + ' could not be resolved: ' + val, val, path, dest);
  }
};

var validateNoExist = function validateNoExist (data, val, codeSuffix, msgPrefix, path, dest) {
  if (!_.isUndefined(data) && data.indexOf(val) > -1) {
    createErrorOrWarning('DUPLICATE_' + codeSuffix, msgPrefix + ' already defined: ' + val, val, path, dest);
  }
};

var validateNoDuplicates = function validateNoDuplicates (data, codeSuffix, msgPrefix, path, dest) {
  var name = path[path.length - 1];

  if (!_.isUndefined(data) && data.length !== _.uniq(data).length) {
    createErrorOrWarning('DUPLICATE_' + codeSuffix, msgPrefix + ' ' + name + ' has duplicate items', data, path, dest);
  }
};

// TODO: Move this to a helper

var validateParameterConstraints = function validateParameterConstraints (spec, parameter, val, path, dest) {
  switch (spec.version) {
  case '1.2':
    // TODO: Make this work with parameters that have references

    // Validate the value type/format
    try {
      validators.validateTypeAndFormat(parameter.name, val,
                                       parameter.type === 'array' ? parameter.items.type : parameter.type,
                                       parameter.type === 'array' && parameter.items.format ?
                                         parameter.items.format :
                                         parameter.format);
    } catch (err) {
      // TODO: Update to notify of 'INVALID_FORMAT'
      createErrorOrWarning ('INVALID_TYPE', err.message, val, path, dest);
      return;
    }

    // Validate enum
    try {
      validators.validateEnum(parameter.name, val, parameter.enum);
    } catch (err) {
      createErrorOrWarning ('ENUM_MISMATCH', err.message, val, path, dest);
      return;
    }

    // Validate maximum
    try {
      validators.validateMaximum(parameter.name, val, parameter.maximum, parameter.type);
    } catch (err) {
      createErrorOrWarning ('MAXIMUM', err.message, val, path, dest);
      return;
    }

    // Validate minimum
    try {
      validators.validateMinimum(parameter.name, val, parameter.minimum, parameter.type);
    } catch (err) {
      createErrorOrWarning ('MINIMUM', err.message, val, path, dest);
      return;
    }

    // Validate uniqueItems
    try {
      validators.validateUniqueItems(parameter.name, val, parameter.uniqueItems);
    } catch (err) {
      createErrorOrWarning ('ARRAY_UNIQUE', err.message, val, path, dest);
      return;
    }

    break;

  case '2.0':
    // TODO: Make this work with parameters that have schemas/references

    // Validate the value type/format
    try {
      validators.validateTypeAndFormat(parameter.name, val,
                                       parameter.type === 'array' ? parameter.items.type : parameter.type,
                                       parameter.type === 'array' && parameter.items.format ?
                                         parameter.items.format :
                                         parameter.format);
    } catch (err) {
      // TODO: Update to notify of 'INVALID_FORMAT'
      createErrorOrWarning('INVALID_TYPE', err.message, val, path, dest);
      return;
    }

    // Validate enum
    try {
      validators.validateEnum(parameter.name, val, parameter.enum);
    } catch (err) {
      createErrorOrWarning('ENUM_MISMATCH', err.message, val, path, dest);
      return;
    }

    // Validate maximum
    try {
      validators.validateMaximum(parameter.name, val, parameter.maximum, parameter.type, parameter.exclusiveMaximum);
    } catch (err) {
      createErrorOrWarning(parameter.exclusiveMaximum === true ? 'MAXIMUM_EXCLUSIVE' : 'MAXIMUM', err.message, val,
                           path, dest);
      return;
    }

    // Validate maximum items
    try {
      validators.validateMaxItems(parameter.name, val, parameter.maxItems);
    } catch (err) {
      createErrorOrWarning('ARRAY_LENGTH_LONG', err.message, val, path, dest);
      return;
    }

    // Validate maximum length
    try {
      validators.validateMaxLength(parameter.name, val, parameter.maxLength);
    } catch (err) {
      createErrorOrWarning('MAX_LENGTH', err.message, val, path, dest);
      return;
    }

    // Validate minimum
    try {
      validators.validateMinimum(parameter.name, val, parameter.minimum, parameter.type, parameter.exclusiveMinimum);
    } catch (err) {
      createErrorOrWarning(parameter.exclusiveMinimum === 'true' ? 'MINIMUM_EXCLUSIVE' : 'MINIMUM', err.message, val,
                           path, dest);
      return;
    }

    // Validate minimum items
    try {
      validators.validateMinItems(parameter.name, val, parameter.minItems);
    } catch (err) {
      createErrorOrWarning('ARRAY_LENGTH_SHORT', err.message, val, path, dest);
      return;
    }

    // Validate minimum length
    try {
      validators.validateMinLength(parameter.name, val, parameter.minLength);
    } catch (err) {
      createErrorOrWarning('MIN_LENGTH', err.message, val, path, dest);
      return;
    }

    // Validate pattern
    try {
      validators.validatePattern(parameter.name, val, parameter.pattern);
    } catch (err) {
      createErrorOrWarning('PATTERN', err.message, val, path, dest);
      return;
    }

    // Validate uniqueItems
    try {
      validators.validateUniqueItems(parameter.name, val, parameter.uniqueItems);
    } catch (err) {
      createErrorOrWarning('ARRAY_UNIQUE', err.message, val, path, dest);
      return;
    }
    break;
  }
};

var normalizePath = function normalizePath (path) {
  var argNames = [];
  var segments = [];

  _.each(path.split('/'), function (segment) {
    if (segment.charAt(0) === '{') {
      argNames.push(segment.substring(1).split('}')[0]);

      segment = '{' + (argNames.length - 1) + '}';
    }

    segments.push(segment);
  });

  return {
    path: segments.join('/'),
    args: argNames
  };
};

/**
 * Creates a new Swagger specification object.
 *
 * @param {string} version - The Swagger version
 *
 * @constructor
 */
var Specification = function Specification (version) {
  var primitives = ['string', 'number', 'boolean', 'integer', 'array'];
  var docsUrl;
  var schemasUrl;

  switch (version) {
  case '1.2':
    docsUrl = 'https://github.com/wordnik/swagger-spec/blob/master/versions/1.2.md';
    primitives = _.union(primitives, ['void', 'File']);
    schemasUrl = 'https://github.com/wordnik/swagger-spec/tree/master/schemas/v1.2';

    break;
  case '2.0':
    docsUrl = 'https://github.com/wordnik/swagger-spec/blob/master/versions/2.0.md';
    primitives = _.union(primitives, ['file']);
    schemasUrl = 'https://github.com/wordnik/swagger-spec/tree/master/schemas/v2.0';

    break;
  default:
    throw new Error(version + ' is an unsupported Swagger specification version');
  }

  this.docsUrl = docsUrl;
  this.primitives = primitives;
  this.schemasUrl = schemasUrl;
  this.version = version;

  // Load the schema files
  this.schemas = {};

  // Create the validators
  this.validators = {};

  switch (version) {
  case '1.2':
    // Here explicitly to allow browserify to work
    this.schemas['apiDeclaration.json'] = require('../schemas/1.2/apiDeclaration.json');
    this.schemas['authorizationObject.json'] = require('../schemas/1.2/authorizationObject.json');
    this.schemas['dataType.json'] = require('../schemas/1.2/dataType.json');
    this.schemas['dataTypeBase.json'] = require('../schemas/1.2/dataTypeBase.json');
    this.schemas['infoObject.json'] = require('../schemas/1.2/infoObject.json');
    this.schemas['modelsObject.json'] = require('../schemas/1.2/modelsObject.json');
    this.schemas['oauth2GrantType.json'] = require('../schemas/1.2/oauth2GrantType.json');
    this.schemas['operationObject.json'] = require('../schemas/1.2/operationObject.json');
    this.schemas['parameterObject.json'] = require('../schemas/1.2/parameterObject.json');
    this.schemas['resourceListing.json'] = require('../schemas/1.2/resourceListing.json');
    this.schemas['resourceObject.json'] = require('../schemas/1.2/resourceObject.json');

    this.validators['apiDeclaration.json'] = createValidator(this, [
      'dataTypeBase.json',
      'modelsObject.json',
      'oauth2GrantType.json',
      'authorizationObject.json',
      'parameterObject.json',
      'operationObject.json',
      'apiDeclaration.json'
    ]);

    this.validators['resourceListing.json'] = createValidator(this, [
      'resourceObject.json',
      'infoObject.json',
      'oauth2GrantType.json',
      'authorizationObject.json',
      'resourceListing.json'
    ]);

    break;

  case '2.0':
    // Here explicitly to allow browserify to work
    this.schemas['schema.json'] = require('../schemas/2.0/schema.json');

    this.validators['schema.json'] = createValidator(this, [
      'schema.json'
    ]);

    break;
  }
};

var getModelMetadata = function getModelMetadata (modelsMetadata, modelId) {
  var metadata = modelsMetadata[modelId];

  if (_.isUndefined(metadata)) {
    metadata = modelsMetadata[modelId] = {
      composed: {},
      name: undefined,
      parents: [],
      refs: [],
      schema: undefined
    };
  }

  return metadata;
};

var processModel = function processModel (spec, modelsMetadata, model, modelId, path, results) {
  var metadata = getModelMetadata(modelsMetadata, modelId);

  // Ensure the model's name and schema are set
  metadata.schema = model;
  metadata.name = modelId; // Reasonable default
  metadata.path = path;

  switch (spec.version) {
  case '1.2':
    // Set the model's name to the proper value
    metadata.name = path[path.length - 1];

    // Add model references from properties and validate the default values
    _.each(model.properties, function (property, name) {
      var pPath = path.concat('properties', name);

      // Keep track of the model references
      if (property.$ref) {
        getModelMetadata(modelsMetadata, property.$ref).refs.push(pPath.concat(['$ref']));
      } else if (property.type === 'array' && property.items.$ref) {
        getModelMetadata(modelsMetadata, property.items.$ref).refs.push(pPath.concat(['items', '$ref']));
      }

      // Validate the default value against constraints
      if (!_.isUndefined(property.defaultValue)) {
        validateParameterConstraints(spec, property, property.defaultValue, pPath.concat('defaultValue'),
                                     results.errors);
      }
    });

    // Keep track of model references in subTypes
    _.each(_.uniq(model.subTypes), function (subType, index) {
      var subMetadata = getModelMetadata(modelsMetadata, subType);

      subMetadata.parents.push(modelId);
      subMetadata.refs.push(path.concat('subTypes', index.toString()));
    });

    break;

  case '2.0':
    // Keep track of model references in allOf
    _.each(_.uniq(model.allOf), function (schema, index) {
      var sPath = path.concat('allOf', index.toString());

      if (_.isUndefined(schema.$ref)) {
        processModel(spec, modelsMetadata, schema, toJsonPointer(sPath), sPath, results);

        metadata.parents.push(toJsonPointer(sPath));
      } else {
        metadata.parents.push(refToJsonPointer(schema.$ref));

        getModelMetadata(modelsMetadata, refToJsonPointer(schema.$ref)).refs.push(sPath.concat('$ref'));
      }
    });

    // Validate the default value against constraints
    if (!_.isUndefined(model.default)) {
      validateParameterConstraints(spec, model, model.defaultValue, path.concat('default'), results.errors);
    }

    // Skipping 'definitions' for now: https://github.com/reverb/swagger-spec/issues/127

    // Keep track of model references in $ref, items.$ref
    if (model.$ref) {
      getModelMetadata(modelsMetadata, refToJsonPointer(model.$ref)).refs.push(path.concat(['$ref']));
    } else if (model.type === 'array') {
      if (model.items.$ref) {
        getModelMetadata(modelsMetadata, refToJsonPointer(model.items.$ref)).refs.push(path.concat(['items', '$ref']));
      } else if (!_.isUndefined(model.items.type) && spec.primitives.indexOf(model.items.type) === -1) {
        _.each(model.items, function (item, index) {
          var sPath = path.concat('items', index.toString());

          processModel(spec, modelsMetadata, item, toJsonPointer(sPath), sPath, results);
        });
      }
    }

    _.each(model.properties, function (property, name) {
      var pPath = path.concat('properties', name);

      // Keep track of model references in $ref, items.$ref
      if (property.$ref) {
        getModelMetadata(modelsMetadata, refToJsonPointer(property.$ref)).refs.push(pPath.concat(['$ref']));
      } else if (property.type === 'array') {
        if (property.items.$ref) {
          getModelMetadata(modelsMetadata,
                           refToJsonPointer(property.items.$ref)).refs.push(pPath.concat(['items', '$ref']));
        } else if (!_.isUndefined(property.items.type) && spec.primitives.indexOf(property.items.type) === -1) {
          _.each(property.items, function (schema, index) {
            var sPath = pPath.concat('items', index.toString());

            processModel(spec, modelsMetadata, schema, toJsonPointer(sPath), sPath, results);
          });
        }
      }
    });


    // Add self reference to all model definitions outside of #/definitions (They are inline models or references)
    if (toJsonPointer(path).indexOf('#/definitions/') === -1) {
      metadata.refs.push(path);
    }

    break;
  }
};

var getModelsMetadata = function getModelsMetadata (spec, apiDOrSO, results) {
  var circular = {};
  var localResults = {
    errors: [],
    warnings: []
  };
  var resolved = {};
  var unresolved = {};
  var addModelProps = function addModelProps (modelId, composed) {
    var model = modelsMetadata[modelId].schema;

    if (model) {
      _.each(model.properties, function (prop, propName) {
        var newProp = _.cloneDeep(prop);

        if (composed.properties[propName]) {
          createErrorOrWarning('CHILD_MODEL_REDECLARES_PROPERTY',
                               'Child model declares property already declared by ancestor: ' + propName, prop,
                               spec.version === '1.2' ?
                                 ['models', modelId, 'properties', propName] :
                                 modelId.substring(2).split('/').concat('properties', propName), localResults.errors);
        } else {
          if (spec.version === '1.2') {
            // Sanitize the maximum/minimum values to be numbers
            if (!_.isUndefined(newProp.maximum)) {
              newProp.maximum = parseFloat(newProp.maximum);
            }

            if (!_.isUndefined(newProp.minimum)) {
              newProp.minimum = parseFloat(newProp.minimum);
            }
          }
          composed.properties[propName] = newProp;
        }
      });

      if (!_.isUndefined(model.required) && _.isUndefined(composed.required)) {
        composed.required = [];
      }

      _.each(model.required, function (propName) {
        if (composed.required.indexOf(propName) === -1) {
          composed.required.push(propName);
        }
      });
    }
  };
  var getPath = function getPath (parent, unresolved) {
    var parentVisited = false;

    return Object.keys(unresolved).filter(function (dep) {
      if (dep === parent) {
        parentVisited = true;
      }
      return parentVisited && unresolved[dep];
    });
  };
  var resolver = function resolver (modelId, circular, resolved, unresolved, composed) {
    var metadata = modelsMetadata[modelId];
    var model = metadata.schema;

    unresolved[modelId] = true;

    if (!_.isUndefined(model)) {
      // 1.2 does not allow multiple inheritance while 2.0+ does
      if (metadata.parents.length > 1 && spec.version === '1.2') {
        createErrorOrWarning('MULTIPLE_MODEL_INHERITANCE',
                             'Child model is sub type of multiple models: ' + metadata.parents.join(' && '), model,
                             ['models', modelId], localResults.errors);
      } else {
        _.each(metadata.parents, function (dep) {
          if (!resolved[dep]) {
            if (unresolved[dep]) {
              circular[modelId] = getPath(dep, unresolved);

              createErrorOrWarning('CYCLICAL_MODEL_INHERITANCE',
                                   'Model has a circular inheritance: ' + modelId + ' -> ' +
                                     circular[modelId].join(' -> '),
                                   spec.version === '1.2' ?
                                     model.subTypes :
                                     model.allOf,
                                   spec.version === '1.2' ?
                                     ['models', modelId, 'subTypes'] :
                                     modelId.substring(2).split('/').concat('allOf'), localResults.errors);
            }

            // Do not resolve if circular
            if (!circular[modelId]) {
              resolver(dep, circular, resolved, unresolved, composed);
            }
          }

          // Do not add properties if circular
          if (!circular[modelId]) {
            addModelProps(dep, composed);
          }
        });
      }
    }

    resolved[modelId] = true;
    unresolved[modelId] = false;
  };
  var hash = md5.hash(JSON.stringify(apiDOrSO));
  var metadataEntry = metadataCache[hash];
  var modelsMetadata;

  if (_.isUndefined(metadataEntry)) {
    metadataEntry = metadataCache[hash] = {
      metadata: {},
      results: localResults
    };

    modelsMetadata = metadataEntry.metadata;

    switch (spec.version) {
    case '1.2':
      _.reduce(apiDOrSO.models, function (seenModelIds, model, modelName) {
        // Validate the model is not already defined (by id)
        validateNoExist(seenModelIds, model.id, 'MODEL_DEFINITION', 'Model', ['models', modelName, 'id'],
                        localResults.errors);

        processModel(spec, modelsMetadata, model, model.id, ['models', modelName], localResults);

        return seenModelIds.concat(model.id);
      }, []);

      break;

    case '2.0':
      // Find models defined/referenced in #/definitions
      _.each(apiDOrSO.definitions, function (model, modelId) {
        var dPath = ['definitions', modelId];

        processModel(spec, modelsMetadata, model, toJsonPointer(dPath), dPath, localResults);
      });

      break;
    }

    // Compose models and identify inheritance issues
    _.each(modelsMetadata, function (metadata, modelId) {
      metadata.composed = {
        title: 'Composed ' + modelId,
        type: 'object',
        properties: {}
      };

      if (!_.isUndefined(metadata.schema)) {
        resolver(modelId, circular, resolved, unresolved, metadata.composed);
        addModelProps(modelId, metadata.composed);
      }

      // Validate required properties
      if (!_.isUndefined(metadata.schema.required)) {
        _.each(metadata.schema.required, function (propName, index) {
          if (_.isUndefined(metadata.composed.properties[propName])) {
            createErrorOrWarning('MISSING_REQUIRED_MODEL_PROPERTY',
                                 'Model requires property but it is not defined: ' + propName, propName,
                                 metadata.path.concat(['required', index.toString()]), results.errors);
          }
        });
      }
    });

    // Resolve references
    _.each(modelsMetadata, function (metadata) {
      var refs = traverse(metadata.composed).reduce(function (acc) {
        if (this.key === '$ref') {
          acc[toJsonPointer(this.path)] = spec.version === '1.2' ? this.node : refToJsonPointer(this.node);
        }

        return acc;
      }, {});

      _.each(refs, function (modelId, pathPtr) {
        var path = pathPtr.substring(2).split('/');
        var refModel = _.isUndefined(modelsMetadata[modelId]) ?
                         undefined :
                         _.cloneDeep(modelsMetadata[modelId].composed);

        if (!_.isUndefined(refModel)) {
          delete refModel.id;
          delete refModel.title;

          traverse(metadata.composed).set(path.slice(0, path.length - 1), refModel);
        }
      });
    });

    // Merge results
    if (!_.isUndefined(results)) {
      _.each(localResults, function (entries, destName) {
        results[destName] = results[destName].concat(entries);
      });
    }
  }

  return metadataEntry;
};

var validateWithSchema = function validateWithSchema (spec, schemaName, data) {
  var validator = spec.validators[schemaName];
  var schema = validator.schema[schemaName];
  var result = validator.validate(schema, data);
  var response = {
    errors: [],
    warnings: []
  };

  if (result) {
    response = {
      errors: validator.je(schema, data, result, jjveOptions),
      warnings: []
    };
  }

  return response;
};

var validateContent = function validateContent (spec, rlOrSO, apiDeclarations) {
  var response = {
    errors: [],
    warnings: []
  };
  var authDefs = {}; // (1.2)
  var authRefs = {}; // (1.2)
  var pathDefs = []; // (1.2)
  var pathRefs = []; // (1.2)

  switch (spec.version) {
  case '1.2':
    // Build path model
    _.each(rlOrSO.apis, function (api, index) {
      // Validate duplicate resource paths
      validateNoExist(pathDefs, api.path, 'RESOURCE_PATH', 'Resource path', ['apis', index.toString(), 'path'],
                      response.errors);

      if (pathDefs.indexOf(api.path) === -1) {
        pathDefs.push(api.path);
      }
    });

    if (response.errors.length === 0) {
      // Build the authorization model
      _.each(rlOrSO.authorizations, function (authorization, name) {
        authDefs[name] = _.map(authorization.scopes, function (scope) {
          return scope.scope;
        });
      }, {});

      response.apiDeclarations = [];

      // Validate the API declarations
      _.each(apiDeclarations, function (apiDeclaration, index) {
        var result = response.apiDeclarations[index] = {
          errors: [],
          warnings: []
        };
        var apiAuthDefs = {};
        var apiAuthRefs = {};
        var modelsMetadata = getModelsMetadata(spec, apiDeclaration, result).metadata;
        var addModelRef = function addModelRef (modelId, modelRef) {
          var metadata = getModelMetadata(modelsMetadata, modelId);

          metadata.refs.push(modelRef);
        };
        var addScopeRef = function addScopeRef (authId, scopeId) {
          var auth;

          if (!_.isUndefined(apiAuthDefs[authId])) {
            // Local auth definition
            auth = apiAuthRefs[authId];

            if (_.isUndefined(auth)) {
              auth = apiAuthRefs[authId] = [];
            }
          } else {
            // Global (Or missing in which case we'll assume global)
            auth = authRefs[authId];

            if (_.isUndefined(auth)) {
              auth = authRefs[authId] = [];
            }
          }

          if (auth.indexOf(scopeId) === -1) {
            auth.push(scopeId);
          }
        };

        // Build the authorization model
        _.each(apiDeclaration.authorizations, function (authorization, name) {
          apiAuthDefs[name] = _.map(authorization.scopes, function (scope) {
            return scope.scope;
          });
        }, {});

        // Validate duplicate resource path
        validateNoExist(pathRefs, apiDeclaration.resourcePath, 'RESOURCE_PATH', 'Resource path', ['resourcePath'],
                        result.errors);

        // Validate missing resource path definition
        validateExist(pathDefs, apiDeclaration.resourcePath, 'RESOURCE_PATH', 'Resource path', ['resourcePath'],
                      result.errors);

        // Keep track of the seen paths
        if (pathRefs.indexOf(apiDeclaration.resourcePath) === -1) {
          pathRefs.push(apiDeclaration.resourcePath);
        }

        // Validate consumes/produces uniqueness
        _.each(['consumes', 'produces'], function (name) {
          validateNoDuplicates(apiDeclaration[name], 'API_' + name.toUpperCase(), 'API', [name],
                               result.warnings);
        });

        // Valdate APIs
        _.reduce(apiDeclaration.apis, function (seenApiPaths, api, index) {
          var aPath = ['apis', index.toString()];
          var nPath = normalizePath(api.path);
          var sParams = [];

          // Validate duplicate resource path
          if (seenApiPaths.indexOf(nPath.path) > -1) {
            createErrorOrWarning('DUPLICATE_API_PATH', 'API path (or equivalent) already defined: ' + api.path,
                                 api.path, aPath.concat('path'), result.errors);
          }

          // Validate operations
          _.reduce(api.operations, function (seenMethods, operation, index) {
            var oPath = aPath.concat(['operations', index.toString()]);

            // Validate consumes/produces uniqueness
            _.each(['consumes', 'produces'], function (name) {
              validateNoDuplicates(operation[name], 'OPERATION_' + name.toUpperCase(), 'Operation',
                                   oPath.concat(name), result.warnings);
            });

            // Validate unique method
            validateNoExist(seenMethods, operation.method, 'OPERATION_METHOD', 'Operation method',
                            oPath.concat('method'), result.errors);

            // Validate authorizations
            _.each(operation.authorizations, function (scopes, name) {
              // Validate missing authorization
              validateExist(_.uniq(Object.keys(apiAuthDefs).concat(Object.keys(authDefs))), name, 'AUTHORIZATION',
                            'Authorization', oPath.concat(['authorizations', name]), result.errors);

              // Validate missing authorization scopes (Only when the authorization is not missing)
              _.each(scopes, function (scope, index) {
                if (!_.isUndefined(apiAuthDefs[name]) || !_.isUndefined(authDefs[name])) {
                  // Validate missing authorization scope
                  validateExist(_.uniq((apiAuthDefs[name] || []).concat(authDefs[name] || [])), scope.scope,
                                'AUTHORIZATION_SCOPE', 'Authorization scope',
                                oPath.concat(['authorizations', name, index.toString(), 'scope']), result.errors);
                }

                addScopeRef(name, scope.scope);
              });
            });

            // Validate parameters
            _.reduce(operation.parameters, function (seenParameters, parameter, index) {
              // Add model references from parameter type/items
              if (spec.primitives.indexOf(parameter.type) === -1) {
                addModelRef(parameter.type, oPath.concat(['parameters', index.toString(), 'type']));
              } else if (parameter.type === 'array' && parameter.items.$ref) {
                addModelRef(parameter.items.$ref, oPath.concat(['parameters', index.toString(), 'items', '$ref']));
              }

              // Validate duplicate parameter name
              validateNoExist(seenParameters, parameter.name, 'OPERATION_PARAMETER', 'Operation parameter',
                              oPath.concat('parameters', index.toString(), 'name'), result.errors);

              // Keep track of path parameters
              if (parameter.paramType === 'path') {
                if (nPath.args.indexOf(parameter.name) === -1) {
                  createErrorOrWarning('UNRESOLVABLE_API_PATH_PARAMETER',
                                       'API path parameter could not be resolved: ' + parameter.name, parameter.name,
                                       oPath.concat('parameters', index.toString(), 'name'), result.errors);
                }

                if (sParams.indexOf(parameter.name) === -1) {
                  sParams.push(parameter.name);
                }
              }

              if (!_.isUndefined(parameter.defaultValue)) {
                // Validate default value against constraints
                validateParameterConstraints(spec, parameter, parameter.defaultValue,
                                             oPath.concat('parameters', index.toString(), 'defaultValue'),
                                             result.errors);
              }

              return seenParameters.concat(parameter.name);
            }, []);

            // Validate missing path parameters (in path but not in operation.parameters)
            _.each(_.difference(nPath.args, sParams), function (unused) {
              createErrorOrWarning('MISSING_API_PATH_PARAMETER',
                                   'API requires path parameter but it is not defined: ' + unused, api.path,
                                   aPath.concat('path'), result.errors);
            });

            // Validate unique response code
            _.reduce(operation.responseMessages, function (seenResponseCodes, responseMessage, index) {
              validateNoExist(seenResponseCodes, responseMessage.code, 'RESPONSE_MESSAGE_CODE', 'Response message code',
                              oPath.concat(['responseMessages', index.toString(), 'code']), result.errors);

              // Add model references from responseMessages responseModel
              if (responseMessage.responseModel) {
                addModelRef(responseMessage.responseModel,
                            oPath.concat(['responseMessages', index.toString(), 'responseModel']));
              }

              return seenResponseCodes.concat(responseMessage.code);
            }, []);

            // Add model references from type/items
            if (operation.type === 'array' && operation.items.$ref) {
              addModelRef(operation.items.$ref, oPath.concat(['items', '$ref']));
            } else if (spec.primitives.indexOf(operation.type) === -1) {
              addModelRef(operation.type, oPath.concat(['type']));
            }

            return seenMethods.concat(operation.method);
          }, []);

          return seenApiPaths.concat(nPath.path);
        }, []);

        // Validate models
        _.each(modelsMetadata, function (metadata, modelId) {
          // Identify missing models (referenced but not declared)
          if (_.isUndefined(metadata.schema)) {
            _.each(metadata.refs, function (ref) {
              createErrorOrWarning('UNRESOLVABLE_MODEL', 'Model could not be resolved: ' + modelId,
                                   modelId, ref, result.errors);
            });
          }

          // Identify unused models (declared but not referenced)
          if (metadata.refs.length === 0) {
            createUnusedErrorOrWarning(metadata.schema, modelId, 'MODEL', 'Model', ['models', metadata.name],
                                       result.warnings);
          }
        });

        // Validate unused authorizations
        _.each(_.difference(Object.keys(apiAuthDefs), Object.keys(apiAuthRefs)), function (unused) {
          createUnusedErrorOrWarning(apiDeclaration.authorizations[unused], unused, 'AUTHORIZATION', 'Authorization',
                                     ['authorizations', unused], result.warnings);
        });

        // Validate unused authorization scopes
        _.each(apiAuthDefs, function (scopes, name) {
          var path = ['authorizations', name];
          var authDef = apiDeclaration.authorizations[name];

          _.each(_.difference(scopes, apiAuthRefs[name] || []), function (scope) {
            var sIndex = scopes.indexOf(scope);

            createUnusedErrorOrWarning(authDef.scopes[sIndex], scope, 'AUTHORIZATION_SCOPE',
                                       'Authorization scope', path.concat(['scopes', sIndex.toString()]),
                                       result.warnings);
          });
        });
      });

      // Validate unused resources
      _.each(_.difference(pathDefs, pathRefs), function (unused) {
        var index = _.map(rlOrSO.apis, function (api) { return api.path; }).indexOf(unused);

        createUnusedErrorOrWarning(rlOrSO.apis[index].path, unused, 'RESOURCE_PATH', 'Resource path',
                                   ['apis', index.toString(), 'path'], response.errors);
      });

      // Validate unused authorizations
      _.each(_.difference(Object.keys(authDefs), Object.keys(authRefs)), function (unused) {
        createUnusedErrorOrWarning(rlOrSO.authorizations[unused], unused, 'AUTHORIZATION', 'Authorization',
                                   ['authorizations', unused], response.warnings);
      });

      // Validate unused authorization scopes
      _.each(authRefs, function (scopes, name) {
        var path = ['authorizations', name];

        _.each(_.difference(scopes, authRefs[name]), function (unused) {
          var index = scopes.indexOf(unused);

          createUnusedErrorOrWarning(rlOrSO.authorizations[name].scopes[index], unused, 'AUTHORIZATION_SCOPE',
                                     'Authorization scope', path.concat(['scopes', index.toString()]),
                                     response.warnings);
        });
      });
    }

    break;

  case '2.0':
    // Validate (for now) unique consumes/produces/schemes
    _.each(['consumes', 'produces', 'schemes'], function (name) {
      validateNoDuplicates(rlOrSO[name], 'API_' + name.toUpperCase(), 'API', [name], response.warnings);
    });

    if (response.errors.length === 0 && response.warnings.length === 0) {
      var modelsMetadata = getModelsMetadata(spec, rlOrSO, response).metadata;

      // Validate the Paths
      _.reduce(rlOrSO.paths, function (seenPaths, path, name) {
        var aPath = ['paths', name];
        var nPath = normalizePath(name);
        var sParams = [];

        // Validate duplicate resource path
        if (seenPaths.indexOf(nPath.path) > -1) {
          createErrorOrWarning('DUPLICATE_API_PATH', 'API path (or equivalent) already defined: ' + name,
                               name, aPath, response.errors);
        }

        // Validate the Operations
        _.each(path, function (operation, method) {
          var oPath = aPath.concat(method);

          if (method === 'parameters') {
            // Validate parameter constraints
            _.reduce(path.parameters, function (seenParameters, parameter, index) {
              var pPath = oPath.concat(index.toString());

              // Validate duplicate parameter name
              validateNoExist(seenParameters, parameter.name, 'API_PARAMETER', 'API parameter',
                              pPath.concat('name'), response.errors);

              // Keep track of path parameters
              if (parameter.in === 'path') {
                if (nPath.args.indexOf(parameter.name) === -1) {
                  createErrorOrWarning('UNRESOLVABLE_API_PATH_PARAMETER',
                                       'API path parameter could not be resolved: ' + parameter.name, parameter.name,
                                       pPath.concat('name'), response.errors);
                }

                if (sParams.indexOf(parameter.name) === -1) {
                  sParams.push(parameter.name);
                }
              }

              // Find models defined/referenced in #/paths/{path}/parameters
              if (!_.isUndefined(parameter.schema)) {
                processModel(spec, modelsMetadata, parameter.schema, toJsonPointer(pPath.concat('schema')),
                             pPath.concat('schema'), response);
              }

              return seenParameters.concat(parameter.name);
            }, []);

            return;
          }

          // Validate (for now) consumes/produces/schemes uniqueness
          _.each(['consumes', 'produces', 'schemes'], function (name) {
            validateNoDuplicates(operation[name], 'OPERATION_' + name.toUpperCase(), 'Operation',
                                 oPath.concat(name), response.warnings);
          });

          // Validate parameter constraints
          _.reduce(operation.parameters, function (seenParameters, parameter, index) {
            var pPath = oPath.concat('parameters', index.toString());

            // Validate duplicate parameter name
            validateNoExist(seenParameters, parameter.name, 'OPERATION_PARAMETER', 'Operation parameter',
                            pPath.concat('name'), response.errors);

            // Keep track of path parameters
            if (parameter.in === 'path') {
              if (nPath.args.indexOf(parameter.name) === -1) {
                createErrorOrWarning('UNRESOLVABLE_API_PATH_PARAMETER',
                                     'API path parameter could not be resolved: ' + parameter.name, parameter.name,
                                     pPath.concat('name'), response.errors);
              }

              if (sParams.indexOf(parameter.name) === -1) {
                sParams.push(parameter.name);
              }
            }

            // Find models defined/referenced in #/paths/{path}/{method}/parameters
            if (!_.isUndefined(parameter.schema)) {
              processModel(spec, modelsMetadata, parameter.schema, toJsonPointer(pPath.concat('schema')),
                           pPath.concat('schema'), response);
            }

            return seenParameters.concat(parameter.name);
          }, []);

          // Find models defined/referenced in #/paths/{path}/{method}/responses
          _.each(operation.responses, function (response, responseCode) {
            var rPath = oPath.concat('responses', responseCode);

            if (!_.isUndefined(response.schema)) {
              processModel(spec, modelsMetadata, response.schema, toJsonPointer(rPath.concat('schema')),
                           rPath.concat('schema'), response);
            }
          });
        });

        // Validate missing path parameters (in path but not in operation.parameters)
        _.each(_.difference(nPath.args, sParams), function (unused) {
          createErrorOrWarning('MISSING_API_PATH_PARAMETER',
                               'API requires path parameter but it is not defined: ' + unused, name,
                               aPath, response.errors);
        });

        return seenPaths.concat(nPath.path);
      }, []);

      // Validate models
      _.each(modelsMetadata, function (metadata, modelId) {
        // Identify missing models (referenced but not declared)
        if (_.isUndefined(metadata.schema)) {
          _.each(metadata.refs, function (ref) {
            createErrorOrWarning('UNRESOLVABLE_MODEL', 'Model could not be resolved: ' + modelId, modelId, ref,
                                 response.errors);
          });
        }

        // Identify unused models (declared but not referenced)
        if (metadata.refs.length === 0) {
          createUnusedErrorOrWarning(metadata.schema, modelId, 'MODEL', 'Model', modelId.substring(2).split('/'),
                                     response.warnings);
        }
      });
    }

    break;
  }

  return response;
};

/**
 * Returns the result of the validation of the Swagger document(s).
 *
 * @param {object} rlOrSO - The Swagger Resource Listing (1.2) or Swagger Object (2.0)
 * @param {object[]} [apiDeclarations] - The array of Swagger API Declarations (1.2)
 *
 * @returns undefined if validation passes or an object containing errors and/or warnings
 */
Specification.prototype.validate = function validate (rlOrSO, apiDeclarations) {
  var response = {
    errors: [],
    warnings: []
  };
  var skipRemaining = false;

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

    // Validate structurally
    response = validateWithSchema(this, 'resourceListing.json', rlOrSO);

    if (response.errors.length > 0) {
      skipRemaining = true;
    }

    if (!skipRemaining) {
      response.apiDeclarations = [];

      _.each(apiDeclarations, function (apiDeclaration, index) {
        response.apiDeclarations[index] = validateWithSchema(this, 'apiDeclaration.json', apiDeclaration);

        if (response.apiDeclarations[index].errors.length > 0) {
          skipRemaining = true;

          // Skip the remaining validation
          return false;
        }
      }.bind(this));
    }

    // Validate semantically
    if (!skipRemaining) {
      response = validateContent(this, rlOrSO, apiDeclarations);
    }

    // Set the response
    response = response.errors.length > 0 || response.warnings.length > 0 ||
      _.reduce(response.apiDeclarations, function (count, apiDeclaration) {
        return count +
          (_.isArray(apiDeclaration.errors) ? apiDeclaration.errors.length : 0) +
          (_.isArray(apiDeclaration.warnings) ? apiDeclaration.warnings.length : 0);
      }, 0) > 0 ? response : undefined;

    break;

  case '2.0':
    // Validate arguments
    if (_.isUndefined(rlOrSO)) {
      throw new Error('swaggerObject is required');
    } else if (!_.isPlainObject(rlOrSO)) {
      throw new TypeError('swaggerObject must be an object');
    }

    // Validate structurally
    response = validateWithSchema(this, 'schema.json', rlOrSO);

    if (response.errors.length > 0) {
      skipRemaining = true;
    }

    // Validate semantically
    if (!skipRemaining) {
      response = validateContent(this, rlOrSO);
    }

    // Set the response
    response = response.errors.length > 0 || response.warnings.length > 0 ? response : undefined;

    break;
  }

  return response;
};

/**
 * Returns a JSON Schema representation of a composed model based on its id.
 *
 * @param {object} apiDOrSO - The Swagger Resource API Declaration (1.2) or the Swagger Object (2.0)
 * @param {string} modelIdOrPath - The model id (1.2 or 2.0) or the path to the model (2.0)
 *
 * @returns the object representing a composed object
 *
 * @throws Error if there are validation errors while creating
 */
Specification.prototype.composeModel = function composeModel (apiDOrSO, modelIdOrPath) {
  var metadataEntry;
  var modelMetadata;
  var modelsMetadata;
  var err;

  switch (this.version) {
  case '1.2':
    // Validate arguments
    if (_.isUndefined(apiDOrSO)) {
      throw new Error('apiDeclaration is required');
    } else if (!_.isPlainObject(apiDOrSO)) {
      throw new TypeError('apiDeclaration must be an object');
    }

    if (_.isUndefined(modelIdOrPath)) {
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

    if (_.isUndefined(modelIdOrPath)) {
      throw new Error('modelIdOrPath is required');
    }

    break;
  }

  metadataEntry = getModelsMetadata(this, apiDOrSO);
  modelsMetadata = metadataEntry.metadata;

  // Composing a model for an invalid model hierarchy is brittle and so we will not do it
  if (metadataEntry.results.errors.length > 0) {
    err = new Error('The models are invalid and model composition is not possible');

    err.errors = metadataEntry.results.errors;
    err.warnings = metadataEntry.results.warnings;

    throw err;
  }

  modelMetadata = modelsMetadata[this.version === '1.2' ?
                                   modelIdOrPath :
                                   refToJsonPointer(modelIdOrPath)];

  return _.isUndefined(modelMetadata) ? undefined : modelMetadata.composed;
};

/**
 * Validates a model based on its id.
 *
 * @param {object} apiDOrSO - The Swagger Resource API Declaration (1.2) or the Swagger Object (2.0)
 * @param {string} modelIdOrPath - The model id (1.2 or 2.0) or the path to the model (2.0)
 * @param {object} data - The model to validate
 *
 * @returns undefined if validation passes or an object containing errors and/or warnings
 *
 * @throws Error if there are validation errors while creating
 */
Specification.prototype.validateModel = function validateModel (apiDOrSO, modelIdOrPath, data) {
  var modelSchema = this.composeModel(apiDOrSO, modelIdOrPath);
  var result;
  var validator;

  if (_.isUndefined(modelSchema)) {
    throw Error('Unable to compose model so validation is not possible');
  }

  validator = jjv(jjvOptions);

  // Disable the 'uri' format checker as it's got issues: https://github.com/acornejo/jjv/issues/24
  validator.addFormat('uri', function() {
    return true;
  });

  validator.addSchema(draft04Url, draft04Json);

  validator.je = jjve(validator);

  result = validator.validate(modelSchema, data);

  if (result) {
    result = {
      errors: validator.je(modelSchema, data, result, jjveOptions)
    };
  } else {
    result = undefined;
  }

  return result;
};

module.exports.v1 = module.exports.v1_2 = new Specification('1.2'); // jshint ignore:line
module.exports.v2 = module.exports.v2_0 = new Specification('2.0'); // jshint ignore:line

},{"../schemas/1.2/apiDeclaration.json":322,"../schemas/1.2/authorizationObject.json":323,"../schemas/1.2/dataType.json":324,"../schemas/1.2/dataTypeBase.json":325,"../schemas/1.2/infoObject.json":326,"../schemas/1.2/modelsObject.json":327,"../schemas/1.2/oauth2GrantType.json":328,"../schemas/1.2/operationObject.json":329,"../schemas/1.2/parameterObject.json":330,"../schemas/1.2/resourceListing.json":331,"../schemas/1.2/resourceObject.json":332,"../schemas/2.0/schema.json":333,"../schemas/json-schema-draft-04.json":334,"./helpers":2,"./validators":3,"jjv":4,"jjve":6,"lodash.clonedeep":7,"lodash.difference":49,"lodash.foreach":65,"lodash.isarray":94,"lodash.isplainobject":101,"lodash.isundefined":123,"lodash.map":124,"lodash.reduce":185,"lodash.union":246,"lodash.uniq":267,"spark-md5":320,"traverse":321}],2:[function(require,module,exports){
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

var _ = {
  isUndefined: require('lodash.isundefined')
};
var specCache = {};

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
 * Takes a reference and creates a fully qualified JSON pointer from it.  (2.0 only)
 *
 * If the passed in reference is fully qualified, it is returned as-is.  Otherwise, the reference will have
 * '#/definitions/' prepended to it to make it fully qualified since these 'relative' references are only allowed for
 * model definitions.
 *
 * @param {string} ref - The relative or fully qualified reference
 *
 * @returns the corresponding JSON pointer for the reference
 */
module.exports.refToJsonPointer = function refToJsonPointer (ref) {
  if (ref.charAt(0) !== '#') {
    ref = '#/definitions/' + ref;
  }

  return ref;
};

/**
 * Takes an array of path segments and creates a JSON pointer from it. (2.0 only)
 *
 * @param {string[]} path - The path segments
 *
 * @returns a JSON pointer for the reference denoted by the path segments
 */
module.exports.toJsonPointer = function toJsonPointer (path) {
  // http://tools.ietf.org/html/rfc6901#section-4
  return '#/' + path.map(function (part) {
    return part.replace(/\//g, '~1');
  }).join('/');
};

},{"../lib/specs":undefined,"lodash.isundefined":123}],3:[function(require,module,exports){
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

var _ = {
  each: require('lodash.foreach'),
  isArray: require('lodash.isarray'),
  isBoolean: require('lodash.isboolean'),
  isNaN: require('lodash.isnan'),
  isNull: require('lodash.isnull'),
  isString: require('lodash.isstring'),
  isUndefined: require('lodash.isundefined'),
  union: require('lodash.union'),
  uniq: require('lodash.uniq')
};
var helpers = require('./helpers');

// http://tools.ietf.org/html/rfc3339#section-5.6
var dateRegExp = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
// http://tools.ietf.org/html/rfc3339#section-5.6
var dateTimeRegExp = /^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/;
var throwInvalidParameter = function throwInvalidParameter (name, message) {
  var err = new Error('Parameter (' + name + ') ' + message);

  err.failedValidation = true;

  throw err;
};
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

/**
 * Validates the request's content type (when necessary).
 *
 * @param {string[]} gConsumes - The valid consumes at the API scope
 * @param {string[]} oConsumes - The valid consumes at the operation scope
 * @param {object} req - The request
 *
 * @throws Error if the content type is invalid
 */
module.exports.validateContentType = function validateContentType (gConsumes, oConsumes, req) {
  // http://www.w3.org/Protocols/rfc2616/rfc2616-sec7.html#sec7.2.1
  var contentType = req.headers['content-type'] || 'application/octet-stream';
  var consumes = _.union(oConsumes, gConsumes);

  // Get only the content type
  contentType = contentType.split(';')[0];

  // Validate content type (Only for POST/PUT per HTTP spec)
  if (consumes.length > 0 && ['POST', 'PUT'].indexOf(req.method) !== -1 && consumes.indexOf(contentType) === -1) {
    throw new Error('Invalid content type (' + contentType + ').  These are valid: ' + consumes.join(', '));
  }
};

/**
 * Validates the request parameter's value against the allowable values (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*} val - The parameter value
 * @param {string[]} allowed - The allowable values
 *
 * @throws Error if the value is not allowable
 */
module.exports.validateEnum = function validateEnum (name, val, allowed) {
  if (!_.isUndefined(allowed) && !_.isUndefined(val) && allowed.indexOf(val) === -1) {
    throwInvalidParameter(name, 'is not an allowable value (' + allowed.join(', ') + '): ' + val);
  }
};

/**
 * Validates the request parameter's value is less than the maximum (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*} val - The parameter value
 * @param {string} maximum - The maximum value
 * @param {boolean} [exclusive=false] - Whether or not the value includes the maximum in its comparison
 *
 * @throws Error if the value is greater than the maximum
 */
module.exports.validateMaximum = function validateMaximum (name, val, maximum, type, exclusive) {
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
      throwInvalidParameter(name, 'is greater than or equal to the configured maximum (' + maximum + '): ' + val);
    } else if (testVal > testMax) {
      throwInvalidParameter(name, 'is greater than the configured maximum (' + maximum + '): ' + val);
    }
  }
};

/**
 * Validates the request parameter's array count is less than the maximum (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*[]} val - The parameter value
 * @param {number} maxItems - The maximum number of items
 *
 * @throws Error if the value contains more items than allowable
 */
module.exports.validateMaxItems = function validateMaxItems (name, val, maxItems) {
  if (!_.isUndefined(maxItems) && val.length > maxItems) {
    throwInvalidParameter(name, 'contains more items than allowed: ' + maxItems);
  }
};

/**
 * Validates the request parameter's length is less than the maximum (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*[]} val - The parameter value
 * @param {number} maxLength - The maximum length
 *
 * @throws Error if the value's length is greater than the maximum
 */
module.exports.validateMaxLength = function validateMaxLength (name, val, maxLength) {
  if (!_.isUndefined(maxLength) && val.length > maxLength) {
    throwInvalidParameter(name, 'is longer than allowed: ' + maxLength);
  }
};

/**
 * Validates the request parameter's array count is greater than the minimum (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*} val - The parameter value
 * @param {string} minimum - The minimum value
 * @param {boolean} [exclusive=false] - Whether or not the value includes the minimum in its comparison
 *
 * @throws Error if the value is less than the minimum
 */
module.exports.validateMinimum = function validateMinimum (name, val, minimum, type, exclusive) {
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
      throwInvalidParameter(name, 'is less than or equal to the configured minimum (' + minimum + '): ' + val);
    } else if (testVal < testMin) {
      throwInvalidParameter(name, 'is less than the configured minimum (' + minimum + '): ' + val);
    }
  }
};

/**
 * Validates the request parameter's value contains fewer items than allowed (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*[]} val - The parameter value
 * @param {number} minItems - The minimum number of items
 *
 * @throws Error if the value contains fewer items than allowable
 */
module.exports.validateMinItems = function validateMinItems (name, val, minItems) {
  if (!_.isUndefined(minItems) && val.length < minItems) {
    throwInvalidParameter(name, 'contains fewer items than allowed: ' + minItems);
  }
};

/**
 * Validates the request parameter's length is greater than the minimum (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*[]} val - The parameter value
 * @param {number} minLength - The minimum length
 *
 * @throws Error if the value's length is less than the minimum
 */
module.exports.validateMinLength = function validateMinLength (name, val, minLength) {
  if (!_.isUndefined(minLength) && val.length < minLength) {
    throwInvalidParameter(name, 'is shorter than allowed: ' + minLength);
  }
};

/**
 * Validtes the request parameter against its model schema.
 *
 * @param {string} name - The parameter name
 * @param {object} val - The parameter value
 * @param {string} version - The Swagger version
 * @param {object} apiDOrSO - The Swagger API Declaration (1.2) or Swagger Object (2.0)
 * @param {string} modelIdOrPath - The model id or path
 *
 * @throws Error if the value is not a valid model
 */
module.exports.validateModel = function validateModel (name, val, version, apiDOrSO, modelIdOrPath) {
  var spec = helpers.getSpec(version);
  var validate = function validate (data) {
    var result = spec.validateModel(apiDOrSO, modelIdOrPath, data);

    if (!_.isUndefined(result)) {
      try {
        throwInvalidParameter(name, 'is not a valid ' + modelIdOrPath + ' model');
      } catch (err) {
        err.errors = result.errors;

        throw err;
      }
    }
  };

  if (_.isArray(val)) {
    _.each(val, function (item) {
      validate(item);
    });
  } else {
    validate(val);
  }
};

/**
 * Validates the request parameter's matches a pattern (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*} val - The parameter value
 * @param {string} pattern - The pattern
 *
 * @throws Error if the value does not match the pattern
 */
module.exports.validatePattern = function validatePattern (name, val, pattern) {
  if (!_.isUndefined(pattern) && _.isNull(val.match(new RegExp(pattern)))) {
    throwInvalidParameter(name, 'does not match required pattern: ' + pattern);
  }
};

/**
 * Validates the request parameter's requiredness (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*} val - The parameter value
 * @param {boolean} required - Whether or not the parameter is required
 *
 * @throws Error if the value is required but is not present
 */
module.exports.validateRequiredness = function validateRequiredness (name, val, required) {
  if (!_.isUndefined(required) && required === true && _.isUndefined(val)) {
    throwInvalidParameter(name, 'is required');
  }
};

/**
 * Validates the request parameter's type and format (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*} val - The parameter value
 * @param {string} type - The parameter type
 * @param {string} format - The parameter format
 * @param {boolean} [skipError=false] - Whether or not to skip throwing an error (Useful for validating arrays)
 *
 * @throws Error if the value is not the proper type or format
 */
module.exports.validateTypeAndFormat = function validateTypeAndFormat (name, val, type, format, skipError) {
  var result = true;

  if (_.isArray(val)) {
    _.each(val, function (aVal, index) {
      if (!validateTypeAndFormat(name, aVal, type, format, true)) {
        throwInvalidParameter(name, 'at index ' + index + ' is not a valid ' + type + ': ' + aVal);
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
    }
  }

  if (skipError) {
    return result;
  } else if (!result) {
    throwInvalidParameter(name, 'is not a valid ' + (_.isUndefined(format) ? '' : format + ' ') + type + ': ' + val);
  }
};

/**
 * Validates the request parameter's values are unique (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {string[]} val - The parameter value
 * @param {boolean} isUnique - Whether or not the parameter values are unique
 *
 * @throws Error if the value has duplicates
 */
module.exports.validateUniqueItems = function validateUniqueItems (name, val, isUnique) {
  if (!_.isUndefined(isUnique) && _.uniq(val).length !== val.length) {
    throwInvalidParameter(name, 'does not allow duplicate values: ' + val.join(', '));
  }
};

},{"./helpers":2,"lodash.foreach":65,"lodash.isarray":94,"lodash.isboolean":96,"lodash.isnan":98,"lodash.isnull":99,"lodash.isstring":122,"lodash.isundefined":123,"lodash.union":246,"lodash.uniq":267}],4:[function(require,module,exports){
module.exports = require('./lib/jjv.js');

},{"./lib/jjv.js":5}],5:[function(require,module,exports){
/* jshint proto: true */

/**
 * jjv.js -- A javascript library to validate json input through a json-schema.
 *
 * Copyright (c) 2013 Alex Cornejo.
 *
 * Redistributable under a MIT-style open source license.
 */

(function () {
  var clone = function (obj) {
      // Handle the 3 simple types (string, number, function), and null or undefined
      if (obj === null || typeof obj !== 'object') return obj;
      var copy;

      // Handle Date
      if (obj instanceof Date) {
          copy = new Date();
          copy.setTime(obj.getTime());
          return copy;
      }

      // handle RegExp
      if (obj instanceof RegExp) {
        copy = new RegExp(obj);
        return copy;
      }

      // Handle Array
      if (obj instanceof Array) {
          copy = [];
          for (var i = 0, len = obj.length; i < len; i++)
              copy[i] = clone(obj[i]);
          return copy;
      }

      // Handle Object
      if (obj instanceof Object) {
          copy = {};
//           copy = Object.create(Object.getPrototypeOf(obj));
          for (var attr in obj) {
              if (obj.hasOwnProperty(attr))
                copy[attr] = clone(obj[attr]);
          }
          return copy;
      }

      throw new Error("Unable to clone object!");
  };

  var clone_stack = function (stack) {
    var new_stack = [ clone(stack[0]) ], key = new_stack[0].key, obj = new_stack[0].object;
    for (var i = 1, len = stack.length; i< len; i++) {
      obj = obj[key];
      key = stack[i].key;
      new_stack.push({ object: obj, key: key });
    }
    return new_stack;
  };

  var copy_stack = function (new_stack, old_stack) {
    var stack_last = new_stack.length-1, key = new_stack[stack_last].key;
    old_stack[stack_last].object[key] = new_stack[stack_last].object[key];
  };

  var handled = {
    'type': true,
    'not': true,
    'anyOf': true,
    'allOf': true,
    'oneOf': true,
    '$ref': true,
    '$schema': true,
    'id': true,
    'exclusiveMaximum': true,
    'exclusiveMininum': true,
    'properties': true,
    'patternProperties': true,
    'additionalProperties': true,
    'items': true,
    'additionalItems': true,
    'required': true,
    'default': true,
    'title': true,
    'description': true,
    'definitions': true,
    'dependencies': true
  };

  var fieldType = {
    'null': function (x) {
      return x === null;
    },
    'string': function (x) {
      return typeof x === 'string';
    },
    'boolean': function (x) {
      return typeof x === 'boolean';
    },
    'number': function (x) {
      // Use x === x instead of !isNaN(x) for speed
      return typeof x === 'number' && x === x;
    },
    'integer': function (x) {
      return typeof x === 'number' && x%1 === 0;
    },
    'object': function (x) {
      return x && typeof x === 'object' && !Array.isArray(x);
    },
    'array': function (x) {
      return Array.isArray(x);
    },
    'date': function (x) {
      return x instanceof Date;
    }
  };

  // missing: uri, date-time, ipv4, ipv6
  var fieldFormat = {
    'alpha': function (v) {
      return (/^[a-zA-Z]+$/).test(v);
    },
    'alphanumeric': function (v) {
      return (/^[a-zA-Z0-9]+$/).test(v);
    },
    'identifier': function (v) {
      return (/^[-_a-zA-Z0-9]+$/).test(v);
    },
    'hexadecimal': function (v) {
      return (/^[a-fA-F0-9]+$/).test(v);
    },
    'numeric': function (v) {
      return (/^[0-9]+$/).test(v);
    },
    'date-time': function (v) {
      return !isNaN(Date.parse(v)) && v.indexOf('/') === -1;
    },
    'uppercase': function (v) {
      return v === v.toUpperCase();
    },
    'lowercase': function (v) {
      return v === v.toLowerCase();
    },
    'hostname': function (v) {
      return v.length < 256 && (/^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]))*$/).test(v);
    },
    'uri': function (v) {
      return (/[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/).test(v);
    },
    'email': function (v) { // email, ipv4 and ipv6 adapted from node-validator
      return (/^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/).test(v);
    },
    'ipv4': function (v) {
      if ((/^(\d?\d?\d)\.(\d?\d?\d)\.(\d?\d?\d)\.(\d?\d?\d)$/).test(v)) {
        var parts = v.split('.').sort();
        if (parts[3] <= 255)
          return true;
      }
      return false;
    },
    'ipv6': function(v) {
      return (/^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/).test(v);
     /*  return (/^::|^::1|^([a-fA-F0-9]{1,4}::?){1,7}([a-fA-F0-9]{1,4})$/).test(v); */
    }
  };

  var fieldValidate = {
    'readOnly': function (v, p) {
      return false;
    },
    // ****** numeric validation ********
    'minimum': function (v, p, schema) {
      return !(v < p || schema.exclusiveMinimum && v <= p);
    },
    'maximum': function (v, p, schema) {
      return !(v > p || schema.exclusiveMaximum && v >= p);
    },
    'multipleOf': function (v, p) {
      return (v/p)%1 === 0 || typeof v !== 'number';
    },
    // ****** string validation ******
    'pattern': function (v, p) {
      if (typeof v !== 'string')
        return true;
      var pattern, modifiers;
      if (typeof p === 'string')
        pattern=p;
      else {
        pattern=p[0];
        modifiers=p[1];
      }
      var regex = new RegExp(pattern, modifiers);
      return regex.test(v);
    },
    'minLength': function (v, p) {
      return v.length >= p || typeof v !== 'string';
    },
    'maxLength': function (v, p) {
      return v.length <= p || typeof v !== 'string';
    },
    // ***** array validation *****
    'minItems': function (v, p) {
      return v.length >= p || !Array.isArray(v);
    },
    'maxItems': function (v, p) {
      return v.length <= p || !Array.isArray(v);
    },
    'uniqueItems': function (v, p) {
      var hash = {}, key;
      for (var i = 0, len = v.length; i < len; i++) {
        key = JSON.stringify(v[i]);
        if (hash.hasOwnProperty(key))
          return false;
        else
          hash[key] = true;
      }
      return true;
    },
    // ***** object validation ****
    'minProperties': function (v, p) {
      if (typeof v !== 'object')
        return true;
      var count = 0;
      for (var attr in v) if (v.hasOwnProperty(attr)) count = count + 1;
      return count >= p;
    },
    'maxProperties': function (v, p) {
      if (typeof v !== 'object')
        return true;
      var count = 0;
      for (var attr in v) if (v.hasOwnProperty(attr)) count = count + 1;
      return count <= p;
    },
    // ****** all *****
    'constant': function (v, p) {
      return JSON.stringify(v) == JSON.stringify(p);
    },
    'enum': function (v, p) {
      var i, len, vs;
      if (typeof v === 'object') {
        vs = JSON.stringify(v);
        for (i = 0, len = p.length; i < len; i++)
          if (vs === JSON.stringify(p[i]))
            return true;
      } else {
        for (i = 0, len = p.length; i < len; i++)
          if (v === p[i])
            return true;
      }
      return false;
    }
  };

  var normalizeID = function (id) {
    return id.indexOf("://") === -1 ? id : id.split("#")[0];
  };

  var resolveURI = function (env, schema_stack, uri) {
    var curschema, components, hash_idx, name;

    hash_idx = uri.indexOf('#');

    if (hash_idx === -1) {
      if (!env.schema.hasOwnProperty(uri))
        return null;
      return [env.schema[uri]];
    }

    if (hash_idx > 0) {
      name = uri.substr(0, hash_idx);
      uri = uri.substr(hash_idx+1);
      if (!env.schema.hasOwnProperty(name)) {
        if (schema_stack && schema_stack[0].id === name)
          schema_stack = [schema_stack[0]];
        else
          return null;
      } else
        schema_stack = [env.schema[name]];
    } else {
      if (!schema_stack)
        return null;
      uri = uri.substr(1);
    }

    if (uri === '')
      return [schema_stack[0]];

    if (uri.charAt(0) === '/') {
      uri = uri.substr(1);
      curschema = schema_stack[0];
      components = uri.split('/');
      while (components.length > 0) {
        if (!curschema.hasOwnProperty(components[0]))
          return null;
        curschema = curschema[components[0]];
        schema_stack.push(curschema);
        components.shift();
      }
      return schema_stack;
    } else // FIX: should look for subschemas whose id matches uri
      return null;
  };

  var resolveObjectRef = function (object_stack, uri) {
    var components, object, last_frame = object_stack.length-1, skip_frames, frame, m = /^(\d+)/.exec(uri);

    if (m) {
      uri = uri.substr(m[0].length);
      skip_frames = parseInt(m[1], 10);
      if (skip_frames < 0 || skip_frames > last_frame)
        return;
      frame = object_stack[last_frame-skip_frames];
      if (uri === '#')
        return frame.key;
    } else
      frame = object_stack[0];

    object = frame.object[frame.key];

    if (uri === '')
      return object;

    if (uri.charAt(0) === '/') {
      uri = uri.substr(1);
      components = uri.split('/');
      while (components.length > 0) {
        components[0] = components[0].replace(/~1/g, '/').replace(/~0/g, '~');
        if (!object.hasOwnProperty(components[0]))
          return;
        object = object[components[0]];
        components.shift();
      }
      return object;
    } else
      return;
  };

  var checkValidity = function (env, schema_stack, object_stack, options) {
    var i, len, count, hasProp, hasPattern;
    var p, v, malformed = false, objerrs = {}, objerr, props, matched;
    var sl = schema_stack.length-1, schema = schema_stack[sl], new_stack;
    var ol = object_stack.length-1, object = object_stack[ol].object, name = object_stack[ol].key, prop = object[name];
    var errCount, minErrCount;

    if (schema.hasOwnProperty('$ref')) {
      schema_stack= resolveURI(env, schema_stack, schema.$ref);
      if (!schema_stack)
        return {'$ref': schema.$ref};
      else
        return checkValidity(env, schema_stack, object_stack, options);
    }

    if (schema.hasOwnProperty('type')) {
      if (typeof schema.type === 'string') {
        if (options.useCoerce && env.coerceType.hasOwnProperty(schema.type))
          prop = object[name] = env.coerceType[schema.type](prop);
        if (!env.fieldType[schema.type](prop))
          return {'type': schema.type};
      } else {
        malformed = true;
        for (i = 0, len = schema.type.length; i < len && malformed; i++)
          if (env.fieldType[schema.type[i]](prop))
            malformed = false;
        if (malformed)
          return {'type': schema.type};
      }
    }

    if (schema.hasOwnProperty('allOf')) {
      for (i = 0, len = schema.allOf.length; i < len; i++) {
        objerr = checkValidity(env, schema_stack.concat(schema.allOf[i]), object_stack, options);
        if (objerr)
          return objerr;
      }
    }

    if (!options.useCoerce && !options.useDefault && !options.removeAdditional) {
      if (schema.hasOwnProperty('oneOf')) {
        minErrCount = Infinity;
        for (i = 0, len = schema.oneOf.length, count = 0; i < len; i++) {
          objerr = checkValidity(env, schema_stack.concat(schema.oneOf[i]), object_stack, options);
          if (!objerr) {
            count = count + 1;
            if (count > 1)
              break;
          } else {
            errCount = objerr.schema ? Object.keys(objerr.schema).length : 1;
            if (errCount < minErrCount) {
                minErrCount = errCount;
                objerrs = objerr;
            }
          }
        }
        if (count > 1)
          return {'oneOf': true};
        else if (count < 1)
          return objerrs;
        objerrs = {};
      }

      if (schema.hasOwnProperty('anyOf')) {
        objerrs = null;
        minErrCount = Infinity;
        for (i = 0, len = schema.anyOf.length; i < len; i++) {
          objerr = checkValidity(env, schema_stack.concat(schema.anyOf[i]), object_stack, options);
          if (!objerr) {
            objerrs = null;
            break;
          }
          else {
            errCount = objerr.schema ? Object.keys(objerr.schema).length : 1;
            if (errCount < minErrCount) {
                minErrCount = errCount;
                objerrs = objerr;
            }
          }
        }
        if (objerrs)
          return objerrs;
      }

      if (schema.hasOwnProperty('not')) {
        objerr = checkValidity(env, schema_stack.concat(schema.not), object_stack, options);
        if (!objerr)
          return {'not': true};
      }
    } else {
      if (schema.hasOwnProperty('oneOf')) {
        minErrCount = Infinity;
        for (i = 0, len = schema.oneOf.length, count = 0; i < len; i++) {
          new_stack = clone_stack(object_stack);
          objerr = checkValidity(env, schema_stack.concat(schema.oneOf[i]), new_stack, options);
          if (!objerr) {
            count = count + 1;
            if (count > 1)
              break;
            else
              copy_stack(new_stack, object_stack);
          } else {
            errCount = objerr.schema ? Object.keys(objerr.schema).length : 1;
            if (errCount < minErrCount) {
                minErrCount = errCount;
                objerrs = objerr;
            }
          }
        }
        if (count > 1)
          return {'oneOf': true};
        else if (count < 1)
          return objerrs;
        objerrs = {};
      }

      if (schema.hasOwnProperty('anyOf')) {
        objerrs = null;
        minErrCount = Infinity;
        for (i = 0, len = schema.anyOf.length; i < len; i++) {
          new_stack = clone_stack(object_stack);
          objerr = checkValidity(env, schema_stack.concat(schema.anyOf[i]), new_stack, options);
          if (!objerr) {
            copy_stack(new_stack, object_stack);
            objerrs = null;
            break;
          }
          else {
            errCount = objerr.schema ? Object.keys(objerr.schema).length : 1;
            if (errCount < minErrCount) {
                minErrCount = errCount;
                objerrs = objerr;
            }
          }
        }
        if (objerrs)
          return objerrs;
      }

      if (schema.hasOwnProperty('not')) {
        new_stack = clone_stack(object_stack);
        objerr = checkValidity(env, schema_stack.concat(schema.not), new_stack, options);
        if (!objerr)
          return {'not': true};
      }
    }

    if (schema.hasOwnProperty('dependencies')) {
      for (p in schema.dependencies)
        if (schema.dependencies.hasOwnProperty(p) && prop.hasOwnProperty(p)) {
          if (Array.isArray(schema.dependencies[p])) {
            for (i = 0, len = schema.dependencies[p].length; i < len; i++)
              if (!prop.hasOwnProperty(schema.dependencies[p][i])) {
                return {'dependencies': true};
              }
          } else {
            objerr = checkValidity(env, schema_stack.concat(schema.dependencies[p]), object_stack, options);
            if (objerr)
              return objerr;
          }
        }
    }

    if (!Array.isArray(prop)) {
      props = [];
      objerrs = {};
      for (p in prop)
        if (prop.hasOwnProperty(p))
          props.push(p);

      if (options.checkRequired && schema.required) {
        for (i = 0, len = schema.required.length; i < len; i++)
          if (!prop.hasOwnProperty(schema.required[i])) {
            objerrs[schema.required[i]] = {'required': true};
            malformed = true;
          }
      }

      hasProp = schema.hasOwnProperty('properties');
      hasPattern = schema.hasOwnProperty('patternProperties');
      if (hasProp || hasPattern) {
        i = props.length;
        while (i--) {
          matched = false;
          if (hasProp && schema.properties.hasOwnProperty(props[i])) {
            matched = true;
            objerr = checkValidity(env, schema_stack.concat(schema.properties[props[i]]), object_stack.concat({object: prop, key: props[i]}), options);
            if (objerr !== null) {
              objerrs[props[i]] = objerr;
              malformed = true;
            }
          }
          if (hasPattern) {
            for (p in schema.patternProperties)
              if (schema.patternProperties.hasOwnProperty(p) && props[i].match(p)) {
                matched = true;
                objerr = checkValidity(env, schema_stack.concat(schema.patternProperties[p]), object_stack.concat({object: prop, key: props[i]}), options);
                if (objerr !== null) {
                  objerrs[props[i]] = objerr;
                  malformed = true;
                }
              }
          }
          if (matched)
            props.splice(i, 1);
        }
      }

      if (options.useDefault && hasProp && !malformed) {
        for (p in schema.properties)
          if (schema.properties.hasOwnProperty(p) && !prop.hasOwnProperty(p) && schema.properties[p].hasOwnProperty('default'))
            prop[p] = schema.properties[p]['default'];
      }

      if (options.removeAdditional && hasProp && schema.additionalProperties !== true && typeof schema.additionalProperties !== 'object') {
        for (i = 0, len = props.length; i < len; i++)
          delete prop[props[i]];
      } else {
        if (schema.hasOwnProperty('additionalProperties')) {
          if (typeof schema.additionalProperties === 'boolean') {
            if (!schema.additionalProperties) {
              for (i = 0, len = props.length; i < len; i++) {
                objerrs[props[i]] = {'additional': true};
                malformed = true;
              }
            }
          } else {
            for (i = 0, len = props.length; i < len; i++) {
              objerr = checkValidity(env, schema_stack.concat(schema.additionalProperties), object_stack.concat({object: prop, key: props[i]}), options);
              if (objerr !== null) {
                objerrs[props[i]] = objerr;
                malformed = true;
              }
            }
          }
        }
      }
      if (malformed)
        return {'schema': objerrs};
    } else {
      if (schema.hasOwnProperty('items')) {
        if (Array.isArray(schema.items)) {
          for (i = 0, len = schema.items.length; i < len; i++) {
            objerr = checkValidity(env, schema_stack.concat(schema.items[i]), object_stack.concat({object: prop, key: i}), options);
            if (objerr !== null) {
              objerrs[i] = objerr;
              malformed = true;
            }
          }
          if (prop.length > len && schema.hasOwnProperty('additionalItems')) {
            if (typeof schema.additionalItems === 'boolean') {
              if (!schema.additionalItems)
                return {'additionalItems': true};
            } else {
              for (i = len, len = prop.length; i < len; i++) {
                objerr = checkValidity(env, schema_stack.concat(schema.additionalItems), object_stack.concat({object: prop, key: i}), options);
                if (objerr !== null) {
                  objerrs[i] = objerr;
                  malformed = true;
                }
              }
            }
          }
        } else {
          for (i = 0, len = prop.length; i < len; i++) {
            objerr = checkValidity(env, schema_stack.concat(schema.items), object_stack.concat({object: prop, key: i}), options);
            if (objerr !== null) {
              objerrs[i] = objerr;
              malformed = true;
            }
          }
        }
      } else if (schema.hasOwnProperty('additionalItems')) {
        if (typeof schema.additionalItems !== 'boolean') {
          for (i = 0, len = prop.length; i < len; i++) {
            objerr = checkValidity(env, schema_stack.concat(schema.additionalItems), object_stack.concat({object: prop, key: i}), options);
            if (objerr !== null) {
              objerrs[i] = objerr;
              malformed = true;
            }
          }
        }
      }
      if (malformed)
        return {'schema': objerrs};
    }

    for (v in schema) {
      if (schema.hasOwnProperty(v) && !handled.hasOwnProperty(v)) {
        if (v === 'format') {
          if (env.fieldFormat.hasOwnProperty(schema[v]) && !env.fieldFormat[schema[v]](prop, schema, object_stack, options)) {
            objerrs[v] = true;
            malformed = true;
          }
        } else {
          if (env.fieldValidate.hasOwnProperty(v) && !env.fieldValidate[v](prop, schema[v].hasOwnProperty('$data') ? resolveObjectRef(object_stack, schema[v].$data) : schema[v], schema, object_stack, options)) {
            objerrs[v] = true;
            malformed = true;
          }
        }
      }
    }

    if (malformed)
      return objerrs;
    else
      return null;
  };

  var defaultOptions = {
    useDefault: false,
    useCoerce: false,
    checkRequired: true,
    removeAdditional: false
  };

  function Environment() {
    if (!(this instanceof Environment))
      return new Environment();

    this.coerceType = {};
    this.fieldType = clone(fieldType);
    this.fieldValidate = clone(fieldValidate);
    this.fieldFormat = clone(fieldFormat);
    this.defaultOptions = clone(defaultOptions);
    this.schema = {};
  }

  Environment.prototype = {
    validate: function (name, object, options) {
      var schema_stack = [name], errors = null, object_stack = [{object: {'__root__': object}, key: '__root__'}];

      if (typeof name === 'string') {
        schema_stack = resolveURI(this, null, name);
        if (!schema_stack)
          throw new Error('jjv: could not find schema \'' + name + '\'.');
      }

      if (!options) {
        options = this.defaultOptions;
      } else {
        for (var p in this.defaultOptions)
          if (this.defaultOptions.hasOwnProperty(p) && !options.hasOwnProperty(p))
            options[p] = this.defaultOptions[p];
      }

      errors = checkValidity(this, schema_stack, object_stack, options);

      if (errors)
        return {validation: errors.hasOwnProperty('schema') ? errors.schema : errors};
      else
        return null;
    },

    resolveRef: function (schema_stack, $ref) {
      return resolveURI(this, schema_stack, $ref);
    },

    addType: function (name, func) {
      this.fieldType[name] = func;
    },

    addTypeCoercion: function (type, func) {
      this.coerceType[type] = func;
    },

    addCheck: function (name, func) {
      this.fieldValidate[name] = func;
    },

    addFormat: function (name, func) {
      this.fieldFormat[name] = func;
    },

    addSchema: function (name, schema) {
      if (!schema && name) {
        schema = name;
        name = undefined;
      }
      if (schema.hasOwnProperty('id') && typeof schema.id === 'string' && schema.id !== name) {
        if (schema.id.charAt(0) === '/')
          throw new Error('jjv: schema id\'s starting with / are invalid.');
        this.schema[normalizeID(schema.id)] = schema;
      } else if (!name) {
        throw new Error('jjv: schema needs either a name or id attribute.');
      }
      if (name)
        this.schema[normalizeID(name)] = schema;
    }
  };

  // Export for use in server and client.
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined')
    module.exports = Environment;
  else if (typeof define === 'function' && define.amd)
    define(function () {return Environment;});
  else
    this.jjv = Environment;
}).call(this);

},{}],6:[function(require,module,exports){
(function() {
  'use strict';

  function make(o) {
    var errors = [];

    var keys = Object.keys(o.validation);

    // when we're on a leaf node we need to handle the validation errors,
    // otherwise we continue walking
    var leaf = keys.every(function(key) {
      return typeof o.validation[key] !== 'object' ||
        isArray(o.validation[key]);
    });

    if (leaf) {
      // step through each validation issue
      // example: { required: true }
      keys.forEach(function(key) {
        var error, properties;

        try {
          switch (key) {
            case 'type':
              var type = typeof o.data;

              // further discover types
              if (type === 'number' && ('' + o.data).match(/^\d+$/)) {
                type = 'integer';
              } else if (type === 'object' && Array.isArray(o.data)) {
                type = 'array';
              }

              // the value of type is the required type (ex: { type: 'string' })
              error = {
                code: 'INVALID_TYPE',
                message: 'Invalid type: ' + type + ' should be ' +
                         (isArray(o.validation[key]) ?  'one of ' :  '') +
                          o.validation[key]
              };

              break;
            case 'required':
              properties = o.ns;

              error = {
                code: 'OBJECT_REQUIRED',
                message: 'Missing required property: ' +
                         properties[properties.length - 1]
              };

              break;
            case 'minimum':
              error = {
                code: 'MINIMUM',
                message: 'Value ' + o.data + ' is less than minimum ' +
                         o.schema.minimum
              };

              break;
            case 'maximum':
              error = {
                code: 'MAXIMUM',
                message: 'Value ' + o.data + ' is greater than maximum ' +
                         o.schema.maximum
              };

              break;
            case 'multipleOf':
              error = {
                code: 'MULTIPLE_OF',
                message: 'Value ' + o.data + ' is not a multiple of ' +
                         o.schema.multipleOf
              };

              break;
            case 'pattern':
              error = {
                code: 'PATTERN',
                message: 'String does not match pattern: ' + o.schema.pattern
              };

              break;
            case 'minLength':
              error = {
                code: 'MIN_LENGTH',
                message: 'String is too short (' + o.data.length + ' chars), ' +
                         'minimum ' + o.schema.minLength
              };

              break;
            case 'maxLength':
              error = {
                code: 'MAX_LENGTH',
                message: 'String is too long (' + o.data.length + ' chars), ' +
                         'maximum ' + o.schema.maxLength
              };

              break;
            case 'minItems':
              error = {
                code: 'ARRAY_LENGTH_SHORT',
                message: 'Array is too short (' + o.data.length + '), ' +
                         'minimum ' + o.schema.minItems
              };

              break;
            case 'maxItems':
              error = {
                code: 'ARRAY_LENGTH_LONG',
                message: 'Array is too long (' + o.data.length + '), maximum ' +
                         o.schema.maxItems
              };

              break;
            case 'uniqueItems':
              error = {
                code: 'ARRAY_UNIQUE',
                message: 'Array items are not unique'
              };

              break;
            case 'minProperties':
              error = {
                code: 'OBJECT_PROPERTIES_MINIMUM',
                message: 'Too few properties defined (' +
                         Object.keys(o.data).length + '), minimum ' +
                         o.schema.minProperties
              };

              break;
            case 'maxProperties':
              error = {
                code: 'OBJECT_PROPERTIES_MAXIMUM',
                message: 'Too many properties defined (' +
                         Object.keys(o.data).length + '), maximum ' +
                         o.schema.maxProperties
              };

              break;
            case 'enum':
              error = {
                code: 'ENUM_MISMATCH',
                message: 'No enum match (' + o.data + '), expects: ' +
                         o.schema['enum'].join(', ')
              };

              break;
            case 'not':
              error = {
                code: 'NOT_PASSED',
                message: 'Data matches schema from "not"'
              };

              break;
            case 'additional':
              properties = o.ns;

              error = {
                code: 'ADDITIONAL_PROPERTIES',
                message: 'Additional properties not allowed: ' +
                         properties[properties.length - 1]
              };

              break;
          }
        } catch (err) {
          // ignore errors
        }

        // unhandled errors
        if (!error) {
          error = {
            code: 'FAILED',
            message: 'Validation error: ' + key
          };

          try {
            if (typeof o.validation[key] !== 'boolean') {
              error.message = ' (' + o.validation[key] + ')';
            }
          } catch (err) {
            // ignore errors
          }
        }

        error.code = 'VALIDATION_' + error.code;
        if (o.data !== undefined) error.data = o.data;
        error.path = o.ns;
        errors.push(error);
      });
    } else {
      // handle all non-leaf children
      keys.forEach(function(key) {
        var s;

        if (o.schema.$ref) {
          if (o.schema.$ref.match(/#\/definitions\//)) {
            o.schema = o.definitions[o.schema.$ref.slice(14)];
          } else {
            o.schema = o.schema.$ref;
          }

          if (typeof o.schema === 'string') {
            o.schema = o.env.resolveRef(null, o.schema);
            if (o.schema) o.schema = o.schema[0];
          }
        }

        if (o.schema && o.schema.type) {
          if (allowsType(o.schema, 'object')) {
            if (o.schema.properties && o.schema.properties[key]) {
              s = o.schema.properties[key];
            }

            if (!s && o.schema.patternProperties) {
              Object.keys(o.schema.patternProperties).some(function(pkey) {
                if (key.match(new RegExp(pkey))) {
                  s = o.schema.patternProperties[pkey];
                  return true;
                }
              });
            }

            if (!s && o.schema.hasOwnProperty('additionalProperties')) {
              if (typeof o.schema.additionalProperties === 'boolean') {
                s = {};
              } else {
                s = o.schema.additionalProperties;
              }
            }
          }

          if (allowsType(o.schema, 'array')) {
            s = o.schema.items;
          }
        }

        var opts = {
          env: o.env,
          schema: s || {},
          ns: o.ns.concat(key)
        };

        try {
          opts.data = o.data[key];
        } catch (err) {
          // ignore errors
        }

        try {
          opts.validation = o.validation[key].schema ?
            o.validation[key].schema :
            o.validation[key];
        } catch (err) {
          opts.validation = {};
        }

        try {
          opts.definitions = s.definitions || o.definitions;
        } catch (err) {
          opts.definitions = o.definitions;
        }

        errors = errors.concat(make(opts));
      });
    }

    return errors;
  }

  function allowsType(schema, type) {
    if (typeof schema.type === 'string') {
      return schema.type === type;
    }
    if (isArray(schema.type)) {
      return schema.type.indexOf(type) !== -1;
    }
    return false;
  }

  function isArray(obj) {
    if (typeof Array.isArray === 'function') {
      return Array.isArray(obj);
    }
    return Object.prototype.toString.call(obj) === '[object Array]';
  }

  function formatPath(options) {
    var root = options.hasOwnProperty('root') ?
      options.root : '$';

    var sep = options.hasOwnProperty('sep') ?
      options.sep : '.';

    return function(error) {
      var path = root;

      error.path.forEach(function(key) {
        path += key.match(/^\d+$/) ?
          '[' + key + ']' :
          key.match(/^[A-Z_$][0-9A-Z_$]*$/i) ?
            (sep + key) :
            ('[' + JSON.stringify(key) + ']');
      });

      error.path = path;

      return error;
    };
  }

  function jjve(env) {
    return function jjve(schema, data, result, options) {
      if (!result || !result.validation) return [];

      options = options || {};

      if (typeof schema === 'string') { schema = env.schema[schema]; }

      var errors = make({
        env: env,
        schema: schema,
        data: data,
        validation: result.validation,
        ns: [],
        definitions: schema.definitions || {}
      });

      if (errors.length && options.formatPath !== false) {
        return errors.map(formatPath(options));
      }

      return errors;
    };
  }

  // Export for use in server and client.
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = jjve;
  } else if (typeof define === 'function' && define.amd) {
    define(function() { return jjve; });
  } else {
    this.jjve = jjve;
  }
}).call(this);

},{}],7:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseClone = require('lodash._baseclone'),
    baseCreateCallback = require('lodash._basecreatecallback');

/**
 * Creates a deep clone of `value`. If a callback is provided it will be
 * executed to produce the cloned values. If the callback returns `undefined`
 * cloning will be handled by the method instead. The callback is bound to
 * `thisArg` and invoked with one argument; (value).
 *
 * Note: This method is loosely based on the structured clone algorithm. Functions
 * and DOM nodes are **not** cloned. The enumerable properties of `arguments` objects and
 * objects created by constructors other than `Object` are cloned to plain `Object` objects.
 * See http://www.w3.org/TR/html5/infrastructure.html#internal-structured-cloning-algorithm.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to deep clone.
 * @param {Function} [callback] The function to customize cloning values.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {*} Returns the deep cloned value.
 * @example
 *
 * var characters = [
 *   { 'name': 'barney', 'age': 36 },
 *   { 'name': 'fred',   'age': 40 }
 * ];
 *
 * var deep = _.cloneDeep(characters);
 * deep[0] === characters[0];
 * // => false
 *
 * var view = {
 *   'label': 'docs',
 *   'node': element
 * };
 *
 * var clone = _.cloneDeep(view, function(value) {
 *   return _.isElement(value) ? value.cloneNode(true) : undefined;
 * });
 *
 * clone.node == view.node;
 * // => false
 */
function cloneDeep(value, callback, thisArg) {
  return baseClone(value, true, typeof callback == 'function' && baseCreateCallback(callback, thisArg, 1));
}

module.exports = cloneDeep;

},{"lodash._baseclone":8,"lodash._basecreatecallback":27}],8:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var assign = require('lodash.assign'),
    forEach = require('lodash.foreach'),
    forOwn = require('lodash.forown'),
    getArray = require('lodash._getarray'),
    isArray = require('lodash.isarray'),
    isObject = require('lodash.isobject'),
    releaseArray = require('lodash._releasearray'),
    slice = require('lodash._slice');

/** Used to match regexp flags from their coerced string values */
var reFlags = /\w*$/;

/** `Object#toString` result shortcuts */
var argsClass = '[object Arguments]',
    arrayClass = '[object Array]',
    boolClass = '[object Boolean]',
    dateClass = '[object Date]',
    funcClass = '[object Function]',
    numberClass = '[object Number]',
    objectClass = '[object Object]',
    regexpClass = '[object RegExp]',
    stringClass = '[object String]';

/** Used to identify object classifications that `_.clone` supports */
var cloneableClasses = {};
cloneableClasses[funcClass] = false;
cloneableClasses[argsClass] = cloneableClasses[arrayClass] =
cloneableClasses[boolClass] = cloneableClasses[dateClass] =
cloneableClasses[numberClass] = cloneableClasses[objectClass] =
cloneableClasses[regexpClass] = cloneableClasses[stringClass] = true;

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/** Native method shortcuts */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Used to lookup a built-in constructor by [[Class]] */
var ctorByClass = {};
ctorByClass[arrayClass] = Array;
ctorByClass[boolClass] = Boolean;
ctorByClass[dateClass] = Date;
ctorByClass[funcClass] = Function;
ctorByClass[objectClass] = Object;
ctorByClass[numberClass] = Number;
ctorByClass[regexpClass] = RegExp;
ctorByClass[stringClass] = String;

/**
 * The base implementation of `_.clone` without argument juggling or support
 * for `thisArg` binding.
 *
 * @private
 * @param {*} value The value to clone.
 * @param {boolean} [isDeep=false] Specify a deep clone.
 * @param {Function} [callback] The function to customize cloning values.
 * @param {Array} [stackA=[]] Tracks traversed source objects.
 * @param {Array} [stackB=[]] Associates clones with source counterparts.
 * @returns {*} Returns the cloned value.
 */
function baseClone(value, isDeep, callback, stackA, stackB) {
  if (callback) {
    var result = callback(value);
    if (typeof result != 'undefined') {
      return result;
    }
  }
  // inspect [[Class]]
  var isObj = isObject(value);
  if (isObj) {
    var className = toString.call(value);
    if (!cloneableClasses[className]) {
      return value;
    }
    var ctor = ctorByClass[className];
    switch (className) {
      case boolClass:
      case dateClass:
        return new ctor(+value);

      case numberClass:
      case stringClass:
        return new ctor(value);

      case regexpClass:
        result = ctor(value.source, reFlags.exec(value));
        result.lastIndex = value.lastIndex;
        return result;
    }
  } else {
    return value;
  }
  var isArr = isArray(value);
  if (isDeep) {
    // check for circular references and return corresponding clone
    var initedStack = !stackA;
    stackA || (stackA = getArray());
    stackB || (stackB = getArray());

    var length = stackA.length;
    while (length--) {
      if (stackA[length] == value) {
        return stackB[length];
      }
    }
    result = isArr ? ctor(value.length) : {};
  }
  else {
    result = isArr ? slice(value) : assign({}, value);
  }
  // add array properties assigned by `RegExp#exec`
  if (isArr) {
    if (hasOwnProperty.call(value, 'index')) {
      result.index = value.index;
    }
    if (hasOwnProperty.call(value, 'input')) {
      result.input = value.input;
    }
  }
  // exit for shallow clone
  if (!isDeep) {
    return result;
  }
  // add the source value to the stack of traversed objects
  // and associate it with its clone
  stackA.push(value);
  stackB.push(result);

  // recursively populate clone (susceptible to call stack limits)
  (isArr ? forEach : forOwn)(value, function(objValue, key) {
    result[key] = baseClone(objValue, isDeep, callback, stackA, stackB);
  });

  if (initedStack) {
    releaseArray(stackA);
    releaseArray(stackB);
  }
  return result;
}

module.exports = baseClone;

},{"lodash._getarray":9,"lodash._releasearray":11,"lodash._slice":14,"lodash.assign":15,"lodash.foreach":65,"lodash.forown":20,"lodash.isarray":94,"lodash.isobject":25}],9:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var arrayPool = require('lodash._arraypool');

/**
 * Gets an array from the array pool or creates a new one if the pool is empty.
 *
 * @private
 * @returns {Array} The array from the pool.
 */
function getArray() {
  return arrayPool.pop() || [];
}

module.exports = getArray;

},{"lodash._arraypool":10}],10:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used to pool arrays and objects used internally */
var arrayPool = [];

module.exports = arrayPool;

},{}],11:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var arrayPool = require('lodash._arraypool'),
    maxPoolSize = require('lodash._maxpoolsize');

/**
 * Releases the given array back to the array pool.
 *
 * @private
 * @param {Array} [array] The array to release.
 */
function releaseArray(array) {
  array.length = 0;
  if (arrayPool.length < maxPoolSize) {
    arrayPool.push(array);
  }
}

module.exports = releaseArray;

},{"lodash._arraypool":12,"lodash._maxpoolsize":13}],12:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],13:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used as the max size of the `arrayPool` and `objectPool` */
var maxPoolSize = 40;

module.exports = maxPoolSize;

},{}],14:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * Slices the `collection` from the `start` index up to, but not including,
 * the `end` index.
 *
 * Note: This function is used instead of `Array#slice` to support node lists
 * in IE < 9 and to ensure dense arrays are returned.
 *
 * @private
 * @param {Array|Object|string} collection The collection to slice.
 * @param {number} start The start index.
 * @param {number} end The end index.
 * @returns {Array} Returns the new array.
 */
function slice(array, start, end) {
  start || (start = 0);
  if (typeof end == 'undefined') {
    end = array ? array.length : 0;
  }
  var index = -1,
      length = end - start || 0,
      result = Array(length < 0 ? 0 : length);

  while (++index < length) {
    result[index] = array[start + index];
  }
  return result;
}

module.exports = slice;

},{}],15:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreateCallback = require('lodash._basecreatecallback'),
    keys = require('lodash.keys'),
    objectTypes = require('lodash._objecttypes');

/**
 * Assigns own enumerable properties of source object(s) to the destination
 * object. Subsequent sources will overwrite property assignments of previous
 * sources. If a callback is provided it will be executed to produce the
 * assigned values. The callback is bound to `thisArg` and invoked with two
 * arguments; (objectValue, sourceValue).
 *
 * @static
 * @memberOf _
 * @type Function
 * @alias extend
 * @category Objects
 * @param {Object} object The destination object.
 * @param {...Object} [source] The source objects.
 * @param {Function} [callback] The function to customize assigning values.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Object} Returns the destination object.
 * @example
 *
 * _.assign({ 'name': 'fred' }, { 'employer': 'slate' });
 * // => { 'name': 'fred', 'employer': 'slate' }
 *
 * var defaults = _.partialRight(_.assign, function(a, b) {
 *   return typeof a == 'undefined' ? b : a;
 * });
 *
 * var object = { 'name': 'barney' };
 * defaults(object, { 'name': 'fred', 'employer': 'slate' });
 * // => { 'name': 'barney', 'employer': 'slate' }
 */
var assign = function(object, source, guard) {
  var index, iterable = object, result = iterable;
  if (!iterable) return result;
  var args = arguments,
      argsIndex = 0,
      argsLength = typeof guard == 'number' ? 2 : args.length;
  if (argsLength > 3 && typeof args[argsLength - 2] == 'function') {
    var callback = baseCreateCallback(args[--argsLength - 1], args[argsLength--], 2);
  } else if (argsLength > 2 && typeof args[argsLength - 1] == 'function') {
    callback = args[--argsLength];
  }
  while (++argsIndex < argsLength) {
    iterable = args[argsIndex];
    if (iterable && objectTypes[typeof iterable]) {
    var ownIndex = -1,
        ownProps = objectTypes[typeof iterable] && keys(iterable),
        length = ownProps ? ownProps.length : 0;

    while (++ownIndex < length) {
      index = ownProps[ownIndex];
      result[index] = callback ? callback(result[index], iterable[index]) : iterable[index];
    }
    }
  }
  return result
};

module.exports = assign;

},{"lodash._basecreatecallback":27,"lodash._objecttypes":16,"lodash.keys":17}],16:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used to determine if values are of the language type Object */
var objectTypes = {
  'boolean': false,
  'function': true,
  'object': true,
  'number': false,
  'string': false,
  'undefined': false
};

module.exports = objectTypes;

},{}],17:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNative = require('lodash._isnative'),
    isObject = require('lodash.isobject'),
    shimKeys = require('lodash._shimkeys');

/* Native method shortcuts for methods with the same name as other `lodash` methods */
var nativeKeys = isNative(nativeKeys = Object.keys) && nativeKeys;

/**
 * Creates an array composed of the own enumerable property names of an object.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {Object} object The object to inspect.
 * @returns {Array} Returns an array of property names.
 * @example
 *
 * _.keys({ 'one': 1, 'two': 2, 'three': 3 });
 * // => ['one', 'two', 'three'] (property order is not guaranteed across environments)
 */
var keys = !nativeKeys ? shimKeys : function(object) {
  if (!isObject(object)) {
    return [];
  }
  return nativeKeys(object);
};

module.exports = keys;

},{"lodash._isnative":18,"lodash._shimkeys":19,"lodash.isobject":25}],18:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/** Used to detect if a method is native */
var reNative = RegExp('^' +
  String(toString)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/toString| for [^\]]+/g, '.*?') + '$'
);

/**
 * Checks if `value` is a native function.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is a native function, else `false`.
 */
function isNative(value) {
  return typeof value == 'function' && reNative.test(value);
}

module.exports = isNative;

},{}],19:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var objectTypes = require('lodash._objecttypes');

/** Used for native method references */
var objectProto = Object.prototype;

/** Native method shortcuts */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A fallback implementation of `Object.keys` which produces an array of the
 * given object's own enumerable property names.
 *
 * @private
 * @type Function
 * @param {Object} object The object to inspect.
 * @returns {Array} Returns an array of property names.
 */
var shimKeys = function(object) {
  var index, iterable = object, result = [];
  if (!iterable) return result;
  if (!(objectTypes[typeof object])) return result;
    for (index in iterable) {
      if (hasOwnProperty.call(iterable, index)) {
        result.push(index);
      }
    }
  return result
};

module.exports = shimKeys;

},{"lodash._objecttypes":16}],20:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreateCallback = require('lodash._basecreatecallback'),
    keys = require('lodash.keys'),
    objectTypes = require('lodash._objecttypes');

/**
 * Iterates over own enumerable properties of an object, executing the callback
 * for each property. The callback is bound to `thisArg` and invoked with three
 * arguments; (value, key, object). Callbacks may exit iteration early by
 * explicitly returning `false`.
 *
 * @static
 * @memberOf _
 * @type Function
 * @category Objects
 * @param {Object} object The object to iterate over.
 * @param {Function} [callback=identity] The function called per iteration.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Object} Returns `object`.
 * @example
 *
 * _.forOwn({ '0': 'zero', '1': 'one', 'length': 2 }, function(num, key) {
 *   console.log(key);
 * });
 * // => logs '0', '1', and 'length' (property order is not guaranteed across environments)
 */
var forOwn = function(collection, callback, thisArg) {
  var index, iterable = collection, result = iterable;
  if (!iterable) return result;
  if (!objectTypes[typeof iterable]) return result;
  callback = callback && typeof thisArg == 'undefined' ? callback : baseCreateCallback(callback, thisArg, 3);
    var ownIndex = -1,
        ownProps = objectTypes[typeof iterable] && keys(iterable),
        length = ownProps ? ownProps.length : 0;

    while (++ownIndex < length) {
      index = ownProps[ownIndex];
      if (callback(iterable[index], index, collection) === false) return result;
    }
  return result
};

module.exports = forOwn;

},{"lodash._basecreatecallback":27,"lodash._objecttypes":21,"lodash.keys":22}],21:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],22:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":23,"lodash._shimkeys":24,"lodash.isobject":25}],23:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],24:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":21}],25:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var objectTypes = require('lodash._objecttypes');

/**
 * Checks if `value` is the language type of Object.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is an object, else `false`.
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
  // check if the value is the ECMAScript language type of Object
  // http://es5.github.io/#x8
  // and avoid a V8 bug
  // http://code.google.com/p/v8/issues/detail?id=2291
  return !!(value && objectTypes[typeof value]);
}

module.exports = isObject;

},{"lodash._objecttypes":26}],26:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],27:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var bind = require('lodash.bind'),
    identity = require('lodash.identity'),
    setBindData = require('lodash._setbinddata'),
    support = require('lodash.support');

/** Used to detected named functions */
var reFuncName = /^\s*function[ \n\r\t]+\w/;

/** Used to detect functions containing a `this` reference */
var reThis = /\bthis\b/;

/** Native method shortcuts */
var fnToString = Function.prototype.toString;

/**
 * The base implementation of `_.createCallback` without support for creating
 * "_.pluck" or "_.where" style callbacks.
 *
 * @private
 * @param {*} [func=identity] The value to convert to a callback.
 * @param {*} [thisArg] The `this` binding of the created callback.
 * @param {number} [argCount] The number of arguments the callback accepts.
 * @returns {Function} Returns a callback function.
 */
function baseCreateCallback(func, thisArg, argCount) {
  if (typeof func != 'function') {
    return identity;
  }
  // exit early for no `thisArg` or already bound by `Function#bind`
  if (typeof thisArg == 'undefined' || !('prototype' in func)) {
    return func;
  }
  var bindData = func.__bindData__;
  if (typeof bindData == 'undefined') {
    if (support.funcNames) {
      bindData = !func.name;
    }
    bindData = bindData || !support.funcDecomp;
    if (!bindData) {
      var source = fnToString.call(func);
      if (!support.funcNames) {
        bindData = !reFuncName.test(source);
      }
      if (!bindData) {
        // checks if `func` references the `this` keyword and stores the result
        bindData = reThis.test(source);
        setBindData(func, bindData);
      }
    }
  }
  // exit early if there are no `this` references or `func` is bound
  if (bindData === false || (bindData !== true && bindData[1] & 1)) {
    return func;
  }
  switch (argCount) {
    case 1: return function(value) {
      return func.call(thisArg, value);
    };
    case 2: return function(a, b) {
      return func.call(thisArg, a, b);
    };
    case 3: return function(value, index, collection) {
      return func.call(thisArg, value, index, collection);
    };
    case 4: return function(accumulator, value, index, collection) {
      return func.call(thisArg, accumulator, value, index, collection);
    };
  }
  return bind(func, thisArg);
}

module.exports = baseCreateCallback;

},{"lodash._setbinddata":28,"lodash.bind":31,"lodash.identity":46,"lodash.support":47}],28:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNative = require('lodash._isnative'),
    noop = require('lodash.noop');

/** Used as the property descriptor for `__bindData__` */
var descriptor = {
  'configurable': false,
  'enumerable': false,
  'value': null,
  'writable': false
};

/** Used to set meta data on functions */
var defineProperty = (function() {
  // IE 8 only accepts DOM elements
  try {
    var o = {},
        func = isNative(func = Object.defineProperty) && func,
        result = func(o, o, o) && func;
  } catch(e) { }
  return result;
}());

/**
 * Sets `this` binding data on a given function.
 *
 * @private
 * @param {Function} func The function to set data on.
 * @param {Array} value The data array to set.
 */
var setBindData = !defineProperty ? noop : function(func, value) {
  descriptor.value = value;
  defineProperty(func, '__bindData__', descriptor);
};

module.exports = setBindData;

},{"lodash._isnative":29,"lodash.noop":30}],29:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],30:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * A no-operation function.
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @example
 *
 * var object = { 'name': 'fred' };
 * _.noop(object) === undefined;
 * // => true
 */
function noop() {
  // no operation performed
}

module.exports = noop;

},{}],31:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var createWrapper = require('lodash._createwrapper'),
    slice = require('lodash._slice');

/**
 * Creates a function that, when called, invokes `func` with the `this`
 * binding of `thisArg` and prepends any additional `bind` arguments to those
 * provided to the bound function.
 *
 * @static
 * @memberOf _
 * @category Functions
 * @param {Function} func The function to bind.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {...*} [arg] Arguments to be partially applied.
 * @returns {Function} Returns the new bound function.
 * @example
 *
 * var func = function(greeting) {
 *   return greeting + ' ' + this.name;
 * };
 *
 * func = _.bind(func, { 'name': 'fred' }, 'hi');
 * func();
 * // => 'hi fred'
 */
function bind(func, thisArg) {
  return arguments.length > 2
    ? createWrapper(func, 17, slice(arguments, 2), null, thisArg)
    : createWrapper(func, 1, null, null, thisArg);
}

module.exports = bind;

},{"lodash._createwrapper":32,"lodash._slice":45}],32:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseBind = require('lodash._basebind'),
    baseCreateWrapper = require('lodash._basecreatewrapper'),
    isFunction = require('lodash.isfunction'),
    slice = require('lodash._slice');

/**
 * Used for `Array` method references.
 *
 * Normally `Array.prototype` would suffice, however, using an array literal
 * avoids issues in Narwhal.
 */
var arrayRef = [];

/** Native method shortcuts */
var push = arrayRef.push,
    unshift = arrayRef.unshift;

/**
 * Creates a function that, when called, either curries or invokes `func`
 * with an optional `this` binding and partially applied arguments.
 *
 * @private
 * @param {Function|string} func The function or method name to reference.
 * @param {number} bitmask The bitmask of method flags to compose.
 *  The bitmask may be composed of the following flags:
 *  1 - `_.bind`
 *  2 - `_.bindKey`
 *  4 - `_.curry`
 *  8 - `_.curry` (bound)
 *  16 - `_.partial`
 *  32 - `_.partialRight`
 * @param {Array} [partialArgs] An array of arguments to prepend to those
 *  provided to the new function.
 * @param {Array} [partialRightArgs] An array of arguments to append to those
 *  provided to the new function.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {number} [arity] The arity of `func`.
 * @returns {Function} Returns the new function.
 */
function createWrapper(func, bitmask, partialArgs, partialRightArgs, thisArg, arity) {
  var isBind = bitmask & 1,
      isBindKey = bitmask & 2,
      isCurry = bitmask & 4,
      isCurryBound = bitmask & 8,
      isPartial = bitmask & 16,
      isPartialRight = bitmask & 32;

  if (!isBindKey && !isFunction(func)) {
    throw new TypeError;
  }
  if (isPartial && !partialArgs.length) {
    bitmask &= ~16;
    isPartial = partialArgs = false;
  }
  if (isPartialRight && !partialRightArgs.length) {
    bitmask &= ~32;
    isPartialRight = partialRightArgs = false;
  }
  var bindData = func && func.__bindData__;
  if (bindData && bindData !== true) {
    // clone `bindData`
    bindData = slice(bindData);
    if (bindData[2]) {
      bindData[2] = slice(bindData[2]);
    }
    if (bindData[3]) {
      bindData[3] = slice(bindData[3]);
    }
    // set `thisBinding` is not previously bound
    if (isBind && !(bindData[1] & 1)) {
      bindData[4] = thisArg;
    }
    // set if previously bound but not currently (subsequent curried functions)
    if (!isBind && bindData[1] & 1) {
      bitmask |= 8;
    }
    // set curried arity if not yet set
    if (isCurry && !(bindData[1] & 4)) {
      bindData[5] = arity;
    }
    // append partial left arguments
    if (isPartial) {
      push.apply(bindData[2] || (bindData[2] = []), partialArgs);
    }
    // append partial right arguments
    if (isPartialRight) {
      unshift.apply(bindData[3] || (bindData[3] = []), partialRightArgs);
    }
    // merge flags
    bindData[1] |= bitmask;
    return createWrapper.apply(null, bindData);
  }
  // fast path for `_.bind`
  var creater = (bitmask == 1 || bitmask === 17) ? baseBind : baseCreateWrapper;
  return creater([func, bitmask, partialArgs, partialRightArgs, thisArg, arity]);
}

module.exports = createWrapper;

},{"lodash._basebind":33,"lodash._basecreatewrapper":39,"lodash._slice":45,"lodash.isfunction":97}],33:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreate = require('lodash._basecreate'),
    isObject = require('lodash.isobject'),
    setBindData = require('lodash._setbinddata'),
    slice = require('lodash._slice');

/**
 * Used for `Array` method references.
 *
 * Normally `Array.prototype` would suffice, however, using an array literal
 * avoids issues in Narwhal.
 */
var arrayRef = [];

/** Native method shortcuts */
var push = arrayRef.push;

/**
 * The base implementation of `_.bind` that creates the bound function and
 * sets its meta data.
 *
 * @private
 * @param {Array} bindData The bind data array.
 * @returns {Function} Returns the new bound function.
 */
function baseBind(bindData) {
  var func = bindData[0],
      partialArgs = bindData[2],
      thisArg = bindData[4];

  function bound() {
    // `Function#bind` spec
    // http://es5.github.io/#x15.3.4.5
    if (partialArgs) {
      // avoid `arguments` object deoptimizations by using `slice` instead
      // of `Array.prototype.slice.call` and not assigning `arguments` to a
      // variable as a ternary expression
      var args = slice(partialArgs);
      push.apply(args, arguments);
    }
    // mimic the constructor's `return` behavior
    // http://es5.github.io/#x13.2.2
    if (this instanceof bound) {
      // ensure `new bound` is an instance of `func`
      var thisBinding = baseCreate(func.prototype),
          result = func.apply(thisBinding, args || arguments);
      return isObject(result) ? result : thisBinding;
    }
    return func.apply(thisArg, args || arguments);
  }
  setBindData(bound, bindData);
  return bound;
}

module.exports = baseBind;

},{"lodash._basecreate":34,"lodash._setbinddata":28,"lodash._slice":45,"lodash.isobject":37}],34:[function(require,module,exports){
(function (global){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNative = require('lodash._isnative'),
    isObject = require('lodash.isobject'),
    noop = require('lodash.noop');

/* Native method shortcuts for methods with the same name as other `lodash` methods */
var nativeCreate = isNative(nativeCreate = Object.create) && nativeCreate;

/**
 * The base implementation of `_.create` without support for assigning
 * properties to the created object.
 *
 * @private
 * @param {Object} prototype The object to inherit from.
 * @returns {Object} Returns the new object.
 */
function baseCreate(prototype, properties) {
  return isObject(prototype) ? nativeCreate(prototype) : {};
}
// fallback for browsers without `Object.create`
if (!nativeCreate) {
  baseCreate = (function() {
    function Object() {}
    return function(prototype) {
      if (isObject(prototype)) {
        Object.prototype = prototype;
        var result = new Object;
        Object.prototype = null;
      }
      return result || global.Object();
    };
  }());
}

module.exports = baseCreate;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash._isnative":35,"lodash.isobject":37,"lodash.noop":36}],35:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],36:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],37:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":38}],38:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],39:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreate = require('lodash._basecreate'),
    isObject = require('lodash.isobject'),
    setBindData = require('lodash._setbinddata'),
    slice = require('lodash._slice');

/**
 * Used for `Array` method references.
 *
 * Normally `Array.prototype` would suffice, however, using an array literal
 * avoids issues in Narwhal.
 */
var arrayRef = [];

/** Native method shortcuts */
var push = arrayRef.push;

/**
 * The base implementation of `createWrapper` that creates the wrapper and
 * sets its meta data.
 *
 * @private
 * @param {Array} bindData The bind data array.
 * @returns {Function} Returns the new function.
 */
function baseCreateWrapper(bindData) {
  var func = bindData[0],
      bitmask = bindData[1],
      partialArgs = bindData[2],
      partialRightArgs = bindData[3],
      thisArg = bindData[4],
      arity = bindData[5];

  var isBind = bitmask & 1,
      isBindKey = bitmask & 2,
      isCurry = bitmask & 4,
      isCurryBound = bitmask & 8,
      key = func;

  function bound() {
    var thisBinding = isBind ? thisArg : this;
    if (partialArgs) {
      var args = slice(partialArgs);
      push.apply(args, arguments);
    }
    if (partialRightArgs || isCurry) {
      args || (args = slice(arguments));
      if (partialRightArgs) {
        push.apply(args, partialRightArgs);
      }
      if (isCurry && args.length < arity) {
        bitmask |= 16 & ~32;
        return baseCreateWrapper([func, (isCurryBound ? bitmask : bitmask & ~3), args, null, thisArg, arity]);
      }
    }
    args || (args = arguments);
    if (isBindKey) {
      func = thisBinding[key];
    }
    if (this instanceof bound) {
      thisBinding = baseCreate(func.prototype);
      var result = func.apply(thisBinding, args);
      return isObject(result) ? result : thisBinding;
    }
    return func.apply(thisBinding, args);
  }
  setBindData(bound, bindData);
  return bound;
}

module.exports = baseCreateWrapper;

},{"lodash._basecreate":40,"lodash._setbinddata":28,"lodash._slice":45,"lodash.isobject":43}],40:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":41,"lodash.isobject":43,"lodash.noop":42}],41:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],42:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],43:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":44}],44:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],45:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],46:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * This method returns the first argument provided to it.
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'name': 'fred' };
 * _.identity(object) === object;
 * // => true
 */
function identity(value) {
  return value;
}

module.exports = identity;

},{}],47:[function(require,module,exports){
(function (global){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNative = require('lodash._isnative');

/** Used to detect functions containing a `this` reference */
var reThis = /\bthis\b/;

/**
 * An object used to flag environments features.
 *
 * @static
 * @memberOf _
 * @type Object
 */
var support = {};

/**
 * Detect if functions can be decompiled by `Function#toString`
 * (all but PS3 and older Opera mobile browsers & avoided in Windows 8 apps).
 *
 * @memberOf _.support
 * @type boolean
 */
support.funcDecomp = !isNative(global.WinRTError) && reThis.test(function() { return this; });

/**
 * Detect if `Function#name` is supported (all but IE).
 *
 * @memberOf _.support
 * @type boolean
 */
support.funcNames = typeof Function.name == 'string';

module.exports = support;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash._isnative":48}],48:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],49:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseDifference = require('lodash._basedifference'),
    baseFlatten = require('lodash._baseflatten');

/**
 * Creates an array excluding all values of the provided arrays using strict
 * equality for comparisons, i.e. `===`.
 *
 * @static
 * @memberOf _
 * @category Arrays
 * @param {Array} array The array to process.
 * @param {...Array} [values] The arrays of values to exclude.
 * @returns {Array} Returns a new array of filtered values.
 * @example
 *
 * _.difference([1, 2, 3, 4, 5], [5, 2, 10]);
 * // => [1, 3, 4]
 */
function difference(array) {
  return baseDifference(array, baseFlatten(arguments, true, true, 1));
}

module.exports = difference;

},{"lodash._basedifference":50,"lodash._baseflatten":63}],50:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseIndexOf = require('lodash._baseindexof'),
    cacheIndexOf = require('lodash._cacheindexof'),
    createCache = require('lodash._createcache'),
    largeArraySize = require('lodash._largearraysize'),
    releaseObject = require('lodash._releaseobject');

/**
 * The base implementation of `_.difference` that accepts a single array
 * of values to exclude.
 *
 * @private
 * @param {Array} array The array to process.
 * @param {Array} [values] The array of values to exclude.
 * @returns {Array} Returns a new array of filtered values.
 */
function baseDifference(array, values) {
  var index = -1,
      indexOf = baseIndexOf,
      length = array ? array.length : 0,
      isLarge = length >= largeArraySize,
      result = [];

  if (isLarge) {
    var cache = createCache(values);
    if (cache) {
      indexOf = cacheIndexOf;
      values = cache;
    } else {
      isLarge = false;
    }
  }
  while (++index < length) {
    var value = array[index];
    if (indexOf(values, value) < 0) {
      result.push(value);
    }
  }
  if (isLarge) {
    releaseObject(values);
  }
  return result;
}

module.exports = baseDifference;

},{"lodash._baseindexof":51,"lodash._cacheindexof":52,"lodash._createcache":54,"lodash._largearraysize":59,"lodash._releaseobject":60}],51:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * The base implementation of `_.indexOf` without support for binary searches
 * or `fromIndex` constraints.
 *
 * @private
 * @param {Array} array The array to search.
 * @param {*} value The value to search for.
 * @param {number} [fromIndex=0] The index to search from.
 * @returns {number} Returns the index of the matched value or `-1`.
 */
function baseIndexOf(array, value, fromIndex) {
  var index = (fromIndex || 0) - 1,
      length = array ? array.length : 0;

  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

module.exports = baseIndexOf;

},{}],52:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseIndexOf = require('lodash._baseindexof'),
    keyPrefix = require('lodash._keyprefix');

/**
 * An implementation of `_.contains` for cache objects that mimics the return
 * signature of `_.indexOf` by returning `0` if the value is found, else `-1`.
 *
 * @private
 * @param {Object} cache The cache object to inspect.
 * @param {*} value The value to search for.
 * @returns {number} Returns `0` if `value` is found, else `-1`.
 */
function cacheIndexOf(cache, value) {
  var type = typeof value;
  cache = cache.cache;

  if (type == 'boolean' || value == null) {
    return cache[value] ? 0 : -1;
  }
  if (type != 'number' && type != 'string') {
    type = 'object';
  }
  var key = type == 'number' ? value : keyPrefix + value;
  cache = (cache = cache[type]) && cache[key];

  return type == 'object'
    ? (cache && baseIndexOf(cache, value) > -1 ? 0 : -1)
    : (cache ? 0 : -1);
}

module.exports = cacheIndexOf;

},{"lodash._baseindexof":51,"lodash._keyprefix":53}],53:[function(require,module,exports){
/**
 * Lo-Dash 2.4.2 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2014 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used to prefix keys to avoid issues with `__proto__` and properties on `Object.prototype` */
var keyPrefix = '__1335248838000__';

module.exports = keyPrefix;

},{}],54:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var cachePush = require('lodash._cachepush'),
    getObject = require('lodash._getobject'),
    releaseObject = require('lodash._releaseobject');

/**
 * Creates a cache object to optimize linear searches of large arrays.
 *
 * @private
 * @param {Array} [array=[]] The array to search.
 * @returns {null|Object} Returns the cache object or `null` if caching should not be used.
 */
function createCache(array) {
  var index = -1,
      length = array.length,
      first = array[0],
      mid = array[(length / 2) | 0],
      last = array[length - 1];

  if (first && typeof first == 'object' &&
      mid && typeof mid == 'object' && last && typeof last == 'object') {
    return false;
  }
  var cache = getObject();
  cache['false'] = cache['null'] = cache['true'] = cache['undefined'] = false;

  var result = getObject();
  result.array = array;
  result.cache = cache;
  result.push = cachePush;

  while (++index < length) {
    result.push(array[index]);
  }
  return result;
}

module.exports = createCache;

},{"lodash._cachepush":55,"lodash._getobject":57,"lodash._releaseobject":60}],55:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var keyPrefix = require('lodash._keyprefix');

/**
 * Adds a given value to the corresponding cache object.
 *
 * @private
 * @param {*} value The value to add to the cache.
 */
function cachePush(value) {
  var cache = this.cache,
      type = typeof value;

  if (type == 'boolean' || value == null) {
    cache[value] = true;
  } else {
    if (type != 'number' && type != 'string') {
      type = 'object';
    }
    var key = type == 'number' ? value : keyPrefix + value,
        typeCache = cache[type] || (cache[type] = {});

    if (type == 'object') {
      (typeCache[key] || (typeCache[key] = [])).push(value);
    } else {
      typeCache[key] = true;
    }
  }
}

module.exports = cachePush;

},{"lodash._keyprefix":56}],56:[function(require,module,exports){
module.exports=require(53)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":53}],57:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var objectPool = require('lodash._objectpool');

/**
 * Gets an object from the object pool or creates a new one if the pool is empty.
 *
 * @private
 * @returns {Object} The object from the pool.
 */
function getObject() {
  return objectPool.pop() || {
    'array': null,
    'cache': null,
    'criteria': null,
    'false': false,
    'index': 0,
    'null': false,
    'number': null,
    'object': null,
    'push': null,
    'string': null,
    'true': false,
    'undefined': false,
    'value': null
  };
}

module.exports = getObject;

},{"lodash._objectpool":58}],58:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used to pool arrays and objects used internally */
var objectPool = [];

module.exports = objectPool;

},{}],59:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** Used as the size when optimizations are enabled for large arrays */
var largeArraySize = 75;

module.exports = largeArraySize;

},{}],60:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var maxPoolSize = require('lodash._maxpoolsize'),
    objectPool = require('lodash._objectpool');

/**
 * Releases the given object back to the object pool.
 *
 * @private
 * @param {Object} [object] The object to release.
 */
function releaseObject(object) {
  var cache = object.cache;
  if (cache) {
    releaseObject(cache);
  }
  object.array = object.cache = object.criteria = object.object = object.number = object.string = object.value = null;
  if (objectPool.length < maxPoolSize) {
    objectPool.push(object);
  }
}

module.exports = releaseObject;

},{"lodash._maxpoolsize":61,"lodash._objectpool":62}],61:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],62:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":58}],63:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isArguments = require('lodash.isarguments'),
    isArray = require('lodash.isarray');

/**
 * The base implementation of `_.flatten` without support for callback
 * shorthands or `thisArg` binding.
 *
 * @private
 * @param {Array} array The array to flatten.
 * @param {boolean} [isShallow=false] A flag to restrict flattening to a single level.
 * @param {boolean} [isStrict=false] A flag to restrict flattening to arrays and `arguments` objects.
 * @param {number} [fromIndex=0] The index to start from.
 * @returns {Array} Returns a new flattened array.
 */
function baseFlatten(array, isShallow, isStrict, fromIndex) {
  var index = (fromIndex || 0) - 1,
      length = array ? array.length : 0,
      result = [];

  while (++index < length) {
    var value = array[index];

    if (value && typeof value == 'object' && typeof value.length == 'number'
        && (isArray(value) || isArguments(value))) {
      // recursively flatten arrays (susceptible to call stack limits)
      if (!isShallow) {
        value = baseFlatten(value, isShallow, isStrict);
      }
      var valIndex = -1,
          valLength = value.length,
          resIndex = result.length;

      result.length += valLength;
      while (++valIndex < valLength) {
        result[resIndex++] = value[valIndex];
      }
    } else if (!isStrict) {
      result.push(value);
    }
  }
  return result;
}

module.exports = baseFlatten;

},{"lodash.isarguments":64,"lodash.isarray":94}],64:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** `Object#toString` result shortcuts */
var argsClass = '[object Arguments]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/**
 * Checks if `value` is an `arguments` object.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is an `arguments` object, else `false`.
 * @example
 *
 * (function() { return _.isArguments(arguments); })(1, 2, 3);
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  return value && typeof value == 'object' && typeof value.length == 'number' &&
    toString.call(value) == argsClass || false;
}

module.exports = isArguments;

},{}],65:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreateCallback = require('lodash._basecreatecallback'),
    forOwn = require('lodash.forown');

/**
 * Iterates over elements of a collection, executing the callback for each
 * element. The callback is bound to `thisArg` and invoked with three arguments;
 * (value, index|key, collection). Callbacks may exit iteration early by
 * explicitly returning `false`.
 *
 * Note: As with other "Collections" methods, objects with a `length` property
 * are iterated like arrays. To avoid this behavior `_.forIn` or `_.forOwn`
 * may be used for object iteration.
 *
 * @static
 * @memberOf _
 * @alias each
 * @category Collections
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} [callback=identity] The function called per iteration.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Array|Object|string} Returns `collection`.
 * @example
 *
 * _([1, 2, 3]).forEach(function(num) { console.log(num); }).join(',');
 * // => logs each number and returns '1,2,3'
 *
 * _.forEach({ 'one': 1, 'two': 2, 'three': 3 }, function(num) { console.log(num); });
 * // => logs each number and returns the object (property order is not guaranteed across environments)
 */
function forEach(collection, callback, thisArg) {
  var index = -1,
      length = collection ? collection.length : 0;

  callback = callback && typeof thisArg == 'undefined' ? callback : baseCreateCallback(callback, thisArg, 3);
  if (typeof length == 'number') {
    while (++index < length) {
      if (callback(collection[index], index, collection) === false) {
        break;
      }
    }
  } else {
    forOwn(collection, callback);
  }
  return collection;
}

module.exports = forEach;

},{"lodash._basecreatecallback":66,"lodash.forown":88}],66:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":67,"lodash.bind":70,"lodash.identity":85,"lodash.support":86}],67:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":68,"lodash.noop":69}],68:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],69:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],70:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":71,"lodash._slice":84}],71:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":72,"lodash._basecreatewrapper":78,"lodash._slice":84,"lodash.isfunction":97}],72:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":73,"lodash._setbinddata":67,"lodash._slice":84,"lodash.isobject":76}],73:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":74,"lodash.isobject":76,"lodash.noop":75}],74:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],75:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],76:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":77}],77:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],78:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":79,"lodash._setbinddata":67,"lodash._slice":84,"lodash.isobject":82}],79:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":80,"lodash.isobject":82,"lodash.noop":81}],80:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],81:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],82:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":83}],83:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],84:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],85:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],86:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":87}],87:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],88:[function(require,module,exports){
module.exports=require(20)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.forown/index.js":20,"lodash._basecreatecallback":66,"lodash._objecttypes":89,"lodash.keys":90}],89:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],90:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":91,"lodash._shimkeys":92,"lodash.isobject":93}],91:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],92:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":89}],93:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":89}],94:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNative = require('lodash._isnative');

/** `Object#toString` result shortcuts */
var arrayClass = '[object Array]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/* Native method shortcuts for methods with the same name as other `lodash` methods */
var nativeIsArray = isNative(nativeIsArray = Array.isArray) && nativeIsArray;

/**
 * Checks if `value` is an array.
 *
 * @static
 * @memberOf _
 * @type Function
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is an array, else `false`.
 * @example
 *
 * (function() { return _.isArray(arguments); })();
 * // => false
 *
 * _.isArray([1, 2, 3]);
 * // => true
 */
var isArray = nativeIsArray || function(value) {
  return value && typeof value == 'object' && typeof value.length == 'number' &&
    toString.call(value) == arrayClass || false;
};

module.exports = isArray;

},{"lodash._isnative":95}],95:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],96:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** `Object#toString` result shortcuts */
var boolClass = '[object Boolean]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/**
 * Checks if `value` is a boolean value.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is a boolean value, else `false`.
 * @example
 *
 * _.isBoolean(null);
 * // => false
 */
function isBoolean(value) {
  return value === true || value === false ||
    value && typeof value == 'object' && toString.call(value) == boolClass || false;
}

module.exports = isBoolean;

},{}],97:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * Checks if `value` is a function.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 */
function isFunction(value) {
  return typeof value == 'function';
}

module.exports = isFunction;

},{}],98:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNumber = require('lodash.isnumber');

/**
 * Checks if `value` is `NaN`.
 *
 * Note: This is not the same as native `isNaN` which will return `true` for
 * `undefined` and other non-numeric values. See http://es5.github.io/#x15.1.2.4.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is `NaN`, else `false`.
 * @example
 *
 * _.isNaN(NaN);
 * // => true
 *
 * _.isNaN(new Number(NaN));
 * // => true
 *
 * isNaN(undefined);
 * // => true
 *
 * _.isNaN(undefined);
 * // => false
 */
function isNaN(value) {
  // `NaN` as a primitive is the only value that is not equal to itself
  // (perform the [[Class]] check first to avoid errors with some host objects in IE)
  return isNumber(value) && value != +value;
}

module.exports = isNaN;

},{"lodash.isnumber":100}],99:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * Checks if `value` is `null`.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is `null`, else `false`.
 * @example
 *
 * _.isNull(null);
 * // => true
 *
 * _.isNull(undefined);
 * // => false
 */
function isNull(value) {
  return value === null;
}

module.exports = isNull;

},{}],100:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** `Object#toString` result shortcuts */
var numberClass = '[object Number]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/**
 * Checks if `value` is a number.
 *
 * Note: `NaN` is considered a number. See http://es5.github.io/#x8.5.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is a number, else `false`.
 * @example
 *
 * _.isNumber(8.4 * 5);
 * // => true
 */
function isNumber(value) {
  return typeof value == 'number' ||
    value && typeof value == 'object' && toString.call(value) == numberClass || false;
}

module.exports = isNumber;

},{}],101:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var isNative = require('lodash._isnative'),
    shimIsPlainObject = require('lodash._shimisplainobject');

/** `Object#toString` result shortcuts */
var objectClass = '[object Object]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/** Native method shortcuts */
var getPrototypeOf = isNative(getPrototypeOf = Object.getPrototypeOf) && getPrototypeOf;

/**
 * Checks if `value` is an object created by the `Object` constructor.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
 * @example
 *
 * function Shape() {
 *   this.x = 0;
 *   this.y = 0;
 * }
 *
 * _.isPlainObject(new Shape);
 * // => false
 *
 * _.isPlainObject([1, 2, 3]);
 * // => false
 *
 * _.isPlainObject({ 'x': 0, 'y': 0 });
 * // => true
 */
var isPlainObject = !getPrototypeOf ? shimIsPlainObject : function(value) {
  if (!(value && toString.call(value) == objectClass)) {
    return false;
  }
  var valueOf = value.valueOf,
      objProto = isNative(valueOf) && (objProto = getPrototypeOf(valueOf)) && getPrototypeOf(objProto);

  return objProto
    ? (value == objProto || getPrototypeOf(value) == objProto)
    : shimIsPlainObject(value);
};

module.exports = isPlainObject;

},{"lodash._isnative":102,"lodash._shimisplainobject":103}],102:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],103:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var forIn = require('lodash.forin'),
    isFunction = require('lodash.isfunction');

/** `Object#toString` result shortcuts */
var objectClass = '[object Object]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/** Native method shortcuts */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A fallback implementation of `isPlainObject` which checks if a given value
 * is an object created by the `Object` constructor, assuming objects created
 * by the `Object` constructor have no inherited enumerable properties and that
 * there are no `Object.prototype` extensions.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
 */
function shimIsPlainObject(value) {
  var ctor,
      result;

  // avoid non Object objects, `arguments` objects, and DOM elements
  if (!(value && toString.call(value) == objectClass) ||
      (ctor = value.constructor, isFunction(ctor) && !(ctor instanceof ctor))) {
    return false;
  }
  // In most environments an object's own properties are iterated before
  // its inherited properties. If the last iterated property is an object's
  // own property then there are no inherited enumerable properties.
  forIn(value, function(value, key) {
    result = key;
  });
  return typeof result == 'undefined' || hasOwnProperty.call(value, result);
}

module.exports = shimIsPlainObject;

},{"lodash.forin":104,"lodash.isfunction":97}],104:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreateCallback = require('lodash._basecreatecallback'),
    objectTypes = require('lodash._objecttypes');

/**
 * Iterates over own and inherited enumerable properties of an object,
 * executing the callback for each property. The callback is bound to `thisArg`
 * and invoked with three arguments; (value, key, object). Callbacks may exit
 * iteration early by explicitly returning `false`.
 *
 * @static
 * @memberOf _
 * @type Function
 * @category Objects
 * @param {Object} object The object to iterate over.
 * @param {Function} [callback=identity] The function called per iteration.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Object} Returns `object`.
 * @example
 *
 * function Shape() {
 *   this.x = 0;
 *   this.y = 0;
 * }
 *
 * Shape.prototype.move = function(x, y) {
 *   this.x += x;
 *   this.y += y;
 * };
 *
 * _.forIn(new Shape, function(value, key) {
 *   console.log(key);
 * });
 * // => logs 'x', 'y', and 'move' (property order is not guaranteed across environments)
 */
var forIn = function(collection, callback, thisArg) {
  var index, iterable = collection, result = iterable;
  if (!iterable) return result;
  if (!objectTypes[typeof iterable]) return result;
  callback = callback && typeof thisArg == 'undefined' ? callback : baseCreateCallback(callback, thisArg, 3);
    for (index in iterable) {
      if (callback(iterable[index], index, collection) === false) return result;
    }
  return result
};

module.exports = forIn;

},{"lodash._basecreatecallback":105,"lodash._objecttypes":121}],105:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":106,"lodash.bind":108,"lodash.identity":119,"lodash.support":120}],106:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":102,"lodash.noop":107}],107:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],108:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":109,"lodash._slice":118}],109:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":110,"lodash._basecreatewrapper":114,"lodash._slice":118,"lodash.isfunction":97}],110:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":111,"lodash._setbinddata":106,"lodash._slice":118,"lodash.isobject":113}],111:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":102,"lodash.isobject":113,"lodash.noop":112}],112:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],113:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":121}],114:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":115,"lodash._setbinddata":106,"lodash._slice":118,"lodash.isobject":117}],115:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":102,"lodash.isobject":117,"lodash.noop":116}],116:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],117:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":121}],118:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],119:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],120:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":102}],121:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],122:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/** `Object#toString` result shortcuts */
var stringClass = '[object String]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/**
 * Checks if `value` is a string.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is a string, else `false`.
 * @example
 *
 * _.isString('fred');
 * // => true
 */
function isString(value) {
  return typeof value == 'string' ||
    value && typeof value == 'object' && toString.call(value) == stringClass || false;
}

module.exports = isString;

},{}],123:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * Checks if `value` is `undefined`.
 *
 * @static
 * @memberOf _
 * @category Objects
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if the `value` is `undefined`, else `false`.
 * @example
 *
 * _.isUndefined(void 0);
 * // => true
 */
function isUndefined(value) {
  return typeof value == 'undefined';
}

module.exports = isUndefined;

},{}],124:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var createCallback = require('lodash.createcallback'),
    forOwn = require('lodash.forown');

/**
 * Creates an array of values by running each element in the collection
 * through the callback. The callback is bound to `thisArg` and invoked with
 * three arguments; (value, index|key, collection).
 *
 * If a property name is provided for `callback` the created "_.pluck" style
 * callback will return the property value of the given element.
 *
 * If an object is provided for `callback` the created "_.where" style callback
 * will return `true` for elements that have the properties of the given object,
 * else `false`.
 *
 * @static
 * @memberOf _
 * @alias collect
 * @category Collections
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function|Object|string} [callback=identity] The function called
 *  per iteration. If a property name or object is provided it will be used
 *  to create a "_.pluck" or "_.where" style callback, respectively.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Array} Returns a new array of the results of each `callback` execution.
 * @example
 *
 * _.map([1, 2, 3], function(num) { return num * 3; });
 * // => [3, 6, 9]
 *
 * _.map({ 'one': 1, 'two': 2, 'three': 3 }, function(num) { return num * 3; });
 * // => [3, 6, 9] (property order is not guaranteed across environments)
 *
 * var characters = [
 *   { 'name': 'barney', 'age': 36 },
 *   { 'name': 'fred',   'age': 40 }
 * ];
 *
 * // using "_.pluck" callback shorthand
 * _.map(characters, 'name');
 * // => ['barney', 'fred']
 */
function map(collection, callback, thisArg) {
  var index = -1,
      length = collection ? collection.length : 0;

  callback = createCallback(callback, thisArg, 3);
  if (typeof length == 'number') {
    var result = Array(length);
    while (++index < length) {
      result[index] = callback(collection[index], index, collection);
    }
  } else {
    result = [];
    forOwn(collection, function(value, key, collection) {
      result[++index] = callback(value, key, collection);
    });
  }
  return result;
}

module.exports = map;

},{"lodash.createcallback":125,"lodash.forown":159}],125:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseCreateCallback = require('lodash._basecreatecallback'),
    baseIsEqual = require('lodash._baseisequal'),
    isObject = require('lodash.isobject'),
    keys = require('lodash.keys'),
    property = require('lodash.property');

/**
 * Produces a callback bound to an optional `thisArg`. If `func` is a property
 * name the created callback will return the property value for a given element.
 * If `func` is an object the created callback will return `true` for elements
 * that contain the equivalent object properties, otherwise it will return `false`.
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @param {*} [func=identity] The value to convert to a callback.
 * @param {*} [thisArg] The `this` binding of the created callback.
 * @param {number} [argCount] The number of arguments the callback accepts.
 * @returns {Function} Returns a callback function.
 * @example
 *
 * var characters = [
 *   { 'name': 'barney', 'age': 36 },
 *   { 'name': 'fred',   'age': 40 }
 * ];
 *
 * // wrap to create custom callback shorthands
 * _.createCallback = _.wrap(_.createCallback, function(func, callback, thisArg) {
 *   var match = /^(.+?)__([gl]t)(.+)$/.exec(callback);
 *   return !match ? func(callback, thisArg) : function(object) {
 *     return match[2] == 'gt' ? object[match[1]] > match[3] : object[match[1]] < match[3];
 *   };
 * });
 *
 * _.filter(characters, 'age__gt38');
 * // => [{ 'name': 'fred', 'age': 40 }]
 */
function createCallback(func, thisArg, argCount) {
  var type = typeof func;
  if (func == null || type == 'function') {
    return baseCreateCallback(func, thisArg, argCount);
  }
  // handle "_.pluck" style callback shorthands
  if (type != 'object') {
    return property(func);
  }
  var props = keys(func),
      key = props[0],
      a = func[key];

  // handle "_.where" style callback shorthands
  if (props.length == 1 && a === a && !isObject(a)) {
    // fast path the common case of providing an object with a single
    // property containing a primitive value
    return function(object) {
      var b = object[key];
      return a === b && (a !== 0 || (1 / a == 1 / b));
    };
  }
  return function(object) {
    var length = props.length,
        result = false;

    while (length--) {
      if (!(result = baseIsEqual(object[props[length]], func[props[length]], null, true))) {
        break;
      }
    }
    return result;
  };
}

module.exports = createCallback;

},{"lodash._basecreatecallback":126,"lodash._baseisequal":144,"lodash.isobject":152,"lodash.keys":154,"lodash.property":158}],126:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":127,"lodash.bind":130,"lodash.identity":141,"lodash.support":142}],127:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":128,"lodash.noop":129}],128:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],129:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],130:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":131,"lodash._slice":140}],131:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":132,"lodash._basecreatewrapper":136,"lodash._slice":140,"lodash.isfunction":97}],132:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":133,"lodash._setbinddata":127,"lodash._slice":140,"lodash.isobject":152}],133:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":134,"lodash.isobject":152,"lodash.noop":135}],134:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],135:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],136:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":137,"lodash._setbinddata":127,"lodash._slice":140,"lodash.isobject":152}],137:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":138,"lodash.isobject":152,"lodash.noop":139}],138:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],139:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],140:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],141:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],142:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":143}],143:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],144:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var forIn = require('lodash.forin'),
    getArray = require('lodash._getarray'),
    isFunction = require('lodash.isfunction'),
    objectTypes = require('lodash._objecttypes'),
    releaseArray = require('lodash._releasearray');

/** `Object#toString` result shortcuts */
var argsClass = '[object Arguments]',
    arrayClass = '[object Array]',
    boolClass = '[object Boolean]',
    dateClass = '[object Date]',
    numberClass = '[object Number]',
    objectClass = '[object Object]',
    regexpClass = '[object RegExp]',
    stringClass = '[object String]';

/** Used for native method references */
var objectProto = Object.prototype;

/** Used to resolve the internal [[Class]] of values */
var toString = objectProto.toString;

/** Native method shortcuts */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * The base implementation of `_.isEqual`, without support for `thisArg` binding,
 * that allows partial "_.where" style comparisons.
 *
 * @private
 * @param {*} a The value to compare.
 * @param {*} b The other value to compare.
 * @param {Function} [callback] The function to customize comparing values.
 * @param {Function} [isWhere=false] A flag to indicate performing partial comparisons.
 * @param {Array} [stackA=[]] Tracks traversed `a` objects.
 * @param {Array} [stackB=[]] Tracks traversed `b` objects.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 */
function baseIsEqual(a, b, callback, isWhere, stackA, stackB) {
  // used to indicate that when comparing objects, `a` has at least the properties of `b`
  if (callback) {
    var result = callback(a, b);
    if (typeof result != 'undefined') {
      return !!result;
    }
  }
  // exit early for identical values
  if (a === b) {
    // treat `+0` vs. `-0` as not equal
    return a !== 0 || (1 / a == 1 / b);
  }
  var type = typeof a,
      otherType = typeof b;

  // exit early for unlike primitive values
  if (a === a &&
      !(a && objectTypes[type]) &&
      !(b && objectTypes[otherType])) {
    return false;
  }
  // exit early for `null` and `undefined` avoiding ES3's Function#call behavior
  // http://es5.github.io/#x15.3.4.4
  if (a == null || b == null) {
    return a === b;
  }
  // compare [[Class]] names
  var className = toString.call(a),
      otherClass = toString.call(b);

  if (className == argsClass) {
    className = objectClass;
  }
  if (otherClass == argsClass) {
    otherClass = objectClass;
  }
  if (className != otherClass) {
    return false;
  }
  switch (className) {
    case boolClass:
    case dateClass:
      // coerce dates and booleans to numbers, dates to milliseconds and booleans
      // to `1` or `0` treating invalid dates coerced to `NaN` as not equal
      return +a == +b;

    case numberClass:
      // treat `NaN` vs. `NaN` as equal
      return (a != +a)
        ? b != +b
        // but treat `+0` vs. `-0` as not equal
        : (a == 0 ? (1 / a == 1 / b) : a == +b);

    case regexpClass:
    case stringClass:
      // coerce regexes to strings (http://es5.github.io/#x15.10.6.4)
      // treat string primitives and their corresponding object instances as equal
      return a == String(b);
  }
  var isArr = className == arrayClass;
  if (!isArr) {
    // unwrap any `lodash` wrapped values
    var aWrapped = hasOwnProperty.call(a, '__wrapped__'),
        bWrapped = hasOwnProperty.call(b, '__wrapped__');

    if (aWrapped || bWrapped) {
      return baseIsEqual(aWrapped ? a.__wrapped__ : a, bWrapped ? b.__wrapped__ : b, callback, isWhere, stackA, stackB);
    }
    // exit for functions and DOM nodes
    if (className != objectClass) {
      return false;
    }
    // in older versions of Opera, `arguments` objects have `Array` constructors
    var ctorA = a.constructor,
        ctorB = b.constructor;

    // non `Object` object instances with different constructors are not equal
    if (ctorA != ctorB &&
          !(isFunction(ctorA) && ctorA instanceof ctorA && isFunction(ctorB) && ctorB instanceof ctorB) &&
          ('constructor' in a && 'constructor' in b)
        ) {
      return false;
    }
  }
  // assume cyclic structures are equal
  // the algorithm for detecting cyclic structures is adapted from ES 5.1
  // section 15.12.3, abstract operation `JO` (http://es5.github.io/#x15.12.3)
  var initedStack = !stackA;
  stackA || (stackA = getArray());
  stackB || (stackB = getArray());

  var length = stackA.length;
  while (length--) {
    if (stackA[length] == a) {
      return stackB[length] == b;
    }
  }
  var size = 0;
  result = true;

  // add `a` and `b` to the stack of traversed objects
  stackA.push(a);
  stackB.push(b);

  // recursively compare objects and arrays (susceptible to call stack limits)
  if (isArr) {
    // compare lengths to determine if a deep comparison is necessary
    length = a.length;
    size = b.length;
    result = size == length;

    if (result || isWhere) {
      // deep compare the contents, ignoring non-numeric properties
      while (size--) {
        var index = length,
            value = b[size];

        if (isWhere) {
          while (index--) {
            if ((result = baseIsEqual(a[index], value, callback, isWhere, stackA, stackB))) {
              break;
            }
          }
        } else if (!(result = baseIsEqual(a[size], value, callback, isWhere, stackA, stackB))) {
          break;
        }
      }
    }
  }
  else {
    // deep compare objects using `forIn`, instead of `forOwn`, to avoid `Object.keys`
    // which, in this case, is more costly
    forIn(b, function(value, key, b) {
      if (hasOwnProperty.call(b, key)) {
        // count the number of properties.
        size++;
        // deep compare each property value.
        return (result = hasOwnProperty.call(a, key) && baseIsEqual(a[key], value, callback, isWhere, stackA, stackB));
      }
    });

    if (result && !isWhere) {
      // ensure both objects have the same number of properties
      forIn(a, function(value, key, a) {
        if (hasOwnProperty.call(a, key)) {
          // `size` will be `-1` if `a` has more properties than `b`
          return (result = --size > -1);
        }
      });
    }
  }
  stackA.pop();
  stackB.pop();

  if (initedStack) {
    releaseArray(stackA);
    releaseArray(stackB);
  }
  return result;
}

module.exports = baseIsEqual;

},{"lodash._getarray":145,"lodash._objecttypes":147,"lodash._releasearray":148,"lodash.forin":151,"lodash.isfunction":97}],145:[function(require,module,exports){
module.exports=require(9)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":9,"lodash._arraypool":146}],146:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],147:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],148:[function(require,module,exports){
module.exports=require(11)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":11,"lodash._arraypool":149,"lodash._maxpoolsize":150}],149:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],150:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],151:[function(require,module,exports){
module.exports=require(104)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.isplainobject/node_modules/lodash._shimisplainobject/node_modules/lodash.forin/index.js":104,"lodash._basecreatecallback":126,"lodash._objecttypes":147}],152:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":153}],153:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],154:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":155,"lodash._shimkeys":156,"lodash.isobject":152}],155:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],156:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":157}],157:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],158:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */

/**
 * Creates a "_.pluck" style function, which returns the `key` value of a
 * given object.
 *
 * @static
 * @memberOf _
 * @category Utilities
 * @param {string} key The name of the property to retrieve.
 * @returns {Function} Returns the new function.
 * @example
 *
 * var characters = [
 *   { 'name': 'fred',   'age': 40 },
 *   { 'name': 'barney', 'age': 36 }
 * ];
 *
 * var getName = _.property('name');
 *
 * _.map(characters, getName);
 * // => ['barney', 'fred']
 *
 * _.sortBy(characters, getName);
 * // => [{ 'name': 'barney', 'age': 36 }, { 'name': 'fred',   'age': 40 }]
 */
function property(key) {
  return function(object) {
    return object[key];
  };
}

module.exports = property;

},{}],159:[function(require,module,exports){
module.exports=require(20)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.forown/index.js":20,"lodash._basecreatecallback":160,"lodash._objecttypes":180,"lodash.keys":181}],160:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":161,"lodash.bind":164,"lodash.identity":177,"lodash.support":178}],161:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":162,"lodash.noop":163}],162:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],163:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],164:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":165,"lodash._slice":176}],165:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":166,"lodash._basecreatewrapper":171,"lodash._slice":176,"lodash.isfunction":97}],166:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":167,"lodash._setbinddata":161,"lodash._slice":176,"lodash.isobject":170}],167:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":168,"lodash.isobject":170,"lodash.noop":169}],168:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],169:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],170:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":180}],171:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":172,"lodash._setbinddata":161,"lodash._slice":176,"lodash.isobject":175}],172:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":173,"lodash.isobject":175,"lodash.noop":174}],173:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],174:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],175:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":180}],176:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],177:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],178:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":179}],179:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],180:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],181:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":182,"lodash._shimkeys":183,"lodash.isobject":184}],182:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],183:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":180}],184:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":180}],185:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var createCallback = require('lodash.createcallback'),
    forOwn = require('lodash.forown');

/**
 * Reduces a collection to a value which is the accumulated result of running
 * each element in the collection through the callback, where each successive
 * callback execution consumes the return value of the previous execution. If
 * `accumulator` is not provided the first element of the collection will be
 * used as the initial `accumulator` value. The callback is bound to `thisArg`
 * and invoked with four arguments; (accumulator, value, index|key, collection).
 *
 * @static
 * @memberOf _
 * @alias foldl, inject
 * @category Collections
 * @param {Array|Object|string} collection The collection to iterate over.
 * @param {Function} [callback=identity] The function called per iteration.
 * @param {*} [accumulator] Initial value of the accumulator.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {*} Returns the accumulated value.
 * @example
 *
 * var sum = _.reduce([1, 2, 3], function(sum, num) {
 *   return sum + num;
 * });
 * // => 6
 *
 * var mapped = _.reduce({ 'a': 1, 'b': 2, 'c': 3 }, function(result, num, key) {
 *   result[key] = num * 3;
 *   return result;
 * }, {});
 * // => { 'a': 3, 'b': 6, 'c': 9 }
 */
function reduce(collection, callback, accumulator, thisArg) {
  if (!collection) return accumulator;
  var noaccum = arguments.length < 3;
  callback = createCallback(callback, thisArg, 4);

  var index = -1,
      length = collection.length;

  if (typeof length == 'number') {
    if (noaccum) {
      accumulator = collection[++index];
    }
    while (++index < length) {
      accumulator = callback(accumulator, collection[index], index, collection);
    }
  } else {
    forOwn(collection, function(value, index, collection) {
      accumulator = noaccum
        ? (noaccum = false, value)
        : callback(accumulator, value, index, collection)
    });
  }
  return accumulator;
}

module.exports = reduce;

},{"lodash.createcallback":186,"lodash.forown":220}],186:[function(require,module,exports){
module.exports=require(125)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/index.js":125,"lodash._basecreatecallback":187,"lodash._baseisequal":205,"lodash.isobject":213,"lodash.keys":215,"lodash.property":219}],187:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":188,"lodash.bind":191,"lodash.identity":202,"lodash.support":203}],188:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":189,"lodash.noop":190}],189:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],190:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],191:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":192,"lodash._slice":201}],192:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":193,"lodash._basecreatewrapper":197,"lodash._slice":201,"lodash.isfunction":97}],193:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":194,"lodash._setbinddata":188,"lodash._slice":201,"lodash.isobject":213}],194:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":195,"lodash.isobject":213,"lodash.noop":196}],195:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],196:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],197:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":198,"lodash._setbinddata":188,"lodash._slice":201,"lodash.isobject":213}],198:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":199,"lodash.isobject":213,"lodash.noop":200}],199:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],200:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],201:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],202:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],203:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":204}],204:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],205:[function(require,module,exports){
module.exports=require(144)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash._baseisequal/index.js":144,"lodash._getarray":206,"lodash._objecttypes":208,"lodash._releasearray":209,"lodash.forin":212,"lodash.isfunction":97}],206:[function(require,module,exports){
module.exports=require(9)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":9,"lodash._arraypool":207}],207:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],208:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],209:[function(require,module,exports){
module.exports=require(11)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":11,"lodash._arraypool":210,"lodash._maxpoolsize":211}],210:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],211:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],212:[function(require,module,exports){
module.exports=require(104)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.isplainobject/node_modules/lodash._shimisplainobject/node_modules/lodash.forin/index.js":104,"lodash._basecreatecallback":187,"lodash._objecttypes":208}],213:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":214}],214:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],215:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":216,"lodash._shimkeys":217,"lodash.isobject":213}],216:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],217:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":218}],218:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],219:[function(require,module,exports){
module.exports=require(158)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash.property/index.js":158}],220:[function(require,module,exports){
module.exports=require(20)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.forown/index.js":20,"lodash._basecreatecallback":221,"lodash._objecttypes":241,"lodash.keys":242}],221:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":222,"lodash.bind":225,"lodash.identity":238,"lodash.support":239}],222:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":223,"lodash.noop":224}],223:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],224:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],225:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":226,"lodash._slice":237}],226:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":227,"lodash._basecreatewrapper":232,"lodash._slice":237,"lodash.isfunction":97}],227:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":228,"lodash._setbinddata":222,"lodash._slice":237,"lodash.isobject":231}],228:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":229,"lodash.isobject":231,"lodash.noop":230}],229:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],230:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],231:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":241}],232:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":233,"lodash._setbinddata":222,"lodash._slice":237,"lodash.isobject":236}],233:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":234,"lodash.isobject":236,"lodash.noop":235}],234:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],235:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],236:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":241}],237:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],238:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],239:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":240}],240:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],241:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],242:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":243,"lodash._shimkeys":244,"lodash.isobject":245}],243:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],244:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":241}],245:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":241}],246:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseFlatten = require('lodash._baseflatten'),
    baseUniq = require('lodash._baseuniq');

/**
 * Creates an array of unique values, in order, of the provided arrays using
 * strict equality for comparisons, i.e. `===`.
 *
 * @static
 * @memberOf _
 * @category Arrays
 * @param {...Array} [array] The arrays to inspect.
 * @returns {Array} Returns an array of combined values.
 * @example
 *
 * _.union([1, 2, 3], [5, 2, 1, 4], [2, 1]);
 * // => [1, 2, 3, 5, 4]
 */
function union() {
  return baseUniq(baseFlatten(arguments, true, true));
}

module.exports = union;

},{"lodash._baseflatten":247,"lodash._baseuniq":249}],247:[function(require,module,exports){
module.exports=require(63)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._baseflatten/index.js":63,"lodash.isarguments":248,"lodash.isarray":94}],248:[function(require,module,exports){
module.exports=require(64)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._baseflatten/node_modules/lodash.isarguments/index.js":64}],249:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseIndexOf = require('lodash._baseindexof'),
    cacheIndexOf = require('lodash._cacheindexof'),
    createCache = require('lodash._createcache'),
    getArray = require('lodash._getarray'),
    largeArraySize = require('lodash._largearraysize'),
    releaseArray = require('lodash._releasearray'),
    releaseObject = require('lodash._releaseobject');

/**
 * The base implementation of `_.uniq` without support for callback shorthands
 * or `thisArg` binding.
 *
 * @private
 * @param {Array} array The array to process.
 * @param {boolean} [isSorted=false] A flag to indicate that `array` is sorted.
 * @param {Function} [callback] The function called per iteration.
 * @returns {Array} Returns a duplicate-value-free array.
 */
function baseUniq(array, isSorted, callback) {
  var index = -1,
      indexOf = baseIndexOf,
      length = array ? array.length : 0,
      result = [];

  var isLarge = !isSorted && length >= largeArraySize,
      seen = (callback || isLarge) ? getArray() : result;

  if (isLarge) {
    var cache = createCache(seen);
    indexOf = cacheIndexOf;
    seen = cache;
  }
  while (++index < length) {
    var value = array[index],
        computed = callback ? callback(value, index, array) : value;

    if (isSorted
          ? !index || seen[seen.length - 1] !== computed
          : indexOf(seen, computed) < 0
        ) {
      if (callback || isLarge) {
        seen.push(computed);
      }
      result.push(value);
    }
  }
  if (isLarge) {
    releaseArray(seen.array);
    releaseObject(seen);
  } else if (callback) {
    releaseArray(seen);
  }
  return result;
}

module.exports = baseUniq;

},{"lodash._baseindexof":250,"lodash._cacheindexof":251,"lodash._createcache":253,"lodash._getarray":258,"lodash._largearraysize":260,"lodash._releasearray":261,"lodash._releaseobject":264}],250:[function(require,module,exports){
module.exports=require(51)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._baseindexof/index.js":51}],251:[function(require,module,exports){
module.exports=require(52)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/index.js":52,"lodash._baseindexof":250,"lodash._keyprefix":252}],252:[function(require,module,exports){
module.exports=require(53)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":53}],253:[function(require,module,exports){
module.exports=require(54)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/index.js":54,"lodash._cachepush":254,"lodash._getobject":256,"lodash._releaseobject":264}],254:[function(require,module,exports){
module.exports=require(55)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._cachepush/index.js":55,"lodash._keyprefix":255}],255:[function(require,module,exports){
module.exports=require(53)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":53}],256:[function(require,module,exports){
module.exports=require(57)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/index.js":57,"lodash._objectpool":257}],257:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":58}],258:[function(require,module,exports){
module.exports=require(9)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":9,"lodash._arraypool":259}],259:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],260:[function(require,module,exports){
module.exports=require(59)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._largearraysize/index.js":59}],261:[function(require,module,exports){
module.exports=require(11)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":11,"lodash._arraypool":262,"lodash._maxpoolsize":263}],262:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],263:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],264:[function(require,module,exports){
module.exports=require(60)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._releaseobject/index.js":60,"lodash._maxpoolsize":265,"lodash._objectpool":266}],265:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],266:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":58}],267:[function(require,module,exports){
/**
 * Lo-Dash 2.4.1 (Custom Build) <http://lodash.com/>
 * Build: `lodash modularize modern exports="npm" -o ./npm/`
 * Copyright 2012-2013 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.5.2 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <http://lodash.com/license>
 */
var baseUniq = require('lodash._baseuniq'),
    createCallback = require('lodash.createcallback');

/**
 * Creates a duplicate-value-free version of an array using strict equality
 * for comparisons, i.e. `===`. If the array is sorted, providing
 * `true` for `isSorted` will use a faster algorithm. If a callback is provided
 * each element of `array` is passed through the callback before uniqueness
 * is computed. The callback is bound to `thisArg` and invoked with three
 * arguments; (value, index, array).
 *
 * If a property name is provided for `callback` the created "_.pluck" style
 * callback will return the property value of the given element.
 *
 * If an object is provided for `callback` the created "_.where" style callback
 * will return `true` for elements that have the properties of the given object,
 * else `false`.
 *
 * @static
 * @memberOf _
 * @alias unique
 * @category Arrays
 * @param {Array} array The array to process.
 * @param {boolean} [isSorted=false] A flag to indicate that `array` is sorted.
 * @param {Function|Object|string} [callback=identity] The function called
 *  per iteration. If a property name or object is provided it will be used
 *  to create a "_.pluck" or "_.where" style callback, respectively.
 * @param {*} [thisArg] The `this` binding of `callback`.
 * @returns {Array} Returns a duplicate-value-free array.
 * @example
 *
 * _.uniq([1, 2, 1, 3, 1]);
 * // => [1, 2, 3]
 *
 * _.uniq([1, 1, 2, 2, 3], true);
 * // => [1, 2, 3]
 *
 * _.uniq(['A', 'b', 'C', 'a', 'B', 'c'], function(letter) { return letter.toLowerCase(); });
 * // => ['A', 'b', 'C']
 *
 * _.uniq([1, 2.5, 3, 1.5, 2, 3.5], function(num) { return this.floor(num); }, Math);
 * // => [1, 2.5, 3]
 *
 * // using "_.pluck" callback shorthand
 * _.uniq([{ 'x': 1 }, { 'x': 2 }, { 'x': 1 }], 'x');
 * // => [{ 'x': 1 }, { 'x': 2 }]
 */
function uniq(array, isSorted, callback, thisArg) {
  // juggle arguments
  if (typeof isSorted != 'boolean' && isSorted != null) {
    thisArg = callback;
    callback = (typeof isSorted != 'function' && thisArg && thisArg[isSorted] === array) ? null : isSorted;
    isSorted = false;
  }
  if (callback != null) {
    callback = createCallback(callback, thisArg, 3);
  }
  return baseUniq(array, isSorted, callback);
}

module.exports = uniq;

},{"lodash._baseuniq":268,"lodash.createcallback":286}],268:[function(require,module,exports){
module.exports=require(249)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.union/node_modules/lodash._baseuniq/index.js":249,"lodash._baseindexof":269,"lodash._cacheindexof":270,"lodash._createcache":272,"lodash._getarray":277,"lodash._largearraysize":279,"lodash._releasearray":280,"lodash._releaseobject":283}],269:[function(require,module,exports){
module.exports=require(51)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._baseindexof/index.js":51}],270:[function(require,module,exports){
module.exports=require(52)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/index.js":52,"lodash._baseindexof":269,"lodash._keyprefix":271}],271:[function(require,module,exports){
module.exports=require(53)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":53}],272:[function(require,module,exports){
module.exports=require(54)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/index.js":54,"lodash._cachepush":273,"lodash._getobject":275,"lodash._releaseobject":283}],273:[function(require,module,exports){
module.exports=require(55)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._cachepush/index.js":55,"lodash._keyprefix":274}],274:[function(require,module,exports){
module.exports=require(53)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":53}],275:[function(require,module,exports){
module.exports=require(57)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/index.js":57,"lodash._objectpool":276}],276:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":58}],277:[function(require,module,exports){
module.exports=require(9)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":9,"lodash._arraypool":278}],278:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],279:[function(require,module,exports){
module.exports=require(59)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._largearraysize/index.js":59}],280:[function(require,module,exports){
module.exports=require(11)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":11,"lodash._arraypool":281,"lodash._maxpoolsize":282}],281:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],282:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],283:[function(require,module,exports){
module.exports=require(60)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._releaseobject/index.js":60,"lodash._maxpoolsize":284,"lodash._objectpool":285}],284:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],285:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":58}],286:[function(require,module,exports){
module.exports=require(125)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/index.js":125,"lodash._basecreatecallback":287,"lodash._baseisequal":305,"lodash.isobject":313,"lodash.keys":315,"lodash.property":319}],287:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":288,"lodash.bind":291,"lodash.identity":302,"lodash.support":303}],288:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":289,"lodash.noop":290}],289:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],290:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],291:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":292,"lodash._slice":301}],292:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":293,"lodash._basecreatewrapper":297,"lodash._slice":301,"lodash.isfunction":97}],293:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":294,"lodash._setbinddata":288,"lodash._slice":301,"lodash.isobject":313}],294:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":295,"lodash.isobject":313,"lodash.noop":296}],295:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],296:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],297:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":298,"lodash._setbinddata":288,"lodash._slice":301,"lodash.isobject":313}],298:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":299,"lodash.isobject":313,"lodash.noop":300}],299:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],300:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],301:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],302:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],303:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":304}],304:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],305:[function(require,module,exports){
module.exports=require(144)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash._baseisequal/index.js":144,"lodash._getarray":306,"lodash._objecttypes":308,"lodash._releasearray":309,"lodash.forin":312,"lodash.isfunction":97}],306:[function(require,module,exports){
module.exports=require(9)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":9,"lodash._arraypool":307}],307:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],308:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],309:[function(require,module,exports){
module.exports=require(11)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":11,"lodash._arraypool":310,"lodash._maxpoolsize":311}],310:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],311:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],312:[function(require,module,exports){
module.exports=require(104)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.isplainobject/node_modules/lodash._shimisplainobject/node_modules/lodash.forin/index.js":104,"lodash._basecreatecallback":287,"lodash._objecttypes":308}],313:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":314}],314:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],315:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":316,"lodash._shimkeys":317,"lodash.isobject":313}],316:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],317:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":318}],318:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],319:[function(require,module,exports){
module.exports=require(158)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash.property/index.js":158}],320:[function(require,module,exports){
/*jshint bitwise:false*/
/*global unescape*/

(function (factory) {
    if (typeof exports === 'object') {
        // Node/CommonJS
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(factory);
    } else {
        // Browser globals (with support for web workers)
        var glob;
        try {
            glob = window;
        } catch (e) {
            glob = self;
        }

        glob.SparkMD5 = factory();
    }
}(function (undefined) {

    'use strict';

    ////////////////////////////////////////////////////////////////////////////

    /*
     * Fastest md5 implementation around (JKM md5)
     * Credits: Joseph Myers
     *
     * @see http://www.myersdaily.org/joseph/javascript/md5-text.html
     * @see http://jsperf.com/md5-shootout/7
     */

    /* this function is much faster,
      so if possible we use it. Some IEs
      are the only ones I know of that
      need the idiotic second function,
      generated by an if clause.  */
    var add32 = function (a, b) {
        return (a + b) & 0xFFFFFFFF;
    },

    cmn = function (q, a, b, x, s, t) {
        a = add32(add32(a, q), add32(x, t));
        return add32((a << s) | (a >>> (32 - s)), b);
    },

    ff = function (a, b, c, d, x, s, t) {
        return cmn((b & c) | ((~b) & d), a, b, x, s, t);
    },

    gg = function (a, b, c, d, x, s, t) {
        return cmn((b & d) | (c & (~d)), a, b, x, s, t);
    },

    hh = function (a, b, c, d, x, s, t) {
        return cmn(b ^ c ^ d, a, b, x, s, t);
    },

    ii = function (a, b, c, d, x, s, t) {
        return cmn(c ^ (b | (~d)), a, b, x, s, t);
    },

    md5cycle = function (x, k) {
        var a = x[0],
            b = x[1],
            c = x[2],
            d = x[3];

        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);

        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);

        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);

        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);

        x[0] = add32(a, x[0]);
        x[1] = add32(b, x[1]);
        x[2] = add32(c, x[2]);
        x[3] = add32(d, x[3]);
    },

    /* there needs to be support for Unicode here,
       * unless we pretend that we can redefine the MD-5
       * algorithm for multi-byte characters (perhaps
       * by adding every four 16-bit characters and
       * shortening the sum to 32 bits). Otherwise
       * I suggest performing MD-5 as if every character
       * was two bytes--e.g., 0040 0025 = @%--but then
       * how will an ordinary MD-5 sum be matched?
       * There is no way to standardize text to something
       * like UTF-8 before transformation; speed cost is
       * utterly prohibitive. The JavaScript standard
       * itself needs to look at this: it should start
       * providing access to strings as preformed UTF-8
       * 8-bit unsigned value arrays.
       */
    md5blk = function (s) {
        var md5blks = [],
            i; /* Andy King said do it this way. */

        for (i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
        }
        return md5blks;
    },

    md5blk_array = function (a) {
        var md5blks = [],
            i; /* Andy King said do it this way. */

        for (i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = a[i] + (a[i + 1] << 8) + (a[i + 2] << 16) + (a[i + 3] << 24);
        }
        return md5blks;
    },

    md51 = function (s) {
        var n = s.length,
            state = [1732584193, -271733879, -1732584194, 271733878],
            i,
            length,
            tail,
            tmp,
            lo,
            hi;

        for (i = 64; i <= n; i += 64) {
            md5cycle(state, md5blk(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        length = s.length;
        tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < length; i += 1) {
            tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        }
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(state, tail);
            for (i = 0; i < 16; i += 1) {
                tail[i] = 0;
            }
        }

        // Beware that the final length might not fit in 32 bits so we take care of that
        tmp = n * 8;
        tmp = tmp.toString(16).match(/(.*?)(.{0,8})$/);
        lo = parseInt(tmp[2], 16);
        hi = parseInt(tmp[1], 16) || 0;

        tail[14] = lo;
        tail[15] = hi;

        md5cycle(state, tail);
        return state;
    },

    md51_array = function (a) {
        var n = a.length,
            state = [1732584193, -271733879, -1732584194, 271733878],
            i,
            length,
            tail,
            tmp,
            lo,
            hi;

        for (i = 64; i <= n; i += 64) {
            md5cycle(state, md5blk_array(a.subarray(i - 64, i)));
        }

        // Not sure if it is a bug, however IE10 will always produce a sub array of length 1
        // containing the last element of the parent array if the sub array specified starts
        // beyond the length of the parent array - weird.
        // https://connect.microsoft.com/IE/feedback/details/771452/typed-array-subarray-issue
        a = (i - 64) < n ? a.subarray(i - 64) : new Uint8Array(0);

        length = a.length;
        tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < length; i += 1) {
            tail[i >> 2] |= a[i] << ((i % 4) << 3);
        }

        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(state, tail);
            for (i = 0; i < 16; i += 1) {
                tail[i] = 0;
            }
        }

        // Beware that the final length might not fit in 32 bits so we take care of that
        tmp = n * 8;
        tmp = tmp.toString(16).match(/(.*?)(.{0,8})$/);
        lo = parseInt(tmp[2], 16);
        hi = parseInt(tmp[1], 16) || 0;

        tail[14] = lo;
        tail[15] = hi;

        md5cycle(state, tail);

        return state;
    },

    hex_chr = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'],

    rhex = function (n) {
        var s = '',
            j;
        for (j = 0; j < 4; j += 1) {
            s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
        }
        return s;
    },

    hex = function (x) {
        var i;
        for (i = 0; i < x.length; i += 1) {
            x[i] = rhex(x[i]);
        }
        return x.join('');
    },

    md5 = function (s) {
        return hex(md51(s));
    },



    ////////////////////////////////////////////////////////////////////////////

    /**
     * SparkMD5 OOP implementation.
     *
     * Use this class to perform an incremental md5, otherwise use the
     * static methods instead.
     */
    SparkMD5 = function () {
        // call reset to init the instance
        this.reset();
    };


    // In some cases the fast add32 function cannot be used..
    if (md5('hello') !== '5d41402abc4b2a76b9719d911017c592') {
        add32 = function (x, y) {
            var lsw = (x & 0xFFFF) + (y & 0xFFFF),
                msw = (x >> 16) + (y >> 16) + (lsw >> 16);
            return (msw << 16) | (lsw & 0xFFFF);
        };
    }


    /**
     * Appends a string.
     * A conversion will be applied if an utf8 string is detected.
     *
     * @param {String} str The string to be appended
     *
     * @return {SparkMD5} The instance itself
     */
    SparkMD5.prototype.append = function (str) {
        // converts the string to utf8 bytes if necessary
        if (/[\u0080-\uFFFF]/.test(str)) {
            str = unescape(encodeURIComponent(str));
        }

        // then append as binary
        this.appendBinary(str);

        return this;
    };

    /**
     * Appends a binary string.
     *
     * @param {String} contents The binary string to be appended
     *
     * @return {SparkMD5} The instance itself
     */
    SparkMD5.prototype.appendBinary = function (contents) {
        this._buff += contents;
        this._length += contents.length;

        var length = this._buff.length,
            i;

        for (i = 64; i <= length; i += 64) {
            md5cycle(this._state, md5blk(this._buff.substring(i - 64, i)));
        }

        this._buff = this._buff.substr(i - 64);

        return this;
    };

    /**
     * Finishes the incremental computation, reseting the internal state and
     * returning the result.
     * Use the raw parameter to obtain the raw result instead of the hex one.
     *
     * @param {Boolean} raw True to get the raw result, false to get the hex result
     *
     * @return {String|Array} The result
     */
    SparkMD5.prototype.end = function (raw) {
        var buff = this._buff,
            length = buff.length,
            i,
            tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            ret;

        for (i = 0; i < length; i += 1) {
            tail[i >> 2] |= buff.charCodeAt(i) << ((i % 4) << 3);
        }

        this._finish(tail, length);
        ret = !!raw ? this._state : hex(this._state);

        this.reset();

        return ret;
    };

    /**
     * Finish the final calculation based on the tail.
     *
     * @param {Array}  tail   The tail (will be modified)
     * @param {Number} length The length of the remaining buffer
     */
    SparkMD5.prototype._finish = function (tail, length) {
        var i = length,
            tmp,
            lo,
            hi;

        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(this._state, tail);
            for (i = 0; i < 16; i += 1) {
                tail[i] = 0;
            }
        }

        // Do the final computation based on the tail and length
        // Beware that the final length may not fit in 32 bits so we take care of that
        tmp = this._length * 8;
        tmp = tmp.toString(16).match(/(.*?)(.{0,8})$/);
        lo = parseInt(tmp[2], 16);
        hi = parseInt(tmp[1], 16) || 0;

        tail[14] = lo;
        tail[15] = hi;
        md5cycle(this._state, tail);
    };

    /**
     * Resets the internal state of the computation.
     *
     * @return {SparkMD5} The instance itself
     */
    SparkMD5.prototype.reset = function () {
        this._buff = "";
        this._length = 0;
        this._state = [1732584193, -271733879, -1732584194, 271733878];

        return this;
    };

    /**
     * Releases memory used by the incremental buffer and other aditional
     * resources. If you plan to use the instance again, use reset instead.
     */
    SparkMD5.prototype.destroy = function () {
        delete this._state;
        delete this._buff;
        delete this._length;
    };


    /**
     * Performs the md5 hash on a string.
     * A conversion will be applied if utf8 string is detected.
     *
     * @param {String}  str The string
     * @param {Boolean} raw True to get the raw result, false to get the hex result
     *
     * @return {String|Array} The result
     */
    SparkMD5.hash = function (str, raw) {
        // converts the string to utf8 bytes if necessary
        if (/[\u0080-\uFFFF]/.test(str)) {
            str = unescape(encodeURIComponent(str));
        }

        var hash = md51(str);

        return !!raw ? hash : hex(hash);
    };

    /**
     * Performs the md5 hash on a binary string.
     *
     * @param {String}  content The binary string
     * @param {Boolean} raw     True to get the raw result, false to get the hex result
     *
     * @return {String|Array} The result
     */
    SparkMD5.hashBinary = function (content, raw) {
        var hash = md51(content);

        return !!raw ? hash : hex(hash);
    };

    /**
     * SparkMD5 OOP implementation for array buffers.
     *
     * Use this class to perform an incremental md5 ONLY for array buffers.
     */
    SparkMD5.ArrayBuffer = function () {
        // call reset to init the instance
        this.reset();
    };

    ////////////////////////////////////////////////////////////////////////////

    /**
     * Appends an array buffer.
     *
     * @param {ArrayBuffer} arr The array to be appended
     *
     * @return {SparkMD5.ArrayBuffer} The instance itself
     */
    SparkMD5.ArrayBuffer.prototype.append = function (arr) {
        // TODO: we could avoid the concatenation here but the algorithm would be more complex
        //       if you find yourself needing extra performance, please make a PR.
        var buff = this._concatArrayBuffer(this._buff, arr),
            length = buff.length,
            i;

        this._length += arr.byteLength;

        for (i = 64; i <= length; i += 64) {
            md5cycle(this._state, md5blk_array(buff.subarray(i - 64, i)));
        }

        // Avoids IE10 weirdness (documented above)
        this._buff = (i - 64) < length ? buff.subarray(i - 64) : new Uint8Array(0);

        return this;
    };

    /**
     * Finishes the incremental computation, reseting the internal state and
     * returning the result.
     * Use the raw parameter to obtain the raw result instead of the hex one.
     *
     * @param {Boolean} raw True to get the raw result, false to get the hex result
     *
     * @return {String|Array} The result
     */
    SparkMD5.ArrayBuffer.prototype.end = function (raw) {
        var buff = this._buff,
            length = buff.length,
            tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            i,
            ret;

        for (i = 0; i < length; i += 1) {
            tail[i >> 2] |= buff[i] << ((i % 4) << 3);
        }

        this._finish(tail, length);
        ret = !!raw ? this._state : hex(this._state);

        this.reset();

        return ret;
    };

    SparkMD5.ArrayBuffer.prototype._finish = SparkMD5.prototype._finish;

    /**
     * Resets the internal state of the computation.
     *
     * @return {SparkMD5.ArrayBuffer} The instance itself
     */
    SparkMD5.ArrayBuffer.prototype.reset = function () {
        this._buff = new Uint8Array(0);
        this._length = 0;
        this._state = [1732584193, -271733879, -1732584194, 271733878];

        return this;
    };

    /**
     * Releases memory used by the incremental buffer and other aditional
     * resources. If you plan to use the instance again, use reset instead.
     */
    SparkMD5.ArrayBuffer.prototype.destroy = SparkMD5.prototype.destroy;

    /**
     * Concats two array buffers, returning a new one.
     *
     * @param  {ArrayBuffer} first  The first array buffer
     * @param  {ArrayBuffer} second The second array buffer
     *
     * @return {ArrayBuffer} The new array buffer
     */
    SparkMD5.ArrayBuffer.prototype._concatArrayBuffer = function (first, second) {
        var firstLength = first.length,
            result = new Uint8Array(firstLength + second.byteLength);

        result.set(first);
        result.set(new Uint8Array(second), firstLength);

        return result;
    };

    /**
     * Performs the md5 hash on an array buffer.
     *
     * @param {ArrayBuffer} arr The array buffer
     * @param {Boolean}     raw True to get the raw result, false to get the hex result
     *
     * @return {String|Array} The result
     */
    SparkMD5.ArrayBuffer.hash = function (arr, raw) {
        var hash = md51_array(new Uint8Array(arr));

        return !!raw ? hash : hex(hash);
    };

    return SparkMD5;
}));

},{}],321:[function(require,module,exports){
var traverse = module.exports = function (obj) {
    return new Traverse(obj);
};

function Traverse (obj) {
    this.value = obj;
}

Traverse.prototype.get = function (ps) {
    var node = this.value;
    for (var i = 0; i < ps.length; i ++) {
        var key = ps[i];
        if (!node || !hasOwnProperty.call(node, key)) {
            node = undefined;
            break;
        }
        node = node[key];
    }
    return node;
};

Traverse.prototype.has = function (ps) {
    var node = this.value;
    for (var i = 0; i < ps.length; i ++) {
        var key = ps[i];
        if (!node || !hasOwnProperty.call(node, key)) {
            return false;
        }
        node = node[key];
    }
    return true;
};

Traverse.prototype.set = function (ps, value) {
    var node = this.value;
    for (var i = 0; i < ps.length - 1; i ++) {
        var key = ps[i];
        if (!hasOwnProperty.call(node, key)) node[key] = {};
        node = node[key];
    }
    node[ps[i]] = value;
    return value;
};

Traverse.prototype.map = function (cb) {
    return walk(this.value, cb, true);
};

Traverse.prototype.forEach = function (cb) {
    this.value = walk(this.value, cb, false);
    return this.value;
};

Traverse.prototype.reduce = function (cb, init) {
    var skip = arguments.length === 1;
    var acc = skip ? this.value : init;
    this.forEach(function (x) {
        if (!this.isRoot || !skip) {
            acc = cb.call(this, acc, x);
        }
    });
    return acc;
};

Traverse.prototype.paths = function () {
    var acc = [];
    this.forEach(function (x) {
        acc.push(this.path); 
    });
    return acc;
};

Traverse.prototype.nodes = function () {
    var acc = [];
    this.forEach(function (x) {
        acc.push(this.node);
    });
    return acc;
};

Traverse.prototype.clone = function () {
    var parents = [], nodes = [];
    
    return (function clone (src) {
        for (var i = 0; i < parents.length; i++) {
            if (parents[i] === src) {
                return nodes[i];
            }
        }
        
        if (typeof src === 'object' && src !== null) {
            var dst = copy(src);
            
            parents.push(src);
            nodes.push(dst);
            
            forEach(objectKeys(src), function (key) {
                dst[key] = clone(src[key]);
            });
            
            parents.pop();
            nodes.pop();
            return dst;
        }
        else {
            return src;
        }
    })(this.value);
};

function walk (root, cb, immutable) {
    var path = [];
    var parents = [];
    var alive = true;
    
    return (function walker (node_) {
        var node = immutable ? copy(node_) : node_;
        var modifiers = {};
        
        var keepGoing = true;
        
        var state = {
            node : node,
            node_ : node_,
            path : [].concat(path),
            parent : parents[parents.length - 1],
            parents : parents,
            key : path.slice(-1)[0],
            isRoot : path.length === 0,
            level : path.length,
            circular : null,
            update : function (x, stopHere) {
                if (!state.isRoot) {
                    state.parent.node[state.key] = x;
                }
                state.node = x;
                if (stopHere) keepGoing = false;
            },
            'delete' : function (stopHere) {
                delete state.parent.node[state.key];
                if (stopHere) keepGoing = false;
            },
            remove : function (stopHere) {
                if (isArray(state.parent.node)) {
                    state.parent.node.splice(state.key, 1);
                }
                else {
                    delete state.parent.node[state.key];
                }
                if (stopHere) keepGoing = false;
            },
            keys : null,
            before : function (f) { modifiers.before = f },
            after : function (f) { modifiers.after = f },
            pre : function (f) { modifiers.pre = f },
            post : function (f) { modifiers.post = f },
            stop : function () { alive = false },
            block : function () { keepGoing = false }
        };
        
        if (!alive) return state;
        
        function updateState() {
            if (typeof state.node === 'object' && state.node !== null) {
                if (!state.keys || state.node_ !== state.node) {
                    state.keys = objectKeys(state.node)
                }
                
                state.isLeaf = state.keys.length == 0;
                
                for (var i = 0; i < parents.length; i++) {
                    if (parents[i].node_ === node_) {
                        state.circular = parents[i];
                        break;
                    }
                }
            }
            else {
                state.isLeaf = true;
                state.keys = null;
            }
            
            state.notLeaf = !state.isLeaf;
            state.notRoot = !state.isRoot;
        }
        
        updateState();
        
        // use return values to update if defined
        var ret = cb.call(state, state.node);
        if (ret !== undefined && state.update) state.update(ret);
        
        if (modifiers.before) modifiers.before.call(state, state.node);
        
        if (!keepGoing) return state;
        
        if (typeof state.node == 'object'
        && state.node !== null && !state.circular) {
            parents.push(state);
            
            updateState();
            
            forEach(state.keys, function (key, i) {
                path.push(key);
                
                if (modifiers.pre) modifiers.pre.call(state, state.node[key], key);
                
                var child = walker(state.node[key]);
                if (immutable && hasOwnProperty.call(state.node, key)) {
                    state.node[key] = child.node;
                }
                
                child.isLast = i == state.keys.length - 1;
                child.isFirst = i == 0;
                
                if (modifiers.post) modifiers.post.call(state, child);
                
                path.pop();
            });
            parents.pop();
        }
        
        if (modifiers.after) modifiers.after.call(state, state.node);
        
        return state;
    })(root).node;
}

function copy (src) {
    if (typeof src === 'object' && src !== null) {
        var dst;
        
        if (isArray(src)) {
            dst = [];
        }
        else if (isDate(src)) {
            dst = new Date(src.getTime ? src.getTime() : src);
        }
        else if (isRegExp(src)) {
            dst = new RegExp(src);
        }
        else if (isError(src)) {
            dst = { message: src.message };
        }
        else if (isBoolean(src)) {
            dst = new Boolean(src);
        }
        else if (isNumber(src)) {
            dst = new Number(src);
        }
        else if (isString(src)) {
            dst = new String(src);
        }
        else if (Object.create && Object.getPrototypeOf) {
            dst = Object.create(Object.getPrototypeOf(src));
        }
        else if (src.constructor === Object) {
            dst = {};
        }
        else {
            var proto =
                (src.constructor && src.constructor.prototype)
                || src.__proto__
                || {}
            ;
            var T = function () {};
            T.prototype = proto;
            dst = new T;
        }
        
        forEach(objectKeys(src), function (key) {
            dst[key] = src[key];
        });
        return dst;
    }
    else return src;
}

var objectKeys = Object.keys || function keys (obj) {
    var res = [];
    for (var key in obj) res.push(key)
    return res;
};

function toS (obj) { return Object.prototype.toString.call(obj) }
function isDate (obj) { return toS(obj) === '[object Date]' }
function isRegExp (obj) { return toS(obj) === '[object RegExp]' }
function isError (obj) { return toS(obj) === '[object Error]' }
function isBoolean (obj) { return toS(obj) === '[object Boolean]' }
function isNumber (obj) { return toS(obj) === '[object Number]' }
function isString (obj) { return toS(obj) === '[object String]' }

var isArray = Array.isArray || function isArray (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

var forEach = function (xs, fn) {
    if (xs.forEach) return xs.forEach(fn)
    else for (var i = 0; i < xs.length; i++) {
        fn(xs[i], i, xs);
    }
};

forEach(objectKeys(Traverse.prototype), function (key) {
    traverse[key] = function (obj) {
        var args = [].slice.call(arguments, 1);
        var t = new Traverse(obj);
        return t[key].apply(t, args);
    };
});

var hasOwnProperty = Object.hasOwnProperty || function (obj, key) {
    return key in obj;
};

},{}],322:[function(require,module,exports){
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
            }
        }
    }
}

},{}],323:[function(require,module,exports){
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


},{}],324:[function(require,module,exports){
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
},{}],325:[function(require,module,exports){
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

},{}],326:[function(require,module,exports){
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
},{}],327:[function(require,module,exports){
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


},{}],328:[function(require,module,exports){
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
},{}],329:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/operationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "method", "nickname", "parameters" ],
            "properties": {
                "method": { "enum": [ "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS" ] },
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
            }
        }
    }
}

},{}],330:[function(require,module,exports){
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

},{}],331:[function(require,module,exports){
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

},{}],332:[function(require,module,exports){
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
},{}],333:[function(require,module,exports){
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

},{}],334:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuL2xpYi9zcGVjcy5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL2xpYi9oZWxwZXJzLmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbGliL3ZhbGlkYXRvcnMuanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvamp2L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2pqdi9saWIvamp2LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2pqdmUvamp2ZS5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNsb25lL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNsb25lL25vZGVfbW9kdWxlcy9sb2Rhc2guX2dldGFycmF5L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNsb25lL25vZGVfbW9kdWxlcy9sb2Rhc2guX2dldGFycmF5L25vZGVfbW9kdWxlcy9sb2Rhc2guX2FycmF5cG9vbC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjbG9uZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9yZWxlYXNlYXJyYXkvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY2xvbmUvbm9kZV9tb2R1bGVzL2xvZGFzaC5fcmVsZWFzZWFycmF5L25vZGVfbW9kdWxlcy9sb2Rhc2guX21heHBvb2xzaXplL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNsb25lL25vZGVfbW9kdWxlcy9sb2Rhc2guX3NsaWNlL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNsb25lL25vZGVfbW9kdWxlcy9sb2Rhc2guYXNzaWduL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNsb25lL25vZGVfbW9kdWxlcy9sb2Rhc2guYXNzaWduL25vZGVfbW9kdWxlcy9sb2Rhc2guX29iamVjdHR5cGVzL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNsb25lL25vZGVfbW9kdWxlcy9sb2Rhc2guYXNzaWduL25vZGVfbW9kdWxlcy9sb2Rhc2gua2V5cy9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjbG9uZS9ub2RlX21vZHVsZXMvbG9kYXNoLmFzc2lnbi9ub2RlX21vZHVsZXMvbG9kYXNoLmtleXMvbm9kZV9tb2R1bGVzL2xvZGFzaC5faXNuYXRpdmUvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY2xvbmUvbm9kZV9tb2R1bGVzL2xvZGFzaC5hc3NpZ24vbm9kZV9tb2R1bGVzL2xvZGFzaC5rZXlzL25vZGVfbW9kdWxlcy9sb2Rhc2guX3NoaW1rZXlzL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNsb25lL25vZGVfbW9kdWxlcy9sb2Rhc2guZm9yb3duL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNsb25lL25vZGVfbW9kdWxlcy9sb2Rhc2guaXNvYmplY3QvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY3JlYXRlY2FsbGJhY2svaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY3JlYXRlY2FsbGJhY2svbm9kZV9tb2R1bGVzL2xvZGFzaC5fc2V0YmluZGRhdGEvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY3JlYXRlY2FsbGJhY2svbm9kZV9tb2R1bGVzL2xvZGFzaC5fc2V0YmluZGRhdGEvbm9kZV9tb2R1bGVzL2xvZGFzaC5ub29wL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNyZWF0ZWNhbGxiYWNrL25vZGVfbW9kdWxlcy9sb2Rhc2guYmluZC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjcmVhdGVjYWxsYmFjay9ub2RlX21vZHVsZXMvbG9kYXNoLmJpbmQvbm9kZV9tb2R1bGVzL2xvZGFzaC5fY3JlYXRld3JhcHBlci9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjcmVhdGVjYWxsYmFjay9ub2RlX21vZHVsZXMvbG9kYXNoLmJpbmQvbm9kZV9tb2R1bGVzL2xvZGFzaC5fY3JlYXRld3JhcHBlci9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlYmluZC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjcmVhdGVjYWxsYmFjay9ub2RlX21vZHVsZXMvbG9kYXNoLmJpbmQvbm9kZV9tb2R1bGVzL2xvZGFzaC5fY3JlYXRld3JhcHBlci9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlYmluZC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY3JlYXRlL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNyZWF0ZWNhbGxiYWNrL25vZGVfbW9kdWxlcy9sb2Rhc2guYmluZC9ub2RlX21vZHVsZXMvbG9kYXNoLl9jcmVhdGV3cmFwcGVyL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjcmVhdGV3cmFwcGVyL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNyZWF0ZWNhbGxiYWNrL25vZGVfbW9kdWxlcy9sb2Rhc2guaWRlbnRpdHkvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY3JlYXRlY2FsbGJhY2svbm9kZV9tb2R1bGVzL2xvZGFzaC5zdXBwb3J0L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5kaWZmZXJlbmNlL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5kaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VkaWZmZXJlbmNlL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5kaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VkaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VpbmRleG9mL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5kaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VkaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2NhY2hlaW5kZXhvZi9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9jYWNoZWluZGV4b2Yvbm9kZV9tb2R1bGVzL2xvZGFzaC5fa2V5cHJlZml4L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5kaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VkaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2NyZWF0ZWNhY2hlL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5kaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VkaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2NyZWF0ZWNhY2hlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2NhY2hlcHVzaC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9jcmVhdGVjYWNoZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9nZXRvYmplY3QvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fY3JlYXRlY2FjaGUvbm9kZV9tb2R1bGVzL2xvZGFzaC5fZ2V0b2JqZWN0L25vZGVfbW9kdWxlcy9sb2Rhc2guX29iamVjdHBvb2wvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fbGFyZ2VhcnJheXNpemUvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fcmVsZWFzZW9iamVjdC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlZmxhdHRlbi9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlZmxhdHRlbi9ub2RlX21vZHVsZXMvbG9kYXNoLmlzYXJndW1lbnRzL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5mb3JlYWNoL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc2FycmF5L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc2Jvb2xlYW4vaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmlzZnVuY3Rpb24vaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmlzbmFuL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc251bGwvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmlzbnVtYmVyL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc3BsYWlub2JqZWN0L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc3BsYWlub2JqZWN0L25vZGVfbW9kdWxlcy9sb2Rhc2guX3NoaW1pc3BsYWlub2JqZWN0L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc3BsYWlub2JqZWN0L25vZGVfbW9kdWxlcy9sb2Rhc2guX3NoaW1pc3BsYWlub2JqZWN0L25vZGVfbW9kdWxlcy9sb2Rhc2guZm9yaW4vaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmlzc3RyaW5nL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc3VuZGVmaW5lZC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2gubWFwL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5tYXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5jcmVhdGVjYWxsYmFjay9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2gubWFwL25vZGVfbW9kdWxlcy9sb2Rhc2guY3JlYXRlY2FsbGJhY2svbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWlzZXF1YWwvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLm1hcC9ub2RlX21vZHVsZXMvbG9kYXNoLmNyZWF0ZWNhbGxiYWNrL25vZGVfbW9kdWxlcy9sb2Rhc2gucHJvcGVydHkvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLnJlZHVjZS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2gudW5pb24vaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLnVuaW9uL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2V1bmlxL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC51bmlxL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL3NwYXJrLW1kNS9zcGFyay1tZDUuanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvdHJhdmVyc2UvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9hcGlEZWNsYXJhdGlvbi5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvYXV0aG9yaXphdGlvbk9iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvZGF0YVR5cGUuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2RhdGFUeXBlQmFzZS5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvaW5mb09iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvbW9kZWxzT2JqZWN0Lmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9vYXV0aDJHcmFudFR5cGUuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL29wZXJhdGlvbk9iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvcGFyYW1ldGVyT2JqZWN0Lmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9yZXNvdXJjZUxpc3RpbmcuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL3Jlc291cmNlT2JqZWN0Lmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzIuMC9zY2hlbWEuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvanNvbi1zY2hlbWEtZHJhZnQtMDQuanNvbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2gwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3WkE7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDanVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7OztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7OztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNqTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDckVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2bEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzM4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBBcGlnZWUgQ29ycG9yYXRpb25cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSB7XG4gIGNsb25lRGVlcDogcmVxdWlyZSgnbG9kYXNoLmNsb25lZGVlcCcpLFxuICBkaWZmZXJlbmNlOiByZXF1aXJlKCdsb2Rhc2guZGlmZmVyZW5jZScpLFxuICBlYWNoOiByZXF1aXJlKCdsb2Rhc2guZm9yZWFjaCcpLFxuICBpc0FycmF5OiByZXF1aXJlKCdsb2Rhc2guaXNhcnJheScpLFxuICBpc1BsYWluT2JqZWN0OiByZXF1aXJlKCdsb2Rhc2guaXNwbGFpbm9iamVjdCcpLFxuICBpc1VuZGVmaW5lZDogcmVxdWlyZSgnbG9kYXNoLmlzdW5kZWZpbmVkJyksXG4gIG1hcDogcmVxdWlyZSgnbG9kYXNoLm1hcCcpLFxuICByZWR1Y2U6IHJlcXVpcmUoJ2xvZGFzaC5yZWR1Y2UnKSxcbiAgdW5pb246IHJlcXVpcmUoJ2xvZGFzaC51bmlvbicpLFxuICB1bmlxOiByZXF1aXJlKCdsb2Rhc2gudW5pcScpXG59O1xudmFyIGpqdiA9IHJlcXVpcmUoJ2pqdicpO1xudmFyIGpqdmUgPSByZXF1aXJlKCdqanZlJyk7XG52YXIgbWQ1ID0gcmVxdWlyZSgnc3BhcmstbWQ1Jyk7XG52YXIgdHJhdmVyc2UgPSByZXF1aXJlKCd0cmF2ZXJzZScpO1xudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcbnZhciB2YWxpZGF0b3JzID0gcmVxdWlyZSgnLi92YWxpZGF0b3JzJyk7XG5cbnZhciBkcmFmdDA0SnNvbiA9IHJlcXVpcmUoJy4uL3NjaGVtYXMvanNvbi1zY2hlbWEtZHJhZnQtMDQuanNvbicpO1xudmFyIGRyYWZ0MDRVcmwgPSAnaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEnO1xudmFyIGpqdk9wdGlvbnMgPSB7XG4gIGNoZWNrUmVxdWlyZWQ6IHRydWUsXG4gIHJlbW92ZUFkZGl0aW9uYWw6IGZhbHNlLFxuICB1c2VEZWZhdWx0OiBmYWxzZSxcbiAgdXNlQ29lcmNlOiBmYWxzZVxufTtcbnZhciBqanZlT3B0aW9ucyA9IHtcbiAgZm9ybWF0UGF0aDogZmFsc2Vcbn07XG52YXIgbWV0YWRhdGFDYWNoZSA9IHt9O1xudmFyIHJlZlRvSnNvblBvaW50ZXIgPSBoZWxwZXJzLnJlZlRvSnNvblBvaW50ZXI7XG52YXIgdG9Kc29uUG9pbnRlciA9IGhlbHBlcnMudG9Kc29uUG9pbnRlcjtcblxudmFyIGNyZWF0ZVZhbGlkYXRvciA9IGZ1bmN0aW9uIGNyZWF0ZVZhbGlkYXRvciAoc3BlYywgc2NoZW1hTmFtZXMpIHtcbiAgdmFyIHZhbGlkYXRvciA9IGpqdihqanZPcHRpb25zKTtcblxuICAvLyBEaXNhYmxlIHRoZSAndXJpJyBmb3JtYXQgY2hlY2tlciBhcyBpdCdzIGdvdCBpc3N1ZXM6IGh0dHBzOi8vZ2l0aHViLmNvbS9hY29ybmVqby9qanYvaXNzdWVzLzI0XG4gIHZhbGlkYXRvci5hZGRGb3JtYXQoJ3VyaScsIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICB2YWxpZGF0b3IuYWRkU2NoZW1hKGRyYWZ0MDRVcmwsIGRyYWZ0MDRKc29uKTtcblxuICAvLyBDb21waWxlIHRoZSBuZWNlc3Nhcnkgc2NoZW1hc1xuICBfLmVhY2goc2NoZW1hTmFtZXMsIGZ1bmN0aW9uIChzY2hlbWFOYW1lKSB7XG4gICAgdmFyIGNsb25lID0gXy5jbG9uZURlZXAoc3BlYy5zY2hlbWFzW3NjaGVtYU5hbWVdKTtcblxuICAgIGNsb25lLmlkID0gc2NoZW1hTmFtZTtcblxuICAgIHZhbGlkYXRvci5hZGRTY2hlbWEoc2NoZW1hTmFtZSwgY2xvbmUpO1xuICB9LmJpbmQodGhpcykpO1xuXG4gIHZhbGlkYXRvci5qZSA9IGpqdmUodmFsaWRhdG9yKTtcblxuICByZXR1cm4gdmFsaWRhdG9yO1xufTtcblxudmFyIGNyZWF0ZUVycm9yT3JXYXJuaW5nID0gZnVuY3Rpb24gY3JlYXRlRXJyb3JPcldhcm5pbmcgKGNvZGUsIG1lc3NhZ2UsIGRhdGEsIHBhdGgsIGRlc3QpIHtcbiAgZGVzdC5wdXNoKHtcbiAgICBjb2RlOiBjb2RlLFxuICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgZGF0YTogZGF0YSxcbiAgICBwYXRoOiBwYXRoXG4gIH0pO1xufTtcblxudmFyIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nID0gZnVuY3Rpb24gY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcgKGRhdGEsIHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlVTRURfJyArIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCArICcgaXMgZGVmaW5lZCBidXQgaXMgbm90IHVzZWQ6ICcgKyB2YWwsIGRhdGEsIHBhdGgsIGRlc3QpO1xufTtcblxudmFyIHZhbGlkYXRlRXhpc3QgPSBmdW5jdGlvbiB2YWxpZGF0ZUV4aXN0IChkYXRhLCB2YWwsIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCwgcGF0aCwgZGVzdCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoZGF0YSkgJiYgZGF0YS5pbmRleE9mKHZhbCkgPT09IC0xKSB7XG4gICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyB2YWwsIHZhbCwgcGF0aCwgZGVzdCk7XG4gIH1cbn07XG5cbnZhciB2YWxpZGF0ZU5vRXhpc3QgPSBmdW5jdGlvbiB2YWxpZGF0ZU5vRXhpc3QgKGRhdGEsIHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChkYXRhKSAmJiBkYXRhLmluZGV4T2YodmFsKSA+IC0xKSB7XG4gICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBhbHJlYWR5IGRlZmluZWQ6ICcgKyB2YWwsIHZhbCwgcGF0aCwgZGVzdCk7XG4gIH1cbn07XG5cbnZhciB2YWxpZGF0ZU5vRHVwbGljYXRlcyA9IGZ1bmN0aW9uIHZhbGlkYXRlTm9EdXBsaWNhdGVzIChkYXRhLCBjb2RlU3VmZml4LCBtc2dQcmVmaXgsIHBhdGgsIGRlc3QpIHtcbiAgdmFyIG5hbWUgPSBwYXRoW3BhdGgubGVuZ3RoIC0gMV07XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGRhdGEpICYmIGRhdGEubGVuZ3RoICE9PSBfLnVuaXEoZGF0YSkubGVuZ3RoKSB7XG4gICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyAnICsgbmFtZSArICcgaGFzIGR1cGxpY2F0ZSBpdGVtcycsIGRhdGEsIHBhdGgsIGRlc3QpO1xuICB9XG59O1xuXG4vLyBUT0RPOiBNb3ZlIHRoaXMgdG8gYSBoZWxwZXJcblxudmFyIHZhbGlkYXRlUGFyYW1ldGVyQ29uc3RyYWludHMgPSBmdW5jdGlvbiB2YWxpZGF0ZVBhcmFtZXRlckNvbnN0cmFpbnRzIChzcGVjLCBwYXJhbWV0ZXIsIHZhbCwgcGF0aCwgZGVzdCkge1xuICBzd2l0Y2ggKHNwZWMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIFRPRE86IE1ha2UgdGhpcyB3b3JrIHdpdGggcGFyYW1ldGVycyB0aGF0IGhhdmUgcmVmZXJlbmNlc1xuXG4gICAgLy8gVmFsaWRhdGUgdGhlIHZhbHVlIHR5cGUvZm9ybWF0XG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVUeXBlQW5kRm9ybWF0KHBhcmFtZXRlci5uYW1lLCB2YWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIudHlwZSA9PT0gJ2FycmF5JyA/IHBhcmFtZXRlci5pdGVtcy50eXBlIDogcGFyYW1ldGVyLnR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIudHlwZSA9PT0gJ2FycmF5JyAmJiBwYXJhbWV0ZXIuaXRlbXMuZm9ybWF0ID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLml0ZW1zLmZvcm1hdCA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlci5mb3JtYXQpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgLy8gVE9ETzogVXBkYXRlIHRvIG5vdGlmeSBvZiAnSU5WQUxJRF9GT1JNQVQnXG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyAoJ0lOVkFMSURfVFlQRScsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIGVudW1cbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZUVudW0ocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLmVudW0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcgKCdFTlVNX01JU01BVENIJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWF4aW11bVxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlTWF4aW11bShwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIubWF4aW11bSwgcGFyYW1ldGVyLnR5cGUpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcgKCdNQVhJTVVNJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWluaW11bVxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlTWluaW11bShwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIubWluaW11bSwgcGFyYW1ldGVyLnR5cGUpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcgKCdNSU5JTVVNJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgdW5pcXVlSXRlbXNcbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZVVuaXF1ZUl0ZW1zKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci51bmlxdWVJdGVtcyk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyAoJ0FSUkFZX1VOSVFVRScsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVE9ETzogTWFrZSB0aGlzIHdvcmsgd2l0aCBwYXJhbWV0ZXJzIHRoYXQgaGF2ZSBzY2hlbWFzL3JlZmVyZW5jZXNcblxuICAgIC8vIFZhbGlkYXRlIHRoZSB2YWx1ZSB0eXBlL2Zvcm1hdFxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlVHlwZUFuZEZvcm1hdChwYXJhbWV0ZXIubmFtZSwgdmFsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLnR5cGUgPT09ICdhcnJheScgPyBwYXJhbWV0ZXIuaXRlbXMudHlwZSA6IHBhcmFtZXRlci50eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLnR5cGUgPT09ICdhcnJheScgJiYgcGFyYW1ldGVyLml0ZW1zLmZvcm1hdCA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlci5pdGVtcy5mb3JtYXQgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIuZm9ybWF0KTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIC8vIFRPRE86IFVwZGF0ZSB0byBub3RpZnkgb2YgJ0lOVkFMSURfRk9STUFUJ1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0lOVkFMSURfVFlQRScsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIGVudW1cbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZUVudW0ocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLmVudW0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0VOVU1fTUlTTUFUQ0gnLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhpbXVtXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVNYXhpbXVtKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5tYXhpbXVtLCBwYXJhbWV0ZXIudHlwZSwgcGFyYW1ldGVyLmV4Y2x1c2l2ZU1heGltdW0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcocGFyYW1ldGVyLmV4Y2x1c2l2ZU1heGltdW0gPT09IHRydWUgPyAnTUFYSU1VTV9FWENMVVNJVkUnIDogJ01BWElNVU0nLCBlcnIubWVzc2FnZSwgdmFsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWF4aW11bSBpdGVtc1xuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlTWF4SXRlbXMocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1heEl0ZW1zKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdBUlJBWV9MRU5HVEhfTE9ORycsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIG1heGltdW0gbGVuZ3RoXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVNYXhMZW5ndGgocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1heExlbmd0aCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUFYX0xFTkdUSCcsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIG1pbmltdW1cbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1pbmltdW0ocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1pbmltdW0sIHBhcmFtZXRlci50eXBlLCBwYXJhbWV0ZXIuZXhjbHVzaXZlTWluaW11bSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyhwYXJhbWV0ZXIuZXhjbHVzaXZlTWluaW11bSA9PT0gJ3RydWUnID8gJ01JTklNVU1fRVhDTFVTSVZFJyA6ICdNSU5JTVVNJywgZXJyLm1lc3NhZ2UsIHZhbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIG1pbmltdW0gaXRlbXNcbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1pbkl0ZW1zKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5taW5JdGVtcyk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQVJSQVlfTEVOR1RIX1NIT1JUJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWluaW11bSBsZW5ndGhcbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1pbkxlbmd0aChwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIubWluTGVuZ3RoKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNSU5fTEVOR1RIJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgcGF0dGVyblxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlUGF0dGVybihwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIucGF0dGVybik7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnUEFUVEVSTicsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIHVuaXF1ZUl0ZW1zXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVVbmlxdWVJdGVtcyhwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIudW5pcXVlSXRlbXMpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0FSUkFZX1VOSVFVRScsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBicmVhaztcbiAgfVxufTtcblxudmFyIG5vcm1hbGl6ZVBhdGggPSBmdW5jdGlvbiBub3JtYWxpemVQYXRoIChwYXRoKSB7XG4gIHZhciBhcmdOYW1lcyA9IFtdO1xuICB2YXIgc2VnbWVudHMgPSBbXTtcblxuICBfLmVhY2gocGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbiAoc2VnbWVudCkge1xuICAgIGlmIChzZWdtZW50LmNoYXJBdCgwKSA9PT0gJ3snKSB7XG4gICAgICBhcmdOYW1lcy5wdXNoKHNlZ21lbnQuc3Vic3RyaW5nKDEpLnNwbGl0KCd9JylbMF0pO1xuXG4gICAgICBzZWdtZW50ID0gJ3snICsgKGFyZ05hbWVzLmxlbmd0aCAtIDEpICsgJ30nO1xuICAgIH1cblxuICAgIHNlZ21lbnRzLnB1c2goc2VnbWVudCk7XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgcGF0aDogc2VnbWVudHMuam9pbignLycpLFxuICAgIGFyZ3M6IGFyZ05hbWVzXG4gIH07XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgU3dhZ2dlciBzcGVjaWZpY2F0aW9uIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvbiAtIFRoZSBTd2FnZ2VyIHZlcnNpb25cbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIFNwZWNpZmljYXRpb24gPSBmdW5jdGlvbiBTcGVjaWZpY2F0aW9uICh2ZXJzaW9uKSB7XG4gIHZhciBwcmltaXRpdmVzID0gWydzdHJpbmcnLCAnbnVtYmVyJywgJ2Jvb2xlYW4nLCAnaW50ZWdlcicsICdhcnJheSddO1xuICB2YXIgZG9jc1VybDtcbiAgdmFyIHNjaGVtYXNVcmw7XG5cbiAgc3dpdGNoICh2ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgZG9jc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vd29yZG5pay9zd2FnZ2VyLXNwZWMvYmxvYi9tYXN0ZXIvdmVyc2lvbnMvMS4yLm1kJztcbiAgICBwcmltaXRpdmVzID0gXy51bmlvbihwcmltaXRpdmVzLCBbJ3ZvaWQnLCAnRmlsZSddKTtcbiAgICBzY2hlbWFzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS93b3JkbmlrL3N3YWdnZXItc3BlYy90cmVlL21hc3Rlci9zY2hlbWFzL3YxLjInO1xuXG4gICAgYnJlYWs7XG4gIGNhc2UgJzIuMCc6XG4gICAgZG9jc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vd29yZG5pay9zd2FnZ2VyLXNwZWMvYmxvYi9tYXN0ZXIvdmVyc2lvbnMvMi4wLm1kJztcbiAgICBwcmltaXRpdmVzID0gXy51bmlvbihwcmltaXRpdmVzLCBbJ2ZpbGUnXSk7XG4gICAgc2NoZW1hc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vd29yZG5pay9zd2FnZ2VyLXNwZWMvdHJlZS9tYXN0ZXIvc2NoZW1hcy92Mi4wJztcblxuICAgIGJyZWFrO1xuICBkZWZhdWx0OlxuICAgIHRocm93IG5ldyBFcnJvcih2ZXJzaW9uICsgJyBpcyBhbiB1bnN1cHBvcnRlZCBTd2FnZ2VyIHNwZWNpZmljYXRpb24gdmVyc2lvbicpO1xuICB9XG5cbiAgdGhpcy5kb2NzVXJsID0gZG9jc1VybDtcbiAgdGhpcy5wcmltaXRpdmVzID0gcHJpbWl0aXZlcztcbiAgdGhpcy5zY2hlbWFzVXJsID0gc2NoZW1hc1VybDtcbiAgdGhpcy52ZXJzaW9uID0gdmVyc2lvbjtcblxuICAvLyBMb2FkIHRoZSBzY2hlbWEgZmlsZXNcbiAgdGhpcy5zY2hlbWFzID0ge307XG5cbiAgLy8gQ3JlYXRlIHRoZSB2YWxpZGF0b3JzXG4gIHRoaXMudmFsaWRhdG9ycyA9IHt9O1xuXG4gIHN3aXRjaCAodmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIEhlcmUgZXhwbGljaXRseSB0byBhbGxvdyBicm93c2VyaWZ5IHRvIHdvcmtcbiAgICB0aGlzLnNjaGVtYXNbJ2FwaURlY2xhcmF0aW9uLmpzb24nXSA9IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2FwaURlY2xhcmF0aW9uLmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydkYXRhVHlwZS5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9kYXRhVHlwZS5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydkYXRhVHlwZUJhc2UuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvZGF0YVR5cGVCYXNlLmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ2luZm9PYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvaW5mb09iamVjdC5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydtb2RlbHNPYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvbW9kZWxzT2JqZWN0Lmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ29hdXRoMkdyYW50VHlwZS5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9vYXV0aDJHcmFudFR5cGUuanNvbicpO1xuICAgIHRoaXMuc2NoZW1hc1snb3BlcmF0aW9uT2JqZWN0Lmpzb24nXSA9IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL29wZXJhdGlvbk9iamVjdC5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydwYXJhbWV0ZXJPYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcGFyYW1ldGVyT2JqZWN0Lmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ3Jlc291cmNlTGlzdGluZy5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9yZXNvdXJjZUxpc3RpbmcuanNvbicpO1xuICAgIHRoaXMuc2NoZW1hc1sncmVzb3VyY2VPYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcmVzb3VyY2VPYmplY3QuanNvbicpO1xuXG4gICAgdGhpcy52YWxpZGF0b3JzWydhcGlEZWNsYXJhdGlvbi5qc29uJ10gPSBjcmVhdGVWYWxpZGF0b3IodGhpcywgW1xuICAgICAgJ2RhdGFUeXBlQmFzZS5qc29uJyxcbiAgICAgICdtb2RlbHNPYmplY3QuanNvbicsXG4gICAgICAnb2F1dGgyR3JhbnRUeXBlLmpzb24nLFxuICAgICAgJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbicsXG4gICAgICAncGFyYW1ldGVyT2JqZWN0Lmpzb24nLFxuICAgICAgJ29wZXJhdGlvbk9iamVjdC5qc29uJyxcbiAgICAgICdhcGlEZWNsYXJhdGlvbi5qc29uJ1xuICAgIF0pO1xuXG4gICAgdGhpcy52YWxpZGF0b3JzWydyZXNvdXJjZUxpc3RpbmcuanNvbiddID0gY3JlYXRlVmFsaWRhdG9yKHRoaXMsIFtcbiAgICAgICdyZXNvdXJjZU9iamVjdC5qc29uJyxcbiAgICAgICdpbmZvT2JqZWN0Lmpzb24nLFxuICAgICAgJ29hdXRoMkdyYW50VHlwZS5qc29uJyxcbiAgICAgICdhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24nLFxuICAgICAgJ3Jlc291cmNlTGlzdGluZy5qc29uJ1xuICAgIF0pO1xuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBIZXJlIGV4cGxpY2l0bHkgdG8gYWxsb3cgYnJvd3NlcmlmeSB0byB3b3JrXG4gICAgdGhpcy5zY2hlbWFzWydzY2hlbWEuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8yLjAvc2NoZW1hLmpzb24nKTtcblxuICAgIHRoaXMudmFsaWRhdG9yc1snc2NoZW1hLmpzb24nXSA9IGNyZWF0ZVZhbGlkYXRvcih0aGlzLCBbXG4gICAgICAnc2NoZW1hLmpzb24nXG4gICAgXSk7XG5cbiAgICBicmVhaztcbiAgfVxufTtcblxudmFyIGdldE1vZGVsTWV0YWRhdGEgPSBmdW5jdGlvbiBnZXRNb2RlbE1ldGFkYXRhIChtb2RlbHNNZXRhZGF0YSwgbW9kZWxJZCkge1xuICB2YXIgbWV0YWRhdGEgPSBtb2RlbHNNZXRhZGF0YVttb2RlbElkXTtcblxuICBpZiAoXy5pc1VuZGVmaW5lZChtZXRhZGF0YSkpIHtcbiAgICBtZXRhZGF0YSA9IG1vZGVsc01ldGFkYXRhW21vZGVsSWRdID0ge1xuICAgICAgY29tcG9zZWQ6IHt9LFxuICAgICAgbmFtZTogdW5kZWZpbmVkLFxuICAgICAgcGFyZW50czogW10sXG4gICAgICByZWZzOiBbXSxcbiAgICAgIHNjaGVtYTogdW5kZWZpbmVkXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBtZXRhZGF0YTtcbn07XG5cbnZhciBwcm9jZXNzTW9kZWwgPSBmdW5jdGlvbiBwcm9jZXNzTW9kZWwgKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBtb2RlbCwgbW9kZWxJZCwgcGF0aCwgcmVzdWx0cykge1xuICB2YXIgbWV0YWRhdGEgPSBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCBtb2RlbElkKTtcblxuICAvLyBFbnN1cmUgdGhlIG1vZGVsJ3MgbmFtZSBhbmQgc2NoZW1hIGFyZSBzZXRcbiAgbWV0YWRhdGEuc2NoZW1hID0gbW9kZWw7XG4gIG1ldGFkYXRhLm5hbWUgPSBtb2RlbElkOyAvLyBSZWFzb25hYmxlIGRlZmF1bHRcbiAgbWV0YWRhdGEucGF0aCA9IHBhdGg7XG5cbiAgc3dpdGNoIChzcGVjLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBTZXQgdGhlIG1vZGVsJ3MgbmFtZSB0byB0aGUgcHJvcGVyIHZhbHVlXG4gICAgbWV0YWRhdGEubmFtZSA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXTtcblxuICAgIC8vIEFkZCBtb2RlbCByZWZlcmVuY2VzIGZyb20gcHJvcGVydGllcyBhbmQgdmFsaWRhdGUgdGhlIGRlZmF1bHQgdmFsdWVzXG4gICAgXy5lYWNoKG1vZGVsLnByb3BlcnRpZXMsIGZ1bmN0aW9uIChwcm9wZXJ0eSwgbmFtZSkge1xuICAgICAgdmFyIHBQYXRoID0gcGF0aC5jb25jYXQoJ3Byb3BlcnRpZXMnLCBuYW1lKTtcblxuICAgICAgLy8gS2VlcCB0cmFjayBvZiB0aGUgbW9kZWwgcmVmZXJlbmNlc1xuICAgICAgaWYgKHByb3BlcnR5LiRyZWYpIHtcbiAgICAgICAgZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgcHJvcGVydHkuJHJlZikucmVmcy5wdXNoKHBQYXRoLmNvbmNhdChbJyRyZWYnXSkpO1xuICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknICYmIHByb3BlcnR5Lml0ZW1zLiRyZWYpIHtcbiAgICAgICAgZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgcHJvcGVydHkuaXRlbXMuJHJlZikucmVmcy5wdXNoKHBQYXRoLmNvbmNhdChbJ2l0ZW1zJywgJyRyZWYnXSkpO1xuICAgICAgfVxuXG4gICAgICAvLyBWYWxpZGF0ZSB0aGUgZGVmYXVsdCB2YWx1ZSBhZ2FpbnN0IGNvbnN0cmFpbnRzXG4gICAgICBpZiAoIV8uaXNVbmRlZmluZWQocHJvcGVydHkuZGVmYXVsdFZhbHVlKSkge1xuICAgICAgICB2YWxpZGF0ZVBhcmFtZXRlckNvbnN0cmFpbnRzKHNwZWMsIHByb3BlcnR5LCBwcm9wZXJ0eS5kZWZhdWx0VmFsdWUsIHBQYXRoLmNvbmNhdCgnZGVmYXVsdFZhbHVlJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gS2VlcCB0cmFjayBvZiBtb2RlbCByZWZlcmVuY2VzIGluIHN1YlR5cGVzXG4gICAgXy5lYWNoKF8udW5pcShtb2RlbC5zdWJUeXBlcyksIGZ1bmN0aW9uIChzdWJUeXBlLCBpbmRleCkge1xuICAgICAgdmFyIHN1Yk1ldGFkYXRhID0gZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgc3ViVHlwZSk7XG5cbiAgICAgIHN1Yk1ldGFkYXRhLnBhcmVudHMucHVzaChtb2RlbElkKTtcbiAgICAgIHN1Yk1ldGFkYXRhLnJlZnMucHVzaChwYXRoLmNvbmNhdCgnc3ViVHlwZXMnLCBpbmRleC50b1N0cmluZygpKSk7XG4gICAgfSk7XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIEtlZXAgdHJhY2sgb2YgbW9kZWwgcmVmZXJlbmNlcyBpbiBhbGxPZlxuICAgIF8uZWFjaChfLnVuaXEobW9kZWwuYWxsT2YpLCBmdW5jdGlvbiAoc2NoZW1hLCBpbmRleCkge1xuICAgICAgdmFyIHNQYXRoID0gcGF0aC5jb25jYXQoJ2FsbE9mJywgaW5kZXgudG9TdHJpbmcoKSk7XG5cbiAgICAgIGlmIChfLmlzVW5kZWZpbmVkKHNjaGVtYS4kcmVmKSkge1xuICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIHNjaGVtYSwgdG9Kc29uUG9pbnRlcihzUGF0aCksIHNQYXRoLCByZXN1bHRzKTtcblxuICAgICAgICBtZXRhZGF0YS5wYXJlbnRzLnB1c2godG9Kc29uUG9pbnRlcihzUGF0aCkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWV0YWRhdGEucGFyZW50cy5wdXNoKHJlZlRvSnNvblBvaW50ZXIoc2NoZW1hLiRyZWYpKTtcblxuICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCByZWZUb0pzb25Qb2ludGVyKHNjaGVtYS4kcmVmKSkucmVmcy5wdXNoKHNQYXRoLmNvbmNhdCgnJHJlZicpKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFZhbGlkYXRlIHRoZSBkZWZhdWx0IHZhbHVlIGFnYWluc3QgY29uc3RyYWludHNcbiAgICBpZiAoIV8uaXNVbmRlZmluZWQobW9kZWwuZGVmYXVsdCkpIHtcbiAgICAgIHZhbGlkYXRlUGFyYW1ldGVyQ29uc3RyYWludHMoc3BlYywgbW9kZWwsIG1vZGVsLmRlZmF1bHRWYWx1ZSwgcGF0aC5jb25jYXQoJ2RlZmF1bHQnKSwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cblxuICAgIC8vIFNraXBwaW5nICdkZWZpbml0aW9ucycgZm9yIG5vdzogaHR0cHM6Ly9naXRodWIuY29tL3JldmVyYi9zd2FnZ2VyLXNwZWMvaXNzdWVzLzEyN1xuXG4gICAgLy8gS2VlcCB0cmFjayBvZiBtb2RlbCByZWZlcmVuY2VzIGluICRyZWYsIGl0ZW1zLiRyZWZcbiAgICBpZiAobW9kZWwuJHJlZikge1xuICAgICAgZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgcmVmVG9Kc29uUG9pbnRlcihtb2RlbC4kcmVmKSkucmVmcy5wdXNoKHBhdGguY29uY2F0KFsnJHJlZiddKSk7XG4gICAgfSBlbHNlIGlmIChtb2RlbC50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICBpZiAobW9kZWwuaXRlbXMuJHJlZikge1xuICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCByZWZUb0pzb25Qb2ludGVyKG1vZGVsLml0ZW1zLiRyZWYpKS5yZWZzLnB1c2gocGF0aC5jb25jYXQoWydpdGVtcycsICckcmVmJ10pKTtcbiAgICAgIH0gZWxzZSBpZiAoIV8uaXNVbmRlZmluZWQobW9kZWwuaXRlbXMudHlwZSkgJiYgc3BlYy5wcmltaXRpdmVzLmluZGV4T2YobW9kZWwuaXRlbXMudHlwZSkgPT09IC0xKSB7XG4gICAgICAgIF8uZWFjaChtb2RlbC5pdGVtcywgZnVuY3Rpb24gKGl0ZW0sIGluZGV4KSB7XG4gICAgICAgICAgdmFyIHNQYXRoID0gcGF0aC5jb25jYXQoJ2l0ZW1zJywgaW5kZXgudG9TdHJpbmcoKSk7XG5cbiAgICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIGl0ZW0sIHRvSnNvblBvaW50ZXIoc1BhdGgpLCBzUGF0aCwgcmVzdWx0cyk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIF8uZWFjaChtb2RlbC5wcm9wZXJ0aWVzLCBmdW5jdGlvbiAocHJvcGVydHksIG5hbWUpIHtcbiAgICAgIHZhciBwUGF0aCA9IHBhdGguY29uY2F0KCdwcm9wZXJ0aWVzJywgbmFtZSk7XG5cbiAgICAgIC8vIEtlZXAgdHJhY2sgb2YgbW9kZWwgcmVmZXJlbmNlcyBpbiAkcmVmLCBpdGVtcy4kcmVmXG4gICAgICBpZiAocHJvcGVydHkuJHJlZikge1xuICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCByZWZUb0pzb25Qb2ludGVyKHByb3BlcnR5LiRyZWYpKS5yZWZzLnB1c2gocFBhdGguY29uY2F0KFsnJHJlZiddKSk7XG4gICAgICB9IGVsc2UgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgICAgaWYgKHByb3BlcnR5Lml0ZW1zLiRyZWYpIHtcbiAgICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVmVG9Kc29uUG9pbnRlcihwcm9wZXJ0eS5pdGVtcy4kcmVmKSkucmVmcy5wdXNoKHBQYXRoLmNvbmNhdChbJ2l0ZW1zJywgJyRyZWYnXSkpO1xuICAgICAgICB9IGVsc2UgaWYgKCFfLmlzVW5kZWZpbmVkKHByb3BlcnR5Lml0ZW1zLnR5cGUpICYmIHNwZWMucHJpbWl0aXZlcy5pbmRleE9mKHByb3BlcnR5Lml0ZW1zLnR5cGUpID09PSAtMSkge1xuICAgICAgICAgIF8uZWFjaChwcm9wZXJ0eS5pdGVtcywgZnVuY3Rpb24gKHNjaGVtYSwgaW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBzUGF0aCA9IHBQYXRoLmNvbmNhdCgnaXRlbXMnLCBpbmRleC50b1N0cmluZygpKTtcblxuICAgICAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBzY2hlbWEsIHRvSnNvblBvaW50ZXIoc1BhdGgpLCBzUGF0aCwgcmVzdWx0cyk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuXG4gICAgLy8gQWRkIHNlbGYgcmVmZXJlbmNlIHRvIGFsbCBtb2RlbCBkZWZpbml0aW9ucyBvdXRzaWRlIG9mICMvZGVmaW5pdGlvbnMgKFRoZXkgYXJlIGlubGluZSBtb2RlbHMgb3IgcmVmZXJlbmNlcylcbiAgICBpZiAodG9Kc29uUG9pbnRlcihwYXRoKS5pbmRleE9mKCcjL2RlZmluaXRpb25zLycpID09PSAtMSkge1xuICAgICAgbWV0YWRhdGEucmVmcy5wdXNoKHBhdGgpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuICB9XG59O1xuXG52YXIgZ2V0TW9kZWxzTWV0YWRhdGEgPSBmdW5jdGlvbiBnZXRNb2RlbHNNZXRhZGF0YSAoc3BlYywgYXBpRE9yU08sIHJlc3VsdHMpIHtcbiAgdmFyIGNpcmN1bGFyID0ge307XG4gIHZhciBsb2NhbFJlc3VsdHMgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcbiAgdmFyIHJlc29sdmVkID0ge307XG4gIHZhciB1bnJlc29sdmVkID0ge307XG4gIHZhciBhZGRNb2RlbFByb3BzID0gZnVuY3Rpb24gYWRkTW9kZWxQcm9wcyAobW9kZWxJZCwgY29tcG9zZWQpIHtcbiAgICB2YXIgbW9kZWwgPSBtb2RlbHNNZXRhZGF0YVttb2RlbElkXS5zY2hlbWE7XG5cbiAgICBpZiAobW9kZWwpIHtcbiAgICAgIF8uZWFjaChtb2RlbC5wcm9wZXJ0aWVzLCBmdW5jdGlvbiAocHJvcCwgcHJvcE5hbWUpIHtcbiAgICAgICAgdmFyIG5ld1Byb3AgPSBfLmNsb25lRGVlcChwcm9wKTtcblxuICAgICAgICBpZiAoY29tcG9zZWQucHJvcGVydGllc1twcm9wTmFtZV0pIHtcbiAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQ0hJTERfTU9ERUxfUkVERUNMQVJFU19QUk9QRVJUWScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0NoaWxkIG1vZGVsIGRlY2xhcmVzIHByb3BlcnR5IGFscmVhZHkgZGVjbGFyZWQgYnkgYW5jZXN0b3I6ICcgKyBwcm9wTmFtZSwgcHJvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcGVjLnZlcnNpb24gPT09ICcxLjInID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnbW9kZWxzJywgbW9kZWxJZCwgJ3Byb3BlcnRpZXMnLCBwcm9wTmFtZV0gOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxJZC5zdWJzdHJpbmcoMikuc3BsaXQoJy8nKS5jb25jYXQoJ3Byb3BlcnRpZXMnLCBwcm9wTmFtZSksIGxvY2FsUmVzdWx0cy5lcnJvcnMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICAgICAgICAvLyBTYW5pdGl6ZSB0aGUgbWF4aW11bS9taW5pbXVtIHZhbHVlcyB0byBiZSBudW1iZXJzXG4gICAgICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQobmV3UHJvcC5tYXhpbXVtKSkge1xuICAgICAgICAgICAgICBuZXdQcm9wLm1heGltdW0gPSBwYXJzZUZsb2F0KG5ld1Byb3AubWF4aW11bSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChuZXdQcm9wLm1pbmltdW0pKSB7XG4gICAgICAgICAgICAgIG5ld1Byb3AubWluaW11bSA9IHBhcnNlRmxvYXQobmV3UHJvcC5taW5pbXVtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgY29tcG9zZWQucHJvcGVydGllc1twcm9wTmFtZV0gPSBuZXdQcm9wO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKG1vZGVsLnJlcXVpcmVkKSAmJiBfLmlzVW5kZWZpbmVkKGNvbXBvc2VkLnJlcXVpcmVkKSkge1xuICAgICAgICBjb21wb3NlZC5yZXF1aXJlZCA9IFtdO1xuICAgICAgfVxuXG4gICAgICBfLmVhY2gobW9kZWwucmVxdWlyZWQsIGZ1bmN0aW9uIChwcm9wTmFtZSkge1xuICAgICAgICBpZiAoY29tcG9zZWQucmVxdWlyZWQuaW5kZXhPZihwcm9wTmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgY29tcG9zZWQucmVxdWlyZWQucHVzaChwcm9wTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbiAgdmFyIGdldFBhdGggPSBmdW5jdGlvbiBnZXRQYXRoIChwYXJlbnQsIHVucmVzb2x2ZWQpIHtcbiAgICB2YXIgcGFyZW50VmlzaXRlZCA9IGZhbHNlO1xuXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHVucmVzb2x2ZWQpLmZpbHRlcihmdW5jdGlvbiAoZGVwKSB7XG4gICAgICBpZiAoZGVwID09PSBwYXJlbnQpIHtcbiAgICAgICAgcGFyZW50VmlzaXRlZCA9IHRydWU7XG4gICAgICB9XG4gICAgICByZXR1cm4gcGFyZW50VmlzaXRlZCAmJiB1bnJlc29sdmVkW2RlcF07XG4gICAgfSk7XG4gIH07XG4gIHZhciByZXNvbHZlciA9IGZ1bmN0aW9uIHJlc29sdmVyIChtb2RlbElkLCBjaXJjdWxhciwgcmVzb2x2ZWQsIHVucmVzb2x2ZWQsIGNvbXBvc2VkKSB7XG4gICAgdmFyIG1ldGFkYXRhID0gbW9kZWxzTWV0YWRhdGFbbW9kZWxJZF07XG4gICAgdmFyIG1vZGVsID0gbWV0YWRhdGEuc2NoZW1hO1xuXG4gICAgdW5yZXNvbHZlZFttb2RlbElkXSA9IHRydWU7XG5cbiAgICBpZiAoIV8uaXNVbmRlZmluZWQobW9kZWwpKSB7XG4gICAgICAvLyAxLjIgZG9lcyBub3QgYWxsb3cgbXVsdGlwbGUgaW5oZXJpdGFuY2Ugd2hpbGUgMi4wKyBkb2VzXG4gICAgICBpZiAobWV0YWRhdGEucGFyZW50cy5sZW5ndGggPiAxICYmIHNwZWMudmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01VTFRJUExFX01PREVMX0lOSEVSSVRBTkNFJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0NoaWxkIG1vZGVsIGlzIHN1YiB0eXBlIG9mIG11bHRpcGxlIG1vZGVsczogJyArIG1ldGFkYXRhLnBhcmVudHMuam9pbignICYmICcpLCBtb2RlbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydtb2RlbHMnLCBtb2RlbElkXSwgbG9jYWxSZXN1bHRzLmVycm9ycyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBfLmVhY2gobWV0YWRhdGEucGFyZW50cywgZnVuY3Rpb24gKGRlcCkge1xuICAgICAgICAgIGlmICghcmVzb2x2ZWRbZGVwXSkge1xuICAgICAgICAgICAgaWYgKHVucmVzb2x2ZWRbZGVwXSkge1xuICAgICAgICAgICAgICBjaXJjdWxhclttb2RlbElkXSA9IGdldFBhdGgoZGVwLCB1bnJlc29sdmVkKTtcblxuICAgICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQ1lDTElDQUxfTU9ERUxfSU5IRVJJVEFOQ0UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnTW9kZWwgaGFzIGEgY2lyY3VsYXIgaW5oZXJpdGFuY2U6ICcgKyBtb2RlbElkICsgJyAtPiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaXJjdWxhclttb2RlbElkXS5qb2luKCcgLT4gJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNwZWMudmVyc2lvbiA9PT0gJzEuMicgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsLnN1YlR5cGVzIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbC5hbGxPZixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3BlYy52ZXJzaW9uID09PSAnMS4yJyA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydtb2RlbHMnLCBtb2RlbElkLCAnc3ViVHlwZXMnXSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxJZC5zdWJzdHJpbmcoMikuc3BsaXQoJy8nKS5jb25jYXQoJ2FsbE9mJyksIGxvY2FsUmVzdWx0cy5lcnJvcnMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBEbyBub3QgcmVzb2x2ZSBpZiBjaXJjdWxhclxuICAgICAgICAgICAgaWYgKCFjaXJjdWxhclttb2RlbElkXSkge1xuICAgICAgICAgICAgICByZXNvbHZlcihkZXAsIGNpcmN1bGFyLCByZXNvbHZlZCwgdW5yZXNvbHZlZCwgY29tcG9zZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIERvIG5vdCBhZGQgcHJvcGVydGllcyBpZiBjaXJjdWxhclxuICAgICAgICAgIGlmICghY2lyY3VsYXJbbW9kZWxJZF0pIHtcbiAgICAgICAgICAgIGFkZE1vZGVsUHJvcHMoZGVwLCBjb21wb3NlZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXNvbHZlZFttb2RlbElkXSA9IHRydWU7XG4gICAgdW5yZXNvbHZlZFttb2RlbElkXSA9IGZhbHNlO1xuICB9O1xuICB2YXIgaGFzaCA9IG1kNS5oYXNoKEpTT04uc3RyaW5naWZ5KGFwaURPclNPKSk7XG4gIHZhciBtZXRhZGF0YUVudHJ5ID0gbWV0YWRhdGFDYWNoZVtoYXNoXTtcbiAgdmFyIG1vZGVsc01ldGFkYXRhO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKG1ldGFkYXRhRW50cnkpKSB7XG4gICAgbWV0YWRhdGFFbnRyeSA9IG1ldGFkYXRhQ2FjaGVbaGFzaF0gPSB7XG4gICAgICBtZXRhZGF0YToge30sXG4gICAgICByZXN1bHRzOiBsb2NhbFJlc3VsdHNcbiAgICB9O1xuXG4gICAgbW9kZWxzTWV0YWRhdGEgPSBtZXRhZGF0YUVudHJ5Lm1ldGFkYXRhO1xuXG4gICAgc3dpdGNoIChzcGVjLnZlcnNpb24pIHtcbiAgICBjYXNlICcxLjInOlxuICAgICAgXy5yZWR1Y2UoYXBpRE9yU08ubW9kZWxzLCBmdW5jdGlvbiAoc2Vlbk1vZGVsSWRzLCBtb2RlbCwgbW9kZWxOYW1lKSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIHRoZSBtb2RlbCBpcyBub3QgYWxyZWFkeSBkZWZpbmVkIChieSBpZClcbiAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5Nb2RlbElkcywgbW9kZWwuaWQsICdNT0RFTF9ERUZJTklUSU9OJywgJ01vZGVsJywgWydtb2RlbHMnLCBtb2RlbE5hbWUsICdpZCddLFxuICAgICAgICAgICAgICAgICAgICAgICAgbG9jYWxSZXN1bHRzLmVycm9ycyk7XG5cbiAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBtb2RlbCwgbW9kZWwuaWQsIFsnbW9kZWxzJywgbW9kZWxOYW1lXSwgbG9jYWxSZXN1bHRzKTtcblxuICAgICAgICByZXR1cm4gc2Vlbk1vZGVsSWRzLmNvbmNhdChtb2RlbC5pZCk7XG4gICAgICB9LCBbXSk7XG5cbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAnMi4wJzpcbiAgICAgIC8vIEZpbmQgbW9kZWxzIGRlZmluZWQvcmVmZXJlbmNlZCBpbiAjL2RlZmluaXRpb25zXG4gICAgICBfLmVhY2goYXBpRE9yU08uZGVmaW5pdGlvbnMsIGZ1bmN0aW9uIChtb2RlbCwgbW9kZWxJZCkge1xuICAgICAgICB2YXIgZFBhdGggPSBbJ2RlZmluaXRpb25zJywgbW9kZWxJZF07XG5cbiAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBtb2RlbCwgdG9Kc29uUG9pbnRlcihkUGF0aCksIGRQYXRoLCBsb2NhbFJlc3VsdHMpO1xuICAgICAgfSk7XG5cbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIC8vIENvbXBvc2UgbW9kZWxzIGFuZCBpZGVudGlmeSBpbmhlcml0YW5jZSBpc3N1ZXNcbiAgICBfLmVhY2gobW9kZWxzTWV0YWRhdGEsIGZ1bmN0aW9uIChtZXRhZGF0YSwgbW9kZWxJZCkge1xuICAgICAgbWV0YWRhdGEuY29tcG9zZWQgPSB7XG4gICAgICAgIHRpdGxlOiAnQ29tcG9zZWQgJyArIG1vZGVsSWQsXG4gICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICBwcm9wZXJ0aWVzOiB7fVxuICAgICAgfTtcblxuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKG1ldGFkYXRhLnNjaGVtYSkpIHtcbiAgICAgICAgcmVzb2x2ZXIobW9kZWxJZCwgY2lyY3VsYXIsIHJlc29sdmVkLCB1bnJlc29sdmVkLCBtZXRhZGF0YS5jb21wb3NlZCk7XG4gICAgICAgIGFkZE1vZGVsUHJvcHMobW9kZWxJZCwgbWV0YWRhdGEuY29tcG9zZWQpO1xuICAgICAgfVxuXG4gICAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBwcm9wZXJ0aWVzXG4gICAgICBpZiAoIV8uaXNVbmRlZmluZWQobWV0YWRhdGEuc2NoZW1hLnJlcXVpcmVkKSkge1xuICAgICAgICBfLmVhY2gobWV0YWRhdGEuc2NoZW1hLnJlcXVpcmVkLCBmdW5jdGlvbiAocHJvcE5hbWUsIGluZGV4KSB7XG4gICAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQobWV0YWRhdGEuY29tcG9zZWQucHJvcGVydGllc1twcm9wTmFtZV0pKSB7XG4gICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUlTU0lOR19SRVFVSVJFRF9NT0RFTF9QUk9QRVJUWScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnTW9kZWwgcmVxdWlyZXMgcHJvcGVydHkgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgcHJvcE5hbWUsIHByb3BOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0YWRhdGEucGF0aC5jb25jYXQoWydyZXF1aXJlZCcsIGluZGV4LnRvU3RyaW5nKCldKSwgcmVzdWx0cy5lcnJvcnMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBSZXNvbHZlIHJlZmVyZW5jZXNcbiAgICBfLmVhY2gobW9kZWxzTWV0YWRhdGEsIGZ1bmN0aW9uIChtZXRhZGF0YSkge1xuICAgICAgdmFyIHJlZnMgPSB0cmF2ZXJzZShtZXRhZGF0YS5jb21wb3NlZCkucmVkdWNlKGZ1bmN0aW9uIChhY2MpIHtcbiAgICAgICAgaWYgKHRoaXMua2V5ID09PSAnJHJlZicpIHtcbiAgICAgICAgICBhY2NbdG9Kc29uUG9pbnRlcih0aGlzLnBhdGgpXSA9IHNwZWMudmVyc2lvbiA9PT0gJzEuMicgPyB0aGlzLm5vZGUgOiByZWZUb0pzb25Qb2ludGVyKHRoaXMubm9kZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgfSwge30pO1xuXG4gICAgICBfLmVhY2gocmVmcywgZnVuY3Rpb24gKG1vZGVsSWQsIHBhdGhQdHIpIHtcbiAgICAgICAgdmFyIHBhdGggPSBwYXRoUHRyLnN1YnN0cmluZygyKS5zcGxpdCgnLycpO1xuICAgICAgICB2YXIgcmVmTW9kZWwgPSBfLmlzVW5kZWZpbmVkKG1vZGVsc01ldGFkYXRhW21vZGVsSWRdKSA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICBfLmNsb25lRGVlcChtb2RlbHNNZXRhZGF0YVttb2RlbElkXS5jb21wb3NlZCk7XG5cbiAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlZk1vZGVsKSkge1xuICAgICAgICAgIGRlbGV0ZSByZWZNb2RlbC5pZDtcbiAgICAgICAgICBkZWxldGUgcmVmTW9kZWwudGl0bGU7XG5cbiAgICAgICAgICB0cmF2ZXJzZShtZXRhZGF0YS5jb21wb3NlZCkuc2V0KHBhdGguc2xpY2UoMCwgcGF0aC5sZW5ndGggLSAxKSwgcmVmTW9kZWwpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIE1lcmdlIHJlc3VsdHNcbiAgICBpZiAoIV8uaXNVbmRlZmluZWQocmVzdWx0cykpIHtcbiAgICAgIF8uZWFjaChsb2NhbFJlc3VsdHMsIGZ1bmN0aW9uIChlbnRyaWVzLCBkZXN0TmFtZSkge1xuICAgICAgICByZXN1bHRzW2Rlc3ROYW1lXSA9IHJlc3VsdHNbZGVzdE5hbWVdLmNvbmNhdChlbnRyaWVzKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtZXRhZGF0YUVudHJ5O1xufTtcblxudmFyIHZhbGlkYXRlV2l0aFNjaGVtYSA9IGZ1bmN0aW9uIHZhbGlkYXRlV2l0aFNjaGVtYSAoc3BlYywgc2NoZW1hTmFtZSwgZGF0YSkge1xuICB2YXIgdmFsaWRhdG9yID0gc3BlYy52YWxpZGF0b3JzW3NjaGVtYU5hbWVdO1xuICB2YXIgc2NoZW1hID0gdmFsaWRhdG9yLnNjaGVtYVtzY2hlbWFOYW1lXTtcbiAgdmFyIHJlc3VsdCA9IHZhbGlkYXRvci52YWxpZGF0ZShzY2hlbWEsIGRhdGEpO1xuICB2YXIgcmVzcG9uc2UgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcblxuICBpZiAocmVzdWx0KSB7XG4gICAgcmVzcG9uc2UgPSB7XG4gICAgICBlcnJvcnM6IHZhbGlkYXRvci5qZShzY2hlbWEsIGRhdGEsIHJlc3VsdCwgamp2ZU9wdGlvbnMpLFxuICAgICAgd2FybmluZ3M6IFtdXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbnZhciB2YWxpZGF0ZUNvbnRlbnQgPSBmdW5jdGlvbiB2YWxpZGF0ZUNvbnRlbnQgKHNwZWMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zKSB7XG4gIHZhciByZXNwb25zZSA9IHtcbiAgICBlcnJvcnM6IFtdLFxuICAgIHdhcm5pbmdzOiBbXVxuICB9O1xuICB2YXIgYXV0aERlZnMgPSB7fTsgLy8gKDEuMilcbiAgdmFyIGF1dGhSZWZzID0ge307IC8vICgxLjIpXG4gIHZhciBwYXRoRGVmcyA9IFtdOyAvLyAoMS4yKVxuICB2YXIgcGF0aFJlZnMgPSBbXTsgLy8gKDEuMilcblxuICBzd2l0Y2ggKHNwZWMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIEJ1aWxkIHBhdGggbW9kZWxcbiAgICBfLmVhY2gocmxPclNPLmFwaXMsIGZ1bmN0aW9uIChhcGksIGluZGV4KSB7XG4gICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aHNcbiAgICAgIHZhbGlkYXRlTm9FeGlzdChwYXRoRGVmcywgYXBpLnBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLCBbJ2FwaXMnLCBpbmRleC50b1N0cmluZygpLCAncGF0aCddLFxuICAgICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlLmVycm9ycyk7XG5cbiAgICAgIGlmIChwYXRoRGVmcy5pbmRleE9mKGFwaS5wYXRoKSA9PT0gLTEpIHtcbiAgICAgICAgcGF0aERlZnMucHVzaChhcGkucGF0aCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2UuZXJyb3JzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgLy8gQnVpbGQgdGhlIGF1dGhvcml6YXRpb24gbW9kZWxcbiAgICAgIF8uZWFjaChybE9yU08uYXV0aG9yaXphdGlvbnMsIGZ1bmN0aW9uIChhdXRob3JpemF0aW9uLCBuYW1lKSB7XG4gICAgICAgIGF1dGhEZWZzW25hbWVdID0gXy5tYXAoYXV0aG9yaXphdGlvbi5zY29wZXMsIGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICAgIHJldHVybiBzY29wZS5zY29wZTtcbiAgICAgICAgfSk7XG4gICAgICB9LCB7fSk7XG5cbiAgICAgIHJlc3BvbnNlLmFwaURlY2xhcmF0aW9ucyA9IFtdO1xuXG4gICAgICAvLyBWYWxpZGF0ZSB0aGUgQVBJIGRlY2xhcmF0aW9uc1xuICAgICAgXy5lYWNoKGFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGFwaURlY2xhcmF0aW9uLCBpbmRleCkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gcmVzcG9uc2UuYXBpRGVjbGFyYXRpb25zW2luZGV4XSA9IHtcbiAgICAgICAgICBlcnJvcnM6IFtdLFxuICAgICAgICAgIHdhcm5pbmdzOiBbXVxuICAgICAgICB9O1xuICAgICAgICB2YXIgYXBpQXV0aERlZnMgPSB7fTtcbiAgICAgICAgdmFyIGFwaUF1dGhSZWZzID0ge307XG4gICAgICAgIHZhciBtb2RlbHNNZXRhZGF0YSA9IGdldE1vZGVsc01ldGFkYXRhKHNwZWMsIGFwaURlY2xhcmF0aW9uLCByZXN1bHQpLm1ldGFkYXRhO1xuICAgICAgICB2YXIgYWRkTW9kZWxSZWYgPSBmdW5jdGlvbiBhZGRNb2RlbFJlZiAobW9kZWxJZCwgbW9kZWxSZWYpIHtcbiAgICAgICAgICB2YXIgbWV0YWRhdGEgPSBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCBtb2RlbElkKTtcblxuICAgICAgICAgIG1ldGFkYXRhLnJlZnMucHVzaChtb2RlbFJlZik7XG4gICAgICAgIH07XG4gICAgICAgIHZhciBhZGRTY29wZVJlZiA9IGZ1bmN0aW9uIGFkZFNjb3BlUmVmIChhdXRoSWQsIHNjb3BlSWQpIHtcbiAgICAgICAgICB2YXIgYXV0aDtcblxuICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChhcGlBdXRoRGVmc1thdXRoSWRdKSkge1xuICAgICAgICAgICAgLy8gTG9jYWwgYXV0aCBkZWZpbml0aW9uXG4gICAgICAgICAgICBhdXRoID0gYXBpQXV0aFJlZnNbYXV0aElkXTtcblxuICAgICAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQoYXV0aCkpIHtcbiAgICAgICAgICAgICAgYXV0aCA9IGFwaUF1dGhSZWZzW2F1dGhJZF0gPSBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gR2xvYmFsIChPciBtaXNzaW5nIGluIHdoaWNoIGNhc2Ugd2UnbGwgYXNzdW1lIGdsb2JhbClcbiAgICAgICAgICAgIGF1dGggPSBhdXRoUmVmc1thdXRoSWRdO1xuXG4gICAgICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChhdXRoKSkge1xuICAgICAgICAgICAgICBhdXRoID0gYXV0aFJlZnNbYXV0aElkXSA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChhdXRoLmluZGV4T2Yoc2NvcGVJZCkgPT09IC0xKSB7XG4gICAgICAgICAgICBhdXRoLnB1c2goc2NvcGVJZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIEJ1aWxkIHRoZSBhdXRob3JpemF0aW9uIG1vZGVsXG4gICAgICAgIF8uZWFjaChhcGlEZWNsYXJhdGlvbi5hdXRob3JpemF0aW9ucywgZnVuY3Rpb24gKGF1dGhvcml6YXRpb24sIG5hbWUpIHtcbiAgICAgICAgICBhcGlBdXRoRGVmc1tuYW1lXSA9IF8ubWFwKGF1dGhvcml6YXRpb24uc2NvcGVzLCBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgICAgIHJldHVybiBzY29wZS5zY29wZTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSwge30pO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXG4gICAgICAgIHZhbGlkYXRlTm9FeGlzdChwYXRoUmVmcywgYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJywgWydyZXNvdXJjZVBhdGgnXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5lcnJvcnMpO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgcmVzb3VyY2UgcGF0aCBkZWZpbml0aW9uXG4gICAgICAgIHZhbGlkYXRlRXhpc3QocGF0aERlZnMsIGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsIFsncmVzb3VyY2VQYXRoJ10sXG4gICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgLy8gS2VlcCB0cmFjayBvZiB0aGUgc2VlbiBwYXRoc1xuICAgICAgICBpZiAocGF0aFJlZnMuaW5kZXhPZihhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgpID09PSAtMSkge1xuICAgICAgICAgIHBhdGhSZWZzLnB1c2goYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFZhbGlkYXRlIGNvbnN1bWVzL3Byb2R1Y2VzIHVuaXF1ZW5lc3NcbiAgICAgICAgXy5lYWNoKFsnY29uc3VtZXMnLCAncHJvZHVjZXMnXSwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICB2YWxpZGF0ZU5vRHVwbGljYXRlcyhhcGlEZWNsYXJhdGlvbltuYW1lXSwgJ0FQSV8nICsgbmFtZS50b1VwcGVyQ2FzZSgpLCAnQVBJJywgW25hbWVdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC53YXJuaW5ncyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFZhbGRhdGUgQVBJc1xuICAgICAgICBfLnJlZHVjZShhcGlEZWNsYXJhdGlvbi5hcGlzLCBmdW5jdGlvbiAoc2VlbkFwaVBhdGhzLCBhcGksIGluZGV4KSB7XG4gICAgICAgICAgdmFyIGFQYXRoID0gWydhcGlzJywgaW5kZXgudG9TdHJpbmcoKV07XG4gICAgICAgICAgdmFyIG5QYXRoID0gbm9ybWFsaXplUGF0aChhcGkucGF0aCk7XG4gICAgICAgICAgdmFyIHNQYXJhbXMgPSBbXTtcblxuICAgICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXG4gICAgICAgICAgaWYgKHNlZW5BcGlQYXRocy5pbmRleE9mKG5QYXRoLnBhdGgpID4gLTEpIHtcbiAgICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdEVVBMSUNBVEVfQVBJX1BBVEgnLCAnQVBJIHBhdGggKG9yIGVxdWl2YWxlbnQpIGFscmVhZHkgZGVmaW5lZDogJyArIGFwaS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXBpLnBhdGgsIGFQYXRoLmNvbmNhdCgncGF0aCcpLCByZXN1bHQuZXJyb3JzKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBWYWxpZGF0ZSBvcGVyYXRpb25zXG4gICAgICAgICAgXy5yZWR1Y2UoYXBpLm9wZXJhdGlvbnMsIGZ1bmN0aW9uIChzZWVuTWV0aG9kcywgb3BlcmF0aW9uLCBpbmRleCkge1xuICAgICAgICAgICAgdmFyIG9QYXRoID0gYVBhdGguY29uY2F0KFsnb3BlcmF0aW9ucycsIGluZGV4LnRvU3RyaW5nKCldKTtcblxuICAgICAgICAgICAgLy8gVmFsaWRhdGUgY29uc3VtZXMvcHJvZHVjZXMgdW5pcXVlbmVzc1xuICAgICAgICAgICAgXy5lYWNoKFsnY29uc3VtZXMnLCAncHJvZHVjZXMnXSwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgICAgdmFsaWRhdGVOb0R1cGxpY2F0ZXMob3BlcmF0aW9uW25hbWVdLCAnT1BFUkFUSU9OXycgKyBuYW1lLnRvVXBwZXJDYXNlKCksICdPcGVyYXRpb24nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQobmFtZSksIHJlc3VsdC53YXJuaW5ncyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gVmFsaWRhdGUgdW5pcXVlIG1ldGhvZFxuICAgICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5NZXRob2RzLCBvcGVyYXRpb24ubWV0aG9kLCAnT1BFUkFUSU9OX01FVEhPRCcsICdPcGVyYXRpb24gbWV0aG9kJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQoJ21ldGhvZCcpLCByZXN1bHQuZXJyb3JzKTtcblxuICAgICAgICAgICAgLy8gVmFsaWRhdGUgYXV0aG9yaXphdGlvbnNcbiAgICAgICAgICAgIF8uZWFjaChvcGVyYXRpb24uYXV0aG9yaXphdGlvbnMsIGZ1bmN0aW9uIChzY29wZXMsIG5hbWUpIHtcbiAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgbWlzc2luZyBhdXRob3JpemF0aW9uXG4gICAgICAgICAgICAgIHZhbGlkYXRlRXhpc3QoXy51bmlxKE9iamVjdC5rZXlzKGFwaUF1dGhEZWZzKS5jb25jYXQoT2JqZWN0LmtleXMoYXV0aERlZnMpKSksIG5hbWUsICdBVVRIT1JJWkFUSU9OJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbicsIG9QYXRoLmNvbmNhdChbJ2F1dGhvcml6YXRpb25zJywgbmFtZV0pLCByZXN1bHQuZXJyb3JzKTtcblxuICAgICAgICAgICAgICAvLyBWYWxpZGF0ZSBtaXNzaW5nIGF1dGhvcml6YXRpb24gc2NvcGVzIChPbmx5IHdoZW4gdGhlIGF1dGhvcml6YXRpb24gaXMgbm90IG1pc3NpbmcpXG4gICAgICAgICAgICAgIF8uZWFjaChzY29wZXMsIGZ1bmN0aW9uIChzY29wZSwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQoYXBpQXV0aERlZnNbbmFtZV0pIHx8ICFfLmlzVW5kZWZpbmVkKGF1dGhEZWZzW25hbWVdKSkge1xuICAgICAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgbWlzc2luZyBhdXRob3JpemF0aW9uIHNjb3BlXG4gICAgICAgICAgICAgICAgICB2YWxpZGF0ZUV4aXN0KF8udW5pcSgoYXBpQXV0aERlZnNbbmFtZV0gfHwgW10pLmNvbmNhdChhdXRoRGVmc1tuYW1lXSB8fCBbXSkpLCBzY29wZS5zY29wZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0FVVEhPUklaQVRJT05fU0NPUEUnLCAnQXV0aG9yaXphdGlvbiBzY29wZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9QYXRoLmNvbmNhdChbJ2F1dGhvcml6YXRpb25zJywgbmFtZSwgaW5kZXgudG9TdHJpbmcoKSwgJ3Njb3BlJ10pLCByZXN1bHQuZXJyb3JzKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBhZGRTY29wZVJlZihuYW1lLCBzY29wZS5zY29wZSk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlcnNcbiAgICAgICAgICAgIF8ucmVkdWNlKG9wZXJhdGlvbi5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlciwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgLy8gQWRkIG1vZGVsIHJlZmVyZW5jZXMgZnJvbSBwYXJhbWV0ZXIgdHlwZS9pdGVtc1xuICAgICAgICAgICAgICBpZiAoc3BlYy5wcmltaXRpdmVzLmluZGV4T2YocGFyYW1ldGVyLnR5cGUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIGFkZE1vZGVsUmVmKHBhcmFtZXRlci50eXBlLCBvUGF0aC5jb25jYXQoWydwYXJhbWV0ZXJzJywgaW5kZXgudG9TdHJpbmcoKSwgJ3R5cGUnXSkpO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBhcmFtZXRlci50eXBlID09PSAnYXJyYXknICYmIHBhcmFtZXRlci5pdGVtcy4kcmVmKSB7XG4gICAgICAgICAgICAgICAgYWRkTW9kZWxSZWYocGFyYW1ldGVyLml0ZW1zLiRyZWYsIG9QYXRoLmNvbmNhdChbJ3BhcmFtZXRlcnMnLCBpbmRleC50b1N0cmluZygpLCAnaXRlbXMnLCAnJHJlZiddKSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcGFyYW1ldGVyIG5hbWVcbiAgICAgICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5QYXJhbWV0ZXJzLCBwYXJhbWV0ZXIubmFtZSwgJ09QRVJBVElPTl9QQVJBTUVURVInLCAnT3BlcmF0aW9uIHBhcmFtZXRlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQoJ3BhcmFtZXRlcnMnLCBpbmRleC50b1N0cmluZygpLCAnbmFtZScpLCByZXN1bHQuZXJyb3JzKTtcblxuICAgICAgICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIHBhdGggcGFyYW1ldGVyc1xuICAgICAgICAgICAgICBpZiAocGFyYW1ldGVyLnBhcmFtVHlwZSA9PT0gJ3BhdGgnKSB7XG4gICAgICAgICAgICAgICAgaWYgKG5QYXRoLmFyZ3MuaW5kZXhPZihwYXJhbWV0ZXIubmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFX0FQSV9QQVRIX1BBUkFNRVRFUicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQVBJIHBhdGggcGFyYW1ldGVyIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHBhcmFtZXRlci5uYW1lLCBwYXJhbWV0ZXIubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9QYXRoLmNvbmNhdCgncGFyYW1ldGVycycsIGluZGV4LnRvU3RyaW5nKCksICduYW1lJyksIHJlc3VsdC5lcnJvcnMpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzUGFyYW1zLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgc1BhcmFtcy5wdXNoKHBhcmFtZXRlci5uYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQocGFyYW1ldGVyLmRlZmF1bHRWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAvLyBWYWxpZGF0ZSBkZWZhdWx0IHZhbHVlIGFnYWluc3QgY29uc3RyYWludHNcbiAgICAgICAgICAgICAgICB2YWxpZGF0ZVBhcmFtZXRlckNvbnN0cmFpbnRzKHNwZWMsIHBhcmFtZXRlciwgcGFyYW1ldGVyLmRlZmF1bHRWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9QYXRoLmNvbmNhdCgncGFyYW1ldGVycycsIGluZGV4LnRvU3RyaW5nKCksICdkZWZhdWx0VmFsdWUnKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5lcnJvcnMpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgcmV0dXJuIHNlZW5QYXJhbWV0ZXJzLmNvbmNhdChwYXJhbWV0ZXIubmFtZSk7XG4gICAgICAgICAgICB9LCBbXSk7XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgcGF0aCBwYXJhbWV0ZXJzIChpbiBwYXRoIGJ1dCBub3QgaW4gb3BlcmF0aW9uLnBhcmFtZXRlcnMpXG4gICAgICAgICAgICBfLmVhY2goXy5kaWZmZXJlbmNlKG5QYXRoLmFyZ3MsIHNQYXJhbXMpLCBmdW5jdGlvbiAodW51c2VkKSB7XG4gICAgICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNSVNTSU5HX0FQSV9QQVRIX1BBUkFNRVRFUicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgcmVxdWlyZXMgcGF0aCBwYXJhbWV0ZXIgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgdW51c2VkLCBhcGkucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYVBhdGguY29uY2F0KCdwYXRoJyksIHJlc3VsdC5lcnJvcnMpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIHVuaXF1ZSByZXNwb25zZSBjb2RlXG4gICAgICAgICAgICBfLnJlZHVjZShvcGVyYXRpb24ucmVzcG9uc2VNZXNzYWdlcywgZnVuY3Rpb24gKHNlZW5SZXNwb25zZUNvZGVzLCByZXNwb25zZU1lc3NhZ2UsIGluZGV4KSB7XG4gICAgICAgICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUmVzcG9uc2VDb2RlcywgcmVzcG9uc2VNZXNzYWdlLmNvZGUsICdSRVNQT05TRV9NRVNTQUdFX0NPREUnLCAnUmVzcG9uc2UgbWVzc2FnZSBjb2RlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9QYXRoLmNvbmNhdChbJ3Jlc3BvbnNlTWVzc2FnZXMnLCBpbmRleC50b1N0cmluZygpLCAnY29kZSddKSwgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgICAgICAgLy8gQWRkIG1vZGVsIHJlZmVyZW5jZXMgZnJvbSByZXNwb25zZU1lc3NhZ2VzIHJlc3BvbnNlTW9kZWxcbiAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlTWVzc2FnZS5yZXNwb25zZU1vZGVsKSB7XG4gICAgICAgICAgICAgICAgYWRkTW9kZWxSZWYocmVzcG9uc2VNZXNzYWdlLnJlc3BvbnNlTW9kZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb1BhdGguY29uY2F0KFsncmVzcG9uc2VNZXNzYWdlcycsIGluZGV4LnRvU3RyaW5nKCksICdyZXNwb25zZU1vZGVsJ10pKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHJldHVybiBzZWVuUmVzcG9uc2VDb2Rlcy5jb25jYXQocmVzcG9uc2VNZXNzYWdlLmNvZGUpO1xuICAgICAgICAgICAgfSwgW10pO1xuXG4gICAgICAgICAgICAvLyBBZGQgbW9kZWwgcmVmZXJlbmNlcyBmcm9tIHR5cGUvaXRlbXNcbiAgICAgICAgICAgIGlmIChvcGVyYXRpb24udHlwZSA9PT0gJ2FycmF5JyAmJiBvcGVyYXRpb24uaXRlbXMuJHJlZikge1xuICAgICAgICAgICAgICBhZGRNb2RlbFJlZihvcGVyYXRpb24uaXRlbXMuJHJlZiwgb1BhdGguY29uY2F0KFsnaXRlbXMnLCAnJHJlZiddKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHNwZWMucHJpbWl0aXZlcy5pbmRleE9mKG9wZXJhdGlvbi50eXBlKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgYWRkTW9kZWxSZWYob3BlcmF0aW9uLnR5cGUsIG9QYXRoLmNvbmNhdChbJ3R5cGUnXSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gc2Vlbk1ldGhvZHMuY29uY2F0KG9wZXJhdGlvbi5tZXRob2QpO1xuICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgIHJldHVybiBzZWVuQXBpUGF0aHMuY29uY2F0KG5QYXRoLnBhdGgpO1xuICAgICAgICB9LCBbXSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgbW9kZWxzXG4gICAgICAgIF8uZWFjaChtb2RlbHNNZXRhZGF0YSwgZnVuY3Rpb24gKG1ldGFkYXRhLCBtb2RlbElkKSB7XG4gICAgICAgICAgLy8gSWRlbnRpZnkgbWlzc2luZyBtb2RlbHMgKHJlZmVyZW5jZWQgYnV0IG5vdCBkZWNsYXJlZClcbiAgICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChtZXRhZGF0YS5zY2hlbWEpKSB7XG4gICAgICAgICAgICBfLmVhY2gobWV0YWRhdGEucmVmcywgZnVuY3Rpb24gKHJlZikge1xuICAgICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFX01PREVMJywgJ01vZGVsIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIG1vZGVsSWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsSWQsIHJlZiwgcmVzdWx0LmVycm9ycyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBJZGVudGlmeSB1bnVzZWQgbW9kZWxzIChkZWNsYXJlZCBidXQgbm90IHJlZmVyZW5jZWQpXG4gICAgICAgICAgaWYgKG1ldGFkYXRhLnJlZnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhtZXRhZGF0YS5zY2hlbWEsIG1vZGVsSWQsICdNT0RFTCcsICdNb2RlbCcsIFsnbW9kZWxzJywgbWV0YWRhdGEubmFtZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQud2FybmluZ3MpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdW51c2VkIGF1dGhvcml6YXRpb25zXG4gICAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoT2JqZWN0LmtleXMoYXBpQXV0aERlZnMpLCBPYmplY3Qua2V5cyhhcGlBdXRoUmVmcykpLCBmdW5jdGlvbiAodW51c2VkKSB7XG4gICAgICAgICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcoYXBpRGVjbGFyYXRpb24uYXV0aG9yaXphdGlvbnNbdW51c2VkXSwgdW51c2VkLCAnQVVUSE9SSVpBVElPTicsICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ2F1dGhvcml6YXRpb25zJywgdW51c2VkXSwgcmVzdWx0Lndhcm5pbmdzKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdW51c2VkIGF1dGhvcml6YXRpb24gc2NvcGVzXG4gICAgICAgIF8uZWFjaChhcGlBdXRoRGVmcywgZnVuY3Rpb24gKHNjb3BlcywgbmFtZSkge1xuICAgICAgICAgIHZhciBwYXRoID0gWydhdXRob3JpemF0aW9ucycsIG5hbWVdO1xuICAgICAgICAgIHZhciBhdXRoRGVmID0gYXBpRGVjbGFyYXRpb24uYXV0aG9yaXphdGlvbnNbbmFtZV07XG5cbiAgICAgICAgICBfLmVhY2goXy5kaWZmZXJlbmNlKHNjb3BlcywgYXBpQXV0aFJlZnNbbmFtZV0gfHwgW10pLCBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBzSW5kZXggPSBzY29wZXMuaW5kZXhPZihzY29wZSk7XG5cbiAgICAgICAgICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKGF1dGhEZWYuc2NvcGVzW3NJbmRleF0sIHNjb3BlLCAnQVVUSE9SSVpBVElPTl9TQ09QRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbiBzY29wZScsIHBhdGguY29uY2F0KFsnc2NvcGVzJywgc0luZGV4LnRvU3RyaW5nKCldKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC53YXJuaW5ncyk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHVudXNlZCByZXNvdXJjZXNcbiAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UocGF0aERlZnMsIHBhdGhSZWZzKSwgZnVuY3Rpb24gKHVudXNlZCkge1xuICAgICAgICB2YXIgaW5kZXggPSBfLm1hcChybE9yU08uYXBpcywgZnVuY3Rpb24gKGFwaSkgeyByZXR1cm4gYXBpLnBhdGg7IH0pLmluZGV4T2YodW51c2VkKTtcblxuICAgICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhybE9yU08uYXBpc1tpbmRleF0ucGF0aCwgdW51c2VkLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydhcGlzJywgaW5kZXgudG9TdHJpbmcoKSwgJ3BhdGgnXSwgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWYWxpZGF0ZSB1bnVzZWQgYXV0aG9yaXphdGlvbnNcbiAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoT2JqZWN0LmtleXMoYXV0aERlZnMpLCBPYmplY3Qua2V5cyhhdXRoUmVmcykpLCBmdW5jdGlvbiAodW51c2VkKSB7XG4gICAgICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKHJsT3JTTy5hdXRob3JpemF0aW9uc1t1bnVzZWRdLCB1bnVzZWQsICdBVVRIT1JJWkFUSU9OJywgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ2F1dGhvcml6YXRpb25zJywgdW51c2VkXSwgcmVzcG9uc2Uud2FybmluZ3MpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHVudXNlZCBhdXRob3JpemF0aW9uIHNjb3Blc1xuICAgICAgXy5lYWNoKGF1dGhSZWZzLCBmdW5jdGlvbiAoc2NvcGVzLCBuYW1lKSB7XG4gICAgICAgIHZhciBwYXRoID0gWydhdXRob3JpemF0aW9ucycsIG5hbWVdO1xuXG4gICAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2Uoc2NvcGVzLCBhdXRoUmVmc1tuYW1lXSksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgICAgICB2YXIgaW5kZXggPSBzY29wZXMuaW5kZXhPZih1bnVzZWQpO1xuXG4gICAgICAgICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcocmxPclNPLmF1dGhvcml6YXRpb25zW25hbWVdLnNjb3Blc1tpbmRleF0sIHVudXNlZCwgJ0FVVEhPUklaQVRJT05fU0NPUEUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uIHNjb3BlJywgcGF0aC5jb25jYXQoWydzY29wZXMnLCBpbmRleC50b1N0cmluZygpXSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2Uud2FybmluZ3MpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgKGZvciBub3cpIHVuaXF1ZSBjb25zdW1lcy9wcm9kdWNlcy9zY2hlbWVzXG4gICAgXy5lYWNoKFsnY29uc3VtZXMnLCAncHJvZHVjZXMnLCAnc2NoZW1lcyddLCBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFsaWRhdGVOb0R1cGxpY2F0ZXMocmxPclNPW25hbWVdLCAnQVBJXycgKyBuYW1lLnRvVXBwZXJDYXNlKCksICdBUEknLCBbbmFtZV0sIHJlc3BvbnNlLndhcm5pbmdzKTtcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5lcnJvcnMubGVuZ3RoID09PSAwICYmIHJlc3BvbnNlLndhcm5pbmdzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdmFyIG1vZGVsc01ldGFkYXRhID0gZ2V0TW9kZWxzTWV0YWRhdGEoc3BlYywgcmxPclNPLCByZXNwb25zZSkubWV0YWRhdGE7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHRoZSBQYXRoc1xuICAgICAgXy5yZWR1Y2UocmxPclNPLnBhdGhzLCBmdW5jdGlvbiAoc2VlblBhdGhzLCBwYXRoLCBuYW1lKSB7XG4gICAgICAgIHZhciBhUGF0aCA9IFsncGF0aHMnLCBuYW1lXTtcbiAgICAgICAgdmFyIG5QYXRoID0gbm9ybWFsaXplUGF0aChuYW1lKTtcbiAgICAgICAgdmFyIHNQYXJhbXMgPSBbXTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aFxuICAgICAgICBpZiAoc2VlblBhdGhzLmluZGV4T2YoblBhdGgucGF0aCkgPiAtMSkge1xuICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdEVVBMSUNBVEVfQVBJX1BBVEgnLCAnQVBJIHBhdGggKG9yIGVxdWl2YWxlbnQpIGFscmVhZHkgZGVmaW5lZDogJyArIG5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSwgYVBhdGgsIHJlc3BvbnNlLmVycm9ycyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBWYWxpZGF0ZSB0aGUgT3BlcmF0aW9uc1xuICAgICAgICBfLmVhY2gocGF0aCwgZnVuY3Rpb24gKG9wZXJhdGlvbiwgbWV0aG9kKSB7XG4gICAgICAgICAgdmFyIG9QYXRoID0gYVBhdGguY29uY2F0KG1ldGhvZCk7XG5cbiAgICAgICAgICBpZiAobWV0aG9kID09PSAncGFyYW1ldGVycycpIHtcbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlciBjb25zdHJhaW50c1xuICAgICAgICAgICAgXy5yZWR1Y2UocGF0aC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlciwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgdmFyIHBQYXRoID0gb1BhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCkpO1xuXG4gICAgICAgICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSBwYXJhbWV0ZXIgbmFtZVxuICAgICAgICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlci5uYW1lLCAnQVBJX1BBUkFNRVRFUicsICdBUEkgcGFyYW1ldGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnbmFtZScpLCByZXNwb25zZS5lcnJvcnMpO1xuXG4gICAgICAgICAgICAgIC8vIEtlZXAgdHJhY2sgb2YgcGF0aCBwYXJhbWV0ZXJzXG4gICAgICAgICAgICAgIGlmIChwYXJhbWV0ZXIuaW4gPT09ICdwYXRoJykge1xuICAgICAgICAgICAgICAgIGlmIChuUGF0aC5hcmdzLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV9BUElfUEFUSF9QQVJBTUVURVInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0FQSSBwYXRoIHBhcmFtZXRlciBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBwYXJhbWV0ZXIubmFtZSwgcGFyYW1ldGVyLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ25hbWUnKSwgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc1BhcmFtcy5pbmRleE9mKHBhcmFtZXRlci5uYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgIHNQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgLy8gRmluZCBtb2RlbHMgZGVmaW5lZC9yZWZlcmVuY2VkIGluICMvcGF0aHMve3BhdGh9L3BhcmFtZXRlcnNcbiAgICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHBhcmFtZXRlci5zY2hlbWEpKSB7XG4gICAgICAgICAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBwYXJhbWV0ZXIuc2NoZW1hLCB0b0pzb25Qb2ludGVyKHBQYXRoLmNvbmNhdCgnc2NoZW1hJykpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ3NjaGVtYScpLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gc2VlblBhcmFtZXRlcnMuY29uY2F0KHBhcmFtZXRlci5uYW1lKTtcbiAgICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFZhbGlkYXRlIChmb3Igbm93KSBjb25zdW1lcy9wcm9kdWNlcy9zY2hlbWVzIHVuaXF1ZW5lc3NcbiAgICAgICAgICBfLmVhY2goWydjb25zdW1lcycsICdwcm9kdWNlcycsICdzY2hlbWVzJ10sIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgICAgICB2YWxpZGF0ZU5vRHVwbGljYXRlcyhvcGVyYXRpb25bbmFtZV0sICdPUEVSQVRJT05fJyArIG5hbWUudG9VcHBlckNhc2UoKSwgJ09wZXJhdGlvbicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQobmFtZSksIHJlc3BvbnNlLndhcm5pbmdzKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlciBjb25zdHJhaW50c1xuICAgICAgICAgIF8ucmVkdWNlKG9wZXJhdGlvbi5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlciwgaW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBwUGF0aCA9IG9QYXRoLmNvbmNhdCgncGFyYW1ldGVycycsIGluZGV4LnRvU3RyaW5nKCkpO1xuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcGFyYW1ldGVyIG5hbWVcbiAgICAgICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLm5hbWUsICdPUEVSQVRJT05fUEFSQU1FVEVSJywgJ09wZXJhdGlvbiBwYXJhbWV0ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnbmFtZScpLCByZXNwb25zZS5lcnJvcnMpO1xuXG4gICAgICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIHBhdGggcGFyYW1ldGVyc1xuICAgICAgICAgICAgaWYgKHBhcmFtZXRlci5pbiA9PT0gJ3BhdGgnKSB7XG4gICAgICAgICAgICAgIGlmIChuUGF0aC5hcmdzLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlJFU09MVkFCTEVfQVBJX1BBVEhfUEFSQU1FVEVSJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQVBJIHBhdGggcGFyYW1ldGVyIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHBhcmFtZXRlci5uYW1lLCBwYXJhbWV0ZXIubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ25hbWUnKSwgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmIChzUGFyYW1zLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHNQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmluZCBtb2RlbHMgZGVmaW5lZC9yZWZlcmVuY2VkIGluICMvcGF0aHMve3BhdGh9L3ttZXRob2R9L3BhcmFtZXRlcnNcbiAgICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIuc2NoZW1hKSkge1xuICAgICAgICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIHBhcmFtZXRlci5zY2hlbWEsIHRvSnNvblBvaW50ZXIocFBhdGguY29uY2F0KCdzY2hlbWEnKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ3NjaGVtYScpLCByZXNwb25zZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBzZWVuUGFyYW1ldGVycy5jb25jYXQocGFyYW1ldGVyLm5hbWUpO1xuICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgIC8vIEZpbmQgbW9kZWxzIGRlZmluZWQvcmVmZXJlbmNlZCBpbiAjL3BhdGhzL3twYXRofS97bWV0aG9kfS9yZXNwb25zZXNcbiAgICAgICAgICBfLmVhY2gob3BlcmF0aW9uLnJlc3BvbnNlcywgZnVuY3Rpb24gKHJlc3BvbnNlLCByZXNwb25zZUNvZGUpIHtcbiAgICAgICAgICAgIHZhciByUGF0aCA9IG9QYXRoLmNvbmNhdCgncmVzcG9uc2VzJywgcmVzcG9uc2VDb2RlKTtcblxuICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlc3BvbnNlLnNjaGVtYSkpIHtcbiAgICAgICAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCByZXNwb25zZS5zY2hlbWEsIHRvSnNvblBvaW50ZXIoclBhdGguY29uY2F0KCdzY2hlbWEnKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByUGF0aC5jb25jYXQoJ3NjaGVtYScpLCByZXNwb25zZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgcGF0aCBwYXJhbWV0ZXJzIChpbiBwYXRoIGJ1dCBub3QgaW4gb3BlcmF0aW9uLnBhcmFtZXRlcnMpXG4gICAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoblBhdGguYXJncywgc1BhcmFtcyksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUlTU0lOR19BUElfUEFUSF9QQVJBTUVURVInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgcmVxdWlyZXMgcGF0aCBwYXJhbWV0ZXIgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgdW51c2VkLCBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFQYXRoLCByZXNwb25zZS5lcnJvcnMpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gc2VlblBhdGhzLmNvbmNhdChuUGF0aC5wYXRoKTtcbiAgICAgIH0sIFtdKTtcblxuICAgICAgLy8gVmFsaWRhdGUgbW9kZWxzXG4gICAgICBfLmVhY2gobW9kZWxzTWV0YWRhdGEsIGZ1bmN0aW9uIChtZXRhZGF0YSwgbW9kZWxJZCkge1xuICAgICAgICAvLyBJZGVudGlmeSBtaXNzaW5nIG1vZGVscyAocmVmZXJlbmNlZCBidXQgbm90IGRlY2xhcmVkKVxuICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChtZXRhZGF0YS5zY2hlbWEpKSB7XG4gICAgICAgICAgXy5lYWNoKG1ldGFkYXRhLnJlZnMsIGZ1bmN0aW9uIChyZWYpIHtcbiAgICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlJFU09MVkFCTEVfTU9ERUwnLCAnTW9kZWwgY291bGQgbm90IGJlIHJlc29sdmVkOiAnICsgbW9kZWxJZCwgbW9kZWxJZCwgcmVmLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElkZW50aWZ5IHVudXNlZCBtb2RlbHMgKGRlY2xhcmVkIGJ1dCBub3QgcmVmZXJlbmNlZClcbiAgICAgICAgaWYgKG1ldGFkYXRhLnJlZnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcobWV0YWRhdGEuc2NoZW1hLCBtb2RlbElkLCAnTU9ERUwnLCAnTW9kZWwnLCBtb2RlbElkLnN1YnN0cmluZygyKS5zcGxpdCgnLycpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlLndhcm5pbmdzKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG4gIH1cblxuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIHJlc3VsdCBvZiB0aGUgdmFsaWRhdGlvbiBvZiB0aGUgU3dhZ2dlciBkb2N1bWVudChzKS5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gcmxPclNPIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgTGlzdGluZyAoMS4yKSBvciBTd2FnZ2VyIE9iamVjdCAoMi4wKVxuICogQHBhcmFtIHtvYmplY3RbXX0gW2FwaURlY2xhcmF0aW9uc10gLSBUaGUgYXJyYXkgb2YgU3dhZ2dlciBBUEkgRGVjbGFyYXRpb25zICgxLjIpXG4gKlxuICogQHJldHVybnMgdW5kZWZpbmVkIGlmIHZhbGlkYXRpb24gcGFzc2VzIG9yIGFuIG9iamVjdCBjb250YWluaW5nIGVycm9ycyBhbmQvb3Igd2FybmluZ3NcbiAqL1xuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUudmFsaWRhdGUgPSBmdW5jdGlvbiB2YWxpZGF0ZSAocmxPclNPLCBhcGlEZWNsYXJhdGlvbnMpIHtcbiAgdmFyIHJlc3BvbnNlID0ge1xuICAgIGVycm9yczogW10sXG4gICAgd2FybmluZ3M6IFtdXG4gIH07XG4gIHZhciBza2lwUmVtYWluaW5nID0gZmFsc2U7XG5cbiAgc3dpdGNoICh0aGlzLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXNvdXJjZUxpc3RpbmcgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNBcnJheShhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdhcGlEZWNsYXJhdGlvbnMgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIHN0cnVjdHVyYWxseVxuICAgIHJlc3BvbnNlID0gdmFsaWRhdGVXaXRoU2NoZW1hKHRoaXMsICdyZXNvdXJjZUxpc3RpbmcuanNvbicsIHJsT3JTTyk7XG5cbiAgICBpZiAocmVzcG9uc2UuZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICAgIHNraXBSZW1haW5pbmcgPSB0cnVlO1xuICAgIH1cblxuICAgIGlmICghc2tpcFJlbWFpbmluZykge1xuICAgICAgcmVzcG9uc2UuYXBpRGVjbGFyYXRpb25zID0gW107XG5cbiAgICAgIF8uZWFjaChhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChhcGlEZWNsYXJhdGlvbiwgaW5kZXgpIHtcbiAgICAgICAgcmVzcG9uc2UuYXBpRGVjbGFyYXRpb25zW2luZGV4XSA9IHZhbGlkYXRlV2l0aFNjaGVtYSh0aGlzLCAnYXBpRGVjbGFyYXRpb24uanNvbicsIGFwaURlY2xhcmF0aW9uKTtcblxuICAgICAgICBpZiAocmVzcG9uc2UuYXBpRGVjbGFyYXRpb25zW2luZGV4XS5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHNraXBSZW1haW5pbmcgPSB0cnVlO1xuXG4gICAgICAgICAgLy8gU2tpcCB0aGUgcmVtYWluaW5nIHZhbGlkYXRpb25cbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgc2VtYW50aWNhbGx5XG4gICAgaWYgKCFza2lwUmVtYWluaW5nKSB7XG4gICAgICByZXNwb25zZSA9IHZhbGlkYXRlQ29udGVudCh0aGlzLCBybE9yU08sIGFwaURlY2xhcmF0aW9ucyk7XG4gICAgfVxuXG4gICAgLy8gU2V0IHRoZSByZXNwb25zZVxuICAgIHJlc3BvbnNlID0gcmVzcG9uc2UuZXJyb3JzLmxlbmd0aCA+IDAgfHwgcmVzcG9uc2Uud2FybmluZ3MubGVuZ3RoID4gMCB8fFxuICAgICAgXy5yZWR1Y2UocmVzcG9uc2UuYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoY291bnQsIGFwaURlY2xhcmF0aW9uKSB7XG4gICAgICAgIHJldHVybiBjb3VudCArXG4gICAgICAgICAgKF8uaXNBcnJheShhcGlEZWNsYXJhdGlvbi5lcnJvcnMpID8gYXBpRGVjbGFyYXRpb24uZXJyb3JzLmxlbmd0aCA6IDApICtcbiAgICAgICAgICAoXy5pc0FycmF5KGFwaURlY2xhcmF0aW9uLndhcm5pbmdzKSA/IGFwaURlY2xhcmF0aW9uLndhcm5pbmdzLmxlbmd0aCA6IDApO1xuICAgICAgfSwgMCkgPiAwID8gcmVzcG9uc2UgOiB1bmRlZmluZWQ7XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3dhZ2dlck9iamVjdCBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzd2FnZ2VyT2JqZWN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgc3RydWN0dXJhbGx5XG4gICAgcmVzcG9uc2UgPSB2YWxpZGF0ZVdpdGhTY2hlbWEodGhpcywgJ3NjaGVtYS5qc29uJywgcmxPclNPKTtcblxuICAgIGlmIChyZXNwb25zZS5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgc2tpcFJlbWFpbmluZyA9IHRydWU7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgc2VtYW50aWNhbGx5XG4gICAgaWYgKCFza2lwUmVtYWluaW5nKSB7XG4gICAgICByZXNwb25zZSA9IHZhbGlkYXRlQ29udGVudCh0aGlzLCBybE9yU08pO1xuICAgIH1cblxuICAgIC8vIFNldCB0aGUgcmVzcG9uc2VcbiAgICByZXNwb25zZSA9IHJlc3BvbnNlLmVycm9ycy5sZW5ndGggPiAwIHx8IHJlc3BvbnNlLndhcm5pbmdzLmxlbmd0aCA+IDAgPyByZXNwb25zZSA6IHVuZGVmaW5lZDtcblxuICAgIGJyZWFrO1xuICB9XG5cbiAgcmV0dXJuIHJlc3BvbnNlO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgSlNPTiBTY2hlbWEgcmVwcmVzZW50YXRpb24gb2YgYSBjb21wb3NlZCBtb2RlbCBiYXNlZCBvbiBpdHMgaWQuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IGFwaURPclNPIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgQVBJIERlY2xhcmF0aW9uICgxLjIpIG9yIHRoZSBTd2FnZ2VyIE9iamVjdCAoMi4wKVxuICogQHBhcmFtIHtzdHJpbmd9IG1vZGVsSWRPclBhdGggLSBUaGUgbW9kZWwgaWQgKDEuMiBvciAyLjApIG9yIHRoZSBwYXRoIHRvIHRoZSBtb2RlbCAoMi4wKVxuICpcbiAqIEByZXR1cm5zIHRoZSBvYmplY3QgcmVwcmVzZW50aW5nIGEgY29tcG9zZWQgb2JqZWN0XG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGVyZSBhcmUgdmFsaWRhdGlvbiBlcnJvcnMgd2hpbGUgY3JlYXRpbmdcbiAqL1xuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUuY29tcG9zZU1vZGVsID0gZnVuY3Rpb24gY29tcG9zZU1vZGVsIChhcGlET3JTTywgbW9kZWxJZE9yUGF0aCkge1xuICB2YXIgbWV0YWRhdGFFbnRyeTtcbiAgdmFyIG1vZGVsTWV0YWRhdGE7XG4gIHZhciBtb2RlbHNNZXRhZGF0YTtcbiAgdmFyIGVycjtcblxuICBzd2l0Y2ggKHRoaXMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdhcGlEZWNsYXJhdGlvbiBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9uIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxJZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N3YWdnZXJPYmplY3QgaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzd2FnZ2VyT2JqZWN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxJZE9yUGF0aCBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuICB9XG5cbiAgbWV0YWRhdGFFbnRyeSA9IGdldE1vZGVsc01ldGFkYXRhKHRoaXMsIGFwaURPclNPKTtcbiAgbW9kZWxzTWV0YWRhdGEgPSBtZXRhZGF0YUVudHJ5Lm1ldGFkYXRhO1xuXG4gIC8vIENvbXBvc2luZyBhIG1vZGVsIGZvciBhbiBpbnZhbGlkIG1vZGVsIGhpZXJhcmNoeSBpcyBicml0dGxlIGFuZCBzbyB3ZSB3aWxsIG5vdCBkbyBpdFxuICBpZiAobWV0YWRhdGFFbnRyeS5yZXN1bHRzLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgZXJyID0gbmV3IEVycm9yKCdUaGUgbW9kZWxzIGFyZSBpbnZhbGlkIGFuZCBtb2RlbCBjb21wb3NpdGlvbiBpcyBub3QgcG9zc2libGUnKTtcblxuICAgIGVyci5lcnJvcnMgPSBtZXRhZGF0YUVudHJ5LnJlc3VsdHMuZXJyb3JzO1xuICAgIGVyci53YXJuaW5ncyA9IG1ldGFkYXRhRW50cnkucmVzdWx0cy53YXJuaW5ncztcblxuICAgIHRocm93IGVycjtcbiAgfVxuXG4gIG1vZGVsTWV0YWRhdGEgPSBtb2RlbHNNZXRhZGF0YVt0aGlzLnZlcnNpb24gPT09ICcxLjInID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxJZE9yUGF0aCA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZlRvSnNvblBvaW50ZXIobW9kZWxJZE9yUGF0aCldO1xuXG4gIHJldHVybiBfLmlzVW5kZWZpbmVkKG1vZGVsTWV0YWRhdGEpID8gdW5kZWZpbmVkIDogbW9kZWxNZXRhZGF0YS5jb21wb3NlZDtcbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIGEgbW9kZWwgYmFzZWQgb24gaXRzIGlkLlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBhcGlET3JTTyAtIFRoZSBTd2FnZ2VyIFJlc291cmNlIEFQSSBEZWNsYXJhdGlvbiAoMS4yKSBvciB0aGUgU3dhZ2dlciBPYmplY3QgKDIuMClcbiAqIEBwYXJhbSB7c3RyaW5nfSBtb2RlbElkT3JQYXRoIC0gVGhlIG1vZGVsIGlkICgxLjIgb3IgMi4wKSBvciB0aGUgcGF0aCB0byB0aGUgbW9kZWwgKDIuMClcbiAqIEBwYXJhbSB7b2JqZWN0fSBkYXRhIC0gVGhlIG1vZGVsIHRvIHZhbGlkYXRlXG4gKlxuICogQHJldHVybnMgdW5kZWZpbmVkIGlmIHZhbGlkYXRpb24gcGFzc2VzIG9yIGFuIG9iamVjdCBjb250YWluaW5nIGVycm9ycyBhbmQvb3Igd2FybmluZ3NcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZXJlIGFyZSB2YWxpZGF0aW9uIGVycm9ycyB3aGlsZSBjcmVhdGluZ1xuICovXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS52YWxpZGF0ZU1vZGVsID0gZnVuY3Rpb24gdmFsaWRhdGVNb2RlbCAoYXBpRE9yU08sIG1vZGVsSWRPclBhdGgsIGRhdGEpIHtcbiAgdmFyIG1vZGVsU2NoZW1hID0gdGhpcy5jb21wb3NlTW9kZWwoYXBpRE9yU08sIG1vZGVsSWRPclBhdGgpO1xuICB2YXIgcmVzdWx0O1xuICB2YXIgdmFsaWRhdG9yO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKG1vZGVsU2NoZW1hKSkge1xuICAgIHRocm93IEVycm9yKCdVbmFibGUgdG8gY29tcG9zZSBtb2RlbCBzbyB2YWxpZGF0aW9uIGlzIG5vdCBwb3NzaWJsZScpO1xuICB9XG5cbiAgdmFsaWRhdG9yID0gamp2KGpqdk9wdGlvbnMpO1xuXG4gIC8vIERpc2FibGUgdGhlICd1cmknIGZvcm1hdCBjaGVja2VyIGFzIGl0J3MgZ290IGlzc3VlczogaHR0cHM6Ly9naXRodWIuY29tL2Fjb3JuZWpvL2pqdi9pc3N1ZXMvMjRcbiAgdmFsaWRhdG9yLmFkZEZvcm1hdCgndXJpJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHZhbGlkYXRvci5hZGRTY2hlbWEoZHJhZnQwNFVybCwgZHJhZnQwNEpzb24pO1xuXG4gIHZhbGlkYXRvci5qZSA9IGpqdmUodmFsaWRhdG9yKTtcblxuICByZXN1bHQgPSB2YWxpZGF0b3IudmFsaWRhdGUobW9kZWxTY2hlbWEsIGRhdGEpO1xuXG4gIGlmIChyZXN1bHQpIHtcbiAgICByZXN1bHQgPSB7XG4gICAgICBlcnJvcnM6IHZhbGlkYXRvci5qZShtb2RlbFNjaGVtYSwgZGF0YSwgcmVzdWx0LCBqanZlT3B0aW9ucylcbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy52MSA9IG1vZHVsZS5leHBvcnRzLnYxXzIgPSBuZXcgU3BlY2lmaWNhdGlvbignMS4yJyk7IC8vIGpzaGludCBpZ25vcmU6bGluZVxubW9kdWxlLmV4cG9ydHMudjIgPSBtb2R1bGUuZXhwb3J0cy52Ml8wID0gbmV3IFNwZWNpZmljYXRpb24oJzIuMCcpOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbiIsIi8qXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgQXBpZ2VlIENvcnBvcmF0aW9uXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG4gKiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cbiAqIFRIRSBTT0ZUV0FSRS5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfID0ge1xuICBpc1VuZGVmaW5lZDogcmVxdWlyZSgnbG9kYXNoLmlzdW5kZWZpbmVkJylcbn07XG52YXIgc3BlY0NhY2hlID0ge307XG5cbi8qKlxuICogUmV0dXJucyB0aGUgcHJvcGVyIHNwZWNpZmljYXRpb24gYmFzZWQgb24gdGhlIGh1bWFuIHJlYWRhYmxlIHZlcnNpb24uXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHZlcnNpb24gLSBUaGUgaHVtYW4gcmVhZGFibGUgU3dhZ2dlciB2ZXJzaW9uIChFeDogMS4yKVxuICpcbiAqIEByZXR1cm5zIHRoZSBjb3JyZXNwb25kaW5nIFN3YWdnZXIgU3BlY2lmaWNhdGlvbiBvYmplY3Qgb3IgdW5kZWZpbmVkIGlmIHRoZXJlIGlzIG5vbmVcbiAqL1xubW9kdWxlLmV4cG9ydHMuZ2V0U3BlYyA9IGZ1bmN0aW9uIGdldFNwZWMgKHZlcnNpb24pIHtcbiAgdmFyIHNwZWMgPSBzcGVjQ2FjaGVbdmVyc2lvbl07XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoc3BlYykpIHtcbiAgICBzd2l0Y2ggKHZlcnNpb24pIHtcbiAgICBjYXNlICcxLjInOlxuICAgICAgc3BlYyA9IHJlcXVpcmUoJy4uL2xpYi9zcGVjcycpLnYxXzI7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuXG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJzIuMCc6XG4gICAgICBzcGVjID0gcmVxdWlyZSgnLi4vbGliL3NwZWNzJykudjJfMDsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG5cbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzcGVjO1xufTtcblxuLyoqXG4gKiBUYWtlcyBhIHJlZmVyZW5jZSBhbmQgY3JlYXRlcyBhIGZ1bGx5IHF1YWxpZmllZCBKU09OIHBvaW50ZXIgZnJvbSBpdC4gICgyLjAgb25seSlcbiAqXG4gKiBJZiB0aGUgcGFzc2VkIGluIHJlZmVyZW5jZSBpcyBmdWxseSBxdWFsaWZpZWQsIGl0IGlzIHJldHVybmVkIGFzLWlzLiAgT3RoZXJ3aXNlLCB0aGUgcmVmZXJlbmNlIHdpbGwgaGF2ZVxuICogJyMvZGVmaW5pdGlvbnMvJyBwcmVwZW5kZWQgdG8gaXQgdG8gbWFrZSBpdCBmdWxseSBxdWFsaWZpZWQgc2luY2UgdGhlc2UgJ3JlbGF0aXZlJyByZWZlcmVuY2VzIGFyZSBvbmx5IGFsbG93ZWQgZm9yXG4gKiBtb2RlbCBkZWZpbml0aW9ucy5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gcmVmIC0gVGhlIHJlbGF0aXZlIG9yIGZ1bGx5IHF1YWxpZmllZCByZWZlcmVuY2VcbiAqXG4gKiBAcmV0dXJucyB0aGUgY29ycmVzcG9uZGluZyBKU09OIHBvaW50ZXIgZm9yIHRoZSByZWZlcmVuY2VcbiAqL1xubW9kdWxlLmV4cG9ydHMucmVmVG9Kc29uUG9pbnRlciA9IGZ1bmN0aW9uIHJlZlRvSnNvblBvaW50ZXIgKHJlZikge1xuICBpZiAocmVmLmNoYXJBdCgwKSAhPT0gJyMnKSB7XG4gICAgcmVmID0gJyMvZGVmaW5pdGlvbnMvJyArIHJlZjtcbiAgfVxuXG4gIHJldHVybiByZWY7XG59O1xuXG4vKipcbiAqIFRha2VzIGFuIGFycmF5IG9mIHBhdGggc2VnbWVudHMgYW5kIGNyZWF0ZXMgYSBKU09OIHBvaW50ZXIgZnJvbSBpdC4gKDIuMCBvbmx5KVxuICpcbiAqIEBwYXJhbSB7c3RyaW5nW119IHBhdGggLSBUaGUgcGF0aCBzZWdtZW50c1xuICpcbiAqIEByZXR1cm5zIGEgSlNPTiBwb2ludGVyIGZvciB0aGUgcmVmZXJlbmNlIGRlbm90ZWQgYnkgdGhlIHBhdGggc2VnbWVudHNcbiAqL1xubW9kdWxlLmV4cG9ydHMudG9Kc29uUG9pbnRlciA9IGZ1bmN0aW9uIHRvSnNvblBvaW50ZXIgKHBhdGgpIHtcbiAgLy8gaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNjkwMSNzZWN0aW9uLTRcbiAgcmV0dXJuICcjLycgKyBwYXRoLm1hcChmdW5jdGlvbiAocGFydCkge1xuICAgIHJldHVybiBwYXJ0LnJlcGxhY2UoL1xcLy9nLCAnfjEnKTtcbiAgfSkuam9pbignLycpO1xufTtcbiIsIi8qXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgQXBpZ2VlIENvcnBvcmF0aW9uXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG4gKiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cbiAqIFRIRSBTT0ZUV0FSRS5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfID0ge1xuICBlYWNoOiByZXF1aXJlKCdsb2Rhc2guZm9yZWFjaCcpLFxuICBpc0FycmF5OiByZXF1aXJlKCdsb2Rhc2guaXNhcnJheScpLFxuICBpc0Jvb2xlYW46IHJlcXVpcmUoJ2xvZGFzaC5pc2Jvb2xlYW4nKSxcbiAgaXNOYU46IHJlcXVpcmUoJ2xvZGFzaC5pc25hbicpLFxuICBpc051bGw6IHJlcXVpcmUoJ2xvZGFzaC5pc251bGwnKSxcbiAgaXNTdHJpbmc6IHJlcXVpcmUoJ2xvZGFzaC5pc3N0cmluZycpLFxuICBpc1VuZGVmaW5lZDogcmVxdWlyZSgnbG9kYXNoLmlzdW5kZWZpbmVkJyksXG4gIHVuaW9uOiByZXF1aXJlKCdsb2Rhc2gudW5pb24nKSxcbiAgdW5pcTogcmVxdWlyZSgnbG9kYXNoLnVuaXEnKVxufTtcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG5cbi8vIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzMzMzkjc2VjdGlvbi01LjZcbnZhciBkYXRlUmVnRXhwID0gL14oWzAtOV17NH0pLShbMC05XXsyfSktKFswLTldezJ9KSQvO1xuLy8gaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzMzOSNzZWN0aW9uLTUuNlxudmFyIGRhdGVUaW1lUmVnRXhwID0gL14oWzAtOV17Mn0pOihbMC05XXsyfSk6KFswLTldezJ9KSguWzAtOV0rKT8oenwoWystXVswLTldezJ9OlswLTldezJ9KSkkLztcbnZhciB0aHJvd0ludmFsaWRQYXJhbWV0ZXIgPSBmdW5jdGlvbiB0aHJvd0ludmFsaWRQYXJhbWV0ZXIgKG5hbWUsIG1lc3NhZ2UpIHtcbiAgdmFyIGVyciA9IG5ldyBFcnJvcignUGFyYW1ldGVyICgnICsgbmFtZSArICcpICcgKyBtZXNzYWdlKTtcblxuICBlcnIuZmFpbGVkVmFsaWRhdGlvbiA9IHRydWU7XG5cbiAgdGhyb3cgZXJyO1xufTtcbnZhciBpc1ZhbGlkRGF0ZSA9IGZ1bmN0aW9uIGlzVmFsaWREYXRlIChkYXRlKSB7XG4gIHZhciBkYXk7XG4gIHZhciBtYXRjaGVzO1xuICB2YXIgbW9udGg7XG5cbiAgaWYgKCFfLmlzU3RyaW5nKGRhdGUpKSB7XG4gICAgZGF0ZSA9IGRhdGUudG9TdHJpbmcoKTtcbiAgfVxuXG4gIG1hdGNoZXMgPSBkYXRlUmVnRXhwLmV4ZWMoZGF0ZSk7XG5cbiAgaWYgKG1hdGNoZXMgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGRheSA9IG1hdGNoZXNbM107XG4gIG1vbnRoID0gbWF0Y2hlc1syXTtcblxuICBpZiAobW9udGggPCAnMDEnIHx8IG1vbnRoID4gJzEyJyB8fCBkYXkgPCAnMDEnIHx8IGRheSA+ICczMScpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG52YXIgaXNWYWxpZERhdGVUaW1lID0gZnVuY3Rpb24gaXNWYWxpZERhdGVUaW1lIChkYXRlVGltZSkge1xuICB2YXIgaG91cjtcbiAgdmFyIGRhdGU7XG4gIHZhciB0aW1lO1xuICB2YXIgbWF0Y2hlcztcbiAgdmFyIG1pbnV0ZTtcbiAgdmFyIHBhcnRzO1xuICB2YXIgc2Vjb25kO1xuXG4gIGlmICghXy5pc1N0cmluZyhkYXRlVGltZSkpIHtcbiAgICBkYXRlVGltZSA9IGRhdGVUaW1lLnRvU3RyaW5nKCk7XG4gIH1cblxuICBwYXJ0cyA9IGRhdGVUaW1lLnRvTG93ZXJDYXNlKCkuc3BsaXQoJ3QnKTtcbiAgZGF0ZSA9IHBhcnRzWzBdO1xuICB0aW1lID0gcGFydHMubGVuZ3RoID4gMSA/IHBhcnRzWzFdIDogdW5kZWZpbmVkO1xuXG4gIGlmICghaXNWYWxpZERhdGUoZGF0ZSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIG1hdGNoZXMgPSBkYXRlVGltZVJlZ0V4cC5leGVjKHRpbWUpO1xuXG4gIGlmIChtYXRjaGVzID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBob3VyID0gbWF0Y2hlc1sxXTtcbiAgbWludXRlID0gbWF0Y2hlc1syXTtcbiAgc2Vjb25kID0gbWF0Y2hlc1szXTtcblxuICBpZiAoaG91ciA+ICcyMycgfHwgbWludXRlID4gJzU5JyB8fCBzZWNvbmQgPiAnNTknKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCdzIGNvbnRlbnQgdHlwZSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nW119IGdDb25zdW1lcyAtIFRoZSB2YWxpZCBjb25zdW1lcyBhdCB0aGUgQVBJIHNjb3BlXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBvQ29uc3VtZXMgLSBUaGUgdmFsaWQgY29uc3VtZXMgYXQgdGhlIG9wZXJhdGlvbiBzY29wZVxuICogQHBhcmFtIHtvYmplY3R9IHJlcSAtIFRoZSByZXF1ZXN0XG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgY29udGVudCB0eXBlIGlzIGludmFsaWRcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVDb250ZW50VHlwZSA9IGZ1bmN0aW9uIHZhbGlkYXRlQ29udGVudFR5cGUgKGdDb25zdW1lcywgb0NvbnN1bWVzLCByZXEpIHtcbiAgLy8gaHR0cDovL3d3dy53My5vcmcvUHJvdG9jb2xzL3JmYzI2MTYvcmZjMjYxNi1zZWM3Lmh0bWwjc2VjNy4yLjFcbiAgdmFyIGNvbnRlbnRUeXBlID0gcmVxLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddIHx8ICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nO1xuICB2YXIgY29uc3VtZXMgPSBfLnVuaW9uKG9Db25zdW1lcywgZ0NvbnN1bWVzKTtcblxuICAvLyBHZXQgb25seSB0aGUgY29udGVudCB0eXBlXG4gIGNvbnRlbnRUeXBlID0gY29udGVudFR5cGUuc3BsaXQoJzsnKVswXTtcblxuICAvLyBWYWxpZGF0ZSBjb250ZW50IHR5cGUgKE9ubHkgZm9yIFBPU1QvUFVUIHBlciBIVFRQIHNwZWMpXG4gIGlmIChjb25zdW1lcy5sZW5ndGggPiAwICYmIFsnUE9TVCcsICdQVVQnXS5pbmRleE9mKHJlcS5tZXRob2QpICE9PSAtMSAmJiBjb25zdW1lcy5pbmRleE9mKGNvbnRlbnRUeXBlKSA9PT0gLTEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29udGVudCB0eXBlICgnICsgY29udGVudFR5cGUgKyAnKS4gIFRoZXNlIGFyZSB2YWxpZDogJyArIGNvbnN1bWVzLmpvaW4oJywgJykpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyB2YWx1ZSBhZ2FpbnN0IHRoZSBhbGxvd2FibGUgdmFsdWVzICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmdbXX0gYWxsb3dlZCAtIFRoZSBhbGxvd2FibGUgdmFsdWVzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbm90IGFsbG93YWJsZVxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUVudW0gPSBmdW5jdGlvbiB2YWxpZGF0ZUVudW0gKG5hbWUsIHZhbCwgYWxsb3dlZCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoYWxsb3dlZCkgJiYgIV8uaXNVbmRlZmluZWQodmFsKSAmJiBhbGxvd2VkLmluZGV4T2YodmFsKSA9PT0gLTEpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIG5vdCBhbiBhbGxvd2FibGUgdmFsdWUgKCcgKyBhbGxvd2VkLmpvaW4oJywgJykgKyAnKTogJyArIHZhbCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIHZhbHVlIGlzIGxlc3MgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSBtYXhpbXVtIC0gVGhlIG1heGltdW0gdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2V4Y2x1c2l2ZT1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0aGUgdmFsdWUgaW5jbHVkZXMgdGhlIG1heGltdW0gaW4gaXRzIGNvbXBhcmlzb25cbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBncmVhdGVyIHRoYW4gdGhlIG1heGltdW1cbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhpbXVtID0gZnVuY3Rpb24gdmFsaWRhdGVNYXhpbXVtIChuYW1lLCB2YWwsIG1heGltdW0sIHR5cGUsIGV4Y2x1c2l2ZSkge1xuICB2YXIgdGVzdE1heDtcbiAgdmFyIHRlc3RWYWw7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZXhjbHVzaXZlKSkge1xuICAgIGV4Y2x1c2l2ZSA9IGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGUgPT09ICdpbnRlZ2VyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUludCh2YWwsIDEwKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUZsb2F0KHZhbCk7XG4gIH1cblxuICBpZiAoIV8uaXNVbmRlZmluZWQobWF4aW11bSkpIHtcbiAgICB0ZXN0TWF4ID0gcGFyc2VGbG9hdChtYXhpbXVtKTtcblxuICAgIGlmIChleGNsdXNpdmUgJiYgdGVzdFZhbCA+PSB0ZXN0TWF4KSB7XG4gICAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byB0aGUgY29uZmlndXJlZCBtYXhpbXVtICgnICsgbWF4aW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9IGVsc2UgaWYgKHRlc3RWYWwgPiB0ZXN0TWF4KSB7XG4gICAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIGdyZWF0ZXIgdGhhbiB0aGUgY29uZmlndXJlZCBtYXhpbXVtICgnICsgbWF4aW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIGFycmF5IGNvdW50IGlzIGxlc3MgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1heEl0ZW1zIC0gVGhlIG1heGltdW0gbnVtYmVyIG9mIGl0ZW1zXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgY29udGFpbnMgbW9yZSBpdGVtcyB0aGFuIGFsbG93YWJsZVxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1heEl0ZW1zID0gZnVuY3Rpb24gdmFsaWRhdGVNYXhJdGVtcyAobmFtZSwgdmFsLCBtYXhJdGVtcykge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobWF4SXRlbXMpICYmIHZhbC5sZW5ndGggPiBtYXhJdGVtcykge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnY29udGFpbnMgbW9yZSBpdGVtcyB0aGFuIGFsbG93ZWQ6ICcgKyBtYXhJdGVtcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIGxlbmd0aCBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhMZW5ndGggLSBUaGUgbWF4aW11bSBsZW5ndGhcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSdzIGxlbmd0aCBpcyBncmVhdGVyIHRoYW4gdGhlIG1heGltdW1cbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhMZW5ndGggPSBmdW5jdGlvbiB2YWxpZGF0ZU1heExlbmd0aCAobmFtZSwgdmFsLCBtYXhMZW5ndGgpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heExlbmd0aCkgJiYgdmFsLmxlbmd0aCA+IG1heExlbmd0aCkge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnaXMgbG9uZ2VyIHRoYW4gYWxsb3dlZDogJyArIG1heExlbmd0aCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIGFycmF5IGNvdW50IGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWluaW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSBtaW5pbXVtIC0gVGhlIG1pbmltdW0gdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2V4Y2x1c2l2ZT1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0aGUgdmFsdWUgaW5jbHVkZXMgdGhlIG1pbmltdW0gaW4gaXRzIGNvbXBhcmlzb25cbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW1cbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5pbXVtID0gZnVuY3Rpb24gdmFsaWRhdGVNaW5pbXVtIChuYW1lLCB2YWwsIG1pbmltdW0sIHR5cGUsIGV4Y2x1c2l2ZSkge1xuICB2YXIgdGVzdE1pbjtcbiAgdmFyIHRlc3RWYWw7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZXhjbHVzaXZlKSkge1xuICAgIGV4Y2x1c2l2ZSA9IGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGUgPT09ICdpbnRlZ2VyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUludCh2YWwsIDEwKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUZsb2F0KHZhbCk7XG4gIH1cblxuICBpZiAoIV8uaXNVbmRlZmluZWQobWluaW11bSkpIHtcbiAgICB0ZXN0TWluID0gcGFyc2VGbG9hdChtaW5pbXVtKTtcblxuICAgIGlmIChleGNsdXNpdmUgJiYgdGVzdFZhbCA8PSB0ZXN0TWluKSB7XG4gICAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIGxlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgY29uZmlndXJlZCBtaW5pbXVtICgnICsgbWluaW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9IGVsc2UgaWYgKHRlc3RWYWwgPCB0ZXN0TWluKSB7XG4gICAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIGxlc3MgdGhhbiB0aGUgY29uZmlndXJlZCBtaW5pbXVtICgnICsgbWluaW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIHZhbHVlIGNvbnRhaW5zIGZld2VyIGl0ZW1zIHRoYW4gYWxsb3dlZCAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pbkl0ZW1zIC0gVGhlIG1pbmltdW0gbnVtYmVyIG9mIGl0ZW1zXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgY29udGFpbnMgZmV3ZXIgaXRlbXMgdGhhbiBhbGxvd2FibGVcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5JdGVtcyA9IGZ1bmN0aW9uIHZhbGlkYXRlTWluSXRlbXMgKG5hbWUsIHZhbCwgbWluSXRlbXMpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbkl0ZW1zKSAmJiB2YWwubGVuZ3RoIDwgbWluSXRlbXMpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2NvbnRhaW5zIGZld2VyIGl0ZW1zIHRoYW4gYWxsb3dlZDogJyArIG1pbkl0ZW1zKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyJ3MgbGVuZ3RoIGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWluaW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pbkxlbmd0aCAtIFRoZSBtaW5pbXVtIGxlbmd0aFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlJ3MgbGVuZ3RoIGlzIGxlc3MgdGhhbiB0aGUgbWluaW11bVxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbkxlbmd0aCA9IGZ1bmN0aW9uIHZhbGlkYXRlTWluTGVuZ3RoIChuYW1lLCB2YWwsIG1pbkxlbmd0aCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobWluTGVuZ3RoKSAmJiB2YWwubGVuZ3RoIDwgbWluTGVuZ3RoKSB7XG4gICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBzaG9ydGVyIHRoYW4gYWxsb3dlZDogJyArIG1pbkxlbmd0aCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWR0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyIGFnYWluc3QgaXRzIG1vZGVsIHNjaGVtYS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHtvYmplY3R9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uIC0gVGhlIFN3YWdnZXIgdmVyc2lvblxuICogQHBhcmFtIHtvYmplY3R9IGFwaURPclNPIC0gVGhlIFN3YWdnZXIgQVBJIERlY2xhcmF0aW9uICgxLjIpIG9yIFN3YWdnZXIgT2JqZWN0ICgyLjApXG4gKiBAcGFyYW0ge3N0cmluZ30gbW9kZWxJZE9yUGF0aCAtIFRoZSBtb2RlbCBpZCBvciBwYXRoXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbm90IGEgdmFsaWQgbW9kZWxcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNb2RlbCA9IGZ1bmN0aW9uIHZhbGlkYXRlTW9kZWwgKG5hbWUsIHZhbCwgdmVyc2lvbiwgYXBpRE9yU08sIG1vZGVsSWRPclBhdGgpIHtcbiAgdmFyIHNwZWMgPSBoZWxwZXJzLmdldFNwZWModmVyc2lvbik7XG4gIHZhciB2YWxpZGF0ZSA9IGZ1bmN0aW9uIHZhbGlkYXRlIChkYXRhKSB7XG4gICAgdmFyIHJlc3VsdCA9IHNwZWMudmFsaWRhdGVNb2RlbChhcGlET3JTTywgbW9kZWxJZE9yUGF0aCwgZGF0YSk7XG5cbiAgICBpZiAoIV8uaXNVbmRlZmluZWQocmVzdWx0KSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBub3QgYSB2YWxpZCAnICsgbW9kZWxJZE9yUGF0aCArICcgbW9kZWwnKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBlcnIuZXJyb3JzID0gcmVzdWx0LmVycm9ycztcblxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGlmIChfLmlzQXJyYXkodmFsKSkge1xuICAgIF8uZWFjaCh2YWwsIGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICB2YWxpZGF0ZShpdGVtKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICB2YWxpZGF0ZSh2YWwpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyBtYXRjaGVzIGEgcGF0dGVybiAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSBwYXR0ZXJuIC0gVGhlIHBhdHRlcm5cbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBkb2VzIG5vdCBtYXRjaCB0aGUgcGF0dGVyblxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVBhdHRlcm4gPSBmdW5jdGlvbiB2YWxpZGF0ZVBhdHRlcm4gKG5hbWUsIHZhbCwgcGF0dGVybikge1xuICBpZiAoIV8uaXNVbmRlZmluZWQocGF0dGVybikgJiYgXy5pc051bGwodmFsLm1hdGNoKG5ldyBSZWdFeHAocGF0dGVybikpKSkge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnZG9lcyBub3QgbWF0Y2ggcmVxdWlyZWQgcGF0dGVybjogJyArIHBhdHRlcm4pO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyByZXF1aXJlZG5lc3MgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IHJlcXVpcmVkIC0gV2hldGhlciBvciBub3QgdGhlIHBhcmFtZXRlciBpcyByZXF1aXJlZFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIHJlcXVpcmVkIGJ1dCBpcyBub3QgcHJlc2VudFxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVJlcXVpcmVkbmVzcyA9IGZ1bmN0aW9uIHZhbGlkYXRlUmVxdWlyZWRuZXNzIChuYW1lLCB2YWwsIHJlcXVpcmVkKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChyZXF1aXJlZCkgJiYgcmVxdWlyZWQgPT09IHRydWUgJiYgXy5pc1VuZGVmaW5lZCh2YWwpKSB7XG4gICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyByZXF1aXJlZCcpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyB0eXBlIGFuZCBmb3JtYXQgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gdHlwZSAtIFRoZSBwYXJhbWV0ZXIgdHlwZVxuICogQHBhcmFtIHtzdHJpbmd9IGZvcm1hdCAtIFRoZSBwYXJhbWV0ZXIgZm9ybWF0XG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtza2lwRXJyb3I9ZmFsc2VdIC0gV2hldGhlciBvciBub3QgdG8gc2tpcCB0aHJvd2luZyBhbiBlcnJvciAoVXNlZnVsIGZvciB2YWxpZGF0aW5nIGFycmF5cylcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBub3QgdGhlIHByb3BlciB0eXBlIG9yIGZvcm1hdFxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVR5cGVBbmRGb3JtYXQgPSBmdW5jdGlvbiB2YWxpZGF0ZVR5cGVBbmRGb3JtYXQgKG5hbWUsIHZhbCwgdHlwZSwgZm9ybWF0LCBza2lwRXJyb3IpIHtcbiAgdmFyIHJlc3VsdCA9IHRydWU7XG5cbiAgaWYgKF8uaXNBcnJheSh2YWwpKSB7XG4gICAgXy5lYWNoKHZhbCwgZnVuY3Rpb24gKGFWYWwsIGluZGV4KSB7XG4gICAgICBpZiAoIXZhbGlkYXRlVHlwZUFuZEZvcm1hdChuYW1lLCBhVmFsLCB0eXBlLCBmb3JtYXQsIHRydWUpKSB7XG4gICAgICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnYXQgaW5kZXggJyArIGluZGV4ICsgJyBpcyBub3QgYSB2YWxpZCAnICsgdHlwZSArICc6ICcgKyBhVmFsKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJlc3VsdCA9IF8uaXNCb29sZWFuKHZhbCkgfHwgWydmYWxzZScsICd0cnVlJ10uaW5kZXhPZih2YWwpICE9PSAtMTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2ludGVnZXInOlxuICAgICAgcmVzdWx0ID0gIV8uaXNOYU4ocGFyc2VJbnQodmFsLCAxMCkpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJlc3VsdCA9ICFfLmlzTmFOKHBhcnNlRmxvYXQodmFsKSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKGZvcm1hdCkpIHtcbiAgICAgICAgc3dpdGNoIChmb3JtYXQpIHtcbiAgICAgICAgY2FzZSAnZGF0ZSc6XG4gICAgICAgICAgcmVzdWx0ID0gaXNWYWxpZERhdGUodmFsKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnZGF0ZS10aW1lJzpcbiAgICAgICAgICByZXN1bHQgPSBpc1ZhbGlkRGF0ZVRpbWUodmFsKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgaWYgKHNraXBFcnJvcikge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH0gZWxzZSBpZiAoIXJlc3VsdCkge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnaXMgbm90IGEgdmFsaWQgJyArIChfLmlzVW5kZWZpbmVkKGZvcm1hdCkgPyAnJyA6IGZvcm1hdCArICcgJykgKyB0eXBlICsgJzogJyArIHZhbCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIHZhbHVlcyBhcmUgdW5pcXVlICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7c3RyaW5nW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNVbmlxdWUgLSBXaGV0aGVyIG9yIG5vdCB0aGUgcGFyYW1ldGVyIHZhbHVlcyBhcmUgdW5pcXVlXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaGFzIGR1cGxpY2F0ZXNcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVVbmlxdWVJdGVtcyA9IGZ1bmN0aW9uIHZhbGlkYXRlVW5pcXVlSXRlbXMgKG5hbWUsIHZhbCwgaXNVbmlxdWUpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGlzVW5pcXVlKSAmJiBfLnVuaXEodmFsKS5sZW5ndGggIT09IHZhbC5sZW5ndGgpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2RvZXMgbm90IGFsbG93IGR1cGxpY2F0ZSB2YWx1ZXM6ICcgKyB2YWwuam9pbignLCAnKSk7XG4gIH1cbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vbGliL2pqdi5qcycpO1xuIiwiLyoganNoaW50IHByb3RvOiB0cnVlICovXG5cbi8qKlxuICogamp2LmpzIC0tIEEgamF2YXNjcmlwdCBsaWJyYXJ5IHRvIHZhbGlkYXRlIGpzb24gaW5wdXQgdGhyb3VnaCBhIGpzb24tc2NoZW1hLlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMyBBbGV4IENvcm5lam8uXG4gKlxuICogUmVkaXN0cmlidXRhYmxlIHVuZGVyIGEgTUlULXN0eWxlIG9wZW4gc291cmNlIGxpY2Vuc2UuXG4gKi9cblxuKGZ1bmN0aW9uICgpIHtcbiAgdmFyIGNsb25lID0gZnVuY3Rpb24gKG9iaikge1xuICAgICAgLy8gSGFuZGxlIHRoZSAzIHNpbXBsZSB0eXBlcyAoc3RyaW5nLCBudW1iZXIsIGZ1bmN0aW9uKSwgYW5kIG51bGwgb3IgdW5kZWZpbmVkXG4gICAgICBpZiAob2JqID09PSBudWxsIHx8IHR5cGVvZiBvYmogIT09ICdvYmplY3QnKSByZXR1cm4gb2JqO1xuICAgICAgdmFyIGNvcHk7XG5cbiAgICAgIC8vIEhhbmRsZSBEYXRlXG4gICAgICBpZiAob2JqIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAgIGNvcHkgPSBuZXcgRGF0ZSgpO1xuICAgICAgICAgIGNvcHkuc2V0VGltZShvYmouZ2V0VGltZSgpKTtcbiAgICAgICAgICByZXR1cm4gY29weTtcbiAgICAgIH1cblxuICAgICAgLy8gaGFuZGxlIFJlZ0V4cFxuICAgICAgaWYgKG9iaiBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICBjb3B5ID0gbmV3IFJlZ0V4cChvYmopO1xuICAgICAgICByZXR1cm4gY29weTtcbiAgICAgIH1cblxuICAgICAgLy8gSGFuZGxlIEFycmF5XG4gICAgICBpZiAob2JqIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBjb3B5ID0gW107XG4gICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IG9iai5sZW5ndGg7IGkgPCBsZW47IGkrKylcbiAgICAgICAgICAgICAgY29weVtpXSA9IGNsb25lKG9ialtpXSk7XG4gICAgICAgICAgcmV0dXJuIGNvcHk7XG4gICAgICB9XG5cbiAgICAgIC8vIEhhbmRsZSBPYmplY3RcbiAgICAgIGlmIChvYmogaW5zdGFuY2VvZiBPYmplY3QpIHtcbiAgICAgICAgICBjb3B5ID0ge307XG4vLyAgICAgICAgICAgY29weSA9IE9iamVjdC5jcmVhdGUoT2JqZWN0LmdldFByb3RvdHlwZU9mKG9iaikpO1xuICAgICAgICAgIGZvciAodmFyIGF0dHIgaW4gb2JqKSB7XG4gICAgICAgICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoYXR0cikpXG4gICAgICAgICAgICAgICAgY29weVthdHRyXSA9IGNsb25lKG9ialthdHRyXSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBjb3B5O1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmFibGUgdG8gY2xvbmUgb2JqZWN0IVwiKTtcbiAgfTtcblxuICB2YXIgY2xvbmVfc3RhY2sgPSBmdW5jdGlvbiAoc3RhY2spIHtcbiAgICB2YXIgbmV3X3N0YWNrID0gWyBjbG9uZShzdGFja1swXSkgXSwga2V5ID0gbmV3X3N0YWNrWzBdLmtleSwgb2JqID0gbmV3X3N0YWNrWzBdLm9iamVjdDtcbiAgICBmb3IgKHZhciBpID0gMSwgbGVuID0gc3RhY2subGVuZ3RoOyBpPCBsZW47IGkrKykge1xuICAgICAgb2JqID0gb2JqW2tleV07XG4gICAgICBrZXkgPSBzdGFja1tpXS5rZXk7XG4gICAgICBuZXdfc3RhY2sucHVzaCh7IG9iamVjdDogb2JqLCBrZXk6IGtleSB9KTtcbiAgICB9XG4gICAgcmV0dXJuIG5ld19zdGFjaztcbiAgfTtcblxuICB2YXIgY29weV9zdGFjayA9IGZ1bmN0aW9uIChuZXdfc3RhY2ssIG9sZF9zdGFjaykge1xuICAgIHZhciBzdGFja19sYXN0ID0gbmV3X3N0YWNrLmxlbmd0aC0xLCBrZXkgPSBuZXdfc3RhY2tbc3RhY2tfbGFzdF0ua2V5O1xuICAgIG9sZF9zdGFja1tzdGFja19sYXN0XS5vYmplY3Rba2V5XSA9IG5ld19zdGFja1tzdGFja19sYXN0XS5vYmplY3Rba2V5XTtcbiAgfTtcblxuICB2YXIgaGFuZGxlZCA9IHtcbiAgICAndHlwZSc6IHRydWUsXG4gICAgJ25vdCc6IHRydWUsXG4gICAgJ2FueU9mJzogdHJ1ZSxcbiAgICAnYWxsT2YnOiB0cnVlLFxuICAgICdvbmVPZic6IHRydWUsXG4gICAgJyRyZWYnOiB0cnVlLFxuICAgICckc2NoZW1hJzogdHJ1ZSxcbiAgICAnaWQnOiB0cnVlLFxuICAgICdleGNsdXNpdmVNYXhpbXVtJzogdHJ1ZSxcbiAgICAnZXhjbHVzaXZlTWluaW51bSc6IHRydWUsXG4gICAgJ3Byb3BlcnRpZXMnOiB0cnVlLFxuICAgICdwYXR0ZXJuUHJvcGVydGllcyc6IHRydWUsXG4gICAgJ2FkZGl0aW9uYWxQcm9wZXJ0aWVzJzogdHJ1ZSxcbiAgICAnaXRlbXMnOiB0cnVlLFxuICAgICdhZGRpdGlvbmFsSXRlbXMnOiB0cnVlLFxuICAgICdyZXF1aXJlZCc6IHRydWUsXG4gICAgJ2RlZmF1bHQnOiB0cnVlLFxuICAgICd0aXRsZSc6IHRydWUsXG4gICAgJ2Rlc2NyaXB0aW9uJzogdHJ1ZSxcbiAgICAnZGVmaW5pdGlvbnMnOiB0cnVlLFxuICAgICdkZXBlbmRlbmNpZXMnOiB0cnVlXG4gIH07XG5cbiAgdmFyIGZpZWxkVHlwZSA9IHtcbiAgICAnbnVsbCc6IGZ1bmN0aW9uICh4KSB7XG4gICAgICByZXR1cm4geCA9PT0gbnVsbDtcbiAgICB9LFxuICAgICdzdHJpbmcnOiBmdW5jdGlvbiAoeCkge1xuICAgICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnc3RyaW5nJztcbiAgICB9LFxuICAgICdib29sZWFuJzogZnVuY3Rpb24gKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ2Jvb2xlYW4nO1xuICAgIH0sXG4gICAgJ251bWJlcic6IGZ1bmN0aW9uICh4KSB7XG4gICAgICAvLyBVc2UgeCA9PT0geCBpbnN0ZWFkIG9mICFpc05hTih4KSBmb3Igc3BlZWRcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ251bWJlcicgJiYgeCA9PT0geDtcbiAgICB9LFxuICAgICdpbnRlZ2VyJzogZnVuY3Rpb24gKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ251bWJlcicgJiYgeCUxID09PSAwO1xuICAgIH0sXG4gICAgJ29iamVjdCc6IGZ1bmN0aW9uICh4KSB7XG4gICAgICByZXR1cm4geCAmJiB0eXBlb2YgeCA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkoeCk7XG4gICAgfSxcbiAgICAnYXJyYXknOiBmdW5jdGlvbiAoeCkge1xuICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoeCk7XG4gICAgfSxcbiAgICAnZGF0ZSc6IGZ1bmN0aW9uICh4KSB7XG4gICAgICByZXR1cm4geCBpbnN0YW5jZW9mIERhdGU7XG4gICAgfVxuICB9O1xuXG4gIC8vIG1pc3Npbmc6IHVyaSwgZGF0ZS10aW1lLCBpcHY0LCBpcHY2XG4gIHZhciBmaWVsZEZvcm1hdCA9IHtcbiAgICAnYWxwaGEnOiBmdW5jdGlvbiAodikge1xuICAgICAgcmV0dXJuICgvXlthLXpBLVpdKyQvKS50ZXN0KHYpO1xuICAgIH0sXG4gICAgJ2FscGhhbnVtZXJpYyc6IGZ1bmN0aW9uICh2KSB7XG4gICAgICByZXR1cm4gKC9eW2EtekEtWjAtOV0rJC8pLnRlc3Qodik7XG4gICAgfSxcbiAgICAnaWRlbnRpZmllcic6IGZ1bmN0aW9uICh2KSB7XG4gICAgICByZXR1cm4gKC9eWy1fYS16QS1aMC05XSskLykudGVzdCh2KTtcbiAgICB9LFxuICAgICdoZXhhZGVjaW1hbCc6IGZ1bmN0aW9uICh2KSB7XG4gICAgICByZXR1cm4gKC9eW2EtZkEtRjAtOV0rJC8pLnRlc3Qodik7XG4gICAgfSxcbiAgICAnbnVtZXJpYyc6IGZ1bmN0aW9uICh2KSB7XG4gICAgICByZXR1cm4gKC9eWzAtOV0rJC8pLnRlc3Qodik7XG4gICAgfSxcbiAgICAnZGF0ZS10aW1lJzogZnVuY3Rpb24gKHYpIHtcbiAgICAgIHJldHVybiAhaXNOYU4oRGF0ZS5wYXJzZSh2KSkgJiYgdi5pbmRleE9mKCcvJykgPT09IC0xO1xuICAgIH0sXG4gICAgJ3VwcGVyY2FzZSc6IGZ1bmN0aW9uICh2KSB7XG4gICAgICByZXR1cm4gdiA9PT0gdi50b1VwcGVyQ2FzZSgpO1xuICAgIH0sXG4gICAgJ2xvd2VyY2FzZSc6IGZ1bmN0aW9uICh2KSB7XG4gICAgICByZXR1cm4gdiA9PT0gdi50b0xvd2VyQ2FzZSgpO1xuICAgIH0sXG4gICAgJ2hvc3RuYW1lJzogZnVuY3Rpb24gKHYpIHtcbiAgICAgIHJldHVybiB2Lmxlbmd0aCA8IDI1NiAmJiAoL14oW2EtekEtWjAtOV18W2EtekEtWjAtOV1bYS16QS1aMC05XFwtXXswLDYxfVthLXpBLVowLTldKShcXC4oW2EtekEtWjAtOV18W2EtekEtWjAtOV1bYS16QS1aMC05XFwtXXswLDYxfVthLXpBLVowLTldKSkqJC8pLnRlc3Qodik7XG4gICAgfSxcbiAgICAndXJpJzogZnVuY3Rpb24gKHYpIHtcbiAgICAgIHJldHVybiAoL1stYS16QS1aMC05QDolX1xcKy5+Iz8mLy89XXsyLDI1Nn1cXC5bYS16XXsyLDR9XFxiKFxcL1stYS16QS1aMC05QDolX1xcKy5+Iz8mLy89XSopPy8pLnRlc3Qodik7XG4gICAgfSxcbiAgICAnZW1haWwnOiBmdW5jdGlvbiAodikgeyAvLyBlbWFpbCwgaXB2NCBhbmQgaXB2NiBhZGFwdGVkIGZyb20gbm9kZS12YWxpZGF0b3JcbiAgICAgIHJldHVybiAoL14oPzpbXFx3XFwhXFwjXFwkXFwlXFwmXFwnXFwqXFwrXFwtXFwvXFw9XFw/XFxeXFxgXFx7XFx8XFx9XFx+XStcXC4pKltcXHdcXCFcXCNcXCRcXCVcXCZcXCdcXCpcXCtcXC1cXC9cXD1cXD9cXF5cXGBcXHtcXHxcXH1cXH5dK0AoPzooPzooPzpbYS16QS1aMC05XSg/OlthLXpBLVowLTlcXC1dKD8hXFwuKSl7MCw2MX1bYS16QS1aMC05XT9cXC4pK1thLXpBLVowLTldKD86W2EtekEtWjAtOVxcLV0oPyEkKSl7MCw2MX1bYS16QS1aMC05XT8pfCg/OlxcWyg/Oig/OlswMV0/XFxkezEsMn18MlswLTRdXFxkfDI1WzAtNV0pXFwuKXszfSg/OlswMV0/XFxkezEsMn18MlswLTRdXFxkfDI1WzAtNV0pXFxdKSkkLykudGVzdCh2KTtcbiAgICB9LFxuICAgICdpcHY0JzogZnVuY3Rpb24gKHYpIHtcbiAgICAgIGlmICgoL14oXFxkP1xcZD9cXGQpXFwuKFxcZD9cXGQ/XFxkKVxcLihcXGQ/XFxkP1xcZClcXC4oXFxkP1xcZD9cXGQpJC8pLnRlc3QodikpIHtcbiAgICAgICAgdmFyIHBhcnRzID0gdi5zcGxpdCgnLicpLnNvcnQoKTtcbiAgICAgICAgaWYgKHBhcnRzWzNdIDw9IDI1NSlcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9LFxuICAgICdpcHY2JzogZnVuY3Rpb24odikge1xuICAgICAgcmV0dXJuICgvXigoPz0uKjo6KSg/IS4qOjouKzo6KSg6Oik/KFtcXGRBLUZdezEsNH06KDp8XFxiKXwpezV9fChbXFxkQS1GXXsxLDR9Oil7Nn0pKCgoW1xcZEEtRl17MSw0fSgoPyFcXDMpOjp8OlxcYnwkKSl8KD8hXFwyXFwzKSl7Mn18KCgoMlswLTRdfDFcXGR8WzEtOV0pP1xcZHwyNVswLTVdKVxcLj9cXGIpezR9KSQvKS50ZXN0KHYpO1xuICAgICAvKiAgcmV0dXJuICgvXjo6fF46OjF8XihbYS1mQS1GMC05XXsxLDR9Ojo/KXsxLDd9KFthLWZBLUYwLTldezEsNH0pJC8pLnRlc3Qodik7ICovXG4gICAgfVxuICB9O1xuXG4gIHZhciBmaWVsZFZhbGlkYXRlID0ge1xuICAgICdyZWFkT25seSc6IGZ1bmN0aW9uICh2LCBwKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSxcbiAgICAvLyAqKioqKiogbnVtZXJpYyB2YWxpZGF0aW9uICoqKioqKioqXG4gICAgJ21pbmltdW0nOiBmdW5jdGlvbiAodiwgcCwgc2NoZW1hKSB7XG4gICAgICByZXR1cm4gISh2IDwgcCB8fCBzY2hlbWEuZXhjbHVzaXZlTWluaW11bSAmJiB2IDw9IHApO1xuICAgIH0sXG4gICAgJ21heGltdW0nOiBmdW5jdGlvbiAodiwgcCwgc2NoZW1hKSB7XG4gICAgICByZXR1cm4gISh2ID4gcCB8fCBzY2hlbWEuZXhjbHVzaXZlTWF4aW11bSAmJiB2ID49IHApO1xuICAgIH0sXG4gICAgJ211bHRpcGxlT2YnOiBmdW5jdGlvbiAodiwgcCkge1xuICAgICAgcmV0dXJuICh2L3ApJTEgPT09IDAgfHwgdHlwZW9mIHYgIT09ICdudW1iZXInO1xuICAgIH0sXG4gICAgLy8gKioqKioqIHN0cmluZyB2YWxpZGF0aW9uICoqKioqKlxuICAgICdwYXR0ZXJuJzogZnVuY3Rpb24gKHYsIHApIHtcbiAgICAgIGlmICh0eXBlb2YgdiAhPT0gJ3N0cmluZycpXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgdmFyIHBhdHRlcm4sIG1vZGlmaWVycztcbiAgICAgIGlmICh0eXBlb2YgcCA9PT0gJ3N0cmluZycpXG4gICAgICAgIHBhdHRlcm49cDtcbiAgICAgIGVsc2Uge1xuICAgICAgICBwYXR0ZXJuPXBbMF07XG4gICAgICAgIG1vZGlmaWVycz1wWzFdO1xuICAgICAgfVxuICAgICAgdmFyIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuLCBtb2RpZmllcnMpO1xuICAgICAgcmV0dXJuIHJlZ2V4LnRlc3Qodik7XG4gICAgfSxcbiAgICAnbWluTGVuZ3RoJzogZnVuY3Rpb24gKHYsIHApIHtcbiAgICAgIHJldHVybiB2Lmxlbmd0aCA+PSBwIHx8IHR5cGVvZiB2ICE9PSAnc3RyaW5nJztcbiAgICB9LFxuICAgICdtYXhMZW5ndGgnOiBmdW5jdGlvbiAodiwgcCkge1xuICAgICAgcmV0dXJuIHYubGVuZ3RoIDw9IHAgfHwgdHlwZW9mIHYgIT09ICdzdHJpbmcnO1xuICAgIH0sXG4gICAgLy8gKioqKiogYXJyYXkgdmFsaWRhdGlvbiAqKioqKlxuICAgICdtaW5JdGVtcyc6IGZ1bmN0aW9uICh2LCBwKSB7XG4gICAgICByZXR1cm4gdi5sZW5ndGggPj0gcCB8fCAhQXJyYXkuaXNBcnJheSh2KTtcbiAgICB9LFxuICAgICdtYXhJdGVtcyc6IGZ1bmN0aW9uICh2LCBwKSB7XG4gICAgICByZXR1cm4gdi5sZW5ndGggPD0gcCB8fCAhQXJyYXkuaXNBcnJheSh2KTtcbiAgICB9LFxuICAgICd1bmlxdWVJdGVtcyc6IGZ1bmN0aW9uICh2LCBwKSB7XG4gICAgICB2YXIgaGFzaCA9IHt9LCBrZXk7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gdi5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICBrZXkgPSBKU09OLnN0cmluZ2lmeSh2W2ldKTtcbiAgICAgICAgaWYgKGhhc2guaGFzT3duUHJvcGVydHkoa2V5KSlcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBoYXNoW2tleV0gPSB0cnVlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSxcbiAgICAvLyAqKioqKiBvYmplY3QgdmFsaWRhdGlvbiAqKioqXG4gICAgJ21pblByb3BlcnRpZXMnOiBmdW5jdGlvbiAodiwgcCkge1xuICAgICAgaWYgKHR5cGVvZiB2ICE9PSAnb2JqZWN0JylcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB2YXIgY291bnQgPSAwO1xuICAgICAgZm9yICh2YXIgYXR0ciBpbiB2KSBpZiAodi5oYXNPd25Qcm9wZXJ0eShhdHRyKSkgY291bnQgPSBjb3VudCArIDE7XG4gICAgICByZXR1cm4gY291bnQgPj0gcDtcbiAgICB9LFxuICAgICdtYXhQcm9wZXJ0aWVzJzogZnVuY3Rpb24gKHYsIHApIHtcbiAgICAgIGlmICh0eXBlb2YgdiAhPT0gJ29iamVjdCcpXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgdmFyIGNvdW50ID0gMDtcbiAgICAgIGZvciAodmFyIGF0dHIgaW4gdikgaWYgKHYuaGFzT3duUHJvcGVydHkoYXR0cikpIGNvdW50ID0gY291bnQgKyAxO1xuICAgICAgcmV0dXJuIGNvdW50IDw9IHA7XG4gICAgfSxcbiAgICAvLyAqKioqKiogYWxsICoqKioqXG4gICAgJ2NvbnN0YW50JzogZnVuY3Rpb24gKHYsIHApIHtcbiAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh2KSA9PSBKU09OLnN0cmluZ2lmeShwKTtcbiAgICB9LFxuICAgICdlbnVtJzogZnVuY3Rpb24gKHYsIHApIHtcbiAgICAgIHZhciBpLCBsZW4sIHZzO1xuICAgICAgaWYgKHR5cGVvZiB2ID09PSAnb2JqZWN0Jykge1xuICAgICAgICB2cyA9IEpTT04uc3RyaW5naWZ5KHYpO1xuICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBwLmxlbmd0aDsgaSA8IGxlbjsgaSsrKVxuICAgICAgICAgIGlmICh2cyA9PT0gSlNPTi5zdHJpbmdpZnkocFtpXSkpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHAubGVuZ3RoOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgaWYgKHYgPT09IHBbaV0pXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH07XG5cbiAgdmFyIG5vcm1hbGl6ZUlEID0gZnVuY3Rpb24gKGlkKSB7XG4gICAgcmV0dXJuIGlkLmluZGV4T2YoXCI6Ly9cIikgPT09IC0xID8gaWQgOiBpZC5zcGxpdChcIiNcIilbMF07XG4gIH07XG5cbiAgdmFyIHJlc29sdmVVUkkgPSBmdW5jdGlvbiAoZW52LCBzY2hlbWFfc3RhY2ssIHVyaSkge1xuICAgIHZhciBjdXJzY2hlbWEsIGNvbXBvbmVudHMsIGhhc2hfaWR4LCBuYW1lO1xuXG4gICAgaGFzaF9pZHggPSB1cmkuaW5kZXhPZignIycpO1xuXG4gICAgaWYgKGhhc2hfaWR4ID09PSAtMSkge1xuICAgICAgaWYgKCFlbnYuc2NoZW1hLmhhc093blByb3BlcnR5KHVyaSkpXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgcmV0dXJuIFtlbnYuc2NoZW1hW3VyaV1dO1xuICAgIH1cblxuICAgIGlmIChoYXNoX2lkeCA+IDApIHtcbiAgICAgIG5hbWUgPSB1cmkuc3Vic3RyKDAsIGhhc2hfaWR4KTtcbiAgICAgIHVyaSA9IHVyaS5zdWJzdHIoaGFzaF9pZHgrMSk7XG4gICAgICBpZiAoIWVudi5zY2hlbWEuaGFzT3duUHJvcGVydHkobmFtZSkpIHtcbiAgICAgICAgaWYgKHNjaGVtYV9zdGFjayAmJiBzY2hlbWFfc3RhY2tbMF0uaWQgPT09IG5hbWUpXG4gICAgICAgICAgc2NoZW1hX3N0YWNrID0gW3NjaGVtYV9zdGFja1swXV07XG4gICAgICAgIGVsc2VcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH0gZWxzZVxuICAgICAgICBzY2hlbWFfc3RhY2sgPSBbZW52LnNjaGVtYVtuYW1lXV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghc2NoZW1hX3N0YWNrKVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIHVyaSA9IHVyaS5zdWJzdHIoMSk7XG4gICAgfVxuXG4gICAgaWYgKHVyaSA9PT0gJycpXG4gICAgICByZXR1cm4gW3NjaGVtYV9zdGFja1swXV07XG5cbiAgICBpZiAodXJpLmNoYXJBdCgwKSA9PT0gJy8nKSB7XG4gICAgICB1cmkgPSB1cmkuc3Vic3RyKDEpO1xuICAgICAgY3Vyc2NoZW1hID0gc2NoZW1hX3N0YWNrWzBdO1xuICAgICAgY29tcG9uZW50cyA9IHVyaS5zcGxpdCgnLycpO1xuICAgICAgd2hpbGUgKGNvbXBvbmVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBpZiAoIWN1cnNjaGVtYS5oYXNPd25Qcm9wZXJ0eShjb21wb25lbnRzWzBdKSlcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgY3Vyc2NoZW1hID0gY3Vyc2NoZW1hW2NvbXBvbmVudHNbMF1dO1xuICAgICAgICBzY2hlbWFfc3RhY2sucHVzaChjdXJzY2hlbWEpO1xuICAgICAgICBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2NoZW1hX3N0YWNrO1xuICAgIH0gZWxzZSAvLyBGSVg6IHNob3VsZCBsb29rIGZvciBzdWJzY2hlbWFzIHdob3NlIGlkIG1hdGNoZXMgdXJpXG4gICAgICByZXR1cm4gbnVsbDtcbiAgfTtcblxuICB2YXIgcmVzb2x2ZU9iamVjdFJlZiA9IGZ1bmN0aW9uIChvYmplY3Rfc3RhY2ssIHVyaSkge1xuICAgIHZhciBjb21wb25lbnRzLCBvYmplY3QsIGxhc3RfZnJhbWUgPSBvYmplY3Rfc3RhY2subGVuZ3RoLTEsIHNraXBfZnJhbWVzLCBmcmFtZSwgbSA9IC9eKFxcZCspLy5leGVjKHVyaSk7XG5cbiAgICBpZiAobSkge1xuICAgICAgdXJpID0gdXJpLnN1YnN0cihtWzBdLmxlbmd0aCk7XG4gICAgICBza2lwX2ZyYW1lcyA9IHBhcnNlSW50KG1bMV0sIDEwKTtcbiAgICAgIGlmIChza2lwX2ZyYW1lcyA8IDAgfHwgc2tpcF9mcmFtZXMgPiBsYXN0X2ZyYW1lKVxuICAgICAgICByZXR1cm47XG4gICAgICBmcmFtZSA9IG9iamVjdF9zdGFja1tsYXN0X2ZyYW1lLXNraXBfZnJhbWVzXTtcbiAgICAgIGlmICh1cmkgPT09ICcjJylcbiAgICAgICAgcmV0dXJuIGZyYW1lLmtleTtcbiAgICB9IGVsc2VcbiAgICAgIGZyYW1lID0gb2JqZWN0X3N0YWNrWzBdO1xuXG4gICAgb2JqZWN0ID0gZnJhbWUub2JqZWN0W2ZyYW1lLmtleV07XG5cbiAgICBpZiAodXJpID09PSAnJylcbiAgICAgIHJldHVybiBvYmplY3Q7XG5cbiAgICBpZiAodXJpLmNoYXJBdCgwKSA9PT0gJy8nKSB7XG4gICAgICB1cmkgPSB1cmkuc3Vic3RyKDEpO1xuICAgICAgY29tcG9uZW50cyA9IHVyaS5zcGxpdCgnLycpO1xuICAgICAgd2hpbGUgKGNvbXBvbmVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb21wb25lbnRzWzBdID0gY29tcG9uZW50c1swXS5yZXBsYWNlKC9+MS9nLCAnLycpLnJlcGxhY2UoL34wL2csICd+Jyk7XG4gICAgICAgIGlmICghb2JqZWN0Lmhhc093blByb3BlcnR5KGNvbXBvbmVudHNbMF0pKVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgb2JqZWN0ID0gb2JqZWN0W2NvbXBvbmVudHNbMF1dO1xuICAgICAgICBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gb2JqZWN0O1xuICAgIH0gZWxzZVxuICAgICAgcmV0dXJuO1xuICB9O1xuXG4gIHZhciBjaGVja1ZhbGlkaXR5ID0gZnVuY3Rpb24gKGVudiwgc2NoZW1hX3N0YWNrLCBvYmplY3Rfc3RhY2ssIG9wdGlvbnMpIHtcbiAgICB2YXIgaSwgbGVuLCBjb3VudCwgaGFzUHJvcCwgaGFzUGF0dGVybjtcbiAgICB2YXIgcCwgdiwgbWFsZm9ybWVkID0gZmFsc2UsIG9iamVycnMgPSB7fSwgb2JqZXJyLCBwcm9wcywgbWF0Y2hlZDtcbiAgICB2YXIgc2wgPSBzY2hlbWFfc3RhY2subGVuZ3RoLTEsIHNjaGVtYSA9IHNjaGVtYV9zdGFja1tzbF0sIG5ld19zdGFjaztcbiAgICB2YXIgb2wgPSBvYmplY3Rfc3RhY2subGVuZ3RoLTEsIG9iamVjdCA9IG9iamVjdF9zdGFja1tvbF0ub2JqZWN0LCBuYW1lID0gb2JqZWN0X3N0YWNrW29sXS5rZXksIHByb3AgPSBvYmplY3RbbmFtZV07XG4gICAgdmFyIGVyckNvdW50LCBtaW5FcnJDb3VudDtcblxuICAgIGlmIChzY2hlbWEuaGFzT3duUHJvcGVydHkoJyRyZWYnKSkge1xuICAgICAgc2NoZW1hX3N0YWNrPSByZXNvbHZlVVJJKGVudiwgc2NoZW1hX3N0YWNrLCBzY2hlbWEuJHJlZik7XG4gICAgICBpZiAoIXNjaGVtYV9zdGFjaylcbiAgICAgICAgcmV0dXJuIHsnJHJlZic6IHNjaGVtYS4kcmVmfTtcbiAgICAgIGVsc2VcbiAgICAgICAgcmV0dXJuIGNoZWNrVmFsaWRpdHkoZW52LCBzY2hlbWFfc3RhY2ssIG9iamVjdF9zdGFjaywgb3B0aW9ucyk7XG4gICAgfVxuXG4gICAgaWYgKHNjaGVtYS5oYXNPd25Qcm9wZXJ0eSgndHlwZScpKSB7XG4gICAgICBpZiAodHlwZW9mIHNjaGVtYS50eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAob3B0aW9ucy51c2VDb2VyY2UgJiYgZW52LmNvZXJjZVR5cGUuaGFzT3duUHJvcGVydHkoc2NoZW1hLnR5cGUpKVxuICAgICAgICAgIHByb3AgPSBvYmplY3RbbmFtZV0gPSBlbnYuY29lcmNlVHlwZVtzY2hlbWEudHlwZV0ocHJvcCk7XG4gICAgICAgIGlmICghZW52LmZpZWxkVHlwZVtzY2hlbWEudHlwZV0ocHJvcCkpXG4gICAgICAgICAgcmV0dXJuIHsndHlwZSc6IHNjaGVtYS50eXBlfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1hbGZvcm1lZCA9IHRydWU7XG4gICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHNjaGVtYS50eXBlLmxlbmd0aDsgaSA8IGxlbiAmJiBtYWxmb3JtZWQ7IGkrKylcbiAgICAgICAgICBpZiAoZW52LmZpZWxkVHlwZVtzY2hlbWEudHlwZVtpXV0ocHJvcCkpXG4gICAgICAgICAgICBtYWxmb3JtZWQgPSBmYWxzZTtcbiAgICAgICAgaWYgKG1hbGZvcm1lZClcbiAgICAgICAgICByZXR1cm4geyd0eXBlJzogc2NoZW1hLnR5cGV9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzY2hlbWEuaGFzT3duUHJvcGVydHkoJ2FsbE9mJykpIHtcbiAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHNjaGVtYS5hbGxPZi5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICBvYmplcnIgPSBjaGVja1ZhbGlkaXR5KGVudiwgc2NoZW1hX3N0YWNrLmNvbmNhdChzY2hlbWEuYWxsT2ZbaV0pLCBvYmplY3Rfc3RhY2ssIG9wdGlvbnMpO1xuICAgICAgICBpZiAob2JqZXJyKVxuICAgICAgICAgIHJldHVybiBvYmplcnI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFvcHRpb25zLnVzZUNvZXJjZSAmJiAhb3B0aW9ucy51c2VEZWZhdWx0ICYmICFvcHRpb25zLnJlbW92ZUFkZGl0aW9uYWwpIHtcbiAgICAgIGlmIChzY2hlbWEuaGFzT3duUHJvcGVydHkoJ29uZU9mJykpIHtcbiAgICAgICAgbWluRXJyQ291bnQgPSBJbmZpbml0eTtcbiAgICAgICAgZm9yIChpID0gMCwgbGVuID0gc2NoZW1hLm9uZU9mLmxlbmd0aCwgY291bnQgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICBvYmplcnIgPSBjaGVja1ZhbGlkaXR5KGVudiwgc2NoZW1hX3N0YWNrLmNvbmNhdChzY2hlbWEub25lT2ZbaV0pLCBvYmplY3Rfc3RhY2ssIG9wdGlvbnMpO1xuICAgICAgICAgIGlmICghb2JqZXJyKSB7XG4gICAgICAgICAgICBjb3VudCA9IGNvdW50ICsgMTtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDEpXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlcnJDb3VudCA9IG9iamVyci5zY2hlbWEgPyBPYmplY3Qua2V5cyhvYmplcnIuc2NoZW1hKS5sZW5ndGggOiAxO1xuICAgICAgICAgICAgaWYgKGVyckNvdW50IDwgbWluRXJyQ291bnQpIHtcbiAgICAgICAgICAgICAgICBtaW5FcnJDb3VudCA9IGVyckNvdW50O1xuICAgICAgICAgICAgICAgIG9iamVycnMgPSBvYmplcnI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChjb3VudCA+IDEpXG4gICAgICAgICAgcmV0dXJuIHsnb25lT2YnOiB0cnVlfTtcbiAgICAgICAgZWxzZSBpZiAoY291bnQgPCAxKVxuICAgICAgICAgIHJldHVybiBvYmplcnJzO1xuICAgICAgICBvYmplcnJzID0ge307XG4gICAgICB9XG5cbiAgICAgIGlmIChzY2hlbWEuaGFzT3duUHJvcGVydHkoJ2FueU9mJykpIHtcbiAgICAgICAgb2JqZXJycyA9IG51bGw7XG4gICAgICAgIG1pbkVyckNvdW50ID0gSW5maW5pdHk7XG4gICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHNjaGVtYS5hbnlPZi5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgIG9iamVyciA9IGNoZWNrVmFsaWRpdHkoZW52LCBzY2hlbWFfc3RhY2suY29uY2F0KHNjaGVtYS5hbnlPZltpXSksIG9iamVjdF9zdGFjaywgb3B0aW9ucyk7XG4gICAgICAgICAgaWYgKCFvYmplcnIpIHtcbiAgICAgICAgICAgIG9iamVycnMgPSBudWxsO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZXJyQ291bnQgPSBvYmplcnIuc2NoZW1hID8gT2JqZWN0LmtleXMob2JqZXJyLnNjaGVtYSkubGVuZ3RoIDogMTtcbiAgICAgICAgICAgIGlmIChlcnJDb3VudCA8IG1pbkVyckNvdW50KSB7XG4gICAgICAgICAgICAgICAgbWluRXJyQ291bnQgPSBlcnJDb3VudDtcbiAgICAgICAgICAgICAgICBvYmplcnJzID0gb2JqZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob2JqZXJycylcbiAgICAgICAgICByZXR1cm4gb2JqZXJycztcbiAgICAgIH1cblxuICAgICAgaWYgKHNjaGVtYS5oYXNPd25Qcm9wZXJ0eSgnbm90JykpIHtcbiAgICAgICAgb2JqZXJyID0gY2hlY2tWYWxpZGl0eShlbnYsIHNjaGVtYV9zdGFjay5jb25jYXQoc2NoZW1hLm5vdCksIG9iamVjdF9zdGFjaywgb3B0aW9ucyk7XG4gICAgICAgIGlmICghb2JqZXJyKVxuICAgICAgICAgIHJldHVybiB7J25vdCc6IHRydWV9O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoc2NoZW1hLmhhc093blByb3BlcnR5KCdvbmVPZicpKSB7XG4gICAgICAgIG1pbkVyckNvdW50ID0gSW5maW5pdHk7XG4gICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHNjaGVtYS5vbmVPZi5sZW5ndGgsIGNvdW50ID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgbmV3X3N0YWNrID0gY2xvbmVfc3RhY2sob2JqZWN0X3N0YWNrKTtcbiAgICAgICAgICBvYmplcnIgPSBjaGVja1ZhbGlkaXR5KGVudiwgc2NoZW1hX3N0YWNrLmNvbmNhdChzY2hlbWEub25lT2ZbaV0pLCBuZXdfc3RhY2ssIG9wdGlvbnMpO1xuICAgICAgICAgIGlmICghb2JqZXJyKSB7XG4gICAgICAgICAgICBjb3VudCA9IGNvdW50ICsgMTtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDEpXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICBjb3B5X3N0YWNrKG5ld19zdGFjaywgb2JqZWN0X3N0YWNrKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyQ291bnQgPSBvYmplcnIuc2NoZW1hID8gT2JqZWN0LmtleXMob2JqZXJyLnNjaGVtYSkubGVuZ3RoIDogMTtcbiAgICAgICAgICAgIGlmIChlcnJDb3VudCA8IG1pbkVyckNvdW50KSB7XG4gICAgICAgICAgICAgICAgbWluRXJyQ291bnQgPSBlcnJDb3VudDtcbiAgICAgICAgICAgICAgICBvYmplcnJzID0gb2JqZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoY291bnQgPiAxKVxuICAgICAgICAgIHJldHVybiB7J29uZU9mJzogdHJ1ZX07XG4gICAgICAgIGVsc2UgaWYgKGNvdW50IDwgMSlcbiAgICAgICAgICByZXR1cm4gb2JqZXJycztcbiAgICAgICAgb2JqZXJycyA9IHt9O1xuICAgICAgfVxuXG4gICAgICBpZiAoc2NoZW1hLmhhc093blByb3BlcnR5KCdhbnlPZicpKSB7XG4gICAgICAgIG9iamVycnMgPSBudWxsO1xuICAgICAgICBtaW5FcnJDb3VudCA9IEluZmluaXR5O1xuICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBzY2hlbWEuYW55T2YubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICBuZXdfc3RhY2sgPSBjbG9uZV9zdGFjayhvYmplY3Rfc3RhY2spO1xuICAgICAgICAgIG9iamVyciA9IGNoZWNrVmFsaWRpdHkoZW52LCBzY2hlbWFfc3RhY2suY29uY2F0KHNjaGVtYS5hbnlPZltpXSksIG5ld19zdGFjaywgb3B0aW9ucyk7XG4gICAgICAgICAgaWYgKCFvYmplcnIpIHtcbiAgICAgICAgICAgIGNvcHlfc3RhY2sobmV3X3N0YWNrLCBvYmplY3Rfc3RhY2spO1xuICAgICAgICAgICAgb2JqZXJycyA9IG51bGw7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBlcnJDb3VudCA9IG9iamVyci5zY2hlbWEgPyBPYmplY3Qua2V5cyhvYmplcnIuc2NoZW1hKS5sZW5ndGggOiAxO1xuICAgICAgICAgICAgaWYgKGVyckNvdW50IDwgbWluRXJyQ291bnQpIHtcbiAgICAgICAgICAgICAgICBtaW5FcnJDb3VudCA9IGVyckNvdW50O1xuICAgICAgICAgICAgICAgIG9iamVycnMgPSBvYmplcnI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChvYmplcnJzKVxuICAgICAgICAgIHJldHVybiBvYmplcnJzO1xuICAgICAgfVxuXG4gICAgICBpZiAoc2NoZW1hLmhhc093blByb3BlcnR5KCdub3QnKSkge1xuICAgICAgICBuZXdfc3RhY2sgPSBjbG9uZV9zdGFjayhvYmplY3Rfc3RhY2spO1xuICAgICAgICBvYmplcnIgPSBjaGVja1ZhbGlkaXR5KGVudiwgc2NoZW1hX3N0YWNrLmNvbmNhdChzY2hlbWEubm90KSwgbmV3X3N0YWNrLCBvcHRpb25zKTtcbiAgICAgICAgaWYgKCFvYmplcnIpXG4gICAgICAgICAgcmV0dXJuIHsnbm90JzogdHJ1ZX07XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNjaGVtYS5oYXNPd25Qcm9wZXJ0eSgnZGVwZW5kZW5jaWVzJykpIHtcbiAgICAgIGZvciAocCBpbiBzY2hlbWEuZGVwZW5kZW5jaWVzKVxuICAgICAgICBpZiAoc2NoZW1hLmRlcGVuZGVuY2llcy5oYXNPd25Qcm9wZXJ0eShwKSAmJiBwcm9wLmhhc093blByb3BlcnR5KHApKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoc2NoZW1hLmRlcGVuZGVuY2llc1twXSkpIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHNjaGVtYS5kZXBlbmRlbmNpZXNbcF0ubGVuZ3RoOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgICAgIGlmICghcHJvcC5oYXNPd25Qcm9wZXJ0eShzY2hlbWEuZGVwZW5kZW5jaWVzW3BdW2ldKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7J2RlcGVuZGVuY2llcyc6IHRydWV9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG9iamVyciA9IGNoZWNrVmFsaWRpdHkoZW52LCBzY2hlbWFfc3RhY2suY29uY2F0KHNjaGVtYS5kZXBlbmRlbmNpZXNbcF0pLCBvYmplY3Rfc3RhY2ssIG9wdGlvbnMpO1xuICAgICAgICAgICAgaWYgKG9iamVycilcbiAgICAgICAgICAgICAgcmV0dXJuIG9iamVycjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocHJvcCkpIHtcbiAgICAgIHByb3BzID0gW107XG4gICAgICBvYmplcnJzID0ge307XG4gICAgICBmb3IgKHAgaW4gcHJvcClcbiAgICAgICAgaWYgKHByb3AuaGFzT3duUHJvcGVydHkocCkpXG4gICAgICAgICAgcHJvcHMucHVzaChwKTtcblxuICAgICAgaWYgKG9wdGlvbnMuY2hlY2tSZXF1aXJlZCAmJiBzY2hlbWEucmVxdWlyZWQpIHtcbiAgICAgICAgZm9yIChpID0gMCwgbGVuID0gc2NoZW1hLnJlcXVpcmVkLmxlbmd0aDsgaSA8IGxlbjsgaSsrKVxuICAgICAgICAgIGlmICghcHJvcC5oYXNPd25Qcm9wZXJ0eShzY2hlbWEucmVxdWlyZWRbaV0pKSB7XG4gICAgICAgICAgICBvYmplcnJzW3NjaGVtYS5yZXF1aXJlZFtpXV0gPSB7J3JlcXVpcmVkJzogdHJ1ZX07XG4gICAgICAgICAgICBtYWxmb3JtZWQgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaGFzUHJvcCA9IHNjaGVtYS5oYXNPd25Qcm9wZXJ0eSgncHJvcGVydGllcycpO1xuICAgICAgaGFzUGF0dGVybiA9IHNjaGVtYS5oYXNPd25Qcm9wZXJ0eSgncGF0dGVyblByb3BlcnRpZXMnKTtcbiAgICAgIGlmIChoYXNQcm9wIHx8IGhhc1BhdHRlcm4pIHtcbiAgICAgICAgaSA9IHByb3BzLmxlbmd0aDtcbiAgICAgICAgd2hpbGUgKGktLSkge1xuICAgICAgICAgIG1hdGNoZWQgPSBmYWxzZTtcbiAgICAgICAgICBpZiAoaGFzUHJvcCAmJiBzY2hlbWEucHJvcGVydGllcy5oYXNPd25Qcm9wZXJ0eShwcm9wc1tpXSkpIHtcbiAgICAgICAgICAgIG1hdGNoZWQgPSB0cnVlO1xuICAgICAgICAgICAgb2JqZXJyID0gY2hlY2tWYWxpZGl0eShlbnYsIHNjaGVtYV9zdGFjay5jb25jYXQoc2NoZW1hLnByb3BlcnRpZXNbcHJvcHNbaV1dKSwgb2JqZWN0X3N0YWNrLmNvbmNhdCh7b2JqZWN0OiBwcm9wLCBrZXk6IHByb3BzW2ldfSksIG9wdGlvbnMpO1xuICAgICAgICAgICAgaWYgKG9iamVyciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICBvYmplcnJzW3Byb3BzW2ldXSA9IG9iamVycjtcbiAgICAgICAgICAgICAgbWFsZm9ybWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGhhc1BhdHRlcm4pIHtcbiAgICAgICAgICAgIGZvciAocCBpbiBzY2hlbWEucGF0dGVyblByb3BlcnRpZXMpXG4gICAgICAgICAgICAgIGlmIChzY2hlbWEucGF0dGVyblByb3BlcnRpZXMuaGFzT3duUHJvcGVydHkocCkgJiYgcHJvcHNbaV0ubWF0Y2gocCkpIHtcbiAgICAgICAgICAgICAgICBtYXRjaGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBvYmplcnIgPSBjaGVja1ZhbGlkaXR5KGVudiwgc2NoZW1hX3N0YWNrLmNvbmNhdChzY2hlbWEucGF0dGVyblByb3BlcnRpZXNbcF0pLCBvYmplY3Rfc3RhY2suY29uY2F0KHtvYmplY3Q6IHByb3AsIGtleTogcHJvcHNbaV19KSwgb3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgaWYgKG9iamVyciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgb2JqZXJyc1twcm9wc1tpXV0gPSBvYmplcnI7XG4gICAgICAgICAgICAgICAgICBtYWxmb3JtZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAobWF0Y2hlZClcbiAgICAgICAgICAgIHByb3BzLnNwbGljZShpLCAxKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob3B0aW9ucy51c2VEZWZhdWx0ICYmIGhhc1Byb3AgJiYgIW1hbGZvcm1lZCkge1xuICAgICAgICBmb3IgKHAgaW4gc2NoZW1hLnByb3BlcnRpZXMpXG4gICAgICAgICAgaWYgKHNjaGVtYS5wcm9wZXJ0aWVzLmhhc093blByb3BlcnR5KHApICYmICFwcm9wLmhhc093blByb3BlcnR5KHApICYmIHNjaGVtYS5wcm9wZXJ0aWVzW3BdLmhhc093blByb3BlcnR5KCdkZWZhdWx0JykpXG4gICAgICAgICAgICBwcm9wW3BdID0gc2NoZW1hLnByb3BlcnRpZXNbcF1bJ2RlZmF1bHQnXTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMucmVtb3ZlQWRkaXRpb25hbCAmJiBoYXNQcm9wICYmIHNjaGVtYS5hZGRpdGlvbmFsUHJvcGVydGllcyAhPT0gdHJ1ZSAmJiB0eXBlb2Ygc2NoZW1hLmFkZGl0aW9uYWxQcm9wZXJ0aWVzICE9PSAnb2JqZWN0Jykge1xuICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBwcm9wcy5sZW5ndGg7IGkgPCBsZW47IGkrKylcbiAgICAgICAgICBkZWxldGUgcHJvcFtwcm9wc1tpXV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoc2NoZW1hLmhhc093blByb3BlcnR5KCdhZGRpdGlvbmFsUHJvcGVydGllcycpKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBzY2hlbWEuYWRkaXRpb25hbFByb3BlcnRpZXMgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgaWYgKCFzY2hlbWEuYWRkaXRpb25hbFByb3BlcnRpZXMpIHtcbiAgICAgICAgICAgICAgZm9yIChpID0gMCwgbGVuID0gcHJvcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBvYmplcnJzW3Byb3BzW2ldXSA9IHsnYWRkaXRpb25hbCc6IHRydWV9O1xuICAgICAgICAgICAgICAgIG1hbGZvcm1lZCA9IHRydWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yIChpID0gMCwgbGVuID0gcHJvcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgb2JqZXJyID0gY2hlY2tWYWxpZGl0eShlbnYsIHNjaGVtYV9zdGFjay5jb25jYXQoc2NoZW1hLmFkZGl0aW9uYWxQcm9wZXJ0aWVzKSwgb2JqZWN0X3N0YWNrLmNvbmNhdCh7b2JqZWN0OiBwcm9wLCBrZXk6IHByb3BzW2ldfSksIG9wdGlvbnMpO1xuICAgICAgICAgICAgICBpZiAob2JqZXJyICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgb2JqZXJyc1twcm9wc1tpXV0gPSBvYmplcnI7XG4gICAgICAgICAgICAgICAgbWFsZm9ybWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKG1hbGZvcm1lZClcbiAgICAgICAgcmV0dXJuIHsnc2NoZW1hJzogb2JqZXJyc307XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChzY2hlbWEuaGFzT3duUHJvcGVydHkoJ2l0ZW1zJykpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoc2NoZW1hLml0ZW1zKSkge1xuICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHNjaGVtYS5pdGVtcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgb2JqZXJyID0gY2hlY2tWYWxpZGl0eShlbnYsIHNjaGVtYV9zdGFjay5jb25jYXQoc2NoZW1hLml0ZW1zW2ldKSwgb2JqZWN0X3N0YWNrLmNvbmNhdCh7b2JqZWN0OiBwcm9wLCBrZXk6IGl9KSwgb3B0aW9ucyk7XG4gICAgICAgICAgICBpZiAob2JqZXJyICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgIG9iamVycnNbaV0gPSBvYmplcnI7XG4gICAgICAgICAgICAgIG1hbGZvcm1lZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChwcm9wLmxlbmd0aCA+IGxlbiAmJiBzY2hlbWEuaGFzT3duUHJvcGVydHkoJ2FkZGl0aW9uYWxJdGVtcycpKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHNjaGVtYS5hZGRpdGlvbmFsSXRlbXMgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICBpZiAoIXNjaGVtYS5hZGRpdGlvbmFsSXRlbXMpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsnYWRkaXRpb25hbEl0ZW1zJzogdHJ1ZX07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBmb3IgKGkgPSBsZW4sIGxlbiA9IHByb3AubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBvYmplcnIgPSBjaGVja1ZhbGlkaXR5KGVudiwgc2NoZW1hX3N0YWNrLmNvbmNhdChzY2hlbWEuYWRkaXRpb25hbEl0ZW1zKSwgb2JqZWN0X3N0YWNrLmNvbmNhdCh7b2JqZWN0OiBwcm9wLCBrZXk6IGl9KSwgb3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgaWYgKG9iamVyciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgb2JqZXJyc1tpXSA9IG9iamVycjtcbiAgICAgICAgICAgICAgICAgIG1hbGZvcm1lZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHByb3AubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIG9iamVyciA9IGNoZWNrVmFsaWRpdHkoZW52LCBzY2hlbWFfc3RhY2suY29uY2F0KHNjaGVtYS5pdGVtcyksIG9iamVjdF9zdGFjay5jb25jYXQoe29iamVjdDogcHJvcCwga2V5OiBpfSksIG9wdGlvbnMpO1xuICAgICAgICAgICAgaWYgKG9iamVyciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICBvYmplcnJzW2ldID0gb2JqZXJyO1xuICAgICAgICAgICAgICBtYWxmb3JtZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzY2hlbWEuaGFzT3duUHJvcGVydHkoJ2FkZGl0aW9uYWxJdGVtcycpKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2NoZW1hLmFkZGl0aW9uYWxJdGVtcyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgZm9yIChpID0gMCwgbGVuID0gcHJvcC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgb2JqZXJyID0gY2hlY2tWYWxpZGl0eShlbnYsIHNjaGVtYV9zdGFjay5jb25jYXQoc2NoZW1hLmFkZGl0aW9uYWxJdGVtcyksIG9iamVjdF9zdGFjay5jb25jYXQoe29iamVjdDogcHJvcCwga2V5OiBpfSksIG9wdGlvbnMpO1xuICAgICAgICAgICAgaWYgKG9iamVyciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICBvYmplcnJzW2ldID0gb2JqZXJyO1xuICAgICAgICAgICAgICBtYWxmb3JtZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKG1hbGZvcm1lZClcbiAgICAgICAgcmV0dXJuIHsnc2NoZW1hJzogb2JqZXJyc307XG4gICAgfVxuXG4gICAgZm9yICh2IGluIHNjaGVtYSkge1xuICAgICAgaWYgKHNjaGVtYS5oYXNPd25Qcm9wZXJ0eSh2KSAmJiAhaGFuZGxlZC5oYXNPd25Qcm9wZXJ0eSh2KSkge1xuICAgICAgICBpZiAodiA9PT0gJ2Zvcm1hdCcpIHtcbiAgICAgICAgICBpZiAoZW52LmZpZWxkRm9ybWF0Lmhhc093blByb3BlcnR5KHNjaGVtYVt2XSkgJiYgIWVudi5maWVsZEZvcm1hdFtzY2hlbWFbdl1dKHByb3AsIHNjaGVtYSwgb2JqZWN0X3N0YWNrLCBvcHRpb25zKSkge1xuICAgICAgICAgICAgb2JqZXJyc1t2XSA9IHRydWU7XG4gICAgICAgICAgICBtYWxmb3JtZWQgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoZW52LmZpZWxkVmFsaWRhdGUuaGFzT3duUHJvcGVydHkodikgJiYgIWVudi5maWVsZFZhbGlkYXRlW3ZdKHByb3AsIHNjaGVtYVt2XS5oYXNPd25Qcm9wZXJ0eSgnJGRhdGEnKSA/IHJlc29sdmVPYmplY3RSZWYob2JqZWN0X3N0YWNrLCBzY2hlbWFbdl0uJGRhdGEpIDogc2NoZW1hW3ZdLCBzY2hlbWEsIG9iamVjdF9zdGFjaywgb3B0aW9ucykpIHtcbiAgICAgICAgICAgIG9iamVycnNbdl0gPSB0cnVlO1xuICAgICAgICAgICAgbWFsZm9ybWVkID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobWFsZm9ybWVkKVxuICAgICAgcmV0dXJuIG9iamVycnM7XG4gICAgZWxzZVxuICAgICAgcmV0dXJuIG51bGw7XG4gIH07XG5cbiAgdmFyIGRlZmF1bHRPcHRpb25zID0ge1xuICAgIHVzZURlZmF1bHQ6IGZhbHNlLFxuICAgIHVzZUNvZXJjZTogZmFsc2UsXG4gICAgY2hlY2tSZXF1aXJlZDogdHJ1ZSxcbiAgICByZW1vdmVBZGRpdGlvbmFsOiBmYWxzZVxuICB9O1xuXG4gIGZ1bmN0aW9uIEVudmlyb25tZW50KCkge1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBFbnZpcm9ubWVudCkpXG4gICAgICByZXR1cm4gbmV3IEVudmlyb25tZW50KCk7XG5cbiAgICB0aGlzLmNvZXJjZVR5cGUgPSB7fTtcbiAgICB0aGlzLmZpZWxkVHlwZSA9IGNsb25lKGZpZWxkVHlwZSk7XG4gICAgdGhpcy5maWVsZFZhbGlkYXRlID0gY2xvbmUoZmllbGRWYWxpZGF0ZSk7XG4gICAgdGhpcy5maWVsZEZvcm1hdCA9IGNsb25lKGZpZWxkRm9ybWF0KTtcbiAgICB0aGlzLmRlZmF1bHRPcHRpb25zID0gY2xvbmUoZGVmYXVsdE9wdGlvbnMpO1xuICAgIHRoaXMuc2NoZW1hID0ge307XG4gIH1cblxuICBFbnZpcm9ubWVudC5wcm90b3R5cGUgPSB7XG4gICAgdmFsaWRhdGU6IGZ1bmN0aW9uIChuYW1lLCBvYmplY3QsIG9wdGlvbnMpIHtcbiAgICAgIHZhciBzY2hlbWFfc3RhY2sgPSBbbmFtZV0sIGVycm9ycyA9IG51bGwsIG9iamVjdF9zdGFjayA9IFt7b2JqZWN0OiB7J19fcm9vdF9fJzogb2JqZWN0fSwga2V5OiAnX19yb290X18nfV07XG5cbiAgICAgIGlmICh0eXBlb2YgbmFtZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgc2NoZW1hX3N0YWNrID0gcmVzb2x2ZVVSSSh0aGlzLCBudWxsLCBuYW1lKTtcbiAgICAgICAgaWYgKCFzY2hlbWFfc3RhY2spXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdqanY6IGNvdWxkIG5vdCBmaW5kIHNjaGVtYSBcXCcnICsgbmFtZSArICdcXCcuJyk7XG4gICAgICB9XG5cbiAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICBvcHRpb25zID0gdGhpcy5kZWZhdWx0T3B0aW9ucztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvciAodmFyIHAgaW4gdGhpcy5kZWZhdWx0T3B0aW9ucylcbiAgICAgICAgICBpZiAodGhpcy5kZWZhdWx0T3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShwKSAmJiAhb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShwKSlcbiAgICAgICAgICAgIG9wdGlvbnNbcF0gPSB0aGlzLmRlZmF1bHRPcHRpb25zW3BdO1xuICAgICAgfVxuXG4gICAgICBlcnJvcnMgPSBjaGVja1ZhbGlkaXR5KHRoaXMsIHNjaGVtYV9zdGFjaywgb2JqZWN0X3N0YWNrLCBvcHRpb25zKTtcblxuICAgICAgaWYgKGVycm9ycylcbiAgICAgICAgcmV0dXJuIHt2YWxpZGF0aW9uOiBlcnJvcnMuaGFzT3duUHJvcGVydHkoJ3NjaGVtYScpID8gZXJyb3JzLnNjaGVtYSA6IGVycm9yc307XG4gICAgICBlbHNlXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0sXG5cbiAgICByZXNvbHZlUmVmOiBmdW5jdGlvbiAoc2NoZW1hX3N0YWNrLCAkcmVmKSB7XG4gICAgICByZXR1cm4gcmVzb2x2ZVVSSSh0aGlzLCBzY2hlbWFfc3RhY2ssICRyZWYpO1xuICAgIH0sXG5cbiAgICBhZGRUeXBlOiBmdW5jdGlvbiAobmFtZSwgZnVuYykge1xuICAgICAgdGhpcy5maWVsZFR5cGVbbmFtZV0gPSBmdW5jO1xuICAgIH0sXG5cbiAgICBhZGRUeXBlQ29lcmNpb246IGZ1bmN0aW9uICh0eXBlLCBmdW5jKSB7XG4gICAgICB0aGlzLmNvZXJjZVR5cGVbdHlwZV0gPSBmdW5jO1xuICAgIH0sXG5cbiAgICBhZGRDaGVjazogZnVuY3Rpb24gKG5hbWUsIGZ1bmMpIHtcbiAgICAgIHRoaXMuZmllbGRWYWxpZGF0ZVtuYW1lXSA9IGZ1bmM7XG4gICAgfSxcblxuICAgIGFkZEZvcm1hdDogZnVuY3Rpb24gKG5hbWUsIGZ1bmMpIHtcbiAgICAgIHRoaXMuZmllbGRGb3JtYXRbbmFtZV0gPSBmdW5jO1xuICAgIH0sXG5cbiAgICBhZGRTY2hlbWE6IGZ1bmN0aW9uIChuYW1lLCBzY2hlbWEpIHtcbiAgICAgIGlmICghc2NoZW1hICYmIG5hbWUpIHtcbiAgICAgICAgc2NoZW1hID0gbmFtZTtcbiAgICAgICAgbmFtZSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIGlmIChzY2hlbWEuaGFzT3duUHJvcGVydHkoJ2lkJykgJiYgdHlwZW9mIHNjaGVtYS5pZCA9PT0gJ3N0cmluZycgJiYgc2NoZW1hLmlkICE9PSBuYW1lKSB7XG4gICAgICAgIGlmIChzY2hlbWEuaWQuY2hhckF0KDApID09PSAnLycpXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdqanY6IHNjaGVtYSBpZFxcJ3Mgc3RhcnRpbmcgd2l0aCAvIGFyZSBpbnZhbGlkLicpO1xuICAgICAgICB0aGlzLnNjaGVtYVtub3JtYWxpemVJRChzY2hlbWEuaWQpXSA9IHNjaGVtYTtcbiAgICAgIH0gZWxzZSBpZiAoIW5hbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdqanY6IHNjaGVtYSBuZWVkcyBlaXRoZXIgYSBuYW1lIG9yIGlkIGF0dHJpYnV0ZS4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChuYW1lKVxuICAgICAgICB0aGlzLnNjaGVtYVtub3JtYWxpemVJRChuYW1lKV0gPSBzY2hlbWE7XG4gICAgfVxuICB9O1xuXG4gIC8vIEV4cG9ydCBmb3IgdXNlIGluIHNlcnZlciBhbmQgY2xpZW50LlxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzICE9PSAndW5kZWZpbmVkJylcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEVudmlyb25tZW50O1xuICBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpXG4gICAgZGVmaW5lKGZ1bmN0aW9uICgpIHtyZXR1cm4gRW52aXJvbm1lbnQ7fSk7XG4gIGVsc2VcbiAgICB0aGlzLmpqdiA9IEVudmlyb25tZW50O1xufSkuY2FsbCh0aGlzKTtcbiIsIihmdW5jdGlvbigpIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGZ1bmN0aW9uIG1ha2Uobykge1xuICAgIHZhciBlcnJvcnMgPSBbXTtcblxuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMoby52YWxpZGF0aW9uKTtcblxuICAgIC8vIHdoZW4gd2UncmUgb24gYSBsZWFmIG5vZGUgd2UgbmVlZCB0byBoYW5kbGUgdGhlIHZhbGlkYXRpb24gZXJyb3JzLFxuICAgIC8vIG90aGVyd2lzZSB3ZSBjb250aW51ZSB3YWxraW5nXG4gICAgdmFyIGxlYWYgPSBrZXlzLmV2ZXJ5KGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIHR5cGVvZiBvLnZhbGlkYXRpb25ba2V5XSAhPT0gJ29iamVjdCcgfHxcbiAgICAgICAgaXNBcnJheShvLnZhbGlkYXRpb25ba2V5XSk7XG4gICAgfSk7XG5cbiAgICBpZiAobGVhZikge1xuICAgICAgLy8gc3RlcCB0aHJvdWdoIGVhY2ggdmFsaWRhdGlvbiBpc3N1ZVxuICAgICAgLy8gZXhhbXBsZTogeyByZXF1aXJlZDogdHJ1ZSB9XG4gICAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHZhciBlcnJvciwgcHJvcGVydGllcztcblxuICAgICAgICB0cnkge1xuICAgICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgICBjYXNlICd0eXBlJzpcbiAgICAgICAgICAgICAgdmFyIHR5cGUgPSB0eXBlb2Ygby5kYXRhO1xuXG4gICAgICAgICAgICAgIC8vIGZ1cnRoZXIgZGlzY292ZXIgdHlwZXNcbiAgICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICgnJyArIG8uZGF0YSkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdpbnRlZ2VyJztcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0JyAmJiBBcnJheS5pc0FycmF5KG8uZGF0YSkpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2FycmF5JztcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vIHRoZSB2YWx1ZSBvZiB0eXBlIGlzIHRoZSByZXF1aXJlZCB0eXBlIChleDogeyB0eXBlOiAnc3RyaW5nJyB9KVxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnSU5WQUxJRF9UWVBFJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnSW52YWxpZCB0eXBlOiAnICsgdHlwZSArICcgc2hvdWxkIGJlICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIChpc0FycmF5KG8udmFsaWRhdGlvbltrZXldKSA/ICAnb25lIG9mICcgOiAgJycpICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgby52YWxpZGF0aW9uW2tleV1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3JlcXVpcmVkJzpcbiAgICAgICAgICAgICAgcHJvcGVydGllcyA9IG8ubnM7XG5cbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ09CSkVDVF9SRVFVSVJFRCcsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ01pc3NpbmcgcmVxdWlyZWQgcHJvcGVydHk6ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXNbcHJvcGVydGllcy5sZW5ndGggLSAxXVxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWluaW11bSc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdNSU5JTVVNJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnVmFsdWUgJyArIG8uZGF0YSArICcgaXMgbGVzcyB0aGFuIG1pbmltdW0gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgby5zY2hlbWEubWluaW11bVxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWF4aW11bSc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdNQVhJTVVNJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnVmFsdWUgJyArIG8uZGF0YSArICcgaXMgZ3JlYXRlciB0aGFuIG1heGltdW0gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgby5zY2hlbWEubWF4aW11bVxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbXVsdGlwbGVPZic6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdNVUxUSVBMRV9PRicsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1ZhbHVlICcgKyBvLmRhdGEgKyAnIGlzIG5vdCBhIG11bHRpcGxlIG9mICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm11bHRpcGxlT2ZcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3BhdHRlcm4nOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnUEFUVEVSTicsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1N0cmluZyBkb2VzIG5vdCBtYXRjaCBwYXR0ZXJuOiAnICsgby5zY2hlbWEucGF0dGVyblxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWluTGVuZ3RoJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ01JTl9MRU5HVEgnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTdHJpbmcgaXMgdG9vIHNob3J0ICgnICsgby5kYXRhLmxlbmd0aCArICcgY2hhcnMpLCAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAnbWluaW11bSAnICsgby5zY2hlbWEubWluTGVuZ3RoXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdtYXhMZW5ndGgnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnTUFYX0xFTkdUSCcsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1N0cmluZyBpcyB0b28gbG9uZyAoJyArIG8uZGF0YS5sZW5ndGggKyAnIGNoYXJzKSwgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ21heGltdW0gJyArIG8uc2NoZW1hLm1heExlbmd0aFxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWluSXRlbXMnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnQVJSQVlfTEVOR1RIX1NIT1JUJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXJyYXkgaXMgdG9vIHNob3J0ICgnICsgby5kYXRhLmxlbmd0aCArICcpLCAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAnbWluaW11bSAnICsgby5zY2hlbWEubWluSXRlbXNcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21heEl0ZW1zJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ0FSUkFZX0xFTkdUSF9MT05HJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXJyYXkgaXMgdG9vIGxvbmcgKCcgKyBvLmRhdGEubGVuZ3RoICsgJyksIG1heGltdW0gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgby5zY2hlbWEubWF4SXRlbXNcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3VuaXF1ZUl0ZW1zJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ0FSUkFZX1VOSVFVRScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0FycmF5IGl0ZW1zIGFyZSBub3QgdW5pcXVlJ1xuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWluUHJvcGVydGllcyc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdPQkpFQ1RfUFJPUEVSVElFU19NSU5JTVVNJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnVG9vIGZldyBwcm9wZXJ0aWVzIGRlZmluZWQgKCcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKG8uZGF0YSkubGVuZ3RoICsgJyksIG1pbmltdW0gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgby5zY2hlbWEubWluUHJvcGVydGllc1xuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWF4UHJvcGVydGllcyc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdPQkpFQ1RfUFJPUEVSVElFU19NQVhJTVVNJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnVG9vIG1hbnkgcHJvcGVydGllcyBkZWZpbmVkICgnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyhvLmRhdGEpLmxlbmd0aCArICcpLCBtYXhpbXVtICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm1heFByb3BlcnRpZXNcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2VudW0nOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnRU5VTV9NSVNNQVRDSCcsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ05vIGVudW0gbWF0Y2ggKCcgKyBvLmRhdGEgKyAnKSwgZXhwZWN0czogJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgby5zY2hlbWFbJ2VudW0nXS5qb2luKCcsICcpXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdub3QnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnTk9UX1BBU1NFRCcsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0RhdGEgbWF0Y2hlcyBzY2hlbWEgZnJvbSBcIm5vdFwiJ1xuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnYWRkaXRpb25hbCc6XG4gICAgICAgICAgICAgIHByb3BlcnRpZXMgPSBvLm5zO1xuXG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdBRERJVElPTkFMX1BST1BFUlRJRVMnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBZGRpdGlvbmFsIHByb3BlcnRpZXMgbm90IGFsbG93ZWQ6ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXNbcHJvcGVydGllcy5sZW5ndGggLSAxXVxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgLy8gaWdub3JlIGVycm9yc1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdW5oYW5kbGVkIGVycm9yc1xuICAgICAgICBpZiAoIWVycm9yKSB7XG4gICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICBjb2RlOiAnRkFJTEVEJyxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdWYWxpZGF0aW9uIGVycm9yOiAnICsga2V5XG4gICAgICAgICAgfTtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG8udmFsaWRhdGlvbltrZXldICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICcgKCcgKyBvLnZhbGlkYXRpb25ba2V5XSArICcpJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIC8vIGlnbm9yZSBlcnJvcnNcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBlcnJvci5jb2RlID0gJ1ZBTElEQVRJT05fJyArIGVycm9yLmNvZGU7XG4gICAgICAgIGlmIChvLmRhdGEgIT09IHVuZGVmaW5lZCkgZXJyb3IuZGF0YSA9IG8uZGF0YTtcbiAgICAgICAgZXJyb3IucGF0aCA9IG8ubnM7XG4gICAgICAgIGVycm9ycy5wdXNoKGVycm9yKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBoYW5kbGUgYWxsIG5vbi1sZWFmIGNoaWxkcmVuXG4gICAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHZhciBzO1xuXG4gICAgICAgIGlmIChvLnNjaGVtYS4kcmVmKSB7XG4gICAgICAgICAgaWYgKG8uc2NoZW1hLiRyZWYubWF0Y2goLyNcXC9kZWZpbml0aW9uc1xcLy8pKSB7XG4gICAgICAgICAgICBvLnNjaGVtYSA9IG8uZGVmaW5pdGlvbnNbby5zY2hlbWEuJHJlZi5zbGljZSgxNCldO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBvLnNjaGVtYSA9IG8uc2NoZW1hLiRyZWY7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHR5cGVvZiBvLnNjaGVtYSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIG8uc2NoZW1hID0gby5lbnYucmVzb2x2ZVJlZihudWxsLCBvLnNjaGVtYSk7XG4gICAgICAgICAgICBpZiAoby5zY2hlbWEpIG8uc2NoZW1hID0gby5zY2hlbWFbMF07XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG8uc2NoZW1hICYmIG8uc2NoZW1hLnR5cGUpIHtcbiAgICAgICAgICBpZiAoYWxsb3dzVHlwZShvLnNjaGVtYSwgJ29iamVjdCcpKSB7XG4gICAgICAgICAgICBpZiAoby5zY2hlbWEucHJvcGVydGllcyAmJiBvLnNjaGVtYS5wcm9wZXJ0aWVzW2tleV0pIHtcbiAgICAgICAgICAgICAgcyA9IG8uc2NoZW1hLnByb3BlcnRpZXNba2V5XTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFzICYmIG8uc2NoZW1hLnBhdHRlcm5Qcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKG8uc2NoZW1hLnBhdHRlcm5Qcm9wZXJ0aWVzKS5zb21lKGZ1bmN0aW9uKHBrZXkpIHtcbiAgICAgICAgICAgICAgICBpZiAoa2V5Lm1hdGNoKG5ldyBSZWdFeHAocGtleSkpKSB7XG4gICAgICAgICAgICAgICAgICBzID0gby5zY2hlbWEucGF0dGVyblByb3BlcnRpZXNbcGtleV07XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXMgJiYgby5zY2hlbWEuaGFzT3duUHJvcGVydHkoJ2FkZGl0aW9uYWxQcm9wZXJ0aWVzJykpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiBvLnNjaGVtYS5hZGRpdGlvbmFsUHJvcGVydGllcyA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICAgICAgcyA9IHt9O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHMgPSBvLnNjaGVtYS5hZGRpdGlvbmFsUHJvcGVydGllcztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChhbGxvd3NUeXBlKG8uc2NoZW1hLCAnYXJyYXknKSkge1xuICAgICAgICAgICAgcyA9IG8uc2NoZW1hLml0ZW1zO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvcHRzID0ge1xuICAgICAgICAgIGVudjogby5lbnYsXG4gICAgICAgICAgc2NoZW1hOiBzIHx8IHt9LFxuICAgICAgICAgIG5zOiBvLm5zLmNvbmNhdChrZXkpXG4gICAgICAgIH07XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBvcHRzLmRhdGEgPSBvLmRhdGFba2V5XTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgLy8gaWdub3JlIGVycm9yc1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBvcHRzLnZhbGlkYXRpb24gPSBvLnZhbGlkYXRpb25ba2V5XS5zY2hlbWEgP1xuICAgICAgICAgICAgby52YWxpZGF0aW9uW2tleV0uc2NoZW1hIDpcbiAgICAgICAgICAgIG8udmFsaWRhdGlvbltrZXldO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBvcHRzLnZhbGlkYXRpb24gPSB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgb3B0cy5kZWZpbml0aW9ucyA9IHMuZGVmaW5pdGlvbnMgfHwgby5kZWZpbml0aW9ucztcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgb3B0cy5kZWZpbml0aW9ucyA9IG8uZGVmaW5pdGlvbnM7XG4gICAgICAgIH1cblxuICAgICAgICBlcnJvcnMgPSBlcnJvcnMuY29uY2F0KG1ha2Uob3B0cykpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGVycm9ycztcbiAgfVxuXG4gIGZ1bmN0aW9uIGFsbG93c1R5cGUoc2NoZW1hLCB0eXBlKSB7XG4gICAgaWYgKHR5cGVvZiBzY2hlbWEudHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBzY2hlbWEudHlwZSA9PT0gdHlwZTtcbiAgICB9XG4gICAgaWYgKGlzQXJyYXkoc2NoZW1hLnR5cGUpKSB7XG4gICAgICByZXR1cm4gc2NoZW1hLnR5cGUuaW5kZXhPZih0eXBlKSAhPT0gLTE7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzQXJyYXkob2JqKSB7XG4gICAgaWYgKHR5cGVvZiBBcnJheS5pc0FycmF5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm4gQXJyYXkuaXNBcnJheShvYmopO1xuICAgIH1cbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH1cblxuICBmdW5jdGlvbiBmb3JtYXRQYXRoKG9wdGlvbnMpIHtcbiAgICB2YXIgcm9vdCA9IG9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ3Jvb3QnKSA/XG4gICAgICBvcHRpb25zLnJvb3QgOiAnJCc7XG5cbiAgICB2YXIgc2VwID0gb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eSgnc2VwJykgP1xuICAgICAgb3B0aW9ucy5zZXAgOiAnLic7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgIHZhciBwYXRoID0gcm9vdDtcblxuICAgICAgZXJyb3IucGF0aC5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICBwYXRoICs9IGtleS5tYXRjaCgvXlxcZCskLykgP1xuICAgICAgICAgICdbJyArIGtleSArICddJyA6XG4gICAgICAgICAga2V5Lm1hdGNoKC9eW0EtWl8kXVswLTlBLVpfJF0qJC9pKSA/XG4gICAgICAgICAgICAoc2VwICsga2V5KSA6XG4gICAgICAgICAgICAoJ1snICsgSlNPTi5zdHJpbmdpZnkoa2V5KSArICddJyk7XG4gICAgICB9KTtcblxuICAgICAgZXJyb3IucGF0aCA9IHBhdGg7XG5cbiAgICAgIHJldHVybiBlcnJvcjtcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gamp2ZShlbnYpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gamp2ZShzY2hlbWEsIGRhdGEsIHJlc3VsdCwgb3B0aW9ucykge1xuICAgICAgaWYgKCFyZXN1bHQgfHwgIXJlc3VsdC52YWxpZGF0aW9uKSByZXR1cm4gW107XG5cbiAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICBpZiAodHlwZW9mIHNjaGVtYSA9PT0gJ3N0cmluZycpIHsgc2NoZW1hID0gZW52LnNjaGVtYVtzY2hlbWFdOyB9XG5cbiAgICAgIHZhciBlcnJvcnMgPSBtYWtlKHtcbiAgICAgICAgZW52OiBlbnYsXG4gICAgICAgIHNjaGVtYTogc2NoZW1hLFxuICAgICAgICBkYXRhOiBkYXRhLFxuICAgICAgICB2YWxpZGF0aW9uOiByZXN1bHQudmFsaWRhdGlvbixcbiAgICAgICAgbnM6IFtdLFxuICAgICAgICBkZWZpbml0aW9uczogc2NoZW1hLmRlZmluaXRpb25zIHx8IHt9XG4gICAgICB9KTtcblxuICAgICAgaWYgKGVycm9ycy5sZW5ndGggJiYgb3B0aW9ucy5mb3JtYXRQYXRoICE9PSBmYWxzZSkge1xuICAgICAgICByZXR1cm4gZXJyb3JzLm1hcChmb3JtYXRQYXRoKG9wdGlvbnMpKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGVycm9ycztcbiAgICB9O1xuICB9XG5cbiAgLy8gRXhwb3J0IGZvciB1c2UgaW4gc2VydmVyIGFuZCBjbGllbnQuXG4gIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBqanZlO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShmdW5jdGlvbigpIHsgcmV0dXJuIGpqdmU7IH0pO1xuICB9IGVsc2Uge1xuICAgIHRoaXMuamp2ZSA9IGpqdmU7XG4gIH1cbn0pLmNhbGwodGhpcyk7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VDbG9uZSA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWNsb25lJyksXG4gICAgYmFzZUNyZWF0ZUNhbGxiYWNrID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlY3JlYXRlY2FsbGJhY2snKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgZGVlcCBjbG9uZSBvZiBgdmFsdWVgLiBJZiBhIGNhbGxiYWNrIGlzIHByb3ZpZGVkIGl0IHdpbGwgYmVcbiAqIGV4ZWN1dGVkIHRvIHByb2R1Y2UgdGhlIGNsb25lZCB2YWx1ZXMuIElmIHRoZSBjYWxsYmFjayByZXR1cm5zIGB1bmRlZmluZWRgXG4gKiBjbG9uaW5nIHdpbGwgYmUgaGFuZGxlZCBieSB0aGUgbWV0aG9kIGluc3RlYWQuIFRoZSBjYWxsYmFjayBpcyBib3VuZCB0b1xuICogYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGggb25lIGFyZ3VtZW50OyAodmFsdWUpLlxuICpcbiAqIE5vdGU6IFRoaXMgbWV0aG9kIGlzIGxvb3NlbHkgYmFzZWQgb24gdGhlIHN0cnVjdHVyZWQgY2xvbmUgYWxnb3JpdGhtLiBGdW5jdGlvbnNcbiAqIGFuZCBET00gbm9kZXMgYXJlICoqbm90KiogY2xvbmVkLiBUaGUgZW51bWVyYWJsZSBwcm9wZXJ0aWVzIG9mIGBhcmd1bWVudHNgIG9iamVjdHMgYW5kXG4gKiBvYmplY3RzIGNyZWF0ZWQgYnkgY29uc3RydWN0b3JzIG90aGVyIHRoYW4gYE9iamVjdGAgYXJlIGNsb25lZCB0byBwbGFpbiBgT2JqZWN0YCBvYmplY3RzLlxuICogU2VlIGh0dHA6Ly93d3cudzMub3JnL1RSL2h0bWw1L2luZnJhc3RydWN0dXJlLmh0bWwjaW50ZXJuYWwtc3RydWN0dXJlZC1jbG9uaW5nLWFsZ29yaXRobS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGRlZXAgY2xvbmUuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2FsbGJhY2tdIFRoZSBmdW5jdGlvbiB0byBjdXN0b21pemUgY2xvbmluZyB2YWx1ZXMuXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGNhbGxiYWNrYC5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBkZWVwIGNsb25lZCB2YWx1ZS5cbiAqIEBleGFtcGxlXG4gKlxuICogdmFyIGNoYXJhY3RlcnMgPSBbXG4gKiAgIHsgJ25hbWUnOiAnYmFybmV5JywgJ2FnZSc6IDM2IH0sXG4gKiAgIHsgJ25hbWUnOiAnZnJlZCcsICAgJ2FnZSc6IDQwIH1cbiAqIF07XG4gKlxuICogdmFyIGRlZXAgPSBfLmNsb25lRGVlcChjaGFyYWN0ZXJzKTtcbiAqIGRlZXBbMF0gPT09IGNoYXJhY3RlcnNbMF07XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIHZhciB2aWV3ID0ge1xuICogICAnbGFiZWwnOiAnZG9jcycsXG4gKiAgICdub2RlJzogZWxlbWVudFxuICogfTtcbiAqXG4gKiB2YXIgY2xvbmUgPSBfLmNsb25lRGVlcCh2aWV3LCBmdW5jdGlvbih2YWx1ZSkge1xuICogICByZXR1cm4gXy5pc0VsZW1lbnQodmFsdWUpID8gdmFsdWUuY2xvbmVOb2RlKHRydWUpIDogdW5kZWZpbmVkO1xuICogfSk7XG4gKlxuICogY2xvbmUubm9kZSA9PSB2aWV3Lm5vZGU7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBjbG9uZURlZXAodmFsdWUsIGNhbGxiYWNrLCB0aGlzQXJnKSB7XG4gIHJldHVybiBiYXNlQ2xvbmUodmFsdWUsIHRydWUsIHR5cGVvZiBjYWxsYmFjayA9PSAnZnVuY3Rpb24nICYmIGJhc2VDcmVhdGVDYWxsYmFjayhjYWxsYmFjaywgdGhpc0FyZywgMSkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNsb25lRGVlcDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYXNzaWduID0gcmVxdWlyZSgnbG9kYXNoLmFzc2lnbicpLFxuICAgIGZvckVhY2ggPSByZXF1aXJlKCdsb2Rhc2guZm9yZWFjaCcpLFxuICAgIGZvck93biA9IHJlcXVpcmUoJ2xvZGFzaC5mb3Jvd24nKSxcbiAgICBnZXRBcnJheSA9IHJlcXVpcmUoJ2xvZGFzaC5fZ2V0YXJyYXknKSxcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnbG9kYXNoLmlzYXJyYXknKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJ2xvZGFzaC5pc29iamVjdCcpLFxuICAgIHJlbGVhc2VBcnJheSA9IHJlcXVpcmUoJ2xvZGFzaC5fcmVsZWFzZWFycmF5JyksXG4gICAgc2xpY2UgPSByZXF1aXJlKCdsb2Rhc2guX3NsaWNlJyk7XG5cbi8qKiBVc2VkIHRvIG1hdGNoIHJlZ2V4cCBmbGFncyBmcm9tIHRoZWlyIGNvZXJjZWQgc3RyaW5nIHZhbHVlcyAqL1xudmFyIHJlRmxhZ3MgPSAvXFx3KiQvO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHNob3J0Y3V0cyAqL1xudmFyIGFyZ3NDbGFzcyA9ICdbb2JqZWN0IEFyZ3VtZW50c10nLFxuICAgIGFycmF5Q2xhc3MgPSAnW29iamVjdCBBcnJheV0nLFxuICAgIGJvb2xDbGFzcyA9ICdbb2JqZWN0IEJvb2xlYW5dJyxcbiAgICBkYXRlQ2xhc3MgPSAnW29iamVjdCBEYXRlXScsXG4gICAgZnVuY0NsYXNzID0gJ1tvYmplY3QgRnVuY3Rpb25dJyxcbiAgICBudW1iZXJDbGFzcyA9ICdbb2JqZWN0IE51bWJlcl0nLFxuICAgIG9iamVjdENsYXNzID0gJ1tvYmplY3QgT2JqZWN0XScsXG4gICAgcmVnZXhwQ2xhc3MgPSAnW29iamVjdCBSZWdFeHBdJyxcbiAgICBzdHJpbmdDbGFzcyA9ICdbb2JqZWN0IFN0cmluZ10nO1xuXG4vKiogVXNlZCB0byBpZGVudGlmeSBvYmplY3QgY2xhc3NpZmljYXRpb25zIHRoYXQgYF8uY2xvbmVgIHN1cHBvcnRzICovXG52YXIgY2xvbmVhYmxlQ2xhc3NlcyA9IHt9O1xuY2xvbmVhYmxlQ2xhc3Nlc1tmdW5jQ2xhc3NdID0gZmFsc2U7XG5jbG9uZWFibGVDbGFzc2VzW2FyZ3NDbGFzc10gPSBjbG9uZWFibGVDbGFzc2VzW2FycmF5Q2xhc3NdID1cbmNsb25lYWJsZUNsYXNzZXNbYm9vbENsYXNzXSA9IGNsb25lYWJsZUNsYXNzZXNbZGF0ZUNsYXNzXSA9XG5jbG9uZWFibGVDbGFzc2VzW251bWJlckNsYXNzXSA9IGNsb25lYWJsZUNsYXNzZXNbb2JqZWN0Q2xhc3NdID1cbmNsb25lYWJsZUNsYXNzZXNbcmVnZXhwQ2xhc3NdID0gY2xvbmVhYmxlQ2xhc3Nlc1tzdHJpbmdDbGFzc10gPSB0cnVlO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBbW0NsYXNzXV0gb2YgdmFsdWVzICovXG52YXIgdG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqIFVzZWQgdG8gbG9va3VwIGEgYnVpbHQtaW4gY29uc3RydWN0b3IgYnkgW1tDbGFzc11dICovXG52YXIgY3RvckJ5Q2xhc3MgPSB7fTtcbmN0b3JCeUNsYXNzW2FycmF5Q2xhc3NdID0gQXJyYXk7XG5jdG9yQnlDbGFzc1tib29sQ2xhc3NdID0gQm9vbGVhbjtcbmN0b3JCeUNsYXNzW2RhdGVDbGFzc10gPSBEYXRlO1xuY3RvckJ5Q2xhc3NbZnVuY0NsYXNzXSA9IEZ1bmN0aW9uO1xuY3RvckJ5Q2xhc3Nbb2JqZWN0Q2xhc3NdID0gT2JqZWN0O1xuY3RvckJ5Q2xhc3NbbnVtYmVyQ2xhc3NdID0gTnVtYmVyO1xuY3RvckJ5Q2xhc3NbcmVnZXhwQ2xhc3NdID0gUmVnRXhwO1xuY3RvckJ5Q2xhc3Nbc3RyaW5nQ2xhc3NdID0gU3RyaW5nO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmNsb25lYCB3aXRob3V0IGFyZ3VtZW50IGp1Z2dsaW5nIG9yIHN1cHBvcnRcbiAqIGZvciBgdGhpc0FyZ2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2xvbmUuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtpc0RlZXA9ZmFsc2VdIFNwZWNpZnkgYSBkZWVwIGNsb25lLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrXSBUaGUgZnVuY3Rpb24gdG8gY3VzdG9taXplIGNsb25pbmcgdmFsdWVzLlxuICogQHBhcmFtIHtBcnJheX0gW3N0YWNrQT1bXV0gVHJhY2tzIHRyYXZlcnNlZCBzb3VyY2Ugb2JqZWN0cy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0I9W11dIEFzc29jaWF0ZXMgY2xvbmVzIHdpdGggc291cmNlIGNvdW50ZXJwYXJ0cy5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBjbG9uZWQgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIGJhc2VDbG9uZSh2YWx1ZSwgaXNEZWVwLCBjYWxsYmFjaywgc3RhY2tBLCBzdGFja0IpIHtcbiAgaWYgKGNhbGxiYWNrKSB7XG4gICAgdmFyIHJlc3VsdCA9IGNhbGxiYWNrKHZhbHVlKTtcbiAgICBpZiAodHlwZW9mIHJlc3VsdCAhPSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gIH1cbiAgLy8gaW5zcGVjdCBbW0NsYXNzXV1cbiAgdmFyIGlzT2JqID0gaXNPYmplY3QodmFsdWUpO1xuICBpZiAoaXNPYmopIHtcbiAgICB2YXIgY2xhc3NOYW1lID0gdG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG4gICAgaWYgKCFjbG9uZWFibGVDbGFzc2VzW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gICAgdmFyIGN0b3IgPSBjdG9yQnlDbGFzc1tjbGFzc05hbWVdO1xuICAgIHN3aXRjaCAoY2xhc3NOYW1lKSB7XG4gICAgICBjYXNlIGJvb2xDbGFzczpcbiAgICAgIGNhc2UgZGF0ZUNsYXNzOlxuICAgICAgICByZXR1cm4gbmV3IGN0b3IoK3ZhbHVlKTtcblxuICAgICAgY2FzZSBudW1iZXJDbGFzczpcbiAgICAgIGNhc2Ugc3RyaW5nQ2xhc3M6XG4gICAgICAgIHJldHVybiBuZXcgY3Rvcih2YWx1ZSk7XG5cbiAgICAgIGNhc2UgcmVnZXhwQ2xhc3M6XG4gICAgICAgIHJlc3VsdCA9IGN0b3IodmFsdWUuc291cmNlLCByZUZsYWdzLmV4ZWModmFsdWUpKTtcbiAgICAgICAgcmVzdWx0Lmxhc3RJbmRleCA9IHZhbHVlLmxhc3RJbmRleDtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHZhciBpc0FyciA9IGlzQXJyYXkodmFsdWUpO1xuICBpZiAoaXNEZWVwKSB7XG4gICAgLy8gY2hlY2sgZm9yIGNpcmN1bGFyIHJlZmVyZW5jZXMgYW5kIHJldHVybiBjb3JyZXNwb25kaW5nIGNsb25lXG4gICAgdmFyIGluaXRlZFN0YWNrID0gIXN0YWNrQTtcbiAgICBzdGFja0EgfHwgKHN0YWNrQSA9IGdldEFycmF5KCkpO1xuICAgIHN0YWNrQiB8fCAoc3RhY2tCID0gZ2V0QXJyYXkoKSk7XG5cbiAgICB2YXIgbGVuZ3RoID0gc3RhY2tBLmxlbmd0aDtcbiAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgIGlmIChzdGFja0FbbGVuZ3RoXSA9PSB2YWx1ZSkge1xuICAgICAgICByZXR1cm4gc3RhY2tCW2xlbmd0aF07XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdCA9IGlzQXJyID8gY3Rvcih2YWx1ZS5sZW5ndGgpIDoge307XG4gIH1cbiAgZWxzZSB7XG4gICAgcmVzdWx0ID0gaXNBcnIgPyBzbGljZSh2YWx1ZSkgOiBhc3NpZ24oe30sIHZhbHVlKTtcbiAgfVxuICAvLyBhZGQgYXJyYXkgcHJvcGVydGllcyBhc3NpZ25lZCBieSBgUmVnRXhwI2V4ZWNgXG4gIGlmIChpc0Fycikge1xuICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCAnaW5kZXgnKSkge1xuICAgICAgcmVzdWx0LmluZGV4ID0gdmFsdWUuaW5kZXg7XG4gICAgfVxuICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCAnaW5wdXQnKSkge1xuICAgICAgcmVzdWx0LmlucHV0ID0gdmFsdWUuaW5wdXQ7XG4gICAgfVxuICB9XG4gIC8vIGV4aXQgZm9yIHNoYWxsb3cgY2xvbmVcbiAgaWYgKCFpc0RlZXApIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIC8vIGFkZCB0aGUgc291cmNlIHZhbHVlIHRvIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0c1xuICAvLyBhbmQgYXNzb2NpYXRlIGl0IHdpdGggaXRzIGNsb25lXG4gIHN0YWNrQS5wdXNoKHZhbHVlKTtcbiAgc3RhY2tCLnB1c2gocmVzdWx0KTtcblxuICAvLyByZWN1cnNpdmVseSBwb3B1bGF0ZSBjbG9uZSAoc3VzY2VwdGlibGUgdG8gY2FsbCBzdGFjayBsaW1pdHMpXG4gIChpc0FyciA/IGZvckVhY2ggOiBmb3JPd24pKHZhbHVlLCBmdW5jdGlvbihvYmpWYWx1ZSwga2V5KSB7XG4gICAgcmVzdWx0W2tleV0gPSBiYXNlQ2xvbmUob2JqVmFsdWUsIGlzRGVlcCwgY2FsbGJhY2ssIHN0YWNrQSwgc3RhY2tCKTtcbiAgfSk7XG5cbiAgaWYgKGluaXRlZFN0YWNrKSB7XG4gICAgcmVsZWFzZUFycmF5KHN0YWNrQSk7XG4gICAgcmVsZWFzZUFycmF5KHN0YWNrQik7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlQ2xvbmU7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGFycmF5UG9vbCA9IHJlcXVpcmUoJ2xvZGFzaC5fYXJyYXlwb29sJyk7XG5cbi8qKlxuICogR2V0cyBhbiBhcnJheSBmcm9tIHRoZSBhcnJheSBwb29sIG9yIGNyZWF0ZXMgYSBuZXcgb25lIGlmIHRoZSBwb29sIGlzIGVtcHR5LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcmV0dXJucyB7QXJyYXl9IFRoZSBhcnJheSBmcm9tIHRoZSBwb29sLlxuICovXG5mdW5jdGlvbiBnZXRBcnJheSgpIHtcbiAgcmV0dXJuIGFycmF5UG9vbC5wb3AoKSB8fCBbXTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBnZXRBcnJheTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBVc2VkIHRvIHBvb2wgYXJyYXlzIGFuZCBvYmplY3RzIHVzZWQgaW50ZXJuYWxseSAqL1xudmFyIGFycmF5UG9vbCA9IFtdO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGFycmF5UG9vbDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYXJyYXlQb29sID0gcmVxdWlyZSgnbG9kYXNoLl9hcnJheXBvb2wnKSxcbiAgICBtYXhQb29sU2l6ZSA9IHJlcXVpcmUoJ2xvZGFzaC5fbWF4cG9vbHNpemUnKTtcblxuLyoqXG4gKiBSZWxlYXNlcyB0aGUgZ2l2ZW4gYXJyYXkgYmFjayB0byB0aGUgYXJyYXkgcG9vbC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gW2FycmF5XSBUaGUgYXJyYXkgdG8gcmVsZWFzZS5cbiAqL1xuZnVuY3Rpb24gcmVsZWFzZUFycmF5KGFycmF5KSB7XG4gIGFycmF5Lmxlbmd0aCA9IDA7XG4gIGlmIChhcnJheVBvb2wubGVuZ3RoIDwgbWF4UG9vbFNpemUpIHtcbiAgICBhcnJheVBvb2wucHVzaChhcnJheSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSByZWxlYXNlQXJyYXk7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogVXNlZCBhcyB0aGUgbWF4IHNpemUgb2YgdGhlIGBhcnJheVBvb2xgIGFuZCBgb2JqZWN0UG9vbGAgKi9cbnZhciBtYXhQb29sU2l6ZSA9IDQwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IG1heFBvb2xTaXplO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBTbGljZXMgdGhlIGBjb2xsZWN0aW9uYCBmcm9tIHRoZSBgc3RhcnRgIGluZGV4IHVwIHRvLCBidXQgbm90IGluY2x1ZGluZyxcbiAqIHRoZSBgZW5kYCBpbmRleC5cbiAqXG4gKiBOb3RlOiBUaGlzIGZ1bmN0aW9uIGlzIHVzZWQgaW5zdGVhZCBvZiBgQXJyYXkjc2xpY2VgIHRvIHN1cHBvcnQgbm9kZSBsaXN0c1xuICogaW4gSUUgPCA5IGFuZCB0byBlbnN1cmUgZGVuc2UgYXJyYXlzIGFyZSByZXR1cm5lZC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheXxPYmplY3R8c3RyaW5nfSBjb2xsZWN0aW9uIFRoZSBjb2xsZWN0aW9uIHRvIHNsaWNlLlxuICogQHBhcmFtIHtudW1iZXJ9IHN0YXJ0IFRoZSBzdGFydCBpbmRleC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBlbmQgVGhlIGVuZCBpbmRleC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgbmV3IGFycmF5LlxuICovXG5mdW5jdGlvbiBzbGljZShhcnJheSwgc3RhcnQsIGVuZCkge1xuICBzdGFydCB8fCAoc3RhcnQgPSAwKTtcbiAgaWYgKHR5cGVvZiBlbmQgPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBlbmQgPSBhcnJheSA/IGFycmF5Lmxlbmd0aCA6IDA7XG4gIH1cbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBlbmQgLSBzdGFydCB8fCAwLFxuICAgICAgcmVzdWx0ID0gQXJyYXkobGVuZ3RoIDwgMCA/IDAgOiBsZW5ndGgpO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgcmVzdWx0W2luZGV4XSA9IGFycmF5W3N0YXJ0ICsgaW5kZXhdO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gc2xpY2U7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VDcmVhdGVDYWxsYmFjayA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWNyZWF0ZWNhbGxiYWNrJyksXG4gICAga2V5cyA9IHJlcXVpcmUoJ2xvZGFzaC5rZXlzJyksXG4gICAgb2JqZWN0VHlwZXMgPSByZXF1aXJlKCdsb2Rhc2guX29iamVjdHR5cGVzJyk7XG5cbi8qKlxuICogQXNzaWducyBvd24gZW51bWVyYWJsZSBwcm9wZXJ0aWVzIG9mIHNvdXJjZSBvYmplY3QocykgdG8gdGhlIGRlc3RpbmF0aW9uXG4gKiBvYmplY3QuIFN1YnNlcXVlbnQgc291cmNlcyB3aWxsIG92ZXJ3cml0ZSBwcm9wZXJ0eSBhc3NpZ25tZW50cyBvZiBwcmV2aW91c1xuICogc291cmNlcy4gSWYgYSBjYWxsYmFjayBpcyBwcm92aWRlZCBpdCB3aWxsIGJlIGV4ZWN1dGVkIHRvIHByb2R1Y2UgdGhlXG4gKiBhc3NpZ25lZCB2YWx1ZXMuIFRoZSBjYWxsYmFjayBpcyBib3VuZCB0byBgdGhpc0FyZ2AgYW5kIGludm9rZWQgd2l0aCB0d29cbiAqIGFyZ3VtZW50czsgKG9iamVjdFZhbHVlLCBzb3VyY2VWYWx1ZSkuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEB0eXBlIEZ1bmN0aW9uXG4gKiBAYWxpYXMgZXh0ZW5kXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgZGVzdGluYXRpb24gb2JqZWN0LlxuICogQHBhcmFtIHsuLi5PYmplY3R9IFtzb3VyY2VdIFRoZSBzb3VyY2Ugb2JqZWN0cy5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFja10gVGhlIGZ1bmN0aW9uIHRvIGN1c3RvbWl6ZSBhc3NpZ25pbmcgdmFsdWVzLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBjYWxsYmFja2AuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIHRoZSBkZXN0aW5hdGlvbiBvYmplY3QuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uYXNzaWduKHsgJ25hbWUnOiAnZnJlZCcgfSwgeyAnZW1wbG95ZXInOiAnc2xhdGUnIH0pO1xuICogLy8gPT4geyAnbmFtZSc6ICdmcmVkJywgJ2VtcGxveWVyJzogJ3NsYXRlJyB9XG4gKlxuICogdmFyIGRlZmF1bHRzID0gXy5wYXJ0aWFsUmlnaHQoXy5hc3NpZ24sIGZ1bmN0aW9uKGEsIGIpIHtcbiAqICAgcmV0dXJuIHR5cGVvZiBhID09ICd1bmRlZmluZWQnID8gYiA6IGE7XG4gKiB9KTtcbiAqXG4gKiB2YXIgb2JqZWN0ID0geyAnbmFtZSc6ICdiYXJuZXknIH07XG4gKiBkZWZhdWx0cyhvYmplY3QsIHsgJ25hbWUnOiAnZnJlZCcsICdlbXBsb3llcic6ICdzbGF0ZScgfSk7XG4gKiAvLyA9PiB7ICduYW1lJzogJ2Jhcm5leScsICdlbXBsb3llcic6ICdzbGF0ZScgfVxuICovXG52YXIgYXNzaWduID0gZnVuY3Rpb24ob2JqZWN0LCBzb3VyY2UsIGd1YXJkKSB7XG4gIHZhciBpbmRleCwgaXRlcmFibGUgPSBvYmplY3QsIHJlc3VsdCA9IGl0ZXJhYmxlO1xuICBpZiAoIWl0ZXJhYmxlKSByZXR1cm4gcmVzdWx0O1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cyxcbiAgICAgIGFyZ3NJbmRleCA9IDAsXG4gICAgICBhcmdzTGVuZ3RoID0gdHlwZW9mIGd1YXJkID09ICdudW1iZXInID8gMiA6IGFyZ3MubGVuZ3RoO1xuICBpZiAoYXJnc0xlbmd0aCA+IDMgJiYgdHlwZW9mIGFyZ3NbYXJnc0xlbmd0aCAtIDJdID09ICdmdW5jdGlvbicpIHtcbiAgICB2YXIgY2FsbGJhY2sgPSBiYXNlQ3JlYXRlQ2FsbGJhY2soYXJnc1stLWFyZ3NMZW5ndGggLSAxXSwgYXJnc1thcmdzTGVuZ3RoLS1dLCAyKTtcbiAgfSBlbHNlIGlmIChhcmdzTGVuZ3RoID4gMiAmJiB0eXBlb2YgYXJnc1thcmdzTGVuZ3RoIC0gMV0gPT0gJ2Z1bmN0aW9uJykge1xuICAgIGNhbGxiYWNrID0gYXJnc1stLWFyZ3NMZW5ndGhdO1xuICB9XG4gIHdoaWxlICgrK2FyZ3NJbmRleCA8IGFyZ3NMZW5ndGgpIHtcbiAgICBpdGVyYWJsZSA9IGFyZ3NbYXJnc0luZGV4XTtcbiAgICBpZiAoaXRlcmFibGUgJiYgb2JqZWN0VHlwZXNbdHlwZW9mIGl0ZXJhYmxlXSkge1xuICAgIHZhciBvd25JbmRleCA9IC0xLFxuICAgICAgICBvd25Qcm9wcyA9IG9iamVjdFR5cGVzW3R5cGVvZiBpdGVyYWJsZV0gJiYga2V5cyhpdGVyYWJsZSksXG4gICAgICAgIGxlbmd0aCA9IG93blByb3BzID8gb3duUHJvcHMubGVuZ3RoIDogMDtcblxuICAgIHdoaWxlICgrK293bkluZGV4IDwgbGVuZ3RoKSB7XG4gICAgICBpbmRleCA9IG93blByb3BzW293bkluZGV4XTtcbiAgICAgIHJlc3VsdFtpbmRleF0gPSBjYWxsYmFjayA/IGNhbGxiYWNrKHJlc3VsdFtpbmRleF0sIGl0ZXJhYmxlW2luZGV4XSkgOiBpdGVyYWJsZVtpbmRleF07XG4gICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGFzc2lnbjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBVc2VkIHRvIGRldGVybWluZSBpZiB2YWx1ZXMgYXJlIG9mIHRoZSBsYW5ndWFnZSB0eXBlIE9iamVjdCAqL1xudmFyIG9iamVjdFR5cGVzID0ge1xuICAnYm9vbGVhbic6IGZhbHNlLFxuICAnZnVuY3Rpb24nOiB0cnVlLFxuICAnb2JqZWN0JzogdHJ1ZSxcbiAgJ251bWJlcic6IGZhbHNlLFxuICAnc3RyaW5nJzogZmFsc2UsXG4gICd1bmRlZmluZWQnOiBmYWxzZVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBvYmplY3RUeXBlcztcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgaXNOYXRpdmUgPSByZXF1aXJlKCdsb2Rhc2guX2lzbmF0aXZlJyksXG4gICAgaXNPYmplY3QgPSByZXF1aXJlKCdsb2Rhc2guaXNvYmplY3QnKSxcbiAgICBzaGltS2V5cyA9IHJlcXVpcmUoJ2xvZGFzaC5fc2hpbWtleXMnKTtcblxuLyogTmF0aXZlIG1ldGhvZCBzaG9ydGN1dHMgZm9yIG1ldGhvZHMgd2l0aCB0aGUgc2FtZSBuYW1lIGFzIG90aGVyIGBsb2Rhc2hgIG1ldGhvZHMgKi9cbnZhciBuYXRpdmVLZXlzID0gaXNOYXRpdmUobmF0aXZlS2V5cyA9IE9iamVjdC5rZXlzKSAmJiBuYXRpdmVLZXlzO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gYXJyYXkgY29tcG9zZWQgb2YgdGhlIG93biBlbnVtZXJhYmxlIHByb3BlcnR5IG5hbWVzIG9mIGFuIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpbnNwZWN0LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIGFuIGFycmF5IG9mIHByb3BlcnR5IG5hbWVzLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmtleXMoeyAnb25lJzogMSwgJ3R3byc6IDIsICd0aHJlZSc6IDMgfSk7XG4gKiAvLyA9PiBbJ29uZScsICd0d28nLCAndGhyZWUnXSAocHJvcGVydHkgb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQgYWNyb3NzIGVudmlyb25tZW50cylcbiAqL1xudmFyIGtleXMgPSAhbmF0aXZlS2V5cyA/IHNoaW1LZXlzIDogZnVuY3Rpb24ob2JqZWN0KSB7XG4gIGlmICghaXNPYmplY3Qob2JqZWN0KSkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICByZXR1cm4gbmF0aXZlS2V5cyhvYmplY3QpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBrZXlzO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgaW50ZXJuYWwgW1tDbGFzc11dIG9mIHZhbHVlcyAqL1xudmFyIHRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBpZiBhIG1ldGhvZCBpcyBuYXRpdmUgKi9cbnZhciByZU5hdGl2ZSA9IFJlZ0V4cCgnXicgK1xuICBTdHJpbmcodG9TdHJpbmcpXG4gICAgLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCAnXFxcXCQmJylcbiAgICAucmVwbGFjZSgvdG9TdHJpbmd8IGZvciBbXlxcXV0rL2csICcuKj8nKSArICckJ1xuKTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIG5hdGl2ZSBmdW5jdGlvbi5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGB2YWx1ZWAgaXMgYSBuYXRpdmUgZnVuY3Rpb24sIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNOYXRpdmUodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAnZnVuY3Rpb24nICYmIHJlTmF0aXZlLnRlc3QodmFsdWUpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzTmF0aXZlO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBvYmplY3RUeXBlcyA9IHJlcXVpcmUoJ2xvZGFzaC5fb2JqZWN0dHlwZXMnKTtcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBBIGZhbGxiYWNrIGltcGxlbWVudGF0aW9uIG9mIGBPYmplY3Qua2V5c2Agd2hpY2ggcHJvZHVjZXMgYW4gYXJyYXkgb2YgdGhlXG4gKiBnaXZlbiBvYmplY3QncyBvd24gZW51bWVyYWJsZSBwcm9wZXJ0eSBuYW1lcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHR5cGUgRnVuY3Rpb25cbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpbnNwZWN0LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIGFuIGFycmF5IG9mIHByb3BlcnR5IG5hbWVzLlxuICovXG52YXIgc2hpbUtleXMgPSBmdW5jdGlvbihvYmplY3QpIHtcbiAgdmFyIGluZGV4LCBpdGVyYWJsZSA9IG9iamVjdCwgcmVzdWx0ID0gW107XG4gIGlmICghaXRlcmFibGUpIHJldHVybiByZXN1bHQ7XG4gIGlmICghKG9iamVjdFR5cGVzW3R5cGVvZiBvYmplY3RdKSkgcmV0dXJuIHJlc3VsdDtcbiAgICBmb3IgKGluZGV4IGluIGl0ZXJhYmxlKSB7XG4gICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChpdGVyYWJsZSwgaW5kZXgpKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKGluZGV4KTtcbiAgICAgIH1cbiAgICB9XG4gIHJldHVybiByZXN1bHRcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gc2hpbUtleXM7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VDcmVhdGVDYWxsYmFjayA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWNyZWF0ZWNhbGxiYWNrJyksXG4gICAga2V5cyA9IHJlcXVpcmUoJ2xvZGFzaC5rZXlzJyksXG4gICAgb2JqZWN0VHlwZXMgPSByZXF1aXJlKCdsb2Rhc2guX29iamVjdHR5cGVzJyk7XG5cbi8qKlxuICogSXRlcmF0ZXMgb3ZlciBvd24gZW51bWVyYWJsZSBwcm9wZXJ0aWVzIG9mIGFuIG9iamVjdCwgZXhlY3V0aW5nIHRoZSBjYWxsYmFja1xuICogZm9yIGVhY2ggcHJvcGVydHkuIFRoZSBjYWxsYmFjayBpcyBib3VuZCB0byBgdGhpc0FyZ2AgYW5kIGludm9rZWQgd2l0aCB0aHJlZVxuICogYXJndW1lbnRzOyAodmFsdWUsIGtleSwgb2JqZWN0KS4gQ2FsbGJhY2tzIG1heSBleGl0IGl0ZXJhdGlvbiBlYXJseSBieVxuICogZXhwbGljaXRseSByZXR1cm5pbmcgYGZhbHNlYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHR5cGUgRnVuY3Rpb25cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrPWlkZW50aXR5XSBUaGUgZnVuY3Rpb24gY2FsbGVkIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGNhbGxiYWNrYC5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgYG9iamVjdGAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uZm9yT3duKHsgJzAnOiAnemVybycsICcxJzogJ29uZScsICdsZW5ndGgnOiAyIH0sIGZ1bmN0aW9uKG51bSwga2V5KSB7XG4gKiAgIGNvbnNvbGUubG9nKGtleSk7XG4gKiB9KTtcbiAqIC8vID0+IGxvZ3MgJzAnLCAnMScsIGFuZCAnbGVuZ3RoJyAocHJvcGVydHkgb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQgYWNyb3NzIGVudmlyb25tZW50cylcbiAqL1xudmFyIGZvck93biA9IGZ1bmN0aW9uKGNvbGxlY3Rpb24sIGNhbGxiYWNrLCB0aGlzQXJnKSB7XG4gIHZhciBpbmRleCwgaXRlcmFibGUgPSBjb2xsZWN0aW9uLCByZXN1bHQgPSBpdGVyYWJsZTtcbiAgaWYgKCFpdGVyYWJsZSkgcmV0dXJuIHJlc3VsdDtcbiAgaWYgKCFvYmplY3RUeXBlc1t0eXBlb2YgaXRlcmFibGVdKSByZXR1cm4gcmVzdWx0O1xuICBjYWxsYmFjayA9IGNhbGxiYWNrICYmIHR5cGVvZiB0aGlzQXJnID09ICd1bmRlZmluZWQnID8gY2FsbGJhY2sgOiBiYXNlQ3JlYXRlQ2FsbGJhY2soY2FsbGJhY2ssIHRoaXNBcmcsIDMpO1xuICAgIHZhciBvd25JbmRleCA9IC0xLFxuICAgICAgICBvd25Qcm9wcyA9IG9iamVjdFR5cGVzW3R5cGVvZiBpdGVyYWJsZV0gJiYga2V5cyhpdGVyYWJsZSksXG4gICAgICAgIGxlbmd0aCA9IG93blByb3BzID8gb3duUHJvcHMubGVuZ3RoIDogMDtcblxuICAgIHdoaWxlICgrK293bkluZGV4IDwgbGVuZ3RoKSB7XG4gICAgICBpbmRleCA9IG93blByb3BzW293bkluZGV4XTtcbiAgICAgIGlmIChjYWxsYmFjayhpdGVyYWJsZVtpbmRleF0sIGluZGV4LCBjb2xsZWN0aW9uKSA9PT0gZmFsc2UpIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICByZXR1cm4gcmVzdWx0XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZvck93bjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgb2JqZWN0VHlwZXMgPSByZXF1aXJlKCdsb2Rhc2guX29iamVjdHR5cGVzJyk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgdGhlIGxhbmd1YWdlIHR5cGUgb2YgT2JqZWN0LlxuICogKGUuZy4gYXJyYXlzLCBmdW5jdGlvbnMsIG9iamVjdHMsIHJlZ2V4ZXMsIGBuZXcgTnVtYmVyKDApYCwgYW5kIGBuZXcgU3RyaW5nKCcnKWApXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYHZhbHVlYCBpcyBhbiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc09iamVjdCh7fSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoMSk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xuICAvLyBjaGVjayBpZiB0aGUgdmFsdWUgaXMgdGhlIEVDTUFTY3JpcHQgbGFuZ3VhZ2UgdHlwZSBvZiBPYmplY3RcbiAgLy8gaHR0cDovL2VzNS5naXRodWIuaW8vI3g4XG4gIC8vIGFuZCBhdm9pZCBhIFY4IGJ1Z1xuICAvLyBodHRwOi8vY29kZS5nb29nbGUuY29tL3AvdjgvaXNzdWVzL2RldGFpbD9pZD0yMjkxXG4gIHJldHVybiAhISh2YWx1ZSAmJiBvYmplY3RUeXBlc1t0eXBlb2YgdmFsdWVdKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc09iamVjdDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmluZCA9IHJlcXVpcmUoJ2xvZGFzaC5iaW5kJyksXG4gICAgaWRlbnRpdHkgPSByZXF1aXJlKCdsb2Rhc2guaWRlbnRpdHknKSxcbiAgICBzZXRCaW5kRGF0YSA9IHJlcXVpcmUoJ2xvZGFzaC5fc2V0YmluZGRhdGEnKSxcbiAgICBzdXBwb3J0ID0gcmVxdWlyZSgnbG9kYXNoLnN1cHBvcnQnKTtcblxuLyoqIFVzZWQgdG8gZGV0ZWN0ZWQgbmFtZWQgZnVuY3Rpb25zICovXG52YXIgcmVGdW5jTmFtZSA9IC9eXFxzKmZ1bmN0aW9uWyBcXG5cXHJcXHRdK1xcdy87XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBmdW5jdGlvbnMgY29udGFpbmluZyBhIGB0aGlzYCByZWZlcmVuY2UgKi9cbnZhciByZVRoaXMgPSAvXFxidGhpc1xcYi87XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyAqL1xudmFyIGZuVG9TdHJpbmcgPSBGdW5jdGlvbi5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uY3JlYXRlQ2FsbGJhY2tgIHdpdGhvdXQgc3VwcG9ydCBmb3IgY3JlYXRpbmdcbiAqIFwiXy5wbHVja1wiIG9yIFwiXy53aGVyZVwiIHN0eWxlIGNhbGxiYWNrcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSBbZnVuYz1pZGVudGl0eV0gVGhlIHZhbHVlIHRvIGNvbnZlcnQgdG8gYSBjYWxsYmFjay5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiB0aGUgY3JlYXRlZCBjYWxsYmFjay5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbYXJnQ291bnRdIFRoZSBudW1iZXIgb2YgYXJndW1lbnRzIHRoZSBjYWxsYmFjayBhY2NlcHRzLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIGEgY2FsbGJhY2sgZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGJhc2VDcmVhdGVDYWxsYmFjayhmdW5jLCB0aGlzQXJnLCBhcmdDb3VudCkge1xuICBpZiAodHlwZW9mIGZ1bmMgIT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBpZGVudGl0eTtcbiAgfVxuICAvLyBleGl0IGVhcmx5IGZvciBubyBgdGhpc0FyZ2Agb3IgYWxyZWFkeSBib3VuZCBieSBgRnVuY3Rpb24jYmluZGBcbiAgaWYgKHR5cGVvZiB0aGlzQXJnID09ICd1bmRlZmluZWQnIHx8ICEoJ3Byb3RvdHlwZScgaW4gZnVuYykpIHtcbiAgICByZXR1cm4gZnVuYztcbiAgfVxuICB2YXIgYmluZERhdGEgPSBmdW5jLl9fYmluZERhdGFfXztcbiAgaWYgKHR5cGVvZiBiaW5kRGF0YSA9PSAndW5kZWZpbmVkJykge1xuICAgIGlmIChzdXBwb3J0LmZ1bmNOYW1lcykge1xuICAgICAgYmluZERhdGEgPSAhZnVuYy5uYW1lO1xuICAgIH1cbiAgICBiaW5kRGF0YSA9IGJpbmREYXRhIHx8ICFzdXBwb3J0LmZ1bmNEZWNvbXA7XG4gICAgaWYgKCFiaW5kRGF0YSkge1xuICAgICAgdmFyIHNvdXJjZSA9IGZuVG9TdHJpbmcuY2FsbChmdW5jKTtcbiAgICAgIGlmICghc3VwcG9ydC5mdW5jTmFtZXMpIHtcbiAgICAgICAgYmluZERhdGEgPSAhcmVGdW5jTmFtZS50ZXN0KHNvdXJjZSk7XG4gICAgICB9XG4gICAgICBpZiAoIWJpbmREYXRhKSB7XG4gICAgICAgIC8vIGNoZWNrcyBpZiBgZnVuY2AgcmVmZXJlbmNlcyB0aGUgYHRoaXNgIGtleXdvcmQgYW5kIHN0b3JlcyB0aGUgcmVzdWx0XG4gICAgICAgIGJpbmREYXRhID0gcmVUaGlzLnRlc3Qoc291cmNlKTtcbiAgICAgICAgc2V0QmluZERhdGEoZnVuYywgYmluZERhdGEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICAvLyBleGl0IGVhcmx5IGlmIHRoZXJlIGFyZSBubyBgdGhpc2AgcmVmZXJlbmNlcyBvciBgZnVuY2AgaXMgYm91bmRcbiAgaWYgKGJpbmREYXRhID09PSBmYWxzZSB8fCAoYmluZERhdGEgIT09IHRydWUgJiYgYmluZERhdGFbMV0gJiAxKSkge1xuICAgIHJldHVybiBmdW5jO1xuICB9XG4gIHN3aXRjaCAoYXJnQ291bnQpIHtcbiAgICBjYXNlIDE6IHJldHVybiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgcmV0dXJuIGZ1bmMuY2FsbCh0aGlzQXJnLCB2YWx1ZSk7XG4gICAgfTtcbiAgICBjYXNlIDI6IHJldHVybiBmdW5jdGlvbihhLCBiKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIGEsIGIpO1xuICAgIH07XG4gICAgY2FzZSAzOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgfTtcbiAgICBjYXNlIDQ6IHJldHVybiBmdW5jdGlvbihhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICByZXR1cm4gZnVuYy5jYWxsKHRoaXNBcmcsIGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgIH07XG4gIH1cbiAgcmV0dXJuIGJpbmQoZnVuYywgdGhpc0FyZyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUNyZWF0ZUNhbGxiYWNrO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJ2xvZGFzaC5faXNuYXRpdmUnKSxcbiAgICBub29wID0gcmVxdWlyZSgnbG9kYXNoLm5vb3AnKTtcblxuLyoqIFVzZWQgYXMgdGhlIHByb3BlcnR5IGRlc2NyaXB0b3IgZm9yIGBfX2JpbmREYXRhX19gICovXG52YXIgZGVzY3JpcHRvciA9IHtcbiAgJ2NvbmZpZ3VyYWJsZSc6IGZhbHNlLFxuICAnZW51bWVyYWJsZSc6IGZhbHNlLFxuICAndmFsdWUnOiBudWxsLFxuICAnd3JpdGFibGUnOiBmYWxzZVxufTtcblxuLyoqIFVzZWQgdG8gc2V0IG1ldGEgZGF0YSBvbiBmdW5jdGlvbnMgKi9cbnZhciBkZWZpbmVQcm9wZXJ0eSA9IChmdW5jdGlvbigpIHtcbiAgLy8gSUUgOCBvbmx5IGFjY2VwdHMgRE9NIGVsZW1lbnRzXG4gIHRyeSB7XG4gICAgdmFyIG8gPSB7fSxcbiAgICAgICAgZnVuYyA9IGlzTmF0aXZlKGZ1bmMgPSBPYmplY3QuZGVmaW5lUHJvcGVydHkpICYmIGZ1bmMsXG4gICAgICAgIHJlc3VsdCA9IGZ1bmMobywgbywgbykgJiYgZnVuYztcbiAgfSBjYXRjaChlKSB7IH1cbiAgcmV0dXJuIHJlc3VsdDtcbn0oKSk7XG5cbi8qKlxuICogU2V0cyBgdGhpc2AgYmluZGluZyBkYXRhIG9uIGEgZ2l2ZW4gZnVuY3Rpb24uXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHNldCBkYXRhIG9uLlxuICogQHBhcmFtIHtBcnJheX0gdmFsdWUgVGhlIGRhdGEgYXJyYXkgdG8gc2V0LlxuICovXG52YXIgc2V0QmluZERhdGEgPSAhZGVmaW5lUHJvcGVydHkgPyBub29wIDogZnVuY3Rpb24oZnVuYywgdmFsdWUpIHtcbiAgZGVzY3JpcHRvci52YWx1ZSA9IHZhbHVlO1xuICBkZWZpbmVQcm9wZXJ0eShmdW5jLCAnX19iaW5kRGF0YV9fJywgZGVzY3JpcHRvcik7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHNldEJpbmREYXRhO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBBIG5vLW9wZXJhdGlvbiBmdW5jdGlvbi5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IFV0aWxpdGllc1xuICogQGV4YW1wbGVcbiAqXG4gKiB2YXIgb2JqZWN0ID0geyAnbmFtZSc6ICdmcmVkJyB9O1xuICogXy5ub29wKG9iamVjdCkgPT09IHVuZGVmaW5lZDtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gbm9vcCgpIHtcbiAgLy8gbm8gb3BlcmF0aW9uIHBlcmZvcm1lZFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG5vb3A7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGNyZWF0ZVdyYXBwZXIgPSByZXF1aXJlKCdsb2Rhc2guX2NyZWF0ZXdyYXBwZXInKSxcbiAgICBzbGljZSA9IHJlcXVpcmUoJ2xvZGFzaC5fc2xpY2UnKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgZnVuY3Rpb24gdGhhdCwgd2hlbiBjYWxsZWQsIGludm9rZXMgYGZ1bmNgIHdpdGggdGhlIGB0aGlzYFxuICogYmluZGluZyBvZiBgdGhpc0FyZ2AgYW5kIHByZXBlbmRzIGFueSBhZGRpdGlvbmFsIGBiaW5kYCBhcmd1bWVudHMgdG8gdGhvc2VcbiAqIHByb3ZpZGVkIHRvIHRoZSBib3VuZCBmdW5jdGlvbi5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IEZ1bmN0aW9uc1xuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gYmluZC5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgZnVuY2AuXG4gKiBAcGFyYW0gey4uLip9IFthcmddIEFyZ3VtZW50cyB0byBiZSBwYXJ0aWFsbHkgYXBwbGllZC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGJvdW5kIGZ1bmN0aW9uLlxuICogQGV4YW1wbGVcbiAqXG4gKiB2YXIgZnVuYyA9IGZ1bmN0aW9uKGdyZWV0aW5nKSB7XG4gKiAgIHJldHVybiBncmVldGluZyArICcgJyArIHRoaXMubmFtZTtcbiAqIH07XG4gKlxuICogZnVuYyA9IF8uYmluZChmdW5jLCB7ICduYW1lJzogJ2ZyZWQnIH0sICdoaScpO1xuICogZnVuYygpO1xuICogLy8gPT4gJ2hpIGZyZWQnXG4gKi9cbmZ1bmN0aW9uIGJpbmQoZnVuYywgdGhpc0FyZykge1xuICByZXR1cm4gYXJndW1lbnRzLmxlbmd0aCA+IDJcbiAgICA/IGNyZWF0ZVdyYXBwZXIoZnVuYywgMTcsIHNsaWNlKGFyZ3VtZW50cywgMiksIG51bGwsIHRoaXNBcmcpXG4gICAgOiBjcmVhdGVXcmFwcGVyKGZ1bmMsIDEsIG51bGwsIG51bGwsIHRoaXNBcmcpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJpbmQ7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VCaW5kID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlYmluZCcpLFxuICAgIGJhc2VDcmVhdGVXcmFwcGVyID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlY3JlYXRld3JhcHBlcicpLFxuICAgIGlzRnVuY3Rpb24gPSByZXF1aXJlKCdsb2Rhc2guaXNmdW5jdGlvbicpLFxuICAgIHNsaWNlID0gcmVxdWlyZSgnbG9kYXNoLl9zbGljZScpO1xuXG4vKipcbiAqIFVzZWQgZm9yIGBBcnJheWAgbWV0aG9kIHJlZmVyZW5jZXMuXG4gKlxuICogTm9ybWFsbHkgYEFycmF5LnByb3RvdHlwZWAgd291bGQgc3VmZmljZSwgaG93ZXZlciwgdXNpbmcgYW4gYXJyYXkgbGl0ZXJhbFxuICogYXZvaWRzIGlzc3VlcyBpbiBOYXJ3aGFsLlxuICovXG52YXIgYXJyYXlSZWYgPSBbXTtcblxuLyoqIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzICovXG52YXIgcHVzaCA9IGFycmF5UmVmLnB1c2gsXG4gICAgdW5zaGlmdCA9IGFycmF5UmVmLnVuc2hpZnQ7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGZ1bmN0aW9uIHRoYXQsIHdoZW4gY2FsbGVkLCBlaXRoZXIgY3VycmllcyBvciBpbnZva2VzIGBmdW5jYFxuICogd2l0aCBhbiBvcHRpb25hbCBgdGhpc2AgYmluZGluZyBhbmQgcGFydGlhbGx5IGFwcGxpZWQgYXJndW1lbnRzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufHN0cmluZ30gZnVuYyBUaGUgZnVuY3Rpb24gb3IgbWV0aG9kIG5hbWUgdG8gcmVmZXJlbmNlLlxuICogQHBhcmFtIHtudW1iZXJ9IGJpdG1hc2sgVGhlIGJpdG1hc2sgb2YgbWV0aG9kIGZsYWdzIHRvIGNvbXBvc2UuXG4gKiAgVGhlIGJpdG1hc2sgbWF5IGJlIGNvbXBvc2VkIG9mIHRoZSBmb2xsb3dpbmcgZmxhZ3M6XG4gKiAgMSAtIGBfLmJpbmRgXG4gKiAgMiAtIGBfLmJpbmRLZXlgXG4gKiAgNCAtIGBfLmN1cnJ5YFxuICogIDggLSBgXy5jdXJyeWAgKGJvdW5kKVxuICogIDE2IC0gYF8ucGFydGlhbGBcbiAqICAzMiAtIGBfLnBhcnRpYWxSaWdodGBcbiAqIEBwYXJhbSB7QXJyYXl9IFtwYXJ0aWFsQXJnc10gQW4gYXJyYXkgb2YgYXJndW1lbnRzIHRvIHByZXBlbmQgdG8gdGhvc2VcbiAqICBwcm92aWRlZCB0byB0aGUgbmV3IGZ1bmN0aW9uLlxuICogQHBhcmFtIHtBcnJheX0gW3BhcnRpYWxSaWdodEFyZ3NdIEFuIGFycmF5IG9mIGFyZ3VtZW50cyB0byBhcHBlbmQgdG8gdGhvc2VcbiAqICBwcm92aWRlZCB0byB0aGUgbmV3IGZ1bmN0aW9uLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBmdW5jYC5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbYXJpdHldIFRoZSBhcml0eSBvZiBgZnVuY2AuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlV3JhcHBlcihmdW5jLCBiaXRtYXNrLCBwYXJ0aWFsQXJncywgcGFydGlhbFJpZ2h0QXJncywgdGhpc0FyZywgYXJpdHkpIHtcbiAgdmFyIGlzQmluZCA9IGJpdG1hc2sgJiAxLFxuICAgICAgaXNCaW5kS2V5ID0gYml0bWFzayAmIDIsXG4gICAgICBpc0N1cnJ5ID0gYml0bWFzayAmIDQsXG4gICAgICBpc0N1cnJ5Qm91bmQgPSBiaXRtYXNrICYgOCxcbiAgICAgIGlzUGFydGlhbCA9IGJpdG1hc2sgJiAxNixcbiAgICAgIGlzUGFydGlhbFJpZ2h0ID0gYml0bWFzayAmIDMyO1xuXG4gIGlmICghaXNCaW5kS2V5ICYmICFpc0Z1bmN0aW9uKGZ1bmMpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcjtcbiAgfVxuICBpZiAoaXNQYXJ0aWFsICYmICFwYXJ0aWFsQXJncy5sZW5ndGgpIHtcbiAgICBiaXRtYXNrICY9IH4xNjtcbiAgICBpc1BhcnRpYWwgPSBwYXJ0aWFsQXJncyA9IGZhbHNlO1xuICB9XG4gIGlmIChpc1BhcnRpYWxSaWdodCAmJiAhcGFydGlhbFJpZ2h0QXJncy5sZW5ndGgpIHtcbiAgICBiaXRtYXNrICY9IH4zMjtcbiAgICBpc1BhcnRpYWxSaWdodCA9IHBhcnRpYWxSaWdodEFyZ3MgPSBmYWxzZTtcbiAgfVxuICB2YXIgYmluZERhdGEgPSBmdW5jICYmIGZ1bmMuX19iaW5kRGF0YV9fO1xuICBpZiAoYmluZERhdGEgJiYgYmluZERhdGEgIT09IHRydWUpIHtcbiAgICAvLyBjbG9uZSBgYmluZERhdGFgXG4gICAgYmluZERhdGEgPSBzbGljZShiaW5kRGF0YSk7XG4gICAgaWYgKGJpbmREYXRhWzJdKSB7XG4gICAgICBiaW5kRGF0YVsyXSA9IHNsaWNlKGJpbmREYXRhWzJdKTtcbiAgICB9XG4gICAgaWYgKGJpbmREYXRhWzNdKSB7XG4gICAgICBiaW5kRGF0YVszXSA9IHNsaWNlKGJpbmREYXRhWzNdKTtcbiAgICB9XG4gICAgLy8gc2V0IGB0aGlzQmluZGluZ2AgaXMgbm90IHByZXZpb3VzbHkgYm91bmRcbiAgICBpZiAoaXNCaW5kICYmICEoYmluZERhdGFbMV0gJiAxKSkge1xuICAgICAgYmluZERhdGFbNF0gPSB0aGlzQXJnO1xuICAgIH1cbiAgICAvLyBzZXQgaWYgcHJldmlvdXNseSBib3VuZCBidXQgbm90IGN1cnJlbnRseSAoc3Vic2VxdWVudCBjdXJyaWVkIGZ1bmN0aW9ucylcbiAgICBpZiAoIWlzQmluZCAmJiBiaW5kRGF0YVsxXSAmIDEpIHtcbiAgICAgIGJpdG1hc2sgfD0gODtcbiAgICB9XG4gICAgLy8gc2V0IGN1cnJpZWQgYXJpdHkgaWYgbm90IHlldCBzZXRcbiAgICBpZiAoaXNDdXJyeSAmJiAhKGJpbmREYXRhWzFdICYgNCkpIHtcbiAgICAgIGJpbmREYXRhWzVdID0gYXJpdHk7XG4gICAgfVxuICAgIC8vIGFwcGVuZCBwYXJ0aWFsIGxlZnQgYXJndW1lbnRzXG4gICAgaWYgKGlzUGFydGlhbCkge1xuICAgICAgcHVzaC5hcHBseShiaW5kRGF0YVsyXSB8fCAoYmluZERhdGFbMl0gPSBbXSksIHBhcnRpYWxBcmdzKTtcbiAgICB9XG4gICAgLy8gYXBwZW5kIHBhcnRpYWwgcmlnaHQgYXJndW1lbnRzXG4gICAgaWYgKGlzUGFydGlhbFJpZ2h0KSB7XG4gICAgICB1bnNoaWZ0LmFwcGx5KGJpbmREYXRhWzNdIHx8IChiaW5kRGF0YVszXSA9IFtdKSwgcGFydGlhbFJpZ2h0QXJncyk7XG4gICAgfVxuICAgIC8vIG1lcmdlIGZsYWdzXG4gICAgYmluZERhdGFbMV0gfD0gYml0bWFzaztcbiAgICByZXR1cm4gY3JlYXRlV3JhcHBlci5hcHBseShudWxsLCBiaW5kRGF0YSk7XG4gIH1cbiAgLy8gZmFzdCBwYXRoIGZvciBgXy5iaW5kYFxuICB2YXIgY3JlYXRlciA9IChiaXRtYXNrID09IDEgfHwgYml0bWFzayA9PT0gMTcpID8gYmFzZUJpbmQgOiBiYXNlQ3JlYXRlV3JhcHBlcjtcbiAgcmV0dXJuIGNyZWF0ZXIoW2Z1bmMsIGJpdG1hc2ssIHBhcnRpYWxBcmdzLCBwYXJ0aWFsUmlnaHRBcmdzLCB0aGlzQXJnLCBhcml0eV0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVdyYXBwZXI7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VDcmVhdGUgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2VjcmVhdGUnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJ2xvZGFzaC5pc29iamVjdCcpLFxuICAgIHNldEJpbmREYXRhID0gcmVxdWlyZSgnbG9kYXNoLl9zZXRiaW5kZGF0YScpLFxuICAgIHNsaWNlID0gcmVxdWlyZSgnbG9kYXNoLl9zbGljZScpO1xuXG4vKipcbiAqIFVzZWQgZm9yIGBBcnJheWAgbWV0aG9kIHJlZmVyZW5jZXMuXG4gKlxuICogTm9ybWFsbHkgYEFycmF5LnByb3RvdHlwZWAgd291bGQgc3VmZmljZSwgaG93ZXZlciwgdXNpbmcgYW4gYXJyYXkgbGl0ZXJhbFxuICogYXZvaWRzIGlzc3VlcyBpbiBOYXJ3aGFsLlxuICovXG52YXIgYXJyYXlSZWYgPSBbXTtcblxuLyoqIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzICovXG52YXIgcHVzaCA9IGFycmF5UmVmLnB1c2g7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8uYmluZGAgdGhhdCBjcmVhdGVzIHRoZSBib3VuZCBmdW5jdGlvbiBhbmRcbiAqIHNldHMgaXRzIG1ldGEgZGF0YS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYmluZERhdGEgVGhlIGJpbmQgZGF0YSBhcnJheS5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGJvdW5kIGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBiYXNlQmluZChiaW5kRGF0YSkge1xuICB2YXIgZnVuYyA9IGJpbmREYXRhWzBdLFxuICAgICAgcGFydGlhbEFyZ3MgPSBiaW5kRGF0YVsyXSxcbiAgICAgIHRoaXNBcmcgPSBiaW5kRGF0YVs0XTtcblxuICBmdW5jdGlvbiBib3VuZCgpIHtcbiAgICAvLyBgRnVuY3Rpb24jYmluZGAgc3BlY1xuICAgIC8vIGh0dHA6Ly9lczUuZ2l0aHViLmlvLyN4MTUuMy40LjVcbiAgICBpZiAocGFydGlhbEFyZ3MpIHtcbiAgICAgIC8vIGF2b2lkIGBhcmd1bWVudHNgIG9iamVjdCBkZW9wdGltaXphdGlvbnMgYnkgdXNpbmcgYHNsaWNlYCBpbnN0ZWFkXG4gICAgICAvLyBvZiBgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGxgIGFuZCBub3QgYXNzaWduaW5nIGBhcmd1bWVudHNgIHRvIGFcbiAgICAgIC8vIHZhcmlhYmxlIGFzIGEgdGVybmFyeSBleHByZXNzaW9uXG4gICAgICB2YXIgYXJncyA9IHNsaWNlKHBhcnRpYWxBcmdzKTtcbiAgICAgIHB1c2guYXBwbHkoYXJncywgYXJndW1lbnRzKTtcbiAgICB9XG4gICAgLy8gbWltaWMgdGhlIGNvbnN0cnVjdG9yJ3MgYHJldHVybmAgYmVoYXZpb3JcbiAgICAvLyBodHRwOi8vZXM1LmdpdGh1Yi5pby8jeDEzLjIuMlxuICAgIGlmICh0aGlzIGluc3RhbmNlb2YgYm91bmQpIHtcbiAgICAgIC8vIGVuc3VyZSBgbmV3IGJvdW5kYCBpcyBhbiBpbnN0YW5jZSBvZiBgZnVuY2BcbiAgICAgIHZhciB0aGlzQmluZGluZyA9IGJhc2VDcmVhdGUoZnVuYy5wcm90b3R5cGUpLFxuICAgICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkodGhpc0JpbmRpbmcsIGFyZ3MgfHwgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBpc09iamVjdChyZXN1bHQpID8gcmVzdWx0IDogdGhpc0JpbmRpbmc7XG4gICAgfVxuICAgIHJldHVybiBmdW5jLmFwcGx5KHRoaXNBcmcsIGFyZ3MgfHwgYXJndW1lbnRzKTtcbiAgfVxuICBzZXRCaW5kRGF0YShib3VuZCwgYmluZERhdGEpO1xuICByZXR1cm4gYm91bmQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUJpbmQ7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGlzTmF0aXZlID0gcmVxdWlyZSgnbG9kYXNoLl9pc25hdGl2ZScpLFxuICAgIGlzT2JqZWN0ID0gcmVxdWlyZSgnbG9kYXNoLmlzb2JqZWN0JyksXG4gICAgbm9vcCA9IHJlcXVpcmUoJ2xvZGFzaC5ub29wJyk7XG5cbi8qIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzIGZvciBtZXRob2RzIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzICovXG52YXIgbmF0aXZlQ3JlYXRlID0gaXNOYXRpdmUobmF0aXZlQ3JlYXRlID0gT2JqZWN0LmNyZWF0ZSkgJiYgbmF0aXZlQ3JlYXRlO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmNyZWF0ZWAgd2l0aG91dCBzdXBwb3J0IGZvciBhc3NpZ25pbmdcbiAqIHByb3BlcnRpZXMgdG8gdGhlIGNyZWF0ZWQgb2JqZWN0LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gcHJvdG90eXBlIFRoZSBvYmplY3QgdG8gaW5oZXJpdCBmcm9tLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyB0aGUgbmV3IG9iamVjdC5cbiAqL1xuZnVuY3Rpb24gYmFzZUNyZWF0ZShwcm90b3R5cGUsIHByb3BlcnRpZXMpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KHByb3RvdHlwZSkgPyBuYXRpdmVDcmVhdGUocHJvdG90eXBlKSA6IHt9O1xufVxuLy8gZmFsbGJhY2sgZm9yIGJyb3dzZXJzIHdpdGhvdXQgYE9iamVjdC5jcmVhdGVgXG5pZiAoIW5hdGl2ZUNyZWF0ZSkge1xuICBiYXNlQ3JlYXRlID0gKGZ1bmN0aW9uKCkge1xuICAgIGZ1bmN0aW9uIE9iamVjdCgpIHt9XG4gICAgcmV0dXJuIGZ1bmN0aW9uKHByb3RvdHlwZSkge1xuICAgICAgaWYgKGlzT2JqZWN0KHByb3RvdHlwZSkpIHtcbiAgICAgICAgT2JqZWN0LnByb3RvdHlwZSA9IHByb3RvdHlwZTtcbiAgICAgICAgdmFyIHJlc3VsdCA9IG5ldyBPYmplY3Q7XG4gICAgICAgIE9iamVjdC5wcm90b3R5cGUgPSBudWxsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdCB8fCBnbG9iYWwuT2JqZWN0KCk7XG4gICAgfTtcbiAgfSgpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlQ3JlYXRlO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VDcmVhdGUgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2VjcmVhdGUnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJ2xvZGFzaC5pc29iamVjdCcpLFxuICAgIHNldEJpbmREYXRhID0gcmVxdWlyZSgnbG9kYXNoLl9zZXRiaW5kZGF0YScpLFxuICAgIHNsaWNlID0gcmVxdWlyZSgnbG9kYXNoLl9zbGljZScpO1xuXG4vKipcbiAqIFVzZWQgZm9yIGBBcnJheWAgbWV0aG9kIHJlZmVyZW5jZXMuXG4gKlxuICogTm9ybWFsbHkgYEFycmF5LnByb3RvdHlwZWAgd291bGQgc3VmZmljZSwgaG93ZXZlciwgdXNpbmcgYW4gYXJyYXkgbGl0ZXJhbFxuICogYXZvaWRzIGlzc3VlcyBpbiBOYXJ3aGFsLlxuICovXG52YXIgYXJyYXlSZWYgPSBbXTtcblxuLyoqIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzICovXG52YXIgcHVzaCA9IGFycmF5UmVmLnB1c2g7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYGNyZWF0ZVdyYXBwZXJgIHRoYXQgY3JlYXRlcyB0aGUgd3JhcHBlciBhbmRcbiAqIHNldHMgaXRzIG1ldGEgZGF0YS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYmluZERhdGEgVGhlIGJpbmQgZGF0YSBhcnJheS5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBiYXNlQ3JlYXRlV3JhcHBlcihiaW5kRGF0YSkge1xuICB2YXIgZnVuYyA9IGJpbmREYXRhWzBdLFxuICAgICAgYml0bWFzayA9IGJpbmREYXRhWzFdLFxuICAgICAgcGFydGlhbEFyZ3MgPSBiaW5kRGF0YVsyXSxcbiAgICAgIHBhcnRpYWxSaWdodEFyZ3MgPSBiaW5kRGF0YVszXSxcbiAgICAgIHRoaXNBcmcgPSBiaW5kRGF0YVs0XSxcbiAgICAgIGFyaXR5ID0gYmluZERhdGFbNV07XG5cbiAgdmFyIGlzQmluZCA9IGJpdG1hc2sgJiAxLFxuICAgICAgaXNCaW5kS2V5ID0gYml0bWFzayAmIDIsXG4gICAgICBpc0N1cnJ5ID0gYml0bWFzayAmIDQsXG4gICAgICBpc0N1cnJ5Qm91bmQgPSBiaXRtYXNrICYgOCxcbiAgICAgIGtleSA9IGZ1bmM7XG5cbiAgZnVuY3Rpb24gYm91bmQoKSB7XG4gICAgdmFyIHRoaXNCaW5kaW5nID0gaXNCaW5kID8gdGhpc0FyZyA6IHRoaXM7XG4gICAgaWYgKHBhcnRpYWxBcmdzKSB7XG4gICAgICB2YXIgYXJncyA9IHNsaWNlKHBhcnRpYWxBcmdzKTtcbiAgICAgIHB1c2guYXBwbHkoYXJncywgYXJndW1lbnRzKTtcbiAgICB9XG4gICAgaWYgKHBhcnRpYWxSaWdodEFyZ3MgfHwgaXNDdXJyeSkge1xuICAgICAgYXJncyB8fCAoYXJncyA9IHNsaWNlKGFyZ3VtZW50cykpO1xuICAgICAgaWYgKHBhcnRpYWxSaWdodEFyZ3MpIHtcbiAgICAgICAgcHVzaC5hcHBseShhcmdzLCBwYXJ0aWFsUmlnaHRBcmdzKTtcbiAgICAgIH1cbiAgICAgIGlmIChpc0N1cnJ5ICYmIGFyZ3MubGVuZ3RoIDwgYXJpdHkpIHtcbiAgICAgICAgYml0bWFzayB8PSAxNiAmIH4zMjtcbiAgICAgICAgcmV0dXJuIGJhc2VDcmVhdGVXcmFwcGVyKFtmdW5jLCAoaXNDdXJyeUJvdW5kID8gYml0bWFzayA6IGJpdG1hc2sgJiB+MyksIGFyZ3MsIG51bGwsIHRoaXNBcmcsIGFyaXR5XSk7XG4gICAgICB9XG4gICAgfVxuICAgIGFyZ3MgfHwgKGFyZ3MgPSBhcmd1bWVudHMpO1xuICAgIGlmIChpc0JpbmRLZXkpIHtcbiAgICAgIGZ1bmMgPSB0aGlzQmluZGluZ1trZXldO1xuICAgIH1cbiAgICBpZiAodGhpcyBpbnN0YW5jZW9mIGJvdW5kKSB7XG4gICAgICB0aGlzQmluZGluZyA9IGJhc2VDcmVhdGUoZnVuYy5wcm90b3R5cGUpO1xuICAgICAgdmFyIHJlc3VsdCA9IGZ1bmMuYXBwbHkodGhpc0JpbmRpbmcsIGFyZ3MpO1xuICAgICAgcmV0dXJuIGlzT2JqZWN0KHJlc3VsdCkgPyByZXN1bHQgOiB0aGlzQmluZGluZztcbiAgICB9XG4gICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpc0JpbmRpbmcsIGFyZ3MpO1xuICB9XG4gIHNldEJpbmREYXRhKGJvdW5kLCBiaW5kRGF0YSk7XG4gIHJldHVybiBib3VuZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlQ3JlYXRlV3JhcHBlcjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKlxuICogVGhpcyBtZXRob2QgcmV0dXJucyB0aGUgZmlyc3QgYXJndW1lbnQgcHJvdmlkZWQgdG8gaXQuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBVdGlsaXRpZXNcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgQW55IHZhbHVlLlxuICogQHJldHVybnMgeyp9IFJldHVybnMgYHZhbHVlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogdmFyIG9iamVjdCA9IHsgJ25hbWUnOiAnZnJlZCcgfTtcbiAqIF8uaWRlbnRpdHkob2JqZWN0KSA9PT0gb2JqZWN0O1xuICogLy8gPT4gdHJ1ZVxuICovXG5mdW5jdGlvbiBpZGVudGl0eSh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaWRlbnRpdHk7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGlzTmF0aXZlID0gcmVxdWlyZSgnbG9kYXNoLl9pc25hdGl2ZScpO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgZnVuY3Rpb25zIGNvbnRhaW5pbmcgYSBgdGhpc2AgcmVmZXJlbmNlICovXG52YXIgcmVUaGlzID0gL1xcYnRoaXNcXGIvO1xuXG4vKipcbiAqIEFuIG9iamVjdCB1c2VkIHRvIGZsYWcgZW52aXJvbm1lbnRzIGZlYXR1cmVzLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAdHlwZSBPYmplY3RcbiAqL1xudmFyIHN1cHBvcnQgPSB7fTtcblxuLyoqXG4gKiBEZXRlY3QgaWYgZnVuY3Rpb25zIGNhbiBiZSBkZWNvbXBpbGVkIGJ5IGBGdW5jdGlvbiN0b1N0cmluZ2BcbiAqIChhbGwgYnV0IFBTMyBhbmQgb2xkZXIgT3BlcmEgbW9iaWxlIGJyb3dzZXJzICYgYXZvaWRlZCBpbiBXaW5kb3dzIDggYXBwcykuXG4gKlxuICogQG1lbWJlck9mIF8uc3VwcG9ydFxuICogQHR5cGUgYm9vbGVhblxuICovXG5zdXBwb3J0LmZ1bmNEZWNvbXAgPSAhaXNOYXRpdmUoZ2xvYmFsLldpblJURXJyb3IpICYmIHJlVGhpcy50ZXN0KGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpczsgfSk7XG5cbi8qKlxuICogRGV0ZWN0IGlmIGBGdW5jdGlvbiNuYW1lYCBpcyBzdXBwb3J0ZWQgKGFsbCBidXQgSUUpLlxuICpcbiAqIEBtZW1iZXJPZiBfLnN1cHBvcnRcbiAqIEB0eXBlIGJvb2xlYW5cbiAqL1xuc3VwcG9ydC5mdW5jTmFtZXMgPSB0eXBlb2YgRnVuY3Rpb24ubmFtZSA9PSAnc3RyaW5nJztcblxubW9kdWxlLmV4cG9ydHMgPSBzdXBwb3J0O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VEaWZmZXJlbmNlID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlZGlmZmVyZW5jZScpLFxuICAgIGJhc2VGbGF0dGVuID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlZmxhdHRlbicpO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gYXJyYXkgZXhjbHVkaW5nIGFsbCB2YWx1ZXMgb2YgdGhlIHByb3ZpZGVkIGFycmF5cyB1c2luZyBzdHJpY3RcbiAqIGVxdWFsaXR5IGZvciBjb21wYXJpc29ucywgaS5lLiBgPT09YC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IEFycmF5c1xuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIHByb2Nlc3MuXG4gKiBAcGFyYW0gey4uLkFycmF5fSBbdmFsdWVzXSBUaGUgYXJyYXlzIG9mIHZhbHVlcyB0byBleGNsdWRlLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIGEgbmV3IGFycmF5IG9mIGZpbHRlcmVkIHZhbHVlcy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5kaWZmZXJlbmNlKFsxLCAyLCAzLCA0LCA1XSwgWzUsIDIsIDEwXSk7XG4gKiAvLyA9PiBbMSwgMywgNF1cbiAqL1xuZnVuY3Rpb24gZGlmZmVyZW5jZShhcnJheSkge1xuICByZXR1cm4gYmFzZURpZmZlcmVuY2UoYXJyYXksIGJhc2VGbGF0dGVuKGFyZ3VtZW50cywgdHJ1ZSwgdHJ1ZSwgMSkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRpZmZlcmVuY2U7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VJbmRleE9mID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlaW5kZXhvZicpLFxuICAgIGNhY2hlSW5kZXhPZiA9IHJlcXVpcmUoJ2xvZGFzaC5fY2FjaGVpbmRleG9mJyksXG4gICAgY3JlYXRlQ2FjaGUgPSByZXF1aXJlKCdsb2Rhc2guX2NyZWF0ZWNhY2hlJyksXG4gICAgbGFyZ2VBcnJheVNpemUgPSByZXF1aXJlKCdsb2Rhc2guX2xhcmdlYXJyYXlzaXplJyksXG4gICAgcmVsZWFzZU9iamVjdCA9IHJlcXVpcmUoJ2xvZGFzaC5fcmVsZWFzZW9iamVjdCcpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmRpZmZlcmVuY2VgIHRoYXQgYWNjZXB0cyBhIHNpbmdsZSBhcnJheVxuICogb2YgdmFsdWVzIHRvIGV4Y2x1ZGUuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBwcm9jZXNzLlxuICogQHBhcmFtIHtBcnJheX0gW3ZhbHVlc10gVGhlIGFycmF5IG9mIHZhbHVlcyB0byBleGNsdWRlLlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIGEgbmV3IGFycmF5IG9mIGZpbHRlcmVkIHZhbHVlcy5cbiAqL1xuZnVuY3Rpb24gYmFzZURpZmZlcmVuY2UoYXJyYXksIHZhbHVlcykge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGluZGV4T2YgPSBiYXNlSW5kZXhPZixcbiAgICAgIGxlbmd0aCA9IGFycmF5ID8gYXJyYXkubGVuZ3RoIDogMCxcbiAgICAgIGlzTGFyZ2UgPSBsZW5ndGggPj0gbGFyZ2VBcnJheVNpemUsXG4gICAgICByZXN1bHQgPSBbXTtcblxuICBpZiAoaXNMYXJnZSkge1xuICAgIHZhciBjYWNoZSA9IGNyZWF0ZUNhY2hlKHZhbHVlcyk7XG4gICAgaWYgKGNhY2hlKSB7XG4gICAgICBpbmRleE9mID0gY2FjaGVJbmRleE9mO1xuICAgICAgdmFsdWVzID0gY2FjaGU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlzTGFyZ2UgPSBmYWxzZTtcbiAgICB9XG4gIH1cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICB2YXIgdmFsdWUgPSBhcnJheVtpbmRleF07XG4gICAgaWYgKGluZGV4T2YodmFsdWVzLCB2YWx1ZSkgPCAwKSB7XG4gICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgfVxuICB9XG4gIGlmIChpc0xhcmdlKSB7XG4gICAgcmVsZWFzZU9iamVjdCh2YWx1ZXMpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZURpZmZlcmVuY2U7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmluZGV4T2ZgIHdpdGhvdXQgc3VwcG9ydCBmb3IgYmluYXJ5IHNlYXJjaGVzXG4gKiBvciBgZnJvbUluZGV4YCBjb25zdHJhaW50cy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIHNlYXJjaC5cbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHNlYXJjaCBmb3IuXG4gKiBAcGFyYW0ge251bWJlcn0gW2Zyb21JbmRleD0wXSBUaGUgaW5kZXggdG8gc2VhcmNoIGZyb20uXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbWF0Y2hlZCB2YWx1ZSBvciBgLTFgLlxuICovXG5mdW5jdGlvbiBiYXNlSW5kZXhPZihhcnJheSwgdmFsdWUsIGZyb21JbmRleCkge1xuICB2YXIgaW5kZXggPSAoZnJvbUluZGV4IHx8IDApIC0gMSxcbiAgICAgIGxlbmd0aCA9IGFycmF5ID8gYXJyYXkubGVuZ3RoIDogMDtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIGlmIChhcnJheVtpbmRleF0gPT09IHZhbHVlKSB7XG4gICAgICByZXR1cm4gaW5kZXg7XG4gICAgfVxuICB9XG4gIHJldHVybiAtMTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlSW5kZXhPZjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUluZGV4T2YgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2VpbmRleG9mJyksXG4gICAga2V5UHJlZml4ID0gcmVxdWlyZSgnbG9kYXNoLl9rZXlwcmVmaXgnKTtcblxuLyoqXG4gKiBBbiBpbXBsZW1lbnRhdGlvbiBvZiBgXy5jb250YWluc2AgZm9yIGNhY2hlIG9iamVjdHMgdGhhdCBtaW1pY3MgdGhlIHJldHVyblxuICogc2lnbmF0dXJlIG9mIGBfLmluZGV4T2ZgIGJ5IHJldHVybmluZyBgMGAgaWYgdGhlIHZhbHVlIGlzIGZvdW5kLCBlbHNlIGAtMWAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBjYWNoZSBUaGUgY2FjaGUgb2JqZWN0IHRvIGluc3BlY3QuXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBzZWFyY2ggZm9yLlxuICogQHJldHVybnMge251bWJlcn0gUmV0dXJucyBgMGAgaWYgYHZhbHVlYCBpcyBmb3VuZCwgZWxzZSBgLTFgLlxuICovXG5mdW5jdGlvbiBjYWNoZUluZGV4T2YoY2FjaGUsIHZhbHVlKSB7XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICBjYWNoZSA9IGNhY2hlLmNhY2hlO1xuXG4gIGlmICh0eXBlID09ICdib29sZWFuJyB8fCB2YWx1ZSA9PSBudWxsKSB7XG4gICAgcmV0dXJuIGNhY2hlW3ZhbHVlXSA/IDAgOiAtMTtcbiAgfVxuICBpZiAodHlwZSAhPSAnbnVtYmVyJyAmJiB0eXBlICE9ICdzdHJpbmcnKSB7XG4gICAgdHlwZSA9ICdvYmplY3QnO1xuICB9XG4gIHZhciBrZXkgPSB0eXBlID09ICdudW1iZXInID8gdmFsdWUgOiBrZXlQcmVmaXggKyB2YWx1ZTtcbiAgY2FjaGUgPSAoY2FjaGUgPSBjYWNoZVt0eXBlXSkgJiYgY2FjaGVba2V5XTtcblxuICByZXR1cm4gdHlwZSA9PSAnb2JqZWN0J1xuICAgID8gKGNhY2hlICYmIGJhc2VJbmRleE9mKGNhY2hlLCB2YWx1ZSkgPiAtMSA/IDAgOiAtMSlcbiAgICA6IChjYWNoZSA/IDAgOiAtMSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY2FjaGVJbmRleE9mO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4yIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxNCBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIFVzZWQgdG8gcHJlZml4IGtleXMgdG8gYXZvaWQgaXNzdWVzIHdpdGggYF9fcHJvdG9fX2AgYW5kIHByb3BlcnRpZXMgb24gYE9iamVjdC5wcm90b3R5cGVgICovXG52YXIga2V5UHJlZml4ID0gJ19fMTMzNTI0ODgzODAwMF9fJztcblxubW9kdWxlLmV4cG9ydHMgPSBrZXlQcmVmaXg7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGNhY2hlUHVzaCA9IHJlcXVpcmUoJ2xvZGFzaC5fY2FjaGVwdXNoJyksXG4gICAgZ2V0T2JqZWN0ID0gcmVxdWlyZSgnbG9kYXNoLl9nZXRvYmplY3QnKSxcbiAgICByZWxlYXNlT2JqZWN0ID0gcmVxdWlyZSgnbG9kYXNoLl9yZWxlYXNlb2JqZWN0Jyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGNhY2hlIG9iamVjdCB0byBvcHRpbWl6ZSBsaW5lYXIgc2VhcmNoZXMgb2YgbGFyZ2UgYXJyYXlzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBbYXJyYXk9W11dIFRoZSBhcnJheSB0byBzZWFyY2guXG4gKiBAcmV0dXJucyB7bnVsbHxPYmplY3R9IFJldHVybnMgdGhlIGNhY2hlIG9iamVjdCBvciBgbnVsbGAgaWYgY2FjaGluZyBzaG91bGQgbm90IGJlIHVzZWQuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUNhY2hlKGFycmF5KSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gYXJyYXkubGVuZ3RoLFxuICAgICAgZmlyc3QgPSBhcnJheVswXSxcbiAgICAgIG1pZCA9IGFycmF5WyhsZW5ndGggLyAyKSB8IDBdLFxuICAgICAgbGFzdCA9IGFycmF5W2xlbmd0aCAtIDFdO1xuXG4gIGlmIChmaXJzdCAmJiB0eXBlb2YgZmlyc3QgPT0gJ29iamVjdCcgJiZcbiAgICAgIG1pZCAmJiB0eXBlb2YgbWlkID09ICdvYmplY3QnICYmIGxhc3QgJiYgdHlwZW9mIGxhc3QgPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdmFyIGNhY2hlID0gZ2V0T2JqZWN0KCk7XG4gIGNhY2hlWydmYWxzZSddID0gY2FjaGVbJ251bGwnXSA9IGNhY2hlWyd0cnVlJ10gPSBjYWNoZVsndW5kZWZpbmVkJ10gPSBmYWxzZTtcblxuICB2YXIgcmVzdWx0ID0gZ2V0T2JqZWN0KCk7XG4gIHJlc3VsdC5hcnJheSA9IGFycmF5O1xuICByZXN1bHQuY2FjaGUgPSBjYWNoZTtcbiAgcmVzdWx0LnB1c2ggPSBjYWNoZVB1c2g7XG5cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICByZXN1bHQucHVzaChhcnJheVtpbmRleF0pO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlQ2FjaGU7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGtleVByZWZpeCA9IHJlcXVpcmUoJ2xvZGFzaC5fa2V5cHJlZml4Jyk7XG5cbi8qKlxuICogQWRkcyBhIGdpdmVuIHZhbHVlIHRvIHRoZSBjb3JyZXNwb25kaW5nIGNhY2hlIG9iamVjdC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gYWRkIHRvIHRoZSBjYWNoZS5cbiAqL1xuZnVuY3Rpb24gY2FjaGVQdXNoKHZhbHVlKSB7XG4gIHZhciBjYWNoZSA9IHRoaXMuY2FjaGUsXG4gICAgICB0eXBlID0gdHlwZW9mIHZhbHVlO1xuXG4gIGlmICh0eXBlID09ICdib29sZWFuJyB8fCB2YWx1ZSA9PSBudWxsKSB7XG4gICAgY2FjaGVbdmFsdWVdID0gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICBpZiAodHlwZSAhPSAnbnVtYmVyJyAmJiB0eXBlICE9ICdzdHJpbmcnKSB7XG4gICAgICB0eXBlID0gJ29iamVjdCc7XG4gICAgfVxuICAgIHZhciBrZXkgPSB0eXBlID09ICdudW1iZXInID8gdmFsdWUgOiBrZXlQcmVmaXggKyB2YWx1ZSxcbiAgICAgICAgdHlwZUNhY2hlID0gY2FjaGVbdHlwZV0gfHwgKGNhY2hlW3R5cGVdID0ge30pO1xuXG4gICAgaWYgKHR5cGUgPT0gJ29iamVjdCcpIHtcbiAgICAgICh0eXBlQ2FjaGVba2V5XSB8fCAodHlwZUNhY2hlW2tleV0gPSBbXSkpLnB1c2godmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0eXBlQ2FjaGVba2V5XSA9IHRydWU7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY2FjaGVQdXNoO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBvYmplY3RQb29sID0gcmVxdWlyZSgnbG9kYXNoLl9vYmplY3Rwb29sJyk7XG5cbi8qKlxuICogR2V0cyBhbiBvYmplY3QgZnJvbSB0aGUgb2JqZWN0IHBvb2wgb3IgY3JlYXRlcyBhIG5ldyBvbmUgaWYgdGhlIHBvb2wgaXMgZW1wdHkuXG4gKlxuICogQHByaXZhdGVcbiAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBvYmplY3QgZnJvbSB0aGUgcG9vbC5cbiAqL1xuZnVuY3Rpb24gZ2V0T2JqZWN0KCkge1xuICByZXR1cm4gb2JqZWN0UG9vbC5wb3AoKSB8fCB7XG4gICAgJ2FycmF5JzogbnVsbCxcbiAgICAnY2FjaGUnOiBudWxsLFxuICAgICdjcml0ZXJpYSc6IG51bGwsXG4gICAgJ2ZhbHNlJzogZmFsc2UsXG4gICAgJ2luZGV4JzogMCxcbiAgICAnbnVsbCc6IGZhbHNlLFxuICAgICdudW1iZXInOiBudWxsLFxuICAgICdvYmplY3QnOiBudWxsLFxuICAgICdwdXNoJzogbnVsbCxcbiAgICAnc3RyaW5nJzogbnVsbCxcbiAgICAndHJ1ZSc6IGZhbHNlLFxuICAgICd1bmRlZmluZWQnOiBmYWxzZSxcbiAgICAndmFsdWUnOiBudWxsXG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZ2V0T2JqZWN0O1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIFVzZWQgdG8gcG9vbCBhcnJheXMgYW5kIG9iamVjdHMgdXNlZCBpbnRlcm5hbGx5ICovXG52YXIgb2JqZWN0UG9vbCA9IFtdO1xuXG5tb2R1bGUuZXhwb3J0cyA9IG9iamVjdFBvb2w7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogVXNlZCBhcyB0aGUgc2l6ZSB3aGVuIG9wdGltaXphdGlvbnMgYXJlIGVuYWJsZWQgZm9yIGxhcmdlIGFycmF5cyAqL1xudmFyIGxhcmdlQXJyYXlTaXplID0gNzU7XG5cbm1vZHVsZS5leHBvcnRzID0gbGFyZ2VBcnJheVNpemU7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIG1heFBvb2xTaXplID0gcmVxdWlyZSgnbG9kYXNoLl9tYXhwb29sc2l6ZScpLFxuICAgIG9iamVjdFBvb2wgPSByZXF1aXJlKCdsb2Rhc2guX29iamVjdHBvb2wnKTtcblxuLyoqXG4gKiBSZWxlYXNlcyB0aGUgZ2l2ZW4gb2JqZWN0IGJhY2sgdG8gdGhlIG9iamVjdCBwb29sLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gW29iamVjdF0gVGhlIG9iamVjdCB0byByZWxlYXNlLlxuICovXG5mdW5jdGlvbiByZWxlYXNlT2JqZWN0KG9iamVjdCkge1xuICB2YXIgY2FjaGUgPSBvYmplY3QuY2FjaGU7XG4gIGlmIChjYWNoZSkge1xuICAgIHJlbGVhc2VPYmplY3QoY2FjaGUpO1xuICB9XG4gIG9iamVjdC5hcnJheSA9IG9iamVjdC5jYWNoZSA9IG9iamVjdC5jcml0ZXJpYSA9IG9iamVjdC5vYmplY3QgPSBvYmplY3QubnVtYmVyID0gb2JqZWN0LnN0cmluZyA9IG9iamVjdC52YWx1ZSA9IG51bGw7XG4gIGlmIChvYmplY3RQb29sLmxlbmd0aCA8IG1heFBvb2xTaXplKSB7XG4gICAgb2JqZWN0UG9vbC5wdXNoKG9iamVjdCk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSByZWxlYXNlT2JqZWN0O1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBpc0FyZ3VtZW50cyA9IHJlcXVpcmUoJ2xvZGFzaC5pc2FyZ3VtZW50cycpLFxuICAgIGlzQXJyYXkgPSByZXF1aXJlKCdsb2Rhc2guaXNhcnJheScpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmZsYXR0ZW5gIHdpdGhvdXQgc3VwcG9ydCBmb3IgY2FsbGJhY2tcbiAqIHNob3J0aGFuZHMgb3IgYHRoaXNBcmdgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBmbGF0dGVuLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNTaGFsbG93PWZhbHNlXSBBIGZsYWcgdG8gcmVzdHJpY3QgZmxhdHRlbmluZyB0byBhIHNpbmdsZSBsZXZlbC5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2lzU3RyaWN0PWZhbHNlXSBBIGZsYWcgdG8gcmVzdHJpY3QgZmxhdHRlbmluZyB0byBhcnJheXMgYW5kIGBhcmd1bWVudHNgIG9iamVjdHMuXG4gKiBAcGFyYW0ge251bWJlcn0gW2Zyb21JbmRleD0wXSBUaGUgaW5kZXggdG8gc3RhcnQgZnJvbS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBhIG5ldyBmbGF0dGVuZWQgYXJyYXkuXG4gKi9cbmZ1bmN0aW9uIGJhc2VGbGF0dGVuKGFycmF5LCBpc1NoYWxsb3csIGlzU3RyaWN0LCBmcm9tSW5kZXgpIHtcbiAgdmFyIGluZGV4ID0gKGZyb21JbmRleCB8fCAwKSAtIDEsXG4gICAgICBsZW5ndGggPSBhcnJheSA/IGFycmF5Lmxlbmd0aCA6IDAsXG4gICAgICByZXN1bHQgPSBbXTtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHZhciB2YWx1ZSA9IGFycmF5W2luZGV4XTtcblxuICAgIGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCcgJiYgdHlwZW9mIHZhbHVlLmxlbmd0aCA9PSAnbnVtYmVyJ1xuICAgICAgICAmJiAoaXNBcnJheSh2YWx1ZSkgfHwgaXNBcmd1bWVudHModmFsdWUpKSkge1xuICAgICAgLy8gcmVjdXJzaXZlbHkgZmxhdHRlbiBhcnJheXMgKHN1c2NlcHRpYmxlIHRvIGNhbGwgc3RhY2sgbGltaXRzKVxuICAgICAgaWYgKCFpc1NoYWxsb3cpIHtcbiAgICAgICAgdmFsdWUgPSBiYXNlRmxhdHRlbih2YWx1ZSwgaXNTaGFsbG93LCBpc1N0cmljdCk7XG4gICAgICB9XG4gICAgICB2YXIgdmFsSW5kZXggPSAtMSxcbiAgICAgICAgICB2YWxMZW5ndGggPSB2YWx1ZS5sZW5ndGgsXG4gICAgICAgICAgcmVzSW5kZXggPSByZXN1bHQubGVuZ3RoO1xuXG4gICAgICByZXN1bHQubGVuZ3RoICs9IHZhbExlbmd0aDtcbiAgICAgIHdoaWxlICgrK3ZhbEluZGV4IDwgdmFsTGVuZ3RoKSB7XG4gICAgICAgIHJlc3VsdFtyZXNJbmRleCsrXSA9IHZhbHVlW3ZhbEluZGV4XTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKCFpc1N0cmljdCkge1xuICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VGbGF0dGVuO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCBzaG9ydGN1dHMgKi9cbnZhciBhcmdzQ2xhc3MgPSAnW29iamVjdCBBcmd1bWVudHNdJztcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgaW50ZXJuYWwgW1tDbGFzc11dIG9mIHZhbHVlcyAqL1xudmFyIHRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYW4gYGFyZ3VtZW50c2Agb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGB2YWx1ZWAgaXMgYW4gYGFyZ3VtZW50c2Agb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIChmdW5jdGlvbigpIHsgcmV0dXJuIF8uaXNBcmd1bWVudHMoYXJndW1lbnRzKTsgfSkoMSwgMiwgMyk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc0FyZ3VtZW50cyhbMSwgMiwgM10pO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNBcmd1bWVudHModmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0JyAmJiB0eXBlb2YgdmFsdWUubGVuZ3RoID09ICdudW1iZXInICYmXG4gICAgdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gYXJnc0NsYXNzIHx8IGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQXJndW1lbnRzO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlQ3JlYXRlQ2FsbGJhY2sgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2VjcmVhdGVjYWxsYmFjaycpLFxuICAgIGZvck93biA9IHJlcXVpcmUoJ2xvZGFzaC5mb3Jvd24nKTtcblxuLyoqXG4gKiBJdGVyYXRlcyBvdmVyIGVsZW1lbnRzIG9mIGEgY29sbGVjdGlvbiwgZXhlY3V0aW5nIHRoZSBjYWxsYmFjayBmb3IgZWFjaFxuICogZWxlbWVudC4gVGhlIGNhbGxiYWNrIGlzIGJvdW5kIHRvIGB0aGlzQXJnYCBhbmQgaW52b2tlZCB3aXRoIHRocmVlIGFyZ3VtZW50cztcbiAqICh2YWx1ZSwgaW5kZXh8a2V5LCBjb2xsZWN0aW9uKS4gQ2FsbGJhY2tzIG1heSBleGl0IGl0ZXJhdGlvbiBlYXJseSBieVxuICogZXhwbGljaXRseSByZXR1cm5pbmcgYGZhbHNlYC5cbiAqXG4gKiBOb3RlOiBBcyB3aXRoIG90aGVyIFwiQ29sbGVjdGlvbnNcIiBtZXRob2RzLCBvYmplY3RzIHdpdGggYSBgbGVuZ3RoYCBwcm9wZXJ0eVxuICogYXJlIGl0ZXJhdGVkIGxpa2UgYXJyYXlzLiBUbyBhdm9pZCB0aGlzIGJlaGF2aW9yIGBfLmZvckluYCBvciBgXy5mb3JPd25gXG4gKiBtYXkgYmUgdXNlZCBmb3Igb2JqZWN0IGl0ZXJhdGlvbi5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGFsaWFzIGVhY2hcbiAqIEBjYXRlZ29yeSBDb2xsZWN0aW9uc1xuICogQHBhcmFtIHtBcnJheXxPYmplY3R8c3RyaW5nfSBjb2xsZWN0aW9uIFRoZSBjb2xsZWN0aW9uIHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFjaz1pZGVudGl0eV0gVGhlIGZ1bmN0aW9uIGNhbGxlZCBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBjYWxsYmFja2AuXG4gKiBAcmV0dXJucyB7QXJyYXl8T2JqZWN0fHN0cmluZ30gUmV0dXJucyBgY29sbGVjdGlvbmAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8oWzEsIDIsIDNdKS5mb3JFYWNoKGZ1bmN0aW9uKG51bSkgeyBjb25zb2xlLmxvZyhudW0pOyB9KS5qb2luKCcsJyk7XG4gKiAvLyA9PiBsb2dzIGVhY2ggbnVtYmVyIGFuZCByZXR1cm5zICcxLDIsMydcbiAqXG4gKiBfLmZvckVhY2goeyAnb25lJzogMSwgJ3R3byc6IDIsICd0aHJlZSc6IDMgfSwgZnVuY3Rpb24obnVtKSB7IGNvbnNvbGUubG9nKG51bSk7IH0pO1xuICogLy8gPT4gbG9ncyBlYWNoIG51bWJlciBhbmQgcmV0dXJucyB0aGUgb2JqZWN0IChwcm9wZXJ0eSBvcmRlciBpcyBub3QgZ3VhcmFudGVlZCBhY3Jvc3MgZW52aXJvbm1lbnRzKVxuICovXG5mdW5jdGlvbiBmb3JFYWNoKGNvbGxlY3Rpb24sIGNhbGxiYWNrLCB0aGlzQXJnKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gY29sbGVjdGlvbiA/IGNvbGxlY3Rpb24ubGVuZ3RoIDogMDtcblxuICBjYWxsYmFjayA9IGNhbGxiYWNrICYmIHR5cGVvZiB0aGlzQXJnID09ICd1bmRlZmluZWQnID8gY2FsbGJhY2sgOiBiYXNlQ3JlYXRlQ2FsbGJhY2soY2FsbGJhY2ssIHRoaXNBcmcsIDMpO1xuICBpZiAodHlwZW9mIGxlbmd0aCA9PSAnbnVtYmVyJykge1xuICAgIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgICBpZiAoY2FsbGJhY2soY29sbGVjdGlvbltpbmRleF0sIGluZGV4LCBjb2xsZWN0aW9uKSA9PT0gZmFsc2UpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvck93bihjb2xsZWN0aW9uLCBjYWxsYmFjayk7XG4gIH1cbiAgcmV0dXJuIGNvbGxlY3Rpb247XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZm9yRWFjaDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgaXNOYXRpdmUgPSByZXF1aXJlKCdsb2Rhc2guX2lzbmF0aXZlJyk7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgc2hvcnRjdXRzICovXG52YXIgYXJyYXlDbGFzcyA9ICdbb2JqZWN0IEFycmF5XSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIFtbQ2xhc3NdXSBvZiB2YWx1ZXMgKi9cbnZhciB0b1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyBmb3IgbWV0aG9kcyB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgb3RoZXIgYGxvZGFzaGAgbWV0aG9kcyAqL1xudmFyIG5hdGl2ZUlzQXJyYXkgPSBpc05hdGl2ZShuYXRpdmVJc0FycmF5ID0gQXJyYXkuaXNBcnJheSkgJiYgbmF0aXZlSXNBcnJheTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhbiBhcnJheS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHR5cGUgRnVuY3Rpb25cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYHZhbHVlYCBpcyBhbiBhcnJheSwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiAoZnVuY3Rpb24oKSB7IHJldHVybiBfLmlzQXJyYXkoYXJndW1lbnRzKTsgfSkoKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc0FycmF5KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiB0cnVlXG4gKi9cbnZhciBpc0FycmF5ID0gbmF0aXZlSXNBcnJheSB8fCBmdW5jdGlvbih2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnICYmIHR5cGVvZiB2YWx1ZS5sZW5ndGggPT0gJ251bWJlcicgJiZcbiAgICB0b1N0cmluZy5jYWxsKHZhbHVlKSA9PSBhcnJheUNsYXNzIHx8IGZhbHNlO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBpc0FycmF5O1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCBzaG9ydGN1dHMgKi9cbnZhciBib29sQ2xhc3MgPSAnW29iamVjdCBCb29sZWFuXSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIFtbQ2xhc3NdXSBvZiB2YWx1ZXMgKi9cbnZhciB0b1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgYm9vbGVhbiB2YWx1ZS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBgdmFsdWVgIGlzIGEgYm9vbGVhbiB2YWx1ZSwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzQm9vbGVhbihudWxsKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzQm9vbGVhbih2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgPT09IHRydWUgfHwgdmFsdWUgPT09IGZhbHNlIHx8XG4gICAgdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnICYmIHRvU3RyaW5nLmNhbGwodmFsdWUpID09IGJvb2xDbGFzcyB8fCBmYWxzZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0Jvb2xlYW47XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgZnVuY3Rpb24uXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYHZhbHVlYCBpcyBhIGZ1bmN0aW9uLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNGdW5jdGlvbihfKTtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaXNGdW5jdGlvbih2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICdmdW5jdGlvbic7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNGdW5jdGlvbjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgaXNOdW1iZXIgPSByZXF1aXJlKCdsb2Rhc2guaXNudW1iZXInKTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBgTmFOYC5cbiAqXG4gKiBOb3RlOiBUaGlzIGlzIG5vdCB0aGUgc2FtZSBhcyBuYXRpdmUgYGlzTmFOYCB3aGljaCB3aWxsIHJldHVybiBgdHJ1ZWAgZm9yXG4gKiBgdW5kZWZpbmVkYCBhbmQgb3RoZXIgbm9uLW51bWVyaWMgdmFsdWVzLiBTZWUgaHR0cDovL2VzNS5naXRodWIuaW8vI3gxNS4xLjIuNC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBgdmFsdWVgIGlzIGBOYU5gLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNOYU4oTmFOKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzTmFOKG5ldyBOdW1iZXIoTmFOKSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogaXNOYU4odW5kZWZpbmVkKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzTmFOKHVuZGVmaW5lZCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc05hTih2YWx1ZSkge1xuICAvLyBgTmFOYCBhcyBhIHByaW1pdGl2ZSBpcyB0aGUgb25seSB2YWx1ZSB0aGF0IGlzIG5vdCBlcXVhbCB0byBpdHNlbGZcbiAgLy8gKHBlcmZvcm0gdGhlIFtbQ2xhc3NdXSBjaGVjayBmaXJzdCB0byBhdm9pZCBlcnJvcnMgd2l0aCBzb21lIGhvc3Qgb2JqZWN0cyBpbiBJRSlcbiAgcmV0dXJuIGlzTnVtYmVyKHZhbHVlKSAmJiB2YWx1ZSAhPSArdmFsdWU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNOYU47XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGBudWxsYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBgdmFsdWVgIGlzIGBudWxsYCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzTnVsbChudWxsKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzTnVsbCh1bmRlZmluZWQpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNOdWxsKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSA9PT0gbnVsbDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc051bGw7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHNob3J0Y3V0cyAqL1xudmFyIG51bWJlckNsYXNzID0gJ1tvYmplY3QgTnVtYmVyXSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIFtbQ2xhc3NdXSBvZiB2YWx1ZXMgKi9cbnZhciB0b1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgbnVtYmVyLlxuICpcbiAqIE5vdGU6IGBOYU5gIGlzIGNvbnNpZGVyZWQgYSBudW1iZXIuIFNlZSBodHRwOi8vZXM1LmdpdGh1Yi5pby8jeDguNS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBgdmFsdWVgIGlzIGEgbnVtYmVyLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNOdW1iZXIoOC40ICogNSk7XG4gKiAvLyA9PiB0cnVlXG4gKi9cbmZ1bmN0aW9uIGlzTnVtYmVyKHZhbHVlKSB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicgfHxcbiAgICB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCcgJiYgdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gbnVtYmVyQ2xhc3MgfHwgZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNOdW1iZXI7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGlzTmF0aXZlID0gcmVxdWlyZSgnbG9kYXNoLl9pc25hdGl2ZScpLFxuICAgIHNoaW1Jc1BsYWluT2JqZWN0ID0gcmVxdWlyZSgnbG9kYXNoLl9zaGltaXNwbGFpbm9iamVjdCcpO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHNob3J0Y3V0cyAqL1xudmFyIG9iamVjdENsYXNzID0gJ1tvYmplY3QgT2JqZWN0XSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIFtbQ2xhc3NdXSBvZiB2YWx1ZXMgKi9cbnZhciB0b1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiogTmF0aXZlIG1ldGhvZCBzaG9ydGN1dHMgKi9cbnZhciBnZXRQcm90b3R5cGVPZiA9IGlzTmF0aXZlKGdldFByb3RvdHlwZU9mID0gT2JqZWN0LmdldFByb3RvdHlwZU9mKSAmJiBnZXRQcm90b3R5cGVPZjtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhbiBvYmplY3QgY3JlYXRlZCBieSB0aGUgYE9iamVjdGAgY29uc3RydWN0b3IuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgcGxhaW4gb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIGZ1bmN0aW9uIFNoYXBlKCkge1xuICogICB0aGlzLnggPSAwO1xuICogICB0aGlzLnkgPSAwO1xuICogfVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdChuZXcgU2hhcGUpO1xuICogLy8gPT4gZmFsc2VcbiAqXG4gKiBfLmlzUGxhaW5PYmplY3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc1BsYWluT2JqZWN0KHsgJ3gnOiAwLCAneSc6IDAgfSk7XG4gKiAvLyA9PiB0cnVlXG4gKi9cbnZhciBpc1BsYWluT2JqZWN0ID0gIWdldFByb3RvdHlwZU9mID8gc2hpbUlzUGxhaW5PYmplY3QgOiBmdW5jdGlvbih2YWx1ZSkge1xuICBpZiAoISh2YWx1ZSAmJiB0b1N0cmluZy5jYWxsKHZhbHVlKSA9PSBvYmplY3RDbGFzcykpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdmFyIHZhbHVlT2YgPSB2YWx1ZS52YWx1ZU9mLFxuICAgICAgb2JqUHJvdG8gPSBpc05hdGl2ZSh2YWx1ZU9mKSAmJiAob2JqUHJvdG8gPSBnZXRQcm90b3R5cGVPZih2YWx1ZU9mKSkgJiYgZ2V0UHJvdG90eXBlT2Yob2JqUHJvdG8pO1xuXG4gIHJldHVybiBvYmpQcm90b1xuICAgID8gKHZhbHVlID09IG9ialByb3RvIHx8IGdldFByb3RvdHlwZU9mKHZhbHVlKSA9PSBvYmpQcm90bylcbiAgICA6IHNoaW1Jc1BsYWluT2JqZWN0KHZhbHVlKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gaXNQbGFpbk9iamVjdDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgZm9ySW4gPSByZXF1aXJlKCdsb2Rhc2guZm9yaW4nKSxcbiAgICBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnbG9kYXNoLmlzZnVuY3Rpb24nKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCBzaG9ydGN1dHMgKi9cbnZhciBvYmplY3RDbGFzcyA9ICdbb2JqZWN0IE9iamVjdF0nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBbW0NsYXNzXV0gb2YgdmFsdWVzICovXG52YXIgdG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBBIGZhbGxiYWNrIGltcGxlbWVudGF0aW9uIG9mIGBpc1BsYWluT2JqZWN0YCB3aGljaCBjaGVja3MgaWYgYSBnaXZlbiB2YWx1ZVxuICogaXMgYW4gb2JqZWN0IGNyZWF0ZWQgYnkgdGhlIGBPYmplY3RgIGNvbnN0cnVjdG9yLCBhc3N1bWluZyBvYmplY3RzIGNyZWF0ZWRcbiAqIGJ5IHRoZSBgT2JqZWN0YCBjb25zdHJ1Y3RvciBoYXZlIG5vIGluaGVyaXRlZCBlbnVtZXJhYmxlIHByb3BlcnRpZXMgYW5kIHRoYXRcbiAqIHRoZXJlIGFyZSBubyBgT2JqZWN0LnByb3RvdHlwZWAgZXh0ZW5zaW9ucy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIHBsYWluIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBzaGltSXNQbGFpbk9iamVjdCh2YWx1ZSkge1xuICB2YXIgY3RvcixcbiAgICAgIHJlc3VsdDtcblxuICAvLyBhdm9pZCBub24gT2JqZWN0IG9iamVjdHMsIGBhcmd1bWVudHNgIG9iamVjdHMsIGFuZCBET00gZWxlbWVudHNcbiAgaWYgKCEodmFsdWUgJiYgdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gb2JqZWN0Q2xhc3MpIHx8XG4gICAgICAoY3RvciA9IHZhbHVlLmNvbnN0cnVjdG9yLCBpc0Z1bmN0aW9uKGN0b3IpICYmICEoY3RvciBpbnN0YW5jZW9mIGN0b3IpKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBJbiBtb3N0IGVudmlyb25tZW50cyBhbiBvYmplY3QncyBvd24gcHJvcGVydGllcyBhcmUgaXRlcmF0ZWQgYmVmb3JlXG4gIC8vIGl0cyBpbmhlcml0ZWQgcHJvcGVydGllcy4gSWYgdGhlIGxhc3QgaXRlcmF0ZWQgcHJvcGVydHkgaXMgYW4gb2JqZWN0J3NcbiAgLy8gb3duIHByb3BlcnR5IHRoZW4gdGhlcmUgYXJlIG5vIGluaGVyaXRlZCBlbnVtZXJhYmxlIHByb3BlcnRpZXMuXG4gIGZvckluKHZhbHVlLCBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgcmVzdWx0ID0ga2V5O1xuICB9KTtcbiAgcmV0dXJuIHR5cGVvZiByZXN1bHQgPT0gJ3VuZGVmaW5lZCcgfHwgaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgcmVzdWx0KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBzaGltSXNQbGFpbk9iamVjdDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUNyZWF0ZUNhbGxiYWNrID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlY3JlYXRlY2FsbGJhY2snKSxcbiAgICBvYmplY3RUeXBlcyA9IHJlcXVpcmUoJ2xvZGFzaC5fb2JqZWN0dHlwZXMnKTtcblxuLyoqXG4gKiBJdGVyYXRlcyBvdmVyIG93biBhbmQgaW5oZXJpdGVkIGVudW1lcmFibGUgcHJvcGVydGllcyBvZiBhbiBvYmplY3QsXG4gKiBleGVjdXRpbmcgdGhlIGNhbGxiYWNrIGZvciBlYWNoIHByb3BlcnR5LiBUaGUgY2FsbGJhY2sgaXMgYm91bmQgdG8gYHRoaXNBcmdgXG4gKiBhbmQgaW52b2tlZCB3aXRoIHRocmVlIGFyZ3VtZW50czsgKHZhbHVlLCBrZXksIG9iamVjdCkuIENhbGxiYWNrcyBtYXkgZXhpdFxuICogaXRlcmF0aW9uIGVhcmx5IGJ5IGV4cGxpY2l0bHkgcmV0dXJuaW5nIGBmYWxzZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEB0eXBlIEZ1bmN0aW9uXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFjaz1pZGVudGl0eV0gVGhlIGZ1bmN0aW9uIGNhbGxlZCBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBjYWxsYmFja2AuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIGBvYmplY3RgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBmdW5jdGlvbiBTaGFwZSgpIHtcbiAqICAgdGhpcy54ID0gMDtcbiAqICAgdGhpcy55ID0gMDtcbiAqIH1cbiAqXG4gKiBTaGFwZS5wcm90b3R5cGUubW92ZSA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAqICAgdGhpcy54ICs9IHg7XG4gKiAgIHRoaXMueSArPSB5O1xuICogfTtcbiAqXG4gKiBfLmZvckluKG5ldyBTaGFwZSwgZnVuY3Rpb24odmFsdWUsIGtleSkge1xuICogICBjb25zb2xlLmxvZyhrZXkpO1xuICogfSk7XG4gKiAvLyA9PiBsb2dzICd4JywgJ3knLCBhbmQgJ21vdmUnIChwcm9wZXJ0eSBvcmRlciBpcyBub3QgZ3VhcmFudGVlZCBhY3Jvc3MgZW52aXJvbm1lbnRzKVxuICovXG52YXIgZm9ySW4gPSBmdW5jdGlvbihjb2xsZWN0aW9uLCBjYWxsYmFjaywgdGhpc0FyZykge1xuICB2YXIgaW5kZXgsIGl0ZXJhYmxlID0gY29sbGVjdGlvbiwgcmVzdWx0ID0gaXRlcmFibGU7XG4gIGlmICghaXRlcmFibGUpIHJldHVybiByZXN1bHQ7XG4gIGlmICghb2JqZWN0VHlwZXNbdHlwZW9mIGl0ZXJhYmxlXSkgcmV0dXJuIHJlc3VsdDtcbiAgY2FsbGJhY2sgPSBjYWxsYmFjayAmJiB0eXBlb2YgdGhpc0FyZyA9PSAndW5kZWZpbmVkJyA/IGNhbGxiYWNrIDogYmFzZUNyZWF0ZUNhbGxiYWNrKGNhbGxiYWNrLCB0aGlzQXJnLCAzKTtcbiAgICBmb3IgKGluZGV4IGluIGl0ZXJhYmxlKSB7XG4gICAgICBpZiAoY2FsbGJhY2soaXRlcmFibGVbaW5kZXhdLCBpbmRleCwgY29sbGVjdGlvbikgPT09IGZhbHNlKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgcmV0dXJuIHJlc3VsdFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmb3JJbjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgc2hvcnRjdXRzICovXG52YXIgc3RyaW5nQ2xhc3MgPSAnW29iamVjdCBTdHJpbmddJztcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgaW50ZXJuYWwgW1tDbGFzc11dIG9mIHZhbHVlcyAqL1xudmFyIHRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSBzdHJpbmcuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYHZhbHVlYCBpcyBhIHN0cmluZywgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzU3RyaW5nKCdmcmVkJyk7XG4gKiAvLyA9PiB0cnVlXG4gKi9cbmZ1bmN0aW9uIGlzU3RyaW5nKHZhbHVlKSB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT0gJ3N0cmluZycgfHxcbiAgICB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCcgJiYgdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gc3RyaW5nQ2xhc3MgfHwgZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNTdHJpbmc7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGB1bmRlZmluZWRgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGB2YWx1ZWAgaXMgYHVuZGVmaW5lZGAsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc1VuZGVmaW5lZCh2b2lkIDApO1xuICogLy8gPT4gdHJ1ZVxuICovXG5mdW5jdGlvbiBpc1VuZGVmaW5lZCh2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICd1bmRlZmluZWQnO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzVW5kZWZpbmVkO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBjcmVhdGVDYWxsYmFjayA9IHJlcXVpcmUoJ2xvZGFzaC5jcmVhdGVjYWxsYmFjaycpLFxuICAgIGZvck93biA9IHJlcXVpcmUoJ2xvZGFzaC5mb3Jvd24nKTtcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHZhbHVlcyBieSBydW5uaW5nIGVhY2ggZWxlbWVudCBpbiB0aGUgY29sbGVjdGlvblxuICogdGhyb3VnaCB0aGUgY2FsbGJhY2suIFRoZSBjYWxsYmFjayBpcyBib3VuZCB0byBgdGhpc0FyZ2AgYW5kIGludm9rZWQgd2l0aFxuICogdGhyZWUgYXJndW1lbnRzOyAodmFsdWUsIGluZGV4fGtleSwgY29sbGVjdGlvbikuXG4gKlxuICogSWYgYSBwcm9wZXJ0eSBuYW1lIGlzIHByb3ZpZGVkIGZvciBgY2FsbGJhY2tgIHRoZSBjcmVhdGVkIFwiXy5wbHVja1wiIHN0eWxlXG4gKiBjYWxsYmFjayB3aWxsIHJldHVybiB0aGUgcHJvcGVydHkgdmFsdWUgb2YgdGhlIGdpdmVuIGVsZW1lbnQuXG4gKlxuICogSWYgYW4gb2JqZWN0IGlzIHByb3ZpZGVkIGZvciBgY2FsbGJhY2tgIHRoZSBjcmVhdGVkIFwiXy53aGVyZVwiIHN0eWxlIGNhbGxiYWNrXG4gKiB3aWxsIHJldHVybiBgdHJ1ZWAgZm9yIGVsZW1lbnRzIHRoYXQgaGF2ZSB0aGUgcHJvcGVydGllcyBvZiB0aGUgZ2l2ZW4gb2JqZWN0LFxuICogZWxzZSBgZmFsc2VgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAYWxpYXMgY29sbGVjdFxuICogQGNhdGVnb3J5IENvbGxlY3Rpb25zXG4gKiBAcGFyYW0ge0FycmF5fE9iamVjdHxzdHJpbmd9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbnxPYmplY3R8c3RyaW5nfSBbY2FsbGJhY2s9aWRlbnRpdHldIFRoZSBmdW5jdGlvbiBjYWxsZWRcbiAqICBwZXIgaXRlcmF0aW9uLiBJZiBhIHByb3BlcnR5IG5hbWUgb3Igb2JqZWN0IGlzIHByb3ZpZGVkIGl0IHdpbGwgYmUgdXNlZFxuICogIHRvIGNyZWF0ZSBhIFwiXy5wbHVja1wiIG9yIFwiXy53aGVyZVwiIHN0eWxlIGNhbGxiYWNrLCByZXNwZWN0aXZlbHkuXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGNhbGxiYWNrYC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBhIG5ldyBhcnJheSBvZiB0aGUgcmVzdWx0cyBvZiBlYWNoIGBjYWxsYmFja2AgZXhlY3V0aW9uLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLm1hcChbMSwgMiwgM10sIGZ1bmN0aW9uKG51bSkgeyByZXR1cm4gbnVtICogMzsgfSk7XG4gKiAvLyA9PiBbMywgNiwgOV1cbiAqXG4gKiBfLm1hcCh7ICdvbmUnOiAxLCAndHdvJzogMiwgJ3RocmVlJzogMyB9LCBmdW5jdGlvbihudW0pIHsgcmV0dXJuIG51bSAqIDM7IH0pO1xuICogLy8gPT4gWzMsIDYsIDldIChwcm9wZXJ0eSBvcmRlciBpcyBub3QgZ3VhcmFudGVlZCBhY3Jvc3MgZW52aXJvbm1lbnRzKVxuICpcbiAqIHZhciBjaGFyYWN0ZXJzID0gW1xuICogICB7ICduYW1lJzogJ2Jhcm5leScsICdhZ2UnOiAzNiB9LFxuICogICB7ICduYW1lJzogJ2ZyZWQnLCAgICdhZ2UnOiA0MCB9XG4gKiBdO1xuICpcbiAqIC8vIHVzaW5nIFwiXy5wbHVja1wiIGNhbGxiYWNrIHNob3J0aGFuZFxuICogXy5tYXAoY2hhcmFjdGVycywgJ25hbWUnKTtcbiAqIC8vID0+IFsnYmFybmV5JywgJ2ZyZWQnXVxuICovXG5mdW5jdGlvbiBtYXAoY29sbGVjdGlvbiwgY2FsbGJhY2ssIHRoaXNBcmcpIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBjb2xsZWN0aW9uID8gY29sbGVjdGlvbi5sZW5ndGggOiAwO1xuXG4gIGNhbGxiYWNrID0gY3JlYXRlQ2FsbGJhY2soY2FsbGJhY2ssIHRoaXNBcmcsIDMpO1xuICBpZiAodHlwZW9mIGxlbmd0aCA9PSAnbnVtYmVyJykge1xuICAgIHZhciByZXN1bHQgPSBBcnJheShsZW5ndGgpO1xuICAgIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgICByZXN1bHRbaW5kZXhdID0gY2FsbGJhY2soY29sbGVjdGlvbltpbmRleF0sIGluZGV4LCBjb2xsZWN0aW9uKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0ID0gW107XG4gICAgZm9yT3duKGNvbGxlY3Rpb24sIGZ1bmN0aW9uKHZhbHVlLCBrZXksIGNvbGxlY3Rpb24pIHtcbiAgICAgIHJlc3VsdFsrK2luZGV4XSA9IGNhbGxiYWNrKHZhbHVlLCBrZXksIGNvbGxlY3Rpb24pO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbWFwO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlQ3JlYXRlQ2FsbGJhY2sgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2VjcmVhdGVjYWxsYmFjaycpLFxuICAgIGJhc2VJc0VxdWFsID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlaXNlcXVhbCcpLFxuICAgIGlzT2JqZWN0ID0gcmVxdWlyZSgnbG9kYXNoLmlzb2JqZWN0JyksXG4gICAga2V5cyA9IHJlcXVpcmUoJ2xvZGFzaC5rZXlzJyksXG4gICAgcHJvcGVydHkgPSByZXF1aXJlKCdsb2Rhc2gucHJvcGVydHknKTtcblxuLyoqXG4gKiBQcm9kdWNlcyBhIGNhbGxiYWNrIGJvdW5kIHRvIGFuIG9wdGlvbmFsIGB0aGlzQXJnYC4gSWYgYGZ1bmNgIGlzIGEgcHJvcGVydHlcbiAqIG5hbWUgdGhlIGNyZWF0ZWQgY2FsbGJhY2sgd2lsbCByZXR1cm4gdGhlIHByb3BlcnR5IHZhbHVlIGZvciBhIGdpdmVuIGVsZW1lbnQuXG4gKiBJZiBgZnVuY2AgaXMgYW4gb2JqZWN0IHRoZSBjcmVhdGVkIGNhbGxiYWNrIHdpbGwgcmV0dXJuIGB0cnVlYCBmb3IgZWxlbWVudHNcbiAqIHRoYXQgY29udGFpbiB0aGUgZXF1aXZhbGVudCBvYmplY3QgcHJvcGVydGllcywgb3RoZXJ3aXNlIGl0IHdpbGwgcmV0dXJuIGBmYWxzZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBVdGlsaXRpZXNcbiAqIEBwYXJhbSB7Kn0gW2Z1bmM9aWRlbnRpdHldIFRoZSB2YWx1ZSB0byBjb252ZXJ0IHRvIGEgY2FsbGJhY2suXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgdGhlIGNyZWF0ZWQgY2FsbGJhY2suXG4gKiBAcGFyYW0ge251bWJlcn0gW2FyZ0NvdW50XSBUaGUgbnVtYmVyIG9mIGFyZ3VtZW50cyB0aGUgY2FsbGJhY2sgYWNjZXB0cy5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyBhIGNhbGxiYWNrIGZ1bmN0aW9uLlxuICogQGV4YW1wbGVcbiAqXG4gKiB2YXIgY2hhcmFjdGVycyA9IFtcbiAqICAgeyAnbmFtZSc6ICdiYXJuZXknLCAnYWdlJzogMzYgfSxcbiAqICAgeyAnbmFtZSc6ICdmcmVkJywgICAnYWdlJzogNDAgfVxuICogXTtcbiAqXG4gKiAvLyB3cmFwIHRvIGNyZWF0ZSBjdXN0b20gY2FsbGJhY2sgc2hvcnRoYW5kc1xuICogXy5jcmVhdGVDYWxsYmFjayA9IF8ud3JhcChfLmNyZWF0ZUNhbGxiYWNrLCBmdW5jdGlvbihmdW5jLCBjYWxsYmFjaywgdGhpc0FyZykge1xuICogICB2YXIgbWF0Y2ggPSAvXiguKz8pX18oW2dsXXQpKC4rKSQvLmV4ZWMoY2FsbGJhY2spO1xuICogICByZXR1cm4gIW1hdGNoID8gZnVuYyhjYWxsYmFjaywgdGhpc0FyZykgOiBmdW5jdGlvbihvYmplY3QpIHtcbiAqICAgICByZXR1cm4gbWF0Y2hbMl0gPT0gJ2d0JyA/IG9iamVjdFttYXRjaFsxXV0gPiBtYXRjaFszXSA6IG9iamVjdFttYXRjaFsxXV0gPCBtYXRjaFszXTtcbiAqICAgfTtcbiAqIH0pO1xuICpcbiAqIF8uZmlsdGVyKGNoYXJhY3RlcnMsICdhZ2VfX2d0MzgnKTtcbiAqIC8vID0+IFt7ICduYW1lJzogJ2ZyZWQnLCAnYWdlJzogNDAgfV1cbiAqL1xuZnVuY3Rpb24gY3JlYXRlQ2FsbGJhY2soZnVuYywgdGhpc0FyZywgYXJnQ291bnQpIHtcbiAgdmFyIHR5cGUgPSB0eXBlb2YgZnVuYztcbiAgaWYgKGZ1bmMgPT0gbnVsbCB8fCB0eXBlID09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gYmFzZUNyZWF0ZUNhbGxiYWNrKGZ1bmMsIHRoaXNBcmcsIGFyZ0NvdW50KTtcbiAgfVxuICAvLyBoYW5kbGUgXCJfLnBsdWNrXCIgc3R5bGUgY2FsbGJhY2sgc2hvcnRoYW5kc1xuICBpZiAodHlwZSAhPSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBwcm9wZXJ0eShmdW5jKTtcbiAgfVxuICB2YXIgcHJvcHMgPSBrZXlzKGZ1bmMpLFxuICAgICAga2V5ID0gcHJvcHNbMF0sXG4gICAgICBhID0gZnVuY1trZXldO1xuXG4gIC8vIGhhbmRsZSBcIl8ud2hlcmVcIiBzdHlsZSBjYWxsYmFjayBzaG9ydGhhbmRzXG4gIGlmIChwcm9wcy5sZW5ndGggPT0gMSAmJiBhID09PSBhICYmICFpc09iamVjdChhKSkge1xuICAgIC8vIGZhc3QgcGF0aCB0aGUgY29tbW9uIGNhc2Ugb2YgcHJvdmlkaW5nIGFuIG9iamVjdCB3aXRoIGEgc2luZ2xlXG4gICAgLy8gcHJvcGVydHkgY29udGFpbmluZyBhIHByaW1pdGl2ZSB2YWx1ZVxuICAgIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICAgIHZhciBiID0gb2JqZWN0W2tleV07XG4gICAgICByZXR1cm4gYSA9PT0gYiAmJiAoYSAhPT0gMCB8fCAoMSAvIGEgPT0gMSAvIGIpKTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICB2YXIgbGVuZ3RoID0gcHJvcHMubGVuZ3RoLFxuICAgICAgICByZXN1bHQgPSBmYWxzZTtcblxuICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgaWYgKCEocmVzdWx0ID0gYmFzZUlzRXF1YWwob2JqZWN0W3Byb3BzW2xlbmd0aF1dLCBmdW5jW3Byb3BzW2xlbmd0aF1dLCBudWxsLCB0cnVlKSkpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlQ2FsbGJhY2s7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGZvckluID0gcmVxdWlyZSgnbG9kYXNoLmZvcmluJyksXG4gICAgZ2V0QXJyYXkgPSByZXF1aXJlKCdsb2Rhc2guX2dldGFycmF5JyksXG4gICAgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJ2xvZGFzaC5pc2Z1bmN0aW9uJyksXG4gICAgb2JqZWN0VHlwZXMgPSByZXF1aXJlKCdsb2Rhc2guX29iamVjdHR5cGVzJyksXG4gICAgcmVsZWFzZUFycmF5ID0gcmVxdWlyZSgnbG9kYXNoLl9yZWxlYXNlYXJyYXknKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCBzaG9ydGN1dHMgKi9cbnZhciBhcmdzQ2xhc3MgPSAnW29iamVjdCBBcmd1bWVudHNdJyxcbiAgICBhcnJheUNsYXNzID0gJ1tvYmplY3QgQXJyYXldJyxcbiAgICBib29sQ2xhc3MgPSAnW29iamVjdCBCb29sZWFuXScsXG4gICAgZGF0ZUNsYXNzID0gJ1tvYmplY3QgRGF0ZV0nLFxuICAgIG51bWJlckNsYXNzID0gJ1tvYmplY3QgTnVtYmVyXScsXG4gICAgb2JqZWN0Q2xhc3MgPSAnW29iamVjdCBPYmplY3RdJyxcbiAgICByZWdleHBDbGFzcyA9ICdbb2JqZWN0IFJlZ0V4cF0nLFxuICAgIHN0cmluZ0NsYXNzID0gJ1tvYmplY3QgU3RyaW5nXSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIFtbQ2xhc3NdXSBvZiB2YWx1ZXMgKi9cbnZhciB0b1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiogTmF0aXZlIG1ldGhvZCBzaG9ydGN1dHMgKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmlzRXF1YWxgLCB3aXRob3V0IHN1cHBvcnQgZm9yIGB0aGlzQXJnYCBiaW5kaW5nLFxuICogdGhhdCBhbGxvd3MgcGFydGlhbCBcIl8ud2hlcmVcIiBzdHlsZSBjb21wYXJpc29ucy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSBhIFRoZSB2YWx1ZSB0byBjb21wYXJlLlxuICogQHBhcmFtIHsqfSBiIFRoZSBvdGhlciB2YWx1ZSB0byBjb21wYXJlLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrXSBUaGUgZnVuY3Rpb24gdG8gY3VzdG9taXplIGNvbXBhcmluZyB2YWx1ZXMuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbaXNXaGVyZT1mYWxzZV0gQSBmbGFnIHRvIGluZGljYXRlIHBlcmZvcm1pbmcgcGFydGlhbCBjb21wYXJpc29ucy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0E9W11dIFRyYWNrcyB0cmF2ZXJzZWQgYGFgIG9iamVjdHMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tCPVtdXSBUcmFja3MgdHJhdmVyc2VkIGBiYCBvYmplY3RzLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSB2YWx1ZXMgYXJlIGVxdWl2YWxlbnQsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gYmFzZUlzRXF1YWwoYSwgYiwgY2FsbGJhY2ssIGlzV2hlcmUsIHN0YWNrQSwgc3RhY2tCKSB7XG4gIC8vIHVzZWQgdG8gaW5kaWNhdGUgdGhhdCB3aGVuIGNvbXBhcmluZyBvYmplY3RzLCBgYWAgaGFzIGF0IGxlYXN0IHRoZSBwcm9wZXJ0aWVzIG9mIGBiYFxuICBpZiAoY2FsbGJhY2spIHtcbiAgICB2YXIgcmVzdWx0ID0gY2FsbGJhY2soYSwgYik7XG4gICAgaWYgKHR5cGVvZiByZXN1bHQgIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiAhIXJlc3VsdDtcbiAgICB9XG4gIH1cbiAgLy8gZXhpdCBlYXJseSBmb3IgaWRlbnRpY2FsIHZhbHVlc1xuICBpZiAoYSA9PT0gYikge1xuICAgIC8vIHRyZWF0IGArMGAgdnMuIGAtMGAgYXMgbm90IGVxdWFsXG4gICAgcmV0dXJuIGEgIT09IDAgfHwgKDEgLyBhID09IDEgLyBiKTtcbiAgfVxuICB2YXIgdHlwZSA9IHR5cGVvZiBhLFxuICAgICAgb3RoZXJUeXBlID0gdHlwZW9mIGI7XG5cbiAgLy8gZXhpdCBlYXJseSBmb3IgdW5saWtlIHByaW1pdGl2ZSB2YWx1ZXNcbiAgaWYgKGEgPT09IGEgJiZcbiAgICAgICEoYSAmJiBvYmplY3RUeXBlc1t0eXBlXSkgJiZcbiAgICAgICEoYiAmJiBvYmplY3RUeXBlc1tvdGhlclR5cGVdKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBleGl0IGVhcmx5IGZvciBgbnVsbGAgYW5kIGB1bmRlZmluZWRgIGF2b2lkaW5nIEVTMydzIEZ1bmN0aW9uI2NhbGwgYmVoYXZpb3JcbiAgLy8gaHR0cDovL2VzNS5naXRodWIuaW8vI3gxNS4zLjQuNFxuICBpZiAoYSA9PSBudWxsIHx8IGIgPT0gbnVsbCkge1xuICAgIHJldHVybiBhID09PSBiO1xuICB9XG4gIC8vIGNvbXBhcmUgW1tDbGFzc11dIG5hbWVzXG4gIHZhciBjbGFzc05hbWUgPSB0b1N0cmluZy5jYWxsKGEpLFxuICAgICAgb3RoZXJDbGFzcyA9IHRvU3RyaW5nLmNhbGwoYik7XG5cbiAgaWYgKGNsYXNzTmFtZSA9PSBhcmdzQ2xhc3MpIHtcbiAgICBjbGFzc05hbWUgPSBvYmplY3RDbGFzcztcbiAgfVxuICBpZiAob3RoZXJDbGFzcyA9PSBhcmdzQ2xhc3MpIHtcbiAgICBvdGhlckNsYXNzID0gb2JqZWN0Q2xhc3M7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSAhPSBvdGhlckNsYXNzKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHN3aXRjaCAoY2xhc3NOYW1lKSB7XG4gICAgY2FzZSBib29sQ2xhc3M6XG4gICAgY2FzZSBkYXRlQ2xhc3M6XG4gICAgICAvLyBjb2VyY2UgZGF0ZXMgYW5kIGJvb2xlYW5zIHRvIG51bWJlcnMsIGRhdGVzIHRvIG1pbGxpc2Vjb25kcyBhbmQgYm9vbGVhbnNcbiAgICAgIC8vIHRvIGAxYCBvciBgMGAgdHJlYXRpbmcgaW52YWxpZCBkYXRlcyBjb2VyY2VkIHRvIGBOYU5gIGFzIG5vdCBlcXVhbFxuICAgICAgcmV0dXJuICthID09ICtiO1xuXG4gICAgY2FzZSBudW1iZXJDbGFzczpcbiAgICAgIC8vIHRyZWF0IGBOYU5gIHZzLiBgTmFOYCBhcyBlcXVhbFxuICAgICAgcmV0dXJuIChhICE9ICthKVxuICAgICAgICA/IGIgIT0gK2JcbiAgICAgICAgLy8gYnV0IHRyZWF0IGArMGAgdnMuIGAtMGAgYXMgbm90IGVxdWFsXG4gICAgICAgIDogKGEgPT0gMCA/ICgxIC8gYSA9PSAxIC8gYikgOiBhID09ICtiKTtcblxuICAgIGNhc2UgcmVnZXhwQ2xhc3M6XG4gICAgY2FzZSBzdHJpbmdDbGFzczpcbiAgICAgIC8vIGNvZXJjZSByZWdleGVzIHRvIHN0cmluZ3MgKGh0dHA6Ly9lczUuZ2l0aHViLmlvLyN4MTUuMTAuNi40KVxuICAgICAgLy8gdHJlYXQgc3RyaW5nIHByaW1pdGl2ZXMgYW5kIHRoZWlyIGNvcnJlc3BvbmRpbmcgb2JqZWN0IGluc3RhbmNlcyBhcyBlcXVhbFxuICAgICAgcmV0dXJuIGEgPT0gU3RyaW5nKGIpO1xuICB9XG4gIHZhciBpc0FyciA9IGNsYXNzTmFtZSA9PSBhcnJheUNsYXNzO1xuICBpZiAoIWlzQXJyKSB7XG4gICAgLy8gdW53cmFwIGFueSBgbG9kYXNoYCB3cmFwcGVkIHZhbHVlc1xuICAgIHZhciBhV3JhcHBlZCA9IGhhc093blByb3BlcnR5LmNhbGwoYSwgJ19fd3JhcHBlZF9fJyksXG4gICAgICAgIGJXcmFwcGVkID0gaGFzT3duUHJvcGVydHkuY2FsbChiLCAnX193cmFwcGVkX18nKTtcblxuICAgIGlmIChhV3JhcHBlZCB8fCBiV3JhcHBlZCkge1xuICAgICAgcmV0dXJuIGJhc2VJc0VxdWFsKGFXcmFwcGVkID8gYS5fX3dyYXBwZWRfXyA6IGEsIGJXcmFwcGVkID8gYi5fX3dyYXBwZWRfXyA6IGIsIGNhbGxiYWNrLCBpc1doZXJlLCBzdGFja0EsIHN0YWNrQik7XG4gICAgfVxuICAgIC8vIGV4aXQgZm9yIGZ1bmN0aW9ucyBhbmQgRE9NIG5vZGVzXG4gICAgaWYgKGNsYXNzTmFtZSAhPSBvYmplY3RDbGFzcykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICAvLyBpbiBvbGRlciB2ZXJzaW9ucyBvZiBPcGVyYSwgYGFyZ3VtZW50c2Agb2JqZWN0cyBoYXZlIGBBcnJheWAgY29uc3RydWN0b3JzXG4gICAgdmFyIGN0b3JBID0gYS5jb25zdHJ1Y3RvcixcbiAgICAgICAgY3RvckIgPSBiLmNvbnN0cnVjdG9yO1xuXG4gICAgLy8gbm9uIGBPYmplY3RgIG9iamVjdCBpbnN0YW5jZXMgd2l0aCBkaWZmZXJlbnQgY29uc3RydWN0b3JzIGFyZSBub3QgZXF1YWxcbiAgICBpZiAoY3RvckEgIT0gY3RvckIgJiZcbiAgICAgICAgICAhKGlzRnVuY3Rpb24oY3RvckEpICYmIGN0b3JBIGluc3RhbmNlb2YgY3RvckEgJiYgaXNGdW5jdGlvbihjdG9yQikgJiYgY3RvckIgaW5zdGFuY2VvZiBjdG9yQikgJiZcbiAgICAgICAgICAoJ2NvbnN0cnVjdG9yJyBpbiBhICYmICdjb25zdHJ1Y3RvcicgaW4gYilcbiAgICAgICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIC8vIGFzc3VtZSBjeWNsaWMgc3RydWN0dXJlcyBhcmUgZXF1YWxcbiAgLy8gdGhlIGFsZ29yaXRobSBmb3IgZGV0ZWN0aW5nIGN5Y2xpYyBzdHJ1Y3R1cmVzIGlzIGFkYXB0ZWQgZnJvbSBFUyA1LjFcbiAgLy8gc2VjdGlvbiAxNS4xMi4zLCBhYnN0cmFjdCBvcGVyYXRpb24gYEpPYCAoaHR0cDovL2VzNS5naXRodWIuaW8vI3gxNS4xMi4zKVxuICB2YXIgaW5pdGVkU3RhY2sgPSAhc3RhY2tBO1xuICBzdGFja0EgfHwgKHN0YWNrQSA9IGdldEFycmF5KCkpO1xuICBzdGFja0IgfHwgKHN0YWNrQiA9IGdldEFycmF5KCkpO1xuXG4gIHZhciBsZW5ndGggPSBzdGFja0EubGVuZ3RoO1xuICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICBpZiAoc3RhY2tBW2xlbmd0aF0gPT0gYSkge1xuICAgICAgcmV0dXJuIHN0YWNrQltsZW5ndGhdID09IGI7XG4gICAgfVxuICB9XG4gIHZhciBzaXplID0gMDtcbiAgcmVzdWx0ID0gdHJ1ZTtcblxuICAvLyBhZGQgYGFgIGFuZCBgYmAgdG8gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzXG4gIHN0YWNrQS5wdXNoKGEpO1xuICBzdGFja0IucHVzaChiKTtcblxuICAvLyByZWN1cnNpdmVseSBjb21wYXJlIG9iamVjdHMgYW5kIGFycmF5cyAoc3VzY2VwdGlibGUgdG8gY2FsbCBzdGFjayBsaW1pdHMpXG4gIGlmIChpc0Fycikge1xuICAgIC8vIGNvbXBhcmUgbGVuZ3RocyB0byBkZXRlcm1pbmUgaWYgYSBkZWVwIGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5XG4gICAgbGVuZ3RoID0gYS5sZW5ndGg7XG4gICAgc2l6ZSA9IGIubGVuZ3RoO1xuICAgIHJlc3VsdCA9IHNpemUgPT0gbGVuZ3RoO1xuXG4gICAgaWYgKHJlc3VsdCB8fCBpc1doZXJlKSB7XG4gICAgICAvLyBkZWVwIGNvbXBhcmUgdGhlIGNvbnRlbnRzLCBpZ25vcmluZyBub24tbnVtZXJpYyBwcm9wZXJ0aWVzXG4gICAgICB3aGlsZSAoc2l6ZS0tKSB7XG4gICAgICAgIHZhciBpbmRleCA9IGxlbmd0aCxcbiAgICAgICAgICAgIHZhbHVlID0gYltzaXplXTtcblxuICAgICAgICBpZiAoaXNXaGVyZSkge1xuICAgICAgICAgIHdoaWxlIChpbmRleC0tKSB7XG4gICAgICAgICAgICBpZiAoKHJlc3VsdCA9IGJhc2VJc0VxdWFsKGFbaW5kZXhdLCB2YWx1ZSwgY2FsbGJhY2ssIGlzV2hlcmUsIHN0YWNrQSwgc3RhY2tCKSkpIHtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKCEocmVzdWx0ID0gYmFzZUlzRXF1YWwoYVtzaXplXSwgdmFsdWUsIGNhbGxiYWNrLCBpc1doZXJlLCBzdGFja0EsIHN0YWNrQikpKSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgZWxzZSB7XG4gICAgLy8gZGVlcCBjb21wYXJlIG9iamVjdHMgdXNpbmcgYGZvckluYCwgaW5zdGVhZCBvZiBgZm9yT3duYCwgdG8gYXZvaWQgYE9iamVjdC5rZXlzYFxuICAgIC8vIHdoaWNoLCBpbiB0aGlzIGNhc2UsIGlzIG1vcmUgY29zdGx5XG4gICAgZm9ySW4oYiwgZnVuY3Rpb24odmFsdWUsIGtleSwgYikge1xuICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwoYiwga2V5KSkge1xuICAgICAgICAvLyBjb3VudCB0aGUgbnVtYmVyIG9mIHByb3BlcnRpZXMuXG4gICAgICAgIHNpemUrKztcbiAgICAgICAgLy8gZGVlcCBjb21wYXJlIGVhY2ggcHJvcGVydHkgdmFsdWUuXG4gICAgICAgIHJldHVybiAocmVzdWx0ID0gaGFzT3duUHJvcGVydHkuY2FsbChhLCBrZXkpICYmIGJhc2VJc0VxdWFsKGFba2V5XSwgdmFsdWUsIGNhbGxiYWNrLCBpc1doZXJlLCBzdGFja0EsIHN0YWNrQikpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3VsdCAmJiAhaXNXaGVyZSkge1xuICAgICAgLy8gZW5zdXJlIGJvdGggb2JqZWN0cyBoYXZlIHRoZSBzYW1lIG51bWJlciBvZiBwcm9wZXJ0aWVzXG4gICAgICBmb3JJbihhLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBhKSB7XG4gICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKGEsIGtleSkpIHtcbiAgICAgICAgICAvLyBgc2l6ZWAgd2lsbCBiZSBgLTFgIGlmIGBhYCBoYXMgbW9yZSBwcm9wZXJ0aWVzIHRoYW4gYGJgXG4gICAgICAgICAgcmV0dXJuIChyZXN1bHQgPSAtLXNpemUgPiAtMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBzdGFja0EucG9wKCk7XG4gIHN0YWNrQi5wb3AoKTtcblxuICBpZiAoaW5pdGVkU3RhY2spIHtcbiAgICByZWxlYXNlQXJyYXkoc3RhY2tBKTtcbiAgICByZWxlYXNlQXJyYXkoc3RhY2tCKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VJc0VxdWFsO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBDcmVhdGVzIGEgXCJfLnBsdWNrXCIgc3R5bGUgZnVuY3Rpb24sIHdoaWNoIHJldHVybnMgdGhlIGBrZXlgIHZhbHVlIG9mIGFcbiAqIGdpdmVuIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IFV0aWxpdGllc1xuICogQHBhcmFtIHtzdHJpbmd9IGtleSBUaGUgbmFtZSBvZiB0aGUgcHJvcGVydHkgdG8gcmV0cmlldmUuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqIEBleGFtcGxlXG4gKlxuICogdmFyIGNoYXJhY3RlcnMgPSBbXG4gKiAgIHsgJ25hbWUnOiAnZnJlZCcsICAgJ2FnZSc6IDQwIH0sXG4gKiAgIHsgJ25hbWUnOiAnYmFybmV5JywgJ2FnZSc6IDM2IH1cbiAqIF07XG4gKlxuICogdmFyIGdldE5hbWUgPSBfLnByb3BlcnR5KCduYW1lJyk7XG4gKlxuICogXy5tYXAoY2hhcmFjdGVycywgZ2V0TmFtZSk7XG4gKiAvLyA9PiBbJ2Jhcm5leScsICdmcmVkJ11cbiAqXG4gKiBfLnNvcnRCeShjaGFyYWN0ZXJzLCBnZXROYW1lKTtcbiAqIC8vID0+IFt7ICduYW1lJzogJ2Jhcm5leScsICdhZ2UnOiAzNiB9LCB7ICduYW1lJzogJ2ZyZWQnLCAgICdhZ2UnOiA0MCB9XVxuICovXG5mdW5jdGlvbiBwcm9wZXJ0eShrZXkpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3Rba2V5XTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBwcm9wZXJ0eTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgY3JlYXRlQ2FsbGJhY2sgPSByZXF1aXJlKCdsb2Rhc2guY3JlYXRlY2FsbGJhY2snKSxcbiAgICBmb3JPd24gPSByZXF1aXJlKCdsb2Rhc2guZm9yb3duJyk7XG5cbi8qKlxuICogUmVkdWNlcyBhIGNvbGxlY3Rpb24gdG8gYSB2YWx1ZSB3aGljaCBpcyB0aGUgYWNjdW11bGF0ZWQgcmVzdWx0IG9mIHJ1bm5pbmdcbiAqIGVhY2ggZWxlbWVudCBpbiB0aGUgY29sbGVjdGlvbiB0aHJvdWdoIHRoZSBjYWxsYmFjaywgd2hlcmUgZWFjaCBzdWNjZXNzaXZlXG4gKiBjYWxsYmFjayBleGVjdXRpb24gY29uc3VtZXMgdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgcHJldmlvdXMgZXhlY3V0aW9uLiBJZlxuICogYGFjY3VtdWxhdG9yYCBpcyBub3QgcHJvdmlkZWQgdGhlIGZpcnN0IGVsZW1lbnQgb2YgdGhlIGNvbGxlY3Rpb24gd2lsbCBiZVxuICogdXNlZCBhcyB0aGUgaW5pdGlhbCBgYWNjdW11bGF0b3JgIHZhbHVlLiBUaGUgY2FsbGJhY2sgaXMgYm91bmQgdG8gYHRoaXNBcmdgXG4gKiBhbmQgaW52b2tlZCB3aXRoIGZvdXIgYXJndW1lbnRzOyAoYWNjdW11bGF0b3IsIHZhbHVlLCBpbmRleHxrZXksIGNvbGxlY3Rpb24pLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAYWxpYXMgZm9sZGwsIGluamVjdFxuICogQGNhdGVnb3J5IENvbGxlY3Rpb25zXG4gKiBAcGFyYW0ge0FycmF5fE9iamVjdHxzdHJpbmd9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gaXRlcmF0ZSBvdmVyLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrPWlkZW50aXR5XSBUaGUgZnVuY3Rpb24gY2FsbGVkIHBlciBpdGVyYXRpb24uXG4gKiBAcGFyYW0geyp9IFthY2N1bXVsYXRvcl0gSW5pdGlhbCB2YWx1ZSBvZiB0aGUgYWNjdW11bGF0b3IuXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGNhbGxiYWNrYC5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBhY2N1bXVsYXRlZCB2YWx1ZS5cbiAqIEBleGFtcGxlXG4gKlxuICogdmFyIHN1bSA9IF8ucmVkdWNlKFsxLCAyLCAzXSwgZnVuY3Rpb24oc3VtLCBudW0pIHtcbiAqICAgcmV0dXJuIHN1bSArIG51bTtcbiAqIH0pO1xuICogLy8gPT4gNlxuICpcbiAqIHZhciBtYXBwZWQgPSBfLnJlZHVjZSh7ICdhJzogMSwgJ2InOiAyLCAnYyc6IDMgfSwgZnVuY3Rpb24ocmVzdWx0LCBudW0sIGtleSkge1xuICogICByZXN1bHRba2V5XSA9IG51bSAqIDM7XG4gKiAgIHJldHVybiByZXN1bHQ7XG4gKiB9LCB7fSk7XG4gKiAvLyA9PiB7ICdhJzogMywgJ2InOiA2LCAnYyc6IDkgfVxuICovXG5mdW5jdGlvbiByZWR1Y2UoY29sbGVjdGlvbiwgY2FsbGJhY2ssIGFjY3VtdWxhdG9yLCB0aGlzQXJnKSB7XG4gIGlmICghY29sbGVjdGlvbikgcmV0dXJuIGFjY3VtdWxhdG9yO1xuICB2YXIgbm9hY2N1bSA9IGFyZ3VtZW50cy5sZW5ndGggPCAzO1xuICBjYWxsYmFjayA9IGNyZWF0ZUNhbGxiYWNrKGNhbGxiYWNrLCB0aGlzQXJnLCA0KTtcblxuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IGNvbGxlY3Rpb24ubGVuZ3RoO1xuXG4gIGlmICh0eXBlb2YgbGVuZ3RoID09ICdudW1iZXInKSB7XG4gICAgaWYgKG5vYWNjdW0pIHtcbiAgICAgIGFjY3VtdWxhdG9yID0gY29sbGVjdGlvblsrK2luZGV4XTtcbiAgICB9XG4gICAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICAgIGFjY3VtdWxhdG9yID0gY2FsbGJhY2soYWNjdW11bGF0b3IsIGNvbGxlY3Rpb25baW5kZXhdLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvck93bihjb2xsZWN0aW9uLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgIGFjY3VtdWxhdG9yID0gbm9hY2N1bVxuICAgICAgICA/IChub2FjY3VtID0gZmFsc2UsIHZhbHVlKVxuICAgICAgICA6IGNhbGxiYWNrKGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pXG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGFjY3VtdWxhdG9yO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJlZHVjZTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUZsYXR0ZW4gPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2VmbGF0dGVuJyksXG4gICAgYmFzZVVuaXEgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2V1bmlxJyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBhcnJheSBvZiB1bmlxdWUgdmFsdWVzLCBpbiBvcmRlciwgb2YgdGhlIHByb3ZpZGVkIGFycmF5cyB1c2luZ1xuICogc3RyaWN0IGVxdWFsaXR5IGZvciBjb21wYXJpc29ucywgaS5lLiBgPT09YC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IEFycmF5c1xuICogQHBhcmFtIHsuLi5BcnJheX0gW2FycmF5XSBUaGUgYXJyYXlzIHRvIGluc3BlY3QuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgYW4gYXJyYXkgb2YgY29tYmluZWQgdmFsdWVzLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLnVuaW9uKFsxLCAyLCAzXSwgWzUsIDIsIDEsIDRdLCBbMiwgMV0pO1xuICogLy8gPT4gWzEsIDIsIDMsIDUsIDRdXG4gKi9cbmZ1bmN0aW9uIHVuaW9uKCkge1xuICByZXR1cm4gYmFzZVVuaXEoYmFzZUZsYXR0ZW4oYXJndW1lbnRzLCB0cnVlLCB0cnVlKSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdW5pb247XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VJbmRleE9mID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlaW5kZXhvZicpLFxuICAgIGNhY2hlSW5kZXhPZiA9IHJlcXVpcmUoJ2xvZGFzaC5fY2FjaGVpbmRleG9mJyksXG4gICAgY3JlYXRlQ2FjaGUgPSByZXF1aXJlKCdsb2Rhc2guX2NyZWF0ZWNhY2hlJyksXG4gICAgZ2V0QXJyYXkgPSByZXF1aXJlKCdsb2Rhc2guX2dldGFycmF5JyksXG4gICAgbGFyZ2VBcnJheVNpemUgPSByZXF1aXJlKCdsb2Rhc2guX2xhcmdlYXJyYXlzaXplJyksXG4gICAgcmVsZWFzZUFycmF5ID0gcmVxdWlyZSgnbG9kYXNoLl9yZWxlYXNlYXJyYXknKSxcbiAgICByZWxlYXNlT2JqZWN0ID0gcmVxdWlyZSgnbG9kYXNoLl9yZWxlYXNlb2JqZWN0Jyk7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8udW5pcWAgd2l0aG91dCBzdXBwb3J0IGZvciBjYWxsYmFjayBzaG9ydGhhbmRzXG4gKiBvciBgdGhpc0FyZ2AgYmluZGluZy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIHByb2Nlc3MuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtpc1NvcnRlZD1mYWxzZV0gQSBmbGFnIHRvIGluZGljYXRlIHRoYXQgYGFycmF5YCBpcyBzb3J0ZWQuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2FsbGJhY2tdIFRoZSBmdW5jdGlvbiBjYWxsZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBhIGR1cGxpY2F0ZS12YWx1ZS1mcmVlIGFycmF5LlxuICovXG5mdW5jdGlvbiBiYXNlVW5pcShhcnJheSwgaXNTb3J0ZWQsIGNhbGxiYWNrKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgaW5kZXhPZiA9IGJhc2VJbmRleE9mLFxuICAgICAgbGVuZ3RoID0gYXJyYXkgPyBhcnJheS5sZW5ndGggOiAwLFxuICAgICAgcmVzdWx0ID0gW107XG5cbiAgdmFyIGlzTGFyZ2UgPSAhaXNTb3J0ZWQgJiYgbGVuZ3RoID49IGxhcmdlQXJyYXlTaXplLFxuICAgICAgc2VlbiA9IChjYWxsYmFjayB8fCBpc0xhcmdlKSA/IGdldEFycmF5KCkgOiByZXN1bHQ7XG5cbiAgaWYgKGlzTGFyZ2UpIHtcbiAgICB2YXIgY2FjaGUgPSBjcmVhdGVDYWNoZShzZWVuKTtcbiAgICBpbmRleE9mID0gY2FjaGVJbmRleE9mO1xuICAgIHNlZW4gPSBjYWNoZTtcbiAgfVxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHZhciB2YWx1ZSA9IGFycmF5W2luZGV4XSxcbiAgICAgICAgY29tcHV0ZWQgPSBjYWxsYmFjayA/IGNhbGxiYWNrKHZhbHVlLCBpbmRleCwgYXJyYXkpIDogdmFsdWU7XG5cbiAgICBpZiAoaXNTb3J0ZWRcbiAgICAgICAgICA/ICFpbmRleCB8fCBzZWVuW3NlZW4ubGVuZ3RoIC0gMV0gIT09IGNvbXB1dGVkXG4gICAgICAgICAgOiBpbmRleE9mKHNlZW4sIGNvbXB1dGVkKSA8IDBcbiAgICAgICAgKSB7XG4gICAgICBpZiAoY2FsbGJhY2sgfHwgaXNMYXJnZSkge1xuICAgICAgICBzZWVuLnB1c2goY29tcHV0ZWQpO1xuICAgICAgfVxuICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNMYXJnZSkge1xuICAgIHJlbGVhc2VBcnJheShzZWVuLmFycmF5KTtcbiAgICByZWxlYXNlT2JqZWN0KHNlZW4pO1xuICB9IGVsc2UgaWYgKGNhbGxiYWNrKSB7XG4gICAgcmVsZWFzZUFycmF5KHNlZW4pO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZVVuaXE7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VVbmlxID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNldW5pcScpLFxuICAgIGNyZWF0ZUNhbGxiYWNrID0gcmVxdWlyZSgnbG9kYXNoLmNyZWF0ZWNhbGxiYWNrJyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGR1cGxpY2F0ZS12YWx1ZS1mcmVlIHZlcnNpb24gb2YgYW4gYXJyYXkgdXNpbmcgc3RyaWN0IGVxdWFsaXR5XG4gKiBmb3IgY29tcGFyaXNvbnMsIGkuZS4gYD09PWAuIElmIHRoZSBhcnJheSBpcyBzb3J0ZWQsIHByb3ZpZGluZ1xuICogYHRydWVgIGZvciBgaXNTb3J0ZWRgIHdpbGwgdXNlIGEgZmFzdGVyIGFsZ29yaXRobS4gSWYgYSBjYWxsYmFjayBpcyBwcm92aWRlZFxuICogZWFjaCBlbGVtZW50IG9mIGBhcnJheWAgaXMgcGFzc2VkIHRocm91Z2ggdGhlIGNhbGxiYWNrIGJlZm9yZSB1bmlxdWVuZXNzXG4gKiBpcyBjb21wdXRlZC4gVGhlIGNhbGxiYWNrIGlzIGJvdW5kIHRvIGB0aGlzQXJnYCBhbmQgaW52b2tlZCB3aXRoIHRocmVlXG4gKiBhcmd1bWVudHM7ICh2YWx1ZSwgaW5kZXgsIGFycmF5KS5cbiAqXG4gKiBJZiBhIHByb3BlcnR5IG5hbWUgaXMgcHJvdmlkZWQgZm9yIGBjYWxsYmFja2AgdGhlIGNyZWF0ZWQgXCJfLnBsdWNrXCIgc3R5bGVcbiAqIGNhbGxiYWNrIHdpbGwgcmV0dXJuIHRoZSBwcm9wZXJ0eSB2YWx1ZSBvZiB0aGUgZ2l2ZW4gZWxlbWVudC5cbiAqXG4gKiBJZiBhbiBvYmplY3QgaXMgcHJvdmlkZWQgZm9yIGBjYWxsYmFja2AgdGhlIGNyZWF0ZWQgXCJfLndoZXJlXCIgc3R5bGUgY2FsbGJhY2tcbiAqIHdpbGwgcmV0dXJuIGB0cnVlYCBmb3IgZWxlbWVudHMgdGhhdCBoYXZlIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBnaXZlbiBvYmplY3QsXG4gKiBlbHNlIGBmYWxzZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBhbGlhcyB1bmlxdWVcbiAqIEBjYXRlZ29yeSBBcnJheXNcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBwcm9jZXNzLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNTb3J0ZWQ9ZmFsc2VdIEEgZmxhZyB0byBpbmRpY2F0ZSB0aGF0IGBhcnJheWAgaXMgc29ydGVkLlxuICogQHBhcmFtIHtGdW5jdGlvbnxPYmplY3R8c3RyaW5nfSBbY2FsbGJhY2s9aWRlbnRpdHldIFRoZSBmdW5jdGlvbiBjYWxsZWRcbiAqICBwZXIgaXRlcmF0aW9uLiBJZiBhIHByb3BlcnR5IG5hbWUgb3Igb2JqZWN0IGlzIHByb3ZpZGVkIGl0IHdpbGwgYmUgdXNlZFxuICogIHRvIGNyZWF0ZSBhIFwiXy5wbHVja1wiIG9yIFwiXy53aGVyZVwiIHN0eWxlIGNhbGxiYWNrLCByZXNwZWN0aXZlbHkuXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGNhbGxiYWNrYC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBhIGR1cGxpY2F0ZS12YWx1ZS1mcmVlIGFycmF5LlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLnVuaXEoWzEsIDIsIDEsIDMsIDFdKTtcbiAqIC8vID0+IFsxLCAyLCAzXVxuICpcbiAqIF8udW5pcShbMSwgMSwgMiwgMiwgM10sIHRydWUpO1xuICogLy8gPT4gWzEsIDIsIDNdXG4gKlxuICogXy51bmlxKFsnQScsICdiJywgJ0MnLCAnYScsICdCJywgJ2MnXSwgZnVuY3Rpb24obGV0dGVyKSB7IHJldHVybiBsZXR0ZXIudG9Mb3dlckNhc2UoKTsgfSk7XG4gKiAvLyA9PiBbJ0EnLCAnYicsICdDJ11cbiAqXG4gKiBfLnVuaXEoWzEsIDIuNSwgMywgMS41LCAyLCAzLjVdLCBmdW5jdGlvbihudW0pIHsgcmV0dXJuIHRoaXMuZmxvb3IobnVtKTsgfSwgTWF0aCk7XG4gKiAvLyA9PiBbMSwgMi41LCAzXVxuICpcbiAqIC8vIHVzaW5nIFwiXy5wbHVja1wiIGNhbGxiYWNrIHNob3J0aGFuZFxuICogXy51bmlxKFt7ICd4JzogMSB9LCB7ICd4JzogMiB9LCB7ICd4JzogMSB9XSwgJ3gnKTtcbiAqIC8vID0+IFt7ICd4JzogMSB9LCB7ICd4JzogMiB9XVxuICovXG5mdW5jdGlvbiB1bmlxKGFycmF5LCBpc1NvcnRlZCwgY2FsbGJhY2ssIHRoaXNBcmcpIHtcbiAgLy8ganVnZ2xlIGFyZ3VtZW50c1xuICBpZiAodHlwZW9mIGlzU29ydGVkICE9ICdib29sZWFuJyAmJiBpc1NvcnRlZCAhPSBudWxsKSB7XG4gICAgdGhpc0FyZyA9IGNhbGxiYWNrO1xuICAgIGNhbGxiYWNrID0gKHR5cGVvZiBpc1NvcnRlZCAhPSAnZnVuY3Rpb24nICYmIHRoaXNBcmcgJiYgdGhpc0FyZ1tpc1NvcnRlZF0gPT09IGFycmF5KSA/IG51bGwgOiBpc1NvcnRlZDtcbiAgICBpc1NvcnRlZCA9IGZhbHNlO1xuICB9XG4gIGlmIChjYWxsYmFjayAhPSBudWxsKSB7XG4gICAgY2FsbGJhY2sgPSBjcmVhdGVDYWxsYmFjayhjYWxsYmFjaywgdGhpc0FyZywgMyk7XG4gIH1cbiAgcmV0dXJuIGJhc2VVbmlxKGFycmF5LCBpc1NvcnRlZCwgY2FsbGJhY2spO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHVuaXE7XG4iLCIvKmpzaGludCBiaXR3aXNlOmZhbHNlKi9cbi8qZ2xvYmFsIHVuZXNjYXBlKi9cblxuKGZ1bmN0aW9uIChmYWN0b3J5KSB7XG4gICAgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xuICAgICAgICAvLyBOb2RlL0NvbW1vbkpTXG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIC8vIEFNRFxuICAgICAgICBkZWZpbmUoZmFjdG9yeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQnJvd3NlciBnbG9iYWxzICh3aXRoIHN1cHBvcnQgZm9yIHdlYiB3b3JrZXJzKVxuICAgICAgICB2YXIgZ2xvYjtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGdsb2IgPSB3aW5kb3c7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGdsb2IgPSBzZWxmO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2xvYi5TcGFya01ENSA9IGZhY3RvcnkoKTtcbiAgICB9XG59KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcblxuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuICAgIC8qXG4gICAgICogRmFzdGVzdCBtZDUgaW1wbGVtZW50YXRpb24gYXJvdW5kIChKS00gbWQ1KVxuICAgICAqIENyZWRpdHM6IEpvc2VwaCBNeWVyc1xuICAgICAqXG4gICAgICogQHNlZSBodHRwOi8vd3d3Lm15ZXJzZGFpbHkub3JnL2pvc2VwaC9qYXZhc2NyaXB0L21kNS10ZXh0Lmh0bWxcbiAgICAgKiBAc2VlIGh0dHA6Ly9qc3BlcmYuY29tL21kNS1zaG9vdG91dC83XG4gICAgICovXG5cbiAgICAvKiB0aGlzIGZ1bmN0aW9uIGlzIG11Y2ggZmFzdGVyLFxuICAgICAgc28gaWYgcG9zc2libGUgd2UgdXNlIGl0LiBTb21lIElFc1xuICAgICAgYXJlIHRoZSBvbmx5IG9uZXMgSSBrbm93IG9mIHRoYXRcbiAgICAgIG5lZWQgdGhlIGlkaW90aWMgc2Vjb25kIGZ1bmN0aW9uLFxuICAgICAgZ2VuZXJhdGVkIGJ5IGFuIGlmIGNsYXVzZS4gICovXG4gICAgdmFyIGFkZDMyID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICAgICAgcmV0dXJuIChhICsgYikgJiAweEZGRkZGRkZGO1xuICAgIH0sXG5cbiAgICBjbW4gPSBmdW5jdGlvbiAocSwgYSwgYiwgeCwgcywgdCkge1xuICAgICAgICBhID0gYWRkMzIoYWRkMzIoYSwgcSksIGFkZDMyKHgsIHQpKTtcbiAgICAgICAgcmV0dXJuIGFkZDMyKChhIDw8IHMpIHwgKGEgPj4+ICgzMiAtIHMpKSwgYik7XG4gICAgfSxcblxuICAgIGZmID0gZnVuY3Rpb24gKGEsIGIsIGMsIGQsIHgsIHMsIHQpIHtcbiAgICAgICAgcmV0dXJuIGNtbigoYiAmIGMpIHwgKCh+YikgJiBkKSwgYSwgYiwgeCwgcywgdCk7XG4gICAgfSxcblxuICAgIGdnID0gZnVuY3Rpb24gKGEsIGIsIGMsIGQsIHgsIHMsIHQpIHtcbiAgICAgICAgcmV0dXJuIGNtbigoYiAmIGQpIHwgKGMgJiAofmQpKSwgYSwgYiwgeCwgcywgdCk7XG4gICAgfSxcblxuICAgIGhoID0gZnVuY3Rpb24gKGEsIGIsIGMsIGQsIHgsIHMsIHQpIHtcbiAgICAgICAgcmV0dXJuIGNtbihiIF4gYyBeIGQsIGEsIGIsIHgsIHMsIHQpO1xuICAgIH0sXG5cbiAgICBpaSA9IGZ1bmN0aW9uIChhLCBiLCBjLCBkLCB4LCBzLCB0KSB7XG4gICAgICAgIHJldHVybiBjbW4oYyBeIChiIHwgKH5kKSksIGEsIGIsIHgsIHMsIHQpO1xuICAgIH0sXG5cbiAgICBtZDVjeWNsZSA9IGZ1bmN0aW9uICh4LCBrKSB7XG4gICAgICAgIHZhciBhID0geFswXSxcbiAgICAgICAgICAgIGIgPSB4WzFdLFxuICAgICAgICAgICAgYyA9IHhbMl0sXG4gICAgICAgICAgICBkID0geFszXTtcblxuICAgICAgICBhID0gZmYoYSwgYiwgYywgZCwga1swXSwgNywgLTY4MDg3NjkzNik7XG4gICAgICAgIGQgPSBmZihkLCBhLCBiLCBjLCBrWzFdLCAxMiwgLTM4OTU2NDU4Nik7XG4gICAgICAgIGMgPSBmZihjLCBkLCBhLCBiLCBrWzJdLCAxNywgNjA2MTA1ODE5KTtcbiAgICAgICAgYiA9IGZmKGIsIGMsIGQsIGEsIGtbM10sIDIyLCAtMTA0NDUyNTMzMCk7XG4gICAgICAgIGEgPSBmZihhLCBiLCBjLCBkLCBrWzRdLCA3LCAtMTc2NDE4ODk3KTtcbiAgICAgICAgZCA9IGZmKGQsIGEsIGIsIGMsIGtbNV0sIDEyLCAxMjAwMDgwNDI2KTtcbiAgICAgICAgYyA9IGZmKGMsIGQsIGEsIGIsIGtbNl0sIDE3LCAtMTQ3MzIzMTM0MSk7XG4gICAgICAgIGIgPSBmZihiLCBjLCBkLCBhLCBrWzddLCAyMiwgLTQ1NzA1OTgzKTtcbiAgICAgICAgYSA9IGZmKGEsIGIsIGMsIGQsIGtbOF0sIDcsIDE3NzAwMzU0MTYpO1xuICAgICAgICBkID0gZmYoZCwgYSwgYiwgYywga1s5XSwgMTIsIC0xOTU4NDE0NDE3KTtcbiAgICAgICAgYyA9IGZmKGMsIGQsIGEsIGIsIGtbMTBdLCAxNywgLTQyMDYzKTtcbiAgICAgICAgYiA9IGZmKGIsIGMsIGQsIGEsIGtbMTFdLCAyMiwgLTE5OTA0MDQxNjIpO1xuICAgICAgICBhID0gZmYoYSwgYiwgYywgZCwga1sxMl0sIDcsIDE4MDQ2MDM2ODIpO1xuICAgICAgICBkID0gZmYoZCwgYSwgYiwgYywga1sxM10sIDEyLCAtNDAzNDExMDEpO1xuICAgICAgICBjID0gZmYoYywgZCwgYSwgYiwga1sxNF0sIDE3LCAtMTUwMjAwMjI5MCk7XG4gICAgICAgIGIgPSBmZihiLCBjLCBkLCBhLCBrWzE1XSwgMjIsIDEyMzY1MzUzMjkpO1xuXG4gICAgICAgIGEgPSBnZyhhLCBiLCBjLCBkLCBrWzFdLCA1LCAtMTY1Nzk2NTEwKTtcbiAgICAgICAgZCA9IGdnKGQsIGEsIGIsIGMsIGtbNl0sIDksIC0xMDY5NTAxNjMyKTtcbiAgICAgICAgYyA9IGdnKGMsIGQsIGEsIGIsIGtbMTFdLCAxNCwgNjQzNzE3NzEzKTtcbiAgICAgICAgYiA9IGdnKGIsIGMsIGQsIGEsIGtbMF0sIDIwLCAtMzczODk3MzAyKTtcbiAgICAgICAgYSA9IGdnKGEsIGIsIGMsIGQsIGtbNV0sIDUsIC03MDE1NTg2OTEpO1xuICAgICAgICBkID0gZ2coZCwgYSwgYiwgYywga1sxMF0sIDksIDM4MDE2MDgzKTtcbiAgICAgICAgYyA9IGdnKGMsIGQsIGEsIGIsIGtbMTVdLCAxNCwgLTY2MDQ3ODMzNSk7XG4gICAgICAgIGIgPSBnZyhiLCBjLCBkLCBhLCBrWzRdLCAyMCwgLTQwNTUzNzg0OCk7XG4gICAgICAgIGEgPSBnZyhhLCBiLCBjLCBkLCBrWzldLCA1LCA1Njg0NDY0MzgpO1xuICAgICAgICBkID0gZ2coZCwgYSwgYiwgYywga1sxNF0sIDksIC0xMDE5ODAzNjkwKTtcbiAgICAgICAgYyA9IGdnKGMsIGQsIGEsIGIsIGtbM10sIDE0LCAtMTg3MzYzOTYxKTtcbiAgICAgICAgYiA9IGdnKGIsIGMsIGQsIGEsIGtbOF0sIDIwLCAxMTYzNTMxNTAxKTtcbiAgICAgICAgYSA9IGdnKGEsIGIsIGMsIGQsIGtbMTNdLCA1LCAtMTQ0NDY4MTQ2Nyk7XG4gICAgICAgIGQgPSBnZyhkLCBhLCBiLCBjLCBrWzJdLCA5LCAtNTE0MDM3ODQpO1xuICAgICAgICBjID0gZ2coYywgZCwgYSwgYiwga1s3XSwgMTQsIDE3MzUzMjg0NzMpO1xuICAgICAgICBiID0gZ2coYiwgYywgZCwgYSwga1sxMl0sIDIwLCAtMTkyNjYwNzczNCk7XG5cbiAgICAgICAgYSA9IGhoKGEsIGIsIGMsIGQsIGtbNV0sIDQsIC0zNzg1NTgpO1xuICAgICAgICBkID0gaGgoZCwgYSwgYiwgYywga1s4XSwgMTEsIC0yMDIyNTc0NDYzKTtcbiAgICAgICAgYyA9IGhoKGMsIGQsIGEsIGIsIGtbMTFdLCAxNiwgMTgzOTAzMDU2Mik7XG4gICAgICAgIGIgPSBoaChiLCBjLCBkLCBhLCBrWzE0XSwgMjMsIC0zNTMwOTU1Nik7XG4gICAgICAgIGEgPSBoaChhLCBiLCBjLCBkLCBrWzFdLCA0LCAtMTUzMDk5MjA2MCk7XG4gICAgICAgIGQgPSBoaChkLCBhLCBiLCBjLCBrWzRdLCAxMSwgMTI3Mjg5MzM1Myk7XG4gICAgICAgIGMgPSBoaChjLCBkLCBhLCBiLCBrWzddLCAxNiwgLTE1NTQ5NzYzMik7XG4gICAgICAgIGIgPSBoaChiLCBjLCBkLCBhLCBrWzEwXSwgMjMsIC0xMDk0NzMwNjQwKTtcbiAgICAgICAgYSA9IGhoKGEsIGIsIGMsIGQsIGtbMTNdLCA0LCA2ODEyNzkxNzQpO1xuICAgICAgICBkID0gaGgoZCwgYSwgYiwgYywga1swXSwgMTEsIC0zNTg1MzcyMjIpO1xuICAgICAgICBjID0gaGgoYywgZCwgYSwgYiwga1szXSwgMTYsIC03MjI1MjE5NzkpO1xuICAgICAgICBiID0gaGgoYiwgYywgZCwgYSwga1s2XSwgMjMsIDc2MDI5MTg5KTtcbiAgICAgICAgYSA9IGhoKGEsIGIsIGMsIGQsIGtbOV0sIDQsIC02NDAzNjQ0ODcpO1xuICAgICAgICBkID0gaGgoZCwgYSwgYiwgYywga1sxMl0sIDExLCAtNDIxODE1ODM1KTtcbiAgICAgICAgYyA9IGhoKGMsIGQsIGEsIGIsIGtbMTVdLCAxNiwgNTMwNzQyNTIwKTtcbiAgICAgICAgYiA9IGhoKGIsIGMsIGQsIGEsIGtbMl0sIDIzLCAtOTk1MzM4NjUxKTtcblxuICAgICAgICBhID0gaWkoYSwgYiwgYywgZCwga1swXSwgNiwgLTE5ODYzMDg0NCk7XG4gICAgICAgIGQgPSBpaShkLCBhLCBiLCBjLCBrWzddLCAxMCwgMTEyNjg5MTQxNSk7XG4gICAgICAgIGMgPSBpaShjLCBkLCBhLCBiLCBrWzE0XSwgMTUsIC0xNDE2MzU0OTA1KTtcbiAgICAgICAgYiA9IGlpKGIsIGMsIGQsIGEsIGtbNV0sIDIxLCAtNTc0MzQwNTUpO1xuICAgICAgICBhID0gaWkoYSwgYiwgYywgZCwga1sxMl0sIDYsIDE3MDA0ODU1NzEpO1xuICAgICAgICBkID0gaWkoZCwgYSwgYiwgYywga1szXSwgMTAsIC0xODk0OTg2NjA2KTtcbiAgICAgICAgYyA9IGlpKGMsIGQsIGEsIGIsIGtbMTBdLCAxNSwgLTEwNTE1MjMpO1xuICAgICAgICBiID0gaWkoYiwgYywgZCwgYSwga1sxXSwgMjEsIC0yMDU0OTIyNzk5KTtcbiAgICAgICAgYSA9IGlpKGEsIGIsIGMsIGQsIGtbOF0sIDYsIDE4NzMzMTMzNTkpO1xuICAgICAgICBkID0gaWkoZCwgYSwgYiwgYywga1sxNV0sIDEwLCAtMzA2MTE3NDQpO1xuICAgICAgICBjID0gaWkoYywgZCwgYSwgYiwga1s2XSwgMTUsIC0xNTYwMTk4MzgwKTtcbiAgICAgICAgYiA9IGlpKGIsIGMsIGQsIGEsIGtbMTNdLCAyMSwgMTMwOTE1MTY0OSk7XG4gICAgICAgIGEgPSBpaShhLCBiLCBjLCBkLCBrWzRdLCA2LCAtMTQ1NTIzMDcwKTtcbiAgICAgICAgZCA9IGlpKGQsIGEsIGIsIGMsIGtbMTFdLCAxMCwgLTExMjAyMTAzNzkpO1xuICAgICAgICBjID0gaWkoYywgZCwgYSwgYiwga1syXSwgMTUsIDcxODc4NzI1OSk7XG4gICAgICAgIGIgPSBpaShiLCBjLCBkLCBhLCBrWzldLCAyMSwgLTM0MzQ4NTU1MSk7XG5cbiAgICAgICAgeFswXSA9IGFkZDMyKGEsIHhbMF0pO1xuICAgICAgICB4WzFdID0gYWRkMzIoYiwgeFsxXSk7XG4gICAgICAgIHhbMl0gPSBhZGQzMihjLCB4WzJdKTtcbiAgICAgICAgeFszXSA9IGFkZDMyKGQsIHhbM10pO1xuICAgIH0sXG5cbiAgICAvKiB0aGVyZSBuZWVkcyB0byBiZSBzdXBwb3J0IGZvciBVbmljb2RlIGhlcmUsXG4gICAgICAgKiB1bmxlc3Mgd2UgcHJldGVuZCB0aGF0IHdlIGNhbiByZWRlZmluZSB0aGUgTUQtNVxuICAgICAgICogYWxnb3JpdGhtIGZvciBtdWx0aS1ieXRlIGNoYXJhY3RlcnMgKHBlcmhhcHNcbiAgICAgICAqIGJ5IGFkZGluZyBldmVyeSBmb3VyIDE2LWJpdCBjaGFyYWN0ZXJzIGFuZFxuICAgICAgICogc2hvcnRlbmluZyB0aGUgc3VtIHRvIDMyIGJpdHMpLiBPdGhlcndpc2VcbiAgICAgICAqIEkgc3VnZ2VzdCBwZXJmb3JtaW5nIE1ELTUgYXMgaWYgZXZlcnkgY2hhcmFjdGVyXG4gICAgICAgKiB3YXMgdHdvIGJ5dGVzLS1lLmcuLCAwMDQwIDAwMjUgPSBAJS0tYnV0IHRoZW5cbiAgICAgICAqIGhvdyB3aWxsIGFuIG9yZGluYXJ5IE1ELTUgc3VtIGJlIG1hdGNoZWQ/XG4gICAgICAgKiBUaGVyZSBpcyBubyB3YXkgdG8gc3RhbmRhcmRpemUgdGV4dCB0byBzb21ldGhpbmdcbiAgICAgICAqIGxpa2UgVVRGLTggYmVmb3JlIHRyYW5zZm9ybWF0aW9uOyBzcGVlZCBjb3N0IGlzXG4gICAgICAgKiB1dHRlcmx5IHByb2hpYml0aXZlLiBUaGUgSmF2YVNjcmlwdCBzdGFuZGFyZFxuICAgICAgICogaXRzZWxmIG5lZWRzIHRvIGxvb2sgYXQgdGhpczogaXQgc2hvdWxkIHN0YXJ0XG4gICAgICAgKiBwcm92aWRpbmcgYWNjZXNzIHRvIHN0cmluZ3MgYXMgcHJlZm9ybWVkIFVURi04XG4gICAgICAgKiA4LWJpdCB1bnNpZ25lZCB2YWx1ZSBhcnJheXMuXG4gICAgICAgKi9cbiAgICBtZDVibGsgPSBmdW5jdGlvbiAocykge1xuICAgICAgICB2YXIgbWQ1YmxrcyA9IFtdLFxuICAgICAgICAgICAgaTsgLyogQW5keSBLaW5nIHNhaWQgZG8gaXQgdGhpcyB3YXkuICovXG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDY0OyBpICs9IDQpIHtcbiAgICAgICAgICAgIG1kNWJsa3NbaSA+PiAyXSA9IHMuY2hhckNvZGVBdChpKSArIChzLmNoYXJDb2RlQXQoaSArIDEpIDw8IDgpICsgKHMuY2hhckNvZGVBdChpICsgMikgPDwgMTYpICsgKHMuY2hhckNvZGVBdChpICsgMykgPDwgMjQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZDVibGtzO1xuICAgIH0sXG5cbiAgICBtZDVibGtfYXJyYXkgPSBmdW5jdGlvbiAoYSkge1xuICAgICAgICB2YXIgbWQ1YmxrcyA9IFtdLFxuICAgICAgICAgICAgaTsgLyogQW5keSBLaW5nIHNhaWQgZG8gaXQgdGhpcyB3YXkuICovXG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDY0OyBpICs9IDQpIHtcbiAgICAgICAgICAgIG1kNWJsa3NbaSA+PiAyXSA9IGFbaV0gKyAoYVtpICsgMV0gPDwgOCkgKyAoYVtpICsgMl0gPDwgMTYpICsgKGFbaSArIDNdIDw8IDI0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWQ1YmxrcztcbiAgICB9LFxuXG4gICAgbWQ1MSA9IGZ1bmN0aW9uIChzKSB7XG4gICAgICAgIHZhciBuID0gcy5sZW5ndGgsXG4gICAgICAgICAgICBzdGF0ZSA9IFsxNzMyNTg0MTkzLCAtMjcxNzMzODc5LCAtMTczMjU4NDE5NCwgMjcxNzMzODc4XSxcbiAgICAgICAgICAgIGksXG4gICAgICAgICAgICBsZW5ndGgsXG4gICAgICAgICAgICB0YWlsLFxuICAgICAgICAgICAgdG1wLFxuICAgICAgICAgICAgbG8sXG4gICAgICAgICAgICBoaTtcblxuICAgICAgICBmb3IgKGkgPSA2NDsgaSA8PSBuOyBpICs9IDY0KSB7XG4gICAgICAgICAgICBtZDVjeWNsZShzdGF0ZSwgbWQ1YmxrKHMuc3Vic3RyaW5nKGkgLSA2NCwgaSkpKTtcbiAgICAgICAgfVxuICAgICAgICBzID0gcy5zdWJzdHJpbmcoaSAtIDY0KTtcbiAgICAgICAgbGVuZ3RoID0gcy5sZW5ndGg7XG4gICAgICAgIHRhaWwgPSBbMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMF07XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgdGFpbFtpID4+IDJdIHw9IHMuY2hhckNvZGVBdChpKSA8PCAoKGkgJSA0KSA8PCAzKTtcbiAgICAgICAgfVxuICAgICAgICB0YWlsW2kgPj4gMl0gfD0gMHg4MCA8PCAoKGkgJSA0KSA8PCAzKTtcbiAgICAgICAgaWYgKGkgPiA1NSkge1xuICAgICAgICAgICAgbWQ1Y3ljbGUoc3RhdGUsIHRhaWwpO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IDE2OyBpICs9IDEpIHtcbiAgICAgICAgICAgICAgICB0YWlsW2ldID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEJld2FyZSB0aGF0IHRoZSBmaW5hbCBsZW5ndGggbWlnaHQgbm90IGZpdCBpbiAzMiBiaXRzIHNvIHdlIHRha2UgY2FyZSBvZiB0aGF0XG4gICAgICAgIHRtcCA9IG4gKiA4O1xuICAgICAgICB0bXAgPSB0bXAudG9TdHJpbmcoMTYpLm1hdGNoKC8oLio/KSguezAsOH0pJC8pO1xuICAgICAgICBsbyA9IHBhcnNlSW50KHRtcFsyXSwgMTYpO1xuICAgICAgICBoaSA9IHBhcnNlSW50KHRtcFsxXSwgMTYpIHx8IDA7XG5cbiAgICAgICAgdGFpbFsxNF0gPSBsbztcbiAgICAgICAgdGFpbFsxNV0gPSBoaTtcblxuICAgICAgICBtZDVjeWNsZShzdGF0ZSwgdGFpbCk7XG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9LFxuXG4gICAgbWQ1MV9hcnJheSA9IGZ1bmN0aW9uIChhKSB7XG4gICAgICAgIHZhciBuID0gYS5sZW5ndGgsXG4gICAgICAgICAgICBzdGF0ZSA9IFsxNzMyNTg0MTkzLCAtMjcxNzMzODc5LCAtMTczMjU4NDE5NCwgMjcxNzMzODc4XSxcbiAgICAgICAgICAgIGksXG4gICAgICAgICAgICBsZW5ndGgsXG4gICAgICAgICAgICB0YWlsLFxuICAgICAgICAgICAgdG1wLFxuICAgICAgICAgICAgbG8sXG4gICAgICAgICAgICBoaTtcblxuICAgICAgICBmb3IgKGkgPSA2NDsgaSA8PSBuOyBpICs9IDY0KSB7XG4gICAgICAgICAgICBtZDVjeWNsZShzdGF0ZSwgbWQ1YmxrX2FycmF5KGEuc3ViYXJyYXkoaSAtIDY0LCBpKSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTm90IHN1cmUgaWYgaXQgaXMgYSBidWcsIGhvd2V2ZXIgSUUxMCB3aWxsIGFsd2F5cyBwcm9kdWNlIGEgc3ViIGFycmF5IG9mIGxlbmd0aCAxXG4gICAgICAgIC8vIGNvbnRhaW5pbmcgdGhlIGxhc3QgZWxlbWVudCBvZiB0aGUgcGFyZW50IGFycmF5IGlmIHRoZSBzdWIgYXJyYXkgc3BlY2lmaWVkIHN0YXJ0c1xuICAgICAgICAvLyBiZXlvbmQgdGhlIGxlbmd0aCBvZiB0aGUgcGFyZW50IGFycmF5IC0gd2VpcmQuXG4gICAgICAgIC8vIGh0dHBzOi8vY29ubmVjdC5taWNyb3NvZnQuY29tL0lFL2ZlZWRiYWNrL2RldGFpbHMvNzcxNDUyL3R5cGVkLWFycmF5LXN1YmFycmF5LWlzc3VlXG4gICAgICAgIGEgPSAoaSAtIDY0KSA8IG4gPyBhLnN1YmFycmF5KGkgLSA2NCkgOiBuZXcgVWludDhBcnJheSgwKTtcblxuICAgICAgICBsZW5ndGggPSBhLmxlbmd0aDtcbiAgICAgICAgdGFpbCA9IFswLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwXTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICB0YWlsW2kgPj4gMl0gfD0gYVtpXSA8PCAoKGkgJSA0KSA8PCAzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRhaWxbaSA+PiAyXSB8PSAweDgwIDw8ICgoaSAlIDQpIDw8IDMpO1xuICAgICAgICBpZiAoaSA+IDU1KSB7XG4gICAgICAgICAgICBtZDVjeWNsZShzdGF0ZSwgdGFpbCk7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgMTY7IGkgKz0gMSkge1xuICAgICAgICAgICAgICAgIHRhaWxbaV0gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQmV3YXJlIHRoYXQgdGhlIGZpbmFsIGxlbmd0aCBtaWdodCBub3QgZml0IGluIDMyIGJpdHMgc28gd2UgdGFrZSBjYXJlIG9mIHRoYXRcbiAgICAgICAgdG1wID0gbiAqIDg7XG4gICAgICAgIHRtcCA9IHRtcC50b1N0cmluZygxNikubWF0Y2goLyguKj8pKC57MCw4fSkkLyk7XG4gICAgICAgIGxvID0gcGFyc2VJbnQodG1wWzJdLCAxNik7XG4gICAgICAgIGhpID0gcGFyc2VJbnQodG1wWzFdLCAxNikgfHwgMDtcblxuICAgICAgICB0YWlsWzE0XSA9IGxvO1xuICAgICAgICB0YWlsWzE1XSA9IGhpO1xuXG4gICAgICAgIG1kNWN5Y2xlKHN0YXRlLCB0YWlsKTtcblxuICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgfSxcblxuICAgIGhleF9jaHIgPSBbJzAnLCAnMScsICcyJywgJzMnLCAnNCcsICc1JywgJzYnLCAnNycsICc4JywgJzknLCAnYScsICdiJywgJ2MnLCAnZCcsICdlJywgJ2YnXSxcblxuICAgIHJoZXggPSBmdW5jdGlvbiAobikge1xuICAgICAgICB2YXIgcyA9ICcnLFxuICAgICAgICAgICAgajtcbiAgICAgICAgZm9yIChqID0gMDsgaiA8IDQ7IGogKz0gMSkge1xuICAgICAgICAgICAgcyArPSBoZXhfY2hyWyhuID4+IChqICogOCArIDQpKSAmIDB4MEZdICsgaGV4X2NoclsobiA+PiAoaiAqIDgpKSAmIDB4MEZdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzO1xuICAgIH0sXG5cbiAgICBoZXggPSBmdW5jdGlvbiAoeCkge1xuICAgICAgICB2YXIgaTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IHgubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgIHhbaV0gPSByaGV4KHhbaV0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB4LmpvaW4oJycpO1xuICAgIH0sXG5cbiAgICBtZDUgPSBmdW5jdGlvbiAocykge1xuICAgICAgICByZXR1cm4gaGV4KG1kNTEocykpO1xuICAgIH0sXG5cblxuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgLyoqXG4gICAgICogU3BhcmtNRDUgT09QIGltcGxlbWVudGF0aW9uLlxuICAgICAqXG4gICAgICogVXNlIHRoaXMgY2xhc3MgdG8gcGVyZm9ybSBhbiBpbmNyZW1lbnRhbCBtZDUsIG90aGVyd2lzZSB1c2UgdGhlXG4gICAgICogc3RhdGljIG1ldGhvZHMgaW5zdGVhZC5cbiAgICAgKi9cbiAgICBTcGFya01ENSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gY2FsbCByZXNldCB0byBpbml0IHRoZSBpbnN0YW5jZVxuICAgICAgICB0aGlzLnJlc2V0KCk7XG4gICAgfTtcblxuXG4gICAgLy8gSW4gc29tZSBjYXNlcyB0aGUgZmFzdCBhZGQzMiBmdW5jdGlvbiBjYW5ub3QgYmUgdXNlZC4uXG4gICAgaWYgKG1kNSgnaGVsbG8nKSAhPT0gJzVkNDE0MDJhYmM0YjJhNzZiOTcxOWQ5MTEwMTdjNTkyJykge1xuICAgICAgICBhZGQzMiA9IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgICAgICB2YXIgbHN3ID0gKHggJiAweEZGRkYpICsgKHkgJiAweEZGRkYpLFxuICAgICAgICAgICAgICAgIG1zdyA9ICh4ID4+IDE2KSArICh5ID4+IDE2KSArIChsc3cgPj4gMTYpO1xuICAgICAgICAgICAgcmV0dXJuIChtc3cgPDwgMTYpIHwgKGxzdyAmIDB4RkZGRik7XG4gICAgICAgIH07XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBBcHBlbmRzIGEgc3RyaW5nLlxuICAgICAqIEEgY29udmVyc2lvbiB3aWxsIGJlIGFwcGxpZWQgaWYgYW4gdXRmOCBzdHJpbmcgaXMgZGV0ZWN0ZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc3RyIFRoZSBzdHJpbmcgdG8gYmUgYXBwZW5kZWRcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1NwYXJrTUQ1fSBUaGUgaW5zdGFuY2UgaXRzZWxmXG4gICAgICovXG4gICAgU3BhcmtNRDUucHJvdG90eXBlLmFwcGVuZCA9IGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgICAgLy8gY29udmVydHMgdGhlIHN0cmluZyB0byB1dGY4IGJ5dGVzIGlmIG5lY2Vzc2FyeVxuICAgICAgICBpZiAoL1tcXHUwMDgwLVxcdUZGRkZdLy50ZXN0KHN0cikpIHtcbiAgICAgICAgICAgIHN0ciA9IHVuZXNjYXBlKGVuY29kZVVSSUNvbXBvbmVudChzdHIpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRoZW4gYXBwZW5kIGFzIGJpbmFyeVxuICAgICAgICB0aGlzLmFwcGVuZEJpbmFyeShzdHIpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBBcHBlbmRzIGEgYmluYXJ5IHN0cmluZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjb250ZW50cyBUaGUgYmluYXJ5IHN0cmluZyB0byBiZSBhcHBlbmRlZFxuICAgICAqXG4gICAgICogQHJldHVybiB7U3BhcmtNRDV9IFRoZSBpbnN0YW5jZSBpdHNlbGZcbiAgICAgKi9cbiAgICBTcGFya01ENS5wcm90b3R5cGUuYXBwZW5kQmluYXJ5ID0gZnVuY3Rpb24gKGNvbnRlbnRzKSB7XG4gICAgICAgIHRoaXMuX2J1ZmYgKz0gY29udGVudHM7XG4gICAgICAgIHRoaXMuX2xlbmd0aCArPSBjb250ZW50cy5sZW5ndGg7XG5cbiAgICAgICAgdmFyIGxlbmd0aCA9IHRoaXMuX2J1ZmYubGVuZ3RoLFxuICAgICAgICAgICAgaTtcblxuICAgICAgICBmb3IgKGkgPSA2NDsgaSA8PSBsZW5ndGg7IGkgKz0gNjQpIHtcbiAgICAgICAgICAgIG1kNWN5Y2xlKHRoaXMuX3N0YXRlLCBtZDVibGsodGhpcy5fYnVmZi5zdWJzdHJpbmcoaSAtIDY0LCBpKSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fYnVmZiA9IHRoaXMuX2J1ZmYuc3Vic3RyKGkgLSA2NCk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEZpbmlzaGVzIHRoZSBpbmNyZW1lbnRhbCBjb21wdXRhdGlvbiwgcmVzZXRpbmcgdGhlIGludGVybmFsIHN0YXRlIGFuZFxuICAgICAqIHJldHVybmluZyB0aGUgcmVzdWx0LlxuICAgICAqIFVzZSB0aGUgcmF3IHBhcmFtZXRlciB0byBvYnRhaW4gdGhlIHJhdyByZXN1bHQgaW5zdGVhZCBvZiB0aGUgaGV4IG9uZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gcmF3IFRydWUgdG8gZ2V0IHRoZSByYXcgcmVzdWx0LCBmYWxzZSB0byBnZXQgdGhlIGhleCByZXN1bHRcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ3xBcnJheX0gVGhlIHJlc3VsdFxuICAgICAqL1xuICAgIFNwYXJrTUQ1LnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbiAocmF3KSB7XG4gICAgICAgIHZhciBidWZmID0gdGhpcy5fYnVmZixcbiAgICAgICAgICAgIGxlbmd0aCA9IGJ1ZmYubGVuZ3RoLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIHRhaWwgPSBbMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMF0sXG4gICAgICAgICAgICByZXQ7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICB0YWlsW2kgPj4gMl0gfD0gYnVmZi5jaGFyQ29kZUF0KGkpIDw8ICgoaSAlIDQpIDw8IDMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fZmluaXNoKHRhaWwsIGxlbmd0aCk7XG4gICAgICAgIHJldCA9ICEhcmF3ID8gdGhpcy5fc3RhdGUgOiBoZXgodGhpcy5fc3RhdGUpO1xuXG4gICAgICAgIHRoaXMucmVzZXQoKTtcblxuICAgICAgICByZXR1cm4gcmV0O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBGaW5pc2ggdGhlIGZpbmFsIGNhbGN1bGF0aW9uIGJhc2VkIG9uIHRoZSB0YWlsLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtBcnJheX0gIHRhaWwgICBUaGUgdGFpbCAod2lsbCBiZSBtb2RpZmllZClcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGVuZ3RoIFRoZSBsZW5ndGggb2YgdGhlIHJlbWFpbmluZyBidWZmZXJcbiAgICAgKi9cbiAgICBTcGFya01ENS5wcm90b3R5cGUuX2ZpbmlzaCA9IGZ1bmN0aW9uICh0YWlsLCBsZW5ndGgpIHtcbiAgICAgICAgdmFyIGkgPSBsZW5ndGgsXG4gICAgICAgICAgICB0bXAsXG4gICAgICAgICAgICBsbyxcbiAgICAgICAgICAgIGhpO1xuXG4gICAgICAgIHRhaWxbaSA+PiAyXSB8PSAweDgwIDw8ICgoaSAlIDQpIDw8IDMpO1xuICAgICAgICBpZiAoaSA+IDU1KSB7XG4gICAgICAgICAgICBtZDVjeWNsZSh0aGlzLl9zdGF0ZSwgdGFpbCk7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgMTY7IGkgKz0gMSkge1xuICAgICAgICAgICAgICAgIHRhaWxbaV0gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRG8gdGhlIGZpbmFsIGNvbXB1dGF0aW9uIGJhc2VkIG9uIHRoZSB0YWlsIGFuZCBsZW5ndGhcbiAgICAgICAgLy8gQmV3YXJlIHRoYXQgdGhlIGZpbmFsIGxlbmd0aCBtYXkgbm90IGZpdCBpbiAzMiBiaXRzIHNvIHdlIHRha2UgY2FyZSBvZiB0aGF0XG4gICAgICAgIHRtcCA9IHRoaXMuX2xlbmd0aCAqIDg7XG4gICAgICAgIHRtcCA9IHRtcC50b1N0cmluZygxNikubWF0Y2goLyguKj8pKC57MCw4fSkkLyk7XG4gICAgICAgIGxvID0gcGFyc2VJbnQodG1wWzJdLCAxNik7XG4gICAgICAgIGhpID0gcGFyc2VJbnQodG1wWzFdLCAxNikgfHwgMDtcblxuICAgICAgICB0YWlsWzE0XSA9IGxvO1xuICAgICAgICB0YWlsWzE1XSA9IGhpO1xuICAgICAgICBtZDVjeWNsZSh0aGlzLl9zdGF0ZSwgdGFpbCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFJlc2V0cyB0aGUgaW50ZXJuYWwgc3RhdGUgb2YgdGhlIGNvbXB1dGF0aW9uLlxuICAgICAqXG4gICAgICogQHJldHVybiB7U3BhcmtNRDV9IFRoZSBpbnN0YW5jZSBpdHNlbGZcbiAgICAgKi9cbiAgICBTcGFya01ENS5wcm90b3R5cGUucmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuX2J1ZmYgPSBcIlwiO1xuICAgICAgICB0aGlzLl9sZW5ndGggPSAwO1xuICAgICAgICB0aGlzLl9zdGF0ZSA9IFsxNzMyNTg0MTkzLCAtMjcxNzMzODc5LCAtMTczMjU4NDE5NCwgMjcxNzMzODc4XTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmVsZWFzZXMgbWVtb3J5IHVzZWQgYnkgdGhlIGluY3JlbWVudGFsIGJ1ZmZlciBhbmQgb3RoZXIgYWRpdGlvbmFsXG4gICAgICogcmVzb3VyY2VzLiBJZiB5b3UgcGxhbiB0byB1c2UgdGhlIGluc3RhbmNlIGFnYWluLCB1c2UgcmVzZXQgaW5zdGVhZC5cbiAgICAgKi9cbiAgICBTcGFya01ENS5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuX3N0YXRlO1xuICAgICAgICBkZWxldGUgdGhpcy5fYnVmZjtcbiAgICAgICAgZGVsZXRlIHRoaXMuX2xlbmd0aDtcbiAgICB9O1xuXG5cbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyB0aGUgbWQ1IGhhc2ggb24gYSBzdHJpbmcuXG4gICAgICogQSBjb252ZXJzaW9uIHdpbGwgYmUgYXBwbGllZCBpZiB1dGY4IHN0cmluZyBpcyBkZXRlY3RlZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSAgc3RyIFRoZSBzdHJpbmdcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHJhdyBUcnVlIHRvIGdldCB0aGUgcmF3IHJlc3VsdCwgZmFsc2UgdG8gZ2V0IHRoZSBoZXggcmVzdWx0XG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd8QXJyYXl9IFRoZSByZXN1bHRcbiAgICAgKi9cbiAgICBTcGFya01ENS5oYXNoID0gZnVuY3Rpb24gKHN0ciwgcmF3KSB7XG4gICAgICAgIC8vIGNvbnZlcnRzIHRoZSBzdHJpbmcgdG8gdXRmOCBieXRlcyBpZiBuZWNlc3NhcnlcbiAgICAgICAgaWYgKC9bXFx1MDA4MC1cXHVGRkZGXS8udGVzdChzdHIpKSB7XG4gICAgICAgICAgICBzdHIgPSB1bmVzY2FwZShlbmNvZGVVUklDb21wb25lbnQoc3RyKSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaGFzaCA9IG1kNTEoc3RyKTtcblxuICAgICAgICByZXR1cm4gISFyYXcgPyBoYXNoIDogaGV4KGhhc2gpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyB0aGUgbWQ1IGhhc2ggb24gYSBiaW5hcnkgc3RyaW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9ICBjb250ZW50IFRoZSBiaW5hcnkgc3RyaW5nXG4gICAgICogQHBhcmFtIHtCb29sZWFufSByYXcgICAgIFRydWUgdG8gZ2V0IHRoZSByYXcgcmVzdWx0LCBmYWxzZSB0byBnZXQgdGhlIGhleCByZXN1bHRcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ3xBcnJheX0gVGhlIHJlc3VsdFxuICAgICAqL1xuICAgIFNwYXJrTUQ1Lmhhc2hCaW5hcnkgPSBmdW5jdGlvbiAoY29udGVudCwgcmF3KSB7XG4gICAgICAgIHZhciBoYXNoID0gbWQ1MShjb250ZW50KTtcblxuICAgICAgICByZXR1cm4gISFyYXcgPyBoYXNoIDogaGV4KGhhc2gpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBTcGFya01ENSBPT1AgaW1wbGVtZW50YXRpb24gZm9yIGFycmF5IGJ1ZmZlcnMuXG4gICAgICpcbiAgICAgKiBVc2UgdGhpcyBjbGFzcyB0byBwZXJmb3JtIGFuIGluY3JlbWVudGFsIG1kNSBPTkxZIGZvciBhcnJheSBidWZmZXJzLlxuICAgICAqL1xuICAgIFNwYXJrTUQ1LkFycmF5QnVmZmVyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBjYWxsIHJlc2V0IHRvIGluaXQgdGhlIGluc3RhbmNlXG4gICAgICAgIHRoaXMucmVzZXQoKTtcbiAgICB9O1xuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgLyoqXG4gICAgICogQXBwZW5kcyBhbiBhcnJheSBidWZmZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0FycmF5QnVmZmVyfSBhcnIgVGhlIGFycmF5IHRvIGJlIGFwcGVuZGVkXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtTcGFya01ENS5BcnJheUJ1ZmZlcn0gVGhlIGluc3RhbmNlIGl0c2VsZlxuICAgICAqL1xuICAgIFNwYXJrTUQ1LkFycmF5QnVmZmVyLnByb3RvdHlwZS5hcHBlbmQgPSBmdW5jdGlvbiAoYXJyKSB7XG4gICAgICAgIC8vIFRPRE86IHdlIGNvdWxkIGF2b2lkIHRoZSBjb25jYXRlbmF0aW9uIGhlcmUgYnV0IHRoZSBhbGdvcml0aG0gd291bGQgYmUgbW9yZSBjb21wbGV4XG4gICAgICAgIC8vICAgICAgIGlmIHlvdSBmaW5kIHlvdXJzZWxmIG5lZWRpbmcgZXh0cmEgcGVyZm9ybWFuY2UsIHBsZWFzZSBtYWtlIGEgUFIuXG4gICAgICAgIHZhciBidWZmID0gdGhpcy5fY29uY2F0QXJyYXlCdWZmZXIodGhpcy5fYnVmZiwgYXJyKSxcbiAgICAgICAgICAgIGxlbmd0aCA9IGJ1ZmYubGVuZ3RoLFxuICAgICAgICAgICAgaTtcblxuICAgICAgICB0aGlzLl9sZW5ndGggKz0gYXJyLmJ5dGVMZW5ndGg7XG5cbiAgICAgICAgZm9yIChpID0gNjQ7IGkgPD0gbGVuZ3RoOyBpICs9IDY0KSB7XG4gICAgICAgICAgICBtZDVjeWNsZSh0aGlzLl9zdGF0ZSwgbWQ1YmxrX2FycmF5KGJ1ZmYuc3ViYXJyYXkoaSAtIDY0LCBpKSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQXZvaWRzIElFMTAgd2VpcmRuZXNzIChkb2N1bWVudGVkIGFib3ZlKVxuICAgICAgICB0aGlzLl9idWZmID0gKGkgLSA2NCkgPCBsZW5ndGggPyBidWZmLnN1YmFycmF5KGkgLSA2NCkgOiBuZXcgVWludDhBcnJheSgwKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRmluaXNoZXMgdGhlIGluY3JlbWVudGFsIGNvbXB1dGF0aW9uLCByZXNldGluZyB0aGUgaW50ZXJuYWwgc3RhdGUgYW5kXG4gICAgICogcmV0dXJuaW5nIHRoZSByZXN1bHQuXG4gICAgICogVXNlIHRoZSByYXcgcGFyYW1ldGVyIHRvIG9idGFpbiB0aGUgcmF3IHJlc3VsdCBpbnN0ZWFkIG9mIHRoZSBoZXggb25lLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtCb29sZWFufSByYXcgVHJ1ZSB0byBnZXQgdGhlIHJhdyByZXN1bHQsIGZhbHNlIHRvIGdldCB0aGUgaGV4IHJlc3VsdFxuICAgICAqXG4gICAgICogQHJldHVybiB7U3RyaW5nfEFycmF5fSBUaGUgcmVzdWx0XG4gICAgICovXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIucHJvdG90eXBlLmVuZCA9IGZ1bmN0aW9uIChyYXcpIHtcbiAgICAgICAgdmFyIGJ1ZmYgPSB0aGlzLl9idWZmLFxuICAgICAgICAgICAgbGVuZ3RoID0gYnVmZi5sZW5ndGgsXG4gICAgICAgICAgICB0YWlsID0gWzAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDBdLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIHJldDtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgIHRhaWxbaSA+PiAyXSB8PSBidWZmW2ldIDw8ICgoaSAlIDQpIDw8IDMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fZmluaXNoKHRhaWwsIGxlbmd0aCk7XG4gICAgICAgIHJldCA9ICEhcmF3ID8gdGhpcy5fc3RhdGUgOiBoZXgodGhpcy5fc3RhdGUpO1xuXG4gICAgICAgIHRoaXMucmVzZXQoKTtcblxuICAgICAgICByZXR1cm4gcmV0O1xuICAgIH07XG5cbiAgICBTcGFya01ENS5BcnJheUJ1ZmZlci5wcm90b3R5cGUuX2ZpbmlzaCA9IFNwYXJrTUQ1LnByb3RvdHlwZS5fZmluaXNoO1xuXG4gICAgLyoqXG4gICAgICogUmVzZXRzIHRoZSBpbnRlcm5hbCBzdGF0ZSBvZiB0aGUgY29tcHV0YXRpb24uXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtTcGFya01ENS5BcnJheUJ1ZmZlcn0gVGhlIGluc3RhbmNlIGl0c2VsZlxuICAgICAqL1xuICAgIFNwYXJrTUQ1LkFycmF5QnVmZmVyLnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5fYnVmZiA9IG5ldyBVaW50OEFycmF5KDApO1xuICAgICAgICB0aGlzLl9sZW5ndGggPSAwO1xuICAgICAgICB0aGlzLl9zdGF0ZSA9IFsxNzMyNTg0MTkzLCAtMjcxNzMzODc5LCAtMTczMjU4NDE5NCwgMjcxNzMzODc4XTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmVsZWFzZXMgbWVtb3J5IHVzZWQgYnkgdGhlIGluY3JlbWVudGFsIGJ1ZmZlciBhbmQgb3RoZXIgYWRpdGlvbmFsXG4gICAgICogcmVzb3VyY2VzLiBJZiB5b3UgcGxhbiB0byB1c2UgdGhlIGluc3RhbmNlIGFnYWluLCB1c2UgcmVzZXQgaW5zdGVhZC5cbiAgICAgKi9cbiAgICBTcGFya01ENS5BcnJheUJ1ZmZlci5wcm90b3R5cGUuZGVzdHJveSA9IFNwYXJrTUQ1LnByb3RvdHlwZS5kZXN0cm95O1xuXG4gICAgLyoqXG4gICAgICogQ29uY2F0cyB0d28gYXJyYXkgYnVmZmVycywgcmV0dXJuaW5nIGEgbmV3IG9uZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSAge0FycmF5QnVmZmVyfSBmaXJzdCAgVGhlIGZpcnN0IGFycmF5IGJ1ZmZlclxuICAgICAqIEBwYXJhbSAge0FycmF5QnVmZmVyfSBzZWNvbmQgVGhlIHNlY29uZCBhcnJheSBidWZmZXJcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge0FycmF5QnVmZmVyfSBUaGUgbmV3IGFycmF5IGJ1ZmZlclxuICAgICAqL1xuICAgIFNwYXJrTUQ1LkFycmF5QnVmZmVyLnByb3RvdHlwZS5fY29uY2F0QXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoZmlyc3QsIHNlY29uZCkge1xuICAgICAgICB2YXIgZmlyc3RMZW5ndGggPSBmaXJzdC5sZW5ndGgsXG4gICAgICAgICAgICByZXN1bHQgPSBuZXcgVWludDhBcnJheShmaXJzdExlbmd0aCArIHNlY29uZC5ieXRlTGVuZ3RoKTtcblxuICAgICAgICByZXN1bHQuc2V0KGZpcnN0KTtcbiAgICAgICAgcmVzdWx0LnNldChuZXcgVWludDhBcnJheShzZWNvbmQpLCBmaXJzdExlbmd0aCk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUGVyZm9ybXMgdGhlIG1kNSBoYXNoIG9uIGFuIGFycmF5IGJ1ZmZlci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ9IGFyciBUaGUgYXJyYXkgYnVmZmVyXG4gICAgICogQHBhcmFtIHtCb29sZWFufSAgICAgcmF3IFRydWUgdG8gZ2V0IHRoZSByYXcgcmVzdWx0LCBmYWxzZSB0byBnZXQgdGhlIGhleCByZXN1bHRcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ3xBcnJheX0gVGhlIHJlc3VsdFxuICAgICAqL1xuICAgIFNwYXJrTUQ1LkFycmF5QnVmZmVyLmhhc2ggPSBmdW5jdGlvbiAoYXJyLCByYXcpIHtcbiAgICAgICAgdmFyIGhhc2ggPSBtZDUxX2FycmF5KG5ldyBVaW50OEFycmF5KGFycikpO1xuXG4gICAgICAgIHJldHVybiAhIXJhdyA/IGhhc2ggOiBoZXgoaGFzaCk7XG4gICAgfTtcblxuICAgIHJldHVybiBTcGFya01ENTtcbn0pKTtcbiIsInZhciB0cmF2ZXJzZSA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikge1xuICAgIHJldHVybiBuZXcgVHJhdmVyc2Uob2JqKTtcbn07XG5cbmZ1bmN0aW9uIFRyYXZlcnNlIChvYmopIHtcbiAgICB0aGlzLnZhbHVlID0gb2JqO1xufVxuXG5UcmF2ZXJzZS5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKHBzKSB7XG4gICAgdmFyIG5vZGUgPSB0aGlzLnZhbHVlO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcHMubGVuZ3RoOyBpICsrKSB7XG4gICAgICAgIHZhciBrZXkgPSBwc1tpXTtcbiAgICAgICAgaWYgKCFub2RlIHx8ICFoYXNPd25Qcm9wZXJ0eS5jYWxsKG5vZGUsIGtleSkpIHtcbiAgICAgICAgICAgIG5vZGUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBub2RlID0gbm9kZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gbm9kZTtcbn07XG5cblRyYXZlcnNlLnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbiAocHMpIHtcbiAgICB2YXIgbm9kZSA9IHRoaXMudmFsdWU7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcy5sZW5ndGg7IGkgKyspIHtcbiAgICAgICAgdmFyIGtleSA9IHBzW2ldO1xuICAgICAgICBpZiAoIW5vZGUgfHwgIWhhc093blByb3BlcnR5LmNhbGwobm9kZSwga2V5KSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIG5vZGUgPSBub2RlW2tleV07XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufTtcblxuVHJhdmVyc2UucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIChwcywgdmFsdWUpIHtcbiAgICB2YXIgbm9kZSA9IHRoaXMudmFsdWU7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcy5sZW5ndGggLSAxOyBpICsrKSB7XG4gICAgICAgIHZhciBrZXkgPSBwc1tpXTtcbiAgICAgICAgaWYgKCFoYXNPd25Qcm9wZXJ0eS5jYWxsKG5vZGUsIGtleSkpIG5vZGVba2V5XSA9IHt9O1xuICAgICAgICBub2RlID0gbm9kZVtrZXldO1xuICAgIH1cbiAgICBub2RlW3BzW2ldXSA9IHZhbHVlO1xuICAgIHJldHVybiB2YWx1ZTtcbn07XG5cblRyYXZlcnNlLnByb3RvdHlwZS5tYXAgPSBmdW5jdGlvbiAoY2IpIHtcbiAgICByZXR1cm4gd2Fsayh0aGlzLnZhbHVlLCBjYiwgdHJ1ZSk7XG59O1xuXG5UcmF2ZXJzZS5wcm90b3R5cGUuZm9yRWFjaCA9IGZ1bmN0aW9uIChjYikge1xuICAgIHRoaXMudmFsdWUgPSB3YWxrKHRoaXMudmFsdWUsIGNiLCBmYWxzZSk7XG4gICAgcmV0dXJuIHRoaXMudmFsdWU7XG59O1xuXG5UcmF2ZXJzZS5wcm90b3R5cGUucmVkdWNlID0gZnVuY3Rpb24gKGNiLCBpbml0KSB7XG4gICAgdmFyIHNraXAgPSBhcmd1bWVudHMubGVuZ3RoID09PSAxO1xuICAgIHZhciBhY2MgPSBza2lwID8gdGhpcy52YWx1ZSA6IGluaXQ7XG4gICAgdGhpcy5mb3JFYWNoKGZ1bmN0aW9uICh4KSB7XG4gICAgICAgIGlmICghdGhpcy5pc1Jvb3QgfHwgIXNraXApIHtcbiAgICAgICAgICAgIGFjYyA9IGNiLmNhbGwodGhpcywgYWNjLCB4KTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBhY2M7XG59O1xuXG5UcmF2ZXJzZS5wcm90b3R5cGUucGF0aHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGFjYyA9IFtdO1xuICAgIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAoeCkge1xuICAgICAgICBhY2MucHVzaCh0aGlzLnBhdGgpOyBcbiAgICB9KTtcbiAgICByZXR1cm4gYWNjO1xufTtcblxuVHJhdmVyc2UucHJvdG90eXBlLm5vZGVzID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBhY2MgPSBbXTtcbiAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgYWNjLnB1c2godGhpcy5ub2RlKTtcbiAgICB9KTtcbiAgICByZXR1cm4gYWNjO1xufTtcblxuVHJhdmVyc2UucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBwYXJlbnRzID0gW10sIG5vZGVzID0gW107XG4gICAgXG4gICAgcmV0dXJuIChmdW5jdGlvbiBjbG9uZSAoc3JjKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGFyZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHBhcmVudHNbaV0gPT09IHNyYykge1xuICAgICAgICAgICAgICAgIHJldHVybiBub2Rlc1tpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKHR5cGVvZiBzcmMgPT09ICdvYmplY3QnICYmIHNyYyAhPT0gbnVsbCkge1xuICAgICAgICAgICAgdmFyIGRzdCA9IGNvcHkoc3JjKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcGFyZW50cy5wdXNoKHNyYyk7XG4gICAgICAgICAgICBub2Rlcy5wdXNoKGRzdCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvckVhY2gob2JqZWN0S2V5cyhzcmMpLCBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICAgICAgZHN0W2tleV0gPSBjbG9uZShzcmNba2V5XSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcGFyZW50cy5wb3AoKTtcbiAgICAgICAgICAgIG5vZGVzLnBvcCgpO1xuICAgICAgICAgICAgcmV0dXJuIGRzdDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBzcmM7XG4gICAgICAgIH1cbiAgICB9KSh0aGlzLnZhbHVlKTtcbn07XG5cbmZ1bmN0aW9uIHdhbGsgKHJvb3QsIGNiLCBpbW11dGFibGUpIHtcbiAgICB2YXIgcGF0aCA9IFtdO1xuICAgIHZhciBwYXJlbnRzID0gW107XG4gICAgdmFyIGFsaXZlID0gdHJ1ZTtcbiAgICBcbiAgICByZXR1cm4gKGZ1bmN0aW9uIHdhbGtlciAobm9kZV8pIHtcbiAgICAgICAgdmFyIG5vZGUgPSBpbW11dGFibGUgPyBjb3B5KG5vZGVfKSA6IG5vZGVfO1xuICAgICAgICB2YXIgbW9kaWZpZXJzID0ge307XG4gICAgICAgIFxuICAgICAgICB2YXIga2VlcEdvaW5nID0gdHJ1ZTtcbiAgICAgICAgXG4gICAgICAgIHZhciBzdGF0ZSA9IHtcbiAgICAgICAgICAgIG5vZGUgOiBub2RlLFxuICAgICAgICAgICAgbm9kZV8gOiBub2RlXyxcbiAgICAgICAgICAgIHBhdGggOiBbXS5jb25jYXQocGF0aCksXG4gICAgICAgICAgICBwYXJlbnQgOiBwYXJlbnRzW3BhcmVudHMubGVuZ3RoIC0gMV0sXG4gICAgICAgICAgICBwYXJlbnRzIDogcGFyZW50cyxcbiAgICAgICAgICAgIGtleSA6IHBhdGguc2xpY2UoLTEpWzBdLFxuICAgICAgICAgICAgaXNSb290IDogcGF0aC5sZW5ndGggPT09IDAsXG4gICAgICAgICAgICBsZXZlbCA6IHBhdGgubGVuZ3RoLFxuICAgICAgICAgICAgY2lyY3VsYXIgOiBudWxsLFxuICAgICAgICAgICAgdXBkYXRlIDogZnVuY3Rpb24gKHgsIHN0b3BIZXJlKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS5pc1Jvb3QpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUucGFyZW50Lm5vZGVbc3RhdGUua2V5XSA9IHg7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHN0YXRlLm5vZGUgPSB4O1xuICAgICAgICAgICAgICAgIGlmIChzdG9wSGVyZSkga2VlcEdvaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ2RlbGV0ZScgOiBmdW5jdGlvbiAoc3RvcEhlcmUpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgc3RhdGUucGFyZW50Lm5vZGVbc3RhdGUua2V5XTtcbiAgICAgICAgICAgICAgICBpZiAoc3RvcEhlcmUpIGtlZXBHb2luZyA9IGZhbHNlO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHJlbW92ZSA6IGZ1bmN0aW9uIChzdG9wSGVyZSkge1xuICAgICAgICAgICAgICAgIGlmIChpc0FycmF5KHN0YXRlLnBhcmVudC5ub2RlKSkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5wYXJlbnQubm9kZS5zcGxpY2Uoc3RhdGUua2V5LCAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBzdGF0ZS5wYXJlbnQubm9kZVtzdGF0ZS5rZXldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc3RvcEhlcmUpIGtlZXBHb2luZyA9IGZhbHNlO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGtleXMgOiBudWxsLFxuICAgICAgICAgICAgYmVmb3JlIDogZnVuY3Rpb24gKGYpIHsgbW9kaWZpZXJzLmJlZm9yZSA9IGYgfSxcbiAgICAgICAgICAgIGFmdGVyIDogZnVuY3Rpb24gKGYpIHsgbW9kaWZpZXJzLmFmdGVyID0gZiB9LFxuICAgICAgICAgICAgcHJlIDogZnVuY3Rpb24gKGYpIHsgbW9kaWZpZXJzLnByZSA9IGYgfSxcbiAgICAgICAgICAgIHBvc3QgOiBmdW5jdGlvbiAoZikgeyBtb2RpZmllcnMucG9zdCA9IGYgfSxcbiAgICAgICAgICAgIHN0b3AgOiBmdW5jdGlvbiAoKSB7IGFsaXZlID0gZmFsc2UgfSxcbiAgICAgICAgICAgIGJsb2NrIDogZnVuY3Rpb24gKCkgeyBrZWVwR29pbmcgPSBmYWxzZSB9XG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgICBpZiAoIWFsaXZlKSByZXR1cm4gc3RhdGU7XG4gICAgICAgIFxuICAgICAgICBmdW5jdGlvbiB1cGRhdGVTdGF0ZSgpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc3RhdGUubm9kZSA9PT0gJ29iamVjdCcgJiYgc3RhdGUubm9kZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGlmICghc3RhdGUua2V5cyB8fCBzdGF0ZS5ub2RlXyAhPT0gc3RhdGUubm9kZSkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5rZXlzID0gb2JqZWN0S2V5cyhzdGF0ZS5ub2RlKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBzdGF0ZS5pc0xlYWYgPSBzdGF0ZS5rZXlzLmxlbmd0aCA9PSAwO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGFyZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAocGFyZW50c1tpXS5ub2RlXyA9PT0gbm9kZV8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmNpcmN1bGFyID0gcGFyZW50c1tpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgc3RhdGUuaXNMZWFmID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBzdGF0ZS5rZXlzID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgc3RhdGUubm90TGVhZiA9ICFzdGF0ZS5pc0xlYWY7XG4gICAgICAgICAgICBzdGF0ZS5ub3RSb290ID0gIXN0YXRlLmlzUm9vdDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgdXBkYXRlU3RhdGUoKTtcbiAgICAgICAgXG4gICAgICAgIC8vIHVzZSByZXR1cm4gdmFsdWVzIHRvIHVwZGF0ZSBpZiBkZWZpbmVkXG4gICAgICAgIHZhciByZXQgPSBjYi5jYWxsKHN0YXRlLCBzdGF0ZS5ub2RlKTtcbiAgICAgICAgaWYgKHJldCAhPT0gdW5kZWZpbmVkICYmIHN0YXRlLnVwZGF0ZSkgc3RhdGUudXBkYXRlKHJldCk7XG4gICAgICAgIFxuICAgICAgICBpZiAobW9kaWZpZXJzLmJlZm9yZSkgbW9kaWZpZXJzLmJlZm9yZS5jYWxsKHN0YXRlLCBzdGF0ZS5ub2RlKTtcbiAgICAgICAgXG4gICAgICAgIGlmICgha2VlcEdvaW5nKSByZXR1cm4gc3RhdGU7XG4gICAgICAgIFxuICAgICAgICBpZiAodHlwZW9mIHN0YXRlLm5vZGUgPT0gJ29iamVjdCdcbiAgICAgICAgJiYgc3RhdGUubm9kZSAhPT0gbnVsbCAmJiAhc3RhdGUuY2lyY3VsYXIpIHtcbiAgICAgICAgICAgIHBhcmVudHMucHVzaChzdGF0ZSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHVwZGF0ZVN0YXRlKCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvckVhY2goc3RhdGUua2V5cywgZnVuY3Rpb24gKGtleSwgaSkge1xuICAgICAgICAgICAgICAgIHBhdGgucHVzaChrZXkpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChtb2RpZmllcnMucHJlKSBtb2RpZmllcnMucHJlLmNhbGwoc3RhdGUsIHN0YXRlLm5vZGVba2V5XSwga2V5KTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICB2YXIgY2hpbGQgPSB3YWxrZXIoc3RhdGUubm9kZVtrZXldKTtcbiAgICAgICAgICAgICAgICBpZiAoaW1tdXRhYmxlICYmIGhhc093blByb3BlcnR5LmNhbGwoc3RhdGUubm9kZSwga2V5KSkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5ub2RlW2tleV0gPSBjaGlsZC5ub2RlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBjaGlsZC5pc0xhc3QgPSBpID09IHN0YXRlLmtleXMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgICAgICBjaGlsZC5pc0ZpcnN0ID0gaSA9PSAwO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChtb2RpZmllcnMucG9zdCkgbW9kaWZpZXJzLnBvc3QuY2FsbChzdGF0ZSwgY2hpbGQpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHBhdGgucG9wKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhcmVudHMucG9wKCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChtb2RpZmllcnMuYWZ0ZXIpIG1vZGlmaWVycy5hZnRlci5jYWxsKHN0YXRlLCBzdGF0ZS5ub2RlKTtcbiAgICAgICAgXG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9KShyb290KS5ub2RlO1xufVxuXG5mdW5jdGlvbiBjb3B5IChzcmMpIHtcbiAgICBpZiAodHlwZW9mIHNyYyA9PT0gJ29iamVjdCcgJiYgc3JjICE9PSBudWxsKSB7XG4gICAgICAgIHZhciBkc3Q7XG4gICAgICAgIFxuICAgICAgICBpZiAoaXNBcnJheShzcmMpKSB7XG4gICAgICAgICAgICBkc3QgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc0RhdGUoc3JjKSkge1xuICAgICAgICAgICAgZHN0ID0gbmV3IERhdGUoc3JjLmdldFRpbWUgPyBzcmMuZ2V0VGltZSgpIDogc3JjKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc1JlZ0V4cChzcmMpKSB7XG4gICAgICAgICAgICBkc3QgPSBuZXcgUmVnRXhwKHNyYyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXNFcnJvcihzcmMpKSB7XG4gICAgICAgICAgICBkc3QgPSB7IG1lc3NhZ2U6IHNyYy5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXNCb29sZWFuKHNyYykpIHtcbiAgICAgICAgICAgIGRzdCA9IG5ldyBCb29sZWFuKHNyYyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXNOdW1iZXIoc3JjKSkge1xuICAgICAgICAgICAgZHN0ID0gbmV3IE51bWJlcihzcmMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGlzU3RyaW5nKHNyYykpIHtcbiAgICAgICAgICAgIGRzdCA9IG5ldyBTdHJpbmcoc3JjKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChPYmplY3QuY3JlYXRlICYmIE9iamVjdC5nZXRQcm90b3R5cGVPZikge1xuICAgICAgICAgICAgZHN0ID0gT2JqZWN0LmNyZWF0ZShPYmplY3QuZ2V0UHJvdG90eXBlT2Yoc3JjKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc3JjLmNvbnN0cnVjdG9yID09PSBPYmplY3QpIHtcbiAgICAgICAgICAgIGRzdCA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHByb3RvID1cbiAgICAgICAgICAgICAgICAoc3JjLmNvbnN0cnVjdG9yICYmIHNyYy5jb25zdHJ1Y3Rvci5wcm90b3R5cGUpXG4gICAgICAgICAgICAgICAgfHwgc3JjLl9fcHJvdG9fX1xuICAgICAgICAgICAgICAgIHx8IHt9XG4gICAgICAgICAgICA7XG4gICAgICAgICAgICB2YXIgVCA9IGZ1bmN0aW9uICgpIHt9O1xuICAgICAgICAgICAgVC5wcm90b3R5cGUgPSBwcm90bztcbiAgICAgICAgICAgIGRzdCA9IG5ldyBUO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBmb3JFYWNoKG9iamVjdEtleXMoc3JjKSwgZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgZHN0W2tleV0gPSBzcmNba2V5XTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBkc3Q7XG4gICAgfVxuICAgIGVsc2UgcmV0dXJuIHNyYztcbn1cblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiBrZXlzIChvYmopIHtcbiAgICB2YXIgcmVzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgcmVzLnB1c2goa2V5KVxuICAgIHJldHVybiByZXM7XG59O1xuXG5mdW5jdGlvbiB0b1MgKG9iaikgeyByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikgfVxuZnVuY3Rpb24gaXNEYXRlIChvYmopIHsgcmV0dXJuIHRvUyhvYmopID09PSAnW29iamVjdCBEYXRlXScgfVxuZnVuY3Rpb24gaXNSZWdFeHAgKG9iaikgeyByZXR1cm4gdG9TKG9iaikgPT09ICdbb2JqZWN0IFJlZ0V4cF0nIH1cbmZ1bmN0aW9uIGlzRXJyb3IgKG9iaikgeyByZXR1cm4gdG9TKG9iaikgPT09ICdbb2JqZWN0IEVycm9yXScgfVxuZnVuY3Rpb24gaXNCb29sZWFuIChvYmopIHsgcmV0dXJuIHRvUyhvYmopID09PSAnW29iamVjdCBCb29sZWFuXScgfVxuZnVuY3Rpb24gaXNOdW1iZXIgKG9iaikgeyByZXR1cm4gdG9TKG9iaikgPT09ICdbb2JqZWN0IE51bWJlcl0nIH1cbmZ1bmN0aW9uIGlzU3RyaW5nIChvYmopIHsgcmV0dXJuIHRvUyhvYmopID09PSAnW29iamVjdCBTdHJpbmddJyB9XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiBpc0FycmF5ICh4cykge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcblxudmFyIGZvckVhY2ggPSBmdW5jdGlvbiAoeHMsIGZuKSB7XG4gICAgaWYgKHhzLmZvckVhY2gpIHJldHVybiB4cy5mb3JFYWNoKGZuKVxuICAgIGVsc2UgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBmbih4c1tpXSwgaSwgeHMpO1xuICAgIH1cbn07XG5cbmZvckVhY2gob2JqZWN0S2V5cyhUcmF2ZXJzZS5wcm90b3R5cGUpLCBmdW5jdGlvbiAoa2V5KSB7XG4gICAgdHJhdmVyc2Vba2V5XSA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICAgIHZhciB0ID0gbmV3IFRyYXZlcnNlKG9iaik7XG4gICAgICAgIHJldHVybiB0W2tleV0uYXBwbHkodCwgYXJncyk7XG4gICAgfTtcbn0pO1xuXG52YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QuaGFzT3duUHJvcGVydHkgfHwgZnVuY3Rpb24gKG9iaiwga2V5KSB7XG4gICAgcmV0dXJuIGtleSBpbiBvYmo7XG59O1xuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2FwaURlY2xhcmF0aW9uLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwic3dhZ2dlclZlcnNpb25cIiwgXCJiYXNlUGF0aFwiLCBcImFwaXNcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwic3dhZ2dlclZlcnNpb25cIjogeyBcImVudW1cIjogWyBcIjEuMlwiIF0gfSxcbiAgICAgICAgXCJhcGlWZXJzaW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJiYXNlUGF0aFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCIsXG4gICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeaHR0cHM/Oi8vXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXNvdXJjZVBhdGhcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiLFxuICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXi9cIlxuICAgICAgICB9LFxuICAgICAgICBcImFwaXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaU9iamVjdFwiIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJtb2RlbHNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJtb2RlbHNPYmplY3QuanNvbiNcIlxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInByb2R1Y2VzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjogeyBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgIH0sXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJhcGlPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJwYXRoXCIsIFwib3BlcmF0aW9uc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwicGF0aFwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaS10ZW1wbGF0ZVwiLFxuICAgICAgICAgICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeL1wiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcIm9wZXJhdGlvbnNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwib3BlcmF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWltZVR5cGVBcnJheVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJtaW1lLXR5cGVcIlxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9iYXNpY0F1dGhcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaUtleVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiYmFzaWNBdXRoXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImJhc2ljQXV0aFwiIF0gfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJhcGlLZXlcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiLCBcInBhc3NBc1wiLCBcImtleW5hbWVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImFwaUtleVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcInBhc3NBc1wiOiB7IFwiZW51bVwiOiBbIFwiaGVhZGVyXCIsIFwicXVlcnlcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJrZXluYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJvYXV0aDJcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIsIFwiZ3JhbnRUeXBlc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwib2F1dGgyXCIgXSB9LFxuICAgICAgICAgICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImdyYW50VHlwZXNcIjogeyBcIiRyZWZcIjogXCJvYXV0aDJHcmFudFR5cGUuanNvbiNcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm9hdXRoMlNjb3BlXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwic2NvcGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInNjb3BlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfVxuICAgIH1cbn1cblxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2RhdGFUeXBlLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkRhdGEgdHlwZSBhcyBkZXNjcmliZWQgYnkgdGhlIHNwZWNpZmljYXRpb24gKHZlcnNpb24gMS4yKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVmVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92b2lkVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21vZGVsVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcnJheVR5cGVcIiB9XG4gICAgXSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJyZWZUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInZvaWRUeXBlXCI6IHtcbiAgICAgICAgICAgIFwiZW51bVwiOiBbIHsgXCJ0eXBlXCI6IFwidm9pZFwiIH0gXVxuICAgICAgICB9LFxuICAgICAgICBcIm1vZGVsVHlwZVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYm9vbGVhblwiLCBcImludGVnZXJcIiwgXCJudW1iZXJcIiwgXCJzdHJpbmdcIiwgXCJhcnJheVwiIF1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwicHJpbWl0aXZlVHlwZVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bWJlclwiLCBcInN0cmluZ1wiIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImRlZmF1bHRWYWx1ZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHsgXCJ0eXBlXCI6IFsgXCJhcnJheVwiLCBcIm9iamVjdFwiLCBcIm51bGxcIiBdIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJtaW5pbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcIm1heGltdW1cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgICAgICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImludDMyXCIsIFwiaW50NjRcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwibnVtYmVyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiZmxvYXRcIiwgXCJkb3VibGVcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwic3RyaW5nXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcImJ5dGVcIiwgXCJkYXRlXCIsIFwiZGF0ZS10aW1lXCIgXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiLCBcIm51bWJlclwiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYXJyYXlUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiwgXCJpdGVtc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYXJyYXlcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2l0ZW1zT2JqZWN0XCIgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZWZUeXBlXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJhbGxPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVUeXBlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgfVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9kYXRhVHlwZUJhc2UuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGF0YSB0eXBlIGZpZWxkcyAoc2VjdGlvbiA0LjMuMylcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgeyBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSB9LFxuICAgICAgICB7IFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdIH1cbiAgICBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiJHJlZlwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZWZhdWx0VmFsdWVcIjoge1xuICAgICAgICAgICAgXCJub3RcIjogeyBcInR5cGVcIjogWyBcImFycmF5XCIsIFwib2JqZWN0XCIsIFwibnVsbFwiIF0gfVxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlLFxuICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2l0ZW1zT2JqZWN0XCIgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJpbnQzMlwiLCBcImludDY0XCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwibnVtYmVyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImZsb2F0XCIsIFwiZG91YmxlXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwic3RyaW5nXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYnl0ZVwiLCBcImRhdGVcIiwgXCJkYXRlLXRpbWVcIiBdXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcIml0ZW1zT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdLFxuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjoge30sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHt9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvaW5mb09iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwiZGVzY3JpcHRpb25cIjogXCJpbmZvIG9iamVjdCAoc2VjdGlvbiA1LjEuMylcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJ0aXRsZVwiLCBcImRlc2NyaXB0aW9uXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInRpdGxlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwidGVybXNPZlNlcnZpY2VVcmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICBcImNvbnRhY3RcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJlbWFpbFwiIH0sXG4gICAgICAgIFwibGljZW5zZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwibGljZW5zZVVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH1cbiAgICB9LFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2Vcbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvbW9kZWxzT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwiaWRcIiwgXCJwcm9wZXJ0aWVzXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImlkXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Byb3BlcnR5T2JqZWN0XCIgfVxuICAgICAgICB9LFxuICAgICAgICBcInN1YlR5cGVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcImRpc2NyaW1pbmF0b3JcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwic3ViVHlwZXNcIjogWyBcImRpc2NyaW1pbmF0b3JcIiBdXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJwcm9wZXJ0eU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCJcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59XG5cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9vYXV0aDJHcmFudFR5cGUuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcIm1pblByb3BlcnRpZXNcIjogMSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImltcGxpY2l0XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9pbXBsaWNpdFwiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbl9jb2RlXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hdXRob3JpemF0aW9uQ29kZVwiIH1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcImltcGxpY2l0XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwibG9naW5FbmRwb2ludFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwibG9naW5FbmRwb2ludFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbG9naW5FbmRwb2ludFwiIH0sXG4gICAgICAgICAgICAgICAgXCJ0b2tlbk5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25Db2RlXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidG9rZW5FbmRwb2ludFwiLCBcInRva2VuUmVxdWVzdEVuZHBvaW50XCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0b2tlbkVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90b2tlbkVuZHBvaW50XCIgfSxcbiAgICAgICAgICAgICAgICBcInRva2VuUmVxdWVzdEVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90b2tlblJlcXVlc3RFbmRwb2ludFwiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibG9naW5FbmRwb2ludFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInVybFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlbkVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICAgICAgICAgIFwidG9rZW5OYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblJlcXVlc3RFbmRwb2ludFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInVybFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcbiAgICAgICAgICAgICAgICBcImNsaWVudElkTmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJjbGllbnRTZWNyZXROYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfVxuICAgIH1cbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvb3BlcmF0aW9uT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJhbGxPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCIgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwibWV0aG9kXCIsIFwibmlja25hbWVcIiwgXCJwYXJhbWV0ZXJzXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJtZXRob2RcIjogeyBcImVudW1cIjogWyBcIkdFVFwiLCBcIlBPU1RcIiwgXCJQVVRcIiwgXCJQQVRDSFwiLCBcIkRFTEVURVwiLCBcIk9QVElPTlNcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJzdW1tYXJ5XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwibWF4TGVuZ3RoXCI6IDEyMCB9LFxuICAgICAgICAgICAgICAgIFwibm90ZXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwibmlja25hbWVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXlthLXpBLVowLTlfXSskXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiYXV0aG9yaXphdGlvbk9iamVjdC5qc29uIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZVwiXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwicGFyYW1ldGVyc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJwYXJhbWV0ZXJPYmplY3QuanNvbiNcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInJlc3BvbnNlTWVzc2FnZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZU1lc3NhZ2VPYmplY3RcIn1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwicHJvZHVjZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICAgICAgICAgIFwiY29uc3VtZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVwcmVjYXRlZFwiOiB7IFwiZW51bVwiOiBbIFwidHJ1ZVwiLCBcImZhbHNlXCIgXSB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICBdLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInJlc3BvbnNlTWVzc2FnZU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcImNvZGVcIiwgXCJtZXNzYWdlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJjb2RlXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZmMyNjE2c2VjdGlvbjEwXCIgfSxcbiAgICAgICAgICAgICAgICBcIm1lc3NhZ2VcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwicmVzcG9uc2VNb2RlbFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJyZmMyNjE2c2VjdGlvbjEwXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAxMDAsXG4gICAgICAgICAgICBcIm1heGltdW1cIjogNjAwLFxuICAgICAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW1lVHlwZUFycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcIm1pbWUtdHlwZVwiXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcGFyYW1ldGVyT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJhbGxPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCIgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwicGFyYW1UeXBlXCIsIFwibmFtZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwicGFyYW1UeXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJwYXRoXCIsIFwicXVlcnlcIiwgXCJib2R5XCIsIFwiaGVhZGVyXCIsIFwiZm9ybVwiIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwibmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIFwiYWxsb3dNdWx0aXBsZVwiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJ0eXBlIEZpbGUgcmVxdWlyZXMgc3BlY2lhbCBwYXJhbVR5cGUgYW5kIGNvbnN1bWVzXCIsXG4gICAgICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcIm5vdFwiOiB7IFwiZW51bVwiOiBbIFwiRmlsZVwiIF0gfSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiRmlsZVwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwicGFyYW1UeXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJmb3JtXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiZW51bVwiOiBbIFwibXVsdGlwYXJ0L2Zvcm0tZGF0YVwiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgXVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL3Jlc291cmNlTGlzdGluZy5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInN3YWdnZXJWZXJzaW9uXCIsIFwiYXBpc1wiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJzd2FnZ2VyVmVyc2lvblwiOiB7IFwiZW51bVwiOiBbIFwiMS4yXCIgXSB9LFxuICAgICAgICBcImFwaXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJyZXNvdXJjZU9iamVjdC5qc29uI1wiIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJhcGlWZXJzaW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJpbmZvXCI6IHsgXCIkcmVmXCI6IFwiaW5mb09iamVjdC5qc29uI1wiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjogeyBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9yZXNvdXJjZU9iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInBhdGhcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicGF0aFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgfSxcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInRpdGxlXCI6IFwiQSBKU09OIFNjaGVtYSBmb3IgU3dhZ2dlciAyLjAgQVBJLlwiLFxuICBcImlkXCI6IFwiaHR0cDovL3N3YWdnZXIuaW8vdjIvc2NoZW1hLmpzb24jXCIsXG4gIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgXCJyZXF1aXJlZFwiOiBbXG4gICAgXCJzd2FnZ2VyXCIsXG4gICAgXCJpbmZvXCIsXG4gICAgXCJwYXRoc1wiXG4gIF0sXG4gIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgIFwiXngtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICB9XG4gIH0sXG4gIFwicHJvcGVydGllc1wiOiB7XG4gICAgXCJzd2FnZ2VyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgXCIyLjBcIlxuICAgICAgXSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgU3dhZ2dlciB2ZXJzaW9uIG9mIHRoaXMgZG9jdW1lbnQuXCJcbiAgICB9LFxuICAgIFwiaW5mb1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2luZm9cIlxuICAgIH0sXG4gICAgXCJob3N0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIixcbiAgICAgIFwicGF0dGVyblwiOiBcIl5bXnt9LyA6XFxcXFxcXFxdKyg/OjpcXFxcZCspPyRcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgZnVsbHkgcXVhbGlmaWVkIFVSSSB0byB0aGUgaG9zdCBvZiB0aGUgQVBJLlwiXG4gICAgfSxcbiAgICBcImJhc2VQYXRoXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJwYXR0ZXJuXCI6IFwiXi9cIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgYmFzZSBwYXRoIHRvIHRoZSBBUEkuIEV4YW1wbGU6ICcvYXBpJy5cIlxuICAgIH0sXG4gICAgXCJzY2hlbWVzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxuICAgIH0sXG4gICAgXCJjb25zdW1lc1wiOiB7XG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgYWNjZXB0ZWQgYnkgdGhlIEFQSS5cIixcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgfSxcbiAgICBcInByb2R1Y2VzXCI6IHtcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBwcm9kdWNlLlwiLFxuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcbiAgICB9LFxuICAgIFwicGF0aHNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXRoc1wiXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyRGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJyZXNwb25zZXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZURlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwic2VjdXJpdHlcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVwiXG4gICAgfSxcbiAgICBcInNlY3VyaXR5RGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eURlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwidGFnc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdGFnXCJcbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICB9XG4gIH0sXG4gIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgIFwiaW5mb1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJHZW5lcmFsIGluZm9ybWF0aW9uIGFib3V0IHRoZSBBUEkuXCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ2ZXJzaW9uXCIsXG4gICAgICAgIFwidGl0bGVcIlxuICAgICAgXSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIHVuaXF1ZSBhbmQgcHJlY2lzZSB0aXRsZSBvZiB0aGUgQVBJLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidmVyc2lvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgc2VtYW50aWMgdmVyc2lvbiBudW1iZXIgb2YgdGhlIEFQSS5cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsb25nZXIgZGVzY3JpcHRpb24gb2YgdGhlIEFQSS4gU2hvdWxkIGJlIGRpZmZlcmVudCBmcm9tIHRoZSB0aXRsZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGVybXNPZlNlcnZpY2VcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgdGVybXMgb2Ygc2VydmljZSBmb3IgdGhlIEFQSS5cIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbnRhY3RcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29udGFjdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibGljZW5zZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9saWNlbnNlXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJjb250YWN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkNvbnRhY3QgaW5mb3JtYXRpb24gZm9yIHRoZSBvd25lcnMgb2YgdGhlIEFQSS5cIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgaWRlbnRpZnlpbmcgbmFtZSBvZiB0aGUgY29udGFjdCBwZXJzb24vb3JnYW5pemF0aW9uLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIFVSTCBwb2ludGluZyB0byB0aGUgY29udGFjdCBpbmZvcm1hdGlvbi5cIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW1haWxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgZW1haWwgYWRkcmVzcyBvZiB0aGUgY29udGFjdCBwZXJzb24vb3JnYW5pemF0aW9uLlwiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwiZW1haWxcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImxpY2Vuc2VcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCJcbiAgICAgIF0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIGxpY2Vuc2UgdHlwZS4gSXQncyBlbmNvdXJhZ2VkIHRvIHVzZSBhbiBPU0kgY29tcGF0aWJsZSBsaWNlbnNlLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIFVSTCBwb2ludGluZyB0byB0aGUgbGljZW5zZS5cIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aHNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUmVsYXRpdmUgcGF0aHMgdG8gdGhlIGluZGl2aWR1YWwgZW5kcG9pbnRzLiBUaGV5IG11c3QgYmUgcmVsYXRpdmUgdG8gdGhlICdiYXNlUGF0aCcuXCIsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJeL1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXRoSXRlbVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgIH0sXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiT25lIG9yIG1vcmUgSlNPTiBvYmplY3RzIGRlc2NyaWJpbmcgdGhlIHNjaGVtYXMgYmVpbmcgY29uc3VtZWQgYW5kIHByb2R1Y2VkIGJ5IHRoZSBBUEkuXCJcbiAgICB9LFxuICAgIFwicGFyYW1ldGVyRGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJcIlxuICAgICAgfSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJPbmUgb3IgbW9yZSBKU09OIHJlcHJlc2VudGF0aW9ucyBmb3IgcGFyYW1ldGVyc1wiXG4gICAgfSxcbiAgICBcInJlc3BvbnNlRGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVwiXG4gICAgICB9LFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIk9uZSBvciBtb3JlIEpTT04gcmVwcmVzZW50YXRpb25zIGZvciBwYXJhbWV0ZXJzXCJcbiAgICB9LFxuICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJpbmZvcm1hdGlvbiBhYm91dCBleHRlcm5hbCBkb2N1bWVudGF0aW9uXCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ1cmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiZXhhbXBsZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeW2EtejAtOS1dKy9bYS16MC05XFxcXC0rXSskXCI6IHt9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJtaW1lVHlwZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwicGF0dGVyblwiOiBcIl5bXFxcXHNhLXowLTlcXFxcLSs7XFxcXC49XFxcXC9dKyRcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgTUlNRSB0eXBlIG9mIHRoZSBIVFRQIG1lc3NhZ2UuXCJcbiAgICB9LFxuICAgIFwib3BlcmF0aW9uXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwicmVzcG9uc2VzXCJcbiAgICAgIF0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInRhZ3NcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwic3VtbWFyeVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgc3VtbWFyeSBvZiB0aGUgb3BlcmF0aW9uLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxvbmdlciBkZXNjcmlwdGlvbiBvZiB0aGUgb3BlcmF0aW9uLCBnaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9LFxuICAgICAgICBcIm9wZXJhdGlvbklkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBmcmllbmRseSBuYW1lIG9mIHRoZSBvcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcInByb2R1Y2VzXCI6IHtcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgdGhlIEFQSSBjYW4gcHJvZHVjZS5cIixcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbnN1bWVzXCI6IHtcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgdGhlIEFQSSBjYW4gY29uc3VtZS5cIixcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyc0xpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlc3BvbnNlc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlcHJlY2F0ZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aEl0ZW1cIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHV0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlbGV0ZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcIm9wdGlvbnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJoZWFkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0Y2hcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlcnNMaXN0XCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJyZXNwb25zZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUmVzcG9uc2Ugb2JqZWN0cyBuYW1lcyBjYW4gZWl0aGVyIGJlIGFueSB2YWxpZCBIVFRQIHN0YXR1cyBjb2RlIG9yICdkZWZhdWx0Jy5cIixcbiAgICAgIFwibWluUHJvcGVydGllc1wiOiAxLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl4oWzAtOV17M30pJHxeKGRlZmF1bHQpJFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVZhbHVlXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwibm90XCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicmVzcG9uc2VWYWx1ZVwiOiB7XG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9qc29uUmVmZXJlbmNlXCJcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0sXG4gICAgXCJyZXNwb25zZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcImRlc2NyaXB0aW9uXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtYVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhhbXBsZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhhbXBsZXNcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJoZWFkZXJzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIFwiaGVhZGVyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJ2ZW5kb3JFeHRlbnNpb25cIjoge1xuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkFueSBwcm9wZXJ0eSBzdGFydGluZyB3aXRoIHgtIGlzIHZhbGlkLlwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB0cnVlLFxuICAgICAgXCJhZGRpdGlvbmFsSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJib2R5UGFyYW1ldGVyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiLFxuICAgICAgICBcImluXCIsXG4gICAgICAgIFwic2NoZW1hXCJcbiAgICAgIF0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImJvZHlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtYVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJoZWFkZXJQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJoZWFkZXJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInF1ZXJ5UGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicXVlcnlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFdpdGhNdWx0aVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImZvcm1EYXRhUGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiZm9ybURhdGFcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJmaWxlXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aFBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIHRydWVcbiAgICAgICAgICBdLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInBhdGhcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm5vbkJvZHlQYXJhbWV0ZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCIsXG4gICAgICAgIFwiaW5cIixcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyUGFyYW1ldGVyU3ViU2NoZW1hXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZm9ybURhdGFQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9xdWVyeVBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdGhQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInBhcmFtZXRlclwiOiB7XG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYm9keVBhcmFtZXRlclwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL25vbkJvZHlQYXJhbWV0ZXJcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInNjaGVtYVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGRldGVybWluaXN0aWMgdmVyc2lvbiBvZiBhIEpTT04gU2NoZW1hIG9iamVjdC5cIixcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdGl0bGVcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZXNjcmlwdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4UHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90eXBlXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgXSxcbiAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJhbGxPZlwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGlzY3JpbWluYXRvclwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZWFkT25seVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInhtbFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy94bWxcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4YW1wbGVcIjoge31cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicHJpbWl0aXZlc0l0ZW1zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2VjdXJpdHlSZXF1aXJlbWVudFwiXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInNlY3VyaXR5UmVxdWlyZW1lbnRcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICB9XG4gICAgfSxcbiAgICBcInhtbFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZXNwYWNlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInByZWZpeFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdHRyaWJ1dGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ3cmFwcGVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwidGFnXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInNlY3VyaXR5RGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9iYXNpY0F1dGhlbnRpY2F0aW9uU2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcGlLZXlTZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMkltcGxpY2l0U2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJQYXNzd29yZFNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyQXBwbGljYXRpb25TZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMkFjY2Vzc0NvZGVTZWN1cml0eVwiXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9XG4gICAgfSxcbiAgICBcImJhc2ljQXV0aGVudGljYXRpb25TZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImJhc2ljXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJhcGlLZXlTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwibmFtZVwiLFxuICAgICAgICBcImluXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFwaUtleVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImhlYWRlclwiLFxuICAgICAgICAgICAgXCJxdWVyeVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgySW1wbGljaXRTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiaW1wbGljaXRcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJQYXNzd29yZFNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwidG9rZW5VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicGFzc3dvcmRcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgyQXBwbGljYXRpb25TZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcInRva2VuVXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcIm9hdXRoMlwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZsb3dcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFwcGxpY2F0aW9uXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3Blc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidG9rZW5VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMkFjY2Vzc0NvZGVTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIixcbiAgICAgICAgXCJ0b2tlblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJhY2Nlc3NDb2RlXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3Blc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJTY29wZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIFwibWVkaWFUeXBlTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVcIlxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJzTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBwYXJhbWV0ZXJzIG5lZWRlZCB0byBzZW5kIGEgdmFsaWQgQVBJIGNhbGwuXCIsXG4gICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICBcImFkZGl0aW9uYWxJdGVtc1wiOiBmYWxzZSxcbiAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlclwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2pzb25SZWZlcmVuY2VcIlxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJzY2hlbWVzTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSB0cmFuc2ZlciBwcm90b2NvbCBvZiB0aGUgQVBJLlwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgIFwiaHR0cFwiLFxuICAgICAgICAgIFwiaHR0cHNcIixcbiAgICAgICAgICBcIndzXCIsXG4gICAgICAgICAgXCJ3c3NcIlxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImVudW1cIjogW1xuICAgICAgICBcImNzdlwiLFxuICAgICAgICBcInNzdlwiLFxuICAgICAgICBcInRzdlwiLFxuICAgICAgICBcInBpcGVzXCJcbiAgICAgIF0sXG4gICAgICBcImRlZmF1bHRcIjogXCJjc3ZcIlxuICAgIH0sXG4gICAgXCJjb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgXCJjc3ZcIixcbiAgICAgICAgXCJzc3ZcIixcbiAgICAgICAgXCJ0c3ZcIixcbiAgICAgICAgXCJwaXBlc1wiLFxuICAgICAgICBcIm11bHRpXCJcbiAgICAgIF0sXG4gICAgICBcImRlZmF1bHRcIjogXCJjc3ZcIlxuICAgIH0sXG4gICAgXCJ0aXRsZVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90aXRsZVwiXG4gICAgfSxcbiAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2Rlc2NyaXB0aW9uXCJcbiAgICB9LFxuICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZWZhdWx0XCJcbiAgICB9LFxuICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tdWx0aXBsZU9mXCJcbiAgICB9LFxuICAgIFwibWF4aW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tYXhpbXVtXCJcbiAgICB9LFxuICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICB9LFxuICAgIFwibWluaW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9taW5pbXVtXCJcbiAgICB9LFxuICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICB9LFxuICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgIH0sXG4gICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICB9LFxuICAgIFwicGF0dGVyblwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9wYXR0ZXJuXCJcbiAgICB9LFxuICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgfSxcbiAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgfSxcbiAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3VuaXF1ZUl0ZW1zXCJcbiAgICB9LFxuICAgIFwiZW51bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9lbnVtXCJcbiAgICB9LFxuICAgIFwianNvblJlZmVyZW5jZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkNvcmUgc2NoZW1hIG1ldGEtc2NoZW1hXCIsXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwic2NoZW1hQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICB9LFxuICAgICAgICBcInBvc2l0aXZlSW50ZWdlclwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcIm1pbmltdW1cIjogMFxuICAgICAgICB9LFxuICAgICAgICBcInBvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCI6IHtcbiAgICAgICAgICAgIFwiYWxsT2ZcIjogWyB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSwgeyBcImRlZmF1bHRcIjogMCB9IF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzaW1wbGVUeXBlc1wiOiB7XG4gICAgICAgICAgICBcImVudW1cIjogWyBcImFycmF5XCIsIFwiYm9vbGVhblwiLCBcImludGVnZXJcIiwgXCJudWxsXCIsIFwibnVtYmVyXCIsIFwib2JqZWN0XCIsIFwic3RyaW5nXCIgXVxuICAgICAgICB9LFxuICAgICAgICBcInN0cmluZ0FycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9XG4gICAgfSxcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImlkXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcIiRzY2hlbWFcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge30sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAwLFxuICAgICAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwicmVnZXhcIlxuICAgICAgICB9LFxuICAgICAgICBcImFkZGl0aW9uYWxJdGVtc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1heFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXG4gICAgICAgIFwibWluUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxuICAgICAgICBcInJlcXVpcmVkXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zdHJpbmdBcnJheVwiIH0sXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICAgICAgeyBcInR5cGVcIjogXCJib29sZWFuXCIgfSxcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCIgfVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zaW1wbGVUeXBlc1wiIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zaW1wbGVUeXBlc1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImFsbE9mXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH0sXG4gICAgICAgIFwiYW55T2ZcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfSxcbiAgICAgICAgXCJvbmVPZlwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9LFxuICAgICAgICBcIm5vdFwiOiB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiBbIFwibWF4aW11bVwiIF0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiBbIFwibWluaW11bVwiIF1cbiAgICB9LFxuICAgIFwiZGVmYXVsdFwiOiB7fVxufVxuIl19
