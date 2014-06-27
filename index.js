/*
 * Copyright 2014 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
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

var validateModels = function validateModels (spec, resource) {
  var modelIds = _.map(resource.models || {}, function (model) {
    return model.id;
  });
  var modelRefs = {};
  var primitives = _.union(spec.primitives, ['array', 'void', 'File']);
  var addModelRef = function (modelId, modelRef) {
    if (Object.keys(modelRefs).indexOf(modelId) === -1) {
      modelRefs[modelId] = [];
    }

    modelRefs[modelId].push(modelRef);
  };
  var errors = [];
  var warnings = [];

  switch (spec.version) {
  case '1.2':
    // Find references defined in the operations (Validation happens elsewhere but we have to be smart)
    if (resource.apis && _.isArray(resource.apis)) {
      _.each(resource.apis, function (api, index) {
        var apiPath = '$.apis[' + index + ']';

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
    if (resource.models && _.isObject(resource.models)) {
      _.each(resource.models, function (model, name) {
        var modelPath = '$.models[\'' + name + '\']'; // Always use bracket notation just to be safe

        // References in model properties
        if (model.properties && _.isObject(model.properties)) {
          _.each(model.properties, function (property, name) {
            var propPath = modelPath + '.properties[\'' + name + '\']'; // Always use bracket notation just to be safe

            if (property.$ref) {
              addModelRef(property.$ref, propPath + '.$ref');
            } else if (property.type === 'array' && _.isObject(property.items) && property.items.$ref) {
              addModelRef(property.items.$ref, propPath + '.items.$ref');
            }
          });
        }

        // References in model subTypes
        if (model.subTypes && _.isArray(model.subTypes)) {
          _.each(model.subTypes, function (name, index) {
            addModelRef(name, modelPath + '.subTypes[' + index + ']');
          });
        }
      });
    }

    break;
  default:
    throwUnsupportedVersion(spec.version);
  }

  // Handle missing models
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

  // Handle unused models
  _.difference(modelIds, Object.keys(modelRefs)).forEach(function (unused) {
    warnings.push({
      code: 'UNUSED_MODEL',
      message: 'Model is defined but is not used: ' + unused,
      data: unused,
      path: '$.models[\'' + unused + '\']'
    });
  });

  // TODO: Validate subTypes are not cyclical
  // TODO: Validate subTypes do not override parent properties
  // TODO: Validate subTypes do not include discriminiator
  // TODO: Validate discriminitor property exists
  // TODO: Validate required properties exist

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
 * @returns undefined if validation passes or an array of error objects
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
    result = validateModels(this, data);

    if (result.errors && _.isArray(result.errors)) {
      errors = errors.concat(result.errors);
    }

    if (result.warnings && _.isArray(result.warnings)) {
      warnings = warnings.concat(result.warnings);
    }

    break;
  }

  return errors.length === 0 && warnings.length === 0 ? undefined : {errors: errors, warnings: warnings};
};

var v1_2 = module.exports.v1_2 = new Specification('1.2'); // jshint ignore:line
