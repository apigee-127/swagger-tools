/*
 * Copyright 2014 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Module dependencies
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var jjv = require('jjv');
var jjve = require('jjve');

var jjvOptions = {
  checkRequired: true,
  removeAdditional: false,
  useDefault: false,
  useCoerce: false
};
var jjveOptions = {
  formatPath: false
};

var mergeResults = function mergeResults (errors, warnings, results) {
  if (_.isPlainObject(results)) {
    if (results.errors && _.isArray(results.errors) && _.isArray(errors)) {
      results.errors.forEach(function (error) {
        errors.push(error);
      });
    }

    if (results.warnings && _.isArray(results.warnings) && _.isArray(warnings)) {
      results.warnings.forEach(function (warning) {
        warnings.push(warning);
      });
    }
  }
};

var throwUnsupportedVersion = function throwUnsupportedVersion (version) {
  throw new Error(version + ' is an unsupported Swagger specification version');
};

/**
 * Creates a new Swagger specification object.
 *
 * @param {string} version - The Swagger version
 *
 * @constructor
 */
var Specification = function Specification (version) {
  var schemasPath = path.join(__dirname, 'schemas', version);
  var docsUrl;
  var primitives;
  var schemasUrl;

  switch (version) {
  case '1.2':
    docsUrl = 'https://github.com/wordnik/swagger-spec/blob/master/versions/1.2.md';
    // Manually maintained list due to the related JSON Schema files not being complete or used
    primitives = [
      'integer',
      'long',
      'float',
      'double',
      'number',
      'string',
      'byte',
      'boolean',
      'date',
      'dateTime'
    ];
    schemasUrl = 'https://github.com/wordnik/swagger-spec/tree/master/schemas/v1.2';

    break;
  default:
    throwUnsupportedVersion(version);
  }

  this.docsUrl = docsUrl;
  this.primitives = primitives;
  this.schemasUrl = schemasUrl;
  this.version = version;

  // Load the schema files
  this.schemas = {};

  fs.readdirSync(schemasPath)
    .filter(function (name) {
      return name.match(/^(.*)\.json$/);
    })
    .forEach(function (name) {
      this.schemas[name] = require(path.join(schemasPath, name));
    }.bind(this));

  // Create the validators
  this.validators = {};

  switch (version) {
  case '1.2':
    Object.keys(this.schemas).forEach(function (schemaName) {
      var validator = jjv(jjvOptions);
      var toCompile = [];

      // Disable the 'uri' format checker as it's got issues: https://github.com/acornejo/jjv/issues/24
      validator.addFormat('uri', function() {
        return true;
      });

      // Since some schemas depend on others, bring them in appropriately
      switch (schemaName) {
      case 'apiDeclaration.json':
        toCompile = [
          'dataTypeBase.json',
          'modelsObject.json',
          'oauth2GrantType.json',
          'authorizationObject.json',
          'parameterObject.json',
          'operationObject.json'
        ];

        break;
      case 'authorizationObject.json':
        toCompile.push('oauth2GrantType.json');

        break;
      case 'modelsObject.json':
        toCompile.push('dataTypeBase.json');

        break;
      case 'operationObject.json':
        toCompile = [
          'dataTypeBase.json',
          'authorizationObject.json',
          'oauth2GrantType.json',
          'parameterObject.json'
        ];

        break;

      case 'parameterObject.json':
        toCompile.push('dataTypeBase.json');

        break;

      case 'resourceListing.json':
        toCompile = [
          'resourceObject.json',
          'infoObject.json',
          'oauth2GrantType.json',
          'authorizationObject.json'
        ];

        break;
      }

      toCompile.push(schemaName);

      toCompile.forEach(function (schemaName) {
        this.schemas[schemaName].id = schemaName;

        validator.addSchema(schemaName, this.schemas[schemaName]);
      }.bind(this));

      validator.je = jjve(validator);

      this.validators[schemaName] = validator;
    }.bind(this));

    break;
  }
};

