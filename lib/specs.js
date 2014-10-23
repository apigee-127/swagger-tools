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

var _ = require('lodash');
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
