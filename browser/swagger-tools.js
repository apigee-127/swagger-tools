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

  if (!_.isUndefined(schemaNames)) {
    // Compile the necessary schemas
    _.each(schemaNames, function (schemaName) {
      var clone = _.cloneDeep(spec.schemas[schemaName]);

      clone.id = schemaName;

      validator.addSchema(schemaName, clone);
    }.bind(this));
  }

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
    if (path.length > 3 || toJsonPointer(path).indexOf('#/definitions/') === -1) {
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
    throw new Error('Unable to compose model so validation is not possible');
  }

  validator = createValidator(this);
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
  // TODO: Fix this to handle remote references

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
    return part.replace(/~/g, '~0').replace(/\//g, '~1');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuL2xpYi9zcGVjcy5qcyIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL2xpYi9oZWxwZXJzLmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvbGliL3ZhbGlkYXRvcnMuanMiLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9ub2RlX21vZHVsZXMvamp2ZS9qanZlLmpzIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvYXBpRGVjbGFyYXRpb24uanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9kYXRhVHlwZUJhc2UuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL2luZm9PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL21vZGVsc09iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9vcGVyYXRpb25PYmplY3QuanNvbiIsIi9Vc2Vycy9qd2hpdGxvY2svd29ya3NwYWNlcy9wZXJzb25hbC9zd2FnZ2VyLXRvb2xzL3NjaGVtYXMvMS4yL3BhcmFtZXRlck9iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8xLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzLzEuMi9yZXNvdXJjZU9iamVjdC5qc29uIiwiL1VzZXJzL2p3aGl0bG9jay93b3Jrc3BhY2VzL3BlcnNvbmFsL3N3YWdnZXItdG9vbHMvc2NoZW1hcy8yLjAvc2NoZW1hLmpzb24iLCIvVXNlcnMvandoaXRsb2NrL3dvcmtzcGFjZXMvcGVyc29uYWwvc3dhZ2dlci10b29scy9zY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3oxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzM4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBBcGlnZWUgQ29ycG9yYXRpb25cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG52YXIgamp2ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cuamp2IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5qanYgOiBudWxsKTtcbnZhciBqanZlID0gcmVxdWlyZSgnamp2ZScpO1xudmFyIG1kNSA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93LlNwYXJrTUQ1IDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5TcGFya01ENSA6IG51bGwpO1xudmFyIHRyYXZlcnNlID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cudHJhdmVyc2UgOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLnRyYXZlcnNlIDogbnVsbCk7XG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xudmFyIHZhbGlkYXRvcnMgPSByZXF1aXJlKCcuL3ZhbGlkYXRvcnMnKTtcblxudmFyIGRyYWZ0MDRKc29uID0gcmVxdWlyZSgnLi4vc2NoZW1hcy9qc29uLXNjaGVtYS1kcmFmdC0wNC5qc29uJyk7XG52YXIgZHJhZnQwNFVybCA9ICdodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSc7XG52YXIgamp2T3B0aW9ucyA9IHtcbiAgY2hlY2tSZXF1aXJlZDogdHJ1ZSxcbiAgcmVtb3ZlQWRkaXRpb25hbDogZmFsc2UsXG4gIHVzZURlZmF1bHQ6IGZhbHNlLFxuICB1c2VDb2VyY2U6IGZhbHNlXG59O1xudmFyIGpqdmVPcHRpb25zID0ge1xuICBmb3JtYXRQYXRoOiBmYWxzZVxufTtcbnZhciBtZXRhZGF0YUNhY2hlID0ge307XG52YXIgcmVmVG9Kc29uUG9pbnRlciA9IGhlbHBlcnMucmVmVG9Kc29uUG9pbnRlcjtcbnZhciB0b0pzb25Qb2ludGVyID0gaGVscGVycy50b0pzb25Qb2ludGVyO1xuXG52YXIgY3JlYXRlVmFsaWRhdG9yID0gZnVuY3Rpb24gY3JlYXRlVmFsaWRhdG9yIChzcGVjLCBzY2hlbWFOYW1lcykge1xuICB2YXIgdmFsaWRhdG9yID0gamp2KGpqdk9wdGlvbnMpO1xuXG4gIC8vIERpc2FibGUgdGhlICd1cmknIGZvcm1hdCBjaGVja2VyIGFzIGl0J3MgZ290IGlzc3VlczogaHR0cHM6Ly9naXRodWIuY29tL2Fjb3JuZWpvL2pqdi9pc3N1ZXMvMjRcbiAgdmFsaWRhdG9yLmFkZEZvcm1hdCgndXJpJywgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0pO1xuXG4gIHZhbGlkYXRvci5hZGRTY2hlbWEoZHJhZnQwNFVybCwgZHJhZnQwNEpzb24pO1xuXG4gIGlmICghXy5pc1VuZGVmaW5lZChzY2hlbWFOYW1lcykpIHtcbiAgICAvLyBDb21waWxlIHRoZSBuZWNlc3Nhcnkgc2NoZW1hc1xuICAgIF8uZWFjaChzY2hlbWFOYW1lcywgZnVuY3Rpb24gKHNjaGVtYU5hbWUpIHtcbiAgICAgIHZhciBjbG9uZSA9IF8uY2xvbmVEZWVwKHNwZWMuc2NoZW1hc1tzY2hlbWFOYW1lXSk7XG5cbiAgICAgIGNsb25lLmlkID0gc2NoZW1hTmFtZTtcblxuICAgICAgdmFsaWRhdG9yLmFkZFNjaGVtYShzY2hlbWFOYW1lLCBjbG9uZSk7XG4gICAgfS5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIHZhbGlkYXRvci5qZSA9IGpqdmUodmFsaWRhdG9yKTtcblxuICByZXR1cm4gdmFsaWRhdG9yO1xufTtcblxudmFyIGNyZWF0ZUVycm9yT3JXYXJuaW5nID0gZnVuY3Rpb24gY3JlYXRlRXJyb3JPcldhcm5pbmcgKGNvZGUsIG1lc3NhZ2UsIGRhdGEsIHBhdGgsIGRlc3QpIHtcbiAgZGVzdC5wdXNoKHtcbiAgICBjb2RlOiBjb2RlLFxuICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgZGF0YTogZGF0YSxcbiAgICBwYXRoOiBwYXRoXG4gIH0pO1xufTtcblxudmFyIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nID0gZnVuY3Rpb24gY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcgKGRhdGEsIHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlVTRURfJyArIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCArICcgaXMgZGVmaW5lZCBidXQgaXMgbm90IHVzZWQ6ICcgKyB2YWwsIGRhdGEsIHBhdGgsIGRlc3QpO1xufTtcblxudmFyIHZhbGlkYXRlRXhpc3QgPSBmdW5jdGlvbiB2YWxpZGF0ZUV4aXN0IChkYXRhLCB2YWwsIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCwgcGF0aCwgZGVzdCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoZGF0YSkgJiYgZGF0YS5pbmRleE9mKHZhbCkgPT09IC0xKSB7XG4gICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyB2YWwsIHZhbCwgcGF0aCwgZGVzdCk7XG4gIH1cbn07XG5cbnZhciB2YWxpZGF0ZU5vRXhpc3QgPSBmdW5jdGlvbiB2YWxpZGF0ZU5vRXhpc3QgKGRhdGEsIHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChkYXRhKSAmJiBkYXRhLmluZGV4T2YodmFsKSA+IC0xKSB7XG4gICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyBhbHJlYWR5IGRlZmluZWQ6ICcgKyB2YWwsIHZhbCwgcGF0aCwgZGVzdCk7XG4gIH1cbn07XG5cbnZhciB2YWxpZGF0ZU5vRHVwbGljYXRlcyA9IGZ1bmN0aW9uIHZhbGlkYXRlTm9EdXBsaWNhdGVzIChkYXRhLCBjb2RlU3VmZml4LCBtc2dQcmVmaXgsIHBhdGgsIGRlc3QpIHtcbiAgdmFyIG5hbWUgPSBwYXRoW3BhdGgubGVuZ3RoIC0gMV07XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGRhdGEpICYmIGRhdGEubGVuZ3RoICE9PSBfLnVuaXEoZGF0YSkubGVuZ3RoKSB7XG4gICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV8nICsgY29kZVN1ZmZpeCwgbXNnUHJlZml4ICsgJyAnICsgbmFtZSArICcgaGFzIGR1cGxpY2F0ZSBpdGVtcycsIGRhdGEsIHBhdGgsIGRlc3QpO1xuICB9XG59O1xuXG52YXIgdmFsaWRhdGVBcnJheVR5cGUgPSBmdW5jdGlvbiB2YWxpZGF0ZUFycmF5VHlwZSAoZGF0YSwgcGF0aCwgZGVzdCkge1xuICAvLyBXZSBoYXZlIHRvIGRvIHRoaXMgbWFudWFsbHkgZm9yIG5vdyAoaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9pc3N1ZXMvMTc0KVxuICBpZiAoZGF0YS50eXBlID09PSAnYXJyYXknICYmIF8uaXNVbmRlZmluZWQoZGF0YS5pdGVtcykpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnT0JKRUNUX01JU1NJTkdfUkVRVUlSRURfUFJPUEVSVFknLCAnTWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0eTogaXRlbXMnLCBkYXRhLCBwYXRoLCBkZXN0KTtcbiAgfVxufTtcblxuLy8gVE9ETzogTW92ZSB0aGlzIHRvIGEgaGVscGVyXG5cbnZhciB2YWxpZGF0ZVBhcmFtZXRlckNvbnN0cmFpbnRzID0gZnVuY3Rpb24gdmFsaWRhdGVQYXJhbWV0ZXJDb25zdHJhaW50cyAoc3BlYywgcGFyYW1ldGVyLCB2YWwsIHBhdGgsIGRlc3QpIHtcbiAgc3dpdGNoIChzcGVjLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBUT0RPOiBNYWtlIHRoaXMgd29yayB3aXRoIHBhcmFtZXRlcnMgdGhhdCBoYXZlIHJlZmVyZW5jZXNcblxuICAgIHZhbGlkYXRlQXJyYXlUeXBlKHBhcmFtZXRlciwgcGF0aCwgZGVzdCk7XG5cbiAgICAvLyBWYWxpZGF0ZSB0aGUgdmFsdWUgdHlwZS9mb3JtYXQgKFNraXAgZm9yIGFycmF5IHNpbmNlIHdlIG1hbnVhbGx5IGhhbmRsZSBpdCBhYm92ZSBmb3Igbm93KVxuICAgIGlmIChwYXJhbWV0ZXIudHlwZSA9PT0gJ2FycmF5JyAmJiAhXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIuaXRlbXMpKSB7XG4gICAgICB0cnkge1xuICAgICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlVHlwZUFuZEZvcm1hdChwYXJhbWV0ZXIubmFtZSwgdmFsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbWV0ZXIudHlwZSA9PT0gJ2FycmF5JyA/IHBhcmFtZXRlci5pdGVtcy50eXBlIDogcGFyYW1ldGVyLnR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlci50eXBlID09PSAnYXJyYXknICYmIHBhcmFtZXRlci5pdGVtcy5mb3JtYXQgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlci5pdGVtcy5mb3JtYXQgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlci5mb3JtYXQpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIC8vIFRPRE86IFVwZGF0ZSB0byBub3RpZnkgb2YgJ0lOVkFMSURfRk9STUFUJ1xuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZyAoJ0lOVkFMSURfVFlQRScsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgZW51bVxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlRW51bShwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIuZW51bSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyAoJ0VOVU1fTUlTTUFUQ0gnLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhpbXVtXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVNYXhpbXVtKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5tYXhpbXVtLCBwYXJhbWV0ZXIudHlwZSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyAoJ01BWElNVU0nLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBtaW5pbXVtXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVNaW5pbXVtKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5taW5pbXVtLCBwYXJhbWV0ZXIudHlwZSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyAoJ01JTklNVU0nLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSB1bmlxdWVJdGVtc1xuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlVW5pcXVlSXRlbXMocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLnVuaXF1ZUl0ZW1zKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nICgnQVJSQVlfVU5JUVVFJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBUT0RPOiBNYWtlIHRoaXMgd29yayB3aXRoIHBhcmFtZXRlcnMgdGhhdCBoYXZlIHNjaGVtYXMvcmVmZXJlbmNlc1xuXG4gICAgdmFsaWRhdGVBcnJheVR5cGUocGFyYW1ldGVyLCBwYXRoLCBkZXN0KTtcblxuICAgIC8vIFZhbGlkYXRlIHRoZSB2YWx1ZSB0eXBlL2Zvcm1hdCAoU2tpcCBmb3IgYXJyYXkgc2luY2Ugd2UgbWFudWFsbHkgaGFuZGxlIGl0IGFib3ZlIGZvciBub3cpXG4gICAgaWYgKHBhcmFtZXRlci50eXBlID09PSAnYXJyYXknICYmICFfLmlzVW5kZWZpbmVkKHBhcmFtZXRlci5pdGVtcykpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVUeXBlQW5kRm9ybWF0KHBhcmFtZXRlci5uYW1lLCB2YWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlci50eXBlID09PSAnYXJyYXknID8gcGFyYW1ldGVyLml0ZW1zLnR5cGUgOiBwYXJhbWV0ZXIudHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLnR5cGUgPT09ICdhcnJheScgJiYgcGFyYW1ldGVyLml0ZW1zLmZvcm1hdCA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLml0ZW1zLmZvcm1hdCA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1ldGVyLmZvcm1hdCk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgLy8gVE9ETzogVXBkYXRlIHRvIG5vdGlmeSBvZiAnSU5WQUxJRF9GT1JNQVQnXG4gICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdJTlZBTElEX1RZUEUnLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIGVudW1cbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZUVudW0ocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLmVudW0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0VOVU1fTUlTTUFUQ0gnLCBlcnIubWVzc2FnZSwgdmFsLCBwYXRoLCBkZXN0KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhpbXVtXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVNYXhpbXVtKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5tYXhpbXVtLCBwYXJhbWV0ZXIudHlwZSwgcGFyYW1ldGVyLmV4Y2x1c2l2ZU1heGltdW0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcocGFyYW1ldGVyLmV4Y2x1c2l2ZU1heGltdW0gPT09IHRydWUgPyAnTUFYSU1VTV9FWENMVVNJVkUnIDogJ01BWElNVU0nLCBlcnIubWVzc2FnZSwgdmFsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWF4aW11bSBpdGVtc1xuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlTWF4SXRlbXMocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1heEl0ZW1zKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdBUlJBWV9MRU5HVEhfTE9ORycsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIG1heGltdW0gbGVuZ3RoXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVNYXhMZW5ndGgocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1heExlbmd0aCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUFYX0xFTkdUSCcsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIG1pbmltdW1cbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1pbmltdW0ocGFyYW1ldGVyLm5hbWUsIHZhbCwgcGFyYW1ldGVyLm1pbmltdW0sIHBhcmFtZXRlci50eXBlLCBwYXJhbWV0ZXIuZXhjbHVzaXZlTWluaW11bSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyhwYXJhbWV0ZXIuZXhjbHVzaXZlTWluaW11bSA9PT0gJ3RydWUnID8gJ01JTklNVU1fRVhDTFVTSVZFJyA6ICdNSU5JTVVNJywgZXJyLm1lc3NhZ2UsIHZhbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIG1pbmltdW0gaXRlbXNcbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1pbkl0ZW1zKHBhcmFtZXRlci5uYW1lLCB2YWwsIHBhcmFtZXRlci5taW5JdGVtcyk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQVJSQVlfTEVOR1RIX1NIT1JUJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgbWluaW11bSBsZW5ndGhcbiAgICB0cnkge1xuICAgICAgdmFsaWRhdG9ycy52YWxpZGF0ZU1pbkxlbmd0aChwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIubWluTGVuZ3RoKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNSU5fTEVOR1RIJywgZXJyLm1lc3NhZ2UsIHZhbCwgcGF0aCwgZGVzdCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgcGF0dGVyblxuICAgIHRyeSB7XG4gICAgICB2YWxpZGF0b3JzLnZhbGlkYXRlUGF0dGVybihwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIucGF0dGVybik7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnUEFUVEVSTicsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIHVuaXF1ZUl0ZW1zXG4gICAgdHJ5IHtcbiAgICAgIHZhbGlkYXRvcnMudmFsaWRhdGVVbmlxdWVJdGVtcyhwYXJhbWV0ZXIubmFtZSwgdmFsLCBwYXJhbWV0ZXIudW5pcXVlSXRlbXMpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0FSUkFZX1VOSVFVRScsIGVyci5tZXNzYWdlLCB2YWwsIHBhdGgsIGRlc3QpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBicmVhaztcbiAgfVxufTtcblxudmFyIG5vcm1hbGl6ZVBhdGggPSBmdW5jdGlvbiBub3JtYWxpemVQYXRoIChwYXRoKSB7XG4gIHZhciBhcmdOYW1lcyA9IFtdO1xuICB2YXIgc2VnbWVudHMgPSBbXTtcblxuICBfLmVhY2gocGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbiAoc2VnbWVudCkge1xuICAgIGlmIChzZWdtZW50LmNoYXJBdCgwKSA9PT0gJ3snKSB7XG4gICAgICBhcmdOYW1lcy5wdXNoKHNlZ21lbnQuc3Vic3RyaW5nKDEpLnNwbGl0KCd9JylbMF0pO1xuXG4gICAgICBzZWdtZW50ID0gJ3snICsgKGFyZ05hbWVzLmxlbmd0aCAtIDEpICsgJ30nO1xuICAgIH1cblxuICAgIHNlZ21lbnRzLnB1c2goc2VnbWVudCk7XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgcGF0aDogc2VnbWVudHMuam9pbignLycpLFxuICAgIGFyZ3M6IGFyZ05hbWVzXG4gIH07XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgU3dhZ2dlciBzcGVjaWZpY2F0aW9uIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvbiAtIFRoZSBTd2FnZ2VyIHZlcnNpb25cbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIFNwZWNpZmljYXRpb24gPSBmdW5jdGlvbiBTcGVjaWZpY2F0aW9uICh2ZXJzaW9uKSB7XG4gIHZhciBwcmltaXRpdmVzID0gWydzdHJpbmcnLCAnbnVtYmVyJywgJ2Jvb2xlYW4nLCAnaW50ZWdlcicsICdhcnJheSddO1xuICB2YXIgZG9jc1VybDtcbiAgdmFyIHNjaGVtYXNVcmw7XG5cbiAgc3dpdGNoICh2ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgZG9jc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vd29yZG5pay9zd2FnZ2VyLXNwZWMvYmxvYi9tYXN0ZXIvdmVyc2lvbnMvMS4yLm1kJztcbiAgICBwcmltaXRpdmVzID0gXy51bmlvbihwcmltaXRpdmVzLCBbJ3ZvaWQnLCAnRmlsZSddKTtcbiAgICBzY2hlbWFzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS93b3JkbmlrL3N3YWdnZXItc3BlYy90cmVlL21hc3Rlci9zY2hlbWFzL3YxLjInO1xuXG4gICAgYnJlYWs7XG4gIGNhc2UgJzIuMCc6XG4gICAgZG9jc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vd29yZG5pay9zd2FnZ2VyLXNwZWMvYmxvYi9tYXN0ZXIvdmVyc2lvbnMvMi4wLm1kJztcbiAgICBwcmltaXRpdmVzID0gXy51bmlvbihwcmltaXRpdmVzLCBbJ2ZpbGUnXSk7XG4gICAgc2NoZW1hc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vd29yZG5pay9zd2FnZ2VyLXNwZWMvdHJlZS9tYXN0ZXIvc2NoZW1hcy92Mi4wJztcblxuICAgIGJyZWFrO1xuICBkZWZhdWx0OlxuICAgIHRocm93IG5ldyBFcnJvcih2ZXJzaW9uICsgJyBpcyBhbiB1bnN1cHBvcnRlZCBTd2FnZ2VyIHNwZWNpZmljYXRpb24gdmVyc2lvbicpO1xuICB9XG5cbiAgdGhpcy5kb2NzVXJsID0gZG9jc1VybDtcbiAgdGhpcy5wcmltaXRpdmVzID0gcHJpbWl0aXZlcztcbiAgdGhpcy5zY2hlbWFzVXJsID0gc2NoZW1hc1VybDtcbiAgdGhpcy52ZXJzaW9uID0gdmVyc2lvbjtcblxuICAvLyBMb2FkIHRoZSBzY2hlbWEgZmlsZXNcbiAgdGhpcy5zY2hlbWFzID0ge307XG5cbiAgLy8gQ3JlYXRlIHRoZSB2YWxpZGF0b3JzXG4gIHRoaXMudmFsaWRhdG9ycyA9IHt9O1xuXG4gIHN3aXRjaCAodmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIEhlcmUgZXhwbGljaXRseSB0byBhbGxvdyBicm93c2VyaWZ5IHRvIHdvcmtcbiAgICB0aGlzLnNjaGVtYXNbJ2FwaURlY2xhcmF0aW9uLmpzb24nXSA9IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2FwaURlY2xhcmF0aW9uLmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydkYXRhVHlwZS5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9kYXRhVHlwZS5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydkYXRhVHlwZUJhc2UuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvZGF0YVR5cGVCYXNlLmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ2luZm9PYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvaW5mb09iamVjdC5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydtb2RlbHNPYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvbW9kZWxzT2JqZWN0Lmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ29hdXRoMkdyYW50VHlwZS5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9vYXV0aDJHcmFudFR5cGUuanNvbicpO1xuICAgIHRoaXMuc2NoZW1hc1snb3BlcmF0aW9uT2JqZWN0Lmpzb24nXSA9IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL29wZXJhdGlvbk9iamVjdC5qc29uJyk7XG4gICAgdGhpcy5zY2hlbWFzWydwYXJhbWV0ZXJPYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcGFyYW1ldGVyT2JqZWN0Lmpzb24nKTtcbiAgICB0aGlzLnNjaGVtYXNbJ3Jlc291cmNlTGlzdGluZy5qc29uJ10gPSByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9yZXNvdXJjZUxpc3RpbmcuanNvbicpO1xuICAgIHRoaXMuc2NoZW1hc1sncmVzb3VyY2VPYmplY3QuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcmVzb3VyY2VPYmplY3QuanNvbicpO1xuXG4gICAgdGhpcy52YWxpZGF0b3JzWydhcGlEZWNsYXJhdGlvbi5qc29uJ10gPSBjcmVhdGVWYWxpZGF0b3IodGhpcywgW1xuICAgICAgJ2RhdGFUeXBlQmFzZS5qc29uJyxcbiAgICAgICdtb2RlbHNPYmplY3QuanNvbicsXG4gICAgICAnb2F1dGgyR3JhbnRUeXBlLmpzb24nLFxuICAgICAgJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbicsXG4gICAgICAncGFyYW1ldGVyT2JqZWN0Lmpzb24nLFxuICAgICAgJ29wZXJhdGlvbk9iamVjdC5qc29uJyxcbiAgICAgICdhcGlEZWNsYXJhdGlvbi5qc29uJ1xuICAgIF0pO1xuXG4gICAgdGhpcy52YWxpZGF0b3JzWydyZXNvdXJjZUxpc3RpbmcuanNvbiddID0gY3JlYXRlVmFsaWRhdG9yKHRoaXMsIFtcbiAgICAgICdyZXNvdXJjZU9iamVjdC5qc29uJyxcbiAgICAgICdpbmZvT2JqZWN0Lmpzb24nLFxuICAgICAgJ29hdXRoMkdyYW50VHlwZS5qc29uJyxcbiAgICAgICdhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24nLFxuICAgICAgJ3Jlc291cmNlTGlzdGluZy5qc29uJ1xuICAgIF0pO1xuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBIZXJlIGV4cGxpY2l0bHkgdG8gYWxsb3cgYnJvd3NlcmlmeSB0byB3b3JrXG4gICAgdGhpcy5zY2hlbWFzWydzY2hlbWEuanNvbiddID0gcmVxdWlyZSgnLi4vc2NoZW1hcy8yLjAvc2NoZW1hLmpzb24nKTtcblxuICAgIHRoaXMudmFsaWRhdG9yc1snc2NoZW1hLmpzb24nXSA9IGNyZWF0ZVZhbGlkYXRvcih0aGlzLCBbXG4gICAgICAnc2NoZW1hLmpzb24nXG4gICAgXSk7XG5cbiAgICBicmVhaztcbiAgfVxufTtcblxudmFyIGdldE1vZGVsTWV0YWRhdGEgPSBmdW5jdGlvbiBnZXRNb2RlbE1ldGFkYXRhIChtb2RlbHNNZXRhZGF0YSwgbW9kZWxJZCkge1xuICB2YXIgbWV0YWRhdGEgPSBtb2RlbHNNZXRhZGF0YVttb2RlbElkXTtcblxuICBpZiAoXy5pc1VuZGVmaW5lZChtZXRhZGF0YSkpIHtcbiAgICBtZXRhZGF0YSA9IG1vZGVsc01ldGFkYXRhW21vZGVsSWRdID0ge1xuICAgICAgY29tcG9zZWQ6IHt9LFxuICAgICAgbmFtZTogdW5kZWZpbmVkLFxuICAgICAgcGFyZW50czogW10sXG4gICAgICByZWZzOiBbXSxcbiAgICAgIHNjaGVtYTogdW5kZWZpbmVkXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBtZXRhZGF0YTtcbn07XG5cbnZhciBwcm9jZXNzTW9kZWwgPSBmdW5jdGlvbiBwcm9jZXNzTW9kZWwgKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBtb2RlbCwgbW9kZWxJZCwgcGF0aCwgcmVzdWx0cykge1xuICB2YXIgbWV0YWRhdGEgPSBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCBtb2RlbElkKTtcbiAgdmFyIGlzUmVtb3RlUmVmID0gZnVuY3Rpb24gKHJlZikge1xuICAgIHJldHVybiByZWYuaW5kZXhPZignaHR0cDovLycpID09PSAwIHx8IHJlZi5pbmRleE9mKCdodHRwczovLycpID09PSAwO1xuICB9O1xuXG4gIC8vIEVuc3VyZSB0aGUgbW9kZWwncyBuYW1lIGFuZCBzY2hlbWEgYXJlIHNldFxuICBtZXRhZGF0YS5zY2hlbWEgPSBtb2RlbDtcbiAgbWV0YWRhdGEubmFtZSA9IG1vZGVsSWQ7IC8vIFJlYXNvbmFibGUgZGVmYXVsdFxuICBtZXRhZGF0YS5wYXRoID0gcGF0aDtcblxuICBzd2l0Y2ggKHNwZWMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIFNldCB0aGUgbW9kZWwncyBuYW1lIHRvIHRoZSBwcm9wZXIgdmFsdWVcbiAgICBtZXRhZGF0YS5uYW1lID0gcGF0aFtwYXRoLmxlbmd0aCAtIDFdO1xuXG4gICAgLy8gQWRkIG1vZGVsIHJlZmVyZW5jZXMgZnJvbSBwcm9wZXJ0aWVzIGFuZCB2YWxpZGF0ZSB0aGUgZGVmYXVsdCB2YWx1ZXNcbiAgICBfLmVhY2gobW9kZWwucHJvcGVydGllcywgZnVuY3Rpb24gKHByb3BlcnR5LCBuYW1lKSB7XG4gICAgICB2YXIgcFBhdGggPSBwYXRoLmNvbmNhdCgncHJvcGVydGllcycsIG5hbWUpO1xuXG4gICAgICB2YWxpZGF0ZUFycmF5VHlwZShwcm9wZXJ0eSwgcFBhdGgsIHJlc3VsdHMuZXJyb3IpO1xuXG4gICAgICAvLyBLZWVwIHRyYWNrIG9mIHRoZSBtb2RlbCByZWZlcmVuY2VzXG4gICAgICBpZiAocHJvcGVydHkuJHJlZikge1xuICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCBwcm9wZXJ0eS4kcmVmKS5yZWZzLnB1c2gocFBhdGguY29uY2F0KFsnJHJlZiddKSk7XG4gICAgICB9IGVsc2UgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScgJiYgIV8uaXNVbmRlZmluZWQocHJvcGVydHkuaXRlbXMpICYmICFfLmlzVW5kZWZpbmVkKHByb3BlcnR5Lml0ZW1zLiRyZWYpKSB7XG4gICAgICAgIGdldE1vZGVsTWV0YWRhdGEobW9kZWxzTWV0YWRhdGEsIHByb3BlcnR5Lml0ZW1zLiRyZWYpLnJlZnMucHVzaChwUGF0aC5jb25jYXQoWydpdGVtcycsICckcmVmJ10pKTtcbiAgICAgIH1cblxuICAgICAgLy8gVmFsaWRhdGUgdGhlIGRlZmF1bHQgdmFsdWUgYWdhaW5zdCBjb25zdHJhaW50c1xuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHByb3BlcnR5LmRlZmF1bHRWYWx1ZSkpIHtcbiAgICAgICAgdmFsaWRhdGVQYXJhbWV0ZXJDb25zdHJhaW50cyhzcGVjLCBwcm9wZXJ0eSwgcHJvcGVydHkuZGVmYXVsdFZhbHVlLCBwUGF0aC5jb25jYXQoJ2RlZmF1bHRWYWx1ZScpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEtlZXAgdHJhY2sgb2YgbW9kZWwgcmVmZXJlbmNlcyBpbiBzdWJUeXBlc1xuICAgIF8uZWFjaChfLnVuaXEobW9kZWwuc3ViVHlwZXMpLCBmdW5jdGlvbiAoc3ViVHlwZSwgaW5kZXgpIHtcbiAgICAgIHZhciBzdWJNZXRhZGF0YSA9IGdldE1vZGVsTWV0YWRhdGEobW9kZWxzTWV0YWRhdGEsIHN1YlR5cGUpO1xuXG4gICAgICBzdWJNZXRhZGF0YS5wYXJlbnRzLnB1c2gobW9kZWxJZCk7XG4gICAgICBzdWJNZXRhZGF0YS5yZWZzLnB1c2gocGF0aC5jb25jYXQoJ3N1YlR5cGVzJywgaW5kZXgudG9TdHJpbmcoKSkpO1xuICAgIH0pO1xuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBLZWVwIHRyYWNrIG9mIG1vZGVsIHJlZmVyZW5jZXMgaW4gYWxsT2ZcbiAgICBfLmVhY2goXy51bmlxKG1vZGVsLmFsbE9mKSwgZnVuY3Rpb24gKHNjaGVtYSwgaW5kZXgpIHtcbiAgICAgIHZhciBzUGF0aCA9IHBhdGguY29uY2F0KCdhbGxPZicsIGluZGV4LnRvU3RyaW5nKCkpO1xuXG4gICAgICBpZiAoXy5pc1VuZGVmaW5lZChzY2hlbWEuJHJlZikpIHtcbiAgICAgICAgcHJvY2Vzc01vZGVsKHNwZWMsIG1vZGVsc01ldGFkYXRhLCBzY2hlbWEsIHRvSnNvblBvaW50ZXIoc1BhdGgpLCBzUGF0aCwgcmVzdWx0cyk7XG5cbiAgICAgICAgbWV0YWRhdGEucGFyZW50cy5wdXNoKHRvSnNvblBvaW50ZXIoc1BhdGgpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICghaXNSZW1vdGVSZWYoc2NoZW1hLiRyZWYpKSB7XG4gICAgICAgICAgbWV0YWRhdGEucGFyZW50cy5wdXNoKHJlZlRvSnNvblBvaW50ZXIoc2NoZW1hLiRyZWYpKTtcblxuICAgICAgICAgIGdldE1vZGVsTWV0YWRhdGEobW9kZWxzTWV0YWRhdGEsIHJlZlRvSnNvblBvaW50ZXIoc2NoZW1hLiRyZWYpKS5yZWZzLnB1c2goc1BhdGguY29uY2F0KCckcmVmJykpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBWYWxpZGF0ZSB0aGUgZGVmYXVsdCB2YWx1ZSBhZ2FpbnN0IGNvbnN0cmFpbnRzXG4gICAgaWYgKCFfLmlzVW5kZWZpbmVkKG1vZGVsLmRlZmF1bHQpKSB7XG4gICAgICB2YWxpZGF0ZVBhcmFtZXRlckNvbnN0cmFpbnRzKHNwZWMsIG1vZGVsLCBtb2RlbC5kZWZhdWx0VmFsdWUsIHBhdGguY29uY2F0KCdkZWZhdWx0JyksIHJlc3VsdHMuZXJyb3JzKTtcbiAgICB9XG5cbiAgICAvLyBTa2lwcGluZyAnZGVmaW5pdGlvbnMnIGZvciBub3c6IGh0dHBzOi8vZ2l0aHViLmNvbS9yZXZlcmIvc3dhZ2dlci1zcGVjL2lzc3Vlcy8xMjdcblxuICAgIC8vIEtlZXAgdHJhY2sgb2YgbW9kZWwgcmVmZXJlbmNlcyBpbiAkcmVmLCBpdGVtcy4kcmVmXG4gICAgaWYgKG1vZGVsLiRyZWYpIHtcbiAgICAgIGlmICghaXNSZW1vdGVSZWYobW9kZWwuJHJlZikpIHtcbiAgICAgICAgZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgcmVmVG9Kc29uUG9pbnRlcihtb2RlbC4kcmVmKSkucmVmcy5wdXNoKHBhdGguY29uY2F0KFsnJHJlZiddKSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChtb2RlbC50eXBlID09PSAnYXJyYXknKSB7XG4gICAgICB2YWxpZGF0ZUFycmF5VHlwZShtb2RlbCwgcGF0aCwgcmVzdWx0cy5lcnJvcnMpO1xuXG4gICAgICBpZiAoIV8uaXNVbmRlZmluZWQobW9kZWwuaXRlbXMpICYmICFfLmlzVW5kZWZpbmVkKG1vZGVsLml0ZW1zLiRyZWYpKSB7XG4gICAgICAgIGlmICghaXNSZW1vdGVSZWYobW9kZWwuaXRlbXMuJHJlZikpIHtcbiAgICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVmVG9Kc29uUG9pbnRlcihtb2RlbC5pdGVtcy4kcmVmKSkucmVmcy5wdXNoKHBhdGguY29uY2F0KFsnaXRlbXMnLCAnJHJlZiddKSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIV8uaXNVbmRlZmluZWQobW9kZWwuaXRlbXMpICYmICFfLmlzVW5kZWZpbmVkKG1vZGVsLml0ZW1zLnR5cGUpICYmXG4gICAgICAgICAgICAgICAgICAgc3BlYy5wcmltaXRpdmVzLmluZGV4T2YobW9kZWwuaXRlbXMudHlwZSkgPT09IC0xKSB7XG4gICAgICAgIF8uZWFjaChtb2RlbC5pdGVtcywgZnVuY3Rpb24gKGl0ZW0sIGluZGV4KSB7XG4gICAgICAgICAgdmFyIHNQYXRoID0gcGF0aC5jb25jYXQoJ2l0ZW1zJywgaW5kZXgudG9TdHJpbmcoKSk7XG5cbiAgICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIGl0ZW0sIHRvSnNvblBvaW50ZXIoc1BhdGgpLCBzUGF0aCwgcmVzdWx0cyk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIF8uZWFjaChtb2RlbC5wcm9wZXJ0aWVzLCBmdW5jdGlvbiAocHJvcGVydHksIG5hbWUpIHtcbiAgICAgIHZhciBwUGF0aCA9IHBhdGguY29uY2F0KCdwcm9wZXJ0aWVzJywgbmFtZSk7XG5cbiAgICAgIC8vIEtlZXAgdHJhY2sgb2YgbW9kZWwgcmVmZXJlbmNlcyBpbiAkcmVmLCBpdGVtcy4kcmVmXG4gICAgICBpZiAocHJvcGVydHkuJHJlZikge1xuICAgICAgICBpZiAoIWlzUmVtb3RlUmVmKHByb3BlcnR5LiRyZWYpKSB7XG4gICAgICAgICAgZ2V0TW9kZWxNZXRhZGF0YShtb2RlbHNNZXRhZGF0YSwgcmVmVG9Kc29uUG9pbnRlcihwcm9wZXJ0eS4kcmVmKSkucmVmcy5wdXNoKHBQYXRoLmNvbmNhdChbJyRyZWYnXSkpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHByb3BlcnR5LnR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgICAgdmFsaWRhdGVBcnJheVR5cGUocHJvcGVydHksIHBQYXRoLCByZXN1bHRzLmVycm9ycyk7XG5cbiAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHByb3BlcnR5Lml0ZW1zKSAmJiAhXy5pc1VuZGVmaW5lZChwcm9wZXJ0eS5pdGVtcy4kcmVmKSAmJlxuICAgICAgICAgICAgICAhaXNSZW1vdGVSZWYocHJvcGVydHkuaXRlbXMuJHJlZikpIHtcbiAgICAgICAgICBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVmVG9Kc29uUG9pbnRlcihwcm9wZXJ0eS5pdGVtcy4kcmVmKSkucmVmcy5wdXNoKHBQYXRoLmNvbmNhdChbJ2l0ZW1zJywgJyRyZWYnXSkpO1xuICAgICAgICB9IGVsc2UgaWYgKCFfLmlzVW5kZWZpbmVkKHByb3BlcnR5Lml0ZW1zKSAmJiAhXy5pc1VuZGVmaW5lZChwcm9wZXJ0eS5pdGVtcy50eXBlKSAmJlxuICAgICAgICAgICAgICAgICAgICAgc3BlYy5wcmltaXRpdmVzLmluZGV4T2YocHJvcGVydHkuaXRlbXMudHlwZSkgPT09IC0xKSB7XG4gICAgICAgICAgXy5lYWNoKHByb3BlcnR5Lml0ZW1zLCBmdW5jdGlvbiAoc2NoZW1hLCBpbmRleCkge1xuICAgICAgICAgICAgdmFyIHNQYXRoID0gcFBhdGguY29uY2F0KCdpdGVtcycsIGluZGV4LnRvU3RyaW5nKCkpO1xuXG4gICAgICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIHNjaGVtYSwgdG9Kc29uUG9pbnRlcihzUGF0aCksIHNQYXRoLCByZXN1bHRzKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHNlbGYgcmVmZXJlbmNlIHRvIGFsbCBtb2RlbCBkZWZpbml0aW9ucyBvdXRzaWRlIG9mICMvZGVmaW5pdGlvbnMgKFRoZXkgYXJlIGlubGluZSBtb2RlbHMgb3IgcmVmZXJlbmNlcylcbiAgICBpZiAocGF0aC5sZW5ndGggPiAzIHx8IHRvSnNvblBvaW50ZXIocGF0aCkuaW5kZXhPZignIy9kZWZpbml0aW9ucy8nKSA9PT0gLTEpIHtcbiAgICAgIG1ldGFkYXRhLnJlZnMucHVzaChwYXRoKTtcbiAgICB9XG5cbiAgICBicmVhaztcbiAgfVxufTtcblxudmFyIGdldE1vZGVsc01ldGFkYXRhID0gZnVuY3Rpb24gZ2V0TW9kZWxzTWV0YWRhdGEgKHNwZWMsIGFwaURPclNPLCByZXN1bHRzKSB7XG4gIHZhciBjaXJjdWxhciA9IHt9O1xuICB2YXIgbG9jYWxSZXN1bHRzID0ge1xuICAgIGVycm9yczogW10sXG4gICAgd2FybmluZ3M6IFtdXG4gIH07XG4gIHZhciByZXNvbHZlZCA9IHt9O1xuICB2YXIgdW5yZXNvbHZlZCA9IHt9O1xuICB2YXIgYWRkTW9kZWxQcm9wcyA9IGZ1bmN0aW9uIGFkZE1vZGVsUHJvcHMgKG1vZGVsSWQsIGNvbXBvc2VkKSB7XG4gICAgdmFyIG1vZGVsID0gbW9kZWxzTWV0YWRhdGFbbW9kZWxJZF0uc2NoZW1hO1xuXG4gICAgaWYgKG1vZGVsKSB7XG4gICAgICBfLmVhY2gobW9kZWwucHJvcGVydGllcywgZnVuY3Rpb24gKHByb3AsIHByb3BOYW1lKSB7XG4gICAgICAgIHZhciBuZXdQcm9wID0gXy5jbG9uZURlZXAocHJvcCk7XG5cbiAgICAgICAgaWYgKGNvbXBvc2VkLnByb3BlcnRpZXNbcHJvcE5hbWVdKSB7XG4gICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0NISUxEX01PREVMX1JFREVDTEFSRVNfUFJPUEVSVFknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdDaGlsZCBtb2RlbCBkZWNsYXJlcyBwcm9wZXJ0eSBhbHJlYWR5IGRlY2xhcmVkIGJ5IGFuY2VzdG9yOiAnICsgcHJvcE5hbWUsIHByb3AsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3BlYy52ZXJzaW9uID09PSAnMS4yJyA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ21vZGVscycsIG1vZGVsSWQsICdwcm9wZXJ0aWVzJywgcHJvcE5hbWVdIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsSWQuc3Vic3RyaW5nKDIpLnNwbGl0KCcvJykuY29uY2F0KCdwcm9wZXJ0aWVzJywgcHJvcE5hbWUpLCBsb2NhbFJlc3VsdHMuZXJyb3JzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoc3BlYy52ZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgICAgICAgLy8gU2FuaXRpemUgdGhlIG1heGltdW0vbWluaW11bSB2YWx1ZXMgdG8gYmUgbnVtYmVyc1xuICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKG5ld1Byb3AubWF4aW11bSkpIHtcbiAgICAgICAgICAgICAgbmV3UHJvcC5tYXhpbXVtID0gcGFyc2VGbG9hdChuZXdQcm9wLm1heGltdW0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQobmV3UHJvcC5taW5pbXVtKSkge1xuICAgICAgICAgICAgICBuZXdQcm9wLm1pbmltdW0gPSBwYXJzZUZsb2F0KG5ld1Byb3AubWluaW11bSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbXBvc2VkLnByb3BlcnRpZXNbcHJvcE5hbWVdID0gbmV3UHJvcDtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGlmICghXy5pc1VuZGVmaW5lZChtb2RlbC5yZXF1aXJlZCkgJiYgXy5pc1VuZGVmaW5lZChjb21wb3NlZC5yZXF1aXJlZCkpIHtcbiAgICAgICAgY29tcG9zZWQucmVxdWlyZWQgPSBbXTtcbiAgICAgIH1cblxuICAgICAgXy5lYWNoKG1vZGVsLnJlcXVpcmVkLCBmdW5jdGlvbiAocHJvcE5hbWUpIHtcbiAgICAgICAgaWYgKGNvbXBvc2VkLnJlcXVpcmVkLmluZGV4T2YocHJvcE5hbWUpID09PSAtMSkge1xuICAgICAgICAgIGNvbXBvc2VkLnJlcXVpcmVkLnB1c2gocHJvcE5hbWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG4gIHZhciBnZXRQYXRoID0gZnVuY3Rpb24gZ2V0UGF0aCAocGFyZW50LCB1bnJlc29sdmVkKSB7XG4gICAgdmFyIHBhcmVudFZpc2l0ZWQgPSBmYWxzZTtcblxuICAgIHJldHVybiBPYmplY3Qua2V5cyh1bnJlc29sdmVkKS5maWx0ZXIoZnVuY3Rpb24gKGRlcCkge1xuICAgICAgaWYgKGRlcCA9PT0gcGFyZW50KSB7XG4gICAgICAgIHBhcmVudFZpc2l0ZWQgPSB0cnVlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHBhcmVudFZpc2l0ZWQgJiYgdW5yZXNvbHZlZFtkZXBdO1xuICAgIH0pO1xuICB9O1xuICB2YXIgcmVzb2x2ZXIgPSBmdW5jdGlvbiByZXNvbHZlciAobW9kZWxJZCwgY2lyY3VsYXIsIHJlc29sdmVkLCB1bnJlc29sdmVkLCBjb21wb3NlZCkge1xuICAgIHZhciBtZXRhZGF0YSA9IG1vZGVsc01ldGFkYXRhW21vZGVsSWRdO1xuICAgIHZhciBtb2RlbCA9IG1ldGFkYXRhLnNjaGVtYTtcblxuICAgIHVucmVzb2x2ZWRbbW9kZWxJZF0gPSB0cnVlO1xuXG4gICAgaWYgKCFfLmlzVW5kZWZpbmVkKG1vZGVsKSkge1xuICAgICAgLy8gMS4yIGRvZXMgbm90IGFsbG93IG11bHRpcGxlIGluaGVyaXRhbmNlIHdoaWxlIDIuMCsgZG9lc1xuICAgICAgaWYgKG1ldGFkYXRhLnBhcmVudHMubGVuZ3RoID4gMSAmJiBzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNVUxUSVBMRV9NT0RFTF9JTkhFUklUQU5DRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICdDaGlsZCBtb2RlbCBpcyBzdWIgdHlwZSBvZiBtdWx0aXBsZSBtb2RlbHM6ICcgKyBtZXRhZGF0YS5wYXJlbnRzLmpvaW4oJyAmJiAnKSwgbW9kZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnbW9kZWxzJywgbW9kZWxJZF0sIGxvY2FsUmVzdWx0cy5lcnJvcnMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgXy5lYWNoKG1ldGFkYXRhLnBhcmVudHMsIGZ1bmN0aW9uIChkZXApIHtcbiAgICAgICAgICBpZiAoIXJlc29sdmVkW2RlcF0pIHtcbiAgICAgICAgICAgIGlmICh1bnJlc29sdmVkW2RlcF0pIHtcbiAgICAgICAgICAgICAgY2lyY3VsYXJbbW9kZWxJZF0gPSBnZXRQYXRoKGRlcCwgdW5yZXNvbHZlZCk7XG5cbiAgICAgICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0NZQ0xJQ0FMX01PREVMX0lOSEVSSVRBTkNFJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ01vZGVsIGhhcyBhIGNpcmN1bGFyIGluaGVyaXRhbmNlOiAnICsgbW9kZWxJZCArICcgLT4gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2lyY3VsYXJbbW9kZWxJZF0uam9pbignIC0+ICcpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcGVjLnZlcnNpb24gPT09ICcxLjInID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbC5zdWJUeXBlcyA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWwuYWxsT2YsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNwZWMudmVyc2lvbiA9PT0gJzEuMicgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnbW9kZWxzJywgbW9kZWxJZCwgJ3N1YlR5cGVzJ10gOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsSWQuc3Vic3RyaW5nKDIpLnNwbGl0KCcvJykuY29uY2F0KCdhbGxPZicpLCBsb2NhbFJlc3VsdHMuZXJyb3JzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gRG8gbm90IHJlc29sdmUgaWYgY2lyY3VsYXJcbiAgICAgICAgICAgIGlmICghY2lyY3VsYXJbbW9kZWxJZF0pIHtcbiAgICAgICAgICAgICAgcmVzb2x2ZXIoZGVwLCBjaXJjdWxhciwgcmVzb2x2ZWQsIHVucmVzb2x2ZWQsIGNvbXBvc2VkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBEbyBub3QgYWRkIHByb3BlcnRpZXMgaWYgY2lyY3VsYXJcbiAgICAgICAgICBpZiAoIWNpcmN1bGFyW21vZGVsSWRdKSB7XG4gICAgICAgICAgICBhZGRNb2RlbFByb3BzKGRlcCwgY29tcG9zZWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmVzb2x2ZWRbbW9kZWxJZF0gPSB0cnVlO1xuICAgIHVucmVzb2x2ZWRbbW9kZWxJZF0gPSBmYWxzZTtcbiAgfTtcbiAgdmFyIGhhc2ggPSBtZDUuaGFzaChKU09OLnN0cmluZ2lmeShhcGlET3JTTykpO1xuICB2YXIgbWV0YWRhdGFFbnRyeSA9IG1ldGFkYXRhQ2FjaGVbaGFzaF07XG4gIHZhciBtb2RlbHNNZXRhZGF0YTtcblxuICBpZiAoXy5pc1VuZGVmaW5lZChtZXRhZGF0YUVudHJ5KSkge1xuICAgIG1ldGFkYXRhRW50cnkgPSBtZXRhZGF0YUNhY2hlW2hhc2hdID0ge1xuICAgICAgbWV0YWRhdGE6IHt9LFxuICAgICAgcmVzdWx0czogbG9jYWxSZXN1bHRzXG4gICAgfTtcblxuICAgIG1vZGVsc01ldGFkYXRhID0gbWV0YWRhdGFFbnRyeS5tZXRhZGF0YTtcblxuICAgIHN3aXRjaCAoc3BlYy52ZXJzaW9uKSB7XG4gICAgY2FzZSAnMS4yJzpcbiAgICAgIF8ucmVkdWNlKGFwaURPclNPLm1vZGVscywgZnVuY3Rpb24gKHNlZW5Nb2RlbElkcywgbW9kZWwsIG1vZGVsTmFtZSkge1xuICAgICAgICAvLyBWYWxpZGF0ZSB0aGUgbW9kZWwgaXMgbm90IGFscmVhZHkgZGVmaW5lZCAoYnkgaWQpXG4gICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuTW9kZWxJZHMsIG1vZGVsLmlkLCAnTU9ERUxfREVGSU5JVElPTicsICdNb2RlbCcsIFsnbW9kZWxzJywgbW9kZWxOYW1lLCAnaWQnXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvY2FsUmVzdWx0cy5lcnJvcnMpO1xuXG4gICAgICAgIHByb2Nlc3NNb2RlbChzcGVjLCBtb2RlbHNNZXRhZGF0YSwgbW9kZWwsIG1vZGVsLmlkLCBbJ21vZGVscycsIG1vZGVsTmFtZV0sIGxvY2FsUmVzdWx0cyk7XG5cbiAgICAgICAgcmV0dXJuIHNlZW5Nb2RlbElkcy5jb25jYXQobW9kZWwuaWQpO1xuICAgICAgfSwgW10pO1xuXG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJzIuMCc6XG4gICAgICAvLyBGaW5kIG1vZGVscyBkZWZpbmVkL3JlZmVyZW5jZWQgaW4gIy9kZWZpbml0aW9uc1xuICAgICAgXy5lYWNoKGFwaURPclNPLmRlZmluaXRpb25zLCBmdW5jdGlvbiAobW9kZWwsIG1vZGVsSWQpIHtcbiAgICAgICAgdmFyIGRQYXRoID0gWydkZWZpbml0aW9ucycsIG1vZGVsSWRdO1xuXG4gICAgICAgIHByb2Nlc3NNb2RlbChzcGVjLCBtb2RlbHNNZXRhZGF0YSwgbW9kZWwsIHRvSnNvblBvaW50ZXIoZFBhdGgpLCBkUGF0aCwgbG9jYWxSZXN1bHRzKTtcbiAgICAgIH0pO1xuXG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICAvLyBDb21wb3NlIG1vZGVscyBhbmQgaWRlbnRpZnkgaW5oZXJpdGFuY2UgaXNzdWVzXG4gICAgXy5lYWNoKG1vZGVsc01ldGFkYXRhLCBmdW5jdGlvbiAobWV0YWRhdGEsIG1vZGVsSWQpIHtcbiAgICAgIG1ldGFkYXRhLmNvbXBvc2VkID0ge1xuICAgICAgICB0aXRsZTogJ0NvbXBvc2VkICcgKyBtb2RlbElkLFxuICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgcHJvcGVydGllczoge31cbiAgICAgIH07XG5cbiAgICAgIGlmICghXy5pc1VuZGVmaW5lZChtZXRhZGF0YS5zY2hlbWEpKSB7XG4gICAgICAgIHJlc29sdmVyKG1vZGVsSWQsIGNpcmN1bGFyLCByZXNvbHZlZCwgdW5yZXNvbHZlZCwgbWV0YWRhdGEuY29tcG9zZWQpO1xuICAgICAgICBhZGRNb2RlbFByb3BzKG1vZGVsSWQsIG1ldGFkYXRhLmNvbXBvc2VkKTtcbiAgICAgIH1cblxuICAgICAgLy8gVmFsaWRhdGUgcmVxdWlyZWQgcHJvcGVydGllc1xuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKG1ldGFkYXRhLnNjaGVtYSkgJiYgIV8uaXNVbmRlZmluZWQobWV0YWRhdGEuc2NoZW1hLnJlcXVpcmVkKSkge1xuICAgICAgICBfLmVhY2gobWV0YWRhdGEuc2NoZW1hLnJlcXVpcmVkLCBmdW5jdGlvbiAocHJvcE5hbWUsIGluZGV4KSB7XG4gICAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQobWV0YWRhdGEuY29tcG9zZWQucHJvcGVydGllc1twcm9wTmFtZV0pKSB7XG4gICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUlTU0lOR19SRVFVSVJFRF9NT0RFTF9QUk9QRVJUWScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnTW9kZWwgcmVxdWlyZXMgcHJvcGVydHkgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgcHJvcE5hbWUsIHByb3BOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWV0YWRhdGEucGF0aC5jb25jYXQoWydyZXF1aXJlZCcsIGluZGV4LnRvU3RyaW5nKCldKSwgcmVzdWx0cy5lcnJvcnMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBSZXNvbHZlIHJlZmVyZW5jZXNcbiAgICBfLmVhY2gobW9kZWxzTWV0YWRhdGEsIGZ1bmN0aW9uIChtZXRhZGF0YSkge1xuICAgICAgdmFyIHJlZnMgPSB0cmF2ZXJzZShtZXRhZGF0YS5jb21wb3NlZCkucmVkdWNlKGZ1bmN0aW9uIChhY2MpIHtcbiAgICAgICAgaWYgKHRoaXMua2V5ID09PSAnJHJlZicpIHtcbiAgICAgICAgICBhY2NbdG9Kc29uUG9pbnRlcih0aGlzLnBhdGgpXSA9IHNwZWMudmVyc2lvbiA9PT0gJzEuMicgPyB0aGlzLm5vZGUgOiByZWZUb0pzb25Qb2ludGVyKHRoaXMubm9kZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgfSwge30pO1xuXG4gICAgICBfLmVhY2gocmVmcywgZnVuY3Rpb24gKG1vZGVsSWQsIHBhdGhQdHIpIHtcbiAgICAgICAgdmFyIHBhdGggPSBwYXRoUHRyLnN1YnN0cmluZygyKS5zcGxpdCgnLycpO1xuICAgICAgICB2YXIgcmVmTW9kZWwgPSBfLmlzVW5kZWZpbmVkKG1vZGVsc01ldGFkYXRhW21vZGVsSWRdKSA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICBfLmNsb25lRGVlcChtb2RlbHNNZXRhZGF0YVttb2RlbElkXS5jb21wb3NlZCk7XG5cbiAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlZk1vZGVsKSkge1xuICAgICAgICAgIGRlbGV0ZSByZWZNb2RlbC5pZDtcbiAgICAgICAgICBkZWxldGUgcmVmTW9kZWwudGl0bGU7XG5cbiAgICAgICAgICB0cmF2ZXJzZShtZXRhZGF0YS5jb21wb3NlZCkuc2V0KHBhdGguc2xpY2UoMCwgcGF0aC5sZW5ndGggLSAxKSwgcmVmTW9kZWwpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIE1lcmdlIHJlc3VsdHNcbiAgICBpZiAoIV8uaXNVbmRlZmluZWQocmVzdWx0cykpIHtcbiAgICAgIF8uZWFjaChsb2NhbFJlc3VsdHMsIGZ1bmN0aW9uIChlbnRyaWVzLCBkZXN0TmFtZSkge1xuICAgICAgICByZXN1bHRzW2Rlc3ROYW1lXSA9IHJlc3VsdHNbZGVzdE5hbWVdLmNvbmNhdChlbnRyaWVzKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBtZXRhZGF0YUVudHJ5O1xufTtcblxudmFyIHZhbGlkYXRlV2l0aFNjaGVtYSA9IGZ1bmN0aW9uIHZhbGlkYXRlV2l0aFNjaGVtYSAoc3BlYywgc2NoZW1hTmFtZSwgZGF0YSkge1xuICB2YXIgdmFsaWRhdG9yID0gc3BlYy52YWxpZGF0b3JzW3NjaGVtYU5hbWVdO1xuICB2YXIgc2NoZW1hID0gdmFsaWRhdG9yLnNjaGVtYVtzY2hlbWFOYW1lXTtcbiAgdmFyIHJlc3VsdCA9IHZhbGlkYXRvci52YWxpZGF0ZShzY2hlbWEsIGRhdGEpO1xuICB2YXIgcmVzcG9uc2UgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcblxuICBpZiAocmVzdWx0KSB7XG4gICAgcmVzcG9uc2UgPSB7XG4gICAgICBlcnJvcnM6IHZhbGlkYXRvci5qZShzY2hlbWEsIGRhdGEsIHJlc3VsdCwgamp2ZU9wdGlvbnMpLFxuICAgICAgd2FybmluZ3M6IFtdXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbnZhciB2YWxpZGF0ZUNvbnRlbnQgPSBmdW5jdGlvbiB2YWxpZGF0ZUNvbnRlbnQgKHNwZWMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zKSB7XG4gIHZhciByZXNwb25zZSA9IHtcbiAgICBlcnJvcnM6IFtdLFxuICAgIHdhcm5pbmdzOiBbXVxuICB9O1xuICB2YXIgYXV0aERlZnMgPSB7fTsgLy8gKDEuMilcbiAgdmFyIGF1dGhSZWZzID0ge307IC8vICgxLjIpXG4gIHZhciBwYXRoRGVmcyA9IFtdOyAvLyAoMS4yKVxuICB2YXIgcGF0aFJlZnMgPSBbXTsgLy8gKDEuMilcblxuICBzd2l0Y2ggKHNwZWMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIEJ1aWxkIHBhdGggbW9kZWxcbiAgICBfLmVhY2gocmxPclNPLmFwaXMsIGZ1bmN0aW9uIChhcGksIGluZGV4KSB7XG4gICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgcmVzb3VyY2UgcGF0aHNcbiAgICAgIHZhbGlkYXRlTm9FeGlzdChwYXRoRGVmcywgYXBpLnBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLCBbJ2FwaXMnLCBpbmRleC50b1N0cmluZygpLCAncGF0aCddLFxuICAgICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlLmVycm9ycyk7XG5cbiAgICAgIGlmIChwYXRoRGVmcy5pbmRleE9mKGFwaS5wYXRoKSA9PT0gLTEpIHtcbiAgICAgICAgcGF0aERlZnMucHVzaChhcGkucGF0aCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2UuZXJyb3JzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgLy8gQnVpbGQgdGhlIGF1dGhvcml6YXRpb24gbW9kZWxcbiAgICAgIF8uZWFjaChybE9yU08uYXV0aG9yaXphdGlvbnMsIGZ1bmN0aW9uIChhdXRob3JpemF0aW9uLCBuYW1lKSB7XG4gICAgICAgIGF1dGhEZWZzW25hbWVdID0gXy5tYXAoYXV0aG9yaXphdGlvbi5zY29wZXMsIGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICAgIHJldHVybiBzY29wZS5zY29wZTtcbiAgICAgICAgfSk7XG4gICAgICB9LCB7fSk7XG5cbiAgICAgIHJlc3BvbnNlLmFwaURlY2xhcmF0aW9ucyA9IFtdO1xuXG4gICAgICAvLyBWYWxpZGF0ZSB0aGUgQVBJIGRlY2xhcmF0aW9uc1xuICAgICAgXy5lYWNoKGFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGFwaURlY2xhcmF0aW9uLCBpbmRleCkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gcmVzcG9uc2UuYXBpRGVjbGFyYXRpb25zW2luZGV4XSA9IHtcbiAgICAgICAgICBlcnJvcnM6IFtdLFxuICAgICAgICAgIHdhcm5pbmdzOiBbXVxuICAgICAgICB9O1xuICAgICAgICB2YXIgYXBpQXV0aERlZnMgPSB7fTtcbiAgICAgICAgdmFyIGFwaUF1dGhSZWZzID0ge307XG4gICAgICAgIHZhciBtb2RlbHNNZXRhZGF0YSA9IGdldE1vZGVsc01ldGFkYXRhKHNwZWMsIGFwaURlY2xhcmF0aW9uLCByZXN1bHQpLm1ldGFkYXRhO1xuICAgICAgICB2YXIgYWRkTW9kZWxSZWYgPSBmdW5jdGlvbiBhZGRNb2RlbFJlZiAobW9kZWxJZCwgbW9kZWxSZWYpIHtcbiAgICAgICAgICB2YXIgbWV0YWRhdGEgPSBnZXRNb2RlbE1ldGFkYXRhKG1vZGVsc01ldGFkYXRhLCBtb2RlbElkKTtcblxuICAgICAgICAgIG1ldGFkYXRhLnJlZnMucHVzaChtb2RlbFJlZik7XG4gICAgICAgIH07XG4gICAgICAgIHZhciBhZGRTY29wZVJlZiA9IGZ1bmN0aW9uIGFkZFNjb3BlUmVmIChhdXRoSWQsIHNjb3BlSWQpIHtcbiAgICAgICAgICB2YXIgYXV0aDtcblxuICAgICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChhcGlBdXRoRGVmc1thdXRoSWRdKSkge1xuICAgICAgICAgICAgLy8gTG9jYWwgYXV0aCBkZWZpbml0aW9uXG4gICAgICAgICAgICBhdXRoID0gYXBpQXV0aFJlZnNbYXV0aElkXTtcblxuICAgICAgICAgICAgaWYgKF8uaXNVbmRlZmluZWQoYXV0aCkpIHtcbiAgICAgICAgICAgICAgYXV0aCA9IGFwaUF1dGhSZWZzW2F1dGhJZF0gPSBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gR2xvYmFsIChPciBtaXNzaW5nIGluIHdoaWNoIGNhc2Ugd2UnbGwgYXNzdW1lIGdsb2JhbClcbiAgICAgICAgICAgIGF1dGggPSBhdXRoUmVmc1thdXRoSWRdO1xuXG4gICAgICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChhdXRoKSkge1xuICAgICAgICAgICAgICBhdXRoID0gYXV0aFJlZnNbYXV0aElkXSA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChhdXRoLmluZGV4T2Yoc2NvcGVJZCkgPT09IC0xKSB7XG4gICAgICAgICAgICBhdXRoLnB1c2goc2NvcGVJZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIEJ1aWxkIHRoZSBhdXRob3JpemF0aW9uIG1vZGVsXG4gICAgICAgIF8uZWFjaChhcGlEZWNsYXJhdGlvbi5hdXRob3JpemF0aW9ucywgZnVuY3Rpb24gKGF1dGhvcml6YXRpb24sIG5hbWUpIHtcbiAgICAgICAgICBhcGlBdXRoRGVmc1tuYW1lXSA9IF8ubWFwKGF1dGhvcml6YXRpb24uc2NvcGVzLCBmdW5jdGlvbiAoc2NvcGUpIHtcbiAgICAgICAgICAgIHJldHVybiBzY29wZS5zY29wZTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSwge30pO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXG4gICAgICAgIHZhbGlkYXRlTm9FeGlzdChwYXRoUmVmcywgYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoLCAnUkVTT1VSQ0VfUEFUSCcsICdSZXNvdXJjZSBwYXRoJywgWydyZXNvdXJjZVBhdGgnXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5lcnJvcnMpO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgcmVzb3VyY2UgcGF0aCBkZWZpbml0aW9uXG4gICAgICAgIHZhbGlkYXRlRXhpc3QocGF0aERlZnMsIGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsIFsncmVzb3VyY2VQYXRoJ10sXG4gICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgLy8gS2VlcCB0cmFjayBvZiB0aGUgc2VlbiBwYXRoc1xuICAgICAgICBpZiAocGF0aFJlZnMuaW5kZXhPZihhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgpID09PSAtMSkge1xuICAgICAgICAgIHBhdGhSZWZzLnB1c2goYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFZhbGlkYXRlIGNvbnN1bWVzL3Byb2R1Y2VzIHVuaXF1ZW5lc3NcbiAgICAgICAgXy5lYWNoKFsnY29uc3VtZXMnLCAncHJvZHVjZXMnXSwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICB2YWxpZGF0ZU5vRHVwbGljYXRlcyhhcGlEZWNsYXJhdGlvbltuYW1lXSwgJ0FQSV8nICsgbmFtZS50b1VwcGVyQ2FzZSgpLCAnQVBJJywgW25hbWVdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC53YXJuaW5ncyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFZhbGRhdGUgQVBJc1xuICAgICAgICBfLnJlZHVjZShhcGlEZWNsYXJhdGlvbi5hcGlzLCBmdW5jdGlvbiAoc2VlbkFwaVBhdGhzLCBhcGksIGluZGV4KSB7XG4gICAgICAgICAgdmFyIGFQYXRoID0gWydhcGlzJywgaW5kZXgudG9TdHJpbmcoKV07XG4gICAgICAgICAgdmFyIG5QYXRoID0gbm9ybWFsaXplUGF0aChhcGkucGF0aCk7XG4gICAgICAgICAgdmFyIHNQYXJhbXMgPSBbXTtcblxuICAgICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXG4gICAgICAgICAgaWYgKHNlZW5BcGlQYXRocy5pbmRleE9mKG5QYXRoLnBhdGgpID4gLTEpIHtcbiAgICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdEVVBMSUNBVEVfQVBJX1BBVEgnLCAnQVBJIHBhdGggKG9yIGVxdWl2YWxlbnQpIGFscmVhZHkgZGVmaW5lZDogJyArIGFwaS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXBpLnBhdGgsIGFQYXRoLmNvbmNhdCgncGF0aCcpLCByZXN1bHQuZXJyb3JzKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBWYWxpZGF0ZSBvcGVyYXRpb25zXG4gICAgICAgICAgXy5yZWR1Y2UoYXBpLm9wZXJhdGlvbnMsIGZ1bmN0aW9uIChzZWVuTWV0aG9kcywgb3BlcmF0aW9uLCBpbmRleCkge1xuICAgICAgICAgICAgdmFyIG9QYXRoID0gYVBhdGguY29uY2F0KFsnb3BlcmF0aW9ucycsIGluZGV4LnRvU3RyaW5nKCldKTtcblxuICAgICAgICAgICAgLy8gVmFsaWRhdGUgY29uc3VtZXMvcHJvZHVjZXMgdW5pcXVlbmVzc1xuICAgICAgICAgICAgXy5lYWNoKFsnY29uc3VtZXMnLCAncHJvZHVjZXMnXSwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgICAgdmFsaWRhdGVOb0R1cGxpY2F0ZXMob3BlcmF0aW9uW25hbWVdLCAnT1BFUkFUSU9OXycgKyBuYW1lLnRvVXBwZXJDYXNlKCksICdPcGVyYXRpb24nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQobmFtZSksIHJlc3VsdC53YXJuaW5ncyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gVmFsaWRhdGUgdW5pcXVlIG1ldGhvZFxuICAgICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5NZXRob2RzLCBvcGVyYXRpb24ubWV0aG9kLCAnT1BFUkFUSU9OX01FVEhPRCcsICdPcGVyYXRpb24gbWV0aG9kJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQoJ21ldGhvZCcpLCByZXN1bHQuZXJyb3JzKTtcblxuICAgICAgICAgICAgLy8gVmFsaWRhdGUgYXV0aG9yaXphdGlvbnNcbiAgICAgICAgICAgIF8uZWFjaChvcGVyYXRpb24uYXV0aG9yaXphdGlvbnMsIGZ1bmN0aW9uIChzY29wZXMsIG5hbWUpIHtcbiAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgbWlzc2luZyBhdXRob3JpemF0aW9uXG4gICAgICAgICAgICAgIHZhbGlkYXRlRXhpc3QoXy51bmlxKE9iamVjdC5rZXlzKGFwaUF1dGhEZWZzKS5jb25jYXQoT2JqZWN0LmtleXMoYXV0aERlZnMpKSksIG5hbWUsICdBVVRIT1JJWkFUSU9OJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQXV0aG9yaXphdGlvbicsIG9QYXRoLmNvbmNhdChbJ2F1dGhvcml6YXRpb25zJywgbmFtZV0pLCByZXN1bHQuZXJyb3JzKTtcblxuICAgICAgICAgICAgICAvLyBWYWxpZGF0ZSBtaXNzaW5nIGF1dGhvcml6YXRpb24gc2NvcGVzIChPbmx5IHdoZW4gdGhlIGF1dGhvcml6YXRpb24gaXMgbm90IG1pc3NpbmcpXG4gICAgICAgICAgICAgIF8uZWFjaChzY29wZXMsIGZ1bmN0aW9uIChzY29wZSwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQoYXBpQXV0aERlZnNbbmFtZV0pIHx8ICFfLmlzVW5kZWZpbmVkKGF1dGhEZWZzW25hbWVdKSkge1xuICAgICAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgbWlzc2luZyBhdXRob3JpemF0aW9uIHNjb3BlXG4gICAgICAgICAgICAgICAgICB2YWxpZGF0ZUV4aXN0KF8udW5pcSgoYXBpQXV0aERlZnNbbmFtZV0gfHwgW10pLmNvbmNhdChhdXRoRGVmc1tuYW1lXSB8fCBbXSkpLCBzY29wZS5zY29wZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0FVVEhPUklaQVRJT05fU0NPUEUnLCAnQXV0aG9yaXphdGlvbiBzY29wZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9QYXRoLmNvbmNhdChbJ2F1dGhvcml6YXRpb25zJywgbmFtZSwgaW5kZXgudG9TdHJpbmcoKSwgJ3Njb3BlJ10pLCByZXN1bHQuZXJyb3JzKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBhZGRTY29wZVJlZihuYW1lLCBzY29wZS5zY29wZSk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlcnNcbiAgICAgICAgICAgIF8ucmVkdWNlKG9wZXJhdGlvbi5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlciwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgdmFyIHBQYXRoID0gb1BhdGguY29uY2F0KCdwYXJhbWV0ZXJzJywgaW5kZXgudG9TdHJpbmcoKSk7XG5cbiAgICAgICAgICAgICAgdmFsaWRhdGVBcnJheVR5cGUocGFyYW1ldGVyLCBwUGF0aCwgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgICAgICAgLy8gQWRkIG1vZGVsIHJlZmVyZW5jZXMgZnJvbSBwYXJhbWV0ZXIgdHlwZS9pdGVtc1xuICAgICAgICAgICAgICBpZiAoc3BlYy5wcmltaXRpdmVzLmluZGV4T2YocGFyYW1ldGVyLnR5cGUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIGFkZE1vZGVsUmVmKHBhcmFtZXRlci50eXBlLCBvUGF0aC5jb25jYXQoWydwYXJhbWV0ZXJzJywgaW5kZXgudG9TdHJpbmcoKSwgJ3R5cGUnXSkpO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBhcmFtZXRlci50eXBlID09PSAnYXJyYXknICYmICFfLmlzVW5kZWZpbmVkKHBhcmFtZXRlci5pdGVtcykgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICFfLmlzVW5kZWZpbmVkKHBhcmFtZXRlci5pdGVtcy4kcmVmKSkge1xuICAgICAgICAgICAgICAgIGFkZE1vZGVsUmVmKHBhcmFtZXRlci5pdGVtcy4kcmVmLCBwUGF0aC5jb25jYXQoWydpdGVtcycsICckcmVmJ10pKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSBwYXJhbWV0ZXIgbmFtZVxuICAgICAgICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblBhcmFtZXRlcnMsIHBhcmFtZXRlci5uYW1lLCAnT1BFUkFUSU9OX1BBUkFNRVRFUicsICdPcGVyYXRpb24gcGFyYW1ldGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnbmFtZScpLCByZXN1bHQuZXJyb3JzKTtcblxuICAgICAgICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIHBhdGggcGFyYW1ldGVyc1xuICAgICAgICAgICAgICBpZiAocGFyYW1ldGVyLnBhcmFtVHlwZSA9PT0gJ3BhdGgnKSB7XG4gICAgICAgICAgICAgICAgaWYgKG5QYXRoLmFyZ3MuaW5kZXhPZihwYXJhbWV0ZXIubmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFX0FQSV9QQVRIX1BBUkFNRVRFUicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQVBJIHBhdGggcGFyYW1ldGVyIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHBhcmFtZXRlci5uYW1lLCBwYXJhbWV0ZXIubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnbmFtZScpLCByZXN1bHQuZXJyb3JzKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc1BhcmFtcy5pbmRleE9mKHBhcmFtZXRlci5uYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgIHNQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHBhcmFtZXRlci5kZWZhdWx0VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgZGVmYXVsdCB2YWx1ZSBhZ2FpbnN0IGNvbnN0cmFpbnRzXG4gICAgICAgICAgICAgICAgdmFsaWRhdGVQYXJhbWV0ZXJDb25zdHJhaW50cyhzcGVjLCBwYXJhbWV0ZXIsIHBhcmFtZXRlci5kZWZhdWx0VmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQoJ3BhcmFtZXRlcnMnLCBpbmRleC50b1N0cmluZygpLCAnZGVmYXVsdFZhbHVlJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQuZXJyb3JzKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHJldHVybiBzZWVuUGFyYW1ldGVycy5jb25jYXQocGFyYW1ldGVyLm5hbWUpO1xuICAgICAgICAgICAgfSwgW10pO1xuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSBtaXNzaW5nIHBhdGggcGFyYW1ldGVycyAoaW4gcGF0aCBidXQgbm90IGluIG9wZXJhdGlvbi5wYXJhbWV0ZXJzKVxuICAgICAgICAgICAgXy5lYWNoKF8uZGlmZmVyZW5jZShuUGF0aC5hcmdzLCBzUGFyYW1zKSwgZnVuY3Rpb24gKHVudXNlZCkge1xuICAgICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnTUlTU0lOR19BUElfUEFUSF9QQVJBTUVURVInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQVBJIHJlcXVpcmVzIHBhdGggcGFyYW1ldGVyIGJ1dCBpdCBpcyBub3QgZGVmaW5lZDogJyArIHVudXNlZCwgYXBpLnBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFQYXRoLmNvbmNhdCgncGF0aCcpLCByZXN1bHQuZXJyb3JzKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBWYWxpZGF0ZSB1bmlxdWUgcmVzcG9uc2UgY29kZVxuICAgICAgICAgICAgXy5yZWR1Y2Uob3BlcmF0aW9uLnJlc3BvbnNlTWVzc2FnZXMsIGZ1bmN0aW9uIChzZWVuUmVzcG9uc2VDb2RlcywgcmVzcG9uc2VNZXNzYWdlLCBpbmRleCkge1xuICAgICAgICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblJlc3BvbnNlQ29kZXMsIHJlc3BvbnNlTWVzc2FnZS5jb2RlLCAnUkVTUE9OU0VfTUVTU0FHRV9DT0RFJywgJ1Jlc3BvbnNlIG1lc3NhZ2UgY29kZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvUGF0aC5jb25jYXQoWydyZXNwb25zZU1lc3NhZ2VzJywgaW5kZXgudG9TdHJpbmcoKSwgJ2NvZGUnXSksIHJlc3VsdC5lcnJvcnMpO1xuXG4gICAgICAgICAgICAgIC8vIEFkZCBtb2RlbCByZWZlcmVuY2VzIGZyb20gcmVzcG9uc2VNZXNzYWdlcyByZXNwb25zZU1vZGVsXG4gICAgICAgICAgICAgIGlmIChyZXNwb25zZU1lc3NhZ2UucmVzcG9uc2VNb2RlbCkge1xuICAgICAgICAgICAgICAgIGFkZE1vZGVsUmVmKHJlc3BvbnNlTWVzc2FnZS5yZXNwb25zZU1vZGVsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9QYXRoLmNvbmNhdChbJ3Jlc3BvbnNlTWVzc2FnZXMnLCBpbmRleC50b1N0cmluZygpLCAncmVzcG9uc2VNb2RlbCddKSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICByZXR1cm4gc2VlblJlc3BvbnNlQ29kZXMuY29uY2F0KHJlc3BvbnNlTWVzc2FnZS5jb2RlKTtcbiAgICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgICAgdmFsaWRhdGVBcnJheVR5cGUob3BlcmF0aW9uLCBvUGF0aCwgcmVzdWx0LmVycm9ycyk7XG5cbiAgICAgICAgICAgIC8vIEFkZCBtb2RlbCByZWZlcmVuY2VzIGZyb20gdHlwZS9pdGVtc1xuICAgICAgICAgICAgaWYgKG9wZXJhdGlvbi50eXBlID09PSAnYXJyYXknICYmICFfLmlzVW5kZWZpbmVkKG9wZXJhdGlvbi5pdGVtcykgJiYgIV8uaXNVbmRlZmluZWQob3BlcmF0aW9uLml0ZW1zLiRyZWYpKSB7XG4gICAgICAgICAgICAgIGFkZE1vZGVsUmVmKG9wZXJhdGlvbi5pdGVtcy4kcmVmLCBvUGF0aC5jb25jYXQoWydpdGVtcycsICckcmVmJ10pKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3BlYy5wcmltaXRpdmVzLmluZGV4T2Yob3BlcmF0aW9uLnR5cGUpID09PSAtMSkge1xuICAgICAgICAgICAgICBhZGRNb2RlbFJlZihvcGVyYXRpb24udHlwZSwgb1BhdGguY29uY2F0KFsndHlwZSddKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBzZWVuTWV0aG9kcy5jb25jYXQob3BlcmF0aW9uLm1ldGhvZCk7XG4gICAgICAgICAgfSwgW10pO1xuXG4gICAgICAgICAgcmV0dXJuIHNlZW5BcGlQYXRocy5jb25jYXQoblBhdGgucGF0aCk7XG4gICAgICAgIH0sIFtdKTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBtb2RlbHNcbiAgICAgICAgXy5lYWNoKG1vZGVsc01ldGFkYXRhLCBmdW5jdGlvbiAobWV0YWRhdGEsIG1vZGVsSWQpIHtcbiAgICAgICAgICAvLyBJZGVudGlmeSBtaXNzaW5nIG1vZGVscyAocmVmZXJlbmNlZCBidXQgbm90IGRlY2xhcmVkKVxuICAgICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKG1ldGFkYXRhLnNjaGVtYSkpIHtcbiAgICAgICAgICAgIF8uZWFjaChtZXRhZGF0YS5yZWZzLCBmdW5jdGlvbiAocmVmKSB7XG4gICAgICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlJFU09MVkFCTEVfTU9ERUwnLCAnTW9kZWwgY291bGQgbm90IGJlIHJlc29sdmVkOiAnICsgbW9kZWxJZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxJZCwgcmVmLCByZXN1bHQuZXJyb3JzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIElkZW50aWZ5IHVudXNlZCBtb2RlbHMgKGRlY2xhcmVkIGJ1dCBub3QgcmVmZXJlbmNlZClcbiAgICAgICAgICBpZiAobWV0YWRhdGEucmVmcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKG1ldGFkYXRhLnNjaGVtYSwgbW9kZWxJZCwgJ01PREVMJywgJ01vZGVsJywgWydtb2RlbHMnLCBtZXRhZGF0YS5uYW1lXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC53YXJuaW5ncyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSB1bnVzZWQgYXV0aG9yaXphdGlvbnNcbiAgICAgICAgXy5lYWNoKF8uZGlmZmVyZW5jZShPYmplY3Qua2V5cyhhcGlBdXRoRGVmcyksIE9iamVjdC5rZXlzKGFwaUF1dGhSZWZzKSksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhhcGlEZWNsYXJhdGlvbi5hdXRob3JpemF0aW9uc1t1bnVzZWRdLCB1bnVzZWQsICdBVVRIT1JJWkFUSU9OJywgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnYXV0aG9yaXphdGlvbnMnLCB1bnVzZWRdLCByZXN1bHQud2FybmluZ3MpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSB1bnVzZWQgYXV0aG9yaXphdGlvbiBzY29wZXNcbiAgICAgICAgXy5lYWNoKGFwaUF1dGhEZWZzLCBmdW5jdGlvbiAoc2NvcGVzLCBuYW1lKSB7XG4gICAgICAgICAgdmFyIHBhdGggPSBbJ2F1dGhvcml6YXRpb25zJywgbmFtZV07XG4gICAgICAgICAgdmFyIGF1dGhEZWYgPSBhcGlEZWNsYXJhdGlvbi5hdXRob3JpemF0aW9uc1tuYW1lXTtcblxuICAgICAgICAgIF8uZWFjaChfLmRpZmZlcmVuY2Uoc2NvcGVzLCBhcGlBdXRoUmVmc1tuYW1lXSB8fCBbXSksIGZ1bmN0aW9uIChzY29wZSkge1xuICAgICAgICAgICAgdmFyIHNJbmRleCA9IHNjb3Blcy5pbmRleE9mKHNjb3BlKTtcblxuICAgICAgICAgICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcoYXV0aERlZi5zY29wZXNbc0luZGV4XSwgc2NvcGUsICdBVVRIT1JJWkFUSU9OX1NDT1BFJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBdXRob3JpemF0aW9uIHNjb3BlJywgcGF0aC5jb25jYXQoWydzY29wZXMnLCBzSW5kZXgudG9TdHJpbmcoKV0pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lndhcm5pbmdzKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gVmFsaWRhdGUgdW51c2VkIHJlc291cmNlc1xuICAgICAgXy5lYWNoKF8uZGlmZmVyZW5jZShwYXRoRGVmcywgcGF0aFJlZnMpLCBmdW5jdGlvbiAodW51c2VkKSB7XG4gICAgICAgIHZhciBpbmRleCA9IF8ubWFwKHJsT3JTTy5hcGlzLCBmdW5jdGlvbiAoYXBpKSB7IHJldHVybiBhcGkucGF0aDsgfSkuaW5kZXhPZih1bnVzZWQpO1xuXG4gICAgICAgIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nKHJsT3JTTy5hcGlzW2luZGV4XS5wYXRoLCB1bnVzZWQsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbJ2FwaXMnLCBpbmRleC50b1N0cmluZygpLCAncGF0aCddLCByZXNwb25zZS5lcnJvcnMpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHVudXNlZCBhdXRob3JpemF0aW9uc1xuICAgICAgXy5lYWNoKF8uZGlmZmVyZW5jZShPYmplY3Qua2V5cyhhdXRoRGVmcyksIE9iamVjdC5rZXlzKGF1dGhSZWZzKSksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcocmxPclNPLmF1dGhvcml6YXRpb25zW3VudXNlZF0sIHVudXNlZCwgJ0FVVEhPUklaQVRJT04nLCAnQXV0aG9yaXphdGlvbicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnYXV0aG9yaXphdGlvbnMnLCB1bnVzZWRdLCByZXNwb25zZS53YXJuaW5ncyk7XG4gICAgICB9KTtcblxuICAgICAgLy8gVmFsaWRhdGUgdW51c2VkIGF1dGhvcml6YXRpb24gc2NvcGVzXG4gICAgICBfLmVhY2goYXV0aFJlZnMsIGZ1bmN0aW9uIChzY29wZXMsIG5hbWUpIHtcbiAgICAgICAgdmFyIHBhdGggPSBbJ2F1dGhvcml6YXRpb25zJywgbmFtZV07XG5cbiAgICAgICAgXy5lYWNoKF8uZGlmZmVyZW5jZShzY29wZXMsIGF1dGhSZWZzW25hbWVdKSwgZnVuY3Rpb24gKHVudXNlZCkge1xuICAgICAgICAgIHZhciBpbmRleCA9IHNjb3Blcy5pbmRleE9mKHVudXNlZCk7XG5cbiAgICAgICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhybE9yU08uYXV0aG9yaXphdGlvbnNbbmFtZV0uc2NvcGVzW2luZGV4XSwgdW51c2VkLCAnQVVUSE9SSVpBVElPTl9TQ09QRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0F1dGhvcml6YXRpb24gc2NvcGUnLCBwYXRoLmNvbmNhdChbJ3Njb3BlcycsIGluZGV4LnRvU3RyaW5nKCldKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNwb25zZS53YXJuaW5ncyk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBWYWxpZGF0ZSAoZm9yIG5vdykgdW5pcXVlIGNvbnN1bWVzL3Byb2R1Y2VzL3NjaGVtZXNcbiAgICBfLmVhY2goWydjb25zdW1lcycsICdwcm9kdWNlcycsICdzY2hlbWVzJ10sIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICB2YWxpZGF0ZU5vRHVwbGljYXRlcyhybE9yU09bbmFtZV0sICdBUElfJyArIG5hbWUudG9VcHBlckNhc2UoKSwgJ0FQSScsIFtuYW1lXSwgcmVzcG9uc2Uud2FybmluZ3MpO1xuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLmVycm9ycy5sZW5ndGggPT09IDAgJiYgcmVzcG9uc2Uud2FybmluZ3MubGVuZ3RoID09PSAwKSB7XG4gICAgICB2YXIgbW9kZWxzTWV0YWRhdGEgPSBnZXRNb2RlbHNNZXRhZGF0YShzcGVjLCBybE9yU08sIHJlc3BvbnNlKS5tZXRhZGF0YTtcblxuICAgICAgLy8gVmFsaWRhdGUgdGhlIFBhdGhzXG4gICAgICBfLnJlZHVjZShybE9yU08ucGF0aHMsIGZ1bmN0aW9uIChzZWVuUGF0aHMsIHBhdGgsIG5hbWUpIHtcbiAgICAgICAgdmFyIGFQYXRoID0gWydwYXRocycsIG5hbWVdO1xuICAgICAgICB2YXIgblBhdGggPSBub3JtYWxpemVQYXRoKG5hbWUpO1xuICAgICAgICB2YXIgc1BhcmFtcyA9IFtdO1xuXG4gICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXG4gICAgICAgIGlmIChzZWVuUGF0aHMuaW5kZXhPZihuUGF0aC5wYXRoKSA+IC0xKSB7XG4gICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV9BUElfUEFUSCcsICdBUEkgcGF0aCAob3IgZXF1aXZhbGVudCkgYWxyZWFkeSBkZWZpbmVkOiAnICsgbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lLCBhUGF0aCwgcmVzcG9uc2UuZXJyb3JzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFZhbGlkYXRlIHRoZSBPcGVyYXRpb25zXG4gICAgICAgIF8uZWFjaChwYXRoLCBmdW5jdGlvbiAob3BlcmF0aW9uLCBtZXRob2QpIHtcbiAgICAgICAgICB2YXIgb1BhdGggPSBhUGF0aC5jb25jYXQobWV0aG9kKTtcblxuICAgICAgICAgIGlmIChtZXRob2QgPT09ICdwYXJhbWV0ZXJzJykge1xuICAgICAgICAgICAgLy8gVmFsaWRhdGUgcGFyYW1ldGVyIGNvbnN0cmFpbnRzXG4gICAgICAgICAgICBfLnJlZHVjZShwYXRoLnBhcmFtZXRlcnMsIGZ1bmN0aW9uIChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLCBpbmRleCkge1xuICAgICAgICAgICAgICB2YXIgcFBhdGggPSBvUGF0aC5jb25jYXQoaW5kZXgudG9TdHJpbmcoKSk7XG5cbiAgICAgICAgICAgICAgLy8gVmFsaWRhdGUgZHVwbGljYXRlIHBhcmFtZXRlciBuYW1lXG4gICAgICAgICAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLm5hbWUsICdBUElfUEFSQU1FVEVSJywgJ0FQSSBwYXJhbWV0ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcFBhdGguY29uY2F0KCduYW1lJyksIHJlc3BvbnNlLmVycm9ycyk7XG5cbiAgICAgICAgICAgICAgLy8gS2VlcCB0cmFjayBvZiBwYXRoIHBhcmFtZXRlcnNcbiAgICAgICAgICAgICAgaWYgKHBhcmFtZXRlci5pbiA9PT0gJ3BhdGgnKSB7XG4gICAgICAgICAgICAgICAgaWYgKG5QYXRoLmFyZ3MuaW5kZXhPZihwYXJhbWV0ZXIubmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFX0FQSV9QQVRIX1BBUkFNRVRFUicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnQVBJIHBhdGggcGFyYW1ldGVyIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHBhcmFtZXRlci5uYW1lLCBwYXJhbWV0ZXIubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnbmFtZScpLCByZXNwb25zZS5lcnJvcnMpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzUGFyYW1zLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgc1BhcmFtcy5wdXNoKHBhcmFtZXRlci5uYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBGaW5kIG1vZGVscyBkZWZpbmVkL3JlZmVyZW5jZWQgaW4gIy9wYXRocy97cGF0aH0vcGFyYW1ldGVyc1xuICAgICAgICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQocGFyYW1ldGVyLnNjaGVtYSkpIHtcbiAgICAgICAgICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIHBhcmFtZXRlci5zY2hlbWEsIHRvSnNvblBvaW50ZXIocFBhdGguY29uY2F0KCdzY2hlbWEnKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnc2NoZW1hJyksIHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHJldHVybiBzZWVuUGFyYW1ldGVycy5jb25jYXQocGFyYW1ldGVyLm5hbWUpO1xuICAgICAgICAgICAgfSwgW10pO1xuXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gVmFsaWRhdGUgKGZvciBub3cpIGNvbnN1bWVzL3Byb2R1Y2VzL3NjaGVtZXMgdW5pcXVlbmVzc1xuICAgICAgICAgIF8uZWFjaChbJ2NvbnN1bWVzJywgJ3Byb2R1Y2VzJywgJ3NjaGVtZXMnXSwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlTm9EdXBsaWNhdGVzKG9wZXJhdGlvbltuYW1lXSwgJ09QRVJBVElPTl8nICsgbmFtZS50b1VwcGVyQ2FzZSgpLCAnT3BlcmF0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9QYXRoLmNvbmNhdChuYW1lKSwgcmVzcG9uc2Uud2FybmluZ3MpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gVmFsaWRhdGUgcGFyYW1ldGVyIGNvbnN0cmFpbnRzXG4gICAgICAgICAgXy5yZWR1Y2Uob3BlcmF0aW9uLnBhcmFtZXRlcnMsIGZ1bmN0aW9uIChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLCBpbmRleCkge1xuICAgICAgICAgICAgdmFyIHBQYXRoID0gb1BhdGguY29uY2F0KCdwYXJhbWV0ZXJzJywgaW5kZXgudG9TdHJpbmcoKSk7XG5cbiAgICAgICAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSBwYXJhbWV0ZXIgbmFtZVxuICAgICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5QYXJhbWV0ZXJzLCBwYXJhbWV0ZXIubmFtZSwgJ09QRVJBVElPTl9QQVJBTUVURVInLCAnT3BlcmF0aW9uIHBhcmFtZXRlcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcFBhdGguY29uY2F0KCduYW1lJyksIHJlc3BvbnNlLmVycm9ycyk7XG5cbiAgICAgICAgICAgIC8vIEtlZXAgdHJhY2sgb2YgcGF0aCBwYXJhbWV0ZXJzXG4gICAgICAgICAgICBpZiAocGFyYW1ldGVyLmluID09PSAncGF0aCcpIHtcbiAgICAgICAgICAgICAgaWYgKG5QYXRoLmFyZ3MuaW5kZXhPZihwYXJhbWV0ZXIubmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV9BUElfUEFUSF9QQVJBTUVURVInLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgcGF0aCBwYXJhbWV0ZXIgY291bGQgbm90IGJlIHJlc29sdmVkOiAnICsgcGFyYW1ldGVyLm5hbWUsIHBhcmFtZXRlci5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnbmFtZScpLCByZXNwb25zZS5lcnJvcnMpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgaWYgKHNQYXJhbXMuaW5kZXhPZihwYXJhbWV0ZXIubmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgc1BhcmFtcy5wdXNoKHBhcmFtZXRlci5uYW1lKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBGaW5kIG1vZGVscyBkZWZpbmVkL3JlZmVyZW5jZWQgaW4gIy9wYXRocy97cGF0aH0ve21ldGhvZH0vcGFyYW1ldGVyc1xuICAgICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHBhcmFtZXRlci5zY2hlbWEpKSB7XG4gICAgICAgICAgICAgIHByb2Nlc3NNb2RlbChzcGVjLCBtb2RlbHNNZXRhZGF0YSwgcGFyYW1ldGVyLnNjaGVtYSwgdG9Kc29uUG9pbnRlcihwUGF0aC5jb25jYXQoJ3NjaGVtYScpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLmNvbmNhdCgnc2NoZW1hJyksIHJlc3BvbnNlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHNlZW5QYXJhbWV0ZXJzLmNvbmNhdChwYXJhbWV0ZXIubmFtZSk7XG4gICAgICAgICAgfSwgW10pO1xuXG4gICAgICAgICAgLy8gRmluZCBtb2RlbHMgZGVmaW5lZC9yZWZlcmVuY2VkIGluICMvcGF0aHMve3BhdGh9L3ttZXRob2R9L3Jlc3BvbnNlc1xuICAgICAgICAgIF8uZWFjaChvcGVyYXRpb24ucmVzcG9uc2VzLCBmdW5jdGlvbiAocmVzcG9uc2VPYmosIHJlc3BvbnNlQ29kZSkge1xuICAgICAgICAgICAgdmFyIHJQYXRoID0gb1BhdGguY29uY2F0KCdyZXNwb25zZXMnLCByZXNwb25zZUNvZGUpO1xuXG4gICAgICAgICAgICBpZiAoIV8uaXNVbmRlZmluZWQocmVzcG9uc2VPYmouc2NoZW1hKSkge1xuICAgICAgICAgICAgICBwcm9jZXNzTW9kZWwoc3BlYywgbW9kZWxzTWV0YWRhdGEsIHJlc3BvbnNlT2JqLnNjaGVtYSwgdG9Kc29uUG9pbnRlcihyUGF0aC5jb25jYXQoJ3NjaGVtYScpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHJQYXRoLmNvbmNhdCgnc2NoZW1hJyksIHJlc3BvbnNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgbWlzc2luZyBwYXRoIHBhcmFtZXRlcnMgKGluIHBhdGggYnV0IG5vdCBpbiBvcGVyYXRpb24ucGFyYW1ldGVycylcbiAgICAgICAgXy5lYWNoKF8uZGlmZmVyZW5jZShuUGF0aC5hcmdzLCBzUGFyYW1zKSwgZnVuY3Rpb24gKHVudXNlZCkge1xuICAgICAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNSVNTSU5HX0FQSV9QQVRIX1BBUkFNRVRFUicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ0FQSSByZXF1aXJlcyBwYXRoIHBhcmFtZXRlciBidXQgaXQgaXMgbm90IGRlZmluZWQ6ICcgKyB1bnVzZWQsIG5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYVBhdGgsIHJlc3BvbnNlLmVycm9ycyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBzZWVuUGF0aHMuY29uY2F0KG5QYXRoLnBhdGgpO1xuICAgICAgfSwgW10pO1xuXG4gICAgICAvLyBWYWxpZGF0ZSBtb2RlbHNcbiAgICAgIF8uZWFjaChtb2RlbHNNZXRhZGF0YSwgZnVuY3Rpb24gKG1ldGFkYXRhLCBtb2RlbElkKSB7XG4gICAgICAgIC8vIElkZW50aWZ5IG1pc3NpbmcgbW9kZWxzIChyZWZlcmVuY2VkIGJ1dCBub3QgZGVjbGFyZWQpXG4gICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKG1ldGFkYXRhLnNjaGVtYSkpIHtcbiAgICAgICAgICBfLmVhY2gobWV0YWRhdGEucmVmcywgZnVuY3Rpb24gKHJlZikge1xuICAgICAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ1VOUkVTT0xWQUJMRV9NT0RFTCcsICdNb2RlbCBjb3VsZCBub3QgYmUgcmVzb2x2ZWQ6ICcgKyBtb2RlbElkLCBtb2RlbElkLCByZWYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNwb25zZS5lcnJvcnMpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWRlbnRpZnkgdW51c2VkIG1vZGVscyAoZGVjbGFyZWQgYnV0IG5vdCByZWZlcmVuY2VkKVxuICAgICAgICBpZiAobWV0YWRhdGEucmVmcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhtZXRhZGF0YS5zY2hlbWEsIG1vZGVsSWQsICdNT0RFTCcsICdNb2RlbCcsIG1vZGVsSWQuc3Vic3RyaW5nKDIpLnNwbGl0KCcvJyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2Uud2FybmluZ3MpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBicmVhaztcbiAgfVxuXG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgcmVzdWx0IG9mIHRoZSB2YWxpZGF0aW9uIG9mIHRoZSBTd2FnZ2VyIGRvY3VtZW50KHMpLlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBybE9yU08gLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBMaXN0aW5nICgxLjIpIG9yIFN3YWdnZXIgT2JqZWN0ICgyLjApXG4gKiBAcGFyYW0ge29iamVjdFtdfSBbYXBpRGVjbGFyYXRpb25zXSAtIFRoZSBhcnJheSBvZiBTd2FnZ2VyIEFQSSBEZWNsYXJhdGlvbnMgKDEuMilcbiAqXG4gKiBAcmV0dXJucyB1bmRlZmluZWQgaWYgdmFsaWRhdGlvbiBwYXNzZXMgb3IgYW4gb2JqZWN0IGNvbnRhaW5pbmcgZXJyb3JzIGFuZC9vciB3YXJuaW5nc1xuICovXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS52YWxpZGF0ZSA9IGZ1bmN0aW9uIHZhbGlkYXRlIChybE9yU08sIGFwaURlY2xhcmF0aW9ucykge1xuICB2YXIgcmVzcG9uc2UgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcbiAgdmFyIHNraXBSZW1haW5pbmcgPSBmYWxzZTtcblxuICBzd2l0Y2ggKHRoaXMudmVyc2lvbikge1xuICBjYXNlICcxLjInOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigncmVzb3VyY2VMaXN0aW5nIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURlY2xhcmF0aW9ucykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYXBpRGVjbGFyYXRpb25zIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc0FycmF5KGFwaURlY2xhcmF0aW9ucykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgc3RydWN0dXJhbGx5XG4gICAgcmVzcG9uc2UgPSB2YWxpZGF0ZVdpdGhTY2hlbWEodGhpcywgJ3Jlc291cmNlTGlzdGluZy5qc29uJywgcmxPclNPKTtcblxuICAgIGlmIChyZXNwb25zZS5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgc2tpcFJlbWFpbmluZyA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKCFza2lwUmVtYWluaW5nKSB7XG4gICAgICByZXNwb25zZS5hcGlEZWNsYXJhdGlvbnMgPSBbXTtcblxuICAgICAgXy5lYWNoKGFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGFwaURlY2xhcmF0aW9uLCBpbmRleCkge1xuICAgICAgICByZXNwb25zZS5hcGlEZWNsYXJhdGlvbnNbaW5kZXhdID0gdmFsaWRhdGVXaXRoU2NoZW1hKHRoaXMsICdhcGlEZWNsYXJhdGlvbi5qc29uJywgYXBpRGVjbGFyYXRpb24pO1xuXG4gICAgICAgIGlmIChyZXNwb25zZS5hcGlEZWNsYXJhdGlvbnNbaW5kZXhdLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgc2tpcFJlbWFpbmluZyA9IHRydWU7XG5cbiAgICAgICAgICAvLyBTa2lwIHRoZSByZW1haW5pbmcgdmFsaWRhdGlvblxuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBzZW1hbnRpY2FsbHlcbiAgICBpZiAoIXNraXBSZW1haW5pbmcpIHtcbiAgICAgIHJlc3BvbnNlID0gdmFsaWRhdGVDb250ZW50KHRoaXMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zKTtcbiAgICB9XG5cbiAgICAvLyBTZXQgdGhlIHJlc3BvbnNlXG4gICAgcmVzcG9uc2UgPSByZXNwb25zZS5lcnJvcnMubGVuZ3RoID4gMCB8fCByZXNwb25zZS53YXJuaW5ncy5sZW5ndGggPiAwIHx8XG4gICAgICBfLnJlZHVjZShyZXNwb25zZS5hcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChjb3VudCwgYXBpRGVjbGFyYXRpb24pIHtcbiAgICAgICAgcmV0dXJuIGNvdW50ICtcbiAgICAgICAgICAoXy5pc0FycmF5KGFwaURlY2xhcmF0aW9uLmVycm9ycykgPyBhcGlEZWNsYXJhdGlvbi5lcnJvcnMubGVuZ3RoIDogMCkgK1xuICAgICAgICAgIChfLmlzQXJyYXkoYXBpRGVjbGFyYXRpb24ud2FybmluZ3MpID8gYXBpRGVjbGFyYXRpb24ud2FybmluZ3MubGVuZ3RoIDogMCk7XG4gICAgICB9LCAwKSA+IDAgPyByZXNwb25zZSA6IHVuZGVmaW5lZDtcblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQocmxPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzd2FnZ2VyT2JqZWN0IGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N3YWdnZXJPYmplY3QgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBzdHJ1Y3R1cmFsbHlcbiAgICByZXNwb25zZSA9IHZhbGlkYXRlV2l0aFNjaGVtYSh0aGlzLCAnc2NoZW1hLmpzb24nLCBybE9yU08pO1xuXG4gICAgaWYgKHJlc3BvbnNlLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICBza2lwUmVtYWluaW5nID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBzZW1hbnRpY2FsbHlcbiAgICBpZiAoIXNraXBSZW1haW5pbmcpIHtcbiAgICAgIHJlc3BvbnNlID0gdmFsaWRhdGVDb250ZW50KHRoaXMsIHJsT3JTTyk7XG4gICAgfVxuXG4gICAgLy8gU2V0IHRoZSByZXNwb25zZVxuICAgIHJlc3BvbnNlID0gcmVzcG9uc2UuZXJyb3JzLmxlbmd0aCA+IDAgfHwgcmVzcG9uc2Uud2FybmluZ3MubGVuZ3RoID4gMCA/IHJlc3BvbnNlIDogdW5kZWZpbmVkO1xuXG4gICAgYnJlYWs7XG4gIH1cblxuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBKU09OIFNjaGVtYSByZXByZXNlbnRhdGlvbiBvZiBhIGNvbXBvc2VkIG1vZGVsIGJhc2VkIG9uIGl0cyBpZC5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gYXBpRE9yU08gLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBBUEkgRGVjbGFyYXRpb24gKDEuMikgb3IgdGhlIFN3YWdnZXIgT2JqZWN0ICgyLjApXG4gKiBAcGFyYW0ge3N0cmluZ30gbW9kZWxJZE9yUGF0aCAtIFRoZSBtb2RlbCBpZCAoMS4yIG9yIDIuMCkgb3IgdGhlIHBhdGggdG8gdGhlIG1vZGVsICgyLjApXG4gKlxuICogQHJldHVybnMgdGhlIG9iamVjdCByZXByZXNlbnRpbmcgYSBjb21wb3NlZCBvYmplY3RcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZXJlIGFyZSB2YWxpZGF0aW9uIGVycm9ycyB3aGlsZSBjcmVhdGluZ1xuICovXG5TcGVjaWZpY2F0aW9uLnByb3RvdHlwZS5jb21wb3NlTW9kZWwgPSBmdW5jdGlvbiBjb21wb3NlTW9kZWwgKGFwaURPclNPLCBtb2RlbElkT3JQYXRoKSB7XG4gIHZhciBtZXRhZGF0YUVudHJ5O1xuICB2YXIgbW9kZWxNZXRhZGF0YTtcbiAgdmFyIG1vZGVsc01ldGFkYXRhO1xuICB2YXIgZXJyO1xuXG4gIHN3aXRjaCAodGhpcy52ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9uIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignYXBpRGVjbGFyYXRpb24gbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbElkIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignc3dhZ2dlck9iamVjdCBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N3YWdnZXJPYmplY3QgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbElkT3JQYXRoIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgYnJlYWs7XG4gIH1cblxuICBtZXRhZGF0YUVudHJ5ID0gZ2V0TW9kZWxzTWV0YWRhdGEodGhpcywgYXBpRE9yU08pO1xuICBtb2RlbHNNZXRhZGF0YSA9IG1ldGFkYXRhRW50cnkubWV0YWRhdGE7XG5cbiAgLy8gQ29tcG9zaW5nIGEgbW9kZWwgZm9yIGFuIGludmFsaWQgbW9kZWwgaGllcmFyY2h5IGlzIGJyaXR0bGUgYW5kIHNvIHdlIHdpbGwgbm90IGRvIGl0XG4gIGlmIChtZXRhZGF0YUVudHJ5LnJlc3VsdHMuZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICBlcnIgPSBuZXcgRXJyb3IoJ1RoZSBtb2RlbHMgYXJlIGludmFsaWQgYW5kIG1vZGVsIGNvbXBvc2l0aW9uIGlzIG5vdCBwb3NzaWJsZScpO1xuXG4gICAgZXJyLmVycm9ycyA9IG1ldGFkYXRhRW50cnkucmVzdWx0cy5lcnJvcnM7XG4gICAgZXJyLndhcm5pbmdzID0gbWV0YWRhdGFFbnRyeS5yZXN1bHRzLndhcm5pbmdzO1xuXG4gICAgdGhyb3cgZXJyO1xuICB9XG5cbiAgbW9kZWxNZXRhZGF0YSA9IG1vZGVsc01ldGFkYXRhW3RoaXMudmVyc2lvbiA9PT0gJzEuMicgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbElkT3JQYXRoIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVmVG9Kc29uUG9pbnRlcihtb2RlbElkT3JQYXRoKV07XG5cbiAgcmV0dXJuIF8uaXNVbmRlZmluZWQobW9kZWxNZXRhZGF0YSkgPyB1bmRlZmluZWQgOiBtb2RlbE1ldGFkYXRhLmNvbXBvc2VkO1xufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgYSBtb2RlbCBiYXNlZCBvbiBpdHMgaWQuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IGFwaURPclNPIC0gVGhlIFN3YWdnZXIgUmVzb3VyY2UgQVBJIERlY2xhcmF0aW9uICgxLjIpIG9yIHRoZSBTd2FnZ2VyIE9iamVjdCAoMi4wKVxuICogQHBhcmFtIHtzdHJpbmd9IG1vZGVsSWRPclBhdGggLSBUaGUgbW9kZWwgaWQgKDEuMiBvciAyLjApIG9yIHRoZSBwYXRoIHRvIHRoZSBtb2RlbCAoMi4wKVxuICogQHBhcmFtIHtvYmplY3R9IGRhdGEgLSBUaGUgbW9kZWwgdG8gdmFsaWRhdGVcbiAqXG4gKiBAcmV0dXJucyB1bmRlZmluZWQgaWYgdmFsaWRhdGlvbiBwYXNzZXMgb3IgYW4gb2JqZWN0IGNvbnRhaW5pbmcgZXJyb3JzIGFuZC9vciB3YXJuaW5nc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlcmUgYXJlIHZhbGlkYXRpb24gZXJyb3JzIHdoaWxlIGNyZWF0aW5nXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnZhbGlkYXRlTW9kZWwgPSBmdW5jdGlvbiB2YWxpZGF0ZU1vZGVsIChhcGlET3JTTywgbW9kZWxJZE9yUGF0aCwgZGF0YSkge1xuICB2YXIgbW9kZWxTY2hlbWEgPSB0aGlzLmNvbXBvc2VNb2RlbChhcGlET3JTTywgbW9kZWxJZE9yUGF0aCk7XG4gIHZhciByZXN1bHQ7XG4gIHZhciB2YWxpZGF0b3I7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxTY2hlbWEpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gY29tcG9zZSBtb2RlbCBzbyB2YWxpZGF0aW9uIGlzIG5vdCBwb3NzaWJsZScpO1xuICB9XG5cbiAgdmFsaWRhdG9yID0gY3JlYXRlVmFsaWRhdG9yKHRoaXMpO1xuICByZXN1bHQgPSB2YWxpZGF0b3IudmFsaWRhdGUobW9kZWxTY2hlbWEsIGRhdGEpO1xuXG4gIGlmIChyZXN1bHQpIHtcbiAgICByZXN1bHQgPSB7XG4gICAgICBlcnJvcnM6IHZhbGlkYXRvci5qZShtb2RlbFNjaGVtYSwgZGF0YSwgcmVzdWx0LCBqanZlT3B0aW9ucylcbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy52MSA9IG1vZHVsZS5leHBvcnRzLnYxXzIgPSBuZXcgU3BlY2lmaWNhdGlvbignMS4yJyk7IC8vIGpzaGludCBpZ25vcmU6bGluZVxubW9kdWxlLmV4cG9ydHMudjIgPSBtb2R1bGUuZXhwb3J0cy52Ml8wID0gbmV3IFNwZWNpZmljYXRpb24oJzIuMCcpOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBBcGlnZWUgQ29ycG9yYXRpb25cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIF8gPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdy5fIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbC5fIDogbnVsbCk7XG52YXIgc3BlY0NhY2hlID0ge307XG5cbi8qKlxuICogUmV0dXJucyB0aGUgcHJvcGVyIHNwZWNpZmljYXRpb24gYmFzZWQgb24gdGhlIGh1bWFuIHJlYWRhYmxlIHZlcnNpb24uXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHZlcnNpb24gLSBUaGUgaHVtYW4gcmVhZGFibGUgU3dhZ2dlciB2ZXJzaW9uIChFeDogMS4yKVxuICpcbiAqIEByZXR1cm5zIHRoZSBjb3JyZXNwb25kaW5nIFN3YWdnZXIgU3BlY2lmaWNhdGlvbiBvYmplY3Qgb3IgdW5kZWZpbmVkIGlmIHRoZXJlIGlzIG5vbmVcbiAqL1xubW9kdWxlLmV4cG9ydHMuZ2V0U3BlYyA9IGZ1bmN0aW9uIGdldFNwZWMgKHZlcnNpb24pIHtcbiAgdmFyIHNwZWMgPSBzcGVjQ2FjaGVbdmVyc2lvbl07XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoc3BlYykpIHtcbiAgICBzd2l0Y2ggKHZlcnNpb24pIHtcbiAgICBjYXNlICcxLjInOlxuICAgICAgc3BlYyA9IHJlcXVpcmUoJy4uL2xpYi9zcGVjcycpLnYxXzI7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuXG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJzIuMCc6XG4gICAgICBzcGVjID0gcmVxdWlyZSgnLi4vbGliL3NwZWNzJykudjJfMDsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG5cbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzcGVjO1xufTtcblxuLyoqXG4gKiBUYWtlcyBhIHJlZmVyZW5jZSBhbmQgY3JlYXRlcyBhIGZ1bGx5IHF1YWxpZmllZCBKU09OIHBvaW50ZXIgZnJvbSBpdC4gICgyLjAgb25seSlcbiAqXG4gKiBJZiB0aGUgcGFzc2VkIGluIHJlZmVyZW5jZSBpcyBmdWxseSBxdWFsaWZpZWQsIGl0IGlzIHJldHVybmVkIGFzLWlzLiAgT3RoZXJ3aXNlLCB0aGUgcmVmZXJlbmNlIHdpbGwgaGF2ZVxuICogJyMvZGVmaW5pdGlvbnMvJyBwcmVwZW5kZWQgdG8gaXQgdG8gbWFrZSBpdCBmdWxseSBxdWFsaWZpZWQgc2luY2UgdGhlc2UgJ3JlbGF0aXZlJyByZWZlcmVuY2VzIGFyZSBvbmx5IGFsbG93ZWQgZm9yXG4gKiBtb2RlbCBkZWZpbml0aW9ucy5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gcmVmIC0gVGhlIHJlbGF0aXZlIG9yIGZ1bGx5IHF1YWxpZmllZCByZWZlcmVuY2VcbiAqXG4gKiBAcmV0dXJucyB0aGUgY29ycmVzcG9uZGluZyBKU09OIHBvaW50ZXIgZm9yIHRoZSByZWZlcmVuY2VcbiAqL1xubW9kdWxlLmV4cG9ydHMucmVmVG9Kc29uUG9pbnRlciA9IGZ1bmN0aW9uIHJlZlRvSnNvblBvaW50ZXIgKHJlZikge1xuICAvLyBUT0RPOiBGaXggdGhpcyB0byBoYW5kbGUgcmVtb3RlIHJlZmVyZW5jZXNcblxuICBpZiAocmVmLmNoYXJBdCgwKSAhPT0gJyMnKSB7XG4gICAgcmVmID0gJyMvZGVmaW5pdGlvbnMvJyArIHJlZjtcbiAgfVxuXG4gIHJldHVybiByZWY7XG59O1xuXG4vKipcbiAqIFRha2VzIGFuIGFycmF5IG9mIHBhdGggc2VnbWVudHMgYW5kIGNyZWF0ZXMgYSBKU09OIHBvaW50ZXIgZnJvbSBpdC4gKDIuMCBvbmx5KVxuICpcbiAqIEBwYXJhbSB7c3RyaW5nW119IHBhdGggLSBUaGUgcGF0aCBzZWdtZW50c1xuICpcbiAqIEByZXR1cm5zIGEgSlNPTiBwb2ludGVyIGZvciB0aGUgcmVmZXJlbmNlIGRlbm90ZWQgYnkgdGhlIHBhdGggc2VnbWVudHNcbiAqL1xubW9kdWxlLmV4cG9ydHMudG9Kc29uUG9pbnRlciA9IGZ1bmN0aW9uIHRvSnNvblBvaW50ZXIgKHBhdGgpIHtcbiAgLy8gaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNjkwMSNzZWN0aW9uLTRcbiAgcmV0dXJuICcjLycgKyBwYXRoLm1hcChmdW5jdGlvbiAocGFydCkge1xuICAgIHJldHVybiBwYXJ0LnJlcGxhY2UoL34vZywgJ34wJykucmVwbGFjZSgvXFwvL2csICd+MScpO1xuICB9KS5qb2luKCcvJyk7XG59O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbCA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0IEFwaWdlZSBDb3Jwb3JhdGlvblxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuICogYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG4gKiBUSEUgU09GVFdBUkUuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Ll8gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsLl8gOiBudWxsKTtcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG5cbi8vIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzMzMzkjc2VjdGlvbi01LjZcbnZhciBkYXRlUmVnRXhwID0gL14oWzAtOV17NH0pLShbMC05XXsyfSktKFswLTldezJ9KSQvO1xuLy8gaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzMzOSNzZWN0aW9uLTUuNlxudmFyIGRhdGVUaW1lUmVnRXhwID0gL14oWzAtOV17Mn0pOihbMC05XXsyfSk6KFswLTldezJ9KSguWzAtOV0rKT8oenwoWystXVswLTldezJ9OlswLTldezJ9KSkkLztcbnZhciB0aHJvd0ludmFsaWRQYXJhbWV0ZXIgPSBmdW5jdGlvbiB0aHJvd0ludmFsaWRQYXJhbWV0ZXIgKG5hbWUsIG1lc3NhZ2UpIHtcbiAgdmFyIGVyciA9IG5ldyBFcnJvcignUGFyYW1ldGVyICgnICsgbmFtZSArICcpICcgKyBtZXNzYWdlKTtcblxuICBlcnIuZmFpbGVkVmFsaWRhdGlvbiA9IHRydWU7XG5cbiAgdGhyb3cgZXJyO1xufTtcbnZhciBpc1ZhbGlkRGF0ZSA9IGZ1bmN0aW9uIGlzVmFsaWREYXRlIChkYXRlKSB7XG4gIHZhciBkYXk7XG4gIHZhciBtYXRjaGVzO1xuICB2YXIgbW9udGg7XG5cbiAgaWYgKCFfLmlzU3RyaW5nKGRhdGUpKSB7XG4gICAgZGF0ZSA9IGRhdGUudG9TdHJpbmcoKTtcbiAgfVxuXG4gIG1hdGNoZXMgPSBkYXRlUmVnRXhwLmV4ZWMoZGF0ZSk7XG5cbiAgaWYgKG1hdGNoZXMgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGRheSA9IG1hdGNoZXNbM107XG4gIG1vbnRoID0gbWF0Y2hlc1syXTtcblxuICBpZiAobW9udGggPCAnMDEnIHx8IG1vbnRoID4gJzEyJyB8fCBkYXkgPCAnMDEnIHx8IGRheSA+ICczMScpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG52YXIgaXNWYWxpZERhdGVUaW1lID0gZnVuY3Rpb24gaXNWYWxpZERhdGVUaW1lIChkYXRlVGltZSkge1xuICB2YXIgaG91cjtcbiAgdmFyIGRhdGU7XG4gIHZhciB0aW1lO1xuICB2YXIgbWF0Y2hlcztcbiAgdmFyIG1pbnV0ZTtcbiAgdmFyIHBhcnRzO1xuICB2YXIgc2Vjb25kO1xuXG4gIGlmICghXy5pc1N0cmluZyhkYXRlVGltZSkpIHtcbiAgICBkYXRlVGltZSA9IGRhdGVUaW1lLnRvU3RyaW5nKCk7XG4gIH1cblxuICBwYXJ0cyA9IGRhdGVUaW1lLnRvTG93ZXJDYXNlKCkuc3BsaXQoJ3QnKTtcbiAgZGF0ZSA9IHBhcnRzWzBdO1xuICB0aW1lID0gcGFydHMubGVuZ3RoID4gMSA/IHBhcnRzWzFdIDogdW5kZWZpbmVkO1xuXG4gIGlmICghaXNWYWxpZERhdGUoZGF0ZSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIG1hdGNoZXMgPSBkYXRlVGltZVJlZ0V4cC5leGVjKHRpbWUpO1xuXG4gIGlmIChtYXRjaGVzID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBob3VyID0gbWF0Y2hlc1sxXTtcbiAgbWludXRlID0gbWF0Y2hlc1syXTtcbiAgc2Vjb25kID0gbWF0Y2hlc1szXTtcblxuICBpZiAoaG91ciA+ICcyMycgfHwgbWludXRlID4gJzU5JyB8fCBzZWNvbmQgPiAnNTknKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCdzIGNvbnRlbnQgdHlwZSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nW119IGdDb25zdW1lcyAtIFRoZSB2YWxpZCBjb25zdW1lcyBhdCB0aGUgQVBJIHNjb3BlXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBvQ29uc3VtZXMgLSBUaGUgdmFsaWQgY29uc3VtZXMgYXQgdGhlIG9wZXJhdGlvbiBzY29wZVxuICogQHBhcmFtIHtvYmplY3R9IHJlcSAtIFRoZSByZXF1ZXN0XG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgY29udGVudCB0eXBlIGlzIGludmFsaWRcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVDb250ZW50VHlwZSA9IGZ1bmN0aW9uIHZhbGlkYXRlQ29udGVudFR5cGUgKGdDb25zdW1lcywgb0NvbnN1bWVzLCByZXEpIHtcbiAgLy8gaHR0cDovL3d3dy53My5vcmcvUHJvdG9jb2xzL3JmYzI2MTYvcmZjMjYxNi1zZWM3Lmh0bWwjc2VjNy4yLjFcbiAgdmFyIGNvbnRlbnRUeXBlID0gcmVxLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddIHx8ICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nO1xuICB2YXIgY29uc3VtZXMgPSBfLnVuaW9uKG9Db25zdW1lcywgZ0NvbnN1bWVzKTtcblxuICAvLyBHZXQgb25seSB0aGUgY29udGVudCB0eXBlXG4gIGNvbnRlbnRUeXBlID0gY29udGVudFR5cGUuc3BsaXQoJzsnKVswXTtcblxuICAvLyBWYWxpZGF0ZSBjb250ZW50IHR5cGUgKE9ubHkgZm9yIFBPU1QvUFVUIHBlciBIVFRQIHNwZWMpXG4gIGlmIChjb25zdW1lcy5sZW5ndGggPiAwICYmIFsnUE9TVCcsICdQVVQnXS5pbmRleE9mKHJlcS5tZXRob2QpICE9PSAtMSAmJiBjb25zdW1lcy5pbmRleE9mKGNvbnRlbnRUeXBlKSA9PT0gLTEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29udGVudCB0eXBlICgnICsgY29udGVudFR5cGUgKyAnKS4gIFRoZXNlIGFyZSB2YWxpZDogJyArIGNvbnN1bWVzLmpvaW4oJywgJykpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyB2YWx1ZSBhZ2FpbnN0IHRoZSBhbGxvd2FibGUgdmFsdWVzICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmdbXX0gYWxsb3dlZCAtIFRoZSBhbGxvd2FibGUgdmFsdWVzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbm90IGFsbG93YWJsZVxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUVudW0gPSBmdW5jdGlvbiB2YWxpZGF0ZUVudW0gKG5hbWUsIHZhbCwgYWxsb3dlZCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoYWxsb3dlZCkgJiYgIV8uaXNVbmRlZmluZWQodmFsKSAmJiBhbGxvd2VkLmluZGV4T2YodmFsKSA9PT0gLTEpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIG5vdCBhbiBhbGxvd2FibGUgdmFsdWUgKCcgKyBhbGxvd2VkLmpvaW4oJywgJykgKyAnKTogJyArIHZhbCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIHZhbHVlIGlzIGxlc3MgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSBtYXhpbXVtIC0gVGhlIG1heGltdW0gdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2V4Y2x1c2l2ZT1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0aGUgdmFsdWUgaW5jbHVkZXMgdGhlIG1heGltdW0gaW4gaXRzIGNvbXBhcmlzb25cbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBncmVhdGVyIHRoYW4gdGhlIG1heGltdW1cbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhpbXVtID0gZnVuY3Rpb24gdmFsaWRhdGVNYXhpbXVtIChuYW1lLCB2YWwsIG1heGltdW0sIHR5cGUsIGV4Y2x1c2l2ZSkge1xuICB2YXIgdGVzdE1heDtcbiAgdmFyIHRlc3RWYWw7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZXhjbHVzaXZlKSkge1xuICAgIGV4Y2x1c2l2ZSA9IGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGUgPT09ICdpbnRlZ2VyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUludCh2YWwsIDEwKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUZsb2F0KHZhbCk7XG4gIH1cblxuICBpZiAoIV8uaXNVbmRlZmluZWQobWF4aW11bSkpIHtcbiAgICB0ZXN0TWF4ID0gcGFyc2VGbG9hdChtYXhpbXVtKTtcblxuICAgIGlmIChleGNsdXNpdmUgJiYgdGVzdFZhbCA+PSB0ZXN0TWF4KSB7XG4gICAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byB0aGUgY29uZmlndXJlZCBtYXhpbXVtICgnICsgbWF4aW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9IGVsc2UgaWYgKHRlc3RWYWwgPiB0ZXN0TWF4KSB7XG4gICAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIGdyZWF0ZXIgdGhhbiB0aGUgY29uZmlndXJlZCBtYXhpbXVtICgnICsgbWF4aW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIGFycmF5IGNvdW50IGlzIGxlc3MgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1heEl0ZW1zIC0gVGhlIG1heGltdW0gbnVtYmVyIG9mIGl0ZW1zXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgY29udGFpbnMgbW9yZSBpdGVtcyB0aGFuIGFsbG93YWJsZVxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1heEl0ZW1zID0gZnVuY3Rpb24gdmFsaWRhdGVNYXhJdGVtcyAobmFtZSwgdmFsLCBtYXhJdGVtcykge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobWF4SXRlbXMpICYmIHZhbC5sZW5ndGggPiBtYXhJdGVtcykge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnY29udGFpbnMgbW9yZSBpdGVtcyB0aGFuIGFsbG93ZWQ6ICcgKyBtYXhJdGVtcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIGxlbmd0aCBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhMZW5ndGggLSBUaGUgbWF4aW11bSBsZW5ndGhcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSdzIGxlbmd0aCBpcyBncmVhdGVyIHRoYW4gdGhlIG1heGltdW1cbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhMZW5ndGggPSBmdW5jdGlvbiB2YWxpZGF0ZU1heExlbmd0aCAobmFtZSwgdmFsLCBtYXhMZW5ndGgpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heExlbmd0aCkgJiYgdmFsLmxlbmd0aCA+IG1heExlbmd0aCkge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnaXMgbG9uZ2VyIHRoYW4gYWxsb3dlZDogJyArIG1heExlbmd0aCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIGFycmF5IGNvdW50IGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWluaW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSBtaW5pbXVtIC0gVGhlIG1pbmltdW0gdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW2V4Y2x1c2l2ZT1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0aGUgdmFsdWUgaW5jbHVkZXMgdGhlIG1pbmltdW0gaW4gaXRzIGNvbXBhcmlzb25cbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW1cbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5pbXVtID0gZnVuY3Rpb24gdmFsaWRhdGVNaW5pbXVtIChuYW1lLCB2YWwsIG1pbmltdW0sIHR5cGUsIGV4Y2x1c2l2ZSkge1xuICB2YXIgdGVzdE1pbjtcbiAgdmFyIHRlc3RWYWw7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZXhjbHVzaXZlKSkge1xuICAgIGV4Y2x1c2l2ZSA9IGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGUgPT09ICdpbnRlZ2VyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUludCh2YWwsIDEwKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUZsb2F0KHZhbCk7XG4gIH1cblxuICBpZiAoIV8uaXNVbmRlZmluZWQobWluaW11bSkpIHtcbiAgICB0ZXN0TWluID0gcGFyc2VGbG9hdChtaW5pbXVtKTtcblxuICAgIGlmIChleGNsdXNpdmUgJiYgdGVzdFZhbCA8PSB0ZXN0TWluKSB7XG4gICAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIGxlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgY29uZmlndXJlZCBtaW5pbXVtICgnICsgbWluaW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9IGVsc2UgaWYgKHRlc3RWYWwgPCB0ZXN0TWluKSB7XG4gICAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2lzIGxlc3MgdGhhbiB0aGUgY29uZmlndXJlZCBtaW5pbXVtICgnICsgbWluaW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIHZhbHVlIGNvbnRhaW5zIGZld2VyIGl0ZW1zIHRoYW4gYWxsb3dlZCAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pbkl0ZW1zIC0gVGhlIG1pbmltdW0gbnVtYmVyIG9mIGl0ZW1zXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgY29udGFpbnMgZmV3ZXIgaXRlbXMgdGhhbiBhbGxvd2FibGVcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNaW5JdGVtcyA9IGZ1bmN0aW9uIHZhbGlkYXRlTWluSXRlbXMgKG5hbWUsIHZhbCwgbWluSXRlbXMpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbkl0ZW1zKSAmJiB2YWwubGVuZ3RoIDwgbWluSXRlbXMpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2NvbnRhaW5zIGZld2VyIGl0ZW1zIHRoYW4gYWxsb3dlZDogJyArIG1pbkl0ZW1zKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyJ3MgbGVuZ3RoIGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWluaW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pbkxlbmd0aCAtIFRoZSBtaW5pbXVtIGxlbmd0aFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlJ3MgbGVuZ3RoIGlzIGxlc3MgdGhhbiB0aGUgbWluaW11bVxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbkxlbmd0aCA9IGZ1bmN0aW9uIHZhbGlkYXRlTWluTGVuZ3RoIChuYW1lLCB2YWwsIG1pbkxlbmd0aCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobWluTGVuZ3RoKSAmJiB2YWwubGVuZ3RoIDwgbWluTGVuZ3RoKSB7XG4gICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBzaG9ydGVyIHRoYW4gYWxsb3dlZDogJyArIG1pbkxlbmd0aCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWR0ZXMgdGhlIHJlcXVlc3QgcGFyYW1ldGVyIGFnYWluc3QgaXRzIG1vZGVsIHNjaGVtYS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHtvYmplY3R9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSB2ZXJzaW9uIC0gVGhlIFN3YWdnZXIgdmVyc2lvblxuICogQHBhcmFtIHtvYmplY3R9IGFwaURPclNPIC0gVGhlIFN3YWdnZXIgQVBJIERlY2xhcmF0aW9uICgxLjIpIG9yIFN3YWdnZXIgT2JqZWN0ICgyLjApXG4gKiBAcGFyYW0ge3N0cmluZ30gbW9kZWxJZE9yUGF0aCAtIFRoZSBtb2RlbCBpZCBvciBwYXRoXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbm90IGEgdmFsaWQgbW9kZWxcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNb2RlbCA9IGZ1bmN0aW9uIHZhbGlkYXRlTW9kZWwgKG5hbWUsIHZhbCwgdmVyc2lvbiwgYXBpRE9yU08sIG1vZGVsSWRPclBhdGgpIHtcbiAgdmFyIHNwZWMgPSBoZWxwZXJzLmdldFNwZWModmVyc2lvbik7XG4gIHZhciB2YWxpZGF0ZSA9IGZ1bmN0aW9uIHZhbGlkYXRlIChkYXRhKSB7XG4gICAgdmFyIHJlc3VsdCA9IHNwZWMudmFsaWRhdGVNb2RlbChhcGlET3JTTywgbW9kZWxJZE9yUGF0aCwgZGF0YSk7XG5cbiAgICBpZiAoIV8uaXNVbmRlZmluZWQocmVzdWx0KSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyBub3QgYSB2YWxpZCAnICsgbW9kZWxJZE9yUGF0aCArICcgbW9kZWwnKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBlcnIuZXJyb3JzID0gcmVzdWx0LmVycm9ycztcblxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGlmIChfLmlzQXJyYXkodmFsKSkge1xuICAgIF8uZWFjaCh2YWwsIGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICB2YWxpZGF0ZShpdGVtKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICB2YWxpZGF0ZSh2YWwpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyBtYXRjaGVzIGEgcGF0dGVybiAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gVGhlIHBhcmFtZXRlciBuYW1lXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSBwYXR0ZXJuIC0gVGhlIHBhdHRlcm5cbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBkb2VzIG5vdCBtYXRjaCB0aGUgcGF0dGVyblxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVBhdHRlcm4gPSBmdW5jdGlvbiB2YWxpZGF0ZVBhdHRlcm4gKG5hbWUsIHZhbCwgcGF0dGVybikge1xuICBpZiAoIV8uaXNVbmRlZmluZWQocGF0dGVybikgJiYgXy5pc051bGwodmFsLm1hdGNoKG5ldyBSZWdFeHAocGF0dGVybikpKSkge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnZG9lcyBub3QgbWF0Y2ggcmVxdWlyZWQgcGF0dGVybjogJyArIHBhdHRlcm4pO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyByZXF1aXJlZG5lc3MgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IHJlcXVpcmVkIC0gV2hldGhlciBvciBub3QgdGhlIHBhcmFtZXRlciBpcyByZXF1aXJlZFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIHJlcXVpcmVkIGJ1dCBpcyBub3QgcHJlc2VudFxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVJlcXVpcmVkbmVzcyA9IGZ1bmN0aW9uIHZhbGlkYXRlUmVxdWlyZWRuZXNzIChuYW1lLCB2YWwsIHJlcXVpcmVkKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChyZXF1aXJlZCkgJiYgcmVxdWlyZWQgPT09IHRydWUgJiYgXy5pc1VuZGVmaW5lZCh2YWwpKSB7XG4gICAgdGhyb3dJbnZhbGlkUGFyYW1ldGVyKG5hbWUsICdpcyByZXF1aXJlZCcpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgcmVxdWVzdCBwYXJhbWV0ZXIncyB0eXBlIGFuZCBmb3JtYXQgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gdHlwZSAtIFRoZSBwYXJhbWV0ZXIgdHlwZVxuICogQHBhcmFtIHtzdHJpbmd9IGZvcm1hdCAtIFRoZSBwYXJhbWV0ZXIgZm9ybWF0XG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtza2lwRXJyb3I9ZmFsc2VdIC0gV2hldGhlciBvciBub3QgdG8gc2tpcCB0aHJvd2luZyBhbiBlcnJvciAoVXNlZnVsIGZvciB2YWxpZGF0aW5nIGFycmF5cylcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBpcyBub3QgdGhlIHByb3BlciB0eXBlIG9yIGZvcm1hdFxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVR5cGVBbmRGb3JtYXQgPSBmdW5jdGlvbiB2YWxpZGF0ZVR5cGVBbmRGb3JtYXQgKG5hbWUsIHZhbCwgdHlwZSwgZm9ybWF0LCBza2lwRXJyb3IpIHtcbiAgdmFyIHJlc3VsdCA9IHRydWU7XG5cbiAgaWYgKF8uaXNBcnJheSh2YWwpKSB7XG4gICAgXy5lYWNoKHZhbCwgZnVuY3Rpb24gKGFWYWwsIGluZGV4KSB7XG4gICAgICBpZiAoIXZhbGlkYXRlVHlwZUFuZEZvcm1hdChuYW1lLCBhVmFsLCB0eXBlLCBmb3JtYXQsIHRydWUpKSB7XG4gICAgICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnYXQgaW5kZXggJyArIGluZGV4ICsgJyBpcyBub3QgYSB2YWxpZCAnICsgdHlwZSArICc6ICcgKyBhVmFsKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJlc3VsdCA9IF8uaXNCb29sZWFuKHZhbCkgfHwgWydmYWxzZScsICd0cnVlJ10uaW5kZXhPZih2YWwpICE9PSAtMTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ2ludGVnZXInOlxuICAgICAgcmVzdWx0ID0gIV8uaXNOYU4ocGFyc2VJbnQodmFsLCAxMCkpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJlc3VsdCA9ICFfLmlzTmFOKHBhcnNlRmxvYXQodmFsKSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKGZvcm1hdCkpIHtcbiAgICAgICAgc3dpdGNoIChmb3JtYXQpIHtcbiAgICAgICAgY2FzZSAnZGF0ZSc6XG4gICAgICAgICAgcmVzdWx0ID0gaXNWYWxpZERhdGUodmFsKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnZGF0ZS10aW1lJzpcbiAgICAgICAgICByZXN1bHQgPSBpc1ZhbGlkRGF0ZVRpbWUodmFsKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgaWYgKHNraXBFcnJvcikge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH0gZWxzZSBpZiAoIXJlc3VsdCkge1xuICAgIHRocm93SW52YWxpZFBhcmFtZXRlcihuYW1lLCAnaXMgbm90IGEgdmFsaWQgJyArIChfLmlzVW5kZWZpbmVkKGZvcm1hdCkgPyAnJyA6IGZvcm1hdCArICcgJykgKyB0eXBlICsgJzogJyArIHZhbCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSByZXF1ZXN0IHBhcmFtZXRlcidzIHZhbHVlcyBhcmUgdW5pcXVlICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgLSBUaGUgcGFyYW1ldGVyIG5hbWVcbiAqIEBwYXJhbSB7c3RyaW5nW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNVbmlxdWUgLSBXaGV0aGVyIG9yIG5vdCB0aGUgcGFyYW1ldGVyIHZhbHVlcyBhcmUgdW5pcXVlXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaGFzIGR1cGxpY2F0ZXNcbiAqL1xubW9kdWxlLmV4cG9ydHMudmFsaWRhdGVVbmlxdWVJdGVtcyA9IGZ1bmN0aW9uIHZhbGlkYXRlVW5pcXVlSXRlbXMgKG5hbWUsIHZhbCwgaXNVbmlxdWUpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKGlzVW5pcXVlKSAmJiBfLnVuaXEodmFsKS5sZW5ndGggIT09IHZhbC5sZW5ndGgpIHtcbiAgICB0aHJvd0ludmFsaWRQYXJhbWV0ZXIobmFtZSwgJ2RvZXMgbm90IGFsbG93IGR1cGxpY2F0ZSB2YWx1ZXM6ICcgKyB2YWwuam9pbignLCAnKSk7XG4gIH1cbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbigpIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGZ1bmN0aW9uIG1ha2Uobykge1xuICAgIHZhciBlcnJvcnMgPSBbXTtcblxuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMoby52YWxpZGF0aW9uKTtcblxuICAgIC8vIHdoZW4gd2UncmUgb24gYSBsZWFmIG5vZGUgd2UgbmVlZCB0byBoYW5kbGUgdGhlIHZhbGlkYXRpb24gZXJyb3JzLFxuICAgIC8vIG90aGVyd2lzZSB3ZSBjb250aW51ZSB3YWxraW5nXG4gICAgdmFyIGxlYWYgPSBrZXlzLmV2ZXJ5KGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIHR5cGVvZiBvLnZhbGlkYXRpb25ba2V5XSAhPT0gJ29iamVjdCcgfHxcbiAgICAgICAgaXNBcnJheShvLnZhbGlkYXRpb25ba2V5XSk7XG4gICAgfSk7XG5cbiAgICBpZiAobGVhZikge1xuICAgICAgLy8gc3RlcCB0aHJvdWdoIGVhY2ggdmFsaWRhdGlvbiBpc3N1ZVxuICAgICAgLy8gZXhhbXBsZTogeyByZXF1aXJlZDogdHJ1ZSB9XG4gICAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHZhciBlcnJvciwgcHJvcGVydGllcztcblxuICAgICAgICB0cnkge1xuICAgICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgICBjYXNlICd0eXBlJzpcbiAgICAgICAgICAgICAgdmFyIHR5cGUgPSB0eXBlb2Ygby5kYXRhO1xuXG4gICAgICAgICAgICAgIC8vIGZ1cnRoZXIgZGlzY292ZXIgdHlwZXNcbiAgICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICgnJyArIG8uZGF0YSkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdpbnRlZ2VyJztcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0JyAmJiBBcnJheS5pc0FycmF5KG8uZGF0YSkpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gJ2FycmF5JztcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIC8vIHRoZSB2YWx1ZSBvZiB0eXBlIGlzIHRoZSByZXF1aXJlZCB0eXBlIChleDogeyB0eXBlOiAnc3RyaW5nJyB9KVxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnSU5WQUxJRF9UWVBFJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnSW52YWxpZCB0eXBlOiAnICsgdHlwZSArICcgc2hvdWxkIGJlICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIChpc0FycmF5KG8udmFsaWRhdGlvbltrZXldKSA/ICAnb25lIG9mICcgOiAgJycpICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgby52YWxpZGF0aW9uW2tleV1cbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3JlcXVpcmVkJzpcbiAgICAgICAgICAgICAgcHJvcGVydGllcyA9IG8ubnM7XG5cbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ09CSkVDVF9SRVFVSVJFRCcsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ01pc3NpbmcgcmVxdWlyZWQgcHJvcGVydHk6ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXNbcHJvcGVydGllcy5sZW5ndGggLSAxXVxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWluaW11bSc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdNSU5JTVVNJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnVmFsdWUgJyArIG8uZGF0YSArICcgaXMgbGVzcyB0aGFuIG1pbmltdW0gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgby5zY2hlbWEubWluaW11bVxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWF4aW11bSc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdNQVhJTVVNJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnVmFsdWUgJyArIG8uZGF0YSArICcgaXMgZ3JlYXRlciB0aGFuIG1heGltdW0gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgby5zY2hlbWEubWF4aW11bVxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbXVsdGlwbGVPZic6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdNVUxUSVBMRV9PRicsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1ZhbHVlICcgKyBvLmRhdGEgKyAnIGlzIG5vdCBhIG11bHRpcGxlIG9mICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm11bHRpcGxlT2ZcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3BhdHRlcm4nOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnUEFUVEVSTicsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1N0cmluZyBkb2VzIG5vdCBtYXRjaCBwYXR0ZXJuOiAnICsgby5zY2hlbWEucGF0dGVyblxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWluTGVuZ3RoJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ01JTl9MRU5HVEgnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdTdHJpbmcgaXMgdG9vIHNob3J0ICgnICsgby5kYXRhLmxlbmd0aCArICcgY2hhcnMpLCAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAnbWluaW11bSAnICsgby5zY2hlbWEubWluTGVuZ3RoXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdtYXhMZW5ndGgnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnTUFYX0xFTkdUSCcsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ1N0cmluZyBpcyB0b28gbG9uZyAoJyArIG8uZGF0YS5sZW5ndGggKyAnIGNoYXJzKSwgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ21heGltdW0gJyArIG8uc2NoZW1hLm1heExlbmd0aFxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWluSXRlbXMnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnQVJSQVlfTEVOR1RIX1NIT1JUJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXJyYXkgaXMgdG9vIHNob3J0ICgnICsgby5kYXRhLmxlbmd0aCArICcpLCAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAnbWluaW11bSAnICsgby5zY2hlbWEubWluSXRlbXNcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ21heEl0ZW1zJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ0FSUkFZX0xFTkdUSF9MT05HJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnQXJyYXkgaXMgdG9vIGxvbmcgKCcgKyBvLmRhdGEubGVuZ3RoICsgJyksIG1heGltdW0gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgby5zY2hlbWEubWF4SXRlbXNcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3VuaXF1ZUl0ZW1zJzpcbiAgICAgICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICAgICAgY29kZTogJ0FSUkFZX1VOSVFVRScsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0FycmF5IGl0ZW1zIGFyZSBub3QgdW5pcXVlJ1xuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWluUHJvcGVydGllcyc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdPQkpFQ1RfUFJPUEVSVElFU19NSU5JTVVNJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnVG9vIGZldyBwcm9wZXJ0aWVzIGRlZmluZWQgKCcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKG8uZGF0YSkubGVuZ3RoICsgJyksIG1pbmltdW0gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgby5zY2hlbWEubWluUHJvcGVydGllc1xuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnbWF4UHJvcGVydGllcyc6XG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdPQkpFQ1RfUFJPUEVSVElFU19NQVhJTVVNJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiAnVG9vIG1hbnkgcHJvcGVydGllcyBkZWZpbmVkICgnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyhvLmRhdGEpLmxlbmd0aCArICcpLCBtYXhpbXVtICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIG8uc2NoZW1hLm1heFByb3BlcnRpZXNcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2VudW0nOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnRU5VTV9NSVNNQVRDSCcsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ05vIGVudW0gbWF0Y2ggKCcgKyBvLmRhdGEgKyAnKSwgZXhwZWN0czogJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgby5zY2hlbWFbJ2VudW0nXS5qb2luKCcsICcpXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdub3QnOlxuICAgICAgICAgICAgICBlcnJvciA9IHtcbiAgICAgICAgICAgICAgICBjb2RlOiAnTk9UX1BBU1NFRCcsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogJ0RhdGEgbWF0Y2hlcyBzY2hlbWEgZnJvbSBcIm5vdFwiJ1xuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnYWRkaXRpb25hbCc6XG4gICAgICAgICAgICAgIHByb3BlcnRpZXMgPSBvLm5zO1xuXG4gICAgICAgICAgICAgIGVycm9yID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6ICdBRERJVElPTkFMX1BST1BFUlRJRVMnLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdBZGRpdGlvbmFsIHByb3BlcnRpZXMgbm90IGFsbG93ZWQ6ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXNbcHJvcGVydGllcy5sZW5ndGggLSAxXVxuICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgLy8gaWdub3JlIGVycm9yc1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdW5oYW5kbGVkIGVycm9yc1xuICAgICAgICBpZiAoIWVycm9yKSB7XG4gICAgICAgICAgZXJyb3IgPSB7XG4gICAgICAgICAgICBjb2RlOiAnRkFJTEVEJyxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdWYWxpZGF0aW9uIGVycm9yOiAnICsga2V5XG4gICAgICAgICAgfTtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG8udmFsaWRhdGlvbltrZXldICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgICAgZXJyb3IubWVzc2FnZSA9ICcgKCcgKyBvLnZhbGlkYXRpb25ba2V5XSArICcpJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIC8vIGlnbm9yZSBlcnJvcnNcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBlcnJvci5jb2RlID0gJ1ZBTElEQVRJT05fJyArIGVycm9yLmNvZGU7XG4gICAgICAgIGlmIChvLmRhdGEgIT09IHVuZGVmaW5lZCkgZXJyb3IuZGF0YSA9IG8uZGF0YTtcbiAgICAgICAgZXJyb3IucGF0aCA9IG8ubnM7XG4gICAgICAgIGVycm9ycy5wdXNoKGVycm9yKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBoYW5kbGUgYWxsIG5vbi1sZWFmIGNoaWxkcmVuXG4gICAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHZhciBzO1xuXG4gICAgICAgIGlmIChvLnNjaGVtYS4kcmVmKSB7XG4gICAgICAgICAgaWYgKG8uc2NoZW1hLiRyZWYubWF0Y2goLyNcXC9kZWZpbml0aW9uc1xcLy8pKSB7XG4gICAgICAgICAgICBvLnNjaGVtYSA9IG8uZGVmaW5pdGlvbnNbby5zY2hlbWEuJHJlZi5zbGljZSgxNCldO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBvLnNjaGVtYSA9IG8uc2NoZW1hLiRyZWY7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHR5cGVvZiBvLnNjaGVtYSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIG8uc2NoZW1hID0gby5lbnYucmVzb2x2ZVJlZihudWxsLCBvLnNjaGVtYSk7XG4gICAgICAgICAgICBpZiAoby5zY2hlbWEpIG8uc2NoZW1hID0gby5zY2hlbWFbMF07XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG8uc2NoZW1hICYmIG8uc2NoZW1hLnR5cGUpIHtcbiAgICAgICAgICBpZiAoYWxsb3dzVHlwZShvLnNjaGVtYSwgJ29iamVjdCcpKSB7XG4gICAgICAgICAgICBpZiAoby5zY2hlbWEucHJvcGVydGllcyAmJiBvLnNjaGVtYS5wcm9wZXJ0aWVzW2tleV0pIHtcbiAgICAgICAgICAgICAgcyA9IG8uc2NoZW1hLnByb3BlcnRpZXNba2V5XTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFzICYmIG8uc2NoZW1hLnBhdHRlcm5Qcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKG8uc2NoZW1hLnBhdHRlcm5Qcm9wZXJ0aWVzKS5zb21lKGZ1bmN0aW9uKHBrZXkpIHtcbiAgICAgICAgICAgICAgICBpZiAoa2V5Lm1hdGNoKG5ldyBSZWdFeHAocGtleSkpKSB7XG4gICAgICAgICAgICAgICAgICBzID0gby5zY2hlbWEucGF0dGVyblByb3BlcnRpZXNbcGtleV07XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXMgJiYgby5zY2hlbWEuaGFzT3duUHJvcGVydHkoJ2FkZGl0aW9uYWxQcm9wZXJ0aWVzJykpIHtcbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiBvLnNjaGVtYS5hZGRpdGlvbmFsUHJvcGVydGllcyA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICAgICAgcyA9IHt9O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHMgPSBvLnNjaGVtYS5hZGRpdGlvbmFsUHJvcGVydGllcztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChhbGxvd3NUeXBlKG8uc2NoZW1hLCAnYXJyYXknKSkge1xuICAgICAgICAgICAgcyA9IG8uc2NoZW1hLml0ZW1zO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvcHRzID0ge1xuICAgICAgICAgIGVudjogby5lbnYsXG4gICAgICAgICAgc2NoZW1hOiBzIHx8IHt9LFxuICAgICAgICAgIG5zOiBvLm5zLmNvbmNhdChrZXkpXG4gICAgICAgIH07XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBvcHRzLmRhdGEgPSBvLmRhdGFba2V5XTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgLy8gaWdub3JlIGVycm9yc1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBvcHRzLnZhbGlkYXRpb24gPSBvLnZhbGlkYXRpb25ba2V5XS5zY2hlbWEgP1xuICAgICAgICAgICAgby52YWxpZGF0aW9uW2tleV0uc2NoZW1hIDpcbiAgICAgICAgICAgIG8udmFsaWRhdGlvbltrZXldO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBvcHRzLnZhbGlkYXRpb24gPSB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgb3B0cy5kZWZpbml0aW9ucyA9IHMuZGVmaW5pdGlvbnMgfHwgby5kZWZpbml0aW9ucztcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgb3B0cy5kZWZpbml0aW9ucyA9IG8uZGVmaW5pdGlvbnM7XG4gICAgICAgIH1cblxuICAgICAgICBlcnJvcnMgPSBlcnJvcnMuY29uY2F0KG1ha2Uob3B0cykpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGVycm9ycztcbiAgfVxuXG4gIGZ1bmN0aW9uIGFsbG93c1R5cGUoc2NoZW1hLCB0eXBlKSB7XG4gICAgaWYgKHR5cGVvZiBzY2hlbWEudHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBzY2hlbWEudHlwZSA9PT0gdHlwZTtcbiAgICB9XG4gICAgaWYgKGlzQXJyYXkoc2NoZW1hLnR5cGUpKSB7XG4gICAgICByZXR1cm4gc2NoZW1hLnR5cGUuaW5kZXhPZih0eXBlKSAhPT0gLTE7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGlzQXJyYXkob2JqKSB7XG4gICAgaWYgKHR5cGVvZiBBcnJheS5pc0FycmF5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm4gQXJyYXkuaXNBcnJheShvYmopO1xuICAgIH1cbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH1cblxuICBmdW5jdGlvbiBmb3JtYXRQYXRoKG9wdGlvbnMpIHtcbiAgICB2YXIgcm9vdCA9IG9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ3Jvb3QnKSA/XG4gICAgICBvcHRpb25zLnJvb3QgOiAnJCc7XG5cbiAgICB2YXIgc2VwID0gb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eSgnc2VwJykgP1xuICAgICAgb3B0aW9ucy5zZXAgOiAnLic7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAgIHZhciBwYXRoID0gcm9vdDtcblxuICAgICAgZXJyb3IucGF0aC5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICBwYXRoICs9IGtleS5tYXRjaCgvXlxcZCskLykgP1xuICAgICAgICAgICdbJyArIGtleSArICddJyA6XG4gICAgICAgICAga2V5Lm1hdGNoKC9eW0EtWl8kXVswLTlBLVpfJF0qJC9pKSA/XG4gICAgICAgICAgICAoc2VwICsga2V5KSA6XG4gICAgICAgICAgICAoJ1snICsgSlNPTi5zdHJpbmdpZnkoa2V5KSArICddJyk7XG4gICAgICB9KTtcblxuICAgICAgZXJyb3IucGF0aCA9IHBhdGg7XG5cbiAgICAgIHJldHVybiBlcnJvcjtcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gamp2ZShlbnYpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gamp2ZShzY2hlbWEsIGRhdGEsIHJlc3VsdCwgb3B0aW9ucykge1xuICAgICAgaWYgKCFyZXN1bHQgfHwgIXJlc3VsdC52YWxpZGF0aW9uKSByZXR1cm4gW107XG5cbiAgICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgICBpZiAodHlwZW9mIHNjaGVtYSA9PT0gJ3N0cmluZycpIHsgc2NoZW1hID0gZW52LnNjaGVtYVtzY2hlbWFdOyB9XG5cbiAgICAgIHZhciBlcnJvcnMgPSBtYWtlKHtcbiAgICAgICAgZW52OiBlbnYsXG4gICAgICAgIHNjaGVtYTogc2NoZW1hLFxuICAgICAgICBkYXRhOiBkYXRhLFxuICAgICAgICB2YWxpZGF0aW9uOiByZXN1bHQudmFsaWRhdGlvbixcbiAgICAgICAgbnM6IFtdLFxuICAgICAgICBkZWZpbml0aW9uczogc2NoZW1hLmRlZmluaXRpb25zIHx8IHt9XG4gICAgICB9KTtcblxuICAgICAgaWYgKGVycm9ycy5sZW5ndGggJiYgb3B0aW9ucy5mb3JtYXRQYXRoICE9PSBmYWxzZSkge1xuICAgICAgICByZXR1cm4gZXJyb3JzLm1hcChmb3JtYXRQYXRoKG9wdGlvbnMpKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGVycm9ycztcbiAgICB9O1xuICB9XG5cbiAgLy8gRXhwb3J0IGZvciB1c2UgaW4gc2VydmVyIGFuZCBjbGllbnQuXG4gIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBqanZlO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShmdW5jdGlvbigpIHsgcmV0dXJuIGpqdmU7IH0pO1xuICB9IGVsc2Uge1xuICAgIHRoaXMuamp2ZSA9IGpqdmU7XG4gIH1cbn0pLmNhbGwodGhpcyk7XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvYXBpRGVjbGFyYXRpb24uanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJzd2FnZ2VyVmVyc2lvblwiLCBcImJhc2VQYXRoXCIsIFwiYXBpc1wiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJzd2FnZ2VyVmVyc2lvblwiOiB7IFwiZW51bVwiOiBbIFwiMS4yXCIgXSB9LFxuICAgICAgICBcImFwaVZlcnNpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImJhc2VQYXRoXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIixcbiAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl5odHRwcz86Ly9cIlxuICAgICAgICB9LFxuICAgICAgICBcInJlc291cmNlUGF0aFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCIsXG4gICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeL1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXBpc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXBpT2JqZWN0XCIgfVxuICAgICAgICB9LFxuICAgICAgICBcIm1vZGVsc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIm1vZGVsc09iamVjdC5qc29uI1wiXG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvZHVjZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICBcImNvbnN1bWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZUFycmF5XCIgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7IFwiJHJlZlwiOiBcImF1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIiB9XG4gICAgfSxcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcImFwaU9iamVjdFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInBhdGhcIiwgXCJvcGVyYXRpb25zXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJwYXRoXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpLXRlbXBsYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl4vXCJcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwib3BlcmF0aW9uc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCJvcGVyYXRpb25PYmplY3QuanNvbiNcIiB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW1lVHlwZUFycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiBcIm1pbWUtdHlwZVwiXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvYXV0aG9yaXphdGlvbk9iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2Jhc2ljQXV0aFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXBpS2V5XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJiYXNpY0F1dGhcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYmFzaWNBdXRoXCIgXSB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImFwaUtleVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIsIFwicGFzc0FzXCIsIFwia2V5bmFtZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiYXBpS2V5XCIgXSB9LFxuICAgICAgICAgICAgICAgIFwicGFzc0FzXCI6IHsgXCJlbnVtXCI6IFsgXCJoZWFkZXJcIiwgXCJxdWVyeVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcImtleW5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm9hdXRoMlwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiwgXCJncmFudFR5cGVzXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJvYXV0aDJcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZVwiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZ3JhbnRUeXBlc1wiOiB7IFwiJHJlZlwiOiBcIm9hdXRoMkdyYW50VHlwZS5qc29uI1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwib2F1dGgyU2NvcGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJzY29wZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwic2NvcGVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufVxuXG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvZGF0YVR5cGUuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGF0YSB0eXBlIGFzIGRlc2NyaWJlZCBieSB0aGUgc3BlY2lmaWNhdGlvbiAodmVyc2lvbiAxLjIpXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJvbmVPZlwiOiBbXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZWZUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZvaWRUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZVR5cGVcIiB9LFxuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbW9kZWxUeXBlXCIgfSxcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FycmF5VHlwZVwiIH1cbiAgICBdLFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInJlZlR5cGVcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwidm9pZFR5cGVcIjoge1xuICAgICAgICAgICAgXCJlbnVtXCI6IFsgeyBcInR5cGVcIjogXCJ2b2lkXCIgfSBdXG4gICAgICAgIH0sXG4gICAgICAgIFwibW9kZWxUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bWJlclwiLCBcInN0cmluZ1wiLCBcImFycmF5XCIgXVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJwcmltaXRpdmVUeXBlXCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcImJvb2xlYW5cIiwgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIsIFwic3RyaW5nXCIgXVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwiZGVmYXVsdFZhbHVlXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjogeyBcInR5cGVcIjogWyBcImFycmF5XCIsIFwib2JqZWN0XCIsIFwibnVsbFwiIF0gfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1pbmltdW1cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwibWF4aW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgICAgICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiaW50MzJcIiwgXCJpbnQ2NFwiIF0gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJudW1iZXJcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJmbG9hdFwiLCBcImRvdWJsZVwiIF0gfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYnl0ZVwiLCBcImRhdGVcIiwgXCJkYXRlLXRpbWVcIiBdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcInN0cmluZ1wiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImludGVnZXJcIiwgXCJudW1iZXJcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJhcnJheVR5cGVcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiLCBcIml0ZW1zXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJhcnJheVwiIF0gfSxcbiAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaXRlbXNPYmplY3RcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3JlZlR5cGVcIlxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZVR5cGVcIlxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjoge30sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHt9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2RhdGFUeXBlQmFzZS5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwiZGVzY3JpcHRpb25cIjogXCJEYXRhIHR5cGUgZmllbGRzIChzZWN0aW9uIDQuMy4zKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7IFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdIH0sXG4gICAgICAgIHsgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0gfVxuICAgIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCIkcmVmXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJmb3JtYXRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlZmF1bHRWYWx1ZVwiOiB7XG4gICAgICAgICAgICBcIm5vdFwiOiB7IFwidHlwZVwiOiBbIFwiYXJyYXlcIiwgXCJvYmplY3RcIiwgXCJudWxsXCIgXSB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWUsXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDFcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaXRlbXNPYmplY3RcIiB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH1cbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJpbnRlZ2VyXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImludDMyXCIsIFwiaW50NjRcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJudW1iZXJcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiZmxvYXRcIiwgXCJkb3VibGVcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJzdHJpbmdcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJieXRlXCIsIFwiZGF0ZVwiLCBcImRhdGUtdGltZVwiIF1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiaXRlbXNPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwiJHJlZlwiIF0sXG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJhbGxPZlwiOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9pbmZvT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcImluZm8gb2JqZWN0IChzZWN0aW9uIDUuMS4zKVwiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInRpdGxlXCIsIFwiZGVzY3JpcHRpb25cIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidGl0bGVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJ0ZXJtc09mU2VydmljZVVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgIFwiY29udGFjdFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcImVtYWlsXCIgfSxcbiAgICAgICAgXCJsaWNlbnNlXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJsaWNlbnNlVXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfVxuICAgIH0sXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9tb2RlbHNPYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInJlcXVpcmVkXCI6IFsgXCJpZFwiLCBcInByb3BlcnRpZXNcIiBdLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiaWRcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJvcGVydHlPYmplY3RcIiB9XG4gICAgICAgIH0sXG4gICAgICAgIFwic3ViVHlwZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGlzY3JpbWluYXRvclwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJzdWJUeXBlc1wiOiBbIFwiZGlzY3JpbWluYXRvclwiIF1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcInByb3BlcnR5T2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJub3RcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL29hdXRoMkdyYW50VHlwZS5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwibWluUHJvcGVydGllc1wiOiAxLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiaW1wbGljaXRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2ltcGxpY2l0XCIgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uX2NvZGVcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2F1dGhvcml6YXRpb25Db2RlXCIgfVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiaW1wbGljaXRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJsb2dpbkVuZHBvaW50XCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJsb2dpbkVuZHBvaW50XCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9sb2dpbkVuZHBvaW50XCIgfSxcbiAgICAgICAgICAgICAgICBcInRva2VuTmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXV0aG9yaXphdGlvbkNvZGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0b2tlbkVuZHBvaW50XCIsIFwidG9rZW5SZXF1ZXN0RW5kcG9pbnRcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInRva2VuRW5kcG9pbnRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Rva2VuRW5kcG9pbnRcIiB9LFxuICAgICAgICAgICAgICAgIFwidG9rZW5SZXF1ZXN0RW5kcG9pbnRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Rva2VuUmVxdWVzdEVuZHBvaW50XCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJsb2dpbkVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuRW5kcG9pbnRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ1cmxcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgICAgICAgICAgXCJ0b2tlbk5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuUmVxdWVzdEVuZHBvaW50XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidXJsXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ1cmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9LFxuICAgICAgICAgICAgICAgIFwiY2xpZW50SWROYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImNsaWVudFNlY3JldE5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9vcGVyYXRpb25PYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgeyBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIiB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJtZXRob2RcIiwgXCJuaWNrbmFtZVwiLCBcInBhcmFtZXRlcnNcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcIm1ldGhvZFwiOiB7IFwiZW51bVwiOiBbIFwiR0VUXCIsIFwiUE9TVFwiLCBcIlBVVFwiLCBcIlBBVENIXCIsIFwiREVMRVRFXCIsIFwiT1BUSU9OU1wiIF0gfSxcbiAgICAgICAgICAgICAgICBcInN1bW1hcnlcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJtYXhMZW5ndGhcIjogMTIwIH0sXG4gICAgICAgICAgICAgICAgXCJub3Rlc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJuaWNrbmFtZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeW2EtekEtWjAtOV9dKyRcIlxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jL2RlZmluaXRpb25zL29hdXRoMlNjb3BlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcInBhcmFtZXRlck9iamVjdC5qc29uI1wiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwicmVzcG9uc2VNZXNzYWdlc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlTWVzc2FnZU9iamVjdFwifVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJwcm9kdWNlc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXG4gICAgICAgICAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXG4gICAgICAgICAgICAgICAgXCJkZXByZWNhdGVkXCI6IHsgXCJlbnVtXCI6IFsgXCJ0cnVlXCIsIFwiZmFsc2VcIiBdIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIF0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwicmVzcG9uc2VNZXNzYWdlT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwiY29kZVwiLCBcIm1lc3NhZ2VcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImNvZGVcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3JmYzI2MTZzZWN0aW9uMTBcIiB9LFxuICAgICAgICAgICAgICAgIFwibWVzc2FnZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJyZXNwb25zZU1vZGVsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInJmYzI2MTZzZWN0aW9uMTBcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJtaW5pbXVtXCI6IDEwMCxcbiAgICAgICAgICAgIFwibWF4aW11bVwiOiA2MDAsXG4gICAgICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcIm1pbWVUeXBlQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwibWltZS10eXBlXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9wYXJhbWV0ZXJPYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgeyBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIiB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJwYXJhbVR5cGVcIiwgXCJuYW1lXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJwYXJhbVR5cGVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcInBhdGhcIiwgXCJxdWVyeVwiLCBcImJvZHlcIiwgXCJoZWFkZXJcIiwgXCJmb3JtXCIgXVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJuYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcInJlcXVpcmVkXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH0sXG4gICAgICAgICAgICAgICAgXCJhbGxvd011bHRpcGxlXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcInR5cGUgRmlsZSByZXF1aXJlcyBzcGVjaWFsIHBhcmFtVHlwZSBhbmQgY29uc3VtZXNcIixcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwibm90XCI6IHsgXCJlbnVtXCI6IFsgXCJGaWxlXCIgXSB9IH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJGaWxlXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJwYXJhbVR5cGVcIjogeyBcImVudW1cIjogWyBcImZvcm1cIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImNvbnN1bWVzXCI6IHsgXCJlbnVtXCI6IFsgXCJtdWx0aXBhcnQvZm9ybS1kYXRhXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICBdXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwic3dhZ2dlclZlcnNpb25cIiwgXCJhcGlzXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInN3YWdnZXJWZXJzaW9uXCI6IHsgXCJlbnVtXCI6IFsgXCIxLjJcIiBdIH0sXG4gICAgICAgIFwiYXBpc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcInJlc291cmNlT2JqZWN0Lmpzb24jXCIgfVxuICAgICAgICB9LFxuICAgICAgICBcImFwaVZlcnNpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImluZm9cIjogeyBcIiRyZWZcIjogXCJpbmZvT2JqZWN0Lmpzb24jXCIgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7IFwiJHJlZlwiOiBcImF1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIiB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL3Jlc291cmNlT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwicGF0aFwiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJwYXRoXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICB9LFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2Vcbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwidGl0bGVcIjogXCJBIEpTT04gU2NoZW1hIGZvciBTd2FnZ2VyIDIuMCBBUEkuXCIsXG4gIFwiaWRcIjogXCJodHRwOi8vc3dhZ2dlci5pby92Mi9zY2hlbWEuanNvbiNcIixcbiAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICBcInJlcXVpcmVkXCI6IFtcbiAgICBcInN3YWdnZXJcIixcbiAgICBcImluZm9cIixcbiAgICBcInBhdGhzXCJcbiAgXSxcbiAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgXCJeeC1cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgIH1cbiAgfSxcbiAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICBcInN3YWdnZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImVudW1cIjogW1xuICAgICAgICBcIjIuMFwiXG4gICAgICBdLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBTd2FnZ2VyIHZlcnNpb24gb2YgdGhpcyBkb2N1bWVudC5cIlxuICAgIH0sXG4gICAgXCJpbmZvXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaW5mb1wiXG4gICAgfSxcbiAgICBcImhvc3RcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImZvcm1hdFwiOiBcInVyaVwiLFxuICAgICAgXCJwYXR0ZXJuXCI6IFwiXltee30vIDpcXFxcXFxcXF0rKD86OlxcXFxkKyk/JFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBmdWxseSBxdWFsaWZpZWQgVVJJIHRvIHRoZSBob3N0IG9mIHRoZSBBUEkuXCJcbiAgICB9LFxuICAgIFwiYmFzZVBhdGhcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcInBhdHRlcm5cIjogXCJeL1wiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBiYXNlIHBhdGggdG8gdGhlIEFQSS4gRXhhbXBsZTogJy9hcGknLlwiXG4gICAgfSxcbiAgICBcInNjaGVtZXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWVzTGlzdFwiXG4gICAgfSxcbiAgICBcImNvbnN1bWVzXCI6IHtcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyBhY2NlcHRlZCBieSB0aGUgQVBJLlwiLFxuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcbiAgICB9LFxuICAgIFwicHJvZHVjZXNcIjoge1xuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgbGlzdCBvZiBNSU1FIHR5cGVzIHRoZSBBUEkgY2FuIHByb2R1Y2UuXCIsXG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgIH0sXG4gICAgXCJwYXRoc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdGhzXCJcbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZpbml0aW9uc1wiXG4gICAgfSxcbiAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJEZWZpbml0aW9uc1wiXG4gICAgfSxcbiAgICBcInJlc3BvbnNlc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlRGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NlY3VyaXR5XCJcbiAgICB9LFxuICAgIFwic2VjdXJpdHlEZWZpbml0aW9uc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NlY3VyaXR5RGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJ0YWdzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy90YWdcIlxuICAgICAgfSxcbiAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgIH0sXG4gICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgIH1cbiAgfSxcbiAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgXCJpbmZvXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkdlbmVyYWwgaW5mb3JtYXRpb24gYWJvdXQgdGhlIEFQSS5cIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInZlcnNpb25cIixcbiAgICAgICAgXCJ0aXRsZVwiXG4gICAgICBdLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgdW5pcXVlIGFuZCBwcmVjaXNlIHRpdGxlIG9mIHRoZSBBUEkuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ2ZXJzaW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBzZW1hbnRpYyB2ZXJzaW9uIG51bWJlciBvZiB0aGUgQVBJLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxvbmdlciBkZXNjcmlwdGlvbiBvZiB0aGUgQVBJLiBTaG91bGQgYmUgZGlmZmVyZW50IGZyb20gdGhlIHRpdGxlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0ZXJtc09mU2VydmljZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSB0ZXJtcyBvZiBzZXJ2aWNlIGZvciB0aGUgQVBJLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29udGFjdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb250YWN0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJsaWNlbnNlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2xpY2Vuc2VcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImNvbnRhY3RcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQ29udGFjdCBpbmZvcm1hdGlvbiBmb3IgdGhlIG93bmVycyBvZiB0aGUgQVBJLlwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBpZGVudGlmeWluZyBuYW1lIG9mIHRoZSBjb250YWN0IHBlcnNvbi9vcmdhbml6YXRpb24uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1cmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgVVJMIHBvaW50aW5nIHRvIHRoZSBjb250YWN0IGluZm9ybWF0aW9uLlwiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbWFpbFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBlbWFpbCBhZGRyZXNzIG9mIHRoZSBjb250YWN0IHBlcnNvbi9vcmdhbml6YXRpb24uXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJlbWFpbFwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwibGljZW5zZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIlxuICAgICAgXSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgbGljZW5zZSB0eXBlLiBJdCdzIGVuY291cmFnZWQgdG8gdXNlIGFuIE9TSSBjb21wYXRpYmxlIGxpY2Vuc2UuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1cmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgVVJMIHBvaW50aW5nIHRvIHRoZSBsaWNlbnNlLlwiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJwYXRoc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJSZWxhdGl2ZSBwYXRocyB0byB0aGUgaW5kaXZpZHVhbCBlbmRwb2ludHMuIFRoZXkgbXVzdCBiZSByZWxhdGl2ZSB0byB0aGUgJ2Jhc2VQYXRoJy5cIixcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcIl4vXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdGhJdGVtXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgfSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJPbmUgb3IgbW9yZSBKU09OIG9iamVjdHMgZGVzY3JpYmluZyB0aGUgc2NoZW1hcyBiZWluZyBjb25zdW1lZCBhbmQgcHJvZHVjZWQgYnkgdGhlIEFQSS5cIlxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJEZWZpbml0aW9uc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlclwiXG4gICAgICB9LFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIk9uZSBvciBtb3JlIEpTT04gcmVwcmVzZW50YXRpb25zIGZvciBwYXJhbWV0ZXJzXCJcbiAgICB9LFxuICAgIFwicmVzcG9uc2VEZWZpbml0aW9uc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlXCJcbiAgICAgIH0sXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiT25lIG9yIG1vcmUgSlNPTiByZXByZXNlbnRhdGlvbnMgZm9yIHBhcmFtZXRlcnNcIlxuICAgIH0sXG4gICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcImluZm9ybWF0aW9uIGFib3V0IGV4dGVybmFsIGRvY3VtZW50YXRpb25cIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1cmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJleGFtcGxlc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl5bYS16MC05LV0rL1thLXowLTlcXFxcLStdKyRcIjoge31cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcIm1pbWVUeXBlXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJwYXR0ZXJuXCI6IFwiXltcXFxcc2EtejAtOVxcXFwtKztcXFxcLj1cXFxcL10rJFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBNSU1FIHR5cGUgb2YgdGhlIEhUVFAgbWVzc2FnZS5cIlxuICAgIH0sXG4gICAgXCJvcGVyYXRpb25cIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJyZXNwb25zZXNcIlxuICAgICAgXSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidGFnc1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJzdW1tYXJ5XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBzdW1tYXJ5IG9mIHRoZSBvcGVyYXRpb24uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgbG9uZ2VyIGRlc2NyaXB0aW9uIG9mIHRoZSBvcGVyYXRpb24sIGdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4dGVybmFsRG9jc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwib3BlcmF0aW9uSWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGZyaWVuZGx5IG5hbWUgb2YgdGhlIG9wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvZHVjZXNcIjoge1xuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBwcm9kdWNlLlwiLFxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29uc3VtZXNcIjoge1xuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBjb25zdW1lLlwiLFxuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGFyYW1ldGVyc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXJhbWV0ZXJzTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicmVzcG9uc2VzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NoZW1lc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWVzTGlzdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVwcmVjYXRlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInNlY3VyaXR5XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NlY3VyaXR5XCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJwYXRoSXRlbVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwdXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwb3N0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVsZXRlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwib3B0aW9uc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcImhlYWRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXRjaFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyc0xpc3RcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInJlc3BvbnNlc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJSZXNwb25zZSBvYmplY3RzIG5hbWVzIGNhbiBlaXRoZXIgYmUgYW55IHZhbGlkIEhUVFAgc3RhdHVzIGNvZGUgb3IgJ2RlZmF1bHQnLlwiLFxuICAgICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IDEsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXihbMC05XXszfSkkfF4oZGVmYXVsdCkkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlVmFsdWVcIlxuICAgICAgICB9LFxuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJub3RcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJyZXNwb25zZVZhbHVlXCI6IHtcbiAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2pzb25SZWZlcmVuY2VcIlxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSxcbiAgICBcInJlc3BvbnNlXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NoZW1hXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaGVhZGVyc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9oZWFkZXJzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGFtcGxlc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGFtcGxlc1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImhlYWRlcnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9oZWFkZXJcIlxuICAgICAgfVxuICAgIH0sXG4gICAgXCJoZWFkZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInZlbmRvckV4dGVuc2lvblwiOiB7XG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQW55IHByb3BlcnR5IHN0YXJ0aW5nIHdpdGggeC0gaXMgdmFsaWQuXCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHRydWUsXG4gICAgICBcImFkZGl0aW9uYWxJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcImJvZHlQYXJhbWV0ZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJuYW1lXCIsXG4gICAgICAgIFwiaW5cIixcbiAgICAgICAgXCJzY2hlbWFcIlxuICAgICAgXSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgYnJpZWYgZGVzY3JpcHRpb24gb2YgdGhlIHBhcmFtZXRlci4gVGhpcyBjb3VsZCBjb250YWluIGV4YW1wbGVzIG9mIHVzZS4gIEdpdGh1Yi1mbGF2b3JlZCBtYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYm9keVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgd2hldGhlciBvciBub3QgdGhpcyBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQgb3Igb3B0aW9uYWwuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwic2NoZW1hXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcImhlYWRlclBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgd2hldGhlciBvciBub3QgdGhpcyBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQgb3Igb3B0aW9uYWwuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImhlYWRlclwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicXVlcnlQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJxdWVyeVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiZm9ybURhdGFQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJmb3JtRGF0YVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCIsXG4gICAgICAgICAgICBcImZpbGVcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRXaXRoTXVsdGlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJwYXRoUGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgdHJ1ZVxuICAgICAgICAgIF0sXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgd2hldGhlciBvciBub3QgdGhpcyBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQgb3Igb3B0aW9uYWwuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwicGF0aFwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0aHViLWZsYXZvcmVkIG1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwibm9uQm9keVBhcmFtZXRlclwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIixcbiAgICAgICAgXCJpblwiLFxuICAgICAgICBcInR5cGVcIlxuICAgICAgXSxcbiAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9oZWFkZXJQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9mb3JtRGF0YVBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3F1ZXJ5UGFyYW1ldGVyU3ViU2NoZW1hXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0aFBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9LFxuICAgIFwicGFyYW1ldGVyXCI6IHtcbiAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9ib2R5UGFyYW1ldGVyXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbm9uQm9keVBhcmFtZXRlclwiXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9LFxuICAgIFwic2NoZW1hXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgZGV0ZXJtaW5pc3RpYyB2ZXJzaW9uIG9mIGEgSlNPTiBTY2hlbWEgb2JqZWN0LlwiLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInRpdGxlXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy90aXRsZVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2Rlc2NyaXB0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvcHJvcGVydGllcy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvc3RyaW5nQXJyYXlcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3R5cGVcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcImFsbE9mXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkaXNjcmltaW5hdG9yXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlYWRPbmx5XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwieG1sXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3htbFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4dGVybmFsRG9jc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhhbXBsZVwiOiB7fVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJwcmltaXRpdmVzSXRlbXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVJlcXVpcmVtZW50XCJcbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwic2VjdXJpdHlSZXF1aXJlbWVudFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgIH1cbiAgICB9LFxuICAgIFwieG1sXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lc3BhY2VcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHJlZml4XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImF0dHJpYnV0ZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIndyYXBwZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJ0YWdcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwic2VjdXJpdHlEZWZpbml0aW9uc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2Jhc2ljQXV0aGVudGljYXRpb25TZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaUtleVNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgySW1wbGljaXRTZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlBhc3N3b3JkU2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJBcHBsaWNhdGlvblNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyQWNjZXNzQ29kZVNlY3VyaXR5XCJcbiAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiYmFzaWNBdXRoZW50aWNhdGlvblNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYmFzaWNcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImFwaUtleVNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJuYW1lXCIsXG4gICAgICAgIFwiaW5cIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYXBpS2V5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiaGVhZGVyXCIsXG4gICAgICAgICAgICBcInF1ZXJ5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJJbXBsaWNpdFNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJpbXBsaWNpdFwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInNjb3Blc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMlBhc3N3b3JkU2VjdXJpdHlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiLFxuICAgICAgICBcImZsb3dcIixcbiAgICAgICAgXCJ0b2tlblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJwYXNzd29yZFwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInNjb3Blc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJBcHBsaWNhdGlvblNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwidG9rZW5VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYXBwbGljYXRpb25cIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgyQWNjZXNzQ29kZVNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiLFxuICAgICAgICBcInRva2VuVXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcIm9hdXRoMlwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZsb3dcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFjY2Vzc0NvZGVcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidG9rZW5VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMlNjb3Blc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgfVxuICAgIH0sXG4gICAgXCJtZWRpYVR5cGVMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZVwiXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInBhcmFtZXRlcnNMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIHBhcmFtZXRlcnMgbmVlZGVkIHRvIHNlbmQgYSB2YWxpZCBBUEkgY2FsbC5cIixcbiAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgIFwiYWRkaXRpb25hbEl0ZW1zXCI6IGZhbHNlLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyXCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvanNvblJlZmVyZW5jZVwiXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInNjaGVtZXNMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIHRyYW5zZmVyIHByb3RvY29sIG9mIHRoZSBBUEkuXCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgXCJodHRwXCIsXG4gICAgICAgICAgXCJodHRwc1wiLFxuICAgICAgICAgIFwid3NcIixcbiAgICAgICAgICBcIndzc1wiXG4gICAgICAgIF1cbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgIFwiY3N2XCIsXG4gICAgICAgIFwic3N2XCIsXG4gICAgICAgIFwidHN2XCIsXG4gICAgICAgIFwicGlwZXNcIlxuICAgICAgXSxcbiAgICAgIFwiZGVmYXVsdFwiOiBcImNzdlwiXG4gICAgfSxcbiAgICBcImNvbGxlY3Rpb25Gb3JtYXRXaXRoTXVsdGlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImVudW1cIjogW1xuICAgICAgICBcImNzdlwiLFxuICAgICAgICBcInNzdlwiLFxuICAgICAgICBcInRzdlwiLFxuICAgICAgICBcInBpcGVzXCIsXG4gICAgICAgIFwibXVsdGlcIlxuICAgICAgXSxcbiAgICAgIFwiZGVmYXVsdFwiOiBcImNzdlwiXG4gICAgfSxcbiAgICBcInRpdGxlXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3RpdGxlXCJcbiAgICB9LFxuICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVzY3JpcHRpb25cIlxuICAgIH0sXG4gICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2RlZmF1bHRcIlxuICAgIH0sXG4gICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL211bHRpcGxlT2ZcIlxuICAgIH0sXG4gICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL21heGltdW1cIlxuICAgIH0sXG4gICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgIH0sXG4gICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL21pbmltdW1cIlxuICAgIH0sXG4gICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgIH0sXG4gICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgfSxcbiAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgIH0sXG4gICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3BhdHRlcm5cIlxuICAgIH0sXG4gICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICB9LFxuICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICB9LFxuICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdW5pcXVlSXRlbXNcIlxuICAgIH0sXG4gICAgXCJlbnVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2VudW1cIlxuICAgIH0sXG4gICAgXCJqc29uUmVmZXJlbmNlXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiQ29yZSBzY2hlbWEgbWV0YS1zY2hlbWFcIixcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJzY2hlbWFBcnJheVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zaXRpdmVJbnRlZ2VyXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAwXG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIjoge1xuICAgICAgICAgICAgXCJhbGxPZlwiOiBbIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIiB9LCB7IFwiZGVmYXVsdFwiOiAwIH0gXVxuICAgICAgICB9LFxuICAgICAgICBcInNpbXBsZVR5cGVzXCI6IHtcbiAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYXJyYXlcIiwgXCJib29sZWFuXCIsIFwiaW50ZWdlclwiLCBcIm51bGxcIiwgXCJudW1iZXJcIiwgXCJvYmplY3RcIiwgXCJzdHJpbmdcIiBdXG4gICAgICAgIH0sXG4gICAgICAgIFwic3RyaW5nQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgIH1cbiAgICB9LFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiaWRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiJHNjaGVtYVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0aXRsZVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7fSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJtaW5pbXVtXCI6IDAsXG4gICAgICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwibnVtYmVyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwibnVtYmVyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCIgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJyZWdleFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYWRkaXRpb25hbEl0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH0sXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIiB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4UHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcbiAgICAgICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXG4gICAgICAgIFwicmVxdWlyZWRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCIgfSxcbiAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc3RyaW5nQXJyYXlcIiB9XG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NpbXBsZVR5cGVzXCIgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NpbXBsZVR5cGVzXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiYWxsT2ZcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfSxcbiAgICAgICAgXCJhbnlPZlwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9LFxuICAgICAgICBcIm9uZU9mXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH0sXG4gICAgICAgIFwibm90XCI6IHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICB9LFxuICAgIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IFsgXCJtYXhpbXVtXCIgXSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IFsgXCJtaW5pbXVtXCIgXVxuICAgIH0sXG4gICAgXCJkZWZhdWx0XCI6IHt9XG59XG4iXX0=