var validateDefaultValue = function validateDefaultValue (data, path) {
  var defaultValue = data.defaultValue;
  var errors = [];
  var type = data.type;
  var parsedValue;
  var parsedMaximumValue;
  var parsedMinimumValue;

  if (!_.isUndefined(defaultValue)) {
    if (!_.isUndefined(data.enum) && data.enum.indexOf(defaultValue) === -1) {
      errors.push({
        code: 'ENUM_MISMATCH',
        message: 'Default value is not within enum values (' + data.enum.join(', ') + '): ' + defaultValue,
        data: defaultValue,
        path: path.concat(['defaultValue'])
      });
    }

    switch (type) {
      case 'integer':
      case 'number':
        if (['integer', 'number'].indexOf(type) > -1) {
          parsedValue = parseFloat(defaultValue);

          if (isNaN(parsedValue)) {
            errors.push({
              code: 'INVALID_TYPE',
              message: 'Invalid type (expected parseable number): ' + defaultValue,
              data: defaultValue,
              path: path.concat(['defaultValue'])
            });
          }

          if (!_.isUndefined(data.maximum)) {
            parsedMaximumValue = parseFloat(data.maximum);

            if (isNaN(parsedMaximumValue)) {
              errors.push({
                code: 'INVALID_TYPE',
                message: 'Invalid type (expected parseable number): ' + data.maximum,
                data: data.maximum,
                path: path.concat(['maximum'])
              });
            } else if (_.isNumber(parsedValue) && _.isNumber(parsedMaximumValue) && parsedValue > parsedMaximumValue) {
              errors.push({
                code: 'MAXIMUM',
                message: 'Default value is greater than maximum (' + data.maximum + '): ' + defaultValue,
                data: defaultValue,
                path: path.concat(['defaultValue'])
              });
            }
          }

          if (!_.isUndefined(data.minimum)) {
            parsedMinimumValue = parseFloat(data.minimum);

            if (isNaN(parsedMinimumValue)) {
              errors.push({
                code: 'INVALID_TYPE',
                message: 'Invalid type (expected parseable number): ' + data.minimum,
                data: data.minimum,
                path: path.concat(['minimum'])
              });
            } else if (_.isNumber(parsedValue) && _.isNumber(parsedMinimumValue) && parsedValue < parsedMinimumValue) {
              errors.push({
                code: 'MINIMUM',
                message: 'Default value is less than minimum (' + data.minimum + '): ' + defaultValue,
                data: defaultValue,
                path: path.concat(['defaultValue'])
              });
            }
          }
        }

        break;

      case 'boolean':
        if (!_.isBoolean(defaultValue)) {
          errors.push({
            code: 'INVALID_TYPE',
            message: 'Invalid type (expected parseable boolean): ' + defaultValue,
            data: defaultValue,
            path: path.concat(['defaultValue'])
          });
        }

        break;
    }
  }

  return {
    errors: errors,
    warnings: []
  };
};

