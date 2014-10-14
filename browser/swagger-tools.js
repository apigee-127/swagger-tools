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
var pathToRegexp = require('path-to-regexp');
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

var expressStylePath = helpers.expressStylePath;
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
          var pKeys = [];
          var pParams = [];
          var pRegex = pathToRegexp(expressStylePath('', api.path), pKeys).toString();
          var rParams = _.map(pKeys, function (key) { return key.name; });

          // Validate duplicate resource path
          if (seenApiPaths.indexOf(pRegex) > -1) {
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
                if (rParams.indexOf(parameter.name) === -1) {
                  createErrorOrWarning('UNRESOLVABLE_API_PATH_PARAMETER',
                                       'API path parameter could not be resolved: ' + parameter.name, parameter.name,
                                       oPath.concat('parameters', index.toString(), 'name'), result.errors);
                }

                if (pParams.indexOf(parameter.name) === -1) {
                  pParams.push(parameter.name);
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
            _.each(_.difference(rParams, pParams), function (unused) {
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

          return seenApiPaths.concat(pRegex);
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
        var pKeys = [];
        var pParams = [];
        var pRegex = pathToRegexp(expressStylePath('', name), pKeys).toString();
        var rParams = _.map(pKeys, function (key) { return key.name; });

        // Validate duplicate resource path
        if (seenPaths.indexOf(pRegex) > -1) {
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
                if (rParams.indexOf(parameter.name) === -1) {
                  createErrorOrWarning('UNRESOLVABLE_API_PATH_PARAMETER',
                                       'API path parameter could not be resolved: ' + parameter.name, parameter.name,
                                       pPath.concat('name'), response.errors);
                }

                if (pParams.indexOf(parameter.name) === -1) {
                  pParams.push(parameter.name);
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
              if (rParams.indexOf(parameter.name) === -1) {
                createErrorOrWarning('UNRESOLVABLE_API_PATH_PARAMETER',
                                     'API path parameter could not be resolved: ' + parameter.name, parameter.name,
                                     pPath.concat('name'), response.errors);
              }

              if (pParams.indexOf(parameter.name) === -1) {
                pParams.push(parameter.name);
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
        _.each(_.difference(rParams, pParams), function (unused) {
          createErrorOrWarning('MISSING_API_PATH_PARAMETER',
                               'API requires path parameter but it is not defined: ' + unused, name,
                               aPath, response.errors);
        });

        return seenPaths.concat(pRegex);
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

},{"../schemas/1.2/apiDeclaration.json":329,"../schemas/1.2/authorizationObject.json":330,"../schemas/1.2/dataType.json":331,"../schemas/1.2/dataTypeBase.json":332,"../schemas/1.2/infoObject.json":333,"../schemas/1.2/modelsObject.json":334,"../schemas/1.2/oauth2GrantType.json":335,"../schemas/1.2/operationObject.json":336,"../schemas/1.2/parameterObject.json":337,"../schemas/1.2/resourceListing.json":338,"../schemas/1.2/resourceObject.json":339,"../schemas/2.0/schema.json":340,"../schemas/json-schema-draft-04.json":341,"./helpers":2,"./validators":3,"jjv":9,"jjve":11,"lodash.clonedeep":12,"lodash.difference":54,"lodash.foreach":70,"lodash.isarray":99,"lodash.isplainobject":106,"lodash.isundefined":128,"lodash.map":129,"lodash.reduce":190,"lodash.union":251,"lodash.uniq":272,"path-to-regexp":326,"spark-md5":327,"traverse":328}],2:[function(require,module,exports){
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
var parseurl = require('parseurl');
var specCache = {};

/**
 * Returns an Express style path for the Swagger path.
 *
 * @param {string} [basePath] - The Swagger API base path
 * @param {string} apiPath - The Swagger API path
 *
 * @returns the Express equivalent path
 */
module.exports.expressStylePath = function expressStylePath (basePath, apiPath) {
  basePath = parseurl({url: basePath || '/'}).pathname || '/';

  // Make sure the base path starts with '/'
  if (basePath.charAt(0) !== '/') {
    basePath = '/' + basePath;
  }

  // Make sure the base path ends with '/'
  if (basePath.charAt(basePath.length - 1) !== '/') {
    basePath = basePath + '/';
  }

  // Make sure the api path does not start with '/' since the base path will end with '/'
  if (apiPath.charAt(0) === '/') {
    apiPath = apiPath.substring(1);
  }

  // Replace Swagger syntax for path parameters with Express' version (All Swagger path parameters are required)
  return (basePath + apiPath).replace(/{/g, ':').replace(/}/g, '');
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

},{"../lib/specs":undefined,"lodash.isundefined":128,"parseurl":325}],3:[function(require,module,exports){
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

},{"./helpers":2,"lodash.foreach":70,"lodash.isarray":99,"lodash.isboolean":101,"lodash.isnan":103,"lodash.isnull":104,"lodash.isstring":127,"lodash.isundefined":128,"lodash.union":251,"lodash.uniq":272}],4:[function(require,module,exports){
(function (global){
/*! http://mths.be/punycode v1.2.4 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.4',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],5:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],6:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],7:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":5,"./encode":6}],8:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = this.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      this.hostname = newOut.join('.');
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  Object.keys(this).forEach(function(k) {
    result[k] = this[k];
  }, this);

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    Object.keys(relative).forEach(function(k) {
      if (k !== 'protocol')
        result[k] = relative[k];
    });

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      Object.keys(relative).forEach(function(k) {
        result[k] = relative[k];
      });
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!isNull(result.pathname) || !isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

function isString(arg) {
  return typeof arg === "string";
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isNull(arg) {
  return arg === null;
}
function isNullOrUndefined(arg) {
  return  arg == null;
}

},{"punycode":4,"querystring":7}],9:[function(require,module,exports){
module.exports = require('./lib/jjv.js');

},{"./lib/jjv.js":10}],10:[function(require,module,exports){
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

},{}],11:[function(require,module,exports){
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

},{}],12:[function(require,module,exports){
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

},{"lodash._baseclone":13,"lodash._basecreatecallback":32}],13:[function(require,module,exports){
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

},{"lodash._getarray":14,"lodash._releasearray":16,"lodash._slice":19,"lodash.assign":20,"lodash.foreach":70,"lodash.forown":25,"lodash.isarray":99,"lodash.isobject":30}],14:[function(require,module,exports){
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

},{"lodash._arraypool":15}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
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

},{"lodash._arraypool":17,"lodash._maxpoolsize":18}],17:[function(require,module,exports){
module.exports=require(15)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":15}],18:[function(require,module,exports){
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

},{}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
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

},{"lodash._basecreatecallback":32,"lodash._objecttypes":21,"lodash.keys":22}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
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

},{"lodash._isnative":23,"lodash._shimkeys":24,"lodash.isobject":30}],23:[function(require,module,exports){
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

},{}],24:[function(require,module,exports){
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

},{"lodash._objecttypes":21}],25:[function(require,module,exports){
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

},{"lodash._basecreatecallback":32,"lodash._objecttypes":26,"lodash.keys":27}],26:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],27:[function(require,module,exports){
module.exports=require(22)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":22,"lodash._isnative":28,"lodash._shimkeys":29,"lodash.isobject":30}],28:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],29:[function(require,module,exports){
module.exports=require(24)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":24,"lodash._objecttypes":26}],30:[function(require,module,exports){
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

},{"lodash._objecttypes":31}],31:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],32:[function(require,module,exports){
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

},{"lodash._setbinddata":33,"lodash.bind":36,"lodash.identity":51,"lodash.support":52}],33:[function(require,module,exports){
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

},{"lodash._isnative":34,"lodash.noop":35}],34:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],35:[function(require,module,exports){
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

},{}],36:[function(require,module,exports){
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

},{"lodash._createwrapper":37,"lodash._slice":50}],37:[function(require,module,exports){
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

},{"lodash._basebind":38,"lodash._basecreatewrapper":44,"lodash._slice":50,"lodash.isfunction":102}],38:[function(require,module,exports){
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

},{"lodash._basecreate":39,"lodash._setbinddata":33,"lodash._slice":50,"lodash.isobject":42}],39:[function(require,module,exports){
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
},{"lodash._isnative":40,"lodash.isobject":42,"lodash.noop":41}],40:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],41:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],42:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":43}],43:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],44:[function(require,module,exports){
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

},{"lodash._basecreate":45,"lodash._setbinddata":33,"lodash._slice":50,"lodash.isobject":48}],45:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":46,"lodash.isobject":48,"lodash.noop":47}],46:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],47:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],48:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":49}],49:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],50:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":19}],51:[function(require,module,exports){
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

},{}],52:[function(require,module,exports){
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
},{"lodash._isnative":53}],53:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],54:[function(require,module,exports){
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

},{"lodash._basedifference":55,"lodash._baseflatten":68}],55:[function(require,module,exports){
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

},{"lodash._baseindexof":56,"lodash._cacheindexof":57,"lodash._createcache":59,"lodash._largearraysize":64,"lodash._releaseobject":65}],56:[function(require,module,exports){
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

},{}],57:[function(require,module,exports){
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

},{"lodash._baseindexof":56,"lodash._keyprefix":58}],58:[function(require,module,exports){
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

},{}],59:[function(require,module,exports){
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

},{"lodash._cachepush":60,"lodash._getobject":62,"lodash._releaseobject":65}],60:[function(require,module,exports){
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

},{"lodash._keyprefix":61}],61:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":58}],62:[function(require,module,exports){
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

},{"lodash._objectpool":63}],63:[function(require,module,exports){
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

},{}],64:[function(require,module,exports){
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

},{}],65:[function(require,module,exports){
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

},{"lodash._maxpoolsize":66,"lodash._objectpool":67}],66:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":18}],67:[function(require,module,exports){
module.exports=require(63)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":63}],68:[function(require,module,exports){
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

},{"lodash.isarguments":69,"lodash.isarray":99}],69:[function(require,module,exports){
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

},{}],70:[function(require,module,exports){
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

},{"lodash._basecreatecallback":71,"lodash.forown":93}],71:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":32,"lodash._setbinddata":72,"lodash.bind":75,"lodash.identity":90,"lodash.support":91}],72:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":33,"lodash._isnative":73,"lodash.noop":74}],73:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],74:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],75:[function(require,module,exports){
module.exports=require(36)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":36,"lodash._createwrapper":76,"lodash._slice":89}],76:[function(require,module,exports){
module.exports=require(37)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":37,"lodash._basebind":77,"lodash._basecreatewrapper":83,"lodash._slice":89,"lodash.isfunction":102}],77:[function(require,module,exports){
module.exports=require(38)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":38,"lodash._basecreate":78,"lodash._setbinddata":72,"lodash._slice":89,"lodash.isobject":81}],78:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":79,"lodash.isobject":81,"lodash.noop":80}],79:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],80:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],81:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":82}],82:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],83:[function(require,module,exports){
module.exports=require(44)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":44,"lodash._basecreate":84,"lodash._setbinddata":72,"lodash._slice":89,"lodash.isobject":87}],84:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":85,"lodash.isobject":87,"lodash.noop":86}],85:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],86:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],87:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":88}],88:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],89:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":19}],90:[function(require,module,exports){
module.exports=require(51)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":51}],91:[function(require,module,exports){
module.exports=require(52)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":52,"lodash._isnative":92}],92:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],93:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.forown/index.js":25,"lodash._basecreatecallback":71,"lodash._objecttypes":94,"lodash.keys":95}],94:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],95:[function(require,module,exports){
module.exports=require(22)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":22,"lodash._isnative":96,"lodash._shimkeys":97,"lodash.isobject":98}],96:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],97:[function(require,module,exports){
module.exports=require(24)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":24,"lodash._objecttypes":94}],98:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":94}],99:[function(require,module,exports){
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

},{"lodash._isnative":100}],100:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],101:[function(require,module,exports){
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

},{}],102:[function(require,module,exports){
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

},{}],103:[function(require,module,exports){
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

},{"lodash.isnumber":105}],104:[function(require,module,exports){
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

},{}],105:[function(require,module,exports){
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

},{}],106:[function(require,module,exports){
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

},{"lodash._isnative":107,"lodash._shimisplainobject":108}],107:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],108:[function(require,module,exports){
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

},{"lodash.forin":109,"lodash.isfunction":102}],109:[function(require,module,exports){
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

},{"lodash._basecreatecallback":110,"lodash._objecttypes":126}],110:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":32,"lodash._setbinddata":111,"lodash.bind":113,"lodash.identity":124,"lodash.support":125}],111:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":33,"lodash._isnative":107,"lodash.noop":112}],112:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],113:[function(require,module,exports){
module.exports=require(36)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":36,"lodash._createwrapper":114,"lodash._slice":123}],114:[function(require,module,exports){
module.exports=require(37)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":37,"lodash._basebind":115,"lodash._basecreatewrapper":119,"lodash._slice":123,"lodash.isfunction":102}],115:[function(require,module,exports){
module.exports=require(38)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":38,"lodash._basecreate":116,"lodash._setbinddata":111,"lodash._slice":123,"lodash.isobject":118}],116:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":107,"lodash.isobject":118,"lodash.noop":117}],117:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],118:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":126}],119:[function(require,module,exports){
module.exports=require(44)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":44,"lodash._basecreate":120,"lodash._setbinddata":111,"lodash._slice":123,"lodash.isobject":122}],120:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":107,"lodash.isobject":122,"lodash.noop":121}],121:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],122:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":126}],123:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":19}],124:[function(require,module,exports){
module.exports=require(51)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":51}],125:[function(require,module,exports){
module.exports=require(52)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":52,"lodash._isnative":107}],126:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],127:[function(require,module,exports){
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

},{}],128:[function(require,module,exports){
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

},{}],129:[function(require,module,exports){
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

},{"lodash.createcallback":130,"lodash.forown":164}],130:[function(require,module,exports){
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

},{"lodash._basecreatecallback":131,"lodash._baseisequal":149,"lodash.isobject":157,"lodash.keys":159,"lodash.property":163}],131:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":32,"lodash._setbinddata":132,"lodash.bind":135,"lodash.identity":146,"lodash.support":147}],132:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":33,"lodash._isnative":133,"lodash.noop":134}],133:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],134:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],135:[function(require,module,exports){
module.exports=require(36)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":36,"lodash._createwrapper":136,"lodash._slice":145}],136:[function(require,module,exports){
module.exports=require(37)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":37,"lodash._basebind":137,"lodash._basecreatewrapper":141,"lodash._slice":145,"lodash.isfunction":102}],137:[function(require,module,exports){
module.exports=require(38)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":38,"lodash._basecreate":138,"lodash._setbinddata":132,"lodash._slice":145,"lodash.isobject":157}],138:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":139,"lodash.isobject":157,"lodash.noop":140}],139:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],140:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],141:[function(require,module,exports){
module.exports=require(44)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":44,"lodash._basecreate":142,"lodash._setbinddata":132,"lodash._slice":145,"lodash.isobject":157}],142:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":143,"lodash.isobject":157,"lodash.noop":144}],143:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],144:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],145:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":19}],146:[function(require,module,exports){
module.exports=require(51)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":51}],147:[function(require,module,exports){
module.exports=require(52)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":52,"lodash._isnative":148}],148:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],149:[function(require,module,exports){
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

},{"lodash._getarray":150,"lodash._objecttypes":152,"lodash._releasearray":153,"lodash.forin":156,"lodash.isfunction":102}],150:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":14,"lodash._arraypool":151}],151:[function(require,module,exports){
module.exports=require(15)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":15}],152:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],153:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":16,"lodash._arraypool":154,"lodash._maxpoolsize":155}],154:[function(require,module,exports){
module.exports=require(15)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":15}],155:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":18}],156:[function(require,module,exports){
module.exports=require(109)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.isplainobject/node_modules/lodash._shimisplainobject/node_modules/lodash.forin/index.js":109,"lodash._basecreatecallback":131,"lodash._objecttypes":152}],157:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":158}],158:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],159:[function(require,module,exports){
module.exports=require(22)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":22,"lodash._isnative":160,"lodash._shimkeys":161,"lodash.isobject":157}],160:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],161:[function(require,module,exports){
module.exports=require(24)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":24,"lodash._objecttypes":162}],162:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],163:[function(require,module,exports){
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

},{}],164:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.forown/index.js":25,"lodash._basecreatecallback":165,"lodash._objecttypes":185,"lodash.keys":186}],165:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":32,"lodash._setbinddata":166,"lodash.bind":169,"lodash.identity":182,"lodash.support":183}],166:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":33,"lodash._isnative":167,"lodash.noop":168}],167:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],168:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],169:[function(require,module,exports){
module.exports=require(36)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":36,"lodash._createwrapper":170,"lodash._slice":181}],170:[function(require,module,exports){
module.exports=require(37)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":37,"lodash._basebind":171,"lodash._basecreatewrapper":176,"lodash._slice":181,"lodash.isfunction":102}],171:[function(require,module,exports){
module.exports=require(38)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":38,"lodash._basecreate":172,"lodash._setbinddata":166,"lodash._slice":181,"lodash.isobject":175}],172:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":173,"lodash.isobject":175,"lodash.noop":174}],173:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],174:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],175:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":185}],176:[function(require,module,exports){
module.exports=require(44)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":44,"lodash._basecreate":177,"lodash._setbinddata":166,"lodash._slice":181,"lodash.isobject":180}],177:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":178,"lodash.isobject":180,"lodash.noop":179}],178:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],179:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],180:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":185}],181:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":19}],182:[function(require,module,exports){
module.exports=require(51)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":51}],183:[function(require,module,exports){
module.exports=require(52)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":52,"lodash._isnative":184}],184:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],185:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],186:[function(require,module,exports){
module.exports=require(22)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":22,"lodash._isnative":187,"lodash._shimkeys":188,"lodash.isobject":189}],187:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],188:[function(require,module,exports){
module.exports=require(24)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":24,"lodash._objecttypes":185}],189:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":185}],190:[function(require,module,exports){
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

},{"lodash.createcallback":191,"lodash.forown":225}],191:[function(require,module,exports){
module.exports=require(130)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/index.js":130,"lodash._basecreatecallback":192,"lodash._baseisequal":210,"lodash.isobject":218,"lodash.keys":220,"lodash.property":224}],192:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":32,"lodash._setbinddata":193,"lodash.bind":196,"lodash.identity":207,"lodash.support":208}],193:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":33,"lodash._isnative":194,"lodash.noop":195}],194:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],195:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],196:[function(require,module,exports){
module.exports=require(36)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":36,"lodash._createwrapper":197,"lodash._slice":206}],197:[function(require,module,exports){
module.exports=require(37)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":37,"lodash._basebind":198,"lodash._basecreatewrapper":202,"lodash._slice":206,"lodash.isfunction":102}],198:[function(require,module,exports){
module.exports=require(38)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":38,"lodash._basecreate":199,"lodash._setbinddata":193,"lodash._slice":206,"lodash.isobject":218}],199:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":200,"lodash.isobject":218,"lodash.noop":201}],200:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],201:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],202:[function(require,module,exports){
module.exports=require(44)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":44,"lodash._basecreate":203,"lodash._setbinddata":193,"lodash._slice":206,"lodash.isobject":218}],203:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":204,"lodash.isobject":218,"lodash.noop":205}],204:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],205:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],206:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":19}],207:[function(require,module,exports){
module.exports=require(51)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":51}],208:[function(require,module,exports){
module.exports=require(52)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":52,"lodash._isnative":209}],209:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],210:[function(require,module,exports){
module.exports=require(149)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash._baseisequal/index.js":149,"lodash._getarray":211,"lodash._objecttypes":213,"lodash._releasearray":214,"lodash.forin":217,"lodash.isfunction":102}],211:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":14,"lodash._arraypool":212}],212:[function(require,module,exports){
module.exports=require(15)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":15}],213:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],214:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":16,"lodash._arraypool":215,"lodash._maxpoolsize":216}],215:[function(require,module,exports){
module.exports=require(15)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":15}],216:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":18}],217:[function(require,module,exports){
module.exports=require(109)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.isplainobject/node_modules/lodash._shimisplainobject/node_modules/lodash.forin/index.js":109,"lodash._basecreatecallback":192,"lodash._objecttypes":213}],218:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":219}],219:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],220:[function(require,module,exports){
module.exports=require(22)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":22,"lodash._isnative":221,"lodash._shimkeys":222,"lodash.isobject":218}],221:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],222:[function(require,module,exports){
module.exports=require(24)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":24,"lodash._objecttypes":223}],223:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],224:[function(require,module,exports){
module.exports=require(163)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash.property/index.js":163}],225:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.forown/index.js":25,"lodash._basecreatecallback":226,"lodash._objecttypes":246,"lodash.keys":247}],226:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":32,"lodash._setbinddata":227,"lodash.bind":230,"lodash.identity":243,"lodash.support":244}],227:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":33,"lodash._isnative":228,"lodash.noop":229}],228:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],229:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],230:[function(require,module,exports){
module.exports=require(36)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":36,"lodash._createwrapper":231,"lodash._slice":242}],231:[function(require,module,exports){
module.exports=require(37)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":37,"lodash._basebind":232,"lodash._basecreatewrapper":237,"lodash._slice":242,"lodash.isfunction":102}],232:[function(require,module,exports){
module.exports=require(38)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":38,"lodash._basecreate":233,"lodash._setbinddata":227,"lodash._slice":242,"lodash.isobject":236}],233:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":234,"lodash.isobject":236,"lodash.noop":235}],234:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],235:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],236:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":246}],237:[function(require,module,exports){
module.exports=require(44)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":44,"lodash._basecreate":238,"lodash._setbinddata":227,"lodash._slice":242,"lodash.isobject":241}],238:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":239,"lodash.isobject":241,"lodash.noop":240}],239:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],240:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],241:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":246}],242:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":19}],243:[function(require,module,exports){
module.exports=require(51)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":51}],244:[function(require,module,exports){
module.exports=require(52)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":52,"lodash._isnative":245}],245:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],246:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],247:[function(require,module,exports){
module.exports=require(22)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":22,"lodash._isnative":248,"lodash._shimkeys":249,"lodash.isobject":250}],248:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],249:[function(require,module,exports){
module.exports=require(24)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":24,"lodash._objecttypes":246}],250:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":246}],251:[function(require,module,exports){
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

},{"lodash._baseflatten":252,"lodash._baseuniq":254}],252:[function(require,module,exports){
module.exports=require(68)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._baseflatten/index.js":68,"lodash.isarguments":253,"lodash.isarray":99}],253:[function(require,module,exports){
module.exports=require(69)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._baseflatten/node_modules/lodash.isarguments/index.js":69}],254:[function(require,module,exports){
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

},{"lodash._baseindexof":255,"lodash._cacheindexof":256,"lodash._createcache":258,"lodash._getarray":263,"lodash._largearraysize":265,"lodash._releasearray":266,"lodash._releaseobject":269}],255:[function(require,module,exports){
module.exports=require(56)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._baseindexof/index.js":56}],256:[function(require,module,exports){
module.exports=require(57)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/index.js":57,"lodash._baseindexof":255,"lodash._keyprefix":257}],257:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":58}],258:[function(require,module,exports){
module.exports=require(59)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/index.js":59,"lodash._cachepush":259,"lodash._getobject":261,"lodash._releaseobject":269}],259:[function(require,module,exports){
module.exports=require(60)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._cachepush/index.js":60,"lodash._keyprefix":260}],260:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":58}],261:[function(require,module,exports){
module.exports=require(62)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/index.js":62,"lodash._objectpool":262}],262:[function(require,module,exports){
module.exports=require(63)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":63}],263:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":14,"lodash._arraypool":264}],264:[function(require,module,exports){
module.exports=require(15)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":15}],265:[function(require,module,exports){
module.exports=require(64)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._largearraysize/index.js":64}],266:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":16,"lodash._arraypool":267,"lodash._maxpoolsize":268}],267:[function(require,module,exports){
module.exports=require(15)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":15}],268:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":18}],269:[function(require,module,exports){
module.exports=require(65)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._releaseobject/index.js":65,"lodash._maxpoolsize":270,"lodash._objectpool":271}],270:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":18}],271:[function(require,module,exports){
module.exports=require(63)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":63}],272:[function(require,module,exports){
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

},{"lodash._baseuniq":273,"lodash.createcallback":291}],273:[function(require,module,exports){
module.exports=require(254)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.union/node_modules/lodash._baseuniq/index.js":254,"lodash._baseindexof":274,"lodash._cacheindexof":275,"lodash._createcache":277,"lodash._getarray":282,"lodash._largearraysize":284,"lodash._releasearray":285,"lodash._releaseobject":288}],274:[function(require,module,exports){
module.exports=require(56)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._baseindexof/index.js":56}],275:[function(require,module,exports){
module.exports=require(57)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/index.js":57,"lodash._baseindexof":274,"lodash._keyprefix":276}],276:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":58}],277:[function(require,module,exports){
module.exports=require(59)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/index.js":59,"lodash._cachepush":278,"lodash._getobject":280,"lodash._releaseobject":288}],278:[function(require,module,exports){
module.exports=require(60)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._cachepush/index.js":60,"lodash._keyprefix":279}],279:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":58}],280:[function(require,module,exports){
module.exports=require(62)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/index.js":62,"lodash._objectpool":281}],281:[function(require,module,exports){
module.exports=require(63)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":63}],282:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":14,"lodash._arraypool":283}],283:[function(require,module,exports){
module.exports=require(15)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":15}],284:[function(require,module,exports){
module.exports=require(64)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._largearraysize/index.js":64}],285:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":16,"lodash._arraypool":286,"lodash._maxpoolsize":287}],286:[function(require,module,exports){
module.exports=require(15)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":15}],287:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":18}],288:[function(require,module,exports){
module.exports=require(65)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._releaseobject/index.js":65,"lodash._maxpoolsize":289,"lodash._objectpool":290}],289:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":18}],290:[function(require,module,exports){
module.exports=require(63)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":63}],291:[function(require,module,exports){
module.exports=require(130)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/index.js":130,"lodash._basecreatecallback":292,"lodash._baseisequal":310,"lodash.isobject":318,"lodash.keys":320,"lodash.property":324}],292:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":32,"lodash._setbinddata":293,"lodash.bind":296,"lodash.identity":307,"lodash.support":308}],293:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":33,"lodash._isnative":294,"lodash.noop":295}],294:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],295:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],296:[function(require,module,exports){
module.exports=require(36)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":36,"lodash._createwrapper":297,"lodash._slice":306}],297:[function(require,module,exports){
module.exports=require(37)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":37,"lodash._basebind":298,"lodash._basecreatewrapper":302,"lodash._slice":306,"lodash.isfunction":102}],298:[function(require,module,exports){
module.exports=require(38)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":38,"lodash._basecreate":299,"lodash._setbinddata":293,"lodash._slice":306,"lodash.isobject":318}],299:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":300,"lodash.isobject":318,"lodash.noop":301}],300:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],301:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],302:[function(require,module,exports){
module.exports=require(44)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":44,"lodash._basecreate":303,"lodash._setbinddata":293,"lodash._slice":306,"lodash.isobject":318}],303:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":39,"lodash._isnative":304,"lodash.isobject":318,"lodash.noop":305}],304:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],305:[function(require,module,exports){
module.exports=require(35)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":35}],306:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":19}],307:[function(require,module,exports){
module.exports=require(51)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":51}],308:[function(require,module,exports){
module.exports=require(52)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":52,"lodash._isnative":309}],309:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],310:[function(require,module,exports){
module.exports=require(149)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash._baseisequal/index.js":149,"lodash._getarray":311,"lodash._objecttypes":313,"lodash._releasearray":314,"lodash.forin":317,"lodash.isfunction":102}],311:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":14,"lodash._arraypool":312}],312:[function(require,module,exports){
module.exports=require(15)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":15}],313:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],314:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":16,"lodash._arraypool":315,"lodash._maxpoolsize":316}],315:[function(require,module,exports){
module.exports=require(15)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":15}],316:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":18}],317:[function(require,module,exports){
module.exports=require(109)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.isplainobject/node_modules/lodash._shimisplainobject/node_modules/lodash.forin/index.js":109,"lodash._basecreatecallback":292,"lodash._objecttypes":313}],318:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":30,"lodash._objecttypes":319}],319:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],320:[function(require,module,exports){
module.exports=require(22)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":22,"lodash._isnative":321,"lodash._shimkeys":322,"lodash.isobject":318}],321:[function(require,module,exports){
module.exports=require(23)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":23}],322:[function(require,module,exports){
module.exports=require(24)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":24,"lodash._objecttypes":323}],323:[function(require,module,exports){
module.exports=require(21)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":21}],324:[function(require,module,exports){
module.exports=require(163)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash.property/index.js":163}],325:[function(require,module,exports){
/*!
 * parseurl
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014 Douglas Christopher Wilson
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var url = require('url')
var parse = url.parse
var Url = url.Url

/**
 * Pattern for a simple path case.
 * See: https://github.com/joyent/node/pull/7878
 */

var simplePathRegExp = /^(\/\/?(?!\/)[^\?#\s]*)(\?[^#\s]*)?$/

/**
 * Exports.
 */

module.exports = parseurl
module.exports.original = originalurl

/**
 * Parse the `req` url with memoization.
 *
 * @param {ServerRequest} req
 * @return {Object}
 * @api public
 */

function parseurl(req) {
  var url = req.url

  if (url === undefined) {
    // URL is undefined
    return undefined
  }

  var parsed = req._parsedUrl

  if (fresh(url, parsed)) {
    // Return cached URL parse
    return parsed
  }

  // Parse the URL
  parsed = fastparse(url)
  parsed._raw = url

  return req._parsedUrl = parsed
};

/**
 * Parse the `req` original url with fallback and memoization.
 *
 * @param {ServerRequest} req
 * @return {Object}
 * @api public
 */

function originalurl(req) {
  var url = req.originalUrl

  if (typeof url !== 'string') {
    // Fallback
    return parseurl(req)
  }

  var parsed = req._parsedOriginalUrl

  if (fresh(url, parsed)) {
    // Return cached URL parse
    return parsed
  }

  // Parse the URL
  parsed = fastparse(url)
  parsed._raw = url

  return req._parsedOriginalUrl = parsed
};

/**
 * Parse the `str` url with fast-path short-cut.
 *
 * @param {string} str
 * @return {Object}
 * @api private
 */

function fastparse(str) {
  // Try fast path regexp
  // See: https://github.com/joyent/node/pull/7878
  var simplePath = typeof str === 'string' && simplePathRegExp.exec(str)

  // Construct simple URL
  if (simplePath) {
    var pathname = simplePath[1]
    var search = simplePath[2] || null
    var url = Url !== undefined
      ? new Url()
      : {}
    url.path = str
    url.href = str
    url.pathname = pathname
    url.search = search
    url.query = search && search.substr(1)

    return url
  }

  return parse(str)
}

/**
 * Determine if parsed is still fresh for url.
 *
 * @param {string} url
 * @param {object} parsedUrl
 * @return {boolean}
 * @api private
 */

function fresh(url, parsedUrl) {
  return typeof parsedUrl === 'object'
    && parsedUrl !== null
    && (Url === undefined || parsedUrl instanceof Url)
    && parsedUrl._raw === url
}

},{"url":8}],326:[function(require,module,exports){
/**
 * Expose `pathtoRegexp`.
 */
module.exports = pathtoRegexp;

/**
 * The main path matching regexp utility.
 *
 * @type {RegExp}
 */
var PATH_REGEXP = new RegExp([
  // Match already escaped characters that would otherwise incorrectly appear
  // in future matches. This allows the user to escape special characters that
  // shouldn't be transformed.
  '(\\\\.)',
  // Match Express-style parameters and un-named parameters with a prefix
  // and optional suffixes. Matches appear as:
  //
  // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?"]
  // "/route(\\d+)" => [undefined, undefined, undefined, "\d+", undefined]
  '([\\/.])?(?:\\:(\\w+)(?:\\(((?:\\\\.|[^)])*)\\))?|\\(((?:\\\\.|[^)])*)\\))([+*?])?',
  // Match regexp special characters that should always be escaped.
  '([.+*?=^!:${}()[\\]|\\/])'
].join('|'), 'g');

/**
 * Escape the capturing group by escaping special characters and meaning.
 *
 * @param  {String} group
 * @return {String}
 */
function escapeGroup (group) {
  return group.replace(/([=!:$\/()])/g, '\\$1');
}

/**
 * Attach the keys as a property of the regexp.
 *
 * @param  {RegExp} re
 * @param  {Array}  keys
 * @return {RegExp}
 */
var attachKeys = function (re, keys) {
  re.keys = keys;

  return re;
};

/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array should be passed in, which will contain the placeholder key
 * names. For example `/user/:id` will then contain `["id"]`.
 *
 * @param  {(String|RegExp|Array)} path
 * @param  {Array}                 keys
 * @param  {Object}                options
 * @return {RegExp}
 */
function pathtoRegexp (path, keys, options) {
  if (keys && !Array.isArray(keys)) {
    options = keys;
    keys = null;
  }

  keys = keys || [];
  options = options || {};

  var strict = options.strict;
  var end = options.end !== false;
  var flags = options.sensitive ? '' : 'i';
  var index = 0;

  if (path instanceof RegExp) {
    // Match all capturing groups of a regexp.
    var groups = path.source.match(/\((?!\?)/g) || [];

    // Map all the matches to their numeric keys and push into the keys.
    keys.push.apply(keys, groups.map(function (match, index) {
      return {
        name:      index,
        delimiter: null,
        optional:  false,
        repeat:    false
      };
    }));

    // Return the source back to the user.
    return attachKeys(path, keys);
  }

  if (Array.isArray(path)) {
    // Map array parts into regexps and return their source. We also pass
    // the same keys and options instance into every generation to get
    // consistent matching groups before we join the sources together.
    path = path.map(function (value) {
      return pathtoRegexp(value, keys, options).source;
    });

    // Generate a new regexp instance by joining all the parts together.
    return attachKeys(new RegExp('(?:' + path.join('|') + ')', flags), keys);
  }

  // Alter the path string into a usable regexp.
  path = path.replace(PATH_REGEXP, function (match, escaped, prefix, key, capture, group, suffix, escape) {
    // Avoiding re-escaping escaped characters.
    if (escaped) {
      return escaped;
    }

    // Escape regexp special characters.
    if (escape) {
      return '\\' + escape;
    }

    var repeat   = suffix === '+' || suffix === '*';
    var optional = suffix === '?' || suffix === '*';

    keys.push({
      name:      key || index++,
      delimiter: prefix || '/',
      optional:  optional,
      repeat:    repeat
    });

    // Escape the prefix character.
    prefix = prefix ? '\\' + prefix : '';

    // Match using the custom capturing group, or fallback to capturing
    // everything up to the next slash (or next period if the param was
    // prefixed with a period).
    capture = escapeGroup(capture || group || '[^' + (prefix || '\\/') + ']+?');

    // Allow parameters to be repeated more than once.
    if (repeat) {
      capture = capture + '(?:' + prefix + capture + ')*';
    }

    // Allow a parameter to be optional.
    if (optional) {
      return '(?:' + prefix + '(' + capture + '))?';
    }

    // Basic parameter support.
    return prefix + '(' + capture + ')';
  });

  // Check whether the path ends in a slash as it alters some match behaviour.
  var endsWithSlash = path[path.length - 1] === '/';

  // In non-strict mode we allow an optional trailing slash in the match. If
  // the path to match already ended with a slash, we need to remove it for
  // consistency. The slash is only valid at the very end of a path match, not
  // anywhere in the middle. This is important for non-ending mode, otherwise
  // "/test/" will match "/test//route".
  if (!strict) {
    path = (endsWithSlash ? path.slice(0, -2) : path) + '(?:\\/(?=$))?';
  }

  // In non-ending mode, we need prompt the capturing groups to match as much
  // as possible by using a positive lookahead for the end or next path segment.
  if (!end) {
    path += strict && endsWithSlash ? '' : '(?=\\/|$)';
  }

  return attachKeys(new RegExp('^' + path + (end ? '$' : ''), flags), keys);
};

},{}],327:[function(require,module,exports){
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

},{}],328:[function(require,module,exports){
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

},{}],329:[function(require,module,exports){
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

},{}],330:[function(require,module,exports){
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


},{}],331:[function(require,module,exports){
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
},{}],332:[function(require,module,exports){
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

},{}],333:[function(require,module,exports){
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
},{}],334:[function(require,module,exports){
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


},{}],335:[function(require,module,exports){
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
},{}],336:[function(require,module,exports){
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

},{}],337:[function(require,module,exports){
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

},{}],338:[function(require,module,exports){
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

},{}],339:[function(require,module,exports){
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
},{}],340:[function(require,module,exports){
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

},{}],341:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuL2xpYi9zcGVjcy5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL2xpYi9oZWxwZXJzLmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbGliL3ZhbGlkYXRvcnMuanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHVueWNvZGUvcHVueWNvZGUuanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcXVlcnlzdHJpbmctZXMzL2RlY29kZS5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91cmwvdXJsLmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2pqdi9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9qanYvbGliL2pqdi5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9qanZlL2pqdmUuanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjbG9uZS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjbG9uZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9nZXRhcnJheS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjbG9uZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9nZXRhcnJheS9ub2RlX21vZHVsZXMvbG9kYXNoLl9hcnJheXBvb2wvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY2xvbmUvbm9kZV9tb2R1bGVzL2xvZGFzaC5fcmVsZWFzZWFycmF5L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNsb25lL25vZGVfbW9kdWxlcy9sb2Rhc2guX3JlbGVhc2VhcnJheS9ub2RlX21vZHVsZXMvbG9kYXNoLl9tYXhwb29sc2l6ZS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjbG9uZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9zbGljZS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjbG9uZS9ub2RlX21vZHVsZXMvbG9kYXNoLmFzc2lnbi9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjbG9uZS9ub2RlX21vZHVsZXMvbG9kYXNoLmFzc2lnbi9ub2RlX21vZHVsZXMvbG9kYXNoLl9vYmplY3R0eXBlcy9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjbG9uZS9ub2RlX21vZHVsZXMvbG9kYXNoLmFzc2lnbi9ub2RlX21vZHVsZXMvbG9kYXNoLmtleXMvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY2xvbmUvbm9kZV9tb2R1bGVzL2xvZGFzaC5hc3NpZ24vbm9kZV9tb2R1bGVzL2xvZGFzaC5rZXlzL25vZGVfbW9kdWxlcy9sb2Rhc2guX2lzbmF0aXZlL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNsb25lL25vZGVfbW9kdWxlcy9sb2Rhc2guYXNzaWduL25vZGVfbW9kdWxlcy9sb2Rhc2gua2V5cy9ub2RlX21vZHVsZXMvbG9kYXNoLl9zaGlta2V5cy9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjbG9uZS9ub2RlX21vZHVsZXMvbG9kYXNoLmZvcm93bi9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjbG9uZS9ub2RlX21vZHVsZXMvbG9kYXNoLmlzb2JqZWN0L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNyZWF0ZWNhbGxiYWNrL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNyZWF0ZWNhbGxiYWNrL25vZGVfbW9kdWxlcy9sb2Rhc2guX3NldGJpbmRkYXRhL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNyZWF0ZWNhbGxiYWNrL25vZGVfbW9kdWxlcy9sb2Rhc2guX3NldGJpbmRkYXRhL25vZGVfbW9kdWxlcy9sb2Rhc2gubm9vcC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjcmVhdGVjYWxsYmFjay9ub2RlX21vZHVsZXMvbG9kYXNoLmJpbmQvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY3JlYXRlY2FsbGJhY2svbm9kZV9tb2R1bGVzL2xvZGFzaC5iaW5kL25vZGVfbW9kdWxlcy9sb2Rhc2guX2NyZWF0ZXdyYXBwZXIvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY3JlYXRlY2FsbGJhY2svbm9kZV9tb2R1bGVzL2xvZGFzaC5iaW5kL25vZGVfbW9kdWxlcy9sb2Rhc2guX2NyZWF0ZXdyYXBwZXIvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWJpbmQvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmNsb25lZGVlcC9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY3JlYXRlY2FsbGJhY2svbm9kZV9tb2R1bGVzL2xvZGFzaC5iaW5kL25vZGVfbW9kdWxlcy9sb2Rhc2guX2NyZWF0ZXdyYXBwZXIvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWJpbmQvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNyZWF0ZS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjcmVhdGVjYWxsYmFjay9ub2RlX21vZHVsZXMvbG9kYXNoLmJpbmQvbm9kZV9tb2R1bGVzL2xvZGFzaC5fY3JlYXRld3JhcHBlci9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlY3JlYXRld3JhcHBlci9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guY2xvbmVkZWVwL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VjcmVhdGVjYWxsYmFjay9ub2RlX21vZHVsZXMvbG9kYXNoLmlkZW50aXR5L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5jbG9uZWRlZXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWNyZWF0ZWNhbGxiYWNrL25vZGVfbW9kdWxlcy9sb2Rhc2guc3VwcG9ydC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guZGlmZmVyZW5jZS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlZGlmZmVyZW5jZS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlaW5kZXhvZi9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9jYWNoZWluZGV4b2YvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fY2FjaGVpbmRleG9mL25vZGVfbW9kdWxlcy9sb2Rhc2guX2tleXByZWZpeC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9jcmVhdGVjYWNoZS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNlZGlmZmVyZW5jZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9jcmVhdGVjYWNoZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9jYWNoZXB1c2gvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fY3JlYXRlY2FjaGUvbm9kZV9tb2R1bGVzL2xvZGFzaC5fZ2V0b2JqZWN0L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5kaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VkaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2NyZWF0ZWNhY2hlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2dldG9iamVjdC9ub2RlX21vZHVsZXMvbG9kYXNoLl9vYmplY3Rwb29sL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5kaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VkaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2xhcmdlYXJyYXlzaXplL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5kaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2VkaWZmZXJlbmNlL25vZGVfbW9kdWxlcy9sb2Rhc2guX3JlbGVhc2VvYmplY3QvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWZsYXR0ZW4vaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLmRpZmZlcmVuY2Uvbm9kZV9tb2R1bGVzL2xvZGFzaC5fYmFzZWZsYXR0ZW4vbm9kZV9tb2R1bGVzL2xvZGFzaC5pc2FyZ3VtZW50cy9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guZm9yZWFjaC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guaXNhcnJheS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guaXNib29sZWFuL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc2Z1bmN0aW9uL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc25hbi9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guaXNudWxsL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc251bWJlci9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guaXNwbGFpbm9iamVjdC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guaXNwbGFpbm9iamVjdC9ub2RlX21vZHVsZXMvbG9kYXNoLl9zaGltaXNwbGFpbm9iamVjdC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guaXNwbGFpbm9iamVjdC9ub2RlX21vZHVsZXMvbG9kYXNoLl9zaGltaXNwbGFpbm9iamVjdC9ub2RlX21vZHVsZXMvbG9kYXNoLmZvcmluL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc3N0cmluZy9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2guaXN1bmRlZmluZWQvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLm1hcC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2gubWFwL25vZGVfbW9kdWxlcy9sb2Rhc2guY3JlYXRlY2FsbGJhY2svaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLm1hcC9ub2RlX21vZHVsZXMvbG9kYXNoLmNyZWF0ZWNhbGxiYWNrL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2Vpc2VxdWFsL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5tYXAvbm9kZV9tb2R1bGVzL2xvZGFzaC5jcmVhdGVjYWxsYmFjay9ub2RlX21vZHVsZXMvbG9kYXNoLnByb3BlcnR5L2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC5yZWR1Y2UvaW5kZXguanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvbG9kYXNoLnVuaW9uL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL2xvZGFzaC51bmlvbi9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNldW5pcS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9sb2Rhc2gudW5pcS9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9wYXJzZXVybC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9wYXRoLXRvLXJlZ2V4cC9pbmRleC5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL25vZGVfbW9kdWxlcy9zcGFyay1tZDUvc3BhcmstbWQ1LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbm9kZV9tb2R1bGVzL3RyYXZlcnNlL2luZGV4LmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvYXBpRGVjbGFyYXRpb24uanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9kYXRhVHlwZUJhc2UuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2luZm9PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL21vZGVsc09iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9vcGVyYXRpb25PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL3BhcmFtZXRlck9iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9yZXNvdXJjZU9iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8yLjAvc2NoZW1hLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbnpDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3ZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25zQkE7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDanVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7OztBQ2xEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMzQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7OztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNqTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUM5QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDckVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMzhDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0IEFwaWdlZSBDb3Jwb3JhdGlvblxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuICogYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG4gKiBUSEUgU09GVFdBUkUuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9IHtcbiAgY2xvbmVEZWVwOiByZXF1aXJlKCdsb2Rhc2guY2xvbmVkZWVwJyksXG4gIGRpZmZlcmVuY2U6IHJlcXVpcmUoJ2xvZGFzaC5kaWZmZXJlbmNlJyksXG4gIGVhY2g6IHJlcXVpcmUoJ2xvZGFzaC5mb3JlYWNoJyksXG4gIGlzQXJyYXk6IHJlcXVpcmUoJ2xvZGFzaC5pc2FycmF5JyksXG4gIGlzUGxhaW5PYmplY3Q6IHJlcXVpcmUoJ2xvZGFzaC5pc3BsYWlub2JqZWN0JyksXG4gIGlzVW5kZWZpbmVkOiByZXF1aXJlKCdsb2Rhc2guaXN1bmRlZmluZWQnKSxcbiAgbWFwOiByZXF1aXJlKCdsb2Rhc2gubWFwJyksXG4gIHJlZHVjZTogcmVxdWlyZSgnbG9kYXNoLnJlZHVjZScpLFxuICB1bmlvbjogcmVxdWlyZSgnbG9kYXNoLnVuaW9uJyksXG4gIHVuaXE6IHJlcXVpcmUoJ2xvZGFzaC51bmlxJylcbn07XG52YXIgamp2ID0gcmVxdWlyZSgnamp2Jyk7XG52YXIgamp2ZSA9IHJlcXVpcmUoJ2pqdmUnKTtcbnZhciBtZDUgPSByZXF1aXJlKCdzcGFyay1tZDUnKTtcbnZhciB0cmF2ZXJzZSA9IHJlcXVpcmUoJ3RyYXZlcnNlJyk7XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xudmFyIHBhdGhUb1JlZ2V4cCA9IHJlcXVpcmUoJ3BhdGgtdG8tcmVnZXhwJyk7XG52YXIgdmFsaWRhdG9ycyA9IHJlcXVpcmUoJy4vdmFsaWRhdG9ycycpO1xuXG52YXIgZHJhZnQwNEpzb24gPSByZXF1aXJlKCcuLi9zY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24nKTtcbnZhciBkcmFmdDA0VXJsID0gJ2h0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hJztcbnZhciBqanZPcHRpb25zID0ge1xuICBjaGVja1JlcXVpcmVkOiB0cnVlLFxuICByZW1vdmVBZGRpdGlvbmFsOiBmYWxzZSxcbiAgdXNlRGVmYXVsdDogZmFsc2UsXG4gIHVzZUNvZXJjZTogZmFsc2Vcbn07XG52YXIgamp2ZU9wdGlvbnMgPSB7XG4gIGZvcm1hdFBhdGg6IGZhbHNlXG59O1xudmFyIG1ldGFkYXRhQ2FjaGUgPSB7fTtcblxudmFyIGV4cHJlc3NTdHlsZVBhdGggPSBoZWxwZXJzLmV4cHJlc3NTdHlsZVBhdGg7XG52YXIgcmVmVG9Kc29uUG9pbnRlciA9IGhlbHBlcnMucmVmVG9Kc29uUG9pbnRlcjtcbnZhciB0b0pzb25Qb2ludGVyID0gaGVscGVycy50b0pzb25Qb2ludGVyO1xuXG52YXIgY3JlYXRlVmFsaWRhdG9yID0gZnVuY3Rpb24gY3JlYXRlVmFsaWRhdG9yIChzcGVjLCBzY2hlbWFOYW1lcykge1xuICB2YXIgdmFsaWRhdG9yID0gamp2KGpqdk9wdGlvbnMpO1xuXG4gIC8vIERpc2FibGUgdGhlICd1cmknIGZvcm1hdCBjaGVja2VyIGFzIGl0J3MgZ290IGlzc3VlczogaHR0cHM6Ly9naXRodWIuY29tL2Fjb3JuZWpvL2pqdi9pc3N1ZXMvMjRcbiAgdmFsaWRhdG9yLmFkZEZvcm1hdCgndXJpJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHZhbGlkYXRvci5hZGRTY2hlbWEoZHJhZnQwNFVybCwgZHJhZnQwNEpzb24pO1xuXG4gIC8vIENvbXBpbGUgdGhlIG5lY2Vzc2FyeSBzY2hlbWFzXG4gIF8uZWFjaChzY2hlbWFOYW1lcywgZnVuY3Rpb24gKHNjaGVtYU5hbWUpIHtcbiAgICB2YXIgY2xvbmUgPSBfLmNsb25lRGVlcChzcGVjLnNjaGVtYXNbc2NoZW1hTmFtZV0pO1xuXG4gICAgY2xvbmUuaWQgPSBzY2hlbWFOYW1lO1xuXG4gICAgdmFsaWRhdG9yLmFkZFNjaGVtYShzY2hlbWFOYW1lLCBjbG9uZSk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgdmFsaWRhdG9yLmplID0gamp2ZSh2YWxpZGF0b3IpO1xuXG4gIHJldHVybiB2YWxpZGF0b3I7XG59O1xuXG52YXIgY3JlYXRlRXJyb3JPcldhcm5pbmcgPSBmdW5jdGlvbiBjcmVhdGVFcnJvck9yV2FybmluZyAoY29kZSwgbWVzc2FnZSwgZGF0YSwgcGF0aCwgZGVzdCkge1xuICBkZXN0LnB1c2goe1xuICAgIGNvZGU6IGNvZGUsXG4gICAgbWVzc2FnZTogbWVzc2FnZSxcbiAgICBkYXRhOiBkYXRhLFxuICAgIHBhdGg6IHBhdGhcbiAgfSk7XG59O1xuXG52YXIgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcgPSBmdW5jdGlvbiBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyAoZGF0YSwgdmFsLCBjb2RlU3VmZml4LCBtc2dQcmVmaXgsIHBhdGgsIGRlc3QpIHtcbiAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOVVNFRF8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBpcyBkZWZpbmVkIGJ1dCBpcyBub3QgdXNlZDogJyArIHZhbCwgZGF0YSwgcGF0aCwgZGVzdCk7XG59O1xuXG52YXIgdmFsaWRhdGVFeGlzdCA9IGZ1bmN0aW9uIHZhbGlkYXRlRXhpc3QgKGRhdGEsIHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChkYXRhKSAmJiBkYXRhLmluZGV4T2YodmFsKSA9PT0gLTEpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHZhbCwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlTm9FeGlzdCA9IGZ1bmN0aW9uIHZhbGlkYXRlTm9FeGlzdCAoZGF0YSwgdmFsLCBjb2RlU3VmZml4LCBtc2dQcmVmaXgsIHBhdGgsIGRlc3QpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGRhdGEpICYmIGRhdGEuaW5kZXhPZih2YWwpID4gLTEpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnIGFscmVhZHkgZGVmaW5lZDogJyArIHZhbCwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlTm9EdXBsaWNhdGVzID0gZnVuY3Rpb24gdmFsaWRhdGVOb0R1cGxpY2F0ZXMgKGRhdGEsIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCwgcGF0aCwgZGVzdCkge1xuICB2YXIgbmFtZSA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXTtcblxuICBpZiAoIV8uaXNVbmRlZmluZWQoZGF0YSkgJiYgZGF0YS5sZW5ndGggIT09IF8udW5pcShkYXRhKS5sZW5ndGgpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnICcgKyBuYW1lICsgJyBoYXMgZHVwbGljYXRlIGl0ZW1zJywgZGF0YSwgcGF0aCwgZGVzdCk7XG4gIH1cbn07XG5cbi8vIFRPRE86IE1vdmUgdGhpcyB0byBhIGhlbHBlclxuXG52YXIgdmFsaWRhdGVQYXJhbWV0ZXJDb25zdHJhaW50cyA9IGZ1bmN0aW9uIHZhbGlkYXRlUGFyYW1ldGVyQ29uc3RyYWludHMgKHNwZWMsIHBhcmFtZXRlciwgdmFsLCBwYXRoLCBkZXN0KSB7XG4gIHN3aXRjaCAoc3BlYy52ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgLy8gVE9ETzogTWFrZSB0aGlzIHdvcmsgd2l0aCBwYXJhbWV0ZXJzIHRoYXQgaGF2ZSByZWZlcmVuY2VzXG5cbiAgICAvLyBWYWxpZGF0ZSB0aGUgdmFsdWUgdHlwZS9mb3JtYXRcbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZVR5cGVBbmRGb3JtYXQocGFyYW1ldGVyLm5hbWUsIHZhbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlci50eXBlID09PSAnYXJyYXknID8gcGFyYW1ldGVyLml0ZW1zLnR5cGUgOiBwYXJhbWV0ZXIudHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlci50eXBlID09PSAnYXJyYXknICYmIHBhcmFtZXRlci5pdGVtcy5mb3JtYXQgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIuaXRlbXMuZm9ybWF0IDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLmZvcm1hdCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAvLyBUT0RPOiBVcGRhdGUgdG8gbm90aWZ5IG9mICdJTlZBTElEX0ZPUk1BVCdcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nICgnSU5WQUxJRF9UWVBFJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgZW51bVxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlRW51bShwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIuZW51bSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyAoJ0VOVU1fTUlTTUFUQ0gnLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhpbXVtXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVNYXhpbXVtKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5tYXhpbXVtLCBwYXJhbWV0ZXIudHlwZSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyAoJ01BWElNVU0nLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBtaW5pbXVtXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVNaW5pbXVtKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5taW5pbXVtLCBwYXJhbWV0ZXIudHlwZSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyAoJ01JTklNVU0nLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSB1bmlxdWVJdGVtc1xuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlVW5pcXVlSXRlbXMocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLnVuaXF1ZUl0ZW1zKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nICgnQVJSQVlfVU5JUVVFJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBUT0RPOiBNYWtlIHRoaXMgd29yayB3aXRoIHBhcmFtZXRlcnMgdGhhdCBoYXZlIHNjaGVtYXMvcmVmZXJlbmNlc1xuXG4gICAgLy8gVmFsaWRhdGUgdGhlIHZhbHVlIHR5cGUvZm9ybWF0XG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVUeXBlQW5kRm9ybWF0KHBhcmFtZXRlci5uYW1lLCB2YWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIudHlwZSA9PT0gJ2FycmF5JyA/IHBhcmFtZXRlci5pdGVtcy50eXBlIDogcGFyYW1ldGVyLnR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIudHlwZSA9PT0gJ2FycmF5JyAmJiBwYXJhbWV0ZXIuaXRlbXMuZm9ybWF0ID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLml0ZW1zLmZvcm1hdCA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlci5mb3JtYXQpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgLy8gVE9ETzogVXBkYXRlIHRvIG5vdGlmeSBvZiAnSU5WQUxJRF9GT1JNQVQnXG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnSU5WQUxJRF9UWVBFJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgZW51bVxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlRW51bShwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIuZW51bSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRU5VTV9NSVNNQVRDSCcsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIG1heGltdW1cbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1heGltdW0ocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1heGltdW0sIHBhcmFtZXRlci50eXBlLCBwYXJhbWV0ZXIuZXhjbHVzaXZlTWF4aW11bSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyhwYXJhbWV0ZXIuZXhjbHVzaXZlTWF4aW11bSA9PT0gdHJ1ZSA/ICdNQVhJTVVNX0VYQ0xVU0lWRScgOiAnTUFYSU1VTScsIGVyci5tZXNzYWdlLCB2YWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhpbXVtIGl0ZW1zXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVNYXhJdGVtcyhwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIubWF4SXRlbXMpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0FSUkFZX0xFTkdUSF9MT05HJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWF4aW11bSBsZW5ndGhcbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1heExlbmd0aChwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIubWF4TGVuZ3RoKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNQVhfTEVOR1RIJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWluaW11bVxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlTWluaW11bShwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIubWluaW11bSwgcGFyYW1ldGVyLnR5cGUsIHBhcmFtZXRlci5leGNsdXNpdmVNaW5pbXVtKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKHBhcmFtZXRlci5leGNsdXNpdmVNaW5pbXVtID09PSAndHJ1ZScgPyAnTUlOSU1VTV9FWENMVVNJVkUnIDogJ01JTklNVU0nLCBlcnIubWVzc2FnZSwgdmFsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWluaW11bSBpdGVtc1xuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlTWluSXRlbXMocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1pbkl0ZW1zKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdBUlJBWV9MRU5HVEhfU0hPUlQnLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBtaW5pbXVtIGxlbmd0aFxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlTWluTGVuZ3RoKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5taW5MZW5ndGgpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01JTl9MRU5HVEgnLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBwYXR0ZXJuXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVQYXR0ZXJuKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5wYXR0ZXJuKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdQQVRURVJOJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgdW5pcXVlSXRlbXNcbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZVVuaXF1ZUl0ZW1zKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci51bmlxdWVJdGVtcyk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQVJSQVlfVU5JUVVFJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGJyZWFrO1xuICB9XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgU3dhZ2dlciBzcGVjaWZpY2F0aW9uIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvbiAtIFRoZSBTd2FnZ2VyIHZlcnNpb25cbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIFNwZWNpZmljYXRpb24gPSBmdW5jdGlvbiBTcGVjaWZpY2F0aW9uICh2ZXJzaW9uKSB7XG4gIHZhciBwcmltaXRpdmVzID0gWydzdHJpbmcnLCAnbnVtYmVyJywgJ2Jvb2xlYW4nLCAnaW50ZWdlcicsICdhcnJheSddO1xuICB2YXIgZG9jc1VybDtcbiAgdmFyIHNjaGVtYXNVcmw7XG5cbiAgc3dpdGNoICh2ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgZG9jc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vd29yZG5pay9zd2FnZ2VyLXNwZWMvYmxvYi9tYXN0ZXIvdmVyc2lvbnMvMS4yLm1kJztcbiAgICBwcmltaXRpdmVzID0gXy51bmlvbihwcmltaXRpdmVzLCBbJ3ZvaWQnLCAnRmlsZSddKTtcbiAgICBzY2hlbWFzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS93b3JkbmlrL3N3YWdnZXItc3BlYy90cmVlL21hc3Rlci9zY2hlbWFzL3YxLjInO1xuXG4gICAgYnJlYWs7XG4gIGNhc2UgJzIuMCc6XG4gICAgZG9jc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vd29yZG5pay9zd2FnZ2VyLXNwZWMvYmxvYi9tYXN0ZXIvdmVyc2lvbnMvMi4wLm1kJztcbiAgICBwcmltaXRpdmVzID0gXy51bmlvbihwcmltaXRpdmVzLCBbJ2ZpbGUnXSk7XG4gICAgc2NoZW1hc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vd29yZG5pay9zd2FnZ2VyLXNwZWMvdHJlZS9tYXN0ZXIvc2NoZW1hcy92Mi4wJztcblxuICAgIGJyZWFrO1xuICBkZWZhdWx0OlxuICAgIHRocm93IG5ldyBFcnJvcih2ZXJzaW9uICsgJyBpcyBhbiB1bnN1cHBvcnRlZCBTd2FnZ2VyIHNwZWNpZmljYXRpb24gdmVyc2lvbicpO1xuICB9XG5cbiAgdGhpcy5kb2NzVXJsID0gZG9jc1VybDtcbiAgdGhpcy5wcmltaXRpdmVzID0gcHJpbWl0aXZlcztcbiAgdGhpcy5zY2hlbWFzVXJsID0gc2NoZW1hc1VybDtcbiAgdGhpcy52ZXJzaW9uID0gdmVyc2lvbjtcblxuICAvLyBMb2FkIHRoZSBzY2hlbWEgZmlsZXNcbiAgdGhpcy5zY2hlbWFzID0ge307XG5cbiAgLy8gQ3JlYXRlIHRoZSB2YWxpZGF0b3JzXG4gIHRoaXMudmFsaWRhdG9ycyA9IHt9O1xuXG4gIHN3aXRjaCAodmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIEhlcmUgZXhwbGljaXRseSB0byBhbGxvdyBicm93c2VyaWZ5IHRvIHdvcmtcbiAgICB0aGlzLnNjaGVtYXNbJ2FwaURlY2xhcmF0aW9uLmpzb24nXSA9IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2FwaURlY2xhcmF0aW9uLmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydkYXRhVHlwZS5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9kYXRhVHlwZS5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydkYXRhVHlwZUJhc2UuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvZGF0YVR5cGVCYXNlLmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ2luZm9PYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvaW5mb09iamVjdC5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydtb2RlbHNPYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvbW9kZWxzT2JqZWN0Lmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ29hdXRoMkdyYW50VHlwZS5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9vYXV0aDJHcmFudFR5cGUuanNvbicpO1xuICAgIHRoaXMuc2NoZW1hc1snb3BlcmF0aW9uT2JqZWN0Lmpzb24nXSA9IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL29wZXJhdGlvbk9iamVjdC5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydwYXJhbWV0ZXJPYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcGFyYW1ldGVyT2JqZWN0Lmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ3Jlc291cmNlTGlzdGluZy5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9yZXNvdXJjZUxpc3RpbmcuanNvbicpO1xuICAgIHRoaXMuc2NoZW1hc1sncmVzb3VyY2VPYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcmVzb3VyY2VPYmplY3QuanNvbicpO1xuXG4gICAgdGhpcy52YWxpZGF0b3JzWydhcGlEZWNsYXJhdGlvbi5qc29uJ10gPSBjcmVhdGVWYWxpZGF0b3IodGhpcywgW1xuICAgICAgJ2RhdGFUeXBlQmFzZS5qc29uJyxcbiAgICAgICdtb2RlbHNPYmplY3QuanNvbicsXG4gICAgICAnb2F1dGgyR3JhbnRUeXBlLmpzb24nLFxuICAgICAgJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbicsXG4gICAgICAncGFyYW1ldGVyT2JqZWN0Lmpzb24nLFxuICAgICAgJ29wZXJhdGlvbk9iamVjdC5qc29uJyxcbiAgICAgICdhcGlEZWNsYXJhdGlvbi5qc29uJ1xuICAgIF0pO1xuXG4gICAgdGhpcy52YWxpZGF0b3JzWydyZXNvdXJjZUxpc3RpbmcuanNvbiddID0gY3JlYXRlVmFsaWRhdG9yKHRoaXMsIFtcbiAgICAgICdyZXNvdXJjZU9iamVjdC5qc29uJyxcbiAgICAgICdpbmZvT2JqZWN0Lmpzb24nLFxuICAgICAgJ29hdXRoMkdyYW50VHlwZS5qc29uJyxcbiAgICAgICdhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24nLFxuICAgICAgJ3Jlc291cmNlTGlzdGluZy5qc29uJ1xuICAgIF0pO1xuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBIZXJlIGV4cGxpY2l0bHkgdG8gYWxsb3cgYnJvd3NlcmlmeSB0byB3b3JrXG4gICAgdGhpcy5zY2hlbWFzWydzY2hlbWEuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8yLjAvc2NoZW1hLmpzb24nKTtcblxuICAgIHRoaXMudmFsaWRhdG9yc1snc2NoZW1hLmpzb24nXSA9IGNyZWF0ZVZhbGlkYXRvcih0aGlzLCBbXG4gICAgICAnc2NoZW1hLmpzb24nXG4gICAgXSk7XG5cbiAgICBicmVhaztcbiAgfVxufTtcblxudmFyIGdldE1vZGVsTWV0YWRhdGEgPSBmdW5jdGlvbiBnZXRNb2RlbE1ldGFkYXRhIChtb2RlbHNNZXRhZGF0YSwgbW9kZWxJZCkge1xuICB2YXIgbWV0YWRhdGEgPSBtb2RlbHNNZXRhZGF0YVttb2RlbElkXTtcblxuICBpZiAoXy5pc1VuZGVmaW5lZChtZXRhZGF0YSkpIHtcbiAgICBtZXRhZGF0YSA9IG1vZGVsc01ldGFkYXRhW21vZGVsSWRdID0ge1xuICAgICAgY29tcG9zZWQ6IHt9LFxuICAgICAgbmFtZTogdW5kZWZpbmVkLFxuICAgICAgcGFyZW50czogW10sXG4gICAgICByZWZzOiBbXSxcbiAgICAgIHNjaGVtYTogdW5kZWZpbmVkXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBtZXRhZGF0YTtcbn07XG5cbnZhciBwcm9jZXNzTW9kZWwgPSBmdW5jdGlvbiBwcm9jZXNzTW9kZWwgKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBtb2RlbCwgbW9kZWxJZCwgcGF0aCwgcmVzdWx0cykge1xuICB2YXIgbWV0YWRhdGEgPSBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCBtb2RlbElkKTtcblxuICAvLyBFbnN1cmUgdGhlIG1vZGVsJ3MgbmFtZSBhbmQgc2NoZW1hIGFyZSBzZXRcbiAgbWV0YWRhdGEuc2NoZW1hID0gbW9kZWw7XG4gIG1ldGFkYXRhLm5hbWUgPSBtb2RlbElkOyAvLyBSZWFzb25hYmxlIGRlZmF1bHRcbiAgbWV0YWRhdGEucGF0aCA9IHBhdGg7XG5cbiAgc3dpdGNoIChzcGVjLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBTZXQgdGhlIG1vZGVsJ3MgbmFtZSB0byB0aGUgcHJvcGVyIHZhbHVlXG4gICAgbWV0YWRhdGEubmFtZSA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXTtcblxuICAgIC8vIEFkZCBtb2RlbCByZWZlcmVuY2VzIGZyb20gcHJvcGVydGllcyBhbmQgdmFsaWRhdGUgdGhlIGRlZmF1bHQgdmFsdWVzXG4gICAgXy5lYWNoKG1vZGVsLnByb3BlcnRpZXMsIGZ1bmN0aW9uIChwcm9wZXJ0eSwgbmFtZSkge1xuICAgICAgdmFyIHBQYXRoID0gcGF0aC5jb25jYXQoJ3Byb3BlcnRpZXMnLCBuYW1lKTtcblxuICAgICAgLy8gS2VlcCB0cmFjayBvZiB0aGUgbW9kZWwgcmVmZXJlbmNlc1xuICAgICAgaWYgKHByb3BlcnR5LiRyZWYpIHtcbiAgICAgICAgZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgcHJvcGVydHkuJHJlZikucmVmcy5wdXNoKHBQYXRoLmNvbmNhdChbJyRyZWYnXSkpO1xuICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eS50eXBlID09PSAnYXJyYXknICYmIHByb3BlcnR5Lml0ZW1zLiRyZWYpIHtcbiAgICAgICAgZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgcHJvcGVydHkuaXRlbXMuJHJlZikucmVmcy5wdXNoKHBQYXRoLmNvbmNhdChbJ2l0ZW1zJywgJyRyZWYnXSkpO1xuICAgICAgfVxuXG4gICAgICAvLyBWYWxpZGF0ZSB0aGUgZGVmYXVsdCB2YWx1ZSBhZ2FpbnN0IGNvbnN0cmFpbnRzXG4gICAgICBpZiAoIV8uaXNVbmRlZmluZWQocHJvcGVydHkuZGVmYXVsdFZhbHVlKSkge1xuICAgICAgICB2YWxpZGF0ZVBhcmFtZXRlckNvbnN0cmFpbnRzKHNwZWMsIHByb3BlcnR5LCBwcm9wZXJ0eS5kZWZhdWx0VmFsdWUsIHBQYXRoLmNvbmNhdCgnZGVmYXVsdFZhbHVlJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gS2VlcCB0cmFjayBvZiBtb2RlbCByZWZlcmVuY2VzIGluIHN1YlR5cGVzXG4gICAgXy5lYWNoKF8udW5pcShtb2RlbC5zdWJUeXBlcyksIGZ1bmN0aW9uIChzdWJUeXBlLCBpbmRleCkge1xuICAgICAgdmFyIHN1Yk1ldGFkYXRhID0gZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgc3ViVHlwZSk7XG5cbiAgICAgIHN1Yk1ldGFkYXRhLnBhcmVudHMucHVzaChtb2RlbElkKTtcbiAgICAgIHN1Yk1ldGFkYXRhLnJlZnMucHVzaChwYXRoLmNvbmNhdCgnc3ViVHlwZXMnLCBpbmRleC50b1N0cmluZygpKSk7XG4gICAgfSk7XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIEtlZXAgdHJhY2sgb2YgbW9kZWwgcmVmZXJlbmNlcyBpbiBhbGxPZlxuICAgIF8uZWFjaChfLnVuaXEobW9kZWwuYWxsT2YpLCBmdW5jdGlvbiAoc2NoZW1hLCBpbmRleCkge1xuICAgICAgdmFyIHNQYXRoID0gcGF0aC5jb25jYXQoJ2FsbE9mJywgaW5kZXgudG9TdHJpbmcoKSk7XG5cbiAgICAgIGlmIChfLmlzVW5kZWZpbmVkKHNjaGVtYS4kcmVmKSkge1xuICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIHNjaGVtYSwgdG9Kc29uUG9pbnRlcihzUGF0aCksIHNQYXRoLCByZXN1bHRzKTtcblxuICAgICAgICBtZXRhZGF0YS5wYXJlbnRzLnB1c2godG9Kc29uUG9pbnRlcihzUGF0aCkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWV0YWRhdGEucGFyZW50cy5wdXNoKHJlZlRvSnNvblBvaW50ZXIoc2NoZW1hLiRyZWYpKTtcblxuICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCByZWZUb0pzb25Qb2ludGVyKHNjaGVtYS4kcmVmKSkucmVmcy5wdXNoKHNQYXRoLmNvbmNhdCgnJHJlZicpKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFZhbGlkYXRlIHRoZSBkZWZhdWx0IHZhbHVlIGFnYWluc3QgY29uc3RyYWludHNcbiAgICBpZiAoIV8uaXNVbmRlZmluZWQobW9kZWwuZGVmYXVsdCkpIHtcbiAgICAgIHZhbGlkYXRlUGFyYW1ldGVyQ29uc3RyYWludHMoc3BlYywgbW9kZWwsIG1vZGVsLmRlZmF1bHRWYWx1ZSwgcGF0aC5jb25jYXQoJ2RlZmF1bHQnKSwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cblxuICAgIC8vIFNraXBwaW5nICdkZWZpbml0aW9ucycgZm9yIG5vdzogaHR0cHM6Ly9naXRodWIuY29tL3JldmVyYi9zd2FnZ2VyLXNwZWMvaXNzdWVzLzEyN1xuXG4gICAgLy8gS2VlcCB0cmFjayBvZiBtb2RlbCByZWZlcmVuY2VzIGluICRyZWYsIGl0ZW1zLiRyZWZcbiAgICBpZiAobW9kZWwuJHJlZikge1xuICAgICAgZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgcmVmVG9Kc29uUG9pbnRlcihtb2RlbC4kcmVmKSkucmVmcy5wdXNoKHBhdGguY29uY2F0KFsnJHJlZiddKSk7XG4gICAgfSBlbHNlIGlmIChtb2RlbC50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICBpZiAobW9kZWwuaXRlbXMuJHJlZikge1xuICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCByZWZUb0pzb25Qb2ludGVyKG1vZGVsLml0ZW1zLiRyZWYpKS5yZWZzLnB1c2gocGF0aC5jb25jYXQoWydpdGVtcycsICckcmVmJ10pKTtcbiAgICAgIH0gZWxzZSBpZiAoIV8uaXNVbmRlZmluZWQobW9kZWwuaXRlbXMudHlwZSkgJiYgc3BlYy5wcmltaXRpdmVzLmluZGV4T2YobW9kZWwuaXRlbXMudHlwZSkgPT09IC0xKSB7XG4gICAgICAgIF8uZWFjaChtb2RlbC5pdGVtcywgZnVuY3Rpb24gKGl0ZW0sIGluZGV4KSB7XG4gICAgICAgICAgdmFyIHNQYXRoID0gcGF0aC5jb25jYXQoJ2l0ZW1zJywgaW5kZXgudG9TdHJpbmcoKSk7XG5cbiAgICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIGl0ZW0sIHRvSnNvblBvaW50ZXIoc1BhdGgpLCBzUGF0aCwgcmVzdWx0cyk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIF8uZWFjaChtb2RlbC5wcm9wZXJ0aWVzLCBmdW5jdGlvbiAocHJvcGVydHksIG5hbWUpIHtcbiAgICAgIHZhciBwUGF0aCA9IHBhdGguY29uY2F0KCdwcm9wZXJ0aWVzJywgbmFtZSk7XG5cbiAgICAgIC8vIEtlZXAgdHJhY2sgb2YgbW9kZWwgcmVmZXJlbmNlcyBpbiAkcmVmLCBpdGVtcy4kcmVmXG4gICAgICBpZiAocHJvcGVydHkuJHJlZikge1xuICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCByZWZUb0pzb25Qb2ludGVyKHByb3BlcnR5LiRyZWYpKS5yZWZzLnB1c2gocFBhdGguY29uY2F0KFsnJHJlZiddKSk7XG4gICAgICB9IGVsc2UgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgICAgaWYgKHByb3BlcnR5Lml0ZW1zLiRyZWYpIHtcbiAgICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVmVG9Kc29uUG9pbnRlcihwcm9wZXJ0eS5pdGVtcy4kcmVmKSkucmVmcy5wdXNoKHBQYXRoLmNvbmNhdChbJ2l0ZW1zJywgJyRyZWYnXSkpO1xuICAgICAgICB9IGVsc2UgaWYgKCFfLmlzVW5kZWZpbmVkKHByb3BlcnR5Lml0ZW1zLnR5cGUpICYmIHNwZWMucHJpbWl0aXZlcy5pbmRleE9mKHByb3BlcnR5Lml0ZW1zLnR5cGUpID09PSAtMSkge1xuICAgICAgICAgIF8uZWFjaChwcm9wZXJ0eS5pdGVtcywgZnVuY3Rpb24gKHNjaGVtYSwgaW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBzUGF0aCA9IHBQYXRoLmNvbmNhdCgnaXRlbXMnLCBpbmRleC50b1N0cmluZygpKTtcblxuICAgICAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBzY2hlbWEsIHRvSnNvblBvaW50ZXIoc1BhdGgpLCBzUGF0aCwgcmVzdWx0cyk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuXG4gICAgLy8gQWRkIHNlbGYgcmVmZXJlbmNlIHRvIGFsbCBtb2RlbCBkZWZpbml0aW9ucyBvdXRzaWRlIG9mICMvZGVmaW5pdGlvbnMgKFRoZXkgYXJlIGlubGluZSBtb2RlbHMgb3IgcmVmZXJlbmNlcylcbiAgICBpZiAodG9Kc29uUG9pbnRlcihwYXRoKS5pbmRleE9mKCcjL2RlZmluaXRpb25zLycpID09PSAtMSkge1xuICAgICAgbWV0YWRhdGEucmVmcy5wdXNoKHBhdGgpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuICB9XG59O1xuXG52YXIgZ2V0TW9kZWxzTWV0YWRhdGEgPSBmdW5jdGlvbiBnZXRNb2RlbHNNZXRhZGF0YSAoc3BlYywgYXBpRE9yU08sIHJlc3VsdHMpIHtcbiAgdmFyIGNpcmN1bGFyID0ge307XG4gIHZhciBsb2NhbFJlc3VsdHMgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcbiAgdmFyIHJlc29sdmVkID0ge307XG4gIHZhciB1bnJlc29sdmVkID0ge307XG4gIHZhciBhZGRNb2RlbFByb3BzID0gZnVuY3Rpb24gYWRkTW9kZWxQcm9wcyAobW9kZWxJZCwgY29tcG9zZWQpIHtcbiAgICB2YXIgbW9kZWwgPSBtb2RlbHNNZXRhZGF0YVttb2RlbElkXS5zY2hlbWE7XG5cbiAgICBpZiAobW9kZWwpIHtcbiAgICAgIF8uZWFjaChtb2RlbC5wcm9wZXJ0aWVzLCBmdW5jdGlvbiAocHJvcCwgcHJvcE5hbWUpIHtcbiAgICAgICAgdmFyIG5ld1Byb3AgPSBfLmNsb25lRGVlcChwcm9wKTtcblxuICAgICAgICBpZiAoY29tcG9zZWQucHJvcGVydGllc1twcm9wTmFtZV0pIHtcbiAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQ0hJTERfTU9ERUxfUkVERUNMQVJFU19QUk9QRVJUWScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0NoaWxkIG1vZGVsIGRlY2xhcmVzIHByb3BlcnR5IGFscmVhZHkgZGVjbGFyZWQgYnkgYW5jZXN0b3I6ICcgKyBwcm9wTmFtZSwgcHJvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcGVjLnZlcnNpb24gPT09ICcxLjInID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnbW9kZWxzJywgbW9kZWxJZCwgJ3Byb3BlcnRpZXMnLCBwcm9wTmFtZV0gOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxJZC5zdWJzdHJpbmcoMikuc3BsaXQoJy8nKS5jb25jYXQoJ3Byb3BlcnRpZXMnLCBwcm9wTmFtZSksIGxvY2FsUmVzdWx0cy5lcnJvcnMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICAgICAgICAvLyBTYW5pdGl6ZSB0aGUgbWF4aW11bS9taW5pbXVtIHZhbHVlcyB0byBiZSBudW1iZXJzXG4gICAgICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQobmV3UHJvcC5tYXhpbXVtKSkge1xuICAgICAgICAgICAgICBuZXdQcm9wLm1heGltdW0gPSBwYXJzZUZsb2F0KG5ld1Byb3AubWF4aW11bSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChuZXdQcm9wLm1pbmltdW0pKSB7XG4gICAgICAgICAgICAgIG5ld1Byb3AubWluaW11bSA9IHBhcnNlRmxvYXQobmV3UHJvcC5taW5pbXVtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgY29tcG9zZWQucHJvcGVydGllc1twcm9wTmFtZV0gPSBuZXdQcm9wO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKG1vZGVsLnJlcXVpcmVkKSAmJiBfLmlzVW5kZWZpbmVkKGNvbXBvc2VkLnJlcXVpcmVkKSkge1xuICAgICAgICBjb21wb3NlZC5yZXF1aXJlZCA9IFtdO1xuICAgICAgfVxuXG4gICAgICBfLmVhY2gobW9kZWwucmVxdWlyZWQsIGZ1bmN0aW9uIChwcm9wTmFtZSkge1xuICAgICAgICBpZiAoY29tcG9zZWQucmVxdWlyZWQuaW5kZXhPZihwcm9wTmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgY29tcG9zZWQucmVxdWlyZWQucHVzaChwcm9wTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbiAgdmFyIGdldFBhdGggPSBmdW5jdGlvbiBnZXRQYXRoIChwYXJlbnQsIHVucmVzb2x2ZWQpIHtcbiAgICB2YXIgcGFyZW50VmlzaXRlZCA9IGZhbHNlO1xuXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKHVucmVzb2x2ZWQpLmZpbHRlcihmdW5jdGlvbiAoZGVwKSB7XG4gICAgICBpZiAoZGVwID09PSBwYXJlbnQpIHtcbiAgICAgICAgcGFyZW50VmlzaXRlZCA9IHRydWU7XG4gICAgICB9XG4gICAgICByZXR1cm4gcGFyZW50VmlzaXRlZCAmJiB1bnJlc29sdmVkW2RlcF07XG4gICAgfSk7XG4gIH07XG4gIHZhciByZXNvbHZlciA9IGZ1bmN0aW9uIHJlc29sdmVyIChtb2RlbElkLCBjaXJjdWxhciwgcmVzb2x2ZWQsIHVucmVzb2x2ZWQsIGNvbXBvc2VkKSB7XG4gICAgdmFyIG1ldGFkYXRhID0gbW9kZWxzTWV0YWRhdGFbbW9kZWxJZF07XG4gICAgdmFyIG1vZGVsID0gbWV0YWRhdGEuc2NoZW1hO1xuXG4gICAgdW5yZXNvbHZlZFttb2RlbElkXSA9IHRydWU7XG5cbiAgICBpZiAoIV8uaXNVbmRlZmluZWQobW9kZWwpKSB7XG4gICAgICAvLyAxLjIgZG9lcyBub3QgYWxsb3cgbXVsdGlwbGUgaW5oZXJpdGFuY2Ugd2hpbGUgMi4wKyBkb2VzXG4gICAgICBpZiAobWV0YWRhdGEucGFyZW50cy5sZW5ndGggPiAxICYmIHNwZWMudmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01VTFRJUExFX01PREVMX0lOSEVSSVRBTkNFJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0NoaWxkIG1vZGVsIGlzIHN1YiB0eXBlIG9mIG11bHRpcGxlIG1vZGVsczogJyArIG1ldGFkYXRhLnBhcmVudHMuam9pbignICYmICcpLCBtb2RlbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydtb2RlbHMnLCBtb2RlbElkXSwgbG9jYWxSZXN1bHRzLmVycm9ycyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBfLmVhY2gobWV0YWRhdGEucGFyZW50cywgZnVuY3Rpb24gKGRlcCkge1xuICAgICAgICAgIGlmICghcmVzb2x2ZWRbZGVwXSkge1xuICAgICAgICAgICAgaWYgKHVucmVzb2x2ZWRbZGVwXSkge1xuICAgICAgICAgICAgICBjaXJjdWxhclttb2RlbElkXSA9IGdldFBhdGgoZGVwLCB1bnJlc29sdmVkKTtcblxuICAgICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQ1lDTElDQUxfTU9ERUxfSU5IRVJJVEFOQ0UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnTW9kZWwgaGFzIGEgY2lyY3VsYXIgaW5oZXJpdGFuY2U6ICcgKyBtb2RlbElkICsgJyAtPiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaXJjdWxhclttb2RlbElkXS5qb2luKCcgLT4gJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNwZWMudmVyc2lvbiA9PT0gJzEuMicgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsLnN1YlR5cGVzIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbC5hbGxPZixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3BlYy52ZXJzaW9uID09PSAnMS4yJyA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydtb2RlbHMnLCBtb2RlbElkLCAnc3ViVHlwZXMnXSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxJZC5zdWJzdHJpbmcoMikuc3BsaXQoJy8nKS5jb25jYXQoJ2FsbE9mJyksIGxvY2FsUmVzdWx0cy5lcnJvcnMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBEbyBub3QgcmVzb2x2ZSBpZiBjaXJjdWxhclxuICAgICAgICAgICAgaWYgKCFjaXJjdWxhclttb2RlbElkXSkge1xuICAgICAgICAgICAgICByZXNvbHZlcihkZXAsIGNpcmN1bGFyLCByZXNvbHZlZCwgdW5yZXNvbHZlZCwgY29tcG9zZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIERvIG5vdCBhZGQgcHJvcGVydGllcyBpZiBjaXJjdWxhclxuICAgICAgICAgIGlmICghY2lyY3VsYXJbbW9kZWxJZF0pIHtcbiAgICAgICAgICAgIGFkZE1vZGVsUHJvcHMoZGVwLCBjb21wb3NlZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXNvbHZlZFttb2RlbElkXSA9IHRydWU7XG4gICAgdW5yZXNvbHZlZFttb2RlbElkXSA9IGZhbHNlO1xuICB9O1xuICB2YXIgaGFzaCA9IG1kNS5oYXNoKEpTT04uc3RyaW5naWZ5KGFwaURPclNPKSk7XG4gIHZhciBtZXRhZGF0YUVudHJ5ID0gbWV0YWRhdGFDYWNoZVtoYXNoXTtcbiAgdmFyIG1vZGVsc01ldGFkYXRhO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKG1ldGFkYXRhRW50cnkpKSB7XG4gICAgbWV0YWRhdGFFbnRyeSA9IG1ldGFkYXRhQ2FjaGVbaGFzaF0gPSB7XG4gICAgICBtZXRhZGF0YToge30sXG4gICAgICByZXN1bHRzOiBsb2NhbFJlc3VsdHNcbiAgICB9O1xuXG4gICAgbW9kZWxzTWV0YWRhdGEgPSBtZXRhZGF0YUVudHJ5Lm1ldGFkYXRhO1xuXG4gICAgc3dpdGNoIChzcGVjLnZlcnNpb24pIHtcbiAgICBjYXNlICcxLjInOlxuICAgICAgXy5yZWR1Y2UoYXBpRE9yU08ubW9kZWxzLCBmdW5jdGlvbiAoc2Vlbk1vZGVsSWRzLCBtb2RlbCwgbW9kZWxOYW1lKSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIHRoZSBtb2RlbCBpcyBub3QgYWxyZWFkeSBkZWZpbmVkIChieSBpZClcbiAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5Nb2RlbElkcywgbW9kZWwuaWQsICdNT0RFTF9ERUZJTklUSU9OJywgJ01vZGVsJywgWydtb2RlbHMnLCBtb2RlbE5hbWUsICdpZCddLFxuICAgICAgICAgICAgICAgICAgICAgICAgbG9jYWxSZXN1bHRzLmVycm9ycyk7XG5cbiAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBtb2RlbCwgbW9kZWwuaWQsIFsnbW9kZWxzJywgbW9kZWxOYW1lXSwgbG9jYWxSZXN1bHRzKTtcblxuICAgICAgICByZXR1cm4gc2Vlbk1vZGVsSWRzLmNvbmNhdChtb2RlbC5pZCk7XG4gICAgICB9LCBbXSk7XG5cbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAnMi4wJzpcbiAgICAgIC8vIEZpbmQgbW9kZWxzIGRlZmluZWQvcmVmZXJlbmNlZCBpbiAjL2RlZmluaXRpb25zXG4gICAgICBfLmVhY2goYXBpRE9yU08uZGVmaW5pdGlvbnMsIGZ1bmN0aW9uIChtb2RlbCwgbW9kZWxJZCkge1xuICAgICAgICB2YXIgZFBhdGggPSBbJ2RlZmluaXRpb25zJywgbW9kZWxJZF07XG5cbiAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBtb2RlbCwgdG9Kc29uUG9pbnRlcihkUGF0aCksIGRQYXRoLCBsb2NhbFJlc3VsdHMpO1xuICAgICAgfSk7XG5cbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIC8vIENvbXBvc2UgbW9kZWxzIGFuZCBpZGVudGlmeSBpbmhlcml0YW5jZSBpc3N1ZXNcbiAgICBfLmVhY2gobW9kZWxzTWV0YWRhdGEsIGZ1bmN0aW9uIChtZXRhZGF0YSwgbW9kZWxJZCkge1xuICAgICAgbWV0YWRhdGEuY29tcG9zZWQgPSB7XG4gICAgICAgIHRpdGxlOiAnQ29tcG9zZWQgJyArIG1vZGVsSWQsXG4gICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICBwcm9wZXJ0aWVzOiB7fVxuICAgICAgfTtcblxuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKG1ldGFkYXRhLnNjaGVtYSkpIHtcbiAgICAgICAgcmVzb2x2ZXIobW9kZWxJZCwgY2lyY3VsYXIsIHJlc29sdmVkLCB1bnJlc29sdmVkLCBtZXRhZGF0YS5jb21wb3NlZCk7XG4gICAgICAgIGFkZE1vZGVsUHJvcHMobW9kZWxJZCwgbWV0YWRhdGEuY29tcG9zZWQpO1xuICAgICAgfVxuXG4gICAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBwcm9wZXJ0aWVzXG4gICAgICBpZiAoIV8uaXNVbmRlZmluZWQobWV0YWRhdGEuc2NoZW1hLnJlcXVpcmVkKSkge1xuICAgICAgICBfLmVhY2gobWV0YWRhdGEuc2NoZW1hLnJlcXVpcmVkLCBmdW5jdGlvbiAocHJvcE5hbWUsIGluZGV4KSB7XG4gICAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQobWV0YWRhdGEuY29tcG9zZWQucHJvcGVydGllc1twcm9wTmFtZV0pKSB7XG4gICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUlTU0lOR19SRVFVSVJFRF9NT0RFTF9QUk9QRVJUWScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnTW9kZWwgcmVxdWlyZXMgcHJvcGVydHkgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgcHJvcE5hbWUsIHByb3BOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0YWRhdGEucGF0aC5jb25jYXQoWydyZXF1aXJlZCcsIGluZGV4LnRvU3RyaW5nKCldKSwgcmVzdWx0cy5lcnJvcnMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBSZXNvbHZlIHJlZmVyZW5jZXNcbiAgICBfLmVhY2gobW9kZWxzTWV0YWRhdGEsIGZ1bmN0aW9uIChtZXRhZGF0YSkge1xuICAgICAgdmFyIHJlZnMgPSB0cmF2ZXJzZShtZXRhZGF0YS5jb21wb3NlZCkucmVkdWNlKGZ1bmN0aW9uIChhY2MpIHtcbiAgICAgICAgaWYgKHRoaXMua2V5ID09PSAnJHJlZicpIHtcbiAgICAgICAgICBhY2NbdG9Kc29uUG9pbnRlcih0aGlzLnBhdGgpXSA9IHNwZWMudmVyc2lvbiA9PT0gJzEuMicgPyB0aGlzLm5vZGUgOiByZWZUb0pzb25Qb2ludGVyKHRoaXMubm9kZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgfSwge30pO1xuXG4gICAgICBfLmVhY2gocmVmcywgZnVuY3Rpb24gKG1vZGVsSWQsIHBhdGhQdHIpIHtcbiAgICAgICAgdmFyIHBhdGggPSBwYXRoUHRyLnN1YnN0cmluZygyKS5zcGxpdCgnLycpO1xuICAgICAgICB2YXIgcmVmTW9kZWwgPSBfLmlzVW5kZWZpbmVkKG1vZGVsc01ldGFkYXRhW21vZGVsSWRdKSA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICBfLmNsb25lRGVlcChtb2RlbHNNZXRhZGF0YVttb2RlbElkXS5jb21wb3NlZCk7XG5cbiAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlZk1vZGVsKSkge1xuICAgICAgICAgIGRlbGV0ZSByZWZNb2RlbC5pZDtcbiAgICAgICAgICBkZWxldGUgcmVmTW9kZWwudGl0bGU7XG5cbiAgICAgICAgICB0cmF2ZXJzZShtZXRhZGF0YS5jb21wb3NlZCkuc2V0KHBhdGguc2xpY2UoMCwgcGF0aC5sZW5ndGggLSAxKSwgcmVmTW9kZWwpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIE1lcmdlIHJlc3VsdHNcbiAgICBpZiAoIV8uaXNVbmRlZmluZWQocmVzdWx0cykpIHtcbiAgICAgIF8uZWFjaChsb2NhbFJlc3VsdHMsIGZ1bmN0aW9uIChlbnRyaWVzLCBkZXN0TmFtZSkge1xuICAgICAgICByZXN1bHRzW2Rlc3ROYW1lXSA9IHJlc3VsdHNbZGVzdE5hbWVdLmNvbmNhdChlbnRyaWVzKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtZXRhZGF0YUVudHJ5O1xufTtcblxudmFyIHZhbGlkYXRlV2l0aFNjaGVtYSA9IGZ1bmN0aW9uIHZhbGlkYXRlV2l0aFNjaGVtYSAoc3BlYywgc2NoZW1hTmFtZSwgZGF0YSkge1xuICB2YXIgdmFsaWRhdG9yID0gc3BlYy52YWxpZGF0b3JzW3NjaGVtYU5hbWVdO1xuICB2YXIgc2NoZW1hID0gdmFsaWRhdG9yLnNjaGVtYVtzY2hlbWFOYW1lXTtcbiAgdmFyIHJlc3VsdCA9IHZhbGlkYXRvci52YWxpZGF0ZShzY2hlbWEsIGRhdGEpO1xuICB2YXIgcmVzcG9uc2UgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcblxuICBpZiAocmVzdWx0KSB7XG4gICAgcmVzcG9uc2UgPSB7XG4gICAgICBlcnJvcnM6IHZhbGlkYXRvci5qZShzY2hlbWEsIGRhdGEsIHJlc3VsdCwgamp2ZU9wdGlvbnMpLFxuICAgICAgd2FybmluZ3M6IFtdXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbnZhciB2YWxpZGF0ZUNvbnRlbnQgPSBmdW5jdGlvbiB2YWxpZGF0ZUNvbnRlbnQgKHNwZWMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zKSB7XG4gIHZhciByZXNwb25zZSA9IHtcbiAgICBlcnJvcnM6IFtdLFxuICAgIHdhcm5pbmdzOiBbXVxuICB9O1xuICB2YXIgYXV0aERlZnMgPSB7fTsgLy8gKDEuMilcbiAgdmFyIGF1dGhSZWZzID0ge307IC8vICgxLjIpXG4gIHZhciBwYXRoRGVmcyA9IFtdOyAvLyAoMS4yKVxuICB2YXIgcGF0aFJlZnMgPSBbXTsgLy8gKDEuMilcblxuICBzd2l0Y2ggKHNwZWMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIEJ1aWxkIHBhdGggbW9kZWxcbiAgICBfLmVhY2gocmxPclNPLmFwaXMsIGZ1bmN0aW9uIChhcGksIGluZGV4KSB7XG4gICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aHNcbiAgICAgIHZhbGlkYXRlTm9FeGlzdChwYXRoRGVmcywgYXBpLnBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLCBbJ2FwaXMnLCBpbmRleC50b1N0cmluZygpLCAncGF0aCddLFxuICAgICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlLmVycm9ycyk7XG5cbiAgICAgIGlmIChwYXRoRGVmcy5pbmRleE9mKGFwaS5wYXRoKSA9PT0gLTEpIHtcbiAgICAgICAgcGF0aERlZnMucHVzaChhcGkucGF0aCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2UuZXJyb3JzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgLy8gQnVpbGQgdGhlIGF1dGhvcml6YXRpb24gbW9kZWxcbiAgICAgIF8uZWFjaChybE9yU08uYXV0aG9yaXphdGlvbnMsIGZ1bmN0aW9uIChhdXRob3JpemF0aW9uLCBuYW1lKSB7XG4gICAgICAgIGF1dGhEZWZzW25hbWVdID0gXy5tYXAoYXV0aG9yaXphdGlvbi5zY29wZXMsIGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICAgIHJldHVybiBzY29wZS5zY29wZTtcbiAgICAgICAgfSk7XG4gICAgICB9LCB7fSk7XG5cbiAgICAgIHJlc3BvbnNlLmFwaURlY2xhcmF0aW9ucyA9IFtdO1xuXG4gICAgICAvLyBWYWxpZGF0ZSB0aGUgQVBJIGRlY2xhcmF0aW9uc1xuICAgICAgXy5lYWNoKGFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGFwaURlY2xhcmF0aW9uLCBpbmRleCkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gcmVzcG9uc2UuYXBpRGVjbGFyYXRpb25zW2luZGV4XSA9IHtcbiAgICAgICAgICBlcnJvcnM6IFtdLFxuICAgICAgICAgIHdhcm5pbmdzOiBbXVxuICAgICAgICB9O1xuICAgICAgICB2YXIgYXBpQXV0aERlZnMgPSB7fTtcbiAgICAgICAgdmFyIGFwaUF1dGhSZWZzID0ge307XG4gICAgICAgIHZhciBtb2RlbHNNZXRhZGF0YSA9IGdldE1vZGVsc01ldGFkYXRhKHNwZWMsIGFwaURlY2xhcmF0aW9uLCByZXN1bHQpLm1ldGFkYXRhO1xuICAgICAgICB2YXIgYWRkTW9kZWxSZWYgPSBmdW5jdGlvbiBhZGRNb2RlbFJlZiAobW9kZWxJZCwgbW9kZWxSZWYpIHtcbiAgICAgICAgICB2YXIgbWV0YWRhdGEgPSBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCBtb2RlbElkKTtcblxuICAgICAgICAgIG1ldGFkYXRhLnJlZnMucHVzaChtb2RlbFJlZik7XG4gICAgICAgIH07XG4gICAgICAgIHZhciBhZGRTY29wZVJlZiA9IGZ1bmN0aW9uIGFkZFNjb3BlUmVmIChhdXRoSWQsIHNjb3BlSWQpIHtcbiAgICAgICAgICB2YXIgYXV0aDtcblxuICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChhcGlBdXRoRGVmc1thdXRoSWRdKSkge1xuICAgICAgICAgICAgLy8gTG9jYWwgYXV0aCBkZWZpbml0aW9uXG4gICAgICAgICAgICBhdXRoID0gYXBpQXV0aFJlZnNbYXV0aElkXTtcblxuICAgICAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQoYXV0aCkpIHtcbiAgICAgICAgICAgICAgYXV0aCA9IGFwaUF1dGhSZWZzW2F1dGhJZF0gPSBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gR2xvYmFsIChPciBtaXNzaW5nIGluIHdoaWNoIGNhc2Ugd2UnbGwgYXNzdW1lIGdsb2JhbClcbiAgICAgICAgICAgIGF1dGggPSBhdXRoUmVmc1thdXRoSWRdO1xuXG4gICAgICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChhdXRoKSkge1xuICAgICAgICAgICAgICBhdXRoID0gYXV0aFJlZnNbYXV0aElkXSA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChhdXRoLmluZGV4T2Yoc2NvcGVJZCkgPT09IC0xKSB7XG4gICAgICAgICAgICBhdXRoLnB1c2goc2NvcGVJZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIEJ1aWxkIHRoZSBhdXRob3JpemF0aW9uIG1vZGVsXG4gICAgICAgIF8uZWFjaChhcGlEZWNsYXJhdGlvbi5hdXRob3JpemF0aW9ucywgZnVuY3Rpb24gKGF1dGhvcml6YXRpb24sIG5hbWUpIHtcbiAgICAgICAgICBhcGlBdXRoRGVmc1tuYW1lXSA9IF8ubWFwKGF1dGhvcml6YXRpb24uc2NvcGVzLCBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgICAgIHJldHVybiBzY29wZS5zY29wZTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSwge30pO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXG4gICAgICAgIHZhbGlkYXRlTm9FeGlzdChwYXRoUmVmcywgYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJywgWydyZXNvdXJjZVBhdGgnXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5lcnJvcnMpO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgcmVzb3VyY2UgcGF0aCBkZWZpbml0aW9uXG4gICAgICAgIHZhbGlkYXRlRXhpc3QocGF0aERlZnMsIGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsIFsncmVzb3VyY2VQYXRoJ10sXG4gICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgLy8gS2VlcCB0cmFjayBvZiB0aGUgc2VlbiBwYXRoc1xuICAgICAgICBpZiAocGF0aFJlZnMuaW5kZXhPZihhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgpID09PSAtMSkge1xuICAgICAgICAgIHBhdGhSZWZzLnB1c2goYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFZhbGlkYXRlIGNvbnN1bWVzL3Byb2R1Y2VzIHVuaXF1ZW5lc3NcbiAgICAgICAgXy5lYWNoKFsnY29uc3VtZXMnLCAncHJvZHVjZXMnXSwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICB2YWxpZGF0ZU5vRHVwbGljYXRlcyhhcGlEZWNsYXJhdGlvbltuYW1lXSwgJ0FQSV8nICsgbmFtZS50b1VwcGVyQ2FzZSgpLCAnQVBJJywgW25hbWVdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC53YXJuaW5ncyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFZhbGRhdGUgQVBJc1xuICAgICAgICBfLnJlZHVjZShhcGlEZWNsYXJhdGlvbi5hcGlzLCBmdW5jdGlvbiAoc2VlbkFwaVBhdGhzLCBhcGksIGluZGV4KSB7XG4gICAgICAgICAgdmFyIGFQYXRoID0gWydhcGlzJywgaW5kZXgudG9TdHJpbmcoKV07XG4gICAgICAgICAgdmFyIHBLZXlzID0gW107XG4gICAgICAgICAgdmFyIHBQYXJhbXMgPSBbXTtcbiAgICAgICAgICB2YXIgcFJlZ2V4ID0gcGF0aFRvUmVnZXhwKGV4cHJlc3NTdHlsZVBhdGgoJycsIGFwaS5wYXRoKSwgcEtleXMpLnRvU3RyaW5nKCk7XG4gICAgICAgICAgdmFyIHJQYXJhbXMgPSBfLm1hcChwS2V5cywgZnVuY3Rpb24gKGtleSkgeyByZXR1cm4ga2V5Lm5hbWU7IH0pO1xuXG4gICAgICAgICAgLy8gVmFsaWRhdGUgZHVwbGljYXRlIHJlc291cmNlIHBhdGhcbiAgICAgICAgICBpZiAoc2VlbkFwaVBhdGhzLmluZGV4T2YocFJlZ2V4KSA+IC0xKSB7XG4gICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFX0FQSV9QQVRIJywgJ0FQSSBwYXRoIChvciBlcXVpdmFsZW50KSBhbHJlYWR5IGRlZmluZWQ6ICcgKyBhcGkucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFwaS5wYXRoLCBhUGF0aC5jb25jYXQoJ3BhdGgnKSwgcmVzdWx0LmVycm9ycyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gVmFsaWRhdGUgb3BlcmF0aW9uc1xuICAgICAgICAgIF8ucmVkdWNlKGFwaS5vcGVyYXRpb25zLCBmdW5jdGlvbiAoc2Vlbk1ldGhvZHMsIG9wZXJhdGlvbiwgaW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBvUGF0aCA9IGFQYXRoLmNvbmNhdChbJ29wZXJhdGlvbnMnLCBpbmRleC50b1N0cmluZygpXSk7XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIGNvbnN1bWVzL3Byb2R1Y2VzIHVuaXF1ZW5lc3NcbiAgICAgICAgICAgIF8uZWFjaChbJ2NvbnN1bWVzJywgJ3Byb2R1Y2VzJ10sIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgICAgICAgIHZhbGlkYXRlTm9EdXBsaWNhdGVzKG9wZXJhdGlvbltuYW1lXSwgJ09QRVJBVElPTl8nICsgbmFtZS50b1VwcGVyQ2FzZSgpLCAnT3BlcmF0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb1BhdGguY29uY2F0KG5hbWUpLCByZXN1bHQud2FybmluZ3MpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIHVuaXF1ZSBtZXRob2RcbiAgICAgICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuTWV0aG9kcywgb3BlcmF0aW9uLm1ldGhvZCwgJ09QRVJBVElPTl9NRVRIT0QnLCAnT3BlcmF0aW9uIG1ldGhvZCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb1BhdGguY29uY2F0KCdtZXRob2QnKSwgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIGF1dGhvcml6YXRpb25zXG4gICAgICAgICAgICBfLmVhY2gob3BlcmF0aW9uLmF1dGhvcml6YXRpb25zLCBmdW5jdGlvbiAoc2NvcGVzLCBuYW1lKSB7XG4gICAgICAgICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgYXV0aG9yaXphdGlvblxuICAgICAgICAgICAgICB2YWxpZGF0ZUV4aXN0KF8udW5pcShPYmplY3Qua2V5cyhhcGlBdXRoRGVmcykuY29uY2F0KE9iamVjdC5rZXlzKGF1dGhEZWZzKSkpLCBuYW1lLCAnQVVUSE9SSVpBVElPTicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24nLCBvUGF0aC5jb25jYXQoWydhdXRob3JpemF0aW9ucycsIG5hbWVdKSwgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgbWlzc2luZyBhdXRob3JpemF0aW9uIHNjb3BlcyAoT25seSB3aGVuIHRoZSBhdXRob3JpemF0aW9uIGlzIG5vdCBtaXNzaW5nKVxuICAgICAgICAgICAgICBfLmVhY2goc2NvcGVzLCBmdW5jdGlvbiAoc2NvcGUsIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKGFwaUF1dGhEZWZzW25hbWVdKSB8fCAhXy5pc1VuZGVmaW5lZChhdXRoRGVmc1tuYW1lXSkpIHtcbiAgICAgICAgICAgICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgYXV0aG9yaXphdGlvbiBzY29wZVxuICAgICAgICAgICAgICAgICAgdmFsaWRhdGVFeGlzdChfLnVuaXEoKGFwaUF1dGhEZWZzW25hbWVdIHx8IFtdKS5jb25jYXQoYXV0aERlZnNbbmFtZV0gfHwgW10pKSwgc2NvcGUuc2NvcGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBVVRIT1JJWkFUSU9OX1NDT1BFJywgJ0F1dGhvcml6YXRpb24gc2NvcGUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQoWydhdXRob3JpemF0aW9ucycsIG5hbWUsIGluZGV4LnRvU3RyaW5nKCksICdzY29wZSddKSwgcmVzdWx0LmVycm9ycyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgYWRkU2NvcGVSZWYobmFtZSwgc2NvcGUuc2NvcGUpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSBwYXJhbWV0ZXJzXG4gICAgICAgICAgICBfLnJlZHVjZShvcGVyYXRpb24ucGFyYW1ldGVycywgZnVuY3Rpb24gKHNlZW5QYXJhbWV0ZXJzLCBwYXJhbWV0ZXIsIGluZGV4KSB7XG4gICAgICAgICAgICAgIC8vIEFkZCBtb2RlbCByZWZlcmVuY2VzIGZyb20gcGFyYW1ldGVyIHR5cGUvaXRlbXNcbiAgICAgICAgICAgICAgaWYgKHNwZWMucHJpbWl0aXZlcy5pbmRleE9mKHBhcmFtZXRlci50eXBlKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBhZGRNb2RlbFJlZihwYXJhbWV0ZXIudHlwZSwgb1BhdGguY29uY2F0KFsncGFyYW1ldGVycycsIGluZGV4LnRvU3RyaW5nKCksICd0eXBlJ10pKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChwYXJhbWV0ZXIudHlwZSA9PT0gJ2FycmF5JyAmJiBwYXJhbWV0ZXIuaXRlbXMuJHJlZikge1xuICAgICAgICAgICAgICAgIGFkZE1vZGVsUmVmKHBhcmFtZXRlci5pdGVtcy4kcmVmLCBvUGF0aC5jb25jYXQoWydwYXJhbWV0ZXJzJywgaW5kZXgudG9TdHJpbmcoKSwgJ2l0ZW1zJywgJyRyZWYnXSkpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgZHVwbGljYXRlIHBhcmFtZXRlciBuYW1lXG4gICAgICAgICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLm5hbWUsICdPUEVSQVRJT05fUEFSQU1FVEVSJywgJ09wZXJhdGlvbiBwYXJhbWV0ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb1BhdGguY29uY2F0KCdwYXJhbWV0ZXJzJywgaW5kZXgudG9TdHJpbmcoKSwgJ25hbWUnKSwgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgICAgICAgLy8gS2VlcCB0cmFjayBvZiBwYXRoIHBhcmFtZXRlcnNcbiAgICAgICAgICAgICAgaWYgKHBhcmFtZXRlci5wYXJhbVR5cGUgPT09ICdwYXRoJykge1xuICAgICAgICAgICAgICAgIGlmIChyUGFyYW1zLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV9BUElfUEFUSF9QQVJBTUVURVInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0FQSSBwYXRoIHBhcmFtZXRlciBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBwYXJhbWV0ZXIubmFtZSwgcGFyYW1ldGVyLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQoJ3BhcmFtZXRlcnMnLCBpbmRleC50b1N0cmluZygpLCAnbmFtZScpLCByZXN1bHQuZXJyb3JzKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAocFBhcmFtcy5pbmRleE9mKHBhcmFtZXRlci5uYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgIHBQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHBhcmFtZXRlci5kZWZhdWx0VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgZGVmYXVsdCB2YWx1ZSBhZ2FpbnN0IGNvbnN0cmFpbnRzXG4gICAgICAgICAgICAgICAgdmFsaWRhdGVQYXJhbWV0ZXJDb25zdHJhaW50cyhzcGVjLCBwYXJhbWV0ZXIsIHBhcmFtZXRlci5kZWZhdWx0VmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQoJ3BhcmFtZXRlcnMnLCBpbmRleC50b1N0cmluZygpLCAnZGVmYXVsdFZhbHVlJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQuZXJyb3JzKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHJldHVybiBzZWVuUGFyYW1ldGVycy5jb25jYXQocGFyYW1ldGVyLm5hbWUpO1xuICAgICAgICAgICAgfSwgW10pO1xuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSBtaXNzaW5nIHBhdGggcGFyYW1ldGVycyAoaW4gcGF0aCBidXQgbm90IGluIG9wZXJhdGlvbi5wYXJhbWV0ZXJzKVxuICAgICAgICAgICAgXy5lYWNoKF8uZGlmZmVyZW5jZShyUGFyYW1zLCBwUGFyYW1zKSwgZnVuY3Rpb24gKHVudXNlZCkge1xuICAgICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUlTU0lOR19BUElfUEFUSF9QQVJBTUVURVInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQVBJIHJlcXVpcmVzIHBhdGggcGFyYW1ldGVyIGJ1dCBpdCBpcyBub3QgZGVmaW5lZDogJyArIHVudXNlZCwgYXBpLnBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFQYXRoLmNvbmNhdCgncGF0aCcpLCByZXN1bHQuZXJyb3JzKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSB1bmlxdWUgcmVzcG9uc2UgY29kZVxuICAgICAgICAgICAgXy5yZWR1Y2Uob3BlcmF0aW9uLnJlc3BvbnNlTWVzc2FnZXMsIGZ1bmN0aW9uIChzZWVuUmVzcG9uc2VDb2RlcywgcmVzcG9uc2VNZXNzYWdlLCBpbmRleCkge1xuICAgICAgICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblJlc3BvbnNlQ29kZXMsIHJlc3BvbnNlTWVzc2FnZS5jb2RlLCAnUkVTUE9OU0VfTUVTU0FHRV9DT0RFJywgJ1Jlc3BvbnNlIG1lc3NhZ2UgY29kZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQoWydyZXNwb25zZU1lc3NhZ2VzJywgaW5kZXgudG9TdHJpbmcoKSwgJ2NvZGUnXSksIHJlc3VsdC5lcnJvcnMpO1xuXG4gICAgICAgICAgICAgIC8vIEFkZCBtb2RlbCByZWZlcmVuY2VzIGZyb20gcmVzcG9uc2VNZXNzYWdlcyByZXNwb25zZU1vZGVsXG4gICAgICAgICAgICAgIGlmIChyZXNwb25zZU1lc3NhZ2UucmVzcG9uc2VNb2RlbCkge1xuICAgICAgICAgICAgICAgIGFkZE1vZGVsUmVmKHJlc3BvbnNlTWVzc2FnZS5yZXNwb25zZU1vZGVsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9QYXRoLmNvbmNhdChbJ3Jlc3BvbnNlTWVzc2FnZXMnLCBpbmRleC50b1N0cmluZygpLCAncmVzcG9uc2VNb2RlbCddKSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gc2VlblJlc3BvbnNlQ29kZXMuY29uY2F0KHJlc3BvbnNlTWVzc2FnZS5jb2RlKTtcbiAgICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgICAgLy8gQWRkIG1vZGVsIHJlZmVyZW5jZXMgZnJvbSB0eXBlL2l0ZW1zXG4gICAgICAgICAgICBpZiAob3BlcmF0aW9uLnR5cGUgPT09ICdhcnJheScgJiYgb3BlcmF0aW9uLml0ZW1zLiRyZWYpIHtcbiAgICAgICAgICAgICAgYWRkTW9kZWxSZWYob3BlcmF0aW9uLml0ZW1zLiRyZWYsIG9QYXRoLmNvbmNhdChbJ2l0ZW1zJywgJyRyZWYnXSkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzcGVjLnByaW1pdGl2ZXMuaW5kZXhPZihvcGVyYXRpb24udHlwZSkgPT09IC0xKSB7XG4gICAgICAgICAgICAgIGFkZE1vZGVsUmVmKG9wZXJhdGlvbi50eXBlLCBvUGF0aC5jb25jYXQoWyd0eXBlJ10pKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHNlZW5NZXRob2RzLmNvbmNhdChvcGVyYXRpb24ubWV0aG9kKTtcbiAgICAgICAgICB9LCBbXSk7XG5cbiAgICAgICAgICByZXR1cm4gc2VlbkFwaVBhdGhzLmNvbmNhdChwUmVnZXgpO1xuICAgICAgICB9LCBbXSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgbW9kZWxzXG4gICAgICAgIF8uZWFjaChtb2RlbHNNZXRhZGF0YSwgZnVuY3Rpb24gKG1ldGFkYXRhLCBtb2RlbElkKSB7XG4gICAgICAgICAgLy8gSWRlbnRpZnkgbWlzc2luZyBtb2RlbHMgKHJlZmVyZW5jZWQgYnV0IG5vdCBkZWNsYXJlZClcbiAgICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChtZXRhZGF0YS5zY2hlbWEpKSB7XG4gICAgICAgICAgICBfLmVhY2gobWV0YWRhdGEucmVmcywgZnVuY3Rpb24gKHJlZikge1xuICAgICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFX01PREVMJywgJ01vZGVsIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIG1vZGVsSWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsSWQsIHJlZiwgcmVzdWx0LmVycm9ycyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBJZGVudGlmeSB1bnVzZWQgbW9kZWxzIChkZWNsYXJlZCBidXQgbm90IHJlZmVyZW5jZWQpXG4gICAgICAgICAgaWYgKG1ldGFkYXRhLnJlZnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhtZXRhZGF0YS5zY2hlbWEsIG1vZGVsSWQsICdNT0RFTCcsICdNb2RlbCcsIFsnbW9kZWxzJywgbWV0YWRhdGEubmFtZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQud2FybmluZ3MpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdW51c2VkIGF1dGhvcml6YXRpb25zXG4gICAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoT2JqZWN0LmtleXMoYXBpQXV0aERlZnMpLCBPYmplY3Qua2V5cyhhcGlBdXRoUmVmcykpLCBmdW5jdGlvbiAodW51c2VkKSB7XG4gICAgICAgICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcoYXBpRGVjbGFyYXRpb24uYXV0aG9yaXphdGlvbnNbdW51c2VkXSwgdW51c2VkLCAnQVVUSE9SSVpBVElPTicsICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ2F1dGhvcml6YXRpb25zJywgdW51c2VkXSwgcmVzdWx0Lndhcm5pbmdzKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdW51c2VkIGF1dGhvcml6YXRpb24gc2NvcGVzXG4gICAgICAgIF8uZWFjaChhcGlBdXRoRGVmcywgZnVuY3Rpb24gKHNjb3BlcywgbmFtZSkge1xuICAgICAgICAgIHZhciBwYXRoID0gWydhdXRob3JpemF0aW9ucycsIG5hbWVdO1xuICAgICAgICAgIHZhciBhdXRoRGVmID0gYXBpRGVjbGFyYXRpb24uYXV0aG9yaXphdGlvbnNbbmFtZV07XG5cbiAgICAgICAgICBfLmVhY2goXy5kaWZmZXJlbmNlKHNjb3BlcywgYXBpQXV0aFJlZnNbbmFtZV0gfHwgW10pLCBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBzSW5kZXggPSBzY29wZXMuaW5kZXhPZihzY29wZSk7XG5cbiAgICAgICAgICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKGF1dGhEZWYuc2NvcGVzW3NJbmRleF0sIHNjb3BlLCAnQVVUSE9SSVpBVElPTl9TQ09QRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbiBzY29wZScsIHBhdGguY29uY2F0KFsnc2NvcGVzJywgc0luZGV4LnRvU3RyaW5nKCldKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC53YXJuaW5ncyk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHVudXNlZCByZXNvdXJjZXNcbiAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UocGF0aERlZnMsIHBhdGhSZWZzKSwgZnVuY3Rpb24gKHVudXNlZCkge1xuICAgICAgICB2YXIgaW5kZXggPSBfLm1hcChybE9yU08uYXBpcywgZnVuY3Rpb24gKGFwaSkgeyByZXR1cm4gYXBpLnBhdGg7IH0pLmluZGV4T2YodW51c2VkKTtcblxuICAgICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhybE9yU08uYXBpc1tpbmRleF0ucGF0aCwgdW51c2VkLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydhcGlzJywgaW5kZXgudG9TdHJpbmcoKSwgJ3BhdGgnXSwgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWYWxpZGF0ZSB1bnVzZWQgYXV0aG9yaXphdGlvbnNcbiAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoT2JqZWN0LmtleXMoYXV0aERlZnMpLCBPYmplY3Qua2V5cyhhdXRoUmVmcykpLCBmdW5jdGlvbiAodW51c2VkKSB7XG4gICAgICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKHJsT3JTTy5hdXRob3JpemF0aW9uc1t1bnVzZWRdLCB1bnVzZWQsICdBVVRIT1JJWkFUSU9OJywgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ2F1dGhvcml6YXRpb25zJywgdW51c2VkXSwgcmVzcG9uc2Uud2FybmluZ3MpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHVudXNlZCBhdXRob3JpemF0aW9uIHNjb3Blc1xuICAgICAgXy5lYWNoKGF1dGhSZWZzLCBmdW5jdGlvbiAoc2NvcGVzLCBuYW1lKSB7XG4gICAgICAgIHZhciBwYXRoID0gWydhdXRob3JpemF0aW9ucycsIG5hbWVdO1xuXG4gICAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2Uoc2NvcGVzLCBhdXRoUmVmc1tuYW1lXSksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgICAgICB2YXIgaW5kZXggPSBzY29wZXMuaW5kZXhPZih1bnVzZWQpO1xuXG4gICAgICAgICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcocmxPclNPLmF1dGhvcml6YXRpb25zW25hbWVdLnNjb3Blc1tpbmRleF0sIHVudXNlZCwgJ0FVVEhPUklaQVRJT05fU0NPUEUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uIHNjb3BlJywgcGF0aC5jb25jYXQoWydzY29wZXMnLCBpbmRleC50b1N0cmluZygpXSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2Uud2FybmluZ3MpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgKGZvciBub3cpIHVuaXF1ZSBjb25zdW1lcy9wcm9kdWNlcy9zY2hlbWVzXG4gICAgXy5lYWNoKFsnY29uc3VtZXMnLCAncHJvZHVjZXMnLCAnc2NoZW1lcyddLCBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFsaWRhdGVOb0R1cGxpY2F0ZXMocmxPclNPW25hbWVdLCAnQVBJXycgKyBuYW1lLnRvVXBwZXJDYXNlKCksICdBUEknLCBbbmFtZV0sIHJlc3BvbnNlLndhcm5pbmdzKTtcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5lcnJvcnMubGVuZ3RoID09PSAwICYmIHJlc3BvbnNlLndhcm5pbmdzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdmFyIG1vZGVsc01ldGFkYXRhID0gZ2V0TW9kZWxzTWV0YWRhdGEoc3BlYywgcmxPclNPLCByZXNwb25zZSkubWV0YWRhdGE7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHRoZSBQYXRoc1xuICAgICAgXy5yZWR1Y2UocmxPclNPLnBhdGhzLCBmdW5jdGlvbiAoc2VlblBhdGhzLCBwYXRoLCBuYW1lKSB7XG4gICAgICAgIHZhciBhUGF0aCA9IFsncGF0aHMnLCBuYW1lXTtcbiAgICAgICAgdmFyIHBLZXlzID0gW107XG4gICAgICAgIHZhciBwUGFyYW1zID0gW107XG4gICAgICAgIHZhciBwUmVnZXggPSBwYXRoVG9SZWdleHAoZXhwcmVzc1N0eWxlUGF0aCgnJywgbmFtZSksIHBLZXlzKS50b1N0cmluZygpO1xuICAgICAgICB2YXIgclBhcmFtcyA9IF8ubWFwKHBLZXlzLCBmdW5jdGlvbiAoa2V5KSB7IHJldHVybiBrZXkubmFtZTsgfSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgZHVwbGljYXRlIHJlc291cmNlIHBhdGhcbiAgICAgICAgaWYgKHNlZW5QYXRocy5pbmRleE9mKHBSZWdleCkgPiAtMSkge1xuICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdEVVBMSUNBVEVfQVBJX1BBVEgnLCAnQVBJIHBhdGggKG9yIGVxdWl2YWxlbnQpIGFscmVhZHkgZGVmaW5lZDogJyArIG5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSwgYVBhdGgsIHJlc3BvbnNlLmVycm9ycyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBWYWxpZGF0ZSB0aGUgT3BlcmF0aW9uc1xuICAgICAgICBfLmVhY2gocGF0aCwgZnVuY3Rpb24gKG9wZXJhdGlvbiwgbWV0aG9kKSB7XG4gICAgICAgICAgdmFyIG9QYXRoID0gYVBhdGguY29uY2F0KG1ldGhvZCk7XG5cbiAgICAgICAgICBpZiAobWV0aG9kID09PSAncGFyYW1ldGVycycpIHtcbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlciBjb25zdHJhaW50c1xuICAgICAgICAgICAgXy5yZWR1Y2UocGF0aC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlciwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgdmFyIHBQYXRoID0gb1BhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCkpO1xuXG4gICAgICAgICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSBwYXJhbWV0ZXIgbmFtZVxuICAgICAgICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlci5uYW1lLCAnQVBJX1BBUkFNRVRFUicsICdBUEkgcGFyYW1ldGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnbmFtZScpLCByZXNwb25zZS5lcnJvcnMpO1xuXG4gICAgICAgICAgICAgIC8vIEtlZXAgdHJhY2sgb2YgcGF0aCBwYXJhbWV0ZXJzXG4gICAgICAgICAgICAgIGlmIChwYXJhbWV0ZXIuaW4gPT09ICdwYXRoJykge1xuICAgICAgICAgICAgICAgIGlmIChyUGFyYW1zLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV9BUElfUEFUSF9QQVJBTUVURVInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0FQSSBwYXRoIHBhcmFtZXRlciBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBwYXJhbWV0ZXIubmFtZSwgcGFyYW1ldGVyLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ25hbWUnKSwgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAocFBhcmFtcy5pbmRleE9mKHBhcmFtZXRlci5uYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgIHBQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgLy8gRmluZCBtb2RlbHMgZGVmaW5lZC9yZWZlcmVuY2VkIGluICMvcGF0aHMve3BhdGh9L3BhcmFtZXRlcnNcbiAgICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHBhcmFtZXRlci5zY2hlbWEpKSB7XG4gICAgICAgICAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBwYXJhbWV0ZXIuc2NoZW1hLCB0b0pzb25Qb2ludGVyKHBQYXRoLmNvbmNhdCgnc2NoZW1hJykpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ3NjaGVtYScpLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gc2VlblBhcmFtZXRlcnMuY29uY2F0KHBhcmFtZXRlci5uYW1lKTtcbiAgICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFZhbGlkYXRlIChmb3Igbm93KSBjb25zdW1lcy9wcm9kdWNlcy9zY2hlbWVzIHVuaXF1ZW5lc3NcbiAgICAgICAgICBfLmVhY2goWydjb25zdW1lcycsICdwcm9kdWNlcycsICdzY2hlbWVzJ10sIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgICAgICB2YWxpZGF0ZU5vRHVwbGljYXRlcyhvcGVyYXRpb25bbmFtZV0sICdPUEVSQVRJT05fJyArIG5hbWUudG9VcHBlckNhc2UoKSwgJ09wZXJhdGlvbicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQobmFtZSksIHJlc3BvbnNlLndhcm5pbmdzKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlciBjb25zdHJhaW50c1xuICAgICAgICAgIF8ucmVkdWNlKG9wZXJhdGlvbi5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlciwgaW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBwUGF0aCA9IG9QYXRoLmNvbmNhdCgncGFyYW1ldGVycycsIGluZGV4LnRvU3RyaW5nKCkpO1xuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcGFyYW1ldGVyIG5hbWVcbiAgICAgICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLm5hbWUsICdPUEVSQVRJT05fUEFSQU1FVEVSJywgJ09wZXJhdGlvbiBwYXJhbWV0ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnbmFtZScpLCByZXNwb25zZS5lcnJvcnMpO1xuXG4gICAgICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIHBhdGggcGFyYW1ldGVyc1xuICAgICAgICAgICAgaWYgKHBhcmFtZXRlci5pbiA9PT0gJ3BhdGgnKSB7XG4gICAgICAgICAgICAgIGlmIChyUGFyYW1zLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlJFU09MVkFCTEVfQVBJX1BBVEhfUEFSQU1FVEVSJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQVBJIHBhdGggcGFyYW1ldGVyIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHBhcmFtZXRlci5uYW1lLCBwYXJhbWV0ZXIubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ25hbWUnKSwgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmIChwUGFyYW1zLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHBQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmluZCBtb2RlbHMgZGVmaW5lZC9yZWZlcmVuY2VkIGluICMvcGF0aHMve3BhdGh9L3ttZXRob2R9L3BhcmFtZXRlcnNcbiAgICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIuc2NoZW1hKSkge1xuICAgICAgICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIHBhcmFtZXRlci5zY2hlbWEsIHRvSnNvblBvaW50ZXIocFBhdGguY29uY2F0KCdzY2hlbWEnKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ3NjaGVtYScpLCByZXNwb25zZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBzZWVuUGFyYW1ldGVycy5jb25jYXQocGFyYW1ldGVyLm5hbWUpO1xuICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgIC8vIEZpbmQgbW9kZWxzIGRlZmluZWQvcmVmZXJlbmNlZCBpbiAjL3BhdGhzL3twYXRofS97bWV0aG9kfS9yZXNwb25zZXNcbiAgICAgICAgICBfLmVhY2gob3BlcmF0aW9uLnJlc3BvbnNlcywgZnVuY3Rpb24gKHJlc3BvbnNlLCByZXNwb25zZUNvZGUpIHtcbiAgICAgICAgICAgIHZhciByUGF0aCA9IG9QYXRoLmNvbmNhdCgncmVzcG9uc2VzJywgcmVzcG9uc2VDb2RlKTtcblxuICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlc3BvbnNlLnNjaGVtYSkpIHtcbiAgICAgICAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCByZXNwb25zZS5zY2hlbWEsIHRvSnNvblBvaW50ZXIoclBhdGguY29uY2F0KCdzY2hlbWEnKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByUGF0aC5jb25jYXQoJ3NjaGVtYScpLCByZXNwb25zZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgcGF0aCBwYXJhbWV0ZXJzIChpbiBwYXRoIGJ1dCBub3QgaW4gb3BlcmF0aW9uLnBhcmFtZXRlcnMpXG4gICAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoclBhcmFtcywgcFBhcmFtcyksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUlTU0lOR19BUElfUEFUSF9QQVJBTUVURVInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgcmVxdWlyZXMgcGF0aCBwYXJhbWV0ZXIgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgdW51c2VkLCBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFQYXRoLCByZXNwb25zZS5lcnJvcnMpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gc2VlblBhdGhzLmNvbmNhdChwUmVnZXgpO1xuICAgICAgfSwgW10pO1xuXG4gICAgICAvLyBWYWxpZGF0ZSBtb2RlbHNcbiAgICAgIF8uZWFjaChtb2RlbHNNZXRhZGF0YSwgZnVuY3Rpb24gKG1ldGFkYXRhLCBtb2RlbElkKSB7XG4gICAgICAgIC8vIElkZW50aWZ5IG1pc3NpbmcgbW9kZWxzIChyZWZlcmVuY2VkIGJ1dCBub3QgZGVjbGFyZWQpXG4gICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKG1ldGFkYXRhLnNjaGVtYSkpIHtcbiAgICAgICAgICBfLmVhY2gobWV0YWRhdGEucmVmcywgZnVuY3Rpb24gKHJlZikge1xuICAgICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV9NT0RFTCcsICdNb2RlbCBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBtb2RlbElkLCBtb2RlbElkLCByZWYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNwb25zZS5lcnJvcnMpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWRlbnRpZnkgdW51c2VkIG1vZGVscyAoZGVjbGFyZWQgYnV0IG5vdCByZWZlcmVuY2VkKVxuICAgICAgICBpZiAobWV0YWRhdGEucmVmcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhtZXRhZGF0YS5zY2hlbWEsIG1vZGVsSWQsICdNT0RFTCcsICdNb2RlbCcsIG1vZGVsSWQuc3Vic3RyaW5nKDIpLnNwbGl0KCcvJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2Uud2FybmluZ3MpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBicmVhaztcbiAgfVxuXG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgcmVzdWx0IG9mIHRoZSB2YWxpZGF0aW9uIG9mIHRoZSBTd2FnZ2VyIGRvY3VtZW50KHMpLlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBybE9yU08gLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBMaXN0aW5nICgxLjIpIG9yIFN3YWdnZXIgT2JqZWN0ICgyLjApXG4gKiBAcGFyYW0ge29iamVjdFtdfSBbYXBpRGVjbGFyYXRpb25zXSAtIFRoZSBhcnJheSBvZiBTd2FnZ2VyIEFQSSBEZWNsYXJhdGlvbnMgKDEuMilcbiAqXG4gKiBAcmV0dXJucyB1bmRlZmluZWQgaWYgdmFsaWRhdGlvbiBwYXNzZXMgb3IgYW4gb2JqZWN0IGNvbnRhaW5pbmcgZXJyb3JzIGFuZC9vciB3YXJuaW5nc1xuICovXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS52YWxpZGF0ZSA9IGZ1bmN0aW9uIHZhbGlkYXRlIChybE9yU08sIGFwaURlY2xhcmF0aW9ucykge1xuICB2YXIgcmVzcG9uc2UgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcbiAgdmFyIHNraXBSZW1haW5pbmcgPSBmYWxzZTtcblxuICBzd2l0Y2ggKHRoaXMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigncmVzb3VyY2VMaXN0aW5nIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURlY2xhcmF0aW9ucykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYXBpRGVjbGFyYXRpb25zIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc0FycmF5KGFwaURlY2xhcmF0aW9ucykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgc3RydWN0dXJhbGx5XG4gICAgcmVzcG9uc2UgPSB2YWxpZGF0ZVdpdGhTY2hlbWEodGhpcywgJ3Jlc291cmNlTGlzdGluZy5qc29uJywgcmxPclNPKTtcblxuICAgIGlmIChyZXNwb25zZS5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgc2tpcFJlbWFpbmluZyA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKCFza2lwUmVtYWluaW5nKSB7XG4gICAgICByZXNwb25zZS5hcGlEZWNsYXJhdGlvbnMgPSBbXTtcblxuICAgICAgXy5lYWNoKGFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGFwaURlY2xhcmF0aW9uLCBpbmRleCkge1xuICAgICAgICByZXNwb25zZS5hcGlEZWNsYXJhdGlvbnNbaW5kZXhdID0gdmFsaWRhdGVXaXRoU2NoZW1hKHRoaXMsICdhcGlEZWNsYXJhdGlvbi5qc29uJywgYXBpRGVjbGFyYXRpb24pO1xuXG4gICAgICAgIGlmIChyZXNwb25zZS5hcGlEZWNsYXJhdGlvbnNbaW5kZXhdLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgc2tpcFJlbWFpbmluZyA9IHRydWU7XG5cbiAgICAgICAgICAvLyBTa2lwIHRoZSByZW1haW5pbmcgdmFsaWRhdGlvblxuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBzZW1hbnRpY2FsbHlcbiAgICBpZiAoIXNraXBSZW1haW5pbmcpIHtcbiAgICAgIHJlc3BvbnNlID0gdmFsaWRhdGVDb250ZW50KHRoaXMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zKTtcbiAgICB9XG5cbiAgICAvLyBTZXQgdGhlIHJlc3BvbnNlXG4gICAgcmVzcG9uc2UgPSByZXNwb25zZS5lcnJvcnMubGVuZ3RoID4gMCB8fCByZXNwb25zZS53YXJuaW5ncy5sZW5ndGggPiAwIHx8XG4gICAgICBfLnJlZHVjZShyZXNwb25zZS5hcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChjb3VudCwgYXBpRGVjbGFyYXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGNvdW50ICtcbiAgICAgICAgICAoXy5pc0FycmF5KGFwaURlY2xhcmF0aW9uLmVycm9ycykgPyBhcGlEZWNsYXJhdGlvbi5lcnJvcnMubGVuZ3RoIDogMCkgK1xuICAgICAgICAgIChfLmlzQXJyYXkoYXBpRGVjbGFyYXRpb24ud2FybmluZ3MpID8gYXBpRGVjbGFyYXRpb24ud2FybmluZ3MubGVuZ3RoIDogMCk7XG4gICAgICB9LCAwKSA+IDAgPyByZXNwb25zZSA6IHVuZGVmaW5lZDtcblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQocmxPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzd2FnZ2VyT2JqZWN0IGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N3YWdnZXJPYmplY3QgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBzdHJ1Y3R1cmFsbHlcbiAgICByZXNwb25zZSA9IHZhbGlkYXRlV2l0aFNjaGVtYSh0aGlzLCAnc2NoZW1hLmpzb24nLCBybE9yU08pO1xuXG4gICAgaWYgKHJlc3BvbnNlLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICBza2lwUmVtYWluaW5nID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBzZW1hbnRpY2FsbHlcbiAgICBpZiAoIXNraXBSZW1haW5pbmcpIHtcbiAgICAgIHJlc3BvbnNlID0gdmFsaWRhdGVDb250ZW50KHRoaXMsIHJsT3JTTyk7XG4gICAgfVxuXG4gICAgLy8gU2V0IHRoZSByZXNwb25zZVxuICAgIHJlc3BvbnNlID0gcmVzcG9uc2UuZXJyb3JzLmxlbmd0aCA+IDAgfHwgcmVzcG9uc2Uud2FybmluZ3MubGVuZ3RoID4gMCA/IHJlc3BvbnNlIDogdW5kZWZpbmVkO1xuXG4gICAgYnJlYWs7XG4gIH1cblxuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBKU09OIFNjaGVtYSByZXByZXNlbnRhdGlvbiBvZiBhIGNvbXBvc2VkIG1vZGVsIGJhc2VkIG9uIGl0cyBpZC5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gYXBpRE9yU08gLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBBUEkgRGVjbGFyYXRpb24gKDEuMikgb3IgdGhlIFN3YWdnZXIgT2JqZWN0ICgyLjApXG4gKiBAcGFyYW0ge3N0cmluZ30gbW9kZWxJZE9yUGF0aCAtIFRoZSBtb2RlbCBpZCAoMS4yIG9yIDIuMCkgb3IgdGhlIHBhdGggdG8gdGhlIG1vZGVsICgyLjApXG4gKlxuICogQHJldHVybnMgdGhlIG9iamVjdCByZXByZXNlbnRpbmcgYSBjb21wb3NlZCBvYmplY3RcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZXJlIGFyZSB2YWxpZGF0aW9uIGVycm9ycyB3aGlsZSBjcmVhdGluZ1xuICovXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS5jb21wb3NlTW9kZWwgPSBmdW5jdGlvbiBjb21wb3NlTW9kZWwgKGFwaURPclNPLCBtb2RlbElkT3JQYXRoKSB7XG4gIHZhciBtZXRhZGF0YUVudHJ5O1xuICB2YXIgbW9kZWxNZXRhZGF0YTtcbiAgdmFyIG1vZGVsc01ldGFkYXRhO1xuICB2YXIgZXJyO1xuXG4gIHN3aXRjaCAodGhpcy52ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9uIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignYXBpRGVjbGFyYXRpb24gbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbElkIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3dhZ2dlck9iamVjdCBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N3YWdnZXJPYmplY3QgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbElkT3JQYXRoIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG4gIH1cblxuICBtZXRhZGF0YUVudHJ5ID0gZ2V0TW9kZWxzTWV0YWRhdGEodGhpcywgYXBpRE9yU08pO1xuICBtb2RlbHNNZXRhZGF0YSA9IG1ldGFkYXRhRW50cnkubWV0YWRhdGE7XG5cbiAgLy8gQ29tcG9zaW5nIGEgbW9kZWwgZm9yIGFuIGludmFsaWQgbW9kZWwgaGllcmFyY2h5IGlzIGJyaXR0bGUgYW5kIHNvIHdlIHdpbGwgbm90IGRvIGl0XG4gIGlmIChtZXRhZGF0YUVudHJ5LnJlc3VsdHMuZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICBlcnIgPSBuZXcgRXJyb3IoJ1RoZSBtb2RlbHMgYXJlIGludmFsaWQgYW5kIG1vZGVsIGNvbXBvc2l0aW9uIGlzIG5vdCBwb3NzaWJsZScpO1xuXG4gICAgZXJyLmVycm9ycyA9IG1ldGFkYXRhRW50cnkucmVzdWx0cy5lcnJvcnM7XG4gICAgZXJyLndhcm5pbmdzID0gbWV0YWRhdGFFbnRyeS5yZXN1bHRzLndhcm5pbmdzO1xuXG4gICAgdGhyb3cgZXJyO1xuICB9XG5cbiAgbW9kZWxNZXRhZGF0YSA9IG1vZGVsc01ldGFkYXRhW3RoaXMudmVyc2lvbiA9PT0gJzEuMicgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbElkT3JQYXRoIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVmVG9Kc29uUG9pbnRlcihtb2RlbElkT3JQYXRoKV07XG5cbiAgcmV0dXJuIF8uaXNVbmRlZmluZWQobW9kZWxNZXRhZGF0YSkgPyB1bmRlZmluZWQgOiBtb2RlbE1ldGFkYXRhLmNvbXBvc2VkO1xufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgYSBtb2RlbCBiYXNlZCBvbiBpdHMgaWQuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IGFwaURPclNPIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgQVBJIERlY2xhcmF0aW9uICgxLjIpIG9yIHRoZSBTd2FnZ2VyIE9iamVjdCAoMi4wKVxuICogQHBhcmFtIHtzdHJpbmd9IG1vZGVsSWRPclBhdGggLSBUaGUgbW9kZWwgaWQgKDEuMiBvciAyLjApIG9yIHRoZSBwYXRoIHRvIHRoZSBtb2RlbCAoMi4wKVxuICogQHBhcmFtIHtvYmplY3R9IGRhdGEgLSBUaGUgbW9kZWwgdG8gdmFsaWRhdGVcbiAqXG4gKiBAcmV0dXJucyB1bmRlZmluZWQgaWYgdmFsaWRhdGlvbiBwYXNzZXMgb3IgYW4gb2JqZWN0IGNvbnRhaW5pbmcgZXJyb3JzIGFuZC9vciB3YXJuaW5nc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlcmUgYXJlIHZhbGlkYXRpb24gZXJyb3JzIHdoaWxlIGNyZWF0aW5nXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnZhbGlkYXRlTW9kZWwgPSBmdW5jdGlvbiB2YWxpZGF0ZU1vZGVsIChhcGlET3JTTywgbW9kZWxJZE9yUGF0aCwgZGF0YSkge1xuICB2YXIgbW9kZWxTY2hlbWEgPSB0aGlzLmNvbXBvc2VNb2RlbChhcGlET3JTTywgbW9kZWxJZE9yUGF0aCk7XG4gIHZhciByZXN1bHQ7XG4gIHZhciB2YWxpZGF0b3I7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxTY2hlbWEpKSB7XG4gICAgdGhyb3cgRXJyb3IoJ1VuYWJsZSB0byBjb21wb3NlIG1vZGVsIHNvIHZhbGlkYXRpb24gaXMgbm90IHBvc3NpYmxlJyk7XG4gIH1cblxuICB2YWxpZGF0b3IgPSBqanYoamp2T3B0aW9ucyk7XG5cbiAgLy8gRGlzYWJsZSB0aGUgJ3VyaScgZm9ybWF0IGNoZWNrZXIgYXMgaXQncyBnb3QgaXNzdWVzOiBodHRwczovL2dpdGh1Yi5jb20vYWNvcm5lam8vamp2L2lzc3Vlcy8yNFxuICB2YWxpZGF0b3IuYWRkRm9ybWF0KCd1cmknLCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgdmFsaWRhdG9yLmFkZFNjaGVtYShkcmFmdDA0VXJsLCBkcmFmdDA0SnNvbik7XG5cbiAgdmFsaWRhdG9yLmplID0gamp2ZSh2YWxpZGF0b3IpO1xuXG4gIHJlc3VsdCA9IHZhbGlkYXRvci52YWxpZGF0ZShtb2RlbFNjaGVtYSwgZGF0YSk7XG5cbiAgaWYgKHJlc3VsdCkge1xuICAgIHJlc3VsdCA9IHtcbiAgICAgIGVycm9yczogdmFsaWRhdG9yLmplKG1vZGVsU2NoZW1hLCBkYXRhLCByZXN1bHQsIGpqdmVPcHRpb25zKVxuICAgIH07XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0ID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbm1vZHVsZS5leHBvcnRzLnYxID0gbW9kdWxlLmV4cG9ydHMudjFfMiA9IG5ldyBTcGVjaWZpY2F0aW9uKCcxLjInKTsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG5tb2R1bGUuZXhwb3J0cy52MiA9IG1vZHVsZS5leHBvcnRzLnYyXzAgPSBuZXcgU3BlY2lmaWNhdGlvbignMi4wJyk7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuIiwiLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBBcGlnZWUgQ29ycG9yYXRpb25cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSB7XG4gIGlzVW5kZWZpbmVkOiByZXF1aXJlKCdsb2Rhc2guaXN1bmRlZmluZWQnKVxufTtcbnZhciBwYXJzZXVybCA9IHJlcXVpcmUoJ3BhcnNldXJsJyk7XG52YXIgc3BlY0NhY2hlID0ge307XG5cbi8qKlxuICogUmV0dXJucyBhbiBFeHByZXNzIHN0eWxlIHBhdGggZm9yIHRoZSBTd2FnZ2VyIHBhdGguXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IFtiYXNlUGF0aF0gLSBUaGUgU3dhZ2dlciBBUEkgYmFzZSBwYXRoXG4gKiBAcGFyYW0ge3N0cmluZ30gYXBpUGF0aCAtIFRoZSBTd2FnZ2VyIEFQSSBwYXRoXG4gKlxuICogQHJldHVybnMgdGhlIEV4cHJlc3MgZXF1aXZhbGVudCBwYXRoXG4gKi9cbm1vZHVsZS5leHBvcnRzLmV4cHJlc3NTdHlsZVBhdGggPSBmdW5jdGlvbiBleHByZXNzU3R5bGVQYXRoIChiYXNlUGF0aCwgYXBpUGF0aCkge1xuICBiYXNlUGF0aCA9IHBhcnNldXJsKHt1cmw6IGJhc2VQYXRoIHx8ICcvJ30pLnBhdGhuYW1lIHx8ICcvJztcblxuICAvLyBNYWtlIHN1cmUgdGhlIGJhc2UgcGF0aCBzdGFydHMgd2l0aCAnLydcbiAgaWYgKGJhc2VQYXRoLmNoYXJBdCgwKSAhPT0gJy8nKSB7XG4gICAgYmFzZVBhdGggPSAnLycgKyBiYXNlUGF0aDtcbiAgfVxuXG4gIC8vIE1ha2Ugc3VyZSB0aGUgYmFzZSBwYXRoIGVuZHMgd2l0aCAnLydcbiAgaWYgKGJhc2VQYXRoLmNoYXJBdChiYXNlUGF0aC5sZW5ndGggLSAxKSAhPT0gJy8nKSB7XG4gICAgYmFzZVBhdGggPSBiYXNlUGF0aCArICcvJztcbiAgfVxuXG4gIC8vIE1ha2Ugc3VyZSB0aGUgYXBpIHBhdGggZG9lcyBub3Qgc3RhcnQgd2l0aCAnLycgc2luY2UgdGhlIGJhc2UgcGF0aCB3aWxsIGVuZCB3aXRoICcvJ1xuICBpZiAoYXBpUGF0aC5jaGFyQXQoMCkgPT09ICcvJykge1xuICAgIGFwaVBhdGggPSBhcGlQYXRoLnN1YnN0cmluZygxKTtcbiAgfVxuXG4gIC8vIFJlcGxhY2UgU3dhZ2dlciBzeW50YXggZm9yIHBhdGggcGFyYW1ldGVycyB3aXRoIEV4cHJlc3MnIHZlcnNpb24gKEFsbCBTd2FnZ2VyIHBhdGggcGFyYW1ldGVycyBhcmUgcmVxdWlyZWQpXG4gIHJldHVybiAoYmFzZVBhdGggKyBhcGlQYXRoKS5yZXBsYWNlKC97L2csICc6JykucmVwbGFjZSgvfS9nLCAnJyk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIHByb3BlciBzcGVjaWZpY2F0aW9uIGJhc2VkIG9uIHRoZSBodW1hbiByZWFkYWJsZSB2ZXJzaW9uLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uIC0gVGhlIGh1bWFuIHJlYWRhYmxlIFN3YWdnZXIgdmVyc2lvbiAoRXg6IDEuMilcbiAqXG4gKiBAcmV0dXJucyB0aGUgY29ycmVzcG9uZGluZyBTd2FnZ2VyIFNwZWNpZmljYXRpb24gb2JqZWN0IG9yIHVuZGVmaW5lZCBpZiB0aGVyZSBpcyBub25lXG4gKi9cbm1vZHVsZS5leHBvcnRzLmdldFNwZWMgPSBmdW5jdGlvbiBnZXRTcGVjICh2ZXJzaW9uKSB7XG4gIHZhciBzcGVjID0gc3BlY0NhY2hlW3ZlcnNpb25dO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKHNwZWMpKSB7XG4gICAgc3dpdGNoICh2ZXJzaW9uKSB7XG4gICAgY2FzZSAnMS4yJzpcbiAgICAgIHNwZWMgPSByZXF1aXJlKCcuLi9saWIvc3BlY3MnKS52MV8yOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcblxuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICcyLjAnOlxuICAgICAgc3BlYyA9IHJlcXVpcmUoJy4uL2xpYi9zcGVjcycpLnYyXzA7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuXG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICByZXR1cm4gc3BlYztcbn07XG5cbi8qKlxuICogVGFrZXMgYSByZWZlcmVuY2UgYW5kIGNyZWF0ZXMgYSBmdWxseSBxdWFsaWZpZWQgSlNPTiBwb2ludGVyIGZyb20gaXQuICAoMi4wIG9ubHkpXG4gKlxuICogSWYgdGhlIHBhc3NlZCBpbiByZWZlcmVuY2UgaXMgZnVsbHkgcXVhbGlmaWVkLCBpdCBpcyByZXR1cm5lZCBhcy1pcy4gIE90aGVyd2lzZSwgdGhlIHJlZmVyZW5jZSB3aWxsIGhhdmVcbiAqICcjL2RlZmluaXRpb25zLycgcHJlcGVuZGVkIHRvIGl0IHRvIG1ha2UgaXQgZnVsbHkgcXVhbGlmaWVkIHNpbmNlIHRoZXNlICdyZWxhdGl2ZScgcmVmZXJlbmNlcyBhcmUgb25seSBhbGxvd2VkIGZvclxuICogbW9kZWwgZGVmaW5pdGlvbnMuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHJlZiAtIFRoZSByZWxhdGl2ZSBvciBmdWxseSBxdWFsaWZpZWQgcmVmZXJlbmNlXG4gKlxuICogQHJldHVybnMgdGhlIGNvcnJlc3BvbmRpbmcgSlNPTiBwb2ludGVyIGZvciB0aGUgcmVmZXJlbmNlXG4gKi9cbm1vZHVsZS5leHBvcnRzLnJlZlRvSnNvblBvaW50ZXIgPSBmdW5jdGlvbiByZWZUb0pzb25Qb2ludGVyIChyZWYpIHtcbiAgaWYgKHJlZi5jaGFyQXQoMCkgIT09ICcjJykge1xuICAgIHJlZiA9ICcjL2RlZmluaXRpb25zLycgKyByZWY7XG4gIH1cblxuICByZXR1cm4gcmVmO1xufTtcblxuLyoqXG4gKiBUYWtlcyBhbiBhcnJheSBvZiBwYXRoIHNlZ21lbnRzIGFuZCBjcmVhdGVzIGEgSlNPTiBwb2ludGVyIGZyb20gaXQuICgyLjAgb25seSlcbiAqXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBwYXRoIC0gVGhlIHBhdGggc2VnbWVudHNcbiAqXG4gKiBAcmV0dXJucyBhIEpTT04gcG9pbnRlciBmb3IgdGhlIHJlZmVyZW5jZSBkZW5vdGVkIGJ5IHRoZSBwYXRoIHNlZ21lbnRzXG4gKi9cbm1vZHVsZS5leHBvcnRzLnRvSnNvblBvaW50ZXIgPSBmdW5jdGlvbiB0b0pzb25Qb2ludGVyIChwYXRoKSB7XG4gIC8vIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzY5MDEjc2VjdGlvbi00XG4gIHJldHVybiAnIy8nICsgcGF0aC5tYXAoZnVuY3Rpb24gKHBhcnQpIHtcbiAgICByZXR1cm4gcGFydC5yZXBsYWNlKC9cXC8vZywgJ34xJyk7XG4gIH0pLmpvaW4oJy8nKTtcbn07XG4iLCIvKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0IEFwaWdlZSBDb3Jwb3JhdGlvblxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuICogYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG4gKiBUSEUgU09GVFdBUkUuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9IHtcbiAgZWFjaDogcmVxdWlyZSgnbG9kYXNoLmZvcmVhY2gnKSxcbiAgaXNBcnJheTogcmVxdWlyZSgnbG9kYXNoLmlzYXJyYXknKSxcbiAgaXNCb29sZWFuOiByZXF1aXJlKCdsb2Rhc2guaXNib29sZWFuJyksXG4gIGlzTmFOOiByZXF1aXJlKCdsb2Rhc2guaXNuYW4nKSxcbiAgaXNOdWxsOiByZXF1aXJlKCdsb2Rhc2guaXNudWxsJyksXG4gIGlzU3RyaW5nOiByZXF1aXJlKCdsb2Rhc2guaXNzdHJpbmcnKSxcbiAgaXNVbmRlZmluZWQ6IHJlcXVpcmUoJ2xvZGFzaC5pc3VuZGVmaW5lZCcpLFxuICB1bmlvbjogcmVxdWlyZSgnbG9kYXNoLnVuaW9uJyksXG4gIHVuaXE6IHJlcXVpcmUoJ2xvZGFzaC51bmlxJylcbn07XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG4vLyBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzMzM5I3NlY3Rpb24tNS42XG52YXIgZGF0ZVJlZ0V4cCA9IC9eKFswLTldezR9KS0oWzAtOV17Mn0pLShbMC05XXsyfSkkLztcbi8vIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzMzMzkjc2VjdGlvbi01LjZcbnZhciBkYXRlVGltZVJlZ0V4cCA9IC9eKFswLTldezJ9KTooWzAtOV17Mn0pOihbMC05XXsyfSkoLlswLTldKyk/KHp8KFsrLV1bMC05XXsyfTpbMC05XXsyfSkpJC87XG52YXIgdGhyb3dJbnZhbGlkUGFyYW1ldGVyID0gZnVuY3Rpb24gdGhyb3dJbnZhbGlkUGFyYW1ldGVyIChuYW1lLCBtZXNzYWdlKSB7XG4gIHZhciBlcnIgPSBuZXcgRXJyb3IoJ1BhcmFtZXRlciAoJyArIG5hbWUgKyAnKSAnICsgbWVzc2FnZSk7XG5cbiAgZXJyLmZhaWxlZFZhbGlkYXRpb24gPSB0cnVlO1xuXG4gIHRocm93IGVycjtcbn07XG52YXIgaXNWYWxpZERhdGUgPSBmdW5jdGlvbiBpc1ZhbGlkRGF0ZSAoZGF0ZSkge1xuICB2YXIgZGF5O1xuICB2YXIgbWF0Y2hlcztcbiAgdmFyIG1vbnRoO1xuXG4gIGlmICghXy5pc1N0cmluZyhkYXRlKSkge1xuICAgIGRhdGUgPSBkYXRlLnRvU3RyaW5nKCk7XG4gIH1cblxuICBtYXRjaGVzID0gZGF0ZVJlZ0V4cC5leGVjKGRhdGUpO1xuXG4gIGlmIChtYXRjaGVzID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBkYXkgPSBtYXRjaGVzWzNdO1xuICBtb250aCA9IG1hdGNoZXNbMl07XG5cbiAgaWYgKG1vbnRoIDwgJzAxJyB8fCBtb250aCA+ICcxMicgfHwgZGF5IDwgJzAxJyB8fCBkYXkgPiAnMzEnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xudmFyIGlzVmFsaWREYXRlVGltZSA9IGZ1bmN0aW9uIGlzVmFsaWREYXRlVGltZSAoZGF0ZVRpbWUpIHtcbiAgdmFyIGhvdXI7XG4gIHZhciBkYXRlO1xuICB2YXIgdGltZTtcbiAgdmFyIG1hdGNoZXM7XG4gIHZhciBtaW51dGU7XG4gIHZhciBwYXJ0cztcbiAgdmFyIHNlY29uZDtcblxuICBpZiAoIV8uaXNTdHJpbmcoZGF0ZVRpbWUpKSB7XG4gICAgZGF0ZVRpbWUgPSBkYXRlVGltZS50b1N0cmluZygpO1xuICB9XG5cbiAgcGFydHMgPSBkYXRlVGltZS50b0xvd2VyQ2FzZSgpLnNwbGl0KCd0Jyk7XG4gIGRhdGUgPSBwYXJ0c1swXTtcbiAgdGltZSA9IHBhcnRzLmxlbmd0aCA+IDEgPyBwYXJ0c1sxXSA6IHVuZGVmaW5lZDtcblxuICBpZiAoIWlzVmFsaWREYXRlKGRhdGUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBtYXRjaGVzID0gZGF0ZVRpbWVSZWdFeHAuZXhlYyh0aW1lKTtcblxuICBpZiAobWF0Y2hlcyA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaG91ciA9IG1hdGNoZXNbMV07XG4gIG1pbnV0ZSA9IG1hdGNoZXNbMl07XG4gIHNlY29uZCA9IG1hdGNoZXNbM107XG5cbiAgaWYgKGhvdXIgPiAnMjMnIHx8IG1pbnV0ZSA+ICc1OScgfHwgc2Vjb25kID4gJzU5Jykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QncyBjb250ZW50IHR5cGUgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBnQ29uc3VtZXMgLSBUaGUgdmFsaWQgY29uc3VtZXMgYXQgdGhlIEFQSSBzY29wZVxuICogQHBhcmFtIHtzdHJpbmdbXX0gb0NvbnN1bWVzIC0gVGhlIHZhbGlkIGNvbnN1bWVzIGF0IHRoZSBvcGVyYXRpb24gc2NvcGVcbiAqIEBwYXJhbSB7b2JqZWN0fSByZXEgLSBUaGUgcmVxdWVzdFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIGNvbnRlbnQgdHlwZSBpcyBpbnZhbGlkXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlQ29udGVudFR5cGUgPSBmdW5jdGlvbiB2YWxpZGF0ZUNvbnRlbnRUeXBlIChnQ29uc3VtZXMsIG9Db25zdW1lcywgcmVxKSB7XG4gIC8vIGh0dHA6Ly93d3cudzMub3JnL1Byb3RvY29scy9yZmMyNjE2L3JmYzI2MTYtc2VjNy5odG1sI3NlYzcuMi4xXG4gIHZhciBjb250ZW50VHlwZSA9IHJlcS5oZWFkZXJzWydjb250ZW50LXR5cGUnXSB8fCAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJztcbiAgdmFyIGNvbnN1bWVzID0gXy51bmlvbihvQ29uc3VtZXMsIGdDb25zdW1lcyk7XG5cbiAgLy8gR2V0IG9ubHkgdGhlIGNvbnRlbnQgdHlwZVxuICBjb250ZW50VHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KCc7JylbMF07XG5cbiAgLy8gVmFsaWRhdGUgY29udGVudCB0eXBlIChPbmx5IGZvciBQT1NUL1BVVCBwZXIgSFRUUCBzcGVjKVxuICBpZiAoY29uc3VtZXMubGVuZ3RoID4gMCAmJiBbJ1BPU1QnLCAnUFVUJ10uaW5kZXhPZihyZXEubWV0aG9kKSAhPT0gLTEgJiYgY29uc3VtZXMuaW5kZXhPZihjb250ZW50VHlwZSkgPT09IC0xKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbnRlbnQgdHlwZSAoJyArIGNvbnRlbnRUeXBlICsgJykuICBUaGVzZSBhcmUgdmFsaWQ6ICcgKyBjb25zdW1lcy5qb2luKCcsICcpKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyJ3MgdmFsdWUgYWdhaW5zdCB0aGUgYWxsb3dhYmxlIHZhbHVlcyAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nW119IGFsbG93ZWQgLSBUaGUgYWxsb3dhYmxlIHZhbHVlc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIG5vdCBhbGxvd2FibGVcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVFbnVtID0gZnVuY3Rpb24gdmFsaWRhdGVFbnVtIChuYW1lLCB2YWwsIGFsbG93ZWQpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGFsbG93ZWQpICYmICFfLmlzVW5kZWZpbmVkKHZhbCkgJiYgYWxsb3dlZC5pbmRleE9mKHZhbCkgPT09IC0xKSB7XG4gICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBub3QgYW4gYWxsb3dhYmxlIHZhbHVlICgnICsgYWxsb3dlZC5qb2luKCcsICcpICsgJyk6ICcgKyB2YWwpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyB2YWx1ZSBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gbWF4aW11bSAtIFRoZSBtYXhpbXVtIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtleGNsdXNpdmU9ZmFsc2VdIC0gV2hldGhlciBvciBub3QgdGhlIHZhbHVlIGluY2x1ZGVzIHRoZSBtYXhpbXVtIGluIGl0cyBjb21wYXJpc29uXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgZ3JlYXRlciB0aGFuIHRoZSBtYXhpbXVtXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWF4aW11bSA9IGZ1bmN0aW9uIHZhbGlkYXRlTWF4aW11bSAobmFtZSwgdmFsLCBtYXhpbXVtLCB0eXBlLCBleGNsdXNpdmUpIHtcbiAgdmFyIHRlc3RNYXg7XG4gIHZhciB0ZXN0VmFsO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGV4Y2x1c2l2ZSkpIHtcbiAgICBleGNsdXNpdmUgPSBmYWxzZTtcbiAgfVxuXG4gIGlmICh0eXBlID09PSAnaW50ZWdlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VJbnQodmFsLCAxMCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VGbG9hdCh2YWwpO1xuICB9XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heGltdW0pKSB7XG4gICAgdGVzdE1heCA9IHBhcnNlRmxvYXQobWF4aW11bSk7XG5cbiAgICBpZiAoZXhjbHVzaXZlICYmIHRlc3RWYWwgPj0gdGVzdE1heCkge1xuICAgICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gdGhlIGNvbmZpZ3VyZWQgbWF4aW11bSAoJyArIG1heGltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfSBlbHNlIGlmICh0ZXN0VmFsID4gdGVzdE1heCkge1xuICAgICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBncmVhdGVyIHRoYW4gdGhlIGNvbmZpZ3VyZWQgbWF4aW11bSAoJyArIG1heGltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyBhcnJheSBjb3VudCBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhJdGVtcyAtIFRoZSBtYXhpbXVtIG51bWJlciBvZiBpdGVtc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGNvbnRhaW5zIG1vcmUgaXRlbXMgdGhhbiBhbGxvd2FibGVcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhJdGVtcyA9IGZ1bmN0aW9uIHZhbGlkYXRlTWF4SXRlbXMgKG5hbWUsIHZhbCwgbWF4SXRlbXMpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heEl0ZW1zKSAmJiB2YWwubGVuZ3RoID4gbWF4SXRlbXMpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2NvbnRhaW5zIG1vcmUgaXRlbXMgdGhhbiBhbGxvd2VkOiAnICsgbWF4SXRlbXMpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyBsZW5ndGggaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWF4TGVuZ3RoIC0gVGhlIG1heGltdW0gbGVuZ3RoXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUncyBsZW5ndGggaXMgZ3JlYXRlciB0aGFuIHRoZSBtYXhpbXVtXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWF4TGVuZ3RoID0gZnVuY3Rpb24gdmFsaWRhdGVNYXhMZW5ndGggKG5hbWUsIHZhbCwgbWF4TGVuZ3RoKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChtYXhMZW5ndGgpICYmIHZhbC5sZW5ndGggPiBtYXhMZW5ndGgpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIGxvbmdlciB0aGFuIGFsbG93ZWQ6ICcgKyBtYXhMZW5ndGgpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyBhcnJheSBjb3VudCBpcyBncmVhdGVyIHRoYW4gdGhlIG1pbmltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gbWluaW11bSAtIFRoZSBtaW5pbXVtIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtleGNsdXNpdmU9ZmFsc2VdIC0gV2hldGhlciBvciBub3QgdGhlIHZhbHVlIGluY2x1ZGVzIHRoZSBtaW5pbXVtIGluIGl0cyBjb21wYXJpc29uXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWluaW11bSA9IGZ1bmN0aW9uIHZhbGlkYXRlTWluaW11bSAobmFtZSwgdmFsLCBtaW5pbXVtLCB0eXBlLCBleGNsdXNpdmUpIHtcbiAgdmFyIHRlc3RNaW47XG4gIHZhciB0ZXN0VmFsO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGV4Y2x1c2l2ZSkpIHtcbiAgICBleGNsdXNpdmUgPSBmYWxzZTtcbiAgfVxuXG4gIGlmICh0eXBlID09PSAnaW50ZWdlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VJbnQodmFsLCAxMCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VGbG9hdCh2YWwpO1xuICB9XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbmltdW0pKSB7XG4gICAgdGVzdE1pbiA9IHBhcnNlRmxvYXQobWluaW11bSk7XG5cbiAgICBpZiAoZXhjbHVzaXZlICYmIHRlc3RWYWwgPD0gdGVzdE1pbikge1xuICAgICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIGNvbmZpZ3VyZWQgbWluaW11bSAoJyArIG1pbmltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfSBlbHNlIGlmICh0ZXN0VmFsIDwgdGVzdE1pbikge1xuICAgICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBsZXNzIHRoYW4gdGhlIGNvbmZpZ3VyZWQgbWluaW11bSAoJyArIG1pbmltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyB2YWx1ZSBjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93ZWQgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5JdGVtcyAtIFRoZSBtaW5pbXVtIG51bWJlciBvZiBpdGVtc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGNvbnRhaW5zIGZld2VyIGl0ZW1zIHRoYW4gYWxsb3dhYmxlXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWluSXRlbXMgPSBmdW5jdGlvbiB2YWxpZGF0ZU1pbkl0ZW1zIChuYW1lLCB2YWwsIG1pbkl0ZW1zKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChtaW5JdGVtcykgJiYgdmFsLmxlbmd0aCA8IG1pbkl0ZW1zKSB7XG4gICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93ZWQ6ICcgKyBtaW5JdGVtcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIGxlbmd0aCBpcyBncmVhdGVyIHRoYW4gdGhlIG1pbmltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5MZW5ndGggLSBUaGUgbWluaW11bSBsZW5ndGhcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSdzIGxlbmd0aCBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW1cbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5MZW5ndGggPSBmdW5jdGlvbiB2YWxpZGF0ZU1pbkxlbmd0aCAobmFtZSwgdmFsLCBtaW5MZW5ndGgpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbkxlbmd0aCkgJiYgdmFsLmxlbmd0aCA8IG1pbkxlbmd0aCkge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnaXMgc2hvcnRlciB0aGFuIGFsbG93ZWQ6ICcgKyBtaW5MZW5ndGgpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlciBhZ2FpbnN0IGl0cyBtb2RlbCBzY2hlbWEuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7b2JqZWN0fSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvbiAtIFRoZSBTd2FnZ2VyIHZlcnNpb25cbiAqIEBwYXJhbSB7b2JqZWN0fSBhcGlET3JTTyAtIFRoZSBTd2FnZ2VyIEFQSSBEZWNsYXJhdGlvbiAoMS4yKSBvciBTd2FnZ2VyIE9iamVjdCAoMi4wKVxuICogQHBhcmFtIHtzdHJpbmd9IG1vZGVsSWRPclBhdGggLSBUaGUgbW9kZWwgaWQgb3IgcGF0aFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIG5vdCBhIHZhbGlkIG1vZGVsXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTW9kZWwgPSBmdW5jdGlvbiB2YWxpZGF0ZU1vZGVsIChuYW1lLCB2YWwsIHZlcnNpb24sIGFwaURPclNPLCBtb2RlbElkT3JQYXRoKSB7XG4gIHZhciBzcGVjID0gaGVscGVycy5nZXRTcGVjKHZlcnNpb24pO1xuICB2YXIgdmFsaWRhdGUgPSBmdW5jdGlvbiB2YWxpZGF0ZSAoZGF0YSkge1xuICAgIHZhciByZXN1bHQgPSBzcGVjLnZhbGlkYXRlTW9kZWwoYXBpRE9yU08sIG1vZGVsSWRPclBhdGgsIGRhdGEpO1xuXG4gICAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlc3VsdCkpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnaXMgbm90IGEgdmFsaWQgJyArIG1vZGVsSWRPclBhdGggKyAnIG1vZGVsJyk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgZXJyLmVycm9ycyA9IHJlc3VsdC5lcnJvcnM7XG5cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBpZiAoXy5pc0FycmF5KHZhbCkpIHtcbiAgICBfLmVhY2godmFsLCBmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgdmFsaWRhdGUoaXRlbSk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgdmFsaWRhdGUodmFsKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyJ3MgbWF0Y2hlcyBhIHBhdHRlcm4gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gcGF0dGVybiAtIFRoZSBwYXR0ZXJuXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgZG9lcyBub3QgbWF0Y2ggdGhlIHBhdHRlcm5cbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVQYXR0ZXJuID0gZnVuY3Rpb24gdmFsaWRhdGVQYXR0ZXJuIChuYW1lLCB2YWwsIHBhdHRlcm4pIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKHBhdHRlcm4pICYmIF8uaXNOdWxsKHZhbC5tYXRjaChuZXcgUmVnRXhwKHBhdHRlcm4pKSkpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2RvZXMgbm90IG1hdGNoIHJlcXVpcmVkIHBhdHRlcm46ICcgKyBwYXR0ZXJuKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyJ3MgcmVxdWlyZWRuZXNzICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtib29sZWFufSByZXF1aXJlZCAtIFdoZXRoZXIgb3Igbm90IHRoZSBwYXJhbWV0ZXIgaXMgcmVxdWlyZWRcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyByZXF1aXJlZCBidXQgaXMgbm90IHByZXNlbnRcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVSZXF1aXJlZG5lc3MgPSBmdW5jdGlvbiB2YWxpZGF0ZVJlcXVpcmVkbmVzcyAobmFtZSwgdmFsLCByZXF1aXJlZCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQocmVxdWlyZWQpICYmIHJlcXVpcmVkID09PSB0cnVlICYmIF8uaXNVbmRlZmluZWQodmFsKSkge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnaXMgcmVxdWlyZWQnKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyJ3MgdHlwZSBhbmQgZm9ybWF0ICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmd9IHR5cGUgLSBUaGUgcGFyYW1ldGVyIHR5cGVcbiAqIEBwYXJhbSB7c3RyaW5nfSBmb3JtYXQgLSBUaGUgcGFyYW1ldGVyIGZvcm1hdFxuICogQHBhcmFtIHtib29sZWFufSBbc2tpcEVycm9yPWZhbHNlXSAtIFdoZXRoZXIgb3Igbm90IHRvIHNraXAgdGhyb3dpbmcgYW4gZXJyb3IgKFVzZWZ1bCBmb3IgdmFsaWRhdGluZyBhcnJheXMpXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbm90IHRoZSBwcm9wZXIgdHlwZSBvciBmb3JtYXRcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVUeXBlQW5kRm9ybWF0ID0gZnVuY3Rpb24gdmFsaWRhdGVUeXBlQW5kRm9ybWF0IChuYW1lLCB2YWwsIHR5cGUsIGZvcm1hdCwgc2tpcEVycm9yKSB7XG4gIHZhciByZXN1bHQgPSB0cnVlO1xuXG4gIGlmIChfLmlzQXJyYXkodmFsKSkge1xuICAgIF8uZWFjaCh2YWwsIGZ1bmN0aW9uIChhVmFsLCBpbmRleCkge1xuICAgICAgaWYgKCF2YWxpZGF0ZVR5cGVBbmRGb3JtYXQobmFtZSwgYVZhbCwgdHlwZSwgZm9ybWF0LCB0cnVlKSkge1xuICAgICAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2F0IGluZGV4ICcgKyBpbmRleCArICcgaXMgbm90IGEgdmFsaWQgJyArIHR5cGUgKyAnOiAnICsgYVZhbCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXN1bHQgPSBfLmlzQm9vbGVhbih2YWwpIHx8IFsnZmFsc2UnLCAndHJ1ZSddLmluZGV4T2YodmFsKSAhPT0gLTE7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdpbnRlZ2VyJzpcbiAgICAgIHJlc3VsdCA9ICFfLmlzTmFOKHBhcnNlSW50KHZhbCwgMTApKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXN1bHQgPSAhXy5pc05hTihwYXJzZUZsb2F0KHZhbCkpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIGlmICghXy5pc1VuZGVmaW5lZChmb3JtYXQpKSB7XG4gICAgICAgIHN3aXRjaCAoZm9ybWF0KSB7XG4gICAgICAgIGNhc2UgJ2RhdGUnOlxuICAgICAgICAgIHJlc3VsdCA9IGlzVmFsaWREYXRlKHZhbCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2RhdGUtdGltZSc6XG4gICAgICAgICAgcmVzdWx0ID0gaXNWYWxpZERhdGVUaW1lKHZhbCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGlmIChza2lwRXJyb3IpIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9IGVsc2UgaWYgKCFyZXN1bHQpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIG5vdCBhIHZhbGlkICcgKyAoXy5pc1VuZGVmaW5lZChmb3JtYXQpID8gJycgOiBmb3JtYXQgKyAnICcpICsgdHlwZSArICc6ICcgKyB2YWwpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyB2YWx1ZXMgYXJlIHVuaXF1ZSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGlzVW5pcXVlIC0gV2hldGhlciBvciBub3QgdGhlIHBhcmFtZXRlciB2YWx1ZXMgYXJlIHVuaXF1ZVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGhhcyBkdXBsaWNhdGVzXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlVW5pcXVlSXRlbXMgPSBmdW5jdGlvbiB2YWxpZGF0ZVVuaXF1ZUl0ZW1zIChuYW1lLCB2YWwsIGlzVW5pcXVlKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChpc1VuaXF1ZSkgJiYgXy51bmlxKHZhbCkubGVuZ3RoICE9PSB2YWwubGVuZ3RoKSB7XG4gICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdkb2VzIG5vdCBhbGxvdyBkdXBsaWNhdGUgdmFsdWVzOiAnICsgdmFsLmpvaW4oJywgJykpO1xuICB9XG59O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLyohIGh0dHA6Ly9tdGhzLmJlL3B1bnljb2RlIHYxLjIuNCBieSBAbWF0aGlhcyAqL1xuOyhmdW5jdGlvbihyb290KSB7XG5cblx0LyoqIERldGVjdCBmcmVlIHZhcmlhYmxlcyAqL1xuXHR2YXIgZnJlZUV4cG9ydHMgPSB0eXBlb2YgZXhwb3J0cyA9PSAnb2JqZWN0JyAmJiBleHBvcnRzO1xuXHR2YXIgZnJlZU1vZHVsZSA9IHR5cGVvZiBtb2R1bGUgPT0gJ29iamVjdCcgJiYgbW9kdWxlICYmXG5cdFx0bW9kdWxlLmV4cG9ydHMgPT0gZnJlZUV4cG9ydHMgJiYgbW9kdWxlO1xuXHR2YXIgZnJlZUdsb2JhbCA9IHR5cGVvZiBnbG9iYWwgPT0gJ29iamVjdCcgJiYgZ2xvYmFsO1xuXHRpZiAoZnJlZUdsb2JhbC5nbG9iYWwgPT09IGZyZWVHbG9iYWwgfHwgZnJlZUdsb2JhbC53aW5kb3cgPT09IGZyZWVHbG9iYWwpIHtcblx0XHRyb290ID0gZnJlZUdsb2JhbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgYHB1bnljb2RlYCBvYmplY3QuXG5cdCAqIEBuYW1lIHB1bnljb2RlXG5cdCAqIEB0eXBlIE9iamVjdFxuXHQgKi9cblx0dmFyIHB1bnljb2RlLFxuXG5cdC8qKiBIaWdoZXN0IHBvc2l0aXZlIHNpZ25lZCAzMi1iaXQgZmxvYXQgdmFsdWUgKi9cblx0bWF4SW50ID0gMjE0NzQ4MzY0NywgLy8gYWthLiAweDdGRkZGRkZGIG9yIDJeMzEtMVxuXG5cdC8qKiBCb290c3RyaW5nIHBhcmFtZXRlcnMgKi9cblx0YmFzZSA9IDM2LFxuXHR0TWluID0gMSxcblx0dE1heCA9IDI2LFxuXHRza2V3ID0gMzgsXG5cdGRhbXAgPSA3MDAsXG5cdGluaXRpYWxCaWFzID0gNzIsXG5cdGluaXRpYWxOID0gMTI4LCAvLyAweDgwXG5cdGRlbGltaXRlciA9ICctJywgLy8gJ1xceDJEJ1xuXG5cdC8qKiBSZWd1bGFyIGV4cHJlc3Npb25zICovXG5cdHJlZ2V4UHVueWNvZGUgPSAvXnhuLS0vLFxuXHRyZWdleE5vbkFTQ0lJID0gL1teIC1+XS8sIC8vIHVucHJpbnRhYmxlIEFTQ0lJIGNoYXJzICsgbm9uLUFTQ0lJIGNoYXJzXG5cdHJlZ2V4U2VwYXJhdG9ycyA9IC9cXHgyRXxcXHUzMDAyfFxcdUZGMEV8XFx1RkY2MS9nLCAvLyBSRkMgMzQ5MCBzZXBhcmF0b3JzXG5cblx0LyoqIEVycm9yIG1lc3NhZ2VzICovXG5cdGVycm9ycyA9IHtcblx0XHQnb3ZlcmZsb3cnOiAnT3ZlcmZsb3c6IGlucHV0IG5lZWRzIHdpZGVyIGludGVnZXJzIHRvIHByb2Nlc3MnLFxuXHRcdCdub3QtYmFzaWMnOiAnSWxsZWdhbCBpbnB1dCA+PSAweDgwIChub3QgYSBiYXNpYyBjb2RlIHBvaW50KScsXG5cdFx0J2ludmFsaWQtaW5wdXQnOiAnSW52YWxpZCBpbnB1dCdcblx0fSxcblxuXHQvKiogQ29udmVuaWVuY2Ugc2hvcnRjdXRzICovXG5cdGJhc2VNaW51c1RNaW4gPSBiYXNlIC0gdE1pbixcblx0Zmxvb3IgPSBNYXRoLmZsb29yLFxuXHRzdHJpbmdGcm9tQ2hhckNvZGUgPSBTdHJpbmcuZnJvbUNoYXJDb2RlLFxuXG5cdC8qKiBUZW1wb3JhcnkgdmFyaWFibGUgKi9cblx0a2V5O1xuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdC8qKlxuXHQgKiBBIGdlbmVyaWMgZXJyb3IgdXRpbGl0eSBmdW5jdGlvbi5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgVGhlIGVycm9yIHR5cGUuXG5cdCAqIEByZXR1cm5zIHtFcnJvcn0gVGhyb3dzIGEgYFJhbmdlRXJyb3JgIHdpdGggdGhlIGFwcGxpY2FibGUgZXJyb3IgbWVzc2FnZS5cblx0ICovXG5cdGZ1bmN0aW9uIGVycm9yKHR5cGUpIHtcblx0XHR0aHJvdyBSYW5nZUVycm9yKGVycm9yc1t0eXBlXSk7XG5cdH1cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGBBcnJheSNtYXBgIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpdGVyYXRlIG92ZXIuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeSBhcnJheVxuXHQgKiBpdGVtLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IGFycmF5IG9mIHZhbHVlcyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXAoYXJyYXksIGZuKSB7XG5cdFx0dmFyIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblx0XHR3aGlsZSAobGVuZ3RoLS0pIHtcblx0XHRcdGFycmF5W2xlbmd0aF0gPSBmbihhcnJheVtsZW5ndGhdKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFycmF5O1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgc2ltcGxlIGBBcnJheSNtYXBgLWxpa2Ugd3JhcHBlciB0byB3b3JrIHdpdGggZG9tYWluIG5hbWUgc3RyaW5ncy5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeVxuXHQgKiBjaGFyYWN0ZXIuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgc3RyaW5nIG9mIGNoYXJhY3RlcnMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrXG5cdCAqIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwRG9tYWluKHN0cmluZywgZm4pIHtcblx0XHRyZXR1cm4gbWFwKHN0cmluZy5zcGxpdChyZWdleFNlcGFyYXRvcnMpLCBmbikuam9pbignLicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgbnVtZXJpYyBjb2RlIHBvaW50cyBvZiBlYWNoIFVuaWNvZGVcblx0ICogY2hhcmFjdGVyIGluIHRoZSBzdHJpbmcuIFdoaWxlIEphdmFTY3JpcHQgdXNlcyBVQ1MtMiBpbnRlcm5hbGx5LFxuXHQgKiB0aGlzIGZ1bmN0aW9uIHdpbGwgY29udmVydCBhIHBhaXIgb2Ygc3Vycm9nYXRlIGhhbHZlcyAoZWFjaCBvZiB3aGljaFxuXHQgKiBVQ1MtMiBleHBvc2VzIGFzIHNlcGFyYXRlIGNoYXJhY3RlcnMpIGludG8gYSBzaW5nbGUgY29kZSBwb2ludCxcblx0ICogbWF0Y2hpbmcgVVRGLTE2LlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmVuY29kZWBcblx0ICogQHNlZSA8aHR0cDovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZGVjb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBzdHJpbmcgVGhlIFVuaWNvZGUgaW5wdXQgc3RyaW5nIChVQ1MtMikuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gVGhlIG5ldyBhcnJheSBvZiBjb2RlIHBvaW50cy5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJkZWNvZGUoc3RyaW5nKSB7XG5cdFx0dmFyIG91dHB1dCA9IFtdLFxuXHRcdCAgICBjb3VudGVyID0gMCxcblx0XHQgICAgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aCxcblx0XHQgICAgdmFsdWUsXG5cdFx0ICAgIGV4dHJhO1xuXHRcdHdoaWxlIChjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHR2YWx1ZSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRpZiAodmFsdWUgPj0gMHhEODAwICYmIHZhbHVlIDw9IDB4REJGRiAmJiBjb3VudGVyIDwgbGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGhpZ2ggc3Vycm9nYXRlLCBhbmQgdGhlcmUgaXMgYSBuZXh0IGNoYXJhY3RlclxuXHRcdFx0XHRleHRyYSA9IHN0cmluZy5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cdFx0XHRcdGlmICgoZXh0cmEgJiAweEZDMDApID09IDB4REMwMCkgeyAvLyBsb3cgc3Vycm9nYXRlXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goKCh2YWx1ZSAmIDB4M0ZGKSA8PCAxMCkgKyAoZXh0cmEgJiAweDNGRikgKyAweDEwMDAwKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB1bm1hdGNoZWQgc3Vycm9nYXRlOyBvbmx5IGFwcGVuZCB0aGlzIGNvZGUgdW5pdCwgaW4gY2FzZSB0aGUgbmV4dFxuXHRcdFx0XHRcdC8vIGNvZGUgdW5pdCBpcyB0aGUgaGlnaCBzdXJyb2dhdGUgb2YgYSBzdXJyb2dhdGUgcGFpclxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0XHRjb3VudGVyLS07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgc3RyaW5nIGJhc2VkIG9uIGFuIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZGVjb2RlYFxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuXHQgKiBAbmFtZSBlbmNvZGVcblx0ICogQHBhcmFtIHtBcnJheX0gY29kZVBvaW50cyBUaGUgYXJyYXkgb2YgbnVtZXJpYyBjb2RlIHBvaW50cy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIG5ldyBVbmljb2RlIHN0cmluZyAoVUNTLTIpLlxuXHQgKi9cblx0ZnVuY3Rpb24gdWNzMmVuY29kZShhcnJheSkge1xuXHRcdHJldHVybiBtYXAoYXJyYXksIGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHR2YXIgb3V0cHV0ID0gJyc7XG5cdFx0XHRpZiAodmFsdWUgPiAweEZGRkYpIHtcblx0XHRcdFx0dmFsdWUgLT0gMHgxMDAwMDtcblx0XHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSA+Pj4gMTAgJiAweDNGRiB8IDB4RDgwMCk7XG5cdFx0XHRcdHZhbHVlID0gMHhEQzAwIHwgdmFsdWUgJiAweDNGRjtcblx0XHRcdH1cblx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUpO1xuXHRcdFx0cmV0dXJuIG91dHB1dDtcblx0XHR9KS5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGJhc2ljIGNvZGUgcG9pbnQgaW50byBhIGRpZ2l0L2ludGVnZXIuXG5cdCAqIEBzZWUgYGRpZ2l0VG9CYXNpYygpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gY29kZVBvaW50IFRoZSBiYXNpYyBudW1lcmljIGNvZGUgcG9pbnQgdmFsdWUuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludCAoZm9yIHVzZSBpblxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGluIHRoZSByYW5nZSBgMGAgdG8gYGJhc2UgLSAxYCwgb3IgYGJhc2VgIGlmXG5cdCAqIHRoZSBjb2RlIHBvaW50IGRvZXMgbm90IHJlcHJlc2VudCBhIHZhbHVlLlxuXHQgKi9cblx0ZnVuY3Rpb24gYmFzaWNUb0RpZ2l0KGNvZGVQb2ludCkge1xuXHRcdGlmIChjb2RlUG9pbnQgLSA0OCA8IDEwKSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gMjI7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA2NSA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gNjU7XG5cdFx0fVxuXHRcdGlmIChjb2RlUG9pbnQgLSA5NyA8IDI2KSB7XG5cdFx0XHRyZXR1cm4gY29kZVBvaW50IC0gOTc7XG5cdFx0fVxuXHRcdHJldHVybiBiYXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgZGlnaXQvaW50ZWdlciBpbnRvIGEgYmFzaWMgY29kZSBwb2ludC5cblx0ICogQHNlZSBgYmFzaWNUb0RpZ2l0KClgXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBkaWdpdCBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSBiYXNpYyBjb2RlIHBvaW50IHdob3NlIHZhbHVlICh3aGVuIHVzZWQgZm9yXG5cdCAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaXMgYGRpZ2l0YCwgd2hpY2ggbmVlZHMgdG8gYmUgaW4gdGhlIHJhbmdlXG5cdCAqIGAwYCB0byBgYmFzZSAtIDFgLiBJZiBgZmxhZ2AgaXMgbm9uLXplcm8sIHRoZSB1cHBlcmNhc2UgZm9ybSBpc1xuXHQgKiB1c2VkOyBlbHNlLCB0aGUgbG93ZXJjYXNlIGZvcm0gaXMgdXNlZC4gVGhlIGJlaGF2aW9yIGlzIHVuZGVmaW5lZFxuXHQgKiBpZiBgZmxhZ2AgaXMgbm9uLXplcm8gYW5kIGBkaWdpdGAgaGFzIG5vIHVwcGVyY2FzZSBmb3JtLlxuXHQgKi9cblx0ZnVuY3Rpb24gZGlnaXRUb0Jhc2ljKGRpZ2l0LCBmbGFnKSB7XG5cdFx0Ly8gIDAuLjI1IG1hcCB0byBBU0NJSSBhLi56IG9yIEEuLlpcblx0XHQvLyAyNi4uMzUgbWFwIHRvIEFTQ0lJIDAuLjlcblx0XHRyZXR1cm4gZGlnaXQgKyAyMiArIDc1ICogKGRpZ2l0IDwgMjYpIC0gKChmbGFnICE9IDApIDw8IDUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJpYXMgYWRhcHRhdGlvbiBmdW5jdGlvbiBhcyBwZXIgc2VjdGlvbiAzLjQgb2YgUkZDIDM0OTIuXG5cdCAqIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM0OTIjc2VjdGlvbi0zLjRcblx0ICogQHByaXZhdGVcblx0ICovXG5cdGZ1bmN0aW9uIGFkYXB0KGRlbHRhLCBudW1Qb2ludHMsIGZpcnN0VGltZSkge1xuXHRcdHZhciBrID0gMDtcblx0XHRkZWx0YSA9IGZpcnN0VGltZSA/IGZsb29yKGRlbHRhIC8gZGFtcCkgOiBkZWx0YSA+PiAxO1xuXHRcdGRlbHRhICs9IGZsb29yKGRlbHRhIC8gbnVtUG9pbnRzKTtcblx0XHRmb3IgKC8qIG5vIGluaXRpYWxpemF0aW9uICovOyBkZWx0YSA+IGJhc2VNaW51c1RNaW4gKiB0TWF4ID4+IDE7IGsgKz0gYmFzZSkge1xuXHRcdFx0ZGVsdGEgPSBmbG9vcihkZWx0YSAvIGJhc2VNaW51c1RNaW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gZmxvb3IoayArIChiYXNlTWludXNUTWluICsgMSkgKiBkZWx0YSAvIChkZWx0YSArIHNrZXcpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMgdG8gYSBzdHJpbmcgb2YgVW5pY29kZVxuXHQgKiBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBkZWNvZGUoaW5wdXQpIHtcblx0XHQvLyBEb24ndCB1c2UgVUNTLTJcblx0XHR2YXIgb3V0cHV0ID0gW10sXG5cdFx0ICAgIGlucHV0TGVuZ3RoID0gaW5wdXQubGVuZ3RoLFxuXHRcdCAgICBvdXQsXG5cdFx0ICAgIGkgPSAwLFxuXHRcdCAgICBuID0gaW5pdGlhbE4sXG5cdFx0ICAgIGJpYXMgPSBpbml0aWFsQmlhcyxcblx0XHQgICAgYmFzaWMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIGluZGV4LFxuXHRcdCAgICBvbGRpLFxuXHRcdCAgICB3LFxuXHRcdCAgICBrLFxuXHRcdCAgICBkaWdpdCxcblx0XHQgICAgdCxcblx0XHQgICAgLyoqIENhY2hlZCBjYWxjdWxhdGlvbiByZXN1bHRzICovXG5cdFx0ICAgIGJhc2VNaW51c1Q7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzOiBsZXQgYGJhc2ljYCBiZSB0aGUgbnVtYmVyIG9mIGlucHV0IGNvZGVcblx0XHQvLyBwb2ludHMgYmVmb3JlIHRoZSBsYXN0IGRlbGltaXRlciwgb3IgYDBgIGlmIHRoZXJlIGlzIG5vbmUsIHRoZW4gY29weVxuXHRcdC8vIHRoZSBmaXJzdCBiYXNpYyBjb2RlIHBvaW50cyB0byB0aGUgb3V0cHV0LlxuXG5cdFx0YmFzaWMgPSBpbnB1dC5sYXN0SW5kZXhPZihkZWxpbWl0ZXIpO1xuXHRcdGlmIChiYXNpYyA8IDApIHtcblx0XHRcdGJhc2ljID0gMDtcblx0XHR9XG5cblx0XHRmb3IgKGogPSAwOyBqIDwgYmFzaWM7ICsraikge1xuXHRcdFx0Ly8gaWYgaXQncyBub3QgYSBiYXNpYyBjb2RlIHBvaW50XG5cdFx0XHRpZiAoaW5wdXQuY2hhckNvZGVBdChqKSA+PSAweDgwKSB7XG5cdFx0XHRcdGVycm9yKCdub3QtYmFzaWMnKTtcblx0XHRcdH1cblx0XHRcdG91dHB1dC5wdXNoKGlucHV0LmNoYXJDb2RlQXQoaikpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZGVjb2RpbmcgbG9vcDogc3RhcnQganVzdCBhZnRlciB0aGUgbGFzdCBkZWxpbWl0ZXIgaWYgYW55IGJhc2ljIGNvZGVcblx0XHQvLyBwb2ludHMgd2VyZSBjb3BpZWQ7IHN0YXJ0IGF0IHRoZSBiZWdpbm5pbmcgb3RoZXJ3aXNlLlxuXG5cdFx0Zm9yIChpbmRleCA9IGJhc2ljID4gMCA/IGJhc2ljICsgMSA6IDA7IGluZGV4IDwgaW5wdXRMZW5ndGg7IC8qIG5vIGZpbmFsIGV4cHJlc3Npb24gKi8pIHtcblxuXHRcdFx0Ly8gYGluZGV4YCBpcyB0aGUgaW5kZXggb2YgdGhlIG5leHQgY2hhcmFjdGVyIHRvIGJlIGNvbnN1bWVkLlxuXHRcdFx0Ly8gRGVjb2RlIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXIgaW50byBgZGVsdGFgLFxuXHRcdFx0Ly8gd2hpY2ggZ2V0cyBhZGRlZCB0byBgaWAuIFRoZSBvdmVyZmxvdyBjaGVja2luZyBpcyBlYXNpZXJcblx0XHRcdC8vIGlmIHdlIGluY3JlYXNlIGBpYCBhcyB3ZSBnbywgdGhlbiBzdWJ0cmFjdCBvZmYgaXRzIHN0YXJ0aW5nXG5cdFx0XHQvLyB2YWx1ZSBhdCB0aGUgZW5kIHRvIG9idGFpbiBgZGVsdGFgLlxuXHRcdFx0Zm9yIChvbGRpID0gaSwgdyA9IDEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXG5cdFx0XHRcdGlmIChpbmRleCA+PSBpbnB1dExlbmd0aCkge1xuXHRcdFx0XHRcdGVycm9yKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaWdpdCA9IGJhc2ljVG9EaWdpdChpbnB1dC5jaGFyQ29kZUF0KGluZGV4KyspKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPj0gYmFzZSB8fCBkaWdpdCA+IGZsb29yKChtYXhJbnQgLSBpKSAvIHcpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpICs9IGRpZ2l0ICogdztcblx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cblx0XHRcdFx0aWYgKGRpZ2l0IDwgdCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuXHRcdFx0XHRpZiAodyA+IGZsb29yKG1heEludCAvIGJhc2VNaW51c1QpKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR3ICo9IGJhc2VNaW51c1Q7XG5cblx0XHRcdH1cblxuXHRcdFx0b3V0ID0gb3V0cHV0Lmxlbmd0aCArIDE7XG5cdFx0XHRiaWFzID0gYWRhcHQoaSAtIG9sZGksIG91dCwgb2xkaSA9PSAwKTtcblxuXHRcdFx0Ly8gYGlgIHdhcyBzdXBwb3NlZCB0byB3cmFwIGFyb3VuZCBmcm9tIGBvdXRgIHRvIGAwYCxcblx0XHRcdC8vIGluY3JlbWVudGluZyBgbmAgZWFjaCB0aW1lLCBzbyB3ZSdsbCBmaXggdGhhdCBub3c6XG5cdFx0XHRpZiAoZmxvb3IoaSAvIG91dCkgPiBtYXhJbnQgLSBuKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRuICs9IGZsb29yKGkgLyBvdXQpO1xuXHRcdFx0aSAlPSBvdXQ7XG5cblx0XHRcdC8vIEluc2VydCBgbmAgYXQgcG9zaXRpb24gYGlgIG9mIHRoZSBvdXRwdXRcblx0XHRcdG91dHB1dC5zcGxpY2UoaSsrLCAwLCBuKTtcblxuXHRcdH1cblxuXHRcdHJldHVybiB1Y3MyZW5jb2RlKG91dHB1dCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzIHRvIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHlcblx0ICogc3ltYm9scy5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIHJlc3VsdGluZyBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKi9cblx0ZnVuY3Rpb24gZW5jb2RlKGlucHV0KSB7XG5cdFx0dmFyIG4sXG5cdFx0ICAgIGRlbHRhLFxuXHRcdCAgICBoYW5kbGVkQ1BDb3VudCxcblx0XHQgICAgYmFzaWNMZW5ndGgsXG5cdFx0ICAgIGJpYXMsXG5cdFx0ICAgIGosXG5cdFx0ICAgIG0sXG5cdFx0ICAgIHEsXG5cdFx0ICAgIGssXG5cdFx0ICAgIHQsXG5cdFx0ICAgIGN1cnJlbnRWYWx1ZSxcblx0XHQgICAgb3V0cHV0ID0gW10sXG5cdFx0ICAgIC8qKiBgaW5wdXRMZW5ndGhgIHdpbGwgaG9sZCB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIGluIGBpbnB1dGAuICovXG5cdFx0ICAgIGlucHV0TGVuZ3RoLFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgaGFuZGxlZENQQ291bnRQbHVzT25lLFxuXHRcdCAgICBiYXNlTWludXNULFxuXHRcdCAgICBxTWludXNUO1xuXG5cdFx0Ly8gQ29udmVydCB0aGUgaW5wdXQgaW4gVUNTLTIgdG8gVW5pY29kZVxuXHRcdGlucHV0ID0gdWNzMmRlY29kZShpbnB1dCk7XG5cblx0XHQvLyBDYWNoZSB0aGUgbGVuZ3RoXG5cdFx0aW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGg7XG5cblx0XHQvLyBJbml0aWFsaXplIHRoZSBzdGF0ZVxuXHRcdG4gPSBpbml0aWFsTjtcblx0XHRkZWx0YSA9IDA7XG5cdFx0YmlhcyA9IGluaXRpYWxCaWFzO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50c1xuXHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRjdXJyZW50VmFsdWUgPSBpbnB1dFtqXTtcblx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCAweDgwKSB7XG5cdFx0XHRcdG91dHB1dC5wdXNoKHN0cmluZ0Zyb21DaGFyQ29kZShjdXJyZW50VmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRoYW5kbGVkQ1BDb3VudCA9IGJhc2ljTGVuZ3RoID0gb3V0cHV0Lmxlbmd0aDtcblxuXHRcdC8vIGBoYW5kbGVkQ1BDb3VudGAgaXMgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyB0aGF0IGhhdmUgYmVlbiBoYW5kbGVkO1xuXHRcdC8vIGBiYXNpY0xlbmd0aGAgaXMgdGhlIG51bWJlciBvZiBiYXNpYyBjb2RlIHBvaW50cy5cblxuXHRcdC8vIEZpbmlzaCB0aGUgYmFzaWMgc3RyaW5nIC0gaWYgaXQgaXMgbm90IGVtcHR5IC0gd2l0aCBhIGRlbGltaXRlclxuXHRcdGlmIChiYXNpY0xlbmd0aCkge1xuXHRcdFx0b3V0cHV0LnB1c2goZGVsaW1pdGVyKTtcblx0XHR9XG5cblx0XHQvLyBNYWluIGVuY29kaW5nIGxvb3A6XG5cdFx0d2hpbGUgKGhhbmRsZWRDUENvdW50IDwgaW5wdXRMZW5ndGgpIHtcblxuXHRcdFx0Ly8gQWxsIG5vbi1iYXNpYyBjb2RlIHBvaW50cyA8IG4gaGF2ZSBiZWVuIGhhbmRsZWQgYWxyZWFkeS4gRmluZCB0aGUgbmV4dFxuXHRcdFx0Ly8gbGFyZ2VyIG9uZTpcblx0XHRcdGZvciAobSA9IG1heEludCwgaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0XHRpZiAoY3VycmVudFZhbHVlID49IG4gJiYgY3VycmVudFZhbHVlIDwgbSkge1xuXHRcdFx0XHRcdG0gPSBjdXJyZW50VmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5jcmVhc2UgYGRlbHRhYCBlbm91Z2ggdG8gYWR2YW5jZSB0aGUgZGVjb2RlcidzIDxuLGk+IHN0YXRlIHRvIDxtLDA+LFxuXHRcdFx0Ly8gYnV0IGd1YXJkIGFnYWluc3Qgb3ZlcmZsb3dcblx0XHRcdGhhbmRsZWRDUENvdW50UGx1c09uZSA9IGhhbmRsZWRDUENvdW50ICsgMTtcblx0XHRcdGlmIChtIC0gbiA+IGZsb29yKChtYXhJbnQgLSBkZWx0YSkgLyBoYW5kbGVkQ1BDb3VudFBsdXNPbmUpKSB7XG5cdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWx0YSArPSAobSAtIG4pICogaGFuZGxlZENQQ291bnRQbHVzT25lO1xuXHRcdFx0biA9IG07XG5cblx0XHRcdGZvciAoaiA9IDA7IGogPCBpbnB1dExlbmd0aDsgKytqKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPCBuICYmICsrZGVsdGEgPiBtYXhJbnQpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPT0gbikge1xuXHRcdFx0XHRcdC8vIFJlcHJlc2VudCBkZWx0YSBhcyBhIGdlbmVyYWxpemVkIHZhcmlhYmxlLWxlbmd0aCBpbnRlZ2VyXG5cdFx0XHRcdFx0Zm9yIChxID0gZGVsdGEsIGsgPSBiYXNlOyAvKiBubyBjb25kaXRpb24gKi87IGsgKz0gYmFzZSkge1xuXHRcdFx0XHRcdFx0dCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cdFx0XHRcdFx0XHRpZiAocSA8IHQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRxTWludXNUID0gcSAtIHQ7XG5cdFx0XHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdFx0XHRvdXRwdXQucHVzaChcblx0XHRcdFx0XHRcdFx0c3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyh0ICsgcU1pbnVzVCAlIGJhc2VNaW51c1QsIDApKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHEgPSBmbG9vcihxTWludXNUIC8gYmFzZU1pbnVzVCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyhxLCAwKSkpO1xuXHRcdFx0XHRcdGJpYXMgPSBhZGFwdChkZWx0YSwgaGFuZGxlZENQQ291bnRQbHVzT25lLCBoYW5kbGVkQ1BDb3VudCA9PSBiYXNpY0xlbmd0aCk7XG5cdFx0XHRcdFx0ZGVsdGEgPSAwO1xuXHRcdFx0XHRcdCsraGFuZGxlZENQQ291bnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0KytkZWx0YTtcblx0XHRcdCsrbjtcblxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0LmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFVuaWNvZGUuIE9ubHkgdGhlXG5cdCAqIFB1bnljb2RlZCBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS4gaXQgZG9lc24ndFxuXHQgKiBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgb24gYSBzdHJpbmcgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIGNvbnZlcnRlZCB0b1xuXHQgKiBVbmljb2RlLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgUHVueWNvZGUgZG9tYWluIG5hbWUgdG8gY29udmVydCB0byBVbmljb2RlLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgVW5pY29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gUHVueWNvZGVcblx0ICogc3RyaW5nLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9Vbmljb2RlKGRvbWFpbikge1xuXHRcdHJldHVybiBtYXBEb21haW4oZG9tYWluLCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleFB1bnljb2RlLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/IGRlY29kZShzdHJpbmcuc2xpY2UoNCkudG9Mb3dlckNhc2UoKSlcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBVbmljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSB0byBQdW55Y29kZS4gT25seSB0aGVcblx0ICogbm9uLUFTQ0lJIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQncyBhbHJlYWR5IGluIEFTQ0lJLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGRvbWFpbiBUaGUgZG9tYWluIG5hbWUgdG8gY29udmVydCwgYXMgYSBVbmljb2RlIHN0cmluZy5cblx0ICogQHJldHVybnMge1N0cmluZ30gVGhlIFB1bnljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBkb21haW4gbmFtZS5cblx0ICovXG5cdGZ1bmN0aW9uIHRvQVNDSUkoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4Tm9uQVNDSUkudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gJ3huLS0nICsgZW5jb2RlKHN0cmluZylcblx0XHRcdFx0OiBzdHJpbmc7XG5cdFx0fSk7XG5cdH1cblxuXHQvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXHQvKiogRGVmaW5lIHRoZSBwdWJsaWMgQVBJICovXG5cdHB1bnljb2RlID0ge1xuXHRcdC8qKlxuXHRcdCAqIEEgc3RyaW5nIHJlcHJlc2VudGluZyB0aGUgY3VycmVudCBQdW55Y29kZS5qcyB2ZXJzaW9uIG51bWJlci5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBTdHJpbmdcblx0XHQgKi9cblx0XHQndmVyc2lvbic6ICcxLjIuNCcsXG5cdFx0LyoqXG5cdFx0ICogQW4gb2JqZWN0IG9mIG1ldGhvZHMgdG8gY29udmVydCBmcm9tIEphdmFTY3JpcHQncyBpbnRlcm5hbCBjaGFyYWN0ZXJcblx0XHQgKiByZXByZXNlbnRhdGlvbiAoVUNTLTIpIHRvIFVuaWNvZGUgY29kZSBwb2ludHMsIGFuZCBiYWNrLlxuXHRcdCAqIEBzZWUgPGh0dHA6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgT2JqZWN0XG5cdFx0ICovXG5cdFx0J3VjczInOiB7XG5cdFx0XHQnZGVjb2RlJzogdWNzMmRlY29kZSxcblx0XHRcdCdlbmNvZGUnOiB1Y3MyZW5jb2RlXG5cdFx0fSxcblx0XHQnZGVjb2RlJzogZGVjb2RlLFxuXHRcdCdlbmNvZGUnOiBlbmNvZGUsXG5cdFx0J3RvQVNDSUknOiB0b0FTQ0lJLFxuXHRcdCd0b1VuaWNvZGUnOiB0b1VuaWNvZGVcblx0fTtcblxuXHQvKiogRXhwb3NlIGBwdW55Y29kZWAgKi9cblx0Ly8gU29tZSBBTUQgYnVpbGQgb3B0aW1pemVycywgbGlrZSByLmpzLCBjaGVjayBmb3Igc3BlY2lmaWMgY29uZGl0aW9uIHBhdHRlcm5zXG5cdC8vIGxpa2UgdGhlIGZvbGxvd2luZzpcblx0aWYgKFxuXHRcdHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJlxuXHRcdHR5cGVvZiBkZWZpbmUuYW1kID09ICdvYmplY3QnICYmXG5cdFx0ZGVmaW5lLmFtZFxuXHQpIHtcblx0XHRkZWZpbmUoJ3B1bnljb2RlJywgZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gcHVueWNvZGU7XG5cdFx0fSk7XG5cdH0gZWxzZSBpZiAoZnJlZUV4cG9ydHMgJiYgIWZyZWVFeHBvcnRzLm5vZGVUeXBlKSB7XG5cdFx0aWYgKGZyZWVNb2R1bGUpIHsgLy8gaW4gTm9kZS5qcyBvciBSaW5nb0pTIHYwLjguMCtcblx0XHRcdGZyZWVNb2R1bGUuZXhwb3J0cyA9IHB1bnljb2RlO1xuXHRcdH0gZWxzZSB7IC8vIGluIE5hcndoYWwgb3IgUmluZ29KUyB2MC43LjAtXG5cdFx0XHRmb3IgKGtleSBpbiBwdW55Y29kZSkge1xuXHRcdFx0XHRwdW55Y29kZS5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIChmcmVlRXhwb3J0c1trZXldID0gcHVueWNvZGVba2V5XSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2UgeyAvLyBpbiBSaGlubyBvciBhIHdlYiBicm93c2VyXG5cdFx0cm9vdC5wdW55Y29kZSA9IHB1bnljb2RlO1xuXHR9XG5cbn0odGhpcykpO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBJZiBvYmouaGFzT3duUHJvcGVydHkgaGFzIGJlZW4gb3ZlcnJpZGRlbiwgdGhlbiBjYWxsaW5nXG4vLyBvYmouaGFzT3duUHJvcGVydHkocHJvcCkgd2lsbCBicmVhay5cbi8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2lzc3Vlcy8xNzA3XG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHFzLCBzZXAsIGVxLCBvcHRpb25zKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICB2YXIgb2JqID0ge307XG5cbiAgaWYgKHR5cGVvZiBxcyAhPT0gJ3N0cmluZycgfHwgcXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIHZhciByZWdleHAgPSAvXFwrL2c7XG4gIHFzID0gcXMuc3BsaXQoc2VwKTtcblxuICB2YXIgbWF4S2V5cyA9IDEwMDA7XG4gIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLm1heEtleXMgPT09ICdudW1iZXInKSB7XG4gICAgbWF4S2V5cyA9IG9wdGlvbnMubWF4S2V5cztcbiAgfVxuXG4gIHZhciBsZW4gPSBxcy5sZW5ndGg7XG4gIC8vIG1heEtleXMgPD0gMCBtZWFucyB0aGF0IHdlIHNob3VsZCBub3QgbGltaXQga2V5cyBjb3VudFxuICBpZiAobWF4S2V5cyA+IDAgJiYgbGVuID4gbWF4S2V5cykge1xuICAgIGxlbiA9IG1heEtleXM7XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIHggPSBxc1tpXS5yZXBsYWNlKHJlZ2V4cCwgJyUyMCcpLFxuICAgICAgICBpZHggPSB4LmluZGV4T2YoZXEpLFxuICAgICAgICBrc3RyLCB2c3RyLCBrLCB2O1xuXG4gICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICBrc3RyID0geC5zdWJzdHIoMCwgaWR4KTtcbiAgICAgIHZzdHIgPSB4LnN1YnN0cihpZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAga3N0ciA9IHg7XG4gICAgICB2c3RyID0gJyc7XG4gICAgfVxuXG4gICAgayA9IGRlY29kZVVSSUNvbXBvbmVudChrc3RyKTtcbiAgICB2ID0gZGVjb2RlVVJJQ29tcG9uZW50KHZzdHIpO1xuXG4gICAgaWYgKCFoYXNPd25Qcm9wZXJ0eShvYmosIGspKSB7XG4gICAgICBvYmpba10gPSB2O1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICBvYmpba10ucHVzaCh2KTtcbiAgICB9IGVsc2Uge1xuICAgICAgb2JqW2tdID0gW29ialtrXSwgdl07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iajtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIHN0cmluZ2lmeVByaW1pdGl2ZSA9IGZ1bmN0aW9uKHYpIHtcbiAgc3dpdGNoICh0eXBlb2Ygdikge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gdjtcblxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIHYgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBpc0Zpbml0ZSh2KSA/IHYgOiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob2JqLCBzZXAsIGVxLCBuYW1lKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICBpZiAob2JqID09PSBudWxsKSB7XG4gICAgb2JqID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIG1hcChvYmplY3RLZXlzKG9iaiksIGZ1bmN0aW9uKGspIHtcbiAgICAgIHZhciBrcyA9IGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUoaykpICsgZXE7XG4gICAgICBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICAgIHJldHVybiBtYXAob2JqW2tdLCBmdW5jdGlvbih2KSB7XG4gICAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZSh2KSk7XG4gICAgICAgIH0pLmpvaW4oc2VwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqW2tdKSk7XG4gICAgICB9XG4gICAgfSkuam9pbihzZXApO1xuXG4gIH1cblxuICBpZiAoIW5hbWUpIHJldHVybiAnJztcbiAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUobmFtZSkpICsgZXEgK1xuICAgICAgICAgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmopKTtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuXG5mdW5jdGlvbiBtYXAgKHhzLCBmKSB7XG4gIGlmICh4cy5tYXApIHJldHVybiB4cy5tYXAoZik7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuICAgIHJlcy5wdXNoKGYoeHNbaV0sIGkpKTtcbiAgfVxuICByZXR1cm4gcmVzO1xufVxuXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHJlcy5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuZGVjb2RlID0gZXhwb3J0cy5wYXJzZSA9IHJlcXVpcmUoJy4vZGVjb2RlJyk7XG5leHBvcnRzLmVuY29kZSA9IGV4cG9ydHMuc3RyaW5naWZ5ID0gcmVxdWlyZSgnLi9lbmNvZGUnKTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG52YXIgcHVueWNvZGUgPSByZXF1aXJlKCdwdW55Y29kZScpO1xuXG5leHBvcnRzLnBhcnNlID0gdXJsUGFyc2U7XG5leHBvcnRzLnJlc29sdmUgPSB1cmxSZXNvbHZlO1xuZXhwb3J0cy5yZXNvbHZlT2JqZWN0ID0gdXJsUmVzb2x2ZU9iamVjdDtcbmV4cG9ydHMuZm9ybWF0ID0gdXJsRm9ybWF0O1xuXG5leHBvcnRzLlVybCA9IFVybDtcblxuZnVuY3Rpb24gVXJsKCkge1xuICB0aGlzLnByb3RvY29sID0gbnVsbDtcbiAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgdGhpcy5hdXRoID0gbnVsbDtcbiAgdGhpcy5ob3N0ID0gbnVsbDtcbiAgdGhpcy5wb3J0ID0gbnVsbDtcbiAgdGhpcy5ob3N0bmFtZSA9IG51bGw7XG4gIHRoaXMuaGFzaCA9IG51bGw7XG4gIHRoaXMuc2VhcmNoID0gbnVsbDtcbiAgdGhpcy5xdWVyeSA9IG51bGw7XG4gIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuICB0aGlzLnBhdGggPSBudWxsO1xuICB0aGlzLmhyZWYgPSBudWxsO1xufVxuXG4vLyBSZWZlcmVuY2U6IFJGQyAzOTg2LCBSRkMgMTgwOCwgUkZDIDIzOTZcblxuLy8gZGVmaW5lIHRoZXNlIGhlcmUgc28gYXQgbGVhc3QgdGhleSBvbmx5IGhhdmUgdG8gYmVcbi8vIGNvbXBpbGVkIG9uY2Ugb24gdGhlIGZpcnN0IG1vZHVsZSBsb2FkLlxudmFyIHByb3RvY29sUGF0dGVybiA9IC9eKFthLXowLTkuKy1dKzopL2ksXG4gICAgcG9ydFBhdHRlcm4gPSAvOlswLTldKiQvLFxuXG4gICAgLy8gUkZDIDIzOTY6IGNoYXJhY3RlcnMgcmVzZXJ2ZWQgZm9yIGRlbGltaXRpbmcgVVJMcy5cbiAgICAvLyBXZSBhY3R1YWxseSBqdXN0IGF1dG8tZXNjYXBlIHRoZXNlLlxuICAgIGRlbGltcyA9IFsnPCcsICc+JywgJ1wiJywgJ2AnLCAnICcsICdcXHInLCAnXFxuJywgJ1xcdCddLFxuXG4gICAgLy8gUkZDIDIzOTY6IGNoYXJhY3RlcnMgbm90IGFsbG93ZWQgZm9yIHZhcmlvdXMgcmVhc29ucy5cbiAgICB1bndpc2UgPSBbJ3snLCAnfScsICd8JywgJ1xcXFwnLCAnXicsICdgJ10uY29uY2F0KGRlbGltcyksXG5cbiAgICAvLyBBbGxvd2VkIGJ5IFJGQ3MsIGJ1dCBjYXVzZSBvZiBYU1MgYXR0YWNrcy4gIEFsd2F5cyBlc2NhcGUgdGhlc2UuXG4gICAgYXV0b0VzY2FwZSA9IFsnXFwnJ10uY29uY2F0KHVud2lzZSksXG4gICAgLy8gQ2hhcmFjdGVycyB0aGF0IGFyZSBuZXZlciBldmVyIGFsbG93ZWQgaW4gYSBob3N0bmFtZS5cbiAgICAvLyBOb3RlIHRoYXQgYW55IGludmFsaWQgY2hhcnMgYXJlIGFsc28gaGFuZGxlZCwgYnV0IHRoZXNlXG4gICAgLy8gYXJlIHRoZSBvbmVzIHRoYXQgYXJlICpleHBlY3RlZCogdG8gYmUgc2Vlbiwgc28gd2UgZmFzdC1wYXRoXG4gICAgLy8gdGhlbS5cbiAgICBub25Ib3N0Q2hhcnMgPSBbJyUnLCAnLycsICc/JywgJzsnLCAnIyddLmNvbmNhdChhdXRvRXNjYXBlKSxcbiAgICBob3N0RW5kaW5nQ2hhcnMgPSBbJy8nLCAnPycsICcjJ10sXG4gICAgaG9zdG5hbWVNYXhMZW4gPSAyNTUsXG4gICAgaG9zdG5hbWVQYXJ0UGF0dGVybiA9IC9eW2EtejAtOUEtWl8tXXswLDYzfSQvLFxuICAgIGhvc3RuYW1lUGFydFN0YXJ0ID0gL14oW2EtejAtOUEtWl8tXXswLDYzfSkoLiopJC8sXG4gICAgLy8gcHJvdG9jb2xzIHRoYXQgY2FuIGFsbG93IFwidW5zYWZlXCIgYW5kIFwidW53aXNlXCIgY2hhcnMuXG4gICAgdW5zYWZlUHJvdG9jb2wgPSB7XG4gICAgICAnamF2YXNjcmlwdCc6IHRydWUsXG4gICAgICAnamF2YXNjcmlwdDonOiB0cnVlXG4gICAgfSxcbiAgICAvLyBwcm90b2NvbHMgdGhhdCBuZXZlciBoYXZlIGEgaG9zdG5hbWUuXG4gICAgaG9zdGxlc3NQcm90b2NvbCA9IHtcbiAgICAgICdqYXZhc2NyaXB0JzogdHJ1ZSxcbiAgICAgICdqYXZhc2NyaXB0Oic6IHRydWVcbiAgICB9LFxuICAgIC8vIHByb3RvY29scyB0aGF0IGFsd2F5cyBjb250YWluIGEgLy8gYml0LlxuICAgIHNsYXNoZWRQcm90b2NvbCA9IHtcbiAgICAgICdodHRwJzogdHJ1ZSxcbiAgICAgICdodHRwcyc6IHRydWUsXG4gICAgICAnZnRwJzogdHJ1ZSxcbiAgICAgICdnb3BoZXInOiB0cnVlLFxuICAgICAgJ2ZpbGUnOiB0cnVlLFxuICAgICAgJ2h0dHA6JzogdHJ1ZSxcbiAgICAgICdodHRwczonOiB0cnVlLFxuICAgICAgJ2Z0cDonOiB0cnVlLFxuICAgICAgJ2dvcGhlcjonOiB0cnVlLFxuICAgICAgJ2ZpbGU6JzogdHJ1ZVxuICAgIH0sXG4gICAgcXVlcnlzdHJpbmcgPSByZXF1aXJlKCdxdWVyeXN0cmluZycpO1xuXG5mdW5jdGlvbiB1cmxQYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICh1cmwgJiYgaXNPYmplY3QodXJsKSAmJiB1cmwgaW5zdGFuY2VvZiBVcmwpIHJldHVybiB1cmw7XG5cbiAgdmFyIHUgPSBuZXcgVXJsO1xuICB1LnBhcnNlKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpO1xuICByZXR1cm4gdTtcbn1cblxuVXJsLnByb3RvdHlwZS5wYXJzZSA9IGZ1bmN0aW9uKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgaWYgKCFpc1N0cmluZyh1cmwpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlBhcmFtZXRlciAndXJsJyBtdXN0IGJlIGEgc3RyaW5nLCBub3QgXCIgKyB0eXBlb2YgdXJsKTtcbiAgfVxuXG4gIHZhciByZXN0ID0gdXJsO1xuXG4gIC8vIHRyaW0gYmVmb3JlIHByb2NlZWRpbmcuXG4gIC8vIFRoaXMgaXMgdG8gc3VwcG9ydCBwYXJzZSBzdHVmZiBsaWtlIFwiICBodHRwOi8vZm9vLmNvbSAgXFxuXCJcbiAgcmVzdCA9IHJlc3QudHJpbSgpO1xuXG4gIHZhciBwcm90byA9IHByb3RvY29sUGF0dGVybi5leGVjKHJlc3QpO1xuICBpZiAocHJvdG8pIHtcbiAgICBwcm90byA9IHByb3RvWzBdO1xuICAgIHZhciBsb3dlclByb3RvID0gcHJvdG8udG9Mb3dlckNhc2UoKTtcbiAgICB0aGlzLnByb3RvY29sID0gbG93ZXJQcm90bztcbiAgICByZXN0ID0gcmVzdC5zdWJzdHIocHJvdG8ubGVuZ3RoKTtcbiAgfVxuXG4gIC8vIGZpZ3VyZSBvdXQgaWYgaXQncyBnb3QgYSBob3N0XG4gIC8vIHVzZXJAc2VydmVyIGlzICphbHdheXMqIGludGVycHJldGVkIGFzIGEgaG9zdG5hbWUsIGFuZCB1cmxcbiAgLy8gcmVzb2x1dGlvbiB3aWxsIHRyZWF0IC8vZm9vL2JhciBhcyBob3N0PWZvbyxwYXRoPWJhciBiZWNhdXNlIHRoYXQnc1xuICAvLyBob3cgdGhlIGJyb3dzZXIgcmVzb2x2ZXMgcmVsYXRpdmUgVVJMcy5cbiAgaWYgKHNsYXNoZXNEZW5vdGVIb3N0IHx8IHByb3RvIHx8IHJlc3QubWF0Y2goL15cXC9cXC9bXkBcXC9dK0BbXkBcXC9dKy8pKSB7XG4gICAgdmFyIHNsYXNoZXMgPSByZXN0LnN1YnN0cigwLCAyKSA9PT0gJy8vJztcbiAgICBpZiAoc2xhc2hlcyAmJiAhKHByb3RvICYmIGhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dKSkge1xuICAgICAgcmVzdCA9IHJlc3Quc3Vic3RyKDIpO1xuICAgICAgdGhpcy5zbGFzaGVzID0gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAoIWhvc3RsZXNzUHJvdG9jb2xbcHJvdG9dICYmXG4gICAgICAoc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoZWRQcm90b2NvbFtwcm90b10pKSkge1xuXG4gICAgLy8gdGhlcmUncyBhIGhvc3RuYW1lLlxuICAgIC8vIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiAvLCA/LCA7LCBvciAjIGVuZHMgdGhlIGhvc3QuXG4gICAgLy9cbiAgICAvLyBJZiB0aGVyZSBpcyBhbiBAIGluIHRoZSBob3N0bmFtZSwgdGhlbiBub24taG9zdCBjaGFycyAqYXJlKiBhbGxvd2VkXG4gICAgLy8gdG8gdGhlIGxlZnQgb2YgdGhlIGxhc3QgQCBzaWduLCB1bmxlc3Mgc29tZSBob3N0LWVuZGluZyBjaGFyYWN0ZXJcbiAgICAvLyBjb21lcyAqYmVmb3JlKiB0aGUgQC1zaWduLlxuICAgIC8vIFVSTHMgYXJlIG9ibm94aW91cy5cbiAgICAvL1xuICAgIC8vIGV4OlxuICAgIC8vIGh0dHA6Ly9hQGJAYy8gPT4gdXNlcjphQGIgaG9zdDpjXG4gICAgLy8gaHR0cDovL2FAYj9AYyA9PiB1c2VyOmEgaG9zdDpjIHBhdGg6Lz9AY1xuXG4gICAgLy8gdjAuMTIgVE9ETyhpc2FhY3MpOiBUaGlzIGlzIG5vdCBxdWl0ZSBob3cgQ2hyb21lIGRvZXMgdGhpbmdzLlxuICAgIC8vIFJldmlldyBvdXIgdGVzdCBjYXNlIGFnYWluc3QgYnJvd3NlcnMgbW9yZSBjb21wcmVoZW5zaXZlbHkuXG5cbiAgICAvLyBmaW5kIHRoZSBmaXJzdCBpbnN0YW5jZSBvZiBhbnkgaG9zdEVuZGluZ0NoYXJzXG4gICAgdmFyIGhvc3RFbmQgPSAtMTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGhvc3RFbmRpbmdDaGFycy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGhlYyA9IHJlc3QuaW5kZXhPZihob3N0RW5kaW5nQ2hhcnNbaV0pO1xuICAgICAgaWYgKGhlYyAhPT0gLTEgJiYgKGhvc3RFbmQgPT09IC0xIHx8IGhlYyA8IGhvc3RFbmQpKVxuICAgICAgICBob3N0RW5kID0gaGVjO1xuICAgIH1cblxuICAgIC8vIGF0IHRoaXMgcG9pbnQsIGVpdGhlciB3ZSBoYXZlIGFuIGV4cGxpY2l0IHBvaW50IHdoZXJlIHRoZVxuICAgIC8vIGF1dGggcG9ydGlvbiBjYW5ub3QgZ28gcGFzdCwgb3IgdGhlIGxhc3QgQCBjaGFyIGlzIHRoZSBkZWNpZGVyLlxuICAgIHZhciBhdXRoLCBhdFNpZ247XG4gICAgaWYgKGhvc3RFbmQgPT09IC0xKSB7XG4gICAgICAvLyBhdFNpZ24gY2FuIGJlIGFueXdoZXJlLlxuICAgICAgYXRTaWduID0gcmVzdC5sYXN0SW5kZXhPZignQCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBhdFNpZ24gbXVzdCBiZSBpbiBhdXRoIHBvcnRpb24uXG4gICAgICAvLyBodHRwOi8vYUBiL2NAZCA9PiBob3N0OmIgYXV0aDphIHBhdGg6L2NAZFxuICAgICAgYXRTaWduID0gcmVzdC5sYXN0SW5kZXhPZignQCcsIGhvc3RFbmQpO1xuICAgIH1cblxuICAgIC8vIE5vdyB3ZSBoYXZlIGEgcG9ydGlvbiB3aGljaCBpcyBkZWZpbml0ZWx5IHRoZSBhdXRoLlxuICAgIC8vIFB1bGwgdGhhdCBvZmYuXG4gICAgaWYgKGF0U2lnbiAhPT0gLTEpIHtcbiAgICAgIGF1dGggPSByZXN0LnNsaWNlKDAsIGF0U2lnbik7XG4gICAgICByZXN0ID0gcmVzdC5zbGljZShhdFNpZ24gKyAxKTtcbiAgICAgIHRoaXMuYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICB9XG5cbiAgICAvLyB0aGUgaG9zdCBpcyB0aGUgcmVtYWluaW5nIHRvIHRoZSBsZWZ0IG9mIHRoZSBmaXJzdCBub24taG9zdCBjaGFyXG4gICAgaG9zdEVuZCA9IC0xO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm9uSG9zdENoYXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaGVjID0gcmVzdC5pbmRleE9mKG5vbkhvc3RDaGFyc1tpXSk7XG4gICAgICBpZiAoaGVjICE9PSAtMSAmJiAoaG9zdEVuZCA9PT0gLTEgfHwgaGVjIDwgaG9zdEVuZCkpXG4gICAgICAgIGhvc3RFbmQgPSBoZWM7XG4gICAgfVxuICAgIC8vIGlmIHdlIHN0aWxsIGhhdmUgbm90IGhpdCBpdCwgdGhlbiB0aGUgZW50aXJlIHRoaW5nIGlzIGEgaG9zdC5cbiAgICBpZiAoaG9zdEVuZCA9PT0gLTEpXG4gICAgICBob3N0RW5kID0gcmVzdC5sZW5ndGg7XG5cbiAgICB0aGlzLmhvc3QgPSByZXN0LnNsaWNlKDAsIGhvc3RFbmQpO1xuICAgIHJlc3QgPSByZXN0LnNsaWNlKGhvc3RFbmQpO1xuXG4gICAgLy8gcHVsbCBvdXQgcG9ydC5cbiAgICB0aGlzLnBhcnNlSG9zdCgpO1xuXG4gICAgLy8gd2UndmUgaW5kaWNhdGVkIHRoYXQgdGhlcmUgaXMgYSBob3N0bmFtZSxcbiAgICAvLyBzbyBldmVuIGlmIGl0J3MgZW1wdHksIGl0IGhhcyB0byBiZSBwcmVzZW50LlxuICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lIHx8ICcnO1xuXG4gICAgLy8gaWYgaG9zdG5hbWUgYmVnaW5zIHdpdGggWyBhbmQgZW5kcyB3aXRoIF1cbiAgICAvLyBhc3N1bWUgdGhhdCBpdCdzIGFuIElQdjYgYWRkcmVzcy5cbiAgICB2YXIgaXB2Nkhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZVswXSA9PT0gJ1snICYmXG4gICAgICAgIHRoaXMuaG9zdG5hbWVbdGhpcy5ob3N0bmFtZS5sZW5ndGggLSAxXSA9PT0gJ10nO1xuXG4gICAgLy8gdmFsaWRhdGUgYSBsaXR0bGUuXG4gICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgIHZhciBob3N0cGFydHMgPSB0aGlzLmhvc3RuYW1lLnNwbGl0KC9cXC4vKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gaG9zdHBhcnRzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgcGFydCA9IGhvc3RwYXJ0c1tpXTtcbiAgICAgICAgaWYgKCFwYXJ0KSBjb250aW51ZTtcbiAgICAgICAgaWYgKCFwYXJ0Lm1hdGNoKGhvc3RuYW1lUGFydFBhdHRlcm4pKSB7XG4gICAgICAgICAgdmFyIG5ld3BhcnQgPSAnJztcbiAgICAgICAgICBmb3IgKHZhciBqID0gMCwgayA9IHBhcnQubGVuZ3RoOyBqIDwgazsgaisrKSB7XG4gICAgICAgICAgICBpZiAocGFydC5jaGFyQ29kZUF0KGopID4gMTI3KSB7XG4gICAgICAgICAgICAgIC8vIHdlIHJlcGxhY2Ugbm9uLUFTQ0lJIGNoYXIgd2l0aCBhIHRlbXBvcmFyeSBwbGFjZWhvbGRlclxuICAgICAgICAgICAgICAvLyB3ZSBuZWVkIHRoaXMgdG8gbWFrZSBzdXJlIHNpemUgb2YgaG9zdG5hbWUgaXMgbm90XG4gICAgICAgICAgICAgIC8vIGJyb2tlbiBieSByZXBsYWNpbmcgbm9uLUFTQ0lJIGJ5IG5vdGhpbmdcbiAgICAgICAgICAgICAgbmV3cGFydCArPSAneCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBuZXdwYXJ0ICs9IHBhcnRbal07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIHdlIHRlc3QgYWdhaW4gd2l0aCBBU0NJSSBjaGFyIG9ubHlcbiAgICAgICAgICBpZiAoIW5ld3BhcnQubWF0Y2goaG9zdG5hbWVQYXJ0UGF0dGVybikpIHtcbiAgICAgICAgICAgIHZhciB2YWxpZFBhcnRzID0gaG9zdHBhcnRzLnNsaWNlKDAsIGkpO1xuICAgICAgICAgICAgdmFyIG5vdEhvc3QgPSBob3N0cGFydHMuc2xpY2UoaSArIDEpO1xuICAgICAgICAgICAgdmFyIGJpdCA9IHBhcnQubWF0Y2goaG9zdG5hbWVQYXJ0U3RhcnQpO1xuICAgICAgICAgICAgaWYgKGJpdCkge1xuICAgICAgICAgICAgICB2YWxpZFBhcnRzLnB1c2goYml0WzFdKTtcbiAgICAgICAgICAgICAgbm90SG9zdC51bnNoaWZ0KGJpdFsyXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobm90SG9zdC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgcmVzdCA9ICcvJyArIG5vdEhvc3Quam9pbignLicpICsgcmVzdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSB2YWxpZFBhcnRzLmpvaW4oJy4nKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0aGlzLmhvc3RuYW1lLmxlbmd0aCA+IGhvc3RuYW1lTWF4TGVuKSB7XG4gICAgICB0aGlzLmhvc3RuYW1lID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIGhvc3RuYW1lcyBhcmUgYWx3YXlzIGxvd2VyIGNhc2UuXG4gICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgIH1cblxuICAgIGlmICghaXB2Nkhvc3RuYW1lKSB7XG4gICAgICAvLyBJRE5BIFN1cHBvcnQ6IFJldHVybnMgYSBwdW55IGNvZGVkIHJlcHJlc2VudGF0aW9uIG9mIFwiZG9tYWluXCIuXG4gICAgICAvLyBJdCBvbmx5IGNvbnZlcnRzIHRoZSBwYXJ0IG9mIHRoZSBkb21haW4gbmFtZSB0aGF0XG4gICAgICAvLyBoYXMgbm9uIEFTQ0lJIGNoYXJhY3RlcnMuIEkuZS4gaXQgZG9zZW50IG1hdHRlciBpZlxuICAgICAgLy8geW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0IGFscmVhZHkgaXMgaW4gQVNDSUkuXG4gICAgICB2YXIgZG9tYWluQXJyYXkgPSB0aGlzLmhvc3RuYW1lLnNwbGl0KCcuJyk7XG4gICAgICB2YXIgbmV3T3V0ID0gW107XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRvbWFpbkFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBzID0gZG9tYWluQXJyYXlbaV07XG4gICAgICAgIG5ld091dC5wdXNoKHMubWF0Y2goL1teQS1aYS16MC05Xy1dLykgP1xuICAgICAgICAgICAgJ3huLS0nICsgcHVueWNvZGUuZW5jb2RlKHMpIDogcyk7XG4gICAgICB9XG4gICAgICB0aGlzLmhvc3RuYW1lID0gbmV3T3V0LmpvaW4oJy4nKTtcbiAgICB9XG5cbiAgICB2YXIgcCA9IHRoaXMucG9ydCA/ICc6JyArIHRoaXMucG9ydCA6ICcnO1xuICAgIHZhciBoID0gdGhpcy5ob3N0bmFtZSB8fCAnJztcbiAgICB0aGlzLmhvc3QgPSBoICsgcDtcbiAgICB0aGlzLmhyZWYgKz0gdGhpcy5ob3N0O1xuXG4gICAgLy8gc3RyaXAgWyBhbmQgXSBmcm9tIHRoZSBob3N0bmFtZVxuICAgIC8vIHRoZSBob3N0IGZpZWxkIHN0aWxsIHJldGFpbnMgdGhlbSwgdGhvdWdoXG4gICAgaWYgKGlwdjZIb3N0bmFtZSkge1xuICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUuc3Vic3RyKDEsIHRoaXMuaG9zdG5hbWUubGVuZ3RoIC0gMik7XG4gICAgICBpZiAocmVzdFswXSAhPT0gJy8nKSB7XG4gICAgICAgIHJlc3QgPSAnLycgKyByZXN0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG5vdyByZXN0IGlzIHNldCB0byB0aGUgcG9zdC1ob3N0IHN0dWZmLlxuICAvLyBjaG9wIG9mZiBhbnkgZGVsaW0gY2hhcnMuXG4gIGlmICghdW5zYWZlUHJvdG9jb2xbbG93ZXJQcm90b10pIHtcblxuICAgIC8vIEZpcnN0LCBtYWtlIDEwMCUgc3VyZSB0aGF0IGFueSBcImF1dG9Fc2NhcGVcIiBjaGFycyBnZXRcbiAgICAvLyBlc2NhcGVkLCBldmVuIGlmIGVuY29kZVVSSUNvbXBvbmVudCBkb2Vzbid0IHRoaW5rIHRoZXlcbiAgICAvLyBuZWVkIHRvIGJlLlxuICAgIGZvciAodmFyIGkgPSAwLCBsID0gYXV0b0VzY2FwZS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHZhciBhZSA9IGF1dG9Fc2NhcGVbaV07XG4gICAgICB2YXIgZXNjID0gZW5jb2RlVVJJQ29tcG9uZW50KGFlKTtcbiAgICAgIGlmIChlc2MgPT09IGFlKSB7XG4gICAgICAgIGVzYyA9IGVzY2FwZShhZSk7XG4gICAgICB9XG4gICAgICByZXN0ID0gcmVzdC5zcGxpdChhZSkuam9pbihlc2MpO1xuICAgIH1cbiAgfVxuXG5cbiAgLy8gY2hvcCBvZmYgZnJvbSB0aGUgdGFpbCBmaXJzdC5cbiAgdmFyIGhhc2ggPSByZXN0LmluZGV4T2YoJyMnKTtcbiAgaWYgKGhhc2ggIT09IC0xKSB7XG4gICAgLy8gZ290IGEgZnJhZ21lbnQgc3RyaW5nLlxuICAgIHRoaXMuaGFzaCA9IHJlc3Quc3Vic3RyKGhhc2gpO1xuICAgIHJlc3QgPSByZXN0LnNsaWNlKDAsIGhhc2gpO1xuICB9XG4gIHZhciBxbSA9IHJlc3QuaW5kZXhPZignPycpO1xuICBpZiAocW0gIT09IC0xKSB7XG4gICAgdGhpcy5zZWFyY2ggPSByZXN0LnN1YnN0cihxbSk7XG4gICAgdGhpcy5xdWVyeSA9IHJlc3Quc3Vic3RyKHFtICsgMSk7XG4gICAgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZSh0aGlzLnF1ZXJ5KTtcbiAgICB9XG4gICAgcmVzdCA9IHJlc3Quc2xpY2UoMCwgcW0pO1xuICB9IGVsc2UgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAvLyBubyBxdWVyeSBzdHJpbmcsIGJ1dCBwYXJzZVF1ZXJ5U3RyaW5nIHN0aWxsIHJlcXVlc3RlZFxuICAgIHRoaXMuc2VhcmNoID0gJyc7XG4gICAgdGhpcy5xdWVyeSA9IHt9O1xuICB9XG4gIGlmIChyZXN0KSB0aGlzLnBhdGhuYW1lID0gcmVzdDtcbiAgaWYgKHNsYXNoZWRQcm90b2NvbFtsb3dlclByb3RvXSAmJlxuICAgICAgdGhpcy5ob3N0bmFtZSAmJiAhdGhpcy5wYXRobmFtZSkge1xuICAgIHRoaXMucGF0aG5hbWUgPSAnLyc7XG4gIH1cblxuICAvL3RvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gIGlmICh0aGlzLnBhdGhuYW1lIHx8IHRoaXMuc2VhcmNoKSB7XG4gICAgdmFyIHAgPSB0aGlzLnBhdGhuYW1lIHx8ICcnO1xuICAgIHZhciBzID0gdGhpcy5zZWFyY2ggfHwgJyc7XG4gICAgdGhpcy5wYXRoID0gcCArIHM7XG4gIH1cblxuICAvLyBmaW5hbGx5LCByZWNvbnN0cnVjdCB0aGUgaHJlZiBiYXNlZCBvbiB3aGF0IGhhcyBiZWVuIHZhbGlkYXRlZC5cbiAgdGhpcy5ocmVmID0gdGhpcy5mb3JtYXQoKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBmb3JtYXQgYSBwYXJzZWQgb2JqZWN0IGludG8gYSB1cmwgc3RyaW5nXG5mdW5jdGlvbiB1cmxGb3JtYXQob2JqKSB7XG4gIC8vIGVuc3VyZSBpdCdzIGFuIG9iamVjdCwgYW5kIG5vdCBhIHN0cmluZyB1cmwuXG4gIC8vIElmIGl0J3MgYW4gb2JqLCB0aGlzIGlzIGEgbm8tb3AuXG4gIC8vIHRoaXMgd2F5LCB5b3UgY2FuIGNhbGwgdXJsX2Zvcm1hdCgpIG9uIHN0cmluZ3NcbiAgLy8gdG8gY2xlYW4gdXAgcG90ZW50aWFsbHkgd29ua3kgdXJscy5cbiAgaWYgKGlzU3RyaW5nKG9iaikpIG9iaiA9IHVybFBhcnNlKG9iaik7XG4gIGlmICghKG9iaiBpbnN0YW5jZW9mIFVybCkpIHJldHVybiBVcmwucHJvdG90eXBlLmZvcm1hdC5jYWxsKG9iaik7XG4gIHJldHVybiBvYmouZm9ybWF0KCk7XG59XG5cblVybC5wcm90b3R5cGUuZm9ybWF0ID0gZnVuY3Rpb24oKSB7XG4gIHZhciBhdXRoID0gdGhpcy5hdXRoIHx8ICcnO1xuICBpZiAoYXV0aCkge1xuICAgIGF1dGggPSBlbmNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgYXV0aCA9IGF1dGgucmVwbGFjZSgvJTNBL2ksICc6Jyk7XG4gICAgYXV0aCArPSAnQCc7XG4gIH1cblxuICB2YXIgcHJvdG9jb2wgPSB0aGlzLnByb3RvY29sIHx8ICcnLFxuICAgICAgcGF0aG5hbWUgPSB0aGlzLnBhdGhuYW1lIHx8ICcnLFxuICAgICAgaGFzaCA9IHRoaXMuaGFzaCB8fCAnJyxcbiAgICAgIGhvc3QgPSBmYWxzZSxcbiAgICAgIHF1ZXJ5ID0gJyc7XG5cbiAgaWYgKHRoaXMuaG9zdCkge1xuICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICB9IGVsc2UgaWYgKHRoaXMuaG9zdG5hbWUpIHtcbiAgICBob3N0ID0gYXV0aCArICh0aGlzLmhvc3RuYW1lLmluZGV4T2YoJzonKSA9PT0gLTEgP1xuICAgICAgICB0aGlzLmhvc3RuYW1lIDpcbiAgICAgICAgJ1snICsgdGhpcy5ob3N0bmFtZSArICddJyk7XG4gICAgaWYgKHRoaXMucG9ydCkge1xuICAgICAgaG9zdCArPSAnOicgKyB0aGlzLnBvcnQ7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkgJiZcbiAgICAgIGlzT2JqZWN0KHRoaXMucXVlcnkpICYmXG4gICAgICBPYmplY3Qua2V5cyh0aGlzLnF1ZXJ5KS5sZW5ndGgpIHtcbiAgICBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeSh0aGlzLnF1ZXJ5KTtcbiAgfVxuXG4gIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCAocXVlcnkgJiYgKCc/JyArIHF1ZXJ5KSkgfHwgJyc7XG5cbiAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLnN1YnN0cigtMSkgIT09ICc6JykgcHJvdG9jb2wgKz0gJzonO1xuXG4gIC8vIG9ubHkgdGhlIHNsYXNoZWRQcm90b2NvbHMgZ2V0IHRoZSAvLy4gIE5vdCBtYWlsdG86LCB4bXBwOiwgZXRjLlxuICAvLyB1bmxlc3MgdGhleSBoYWQgdGhlbSB0byBiZWdpbiB3aXRoLlxuICBpZiAodGhpcy5zbGFzaGVzIHx8XG4gICAgICAoIXByb3RvY29sIHx8IHNsYXNoZWRQcm90b2NvbFtwcm90b2NvbF0pICYmIGhvc3QgIT09IGZhbHNlKSB7XG4gICAgaG9zdCA9ICcvLycgKyAoaG9zdCB8fCAnJyk7XG4gICAgaWYgKHBhdGhuYW1lICYmIHBhdGhuYW1lLmNoYXJBdCgwKSAhPT0gJy8nKSBwYXRobmFtZSA9ICcvJyArIHBhdGhuYW1lO1xuICB9IGVsc2UgaWYgKCFob3N0KSB7XG4gICAgaG9zdCA9ICcnO1xuICB9XG5cbiAgaWYgKGhhc2ggJiYgaGFzaC5jaGFyQXQoMCkgIT09ICcjJykgaGFzaCA9ICcjJyArIGhhc2g7XG4gIGlmIChzZWFyY2ggJiYgc2VhcmNoLmNoYXJBdCgwKSAhPT0gJz8nKSBzZWFyY2ggPSAnPycgKyBzZWFyY2g7XG5cbiAgcGF0aG5hbWUgPSBwYXRobmFtZS5yZXBsYWNlKC9bPyNdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChtYXRjaCk7XG4gIH0pO1xuICBzZWFyY2ggPSBzZWFyY2gucmVwbGFjZSgnIycsICclMjMnKTtcblxuICByZXR1cm4gcHJvdG9jb2wgKyBob3N0ICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuZnVuY3Rpb24gdXJsUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gIHJldHVybiB1cmxQYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn1cblxuVXJsLnByb3RvdHlwZS5yZXNvbHZlID0gZnVuY3Rpb24ocmVsYXRpdmUpIHtcbiAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdCh1cmxQYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpKS5mb3JtYXQoKTtcbn07XG5cbmZ1bmN0aW9uIHVybFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICBpZiAoIXNvdXJjZSkgcmV0dXJuIHJlbGF0aXZlO1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZU9iamVjdCA9IGZ1bmN0aW9uKHJlbGF0aXZlKSB7XG4gIGlmIChpc1N0cmluZyhyZWxhdGl2ZSkpIHtcbiAgICB2YXIgcmVsID0gbmV3IFVybCgpO1xuICAgIHJlbC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuICAgIHJlbGF0aXZlID0gcmVsO1xuICB9XG5cbiAgdmFyIHJlc3VsdCA9IG5ldyBVcmwoKTtcbiAgT2JqZWN0LmtleXModGhpcykuZm9yRWFjaChmdW5jdGlvbihrKSB7XG4gICAgcmVzdWx0W2tdID0gdGhpc1trXTtcbiAgfSwgdGhpcyk7XG5cbiAgLy8gaGFzaCBpcyBhbHdheXMgb3ZlcnJpZGRlbiwgbm8gbWF0dGVyIHdoYXQuXG4gIC8vIGV2ZW4gaHJlZj1cIlwiIHdpbGwgcmVtb3ZlIGl0LlxuICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgLy8gaWYgdGhlIHJlbGF0aXZlIHVybCBpcyBlbXB0eSwgdGhlbiB0aGVyZSdzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICBpZiAocmVsYXRpdmUuaHJlZiA9PT0gJycpIHtcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaHJlZnMgbGlrZSAvL2Zvby9iYXIgYWx3YXlzIGN1dCB0byB0aGUgcHJvdG9jb2wuXG4gIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgIC8vIHRha2UgZXZlcnl0aGluZyBleGNlcHQgdGhlIHByb3RvY29sIGZyb20gcmVsYXRpdmVcbiAgICBPYmplY3Qua2V5cyhyZWxhdGl2ZSkuZm9yRWFjaChmdW5jdGlvbihrKSB7XG4gICAgICBpZiAoayAhPT0gJ3Byb3RvY29sJylcbiAgICAgICAgcmVzdWx0W2tdID0gcmVsYXRpdmVba107XG4gICAgfSk7XG5cbiAgICAvL3VybFBhcnNlIGFwcGVuZHMgdHJhaWxpbmcgLyB0byB1cmxzIGxpa2UgaHR0cDovL3d3dy5leGFtcGxlLmNvbVxuICAgIGlmIChzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXSAmJlxuICAgICAgICByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgcmVzdWx0LnBhdGggPSByZXN1bHQucGF0aG5hbWUgPSAnLyc7XG4gICAgfVxuXG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmIChyZWxhdGl2ZS5wcm90b2NvbCAmJiByZWxhdGl2ZS5wcm90b2NvbCAhPT0gcmVzdWx0LnByb3RvY29sKSB7XG4gICAgLy8gaWYgaXQncyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgIC8vIHRoZSBwcm90b2NvbCBkb2VzIHdlaXJkIHRoaW5nc1xuICAgIC8vIGZpcnN0LCBpZiBpdCdzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgIC8vIGFuZCBpZiB0aGVyZSB3YXMgYSBwYXRoXG4gICAgLy8gdG8gYmVnaW4gd2l0aCwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBwYXRoLlxuICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgLy8gYmVjYXVzZSB0aGF0J3Mga25vd24gdG8gYmUgaG9zdGxlc3MuXG4gICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgIGlmICghc2xhc2hlZFByb3RvY29sW3JlbGF0aXZlLnByb3RvY29sXSkge1xuICAgICAgT2JqZWN0LmtleXMocmVsYXRpdmUpLmZvckVhY2goZnVuY3Rpb24oaykge1xuICAgICAgICByZXN1bHRba10gPSByZWxhdGl2ZVtrXTtcbiAgICAgIH0pO1xuICAgICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHJlc3VsdC5wcm90b2NvbCA9IHJlbGF0aXZlLnByb3RvY29sO1xuICAgIGlmICghcmVsYXRpdmUuaG9zdCAmJiAhaG9zdGxlc3NQcm90b2NvbFtyZWxhdGl2ZS5wcm90b2NvbF0pIHtcbiAgICAgIHZhciByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8ICcnKS5zcGxpdCgnLycpO1xuICAgICAgd2hpbGUgKHJlbFBhdGgubGVuZ3RoICYmICEocmVsYXRpdmUuaG9zdCA9IHJlbFBhdGguc2hpZnQoKSkpO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0KSByZWxhdGl2ZS5ob3N0ID0gJyc7XG4gICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9ICcnO1xuICAgICAgaWYgKHJlbFBhdGhbMF0gIT09ICcnKSByZWxQYXRoLnVuc2hpZnQoJycpO1xuICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbFBhdGguam9pbignLycpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxhdGl2ZS5wYXRobmFtZTtcbiAgICB9XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgfHwgJyc7XG4gICAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoO1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3Q7XG4gICAgcmVzdWx0LnBvcnQgPSByZWxhdGl2ZS5wb3J0O1xuICAgIC8vIHRvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5wYXRobmFtZSB8fCByZXN1bHQuc2VhcmNoKSB7XG4gICAgICB2YXIgcCA9IHJlc3VsdC5wYXRobmFtZSB8fCAnJztcbiAgICAgIHZhciBzID0gcmVzdWx0LnNlYXJjaCB8fCAnJztcbiAgICAgIHJlc3VsdC5wYXRoID0gcCArIHM7XG4gICAgfVxuICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgdmFyIGlzU291cmNlQWJzID0gKHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuY2hhckF0KDApID09PSAnLycpLFxuICAgICAgaXNSZWxBYnMgPSAoXG4gICAgICAgICAgcmVsYXRpdmUuaG9zdCB8fFxuICAgICAgICAgIHJlbGF0aXZlLnBhdGhuYW1lICYmIHJlbGF0aXZlLnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nXG4gICAgICApLFxuICAgICAgbXVzdEVuZEFicyA9IChpc1JlbEFicyB8fCBpc1NvdXJjZUFicyB8fFxuICAgICAgICAgICAgICAgICAgICAocmVzdWx0Lmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpKSxcbiAgICAgIHJlbW92ZUFsbERvdHMgPSBtdXN0RW5kQWJzLFxuICAgICAgc3JjUGF0aCA9IHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuc3BsaXQoJy8nKSB8fCBbXSxcbiAgICAgIHJlbFBhdGggPSByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdCgnLycpIHx8IFtdLFxuICAgICAgcHN5Y2hvdGljID0gcmVzdWx0LnByb3RvY29sICYmICFzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXTtcblxuICAvLyBpZiB0aGUgdXJsIGlzIGEgbm9uLXNsYXNoZWQgdXJsLCB0aGVuIHJlbGF0aXZlXG4gIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgLy8gdG8gY3Jhd2wgdXAgdG8gdGhlIGhvc3RuYW1lLCBhcyB3ZWxsLiAgVGhpcyBpcyBzdHJhbmdlLlxuICAvLyByZXN1bHQucHJvdG9jb2wgaGFzIGFscmVhZHkgYmVlbiBzZXQgYnkgbm93LlxuICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgaWYgKHBzeWNob3RpYykge1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9ICcnO1xuICAgIHJlc3VsdC5wb3J0ID0gbnVsbDtcbiAgICBpZiAocmVzdWx0Lmhvc3QpIHtcbiAgICAgIGlmIChzcmNQYXRoWzBdID09PSAnJykgc3JjUGF0aFswXSA9IHJlc3VsdC5ob3N0O1xuICAgICAgZWxzZSBzcmNQYXRoLnVuc2hpZnQocmVzdWx0Lmhvc3QpO1xuICAgIH1cbiAgICByZXN1bHQuaG9zdCA9ICcnO1xuICAgIGlmIChyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgICAgcmVsYXRpdmUuaG9zdG5hbWUgPSBudWxsO1xuICAgICAgcmVsYXRpdmUucG9ydCA9IG51bGw7XG4gICAgICBpZiAocmVsYXRpdmUuaG9zdCkge1xuICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gJycpIHJlbFBhdGhbMF0gPSByZWxhdGl2ZS5ob3N0O1xuICAgICAgICBlbHNlIHJlbFBhdGgudW5zaGlmdChyZWxhdGl2ZS5ob3N0KTtcbiAgICAgIH1cbiAgICAgIHJlbGF0aXZlLmhvc3QgPSBudWxsO1xuICAgIH1cbiAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gJycgfHwgc3JjUGF0aFswXSA9PT0gJycpO1xuICB9XG5cbiAgaWYgKGlzUmVsQWJzKSB7XG4gICAgLy8gaXQncyBhYnNvbHV0ZS5cbiAgICByZXN1bHQuaG9zdCA9IChyZWxhdGl2ZS5ob3N0IHx8IHJlbGF0aXZlLmhvc3QgPT09ICcnKSA/XG4gICAgICAgICAgICAgICAgICByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gKHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3RuYW1lID09PSAnJykgP1xuICAgICAgICAgICAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgc3JjUGF0aCA9IHJlbFBhdGg7XG4gICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAvLyBpdCdzIHJlbGF0aXZlXG4gICAgLy8gdGhyb3cgYXdheSB0aGUgZXhpc3RpbmcgZmlsZSwgYW5kIHRha2UgdGhlIG5ldyBwYXRoIGluc3RlYWQuXG4gICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgc3JjUGF0aC5wb3AoKTtcbiAgICBzcmNQYXRoID0gc3JjUGF0aC5jb25jYXQocmVsUGF0aCk7XG4gICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICByZXN1bHQucXVlcnkgPSByZWxhdGl2ZS5xdWVyeTtcbiAgfSBlbHNlIGlmICghaXNOdWxsT3JVbmRlZmluZWQocmVsYXRpdmUuc2VhcmNoKSkge1xuICAgIC8vIGp1c3QgcHVsbCBvdXQgdGhlIHNlYXJjaC5cbiAgICAvLyBsaWtlIGhyZWY9Jz9mb28nLlxuICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgICB2YXIgYXV0aEluSG9zdCA9IHJlc3VsdC5ob3N0ICYmIHJlc3VsdC5ob3N0LmluZGV4T2YoJ0AnKSA+IDAgP1xuICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmICghaXNOdWxsKHJlc3VsdC5wYXRobmFtZSkgfHwgIWlzTnVsbChyZXN1bHQuc2VhcmNoKSkge1xuICAgICAgcmVzdWx0LnBhdGggPSAocmVzdWx0LnBhdGhuYW1lID8gcmVzdWx0LnBhdGhuYW1lIDogJycpICtcbiAgICAgICAgICAgICAgICAgICAgKHJlc3VsdC5zZWFyY2ggPyByZXN1bHQuc2VhcmNoIDogJycpO1xuICAgIH1cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgIC8vIG5vIHBhdGggYXQgYWxsLiAgZWFzeS5cbiAgICAvLyB3ZSd2ZSBhbHJlYWR5IGhhbmRsZWQgdGhlIG90aGVyIHN0dWZmIGFib3ZlLlxuICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgLy90byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQuc2VhcmNoKSB7XG4gICAgICByZXN1bHQucGF0aCA9ICcvJyArIHJlc3VsdC5zZWFyY2g7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gbnVsbDtcbiAgICB9XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8vIGlmIGEgdXJsIEVORHMgaW4gLiBvciAuLiwgdGhlbiBpdCBtdXN0IGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgLy8gdGhlbiBpdCBtdXN0IE5PVCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgdmFyIGxhc3QgPSBzcmNQYXRoLnNsaWNlKC0xKVswXTtcbiAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPSAoXG4gICAgICAocmVzdWx0Lmhvc3QgfHwgcmVsYXRpdmUuaG9zdCkgJiYgKGxhc3QgPT09ICcuJyB8fCBsYXN0ID09PSAnLi4nKSB8fFxuICAgICAgbGFzdCA9PT0gJycpO1xuXG4gIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgIGxhc3QgPSBzcmNQYXRoW2ldO1xuICAgIGlmIChsYXN0ID09ICcuJykge1xuICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICB1cC0tO1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIHRoZSBwYXRoIGlzIGFsbG93ZWQgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIHJlc3RvcmUgbGVhZGluZyAuLnNcbiAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgZm9yICg7IHVwLS07IHVwKSB7XG4gICAgICBzcmNQYXRoLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKG11c3RFbmRBYnMgJiYgc3JjUGF0aFswXSAhPT0gJycgJiZcbiAgICAgICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJBdCgwKSAhPT0gJy8nKSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoaGFzVHJhaWxpbmdTbGFzaCAmJiAoc3JjUGF0aC5qb2luKCcvJykuc3Vic3RyKC0xKSAhPT0gJy8nKSkge1xuICAgIHNyY1BhdGgucHVzaCgnJyk7XG4gIH1cblxuICB2YXIgaXNBYnNvbHV0ZSA9IHNyY1BhdGhbMF0gPT09ICcnIHx8XG4gICAgICAoc3JjUGF0aFswXSAmJiBzcmNQYXRoWzBdLmNoYXJBdCgwKSA9PT0gJy8nKTtcblxuICAvLyBwdXQgdGhlIGhvc3QgYmFja1xuICBpZiAocHN5Y2hvdGljKSB7XG4gICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVzdWx0Lmhvc3QgPSBpc0Fic29sdXRlID8gJycgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3JjUGF0aC5sZW5ndGggPyBzcmNQYXRoLnNoaWZ0KCkgOiAnJztcbiAgICAvL29jY2F0aW9uYWx5IHRoZSBhdXRoIGNhbiBnZXQgc3R1Y2sgb25seSBpbiBob3N0XG4gICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgIHZhciBhdXRoSW5Ib3N0ID0gcmVzdWx0Lmhvc3QgJiYgcmVzdWx0Lmhvc3QuaW5kZXhPZignQCcpID4gMCA/XG4gICAgICAgICAgICAgICAgICAgICByZXN1bHQuaG9zdC5zcGxpdCgnQCcpIDogZmFsc2U7XG4gICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgcmVzdWx0Lmhvc3QgPSByZXN1bHQuaG9zdG5hbWUgPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgfVxuICB9XG5cbiAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICBpZiAobXVzdEVuZEFicyAmJiAhaXNBYnNvbHV0ZSkge1xuICAgIHNyY1BhdGgudW5zaGlmdCgnJyk7XG4gIH1cblxuICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0LnBhdGhuYW1lID0gc3JjUGF0aC5qb2luKCcvJyk7XG4gIH1cblxuICAvL3RvIHN1cHBvcnQgcmVxdWVzdC5odHRwXG4gIGlmICghaXNOdWxsKHJlc3VsdC5wYXRobmFtZSkgfHwgIWlzTnVsbChyZXN1bHQuc2VhcmNoKSkge1xuICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAocmVzdWx0LnNlYXJjaCA/IHJlc3VsdC5zZWFyY2ggOiAnJyk7XG4gIH1cbiAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoIHx8IHJlc3VsdC5hdXRoO1xuICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuVXJsLnByb3RvdHlwZS5wYXJzZUhvc3QgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGhvc3QgPSB0aGlzLmhvc3Q7XG4gIHZhciBwb3J0ID0gcG9ydFBhdHRlcm4uZXhlYyhob3N0KTtcbiAgaWYgKHBvcnQpIHtcbiAgICBwb3J0ID0gcG9ydFswXTtcbiAgICBpZiAocG9ydCAhPT0gJzonKSB7XG4gICAgICB0aGlzLnBvcnQgPSBwb3J0LnN1YnN0cigxKTtcbiAgICB9XG4gICAgaG9zdCA9IGhvc3Quc3Vic3RyKDAsIGhvc3QubGVuZ3RoIC0gcG9ydC5sZW5ndGgpO1xuICB9XG4gIGlmIChob3N0KSB0aGlzLmhvc3RuYW1lID0gaG9zdDtcbn07XG5cbmZ1bmN0aW9uIGlzU3RyaW5nKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gXCJzdHJpbmdcIjtcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmZ1bmN0aW9uIGlzTnVsbE9yVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gIGFyZyA9PSBudWxsO1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2xpYi9qanYuanMnKTtcbiIsIi8qIGpzaGludCBwcm90bzogdHJ1ZSAqL1xuXG4vKipcbiAqIGpqdi5qcyAtLSBBIGphdmFzY3JpcHQgbGlicmFyeSB0byB2YWxpZGF0ZSBqc29uIGlucHV0IHRocm91Z2ggYSBqc29uLXNjaGVtYS5cbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTMgQWxleCBDb3JuZWpvLlxuICpcbiAqIFJlZGlzdHJpYnV0YWJsZSB1bmRlciBhIE1JVC1zdHlsZSBvcGVuIHNvdXJjZSBsaWNlbnNlLlxuICovXG5cbihmdW5jdGlvbiAoKSB7XG4gIHZhciBjbG9uZSA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICAgIC8vIEhhbmRsZSB0aGUgMyBzaW1wbGUgdHlwZXMgKHN0cmluZywgbnVtYmVyLCBmdW5jdGlvbiksIGFuZCBudWxsIG9yIHVuZGVmaW5lZFxuICAgICAgaWYgKG9iaiA9PT0gbnVsbCB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIG9iajtcbiAgICAgIHZhciBjb3B5O1xuXG4gICAgICAvLyBIYW5kbGUgRGF0ZVxuICAgICAgaWYgKG9iaiBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgICBjb3B5ID0gbmV3IERhdGUoKTtcbiAgICAgICAgICBjb3B5LnNldFRpbWUob2JqLmdldFRpbWUoKSk7XG4gICAgICAgICAgcmV0dXJuIGNvcHk7XG4gICAgICB9XG5cbiAgICAgIC8vIGhhbmRsZSBSZWdFeHBcbiAgICAgIGlmIChvYmogaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgICAgY29weSA9IG5ldyBSZWdFeHAob2JqKTtcbiAgICAgICAgcmV0dXJuIGNvcHk7XG4gICAgICB9XG5cbiAgICAgIC8vIEhhbmRsZSBBcnJheVxuICAgICAgaWYgKG9iaiBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgY29weSA9IFtdO1xuICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBvYmoubGVuZ3RoOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgICAgIGNvcHlbaV0gPSBjbG9uZShvYmpbaV0pO1xuICAgICAgICAgIHJldHVybiBjb3B5O1xuICAgICAgfVxuXG4gICAgICAvLyBIYW5kbGUgT2JqZWN0XG4gICAgICBpZiAob2JqIGluc3RhbmNlb2YgT2JqZWN0KSB7XG4gICAgICAgICAgY29weSA9IHt9O1xuLy8gICAgICAgICAgIGNvcHkgPSBPYmplY3QuY3JlYXRlKE9iamVjdC5nZXRQcm90b3R5cGVPZihvYmopKTtcbiAgICAgICAgICBmb3IgKHZhciBhdHRyIGluIG9iaikge1xuICAgICAgICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGF0dHIpKVxuICAgICAgICAgICAgICAgIGNvcHlbYXR0cl0gPSBjbG9uZShvYmpbYXR0cl0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gY29weTtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5hYmxlIHRvIGNsb25lIG9iamVjdCFcIik7XG4gIH07XG5cbiAgdmFyIGNsb25lX3N0YWNrID0gZnVuY3Rpb24gKHN0YWNrKSB7XG4gICAgdmFyIG5ld19zdGFjayA9IFsgY2xvbmUoc3RhY2tbMF0pIF0sIGtleSA9IG5ld19zdGFja1swXS5rZXksIG9iaiA9IG5ld19zdGFja1swXS5vYmplY3Q7XG4gICAgZm9yICh2YXIgaSA9IDEsIGxlbiA9IHN0YWNrLmxlbmd0aDsgaTwgbGVuOyBpKyspIHtcbiAgICAgIG9iaiA9IG9ialtrZXldO1xuICAgICAga2V5ID0gc3RhY2tbaV0ua2V5O1xuICAgICAgbmV3X3N0YWNrLnB1c2goeyBvYmplY3Q6IG9iaiwga2V5OiBrZXkgfSk7XG4gICAgfVxuICAgIHJldHVybiBuZXdfc3RhY2s7XG4gIH07XG5cbiAgdmFyIGNvcHlfc3RhY2sgPSBmdW5jdGlvbiAobmV3X3N0YWNrLCBvbGRfc3RhY2spIHtcbiAgICB2YXIgc3RhY2tfbGFzdCA9IG5ld19zdGFjay5sZW5ndGgtMSwga2V5ID0gbmV3X3N0YWNrW3N0YWNrX2xhc3RdLmtleTtcbiAgICBvbGRfc3RhY2tbc3RhY2tfbGFzdF0ub2JqZWN0W2tleV0gPSBuZXdfc3RhY2tbc3RhY2tfbGFzdF0ub2JqZWN0W2tleV07XG4gIH07XG5cbiAgdmFyIGhhbmRsZWQgPSB7XG4gICAgJ3R5cGUnOiB0cnVlLFxuICAgICdub3QnOiB0cnVlLFxuICAgICdhbnlPZic6IHRydWUsXG4gICAgJ2FsbE9mJzogdHJ1ZSxcbiAgICAnb25lT2YnOiB0cnVlLFxuICAgICckcmVmJzogdHJ1ZSxcbiAgICAnJHNjaGVtYSc6IHRydWUsXG4gICAgJ2lkJzogdHJ1ZSxcbiAgICAnZXhjbHVzaXZlTWF4aW11bSc6IHRydWUsXG4gICAgJ2V4Y2x1c2l2ZU1pbmludW0nOiB0cnVlLFxuICAgICdwcm9wZXJ0aWVzJzogdHJ1ZSxcbiAgICAncGF0dGVyblByb3BlcnRpZXMnOiB0cnVlLFxuICAgICdhZGRpdGlvbmFsUHJvcGVydGllcyc6IHRydWUsXG4gICAgJ2l0ZW1zJzogdHJ1ZSxcbiAgICAnYWRkaXRpb25hbEl0ZW1zJzogdHJ1ZSxcbiAgICAncmVxdWlyZWQnOiB0cnVlLFxuICAgICdkZWZhdWx0JzogdHJ1ZSxcbiAgICAndGl0bGUnOiB0cnVlLFxuICAgICdkZXNjcmlwdGlvbic6IHRydWUsXG4gICAgJ2RlZmluaXRpb25zJzogdHJ1ZSxcbiAgICAnZGVwZW5kZW5jaWVzJzogdHJ1ZVxuICB9O1xuXG4gIHZhciBmaWVsZFR5cGUgPSB7XG4gICAgJ251bGwnOiBmdW5jdGlvbiAoeCkge1xuICAgICAgcmV0dXJuIHggPT09IG51bGw7XG4gICAgfSxcbiAgICAnc3RyaW5nJzogZnVuY3Rpb24gKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ3N0cmluZyc7XG4gICAgfSxcbiAgICAnYm9vbGVhbic6IGZ1bmN0aW9uICh4KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdib29sZWFuJztcbiAgICB9LFxuICAgICdudW1iZXInOiBmdW5jdGlvbiAoeCkge1xuICAgICAgLy8gVXNlIHggPT09IHggaW5zdGVhZCBvZiAhaXNOYU4oeCkgZm9yIHNwZWVkXG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdudW1iZXInICYmIHggPT09IHg7XG4gICAgfSxcbiAgICAnaW50ZWdlcic6IGZ1bmN0aW9uICh4KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdudW1iZXInICYmIHglMSA9PT0gMDtcbiAgICB9LFxuICAgICdvYmplY3QnOiBmdW5jdGlvbiAoeCkge1xuICAgICAgcmV0dXJuIHggJiYgdHlwZW9mIHggPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHgpO1xuICAgIH0sXG4gICAgJ2FycmF5JzogZnVuY3Rpb24gKHgpIHtcbiAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHgpO1xuICAgIH0sXG4gICAgJ2RhdGUnOiBmdW5jdGlvbiAoeCkge1xuICAgICAgcmV0dXJuIHggaW5zdGFuY2VvZiBEYXRlO1xuICAgIH1cbiAgfTtcblxuICAvLyBtaXNzaW5nOiB1cmksIGRhdGUtdGltZSwgaXB2NCwgaXB2NlxuICB2YXIgZmllbGRGb3JtYXQgPSB7XG4gICAgJ2FscGhhJzogZnVuY3Rpb24gKHYpIHtcbiAgICAgIHJldHVybiAoL15bYS16QS1aXSskLykudGVzdCh2KTtcbiAgICB9LFxuICAgICdhbHBoYW51bWVyaWMnOiBmdW5jdGlvbiAodikge1xuICAgICAgcmV0dXJuICgvXlthLXpBLVowLTldKyQvKS50ZXN0KHYpO1xuICAgIH0sXG4gICAgJ2lkZW50aWZpZXInOiBmdW5jdGlvbiAodikge1xuICAgICAgcmV0dXJuICgvXlstX2EtekEtWjAtOV0rJC8pLnRlc3Qodik7XG4gICAgfSxcbiAgICAnaGV4YWRlY2ltYWwnOiBmdW5jdGlvbiAodikge1xuICAgICAgcmV0dXJuICgvXlthLWZBLUYwLTldKyQvKS50ZXN0KHYpO1xuICAgIH0sXG4gICAgJ251bWVyaWMnOiBmdW5jdGlvbiAodikge1xuICAgICAgcmV0dXJuICgvXlswLTldKyQvKS50ZXN0KHYpO1xuICAgIH0sXG4gICAgJ2RhdGUtdGltZSc6IGZ1bmN0aW9uICh2KSB7XG4gICAgICByZXR1cm4gIWlzTmFOKERhdGUucGFyc2UodikpICYmIHYuaW5kZXhPZignLycpID09PSAtMTtcbiAgICB9LFxuICAgICd1cHBlcmNhc2UnOiBmdW5jdGlvbiAodikge1xuICAgICAgcmV0dXJuIHYgPT09IHYudG9VcHBlckNhc2UoKTtcbiAgICB9LFxuICAgICdsb3dlcmNhc2UnOiBmdW5jdGlvbiAodikge1xuICAgICAgcmV0dXJuIHYgPT09IHYudG9Mb3dlckNhc2UoKTtcbiAgICB9LFxuICAgICdob3N0bmFtZSc6IGZ1bmN0aW9uICh2KSB7XG4gICAgICByZXR1cm4gdi5sZW5ndGggPCAyNTYgJiYgKC9eKFthLXpBLVowLTldfFthLXpBLVowLTldW2EtekEtWjAtOVxcLV17MCw2MX1bYS16QS1aMC05XSkoXFwuKFthLXpBLVowLTldfFthLXpBLVowLTldW2EtekEtWjAtOVxcLV17MCw2MX1bYS16QS1aMC05XSkpKiQvKS50ZXN0KHYpO1xuICAgIH0sXG4gICAgJ3VyaSc6IGZ1bmN0aW9uICh2KSB7XG4gICAgICByZXR1cm4gKC9bLWEtekEtWjAtOUA6JV9cXCsufiM/Ji8vPV17MiwyNTZ9XFwuW2Etel17Miw0fVxcYihcXC9bLWEtekEtWjAtOUA6JV9cXCsufiM/Ji8vPV0qKT8vKS50ZXN0KHYpO1xuICAgIH0sXG4gICAgJ2VtYWlsJzogZnVuY3Rpb24gKHYpIHsgLy8gZW1haWwsIGlwdjQgYW5kIGlwdjYgYWRhcHRlZCBmcm9tIG5vZGUtdmFsaWRhdG9yXG4gICAgICByZXR1cm4gKC9eKD86W1xcd1xcIVxcI1xcJFxcJVxcJlxcJ1xcKlxcK1xcLVxcL1xcPVxcP1xcXlxcYFxce1xcfFxcfVxcfl0rXFwuKSpbXFx3XFwhXFwjXFwkXFwlXFwmXFwnXFwqXFwrXFwtXFwvXFw9XFw/XFxeXFxgXFx7XFx8XFx9XFx+XStAKD86KD86KD86W2EtekEtWjAtOV0oPzpbYS16QS1aMC05XFwtXSg/IVxcLikpezAsNjF9W2EtekEtWjAtOV0/XFwuKStbYS16QS1aMC05XSg/OlthLXpBLVowLTlcXC1dKD8hJCkpezAsNjF9W2EtekEtWjAtOV0/KXwoPzpcXFsoPzooPzpbMDFdP1xcZHsxLDJ9fDJbMC00XVxcZHwyNVswLTVdKVxcLil7M30oPzpbMDFdP1xcZHsxLDJ9fDJbMC00XVxcZHwyNVswLTVdKVxcXSkpJC8pLnRlc3Qodik7XG4gICAgfSxcbiAgICAnaXB2NCc6IGZ1bmN0aW9uICh2KSB7XG4gICAgICBpZiAoKC9eKFxcZD9cXGQ/XFxkKVxcLihcXGQ/XFxkP1xcZClcXC4oXFxkP1xcZD9cXGQpXFwuKFxcZD9cXGQ/XFxkKSQvKS50ZXN0KHYpKSB7XG4gICAgICAgIHZhciBwYXJ0cyA9IHYuc3BsaXQoJy4nKS5zb3J0KCk7XG4gICAgICAgIGlmIChwYXJ0c1szXSA8PSAyNTUpXG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSxcbiAgICAnaXB2Nic6IGZ1bmN0aW9uKHYpIHtcbiAgICAgIHJldHVybiAoL14oKD89Lio6OikoPyEuKjo6Lis6OikoOjopPyhbXFxkQS1GXXsxLDR9Oig6fFxcYil8KXs1fXwoW1xcZEEtRl17MSw0fTopezZ9KSgoKFtcXGRBLUZdezEsNH0oKD8hXFwzKTo6fDpcXGJ8JCkpfCg/IVxcMlxcMykpezJ9fCgoKDJbMC00XXwxXFxkfFsxLTldKT9cXGR8MjVbMC01XSlcXC4/XFxiKXs0fSkkLykudGVzdCh2KTtcbiAgICAgLyogIHJldHVybiAoL146OnxeOjoxfF4oW2EtZkEtRjAtOV17MSw0fTo6Pyl7MSw3fShbYS1mQS1GMC05XXsxLDR9KSQvKS50ZXN0KHYpOyAqL1xuICAgIH1cbiAgfTtcblxuICB2YXIgZmllbGRWYWxpZGF0ZSA9IHtcbiAgICAncmVhZE9ubHknOiBmdW5jdGlvbiAodiwgcCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0sXG4gICAgLy8gKioqKioqIG51bWVyaWMgdmFsaWRhdGlvbiAqKioqKioqKlxuICAgICdtaW5pbXVtJzogZnVuY3Rpb24gKHYsIHAsIHNjaGVtYSkge1xuICAgICAgcmV0dXJuICEodiA8IHAgfHwgc2NoZW1hLmV4Y2x1c2l2ZU1pbmltdW0gJiYgdiA8PSBwKTtcbiAgICB9LFxuICAgICdtYXhpbXVtJzogZnVuY3Rpb24gKHYsIHAsIHNjaGVtYSkge1xuICAgICAgcmV0dXJuICEodiA+IHAgfHwgc2NoZW1hLmV4Y2x1c2l2ZU1heGltdW0gJiYgdiA+PSBwKTtcbiAgICB9LFxuICAgICdtdWx0aXBsZU9mJzogZnVuY3Rpb24gKHYsIHApIHtcbiAgICAgIHJldHVybiAodi9wKSUxID09PSAwIHx8IHR5cGVvZiB2ICE9PSAnbnVtYmVyJztcbiAgICB9LFxuICAgIC8vICoqKioqKiBzdHJpbmcgdmFsaWRhdGlvbiAqKioqKipcbiAgICAncGF0dGVybic6IGZ1bmN0aW9uICh2LCBwKSB7XG4gICAgICBpZiAodHlwZW9mIHYgIT09ICdzdHJpbmcnKVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIHZhciBwYXR0ZXJuLCBtb2RpZmllcnM7XG4gICAgICBpZiAodHlwZW9mIHAgPT09ICdzdHJpbmcnKVxuICAgICAgICBwYXR0ZXJuPXA7XG4gICAgICBlbHNlIHtcbiAgICAgICAgcGF0dGVybj1wWzBdO1xuICAgICAgICBtb2RpZmllcnM9cFsxXTtcbiAgICAgIH1cbiAgICAgIHZhciByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybiwgbW9kaWZpZXJzKTtcbiAgICAgIHJldHVybiByZWdleC50ZXN0KHYpO1xuICAgIH0sXG4gICAgJ21pbkxlbmd0aCc6IGZ1bmN0aW9uICh2LCBwKSB7XG4gICAgICByZXR1cm4gdi5sZW5ndGggPj0gcCB8fCB0eXBlb2YgdiAhPT0gJ3N0cmluZyc7XG4gICAgfSxcbiAgICAnbWF4TGVuZ3RoJzogZnVuY3Rpb24gKHYsIHApIHtcbiAgICAgIHJldHVybiB2Lmxlbmd0aCA8PSBwIHx8IHR5cGVvZiB2ICE9PSAnc3RyaW5nJztcbiAgICB9LFxuICAgIC8vICoqKioqIGFycmF5IHZhbGlkYXRpb24gKioqKipcbiAgICAnbWluSXRlbXMnOiBmdW5jdGlvbiAodiwgcCkge1xuICAgICAgcmV0dXJuIHYubGVuZ3RoID49IHAgfHwgIUFycmF5LmlzQXJyYXkodik7XG4gICAgfSxcbiAgICAnbWF4SXRlbXMnOiBmdW5jdGlvbiAodiwgcCkge1xuICAgICAgcmV0dXJuIHYubGVuZ3RoIDw9IHAgfHwgIUFycmF5LmlzQXJyYXkodik7XG4gICAgfSxcbiAgICAndW5pcXVlSXRlbXMnOiBmdW5jdGlvbiAodiwgcCkge1xuICAgICAgdmFyIGhhc2ggPSB7fSwga2V5O1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHYubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAga2V5ID0gSlNPTi5zdHJpbmdpZnkodltpXSk7XG4gICAgICAgIGlmIChoYXNoLmhhc093blByb3BlcnR5KGtleSkpXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgaGFzaFtrZXldID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0sXG4gICAgLy8gKioqKiogb2JqZWN0IHZhbGlkYXRpb24gKioqKlxuICAgICdtaW5Qcm9wZXJ0aWVzJzogZnVuY3Rpb24gKHYsIHApIHtcbiAgICAgIGlmICh0eXBlb2YgdiAhPT0gJ29iamVjdCcpXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgdmFyIGNvdW50ID0gMDtcbiAgICAgIGZvciAodmFyIGF0dHIgaW4gdikgaWYgKHYuaGFzT3duUHJvcGVydHkoYXR0cikpIGNvdW50ID0gY291bnQgKyAxO1xuICAgICAgcmV0dXJuIGNvdW50ID49IHA7XG4gICAgfSxcbiAgICAnbWF4UHJvcGVydGllcyc6IGZ1bmN0aW9uICh2LCBwKSB7XG4gICAgICBpZiAodHlwZW9mIHYgIT09ICdvYmplY3QnKVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIHZhciBjb3VudCA9IDA7XG4gICAgICBmb3IgKHZhciBhdHRyIGluIHYpIGlmICh2Lmhhc093blByb3BlcnR5KGF0dHIpKSBjb3VudCA9IGNvdW50ICsgMTtcbiAgICAgIHJldHVybiBjb3VudCA8PSBwO1xuICAgIH0sXG4gICAgLy8gKioqKioqIGFsbCAqKioqKlxuICAgICdjb25zdGFudCc6IGZ1bmN0aW9uICh2LCBwKSB7XG4gICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodikgPT0gSlNPTi5zdHJpbmdpZnkocCk7XG4gICAgfSxcbiAgICAnZW51bSc6IGZ1bmN0aW9uICh2LCBwKSB7XG4gICAgICB2YXIgaSwgbGVuLCB2cztcbiAgICAgIGlmICh0eXBlb2YgdiA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgdnMgPSBKU09OLnN0cmluZ2lmeSh2KTtcbiAgICAgICAgZm9yIChpID0gMCwgbGVuID0gcC5sZW5ndGg7IGkgPCBsZW47IGkrKylcbiAgICAgICAgICBpZiAodnMgPT09IEpTT04uc3RyaW5naWZ5KHBbaV0pKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBwLmxlbmd0aDsgaSA8IGxlbjsgaSsrKVxuICAgICAgICAgIGlmICh2ID09PSBwW2ldKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9O1xuXG4gIHZhciBub3JtYWxpemVJRCA9IGZ1bmN0aW9uIChpZCkge1xuICAgIHJldHVybiBpZC5pbmRleE9mKFwiOi8vXCIpID09PSAtMSA/IGlkIDogaWQuc3BsaXQoXCIjXCIpWzBdO1xuICB9O1xuXG4gIHZhciByZXNvbHZlVVJJID0gZnVuY3Rpb24gKGVudiwgc2NoZW1hX3N0YWNrLCB1cmkpIHtcbiAgICB2YXIgY3Vyc2NoZW1hLCBjb21wb25lbnRzLCBoYXNoX2lkeCwgbmFtZTtcblxuICAgIGhhc2hfaWR4ID0gdXJpLmluZGV4T2YoJyMnKTtcblxuICAgIGlmIChoYXNoX2lkeCA9PT0gLTEpIHtcbiAgICAgIGlmICghZW52LnNjaGVtYS5oYXNPd25Qcm9wZXJ0eSh1cmkpKVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIHJldHVybiBbZW52LnNjaGVtYVt1cmldXTtcbiAgICB9XG5cbiAgICBpZiAoaGFzaF9pZHggPiAwKSB7XG4gICAgICBuYW1lID0gdXJpLnN1YnN0cigwLCBoYXNoX2lkeCk7XG4gICAgICB1cmkgPSB1cmkuc3Vic3RyKGhhc2hfaWR4KzEpO1xuICAgICAgaWYgKCFlbnYuc2NoZW1hLmhhc093blByb3BlcnR5KG5hbWUpKSB7XG4gICAgICAgIGlmIChzY2hlbWFfc3RhY2sgJiYgc2NoZW1hX3N0YWNrWzBdLmlkID09PSBuYW1lKVxuICAgICAgICAgIHNjaGVtYV9zdGFjayA9IFtzY2hlbWFfc3RhY2tbMF1dO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9IGVsc2VcbiAgICAgICAgc2NoZW1hX3N0YWNrID0gW2Vudi5zY2hlbWFbbmFtZV1dO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIXNjaGVtYV9zdGFjaylcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB1cmkgPSB1cmkuc3Vic3RyKDEpO1xuICAgIH1cblxuICAgIGlmICh1cmkgPT09ICcnKVxuICAgICAgcmV0dXJuIFtzY2hlbWFfc3RhY2tbMF1dO1xuXG4gICAgaWYgKHVyaS5jaGFyQXQoMCkgPT09ICcvJykge1xuICAgICAgdXJpID0gdXJpLnN1YnN0cigxKTtcbiAgICAgIGN1cnNjaGVtYSA9IHNjaGVtYV9zdGFja1swXTtcbiAgICAgIGNvbXBvbmVudHMgPSB1cmkuc3BsaXQoJy8nKTtcbiAgICAgIHdoaWxlIChjb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgaWYgKCFjdXJzY2hlbWEuaGFzT3duUHJvcGVydHkoY29tcG9uZW50c1swXSkpXG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIGN1cnNjaGVtYSA9IGN1cnNjaGVtYVtjb21wb25lbnRzWzBdXTtcbiAgICAgICAgc2NoZW1hX3N0YWNrLnB1c2goY3Vyc2NoZW1hKTtcbiAgICAgICAgY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNjaGVtYV9zdGFjaztcbiAgICB9IGVsc2UgLy8gRklYOiBzaG91bGQgbG9vayBmb3Igc3Vic2NoZW1hcyB3aG9zZSBpZCBtYXRjaGVzIHVyaVxuICAgICAgcmV0dXJuIG51bGw7XG4gIH07XG5cbiAgdmFyIHJlc29sdmVPYmplY3RSZWYgPSBmdW5jdGlvbiAob2JqZWN0X3N0YWNrLCB1cmkpIHtcbiAgICB2YXIgY29tcG9uZW50cywgb2JqZWN0LCBsYXN0X2ZyYW1lID0gb2JqZWN0X3N0YWNrLmxlbmd0aC0xLCBza2lwX2ZyYW1lcywgZnJhbWUsIG0gPSAvXihcXGQrKS8uZXhlYyh1cmkpO1xuXG4gICAgaWYgKG0pIHtcbiAgICAgIHVyaSA9IHVyaS5zdWJzdHIobVswXS5sZW5ndGgpO1xuICAgICAgc2tpcF9mcmFtZXMgPSBwYXJzZUludChtWzFdLCAxMCk7XG4gICAgICBpZiAoc2tpcF9mcmFtZXMgPCAwIHx8IHNraXBfZnJhbWVzID4gbGFzdF9mcmFtZSlcbiAgICAgICAgcmV0dXJuO1xuICAgICAgZnJhbWUgPSBvYmplY3Rfc3RhY2tbbGFzdF9mcmFtZS1za2lwX2ZyYW1lc107XG4gICAgICBpZiAodXJpID09PSAnIycpXG4gICAgICAgIHJldHVybiBmcmFtZS5rZXk7XG4gICAgfSBlbHNlXG4gICAgICBmcmFtZSA9IG9iamVjdF9zdGFja1swXTtcblxuICAgIG9iamVjdCA9IGZyYW1lLm9iamVjdFtmcmFtZS5rZXldO1xuXG4gICAgaWYgKHVyaSA9PT0gJycpXG4gICAgICByZXR1cm4gb2JqZWN0O1xuXG4gICAgaWYgKHVyaS5jaGFyQXQoMCkgPT09ICcvJykge1xuICAgICAgdXJpID0gdXJpLnN1YnN0cigxKTtcbiAgICAgIGNvbXBvbmVudHMgPSB1cmkuc3BsaXQoJy8nKTtcbiAgICAgIHdoaWxlIChjb21wb25lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29tcG9uZW50c1swXSA9IGNvbXBvbmVudHNbMF0ucmVwbGFjZSgvfjEvZywgJy8nKS5yZXBsYWNlKC9+MC9nLCAnficpO1xuICAgICAgICBpZiAoIW9iamVjdC5oYXNPd25Qcm9wZXJ0eShjb21wb25lbnRzWzBdKSlcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIG9iamVjdCA9IG9iamVjdFtjb21wb25lbnRzWzBdXTtcbiAgICAgICAgY29tcG9uZW50cy5zaGlmdCgpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICB9IGVsc2VcbiAgICAgIHJldHVybjtcbiAgfTtcblxuICB2YXIgY2hlY2tWYWxpZGl0eSA9IGZ1bmN0aW9uIChlbnYsIHNjaGVtYV9zdGFjaywgb2JqZWN0X3N0YWNrLCBvcHRpb25zKSB7XG4gICAgdmFyIGksIGxlbiwgY291bnQsIGhhc1Byb3AsIGhhc1BhdHRlcm47XG4gICAgdmFyIHAsIHYsIG1hbGZvcm1lZCA9IGZhbHNlLCBvYmplcnJzID0ge30sIG9iamVyciwgcHJvcHMsIG1hdGNoZWQ7XG4gICAgdmFyIHNsID0gc2NoZW1hX3N0YWNrLmxlbmd0aC0xLCBzY2hlbWEgPSBzY2hlbWFfc3RhY2tbc2xdLCBuZXdfc3RhY2s7XG4gICAgdmFyIG9sID0gb2JqZWN0X3N0YWNrLmxlbmd0aC0xLCBvYmplY3QgPSBvYmplY3Rfc3RhY2tbb2xdLm9iamVjdCwgbmFtZSA9IG9iamVjdF9zdGFja1tvbF0ua2V5LCBwcm9wID0gb2JqZWN0W25hbWVdO1xuICAgIHZhciBlcnJDb3VudCwgbWluRXJyQ291bnQ7XG5cbiAgICBpZiAoc2NoZW1hLmhhc093blByb3BlcnR5KCckcmVmJykpIHtcbiAgICAgIHNjaGVtYV9zdGFjaz0gcmVzb2x2ZVVSSShlbnYsIHNjaGVtYV9zdGFjaywgc2NoZW1hLiRyZWYpO1xuICAgICAgaWYgKCFzY2hlbWFfc3RhY2spXG4gICAgICAgIHJldHVybiB7JyRyZWYnOiBzY2hlbWEuJHJlZn07XG4gICAgICBlbHNlXG4gICAgICAgIHJldHVybiBjaGVja1ZhbGlkaXR5KGVudiwgc2NoZW1hX3N0YWNrLCBvYmplY3Rfc3RhY2ssIG9wdGlvbnMpO1xuICAgIH1cblxuICAgIGlmIChzY2hlbWEuaGFzT3duUHJvcGVydHkoJ3R5cGUnKSkge1xuICAgICAgaWYgKHR5cGVvZiBzY2hlbWEudHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMudXNlQ29lcmNlICYmIGVudi5jb2VyY2VUeXBlLmhhc093blByb3BlcnR5KHNjaGVtYS50eXBlKSlcbiAgICAgICAgICBwcm9wID0gb2JqZWN0W25hbWVdID0gZW52LmNvZXJjZVR5cGVbc2NoZW1hLnR5cGVdKHByb3ApO1xuICAgICAgICBpZiAoIWVudi5maWVsZFR5cGVbc2NoZW1hLnR5cGVdKHByb3ApKVxuICAgICAgICAgIHJldHVybiB7J3R5cGUnOiBzY2hlbWEudHlwZX07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtYWxmb3JtZWQgPSB0cnVlO1xuICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBzY2hlbWEudHlwZS5sZW5ndGg7IGkgPCBsZW4gJiYgbWFsZm9ybWVkOyBpKyspXG4gICAgICAgICAgaWYgKGVudi5maWVsZFR5cGVbc2NoZW1hLnR5cGVbaV1dKHByb3ApKVxuICAgICAgICAgICAgbWFsZm9ybWVkID0gZmFsc2U7XG4gICAgICAgIGlmIChtYWxmb3JtZWQpXG4gICAgICAgICAgcmV0dXJuIHsndHlwZSc6IHNjaGVtYS50eXBlfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc2NoZW1hLmhhc093blByb3BlcnR5KCdhbGxPZicpKSB7XG4gICAgICBmb3IgKGkgPSAwLCBsZW4gPSBzY2hlbWEuYWxsT2YubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgb2JqZXJyID0gY2hlY2tWYWxpZGl0eShlbnYsIHNjaGVtYV9zdGFjay5jb25jYXQoc2NoZW1hLmFsbE9mW2ldKSwgb2JqZWN0X3N0YWNrLCBvcHRpb25zKTtcbiAgICAgICAgaWYgKG9iamVycilcbiAgICAgICAgICByZXR1cm4gb2JqZXJyO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghb3B0aW9ucy51c2VDb2VyY2UgJiYgIW9wdGlvbnMudXNlRGVmYXVsdCAmJiAhb3B0aW9ucy5yZW1vdmVBZGRpdGlvbmFsKSB7XG4gICAgICBpZiAoc2NoZW1hLmhhc093blByb3BlcnR5KCdvbmVPZicpKSB7XG4gICAgICAgIG1pbkVyckNvdW50ID0gSW5maW5pdHk7XG4gICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHNjaGVtYS5vbmVPZi5sZW5ndGgsIGNvdW50ID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgb2JqZXJyID0gY2hlY2tWYWxpZGl0eShlbnYsIHNjaGVtYV9zdGFjay5jb25jYXQoc2NoZW1hLm9uZU9mW2ldKSwgb2JqZWN0X3N0YWNrLCBvcHRpb25zKTtcbiAgICAgICAgICBpZiAoIW9iamVycikge1xuICAgICAgICAgICAgY291bnQgPSBjb3VudCArIDE7XG4gICAgICAgICAgICBpZiAoY291bnQgPiAxKVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyQ291bnQgPSBvYmplcnIuc2NoZW1hID8gT2JqZWN0LmtleXMob2JqZXJyLnNjaGVtYSkubGVuZ3RoIDogMTtcbiAgICAgICAgICAgIGlmIChlcnJDb3VudCA8IG1pbkVyckNvdW50KSB7XG4gICAgICAgICAgICAgICAgbWluRXJyQ291bnQgPSBlcnJDb3VudDtcbiAgICAgICAgICAgICAgICBvYmplcnJzID0gb2JqZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoY291bnQgPiAxKVxuICAgICAgICAgIHJldHVybiB7J29uZU9mJzogdHJ1ZX07XG4gICAgICAgIGVsc2UgaWYgKGNvdW50IDwgMSlcbiAgICAgICAgICByZXR1cm4gb2JqZXJycztcbiAgICAgICAgb2JqZXJycyA9IHt9O1xuICAgICAgfVxuXG4gICAgICBpZiAoc2NoZW1hLmhhc093blByb3BlcnR5KCdhbnlPZicpKSB7XG4gICAgICAgIG9iamVycnMgPSBudWxsO1xuICAgICAgICBtaW5FcnJDb3VudCA9IEluZmluaXR5O1xuICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBzY2hlbWEuYW55T2YubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICBvYmplcnIgPSBjaGVja1ZhbGlkaXR5KGVudiwgc2NoZW1hX3N0YWNrLmNvbmNhdChzY2hlbWEuYW55T2ZbaV0pLCBvYmplY3Rfc3RhY2ssIG9wdGlvbnMpO1xuICAgICAgICAgIGlmICghb2JqZXJyKSB7XG4gICAgICAgICAgICBvYmplcnJzID0gbnVsbDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGVyckNvdW50ID0gb2JqZXJyLnNjaGVtYSA/IE9iamVjdC5rZXlzKG9iamVyci5zY2hlbWEpLmxlbmd0aCA6IDE7XG4gICAgICAgICAgICBpZiAoZXJyQ291bnQgPCBtaW5FcnJDb3VudCkge1xuICAgICAgICAgICAgICAgIG1pbkVyckNvdW50ID0gZXJyQ291bnQ7XG4gICAgICAgICAgICAgICAgb2JqZXJycyA9IG9iamVycjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9iamVycnMpXG4gICAgICAgICAgcmV0dXJuIG9iamVycnM7XG4gICAgICB9XG5cbiAgICAgIGlmIChzY2hlbWEuaGFzT3duUHJvcGVydHkoJ25vdCcpKSB7XG4gICAgICAgIG9iamVyciA9IGNoZWNrVmFsaWRpdHkoZW52LCBzY2hlbWFfc3RhY2suY29uY2F0KHNjaGVtYS5ub3QpLCBvYmplY3Rfc3RhY2ssIG9wdGlvbnMpO1xuICAgICAgICBpZiAoIW9iamVycilcbiAgICAgICAgICByZXR1cm4geydub3QnOiB0cnVlfTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHNjaGVtYS5oYXNPd25Qcm9wZXJ0eSgnb25lT2YnKSkge1xuICAgICAgICBtaW5FcnJDb3VudCA9IEluZmluaXR5O1xuICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBzY2hlbWEub25lT2YubGVuZ3RoLCBjb3VudCA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgIG5ld19zdGFjayA9IGNsb25lX3N0YWNrKG9iamVjdF9zdGFjayk7XG4gICAgICAgICAgb2JqZXJyID0gY2hlY2tWYWxpZGl0eShlbnYsIHNjaGVtYV9zdGFjay5jb25jYXQoc2NoZW1hLm9uZU9mW2ldKSwgbmV3X3N0YWNrLCBvcHRpb25zKTtcbiAgICAgICAgICBpZiAoIW9iamVycikge1xuICAgICAgICAgICAgY291bnQgPSBjb3VudCArIDE7XG4gICAgICAgICAgICBpZiAoY291bnQgPiAxKVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgY29weV9zdGFjayhuZXdfc3RhY2ssIG9iamVjdF9zdGFjayk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVyckNvdW50ID0gb2JqZXJyLnNjaGVtYSA/IE9iamVjdC5rZXlzKG9iamVyci5zY2hlbWEpLmxlbmd0aCA6IDE7XG4gICAgICAgICAgICBpZiAoZXJyQ291bnQgPCBtaW5FcnJDb3VudCkge1xuICAgICAgICAgICAgICAgIG1pbkVyckNvdW50ID0gZXJyQ291bnQ7XG4gICAgICAgICAgICAgICAgb2JqZXJycyA9IG9iamVycjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNvdW50ID4gMSlcbiAgICAgICAgICByZXR1cm4geydvbmVPZic6IHRydWV9O1xuICAgICAgICBlbHNlIGlmIChjb3VudCA8IDEpXG4gICAgICAgICAgcmV0dXJuIG9iamVycnM7XG4gICAgICAgIG9iamVycnMgPSB7fTtcbiAgICAgIH1cblxuICAgICAgaWYgKHNjaGVtYS5oYXNPd25Qcm9wZXJ0eSgnYW55T2YnKSkge1xuICAgICAgICBvYmplcnJzID0gbnVsbDtcbiAgICAgICAgbWluRXJyQ291bnQgPSBJbmZpbml0eTtcbiAgICAgICAgZm9yIChpID0gMCwgbGVuID0gc2NoZW1hLmFueU9mLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgbmV3X3N0YWNrID0gY2xvbmVfc3RhY2sob2JqZWN0X3N0YWNrKTtcbiAgICAgICAgICBvYmplcnIgPSBjaGVja1ZhbGlkaXR5KGVudiwgc2NoZW1hX3N0YWNrLmNvbmNhdChzY2hlbWEuYW55T2ZbaV0pLCBuZXdfc3RhY2ssIG9wdGlvbnMpO1xuICAgICAgICAgIGlmICghb2JqZXJyKSB7XG4gICAgICAgICAgICBjb3B5X3N0YWNrKG5ld19zdGFjaywgb2JqZWN0X3N0YWNrKTtcbiAgICAgICAgICAgIG9iamVycnMgPSBudWxsO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZXJyQ291bnQgPSBvYmplcnIuc2NoZW1hID8gT2JqZWN0LmtleXMob2JqZXJyLnNjaGVtYSkubGVuZ3RoIDogMTtcbiAgICAgICAgICAgIGlmIChlcnJDb3VudCA8IG1pbkVyckNvdW50KSB7XG4gICAgICAgICAgICAgICAgbWluRXJyQ291bnQgPSBlcnJDb3VudDtcbiAgICAgICAgICAgICAgICBvYmplcnJzID0gb2JqZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob2JqZXJycylcbiAgICAgICAgICByZXR1cm4gb2JqZXJycztcbiAgICAgIH1cblxuICAgICAgaWYgKHNjaGVtYS5oYXNPd25Qcm9wZXJ0eSgnbm90JykpIHtcbiAgICAgICAgbmV3X3N0YWNrID0gY2xvbmVfc3RhY2sob2JqZWN0X3N0YWNrKTtcbiAgICAgICAgb2JqZXJyID0gY2hlY2tWYWxpZGl0eShlbnYsIHNjaGVtYV9zdGFjay5jb25jYXQoc2NoZW1hLm5vdCksIG5ld19zdGFjaywgb3B0aW9ucyk7XG4gICAgICAgIGlmICghb2JqZXJyKVxuICAgICAgICAgIHJldHVybiB7J25vdCc6IHRydWV9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzY2hlbWEuaGFzT3duUHJvcGVydHkoJ2RlcGVuZGVuY2llcycpKSB7XG4gICAgICBmb3IgKHAgaW4gc2NoZW1hLmRlcGVuZGVuY2llcylcbiAgICAgICAgaWYgKHNjaGVtYS5kZXBlbmRlbmNpZXMuaGFzT3duUHJvcGVydHkocCkgJiYgcHJvcC5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHNjaGVtYS5kZXBlbmRlbmNpZXNbcF0pKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBzY2hlbWEuZGVwZW5kZW5jaWVzW3BdLmxlbmd0aDsgaSA8IGxlbjsgaSsrKVxuICAgICAgICAgICAgICBpZiAoIXByb3AuaGFzT3duUHJvcGVydHkoc2NoZW1hLmRlcGVuZGVuY2llc1twXVtpXSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geydkZXBlbmRlbmNpZXMnOiB0cnVlfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBvYmplcnIgPSBjaGVja1ZhbGlkaXR5KGVudiwgc2NoZW1hX3N0YWNrLmNvbmNhdChzY2hlbWEuZGVwZW5kZW5jaWVzW3BdKSwgb2JqZWN0X3N0YWNrLCBvcHRpb25zKTtcbiAgICAgICAgICAgIGlmIChvYmplcnIpXG4gICAgICAgICAgICAgIHJldHVybiBvYmplcnI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHByb3ApKSB7XG4gICAgICBwcm9wcyA9IFtdO1xuICAgICAgb2JqZXJycyA9IHt9O1xuICAgICAgZm9yIChwIGluIHByb3ApXG4gICAgICAgIGlmIChwcm9wLmhhc093blByb3BlcnR5KHApKVxuICAgICAgICAgIHByb3BzLnB1c2gocCk7XG5cbiAgICAgIGlmIChvcHRpb25zLmNoZWNrUmVxdWlyZWQgJiYgc2NoZW1hLnJlcXVpcmVkKSB7XG4gICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHNjaGVtYS5yZXF1aXJlZC5sZW5ndGg7IGkgPCBsZW47IGkrKylcbiAgICAgICAgICBpZiAoIXByb3AuaGFzT3duUHJvcGVydHkoc2NoZW1hLnJlcXVpcmVkW2ldKSkge1xuICAgICAgICAgICAgb2JqZXJyc1tzY2hlbWEucmVxdWlyZWRbaV1dID0geydyZXF1aXJlZCc6IHRydWV9O1xuICAgICAgICAgICAgbWFsZm9ybWVkID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGhhc1Byb3AgPSBzY2hlbWEuaGFzT3duUHJvcGVydHkoJ3Byb3BlcnRpZXMnKTtcbiAgICAgIGhhc1BhdHRlcm4gPSBzY2hlbWEuaGFzT3duUHJvcGVydHkoJ3BhdHRlcm5Qcm9wZXJ0aWVzJyk7XG4gICAgICBpZiAoaGFzUHJvcCB8fCBoYXNQYXR0ZXJuKSB7XG4gICAgICAgIGkgPSBwcm9wcy5sZW5ndGg7XG4gICAgICAgIHdoaWxlIChpLS0pIHtcbiAgICAgICAgICBtYXRjaGVkID0gZmFsc2U7XG4gICAgICAgICAgaWYgKGhhc1Byb3AgJiYgc2NoZW1hLnByb3BlcnRpZXMuaGFzT3duUHJvcGVydHkocHJvcHNbaV0pKSB7XG4gICAgICAgICAgICBtYXRjaGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIG9iamVyciA9IGNoZWNrVmFsaWRpdHkoZW52LCBzY2hlbWFfc3RhY2suY29uY2F0KHNjaGVtYS5wcm9wZXJ0aWVzW3Byb3BzW2ldXSksIG9iamVjdF9zdGFjay5jb25jYXQoe29iamVjdDogcHJvcCwga2V5OiBwcm9wc1tpXX0pLCBvcHRpb25zKTtcbiAgICAgICAgICAgIGlmIChvYmplcnIgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgb2JqZXJyc1twcm9wc1tpXV0gPSBvYmplcnI7XG4gICAgICAgICAgICAgIG1hbGZvcm1lZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChoYXNQYXR0ZXJuKSB7XG4gICAgICAgICAgICBmb3IgKHAgaW4gc2NoZW1hLnBhdHRlcm5Qcm9wZXJ0aWVzKVxuICAgICAgICAgICAgICBpZiAoc2NoZW1hLnBhdHRlcm5Qcm9wZXJ0aWVzLmhhc093blByb3BlcnR5KHApICYmIHByb3BzW2ldLm1hdGNoKHApKSB7XG4gICAgICAgICAgICAgICAgbWF0Y2hlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgb2JqZXJyID0gY2hlY2tWYWxpZGl0eShlbnYsIHNjaGVtYV9zdGFjay5jb25jYXQoc2NoZW1hLnBhdHRlcm5Qcm9wZXJ0aWVzW3BdKSwgb2JqZWN0X3N0YWNrLmNvbmNhdCh7b2JqZWN0OiBwcm9wLCBrZXk6IHByb3BzW2ldfSksIG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGlmIChvYmplcnIgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgIG9iamVycnNbcHJvcHNbaV1dID0gb2JqZXJyO1xuICAgICAgICAgICAgICAgICAgbWFsZm9ybWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKG1hdGNoZWQpXG4gICAgICAgICAgICBwcm9wcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMudXNlRGVmYXVsdCAmJiBoYXNQcm9wICYmICFtYWxmb3JtZWQpIHtcbiAgICAgICAgZm9yIChwIGluIHNjaGVtYS5wcm9wZXJ0aWVzKVxuICAgICAgICAgIGlmIChzY2hlbWEucHJvcGVydGllcy5oYXNPd25Qcm9wZXJ0eShwKSAmJiAhcHJvcC5oYXNPd25Qcm9wZXJ0eShwKSAmJiBzY2hlbWEucHJvcGVydGllc1twXS5oYXNPd25Qcm9wZXJ0eSgnZGVmYXVsdCcpKVxuICAgICAgICAgICAgcHJvcFtwXSA9IHNjaGVtYS5wcm9wZXJ0aWVzW3BdWydkZWZhdWx0J107XG4gICAgICB9XG5cbiAgICAgIGlmIChvcHRpb25zLnJlbW92ZUFkZGl0aW9uYWwgJiYgaGFzUHJvcCAmJiBzY2hlbWEuYWRkaXRpb25hbFByb3BlcnRpZXMgIT09IHRydWUgJiYgdHlwZW9mIHNjaGVtYS5hZGRpdGlvbmFsUHJvcGVydGllcyAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgZm9yIChpID0gMCwgbGVuID0gcHJvcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgZGVsZXRlIHByb3BbcHJvcHNbaV1dO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKHNjaGVtYS5oYXNPd25Qcm9wZXJ0eSgnYWRkaXRpb25hbFByb3BlcnRpZXMnKSkge1xuICAgICAgICAgIGlmICh0eXBlb2Ygc2NoZW1hLmFkZGl0aW9uYWxQcm9wZXJ0aWVzID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIGlmICghc2NoZW1hLmFkZGl0aW9uYWxQcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHByb3BzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgb2JqZXJyc1twcm9wc1tpXV0gPSB7J2FkZGl0aW9uYWwnOiB0cnVlfTtcbiAgICAgICAgICAgICAgICBtYWxmb3JtZWQgPSB0cnVlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHByb3BzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgIG9iamVyciA9IGNoZWNrVmFsaWRpdHkoZW52LCBzY2hlbWFfc3RhY2suY29uY2F0KHNjaGVtYS5hZGRpdGlvbmFsUHJvcGVydGllcyksIG9iamVjdF9zdGFjay5jb25jYXQoe29iamVjdDogcHJvcCwga2V5OiBwcm9wc1tpXX0pLCBvcHRpb25zKTtcbiAgICAgICAgICAgICAgaWYgKG9iamVyciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIG9iamVycnNbcHJvcHNbaV1dID0gb2JqZXJyO1xuICAgICAgICAgICAgICAgIG1hbGZvcm1lZCA9IHRydWU7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChtYWxmb3JtZWQpXG4gICAgICAgIHJldHVybiB7J3NjaGVtYSc6IG9iamVycnN9O1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoc2NoZW1hLmhhc093blByb3BlcnR5KCdpdGVtcycpKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHNjaGVtYS5pdGVtcykpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBzY2hlbWEuaXRlbXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIG9iamVyciA9IGNoZWNrVmFsaWRpdHkoZW52LCBzY2hlbWFfc3RhY2suY29uY2F0KHNjaGVtYS5pdGVtc1tpXSksIG9iamVjdF9zdGFjay5jb25jYXQoe29iamVjdDogcHJvcCwga2V5OiBpfSksIG9wdGlvbnMpO1xuICAgICAgICAgICAgaWYgKG9iamVyciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICBvYmplcnJzW2ldID0gb2JqZXJyO1xuICAgICAgICAgICAgICBtYWxmb3JtZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocHJvcC5sZW5ndGggPiBsZW4gJiYgc2NoZW1hLmhhc093blByb3BlcnR5KCdhZGRpdGlvbmFsSXRlbXMnKSkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzY2hlbWEuYWRkaXRpb25hbEl0ZW1zID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgICAgaWYgKCFzY2hlbWEuYWRkaXRpb25hbEl0ZW1zKVxuICAgICAgICAgICAgICAgIHJldHVybiB7J2FkZGl0aW9uYWxJdGVtcyc6IHRydWV9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZm9yIChpID0gbGVuLCBsZW4gPSBwcm9wLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgb2JqZXJyID0gY2hlY2tWYWxpZGl0eShlbnYsIHNjaGVtYV9zdGFjay5jb25jYXQoc2NoZW1hLmFkZGl0aW9uYWxJdGVtcyksIG9iamVjdF9zdGFjay5jb25jYXQoe29iamVjdDogcHJvcCwga2V5OiBpfSksIG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGlmIChvYmplcnIgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgIG9iamVycnNbaV0gPSBvYmplcnI7XG4gICAgICAgICAgICAgICAgICBtYWxmb3JtZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBwcm9wLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBvYmplcnIgPSBjaGVja1ZhbGlkaXR5KGVudiwgc2NoZW1hX3N0YWNrLmNvbmNhdChzY2hlbWEuaXRlbXMpLCBvYmplY3Rfc3RhY2suY29uY2F0KHtvYmplY3Q6IHByb3AsIGtleTogaX0pLCBvcHRpb25zKTtcbiAgICAgICAgICAgIGlmIChvYmplcnIgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgb2JqZXJyc1tpXSA9IG9iamVycjtcbiAgICAgICAgICAgICAgbWFsZm9ybWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmhhc093blByb3BlcnR5KCdhZGRpdGlvbmFsSXRlbXMnKSkge1xuICAgICAgICBpZiAodHlwZW9mIHNjaGVtYS5hZGRpdGlvbmFsSXRlbXMgIT09ICdib29sZWFuJykge1xuICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHByb3AubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIG9iamVyciA9IGNoZWNrVmFsaWRpdHkoZW52LCBzY2hlbWFfc3RhY2suY29uY2F0KHNjaGVtYS5hZGRpdGlvbmFsSXRlbXMpLCBvYmplY3Rfc3RhY2suY29uY2F0KHtvYmplY3Q6IHByb3AsIGtleTogaX0pLCBvcHRpb25zKTtcbiAgICAgICAgICAgIGlmIChvYmplcnIgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgb2JqZXJyc1tpXSA9IG9iamVycjtcbiAgICAgICAgICAgICAgbWFsZm9ybWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChtYWxmb3JtZWQpXG4gICAgICAgIHJldHVybiB7J3NjaGVtYSc6IG9iamVycnN9O1xuICAgIH1cblxuICAgIGZvciAodiBpbiBzY2hlbWEpIHtcbiAgICAgIGlmIChzY2hlbWEuaGFzT3duUHJvcGVydHkodikgJiYgIWhhbmRsZWQuaGFzT3duUHJvcGVydHkodikpIHtcbiAgICAgICAgaWYgKHYgPT09ICdmb3JtYXQnKSB7XG4gICAgICAgICAgaWYgKGVudi5maWVsZEZvcm1hdC5oYXNPd25Qcm9wZXJ0eShzY2hlbWFbdl0pICYmICFlbnYuZmllbGRGb3JtYXRbc2NoZW1hW3ZdXShwcm9wLCBzY2hlbWEsIG9iamVjdF9zdGFjaywgb3B0aW9ucykpIHtcbiAgICAgICAgICAgIG9iamVycnNbdl0gPSB0cnVlO1xuICAgICAgICAgICAgbWFsZm9ybWVkID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKGVudi5maWVsZFZhbGlkYXRlLmhhc093blByb3BlcnR5KHYpICYmICFlbnYuZmllbGRWYWxpZGF0ZVt2XShwcm9wLCBzY2hlbWFbdl0uaGFzT3duUHJvcGVydHkoJyRkYXRhJykgPyByZXNvbHZlT2JqZWN0UmVmKG9iamVjdF9zdGFjaywgc2NoZW1hW3ZdLiRkYXRhKSA6IHNjaGVtYVt2XSwgc2NoZW1hLCBvYmplY3Rfc3RhY2ssIG9wdGlvbnMpKSB7XG4gICAgICAgICAgICBvYmplcnJzW3ZdID0gdHJ1ZTtcbiAgICAgICAgICAgIG1hbGZvcm1lZCA9IHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG1hbGZvcm1lZClcbiAgICAgIHJldHVybiBvYmplcnJzO1xuICAgIGVsc2VcbiAgICAgIHJldHVybiBudWxsO1xuICB9O1xuXG4gIHZhciBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICB1c2VEZWZhdWx0OiBmYWxzZSxcbiAgICB1c2VDb2VyY2U6IGZhbHNlLFxuICAgIGNoZWNrUmVxdWlyZWQ6IHRydWUsXG4gICAgcmVtb3ZlQWRkaXRpb25hbDogZmFsc2VcbiAgfTtcblxuICBmdW5jdGlvbiBFbnZpcm9ubWVudCgpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgRW52aXJvbm1lbnQpKVxuICAgICAgcmV0dXJuIG5ldyBFbnZpcm9ubWVudCgpO1xuXG4gICAgdGhpcy5jb2VyY2VUeXBlID0ge307XG4gICAgdGhpcy5maWVsZFR5cGUgPSBjbG9uZShmaWVsZFR5cGUpO1xuICAgIHRoaXMuZmllbGRWYWxpZGF0ZSA9IGNsb25lKGZpZWxkVmFsaWRhdGUpO1xuICAgIHRoaXMuZmllbGRGb3JtYXQgPSBjbG9uZShmaWVsZEZvcm1hdCk7XG4gICAgdGhpcy5kZWZhdWx0T3B0aW9ucyA9IGNsb25lKGRlZmF1bHRPcHRpb25zKTtcbiAgICB0aGlzLnNjaGVtYSA9IHt9O1xuICB9XG5cbiAgRW52aXJvbm1lbnQucHJvdG90eXBlID0ge1xuICAgIHZhbGlkYXRlOiBmdW5jdGlvbiAobmFtZSwgb2JqZWN0LCBvcHRpb25zKSB7XG4gICAgICB2YXIgc2NoZW1hX3N0YWNrID0gW25hbWVdLCBlcnJvcnMgPSBudWxsLCBvYmplY3Rfc3RhY2sgPSBbe29iamVjdDogeydfX3Jvb3RfXyc6IG9iamVjdH0sIGtleTogJ19fcm9vdF9fJ31dO1xuXG4gICAgICBpZiAodHlwZW9mIG5hbWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHNjaGVtYV9zdGFjayA9IHJlc29sdmVVUkkodGhpcywgbnVsbCwgbmFtZSk7XG4gICAgICAgIGlmICghc2NoZW1hX3N0YWNrKVxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignamp2OiBjb3VsZCBub3QgZmluZCBzY2hlbWEgXFwnJyArIG5hbWUgKyAnXFwnLicpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgb3B0aW9ucyA9IHRoaXMuZGVmYXVsdE9wdGlvbnM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKHZhciBwIGluIHRoaXMuZGVmYXVsdE9wdGlvbnMpXG4gICAgICAgICAgaWYgKHRoaXMuZGVmYXVsdE9wdGlvbnMuaGFzT3duUHJvcGVydHkocCkgJiYgIW9wdGlvbnMuaGFzT3duUHJvcGVydHkocCkpXG4gICAgICAgICAgICBvcHRpb25zW3BdID0gdGhpcy5kZWZhdWx0T3B0aW9uc1twXTtcbiAgICAgIH1cblxuICAgICAgZXJyb3JzID0gY2hlY2tWYWxpZGl0eSh0aGlzLCBzY2hlbWFfc3RhY2ssIG9iamVjdF9zdGFjaywgb3B0aW9ucyk7XG5cbiAgICAgIGlmIChlcnJvcnMpXG4gICAgICAgIHJldHVybiB7dmFsaWRhdGlvbjogZXJyb3JzLmhhc093blByb3BlcnR5KCdzY2hlbWEnKSA/IGVycm9ycy5zY2hlbWEgOiBlcnJvcnN9O1xuICAgICAgZWxzZVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9LFxuXG4gICAgcmVzb2x2ZVJlZjogZnVuY3Rpb24gKHNjaGVtYV9zdGFjaywgJHJlZikge1xuICAgICAgcmV0dXJuIHJlc29sdmVVUkkodGhpcywgc2NoZW1hX3N0YWNrLCAkcmVmKTtcbiAgICB9LFxuXG4gICAgYWRkVHlwZTogZnVuY3Rpb24gKG5hbWUsIGZ1bmMpIHtcbiAgICAgIHRoaXMuZmllbGRUeXBlW25hbWVdID0gZnVuYztcbiAgICB9LFxuXG4gICAgYWRkVHlwZUNvZXJjaW9uOiBmdW5jdGlvbiAodHlwZSwgZnVuYykge1xuICAgICAgdGhpcy5jb2VyY2VUeXBlW3R5cGVdID0gZnVuYztcbiAgICB9LFxuXG4gICAgYWRkQ2hlY2s6IGZ1bmN0aW9uIChuYW1lLCBmdW5jKSB7XG4gICAgICB0aGlzLmZpZWxkVmFsaWRhdGVbbmFtZV0gPSBmdW5jO1xuICAgIH0sXG5cbiAgICBhZGRGb3JtYXQ6IGZ1bmN0aW9uIChuYW1lLCBmdW5jKSB7XG4gICAgICB0aGlzLmZpZWxkRm9ybWF0W25hbWVdID0gZnVuYztcbiAgICB9LFxuXG4gICAgYWRkU2NoZW1hOiBmdW5jdGlvbiAobmFtZSwgc2NoZW1hKSB7XG4gICAgICBpZiAoIXNjaGVtYSAmJiBuYW1lKSB7XG4gICAgICAgIHNjaGVtYSA9IG5hbWU7XG4gICAgICAgIG5hbWUgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICBpZiAoc2NoZW1hLmhhc093blByb3BlcnR5KCdpZCcpICYmIHR5cGVvZiBzY2hlbWEuaWQgPT09ICdzdHJpbmcnICYmIHNjaGVtYS5pZCAhPT0gbmFtZSkge1xuICAgICAgICBpZiAoc2NoZW1hLmlkLmNoYXJBdCgwKSA9PT0gJy8nKVxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignamp2OiBzY2hlbWEgaWRcXCdzIHN0YXJ0aW5nIHdpdGggLyBhcmUgaW52YWxpZC4nKTtcbiAgICAgICAgdGhpcy5zY2hlbWFbbm9ybWFsaXplSUQoc2NoZW1hLmlkKV0gPSBzY2hlbWE7XG4gICAgICB9IGVsc2UgaWYgKCFuYW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignamp2OiBzY2hlbWEgbmVlZHMgZWl0aGVyIGEgbmFtZSBvciBpZCBhdHRyaWJ1dGUuJyk7XG4gICAgICB9XG4gICAgICBpZiAobmFtZSlcbiAgICAgICAgdGhpcy5zY2hlbWFbbm9ybWFsaXplSUQobmFtZSldID0gc2NoZW1hO1xuICAgIH1cbiAgfTtcblxuICAvLyBFeHBvcnQgZm9yIHVzZSBpbiBzZXJ2ZXIgYW5kIGNsaWVudC5cbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBtb2R1bGUuZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBFbnZpcm9ubWVudDtcbiAgZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKVxuICAgIGRlZmluZShmdW5jdGlvbiAoKSB7cmV0dXJuIEVudmlyb25tZW50O30pO1xuICBlbHNlXG4gICAgdGhpcy5qanYgPSBFbnZpcm9ubWVudDtcbn0pLmNhbGwodGhpcyk7XG4iLCIoZnVuY3Rpb24oKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBmdW5jdGlvbiBtYWtlKG8pIHtcbiAgICB2YXIgZXJyb3JzID0gW107XG5cbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG8udmFsaWRhdGlvbik7XG5cbiAgICAvLyB3aGVuIHdlJ3JlIG9uIGEgbGVhZiBub2RlIHdlIG5lZWQgdG8gaGFuZGxlIHRoZSB2YWxpZGF0aW9uIGVycm9ycyxcbiAgICAvLyBvdGhlcndpc2Ugd2UgY29udGludWUgd2Fsa2luZ1xuICAgIHZhciBsZWFmID0ga2V5cy5ldmVyeShmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiB0eXBlb2Ygby52YWxpZGF0aW9uW2tleV0gIT09ICdvYmplY3QnIHx8XG4gICAgICAgIGlzQXJyYXkoby52YWxpZGF0aW9uW2tleV0pO1xuICAgIH0pO1xuXG4gICAgaWYgKGxlYWYpIHtcbiAgICAgIC8vIHN0ZXAgdGhyb3VnaCBlYWNoIHZhbGlkYXRpb24gaXNzdWVcbiAgICAgIC8vIGV4YW1wbGU6IHsgcmVxdWlyZWQ6IHRydWUgfVxuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB2YXIgZXJyb3IsIHByb3BlcnRpZXM7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgICAgICAgY2FzZSAndHlwZSc6XG4gICAgICAgICAgICAgIHZhciB0eXBlID0gdHlwZW9mIG8uZGF0YTtcblxuICAgICAgICAgICAgICAvLyBmdXJ0aGVyIGRpc2NvdmVyIHR5cGVzXG4gICAgICAgICAgICAgIGlmICh0eXBlID09PSAnbnVtYmVyJyAmJiAoJycgKyBvLmRhdGEpLm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnaW50ZWdlcic7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcgJiYgQXJyYXkuaXNBcnJheShvLmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdhcnJheSc7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyB0aGUgdmFsdWUgb2YgdHlwZSBpcyB0aGUgcmVxdWlyZWQgdHlwZSAoZXg6IHsgdHlwZTogJ3N0cmluZycgfSlcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ0lOVkFMSURfVFlQRScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0ludmFsaWQgdHlwZTogJyArIHR5cGUgKyAnIHNob3VsZCBiZSAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAoaXNBcnJheShvLnZhbGlkYXRpb25ba2V5XSkgPyAgJ29uZSBvZiAnIDogICcnKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG8udmFsaWRhdGlvbltrZXldXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdyZXF1aXJlZCc6XG4gICAgICAgICAgICAgIHByb3BlcnRpZXMgPSBvLm5zO1xuXG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdPQkpFQ1RfUkVRVUlSRUQnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdNaXNzaW5nIHJlcXVpcmVkIHByb3BlcnR5OiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW3Byb3BlcnRpZXMubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21pbmltdW0nOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnTUlOSU1VTScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1ZhbHVlICcgKyBvLmRhdGEgKyAnIGlzIGxlc3MgdGhhbiBtaW5pbXVtICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm1pbmltdW1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21heGltdW0nOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnTUFYSU1VTScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1ZhbHVlICcgKyBvLmRhdGEgKyAnIGlzIGdyZWF0ZXIgdGhhbiBtYXhpbXVtICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm1heGltdW1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ211bHRpcGxlT2YnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnTVVMVElQTEVfT0YnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdWYWx1ZSAnICsgby5kYXRhICsgJyBpcyBub3QgYSBtdWx0aXBsZSBvZiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBvLnNjaGVtYS5tdWx0aXBsZU9mXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdwYXR0ZXJuJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ1BBVFRFUk4nLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTdHJpbmcgZG9lcyBub3QgbWF0Y2ggcGF0dGVybjogJyArIG8uc2NoZW1hLnBhdHRlcm5cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21pbkxlbmd0aCc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdNSU5fTEVOR1RIJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnU3RyaW5nIGlzIHRvbyBzaG9ydCAoJyArIG8uZGF0YS5sZW5ndGggKyAnIGNoYXJzKSwgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ21pbmltdW0gJyArIG8uc2NoZW1hLm1pbkxlbmd0aFxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWF4TGVuZ3RoJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ01BWF9MRU5HVEgnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTdHJpbmcgaXMgdG9vIGxvbmcgKCcgKyBvLmRhdGEubGVuZ3RoICsgJyBjaGFycyksICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICdtYXhpbXVtICcgKyBvLnNjaGVtYS5tYXhMZW5ndGhcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21pbkl0ZW1zJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ0FSUkFZX0xFTkdUSF9TSE9SVCcsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0FycmF5IGlzIHRvbyBzaG9ydCAoJyArIG8uZGF0YS5sZW5ndGggKyAnKSwgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ21pbmltdW0gJyArIG8uc2NoZW1hLm1pbkl0ZW1zXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdtYXhJdGVtcyc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdBUlJBWV9MRU5HVEhfTE9ORycsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0FycmF5IGlzIHRvbyBsb25nICgnICsgby5kYXRhLmxlbmd0aCArICcpLCBtYXhpbXVtICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm1heEl0ZW1zXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd1bmlxdWVJdGVtcyc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdBUlJBWV9VTklRVUUnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBcnJheSBpdGVtcyBhcmUgbm90IHVuaXF1ZSdcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21pblByb3BlcnRpZXMnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnT0JKRUNUX1BST1BFUlRJRVNfTUlOSU1VTScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1RvbyBmZXcgcHJvcGVydGllcyBkZWZpbmVkICgnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyhvLmRhdGEpLmxlbmd0aCArICcpLCBtaW5pbXVtICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm1pblByb3BlcnRpZXNcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21heFByb3BlcnRpZXMnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnT0JKRUNUX1BST1BFUlRJRVNfTUFYSU1VTScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1RvbyBtYW55IHByb3BlcnRpZXMgZGVmaW5lZCAoJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXMoby5kYXRhKS5sZW5ndGggKyAnKSwgbWF4aW11bSAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBvLnNjaGVtYS5tYXhQcm9wZXJ0aWVzXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdlbnVtJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ0VOVU1fTUlTTUFUQ0gnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdObyBlbnVtIG1hdGNoICgnICsgby5kYXRhICsgJyksIGV4cGVjdHM6ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hWydlbnVtJ10uam9pbignLCAnKVxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbm90JzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ05PVF9QQVNTRUQnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdEYXRhIG1hdGNoZXMgc2NoZW1hIGZyb20gXCJub3RcIidcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2FkZGl0aW9uYWwnOlxuICAgICAgICAgICAgICBwcm9wZXJ0aWVzID0gby5ucztcblxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnQURESVRJT05BTF9QUk9QRVJUSUVTJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQWRkaXRpb25hbCBwcm9wZXJ0aWVzIG5vdCBhbGxvd2VkOiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW3Byb3BlcnRpZXMubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIC8vIGlnbm9yZSBlcnJvcnNcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVuaGFuZGxlZCBlcnJvcnNcbiAgICAgICAgaWYgKCFlcnJvcikge1xuICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgY29kZTogJ0ZBSUxFRCcsXG4gICAgICAgICAgICBtZXNzYWdlOiAnVmFsaWRhdGlvbiBlcnJvcjogJyArIGtleVxuICAgICAgICAgIH07XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvLnZhbGlkYXRpb25ba2V5XSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAnICgnICsgby52YWxpZGF0aW9uW2tleV0gKyAnKSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAvLyBpZ25vcmUgZXJyb3JzXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZXJyb3IuY29kZSA9ICdWQUxJREFUSU9OXycgKyBlcnJvci5jb2RlO1xuICAgICAgICBpZiAoby5kYXRhICE9PSB1bmRlZmluZWQpIGVycm9yLmRhdGEgPSBvLmRhdGE7XG4gICAgICAgIGVycm9yLnBhdGggPSBvLm5zO1xuICAgICAgICBlcnJvcnMucHVzaChlcnJvcik7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gaGFuZGxlIGFsbCBub24tbGVhZiBjaGlsZHJlblxuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB2YXIgcztcblxuICAgICAgICBpZiAoby5zY2hlbWEuJHJlZikge1xuICAgICAgICAgIGlmIChvLnNjaGVtYS4kcmVmLm1hdGNoKC8jXFwvZGVmaW5pdGlvbnNcXC8vKSkge1xuICAgICAgICAgICAgby5zY2hlbWEgPSBvLmRlZmluaXRpb25zW28uc2NoZW1hLiRyZWYuc2xpY2UoMTQpXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgby5zY2hlbWEgPSBvLnNjaGVtYS4kcmVmO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICh0eXBlb2Ygby5zY2hlbWEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBvLnNjaGVtYSA9IG8uZW52LnJlc29sdmVSZWYobnVsbCwgby5zY2hlbWEpO1xuICAgICAgICAgICAgaWYgKG8uc2NoZW1hKSBvLnNjaGVtYSA9IG8uc2NoZW1hWzBdO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvLnNjaGVtYSAmJiBvLnNjaGVtYS50eXBlKSB7XG4gICAgICAgICAgaWYgKGFsbG93c1R5cGUoby5zY2hlbWEsICdvYmplY3QnKSkge1xuICAgICAgICAgICAgaWYgKG8uc2NoZW1hLnByb3BlcnRpZXMgJiYgby5zY2hlbWEucHJvcGVydGllc1trZXldKSB7XG4gICAgICAgICAgICAgIHMgPSBvLnNjaGVtYS5wcm9wZXJ0aWVzW2tleV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghcyAmJiBvLnNjaGVtYS5wYXR0ZXJuUHJvcGVydGllcykge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyhvLnNjaGVtYS5wYXR0ZXJuUHJvcGVydGllcykuc29tZShmdW5jdGlvbihwa2V5KSB7XG4gICAgICAgICAgICAgICAgaWYgKGtleS5tYXRjaChuZXcgUmVnRXhwKHBrZXkpKSkge1xuICAgICAgICAgICAgICAgICAgcyA9IG8uc2NoZW1hLnBhdHRlcm5Qcm9wZXJ0aWVzW3BrZXldO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFzICYmIG8uc2NoZW1hLmhhc093blByb3BlcnR5KCdhZGRpdGlvbmFsUHJvcGVydGllcycpKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2Ygby5zY2hlbWEuYWRkaXRpb25hbFByb3BlcnRpZXMgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICAgIHMgPSB7fTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzID0gby5zY2hlbWEuYWRkaXRpb25hbFByb3BlcnRpZXM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoYWxsb3dzVHlwZShvLnNjaGVtYSwgJ2FycmF5JykpIHtcbiAgICAgICAgICAgIHMgPSBvLnNjaGVtYS5pdGVtcztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb3B0cyA9IHtcbiAgICAgICAgICBlbnY6IG8uZW52LFxuICAgICAgICAgIHNjaGVtYTogcyB8fCB7fSxcbiAgICAgICAgICBuczogby5ucy5jb25jYXQoa2V5KVxuICAgICAgICB9O1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgb3B0cy5kYXRhID0gby5kYXRhW2tleV07XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIC8vIGlnbm9yZSBlcnJvcnNcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgb3B0cy52YWxpZGF0aW9uID0gby52YWxpZGF0aW9uW2tleV0uc2NoZW1hID9cbiAgICAgICAgICAgIG8udmFsaWRhdGlvbltrZXldLnNjaGVtYSA6XG4gICAgICAgICAgICBvLnZhbGlkYXRpb25ba2V5XTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgb3B0cy52YWxpZGF0aW9uID0ge307XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIG9wdHMuZGVmaW5pdGlvbnMgPSBzLmRlZmluaXRpb25zIHx8IG8uZGVmaW5pdGlvbnM7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIG9wdHMuZGVmaW5pdGlvbnMgPSBvLmRlZmluaXRpb25zO1xuICAgICAgICB9XG5cbiAgICAgICAgZXJyb3JzID0gZXJyb3JzLmNvbmNhdChtYWtlKG9wdHMpKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBlcnJvcnM7XG4gIH1cblxuICBmdW5jdGlvbiBhbGxvd3NUeXBlKHNjaGVtYSwgdHlwZSkge1xuICAgIGlmICh0eXBlb2Ygc2NoZW1hLnR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gc2NoZW1hLnR5cGUgPT09IHR5cGU7XG4gICAgfVxuICAgIGlmIChpc0FycmF5KHNjaGVtYS50eXBlKSkge1xuICAgICAgcmV0dXJuIHNjaGVtYS50eXBlLmluZGV4T2YodHlwZSkgIT09IC0xO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBmdW5jdGlvbiBpc0FycmF5KG9iaikge1xuICAgIGlmICh0eXBlb2YgQXJyYXkuaXNBcnJheSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkob2JqKTtcbiAgICB9XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nO1xuICB9XG5cbiAgZnVuY3Rpb24gZm9ybWF0UGF0aChvcHRpb25zKSB7XG4gICAgdmFyIHJvb3QgPSBvcHRpb25zLmhhc093blByb3BlcnR5KCdyb290JykgP1xuICAgICAgb3B0aW9ucy5yb290IDogJyQnO1xuXG4gICAgdmFyIHNlcCA9IG9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ3NlcCcpID9cbiAgICAgIG9wdGlvbnMuc2VwIDogJy4nO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICB2YXIgcGF0aCA9IHJvb3Q7XG5cbiAgICAgIGVycm9yLnBhdGguZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgcGF0aCArPSBrZXkubWF0Y2goL15cXGQrJC8pID9cbiAgICAgICAgICAnWycgKyBrZXkgKyAnXScgOlxuICAgICAgICAgIGtleS5tYXRjaCgvXltBLVpfJF1bMC05QS1aXyRdKiQvaSkgP1xuICAgICAgICAgICAgKHNlcCArIGtleSkgOlxuICAgICAgICAgICAgKCdbJyArIEpTT04uc3RyaW5naWZ5KGtleSkgKyAnXScpO1xuICAgICAgfSk7XG5cbiAgICAgIGVycm9yLnBhdGggPSBwYXRoO1xuXG4gICAgICByZXR1cm4gZXJyb3I7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGpqdmUoZW52KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGpqdmUoc2NoZW1hLCBkYXRhLCByZXN1bHQsIG9wdGlvbnMpIHtcbiAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQudmFsaWRhdGlvbikgcmV0dXJuIFtdO1xuXG4gICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgICAgaWYgKHR5cGVvZiBzY2hlbWEgPT09ICdzdHJpbmcnKSB7IHNjaGVtYSA9IGVudi5zY2hlbWFbc2NoZW1hXTsgfVxuXG4gICAgICB2YXIgZXJyb3JzID0gbWFrZSh7XG4gICAgICAgIGVudjogZW52LFxuICAgICAgICBzY2hlbWE6IHNjaGVtYSxcbiAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgdmFsaWRhdGlvbjogcmVzdWx0LnZhbGlkYXRpb24sXG4gICAgICAgIG5zOiBbXSxcbiAgICAgICAgZGVmaW5pdGlvbnM6IHNjaGVtYS5kZWZpbml0aW9ucyB8fCB7fVxuICAgICAgfSk7XG5cbiAgICAgIGlmIChlcnJvcnMubGVuZ3RoICYmIG9wdGlvbnMuZm9ybWF0UGF0aCAhPT0gZmFsc2UpIHtcbiAgICAgICAgcmV0dXJuIGVycm9ycy5tYXAoZm9ybWF0UGF0aChvcHRpb25zKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBlcnJvcnM7XG4gICAgfTtcbiAgfVxuXG4gIC8vIEV4cG9ydCBmb3IgdXNlIGluIHNlcnZlciBhbmQgY2xpZW50LlxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gamp2ZTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoZnVuY3Rpb24oKSB7IHJldHVybiBqanZlOyB9KTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLmpqdmUgPSBqanZlO1xuICB9XG59KS5jYWxsKHRoaXMpO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlQ2xvbmUgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2VjbG9uZScpLFxuICAgIGJhc2VDcmVhdGVDYWxsYmFjayA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWNyZWF0ZWNhbGxiYWNrJyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGRlZXAgY2xvbmUgb2YgYHZhbHVlYC4gSWYgYSBjYWxsYmFjayBpcyBwcm92aWRlZCBpdCB3aWxsIGJlXG4gKiBleGVjdXRlZCB0byBwcm9kdWNlIHRoZSBjbG9uZWQgdmFsdWVzLiBJZiB0aGUgY2FsbGJhY2sgcmV0dXJucyBgdW5kZWZpbmVkYFxuICogY2xvbmluZyB3aWxsIGJlIGhhbmRsZWQgYnkgdGhlIG1ldGhvZCBpbnN0ZWFkLiBUaGUgY2FsbGJhY2sgaXMgYm91bmQgdG9cbiAqIGB0aGlzQXJnYCBhbmQgaW52b2tlZCB3aXRoIG9uZSBhcmd1bWVudDsgKHZhbHVlKS5cbiAqXG4gKiBOb3RlOiBUaGlzIG1ldGhvZCBpcyBsb29zZWx5IGJhc2VkIG9uIHRoZSBzdHJ1Y3R1cmVkIGNsb25lIGFsZ29yaXRobS4gRnVuY3Rpb25zXG4gKiBhbmQgRE9NIG5vZGVzIGFyZSAqKm5vdCoqIGNsb25lZC4gVGhlIGVudW1lcmFibGUgcHJvcGVydGllcyBvZiBgYXJndW1lbnRzYCBvYmplY3RzIGFuZFxuICogb2JqZWN0cyBjcmVhdGVkIGJ5IGNvbnN0cnVjdG9ycyBvdGhlciB0aGFuIGBPYmplY3RgIGFyZSBjbG9uZWQgdG8gcGxhaW4gYE9iamVjdGAgb2JqZWN0cy5cbiAqIFNlZSBodHRwOi8vd3d3LnczLm9yZy9UUi9odG1sNS9pbmZyYXN0cnVjdHVyZS5odG1sI2ludGVybmFsLXN0cnVjdHVyZWQtY2xvbmluZy1hbGdvcml0aG0uXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBkZWVwIGNsb25lLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrXSBUaGUgZnVuY3Rpb24gdG8gY3VzdG9taXplIGNsb25pbmcgdmFsdWVzLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBjYWxsYmFja2AuXG4gKiBAcmV0dXJucyB7Kn0gUmV0dXJucyB0aGUgZGVlcCBjbG9uZWQgdmFsdWUuXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBjaGFyYWN0ZXJzID0gW1xuICogICB7ICduYW1lJzogJ2Jhcm5leScsICdhZ2UnOiAzNiB9LFxuICogICB7ICduYW1lJzogJ2ZyZWQnLCAgICdhZ2UnOiA0MCB9XG4gKiBdO1xuICpcbiAqIHZhciBkZWVwID0gXy5jbG9uZURlZXAoY2hhcmFjdGVycyk7XG4gKiBkZWVwWzBdID09PSBjaGFyYWN0ZXJzWzBdO1xuICogLy8gPT4gZmFsc2VcbiAqXG4gKiB2YXIgdmlldyA9IHtcbiAqICAgJ2xhYmVsJzogJ2RvY3MnLFxuICogICAnbm9kZSc6IGVsZW1lbnRcbiAqIH07XG4gKlxuICogdmFyIGNsb25lID0gXy5jbG9uZURlZXAodmlldywgZnVuY3Rpb24odmFsdWUpIHtcbiAqICAgcmV0dXJuIF8uaXNFbGVtZW50KHZhbHVlKSA/IHZhbHVlLmNsb25lTm9kZSh0cnVlKSA6IHVuZGVmaW5lZDtcbiAqIH0pO1xuICpcbiAqIGNsb25lLm5vZGUgPT0gdmlldy5ub2RlO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gY2xvbmVEZWVwKHZhbHVlLCBjYWxsYmFjaywgdGhpc0FyZykge1xuICByZXR1cm4gYmFzZUNsb25lKHZhbHVlLCB0cnVlLCB0eXBlb2YgY2FsbGJhY2sgPT0gJ2Z1bmN0aW9uJyAmJiBiYXNlQ3JlYXRlQ2FsbGJhY2soY2FsbGJhY2ssIHRoaXNBcmcsIDEpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjbG9uZURlZXA7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGFzc2lnbiA9IHJlcXVpcmUoJ2xvZGFzaC5hc3NpZ24nKSxcbiAgICBmb3JFYWNoID0gcmVxdWlyZSgnbG9kYXNoLmZvcmVhY2gnKSxcbiAgICBmb3JPd24gPSByZXF1aXJlKCdsb2Rhc2guZm9yb3duJyksXG4gICAgZ2V0QXJyYXkgPSByZXF1aXJlKCdsb2Rhc2guX2dldGFycmF5JyksXG4gICAgaXNBcnJheSA9IHJlcXVpcmUoJ2xvZGFzaC5pc2FycmF5JyksXG4gICAgaXNPYmplY3QgPSByZXF1aXJlKCdsb2Rhc2guaXNvYmplY3QnKSxcbiAgICByZWxlYXNlQXJyYXkgPSByZXF1aXJlKCdsb2Rhc2guX3JlbGVhc2VhcnJheScpLFxuICAgIHNsaWNlID0gcmVxdWlyZSgnbG9kYXNoLl9zbGljZScpO1xuXG4vKiogVXNlZCB0byBtYXRjaCByZWdleHAgZmxhZ3MgZnJvbSB0aGVpciBjb2VyY2VkIHN0cmluZyB2YWx1ZXMgKi9cbnZhciByZUZsYWdzID0gL1xcdyokLztcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCBzaG9ydGN1dHMgKi9cbnZhciBhcmdzQ2xhc3MgPSAnW29iamVjdCBBcmd1bWVudHNdJyxcbiAgICBhcnJheUNsYXNzID0gJ1tvYmplY3QgQXJyYXldJyxcbiAgICBib29sQ2xhc3MgPSAnW29iamVjdCBCb29sZWFuXScsXG4gICAgZGF0ZUNsYXNzID0gJ1tvYmplY3QgRGF0ZV0nLFxuICAgIGZ1bmNDbGFzcyA9ICdbb2JqZWN0IEZ1bmN0aW9uXScsXG4gICAgbnVtYmVyQ2xhc3MgPSAnW29iamVjdCBOdW1iZXJdJyxcbiAgICBvYmplY3RDbGFzcyA9ICdbb2JqZWN0IE9iamVjdF0nLFxuICAgIHJlZ2V4cENsYXNzID0gJ1tvYmplY3QgUmVnRXhwXScsXG4gICAgc3RyaW5nQ2xhc3MgPSAnW29iamVjdCBTdHJpbmddJztcblxuLyoqIFVzZWQgdG8gaWRlbnRpZnkgb2JqZWN0IGNsYXNzaWZpY2F0aW9ucyB0aGF0IGBfLmNsb25lYCBzdXBwb3J0cyAqL1xudmFyIGNsb25lYWJsZUNsYXNzZXMgPSB7fTtcbmNsb25lYWJsZUNsYXNzZXNbZnVuY0NsYXNzXSA9IGZhbHNlO1xuY2xvbmVhYmxlQ2xhc3Nlc1thcmdzQ2xhc3NdID0gY2xvbmVhYmxlQ2xhc3Nlc1thcnJheUNsYXNzXSA9XG5jbG9uZWFibGVDbGFzc2VzW2Jvb2xDbGFzc10gPSBjbG9uZWFibGVDbGFzc2VzW2RhdGVDbGFzc10gPVxuY2xvbmVhYmxlQ2xhc3Nlc1tudW1iZXJDbGFzc10gPSBjbG9uZWFibGVDbGFzc2VzW29iamVjdENsYXNzXSA9XG5jbG9uZWFibGVDbGFzc2VzW3JlZ2V4cENsYXNzXSA9IGNsb25lYWJsZUNsYXNzZXNbc3RyaW5nQ2xhc3NdID0gdHJ1ZTtcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgaW50ZXJuYWwgW1tDbGFzc11dIG9mIHZhbHVlcyAqL1xudmFyIHRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKiBVc2VkIHRvIGxvb2t1cCBhIGJ1aWx0LWluIGNvbnN0cnVjdG9yIGJ5IFtbQ2xhc3NdXSAqL1xudmFyIGN0b3JCeUNsYXNzID0ge307XG5jdG9yQnlDbGFzc1thcnJheUNsYXNzXSA9IEFycmF5O1xuY3RvckJ5Q2xhc3NbYm9vbENsYXNzXSA9IEJvb2xlYW47XG5jdG9yQnlDbGFzc1tkYXRlQ2xhc3NdID0gRGF0ZTtcbmN0b3JCeUNsYXNzW2Z1bmNDbGFzc10gPSBGdW5jdGlvbjtcbmN0b3JCeUNsYXNzW29iamVjdENsYXNzXSA9IE9iamVjdDtcbmN0b3JCeUNsYXNzW251bWJlckNsYXNzXSA9IE51bWJlcjtcbmN0b3JCeUNsYXNzW3JlZ2V4cENsYXNzXSA9IFJlZ0V4cDtcbmN0b3JCeUNsYXNzW3N0cmluZ0NsYXNzXSA9IFN0cmluZztcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5jbG9uZWAgd2l0aG91dCBhcmd1bWVudCBqdWdnbGluZyBvciBzdXBwb3J0XG4gKiBmb3IgYHRoaXNBcmdgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNsb25lLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNEZWVwPWZhbHNlXSBTcGVjaWZ5IGEgZGVlcCBjbG9uZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFja10gVGhlIGZ1bmN0aW9uIHRvIGN1c3RvbWl6ZSBjbG9uaW5nIHZhbHVlcy5cbiAqIEBwYXJhbSB7QXJyYXl9IFtzdGFja0E9W11dIFRyYWNrcyB0cmF2ZXJzZWQgc291cmNlIG9iamVjdHMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tCPVtdXSBBc3NvY2lhdGVzIGNsb25lcyB3aXRoIHNvdXJjZSBjb3VudGVycGFydHMuXG4gKiBAcmV0dXJucyB7Kn0gUmV0dXJucyB0aGUgY2xvbmVkIHZhbHVlLlxuICovXG5mdW5jdGlvbiBiYXNlQ2xvbmUodmFsdWUsIGlzRGVlcCwgY2FsbGJhY2ssIHN0YWNrQSwgc3RhY2tCKSB7XG4gIGlmIChjYWxsYmFjaykge1xuICAgIHZhciByZXN1bHQgPSBjYWxsYmFjayh2YWx1ZSk7XG4gICAgaWYgKHR5cGVvZiByZXN1bHQgIT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICB9XG4gIC8vIGluc3BlY3QgW1tDbGFzc11dXG4gIHZhciBpc09iaiA9IGlzT2JqZWN0KHZhbHVlKTtcbiAgaWYgKGlzT2JqKSB7XG4gICAgdmFyIGNsYXNzTmFtZSA9IHRvU3RyaW5nLmNhbGwodmFsdWUpO1xuICAgIGlmICghY2xvbmVhYmxlQ2xhc3Nlc1tjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuICAgIHZhciBjdG9yID0gY3RvckJ5Q2xhc3NbY2xhc3NOYW1lXTtcbiAgICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgICAgY2FzZSBib29sQ2xhc3M6XG4gICAgICBjYXNlIGRhdGVDbGFzczpcbiAgICAgICAgcmV0dXJuIG5ldyBjdG9yKCt2YWx1ZSk7XG5cbiAgICAgIGNhc2UgbnVtYmVyQ2xhc3M6XG4gICAgICBjYXNlIHN0cmluZ0NsYXNzOlxuICAgICAgICByZXR1cm4gbmV3IGN0b3IodmFsdWUpO1xuXG4gICAgICBjYXNlIHJlZ2V4cENsYXNzOlxuICAgICAgICByZXN1bHQgPSBjdG9yKHZhbHVlLnNvdXJjZSwgcmVGbGFncy5leGVjKHZhbHVlKSk7XG4gICAgICAgIHJlc3VsdC5sYXN0SW5kZXggPSB2YWx1ZS5sYXN0SW5kZXg7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICB2YXIgaXNBcnIgPSBpc0FycmF5KHZhbHVlKTtcbiAgaWYgKGlzRGVlcCkge1xuICAgIC8vIGNoZWNrIGZvciBjaXJjdWxhciByZWZlcmVuY2VzIGFuZCByZXR1cm4gY29ycmVzcG9uZGluZyBjbG9uZVxuICAgIHZhciBpbml0ZWRTdGFjayA9ICFzdGFja0E7XG4gICAgc3RhY2tBIHx8IChzdGFja0EgPSBnZXRBcnJheSgpKTtcbiAgICBzdGFja0IgfHwgKHN0YWNrQiA9IGdldEFycmF5KCkpO1xuXG4gICAgdmFyIGxlbmd0aCA9IHN0YWNrQS5sZW5ndGg7XG4gICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICBpZiAoc3RhY2tBW2xlbmd0aF0gPT0gdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHN0YWNrQltsZW5ndGhdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQgPSBpc0FyciA/IGN0b3IodmFsdWUubGVuZ3RoKSA6IHt9O1xuICB9XG4gIGVsc2Uge1xuICAgIHJlc3VsdCA9IGlzQXJyID8gc2xpY2UodmFsdWUpIDogYXNzaWduKHt9LCB2YWx1ZSk7XG4gIH1cbiAgLy8gYWRkIGFycmF5IHByb3BlcnRpZXMgYXNzaWduZWQgYnkgYFJlZ0V4cCNleGVjYFxuICBpZiAoaXNBcnIpIHtcbiAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgJ2luZGV4JykpIHtcbiAgICAgIHJlc3VsdC5pbmRleCA9IHZhbHVlLmluZGV4O1xuICAgIH1cbiAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgJ2lucHV0JykpIHtcbiAgICAgIHJlc3VsdC5pbnB1dCA9IHZhbHVlLmlucHV0O1xuICAgIH1cbiAgfVxuICAvLyBleGl0IGZvciBzaGFsbG93IGNsb25lXG4gIGlmICghaXNEZWVwKSB7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICAvLyBhZGQgdGhlIHNvdXJjZSB2YWx1ZSB0byB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHNcbiAgLy8gYW5kIGFzc29jaWF0ZSBpdCB3aXRoIGl0cyBjbG9uZVxuICBzdGFja0EucHVzaCh2YWx1ZSk7XG4gIHN0YWNrQi5wdXNoKHJlc3VsdCk7XG5cbiAgLy8gcmVjdXJzaXZlbHkgcG9wdWxhdGUgY2xvbmUgKHN1c2NlcHRpYmxlIHRvIGNhbGwgc3RhY2sgbGltaXRzKVxuICAoaXNBcnIgPyBmb3JFYWNoIDogZm9yT3duKSh2YWx1ZSwgZnVuY3Rpb24ob2JqVmFsdWUsIGtleSkge1xuICAgIHJlc3VsdFtrZXldID0gYmFzZUNsb25lKG9ialZhbHVlLCBpc0RlZXAsIGNhbGxiYWNrLCBzdGFja0EsIHN0YWNrQik7XG4gIH0pO1xuXG4gIGlmIChpbml0ZWRTdGFjaykge1xuICAgIHJlbGVhc2VBcnJheShzdGFja0EpO1xuICAgIHJlbGVhc2VBcnJheShzdGFja0IpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUNsb25lO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBhcnJheVBvb2wgPSByZXF1aXJlKCdsb2Rhc2guX2FycmF5cG9vbCcpO1xuXG4vKipcbiAqIEdldHMgYW4gYXJyYXkgZnJvbSB0aGUgYXJyYXkgcG9vbCBvciBjcmVhdGVzIGEgbmV3IG9uZSBpZiB0aGUgcG9vbCBpcyBlbXB0eS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHJldHVybnMge0FycmF5fSBUaGUgYXJyYXkgZnJvbSB0aGUgcG9vbC5cbiAqL1xuZnVuY3Rpb24gZ2V0QXJyYXkoKSB7XG4gIHJldHVybiBhcnJheVBvb2wucG9wKCkgfHwgW107XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZ2V0QXJyYXk7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogVXNlZCB0byBwb29sIGFycmF5cyBhbmQgb2JqZWN0cyB1c2VkIGludGVybmFsbHkgKi9cbnZhciBhcnJheVBvb2wgPSBbXTtcblxubW9kdWxlLmV4cG9ydHMgPSBhcnJheVBvb2w7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGFycmF5UG9vbCA9IHJlcXVpcmUoJ2xvZGFzaC5fYXJyYXlwb29sJyksXG4gICAgbWF4UG9vbFNpemUgPSByZXF1aXJlKCdsb2Rhc2guX21heHBvb2xzaXplJyk7XG5cbi8qKlxuICogUmVsZWFzZXMgdGhlIGdpdmVuIGFycmF5IGJhY2sgdG8gdGhlIGFycmF5IHBvb2wuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IFthcnJheV0gVGhlIGFycmF5IHRvIHJlbGVhc2UuXG4gKi9cbmZ1bmN0aW9uIHJlbGVhc2VBcnJheShhcnJheSkge1xuICBhcnJheS5sZW5ndGggPSAwO1xuICBpZiAoYXJyYXlQb29sLmxlbmd0aCA8IG1heFBvb2xTaXplKSB7XG4gICAgYXJyYXlQb29sLnB1c2goYXJyYXkpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcmVsZWFzZUFycmF5O1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIFVzZWQgYXMgdGhlIG1heCBzaXplIG9mIHRoZSBgYXJyYXlQb29sYCBhbmQgYG9iamVjdFBvb2xgICovXG52YXIgbWF4UG9vbFNpemUgPSA0MDtcblxubW9kdWxlLmV4cG9ydHMgPSBtYXhQb29sU2l6ZTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKlxuICogU2xpY2VzIHRoZSBgY29sbGVjdGlvbmAgZnJvbSB0aGUgYHN0YXJ0YCBpbmRleCB1cCB0bywgYnV0IG5vdCBpbmNsdWRpbmcsXG4gKiB0aGUgYGVuZGAgaW5kZXguXG4gKlxuICogTm90ZTogVGhpcyBmdW5jdGlvbiBpcyB1c2VkIGluc3RlYWQgb2YgYEFycmF5I3NsaWNlYCB0byBzdXBwb3J0IG5vZGUgbGlzdHNcbiAqIGluIElFIDwgOSBhbmQgdG8gZW5zdXJlIGRlbnNlIGFycmF5cyBhcmUgcmV0dXJuZWQuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBzbGljZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBzdGFydCBUaGUgc3RhcnQgaW5kZXguXG4gKiBAcGFyYW0ge251bWJlcn0gZW5kIFRoZSBlbmQgaW5kZXguXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgdGhlIG5ldyBhcnJheS5cbiAqL1xuZnVuY3Rpb24gc2xpY2UoYXJyYXksIHN0YXJ0LCBlbmQpIHtcbiAgc3RhcnQgfHwgKHN0YXJ0ID0gMCk7XG4gIGlmICh0eXBlb2YgZW5kID09ICd1bmRlZmluZWQnKSB7XG4gICAgZW5kID0gYXJyYXkgPyBhcnJheS5sZW5ndGggOiAwO1xuICB9XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gZW5kIC0gc3RhcnQgfHwgMCxcbiAgICAgIHJlc3VsdCA9IEFycmF5KGxlbmd0aCA8IDAgPyAwIDogbGVuZ3RoKTtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHJlc3VsdFtpbmRleF0gPSBhcnJheVtzdGFydCArIGluZGV4XTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHNsaWNlO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlQ3JlYXRlQ2FsbGJhY2sgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2VjcmVhdGVjYWxsYmFjaycpLFxuICAgIGtleXMgPSByZXF1aXJlKCdsb2Rhc2gua2V5cycpLFxuICAgIG9iamVjdFR5cGVzID0gcmVxdWlyZSgnbG9kYXNoLl9vYmplY3R0eXBlcycpO1xuXG4vKipcbiAqIEFzc2lnbnMgb3duIGVudW1lcmFibGUgcHJvcGVydGllcyBvZiBzb3VyY2Ugb2JqZWN0KHMpIHRvIHRoZSBkZXN0aW5hdGlvblxuICogb2JqZWN0LiBTdWJzZXF1ZW50IHNvdXJjZXMgd2lsbCBvdmVyd3JpdGUgcHJvcGVydHkgYXNzaWdubWVudHMgb2YgcHJldmlvdXNcbiAqIHNvdXJjZXMuIElmIGEgY2FsbGJhY2sgaXMgcHJvdmlkZWQgaXQgd2lsbCBiZSBleGVjdXRlZCB0byBwcm9kdWNlIHRoZVxuICogYXNzaWduZWQgdmFsdWVzLiBUaGUgY2FsbGJhY2sgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGggdHdvXG4gKiBhcmd1bWVudHM7IChvYmplY3RWYWx1ZSwgc291cmNlVmFsdWUpLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAdHlwZSBGdW5jdGlvblxuICogQGFsaWFzIGV4dGVuZFxuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIGRlc3RpbmF0aW9uIG9iamVjdC5cbiAqIEBwYXJhbSB7Li4uT2JqZWN0fSBbc291cmNlXSBUaGUgc291cmNlIG9iamVjdHMuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2FsbGJhY2tdIFRoZSBmdW5jdGlvbiB0byBjdXN0b21pemUgYXNzaWduaW5nIHZhbHVlcy5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgY2FsbGJhY2tgLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyB0aGUgZGVzdGluYXRpb24gb2JqZWN0LlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmFzc2lnbih7ICduYW1lJzogJ2ZyZWQnIH0sIHsgJ2VtcGxveWVyJzogJ3NsYXRlJyB9KTtcbiAqIC8vID0+IHsgJ25hbWUnOiAnZnJlZCcsICdlbXBsb3llcic6ICdzbGF0ZScgfVxuICpcbiAqIHZhciBkZWZhdWx0cyA9IF8ucGFydGlhbFJpZ2h0KF8uYXNzaWduLCBmdW5jdGlvbihhLCBiKSB7XG4gKiAgIHJldHVybiB0eXBlb2YgYSA9PSAndW5kZWZpbmVkJyA/IGIgOiBhO1xuICogfSk7XG4gKlxuICogdmFyIG9iamVjdCA9IHsgJ25hbWUnOiAnYmFybmV5JyB9O1xuICogZGVmYXVsdHMob2JqZWN0LCB7ICduYW1lJzogJ2ZyZWQnLCAnZW1wbG95ZXInOiAnc2xhdGUnIH0pO1xuICogLy8gPT4geyAnbmFtZSc6ICdiYXJuZXknLCAnZW1wbG95ZXInOiAnc2xhdGUnIH1cbiAqL1xudmFyIGFzc2lnbiA9IGZ1bmN0aW9uKG9iamVjdCwgc291cmNlLCBndWFyZCkge1xuICB2YXIgaW5kZXgsIGl0ZXJhYmxlID0gb2JqZWN0LCByZXN1bHQgPSBpdGVyYWJsZTtcbiAgaWYgKCFpdGVyYWJsZSkgcmV0dXJuIHJlc3VsdDtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHMsXG4gICAgICBhcmdzSW5kZXggPSAwLFxuICAgICAgYXJnc0xlbmd0aCA9IHR5cGVvZiBndWFyZCA9PSAnbnVtYmVyJyA/IDIgOiBhcmdzLmxlbmd0aDtcbiAgaWYgKGFyZ3NMZW5ndGggPiAzICYmIHR5cGVvZiBhcmdzW2FyZ3NMZW5ndGggLSAyXSA9PSAnZnVuY3Rpb24nKSB7XG4gICAgdmFyIGNhbGxiYWNrID0gYmFzZUNyZWF0ZUNhbGxiYWNrKGFyZ3NbLS1hcmdzTGVuZ3RoIC0gMV0sIGFyZ3NbYXJnc0xlbmd0aC0tXSwgMik7XG4gIH0gZWxzZSBpZiAoYXJnc0xlbmd0aCA+IDIgJiYgdHlwZW9mIGFyZ3NbYXJnc0xlbmd0aCAtIDFdID09ICdmdW5jdGlvbicpIHtcbiAgICBjYWxsYmFjayA9IGFyZ3NbLS1hcmdzTGVuZ3RoXTtcbiAgfVxuICB3aGlsZSAoKythcmdzSW5kZXggPCBhcmdzTGVuZ3RoKSB7XG4gICAgaXRlcmFibGUgPSBhcmdzW2FyZ3NJbmRleF07XG4gICAgaWYgKGl0ZXJhYmxlICYmIG9iamVjdFR5cGVzW3R5cGVvZiBpdGVyYWJsZV0pIHtcbiAgICB2YXIgb3duSW5kZXggPSAtMSxcbiAgICAgICAgb3duUHJvcHMgPSBvYmplY3RUeXBlc1t0eXBlb2YgaXRlcmFibGVdICYmIGtleXMoaXRlcmFibGUpLFxuICAgICAgICBsZW5ndGggPSBvd25Qcm9wcyA/IG93blByb3BzLmxlbmd0aCA6IDA7XG5cbiAgICB3aGlsZSAoKytvd25JbmRleCA8IGxlbmd0aCkge1xuICAgICAgaW5kZXggPSBvd25Qcm9wc1tvd25JbmRleF07XG4gICAgICByZXN1bHRbaW5kZXhdID0gY2FsbGJhY2sgPyBjYWxsYmFjayhyZXN1bHRbaW5kZXhdLCBpdGVyYWJsZVtpbmRleF0pIDogaXRlcmFibGVbaW5kZXhdO1xuICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBhc3NpZ247XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogVXNlZCB0byBkZXRlcm1pbmUgaWYgdmFsdWVzIGFyZSBvZiB0aGUgbGFuZ3VhZ2UgdHlwZSBPYmplY3QgKi9cbnZhciBvYmplY3RUeXBlcyA9IHtcbiAgJ2Jvb2xlYW4nOiBmYWxzZSxcbiAgJ2Z1bmN0aW9uJzogdHJ1ZSxcbiAgJ29iamVjdCc6IHRydWUsXG4gICdudW1iZXInOiBmYWxzZSxcbiAgJ3N0cmluZyc6IGZhbHNlLFxuICAndW5kZWZpbmVkJzogZmFsc2Vcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gb2JqZWN0VHlwZXM7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGlzTmF0aXZlID0gcmVxdWlyZSgnbG9kYXNoLl9pc25hdGl2ZScpLFxuICAgIGlzT2JqZWN0ID0gcmVxdWlyZSgnbG9kYXNoLmlzb2JqZWN0JyksXG4gICAgc2hpbUtleXMgPSByZXF1aXJlKCdsb2Rhc2guX3NoaW1rZXlzJyk7XG5cbi8qIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzIGZvciBtZXRob2RzIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzICovXG52YXIgbmF0aXZlS2V5cyA9IGlzTmF0aXZlKG5hdGl2ZUtleXMgPSBPYmplY3Qua2V5cykgJiYgbmF0aXZlS2V5cztcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IGNvbXBvc2VkIG9mIHRoZSBvd24gZW51bWVyYWJsZSBwcm9wZXJ0eSBuYW1lcyBvZiBhbiBvYmplY3QuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gaW5zcGVjdC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBhbiBhcnJheSBvZiBwcm9wZXJ0eSBuYW1lcy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5rZXlzKHsgJ29uZSc6IDEsICd0d28nOiAyLCAndGhyZWUnOiAzIH0pO1xuICogLy8gPT4gWydvbmUnLCAndHdvJywgJ3RocmVlJ10gKHByb3BlcnR5IG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkIGFjcm9zcyBlbnZpcm9ubWVudHMpXG4gKi9cbnZhciBrZXlzID0gIW5hdGl2ZUtleXMgPyBzaGltS2V5cyA6IGZ1bmN0aW9uKG9iamVjdCkge1xuICBpZiAoIWlzT2JqZWN0KG9iamVjdCkpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgcmV0dXJuIG5hdGl2ZUtleXMob2JqZWN0KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ga2V5cztcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIFtbQ2xhc3NdXSBvZiB2YWx1ZXMgKi9cbnZhciB0b1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgaWYgYSBtZXRob2QgaXMgbmF0aXZlICovXG52YXIgcmVOYXRpdmUgPSBSZWdFeHAoJ14nICtcbiAgU3RyaW5nKHRvU3RyaW5nKVxuICAgIC5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgJ1xcXFwkJicpXG4gICAgLnJlcGxhY2UoL3RvU3RyaW5nfCBmb3IgW15cXF1dKy9nLCAnLio/JykgKyAnJCdcbik7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSBuYXRpdmUgZnVuY3Rpb24uXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBgdmFsdWVgIGlzIGEgbmF0aXZlIGZ1bmN0aW9uLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzTmF0aXZlKHZhbHVlKSB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT0gJ2Z1bmN0aW9uJyAmJiByZU5hdGl2ZS50ZXN0KHZhbHVlKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc05hdGl2ZTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgb2JqZWN0VHlwZXMgPSByZXF1aXJlKCdsb2Rhc2guX29iamVjdHR5cGVzJyk7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogQSBmYWxsYmFjayBpbXBsZW1lbnRhdGlvbiBvZiBgT2JqZWN0LmtleXNgIHdoaWNoIHByb2R1Y2VzIGFuIGFycmF5IG9mIHRoZVxuICogZ2l2ZW4gb2JqZWN0J3Mgb3duIGVudW1lcmFibGUgcHJvcGVydHkgbmFtZXMuXG4gKlxuICogQHByaXZhdGVcbiAqIEB0eXBlIEZ1bmN0aW9uXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gaW5zcGVjdC5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBhbiBhcnJheSBvZiBwcm9wZXJ0eSBuYW1lcy5cbiAqL1xudmFyIHNoaW1LZXlzID0gZnVuY3Rpb24ob2JqZWN0KSB7XG4gIHZhciBpbmRleCwgaXRlcmFibGUgPSBvYmplY3QsIHJlc3VsdCA9IFtdO1xuICBpZiAoIWl0ZXJhYmxlKSByZXR1cm4gcmVzdWx0O1xuICBpZiAoIShvYmplY3RUeXBlc1t0eXBlb2Ygb2JqZWN0XSkpIHJldHVybiByZXN1bHQ7XG4gICAgZm9yIChpbmRleCBpbiBpdGVyYWJsZSkge1xuICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwoaXRlcmFibGUsIGluZGV4KSkge1xuICAgICAgICByZXN1bHQucHVzaChpbmRleCk7XG4gICAgICB9XG4gICAgfVxuICByZXR1cm4gcmVzdWx0XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHNoaW1LZXlzO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlQ3JlYXRlQ2FsbGJhY2sgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2VjcmVhdGVjYWxsYmFjaycpLFxuICAgIGtleXMgPSByZXF1aXJlKCdsb2Rhc2gua2V5cycpLFxuICAgIG9iamVjdFR5cGVzID0gcmVxdWlyZSgnbG9kYXNoLl9vYmplY3R0eXBlcycpO1xuXG4vKipcbiAqIEl0ZXJhdGVzIG92ZXIgb3duIGVudW1lcmFibGUgcHJvcGVydGllcyBvZiBhbiBvYmplY3QsIGV4ZWN1dGluZyB0aGUgY2FsbGJhY2tcbiAqIGZvciBlYWNoIHByb3BlcnR5LiBUaGUgY2FsbGJhY2sgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGggdGhyZWVcbiAqIGFyZ3VtZW50czsgKHZhbHVlLCBrZXksIG9iamVjdCkuIENhbGxiYWNrcyBtYXkgZXhpdCBpdGVyYXRpb24gZWFybHkgYnlcbiAqIGV4cGxpY2l0bHkgcmV0dXJuaW5nIGBmYWxzZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEB0eXBlIEZ1bmN0aW9uXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFjaz1pZGVudGl0eV0gVGhlIGZ1bmN0aW9uIGNhbGxlZCBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBjYWxsYmFja2AuXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBSZXR1cm5zIGBvYmplY3RgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmZvck93bih7ICcwJzogJ3plcm8nLCAnMSc6ICdvbmUnLCAnbGVuZ3RoJzogMiB9LCBmdW5jdGlvbihudW0sIGtleSkge1xuICogICBjb25zb2xlLmxvZyhrZXkpO1xuICogfSk7XG4gKiAvLyA9PiBsb2dzICcwJywgJzEnLCBhbmQgJ2xlbmd0aCcgKHByb3BlcnR5IG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkIGFjcm9zcyBlbnZpcm9ubWVudHMpXG4gKi9cbnZhciBmb3JPd24gPSBmdW5jdGlvbihjb2xsZWN0aW9uLCBjYWxsYmFjaywgdGhpc0FyZykge1xuICB2YXIgaW5kZXgsIGl0ZXJhYmxlID0gY29sbGVjdGlvbiwgcmVzdWx0ID0gaXRlcmFibGU7XG4gIGlmICghaXRlcmFibGUpIHJldHVybiByZXN1bHQ7XG4gIGlmICghb2JqZWN0VHlwZXNbdHlwZW9mIGl0ZXJhYmxlXSkgcmV0dXJuIHJlc3VsdDtcbiAgY2FsbGJhY2sgPSBjYWxsYmFjayAmJiB0eXBlb2YgdGhpc0FyZyA9PSAndW5kZWZpbmVkJyA/IGNhbGxiYWNrIDogYmFzZUNyZWF0ZUNhbGxiYWNrKGNhbGxiYWNrLCB0aGlzQXJnLCAzKTtcbiAgICB2YXIgb3duSW5kZXggPSAtMSxcbiAgICAgICAgb3duUHJvcHMgPSBvYmplY3RUeXBlc1t0eXBlb2YgaXRlcmFibGVdICYmIGtleXMoaXRlcmFibGUpLFxuICAgICAgICBsZW5ndGggPSBvd25Qcm9wcyA/IG93blByb3BzLmxlbmd0aCA6IDA7XG5cbiAgICB3aGlsZSAoKytvd25JbmRleCA8IGxlbmd0aCkge1xuICAgICAgaW5kZXggPSBvd25Qcm9wc1tvd25JbmRleF07XG4gICAgICBpZiAoY2FsbGJhY2soaXRlcmFibGVbaW5kZXhdLCBpbmRleCwgY29sbGVjdGlvbikgPT09IGZhbHNlKSByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgcmV0dXJuIHJlc3VsdFxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmb3JPd247XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIG9iamVjdFR5cGVzID0gcmVxdWlyZSgnbG9kYXNoLl9vYmplY3R0eXBlcycpO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIHRoZSBsYW5ndWFnZSB0eXBlIG9mIE9iamVjdC5cbiAqIChlLmcuIGFycmF5cywgZnVuY3Rpb25zLCBvYmplY3RzLCByZWdleGVzLCBgbmV3IE51bWJlcigwKWAsIGFuZCBgbmV3IFN0cmluZygnJylgKVxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGB2YWx1ZWAgaXMgYW4gb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNPYmplY3Qoe30pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KDEpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNPYmplY3QodmFsdWUpIHtcbiAgLy8gY2hlY2sgaWYgdGhlIHZhbHVlIGlzIHRoZSBFQ01BU2NyaXB0IGxhbmd1YWdlIHR5cGUgb2YgT2JqZWN0XG4gIC8vIGh0dHA6Ly9lczUuZ2l0aHViLmlvLyN4OFxuICAvLyBhbmQgYXZvaWQgYSBWOCBidWdcbiAgLy8gaHR0cDovL2NvZGUuZ29vZ2xlLmNvbS9wL3Y4L2lzc3Vlcy9kZXRhaWw/aWQ9MjI5MVxuICByZXR1cm4gISEodmFsdWUgJiYgb2JqZWN0VHlwZXNbdHlwZW9mIHZhbHVlXSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNPYmplY3Q7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJpbmQgPSByZXF1aXJlKCdsb2Rhc2guYmluZCcpLFxuICAgIGlkZW50aXR5ID0gcmVxdWlyZSgnbG9kYXNoLmlkZW50aXR5JyksXG4gICAgc2V0QmluZERhdGEgPSByZXF1aXJlKCdsb2Rhc2guX3NldGJpbmRkYXRhJyksXG4gICAgc3VwcG9ydCA9IHJlcXVpcmUoJ2xvZGFzaC5zdXBwb3J0Jyk7XG5cbi8qKiBVc2VkIHRvIGRldGVjdGVkIG5hbWVkIGZ1bmN0aW9ucyAqL1xudmFyIHJlRnVuY05hbWUgPSAvXlxccypmdW5jdGlvblsgXFxuXFxyXFx0XStcXHcvO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgZnVuY3Rpb25zIGNvbnRhaW5pbmcgYSBgdGhpc2AgcmVmZXJlbmNlICovXG52YXIgcmVUaGlzID0gL1xcYnRoaXNcXGIvO1xuXG4vKiogTmF0aXZlIG1ldGhvZCBzaG9ydGN1dHMgKi9cbnZhciBmblRvU3RyaW5nID0gRnVuY3Rpb24ucHJvdG90eXBlLnRvU3RyaW5nO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmNyZWF0ZUNhbGxiYWNrYCB3aXRob3V0IHN1cHBvcnQgZm9yIGNyZWF0aW5nXG4gKiBcIl8ucGx1Y2tcIiBvciBcIl8ud2hlcmVcIiBzdHlsZSBjYWxsYmFja3MuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gW2Z1bmM9aWRlbnRpdHldIFRoZSB2YWx1ZSB0byBjb252ZXJ0IHRvIGEgY2FsbGJhY2suXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgdGhlIGNyZWF0ZWQgY2FsbGJhY2suXG4gKiBAcGFyYW0ge251bWJlcn0gW2FyZ0NvdW50XSBUaGUgbnVtYmVyIG9mIGFyZ3VtZW50cyB0aGUgY2FsbGJhY2sgYWNjZXB0cy5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyBhIGNhbGxiYWNrIGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBiYXNlQ3JlYXRlQ2FsbGJhY2soZnVuYywgdGhpc0FyZywgYXJnQ291bnQpIHtcbiAgaWYgKHR5cGVvZiBmdW5jICE9ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gaWRlbnRpdHk7XG4gIH1cbiAgLy8gZXhpdCBlYXJseSBmb3Igbm8gYHRoaXNBcmdgIG9yIGFscmVhZHkgYm91bmQgYnkgYEZ1bmN0aW9uI2JpbmRgXG4gIGlmICh0eXBlb2YgdGhpc0FyZyA9PSAndW5kZWZpbmVkJyB8fCAhKCdwcm90b3R5cGUnIGluIGZ1bmMpKSB7XG4gICAgcmV0dXJuIGZ1bmM7XG4gIH1cbiAgdmFyIGJpbmREYXRhID0gZnVuYy5fX2JpbmREYXRhX187XG4gIGlmICh0eXBlb2YgYmluZERhdGEgPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAoc3VwcG9ydC5mdW5jTmFtZXMpIHtcbiAgICAgIGJpbmREYXRhID0gIWZ1bmMubmFtZTtcbiAgICB9XG4gICAgYmluZERhdGEgPSBiaW5kRGF0YSB8fCAhc3VwcG9ydC5mdW5jRGVjb21wO1xuICAgIGlmICghYmluZERhdGEpIHtcbiAgICAgIHZhciBzb3VyY2UgPSBmblRvU3RyaW5nLmNhbGwoZnVuYyk7XG4gICAgICBpZiAoIXN1cHBvcnQuZnVuY05hbWVzKSB7XG4gICAgICAgIGJpbmREYXRhID0gIXJlRnVuY05hbWUudGVzdChzb3VyY2UpO1xuICAgICAgfVxuICAgICAgaWYgKCFiaW5kRGF0YSkge1xuICAgICAgICAvLyBjaGVja3MgaWYgYGZ1bmNgIHJlZmVyZW5jZXMgdGhlIGB0aGlzYCBrZXl3b3JkIGFuZCBzdG9yZXMgdGhlIHJlc3VsdFxuICAgICAgICBiaW5kRGF0YSA9IHJlVGhpcy50ZXN0KHNvdXJjZSk7XG4gICAgICAgIHNldEJpbmREYXRhKGZ1bmMsIGJpbmREYXRhKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgLy8gZXhpdCBlYXJseSBpZiB0aGVyZSBhcmUgbm8gYHRoaXNgIHJlZmVyZW5jZXMgb3IgYGZ1bmNgIGlzIGJvdW5kXG4gIGlmIChiaW5kRGF0YSA9PT0gZmFsc2UgfHwgKGJpbmREYXRhICE9PSB0cnVlICYmIGJpbmREYXRhWzFdICYgMSkpIHtcbiAgICByZXR1cm4gZnVuYztcbiAgfVxuICBzd2l0Y2ggKGFyZ0NvdW50KSB7XG4gICAgY2FzZSAxOiByZXR1cm4gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHJldHVybiBmdW5jLmNhbGwodGhpc0FyZywgdmFsdWUpO1xuICAgIH07XG4gICAgY2FzZSAyOiByZXR1cm4gZnVuY3Rpb24oYSwgYikge1xuICAgICAgcmV0dXJuIGZ1bmMuY2FsbCh0aGlzQXJnLCBhLCBiKTtcbiAgICB9O1xuICAgIGNhc2UgMzogcmV0dXJuIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbikge1xuICAgICAgcmV0dXJuIGZ1bmMuY2FsbCh0aGlzQXJnLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgIH07XG4gICAgY2FzZSA0OiByZXR1cm4gZnVuY3Rpb24oYWNjdW11bGF0b3IsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbikge1xuICAgICAgcmV0dXJuIGZ1bmMuY2FsbCh0aGlzQXJnLCBhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKTtcbiAgICB9O1xuICB9XG4gIHJldHVybiBiaW5kKGZ1bmMsIHRoaXNBcmcpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VDcmVhdGVDYWxsYmFjaztcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgaXNOYXRpdmUgPSByZXF1aXJlKCdsb2Rhc2guX2lzbmF0aXZlJyksXG4gICAgbm9vcCA9IHJlcXVpcmUoJ2xvZGFzaC5ub29wJyk7XG5cbi8qKiBVc2VkIGFzIHRoZSBwcm9wZXJ0eSBkZXNjcmlwdG9yIGZvciBgX19iaW5kRGF0YV9fYCAqL1xudmFyIGRlc2NyaXB0b3IgPSB7XG4gICdjb25maWd1cmFibGUnOiBmYWxzZSxcbiAgJ2VudW1lcmFibGUnOiBmYWxzZSxcbiAgJ3ZhbHVlJzogbnVsbCxcbiAgJ3dyaXRhYmxlJzogZmFsc2Vcbn07XG5cbi8qKiBVc2VkIHRvIHNldCBtZXRhIGRhdGEgb24gZnVuY3Rpb25zICovXG52YXIgZGVmaW5lUHJvcGVydHkgPSAoZnVuY3Rpb24oKSB7XG4gIC8vIElFIDggb25seSBhY2NlcHRzIERPTSBlbGVtZW50c1xuICB0cnkge1xuICAgIHZhciBvID0ge30sXG4gICAgICAgIGZ1bmMgPSBpc05hdGl2ZShmdW5jID0gT2JqZWN0LmRlZmluZVByb3BlcnR5KSAmJiBmdW5jLFxuICAgICAgICByZXN1bHQgPSBmdW5jKG8sIG8sIG8pICYmIGZ1bmM7XG4gIH0gY2F0Y2goZSkgeyB9XG4gIHJldHVybiByZXN1bHQ7XG59KCkpO1xuXG4vKipcbiAqIFNldHMgYHRoaXNgIGJpbmRpbmcgZGF0YSBvbiBhIGdpdmVuIGZ1bmN0aW9uLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBzZXQgZGF0YSBvbi5cbiAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlIFRoZSBkYXRhIGFycmF5IHRvIHNldC5cbiAqL1xudmFyIHNldEJpbmREYXRhID0gIWRlZmluZVByb3BlcnR5ID8gbm9vcCA6IGZ1bmN0aW9uKGZ1bmMsIHZhbHVlKSB7XG4gIGRlc2NyaXB0b3IudmFsdWUgPSB2YWx1ZTtcbiAgZGVmaW5lUHJvcGVydHkoZnVuYywgJ19fYmluZERhdGFfXycsIGRlc2NyaXB0b3IpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBzZXRCaW5kRGF0YTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKlxuICogQSBuby1vcGVyYXRpb24gZnVuY3Rpb24uXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBVdGlsaXRpZXNcbiAqIEBleGFtcGxlXG4gKlxuICogdmFyIG9iamVjdCA9IHsgJ25hbWUnOiAnZnJlZCcgfTtcbiAqIF8ubm9vcChvYmplY3QpID09PSB1bmRlZmluZWQ7XG4gKiAvLyA9PiB0cnVlXG4gKi9cbmZ1bmN0aW9uIG5vb3AoKSB7XG4gIC8vIG5vIG9wZXJhdGlvbiBwZXJmb3JtZWRcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBub29wO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBjcmVhdGVXcmFwcGVyID0gcmVxdWlyZSgnbG9kYXNoLl9jcmVhdGV3cmFwcGVyJyksXG4gICAgc2xpY2UgPSByZXF1aXJlKCdsb2Rhc2guX3NsaWNlJyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIGZ1bmN0aW9uIHRoYXQsIHdoZW4gY2FsbGVkLCBpbnZva2VzIGBmdW5jYCB3aXRoIHRoZSBgdGhpc2BcbiAqIGJpbmRpbmcgb2YgYHRoaXNBcmdgIGFuZCBwcmVwZW5kcyBhbnkgYWRkaXRpb25hbCBgYmluZGAgYXJndW1lbnRzIHRvIHRob3NlXG4gKiBwcm92aWRlZCB0byB0aGUgYm91bmQgZnVuY3Rpb24uXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBGdW5jdGlvbnNcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgVGhlIGZ1bmN0aW9uIHRvIGJpbmQuXG4gKiBAcGFyYW0geyp9IFt0aGlzQXJnXSBUaGUgYHRoaXNgIGJpbmRpbmcgb2YgYGZ1bmNgLlxuICogQHBhcmFtIHsuLi4qfSBbYXJnXSBBcmd1bWVudHMgdG8gYmUgcGFydGlhbGx5IGFwcGxpZWQuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBib3VuZCBmdW5jdGlvbi5cbiAqIEBleGFtcGxlXG4gKlxuICogdmFyIGZ1bmMgPSBmdW5jdGlvbihncmVldGluZykge1xuICogICByZXR1cm4gZ3JlZXRpbmcgKyAnICcgKyB0aGlzLm5hbWU7XG4gKiB9O1xuICpcbiAqIGZ1bmMgPSBfLmJpbmQoZnVuYywgeyAnbmFtZSc6ICdmcmVkJyB9LCAnaGknKTtcbiAqIGZ1bmMoKTtcbiAqIC8vID0+ICdoaSBmcmVkJ1xuICovXG5mdW5jdGlvbiBiaW5kKGZ1bmMsIHRoaXNBcmcpIHtcbiAgcmV0dXJuIGFyZ3VtZW50cy5sZW5ndGggPiAyXG4gICAgPyBjcmVhdGVXcmFwcGVyKGZ1bmMsIDE3LCBzbGljZShhcmd1bWVudHMsIDIpLCBudWxsLCB0aGlzQXJnKVxuICAgIDogY3JlYXRlV3JhcHBlcihmdW5jLCAxLCBudWxsLCBudWxsLCB0aGlzQXJnKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiaW5kO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlQmluZCA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWJpbmQnKSxcbiAgICBiYXNlQ3JlYXRlV3JhcHBlciA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWNyZWF0ZXdyYXBwZXInKSxcbiAgICBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnbG9kYXNoLmlzZnVuY3Rpb24nKSxcbiAgICBzbGljZSA9IHJlcXVpcmUoJ2xvZGFzaC5fc2xpY2UnKTtcblxuLyoqXG4gKiBVc2VkIGZvciBgQXJyYXlgIG1ldGhvZCByZWZlcmVuY2VzLlxuICpcbiAqIE5vcm1hbGx5IGBBcnJheS5wcm90b3R5cGVgIHdvdWxkIHN1ZmZpY2UsIGhvd2V2ZXIsIHVzaW5nIGFuIGFycmF5IGxpdGVyYWxcbiAqIGF2b2lkcyBpc3N1ZXMgaW4gTmFyd2hhbC5cbiAqL1xudmFyIGFycmF5UmVmID0gW107XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyAqL1xudmFyIHB1c2ggPSBhcnJheVJlZi5wdXNoLFxuICAgIHVuc2hpZnQgPSBhcnJheVJlZi51bnNoaWZ0O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBmdW5jdGlvbiB0aGF0LCB3aGVuIGNhbGxlZCwgZWl0aGVyIGN1cnJpZXMgb3IgaW52b2tlcyBgZnVuY2BcbiAqIHdpdGggYW4gb3B0aW9uYWwgYHRoaXNgIGJpbmRpbmcgYW5kIHBhcnRpYWxseSBhcHBsaWVkIGFyZ3VtZW50cy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtGdW5jdGlvbnxzdHJpbmd9IGZ1bmMgVGhlIGZ1bmN0aW9uIG9yIG1ldGhvZCBuYW1lIHRvIHJlZmVyZW5jZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBiaXRtYXNrIFRoZSBiaXRtYXNrIG9mIG1ldGhvZCBmbGFncyB0byBjb21wb3NlLlxuICogIFRoZSBiaXRtYXNrIG1heSBiZSBjb21wb3NlZCBvZiB0aGUgZm9sbG93aW5nIGZsYWdzOlxuICogIDEgLSBgXy5iaW5kYFxuICogIDIgLSBgXy5iaW5kS2V5YFxuICogIDQgLSBgXy5jdXJyeWBcbiAqICA4IC0gYF8uY3VycnlgIChib3VuZClcbiAqICAxNiAtIGBfLnBhcnRpYWxgXG4gKiAgMzIgLSBgXy5wYXJ0aWFsUmlnaHRgXG4gKiBAcGFyYW0ge0FycmF5fSBbcGFydGlhbEFyZ3NdIEFuIGFycmF5IG9mIGFyZ3VtZW50cyB0byBwcmVwZW5kIHRvIHRob3NlXG4gKiAgcHJvdmlkZWQgdG8gdGhlIG5ldyBmdW5jdGlvbi5cbiAqIEBwYXJhbSB7QXJyYXl9IFtwYXJ0aWFsUmlnaHRBcmdzXSBBbiBhcnJheSBvZiBhcmd1bWVudHMgdG8gYXBwZW5kIHRvIHRob3NlXG4gKiAgcHJvdmlkZWQgdG8gdGhlIG5ldyBmdW5jdGlvbi5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgZnVuY2AuXG4gKiBAcGFyYW0ge251bWJlcn0gW2FyaXR5XSBUaGUgYXJpdHkgb2YgYGZ1bmNgLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVdyYXBwZXIoZnVuYywgYml0bWFzaywgcGFydGlhbEFyZ3MsIHBhcnRpYWxSaWdodEFyZ3MsIHRoaXNBcmcsIGFyaXR5KSB7XG4gIHZhciBpc0JpbmQgPSBiaXRtYXNrICYgMSxcbiAgICAgIGlzQmluZEtleSA9IGJpdG1hc2sgJiAyLFxuICAgICAgaXNDdXJyeSA9IGJpdG1hc2sgJiA0LFxuICAgICAgaXNDdXJyeUJvdW5kID0gYml0bWFzayAmIDgsXG4gICAgICBpc1BhcnRpYWwgPSBiaXRtYXNrICYgMTYsXG4gICAgICBpc1BhcnRpYWxSaWdodCA9IGJpdG1hc2sgJiAzMjtcblxuICBpZiAoIWlzQmluZEtleSAmJiAhaXNGdW5jdGlvbihmdW5jKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3I7XG4gIH1cbiAgaWYgKGlzUGFydGlhbCAmJiAhcGFydGlhbEFyZ3MubGVuZ3RoKSB7XG4gICAgYml0bWFzayAmPSB+MTY7XG4gICAgaXNQYXJ0aWFsID0gcGFydGlhbEFyZ3MgPSBmYWxzZTtcbiAgfVxuICBpZiAoaXNQYXJ0aWFsUmlnaHQgJiYgIXBhcnRpYWxSaWdodEFyZ3MubGVuZ3RoKSB7XG4gICAgYml0bWFzayAmPSB+MzI7XG4gICAgaXNQYXJ0aWFsUmlnaHQgPSBwYXJ0aWFsUmlnaHRBcmdzID0gZmFsc2U7XG4gIH1cbiAgdmFyIGJpbmREYXRhID0gZnVuYyAmJiBmdW5jLl9fYmluZERhdGFfXztcbiAgaWYgKGJpbmREYXRhICYmIGJpbmREYXRhICE9PSB0cnVlKSB7XG4gICAgLy8gY2xvbmUgYGJpbmREYXRhYFxuICAgIGJpbmREYXRhID0gc2xpY2UoYmluZERhdGEpO1xuICAgIGlmIChiaW5kRGF0YVsyXSkge1xuICAgICAgYmluZERhdGFbMl0gPSBzbGljZShiaW5kRGF0YVsyXSk7XG4gICAgfVxuICAgIGlmIChiaW5kRGF0YVszXSkge1xuICAgICAgYmluZERhdGFbM10gPSBzbGljZShiaW5kRGF0YVszXSk7XG4gICAgfVxuICAgIC8vIHNldCBgdGhpc0JpbmRpbmdgIGlzIG5vdCBwcmV2aW91c2x5IGJvdW5kXG4gICAgaWYgKGlzQmluZCAmJiAhKGJpbmREYXRhWzFdICYgMSkpIHtcbiAgICAgIGJpbmREYXRhWzRdID0gdGhpc0FyZztcbiAgICB9XG4gICAgLy8gc2V0IGlmIHByZXZpb3VzbHkgYm91bmQgYnV0IG5vdCBjdXJyZW50bHkgKHN1YnNlcXVlbnQgY3VycmllZCBmdW5jdGlvbnMpXG4gICAgaWYgKCFpc0JpbmQgJiYgYmluZERhdGFbMV0gJiAxKSB7XG4gICAgICBiaXRtYXNrIHw9IDg7XG4gICAgfVxuICAgIC8vIHNldCBjdXJyaWVkIGFyaXR5IGlmIG5vdCB5ZXQgc2V0XG4gICAgaWYgKGlzQ3VycnkgJiYgIShiaW5kRGF0YVsxXSAmIDQpKSB7XG4gICAgICBiaW5kRGF0YVs1XSA9IGFyaXR5O1xuICAgIH1cbiAgICAvLyBhcHBlbmQgcGFydGlhbCBsZWZ0IGFyZ3VtZW50c1xuICAgIGlmIChpc1BhcnRpYWwpIHtcbiAgICAgIHB1c2guYXBwbHkoYmluZERhdGFbMl0gfHwgKGJpbmREYXRhWzJdID0gW10pLCBwYXJ0aWFsQXJncyk7XG4gICAgfVxuICAgIC8vIGFwcGVuZCBwYXJ0aWFsIHJpZ2h0IGFyZ3VtZW50c1xuICAgIGlmIChpc1BhcnRpYWxSaWdodCkge1xuICAgICAgdW5zaGlmdC5hcHBseShiaW5kRGF0YVszXSB8fCAoYmluZERhdGFbM10gPSBbXSksIHBhcnRpYWxSaWdodEFyZ3MpO1xuICAgIH1cbiAgICAvLyBtZXJnZSBmbGFnc1xuICAgIGJpbmREYXRhWzFdIHw9IGJpdG1hc2s7XG4gICAgcmV0dXJuIGNyZWF0ZVdyYXBwZXIuYXBwbHkobnVsbCwgYmluZERhdGEpO1xuICB9XG4gIC8vIGZhc3QgcGF0aCBmb3IgYF8uYmluZGBcbiAgdmFyIGNyZWF0ZXIgPSAoYml0bWFzayA9PSAxIHx8IGJpdG1hc2sgPT09IDE3KSA/IGJhc2VCaW5kIDogYmFzZUNyZWF0ZVdyYXBwZXI7XG4gIHJldHVybiBjcmVhdGVyKFtmdW5jLCBiaXRtYXNrLCBwYXJ0aWFsQXJncywgcGFydGlhbFJpZ2h0QXJncywgdGhpc0FyZywgYXJpdHldKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVXcmFwcGVyO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlQ3JlYXRlID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlY3JlYXRlJyksXG4gICAgaXNPYmplY3QgPSByZXF1aXJlKCdsb2Rhc2guaXNvYmplY3QnKSxcbiAgICBzZXRCaW5kRGF0YSA9IHJlcXVpcmUoJ2xvZGFzaC5fc2V0YmluZGRhdGEnKSxcbiAgICBzbGljZSA9IHJlcXVpcmUoJ2xvZGFzaC5fc2xpY2UnKTtcblxuLyoqXG4gKiBVc2VkIGZvciBgQXJyYXlgIG1ldGhvZCByZWZlcmVuY2VzLlxuICpcbiAqIE5vcm1hbGx5IGBBcnJheS5wcm90b3R5cGVgIHdvdWxkIHN1ZmZpY2UsIGhvd2V2ZXIsIHVzaW5nIGFuIGFycmF5IGxpdGVyYWxcbiAqIGF2b2lkcyBpc3N1ZXMgaW4gTmFyd2hhbC5cbiAqL1xudmFyIGFycmF5UmVmID0gW107XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyAqL1xudmFyIHB1c2ggPSBhcnJheVJlZi5wdXNoO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLmJpbmRgIHRoYXQgY3JlYXRlcyB0aGUgYm91bmQgZnVuY3Rpb24gYW5kXG4gKiBzZXRzIGl0cyBtZXRhIGRhdGEuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGJpbmREYXRhIFRoZSBiaW5kIGRhdGEgYXJyYXkuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBib3VuZCBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gYmFzZUJpbmQoYmluZERhdGEpIHtcbiAgdmFyIGZ1bmMgPSBiaW5kRGF0YVswXSxcbiAgICAgIHBhcnRpYWxBcmdzID0gYmluZERhdGFbMl0sXG4gICAgICB0aGlzQXJnID0gYmluZERhdGFbNF07XG5cbiAgZnVuY3Rpb24gYm91bmQoKSB7XG4gICAgLy8gYEZ1bmN0aW9uI2JpbmRgIHNwZWNcbiAgICAvLyBodHRwOi8vZXM1LmdpdGh1Yi5pby8jeDE1LjMuNC41XG4gICAgaWYgKHBhcnRpYWxBcmdzKSB7XG4gICAgICAvLyBhdm9pZCBgYXJndW1lbnRzYCBvYmplY3QgZGVvcHRpbWl6YXRpb25zIGJ5IHVzaW5nIGBzbGljZWAgaW5zdGVhZFxuICAgICAgLy8gb2YgYEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsYCBhbmQgbm90IGFzc2lnbmluZyBgYXJndW1lbnRzYCB0byBhXG4gICAgICAvLyB2YXJpYWJsZSBhcyBhIHRlcm5hcnkgZXhwcmVzc2lvblxuICAgICAgdmFyIGFyZ3MgPSBzbGljZShwYXJ0aWFsQXJncyk7XG4gICAgICBwdXNoLmFwcGx5KGFyZ3MsIGFyZ3VtZW50cyk7XG4gICAgfVxuICAgIC8vIG1pbWljIHRoZSBjb25zdHJ1Y3RvcidzIGByZXR1cm5gIGJlaGF2aW9yXG4gICAgLy8gaHR0cDovL2VzNS5naXRodWIuaW8vI3gxMy4yLjJcbiAgICBpZiAodGhpcyBpbnN0YW5jZW9mIGJvdW5kKSB7XG4gICAgICAvLyBlbnN1cmUgYG5ldyBib3VuZGAgaXMgYW4gaW5zdGFuY2Ugb2YgYGZ1bmNgXG4gICAgICB2YXIgdGhpc0JpbmRpbmcgPSBiYXNlQ3JlYXRlKGZ1bmMucHJvdG90eXBlKSxcbiAgICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KHRoaXNCaW5kaW5nLCBhcmdzIHx8IGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gaXNPYmplY3QocmVzdWx0KSA/IHJlc3VsdCA6IHRoaXNCaW5kaW5nO1xuICAgIH1cbiAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzQXJnLCBhcmdzIHx8IGFyZ3VtZW50cyk7XG4gIH1cbiAgc2V0QmluZERhdGEoYm91bmQsIGJpbmREYXRhKTtcbiAgcmV0dXJuIGJvdW5kO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VCaW5kO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJ2xvZGFzaC5faXNuYXRpdmUnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJ2xvZGFzaC5pc29iamVjdCcpLFxuICAgIG5vb3AgPSByZXF1aXJlKCdsb2Rhc2gubm9vcCcpO1xuXG4vKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyBmb3IgbWV0aG9kcyB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgb3RoZXIgYGxvZGFzaGAgbWV0aG9kcyAqL1xudmFyIG5hdGl2ZUNyZWF0ZSA9IGlzTmF0aXZlKG5hdGl2ZUNyZWF0ZSA9IE9iamVjdC5jcmVhdGUpICYmIG5hdGl2ZUNyZWF0ZTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5jcmVhdGVgIHdpdGhvdXQgc3VwcG9ydCBmb3IgYXNzaWduaW5nXG4gKiBwcm9wZXJ0aWVzIHRvIHRoZSBjcmVhdGVkIG9iamVjdC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IHByb3RvdHlwZSBUaGUgb2JqZWN0IHRvIGluaGVyaXQgZnJvbS5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgdGhlIG5ldyBvYmplY3QuXG4gKi9cbmZ1bmN0aW9uIGJhc2VDcmVhdGUocHJvdG90eXBlLCBwcm9wZXJ0aWVzKSB7XG4gIHJldHVybiBpc09iamVjdChwcm90b3R5cGUpID8gbmF0aXZlQ3JlYXRlKHByb3RvdHlwZSkgOiB7fTtcbn1cbi8vIGZhbGxiYWNrIGZvciBicm93c2VycyB3aXRob3V0IGBPYmplY3QuY3JlYXRlYFxuaWYgKCFuYXRpdmVDcmVhdGUpIHtcbiAgYmFzZUNyZWF0ZSA9IChmdW5jdGlvbigpIHtcbiAgICBmdW5jdGlvbiBPYmplY3QoKSB7fVxuICAgIHJldHVybiBmdW5jdGlvbihwcm90b3R5cGUpIHtcbiAgICAgIGlmIChpc09iamVjdChwcm90b3R5cGUpKSB7XG4gICAgICAgIE9iamVjdC5wcm90b3R5cGUgPSBwcm90b3R5cGU7XG4gICAgICAgIHZhciByZXN1bHQgPSBuZXcgT2JqZWN0O1xuICAgICAgICBPYmplY3QucHJvdG90eXBlID0gbnVsbDtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQgfHwgZ2xvYmFsLk9iamVjdCgpO1xuICAgIH07XG4gIH0oKSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUNyZWF0ZTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlQ3JlYXRlID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlY3JlYXRlJyksXG4gICAgaXNPYmplY3QgPSByZXF1aXJlKCdsb2Rhc2guaXNvYmplY3QnKSxcbiAgICBzZXRCaW5kRGF0YSA9IHJlcXVpcmUoJ2xvZGFzaC5fc2V0YmluZGRhdGEnKSxcbiAgICBzbGljZSA9IHJlcXVpcmUoJ2xvZGFzaC5fc2xpY2UnKTtcblxuLyoqXG4gKiBVc2VkIGZvciBgQXJyYXlgIG1ldGhvZCByZWZlcmVuY2VzLlxuICpcbiAqIE5vcm1hbGx5IGBBcnJheS5wcm90b3R5cGVgIHdvdWxkIHN1ZmZpY2UsIGhvd2V2ZXIsIHVzaW5nIGFuIGFycmF5IGxpdGVyYWxcbiAqIGF2b2lkcyBpc3N1ZXMgaW4gTmFyd2hhbC5cbiAqL1xudmFyIGFycmF5UmVmID0gW107XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyAqL1xudmFyIHB1c2ggPSBhcnJheVJlZi5wdXNoO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBjcmVhdGVXcmFwcGVyYCB0aGF0IGNyZWF0ZXMgdGhlIHdyYXBwZXIgYW5kXG4gKiBzZXRzIGl0cyBtZXRhIGRhdGEuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGJpbmREYXRhIFRoZSBiaW5kIGRhdGEgYXJyYXkuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gYmFzZUNyZWF0ZVdyYXBwZXIoYmluZERhdGEpIHtcbiAgdmFyIGZ1bmMgPSBiaW5kRGF0YVswXSxcbiAgICAgIGJpdG1hc2sgPSBiaW5kRGF0YVsxXSxcbiAgICAgIHBhcnRpYWxBcmdzID0gYmluZERhdGFbMl0sXG4gICAgICBwYXJ0aWFsUmlnaHRBcmdzID0gYmluZERhdGFbM10sXG4gICAgICB0aGlzQXJnID0gYmluZERhdGFbNF0sXG4gICAgICBhcml0eSA9IGJpbmREYXRhWzVdO1xuXG4gIHZhciBpc0JpbmQgPSBiaXRtYXNrICYgMSxcbiAgICAgIGlzQmluZEtleSA9IGJpdG1hc2sgJiAyLFxuICAgICAgaXNDdXJyeSA9IGJpdG1hc2sgJiA0LFxuICAgICAgaXNDdXJyeUJvdW5kID0gYml0bWFzayAmIDgsXG4gICAgICBrZXkgPSBmdW5jO1xuXG4gIGZ1bmN0aW9uIGJvdW5kKCkge1xuICAgIHZhciB0aGlzQmluZGluZyA9IGlzQmluZCA/IHRoaXNBcmcgOiB0aGlzO1xuICAgIGlmIChwYXJ0aWFsQXJncykge1xuICAgICAgdmFyIGFyZ3MgPSBzbGljZShwYXJ0aWFsQXJncyk7XG4gICAgICBwdXNoLmFwcGx5KGFyZ3MsIGFyZ3VtZW50cyk7XG4gICAgfVxuICAgIGlmIChwYXJ0aWFsUmlnaHRBcmdzIHx8IGlzQ3VycnkpIHtcbiAgICAgIGFyZ3MgfHwgKGFyZ3MgPSBzbGljZShhcmd1bWVudHMpKTtcbiAgICAgIGlmIChwYXJ0aWFsUmlnaHRBcmdzKSB7XG4gICAgICAgIHB1c2guYXBwbHkoYXJncywgcGFydGlhbFJpZ2h0QXJncyk7XG4gICAgICB9XG4gICAgICBpZiAoaXNDdXJyeSAmJiBhcmdzLmxlbmd0aCA8IGFyaXR5KSB7XG4gICAgICAgIGJpdG1hc2sgfD0gMTYgJiB+MzI7XG4gICAgICAgIHJldHVybiBiYXNlQ3JlYXRlV3JhcHBlcihbZnVuYywgKGlzQ3VycnlCb3VuZCA/IGJpdG1hc2sgOiBiaXRtYXNrICYgfjMpLCBhcmdzLCBudWxsLCB0aGlzQXJnLCBhcml0eV0pO1xuICAgICAgfVxuICAgIH1cbiAgICBhcmdzIHx8IChhcmdzID0gYXJndW1lbnRzKTtcbiAgICBpZiAoaXNCaW5kS2V5KSB7XG4gICAgICBmdW5jID0gdGhpc0JpbmRpbmdba2V5XTtcbiAgICB9XG4gICAgaWYgKHRoaXMgaW5zdGFuY2VvZiBib3VuZCkge1xuICAgICAgdGhpc0JpbmRpbmcgPSBiYXNlQ3JlYXRlKGZ1bmMucHJvdG90eXBlKTtcbiAgICAgIHZhciByZXN1bHQgPSBmdW5jLmFwcGx5KHRoaXNCaW5kaW5nLCBhcmdzKTtcbiAgICAgIHJldHVybiBpc09iamVjdChyZXN1bHQpID8gcmVzdWx0IDogdGhpc0JpbmRpbmc7XG4gICAgfVxuICAgIHJldHVybiBmdW5jLmFwcGx5KHRoaXNCaW5kaW5nLCBhcmdzKTtcbiAgfVxuICBzZXRCaW5kRGF0YShib3VuZCwgYmluZERhdGEpO1xuICByZXR1cm4gYm91bmQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUNyZWF0ZVdyYXBwZXI7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHJldHVybnMgdGhlIGZpcnN0IGFyZ3VtZW50IHByb3ZpZGVkIHRvIGl0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgVXRpbGl0aWVzXG4gKiBAcGFyYW0geyp9IHZhbHVlIEFueSB2YWx1ZS5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIGB2YWx1ZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBvYmplY3QgPSB7ICduYW1lJzogJ2ZyZWQnIH07XG4gKiBfLmlkZW50aXR5KG9iamVjdCkgPT09IG9iamVjdDtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaWRlbnRpdHkodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlkZW50aXR5O1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJ2xvZGFzaC5faXNuYXRpdmUnKTtcblxuLyoqIFVzZWQgdG8gZGV0ZWN0IGZ1bmN0aW9ucyBjb250YWluaW5nIGEgYHRoaXNgIHJlZmVyZW5jZSAqL1xudmFyIHJlVGhpcyA9IC9cXGJ0aGlzXFxiLztcblxuLyoqXG4gKiBBbiBvYmplY3QgdXNlZCB0byBmbGFnIGVudmlyb25tZW50cyBmZWF0dXJlcy5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHR5cGUgT2JqZWN0XG4gKi9cbnZhciBzdXBwb3J0ID0ge307XG5cbi8qKlxuICogRGV0ZWN0IGlmIGZ1bmN0aW9ucyBjYW4gYmUgZGVjb21waWxlZCBieSBgRnVuY3Rpb24jdG9TdHJpbmdgXG4gKiAoYWxsIGJ1dCBQUzMgYW5kIG9sZGVyIE9wZXJhIG1vYmlsZSBicm93c2VycyAmIGF2b2lkZWQgaW4gV2luZG93cyA4IGFwcHMpLlxuICpcbiAqIEBtZW1iZXJPZiBfLnN1cHBvcnRcbiAqIEB0eXBlIGJvb2xlYW5cbiAqL1xuc3VwcG9ydC5mdW5jRGVjb21wID0gIWlzTmF0aXZlKGdsb2JhbC5XaW5SVEVycm9yKSAmJiByZVRoaXMudGVzdChmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXM7IH0pO1xuXG4vKipcbiAqIERldGVjdCBpZiBgRnVuY3Rpb24jbmFtZWAgaXMgc3VwcG9ydGVkIChhbGwgYnV0IElFKS5cbiAqXG4gKiBAbWVtYmVyT2YgXy5zdXBwb3J0XG4gKiBAdHlwZSBib29sZWFuXG4gKi9cbnN1cHBvcnQuZnVuY05hbWVzID0gdHlwZW9mIEZ1bmN0aW9uLm5hbWUgPT0gJ3N0cmluZyc7XG5cbm1vZHVsZS5leHBvcnRzID0gc3VwcG9ydDtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlRGlmZmVyZW5jZSA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWRpZmZlcmVuY2UnKSxcbiAgICBiYXNlRmxhdHRlbiA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWZsYXR0ZW4nKTtcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IGV4Y2x1ZGluZyBhbGwgdmFsdWVzIG9mIHRoZSBwcm92aWRlZCBhcnJheXMgdXNpbmcgc3RyaWN0XG4gKiBlcXVhbGl0eSBmb3IgY29tcGFyaXNvbnMsIGkuZS4gYD09PWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBBcnJheXNcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBwcm9jZXNzLlxuICogQHBhcmFtIHsuLi5BcnJheX0gW3ZhbHVlc10gVGhlIGFycmF5cyBvZiB2YWx1ZXMgdG8gZXhjbHVkZS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBhIG5ldyBhcnJheSBvZiBmaWx0ZXJlZCB2YWx1ZXMuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uZGlmZmVyZW5jZShbMSwgMiwgMywgNCwgNV0sIFs1LCAyLCAxMF0pO1xuICogLy8gPT4gWzEsIDMsIDRdXG4gKi9cbmZ1bmN0aW9uIGRpZmZlcmVuY2UoYXJyYXkpIHtcbiAgcmV0dXJuIGJhc2VEaWZmZXJlbmNlKGFycmF5LCBiYXNlRmxhdHRlbihhcmd1bWVudHMsIHRydWUsIHRydWUsIDEpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBkaWZmZXJlbmNlO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlSW5kZXhPZiA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWluZGV4b2YnKSxcbiAgICBjYWNoZUluZGV4T2YgPSByZXF1aXJlKCdsb2Rhc2guX2NhY2hlaW5kZXhvZicpLFxuICAgIGNyZWF0ZUNhY2hlID0gcmVxdWlyZSgnbG9kYXNoLl9jcmVhdGVjYWNoZScpLFxuICAgIGxhcmdlQXJyYXlTaXplID0gcmVxdWlyZSgnbG9kYXNoLl9sYXJnZWFycmF5c2l6ZScpLFxuICAgIHJlbGVhc2VPYmplY3QgPSByZXF1aXJlKCdsb2Rhc2guX3JlbGVhc2VvYmplY3QnKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5kaWZmZXJlbmNlYCB0aGF0IGFjY2VwdHMgYSBzaW5nbGUgYXJyYXlcbiAqIG9mIHZhbHVlcyB0byBleGNsdWRlLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gcHJvY2Vzcy5cbiAqIEBwYXJhbSB7QXJyYXl9IFt2YWx1ZXNdIFRoZSBhcnJheSBvZiB2YWx1ZXMgdG8gZXhjbHVkZS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyBhIG5ldyBhcnJheSBvZiBmaWx0ZXJlZCB2YWx1ZXMuXG4gKi9cbmZ1bmN0aW9uIGJhc2VEaWZmZXJlbmNlKGFycmF5LCB2YWx1ZXMpIHtcbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBpbmRleE9mID0gYmFzZUluZGV4T2YsXG4gICAgICBsZW5ndGggPSBhcnJheSA/IGFycmF5Lmxlbmd0aCA6IDAsXG4gICAgICBpc0xhcmdlID0gbGVuZ3RoID49IGxhcmdlQXJyYXlTaXplLFxuICAgICAgcmVzdWx0ID0gW107XG5cbiAgaWYgKGlzTGFyZ2UpIHtcbiAgICB2YXIgY2FjaGUgPSBjcmVhdGVDYWNoZSh2YWx1ZXMpO1xuICAgIGlmIChjYWNoZSkge1xuICAgICAgaW5kZXhPZiA9IGNhY2hlSW5kZXhPZjtcbiAgICAgIHZhbHVlcyA9IGNhY2hlO1xuICAgIH0gZWxzZSB7XG4gICAgICBpc0xhcmdlID0gZmFsc2U7XG4gICAgfVxuICB9XG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgdmFyIHZhbHVlID0gYXJyYXlbaW5kZXhdO1xuICAgIGlmIChpbmRleE9mKHZhbHVlcywgdmFsdWUpIDwgMCkge1xuICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNMYXJnZSkge1xuICAgIHJlbGVhc2VPYmplY3QodmFsdWVzKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VEaWZmZXJlbmNlO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5pbmRleE9mYCB3aXRob3V0IHN1cHBvcnQgZm9yIGJpbmFyeSBzZWFyY2hlc1xuICogb3IgYGZyb21JbmRleGAgY29uc3RyYWludHMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBzZWFyY2guXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBzZWFyY2ggZm9yLlxuICogQHBhcmFtIHtudW1iZXJ9IFtmcm9tSW5kZXg9MF0gVGhlIGluZGV4IHRvIHNlYXJjaCBmcm9tLlxuICogQHJldHVybnMge251bWJlcn0gUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIG1hdGNoZWQgdmFsdWUgb3IgYC0xYC5cbiAqL1xuZnVuY3Rpb24gYmFzZUluZGV4T2YoYXJyYXksIHZhbHVlLCBmcm9tSW5kZXgpIHtcbiAgdmFyIGluZGV4ID0gKGZyb21JbmRleCB8fCAwKSAtIDEsXG4gICAgICBsZW5ndGggPSBhcnJheSA/IGFycmF5Lmxlbmd0aCA6IDA7XG5cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICBpZiAoYXJyYXlbaW5kZXhdID09PSB2YWx1ZSkge1xuICAgICAgcmV0dXJuIGluZGV4O1xuICAgIH1cbiAgfVxuICByZXR1cm4gLTE7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYmFzZUluZGV4T2Y7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VJbmRleE9mID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlaW5kZXhvZicpLFxuICAgIGtleVByZWZpeCA9IHJlcXVpcmUoJ2xvZGFzaC5fa2V5cHJlZml4Jyk7XG5cbi8qKlxuICogQW4gaW1wbGVtZW50YXRpb24gb2YgYF8uY29udGFpbnNgIGZvciBjYWNoZSBvYmplY3RzIHRoYXQgbWltaWNzIHRoZSByZXR1cm5cbiAqIHNpZ25hdHVyZSBvZiBgXy5pbmRleE9mYCBieSByZXR1cm5pbmcgYDBgIGlmIHRoZSB2YWx1ZSBpcyBmb3VuZCwgZWxzZSBgLTFgLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gY2FjaGUgVGhlIGNhY2hlIG9iamVjdCB0byBpbnNwZWN0LlxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gc2VhcmNoIGZvci5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFJldHVybnMgYDBgIGlmIGB2YWx1ZWAgaXMgZm91bmQsIGVsc2UgYC0xYC5cbiAqL1xuZnVuY3Rpb24gY2FjaGVJbmRleE9mKGNhY2hlLCB2YWx1ZSkge1xuICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgY2FjaGUgPSBjYWNoZS5jYWNoZTtcblxuICBpZiAodHlwZSA9PSAnYm9vbGVhbicgfHwgdmFsdWUgPT0gbnVsbCkge1xuICAgIHJldHVybiBjYWNoZVt2YWx1ZV0gPyAwIDogLTE7XG4gIH1cbiAgaWYgKHR5cGUgIT0gJ251bWJlcicgJiYgdHlwZSAhPSAnc3RyaW5nJykge1xuICAgIHR5cGUgPSAnb2JqZWN0JztcbiAgfVxuICB2YXIga2V5ID0gdHlwZSA9PSAnbnVtYmVyJyA/IHZhbHVlIDoga2V5UHJlZml4ICsgdmFsdWU7XG4gIGNhY2hlID0gKGNhY2hlID0gY2FjaGVbdHlwZV0pICYmIGNhY2hlW2tleV07XG5cbiAgcmV0dXJuIHR5cGUgPT0gJ29iamVjdCdcbiAgICA/IChjYWNoZSAmJiBiYXNlSW5kZXhPZihjYWNoZSwgdmFsdWUpID4gLTEgPyAwIDogLTEpXG4gICAgOiAoY2FjaGUgPyAwIDogLTEpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNhY2hlSW5kZXhPZjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMiAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTQgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBVc2VkIHRvIHByZWZpeCBrZXlzIHRvIGF2b2lkIGlzc3VlcyB3aXRoIGBfX3Byb3RvX19gIGFuZCBwcm9wZXJ0aWVzIG9uIGBPYmplY3QucHJvdG90eXBlYCAqL1xudmFyIGtleVByZWZpeCA9ICdfXzEzMzUyNDg4MzgwMDBfXyc7XG5cbm1vZHVsZS5leHBvcnRzID0ga2V5UHJlZml4O1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBjYWNoZVB1c2ggPSByZXF1aXJlKCdsb2Rhc2guX2NhY2hlcHVzaCcpLFxuICAgIGdldE9iamVjdCA9IHJlcXVpcmUoJ2xvZGFzaC5fZ2V0b2JqZWN0JyksXG4gICAgcmVsZWFzZU9iamVjdCA9IHJlcXVpcmUoJ2xvZGFzaC5fcmVsZWFzZW9iamVjdCcpO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBjYWNoZSBvYmplY3QgdG8gb3B0aW1pemUgbGluZWFyIHNlYXJjaGVzIG9mIGxhcmdlIGFycmF5cy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheX0gW2FycmF5PVtdXSBUaGUgYXJyYXkgdG8gc2VhcmNoLlxuICogQHJldHVybnMge251bGx8T2JqZWN0fSBSZXR1cm5zIHRoZSBjYWNoZSBvYmplY3Qgb3IgYG51bGxgIGlmIGNhY2hpbmcgc2hvdWxkIG5vdCBiZSB1c2VkLlxuICovXG5mdW5jdGlvbiBjcmVhdGVDYWNoZShhcnJheSkge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IGFycmF5Lmxlbmd0aCxcbiAgICAgIGZpcnN0ID0gYXJyYXlbMF0sXG4gICAgICBtaWQgPSBhcnJheVsobGVuZ3RoIC8gMikgfCAwXSxcbiAgICAgIGxhc3QgPSBhcnJheVtsZW5ndGggLSAxXTtcblxuICBpZiAoZmlyc3QgJiYgdHlwZW9mIGZpcnN0ID09ICdvYmplY3QnICYmXG4gICAgICBtaWQgJiYgdHlwZW9mIG1pZCA9PSAnb2JqZWN0JyAmJiBsYXN0ICYmIHR5cGVvZiBsYXN0ID09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHZhciBjYWNoZSA9IGdldE9iamVjdCgpO1xuICBjYWNoZVsnZmFsc2UnXSA9IGNhY2hlWydudWxsJ10gPSBjYWNoZVsndHJ1ZSddID0gY2FjaGVbJ3VuZGVmaW5lZCddID0gZmFsc2U7XG5cbiAgdmFyIHJlc3VsdCA9IGdldE9iamVjdCgpO1xuICByZXN1bHQuYXJyYXkgPSBhcnJheTtcbiAgcmVzdWx0LmNhY2hlID0gY2FjaGU7XG4gIHJlc3VsdC5wdXNoID0gY2FjaGVQdXNoO1xuXG4gIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgcmVzdWx0LnB1c2goYXJyYXlbaW5kZXhdKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUNhY2hlO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBrZXlQcmVmaXggPSByZXF1aXJlKCdsb2Rhc2guX2tleXByZWZpeCcpO1xuXG4vKipcbiAqIEFkZHMgYSBnaXZlbiB2YWx1ZSB0byB0aGUgY29ycmVzcG9uZGluZyBjYWNoZSBvYmplY3QuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGFkZCB0byB0aGUgY2FjaGUuXG4gKi9cbmZ1bmN0aW9uIGNhY2hlUHVzaCh2YWx1ZSkge1xuICB2YXIgY2FjaGUgPSB0aGlzLmNhY2hlLFxuICAgICAgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcblxuICBpZiAodHlwZSA9PSAnYm9vbGVhbicgfHwgdmFsdWUgPT0gbnVsbCkge1xuICAgIGNhY2hlW3ZhbHVlXSA9IHRydWU7XG4gIH0gZWxzZSB7XG4gICAgaWYgKHR5cGUgIT0gJ251bWJlcicgJiYgdHlwZSAhPSAnc3RyaW5nJykge1xuICAgICAgdHlwZSA9ICdvYmplY3QnO1xuICAgIH1cbiAgICB2YXIga2V5ID0gdHlwZSA9PSAnbnVtYmVyJyA/IHZhbHVlIDoga2V5UHJlZml4ICsgdmFsdWUsXG4gICAgICAgIHR5cGVDYWNoZSA9IGNhY2hlW3R5cGVdIHx8IChjYWNoZVt0eXBlXSA9IHt9KTtcblxuICAgIGlmICh0eXBlID09ICdvYmplY3QnKSB7XG4gICAgICAodHlwZUNhY2hlW2tleV0gfHwgKHR5cGVDYWNoZVtrZXldID0gW10pKS5wdXNoKHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdHlwZUNhY2hlW2tleV0gPSB0cnVlO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNhY2hlUHVzaDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgb2JqZWN0UG9vbCA9IHJlcXVpcmUoJ2xvZGFzaC5fb2JqZWN0cG9vbCcpO1xuXG4vKipcbiAqIEdldHMgYW4gb2JqZWN0IGZyb20gdGhlIG9iamVjdCBwb29sIG9yIGNyZWF0ZXMgYSBuZXcgb25lIGlmIHRoZSBwb29sIGlzIGVtcHR5LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgb2JqZWN0IGZyb20gdGhlIHBvb2wuXG4gKi9cbmZ1bmN0aW9uIGdldE9iamVjdCgpIHtcbiAgcmV0dXJuIG9iamVjdFBvb2wucG9wKCkgfHwge1xuICAgICdhcnJheSc6IG51bGwsXG4gICAgJ2NhY2hlJzogbnVsbCxcbiAgICAnY3JpdGVyaWEnOiBudWxsLFxuICAgICdmYWxzZSc6IGZhbHNlLFxuICAgICdpbmRleCc6IDAsXG4gICAgJ251bGwnOiBmYWxzZSxcbiAgICAnbnVtYmVyJzogbnVsbCxcbiAgICAnb2JqZWN0JzogbnVsbCxcbiAgICAncHVzaCc6IG51bGwsXG4gICAgJ3N0cmluZyc6IG51bGwsXG4gICAgJ3RydWUnOiBmYWxzZSxcbiAgICAndW5kZWZpbmVkJzogZmFsc2UsXG4gICAgJ3ZhbHVlJzogbnVsbFxuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGdldE9iamVjdDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBVc2VkIHRvIHBvb2wgYXJyYXlzIGFuZCBvYmplY3RzIHVzZWQgaW50ZXJuYWxseSAqL1xudmFyIG9iamVjdFBvb2wgPSBbXTtcblxubW9kdWxlLmV4cG9ydHMgPSBvYmplY3RQb29sO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIFVzZWQgYXMgdGhlIHNpemUgd2hlbiBvcHRpbWl6YXRpb25zIGFyZSBlbmFibGVkIGZvciBsYXJnZSBhcnJheXMgKi9cbnZhciBsYXJnZUFycmF5U2l6ZSA9IDc1O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGxhcmdlQXJyYXlTaXplO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBtYXhQb29sU2l6ZSA9IHJlcXVpcmUoJ2xvZGFzaC5fbWF4cG9vbHNpemUnKSxcbiAgICBvYmplY3RQb29sID0gcmVxdWlyZSgnbG9kYXNoLl9vYmplY3Rwb29sJyk7XG5cbi8qKlxuICogUmVsZWFzZXMgdGhlIGdpdmVuIG9iamVjdCBiYWNrIHRvIHRoZSBvYmplY3QgcG9vbC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IFtvYmplY3RdIFRoZSBvYmplY3QgdG8gcmVsZWFzZS5cbiAqL1xuZnVuY3Rpb24gcmVsZWFzZU9iamVjdChvYmplY3QpIHtcbiAgdmFyIGNhY2hlID0gb2JqZWN0LmNhY2hlO1xuICBpZiAoY2FjaGUpIHtcbiAgICByZWxlYXNlT2JqZWN0KGNhY2hlKTtcbiAgfVxuICBvYmplY3QuYXJyYXkgPSBvYmplY3QuY2FjaGUgPSBvYmplY3QuY3JpdGVyaWEgPSBvYmplY3Qub2JqZWN0ID0gb2JqZWN0Lm51bWJlciA9IG9iamVjdC5zdHJpbmcgPSBvYmplY3QudmFsdWUgPSBudWxsO1xuICBpZiAob2JqZWN0UG9vbC5sZW5ndGggPCBtYXhQb29sU2l6ZSkge1xuICAgIG9iamVjdFBvb2wucHVzaChvYmplY3QpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcmVsZWFzZU9iamVjdDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgaXNBcmd1bWVudHMgPSByZXF1aXJlKCdsb2Rhc2guaXNhcmd1bWVudHMnKSxcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnbG9kYXNoLmlzYXJyYXknKTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5mbGF0dGVuYCB3aXRob3V0IHN1cHBvcnQgZm9yIGNhbGxiYWNrXG4gKiBzaG9ydGhhbmRzIG9yIGB0aGlzQXJnYCBiaW5kaW5nLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gZmxhdHRlbi5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2lzU2hhbGxvdz1mYWxzZV0gQSBmbGFnIHRvIHJlc3RyaWN0IGZsYXR0ZW5pbmcgdG8gYSBzaW5nbGUgbGV2ZWwuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtpc1N0cmljdD1mYWxzZV0gQSBmbGFnIHRvIHJlc3RyaWN0IGZsYXR0ZW5pbmcgdG8gYXJyYXlzIGFuZCBgYXJndW1lbnRzYCBvYmplY3RzLlxuICogQHBhcmFtIHtudW1iZXJ9IFtmcm9tSW5kZXg9MF0gVGhlIGluZGV4IHRvIHN0YXJ0IGZyb20uXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgYSBuZXcgZmxhdHRlbmVkIGFycmF5LlxuICovXG5mdW5jdGlvbiBiYXNlRmxhdHRlbihhcnJheSwgaXNTaGFsbG93LCBpc1N0cmljdCwgZnJvbUluZGV4KSB7XG4gIHZhciBpbmRleCA9IChmcm9tSW5kZXggfHwgMCkgLSAxLFxuICAgICAgbGVuZ3RoID0gYXJyYXkgPyBhcnJheS5sZW5ndGggOiAwLFxuICAgICAgcmVzdWx0ID0gW107XG5cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICB2YXIgdmFsdWUgPSBhcnJheVtpbmRleF07XG5cbiAgICBpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnICYmIHR5cGVvZiB2YWx1ZS5sZW5ndGggPT0gJ251bWJlcidcbiAgICAgICAgJiYgKGlzQXJyYXkodmFsdWUpIHx8IGlzQXJndW1lbnRzKHZhbHVlKSkpIHtcbiAgICAgIC8vIHJlY3Vyc2l2ZWx5IGZsYXR0ZW4gYXJyYXlzIChzdXNjZXB0aWJsZSB0byBjYWxsIHN0YWNrIGxpbWl0cylcbiAgICAgIGlmICghaXNTaGFsbG93KSB7XG4gICAgICAgIHZhbHVlID0gYmFzZUZsYXR0ZW4odmFsdWUsIGlzU2hhbGxvdywgaXNTdHJpY3QpO1xuICAgICAgfVxuICAgICAgdmFyIHZhbEluZGV4ID0gLTEsXG4gICAgICAgICAgdmFsTGVuZ3RoID0gdmFsdWUubGVuZ3RoLFxuICAgICAgICAgIHJlc0luZGV4ID0gcmVzdWx0Lmxlbmd0aDtcblxuICAgICAgcmVzdWx0Lmxlbmd0aCArPSB2YWxMZW5ndGg7XG4gICAgICB3aGlsZSAoKyt2YWxJbmRleCA8IHZhbExlbmd0aCkge1xuICAgICAgICByZXN1bHRbcmVzSW5kZXgrK10gPSB2YWx1ZVt2YWxJbmRleF07XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICghaXNTdHJpY3QpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlRmxhdHRlbjtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgc2hvcnRjdXRzICovXG52YXIgYXJnc0NsYXNzID0gJ1tvYmplY3QgQXJndW1lbnRzXSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIFtbQ2xhc3NdXSBvZiB2YWx1ZXMgKi9cbnZhciB0b1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGFuIGBhcmd1bWVudHNgIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBgdmFsdWVgIGlzIGFuIGBhcmd1bWVudHNgIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiAoZnVuY3Rpb24oKSB7IHJldHVybiBfLmlzQXJndW1lbnRzKGFyZ3VtZW50cyk7IH0pKDEsIDIsIDMpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNBcmd1bWVudHMoWzEsIDIsIDNdKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzQXJndW1lbnRzKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCcgJiYgdHlwZW9mIHZhbHVlLmxlbmd0aCA9PSAnbnVtYmVyJyAmJlxuICAgIHRvU3RyaW5nLmNhbGwodmFsdWUpID09IGFyZ3NDbGFzcyB8fCBmYWxzZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc0FyZ3VtZW50cztcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUNyZWF0ZUNhbGxiYWNrID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlY3JlYXRlY2FsbGJhY2snKSxcbiAgICBmb3JPd24gPSByZXF1aXJlKCdsb2Rhc2guZm9yb3duJyk7XG5cbi8qKlxuICogSXRlcmF0ZXMgb3ZlciBlbGVtZW50cyBvZiBhIGNvbGxlY3Rpb24sIGV4ZWN1dGluZyB0aGUgY2FsbGJhY2sgZm9yIGVhY2hcbiAqIGVsZW1lbnQuIFRoZSBjYWxsYmFjayBpcyBib3VuZCB0byBgdGhpc0FyZ2AgYW5kIGludm9rZWQgd2l0aCB0aHJlZSBhcmd1bWVudHM7XG4gKiAodmFsdWUsIGluZGV4fGtleSwgY29sbGVjdGlvbikuIENhbGxiYWNrcyBtYXkgZXhpdCBpdGVyYXRpb24gZWFybHkgYnlcbiAqIGV4cGxpY2l0bHkgcmV0dXJuaW5nIGBmYWxzZWAuXG4gKlxuICogTm90ZTogQXMgd2l0aCBvdGhlciBcIkNvbGxlY3Rpb25zXCIgbWV0aG9kcywgb2JqZWN0cyB3aXRoIGEgYGxlbmd0aGAgcHJvcGVydHlcbiAqIGFyZSBpdGVyYXRlZCBsaWtlIGFycmF5cy4gVG8gYXZvaWQgdGhpcyBiZWhhdmlvciBgXy5mb3JJbmAgb3IgYF8uZm9yT3duYFxuICogbWF5IGJlIHVzZWQgZm9yIG9iamVjdCBpdGVyYXRpb24uXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBhbGlhcyBlYWNoXG4gKiBAY2F0ZWdvcnkgQ29sbGVjdGlvbnNcbiAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fHN0cmluZ30gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2FsbGJhY2s9aWRlbnRpdHldIFRoZSBmdW5jdGlvbiBjYWxsZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgY2FsbGJhY2tgLlxuICogQHJldHVybnMge0FycmF5fE9iamVjdHxzdHJpbmd9IFJldHVybnMgYGNvbGxlY3Rpb25gLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfKFsxLCAyLCAzXSkuZm9yRWFjaChmdW5jdGlvbihudW0pIHsgY29uc29sZS5sb2cobnVtKTsgfSkuam9pbignLCcpO1xuICogLy8gPT4gbG9ncyBlYWNoIG51bWJlciBhbmQgcmV0dXJucyAnMSwyLDMnXG4gKlxuICogXy5mb3JFYWNoKHsgJ29uZSc6IDEsICd0d28nOiAyLCAndGhyZWUnOiAzIH0sIGZ1bmN0aW9uKG51bSkgeyBjb25zb2xlLmxvZyhudW0pOyB9KTtcbiAqIC8vID0+IGxvZ3MgZWFjaCBudW1iZXIgYW5kIHJldHVybnMgdGhlIG9iamVjdCAocHJvcGVydHkgb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQgYWNyb3NzIGVudmlyb25tZW50cylcbiAqL1xuZnVuY3Rpb24gZm9yRWFjaChjb2xsZWN0aW9uLCBjYWxsYmFjaywgdGhpc0FyZykge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGxlbmd0aCA9IGNvbGxlY3Rpb24gPyBjb2xsZWN0aW9uLmxlbmd0aCA6IDA7XG5cbiAgY2FsbGJhY2sgPSBjYWxsYmFjayAmJiB0eXBlb2YgdGhpc0FyZyA9PSAndW5kZWZpbmVkJyA/IGNhbGxiYWNrIDogYmFzZUNyZWF0ZUNhbGxiYWNrKGNhbGxiYWNrLCB0aGlzQXJnLCAzKTtcbiAgaWYgKHR5cGVvZiBsZW5ndGggPT0gJ251bWJlcicpIHtcbiAgICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgICAgaWYgKGNhbGxiYWNrKGNvbGxlY3Rpb25baW5kZXhdLCBpbmRleCwgY29sbGVjdGlvbikgPT09IGZhbHNlKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3JPd24oY29sbGVjdGlvbiwgY2FsbGJhY2spO1xuICB9XG4gIHJldHVybiBjb2xsZWN0aW9uO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZvckVhY2g7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGlzTmF0aXZlID0gcmVxdWlyZSgnbG9kYXNoLl9pc25hdGl2ZScpO1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHNob3J0Y3V0cyAqL1xudmFyIGFycmF5Q2xhc3MgPSAnW29iamVjdCBBcnJheV0nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBbW0NsYXNzXV0gb2YgdmFsdWVzICovXG52YXIgdG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyogTmF0aXZlIG1ldGhvZCBzaG9ydGN1dHMgZm9yIG1ldGhvZHMgd2l0aCB0aGUgc2FtZSBuYW1lIGFzIG90aGVyIGBsb2Rhc2hgIG1ldGhvZHMgKi9cbnZhciBuYXRpdmVJc0FycmF5ID0gaXNOYXRpdmUobmF0aXZlSXNBcnJheSA9IEFycmF5LmlzQXJyYXkpICYmIG5hdGl2ZUlzQXJyYXk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYW4gYXJyYXkuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEB0eXBlIEZ1bmN0aW9uXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGB2YWx1ZWAgaXMgYW4gYXJyYXksIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogKGZ1bmN0aW9uKCkgeyByZXR1cm4gXy5pc0FycmF5KGFyZ3VtZW50cyk7IH0pKCk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNBcnJheShbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICovXG52YXIgaXNBcnJheSA9IG5hdGl2ZUlzQXJyYXkgfHwgZnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0JyAmJiB0eXBlb2YgdmFsdWUubGVuZ3RoID09ICdudW1iZXInICYmXG4gICAgdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gYXJyYXlDbGFzcyB8fCBmYWxzZTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcnJheTtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgc2hvcnRjdXRzICovXG52YXIgYm9vbENsYXNzID0gJ1tvYmplY3QgQm9vbGVhbl0nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBbW0NsYXNzXV0gb2YgdmFsdWVzICovXG52YXIgdG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIGJvb2xlYW4gdmFsdWUuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYHZhbHVlYCBpcyBhIGJvb2xlYW4gdmFsdWUsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc0Jvb2xlYW4obnVsbCk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc0Jvb2xlYW4odmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlID09PSB0cnVlIHx8IHZhbHVlID09PSBmYWxzZSB8fFxuICAgIHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0JyAmJiB0b1N0cmluZy5jYWxsKHZhbHVlKSA9PSBib29sQ2xhc3MgfHwgZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNCb29sZWFuO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIGZ1bmN0aW9uLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGB2YWx1ZWAgaXMgYSBmdW5jdGlvbiwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzRnVuY3Rpb24oXyk7XG4gKiAvLyA9PiB0cnVlXG4gKi9cbmZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAnZnVuY3Rpb24nO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzRnVuY3Rpb247XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGlzTnVtYmVyID0gcmVxdWlyZSgnbG9kYXNoLmlzbnVtYmVyJyk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYE5hTmAuXG4gKlxuICogTm90ZTogVGhpcyBpcyBub3QgdGhlIHNhbWUgYXMgbmF0aXZlIGBpc05hTmAgd2hpY2ggd2lsbCByZXR1cm4gYHRydWVgIGZvclxuICogYHVuZGVmaW5lZGAgYW5kIG90aGVyIG5vbi1udW1lcmljIHZhbHVlcy4gU2VlIGh0dHA6Ly9lczUuZ2l0aHViLmlvLyN4MTUuMS4yLjQuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYHZhbHVlYCBpcyBgTmFOYCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzTmFOKE5hTik7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc05hTihuZXcgTnVtYmVyKE5hTikpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIGlzTmFOKHVuZGVmaW5lZCk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc05hTih1bmRlZmluZWQpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNOYU4odmFsdWUpIHtcbiAgLy8gYE5hTmAgYXMgYSBwcmltaXRpdmUgaXMgdGhlIG9ubHkgdmFsdWUgdGhhdCBpcyBub3QgZXF1YWwgdG8gaXRzZWxmXG4gIC8vIChwZXJmb3JtIHRoZSBbW0NsYXNzXV0gY2hlY2sgZmlyc3QgdG8gYXZvaWQgZXJyb3JzIHdpdGggc29tZSBob3N0IG9iamVjdHMgaW4gSUUpXG4gIHJldHVybiBpc051bWJlcih2YWx1ZSkgJiYgdmFsdWUgIT0gK3ZhbHVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzTmFOO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBgbnVsbGAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYHZhbHVlYCBpcyBgbnVsbGAsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc051bGwobnVsbCk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc051bGwodW5kZWZpbmVkKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzTnVsbCh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgPT09IG51bGw7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNOdWxsO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCBzaG9ydGN1dHMgKi9cbnZhciBudW1iZXJDbGFzcyA9ICdbb2JqZWN0IE51bWJlcl0nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBbW0NsYXNzXV0gb2YgdmFsdWVzICovXG52YXIgdG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhIG51bWJlci5cbiAqXG4gKiBOb3RlOiBgTmFOYCBpcyBjb25zaWRlcmVkIGEgbnVtYmVyLiBTZWUgaHR0cDovL2VzNS5naXRodWIuaW8vI3g4LjUuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RzXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYHZhbHVlYCBpcyBhIG51bWJlciwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzTnVtYmVyKDguNCAqIDUpO1xuICogLy8gPT4gdHJ1ZVxuICovXG5mdW5jdGlvbiBpc051bWJlcih2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICdudW1iZXInIHx8XG4gICAgdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnICYmIHRvU3RyaW5nLmNhbGwodmFsdWUpID09IG51bWJlckNsYXNzIHx8IGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzTnVtYmVyO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJ2xvZGFzaC5faXNuYXRpdmUnKSxcbiAgICBzaGltSXNQbGFpbk9iamVjdCA9IHJlcXVpcmUoJ2xvZGFzaC5fc2hpbWlzcGxhaW5vYmplY3QnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCBzaG9ydGN1dHMgKi9cbnZhciBvYmplY3RDbGFzcyA9ICdbb2JqZWN0IE9iamVjdF0nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBbW0NsYXNzXV0gb2YgdmFsdWVzICovXG52YXIgdG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzICovXG52YXIgZ2V0UHJvdG90eXBlT2YgPSBpc05hdGl2ZShnZXRQcm90b3R5cGVPZiA9IE9iamVjdC5nZXRQcm90b3R5cGVPZikgJiYgZ2V0UHJvdG90eXBlT2Y7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYW4gb2JqZWN0IGNyZWF0ZWQgYnkgdGhlIGBPYmplY3RgIGNvbnN0cnVjdG9yLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIHBsYWluIG9iamVjdCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBmdW5jdGlvbiBTaGFwZSgpIHtcbiAqICAgdGhpcy54ID0gMDtcbiAqICAgdGhpcy55ID0gMDtcbiAqIH1cbiAqXG4gKiBfLmlzUGxhaW5PYmplY3QobmV3IFNoYXBlKTtcbiAqIC8vID0+IGZhbHNlXG4gKlxuICogXy5pc1BsYWluT2JqZWN0KFsxLCAyLCAzXSk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNQbGFpbk9iamVjdCh7ICd4JzogMCwgJ3knOiAwIH0pO1xuICogLy8gPT4gdHJ1ZVxuICovXG52YXIgaXNQbGFpbk9iamVjdCA9ICFnZXRQcm90b3R5cGVPZiA/IHNoaW1Jc1BsYWluT2JqZWN0IDogZnVuY3Rpb24odmFsdWUpIHtcbiAgaWYgKCEodmFsdWUgJiYgdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gb2JqZWN0Q2xhc3MpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHZhciB2YWx1ZU9mID0gdmFsdWUudmFsdWVPZixcbiAgICAgIG9ialByb3RvID0gaXNOYXRpdmUodmFsdWVPZikgJiYgKG9ialByb3RvID0gZ2V0UHJvdG90eXBlT2YodmFsdWVPZikpICYmIGdldFByb3RvdHlwZU9mKG9ialByb3RvKTtcblxuICByZXR1cm4gb2JqUHJvdG9cbiAgICA/ICh2YWx1ZSA9PSBvYmpQcm90byB8fCBnZXRQcm90b3R5cGVPZih2YWx1ZSkgPT0gb2JqUHJvdG8pXG4gICAgOiBzaGltSXNQbGFpbk9iamVjdCh2YWx1ZSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGlzUGxhaW5PYmplY3Q7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGZvckluID0gcmVxdWlyZSgnbG9kYXNoLmZvcmluJyksXG4gICAgaXNGdW5jdGlvbiA9IHJlcXVpcmUoJ2xvZGFzaC5pc2Z1bmN0aW9uJyk7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgc2hvcnRjdXRzICovXG52YXIgb2JqZWN0Q2xhc3MgPSAnW29iamVjdCBPYmplY3RdJztcblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgaW50ZXJuYWwgW1tDbGFzc11dIG9mIHZhbHVlcyAqL1xudmFyIHRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKiBOYXRpdmUgbWV0aG9kIHNob3J0Y3V0cyAqL1xudmFyIGhhc093blByb3BlcnR5ID0gb2JqZWN0UHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbi8qKlxuICogQSBmYWxsYmFjayBpbXBsZW1lbnRhdGlvbiBvZiBgaXNQbGFpbk9iamVjdGAgd2hpY2ggY2hlY2tzIGlmIGEgZ2l2ZW4gdmFsdWVcbiAqIGlzIGFuIG9iamVjdCBjcmVhdGVkIGJ5IHRoZSBgT2JqZWN0YCBjb25zdHJ1Y3RvciwgYXNzdW1pbmcgb2JqZWN0cyBjcmVhdGVkXG4gKiBieSB0aGUgYE9iamVjdGAgY29uc3RydWN0b3IgaGF2ZSBubyBpbmhlcml0ZWQgZW51bWVyYWJsZSBwcm9wZXJ0aWVzIGFuZCB0aGF0XG4gKiB0aGVyZSBhcmUgbm8gYE9iamVjdC5wcm90b3R5cGVgIGV4dGVuc2lvbnMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYSBwbGFpbiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gc2hpbUlzUGxhaW5PYmplY3QodmFsdWUpIHtcbiAgdmFyIGN0b3IsXG4gICAgICByZXN1bHQ7XG5cbiAgLy8gYXZvaWQgbm9uIE9iamVjdCBvYmplY3RzLCBgYXJndW1lbnRzYCBvYmplY3RzLCBhbmQgRE9NIGVsZW1lbnRzXG4gIGlmICghKHZhbHVlICYmIHRvU3RyaW5nLmNhbGwodmFsdWUpID09IG9iamVjdENsYXNzKSB8fFxuICAgICAgKGN0b3IgPSB2YWx1ZS5jb25zdHJ1Y3RvciwgaXNGdW5jdGlvbihjdG9yKSAmJiAhKGN0b3IgaW5zdGFuY2VvZiBjdG9yKSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy8gSW4gbW9zdCBlbnZpcm9ubWVudHMgYW4gb2JqZWN0J3Mgb3duIHByb3BlcnRpZXMgYXJlIGl0ZXJhdGVkIGJlZm9yZVxuICAvLyBpdHMgaW5oZXJpdGVkIHByb3BlcnRpZXMuIElmIHRoZSBsYXN0IGl0ZXJhdGVkIHByb3BlcnR5IGlzIGFuIG9iamVjdCdzXG4gIC8vIG93biBwcm9wZXJ0eSB0aGVuIHRoZXJlIGFyZSBubyBpbmhlcml0ZWQgZW51bWVyYWJsZSBwcm9wZXJ0aWVzLlxuICBmb3JJbih2YWx1ZSwgZnVuY3Rpb24odmFsdWUsIGtleSkge1xuICAgIHJlc3VsdCA9IGtleTtcbiAgfSk7XG4gIHJldHVybiB0eXBlb2YgcmVzdWx0ID09ICd1bmRlZmluZWQnIHx8IGhhc093blByb3BlcnR5LmNhbGwodmFsdWUsIHJlc3VsdCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gc2hpbUlzUGxhaW5PYmplY3Q7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VDcmVhdGVDYWxsYmFjayA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWNyZWF0ZWNhbGxiYWNrJyksXG4gICAgb2JqZWN0VHlwZXMgPSByZXF1aXJlKCdsb2Rhc2guX29iamVjdHR5cGVzJyk7XG5cbi8qKlxuICogSXRlcmF0ZXMgb3ZlciBvd24gYW5kIGluaGVyaXRlZCBlbnVtZXJhYmxlIHByb3BlcnRpZXMgb2YgYW4gb2JqZWN0LFxuICogZXhlY3V0aW5nIHRoZSBjYWxsYmFjayBmb3IgZWFjaCBwcm9wZXJ0eS4gVGhlIGNhbGxiYWNrIGlzIGJvdW5kIHRvIGB0aGlzQXJnYFxuICogYW5kIGludm9rZWQgd2l0aCB0aHJlZSBhcmd1bWVudHM7ICh2YWx1ZSwga2V5LCBvYmplY3QpLiBDYWxsYmFja3MgbWF5IGV4aXRcbiAqIGl0ZXJhdGlvbiBlYXJseSBieSBleHBsaWNpdGx5IHJldHVybmluZyBgZmFsc2VgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAdHlwZSBGdW5jdGlvblxuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBpdGVyYXRlIG92ZXIuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbY2FsbGJhY2s9aWRlbnRpdHldIFRoZSBmdW5jdGlvbiBjYWxsZWQgcGVyIGl0ZXJhdGlvbi5cbiAqIEBwYXJhbSB7Kn0gW3RoaXNBcmddIFRoZSBgdGhpc2AgYmluZGluZyBvZiBgY2FsbGJhY2tgLlxuICogQHJldHVybnMge09iamVjdH0gUmV0dXJucyBgb2JqZWN0YC5cbiAqIEBleGFtcGxlXG4gKlxuICogZnVuY3Rpb24gU2hhcGUoKSB7XG4gKiAgIHRoaXMueCA9IDA7XG4gKiAgIHRoaXMueSA9IDA7XG4gKiB9XG4gKlxuICogU2hhcGUucHJvdG90eXBlLm1vdmUgPSBmdW5jdGlvbih4LCB5KSB7XG4gKiAgIHRoaXMueCArPSB4O1xuICogICB0aGlzLnkgKz0geTtcbiAqIH07XG4gKlxuICogXy5mb3JJbihuZXcgU2hhcGUsIGZ1bmN0aW9uKHZhbHVlLCBrZXkpIHtcbiAqICAgY29uc29sZS5sb2coa2V5KTtcbiAqIH0pO1xuICogLy8gPT4gbG9ncyAneCcsICd5JywgYW5kICdtb3ZlJyAocHJvcGVydHkgb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQgYWNyb3NzIGVudmlyb25tZW50cylcbiAqL1xudmFyIGZvckluID0gZnVuY3Rpb24oY29sbGVjdGlvbiwgY2FsbGJhY2ssIHRoaXNBcmcpIHtcbiAgdmFyIGluZGV4LCBpdGVyYWJsZSA9IGNvbGxlY3Rpb24sIHJlc3VsdCA9IGl0ZXJhYmxlO1xuICBpZiAoIWl0ZXJhYmxlKSByZXR1cm4gcmVzdWx0O1xuICBpZiAoIW9iamVjdFR5cGVzW3R5cGVvZiBpdGVyYWJsZV0pIHJldHVybiByZXN1bHQ7XG4gIGNhbGxiYWNrID0gY2FsbGJhY2sgJiYgdHlwZW9mIHRoaXNBcmcgPT0gJ3VuZGVmaW5lZCcgPyBjYWxsYmFjayA6IGJhc2VDcmVhdGVDYWxsYmFjayhjYWxsYmFjaywgdGhpc0FyZywgMyk7XG4gICAgZm9yIChpbmRleCBpbiBpdGVyYWJsZSkge1xuICAgICAgaWYgKGNhbGxiYWNrKGl0ZXJhYmxlW2luZGV4XSwgaW5kZXgsIGNvbGxlY3Rpb24pID09PSBmYWxzZSkgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gIHJldHVybiByZXN1bHRcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZm9ySW47XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKiogYE9iamVjdCN0b1N0cmluZ2AgcmVzdWx0IHNob3J0Y3V0cyAqL1xudmFyIHN0cmluZ0NsYXNzID0gJ1tvYmplY3QgU3RyaW5nXSc7XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGludGVybmFsIFtbQ2xhc3NdXSBvZiB2YWx1ZXMgKi9cbnZhciB0b1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgc3RyaW5nLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0c1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGB2YWx1ZWAgaXMgYSBzdHJpbmcsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc1N0cmluZygnZnJlZCcpO1xuICogLy8gPT4gdHJ1ZVxuICovXG5mdW5jdGlvbiBpc1N0cmluZyh2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICdzdHJpbmcnIHx8XG4gICAgdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnICYmIHRvU3RyaW5nLmNhbGwodmFsdWUpID09IHN0cmluZ0NsYXNzIHx8IGZhbHNlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzU3RyaW5nO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBgdW5kZWZpbmVkYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IE9iamVjdHNcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIHRoZSBgdmFsdWVgIGlzIGB1bmRlZmluZWRgLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNVbmRlZmluZWQodm9pZCAwKTtcbiAqIC8vID0+IHRydWVcbiAqL1xuZnVuY3Rpb24gaXNVbmRlZmluZWQodmFsdWUpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PSAndW5kZWZpbmVkJztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBpc1VuZGVmaW5lZDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgY3JlYXRlQ2FsbGJhY2sgPSByZXF1aXJlKCdsb2Rhc2guY3JlYXRlY2FsbGJhY2snKSxcbiAgICBmb3JPd24gPSByZXF1aXJlKCdsb2Rhc2guZm9yb3duJyk7XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBhcnJheSBvZiB2YWx1ZXMgYnkgcnVubmluZyBlYWNoIGVsZW1lbnQgaW4gdGhlIGNvbGxlY3Rpb25cbiAqIHRocm91Z2ggdGhlIGNhbGxiYWNrLiBUaGUgY2FsbGJhY2sgaXMgYm91bmQgdG8gYHRoaXNBcmdgIGFuZCBpbnZva2VkIHdpdGhcbiAqIHRocmVlIGFyZ3VtZW50czsgKHZhbHVlLCBpbmRleHxrZXksIGNvbGxlY3Rpb24pLlxuICpcbiAqIElmIGEgcHJvcGVydHkgbmFtZSBpcyBwcm92aWRlZCBmb3IgYGNhbGxiYWNrYCB0aGUgY3JlYXRlZCBcIl8ucGx1Y2tcIiBzdHlsZVxuICogY2FsbGJhY2sgd2lsbCByZXR1cm4gdGhlIHByb3BlcnR5IHZhbHVlIG9mIHRoZSBnaXZlbiBlbGVtZW50LlxuICpcbiAqIElmIGFuIG9iamVjdCBpcyBwcm92aWRlZCBmb3IgYGNhbGxiYWNrYCB0aGUgY3JlYXRlZCBcIl8ud2hlcmVcIiBzdHlsZSBjYWxsYmFja1xuICogd2lsbCByZXR1cm4gYHRydWVgIGZvciBlbGVtZW50cyB0aGF0IGhhdmUgdGhlIHByb3BlcnRpZXMgb2YgdGhlIGdpdmVuIG9iamVjdCxcbiAqIGVsc2UgYGZhbHNlYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGFsaWFzIGNvbGxlY3RcbiAqIEBjYXRlZ29yeSBDb2xsZWN0aW9uc1xuICogQHBhcmFtIHtBcnJheXxPYmplY3R8c3RyaW5nfSBjb2xsZWN0aW9uIFRoZSBjb2xsZWN0aW9uIHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb258T2JqZWN0fHN0cmluZ30gW2NhbGxiYWNrPWlkZW50aXR5XSBUaGUgZnVuY3Rpb24gY2FsbGVkXG4gKiAgcGVyIGl0ZXJhdGlvbi4gSWYgYSBwcm9wZXJ0eSBuYW1lIG9yIG9iamVjdCBpcyBwcm92aWRlZCBpdCB3aWxsIGJlIHVzZWRcbiAqICB0byBjcmVhdGUgYSBcIl8ucGx1Y2tcIiBvciBcIl8ud2hlcmVcIiBzdHlsZSBjYWxsYmFjaywgcmVzcGVjdGl2ZWx5LlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBjYWxsYmFja2AuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgYSBuZXcgYXJyYXkgb2YgdGhlIHJlc3VsdHMgb2YgZWFjaCBgY2FsbGJhY2tgIGV4ZWN1dGlvbi5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5tYXAoWzEsIDIsIDNdLCBmdW5jdGlvbihudW0pIHsgcmV0dXJuIG51bSAqIDM7IH0pO1xuICogLy8gPT4gWzMsIDYsIDldXG4gKlxuICogXy5tYXAoeyAnb25lJzogMSwgJ3R3byc6IDIsICd0aHJlZSc6IDMgfSwgZnVuY3Rpb24obnVtKSB7IHJldHVybiBudW0gKiAzOyB9KTtcbiAqIC8vID0+IFszLCA2LCA5XSAocHJvcGVydHkgb3JkZXIgaXMgbm90IGd1YXJhbnRlZWQgYWNyb3NzIGVudmlyb25tZW50cylcbiAqXG4gKiB2YXIgY2hhcmFjdGVycyA9IFtcbiAqICAgeyAnbmFtZSc6ICdiYXJuZXknLCAnYWdlJzogMzYgfSxcbiAqICAgeyAnbmFtZSc6ICdmcmVkJywgICAnYWdlJzogNDAgfVxuICogXTtcbiAqXG4gKiAvLyB1c2luZyBcIl8ucGx1Y2tcIiBjYWxsYmFjayBzaG9ydGhhbmRcbiAqIF8ubWFwKGNoYXJhY3RlcnMsICduYW1lJyk7XG4gKiAvLyA9PiBbJ2Jhcm5leScsICdmcmVkJ11cbiAqL1xuZnVuY3Rpb24gbWFwKGNvbGxlY3Rpb24sIGNhbGxiYWNrLCB0aGlzQXJnKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gY29sbGVjdGlvbiA/IGNvbGxlY3Rpb24ubGVuZ3RoIDogMDtcblxuICBjYWxsYmFjayA9IGNyZWF0ZUNhbGxiYWNrKGNhbGxiYWNrLCB0aGlzQXJnLCAzKTtcbiAgaWYgKHR5cGVvZiBsZW5ndGggPT0gJ251bWJlcicpIHtcbiAgICB2YXIgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKTtcbiAgICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgICAgcmVzdWx0W2luZGV4XSA9IGNhbGxiYWNrKGNvbGxlY3Rpb25baW5kZXhdLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHJlc3VsdCA9IFtdO1xuICAgIGZvck93bihjb2xsZWN0aW9uLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBjb2xsZWN0aW9uKSB7XG4gICAgICByZXN1bHRbKytpbmRleF0gPSBjYWxsYmFjayh2YWx1ZSwga2V5LCBjb2xsZWN0aW9uKTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG1hcDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG52YXIgYmFzZUNyZWF0ZUNhbGxiYWNrID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlY3JlYXRlY2FsbGJhY2snKSxcbiAgICBiYXNlSXNFcXVhbCA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWlzZXF1YWwnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJ2xvZGFzaC5pc29iamVjdCcpLFxuICAgIGtleXMgPSByZXF1aXJlKCdsb2Rhc2gua2V5cycpLFxuICAgIHByb3BlcnR5ID0gcmVxdWlyZSgnbG9kYXNoLnByb3BlcnR5Jyk7XG5cbi8qKlxuICogUHJvZHVjZXMgYSBjYWxsYmFjayBib3VuZCB0byBhbiBvcHRpb25hbCBgdGhpc0FyZ2AuIElmIGBmdW5jYCBpcyBhIHByb3BlcnR5XG4gKiBuYW1lIHRoZSBjcmVhdGVkIGNhbGxiYWNrIHdpbGwgcmV0dXJuIHRoZSBwcm9wZXJ0eSB2YWx1ZSBmb3IgYSBnaXZlbiBlbGVtZW50LlxuICogSWYgYGZ1bmNgIGlzIGFuIG9iamVjdCB0aGUgY3JlYXRlZCBjYWxsYmFjayB3aWxsIHJldHVybiBgdHJ1ZWAgZm9yIGVsZW1lbnRzXG4gKiB0aGF0IGNvbnRhaW4gdGhlIGVxdWl2YWxlbnQgb2JqZWN0IHByb3BlcnRpZXMsIG90aGVyd2lzZSBpdCB3aWxsIHJldHVybiBgZmFsc2VgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgVXRpbGl0aWVzXG4gKiBAcGFyYW0geyp9IFtmdW5jPWlkZW50aXR5XSBUaGUgdmFsdWUgdG8gY29udmVydCB0byBhIGNhbGxiYWNrLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIHRoZSBjcmVhdGVkIGNhbGxiYWNrLlxuICogQHBhcmFtIHtudW1iZXJ9IFthcmdDb3VudF0gVGhlIG51bWJlciBvZiBhcmd1bWVudHMgdGhlIGNhbGxiYWNrIGFjY2VwdHMuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgYSBjYWxsYmFjayBmdW5jdGlvbi5cbiAqIEBleGFtcGxlXG4gKlxuICogdmFyIGNoYXJhY3RlcnMgPSBbXG4gKiAgIHsgJ25hbWUnOiAnYmFybmV5JywgJ2FnZSc6IDM2IH0sXG4gKiAgIHsgJ25hbWUnOiAnZnJlZCcsICAgJ2FnZSc6IDQwIH1cbiAqIF07XG4gKlxuICogLy8gd3JhcCB0byBjcmVhdGUgY3VzdG9tIGNhbGxiYWNrIHNob3J0aGFuZHNcbiAqIF8uY3JlYXRlQ2FsbGJhY2sgPSBfLndyYXAoXy5jcmVhdGVDYWxsYmFjaywgZnVuY3Rpb24oZnVuYywgY2FsbGJhY2ssIHRoaXNBcmcpIHtcbiAqICAgdmFyIG1hdGNoID0gL14oLis/KV9fKFtnbF10KSguKykkLy5leGVjKGNhbGxiYWNrKTtcbiAqICAgcmV0dXJuICFtYXRjaCA/IGZ1bmMoY2FsbGJhY2ssIHRoaXNBcmcpIDogZnVuY3Rpb24ob2JqZWN0KSB7XG4gKiAgICAgcmV0dXJuIG1hdGNoWzJdID09ICdndCcgPyBvYmplY3RbbWF0Y2hbMV1dID4gbWF0Y2hbM10gOiBvYmplY3RbbWF0Y2hbMV1dIDwgbWF0Y2hbM107XG4gKiAgIH07XG4gKiB9KTtcbiAqXG4gKiBfLmZpbHRlcihjaGFyYWN0ZXJzLCAnYWdlX19ndDM4Jyk7XG4gKiAvLyA9PiBbeyAnbmFtZSc6ICdmcmVkJywgJ2FnZSc6IDQwIH1dXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUNhbGxiYWNrKGZ1bmMsIHRoaXNBcmcsIGFyZ0NvdW50KSB7XG4gIHZhciB0eXBlID0gdHlwZW9mIGZ1bmM7XG4gIGlmIChmdW5jID09IG51bGwgfHwgdHlwZSA9PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIGJhc2VDcmVhdGVDYWxsYmFjayhmdW5jLCB0aGlzQXJnLCBhcmdDb3VudCk7XG4gIH1cbiAgLy8gaGFuZGxlIFwiXy5wbHVja1wiIHN0eWxlIGNhbGxiYWNrIHNob3J0aGFuZHNcbiAgaWYgKHR5cGUgIT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gcHJvcGVydHkoZnVuYyk7XG4gIH1cbiAgdmFyIHByb3BzID0ga2V5cyhmdW5jKSxcbiAgICAgIGtleSA9IHByb3BzWzBdLFxuICAgICAgYSA9IGZ1bmNba2V5XTtcblxuICAvLyBoYW5kbGUgXCJfLndoZXJlXCIgc3R5bGUgY2FsbGJhY2sgc2hvcnRoYW5kc1xuICBpZiAocHJvcHMubGVuZ3RoID09IDEgJiYgYSA9PT0gYSAmJiAhaXNPYmplY3QoYSkpIHtcbiAgICAvLyBmYXN0IHBhdGggdGhlIGNvbW1vbiBjYXNlIG9mIHByb3ZpZGluZyBhbiBvYmplY3Qgd2l0aCBhIHNpbmdsZVxuICAgIC8vIHByb3BlcnR5IGNvbnRhaW5pbmcgYSBwcmltaXRpdmUgdmFsdWVcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgICB2YXIgYiA9IG9iamVjdFtrZXldO1xuICAgICAgcmV0dXJuIGEgPT09IGIgJiYgKGEgIT09IDAgfHwgKDEgLyBhID09IDEgLyBiKSk7XG4gICAgfTtcbiAgfVxuICByZXR1cm4gZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgdmFyIGxlbmd0aCA9IHByb3BzLmxlbmd0aCxcbiAgICAgICAgcmVzdWx0ID0gZmFsc2U7XG5cbiAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgIGlmICghKHJlc3VsdCA9IGJhc2VJc0VxdWFsKG9iamVjdFtwcm9wc1tsZW5ndGhdXSwgZnVuY1twcm9wc1tsZW5ndGhdXSwgbnVsbCwgdHJ1ZSkpKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUNhbGxiYWNrO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBmb3JJbiA9IHJlcXVpcmUoJ2xvZGFzaC5mb3JpbicpLFxuICAgIGdldEFycmF5ID0gcmVxdWlyZSgnbG9kYXNoLl9nZXRhcnJheScpLFxuICAgIGlzRnVuY3Rpb24gPSByZXF1aXJlKCdsb2Rhc2guaXNmdW5jdGlvbicpLFxuICAgIG9iamVjdFR5cGVzID0gcmVxdWlyZSgnbG9kYXNoLl9vYmplY3R0eXBlcycpLFxuICAgIHJlbGVhc2VBcnJheSA9IHJlcXVpcmUoJ2xvZGFzaC5fcmVsZWFzZWFycmF5Jyk7XG5cbi8qKiBgT2JqZWN0I3RvU3RyaW5nYCByZXN1bHQgc2hvcnRjdXRzICovXG52YXIgYXJnc0NsYXNzID0gJ1tvYmplY3QgQXJndW1lbnRzXScsXG4gICAgYXJyYXlDbGFzcyA9ICdbb2JqZWN0IEFycmF5XScsXG4gICAgYm9vbENsYXNzID0gJ1tvYmplY3QgQm9vbGVhbl0nLFxuICAgIGRhdGVDbGFzcyA9ICdbb2JqZWN0IERhdGVdJyxcbiAgICBudW1iZXJDbGFzcyA9ICdbb2JqZWN0IE51bWJlcl0nLFxuICAgIG9iamVjdENsYXNzID0gJ1tvYmplY3QgT2JqZWN0XScsXG4gICAgcmVnZXhwQ2xhc3MgPSAnW29iamVjdCBSZWdFeHBdJyxcbiAgICBzdHJpbmdDbGFzcyA9ICdbb2JqZWN0IFN0cmluZ10nO1xuXG4vKiogVXNlZCBmb3IgbmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBbW0NsYXNzXV0gb2YgdmFsdWVzICovXG52YXIgdG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqIE5hdGl2ZSBtZXRob2Qgc2hvcnRjdXRzICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5pc0VxdWFsYCwgd2l0aG91dCBzdXBwb3J0IGZvciBgdGhpc0FyZ2AgYmluZGluZyxcbiAqIHRoYXQgYWxsb3dzIHBhcnRpYWwgXCJfLndoZXJlXCIgc3R5bGUgY29tcGFyaXNvbnMuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gYSBUaGUgdmFsdWUgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7Kn0gYiBUaGUgb3RoZXIgdmFsdWUgdG8gY29tcGFyZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFja10gVGhlIGZ1bmN0aW9uIHRvIGN1c3RvbWl6ZSBjb21wYXJpbmcgdmFsdWVzLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2lzV2hlcmU9ZmFsc2VdIEEgZmxhZyB0byBpbmRpY2F0ZSBwZXJmb3JtaW5nIHBhcnRpYWwgY29tcGFyaXNvbnMuXG4gKiBAcGFyYW0ge0FycmF5fSBbc3RhY2tBPVtdXSBUcmFja3MgdHJhdmVyc2VkIGBhYCBvYmplY3RzLlxuICogQHBhcmFtIHtBcnJheX0gW3N0YWNrQj1bXV0gVHJhY2tzIHRyYXZlcnNlZCBgYmAgb2JqZWN0cy5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgdmFsdWVzIGFyZSBlcXVpdmFsZW50LCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGJhc2VJc0VxdWFsKGEsIGIsIGNhbGxiYWNrLCBpc1doZXJlLCBzdGFja0EsIHN0YWNrQikge1xuICAvLyB1c2VkIHRvIGluZGljYXRlIHRoYXQgd2hlbiBjb21wYXJpbmcgb2JqZWN0cywgYGFgIGhhcyBhdCBsZWFzdCB0aGUgcHJvcGVydGllcyBvZiBgYmBcbiAgaWYgKGNhbGxiYWNrKSB7XG4gICAgdmFyIHJlc3VsdCA9IGNhbGxiYWNrKGEsIGIpO1xuICAgIGlmICh0eXBlb2YgcmVzdWx0ICE9ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gISFyZXN1bHQ7XG4gICAgfVxuICB9XG4gIC8vIGV4aXQgZWFybHkgZm9yIGlkZW50aWNhbCB2YWx1ZXNcbiAgaWYgKGEgPT09IGIpIHtcbiAgICAvLyB0cmVhdCBgKzBgIHZzLiBgLTBgIGFzIG5vdCBlcXVhbFxuICAgIHJldHVybiBhICE9PSAwIHx8ICgxIC8gYSA9PSAxIC8gYik7XG4gIH1cbiAgdmFyIHR5cGUgPSB0eXBlb2YgYSxcbiAgICAgIG90aGVyVHlwZSA9IHR5cGVvZiBiO1xuXG4gIC8vIGV4aXQgZWFybHkgZm9yIHVubGlrZSBwcmltaXRpdmUgdmFsdWVzXG4gIGlmIChhID09PSBhICYmXG4gICAgICAhKGEgJiYgb2JqZWN0VHlwZXNbdHlwZV0pICYmXG4gICAgICAhKGIgJiYgb2JqZWN0VHlwZXNbb3RoZXJUeXBlXSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy8gZXhpdCBlYXJseSBmb3IgYG51bGxgIGFuZCBgdW5kZWZpbmVkYCBhdm9pZGluZyBFUzMncyBGdW5jdGlvbiNjYWxsIGJlaGF2aW9yXG4gIC8vIGh0dHA6Ly9lczUuZ2l0aHViLmlvLyN4MTUuMy40LjRcbiAgaWYgKGEgPT0gbnVsbCB8fCBiID09IG51bGwpIHtcbiAgICByZXR1cm4gYSA9PT0gYjtcbiAgfVxuICAvLyBjb21wYXJlIFtbQ2xhc3NdXSBuYW1lc1xuICB2YXIgY2xhc3NOYW1lID0gdG9TdHJpbmcuY2FsbChhKSxcbiAgICAgIG90aGVyQ2xhc3MgPSB0b1N0cmluZy5jYWxsKGIpO1xuXG4gIGlmIChjbGFzc05hbWUgPT0gYXJnc0NsYXNzKSB7XG4gICAgY2xhc3NOYW1lID0gb2JqZWN0Q2xhc3M7XG4gIH1cbiAgaWYgKG90aGVyQ2xhc3MgPT0gYXJnc0NsYXNzKSB7XG4gICAgb3RoZXJDbGFzcyA9IG9iamVjdENsYXNzO1xuICB9XG4gIGlmIChjbGFzc05hbWUgIT0gb3RoZXJDbGFzcykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgIGNhc2UgYm9vbENsYXNzOlxuICAgIGNhc2UgZGF0ZUNsYXNzOlxuICAgICAgLy8gY29lcmNlIGRhdGVzIGFuZCBib29sZWFucyB0byBudW1iZXJzLCBkYXRlcyB0byBtaWxsaXNlY29uZHMgYW5kIGJvb2xlYW5zXG4gICAgICAvLyB0byBgMWAgb3IgYDBgIHRyZWF0aW5nIGludmFsaWQgZGF0ZXMgY29lcmNlZCB0byBgTmFOYCBhcyBub3QgZXF1YWxcbiAgICAgIHJldHVybiArYSA9PSArYjtcblxuICAgIGNhc2UgbnVtYmVyQ2xhc3M6XG4gICAgICAvLyB0cmVhdCBgTmFOYCB2cy4gYE5hTmAgYXMgZXF1YWxcbiAgICAgIHJldHVybiAoYSAhPSArYSlcbiAgICAgICAgPyBiICE9ICtiXG4gICAgICAgIC8vIGJ1dCB0cmVhdCBgKzBgIHZzLiBgLTBgIGFzIG5vdCBlcXVhbFxuICAgICAgICA6IChhID09IDAgPyAoMSAvIGEgPT0gMSAvIGIpIDogYSA9PSArYik7XG5cbiAgICBjYXNlIHJlZ2V4cENsYXNzOlxuICAgIGNhc2Ugc3RyaW5nQ2xhc3M6XG4gICAgICAvLyBjb2VyY2UgcmVnZXhlcyB0byBzdHJpbmdzIChodHRwOi8vZXM1LmdpdGh1Yi5pby8jeDE1LjEwLjYuNClcbiAgICAgIC8vIHRyZWF0IHN0cmluZyBwcmltaXRpdmVzIGFuZCB0aGVpciBjb3JyZXNwb25kaW5nIG9iamVjdCBpbnN0YW5jZXMgYXMgZXF1YWxcbiAgICAgIHJldHVybiBhID09IFN0cmluZyhiKTtcbiAgfVxuICB2YXIgaXNBcnIgPSBjbGFzc05hbWUgPT0gYXJyYXlDbGFzcztcbiAgaWYgKCFpc0Fycikge1xuICAgIC8vIHVud3JhcCBhbnkgYGxvZGFzaGAgd3JhcHBlZCB2YWx1ZXNcbiAgICB2YXIgYVdyYXBwZWQgPSBoYXNPd25Qcm9wZXJ0eS5jYWxsKGEsICdfX3dyYXBwZWRfXycpLFxuICAgICAgICBiV3JhcHBlZCA9IGhhc093blByb3BlcnR5LmNhbGwoYiwgJ19fd3JhcHBlZF9fJyk7XG5cbiAgICBpZiAoYVdyYXBwZWQgfHwgYldyYXBwZWQpIHtcbiAgICAgIHJldHVybiBiYXNlSXNFcXVhbChhV3JhcHBlZCA/IGEuX193cmFwcGVkX18gOiBhLCBiV3JhcHBlZCA/IGIuX193cmFwcGVkX18gOiBiLCBjYWxsYmFjaywgaXNXaGVyZSwgc3RhY2tBLCBzdGFja0IpO1xuICAgIH1cbiAgICAvLyBleGl0IGZvciBmdW5jdGlvbnMgYW5kIERPTSBub2Rlc1xuICAgIGlmIChjbGFzc05hbWUgIT0gb2JqZWN0Q2xhc3MpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8gaW4gb2xkZXIgdmVyc2lvbnMgb2YgT3BlcmEsIGBhcmd1bWVudHNgIG9iamVjdHMgaGF2ZSBgQXJyYXlgIGNvbnN0cnVjdG9yc1xuICAgIHZhciBjdG9yQSA9IGEuY29uc3RydWN0b3IsXG4gICAgICAgIGN0b3JCID0gYi5jb25zdHJ1Y3RvcjtcblxuICAgIC8vIG5vbiBgT2JqZWN0YCBvYmplY3QgaW5zdGFuY2VzIHdpdGggZGlmZmVyZW50IGNvbnN0cnVjdG9ycyBhcmUgbm90IGVxdWFsXG4gICAgaWYgKGN0b3JBICE9IGN0b3JCICYmXG4gICAgICAgICAgIShpc0Z1bmN0aW9uKGN0b3JBKSAmJiBjdG9yQSBpbnN0YW5jZW9mIGN0b3JBICYmIGlzRnVuY3Rpb24oY3RvckIpICYmIGN0b3JCIGluc3RhbmNlb2YgY3RvckIpICYmXG4gICAgICAgICAgKCdjb25zdHJ1Y3RvcicgaW4gYSAmJiAnY29uc3RydWN0b3InIGluIGIpXG4gICAgICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICAvLyBhc3N1bWUgY3ljbGljIHN0cnVjdHVyZXMgYXJlIGVxdWFsXG4gIC8vIHRoZSBhbGdvcml0aG0gZm9yIGRldGVjdGluZyBjeWNsaWMgc3RydWN0dXJlcyBpcyBhZGFwdGVkIGZyb20gRVMgNS4xXG4gIC8vIHNlY3Rpb24gMTUuMTIuMywgYWJzdHJhY3Qgb3BlcmF0aW9uIGBKT2AgKGh0dHA6Ly9lczUuZ2l0aHViLmlvLyN4MTUuMTIuMylcbiAgdmFyIGluaXRlZFN0YWNrID0gIXN0YWNrQTtcbiAgc3RhY2tBIHx8IChzdGFja0EgPSBnZXRBcnJheSgpKTtcbiAgc3RhY2tCIHx8IChzdGFja0IgPSBnZXRBcnJheSgpKTtcblxuICB2YXIgbGVuZ3RoID0gc3RhY2tBLmxlbmd0aDtcbiAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgaWYgKHN0YWNrQVtsZW5ndGhdID09IGEpIHtcbiAgICAgIHJldHVybiBzdGFja0JbbGVuZ3RoXSA9PSBiO1xuICAgIH1cbiAgfVxuICB2YXIgc2l6ZSA9IDA7XG4gIHJlc3VsdCA9IHRydWU7XG5cbiAgLy8gYWRkIGBhYCBhbmQgYGJgIHRvIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0c1xuICBzdGFja0EucHVzaChhKTtcbiAgc3RhY2tCLnB1c2goYik7XG5cbiAgLy8gcmVjdXJzaXZlbHkgY29tcGFyZSBvYmplY3RzIGFuZCBhcnJheXMgKHN1c2NlcHRpYmxlIHRvIGNhbGwgc3RhY2sgbGltaXRzKVxuICBpZiAoaXNBcnIpIHtcbiAgICAvLyBjb21wYXJlIGxlbmd0aHMgdG8gZGV0ZXJtaW5lIGlmIGEgZGVlcCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeVxuICAgIGxlbmd0aCA9IGEubGVuZ3RoO1xuICAgIHNpemUgPSBiLmxlbmd0aDtcbiAgICByZXN1bHQgPSBzaXplID09IGxlbmd0aDtcblxuICAgIGlmIChyZXN1bHQgfHwgaXNXaGVyZSkge1xuICAgICAgLy8gZGVlcCBjb21wYXJlIHRoZSBjb250ZW50cywgaWdub3Jpbmcgbm9uLW51bWVyaWMgcHJvcGVydGllc1xuICAgICAgd2hpbGUgKHNpemUtLSkge1xuICAgICAgICB2YXIgaW5kZXggPSBsZW5ndGgsXG4gICAgICAgICAgICB2YWx1ZSA9IGJbc2l6ZV07XG5cbiAgICAgICAgaWYgKGlzV2hlcmUpIHtcbiAgICAgICAgICB3aGlsZSAoaW5kZXgtLSkge1xuICAgICAgICAgICAgaWYgKChyZXN1bHQgPSBiYXNlSXNFcXVhbChhW2luZGV4XSwgdmFsdWUsIGNhbGxiYWNrLCBpc1doZXJlLCBzdGFja0EsIHN0YWNrQikpKSB7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghKHJlc3VsdCA9IGJhc2VJc0VxdWFsKGFbc2l6ZV0sIHZhbHVlLCBjYWxsYmFjaywgaXNXaGVyZSwgc3RhY2tBLCBzdGFja0IpKSkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGVsc2Uge1xuICAgIC8vIGRlZXAgY29tcGFyZSBvYmplY3RzIHVzaW5nIGBmb3JJbmAsIGluc3RlYWQgb2YgYGZvck93bmAsIHRvIGF2b2lkIGBPYmplY3Qua2V5c2BcbiAgICAvLyB3aGljaCwgaW4gdGhpcyBjYXNlLCBpcyBtb3JlIGNvc3RseVxuICAgIGZvckluKGIsIGZ1bmN0aW9uKHZhbHVlLCBrZXksIGIpIHtcbiAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKGIsIGtleSkpIHtcbiAgICAgICAgLy8gY291bnQgdGhlIG51bWJlciBvZiBwcm9wZXJ0aWVzLlxuICAgICAgICBzaXplKys7XG4gICAgICAgIC8vIGRlZXAgY29tcGFyZSBlYWNoIHByb3BlcnR5IHZhbHVlLlxuICAgICAgICByZXR1cm4gKHJlc3VsdCA9IGhhc093blByb3BlcnR5LmNhbGwoYSwga2V5KSAmJiBiYXNlSXNFcXVhbChhW2tleV0sIHZhbHVlLCBjYWxsYmFjaywgaXNXaGVyZSwgc3RhY2tBLCBzdGFja0IpKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChyZXN1bHQgJiYgIWlzV2hlcmUpIHtcbiAgICAgIC8vIGVuc3VyZSBib3RoIG9iamVjdHMgaGF2ZSB0aGUgc2FtZSBudW1iZXIgb2YgcHJvcGVydGllc1xuICAgICAgZm9ySW4oYSwgZnVuY3Rpb24odmFsdWUsIGtleSwgYSkge1xuICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChhLCBrZXkpKSB7XG4gICAgICAgICAgLy8gYHNpemVgIHdpbGwgYmUgYC0xYCBpZiBgYWAgaGFzIG1vcmUgcHJvcGVydGllcyB0aGFuIGBiYFxuICAgICAgICAgIHJldHVybiAocmVzdWx0ID0gLS1zaXplID4gLTEpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgc3RhY2tBLnBvcCgpO1xuICBzdGFja0IucG9wKCk7XG5cbiAgaWYgKGluaXRlZFN0YWNrKSB7XG4gICAgcmVsZWFzZUFycmF5KHN0YWNrQSk7XG4gICAgcmVsZWFzZUFycmF5KHN0YWNrQik7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlSXNFcXVhbDtcbiIsIi8qKlxuICogTG8tRGFzaCAyLjQuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cDovL2xvZGFzaC5jb20vPlxuICogQnVpbGQ6IGBsb2Rhc2ggbW9kdWxhcml6ZSBtb2Rlcm4gZXhwb3J0cz1cIm5wbVwiIC1vIC4vbnBtL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTMgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNS4yIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxMyBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICovXG5cbi8qKlxuICogQ3JlYXRlcyBhIFwiXy5wbHVja1wiIHN0eWxlIGZ1bmN0aW9uLCB3aGljaCByZXR1cm5zIHRoZSBga2V5YCB2YWx1ZSBvZiBhXG4gKiBnaXZlbiBvYmplY3QuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBVdGlsaXRpZXNcbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgVGhlIG5hbWUgb2YgdGhlIHByb3BlcnR5IHRvIHJldHJpZXZlLlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZnVuY3Rpb24uXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBjaGFyYWN0ZXJzID0gW1xuICogICB7ICduYW1lJzogJ2ZyZWQnLCAgICdhZ2UnOiA0MCB9LFxuICogICB7ICduYW1lJzogJ2Jhcm5leScsICdhZ2UnOiAzNiB9XG4gKiBdO1xuICpcbiAqIHZhciBnZXROYW1lID0gXy5wcm9wZXJ0eSgnbmFtZScpO1xuICpcbiAqIF8ubWFwKGNoYXJhY3RlcnMsIGdldE5hbWUpO1xuICogLy8gPT4gWydiYXJuZXknLCAnZnJlZCddXG4gKlxuICogXy5zb3J0QnkoY2hhcmFjdGVycywgZ2V0TmFtZSk7XG4gKiAvLyA9PiBbeyAnbmFtZSc6ICdiYXJuZXknLCAnYWdlJzogMzYgfSwgeyAnbmFtZSc6ICdmcmVkJywgICAnYWdlJzogNDAgfV1cbiAqL1xuZnVuY3Rpb24gcHJvcGVydHkoa2V5KSB7XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0W2tleV07XG4gIH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcHJvcGVydHk7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGNyZWF0ZUNhbGxiYWNrID0gcmVxdWlyZSgnbG9kYXNoLmNyZWF0ZWNhbGxiYWNrJyksXG4gICAgZm9yT3duID0gcmVxdWlyZSgnbG9kYXNoLmZvcm93bicpO1xuXG4vKipcbiAqIFJlZHVjZXMgYSBjb2xsZWN0aW9uIHRvIGEgdmFsdWUgd2hpY2ggaXMgdGhlIGFjY3VtdWxhdGVkIHJlc3VsdCBvZiBydW5uaW5nXG4gKiBlYWNoIGVsZW1lbnQgaW4gdGhlIGNvbGxlY3Rpb24gdGhyb3VnaCB0aGUgY2FsbGJhY2ssIHdoZXJlIGVhY2ggc3VjY2Vzc2l2ZVxuICogY2FsbGJhY2sgZXhlY3V0aW9uIGNvbnN1bWVzIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIHByZXZpb3VzIGV4ZWN1dGlvbi4gSWZcbiAqIGBhY2N1bXVsYXRvcmAgaXMgbm90IHByb3ZpZGVkIHRoZSBmaXJzdCBlbGVtZW50IG9mIHRoZSBjb2xsZWN0aW9uIHdpbGwgYmVcbiAqIHVzZWQgYXMgdGhlIGluaXRpYWwgYGFjY3VtdWxhdG9yYCB2YWx1ZS4gVGhlIGNhbGxiYWNrIGlzIGJvdW5kIHRvIGB0aGlzQXJnYFxuICogYW5kIGludm9rZWQgd2l0aCBmb3VyIGFyZ3VtZW50czsgKGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXh8a2V5LCBjb2xsZWN0aW9uKS5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGFsaWFzIGZvbGRsLCBpbmplY3RcbiAqIEBjYXRlZ29yeSBDb2xsZWN0aW9uc1xuICogQHBhcmFtIHtBcnJheXxPYmplY3R8c3RyaW5nfSBjb2xsZWN0aW9uIFRoZSBjb2xsZWN0aW9uIHRvIGl0ZXJhdGUgb3Zlci5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtjYWxsYmFjaz1pZGVudGl0eV0gVGhlIGZ1bmN0aW9uIGNhbGxlZCBwZXIgaXRlcmF0aW9uLlxuICogQHBhcmFtIHsqfSBbYWNjdW11bGF0b3JdIEluaXRpYWwgdmFsdWUgb2YgdGhlIGFjY3VtdWxhdG9yLlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBjYWxsYmFja2AuXG4gKiBAcmV0dXJucyB7Kn0gUmV0dXJucyB0aGUgYWNjdW11bGF0ZWQgdmFsdWUuXG4gKiBAZXhhbXBsZVxuICpcbiAqIHZhciBzdW0gPSBfLnJlZHVjZShbMSwgMiwgM10sIGZ1bmN0aW9uKHN1bSwgbnVtKSB7XG4gKiAgIHJldHVybiBzdW0gKyBudW07XG4gKiB9KTtcbiAqIC8vID0+IDZcbiAqXG4gKiB2YXIgbWFwcGVkID0gXy5yZWR1Y2UoeyAnYSc6IDEsICdiJzogMiwgJ2MnOiAzIH0sIGZ1bmN0aW9uKHJlc3VsdCwgbnVtLCBrZXkpIHtcbiAqICAgcmVzdWx0W2tleV0gPSBudW0gKiAzO1xuICogICByZXR1cm4gcmVzdWx0O1xuICogfSwge30pO1xuICogLy8gPT4geyAnYSc6IDMsICdiJzogNiwgJ2MnOiA5IH1cbiAqL1xuZnVuY3Rpb24gcmVkdWNlKGNvbGxlY3Rpb24sIGNhbGxiYWNrLCBhY2N1bXVsYXRvciwgdGhpc0FyZykge1xuICBpZiAoIWNvbGxlY3Rpb24pIHJldHVybiBhY2N1bXVsYXRvcjtcbiAgdmFyIG5vYWNjdW0gPSBhcmd1bWVudHMubGVuZ3RoIDwgMztcbiAgY2FsbGJhY2sgPSBjcmVhdGVDYWxsYmFjayhjYWxsYmFjaywgdGhpc0FyZywgNCk7XG5cbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICBsZW5ndGggPSBjb2xsZWN0aW9uLmxlbmd0aDtcblxuICBpZiAodHlwZW9mIGxlbmd0aCA9PSAnbnVtYmVyJykge1xuICAgIGlmIChub2FjY3VtKSB7XG4gICAgICBhY2N1bXVsYXRvciA9IGNvbGxlY3Rpb25bKytpbmRleF07XG4gICAgfVxuICAgIHdoaWxlICgrK2luZGV4IDwgbGVuZ3RoKSB7XG4gICAgICBhY2N1bXVsYXRvciA9IGNhbGxiYWNrKGFjY3VtdWxhdG9yLCBjb2xsZWN0aW9uW2luZGV4XSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3JPd24oY29sbGVjdGlvbiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICBhY2N1bXVsYXRvciA9IG5vYWNjdW1cbiAgICAgICAgPyAobm9hY2N1bSA9IGZhbHNlLCB2YWx1ZSlcbiAgICAgICAgOiBjYWxsYmFjayhhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBhY2N1bXVsYXRvcjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSByZWR1Y2U7XG4iLCIvKipcbiAqIExvLURhc2ggMi40LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHA6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZHVsYXJpemUgbW9kZXJuIGV4cG9ydHM9XCJucG1cIiAtbyAuL25wbS9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDEzIFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjUuMiA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cDovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VGbGF0dGVuID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNlZmxhdHRlbicpLFxuICAgIGJhc2VVbmlxID0gcmVxdWlyZSgnbG9kYXNoLl9iYXNldW5pcScpO1xuXG4vKipcbiAqIENyZWF0ZXMgYW4gYXJyYXkgb2YgdW5pcXVlIHZhbHVlcywgaW4gb3JkZXIsIG9mIHRoZSBwcm92aWRlZCBhcnJheXMgdXNpbmdcbiAqIHN0cmljdCBlcXVhbGl0eSBmb3IgY29tcGFyaXNvbnMsIGkuZS4gYD09PWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBBcnJheXNcbiAqIEBwYXJhbSB7Li4uQXJyYXl9IFthcnJheV0gVGhlIGFycmF5cyB0byBpbnNwZWN0LlxuICogQHJldHVybnMge0FycmF5fSBSZXR1cm5zIGFuIGFycmF5IG9mIGNvbWJpbmVkIHZhbHVlcy5cbiAqIEBleGFtcGxlXG4gKlxuICogXy51bmlvbihbMSwgMiwgM10sIFs1LCAyLCAxLCA0XSwgWzIsIDFdKTtcbiAqIC8vID0+IFsxLCAyLCAzLCA1LCA0XVxuICovXG5mdW5jdGlvbiB1bmlvbigpIHtcbiAgcmV0dXJuIGJhc2VVbmlxKGJhc2VGbGF0dGVuKGFyZ3VtZW50cywgdHJ1ZSwgdHJ1ZSkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHVuaW9uO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlSW5kZXhPZiA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZWluZGV4b2YnKSxcbiAgICBjYWNoZUluZGV4T2YgPSByZXF1aXJlKCdsb2Rhc2guX2NhY2hlaW5kZXhvZicpLFxuICAgIGNyZWF0ZUNhY2hlID0gcmVxdWlyZSgnbG9kYXNoLl9jcmVhdGVjYWNoZScpLFxuICAgIGdldEFycmF5ID0gcmVxdWlyZSgnbG9kYXNoLl9nZXRhcnJheScpLFxuICAgIGxhcmdlQXJyYXlTaXplID0gcmVxdWlyZSgnbG9kYXNoLl9sYXJnZWFycmF5c2l6ZScpLFxuICAgIHJlbGVhc2VBcnJheSA9IHJlcXVpcmUoJ2xvZGFzaC5fcmVsZWFzZWFycmF5JyksXG4gICAgcmVsZWFzZU9iamVjdCA9IHJlcXVpcmUoJ2xvZGFzaC5fcmVsZWFzZW9iamVjdCcpO1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLnVuaXFgIHdpdGhvdXQgc3VwcG9ydCBmb3IgY2FsbGJhY2sgc2hvcnRoYW5kc1xuICogb3IgYHRoaXNBcmdgIGJpbmRpbmcuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBwcm9jZXNzLlxuICogQHBhcmFtIHtib29sZWFufSBbaXNTb3J0ZWQ9ZmFsc2VdIEEgZmxhZyB0byBpbmRpY2F0ZSB0aGF0IGBhcnJheWAgaXMgc29ydGVkLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2NhbGxiYWNrXSBUaGUgZnVuY3Rpb24gY2FsbGVkIHBlciBpdGVyYXRpb24uXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgYSBkdXBsaWNhdGUtdmFsdWUtZnJlZSBhcnJheS5cbiAqL1xuZnVuY3Rpb24gYmFzZVVuaXEoYXJyYXksIGlzU29ydGVkLCBjYWxsYmFjaykge1xuICB2YXIgaW5kZXggPSAtMSxcbiAgICAgIGluZGV4T2YgPSBiYXNlSW5kZXhPZixcbiAgICAgIGxlbmd0aCA9IGFycmF5ID8gYXJyYXkubGVuZ3RoIDogMCxcbiAgICAgIHJlc3VsdCA9IFtdO1xuXG4gIHZhciBpc0xhcmdlID0gIWlzU29ydGVkICYmIGxlbmd0aCA+PSBsYXJnZUFycmF5U2l6ZSxcbiAgICAgIHNlZW4gPSAoY2FsbGJhY2sgfHwgaXNMYXJnZSkgPyBnZXRBcnJheSgpIDogcmVzdWx0O1xuXG4gIGlmIChpc0xhcmdlKSB7XG4gICAgdmFyIGNhY2hlID0gY3JlYXRlQ2FjaGUoc2Vlbik7XG4gICAgaW5kZXhPZiA9IGNhY2hlSW5kZXhPZjtcbiAgICBzZWVuID0gY2FjaGU7XG4gIH1cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICB2YXIgdmFsdWUgPSBhcnJheVtpbmRleF0sXG4gICAgICAgIGNvbXB1dGVkID0gY2FsbGJhY2sgPyBjYWxsYmFjayh2YWx1ZSwgaW5kZXgsIGFycmF5KSA6IHZhbHVlO1xuXG4gICAgaWYgKGlzU29ydGVkXG4gICAgICAgICAgPyAhaW5kZXggfHwgc2VlbltzZWVuLmxlbmd0aCAtIDFdICE9PSBjb21wdXRlZFxuICAgICAgICAgIDogaW5kZXhPZihzZWVuLCBjb21wdXRlZCkgPCAwXG4gICAgICAgICkge1xuICAgICAgaWYgKGNhbGxiYWNrIHx8IGlzTGFyZ2UpIHtcbiAgICAgICAgc2Vlbi5wdXNoKGNvbXB1dGVkKTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICB9XG4gIH1cbiAgaWYgKGlzTGFyZ2UpIHtcbiAgICByZWxlYXNlQXJyYXkoc2Vlbi5hcnJheSk7XG4gICAgcmVsZWFzZU9iamVjdChzZWVuKTtcbiAgfSBlbHNlIGlmIChjYWxsYmFjaykge1xuICAgIHJlbGVhc2VBcnJheShzZWVuKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VVbmlxO1xuIiwiLyoqXG4gKiBMby1EYXNoIDIuNC4xIChDdXN0b20gQnVpbGQpIDxodHRwOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIG1vZGVybiBleHBvcnRzPVwibnBtXCIgLW8gLi9ucG0vYFxuICogQ29weXJpZ2h0IDIwMTItMjAxMyBUaGUgRG9qbyBGb3VuZGF0aW9uIDxodHRwOi8vZG9qb2ZvdW5kYXRpb24ub3JnLz5cbiAqIEJhc2VkIG9uIFVuZGVyc2NvcmUuanMgMS41LjIgPGh0dHA6Ly91bmRlcnNjb3JlanMub3JnL0xJQ0VOU0U+XG4gKiBDb3B5cmlnaHQgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4gKiBBdmFpbGFibGUgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHA6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlVW5pcSA9IHJlcXVpcmUoJ2xvZGFzaC5fYmFzZXVuaXEnKSxcbiAgICBjcmVhdGVDYWxsYmFjayA9IHJlcXVpcmUoJ2xvZGFzaC5jcmVhdGVjYWxsYmFjaycpO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBkdXBsaWNhdGUtdmFsdWUtZnJlZSB2ZXJzaW9uIG9mIGFuIGFycmF5IHVzaW5nIHN0cmljdCBlcXVhbGl0eVxuICogZm9yIGNvbXBhcmlzb25zLCBpLmUuIGA9PT1gLiBJZiB0aGUgYXJyYXkgaXMgc29ydGVkLCBwcm92aWRpbmdcbiAqIGB0cnVlYCBmb3IgYGlzU29ydGVkYCB3aWxsIHVzZSBhIGZhc3RlciBhbGdvcml0aG0uIElmIGEgY2FsbGJhY2sgaXMgcHJvdmlkZWRcbiAqIGVhY2ggZWxlbWVudCBvZiBgYXJyYXlgIGlzIHBhc3NlZCB0aHJvdWdoIHRoZSBjYWxsYmFjayBiZWZvcmUgdW5pcXVlbmVzc1xuICogaXMgY29tcHV0ZWQuIFRoZSBjYWxsYmFjayBpcyBib3VuZCB0byBgdGhpc0FyZ2AgYW5kIGludm9rZWQgd2l0aCB0aHJlZVxuICogYXJndW1lbnRzOyAodmFsdWUsIGluZGV4LCBhcnJheSkuXG4gKlxuICogSWYgYSBwcm9wZXJ0eSBuYW1lIGlzIHByb3ZpZGVkIGZvciBgY2FsbGJhY2tgIHRoZSBjcmVhdGVkIFwiXy5wbHVja1wiIHN0eWxlXG4gKiBjYWxsYmFjayB3aWxsIHJldHVybiB0aGUgcHJvcGVydHkgdmFsdWUgb2YgdGhlIGdpdmVuIGVsZW1lbnQuXG4gKlxuICogSWYgYW4gb2JqZWN0IGlzIHByb3ZpZGVkIGZvciBgY2FsbGJhY2tgIHRoZSBjcmVhdGVkIFwiXy53aGVyZVwiIHN0eWxlIGNhbGxiYWNrXG4gKiB3aWxsIHJldHVybiBgdHJ1ZWAgZm9yIGVsZW1lbnRzIHRoYXQgaGF2ZSB0aGUgcHJvcGVydGllcyBvZiB0aGUgZ2l2ZW4gb2JqZWN0LFxuICogZWxzZSBgZmFsc2VgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAYWxpYXMgdW5pcXVlXG4gKiBAY2F0ZWdvcnkgQXJyYXlzXG4gKiBAcGFyYW0ge0FycmF5fSBhcnJheSBUaGUgYXJyYXkgdG8gcHJvY2Vzcy5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2lzU29ydGVkPWZhbHNlXSBBIGZsYWcgdG8gaW5kaWNhdGUgdGhhdCBgYXJyYXlgIGlzIHNvcnRlZC5cbiAqIEBwYXJhbSB7RnVuY3Rpb258T2JqZWN0fHN0cmluZ30gW2NhbGxiYWNrPWlkZW50aXR5XSBUaGUgZnVuY3Rpb24gY2FsbGVkXG4gKiAgcGVyIGl0ZXJhdGlvbi4gSWYgYSBwcm9wZXJ0eSBuYW1lIG9yIG9iamVjdCBpcyBwcm92aWRlZCBpdCB3aWxsIGJlIHVzZWRcbiAqICB0byBjcmVhdGUgYSBcIl8ucGx1Y2tcIiBvciBcIl8ud2hlcmVcIiBzdHlsZSBjYWxsYmFjaywgcmVzcGVjdGl2ZWx5LlxuICogQHBhcmFtIHsqfSBbdGhpc0FyZ10gVGhlIGB0aGlzYCBiaW5kaW5nIG9mIGBjYWxsYmFja2AuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgYSBkdXBsaWNhdGUtdmFsdWUtZnJlZSBhcnJheS5cbiAqIEBleGFtcGxlXG4gKlxuICogXy51bmlxKFsxLCAyLCAxLCAzLCAxXSk7XG4gKiAvLyA9PiBbMSwgMiwgM11cbiAqXG4gKiBfLnVuaXEoWzEsIDEsIDIsIDIsIDNdLCB0cnVlKTtcbiAqIC8vID0+IFsxLCAyLCAzXVxuICpcbiAqIF8udW5pcShbJ0EnLCAnYicsICdDJywgJ2EnLCAnQicsICdjJ10sIGZ1bmN0aW9uKGxldHRlcikgeyByZXR1cm4gbGV0dGVyLnRvTG93ZXJDYXNlKCk7IH0pO1xuICogLy8gPT4gWydBJywgJ2InLCAnQyddXG4gKlxuICogXy51bmlxKFsxLCAyLjUsIDMsIDEuNSwgMiwgMy41XSwgZnVuY3Rpb24obnVtKSB7IHJldHVybiB0aGlzLmZsb29yKG51bSk7IH0sIE1hdGgpO1xuICogLy8gPT4gWzEsIDIuNSwgM11cbiAqXG4gKiAvLyB1c2luZyBcIl8ucGx1Y2tcIiBjYWxsYmFjayBzaG9ydGhhbmRcbiAqIF8udW5pcShbeyAneCc6IDEgfSwgeyAneCc6IDIgfSwgeyAneCc6IDEgfV0sICd4Jyk7XG4gKiAvLyA9PiBbeyAneCc6IDEgfSwgeyAneCc6IDIgfV1cbiAqL1xuZnVuY3Rpb24gdW5pcShhcnJheSwgaXNTb3J0ZWQsIGNhbGxiYWNrLCB0aGlzQXJnKSB7XG4gIC8vIGp1Z2dsZSBhcmd1bWVudHNcbiAgaWYgKHR5cGVvZiBpc1NvcnRlZCAhPSAnYm9vbGVhbicgJiYgaXNTb3J0ZWQgIT0gbnVsbCkge1xuICAgIHRoaXNBcmcgPSBjYWxsYmFjaztcbiAgICBjYWxsYmFjayA9ICh0eXBlb2YgaXNTb3J0ZWQgIT0gJ2Z1bmN0aW9uJyAmJiB0aGlzQXJnICYmIHRoaXNBcmdbaXNTb3J0ZWRdID09PSBhcnJheSkgPyBudWxsIDogaXNTb3J0ZWQ7XG4gICAgaXNTb3J0ZWQgPSBmYWxzZTtcbiAgfVxuICBpZiAoY2FsbGJhY2sgIT0gbnVsbCkge1xuICAgIGNhbGxiYWNrID0gY3JlYXRlQ2FsbGJhY2soY2FsbGJhY2ssIHRoaXNBcmcsIDMpO1xuICB9XG4gIHJldHVybiBiYXNlVW5pcShhcnJheSwgaXNTb3J0ZWQsIGNhbGxiYWNrKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB1bmlxO1xuIiwiLyohXG4gKiBwYXJzZXVybFxuICogQ29weXJpZ2h0KGMpIDIwMTQgSm9uYXRoYW4gT25nXG4gKiBDb3B5cmlnaHQoYykgMjAxNCBEb3VnbGFzIENocmlzdG9waGVyIFdpbHNvblxuICogTUlUIExpY2Vuc2VkXG4gKi9cblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciB1cmwgPSByZXF1aXJlKCd1cmwnKVxudmFyIHBhcnNlID0gdXJsLnBhcnNlXG52YXIgVXJsID0gdXJsLlVybFxuXG4vKipcbiAqIFBhdHRlcm4gZm9yIGEgc2ltcGxlIHBhdGggY2FzZS5cbiAqIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL3B1bGwvNzg3OFxuICovXG5cbnZhciBzaW1wbGVQYXRoUmVnRXhwID0gL14oXFwvXFwvPyg/IVxcLylbXlxcPyNcXHNdKikoXFw/W14jXFxzXSopPyQvXG5cbi8qKlxuICogRXhwb3J0cy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHBhcnNldXJsXG5tb2R1bGUuZXhwb3J0cy5vcmlnaW5hbCA9IG9yaWdpbmFsdXJsXG5cbi8qKlxuICogUGFyc2UgdGhlIGByZXFgIHVybCB3aXRoIG1lbW9pemF0aW9uLlxuICpcbiAqIEBwYXJhbSB7U2VydmVyUmVxdWVzdH0gcmVxXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIHBhcnNldXJsKHJlcSkge1xuICB2YXIgdXJsID0gcmVxLnVybFxuXG4gIGlmICh1cmwgPT09IHVuZGVmaW5lZCkge1xuICAgIC8vIFVSTCBpcyB1bmRlZmluZWRcbiAgICByZXR1cm4gdW5kZWZpbmVkXG4gIH1cblxuICB2YXIgcGFyc2VkID0gcmVxLl9wYXJzZWRVcmxcblxuICBpZiAoZnJlc2godXJsLCBwYXJzZWQpKSB7XG4gICAgLy8gUmV0dXJuIGNhY2hlZCBVUkwgcGFyc2VcbiAgICByZXR1cm4gcGFyc2VkXG4gIH1cblxuICAvLyBQYXJzZSB0aGUgVVJMXG4gIHBhcnNlZCA9IGZhc3RwYXJzZSh1cmwpXG4gIHBhcnNlZC5fcmF3ID0gdXJsXG5cbiAgcmV0dXJuIHJlcS5fcGFyc2VkVXJsID0gcGFyc2VkXG59O1xuXG4vKipcbiAqIFBhcnNlIHRoZSBgcmVxYCBvcmlnaW5hbCB1cmwgd2l0aCBmYWxsYmFjayBhbmQgbWVtb2l6YXRpb24uXG4gKlxuICogQHBhcmFtIHtTZXJ2ZXJSZXF1ZXN0fSByZXFcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gb3JpZ2luYWx1cmwocmVxKSB7XG4gIHZhciB1cmwgPSByZXEub3JpZ2luYWxVcmxcblxuICBpZiAodHlwZW9mIHVybCAhPT0gJ3N0cmluZycpIHtcbiAgICAvLyBGYWxsYmFja1xuICAgIHJldHVybiBwYXJzZXVybChyZXEpXG4gIH1cblxuICB2YXIgcGFyc2VkID0gcmVxLl9wYXJzZWRPcmlnaW5hbFVybFxuXG4gIGlmIChmcmVzaCh1cmwsIHBhcnNlZCkpIHtcbiAgICAvLyBSZXR1cm4gY2FjaGVkIFVSTCBwYXJzZVxuICAgIHJldHVybiBwYXJzZWRcbiAgfVxuXG4gIC8vIFBhcnNlIHRoZSBVUkxcbiAgcGFyc2VkID0gZmFzdHBhcnNlKHVybClcbiAgcGFyc2VkLl9yYXcgPSB1cmxcblxuICByZXR1cm4gcmVxLl9wYXJzZWRPcmlnaW5hbFVybCA9IHBhcnNlZFxufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgYHN0cmAgdXJsIHdpdGggZmFzdC1wYXRoIHNob3J0LWN1dC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBmYXN0cGFyc2Uoc3RyKSB7XG4gIC8vIFRyeSBmYXN0IHBhdGggcmVnZXhwXG4gIC8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL3B1bGwvNzg3OFxuICB2YXIgc2ltcGxlUGF0aCA9IHR5cGVvZiBzdHIgPT09ICdzdHJpbmcnICYmIHNpbXBsZVBhdGhSZWdFeHAuZXhlYyhzdHIpXG5cbiAgLy8gQ29uc3RydWN0IHNpbXBsZSBVUkxcbiAgaWYgKHNpbXBsZVBhdGgpIHtcbiAgICB2YXIgcGF0aG5hbWUgPSBzaW1wbGVQYXRoWzFdXG4gICAgdmFyIHNlYXJjaCA9IHNpbXBsZVBhdGhbMl0gfHwgbnVsbFxuICAgIHZhciB1cmwgPSBVcmwgIT09IHVuZGVmaW5lZFxuICAgICAgPyBuZXcgVXJsKClcbiAgICAgIDoge31cbiAgICB1cmwucGF0aCA9IHN0clxuICAgIHVybC5ocmVmID0gc3RyXG4gICAgdXJsLnBhdGhuYW1lID0gcGF0aG5hbWVcbiAgICB1cmwuc2VhcmNoID0gc2VhcmNoXG4gICAgdXJsLnF1ZXJ5ID0gc2VhcmNoICYmIHNlYXJjaC5zdWJzdHIoMSlcblxuICAgIHJldHVybiB1cmxcbiAgfVxuXG4gIHJldHVybiBwYXJzZShzdHIpXG59XG5cbi8qKlxuICogRGV0ZXJtaW5lIGlmIHBhcnNlZCBpcyBzdGlsbCBmcmVzaCBmb3IgdXJsLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7b2JqZWN0fSBwYXJzZWRVcmxcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBmcmVzaCh1cmwsIHBhcnNlZFVybCkge1xuICByZXR1cm4gdHlwZW9mIHBhcnNlZFVybCA9PT0gJ29iamVjdCdcbiAgICAmJiBwYXJzZWRVcmwgIT09IG51bGxcbiAgICAmJiAoVXJsID09PSB1bmRlZmluZWQgfHwgcGFyc2VkVXJsIGluc3RhbmNlb2YgVXJsKVxuICAgICYmIHBhcnNlZFVybC5fcmF3ID09PSB1cmxcbn1cbiIsIi8qKlxuICogRXhwb3NlIGBwYXRodG9SZWdleHBgLlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IHBhdGh0b1JlZ2V4cDtcblxuLyoqXG4gKiBUaGUgbWFpbiBwYXRoIG1hdGNoaW5nIHJlZ2V4cCB1dGlsaXR5LlxuICpcbiAqIEB0eXBlIHtSZWdFeHB9XG4gKi9cbnZhciBQQVRIX1JFR0VYUCA9IG5ldyBSZWdFeHAoW1xuICAvLyBNYXRjaCBhbHJlYWR5IGVzY2FwZWQgY2hhcmFjdGVycyB0aGF0IHdvdWxkIG90aGVyd2lzZSBpbmNvcnJlY3RseSBhcHBlYXJcbiAgLy8gaW4gZnV0dXJlIG1hdGNoZXMuIFRoaXMgYWxsb3dzIHRoZSB1c2VyIHRvIGVzY2FwZSBzcGVjaWFsIGNoYXJhY3RlcnMgdGhhdFxuICAvLyBzaG91bGRuJ3QgYmUgdHJhbnNmb3JtZWQuXG4gICcoXFxcXFxcXFwuKScsXG4gIC8vIE1hdGNoIEV4cHJlc3Mtc3R5bGUgcGFyYW1ldGVycyBhbmQgdW4tbmFtZWQgcGFyYW1ldGVycyB3aXRoIGEgcHJlZml4XG4gIC8vIGFuZCBvcHRpb25hbCBzdWZmaXhlcy4gTWF0Y2hlcyBhcHBlYXIgYXM6XG4gIC8vXG4gIC8vIFwiLzp0ZXN0KFxcXFxkKyk/XCIgPT4gW1wiL1wiLCBcInRlc3RcIiwgXCJcXGQrXCIsIHVuZGVmaW5lZCwgXCI/XCJdXG4gIC8vIFwiL3JvdXRlKFxcXFxkKylcIiA9PiBbdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgXCJcXGQrXCIsIHVuZGVmaW5lZF1cbiAgJyhbXFxcXC8uXSk/KD86XFxcXDooXFxcXHcrKSg/OlxcXFwoKCg/OlxcXFxcXFxcLnxbXildKSopXFxcXCkpP3xcXFxcKCgoPzpcXFxcXFxcXC58W14pXSkqKVxcXFwpKShbKyo/XSk/JyxcbiAgLy8gTWF0Y2ggcmVnZXhwIHNwZWNpYWwgY2hhcmFjdGVycyB0aGF0IHNob3VsZCBhbHdheXMgYmUgZXNjYXBlZC5cbiAgJyhbLisqPz1eIToke30oKVtcXFxcXXxcXFxcL10pJ1xuXS5qb2luKCd8JyksICdnJyk7XG5cbi8qKlxuICogRXNjYXBlIHRoZSBjYXB0dXJpbmcgZ3JvdXAgYnkgZXNjYXBpbmcgc3BlY2lhbCBjaGFyYWN0ZXJzIGFuZCBtZWFuaW5nLlxuICpcbiAqIEBwYXJhbSAge1N0cmluZ30gZ3JvdXBcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZXNjYXBlR3JvdXAgKGdyb3VwKSB7XG4gIHJldHVybiBncm91cC5yZXBsYWNlKC8oWz0hOiRcXC8oKV0pL2csICdcXFxcJDEnKTtcbn1cblxuLyoqXG4gKiBBdHRhY2ggdGhlIGtleXMgYXMgYSBwcm9wZXJ0eSBvZiB0aGUgcmVnZXhwLlxuICpcbiAqIEBwYXJhbSAge1JlZ0V4cH0gcmVcbiAqIEBwYXJhbSAge0FycmF5fSAga2V5c1xuICogQHJldHVybiB7UmVnRXhwfVxuICovXG52YXIgYXR0YWNoS2V5cyA9IGZ1bmN0aW9uIChyZSwga2V5cykge1xuICByZS5rZXlzID0ga2V5cztcblxuICByZXR1cm4gcmU7XG59O1xuXG4vKipcbiAqIE5vcm1hbGl6ZSB0aGUgZ2l2ZW4gcGF0aCBzdHJpbmcsIHJldHVybmluZyBhIHJlZ3VsYXIgZXhwcmVzc2lvbi5cbiAqXG4gKiBBbiBlbXB0eSBhcnJheSBzaG91bGQgYmUgcGFzc2VkIGluLCB3aGljaCB3aWxsIGNvbnRhaW4gdGhlIHBsYWNlaG9sZGVyIGtleVxuICogbmFtZXMuIEZvciBleGFtcGxlIGAvdXNlci86aWRgIHdpbGwgdGhlbiBjb250YWluIGBbXCJpZFwiXWAuXG4gKlxuICogQHBhcmFtICB7KFN0cmluZ3xSZWdFeHB8QXJyYXkpfSBwYXRoXG4gKiBAcGFyYW0gIHtBcnJheX0gICAgICAgICAgICAgICAgIGtleXNcbiAqIEBwYXJhbSAge09iamVjdH0gICAgICAgICAgICAgICAgb3B0aW9uc1xuICogQHJldHVybiB7UmVnRXhwfVxuICovXG5mdW5jdGlvbiBwYXRodG9SZWdleHAgKHBhdGgsIGtleXMsIG9wdGlvbnMpIHtcbiAgaWYgKGtleXMgJiYgIUFycmF5LmlzQXJyYXkoa2V5cykpIHtcbiAgICBvcHRpb25zID0ga2V5cztcbiAgICBrZXlzID0gbnVsbDtcbiAgfVxuXG4gIGtleXMgPSBrZXlzIHx8IFtdO1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICB2YXIgc3RyaWN0ID0gb3B0aW9ucy5zdHJpY3Q7XG4gIHZhciBlbmQgPSBvcHRpb25zLmVuZCAhPT0gZmFsc2U7XG4gIHZhciBmbGFncyA9IG9wdGlvbnMuc2Vuc2l0aXZlID8gJycgOiAnaSc7XG4gIHZhciBpbmRleCA9IDA7XG5cbiAgaWYgKHBhdGggaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAvLyBNYXRjaCBhbGwgY2FwdHVyaW5nIGdyb3VwcyBvZiBhIHJlZ2V4cC5cbiAgICB2YXIgZ3JvdXBzID0gcGF0aC5zb3VyY2UubWF0Y2goL1xcKCg/IVxcPykvZykgfHwgW107XG5cbiAgICAvLyBNYXAgYWxsIHRoZSBtYXRjaGVzIHRvIHRoZWlyIG51bWVyaWMga2V5cyBhbmQgcHVzaCBpbnRvIHRoZSBrZXlzLlxuICAgIGtleXMucHVzaC5hcHBseShrZXlzLCBncm91cHMubWFwKGZ1bmN0aW9uIChtYXRjaCwgaW5kZXgpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6ICAgICAgaW5kZXgsXG4gICAgICAgIGRlbGltaXRlcjogbnVsbCxcbiAgICAgICAgb3B0aW9uYWw6ICBmYWxzZSxcbiAgICAgICAgcmVwZWF0OiAgICBmYWxzZVxuICAgICAgfTtcbiAgICB9KSk7XG5cbiAgICAvLyBSZXR1cm4gdGhlIHNvdXJjZSBiYWNrIHRvIHRoZSB1c2VyLlxuICAgIHJldHVybiBhdHRhY2hLZXlzKHBhdGgsIGtleXMpO1xuICB9XG5cbiAgaWYgKEFycmF5LmlzQXJyYXkocGF0aCkpIHtcbiAgICAvLyBNYXAgYXJyYXkgcGFydHMgaW50byByZWdleHBzIGFuZCByZXR1cm4gdGhlaXIgc291cmNlLiBXZSBhbHNvIHBhc3NcbiAgICAvLyB0aGUgc2FtZSBrZXlzIGFuZCBvcHRpb25zIGluc3RhbmNlIGludG8gZXZlcnkgZ2VuZXJhdGlvbiB0byBnZXRcbiAgICAvLyBjb25zaXN0ZW50IG1hdGNoaW5nIGdyb3VwcyBiZWZvcmUgd2Ugam9pbiB0aGUgc291cmNlcyB0b2dldGhlci5cbiAgICBwYXRoID0gcGF0aC5tYXAoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICByZXR1cm4gcGF0aHRvUmVnZXhwKHZhbHVlLCBrZXlzLCBvcHRpb25zKS5zb3VyY2U7XG4gICAgfSk7XG5cbiAgICAvLyBHZW5lcmF0ZSBhIG5ldyByZWdleHAgaW5zdGFuY2UgYnkgam9pbmluZyBhbGwgdGhlIHBhcnRzIHRvZ2V0aGVyLlxuICAgIHJldHVybiBhdHRhY2hLZXlzKG5ldyBSZWdFeHAoJyg/OicgKyBwYXRoLmpvaW4oJ3wnKSArICcpJywgZmxhZ3MpLCBrZXlzKTtcbiAgfVxuXG4gIC8vIEFsdGVyIHRoZSBwYXRoIHN0cmluZyBpbnRvIGEgdXNhYmxlIHJlZ2V4cC5cbiAgcGF0aCA9IHBhdGgucmVwbGFjZShQQVRIX1JFR0VYUCwgZnVuY3Rpb24gKG1hdGNoLCBlc2NhcGVkLCBwcmVmaXgsIGtleSwgY2FwdHVyZSwgZ3JvdXAsIHN1ZmZpeCwgZXNjYXBlKSB7XG4gICAgLy8gQXZvaWRpbmcgcmUtZXNjYXBpbmcgZXNjYXBlZCBjaGFyYWN0ZXJzLlxuICAgIGlmIChlc2NhcGVkKSB7XG4gICAgICByZXR1cm4gZXNjYXBlZDtcbiAgICB9XG5cbiAgICAvLyBFc2NhcGUgcmVnZXhwIHNwZWNpYWwgY2hhcmFjdGVycy5cbiAgICBpZiAoZXNjYXBlKSB7XG4gICAgICByZXR1cm4gJ1xcXFwnICsgZXNjYXBlO1xuICAgIH1cblxuICAgIHZhciByZXBlYXQgICA9IHN1ZmZpeCA9PT0gJysnIHx8IHN1ZmZpeCA9PT0gJyonO1xuICAgIHZhciBvcHRpb25hbCA9IHN1ZmZpeCA9PT0gJz8nIHx8IHN1ZmZpeCA9PT0gJyonO1xuXG4gICAga2V5cy5wdXNoKHtcbiAgICAgIG5hbWU6ICAgICAga2V5IHx8IGluZGV4KyssXG4gICAgICBkZWxpbWl0ZXI6IHByZWZpeCB8fCAnLycsXG4gICAgICBvcHRpb25hbDogIG9wdGlvbmFsLFxuICAgICAgcmVwZWF0OiAgICByZXBlYXRcbiAgICB9KTtcblxuICAgIC8vIEVzY2FwZSB0aGUgcHJlZml4IGNoYXJhY3Rlci5cbiAgICBwcmVmaXggPSBwcmVmaXggPyAnXFxcXCcgKyBwcmVmaXggOiAnJztcblxuICAgIC8vIE1hdGNoIHVzaW5nIHRoZSBjdXN0b20gY2FwdHVyaW5nIGdyb3VwLCBvciBmYWxsYmFjayB0byBjYXB0dXJpbmdcbiAgICAvLyBldmVyeXRoaW5nIHVwIHRvIHRoZSBuZXh0IHNsYXNoIChvciBuZXh0IHBlcmlvZCBpZiB0aGUgcGFyYW0gd2FzXG4gICAgLy8gcHJlZml4ZWQgd2l0aCBhIHBlcmlvZCkuXG4gICAgY2FwdHVyZSA9IGVzY2FwZUdyb3VwKGNhcHR1cmUgfHwgZ3JvdXAgfHwgJ1teJyArIChwcmVmaXggfHwgJ1xcXFwvJykgKyAnXSs/Jyk7XG5cbiAgICAvLyBBbGxvdyBwYXJhbWV0ZXJzIHRvIGJlIHJlcGVhdGVkIG1vcmUgdGhhbiBvbmNlLlxuICAgIGlmIChyZXBlYXQpIHtcbiAgICAgIGNhcHR1cmUgPSBjYXB0dXJlICsgJyg/OicgKyBwcmVmaXggKyBjYXB0dXJlICsgJykqJztcbiAgICB9XG5cbiAgICAvLyBBbGxvdyBhIHBhcmFtZXRlciB0byBiZSBvcHRpb25hbC5cbiAgICBpZiAob3B0aW9uYWwpIHtcbiAgICAgIHJldHVybiAnKD86JyArIHByZWZpeCArICcoJyArIGNhcHR1cmUgKyAnKSk/JztcbiAgICB9XG5cbiAgICAvLyBCYXNpYyBwYXJhbWV0ZXIgc3VwcG9ydC5cbiAgICByZXR1cm4gcHJlZml4ICsgJygnICsgY2FwdHVyZSArICcpJztcbiAgfSk7XG5cbiAgLy8gQ2hlY2sgd2hldGhlciB0aGUgcGF0aCBlbmRzIGluIGEgc2xhc2ggYXMgaXQgYWx0ZXJzIHNvbWUgbWF0Y2ggYmVoYXZpb3VyLlxuICB2YXIgZW5kc1dpdGhTbGFzaCA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXSA9PT0gJy8nO1xuXG4gIC8vIEluIG5vbi1zdHJpY3QgbW9kZSB3ZSBhbGxvdyBhbiBvcHRpb25hbCB0cmFpbGluZyBzbGFzaCBpbiB0aGUgbWF0Y2guIElmXG4gIC8vIHRoZSBwYXRoIHRvIG1hdGNoIGFscmVhZHkgZW5kZWQgd2l0aCBhIHNsYXNoLCB3ZSBuZWVkIHRvIHJlbW92ZSBpdCBmb3JcbiAgLy8gY29uc2lzdGVuY3kuIFRoZSBzbGFzaCBpcyBvbmx5IHZhbGlkIGF0IHRoZSB2ZXJ5IGVuZCBvZiBhIHBhdGggbWF0Y2gsIG5vdFxuICAvLyBhbnl3aGVyZSBpbiB0aGUgbWlkZGxlLiBUaGlzIGlzIGltcG9ydGFudCBmb3Igbm9uLWVuZGluZyBtb2RlLCBvdGhlcndpc2VcbiAgLy8gXCIvdGVzdC9cIiB3aWxsIG1hdGNoIFwiL3Rlc3QvL3JvdXRlXCIuXG4gIGlmICghc3RyaWN0KSB7XG4gICAgcGF0aCA9IChlbmRzV2l0aFNsYXNoID8gcGF0aC5zbGljZSgwLCAtMikgOiBwYXRoKSArICcoPzpcXFxcLyg/PSQpKT8nO1xuICB9XG5cbiAgLy8gSW4gbm9uLWVuZGluZyBtb2RlLCB3ZSBuZWVkIHByb21wdCB0aGUgY2FwdHVyaW5nIGdyb3VwcyB0byBtYXRjaCBhcyBtdWNoXG4gIC8vIGFzIHBvc3NpYmxlIGJ5IHVzaW5nIGEgcG9zaXRpdmUgbG9va2FoZWFkIGZvciB0aGUgZW5kIG9yIG5leHQgcGF0aCBzZWdtZW50LlxuICBpZiAoIWVuZCkge1xuICAgIHBhdGggKz0gc3RyaWN0ICYmIGVuZHNXaXRoU2xhc2ggPyAnJyA6ICcoPz1cXFxcL3wkKSc7XG4gIH1cblxuICByZXR1cm4gYXR0YWNoS2V5cyhuZXcgUmVnRXhwKCdeJyArIHBhdGggKyAoZW5kID8gJyQnIDogJycpLCBmbGFncyksIGtleXMpO1xufTtcbiIsIi8qanNoaW50IGJpdHdpc2U6ZmFsc2UqL1xuLypnbG9iYWwgdW5lc2NhcGUqL1xuXG4oZnVuY3Rpb24gKGZhY3RvcnkpIHtcbiAgICBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIC8vIE5vZGUvQ29tbW9uSlNcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICAgICAgLy8gQU1EXG4gICAgICAgIGRlZmluZShmYWN0b3J5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBCcm93c2VyIGdsb2JhbHMgKHdpdGggc3VwcG9ydCBmb3Igd2ViIHdvcmtlcnMpXG4gICAgICAgIHZhciBnbG9iO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZ2xvYiA9IHdpbmRvdztcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgZ2xvYiA9IHNlbGY7XG4gICAgICAgIH1cblxuICAgICAgICBnbG9iLlNwYXJrTUQ1ID0gZmFjdG9yeSgpO1xuICAgIH1cbn0oZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuXG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgLypcbiAgICAgKiBGYXN0ZXN0IG1kNSBpbXBsZW1lbnRhdGlvbiBhcm91bmQgKEpLTSBtZDUpXG4gICAgICogQ3JlZGl0czogSm9zZXBoIE15ZXJzXG4gICAgICpcbiAgICAgKiBAc2VlIGh0dHA6Ly93d3cubXllcnNkYWlseS5vcmcvam9zZXBoL2phdmFzY3JpcHQvbWQ1LXRleHQuaHRtbFxuICAgICAqIEBzZWUgaHR0cDovL2pzcGVyZi5jb20vbWQ1LXNob290b3V0LzdcbiAgICAgKi9cblxuICAgIC8qIHRoaXMgZnVuY3Rpb24gaXMgbXVjaCBmYXN0ZXIsXG4gICAgICBzbyBpZiBwb3NzaWJsZSB3ZSB1c2UgaXQuIFNvbWUgSUVzXG4gICAgICBhcmUgdGhlIG9ubHkgb25lcyBJIGtub3cgb2YgdGhhdFxuICAgICAgbmVlZCB0aGUgaWRpb3RpYyBzZWNvbmQgZnVuY3Rpb24sXG4gICAgICBnZW5lcmF0ZWQgYnkgYW4gaWYgY2xhdXNlLiAgKi9cbiAgICB2YXIgYWRkMzIgPSBmdW5jdGlvbiAoYSwgYikge1xuICAgICAgICByZXR1cm4gKGEgKyBiKSAmIDB4RkZGRkZGRkY7XG4gICAgfSxcblxuICAgIGNtbiA9IGZ1bmN0aW9uIChxLCBhLCBiLCB4LCBzLCB0KSB7XG4gICAgICAgIGEgPSBhZGQzMihhZGQzMihhLCBxKSwgYWRkMzIoeCwgdCkpO1xuICAgICAgICByZXR1cm4gYWRkMzIoKGEgPDwgcykgfCAoYSA+Pj4gKDMyIC0gcykpLCBiKTtcbiAgICB9LFxuXG4gICAgZmYgPSBmdW5jdGlvbiAoYSwgYiwgYywgZCwgeCwgcywgdCkge1xuICAgICAgICByZXR1cm4gY21uKChiICYgYykgfCAoKH5iKSAmIGQpLCBhLCBiLCB4LCBzLCB0KTtcbiAgICB9LFxuXG4gICAgZ2cgPSBmdW5jdGlvbiAoYSwgYiwgYywgZCwgeCwgcywgdCkge1xuICAgICAgICByZXR1cm4gY21uKChiICYgZCkgfCAoYyAmICh+ZCkpLCBhLCBiLCB4LCBzLCB0KTtcbiAgICB9LFxuXG4gICAgaGggPSBmdW5jdGlvbiAoYSwgYiwgYywgZCwgeCwgcywgdCkge1xuICAgICAgICByZXR1cm4gY21uKGIgXiBjIF4gZCwgYSwgYiwgeCwgcywgdCk7XG4gICAgfSxcblxuICAgIGlpID0gZnVuY3Rpb24gKGEsIGIsIGMsIGQsIHgsIHMsIHQpIHtcbiAgICAgICAgcmV0dXJuIGNtbihjIF4gKGIgfCAofmQpKSwgYSwgYiwgeCwgcywgdCk7XG4gICAgfSxcblxuICAgIG1kNWN5Y2xlID0gZnVuY3Rpb24gKHgsIGspIHtcbiAgICAgICAgdmFyIGEgPSB4WzBdLFxuICAgICAgICAgICAgYiA9IHhbMV0sXG4gICAgICAgICAgICBjID0geFsyXSxcbiAgICAgICAgICAgIGQgPSB4WzNdO1xuXG4gICAgICAgIGEgPSBmZihhLCBiLCBjLCBkLCBrWzBdLCA3LCAtNjgwODc2OTM2KTtcbiAgICAgICAgZCA9IGZmKGQsIGEsIGIsIGMsIGtbMV0sIDEyLCAtMzg5NTY0NTg2KTtcbiAgICAgICAgYyA9IGZmKGMsIGQsIGEsIGIsIGtbMl0sIDE3LCA2MDYxMDU4MTkpO1xuICAgICAgICBiID0gZmYoYiwgYywgZCwgYSwga1szXSwgMjIsIC0xMDQ0NTI1MzMwKTtcbiAgICAgICAgYSA9IGZmKGEsIGIsIGMsIGQsIGtbNF0sIDcsIC0xNzY0MTg4OTcpO1xuICAgICAgICBkID0gZmYoZCwgYSwgYiwgYywga1s1XSwgMTIsIDEyMDAwODA0MjYpO1xuICAgICAgICBjID0gZmYoYywgZCwgYSwgYiwga1s2XSwgMTcsIC0xNDczMjMxMzQxKTtcbiAgICAgICAgYiA9IGZmKGIsIGMsIGQsIGEsIGtbN10sIDIyLCAtNDU3MDU5ODMpO1xuICAgICAgICBhID0gZmYoYSwgYiwgYywgZCwga1s4XSwgNywgMTc3MDAzNTQxNik7XG4gICAgICAgIGQgPSBmZihkLCBhLCBiLCBjLCBrWzldLCAxMiwgLTE5NTg0MTQ0MTcpO1xuICAgICAgICBjID0gZmYoYywgZCwgYSwgYiwga1sxMF0sIDE3LCAtNDIwNjMpO1xuICAgICAgICBiID0gZmYoYiwgYywgZCwgYSwga1sxMV0sIDIyLCAtMTk5MDQwNDE2Mik7XG4gICAgICAgIGEgPSBmZihhLCBiLCBjLCBkLCBrWzEyXSwgNywgMTgwNDYwMzY4Mik7XG4gICAgICAgIGQgPSBmZihkLCBhLCBiLCBjLCBrWzEzXSwgMTIsIC00MDM0MTEwMSk7XG4gICAgICAgIGMgPSBmZihjLCBkLCBhLCBiLCBrWzE0XSwgMTcsIC0xNTAyMDAyMjkwKTtcbiAgICAgICAgYiA9IGZmKGIsIGMsIGQsIGEsIGtbMTVdLCAyMiwgMTIzNjUzNTMyOSk7XG5cbiAgICAgICAgYSA9IGdnKGEsIGIsIGMsIGQsIGtbMV0sIDUsIC0xNjU3OTY1MTApO1xuICAgICAgICBkID0gZ2coZCwgYSwgYiwgYywga1s2XSwgOSwgLTEwNjk1MDE2MzIpO1xuICAgICAgICBjID0gZ2coYywgZCwgYSwgYiwga1sxMV0sIDE0LCA2NDM3MTc3MTMpO1xuICAgICAgICBiID0gZ2coYiwgYywgZCwgYSwga1swXSwgMjAsIC0zNzM4OTczMDIpO1xuICAgICAgICBhID0gZ2coYSwgYiwgYywgZCwga1s1XSwgNSwgLTcwMTU1ODY5MSk7XG4gICAgICAgIGQgPSBnZyhkLCBhLCBiLCBjLCBrWzEwXSwgOSwgMzgwMTYwODMpO1xuICAgICAgICBjID0gZ2coYywgZCwgYSwgYiwga1sxNV0sIDE0LCAtNjYwNDc4MzM1KTtcbiAgICAgICAgYiA9IGdnKGIsIGMsIGQsIGEsIGtbNF0sIDIwLCAtNDA1NTM3ODQ4KTtcbiAgICAgICAgYSA9IGdnKGEsIGIsIGMsIGQsIGtbOV0sIDUsIDU2ODQ0NjQzOCk7XG4gICAgICAgIGQgPSBnZyhkLCBhLCBiLCBjLCBrWzE0XSwgOSwgLTEwMTk4MDM2OTApO1xuICAgICAgICBjID0gZ2coYywgZCwgYSwgYiwga1szXSwgMTQsIC0xODczNjM5NjEpO1xuICAgICAgICBiID0gZ2coYiwgYywgZCwgYSwga1s4XSwgMjAsIDExNjM1MzE1MDEpO1xuICAgICAgICBhID0gZ2coYSwgYiwgYywgZCwga1sxM10sIDUsIC0xNDQ0NjgxNDY3KTtcbiAgICAgICAgZCA9IGdnKGQsIGEsIGIsIGMsIGtbMl0sIDksIC01MTQwMzc4NCk7XG4gICAgICAgIGMgPSBnZyhjLCBkLCBhLCBiLCBrWzddLCAxNCwgMTczNTMyODQ3Myk7XG4gICAgICAgIGIgPSBnZyhiLCBjLCBkLCBhLCBrWzEyXSwgMjAsIC0xOTI2NjA3NzM0KTtcblxuICAgICAgICBhID0gaGgoYSwgYiwgYywgZCwga1s1XSwgNCwgLTM3ODU1OCk7XG4gICAgICAgIGQgPSBoaChkLCBhLCBiLCBjLCBrWzhdLCAxMSwgLTIwMjI1NzQ0NjMpO1xuICAgICAgICBjID0gaGgoYywgZCwgYSwgYiwga1sxMV0sIDE2LCAxODM5MDMwNTYyKTtcbiAgICAgICAgYiA9IGhoKGIsIGMsIGQsIGEsIGtbMTRdLCAyMywgLTM1MzA5NTU2KTtcbiAgICAgICAgYSA9IGhoKGEsIGIsIGMsIGQsIGtbMV0sIDQsIC0xNTMwOTkyMDYwKTtcbiAgICAgICAgZCA9IGhoKGQsIGEsIGIsIGMsIGtbNF0sIDExLCAxMjcyODkzMzUzKTtcbiAgICAgICAgYyA9IGhoKGMsIGQsIGEsIGIsIGtbN10sIDE2LCAtMTU1NDk3NjMyKTtcbiAgICAgICAgYiA9IGhoKGIsIGMsIGQsIGEsIGtbMTBdLCAyMywgLTEwOTQ3MzA2NDApO1xuICAgICAgICBhID0gaGgoYSwgYiwgYywgZCwga1sxM10sIDQsIDY4MTI3OTE3NCk7XG4gICAgICAgIGQgPSBoaChkLCBhLCBiLCBjLCBrWzBdLCAxMSwgLTM1ODUzNzIyMik7XG4gICAgICAgIGMgPSBoaChjLCBkLCBhLCBiLCBrWzNdLCAxNiwgLTcyMjUyMTk3OSk7XG4gICAgICAgIGIgPSBoaChiLCBjLCBkLCBhLCBrWzZdLCAyMywgNzYwMjkxODkpO1xuICAgICAgICBhID0gaGgoYSwgYiwgYywgZCwga1s5XSwgNCwgLTY0MDM2NDQ4Nyk7XG4gICAgICAgIGQgPSBoaChkLCBhLCBiLCBjLCBrWzEyXSwgMTEsIC00MjE4MTU4MzUpO1xuICAgICAgICBjID0gaGgoYywgZCwgYSwgYiwga1sxNV0sIDE2LCA1MzA3NDI1MjApO1xuICAgICAgICBiID0gaGgoYiwgYywgZCwgYSwga1syXSwgMjMsIC05OTUzMzg2NTEpO1xuXG4gICAgICAgIGEgPSBpaShhLCBiLCBjLCBkLCBrWzBdLCA2LCAtMTk4NjMwODQ0KTtcbiAgICAgICAgZCA9IGlpKGQsIGEsIGIsIGMsIGtbN10sIDEwLCAxMTI2ODkxNDE1KTtcbiAgICAgICAgYyA9IGlpKGMsIGQsIGEsIGIsIGtbMTRdLCAxNSwgLTE0MTYzNTQ5MDUpO1xuICAgICAgICBiID0gaWkoYiwgYywgZCwgYSwga1s1XSwgMjEsIC01NzQzNDA1NSk7XG4gICAgICAgIGEgPSBpaShhLCBiLCBjLCBkLCBrWzEyXSwgNiwgMTcwMDQ4NTU3MSk7XG4gICAgICAgIGQgPSBpaShkLCBhLCBiLCBjLCBrWzNdLCAxMCwgLTE4OTQ5ODY2MDYpO1xuICAgICAgICBjID0gaWkoYywgZCwgYSwgYiwga1sxMF0sIDE1LCAtMTA1MTUyMyk7XG4gICAgICAgIGIgPSBpaShiLCBjLCBkLCBhLCBrWzFdLCAyMSwgLTIwNTQ5MjI3OTkpO1xuICAgICAgICBhID0gaWkoYSwgYiwgYywgZCwga1s4XSwgNiwgMTg3MzMxMzM1OSk7XG4gICAgICAgIGQgPSBpaShkLCBhLCBiLCBjLCBrWzE1XSwgMTAsIC0zMDYxMTc0NCk7XG4gICAgICAgIGMgPSBpaShjLCBkLCBhLCBiLCBrWzZdLCAxNSwgLTE1NjAxOTgzODApO1xuICAgICAgICBiID0gaWkoYiwgYywgZCwgYSwga1sxM10sIDIxLCAxMzA5MTUxNjQ5KTtcbiAgICAgICAgYSA9IGlpKGEsIGIsIGMsIGQsIGtbNF0sIDYsIC0xNDU1MjMwNzApO1xuICAgICAgICBkID0gaWkoZCwgYSwgYiwgYywga1sxMV0sIDEwLCAtMTEyMDIxMDM3OSk7XG4gICAgICAgIGMgPSBpaShjLCBkLCBhLCBiLCBrWzJdLCAxNSwgNzE4Nzg3MjU5KTtcbiAgICAgICAgYiA9IGlpKGIsIGMsIGQsIGEsIGtbOV0sIDIxLCAtMzQzNDg1NTUxKTtcblxuICAgICAgICB4WzBdID0gYWRkMzIoYSwgeFswXSk7XG4gICAgICAgIHhbMV0gPSBhZGQzMihiLCB4WzFdKTtcbiAgICAgICAgeFsyXSA9IGFkZDMyKGMsIHhbMl0pO1xuICAgICAgICB4WzNdID0gYWRkMzIoZCwgeFszXSk7XG4gICAgfSxcblxuICAgIC8qIHRoZXJlIG5lZWRzIHRvIGJlIHN1cHBvcnQgZm9yIFVuaWNvZGUgaGVyZSxcbiAgICAgICAqIHVubGVzcyB3ZSBwcmV0ZW5kIHRoYXQgd2UgY2FuIHJlZGVmaW5lIHRoZSBNRC01XG4gICAgICAgKiBhbGdvcml0aG0gZm9yIG11bHRpLWJ5dGUgY2hhcmFjdGVycyAocGVyaGFwc1xuICAgICAgICogYnkgYWRkaW5nIGV2ZXJ5IGZvdXIgMTYtYml0IGNoYXJhY3RlcnMgYW5kXG4gICAgICAgKiBzaG9ydGVuaW5nIHRoZSBzdW0gdG8gMzIgYml0cykuIE90aGVyd2lzZVxuICAgICAgICogSSBzdWdnZXN0IHBlcmZvcm1pbmcgTUQtNSBhcyBpZiBldmVyeSBjaGFyYWN0ZXJcbiAgICAgICAqIHdhcyB0d28gYnl0ZXMtLWUuZy4sIDAwNDAgMDAyNSA9IEAlLS1idXQgdGhlblxuICAgICAgICogaG93IHdpbGwgYW4gb3JkaW5hcnkgTUQtNSBzdW0gYmUgbWF0Y2hlZD9cbiAgICAgICAqIFRoZXJlIGlzIG5vIHdheSB0byBzdGFuZGFyZGl6ZSB0ZXh0IHRvIHNvbWV0aGluZ1xuICAgICAgICogbGlrZSBVVEYtOCBiZWZvcmUgdHJhbnNmb3JtYXRpb247IHNwZWVkIGNvc3QgaXNcbiAgICAgICAqIHV0dGVybHkgcHJvaGliaXRpdmUuIFRoZSBKYXZhU2NyaXB0IHN0YW5kYXJkXG4gICAgICAgKiBpdHNlbGYgbmVlZHMgdG8gbG9vayBhdCB0aGlzOiBpdCBzaG91bGQgc3RhcnRcbiAgICAgICAqIHByb3ZpZGluZyBhY2Nlc3MgdG8gc3RyaW5ncyBhcyBwcmVmb3JtZWQgVVRGLThcbiAgICAgICAqIDgtYml0IHVuc2lnbmVkIHZhbHVlIGFycmF5cy5cbiAgICAgICAqL1xuICAgIG1kNWJsayA9IGZ1bmN0aW9uIChzKSB7XG4gICAgICAgIHZhciBtZDVibGtzID0gW10sXG4gICAgICAgICAgICBpOyAvKiBBbmR5IEtpbmcgc2FpZCBkbyBpdCB0aGlzIHdheS4gKi9cblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjQ7IGkgKz0gNCkge1xuICAgICAgICAgICAgbWQ1Ymxrc1tpID4+IDJdID0gcy5jaGFyQ29kZUF0KGkpICsgKHMuY2hhckNvZGVBdChpICsgMSkgPDwgOCkgKyAocy5jaGFyQ29kZUF0KGkgKyAyKSA8PCAxNikgKyAocy5jaGFyQ29kZUF0KGkgKyAzKSA8PCAyNCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1kNWJsa3M7XG4gICAgfSxcblxuICAgIG1kNWJsa19hcnJheSA9IGZ1bmN0aW9uIChhKSB7XG4gICAgICAgIHZhciBtZDVibGtzID0gW10sXG4gICAgICAgICAgICBpOyAvKiBBbmR5IEtpbmcgc2FpZCBkbyBpdCB0aGlzIHdheS4gKi9cblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgNjQ7IGkgKz0gNCkge1xuICAgICAgICAgICAgbWQ1Ymxrc1tpID4+IDJdID0gYVtpXSArIChhW2kgKyAxXSA8PCA4KSArIChhW2kgKyAyXSA8PCAxNikgKyAoYVtpICsgM10gPDwgMjQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZDVibGtzO1xuICAgIH0sXG5cbiAgICBtZDUxID0gZnVuY3Rpb24gKHMpIHtcbiAgICAgICAgdmFyIG4gPSBzLmxlbmd0aCxcbiAgICAgICAgICAgIHN0YXRlID0gWzE3MzI1ODQxOTMsIC0yNzE3MzM4NzksIC0xNzMyNTg0MTk0LCAyNzE3MzM4NzhdLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIGxlbmd0aCxcbiAgICAgICAgICAgIHRhaWwsXG4gICAgICAgICAgICB0bXAsXG4gICAgICAgICAgICBsbyxcbiAgICAgICAgICAgIGhpO1xuXG4gICAgICAgIGZvciAoaSA9IDY0OyBpIDw9IG47IGkgKz0gNjQpIHtcbiAgICAgICAgICAgIG1kNWN5Y2xlKHN0YXRlLCBtZDVibGsocy5zdWJzdHJpbmcoaSAtIDY0LCBpKSkpO1xuICAgICAgICB9XG4gICAgICAgIHMgPSBzLnN1YnN0cmluZyhpIC0gNjQpO1xuICAgICAgICBsZW5ndGggPSBzLmxlbmd0aDtcbiAgICAgICAgdGFpbCA9IFswLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwXTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICB0YWlsW2kgPj4gMl0gfD0gcy5jaGFyQ29kZUF0KGkpIDw8ICgoaSAlIDQpIDw8IDMpO1xuICAgICAgICB9XG4gICAgICAgIHRhaWxbaSA+PiAyXSB8PSAweDgwIDw8ICgoaSAlIDQpIDw8IDMpO1xuICAgICAgICBpZiAoaSA+IDU1KSB7XG4gICAgICAgICAgICBtZDVjeWNsZShzdGF0ZSwgdGFpbCk7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgMTY7IGkgKz0gMSkge1xuICAgICAgICAgICAgICAgIHRhaWxbaV0gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQmV3YXJlIHRoYXQgdGhlIGZpbmFsIGxlbmd0aCBtaWdodCBub3QgZml0IGluIDMyIGJpdHMgc28gd2UgdGFrZSBjYXJlIG9mIHRoYXRcbiAgICAgICAgdG1wID0gbiAqIDg7XG4gICAgICAgIHRtcCA9IHRtcC50b1N0cmluZygxNikubWF0Y2goLyguKj8pKC57MCw4fSkkLyk7XG4gICAgICAgIGxvID0gcGFyc2VJbnQodG1wWzJdLCAxNik7XG4gICAgICAgIGhpID0gcGFyc2VJbnQodG1wWzFdLCAxNikgfHwgMDtcblxuICAgICAgICB0YWlsWzE0XSA9IGxvO1xuICAgICAgICB0YWlsWzE1XSA9IGhpO1xuXG4gICAgICAgIG1kNWN5Y2xlKHN0YXRlLCB0YWlsKTtcbiAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH0sXG5cbiAgICBtZDUxX2FycmF5ID0gZnVuY3Rpb24gKGEpIHtcbiAgICAgICAgdmFyIG4gPSBhLmxlbmd0aCxcbiAgICAgICAgICAgIHN0YXRlID0gWzE3MzI1ODQxOTMsIC0yNzE3MzM4NzksIC0xNzMyNTg0MTk0LCAyNzE3MzM4NzhdLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIGxlbmd0aCxcbiAgICAgICAgICAgIHRhaWwsXG4gICAgICAgICAgICB0bXAsXG4gICAgICAgICAgICBsbyxcbiAgICAgICAgICAgIGhpO1xuXG4gICAgICAgIGZvciAoaSA9IDY0OyBpIDw9IG47IGkgKz0gNjQpIHtcbiAgICAgICAgICAgIG1kNWN5Y2xlKHN0YXRlLCBtZDVibGtfYXJyYXkoYS5zdWJhcnJheShpIC0gNjQsIGkpKSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBOb3Qgc3VyZSBpZiBpdCBpcyBhIGJ1ZywgaG93ZXZlciBJRTEwIHdpbGwgYWx3YXlzIHByb2R1Y2UgYSBzdWIgYXJyYXkgb2YgbGVuZ3RoIDFcbiAgICAgICAgLy8gY29udGFpbmluZyB0aGUgbGFzdCBlbGVtZW50IG9mIHRoZSBwYXJlbnQgYXJyYXkgaWYgdGhlIHN1YiBhcnJheSBzcGVjaWZpZWQgc3RhcnRzXG4gICAgICAgIC8vIGJleW9uZCB0aGUgbGVuZ3RoIG9mIHRoZSBwYXJlbnQgYXJyYXkgLSB3ZWlyZC5cbiAgICAgICAgLy8gaHR0cHM6Ly9jb25uZWN0Lm1pY3Jvc29mdC5jb20vSUUvZmVlZGJhY2svZGV0YWlscy83NzE0NTIvdHlwZWQtYXJyYXktc3ViYXJyYXktaXNzdWVcbiAgICAgICAgYSA9IChpIC0gNjQpIDwgbiA/IGEuc3ViYXJyYXkoaSAtIDY0KSA6IG5ldyBVaW50OEFycmF5KDApO1xuXG4gICAgICAgIGxlbmd0aCA9IGEubGVuZ3RoO1xuICAgICAgICB0YWlsID0gWzAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDBdO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgIHRhaWxbaSA+PiAyXSB8PSBhW2ldIDw8ICgoaSAlIDQpIDw8IDMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGFpbFtpID4+IDJdIHw9IDB4ODAgPDwgKChpICUgNCkgPDwgMyk7XG4gICAgICAgIGlmIChpID4gNTUpIHtcbiAgICAgICAgICAgIG1kNWN5Y2xlKHN0YXRlLCB0YWlsKTtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCAxNjsgaSArPSAxKSB7XG4gICAgICAgICAgICAgICAgdGFpbFtpXSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBCZXdhcmUgdGhhdCB0aGUgZmluYWwgbGVuZ3RoIG1pZ2h0IG5vdCBmaXQgaW4gMzIgYml0cyBzbyB3ZSB0YWtlIGNhcmUgb2YgdGhhdFxuICAgICAgICB0bXAgPSBuICogODtcbiAgICAgICAgdG1wID0gdG1wLnRvU3RyaW5nKDE2KS5tYXRjaCgvKC4qPykoLnswLDh9KSQvKTtcbiAgICAgICAgbG8gPSBwYXJzZUludCh0bXBbMl0sIDE2KTtcbiAgICAgICAgaGkgPSBwYXJzZUludCh0bXBbMV0sIDE2KSB8fCAwO1xuXG4gICAgICAgIHRhaWxbMTRdID0gbG87XG4gICAgICAgIHRhaWxbMTVdID0gaGk7XG5cbiAgICAgICAgbWQ1Y3ljbGUoc3RhdGUsIHRhaWwpO1xuXG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9LFxuXG4gICAgaGV4X2NociA9IFsnMCcsICcxJywgJzInLCAnMycsICc0JywgJzUnLCAnNicsICc3JywgJzgnLCAnOScsICdhJywgJ2InLCAnYycsICdkJywgJ2UnLCAnZiddLFxuXG4gICAgcmhleCA9IGZ1bmN0aW9uIChuKSB7XG4gICAgICAgIHZhciBzID0gJycsXG4gICAgICAgICAgICBqO1xuICAgICAgICBmb3IgKGogPSAwOyBqIDwgNDsgaiArPSAxKSB7XG4gICAgICAgICAgICBzICs9IGhleF9jaHJbKG4gPj4gKGogKiA4ICsgNCkpICYgMHgwRl0gKyBoZXhfY2hyWyhuID4+IChqICogOCkpICYgMHgwRl07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHM7XG4gICAgfSxcblxuICAgIGhleCA9IGZ1bmN0aW9uICh4KSB7XG4gICAgICAgIHZhciBpO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgeC5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgeFtpXSA9IHJoZXgoeFtpXSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHguam9pbignJyk7XG4gICAgfSxcblxuICAgIG1kNSA9IGZ1bmN0aW9uIChzKSB7XG4gICAgICAgIHJldHVybiBoZXgobWQ1MShzKSk7XG4gICAgfSxcblxuXG5cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbiAgICAvKipcbiAgICAgKiBTcGFya01ENSBPT1AgaW1wbGVtZW50YXRpb24uXG4gICAgICpcbiAgICAgKiBVc2UgdGhpcyBjbGFzcyB0byBwZXJmb3JtIGFuIGluY3JlbWVudGFsIG1kNSwgb3RoZXJ3aXNlIHVzZSB0aGVcbiAgICAgKiBzdGF0aWMgbWV0aG9kcyBpbnN0ZWFkLlxuICAgICAqL1xuICAgIFNwYXJrTUQ1ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBjYWxsIHJlc2V0IHRvIGluaXQgdGhlIGluc3RhbmNlXG4gICAgICAgIHRoaXMucmVzZXQoKTtcbiAgICB9O1xuXG5cbiAgICAvLyBJbiBzb21lIGNhc2VzIHRoZSBmYXN0IGFkZDMyIGZ1bmN0aW9uIGNhbm5vdCBiZSB1c2VkLi5cbiAgICBpZiAobWQ1KCdoZWxsbycpICE9PSAnNWQ0MTQwMmFiYzRiMmE3NmI5NzE5ZDkxMTAxN2M1OTInKSB7XG4gICAgICAgIGFkZDMyID0gZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgICAgIHZhciBsc3cgPSAoeCAmIDB4RkZGRikgKyAoeSAmIDB4RkZGRiksXG4gICAgICAgICAgICAgICAgbXN3ID0gKHggPj4gMTYpICsgKHkgPj4gMTYpICsgKGxzdyA+PiAxNik7XG4gICAgICAgICAgICByZXR1cm4gKG1zdyA8PCAxNikgfCAobHN3ICYgMHhGRkZGKTtcbiAgICAgICAgfTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIEFwcGVuZHMgYSBzdHJpbmcuXG4gICAgICogQSBjb252ZXJzaW9uIHdpbGwgYmUgYXBwbGllZCBpZiBhbiB1dGY4IHN0cmluZyBpcyBkZXRlY3RlZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHN0cmluZyB0byBiZSBhcHBlbmRlZFxuICAgICAqXG4gICAgICogQHJldHVybiB7U3BhcmtNRDV9IFRoZSBpbnN0YW5jZSBpdHNlbGZcbiAgICAgKi9cbiAgICBTcGFya01ENS5wcm90b3R5cGUuYXBwZW5kID0gZnVuY3Rpb24gKHN0cikge1xuICAgICAgICAvLyBjb252ZXJ0cyB0aGUgc3RyaW5nIHRvIHV0ZjggYnl0ZXMgaWYgbmVjZXNzYXJ5XG4gICAgICAgIGlmICgvW1xcdTAwODAtXFx1RkZGRl0vLnRlc3Qoc3RyKSkge1xuICAgICAgICAgICAgc3RyID0gdW5lc2NhcGUoZW5jb2RlVVJJQ29tcG9uZW50KHN0cikpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGhlbiBhcHBlbmQgYXMgYmluYXJ5XG4gICAgICAgIHRoaXMuYXBwZW5kQmluYXJ5KHN0cik7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEFwcGVuZHMgYSBiaW5hcnkgc3RyaW5nLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNvbnRlbnRzIFRoZSBiaW5hcnkgc3RyaW5nIHRvIGJlIGFwcGVuZGVkXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtTcGFya01ENX0gVGhlIGluc3RhbmNlIGl0c2VsZlxuICAgICAqL1xuICAgIFNwYXJrTUQ1LnByb3RvdHlwZS5hcHBlbmRCaW5hcnkgPSBmdW5jdGlvbiAoY29udGVudHMpIHtcbiAgICAgICAgdGhpcy5fYnVmZiArPSBjb250ZW50cztcbiAgICAgICAgdGhpcy5fbGVuZ3RoICs9IGNvbnRlbnRzLmxlbmd0aDtcblxuICAgICAgICB2YXIgbGVuZ3RoID0gdGhpcy5fYnVmZi5sZW5ndGgsXG4gICAgICAgICAgICBpO1xuXG4gICAgICAgIGZvciAoaSA9IDY0OyBpIDw9IGxlbmd0aDsgaSArPSA2NCkge1xuICAgICAgICAgICAgbWQ1Y3ljbGUodGhpcy5fc3RhdGUsIG1kNWJsayh0aGlzLl9idWZmLnN1YnN0cmluZyhpIC0gNjQsIGkpKSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9idWZmID0gdGhpcy5fYnVmZi5zdWJzdHIoaSAtIDY0KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRmluaXNoZXMgdGhlIGluY3JlbWVudGFsIGNvbXB1dGF0aW9uLCByZXNldGluZyB0aGUgaW50ZXJuYWwgc3RhdGUgYW5kXG4gICAgICogcmV0dXJuaW5nIHRoZSByZXN1bHQuXG4gICAgICogVXNlIHRoZSByYXcgcGFyYW1ldGVyIHRvIG9idGFpbiB0aGUgcmF3IHJlc3VsdCBpbnN0ZWFkIG9mIHRoZSBoZXggb25lLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtCb29sZWFufSByYXcgVHJ1ZSB0byBnZXQgdGhlIHJhdyByZXN1bHQsIGZhbHNlIHRvIGdldCB0aGUgaGV4IHJlc3VsdFxuICAgICAqXG4gICAgICogQHJldHVybiB7U3RyaW5nfEFycmF5fSBUaGUgcmVzdWx0XG4gICAgICovXG4gICAgU3BhcmtNRDUucHJvdG90eXBlLmVuZCA9IGZ1bmN0aW9uIChyYXcpIHtcbiAgICAgICAgdmFyIGJ1ZmYgPSB0aGlzLl9idWZmLFxuICAgICAgICAgICAgbGVuZ3RoID0gYnVmZi5sZW5ndGgsXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgdGFpbCA9IFswLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwXSxcbiAgICAgICAgICAgIHJldDtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgIHRhaWxbaSA+PiAyXSB8PSBidWZmLmNoYXJDb2RlQXQoaSkgPDwgKChpICUgNCkgPDwgMyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9maW5pc2godGFpbCwgbGVuZ3RoKTtcbiAgICAgICAgcmV0ID0gISFyYXcgPyB0aGlzLl9zdGF0ZSA6IGhleCh0aGlzLl9zdGF0ZSk7XG5cbiAgICAgICAgdGhpcy5yZXNldCgpO1xuXG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEZpbmlzaCB0aGUgZmluYWwgY2FsY3VsYXRpb24gYmFzZWQgb24gdGhlIHRhaWwuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0FycmF5fSAgdGFpbCAgIFRoZSB0YWlsICh3aWxsIGJlIG1vZGlmaWVkKVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsZW5ndGggVGhlIGxlbmd0aCBvZiB0aGUgcmVtYWluaW5nIGJ1ZmZlclxuICAgICAqL1xuICAgIFNwYXJrTUQ1LnByb3RvdHlwZS5fZmluaXNoID0gZnVuY3Rpb24gKHRhaWwsIGxlbmd0aCkge1xuICAgICAgICB2YXIgaSA9IGxlbmd0aCxcbiAgICAgICAgICAgIHRtcCxcbiAgICAgICAgICAgIGxvLFxuICAgICAgICAgICAgaGk7XG5cbiAgICAgICAgdGFpbFtpID4+IDJdIHw9IDB4ODAgPDwgKChpICUgNCkgPDwgMyk7XG4gICAgICAgIGlmIChpID4gNTUpIHtcbiAgICAgICAgICAgIG1kNWN5Y2xlKHRoaXMuX3N0YXRlLCB0YWlsKTtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCAxNjsgaSArPSAxKSB7XG4gICAgICAgICAgICAgICAgdGFpbFtpXSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEbyB0aGUgZmluYWwgY29tcHV0YXRpb24gYmFzZWQgb24gdGhlIHRhaWwgYW5kIGxlbmd0aFxuICAgICAgICAvLyBCZXdhcmUgdGhhdCB0aGUgZmluYWwgbGVuZ3RoIG1heSBub3QgZml0IGluIDMyIGJpdHMgc28gd2UgdGFrZSBjYXJlIG9mIHRoYXRcbiAgICAgICAgdG1wID0gdGhpcy5fbGVuZ3RoICogODtcbiAgICAgICAgdG1wID0gdG1wLnRvU3RyaW5nKDE2KS5tYXRjaCgvKC4qPykoLnswLDh9KSQvKTtcbiAgICAgICAgbG8gPSBwYXJzZUludCh0bXBbMl0sIDE2KTtcbiAgICAgICAgaGkgPSBwYXJzZUludCh0bXBbMV0sIDE2KSB8fCAwO1xuXG4gICAgICAgIHRhaWxbMTRdID0gbG87XG4gICAgICAgIHRhaWxbMTVdID0gaGk7XG4gICAgICAgIG1kNWN5Y2xlKHRoaXMuX3N0YXRlLCB0YWlsKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmVzZXRzIHRoZSBpbnRlcm5hbCBzdGF0ZSBvZiB0aGUgY29tcHV0YXRpb24uXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtTcGFya01ENX0gVGhlIGluc3RhbmNlIGl0c2VsZlxuICAgICAqL1xuICAgIFNwYXJrTUQ1LnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5fYnVmZiA9IFwiXCI7XG4gICAgICAgIHRoaXMuX2xlbmd0aCA9IDA7XG4gICAgICAgIHRoaXMuX3N0YXRlID0gWzE3MzI1ODQxOTMsIC0yNzE3MzM4NzksIC0xNzMyNTg0MTk0LCAyNzE3MzM4NzhdO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBSZWxlYXNlcyBtZW1vcnkgdXNlZCBieSB0aGUgaW5jcmVtZW50YWwgYnVmZmVyIGFuZCBvdGhlciBhZGl0aW9uYWxcbiAgICAgKiByZXNvdXJjZXMuIElmIHlvdSBwbGFuIHRvIHVzZSB0aGUgaW5zdGFuY2UgYWdhaW4sIHVzZSByZXNldCBpbnN0ZWFkLlxuICAgICAqL1xuICAgIFNwYXJrTUQ1LnByb3RvdHlwZS5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBkZWxldGUgdGhpcy5fc3RhdGU7XG4gICAgICAgIGRlbGV0ZSB0aGlzLl9idWZmO1xuICAgICAgICBkZWxldGUgdGhpcy5fbGVuZ3RoO1xuICAgIH07XG5cblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIHRoZSBtZDUgaGFzaCBvbiBhIHN0cmluZy5cbiAgICAgKiBBIGNvbnZlcnNpb24gd2lsbCBiZSBhcHBsaWVkIGlmIHV0Zjggc3RyaW5nIGlzIGRldGVjdGVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9ICBzdHIgVGhlIHN0cmluZ1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gcmF3IFRydWUgdG8gZ2V0IHRoZSByYXcgcmVzdWx0LCBmYWxzZSB0byBnZXQgdGhlIGhleCByZXN1bHRcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ3xBcnJheX0gVGhlIHJlc3VsdFxuICAgICAqL1xuICAgIFNwYXJrTUQ1Lmhhc2ggPSBmdW5jdGlvbiAoc3RyLCByYXcpIHtcbiAgICAgICAgLy8gY29udmVydHMgdGhlIHN0cmluZyB0byB1dGY4IGJ5dGVzIGlmIG5lY2Vzc2FyeVxuICAgICAgICBpZiAoL1tcXHUwMDgwLVxcdUZGRkZdLy50ZXN0KHN0cikpIHtcbiAgICAgICAgICAgIHN0ciA9IHVuZXNjYXBlKGVuY29kZVVSSUNvbXBvbmVudChzdHIpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBoYXNoID0gbWQ1MShzdHIpO1xuXG4gICAgICAgIHJldHVybiAhIXJhdyA/IGhhc2ggOiBoZXgoaGFzaCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIHRoZSBtZDUgaGFzaCBvbiBhIGJpbmFyeSBzdHJpbmcuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gIGNvbnRlbnQgVGhlIGJpbmFyeSBzdHJpbmdcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHJhdyAgICAgVHJ1ZSB0byBnZXQgdGhlIHJhdyByZXN1bHQsIGZhbHNlIHRvIGdldCB0aGUgaGV4IHJlc3VsdFxuICAgICAqXG4gICAgICogQHJldHVybiB7U3RyaW5nfEFycmF5fSBUaGUgcmVzdWx0XG4gICAgICovXG4gICAgU3BhcmtNRDUuaGFzaEJpbmFyeSA9IGZ1bmN0aW9uIChjb250ZW50LCByYXcpIHtcbiAgICAgICAgdmFyIGhhc2ggPSBtZDUxKGNvbnRlbnQpO1xuXG4gICAgICAgIHJldHVybiAhIXJhdyA/IGhhc2ggOiBoZXgoaGFzaCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFNwYXJrTUQ1IE9PUCBpbXBsZW1lbnRhdGlvbiBmb3IgYXJyYXkgYnVmZmVycy5cbiAgICAgKlxuICAgICAqIFVzZSB0aGlzIGNsYXNzIHRvIHBlcmZvcm0gYW4gaW5jcmVtZW50YWwgbWQ1IE9OTFkgZm9yIGFycmF5IGJ1ZmZlcnMuXG4gICAgICovXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIGNhbGwgcmVzZXQgdG8gaW5pdCB0aGUgaW5zdGFuY2VcbiAgICAgICAgdGhpcy5yZXNldCgpO1xuICAgIH07XG5cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbiAgICAvKipcbiAgICAgKiBBcHBlbmRzIGFuIGFycmF5IGJ1ZmZlci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXJyYXlCdWZmZXJ9IGFyciBUaGUgYXJyYXkgdG8gYmUgYXBwZW5kZWRcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1NwYXJrTUQ1LkFycmF5QnVmZmVyfSBUaGUgaW5zdGFuY2UgaXRzZWxmXG4gICAgICovXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIucHJvdG90eXBlLmFwcGVuZCA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgICAgICAgLy8gVE9ETzogd2UgY291bGQgYXZvaWQgdGhlIGNvbmNhdGVuYXRpb24gaGVyZSBidXQgdGhlIGFsZ29yaXRobSB3b3VsZCBiZSBtb3JlIGNvbXBsZXhcbiAgICAgICAgLy8gICAgICAgaWYgeW91IGZpbmQgeW91cnNlbGYgbmVlZGluZyBleHRyYSBwZXJmb3JtYW5jZSwgcGxlYXNlIG1ha2UgYSBQUi5cbiAgICAgICAgdmFyIGJ1ZmYgPSB0aGlzLl9jb25jYXRBcnJheUJ1ZmZlcih0aGlzLl9idWZmLCBhcnIpLFxuICAgICAgICAgICAgbGVuZ3RoID0gYnVmZi5sZW5ndGgsXG4gICAgICAgICAgICBpO1xuXG4gICAgICAgIHRoaXMuX2xlbmd0aCArPSBhcnIuYnl0ZUxlbmd0aDtcblxuICAgICAgICBmb3IgKGkgPSA2NDsgaSA8PSBsZW5ndGg7IGkgKz0gNjQpIHtcbiAgICAgICAgICAgIG1kNWN5Y2xlKHRoaXMuX3N0YXRlLCBtZDVibGtfYXJyYXkoYnVmZi5zdWJhcnJheShpIC0gNjQsIGkpKSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBdm9pZHMgSUUxMCB3ZWlyZG5lc3MgKGRvY3VtZW50ZWQgYWJvdmUpXG4gICAgICAgIHRoaXMuX2J1ZmYgPSAoaSAtIDY0KSA8IGxlbmd0aCA/IGJ1ZmYuc3ViYXJyYXkoaSAtIDY0KSA6IG5ldyBVaW50OEFycmF5KDApO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBGaW5pc2hlcyB0aGUgaW5jcmVtZW50YWwgY29tcHV0YXRpb24sIHJlc2V0aW5nIHRoZSBpbnRlcm5hbCBzdGF0ZSBhbmRcbiAgICAgKiByZXR1cm5pbmcgdGhlIHJlc3VsdC5cbiAgICAgKiBVc2UgdGhlIHJhdyBwYXJhbWV0ZXIgdG8gb2J0YWluIHRoZSByYXcgcmVzdWx0IGluc3RlYWQgb2YgdGhlIGhleCBvbmUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHJhdyBUcnVlIHRvIGdldCB0aGUgcmF3IHJlc3VsdCwgZmFsc2UgdG8gZ2V0IHRoZSBoZXggcmVzdWx0XG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd8QXJyYXl9IFRoZSByZXN1bHRcbiAgICAgKi9cbiAgICBTcGFya01ENS5BcnJheUJ1ZmZlci5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24gKHJhdykge1xuICAgICAgICB2YXIgYnVmZiA9IHRoaXMuX2J1ZmYsXG4gICAgICAgICAgICBsZW5ndGggPSBidWZmLmxlbmd0aCxcbiAgICAgICAgICAgIHRhaWwgPSBbMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMCwgMF0sXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgcmV0O1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgdGFpbFtpID4+IDJdIHw9IGJ1ZmZbaV0gPDwgKChpICUgNCkgPDwgMyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9maW5pc2godGFpbCwgbGVuZ3RoKTtcbiAgICAgICAgcmV0ID0gISFyYXcgPyB0aGlzLl9zdGF0ZSA6IGhleCh0aGlzLl9zdGF0ZSk7XG5cbiAgICAgICAgdGhpcy5yZXNldCgpO1xuXG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgfTtcblxuICAgIFNwYXJrTUQ1LkFycmF5QnVmZmVyLnByb3RvdHlwZS5fZmluaXNoID0gU3BhcmtNRDUucHJvdG90eXBlLl9maW5pc2g7XG5cbiAgICAvKipcbiAgICAgKiBSZXNldHMgdGhlIGludGVybmFsIHN0YXRlIG9mIHRoZSBjb21wdXRhdGlvbi5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1NwYXJrTUQ1LkFycmF5QnVmZmVyfSBUaGUgaW5zdGFuY2UgaXRzZWxmXG4gICAgICovXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIucHJvdG90eXBlLnJlc2V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLl9idWZmID0gbmV3IFVpbnQ4QXJyYXkoMCk7XG4gICAgICAgIHRoaXMuX2xlbmd0aCA9IDA7XG4gICAgICAgIHRoaXMuX3N0YXRlID0gWzE3MzI1ODQxOTMsIC0yNzE3MzM4NzksIC0xNzMyNTg0MTk0LCAyNzE3MzM4NzhdO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBSZWxlYXNlcyBtZW1vcnkgdXNlZCBieSB0aGUgaW5jcmVtZW50YWwgYnVmZmVyIGFuZCBvdGhlciBhZGl0aW9uYWxcbiAgICAgKiByZXNvdXJjZXMuIElmIHlvdSBwbGFuIHRvIHVzZSB0aGUgaW5zdGFuY2UgYWdhaW4sIHVzZSByZXNldCBpbnN0ZWFkLlxuICAgICAqL1xuICAgIFNwYXJrTUQ1LkFycmF5QnVmZmVyLnByb3RvdHlwZS5kZXN0cm95ID0gU3BhcmtNRDUucHJvdG90eXBlLmRlc3Ryb3k7XG5cbiAgICAvKipcbiAgICAgKiBDb25jYXRzIHR3byBhcnJheSBidWZmZXJzLCByZXR1cm5pbmcgYSBuZXcgb25lLlxuICAgICAqXG4gICAgICogQHBhcmFtICB7QXJyYXlCdWZmZXJ9IGZpcnN0ICBUaGUgZmlyc3QgYXJyYXkgYnVmZmVyXG4gICAgICogQHBhcmFtICB7QXJyYXlCdWZmZXJ9IHNlY29uZCBUaGUgc2Vjb25kIGFycmF5IGJ1ZmZlclxuICAgICAqXG4gICAgICogQHJldHVybiB7QXJyYXlCdWZmZXJ9IFRoZSBuZXcgYXJyYXkgYnVmZmVyXG4gICAgICovXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIucHJvdG90eXBlLl9jb25jYXRBcnJheUJ1ZmZlciA9IGZ1bmN0aW9uIChmaXJzdCwgc2Vjb25kKSB7XG4gICAgICAgIHZhciBmaXJzdExlbmd0aCA9IGZpcnN0Lmxlbmd0aCxcbiAgICAgICAgICAgIHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KGZpcnN0TGVuZ3RoICsgc2Vjb25kLmJ5dGVMZW5ndGgpO1xuXG4gICAgICAgIHJlc3VsdC5zZXQoZmlyc3QpO1xuICAgICAgICByZXN1bHQuc2V0KG5ldyBVaW50OEFycmF5KHNlY29uZCksIGZpcnN0TGVuZ3RoKTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyB0aGUgbWQ1IGhhc2ggb24gYW4gYXJyYXkgYnVmZmVyLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtBcnJheUJ1ZmZlcn0gYXJyIFRoZSBhcnJheSBidWZmZXJcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59ICAgICByYXcgVHJ1ZSB0byBnZXQgdGhlIHJhdyByZXN1bHQsIGZhbHNlIHRvIGdldCB0aGUgaGV4IHJlc3VsdFxuICAgICAqXG4gICAgICogQHJldHVybiB7U3RyaW5nfEFycmF5fSBUaGUgcmVzdWx0XG4gICAgICovXG4gICAgU3BhcmtNRDUuQXJyYXlCdWZmZXIuaGFzaCA9IGZ1bmN0aW9uIChhcnIsIHJhdykge1xuICAgICAgICB2YXIgaGFzaCA9IG1kNTFfYXJyYXkobmV3IFVpbnQ4QXJyYXkoYXJyKSk7XG5cbiAgICAgICAgcmV0dXJuICEhcmF3ID8gaGFzaCA6IGhleChoYXNoKTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIFNwYXJrTUQ1O1xufSkpO1xuIiwidmFyIHRyYXZlcnNlID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG4gICAgcmV0dXJuIG5ldyBUcmF2ZXJzZShvYmopO1xufTtcblxuZnVuY3Rpb24gVHJhdmVyc2UgKG9iaikge1xuICAgIHRoaXMudmFsdWUgPSBvYmo7XG59XG5cblRyYXZlcnNlLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAocHMpIHtcbiAgICB2YXIgbm9kZSA9IHRoaXMudmFsdWU7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwcy5sZW5ndGg7IGkgKyspIHtcbiAgICAgICAgdmFyIGtleSA9IHBzW2ldO1xuICAgICAgICBpZiAoIW5vZGUgfHwgIWhhc093blByb3BlcnR5LmNhbGwobm9kZSwga2V5KSkge1xuICAgICAgICAgICAgbm9kZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIG5vZGUgPSBub2RlW2tleV07XG4gICAgfVxuICAgIHJldHVybiBub2RlO1xufTtcblxuVHJhdmVyc2UucHJvdG90eXBlLmhhcyA9IGZ1bmN0aW9uIChwcykge1xuICAgIHZhciBub2RlID0gdGhpcy52YWx1ZTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBzLmxlbmd0aDsgaSArKykge1xuICAgICAgICB2YXIga2V5ID0gcHNbaV07XG4gICAgICAgIGlmICghbm9kZSB8fCAhaGFzT3duUHJvcGVydHkuY2FsbChub2RlLCBrZXkpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgbm9kZSA9IG5vZGVba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59O1xuXG5UcmF2ZXJzZS5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKHBzLCB2YWx1ZSkge1xuICAgIHZhciBub2RlID0gdGhpcy52YWx1ZTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBzLmxlbmd0aCAtIDE7IGkgKyspIHtcbiAgICAgICAgdmFyIGtleSA9IHBzW2ldO1xuICAgICAgICBpZiAoIWhhc093blByb3BlcnR5LmNhbGwobm9kZSwga2V5KSkgbm9kZVtrZXldID0ge307XG4gICAgICAgIG5vZGUgPSBub2RlW2tleV07XG4gICAgfVxuICAgIG5vZGVbcHNbaV1dID0gdmFsdWU7XG4gICAgcmV0dXJuIHZhbHVlO1xufTtcblxuVHJhdmVyc2UucHJvdG90eXBlLm1hcCA9IGZ1bmN0aW9uIChjYikge1xuICAgIHJldHVybiB3YWxrKHRoaXMudmFsdWUsIGNiLCB0cnVlKTtcbn07XG5cblRyYXZlcnNlLnByb3RvdHlwZS5mb3JFYWNoID0gZnVuY3Rpb24gKGNiKSB7XG4gICAgdGhpcy52YWx1ZSA9IHdhbGsodGhpcy52YWx1ZSwgY2IsIGZhbHNlKTtcbiAgICByZXR1cm4gdGhpcy52YWx1ZTtcbn07XG5cblRyYXZlcnNlLnByb3RvdHlwZS5yZWR1Y2UgPSBmdW5jdGlvbiAoY2IsIGluaXQpIHtcbiAgICB2YXIgc2tpcCA9IGFyZ3VtZW50cy5sZW5ndGggPT09IDE7XG4gICAgdmFyIGFjYyA9IHNraXAgPyB0aGlzLnZhbHVlIDogaW5pdDtcbiAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKHgpIHtcbiAgICAgICAgaWYgKCF0aGlzLmlzUm9vdCB8fCAhc2tpcCkge1xuICAgICAgICAgICAgYWNjID0gY2IuY2FsbCh0aGlzLCBhY2MsIHgpO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIGFjYztcbn07XG5cblRyYXZlcnNlLnByb3RvdHlwZS5wYXRocyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgYWNjID0gW107XG4gICAgdGhpcy5mb3JFYWNoKGZ1bmN0aW9uICh4KSB7XG4gICAgICAgIGFjYy5wdXNoKHRoaXMucGF0aCk7IFxuICAgIH0pO1xuICAgIHJldHVybiBhY2M7XG59O1xuXG5UcmF2ZXJzZS5wcm90b3R5cGUubm9kZXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGFjYyA9IFtdO1xuICAgIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAoeCkge1xuICAgICAgICBhY2MucHVzaCh0aGlzLm5vZGUpO1xuICAgIH0pO1xuICAgIHJldHVybiBhY2M7XG59O1xuXG5UcmF2ZXJzZS5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHBhcmVudHMgPSBbXSwgbm9kZXMgPSBbXTtcbiAgICBcbiAgICByZXR1cm4gKGZ1bmN0aW9uIGNsb25lIChzcmMpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJlbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAocGFyZW50c1tpXSA9PT0gc3JjKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5vZGVzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAodHlwZW9mIHNyYyA9PT0gJ29iamVjdCcgJiYgc3JjICE9PSBudWxsKSB7XG4gICAgICAgICAgICB2YXIgZHN0ID0gY29weShzcmMpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBwYXJlbnRzLnB1c2goc3JjKTtcbiAgICAgICAgICAgIG5vZGVzLnB1c2goZHN0KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZm9yRWFjaChvYmplY3RLZXlzKHNyYyksIGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgICAgICAgICAgICBkc3Rba2V5XSA9IGNsb25lKHNyY1trZXldKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBwYXJlbnRzLnBvcCgpO1xuICAgICAgICAgICAgbm9kZXMucG9wKCk7XG4gICAgICAgICAgICByZXR1cm4gZHN0O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHNyYztcbiAgICAgICAgfVxuICAgIH0pKHRoaXMudmFsdWUpO1xufTtcblxuZnVuY3Rpb24gd2FsayAocm9vdCwgY2IsIGltbXV0YWJsZSkge1xuICAgIHZhciBwYXRoID0gW107XG4gICAgdmFyIHBhcmVudHMgPSBbXTtcbiAgICB2YXIgYWxpdmUgPSB0cnVlO1xuICAgIFxuICAgIHJldHVybiAoZnVuY3Rpb24gd2Fsa2VyIChub2RlXykge1xuICAgICAgICB2YXIgbm9kZSA9IGltbXV0YWJsZSA/IGNvcHkobm9kZV8pIDogbm9kZV87XG4gICAgICAgIHZhciBtb2RpZmllcnMgPSB7fTtcbiAgICAgICAgXG4gICAgICAgIHZhciBrZWVwR29pbmcgPSB0cnVlO1xuICAgICAgICBcbiAgICAgICAgdmFyIHN0YXRlID0ge1xuICAgICAgICAgICAgbm9kZSA6IG5vZGUsXG4gICAgICAgICAgICBub2RlXyA6IG5vZGVfLFxuICAgICAgICAgICAgcGF0aCA6IFtdLmNvbmNhdChwYXRoKSxcbiAgICAgICAgICAgIHBhcmVudCA6IHBhcmVudHNbcGFyZW50cy5sZW5ndGggLSAxXSxcbiAgICAgICAgICAgIHBhcmVudHMgOiBwYXJlbnRzLFxuICAgICAgICAgICAga2V5IDogcGF0aC5zbGljZSgtMSlbMF0sXG4gICAgICAgICAgICBpc1Jvb3QgOiBwYXRoLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgIGxldmVsIDogcGF0aC5sZW5ndGgsXG4gICAgICAgICAgICBjaXJjdWxhciA6IG51bGwsXG4gICAgICAgICAgICB1cGRhdGUgOiBmdW5jdGlvbiAoeCwgc3RvcEhlcmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLmlzUm9vdCkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5wYXJlbnQubm9kZVtzdGF0ZS5rZXldID0geDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc3RhdGUubm9kZSA9IHg7XG4gICAgICAgICAgICAgICAgaWYgKHN0b3BIZXJlKSBrZWVwR29pbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnZGVsZXRlJyA6IGZ1bmN0aW9uIChzdG9wSGVyZSkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBzdGF0ZS5wYXJlbnQubm9kZVtzdGF0ZS5rZXldO1xuICAgICAgICAgICAgICAgIGlmIChzdG9wSGVyZSkga2VlcEdvaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcmVtb3ZlIDogZnVuY3Rpb24gKHN0b3BIZXJlKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzQXJyYXkoc3RhdGUucGFyZW50Lm5vZGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLnBhcmVudC5ub2RlLnNwbGljZShzdGF0ZS5rZXksIDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHN0YXRlLnBhcmVudC5ub2RlW3N0YXRlLmtleV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChzdG9wSGVyZSkga2VlcEdvaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAga2V5cyA6IG51bGwsXG4gICAgICAgICAgICBiZWZvcmUgOiBmdW5jdGlvbiAoZikgeyBtb2RpZmllcnMuYmVmb3JlID0gZiB9LFxuICAgICAgICAgICAgYWZ0ZXIgOiBmdW5jdGlvbiAoZikgeyBtb2RpZmllcnMuYWZ0ZXIgPSBmIH0sXG4gICAgICAgICAgICBwcmUgOiBmdW5jdGlvbiAoZikgeyBtb2RpZmllcnMucHJlID0gZiB9LFxuICAgICAgICAgICAgcG9zdCA6IGZ1bmN0aW9uIChmKSB7IG1vZGlmaWVycy5wb3N0ID0gZiB9LFxuICAgICAgICAgICAgc3RvcCA6IGZ1bmN0aW9uICgpIHsgYWxpdmUgPSBmYWxzZSB9LFxuICAgICAgICAgICAgYmxvY2sgOiBmdW5jdGlvbiAoKSB7IGtlZXBHb2luZyA9IGZhbHNlIH1cbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIGlmICghYWxpdmUpIHJldHVybiBzdGF0ZTtcbiAgICAgICAgXG4gICAgICAgIGZ1bmN0aW9uIHVwZGF0ZVN0YXRlKCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzdGF0ZS5ub2RlID09PSAnb2JqZWN0JyAmJiBzdGF0ZS5ub2RlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS5rZXlzIHx8IHN0YXRlLm5vZGVfICE9PSBzdGF0ZS5ub2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmtleXMgPSBvYmplY3RLZXlzKHN0YXRlLm5vZGUpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHN0YXRlLmlzTGVhZiA9IHN0YXRlLmtleXMubGVuZ3RoID09IDA7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJlbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwYXJlbnRzW2ldLm5vZGVfID09PSBub2RlXykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuY2lyY3VsYXIgPSBwYXJlbnRzW2ldO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5pc0xlYWYgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHN0YXRlLmtleXMgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBzdGF0ZS5ub3RMZWFmID0gIXN0YXRlLmlzTGVhZjtcbiAgICAgICAgICAgIHN0YXRlLm5vdFJvb3QgPSAhc3RhdGUuaXNSb290O1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB1cGRhdGVTdGF0ZSgpO1xuICAgICAgICBcbiAgICAgICAgLy8gdXNlIHJldHVybiB2YWx1ZXMgdG8gdXBkYXRlIGlmIGRlZmluZWRcbiAgICAgICAgdmFyIHJldCA9IGNiLmNhbGwoc3RhdGUsIHN0YXRlLm5vZGUpO1xuICAgICAgICBpZiAocmV0ICE9PSB1bmRlZmluZWQgJiYgc3RhdGUudXBkYXRlKSBzdGF0ZS51cGRhdGUocmV0KTtcbiAgICAgICAgXG4gICAgICAgIGlmIChtb2RpZmllcnMuYmVmb3JlKSBtb2RpZmllcnMuYmVmb3JlLmNhbGwoc3RhdGUsIHN0YXRlLm5vZGUpO1xuICAgICAgICBcbiAgICAgICAgaWYgKCFrZWVwR29pbmcpIHJldHVybiBzdGF0ZTtcbiAgICAgICAgXG4gICAgICAgIGlmICh0eXBlb2Ygc3RhdGUubm9kZSA9PSAnb2JqZWN0J1xuICAgICAgICAmJiBzdGF0ZS5ub2RlICE9PSBudWxsICYmICFzdGF0ZS5jaXJjdWxhcikge1xuICAgICAgICAgICAgcGFyZW50cy5wdXNoKHN0YXRlKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgdXBkYXRlU3RhdGUoKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgZm9yRWFjaChzdGF0ZS5rZXlzLCBmdW5jdGlvbiAoa2V5LCBpKSB7XG4gICAgICAgICAgICAgICAgcGF0aC5wdXNoKGtleSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1vZGlmaWVycy5wcmUpIG1vZGlmaWVycy5wcmUuY2FsbChzdGF0ZSwgc3RhdGUubm9kZVtrZXldLCBrZXkpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHZhciBjaGlsZCA9IHdhbGtlcihzdGF0ZS5ub2RlW2tleV0pO1xuICAgICAgICAgICAgICAgIGlmIChpbW11dGFibGUgJiYgaGFzT3duUHJvcGVydHkuY2FsbChzdGF0ZS5ub2RlLCBrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLm5vZGVba2V5XSA9IGNoaWxkLm5vZGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGNoaWxkLmlzTGFzdCA9IGkgPT0gc3RhdGUua2V5cy5sZW5ndGggLSAxO1xuICAgICAgICAgICAgICAgIGNoaWxkLmlzRmlyc3QgPSBpID09IDA7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKG1vZGlmaWVycy5wb3N0KSBtb2RpZmllcnMucG9zdC5jYWxsKHN0YXRlLCBjaGlsZCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgcGF0aC5wb3AoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcGFyZW50cy5wb3AoKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKG1vZGlmaWVycy5hZnRlcikgbW9kaWZpZXJzLmFmdGVyLmNhbGwoc3RhdGUsIHN0YXRlLm5vZGUpO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH0pKHJvb3QpLm5vZGU7XG59XG5cbmZ1bmN0aW9uIGNvcHkgKHNyYykge1xuICAgIGlmICh0eXBlb2Ygc3JjID09PSAnb2JqZWN0JyAmJiBzcmMgIT09IG51bGwpIHtcbiAgICAgICAgdmFyIGRzdDtcbiAgICAgICAgXG4gICAgICAgIGlmIChpc0FycmF5KHNyYykpIHtcbiAgICAgICAgICAgIGRzdCA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGlzRGF0ZShzcmMpKSB7XG4gICAgICAgICAgICBkc3QgPSBuZXcgRGF0ZShzcmMuZ2V0VGltZSA/IHNyYy5nZXRUaW1lKCkgOiBzcmMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGlzUmVnRXhwKHNyYykpIHtcbiAgICAgICAgICAgIGRzdCA9IG5ldyBSZWdFeHAoc3JjKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc0Vycm9yKHNyYykpIHtcbiAgICAgICAgICAgIGRzdCA9IHsgbWVzc2FnZTogc3JjLm1lc3NhZ2UgfTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc0Jvb2xlYW4oc3JjKSkge1xuICAgICAgICAgICAgZHN0ID0gbmV3IEJvb2xlYW4oc3JjKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc051bWJlcihzcmMpKSB7XG4gICAgICAgICAgICBkc3QgPSBuZXcgTnVtYmVyKHNyYyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXNTdHJpbmcoc3JjKSkge1xuICAgICAgICAgICAgZHN0ID0gbmV3IFN0cmluZyhzcmMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKE9iamVjdC5jcmVhdGUgJiYgT2JqZWN0LmdldFByb3RvdHlwZU9mKSB7XG4gICAgICAgICAgICBkc3QgPSBPYmplY3QuY3JlYXRlKE9iamVjdC5nZXRQcm90b3R5cGVPZihzcmMpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzcmMuY29uc3RydWN0b3IgPT09IE9iamVjdCkge1xuICAgICAgICAgICAgZHN0ID0ge307XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgcHJvdG8gPVxuICAgICAgICAgICAgICAgIChzcmMuY29uc3RydWN0b3IgJiYgc3JjLmNvbnN0cnVjdG9yLnByb3RvdHlwZSlcbiAgICAgICAgICAgICAgICB8fCBzcmMuX19wcm90b19fXG4gICAgICAgICAgICAgICAgfHwge31cbiAgICAgICAgICAgIDtcbiAgICAgICAgICAgIHZhciBUID0gZnVuY3Rpb24gKCkge307XG4gICAgICAgICAgICBULnByb3RvdHlwZSA9IHByb3RvO1xuICAgICAgICAgICAgZHN0ID0gbmV3IFQ7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGZvckVhY2gob2JqZWN0S2V5cyhzcmMpLCBmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgICAgICBkc3Rba2V5XSA9IHNyY1trZXldO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGRzdDtcbiAgICB9XG4gICAgZWxzZSByZXR1cm4gc3JjO1xufVxuXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIGtleXMgKG9iaikge1xuICAgIHZhciByZXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSByZXMucHVzaChrZXkpXG4gICAgcmV0dXJuIHJlcztcbn07XG5cbmZ1bmN0aW9uIHRvUyAob2JqKSB7IHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqKSB9XG5mdW5jdGlvbiBpc0RhdGUgKG9iaikgeyByZXR1cm4gdG9TKG9iaikgPT09ICdbb2JqZWN0IERhdGVdJyB9XG5mdW5jdGlvbiBpc1JlZ0V4cCAob2JqKSB7IHJldHVybiB0b1Mob2JqKSA9PT0gJ1tvYmplY3QgUmVnRXhwXScgfVxuZnVuY3Rpb24gaXNFcnJvciAob2JqKSB7IHJldHVybiB0b1Mob2JqKSA9PT0gJ1tvYmplY3QgRXJyb3JdJyB9XG5mdW5jdGlvbiBpc0Jvb2xlYW4gKG9iaikgeyByZXR1cm4gdG9TKG9iaikgPT09ICdbb2JqZWN0IEJvb2xlYW5dJyB9XG5mdW5jdGlvbiBpc051bWJlciAob2JqKSB7IHJldHVybiB0b1Mob2JqKSA9PT0gJ1tvYmplY3QgTnVtYmVyXScgfVxuZnVuY3Rpb24gaXNTdHJpbmcgKG9iaikgeyByZXR1cm4gdG9TKG9iaikgPT09ICdbb2JqZWN0IFN0cmluZ10nIH1cblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIGlzQXJyYXkgKHhzKSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuXG52YXIgZm9yRWFjaCA9IGZ1bmN0aW9uICh4cywgZm4pIHtcbiAgICBpZiAoeHMuZm9yRWFjaCkgcmV0dXJuIHhzLmZvckVhY2goZm4pXG4gICAgZWxzZSBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGZuKHhzW2ldLCBpLCB4cyk7XG4gICAgfVxufTtcblxuZm9yRWFjaChvYmplY3RLZXlzKFRyYXZlcnNlLnByb3RvdHlwZSksIGZ1bmN0aW9uIChrZXkpIHtcbiAgICB0cmF2ZXJzZVtrZXldID0gZnVuY3Rpb24gKG9iaikge1xuICAgICAgICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgICAgdmFyIHQgPSBuZXcgVHJhdmVyc2Uob2JqKTtcbiAgICAgICAgcmV0dXJuIHRba2V5XS5hcHBseSh0LCBhcmdzKTtcbiAgICB9O1xufSk7XG5cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5oYXNPd25Qcm9wZXJ0eSB8fCBmdW5jdGlvbiAob2JqLCBrZXkpIHtcbiAgICByZXR1cm4ga2V5IGluIG9iajtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvYXBpRGVjbGFyYXRpb24uanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJzd2FnZ2VyVmVyc2lvblwiLCBcImJhc2VQYXRoXCIsIFwiYXBpc1wiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJzd2FnZ2VyVmVyc2lvblwiOiB7IFwiZW51bVwiOiBbIFwiMS4yXCIgXSB9LFxuICAgICAgICBcImFwaVZlcnNpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImJhc2VQYXRoXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIixcbiAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl5odHRwcz86Ly9cIlxuICAgICAgICB9LFxuICAgICAgICBcInJlc291cmNlUGF0aFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCIsXG4gICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeL1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXBpc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXBpT2JqZWN0XCIgfVxuICAgICAgICB9LFxuICAgICAgICBcIm1vZGVsc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIm1vZGVsc09iamVjdC5qc29uI1wiXG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvZHVjZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICBcImNvbnN1bWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7IFwiJHJlZlwiOiBcImF1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIiB9XG4gICAgfSxcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcImFwaU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInBhdGhcIiwgXCJvcGVyYXRpb25zXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJwYXRoXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpLXRlbXBsYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl4vXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwib3BlcmF0aW9uc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJvcGVyYXRpb25PYmplY3QuanNvbiNcIiB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW1lVHlwZUFycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcIm1pbWUtdHlwZVwiXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvYXV0aG9yaXphdGlvbk9iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2Jhc2ljQXV0aFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXBpS2V5XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJiYXNpY0F1dGhcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYmFzaWNBdXRoXCIgXSB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImFwaUtleVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIsIFwicGFzc0FzXCIsIFwia2V5bmFtZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYXBpS2V5XCIgXSB9LFxuICAgICAgICAgICAgICAgIFwicGFzc0FzXCI6IHsgXCJlbnVtXCI6IFsgXCJoZWFkZXJcIiwgXCJxdWVyeVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcImtleW5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm9hdXRoMlwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiwgXCJncmFudFR5cGVzXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJvYXV0aDJcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZVwiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZ3JhbnRUeXBlc1wiOiB7IFwiJHJlZlwiOiBcIm9hdXRoMkdyYW50VHlwZS5qc29uI1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwib2F1dGgyU2NvcGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJzY29wZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwic2NvcGVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufVxuXG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvZGF0YVR5cGUuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGF0YSB0eXBlIGFzIGRlc2NyaWJlZCBieSB0aGUgc3BlY2lmaWNhdGlvbiAodmVyc2lvbiAxLjIpXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJvbmVPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZWZUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZvaWRUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZVR5cGVcIiB9LFxuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbW9kZWxUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FycmF5VHlwZVwiIH1cbiAgICBdLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInJlZlR5cGVcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwidm9pZFR5cGVcIjoge1xuICAgICAgICAgICAgXCJlbnVtXCI6IFsgeyBcInR5cGVcIjogXCJ2b2lkXCIgfSBdXG4gICAgICAgIH0sXG4gICAgICAgIFwibW9kZWxUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bWJlclwiLCBcInN0cmluZ1wiLCBcImFycmF5XCIgXVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJwcmltaXRpdmVUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcImJvb2xlYW5cIiwgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIsIFwic3RyaW5nXCIgXVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVmYXVsdFZhbHVlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjogeyBcInR5cGVcIjogWyBcImFycmF5XCIsIFwib2JqZWN0XCIsIFwibnVsbFwiIF0gfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1pbmltdW1cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwibWF4aW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgICAgICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiaW50MzJcIiwgXCJpbnQ2NFwiIF0gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJudW1iZXJcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJmbG9hdFwiLCBcImRvdWJsZVwiIF0gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYnl0ZVwiLCBcImRhdGVcIiwgXCJkYXRlLXRpbWVcIiBdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcInN0cmluZ1wiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImludGVnZXJcIiwgXCJudW1iZXJcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJhcnJheVR5cGVcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiLCBcIml0ZW1zXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJhcnJheVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaXRlbXNPYmplY3RcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3JlZlR5cGVcIlxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZVR5cGVcIlxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjoge30sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHt9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2RhdGFUeXBlQmFzZS5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwiZGVzY3JpcHRpb25cIjogXCJEYXRhIHR5cGUgZmllbGRzIChzZWN0aW9uIDQuMy4zKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7IFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdIH0sXG4gICAgICAgIHsgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0gfVxuICAgIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCIkcmVmXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJmb3JtYXRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlZmF1bHRWYWx1ZVwiOiB7XG4gICAgICAgICAgICBcIm5vdFwiOiB7IFwidHlwZVwiOiBbIFwiYXJyYXlcIiwgXCJvYmplY3RcIiwgXCJudWxsXCIgXSB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWUsXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDFcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaXRlbXNPYmplY3RcIiB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH1cbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImludDMyXCIsIFwiaW50NjRcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJudW1iZXJcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiZmxvYXRcIiwgXCJkb3VibGVcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJieXRlXCIsIFwiZGF0ZVwiLCBcImRhdGUtdGltZVwiIF1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiaXRlbXNPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0sXG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJhbGxPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9pbmZvT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcImluZm8gb2JqZWN0IChzZWN0aW9uIDUuMS4zKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInRpdGxlXCIsIFwiZGVzY3JpcHRpb25cIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidGl0bGVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJ0ZXJtc09mU2VydmljZVVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgIFwiY29udGFjdFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcImVtYWlsXCIgfSxcbiAgICAgICAgXCJsaWNlbnNlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJsaWNlbnNlVXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfVxuICAgIH0sXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9tb2RlbHNPYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJpZFwiLCBcInByb3BlcnRpZXNcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiaWRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJvcGVydHlPYmplY3RcIiB9XG4gICAgICAgIH0sXG4gICAgICAgIFwic3ViVHlwZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGlzY3JpbWluYXRvclwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJzdWJUeXBlc1wiOiBbIFwiZGlzY3JpbWluYXRvclwiIF1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInByb3BlcnR5T2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL29hdXRoMkdyYW50VHlwZS5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwibWluUHJvcGVydGllc1wiOiAxLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiaW1wbGljaXRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2ltcGxpY2l0XCIgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uX2NvZGVcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2F1dGhvcml6YXRpb25Db2RlXCIgfVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiaW1wbGljaXRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJsb2dpbkVuZHBvaW50XCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJsb2dpbkVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9sb2dpbkVuZHBvaW50XCIgfSxcbiAgICAgICAgICAgICAgICBcInRva2VuTmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbkNvZGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0b2tlbkVuZHBvaW50XCIsIFwidG9rZW5SZXF1ZXN0RW5kcG9pbnRcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInRva2VuRW5kcG9pbnRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Rva2VuRW5kcG9pbnRcIiB9LFxuICAgICAgICAgICAgICAgIFwidG9rZW5SZXF1ZXN0RW5kcG9pbnRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Rva2VuUmVxdWVzdEVuZHBvaW50XCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJsb2dpbkVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuRW5kcG9pbnRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ1cmxcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgICAgICAgICAgXCJ0b2tlbk5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuUmVxdWVzdEVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICAgICAgICAgIFwiY2xpZW50SWROYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImNsaWVudFNlY3JldE5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9vcGVyYXRpb25PYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgeyBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIiB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJtZXRob2RcIiwgXCJuaWNrbmFtZVwiLCBcInBhcmFtZXRlcnNcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIm1ldGhvZFwiOiB7IFwiZW51bVwiOiBbIFwiR0VUXCIsIFwiUE9TVFwiLCBcIlBVVFwiLCBcIlBBVENIXCIsIFwiREVMRVRFXCIsIFwiT1BUSU9OU1wiIF0gfSxcbiAgICAgICAgICAgICAgICBcInN1bW1hcnlcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJtYXhMZW5ndGhcIjogMTIwIH0sXG4gICAgICAgICAgICAgICAgXCJub3Rlc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJuaWNrbmFtZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeW2EtekEtWjAtOV9dKyRcIlxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jL2RlZmluaXRpb25zL29hdXRoMlNjb3BlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcInBhcmFtZXRlck9iamVjdC5qc29uI1wiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwicmVzcG9uc2VNZXNzYWdlc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlTWVzc2FnZU9iamVjdFwifVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJwcm9kdWNlc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXG4gICAgICAgICAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXG4gICAgICAgICAgICAgICAgXCJkZXByZWNhdGVkXCI6IHsgXCJlbnVtXCI6IFsgXCJ0cnVlXCIsIFwiZmFsc2VcIiBdIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIF0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwicmVzcG9uc2VNZXNzYWdlT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwiY29kZVwiLCBcIm1lc3NhZ2VcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImNvZGVcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3JmYzI2MTZzZWN0aW9uMTBcIiB9LFxuICAgICAgICAgICAgICAgIFwibWVzc2FnZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJyZXNwb25zZU1vZGVsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInJmYzI2MTZzZWN0aW9uMTBcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJtaW5pbXVtXCI6IDEwMCxcbiAgICAgICAgICAgIFwibWF4aW11bVwiOiA2MDAsXG4gICAgICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcIm1pbWVUeXBlQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwibWltZS10eXBlXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9wYXJhbWV0ZXJPYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgeyBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIiB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJwYXJhbVR5cGVcIiwgXCJuYW1lXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJwYXJhbVR5cGVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcInBhdGhcIiwgXCJxdWVyeVwiLCBcImJvZHlcIiwgXCJoZWFkZXJcIiwgXCJmb3JtXCIgXVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJuYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcInJlcXVpcmVkXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH0sXG4gICAgICAgICAgICAgICAgXCJhbGxvd011bHRpcGxlXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcInR5cGUgRmlsZSByZXF1aXJlcyBzcGVjaWFsIHBhcmFtVHlwZSBhbmQgY29uc3VtZXNcIixcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwibm90XCI6IHsgXCJlbnVtXCI6IFsgXCJGaWxlXCIgXSB9IH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJGaWxlXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJwYXJhbVR5cGVcIjogeyBcImVudW1cIjogWyBcImZvcm1cIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImNvbnN1bWVzXCI6IHsgXCJlbnVtXCI6IFsgXCJtdWx0aXBhcnQvZm9ybS1kYXRhXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICBdXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwic3dhZ2dlclZlcnNpb25cIiwgXCJhcGlzXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInN3YWdnZXJWZXJzaW9uXCI6IHsgXCJlbnVtXCI6IFsgXCIxLjJcIiBdIH0sXG4gICAgICAgIFwiYXBpc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcInJlc291cmNlT2JqZWN0Lmpzb24jXCIgfVxuICAgICAgICB9LFxuICAgICAgICBcImFwaVZlcnNpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImluZm9cIjogeyBcIiRyZWZcIjogXCJpbmZvT2JqZWN0Lmpzb24jXCIgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7IFwiJHJlZlwiOiBcImF1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIiB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL3Jlc291cmNlT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwicGF0aFwiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJwYXRoXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICB9LFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2Vcbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwidGl0bGVcIjogXCJBIEpTT04gU2NoZW1hIGZvciBTd2FnZ2VyIDIuMCBBUEkuXCIsXG4gIFwiaWRcIjogXCJodHRwOi8vc3dhZ2dlci5pby92Mi9zY2hlbWEuanNvbiNcIixcbiAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICBcInJlcXVpcmVkXCI6IFtcbiAgICBcInN3YWdnZXJcIixcbiAgICBcImluZm9cIixcbiAgICBcInBhdGhzXCJcbiAgXSxcbiAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgXCJeeC1cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgIH1cbiAgfSxcbiAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICBcInN3YWdnZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImVudW1cIjogW1xuICAgICAgICBcIjIuMFwiXG4gICAgICBdLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBTd2FnZ2VyIHZlcnNpb24gb2YgdGhpcyBkb2N1bWVudC5cIlxuICAgIH0sXG4gICAgXCJpbmZvXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaW5mb1wiXG4gICAgfSxcbiAgICBcImhvc3RcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImZvcm1hdFwiOiBcInVyaVwiLFxuICAgICAgXCJwYXR0ZXJuXCI6IFwiXltee30vIDpcXFxcXFxcXF0rKD86OlxcXFxkKyk/JFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBmdWxseSBxdWFsaWZpZWQgVVJJIHRvIHRoZSBob3N0IG9mIHRoZSBBUEkuXCJcbiAgICB9LFxuICAgIFwiYmFzZVBhdGhcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcInBhdHRlcm5cIjogXCJeL1wiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBiYXNlIHBhdGggdG8gdGhlIEFQSS4gRXhhbXBsZTogJy9hcGknLlwiXG4gICAgfSxcbiAgICBcInNjaGVtZXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWVzTGlzdFwiXG4gICAgfSxcbiAgICBcImNvbnN1bWVzXCI6IHtcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyBhY2NlcHRlZCBieSB0aGUgQVBJLlwiLFxuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcbiAgICB9LFxuICAgIFwicHJvZHVjZXNcIjoge1xuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgbGlzdCBvZiBNSU1FIHR5cGVzIHRoZSBBUEkgY2FuIHByb2R1Y2UuXCIsXG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgIH0sXG4gICAgXCJwYXRoc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdGhzXCJcbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZpbml0aW9uc1wiXG4gICAgfSxcbiAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJEZWZpbml0aW9uc1wiXG4gICAgfSxcbiAgICBcInJlc3BvbnNlc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlRGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NlY3VyaXR5XCJcbiAgICB9LFxuICAgIFwic2VjdXJpdHlEZWZpbml0aW9uc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NlY3VyaXR5RGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJ0YWdzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90YWdcIlxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgIH1cbiAgfSxcbiAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgXCJpbmZvXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkdlbmVyYWwgaW5mb3JtYXRpb24gYWJvdXQgdGhlIEFQSS5cIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInZlcnNpb25cIixcbiAgICAgICAgXCJ0aXRsZVwiXG4gICAgICBdLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgdW5pcXVlIGFuZCBwcmVjaXNlIHRpdGxlIG9mIHRoZSBBUEkuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ2ZXJzaW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBzZW1hbnRpYyB2ZXJzaW9uIG51bWJlciBvZiB0aGUgQVBJLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxvbmdlciBkZXNjcmlwdGlvbiBvZiB0aGUgQVBJLiBTaG91bGQgYmUgZGlmZmVyZW50IGZyb20gdGhlIHRpdGxlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0ZXJtc09mU2VydmljZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSB0ZXJtcyBvZiBzZXJ2aWNlIGZvciB0aGUgQVBJLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29udGFjdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb250YWN0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJsaWNlbnNlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2xpY2Vuc2VcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImNvbnRhY3RcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQ29udGFjdCBpbmZvcm1hdGlvbiBmb3IgdGhlIG93bmVycyBvZiB0aGUgQVBJLlwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBpZGVudGlmeWluZyBuYW1lIG9mIHRoZSBjb250YWN0IHBlcnNvbi9vcmdhbml6YXRpb24uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1cmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgVVJMIHBvaW50aW5nIHRvIHRoZSBjb250YWN0IGluZm9ybWF0aW9uLlwiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbWFpbFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBlbWFpbCBhZGRyZXNzIG9mIHRoZSBjb250YWN0IHBlcnNvbi9vcmdhbml6YXRpb24uXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJlbWFpbFwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwibGljZW5zZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIlxuICAgICAgXSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgbGljZW5zZSB0eXBlLiBJdCdzIGVuY291cmFnZWQgdG8gdXNlIGFuIE9TSSBjb21wYXRpYmxlIGxpY2Vuc2UuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1cmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgVVJMIHBvaW50aW5nIHRvIHRoZSBsaWNlbnNlLlwiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJwYXRoc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJSZWxhdGl2ZSBwYXRocyB0byB0aGUgaW5kaXZpZHVhbCBlbmRwb2ludHMuIFRoZXkgbXVzdCBiZSByZWxhdGl2ZSB0byB0aGUgJ2Jhc2VQYXRoJy5cIixcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcIl4vXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdGhJdGVtXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgfSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJPbmUgb3IgbW9yZSBKU09OIG9iamVjdHMgZGVzY3JpYmluZyB0aGUgc2NoZW1hcyBiZWluZyBjb25zdW1lZCBhbmQgcHJvZHVjZWQgYnkgdGhlIEFQSS5cIlxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJEZWZpbml0aW9uc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlclwiXG4gICAgICB9LFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIk9uZSBvciBtb3JlIEpTT04gcmVwcmVzZW50YXRpb25zIGZvciBwYXJhbWV0ZXJzXCJcbiAgICB9LFxuICAgIFwicmVzcG9uc2VEZWZpbml0aW9uc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlXCJcbiAgICAgIH0sXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiT25lIG9yIG1vcmUgSlNPTiByZXByZXNlbnRhdGlvbnMgZm9yIHBhcmFtZXRlcnNcIlxuICAgIH0sXG4gICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcImluZm9ybWF0aW9uIGFib3V0IGV4dGVybmFsIGRvY3VtZW50YXRpb25cIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1cmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJleGFtcGxlc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl5bYS16MC05LV0rL1thLXowLTlcXFxcLStdKyRcIjoge31cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcIm1pbWVUeXBlXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJwYXR0ZXJuXCI6IFwiXltcXFxcc2EtejAtOVxcXFwtKztcXFxcLj1cXFxcL10rJFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBNSU1FIHR5cGUgb2YgdGhlIEhUVFAgbWVzc2FnZS5cIlxuICAgIH0sXG4gICAgXCJvcGVyYXRpb25cIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJyZXNwb25zZXNcIlxuICAgICAgXSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidGFnc1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJzdW1tYXJ5XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBzdW1tYXJ5IG9mIHRoZSBvcGVyYXRpb24uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgbG9uZ2VyIGRlc2NyaXB0aW9uIG9mIHRoZSBvcGVyYXRpb24sIGdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4dGVybmFsRG9jc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwib3BlcmF0aW9uSWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGZyaWVuZGx5IG5hbWUgb2YgdGhlIG9wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvZHVjZXNcIjoge1xuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBwcm9kdWNlLlwiLFxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29uc3VtZXNcIjoge1xuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBjb25zdW1lLlwiLFxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGFyYW1ldGVyc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJzTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicmVzcG9uc2VzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NoZW1lc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWVzTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVwcmVjYXRlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInNlY3VyaXR5XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NlY3VyaXR5XCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJwYXRoSXRlbVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwdXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwb3N0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVsZXRlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwib3B0aW9uc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcImhlYWRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXRjaFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyc0xpc3RcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInJlc3BvbnNlc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJSZXNwb25zZSBvYmplY3RzIG5hbWVzIGNhbiBlaXRoZXIgYmUgYW55IHZhbGlkIEhUVFAgc3RhdHVzIGNvZGUgb3IgJ2RlZmF1bHQnLlwiLFxuICAgICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IDEsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXihbMC05XXszfSkkfF4oZGVmYXVsdCkkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlVmFsdWVcIlxuICAgICAgICB9LFxuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJub3RcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJyZXNwb25zZVZhbHVlXCI6IHtcbiAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2pzb25SZWZlcmVuY2VcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInJlc3BvbnNlXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NoZW1hXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaGVhZGVyc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9oZWFkZXJzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGFtcGxlc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGFtcGxlc1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImhlYWRlcnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9oZWFkZXJcIlxuICAgICAgfVxuICAgIH0sXG4gICAgXCJoZWFkZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInZlbmRvckV4dGVuc2lvblwiOiB7XG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQW55IHByb3BlcnR5IHN0YXJ0aW5nIHdpdGggeC0gaXMgdmFsaWQuXCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHRydWUsXG4gICAgICBcImFkZGl0aW9uYWxJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcImJvZHlQYXJhbWV0ZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCIsXG4gICAgICAgIFwiaW5cIixcbiAgICAgICAgXCJzY2hlbWFcIlxuICAgICAgXSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYm9keVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgd2hldGhlciBvciBub3QgdGhpcyBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQgb3Igb3B0aW9uYWwuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NoZW1hXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImhlYWRlclBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgd2hldGhlciBvciBub3QgdGhpcyBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQgb3Igb3B0aW9uYWwuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImhlYWRlclwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicXVlcnlQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJxdWVyeVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiZm9ybURhdGFQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJmb3JtRGF0YVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCIsXG4gICAgICAgICAgICBcImZpbGVcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRXaXRoTXVsdGlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJwYXRoUGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICAgIF0sXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgd2hldGhlciBvciBub3QgdGhpcyBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQgb3Igb3B0aW9uYWwuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicGF0aFwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwibm9uQm9keVBhcmFtZXRlclwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIixcbiAgICAgICAgXCJpblwiLFxuICAgICAgICBcInR5cGVcIlxuICAgICAgXSxcbiAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9oZWFkZXJQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9mb3JtRGF0YVBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3F1ZXJ5UGFyYW1ldGVyU3ViU2NoZW1hXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0aFBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9LFxuICAgIFwicGFyYW1ldGVyXCI6IHtcbiAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9ib2R5UGFyYW1ldGVyXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbm9uQm9keVBhcmFtZXRlclwiXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9LFxuICAgIFwic2NoZW1hXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgZGV0ZXJtaW5pc3RpYyB2ZXJzaW9uIG9mIGEgSlNPTiBTY2hlbWEgb2JqZWN0LlwiLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInRpdGxlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90aXRsZVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2Rlc2NyaXB0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvc3RyaW5nQXJyYXlcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3R5cGVcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcImFsbE9mXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkaXNjcmltaW5hdG9yXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlYWRPbmx5XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwieG1sXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3htbFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4dGVybmFsRG9jc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhhbXBsZVwiOiB7fVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJwcmltaXRpdmVzSXRlbXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVJlcXVpcmVtZW50XCJcbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwic2VjdXJpdHlSZXF1aXJlbWVudFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgIH1cbiAgICB9LFxuICAgIFwieG1sXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lc3BhY2VcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHJlZml4XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImF0dHJpYnV0ZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIndyYXBwZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJ0YWdcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwic2VjdXJpdHlEZWZpbml0aW9uc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2Jhc2ljQXV0aGVudGljYXRpb25TZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaUtleVNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgySW1wbGljaXRTZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlBhc3N3b3JkU2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJBcHBsaWNhdGlvblNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyQWNjZXNzQ29kZVNlY3VyaXR5XCJcbiAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiYmFzaWNBdXRoZW50aWNhdGlvblNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYmFzaWNcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImFwaUtleVNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJuYW1lXCIsXG4gICAgICAgIFwiaW5cIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYXBpS2V5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiaGVhZGVyXCIsXG4gICAgICAgICAgICBcInF1ZXJ5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJJbXBsaWNpdFNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJpbXBsaWNpdFwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInNjb3Blc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMlBhc3N3b3JkU2VjdXJpdHlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiLFxuICAgICAgICBcImZsb3dcIixcbiAgICAgICAgXCJ0b2tlblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJwYXNzd29yZFwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInNjb3Blc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJBcHBsaWNhdGlvblNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwidG9rZW5VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYXBwbGljYXRpb25cIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgyQWNjZXNzQ29kZVNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiLFxuICAgICAgICBcInRva2VuVXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcIm9hdXRoMlwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZsb3dcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFjY2Vzc0NvZGVcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidG9rZW5VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMlNjb3Blc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgfVxuICAgIH0sXG4gICAgXCJtZWRpYVR5cGVMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZVwiXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInBhcmFtZXRlcnNMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIHBhcmFtZXRlcnMgbmVlZGVkIHRvIHNlbmQgYSB2YWxpZCBBUEkgY2FsbC5cIixcbiAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgIFwiYWRkaXRpb25hbEl0ZW1zXCI6IGZhbHNlLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyXCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvanNvblJlZmVyZW5jZVwiXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInNjaGVtZXNMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIHRyYW5zZmVyIHByb3RvY29sIG9mIHRoZSBBUEkuXCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgXCJodHRwXCIsXG4gICAgICAgICAgXCJodHRwc1wiLFxuICAgICAgICAgIFwid3NcIixcbiAgICAgICAgICBcIndzc1wiXG4gICAgICAgIF1cbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgIFwiY3N2XCIsXG4gICAgICAgIFwic3N2XCIsXG4gICAgICAgIFwidHN2XCIsXG4gICAgICAgIFwicGlwZXNcIlxuICAgICAgXSxcbiAgICAgIFwiZGVmYXVsdFwiOiBcImNzdlwiXG4gICAgfSxcbiAgICBcImNvbGxlY3Rpb25Gb3JtYXRXaXRoTXVsdGlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImVudW1cIjogW1xuICAgICAgICBcImNzdlwiLFxuICAgICAgICBcInNzdlwiLFxuICAgICAgICBcInRzdlwiLFxuICAgICAgICBcInBpcGVzXCIsXG4gICAgICAgIFwibXVsdGlcIlxuICAgICAgXSxcbiAgICAgIFwiZGVmYXVsdFwiOiBcImNzdlwiXG4gICAgfSxcbiAgICBcInRpdGxlXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3RpdGxlXCJcbiAgICB9LFxuICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVzY3JpcHRpb25cIlxuICAgIH0sXG4gICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2RlZmF1bHRcIlxuICAgIH0sXG4gICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL211bHRpcGxlT2ZcIlxuICAgIH0sXG4gICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL21heGltdW1cIlxuICAgIH0sXG4gICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgIH0sXG4gICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL21pbmltdW1cIlxuICAgIH0sXG4gICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgIH0sXG4gICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgfSxcbiAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgIH0sXG4gICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3BhdHRlcm5cIlxuICAgIH0sXG4gICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICB9LFxuICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICB9LFxuICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdW5pcXVlSXRlbXNcIlxuICAgIH0sXG4gICAgXCJlbnVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2VudW1cIlxuICAgIH0sXG4gICAgXCJqc29uUmVmZXJlbmNlXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiQ29yZSBzY2hlbWEgbWV0YS1zY2hlbWFcIixcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJzY2hlbWFBcnJheVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zaXRpdmVJbnRlZ2VyXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAwXG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIjoge1xuICAgICAgICAgICAgXCJhbGxPZlwiOiBbIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIiB9LCB7IFwiZGVmYXVsdFwiOiAwIH0gXVxuICAgICAgICB9LFxuICAgICAgICBcInNpbXBsZVR5cGVzXCI6IHtcbiAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYXJyYXlcIiwgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bGxcIiwgXCJudW1iZXJcIiwgXCJvYmplY3RcIiwgXCJzdHJpbmdcIiBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic3RyaW5nQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH1cbiAgICB9LFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiaWRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiJHNjaGVtYVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7fSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJtaW5pbXVtXCI6IDAsXG4gICAgICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwibnVtYmVyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwibnVtYmVyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCIgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJyZWdleFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYWRkaXRpb25hbEl0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH0sXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIiB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4UHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcbiAgICAgICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXG4gICAgICAgIFwicmVxdWlyZWRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCIgfSxcbiAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc3RyaW5nQXJyYXlcIiB9XG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NpbXBsZVR5cGVzXCIgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NpbXBsZVR5cGVzXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiYWxsT2ZcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfSxcbiAgICAgICAgXCJhbnlPZlwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9LFxuICAgICAgICBcIm9uZU9mXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH0sXG4gICAgICAgIFwibm90XCI6IHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IFsgXCJtYXhpbXVtXCIgXSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IFsgXCJtaW5pbXVtXCIgXVxuICAgIH0sXG4gICAgXCJkZWZhdWx0XCI6IHt9XG59XG4iXX0=
