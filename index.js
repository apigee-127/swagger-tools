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
var jjv = require('jjv');
var jjve = require('jjve');

var defaultOptions = {
  validator: {
    useDefault: false,
    useCoerce: false,
    checkRequired: true,
    removeAdditional: false
  }
};

var throwUnsupportedVersion = function (version) {
  throw new Error(version + ' is an unsupported Swagger specification version');
};

/**
 * Creates a new Swagger specification object.
 *
 * @param {string} version - The Swagger version
 * @param {object} [options] - The specification options
 * @param {boolean} [options.validator.useDefault=false] - If true it modifies the object to have the default values for
 *                                                         missing non-required fields
 * @param {boolean} [options.validator.useCoerce=false] - If true it enables type coercion where defined
 * @param {boolean} [options.validatorcheckRequired=true] - If true it reports missing required properties, otherwise it
 *                                                          allows missing required properties
 * @param {boolean} [options.validator.removeAdditional=false] - If true it removes all attributes of an object which
 *                                                               are not matched by the schema's specification
 * @constructor
 */
var Specification = function Specification (version, options) {
  var docsUrl;
  var primitives;
  var schemasUrl;

  options = _.defaults(options || {}, defaultOptions);

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
  this.options = options;
  this.primitives = primitives;
  this.schemasUrl = schemasUrl;
  this.version = version;

  // Load the schema files
  this.schemas = {};

  fs.readdirSync('./schemas/' + version)
    .filter(function (name) {
      return name.match(/^(.*)\.json$/);
    })
    .forEach(function (name) {
      this.schemas[name] = require('./schemas/' + version + '/' + name);
    }.bind(this));

  // Create the validators
  this.validators = {};

  switch (version) {
  case '1.2':
    Object.keys(this.schemas).forEach(function (schemaName) {
      var validator = jjv(this.options.validator);
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

  // Should we return an error/warning when defaultValue is used without a type?

  if (!_.isUndefined(defaultValue) && !_.isUndefined(type)) {
    if (data.enum && _.isArray(data.enum) && data.enum.indexOf(defaultValue) === -1) {
      errors.push({
        code: 'ENUM_MISMATCH',
        message: 'Default value is not within enum values (' + data.enum.join(', ') + '): ' + defaultValue,
        data: defaultValue,
        path: path + '.defaultValue'
      });
    }

    // Should we return an error/warning when minimum and/or maximum is used with for a non-integer/non-number?

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
              path: path + '.defaultValue'
            });
          }

          if (!_.isUndefined(data.maximum)) {
            parsedMaximumValue = parseFloat(data.maximum);

            if (isNaN(parsedMaximumValue)) {
              errors.push({
                code: 'INVALID_TYPE',
                message: 'Invalid type (expected parseable number): ' + data.maximum,
                data: data.maximum,
                path: path + '.maximum'
              });
            } else if (_.isNumber(parsedValue) && _.isNumber(parsedMaximumValue) && parsedValue > parsedMaximumValue) {
              errors.push({
                code: 'MAXIMUM',
                message: 'Default value is greater than maximum (' + data.maximum + '): ' + defaultValue,
                data: defaultValue,
                path: path + '.defaultValue'
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
                path: path + '.minimum'
              });
            } else if (_.isNumber(parsedValue) && _.isNumber(parsedMinimumValue) && parsedValue < parsedMinimumValue) {
              errors.push({
                code: 'MINIMUM',
                message: 'Default value is less than minimum (' + data.minimum + '): ' + defaultValue,
                data: defaultValue,
                path: path + '.defaultValue'
              });
            }
          }
        }

        break;

      case 'boolean':
        if (['false', 'true'].indexOf(defaultValue) === -1) {
          errors.push({
            code: 'INVALID_TYPE',
            message: 'Invalid type (expected parseable boolean): ' + defaultValue,
            data: defaultValue,
            path: path + '.defaultValue'
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
  var addModelRef = function (modelId, modelRef) {
    if (Object.keys(modelRefs).indexOf(modelId) === -1) {
      modelRefs[modelId] = [];
    }

    modelRefs[modelId].push(modelRef);
  };
  var errors = [];
  var identifyModelInheritanceIssues = function (modelDeps) {
    var circular = {};
    var composed = {};
    var resolved = {};
    var unresolved = {};
    var addModelProps = function (parentModel, modelName) {
      var model = models[modelName];

      if (model && model.properties && _.isObject(model.properties)) {
        _.each(model.properties, function (prop, propName) {
          if (composed[propName]) {
            errors.push({
              code: 'CHILD_MODEL_REDECLARES_PROPERTY',
              message: 'Child model declares property already declared by ancestor: ' + propName,
              data: prop,
              path: '$.models[\'' + parentModel + '\'].properties[\'' + propName + '\']'
            });
          } else {
            composed[propName] = propName;
          }
        });
      }
    };
    var getPath = function (parent, unresolved) {
      var parentVisited = false;

      return Object.keys(unresolved).filter(function (dep) {
        if (dep === parent) {
          parentVisited = true;
        }
        return parentVisited && unresolved[dep];
      });
    };
    var resolver = function (id, deps, circular, resolved, unresolved) {
      var model = models[id];
      var modelDeps = deps[id];

      unresolved[id] = true;

      if (modelDeps) {
        if (modelDeps.length > 1) {
          errors.push({
            code: 'MULTIPLE_MODEL_INHERITANCE',
            message: 'Child model is sub type of multiple models: ' + modelDeps.join(' && '),
            data: model,
            path: '$.models[\'' + id + '\']'
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
                path: '$.models[\'' + id + '\'].subTypes'
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
    if (resource.apis && _.isArray(resource.apis)) {
      _.each(resource.apis, function (api, index) {
        var apiPath = '$.apis[' + index + ']';

        if (!api.operations || !_.isArray(api.operations)) {
          return;
        }

        _.each(api.operations, function (operation, index) {
          var operationPath = apiPath + '.operations[' + index + ']';

          // References in operation type
          if (operation.type) {
            if (operation.type === 'array' && _.isObject(operation.items) && operation.items.$ref) {
              addModelRef(operation.items.$ref, operationPath + '.items.$ref');
            } else if (primitives.indexOf(operation.type) === -1) {
              addModelRef(operation.type, operationPath + '.type');
            }
          }

          // References in operation parameters
          if (operation.parameters && _.isObject(operation.parameters)) {
            _.each(operation.parameters, function (parameter, index) {

              if (parameter.type && primitives.indexOf(parameter.type) === -1) {
                addModelRef(parameter.type, operationPath + '.parameters[' + index + '].type');
              } else if (parameter.type === 'array' && _.isObject(parameter.items) && parameter.items.$ref) {
                addModelRef(parameter.items.$ref, operationPath + '.parameters[' + index + '].items.$ref');
              }
            });
          }

          // References in response messages
          if (operation.responseMessages && _.isArray(operation.responseMessages)) {
            _.each(operation.responseMessages, function (message, index) {
              if (message.responseModel) {
                addModelRef(message.responseModel, operationPath + '.responseMessages[' + index + '].responseModel');
              }
            });
          }
        });
      });
    }

    // Find references defined in the models themselves (Validation happens elsewhere but we have to be smart)
    if (models && _.isObject(models)) {
      _.each(models, function (model, name) {
        var modelPath = '$.models[\'' + name + '\']'; // Always use bracket notation just to be safe
        var modelId = model.id;
        var seenSubTypes = [];

        // Keep track of model children and properties and duplicate models
        if (modelIds.indexOf(modelId) > -1) {
          errors.push({
            code: 'DUPLICATE_MODEL_DEFINITION',
            message: 'Model already defined: ' + modelId,
            data: modelId,
            path: '$.models[\'' + name + '\'].id'
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
                  path: '$.models[\'' + name + '\'].subTypes[' + index + ']'
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
        if (model.properties && _.isObject(model.properties)) {
          _.each(model.properties, function (property, name) {
            var propPath = modelPath + '.properties[\'' + name + '\']'; // Always use bracket notation just to be safe
            var result;

            if (property.$ref) {
              addModelRef(property.$ref, propPath + '.$ref');
            } else if (property.type === 'array' && _.isObject(property.items) && property.items.$ref) {
              addModelRef(property.items.$ref, propPath + '.items.$ref');
            } else {
              result = validateDefaultValue(property, propPath);

              if (result.errors && _.isArray(result.errors)) {
                errors = errors.concat(result.errors);
              }

              if (result.warnings && _.isArray(result.warnings)) {
                warnings = warnings.concat(result.warnings);
              }
            }
          });
        }

        // References in model subTypes
        if (model.subTypes && _.isArray(model.subTypes)) {
          _.each(model.subTypes, function (name, index) {
            addModelRef(name, modelPath + '.subTypes[' + index + ']');
          });
        }

        if (model.discriminator && _.isUndefined(model.subTypes)) {
          errors.push({
            code: 'INVALID_MODEL_DISCRIMINATOR',
            message: 'Model cannot have discriminator without subTypes: ' + model.discriminator,
            data: model.discriminator,
            path: '$.models[\'' + name + '\'].discriminator'
          });
        }

        if (model.required && _.isArray(model.required)) {
          var props = model.properties || {};

          _.each(model.required, function (propName, index) {
            if (_.isUndefined(props[propName])) {
              errors.push({
                code: 'MISSING_REQUIRED_MODEL_PROPERTY',
                message: 'Model requires property but it is not defined: ' + propName,
                data: propName,
                path: '$.models[\'' + name + '\'].required[' + index + ']'
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
      path: '$.models[\'' + unused + '\']'
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
    if (resource.apis && _.isArray(resource.apis)) {
      _.each(resource.apis, function (api, index) {
        var apiPath = '$.apis[' + index + ']';
        var seenMethods = [];
        var seenNicknames = [];

        if (!api.operations || !_.isArray(api.operations)) {
          return;
        }

        _.each(api.operations, function (operation, index) {
          var operationPath = apiPath + '.operations[' + index + ']';
          var seenResponseMessageCodes = [];
          var result;

          if (operation.parameters && _.isArray(operation.parameters)) {
            _.each(operation.parameters, function (parameter, index) {
              result = validateDefaultValue(parameter, operationPath + '.parameters[' + index + ']');

              if (result.errors && _.isArray(result.errors)) {
                errors = errors.concat(result.errors);
              }

              if (result.warnings && _.isArray(result.warnings)) {
                warnings = warnings.concat(result.warnings);
              }
            });
          }

          // Identify duplicate operation methods
          if (operation.method) {
            if (seenMethods.indexOf(operation.method) > -1) {
              errors.push({
                code: 'DUPLICATE_OPERATION_METHOD',
                message: 'Operation method already defined: ' + operation.method,
                data: operation.method,
                path: operationPath + '.method'
              });
            } else {
              seenMethods.push(operation.method);
            }
          }

          // Identify duplicate operation nicknames
          if (operation.nickname) {
            if (seenNicknames.indexOf(operation.nickname) > -1) {
              errors.push({
                code: 'DUPLICATE_OPERATION_NICKNAME',
                message: 'Operation method already defined: ' + operation.nickname,
                data: operation.nickname,
                path: operationPath + '.nickname'
              });
            } else {
              seenNicknames.push(operation.nickname);
            }
          }

          // Identify duplicate operation responseMessage codes
          if (operation.responseMessages && _.isArray(operation.responseMessages)) {
            _.each(operation.responseMessages, function (responseMessage, index) {
              if (responseMessage.code) {
                if (seenResponseMessageCodes.indexOf(responseMessage.code) > -1) {
                  errors.push({
                    code: 'DUPLICATE_OPERATION_RESPONSEMESSAGE_CODE',
                    message: 'Operation responseMessage code already defined: ' + responseMessage.code,
                    data: responseMessage.code,
                    path: operationPath + '.responseMessages[' + index + '].code'
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
              path: operationPath + '.summary'
            });
          }
        });
      });
    }
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
Specification.prototype.validate = function (data, schemaName) {
  if (_.isUndefined(data)) {
    throw new Error('data is required');
  } else if (!_.isObject(data)) {
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
    throw new Error('schemaName is not valid.  Valid schema names: ' + Object.keys(this.schemas).join(', '));
  }

  // Do structural (JSON Schema) validation
  validator = this.validators[schemaName];
  result = validator.validate(schema, data);

  if (result) {
    errors = validator.je(schema, data, result);
  }

  switch (schemaName) {
  case 'apiDeclaration.json':
    [validateModels, validateOperations].forEach(function (func) {
      result = func(this, data);

      if (result.errors && _.isArray(result.errors)) {
        errors = errors.concat(result.errors);
      }

      if (result.warnings && _.isArray(result.warnings)) {
        warnings = warnings.concat(result.warnings);
      }
    }.bind(this));

    break;
  }

  return errors.length === 0 && warnings.length === 0 ? undefined : {errors: errors, warnings: warnings};
};

var v1_2 = module.exports.v1_2 = new Specification('1.2'); // jshint ignore:line