var validateModels = function validateModels (spec, resource) {
  var addModelRef = function addModelRef (modelId, modelRef) {
    if (Object.keys(modelRefs).indexOf(modelId) === -1) {
      modelRefs[modelId] = [];
    }

    modelRefs[modelId].push(modelRef);
  };
  var errors = [];
  var identifyModelInheritanceIssues = function identifyModelInheritanceIssues (modelDeps) {
    var circular = {};
    var composed = {};
    var resolved = {};
    var unresolved = {};
    var addModelProps = function addModelProps (parentModel, modelName) {
      var model = models[modelName];

      if (model) {
        _.each(model.properties, function (prop, propName) {
          if (composed[propName]) {
            errors.push({
              code: 'CHILD_MODEL_REDECLARES_PROPERTY',
              message: 'Child model declares property already declared by ancestor: ' + propName,
              data: prop,
              path: ['models', parentModel, 'properties', propName]
            });
          } else {
            composed[propName] = propName;
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
    var resolver = function resolver (id, deps, circular, resolved, unresolved) {
      var model = models[id];
      var modelDeps = deps[id];

      unresolved[id] = true;

      if (modelDeps) {
        if (modelDeps.length > 1) {
          errors.push({
            code: 'MULTIPLE_MODEL_INHERITANCE',
            message: 'Child model is sub type of multiple models: ' + modelDeps.join(' && '),
            data: model,
            path: ['models', id]
          });
        }

        modelDeps.forEach(function (dep) {
          if (!resolved[dep]) {
            if (unresolved[dep]) {
              circular[id] = getPath(dep, unresolved);

              errors.push({
                code: 'CYCLICAL_MODEL_INHERITANCE',
                message: 'Model has a circular inheritance: ' + id + ' -> ' + circular[id].join(' -> '),
                data: model.subTypes || [],
                path: ['models', id, 'subTypes']
              });
              return;
            }

            addModelProps(id, dep);

            resolver(dep, deps, circular, resolved, unresolved);
          }
        });
      }

      resolved[id] = true;
      unresolved[id] = false;
    };

    Object.keys(modelDeps).forEach(function (modelName) {
      composed = {};
      addModelProps(modelName, modelName);
      resolver(modelName, modelDeps, circular, resolved, unresolved);
    });
  };
  var modelDeps = {};
  var modelIds = [];
  var modelProps = {};
  var modelRefs = {};
  var models = resource.models || {};
  var primitives = _.union(spec.primitives, ['array', 'void', 'File']);
  var warnings = [];

  switch (spec.version) {
  case '1.2':
    // Find references defined in the operations (Validation happens elsewhere but we have to be smart)
    _.each(resource.apis, function (api, index) {
      var apiPath = ['apis', index.toString()];

      _.each(api.operations, function (operation, index) {
        var operationPath = apiPath.concat(['operations', index.toString()]);

        // References in operation type
        if (operation.type === 'array' && operation.items.$ref) {
          addModelRef(operation.items.$ref, operationPath.concat(['items', '$ref']));
        } else if (primitives.indexOf(operation.type) === -1) {
          addModelRef(operation.type, operationPath.concat(['type']));
        }

        // References in operation parameters
        _.each(operation.parameters, function (parameter, index) {
          var paramPath = operationPath.concat(['parameters', index.toString()]);

          if (primitives.indexOf(parameter.type) === -1) {
            addModelRef(parameter.type, paramPath.concat(['type']));
          } else if (parameter.type === 'array' && parameter.items.$ref) {
            addModelRef(parameter.items.$ref, paramPath.concat(['items', '$ref']));
          }
        });

        // References in response messages
        _.each(operation.responseMessages, function (message, index) {
          if (message.responseModel) {
            addModelRef(message.responseModel,
                        operationPath.concat(['responseMessages', index.toString(), 'responseModel']));
          }
        });
      });
    });

    // Find references defined in the models themselves (Validation happens elsewhere but we have to be smart)
    if (!_.isUndefined(models)) {
      _.each(models, function (model, name) {
        var modelPath = ['models', name];
        var modelId = model.id;
        var seenSubTypes = [];

        // Keep track of model children and properties and duplicate models
        if (modelIds.indexOf(modelId) > -1) {
          errors.push({
            code: 'DUPLICATE_MODEL_DEFINITION',
            message: 'Model already defined: ' + modelId,
            data: modelId,
            path: modelPath.concat(['id'])
          });
        } else {
          modelIds.push(modelId);

          modelProps[name] = Object.keys(model.properties || {});

          (model.subTypes || []).forEach(function (subType, index) {
            var deps = modelDeps[subType];

            if (deps) {
              if (seenSubTypes.indexOf(subType) > -1) {
                warnings.push({
                  code: 'DUPLICATE_MODEL_SUBTYPE_DEFINITION',
                  message: 'Model already has subType defined: ' + subType,
                  data: subType,
                  path: modelPath.concat(['subTypes', index.toString()])
                });
              } else {
                modelDeps[subType].push(name);
              }
            } else {
              modelDeps[subType] = [name];
            }

            seenSubTypes.push(subType);
          });
        }

        // References in model properties
        _.each(model.properties, function (property, name) {
          var propPath = modelPath.concat(['properties', name]);

          if (property.$ref) {
            addModelRef(property.$ref, propPath.concat(['$ref']));
          } else if (property.type === 'array' && property.items.$ref) {
            addModelRef(property.items.$ref, propPath.concat(['items', '$ref']));
          } else {
            mergeResults(errors, warnings, validateDefaultValue(property, propPath));
          }
        });

        // References in model subTypes
        if (!_.isUndefined(model.subTypes)) {
          _.each(model.subTypes, function (name, index) {
            addModelRef(name, modelPath.concat(['subTypes', index.toString()]));
          });
        }

        if (model.discriminator && _.isUndefined(model.subTypes)) {
          errors.push({
            code: 'INVALID_MODEL_DISCRIMINATOR',
            message: 'Model cannot have discriminator without subTypes: ' + model.discriminator,
            data: model.discriminator,
            path: modelPath.concat(['discriminator'])
          });
        }

        if (!_.isUndefined(model.required)) {
          var props = model.properties || {};

          _.each(model.required, function (propName, index) {
            if (_.isUndefined(props[propName])) {
              errors.push({
                code: 'MISSING_REQUIRED_MODEL_PROPERTY',
                message: 'Model requires property but it is not defined: ' + propName,
                data: propName,
                path: modelPath.concat(['required', index.toString()])
              });
            }
          });
        }
      });
    }

    break;
  default:
    throwUnsupportedVersion(spec.version);
  }

  // Identify missing models (referenced but not declared)
  _.difference(Object.keys(modelRefs), modelIds).forEach(function (missing) {
    modelRefs[missing].forEach(function (modelRef) {
      errors.push({
        code: 'UNRESOLVABLE_MODEL_REFERENCE',
        message: 'Model reference could not be resolved: ' + missing,
        data: missing,
        path: modelRef
      });
    });
  });

  // Identify unused models (declared but not referenced)
  _.difference(modelIds, Object.keys(modelRefs)).forEach(function (unused) {
    warnings.push({
      code: 'UNUSED_MODEL',
      message: 'Model is defined but is not used: ' + unused,
      data: unused,
      path: ['models', unused]
    });
  });

  // Identify cyclical model dependencies
  // Identify model multiple inheritance
  // Identify model duplicate subType entries
  // Identify model redeclares property of ancestor
  identifyModelInheritanceIssues(modelDeps);

  return {
    errors: errors,
    warnings: warnings
  };
};

var validateOperations = function validateOperations (spec, resource) {
  var errors = [];
  var warnings = [];

  switch (spec.version) {
  case '1.2':
    _.each(resource.apis, function (api, index) {
      var apiPath = ['apis', index.toString()];
      var seenMethods = [];
      var seenNicknames = [];

      if (!api.operations || !_.isArray(api.operations)) {
        return;
      }

      _.each(api.operations, function (operation, index) {
        var operationPath = apiPath.concat(['operations', index.toString()]);
        var seenResponseMessageCodes = [];

        // Validate the default value when necessary
        _.each(operation.parameters, function (parameter, index) {
          mergeResults(errors, warnings,
                       validateDefaultValue(parameter, operationPath.concat(['parameters', index.toString()])));
        });

        // Identify duplicate operation methods
        if (seenMethods.indexOf(operation.method) > -1) {
          errors.push({
            code: 'DUPLICATE_OPERATION_METHOD',
            message: 'Operation method already defined: ' + operation.method,
            data: operation.method,
            path: operationPath.concat(['method'])
          });
        } else {
          seenMethods.push(operation.method);
        }

        // Identify duplicate operation nicknames
        if (seenNicknames.indexOf(operation.nickname) > -1) {
          errors.push({
            code: 'DUPLICATE_OPERATION_NICKNAME',
            message: 'Operation method already defined: ' + operation.nickname,
            data: operation.nickname,
            path: operationPath.concat(['nickname'])
          });
        } else {
          seenNicknames.push(operation.nickname);
        }

        // Identify duplicate operation responseMessage codes
        if (!_.isUndefined(operation.responseMessages)) {
          _.each(operation.responseMessages, function (responseMessage, index) {
            if (responseMessage.code) {
              if (seenResponseMessageCodes.indexOf(responseMessage.code) > -1) {
                errors.push({
                  code: 'DUPLICATE_OPERATION_RESPONSEMESSAGE_CODE',
                  message: 'Operation responseMessage code already defined: ' + responseMessage.code,
                  data: responseMessage.code,
                  path: operationPath.concat(['responseMessages', index.toString(), 'code'])
                });
              } else {
                seenResponseMessageCodes.push(responseMessage.code);
              }
            }
          });
        }

        // Identify operation summary greater than 120 characters
        if (operation.summary && _.isString(operation.summary) && operation.summary.length > 120) {
          warnings.push({
            code: 'OPERATION_SUMMARY_LONG',
            message: 'Operation summary is greater than 120 characters: ' + operation.summary.length,
            data: operation.summary,
            path: operationPath.concat(['summary'])
          });
        }
      });
    });
  }

  return {
    errors: errors,
    warnings: warnings
  };
};

/**
 * Returns the result of the validation of the Swagger document against its schema.
 *
 * @param {object} data - The object representing the Swagger document/fragment
 * @param {string} [schemaName='apiDeclaration.json'] - The schema name to use to validate the document/fragment
 *
 * @returns undefined if validation passes or an object containing errors and/or warnings
 */
Specification.prototype.validate = function validate (data, schemaName) {
  if (_.isUndefined(data)) {
    throw new Error('data is required');
  } else if (!_.isPlainObject(data)) {
    throw new TypeError('data must be an object');
  }

  var errors = [];
  var warnings = [];
  var schema;
  var validator;
  var result;

  switch (this.version) {
  case '1.2':
    // Default to 'apiDeclaration.json'
    schemaName = schemaName || 'apiDeclaration.json';

    break;
  default:
    throwUnsupportedVersion(this.version);
  }

  schema = this.schemas[schemaName];

  if (!schema) {
    throw new Error('schemaName is not valid (' + schemaName + ').  Valid schema names: ' +
                    Object.keys(this.schemas).join(', '));
  }

  // Do structural (JSON Schema) validation
  validator = this.validators[schemaName];
  result = validator.validate(schema, data);

  if (result) {
    errors = validator.je(schema, data, result, jjveOptions);
  }

  // Do semantic validation
  switch (schemaName) {
  case 'apiDeclaration.json':
    [validateModels, validateOperations].forEach(function (func) {
      mergeResults(errors, warnings, func(this, data));
    }.bind(this));

    break;
  }

  return errors.length === 0 && warnings.length === 0 ? undefined : {errors: errors, warnings: warnings};
};

/**
 * Returns the result of the validation of the Swagger API as a whole.
 *
 * @param {object} resourceListing - The resource listing object
 * @param {object[]} resources - The array of resources
 *
 * @returns undefined if validation passes or an object containing errors and/or warnings
 */
Specification.prototype.validateApi = function validateApi (resourceList, resources) {
  if (_.isUndefined(resourceList)) {
    throw new Error('resourceList is required');
  } else if (!_.isPlainObject(resourceList)) {
    throw new TypeError('resourceList must be an object');
  }

  if (_.isUndefined(resources)) {
    throw new Error('resources is required');
  } else if (!_.isArray(resources)) {
    throw new TypeError('resources must be an array');
  }

  var authNames = [];
  var authScopes = {};
  var resourcePaths = [];
  var resourceRefs = {};
  var result = {
    errors: [],
    warnings: [],
    resources: []
  };
  var seenAuthScopes = {};
  var seenResourcePaths = [];
  var skipFurtherValidation = false;

  // Validate the resource listing (structural)
  mergeResults(result.errors, result.warnings, this.validate(resourceList, 'resourceListing.json'));

  // Quick return if validation has failed already
  if (result.errors.length > 0) {
    return result;
  }

  // Generate list of declared API paths
  if (_.isArray(resourceList.apis)) {
    resourceList.apis.forEach(function (api, index) {
      if (resourcePaths.indexOf(api.path) > -1) {
        result.errors.push({
          code: 'DUPLICATE_RESOURCE_PATH',
          message: 'Resource path already defined: ' + api.path,
          data: api.path,
          path: ['apis', index.toString(), 'path']
        });
      } else {
        resourcePaths.push(api.path);
        resourceRefs[api.path] = [];
      }
    });
  }

  // Generate list of declared auth scopes
  _.each(resourceList.authorizations, function (authorization, name) {
    var scopes = [];

    authNames.push(name);

    if (authorization.type === 'oauth2') {
      scopes = _.map(authorization.scopes, function (scope) {
        return scope.scope;
      });
    }

    authScopes[name] = scopes;
  });

  // Validate the resources
  resources.forEach(function (resource, index) {
    var vResult = this.validate(resource) || {errors: [], warnings: []};
    var recordAuth = function recordAuth (authorization, name, path) {
      var scopes = authScopes[name];

      if (!_.isArray(seenAuthScopes[name])) {
        seenAuthScopes[name] = [];
      }

      // Identify missing authorizations (referenced but not declared)
      if (_.isUndefined(scopes)) {
        vResult.errors.push({
          code: 'UNRESOLVABLE_AUTHORIZATION_REFERENCE',
          message: 'Authorization reference could not be resolved: ' + name,
          data: authorization,
          path: path
        });
      } else if (!_.isUndefined(authorization) && authorization.length > 0) {
        if (scopes.length > 0) {
          _.each(authorization, function (scope, index) {
            if (scopes.indexOf(scope.scope) === -1) {
              vResult.errors.push({
                code: 'UNRESOLVABLE_AUTHORIZATION_SCOPE_REFERENCE',
                message: 'Authorization scope reference could not be resolved: ' + scope.scope,
                data: scope.scope,
                path: path.concat(['scopes', index.toString()])
              });
            } else {
              if (seenAuthScopes[name].indexOf(scope.scope) === -1) {
                seenAuthScopes[name].push(scope.scope);
              }
            }
          });
        }
      }
    };

    // Do not procede with semantic validation if the resource is structurally invalid
    if (vResult.errors.length > 0) {
      skipFurtherValidation = true;
    } else {
      // References in resource
      if (!_.isUndefined(resource.authorizations)) {
        _.each(resource.authorizations, function (authorization, name) {
          recordAuth(authorization, name, ['authorizations', name]);
        });
      }

      // References in resource operations
      _.each(resource.apis, function (api, index) {
        var aPath = ['apis', index.toString()];

        if (_.isArray(api.operations)) {
          _.each(api.operations, function (operation, index) {
            var oPath = aPath.concat(['operations', index.toString()]);

            if (_.isPlainObject(operation.authorizations)) {
              _.each(operation.authorizations, function (authorization, name) {
                recordAuth(authorization, name, oPath.concat(['authorizations', name]));
              });
            }
          });
        }
      });

      if (resourcePaths.indexOf(resource.resourcePath) === -1) {
        vResult.errors.push({
          code: 'UNRESOLVABLE_RESOURCEPATH_REFERENCE',
          message: 'Resource defined but not declared in resource listing: ' + resource.resourcePath,
          data: resource.resourcePath,
          path: ['resourcePath']
        });
      } else if (seenResourcePaths.indexOf(resource.resourcePath) > -1) {
        vResult.errors.push({
          code: 'DUPLICATE_RESOURCE_PATH',
          message: 'Resource path already defined: ' + resource.resourcePath,
          data: resource.resourcePath,
          path: ['resourcePath']
        });
      } else {
        if (seenResourcePaths.indexOf(resource.resourcePath) === -1) {
          seenResourcePaths.push(resource.resourcePath);
        }
      }
    }

    result.resources[index] = vResult;
  }.bind(this));

  // If the structural validation of a resource fails, we will skip all semantic validation.  Due to this, untill all
  // resource validate structurally, we cannot do this level of validation across the whole API.

  if (!skipFurtherValidation) {
    // Identify unused resources (declared but not referenced)
    _.difference(resourcePaths, seenResourcePaths).forEach(function (unused) {
      var index = _.map(resourceList.apis, function (api) { return api.path; }).indexOf(unused);

      result.errors.push({
        code: 'UNUSED_RESOURCE',
        message: 'Resource is defined but is not used: ' + unused,
        data: resourceList.apis[index],
        path: ['apis', index.toString()]
      });
    });

    // Identify unused authorizations (declared but not referenced)
    _.difference(Object.keys(authScopes), Object.keys(seenAuthScopes)).forEach(function (unused) {
      result.warnings.push({
        code: 'UNUSED_AUTHORIZATION',
        message: 'Authorization is defined but is not used: ' + unused,
        data: resourceList.authorizations[unused],
        path: ['authorizations', unused]
      });
    });

    _.each(authScopes, function (scopes, name) {
      var path = ['authorizations', name];

      // Identify unused authorization scope (declared but not referenced)
      _.difference(scopes, seenAuthScopes[name] || []).forEach(function (unused) {
        var index = scopes.indexOf(unused);

        result.warnings.push({
          code: 'UNUSED_AUTHORIZATION_SCOPE',
          message: 'Authorization scope is defined but is not used: ' + unused,
          data: resourceList.authorizations[name].scopes[index],
          path: path.concat(['scopes', index.toString()])
        });
      });
    });
  }

  return result.errors.length + result.warnings.length + _.reduce(result.resources, function (count, resource) {
      return count +
        (_.isArray(resource.errors) ? resource.errors.length : 0) +
        (_.isArray(resource.warnings) ? resource.warnings.length : 0);
    }, 0) > 0 ? result : undefined;
};

module.exports.v1_2 = new Specification('1.2'); // jshint ignore:line
