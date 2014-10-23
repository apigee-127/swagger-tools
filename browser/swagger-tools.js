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
var jjv = (typeof window !== "undefined" ? window.jjv : typeof global !== "undefined" ? global.jjv : null);
var jjve = require('jjve');
var md5 = (typeof window !== "undefined" ? window.SparkMD5 : typeof global !== "undefined" ? global.SparkMD5 : null);
var traverse = (typeof window !== "undefined" ? window.traverse : typeof global !== "undefined" ? global.traverse : null);
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

var validateArrayType = function validateArrayType (data, path, dest) {
  // We have to do this manually for now (https://github.com/swagger-api/swagger-spec/issues/174)
  if (data.type === 'array' && _.isUndefined(data.items)) {
    createErrorOrWarning('OBJECT_MISSING_REQUIRED_PROPERTY', 'Missing required property: items', data, path, dest);
  }
};

// TODO: Move this to a helper

var validateParameterConstraints = function validateParameterConstraints (spec, parameter, val, path, dest) {
  switch (spec.version) {
  case '1.2':
    // TODO: Make this work with parameters that have references

    validateArrayType(parameter, path, dest);

    // Validate the value type/format (Skip for array since we manually handle it above for now)
    if (parameter.type === 'array' && !_.isUndefined(parameter.items)) {
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

    validateArrayType(parameter, path, dest);

    // Validate the value type/format (Skip for array since we manually handle it above for now)
    if (parameter.type === 'array' && !_.isUndefined(parameter.items)) {
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
  var isRemoteRef = function (ref) {
    return ref.indexOf('http://') === 0 || ref.indexOf('https://') === 0;
  };

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

      validateArrayType(property, pPath, results.error);

      // Keep track of the model references
      if (property.$ref) {
        getModelMetadata(modelsMetadata, property.$ref).refs.push(pPath.concat(['$ref']));
      } else if (property.type === 'array' && !_.isUndefined(property.items) && !_.isUndefined(property.items.$ref)) {
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
        if (!isRemoteRef(schema.$ref)) {
          metadata.parents.push(refToJsonPointer(schema.$ref));

          getModelMetadata(modelsMetadata, refToJsonPointer(schema.$ref)).refs.push(sPath.concat('$ref'));
        }
      }
    });

    // Validate the default value against constraints
    if (!_.isUndefined(model.default)) {
      validateParameterConstraints(spec, model, model.defaultValue, path.concat('default'), results.errors);
    }

    // Skipping 'definitions' for now: https://github.com/reverb/swagger-spec/issues/127

    // Keep track of model references in $ref, items.$ref
    if (model.$ref) {
      if (!isRemoteRef(model.$ref)) {
        getModelMetadata(modelsMetadata, refToJsonPointer(model.$ref)).refs.push(path.concat(['$ref']));
      }
    } else if (model.type === 'array') {
      validateArrayType(model, path, results.errors);

      if (!_.isUndefined(model.items) && !_.isUndefined(model.items.$ref)) {
        if (!isRemoteRef(model.items.$ref)) {
          getModelMetadata(modelsMetadata,
                           refToJsonPointer(model.items.$ref)).refs.push(path.concat(['items', '$ref']));
        }
      } else if (!_.isUndefined(model.items) && !_.isUndefined(model.items.type) &&
                   spec.primitives.indexOf(model.items.type) === -1) {
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
        if (!isRemoteRef(property.$ref)) {
          getModelMetadata(modelsMetadata, refToJsonPointer(property.$ref)).refs.push(pPath.concat(['$ref']));
        }
      } else if (property.type === 'array') {
        validateArrayType(property, pPath, results.errors);

        if (!_.isUndefined(property.items) && !_.isUndefined(property.items.$ref) &&
              !isRemoteRef(property.items.$ref)) {
          getModelMetadata(modelsMetadata,
                           refToJsonPointer(property.items.$ref)).refs.push(pPath.concat(['items', '$ref']));
        } else if (!_.isUndefined(property.items) && !_.isUndefined(property.items.type) &&
                     spec.primitives.indexOf(property.items.type) === -1) {
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
      if (!_.isUndefined(metadata.schema) && !_.isUndefined(metadata.schema.required)) {
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
              var pPath = oPath.concat('parameters', index.toString());

              validateArrayType(parameter, pPath, result.errors);

              // Add model references from parameter type/items
              if (spec.primitives.indexOf(parameter.type) === -1) {
                addModelRef(parameter.type, oPath.concat(['parameters', index.toString(), 'type']));
              } else if (parameter.type === 'array' && !_.isUndefined(parameter.items) &&
                           !_.isUndefined(parameter.items.$ref)) {
                addModelRef(parameter.items.$ref, pPath.concat(['items', '$ref']));
              }

              // Validate duplicate parameter name
              validateNoExist(seenParameters, parameter.name, 'OPERATION_PARAMETER', 'Operation parameter',
                              pPath.concat('name'), result.errors);

              // Keep track of path parameters
              if (parameter.paramType === 'path') {
                if (nPath.args.indexOf(parameter.name) === -1) {
                  createErrorOrWarning('UNRESOLVABLE_API_PATH_PARAMETER',
                                       'API path parameter could not be resolved: ' + parameter.name, parameter.name,
                                       pPath.concat('name'), result.errors);
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

            validateArrayType(operation, oPath, result.errors);

            // Add model references from type/items
            if (operation.type === 'array' && !_.isUndefined(operation.items) && !_.isUndefined(operation.items.$ref)) {
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
          _.each(operation.responses, function (responseObj, responseCode) {
            var rPath = oPath.concat('responses', responseCode);

            if (!_.isUndefined(responseObj.schema)) {
              processModel(spec, modelsMetadata, responseObj.schema, toJsonPointer(rPath.concat('schema')),
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

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../schemas/1.2/apiDeclaration.json":5,"../schemas/1.2/authorizationObject.json":6,"../schemas/1.2/dataType.json":7,"../schemas/1.2/dataTypeBase.json":8,"../schemas/1.2/infoObject.json":9,"../schemas/1.2/modelsObject.json":10,"../schemas/1.2/oauth2GrantType.json":11,"../schemas/1.2/operationObject.json":12,"../schemas/1.2/parameterObject.json":13,"../schemas/1.2/resourceListing.json":14,"../schemas/1.2/resourceObject.json":15,"../schemas/2.0/schema.json":16,"../schemas/json-schema-draft-04.json":17,"./helpers":2,"./validators":3,"jjve":4}],2:[function(require,module,exports){
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

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lib/specs":undefined}],3:[function(require,module,exports){
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

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./helpers":2}],4:[function(require,module,exports){
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
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuL2xpYi9zcGVjcy5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL2xpYi9oZWxwZXJzLmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbGliL3ZhbGlkYXRvcnMuanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvamp2ZS9qanZlLmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvYXBpRGVjbGFyYXRpb24uanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9kYXRhVHlwZUJhc2UuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2luZm9PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL21vZGVsc09iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9vcGVyYXRpb25PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL3BhcmFtZXRlck9iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9yZXNvdXJjZU9iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8yLjAvc2NoZW1hLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqMkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzM4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBBcGlnZWUgQ29ycG9yYXRpb25cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG52YXIgamp2ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuamp2IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5qanYgOiBudWxsKTtcbnZhciBqanZlID0gcmVxdWlyZSgnamp2ZScpO1xudmFyIG1kNSA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlNwYXJrTUQ1IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5TcGFya01ENSA6IG51bGwpO1xudmFyIHRyYXZlcnNlID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cudHJhdmVyc2UgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLnRyYXZlcnNlIDogbnVsbCk7XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xudmFyIHZhbGlkYXRvcnMgPSByZXF1aXJlKCcuL3ZhbGlkYXRvcnMnKTtcblxudmFyIGRyYWZ0MDRKc29uID0gcmVxdWlyZSgnLi4vc2NoZW1hcy9qc29uLXNjaGVtYS1kcmFmdC0wNC5qc29uJyk7XG52YXIgZHJhZnQwNFVybCA9ICdodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSc7XG52YXIgamp2T3B0aW9ucyA9IHtcbiAgY2hlY2tSZXF1aXJlZDogdHJ1ZSxcbiAgcmVtb3ZlQWRkaXRpb25hbDogZmFsc2UsXG4gIHVzZURlZmF1bHQ6IGZhbHNlLFxuICB1c2VDb2VyY2U6IGZhbHNlXG59O1xudmFyIGpqdmVPcHRpb25zID0ge1xuICBmb3JtYXRQYXRoOiBmYWxzZVxufTtcbnZhciBtZXRhZGF0YUNhY2hlID0ge307XG52YXIgcmVmVG9Kc29uUG9pbnRlciA9IGhlbHBlcnMucmVmVG9Kc29uUG9pbnRlcjtcbnZhciB0b0pzb25Qb2ludGVyID0gaGVscGVycy50b0pzb25Qb2ludGVyO1xuXG52YXIgY3JlYXRlVmFsaWRhdG9yID0gZnVuY3Rpb24gY3JlYXRlVmFsaWRhdG9yIChzcGVjLCBzY2hlbWFOYW1lcykge1xuICB2YXIgdmFsaWRhdG9yID0gamp2KGpqdk9wdGlvbnMpO1xuXG4gIC8vIERpc2FibGUgdGhlICd1cmknIGZvcm1hdCBjaGVja2VyIGFzIGl0J3MgZ290IGlzc3VlczogaHR0cHM6Ly9naXRodWIuY29tL2Fjb3JuZWpvL2pqdi9pc3N1ZXMvMjRcbiAgdmFsaWRhdG9yLmFkZEZvcm1hdCgndXJpJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHZhbGlkYXRvci5hZGRTY2hlbWEoZHJhZnQwNFVybCwgZHJhZnQwNEpzb24pO1xuXG4gIC8vIENvbXBpbGUgdGhlIG5lY2Vzc2FyeSBzY2hlbWFzXG4gIF8uZWFjaChzY2hlbWFOYW1lcywgZnVuY3Rpb24gKHNjaGVtYU5hbWUpIHtcbiAgICB2YXIgY2xvbmUgPSBfLmNsb25lRGVlcChzcGVjLnNjaGVtYXNbc2NoZW1hTmFtZV0pO1xuXG4gICAgY2xvbmUuaWQgPSBzY2hlbWFOYW1lO1xuXG4gICAgdmFsaWRhdG9yLmFkZFNjaGVtYShzY2hlbWFOYW1lLCBjbG9uZSk7XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgdmFsaWRhdG9yLmplID0gamp2ZSh2YWxpZGF0b3IpO1xuXG4gIHJldHVybiB2YWxpZGF0b3I7XG59O1xuXG52YXIgY3JlYXRlRXJyb3JPcldhcm5pbmcgPSBmdW5jdGlvbiBjcmVhdGVFcnJvck9yV2FybmluZyAoY29kZSwgbWVzc2FnZSwgZGF0YSwgcGF0aCwgZGVzdCkge1xuICBkZXN0LnB1c2goe1xuICAgIGNvZGU6IGNvZGUsXG4gICAgbWVzc2FnZTogbWVzc2FnZSxcbiAgICBkYXRhOiBkYXRhLFxuICAgIHBhdGg6IHBhdGhcbiAgfSk7XG59O1xuXG52YXIgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcgPSBmdW5jdGlvbiBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyAoZGF0YSwgdmFsLCBjb2RlU3VmZml4LCBtc2dQcmVmaXgsIHBhdGgsIGRlc3QpIHtcbiAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOVVNFRF8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBpcyBkZWZpbmVkIGJ1dCBpcyBub3QgdXNlZDogJyArIHZhbCwgZGF0YSwgcGF0aCwgZGVzdCk7XG59O1xuXG52YXIgdmFsaWRhdGVFeGlzdCA9IGZ1bmN0aW9uIHZhbGlkYXRlRXhpc3QgKGRhdGEsIHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChkYXRhKSAmJiBkYXRhLmluZGV4T2YodmFsKSA9PT0gLTEpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHZhbCwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlTm9FeGlzdCA9IGZ1bmN0aW9uIHZhbGlkYXRlTm9FeGlzdCAoZGF0YSwgdmFsLCBjb2RlU3VmZml4LCBtc2dQcmVmaXgsIHBhdGgsIGRlc3QpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGRhdGEpICYmIGRhdGEuaW5kZXhPZih2YWwpID4gLTEpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnIGFscmVhZHkgZGVmaW5lZDogJyArIHZhbCwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlTm9EdXBsaWNhdGVzID0gZnVuY3Rpb24gdmFsaWRhdGVOb0R1cGxpY2F0ZXMgKGRhdGEsIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCwgcGF0aCwgZGVzdCkge1xuICB2YXIgbmFtZSA9IHBhdGhbcGF0aC5sZW5ndGggLSAxXTtcblxuICBpZiAoIV8uaXNVbmRlZmluZWQoZGF0YSkgJiYgZGF0YS5sZW5ndGggIT09IF8udW5pcShkYXRhKS5sZW5ndGgpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnICcgKyBuYW1lICsgJyBoYXMgZHVwbGljYXRlIGl0ZW1zJywgZGF0YSwgcGF0aCwgZGVzdCk7XG4gIH1cbn07XG5cbnZhciB2YWxpZGF0ZUFycmF5VHlwZSA9IGZ1bmN0aW9uIHZhbGlkYXRlQXJyYXlUeXBlIChkYXRhLCBwYXRoLCBkZXN0KSB7XG4gIC8vIFdlIGhhdmUgdG8gZG8gdGhpcyBtYW51YWxseSBmb3Igbm93IChodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL2lzc3Vlcy8xNzQpXG4gIGlmIChkYXRhLnR5cGUgPT09ICdhcnJheScgJiYgXy5pc1VuZGVmaW5lZChkYXRhLml0ZW1zKSkge1xuICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdPQkpFQ1RfTUlTU0lOR19SRVFVSVJFRF9QUk9QRVJUWScsICdNaXNzaW5nIHJlcXVpcmVkIHByb3BlcnR5OiBpdGVtcycsIGRhdGEsIHBhdGgsIGRlc3QpO1xuICB9XG59O1xuXG4vLyBUT0RPOiBNb3ZlIHRoaXMgdG8gYSBoZWxwZXJcblxudmFyIHZhbGlkYXRlUGFyYW1ldGVyQ29uc3RyYWludHMgPSBmdW5jdGlvbiB2YWxpZGF0ZVBhcmFtZXRlckNvbnN0cmFpbnRzIChzcGVjLCBwYXJhbWV0ZXIsIHZhbCwgcGF0aCwgZGVzdCkge1xuICBzd2l0Y2ggKHNwZWMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIFRPRE86IE1ha2UgdGhpcyB3b3JrIHdpdGggcGFyYW1ldGVycyB0aGF0IGhhdmUgcmVmZXJlbmNlc1xuXG4gICAgdmFsaWRhdGVBcnJheVR5cGUocGFyYW1ldGVyLCBwYXRoLCBkZXN0KTtcblxuICAgIC8vIFZhbGlkYXRlIHRoZSB2YWx1ZSB0eXBlL2Zvcm1hdCAoU2tpcCBmb3IgYXJyYXkgc2luY2Ugd2UgbWFudWFsbHkgaGFuZGxlIGl0IGFib3ZlIGZvciBub3cpXG4gICAgaWYgKHBhcmFtZXRlci50eXBlID09PSAnYXJyYXknICYmICFfLmlzVW5kZWZpbmVkKHBhcmFtZXRlci5pdGVtcykpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVUeXBlQW5kRm9ybWF0KHBhcmFtZXRlci5uYW1lLCB2YWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlci50eXBlID09PSAnYXJyYXknID8gcGFyYW1ldGVyLml0ZW1zLnR5cGUgOiBwYXJhbWV0ZXIudHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLnR5cGUgPT09ICdhcnJheScgJiYgcGFyYW1ldGVyLml0ZW1zLmZvcm1hdCA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLml0ZW1zLmZvcm1hdCA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLmZvcm1hdCk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgLy8gVE9ETzogVXBkYXRlIHRvIG5vdGlmeSBvZiAnSU5WQUxJRF9GT1JNQVQnXG4gICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nICgnSU5WQUxJRF9UWVBFJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBlbnVtXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVFbnVtKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5lbnVtKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nICgnRU5VTV9NSVNNQVRDSCcsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIG1heGltdW1cbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1heGltdW0ocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1heGltdW0sIHBhcmFtZXRlci50eXBlKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nICgnTUFYSU1VTScsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIG1pbmltdW1cbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1pbmltdW0ocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1pbmltdW0sIHBhcmFtZXRlci50eXBlKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nICgnTUlOSU1VTScsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIHVuaXF1ZUl0ZW1zXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVVbmlxdWVJdGVtcyhwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIudW5pcXVlSXRlbXMpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcgKCdBUlJBWV9VTklRVUUnLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIFRPRE86IE1ha2UgdGhpcyB3b3JrIHdpdGggcGFyYW1ldGVycyB0aGF0IGhhdmUgc2NoZW1hcy9yZWZlcmVuY2VzXG5cbiAgICB2YWxpZGF0ZUFycmF5VHlwZShwYXJhbWV0ZXIsIHBhdGgsIGRlc3QpO1xuXG4gICAgLy8gVmFsaWRhdGUgdGhlIHZhbHVlIHR5cGUvZm9ybWF0IChTa2lwIGZvciBhcnJheSBzaW5jZSB3ZSBtYW51YWxseSBoYW5kbGUgaXQgYWJvdmUgZm9yIG5vdylcbiAgICBpZiAocGFyYW1ldGVyLnR5cGUgPT09ICdhcnJheScgJiYgIV8uaXNVbmRlZmluZWQocGFyYW1ldGVyLml0ZW1zKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZVR5cGVBbmRGb3JtYXQocGFyYW1ldGVyLm5hbWUsIHZhbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLnR5cGUgPT09ICdhcnJheScgPyBwYXJhbWV0ZXIuaXRlbXMudHlwZSA6IHBhcmFtZXRlci50eXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIudHlwZSA9PT0gJ2FycmF5JyAmJiBwYXJhbWV0ZXIuaXRlbXMuZm9ybWF0ID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIuaXRlbXMuZm9ybWF0IDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIuZm9ybWF0KTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAvLyBUT0RPOiBVcGRhdGUgdG8gbm90aWZ5IG9mICdJTlZBTElEX0ZPUk1BVCdcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0lOVkFMSURfVFlQRScsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgZW51bVxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlRW51bShwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIuZW51bSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRU5VTV9NSVNNQVRDSCcsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIG1heGltdW1cbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1heGltdW0ocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1heGltdW0sIHBhcmFtZXRlci50eXBlLCBwYXJhbWV0ZXIuZXhjbHVzaXZlTWF4aW11bSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyhwYXJhbWV0ZXIuZXhjbHVzaXZlTWF4aW11bSA9PT0gdHJ1ZSA/ICdNQVhJTVVNX0VYQ0xVU0lWRScgOiAnTUFYSU1VTScsIGVyci5tZXNzYWdlLCB2YWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhpbXVtIGl0ZW1zXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVNYXhJdGVtcyhwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIubWF4SXRlbXMpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0FSUkFZX0xFTkdUSF9MT05HJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWF4aW11bSBsZW5ndGhcbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1heExlbmd0aChwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIubWF4TGVuZ3RoKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNQVhfTEVOR1RIJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWluaW11bVxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlTWluaW11bShwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIubWluaW11bSwgcGFyYW1ldGVyLnR5cGUsIHBhcmFtZXRlci5leGNsdXNpdmVNaW5pbXVtKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKHBhcmFtZXRlci5leGNsdXNpdmVNaW5pbXVtID09PSAndHJ1ZScgPyAnTUlOSU1VTV9FWENMVVNJVkUnIDogJ01JTklNVU0nLCBlcnIubWVzc2FnZSwgdmFsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWluaW11bSBpdGVtc1xuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlTWluSXRlbXMocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1pbkl0ZW1zKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdBUlJBWV9MRU5HVEhfU0hPUlQnLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBtaW5pbXVtIGxlbmd0aFxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlTWluTGVuZ3RoKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5taW5MZW5ndGgpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01JTl9MRU5HVEgnLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBwYXR0ZXJuXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVQYXR0ZXJuKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5wYXR0ZXJuKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdQQVRURVJOJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgdW5pcXVlSXRlbXNcbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZVVuaXF1ZUl0ZW1zKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci51bmlxdWVJdGVtcyk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQVJSQVlfVU5JUVVFJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGJyZWFrO1xuICB9XG59O1xuXG52YXIgbm9ybWFsaXplUGF0aCA9IGZ1bmN0aW9uIG5vcm1hbGl6ZVBhdGggKHBhdGgpIHtcbiAgdmFyIGFyZ05hbWVzID0gW107XG4gIHZhciBzZWdtZW50cyA9IFtdO1xuXG4gIF8uZWFjaChwYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uIChzZWdtZW50KSB7XG4gICAgaWYgKHNlZ21lbnQuY2hhckF0KDApID09PSAneycpIHtcbiAgICAgIGFyZ05hbWVzLnB1c2goc2VnbWVudC5zdWJzdHJpbmcoMSkuc3BsaXQoJ30nKVswXSk7XG5cbiAgICAgIHNlZ21lbnQgPSAneycgKyAoYXJnTmFtZXMubGVuZ3RoIC0gMSkgKyAnfSc7XG4gICAgfVxuXG4gICAgc2VnbWVudHMucHVzaChzZWdtZW50KTtcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBwYXRoOiBzZWdtZW50cy5qb2luKCcvJyksXG4gICAgYXJnczogYXJnTmFtZXNcbiAgfTtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBTd2FnZ2VyIHNwZWNpZmljYXRpb24gb2JqZWN0LlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uIC0gVGhlIFN3YWdnZXIgdmVyc2lvblxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgU3BlY2lmaWNhdGlvbiA9IGZ1bmN0aW9uIFNwZWNpZmljYXRpb24gKHZlcnNpb24pIHtcbiAgdmFyIHByaW1pdGl2ZXMgPSBbJ3N0cmluZycsICdudW1iZXInLCAnYm9vbGVhbicsICdpbnRlZ2VyJywgJ2FycmF5J107XG4gIHZhciBkb2NzVXJsO1xuICB2YXIgc2NoZW1hc1VybDtcblxuICBzd2l0Y2ggKHZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICBkb2NzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS93b3JkbmlrL3N3YWdnZXItc3BlYy9ibG9iL21hc3Rlci92ZXJzaW9ucy8xLjIubWQnO1xuICAgIHByaW1pdGl2ZXMgPSBfLnVuaW9uKHByaW1pdGl2ZXMsIFsndm9pZCcsICdGaWxlJ10pO1xuICAgIHNjaGVtYXNVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL3dvcmRuaWsvc3dhZ2dlci1zcGVjL3RyZWUvbWFzdGVyL3NjaGVtYXMvdjEuMic7XG5cbiAgICBicmVhaztcbiAgY2FzZSAnMi4wJzpcbiAgICBkb2NzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS93b3JkbmlrL3N3YWdnZXItc3BlYy9ibG9iL21hc3Rlci92ZXJzaW9ucy8yLjAubWQnO1xuICAgIHByaW1pdGl2ZXMgPSBfLnVuaW9uKHByaW1pdGl2ZXMsIFsnZmlsZSddKTtcbiAgICBzY2hlbWFzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS93b3JkbmlrL3N3YWdnZXItc3BlYy90cmVlL21hc3Rlci9zY2hlbWFzL3YyLjAnO1xuXG4gICAgYnJlYWs7XG4gIGRlZmF1bHQ6XG4gICAgdGhyb3cgbmV3IEVycm9yKHZlcnNpb24gKyAnIGlzIGFuIHVuc3VwcG9ydGVkIFN3YWdnZXIgc3BlY2lmaWNhdGlvbiB2ZXJzaW9uJyk7XG4gIH1cblxuICB0aGlzLmRvY3NVcmwgPSBkb2NzVXJsO1xuICB0aGlzLnByaW1pdGl2ZXMgPSBwcmltaXRpdmVzO1xuICB0aGlzLnNjaGVtYXNVcmwgPSBzY2hlbWFzVXJsO1xuICB0aGlzLnZlcnNpb24gPSB2ZXJzaW9uO1xuXG4gIC8vIExvYWQgdGhlIHNjaGVtYSBmaWxlc1xuICB0aGlzLnNjaGVtYXMgPSB7fTtcblxuICAvLyBDcmVhdGUgdGhlIHZhbGlkYXRvcnNcbiAgdGhpcy52YWxpZGF0b3JzID0ge307XG5cbiAgc3dpdGNoICh2ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgLy8gSGVyZSBleHBsaWNpdGx5IHRvIGFsbG93IGJyb3dzZXJpZnkgdG8gd29ya1xuICAgIHRoaXMuc2NoZW1hc1snYXBpRGVjbGFyYXRpb24uanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvYXBpRGVjbGFyYXRpb24uanNvbicpO1xuICAgIHRoaXMuc2NoZW1hc1snYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9hdXRob3JpemF0aW9uT2JqZWN0Lmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ2RhdGFUeXBlLmpzb24nXSA9IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ2RhdGFUeXBlQmFzZS5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9kYXRhVHlwZUJhc2UuanNvbicpO1xuICAgIHRoaXMuc2NoZW1hc1snaW5mb09iamVjdC5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9pbmZvT2JqZWN0Lmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ21vZGVsc09iamVjdC5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9tb2RlbHNPYmplY3QuanNvbicpO1xuICAgIHRoaXMuc2NoZW1hc1snb2F1dGgyR3JhbnRUeXBlLmpzb24nXSA9IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL29hdXRoMkdyYW50VHlwZS5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydvcGVyYXRpb25PYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvb3BlcmF0aW9uT2JqZWN0Lmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ3BhcmFtZXRlck9iamVjdC5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9wYXJhbWV0ZXJPYmplY3QuanNvbicpO1xuICAgIHRoaXMuc2NoZW1hc1sncmVzb3VyY2VMaXN0aW5nLmpzb24nXSA9IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL3Jlc291cmNlTGlzdGluZy5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydyZXNvdXJjZU9iamVjdC5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9yZXNvdXJjZU9iamVjdC5qc29uJyk7XG5cbiAgICB0aGlzLnZhbGlkYXRvcnNbJ2FwaURlY2xhcmF0aW9uLmpzb24nXSA9IGNyZWF0ZVZhbGlkYXRvcih0aGlzLCBbXG4gICAgICAnZGF0YVR5cGVCYXNlLmpzb24nLFxuICAgICAgJ21vZGVsc09iamVjdC5qc29uJyxcbiAgICAgICdvYXV0aDJHcmFudFR5cGUuanNvbicsXG4gICAgICAnYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJyxcbiAgICAgICdwYXJhbWV0ZXJPYmplY3QuanNvbicsXG4gICAgICAnb3BlcmF0aW9uT2JqZWN0Lmpzb24nLFxuICAgICAgJ2FwaURlY2xhcmF0aW9uLmpzb24nXG4gICAgXSk7XG5cbiAgICB0aGlzLnZhbGlkYXRvcnNbJ3Jlc291cmNlTGlzdGluZy5qc29uJ10gPSBjcmVhdGVWYWxpZGF0b3IodGhpcywgW1xuICAgICAgJ3Jlc291cmNlT2JqZWN0Lmpzb24nLFxuICAgICAgJ2luZm9PYmplY3QuanNvbicsXG4gICAgICAnb2F1dGgyR3JhbnRUeXBlLmpzb24nLFxuICAgICAgJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbicsXG4gICAgICAncmVzb3VyY2VMaXN0aW5nLmpzb24nXG4gICAgXSk7XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIEhlcmUgZXhwbGljaXRseSB0byBhbGxvdyBicm93c2VyaWZ5IHRvIHdvcmtcbiAgICB0aGlzLnNjaGVtYXNbJ3NjaGVtYS5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzIuMC9zY2hlbWEuanNvbicpO1xuXG4gICAgdGhpcy52YWxpZGF0b3JzWydzY2hlbWEuanNvbiddID0gY3JlYXRlVmFsaWRhdG9yKHRoaXMsIFtcbiAgICAgICdzY2hlbWEuanNvbidcbiAgICBdKTtcblxuICAgIGJyZWFrO1xuICB9XG59O1xuXG52YXIgZ2V0TW9kZWxNZXRhZGF0YSA9IGZ1bmN0aW9uIGdldE1vZGVsTWV0YWRhdGEgKG1vZGVsc01ldGFkYXRhLCBtb2RlbElkKSB7XG4gIHZhciBtZXRhZGF0YSA9IG1vZGVsc01ldGFkYXRhW21vZGVsSWRdO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKG1ldGFkYXRhKSkge1xuICAgIG1ldGFkYXRhID0gbW9kZWxzTWV0YWRhdGFbbW9kZWxJZF0gPSB7XG4gICAgICBjb21wb3NlZDoge30sXG4gICAgICBuYW1lOiB1bmRlZmluZWQsXG4gICAgICBwYXJlbnRzOiBbXSxcbiAgICAgIHJlZnM6IFtdLFxuICAgICAgc2NoZW1hOiB1bmRlZmluZWRcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIG1ldGFkYXRhO1xufTtcblxudmFyIHByb2Nlc3NNb2RlbCA9IGZ1bmN0aW9uIHByb2Nlc3NNb2RlbCAoc3BlYywgbW9kZWxzTWV0YWRhdGEsIG1vZGVsLCBtb2RlbElkLCBwYXRoLCByZXN1bHRzKSB7XG4gIHZhciBtZXRhZGF0YSA9IGdldE1vZGVsTWV0YWRhdGEobW9kZWxzTWV0YWRhdGEsIG1vZGVsSWQpO1xuICB2YXIgaXNSZW1vdGVSZWYgPSBmdW5jdGlvbiAocmVmKSB7XG4gICAgcmV0dXJuIHJlZi5pbmRleE9mKCdodHRwOi8vJykgPT09IDAgfHwgcmVmLmluZGV4T2YoJ2h0dHBzOi8vJykgPT09IDA7XG4gIH07XG5cbiAgLy8gRW5zdXJlIHRoZSBtb2RlbCdzIG5hbWUgYW5kIHNjaGVtYSBhcmUgc2V0XG4gIG1ldGFkYXRhLnNjaGVtYSA9IG1vZGVsO1xuICBtZXRhZGF0YS5uYW1lID0gbW9kZWxJZDsgLy8gUmVhc29uYWJsZSBkZWZhdWx0XG4gIG1ldGFkYXRhLnBhdGggPSBwYXRoO1xuXG4gIHN3aXRjaCAoc3BlYy52ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgLy8gU2V0IHRoZSBtb2RlbCdzIG5hbWUgdG8gdGhlIHByb3BlciB2YWx1ZVxuICAgIG1ldGFkYXRhLm5hbWUgPSBwYXRoW3BhdGgubGVuZ3RoIC0gMV07XG5cbiAgICAvLyBBZGQgbW9kZWwgcmVmZXJlbmNlcyBmcm9tIHByb3BlcnRpZXMgYW5kIHZhbGlkYXRlIHRoZSBkZWZhdWx0IHZhbHVlc1xuICAgIF8uZWFjaChtb2RlbC5wcm9wZXJ0aWVzLCBmdW5jdGlvbiAocHJvcGVydHksIG5hbWUpIHtcbiAgICAgIHZhciBwUGF0aCA9IHBhdGguY29uY2F0KCdwcm9wZXJ0aWVzJywgbmFtZSk7XG5cbiAgICAgIHZhbGlkYXRlQXJyYXlUeXBlKHByb3BlcnR5LCBwUGF0aCwgcmVzdWx0cy5lcnJvcik7XG5cbiAgICAgIC8vIEtlZXAgdHJhY2sgb2YgdGhlIG1vZGVsIHJlZmVyZW5jZXNcbiAgICAgIGlmIChwcm9wZXJ0eS4kcmVmKSB7XG4gICAgICAgIGdldE1vZGVsTWV0YWRhdGEobW9kZWxzTWV0YWRhdGEsIHByb3BlcnR5LiRyZWYpLnJlZnMucHVzaChwUGF0aC5jb25jYXQoWyckcmVmJ10pKTtcbiAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5JyAmJiAhXy5pc1VuZGVmaW5lZChwcm9wZXJ0eS5pdGVtcykgJiYgIV8uaXNVbmRlZmluZWQocHJvcGVydHkuaXRlbXMuJHJlZikpIHtcbiAgICAgICAgZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgcHJvcGVydHkuaXRlbXMuJHJlZikucmVmcy5wdXNoKHBQYXRoLmNvbmNhdChbJ2l0ZW1zJywgJyRyZWYnXSkpO1xuICAgICAgfVxuXG4gICAgICAvLyBWYWxpZGF0ZSB0aGUgZGVmYXVsdCB2YWx1ZSBhZ2FpbnN0IGNvbnN0cmFpbnRzXG4gICAgICBpZiAoIV8uaXNVbmRlZmluZWQocHJvcGVydHkuZGVmYXVsdFZhbHVlKSkge1xuICAgICAgICB2YWxpZGF0ZVBhcmFtZXRlckNvbnN0cmFpbnRzKHNwZWMsIHByb3BlcnR5LCBwcm9wZXJ0eS5kZWZhdWx0VmFsdWUsIHBQYXRoLmNvbmNhdCgnZGVmYXVsdFZhbHVlJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5lcnJvcnMpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gS2VlcCB0cmFjayBvZiBtb2RlbCByZWZlcmVuY2VzIGluIHN1YlR5cGVzXG4gICAgXy5lYWNoKF8udW5pcShtb2RlbC5zdWJUeXBlcyksIGZ1bmN0aW9uIChzdWJUeXBlLCBpbmRleCkge1xuICAgICAgdmFyIHN1Yk1ldGFkYXRhID0gZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgc3ViVHlwZSk7XG5cbiAgICAgIHN1Yk1ldGFkYXRhLnBhcmVudHMucHVzaChtb2RlbElkKTtcbiAgICAgIHN1Yk1ldGFkYXRhLnJlZnMucHVzaChwYXRoLmNvbmNhdCgnc3ViVHlwZXMnLCBpbmRleC50b1N0cmluZygpKSk7XG4gICAgfSk7XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIEtlZXAgdHJhY2sgb2YgbW9kZWwgcmVmZXJlbmNlcyBpbiBhbGxPZlxuICAgIF8uZWFjaChfLnVuaXEobW9kZWwuYWxsT2YpLCBmdW5jdGlvbiAoc2NoZW1hLCBpbmRleCkge1xuICAgICAgdmFyIHNQYXRoID0gcGF0aC5jb25jYXQoJ2FsbE9mJywgaW5kZXgudG9TdHJpbmcoKSk7XG5cbiAgICAgIGlmIChfLmlzVW5kZWZpbmVkKHNjaGVtYS4kcmVmKSkge1xuICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIHNjaGVtYSwgdG9Kc29uUG9pbnRlcihzUGF0aCksIHNQYXRoLCByZXN1bHRzKTtcblxuICAgICAgICBtZXRhZGF0YS5wYXJlbnRzLnB1c2godG9Kc29uUG9pbnRlcihzUGF0aCkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKCFpc1JlbW90ZVJlZihzY2hlbWEuJHJlZikpIHtcbiAgICAgICAgICBtZXRhZGF0YS5wYXJlbnRzLnB1c2gocmVmVG9Kc29uUG9pbnRlcihzY2hlbWEuJHJlZikpO1xuXG4gICAgICAgICAgZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgcmVmVG9Kc29uUG9pbnRlcihzY2hlbWEuJHJlZikpLnJlZnMucHVzaChzUGF0aC5jb25jYXQoJyRyZWYnKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFZhbGlkYXRlIHRoZSBkZWZhdWx0IHZhbHVlIGFnYWluc3QgY29uc3RyYWludHNcbiAgICBpZiAoIV8uaXNVbmRlZmluZWQobW9kZWwuZGVmYXVsdCkpIHtcbiAgICAgIHZhbGlkYXRlUGFyYW1ldGVyQ29uc3RyYWludHMoc3BlYywgbW9kZWwsIG1vZGVsLmRlZmF1bHRWYWx1ZSwgcGF0aC5jb25jYXQoJ2RlZmF1bHQnKSwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cblxuICAgIC8vIFNraXBwaW5nICdkZWZpbml0aW9ucycgZm9yIG5vdzogaHR0cHM6Ly9naXRodWIuY29tL3JldmVyYi9zd2FnZ2VyLXNwZWMvaXNzdWVzLzEyN1xuXG4gICAgLy8gS2VlcCB0cmFjayBvZiBtb2RlbCByZWZlcmVuY2VzIGluICRyZWYsIGl0ZW1zLiRyZWZcbiAgICBpZiAobW9kZWwuJHJlZikge1xuICAgICAgaWYgKCFpc1JlbW90ZVJlZihtb2RlbC4kcmVmKSkge1xuICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCByZWZUb0pzb25Qb2ludGVyKG1vZGVsLiRyZWYpKS5yZWZzLnB1c2gocGF0aC5jb25jYXQoWyckcmVmJ10pKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG1vZGVsLnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgIHZhbGlkYXRlQXJyYXlUeXBlKG1vZGVsLCBwYXRoLCByZXN1bHRzLmVycm9ycyk7XG5cbiAgICAgIGlmICghXy5pc1VuZGVmaW5lZChtb2RlbC5pdGVtcykgJiYgIV8uaXNVbmRlZmluZWQobW9kZWwuaXRlbXMuJHJlZikpIHtcbiAgICAgICAgaWYgKCFpc1JlbW90ZVJlZihtb2RlbC5pdGVtcy4kcmVmKSkge1xuICAgICAgICAgIGdldE1vZGVsTWV0YWRhdGEobW9kZWxzTWV0YWRhdGEsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByZWZUb0pzb25Qb2ludGVyKG1vZGVsLml0ZW1zLiRyZWYpKS5yZWZzLnB1c2gocGF0aC5jb25jYXQoWydpdGVtcycsICckcmVmJ10pKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICghXy5pc1VuZGVmaW5lZChtb2RlbC5pdGVtcykgJiYgIV8uaXNVbmRlZmluZWQobW9kZWwuaXRlbXMudHlwZSkgJiZcbiAgICAgICAgICAgICAgICAgICBzcGVjLnByaW1pdGl2ZXMuaW5kZXhPZihtb2RlbC5pdGVtcy50eXBlKSA9PT0gLTEpIHtcbiAgICAgICAgXy5lYWNoKG1vZGVsLml0ZW1zLCBmdW5jdGlvbiAoaXRlbSwgaW5kZXgpIHtcbiAgICAgICAgICB2YXIgc1BhdGggPSBwYXRoLmNvbmNhdCgnaXRlbXMnLCBpbmRleC50b1N0cmluZygpKTtcblxuICAgICAgICAgIHByb2Nlc3NNb2RlbChzcGVjLCBtb2RlbHNNZXRhZGF0YSwgaXRlbSwgdG9Kc29uUG9pbnRlcihzUGF0aCksIHNQYXRoLCByZXN1bHRzKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgXy5lYWNoKG1vZGVsLnByb3BlcnRpZXMsIGZ1bmN0aW9uIChwcm9wZXJ0eSwgbmFtZSkge1xuICAgICAgdmFyIHBQYXRoID0gcGF0aC5jb25jYXQoJ3Byb3BlcnRpZXMnLCBuYW1lKTtcblxuICAgICAgLy8gS2VlcCB0cmFjayBvZiBtb2RlbCByZWZlcmVuY2VzIGluICRyZWYsIGl0ZW1zLiRyZWZcbiAgICAgIGlmIChwcm9wZXJ0eS4kcmVmKSB7XG4gICAgICAgIGlmICghaXNSZW1vdGVSZWYocHJvcGVydHkuJHJlZikpIHtcbiAgICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCByZWZUb0pzb25Qb2ludGVyKHByb3BlcnR5LiRyZWYpKS5yZWZzLnB1c2gocFBhdGguY29uY2F0KFsnJHJlZiddKSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkudHlwZSA9PT0gJ2FycmF5Jykge1xuICAgICAgICB2YWxpZGF0ZUFycmF5VHlwZShwcm9wZXJ0eSwgcFBhdGgsIHJlc3VsdHMuZXJyb3JzKTtcblxuICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQocHJvcGVydHkuaXRlbXMpICYmICFfLmlzVW5kZWZpbmVkKHByb3BlcnR5Lml0ZW1zLiRyZWYpICYmXG4gICAgICAgICAgICAgICFpc1JlbW90ZVJlZihwcm9wZXJ0eS5pdGVtcy4kcmVmKSkge1xuICAgICAgICAgIGdldE1vZGVsTWV0YWRhdGEobW9kZWxzTWV0YWRhdGEsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByZWZUb0pzb25Qb2ludGVyKHByb3BlcnR5Lml0ZW1zLiRyZWYpKS5yZWZzLnB1c2gocFBhdGguY29uY2F0KFsnaXRlbXMnLCAnJHJlZiddKSk7XG4gICAgICAgIH0gZWxzZSBpZiAoIV8uaXNVbmRlZmluZWQocHJvcGVydHkuaXRlbXMpICYmICFfLmlzVW5kZWZpbmVkKHByb3BlcnR5Lml0ZW1zLnR5cGUpICYmXG4gICAgICAgICAgICAgICAgICAgICBzcGVjLnByaW1pdGl2ZXMuaW5kZXhPZihwcm9wZXJ0eS5pdGVtcy50eXBlKSA9PT0gLTEpIHtcbiAgICAgICAgICBfLmVhY2gocHJvcGVydHkuaXRlbXMsIGZ1bmN0aW9uIChzY2hlbWEsIGluZGV4KSB7XG4gICAgICAgICAgICB2YXIgc1BhdGggPSBwUGF0aC5jb25jYXQoJ2l0ZW1zJywgaW5kZXgudG9TdHJpbmcoKSk7XG5cbiAgICAgICAgICAgIHByb2Nlc3NNb2RlbChzcGVjLCBtb2RlbHNNZXRhZGF0YSwgc2NoZW1hLCB0b0pzb25Qb2ludGVyKHNQYXRoKSwgc1BhdGgsIHJlc3VsdHMpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBBZGQgc2VsZiByZWZlcmVuY2UgdG8gYWxsIG1vZGVsIGRlZmluaXRpb25zIG91dHNpZGUgb2YgIy9kZWZpbml0aW9ucyAoVGhleSBhcmUgaW5saW5lIG1vZGVscyBvciByZWZlcmVuY2VzKVxuICAgIGlmICh0b0pzb25Qb2ludGVyKHBhdGgpLmluZGV4T2YoJyMvZGVmaW5pdGlvbnMvJykgPT09IC0xKSB7XG4gICAgICBtZXRhZGF0YS5yZWZzLnB1c2gocGF0aCk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG4gIH1cbn07XG5cbnZhciBnZXRNb2RlbHNNZXRhZGF0YSA9IGZ1bmN0aW9uIGdldE1vZGVsc01ldGFkYXRhIChzcGVjLCBhcGlET3JTTywgcmVzdWx0cykge1xuICB2YXIgY2lyY3VsYXIgPSB7fTtcbiAgdmFyIGxvY2FsUmVzdWx0cyA9IHtcbiAgICBlcnJvcnM6IFtdLFxuICAgIHdhcm5pbmdzOiBbXVxuICB9O1xuICB2YXIgcmVzb2x2ZWQgPSB7fTtcbiAgdmFyIHVucmVzb2x2ZWQgPSB7fTtcbiAgdmFyIGFkZE1vZGVsUHJvcHMgPSBmdW5jdGlvbiBhZGRNb2RlbFByb3BzIChtb2RlbElkLCBjb21wb3NlZCkge1xuICAgIHZhciBtb2RlbCA9IG1vZGVsc01ldGFkYXRhW21vZGVsSWRdLnNjaGVtYTtcblxuICAgIGlmIChtb2RlbCkge1xuICAgICAgXy5lYWNoKG1vZGVsLnByb3BlcnRpZXMsIGZ1bmN0aW9uIChwcm9wLCBwcm9wTmFtZSkge1xuICAgICAgICB2YXIgbmV3UHJvcCA9IF8uY2xvbmVEZWVwKHByb3ApO1xuXG4gICAgICAgIGlmIChjb21wb3NlZC5wcm9wZXJ0aWVzW3Byb3BOYW1lXSkge1xuICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdDSElMRF9NT0RFTF9SRURFQ0xBUkVTX1BST1BFUlRZJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQ2hpbGQgbW9kZWwgZGVjbGFyZXMgcHJvcGVydHkgYWxyZWFkeSBkZWNsYXJlZCBieSBhbmNlc3RvcjogJyArIHByb3BOYW1lLCBwcm9wLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNwZWMudmVyc2lvbiA9PT0gJzEuMicgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydtb2RlbHMnLCBtb2RlbElkLCAncHJvcGVydGllcycsIHByb3BOYW1lXSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbElkLnN1YnN0cmluZygyKS5zcGxpdCgnLycpLmNvbmNhdCgncHJvcGVydGllcycsIHByb3BOYW1lKSwgbG9jYWxSZXN1bHRzLmVycm9ycyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHNwZWMudmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICAgICAgICAgIC8vIFNhbml0aXplIHRoZSBtYXhpbXVtL21pbmltdW0gdmFsdWVzIHRvIGJlIG51bWJlcnNcbiAgICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChuZXdQcm9wLm1heGltdW0pKSB7XG4gICAgICAgICAgICAgIG5ld1Byb3AubWF4aW11bSA9IHBhcnNlRmxvYXQobmV3UHJvcC5tYXhpbXVtKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKG5ld1Byb3AubWluaW11bSkpIHtcbiAgICAgICAgICAgICAgbmV3UHJvcC5taW5pbXVtID0gcGFyc2VGbG9hdChuZXdQcm9wLm1pbmltdW0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb21wb3NlZC5wcm9wZXJ0aWVzW3Byb3BOYW1lXSA9IG5ld1Byb3A7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBpZiAoIV8uaXNVbmRlZmluZWQobW9kZWwucmVxdWlyZWQpICYmIF8uaXNVbmRlZmluZWQoY29tcG9zZWQucmVxdWlyZWQpKSB7XG4gICAgICAgIGNvbXBvc2VkLnJlcXVpcmVkID0gW107XG4gICAgICB9XG5cbiAgICAgIF8uZWFjaChtb2RlbC5yZXF1aXJlZCwgZnVuY3Rpb24gKHByb3BOYW1lKSB7XG4gICAgICAgIGlmIChjb21wb3NlZC5yZXF1aXJlZC5pbmRleE9mKHByb3BOYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgICBjb21wb3NlZC5yZXF1aXJlZC5wdXNoKHByb3BOYW1lKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9O1xuICB2YXIgZ2V0UGF0aCA9IGZ1bmN0aW9uIGdldFBhdGggKHBhcmVudCwgdW5yZXNvbHZlZCkge1xuICAgIHZhciBwYXJlbnRWaXNpdGVkID0gZmFsc2U7XG5cbiAgICByZXR1cm4gT2JqZWN0LmtleXModW5yZXNvbHZlZCkuZmlsdGVyKGZ1bmN0aW9uIChkZXApIHtcbiAgICAgIGlmIChkZXAgPT09IHBhcmVudCkge1xuICAgICAgICBwYXJlbnRWaXNpdGVkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBwYXJlbnRWaXNpdGVkICYmIHVucmVzb2x2ZWRbZGVwXTtcbiAgICB9KTtcbiAgfTtcbiAgdmFyIHJlc29sdmVyID0gZnVuY3Rpb24gcmVzb2x2ZXIgKG1vZGVsSWQsIGNpcmN1bGFyLCByZXNvbHZlZCwgdW5yZXNvbHZlZCwgY29tcG9zZWQpIHtcbiAgICB2YXIgbWV0YWRhdGEgPSBtb2RlbHNNZXRhZGF0YVttb2RlbElkXTtcbiAgICB2YXIgbW9kZWwgPSBtZXRhZGF0YS5zY2hlbWE7XG5cbiAgICB1bnJlc29sdmVkW21vZGVsSWRdID0gdHJ1ZTtcblxuICAgIGlmICghXy5pc1VuZGVmaW5lZChtb2RlbCkpIHtcbiAgICAgIC8vIDEuMiBkb2VzIG5vdCBhbGxvdyBtdWx0aXBsZSBpbmhlcml0YW5jZSB3aGlsZSAyLjArIGRvZXNcbiAgICAgIGlmIChtZXRhZGF0YS5wYXJlbnRzLmxlbmd0aCA+IDEgJiYgc3BlYy52ZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTVVMVElQTEVfTU9ERUxfSU5IRVJJVEFOQ0UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQ2hpbGQgbW9kZWwgaXMgc3ViIHR5cGUgb2YgbXVsdGlwbGUgbW9kZWxzOiAnICsgbWV0YWRhdGEucGFyZW50cy5qb2luKCcgJiYgJyksIG1vZGVsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ21vZGVscycsIG1vZGVsSWRdLCBsb2NhbFJlc3VsdHMuZXJyb3JzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIF8uZWFjaChtZXRhZGF0YS5wYXJlbnRzLCBmdW5jdGlvbiAoZGVwKSB7XG4gICAgICAgICAgaWYgKCFyZXNvbHZlZFtkZXBdKSB7XG4gICAgICAgICAgICBpZiAodW5yZXNvbHZlZFtkZXBdKSB7XG4gICAgICAgICAgICAgIGNpcmN1bGFyW21vZGVsSWRdID0gZ2V0UGF0aChkZXAsIHVucmVzb2x2ZWQpO1xuXG4gICAgICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdDWUNMSUNBTF9NT0RFTF9JTkhFUklUQU5DRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdNb2RlbCBoYXMgYSBjaXJjdWxhciBpbmhlcml0YW5jZTogJyArIG1vZGVsSWQgKyAnIC0+ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNpcmN1bGFyW21vZGVsSWRdLmpvaW4oJyAtPiAnKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3BlYy52ZXJzaW9uID09PSAnMS4yJyA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWwuc3ViVHlwZXMgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsLmFsbE9mLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcGVjLnZlcnNpb24gPT09ICcxLjInID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ21vZGVscycsIG1vZGVsSWQsICdzdWJUeXBlcyddIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbElkLnN1YnN0cmluZygyKS5zcGxpdCgnLycpLmNvbmNhdCgnYWxsT2YnKSwgbG9jYWxSZXN1bHRzLmVycm9ycyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERvIG5vdCByZXNvbHZlIGlmIGNpcmN1bGFyXG4gICAgICAgICAgICBpZiAoIWNpcmN1bGFyW21vZGVsSWRdKSB7XG4gICAgICAgICAgICAgIHJlc29sdmVyKGRlcCwgY2lyY3VsYXIsIHJlc29sdmVkLCB1bnJlc29sdmVkLCBjb21wb3NlZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gRG8gbm90IGFkZCBwcm9wZXJ0aWVzIGlmIGNpcmN1bGFyXG4gICAgICAgICAgaWYgKCFjaXJjdWxhclttb2RlbElkXSkge1xuICAgICAgICAgICAgYWRkTW9kZWxQcm9wcyhkZXAsIGNvbXBvc2VkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJlc29sdmVkW21vZGVsSWRdID0gdHJ1ZTtcbiAgICB1bnJlc29sdmVkW21vZGVsSWRdID0gZmFsc2U7XG4gIH07XG4gIHZhciBoYXNoID0gbWQ1Lmhhc2goSlNPTi5zdHJpbmdpZnkoYXBpRE9yU08pKTtcbiAgdmFyIG1ldGFkYXRhRW50cnkgPSBtZXRhZGF0YUNhY2hlW2hhc2hdO1xuICB2YXIgbW9kZWxzTWV0YWRhdGE7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQobWV0YWRhdGFFbnRyeSkpIHtcbiAgICBtZXRhZGF0YUVudHJ5ID0gbWV0YWRhdGFDYWNoZVtoYXNoXSA9IHtcbiAgICAgIG1ldGFkYXRhOiB7fSxcbiAgICAgIHJlc3VsdHM6IGxvY2FsUmVzdWx0c1xuICAgIH07XG5cbiAgICBtb2RlbHNNZXRhZGF0YSA9IG1ldGFkYXRhRW50cnkubWV0YWRhdGE7XG5cbiAgICBzd2l0Y2ggKHNwZWMudmVyc2lvbikge1xuICAgIGNhc2UgJzEuMic6XG4gICAgICBfLnJlZHVjZShhcGlET3JTTy5tb2RlbHMsIGZ1bmN0aW9uIChzZWVuTW9kZWxJZHMsIG1vZGVsLCBtb2RlbE5hbWUpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgdGhlIG1vZGVsIGlzIG5vdCBhbHJlYWR5IGRlZmluZWQgKGJ5IGlkKVxuICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2Vlbk1vZGVsSWRzLCBtb2RlbC5pZCwgJ01PREVMX0RFRklOSVRJT04nLCAnTW9kZWwnLCBbJ21vZGVscycsIG1vZGVsTmFtZSwgJ2lkJ10sXG4gICAgICAgICAgICAgICAgICAgICAgICBsb2NhbFJlc3VsdHMuZXJyb3JzKTtcblxuICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIG1vZGVsLCBtb2RlbC5pZCwgWydtb2RlbHMnLCBtb2RlbE5hbWVdLCBsb2NhbFJlc3VsdHMpO1xuXG4gICAgICAgIHJldHVybiBzZWVuTW9kZWxJZHMuY29uY2F0KG1vZGVsLmlkKTtcbiAgICAgIH0sIFtdKTtcblxuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICcyLjAnOlxuICAgICAgLy8gRmluZCBtb2RlbHMgZGVmaW5lZC9yZWZlcmVuY2VkIGluICMvZGVmaW5pdGlvbnNcbiAgICAgIF8uZWFjaChhcGlET3JTTy5kZWZpbml0aW9ucywgZnVuY3Rpb24gKG1vZGVsLCBtb2RlbElkKSB7XG4gICAgICAgIHZhciBkUGF0aCA9IFsnZGVmaW5pdGlvbnMnLCBtb2RlbElkXTtcblxuICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIG1vZGVsLCB0b0pzb25Qb2ludGVyKGRQYXRoKSwgZFBhdGgsIGxvY2FsUmVzdWx0cyk7XG4gICAgICB9KTtcblxuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgLy8gQ29tcG9zZSBtb2RlbHMgYW5kIGlkZW50aWZ5IGluaGVyaXRhbmNlIGlzc3Vlc1xuICAgIF8uZWFjaChtb2RlbHNNZXRhZGF0YSwgZnVuY3Rpb24gKG1ldGFkYXRhLCBtb2RlbElkKSB7XG4gICAgICBtZXRhZGF0YS5jb21wb3NlZCA9IHtcbiAgICAgICAgdGl0bGU6ICdDb21wb3NlZCAnICsgbW9kZWxJZCxcbiAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgIHByb3BlcnRpZXM6IHt9XG4gICAgICB9O1xuXG4gICAgICBpZiAoIV8uaXNVbmRlZmluZWQobWV0YWRhdGEuc2NoZW1hKSkge1xuICAgICAgICByZXNvbHZlcihtb2RlbElkLCBjaXJjdWxhciwgcmVzb2x2ZWQsIHVucmVzb2x2ZWQsIG1ldGFkYXRhLmNvbXBvc2VkKTtcbiAgICAgICAgYWRkTW9kZWxQcm9wcyhtb2RlbElkLCBtZXRhZGF0YS5jb21wb3NlZCk7XG4gICAgICB9XG5cbiAgICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIHByb3BlcnRpZXNcbiAgICAgIGlmICghXy5pc1VuZGVmaW5lZChtZXRhZGF0YS5zY2hlbWEpICYmICFfLmlzVW5kZWZpbmVkKG1ldGFkYXRhLnNjaGVtYS5yZXF1aXJlZCkpIHtcbiAgICAgICAgXy5lYWNoKG1ldGFkYXRhLnNjaGVtYS5yZXF1aXJlZCwgZnVuY3Rpb24gKHByb3BOYW1lLCBpbmRleCkge1xuICAgICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKG1ldGFkYXRhLmNvbXBvc2VkLnByb3BlcnRpZXNbcHJvcE5hbWVdKSkge1xuICAgICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01JU1NJTkdfUkVRVUlSRURfTU9ERUxfUFJPUEVSVFknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ01vZGVsIHJlcXVpcmVzIHByb3BlcnR5IGJ1dCBpdCBpcyBub3QgZGVmaW5lZDogJyArIHByb3BOYW1lLCBwcm9wTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldGFkYXRhLnBhdGguY29uY2F0KFsncmVxdWlyZWQnLCBpbmRleC50b1N0cmluZygpXSksIHJlc3VsdHMuZXJyb3JzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gUmVzb2x2ZSByZWZlcmVuY2VzXG4gICAgXy5lYWNoKG1vZGVsc01ldGFkYXRhLCBmdW5jdGlvbiAobWV0YWRhdGEpIHtcbiAgICAgIHZhciByZWZzID0gdHJhdmVyc2UobWV0YWRhdGEuY29tcG9zZWQpLnJlZHVjZShmdW5jdGlvbiAoYWNjKSB7XG4gICAgICAgIGlmICh0aGlzLmtleSA9PT0gJyRyZWYnKSB7XG4gICAgICAgICAgYWNjW3RvSnNvblBvaW50ZXIodGhpcy5wYXRoKV0gPSBzcGVjLnZlcnNpb24gPT09ICcxLjInID8gdGhpcy5ub2RlIDogcmVmVG9Kc29uUG9pbnRlcih0aGlzLm5vZGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH0sIHt9KTtcblxuICAgICAgXy5lYWNoKHJlZnMsIGZ1bmN0aW9uIChtb2RlbElkLCBwYXRoUHRyKSB7XG4gICAgICAgIHZhciBwYXRoID0gcGF0aFB0ci5zdWJzdHJpbmcoMikuc3BsaXQoJy8nKTtcbiAgICAgICAgdmFyIHJlZk1vZGVsID0gXy5pc1VuZGVmaW5lZChtb2RlbHNNZXRhZGF0YVttb2RlbElkXSkgP1xuICAgICAgICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgXy5jbG9uZURlZXAobW9kZWxzTWV0YWRhdGFbbW9kZWxJZF0uY29tcG9zZWQpO1xuXG4gICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChyZWZNb2RlbCkpIHtcbiAgICAgICAgICBkZWxldGUgcmVmTW9kZWwuaWQ7XG4gICAgICAgICAgZGVsZXRlIHJlZk1vZGVsLnRpdGxlO1xuXG4gICAgICAgICAgdHJhdmVyc2UobWV0YWRhdGEuY29tcG9zZWQpLnNldChwYXRoLnNsaWNlKDAsIHBhdGgubGVuZ3RoIC0gMSksIHJlZk1vZGVsKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBNZXJnZSByZXN1bHRzXG4gICAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlc3VsdHMpKSB7XG4gICAgICBfLmVhY2gobG9jYWxSZXN1bHRzLCBmdW5jdGlvbiAoZW50cmllcywgZGVzdE5hbWUpIHtcbiAgICAgICAgcmVzdWx0c1tkZXN0TmFtZV0gPSByZXN1bHRzW2Rlc3ROYW1lXS5jb25jYXQoZW50cmllcyk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbWV0YWRhdGFFbnRyeTtcbn07XG5cbnZhciB2YWxpZGF0ZVdpdGhTY2hlbWEgPSBmdW5jdGlvbiB2YWxpZGF0ZVdpdGhTY2hlbWEgKHNwZWMsIHNjaGVtYU5hbWUsIGRhdGEpIHtcbiAgdmFyIHZhbGlkYXRvciA9IHNwZWMudmFsaWRhdG9yc1tzY2hlbWFOYW1lXTtcbiAgdmFyIHNjaGVtYSA9IHZhbGlkYXRvci5zY2hlbWFbc2NoZW1hTmFtZV07XG4gIHZhciByZXN1bHQgPSB2YWxpZGF0b3IudmFsaWRhdGUoc2NoZW1hLCBkYXRhKTtcbiAgdmFyIHJlc3BvbnNlID0ge1xuICAgIGVycm9yczogW10sXG4gICAgd2FybmluZ3M6IFtdXG4gIH07XG5cbiAgaWYgKHJlc3VsdCkge1xuICAgIHJlc3BvbnNlID0ge1xuICAgICAgZXJyb3JzOiB2YWxpZGF0b3IuamUoc2NoZW1hLCBkYXRhLCByZXN1bHQsIGpqdmVPcHRpb25zKSxcbiAgICAgIHdhcm5pbmdzOiBbXVxuICAgIH07XG4gIH1cblxuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG52YXIgdmFsaWRhdGVDb250ZW50ID0gZnVuY3Rpb24gdmFsaWRhdGVDb250ZW50IChzcGVjLCBybE9yU08sIGFwaURlY2xhcmF0aW9ucykge1xuICB2YXIgcmVzcG9uc2UgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcbiAgdmFyIGF1dGhEZWZzID0ge307IC8vICgxLjIpXG4gIHZhciBhdXRoUmVmcyA9IHt9OyAvLyAoMS4yKVxuICB2YXIgcGF0aERlZnMgPSBbXTsgLy8gKDEuMilcbiAgdmFyIHBhdGhSZWZzID0gW107IC8vICgxLjIpXG5cbiAgc3dpdGNoIChzcGVjLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBCdWlsZCBwYXRoIG1vZGVsXG4gICAgXy5lYWNoKHJsT3JTTy5hcGlzLCBmdW5jdGlvbiAoYXBpLCBpbmRleCkge1xuICAgICAgLy8gVmFsaWRhdGUgZHVwbGljYXRlIHJlc291cmNlIHBhdGhzXG4gICAgICB2YWxpZGF0ZU5vRXhpc3QocGF0aERlZnMsIGFwaS5wYXRoLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJywgWydhcGlzJywgaW5kZXgudG9TdHJpbmcoKSwgJ3BhdGgnXSxcbiAgICAgICAgICAgICAgICAgICAgICByZXNwb25zZS5lcnJvcnMpO1xuXG4gICAgICBpZiAocGF0aERlZnMuaW5kZXhPZihhcGkucGF0aCkgPT09IC0xKSB7XG4gICAgICAgIHBhdGhEZWZzLnB1c2goYXBpLnBhdGgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLmVycm9ycy5sZW5ndGggPT09IDApIHtcbiAgICAgIC8vIEJ1aWxkIHRoZSBhdXRob3JpemF0aW9uIG1vZGVsXG4gICAgICBfLmVhY2gocmxPclNPLmF1dGhvcml6YXRpb25zLCBmdW5jdGlvbiAoYXV0aG9yaXphdGlvbiwgbmFtZSkge1xuICAgICAgICBhdXRoRGVmc1tuYW1lXSA9IF8ubWFwKGF1dGhvcml6YXRpb24uc2NvcGVzLCBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgICByZXR1cm4gc2NvcGUuc2NvcGU7XG4gICAgICAgIH0pO1xuICAgICAgfSwge30pO1xuXG4gICAgICByZXNwb25zZS5hcGlEZWNsYXJhdGlvbnMgPSBbXTtcblxuICAgICAgLy8gVmFsaWRhdGUgdGhlIEFQSSBkZWNsYXJhdGlvbnNcbiAgICAgIF8uZWFjaChhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChhcGlEZWNsYXJhdGlvbiwgaW5kZXgpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IHJlc3BvbnNlLmFwaURlY2xhcmF0aW9uc1tpbmRleF0gPSB7XG4gICAgICAgICAgZXJyb3JzOiBbXSxcbiAgICAgICAgICB3YXJuaW5nczogW11cbiAgICAgICAgfTtcbiAgICAgICAgdmFyIGFwaUF1dGhEZWZzID0ge307XG4gICAgICAgIHZhciBhcGlBdXRoUmVmcyA9IHt9O1xuICAgICAgICB2YXIgbW9kZWxzTWV0YWRhdGEgPSBnZXRNb2RlbHNNZXRhZGF0YShzcGVjLCBhcGlEZWNsYXJhdGlvbiwgcmVzdWx0KS5tZXRhZGF0YTtcbiAgICAgICAgdmFyIGFkZE1vZGVsUmVmID0gZnVuY3Rpb24gYWRkTW9kZWxSZWYgKG1vZGVsSWQsIG1vZGVsUmVmKSB7XG4gICAgICAgICAgdmFyIG1ldGFkYXRhID0gZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgbW9kZWxJZCk7XG5cbiAgICAgICAgICBtZXRhZGF0YS5yZWZzLnB1c2gobW9kZWxSZWYpO1xuICAgICAgICB9O1xuICAgICAgICB2YXIgYWRkU2NvcGVSZWYgPSBmdW5jdGlvbiBhZGRTY29wZVJlZiAoYXV0aElkLCBzY29wZUlkKSB7XG4gICAgICAgICAgdmFyIGF1dGg7XG5cbiAgICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQoYXBpQXV0aERlZnNbYXV0aElkXSkpIHtcbiAgICAgICAgICAgIC8vIExvY2FsIGF1dGggZGVmaW5pdGlvblxuICAgICAgICAgICAgYXV0aCA9IGFwaUF1dGhSZWZzW2F1dGhJZF07XG5cbiAgICAgICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKGF1dGgpKSB7XG4gICAgICAgICAgICAgIGF1dGggPSBhcGlBdXRoUmVmc1thdXRoSWRdID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEdsb2JhbCAoT3IgbWlzc2luZyBpbiB3aGljaCBjYXNlIHdlJ2xsIGFzc3VtZSBnbG9iYWwpXG4gICAgICAgICAgICBhdXRoID0gYXV0aFJlZnNbYXV0aElkXTtcblxuICAgICAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQoYXV0aCkpIHtcbiAgICAgICAgICAgICAgYXV0aCA9IGF1dGhSZWZzW2F1dGhJZF0gPSBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoYXV0aC5pbmRleE9mKHNjb3BlSWQpID09PSAtMSkge1xuICAgICAgICAgICAgYXV0aC5wdXNoKHNjb3BlSWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICAvLyBCdWlsZCB0aGUgYXV0aG9yaXphdGlvbiBtb2RlbFxuICAgICAgICBfLmVhY2goYXBpRGVjbGFyYXRpb24uYXV0aG9yaXphdGlvbnMsIGZ1bmN0aW9uIChhdXRob3JpemF0aW9uLCBuYW1lKSB7XG4gICAgICAgICAgYXBpQXV0aERlZnNbbmFtZV0gPSBfLm1hcChhdXRob3JpemF0aW9uLnNjb3BlcywgZnVuY3Rpb24gKHNjb3BlKSB7XG4gICAgICAgICAgICByZXR1cm4gc2NvcGUuc2NvcGU7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0sIHt9KTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aFxuICAgICAgICB2YWxpZGF0ZU5vRXhpc3QocGF0aFJlZnMsIGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsIFsncmVzb3VyY2VQYXRoJ10sXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQuZXJyb3JzKTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBtaXNzaW5nIHJlc291cmNlIHBhdGggZGVmaW5pdGlvblxuICAgICAgICB2YWxpZGF0ZUV4aXN0KHBhdGhEZWZzLCBhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLCBbJ3Jlc291cmNlUGF0aCddLFxuICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5lcnJvcnMpO1xuXG4gICAgICAgIC8vIEtlZXAgdHJhY2sgb2YgdGhlIHNlZW4gcGF0aHNcbiAgICAgICAgaWYgKHBhdGhSZWZzLmluZGV4T2YoYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoKSA9PT0gLTEpIHtcbiAgICAgICAgICBwYXRoUmVmcy5wdXNoKGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBWYWxpZGF0ZSBjb25zdW1lcy9wcm9kdWNlcyB1bmlxdWVuZXNzXG4gICAgICAgIF8uZWFjaChbJ2NvbnN1bWVzJywgJ3Byb2R1Y2VzJ10sIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgICAgdmFsaWRhdGVOb0R1cGxpY2F0ZXMoYXBpRGVjbGFyYXRpb25bbmFtZV0sICdBUElfJyArIG5hbWUudG9VcHBlckNhc2UoKSwgJ0FQSScsIFtuYW1lXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQud2FybmluZ3MpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBWYWxkYXRlIEFQSXNcbiAgICAgICAgXy5yZWR1Y2UoYXBpRGVjbGFyYXRpb24uYXBpcywgZnVuY3Rpb24gKHNlZW5BcGlQYXRocywgYXBpLCBpbmRleCkge1xuICAgICAgICAgIHZhciBhUGF0aCA9IFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCldO1xuICAgICAgICAgIHZhciBuUGF0aCA9IG5vcm1hbGl6ZVBhdGgoYXBpLnBhdGgpO1xuICAgICAgICAgIHZhciBzUGFyYW1zID0gW107XG5cbiAgICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aFxuICAgICAgICAgIGlmIChzZWVuQXBpUGF0aHMuaW5kZXhPZihuUGF0aC5wYXRoKSA+IC0xKSB7XG4gICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFX0FQSV9QQVRIJywgJ0FQSSBwYXRoIChvciBlcXVpdmFsZW50KSBhbHJlYWR5IGRlZmluZWQ6ICcgKyBhcGkucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFwaS5wYXRoLCBhUGF0aC5jb25jYXQoJ3BhdGgnKSwgcmVzdWx0LmVycm9ycyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gVmFsaWRhdGUgb3BlcmF0aW9uc1xuICAgICAgICAgIF8ucmVkdWNlKGFwaS5vcGVyYXRpb25zLCBmdW5jdGlvbiAoc2Vlbk1ldGhvZHMsIG9wZXJhdGlvbiwgaW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBvUGF0aCA9IGFQYXRoLmNvbmNhdChbJ29wZXJhdGlvbnMnLCBpbmRleC50b1N0cmluZygpXSk7XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIGNvbnN1bWVzL3Byb2R1Y2VzIHVuaXF1ZW5lc3NcbiAgICAgICAgICAgIF8uZWFjaChbJ2NvbnN1bWVzJywgJ3Byb2R1Y2VzJ10sIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgICAgICAgIHZhbGlkYXRlTm9EdXBsaWNhdGVzKG9wZXJhdGlvbltuYW1lXSwgJ09QRVJBVElPTl8nICsgbmFtZS50b1VwcGVyQ2FzZSgpLCAnT3BlcmF0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb1BhdGguY29uY2F0KG5hbWUpLCByZXN1bHQud2FybmluZ3MpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIHVuaXF1ZSBtZXRob2RcbiAgICAgICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuTWV0aG9kcywgb3BlcmF0aW9uLm1ldGhvZCwgJ09QRVJBVElPTl9NRVRIT0QnLCAnT3BlcmF0aW9uIG1ldGhvZCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb1BhdGguY29uY2F0KCdtZXRob2QnKSwgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIGF1dGhvcml6YXRpb25zXG4gICAgICAgICAgICBfLmVhY2gob3BlcmF0aW9uLmF1dGhvcml6YXRpb25zLCBmdW5jdGlvbiAoc2NvcGVzLCBuYW1lKSB7XG4gICAgICAgICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgYXV0aG9yaXphdGlvblxuICAgICAgICAgICAgICB2YWxpZGF0ZUV4aXN0KF8udW5pcShPYmplY3Qua2V5cyhhcGlBdXRoRGVmcykuY29uY2F0KE9iamVjdC5rZXlzKGF1dGhEZWZzKSkpLCBuYW1lLCAnQVVUSE9SSVpBVElPTicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24nLCBvUGF0aC5jb25jYXQoWydhdXRob3JpemF0aW9ucycsIG5hbWVdKSwgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgbWlzc2luZyBhdXRob3JpemF0aW9uIHNjb3BlcyAoT25seSB3aGVuIHRoZSBhdXRob3JpemF0aW9uIGlzIG5vdCBtaXNzaW5nKVxuICAgICAgICAgICAgICBfLmVhY2goc2NvcGVzLCBmdW5jdGlvbiAoc2NvcGUsIGluZGV4KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKGFwaUF1dGhEZWZzW25hbWVdKSB8fCAhXy5pc1VuZGVmaW5lZChhdXRoRGVmc1tuYW1lXSkpIHtcbiAgICAgICAgICAgICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgYXV0aG9yaXphdGlvbiBzY29wZVxuICAgICAgICAgICAgICAgICAgdmFsaWRhdGVFeGlzdChfLnVuaXEoKGFwaUF1dGhEZWZzW25hbWVdIHx8IFtdKS5jb25jYXQoYXV0aERlZnNbbmFtZV0gfHwgW10pKSwgc2NvcGUuc2NvcGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBVVRIT1JJWkFUSU9OX1NDT1BFJywgJ0F1dGhvcml6YXRpb24gc2NvcGUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQoWydhdXRob3JpemF0aW9ucycsIG5hbWUsIGluZGV4LnRvU3RyaW5nKCksICdzY29wZSddKSwgcmVzdWx0LmVycm9ycyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgYWRkU2NvcGVSZWYobmFtZSwgc2NvcGUuc2NvcGUpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSBwYXJhbWV0ZXJzXG4gICAgICAgICAgICBfLnJlZHVjZShvcGVyYXRpb24ucGFyYW1ldGVycywgZnVuY3Rpb24gKHNlZW5QYXJhbWV0ZXJzLCBwYXJhbWV0ZXIsIGluZGV4KSB7XG4gICAgICAgICAgICAgIHZhciBwUGF0aCA9IG9QYXRoLmNvbmNhdCgncGFyYW1ldGVycycsIGluZGV4LnRvU3RyaW5nKCkpO1xuXG4gICAgICAgICAgICAgIHZhbGlkYXRlQXJyYXlUeXBlKHBhcmFtZXRlciwgcFBhdGgsIHJlc3VsdC5lcnJvcnMpO1xuXG4gICAgICAgICAgICAgIC8vIEFkZCBtb2RlbCByZWZlcmVuY2VzIGZyb20gcGFyYW1ldGVyIHR5cGUvaXRlbXNcbiAgICAgICAgICAgICAgaWYgKHNwZWMucHJpbWl0aXZlcy5pbmRleE9mKHBhcmFtZXRlci50eXBlKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBhZGRNb2RlbFJlZihwYXJhbWV0ZXIudHlwZSwgb1BhdGguY29uY2F0KFsncGFyYW1ldGVycycsIGluZGV4LnRvU3RyaW5nKCksICd0eXBlJ10pKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChwYXJhbWV0ZXIudHlwZSA9PT0gJ2FycmF5JyAmJiAhXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIuaXRlbXMpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAhXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIuaXRlbXMuJHJlZikpIHtcbiAgICAgICAgICAgICAgICBhZGRNb2RlbFJlZihwYXJhbWV0ZXIuaXRlbXMuJHJlZiwgcFBhdGguY29uY2F0KFsnaXRlbXMnLCAnJHJlZiddKSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcGFyYW1ldGVyIG5hbWVcbiAgICAgICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5QYXJhbWV0ZXJzLCBwYXJhbWV0ZXIubmFtZSwgJ09QRVJBVElPTl9QQVJBTUVURVInLCAnT3BlcmF0aW9uIHBhcmFtZXRlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ25hbWUnKSwgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgICAgICAgLy8gS2VlcCB0cmFjayBvZiBwYXRoIHBhcmFtZXRlcnNcbiAgICAgICAgICAgICAgaWYgKHBhcmFtZXRlci5wYXJhbVR5cGUgPT09ICdwYXRoJykge1xuICAgICAgICAgICAgICAgIGlmIChuUGF0aC5hcmdzLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV9BUElfUEFUSF9QQVJBTUVURVInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0FQSSBwYXRoIHBhcmFtZXRlciBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBwYXJhbWV0ZXIubmFtZSwgcGFyYW1ldGVyLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ25hbWUnKSwgcmVzdWx0LmVycm9ycyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHNQYXJhbXMuaW5kZXhPZihwYXJhbWV0ZXIubmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICBzUGFyYW1zLnB1c2gocGFyYW1ldGVyLm5hbWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIuZGVmYXVsdFZhbHVlKSkge1xuICAgICAgICAgICAgICAgIC8vIFZhbGlkYXRlIGRlZmF1bHQgdmFsdWUgYWdhaW5zdCBjb25zdHJhaW50c1xuICAgICAgICAgICAgICAgIHZhbGlkYXRlUGFyYW1ldGVyQ29uc3RyYWludHMoc3BlYywgcGFyYW1ldGVyLCBwYXJhbWV0ZXIuZGVmYXVsdFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb1BhdGguY29uY2F0KCdwYXJhbWV0ZXJzJywgaW5kZXgudG9TdHJpbmcoKSwgJ2RlZmF1bHRWYWx1ZScpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LmVycm9ycyk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gc2VlblBhcmFtZXRlcnMuY29uY2F0KHBhcmFtZXRlci5uYW1lKTtcbiAgICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgICAgLy8gVmFsaWRhdGUgbWlzc2luZyBwYXRoIHBhcmFtZXRlcnMgKGluIHBhdGggYnV0IG5vdCBpbiBvcGVyYXRpb24ucGFyYW1ldGVycylcbiAgICAgICAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoblBhdGguYXJncywgc1BhcmFtcyksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01JU1NJTkdfQVBJX1BBVEhfUEFSQU1FVEVSJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0FQSSByZXF1aXJlcyBwYXRoIHBhcmFtZXRlciBidXQgaXQgaXMgbm90IGRlZmluZWQ6ICcgKyB1bnVzZWQsIGFwaS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhUGF0aC5jb25jYXQoJ3BhdGgnKSwgcmVzdWx0LmVycm9ycyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gVmFsaWRhdGUgdW5pcXVlIHJlc3BvbnNlIGNvZGVcbiAgICAgICAgICAgIF8ucmVkdWNlKG9wZXJhdGlvbi5yZXNwb25zZU1lc3NhZ2VzLCBmdW5jdGlvbiAoc2VlblJlc3BvbnNlQ29kZXMsIHJlc3BvbnNlTWVzc2FnZSwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5SZXNwb25zZUNvZGVzLCByZXNwb25zZU1lc3NhZ2UuY29kZSwgJ1JFU1BPTlNFX01FU1NBR0VfQ09ERScsICdSZXNwb25zZSBtZXNzYWdlIGNvZGUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb1BhdGguY29uY2F0KFsncmVzcG9uc2VNZXNzYWdlcycsIGluZGV4LnRvU3RyaW5nKCksICdjb2RlJ10pLCByZXN1bHQuZXJyb3JzKTtcblxuICAgICAgICAgICAgICAvLyBBZGQgbW9kZWwgcmVmZXJlbmNlcyBmcm9tIHJlc3BvbnNlTWVzc2FnZXMgcmVzcG9uc2VNb2RlbFxuICAgICAgICAgICAgICBpZiAocmVzcG9uc2VNZXNzYWdlLnJlc3BvbnNlTW9kZWwpIHtcbiAgICAgICAgICAgICAgICBhZGRNb2RlbFJlZihyZXNwb25zZU1lc3NhZ2UucmVzcG9uc2VNb2RlbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQoWydyZXNwb25zZU1lc3NhZ2VzJywgaW5kZXgudG9TdHJpbmcoKSwgJ3Jlc3BvbnNlTW9kZWwnXSkpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgcmV0dXJuIHNlZW5SZXNwb25zZUNvZGVzLmNvbmNhdChyZXNwb25zZU1lc3NhZ2UuY29kZSk7XG4gICAgICAgICAgICB9LCBbXSk7XG5cbiAgICAgICAgICAgIHZhbGlkYXRlQXJyYXlUeXBlKG9wZXJhdGlvbiwgb1BhdGgsIHJlc3VsdC5lcnJvcnMpO1xuXG4gICAgICAgICAgICAvLyBBZGQgbW9kZWwgcmVmZXJlbmNlcyBmcm9tIHR5cGUvaXRlbXNcbiAgICAgICAgICAgIGlmIChvcGVyYXRpb24udHlwZSA9PT0gJ2FycmF5JyAmJiAhXy5pc1VuZGVmaW5lZChvcGVyYXRpb24uaXRlbXMpICYmICFfLmlzVW5kZWZpbmVkKG9wZXJhdGlvbi5pdGVtcy4kcmVmKSkge1xuICAgICAgICAgICAgICBhZGRNb2RlbFJlZihvcGVyYXRpb24uaXRlbXMuJHJlZiwgb1BhdGguY29uY2F0KFsnaXRlbXMnLCAnJHJlZiddKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHNwZWMucHJpbWl0aXZlcy5pbmRleE9mKG9wZXJhdGlvbi50eXBlKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgYWRkTW9kZWxSZWYob3BlcmF0aW9uLnR5cGUsIG9QYXRoLmNvbmNhdChbJ3R5cGUnXSkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gc2Vlbk1ldGhvZHMuY29uY2F0KG9wZXJhdGlvbi5tZXRob2QpO1xuICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgIHJldHVybiBzZWVuQXBpUGF0aHMuY29uY2F0KG5QYXRoLnBhdGgpO1xuICAgICAgICB9LCBbXSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgbW9kZWxzXG4gICAgICAgIF8uZWFjaChtb2RlbHNNZXRhZGF0YSwgZnVuY3Rpb24gKG1ldGFkYXRhLCBtb2RlbElkKSB7XG4gICAgICAgICAgLy8gSWRlbnRpZnkgbWlzc2luZyBtb2RlbHMgKHJlZmVyZW5jZWQgYnV0IG5vdCBkZWNsYXJlZClcbiAgICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChtZXRhZGF0YS5zY2hlbWEpKSB7XG4gICAgICAgICAgICBfLmVhY2gobWV0YWRhdGEucmVmcywgZnVuY3Rpb24gKHJlZikge1xuICAgICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFX01PREVMJywgJ01vZGVsIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIG1vZGVsSWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsSWQsIHJlZiwgcmVzdWx0LmVycm9ycyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBJZGVudGlmeSB1bnVzZWQgbW9kZWxzIChkZWNsYXJlZCBidXQgbm90IHJlZmVyZW5jZWQpXG4gICAgICAgICAgaWYgKG1ldGFkYXRhLnJlZnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhtZXRhZGF0YS5zY2hlbWEsIG1vZGVsSWQsICdNT0RFTCcsICdNb2RlbCcsIFsnbW9kZWxzJywgbWV0YWRhdGEubmFtZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQud2FybmluZ3MpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdW51c2VkIGF1dGhvcml6YXRpb25zXG4gICAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoT2JqZWN0LmtleXMoYXBpQXV0aERlZnMpLCBPYmplY3Qua2V5cyhhcGlBdXRoUmVmcykpLCBmdW5jdGlvbiAodW51c2VkKSB7XG4gICAgICAgICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcoYXBpRGVjbGFyYXRpb24uYXV0aG9yaXphdGlvbnNbdW51c2VkXSwgdW51c2VkLCAnQVVUSE9SSVpBVElPTicsICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ2F1dGhvcml6YXRpb25zJywgdW51c2VkXSwgcmVzdWx0Lndhcm5pbmdzKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdW51c2VkIGF1dGhvcml6YXRpb24gc2NvcGVzXG4gICAgICAgIF8uZWFjaChhcGlBdXRoRGVmcywgZnVuY3Rpb24gKHNjb3BlcywgbmFtZSkge1xuICAgICAgICAgIHZhciBwYXRoID0gWydhdXRob3JpemF0aW9ucycsIG5hbWVdO1xuICAgICAgICAgIHZhciBhdXRoRGVmID0gYXBpRGVjbGFyYXRpb24uYXV0aG9yaXphdGlvbnNbbmFtZV07XG5cbiAgICAgICAgICBfLmVhY2goXy5kaWZmZXJlbmNlKHNjb3BlcywgYXBpQXV0aFJlZnNbbmFtZV0gfHwgW10pLCBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBzSW5kZXggPSBzY29wZXMuaW5kZXhPZihzY29wZSk7XG5cbiAgICAgICAgICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKGF1dGhEZWYuc2NvcGVzW3NJbmRleF0sIHNjb3BlLCAnQVVUSE9SSVpBVElPTl9TQ09QRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbiBzY29wZScsIHBhdGguY29uY2F0KFsnc2NvcGVzJywgc0luZGV4LnRvU3RyaW5nKCldKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC53YXJuaW5ncyk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHVudXNlZCByZXNvdXJjZXNcbiAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UocGF0aERlZnMsIHBhdGhSZWZzKSwgZnVuY3Rpb24gKHVudXNlZCkge1xuICAgICAgICB2YXIgaW5kZXggPSBfLm1hcChybE9yU08uYXBpcywgZnVuY3Rpb24gKGFwaSkgeyByZXR1cm4gYXBpLnBhdGg7IH0pLmluZGV4T2YodW51c2VkKTtcblxuICAgICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhybE9yU08uYXBpc1tpbmRleF0ucGF0aCwgdW51c2VkLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWydhcGlzJywgaW5kZXgudG9TdHJpbmcoKSwgJ3BhdGgnXSwgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBWYWxpZGF0ZSB1bnVzZWQgYXV0aG9yaXphdGlvbnNcbiAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoT2JqZWN0LmtleXMoYXV0aERlZnMpLCBPYmplY3Qua2V5cyhhdXRoUmVmcykpLCBmdW5jdGlvbiAodW51c2VkKSB7XG4gICAgICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKHJsT3JTTy5hdXRob3JpemF0aW9uc1t1bnVzZWRdLCB1bnVzZWQsICdBVVRIT1JJWkFUSU9OJywgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ2F1dGhvcml6YXRpb25zJywgdW51c2VkXSwgcmVzcG9uc2Uud2FybmluZ3MpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHVudXNlZCBhdXRob3JpemF0aW9uIHNjb3Blc1xuICAgICAgXy5lYWNoKGF1dGhSZWZzLCBmdW5jdGlvbiAoc2NvcGVzLCBuYW1lKSB7XG4gICAgICAgIHZhciBwYXRoID0gWydhdXRob3JpemF0aW9ucycsIG5hbWVdO1xuXG4gICAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2Uoc2NvcGVzLCBhdXRoUmVmc1tuYW1lXSksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgICAgICB2YXIgaW5kZXggPSBzY29wZXMuaW5kZXhPZih1bnVzZWQpO1xuXG4gICAgICAgICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcocmxPclNPLmF1dGhvcml6YXRpb25zW25hbWVdLnNjb3Blc1tpbmRleF0sIHVudXNlZCwgJ0FVVEhPUklaQVRJT05fU0NPUEUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uIHNjb3BlJywgcGF0aC5jb25jYXQoWydzY29wZXMnLCBpbmRleC50b1N0cmluZygpXSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2Uud2FybmluZ3MpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgKGZvciBub3cpIHVuaXF1ZSBjb25zdW1lcy9wcm9kdWNlcy9zY2hlbWVzXG4gICAgXy5lYWNoKFsnY29uc3VtZXMnLCAncHJvZHVjZXMnLCAnc2NoZW1lcyddLCBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgdmFsaWRhdGVOb0R1cGxpY2F0ZXMocmxPclNPW25hbWVdLCAnQVBJXycgKyBuYW1lLnRvVXBwZXJDYXNlKCksICdBUEknLCBbbmFtZV0sIHJlc3BvbnNlLndhcm5pbmdzKTtcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5lcnJvcnMubGVuZ3RoID09PSAwICYmIHJlc3BvbnNlLndhcm5pbmdzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdmFyIG1vZGVsc01ldGFkYXRhID0gZ2V0TW9kZWxzTWV0YWRhdGEoc3BlYywgcmxPclNPLCByZXNwb25zZSkubWV0YWRhdGE7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHRoZSBQYXRoc1xuICAgICAgXy5yZWR1Y2UocmxPclNPLnBhdGhzLCBmdW5jdGlvbiAoc2VlblBhdGhzLCBwYXRoLCBuYW1lKSB7XG4gICAgICAgIHZhciBhUGF0aCA9IFsncGF0aHMnLCBuYW1lXTtcbiAgICAgICAgdmFyIG5QYXRoID0gbm9ybWFsaXplUGF0aChuYW1lKTtcbiAgICAgICAgdmFyIHNQYXJhbXMgPSBbXTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aFxuICAgICAgICBpZiAoc2VlblBhdGhzLmluZGV4T2YoblBhdGgucGF0aCkgPiAtMSkge1xuICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdEVVBMSUNBVEVfQVBJX1BBVEgnLCAnQVBJIHBhdGggKG9yIGVxdWl2YWxlbnQpIGFscmVhZHkgZGVmaW5lZDogJyArIG5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSwgYVBhdGgsIHJlc3BvbnNlLmVycm9ycyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBWYWxpZGF0ZSB0aGUgT3BlcmF0aW9uc1xuICAgICAgICBfLmVhY2gocGF0aCwgZnVuY3Rpb24gKG9wZXJhdGlvbiwgbWV0aG9kKSB7XG4gICAgICAgICAgdmFyIG9QYXRoID0gYVBhdGguY29uY2F0KG1ldGhvZCk7XG5cbiAgICAgICAgICBpZiAobWV0aG9kID09PSAncGFyYW1ldGVycycpIHtcbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlciBjb25zdHJhaW50c1xuICAgICAgICAgICAgXy5yZWR1Y2UocGF0aC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlciwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgdmFyIHBQYXRoID0gb1BhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCkpO1xuXG4gICAgICAgICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSBwYXJhbWV0ZXIgbmFtZVxuICAgICAgICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlci5uYW1lLCAnQVBJX1BBUkFNRVRFUicsICdBUEkgcGFyYW1ldGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnbmFtZScpLCByZXNwb25zZS5lcnJvcnMpO1xuXG4gICAgICAgICAgICAgIC8vIEtlZXAgdHJhY2sgb2YgcGF0aCBwYXJhbWV0ZXJzXG4gICAgICAgICAgICAgIGlmIChwYXJhbWV0ZXIuaW4gPT09ICdwYXRoJykge1xuICAgICAgICAgICAgICAgIGlmIChuUGF0aC5hcmdzLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV9BUElfUEFUSF9QQVJBTUVURVInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0FQSSBwYXRoIHBhcmFtZXRlciBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBwYXJhbWV0ZXIubmFtZSwgcGFyYW1ldGVyLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ25hbWUnKSwgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc1BhcmFtcy5pbmRleE9mKHBhcmFtZXRlci5uYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgIHNQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgLy8gRmluZCBtb2RlbHMgZGVmaW5lZC9yZWZlcmVuY2VkIGluICMvcGF0aHMve3BhdGh9L3BhcmFtZXRlcnNcbiAgICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHBhcmFtZXRlci5zY2hlbWEpKSB7XG4gICAgICAgICAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBwYXJhbWV0ZXIuc2NoZW1hLCB0b0pzb25Qb2ludGVyKHBQYXRoLmNvbmNhdCgnc2NoZW1hJykpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ3NjaGVtYScpLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gc2VlblBhcmFtZXRlcnMuY29uY2F0KHBhcmFtZXRlci5uYW1lKTtcbiAgICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFZhbGlkYXRlIChmb3Igbm93KSBjb25zdW1lcy9wcm9kdWNlcy9zY2hlbWVzIHVuaXF1ZW5lc3NcbiAgICAgICAgICBfLmVhY2goWydjb25zdW1lcycsICdwcm9kdWNlcycsICdzY2hlbWVzJ10sIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgICAgICB2YWxpZGF0ZU5vRHVwbGljYXRlcyhvcGVyYXRpb25bbmFtZV0sICdPUEVSQVRJT05fJyArIG5hbWUudG9VcHBlckNhc2UoKSwgJ09wZXJhdGlvbicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQobmFtZSksIHJlc3BvbnNlLndhcm5pbmdzKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlciBjb25zdHJhaW50c1xuICAgICAgICAgIF8ucmVkdWNlKG9wZXJhdGlvbi5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlciwgaW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBwUGF0aCA9IG9QYXRoLmNvbmNhdCgncGFyYW1ldGVycycsIGluZGV4LnRvU3RyaW5nKCkpO1xuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcGFyYW1ldGVyIG5hbWVcbiAgICAgICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLm5hbWUsICdPUEVSQVRJT05fUEFSQU1FVEVSJywgJ09wZXJhdGlvbiBwYXJhbWV0ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnbmFtZScpLCByZXNwb25zZS5lcnJvcnMpO1xuXG4gICAgICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIHBhdGggcGFyYW1ldGVyc1xuICAgICAgICAgICAgaWYgKHBhcmFtZXRlci5pbiA9PT0gJ3BhdGgnKSB7XG4gICAgICAgICAgICAgIGlmIChuUGF0aC5hcmdzLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlJFU09MVkFCTEVfQVBJX1BBVEhfUEFSQU1FVEVSJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQVBJIHBhdGggcGFyYW1ldGVyIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHBhcmFtZXRlci5uYW1lLCBwYXJhbWV0ZXIubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ25hbWUnKSwgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmIChzUGFyYW1zLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHNQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRmluZCBtb2RlbHMgZGVmaW5lZC9yZWZlcmVuY2VkIGluICMvcGF0aHMve3BhdGh9L3ttZXRob2R9L3BhcmFtZXRlcnNcbiAgICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIuc2NoZW1hKSkge1xuICAgICAgICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIHBhcmFtZXRlci5zY2hlbWEsIHRvSnNvblBvaW50ZXIocFBhdGguY29uY2F0KCdzY2hlbWEnKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBwUGF0aC5jb25jYXQoJ3NjaGVtYScpLCByZXNwb25zZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBzZWVuUGFyYW1ldGVycy5jb25jYXQocGFyYW1ldGVyLm5hbWUpO1xuICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgIC8vIEZpbmQgbW9kZWxzIGRlZmluZWQvcmVmZXJlbmNlZCBpbiAjL3BhdGhzL3twYXRofS97bWV0aG9kfS9yZXNwb25zZXNcbiAgICAgICAgICBfLmVhY2gob3BlcmF0aW9uLnJlc3BvbnNlcywgZnVuY3Rpb24gKHJlc3BvbnNlT2JqLCByZXNwb25zZUNvZGUpIHtcbiAgICAgICAgICAgIHZhciByUGF0aCA9IG9QYXRoLmNvbmNhdCgncmVzcG9uc2VzJywgcmVzcG9uc2VDb2RlKTtcblxuICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlc3BvbnNlT2JqLnNjaGVtYSkpIHtcbiAgICAgICAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCByZXNwb25zZU9iai5zY2hlbWEsIHRvSnNvblBvaW50ZXIoclBhdGguY29uY2F0KCdzY2hlbWEnKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByUGF0aC5jb25jYXQoJ3NjaGVtYScpLCByZXNwb25zZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgcGF0aCBwYXJhbWV0ZXJzIChpbiBwYXRoIGJ1dCBub3QgaW4gb3BlcmF0aW9uLnBhcmFtZXRlcnMpXG4gICAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoblBhdGguYXJncywgc1BhcmFtcyksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUlTU0lOR19BUElfUEFUSF9QQVJBTUVURVInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgcmVxdWlyZXMgcGF0aCBwYXJhbWV0ZXIgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgdW51c2VkLCBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFQYXRoLCByZXNwb25zZS5lcnJvcnMpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gc2VlblBhdGhzLmNvbmNhdChuUGF0aC5wYXRoKTtcbiAgICAgIH0sIFtdKTtcblxuICAgICAgLy8gVmFsaWRhdGUgbW9kZWxzXG4gICAgICBfLmVhY2gobW9kZWxzTWV0YWRhdGEsIGZ1bmN0aW9uIChtZXRhZGF0YSwgbW9kZWxJZCkge1xuICAgICAgICAvLyBJZGVudGlmeSBtaXNzaW5nIG1vZGVscyAocmVmZXJlbmNlZCBidXQgbm90IGRlY2xhcmVkKVxuICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChtZXRhZGF0YS5zY2hlbWEpKSB7XG4gICAgICAgICAgXy5lYWNoKG1ldGFkYXRhLnJlZnMsIGZ1bmN0aW9uIChyZWYpIHtcbiAgICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlJFU09MVkFCTEVfTU9ERUwnLCAnTW9kZWwgY291bGQgbm90IGJlIHJlc29sdmVkOiAnICsgbW9kZWxJZCwgbW9kZWxJZCwgcmVmLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElkZW50aWZ5IHVudXNlZCBtb2RlbHMgKGRlY2xhcmVkIGJ1dCBub3QgcmVmZXJlbmNlZClcbiAgICAgICAgaWYgKG1ldGFkYXRhLnJlZnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcobWV0YWRhdGEuc2NoZW1hLCBtb2RlbElkLCAnTU9ERUwnLCAnTW9kZWwnLCBtb2RlbElkLnN1YnN0cmluZygyKS5zcGxpdCgnLycpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlLndhcm5pbmdzKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG4gIH1cblxuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIHJlc3VsdCBvZiB0aGUgdmFsaWRhdGlvbiBvZiB0aGUgU3dhZ2dlciBkb2N1bWVudChzKS5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gcmxPclNPIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgTGlzdGluZyAoMS4yKSBvciBTd2FnZ2VyIE9iamVjdCAoMi4wKVxuICogQHBhcmFtIHtvYmplY3RbXX0gW2FwaURlY2xhcmF0aW9uc10gLSBUaGUgYXJyYXkgb2YgU3dhZ2dlciBBUEkgRGVjbGFyYXRpb25zICgxLjIpXG4gKlxuICogQHJldHVybnMgdW5kZWZpbmVkIGlmIHZhbGlkYXRpb24gcGFzc2VzIG9yIGFuIG9iamVjdCBjb250YWluaW5nIGVycm9ycyBhbmQvb3Igd2FybmluZ3NcbiAqL1xuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUudmFsaWRhdGUgPSBmdW5jdGlvbiB2YWxpZGF0ZSAocmxPclNPLCBhcGlEZWNsYXJhdGlvbnMpIHtcbiAgdmFyIHJlc3BvbnNlID0ge1xuICAgIGVycm9yczogW10sXG4gICAgd2FybmluZ3M6IFtdXG4gIH07XG4gIHZhciBza2lwUmVtYWluaW5nID0gZmFsc2U7XG5cbiAgc3dpdGNoICh0aGlzLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXNvdXJjZUxpc3RpbmcgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNBcnJheShhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdhcGlEZWNsYXJhdGlvbnMgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIHN0cnVjdHVyYWxseVxuICAgIHJlc3BvbnNlID0gdmFsaWRhdGVXaXRoU2NoZW1hKHRoaXMsICdyZXNvdXJjZUxpc3RpbmcuanNvbicsIHJsT3JTTyk7XG5cbiAgICBpZiAocmVzcG9uc2UuZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICAgIHNraXBSZW1haW5pbmcgPSB0cnVlO1xuICAgIH1cblxuICAgIGlmICghc2tpcFJlbWFpbmluZykge1xuICAgICAgcmVzcG9uc2UuYXBpRGVjbGFyYXRpb25zID0gW107XG5cbiAgICAgIF8uZWFjaChhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChhcGlEZWNsYXJhdGlvbiwgaW5kZXgpIHtcbiAgICAgICAgcmVzcG9uc2UuYXBpRGVjbGFyYXRpb25zW2luZGV4XSA9IHZhbGlkYXRlV2l0aFNjaGVtYSh0aGlzLCAnYXBpRGVjbGFyYXRpb24uanNvbicsIGFwaURlY2xhcmF0aW9uKTtcblxuICAgICAgICBpZiAocmVzcG9uc2UuYXBpRGVjbGFyYXRpb25zW2luZGV4XS5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHNraXBSZW1haW5pbmcgPSB0cnVlO1xuXG4gICAgICAgICAgLy8gU2tpcCB0aGUgcmVtYWluaW5nIHZhbGlkYXRpb25cbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgc2VtYW50aWNhbGx5XG4gICAgaWYgKCFza2lwUmVtYWluaW5nKSB7XG4gICAgICByZXNwb25zZSA9IHZhbGlkYXRlQ29udGVudCh0aGlzLCBybE9yU08sIGFwaURlY2xhcmF0aW9ucyk7XG4gICAgfVxuXG4gICAgLy8gU2V0IHRoZSByZXNwb25zZVxuICAgIHJlc3BvbnNlID0gcmVzcG9uc2UuZXJyb3JzLmxlbmd0aCA+IDAgfHwgcmVzcG9uc2Uud2FybmluZ3MubGVuZ3RoID4gMCB8fFxuICAgICAgXy5yZWR1Y2UocmVzcG9uc2UuYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoY291bnQsIGFwaURlY2xhcmF0aW9uKSB7XG4gICAgICAgIHJldHVybiBjb3VudCArXG4gICAgICAgICAgKF8uaXNBcnJheShhcGlEZWNsYXJhdGlvbi5lcnJvcnMpID8gYXBpRGVjbGFyYXRpb24uZXJyb3JzLmxlbmd0aCA6IDApICtcbiAgICAgICAgICAoXy5pc0FycmF5KGFwaURlY2xhcmF0aW9uLndhcm5pbmdzKSA/IGFwaURlY2xhcmF0aW9uLndhcm5pbmdzLmxlbmd0aCA6IDApO1xuICAgICAgfSwgMCkgPiAwID8gcmVzcG9uc2UgOiB1bmRlZmluZWQ7XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3dhZ2dlck9iamVjdCBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzd2FnZ2VyT2JqZWN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgc3RydWN0dXJhbGx5XG4gICAgcmVzcG9uc2UgPSB2YWxpZGF0ZVdpdGhTY2hlbWEodGhpcywgJ3NjaGVtYS5qc29uJywgcmxPclNPKTtcblxuICAgIGlmIChyZXNwb25zZS5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgc2tpcFJlbWFpbmluZyA9IHRydWU7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgc2VtYW50aWNhbGx5XG4gICAgaWYgKCFza2lwUmVtYWluaW5nKSB7XG4gICAgICByZXNwb25zZSA9IHZhbGlkYXRlQ29udGVudCh0aGlzLCBybE9yU08pO1xuICAgIH1cblxuICAgIC8vIFNldCB0aGUgcmVzcG9uc2VcbiAgICByZXNwb25zZSA9IHJlc3BvbnNlLmVycm9ycy5sZW5ndGggPiAwIHx8IHJlc3BvbnNlLndhcm5pbmdzLmxlbmd0aCA+IDAgPyByZXNwb25zZSA6IHVuZGVmaW5lZDtcblxuICAgIGJyZWFrO1xuICB9XG5cbiAgcmV0dXJuIHJlc3BvbnNlO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgSlNPTiBTY2hlbWEgcmVwcmVzZW50YXRpb24gb2YgYSBjb21wb3NlZCBtb2RlbCBiYXNlZCBvbiBpdHMgaWQuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IGFwaURPclNPIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgQVBJIERlY2xhcmF0aW9uICgxLjIpIG9yIHRoZSBTd2FnZ2VyIE9iamVjdCAoMi4wKVxuICogQHBhcmFtIHtzdHJpbmd9IG1vZGVsSWRPclBhdGggLSBUaGUgbW9kZWwgaWQgKDEuMiBvciAyLjApIG9yIHRoZSBwYXRoIHRvIHRoZSBtb2RlbCAoMi4wKVxuICpcbiAqIEByZXR1cm5zIHRoZSBvYmplY3QgcmVwcmVzZW50aW5nIGEgY29tcG9zZWQgb2JqZWN0XG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGVyZSBhcmUgdmFsaWRhdGlvbiBlcnJvcnMgd2hpbGUgY3JlYXRpbmdcbiAqL1xuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUuY29tcG9zZU1vZGVsID0gZnVuY3Rpb24gY29tcG9zZU1vZGVsIChhcGlET3JTTywgbW9kZWxJZE9yUGF0aCkge1xuICB2YXIgbWV0YWRhdGFFbnRyeTtcbiAgdmFyIG1vZGVsTWV0YWRhdGE7XG4gIHZhciBtb2RlbHNNZXRhZGF0YTtcbiAgdmFyIGVycjtcblxuICBzd2l0Y2ggKHRoaXMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdhcGlEZWNsYXJhdGlvbiBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9uIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxJZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N3YWdnZXJPYmplY3QgaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzd2FnZ2VyT2JqZWN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxJZE9yUGF0aCBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuICB9XG5cbiAgbWV0YWRhdGFFbnRyeSA9IGdldE1vZGVsc01ldGFkYXRhKHRoaXMsIGFwaURPclNPKTtcbiAgbW9kZWxzTWV0YWRhdGEgPSBtZXRhZGF0YUVudHJ5Lm1ldGFkYXRhO1xuXG4gIC8vIENvbXBvc2luZyBhIG1vZGVsIGZvciBhbiBpbnZhbGlkIG1vZGVsIGhpZXJhcmNoeSBpcyBicml0dGxlIGFuZCBzbyB3ZSB3aWxsIG5vdCBkbyBpdFxuICBpZiAobWV0YWRhdGFFbnRyeS5yZXN1bHRzLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgZXJyID0gbmV3IEVycm9yKCdUaGUgbW9kZWxzIGFyZSBpbnZhbGlkIGFuZCBtb2RlbCBjb21wb3NpdGlvbiBpcyBub3QgcG9zc2libGUnKTtcblxuICAgIGVyci5lcnJvcnMgPSBtZXRhZGF0YUVudHJ5LnJlc3VsdHMuZXJyb3JzO1xuICAgIGVyci53YXJuaW5ncyA9IG1ldGFkYXRhRW50cnkucmVzdWx0cy53YXJuaW5ncztcblxuICAgIHRocm93IGVycjtcbiAgfVxuXG4gIG1vZGVsTWV0YWRhdGEgPSBtb2RlbHNNZXRhZGF0YVt0aGlzLnZlcnNpb24gPT09ICcxLjInID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxJZE9yUGF0aCA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZlRvSnNvblBvaW50ZXIobW9kZWxJZE9yUGF0aCldO1xuXG4gIHJldHVybiBfLmlzVW5kZWZpbmVkKG1vZGVsTWV0YWRhdGEpID8gdW5kZWZpbmVkIDogbW9kZWxNZXRhZGF0YS5jb21wb3NlZDtcbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIGEgbW9kZWwgYmFzZWQgb24gaXRzIGlkLlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBhcGlET3JTTyAtIFRoZSBTd2FnZ2VyIFJlc291cmNlIEFQSSBEZWNsYXJhdGlvbiAoMS4yKSBvciB0aGUgU3dhZ2dlciBPYmplY3QgKDIuMClcbiAqIEBwYXJhbSB7c3RyaW5nfSBtb2RlbElkT3JQYXRoIC0gVGhlIG1vZGVsIGlkICgxLjIgb3IgMi4wKSBvciB0aGUgcGF0aCB0byB0aGUgbW9kZWwgKDIuMClcbiAqIEBwYXJhbSB7b2JqZWN0fSBkYXRhIC0gVGhlIG1vZGVsIHRvIHZhbGlkYXRlXG4gKlxuICogQHJldHVybnMgdW5kZWZpbmVkIGlmIHZhbGlkYXRpb24gcGFzc2VzIG9yIGFuIG9iamVjdCBjb250YWluaW5nIGVycm9ycyBhbmQvb3Igd2FybmluZ3NcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZXJlIGFyZSB2YWxpZGF0aW9uIGVycm9ycyB3aGlsZSBjcmVhdGluZ1xuICovXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS52YWxpZGF0ZU1vZGVsID0gZnVuY3Rpb24gdmFsaWRhdGVNb2RlbCAoYXBpRE9yU08sIG1vZGVsSWRPclBhdGgsIGRhdGEpIHtcbiAgdmFyIG1vZGVsU2NoZW1hID0gdGhpcy5jb21wb3NlTW9kZWwoYXBpRE9yU08sIG1vZGVsSWRPclBhdGgpO1xuICB2YXIgcmVzdWx0O1xuICB2YXIgdmFsaWRhdG9yO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKG1vZGVsU2NoZW1hKSkge1xuICAgIHRocm93IEVycm9yKCdVbmFibGUgdG8gY29tcG9zZSBtb2RlbCBzbyB2YWxpZGF0aW9uIGlzIG5vdCBwb3NzaWJsZScpO1xuICB9XG5cbiAgdmFsaWRhdG9yID0gamp2KGpqdk9wdGlvbnMpO1xuXG4gIC8vIERpc2FibGUgdGhlICd1cmknIGZvcm1hdCBjaGVja2VyIGFzIGl0J3MgZ290IGlzc3VlczogaHR0cHM6Ly9naXRodWIuY29tL2Fjb3JuZWpvL2pqdi9pc3N1ZXMvMjRcbiAgdmFsaWRhdG9yLmFkZEZvcm1hdCgndXJpJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHZhbGlkYXRvci5hZGRTY2hlbWEoZHJhZnQwNFVybCwgZHJhZnQwNEpzb24pO1xuXG4gIHZhbGlkYXRvci5qZSA9IGpqdmUodmFsaWRhdG9yKTtcblxuICByZXN1bHQgPSB2YWxpZGF0b3IudmFsaWRhdGUobW9kZWxTY2hlbWEsIGRhdGEpO1xuXG4gIGlmIChyZXN1bHQpIHtcbiAgICByZXN1bHQgPSB7XG4gICAgICBlcnJvcnM6IHZhbGlkYXRvci5qZShtb2RlbFNjaGVtYSwgZGF0YSwgcmVzdWx0LCBqanZlT3B0aW9ucylcbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy52MSA9IG1vZHVsZS5leHBvcnRzLnYxXzIgPSBuZXcgU3BlY2lmaWNhdGlvbignMS4yJyk7IC8vIGpzaGludCBpZ25vcmU6bGluZVxubW9kdWxlLmV4cG9ydHMudjIgPSBtb2R1bGUuZXhwb3J0cy52Ml8wID0gbmV3IFNwZWNpZmljYXRpb24oJzIuMCcpOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBBcGlnZWUgQ29ycG9yYXRpb25cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG52YXIgc3BlY0NhY2hlID0ge307XG5cbi8qKlxuICogUmV0dXJucyB0aGUgcHJvcGVyIHNwZWNpZmljYXRpb24gYmFzZWQgb24gdGhlIGh1bWFuIHJlYWRhYmxlIHZlcnNpb24uXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHZlcnNpb24gLSBUaGUgaHVtYW4gcmVhZGFibGUgU3dhZ2dlciB2ZXJzaW9uIChFeDogMS4yKVxuICpcbiAqIEByZXR1cm5zIHRoZSBjb3JyZXNwb25kaW5nIFN3YWdnZXIgU3BlY2lmaWNhdGlvbiBvYmplY3Qgb3IgdW5kZWZpbmVkIGlmIHRoZXJlIGlzIG5vbmVcbiAqL1xubW9kdWxlLmV4cG9ydHMuZ2V0U3BlYyA9IGZ1bmN0aW9uIGdldFNwZWMgKHZlcnNpb24pIHtcbiAgdmFyIHNwZWMgPSBzcGVjQ2FjaGVbdmVyc2lvbl07XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoc3BlYykpIHtcbiAgICBzd2l0Y2ggKHZlcnNpb24pIHtcbiAgICBjYXNlICcxLjInOlxuICAgICAgc3BlYyA9IHJlcXVpcmUoJy4uL2xpYi9zcGVjcycpLnYxXzI7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuXG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJzIuMCc6XG4gICAgICBzcGVjID0gcmVxdWlyZSgnLi4vbGliL3NwZWNzJykudjJfMDsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG5cbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzcGVjO1xufTtcblxuLyoqXG4gKiBUYWtlcyBhIHJlZmVyZW5jZSBhbmQgY3JlYXRlcyBhIGZ1bGx5IHF1YWxpZmllZCBKU09OIHBvaW50ZXIgZnJvbSBpdC4gICgyLjAgb25seSlcbiAqXG4gKiBJZiB0aGUgcGFzc2VkIGluIHJlZmVyZW5jZSBpcyBmdWxseSBxdWFsaWZpZWQsIGl0IGlzIHJldHVybmVkIGFzLWlzLiAgT3RoZXJ3aXNlLCB0aGUgcmVmZXJlbmNlIHdpbGwgaGF2ZVxuICogJyMvZGVmaW5pdGlvbnMvJyBwcmVwZW5kZWQgdG8gaXQgdG8gbWFrZSBpdCBmdWxseSBxdWFsaWZpZWQgc2luY2UgdGhlc2UgJ3JlbGF0aXZlJyByZWZlcmVuY2VzIGFyZSBvbmx5IGFsbG93ZWQgZm9yXG4gKiBtb2RlbCBkZWZpbml0aW9ucy5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gcmVmIC0gVGhlIHJlbGF0aXZlIG9yIGZ1bGx5IHF1YWxpZmllZCByZWZlcmVuY2VcbiAqXG4gKiBAcmV0dXJucyB0aGUgY29ycmVzcG9uZGluZyBKU09OIHBvaW50ZXIgZm9yIHRoZSByZWZlcmVuY2VcbiAqL1xubW9kdWxlLmV4cG9ydHMucmVmVG9Kc29uUG9pbnRlciA9IGZ1bmN0aW9uIHJlZlRvSnNvblBvaW50ZXIgKHJlZikge1xuICBpZiAocmVmLmNoYXJBdCgwKSAhPT0gJyMnKSB7XG4gICAgcmVmID0gJyMvZGVmaW5pdGlvbnMvJyArIHJlZjtcbiAgfVxuXG4gIHJldHVybiByZWY7XG59O1xuXG4vKipcbiAqIFRha2VzIGFuIGFycmF5IG9mIHBhdGggc2VnbWVudHMgYW5kIGNyZWF0ZXMgYSBKU09OIHBvaW50ZXIgZnJvbSBpdC4gKDIuMCBvbmx5KVxuICpcbiAqIEBwYXJhbSB7c3RyaW5nW119IHBhdGggLSBUaGUgcGF0aCBzZWdtZW50c1xuICpcbiAqIEByZXR1cm5zIGEgSlNPTiBwb2ludGVyIGZvciB0aGUgcmVmZXJlbmNlIGRlbm90ZWQgYnkgdGhlIHBhdGggc2VnbWVudHNcbiAqL1xubW9kdWxlLmV4cG9ydHMudG9Kc29uUG9pbnRlciA9IGZ1bmN0aW9uIHRvSnNvblBvaW50ZXIgKHBhdGgpIHtcbiAgLy8gaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNjkwMSNzZWN0aW9uLTRcbiAgcmV0dXJuICcjLycgKyBwYXRoLm1hcChmdW5jdGlvbiAocGFydCkge1xuICAgIHJldHVybiBwYXJ0LnJlcGxhY2UoL1xcLy9nLCAnfjEnKTtcbiAgfSkuam9pbignLycpO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBBcGlnZWUgQ29ycG9yYXRpb25cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG4vLyBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzMzM5I3NlY3Rpb24tNS42XG52YXIgZGF0ZVJlZ0V4cCA9IC9eKFswLTldezR9KS0oWzAtOV17Mn0pLShbMC05XXsyfSkkLztcbi8vIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzMzMzkjc2VjdGlvbi01LjZcbnZhciBkYXRlVGltZVJlZ0V4cCA9IC9eKFswLTldezJ9KTooWzAtOV17Mn0pOihbMC05XXsyfSkoLlswLTldKyk/KHp8KFsrLV1bMC05XXsyfTpbMC05XXsyfSkpJC87XG52YXIgdGhyb3dJbnZhbGlkUGFyYW1ldGVyID0gZnVuY3Rpb24gdGhyb3dJbnZhbGlkUGFyYW1ldGVyIChuYW1lLCBtZXNzYWdlKSB7XG4gIHZhciBlcnIgPSBuZXcgRXJyb3IoJ1BhcmFtZXRlciAoJyArIG5hbWUgKyAnKSAnICsgbWVzc2FnZSk7XG5cbiAgZXJyLmZhaWxlZFZhbGlkYXRpb24gPSB0cnVlO1xuXG4gIHRocm93IGVycjtcbn07XG52YXIgaXNWYWxpZERhdGUgPSBmdW5jdGlvbiBpc1ZhbGlkRGF0ZSAoZGF0ZSkge1xuICB2YXIgZGF5O1xuICB2YXIgbWF0Y2hlcztcbiAgdmFyIG1vbnRoO1xuXG4gIGlmICghXy5pc1N0cmluZyhkYXRlKSkge1xuICAgIGRhdGUgPSBkYXRlLnRvU3RyaW5nKCk7XG4gIH1cblxuICBtYXRjaGVzID0gZGF0ZVJlZ0V4cC5leGVjKGRhdGUpO1xuXG4gIGlmIChtYXRjaGVzID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBkYXkgPSBtYXRjaGVzWzNdO1xuICBtb250aCA9IG1hdGNoZXNbMl07XG5cbiAgaWYgKG1vbnRoIDwgJzAxJyB8fCBtb250aCA+ICcxMicgfHwgZGF5IDwgJzAxJyB8fCBkYXkgPiAnMzEnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xudmFyIGlzVmFsaWREYXRlVGltZSA9IGZ1bmN0aW9uIGlzVmFsaWREYXRlVGltZSAoZGF0ZVRpbWUpIHtcbiAgdmFyIGhvdXI7XG4gIHZhciBkYXRlO1xuICB2YXIgdGltZTtcbiAgdmFyIG1hdGNoZXM7XG4gIHZhciBtaW51dGU7XG4gIHZhciBwYXJ0cztcbiAgdmFyIHNlY29uZDtcblxuICBpZiAoIV8uaXNTdHJpbmcoZGF0ZVRpbWUpKSB7XG4gICAgZGF0ZVRpbWUgPSBkYXRlVGltZS50b1N0cmluZygpO1xuICB9XG5cbiAgcGFydHMgPSBkYXRlVGltZS50b0xvd2VyQ2FzZSgpLnNwbGl0KCd0Jyk7XG4gIGRhdGUgPSBwYXJ0c1swXTtcbiAgdGltZSA9IHBhcnRzLmxlbmd0aCA+IDEgPyBwYXJ0c1sxXSA6IHVuZGVmaW5lZDtcblxuICBpZiAoIWlzVmFsaWREYXRlKGRhdGUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBtYXRjaGVzID0gZGF0ZVRpbWVSZWdFeHAuZXhlYyh0aW1lKTtcblxuICBpZiAobWF0Y2hlcyA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaG91ciA9IG1hdGNoZXNbMV07XG4gIG1pbnV0ZSA9IG1hdGNoZXNbMl07XG4gIHNlY29uZCA9IG1hdGNoZXNbM107XG5cbiAgaWYgKGhvdXIgPiAnMjMnIHx8IG1pbnV0ZSA+ICc1OScgfHwgc2Vjb25kID4gJzU5Jykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QncyBjb250ZW50IHR5cGUgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBnQ29uc3VtZXMgLSBUaGUgdmFsaWQgY29uc3VtZXMgYXQgdGhlIEFQSSBzY29wZVxuICogQHBhcmFtIHtzdHJpbmdbXX0gb0NvbnN1bWVzIC0gVGhlIHZhbGlkIGNvbnN1bWVzIGF0IHRoZSBvcGVyYXRpb24gc2NvcGVcbiAqIEBwYXJhbSB7b2JqZWN0fSByZXEgLSBUaGUgcmVxdWVzdFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIGNvbnRlbnQgdHlwZSBpcyBpbnZhbGlkXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlQ29udGVudFR5cGUgPSBmdW5jdGlvbiB2YWxpZGF0ZUNvbnRlbnRUeXBlIChnQ29uc3VtZXMsIG9Db25zdW1lcywgcmVxKSB7XG4gIC8vIGh0dHA6Ly93d3cudzMub3JnL1Byb3RvY29scy9yZmMyNjE2L3JmYzI2MTYtc2VjNy5odG1sI3NlYzcuMi4xXG4gIHZhciBjb250ZW50VHlwZSA9IHJlcS5oZWFkZXJzWydjb250ZW50LXR5cGUnXSB8fCAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJztcbiAgdmFyIGNvbnN1bWVzID0gXy51bmlvbihvQ29uc3VtZXMsIGdDb25zdW1lcyk7XG5cbiAgLy8gR2V0IG9ubHkgdGhlIGNvbnRlbnQgdHlwZVxuICBjb250ZW50VHlwZSA9IGNvbnRlbnRUeXBlLnNwbGl0KCc7JylbMF07XG5cbiAgLy8gVmFsaWRhdGUgY29udGVudCB0eXBlIChPbmx5IGZvciBQT1NUL1BVVCBwZXIgSFRUUCBzcGVjKVxuICBpZiAoY29uc3VtZXMubGVuZ3RoID4gMCAmJiBbJ1BPU1QnLCAnUFVUJ10uaW5kZXhPZihyZXEubWV0aG9kKSAhPT0gLTEgJiYgY29uc3VtZXMuaW5kZXhPZihjb250ZW50VHlwZSkgPT09IC0xKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbnRlbnQgdHlwZSAoJyArIGNvbnRlbnRUeXBlICsgJykuICBUaGVzZSBhcmUgdmFsaWQ6ICcgKyBjb25zdW1lcy5qb2luKCcsICcpKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyJ3MgdmFsdWUgYWdhaW5zdCB0aGUgYWxsb3dhYmxlIHZhbHVlcyAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nW119IGFsbG93ZWQgLSBUaGUgYWxsb3dhYmxlIHZhbHVlc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIG5vdCBhbGxvd2FibGVcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVFbnVtID0gZnVuY3Rpb24gdmFsaWRhdGVFbnVtIChuYW1lLCB2YWwsIGFsbG93ZWQpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGFsbG93ZWQpICYmICFfLmlzVW5kZWZpbmVkKHZhbCkgJiYgYWxsb3dlZC5pbmRleE9mKHZhbCkgPT09IC0xKSB7XG4gICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBub3QgYW4gYWxsb3dhYmxlIHZhbHVlICgnICsgYWxsb3dlZC5qb2luKCcsICcpICsgJyk6ICcgKyB2YWwpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyB2YWx1ZSBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gbWF4aW11bSAtIFRoZSBtYXhpbXVtIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtleGNsdXNpdmU9ZmFsc2VdIC0gV2hldGhlciBvciBub3QgdGhlIHZhbHVlIGluY2x1ZGVzIHRoZSBtYXhpbXVtIGluIGl0cyBjb21wYXJpc29uXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgZ3JlYXRlciB0aGFuIHRoZSBtYXhpbXVtXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWF4aW11bSA9IGZ1bmN0aW9uIHZhbGlkYXRlTWF4aW11bSAobmFtZSwgdmFsLCBtYXhpbXVtLCB0eXBlLCBleGNsdXNpdmUpIHtcbiAgdmFyIHRlc3RNYXg7XG4gIHZhciB0ZXN0VmFsO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGV4Y2x1c2l2ZSkpIHtcbiAgICBleGNsdXNpdmUgPSBmYWxzZTtcbiAgfVxuXG4gIGlmICh0eXBlID09PSAnaW50ZWdlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VJbnQodmFsLCAxMCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VGbG9hdCh2YWwpO1xuICB9XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heGltdW0pKSB7XG4gICAgdGVzdE1heCA9IHBhcnNlRmxvYXQobWF4aW11bSk7XG5cbiAgICBpZiAoZXhjbHVzaXZlICYmIHRlc3RWYWwgPj0gdGVzdE1heCkge1xuICAgICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gdGhlIGNvbmZpZ3VyZWQgbWF4aW11bSAoJyArIG1heGltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfSBlbHNlIGlmICh0ZXN0VmFsID4gdGVzdE1heCkge1xuICAgICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBncmVhdGVyIHRoYW4gdGhlIGNvbmZpZ3VyZWQgbWF4aW11bSAoJyArIG1heGltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyBhcnJheSBjb3VudCBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhJdGVtcyAtIFRoZSBtYXhpbXVtIG51bWJlciBvZiBpdGVtc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGNvbnRhaW5zIG1vcmUgaXRlbXMgdGhhbiBhbGxvd2FibGVcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhJdGVtcyA9IGZ1bmN0aW9uIHZhbGlkYXRlTWF4SXRlbXMgKG5hbWUsIHZhbCwgbWF4SXRlbXMpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heEl0ZW1zKSAmJiB2YWwubGVuZ3RoID4gbWF4SXRlbXMpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2NvbnRhaW5zIG1vcmUgaXRlbXMgdGhhbiBhbGxvd2VkOiAnICsgbWF4SXRlbXMpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyBsZW5ndGggaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWF4TGVuZ3RoIC0gVGhlIG1heGltdW0gbGVuZ3RoXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUncyBsZW5ndGggaXMgZ3JlYXRlciB0aGFuIHRoZSBtYXhpbXVtXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWF4TGVuZ3RoID0gZnVuY3Rpb24gdmFsaWRhdGVNYXhMZW5ndGggKG5hbWUsIHZhbCwgbWF4TGVuZ3RoKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChtYXhMZW5ndGgpICYmIHZhbC5sZW5ndGggPiBtYXhMZW5ndGgpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIGxvbmdlciB0aGFuIGFsbG93ZWQ6ICcgKyBtYXhMZW5ndGgpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyBhcnJheSBjb3VudCBpcyBncmVhdGVyIHRoYW4gdGhlIG1pbmltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gbWluaW11bSAtIFRoZSBtaW5pbXVtIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtleGNsdXNpdmU9ZmFsc2VdIC0gV2hldGhlciBvciBub3QgdGhlIHZhbHVlIGluY2x1ZGVzIHRoZSBtaW5pbXVtIGluIGl0cyBjb21wYXJpc29uXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWluaW11bSA9IGZ1bmN0aW9uIHZhbGlkYXRlTWluaW11bSAobmFtZSwgdmFsLCBtaW5pbXVtLCB0eXBlLCBleGNsdXNpdmUpIHtcbiAgdmFyIHRlc3RNaW47XG4gIHZhciB0ZXN0VmFsO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGV4Y2x1c2l2ZSkpIHtcbiAgICBleGNsdXNpdmUgPSBmYWxzZTtcbiAgfVxuXG4gIGlmICh0eXBlID09PSAnaW50ZWdlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VJbnQodmFsLCAxMCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VGbG9hdCh2YWwpO1xuICB9XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbmltdW0pKSB7XG4gICAgdGVzdE1pbiA9IHBhcnNlRmxvYXQobWluaW11bSk7XG5cbiAgICBpZiAoZXhjbHVzaXZlICYmIHRlc3RWYWwgPD0gdGVzdE1pbikge1xuICAgICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIGNvbmZpZ3VyZWQgbWluaW11bSAoJyArIG1pbmltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfSBlbHNlIGlmICh0ZXN0VmFsIDwgdGVzdE1pbikge1xuICAgICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBsZXNzIHRoYW4gdGhlIGNvbmZpZ3VyZWQgbWluaW11bSAoJyArIG1pbmltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyB2YWx1ZSBjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93ZWQgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5JdGVtcyAtIFRoZSBtaW5pbXVtIG51bWJlciBvZiBpdGVtc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGNvbnRhaW5zIGZld2VyIGl0ZW1zIHRoYW4gYWxsb3dhYmxlXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWluSXRlbXMgPSBmdW5jdGlvbiB2YWxpZGF0ZU1pbkl0ZW1zIChuYW1lLCB2YWwsIG1pbkl0ZW1zKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChtaW5JdGVtcykgJiYgdmFsLmxlbmd0aCA8IG1pbkl0ZW1zKSB7XG4gICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93ZWQ6ICcgKyBtaW5JdGVtcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIGxlbmd0aCBpcyBncmVhdGVyIHRoYW4gdGhlIG1pbmltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5MZW5ndGggLSBUaGUgbWluaW11bSBsZW5ndGhcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSdzIGxlbmd0aCBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW1cbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5MZW5ndGggPSBmdW5jdGlvbiB2YWxpZGF0ZU1pbkxlbmd0aCAobmFtZSwgdmFsLCBtaW5MZW5ndGgpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbkxlbmd0aCkgJiYgdmFsLmxlbmd0aCA8IG1pbkxlbmd0aCkge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnaXMgc2hvcnRlciB0aGFuIGFsbG93ZWQ6ICcgKyBtaW5MZW5ndGgpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlciBhZ2FpbnN0IGl0cyBtb2RlbCBzY2hlbWEuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7b2JqZWN0fSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvbiAtIFRoZSBTd2FnZ2VyIHZlcnNpb25cbiAqIEBwYXJhbSB7b2JqZWN0fSBhcGlET3JTTyAtIFRoZSBTd2FnZ2VyIEFQSSBEZWNsYXJhdGlvbiAoMS4yKSBvciBTd2FnZ2VyIE9iamVjdCAoMi4wKVxuICogQHBhcmFtIHtzdHJpbmd9IG1vZGVsSWRPclBhdGggLSBUaGUgbW9kZWwgaWQgb3IgcGF0aFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIG5vdCBhIHZhbGlkIG1vZGVsXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTW9kZWwgPSBmdW5jdGlvbiB2YWxpZGF0ZU1vZGVsIChuYW1lLCB2YWwsIHZlcnNpb24sIGFwaURPclNPLCBtb2RlbElkT3JQYXRoKSB7XG4gIHZhciBzcGVjID0gaGVscGVycy5nZXRTcGVjKHZlcnNpb24pO1xuICB2YXIgdmFsaWRhdGUgPSBmdW5jdGlvbiB2YWxpZGF0ZSAoZGF0YSkge1xuICAgIHZhciByZXN1bHQgPSBzcGVjLnZhbGlkYXRlTW9kZWwoYXBpRE9yU08sIG1vZGVsSWRPclBhdGgsIGRhdGEpO1xuXG4gICAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlc3VsdCkpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnaXMgbm90IGEgdmFsaWQgJyArIG1vZGVsSWRPclBhdGggKyAnIG1vZGVsJyk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgZXJyLmVycm9ycyA9IHJlc3VsdC5lcnJvcnM7XG5cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBpZiAoXy5pc0FycmF5KHZhbCkpIHtcbiAgICBfLmVhY2godmFsLCBmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgdmFsaWRhdGUoaXRlbSk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgdmFsaWRhdGUodmFsKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyJ3MgbWF0Y2hlcyBhIHBhdHRlcm4gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gcGF0dGVybiAtIFRoZSBwYXR0ZXJuXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgZG9lcyBub3QgbWF0Y2ggdGhlIHBhdHRlcm5cbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVQYXR0ZXJuID0gZnVuY3Rpb24gdmFsaWRhdGVQYXR0ZXJuIChuYW1lLCB2YWwsIHBhdHRlcm4pIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKHBhdHRlcm4pICYmIF8uaXNOdWxsKHZhbC5tYXRjaChuZXcgUmVnRXhwKHBhdHRlcm4pKSkpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2RvZXMgbm90IG1hdGNoIHJlcXVpcmVkIHBhdHRlcm46ICcgKyBwYXR0ZXJuKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyJ3MgcmVxdWlyZWRuZXNzICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtib29sZWFufSByZXF1aXJlZCAtIFdoZXRoZXIgb3Igbm90IHRoZSBwYXJhbWV0ZXIgaXMgcmVxdWlyZWRcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyByZXF1aXJlZCBidXQgaXMgbm90IHByZXNlbnRcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVSZXF1aXJlZG5lc3MgPSBmdW5jdGlvbiB2YWxpZGF0ZVJlcXVpcmVkbmVzcyAobmFtZSwgdmFsLCByZXF1aXJlZCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQocmVxdWlyZWQpICYmIHJlcXVpcmVkID09PSB0cnVlICYmIF8uaXNVbmRlZmluZWQodmFsKSkge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnaXMgcmVxdWlyZWQnKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyJ3MgdHlwZSBhbmQgZm9ybWF0ICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmd9IHR5cGUgLSBUaGUgcGFyYW1ldGVyIHR5cGVcbiAqIEBwYXJhbSB7c3RyaW5nfSBmb3JtYXQgLSBUaGUgcGFyYW1ldGVyIGZvcm1hdFxuICogQHBhcmFtIHtib29sZWFufSBbc2tpcEVycm9yPWZhbHNlXSAtIFdoZXRoZXIgb3Igbm90IHRvIHNraXAgdGhyb3dpbmcgYW4gZXJyb3IgKFVzZWZ1bCBmb3IgdmFsaWRhdGluZyBhcnJheXMpXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbm90IHRoZSBwcm9wZXIgdHlwZSBvciBmb3JtYXRcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVUeXBlQW5kRm9ybWF0ID0gZnVuY3Rpb24gdmFsaWRhdGVUeXBlQW5kRm9ybWF0IChuYW1lLCB2YWwsIHR5cGUsIGZvcm1hdCwgc2tpcEVycm9yKSB7XG4gIHZhciByZXN1bHQgPSB0cnVlO1xuXG4gIGlmIChfLmlzQXJyYXkodmFsKSkge1xuICAgIF8uZWFjaCh2YWwsIGZ1bmN0aW9uIChhVmFsLCBpbmRleCkge1xuICAgICAgaWYgKCF2YWxpZGF0ZVR5cGVBbmRGb3JtYXQobmFtZSwgYVZhbCwgdHlwZSwgZm9ybWF0LCB0cnVlKSkge1xuICAgICAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2F0IGluZGV4ICcgKyBpbmRleCArICcgaXMgbm90IGEgdmFsaWQgJyArIHR5cGUgKyAnOiAnICsgYVZhbCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXN1bHQgPSBfLmlzQm9vbGVhbih2YWwpIHx8IFsnZmFsc2UnLCAndHJ1ZSddLmluZGV4T2YodmFsKSAhPT0gLTE7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdpbnRlZ2VyJzpcbiAgICAgIHJlc3VsdCA9ICFfLmlzTmFOKHBhcnNlSW50KHZhbCwgMTApKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXN1bHQgPSAhXy5pc05hTihwYXJzZUZsb2F0KHZhbCkpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIGlmICghXy5pc1VuZGVmaW5lZChmb3JtYXQpKSB7XG4gICAgICAgIHN3aXRjaCAoZm9ybWF0KSB7XG4gICAgICAgIGNhc2UgJ2RhdGUnOlxuICAgICAgICAgIHJlc3VsdCA9IGlzVmFsaWREYXRlKHZhbCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2RhdGUtdGltZSc6XG4gICAgICAgICAgcmVzdWx0ID0gaXNWYWxpZERhdGVUaW1lKHZhbCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGlmIChza2lwRXJyb3IpIHtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9IGVsc2UgaWYgKCFyZXN1bHQpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIG5vdCBhIHZhbGlkICcgKyAoXy5pc1VuZGVmaW5lZChmb3JtYXQpID8gJycgOiBmb3JtYXQgKyAnICcpICsgdHlwZSArICc6ICcgKyB2YWwpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyB2YWx1ZXMgYXJlIHVuaXF1ZSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGlzVW5pcXVlIC0gV2hldGhlciBvciBub3QgdGhlIHBhcmFtZXRlciB2YWx1ZXMgYXJlIHVuaXF1ZVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGhhcyBkdXBsaWNhdGVzXG4gKi9cbm1vZHVsZS5leHBvcnRzLnZhbGlkYXRlVW5pcXVlSXRlbXMgPSBmdW5jdGlvbiB2YWxpZGF0ZVVuaXF1ZUl0ZW1zIChuYW1lLCB2YWwsIGlzVW5pcXVlKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChpc1VuaXF1ZSkgJiYgXy51bmlxKHZhbCkubGVuZ3RoICE9PSB2YWwubGVuZ3RoKSB7XG4gICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdkb2VzIG5vdCBhbGxvdyBkdXBsaWNhdGUgdmFsdWVzOiAnICsgdmFsLmpvaW4oJywgJykpO1xuICB9XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24oKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBmdW5jdGlvbiBtYWtlKG8pIHtcbiAgICB2YXIgZXJyb3JzID0gW107XG5cbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG8udmFsaWRhdGlvbik7XG5cbiAgICAvLyB3aGVuIHdlJ3JlIG9uIGEgbGVhZiBub2RlIHdlIG5lZWQgdG8gaGFuZGxlIHRoZSB2YWxpZGF0aW9uIGVycm9ycyxcbiAgICAvLyBvdGhlcndpc2Ugd2UgY29udGludWUgd2Fsa2luZ1xuICAgIHZhciBsZWFmID0ga2V5cy5ldmVyeShmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiB0eXBlb2Ygby52YWxpZGF0aW9uW2tleV0gIT09ICdvYmplY3QnIHx8XG4gICAgICAgIGlzQXJyYXkoby52YWxpZGF0aW9uW2tleV0pO1xuICAgIH0pO1xuXG4gICAgaWYgKGxlYWYpIHtcbiAgICAgIC8vIHN0ZXAgdGhyb3VnaCBlYWNoIHZhbGlkYXRpb24gaXNzdWVcbiAgICAgIC8vIGV4YW1wbGU6IHsgcmVxdWlyZWQ6IHRydWUgfVxuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB2YXIgZXJyb3IsIHByb3BlcnRpZXM7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBzd2l0Y2ggKGtleSkge1xuICAgICAgICAgICAgY2FzZSAndHlwZSc6XG4gICAgICAgICAgICAgIHZhciB0eXBlID0gdHlwZW9mIG8uZGF0YTtcblxuICAgICAgICAgICAgICAvLyBmdXJ0aGVyIGRpc2NvdmVyIHR5cGVzXG4gICAgICAgICAgICAgIGlmICh0eXBlID09PSAnbnVtYmVyJyAmJiAoJycgKyBvLmRhdGEpLm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnaW50ZWdlcic7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcgJiYgQXJyYXkuaXNBcnJheShvLmRhdGEpKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdhcnJheSc7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyB0aGUgdmFsdWUgb2YgdHlwZSBpcyB0aGUgcmVxdWlyZWQgdHlwZSAoZXg6IHsgdHlwZTogJ3N0cmluZycgfSlcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ0lOVkFMSURfVFlQRScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0ludmFsaWQgdHlwZTogJyArIHR5cGUgKyAnIHNob3VsZCBiZSAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAoaXNBcnJheShvLnZhbGlkYXRpb25ba2V5XSkgPyAgJ29uZSBvZiAnIDogICcnKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG8udmFsaWRhdGlvbltrZXldXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdyZXF1aXJlZCc6XG4gICAgICAgICAgICAgIHByb3BlcnRpZXMgPSBvLm5zO1xuXG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdPQkpFQ1RfUkVRVUlSRUQnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdNaXNzaW5nIHJlcXVpcmVkIHByb3BlcnR5OiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW3Byb3BlcnRpZXMubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21pbmltdW0nOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnTUlOSU1VTScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1ZhbHVlICcgKyBvLmRhdGEgKyAnIGlzIGxlc3MgdGhhbiBtaW5pbXVtICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm1pbmltdW1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21heGltdW0nOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnTUFYSU1VTScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1ZhbHVlICcgKyBvLmRhdGEgKyAnIGlzIGdyZWF0ZXIgdGhhbiBtYXhpbXVtICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm1heGltdW1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ211bHRpcGxlT2YnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnTVVMVElQTEVfT0YnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdWYWx1ZSAnICsgby5kYXRhICsgJyBpcyBub3QgYSBtdWx0aXBsZSBvZiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBvLnNjaGVtYS5tdWx0aXBsZU9mXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdwYXR0ZXJuJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ1BBVFRFUk4nLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTdHJpbmcgZG9lcyBub3QgbWF0Y2ggcGF0dGVybjogJyArIG8uc2NoZW1hLnBhdHRlcm5cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21pbkxlbmd0aCc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdNSU5fTEVOR1RIJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnU3RyaW5nIGlzIHRvbyBzaG9ydCAoJyArIG8uZGF0YS5sZW5ndGggKyAnIGNoYXJzKSwgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ21pbmltdW0gJyArIG8uc2NoZW1hLm1pbkxlbmd0aFxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWF4TGVuZ3RoJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ01BWF9MRU5HVEgnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTdHJpbmcgaXMgdG9vIGxvbmcgKCcgKyBvLmRhdGEubGVuZ3RoICsgJyBjaGFycyksICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICdtYXhpbXVtICcgKyBvLnNjaGVtYS5tYXhMZW5ndGhcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21pbkl0ZW1zJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ0FSUkFZX0xFTkdUSF9TSE9SVCcsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0FycmF5IGlzIHRvbyBzaG9ydCAoJyArIG8uZGF0YS5sZW5ndGggKyAnKSwgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ21pbmltdW0gJyArIG8uc2NoZW1hLm1pbkl0ZW1zXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdtYXhJdGVtcyc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdBUlJBWV9MRU5HVEhfTE9ORycsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0FycmF5IGlzIHRvbyBsb25nICgnICsgby5kYXRhLmxlbmd0aCArICcpLCBtYXhpbXVtICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm1heEl0ZW1zXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd1bmlxdWVJdGVtcyc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdBUlJBWV9VTklRVUUnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBcnJheSBpdGVtcyBhcmUgbm90IHVuaXF1ZSdcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21pblByb3BlcnRpZXMnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnT0JKRUNUX1BST1BFUlRJRVNfTUlOSU1VTScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1RvbyBmZXcgcHJvcGVydGllcyBkZWZpbmVkICgnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyhvLmRhdGEpLmxlbmd0aCArICcpLCBtaW5pbXVtICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm1pblByb3BlcnRpZXNcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21heFByb3BlcnRpZXMnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnT0JKRUNUX1BST1BFUlRJRVNfTUFYSU1VTScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1RvbyBtYW55IHByb3BlcnRpZXMgZGVmaW5lZCAoJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXMoby5kYXRhKS5sZW5ndGggKyAnKSwgbWF4aW11bSAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBvLnNjaGVtYS5tYXhQcm9wZXJ0aWVzXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdlbnVtJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ0VOVU1fTUlTTUFUQ0gnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdObyBlbnVtIG1hdGNoICgnICsgby5kYXRhICsgJyksIGV4cGVjdHM6ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hWydlbnVtJ10uam9pbignLCAnKVxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbm90JzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ05PVF9QQVNTRUQnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdEYXRhIG1hdGNoZXMgc2NoZW1hIGZyb20gXCJub3RcIidcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2FkZGl0aW9uYWwnOlxuICAgICAgICAgICAgICBwcm9wZXJ0aWVzID0gby5ucztcblxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnQURESVRJT05BTF9QUk9QRVJUSUVTJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQWRkaXRpb25hbCBwcm9wZXJ0aWVzIG5vdCBhbGxvd2VkOiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW3Byb3BlcnRpZXMubGVuZ3RoIC0gMV1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIC8vIGlnbm9yZSBlcnJvcnNcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHVuaGFuZGxlZCBlcnJvcnNcbiAgICAgICAgaWYgKCFlcnJvcikge1xuICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgY29kZTogJ0ZBSUxFRCcsXG4gICAgICAgICAgICBtZXNzYWdlOiAnVmFsaWRhdGlvbiBlcnJvcjogJyArIGtleVxuICAgICAgICAgIH07XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvLnZhbGlkYXRpb25ba2V5XSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgPSAnICgnICsgby52YWxpZGF0aW9uW2tleV0gKyAnKSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAvLyBpZ25vcmUgZXJyb3JzXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZXJyb3IuY29kZSA9ICdWQUxJREFUSU9OXycgKyBlcnJvci5jb2RlO1xuICAgICAgICBpZiAoby5kYXRhICE9PSB1bmRlZmluZWQpIGVycm9yLmRhdGEgPSBvLmRhdGE7XG4gICAgICAgIGVycm9yLnBhdGggPSBvLm5zO1xuICAgICAgICBlcnJvcnMucHVzaChlcnJvcik7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gaGFuZGxlIGFsbCBub24tbGVhZiBjaGlsZHJlblxuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB2YXIgcztcblxuICAgICAgICBpZiAoby5zY2hlbWEuJHJlZikge1xuICAgICAgICAgIGlmIChvLnNjaGVtYS4kcmVmLm1hdGNoKC8jXFwvZGVmaW5pdGlvbnNcXC8vKSkge1xuICAgICAgICAgICAgby5zY2hlbWEgPSBvLmRlZmluaXRpb25zW28uc2NoZW1hLiRyZWYuc2xpY2UoMTQpXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgby5zY2hlbWEgPSBvLnNjaGVtYS4kcmVmO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICh0eXBlb2Ygby5zY2hlbWEgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBvLnNjaGVtYSA9IG8uZW52LnJlc29sdmVSZWYobnVsbCwgby5zY2hlbWEpO1xuICAgICAgICAgICAgaWYgKG8uc2NoZW1hKSBvLnNjaGVtYSA9IG8uc2NoZW1hWzBdO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvLnNjaGVtYSAmJiBvLnNjaGVtYS50eXBlKSB7XG4gICAgICAgICAgaWYgKGFsbG93c1R5cGUoby5zY2hlbWEsICdvYmplY3QnKSkge1xuICAgICAgICAgICAgaWYgKG8uc2NoZW1hLnByb3BlcnRpZXMgJiYgby5zY2hlbWEucHJvcGVydGllc1trZXldKSB7XG4gICAgICAgICAgICAgIHMgPSBvLnNjaGVtYS5wcm9wZXJ0aWVzW2tleV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghcyAmJiBvLnNjaGVtYS5wYXR0ZXJuUHJvcGVydGllcykge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyhvLnNjaGVtYS5wYXR0ZXJuUHJvcGVydGllcykuc29tZShmdW5jdGlvbihwa2V5KSB7XG4gICAgICAgICAgICAgICAgaWYgKGtleS5tYXRjaChuZXcgUmVnRXhwKHBrZXkpKSkge1xuICAgICAgICAgICAgICAgICAgcyA9IG8uc2NoZW1hLnBhdHRlcm5Qcm9wZXJ0aWVzW3BrZXldO1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFzICYmIG8uc2NoZW1hLmhhc093blByb3BlcnR5KCdhZGRpdGlvbmFsUHJvcGVydGllcycpKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2Ygby5zY2hlbWEuYWRkaXRpb25hbFByb3BlcnRpZXMgPT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgICAgIHMgPSB7fTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzID0gby5zY2hlbWEuYWRkaXRpb25hbFByb3BlcnRpZXM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoYWxsb3dzVHlwZShvLnNjaGVtYSwgJ2FycmF5JykpIHtcbiAgICAgICAgICAgIHMgPSBvLnNjaGVtYS5pdGVtcztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb3B0cyA9IHtcbiAgICAgICAgICBlbnY6IG8uZW52LFxuICAgICAgICAgIHNjaGVtYTogcyB8fCB7fSxcbiAgICAgICAgICBuczogby5ucy5jb25jYXQoa2V5KVxuICAgICAgICB9O1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgb3B0cy5kYXRhID0gby5kYXRhW2tleV07XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIC8vIGlnbm9yZSBlcnJvcnNcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgb3B0cy52YWxpZGF0aW9uID0gby52YWxpZGF0aW9uW2tleV0uc2NoZW1hID9cbiAgICAgICAgICAgIG8udmFsaWRhdGlvbltrZXldLnNjaGVtYSA6XG4gICAgICAgICAgICBvLnZhbGlkYXRpb25ba2V5XTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgb3B0cy52YWxpZGF0aW9uID0ge307XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIG9wdHMuZGVmaW5pdGlvbnMgPSBzLmRlZmluaXRpb25zIHx8IG8uZGVmaW5pdGlvbnM7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgIG9wdHMuZGVmaW5pdGlvbnMgPSBvLmRlZmluaXRpb25zO1xuICAgICAgICB9XG5cbiAgICAgICAgZXJyb3JzID0gZXJyb3JzLmNvbmNhdChtYWtlKG9wdHMpKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBlcnJvcnM7XG4gIH1cblxuICBmdW5jdGlvbiBhbGxvd3NUeXBlKHNjaGVtYSwgdHlwZSkge1xuICAgIGlmICh0eXBlb2Ygc2NoZW1hLnR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gc2NoZW1hLnR5cGUgPT09IHR5cGU7XG4gICAgfVxuICAgIGlmIChpc0FycmF5KHNjaGVtYS50eXBlKSkge1xuICAgICAgcmV0dXJuIHNjaGVtYS50eXBlLmluZGV4T2YodHlwZSkgIT09IC0xO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBmdW5jdGlvbiBpc0FycmF5KG9iaikge1xuICAgIGlmICh0eXBlb2YgQXJyYXkuaXNBcnJheSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkob2JqKTtcbiAgICB9XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nO1xuICB9XG5cbiAgZnVuY3Rpb24gZm9ybWF0UGF0aChvcHRpb25zKSB7XG4gICAgdmFyIHJvb3QgPSBvcHRpb25zLmhhc093blByb3BlcnR5KCdyb290JykgP1xuICAgICAgb3B0aW9ucy5yb290IDogJyQnO1xuXG4gICAgdmFyIHNlcCA9IG9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ3NlcCcpID9cbiAgICAgIG9wdGlvbnMuc2VwIDogJy4nO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICB2YXIgcGF0aCA9IHJvb3Q7XG5cbiAgICAgIGVycm9yLnBhdGguZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgcGF0aCArPSBrZXkubWF0Y2goL15cXGQrJC8pID9cbiAgICAgICAgICAnWycgKyBrZXkgKyAnXScgOlxuICAgICAgICAgIGtleS5tYXRjaCgvXltBLVpfJF1bMC05QS1aXyRdKiQvaSkgP1xuICAgICAgICAgICAgKHNlcCArIGtleSkgOlxuICAgICAgICAgICAgKCdbJyArIEpTT04uc3RyaW5naWZ5KGtleSkgKyAnXScpO1xuICAgICAgfSk7XG5cbiAgICAgIGVycm9yLnBhdGggPSBwYXRoO1xuXG4gICAgICByZXR1cm4gZXJyb3I7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGpqdmUoZW52KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGpqdmUoc2NoZW1hLCBkYXRhLCByZXN1bHQsIG9wdGlvbnMpIHtcbiAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQudmFsaWRhdGlvbikgcmV0dXJuIFtdO1xuXG4gICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgICAgaWYgKHR5cGVvZiBzY2hlbWEgPT09ICdzdHJpbmcnKSB7IHNjaGVtYSA9IGVudi5zY2hlbWFbc2NoZW1hXTsgfVxuXG4gICAgICB2YXIgZXJyb3JzID0gbWFrZSh7XG4gICAgICAgIGVudjogZW52LFxuICAgICAgICBzY2hlbWE6IHNjaGVtYSxcbiAgICAgICAgZGF0YTogZGF0YSxcbiAgICAgICAgdmFsaWRhdGlvbjogcmVzdWx0LnZhbGlkYXRpb24sXG4gICAgICAgIG5zOiBbXSxcbiAgICAgICAgZGVmaW5pdGlvbnM6IHNjaGVtYS5kZWZpbml0aW9ucyB8fCB7fVxuICAgICAgfSk7XG5cbiAgICAgIGlmIChlcnJvcnMubGVuZ3RoICYmIG9wdGlvbnMuZm9ybWF0UGF0aCAhPT0gZmFsc2UpIHtcbiAgICAgICAgcmV0dXJuIGVycm9ycy5tYXAoZm9ybWF0UGF0aChvcHRpb25zKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBlcnJvcnM7XG4gICAgfTtcbiAgfVxuXG4gIC8vIEV4cG9ydCBmb3IgdXNlIGluIHNlcnZlciBhbmQgY2xpZW50LlxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gamp2ZTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoZnVuY3Rpb24oKSB7IHJldHVybiBqanZlOyB9KTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLmpqdmUgPSBqanZlO1xuICB9XG59KS5jYWxsKHRoaXMpO1xuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2FwaURlY2xhcmF0aW9uLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwic3dhZ2dlclZlcnNpb25cIiwgXCJiYXNlUGF0aFwiLCBcImFwaXNcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwic3dhZ2dlclZlcnNpb25cIjogeyBcImVudW1cIjogWyBcIjEuMlwiIF0gfSxcbiAgICAgICAgXCJhcGlWZXJzaW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJiYXNlUGF0aFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCIsXG4gICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeaHR0cHM/Oi8vXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXNvdXJjZVBhdGhcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiLFxuICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXi9cIlxuICAgICAgICB9LFxuICAgICAgICBcImFwaXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaU9iamVjdFwiIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJtb2RlbHNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJtb2RlbHNPYmplY3QuanNvbiNcIlxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInByb2R1Y2VzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjogeyBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgIH0sXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJhcGlPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJwYXRoXCIsIFwib3BlcmF0aW9uc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwicGF0aFwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaS10ZW1wbGF0ZVwiLFxuICAgICAgICAgICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeL1wiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcIm9wZXJhdGlvbnNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwib3BlcmF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWltZVR5cGVBcnJheVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJtaW1lLXR5cGVcIlxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9iYXNpY0F1dGhcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaUtleVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiYmFzaWNBdXRoXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImJhc2ljQXV0aFwiIF0gfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJhcGlLZXlcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiLCBcInBhc3NBc1wiLCBcImtleW5hbWVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImFwaUtleVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcInBhc3NBc1wiOiB7IFwiZW51bVwiOiBbIFwiaGVhZGVyXCIsIFwicXVlcnlcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJrZXluYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJvYXV0aDJcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIsIFwiZ3JhbnRUeXBlc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwib2F1dGgyXCIgXSB9LFxuICAgICAgICAgICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImdyYW50VHlwZXNcIjogeyBcIiRyZWZcIjogXCJvYXV0aDJHcmFudFR5cGUuanNvbiNcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm9hdXRoMlNjb3BlXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwic2NvcGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInNjb3BlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfVxuICAgIH1cbn1cblxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2RhdGFUeXBlLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkRhdGEgdHlwZSBhcyBkZXNjcmliZWQgYnkgdGhlIHNwZWNpZmljYXRpb24gKHZlcnNpb24gMS4yKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVmVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92b2lkVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21vZGVsVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcnJheVR5cGVcIiB9XG4gICAgXSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJyZWZUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInZvaWRUeXBlXCI6IHtcbiAgICAgICAgICAgIFwiZW51bVwiOiBbIHsgXCJ0eXBlXCI6IFwidm9pZFwiIH0gXVxuICAgICAgICB9LFxuICAgICAgICBcIm1vZGVsVHlwZVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYm9vbGVhblwiLCBcImludGVnZXJcIiwgXCJudW1iZXJcIiwgXCJzdHJpbmdcIiwgXCJhcnJheVwiIF1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwicHJpbWl0aXZlVHlwZVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bWJlclwiLCBcInN0cmluZ1wiIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImRlZmF1bHRWYWx1ZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHsgXCJ0eXBlXCI6IFsgXCJhcnJheVwiLCBcIm9iamVjdFwiLCBcIm51bGxcIiBdIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJtaW5pbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcIm1heGltdW1cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgICAgICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImludDMyXCIsIFwiaW50NjRcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwibnVtYmVyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiZmxvYXRcIiwgXCJkb3VibGVcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwic3RyaW5nXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcImJ5dGVcIiwgXCJkYXRlXCIsIFwiZGF0ZS10aW1lXCIgXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiLCBcIm51bWJlclwiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYXJyYXlUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiwgXCJpdGVtc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYXJyYXlcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2l0ZW1zT2JqZWN0XCIgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZWZUeXBlXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJhbGxPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVUeXBlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgfVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9kYXRhVHlwZUJhc2UuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGF0YSB0eXBlIGZpZWxkcyAoc2VjdGlvbiA0LjMuMylcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgeyBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSB9LFxuICAgICAgICB7IFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdIH1cbiAgICBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiJHJlZlwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZWZhdWx0VmFsdWVcIjoge1xuICAgICAgICAgICAgXCJub3RcIjogeyBcInR5cGVcIjogWyBcImFycmF5XCIsIFwib2JqZWN0XCIsIFwibnVsbFwiIF0gfVxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlLFxuICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2l0ZW1zT2JqZWN0XCIgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJpbnQzMlwiLCBcImludDY0XCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwibnVtYmVyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImZsb2F0XCIsIFwiZG91YmxlXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwic3RyaW5nXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYnl0ZVwiLCBcImRhdGVcIiwgXCJkYXRlLXRpbWVcIiBdXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcIml0ZW1zT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcIiRyZWZcIiBdLFxuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjoge30sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHt9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvaW5mb09iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwiZGVzY3JpcHRpb25cIjogXCJpbmZvIG9iamVjdCAoc2VjdGlvbiA1LjEuMylcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJ0aXRsZVwiLCBcImRlc2NyaXB0aW9uXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInRpdGxlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwidGVybXNPZlNlcnZpY2VVcmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICBcImNvbnRhY3RcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJlbWFpbFwiIH0sXG4gICAgICAgIFwibGljZW5zZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwibGljZW5zZVVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH1cbiAgICB9LFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2Vcbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvbW9kZWxzT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwiaWRcIiwgXCJwcm9wZXJ0aWVzXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImlkXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Byb3BlcnR5T2JqZWN0XCIgfVxuICAgICAgICB9LFxuICAgICAgICBcInN1YlR5cGVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcImRpc2NyaW1pbmF0b3JcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwic3ViVHlwZXNcIjogWyBcImRpc2NyaW1pbmF0b3JcIiBdXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJwcm9wZXJ0eU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwibm90XCI6IHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCJcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59XG5cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9vYXV0aDJHcmFudFR5cGUuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcIm1pblByb3BlcnRpZXNcIjogMSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImltcGxpY2l0XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9pbXBsaWNpdFwiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbl9jb2RlXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hdXRob3JpemF0aW9uQ29kZVwiIH1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcImltcGxpY2l0XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwibG9naW5FbmRwb2ludFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwibG9naW5FbmRwb2ludFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbG9naW5FbmRwb2ludFwiIH0sXG4gICAgICAgICAgICAgICAgXCJ0b2tlbk5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25Db2RlXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidG9rZW5FbmRwb2ludFwiLCBcInRva2VuUmVxdWVzdEVuZHBvaW50XCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0b2tlbkVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90b2tlbkVuZHBvaW50XCIgfSxcbiAgICAgICAgICAgICAgICBcInRva2VuUmVxdWVzdEVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90b2tlblJlcXVlc3RFbmRwb2ludFwiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibG9naW5FbmRwb2ludFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInVybFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlbkVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICAgICAgICAgIFwidG9rZW5OYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblJlcXVlc3RFbmRwb2ludFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInVybFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcbiAgICAgICAgICAgICAgICBcImNsaWVudElkTmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJjbGllbnRTZWNyZXROYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfVxuICAgIH1cbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvb3BlcmF0aW9uT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJhbGxPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCIgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwibWV0aG9kXCIsIFwibmlja25hbWVcIiwgXCJwYXJhbWV0ZXJzXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJtZXRob2RcIjogeyBcImVudW1cIjogWyBcIkdFVFwiLCBcIlBPU1RcIiwgXCJQVVRcIiwgXCJQQVRDSFwiLCBcIkRFTEVURVwiLCBcIk9QVElPTlNcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJzdW1tYXJ5XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwibWF4TGVuZ3RoXCI6IDEyMCB9LFxuICAgICAgICAgICAgICAgIFwibm90ZXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwibmlja25hbWVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXlthLXpBLVowLTlfXSskXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiYXV0aG9yaXphdGlvbk9iamVjdC5qc29uIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZVwiXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwicGFyYW1ldGVyc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJwYXJhbWV0ZXJPYmplY3QuanNvbiNcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInJlc3BvbnNlTWVzc2FnZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZU1lc3NhZ2VPYmplY3RcIn1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwicHJvZHVjZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICAgICAgICAgIFwiY29uc3VtZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVwcmVjYXRlZFwiOiB7IFwiZW51bVwiOiBbIFwidHJ1ZVwiLCBcImZhbHNlXCIgXSB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICBdLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInJlc3BvbnNlTWVzc2FnZU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcImNvZGVcIiwgXCJtZXNzYWdlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJjb2RlXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZmMyNjE2c2VjdGlvbjEwXCIgfSxcbiAgICAgICAgICAgICAgICBcIm1lc3NhZ2VcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwicmVzcG9uc2VNb2RlbFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJyZmMyNjE2c2VjdGlvbjEwXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAxMDAsXG4gICAgICAgICAgICBcIm1heGltdW1cIjogNjAwLFxuICAgICAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW1lVHlwZUFycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcIm1pbWUtdHlwZVwiXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcGFyYW1ldGVyT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJhbGxPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiZGF0YVR5cGVCYXNlLmpzb24jXCIgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwicGFyYW1UeXBlXCIsIFwibmFtZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwicGFyYW1UeXBlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJwYXRoXCIsIFwicXVlcnlcIiwgXCJib2R5XCIsIFwiaGVhZGVyXCIsIFwiZm9ybVwiIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwibmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIFwiYWxsb3dNdWx0aXBsZVwiOiB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJ0eXBlIEZpbGUgcmVxdWlyZXMgc3BlY2lhbCBwYXJhbVR5cGUgYW5kIGNvbnN1bWVzXCIsXG4gICAgICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcIm5vdFwiOiB7IFwiZW51bVwiOiBbIFwiRmlsZVwiIF0gfSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiRmlsZVwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwicGFyYW1UeXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJmb3JtXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiZW51bVwiOiBbIFwibXVsdGlwYXJ0L2Zvcm0tZGF0YVwiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgXVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL3Jlc291cmNlTGlzdGluZy5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInN3YWdnZXJWZXJzaW9uXCIsIFwiYXBpc1wiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJzd2FnZ2VyVmVyc2lvblwiOiB7IFwiZW51bVwiOiBbIFwiMS4yXCIgXSB9LFxuICAgICAgICBcImFwaXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJyZXNvdXJjZU9iamVjdC5qc29uI1wiIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJhcGlWZXJzaW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJpbmZvXCI6IHsgXCIkcmVmXCI6IFwiaW5mb09iamVjdC5qc29uI1wiIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbnNcIjogeyBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jXCIgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9yZXNvdXJjZU9iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInBhdGhcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicGF0aFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgfSxcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICBcInRpdGxlXCI6IFwiQSBKU09OIFNjaGVtYSBmb3IgU3dhZ2dlciAyLjAgQVBJLlwiLFxuICBcImlkXCI6IFwiaHR0cDovL3N3YWdnZXIuaW8vdjIvc2NoZW1hLmpzb24jXCIsXG4gIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgXCJyZXF1aXJlZFwiOiBbXG4gICAgXCJzd2FnZ2VyXCIsXG4gICAgXCJpbmZvXCIsXG4gICAgXCJwYXRoc1wiXG4gIF0sXG4gIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgIFwiXngtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICB9XG4gIH0sXG4gIFwicHJvcGVydGllc1wiOiB7XG4gICAgXCJzd2FnZ2VyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgXCIyLjBcIlxuICAgICAgXSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgU3dhZ2dlciB2ZXJzaW9uIG9mIHRoaXMgZG9jdW1lbnQuXCJcbiAgICB9LFxuICAgIFwiaW5mb1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2luZm9cIlxuICAgIH0sXG4gICAgXCJob3N0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIixcbiAgICAgIFwicGF0dGVyblwiOiBcIl5bXnt9LyA6XFxcXFxcXFxdKyg/OjpcXFxcZCspPyRcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgZnVsbHkgcXVhbGlmaWVkIFVSSSB0byB0aGUgaG9zdCBvZiB0aGUgQVBJLlwiXG4gICAgfSxcbiAgICBcImJhc2VQYXRoXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJwYXR0ZXJuXCI6IFwiXi9cIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgYmFzZSBwYXRoIHRvIHRoZSBBUEkuIEV4YW1wbGU6ICcvYXBpJy5cIlxuICAgIH0sXG4gICAgXCJzY2hlbWVzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxuICAgIH0sXG4gICAgXCJjb25zdW1lc1wiOiB7XG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgYWNjZXB0ZWQgYnkgdGhlIEFQSS5cIixcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgfSxcbiAgICBcInByb2R1Y2VzXCI6IHtcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBwcm9kdWNlLlwiLFxuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcbiAgICB9LFxuICAgIFwicGF0aHNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXRoc1wiXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyRGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJyZXNwb25zZXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZURlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwic2VjdXJpdHlcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVwiXG4gICAgfSxcbiAgICBcInNlY3VyaXR5RGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eURlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwidGFnc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdGFnXCJcbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICB9XG4gIH0sXG4gIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgIFwiaW5mb1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJHZW5lcmFsIGluZm9ybWF0aW9uIGFib3V0IHRoZSBBUEkuXCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ2ZXJzaW9uXCIsXG4gICAgICAgIFwidGl0bGVcIlxuICAgICAgXSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIHVuaXF1ZSBhbmQgcHJlY2lzZSB0aXRsZSBvZiB0aGUgQVBJLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidmVyc2lvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgc2VtYW50aWMgdmVyc2lvbiBudW1iZXIgb2YgdGhlIEFQSS5cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsb25nZXIgZGVzY3JpcHRpb24gb2YgdGhlIEFQSS4gU2hvdWxkIGJlIGRpZmZlcmVudCBmcm9tIHRoZSB0aXRsZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGVybXNPZlNlcnZpY2VcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgdGVybXMgb2Ygc2VydmljZSBmb3IgdGhlIEFQSS5cIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbnRhY3RcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29udGFjdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibGljZW5zZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9saWNlbnNlXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJjb250YWN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkNvbnRhY3QgaW5mb3JtYXRpb24gZm9yIHRoZSBvd25lcnMgb2YgdGhlIEFQSS5cIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgaWRlbnRpZnlpbmcgbmFtZSBvZiB0aGUgY29udGFjdCBwZXJzb24vb3JnYW5pemF0aW9uLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIFVSTCBwb2ludGluZyB0byB0aGUgY29udGFjdCBpbmZvcm1hdGlvbi5cIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW1haWxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgZW1haWwgYWRkcmVzcyBvZiB0aGUgY29udGFjdCBwZXJzb24vb3JnYW5pemF0aW9uLlwiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwiZW1haWxcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImxpY2Vuc2VcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCJcbiAgICAgIF0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIGxpY2Vuc2UgdHlwZS4gSXQncyBlbmNvdXJhZ2VkIHRvIHVzZSBhbiBPU0kgY29tcGF0aWJsZSBsaWNlbnNlLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIFVSTCBwb2ludGluZyB0byB0aGUgbGljZW5zZS5cIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aHNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUmVsYXRpdmUgcGF0aHMgdG8gdGhlIGluZGl2aWR1YWwgZW5kcG9pbnRzLiBUaGV5IG11c3QgYmUgcmVsYXRpdmUgdG8gdGhlICdiYXNlUGF0aCcuXCIsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJeL1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXRoSXRlbVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgIH0sXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiT25lIG9yIG1vcmUgSlNPTiBvYmplY3RzIGRlc2NyaWJpbmcgdGhlIHNjaGVtYXMgYmVpbmcgY29uc3VtZWQgYW5kIHByb2R1Y2VkIGJ5IHRoZSBBUEkuXCJcbiAgICB9LFxuICAgIFwicGFyYW1ldGVyRGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJcIlxuICAgICAgfSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJPbmUgb3IgbW9yZSBKU09OIHJlcHJlc2VudGF0aW9ucyBmb3IgcGFyYW1ldGVyc1wiXG4gICAgfSxcbiAgICBcInJlc3BvbnNlRGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVwiXG4gICAgICB9LFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIk9uZSBvciBtb3JlIEpTT04gcmVwcmVzZW50YXRpb25zIGZvciBwYXJhbWV0ZXJzXCJcbiAgICB9LFxuICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJpbmZvcm1hdGlvbiBhYm91dCBleHRlcm5hbCBkb2N1bWVudGF0aW9uXCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ1cmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiZXhhbXBsZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeW2EtejAtOS1dKy9bYS16MC05XFxcXC0rXSskXCI6IHt9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJtaW1lVHlwZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwicGF0dGVyblwiOiBcIl5bXFxcXHNhLXowLTlcXFxcLSs7XFxcXC49XFxcXC9dKyRcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgTUlNRSB0eXBlIG9mIHRoZSBIVFRQIG1lc3NhZ2UuXCJcbiAgICB9LFxuICAgIFwib3BlcmF0aW9uXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwicmVzcG9uc2VzXCJcbiAgICAgIF0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInRhZ3NcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwic3VtbWFyeVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgc3VtbWFyeSBvZiB0aGUgb3BlcmF0aW9uLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxvbmdlciBkZXNjcmlwdGlvbiBvZiB0aGUgb3BlcmF0aW9uLCBnaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9LFxuICAgICAgICBcIm9wZXJhdGlvbklkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBmcmllbmRseSBuYW1lIG9mIHRoZSBvcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcInByb2R1Y2VzXCI6IHtcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgdGhlIEFQSSBjYW4gcHJvZHVjZS5cIixcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbnN1bWVzXCI6IHtcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgdGhlIEFQSSBjYW4gY29uc3VtZS5cIixcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyc0xpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlc3BvbnNlc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlcHJlY2F0ZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aEl0ZW1cIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHV0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlbGV0ZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcIm9wdGlvbnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJoZWFkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0Y2hcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlcnNMaXN0XCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJyZXNwb25zZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUmVzcG9uc2Ugb2JqZWN0cyBuYW1lcyBjYW4gZWl0aGVyIGJlIGFueSB2YWxpZCBIVFRQIHN0YXR1cyBjb2RlIG9yICdkZWZhdWx0Jy5cIixcbiAgICAgIFwibWluUHJvcGVydGllc1wiOiAxLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl4oWzAtOV17M30pJHxeKGRlZmF1bHQpJFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVZhbHVlXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwibm90XCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicmVzcG9uc2VWYWx1ZVwiOiB7XG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9qc29uUmVmZXJlbmNlXCJcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0sXG4gICAgXCJyZXNwb25zZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcImRlc2NyaXB0aW9uXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtYVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhhbXBsZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhhbXBsZXNcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJoZWFkZXJzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIFwiaGVhZGVyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJ2ZW5kb3JFeHRlbnNpb25cIjoge1xuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkFueSBwcm9wZXJ0eSBzdGFydGluZyB3aXRoIHgtIGlzIHZhbGlkLlwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB0cnVlLFxuICAgICAgXCJhZGRpdGlvbmFsSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJib2R5UGFyYW1ldGVyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiLFxuICAgICAgICBcImluXCIsXG4gICAgICAgIFwic2NoZW1hXCJcbiAgICAgIF0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRodWItZmxhdm9yZWQgbWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImJvZHlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtYVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJoZWFkZXJQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJoZWFkZXJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInF1ZXJ5UGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicXVlcnlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFdpdGhNdWx0aVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImZvcm1EYXRhUGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiZm9ybURhdGFcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJmaWxlXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aFBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIHRydWVcbiAgICAgICAgICBdLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInBhdGhcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm5vbkJvZHlQYXJhbWV0ZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCIsXG4gICAgICAgIFwiaW5cIixcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyUGFyYW1ldGVyU3ViU2NoZW1hXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZm9ybURhdGFQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9xdWVyeVBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdGhQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInBhcmFtZXRlclwiOiB7XG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYm9keVBhcmFtZXRlclwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL25vbkJvZHlQYXJhbWV0ZXJcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInNjaGVtYVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGRldGVybWluaXN0aWMgdmVyc2lvbiBvZiBhIEpTT04gU2NoZW1hIG9iamVjdC5cIixcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdGl0bGVcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZXNjcmlwdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4UHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90eXBlXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgXSxcbiAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJhbGxPZlwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGlzY3JpbWluYXRvclwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJyZWFkT25seVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInhtbFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy94bWxcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4YW1wbGVcIjoge31cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicHJpbWl0aXZlc0l0ZW1zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2VjdXJpdHlSZXF1aXJlbWVudFwiXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInNlY3VyaXR5UmVxdWlyZW1lbnRcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICB9XG4gICAgfSxcbiAgICBcInhtbFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZXNwYWNlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInByZWZpeFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdHRyaWJ1dGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ3cmFwcGVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwidGFnXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInNlY3VyaXR5RGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9iYXNpY0F1dGhlbnRpY2F0aW9uU2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcGlLZXlTZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMkltcGxpY2l0U2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJQYXNzd29yZFNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyQXBwbGljYXRpb25TZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMkFjY2Vzc0NvZGVTZWN1cml0eVwiXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9XG4gICAgfSxcbiAgICBcImJhc2ljQXV0aGVudGljYXRpb25TZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImJhc2ljXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJhcGlLZXlTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwibmFtZVwiLFxuICAgICAgICBcImluXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFwaUtleVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImhlYWRlclwiLFxuICAgICAgICAgICAgXCJxdWVyeVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgySW1wbGljaXRTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiaW1wbGljaXRcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJQYXNzd29yZFNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwidG9rZW5VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicGFzc3dvcmRcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgyQXBwbGljYXRpb25TZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcInRva2VuVXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcIm9hdXRoMlwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZsb3dcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFwcGxpY2F0aW9uXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3Blc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidG9rZW5VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMkFjY2Vzc0NvZGVTZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ0eXBlXCIsXG4gICAgICAgIFwiZmxvd1wiLFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIixcbiAgICAgICAgXCJ0b2tlblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJhY2Nlc3NDb2RlXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NvcGVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3Blc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJTY29wZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgIH1cbiAgICB9LFxuICAgIFwibWVkaWFUeXBlTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVcIlxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJzTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBwYXJhbWV0ZXJzIG5lZWRlZCB0byBzZW5kIGEgdmFsaWQgQVBJIGNhbGwuXCIsXG4gICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICBcImFkZGl0aW9uYWxJdGVtc1wiOiBmYWxzZSxcbiAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlclwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2pzb25SZWZlcmVuY2VcIlxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJzY2hlbWVzTGlzdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSB0cmFuc2ZlciBwcm90b2NvbCBvZiB0aGUgQVBJLlwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgIFwiaHR0cFwiLFxuICAgICAgICAgIFwiaHR0cHNcIixcbiAgICAgICAgICBcIndzXCIsXG4gICAgICAgICAgXCJ3c3NcIlxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImVudW1cIjogW1xuICAgICAgICBcImNzdlwiLFxuICAgICAgICBcInNzdlwiLFxuICAgICAgICBcInRzdlwiLFxuICAgICAgICBcInBpcGVzXCJcbiAgICAgIF0sXG4gICAgICBcImRlZmF1bHRcIjogXCJjc3ZcIlxuICAgIH0sXG4gICAgXCJjb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgXCJjc3ZcIixcbiAgICAgICAgXCJzc3ZcIixcbiAgICAgICAgXCJ0c3ZcIixcbiAgICAgICAgXCJwaXBlc1wiLFxuICAgICAgICBcIm11bHRpXCJcbiAgICAgIF0sXG4gICAgICBcImRlZmF1bHRcIjogXCJjc3ZcIlxuICAgIH0sXG4gICAgXCJ0aXRsZVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90aXRsZVwiXG4gICAgfSxcbiAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2Rlc2NyaXB0aW9uXCJcbiAgICB9LFxuICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZWZhdWx0XCJcbiAgICB9LFxuICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tdWx0aXBsZU9mXCJcbiAgICB9LFxuICAgIFwibWF4aW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tYXhpbXVtXCJcbiAgICB9LFxuICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICB9LFxuICAgIFwibWluaW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9taW5pbXVtXCJcbiAgICB9LFxuICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICB9LFxuICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgIH0sXG4gICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICB9LFxuICAgIFwicGF0dGVyblwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9wYXR0ZXJuXCJcbiAgICB9LFxuICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgfSxcbiAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgfSxcbiAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3VuaXF1ZUl0ZW1zXCJcbiAgICB9LFxuICAgIFwiZW51bVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9lbnVtXCJcbiAgICB9LFxuICAgIFwianNvblJlZmVyZW5jZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkNvcmUgc2NoZW1hIG1ldGEtc2NoZW1hXCIsXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwic2NoZW1hQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICB9LFxuICAgICAgICBcInBvc2l0aXZlSW50ZWdlclwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcIm1pbmltdW1cIjogMFxuICAgICAgICB9LFxuICAgICAgICBcInBvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCI6IHtcbiAgICAgICAgICAgIFwiYWxsT2ZcIjogWyB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSwgeyBcImRlZmF1bHRcIjogMCB9IF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzaW1wbGVUeXBlc1wiOiB7XG4gICAgICAgICAgICBcImVudW1cIjogWyBcImFycmF5XCIsIFwiYm9vbGVhblwiLCBcImludGVnZXJcIiwgXCJudWxsXCIsIFwibnVtYmVyXCIsIFwib2JqZWN0XCIsIFwic3RyaW5nXCIgXVxuICAgICAgICB9LFxuICAgICAgICBcInN0cmluZ0FycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9XG4gICAgfSxcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImlkXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcIiRzY2hlbWFcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge30sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAwLFxuICAgICAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwicmVnZXhcIlxuICAgICAgICB9LFxuICAgICAgICBcImFkZGl0aW9uYWxJdGVtc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1heFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXG4gICAgICAgIFwibWluUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxuICAgICAgICBcInJlcXVpcmVkXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zdHJpbmdBcnJheVwiIH0sXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICAgICAgeyBcInR5cGVcIjogXCJib29sZWFuXCIgfSxcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCIgfVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zaW1wbGVUeXBlc1wiIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zaW1wbGVUeXBlc1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImFsbE9mXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH0sXG4gICAgICAgIFwiYW55T2ZcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfSxcbiAgICAgICAgXCJvbmVPZlwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9LFxuICAgICAgICBcIm5vdFwiOiB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiBbIFwibWF4aW11bVwiIF0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiBbIFwibWluaW11bVwiIF1cbiAgICB9LFxuICAgIFwiZGVmYXVsdFwiOiB7fVxufVxuIl19
